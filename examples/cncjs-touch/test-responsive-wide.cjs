'use strict';
// Wide workstation gate (PERFORMANCE-UI-SPEC.md 2.2, 8.5, 8.6, 8.9): touch-shell.js sets body.perf-wide
// only with the Performance profile, hardware WebGL (body.perf-gpu) and a landscape window of at least
// 1300 x 880 CSS px; cnc-layout-change and cncLayout.wide() follow. The GPU gate of lot V is the stub of
// spec 8.10 (test use only). Then job-dashboard.js's loadedPreview(): one read in flight, null without
// a loaded program, a stale verdict refused, Suivi's own preview reused. Synthetic window, no server.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const dir = __dirname + '/touch/';
const read = (f) => fs.readFileSync(dir + f, 'utf8');

function eventWindow(extra) {
  const lists = {};
  const win = Object.assign({
    addEventListener(name, fn) { (lists[name] || (lists[name] = [])).push(fn); },
    dispatchEvent(e) { (lists[e.type] || []).slice().forEach((fn) => fn(e)); return true; }
  }, extra);
  return win;
}
function CustomEvent(type, o) { this.type = type; this.detail = o && o.detail; }

// --- 1. The gate, touch-shell.js's own code (cut between its markers) with the GPU stub of spec 8.10.
{
  const shell = read('touch-shell.js');
  const start = shell.indexOf('var layoutWideOn'), endMark = "window.addEventListener('cnc-gpu-change',fitLayout);fitLayout();";
  assert(start > 0 && shell.indexOf(endMark, start) > start, 'perf-wide block found in touch-shell.js');
  const src = '(function(){' + shell.slice(start, shell.indexOf(endMark, start) + endMark.length) + '})();';
  const classes = new Set(['ks-ui', 'perf-eco']);
  const body = { classList: { contains: (c) => classes.has(c), toggle: (c, on) => { if (on === undefined) on = !classes.has(c); if (on) classes.add(c); else classes.delete(c); return on; } } };
  let profile = 'eco';
  const layoutEvents = [];
  const win = eventWindow({ innerWidth: 1366, innerHeight: 911, CustomEvent });
  win.cncProfile = { performance: () => profile };
  win.addEventListener('cnc-layout-change', (e) => layoutEvents.push(e.detail.wide));
  const ctx = { window: win, document: { body }, CustomEvent, Promise };
  win.document = ctx.document;
  // Stub of the GPU gate (spec 8.10), verbatim apart from the root.
  vm.runInNewContext(`(function (root) {
  'use strict';
  if (root.cncGpu) return;
  var probe = { checked: true, hardware: true, lost: false, renderer: 'stub', webgl2: true, antialias: true,
    lineWidth: [1, 7.4], maxTextureSize: 16384, reason: '' };
  function performance() { try { return !!root.cncProfile && root.cncProfile.performance() === 'performance'; } catch (_) { return false; } }
  function state() {
    var s = {}; Object.keys(probe).forEach(function (k) { s[k] = Array.isArray(probe[k]) ? probe[k].slice() : probe[k]; });
    if (!performance()) { s.hardware = false; s.reason = 'eco'; } else if (s.lost) s.reason = 'context-lost';
    return s;
  }
  function apply() {
    var s = state(), list = root.document && root.document.body && root.document.body.classList;
    if (list) { list.toggle('perf-gpu', s.hardware); list.toggle('perf-gpu-lost', s.hardware && s.lost); }
    try { root.dispatchEvent(new root.CustomEvent('cnc-gpu-change', { detail: s })); } catch (_) {}
  }
  root.cncGpu = {
    state: state,
    ready: function () { return Promise.resolve(state()); },
    _set: function (patch) { Object.keys(patch).forEach(function (k) { probe[k] = patch[k]; }); apply(); }
  };
  root.addEventListener('cnc-profile-change', apply);
  apply();
})(window);`, ctx);
  vm.runInNewContext(src, ctx);
  const wide = () => classes.has('perf-wide');
  const setProfile = (p) => { profile = p; classes.delete('perf-eco'); classes.delete('perf-performance'); classes.add('perf-' + p); win.dispatchEvent(new CustomEvent('cnc-profile-change', { detail: { performance: p } })); };
  const resize = (w, h) => { win.innerWidth = w; win.innerHeight = h; win.dispatchEvent(new CustomEvent('resize')); };

  assert.equal(typeof win.cncLayout.wide, 'function', 'window.cncLayout.wide() exists');
  assert(!wide() && win.cncLayout.wide() === false, 'Éco at 1366 x 911: no perf-wide');
  assert.deepEqual(layoutEvents, [], 'no event while nothing changes');
  setProfile('performance');
  assert(classes.has('perf-gpu') && wide() && win.cncLayout.wide() === true, 'Performance + GPU + 1366 x 911: perf-wide');
  assert.deepEqual(layoutEvents, [true], 'one cnc-layout-change { wide: true }');
  // The RT never reaches it: 1366 x 768 (too short), whatever the GPU says.
  resize(1366, 768); assert(!wide(), '1366 x 768 is never wide'); assert.deepEqual(layoutEvents, [true, false]);
  resize(1366, 768); assert.deepEqual(layoutEvents, [true, false], 'a resize to the same state sends nothing');
  resize(1299, 911); assert(!wide(), '1299 px wide: no');
  resize(1300, 880); assert(wide(), '1300 x 880 exactly: yes');
  resize(1300, 879); assert(!wide(), '879 px high: no');
  resize(1728, 1152); assert(wide(), '1728 x 1152: yes');
  resize(1152, 1728); assert(!wide(), 'portrait: no');
  resize(1366, 911); assert(wide());
  // Software rendering (RT in Performance): the gate is closed, no class.
  win.cncGpu._set({ hardware: false, reason: 'software' }); assert(!classes.has('perf-gpu') && !wide(), 'software WebGL: no perf-wide');
  win.cncGpu._set({ hardware: true, reason: '' }); assert(wide(), 'hardware again: perf-wide');
  // A lost context keeps perf-gpu (spec 2.1, Q4): the layout does not move.
  const before = layoutEvents.length;
  win.cncGpu._set({ lost: true }); assert(classes.has('perf-gpu-lost') && wide(), 'context lost: layout unchanged'); assert.equal(layoutEvents.length, before);
  // Back to Éco: the class goes, with its event; a Performance class alone never opens it.
  setProfile('eco'); assert(!wide() && !classes.has('perf-gpu'), 'Éco removes perf-wide'); assert.equal(layoutEvents.at(-1), false);
  classes.add('perf-performance'); resize(1728, 1152); assert(!wide(), 'no perf-wide without perf-gpu');
  console.log('PASS: perf-wide gate (profile, GPU, size, orientation, context loss), cnc-layout-change, cncLayout.wide().');
}

