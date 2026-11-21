'use strict';
// F10: virtual time and local XHR only; no controller command is ever sent.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDOM } = require('./dom-fixture.cjs');
function fixture(language = 'fr') {
  const dom = createDOM(['home']), { document, node, element } = dom;
  document.documentElement = element('html');
  let now = 1000, id = 0;
  const timers = new Map(), requests = [], handlers = {}, navigations = [];
  const quiet = { fresh: true, workflow: 'idle', activeState: 'Idle', spindleSpeed: 0 };
  const state = { apiBase: '/prefix/api', machine: { ...quiet }, transportConnected: true };
  const dialogs = [];
  document.querySelectorAll = () => dialogs;
  const window = { performance: { now: () => now }, cncState: { get: () => state },
    cncJobControls: { state: () => state },
    location: { href: 'http://localhost/prefix/touch/?keep=1#home', replace: url => navigations.push(url) },
    addEventListener: (name, fn) => { (handlers[name] || (handlers[name] = [])).push(fn); } };
  const context = { window, document, URL, Date: { now: () => now },
    localStorage: { getItem: () => JSON.stringify({ state: { session: { token: 'local-token' } } }) },
    setTimeout: (fn, delay) => { timers.set(++id, { fn, at: now + delay }); return id; },
    clearTimeout: key => timers.delete(key),
    XMLHttpRequest: function () {
      this.headers = {}; this.open = (method, url) => Object.assign(this, { method, url });
      this.setRequestHeader = (k, v) => { this.headers[k] = v; };
      this.send = () => requests.push(this); this.abort = () => { this.aborted = true; };
    } };
  const run = file => vm.runInNewContext(fs.readFileSync(__dirname + '/touch/' + file, 'utf8'), context);
  // Exercise the real catalogue and translator in all three languages.
  context.localStorage.getItem = key => key === 'cncjs-touch-language-v1' ? language : JSON.stringify({ state: { session: { token: 'local-token' } } });
  run('i18n-messages.js'); run('i18n.js'); run('tablet-actions.js');
  function emit(name) { (handlers[name] || []).forEach(fn => fn({ detail: state })); }
  function advance(ms) {
    const end = now + ms;
    for (let step = 0; step < 10000; step++) {
      const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at; timers.delete(next[0]); next[1].fn();
    }
    now = end;
  }
  function answer(prefix, data, code = 200) {
    const r = requests.filter(r => !r.answered && r.url.startsWith(prefix)).at(-1);
    assert(r, 'pending ' + prefix); r.answered = true; r.status = code; r.responseText = JSON.stringify(data); r.onload(); return r;
  }
  const version = commit => answer('VERSION.json?', { commit });
  const rest = controllers => answer('/prefix/api/touch-job', { controllers: controllers || [{ ...quiet }] });
  const banner = () => document.body.children.find(n => n.className === 'ks-auto-reload');
  function install() { version('aaaaaaaa'); advance(30000); version('bbbbbbbb'); rest(); }
  return { ...dom, window, state, quiet, dialogs, emit, advance, answer, version, rest, banner, requests, navigations, install, element, node };
}
{
  const f = fixture(); f.install();
  assert(f.banner() && !f.banner().hidden, 'an installation is announced outside Settings');
  assert.match(f.banner().children[0].textContent, /10 s/);
  f.advance(9000); assert.equal(f.navigations.length, 0); assert.match(f.banner().children[0].textContent, /1 s/);
  f.advance(1000); f.rest();
  assert.equal(f.navigations.length, 1);
  const url = new URL(f.navigations[0]);
  assert.equal(url.searchParams.get('keep'), '1'); assert.equal(url.hash, '#home');
  assert(url.searchParams.has('touchReload'), 'navigation bypasses the cached HTML');
  assert(f.requests.every(r => r.method === 'GET' && !/^https?:/.test(r.url)), 'no remote request or machine action');
}
for (const patch of [{ workflow: 'running' }, { workflow: 'paused' }, { activeState: 'Home' }, { activeState: 'Jog' },
  { activeState: 'Alarm' }, { fresh: false }, { spindleSpeed: 1000 }, { canStop: true }, { loading: true }, { homing: true },
  { probing: true }, { probeBusy: true }, { motion: { jog: true } }, { motion: { cancelling: true } },
  { motion: { frame: {} } }, { motion: { cancelUnconfirmed: true } }, { workOffset: { state: 'checking' } },
  { refusals: { readSettings: { code: 'ETOUCH_SETTINGS_READING' } } }]) {
  const f = fixture(); f.install(); f.advance(9000); f.state.machine = { ...f.quiet, ...patch }; f.emit('cnc-job-status');
  f.advance(10000); assert.equal(f.navigations.length, 0, JSON.stringify(patch)); assert(f.banner().hidden);
}
for (const patch of [{ busy: true }, { halt: {} }, { systemCommand: { title: 'Update' } }, { transportConnected: false }]) {
  const f = fixture(); f.install(); Object.assign(f.state, patch); f.emit('cnc-job-status'); f.advance(10000);
  assert.equal(f.navigations.length, 0); assert(f.banner().hidden);
}
for (const [owner, activity] of [['cncConnectCnc', { busy: true }], ['cncConnectCnc', { open: true }],
  ['cncSystemUpdates', { busy: true }], ['cncSystemUpdates', { armed: true }], ['cncSystemUpdates', { running: true }],
  ['cncWifiSettings', { busy: true }], ['cncWifiSettings', { formOpen: true }]]) {
  const f = fixture(); f.install(); f.window[owner] = { state: () => activity }; f.advance(10000);
  assert.equal(f.navigations.length, 0, owner); assert(f.banner().hidden);
}
for (const obstacle of ['dialog', 'input', 'contenteditable', 'hidden', 'interaction']) {
  const f = fixture(); f.install(); f.advance(9000);
  if (obstacle === 'dialog') f.dialogs.push({ hidden: false, getClientRects: () => [1] });
  if (obstacle === 'input') f.document.activeElement = f.element('input');
  if (obstacle === 'contenteditable') { f.document.activeElement = f.element(); f.document.activeElement.isContentEditable = true; }
  if (obstacle === 'hidden') f.document.hidden = true;
  if (obstacle === 'interaction') f.document.handlers.pointerdown();
  f.advance(1000); assert.equal(f.navigations.length, 0, obstacle);
  assert(!f.requests.some(r => !r.answered && /touch-job$/.test(r.url)), 'no final request while ' + obstacle);
}
{
  const f = fixture(); f.install();
  f.document.handlers.pointerdown({ target: f.banner().children[1] });
  assert(!f.banner().hidden, 'Later remains clickable after the capturing pointer listener');
  f.banner().children[1].click(); f.advance(30000); f.version('bbbbbbbb');
  assert(f.banner().hidden, 'Later survives repeated detection of the same installation');
  f.advance(570000); f.version('bbbbbbbb'); f.rest(); assert(!f.banner().hidden, 'Later expires after ten minutes');
}
for (const cause of ['server busy', 'server error', 'late activity', 'late dialog', 'slow response', 'pagehide']) {
  const f = fixture(); f.install(); f.advance(10000);
  if (cause === 'late activity') { f.state.busy = true; f.emit('cnc-job-status'); }
  if (cause === 'late dialog') f.dialogs.push({ hidden: false, getClientRects: () => [1] });
  if (cause === 'slow response') f.advance(3000);
  if (cause === 'pagehide') f.emit('pagehide');
  if (cause === 'server busy') f.rest([{ ...f.quiet }, { ...f.quiet, activeState: 'Run' }]);
  else if (cause === 'server error') f.answer('/prefix/api/touch-job', {}, 500);
  else f.rest();
  assert.equal(f.navigations.length, 0, cause);
}
{
  const f = fixture(); f.version('aaaaaaaa'); f.state.transportConnected = false; f.state.machine = null; f.emit('cnc-job-status');
  f.advance(30000); f.answer('VERSION.json?', {}, 503);
  assert(!f.banner() || f.banner().hidden);
  f.state.transportConnected = true; f.emit('cnc-job-status'); f.version('bbbbbbbb'); f.rest([]);
  assert(!f.banner().hidden, 'server recovery rechecks the installation without Settings or a reload');
  f.advance(10000); f.rest([]); assert.equal(f.navigations.length, 1, 'disconnected CNC confirmed by the returned server');
}
for (const lang of ['fr', 'en', 'es']) {
  const f = fixture(lang); f.install();
  assert.equal(f.banner().children[1].textContent, { fr: 'Plus tard', en: 'Later', es: 'Más tarde' }[lang]);
  assert.match(f.banner().children[0].textContent, { fr: /Nouvelle version/, en: /New version/, es: /Nueva versión/ }[lang]);
}
for (const controllers of [[{ workflow: 'running' }], [{ ...fixture().quiet, spindleSpeed: 1000 }]]) {
  const f = fixture(); f.version('aaaaaaaa'); f.advance(30000); f.version('bbbbbbbb'); f.rest(controllers);
  assert(!f.banner() || f.banner().hidden, 'all controllers must be at rest before announcing a countdown');
}
{
  const f = fixture(); f.version('aaaaaaaa'); f.advance(30000); f.version('aaaaaaaa');
  assert(!f.banner() || f.banner().hidden, 'same version never reloads');
  const { settingsOffTabRequests } = require('./browser-run.cjs');
  assert.deepEqual(settingsOffTabRequests([{ method: 'GET', url: 'VERSION.json?installed=123' }]), []);
  for (const patch of [{ method: 'POST' }, { url: 'VERSION.json?installed=bad' }, { url: '/api/commands' }]) {
    assert.equal(settingsOffTabRequests([{ method: 'GET', url: 'VERSION.json?installed=123', ...patch }]).length, 1);
  }
}
{
  const f = fixture(); f.answer('VERSION.json?', {}, 404); f.advance(30000); f.version('bbbbbbbb');
  assert(!f.banner() || f.banner().hidden, 'unknown loaded version is never invented after startup');
}
console.log('PASS F10: automatic reload, continuous rest, Later, all-controller checks, restart recovery and FR/EN/ES.');
