'use strict';
// Performance v2 safety matrix (lot L7, independent validation; design/v2/REFLEXION.md § 3, § 5, § 8.4–8.5).
// Offline, in VMs, with the REAL shipped modules: the L0 gate and contract, the L1 inspection and 3D view,
// the L2/L3 models and the L4/L5/L6 presenters on the fixtures of their own tests. Over the whole life of a
// v2 page (rest, job, pause, alarm, stale report, lost stream, new program, Éco, pagehide) and every v2
// control (Suivi sheets and curve, Préparer comparison and jog panel, Fichiers, Journal, Réglages, 3D
// gestures and loupe), it checks:
//   M1 nothing leaves the page towards the controller outside the existing relays: no fetch, WebSocket,
//      socket.io, sendBeacon, non-GET request, nor any use of the command modules (cncJobControls,
//      cncRealMotion, cncSocket, CNCJobStream) by v2 code;
//   M2 no rendering in a state handler: the v2 nodes are unchanged by the dispatch of cnc-job-status,
//      cnc-v2-change, cnc-gpu-change, cnc-profile-change, cnc-screen-change, cnc-v2-data; drawing happens
//      in requestAnimationFrame (WebGL draws counted for the 3D view);
//   M3 no read of the program during a job: no request at all while the machine is not at rest;
//   M4 no replay: no v2 control re-sends or re-emits a past event (no cnc-job-status of its own, no
//      control labelled « rejouer / renvoyer », no command-shaped function in the v2 APIs);
//   M5 holdLayout: the Suivi grid does not move in Run / Hold / Alarm / stale / unknown, not even when Éco
//      or a GPU loss closes the gate; it changes back at a known rest only;
//   M6 RT / Éco / laser / software GPU / narrow window identical to v1 with the preference ON: no v2
//      request, class, event, frame or element, and the same page as with the preference absent.
// A check that fails here names the lot that owns the code; it is never weakened to pass.
const assert = require('assert').strict, fs = require('fs'), vm = require('vm');
const { page, read } = require('./test-v2-gate.cjs');
const { createDOM } = require('./dom-fixture.cjs');
const { preparerPage, idle: prepIdle } = require('./test-v2-preparer-fixture.cjs');
const { l6Page, all } = require('./test-v2-settings.cjs');
const { createPage } = require('./test-preview-gl.cjs');
const T3 = require('./touch/toolpath-3d.js');
const tick = () => new Promise(setImmediate);
const failures = [];
async function check(name, fn) {
  try { await fn(); console.log('OK   ' + name); } catch (e) { failures.push(name); console.error('FAIL ' + name + '\n     ' + String(e && e.stack || e).split('\n').slice(0, 4).join('\n     ')); }
}

// ---- Transports: every way to reach the controller, recorded. -------------------------------------------
const COMMAND_MODULES = ['cncJobControls', 'cncRealMotion', 'cncSocket', 'CNCJobStream', 'cncConnection', 'cncDryMotion', 'CNCCoordinates', 'cncMacros'];
function trap(win, sent, allowRead) {
  win.fetch = (u) => { sent.push(['fetch', String(u)]); return Promise.reject(new Error('blocked')); };
  win.WebSocket = function (u) { sent.push(['websocket', u]); };
  win.io = () => { sent.push(['io']); return { emit: (n) => sent.push(['emit', n]), on() {} }; };
  win.navigator = Object.assign({}, win.navigator || {}, { sendBeacon: (u) => { sent.push(['beacon', u]); return true; } });
  COMMAND_MODULES.forEach((name) => {
    // A call is recorded; reading a flag or subscribing to the socket's events (on/off) is not a send.
    win[name] = new Proxy({}, { get(_, k) {
      if (typeof k === 'symbol' || k === 'then') return undefined;
      if (name === 'cncSocket' && !/^(emit|send|write)$/.test(String(k))) return typeof k === 'string' && /^(on|off|once|removeListener)$/.test(k) ? () => {} : undefined;
      return (...a) => { sent.push([name, String(k)].concat(a.slice(0, 1).map((x) => typeof x === 'string' ? x : typeof x))); return Promise.resolve({}); };
    } });
  });
  const Native = win.XMLHttpRequest;
  win.XMLHttpRequest = function () {
    const x = Native ? new Native() : {};
    const open = x.open ? x.open.bind(x) : () => {};
    x.open = (m, u) => { x._method = String(m).toUpperCase(); x._url = String(u); if (!(allowRead && allowRead(x._method, x._url))) sent.push(['xhr', x._method, x._url]); return open(m, u); };
    if (!x.send) x.send = () => {}; if (!x.setRequestHeader) x.setRequestHeader = () => {}; if (!x.abort) x.abort = () => {};
    return x;
  };
}
// The state of every v2 node (id or class of a v2 presenter), to prove a handler wrote nothing.
const V2_NODE = /^(home-v2|pv2|lv2|v2m|v2j|ks-v2|perf-v2|pgl-)/;
function v2Nodes(root) {
  const out = [];
  (function walk(n, depth) {
    if (!n || depth > 40) return;
    const id = n.id || '', cls = typeof n.className === 'string' ? n.className : '';
    if (V2_NODE.test(id) || cls.split(/\s+/).some((c) => V2_NODE.test(c))) out.push(JSON.stringify([id || cls, n.textContent === undefined ? null : String(n.textContent), !!n.hidden, n.attributes || null, (n.children || []).length]));
    (n.children || []).forEach((c) => walk(c, depth + 1));
  })(root, 0);
  return out.join('\n');
}
function noRenderIn(label, roots, fn) {
  const before = roots().map(v2Nodes).join('\n§\n');
  fn();
  const after = roots().map(v2Nodes).join('\n§\n');
  assert.equal(after, before, 'M2 ' + label + ': a v2 node changed inside the handler');
}

