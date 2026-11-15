'use strict';
// Confirmation of the real block probe (job-controls.js, contract of the conception § 3.1 / § 3.2 / § 4.1): prepare
// with the operation's fields, the dialog titled for the operation with the block's warning, the operator's box and
// the server's numbers in the note (reach and direction); the confirmed run waits for the end of the cycle (270 s);
// prepareCommand resolves {opened} and never rejects; a refusal comes back coded; the dialog closes with the
// server's reason when canBlockProbe falls. Offline fixture of the real page (fake XMLHttpRequest), no machine.
const assert = require('assert').strict;
const { load } = require('./job-controls-fixture.cjs');
const ticket = { axes: 'XYZ', wcs: 'G54', approach: 'outside', direction: { X: 1, Y: 1 }, start: { x: 100, y: 100, z: -110 }, search: 10, window: 8, lateral: 12, depth: 4, clearance: 5, toolRadius: 3, reach: 23.9,
  envelope: { X: [79.1, 120.9], Y: [79.1, 120.9], Z: [-125, -104] }, feeds: { fast: 100, slow: 25, travelXY: 600, travelZ: 500 }, steps: 22, seconds: 110 };
const body = { axes: 'XYZ', wcs: 'G54', diameter: 6, profile: { thickness: 5, faceX: -9.9, faceY: -9.9, fast: 100, slow: 25, search: 10, retract: 2, clearance: 5, corner: '--', directionX: 1, directionY: 1 } };
(async () => {
  const f = load(); f.window.CNCProbeReal = require('./touch/probe-real.js');
  await f.connect(f.machine({ canBlockProbe: true, blockProbeReason: '', operator: { wcs: 'G54' } }));
  const c = f.controls();
  // Prepare: the operation and its fields, with the port, generation and stream like every confirmed command.
  let opened = c.prepareCommand('blockProbe', body);
  assert.equal(typeof opened.then, 'function', 'prepareCommand returns a promise');
  const prep = f.posts().at(-1);
  assert.deepEqual({ ...prep.body, clientId: undefined, clientLabel: undefined }, { action: 'prepare', port: 'COM3', generation: 'gen-1', transportId: 'stream-one', operation: 'blockProbe', ...body, clientId: undefined, clientLabel: undefined });
  assert.equal(prep.timeout, 30000, 'the prepare answers at once');
  f.answer(prep, { nonce: 'bp-1', name: 'Palpage XYZ au bloc, repère G54', operation: 'blockProbe', expiresIn: 15, generation: 'gen-1', programCheck: null, blockProbe: ticket });
  assert.deepEqual(JSON.parse(JSON.stringify(await opened)), { opened: true, error: null });
  assert.equal(f.el('job-dialog').hidden, false);
  assert.equal(f.el('job-dialog-title').textContent, 'Palper le bloc XYZ');
  assert.equal(f.el('job-warning').textContent, 'Le palpage déplace l’outil jusqu’au contact avec le bloc. Dégagez la zone autour du bloc.');
  assert.equal(f.el('job-check-text').textContent, 'Je suis devant la machine, le bloc et la pince sont en place.');
  assert.equal(f.el('job-note').hidden, false);
  assert.match(f.el('job-note').textContent, /^Centre de l’outil au-dessus du bloc, à 8 mm .* sort de 12 mm .* descend de 4 mm .* à moins de 23\.9 mm du point de départ\. Jamais au bord du trou du bloc\.( Zéro Z = contact − [\d.]+ mm \(épaisseur du bloc\)\.)?( Zéro [XY] = contact [+−] [\d.]+ mm \(rayon [\d.]+ vers [XY][+−], face [−\d.]+\)\.)* Origine G54 écrite seulement à la fin\.$/);
  assert.match(f.el('job-dialog-file').getAttribute('data-details'), /^Palpage XYZ au bloc, repère G54 · COM3/);
  assert.equal(f.el('job-program-check').hidden, true, 'no program check for a probe');
  // Confirmed: one blockProbe request with the nonce, waiting up to 270 s for the end of the cycle.
  f.advance(600);f.el('job-check').checked = true; f.el('job-check').fire('change'); f.el('job-confirm').click();
  const run = f.posts().at(-1);
  assert.equal(run.body.action, 'blockProbe'); assert.equal(run.body.nonce, 'bp-1'); assert.equal(run.body.transportId, 'stream-one'); assert.equal(run.body.generation, 'gen-1');
  assert.equal(run.timeout, 270000, 'the run is answered at the end of the cycle');
  assert.equal(f.el('job-dialog').hidden, true);
  // Astra (relecture page, n° 1): the server may move before the first state of its cycle reaches the page; Pause and
  // Arrêter target the probe at once, and keep it when the state is then lost.
  f.tick();
  assert.equal(require('./command-state-fixture.cjs')(f.window,'job-stop').disabled, false, 'Arrêter usable while the confirmed probe is awaited'); assert.equal(require('./command-state-fixture.cjs')(f.window,'job-pause').disabled, false, 'Pause usable too');
  assert.equal(f.lastStatus().machine.canStop, true);
  assert.equal(f.lastStatus().probeRun, 'COM3', 'the awaited probe published for the Sonde screen (probe-ui.js)');
  f.answer(run, { message: 'Origine G54 réglée par palpage XYZ.', blockProbe: { id: 'b1', state: 'done' } }); await f.flush();
  assert.equal(require('./command-state-fixture.cjs')(f.window,'job-feedback').textContent, 'Origine G54 réglée par palpage XYZ.');
  f.tick(); assert.equal(require('./command-state-fixture.cjs')(f.window,'job-stop').disabled, true, 'answered: Arrêter follows the server again');
  // Astra n° 3: a refusal that comes back after the controller changed (new generation) is dropped like a late ticket.
  opened = c.prepareCommand('blockProbe', body); const late = f.posts().at(-1);
  f.push([f.machine({ generation: 'gen-2', canBlockProbe: true, operator: { wcs: 'G54' } })]); await f.flush();
  f.answer(late, { message: 'Repère refusé.', code: 'ETOUCH_PROBE_WCS', params: { wcs: 'G55', active: 'G54' } }, 409);
  assert.deepEqual(JSON.parse(JSON.stringify(await opened)), { opened: false, error: null });
  f.push([f.machine({ canBlockProbe: true, operator: { wcs: 'G54' } })]); await f.flush();
  // The X form: the direction in the note.
  opened = c.prepareCommand('blockProbe', { ...body, axes: 'X' });
  f.answer(f.posts().at(-1), { nonce: 'bp-2', name: 'Palpage X au bloc, repère G54', expiresIn: 15, blockProbe: { axes: 'X', wcs: 'G54', search: 10, direction: { X: -1 }, steps: 7 } });
  assert.equal((await opened).opened, true);
  assert.equal(f.el('job-dialog-title').textContent, 'Palper le bloc X');
  assert.equal(f.el('job-note').textContent, 'Recherche de 10 mm au plus vers X−, sans mouvement en Z. Origine G54 écrite seulement à la fin.');
  // The server no longer allows it (contact before the run): the dialog closes and says why.
  f.push([f.machine({ canBlockProbe: false, blockProbeReason: 'Test du contact à faire : touchez l’outil avec le bloc puis relâchez (contact vu, puis libre) avant de palper.', operator: { wcs: 'G54' } })]); await f.flush();
  assert.equal(f.el('job-dialog').hidden, true);
  assert.equal(require('./command-state-fixture.cjs')(f.window,'job-feedback').textContent, 'Confirmation annulée : Test du contact à faire : touchez l’outil avec le bloc puis relâchez (contact vu, puis libre) avant de palper.');
  // A ticket is never kept for a machine that refuses: prepared, then refused before it opens.
  f.push([f.machine({ canBlockProbe: true, operator: { wcs: 'G54' } })]); await f.flush();
  opened = c.prepareCommand('blockProbe', body);
  f.answer(f.posts().at(-1), { message: 'Palpage refusé : Z irait de -131 à -110 mm machine, hors de la course (-130 à 0, marge 1 mm). Déplacez l’outil ou réduisez les distances.', code: 'ETOUCH_PROBE_TRAVEL',
    params: { axis: 'Z', min: -131, max: -110, low: -130, high: 0 } }, 409);
  const refused = await opened;
  assert.equal(refused.opened, false); assert.equal(refused.error.code, 'ETOUCH_PROBE_TRAVEL'); assert.equal(refused.error.params.axis, 'Z');
  assert.match(refused.error.message, /^Palpage refusé : Z irait de -131 à -110/);
  assert.equal(f.el('job-dialog').hidden, true);
  // No answer (connection lost): resolved too, never rejected.
  opened = c.prepareCommand('blockProbe', body); f.posts().at(-1).onerror();
  const lost = await opened; assert.equal(lost.opened, false); assert.equal(lost.error.uncertain, true);
  // An unknown command: nothing sent, resolved with an error.
  const before = f.posts().length, unknown = await c.prepareCommand('gcode', {});
  assert.equal(unknown.opened, false); assert(unknown.error); assert.equal(f.posts().length, before);
  // The other confirmed commands keep their own texts.
  f.push([f.machine({ canBlockProbe: true, canZeroZ: true, operator: { wcs: 'G54' } })]); await f.flush();
  opened = c.prepareCommand('zeroZ', { thickness: 5, search: 10 }); f.answer(f.posts().at(-1), { nonce: 'z', name: 'Zéro Z', expiresIn: 15 });
  assert.equal((await opened).opened, true); assert.equal(f.el('job-dialog-title').textContent, 'Zéro Z à la plaque');
  assert.equal(f.el('job-check-text').textContent, 'Je suis devant la machine, la plaque et la pince sont en place.');
  c.dispose();
  // The confirmed probe awaited, then the state lost (no report for 4 s): the probe stays the target of Arrêter.
  {
    const h = load(); h.window.CNCProbeReal = require('./touch/probe-real.js');
    await h.connect(h.machine({ canBlockProbe: true, operator: { wcs: 'G54' } }));
    const o = h.controls().prepareCommand('blockProbe', body); h.answer(h.posts().at(-1), { nonce: 'h', name: 'x', expiresIn: 15, blockProbe: ticket }); await o;
    h.advance(600);h.el('job-check').checked = true; h.el('job-check').fire('change'); h.el('job-confirm').click();
    assert.equal(h.posts().at(-1).body.action, 'blockProbe');
    h.advance(4000); h.tick();
    assert.equal(h.lastStatus().machine, null, 'state lost'); assert.equal(h.lastStatus().halt && h.lastStatus().halt.canStop, true, 'the probe stays the target of Arrêter');
    assert.equal(h.el('job-stop').disabled, false); h.el('job-stop').click();
    assert.equal(h.posts().at(-1).body.action, 'stop'); assert.equal(h.posts().at(-1).body.port, 'COM3');
    h.controls().dispose();
  }
  // English: the title and the note in the interface language.
  const g = load({ language: 'en', catalogs: ['i18n-messages-machine.js', 'i18n-messages-profiles.js'] }); g.window.CNCProbeReal = require('./touch/probe-real.js');
  await g.connect(g.machine({ canBlockProbe: true, operator: { wcs: 'G54' } }));
  opened = g.controls().prepareCommand('blockProbe', { ...body, axes: 'Z' }); g.answer(g.posts().at(-1), { nonce: 'e', name: 'x', expiresIn: 15, blockProbe: { axes: 'Z', wcs: 'G54', search: 6 } });
  await opened; assert.equal(g.el('job-dialog-title').textContent, 'Probe the block Z');
  assert.equal(g.el('job-warning').textContent, 'Probing moves the tool until it touches the block. Clear the area around the block.');
  g.controls().dispose();
  // The HTTP failure carries only the server's three outcome fields (K14), before a new snapshot.
  {
    const h=load(),outcomes=[];h.window.CNCProbeReal=require('./touch/probe-real.js');h.window.cncZeroPiece={failure:(b,m)=>outcomes.push({b,m})};
    await h.connect(h.machine({canBlockProbe:true,operator:{wcs:'G54'}}));
    const opened=h.controls().prepareCommand('blockProbe',body);h.answer(h.posts().at(-1),{nonce:'fail-card',expiresIn:15,name:'Probe',blockProbe:ticket});await opened;
    h.advance(600);h.el('job-check').checked=true;h.el('job-check').fire('change');h.el('job-confirm').click();
    const b={failure:{code:'ETOUCH_PROBE_WRITE_UNCERTAIN',params:{}},written:'uncertain',needsHoming:true};h.answer(h.posts().at(-1),{message:'failed',blockProbe:b},409);await h.flush();
    assert.equal(outcomes.length,1);assert.deepEqual(JSON.parse(JSON.stringify(outcomes[0].b)),b);assert.equal(outcomes[0].m.port,'COM3');h.controls().dispose();
  }
  console.log('PASS block probe dialog: prepare with the operation fields, title / warning / box / server numbers in the note, run waits 270 s, prepareCommand resolves {opened} and never rejects, coded refusal, closed with the server reason, other commands unchanged, English.');
})().catch((e) => { console.error(e); process.exitCode = 1; });
