'use strict';
// Merge of the lots (feat/fonctions-5): the automatic reconnection (F5) and the automatic
// reload (F10) in the same page load, with the real connect-cnc.js and tablet-actions.js.
// Virtual time, local XHR and Socket.IO stand-ins only: nothing leaves this process and no
// controller command exists here.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDOM } = require('./dom-fixture.cjs');

const PORT = '/dev/ttyUSB0';
const LOADED = 'aaaaaaaa', INSTALLED = 'bbbbbbbb';
const REST = { port: PORT, fresh: true, workflow: 'idle', activeState: 'Idle', spindleSpeed: 0 };

function fixture({ machine = null } = {}) {
  const dom = createDOM(['home']), { document, element } = dom;
  document.documentElement = element('html');
  let now = 1000, id = 0, state = { apiBase: '/api', transportConnected: false, machine };
  // What GET /api/touch-job answers: by default the machine the stream reports.
  let server = null;
  const timers = new Map(), requests = [], handlers = {}, navigations = [], sockets = [], emitted = [], listeners = [];
  const emit = (name) => (handlers[name] || []).forEach((fn) => fn({ detail: state }));
  const store = {
    get: () => state,
    set(patch) { state = { ...state, ...patch }; listeners.slice().forEach((fn) => fn(state)); emit('cnc-job-status'); },
    subscribe(fn) { listeners.push(fn); }
  };
  const storage = new Map([
    ['cnc', JSON.stringify({ state: { session: { token: 'local-token' } } })],
    ['cncjs-touch-auto-connect-v1', JSON.stringify({ enabled: true, port: PORT })]
  ]);
  const window = {
    performance: { now: () => now }, cncState: store,
    location: { href: 'http://127.0.0.1:8000/touch/', replace: (url) => navigations.push(url) },
    addEventListener: (name, fn) => { (handlers[name] || (handlers[name] = [])).push(fn); },
    io: { connect(origin, options) {
      const on = {}, s = { options, on: (name, fn) => { on[name] = fn; }, fire: (name, ...args) => on[name] && on[name](...args),
        emit(name, ...args) { emitted.push([name, ...args.filter((a) => typeof a !== 'function')]); s.last = args; },
        disconnect() { s.disconnected = true; } };
      sockets.push(s); return s;
    } }
  };
  const context = {
    window, document, URL, Date: { now: () => now }, location: { origin: 'http://127.0.0.1:8000' },
    localStorage: { getItem: (k) => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) },
    setTimeout: (fn, delay) => { timers.set(++id, { fn, at: now + (delay || 0) }); return id; },
    clearTimeout: (key) => timers.delete(key),
    XMLHttpRequest: function XHR() {
      this.open = (method, url) => Object.assign(this, { method, url });
      this.setRequestHeader = () => {};
      this.send = () => requests.push(this); this.abort = () => { this.aborted = true; };
    }
  };
  const run = (file) => vm.runInNewContext(fs.readFileSync(__dirname + '/touch/' + file, 'utf8'), context, { filename: file });
  run('i18n-messages.js'); run('i18n.js'); run('connect-cnc.js'); run('tablet-actions.js');
  const pending = (prefix) => requests.filter((r) => !r.answered && !r.aborted && r.url.indexOf(prefix) === 0);
  const reply = (r, data, code = 200) => { r.answered = true; r.status = code; r.responseText = JSON.stringify(data); r.onload(); };
  // The server side: the installed version, and the machines as the stream reports them.
  const serve = () => {
    pending('VERSION.json?').forEach((r) => reply(r, { commit: /installed=/.test(r.url) ? INSTALLED : LOADED }));
    const controllers = server || (state.machine ? [state.machine] : []);
    pending('/api/touch-job').forEach((r) => reply(r, { controllers }));
  };
  const advance = (ms) => {
    const end = now + ms;
    for (let step = 0; step < 100000; step++) {
      serve();
      const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = Math.max(now, next[1].at); timers.delete(next[0]); next[1].fn();
    }
    now = end; serve();
  };
  const banner = () => document.body.children.find((n) => n.className === 'ks-auto-reload');
  const opens = () => emitted.filter((e) => e[0] === 'open');
  serve();
  return { setServer: (list) => { server = list; }, store, requests, pending, reply, sockets, emitted, opens, navigations, advance, banner, emit };
}

// 1. An installation is found while the kiosk reconnects its port by itself: no reload until
// the board has restarted and is at rest; one opening in all.
{
  const f = fixture();
  f.store.set({ transportConnected: true });
  // F5 asks for its locality; F10 sees the new installation at the same time.
  const locality = f.pending('/api/touch-backlight');
  assert.equal(locality.length, 1, 'one locality request');
  f.reply(locality[0], { local: true });
  const s = f.sockets.at(-1);
  assert(s, 'automatic opening started');
  s.fire('connect'); s.fire('serialport:list', [{ port: PORT, inuse: false }]);
  assert.equal(f.opens().length, 1);
  // The opening is not answered yet (F5 gives it 10 s): F10 holds back.
  f.advance(9000);
  assert.equal(f.navigations.length, 0, 'no reload while the port is being opened');
  assert(!f.banner() || f.banner().hidden, 'no countdown while the port is being opened');
  // Opened: the server lists the controller, without a report yet while the board restarts.
  f.setServer([{ port: PORT, fresh: false, workflow: 'idle', activeState: '' }]);
  s.last[2](null);
  f.advance(45000);
  assert.equal(f.navigations.length, 0, 'no reload while waiting for the first report');
  f.setServer(null);
  f.store.set({ machine: { ...REST, activeState: 'Alarm' } });
  f.advance(45000);
  assert.equal(f.navigations.length, 0, 'no reload while the restarted board is in alarm');
  // At rest: the announced ten seconds, then one reload.
  f.store.set({ machine: { ...REST } });
  f.advance(45000);
  assert.equal(f.navigations.length, 1, 'one reload once everything is at rest');
  assert.equal(f.opens().length, 1, 'still one opening');
  assert(f.emitted.every((e) => e[0] === 'list' || e[0] === 'open'), 'no machine command');
}

// 2. The reloaded page: the port is already reported open, F5 does nothing (no restart of the
// board, no locality request), and the same version does not reload again.
{
  const f = fixture({ machine: { ...REST } });
  f.store.set({ transportConnected: true });
  assert.equal(f.pending('/api/touch-backlight').length, 0, 'no locality request when a machine is reported');
  f.advance(120000);
  assert.equal(f.sockets.length, 0, 'no opening after the reload');
  assert.equal(f.opens().length, 0);
}

// 3. A reload decided before the locality answer: the page leaves, the late answer opens nothing.
{
  const f = fixture();
  f.store.set({ transportConnected: true });
  const locality = f.pending('/api/touch-backlight')[0];
  assert(locality, 'locality request');
  f.advance(45000);
  // Nothing at all is reported (CNC disconnected, confirmed by the server): F10 may reload.
  assert.equal(f.navigations.length, 1, 'a disconnected CNC confirmed by the server allows the reload');
  f.emit('pagehide');
  if (!locality.aborted) f.reply(locality, { local: true });
  assert.equal(f.sockets.length, 0, 'no opening from a page that left');
}

console.log('PASS F5 x F10: one opening, no reload while it runs or the board restarts, nothing reopened after the reload.');
