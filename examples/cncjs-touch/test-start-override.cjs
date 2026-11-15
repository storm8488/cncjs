// D1: the ticket and the live check both guard confirmation, independently of canStart.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { load } = require('./job-controls-fixture.cjs');
const { createDOM } = require('./dom-fixture.cjs');

const blocking = [
  { code: 'ETOUCH_TRAVEL_TOO_LOW', params: { over: '6.3', min: '-135.76', limit: '-129.5' }, message: 'Le programme descend 6.3 mm trop bas (Z machine -135.76, limite -129.5).' },
  { code: 'ETOUCH_TRAVEL_TOO_HIGH', params: { over: '2', max: '2', limit: '0' }, message: 'Le programme monte 2 mm trop haut (Z machine 2, limite 0).' },
  ...['X', 'Y'].flatMap((axis) => ['+', '−'].map((sign) => ({ code: 'ETOUCH_TRAVEL_BEYOND', params: { axis, sign, over: '1', value: '409', limit: '408' }, message: `Le programme dépasse la course de 1 mm en ${axis}${sign} (${axis} machine 409, limite 408).` })))
];
const outside = { verdict: 'unknown', axes: { X: { verdict: 'validated' }, Y: { verdict: 'validated' }, Z: { verdict: 'outside' } }, blocking };
const refusal = { code: 'ETOUCH_START_OUTSIDE', params: { count: blocking.length }, reasons: blocking, message: 'Départ refusé : le programme sort de la course de la machine (dépassements : 6).' };

function dashboard(i18n, checkView, machine) {
  const dom = createDOM(['home']), listeners = {};
  const window = { cncI18n: i18n,
CNCProgramCheckView: checkView,
cncLibrarySelection: { file: 'part.nc', name: 'Part.nc' },
addEventListener: (n, f) => {
 listeners[n] = f;
} };
  vm.runInNewContext(fs.readFileSync(__dirname + '/touch/job-dashboard.js', 'utf8'), { window, document: dom.document, Date, localStorage: { getItem: () => null } });
  listeners['cnc-job-status']({ detail: { machine, simulation: false } });
  return dom.node('home-job-ready').textContent;
}

(async () => {
  for (const source of ['ticket', 'snapshot']) {
    const f = load();
    await f.connect(f.machine({ programCheck: source === 'snapshot' ? outside : null }));
    f.controls().start();
    if(source==='snapshot'){assert.equal(f.posts().length,0,'snapshot overrun never requests a normal ticket');f.controls().dispose();continue;}
    f.answer(f.posts().at(-1), { nonce: 'n', expiresIn: 15, programCheck: outside }); await f.flush();
    assert.equal(f.el('job-dialog').hidden,true,'a late outside ticket never opens the ordinary start dialog');
    assert.equal(f.el('job-feedback').getAttribute('data-state'),'failed','the late outside ticket gives a visible refusal');
    f.advance(600);f.el('job-check').checked = true; f.el('job-check').fire('change');
    assert.equal(f.el('job-confirm').disabled, true, source + ': no ordinary confirmation over a proven overrun');
    f.el('job-confirm').fire('click'); await f.flush();
    assert.equal(f.posts().filter((r) => r.body.action === 'start').length, 0, 'even a direct handler call cannot send start');
    f.controls().dispose();
  }
  for (const verdict of ['unknown', 'validated']) {
    const f = load(); await f.connect(); f.controls().start();
    f.answer(f.posts().at(-1), { nonce: 'n', expiresIn: 15, programCheck: { verdict, axes: {} } }); await f.flush();
    f.advance(600);f.el('job-check').checked = true; f.el('job-check').fire('change'); assert.equal(f.el('job-confirm').disabled, false, verdict + ' remains confirmable');
    f.controls().dispose();
  }
  {
    const f = load(); await f.connect(); f.controls().start();
    f.answer(f.posts().at(-1), { nonce: 'n', expiresIn: 15, programCheck: { verdict: 'unknown' } }); await f.flush();
    f.advance(600);f.el('job-check').checked = true; f.el('job-check').fire('change'); assert.equal(f.el('job-confirm').disabled, false);
    f.push([f.machine({ programCheck: outside })]);
    assert.equal(f.el('job-confirm').disabled, true, 'a live overrun immediately disables an already checked ticket');
    f.el('job-confirm').fire('click'); assert.equal(f.posts().filter((r) => r.body.action === 'start').length, 0);
    f.controls().dispose();
  }
  for (const language of ['fr', 'en', 'es']) {
    const f = load({ language, catalogs: ['i18n-messages-machine.js'] });
    const i = f.window.cncI18n, expected = blocking.map((r) => i.format(r.code, r.params, r.message));
    const m = f.machine({ canStart: false, startReason: refusal.message, refusals: { start: refusal }, programCheck: outside });
    await f.connect(m);
    assert.equal(f.el('job-start').disabled, true);
    for (const id of ['job-reason', 'file']) {
 for (const text of expected) {
 assert(f.el(id).textContent.includes(text), id + ': ' + text);
}
}
    const ready = dashboard(i, f.window.CNCProgramCheckView, m);
    const withoutCheck = dashboard(i, f.window.CNCProgramCheckView, { ...m, programCheck: null });
    for (const text of expected) assert(withoutCheck.includes(text), 'snapshot refusal reasons fallback: ' + text);
    for (const text of expected) {
 assert(ready.includes(text), 'Suivi: ' + text);
}
    assert.equal(f.window.CNCProgramCheckView.describe(outside).reasons.join(' '), expected.join(' '));
    // The 409 remains useful when a later snapshot no longer carries its reasons.
    f.push([f.machine()]); f.controls().start(); f.answer(f.posts().at(-1), refusal, 409); await f.flush();
    for (const text of expected) {
 assert(f.el('job-feedback').textContent.includes(text), '409: ' + text);
}
    assert.equal(f.el('job-dialog').hidden, true);
    f.controls().dispose();
  }
  console.log('PASS D1: ticket/live overrun guard, unknown warning, quantified refusals on Files and Follow, FR/EN/ES snapshots and 409.');
})().catch((e) => {
 console.error(e); process.exitCode = 1;
});
