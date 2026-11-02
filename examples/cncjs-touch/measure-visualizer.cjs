#!/usr/bin/env node
'use strict';
// Classic visualizer (src/app/widgets/Visualizer) on large programs, measured
// in Node on a development PC (the same V8 as Chrome, not the tablet and not
// the webpack bundle): the former geometry build (THREE.Geometry of Vector3
// and Color objects, exactly the code GCodeVisualizer.render used) against the
// typed-array build (toolpath-buffers.js), on synthetic programs of 1, 5 and
// 20 MB with arcs: time, heap, vertex count, frames, and the bounding box of
// both (must agree to 1e-6). Run with --expose-gc for heap figures.
//
//   node --expose-gc examples/cncjs-touch/measure-visualizer.cjs --out output/perf/visualizer.json
//   options: --sizes 1,5,20 (MB)  --repeat 3  --no-lines  --out FILE
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback; };
const SIZES = option('--sizes', '1,5,20').split(',').map(Number);
const REPEAT = Math.max(1, Number(option('--repeat', 3)) || 3);
const OUT = option('--out', '');
// --no-lines: the typed-array build keeps no per-line object (GCodeVisualizer only ever reads
// the vertex index of a frame; the former frames also held each parsed line, most of the memory).
const KEEP_LINES = !args.includes('--no-lines');
const log = (m) => console.log(new Date().toISOString().slice(11, 19) + ' ' + m);
const r1 = (v) => (typeof v === 'number' && isFinite(v) ? Math.round(v * 10) / 10 : v);
const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

require('@babel/register')({ only: [(f) => /src[\\/]app[\\/]widgets[\\/]Visualizer/.test(f)], presets: [['@babel/preset-env', { targets: { node: 'current' } }]], configFile: false, babelrc: false, cache: false });
const { buildToolpathBuffers } = require(path.join(ROOT, 'src/app/widgets/Visualizer/toolpath-buffers.js')); // eslint-disable-line global-require
const THREE = require('three');
const Toolpath = require('gcode-toolpath');

// A program of about `mb` megabytes: a raster of lines with arcs every tenth
// move, three planes used in turn, known extent 0..200 × 0..150 × −3..5.
function program(mb) {
  const target = mb * 1048576, out = ['G21 G90 G17 G94', 'G0 Z5', 'G0 X0 Y0', 'M3 S12000', 'G1 Z-1 F300'];
  let size = out.join('\n').length, i = 0, x = 0, y = 0, dir = 1;
  while (size < target) {
    x += dir * 0.731; if (x > 200 || x < 0) { dir = -dir; x = Math.max(0, Math.min(200, x)); y = (y + 0.5) % 150; }
    let line;
    if (i % 10 === 9) {
      const j = (i / 10) % 3; const plane = j === 0 ? 'G17' : j === 1 ? 'G18' : 'G19';
      line = plane + '\n' + (i % 20 === 9 ? 'G2' : 'G3') + ' X' + (x + 1).toFixed(3) + ' Y' + y.toFixed(3) + ' I0.5 J0 F800\nG17';
      x += 1;
    } else if (i % 97 === 0) {
      line = 'G1 Z' + (-3 + (i % 5) * 0.5).toFixed(3) + ' F300';
    } else {
      line = 'G1 X' + x.toFixed(3) + ' Y' + y.toFixed(3) + (i % 7 === 0 ? ' F' + (400 + i % 900) : '');
    }
    out.push(line); size += line.length + 1; i++;
  }
  out.push('G0 Z5', 'M5', 'M30');
  return out.join('\n') + '\n';
}

// GCodeVisualizer.render before this change: the same handlers over THREE.Geometry.
const defaultColor = new THREE.Color('lightgrey');
const motionColor = { G0: new THREE.Color('green'), G1: new THREE.Color('blue'), G2: new THREE.Color('deepskyblue'), G3: new THREE.Color('deepskyblue') };
function legacy(gcode) {
  const geometry = new THREE.Geometry(), frames = [];
  const toolpath = new Toolpath({
    addLine: (modal, v1, v2) => { geometry.vertices.push(new THREE.Vector3(v2.x, v2.y, v2.z)); geometry.colors.push(motionColor[modal.motion] || defaultColor); },
    addArcCurve: (modal, v1, v2, v0) => {
      const { motion, plane } = modal, isClockwise = (motion === 'G2');
      const radius = Math.sqrt(((v1.x - v0.x) ** 2) + ((v1.y - v0.y) ** 2));
      const startAngle = Math.atan2(v1.y - v0.y, v1.x - v0.x); let endAngle = Math.atan2(v2.y - v0.y, v2.x - v0.x);
      if (startAngle === endAngle) endAngle += (2 * Math.PI);
      const points = new THREE.ArcCurve(v0.x, v0.y, radius, startAngle, endAngle, isClockwise).getPoints(30), color = motionColor[motion] || defaultColor;
      for (let i = 0; i < points.length; ++i) {
        // Same Z as toolpath-trace.js (the last vertex reaches the end of the helix).
        const point = points[i], z = i === points.length - 1 ? v2.z : v1.z + (v2.z - v1.z) * (i / (points.length - 1));
        if (plane === 'G17') geometry.vertices.push(new THREE.Vector3(point.x, point.y, z));
        else if (plane === 'G18') geometry.vertices.push(new THREE.Vector3(point.y, z, point.x));
        else if (plane === 'G19') geometry.vertices.push(new THREE.Vector3(z, point.x, point.y));
        geometry.colors.push(color);
      }
    }
  });
  toolpath.loadFromStringSync(gcode, (line) => { frames.push({ data: line, vertexIndex: geometry.vertices.length }); });
  // What render() did next: a Line whose geometry copies the arrays.
  const workpiece = new THREE.Line(new THREE.Geometry(), new THREE.LineBasicMaterial({ color: defaultColor, vertexColors: THREE.VertexColors, opacity: 0.5, transparent: true }));
  workpiece.geometry.vertices = geometry.vertices.slice(); workpiece.geometry.colors = geometry.colors.slice();
  geometry.computeBoundingBox();
  return { count: geometry.vertices.length, frames: frames.length, bounds: { min: geometry.boundingBox.min.toArray(), max: geometry.boundingBox.max.toArray() }, hold: [geometry, workpiece] };
}
function modern(gcode) {
  const b = buildToolpathBuffers(gcode, { keepLines: KEEP_LINES });
  // What the new render() does next: a BufferGeometry over the arrays (no copy).
  const geometry = new THREE.BufferGeometry();
  geometry.addAttribute('position', new THREE.BufferAttribute(b.positions, 3));
  geometry.addAttribute('color', new THREE.BufferAttribute(b.colors, 3));
  const workpiece = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: defaultColor, vertexColors: THREE.VertexColors, opacity: 0.5, transparent: true }));
  return { count: b.count, frames: b.frames.length, bounds: b.bounds, hold: [b, workpiece] };
}

