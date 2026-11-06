'use strict';
// B-4 (bug hunt 2026-11-06). The kiosk opens http://localhost:8000/touch/ (INSTALL.md): page and
// CNCjs run on the same tablet. Chromium may set navigator.onLine to false when only the loopback
// interface is up (Wi-Fi off, out of range, or changing network from Réglages → Wi-Fi), yet the
// local server answers. With an API on the loopback, the flag is ignored: the state stays followed
// and Pause / Arrêter stay usable (also after a reload while offline). Elsewhere it still suspends.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const { load } = require('./job-controls-fixture.cjs');

function streamOnly(location, onLine) {
  const requests = [];
  function XHR() { this.headers = {}; this.open = (m, u) => { this.method = m; this.url = u; }; this.setRequestHeader = () => {}; this.send = () => { requests.push(this); }; this.abort = () => {}; }
  let tick = null;
  const root = { navigator: { onLine }, location, XMLHttpRequest: XHR, setInterval: (fn) => { tick = fn; return 1; }, clearInterval() {} };
  const context = { window: root, document: {}, Date, Promise, URL, XMLHttpRequest: XHR };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(__dirname + '/touch/job-stream.js', 'utf8'), context);
  let now = 1e6; const reasons = [];
  const stream = context.window.CNCJobStream.create({ apiBase: '/api', token: () => 'valid', clientId: 't-abc-1234', clock: () => now, timer: root, XMLHttpRequest: XHR,
    onStatus: (s) => reasons.push(s), onSnapshot() {}, onDisconnect: (r) => reasons.push(r) });
  return { requests, reasons, stream, loopback: context.window.CNCJobStream.loopback, run(seconds) { for (let s = 0; s < seconds; s++) { now += 1000; tick(); } } };
}

// 1. job-stream.js, page on localhost, flag false: health and stream still go out.
let s = streamOnly({ origin: 'http://localhost:8000', hostname: 'localhost' }, false);
s.run(120);
assert.ok(s.requests.length > 0, 'page servie par localhost, Wi-Fi coupé : la santé / le flux local doivent encore partir');
assert.ok(!s.reasons.some((r) => /Réseau indisponible/.test(r)), 'no offline reason on the loopback');
// An 'offline' event is ignored too.
const before = s.reasons.length; s.stream.setOnline(false); assert.equal(s.reasons.length, before, 'setOnline(false) ignored on the loopback');
// Loopback names.
['localhost', '127.0.0.1', '127.1.2.3', '[::1]', 'touch.localhost'].forEach((h) => assert.equal(s.loopback('http://' + h + ':8000/api'), true, h));
['192.168.1.31', 'cnc.local', 'example.com'].forEach((h) => assert.equal(s.loopback('http://' + h + ':8000/api'), false, h));
// 2. Elsewhere (tablet reaching a remote CNCjs), the flag still suspends the follow-up.
s = streamOnly({ origin: 'http://192.168.1.29:8000', hostname: '192.168.1.29' }, false);
s.run(120);
assert.equal(s.requests.length, 0, 'remote API: offline flag still suspends');

(async () => {
  // 3. job-controls.js, reloaded on localhost while offline during a job: state read, Pause / Arrêter offered.
  const f = load({ hostname: 'localhost', onLine: false });
  assert.ok(f.requests.some((r) => r.method === 'GET' && /\/touch-job$/.test(r.url)), 'HTTP state read despite the offline flag');
  await f.connect(f.machine({ workflow: 'running', activeState: 'Run', canPause: true, canStop: true, canStart: false }));
  assert.equal(f.el('job-pause').disabled, false, 'Pause usable');
  assert.equal(f.el('job-stop').disabled, false, 'Arrêter usable');
  // An 'offline' event while connected changes nothing.
  (f.listeners.offline || []).forEach((fn) => fn());
  f.tick();
  assert.equal(f.el('job-pause').disabled, false, 'Pause still usable after an offline event');
  f.el('job-pause').click(); await f.flush();
  assert.ok(f.posts().some((r) => r.body && r.body.action === 'pause'), 'Pause sent');
  // 4. Remote API with the flag false: no state read (unchanged behaviour).
  const g = load({ hostname: '192.168.1.29', onLine: false });
  assert.ok(!g.requests.some((r) => /\/touch-job$/.test(r.url)), 'remote API: no read while offline');
  console.log('PASS');
})().catch((e) => { console.error(e); process.exit(1); });
