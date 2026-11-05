'use strict';
// Overlay API of the 3D view (touch/preview-gl.js, PERFORMANCE-UI-SPEC.md 8.2-8.3): the reference
// cases of spec 8.10 give the same accepted / refused result in the real module and in the spec's
// stub (copied below as the spec prints it); setOverlays is declarative; machine-frame overlays are
// accepted but not drawn while the offset is unknown; everything is released with the view.
const assert = require('node:assert/strict');
const vm = require('node:vm');
const T3 = require('./touch/toolpath-3d.js');
const GL = require('./touch/preview-gl.js');
const { createPage } = require('./test-preview-gl.cjs');
// Values from the vm realms compared as plain JSON (their arrays have other prototypes).
const eq = (a, b, message) => assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), message);

// The stub of spec 8.10, verbatim (test use only).
const STUB = `(function (root) {
  'use strict';
  var COLOURS = ['info', 'ok', 'warn', 'danger', 'neutral', 'stock', 'clamp'];
  var FIELDS = { segments: ['id', 'kind', 'frame', 'points', 'colour', 'width'], box: ['id', 'kind', 'frame', 'min', 'max', 'colour', 'width'],
    program: ['id', 'kind', 'translate', 'colour', 'width'], marker: ['id', 'kind', 'frame', 'at', 'colour'] };
  var MAX_OVERLAYS = 16, MAX_POINT_NUMBERS = 300000, MAX_ABS = 100000;
  function triple(v) { return (Array.isArray(v) || ArrayBuffer.isView(v)) && v.length === 3 && Array.prototype.every.call(v, function (n) { return typeof n === 'number' && isFinite(n) && Math.abs(n) <= MAX_ABS; }); }
  function checkOne(o, ids, budget) {
    if (!o || typeof o !== 'object') return 'field';
    if (typeof o.id !== 'string' || !/^[a-z0-9-]{1,32}$/.test(o.id) || ids[o.id]) return 'id';
    var allowed = FIELDS[o.kind]; if (!allowed) return 'kind';
    var extra = Object.keys(o).filter(function (k) { return allowed.indexOf(k) < 0 || typeof o[k] === 'function'; });
    if (extra.length) return 'field';
    if (o.kind !== 'program' && o.frame !== undefined && o.frame !== 'work' && o.frame !== 'machine') return 'frame';
    if (COLOURS.indexOf(o.colour) < 0) return 'colour';
    if (o.kind !== 'marker' && o.width !== undefined && o.width !== 'thin' && o.width !== 'thick') return 'width';
    if (o.kind === 'segments') {
      var p = o.points;
      if (!(Array.isArray(p) || p instanceof Float32Array) || !p.length || p.length % 6) return 'points';
      for (var i = 0; i < p.length; i++) if (typeof p[i] !== 'number' || !isFinite(p[i]) || Math.abs(p[i]) > MAX_ABS) return 'number';
      if (budget.points + p.length > MAX_POINT_NUMBERS) return 'limit';
      budget.points += p.length;
    }
    if (o.kind === 'box') { if (!triple(o.min) || !triple(o.max)) return 'number'; for (var a = 0; a < 3; a++) if (o.min[a] > o.max[a]) return 'number'; }
    if (o.kind === 'program' && !triple(o.translate)) return 'number';
    if (o.kind === 'marker' && !triple(o.at)) return 'number';
    return '';
  }
  function checkOverlays(list) {
    var accepted = [], refused = [], ids = {}, budget = { points: 0 };
    (Array.isArray(list) ? list : []).forEach(function (o) {
      var code = accepted.length >= MAX_OVERLAYS ? 'limit' : checkOne(o, ids, budget);
      if (code) refused.push({ id: o && typeof o.id === 'string' ? o.id : '', code: code, message: 'overlay refused: ' + code });
      else { ids[o.id] = true; accepted.push(o); }
    });
    return { accepted: accepted, refused: refused };
  }
  function open(meta, options) {
    options = options || {};
    var overlays = [], closed = false, follow = false;
    var handle = {
      setOverlays: function (list) { var r = checkOverlays(list); overlays = r.accepted; return { ok: !r.refused.length, accepted: r.accepted.map(function (o) { return o.id; }), refused: r.refused }; },
      follow: function (on) { if (typeof on === 'boolean' && options.live && options.live.tool) follow = on; return follow; },
      state: function () { return { closed: closed, gpu: true, software: false, geometry: 'simplified', live: { ackLine: 0, lastAckSegment: 0, pass: null, marker: { shown: false, stale: false, alarm: false, snapped: false, interpolating: false, ageMs: null, at: null }, follow: follow },
        overlays: overlays.map(function (o) { return { id: o.id, drawn: o.frame !== 'machine', reason: o.frame === 'machine' ? 'no-offset' : '' }; }) }; },
      stats: function () { return { frames: 0, gestureFrames: 0, lastPaintMs: 0, maxPaintMs: 0, uploads: 0, uploadBytes: 0, dpr: 1, canvas: { width: 0, height: 0 } }; },
      close: function (reason) { if (closed) return; closed = true; overlays = []; if (options.onClose) options.onClose(reason || 'user'); },
      dialog: null, canvas: null
    };
    if (options.overlays) handle.setOverlays(options.overlays);
    return handle;
  }
  var stub = { open: open, checkOverlays: checkOverlays, close: function () {}, active: function () { return false; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = stub; else if (!root.CNCPreviewGL) root.CNCPreviewGL = stub;
})(typeof window !== 'undefined' ? window : globalThis);`;
const stubContext = { Array, ArrayBuffer, Float32Array, Object, isFinite, Math };
stubContext.globalThis = stubContext; vm.createContext(stubContext); vm.runInContext(STUB, stubContext);
const stub = stubContext.CNCPreviewGL;

