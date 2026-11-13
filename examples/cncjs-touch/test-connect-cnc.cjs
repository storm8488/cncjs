'use strict';
// connect-cnc.js: the « Connecter la CNC » bar of the main screen. Shown only while the server is
// reachable and no controller is followed; emits only 'list' and 'open' (Grbl, 115200), after a
// confirmation; never reopens a port already in use; disappears once a machine is reported.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const source = fs.readFileSync(__dirname + '/touch/connect-cnc.js', 'utf8');

function node(tag) {
  const n = { tagName: tag.toUpperCase(), children: [], hidden: false, className: '', id: '', textContent: '', attrs: {}, handlers: {},
    appendChild(c) { this.children.push(c); c.parent = this; return c; },
    insertBefore(c, ref) { const i = this.children.indexOf(ref); this.children.splice(i < 0 ? 0 : i, 0, c); c.parent = this; return c; },
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k]; },
    addEventListener(type, fn) { this.handlers[type] = fn; } };
  Object.defineProperty(n, 'innerHTML', { set(v) { assert.equal(v, ''); n.children = []; } });
  return n;
}
function setup({ simulation = false, commissioned = ['/dev/ttyUSB0'], io = true } = {}) {
  const menu = node('section'); menu.appendChild(node('button')); // the resume bar
  const body = node('body'); body.attrs['data-simulation'] = simulation ? 'true' : 'false';
  const subs = []; let state = { machine: null, transportConnected: false };
  const store = { get: () => state, subscribe(fn) { subs.push(fn); return () => {}; } };
  const emitted = [], sockets = [], timers = new Map(); let nextTimer = 0;
  const storage = { cnc: JSON.stringify({ state: { session: { token: 'jeton' } } }),
    'cncjs-touch-commissioning-v1': JSON.stringify({ machines: Object.fromEntries(commissioned.map((p) => [p, {}])) }) };
  const fakeIo = { connect(url, opts) {
    const s = { opts, on: {}, connected: false, disconnected: false,
      emit(name, ...args) { emitted.push([name, ...args.filter((a) => typeof a !== 'function')]); s.last = args; },
      disconnect() { s.disconnected = true; } };
    s.on = new Proxy({}, {}); const handlers = {}; s.on = (n, f) => { handlers[n] = f; }; s.fire = (n, ...a) => handlers[n] && handlers[n](...a);
    sockets.push(s); return s; } };
  const window = { cncI18n: { t: (x) => x }, cncState: store, io: io ? fakeIo : undefined, addEventListener() {} };
  const document = { body, getElementById: (id) => (id === 'screen-menu' ? menu : null), createElement: node };
  vm.runInNewContext(source, { window, document, location: { origin: 'http://localhost:8000' }, JSON, Array, Object, encodeURIComponent,
    localStorage: { getItem: (k) => (k in storage ? storage[k] : null) },
    setTimeout(fn) { const id = ++nextTimer; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); } });
  const bar = menu.children[0];
  return {
    menu, bar, emitted, sockets, timers, api: window.cncConnectCnc,
    set(next) { state = Object.assign({}, state, next); subs.forEach((f) => f(state)); },
    title: () => bar.children[0].children[0].textContent,
    hint: () => bar.children[0].children[1].textContent,
    buttons: () => bar.children[1].children.map((b) => b.textContent),
    press(label) { const b = bar.children[1].children.find((x) => x.textContent === label); assert(b, 'button ' + label + ' in ' + this.buttons()); b.handlers.click(); },
    fireTimers() { const fns = [...timers.values()]; timers.clear(); fns.forEach((f) => f()); },
  };
}

// Simulation page: nothing is added.
{ const t = setup({ simulation: true }); assert.equal(t.menu.children.length, 1); }

