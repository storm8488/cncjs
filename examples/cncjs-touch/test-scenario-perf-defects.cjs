'use strict';
// Reviewer's scenarios (Performance UI, phase 4): defects found in the merged lots V, D and O.
// Each case states the rule it checks (PERFORMANCE-UI-SPEC.md) and FAILS while the defect is there.
// Offline, with the WebGL page stub of test-preview-gl.cjs; nothing is sent anywhere.
//
//   D1 (spec 3.8, Q7c): the full program geometry is read at rest only, never during a job. A read
//      started at rest is not cancelled when the job starts: the program is still fetched from the
//      server that drives the machine, interpreted, and its buffers built on the main thread, all
//      during the job.
//   D2 (spec 3.8, Q7b): the kept full geometry is released « au chargement d'un autre programme ».
//      It is only replaced when another program's full geometry is read successfully: when the next
//      program is too long, refused (other version) or has no fingerprint, the previous program's
//      geometry (up to ~20 MB at the 500 000 cap) stays in memory until eco or pagehide.
const assert = require('node:assert/strict');
const T3 = require('./touch/toolpath-3d.js');
const { createPage } = require('./test-preview-gl.cjs');
const tick = n => new Promise(r => { let k = n || 1; (function loop() { if (--k < 0) r(); else setImmediate(loop); })(); });

function program(name, fingerprint) {
  let line = 0, cur = [0, 0, 5];
  const b = T3.createBuilder({ bounds: [0, 0, -1, 50, 50, 5] });
  function mv(x, y, z, mode) { line++; b.move(cur[0], cur[1], cur[2], x, y, z, mode, line); cur = [x, y, z]; }
  for (let k = 0; k < 5; k++) { mv(0, k * 10, 5, 0); mv(0, k * 10, -1, 1); for (let s = 1; s <= 10; s++) mv(s * 5, k * 10, -1, 1); mv(50, k * 10, 5, 0); }
  return { file: name, fingerprint, path3d: b.finish(line), zBounds: [-1, 5] };
}
const running = (name, fingerprint) => ({ fresh: true, name, fingerprint, total: 100, received: 1, workflow: 'running', activeState: 'Run', statusAgeMs: 0,
  operator: { reportUnits: 'mm', wcs: 'G54' }, coordinates: { wpos: { x: '0', y: '0', z: '5' }, mpos: { x: '-300', y: '-200', z: '-50' } } });

const failures = [];
async function scenario(name, fn) {
  try { await fn(); console.log('OK   ' + name); } catch (e) { failures.push(name); console.log('FAIL ' + name + '\n     ' + e.message.split('\n')[0]); }
}

(async () => {
  await scenario('D1 a full-geometry read in flight is cancelled when a job starts (Q7c)', async () => {
    const page = createPage({ gpu: true, toolPosition: true });
    const meta = program('d1.nc', 'sha256:d1');
    let resolveRead = null, cancelled = 0;
    page.win.CNCPreviewInspect.geometry = () => ({ promise: new Promise(r => { resolveRead = r; }), cancel() { cancelled++; } });
    // Suivi at rest: preview-3d.js asks fullGeometry (home && !jobBusy).
    const view = page.win.CNCPreviewGL.open(meta, { container: page.doc.createElement('div'), live: { progress: true, tool: true }, fullGeometry: true });
    page.runFrames(0);
    assert.equal(view.state().geometryPending, true, 'read started at rest');
    // The operator presses Démarrer: the view stays open (live view), the read is still in flight.
    page.win.dispatch('cnc-job-status', { machine: running('d1.nc', 'sha256:d1') });
    page.runFrames(16);
    const pendingDuringJob = view.state().geometryPending;
    // The server answers during the job.
    resolveRead({ tooLong: false, segments: 59, path: T3.decode(meta.path3d) });
    await tick(5);
    const geometryDuringJob = view.state().geometry, uploads = view.stats().uploads;
    view.close('test');
    assert(cancelled > 0 && !pendingDuringJob, 'read not cancelled at job start (cancel() calls: ' + cancelled + ', still pending: ' + pendingDuringJob + ')');
    assert.equal(geometryDuringJob, 'simplified', 'full geometry applied during the job (' + uploads + ' uploads)');
  });

  await scenario('D2 the kept full geometry is released when another program is loaded (Q7b)', async () => {
    const page = createPage({ gpu: true });
    const A = program('a.nc', 'sha256:aa'), B = program('b.nc', 'sha256:bb');
    page.win.CNCPreviewInspect.geometry = () => ({ promise: Promise.resolve({ tooLong: false, segments: 59, path: T3.decode(A.path3d) }), cancel() {} });
    let view = page.win.CNCPreviewGL.open(A, { container: page.doc.createElement('div'), fullGeometry: true });
    await tick(5); assert.equal(view.state().geometry, 'full'); view.close('test');
    const kept = page.listenerCount.value;
    assert.equal(kept, 2, 'A kept (eco and pagehide listeners)');
    // Program B is loaded; its full geometry is over the cap: B is drawn simplified.
    page.win.CNCPreviewInspect.geometry = () => ({ promise: Promise.resolve({ tooLong: true, segments: 612345, path: null }), cancel() {} });
    view = page.win.CNCPreviewGL.open(B, { container: page.doc.createElement('div'), fullGeometry: true });
    await tick(5); assert.equal(view.state().geometryReason, 'too-long'); view.close('test');
    // A's geometry should be gone: B is the loaded program now.
    assert.equal(page.listenerCount.value, 0, 'program A\'s full geometry still kept after loading B (cache listeners: ' + page.listenerCount.value + ')');
  });

  if (failures.length) { console.log(failures.length + ' defect(s) reproduced.'); process.exit(1); }
  console.log('PASS no defect reproduced.');
})().catch(e => { console.error(e); process.exit(1); });