const box = (id, extra) => Object.assign({ id, kind: 'box', frame: 'machine', min: [-400, -300, -80], max: [0, 0, 0], colour: 'neutral', width: 'thin' }, extra || {});
// Through JSON: the stub runs in another realm (its arrays have another prototype).
const outcome = r => JSON.parse(JSON.stringify({ accepted: r.accepted.map(o => o.id), refused: r.refused.map(x => [x.id, x.code]) }));
const same = (list, label) => { const a = outcome(GL.checkOverlays(list)), b = outcome(stub.checkOverlays(list)); eq(a, b, label); return a; };

// ---- The reference cases of spec 8.10 ----
let r = same([box('travel')], 'machine box');
eq(r, { accepted: ['travel'], refused: [] });
r = same([{ id: 'c', kind: 'marker', frame: 'work', at: [0, 0, 0], colour: '#ff0000' }], 'free colour');
eq(r.refused, [['c', 'colour']]);
r = same([{ id: 'p', kind: 'segments', frame: 'work', points: [0, 0, 0, 1, 1, 1, 2, 2, 2], colour: 'ok', width: 'thick' }], 'points of length 9');
eq(r.refused, [['p', 'points']]);
r = same([{ id: 'n', kind: 'marker', frame: 'work', at: [0, NaN, 0], colour: 'info' }], 'NaN');
eq(r.refused, [['n', 'number']]);
r = same([{ id: 'g', kind: 'marker', frame: 'work', at: [0, 0, 0], colour: 'info', gcode: 'G0 X0' }], 'extra field');
eq(r.refused, [['g', 'field']]);
r = same([box('a'), box('a')], 'duplicate id');
eq(r, { accepted: ['a'], refused: [['a', 'id']] });
const seventeen = Array.from({ length: 17 }, (_, i) => box('b' + i));
r = same(seventeen, '17 overlays');
assert.equal(r.accepted.length, 16); eq(r.refused, [['b16', 'limit']]);
r = same([{ id: 'pr', kind: 'program', frame: 'machine', translate: [1, 2, 0], colour: 'info', width: 'thick' }], 'program with a frame');
eq(r.refused, [['pr', 'field']]);

