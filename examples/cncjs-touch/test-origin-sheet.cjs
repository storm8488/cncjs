'use strict';
// Real shell and isolation, actual origin transport, loopback fixture only.
const assert = require('assert').strict;
const { page } = require('./session-dom-fixture.cjs');
const { fixture, machine } = require('./test-real-motion.cjs');
const H = require('./browser-run.cjs');
const http = require('http');
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(setImmediate); };
const state = patch => machine({ referenceLost: null, workOffset: { state: 'proven', stored: { x: 0, y: 100, z: -105 }, reported: { x: 0, y: 100, z: -105 } }, ...patch });
function request(url, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, res => {
      let text = '';res.setEncoding('utf8');res.on('data', d => { text += d; });res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(text) }));
    });
    req.on('error', reject);req.setTimeout(3000, () => req.destroy(new Error('local fixture timeout')));req.end(JSON.stringify(body));
  });
}
async function setup(language) {
  const q = page(language);q.window.cncJobControls.dispose();await flush();
  q.window.document = q.document;q.run('strip-guard.js');q.run('touch-shell.js');
  const transport = fixture({ locale: language });await transport.connect(state());
  q.window.cncJobControls = transport.controls();q.run('real-motion.js');
  const send = (patch, detail) => q.emit('cnc-job-status', { machine: state(patch), transportConnected: true, pilot: { state: 'free' }, simulation: false, ...detail });
  send();q.window.cncShell.go('jog');q.node('zero-more-open').click();
  return { q, transport, send, close() { transport.controls().dispose();transport.fireWindow('pagehide');q.emit('pagehide'); } };
}
async function main() {
  const fx = await H.startV2Fixture();fx.real = true;fx.setPhase('idle');
  try {
    for (const language of ['fr', 'en', 'es']) {
      const f = await setup(language), { q, transport: tr } = f;
      try {
        assert(q.node('screen-jog').inert || q.document.querySelector('main').inert, 'background isolated');
        const button = q.node('zero-at-machine-y');
        assert(!q.window.CNCStripGuard.covered(button), 'sheet and all its ancestors remain usable');
        button.click();await flush();
        const prepare = tr.posts().at(-1);assert(prepare, 'permitted Y touch sends prepare');
        assert.equal(prepare.body.action, 'prepare');assert.equal(prepare.body.operation, 'set-origin');assert.equal(prepare.body.at, 'machine');assert.deepEqual(Array.from(prepare.body.axes), ['Y']);
        button.handlers.click[0]();await flush();
        assert.equal(tr.posts().length, 1, 'a second touch cannot request another ticket');
        assert(q.node('zero-more-cause').textContent.includes(q.window.cncI18n.t('Confirmation d’origine en attente : confirmez ou annulez-la d’abord.')), 'pending request explained inside the sheet');
        const answer = await request(fx.base + 'api/touch-job', prepare.body);assert.equal(answer.status, 200);
        tr.answer(prepare, answer.data);await flush();
        assert.equal(q.node('real-motion-ticket').hidden, false, 'permitted sheet touch opens confirmation');
        assert.equal(q.node('real-motion-ticket-title').textContent, q.window.cncI18n.t('Zéro {axes} à l’origine machine').replace('{axes}', 'Y'));
        assert.equal(tr.posts().length, 1, 'opening the dialog never executes a zero');
        q.node('real-motion-origin-cancel').click();q.node('zero-more-open').click();
        // Delayed click delivered after a lock: guard stays, but the sheet must explain it.
        q.window.cncScreenLock = { locked: () => true };
        button.handlers.click[0]();await flush();
        assert.equal(tr.posts().length, 1, 'lock sends nothing');
        assert(q.node('zero-more-cause').textContent.includes(q.window.cncI18n.t('Écran verrouillé : Pause et Arrêter restent actifs. Touchez deux fois le cadenas pour déverrouiller.')), 'lock refusal inside the sheet');
        q.window.cncScreenLock = { locked: () => false };
        const check = async (change, restore, phrase) => {
          change();button.handlers.click[0]();await flush();
          assert.equal(tr.posts().length, 1, 'refused touch sends nothing: ' + phrase);
          assert(q.node('zero-more-cause').textContent.includes(q.window.cncI18n.t(phrase)), 'sheet explains: ' + phrase);
          restore();
        };
        for (const node of [button, button.parentNode, q.node('ks-zero-more')]) {
          await check(() => { node.inert = true; }, () => { node.inert = false; }, 'Ce bouton est recouvert : fermez le dialogue au-dessus.');
        }
        await check(() => q.node('screen-jog').classList.remove('active'), () => q.node('screen-jog').classList.add('active'), 'Rouvrez Zéro pièce pour demander ce zéro.');
        await check(() => { q.document.hidden = true; }, () => { q.document.hidden = false; }, 'Rouvrez Zéro pièce pour demander ce zéro.');
        await check(() => { q.node('ks-zero-more').hidden = true; }, () => { q.node('ks-zero-more').hidden = false; }, 'Rouvrez Autres zéros pour choisir un axe.');
        await check(() => button.setAttribute('data-axis', '?'), () => button.setAttribute('data-axis', 'Y'), 'Axe inconnu : rechargez la page au repos.');
        await check(() => { button.hidden = true; }, () => { button.hidden = false; }, 'Ce bouton est indisponible : rouvrez Zéro pièce.');
        await check(() => { button.disabled = true; }, () => { button.disabled = false; }, 'Ce bouton est indisponible : rouvrez Zéro pièce.');
        const rects = button.getClientRects;
        await check(() => { button.getClientRects = () => []; }, () => { button.getClientRects = rects; }, 'Ce bouton est indisponible : rouvrez Zéro pièce.');
        await check(() => { q.window.cncJobControls = null; }, () => { q.window.cncJobControls = tr.controls(); }, 'Commandes indisponibles : rechargez la page.');
        // A local reason with no server code must retain its actual explanation.
        f.send({ loading: true });
        assert(q.node('zero-more-cause').textContent.includes(q.window.cncI18n.t('Chargement en cours : attendez sa fin.')));
        assert(button.disabled);f.send();
        if(language==='fr'){
          f.send({motion:{...state().motion,canSetOrigin:false,setOriginReason:'Version Grbl inconnue'}});
          assert(q.node('zero-more-cause').textContent.includes(q.window.cncSeance.libelle('relire')), 'uncoded refusal retains its existing settings remedy');f.send();
        }
        for (const [patch, code] of [[{ homed: false }, 'ETOUCH_ORIGIN_NOT_HOMED'], [{ workOffset: { state: 'unknown' } }, 'ETOUCH_OFFSET_UNCONFIRMED']]) {
          f.send(patch);button.handlers.click[0]();await flush();
          assert.equal(tr.posts().length, 1);assert(button.disabled);
          assert(q.node('zero-more-cause').textContent.includes(q.window.cncRefus.lire({ code }).phrase));f.send();
        }
        // A synchronous owner failure also releases the pending-request guard.
        const origin = q.window.cncJobControls.origin;
        q.window.cncJobControls.origin = () => { throw new Error('fixture owner failure'); };
        button.click();await flush();assert(q.node('zero-more-cause').textContent.includes('fixture owner failure'));
        q.window.cncJobControls.origin = origin;
        button.click();await flush();const late = tr.posts().at(-1);assert.equal(tr.posts().length, 2);
        f.send({ generation: 'gen-2' });tr.answer(late, { nonce: 'obsolete', generation: 'gen-1', expiresIn: 15 });await flush();
        assert(q.node('real-motion-ticket').hidden, 'changed generation discards the response');
        assert(q.node('zero-more-cause').textContent.includes(q.window.cncI18n.t('Confirmation expirée ou état changé : demandez-la à nouveau.')));
        f.send();
        for (const axis of ['X', 'Z']) {
          q.node('zero-at-machine-' + axis.toLowerCase()).click();await flush();const next = tr.posts().at(-1);
          assert.equal(next.body.at, 'machine');assert.deepEqual(Array.from(next.body.axes), [axis]);
          tr.answer(next, { nonce: 'axis-' + axis, generation: 'gen-1', expiresIn: 15 });await flush();
          assert.equal(q.node('real-motion-ticket').hidden, false);q.node('real-motion-origin-cancel').click();q.node('zero-more-open').click();
        }
      } finally { f.close(); }
    }
  } finally { fx.close(); }
  console.log('PASS origin sheet: actual isolation, XYZ preparation with Y over loopback, FR/EN/ES confirmation, every local guard explained, coded refusals, synchronous failure and late generation rejected.');
}
if (require.main === module) main().catch(e => { console.error(e);process.exitCode = 1; });
module.exports = { main, setup, flush, state, request };
