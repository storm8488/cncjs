'use strict';
// The renderer owner uses only already-present preview data in v2. No browser,
// request, controller or GL context is created by this deterministic VM fixture.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const T3 = require('./touch/toolpath-3d.js');
const source = fs.readFileSync(__dirname + '/touch/preview-3d.js', 'utf8');
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
function page(options = {}) {
  const ids = {}, listeners = {}, documentListeners = {}, frames = new Map(), idle = new Map();
  const loads = [], opens = [], requests = [], views = [], observers = [], workers = [];
  let sequence = 0, screen = 'home', open = options.gate !== false, safeIdle = true, quality = 'full';
  function node(tag) {
    const n = { tagName: tag.toUpperCase(), children: [], attrs: {}, hidden: false, textContent: '', style: {}, listeners: {},
      classList: { add() {}, contains: () => true, toggle() {} },
      appendChild(c) { c.parentNode = n; n.children.push(c); return c; }, insertBefore(c) { return n.appendChild(c); },
      setAttribute(k, v) { n.attrs[k] = String(v); }, getAttribute(k) { return n.attrs[k] || null; },
      addEventListener(t, f) { (n.listeners[t] = n.listeners[t] || []).push(f); }, removeEventListener() {},
      closest() { return { classList: { contains: () => screen === (n.id === 'home-job-image' ? 'home' : 'files') } }; }
    };
    return n;
  }
  for (const id of ['library-image', 'home-job-image']) {
    const img = ids[id] = node('img'); img.id = id; node('div').appendChild(img);
  }
  const doc = { hidden: false, body: node('body'), currentScript: { src: 'preview-3d.js' },
    getElementById: id => ids[id] || null, querySelector: () => null, createElement: node,
    addEventListener(t, f) { (documentListeners[t] = documentListeners[t] || []).push(f); }
  };
  const gl = {
    probeGpu: () => ({ hardware: true, renderer: 'Intel HD', reason: '' }),
    open(meta, options) {
      if (win.failOpen) throw Error('Context allocation failed');
      const record = { meta, options, closed: false, attached: 0 }; opens.push(record);
      const h = { close(reason) { if (record.closed) return; record.closed = reason; if (options.onClose) options.onClose(); },
        attachInspector() { record.attached++; } }; record.handle = h; views.push(record); return h;
    },
    close(reason) { views.forEach(v => v.handle.close(reason)); }
  };
  const win = { document: doc, CNCToolpath3D: T3, CNCPreviewGL: gl,
    localStorage: { getItem: key => key === 'cnc' ? JSON.stringify({ state: { session: { token: 'fixture' } } }) : options.saved || null, setItem() {} },
    URL: { createObjectURL() { throw Error('No fixed rendering expected'); }, revokeObjectURL() {} },
    MutationObserver: class { constructor(fn) { this.fn = fn; observers.push(this); } observe() {} },
    XMLHttpRequest: class { open() { requests.push(this); } setRequestHeader() {} send() {} abort() { this.aborted = true; } },
    cncI18n: { t: s => s, html: s => s, locale: 'fr-FR' },
    cncProfile: { mode: options.mode || 'performance', performance() { return this.mode; }, kind: () => 'cnc', machine: () => null,
      loadAdvanced(files) { return new Promise(resolve => loads.push({ files, resolve })); } },
    cncV2: { gate: () => open, state: () => ({ safeIdle, layout: true, sessionEnabled: true }),
      use: () => ({ snapshot: () => ({ quality: { mode: quality } }) }) },
    requestAnimationFrame(fn) { const id = ++sequence; frames.set(id, fn); return id; }, cancelAnimationFrame(id) { frames.delete(id); },
    requestIdleCallback(fn) { const id = ++sequence; idle.set(id, fn); return id; }, cancelIdleCallback(id) { idle.delete(id); },
    addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    dispatchEvent(e) { fire(e.type, e.detail); }, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    setTimeout, clearTimeout, Date, Promise, Object, Error, String, JSON, Array
  };
  win.window = win;
  win.failOpen = !!options.failOpen;
  if (options.worker) win.Worker = class { constructor() { workers.push(this); } postMessage() {} terminate() { this.terminated = true; } };
  function fire(type, detail) { (listeners[type] || []).slice().forEach(fn => fn({ type, detail })); }
  vm.runInNewContext(source, win);
  function preview() {
    const img = ids['home-job-image'];
    img.cncPreview = { file: 'part.nc', fingerprint: 'sha256:abc', path3d: { count: 3, data: 'prepared-path' } };
    img.setAttribute('src', 'part.png'); observers[1].fn();
  }
  function frame() { const work = [...frames.values()]; frames.clear(); work.forEach(fn => fn(10)); }
  function status(workflow = 'idle', extra) {
    safeIdle = workflow === 'idle';
    fire('cnc-job-status', { simulation: false, machine: Object.assign({ name: 'part.nc', fingerprint: 'sha256:abc', workflow, fresh: true }, extra) });
  }
  return { win, doc, ids, loads, opens, requests, frames, idle, workers, preview, frame, fire, status,
    setGate(value) { open = value; fire('cnc-v2-change', { open, layout: true }); },
    quality(mode) { quality = mode; fire('cnc-v2-data', { slot: 'inspect', snapshot: { quality: { mode } } }); },
    screen(value) { screen = value; fire('cnc-screen-change', value); },
    hidden(value) { doc.hidden = value; (documentListeners.visibilitychange || []).forEach(fn => fn({})); },
    async resolveLoads() { const waiting = loads.slice(); waiting.forEach(l => l.resolve()); await flush(); }
  };
}
(async () => {
  // An observed state only schedules rendering, never starts a view/source read.
  let p = page(); p.preview(); p.frame(); await flush();
  assert.equal(p.requests.length, 0, 'v2 borrows available metadata; no sidecar read for inspection');
  await p.resolveLoads(); p.frame(); await flush();
  assert.equal(p.opens.length, 1, 'one visible renderer');
  const before = p.loads.length;
  p.status('running');
  assert.equal(p.loads.length, before, 'no advanced load from status handler');
  assert.equal(p.opens.length, 1, 'no renderer opened from status handler');
  p.frame(); await flush();
  assert.equal(p.opens.length, 1, 'loaded geometry remains usable during the job');
  assert.equal(p.requests.length, 0, 'job uses no source or sidecar');

  // A view finishing its asynchronous load after revocation cannot come back.
  for (const cancel of [p => p.hidden(true), p => p.screen('files'), p => p.fire('cnc-screen-lock', true),
    p => p.setGate(false), p => p.fire('pagehide', { persisted: true })]) {
    p = page(); p.preview(); p.frame(); cancel(p); await p.resolveLoads(); p.frame();
    assert.equal(p.opens.length, 0, 'late loader rejected after hide/lock/gate/pagehide');
  }
  // Visibility cleanup is synchronous, including bfcache pagehide, with no restart.
  for (const cancel of [p => p.hidden(true), p => p.screen('files'), p => p.fire('cnc-screen-lock', true),
    p => p.setGate(false), p => p.fire('pagehide', { persisted: true })]) {
    p = page(); p.preview(); p.frame(); await p.resolveLoads(); p.frame();
    assert.equal(p.opens.length, 1);
    cancel(p); assert(p.opens[0].closed, 'view released synchronously');
    const loads = p.loads.length; p.status('running'); p.frame(); await flush();
    assert.equal(p.opens.length, 1, 'no resurrection');
    assert.equal(p.loads.length, loads, 'no loading after revocation');
  }
  // Fresh Idle alone permits asking for full geometry, never unknown/busy state.
  p = page(); p.preview(); p.frame(); await p.resolveLoads(); p.frame();
  p.status('running'); p.screen('files'); p.frame(); p.screen('home'); p.frame(); await p.resolveLoads(); p.frame();
  assert.equal(p.requests.length, 0);
  assert.equal(p.opens[p.opens.length - 1].options.fullGeometry, false);
  // An exception in the RAF commit of a resolved loader is still a fixed-view
  // fallback, rather than an uncaught error that bypasses the promise catch.
  p = page({ failOpen: true }); p.preview(); p.frame(); await p.resolveLoads();
  assert.doesNotThrow(() => p.frame(), 'RAF renderer allocation failure handled');
  p.frame(); assert.equal(p.opens.length, 0); assert.equal(p.requests.length, 0);
  assert(p.ids['home-job-image'].parentNode.children.some(n => /Context allocation failed/.test(n.textContent)), 'fallback reason retained');
  p = page(); p.preview(); p.frame(); await p.resolveLoads(); p.frame();
  p.quality('fixed'); assert(p.opens[0].closed, 'fixed quality releases the active renderer');
  p.status('running'); p.frame(); await p.resolveLoads(); p.frame();
  assert.equal(p.opens.length, 1, 'fixed choice persists across later status');
  p.quality('full'); p.frame(); await p.resolveLoads(); p.frame();
  assert.equal(p.opens.length, 2, 'explicit full quality can reopen only the visible view');
  p = page(); p.preview(); p.frame(); await p.resolveLoads(); p.frame();
  p.status('running', { fingerprint: null }); p.screen('files'); p.frame(); p.screen('home'); p.frame(); await p.resolveLoads(); p.frame();
  assert.equal(p.opens.length, 1, 'a name alone does not match the loaded live program');
  p = page({ gate: false, mode: 'eco', saved: 'iso', worker: true }); p.preview();
  assert.equal(p.workers.length, 1, 'old fixed-view worker was pending before the v2 gate');
  p.win.cncProfile.mode = 'performance'; p.setGate(true);
  assert(p.workers[0].terminated, 'v2 activation releases the preceding fixed-view worker');
  assert.equal(p.win.cncPreviewViews.state().queue.length, 0, 'old fixed work removed');
  p.fire('pagehide', { persisted: true });
  console.log('PASS v2 inspection lifecycle: RAF state updates, available metadata only, one visible view, late-load cancellation, synchronous release on hide/lock/gate/bfcache, no full read while busy.');
})().catch(error => { console.error(error); process.exitCode = 1; });
