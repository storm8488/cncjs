'use strict';
// D3: two actual page scripts share the real backlight service on a fake sysfs.
// Every request is intercepted; no browser, controller or network is opened.
const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');
const vm = require('vm');
require('@babel/register')({ only: [/src[\\/]server/], cwd: path.join(__dirname, '..', '..') });
const { createBacklight } = require('../../src/server/services/touch/backlight');
const saverSource = fs.readFileSync(path.join(__dirname, 'touch/screen-saver.js'), 'utf8');
const backlightSource = fs.readFileSync(path.join(__dirname, 'touch/backlight.js'), 'utf8');
const brightness = '/sys/class/backlight/intel_backlight/brightness';
let now = 0;
const timers = [];
function setTimer(fn, ms) {
  const timer = { at: now + (ms || 0), fn, live: true };
  timers.push(timer);
  return timer;
}
function clearTimer(timer) { if (timer) timer.live = false; }
function advance(ms) {
  const end = now + ms;
  for (;;) {
    const due = timers.filter(t => t.live && t.at <= end).sort((a, b) => a.at - b.at)[0];
    if (!due) break;
    now = due.at;
    due.live = false;
    due.fn();
  }
  now = end;
}
function server(level) {
  const files = { [brightness]: String(level), '/sys/class/backlight/intel_backlight/max_brightness': '937' };
  const service = createBacklight({ fs: {
    readdirSync: () => ['intel_backlight'], accessSync() {},
    readFileSync: file => files[file], writeFileSync: (file, value) => { files[file] = String(value); }
  } });
  const log = [];
  return { service, log, raw: () => Number(files[brightness]), handle(local, method, body) {
    // Route policy is separately tested by api.touch.test.js. Include its local field.
    if (method === 'GET') return { ...service.status(), local };
    if (body.temporary && !local) throw Object.assign(Error('remote'), { status: 409, code: 'ETOUCH_BACKLIGHT_REMOTE' });
    return { ...(body.wake ? service.wake() : body.temporary ? service.dim(body.percent) : service.set(body.percent)), local };
  } };
}
function target() {
  const listeners = {};
  return {
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    removeEventListener(type, fn) { listeners[type] = (listeners[type] || []).filter(f => f !== fn); },
    dispatchEvent(event) { for (const fn of (listeners[event.type] || []).slice()) { fn(event); if (event.stopped) break; } }
  };
}
function event(type, extra = {}) {
  return { type, preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...extra };
}
function element(tag) {
  const node = { ...target(), tagName: tag.toUpperCase(), children: [], inert: false,
    setAttribute() {}, getAttribute() { return null; }, focus() {}, querySelector() { return null; },
    classList: { contains() { return false; } },
    appendChild(child) { this.children.push(child); }, insertBefore(child) { this.children.push(child); }
  };
  Object.defineProperty(node, 'lastChild', { get() { return this.children.at(-1); } });
  return node;
}
function page(host, name, local, modal = false) {
  const window = target(), document = target(), body = element('body'), settings = element('section');
  body.appendChild(settings);
  Object.assign(document, { body, hidden: false, createElement: element, activeElement: null,
    getElementById: id => id === 'screen-settings' ? settings : null,
    querySelectorAll: () => modal ? [{ hidden: false, getClientRects: () => [{}] }] : []
  });
  const localStorage = { getItem: key => key === 'cnc' ? JSON.stringify({ state: { session: { token: 'jwt' } } }) : null };
  function XMLHttpRequest() {}
  XMLHttpRequest.prototype.open = function(method) { this.method = method; };
  XMLHttpRequest.prototype.setRequestHeader = function() {};
  XMLHttpRequest.prototype.send = function(raw) {
    const body = raw ? JSON.parse(raw) : null;
    host.log.push({ name, method: this.method, body });
    setTimer(() => {
      try { this.status = 200; this.responseText = JSON.stringify(host.handle(local, this.method, body)); }
      catch (error) { this.status = error.status; this.responseText = JSON.stringify({ local, code: error.code }); }
      this.onload();
    }, 5);
  };
  function CustomEvent(type, options) { Object.assign(this, event(type, { detail: options.detail })); }
  Object.assign(window, { cncState: { get: () => ({ apiBase: '/api' }) }, performance: { now: () => now } });
  const context = vm.createContext({ window, document, localStorage, XMLHttpRequest, CustomEvent,
    setTimeout: setTimer, clearTimeout: clearTimer, Date: { now: () => now } });
  vm.runInContext(saverSource, context);
  vm.runInContext(backlightSource, context);
  window.cncScreenSaver.configure(5);
  function fire(type, extra) {
    const e = event(type, extra);
    window.dispatchEvent(e);
    if (!e.stopped) document.dispatchEvent(e);
    return e;
  }
  return { saver: window.cncScreenSaver, fire,
    tap() { ['pointerdown', 'pointerup', 'click'].forEach(type => fire(type, { pointerId: 1 })); }
  };
}
const host = server(937), kiosk = page(host, 'kiosk', true), remote = page(host, 'remote', false);
advance(50);
for (let i = 0; i < 18; i++) { advance(20000); kiosk.tap(); }
advance(50);
assert.equal(host.raw(), 937, 'a sleeping remote page cannot darken the active kiosk');
assert.equal(host.log.filter(r => r.name === 'remote' && r.method === 'POST').length, 0, 'remote sends neither wake nor dim at load or during sleep');
remote.tap(); advance(50);
assert.equal(host.log.filter(r => r.name === 'remote' && r.method === 'POST').length, 0, 'remote wake only lifts its overlay');
// Another local page may dim the host while the kiosk itself is awake.
host.service.dim(0); assert.equal(host.raw(), 0);
advance(6000); kiosk.tap(); advance(50);
assert.equal(host.raw(), 937, 'an awake kiosk touch restores the actual shared panel');
assert(kiosk.saver.preview()); advance(50); assert.equal(host.raw(), 0);
page(host, 'reloaded', true); advance(50);
assert.equal(host.raw(), 937, 'reload wakes a panel dimmed by the previous page');
// Restart loses temporary state; load-time wake still restores a panel found dark.
const restarted = server(0), reloaded = page(restarted, 'restarted', true); advance(50);
assert(restarted.raw() > 0, 'reload wakes after a CNCjs restart with no stored level');
restarted.service.dim(0); advance(6000); reloaded.tap(); advance(50);
assert(restarted.raw() > 0, 'touch after restart wakes an already awake page');
// An open on-screen keyboard still prevents the kiosk's own sleep.
const keyboardHost = server(937); page(keyboardHost, 'keyboard', true, true); advance(12 * 60000);
assert.equal(keyboardHost.log.filter(r => r.body && r.body.temporary).length, 0);
assert.equal(keyboardHost.raw(), 937);
console.log('PASS kiosk backlight: remote overlay only, shared panel wake by an awake kiosk, reload and restart, keyboard inhibits sleep.');
