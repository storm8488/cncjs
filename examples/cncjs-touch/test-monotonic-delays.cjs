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
const packets = [];
context.window.CNCJobStream.create({ apiBase: '/api', token: () => 'valid', timer: root, XMLHttpRequest: XHR, onStatus() {}, onSnapshot(p) { packets.push(p); }, onDisconnect() {} });
// Kiosk started before CNCjs: the health check fails (connection refused).
requests.shift().onerror();
wall -= 3600 * 1000;                     // the wall clock goes back one hour
for (let s = 0; s < 300; s++) { wall += 1000; mono += 1000; tick(); }   // 5 real minutes
assert.ok(requests.length > 0, 'la santé doit être retentée (observé : aucune tentative avant ~1 h)');

// 2. Transit of a packet: measured on the wall clock against the server's sentAt (same computer
//    for the kiosk): after the system clock moves back one hour, a fresh packet stays fresh.
{
  mono += 60000; tick();
  const h = requests.filter((r) => /custom\/health$/.test(r.url)).at(-1);
  h.status = 200; h.responseText = JSON.stringify({ loaded: true, protocol: 1 }); h.onload();
}
const live = requests.filter((r) => /touch-events/.test(r.url)).at(-1);
live.responseText = '';
let sequence = 0;
const machine = { port: 'COM3', controllerId: 'COM3', generation: 'g', type: 'Grbl', activeState: 'Idle', workflow: 'idle', name: '', fresh: true, statusAgeMs: 0, statusObservedAt: 0,
  canLoad: true, canStart: false, canResume: false, canPause: false, canStop: false };
function send() { live.status = 200; live.responseText += JSON.stringify({ version: 1, epoch: 'e', sequence: ++sequence, sentAt: wall, transportId: 't', controllers: [machine] }) + '\n'; live.onprogress(); }
send();
wall -= 3600 * 1000; mono += 200; wall += 200;
send();
assert.equal(packets.length, 2);
assert.ok(packets[1].transitMs < 1000, 'B-6: transit on the wall clock (observed ' + packets[1].transitMs + ' ms)');

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
