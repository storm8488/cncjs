// Real block probing of the Sonde screen (probe-real.js, contract of the conception § 3 / § 4.2): the prepare
// body, the launch reasons in their order, the confirmation note with the server's numbers, the 22 step labels,
// the progress, the end texts (origin written or not, $H), the refusal with a translated field name, the shared
// compensation vectors (§ 6), and every text and ETOUCH_PROBE_* code in FR / EN / ES. Offline, no machine.
const assert = require('assert').strict, fs = require('fs'), path = require('path'), vm = require('vm');

const touch = (n) => fs.readFileSync(path.join(__dirname, 'touch', n), 'utf8');
function page(language) {
  const window = {}, saved = new Map([['cncjs-touch-language-v1', language]]);
  const context = { window, document: { documentElement: {}, title: '' }, localStorage: { getItem: (k) => saved.get(k) || null, setItem() {} } };
  ['i18n-messages.js', 'i18n-messages-machine.js', 'i18n-messages-profiles.js', 'i18n.js', 'probe-model.js', 'probe-real.js'].forEach((n) => vm.runInNewContext(touch(n), context));
  return window;
}
const fr = page('fr'), en = page('en'), es = page('es');
const R = fr.CNCProbeReal, model = fr.CNCProbe;
assert(R && model, 'probe-real.js and probe-model.js load in the page');
const plain = require('./touch/probe-real');

assert.equal(typeof plain.launchState, 'function', 'probe-real.js loads in Node too');

// 1. The prepare body (§ 3.1): the operator's profile, null where the operation does not need a field.
const profile = { name: 'Bloc atelier', thickness: 5, faceX: -9.9, faceY: -9.9, fast: 100, slow: 25, search: 10, retract: 2, clearance: 5, corner: '--', directionX: 1, directionY: 1 };
assert.deepEqual(JSON.parse(JSON.stringify(R.request(profile, 'XYZ', 6, 'G54'))), { axes: 'XYZ',
  wcs: 'G54',
  diameter: 6,
  profile: { thickness: 5, faceX: -9.9, faceY: -9.9, fast: 100, slow: 25, search: 10, retract: 2, clearance: 5, corner: '--', directionX: 1, directionY: 1 } });
assert.deepEqual(JSON.parse(JSON.stringify(R.request(profile, 'Z', 6, 'G55'))), { axes: 'Z',
  wcs: 'G55',
  diameter: null,
  profile: {
    thickness: 5, faceX: null, faceY: null, fast: 100, slow: 25, search: 10, retract: 2, clearance: 5, corner: null, directionX: null, directionY: null
  } });
assert.deepEqual(JSON.parse(JSON.stringify(R.request(profile, 'X', 6, 'G54').profile)), { thickness: null, faceX: -9.9, faceY: null, fast: 100, slow: 25, search: 10, retract: 2, clearance: null, corner: null, directionX: 1, directionY: null });
assert.equal(R.request(profile, 'Y', 6, 'G54').profile.directionY, 1);
assert(!('name' in R.request(profile, 'XYZ', 6, 'G54').profile), 'profile.name is not sent');

// 2. launchState: the first true row gives the reason (table § 4.2), in this order.
const ready = () => ({ machine: { port: '/dev/ttyUSB0', fresh: true, operator: { wcs: 'G54' }, canBlockProbe: true, blockProbeReason: '', blockProbe: null, probing: false },
  connected: true,
  pilot: { state: 'mine' },
  profile,
  operation: 'XYZ',
  diameter: 6,
  wcs: 'G54',
  pending: false,
  validate: model.validate });
