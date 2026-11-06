'use strict';
// B-6 (bug hunt 2026-11-06). The recovery delays of job-stream.js (retry, health) and of the HTTP
// fallback read of job-controls.js (nextPoll) were measured on the wall clock (job-controls passes
// no clock to the stream: Date.now). A clock set back (NTP at kiosk boot, RTC in local time) after
// a failure froze the recovery for the whole step back. They now use performance.now().
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

(async () => {
  // 2. job-controls.js: the HTTP fallback read (no stream: health never answered).
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
