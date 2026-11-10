'use strict';
// app.js session renewal, bug hunt 2026-11-06:
// D-7: a /signin answer that arrives after another tab stored a new session must not put the
//      older identity back. D-8: no token at load, renewal within the 60 s reload guard: the page
//      must still start with the token it obtained (no reload, no « authentification requise »).
// B-3: a request refused for its session (event cnc-session-refused from job-stream / job-controls)
//      renews the session (one reload); with CNCjs users, the operator is asked to sign in again.
const fs = require('fs'), vm = require('vm'), assert = require('assert').strict;
const source = fs.readFileSync(__dirname + '/touch/app.js', 'utf8');

// shared: {storage, session, wall} kept by the next page of the same tab (a reload); the
// monotonic clock (performance.now) restarts with each page, the wall clock goes on.
function run({ stored, renewedAgo, compact, shared } = {}) {
  const { document, node } = require('./dom-fixture.cjs').createDOM(['menu']);
  const tab = shared || { storage: {}, session: {}, wall: { now: 1.7e12 } };
  const storage = tab.storage, session = tab.session, requests = [], listeners = {};
  if (stored !== undefined) storage.cnc = JSON.stringify(stored);
  if (renewedAgo !== undefined) session['cnc-touch-renewed'] = String(tab.wall.now - renewedAgo);
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
  const clock = { mono: 0 }, timers = [], timeouts = [];
  class FakeDate extends Date { static now() { return tab.wall.now; } }
  const window = { performance: { now: () => clock.mono }, addEventListener(n, f) { (listeners[n] || (listeners[n] = [])).push(f); }, removeEventListener() {},
    dispatchEvent(e) { (listeners[e.type] || []).slice().forEach((f) => f(e)); } };
  if (compact) { window.cncState = store; window.CNCJobStream = {}; }
  const context = {
    window, document, io, XMLHttpRequest, console, CustomEvent: function (type) { this.type = type; },
    localStorage: { getItem: (k) => (k in storage ? storage[k] : null), setItem: (k, v) => { storage[k] = String(v); } },
    sessionStorage: { getItem: (k) => (k in session ? session[k] : null), setItem: (k, v) => { session[k] = String(v); } },
    location: { origin: 'http://localhost:8000', reload: () => { reloads++; } },
    setInterval: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, setTimeout: (fn, ms) => { timeouts.push({ fn, ms }); return timeouts.length; }, clearTimeout() {}, clearInterval() {}, requestAnimationFrame: () => 0, Date: FakeDate
  };
  vm.runInNewContext(source, context);
  return { tab, storage, requests, window, store, node, listeners, timers, timeouts, advance(ms) { clock.mono += ms; tab.wall.now += ms; },
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

// D-7 without a token at load: Bob's tab stores a valid session during /signin; the ignored
// answer must still let the page start, with the stored session.
r = run({ compact: true });
assert.equal(r.subscriptions, 0);
let rechecks = 0; r.window.addEventListener('cnc-session-renewed', () => rechecks++);
r.storage.cnc = JSON.stringify({ state: { session: { enabled: true, token: 'B-token', name: 'Bob' } } });
r.requests[0].answer(200, { enabled: false, token: 'A-fresh', name: '' });
assert.equal(r.token(), 'B-token');
assert.equal(r.subscriptions, 1, 'D-7: the page starts with the stored session');
assert.ok(r.window.cncConnection, 'D-7: connection set up');
assert.equal(rechecks, 1, 'D-7: the stream rechecks the stored session at once');
assert.notEqual(r.node('st-server').textContent, 'Serveur : authentification requise');
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
assert.equal(r.requests.length, 1, 'at most one renewal attempt a minute (the load counts)');
r.advance(60000);
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
assert.match(r.node('notice').textContent, /reconnectez-vous/, 'said from the load already');
r.advance(60000);
r.window.dispatchEvent({ type: 'cnc-session-refused' });
r.last().answer(500, { msg: 'Internal server error' });
assert.equal(r.reloads, 0);
assert.match(r.node('notice').textContent, /reconnectez-vous/);
r.store.set({ transportReason: 'Session CNCjs expirée.' });
assert.match(r.node('notice').textContent, /reconnectez-vous/, 'kept over the stream reason');
r.store.set({ transportConnected: true, transportReason: '' });
assert.doesNotMatch(r.node('notice').textContent, /reconnectez-vous/, 'cleared once the stream is back');
// E7 / N13 (rehearsal): no controller (port closed) is not a selection to make in Fichiers only, and Arrêter cannot reach the machine.
assert.match(r.node('notice').textContent, /^Aucun contrôleur suivi : ouvrez le port dans CNCjs au PC.*Arrêter n’atteint pas la machine\.$/);
// A failed renewal request (network): tried again at the next refusal a minute later, not before.
r.advance(60000);
r.window.dispatchEvent({ type: 'cnc-session-refused' });
r.last().onerror();
const n = r.requests.length;
r.window.dispatchEvent({ type: 'cnc-session-refused' });
assert.equal(r.requests.length, n);
r.advance(60000);
r.window.dispatchEvent({ type: 'cnc-session-refused' });
assert.equal(r.requests.length, n + 1);

// Every renewal goes through the same guard: the 12 h timer included.
r = run({ stored: { state: { session: { enabled: false, token: 'old', name: '' } } }, compact: true });
r.requests[0].answer(200, { enabled: false, token: 'new', name: '' });
const twelve = r.timers.find((t) => t.ms === 12 * 3600 * 1000);
r.advance(60000);
r.window.dispatchEvent({ type: 'cnc-session-refused' });
assert.equal(r.requests.length, 2);
r.advance(100); twelve.fn();
assert.equal(r.requests.length, 2, 'the 12 h timer does not send a second /signin at the same time');
r.last().answer(200, { enabled: false, token: 'newer', name: '' });
r.advance(60000); twelve.fn();
assert.equal(r.requests.length, 3, 'the 12 h renewal still runs once the minute has passed');
// The /signin request has a timeout, and a lost answer always releases the guard.
for (const end of ['ontimeout', 'onerror', 'onabort']) {
  r = run({ stored: { state: { session: { enabled: true, token: 'expired', name: 'ana' } } }, compact: true });
  assert.ok(r.requests[0].timeout > 0 && r.requests[0].timeout <= 15000, 'timeout set');
  r.requests[0][end]();
  r.advance(60000);
  r.window.dispatchEvent({ type: 'cnc-session-refused' });
  assert.equal(r.requests.length, 2, end + ': the next refusal a minute later renews again');
}

// The once-a-minute limit survives the reload it triggers (two pages of one tab sharing storage).
r = run({ stored: { state: { session: { enabled: false, token: 'old', name: '' } } }, compact: true });
r.requests[0].answer(200, { enabled: false, token: 'new', name: '' });      // t = 0
r.advance(60000);
r.window.dispatchEvent({ type: 'cnc-session-refused' });
r.last().answer(200, { enabled: false, token: 'newer', name: '' });
assert.equal(r.reloads, 1, 'renewed at t = 60 s, the page reloads');
r.advance(1);
let next = run({ compact: true, shared: r.tab });
assert.equal(next.requests.length, 0, 'the reloaded page (with a token) does not ask again 1 ms later');
next.advance(60000);
next.window.dispatchEvent({ type: 'cnc-session-refused' });
assert.equal(next.requests.length, 1, 'a minute later it may');
// A page without a token, loaded within the minute after an attempt: it waits the remaining time.
r = run({ compact: true });
r.requests[0].answer(500, { msg: 'down' });
r.advance(20000);
next = run({ compact: true, shared: r.tab });
assert.equal(next.requests.length, 0, 'no token, 20 s after the last attempt: waits');
const wait = next.timeouts.at(-1);
assert.ok(wait && wait.ms >= 39000 && wait.ms <= 40000, 'waits the remaining 40 s (' + (wait && wait.ms) + ')');
next.advance(wait.ms); wait.fn();
assert.equal(next.requests.length, 1, 'then tries');
console.log('PASS');