// ---- More cases, same result as the stub ----
const more = [
  [{ id: 'Upper', kind: 'box', min: [0, 0, 0], max: [1, 1, 1], colour: 'ok' }],
  [{ id: 'x'.repeat(33), kind: 'box', min: [0, 0, 0], max: [1, 1, 1], colour: 'ok' }],
  [{ id: 'k', kind: 'circle', colour: 'ok' }],
  [{ id: 'f', kind: 'box', frame: 'tool', min: [0, 0, 0], max: [1, 1, 1], colour: 'ok' }],
  [{ id: 'w', kind: 'box', min: [0, 0, 0], max: [1, 1, 1], colour: 'ok', width: 'bold' }],
  [{ id: 'm', kind: 'box', min: [1, 0, 0], max: [0, 1, 1], colour: 'ok' }],
  [{ id: 'big', kind: 'marker', at: [0, 0, 100001], colour: 'warn' }],
  [{ id: 'fn', kind: 'marker', at: [0, 0, 0], colour: 'warn', frame: () => 'work' }],
  [{ id: 'mw', kind: 'marker', at: [0, 0, 0], colour: 'warn', width: 'thin' }],
  [{ id: 'f32', kind: 'segments', points: new Float32Array(12), colour: 'stock' }],
  [{ id: 'empty', kind: 'segments', points: [], colour: 'stock' }],
  [{ id: 'str', kind: 'segments', points: [0, 0, 0, 1, 1, '1'], colour: 'stock' }],
  [{ id: 'l1', kind: 'segments', points: new Float32Array(240000), colour: 'clamp' }, { id: 'l2', kind: 'segments', points: new Float32Array(60006), colour: 'clamp' }, { id: 'l3', kind: 'segments', points: new Float32Array(6), colour: 'clamp' }],
  [null, 'text', 42, { kind: 'box' }],
  [{ id: 'tr', kind: 'program', translate: [1, 2], colour: 'info' }],
  [{ id: 'ok-1', kind: 'program', translate: [-312.4, -250, 0], colour: 'info', width: 'thick' }, { id: 'origin', kind: 'marker', frame: 'work', at: [-312.4, -250, 12], colour: 'info' }]
];
more.forEach((list, i) => same(list, 'case ' + i));
eq(GL.checkOverlays('nope'), { accepted: [], refused: [] });
eq(Object.keys(GL.OVERLAY_COLOURS), ['info', 'ok', 'warn', 'danger', 'neutral', 'stock', 'clamp']);

// ---- In an open view (WebGL stub, GPU gate open) ----
const meta = (() => {
  const b = T3.createBuilder({ bounds: [0, 0, -2, 50, 30, 5] });
  b.move(0, 0, 5, 0, 0, 5, 0, 1); b.move(0, 0, 5, 0, 0, -1, 1, 2); b.move(0, 0, -1, 50, 0, -1, 1, 3); b.move(50, 0, -1, 50, 30, -1, 1, 4); b.move(50, 30, -1, 50, 30, 5, 0, 5);
  return { file: 'piece.nc', fingerprint: 'sha256:aa', path3d: b.finish(5), zBounds: [-1, 5] };
})();
function gpuPage(extra) {
  const page = createPage(Object.assign({ dpr: 2 }, extra || {}));
  page.win.cncGpu = { state: () => ({ checked: true, hardware: true, lost: false, renderer: 'stub', webgl2: true, antialias: true, lineWidth: [1, 7.4], maxTextureSize: 16384, reason: '' }) };
  return page;
}
let page = gpuPage();
let closes = [];
let view = page.win.CNCPreviewGL.open(meta, { container: page.doc.createElement('div'), overlays: [box('travel'), { id: 'origin', kind: 'marker', frame: 'work', at: [10, 10, 0], colour: 'info' }], onClose: x => closes.push(x) });
eq(view.state().overlays, [{ id: 'travel', drawn: false, reason: 'no-offset' }, { id: 'origin', drawn: true, reason: '' }], 'machine frame without live.tool: accepted, not drawn (no-offset)');
// Declarative: the list replaces the previous one; refusals reported, the accepted ones kept.
let res = view.setOverlays([box('travel'), { id: 'bad', kind: 'box', colour: '#123456', min: [0, 0, 0], max: [1, 1, 1] }]);
assert.equal(res.ok, false); eq(res.accepted, ['travel']); eq(res.refused.map(x => [x.id, x.code]), [['bad', 'colour']]);
eq(view.state().overlays.map(o => o.id), ['travel']);
// A caller changing its array afterwards does not change the stored overlay.
const mutable = { id: 'seg', kind: 'segments', frame: 'work', points: [0, 0, 0, 10, 0, 0], colour: 'ok', width: 'thick' };
view.setOverlays([mutable]); mutable.points[3] = 99;
assert.equal(view.setOverlays([]).ok, true); eq(view.state().overlays, []);
// follow() is a no-op without live.tool.
assert.equal(view.follow(true), false);
// stats() and the extended state.
const st = view.stats();
for (const k of ['frames', 'gestureFrames', 'lastPaintMs', 'maxPaintMs', 'uploads', 'uploadBytes', 'dpr']) assert.equal(typeof st[k], 'number', k);
eq(Object.keys(st.canvas), ['width', 'height']);
const s = view.state();
for (const k of ['gpu', 'software', 'dpr', 'antialias', 'lineWidth', 'geometry', 'segments', 'live', 'overlays']) assert(k in s, 'state.' + k);
assert.equal(s.geometry, 'simplified');
for (const k of ['ackLine', 'lastAckSegment', 'pass', 'marker', 'follow']) assert(k in s.live, 'state.live.' + k);
for (const k of ['shown', 'stale', 'alarm', 'snapped', 'interpolating', 'ageMs', 'at']) assert(k in s.live.marker, 'state.live.marker.' + k);
// Released with the view.
view.setOverlays([box('travel')]); view.close('screen');
eq(view.state().overlays, []); eq(closes, ['screen']);
assert.equal(page.listenerCount.value, 0, 'no listener left');

