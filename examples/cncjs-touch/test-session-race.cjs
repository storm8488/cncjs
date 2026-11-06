'use strict';
// app.js session renewal, bug hunt 2026-11-06:
// D-7: a /signin answer that arrives after another tab stored a new session must not put the
//      older identity back. D-8: no token at load, renewal within the 60 s reload guard: the page
//      must still start with the token it obtained (no reload, no « authentification requise »).
// B-3: a request refused for its session (event cnc-session-refused from job-stream / job-controls)
//      renews the session (one reload); with CNCjs users, the operator is asked to sign in again.
const fs = require('fs'), vm = require('vm'), assert = require('assert').strict;
const source = fs.readFileSync(__dirname + '/touch/app.js', 'utf8');

function run({ stored, renewedAgo, compact } = {}) {
  const { document, node } = require('./dom-fixture.cjs').createDOM(['menu']);
  const storage = {}, session = {}, requests = [], listeners = {};
  if (stored !== undefined) storage.cnc = JSON.stringify(stored);
  if (renewedAgo !== undefined) session['cnc-touch-renewed'] = String(Date.now() - renewedAgo);
  let reloads = 0, sockets = 0, subscriptions = 0;
  class XMLHttpRequest {
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader() {}
    send(body) { this.body = JSON.parse(body); requests.push(this); }
    answer(status, data) { this.status = status; this.responseText = JSON.stringify(data); this.onload(); }
  }
  const io = { connect(origin, options) { sockets++; return { options, on() {}, emit() {} }; } };
  let state = { apiBase: '/api', transportConnected: false, transportReason: '', machine: null }, subscribers = [];
  const store = { get: () => state, set(p) { state = Object.assign({}, state, p); subscribers.forEach((f) => f(state)); }, subscribe(f) { subscriptions++; subscribers.push(f); f(state); return () => {}; } };
  const window = { addEventListener(n, f) { (listeners[n] || (listeners[n] = [])).push(f); }, removeEventListener() {},
    dispatchEvent(e) { (listeners[e.type] || []).slice().forEach((f) => f(e)); } };
  if (compact) { window.cncState = store; window.CNCJobStream = {}; }
  const context = {
    window, document, io, XMLHttpRequest, console, CustomEvent: function (type) { this.type = type; },
    localStorage: { getItem: (k) => (k in storage ? storage[k] : null), setItem: (k, v) => { storage[k] = String(v); } },
    sessionStorage: { getItem: (k) => (k in session ? session[k] : null), setItem: (k, v) => { session[k] = String(v); } },
    location: { origin: 'http://localhost:8000', reload: () => { reloads++; } },
    setInterval: () => 0, setTimeout: () => 0, clearTimeout() {}, clearInterval() {}, requestAnimationFrame: () => 0, Date
  };
  vm.runInNewContext(source, context);
  return { storage, requests, window, store, node, listeners,
    get reloads() { return reloads; }, get sockets() { return sockets; }, get subscriptions() { return subscriptions; },
    token: () => JSON.parse(storage.cnc).state.session.token, last: () => requests[requests.length - 1] };
}

// D-7: the renewal leaves with Alice's token; Bob signs in in another tab before the answer.
let r = run({ stored: { state: { session: { enabled: true, token: 'A-token', name: 'Alice' } } } });
assert.deepEqual(r.requests[0].body, { token: 'A-token' });
r.storage.cnc = JSON.stringify({ state: { session: { enabled: true, token: 'B-token', name: 'Bob' } } });
r.requests[0].answer(200, { enabled: true, token: 'A-token', name: 'Alice' });
assert.equal(r.token(), 'B-token', 'D-7: a late answer must not put the previous session back');
// Same with a fresh token for Alice (CNCjs without users at the time of the answer).
r = run({ stored: { state: { session: { enabled: false, token: 'A-token', name: '' } } } });
r.storage.cnc = JSON.stringify({ state: { session: { enabled: true, token: 'B-token', name: 'Bob' } } });
r.requests[0].answer(200, { enabled: false, token: 'A-fresh', name: '' });
assert.equal(r.token(), 'B-token');
assert.equal(r.reloads, 0);

// D-8: no token, the previous renewal was 10 s ago (guard holds the reload back).
r = run({ renewedAgo: 10000 });
assert.equal(r.node('st-server').textContent, 'Serveur : authentification requise');
assert.equal(r.sockets, 0);
r.requests[0].answer(200, { enabled: false, token: 'fresh', name: '' });
assert.equal(r.token(), 'fresh');
assert.equal(r.reloads, 0, 'within the guard: no reload');
assert.equal(r.sockets, 1, 'D-8: the page starts with the new token');
assert.match(r.window.cncSocket.options.query, /token=fresh/);
assert.ok(r.window.cncConnection, 'D-8: connection set up');
assert.notEqual(r.node('st-server').textContent, 'Serveur : authentification requise');
assert.equal(r.node('notice').hidden, true, 'the sign-in notice is cleared');
// Compact page (index.html): the store subscription is installed.
r = run({ renewedAgo: 10000, compact: true });
assert.equal(r.subscriptions, 0);
let renewed = 0; r.window.addEventListener('cnc-session-renewed', () => renewed++);
r.requests[0].answer(200, { enabled: false, token: 'fresh', name: '' });
assert.equal(r.subscriptions, 1, 'D-8: store subscription installed');
assert.equal(renewed, 1, 'the stream is told to check the new token at once');
assert.equal(r.node('st-server').textContent, 'Serveur : suivi indisponible');
// Outside the guard, the page still reloads once (unchanged).
r = run();
r.requests[0].answer(200, { enabled: false, token: 'fresh', name: '' });
assert.equal(r.reloads, 1);

// B-3: a request refused for its session, CNCjs without users: renewed, one reload.
r = run({ stored: { state: { session: { enabled: false, token: 'old', name: '' } } }, compact: true });
r.requests[0].answer(200, { enabled: false, token: 'new', name: '' });
assert.equal(r.reloads, 0, 'renewed in place at load');
r.window.dispatchEvent({ type: 'cnc-session-refused' });
r.window.dispatchEvent({ type: 'cnc-session-refused' });
assert.equal(r.requests.length, 2, 'one renewal at a time');
assert.deepEqual(r.last().body, { token: 'new' });
r.last().answer(200, { enabled: false, token: 'newer', name: '' });
assert.equal(r.token(), 'newer');
assert.equal(r.reloads, 1, 'B-3: reload with the renewed session');
// With CNCjs users: no token is given back; the notice asks to sign in again and stays.
r = run({ stored: { state: { session: { enabled: true, token: 'expired', name: 'ana' } } }, compact: true });
r.requests[0].answer(500, { msg: 'Internal server error' });
r.window.dispatchEvent({ type: 'cnc-session-refused' });
r.last().answer(500, { msg: 'Internal server error' });
assert.equal(r.reloads, 0);
assert.match(r.node('notice').textContent, /reconnectez-vous/);
r.store.set({ transportReason: 'Session CNCjs expirée.' });
assert.match(r.node('notice').textContent, /reconnectez-vous/, 'kept over the stream reason');
r.store.set({ transportConnected: true, transportReason: '' });
assert.doesNotMatch(r.node('notice').textContent, /reconnectez-vous/, 'cleared once the stream is back');
// A failed renewal request (network) renews again at the next refusal.
r.window.dispatchEvent({ type: 'cnc-session-refused' });
r.last().onerror();
const n = r.requests.length;
r.window.dispatchEvent({ type: 'cnc-session-refused' });
assert.equal(r.requests.length, n + 1);
console.log('PASS');
