'use strict';
// Bug hunt, team F3 (bughunt/FINDINGS.md): one scenario per defect of the Performance interface,
// each failing while the defect is there. Offline: the WebGL page stub of test-preview-gl.cjs and the
// DOM fixture of the dashboard tests; XMLHttpRequest is a recorder, nothing reaches a server or a machine.
//
//   C-3  an inline view follows the size of its frame (ResizeObserver), not only the window's.
//   D-5  a tap on the inline 3D view never reads the program; no source read during a job; a read in
//        flight is aborted when a job starts (spec 3.7, Q7).
//   D-4  looking at another file in Fichiers keeps the full geometry of the loaded program (spec 3.8, Q7b).
//   D-2  loadedPreview() never gives the preview of another version of the loaded program.
//   D-3  a preview read answered while the state was missing is not kept as null.
//   D-6  without a preview, a resumed job's acknowledged line counts in the original file (resume.total).
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');
const T3 = require('./touch/toolpath-3d.js');
const { createPage } = require('./test-preview-gl.cjs');
const tick = n => new Promise(r => { let k = n || 1; (function loop() { if (--k < 0) r(); else setImmediate(loop); })(); });

function program(name, fingerprint) {
  let line = 0, cur = [0, 0, 5];
  const b = T3.createBuilder({ bounds: [0, 0, -1, 50, 50, 5] });
  function mv(x, y, z, mode) { line++; b.move(cur[0], cur[1], cur[2], x, y, z, mode, line); cur = [x, y, z]; }
  for (let k = 0; k < 5; k++) { mv(0, k * 10, 5, 0); mv(0, k * 10, -1, 1); for (let s = 1; s <= 10; s++) mv(s * 5, k * 10, -1, 1); mv(50, k * 10, 5, 0); }
  return { file: name, fingerprint, path3d: b.finish(line), zBounds: [-1, 5] };
}
const report = (name, fingerprint, workflow) => ({ fresh: true, name, fingerprint, total: 100, received: 1, workflow, activeState: workflow === 'running' ? 'Run' : 'Idle', statusAgeMs: 0,
  operator: { reportUnits: 'mm', wcs: 'G54' }, coordinates: { wpos: { x: '0', y: '0', z: '5' }, mpos: { x: '-300', y: '-200', z: '-50' } } });
// Records the requests of preview-inspect.js (watch/file): a session token so that it would read.
function recorder(page) {
  const sent = [];
  page.win.XMLHttpRequest = function () {
    const x = this;
    x.open = (m, u) => { x.url = u; }; x.setRequestHeader = () => {}; x.abort = () => { x.aborted = true; };
    x.send = body => sent.push({ url: x.url, body, xhr: x });
  };
  page.storage.set('cnc', JSON.stringify({ state: { session: { token: 'fake' } } }));
  return sent;
}
// Short still taps over the whole canvas: at least one lands on the path.
function tapEverywhere(view, stop) {
  let id = 100;
  for (let x = 5; x < 800; x += 10) for (let y = 5; y < 450; y += 10) {
    id++;
    view.canvas.dispatch('pointerdown', { pointerId: id, clientX: x, clientY: y, button: 0 });
    view.canvas.dispatch('pointerup', { pointerId: id, clientX: x, clientY: y });
    if (stop()) return;
  }
}

const failures = [];
async function scenario(name, fn) {
  try { await fn(); console.log('OK   ' + name); } catch (e) { failures.push(name); console.log('FAIL ' + name + '\n     ' + String(e.message).split('\n')[0]); }
}

