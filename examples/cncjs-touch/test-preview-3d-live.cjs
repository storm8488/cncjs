'use strict';
// Live 3D view in Suivi (touch/preview-gl.js under the GPU gate, PERFORMANCE-UI-SPEC.md 3): acknowledged
// line A and last acknowledged segment L, current pass; the tool marker interpolated between two reports,
// checked on a thousand generated report sequences (fixed seed) to stay on segments <= L or on the last
// reported position, never extrapolated; frames stop at α = 1; stale at 2.5 s; alarm; « Suivre l’outil »
// stopped by a two-finger move; nothing drawn from a cnc-job-status handler; the note of tool-position.js.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const T3 = require('./touch/toolpath-3d.js');
const TP = require('./touch/tool-position.js');
const { createPage } = require('./test-preview-gl.cjs');
const plain = v => JSON.parse(JSON.stringify(v));

// ---- A program: ten passes of twenty work moves at Z -1, rapids between them ----
let line = 0, cur = [0, 0, 5];
const builder = T3.createBuilder({ bounds: [0, 0, -1, 100, 100, 5] });
function mv(x, y, z, mode) { line++; builder.move(cur[0], cur[1], cur[2], x, y, z, mode, line); cur = [x, y, z]; }
for (let k = 0; k < 10; k++) {
  mv(0, k * 10, 5, 0); mv(0, k * 10, -1, 1);
  for (let s = 1; s <= 20; s++) mv(s * 5, k * 10 + (s % 2), -1, 1);
  mv(100, k * 10, 5, 0);
}
const meta = { file: 'live.nc', fingerprint: 'sha256:11', path3d: builder.finish(line), zBounds: [-1, 5] };
const P = T3.decode(meta.path3d), TOTAL = line;
assert.equal(P.count - 1, line, 'one point per move (no simplification at this size)');

// Seeded generator (mulberry32).
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function distToSegment(p, j) {
  const a = [P.positions[j * 3 - 3], P.positions[j * 3 - 2], P.positions[j * 3 - 1]], b = [P.positions[j * 3], P.positions[j * 3 + 1], P.positions[j * 3 + 2]];
  const v = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l2 = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
  let k = l2 ? ((p[0] - a[0]) * v[0] + (p[1] - a[1]) * v[1] + (p[2] - a[2]) * v[2]) / l2 : 0; k = Math.max(0, Math.min(1, k));
  return Math.hypot(a[0] + k * v[0] - p[0], a[1] + k * v[1] - p[1], a[2] + k * v[2] - p[2]);
}
// Abscissa of the nearest point of the segments 1..limit within the view's snapping tolerance, or null.
function snapLength(p, limit) {
  if (!p) return null;
  const tol = Math.max(2 * meta.path3d.tolerance, 0.1); let best = null;
  for (let j = 1; j <= limit; j++) {
    const a = [P.positions[j * 3 - 3], P.positions[j * 3 - 2], P.positions[j * 3 - 1]], v = [P.positions[j * 3] - a[0], P.positions[j * 3 + 1] - a[1], P.positions[j * 3 + 2] - a[2]], l2 = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
    let k = l2 ? ((p[0] - a[0]) * v[0] + (p[1] - a[1]) * v[1] + (p[2] - a[2]) * v[2]) / l2 : 0; k = Math.max(0, Math.min(1, k));
    const d = Math.hypot(a[0] + k * v[0] - p[0], a[1] + k * v[1] - p[1], a[2] + k * v[2] - p[2]);
    if (d <= tol && (!best || d < best.d)) best = { d, s: lengths[j - 1] + k * (lengths[j] - lengths[j - 1]) };
  }
  return best && best.s;
}
const lengths = [0]; for (let i = 1; i < P.count; i++) lengths.push(lengths[i - 1] + Math.hypot(P.positions[i * 3] - P.positions[i * 3 - 3], P.positions[i * 3 + 1] - P.positions[i * 3 - 2], P.positions[i * 3 + 2] - P.positions[i * 3 - 1]));
function pointAtLength(s) {
  let j = 1; while (j < P.count - 1 && lengths[j] < s) j++;
  const k = lengths[j] > lengths[j - 1] ? (s - lengths[j - 1]) / (lengths[j] - lengths[j - 1]) : 1;
  return { seg: j, p: [0, 1, 2].map(a => P.positions[j * 3 - 3 + a] + k * (P.positions[j * 3 + a] - P.positions[j * 3 - 3 + a])) };
}
// A Grbl report as cnc-job-status carries it (job-service.js snapshot).
function machine(p, received, extra) {
  return Object.assign({ fresh: true, name: 'live.nc', total: 1000, received, workflow: 'running', activeState: 'Run', statusAgeMs: 0,
    operator: { reportUnits: 'mm', wcs: 'G54' }, coordinates: { wpos: { x: String(p[0]), y: String(p[1]), z: String(p[2]) }, mpos: { x: p[0] - 300, y: p[1] - 200, z: p[2] - 50 } } }, extra || {});
}
const receivedFor = lineNo => Math.ceil(lineNo / TOTAL * 1000);

