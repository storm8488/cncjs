'use strict';
// Axis A, lot L0: a program that commands a rotary axis (A, B, C) is told in the main view of
// Control, details closed, and again where the start is confirmed, in FR, EN and ES. The verdict,
// the start button and a file without such a word are as before.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { fixture, check } = require('./check-page-fixture.cjs');
const { load } = require('./job-controls-fixture.cjs');

const EXPECTED = {
  fr: 'Ce programme fait tourner l’axe A : CNC Touch ne le contrôle pas encore.',
  en: 'This program turns axis A: CNC Touch does not check it yet.',
  es: 'Este programa hace girar el eje A: CNC Touch aún no lo controla.'
};
const rotary = (axis = 'A') => ({ code: 'ETOUCH_ROTARY_UNCHECKED', params: { axis, line: 3, count: 2 },
  message: 'Ce programme fait tourner un axe rotatif (' + axis + ', première ligne 3) : CNC Touch ne le contrôle pas encore. Seuls X, Y et Z sont vérifiés.' });
const withRotary = (verdict, patch = {}) => check(verdict, Object.assign({ info: [rotary()], rotary: { letters: 'A', line: 3, count: 2 } }, patch));
const shown = (node) => !!node && !node.hidden && node.textContent;

// Control, main view. The details sheet is never opened here.
for (const language of ['fr', 'en', 'es']) {
  const q = fixture(language), main = q.node('step-check-main'), cause = () => q.node('step-check-cause').textContent;
  const line = () => q.node('check-rotary');
  const ready = cause();
  assert(!shown(line()), language + ': no rotary line for a file without A, B or C');
  assert(!main.disabled);

  q.send({ programCheck: withRotary('validated') });
  assert.equal(shown(line()), EXPECTED[language], language + ': warning in the verdict card, details closed');
  assert.equal(cause(), EXPECTED[language], language + ': the bar no longer says that all is ready');
  assert(!main.disabled, language + ': the start stays allowed, as without A');
  assert.equal(q.node('ks-check-details').hidden !== false, true, language + ': details stay closed');

  q.send({ programCheck: withRotary('unknown') });
  assert.equal(shown(line()), EXPECTED[language], language + ': warning kept under an unverified travel');
  assert(!main.disabled);

  q.send({ canStart: false, programCheck: withRotary('outside', { overridable: true, blocking: [{ code: 'ETOUCH_TRAVEL_TOO_LOW', params: { over: '15' } }] }) });
  assert(main.disabled, language + ': a proven overrun still refuses the start');
  assert(cause().includes('15'), language + ': the overrun keeps the bar');
  assert.equal(shown(line()), EXPECTED[language], language + ': warning also shown next to an overrun');

  q.send({ programCheck: check('validated', { info: [rotary('A, B')], rotary: { letters: 'AB', line: 3, count: 2 } }) });
  assert(shown(line()).includes('A, B'), language + ': the letters found are named');

  q.send({});
  assert(!shown(line()), language + ': the line goes away with the file');
  assert.equal(cause(), ready, language + ': a file without A, B or C reads as before');
}

// Start confirmation.
(async () => {
  for (const language of ['fr', 'en', 'es']) {
    const f = load({ language, catalogs: ['i18n-messages-machine.js', 'i18n-messages-refus.js'] });
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'touch/refus.js'), 'utf8'), { window: f.window, document: f.document });
    assert(f.window.cncRefus, 'refusal presenter loaded');
    await f.connect();
    f.controls().start();
    f.answer(f.posts().at(-1), { nonce: 'n', expiresIn: 15, programCheck: { verdict: 'validated', axes: {}, info: [rotary()], rotary: { letters: 'A', line: 3, count: 2 } } });
    await f.flush();
    assert.equal(f.el('job-dialog').hidden, false, language + ': the ordinary confirmation opens');
    assert.equal(shown(f.el('job-start-rotary')), EXPECTED[language], language + ': warning in the start confirmation');
    assert(f.el('job-start-status').textContent, language + ': the X, Y, Z line is kept');
    f.advance(600); f.el('job-check').checked = true; f.el('job-check').fire('change');
    assert.equal(f.el('job-confirm').disabled, false, language + ': the start stays confirmable, as without A');
    f.controls().dispose();

    const plain = load({ language, catalogs: ['i18n-messages-machine.js', 'i18n-messages-refus.js'] });
    await plain.connect();
    plain.controls().start();
    plain.answer(plain.posts().at(-1), { nonce: 'n', expiresIn: 15, programCheck: { verdict: 'validated', axes: {}, info: [] } });
    await plain.flush();
    assert.equal(plain.el('job-dialog').hidden, false);
    assert(!shown(plain.el('job-start-rotary')), language + ': nothing added for a file without A, B or C');
    plain.controls().dispose();
  }
  console.log('PASS axis A, lot L0: rotary warning in the main Control view (details closed) and in the start confirmation, FR/EN/ES; nothing for a file without A, B or C.');
})().catch((e) => {
  console.error(e); process.exitCode = 1;
});
