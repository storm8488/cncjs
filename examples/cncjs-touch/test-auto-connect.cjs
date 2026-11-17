'use strict';
// F5: run the actual page owner with fake HTTP, Socket.IO and storage only.
const assert = require('assert').strict;
const { page } = require('./session-dom-fixture.cjs');
const KEY = 'cncjs-touch-auto-connect-v1';
function setup({ saved = { enabled: true, port: '/dev/ttyUSB0' }, language = 'fr', simulation = false, brokenStorage = false } = {}) {
  const p = page(language, simulation), requests = [], sockets = [], emitted = [], timers = new Map();
  const storage = new Map([['cnc', JSON.stringify({ state: { session: { token: 'test-token' } } })]]);
  if (saved !== null) storage.set(KEY, typeof saved === 'string' ? saved : JSON.stringify(saved));
  p.context.localStorage = { getItem(k) { if (brokenStorage) throw Error('storage'); return storage.get(k) || null; }, setItem(k, v) { if (brokenStorage) throw Error('storage'); storage.set(k, v); } };
  p.context.XMLHttpRequest = function() {
    this.open = (method, url) => { this.method = method; this.url = url; };
    this.setRequestHeader = (k, v) => { (this.headers ||= {})[k] = v; };
    this.send = () => requests.push(this); this.abort = () => { this.aborted = true; };
  };
  p.context.setTimeout = fn => { const id = timers.size + 1; timers.set(id, fn); return id; };
  p.context.clearTimeout = id => timers.delete(id);
  p.window.io = { connect(origin, options) {
    const handlers = {}, s = { options, on: (name, fn) => { handlers[name] = fn; },
      emit(name, ...args) { emitted.push([name, ...args.filter(a => typeof a !== 'function')]); this.last = args; },
      fire(name, ...args) { if (handlers[name]) handlers[name](...args); }, disconnect() { this.disconnected = true; } };
    sockets.push(s); return s;
  } };
  p.run('cnc-state.js');
  p.window.cncState.set({ apiBase: '/custom/api' });
  p.run('connect-cnc.js');
  return Object.assign(p, { requests, sockets, emitted, storage, timers,
    set: patch => p.window.cncState.set(patch),
    answer(data, status = 200) { const x = requests.at(-1); assert(x, 'locality request'); x.status = status; x.responseText = JSON.stringify(data); x.onload(); },
    list(ports = [{ port: '/dev/ttyUSB0', inuse: false }]) { const s = sockets.at(-1); assert(s, 'automatic socket'); s.fire('connect'); s.fire('serialport:list', ports); return s; },
    opens: () => emitted.filter(e => e[0] === 'open'),
    tick() { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); }
  });
}
function ready(p) { p.set({ transportConnected: true }); }