// Visibility: hidden until the server answers, shown with no machine, gone with one.
{
  const t = setup();
  assert.equal(t.bar.id, 'ks-connect'); assert.equal(t.bar.hidden, true, 'hidden before the first server answer');
  t.set({ transportConnected: true }); assert.equal(t.bar.hidden, false); assert.deepEqual(t.buttons(), ['Connecter la CNC']);
  t.set({ machine: { port: '/dev/ttyUSB0', fresh: true } }); assert.equal(t.bar.hidden, true, 'a reported machine removes it');
  t.set({ machine: null }); assert.equal(t.bar.hidden, false);
  t.set({ transportConnected: false }); assert.equal(t.bar.hidden, true, 'server unreachable: nothing to offer');
  assert.equal(t.emitted.length, 0, 'showing the bar sends nothing');
}

// Commissioned port: list, confirmation, then open with Grbl 115200; the socket is closed.
{
  const t = setup(); t.set({ transportConnected: true });
  t.press('Connecter la CNC');
  let s = t.sockets[0]; assert.equal(s.opts.reconnection, false); assert.equal(s.opts.query, 'token=jeton');
  s.fire('connect'); assert.deepEqual(t.emitted, [['list']]);
  s.fire('serialport:list', [{ port: '/dev/ttyS0', inuse: false }, { port: '/dev/ttyUSB0', inuse: false }]);
  assert(s.disconnected, 'the listing socket is closed before the confirmation');
  assert.equal(t.title(), 'Ouvrir /dev/ttyUSB0 ?'); assert.match(t.hint(), /Alarme/); assert.deepEqual(t.buttons(), ['Ouvrir', 'Annuler']);
  assert.equal(t.emitted.filter((e) => e[0] === 'open').length, 0, 'nothing is opened before the confirmation');
  t.press('Ouvrir'); s = t.sockets[1]; s.fire('connect');
  s.fire('serialport:list', [{ port: '/dev/ttyUSB0', inuse: false }]);
  assert.deepEqual(t.emitted, [['list'], ['list'], ['open', '/dev/ttyUSB0', { controllerType: 'Grbl', baudrate: 115200, rtscts: false }]]);
  s.last[2](null); assert(s.disconnected); assert.match(t.title(), /redémarre/);
  t.set({ machine: { port: '/dev/ttyUSB0', fresh: true } }); assert.equal(t.bar.hidden, true); assert.equal(t.timers.size, 0);
  assert(t.emitted.every((e) => e[0] === 'list' || e[0] === 'open'), 'only list and open are emitted');
}

// Cancel: back to the button, nothing opened.
{
  const t = setup(); t.set({ transportConnected: true }); t.press('Connecter la CNC');
  t.sockets[0].fire('connect'); t.sockets[0].fire('serialport:list', [{ port: '/dev/ttyUSB0', inuse: false }]);
  t.press('Annuler'); assert.deepEqual(t.buttons(), ['Connecter la CNC']); assert(!t.emitted.some((e) => e[0] === 'open'));
}

// A port already in use is never reopened, at the listing or at the confirmation.
{
  const t = setup(); t.set({ transportConnected: true }); t.press('Connecter la CNC');
  t.sockets[0].fire('connect'); t.sockets[0].fire('serialport:list', [{ port: '/dev/ttyUSB0', inuse: true }]);
  assert.match(t.hint(), /Fichiers/); assert(!t.emitted.some((e) => e[0] === 'open'));
  t.press('Connecter la CNC'); t.sockets[1].fire('connect'); t.sockets[1].fire('serialport:list', [{ port: '/dev/ttyUSB0', inuse: false }]);
  t.press('Ouvrir'); t.sockets[2].fire('connect'); t.sockets[2].fire('serialport:list', [{ port: '/dev/ttyUSB0', inuse: true }]);
  assert(!t.emitted.some((e) => e[0] === 'open'), 'opened meanwhile from the PC: not reopened'); assert(t.sockets[2].disconnected);
}

