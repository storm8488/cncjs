'use strict';
// B-3 (bug hunt 2026-11-06). Once the health check passed, a session refusal (403 « Forbidden
// Access » in plain text from CNCjs' express-jwt, or 401) on GET touch-events or on touch-job
// was never recognised: the page reopened the stream with the same token every 30 s and never
// checked the health again. Now: the refusal is named, the health check runs again, and its
// refusal asks app.js for a renewal (event cnc-session-refused; app.js: test-session-race.cjs).
// B-5: a plain-text 403 on touch-job is a refused session, not « Commandes indisponibles (HTTP 403) ».
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const { load } = require('./job-controls-fixture.cjs');

// 1. job-stream.js alone.
const requests = [];
function XHR() { this.headers = {}; this.open = (m, u) => { this.method = m; this.url = u; }; this.setRequestHeader = (k, v) => { this.headers[k] = v; }; this.send = () => { requests.push(this); }; this.abort = () => {}; }
let tick = null;
const root = { navigator: { onLine: true }, XMLHttpRequest: XHR, setInterval: (fn) => { tick = fn; return 1; }, clearInterval() {} };
const context = { window: root, document: {}, Date, Promise, XMLHttpRequest: XHR };
vm.createContext(context);
vm.runInContext(fs.readFileSync(__dirname + '/touch/job-stream.js', 'utf8'), context);
let now = 1e6, refusals = 0;
const status = [], disconnects = [];
context.window.CNCJobStream.create({ apiBase: '/api', token: () => 'expired-token', clientId: 't-abc-1234', clock: () => now, timer: root, XMLHttpRequest: XHR,
  onStatus: (s) => status.push(s), onSnapshot() {}, onDisconnect: (r) => disconnects.push(r), onRefused: () => refusals++ });
// Health accepted at load (token still valid).
const health = requests.shift();
assert.match(health.url, /custom\/health$/);
health.status = 200; health.responseText = JSON.stringify({ loaded: true, protocol: 1 }); health.onload();
const first = requests.shift();
assert.match(first.url, /touch-events/);
// The token expires: the server closes this stream, then refuses the next ones (403 text).
first.status = 200; first.responseText = ''; first.onload();
const urls = [];
for (let s = 0; s < 300; s++) {           // 5 minutes
  now += 1000; tick();
  const r = requests.shift();
  if (!r) continue;
  urls.push(r.url);
  r.status = 403; r.responseText = 'Forbidden Access';
  if (r.onload) r.onload();
}
const said = status.concat(disconnects).join(' | ');
assert.match(said, /Session CNCjs expirée/, 'un 403 du flux doit être dit « session expirée »');
assert.ok(urls.some((u) => /custom\/health$/.test(u)), 'health checked again after the refusal');
assert.ok(urls.filter((u) => /touch-events/.test(u)).length <= 1, 'the stream is not reopened every 30 s with a refused token');
assert.ok(refusals >= 1, 'app.js is told to renew the session');
assert.ok(refusals <= 6, 'at most one renewal request a minute');

(async () => {
  // 2. job-controls.js: the touch-job read is refused with CNCjs' plain-text 403.
  const f = load();
  let refused = 0; f.window.addEventListener('cnc-session-refused', () => refused++);
  await f.connect();
  f.answer(f.requests.find((r) => r.method === 'GET' && /\/touch-job$/.test(r.url)), { controllers: [] });
  await f.flush();
  // A command refused with the plain-text 403.
  f.el('job-load').disabled = false;
  const sent = f.controls().override('feed', 10).catch((e) => e);
  const post = f.posts().at(-1);
  post.status = 403; post.responseText = 'Forbidden Access'; post.onload();
  const error = await sent;
  assert.equal(error.message, 'Session CNCjs expirée.', 'B-5: plain 403 = refused session (not « HTTP 403 »)');
  assert.equal(refused, 1, 'B-3: app.js asked to renew the session');
  // The stream's health is checked again at the next tick.
  const before = f.requests.filter((r) => /custom\/health$/.test(r.url)).length;
  f.tick();
  assert.equal(f.requests.filter((r) => /custom\/health$/.test(r.url)).length, before + 1, 'health checked again');
  // A 403 with a JSON body stays the server's refusal (its message).
  const again = f.controls().override('feed', 10).catch((e) => e);
  const p2 = f.posts().at(-1);
  p2.status = 403; p2.responseText = JSON.stringify({ message: 'Refusé : broche.' }); p2.onload();
  assert.equal((await again).message, 'Refusé : broche.');
  assert.equal(refused, 1);
  console.log('PASS');
})().catch((e) => { console.error(e); process.exit(1); });