const L = (patch) => {
  const s = ready(); patch(s); return R.launchState(s);
};
assert.deepEqual(JSON.parse(JSON.stringify(R.launchState(ready()))), { ready: true, reason: '' });
assert.equal(L((s) => {
  s.machine = null;
}).reason, 'Aucune machine connectée : touchez Connecter la CNC dans le Menu.');
assert.equal(L((s) => {
  s.machine.fresh = false;
}).reason, 'État machine trop ancien : attendez un rapport récent.');
assert.equal(L((s) => {
  s.connected = false;
}).reason, 'État machine trop ancien : attendez un rapport récent.', 'stream cut');
assert.equal(L((s) => {
  s.pilot = { state: 'other', name: 'Poste ab12' }; s.machine.fresh = true;
}).reason, 'Pilotée par « Poste ab12 » : touchez Pilote (bandeau) pour prendre la main.');
for (const cycle of [{ probing: true }, { blockProbe: { state: 'running' } }, { blockProbe: { state: 'stopping' } }]) {
  const r = L((s) => {
    Object.assign(s.machine, cycle); s.profile = model.empty();
  });
  assert.equal(r.ready, false); assert.equal(r.reason, '', 'during a cycle: inactive, no reason');
}
assert.equal(L((s) => {
  s.profile = Object.assign({}, profile, { thickness: null });
}).reason, 'Paramètre à renseigner : épaisseur Z. Ouvrez Profils de sonde.');
assert.equal(L((s) => {
  s.profile = Object.assign({}, profile, { corner: '' });
}).reason, 'Coin de montage à choisir. Ouvrez Profils de sonde.');
assert.equal(L((s) => {
  s.diameter = null;
}).reason, 'Diamètre outil / pige à renseigner.', 'diameter: no profile suffix');
assert.equal(L((s) => {
  s.operation = 'Z'; s.diameter = null;
}).ready, true, 'Z needs no diameter');
assert.equal(L((s) => {
  s.machine.operator = null; s.diameter = null;
}).reason, 'Diamètre outil / pige à renseigner.', 'the profile before the work frame');
assert.equal(L((s) => {
  s.machine.operator = { wcs: 'G53' };
}).reason, 'Repère actif inconnu : attendez un rapport de la machine.');
assert.equal(L((s) => {
  s.wcs = 'G55';
}).reason, 'Repère choisi G55 différent du repère actif G54 : choisissez G54.');
assert.equal(L((s) => {
  s.wcs = 'G55'; s.machine.canBlockProbe = false;
}).reason, 'Repère choisi G55 différent du repère actif G54 : choisissez G54.', 'the work frame before the machine');
assert.equal(L((s) => {
  s.machine.canBlockProbe = false; s.machine.blockProbeReason = 'Machine non référencée : faites la prise d’origine ($H) avant de palper.';
}).reason, 'Machine non référencée : faites la prise d’origine ($H) avant de palper.');
assert.equal(L((s) => {
  s.machine.canBlockProbe = false; s.machine.blockProbeReason = 'Test du contact à faire : touchez l’outil avec le bloc puis relâchez (contact vu, puis libre) avant de palper.';
}).reason,
'Test du contact à faire : touchez l’outil avec le bloc puis relâchez (contact vu, puis libre) avant de palper. Ouvrez Diagnostic de l’entrée.');
assert.equal(L((s) => {
  s.machine.canBlockProbe = false;
}).reason, 'Palpage au bloc indisponible dans l’état actuel de la machine.');
assert.equal(L((s) => {
  delete s.machine.canBlockProbe;
}).reason, 'Palpage au bloc non pris en charge par ce serveur CNCjs : mettez-le à jour.', 'an older server');
assert.deepEqual(JSON.parse(JSON.stringify(L((s) => {
  s.pending = true;
}))), { ready: false, reason: '' }, 'a request on its way');
// The machine's reason in the interface language.
{ const s = ready(); s.validate = en.CNCProbe.validate; s.machine.canBlockProbe = false; s.machine.blockProbeReason = 'Machine non référencée : faites la prise d’origine ($H) avant de palper.';
  assert.equal(en.CNCProbeReal.launchState(s).reason, 'Machine not homed: home it ($H) before probing.');
  s.wcs = 'G56'; assert.equal(es.CNCProbeReal.launchState(Object.assign(s, { validate: es.CNCProbe.validate })).reason, 'Sistema elegido G56 distinto del sistema activo G54: elija G54.'); }
assert.equal(R.startHint('Z'), 'Outil au-dessus du bloc, pince en place.');
assert.equal(R.startHint('X'), 'Outil à côté de la face, à la hauteur de palpage, à moins de la distance de recherche.');
assert.equal(R.startHint('XYZ'), 'Outil au-dessus du coin extérieur du bloc, pince en place.');