// JS heap plus ArrayBuffers (typed arrays live outside the V8 heap).
// V8 frees ArrayBuffer backing stores a moment after the collection: collect, wait, collect again.
async function heap() { if (global.gc) { global.gc(); await new Promise((r) => setTimeout(r, 60)); global.gc(); } const m = process.memoryUsage(); return m.heapUsed + (m.arrayBuffers || 0); }
async function run(fn, gcode) {
  const before = await heap(), t0 = process.hrtime.bigint();
  const value = fn(gcode);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const after = await heap();
  const result = { ms: r1(ms), heapMb: r1((after - before) / 1048576), count: value.count, frames: value.frames, bounds: value.bounds };
  value.hold = null;
  return result;
}

const results = { date: new Date().toISOString(), node: process.version, platform: os.platform() + ' ' + os.release() + ' ' + os.cpus()[0].model, gc: !!global.gc, three: require('three/package.json').version, sizes: [] };
(async () => {
for (const mb of SIZES) {
  const gcode = program(mb);
  const bytes = Buffer.byteLength(gcode), lines = gcode.split('\n').length - 1;
  const legacyRuns = [], modernRuns = [];
  for (let i = 0; i < REPEAT; i++) { legacyRuns.push(await run(legacy, gcode)); modernRuns.push(await run(modern, gcode)); }
  const a = legacyRuns[0], b = modernRuns[0];
  const diff = Math.max(...[0, 1, 2].map((k) => Math.max(Math.abs(a.bounds.min[k] - b.bounds.min[k]), Math.abs(a.bounds.max[k] - b.bounds.max[k]))));
  const entry = { mb, bytes, lines, legacy: { ms: r1(median(legacyRuns.map((x) => x.ms))), heapMb: r1(median(legacyRuns.map((x) => x.heapMb))), count: a.count, frames: a.frames, bounds: a.bounds }, modern: { ms: r1(median(modernRuns.map((x) => x.ms))), heapMb: r1(median(modernRuns.map((x) => x.heapMb))), count: b.count, frames: b.frames, bounds: b.bounds }, boundsMaxDiff: diff, sameCount: a.count === b.count && a.frames === b.frames };
  results.sizes.push(entry);
  log(mb + ' MB (' + lines + ' lines): legacy ' + entry.legacy.ms + ' ms, +' + entry.legacy.heapMb + ' MB heap, ' + a.count + ' vertices; typed arrays ' + entry.modern.ms + ' ms, +' + entry.modern.heapMb + ' MB; bounds max diff ' + diff + ', same count ' + entry.sameCount);
  if (!entry.sameCount || diff > 1e-6) { console.error('MISMATCH'); process.exitCode = 1; }
}
const L = ['# Classic visualizer geometry build' + (KEEP_LINES ? '' : ' (typed arrays without per-line objects)') + ' (Node ' + process.version + ' on the PC, three ' + results.three + ', ' + REPEAT + ' runs, medians; not the browser bundle, not the tablet)', '', '| Program | Lines | Vertices | THREE.Geometry: ms / heap | Typed arrays: ms / heap | Bounds max diff |', '| --- | ---: | ---: | ---: | ---: | ---: |'];
results.sizes.forEach((s) => L.push('| ' + s.mb + ' MB | ' + s.lines + ' | ' + s.legacy.count + ' | ' + s.legacy.ms + ' ms / +' + s.legacy.heapMb + ' MB | ' + s.modern.ms + ' ms / +' + s.modern.heapMb + ' MB | ' + s.boundsMaxDiff + ' |'));
results.markdown = L.join('\n');
console.log('\n' + results.markdown + '\n');
if (OUT) { fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(results, null, 1)); log('written ' + OUT); }
})().catch((e) => { console.error(e); process.exit(1); });
