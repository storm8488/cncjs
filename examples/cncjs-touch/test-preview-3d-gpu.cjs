'use strict';
// GPU gate (PERFORMANCE-UI-SPEC.md 2.1, 8.1): CNCPreviewGL.probeGpu on hardware, software
// (SwiftShader, llvmpipe), no WebGL and a failing context; window.cncGpu in preview-3d.js: eco loads
// and asks nothing; Performance probes once from an idle callback; body classes perf-gpu /
// perf-gpu-lost and the cnc-gpu-change event; the result kept across eco / Performance switches;
// nothing done from a cnc-job-status handler; no forcing hook in the shipped code.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const GL = require('./touch/preview-gl.js');
const T3 = require('./touch/toolpath-3d.js');
const dir = path.join(__dirname, 'touch');
const tick = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
const plain = v => JSON.parse(JSON.stringify(v));

// ---- A fake WebGL for the probe ----
function probeDoc(kind) {
  const log = { contexts: 0, lost: 0, asked: [] };
  function gl(renderer, aa) {
    log.contexts++;
    return { RENDERER: 1, ALIASED_LINE_WIDTH_RANGE: 2, MAX_TEXTURE_SIZE: 3,
      getExtension(name) {
        if (name === 'WEBGL_debug_renderer_info') return kind === 'masked' ? null : { UNMASKED_RENDERER_WEBGL: 99 };
        if (name === 'WEBGL_lose_context') return { loseContext() { log.lost++; } };
        return null;
      },
      getParameter(p) {
        if (kind === 'throws' && p === 2) throw new Error('driver');
        return p === 99 ? renderer : p === 1 ? 'WebKit WebGL' : p === 2 ? new Float32Array([1, 7.375]) : p === 3 ? 16384 : null;
      },
      getContextAttributes() { return { antialias: aa }; } };
  }
  const doc = { createElement() {
    return { width: 0, height: 0, getContext(type, attrs) {
      log.asked.push([type, plain(attrs || {})]);
      if (kind === 'none') return null;
      if (type === 'webgl2') return kind === 'webgl1' ? null : gl('x', false);
      if (type !== 'webgl') return null;
      const renderer = { hardware: 'ANGLE (Intel, Mesa Intel(R) HD Graphics 4400 (HSW GT2), OpenGL 4.6)', webgl1: 'ANGLE (Intel, Mesa Intel(R) HD Graphics 4400 (HSW GT2), OpenGL 4.6)', masked: '',
        swiftshader: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)', llvmpipe: 'llvmpipe (LLVM 15.0.6, 256 bits)', throws: 'x' }[kind];
      return gl(renderer, kind !== 'webgl1');
    } };
  } };
  return { doc, log };
}
{
  let p = probeDoc('hardware'), r = GL.probeGpu(p.doc);
  assert.deepEqual(plain(r), { hardware: true, renderer: 'ANGLE (Intel, Mesa Intel(R) HD Graphics 4400 (HSW GT2), OpenGL 4.6)', webgl2: true, antialias: true, lineWidth: [1, 7.375], maxTextureSize: 16384, reason: '' });
  assert.deepEqual(p.log.asked[0], ['webgl', { failIfMajorPerformanceCaveat: true, antialias: true }], 'hardware only (failIfMajorPerformanceCaveat), antialias asked');
  assert.equal(p.log.lost, p.log.contexts, 'every probe context released');
  p = probeDoc('webgl1'); r = GL.probeGpu(p.doc);
  assert.equal(r.hardware, true); assert.equal(r.webgl2, false); assert.equal(r.antialias, false, 'antialias refused is reported');
  for (const kind of ['swiftshader', 'llvmpipe']) {
    p = probeDoc(kind); r = GL.probeGpu(p.doc);
    assert.equal(r.hardware, false, kind); assert.equal(r.reason, 'software', kind); assert.equal(p.log.lost, p.log.contexts);
  }
  p = probeDoc('masked'); r = GL.probeGpu(p.doc);
  assert.equal(r.renderer, 'WebKit WebGL', 'masked renderer: the RENDERER string'); assert.equal(r.hardware, true);
  p = probeDoc('none'); r = GL.probeGpu(p.doc);
  assert.equal(r.hardware, false); assert.equal(r.reason, 'no-webgl');
  p = probeDoc('throws'); r = GL.probeGpu(p.doc);
  assert.equal(r.hardware, false); assert.equal(r.reason, 'probe-failed'); assert.equal(p.log.lost, 1, 'released after a failure');
}