// Without the GPU gate (eco, software rendering): the options are ignored, the overlays are kept but never drawn.
page = createPage();
view = page.win.CNCPreviewGL.open(meta, { overlays: [{ id: 'origin', kind: 'marker', at: [0, 0, 0], colour: 'info' }], live: { tool: true }, pathStyle: 'ghost', fit: 'all' });
eq(view.state().overlays, [{ id: 'origin', drawn: false, reason: 'software' }]);
assert.equal(view.state().pathStyle, 'normal'); assert.equal(view.state().fit, 'path');
assert.equal(view.follow(true), false, 'no live view without the gate');
view.close('test');
// The gate closed by a lost context: same.
page = gpuPage(); page.win.cncGpu.state = () => ({ checked: true, hardware: true, lost: true, reason: 'context-lost' });
view = page.win.CNCPreviewGL.open(meta, { pathStyle: 'hidden' });
assert.equal(view.state().pathStyle, 'normal'); view.close('test');

// ---- Machine frame converted by o = mpos − wpos (live.tool), reasons, program without a buffer, release ----
{
  let now = 0;
  page = createPage({ dpr: 2, gpu: true, clock: () => now, setTimeout: () => 0, clearTimeout() {} });
  const report = extra => page.win.dispatch('cnc-job-status', { machine: Object.assign({ fresh: true, name: 'piece.nc', workflow: 'idle', activeState: 'Idle',
    operator: { reportUnits: 'mm', wcs: 'G54' }, coordinates: { wpos: { x: '10', y: '20', z: '5' }, mpos: { x: '-290', y: '-180', z: '-45' } } }, extra || {}) });
  view = page.win.CNCPreviewGL.open(meta, { container: page.doc.createElement('div'), live: { tool: true }, pathStyle: 'ghost', fit: 'all',
    overlays: [box('travel'), { id: 'placed', kind: 'program', translate: [5, 5, 0], colour: 'info', width: 'thick' }, { id: 'origin', kind: 'marker', frame: 'work', at: [10, 20, 0], colour: 'info' }] });
  const g = view.canvas.glStub.log;
  page.runFrames(1);
  eq(view.state().overlays.map(o => [o.id, o.drawn, o.reason]), [['travel', false, 'no-offset'], ['placed', true, ''], ['origin', true, '']], 'no report yet: no offset');
  report(); page.runFrames(2);
  eq(view.state().overlays[0], { id: 'travel', drawn: true, reason: '' }, 'offset known: drawn');
  let calls = g.calls.filter(c => c.frame === g.frames);
  // o = mpos − wpos = (-300, -200, -50): a machine box is drawn shifted by -o.
  const travelCall = calls.find(c => c.count === 24 && c.solid && Math.abs(c.solid[0] - 0xaa / 255) < 1e-6);
  eq(travelCall.shift, [300, 200, 50], 'machine frame: work = machine − o'); assert.equal(travelCall.width, 2, 'thin: 1 px × DPR 2');
  const programCall = calls.find(c => c.solid && Math.abs(c.solid[0] - 0x7c / 255) < 1e-6 && c.count === view.state().segments * 2);
  eq(programCall.shift, [5, 5, 0], 'program: the path buffer with a translation'); assert.equal(programCall.width, 4, 'thick: 2 px × DPR 2');
  assert(calls.some(c => c.solid && Math.abs(c.solid[0] - 0x87 / 255) < 1e-6 && c.width === 2), 'ghost path: grey, 1 px');
  const markerCall = calls.find(c => c.count === 6 && c.depth === false);
  assert(markerCall && markerCall.scale[0] > 0, 'marker: fixed-size triad over everything');
  // A new translation, the same box again: no buffer sent.
  const uploads = view.stats().uploads;
  view.setOverlays([box('travel'), { id: 'placed', kind: 'program', translate: [-312.4, -250, 0], colour: 'info', width: 'thick' }]); page.runFrames(3);
  assert.equal(view.stats().uploads, uploads, 'program moved and box unchanged: no upload');
  eq(g.calls.filter(c => c.frame === g.frames).find(c => c.solid && Math.abs(c.solid[0] - 0x7c / 255) < 1e-6 && c.count === view.state().segments * 2).shift, [-312.4, -250, 0]);
  // A changed box: one buffer (the old one freed).
  const deleted = g.deleted.buffer;
  view.setOverlays([box('travel', { max: [0, 0, 10] })]); page.runFrames(4);
  assert.equal(view.stats().uploads, uploads + 1); assert.equal(g.deleted.buffer, deleted + 1);
  // The stored overlay is a private copy: the caller changing its array afterwards changes nothing.
  const seg = { id: 'seg', kind: 'segments', frame: 'work', points: [0, 0, 0, 10, 0, 0], colour: 'ok', width: 'thick' };
  view.setOverlays([box('travel', { max: [0, 0, 10] }), seg]); page.runFrames(6); const sent = view.stats().uploads;
  seg.points[3] = 99; view.setOverlays([box('travel', { max: [0, 0, 10] }), { id: 'seg', kind: 'segments', frame: 'work', points: [0, 0, 0, 10, 0, 0], colour: 'ok', width: 'thick' }]); page.runFrames(7);
  assert.equal(view.stats().uploads, sent, 'same values as the stored copy: kept, no upload');
  // Stale (2.5 s without a fresh report), units, work frame: accepted, not drawn, with the reason; back when known.
  now = 3000; assert.equal(view.state().overlays[0].reason, 'stale');
  report({ operator: { reportUnits: 'in', wcs: 'G54' } }); assert.equal(view.state().overlays[0].reason, 'units');
  report({ operator: { reportUnits: 'mm', wcs: 'G55' } }); assert.equal(view.state().overlays[0].reason, 'wcs');
  report({ coordinates: { wpos: { x: '1', y: '2', z: '3' } } }); assert.equal(view.state().overlays[0].reason, 'no-offset');
  report(); assert.equal(view.state().overlays[0].reason, ''); page.runFrames(5);
  // fit: 'all' includes the drawn overlays: Recentrer shows the travel box too.
  const zoomPath = view.state().camera.zoom;
  view.dialog.children.find(c => /pgl-tools/.test(c.className)).children.find(c => c.className === 'pgl-recentre').click();
  assert(view.state().camera.zoom < zoomPath * 0.5, 'Recentrer with fit all: the 400 mm travel box fits');
  // Released with the view.
  view.close('screen');
  assert.equal(g.deleted.buffer, g.created.buffer, 'every buffer freed'); eq(view.state().overlays, []); assert.equal(page.listenerCount.value, 0);
}

console.log('PASS overlays: the spec 8.10 reference cases and ' + more.length + ' more give the stub\'s result; named colours only; setOverlays declarative with refusals, private copies; machine frame converted by o = mpos − wpos, not drawn when no-offset / stale / units / wcs; program as a translation of the path buffer (no upload), unchanged overlay kept; fit all; ignored without the GPU gate; released with the view.');
