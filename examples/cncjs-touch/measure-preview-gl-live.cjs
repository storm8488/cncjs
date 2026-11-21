'use strict';
// PC measurement of the live 3D view (touch/preview-gl.js under the GPU gate), NOT a tablet
// measurement: Node, WebGL replaced by the stub of test-preview-gl.cjs (no GPU work, no compositing).
// The numbers are the JavaScript side only, to detect regressions between two versions of the code:
// time of the cnc-job-status handler, JS time per animation frame (snapping, interpolation, pass,
// draw calls), frames asked per report, the full geometry build (the worker's work, run here in
// the main thread) and the memory it keeps. Never quote them as a gain on the tablet (brief § 3).
// Usage: node --expose-gc measure-preview-gl-live.cjs [--seconds 60] [--rate 4] [--segments 200000] [--out file.json]
const fs = require('node:fs');
const { performance } = require('node:perf_hooks');
const T3 = require('./touch/toolpath-3d.js');
const PIN = require('./touch/preview-inspect.js');
const { scan } = require('./touch/library-preview.js');
const { createPage } = require('./test-preview-gl.cjs');

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback; };
const SECONDS = Math.max(5, Number(arg('--seconds', 60)) || 60), RATE = Math.max(1, Number(arg('--rate', 4)) || 4), BIG = Math.max(1000, Number(arg('--segments', 200000)) || 200000);
const OUT = arg('--out', '');
const gc = typeof global.gc === 'function' ? global.gc : () => {};
const heap = () => { gc(); const m = process.memoryUsage(); return (m.heapUsed + m.arrayBuffers) / 1048576; };
const stats = list => { if (!list.length) return { n: 0 }; const s = list.slice().sort((a, b) => a - b); return { n: s.length, median: s[Math.floor(s.length / 2)], p95: s[Math.floor(s.length * 0.95)], max: s[s.length - 1] }; };
const f3 = v => (typeof v === 'number' ? v.toFixed(3) : String(v));
const show = (label, s) => console.log(label + ' : n ' + s.n + ', médiane ' + f3(s.median) + ' ms, p95 ' + f3(s.p95) + ' ms, max ' + f3(s.max) + ' ms');

// A dense pocket (same generator as measure-preview-gl.cjs): about 25 000 lines, with arcs at the corners.
function pocket(passes) {
  const lines = ['G21 G90', 'G0 Z5', 'G0 X0 Y0'];
  for (let d = 1; d <= 3; d++) {
    lines.push('G1 Z-' + d + ' F200');
    for (let k = 0; k < passes; k++) {
      const a = k * 0.2, b = 120 - k * 0.2, c = 80 - k * 0.2;
      for (let s = 0; s < 25; s++) lines.push('G1 X' + (a + (b - a) * s / 25).toFixed(3) + ' Y' + a.toFixed(3) + ' F1500');
      lines.push('G1 X' + b.toFixed(3) + ' Y' + c.toFixed(3), 'G1 X' + a.toFixed(3) + ' Y' + c.toFixed(3), 'G2 X' + a.toFixed(3) + ' Y' + (c - 0.2).toFixed(3) + ' I0 J-0.1', 'G1 X' + a.toFixed(3) + ' Y' + (a + 0.2).toFixed(3));
    }
    lines.push('G0 Z5', 'G0 X0 Y0');
  }
  lines.push('M30');
  return lines.join('\n');
}