function livePage(extra) {
  let now = 0; const timers = [];
  const page = createPage(Object.assign({ gpu: true, dpr: 2, toolPosition: true, clock: () => now,
    setTimeout: (fn, ms) => { timers.push({ fn, at: now + ms }); return timers.length; }, clearTimeout: id => { if (id) timers[id - 1] = null; } }, extra || {}));
  return { page, timers, get now() { return now; }, set now(v) { now = v; },
    fireTimers() { timers.forEach((t, i) => { if (t && t.at <= now) { timers[i] = null; t.fn(); } }); },
    status(m, simulation) { page.win.dispatch('cnc-job-status', { machine: m, simulation: !!simulation }); } };
}

// ---- A, L, current pass; nothing drawn in the handler; no buffer sent for a new A ----
let L = livePage(), view = L.page.win.CNCPreviewGL.open(meta, { container: L.page.doc.createElement('div'), live: { progress: true, tool: true } });
let gl = view.canvas.glStub.log;
L.page.runFrames(0);
const uploads = view.stats().uploads, framesDrawn = gl.frames;
// Tool on segment 30 (pass 2), Grbl acknowledged up to line 34.
let at = pointAtLength((lengths[29] + lengths[30]) / 2);
assert.equal(at.seg, 30);
for (let i = 0; i < 5; i++) L.status(machine(at.p, receivedFor(34)));
assert.equal(gl.frames, framesDrawn, 'nothing drawn by the cnc-job-status handler');
assert.equal(L.page.frames.length, 1, 'one animation frame asked, not one per report');
const A = TP.acknowledged(machine(at.p, receivedFor(34)), TOTAL);
assert.equal(view.state().live.ackLine, A, 'A from CNCToolPosition.acknowledged');
let Lseg = 0; for (let i = 1; i < P.count; i++) if (P.lines[i] <= A) Lseg = i;
assert.equal(view.state().live.lastAckSegment, Lseg);
L.page.runFrames(16);
let st = view.state().live;
assert.equal(st.marker.snapped, true); // Pass 2: segment 24 rapid, 25 plunge, 26-45 work, 46 rapid.
assert.deepEqual(plain(st.pass), [25, Math.min(45, Lseg)], 'pass from the last rapid, bounded by L');
let calls = gl.calls.filter(c => c.frame === gl.frames);
assert(calls.some(c => c.ack === A && c.width === 4), 'work segments compared with A in the shader (2 px × DPR 2)');
assert(calls.some(c => c.solid && c.width === 6 && Math.abs(c.solid[0] - 0xee / 255) < 1e-6), 'current pass white, 3 px × DPR 2');
assert.equal(view.stats().uploads, uploads, 'a new A sends no buffer');
// A later A: same buffers, a new uniform.
L.status(machine(at.p, receivedFor(40))); L.page.runFrames(32);
assert.equal(view.stats().uploads, uploads); assert(gl.calls.some(c => c.frame === gl.frames && c.ack === TP.acknowledged(machine(at.p, receivedFor(40)), TOTAL)));
// The pass never reaches past L: tool at the start of a pass, L inside it.
at = pointAtLength((lengths[47] + lengths[48]) / 2); L.status(machine(at.p, receivedFor(P.lines[50]))); L.page.runFrames(48);
st = view.state().live; assert.equal(st.lastAckSegment, 50); assert.deepEqual(plain(st.pass), [48, 50], 'pass 3 starts at its plunge (48), stops at L (50), not at its end (68)');
// At rest (not finished): no acknowledged colour; finished: everything acknowledged, no pass.
L.status(machine(at.p, 0, { workflow: 'idle' })); L.page.runFrames(64);
assert.equal(view.state().live.ackLine, -1); assert.equal(view.state().live.pass, null);
L.status(machine(at.p, 1000, { workflow: 'idle', finished: true })); L.page.runFrames(80);
assert.equal(view.state().live.ackLine, TOTAL); assert.equal(view.state().live.pass, null);
// Another program loaded: no progress drawn for this one.
L.status(machine(at.p, 500, { name: 'other.nc' })); L.page.runFrames(96); assert.equal(view.state().live.ackLine, -1);
view.close('test');

