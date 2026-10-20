'use strict';
// Depth in previews: Z tracking in the scanner, the simplified 3D path stored with
// the preview (codec, bounds, simplification), the fixed projections and the renderer.
const assert = require('node:assert/strict');
const T3 = require('./touch/toolpath-3d.js');
global.self = { CNCToolpath3D: T3 };
const { scan } = require('./touch/library-preview.js');

function moves(code) {
  const segments = [], all = [];
  return scan(code, (...v) => segments.push(v), null, null, null, (...v) => all.push(v)).then(result => ({ result, segments, all }));
}
function pathOf(code, options) {
  return scan(code).then(first => {
    const z = first.zBounds || [0, 0], b = first.bounds;
    const builder = T3.createBuilder(Object.assign({ bounds: [b[0], b[1], z[0], b[2], b[3], z[1]] }, options));
    return scan(code, null, null, null, null, builder.move).then(() => ({ first, path: builder.finish(first.lines) }));
  });
}
function fakeContext() {
  const calls = { stroke: 0, text: [], colours: new Set(), fills: 0 };
  return { calls, ctx: {
    fillRect() { calls.fills++; }, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, arc() {}, setLineDash() {},
    stroke() { calls.stroke++; calls.colours.add(this.strokeStyle); }, fillText(text) { calls.text.push(String(text)); }
  } };
}

