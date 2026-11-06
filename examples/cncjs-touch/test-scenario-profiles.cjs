'use strict';
// Lot D (independent validation), tablet side of PROFILES-CONTRACT.md §1 and §5, across lots B
// and C: in eco the advanced module (preview-gl.js) is never tagged, never injected, never
// fetched; the only caller of loadAdvanced is the free 3D view behind the Performance profile;
// switching the profile back and forth sends no request, reloads nothing and leaves the other
// stored keys alone; two browsers keep their own profile. No network, no machine.
const assert = require('assert').strict, fs = require('fs'), vm = require('vm'), path = require('path');
const dir = path.join(__dirname, 'touch');
const read = (name) => fs.readFileSync(path.join(dir, name), 'utf8');
const KEY = 'cncjs-touch-performance-v1';
const flush = () => new Promise(setImmediate);

// ---- 1. Static seams: no page tags an advanced script; loadAdvanced has one guarded caller.
for (const page of ['index.html', 'simulation.html']) {
  assert.doesNotMatch(read(page), /preview-gl\.js/, page + ': preview-gl.js is never script-tagged');
}
// preview-gl.js is the advanced module itself (its header comment names the call).
const callers = fs.readdirSync(dir).filter((f) => /\.js$/.test(f) && f !== 'tablet-profile.js' && f !== 'preview-gl.js' && /\.loadAdvanced\(/.test(read(f)));
assert.deepEqual(callers, ['job-preparation.js', 'preview-3d.js'], 'loadAdvanced is called from preview-3d.js and the visual origin of Préparer only');
{
  // The visual origin (Performance UI, lot O) loads only when originWanted() holds, which requires Performance.
  const src = read('job-preparation.js'), wanted = src.slice(src.indexOf('function originWanted('), src.indexOf('function originSync('));
  assert.match(wanted, /P\.performance\(\) === 'performance'/, 'the visual origin requires the Performance profile');
  const sync = src.slice(src.indexOf('function originSync('), src.indexOf('.loadAdvanced(', src.indexOf('function originSync(')));
  assert.match(sync, /if \(!originWanted\(\)\)[^;]*;[\s\S]*return;/, 'originSync returns before loading when the origin is not wanted');
}
{
  // Two callers: openFree (returns before loading in eco) and the inline view, reached only through inlineMode (false without Performance).
  const src = read('preview-3d.js');
  for (let at = src.indexOf('.loadAdvanced('); at >= 0; at = src.indexOf('.loadAdvanced(', at + 1)) {
    const free = src.lastIndexOf('function openFree', at), inl = src.lastIndexOf('function inline(', at);
    if (free > inl) assert.match(src.slice(free, at), /if \(!performance\(\)\)[^;]*;[^}]*return;/, 'openFree returns before loading in eco');
    else {
      assert(inl >= 0, 'the call sits in openFree or inline');
      const mode = src.slice(src.indexOf('function inlineMode('), src.indexOf('function visible('));
      assert.match(mode, /!performance\(\)/, 'inlineMode is false without Performance');
      const calls = src.split('inline(host);').length - 1, guarded = src.split('if (inlineMode(host)) { inline(host); return; }').length - 1;
      assert.equal(calls, guarded, 'inline() is only called behind inlineMode');
    }
  }
}
assert.doesNotMatch(read('library-preview-worker.js'), /preview-gl/, 'the preview worker never imports preview-gl.js');