(async () => {
  // The stored preview of a program, as the sidecar carries it (path3d, decimated to 30 000 points at most).
  async function previewOf(text) {
    const first = await scan(text), z = first.zBounds, b = first.bounds;
    const builder = T3.createBuilder({ bounds: [b[0], b[1], z[0], b[2], b[3], z[1]] });
    await scan(text, null, null, null, null, builder.move);
    return { file: 'mesure.nc', fingerprint: 'sha256:00', path3d: builder.finish(first.lines), zBounds: z };
  }
  const code = pocket(300), meta = await previewOf(code), path = T3.decode(meta.path3d);

  // Full geometry: build time (the worker's work) and kept size, for this program and a large one.
  let t = performance.now(); const full = PIN.buildGeometry(code); const fullMs = performance.now() - t;
  const bigCode = pocket(Math.ceil(BIG / 90 / 3)), bigMeta = await previewOf(bigCode);
  t = performance.now(); const big = PIN.buildGeometry(bigCode); const bigMs = performance.now() - t;
  const kept = g => g.tooLong ? 0 : (g.positions.byteLength + g.lines.byteLength + g.rapid.byteLength) / 1048576;

  // The replay: a job of SECONDS seconds, a report every 1000/RATE ms, frames at 60 Hz; the tool runs
  // along the path at constant speed; Grbl acknowledges about 15 moves ahead of it.
  async function replay(meta, geometry) {
    const totalLines = meta.path3d.lines;
    let now = 0; const timers = [];
    const page = createPage({ gpu: true, dpr: 2, width: 960, height: 540, toolPosition: true, clock: () => now, setTimeout: (fn, ms) => { timers.push(fn); return timers.length; }, clearTimeout() {} });
    if (geometry) page.win.CNCPreviewInspect.geometry = () => ({ promise: Promise.resolve({ tooLong: false, segments: geometry.segments, path: Object.assign({ full: true }, geometry) }), cancel() {} });
    const h0 = heap();
    t = performance.now();
    const view = page.win.CNCPreviewGL.open(meta, { container: page.doc.createElement('div'), live: { progress: true, tool: true }, fullGeometry: !!geometry });
    page.runFrames(0); await new Promise(r => setTimeout(r, 5)); page.runFrames(1);
    const openMs = performance.now() - t, h1 = heap();
    const P = (geometry || path), n = P.count, interval = 1000 / RATE, reports = SECONDS * RATE;
    const handler = [], frame = [], perReport = [];
    for (let r = 0; r < reports; r++) {
      const i = Math.min(n - 1, 1 + Math.floor((n - 2) * r / reports)), line = P.lines[i];
      const p = [P.positions[i * 3], P.positions[i * 3 + 1], P.positions[i * 3 + 2]];
      const received = Math.min(1000, Math.ceil(Math.min(totalLines, line + 15) / totalLines * 1000));
      const m = { fresh: true, name: 'mesure.nc', total: 1000, received, workflow: 'running', activeState: 'Run', statusAgeMs: 30,
        operator: { reportUnits: 'mm', wcs: 'G54' }, coordinates: { wpos: { x: p[0], y: p[1], z: p[2] }, mpos: { x: p[0] - 300, y: p[1] - 200, z: p[2] - 50 } } };
      now = r * interval;
      let s = performance.now(); page.win.dispatch('cnc-job-status', { machine: m, simulation: false }); handler.push(performance.now() - s);
      let frames = 0;
      for (let f = now + 16; f < now + interval; f += 16.7) {
        if (!page.frames.length) break;
        now = f; s = performance.now(); page.runFrames(f); frame.push(performance.now() - s); frames++;
      }
      perReport.push(frames);
    }
    const st = view.state(), s1 = view.stats();
    view.close('measure');
    return { geometry: st.geometry, segments: st.segments, openMs, heapOpenMb: h1 - h0, handler: stats(handler), frame: stats(frame), framesPerReport: stats(perReport), uploads: s1.uploads, uploadMb: s1.uploadBytes / 1048576 };
  }
  const simplified = await replay(meta, null);
  const fullRun = full.tooLong ? null : await replay(meta, { count: full.count, positions: full.positions, lines: full.lines, rapid: full.rapid, segments: full.segments, bounds: [0, 0, -3, 120, 80, 5] });
  const bigRun = big.tooLong ? null : await replay(bigMeta, { count: big.count, positions: big.positions, lines: big.lines, rapid: big.rapid, segments: big.segments, bounds: [0, 0, -3, 120, 80, 5] });

  const result = { conditions: 'PC, Node ' + process.version + ' ' + process.platform + '/' + process.arch + ', WebGL stub (no GPU work), ' + (typeof global.gc === 'function' ? 'gc forced' : 'no --expose-gc (memory approximate)'),
    replay: { seconds: SECONDS, reportsPerSecond: RATE, framesHz: 60 }, program: { lines: code.split('\n').length, path3dPoints: path.count, fullSegments: full.segments, bigSegments: big.segments, bigTooLong: big.tooLong },
    fullBuildMs: fullMs, bigBuildMs: bigMs, fullKeptMb: kept(full), bigKeptMb: kept(big), simplified, full: fullRun, big: bigRun };
  console.log('Conditions : ' + result.conditions + ' — détection de régressions seulement, pas un chiffre de la tablette.');
  console.log('Programme : ' + result.program.lines + ' lignes ; path3d ' + path.count + ' points ; géométrie complète ' + full.segments + ' segments (' + f3(fullMs) + ' ms, ' + f3(kept(full)) + ' Mo gardés) ; grand programme ' + big.segments + ' segments' + (big.tooLong ? ' (au-delà du plafond)' : ' (' + f3(bigMs) + ' ms, ' + f3(kept(big)) + ' Mo gardés)'));
  for (const [label, run] of [['simplifiée', simplified], ['complète', fullRun], ['grande', bigRun]]) {
    if (!run) continue;
    console.log('— Géométrie ' + label + ' (' + run.geometry + ', ' + run.segments + ' segments) : ouverture ' + f3(run.openMs) + ' ms, +' + f3(run.heapOpenMb) + ' Mo, ' + run.uploads + ' envois GPU (' + f3(run.uploadMb) + ' Mo)');
    show('  gestionnaire cnc-job-status', run.handler); show('  JS par image', run.frame);
    console.log('  images par rapport : médiane ' + run.framesPerReport.median + ', max ' + run.framesPerReport.max + ' (un intervalle de ' + Math.round(1000 / RATE) + ' ms à 60 Hz au plus)');
  }
  if (OUT) { fs.writeFileSync(OUT, JSON.stringify(result, null, 2)); console.log('Écrit : ' + OUT); }
})().catch(e => { console.error(e); process.exit(1); });
