'use strict';
// Reviewer's scenarios (Performance UI, phase 4): safety invariants of the merged live 3D view
// (touch/preview-gl.js under the GPU gate), checked end to end on one view's whole life rather than
// rule by rule. Offline, with the WebGL page stub of test-preview-gl.cjs.
//   S1 Nothing leaves the page: no fetch / XMLHttpRequest / WebSocket / socket.io / sendBeacon, no call
//      to the job controls, through reports of every state, gestures, follow, overlays and the closing.
//   S2 A cnc-job-status handler never draws and asks at most one animation frame, whatever the rate.
//   S3 The tool marker is never past the last acknowledged segment L nor past the last report:
//      on a randomized run (fixed seed) with reports far ahead of the acknowledged lines.
//   S4 Stale at 2 500 ms exactly: the marker goes back to the last reported position, no
//      interpolation, frames stop, machine-frame overlays are hidden ('stale').
const assert = require('node:assert/strict');
const T3 = require('./touch/toolpath-3d.js');
const { createPage } = require('./test-preview-gl.cjs');
const plain = v => JSON.parse(JSON.stringify(v));

// A program: eight passes of 25 work moves at Z -2, rapids between them.
let line = 0, cur = [0, 0, 5];
const builder = T3.createBuilder({ bounds: [0, 0, -2, 125, 80, 5] });
function mv(x, y, z, mode) { line++; builder.move(cur[0], cur[1], cur[2], x, y, z, mode, line); cur = [x, y, z]; }
for (let k = 0; k < 8; k++) { mv(0, k * 10, 5, 0); mv(0, k * 10, -2, 1); for (let s = 1; s <= 25; s++) mv(s * 5, k * 10 + (s % 3), -2, 1); mv(125, k * 10, 5, 0); }
const meta = { file: 'safety.nc', fingerprint: 'sha256:5a', path3d: builder.finish(line), zBounds: [-2, 5] };
const P = T3.decode(meta.path3d), TOTAL = line;
const lengths = [0]; for (let i = 1; i < P.count; i++) lengths.push(lengths[i - 1] + Math.hypot(P.positions[i * 3] - P.positions[i * 3 - 3], P.positions[i * 3 + 1] - P.positions[i * 3 - 2], P.positions[i * 3 + 2] - P.positions[i * 3 - 1]));
function pointAt(s) { let j = 1; while (j < P.count - 1 && lengths[j] < s) j++; const k = lengths[j] > lengths[j - 1] ? (s - lengths[j - 1]) / (lengths[j] - lengths[j - 1]) : 1; return [0, 1, 2].map(a => P.positions[j * 3 - 3 + a] + k * (P.positions[j * 3 + a] - P.positions[j * 3 - 3 + a])); }
function onSegment(p, j) {
  const a = [0, 1, 2].map(k => P.positions[j * 3 - 3 + k]), v = [0, 1, 2].map(k => P.positions[j * 3 + k] - a[k]), l2 = v[0] ** 2 + v[1] ** 2 + v[2] ** 2;
  let k = l2 ? ((p[0] - a[0]) * v[0] + (p[1] - a[1]) * v[1] + (p[2] - a[2]) * v[2]) / l2 : 0; k = Math.max(0, Math.min(1, k));
  return Math.hypot(a[0] + k * v[0] - p[0], a[1] + k * v[1] - p[1], a[2] + k * v[2] - p[2]) < 1e-3;
}
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function report(p, received, extra) {
  return Object.assign({ fresh: true, name: 'safety.nc', fingerprint: 'sha256:5a', total: 1000, received, workflow: 'running', activeState: 'Run', statusAgeMs: 0,
    operator: { reportUnits: 'mm', wcs: 'G54' }, coordinates: { wpos: { x: String(p[0]), y: String(p[1]), z: String(p[2]) }, mpos: { x: p[0] - 300, y: p[1] - 200, z: p[2] - 50 } } }, extra || {});
}
function livePage() {
  let now = 0; const timers = [];
  const page = createPage({ gpu: true, dpr: 1.58, toolPosition: true, clock: () => now,
    setTimeout: (fn, ms) => { timers.push({ fn, at: now + ms }); return timers.length; }, clearTimeout: id => { if (id) timers[id - 1] = null; } });
  // Every way out of the page, recorded.
  const sent = [];
  page.win.fetch = (...a) => { sent.push(['fetch', a[0]]); return Promise.reject(new Error('blocked')); };
  page.win.XMLHttpRequest = function () { sent.push(['xhr']); this.open = () => {}; this.send = () => {}; this.setRequestHeader = () => {}; };
  page.win.WebSocket = function (u) { sent.push(['ws', u]); };
  page.win.io = () => { sent.push(['io']); return { emit: (...a) => sent.push(['emit', a[0]]) }; };
  page.win.navigator = { sendBeacon: u => { sent.push(['beacon', u]); return true; } };
  page.win.cncJobControls = new Proxy({}, { get: (_, k) => () => sent.push(['cncJobControls', String(k)]) });
  return { page, sent, timers, get now() { return now; }, set now(v) { now = v; },
    fire() { timers.forEach((t, i) => { if (t && t.at <= now) { timers[i] = null; t.fn(); } }); },
    status(m) { page.win.dispatch('cnc-job-status', { machine: m }); } };
}
const overlays = [{ id: 'travel', kind: 'box', frame: 'machine', min: [-400, -300, -80], max: [0, 0, 0], colour: 'neutral', width: 'thin' },
  { id: 'placed', kind: 'program', translate: [10, 10, 0], colour: 'info', width: 'thick' }, { id: 'origin', kind: 'marker', frame: 'work', at: [10, 10, 0], colour: 'info' }];