// 3. Confirmation note with the ticket's numbers (§ 3.1 example and the Z / X forms).
const ticket = { axes: 'XYZ',
  wcs: 'G54',
  approach: 'outside',
  direction: { X: 1, Y: 1 },
  start: { x: 100, y: 100, z: -110 },
  search: 10,
  window: 8,
  lateral: 12,
  depth: 4,
  clearance: 5,
  toolRadius: 3,
  offsets: { Z: { thickness: 5, total: -5 }, X: { radius: 3, face: -9.9, total: 12.9 }, Y: { radius: 3, face: -9.9, total: 12.9 } },
  reach: 23.9,
  envelope: { X: [79.1, 120.9], Y: [79.1, 120.9], Z: [-125, -104] },
  feeds: { fast: 100, slow: 25, travelXY: 600, travelZ: 500 },
  steps: 22,
  seconds: 110 };
assert.equal(R.dialogNote(ticket), 'Centre de l’outil au-dessus du bloc, à 8 mm au plus en retrait des deux faces. L’outil palpe Z, sort de 12 mm de chaque côté, descend de 4 mm sous le dessus du bloc, palpe X puis Y et revient au-dessus du coin de la pièce. Rien ne doit dépasser le dessus du bloc à moins de 23.9 mm du point de départ. Jamais au bord du trou du bloc. Zéro Z = contact − 5 mm (épaisseur du bloc). Zéro X = contact + 12.9 mm (rayon 3 vers X+, face −9.9). Zéro Y = contact + 12.9 mm (rayon 3 vers Y+, face −9.9). Origine G54 écrite seulement à la fin.');
assert.equal(R.dialogNote({ axes: 'Z', wcs: 'G55', search: 6, direction: {} }), 'Descente de 6 mm au plus. Origine G55 écrite seulement à la fin.');
assert.equal(R.dialogNote({ axes: 'X', wcs: 'G54', search: 10, direction: { X: -1 } }), 'Recherche de 10 mm au plus vers X−, sans mouvement en Z. Origine G54 écrite seulement à la fin.');
// Fable P2-5: the compensation written (a face offset typed with the wrong sign shows here: − 6.9 instead of + 12.9).
assert.equal(R.dialogNote({ axes: 'X', wcs: 'G54', search: 10, direction: { X: 1 }, offsets: { X: { radius: 3, face: 9.9, total: -6.9 } } }), 'Recherche de 10 mm au plus vers X+, sans mouvement en Z. Zéro X = contact − 6.9 mm (rayon 3 vers X+, face 9.9). Origine G54 écrite seulement à la fin.');
assert.equal(R.dialogNote({ axes: 'Y', wcs: 'G54', search: 10, direction: { Y: -1 }, offsets: { Y: { radius: -1.5875, face: 0, total: -1.5875 } } }), 'Recherche de 10 mm au plus vers Y−, sans mouvement en Z. Zéro Y = contact − 1.5875 mm (rayon 1.5875 vers Y−, face 0). Origine G54 écrite seulement à la fin.');
assert.equal(en.CNCProbeReal.dialogNote({ axes: 'X', wcs: 'G54', search: 10, direction: { X: 1 }, offsets: { X: { radius: 3, face: -9.9, total: 12.9 } } }), 'Search of 10 mm at most towards X+, without any Z move. Zero X = contact + 12.9 mm (radius 3 towards X+, face −9.9). Origin G54 written only at the end.');
assert.equal(R.dialogNote({ axes: 'Y', wcs: 'G54', search: 10, direction: { Y: 1 } }), 'Recherche de 10 mm au plus vers Y+, sans mouvement en Z. Origine G54 écrite seulement à la fin.');
assert.equal(R.dialogNote({ axes: 'Z', wcs: 'G55', search: 6, direction: {}, offsets: { Z: { thickness: 10, total: -10 } } }), 'Descente de 6 mm au plus. Zéro Z = contact − 10 mm (épaisseur du bloc). Origine G55 écrite seulement à la fin.');
assert.equal(R.dialogNote(null), '');
assert.equal(en.CNCProbeReal.dialogNote({ axes: 'Z', wcs: 'G54', search: 6 }), 'Descent of 6 mm at most. Origin G54 written only at the end.');

