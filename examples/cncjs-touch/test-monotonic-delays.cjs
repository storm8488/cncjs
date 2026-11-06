'use strict';
// B-6 (bug hunt 2026-11-06). The recovery delays of job-stream.js (retry, health) and of the HTTP
// fallback read of job-controls.js (nextPoll) were measured on the wall clock (job-controls passes
// no clock to the stream: Date.now). A clock set back (NTP at kiosk boot, RTC in local time) after
// a failure froze the recovery for the whole step back. They now use performance.now(); the
// transit of a packet stays on the wall clock, as the server's sentAt.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const { load } = require('./job-controls-fixture.cjs');

// 1. job-stream.js created without a clock, as job-controls.js does.
const requests = [];
function XHR() { this.open = (m, u) => { this.url = u; }; this.setRequestHeader = () => {}; this.send = () => { requests.push(this); }; this.abort = () => {}; }
let tick = null, wall = 1e12, mono = 5000;
const root = { navigator: { onLine: true }, performance: { now: () => mono }, XMLHttpRequest: XHR, setInterval: (fn) => { tick = fn; return 1; }, clearInterval() {} };
const context = { window: root, document: {}, Date: class extends Date { static now() { return wall; } }, Promise, XMLHttpRequest: XHR };
vm.createContext(context);
vm.runInContext(fs.readFileSync(__dirname + '/touch/job-stream.js', 'utf8'), context);
context.window.CNCJobStream.create({ apiBase: '/api', token: () => 'valid', timer: root, XMLHttpRequest: XHR, onStatus() {}, onSnapshot() {}, onDisconnect() {} });
// Kiosk started before CNCjs: the health check fails (connection refused).
requests.shift().onerror();
wall -= 3600 * 1000;                     // the wall clock goes back one hour
for (let s = 0; s < 300; s++) { wall += 1000; mono += 1000; tick(); }   // 5 real minutes
assert.ok(requests.length > 0, 'la santé doit être retentée (observé : aucune tentative avant ~1 h)');

// 2. Transit of a packet: the server's sentAt is on the wall clock (the same computer for the
//    kiosk). A wall-clock step of one hour, forward or back, between the stream's opening and its
//    first packet, or between two packets, must not make a fresh packet look old (or older than
//    the time since the stream opened).
function transits(step, moment) {
  const reqs = [], seen = [];
  function X() { this.open = (m, u) => { this.url = u; }; this.setRequestHeader = () => {}; this.send = () => { reqs.push(this); }; this.abort = () => {}; }
  let w = 1e12, m = 5000;
  const r = { navigator: { onLine: true }, performance: { now: () => m }, XMLHttpRequest: X, setInterval: () => 1, clearInterval() {} };
  const c = { window: r, document: {}, Date: class extends Date { static now() { return w; } }, Promise, XMLHttpRequest: X };
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(__dirname + '/touch/job-stream.js', 'utf8'), c);
  c.window.CNCJobStream.create({ apiBase: '/api', token: () => 'valid', timer: r, XMLHttpRequest: X, onStatus() {}, onSnapshot(p) { seen.push(p.transitMs); }, onDisconnect() {} });
  const h = reqs[0]; h.status = 200; h.responseText = JSON.stringify({ loaded: true, protocol: 1 }); h.onload();
  const live = reqs.find((q) => /touch-events/.test(q.url)); live.responseText = ''; live.status = 200;
  let seq = 0;
  const send = () => { live.responseText += JSON.stringify({ version: 1, epoch: 'e', sequence: ++seq, sentAt: w, transportId: 't', controllers: [] }) + '\n'; live.onprogress(); };
  const later = (ms) => { m += ms; w += ms; };
  if (moment === 'before') w += step;          // between the opening and the first packet
  later(200); send();
  if (moment === 'after') w += step;           // between two packets
  later(200); send();
  later(200); send();
  return seen;
}
for (const step of [3600 * 1000, -3600 * 1000]) {
  for (const moment of ['before', 'after']) {
    const seen = transits(step, moment);
    assert.equal(seen.length, 3);
    seen.forEach((t) => assert.ok(t >= 0 && t <= 1000, 'B-6: step ' + step / 1000 + ' s ' + moment + ' the first packet: transit ' + seen.join(', ') + ' ms'));
  }
}

(async () => {
  // 3. job-controls.js: the HTTP fallback read (no stream: health never answered).
  let m = 1000;
  const f = load({ performance: { now: () => m } });
  const reads = () => f.requests.filter((r) => r.method === 'GET' && /\/touch-job$/.test(r.url));
  assert.equal(reads().length, 1);
  f.answer(reads()[0], { controllers: [] }); await f.flush();   // read at rest: next one in 10 s
  f.advance(-3600 * 1000);               // wall clock back one hour
  for (let s = 0; s < 15; s++) { f.advance(1000); m += 1000; f.tick(); await f.flush(); }
  assert.ok(reads().length > 1, 'the state is read again ~10 s later, not in an hour');
  console.log('PASS');
})().catch((e) => { console.error(e); process.exit(1); });
