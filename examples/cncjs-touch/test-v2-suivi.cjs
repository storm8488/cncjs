'use strict';
// Performance v2 Suivi (lot L4): the real L0 bootstrap and L3 observation model in a VM, with
// job-dashboard.js on the Suivi fixture of test-dashboard.cjs. No server, no controller command.
const assert = require('assert').strict, vm = require('vm');
const {page, read} = require('./test-v2-gate.cjs');
const {createDOM} = require('./dom-fixture.cjs');

async function suivi(options = {}) {
  const p = page(options.page || {});
  p.status(); p.frame(); await p.complete();
  const dom = createDOM(['home']), {node} = dom, timers = [], opened = [], overrides = [];
  const link = (e) => {
    if (e._linked) return e; e._linked = true;
    Object.defineProperty(e, 'nextSibling', {get() { const q = this.parentNode, i = q && q.children ? q.children.indexOf(this) : -1; return i >= 0 ? q.children[i + 1] || null : null; }});
    Object.defineProperty(e, 'firstChild', {get() { return this.children[0] || null; }});
    return e;
  };
  const make = dom.document.createElement;
  const create = (tag) => { const e = link(make(tag)); let own = ''; Object.defineProperty(e, 'id', {get: () => own, set(v) { own = v; dom.nodes[v] = e; }}); return e; };
  Object.assign(p.document, {getElementById: (id) => link(node(id)), createElement: create, querySelector: dom.document.querySelector,
    createElementNS: (ns, tag) => create(tag), createTextNode: (text) => { const t = link(make('#text')); t.textContent = text; return t; }});
  const el = (id) => link(node(id)), box = (cls) => { const e = create('div'); e.className = cls; return e; };
  const board = box('job-dashboard'), left = el('home-left'), metrics = box('job-metrics'), art = box('job-art');
  board.appendChild(left); board.appendChild(metrics);
  left.appendChild(art); art.appendChild(el('home-job-image')); left.appendChild(el('tool-position-note')); left.appendChild(el('home-overrides'));
  // The override rows as job-dashboard.js builds them (the fixture does not parse its HTML).
  const ov = el('home-overrides'), row = (kind) => { const r = box('t-override'); r.setAttribute('data-kind', kind); const b = create('button'); b.setAttribute('data-kind', kind); b.setAttribute('data-value', '10'); r.appendChild(b); return r; };
  const head = box('home-overrides-head'), feedRow = row('feed'), spindleRow = row('spindle'), rapidRow = row('rapid');
  [head, el('home-spindle-warning'), feedRow, spindleRow, rapidRow, el('home-override-note'), el('home-rapid-note')].forEach((n) => ov.appendChild(n));
  ov.querySelector = (s) => ({'.t-override[data-kind="spindle"]': spindleRow, '.t-override[data-kind="rapid"]': rapidRow})[s] || null;
  const progress = box('t-card home-progress'), phead = box('home-progress-head'), coords = el('home-coords'), tiles = box('home-live-tiles'), feedCard = box('t-card'), stop = box('home-stop');
  phead.appendChild(el('home-job-percent')); progress.appendChild(phead); progress.appendChild(el('home-job-progress'));
  feedCard.appendChild(el('home-live-feed')); tiles.appendChild(feedCard); stop.appendChild(el('home-job-stop'));
  [el('home-job-title'), progress, coords, tiles, el('home-job-note'), el('home-job-ready'), el('home-job-selection'), el('home-job-load'), el('home-job-primary-row'), el('home-job-resume-row'), el('home-job-feedback'), stop].forEach((n) => metrics.appendChild(n));
  const w = p.window;
  w.setTimeout = (f) => { timers.push(f); return timers.length; }; w.clearTimeout = () => {};
  w.cncShell = {screen: () => 'home', sheet(id, title) { const content = create('div'); content.id = id + '-content'; return {content, title, open() { opened.push(id); }}; }};
  w.cncJobControls = {override(kind, value) { overrides.push([kind, value]); return Promise.resolve(); }};
  p.context.XMLHttpRequest = function () { this.open = () => {}; this.setRequestHeader = () => {}; this.abort = () => {}; this.send = () => {}; };
  if (options.v1) p.classes.delete('perf-v2');
  p.emit('cnc-screen-change', 'home');
  vm.runInContext(read('job-dashboard.js'), p.context, {filename: 'job-dashboard.js'});
  const kids = (n) => n.children.map((c) => c.id || c.className || c.tagName);
  const shape = () => JSON.stringify([board, left, metrics, ov].map(kids).concat(metrics.children.filter((c) => c.id && c.id.indexOf('home-zone') === 0).map(kids)));
  let observed = 0; // every report the server sends has its own observation time
  const machine = (patch = {}) => Object.assign({port: 'A', generation: 'g1', revision: 1, name: 'piece.nc', fingerprint: 'sha256:a', originalName: 'Pièce 01.nc',
    machineProfile: {kind: 'cnc'}, activeState: 'Idle', workflow: 'idle', fresh: true, statusAgeMs: 0, statusObservedAt: 5000 + (++observed), canStop: false, loading: false, homing: false,
    spindleSpeed: 0, motion: {jog: false, cancelling: false}, total: 1000, received: 0, canPause: false, canOverride: false,
    operator: {reportUnits: 'mm', wcs: 'G54'}, coordinates: {wpos: {x: '1.000', y: 2, z: '-0.500'}}}, patch);
  const send = (patch, detail = {}) => p.emit('cnc-job-status', Object.assign({machine: patch === null ? null : machine(patch), simulation: false, busy: false, transportConnected: true}, detail));
  const running = (patch = {}) => send(Object.assign({activeState: 'Run', workflow: 'running', canStop: true, canPause: true, canOverride: true, spindleSpeed: 12000, feedrate: 1800, received: 420,
    overrides: {feed: 100, spindle: 100, rapid: 100}}, patch));
  const text = (id) => node(id).textContent;
  const navigate = (name) => { dom.activeScreens.clear(); dom.activeScreens.add(name); p.emit('cnc-screen-change', name); };
  return {p, dom, node, board, left, metrics, art, ov, spindleRow, rapidRow, timers, opened, overrides, shape, kids, send, running, text, navigate,
    layout(on) { p.emit('cnc-layout-change', {wide: on}); }, obs: () => p.api.use('observation')};
}
async function cases(entries) {
  let failed = 0;
  for (const [name, test] of entries) {
    try { await test(); console.log('OK ' + name); } catch (e) { failed++; console.error('FAIL ' + name + ': ' + e.stack); }
  }
  assert.equal(failed, 0, failed + ' Suivi v2 scenarios failed');
}

