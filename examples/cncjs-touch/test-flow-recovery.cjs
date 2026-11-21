'use strict';
// FIGE: the kiosk survives a lost stream and a restarted server/session without reload or replay.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { load } = require('./job-controls-fixture.cjs');

(async () => {
  const f = load({ app: true });
  const signin = () => f.requests.filter(r => /\/signin$/.test(r.url));
  const streams = () => f.requests.filter(r => f.isStream(r.url));
  const health = () => f.requests.filter(r => /\/custom\/health$/.test(r.url));
  const reads = () => f.requests.filter(r => r.method === 'GET' && /\/touch-job$/.test(r.url));
  f.answer(signin()[0], { enabled: false, token: 'offline-fixture' });
  const oldCoordinates = { mpos: { x: 0, y: 0, z: 0 }, wpos: { x: 0, y: -72.941, z: 122 } };
  const old = await f.connect(f.machine({ coordinates: oldCoordinates }));
  let sequence = 10;
  const snapshot = () => ({ version: 1, epoch: 'server-one', sequence: ++sequence, sentAt: Date.now(), controllers: [f.machine({ coordinates: oldCoordinates, canHome: true, canZeroZ: true, canBlockProbe: true, canReadSettings: true })] });
  f.answer(reads()[0], snapshot()); await f.flush();
  assert.equal(f.lastStatus().machine.coordinates.wpos.y, -72.941);
  const initialPrepare = f.controls().start();
  f.answer(f.posts().at(-1), { nonce: 'must-expire', expiresIn: 15, name: 'Part' });
  await initialPrepare;
  assert.equal(f.el('job-dialog').hidden, false);
  // Network failure: the old callback and its confirmation must never survive the cut.
  const lateProgress = old.onprogress;
  old.onerror();
  assert(old.aborted);
  assert(f.el('job-dialog').hidden);
  f.answer(reads().at(-1), snapshot()); await f.flush();
  assert.equal(f.lastStatus().transportConnected, false);
  for (const flag of ['canStart', 'canLoad', 'canHome', 'canZeroZ', 'canBlockProbe', 'canReadSettings']) assert.equal(f.lastStatus().machine[flag], false, flag);
  assert.match(f.lastStatus().machine.zeroZReason, /reconnexion/);
  const refused = [], sourceHost = {};
  f.document.activeElement = { closest: () => sourceHost };
  f.window.cncRefus = { montrer: (host, e) => refused.push({ host, e }) };
  const postsBefore = f.posts().length;
  const result = await f.controls().prepareCommand('home');
  assert.equal(result.opened, false);
  assert.equal(result.error.code, 'CNC_TOUCH_STREAM_LOST');
  assert.equal(refused.at(-1).host, sourceHost, 'the refusal stays in the source sheet');
  assert.match(refused.at(-1).e.message, /reconnexion/);
  const zero = await f.controls().origin({ axes: ['Z'] }).catch(e => e);
  assert.equal(zero.code, 'CNC_TOUCH_STREAM_LOST');
  assert.equal(f.posts().length, postsBefore, 'no machine request without the stream');
  // Failed stream attempts back off 1, 2, 4, 8, 16, 30 seconds, then stay bounded.
  let elapsed = 0;
  for (const delay of [1000, 2000, 4000, 8000, 16000, 30000]) {
    const before = streams().length;
    f.advance(delay - 1); elapsed += delay - 1; f.tick(); await f.flush();
    assert.equal(streams().length, before, 'no early retry at ' + delay);
    f.advance(1); elapsed++; f.tick(); await f.flush();
    assert.equal(streams().length, before + 1, 'retry after ' + delay);
    streams().at(-1).onerror();
  }
  assert(elapsed >= 60000);
  // Server returns but refuses the pre-restart credential. Health requests a new session.
  f.advance(30000); f.tick(); await f.flush();
  const refusedStream = streams().at(-1);
  f.answer(refusedStream, {}, 403);
  f.answer(health().at(-1), {}, 403);
  assert.equal(signin().length, 2);
  const obsoleteHealth = health().at(-1).onload;
  f.answer(signin().at(-1), { enabled: false, token: 'after-restart' });
  assert.equal(health().at(-1).headers.Authorization, 'Bearer after-restart');
  f.answer(health().at(-1), { loaded: true, protocol: 1 });
  const recovered = streams().at(-1);
  const obsoleteRead = reads().find(r => !r.status);
  assert(obsoleteRead, 'a fallback read from the outage is still in flight');
  assert.equal(recovered.headers.Authorization, 'Bearer after-restart');
  assert.equal(f.lastStatus().transportConnected, false, 'HTTP 200 is not a stream packet');
  obsoleteHealth(); // stale callbacks cannot refuse the new credential
  old.responseText += JSON.stringify(Object.assign(snapshot(), { transportId: 'obsolete' })) + '\n';
  lateProgress();
  assert.equal(f.lastStatus().transportConnected, false);
  const newMachine = f.machine({ generation: 'new-board', coordinates: { mpos: { x: 0, y: 100, z: -106 }, wpos: { x: 0, y: 0, z: -1 } } });
  recovered.status = 200;
  recovered.responseText = JSON.stringify({ version: 1, epoch: 'server-two', sequence: 1, sentAt: Date.now(), transportId: 'after-restart', controllers: [newMachine] }) + '\n';
  recovered.onprogress();
  assert.equal(f.lastStatus().transportConnected, true);
  assert.equal(f.lastStatus().machine.coordinates.mpos.y, 100);
  lateProgress(); obsoleteHealth();
  f.answer(obsoleteRead, snapshot()); await f.flush();
  assert.equal(f.lastStatus().machine.coordinates.mpos.z, -106, 'old callbacks cannot restore old coordinates');
  assert.equal(f.lastStatus().machine.canStart, true);
  assert(f.el('job-dialog').hidden, 'old confirmation is never restored');
  assert.equal(f.reloads.length, 0);
  assert.equal(f.posts().filter(r => !/\/signin$/.test(r.url)).length, postsBefore - 1, 'no action replay');
  // Backoff resets only after a valid packet.
  const before = streams().length; recovered.onerror(); f.advance(1000); f.tick();
  assert.equal(streams().length, before + 1);
  f.controls().dispose(); f.window.cncConnection.dispose();

  // A kiosk first opened while the server is down must obtain its missing session later.
  const empty = load({ app: true, storage: new Map() });
  const signins = () => empty.requests.filter(r => /\/signin$/.test(r.url));
  signins()[0].onerror(); await empty.flush();
  empty.advance(59999); empty.tick(); await empty.flush(); assert.equal(signins().length, 1);
  empty.advance(1); empty.tick(); await empty.flush(); assert.equal(signins().length, 2);
  empty.answer(signins()[1], { enabled: false, token: 'first-session' });
  assert(empty.window.cncConnection);
  assert.equal(empty.reloads.length, 0);
  assert.equal(empty.requests.filter(r => /\/custom\/health$/.test(r.url)).at(-1).headers.Authorization, 'Bearer first-session');
  empty.controls().dispose(); empty.window.cncConnection.dispose();

  // The legacy socket also changes its handshake credential without reloading.
  const { document } = require('./dom-fixture.cjs').createDOM(['more']);
  const requests = [], listeners = {}, storage = new Map([['cnc', JSON.stringify({ state: { session: { token: 'old' } } })]]);
  let now = 1700000000000, reloads = 0, reconnects = 0, disconnects = 0;
  const socket = { io: { opts: { query: 'token=old' } }, handlers: {}, on(n, fn) { this.handlers[n] = fn; }, disconnect() { disconnects++; }, connect() { reconnects++; } };
  class XHR { open(m, url) { this.url = url; } setRequestHeader() {} send() { requests.push(this); } }
  const window = { addEventListener(n, fn) { (listeners[n] || (listeners[n] = [])).push(fn); }, removeEventListener() {}, dispatchEvent(e) { (listeners[e.type] || []).forEach(fn => fn(e)); } };
  const context = { window, document, XMLHttpRequest: XHR, io: { connect: () => socket }, localStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) }, sessionStorage: { getItem: () => null, setItem() {} }, location: { origin: 'http://127.0.0.1', reload: () => reloads++ }, setInterval: () => 1, setTimeout: () => 1, clearTimeout() {}, Date: class extends Date { static now() { return now; } }, CustomEvent: function(type) { this.type = type; } };
  vm.runInNewContext(fs.readFileSync(__dirname + '/touch/app.js', 'utf8'), context);
  requests[0].status = 200; requests[0].responseText = JSON.stringify({ token: 'old' }); requests[0].onload();
  socket.handlers.disconnect(); now += 60001;
  socket.handlers.connect_error({ message: 'jwt invalid signature' });
  requests[1].status = 200; requests[1].responseText = JSON.stringify({ token: 'socket-new' }); requests[1].onload();
  assert.equal(socket.io.opts.query, 'token=socket-new');
  assert.equal(socket.query, 'token=socket-new');
  assert.equal(reconnects, 1); assert.equal(disconnects, 1); assert.equal(reloads, 0);
  // Real DOM owners: even the planned rotation grace must grey arrows and every zero.
  for (const language of ['fr', 'en', 'es']) {
    const q = require('./session-dom-fixture.cjs').page(language);
    q.run('touch-shell.js'); q.run('real-motion.js');
    const state = require('./test-real-motion.cjs').machine({ homed: true, workOffset: { state: 'proven' }, machineProfile: { kind: 'cnc' } });
    const send = connected => q.emit('cnc-job-status', { machine: state, transportConnected: true, streamConnected: connected, pilot: { state: 'free' }, simulation: false });
    send(true); q.window.cncShell.go('jog'); q.node('zero-more-open').click();
    assert(!q.node('zero-at-machine-x').disabled);
    send(false);
    for (const button of q.document.querySelectorAll('#screen-jog .jog,#screen-jog [data-origin],.ks-zero-machine')) assert(button.disabled, language + ': ' + button.id + ' greyed before the next packet');
    assert(q.node('zero-more-cause').textContent.length > 10, 'reason is visible inside the sheet');
    send(true); assert(!q.node('zero-at-machine-x').disabled, 'fresh stream restores the server permission');
    q.emit('pagehide');
    const probe = require('./probe-page-fixture.cjs').fixture({ language, plate: { thickness: 5, search: 10 } });
    probe.send({}, { transportConnected: true, streamConnected: false });
    assert(probe.node('probe-start').disabled && probe.node('probe-plate-start').disabled, 'both probes wait for the next packet');
    assert(probe.node('probe-cause').textContent.includes(probe.window.cncRefus.lire({ code: 'CNC_TOUCH_STREAM_LOST' }).phrase), 'probe refusal names the missing stream');
    probe.send({}, { transportConnected: true, streamConnected: true });
    assert(!probe.node('probe-start').disabled && !probe.node('probe-plate-start').disabled);
    probe.emit('pagehide');
  }
  console.log('PASS: server/stream/socket loss, increasing backoff, session replacement in place, source refusal, new epoch/coordinates and no reload or command replay.');
})().catch(e => { console.error(e); process.exitCode = 1; });
