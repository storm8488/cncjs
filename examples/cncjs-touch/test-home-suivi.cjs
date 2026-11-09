'use strict';
// Lot Suivi (écrans 2026-11): each display bug fixed on the follow-up screen, reproduced here, and the proof that no
// machine button changed its guards (disabled / hidden matrix of job-dashboard.js + job-resume.js in every state).
// Synthetic DOM (dom-fixture.cjs) and static reads of the sheets: no browser, no server, no controller command.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert').strict;
const {createDOM} = require('./dom-fixture.cjs');
const touch = (f) => fs.readFileSync(path.join(__dirname, 'touch', f), 'utf8');
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const rules = (css) => [...strip(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({selectors: m[1].split(',').map((s) => s.trim()), decl: m[2]}));
const has = (list, selector, decl) => list.some((r) => r.selectors.includes(selector) && (!decl || decl.test(r.decl)));

// ---- Sheets ----
const shared = rules(touch('shared-library.css'));
// Arrêter le travail: white on --danger-soft was 1.25:1 in the light theme, and a disabled Arrêter kept the active look.
assert(has(shared, '#home-job-stop:not(:disabled)', /color:var\(--danger-text\)/), 'active Arrêter: dark red text on the soft red');
assert(!shared.some((r) => r.selectors.includes('#home-job-stop')), 'no unscoped #home-job-stop rule: the disabled one keeps .t-btn:disabled');
const viewer = rules(touch('preview-viewer.css')), viewerText = strip(touch('preview-viewer.css'));
assert(has(viewer, '#preview-viewer #preview-job-stop:not(:disabled)', /background:var\(--danger\);color:var\(--on-danger\)/), 'enlarged preview: Arrêter readable in both themes (was 1.84:1)');
assert(!/#preview-viewer #preview-job-stop\{/.test(viewerText), 'no colour on the disabled Arrêter of the enlarged preview');
for (const m of viewerText.matchAll(/font(?:-size)?:[^;}]*?(\d+(?:\.\d+)?)px/g)) assert(Number(m[1]) >= 16, 'enlarged preview: text >= 16 px, media queries included: ' + m[0]);
assert(!/#a9bdc7|#b5c7d0|#9eafb9/.test(viewerText), 'no fixed pale grey on the light background (1.5 to 2:1)');
const pv3d = rules(touch('preview-3d.css'));
assert(has(pv3d, '.ks-ui .pv3d-status', /color:#eef3f6/) && has(pv3d, '.ks-ui .pv3d-status', /font-size:var\(--fs-16\)/), 'preview status: 16 px, light on its fixed dark fill (14 px, 2.1:1 before)');
assert(has(pv3d, '.ks-ui .pv3d-views button:not([aria-pressed="true"]):not(:disabled)', /color:#eef3f6/), 'view buttons readable in the light theme');
assert(has(pv3d, '.ks-ui .job-art .pv3d-status', /top:64px;bottom:auto/), 'Suivi: the status under the view selector, the Z legend at the bottom left visible');
const responsive = rules(touch('responsive.css'));
assert(has(responsive, 'body.ks-ui .job-dashboard #home-job-image', /min-width:0/), 'v1: the image may shrink beside its note');
assert(has(responsive, 'body.ks-ui .job-dashboard #home-job-image:not([hidden])+#home-image-status', /min-width:210px/), 'v1: the note keeps 210 px, never a one-letter column');
// Revue : a fixed 210 px column ran under « Ampliar la trayectoria » and « Ampliar » beside the short image of a pause.
assert(has(responsive, 'body.ks-ui .job-dashboard #home-job-image:not([hidden])+#home-image-status', /flex:0 1 auto/), 'v1: the note widens when the image leaves room');
assert(has(responsive, 'body.ks-ui.perf-wide .job-dashboard[data-zones] #home-job-image:not([hidden])+#home-image-status', /flex:0 0 210px/), 'v2 keeps its fixed note column');
const perf = rules(touch('performance-v2.css')), V2 = 'body.ks-ui.perf-wide.perf-v2 .job-dashboard[data-zones][data-v2="suivi"]';
// Revue : the alarm text stayed capped at three lines (ui-2027.css max-height) with room left in the slot.
assert(has(perf, V2 + '[data-v2-alert="1"] #home-job-ready', /max-height:none/), 'v2 alarm / hold text not capped at three lines');
// Revue : « Palper le zéro Z… » was cut at the bottom of the 235 px slot, at rest on a real CNC (canZeroZ) as during a probe.
assert(has(perf, V2 + ' #home-plate-title', /height:0/) && has(perf, V2 + ' #home-plate', /padding-top:var\(--sp-1\)/), 'v2 plate card compact enough for its button');
const ui = rules(touch('ui-2027.css'));
assert(has(ui, '#home-frame-start:disabled~#home-frame-help', /display:none/), 'laser framing: no help while Cadrer… is disabled');
assert(has(ui, '.ks-ui .home-job-primary[data-run="1"]', /grid-template-columns:1fr 2fr/), 'during a job the active Pause takes the large cell');
// Final harness: in the small cell, « Démarrer… » at 24 px broke across two lines at 1024 x 600 (142 px wide).
assert(has(ui, '.ks-ui .home-job-primary[data-run="1"] #home-job-start', /font-size:var\(--fs-20\)/), 'during a job Démarrer… at 20 px, its word whole');

// ---- A page of the fixture: i18n (optional language), job-dashboard.js, job-resume.js ----
function page(options = {}) {
  const listeners = {}, dom = createDOM(['home']);
  let mono = 1e6;
  const on = (n, f) => { (listeners[n] = listeners[n] || []).push(f); };
  const store = {'cncjs-touch-language-v1': options.lang || 'fr'};
  const window = {addEventListener: on, cncLibrarySelection: {file: 'a.nc', name: 'a.nc'}, CNCGrblHelp: require('./touch/grbl-help'), cncJobControls: {}, performance: {now: () => mono}};
  if (options.laser) window.cncProfile = {kind: () => 'laser'};
  dom.document.documentElement = {};
  // The override buttons (built by insertAdjacentHTML, a no-op here): same kinds and values as job-dashboard.js.
  for (const [kind, values] of [['feed', [-10, 0, 10, -1, 1]], ['spindle', [-10, 0, 10, -1, 1]], ['rapid', [25, 50, 100]]]) {
    for (const v of values) { const b = dom.element('button'); b.setAttribute('data-kind', kind); b.setAttribute('data-value', String(v)); dom.node('home-overrides').appendChild(b); }
  }
  const context = {window, document: dom.document, Date, localStorage: {getItem: (k) => store[k] === undefined ? null : store[k], setItem() {}},
    XMLHttpRequest: function () { this.open = () => {}; this.setRequestHeader = () => {}; this.send = () => {}; this.abort = () => {}; }};
  vm.createContext(context);
  if (options.lang) for (const f of ['i18n-messages.js', 'i18n.js']) vm.runInContext(touch(f), context, {filename: f});
  vm.runInContext(touch('job-dashboard.js'), context, {filename: 'job-dashboard.js'});
  vm.runInContext(touch('job-resume.js'), context, {filename: 'job-resume.js'});
  const emit = (n, d) => (listeners[n] || []).forEach((f) => f({detail: d}));
  const find = (root, id) => { for (const c of root.children || []) { if (c.id === id) return c; const f = find(c, id); if (f) return f; } return null; };
  const node = (id) => find(dom.document.body, id) || dom.node(id);
  return {dom, node, window, emit, advance(ms) { mono += ms; }, send: (m, extra = {}) => emit('cnc-job-status', Object.assign({machine: m, simulation: false, busy: false}, extra))};
}
const laserProfile = {kind: 'laser', capabilities: {laserFrame: {supported: false, reason: 'Cadrage indisponible.'}, laserResume: {supported: true}}};
const base = {port: 'P', name: 'a.nc', revision: 1, fresh: true, total: 100, received: 0, activeState: 'Idle', workflow: 'idle', canLoad: true, canStart: true, canPause: false, canResume: false, canStop: false, canOverride: false, canZeroZ: true, canSpindleStop: false, spindleSpeed: 0};
const run = {...base, received: 40, activeState: 'Run', workflow: 'running', canLoad: false, canStart: false, canPause: true, canStop: true, canOverride: true, canZeroZ: false};

// ---- Machine buttons: the guards did not move (matrix recorded on the code before the lot) ----
const STATES = {
  repos: base, travail: run,
  pause: {...base, received: 40, activeState: 'Hold:0', workflow: 'paused', canLoad: false, canStart: false, canResume: true, canStop: true, canOverride: true, canZeroZ: false, spindleSpeed: 1000, canSpindleStop: true, programPause: {kind: 'M0'}},
  alarme: {...base, received: 40, activeState: 'Alarm', alarmCode: 1, workflow: 'running', canLoad: false, canStart: false, canStop: true, canZeroZ: false},
  alarmeRepos: {...base, activeState: 'Alarm', alarmCode: 9, canLoad: false, canStart: false, canZeroZ: false},
  homing: {...base, activeState: 'Home', homing: true, canLoad: false, canStart: false, canStop: true, canZeroZ: false},
  palpage: {...base, probing: true, canLoad: false, canStart: false, canStop: true, canZeroZ: false},
  pilotePris: {...base, canLoad: false, canStart: false, canZeroZ: false, loadReason: 'Un autre appareil pilote la machine.'},
  perime: {...base, fresh: false, canStart: true, canLoad: true},
  jog: {...base, motion: {jog: true}, canStop: false, canStart: false, canLoad: false}
};
const BUTTONS = ['home-job-load', 'home-job-start', 'home-job-pause', 'home-job-resume', 'home-job-stop', 'home-job-primary-row', 'home-job-resume-row', 'home-plate', 'home-plate-probe', 'home-frame', 'home-frame-start', 'home-resume-line', 'home-pause-m5', 'home-program-pause'];
// D = disabled, H = hidden, in the order of BUTTONS, then | the overrides card (H) and its buttons (D): feed ×5,
// spindle ×5, rapids ×3; recorded with job-dashboard.js and job-resume.js of commit 44c6a67c.
const EXPECTED = {
  'cnc:repos': '-- -- D- D- D- -- -H -- -- -H -- -- -H -H | - DDDDD DDDDD DDD', 'cnc:travail': 'DH D- -- D- -- -- -H -H D- -H -- -H -H -H | - ----- ----- ---',
  'cnc:pause': 'DH D- D- -- -- -H -- -H D- -H -- -H -- -- | - ----- ----- ---', 'cnc:alarme': 'DH D- D- D- -- -- -H -H D- -H -- -H -H -H | - DDDDD DDDDD DDD',
  'cnc:alarmeRepos': 'D- D- D- D- D- -H -H -H D- -H -- -H -H -H | - DDDDD DDDDD DDD', 'cnc:homing': 'D- D- D- D- -- -- -H -H D- -H -- -H -H -H | - DDDDD DDDDD DDD',
  'cnc:palpage': 'D- D- D- D- -- -- -H -- D- -H -- -H -H -H | - DDDDD DDDDD DDD', 'cnc:pilotePris': 'D- D- D- D- D- -- -H -H D- -H -- -H -H -H | - DDDDD DDDDD DDD',
  'cnc:perime': 'D- D- D- D- D- -- -H -- -- -H -- -H -H -H | - DDDDD DDDDD DDD', 'cnc:jog': 'D- D- D- D- -- -- -H -- -- -H -- -H -H -H | - DDDDD DDDDD DDD',
  'cnc:occupe': 'DH D- -- D- -- -- -H -H D- -H -- -H -H -H | - DDDDD DDDDD DDD', 'cnc:horsLigne': 'D- D- -- D- -- -- -H -H D- -H -- -H -H -H | H DDDDD DDDDD DDD',
  'cnc:aucun': 'D- D- D- D- D- -- -H -H D- -H -- -H -H -H | H DDDDD DDDDD DDD',
  'laser:repos': '-- -- D- D- D- -- -H -H -- -- D- -- -H -H | - DDDDD DDDDD DDD', 'laser:travail': 'DH D- -- D- -- -- -H -H D- -H D- -H -H -H | - ----- ----- ---',
  'laser:pause': 'DH D- D- -- -- -H -- -H D- -H D- -H -- -- | - ----- ----- ---', 'laser:alarme': 'DH D- D- D- -- -- -H -H D- -H D- -H -H -H | - DDDDD DDDDD DDD',
  'laser:alarmeRepos': 'D- D- D- D- D- -H -H -H D- -- D- -H -H -H | - DDDDD DDDDD DDD', 'laser:homing': 'D- D- D- D- -- -- -H -H D- -- D- -H -H -H | - DDDDD DDDDD DDD',
  'laser:palpage': 'D- D- D- D- -- -- -H -H D- -- D- -H -H -H | - DDDDD DDDDD DDD', 'laser:pilotePris': 'D- D- D- D- D- -- -H -H D- -- D- -H -H -H | - DDDDD DDDDD DDD',
  'laser:perime': 'D- D- D- D- D- -- -H -H -- -- D- -H -H -H | - DDDDD DDDDD DDD', 'laser:jog': 'D- D- D- D- -- -- -H -H -- -- D- -H -H -H | - DDDDD DDDDD DDD',
  'laser:occupe': 'DH D- -- D- -- -- -H -H D- -H D- -H -H -H | - DDDDD DDDDD DDD', 'laser:horsLigne': 'D- D- -- D- -- -- -H -H D- -H -- -H -H -H | H DDDDD DDDDD DDD',
  'laser:aucun': 'D- D- D- D- D- -- -H -H D- -H -- -H -H -H | H DDDDD DDDDD DDD'
};
for (const lang of [null, 'es']) {
  const p = page(lang ? {lang} : {});
  // Then the overrides: the card hidden or not, and each button disabled or not (feed ×5, spindle ×5, rapids ×3).
  const overrides = () => (p.node('home-overrides').hidden ? 'H' : '-') + ' ' + ['feed', 'spindle', 'rapid'].map((k) => p.node('home-overrides').children.filter((b) => b.getAttribute('data-kind') === k).map((b) => b.disabled ? 'D' : '-').join('')).join(' ');
  const snap = () => BUTTONS.map((id) => { const n = p.node(id); return (n.disabled ? 'D' : '-') + (n.hidden ? 'H' : '-'); }).join(' ') + ' | ' + overrides();
  const seen = {};
  for (const [kind, prof] of [['cnc', null], ['laser', laserProfile]]) {
    for (const [name, m] of Object.entries(STATES)) { p.send({...m, machineProfile: prof}); seen[kind + ':' + name] = snap(); }
    p.send({...run, machineProfile: prof}, {busy: true}); seen[kind + ':occupe'] = snap();
    p.emit('cnc-job-status', {machine: null, halt: {canPause: true, canStop: true, port: 'P'}, simulation: false}); seen[kind + ':horsLigne'] = snap();
    p.send(null); seen[kind + ':aucun'] = snap();
  }
  assert.deepEqual(seen, EXPECTED, 'disabled / hidden of every machine button unchanged (' + (lang || 'fr') + ')');
}

// ---- Behaviour, v1 (French) ----
{
  const p = page();
  // data-run: presentation only, during a job; nothing else reads it.
  p.send(base); assert.equal(p.node('home-job-primary-row').getAttribute('data-run'), '0');
  p.send(run); assert.equal(p.node('home-job-primary-row').getAttribute('data-run'), '1');
  const readers = fs.readdirSync(path.join(__dirname, 'touch')).filter((f) => /\.js$/.test(f) && touch(f).indexOf('data-run') >= 0);
  assert.deepEqual(readers, ['job-dashboard.js'], 'data-run written by render() only');
  assert.equal(touch('job-dashboard.js').split("'data-run'").length - 1, 2, 'data-run: one compare and one write, read by no handler');
  // « Temps restant : estimation après démarrage » took two lines in FR at 768 px.
  p.send(base); assert.equal(p.node('home-job-eta').textContent, 'Temps restant : après démarrage');
  // Alarm during a job: the estimate is suspended (it was « calcul en cours… » or a remaining time), nothing learned.
  p.send({...run, activeState: 'Alarm', alarmCode: 1, canPause: false});
  assert.equal(p.node('home-job-eta').textContent, 'Alarme — estimation suspendue');
  for (let i = 1; i <= 12; i++) { p.advance(1000); p.send({...run, received: 40 + i, activeState: 'Alarm', alarmCode: 1, canPause: false}); }
  assert.equal(p.node('home-job-eta').textContent, 'Alarme — estimation suspendue', 'still suspended');
  p.advance(1000); p.send({...run, received: 53});
  assert.equal(p.node('home-job-eta').textContent, 'Temps restant : calcul en cours…', 'no rhythm learned during the alarm');
  for (let i = 1; i <= 11; i++) { p.advance(1000); p.send({...run, received: 53 + i}); }
  assert.match(p.node('home-job-eta').textContent, /^Temps restant estimé : /, 'learned again once running');
  // Revue : the alarm title also wins over « toutes les lignes acquittées » and « travail arrêté » (both expect a normal end).
  p.send({...run, received: 100, activeState: 'Alarm', alarmCode: 1, canPause: false});
  assert.equal(p.node('home-job-eta').textContent, 'Alarme — estimation suspendue', 'alarm with every line acknowledged');
  p.send({...base, received: 20, activeState: 'Alarm', alarmCode: 9, canLoad: false, canStart: false});
  assert.equal(p.node('home-job-eta').textContent, 'Alarme — estimation suspendue', 'alarm at rest after a stop');
  // Revue : under « estimation suspendue » the line by the moves still gave a remaining time.
  p.window.CNCMotionEstimate = {};
  const image = p.node('home-job-image'), estimate = () => { image.hidden = false; image.cncPreview = {file: 'a.nc'}; };
  estimate(); p.send(run); assert.notEqual(p.node('home-job-motion').textContent, '', 'the line by the moves shows while running');
  estimate(); p.send({...run, activeState: 'Alarm', alarmCode: 1, canPause: false});
  assert.equal(p.node('home-job-motion').textContent, '', 'no estimate by the moves during an alarm');
  assert.equal(p.node('home-job-motion').hidden, true);
  p.window.CNCMotionEstimate = undefined;
  // v2 messages slot: the alarm and hold texts get their room (performance-v2.css reads data-v2-alert).
  const board = p.node('home-left').parentNode;
  p.send({...run, activeState: 'Alarm', alarmCode: 1}); assert.equal(board.getAttribute('data-v2-alert'), '1');
  p.send(run); assert.equal(board.getAttribute('data-v2-alert'), '0');
  p.send(STATES.pause); assert.equal(board.getAttribute('data-v2-alert'), '1');
  // CNC: a speed, with its unit.
  p.send({...run, spindleSpeed: 12000}); assert.match(p.node('home-live-spindle').textContent, /^12.000 tr\/min$/u);
  // Plate or resume form open: the v2 messages slot gives it room (performance-v2.css reads data-v2-form).
  p.send(STATES.palpage); assert.equal(board.getAttribute('data-v2-form'), '1', 'plate shown during a probe');
  p.send(run); assert.equal(board.getAttribute('data-v2-form'), '0');
}
{
  // Laser: S is a set point, not a speed (« Consigne S rapportée 0 tr/min » before).
  const p = page({laser: true});
  p.send({...run, machineProfile: laserProfile, spindleSpeed: 800}); assert.equal(p.node('home-live-spindle').textContent, '800');
}

// ---- i18n (Spanish) ----
{
  const p = page({lang: 'es'});
  // The server's literal reason during a probe (job-service.js, motion.js, plate-probe.js) was shown in French.
  p.send(STATES.palpage, {}); p.send({...STATES.palpage, loadReason: 'Palpage en cours.'});
  assert.equal(p.node('home-job-ready').textContent, 'Palpando.');
  p.send({...base, name: 'a.nc'}); assert.equal(p.node('home-job-load').textContent, 'Recargar archivo', 'shorter Spanish label (3 lines in 64 px before)');
  p.send(base); assert.equal(p.node('home-job-eta').textContent, 'Tiempo restante: tras iniciar');
  p.send({...run, activeState: 'Alarm', alarmCode: 1}); assert.equal(p.node('home-job-eta').textContent, 'Alarma — estimación suspendida');
  // Resume plan: the server's fixed notes translated, the others shown as they come.
  const R = p.window.CNCJobResume;
  const text = R.planText({from: 12, total: 100, line: 'G1 X1', safeZ: 5, position: {X: 1, Y: 2, Z: -1}, notes: ['Le programme ne fixe pas ses unités (G20/G21) : la machine garde les siennes.', 'Repère G55 choisi à la ligne 4 : la reprise part des positions redonnées sous ce repère.']});
  assert.match(text, /El programa no fija sus unidades \(G20\/G21\): la máquina mantiene las suyas\./);
  assert.match(text, /Repère G55 choisi à la ligne 4/, 'a note with values stays as the server wrote it');
  assert.match(R.dialogNote('start', {resume: {from: 12, total: 100, line: 'G1 X1', notes: ['Le programme ne fixe pas son mode d’avance (G94) : la machine garde le sien.']}}), /El programa no fija su modo de avance \(G94\)/);
}
// Every complete-sentence refusal of the touch services (conflict('…')) has its catalogue row.
{
  const window = {}; vm.runInNewContext(touch('i18n-messages.js'), {window});
  for (const f of fs.readdirSync(path.join(__dirname, 'touch')).filter((f) => /^i18n-messages-.*\.js$/.test(f))) vm.runInNewContext(touch(f), {window});
  const keys = new Set(window.CNCTouchMessages.map((r) => r[0].trim().replace(/\s+/g, ' ')));
  const dir = path.join(__dirname, '..', '..', 'src', 'server', 'services', 'touch'), reasons = new Set();
  (function walk(d) { for (const f of fs.readdirSync(d)) { const q = path.join(d, f); if (fs.statSync(q).isDirectory()) { if (f !== '__tests__') walk(q); } else if (/\.js$/.test(f)) for (const m of fs.readFileSync(q, 'utf8').matchAll(/conflict\('([^']*)'\s*[,)]/g)) reasons.add(m[1]); } })(dir);
  assert(reasons.has('Palpage en cours.') && reasons.size > 20, 'server reasons found: ' + reasons.size);
  const missing = [...reasons].filter((r) => !keys.has(r.trim().replace(/\s+/g, ' ')));
  assert.deepEqual(missing, [], 'server refusals without a catalogue row');
}
// Revue : the Spanish v2 legend « … no necesariamente mecani » was cut by 40 px in its fixed 64 px band (contract D1).
assert(touch('job-dashboard.js').includes("'Confirmado = aceptado por Grbl, quizá sin mecanizar.'"), 'shorter Spanish legend of the v2 band');
// Revue : the v2 fixture never showed the plate at rest, as a real CNC does (job-service.js plateReady → canZeroZ).
assert(/kind === 'cnc'\) Object\.assign\(c, \{ canZeroZ: true, zeroZReason: '' \}\)/.test(fs.readFileSync(path.join(__dirname, 'browser-run.cjs'), 'utf8')), 'v2 fixture: canZeroZ at rest on a CNC');
// Harness (browser-run.cjs MEASURE): a text cut by an outer clipping box was missed once an inner one did not cut it.
{
  const src = fs.readFileSync(path.join(__dirname, 'browser-run.cjs'), 'utf8'), start = src.indexOf("Array.prototype.forEach.call(document.querySelectorAll('#screen-home .home-stop .t-help");
  assert(start > 0, 'clip measure found'); const block = src.slice(start, src.indexOf('\n  });\n', start) + 6);
  const box = (id, bottom, parent, clip) => ({id, className: id, tagName: 'DIV', textContent: id, parentElement: parent, cs: {overflowX: clip ? 'hidden' : 'visible', overflowY: clip ? 'hidden' : 'visible'}, getBoundingClientRect: () => ({bottom, right: 100})});
  const body = box('body', 1000, null, false), outer = box('outer', 80, body, true), inner = box('inner', 100, outer, true), plain = box('plain', 120, inner, false), text = box('text', 90, plain, false);
  const truncated = [];
  vm.runInNewContext(block, {document: {body, querySelectorAll: () => [text]}, visible: () => true, getComputedStyle: (n) => n.cs, truncated});
  assert.deepEqual(truncated.map((t) => [t.id, t.scrollWidth, t.textOverflow]), [['text', 10, 'clipped by #outer']], 'outer clip found, reported once');
}
// The laser view's worker error (French) is translated; the Suivi laser status is not repeated beside the « non vérifié » note.
assert(/reject\(new Error\(t\(m\.message\)\)\)/.test(touch('laser-view.js')), 'worker error through t()');
assert(/status\(host, noted\(host\) \? '' : t\('Vue laser indisponible : aperçu sans empreinte/.test(touch('preview-3d.js')), 'one instruction in Suivi, not two');
console.log('PASS Suivi lot: harness clip measure through every ancestor, alarm title before the end texts, no estimate by the moves in an alarm, v2 alarm text uncapped, v2 plate button in its slot, v1 note beside a short image, Arrêter readable and disabled look kept, enlarged preview >= 16 px and readable, preview status 16 px at the top, v1 note column, framing help, data-run (display only), alarm estimate suspended, S laser without unit, v2 alert / form attributes, ES « Palpando. » and « Recargar archivo », resume notes translated, every server refusal in the catalogue; disabled / hidden matrix of the machine buttons and overrides identical to the code before the lot.');