// ---- Suivi (L4) on the real L0 bootstrap + L1/L2/L3 models: the fixture of test-v2-suivi.cjs. ---------
async function suiviPage(options = {}) {
  const p = page(options.page || {});
  const sent = [];
  p.status(); p.frame(); await p.complete();
  const opened = p.requests.length;
  const dom = createDOM(['home']), { node } = dom, timers = [], sheets = [];
  const link = (e) => {
    if (e._linked) return e; e._linked = true;
    Object.defineProperty(e, 'nextSibling', { get() { const q = this.parentNode, i = q && q.children ? q.children.indexOf(this) : -1; return i >= 0 ? q.children[i + 1] || null : null; } });
    Object.defineProperty(e, 'firstChild', { get() { return this.children[0] || null; } });
    return e;
  };
  const make = dom.document.createElement;
  const create = (tag) => { const e = link(make(tag)); let own = ''; Object.defineProperty(e, 'id', { get: () => own, set(v) { own = v; dom.nodes[v] = e; } }); return e; };
  Object.assign(p.document, { getElementById: (id) => link(node(id)), createElement: create, querySelector: dom.document.querySelector,
    createElementNS: (ns, tag) => create(tag), createTextNode: (text) => { const t = link(make('#text')); t.textContent = text; return t; } });
  const el = (id) => link(node(id)), box = (cls) => { const e = create('div'); e.className = cls; return e; };
  const board = box('job-dashboard'), left = el('home-left'), metrics = box('job-metrics'), art = box('job-art');
  board.appendChild(left); board.appendChild(metrics);
  left.appendChild(art); art.appendChild(el('home-job-image')); left.appendChild(el('tool-position-note')); left.appendChild(el('home-overrides'));
  const ov = el('home-overrides'), row = (kind) => { const r = box('t-override'); r.setAttribute('data-kind', kind); const b = create('button'); b.setAttribute('data-kind', kind); b.setAttribute('data-value', '10'); r.appendChild(b); return r; };
  const head = box('home-overrides-head'), feedRow = row('feed'), spindleRow = row('spindle'), rapidRow = row('rapid');
  [head, el('home-spindle-warning'), feedRow, spindleRow, rapidRow, el('home-override-note'), el('home-rapid-note')].forEach((n) => ov.appendChild(n));
  ov.querySelector = (s) => ({ '.t-override[data-kind="spindle"]': spindleRow, '.t-override[data-kind="rapid"]': rapidRow })[s] || null;
  const progress = box('t-card home-progress'), phead = box('home-progress-head'), coords = el('home-coords'), tiles = box('home-live-tiles'), feedCard = box('t-card'), stop = box('home-stop');
  phead.appendChild(el('home-job-percent')); progress.appendChild(phead); progress.appendChild(el('home-job-progress'));
  feedCard.appendChild(el('home-live-feed')); tiles.appendChild(feedCard); stop.appendChild(el('home-job-stop'));
  [el('home-job-title'), progress, coords, tiles, el('home-job-note'), el('home-job-ready'), el('home-job-selection'), el('home-job-load'), el('home-job-primary-row'), el('home-job-resume-row'), el('home-job-feedback'), stop].forEach((n) => metrics.appendChild(n));
  const w = p.window;
  w.setTimeout = (f) => { timers.push(f); return timers.length; }; w.clearTimeout = () => {};
  w.cncShell = { screen: () => 'home', sheet(id, title) { const content = create('div'); content.id = id + '-content'; sheets.push(content); return { content, title, open() {} }; } };
  // Reads of the program by the v1 dashboard (its preview) go through this XMLHttpRequest: all recorded.
  p.context.XMLHttpRequest = w.XMLHttpRequest = function () { this.open = (m, u) => sent.push(['xhr', String(m).toUpperCase(), String(u), 'dashboard']); this.setRequestHeader = () => {}; this.abort = () => {}; this.send = () => {}; };
  trap(w, sent);
  if (options.v1) p.classes.delete('perf-v2');
  p.emit('cnc-screen-change', 'home');
  vm.runInContext(read('job-dashboard.js'), p.context, { filename: 'job-dashboard.js' });
  const kids = (n) => n.children.map((c) => c.id || c.className || c.tagName);
  const shape = () => JSON.stringify([board, left, metrics, ov].map(kids).concat(metrics.children.filter((c) => c.id && c.id.indexOf('home-zone') === 0).map(kids)));
  const machine = (patch = {}) => Object.assign({ port: 'A', generation: 'g1', revision: 1, name: 'piece.nc', fingerprint: 'sha256:a', originalName: 'Pièce 01.nc',
    machineProfile: { kind: 'cnc' }, activeState: 'Idle', workflow: 'idle', fresh: true, statusAgeMs: 0, statusObservedAt: 5000, canStop: false, loading: false, homing: false,
    spindleSpeed: 0, motion: { jog: false, cancelling: false }, total: 1000, received: 0, canPause: false, canOverride: false,
    operator: { reportUnits: 'mm', wcs: 'G54' }, coordinates: { wpos: { x: '1.000', y: 2, z: '-0.500' } } }, patch);
  const send = (patch, detail = {}) => p.emit('cnc-job-status', Object.assign({ machine: patch === null ? null : machine(patch), simulation: false, busy: false, transportConnected: true }, detail));
  const running = (patch = {}) => send(Object.assign({ activeState: 'Run', workflow: 'running', canStop: true, canPause: true, canOverride: true, spindleSpeed: 12000, feedrate: 1800, received: 420,
    overrides: { feed: 100, spindle: 100, rapid: 100 } }, patch));
  return { p, dom, node, board, left, sheets, timers, sent, shape, send, running, opened, roots: () => [board].concat(sheets) };
}