// ---- window.cncGpu in a fake page running preview-3d.js ----
function page(opts) {
  const ids = {}, idle = [], events = [], loads = [], listeners = {};
  let probes = 0;
  const mk = tag => {
    const n = { tagName: tag, children: [], attributes: {}, listeners: {}, hidden: false, textContent: '', parentNode: null, id: '', classList: { add() {} },
      appendChild(c) { c.parentNode = n; n.children.push(c); return c; }, insertBefore(c) { c.parentNode = n; n.children.push(c); return c; },
      setAttribute(k, v) { n.attributes[k] = String(v); }, getAttribute(k) { return k in n.attributes ? n.attributes[k] : null; }, removeAttribute(k) { delete n.attributes[k]; },
      addEventListener(t, fn) { (n.listeners[t] = n.listeners[t] || []).push(fn); }, click() {} };
    return n;
  };
  for (const id of ['library-image', 'home-job-image']) { const box = mk('div'), img = mk('img'); img.id = id; box.appendChild(img); ids[id] = img; }
  const classes = new Set();
  const body = { classList: { toggle(c, on) { if (on) classes.add(c); else classes.delete(c); }, contains: c => classes.has(c), add(c) { classes.add(c); } } };
  const profile = { mode: opts.mode, performance() { return this.mode; }, kind: () => 'cnc', machine: () => null,
    loadAdvanced(files) {
      loads.push(files);
      if (this.mode !== 'performance') return Promise.reject(new Error('Éco'));
      win.CNCPreviewGL = { probeGpu: doc => { probes++; assert(doc, 'probe given the document'); return GL.probeGpu(probeDoc(opts.gpu || 'hardware').doc); }, open() { return null; } };
      return Promise.resolve(files);
    } };
  const win = { document: { hidden: false, body, currentScript: { src: 'http://t/touch/preview-3d.js' }, getElementById: id => ids[id] || null, createElement: mk, addEventListener() {} },
    localStorage: { getItem: () => null, setItem() {} }, URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    MutationObserver: class { observe() {} },
    requestIdleCallback(fn, o) { if (this == null) throw new TypeError('Illegal invocation'); idle.push([fn, o]); return idle.length; },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    dispatchEvent(e) { events.push([e.type, plain(e.detail)]); (listeners[e.type] || []).forEach(fn => fn(e)); return true; },
    addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    CNCToolpath3D: T3, cncI18n: { t: s => s, html: s => s, locale: 'fr-FR' }, cncProfile: profile, setTimeout, clearTimeout, Date, Promise, Object, Error, String, JSON, Array };
  win.window = win; vm.createContext(win);
  vm.runInContext(fs.readFileSync(path.join(dir, 'preview-3d.js'), 'utf8'), win);
  return { win, idle, events, loads, classes, profile, probes: () => probes,
    async runIdle() { while (idle.length) { idle.shift()[0]({ timeRemaining: () => 4 }); await tick(2); } },
    fire(type, detail) { (listeners[type] || []).slice().forEach(fn => fn({ type, detail })); } };
}

