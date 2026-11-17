'use strict';
// F2 « Pause et dégager » on the page (F2-CONCEPTION.md § 10, § 12.4): the button of the notice
// (present while a CNC program runs, struck through with its reason), the three touches of its
// confirmation (prepare only, then the retract with its nonce after the box and 600 ms), Pause and
// Arrêter still immediate, the seven states of the screen in FR, EN and ES, the resume texts once
// the bit is up. No network, no machine.
const assert = require('assert').strict, fs = require('fs'), path = require('path'), vm = require('vm');
const R = require('./touch/job-resume.js');
const { load } = require('./job-controls-fixture.cjs');
const { setup } = require('./test-reprise-volet.cjs');

const touch = (name) => fs.readFileSync(path.join(__dirname, 'touch', name), 'utf8');
function i18n(language) {
  const window = {}, saved = new Map([['cncjs-touch-language-v1', language]]);
  const context = { window, document: { documentElement: {}, title: '' }, localStorage: { getItem: (k) => saved.get(k) || null, setItem() {} } };
  ['i18n-messages.js', 'i18n-messages-machine.js', 'i18n-messages-refus.js', 'i18n.js'].forEach((name) => vm.runInNewContext(touch(name), context));
  return window.cncI18n;
}
const m = (patch) => Object.assign({ name: 'a.nc', fresh: true, homed: true, workflow: 'paused', activeState: 'Idle', total: 100, received: 40, canLoad: false, canPause: false, canResume: false, canStop: true }, patch);
const state = (patch) => R.screenState({ machine: m(patch), pilot: { state: 'mine' } });
const phase = (p, extra = {}) => Object.assign({ phase: p, step: null, since: 1, line: 40, pending: 0, lift: null, spindle: { mode: 'M3', speed: 18000 }, failure: null, owner: { kind: 'touch', id: 'A', label: 'A' } }, extra);