// ---- Préparer (L5): job-preparation.js on its fixture, a recording origin card. ------------------------
// ---- Journal, Réglages, Machine (L6): their modules on the fixture of test-v2-settings.cjs. -------------

(async () => {
  // =============================== Suivi over a whole v2 page life ===============================
  await check('Suivi v2 life: M1 M2 M3 M4 M5 over rest, job, corrections, pause, alarm, stale, lost, new program, Éco, pagehide', async () => {
    const s = await suiviPage();
    const { p } = s;
    assert(p.api.state().layout && p.api.gate(), 'v2 opened by the real bootstrap');
    const v2Requests = p.requests.length;
    const emit = (label, fn) => noRenderIn(label, s.roots, fn);
    // Rest, then v2 arranges in its frame.
    emit('idle status', () => s.send()); p.frame();
    p.emit('cnc-layout-change', { wide: true }); p.frame(); p.frame();
    const atRest = s.shape();
    assert.equal(s.board.getAttribute('data-v2'), 'suivi', 'Suivi v2 grid built at rest');
    // Calibration of M2: the snapshot sees the v2 nodes (a frame changes them) and catches a write.
    const seen = v2Nodes(s.board); s.running({ received: 10 }); p.frame();
    assert.notEqual(v2Nodes(s.board), seen, 'calibration: a frame after a report changes the v2 nodes');
    assert.throws(() => noRenderIn('calibration', s.roots, () => { s.node('home-v2-age').textContent = 'écrit dans un gestionnaire'; }), /M2 calibration/);
    s.send(); p.frame();
    // A job: bursts of reports, reported corrections, pause, resume, alarm.
    let received = 420;
    for (let i = 0; i < 60; i++) {
      p.advance(208); received += 3;
      const patch = { received, overrides: { feed: i > 20 ? 110 : 100, spindle: 100, rapid: i > 40 ? 50 : 100 }, statusObservedAt: 5000 + i * 208 };
      const burst = i % 10 ? 1 : 5;
      for (let b = 0; b < burst; b++) emit('running report ' + i, () => s.running(patch));
      if (i % 7 === 0) p.frame();
    }
    assert.equal(s.shape(), atRest, 'M5 grid unchanged while running');
    emit('pause', () => s.send({ activeState: 'Hold:0', workflow: 'paused', canStop: true, canResume: true, received }));
    p.frame(); assert.equal(s.shape(), atRest, 'M5 grid unchanged in a pause');
    emit('alarm', () => s.send({ activeState: 'Alarm', workflow: 'running', canStop: true, alarmCode: 1, received }));
    p.frame(); assert.equal(s.shape(), atRest, 'M5 grid unchanged in alarm');
    // Stale: no report for 3 s, the band timer fires in its own frame.
    emit('running again', () => s.running({ received }));
    p.advance(3000); s.timers.splice(0).forEach((f) => f()); p.frame();
    emit('stale report', () => s.running({ received, fresh: false, statusAgeMs: 3200 }));
    p.frame(); assert.equal(s.shape(), atRest, 'M5 grid unchanged with a stale report');
    assert(/périmé|Figée/.test(s.node('home-v2-age').textContent + s.node('home-v2-position').textContent), 'stale report shown as such: « ' + s.node('home-v2-age').textContent + ' »');
    // Lost stream (no machine), then the job back.
    emit('lost', () => s.send(null, { transportConnected: false })); p.frame();
    assert.equal(s.shape(), atRest, 'M5 grid unchanged with an unknown report');
    emit('back', () => s.running({ received }));
    // Éco chosen during the job: resources stop at once, the grid stays until a known rest.
    p.window.cncProfile.setPerformance('eco'); p.emit('cnc-profile-change', { performance: 'eco' }); p.frame(); p.frame();
    assert.equal(p.api.gate(), false, 'Éco closes the v2 gate at once');
    assert.equal(s.shape(), atRest, 'M5 grid unchanged when Éco is chosen during the job');
    emit('running under Éco', () => s.running({ received })); p.frame();
    assert.equal(s.shape(), atRest, 'M5 grid still unchanged under Éco while the job runs');
    // M3: no request at all since v2 opened (no program read, no module, no catalogue) during the job.
    assert.equal(p.requests.length, v2Requests, 'M3 no v2 module or catalogue requested during the job');
    const jobReads = s.sent.filter((x) => x[0] === 'xhr');
    assert.deepEqual(jobReads, [], 'M3 no read of the program while the machine is not at rest: ' + JSON.stringify(jobReads));
    // Journal from the curve, and its return: display navigation, never a command or a replayed status.
    const statusEvents = p.events.filter((e) => e.type === 'cnc-job-status').length;
    p.emit('cnc-v2-journal-open', { marker: { identity: null, interval: { fromMonoMs: 0, toMonoMs: 1 } }, view: { screen: 'home' } });
    p.emit('cnc-v2-journal-return', { view: { screen: 'home' } }); p.frame();
    assert.equal(p.events.filter((e) => e.type === 'cnc-job-status').length, statusEvents + 0, 'M4 no cnc-job-status emitted by v2 code');
    // Rest again (Éco): the old layout may come back now, at a known rest only.
    s.send(); p.frame(); p.frame(); p.emit('cnc-layout-change', { wide: false }); p.frame();
    // pagehide: everything released, nothing sent.
    p.emit('pagehide', { persisted: false }); p.frame();
    assert.deepEqual(s.sent.filter((x) => x[3] !== 'dashboard'), [], 'M1 nothing sent: ' + JSON.stringify(s.sent));
  });

  await check('Suivi v2 controls: « Broche / rapides… », « Détail du temps », curve tap — only the existing override relay', async () => {
    const s = await suiviPage();
    const { p } = s;
    s.send(); p.frame(); p.emit('cnc-layout-change', { wide: true }); p.frame(); p.frame();
    s.running({ overrides: { feed: 100, spindle: 100, rapid: 100 } }); p.frame();
    const clicks = [];
    (function walk(n) { if (!n) return; if (n.tagName === 'BUTTON' && n.handlers && n.handlers.click) clicks.push(n); (n.children || []).forEach(walk); })(s.board);
    s.sheets.forEach((c) => (function walk(n) { if (!n) return; if (n.tagName === 'BUTTON') clicks.push(n); (n.children || []).forEach(walk); })(c));
    const v2Buttons = clicks.filter((b) => /^home-v2/.test(b.id));
    assert(v2Buttons.length >= 2, 'the two v2 sheet buttons exist (' + v2Buttons.map((b) => b.id) + ')');
    v2Buttons.forEach((b) => b.handlers.click({ target: b }));
    if (s.node('home-gauge-curve').handlers.click) s.node('home-gauge-curve').handlers.click({ clientX: 10, clientY: 10, target: s.node('home-gauge-curve') });
    p.frame();
    assert.deepEqual(s.sent.filter((x) => x[3] !== 'dashboard'), [], 'M1 the v2 Suivi controls send nothing: ' + JSON.stringify(s.sent));
  });

  // =============================== Préparer (L5) ===============================
  await check('Préparer v2: comparison, dimensions, jog panel — M1 M2 M3, card kept while the layout is held', async () => {
    const P = preparerPage({ preview: null });
    const sent = []; trap(P.window, sent);
    P.status(prepIdle()); P.show('jog'); await P.flush(); P.resolveLoads(); await P.flush();
    assert.equal(P.calls.mount.length, 1, 'origin card mounted once at rest');
    P.v2.placement = { version: 1, available: true, identity: { jobKey: 'k', file: 'a.nc', fingerprint: 'sha256:aa' }, current: null, hypothesis: { axes: ['x', 'y'], deltaMm: { x: 18, y: 12 }, zUnchanged: true },
      travel: { verdict: 'unknown', source: null, marginsMm: null, zVerified: false, collisionsVerified: false }, declarations: [] };
    await P.flush();
    const roots = () => [P.content];
    // Every v2 button of the presenter, twice.
    const buttons = all(P.content).filter((n) => n.tagName === 'BUTTON');
    assert(buttons.length >= 5, 'v2 Préparer buttons built (' + buttons.map((b) => b.id) + ')');
    for (let k = 0; k < 2; k++) for (const b of buttons) { if (b.handlers.click) b.handlers.click({ target: b }); await P.flush(); }
    const readsAtRest = P.calls.reads;
    // A job, a pause, an alarm, a stale report: no rendering in the handler, no read, the card stays.
    P.v2.safeIdle = false;
    for (const m of [{ activeState: 'Run', workflow: 'running', canStart: false }, { activeState: 'Hold:0', workflow: 'paused' }, { activeState: 'Alarm', workflow: 'idle' }, { fresh: false }]) {
      noRenderIn('Préparer status ' + JSON.stringify(m), roots, () => { P.status(prepIdle(m)); P.emit('cnc-v2-change', {}); });
      await P.flush();
      assert.equal(P.calls.unmount, 0, 'M5 origin card kept while the layout is held (' + JSON.stringify(m) + ')');
    }
    assert.equal(P.calls.reads, readsAtRest, 'M3 no read of the loaded program during the job');
    assert.equal(P.calls.updates.filter((u) => u && u.machine && u.machine.workflow !== 'idle').length, 0, 'no placement update from a job state');
    assert.deepEqual(sent, [], 'M1 Préparer v2 sends nothing: ' + JSON.stringify(sent));
    // The same two modules only (the loader keeps one request per file), mounted once.
    assert(P.calls.loads.every((l) => JSON.stringify(l) === JSON.stringify(['preview-gl.js', 'origin-preview.js'])), 'advanced modules: ' + JSON.stringify(P.calls.loads));
    assert.equal(P.calls.mount.length, 1, 'origin card mounted once');
  });

  // =============================== Journal, Réglages, Machine (L6) ===============================
  await check('Journal, Réglages, Machine v2: every control, the whole timeline — M1 M2 M4 (read only, no replay)', async () => {
    const p = l6Page({ eligible: true, screens: ['history', 'settings', 'machine'], active: 'history' });
    const create = p.document.createElement;
    p.document.createElement = (tag) => { const e = create(tag); const found = {}; e.querySelector = (s) => found[s] || (found[s] = create('b')); return e; };
    p.node('panel').querySelector = (s) => p.node('panel:' + s);
    const sent = [];
    // GET of the server history (paged on demand) is a read, not a command: allowed, but never during a job.
    let busy = false;
    trap(p.window, sent, (m, u) => m === 'GET' && !busy && !/touch-job|touch-motion|touch-probe|commands\/run/.test(u));
    ['download-file.js', 'session-journal.js', 'real-history.js', 'display-settings.js', 'grbl-help.js', 'machine-limits.js'].forEach((f) => p.run(f));
    p.open(); p.frame();
    const roots = () => ['history', 'settings', 'machine'].map((n) => p.mount(n).content);
    const m = { port: 'A', generation: 'g1', revision: 1, name: 'piece.nc', originalName: 'piece.nc', fingerprint: 'sha:a', fresh: true, statusAgeMs: 50, activeState: 'Idle', workflow: 'idle', loading: false, settings: { $110: '5000', $130: '600' } };
    const timeline = [[m, {}], [m, { feedbackState: 'sent', feedback: 'Demande envoyée…' }], [{ ...m, activeState: 'Run', workflow: 'running' }, { feedbackState: 'confirmed', feedback: 'Démarrage accepté.' }],
      [{ ...m, activeState: 'Hold:0', workflow: 'paused' }, { feedbackState: 'failed', feedback: 'Refusé : un autre appareil pilote.' }], [{ ...m, activeState: 'Alarm', workflow: 'idle', alarmCode: 2 }, {}],
      [{ ...m, fresh: false, statusAgeMs: 4000 }, { feedbackState: 'uncertain', feedback: 'Connexion perdue ou réponse incertaine.' }], [null, { transportConnected: false }], [{ ...m, revision: 2 }, {}]];
    for (const screen of ['history', 'settings', 'machine']) {
      p.show(screen);
      for (const [machine, extra] of timeline) {
        busy = !!machine && machine.workflow !== 'idle';
        noRenderIn('L6 ' + screen + ' status', roots, () => p.status(machine, extra));
        p.advance(700); p.frame();
      }
      busy = false;
      noRenderIn('L6 ' + screen + ' cnc-v2-change', roots, () => p.emit('cnc-v2-change', p.base.state()));
      p.frame();
    }
    // The journal opened from a curve marker, then every v2 control of the three screens (twice).
    p.show('history');
    noRenderIn('cnc-v2-journal-open', roots, () => p.emit('cnc-v2-journal-open', { marker: { identity: { role: 'loaded', file: 'piece.nc', fingerprint: 'sha:a', controller: 'A', generation: 'g1', revision: 1 }, interval: { fromMonoMs: 1000, toMonoMs: 3000 } }, view: { screen: 'home' } }));
    p.frame();
    const statusBefore = p.calls.length;
    for (let k = 0; k < 2; k++) for (const root of roots()) for (const b of all(root).filter((n) => n.tagName === 'BUTTON')) { if (b.handlers.click && !b.disabled) b.handlers.click({ target: b }); p.frame(); await tick(); }
    // M4: no control that replays or re-sends, and no command-shaped call.
    const labels = roots().flatMap((r) => all(r).filter((n) => n.tagName === 'BUTTON').map((b) => String(b.textContent)));
    assert(!labels.some((t) => /rejou|renvo|relanc|replay|resend|retry/i.test(t)), 'M4 no replay control: ' + labels.filter((t) => /rejou|renvo|relanc|replay|resend|retry/i.test(t)));
    const forbidden = p.calls.slice(statusBefore).filter((c) => c[0] === 'jobControls' || c[0] === 'reload' || c[0] === 'fetch' || (c[0] === 'xhr' && c[1] !== 'GET'));
    assert.deepEqual(forbidden, [], 'M1 L6 controls call nothing forbidden: ' + JSON.stringify(forbidden));
    assert.deepEqual(sent, [], 'M1 nothing sent by L6 v2 (reads during a job included): ' + JSON.stringify(sent));
  });

  // =============================== 3D view, gestures and loupe (L1) ===============================
  await check('3D view v2: drag, pinch, wheel, pen pick, « Examiner », candidates, return, quality — M1 M2', async () => {
    const idleQ = new Map(); let seq = 0, now = 0;
    const gate = { gate: () => true, state: () => ({ safeIdle: true, programKey: null }) };
    const p = createPage({ gpu: true, v2: gate, clock: () => now, dpr: 1.58, requestIdleCallback: (fn) => { idleQ.set(++seq, fn); return seq; }, cancelIdleCallback: (id) => idleQ.delete(id) });
    p.win.cncShell = { screen: () => 'home' };
    p.win.CustomEvent = class { constructor(type, o) { this.type = type; this.detail = o && o.detail; } };
    p.win.dispatchEvent = (e) => p.win.dispatch(e.type, e.detail);
    const sent = []; trap(p.win, sent);
    for (const name of ['performance-v2-contract.js', 'performance-inspect.js']) vm.runInContext(read(name), p.win, { filename: name });
    const builder = T3.createBuilder({ bounds: [0, 0, -1, 40, 40, 0] });
    let line = 0; for (let k = 0; k < 8; k++) { builder.move(0, k * 5, 0, 40, k * 5, -1, 1, ++line); builder.move(40, k * 5, -1, 40, k * 5 + 5, -1, 1, ++line); }
    const meta = { file: 'gestures.nc', fingerprint: 'sha256:g', path3d: builder.finish(line), zBounds: [-1, 0] };
    const view = p.win.CNCPreviewGL.open(meta, { container: p.doc.createElement('div'), live: { progress: true, tool: true } });
    const drain = () => { let n = 10000; while (idleQ.size && n--) { const [id, fn] = idleQ.entries().next().value; idleQ.delete(id); fn({ timeRemaining: () => 10 }); } p.runFrames(now += 16); };
    drain();
    const gl = view.canvas.glStub.log;
    const find = (n, cls) => { if (n.classList && n.classList.contains(cls)) return n; for (const c of n.children || []) { const hit = find(c, cls); if (hit) return hit; } return null; };
    const report = (received, extra) => Object.assign({ fresh: true, name: 'gestures.nc', fingerprint: 'sha256:g', total: line, received, workflow: 'running', activeState: 'Run', statusAgeMs: 0,
      operator: { reportUnits: 'mm', wcs: 'G54' }, coordinates: { wpos: { x: '10', y: '5', z: '-1' }, mpos: { x: -290, y: -195, z: -51 } } }, extra || {});
    const status = (m) => { const before = gl.frames; p.win.dispatch('cnc-job-status', { machine: m }); assert.equal(gl.frames, before, 'M2 nothing drawn by a cnc-job-status handler'); };
    const c = view.canvas, q = view.project(20, 5, -1);
    // Finger drag, two-finger pinch, wheel, pen pick in « Examiner », candidate choice, return, quality.
    c.dispatch('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 }); status(report(2));
    for (let i = 1; i < 6; i++) { c.dispatch('pointermove', { pointerId: 1, pointerType: 'touch', clientX: 100 + i * 12, clientY: 100 + i * 4 }); status(report(2 + i)); }
    c.dispatch('pointerdown', { pointerId: 2, pointerType: 'touch', clientX: 200, clientY: 200 }); c.dispatch('pointermove', { pointerId: 2, pointerType: 'touch', clientX: 240, clientY: 230 });
    c.dispatch('pointerup', { pointerId: 2, pointerType: 'touch', clientX: 240, clientY: 230 }); c.dispatch('pointerup', { pointerId: 1, pointerType: 'touch', clientX: 160, clientY: 120 });
    c.dispatch('wheel', { deltaY: -120, clientX: 150, clientY: 150, preventDefault() {} });
    p.runFrames(now += 16);
    const examine = find(view.dialog, 'pgl-examine');
    assert(examine, 'L1 « Examiner » control present under v2');
    examine.click();
    c.dispatch('pointerdown', { pointerId: 3, pointerType: 'pen', clientX: q.x, clientY: q.y }); status(report(9, { workflow: 'paused', activeState: 'Hold:0' }));
    c.dispatch('pointerup', { pointerId: 3, pointerType: 'pen', clientX: q.x, clientY: q.y }); p.runFrames(now += 16);
    const candidates = find(view.dialog, 'pgl-inspection-candidates');
    if (candidates && candidates.handlers && candidates.handlers.click) candidates.handlers.click({ target: { getAttribute: () => '0' } });
    status(report(10, { activeState: 'Alarm' })); status(report(10, { fresh: false }));
    const ret = find(view.dialog, 'pgl-inspection-return'); if (ret) ret.click();
    const inspect = gate.use('inspect');
    inspect.setQuality('reduced'); p.runFrames(now += 16); inspect.setQuality('full'); p.runFrames(now += 16);
    view.close(); p.runFrames(now += 16);
    assert.deepEqual(sent, [], 'M1 gestures, loupe and quality send nothing: ' + JSON.stringify(sent));
  });

  // =============================== M4: no command-shaped API in v2 ===============================
  await check('v2 APIs carry no command: contract commands null, no send/jog/zero/replay function in any v2 provider', async () => {
    const s = await suiviPage();
    const api = s.p.api;
    assert.equal(api.commands, null, 'cncV2.commands is null');
    const names = [];
    const scan = (label, obj) => { if (!obj) return; Object.keys(obj).forEach((k) => { if (typeof obj[k] === 'function') names.push(label + '.' + k); }); };
    scan('cncV2', api);
    ['inspect', 'geometry', 'sequences', 'placement', 'observation', 'journal', 'suivi', 'files', 'prepare', 'machine', 'history', 'settings'].forEach((slot) => scan(slot, api.use(slot)));
    Object.keys(s.p.window).filter((k) => /^CNCPerformance|^cncPerformance/.test(k)).forEach((k) => scan(k, s.p.window[k]));
    const bad = names.filter((n) => /\.(send|emit|command|jog|move|zero|home|unlock|start|resume|pause|stop|replay|resend|override|run)[A-Z]?\w*$/i.test(n) && !/\.(stopRender|resumeRender)$/.test(n));
    assert.deepEqual(bad, [], 'M4 command-shaped functions in the v2 APIs: ' + bad.join(', '));
  });

  // =============================== M6: RT / Éco / laser / software / narrow identical to v1 ===============================
  for (const [label, opts] of [['Éco 1366 x 768', { profile: 'eco', width: 1366, height: 768 }], ['Éco 1366 x 911', { profile: 'eco' }], ['Performance 1366 x 768 (RT size, not wide)', { width: 1366, height: 768 }],
    ['Performance 1024 x 600', { width: 1024, height: 600 }], ['laser', { kind: 'laser' }], ['software GPU', { gpu: false }]]) {
    await check('M6 ' + label + ': preference ON identical to preference absent (no v2 request, class, event, frame, mount)', async () => {
      const run = async (raw) => {
        const p = page(Object.assign({}, opts, raw === null ? { values: new Map([['cncjs-touch-performance-v1', JSON.stringify({ version: 1, profile: opts.profile || 'performance' })]]) } : {}));
        p.status(); p.frame(); await p.complete();
        p.status({ activeState: 'Run', workflow: 'running', canStop: true }); p.frame(); await p.complete();
        p.status(); p.frame(); await p.complete();
        p.emit('cnc-gpu-change', {}); p.emit('resize', {}); p.emit('cnc-layout-change', { wide: false }); p.frame(); await p.complete();
        return { requests: p.requests.map((r) => r.url), classes: [...p.classes].sort(), events: p.events.map((e) => e.type).filter((t) => /^cnc-v2/.test(t)), frames: p.frames.size, contract: !!p.api.identity, open: p.api.gate(), layout: p.api.state().layout };
      };
      const on = await run(), off = await run(null);
      assert.deepEqual(on.requests, [], 'no v2 request: ' + JSON.stringify(on.requests));
      assert.deepEqual(on, off, 'same page with the preference ON as without it');
    });
  }

  if (failures.length) { console.error('\n' + failures.length + ' safety check(s) failed:\n- ' + failures.join('\n- ')); process.exitCode = 1; return; }
  console.log('PASS v2 safety matrix: nothing sent outside the existing relays, no rendering in state handlers, no program read during a job, no replay, holdLayout kept, RT/Éco/laser/software identical to v1.');
})().catch((e) => { console.error(e); process.exitCode = 1; });
