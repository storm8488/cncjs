'use strict';
// Visual origin in Préparer (Performance UI, lot O; PERFORMANCE-UI-SPEC.md §7, §8.7, §8.8, §11):
// travel-check.js's data exposure (travelBox, place = check on the shifted state), the overlays and
// texts of origin-preview.js for a given state, its card lifecycle and release, the loading
// conditions in job-preparation.js, and the proof that nothing is sent or clicked. Runs against the
// stubs of the spec (§8.10) pasted below: no real preview-gl.js, no network, no machine.
const assert = require('assert').strict, fs = require('fs'), path = require('path'), vm = require('vm');
const dir = path.join(__dirname, 'touch'), read = f => fs.readFileSync(path.join(dir, f), 'utf8');
const TC = require('./touch/travel-check');
// Values from the vm realm have other prototypes: compared as plain data.
const plain = v => (v === undefined ? v : JSON.parse(JSON.stringify(v))), eq = (a, b, m) => assert.deepEqual(plain(a), plain(b), m);

// ---------- 1. travel-check.js: travelBox and place ----------
const machine = (mx, my, wx, wy, extra = {}, more = {}) => ({ fresh: true, activeState: 'Idle', workflow: 'idle', name: 'a.nc', originalName: 'Pièce A.nc', revision: 1,
  operator: { wcs: 'G54', reportUnits: 'mm' }, settings: { $22: '1', $23: '0', $130: '400.000', $131: '300.000', $132: '80.000', ...extra },
  coordinates: { mpos: { x: String(mx), y: String(my), z: '-5' }, wpos: { x: String(wx), y: String(wy), z: '2' } }, ...more });
const preview = (b, extra = {}) => ({ file: 'a.nc', fingerprint: 'sha256:aa', path3d: 'P', zBounds: [-12, 5], projection: { version: 1, units: 'mm', wcs: 'G54', bounds: b, ...extra } });
{
  let b = TC.travelBox(machine(0, 0, 0, 0));
  eq(b, { known: true, min: [-400, -300, -80], max: [0, 0, 0], zKnown: true, reason: '' });
  b = TC.travelBox(machine(0, 0, 0, 0, { $23: '3' }));
  eq(b.known, false, '$23 bits 0 and 1: the travel depends on the firmware build, not drawn');
  b = TC.travelBox(machine(0, 0, 0, 0, { $23: '4' }));
  eq([b.known, b.zKnown, b.min[0], b.max[0]], [true, false, -400, 0], '$23 bit 2: X and Y drawn, Z not');
  b = TC.travelBox(machine(0, 0, 0, 0, { $132: undefined }));
  assert(b.known && !b.zKnown); eq([b.min[2], b.max[2]], [0, 0]);
  b = TC.travelBox(machine(0, 0, 0, 0, { $22: '0' })); assert(!b.known); assert.match(b.reason, /\$22/);
  b = TC.travelBox(machine(0, 0, 0, 0, { $131: '' })); assert(!b.known); assert.match(b.reason, /\$131/);
  assert(!TC.travelBox(null).known);
  // place() = check() on a copy where wpos.x = wpos.y = 0, for every kind of state; the input is not changed.
  const shifted = m => ({ ...m, coordinates: { ...m.coordinates, wpos: { ...m.coordinates.wpos, x: 0, y: 0 } } });
  const cases = [
    [preview([0, 0, 60, 70]), machine(-350, -250, 12, 30)],
    [preview([0, 0, 60, 70]), machine(-30, -250, -100, 4)],
    [preview([-80, 0, 10, 10]), machine(-350, -250, 0, 0)],
    [preview([0, 0, 60, 70]), machine(30, -250, 1, 1, { $23: '1' })],
    [preview([0, 0, 60, 70]), machine(-350, -250, 0, 0, { $22: '0' })],
    [preview([0, 0, 60, 70]), { ...machine(-350, -250, 0, 0), operator: { wcs: 'G54', reportUnits: 'in' } }],
    [preview([0, 0, 60, 70], { relativeStart: true }), machine(-350, -250, 0, 0)],
    [preview([0, 0, 60, 70], { programWcs: 'G55' }), machine(-350, -250, 0, 0)],
    [null, machine(-350, -250, 0, 0)],
    [preview([0, 0, 60, 70]), { ...machine(-350, -250, 0, 0), coordinates: { mpos: {}, wpos: {} } }]
  ];
  for (const [p, m] of cases) {
    const before = JSON.stringify(m);
    eq(TC.place(p, m, { axes: 'xy' }), TC.check(p, shifted(m)));
    assert.equal(JSON.stringify(m), before, 'place() does not change the state it is given');
  }
  assert.equal(TC.place(preview([0, 0, 60, 70]), machine(-350, -250, 99, 99)).state, 'ok');
  assert.equal(TC.check(preview([0, 0, 60, 70]), machine(-350, -250, 99, 99)).state, 'outside', 'the current origin may be outside while the new one is inside');
}

