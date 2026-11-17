'use strict';
// Lot F1, framing in the air on a CNC (design/fonctions/F1-CONCEPTION.md § 9, § 10.3): on Control,
// the « Cadrer à vide… » button is present for a CNC, never hidden, struck with its phrase and
// remedy when the server refuses it; the line in progress and the result come from the state
// received only. The confirmation says what the server's ticket will do, keeps its box and its
// 600 ms, and a ticket is never replayed. The laser framing keeps its words.
const assert = require('assert').strict;
const { fixture } = require('./check-page-fixture.cjs');
const { load } = require('./job-controls-fixture.cjs');

const CNC = { kind: 'cnc', capabilities: { laserFrame: { supported: false, code: 'ETOUCH_LASER_NOT_LASER' }, cncFrame: { supported: true } } };
const TICKET = {
  nonce: 'n-1', name: 'Cadrage à vide', operation: 'frame', expiresIn: 15, generation: 'gen-1',
  frame: {
    kind: 'cnc',
    lines: ['M5', '$J=G91 G21 Z55 F300', '$J=G90 G21 X10 Y20 F600', '$J=G90 G21 X60 Y20 F600', '$J=G90 G21 X60 Y50 F600', '$J=G90 G21 X10 Y50 F600', '$J=G90 G21 X10 Y20 F600', '$J=G90 G21 X5 Y5 F600'],
    bounds: { xMin: 10, xMax: 60, yMin: 20, yMax: 50 }, feed: 600, zFeed: 300, safeZ: { machine: -5, rise: 55 }, start: { x: 5, y: 5 }, seconds: 49
  }
};

