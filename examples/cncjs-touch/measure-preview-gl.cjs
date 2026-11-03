'use strict';
// PC measurement of the visualisation additions, NOT a tablet measurement: Node, WebGL replaced by a
// stub (no GPU work, no compositing), so the numbers are the JavaScript side only (decode, vertex
// building, camera, picking, filters) and an upper bound of nothing on the GPU side.
// Usage: node --expose-gc measure-preview-gl.cjs [--points 30000]
const { performance } = require('node:perf_hooks');
const T3 = require('./touch/toolpath-3d.js');
const { scan } = require('./touch/library-preview.js');
const ME = require('./touch/motion-estimate.js');
const LV = require('./touch/laser-view.js');
const { createPage } = require('./test-preview-gl.cjs');
const gc = typeof global.gc === 'function' ? global.gc : () => {};
// JS heap plus ArrayBuffers (the typed arrays of the path, vertices and projections).
const heap = () => { gc(); const m = process.memoryUsage(); return (m.heapUsed + m.arrayBuffers) / 1048576; };
const stats = list => { const s = list.slice().sort((a, b) => a - b); return { median: s[Math.floor(s.length / 2)], p95: s[Math.floor(s.length * 0.95)], max: s[s.length - 1] }; };
const f2 = v => v.toFixed(2);