// 4. The 22 step codes (§ 3.3).
const LABELS = { CHECK: 'Vérifications',
  Z_FAST: 'Z · approche',
  Z_RETRACT: 'Z · retrait',
  Z_SLOW: 'Z · touche lente',
  Z_CLEAR: 'Z · dégagement',
  X_TRAVERSE: 'X · déplacement latéral',
  X_DESCENT: 'X · descente surveillée',
  X_FAST: 'X · approche',
  X_RETRACT: 'X · retrait',
  X_SLOW: 'X · touche lente',
  X_CLEAR: 'X · dégagement',
  X_LIFT: 'X · remontée',
  Y_TRAVERSE: 'Y · déplacement latéral',
  Y_DESCENT: 'Y · descente surveillée',
  Y_FAST: 'Y · approche',
  Y_RETRACT: 'Y · retrait',
  Y_SLOW: 'Y · touche lente',
  Y_CLEAR: 'Y · dégagement',
  Y_LIFT: 'Y · remontée',
  RETURN: 'Retour au-dessus du coin',
  WRITE: 'Écriture de l’origine',
  VERIFY: 'Vérification' };
assert.equal(Object.keys(LABELS).length, 22);
for (const [code, label] of Object.entries(LABELS)) {
  assert.equal(R.stepLabel(code), label, code);
}
assert.equal(en.CNCProbeReal.stepLabel('X_DESCENT'), 'X · watched descent');
assert.equal(R.stepLabel('toString'), 'toString', 'no prototype lookup');

// 5. Progress and end texts (§ 4.2).
const running = { id: 'a1', axes: 'XYZ', wcs: 'G54', state: 'running', step: { index: 8, total: 22, code: 'X_FAST' }, contacts: { Z: -119.565 }, written: 'no', failure: null, needsHoming: false };
assert.equal(R.progress(running), 36);
assert.deepEqual(JSON.parse(JSON.stringify(R.summary(running))), { phase: 'Étape 8 / 22 · X · approche', message: 'Palpage en cours. Arrêter interrompt.' });
const done = Object.assign({}, running, { state: 'done', step: { index: 22, total: 22, code: 'VERIFY' }, written: 'yes', origin: { X: 105.9, Y: 104.9, Z: -124.565 }, values: { X: 0, Y: 0, Z: 10 }, command: 'G10 L20 P1 X0 Y0 Z10', work: { x: 0, y: 0, z: 10 }, contacts: { Z: -119.565, X: 93, Y: 92 } });
assert.deepEqual(JSON.parse(JSON.stringify(R.summary(done))), { phase: 'Palpage XYZ terminé', message: 'Origine G54 écrite. Position de travail : X 0.000 · Y 0.000 · Z 10.000.' });
assert.deepEqual(Array.from(R.resultLines(done)), ['X · contact machine 93.000 · zéro machine 105.900 · valeur écrite 0.000', 'Y · contact machine 92.000 · zéro machine 104.900 · valeur écrite 0.000',
  'Z · contact machine -119.565 · zéro machine -124.565 · valeur écrite 10.000', 'Ligne envoyée : G10 L20 P1 X0 Y0 Z10', 'Position de travail relue : X 0.000 · Y 0.000 · Z 10.000']);
assert.deepEqual(Array.from(R.resultLines(Object.assign({}, done, { axes: 'Z', origin: { Z: -124.565 }, values: { Z: 10 }, command: 'G10 L20 P1 Z10' }))).slice(0, 2), ['Z · contact machine -119.565 · zéro machine -124.565 · valeur écrite 10.000', 'Ligne envoyée : G10 L20 P1 Z10']);
const noContact = { code: 'ETOUCH_PROBE_NO_CONTACT', params: { axis: 'X', search: 10 }, message: 'Aucun contact en X sur 10 mm : rapprochez l’outil et vérifiez la pince. Origine de travail inchangée.' };
const failed = Object.assign({}, running, { state: 'failed', failure: noContact });
assert.deepEqual(JSON.parse(JSON.stringify(R.summary(failed))), { phase: 'Palpage interrompu', message: 'Aucun contact en X sur 10 mm : rapprochez l’outil et vérifiez la pince. Origine de travail inchangée.' });
const stopped = { code: 'ETOUCH_PROBE_STOPPED', params: {}, message: 'x' };
assert.deepEqual(JSON.parse(JSON.stringify(R.summary(Object.assign({}, running, { state: 'stopping', failure: stopped, needsHoming: true })))),
  { phase: 'Arrêt en cours…', message: 'Palpage interrompu par Arrêter. Origine de travail inchangée. Refaites la prise d’origine ($H) avant de recommencer.' });