(async () => {
  // Absolute and relative Z, rapids at a safe height, then the deepest pass.
  let r = await moves('G21 G90\nG0 Z5\nG0 X10 Y10\nG1 Z-1 F100\nG1 X20\nG91 G1 Z-1\nG90 G1 X30 Z-2.5\nG0 Z5\nM2');
  assert.deepEqual(r.result.zBounds, [-2.5, 5]);
  assert.equal(r.result.relativeZ, false);
  assert.equal(r.result.count, 3, 'XY segments only: plunges are not drawn in 2D');
  assert.equal(r.all.length, 7, 'every move, plunges included, reaches the 3D path');
  assert.deepEqual(r.all.map(m => m[5]), [5, 5, -1, -1, -2, -2.5, 5], 'Z after each move (G91 Z-1 adds to -1)');
  assert.deepEqual(r.all.map(m => m[7]), [2, 3, 4, 5, 6, 7, 8], 'each move carries its sent line');
  assert.deepEqual(r.segments.map(s => [s[5], s[6]]), [[5, 5], [-1, -1], [-2, -2.5]], 'XY segments carry their start and end Z');
  assert.equal(r.result.trailZ.length * 3, r.result.trail.length, 'one Z per trail sample');
  assert.equal(r.result.trailZ.at(-1), 5);
  // Inches.
  r = await moves('G20 G90\nG1 Z-0.1 F10\nG1 X1\nG0 Z0.5');
  assert.deepEqual(r.result.zBounds.map(v => Math.round(v * 1000) / 1000), [-2.54, 12.7]);
  // A relative Z before any absolute Z: depths relative to the start.
  assert.equal((await scan('G21 G91\nG1 Z-2 F100\nG1 X10\nM2')).relativeZ, true);
  assert.equal((await scan('G21 G90\nG1 Z-2 F100\nG91 G1 Z-1\nG1 X10\nM2')).relativeZ, false);
  // No motion at all: no depth.
  assert.equal((await scan('G21 G90\nM3 S1000\nM5')).zBounds, null);
  // Flat program: depth 0 everywhere, nothing below Z0.
  assert.deepEqual((await scan('G21 G90\nG1 X10 Y5 F100')).zBounds, [0, 0]);
  // Helical arc: Z linear with the angle, exact at the end, half-way at half the turn.
  r = await moves('G21 G90\nG0 X10 Y0 Z0\nG2 X10 Y0 Z-2 I-10 J0 F100');
  const helix = r.segments.filter(s => s[4] === 2);
  assert(helix.length >= 72);
  assert.equal(helix.at(-1)[6], -2); assert.equal(helix[0][5], 0);
  for (let i = 1; i < helix.length; i++) assert(helix[i][6] < helix[i - 1][6] && helix[i][5] === helix[i - 1][6], 'continuous descending helix');
  const half = helix[Math.floor(helix.length / 2) - 1];
  assert(Math.abs(half[6] + 1) < 0.05 && half[2] < -9.9, 'half a turn: X -10, Z -1');
  assert.deepEqual(r.result.zBounds, [-2, 0]);
  // Arcs keep their 2D bounds whatever Z does.
  assert.deepEqual((await scan('G21 G90\nG0 X10 Y0\nG3 X0 Y10 Z-3 I-10 J0')).bounds.map(v => Math.round(v * 1e6) / 1e6), [0, 0, 10, 10]);
  await assert.rejects(scan('G21 G90\nG1 Z10000000000 F100'), /hors plage/);
  await assert.rejects(scan('G1 X1 Z1 Z2'), /axe répété/);

  // The stored 3D path: exact points at 0.001 mm, move types, sent lines.
  let { first, path } = await pathOf('G21 G90\nG0 Z5\nG0 X10 Y10\nG1 Z-1 F100\nG1 X20.0004\nG1 Y20\nG0 Z5\nM2');
  assert.equal(path.version, 1); assert.equal(path.format, 'delta-varint-base64'); assert.equal(path.units, 'mm');
  assert.equal(path.count, 7); assert.equal(path.moves, 6); assert.equal(path.lines, first.lines);
  assert.deepEqual(path.bounds, [0, 0, -1, 20.0004, 20, 5], 'the rapid from the origin counts in XY');
  let d = T3.decode(path);
  assert.deepEqual(Array.from(d.positions), [0, 0, 0, 0, 0, 5, 10, 10, 5, 10, 10, -1, 20, 10, -1, 20, 20, -1, 20, 20, 5]);
  assert.deepEqual(Array.from(d.rapid), [1, 1, 1, 0, 0, 0, 1]);
  assert.deepEqual(Array.from(d.lines), [0, 2, 3, 4, 5, 6, 7]);
  // Dense arcs shrink, endpoints and move-type boundaries stay.
  // Small holes (0.3 mm radius, 72 steps) on a 200 mm part: far below a pixel.
  const pocket = ['G21 G90', 'G0 Z5', 'G0 X200 Y100', 'G0 X0 Y0'];
  for (let pass = 1; pass <= 3; pass++) pocket.push('G1 Z-' + pass + ' F200', 'G2 X0 Y0 I0.3 J0', 'G0 Z5');
  pocket.push('M2');
  ({ first, path } = await pathOf(pocket.join('\n')));
  d = T3.decode(path);
  const fullMoves = (await moves(pocket.join('\n'))).all.length;
  assert(path.count < fullMoves / 2, 'simplified: ' + path.count + ' of ' + fullMoves);
  assert.equal(path.moves, fullMoves);
  assert(path.tolerance > 0 && path.tolerance < 0.1, 'about a quarter pixel: ' + path.tolerance);
  let changes = 0; for (let i = 2; i < d.count; i++) if (d.rapid[i] !== d.rapid[i - 1]) changes++;
  assert.equal(changes, 6, 'every rapid/work boundary kept');
  assert.equal(d.positions[d.count * 3 - 1], 5); assert(d.bounds[2] === -3);
  for (let i = 1; i < d.count; i++) assert(d.lines[i] >= d.lines[i - 1], 'monotonic lines');
  // Bounded: a 200 000-move zigzag stays within the limit, its ends exact.
  const big = ['G21 G90', 'G1 F1000'];
  for (let i = 0; i < 100000; i++) big.push('X' + (i % 2 ? 100 : 0) + ' Y' + (i * 0.01).toFixed(2) + ' Z-' + (i % 7 ? 1 : 2), 'G0 Z1', 'G1');
  big.pop();
  ({ first, path } = await pathOf(big.join('\n')));
  assert(path.count <= T3.MAX_POINTS && path.count > 1000, 'bounded: ' + path.count);
  assert.equal(path.simplified, true); assert.equal(path.decimated, true, 'a raster finer than the image is decimated, not collapsed');
  d = T3.decode(path);
  assert(d.bounds[4] > 990 && d.bounds[2] === -2, 'the decimated raster still spans the part: ' + d.bounds);
  assert.deepEqual(Array.from(d.positions.slice(0, 3)), [0, 0, 0]);
  assert.equal(d.positions[d.count * 3 - 2], 999.99); assert(path.data.length < 1.5 * 1048576, 'compact: ' + path.data.length + ' characters');
  // A small limit forces the type boundaries to merge, and still terminates.
  ({ path } = await pathOf(big.slice(0, 3000).join('\n'), { maxPoints: 50 }));
  assert(path.count <= 50 && path.count >= 2, 'tiny limit: ' + path.count);
  // Malformed paths are refused, never half-drawn.
  const good = (await pathOf('G21 G90\nG1 X1 Y2 Z-3 F100')).path;
  for (const bad of [null, {}, { ...good, version: 2 }, { ...good, count: good.count + 1 }, { ...good, count: 0 }, { ...good, data: good.data.slice(0, -4) },
    { ...good, data: good.data + 'AAAA' }, { ...good, data: '@@@@' }, { ...good, data: 'abc' }, { ...good, format: 'json' }]) assert.throws(() => T3.decode(bad), /parcours 3D/);
  assert.equal(T3.decode(good).count, 2);

  // Depth colours: cyan at or above Z0, then the depth scale down to the deepest Z.
  assert.equal(T3.depthColor(0, -3), T3.colours.work); assert.equal(T3.depthColor(2, -3), T3.colours.work);
  assert.equal(T3.depthColor(-1, 0), T3.colours.work, 'nothing below Z0: no depth colours');
  assert.equal(T3.depthColor(-0.01, -3), T3.colours.depth[0]); assert.equal(T3.depthColor(-3, -3), T3.colours.depth.at(-1));
  assert.notEqual(T3.depthColor(-1.4, -3), T3.depthColor(-2.9, -3));
  // Z exaggeration of flat jobs.
  assert.equal(T3.zScale([0, 0, -1, 100, 50, 0]), 20); assert.equal(T3.zScale([0, 0, -20, 100, 50, 5]), 1);
  assert.equal(T3.zScale([0, 0, 0, 100, 50, 0]), 1); assert.equal(T3.zScale([0, 0, -0.001, 1000, 50, 0]), 50);

  // Projections: the whole box and the Z0 plane inside the image, Z up, X right.
  const box = [0, 0, -6, 120, 80, 5];
  for (const view of T3.VIEWS) {
    const p = T3.projection(view, box);
    assert.equal(p.version, 2); assert.equal(p.width, 960); assert.equal(p.height, 540); assert.equal(p.wcs, 'G54'); assert.equal(p.matrix.length, 8);
    for (let i = 0; i < 8; i++) {
      const q = T3.apply(p.matrix, i & 1 ? 120 : 0, i & 2 ? 80 : 0, i & 4 ? 5 : -6);
      assert(q[0] >= 47.9 && q[0] <= 912.1 && q[1] >= 79.9 && q[1] <= 452.1, view + ' corner ' + i + ' ' + q);
    }
    const o = T3.apply(p.matrix, 0, 0, 0), x = view === 'side' ? T3.apply(p.matrix, 0, 10, 0) : T3.apply(p.matrix, 10, 0, 0);
    assert(x[0] > o[0], view + (view === 'side' ? ': +Y goes right' : ': +X goes right'));
    if (view !== 'top') assert(T3.apply(p.matrix, 0, 0, 1)[1] < o[1], view + ': +Z goes up');
  }
  assert.equal(T3.projection('top', box).matrix[2], 0, 'top view ignores Z');
  assert.equal(T3.projection('front', box).matrix[1], 0, 'front view ignores Y');
  assert.equal(T3.projection('side', box).matrix[0], 0, 'side view ignores X');
  const iso = T3.projection('iso', box);
  assert(T3.apply(iso.matrix, 0, 10, 0)[1] < T3.apply(iso.matrix, 0, 0, 0)[1], 'iso: +Y goes back (up the image)');
  assert.equal(T3.projection('iso', box).zScale, 2, '11 mm deep on 120 mm: Z twice'); assert.equal(T3.projection('iso', [0, 0, -1, 100, 50, 0]).zScale, 20);
  assert.throws(() => T3.projection('perspective', box), /vue inconnue/);
  // Degenerate extents (a single point, a vertical drill) still fit.
  for (const b of [[5, 5, 0, 5, 5, 0], [5, 5, -10, 5, 5, 2]]) for (const view of T3.VIEWS) assert(T3.projection(view, b).matrix.every(Number.isFinite), view + ' ' + b);

  // Renderer: complete image in slices, depth colours, legend, triad, scale and title.
  const passes = ['G21 G90', 'G0 Z5', 'G0 X200 Y100', 'G0 X0 Y0'];
  for (let pass = 1; pass <= 30; pass++) passes.push('G1 Z-' + (pass / 10).toFixed(1) + ' F200', 'G2 X0 Y0 I0.6 J0', 'G0 Z5');
  ({ path } = await pathOf(passes.join('\n')));
  d = T3.decode(path);
  assert(d.count > 1000, 'large enough to be drawn in slices: ' + d.count);
  for (const view of T3.VIEWS) {
    const { ctx, calls } = fakeContext();
    const renderer = T3.createRenderer(ctx, d, view, { title: 'Titre ' + view, locale: 'fr-FR' });
    assert.deepEqual(renderer.projection, T3.projection(view, d.bounds, view === 'top' ? 1 : T3.zScale(d.bounds)));
    let slices = 0, budget = 0;
    while (!renderer.step(() => ++budget % 2 === 0)) assert(++slices < 10000);
    assert(slices > 2, 'drawn in several slices');
    assert(calls.colours.has(T3.colours.rapid) && calls.colours.has(T3.colours.depth.at(-1)), view + ' colours');
    assert(calls.text.includes('Titre ' + view) && calls.text.includes('Z0') && calls.text.some(t => /^Z min -3,00 · Z max 5,00 mm$/.test(t.replace('−', '-'))), view + ' texts: ' + calls.text);
    assert(['X', 'Y', 'Z'].every(a => calls.text.includes(a)), 'triad');
    assert(calls.text.some(t => / mm( · Z ×\d+)?$/.test(t) && /^\d/.test(t)), 'scale bar');
  }
  // A flat program has no depth legend.
  const flat = T3.decode((await pathOf('G21 G90\nG1 X10 Y5 F100\nG0 X0 Y0')).path), plain = fakeContext();
  T3.createRenderer(plain.ctx, flat, 'iso', {}).step(() => false);
  assert(!plain.calls.text.some(t => /Z min/.test(t)) && plain.calls.colours.has(T3.colours.work));
  console.log('PASS depth: Z tracking (G90/G91, G20, helices, plunges, lines), bounded and exact 3D path codec, malformed paths refused, depth colours, projections and sliced rendering.');
})().catch(e => { console.error(e); process.exitCode = 1; });