// --- 2. Style sheets: the gate is the class only, never a media query that repeats it.
{
  for (const f of ['responsive.css', 'ui-2027.css', 'app.css', 'touch-shell.css']) {
    const css = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
    const medias = css.match(/@media[^{]*/g) || [];
    medias.forEach((m) => assert(!/1300px|880px/.test(m), f + ': a media query repeats the perf-wide rule: ' + m));
  }
  console.log('PASS: no media query repeats the perf-wide rule.');
}

// --- 3. loadedPreview() of job-dashboard.js (spec 8.6).
(async () => {
  const listeners = {}, requests = [];
  const dom = require('./dom-fixture.cjs').createDOM(['menu']);
  const win = { addEventListener: (n, f) => { listeners[n] = f; } };
  function XHR() {
    this.open = (m, p) => { assert.equal(m, 'POST'); assert.equal(p, '/api/watch/file'); };
    this.setRequestHeader = () => {}; this.abort = () => { this.aborted = true; if (this.onabort) this.onabort(); };
    this.send = (body) => requests.push({ xhr: this, file: JSON.parse(body).file });
  }
  vm.runInNewContext(read('job-dashboard.js'), { window: win, document: dom.document, Date, localStorage: { getItem: () => JSON.stringify({ state: { session: { token: 'fake' } } }) }, XMLHttpRequest: XHR, Promise });
  const view = win.cncDashboardView;
  assert.equal(typeof view.loadedPreview, 'function', 'cncDashboardView.loadedPreview() exists');
  const status = (machine) => listeners['cnc-job-status']({ detail: { machine, simulation: false } });
  const answer = (xhr, file, preview, extra) => { xhr.status = 200; xhr.responseText = JSON.stringify(Object.assign({ data: JSON.stringify({ file, fingerprint: 'f1', preview: Object.assign({ image: 'data:image/png;base64,AAAA', lines: 40 }, preview) }) }, extra)); xhr.onload(); };
  assert.equal(await view.loadedPreview(), null, 'no machine state: null');
  status({ port: 'P', name: '', fresh: true, workflow: 'idle' });
  assert.equal(await view.loadedPreview(), null, 'no loaded program: null');
  assert.equal(requests.length, 0, 'nothing read without a program');
  // One read in flight for several callers, while Suivi is hidden.
  status({ port: 'P', name: 'part.nc', revision: 1, fresh: true, workflow: 'idle' });
  const a = view.loadedPreview(), b = view.loadedPreview();
  assert.equal(requests.length, 1, 'one read in flight'); assert.equal(requests[0].file, 'part.nc.cnctouch.json');
  answer(requests[0].xhr, 'part.nc', {}, { preview: { stale: false } });
  const [pa, pb] = await Promise.all([a, b]);
  assert(pa && pa === pb && pa.file === 'part.nc' && pa.fingerprint === 'f1' && pa.lines === 40, 'both callers get the same preview');
  assert.equal(await view.loadedPreview(), pa, 'kept for the same program'); assert.equal(requests.length, 1);
  // A regenerated preview is read again; a stale verdict is refused.
  listeners['cnc-library-preview-updated']({ detail: { file: 'part.nc' } });
  const c = view.loadedPreview(); assert.equal(requests.length, 2);
  answer(requests[1].xhr, 'part.nc', {}, { preview: { stale: true, reason: 'fingerprint' } });
  assert.equal(await c, null, 'stale verdict: null');
  // A malformed answer or another file's sidecar: null; a failed read is not kept.
  const d = view.loadedPreview(); assert.equal(requests.length, 3);
  answer(requests[2].xhr, 'other.nc', {}); assert.equal(await d, null, 'another file: null');
  const e = view.loadedPreview(); assert.equal(requests.length, 4);
  requests[3].xhr.status = 500; requests[3].xhr.responseText = ''; requests[3].xhr.onload(); assert.equal(await e, null, 'server error: null');
  // The program changes while a read is in flight: the old answer is not given for the new program.
  const f = view.loadedPreview(); assert.equal(requests.length, 5);
  status({ port: 'P', name: 'next.nc', revision: 2, fresh: true, workflow: 'idle' });
  answer(requests[4].xhr, 'part.nc', {}); assert.equal(await f, null, 'answer for a program no longer loaded: null');
  // Suivi already read it: its preview is returned, nothing more is requested.
  const g = view.loadedPreview(); assert.equal(requests.length, 6); requests[5].xhr.abort(); assert.equal(await g, null, 'aborted read: null');
  dom.activeScreens.clear(); dom.activeScreens.add('home'); listeners['cnc-screen-change']({ detail: 'home' });
  const suivi = requests.at(-1); assert.equal(suivi.file, 'next.nc.cnctouch.json', 'Suivi reads its preview');
  answer(suivi.xhr, 'next.nc', {}); dom.node('home-job-image').onload();
  const count = requests.length, h = await view.loadedPreview();
  assert(h && h.file === 'next.nc' && h === dom.node('home-job-image').cncPreview, 'Suivi\'s preview is reused'); assert.equal(requests.length, count);
  console.log('PASS: loadedPreview(): null without a program, one read in flight, kept per program, stale/malformed/other file refused, Suivi\'s preview reused.');
})().catch((e) => { console.error(e); process.exitCode = 1; });