// Authoritative D3 locality, not the URL: one authenticated GET with the configured prefix.
{
  const p = setup(); ready(p);
  assert.equal(p.requests.length, 1);
  assert.equal(p.requests[0].url, '/custom/api/touch-backlight');
  assert.equal(p.requests[0].headers.Authorization, 'Bearer test-token');
  assert.equal(p.sockets.length, 0, 'wait for locality');
  p.answer({ local: true, available: false }); // sysfs availability is unrelated to locality
  const s = p.list();
  assert.equal(s.options.reconnection, false);
  assert.equal(p.opens().length, 1);
  assert.equal(p.opens()[0][1], '/dev/ttyUSB0');
  assert.equal(p.opens()[0][2].touchAutoConnect, true, 'server rechecks automatic opening');
  s.last[2](null);
  assert(s.disconnected);
  p.set({ machine: { port: '/dev/ttyUSB0' } }); p.set({ machine: null });
  p.set({ transportConnected: false }); ready(p); p.tick();
  assert.equal(p.sockets.length, 1, 'no retry after disconnect or another stream packet');
  assert(p.emitted.every(e => ['list', 'open'].includes(e[0])), 'no machine commands');
}
for (const data of [{ local: false }, {}, { local: 'true' }]) {
  const p = setup(); ready(p); p.answer(data); p.tick(); ready(p);
  assert.equal(p.sockets.length, 0, 'remote or unknown locality does nothing');
}
for (const failure of ['onerror', 'ontimeout']) {
  const p = setup(); ready(p); p.requests[0][failure]();
  p.set({ transportConnected: false }); ready(p); p.tick();
  assert.equal(p.requests.length, 1); assert.equal(p.sockets.length, 0);
}
{
  const p = setup(); ready(p); p.answer({ local: true }, 500);
  assert.equal(p.sockets.length, 0, 'HTTP failure is not local proof');
}
// No guess from commissioned ports, a single USB device, corrupt data or unavailable storage.
for (const saved of [null, {}, { enabled: false, port: '/dev/ttyUSB0' }, '{broken', { enabled: true, port: 4 }]) {
  const p = setup({ saved }); ready(p); if (p.requests.length) p.answer({ local: true });
  assert.equal(p.sockets.length, 0);
}
{
  const p = setup({ brokenStorage: true }); ready(p); assert.equal(p.sockets.length, 0);
}
// An already reported controller consumes the startup opportunity, including later loss.
{
  const p = setup(); p.set({ transportConnected: true, machine: { port: 'COM3' } });
  if (p.requests.length) p.answer({ local: true });
  p.set({ machine: null }); p.tick(); assert.equal(p.sockets.length, 0);
}
// Check again after HTTP and list; never substitute another available port.
for (const ports of [[], [{ port: 'COM9' }], [{ port: '/dev/ttyUSB0' }, { port: 'COM9', inuse: true }]]) {
  const p = setup(); ready(p); p.answer({ local: true }); const s = p.list(ports);
  assert.equal(p.opens().length, 0); assert(s.disconnected);
  p.set({ transportConnected: false }); ready(p); p.tick(); assert.equal(p.sockets.length, 1);
}
{
  const p = setup(); ready(p); p.set({ machine: { port: 'COM9' } }); p.answer({ local: true });
  assert.equal(p.sockets.length, 0, 'controller appeared during locality read');
}
{
  const p = setup(); ready(p); p.answer({ local: true });
  p.set({ machine: { port: 'COM9' } }); const s = p.list();
  assert.equal(p.opens().length, 0); assert(s.disconnected);
}
// Failure, timeout, duplicate list replies and page teardown cannot schedule another opening.
for (const failure of ['refused', 'timeout', 'socket']) {
  const p = setup(); ready(p); p.answer({ local: true }); const s = p.sockets[0];
  if (failure === 'socket') s.fire('connect_error');
  else { p.list(); if (failure === 'refused') s.last[2]({ message: 'busy' }); else p.tick(); }
  assert(p.document.querySelector('#ks-connect .ks-refus'), 'automatic failure has the shared refusal and manual remedy');
  s.fire('serialport:list', [{ port: '/dev/ttyUSB0' }]);
  p.set({ transportConnected: false }); ready(p); p.tick();
  assert.equal(p.sockets.length, 1); assert(p.opens().length <= 1); assert(s.disconnected);
}
{
  const p = setup(); ready(p); p.answer({ local: true }); const s = p.list();
  s.fire('serialport:list', [{ port: '/dev/ttyUSB0' }]); assert.equal(p.opens().length, 1);
}
{
  const p = setup(); ready(p); p.emit('pagehide'); p.answer({ local: true });
  assert.equal(p.sockets.length, 0);
}
{
  const p = setup(); ready(p); p.set({ transportConnected: false }); ready(p);
  p.answer({ local: true }); assert.equal(p.sockets.length, 0, 'interrupted startup read never replays');
}
// A failed manual opening cannot replace the last successful target.
for (const success of [false, true]) {
  const p = setup(); ready(p); p.answer({ local: false });
  p.window.cncConnectCnc.search(); p.list([{ port: 'COM7' }]);
  [...p.document.querySelectorAll('#ks-connect button')].find(b => b.textContent === 'Ouvrir').click();
  const s = p.list([{ port: 'COM7' }]);
  assert.equal(JSON.parse(p.storage.get(KEY)).port, '/dev/ttyUSB0', 'not saved before acknowledgement');
  s.last[2](success ? null : { message: 'busy' });
  assert.equal(JSON.parse(p.storage.get(KEY)).port, success ? 'COM7' : '/dev/ttyUSB0');
  const reload = setup({ saved: JSON.parse(p.storage.get(KEY)) }); ready(reload); reload.answer({ local: true });
  reload.list([{ port: success ? 'COM7' : '/dev/ttyUSB0' }]);
  assert.equal(reload.opens()[0][1], success ? 'COM7' : '/dev/ttyUSB0', 'next page uses only the acknowledged port');
}
for (const phase of ['http', 'socket']) {
  const p = setup(); ready(p);
  if (phase === 'socket') p.answer({ local: true });
  p.node('auto-connect-toggle').click();
  if (phase === 'http') p.answer({ local: true });
  else p.list();
  assert.equal(p.opens().length, 0, 'switching off cancels pending automatic work');
}
// Settings use the existing toggle and tablet scope; switching on applies to the next load.
for (const language of ['fr', 'en', 'es']) {
  const p = setup({ language });
  const toggle = p.node('auto-connect-toggle'); assert(toggle, 'settings toggle');
  assert(toggle.closest('#screen-settings')); assert(toggle.classList.contains('ks-display-toggle'));
  assert.equal(toggle.getAttribute('aria-pressed'), 'true');
  toggle.click(); assert.equal(toggle.getAttribute('aria-pressed'), 'false');
  assert.equal(JSON.parse(p.storage.get(KEY)).enabled, false);
  ready(p); if (p.requests.length) p.answer({ local: true });
  toggle.click(); assert.equal(p.sockets.length, 0, 'switching on does not open now');
  const text = p.node('ks-auto-connect').textContent;
  if (language !== 'fr') assert(!text.includes('Reconnexion automatique'), 'translated settings');
}
{
  const p = setup({ simulation: true }); ready(p);
  assert.equal(p.requests.length, 0); assert.equal(p.sockets.length, 0);
}
console.log('PASS F5: local startup only, last successful port only, one attempt, races/failures, settings FR/EN/ES and no machine command.');
