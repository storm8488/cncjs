'use strict';
// B-4 (bug hunt 2026-11-06). Chromium may set navigator.onLine to false while CNCjs answers: the
// kiosk on localhost with Wi-Fi off (only the loopback up), a tablet on the LAN whose link is
// misread. The flag must never suspend requests nor disable Pause / Arrêter, on localhost or on
// the LAN: it is a warning only, and real request failures decide.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const { load } = require('./job-controls-fixture.cjs');

function streamOnly(location) {
  const requests = [];
  function XHR() { this.headers = {}; this.open = (m, u) => { this.method = m; this.url = u; }; this.setRequestHeader = () => {}; this.send = () => { requests.push(this); }; this.abort = () => {}; }
  let tick = null;
  const root = { navigator: { onLine: false }, location, XMLHttpRequest: XHR, setInterval: (fn) => { tick = fn; return 1; }, clearInterval() {} };
  const context = { window: root, document: {}, Date, Promise, XMLHttpRequest: XHR };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(__dirname + '/touch/job-stream.js', 'utf8'), context);
  let now = 1e6; const reasons = [];
  const stream = context.window.CNCJobStream.create({ apiBase: '/api', token: () => 'valid', clientId: 't-abc-1234', clock: () => now, timer: root, XMLHttpRequest: XHR,
    onStatus: (s) => reasons.push(s), onSnapshot() {}, onDisconnect: (r) => reasons.push(r) });
  return { requests, reasons, stream, run(seconds) { for (let s = 0; s < seconds; s++) { now += 1000; tick(); } } };
}

// 1. job-stream.js with the flag false, on localhost and on the LAN: health and stream still go out.
for (const host of ['localhost', '192.168.1.29']) {
  const s = streamOnly({ origin: 'http://' + host + ':8000', hostname: host });
  assert.ok(s.requests.some((r) => /custom\/health$/.test(r.url)), host + ': health sent at once');
  s.requests[0].status = 200; s.requests[0].responseText = JSON.stringify({ loaded: true, protocol: 1 }); s.requests[0].onload();
  assert.ok(s.requests.some((r) => /touch-events/.test(r.url)), host + ': stream opened');
  const n = s.reasons.length; s.stream.setOnline(false);
  assert.equal(s.reasons.length, n, host + ': an offline event closes nothing');
  assert.ok(!s.reasons.some((r) => /Réseau indisponible/.test(r)), host + ': no suspension');
}

(async () => {
  // 2. job-controls.js, reloaded during a job with the flag false: state read, Pause / Arrêter offered.
  for (const hostname of ['localhost', '192.168.1.29']) {
    const f = load({ hostname, onLine: false });
    const read = f.requests.find((r) => r.method === 'GET' && /\/touch-job$/.test(r.url));
    assert.ok(read, hostname + ': HTTP state read despite the offline flag');
    // The fallback read alone (stream not up yet) shows the running job: Pause and Arrêter usable.
    f.answer(read, { controllers: [f.machine({ workflow: 'running', activeState: 'Run', canPause: true, canStop: true, canStart: false })] }); await f.flush();
    assert.equal(f.el('job-pause').disabled, false, hostname + ': Pause usable');
    assert.equal(f.el('job-stop').disabled, false, hostname + ': Arrêter usable');
    f.tick();
    assert.match(f.lastStatus() && f.window.cncState.get().transportReason, /navigateur signale le réseau coupé/, hostname + ': warning shown');
    await f.connect(f.machine({ workflow: 'running', activeState: 'Run', canPause: true, canStop: true, canStart: false }));
    (f.listeners.offline || []).forEach((fn) => fn());
    f.tick();
    assert.equal(f.el('job-pause').disabled, false, hostname + ': Pause still usable after an offline event');
    f.el('job-pause').click(); await f.flush();
    assert.ok(f.posts().some((r) => r.body && r.body.action === 'pause'), hostname + ': Pause sent');
    f.el('job-stop').click(); await f.flush();
    assert.ok(f.posts().some((r) => r.body && r.body.action === 'stop'), hostname + ': Arrêter sent');
    const answerAll = async () => { f.posts().filter((r) => !r.answered).forEach((r) => { r.answered = true; r.status = 200; r.responseText = '{}'; r.onload(); }); await f.flush(); };
    await answerAll();
    // A command other than Pause / Arrêter is not held back by the flag either.
    const sent = f.controls().override('feed', 10).catch(() => {}); await f.flush();
    assert.ok(f.posts().some((r) => r.body && r.body.action === 'override'), hostname + ': other commands not held back');
    await answerAll(); await sent;
    // 'online' clears the warning.
    (f.listeners.online || []).forEach((fn) => fn());
    assert.doesNotMatch(f.window.cncState.get().transportReason, /navigateur/);
  }
  console.log('PASS');
})().catch((e) => { console.error(e); process.exit(1); });