// ---------- 2. A small page: DOM, window, stubs of the spec ----------
function page(options = {}) {
  let rafId = 0;
  const raf = new Map(), requests = [], clicks = [];
  class Text { constructor(v) { this.nodeType = 3; this.textContent = String(v); this.parentNode = null; } }
  class El {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.parentNode = null; this.attributes = {}; this.listeners = {}; this._text = ''; this.hidden = false; this.id = ''; this.className = '';
      const self = this, names = () => self.className.split(/\s+/).filter(Boolean);
      this.classList = { contains: n => names().includes(n), add: n => { if (!names().includes(n)) self.className = names().concat(n).join(' '); },
        remove: n => { self.className = names().filter(x => x !== n).join(' '); }, toggle: (n, on) => { if (on === undefined) on = !names().includes(n); on ? self.classList.add(n) : self.classList.remove(n); return on; } }; }
    get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
    set textContent(v) { this._text = String(v); this.children.forEach(c => { c.parentNode = null; }); this.children = []; }
    appendChild(c) { return this.insertBefore(c, null); }
    insertBefore(c, ref) { if (c.parentNode) c.parentNode.removeChild(c); const i = ref ? this.children.indexOf(ref) : -1; this.children.splice(i < 0 ? this.children.length : i, 0, c); c.parentNode = this; return c; }
    removeChild(c) { const i = this.children.indexOf(c); assert(i >= 0); this.children.splice(i, 1); c.parentNode = null; return c; }
    setAttribute(k, v) { this.attributes[k] = String(v); } getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; }
    addEventListener(n, f) { (this.listeners[n] = this.listeners[n] || []).push(f); }
    removeEventListener(n, f) { const l = this.listeners[n] || []; const i = l.indexOf(f); if (i >= 0) l.splice(i, 1); }
    click() { clicks.push(this.id || this.className); (this.listeners.click || []).slice().forEach(f => f({ type: 'click' })); }
    all() { return this.children.filter(c => c instanceof El).flatMap(c => [c, ...c.all()]); }
  }
  const html = new El('html'), head = html.appendChild(new El('head')), body = html.appendChild(new El('body'));
  const document = { head, body, currentScript: null, createElement: t => new El(t), createTextNode: v => new Text(v),
    getElementById: id => html.all().find(e => e.id === id) || null,
    querySelector: sel => sel[0] === '.' ? html.all().find(e => e.classList.contains(sel.slice(1))) || null : null };
  const screen = body.appendChild(new El('section')); screen.id = 'screen-jog'; screen.className = 'screen' + (options.active === false ? '' : ' active');
  // Jog controls of Préparer: the test proves none of them is ever clicked.
  for (const id of ['jog-x-plus', 'jog-x-minus', 'zero-x', 'zero-y', 'zero-xyz']) { const b = screen.appendChild(new El('button')); b.id = id; b.addEventListener('click', () => clicks.push('handler:' + id)); }
  const win = { document, console, Promise, JSON, Math, Object, Array, String, Number, Date, Error, ArrayBuffer, Float32Array, Set, Map, isFinite, setTimeout, clearTimeout,
    listeners: {}, addEventListener(n, f) { (this.listeners[n] = this.listeners[n] || []).push(f); },
    removeEventListener(n, f) { const l = this.listeners[n] || []; const i = l.indexOf(f); if (i >= 0) l.splice(i, 1); },
    dispatchEvent(e) { (this.listeners[e.type] || []).slice().forEach(f => f(e)); return true; },
    requestAnimationFrame(fn) { raf.set(++rafId, fn); return rafId; }, cancelAnimationFrame(id) { raf.delete(id); },
    fetch(url) { requests.push(['fetch', String(url)]); return new Promise(() => {}); },
    XMLHttpRequest: function () { this.open = (m, u) => requests.push(['xhr', m + ' ' + u]); this.send = () => {}; this.setRequestHeader = () => {}; } };
  win.window = win;
  win.CustomEvent = function (type, init) { this.type = type; this.detail = init && init.detail; };
  win.cncI18n = { t: s => s, message: s => s };
  let performance = options.performance || 'performance', kind = options.kind === undefined ? 'cnc' : options.kind;
  const loads = [];
  win.cncProfile = { performance: () => performance, kind: () => kind,
    loadAdvanced(files) { loads.push(files); if (performance !== 'performance') return Promise.reject(new Error('Profil Éco')); if (options.onLoad) options.onLoad(win, files); return Promise.resolve(files); },
    _set(p, k) { performance = p; if (k !== undefined) kind = k; win.dispatchEvent(new win.CustomEvent('cnc-profile-change', { detail: { performance, kind } })); } };
  win.cncState = { get: () => ({ machine: options.machine || null }) };
  vm.createContext(win);
  const run = (code, name) => vm.runInContext(code, win, { filename: name });
  const flush = async () => { for (let k = 0; k < 6; k++) { await new Promise(r => setImmediate(r)); const q = [...raf.values()]; raf.clear(); q.forEach(f => f(0)); } };
  return { win, document, body, screen, run, flush, raf, requests, clicks, loads, El };
}

