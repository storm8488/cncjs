'use strict';
const assert = require('assert').strict;
const fs = require('fs');
const vm = require('vm');
const path = require('path');
function fixture(options = {}) {
  let clock = 0, next = 1, epoch = 0, provider, gate = options.gate !== false, idle = true;
  const callbacks = new Map(), listeners = {}, tracks = [], events = [];
  const document = {hidden: false};
  const window = {document, performance: {now: () => clock},
    requestIdleCallback(fn) { const id = next++; callbacks.set(id, fn); return id; },
    cancelIdleCallback(id) { callbacks.delete(id); },
    setTimeout(fn) { const id = next++; callbacks.set(id, fn); return id; },
    clearTimeout(id) { callbacks.delete(id); },
    addEventListener(name, fn) { (listeners[name] || (listeners[name] = [])).push(fn); },
    removeEventListener(name, fn) { listeners[name] = (listeners[name] || []).filter(x => x !== fn); },
    cncShell: {screen: () => 'home'}};
  const api = window.cncV2 = {gate: () => gate, state: () => ({safeIdle: idle}),
    events: {data: 'cnc-v2-data'},
    identity: {compare: (a, b) => a && b && a.key && a.key === b.key ? 'same' : 'different'},
    use: () => ({snapshot: () => ({available: false})}),
    notify: name => { const s = provider.snapshot(); events.push([name, s]); assert(!Object.values(s).some(v => typeof v === 'function')); },
    register(name, value) { assert.equal(name, 'inspect'); provider = value; return () => value.dispose(); },
    lifecycle: {scope() {
      let disposed = false;
      return {token: () => !disposed && gate && idle ? {epoch} : null,
        valid: token => !!token && !disposed && token.epoch === epoch && gate && idle,
        track(kind, fn) { if (options.rejectRender && kind === 'render') { fn('unavailable'); return () => {}; } const t = {kind, fn}; tracks.push(t); return () => { const i = tracks.indexOf(t); if (i >= 0) tracks.splice(i, 1); }; },
        dispose() { disposed = true; }};
    }}};
  const context = {window, document, Float32Array, Float64Array, Uint32Array, Uint8Array, ArrayBuffer,
    performance: window.performance, setTimeout: window.setTimeout, clearTimeout: window.clearTimeout};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'touch/performance-inspect.js'), 'utf8'), context);
  return {window, document, api, get provider() { return provider; }, events, callbacks,
    advance(ms) { clock += ms; }, setIdle(value) { idle = value; epoch++; }, setGate(value) { gate = value; epoch++; },
    emit(name, detail) { (listeners[name] || []).slice().forEach(fn => fn({detail})); },
    cancel(reason) { epoch++; tracks.slice().forEach(t => { if (t.kind === 'read' || reason !== 'job-or-unknown') t.fn(reason); }); if (provider) provider.cancel(reason); },
    slice() { const item = callbacks.entries().next().value; if (item) { callbacks.delete(item[0]); item[1]({timeRemaining: () => 10}); } return !!item; },
    flush() { let budget = 10000; while (callbacks.size && budget--) this.slice(); assert(budget > 0, 'idle queue terminates'); }};
}
function geometry(n = 2, overlap = false) {
  const positions = new Float32Array(6 * n), lines = new Uint32Array(n), passes = new Uint32Array(n);
  for (let i = 0; i < n; i++) { const x = overlap ? 0 : i * 10; positions.set([x, 0, -i, x + 5, 0, -i], 6 * i); lines[i] = i + 10; passes[i] = i + 1; }
  return {version: 1, available: true, identity: {key: 'file+fingerprint', jobKey: 'job', role: 'loaded'}, geometryKey: 'full-v1', quality: 'full', toleranceMm: 0, segmentCount: n, units: 'mm',
    buffers: {positions, sourceLines: lines, passIds: passes}, passes: [], memory: {owner: 'L2', mode: 'borrowed-readonly', transferables: []}};
}
function adapter() {
  const view = {cam: {yaw: 1, pitch: 2, pan: [3, 4]}, calls: [],
    camera() { return JSON.parse(JSON.stringify(this.cam)); }, restoreCamera(value) { this.cam = value; this.calls.push('restore'); },
    project(x, y) { return {x, y}; }, visible() { return true; },
    setInspection(value) { this.selection = value; this.calls.push('selection'); },
    setQuality(value) { this.quality = value; return {mode: value, dpr: value === 'reduced' ? 1 : 1.58}; },
    stats() { return {dpr: 1.58}; }, measure() { return Promise.resolve({samples: 3, p95Ms: 12}); }};
  return view;
}
async function tests() {
  const script = fs.readFileSync(path.join(__dirname, 'touch/performance-inspect.js'), 'utf8');
  const messages = vm.runInNewContext(script.match(/var MESSAGES = (\[[\s\S]*?\n  \]);/)[1]);
  const keys = new Set();
  for (const row of messages) {assert.equal(row.length, 3); assert(!keys.has(row[0])); keys.add(row[0]); row.forEach(value => assert(typeof value === 'string' && value.trim()));}
  for (const key of ['Tolérance du tracé : ', 'Tolérance inconnue']) assert(keys.has(key), 'missing L1 EN/ES row: ' + key);
  const gl = fs.readFileSync(path.join(__dirname, 'touch/preview-gl.js'), 'utf8');
  for (const phrase of gl.matchAll(/\bvt\('((?:[^'\\]|\\.)*)'\)/g)) assert(keys.has(phrase[1]), 'missing GL inspection translation: ' + phrase[1]);
  assert.equal(fixture({gate: false}).provider, undefined, 'closed gate installs no provider, task or listener');
  const rejected = fixture({rejectRender: true});
  assert.equal(rejected.provider.attach(adapter()), false, 'late hidden/locked attachment is safely refused');
  const f = fixture(), p = f.provider, g = geometry(), v = adapter();
  assert(p && p.owner === 'L1'); assert.equal(p.snapshot().available, false);
  for (const language of ['en', 'es']) {
    f.window.cncI18n = {language};
    assert.notEqual(p.text('Examiner'), 'Examiner');
    assert.notEqual(p.text('Revenir au direct'), 'Revenir au direct');
    assert.notEqual(p.text('Index indisponible : préparation au repos requise.'), 'Index indisponible : préparation au repos requise.');
  }
  f.window.cncI18n = {language: 'fr'}; assert.equal(p.text('Examiner'), 'Examiner');
  p.attach(v); p.update(g); assert(f.callbacks.size); assert.equal(p.diagnostics().ready, false); f.flush();
  assert.equal(p.diagnostics().ready, true); assert.equal(p.snapshot().geometryKey, g.geometryKey);
  assert(Object.isFrozen(p.snapshot())); assert.equal(p.begin(), true);
  v.cam.pan[0] = 99;
  const hit = p.pick({x: 2, y: 1, radius: 3}); assert.equal(hit.candidates.length, 1);
  const s = p.snapshot().selection; assert.equal(s.segment, 0); assert.equal(s.sourceLine, 10); assert.equal(s.passId, 1);
  assert.equal(s.nominalMm.x, 2); assert.equal(s.nominalMm.z, 0); assert.equal(s.approximate, false);
  p.end(); assert.equal(v.cam.pan[0], 3, 'return restores complete camera'); assert.equal(p.snapshot().selection, null);
  const copy = g.buffers.positions.slice(); p.update(g); f.flush(); assert.deepEqual(g.buffers.positions, copy, 'borrowed buffers unchanged');
  f.setIdle(false); assert(p.begin()); assert.equal(p.pick({x: 12, y: 0, radius: 2}).candidates[0].segment, 1, 'prepared geometry usable during work');
  p.update(geometry(3)); assert.equal(f.callbacks.size, 0, 'no build while working'); assert.equal(p.diagnostics().ready, false, 'replacement cannot keep mismatched index');
  f.setIdle(true); p.update(g); f.flush();
  p.setQuality('reduced'); assert.equal(p.snapshot().quality.mode, 'reduced'); assert.equal(p.snapshot().quality.dpr, 1);
  assert.equal(await p.diagnose({frames: 3}).then(r => r.p95Ms), 12);
  p.detach('closed'); assert.equal(p.diagnostics().indexBytes, 0); assert.equal(p.snapshot().identity, null); assert.equal(f.callbacks.size, 0);
  for (const reason of ['screen-hidden', 'document-hidden', 'lock', 'program-changed', 'eco', 'context-lost', 'pagehide']) {
    const q = fixture(), a = q.provider; a.attach(adapter()); a.update(geometry(5000)); assert(q.callbacks.size);
    q.cancel(reason); q.flush(); assert.equal(a.diagnostics().indexBytes, 0, reason); assert.equal(a.snapshot().available, false, reason);
  }
  const q = fixture(); q.provider.attach(adapter()); q.provider.update(geometry(5000)); q.setIdle(false); q.cancel('job-or-unknown');
  q.flush(); assert.equal(q.provider.diagnostics().ready, false, 'interrupted build never publishes partial index');
  const r = fixture(), a = r.provider; a.attach(adapter()); a.update(geometry()); r.flush(); r.setIdle(false); r.cancel('job-or-unknown');
  assert.equal(a.diagnostics().ready, true, 'job keeps completed prepared index');
  a.dispose(); a.dispose(); assert.equal(a.diagnostics().indexBytes, 0);
  const policy = fixture(), policyView = adapter(); policy.provider.setQuality('reduced');
  policy.provider.attach(policyView); assert.equal(policyView.quality, 'reduced', 'setting before opening applies to the new renderer');
  policy.provider.setQuality('full');
  policyView.measure = () => Promise.resolve({quality: {mode: 'reduced', dpr: 1}, samples: 3});
  await policy.provider.diagnose({frames: 3}); assert.equal(policy.provider.snapshot().quality.mode, 'reduced', 'measured downgrade is published to L6');
  assert.equal(policy.provider.snapshot().quality.dpr, 1);
  let finish; policyView.measure = () => new Promise(resolve => {finish = resolve;});
  const pending = policy.provider.diagnose(); policy.provider.detach('screen-hidden'); finish({quality: {mode: 'full', dpr: 2}}); await pending;
  assert.equal(policy.provider.snapshot().quality.mode, 'unknown', 'late diagnostic cannot restore released renderer quality');
  policy.provider.setQuality('fixed'); policy.provider.cancel('document-hidden');
  assert.equal(policy.provider.snapshot().quality.mode, 'fixed', 'explicit fixed policy survives hiding and prevents unintended GL reopen');
  console.log('PASS v2 inspect: contract, idle preparation, borrowed buffers, nominal selection, camera restore, quality API and lifecycle.');
}
module.exports = {fixture, geometry, adapter};
if (require.main === module) tests().catch(e => {console.error(e); process.exitCode = 1;});
