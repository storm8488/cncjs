'use strict';
// Sonde screen of the real page (probe-ui.js with probe-real.js, conception § 4.2 / § 4.4): Palper… shown and
// inactive with its reason, active once everything is ready; a tap prepares the blockProbe confirmation with the
// chosen operation; a coded refusal stays in #probe-message with the field named; the running cycle shows its step,
// its bar and Arrêter (relayed to #job-stop); stopping, done and failed say what happened to the origin; the work
// frame follows the active one until the operator picks another; « Zéro Z avec plaque → Suivi » asks for the plate
// card. Synthetic DOM, no network, no machine.
const assert = require('assert').strict, fs = require('fs'), vm = require('vm');
const { createDOM } = require('./dom-fixture.cjs');
const profile = { name: 'Bloc atelier', corner: '--', directionX: 1, directionY: 1, thickness: 5, faceX: -9.9, faceY: -9.9, fast: 100, slow: 25, search: 10, retract: 2, clearance: 5 };
function screen(options = {}) {
  const dom = createDOM([]), listeners = {}, events = [], calls = [], numeric=[];
  const measured=dom.element('input');measured.setAttribute('data-probe-field','thickness');
  dom.node('probe-confirm').parentElement = dom.document.body;
  const notes = [dom.element('p'), dom.element('p')], ops = ['Z', 'X', 'Y', 'XYZ'].map((a) => { const b = dom.element('button'); b.setAttribute('data-probe-operation', a); return b; });
  const picked = {}; dom.document.querySelector = (sel) => picked[sel] || (picked[sel] = dom.element('div'));
  dom.document.querySelectorAll = (sel) => (sel === '[data-probe-field]' ? [measured] : sel === '[data-probe-operation]' ? ops : sel === '#screen-probe-transfer .probe-note' ? notes : []);
  const stored = new Map([['cnc-touch-probes-v1-real', JSON.stringify({ version: 1, profiles: [profile], selected: 0, diameter: options.diameter === undefined ? 6 : options.diameter, removed: null })]]);
  let answer = { opened: true, error: null };
  const window = { CNCNumeric:{bind:(field,rules)=>numeric.push({field,rules})},CNCProbeTransfer: require('./touch/probe-transfer.js'), CNCProbeProfiles: require('./touch/probe-profiles.js'), CNCProfileStorage: require('./touch/profile-storage.js'),
    cncJobControls: { stop(){dom.node('job-stop').click();},prepareCommand(op, extra) { calls.push([op, JSON.parse(JSON.stringify(extra))]); return Promise.resolve(answer); } },
    addEventListener(n, f) { (listeners[n] || (listeners[n] = [])).push(f); }, dispatchEvent(e) { events.push(e); (listeners[e.type] || []).slice().forEach((f) => f(e)); } };
  // As in index.html: the catalogs and cncI18n, then the model and probe-real.js, then probe-ui.js.
  dom.document.documentElement = {}; dom.document.title = '';
  const context = vm.createContext({ window, document: dom.document, localStorage: { getItem: (k) => (stored.has(k) ? stored.get(k) : null), setItem: (k, v) => stored.set(k, v) },
    Date, Promise, JSON, CustomEvent: class { constructor(type, o) { this.type = type; this.detail = o && o.detail; } }, setInterval() { throw Error('No cycle allowed'); }, setTimeout() { return 0; }, clearTimeout() {} });
  for (const n of ['i18n-messages.js', 'i18n-messages-machine.js', 'i18n-messages-profiles.js', 'i18n.js', 'probe-model.js', 'probe-real.js', 'probe-ui.js']) vm.runInContext(fs.readFileSync(__dirname + '/touch/' + n, 'utf8'), context);
  const $ = dom.node, flush = () => new Promise(setImmediate);
  const status = (machine, extra = {}) => window.dispatchEvent({ type: 'cnc-job-status', detail: Object.assign({ machine, simulation: false, busy: false, transportConnected: true, pilot: { state: 'mine', value: 'Cet appareil' } }, extra) });
  const show = (name) => window.dispatchEvent({ type: 'cnc-screen-change', detail: name });
  return { dom, $, picked, ops, calls, events, status, show, flush, window, numeric, answer: (a) => { answer = a; } };
}
const machine = (patch) => Object.assign({ port: '/dev/ttyUSB0', fresh: true, activeState: 'Idle', workflow: 'idle', operator: { wcs: 'G54', reportUnits: 'mm' }, canStop: false, canZeroZ: true, zeroZReason: '',
  canBlockProbe: true, blockProbeReason: '', blockProbe: null, probing: false }, patch || {});