(async () => {
  // A dense pocket: 300 rectangular passes at three depths (about 25 000 lines).
  const lines = ['G21 G90', 'G0 Z5', 'G0 X0 Y0'];
  for (let d = 1; d <= 3; d++) {
    lines.push('G1 Z-' + d + ' F200');
    for (let k = 0; k < 300; k++) {
      const a = k * 0.2, b = 120 - k * 0.2, c = 80 - k * 0.2;
      for (let s = 0; s < 25; s++) lines.push('G1 X' + (a + (b - a) * s / 25).toFixed(3) + ' Y' + a.toFixed(3) + ' F1500');
      lines.push('G1 X' + b.toFixed(3) + ' Y' + c.toFixed(3), 'G1 X' + a.toFixed(3) + ' Y' + c.toFixed(3), 'G1 X' + a.toFixed(3) + ' Y' + (a + 0.2).toFixed(3));
    }
    lines.push('G0 Z5', 'G0 X0 Y0');
  }
  lines.push('M30');
  const code = lines.join('\n');
  let t = performance.now();
  const first = await scan(code), z = first.zBounds, b = first.bounds;
  const builder = T3.createBuilder({ bounds: [b[0], b[1], z[0], b[2], b[3], z[1]] });
  await scan(code, null, null, null, null, builder.move);
  const path3d = builder.finish(first.lines);
  const scanMs = performance.now() - t;
  t = performance.now(); const estimate = ME.estimate(code); const estimateMs = performance.now() - t;
  const meta = { file: 'mesure.nc', fingerprint: 'sha256:00', path3d, zBounds: z, estimate };

  const page = createPage({ dpr: 2, width: 1280, height: 720 });
  const h0 = heap();
  t = performance.now();
  const view = page.win.CNCPreviewGL.open(meta, { source: { stateAt: () => Promise.resolve(null), release() {} } });
  page.runFrames(0);
  const openMs = performance.now() - t, h1 = heap();
  const gl = view.canvas.glStub.log;

  // Simulated gestures: 300 moves of one finger then 150 two-finger pinch moves, one every 16 ms
  // (a touch screen reports ~60 Hz); frames are capped at 33 ms during the gesture.
  const frameTimes = [];
  let clock = 1000, drawsBefore = gl.draws;
  view.canvas.dispatch('pointerdown', { pointerId: 1, clientX: 500, clientY: 300 });
  for (let i = 0; i < 450; i++) {
    clock += 16;
    if (i === 300) view.canvas.dispatch('pointerdown', { pointerId: 2, clientX: 800, clientY: 300 });
    if (i < 300) view.canvas.dispatch('pointermove', { pointerId: 1, clientX: 500 + (i % 50) * 4, clientY: 300 + (i % 30) * 2 });
    else view.canvas.dispatch('pointermove', { pointerId: 2, clientX: 800 + (i - 300), clientY: 300 });
    const s = performance.now(), before = gl.draws; page.runFrames(clock); if (gl.draws > before) frameTimes.push(performance.now() - s);
  }
  view.canvas.dispatch('pointerup', { pointerId: 2, clientX: 950, clientY: 300 }); view.canvas.dispatch('pointerup', { pointerId: 1, clientX: 600, clientY: 300 });
  const gestureDraws = gl.draws - drawsBefore, gestureMs = 450 * 16;

  // Picking (first tap projects every point, the next ones reuse the projection), filters.
  const picks = [];
  for (let i = 0; i < 20; i++) { const s = performance.now(); view.canvas.dispatch('pointerdown', { pointerId: 9, clientX: 300 + i * 30, clientY: 360 }); view.canvas.dispatch('pointerup', { pointerId: 9, clientX: 300 + i * 30, clientY: 360 }); picks.push(performance.now() - s); }
  const filterTimes = [];
  for (let i = 0; i < 5; i++) { const s = performance.now(); view.applyFilters(); filterTimes.push(performance.now() - s); }
  view.close('measure');
  const canvasSize = view.canvas.width + ' × ' + view.canvas.height;
  // Repeated open / close: the retained memory must not grow with each opening.
  const cycles = [];
  for (let k = 0; k < 5; k++) { const v = page.win.CNCPreviewGL.open(meta, { source: { stateAt: () => Promise.resolve(null), release() {} } }); page.runFrames(0); v.applyFilters(); v.close('measure'); cycles.push(heap()); }
  const h2 = heap();

  // Laser view of a large raster (rasterised on the CPU, in a worker on the tablet).
  const raster = ['G21 G90', 'M4 S0', 'G1 F6000'];
  for (let row = 0; row < 400; row++) for (let col = 0; col <= 1000; col++) raster.push('G1 X' + ((row % 2 ? 1000 - col : col) * 0.1).toFixed(1) + ' Y' + (row * 0.1).toFixed(1) + ' S' + (col % 1000));
  const rasterText = raster.join('\n');
  t = performance.now(); LV.analyze(rasterText); const laserMs = performance.now() - t;

  const frames = stats(frameTimes), pick = stats(picks);
  console.log('Conditions : PC, Node ' + process.version + ', ' + process.platform + '/' + process.arch + ', WebGL simulé (stub, aucun travail GPU), ' + (typeof global.gc === 'function' ? 'gc forcé' : 'sans --expose-gc (mémoire approximative)'));
  console.log('Programme : ' + lines.length + ' lignes, parcours 3D ' + path3d.count + ' points (simplifié: ' + path3d.simplified + ', décimé: ' + path3d.decimated + ')');
  console.log('Analyse + parcours 3D (déjà fait à la génération de l’aperçu) : ' + f2(scanMs) + ' ms ; estimation par les mouvements : ' + f2(estimateMs) + ' ms');
  console.log('Ouverture de la vue 3D libre (décodage, sommets, envoi, 1re image) : ' + f2(openMs) + ' ms ; ' + gl.vertices + ' sommets (' + f2(gl.vertices * 24 / 1048576) + ' Mo de tampon GPU)');
  console.log('Geste simulé ' + gestureMs + ' ms : ' + gestureDraws + ' images dessinées (≤ 30/s attendu : ' + Math.ceil(gestureMs / 33) + ' au plus) ; temps JS par image médiane ' + f2(frames.median) + ' ms, p95 ' + f2(frames.p95) + ' ms, max ' + f2(frames.max) + ' ms');
  console.log('Inspection par appui : 1er ' + f2(picks[0]) + ' ms (projection de tous les points), suivants médiane ' + f2(pick.median) + ' ms ; filtres : médiane ' + f2(stats(filterTimes).median) + ' ms');
  console.log('Tas JS + ArrayBuffers : avant ' + f2(h0) + ' Mo, vue ouverte ' + f2(h1) + ' Mo (+' + f2(h1 - h0) + '), après fermeture ' + f2(h2) + ' Mo (' + (h2 - h0 >= 0 ? '+' : '') + f2(h2 - h0) + ') ; après 5 ouvertures/fermetures de plus : ' + cycles.map(f2).join(' / ') + ' Mo');
  console.log('Vue laser d’un raster de ' + raster.length + ' lignes : ' + f2(laserMs) + ' ms');
  console.log('Canvas : ' + canvasSize + ' px pour 1280 × 720 CSS à DPR 2 (plafond 1,5)');
})().catch(e => { console.error(e); process.exit(1); });