/* Stub of the GPU gate (lot V, spec 8.1). Test use only: never ship it.
 * _set() is a test helper and is not part of the real API. */
const STUB_GPU = String.raw`(function (root) {
  'use strict';
  if (root.cncGpu) return;
  var probe = { checked: true, hardware: true, lost: false, renderer: 'stub', webgl2: true, antialias: true,
    lineWidth: [1, 7.4], maxTextureSize: 16384, reason: '' };
  function performance() { try { return !!root.cncProfile && root.cncProfile.performance() === 'performance'; } catch (_) { return false; } }
  function state() {
    var s = {}; Object.keys(probe).forEach(function (k) { s[k] = Array.isArray(probe[k]) ? probe[k].slice() : probe[k]; });
    if (!performance()) { s.hardware = false; s.reason = 'eco'; } else if (s.lost) s.reason = 'context-lost';
    return s;
  }
  function apply() {
    var s = state(), list = root.document && root.document.body && root.document.body.classList;
    if (list) { list.toggle('perf-gpu', s.hardware); list.toggle('perf-gpu-lost', s.hardware && s.lost); }
    try { root.dispatchEvent(new root.CustomEvent('cnc-gpu-change', { detail: s })); } catch (_) {}
  }
  root.cncGpu = {
    state: state,
    ready: function () { return Promise.resolve(state()); },
    _set: function (patch) { Object.keys(patch).forEach(function (k) { probe[k] = patch[k]; }); apply(); }
  };
  root.addEventListener('cnc-profile-change', apply);
  apply();
})(typeof window !== 'undefined' ? window : globalThis);`;
/* Stub of the overlay API of CNCPreviewGL (lot V, spec 8.2-8.3). Test use only.
 * checkOverlays() applies the spec's rules; V's real implementation must give the same
 * accepted/refused result for the same input. open() draws nothing: it records the overlays. */