assert.equal(R.failureText({ code: 'ETOUCH_PROBE_WRITE_UNCERTAIN', params: {} }, 'uncertain', false), 'Écriture de l’origine sans confirmation. Le repère a peut-être changé : vérifiez-le avant tout travail.');
assert.equal(R.failureText({ code: 'ETOUCH_PROBE_ALARM', params: {}, message: 'Alarme pendant le palpage. Origine de travail inchangée.' }, 'no', true), 'Alarme pendant le palpage. Origine de travail inchangée.', 'a value missing: the server sentence as sent');
assert.equal(R.failureText({ code: 'ETOUCH_PROBE_ALARM', params: { alarm: null } }, 'no', true), 'Alarme pendant le palpage. Origine de travail inchangée. Refaites la prise d’origine ($H) avant de recommencer.');
assert.equal(en.CNCProbeReal.failureText({ code: 'ETOUCH_PROBE_ALARM', params: { alarm: null } }, 'no', true), 'Alarm during probing. Work origin unchanged. Home again ($H) before trying again.');
assert.equal(es.CNCProbeReal.failureText({ code: 'ETOUCH_PROBE_ALARM', params: { alarm: null } }, 'no', true), 'Alarma durante el sondeo. Origen de trabajo sin cambios. Vuelva a hacer la búsqueda de origen ($H) antes de repetir.');
assert.equal(R.failureText({ code: 'ETOUCH_PROBE_ALARM', params: { alarm: 'ALARM:4' } }, 'no', true), 'Alarme ALARM:4 pendant le palpage. Origine de travail inchangée. Refaites la prise d’origine ($H) avant de recommencer.');
assert.equal(R.failureText({ code: 'ETOUCH_PROBE_SOMETHING_NEW', params: {}, message: 'Cas nouveau du serveur. Origine de travail inchangée.' }, 'no', false), 'Cas nouveau du serveur. Origine de travail inchangée.', 'unknown code: the server sentence as sent');
assert.equal(R.failureText(null, 'uncertain', false), 'Palpage interrompu sans détail du serveur. Le repère a peut-être changé : vérifiez-le avant tout travail.');
assert.equal(en.CNCProbeReal.failureText(noContact, 'no', true), 'No contact in X over 10 mm: bring the tool closer and check the clip. Work origin unchanged. Home again ($H) before trying again.');
assert.equal(es.CNCProbeReal.summary(failed).message, 'Ningún contacto en X en 10 mm: acerque la herramienta y compruebe la pinza. Origen de trabajo sin cambios.');

// 6. Refusal of the prepare: the field named in the interface language (§ 4.2 « Lancement »).
const param = { code: 'ETOUCH_PROBE_PARAM', params: { field: 'fast', min: 10, max: 200 }, message: 'Profil de sonde : fast hors des limites du palpage réel (10 à 200). Modifiez le profil.' };
assert.equal(R.refusalText(param, model.fieldNames), 'Profil de sonde : vitesse d’approche hors des limites du palpage réel (10 à 200). Modifiez le profil.');
assert.equal(en.CNCProbeReal.refusalText(param, en.CNCProbe.fieldNames), 'Probe profile: ' + en.CNCProbe.fieldNames.fast + ' outside the real probing limits (10 to 200). Edit the profile.');
assert.notEqual(en.CNCProbe.fieldNames.fast, 'vitesse d’approche', 'the model field name is translated');
assert.equal(R.refusalText({ code: 'ETOUCH_PROBE_MISSING', params: { field: 'diameter' }, message: 'x' }, model.fieldNames), 'Profil de sonde incomplet : diamètre de l’outil à renseigner.');
assert.equal(R.refusalText({ code: 'ETOUCH_PROBE_TRAVEL', params: {}, message: 'Palpage refusé : déjà traduit.' }, model.fieldNames), 'Palpage refusé : déjà traduit.', 'other codes: the message job-controls.js already translated');
assert.equal(R.refusalText(null), '');

// 7. Shared compensation vectors (§ 6): the page's model gives the server's origins.
const p = (o) => Object.assign({}, profile, o);
for (const [axis, contact, dir, d, face, origin] of [['X', 93, 1, 6, -9.9, 105.9], ['X', 113, -1, 6, 9.9, 100.1], ['Y', 92, 1, 6, -9.9, 104.9], ['Y', 200, -1, 6, 9.9, 187.1], ['X', 50, -1, 3.175, 0, 48.4125]]) {
  assert.equal(model.compensate(axis, contact, p({ ['direction' + axis]: dir, ['face' + axis]: face }), d), origin, axis + ' ' + contact);
}
assert.equal(model.compensate('Z', -119.565, p({ thickness: 5 }), 6), -124.565);