// ---- Interpolation: a thousand generated sequences (seed 20261105) ----
const random = rng(20261105);
let checked = 0, interpolated = 0, raw = 0, sequences = 0;
for (let seq = 0; seq < 1000; seq++) {
  L = livePage(); view = L.page.win.CNCPreviewGL.open(meta, { container: L.page.doc.createElement('div'), live: { progress: true, tool: true } });
  L.now = 1000; L.page.runFrames(0);
  let s = random() * lengths[P.count - 1] * 0.7, reports = 3 + Math.floor(random() * 8), prev = null;
  for (let r = 0; r < reports; r++) {
    const kind = random();
    if (kind < 0.1) s = Math.max(0, s - random() * 20);              // backward
    else s = Math.min(lengths[P.count - 1], s + random() * 15);      // forward
    const target = pointAtLength(s), p = target.p.slice();
    if (random() < 0.1) p[1] += 3 + random() * 5;                    // off the path
    // Grbl acknowledges ahead of the tool, sometimes not up to it (a report beyond L).
    const ackLine = random() < 0.07 ? Math.max(0, P.lines[target.seg] - 2) : Math.min(TOTAL, P.lines[target.seg] + Math.floor(random() * 6));
    const gap = random() < 0.1 ? 1100 + random() * 900 : 80 + random() * 600;
    L.now += gap;
    L.status(machine(p, receivedFor(ackLine)));
    const live = view.state().live, Lnow = live.lastAckSegment;
    for (let f = 0; f < 3; f++) {
      L.now += random() * gap * 0.6;
      L.page.runFrames(L.now);
      const m = view.state().live.marker;
      assert(m.shown, 'marker shown');
      const onReport = Math.hypot(m.at[0] - p[0], m.at[1] - p[1], m.at[2] - p[2]) < 1e-9;
      let onAcknowledged = false;
      for (let j = 1; j <= Lnow && !onAcknowledged; j++) if (distToSegment(m.at, j) < 1e-6) onAcknowledged = true;
      assert(onReport || onAcknowledged, 'sequence ' + seq + ': marker ' + JSON.stringify(m.at) + ' neither the report nor on a segment <= L=' + Lnow);
      // Not the report: between the previous and the last report along the path (never past the last one).
      if (!onReport) {
        const a = snapLength(prev, Lnow), b = snapLength(p, Lnow), here = snapLength(m.at, Lnow);
        assert(a !== null && b !== null && here !== null && here >= a - 1e-6 && here <= b + 1e-6, 'sequence ' + seq + ': marker at ' + here + ' outside [' + a + ', ' + b + ']');
      }
      if (m.interpolating) interpolated++; else if (onReport) raw++;
      checked++;
    }
    prev = p;
  }
  view.close('test'); sequences++;
}
assert(interpolated > 1000 && raw > 100, 'both cases exercised: ' + interpolated + ' interpolated, ' + raw + ' raw');