// Port gone between the confirmation and the opening; no port at all; several unknown ports.
{
  const t = setup(); t.set({ transportConnected: true }); t.press('Connecter la CNC');
  t.sockets[0].fire('connect'); t.sockets[0].fire('serialport:list', [{ port: '/dev/ttyUSB0', inuse: false }]);
  t.press('Ouvrir'); t.sockets[1].fire('connect'); t.sockets[1].fire('serialport:list', []);
  assert.match(t.hint(), /Port disparu/); assert(!t.emitted.some((e) => e[0] === 'open'));
  t.press('Connecter la CNC'); t.sockets[2].fire('connect'); t.sockets[2].fire('serialport:list', []);
  assert.match(t.hint(), /Aucun port USB/);
}
{
  const t = setup({ commissioned: [] }); t.set({ transportConnected: true }); t.press('Connecter la CNC');
  t.sockets[0].fire('connect'); t.sockets[0].fire('serialport:list', [{ port: '/dev/ttyUSB1', manufacturer: '1a86', inuse: false }, { port: '/dev/ttyACM0', inuse: false }]);
  assert.deepEqual(t.buttons(), ['/dev/ttyUSB1 · 1a86', '/dev/ttyACM0', 'Annuler']);
  t.press('/dev/ttyUSB1 · 1a86'); assert.equal(t.title(), 'Ouvrir /dev/ttyUSB1 ?');
}
{
  // The commissioned CNC is absent and another serial device is present (a built-in ttyS port, or the
  // board back under another name): it is never offered directly, the operator must pick it.
  const t = setup(); t.set({ transportConnected: true }); t.press('Connecter la CNC');
  t.sockets[0].fire('connect'); t.sockets[0].fire('serialport:list', [{ port: '/dev/ttyS0', inuse: false }]);
  assert.equal(t.title(), 'Choisir le port de la CNC'); assert.match(t.hint(), /absent/); assert.deepEqual(t.buttons(), ['/dev/ttyS0', 'Annuler']);
  assert(!t.emitted.some((e) => e[0] === 'open'));
  t.press('Annuler'); assert.deepEqual(t.buttons(), ['Connecter la CNC']);
}

// Refusal, server unreachable and timeout end the socket and give the button back.
{
  const t = setup(); t.set({ transportConnected: true }); t.press('Connecter la CNC');
  t.sockets[0].fire('connect'); t.sockets[0].fire('serialport:list', [{ port: '/dev/ttyUSB0', inuse: false }]);
  t.press('Ouvrir'); const s = t.sockets[1]; s.fire('connect'); s.fire('serialport:list', [{ port: '/dev/ttyUSB0', inuse: false }]);
  s.last[2](new Error('Error: Resource busy')); assert.match(t.hint(), /refusée.*busy/); assert.deepEqual(t.buttons(), ['Connecter la CNC']);
  t.press('Connecter la CNC'); t.sockets[2].fire('connect_error'); assert(t.sockets[2].disconnected); assert.match(t.hint(), /injoignable/);
  t.press('Connecter la CNC'); t.fireTimers(); assert(t.sockets[3].disconnected); assert.match(t.hint(), /ne répond pas/);
  assert.equal(t.api.state().open, false);
}

// No Socket.IO client on the page: a message, no crash.
{ const t = setup({ io: false }); t.set({ transportConnected: true }); t.press('Connecter la CNC'); assert.match(t.hint(), /indisponible/); }

// A machine reported while a choice is pending drops it and closes the socket.
{
  const t = setup(); t.set({ transportConnected: true }); t.press('Connecter la CNC');
  t.set({ machine: { port: '/dev/ttyUSB0' } }); assert(t.sockets[0].disconnected); assert.equal(t.bar.hidden, true);
  t.set({ machine: null }); assert.deepEqual(t.buttons(), ['Connecter la CNC']);
}

// Loaded on the real page after touch-shell.js (which builds #screen-menu), with the lot's cache version.
{
  const html = fs.readFileSync(__dirname + '/touch/index.html', 'utf8');
  const shell = html.indexOf('touch-shell.js?v='), mine = html.indexOf('connect-cnc.js?v=v2r');
  assert(shell > 0 && mine > shell, 'connect-cnc.js after touch-shell.js');
  assert(html.indexOf('/socket.io/socket.io.js') < mine);
}
console.log('PASS connect CNC: shown only with the server up and no machine, list then confirmed Grbl 115200 open, port in use never reopened, port gone / none / several, another device never offered directly, refusal and timeout, cache v2r.');