const STUB_GL = String.raw`(function (root) {
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
/* Stubs of D's layout gate and loaded-preview accessor, and of V's CNCToolPosition (spec 8.4, 8.6, 8.9).
 * Test use only. acknowledged() is a copy of tool-position.js's rule. */
const STUB_D = String.raw`(function (root) {
  'use strict';
  var wide = true;
  root.cncLayout = root.cncLayout || { wide: function () { return wide; },
    _set: function (on) { wide = !!on; root.document.body.classList.toggle('perf-wide', wide); root.dispatchEvent(new root.CustomEvent('cnc-layout-change', { detail: { wide: wide } })); } };
  var preview = null;
  root.cncDashboardView = root.cncDashboardView || {};
  if (!root.cncDashboardView.loadedPreview) {
    root.cncDashboardView.loadedPreview = function () { return Promise.resolve(preview); };
    root.cncDashboardView._setPreview = function (meta) { preview = meta || null; };
  }
  root.CNCToolPosition = root.CNCToolPosition || {
    acknowledged: function (s, totalLines) {
      if ((s.finished === true || s.finishedWithErrors === true) && s.workflow === 'idle') return totalLines;
      var r = s.resume;
      if (r && typeof r.from === 'number' && typeof r.preambleLength === 'number') return Math.min(totalLines, Math.max(0, r.from - 1 + Math.max(0, s.received - r.preambleLength)));
      return Math.min(totalLines, Math.max(0, s.received / s.total * totalLines));
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);`;

// The page with the stubs, travel-check.js, program-check-view.js and origin-preview.js, plus spies on the view.
function originPage(options = {}) {
  const p = page(options), w = p.win;
  p.run(STUB_GPU, 'stub-gpu.js'); p.run(STUB_GL, 'stub-gl.js'); p.run(STUB_D, 'stub-d.js');
  ['travel-check.js', 'program-check-view.js'].forEach(f => p.run(read(f), f));
  p.document.currentScript = { src: 'origin-preview.js?v=prof15' };
  p.run(read('origin-preview.js'), 'origin-preview.js');
  p.document.currentScript = null;
  const opened = [], sets = [], open = w.CNCPreviewGL.open;
  w.CNCPreviewGL.open = function (meta, opts) {
    const hiddenAtOpen = !!(opts && opts.container && opts.container.hidden);
    const h = open(meta, opts), set = h.setOverlays; opened.push({ meta, opts, handle: h, hiddenAtOpen });
    h.setOverlays = list => { sets.push(list); return set(list); }; return h;
  };
  return Object.assign(p, { opened, sets, status: (machine, extra = {}) => w.dispatchEvent(new w.CustomEvent('cnc-job-status', { detail: { machine, simulation: false, ...extra } })) });
}
const card = p => p.document.getElementById('op-card');
const nodeOf = (p, cls) => card(p).all().find(e => e.classList.contains(cls));
const shown = (p, cls) => { const n = nodeOf(p, cls); return n.hidden ? '' : n.textContent; };

module.exports = { originPage, machine, preview, plain, eq, card, nodeOf, shown };
if (require.main === module) (async () => {
  // ---------- 3. Model: overlays and texts for a given state ----------
  {
    const p = originPage(), O = p.win.CNCOriginPreview;
    eq(Object.keys(O).sort(), ['comparison', 'hint', 'model', 'mount', 'unmount']);
    const meta = preview([0, 0, 60, 70]);
    // Tool at machine (-350, -250), current work position (12, 30): origin set here = program translated by (12, 30, 0).
    let r = O.model(machine(-350, -250, 12, 30), meta, { x: 100, y: 80, z: 15 });
    assert.equal(r.verdict.state, 'ok');
    eq(JSON.parse(JSON.stringify(r.overlays)), [
      { id: 'travel', kind: 'box', frame: 'machine', min: [-400, -300, -80], max: [0, 0, 0], colour: 'neutral', width: 'thin' },
      { id: 'placed', kind: 'program', translate: [12, 30, 0], colour: 'info', width: 'thick' },
      { id: 'outline', kind: 'box', frame: 'work', min: [12, 30, -12], max: [72, 100, 5], colour: 'ok', width: 'thick' },
      { id: 'stock', kind: 'box', frame: 'work', min: [12, 30, -15], max: [112, 110, 0], colour: 'stock', width: 'thin' },
      { id: 'origin', kind: 'marker', frame: 'work', at: [12, 30, 0], colour: 'info' }]);
    eq(p.win.CNCPreviewGL.checkOverlays(r.overlays).refused, [], 'every overlay passes the spec rules');
    assert.equal(r.verdict.text, 'Si l’origine X Y est posée ici : dans la course machine en X et Y (estimation de la tablette ; Z non vérifié).');
    // Outside: the outline is danger, the text in travel-check.js's format, only the axis that is outside.
    r = O.model(machine(-30, -250, 0, 0), meta, null);
    assert.equal(r.overlays.find(o => o.id === 'outline').colour, 'danger');
    assert.equal(r.verdict.text, 'Si l’origine X Y est posée ici : hors course en X -30,0 → 30,0 mm (course -400,0 → 0,0).');
    assert(!r.overlays.some(o => o.id === 'stock'), 'no stock box without a project stock');
    // An axis homing the other way ($23): the travel depends on the firmware build, so neither the box nor a verdict.
    r = O.model(machine(30, -250, 0, 0, { $23: '1' }), meta, null);
    assert(!r.overlays.some(o => o.id === 'travel'), 'no travel box'); assert.equal(r.verdict.state, 'unknown');
    assert.equal(r.overlays.find(o => o.id === 'outline').colour, 'neutral');
    // Unknown (homing off): neutral outline, never green, the reason of travel-check.js; no travel box.
    r = O.model(machine(-350, -250, 0, 0, { $22: '0' }), meta, null);
    assert.equal(r.overlays.find(o => o.id === 'outline').colour, 'neutral'); assert(!r.overlays.some(o => o.id === 'travel'));
    assert.equal(r.verdict.text, 'Course non vérifiable : prise d’origine désactivée ($22), les coordonnées machine ne sont pas repérées.');
    for (const [m, pv] of [[machine(-350, -250, 0, 0), preview([0, 0, 60, 70], { relativeStart: true })], [machine(-350, -250, 0, 0, { $131: '' }), meta]]) {
      r = O.model(m, pv, null); assert.equal(r.verdict.state, 'unknown'); assert.equal(r.verdict.tone, 'neutral'); assert.match(r.verdict.text, /^Course non vérifiable : /);
    }
    // Inches: no placement drawn (the work position is not in mm), verdict unknown.
    r = O.model({ ...machine(-350, -250, 0, 0), operator: { wcs: 'G54', reportUnits: 'in' } }, meta, null);
    eq(r.overlays, []); assert.match(r.verdict.text, /pouces/);
    // The current origin: the server's pre-check when present, else check().
    r = O.model(machine(-350, -250, 99, 99), meta, null);
    assert.equal(r.current.tone, 'danger'); assert.match(r.current.text, /^Origine actuelle : Hors course machine : X/);
    r = O.model(machine(-350, -250, 0, 0, {}, { programCheck: { verdict: 'validated', axes: { X: { verdict: 'validated' }, Y: { verdict: 'validated' }, Z: { verdict: 'validated' } } } }), meta, null);
    assert.equal(r.current.tone, 'ok'); assert.match(r.current.text, /^Origine actuelle : Contrôle des courses/);
    // Nothing placed outside the idle state.
    for (const m of [null, { ...machine(0, 0, 0, 0), fresh: false }, { ...machine(0, 0, 0, 0), workflow: 'running' }, { ...machine(0, 0, 0, 0), activeState: 'Alarm' }, { ...machine(0, 0, 0, 0), name: '' }])
      eq(O.model(m, meta, null).overlays, []);
    // hint(): the verdict in the wide layout, CNC, idle; '' otherwise.
    assert.equal(O.hint(machine(-350, -250, 12, 30), meta), 'Si l’origine X Y est posée ici : dans la course machine en X et Y (estimation de la tablette ; Z non vérifié).');
    assert.equal(O.hint(machine(-350, -250, 12, 30), null), '');
    assert.equal(O.hint({ ...machine(-350, -250, 12, 30), workflow: 'running' }, meta), '');
    assert.equal(O.hint({ ...machine(-350, -250, 12, 30), machineProfile: { kind: 'laser' } }, meta), '');
    p.win.cncLayout._set(false); assert.equal(O.hint(machine(-350, -250, 12, 30), meta), ''); p.win.cncLayout._set(true);
  }

  // ---------- 4. Card lifecycle, frames, states, release ----------
  {
    const p = originPage(), w = p.win, O = w.CNCOriginPreview, meta = preview([0, 0, 60, 70]);
    w.cncDashboardView._setPreview(meta);
    const before = Object.fromEntries(Object.entries(w.listeners).filter(([, v]) => v.length).map(([k, v]) => [k, v.length]));
    O.mount(p.screen);
    assert.equal(p.screen.children.at(-1), card(p), '#op-card is the last child of #screen-jog');
    assert.equal(card(p).className, 'card op-card'); assert(p.body.classList.contains('perf-origin'));
    const link = p.document.head.children.find(e => e.id === 'op-style');
    assert.equal(link.href, 'origin-preview.css?v=prof15', 'stylesheet with the ?v= of its own script');
    O.mount(p.screen); assert.equal(p.screen.children.filter(e => e.id === 'op-card').length, 1, 'mounted once');
    assert.match(card(p).textContent, /Où le programme se placera/);
    assert.equal(shown(p, 'op-only'), 'Affichage seulement : rien n’est envoyé, aucune origine n’est posée.');
    // The status handler only stores and asks for a frame: nothing opened or set before the frame.
    p.status(machine(-350, -250, 12, 30));
    assert.equal(p.opened.length, 0); assert.equal(p.raf.size, 1);
    p.status(machine(-350, -250, 12, 30)); assert.equal(p.raf.size, 1, 'at most one frame pending');
    await p.flush();
    assert.equal(p.opened.length, 1);
    const o = p.opened[0];
    assert.equal(o.meta, meta); assert.equal(o.opts.container, nodeOf(p, 'op-view'));
    // Bug hunt C-3: the frame is shown before the view is opened in it, so the view measures its real size (not 1 x 1 px).
    assert.equal(o.hiddenAtOpen, false, 'view opened in a hidden frame');
    eq(o.opts.live, { tool: true }); assert.equal(o.opts.pathStyle, 'ghost'); assert.equal(o.opts.fit, 'all');
    eq(o.opts.overlays.find(x => x.id === 'placed').translate, [12, 30, 0]);
    assert(!nodeOf(p, 'op-view').hidden); assert(!nodeOf(p, 'op-legend').hidden);
    assert.match(nodeOf(p, 'op-legend').textContent, /Gris : origine actuelle \(G54\)Bleu : si l’origine X Y est posée iciCadre : course machine \(\$130–\$132\)/);
    assert.equal(shown(p, 'op-verdict'), 'Si l’origine X Y est posée ici : dans la course machine en X et Y (estimation de la tablette ; Z non vérifié).');
    assert.equal(nodeOf(p, 'op-verdict').getAttribute('data-tone'), 'ok');
    assert.match(shown(p, 'op-current'), /^Origine actuelle : /); assert.equal(shown(p, 'op-file'), 'Pièce A.nc');
    // The tool moves: new translation in the next frame, not in the handler; the same view.
    p.status(machine(-300, -250, 62, 30)); assert.equal(p.sets.length, 0);
    await p.flush(); assert.equal(p.opened.length, 1); assert.equal(p.sets.length, 1);
    eq(p.sets[0].find(x => x.id === 'placed').translate, [62, 30, 0]);
    p.status(machine(-300, -250, 62, 30, {}, { observed: 1 })); await p.flush(); assert.equal(p.sets.length, 1, 'unchanged overlays are not set again');
    // Moved past the end of X: danger.
    p.status(machine(-20, -250, 342, 30)); await p.flush();
    assert.equal(p.sets.at(-1).find(x => x.id === 'outline').colour, 'danger'); assert.equal(nodeOf(p, 'op-verdict').getAttribute('data-tone'), 'danger');
    assert.match(shown(p, 'op-verdict'), /hors course en X -20,0 → 40,0 mm/);
    // State unavailable: frozen and greyed, the same view, verdict hidden.
    const last = p.sets.at(-1);
    p.status({ ...machine(-20, -250, 342, 30), fresh: false }); await p.flush();
    const grey = p.sets.at(-1);
    eq(grey.map(x => x.id), last.map(x => x.id)); eq(grey.find(x => x.id === 'placed').translate, last.find(x => x.id === 'placed').translate);
    assert(['placed', 'outline', 'origin'].every(id => grey.find(x => x.id === id).colour === 'neutral'));
    assert.equal(shown(p, 'op-state'), 'État machine indisponible : aperçu figé.'); assert.equal(shown(p, 'op-verdict'), '');
    assert(!o.handle.state().closed);
    // Job running, paused, alarm: view closed, the texts of §2.4, nothing read.
    for (const [m, text] of [[{ ...machine(0, 0, 0, 0), workflow: 'running', activeState: 'Run' }, 'Travail en cours : aperçu d’origine suspendu.'],
      [{ ...machine(0, 0, 0, 0), workflow: 'paused', activeState: 'Hold:0' }, 'Travail en pause : aperçu d’origine suspendu.'],
      [{ ...machine(0, 0, 0, 0), activeState: 'Alarm' }, 'Alarme : position machine non garantie, aperçu d’origine suspendu.']]) {
      p.status(m); await p.flush();
      assert.equal(shown(p, 'op-state'), text); assert(nodeOf(p, 'op-view').hidden); assert.equal(shown(p, 'op-verdict'), '');
      assert(p.opened.every(x => x.handle.state().closed), 'no view open during ' + text);
    }
    // Back to idle: the view opens again (same program, no new preview read needed).
    const reads = []; const lp = w.cncDashboardView.loadedPreview; w.cncDashboardView.loadedPreview = () => { reads.push(1); return lp(); };
    p.status(machine(-350, -250, 0, 0)); await p.flush();
    assert.equal(p.opened.length, 2); assert(!p.opened[1].handle.state().closed); assert.equal(reads.length, 0);
    // Another program: preview read again.
    p.status({ ...machine(-350, -250, 0, 0), name: 'b.nc' }); await p.flush();
    assert.equal(reads.length, 1); assert.equal(shown(p, 'op-state'), 'Aperçu sans parcours 3D : régénérez-le dans Fichiers.', 'the preview of a.nc is not used for b.nc');
    assert(p.opened[1].handle.state().closed);
    // Nothing loaded.
    p.status({ ...machine(-350, -250, 0, 0), name: '' }); await p.flush();
    assert.equal(shown(p, 'op-state'), 'Aucun programme chargé : rien à placer.'); assert(nodeOf(p, 'op-view').hidden);
    // A preview without a 3D path: the text, the verdict, no view.
    w.cncDashboardView._setPreview({ ...meta, path3d: null });
    p.status(machine(-350, -250, 0, 0)); await p.flush();
    assert.equal(shown(p, 'op-state'), 'Aperçu sans parcours 3D : régénérez-le dans Fichiers.'); assert(nodeOf(p, 'op-view').hidden); assert.match(shown(p, 'op-verdict'), /dans la course/);
    // The preview regenerated: read again on cnc-library-preview-updated, the view opens.
    w.cncDashboardView._setPreview(meta); w.dispatchEvent(new w.CustomEvent('cnc-library-preview-updated', {})); await p.flush();
    assert.equal(p.opened.length, 3); assert.equal(shown(p, 'op-state'), '');
    // Lost GPU context: the view closes, only the « indisponible » text.
    w.cncGpu._set({ lost: true }); await p.flush();
    assert(p.opened[2].handle.state().closed);
    assert.equal(shown(p, 'op-state'), 'Vue 3D indisponible : contexte WebGL perdu. Le contrôle de course reste au chargement et au démarrage.');
    assert.equal(shown(p, 'op-verdict'), ''); assert.equal(shown(p, 'op-current'), ''); assert(nodeOf(p, 'op-legend').hidden); assert(nodeOf(p, 'op-view').hidden);
    // Release: card, class, listeners, view, pending frame.
    p.status(machine(-350, -250, 1, 1)); assert.equal(p.raf.size, 1);
    O.unmount();
    assert.equal(card(p), null); assert(!p.body.classList.contains('perf-origin')); assert.equal(p.raf.size, 0, 'pending frame cancelled');
    eq(Object.fromEntries(Object.entries(w.listeners).filter(([, v]) => v.length).map(([k, v]) => [k, v.length])), before, 'every listener removed');
    const count = p.opened.length; p.status(machine(-350, -250, 2, 2)); await p.flush(); assert.equal(p.opened.length, count); assert.equal(p.raf.size, 0);
    O.unmount();
    // Remount after unmount: a fresh card.
    w.cncGpu._set({ lost: false }); O.mount(p.screen); p.status(machine(-350, -250, 0, 0)); await p.flush();
    assert(card(p)); assert.equal(p.opened.length, count + 1); O.unmount(); assert(p.opened.at(-1).handle.state().closed, 'unmount closes the view');
    // Nothing sent, nothing clicked, during all of it.
    eq(p.requests, []); eq(p.clicks, []);
  }

  // ---------- 5. Missing APIs: « Vue 3D indisponible » and nothing else ----------
  for (const remove of [w => { delete w.CNCPreviewGL; }, w => { w.CNCPreviewGL = { open: w.CNCPreviewGL.open, close() {}, active: () => false }; }, w => { delete w.cncDashboardView; }]) {
    const p = originPage(); remove(p.win); p.win.cncDashboardView && p.win.cncDashboardView._setPreview(preview([0, 0, 60, 70]));
    p.win.CNCOriginPreview.mount(p.screen); p.status(machine(-350, -250, 0, 0)); await p.flush();
    assert.equal(shown(p, 'op-state'), 'Vue 3D indisponible : module absent. Le contrôle de course reste au chargement et au démarrage.');
    assert.equal(shown(p, 'op-verdict'), ''); assert(nodeOf(p, 'op-legend').hidden); assert.equal(p.opened.length, 0);
    p.win.CNCOriginPreview.unmount(); eq(p.requests, []);
  }
  // A view that falls back (no WebGL) says why, once.
  {
    const p = originPage(); p.win.cncDashboardView._setPreview(preview([0, 0, 60, 70]));
    p.win.CNCPreviewGL.open = (meta, opts) => { opts.onFallback('WebGL indisponible sur cette tablette.'); return null; };
    p.win.CNCOriginPreview.mount(p.screen); p.status(machine(-350, -250, 0, 0)); await p.flush();
    assert.equal(shown(p, 'op-state'), 'Vue 3D indisponible : WebGL indisponible sur cette tablette. Le contrôle de course reste au chargement et au démarrage.');
    p.win.CNCOriginPreview.unmount();
  }

  // ---------- 6. job-preparation.js: loading and unmounting conditions, hint line ----------
  async function preparation(options = {}) {
    const mounts = [];
    const p = page({ ...options, onLoad: (w, files) => { if (files.includes('origin-preview.js') && !w.CNCOriginPreview) w.CNCOriginPreview = { mount: s => mounts.push(['mount', s.id]), unmount: () => mounts.push(['unmount']), hint: () => 'Si l’origine X Y est posée ici : hors course en X.' }; } });
    const w = p.win, tools = p.body.appendChild(new p.El('div')); tools.className = 'ks-file-tools';
    const content = new p.El('div');
    p.body.getAttribute = k => (k === 'data-simulation' ? (options.simulation ? 'true' : null) : null);
    w.cncShell = { sheet: () => ({ content, open() {} }), preparationActions: new p.El('div') };
    p.run(STUB_D, 'stub-d.js'); p.run(read('travel-check.js'), 'travel-check.js');
    if (options.wide === false) w.cncLayout._set(false);
    p.run(read('job-preparation.js'), 'job-preparation.js');
    await p.flush();
    return { ...p, mounts, content };
  }
  {
    let q = await preparation();
    eq(q.loads, [['preview-gl.js', 'origin-preview.js']]); eq(q.mounts, [['mount', 'screen-jog']]);
    // Leaving Préparer unmounts; coming back mounts again (module already loaded).
    q.screen.className = 'screen'; q.win.dispatchEvent(new q.win.CustomEvent('cnc-screen-change', { detail: 'home' })); await q.flush();
    eq(q.mounts.at(-1), ['unmount']);
    q.screen.className = 'screen active'; q.win.dispatchEvent(new q.win.CustomEvent('cnc-screen-change', { detail: 'jog' })); await q.flush();
    eq(q.mounts.at(-1), ['mount', 'screen-jog']);
    // Layout no longer wide, eco, laser: unmounted.
    q.win.cncLayout._set(false); await q.flush(); eq(q.mounts.at(-1), ['unmount']);
    q.win.cncLayout._set(true); await q.flush(); eq(q.mounts.at(-1), ['mount', 'screen-jog']);
    q.win.cncProfile._set('eco'); await q.flush(); eq(q.mounts.at(-1), ['unmount']);
    q.win.cncProfile._set('performance'); await q.flush(); eq(q.mounts.at(-1), ['mount', 'screen-jog']);
    q.win.cncProfile._set('performance', 'laser'); await q.flush(); eq(q.mounts.at(-1), ['unmount']);
    const loadsBefore = q.loads.length; q.win.dispatchEvent(new q.win.CustomEvent('cnc-screen-change', { detail: 'jog' })); await q.flush(); assert.equal(q.loads.length, loadsBefore, 'laser: nothing loaded');
    q.win.cncProfile._set('performance', null); await q.flush(); eq(q.mounts.at(-1), ['mount', 'screen-jog'], 'unknown machine type: CNC behaviour');
    // The hint line under the « Origine de travail » step, filled by hint(); the tick stays manual.
    q.win.dispatchEvent(new q.win.CustomEvent('cnc-job-status', { detail: { machine: machine(-350, -250, 0, 0), simulation: false } }));
    const origin = q.content.all().find(e => e.getAttribute('data-step') === 'origin'), hintLine = origin.all().find(e => e.classList.contains('ks-prep-origin-hint'));
    assert(hintLine && hintLine.tagName === 'P'); assert.equal(hintLine.textContent, 'Si l’origine X Y est posée ici : hors course en X.');
    assert(origin.children.indexOf(hintLine) > origin.children.findIndex(e => e.classList.contains('ks-prep-detail')), 'under the detail');
    assert.equal(q.win.cncJobPreparation.ticks().origin, false, 'the origin tick is never set by the hint');
    eq(q.requests, []); eq(q.clicks, []);
  }
  for (const [label, options] of [['eco', { performance: 'eco' }], ['laser', { kind: 'laser' }], ['not wide', { wide: false }], ['Préparer hidden', { active: false }], ['simulation page', { simulation: true }]]) {
    const q = await preparation(options);
    eq(q.loads, [], label + ': nothing loaded'); eq(q.mounts, [], label + ': nothing mounted');
  }
  // Fewer than the conditions: no hint line before the module is present.
  {
    const q = await preparation({ wide: false });
    q.win.dispatchEvent(new q.win.CustomEvent('cnc-job-status', { detail: { machine: machine(-350, -250, 0, 0), simulation: false } }));
    assert(!q.content.all().some(e => e.classList.contains('ks-prep-origin-hint')));
  }

  // ---------- 7. Sources: no command path, catalog, stylesheet scope, script level, never script-tagged ----------
  const source = read('origin-preview.js');
  assert(!/\bfetch\s*\(|XMLHttpRequest|\.click\s*\(|api\/touch|cncJobControls|cncRealMotion|CNCRealMotion|coordinate-plan|dry-motion|CNCCoordinatePlan|cncSocket|\.emit\s*\(|watch\/file|fetchProgram/.test(source), 'origin-preview.js never commands nor reads the program');
  const handler = /'cnc-job-status', function \(e\) \{([^}]*)\}/.exec(source)[1];
  assert(!/open|setOverlays|paint|textContent|getBoundingClientRect/.test(handler), 'the status handler only stores and schedules');
  const prep = read('job-preparation.js');
  assert(!/cncJobControls|XMLHttpRequest|fetch\(/.test(prep));
  const key = s => s.trim().replace(/\s+/g, ' ');
  const sandbox = { window: {} };
  ['i18n-messages.js'].concat(fs.readdirSync(dir).filter(n => /^i18n-messages-[a-z]+\.js$/.test(n) && n !== 'i18n-messages-origin.js')).forEach(n => vm.runInNewContext(read(n), sandbox));
  const others = new Set(sandbox.window.CNCTouchMessages.map(r => key(r[0]))), before = sandbox.window.CNCTouchMessages.length;
  JSON.parse(read('i18n-messages-v2.js')).forEach(row => others.add(key(row[0])));
  vm.runInNewContext(read('i18n-messages-origin.js'), sandbox);
  const rows = sandbox.window.CNCTouchMessages.slice(before), mine = new Set();
  assert(rows.length > 10);
  for (const row of rows) { assert.equal(row.length, 3); row.forEach(v => assert(typeof v === 'string' && v.length > 0)); assert(!others.has(key(row[0])), 'already in another catalog: ' + row[0]); assert(!mine.has(key(row[0]))); mine.add(key(row[0])); }
  const missing = [...source.matchAll(/\bt\('((?:[^'\\]|\\.)*)'\)/g)].map(m => key(m[1])).filter(v => /[a-zà-ÿ]{2}/i.test(v) && !others.has(v) && !mine.has(v));
  eq(missing, [], 'phrases without a catalog row');
  const css = read('origin-preview.css').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of css.matchAll(/([^{}]+)\{[^}]*\}/g)) m[1].split(',').forEach(sel => assert(/^\s*body\.perf-origin\s/.test(sel), 'rule outside body.perf-origin: ' + sel.trim()));
  let acorn = null; try { acorn = require('acorn'); } catch (_) { /* Node's parser */ }
  for (const f of ['origin-preview.js', 'travel-check.js', 'job-preparation.js', 'i18n-messages-origin.js']) {
    if (acorn) acorn.parse(read(f), { ecmaVersion: 2017, sourceType: 'script' }); else new vm.Script(read(f), { filename: f });
  }
  for (const name of ['index.html', 'simulation.html']) assert(!/origin-preview\.(js|css)/.test(read(name)), name + ': advanced module, never linked by the page');
  console.log('PASS origin preview: travelBox/place (= check on the shifted state), overlays and texts per state, frames outside the status handler, release on unmount, loading conditions in job-preparation.js, nothing sent or clicked' + (acorn ? ', ES2017 parse' : '') + '.');
})().catch(e => { console.error(e); process.exit(1); });