// 8. Every text of probe-real.js and every ETOUCH_PROBE_* code of the contract has its EN and ES rows.
{
  const rows = new Map(en.CNCTouchMessages.map((r) => [r[0].trim().replace(/\s+/g, ' '), r]));
  const phrases = [...touch('probe-real.js').matchAll(/\bt\('((?:[^'\\]|\\.)*)'\)/g)].map((m) => m[1]);
  for (const k of ['FAST', 'RETRACT', 'SLOW', 'CLEAR', 'TRAVERSE', 'DESCENT', 'LIFT']) {
    phrases.push(R.stepLabel('X_' + k).slice(4));
  }
  for (const ph of new Set(phrases)) {
    const r = rows.get(ph.trim().replace(/\s+/g, ' ')); assert(r && r[1] && r[2], 'EN / ES row for « ' + ph + ' »');
  }
  const codes = new Map(en.CNCTouchCodes.map((r) => [r[0], r]));
  const CONTRACT = ['NO_CONTACT', 'CONTACT_AT_START', 'STUCK', 'DESCENT_CONTACT', 'TRAVERSE_CONTACT', 'MISMATCH', 'PRB', 'START_CLOSE', 'POSITION', 'ALARM', 'ERROR', 'STOPPED', 'PAUSED', 'STREAM', 'CONTROL', 'STALE', 'TIMEOUT', 'RESTART', 'LOST', 'WRITE', 'WRITE_UNCERTAIN',
    'AXES', 'MISSING', 'PARAM', 'SLOW_FAST', 'RETRACT', 'APPROACH', 'FACE_SIGN', 'WCS', 'TRAVEL', 'FEED', 'TOO_SLOW', 'PILOT', 'G92', 'TLO', 'PARAMETERS'];
  for (const c of CONTRACT) {
    const r = codes.get('ETOUCH_PROBE_' + c); assert(r && r[1] && r[2] && r[3] && r[2] !== r[1] && r[3] !== r[1], 'FR / EN / ES template for ETOUCH_PROBE_' + c);
  }
  // The server's answers and reasons of the block probe (§ 2.3, § 2.8) are catalog phrases.
  for (const s of ['Palpage au bloc : machine au repos uniquement, sans programme en cours ni en pause.', 'Palpage interrompu. Vérifiez l’immobilisation ; origine de travail inchangée.',
    'Pause pendant un palpage : palpage interrompu, il ne se reprend pas. Origine de travail inchangée.', 'Arrêt broche pendant un palpage : palpage interrompu, carte réinitialisée. Origine de travail inchangée.', 'Origine G55 réglée par palpage XYZ.']) {
    assert.notEqual(en.cncI18n.message(s), s, 'EN: ' + s);
  }
  assert.equal(es.cncI18n.message('Origine G54 réglée par palpage Z.'), 'Origen G54 ajustado por sondeo Z.');
}
console.log('PASS probe real: prepare body, launch reasons in order, confirmation note, 22 step labels, progress and end texts (origin unchanged / maybe changed, $H), translated refusal field, shared compensation vectors, FR/EN/ES texts and ETOUCH_PROBE_* codes.');

(async()=>{
 const {load}=require('./job-controls-fixture.cjs');
 for(const language of ['fr','en','es']){
  const i=page(language),f=load();await f.connect();f.window.CNCProbeReal=i.CNCProbeReal;
  const result=f.controls().prepareCommand('blockProbe',{}),req=f.posts().at(-1);
  const failure={code:'ETOUCH_PROBE_NO_CONTACT',params:{axis:'Z'},message:'No fallback should be shown'};
  const blockProbe={failure,written:'no',needsHoming:true};
  f.answer(req,{code:failure.code,params:failure.params,message:'untranslated failure',blockProbe},409);
  const answer=await result;await f.flush();
  assert.equal(answer.opened,false);assert.equal(answer.error.code,failure.code,'structured refusal preserves its code');assert.equal(answer.error.message,i.CNCProbeReal.failureText(failure,'no',true),'C-41: HTTP failure outcome in '+language);
  assert.equal(f.el('job-feedback').textContent,answer.error.message);
  f.controls().dispose();
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