(async () => {
  await cases([
    ['outside perf-v2 nothing changes: v1 wide DOM, no sheet, no v2 node', async () => {
      const s = await suivi({v1: true}); s.send(); s.layout(true); s.p.frame();
      assert.equal(s.board.getAttribute('data-zones'), '2'); assert.equal(s.board.getAttribute('data-v2'), null);
      assert.deepEqual(s.kids(s.left), ['job-art', 'tool-position-note', 'home-overrides']);
      assert.deepEqual(s.kids(s.node('home-zone-gauges')), ['t-card home-progress', 'home-gauge-eta', 'home-coords', 'home-live-tiles', 'home-gauge-overrides', 'home-gauge-curve']);
      assert.equal(s.opened.length, 0); assert(!s.dom.nodes['home-v2-confidence'] && !s.dom.nodes['perf-v2-overrides-sheet-content'], 'no v2 element built');
      // A cnc-v2-change on a v1 page re-arranges nothing.
      const before = s.shape(); s.p.emit('cnc-v2-change', s.p.api.state()); s.p.frame(); assert.equal(s.shape(), before);
    }],
    ['perf-v2 at 1366 x 911: large scene, confidence band, frieze, one monitoring column with the curve', async () => {
      const s = await suivi({v1: true}); s.send(); s.layout(true); s.p.frame();
      const v1 = s.shape(), stop = s.node('home-job-stop'), pause = s.node('home-job-pause');
      s.p.classes.add('perf-v2'); s.p.emit('cnc-v2-change', s.p.api.state());
      assert.equal(s.board.getAttribute('data-v2'), null, 'no grid change inside the event handler'); s.p.frame();
      assert.equal(s.board.getAttribute('data-v2'), 'suivi'); assert.equal(s.board.getAttribute('data-zones'), '2');
      assert.deepEqual(s.kids(s.left), ['job-art', 'home-v2-confidence', 'tool-position-note', 'home-v2-sequence']);
      assert.deepEqual(s.kids(s.node('home-zone-gauges')), ['t-card home-progress', 'home-gauge-eta', 'home-coords', 'home-gauge-curve', 'home-overrides']);
      assert.equal(s.node('home-v2-position').parentNode, s.node('home-coords'), 'position state beside the reported coordinates');
      assert.deepEqual(s.kids(s.node('home-gauge-curve')), ['home-gauge-curve-title', 'home-live-tiles', 'SVG', 'home-v2-curve-axis'], 'reported feed and S head the curve card');
      assert.deepEqual(s.kids(s.node('home-v2-curve-axis')).slice(1, 2), ['home-v2-curve-events']);
      assert.deepEqual(s.kids(s.ov), ['home-overrides-head', 't-override', 'home-v2-more', 'home-gauge-overrides'], 'feed row in the column, spindle/rapids in their sheet');
      // D1: fixed slots. Messages that come and go (spindle warning, override reason, ready line, resume
      // help, feedback) share one scrolling message slot; the commands have their own fixed action slot.
      assert.deepEqual(s.kids(s.node('home-zone-controls')), ['home-v2-info', 'home-v2-actions', 'home-stop']);
      assert.deepEqual(s.kids(s.node('home-v2-actions')), ['home-job-load', 'home-job-primary-row', 'home-job-resume-row']);
      assert.deepEqual(s.kids(s.node('home-v2-info')), ['home-spindle-warning', 'home-job-note', 'home-job-ready', 'home-job-selection', 'home-job-feedback', 'home-override-note']);
      const sheet = s.node('perf-v2-overrides-sheet-content'), time = s.node('perf-v2-time-sheet-content');
      assert.deepEqual(sheet.children, [s.spindleRow, s.rapidRow, s.node('home-rapid-note')]);
      assert.deepEqual(s.kids(time), ['home-v2-time-note', 'home-gauge-eta-second', 'home-gauge-eta-unknown']);
      assert.equal(s.node('home-job-stop'), stop); assert.equal(s.node('home-job-pause'), pause);
      assert.deepEqual(s.kids(s.node('home-zone-controls')).slice(-1), ['home-stop'], 'commands keep their order, Arrêter at the bottom');
      // A wider window keeps one column: the curve never depends on three zones under v2.
      s.p.window.innerWidth = 1728; s.p.emit('resize'); s.p.frame();
      assert.equal(s.board.getAttribute('data-zones'), '2'); assert.equal(s.node('home-gauge-curve').parentNode, s.node('home-zone-gauges'));
      // Back out of perf-v2 at rest: exactly the v1 wide DOM, in order.
      s.p.window.innerWidth = 1366; s.p.classes.delete('perf-v2'); s.p.emit('cnc-v2-change', s.p.api.state()); s.p.frame();
      assert.equal(s.shape(), v1, 'v1 wide DOM restored'); assert.equal(s.board.getAttribute('data-v2'), null);
    }],
    ['Pause, Arrêter and override relays are the existing ones, also from the sheet', async () => {
      const s = await suivi(); s.send(); s.layout(true); s.p.frame();
      const clicks = []; s.node('job-pause').addEventListener('click', () => clicks.push('pause')); s.node('job-stop').addEventListener('click', () => clicks.push('stop'));
      s.running(); s.node('home-job-pause').click(); s.node('home-job-stop').click(); assert.deepEqual(clicks, ['pause', 'stop']);
      s.node('home-v2-more-overrides').click(); assert.deepEqual(s.opened, ['perf-v2-overrides-sheet']);
      s.node('home-v2-time-detail').click(); assert.deepEqual(s.opened, ['perf-v2-overrides-sheet', 'perf-v2-time-sheet']);
      const button = s.spindleRow.children[0]; assert.equal(button.disabled, false, 'enabled by the same guard while running');
      s.node('perf-v2-overrides-sheet-content').handlers.click({target: {closest: () => button}});
      assert.deepEqual(s.overrides, [['spindle', 10]]);
      s.running({canOverride: false}); assert.equal(button.disabled, true, 'the moved buttons follow canOverride');
    }],
    ['observation: reset(identity), normalized facts, no rendering in the status handler', async () => {
      const s = await suivi(); s.send(); s.layout(true); s.p.frame();
      const painted = s.text('home-v2-age'); assert.equal(painted, 'Rapport inconnu', 'no identity bound yet: unknown');
      s.running({operator: {reportUnits: 'in', wcs: 'G55'}, feedrate: 10, coordinates: {wpos: {x: '1.5', y: '2', z: '-0.25'}}});
      const o = s.obs().snapshot();
      assert.equal(o.identity.file, 'piece.nc'); assert.equal(o.identity.fingerprint, 'sha256:a'); assert(o.identity.jobKey);
      assert.equal(o.report.freshness, 'fresh'); assert.equal(o.report.units, 'in'); assert.equal(o.report.wcs, 'G55');
      assert.equal(o.report.feedMmMin, 254, 'feed converted from in/min'); assert.deepEqual(JSON.parse(JSON.stringify(o.report.position)), {x: 1.5, y: 2, z: -0.25});
      assert.equal(o.report.spindleS, 12000); assert.equal(o.acknowledgement.line, 420); assert.equal(o.acknowledgement.total, 1000);
      assert.equal(o.acknowledgement.meaning, 'accepted-not-machined');
      assert.equal(s.text('home-v2-age'), painted, 'nothing written before the animation frame');
      s.p.frame();
      assert.match(s.text('home-v2-age'), /^Rapport frais · < 1 s$/); assert.equal(s.text('home-v2-frame'), 'G55 · in');
      assert.equal(s.text('home-v2-program'), 'Programme chargé : Pièce 01.nc'); assert.equal(s.text('home-v2-geometry'), 'Géométrie inconnue');
      assert.match(s.text('home-v2-meaning'), /pas nécessairement usiné/);
      assert.equal(s.text('home-v2-position'), 'Rapportée · rapport frais');
      assert.equal(s.text('home-v2-now'), 'Séquences non préparées', 'no sequence invented without prepared metadata');
      // Absent values stay unknown, never zero.
      s.p.advance(250); s.running({operator: {reportUnits: null, wcs: null}, coordinates: {wpos: {x: '1', y: 'x'}}});
      const u = s.obs().snapshot(); assert.equal(u.report.feedMmMin, null); assert.equal(u.report.position, null); assert.equal(u.report.units, null);
      s.p.frame(); assert.equal(s.text('home-v2-frame'), 'Repère inconnu');
      // Another revision of the program: a new identity, the curve and markers start again.
      s.p.advance(300); s.running({revision: 2}); assert.equal(s.obs().snapshot().identity.revision, 2);
    }],
    ['2.5 s without a usable report: stale, frozen, said in words and form', async () => {
      const s = await suivi(); s.send(); s.layout(true); s.p.frame(); s.running(); s.p.frame();
      assert.equal(s.board.getAttribute('data-v2-report'), 'fresh');
      s.p.advance(2600); s.timers.splice(0).forEach((f) => f()); s.p.frame();
      assert.match(s.text('home-v2-age'), /^Rapport périmé/); assert.equal(s.text('home-v2-position'), 'Figée · rapport périmé');
      assert.equal(s.board.getAttribute('data-v2-report'), 'stale'); assert.equal(s.node('home-v2-position').getAttribute('data-state'), 'stale');
      s.running({statusAgeMs: 3000, fresh: false}); s.p.frame(); assert.match(s.text('home-v2-age'), /^Rapport périmé/);
      s.send(null); s.p.frame(); assert.match(s.text('home-v2-age'), /^Rapport périmé|^Rapport inconnu/);
    }],
    ['the same report refreshed (civil clock set back, age recomputed lower) never becomes fresh again', async () => {
      const s = await suivi(); s.send(); s.layout(true); s.p.frame();
      s.running({statusObservedAt: 10000, statusAgeMs: 0}); s.p.frame(); assert.match(s.text('home-v2-age'), /^Rapport frais/);
      s.p.advance(2501); s.running({statusObservedAt: 10000, statusAgeMs: 2501, fresh: false}); s.p.frame();
      assert.match(s.text('home-v2-age'), /^Rapport périmé/);
      // job-controls.js re-projects the same report with Date.now(): its age drops after a clock change.
      s.p.advance(1); s.running({statusObservedAt: 10000, statusAgeMs: 0, fresh: true}); s.p.frame();
      assert.match(s.text('home-v2-age'), /^Rapport périmé/, 'same report: no new arrival, no younger age');
      assert.equal(s.obs().snapshot().report.freshness, 'stale');
      // A really new report (another observation time) is fresh.
      s.p.advance(250); s.running({statusObservedAt: 10300, statusAgeMs: 0}); s.p.frame();
      assert.match(s.text('home-v2-age'), /^Rapport frais/);
    }],
    ['feed curve: drawn from chart() in a frame, gaps and reported markers, never while hidden', async () => {
      const s = await suivi(); s.send(); s.layout(true); s.p.frame();
      const empty = s.node('home-v2-curve-line').getAttribute('d'); assert(!empty, 'no line without samples');
      for (let i = 0; i < 6; i++) { s.p.advance(300); s.running({feedrate: 1500 + i * 50}); }
      s.p.advance(300); s.running({feedrate: 1800, overrides: {feed: 110, spindle: 100, rapid: 100}});
      s.p.advance(300); s.running({workflow: 'paused', activeState: 'Hold:0', feedrate: 0, overrides: {feed: 110, spindle: 100, rapid: 100}});
      assert.equal(s.node('home-v2-curve-line').getAttribute('d'), empty, 'nothing drawn in the handler');
      s.p.advance(1000); s.p.frame();
      const line = s.node('home-v2-curve-line').getAttribute('d');
      assert.match(line, /^M[\d.]+ [\d.]+(L[\d.]+ [\d.]+)+/); assert.match(s.node('home-v2-curve-marks').getAttribute('d'), /^M[\d.]+ 0V70M[\d.]+ 0V70$/);
      assert.match(s.text('home-v2-curve-events'), /Corrections : 1/); assert.match(s.text('home-v2-curve-events'), /pauses : 1/);
      assert.match(s.text('home-gauge-curve-title'), /^Avance rapportée, dernière minute · 0 à 2\s000 mm\/min$/u);
      const marks = s.obs().snapshot().markers; assert.deepEqual(JSON.parse(JSON.stringify(marks.map((m) => [m.kind, m.value, m.source]))),[['correction', 110, 'report'], ['pause', true, 'report']]);
      // A gap of data is a gap, not a line through it.
      s.p.advance(4000); s.running({feedrate: 900}); s.p.advance(1100); s.p.frame();
      assert.match(s.node('home-v2-curve-gaps').getAttribute('d'), /^M[\d.]+ 0H[\d.]+V70H[\d.]+Z/);
      assert(s.node('home-v2-curve-line').getAttribute('d').split('M').length >= 3, 'the line is split at the gap');
      // Suivi hidden: no chart, no write.
      s.navigate('menu'); const d = s.node('home-v2-curve-line').getAttribute('d'), age = s.text('home-v2-age');
      for (let i = 0; i < 8; i++) { s.p.advance(400); s.running({feedrate: 100}); } s.p.frame();
      assert.equal(s.node('home-v2-curve-line').getAttribute('d'), d); assert.equal(s.text('home-v2-age'), age);
    }],
    ['journal context (L6): a touched curve event opens it with the loaded identity, return restores Suivi', async () => {
      const s = await suivi(); const opened = [], went = [];
      s.p.window.addEventListener('cnc-v2-journal-open', (e) => opened.push(e.detail));
      s.p.window.cncShell.go = (name) => went.push(name);
      s.send(); s.layout(true); s.p.frame();
      for (let i = 0; i < 4; i++) { s.p.advance(300); s.running(); }
      s.p.advance(300); s.running({overrides: {feed: 120, spindle: 100, rapid: 100}});
      s.p.advance(1000); s.p.frame();
      const svg = s.node('home-gauge-curve').children.find((c) => c.tagName === 'SVG');
      svg.getBoundingClientRect = () => ({left: 100, width: 300});
      const x = Number(/^M([\d.]+) /.exec(s.node('home-v2-curve-marks').getAttribute('d'))[1]);
      s.node('home-gauge-curve').handlers.click({clientX: 100 + (x > 150 ? 20 : 280)});
      assert.equal(opened.length, 0, 'a touch far from any event opens nothing');
      s.node('home-gauge-curve').handlers.click({clientX: 100 + x + 5});
      assert.equal(opened.length, 1);
      const d = opened[0], id = s.p.api.identity.create({role: 'loaded', file: 'piece.nc', fingerprint: 'sha256:a', controller: 'A', generation: 'g1', revision: 1});
      assert.equal(d.marker.identity.jobKey, id.jobKey); assert.equal(d.marker.identity.key, id.key);
      const m = s.obs().snapshot().markers.find((k) => k.kind === 'correction');
      assert.equal(d.marker.interval.fromMonoMs, m.interval.fromMonoMs); assert.equal(d.marker.interval.toMonoMs, m.interval.toMonoMs);
      assert.equal(d.view.screen, 'home'); assert.deepEqual(s.overrides, [], 'no command from a curve touch');
      s.navigate('history'); s.p.emit('cnc-v2-journal-return', {view: d.view}); assert.deepEqual(went, ['home'], 'Suivi restored');
      s.p.emit('cnc-v2-journal-return', {view: {screen: 'files'}}); s.p.emit('cnc-v2-journal-return', {}); assert.deepEqual(went, ['home']);
      // Outside perf-v2: neither direction does anything.
      s.navigate('home'); s.send(); s.p.classes.delete('perf-v2'); s.p.emit('cnc-v2-change', s.p.api.state()); s.p.frame();
      s.node('home-gauge-curve').handlers.click({clientX: 100 + x}); s.p.emit('cnc-v2-journal-return', {view: d.view});
      assert.equal(opened.length, 1); assert.deepEqual(went, ['home']);
    }],
    ['D1: the same slots in idle, selection, running, paused, alarm, stale and lost states (structure only moves at rest)', async () => {
      const s = await suivi(); s.send(); s.layout(true); s.p.frame();
      const structure = () => JSON.stringify([s.left, s.node('home-zone-gauges'), s.node('home-zone-controls'), s.node('home-v2-actions'), s.node('home-v2-info'), s.ov].map(s.kids));
      const reference = structure();
      const states = [
        () => s.send({canStart: true}),
        () => s.p.emit('cnc-library-select', {file: 'other.nc', name: 'other.nc'}),
        () => s.running(),
        () => s.running({workflow: 'paused', activeState: 'Hold:0', canResume: true, spindleSpeed: 12000}),
        () => s.send({activeState: 'Alarm', alarmCode: 9}),
        () => s.running({statusAgeMs: 4000, fresh: false}),
        () => s.send(null, {halt: {workflow: 'running', canPause: true, canStop: true}}),
        () => s.send(null)
      ];
      for (const [i, state] of states.entries()) {
        s.p.advance(300); state(); s.p.frame();
        assert.equal(structure(), reference, 'state ' + i + ': same slots, same order');
        assert.equal(s.board.getAttribute('data-v2'), 'suivi');
      }
    }],
    ['holdLayout: no grid change during a job, the old layout returns only at rest', async () => {
      const s = await suivi(); s.send(); s.layout(true); s.p.frame(); const v2 = s.shape();
      s.running(); assert(s.p.api.state().holdLayout);
      s.p.classes.delete('perf-v2'); s.p.emit('cnc-v2-change', s.p.api.state()); s.p.frame();
      s.p.window.innerWidth = 1728; s.p.emit('resize'); s.p.frame(); s.layout(false); s.p.frame();
      assert.equal(s.shape(), v2, 'Run: layout frozen'); assert.equal(s.board.getAttribute('data-v2'), 'suivi');
      s.running({workflow: 'paused', activeState: 'Hold:0'}); s.p.frame(); assert.equal(s.shape(), v2, 'Hold: layout frozen');
      s.send({activeState: 'Alarm'}); s.p.frame(); assert.equal(s.shape(), v2, 'Alarm: layout frozen');
      s.send(); s.p.frame(); s.p.frame();
      assert.equal(s.board.getAttribute('data-v2'), null, 'at fresh Idle the layout may change');
    }],
    ['labels: S rapporté under v2, the laser set point wording kept', async () => {
      const s = await suivi(); s.send(); s.layout(true); s.p.frame();
      assert.equal(s.text('home-live-spindle-label'), 'S rapporté');
      s.p.window.cncProfile.kind = () => 'laser'; s.p.emit('cnc-profile-change'); assert.equal(s.text('home-live-spindle-label'), 'Consigne S rapportée');
    }]
  ]);
  console.log('PASS v2 Suivi: v1 DOM unchanged outside perf-v2, scene + band + frieze + one column with the curve at 1366 px, relays kept (sheet too), observation fed and reset, RAF-only rendering, stale form, curve gaps/markers, journal open/return (L6), holdLayout.');
})().catch((e) => { console.error(e); process.exitCode = 1; });