// ---- Dashboard (job-dashboard.js) in the DOM fixture, wide layout on demand ----
function dashboard(options = {}) {
  const listeners = {}, requests = [];
  const dom = require('./dom-fixture.cjs').createDOM(options.screens || ['menu']), { node } = dom;
  const win = { addEventListener: (n, f) => { listeners[n] = f; }, innerWidth: 1366, cncLayout: { wide: () => !!options.wide }, requestAnimationFrame: () => 0 };
  if (options.wide) {
    // The Suivi elements job-dashboard.js moves into its zones (as test-dashboard.cjs builds them).
    const link = (e) => {
      if (e._linked) return e; e._linked = true;
      Object.defineProperty(e, 'nextSibling', { get() { const p = this.parentNode, i = p && p.children ? p.children.indexOf(this) : -1; return i >= 0 ? p.children[i + 1] || null : null; } });
      Object.defineProperty(e, 'firstChild', { get() { return this.children[0] || null; } });
      return e;
    };
    const make = dom.document.createElement;
    dom.document.createElement = (tag) => { const e = link(make(tag)); let own = ''; Object.defineProperty(e, 'id', { get: () => own, set(v) { own = v; dom.nodes[v] = e; } }); return e; };
    dom.document.createTextNode = (text) => { const t = link(make('#text')); t.textContent = text; return t; };
    dom.document.createElementNS = (ns, tag) => link(make(tag));
    const el = (id) => link(node(id)), box = (cls) => { const e = dom.document.createElement('div'); e.className = cls; return e; };
    const board = box('job-dashboard'), left = el('home-left'), metrics = box('job-metrics'), art = box('job-art');
    board.appendChild(left); board.appendChild(metrics);
    left.appendChild(art); art.appendChild(el('home-job-image')); left.appendChild(el('home-overrides'));
    const progress = box('t-card home-progress'), head = box('home-progress-head'), tiles = box('home-live-tiles'), feedCard = box('t-card'), stop = box('home-stop');
    head.appendChild(el('home-job-percent')); progress.appendChild(head); progress.appendChild(el('home-job-progress'));
    feedCard.appendChild(el('home-live-feed')); tiles.appendChild(feedCard); stop.appendChild(el('home-job-stop'));
    [el('home-job-title'), progress, el('home-coords'), tiles, el('home-job-note'), el('home-job-ready'), el('home-job-feedback'), stop].forEach((n) => metrics.appendChild(n));
  }
  function XHR() {
    this.open = (m, p) => { this.url = p; }; this.setRequestHeader = () => {};
    this.abort = () => { this.aborted = true; if (this.onabort) this.onabort(); };
    this.send = (body) => requests.push({ xhr: this, file: JSON.parse(body).file });
  }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'touch', 'job-dashboard.js'), 'utf8'), { window: win, document: dom.document, Date,
    localStorage: { getItem: () => JSON.stringify({ state: { session: { token: 'fake' } } }) }, XMLHttpRequest: XHR, Promise });
  const status = (machine) => listeners['cnc-job-status']({ detail: { machine, simulation: false } });
  const answer = (xhr, file, fingerprint, preview) => { xhr.status = 200; xhr.responseText = JSON.stringify({ data: JSON.stringify({ file, fingerprint, preview: Object.assign({ image: 'data:image/png;base64,AAAA', lines: 40 }, preview) }), preview: { stale: false } }); xhr.onload(); };
  if (options.wide) listeners['cnc-layout-change']({ detail: { wide: true } });
  return { win, dom, node, listeners, requests, status, answer, view: win.cncDashboardView };
}