(async () => {
  // Eco: nothing loaded, no idle callback, no context; ready() at once.
  let p = page({ mode: 'eco' });
  assert.deepEqual(plain(p.win.cncGpu.state()), { checked: true, hardware: false, lost: false, renderer: '', webgl2: false, antialias: false, lineWidth: [1, 1], maxTextureSize: 0, reason: 'eco' });
  assert.equal(p.idle.length, 0, 'eco: no idle callback'); assert.deepEqual(p.loads, [], 'eco: preview-gl.js never asked');
  assert.equal((await p.win.cncGpu.ready()).reason, 'eco');
  assert.equal(p.classes.has('perf-gpu'), false);
  p.fire('cnc-job-status', { machine: { workflow: 'running', fresh: true } }); await tick(2);
  assert.deepEqual(p.loads, []); assert.equal(p.probes(), 0);

  // Performance with a hardware GPU: pending, then one probe from an idle callback (3 s at most).
  p = page({ mode: 'performance' });
  assert.equal(p.win.cncGpu.state().reason, 'pending'); assert.equal(p.win.cncGpu.state().checked, false);
  assert.equal(p.idle.length, 1); assert.equal(p.idle[0][1].timeout, 3000);
  assert.deepEqual(p.loads, [], 'nothing loaded before the idle callback');
  // A status report while pending starts nothing.
  p.fire('cnc-job-status', { machine: { workflow: 'idle', fresh: true } }); await tick(2);
  assert.deepEqual(p.loads, []); assert.equal(p.probes(), 0);
  const ready = p.win.cncGpu.ready();
  await p.runIdle();
  assert.deepEqual(plain(p.loads), [['preview-gl.js']]); assert.equal(p.probes(), 1);
  const s = await ready;
  assert.equal(s.hardware, true); assert.equal(s.checked, true); assert.equal(s.reason, ''); assert.equal(s.webgl2, true); assert.deepEqual(plain(s.lineWidth), [1, 7.375]);
  assert(p.classes.has('perf-gpu'), 'perf-gpu on body'); assert(!p.classes.has('perf-gpu-lost'));
  const changes = p.events.filter(e => e[0] === 'cnc-gpu-change');
  assert.equal(changes[changes.length - 1][1].hardware, true, 'cnc-gpu-change with the state');
  // Eco: class removed, result kept; Performance again: class back without a new probe.
  p.profile.mode = 'eco'; p.fire('cnc-profile-change', { performance: 'eco' });
  assert(!p.classes.has('perf-gpu')); assert.equal(p.win.cncGpu.state().reason, 'eco');
  assert.equal(p.events[p.events.length - 1][1].reason, 'eco');
  p.profile.mode = 'performance'; p.fire('cnc-profile-change', { performance: 'performance' }); await p.runIdle();
  assert(p.classes.has('perf-gpu')); assert.equal(p.probes(), 1, 'no second probe'); assert.equal(p.idle.length, 0);
  // A view lost its context: perf-gpu-lost, the layout class stays, until a reload.
  const before = p.events.length;
  p.win.cncGpu._contextLost();
  assert(p.classes.has('perf-gpu') && p.classes.has('perf-gpu-lost'));
  assert.equal(p.win.cncGpu.state().lost, true); assert.equal(p.win.cncGpu.state().reason, 'context-lost');
  assert.equal(p.events.length, before + 1); assert.equal(p.events[before][1].lost, true);
  p.win.cncGpu._contextLost(); assert.equal(p.events.length, before + 1, 'one event');
  p.profile.mode = 'eco'; p.fire('cnc-profile-change', {}); assert(!p.classes.has('perf-gpu-lost') && !p.classes.has('perf-gpu'));
  p.profile.mode = 'performance'; p.fire('cnc-profile-change', {}); assert.equal(p.win.cncGpu.state().lost, true, 'lost kept until a reload');

  // Performance on a software renderer (SwiftShader): no class, reason software.
  p = page({ mode: 'performance', gpu: 'swiftshader' }); await p.runIdle();
  assert.equal(p.win.cncGpu.state().hardware, false); assert.equal(p.win.cncGpu.state().reason, 'software'); assert(!p.classes.has('perf-gpu'));
  // No WebGL at all (Surface RT, --disable-gpu): same, reason no-webgl.
  p = page({ mode: 'performance', gpu: 'none' }); await p.runIdle();
  assert.equal(p.win.cncGpu.state().reason, 'no-webgl'); assert(!p.classes.has('perf-gpu'));
  // Back to eco before the idle callback runs: nothing loaded, probed later in Performance.
  p = page({ mode: 'performance' }); p.profile.mode = 'eco'; p.fire('cnc-profile-change', {});
  const pendingReady = p.win.cncGpu.ready();
  await p.runIdle(); assert.deepEqual(p.loads, []); assert.equal((await pendingReady).reason, 'eco');
  p.profile.mode = 'performance'; p.fire('cnc-profile-change', {}); await p.runIdle();
  assert.equal(p.probes(), 1); assert(p.classes.has('perf-gpu'));

  // Shipped code: the cnc-job-status handler of preview-3d.js only compares and refreshes; no forcing hook.
  const src = fs.readFileSync(path.join(dir, 'preview-3d.js'), 'utf8'), glSrc = fs.readFileSync(path.join(dir, 'preview-gl.js'), 'utf8');
  const at = src.indexOf("addEventListener('cnc-job-status'"), handler = src.slice(at, src.indexOf('});', at));
  assert(at > 0); assert.doesNotMatch(handler, /probe|gpuSchedule|gpuEnsure|loadAdvanced/, 'no probe from a status handler');
  for (const text of [src, glSrc]) {
    assert.doesNotMatch(text, /location\.(search|hash)|URLSearchParams/, 'no URL parameter');
    assert.doesNotMatch(text, /localStorage\.(getItem|setItem)\(['"][^'"]*gpu/i, 'no storage key for the GPU');
  }
  console.log('PASS GPU gate: probe hardware / software (SwiftShader, llvmpipe) / no WebGL / failure, contexts released; eco loads and asks nothing (reason eco); Performance probes once from an idle callback (3 s), never from a status report; perf-gpu / perf-gpu-lost and cnc-gpu-change; result kept across profile switches, lost until reload; no forcing hook.');
})().catch(e => { console.error(e); process.exit(1); });