// ---- 2. tablet-profile.js in two independent browsers.
function memory(initial) {
  const values = new Map(initial || []);
  return { values, writes: [], getItem(k) { return values.has(k) ? values.get(k) : null; }, setItem(k, v) { this.writes.push(k); values.set(k, String(v)); }, removeItem(k) { values.delete(k); } };
}
function browser(storage) {
  const listeners = {}, events = [], scripts = [], spies = { reload: 0, xhr: 0, fetch: 0, socket: 0 };
  const head = { appendChild(s) { s.parentNode = head; scripts.push(s); setImmediate(() => s.onload && s.onload()); }, removeChild(s) { s.parentNode = null; } };
  const classes = new Set();
  const document = { head, body: { classList: { toggle(n, on) { if (on) classes.add(n); else classes.delete(n); } } }, createElement: (tag) => ({ tagName: String(tag).toUpperCase() }), addEventListener() {} };
  const window = { localStorage: storage, location: { reload() { spies.reload++; } },
    XMLHttpRequest: function () { spies.xhr++; }, fetch() { spies.fetch++; return Promise.reject(Error('no network')); },
    io() { spies.socket++; }, WebSocket: function () { spies.socket++; },
    addEventListener(n, f) { (listeners[n] || (listeners[n] = [])).push(f); },
    dispatchEvent(e) { events.push(e); (listeners[e.type] || []).slice().forEach((f) => f(e)); } };
  const CustomEvent = class { constructor(type, o) { this.type = type; this.detail = o && o.detail; } };
  vm.runInNewContext(read('tablet-profile.js'), { window, document, CustomEvent, Promise, JSON });
  return { window, profile: window.cncProfile, scripts, spies, events, classes };
}

(async () => {
  const kept = [['cncjs-touch-display-v1', '{"size":"large"}'], ['cncjs-touch-preview-view-v1', 'iso']];
  const s1 = memory(kept), s2 = memory(kept);
  const t1 = browser(s1), t2 = browser(s2);
  // Eco (default): loadAdvanced rejects and injects nothing, even asked twice.
  for (let i = 0; i < 2; i++) {
    await assert.rejects(t1.profile.loadAdvanced(['preview-gl.js']), /co/);
  }
  assert.equal(t1.scripts.length, 0, 'eco: no script injected');
  // Performance on browser 1 only.
  t1.profile.setPerformance('performance');
  assert.equal(t1.profile.performance(), 'performance');
  assert.equal(t2.profile.performance(), 'eco', 'the other browser stays in eco');
  await assert.rejects(t2.profile.loadAdvanced(['preview-gl.js']));
  assert.equal(t2.scripts.length, 0);
  await t1.profile.loadAdvanced(['preview-gl.js']);
  await t1.profile.loadAdvanced(['preview-gl.js']);
  assert.deepEqual(t1.scripts.map((s) => s.src.split('?')[0]), ['preview-gl.js'], 'performance: injected once');
  // Back to eco: refused again, nothing more injected.
  t1.profile.setPerformance('eco');
  await assert.rejects(t1.profile.loadAdvanced(['preview-gl.js']));
  assert.equal(t1.scripts.length, 1);
  // Many switches: no request, no socket, no reload; only our key written; other keys intact.
  for (let i = 0; i < 20; i++) t1.profile.setPerformance(i % 2 ? 'eco' : 'performance');
  await flush();
  for (const b of [t1, t2]) assert.deepEqual(b.spies, { reload: 0, xhr: 0, fetch: 0, socket: 0 });
  assert(s1.writes.every((k) => k === KEY), 'only the performance key is written');
  assert.equal(s2.writes.length, 0, 'the other browser wrote nothing');
  for (const [k, v] of kept) { assert.equal(s1.values.get(k), v); assert.equal(s2.values.get(k), v); }
  assert.deepEqual(JSON.parse(s1.values.get(KEY)), { version: 1, profile: 'eco' });
  // A machine kind never lands in the browser's storage.
  t1.window.dispatchEvent({ type: 'cnc-job-status', detail: { machine: { port: 'P', machineProfile: { version: 1, kind: 'laser', capabilities: {} } } } });
  assert.equal(t1.profile.kind(), 'laser');
  assert(![...s1.values.values()].some((v) => /laser/.test(v)), 'no machine kind stored in the browser');
  console.log('PASS scenario-profiles: eco never tags, injects or loads preview-gl.js; one guarded loadAdvanced caller; profile switches send nothing, reload nothing, touch no other key; browsers independent; no machine kind stored.');
})().catch((e) => { console.error(e); process.exit(1); });