// ---- S1 + S2 + S3: a randomized job, seed 20261106 ----
const L = livePage(), view = L.page.win.CNCPreviewGL.open(meta, { container: L.page.doc.createElement('div'), live: { progress: true, tool: true }, overlays });
const gl = view.canvas.glStub.log;
L.page.runFrames(0);
view.follow(true);
const random = rng(20261106);
let s = 0, checked = 0, onL = 0, atReport = 0, acked = 0, lastFresh = null;
for (let r = 0; r < 600; r++) {
  // Tool moves on (sometimes back, sometimes off the path); Grbl acknowledged lines sometimes behind the tool.
  s = Math.max(0, Math.min(lengths[P.count - 1], s + (random() < 0.1 ? -random() * 15 : random() * 12)));
  const p = pointAt(s); if (random() < 0.08) p[1] += 4;
  // Grbl's received count only grows; it may be behind or ahead of the tool.
  acked = Math.max(acked, Math.min(TOTAL, Math.round((s / lengths[P.count - 1]) * TOTAL + (random() - 0.6) * 12)));
  const ackLine = acked;
  const state = random() < 0.05 ? { activeState: 'Alarm' } : random() < 0.05 ? { workflow: 'paused', activeState: 'Hold:0' } : random() < 0.03 ? { fresh: false } : {};
  if (state.fresh !== false) lastFresh = p;
  const framesBefore = gl.frames;
  // Every tenth step, a burst of identical reports (a fast status rate): still one frame asked.
  for (let burst = r % 10 ? 1 : 4; burst > 0; burst--) L.status(report(p, Math.ceil(ackLine / TOTAL * 1000), state));
  assert.equal(gl.frames, framesBefore, 'S2: nothing drawn by a cnc-job-status handler');
  assert(L.page.frames.length <= 1, 'S2: at most one animation frame asked (got ' + L.page.frames.length + ')');
  const step = 50 + Math.floor(random() * 400);
  for (let t = 16; t <= step; t += 16) {
    L.now += 16; L.fire(); L.page.runFrames(L.now);
    const st = view.state().live, at = st.marker.at;
    if (!at) continue;
    checked++;
    const last = lastFresh;
    if (at.every((v, k) => Math.abs(v - last[k]) < 1e-6)) { atReport++; continue; }
    // Not the reported position: then it must lie on a segment <= L.
    let ok = false; for (let j = 1; j <= st.lastAckSegment && !ok; j++) ok = onSegment(at, j);
    assert(ok, 'S3: marker at ' + at.map(v => v.toFixed(3)) + ' is neither the last report nor on a segment <= L=' + st.lastAckSegment);
    onL++;
  }
  if (random() < 0.05) { // a rotation gesture in the canvas
    view.canvas.dispatch('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
    view.canvas.dispatch('pointermove', { pointerId: 1, clientX: 140, clientY: 110 });
    view.canvas.dispatch('pointerup', { pointerId: 1, clientX: 140, clientY: 110 });
  }
}
assert(checked > 1000 && onL > 100 && atReport > 100, 'S3: enough interpolated and raw positions checked (' + checked + ', ' + onL + ', ' + atReport + ')');

// ---- S4: stale at 2 500 ms ----
let p = pointAt(lengths[40]);
L.status(report(pointAt(lengths[38]), 1000)); L.now += 200; L.page.runFrames(L.now);
L.status(report(p, 1000)); const tReport = L.now;
L.now += 100; L.fire(); L.page.runFrames(L.now);
assert.equal(view.state().live.marker.stale, false);
assert(view.state().overlays.find(o => o.id === 'travel').drawn, 'machine-frame overlay drawn while fresh');
L.now = tReport + 2499; L.fire(); L.page.runFrames(L.now);
assert.equal(view.state().live.marker.stale, false, 'not stale at 2 499 ms');
L.now = tReport + 2601; L.fire(); L.page.runFrames(L.now);
let st = view.state();
assert.equal(st.live.marker.stale, true, 'stale after 2 500 ms (frame from the 2 600 ms timer)');
assert.deepEqual(plain(st.live.marker.at), p, 'stale marker at the last reported position');
assert.equal(st.live.marker.interpolating, false);
assert.equal(st.overlays.find(o => o.id === 'travel').reason, 'stale', 'machine-frame overlay hidden while stale');
assert.equal(L.page.frames.length, 0, 'no frame asked once stale');

// ---- S1: closing on eco; nothing ever sent ----
L.page.win.dispatch('cnc-profile-change', { performance: 'eco' });
assert.equal(view.state().closed, true);
assert.equal(L.page.listenerCount.value, 0, 'every listener removed');
assert.deepEqual(L.sent, [], 'S1: nothing sent: ' + JSON.stringify(L.sent));
console.log('PASS reviewer safety scenarios: nothing sent through a whole live view (' + checked + ' marker positions), no drawing in the status handler, ' +
  'marker on segments <= L or at the last report, stale at 2.5 s with machine overlays hidden, released in eco.');