(async () => {
  // 36. The seven states of § 10.3: header, notice, main action.
  const running = state({ workflow: 'running', canPause: true });
  assert.deepEqual([running.word, running.text, running.action], ['En cours · 40 %', 'Usinage en cours.', 'pause']);
  const expect = {
    draining: ['Pause demandée', 'La fraise finit les mouvements déjà envoyés, puis elle montera.', 'pause', 'warn'],
    lifting: ['Pause', 'La fraise monte.', 'pause', 'warn'],
    parked: ['Pause · fraise dégagée', 'Fraise en haut, broche arrêtée.', 'reprendre', 'neutre'],
    returning: ['Reprise', 'La broche redémarre, puis la fraise redescend à sa place.', 'pause', 'warn'],
    held: ['Pause', 'La fraise est restée dans la pièce. La broche tourne toujours.', 'reprendre', 'warn'],
    failed: ['Pause', 'Reprendre sur place n’est plus possible. Arrêtez l’usinage, puis reprenez à une ligne.', 'arreter-usinage', 'danger']
  };
  for (const [p, [word, text, action, tone]] of Object.entries(expect)) {
    const s = state({ pauseRetract: phase(p), canPause: action === 'pause', canResume: action === 'reprendre' });
    assert.deepEqual([p, s.word, s.text, s.action, s.tone, s.allowed], [p, word, text, action, tone, true]);
  }
  // Failed: the main action is Arrêter l'usinage only, allowed by canStop.
  assert.equal(state({ pauseRetract: phase('failed'), canStop: false }).allowed, false);
  assert.equal(state({ pauseRetract: phase('failed') }).label, 'Arrêter l’usinage');
  // Parked but the resume refused: the main action is struck, with the server's reason.
  const refused = state({ pauseRetract: phase('parked'), canResume: false, resumeReason: 'Reprise refusée.' });
  assert.deepEqual([refused.allowed, refused.text], [false, 'Fraise en haut, broche arrêtée. Reprise refusée.']);
  // An ordinary pause and a tool change are unchanged.
  assert.equal(state({ canResume: true }).text, 'Pause. La broche tourne toujours.');
  assert.equal(state({ programPause: { kind: 'M6' }, canResume: true }).text, 'Le fichier demande un changement de fraise.');
  // EN and ES: every phrase of the screen and of the dialogs is translated.
  for (const language of ['en', 'es']) {
    const t = i18n(language);
    Object.values(expect).flatMap((r) => r.slice(0, 2)).concat(['Pause et dégager…', 'Pause et dégager', 'Dégager la fraise', 'Redescendre et reprendre',
      'La fraise finit les mouvements déjà envoyés, puis elle monte tout en haut et la broche s’arrête.', 'Je suis devant la machine et rien ne gêne la montée de la fraise.',
      'La broche redémarre, la fraise redescend à sa place, puis l’usinage continue.', 'Je suis devant la machine, la pièce n’a pas bougé et rien n’est sous la fraise.',
      'Dégagement demandé.', 'Reprise demandée : la broche redémarre, puis la fraise redescend.']).filter((fr) => fr !== 'Pause').forEach((fr) => {
      assert.notEqual(t.t(fr), fr, language + ': ' + fr);
    });
  }

  // 34. The button of the notice: present while a CNC program runs, struck through with its reason.
  {
    const q = setup();
    let asked = 0;
    q.window.cncJobControls.retract = () => { asked++; return Promise.resolve({ opened: true }); };
    q.send({ workflow: 'running', activeState: 'Run', canPause: true, canRetract: true, retractReason: '' });
    assert.equal(q.node('home-retract').hidden, false);
    assert.equal(q.node('home-retract').disabled, false);
    assert.equal(q.node('home-retract').textContent, 'Pause et dégager…');
    assert.equal(q.node('home-retract-reason').textContent, '');
    // First of its row, before « Reprendre à une ligne… » (refused while a job runs).
    const row = Array.from(q.node('home-notice-actions').children || q.node('home-notice-actions').childNodes).map((n) => n.id);
    assert(row.indexOf('home-retract') >= 0 && row.indexOf('home-retract') < row.indexOf('home-resume-line'), row.join(','));
    q.node('home-retract').click();
    assert.equal(asked, 1);
    q.send({ workflow: 'running', activeState: 'Run', canPause: true, canRetract: false, retractReason: 'Dégagement refusé : toutes les lignes sont déjà envoyées, l’usinage se termine.',
      refusals: { retract: { code: 'ETOUCH_RETRACT_ENDING' } } });
    assert.equal(q.node('home-retract').disabled, true);
    assert.equal(q.node('home-retract-reason').textContent, 'Le dégagement n’est pas possible maintenant.');
    q.node('home-retract').click();
    assert.equal(asked, 1, 'a struck button sends nothing');
    q.send({ workflow: 'running', activeState: 'Run', canPause: true, canRetract: true }, { pilot: { state: 'other' } });
    assert.equal(q.node('home-retract').disabled, true);
    assert.match(q.node('home-retract-reason').textContent, /a la main/);
    // Absent from the other states, on a laser, in an alarm, and without the server's answer (the
    // simulation, a server that does not know the function).
    for (const patch of [{ workflow: 'paused', canRetract: false }, { workflow: 'idle' }, { workflow: 'running', canRetract: true, machineProfile: { kind: 'laser' } },
      { workflow: 'paused', pauseRetract: phase('parked') }, { workflow: 'running', activeState: 'Alarm', canRetract: false }, { workflow: 'running', activeState: 'Run' }]) {
      q.send(patch);
      assert.equal(q.node('home-retract').hidden, true, JSON.stringify(patch));
    }
  }

  // 35, 37. Three touches: the button POSTs prepare only; the box, then the effect button after
  // 600 ms, POST the retract with its nonce; Pause closes the dialog and leaves at once.
  for (const language of ['fr', 'en', 'es']) {
    const f = load({ language, catalogs: ['i18n-messages-machine.js', 'i18n-messages-refus.js'] });
    const t = f.window.cncI18n.t;
    await f.connect(f.machine({ workflow: 'running', activeState: 'Run', canPause: true, canStop: true, canRetract: true }));
    const opening = f.controls().retract();
    assert.deepEqual(f.posts().map((p) => [p.body.action, p.body.operation, p.body.revision]), [['prepare', 'retract', 'rev-1']]);
    f.answer(f.posts().at(-1), { nonce: 'n-retract', name: 'Pause et dégager', expiresIn: 15 });
    await opening;
    assert.equal(f.el('job-dialog').hidden, false);
    assert.equal(f.el('job-dialog-title').textContent, t('Pause et dégager'));
    assert.equal(f.el('job-confirm').textContent, t('Dégager la fraise'));
    assert.equal(f.el('job-warning').textContent, t('La fraise finit les mouvements déjà envoyés, puis elle monte tout en haut et la broche s’arrête.'));
    assert.equal(f.el('job-check-text').textContent, t('Je suis devant la machine et rien ne gêne la montée de la fraise.'));
    f.el('job-check').checked = true; f.el('job-check').fire('change');
    f.el('job-confirm').disabled = false; f.el('job-confirm').fire('click'); await f.flush();
    assert.equal(f.posts().length, 1, 'nothing before 600 ms');
    f.advance(600); f.el('job-check').fire('change');
    assert.equal(f.el('job-confirm').disabled, false);
    f.el('job-confirm').fire('click'); await f.flush();
    assert.deepEqual([f.posts().at(-1).body.action, f.posts().at(-1).body.nonce], ['retract', 'n-retract']);
    f.answer(f.posts().at(-1), { message: 'Dégagement demandé.' }); await f.flush();
    // Pause over an open confirmation: the dialog closes and the pause leaves without delay.
    f.push([f.machine({ workflow: 'running', activeState: 'Run', canPause: true, canStop: true, canRetract: true })]); await f.flush();
    const again = f.controls().retract();
    f.answer(f.posts().at(-1), { nonce: 'n2', expiresIn: 15 }); await again;
    assert.equal(f.el('job-dialog').hidden, false);
    f.controls().pause(); await f.flush();
    assert.equal(f.el('job-dialog').hidden, true);
    assert.equal(f.posts().at(-1).body.action, 'pause');
    // While waiting for rest (draining) the workflow is paused, Pause stays at one touch.
    f.push([f.machine({ workflow: 'paused', activeState: 'Run', canPause: true, canStop: true, pauseRetract: phase('draining') })]); await f.flush();
    const before = f.posts().length;
    f.controls().pause(); await f.flush();
    assert.deepEqual([f.posts().length, f.posts().at(-1).body.action], [before + 1, 'pause']);
    f.controls().dispose();
  }

  // 38. The resume once the bit is up says what will happen; an ordinary pause keeps its texts.
  for (const [retract, warning, effect] of [
    [phase('parked'), 'La broche redémarre, la fraise redescend à sa place, puis l’usinage continue.', 'Redescendre et reprendre'],
    [null, 'Cette action met la machine en mouvement et peut activer l’outil. Vérifiez la machine, l’origine et la zone de travail.', 'Reprendre l’usinage']
  ]) {
    const f = load();
    await f.connect(f.machine({ workflow: 'paused', activeState: retract ? 'Idle' : 'Hold', canResume: true, canStop: true, pauseRetract: retract }));
    const opening = f.controls().resume();
    f.answer(f.posts().at(-1), { nonce: 'n-resume', expiresIn: 15 });
    await opening;
    assert.equal(f.el('job-warning').textContent, warning);
    assert.equal(f.el('job-confirm').textContent, effect);
    if (retract) {
      assert.equal(f.el('job-check-text').textContent, 'Je suis devant la machine, la pièce n’a pas bougé et rien n’est sous la fraise.');
    }
    f.controls().dispose();
  }
  // Without its stream the page asks for no retract (FIGE guard), played (F2-CORRECTIONS.md D9): the
  // stream lost under an open confirmation, the effect button, then the notice button again, POST
  // neither prepare nor retract; Pause and Arrêter still leave at once.
  {
    const f = load();
    const stream = await f.connect(f.machine({ workflow: 'running', activeState: 'Run', canPause: true, canStop: true, canRetract: true }));
    const opening = f.controls().retract();
    f.answer(f.posts().at(-1), { nonce: 'n-lost', name: 'Pause et dégager', expiresIn: 15 });
    await opening;
    assert.equal(f.el('job-dialog').hidden, false);
    f.el('job-check').checked = true; f.el('job-check').fire('change');
    f.advance(600); f.el('job-check').fire('change');
    const before = f.posts().length;
    stream.onerror(); await f.flush();
    // The confirmation is cancelled with the stream; its effect button, touched anyway, sends nothing.
    assert.equal(f.el('job-dialog').hidden, true);
    f.el('job-confirm').disabled = false; f.el('job-confirm').fire('click'); await f.flush();
    const again = await f.controls().retract(); await f.flush();
    assert.equal(again.opened, false);
    assert.match(again.error.message, /Suivi interrompu/);
    assert.deepEqual(f.posts().slice(before).map((p) => p.body.action), [], 'no request without the stream');
    f.controls().pause(); f.controls().stop(); await f.flush();
    assert.deepEqual(f.posts().slice(before).map((p) => p.body.action), ['pause', 'stop']);
    f.controls().dispose();
  }
  console.log('PASS pause and retract: button and its reason, three touches, Pause at once, seven screen states FR/EN/ES, resume texts.');
})().catch((e) => { console.error(e); process.exitCode = 1; });