// ---- Frames: asked while α < 1, none once the marker reached the last report ----
L = livePage(); view = L.page.win.CNCPreviewGL.open(meta, { container: L.page.doc.createElement('div'), live: { progress: true, tool: true } });
gl = view.canvas.glStub.log; L.now = 1000; L.page.runFrames(0);
const a1 = pointAtLength(lengths[60] + 1), a2 = pointAtLength(lengths[60] + 4);
L.status(machine(a1.p, receivedFor(70))); L.page.runFrames(1000);
L.now = 1250; L.status(machine(a2.p, receivedFor(70)));
let frames = 0;
while (L.page.frames.length && frames < 100) { L.now += 16; L.page.runFrames(L.now); frames++; }
assert(frames >= 14 && frames <= 17, 'frames for one 250 ms interval at 60 Hz: ' + frames);
assert.equal(view.state().live.marker.interpolating, false); assert.equal(L.page.frames.length, 0, 'no frame once α = 1');
let mk = view.state().live.marker; assert(Math.hypot(mk.at[0] - a2.p[0], mk.at[1] - a2.p[1]) < 1e-6, 'stops exactly on the last reported position');
// A late frame is not caught up: the next one computes α for its own time.
L.now = 1500; L.status(machine(a1.p, receivedFor(70))); L.page.runFrames(1500);
// The DOM marker is the 16 px disc over the path.
const toolMark = view.dialog.children.find(c => /pgl-stage/.test(c.className)).children.find(c => /pgl-tool/.test(c.className));
assert(toolMark && toolMark.hidden === false && /translate\(/.test(toolMark.style.transform));

// ---- Stale at 2.5 s, alarm, paused ----
L.now = 3000; L.status(machine(a1.p, receivedFor(80))); L.page.runFrames(3000);
const ackBefore = view.state().live.ackLine;
L.now = 3000 + 2400; L.fireTimers(); assert.equal(view.state().live.marker.stale, false, 'fresh at 2.4 s');
L.now = 3000 + 2700; L.fireTimers();
assert.equal(L.page.frames.length, 1, 'one frame asked when the report becomes stale'); L.page.runFrames(L.now);
mk = view.state().live.marker; assert.equal(mk.stale, true); assert.deepEqual(plain(mk.at), a1.p, 'stale: the last reported position, never an interpolated one');
assert(toolMark.classList.contains('is-stale'), 'grey ring');
assert.equal(L.page.frames.length, 0, 'then no frame');
// A report that is not fresh changes nothing: A frozen.
L.status(machine(a2.p, receivedFor(150), { fresh: false })); L.page.runFrames(L.now + 16);
assert.equal(view.state().live.ackLine, ackBefore); assert.equal(view.state().live.marker.stale, true);
// Fresh again: a new start, no interpolation from the old position.
L.now += 100; L.status(machine(a2.p, receivedFor(80))); L.page.runFrames(L.now);
assert.equal(view.state().live.marker.interpolating, false); assert.deepEqual(plain(view.state().live.marker.at), a2.p);
// Alarm: grey, not interpolated, progress frozen.
L.now += 200; L.status(machine(a1.p, receivedFor(120), { activeState: 'Alarm', workflow: 'paused' })); L.page.runFrames(L.now);
mk = view.state().live.marker; assert.equal(mk.alarm, true); assert.equal(mk.interpolating, false); assert.deepEqual(plain(mk.at), a1.p);
assert.equal(view.state().live.ackLine, TP.acknowledged(machine(a2.p, receivedFor(80)), TOTAL), 'A frozen in alarm');
// Paused: the marker stays on the reported position.
L.now += 200; L.status(machine(a1.p, receivedFor(80), { workflow: 'paused', activeState: 'Hold:0' }));
L.now += 200; L.status(machine(a2.p, receivedFor(80), { workflow: 'paused', activeState: 'Hold:0' })); L.page.runFrames(L.now + 1);
assert.equal(view.state().live.marker.interpolating, false); assert.deepEqual(plain(view.state().live.marker.at), a2.p);
// Units in inches or another work frame: no marker, the reason of tool-position.js.
L.now += 200; L.status(machine(a2.p, receivedFor(80), { operator: { reportUnits: 'in', wcs: 'G54' } })); L.page.runFrames(L.now);
assert.equal(view.state().live.marker.shown, false); assert.match(view.state().live.reason, /G54 et rapports en mm requis/);
view.close('test');

// ---- « Suivre l’outil » ----
L = livePage(); view = L.page.win.CNCPreviewGL.open(meta, { container: L.page.doc.createElement('div'), live: { progress: true, tool: true } });
L.now = 1000; L.page.runFrames(0);
const tools = view.dialog.children.find(c => /pgl-tools/.test(c.className)), followButton = tools.children.find(c => c.className.split(' ').includes('pgl-follow'));
assert(followButton, 'follow button in the view toolbar'); assert.equal(followButton.getAttribute('aria-pressed'), 'false', 'off by default');
assert.equal(followButton.disabled, true, 'disabled without a marker'); assert.equal(followButton.title, 'Position outil inconnue.');
L.status(machine(a1.p, receivedFor(70))); L.page.runFrames(L.now);
assert.equal(followButton.disabled, false); assert(followButton.classList.contains('is-live'), 'visible without unfolding « Vues » during a job');
followButton.click(); assert.equal(view.follow(), true); assert.equal(followButton.getAttribute('aria-pressed'), 'true');
L.page.runFrames(L.now + 16);
const mark = () => /translate\(([-\d.]+)px,([-\d.]+)px\)/.exec(toolMarkOf(view).style.transform).slice(1).map(Number);
function toolMarkOf(v) { return v.dialog.children.find(c => /pgl-stage/.test(c.className)).children.find(c => /pgl-tool/.test(c.className)); }
assert.deepEqual(mark(), [400, 225], 'the marker in the middle of the frame');
// One-finger rotation keeps following.
view.canvas.dispatch('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 }); view.canvas.dispatch('pointermove', { pointerId: 1, clientX: 140, clientY: 120 });
L.page.runFrames(L.now + 32); assert.equal(view.follow(), true); assert.deepEqual(mark(), [400, 225]);
// Pinch (the middle of the fingers stays): kept.
view.canvas.dispatch('pointerdown', { pointerId: 2, clientX: 300, clientY: 120 });
view.canvas.dispatch('pointermove', { pointerId: 2, clientX: 320, clientY: 120 }); view.canvas.dispatch('pointermove', { pointerId: 1, clientX: 120, clientY: 120 });
assert.equal(view.follow(), true, 'a pinch keeps the follow');
// Two-finger move: stopped.
view.canvas.dispatch('pointermove', { pointerId: 2, clientX: 320, clientY: 180 }); view.canvas.dispatch('pointermove', { pointerId: 1, clientX: 120, clientY: 180 });
assert.equal(view.follow(), false, 'a two-finger move stops the follow'); assert.equal(followButton.getAttribute('aria-pressed'), 'false');
view.canvas.dispatch('pointerup', { pointerId: 2 }); view.canvas.dispatch('pointerup', { pointerId: 1 });
// « Recentrer » and a preset stop it too.
view.follow(true); tools.children.find(c => c.className === 'pgl-recentre').click(); assert.equal(view.follow(), false);
view.follow(true); tools.children.find(c => c.getAttribute('data-preset') === 'top').click(); assert.equal(view.follow(), false);
// Stale: the camera stops where it is, the button stays pressed.
view.follow(true); L.page.runFrames(L.now + 48); const cam1 = plain(view.state().camera);
L.now += 3000; L.fireTimers(); L.page.runFrames(L.now);
assert.equal(view.follow(), true); assert.deepEqual(plain(view.state().camera), cam1);
view.close('test');
// Without live.tool (O's views without a marker, Fichiers): no follow button, follow() a no-op.
L = livePage(); view = L.page.win.CNCPreviewGL.open(meta, { container: L.page.doc.createElement('div') });
assert(!view.dialog.children.find(c => /pgl-tools/.test(c.className)).children.some(c => /pgl-follow/.test(c.className)));
assert.equal(view.follow(true), false);
L.page.runFrames(0); L.status(machine(a1.p, receivedFor(70))); assert.equal(L.page.frames.length, 0, 'no live option: status reports not even listened to'); view.close('test');

// ---- The note under Suivi's frame (tool-position.js reads the live view) ----
{
  let note = null, nowMs = 1e6; const frames = [], handlers = {};
  function el(tag) { return { tagName: tag, style: {}, hidden: false, attributes: {}, children: [], textContent: '', setAttribute(k, v) { this.attributes[k] = v; }, appendChild(c) { this.children.push(c); c.parentNode = this; return c; }, addEventListener() {}, insertAdjacentElement(_, n) { note = n; } }; }
  const parent = el('div'); parent.getBoundingClientRect = () => ({ left: 0, top: 0, width: 960, height: 540 });
  const img = el('img'); img.id = 'home-job-image'; parent.appendChild(img); img.offsetWidth = 960; img.getBoundingClientRect = () => ({ left: 0, top: 0, width: 960, height: 540 });
  const screen = el('section'); screen.classList = { contains: n => n === 'active' };
  const document = { hidden: false, getElementById: id => id === 'home-job-image' ? img : id === 'screen-home' ? screen : el('p'), createElement: el, createElementNS: (ns, tag) => el(tag), addEventListener() {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'touch', 'tool-position.js'), 'utf8'), { window: { addEventListener: (n, f) => { handlers[n] = f; } }, document, Date: { now: () => nowMs },
    requestAnimationFrame: f => { frames.push(f); return frames.length; }, cancelAnimationFrame() {}, setTimeout: () => 0, clearTimeout() {}, Number, Math, Array, isFinite });
  const marker = parent.children.find(c => c.className === 'tool-position-marker');
  img.cncPreview = { file: 'live.nc', projection: { version: 1, width: 960, height: 540, units: 'mm', wcs: 'G54', bounds: [0, 0, 100, 100] } };
  let liveState = null;
  img.cncLiveView = { state: () => liveState };
  const base = (live, extra) => Object.assign({ closed: false, gpu: true, geometry: 'simplified', segments: 239, live: Object.assign({ workflow: 'running', simulation: false, reason: '', marker: { shown: true, stale: false, alarm: false, snapped: true, interpolating: true, ageMs: 400, at: [1, 2, 3] } }, live) }, extra || {});
  const noteFor = (state, machineExtra) => { liveState = state; handlers['cnc-job-status']({ detail: { simulation: false, machine: Object.assign({ fresh: true, name: 'live.nc', total: 100, received: 10, workflow: 'running', operator: { reportUnits: 'mm', wcs: 'G54' }, coordinates: { wpos: { x: '1', y: '2' } } }, machineExtra || {}) } }); while (frames.length) frames.shift()(); return note.textContent; };
  assert.equal(noteFor(base({})), 'Parcours prévu · orange : lignes acquittées par Grbl (acceptées, pas forcément usinées) · blanc : passe en cours · repère : position de travail rapportée par Grbl il y a moins d’une seconde, G54, interpolée entre deux rapports. Géométrie simplifiée (240 points).');
  assert.equal(marker.hidden, true, 'DOM marker hidden under the live view');
  assert.match(noteFor(base({ marker: { shown: true, stale: false, alarm: false, snapped: false, ageMs: 2300, at: [1, 2, 3] } })), /il y a 2 s, G54 \(hors du parcours dessiné : non interpolée\)\./);
  assert.match(noteFor(base({ marker: { shown: true, stale: true, alarm: false, snapped: false, ageMs: 4700, at: [1, 2, 3] } })), /^Position périmée : dernier rapport il y a 4 s\. Repère et avancement figés\./);
  assert.match(noteFor(base({ marker: { shown: true, stale: false, alarm: true, ageMs: 100, at: [1, 2, 3] } })), /^Alarme : position non garantie\. Repère et avancement figés\./);
  assert.match(noteFor(base({ simulation: true })), /^Tracé orange : avancement fictif\. Point bleu : position fictive G54\./);
  assert.doesNotMatch(noteFor(base({}, { geometry: 'full' })), /Géométrie simplifiée/);
  // At rest the existing note is kept (Point bleu, Q1), still without the DOM marker over the live view.
  const rest = noteFor(base({ workflow: 'idle' }), { workflow: 'idle' });
  assert.match(rest, /^Image : parcours prévu\. Point bleu : position de travail rapportée par Grbl il y a /); assert.equal(marker.hidden, true);
  // No live view (eco, software rendering): the previous behaviour.
  img.cncLiveView = null; noteFor(null); assert.equal(marker.hidden, false);
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, 'touch', 'tool-position.js'), 'utf8'), /Point rose/, 'Q1: the marker is blue');
}

console.log('PASS live view: A from CNCToolPosition.acknowledged, L, current pass bounded by rapids and L; nothing drawn in the status handler, no buffer for a new A; ' +
  checked + ' frames over ' + sequences + ' generated report sequences (backward, spaced, off-path, beyond L): marker always the last report or on a segment <= L; frames stop at α = 1; ' +
  'stale at 2.5 s (one frame, last reported position, A frozen), fresh again without interpolation, alarm, pause, units; follow centred, kept by rotation and pinch, stopped by a two-finger move, Recentrer, presets, frozen when stale; note texts.');