(async () => {
  await scenario('C-3 an inline view follows its frame\'s size (ResizeObserver), and lets it go at close', async () => {
    const size = { width: 732, height: 496 }, observed = [];
    const page = createPage(Object.assign(size, { gpu: true }));
    page.win.ResizeObserver = function (fn) { const o = { fn, targets: [], disconnected: false }; observed.push(o); this.observe = t => o.targets.push(t); this.disconnect = () => { o.disconnected = true; }; };
    const view = page.win.CNCPreviewGL.open(program('c3.nc', 'sha256:c3'), { container: page.doc.createElement('div') });
    assert.equal(view.canvas.style.height, '496px');
    assert.equal(observed.length, 1, 'the inline view watches its frame'); assert.equal(observed[0].targets.length, 1);
    // The card's texts appear under the view: its frame gets shorter, the window does not change.
    size.height = 305; observed[0].fn([]);
    assert.equal(view.canvas.style.height, '305px', 'canvas follows the frame');
    view.close('test');
    assert.equal(observed[0].disconnected, true, 'observer released at close');
  });

  await scenario('D-5 a tap on the inline view during a job reads nothing (spec 3.7, Q7)', async () => {
    const page = createPage({ gpu: true }), sent = recorder(page), meta = program('live.nc', 'sha256:live');
    const view = page.win.CNCPreviewGL.open(meta, { container: page.doc.createElement('div'), live: { progress: true, tool: true } });
    page.win.dispatch('cnc-job-status', { machine: report('live.nc', 'sha256:live', 'running') });
    page.runFrames(16);
    tapEverywhere(view, () => sent.length > 0 || view.state().inspected >= 0);
    await tick(5);
    const reads = sent.filter(r => /watch\/file/.test(r.url)).length, inspected = view.state().inspected;
    view.close('test');
    assert.equal(reads, 0, 'program read during the job (' + reads + ' request)');
    assert.equal(inspected, -1, 'inline inspection whose panel is hidden');
  });

  await scenario('D-5 the free view: a read at rest, none during a job', async () => {
    let page = createPage({ gpu: true }), sent = recorder(page);
    const meta = program('live.nc', 'sha256:live');
    let view = page.win.CNCPreviewGL.open(meta, {});
    tapEverywhere(view, () => sent.length > 0);
    await tick(5);
    assert.equal(sent.filter(r => /watch\/file/.test(r.url)).length, 1, 'at rest a tap reads the source line (the taps do reach the path)');
    view.close('test');
    page = createPage({ gpu: true }); sent = recorder(page);
    page.win.cncState = { get: () => ({ machine: report('live.nc', 'sha256:live', 'running') }) };
    view = page.win.CNCPreviewGL.open(meta, {});
    view.inspect(5); await tick(5);
    const reads = sent.length; view.close('test');
    assert.equal(reads, 0, 'program read during a job from the free view');
  });

  await scenario('D-5 a source read in flight is aborted when a job starts', async () => {
    const page = createPage({ gpu: true }), sent = recorder(page), meta = program('live.nc', 'sha256:live');
    const view = page.win.CNCPreviewGL.open(meta, { container: page.doc.createElement('div'), live: { progress: true, tool: true } });
    page.win.dispatch('cnc-job-status', { machine: report('live.nc', 'sha256:live', 'idle') });
    view.inspect(5); await tick(2);
    assert.equal(sent.length, 1, 'read at rest');
    page.win.dispatch('cnc-job-status', { machine: report('live.nc', 'sha256:live', 'running') });
    const aborted = sent[0].xhr.aborted === true; view.close('test');
    assert(aborted, 'the program is still being read during the job');
  });

  await scenario('D-5 the enlarged view (no live option): a read in flight is aborted when a job starts or pauses', async () => {
    for (const workflow of ['running', 'paused']) {
      const page = createPage({ gpu: true }), sent = recorder(page), meta = program('live.nc', 'sha256:live');
      // « Agrandir » (preview-3d.js openFree): no live option, no container.
      const view = page.win.CNCPreviewGL.open(meta, {});
      view.inspect(5); await tick(2);
      assert.equal(sent.length, 1, 'read at rest');
      page.win.dispatch('cnc-job-status', { machine: report('live.nc', 'sha256:live', workflow) });
      const aborted = sent[0].xhr.aborted === true;
      // During the job, another tap reads nothing.
      page.win.cncState = { get: () => ({ machine: report('live.nc', 'sha256:live', workflow) }) };
      view.inspect(6); await tick(2);
      const more = sent.length - 1;
      view.close('test');
      assert(aborted, workflow + ': the enlarged view still reads the program during the job');
      assert.equal(more, 0, workflow + ': a read started during the job');
      assert.equal(page.listenerCount.value, 0, 'listeners released at close');
    }
  });

  await scenario('D-4 looking at another file keeps the loaded program\'s full geometry (Q7b)', async () => {
    const page = createPage({ gpu: true });
    const A = program('a.nc', 'sha256:aa'), B = program('b.nc', 'sha256:bb');
    let reads = 0;
    page.win.CNCPreviewInspect.geometry = () => { reads++; return { promise: Promise.resolve({ tooLong: false, segments: 59, path: T3.decode(A.path3d) }), cancel() {} }; };
    // Suivi at rest (preview-3d.js: the loaded program, fullGeometry at rest).
    let view = page.win.CNCPreviewGL.open(A, { container: page.doc.createElement('div'), live: { progress: true, tool: true }, fullGeometry: true, loaded: true });
    await tick(5); assert.equal(view.state().geometry, 'full'); view.close('screen');
    // The job starts; Fichiers shows B without loading it (no live view, no full geometry).
    view = page.win.CNCPreviewGL.open(B, { container: page.doc.createElement('div') });
    assert.equal(view.state().geometry, 'simplified'); view.close('screen');
    // Back to Suivi during the job: no read allowed, the kept geometry is used.
    view = page.win.CNCPreviewGL.open(A, { container: page.doc.createElement('div'), live: { progress: true, tool: true }, fullGeometry: false, loaded: true });
    const kind = view.state().geometry; view.close('test');
    assert.equal(reads, 1);
    assert.equal(kind, 'full', 'A back in simplified geometry after looking at B');
  });

  await scenario('D-2 loadedPreview() refuses Suivi\'s preview of another version of the program', async () => {
    const d = dashboard({ screens: ['home'] });
    d.status({ port: 'P', name: 'part.nc', revision: 1, fingerprint: 'sha256:old', fresh: true, workflow: 'idle' });
    const first = d.requests.at(-1); assert.equal(first.file, 'part.nc.cnctouch.json');
    d.answer(first.xhr, 'part.nc', 'sha256:old', { projection: { units: 'mm', bounds: [0, 0, 10, 10] } }); d.node('home-job-image').onload();
    assert.equal((await d.view.loadedPreview()).fingerprint, 'sha256:old', 'Suivi\'s preview reused for the same version');
    // Another client loads a new version under the same name.
    d.status({ port: 'P', name: 'part.nc', revision: 2, fingerprint: 'sha256:new', fresh: true, workflow: 'idle' });
    const count = d.requests.length, pending = d.view.loadedPreview();
    const extra = d.requests.length - count;
    if (extra) d.answer(d.requests.at(-1).xhr, 'part.nc', 'sha256:new', { projection: { units: 'mm', bounds: [0, 0, 200, 200] } });
    const got = await pending;
    assert.equal(got && got.fingerprint, 'sha256:new', 'returned ' + (got && got.fingerprint) + ' with ' + extra + ' extra request');
    // A read whose answer is of another version than the one loaded now: null.
    d.status({ port: 'P', name: 'part.nc', revision: 3, fingerprint: 'sha256:third', fresh: true, workflow: 'idle' });
    const late = d.view.loadedPreview();
    d.answer(d.requests.at(-1).xhr, 'part.nc', 'sha256:new', {});
    assert.equal(await late, null, 'an answer of another version is given for the loaded program');
  });

  await scenario('D-3 an answer received while the state is missing is not kept as null', async () => {
    const d = dashboard();
    d.status({ port: 'P', name: 'part.nc', revision: 1, fresh: true, workflow: 'idle' });
    const first = d.view.loadedPreview(); assert.equal(d.requests.length, 1);
    d.status(null);
    d.answer(d.requests[0].xhr, 'part.nc', 'sha256:aa', {});
    assert.equal(await first, null, 'no state: null');
    d.status({ port: 'P', name: 'part.nc', revision: 1, fresh: true, workflow: 'idle' });
    const again = d.view.loadedPreview();
    const extra = d.requests.length - 1;
    if (extra) d.answer(d.requests.at(-1).xhr, 'part.nc', 'sha256:aa', {});
    const got = await again;
    assert(got && got.file === 'part.nc', 'null kept for the program (' + extra + ' new request)');
  });

  await scenario('D-3 the origin card asks again when the state comes back after a null answer', async () => {
    // origin-preview.js with stubs of its neighbours (as test-origin-preview.cjs, reduced).
    const listeners = {}, frames = [], reads = [];
    const el = (tag) => { const n = { tagName: tag, children: [], hidden: false, attributes: {}, className: '', textContent: '', parentNode: null,
      appendChild(c) { c.parentNode = n; n.children.push(c); return c; }, removeChild(c) { n.children.splice(n.children.indexOf(c), 1); c.parentNode = null; return c; },
      setAttribute(k, v) { n.attributes[k] = String(v); }, getAttribute(k) { return k in n.attributes ? n.attributes[k] : null; } };
      n.classList = { contains: c => n.className.split(' ').includes(c), add() {}, remove() {} }; return n; };
    const document = { head: el('head'), body: el('body'), createElement: el, createTextNode: t => ({ textContent: t }), getElementById: () => null };
    const win = { document, addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); }, removeEventListener() {},
      requestAnimationFrame: f => { frames.push(f); return frames.length; }, cancelAnimationFrame() {}, setTimeout, clearTimeout, Promise, JSON, Math, Object, Array, String, Number, isFinite };
    win.window = win;
    win.cncProfile = { performance: () => 'performance', kind: () => 'cnc' };
    win.cncLayout = { wide: () => true };
    win.CNCTravelCheck = require('./touch/travel-check.js');
    win.CNCPreviewGL = { open: () => ({ setOverlays() {}, close() {} }), checkOverlays: () => ({ accepted: [], refused: [] }), active: () => false };
    let answer = null, first = null;
    win.cncDashboardView = { loadedPreview: () => { reads.push(1); return reads.length === 1 ? new Promise(r => { first = r; }) : Promise.resolve(answer); } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'touch', 'origin-preview.js'), 'utf8'), win);
    const screen = el('section'); screen.className = 'screen active';
    win.CNCOriginPreview.mount(screen);
    const status = m => (listeners['cnc-job-status'] || []).forEach(f => f({ detail: { machine: m } }));
    const flush = async () => { for (let k = 0; k < 4; k++) { await tick(2); frames.splice(0).forEach(f => f(0)); } };
    const idle = { fresh: true, activeState: 'Idle', workflow: 'idle', name: 'a.nc', revision: 1, settings: { $22: 1, $130: 400, $131: 300 },
      operator: { wcs: 'G54', reportUnits: 'mm' }, coordinates: { mpos: { x: -100, y: -100, z: 0 }, wpos: { x: 0, y: 0, z: 0 } } };
    status(idle); await flush();
    assert.equal(reads.length, 1);
    // The state is lost while the read is answered null (loadedPreview() has no machine then).
    status(null); await flush();
    first(null); await flush();
    // The same program comes back without leaving Préparer: the preview is there now.
    answer = { file: 'a.nc', fingerprint: 'sha256:aa', path3d: 'P', zBounds: [0, 0], projection: { units: 'mm', bounds: [0, 0, 10, 10] } };
    status(idle); await flush();
    win.CNCOriginPreview.unmount();
    assert.equal(reads.length, 2, 'no new read after the state came back (' + reads.length + ' read)');
  });

  await scenario('D-6 resumed job without a preview: acknowledged line in the original file', async () => {
    const d = dashboard({ screens: ['home'], wide: true });
    d.status({ port: 'P', name: 'big.nc', revision: 1, fresh: true, workflow: 'running', activeState: 'Run', total: 206, received: 7,
      resume: { from: 801, total: 1000, preambleLength: 6 } });
    assert.equal(d.node('home-gauge-ack-value').textContent.replace(/\s/g, ' '), '801 / 1 000');
  });

  if (failures.length) { console.log(failures.length + ' defect(s) reproduced.'); process.exit(1); }
  console.log('PASS test-bughunt-f3: no defect reproduced.');
})().catch(e => { console.error(e); process.exit(1); });
