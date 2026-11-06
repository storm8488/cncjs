'use strict';
// app.js renews the CNCjs session token (30-day lifetime) through /api/signin.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const source = fs.readFileSync(__dirname + '/touch/app.js', 'utf8');

function run({ stored, socketError } = {}) {
  const { document } = require('./dom-fixture.cjs').createDOM(['menu']);
  const storage = {}, session = {}, requests = [], timers = [];
  if (stored !== undefined) storage.cnc = JSON.stringify(stored);
  let reloads = 0, socket = null;
  class XMLHttpRequest {
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader() {}
    send(body) { this.body = JSON.parse(body); requests.push(this); }
    answer(status, data) { this.status = status; this.responseText = JSON.stringify(data); this.onload(); }
  }
  const io = { connect() { socket = { handlers: {}, on(n, f) { this.handlers[n] = f; }, emit() {} }; return socket; } };
  const clock = { mono: 0 };
  const window = { performance: { now: () => clock.mono }, addEventListener() {}, removeEventListener() {} };
  const context = {
    window, document, io, XMLHttpRequest, console,
    localStorage: { getItem: (k) => (k in storage ? storage[k] : null), setItem: (k, v) => { storage[k] = String(v); } },
    sessionStorage: { getItem: (k) => (k in session ? session[k] : null), setItem: (k, v) => { session[k] = String(v); } },
    location: { origin: 'http://localhost:8000', reload: () => { reloads++; } },
    setInterval: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    setTimeout: () => 0, clearTimeout() {}, clearInterval() {},
    requestAnimationFrame: () => 0, Date
  };
  try { vm.runInNewContext(source, context); } catch (e) { if (!socketError) throw e; }
  return { storage, requests, timers, advance(ms) { clock.mono += ms; }, get reloads() { return reloads; }, get socket() { return socket; }, token: () => JSON.parse(storage.cnc).state.session.token };
}

// No session yet (fresh kiosk): asks for one, stores it, reloads once to connect with it.
let r = run();
assert.equal(r.requests.length, 1);
assert.equal(r.requests[0].url, '/api' + '/signin');
assert.deepEqual(r.requests[0].body, {});
r.requests[0].answer(200, { enabled: false, token: 'fresh', name: '' });
assert.equal(r.token(), 'fresh');
assert.equal(r.reloads, 1);

// CNCjs with users: no token is given without a password, nothing is stored, no reload.
r = run();
r.requests[0].answer(401, { msg: 'Authentication failed' });
assert.equal(r.storage.cnc, undefined);
assert.equal(r.reloads, 0);

// Existing session: renewed in place (other settings kept), the page is not reloaded.
r = run({ stored: { version: '1.11.5', state: { session: { enabled: false, token: 'old', name: '' }, widgets: { a: 1 } } } });
assert.deepEqual(r.requests[0].body, { token: 'old' });
r.requests[0].answer(200, { enabled: false, token: 'new', name: '' });
assert.equal(r.token(), 'new');
assert.deepEqual(JSON.parse(r.storage.cnc).state.widgets, { a: 1 });
assert.equal(JSON.parse(r.storage.cnc).version, '1.11.5');
assert.equal(r.reloads, 0);
// With users the server returns the same token: nothing to write.
const before = r.storage.cnc;
const every = r.timers.find((t) => t.ms === 12 * 3600 * 1000);
assert(every, 'renewed every 12 hours');
r.advance(12 * 3600 * 1000); every.fn();
r.requests[1].answer(200, { enabled: true, token: 'new', name: 'ana' });
assert.equal(r.storage.cnc, before);

// The socket refuses an expired token: renewed, then one reload (not a loop). One renewal
// attempt a minute at most for the whole page (the load counts).
assert(r.socket, 'socket opened with the stored token');
{
  const sent = r.requests.length;
  r.socket.handlers.error({ message: 'jwt expired' });
  assert.equal(r.requests.length, sent, 'no second renewal within the minute');
  r.advance(60000);
  r.socket.handlers.error({ message: 'jwt expired', code: 'invalid_token', type: 'UnauthorizedError' });
  r.requests[r.requests.length - 1].answer(200, { enabled: false, token: 'newer', name: '' });
  assert.equal(r.reloads, 1);
  r.advance(60000);
  r.socket.handlers.error({ message: 'jwt expired' });
  r.requests[r.requests.length - 1].answer(200, { enabled: false, token: 'newest', name: '' });
  assert.equal(r.reloads, 1, 'at most one reload a minute');
  // Other connection errors do not touch the session.
  const n = r.requests.length;
  r.advance(60000);
  r.socket.handlers.connect_error({ message: 'xhr poll error' });
  assert.equal(r.requests.length, n);
}

console.log('PASS: session token asked for when missing (one reload), renewed in place and every 12 h, untouched with CNCjs users, renewed on a refused socket token without reload loops.');