(async () => {
  // ---------------------------------------------------------------- Control screen
  for (const language of ['fr', 'en', 'es']) {
    const q = fixture(language), t = q.window.cncI18n.t, lire = q.window.cncRefus.lire;
    const button = () => q.node('check-frame-start'), state = () => q.node('check-frame-state').textContent, reason = () => q.node('check-frame-reason').textContent;
    q.send({ machineProfile: CNC, canFrame: true });
    assert.equal(button().hidden, false, 'present for a CNC');
    assert.equal(button().textContent, t('Cadrer à vide…'));
    assert.equal(button().disabled, false);
    assert.equal(q.node('check-rapids').hidden, false, 'rapids stay visible on a CNC');
    button().click();
    assert.deepEqual(q.calls.at(-1), { op: 'frame' }, 'the button prepares a framing');
    // Refused by the server: struck, its family phrase and its remedy.
    for (const [code, params, remedy] of [['ETOUCH_CNC_FRAME_NOT_HOMED', {}, 'prise-origine'], ['ETOUCH_CNC_FRAME_SOFT_LIMITS', {}, null], ['ETOUCH_OFFSET_CHECKING', {}, null]]) {
      q.send({ machineProfile: CNC, canFrame: false, frameReason: 'server text', refusals: { frame: { code, params } } });
      assert.equal(button().hidden, false, code + ': never hidden');
      assert.equal(button().disabled, true, code);
      assert(reason().includes(lire({ code, params }).phrase), code + ': ' + reason());
      const actions = q.node('check-frame-reason').querySelectorAll('button').map((b) => b.textContent);
      if (remedy) assert(actions.includes(q.window.cncSeance.libelle(remedy)), code + ' remedy ' + actions);
    }
    // The figures of an overrun: its first reason.
    q.send({ machineProfile: CNC, canFrame: false, refusals: { frame: { code: 'ETOUCH_CNC_FRAME_OUTSIDE', params: { count: 1 }, reasons: [{ code: 'ETOUCH_TRAVEL_BEYOND', params: { axis: 'X', sign: '+', over: '12.3', value: '12.3', limit: '0' } }] } } });
    assert(reason().includes(language === 'fr' ? '12,3' : '12.3'), reason());
    assert(reason().includes(lire({ code: 'ETOUCH_TRAVEL_BEYOND', params: { axis: 'X', over: '12.3' } }).phrase));
    // The lease elsewhere, a stale state, the stream lost (FIGE): struck.
    // A server without the framing state (canFrame absent): struck, said unavailable, no refusal band.
    q.send({ machineProfile: CNC });
    assert.equal(button().disabled, true);
    assert.equal(reason(), t('Cadrage indisponible.'));
    q.send({ machineProfile: CNC, canFrame: true }, { pilot: { state: 'other', name: 'PC' } });
    assert.equal(button().disabled, true);
    assert.equal(reason(), t('La main est sur un autre appareil.'));
    q.send({ machineProfile: CNC, canFrame: true, fresh: false });
    assert.equal(button().disabled, true, 'stale');
    q.send({ machineProfile: CNC, canFrame: true }, { transportConnected: false });
    assert.equal(button().disabled, true, 'stream lost');
    // In progress: every phase has its line, from the state received only.
    const phases = [['spindle', null, 'Cadrage en cours.'], ['raise', null, 'Cadrage à vide : la fraise monte.'], ['approach', null, 'Cadrage à vide : vers le premier coin.'], ['side', 2, 'Cadrage à vide : côté {n} sur {N}.'], ['return', null, 'Cadrage à vide : retour au point de départ.']];
    for (const [phase, side, text] of phases) {
      q.send({ machineProfile: CNC, canFrame: false, frameReason: 'Déplacement précédent non terminé', canPause: true, canStop: true, motion: { frame: { kind: 'cnc', phase, side, sides: 4, index: 3, lines: [] }, lastFrame: null } });
      assert.equal(state(), t(text).replace('{n}', '2').replace('{N}', '4'), phase);
      assert.equal(button().disabled, true, phase);
      assert.equal(reason(), t('Cadrage en cours.'));
    }
    // Results of the last framing of this file.
    q.send({ machineProfile: CNC, canFrame: true, motion: { frame: null, lastFrame: { kind: 'cnc', result: 'ended', code: null, revision: 'r1' } } });
    assert.equal(state(), t('Cadrage terminé. La fraise est restée en haut.'));
    assert.equal(button().disabled, false);
    q.send({ machineProfile: CNC, canFrame: true, motion: { frame: null, lastFrame: { kind: 'cnc', result: 'cancelled', reason: 'stop', code: null, revision: 'r1' } } });
    assert.equal(state(), t('Cadrage arrêté.'));
    // Another file loaded since: its result is not shown.
    q.send({ machineProfile: CNC, canFrame: true, motion: { frame: null, lastFrame: { kind: 'cnc', result: 'ended', code: null, revision: 'r0' } } });
    assert.equal(state(), '');
    // No machine any more (offline, port closed): nothing of the last machine stays under the button.
    q.send({ machineProfile: CNC, canFrame: false, refusals: { frame: { code: 'ETOUCH_CNC_FRAME_NOT_HOMED', params: {} } }, motion: { frame: null, lastFrame: { kind: 'cnc', result: 'ended', code: null, revision: 'r1' } } });
    assert(reason() && state());
    // The fixture drops a state without a machine: hand it to the page's listeners directly.
    q.listeners['cnc-job-status'].slice().forEach((fn) => fn({ type: 'cnc-job-status', detail: { machine: null, simulation: false, transportConnected: true, pilot: { state: 'mine' }, busy: false } }));
    assert.deepEqual([button().hidden, state(), reason()], [true, '', ''], 'offline: hidden, nothing left');
    // Every stop code of the server: its family phrase and its remedy; Recommencer prepares anew.
    for (const code of ['ETOUCH_FRAME_STREAM', 'ETOUCH_FRAME_CONTROL', 'ETOUCH_FRAME_STALE', 'ETOUCH_FRAME_TIMEOUT', 'ETOUCH_FRAME_STATE', 'ETOUCH_FRAME_REFUSED', 'ETOUCH_FRAME_ALARM', 'ETOUCH_FRAME_RESTART', 'ETOUCH_FRAME_POSITION']) {
      const params = { state: 'Hold', n: 15, alarm: 2, axis: 'X', expected: '-95', reported: '-94.9' };
      q.send({ machineProfile: CNC, canFrame: true, motion: { frame: null, lastFrame: { kind: 'cnc', result: 'cancelled', code, params, message: 'server', revision: 'r1' } } });
      const r = lire({ code, params, message: 'server' });
      assert(state().includes(r.phrase), code + ': ' + state());
      const again = q.node('check-frame-state').querySelectorAll('button').find((b) => b.textContent === q.window.cncSeance.libelle('recommencer'));
      if (r.remedes.includes('recommencer')) {
        assert(again, code + ' has Recommencer');
        const before = q.calls.length;
        again.click();
        assert.deepEqual(q.calls.slice(before), [{ op: 'frame' }], code + ': a new preparation');
      }
    }
  }
  // A laser keeps its button and its words.
  {
    const q = fixture();
    q.send({ machineProfile: { kind: 'laser', capabilities: { laserFrame: { supported: true } } } });
    assert.equal(q.node('check-frame-start').textContent, 'Cadrer…');
    assert.equal(q.node('check-frame-start').disabled, false);
    assert.equal(q.node('check-frame-state').textContent, '');
  }

  // ---------------------------------------------------------------- Confirmation
  for (const language of ['fr', 'en']) {
    const f = load({ language, catalogs: ['i18n-messages-machine.js', 'i18n-messages-profiles.js'] }), t = f.window.cncI18n.t;
    let details = null;
    f.window.cncShell = { details: (d) => { details = d; } };
    await f.connect(f.machine({ machineProfile: CNC, canFrame: true }));
    assert.equal(f.controls().prepareFrame(), true);
    const post = f.posts().at(-1);
    assert.deepEqual([post.body.action, post.body.operation], ['machine', 'frame-prepare']);
    assert.equal(post.body.kind, undefined, 'the page never says the kind: the server chooses');
    f.answer(post, TICKET); await f.flush();
    assert.equal(f.el('job-dialog').hidden, false);
    assert.equal(f.el('job-dialog-title').textContent, t('Cadrer à vide'));
    assert.equal(f.el('job-warning').textContent, t('La fraise monte tout en haut, puis fait le tour du fichier, broche arrêtée. Elle ne redescend pas.'));
    assert.equal(f.el('job-check-text').textContent, t('Je suis devant la machine et rien de haut ne gêne la broche.'));
    assert.equal(f.el('job-note').textContent, language === 'fr' ? '50 × 30 mm · environ 1 min' : '50 × 30 mm · about 1 min');
    assert.equal(f.el('job-confirm').textContent, t('Lancer le cadrage'));
    // Details: the lines, the safe height, the rectangle, what framing does not see.
    f.el('job-dialog-details').onclick();
    const text = details.lignes.map((l) => l.libelle + ' ' + l.valeur).join('\n');
    assert(text.includes('$J=G91 G21 Z55 F300'), text);
    assert(text.includes('Z -5 mm'), text);
    assert(text.includes('X 10 → 60 · Y 20 → 50 mm'), text);
    assert(text.includes(t('Le cadrage suit le centre de la fraise. Il ne vérifie ni les brides ni la profondeur.')));
    // The box, then 600 ms: nothing before.
    const count = f.posts().length;
    f.el('job-confirm').fire('click');
    assert.equal(f.posts().length, count, 'before the box and 600 ms');
    f.el('job-check').checked = true; f.el('job-check').fire('change');
    f.advance(599); f.el('job-confirm').fire('click');
    assert.equal(f.posts().length, count, 'still at 599 ms');
    f.advance(1); f.el('job-check').fire('change'); f.el('job-confirm').click();
    assert.equal(f.posts().length, count + 1);
    assert.deepEqual([f.posts().at(-1).body.operation, f.posts().at(-1).body.nonce], ['frame', 'n-1']);
    // Never replayed.
    f.el('job-check').checked = true; f.el('job-check').fire('change'); f.el('job-confirm').click();
    assert.equal(f.posts().length, count + 1, 'a ticket is used once');
    f.controls().dispose();
  }
  // The server's refusal meanwhile (canFrame false) closes the confirmation: nothing is sent.
  {
    const f = load();
    await f.connect(f.machine({ machineProfile: CNC, canFrame: true }));
    f.controls().prepareFrame();
    f.answer(f.posts().at(-1), TICKET); await f.flush();
    f.push([f.machine({ machineProfile: CNC, canFrame: false })]); await f.flush();
    f.advance(700); f.el('job-check').checked = true; f.el('job-check').fire('change');
    const count = f.posts().length;
    f.el('job-confirm').click();
    assert.equal(f.posts().length, count, 'refused meanwhile: not sent');
    // A new stream (another session) or another file: the dialog is closed too.
    f.controls().prepareFrame();
    f.answer(f.posts().at(-1), TICKET); await f.flush();
    f.push([f.machine({ machineProfile: CNC, canFrame: true, revision: 'rev-2' })]); await f.flush();
    f.advance(700); f.el('job-check').checked = true; f.el('job-check').fire('change');
    const after = f.posts().length;
    f.el('job-confirm').click();
    assert.equal(f.posts().length, after, 'another file: not sent');
    f.controls().dispose();
  }
  // A CNC without the capability (real moves disabled): not even prepared.
  {
    const f = load();
    await f.connect(f.machine({ machineProfile: { kind: 'cnc', capabilities: { cncFrame: { supported: false } } } }));
    assert.equal(f.controls().prepareFrame(), false);
    f.controls().dispose();
  }
  // During a framing, Pause and Arrêter of the strip leave at once.
  {
    const f = load();
    await f.connect(f.machine({ machineProfile: CNC, canPause: true, canStop: true, motion: { frame: { kind: 'cnc', phase: 'side', side: 1, sides: 4 } } }));
    f.controls().pause();
    assert.equal(f.posts().at(-1).body.action, 'pause');
    f.controls().stop();
    assert.equal(f.posts().at(-1).body.action, 'stop');
    f.controls().dispose();
  }
  // The laser confirmation keeps its words.
  {
    const f = load();
    await f.connect(f.machine({ machineProfile: { kind: 'laser', capabilities: { laserFrame: { supported: true } } } }));
    f.controls().prepareFrame();
    f.answer(f.posts().at(-1), { nonce: 'l', expiresIn: 15, frame: { kind: 'laser', lines: ['M5'], bounds: { xMin: 0, xMax: 1, yMin: 0, yMax: 1 }, feed: 1000 } }); await f.flush();
    assert.equal(f.el('job-dialog-title').textContent, 'Cadrer le fichier');
    assert.equal(f.el('job-warning').textContent, 'La tête fait le tour du fichier, laser éteint.');
    f.controls().dispose();
  }
  console.log('PASS CNC framing in the air: Control button, refusals and remedies, progress and results, confirmation, single ticket, laser unchanged.');
})().catch((e) => { console.error(e); process.exit(1); });