(async () => {
  const s = screen(), $ = s.$;
  s.show('probe');
  assert(s.numeric.find(n=>n.field.getAttribute('data-probe-field')==='thickness').rules.optional,'profile measurement can be emptied');
  assert(s.numeric.find(n=>n.field===$('probe-diameter')).rules.optional,'diameter can be emptied');
  // Real header, real launch visible (labelled after the operation), the bench preparation hidden.
  assert.equal(s.picked['#screen-probe .ks-panel-intro h2'].textContent, 'Sonde : palpage, profils et diagnostic');
  assert.equal(s.picked['#screen-probe .ks-panel-intro p'].textContent, 'Palpage réel au bloc · exécuté par la machine');
  assert.equal($('probe-start').hidden, false); assert.equal($('probe-preparation-open').hidden, true);
  assert.match(s.picked['[data-probe-pane="1"] > p'].textContent, /^Z : recherche vers le bas sur le dessus du bloc\. XYZ réel : ce coin et les sens fixent/, 'the corner note of the real page');
  // No machine yet: inactive with its reason.
  s.status(null);
  assert.equal($('probe-start').disabled, true); assert.equal($('probe-availability').textContent, 'Aucune machine connectée : touchez Connecter la CNC dans le Menu.');
  assert.equal($('probe-phase').hidden, true, 'no phase line before a block probe exists'); assert.equal($('probe-progress').hidden, true);
  // The server refuses (contact test to do): inactive, the server's reason and where to go.
  s.status(machine({ canBlockProbe: false, blockProbeReason: 'Test du contact à faire : touchez l’outil avec le bloc puis relâchez (contact vu, puis libre) avant de palper.' }));
  assert.equal($('probe-start').disabled, true);
  assert.equal($('probe-availability').textContent, 'Test du contact à faire : touchez l’outil avec le bloc puis relâchez (contact vu, puis libre) avant de palper. Ouvrez Diagnostic de l’entrée.');
  // Another device pilots: said first.
  s.status(machine(), { pilot: { state: 'other', name: 'Poste 9f2c', value: 'Poste 9f2c' } });
  assert.equal($('probe-availability').textContent, 'Pilotée par « Poste 9f2c » : touchez Pilote (bandeau) pour prendre la main.'); assert.equal($('probe-start').disabled, true);
  // Ready: active, the start instruction of the operation; XYZ chosen by its button.
  s.status(machine());
  assert.equal($('probe-start').disabled, false); assert.equal($('probe-start').textContent, 'Palper Z…'); assert.equal($('probe-availability').textContent, 'Outil au-dessus du bloc, pince en place.');
  s.ops[3].handlers.click();
  assert.equal($('probe-start').textContent, 'Palper XYZ…'); assert.equal($('probe-availability').textContent, 'Outil au-dessus du coin extérieur du bloc, pince en place.');
  // The tap prepares the server's confirmation for the chosen operation, with the profile and the active work frame.
  $('probe-wcs').value = 'G54';
  s.answer({ opened: false, error: { code: 'ETOUCH_PROBE_PARAM', params: { field: 'fast', min: 10, max: 200 }, message: 'Profil de sonde : fast hors des limites du palpage réel (10 à 200). Modifiez le profil.' } });
  $('probe-start').click();
  assert.deepEqual(s.calls.at(-1), ['blockProbe', { axes: 'XYZ', wcs: 'G54', diameter: 6, profile: { thickness: 5, faceX: -9.9, faceY: -9.9, fast: 100, slow: 25, search: 10, retract: 2, clearance: 5, corner: '--', directionX: 1, directionY: 1 } }]);
  assert.equal($('probe-start').disabled, true, 'inactive while the confirmation is prepared');
  await s.flush();
  // A refusal stays in #probe-message, field named, until a field changes.
  assert.equal($('probe-message').textContent, 'Profil de sonde : vitesse d’approche hors des limites du palpage réel (10 à 200). Modifiez le profil.'); assert.equal($('probe-message').hidden, false);
  s.status(machine({ statusAgeMs: 300 }));
  assert.match($('probe-message').textContent, /vitesse d’approche/, 'kept over the next reports');
  $('probe-diameter').value = '6'; $('probe-diameter').handlers.change.call($('probe-diameter'));
  assert.equal($('probe-message').textContent, ''); assert.equal($('probe-message').hidden, true);
  // An opened confirmation leaves nothing in the message.
  s.answer({ opened: true, error: null }); $('probe-start').click(); await s.flush(); assert.equal($('probe-message').textContent, '');
  // Confirmed, the first state of the cycle not here yet (job-controls.js detail.probeRun): Arrêter of this screen offered at once, Palper… inactive.
  let stops = 0; $('job-stop').handlers.click = () => { stops++; };
  s.status(machine({ canStop: true, canPause: true }), { probeRun: '/dev/ttyUSB0' });
  assert.equal($('probe-stop').disabled, false, 'Arrêter before the first state of the cycle'); $('probe-stop').click(); assert.equal(stops, 1);
  assert.equal($('probe-start').disabled, true); assert.equal($('probe-wcs').disabled, true);
  s.status(machine({ canStop: true, canPause: true }), { probeRun: '/dev/other' }); assert.equal($('probe-stop').disabled, true, 'another port: not this probe');
  s.status(machine()); assert.equal($('probe-stop').disabled, true); assert.equal($('probe-start').disabled, false);
  stops = 0;
  // Running: step, bar, Arrêter relayed to the strip's #job-stop; nothing else on the screen acts.
  const running = { id: 'b1', axes: 'XYZ', wcs: 'G54', state: 'running', step: { index: 8, total: 22, code: 'X_FAST' }, startedAt: 1, endedAt: null, contacts: { Z: -119.565 }, written: 'no', origin: null, values: null, command: null, work: null, failure: null, needsHoming: false };
  s.status(machine({ canBlockProbe: false, blockProbeReason: 'Palpage en cours.', probing: true, canStop: true, canPause: true, activeState: 'Run', blockProbe: running }));
  assert.equal($('probe-phase').hidden, false); assert.equal($('probe-phase').textContent, 'Étape 8 / 22 · X · approche'); assert.equal($('probe-progress').value, 36);
  assert.equal($('probe-message').textContent, 'Palpage en cours. Arrêter interrompt.');
  assert.equal($('probe-start').disabled, true); assert.equal($('probe-availability').textContent, '', 'no reason during the cycle');
  for (const id of ['probe-profile', 'probe-wcs', 'probe-diameter', 'probe-profiles', 'probe-transfer-open', 'probe-test']) assert.equal($(id).disabled, true, id + ' inactive during the cycle');
  assert(s.ops.every((b) => b.disabled), 'operation buttons inactive during the cycle');
  assert.equal($('probe-stop').disabled, false); $('probe-stop').click(); assert.equal(stops, 1, 'Arrêter relayed to #job-stop');
  $('job-stop').disabled = true; $('probe-stop').click(); assert.equal(stops, 1, 'nothing when #job-stop refuses');
  // Astra n° 2: the state lost during the cycle, the last busy target kept (detail.halt): Arrêter stays offered.
  $('job-stop').disabled = false;
  s.status(null, { transportConnected: false, halt: { port: '/dev/ttyUSB0', workflow: 'idle', canPause: true, canStop: true } });
  assert.equal($('probe-stop').disabled, false, 'Arrêter with a lost state'); $('probe-stop').click(); assert.equal(stops, 2);
  s.status(null, { transportConnected: false, halt: null }); assert.equal($('probe-stop').disabled, true);
  // Stopping: the stop is not over yet.
  s.status(machine({ canBlockProbe: false, probing: true, canStop: true, blockProbe: Object.assign({}, running, { state: 'stopping', failure: { code: 'ETOUCH_PROBE_STOPPED', params: {}, message: 'Palpage interrompu par Arrêter.' }, needsHoming: true }) }));
  assert.equal($('probe-phase').textContent, 'Arrêt en cours…');
  assert.equal($('probe-message').textContent, 'Palpage interrompu par Arrêter. Origine de travail inchangée. Refaites la prise d’origine ($H) avant de recommencer.');
  assert.equal($('probe-start').disabled, true);
  // Failed: what happened, the origin kept; the results open.
  s.status(machine({ canBlockProbe: false, blockProbeReason: 'Machine non référencée : faites la prise d’origine ($H) avant de palper.', blockProbe: Object.assign({}, running, { id: 'b1', state: 'failed', step: { index: 9, total: 22, code: 'X_RETRACT' }, failure: { code: 'ETOUCH_PROBE_NO_CONTACT', params: { axis: 'X', search: 10 }, message: 'x' } }) }));
  assert.equal($('probe-phase').textContent, 'Palpage interrompu');
  assert.equal($('probe-message').textContent, 'Aucun contact en X sur 10 mm : rapprochez l’outil et vérifiez la pince. Origine de travail inchangée.');
  assert.equal($('probe-availability').textContent, 'Machine non référencée : faites la prise d’origine ($H) avant de palper.');
  for (const id of ['probe-profile', 'probe-wcs', 'probe-diameter']) assert.equal($(id).disabled, false, id + ' usable again');
  // Done: the work position read back, the results screen with one line per axis.
  const done = Object.assign({}, running, { id: 'b2', state: 'done', step: { index: 22, total: 22, code: 'VERIFY' }, written: 'yes', contacts: { Z: -119.565, X: 93, Y: 92 }, origin: { X: 105.9, Y: 104.9, Z: -124.565 }, values: { X: 0, Y: 0, Z: 10 }, command: 'G10 L20 P1 X0 Y0 Z10', work: { x: 0, y: 0, z: 10 } });
  s.status(machine({ blockProbe: done }));
  assert.equal($('probe-phase').textContent, 'Palpage XYZ terminé'); assert.equal($('probe-progress').value, 100);
  assert.equal($('probe-message').textContent, 'Origine G54 écrite. Position de travail : X 0.000 · Y 0.000 · Z 10.000.');
  assert.equal($('probe-result').disabled, false); $('probe-result').click();
  assert.equal(s.events.filter((e) => e.type === 'cnc-navigate').at(-1).detail, 'probe-report');
  s.show('probe-report');
  assert.deepEqual($('probe-result-values').children.map((c) => c.textContent), ['X · contact machine 93.000 · zéro machine 105.900 · valeur écrite 0.000', 'Y · contact machine 92.000 · zéro machine 104.900 · valeur écrite 0.000',
    'Z · contact machine -119.565 · zéro machine -124.565 · valeur écrite 10.000', 'Ligne envoyée : G10 L20 P1 X0 Y0 Z10', 'Position de travail relue : X 0.000 · Y 0.000 · Z 10.000']);
  assert.equal($('probe-result-summary').textContent, 'Palpage XYZ terminé · Origine G54 écrite. Position de travail : X 0.000 · Y 0.000 · Z 10.000.');
  for (const id of ['probe-log', 'probe-export', 'probe-reset', 'probe-report-stop']) assert.equal($(id).hidden, true, id + ': no bench journal, export or reset on the real page');
  s.show('probe');
  // The work frame follows the active one, until the operator picks another.
  s.status(machine({ operator: { wcs: 'G55' } })); assert.equal($('probe-wcs').value, 'G55');
  assert.equal($('probe-start').disabled, false);
  $('probe-wcs').value = 'G56'; $('probe-wcs').handlers.change.call($('probe-wcs'));
  s.status(machine({ operator: { wcs: 'G57' } })); assert.equal($('probe-wcs').value, 'G56', 'a choice of the operator is kept');
  assert.equal($('probe-availability').textContent, 'Repère choisi G56 différent du repère actif G57 : choisissez G57.'); assert.equal($('probe-start').disabled, true);
  // A request pending in the job controls (busy): inactive without a reason.
  $('probe-wcs').value = 'G57'; s.status(machine({ operator: { wcs: 'G57' } }), { busy: true }); assert.equal($('probe-start').disabled, true); assert.equal($('probe-availability').textContent, 'Outil au-dessus du coin extérieur du bloc, pince en place.');
  // « Zéro Z avec plaque → Suivi »: Suivi, then the plate card is asked for (job-resume.js scrolls to it).
  const zero = $('probe-test').parentNode.children.find((c) => c.id === 'probe-zero-z');
  assert(zero, 'the plate button'); s.status(machine()); assert.equal(zero.disabled, false);
  zero.handlers.click(); const last = s.events.slice(-2).map((e) => [e.type, e.detail]);
  assert.deepEqual(last, [['cnc-navigate', 'home'], ['cnc-plate-show', null]]);
  s.status(machine({ canZeroZ: false, zeroZReason: 'Palpage en cours.' })); assert.equal(zero.disabled, true);
  // Without a diameter (X operation): the model's reason, no profile suffix.
  const t = screen({ diameter: null }); t.show('probe'); t.ops[1].handlers.click(); t.status(machine());
  assert.equal(t.$('probe-availability').textContent, 'Diamètre outil / pige à renseigner.'); assert.equal(t.$('probe-start').disabled, true);
  t.$('probe-start').click(); assert.equal(t.calls.length, 0, 'an inactive Palper… sends nothing');
  console.log('PASS probe real UI: Palper… with its reason or the start instruction, blockProbe prepared with the chosen operation, refusal kept with the field named, running step / bar / Arrêter relayed, stopping, failed and done texts, real results, work frame following the active one, plate card asked from Sonde.');
})().catch((e) => { console.error(e); process.exitCode = 1; });
