'use strict';
// Free 3D view (touch/preview-gl.js) with a WebGL stub in a small page. The page and WebGL stubs at
// the top are also used by measure-preview-gl.cjs. Events bubble from a node to the document unless stopped, so a test can
// check that a camera gesture never reaches a handler above the canvas (a jog control).
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');

function createGL(options = {}) {
  const log = { created: { buffer: 0, program: 0, shader: 0 }, deleted: { buffer: 0, program: 0, shader: 0 }, draws: 0, uploads: [], lost: false, vertices: 0 };
  const gl = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4, ARRAY_BUFFER: 5, STATIC_DRAW: 6, COLOR_BUFFER_BIT: 7, FLOAT: 8, LINES: 9, NO_ERROR: 0,
    createShader() { log.created.shader++; return {}; }, shaderSource() {}, compileShader() {}, getShaderParameter() { return !options.badShader; },
    createProgram() { log.created.program++; return {}; }, attachShader() {}, linkProgram() {}, getProgramParameter() { return true; },
    getAttribLocation(_, n) { return n === 'p' ? 0 : 1; }, getUniformLocation() { return {}; },
    createBuffer() { log.created.buffer++; return {}; }, bindBuffer() {}, bufferData(_, data) { log.uploads.push(data.length); log.vertices = data.length / 6; },
    viewport() {}, clearColor() {}, clear() {}, useProgram() {}, enableVertexAttribArray() {}, vertexAttribPointer() {}, uniformMatrix4fv(_, __, m) { log.matrix = Array.from(m); },
    drawArrays(mode, first, count) { log.draws++; log.drawn = count; }, getError() { return 0; }, isContextLost() { return log.lost; },
    deleteBuffer() { log.deleted.buffer++; }, deleteProgram() { log.deleted.program++; }, deleteShader() { log.deleted.shader++; },
    getExtension(name) { return name === 'WEBGL_lose_context' ? { loseContext() { log.lost = true; log.loseContext = true; } } : null; }
  };
  return { gl, log };
}

function createPage(options = {}) {
  const listenerCount = { value: 0 };
  function makeEvent(type, init) {
    const e = Object.assign({ type, defaultPrevented: false, propagationStopped: false }, init || {});
    e.preventDefault = () => { e.defaultPrevented = true; };
    e.stopPropagation = () => { e.propagationStopped = true; };
    return e;
  }
  function node(tag) {
    let text = '';
    const n = { tagName: String(tag).toUpperCase(), children: [], parentNode: null, attributes: {}, style: {}, className: '', listeners: {}, hidden: false, value: '', type: '',
      appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = n; n.children.push(c); return c; },
      removeChild(c) { const i = n.children.indexOf(c); if (i >= 0) n.children.splice(i, 1); c.parentNode = null; return c; },
      setAttribute(k, v) { n.attributes[k] = String(v); }, getAttribute(k) { return k in n.attributes ? n.attributes[k] : null },
      addEventListener(type, fn) { (n.listeners[type] = n.listeners[type] || []).push(fn); listenerCount.value++; },
      removeEventListener(type, fn) { const l = n.listeners[type] || []; const i = l.indexOf(fn); if (i >= 0) { l.splice(i, 1); listenerCount.value--; } },
      dispatch(type, init) {
        const e = makeEvent(type, init); e.target = n;
        for (let t = n; t; t = t.parentNode) { (t.listeners[type] || []).slice().forEach(fn => fn(e)); if (e.propagationStopped) return e; }
        (doc.listeners[type] || []).slice().forEach(fn => fn(e));
        return e;
      },
      click() { return n.dispatch('click'); }, focus() {}, setPointerCapture() {}, releasePointerCapture() {},
      getBoundingClientRect() { return { left: 0, top: 0, width: options.width || 800, height: options.height || 450 }; },
      querySelector() { return null; } };
    Object.defineProperty(n, 'textContent', { get: () => text, set: v => { text = String(v); n.children.forEach(c => { c.parentNode = null; }); n.children = []; } });
    if (n.tagName === 'CANVAS') {
      n.width = 300; n.height = 150;
      n.getContext = (kind) => {
        if (kind !== 'webgl' && kind !== 'experimental-webgl') return null;
        if (options.noWebGL) return null;
        if (!n.glStub) n.glStub = createGL(options);
        return n.glStub.gl;
      };
    }
    return n;
  }
  const doc = { listeners: {}, body: null, createElement: node, getElementById: id => doc.ids[id] || null, ids: {},
    addEventListener(type, fn) { (doc.listeners[type] = doc.listeners[type] || []).push(fn); listenerCount.value++; },
    removeEventListener(type, fn) { const l = doc.listeners[type] || []; const i = l.indexOf(fn); if (i >= 0) { l.splice(i, 1); listenerCount.value--; } } };
  doc.body = node('body');
  const frames = [], storage = new Map();
  const win = { document: doc, devicePixelRatio: options.dpr || 1, listeners: {},
    localStorage: { getItem: k => storage.has(k) ? storage.get(k) : null, setItem: (k, v) => storage.set(k, String(v)) },
    requestAnimationFrame(fn) { frames.push(fn); return frames.length; }, cancelAnimationFrame() { frames.length = 0; },
    addEventListener(type, fn) { (win.listeners[type] = win.listeners[type] || []).push(fn); listenerCount.value++; },
    removeEventListener(type, fn) { const l = win.listeners[type] || []; const i = l.indexOf(fn); if (i >= 0) { l.splice(i, 1); listenerCount.value--; } },
    dispatch(type, detail) { (win.listeners[type] || []).slice().forEach(fn => fn({ type, detail })); },
    cncI18n: { t: s => s, locale: 'fr-FR' }, Math, Date, JSON, Promise, Error, Float32Array, Float64Array, Uint8Array, Uint16Array, Int16Array, Array, Object, Number, String, isFinite, parseInt, setTimeout, clearTimeout };
  win.window = win; win.self = win;
  vm.createContext(win);
  for (const f of ['toolpath-3d.js', 'motion-estimate.js', 'preview-inspect.js', 'preview-gl.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, 'touch', f), 'utf8'), win);
  return { win, doc, frames, listenerCount, storage, node,
    // Runs the queued animation frames with a given clock.
    runFrames(now) { const list = frames.splice(0); list.forEach(fn => fn(now)); return list.length; } };
}
module.exports = { createGL, createPage };

if (require.main !== module) return;

// ---------------- Tests ----------------
const assert = require('node:assert/strict');
const T3 = require('./touch/toolpath-3d.js');
const { scan } = require('./touch/library-preview.js');
const GL = require('./touch/preview-gl.js');
const tick = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));

async function metaOf(code) {
  const first = await scan(code), z = first.zBounds, b = first.bounds;
  const builder = T3.createBuilder({ bounds: [b[0], b[1], z[0], b[2], b[3], z[1]] });
  await scan(code, null, null, null, null, builder.move);
  const ME = require('./touch/motion-estimate.js');
  return { file: 'piece.nc', fingerprint: 'sha256:aa11', path3d: builder.finish(first.lines), zBounds: z, estimate: ME.estimate(code) };
}
function findAll(n, pred, out = []) { if (pred(n)) out.push(n); (n.children || []).forEach(c => findAll(c, pred, out)); return out; }
function byClass(root, cls) { return findAll(root, n => (' ' + n.className + ' ').includes(' ' + cls + ' ')); }
function byText(root, text) { return findAll(root, n => n.textContent === text)[0]; }

(async () => {
  const code = ['G21 G90', 'T1 M6', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F100', 'G1 X50 F600', 'G1 Y30', 'G0 Z5', 'T2 M6', 'G0 X10 Y10', 'G1 Z-2 F100', 'G1 X40 F400', 'G0 Z5', 'M30'].join('\n');
  const meta = await metaOf(code);

  // Camera math: the presets are the fixed views of toolpath-3d.js; CPU projection = GPU matrix.
  for (const view of ['iso', 'front', 'side', 'top']) {
    const m = T3.projection(view, [0, 0, -1, 10, 10, 1], 1).matrix, s = Math.hypot(m[0], m[1], m[2]);
    const p = GL.PRESETS[view], b = GL.basis(p[0], p[1]);
    for (let k = 0; k < 3; k++) { assert(Math.abs(b.r[k] - m[k] / s) < 1e-3, view + ' right'); assert(Math.abs(b.u[k] + m[4 + k] / s) < 1e-3, view + ' up'); }
  }
  const cam = { yaw: 30, pitch: 40, zoom: 7, panX: 12, panY: -5 }, mat = GL.matrix(cam, 800, 450, 2), centre = [1, 2, 3];
  const pos = new Float64Array([4, -3, 1]), screen = GL.project(pos, 1, centre, cam, 800, 450, 2);
  const c = [pos[0] - centre[0], pos[1] - centre[1], pos[2] - centre[2]];
  const clipX = mat[0] * c[0] + mat[4] * c[1] + mat[8] * c[2] + mat[12], clipY = mat[1] * c[0] + mat[5] * c[1] + mat[9] * c[2] + mat[13];
  assert(Math.abs((clipX + 1) / 2 * 800 - screen[0]) < 1e-3 && Math.abs((1 - clipY) / 2 * 450 - screen[1]) < 1e-3, 'CPU picking uses the GPU projection');
  const fitted = GL.fit([0, 0, -2, 50, 30, 5], 'top', 800, 450, 1);
  assert.equal(fitted.pitch, 90); assert(fitted.zoom > 0);
  const v = GL.buildVertices(T3.decode(meta.path3d), null, [0, 0, 0], -2, [], 5);
  assert.equal(v.segments, T3.decode(meta.path3d).count - 1); assert.equal(v.vertices, v.segments * 2 + 6, 'segments and the axis triad');

  // Opened in a page with a WebGL stub: one frame drawn, then nothing until something changes.
  let page = createPage({ dpr: 3 }), fallbacks = [], closes = [], released = 0, asked = [];
  const source = { stateAt(line) { asked.push(line); return Promise.resolve({ line, raw: 'G1 X50 F600', after: { x: 50, y: 0, z: -1, feed: 600, s: null, spindle: null, lost: false } }); }, release() { released++; } };
  let view = page.win.CNCPreviewGL.open(meta, { source, onFallback: m => fallbacks.push(m), onClose: r => closes.push(r) });
  assert(view, 'opened');
  const gl = view.canvas.glStub.log;
  assert.equal(view.canvas.width, 1200, 'device pixel ratio capped at 1.5 (800 px × 1.5)');
  assert.equal(view.canvas.style.touchAction, 'none');
  assert.equal(page.runFrames(1000), 1); assert.equal(gl.draws, 1);
  assert.equal(page.frames.length, 0, 'render on change only: no frame loop');
  assert.match(byClass(view.dialog, 'pgl-zscale')[0].textContent, /Z ×1 \(échelle réelle\)/, 'real Z scale by default');
  byClass(view.dialog, 'pgl-zscale')[0].click(); page.runFrames(1100);
  assert.match(byClass(view.dialog, 'pgl-zscale')[0].textContent, /Z ×2 \(exagéré\)/, 'exaggeration explicit and labelled');
  assert.equal(byClass(view.dialog, 'pgl-zscale')[0].attributes['data-exaggerated'], 'true');

  // A camera gesture never reaches a jog control: default prevented, propagation stopped.
  let jog = 0; page.doc.addEventListener('pointerdown', () => jog++); page.doc.addEventListener('pointermove', () => jog++); page.doc.addEventListener('pointerup', () => jog++);
  page.doc.body.addEventListener('pointerdown', () => jog++);
  let e = view.canvas.dispatch('pointerdown', { pointerId: 1, clientX: 100, clientY: 100, button: 0 });
  assert(e.defaultPrevented && e.propagationStopped);
  const draws = gl.draws;
  for (let i = 1; i <= 6; i++) { e = view.canvas.dispatch('pointermove', { pointerId: 1, clientX: 100 + i * 10, clientY: 100 }); assert(e.defaultPrevented && e.propagationStopped); }
  assert(view.state().camera.yaw !== GL.PRESETS.iso[0], 'rotated');
  // At most one frame per 33 ms during the gesture.
  page.runFrames(1200); assert.equal(gl.draws, draws + 1);
  view.canvas.dispatch('pointermove', { pointerId: 1, clientX: 200, clientY: 120 });
  page.runFrames(1210); assert.equal(gl.draws, draws + 1, 'skipped: 10 ms after the last frame');
  page.runFrames(1240); assert.equal(gl.draws, draws + 2, 'drawn 40 ms after');
  // Pinch with a second finger: zoom.
  const zoom = view.state().camera.zoom;
  view.canvas.dispatch('pointerdown', { pointerId: 2, clientX: 300, clientY: 120 });
  view.canvas.dispatch('pointermove', { pointerId: 2, clientX: 400, clientY: 120 });
  assert(view.state().camera.zoom > zoom, 'pinch out zooms in');
  view.canvas.dispatch('pointerup', { pointerId: 2, clientX: 400, clientY: 120 });
  e = view.canvas.dispatch('pointerup', { pointerId: 1, clientX: 200, clientY: 120 });
  assert(e.propagationStopped); assert.equal(jog, 0, 'no jog handler reached');
  assert.equal(view.state().gesture, false);
  for (const type of ['touchstart', 'touchmove', 'mousedown', 'click', 'contextmenu']) assert(view.canvas.dispatch(type, {}).propagationStopped, type + ' kept in the canvas');
  view.canvas.dispatch('wheel', { deltaY: -1, clientX: 400, clientY: 225 });

  // Tap on a segment: inspection, simplified first, then exact values from the source line.
  byText(view.dialog, 'Iso').click(); page.runFrames(2000);
  const path3 = T3.decode(meta.path3d);
  let target = -1;
  for (let i = 1; i < path3.count; i++) if (path3.lines[i] === 6) target = i;
  view.inspect(target);
  const rowsBox = byClass(view.dialog, 'pgl-rows')[0];
  assert(findAll(rowsBox, n => n.attributes && n.attributes['data-kind'] === 'simplified').length >= 1);
  await tick(5);
  assert.deepEqual(asked, [6], 'source line read on demand');
  assert(findAll(rowsBox, n => n.attributes && n.attributes['data-kind'] === 'exact').length >= 3);
  assert(findAll(rowsBox, n => /valeur exacte de la ligne source/.test(n.textContent)).length === 1);
  assert(findAll(rowsBox, n => /géométrie simplifiée/.test(n.textContent)).length === 1);
  // A real tap (short, still) also picks.
  view.canvas.dispatch('pointerdown', { pointerId: 5, clientX: 1, clientY: 1 });
  view.canvas.dispatch('pointerup', { pointerId: 5, clientX: 1, clientY: 1 });
  assert.equal(view.state().inspected, -1, 'a tap far from the path picks nothing');

  // Filters: rapids off, a depth range, a tool (offered: two T words).
  const before = gl.vertices;
  byClass(view.dialog, 'pgl-toggle')[0].click();
  assert(gl.vertices < before, 'rapids hidden');
  const selects = findAll(view.dialog, n => n.tagName === 'SELECT');
  assert.equal(selects.length, 1, 'tools offered (T1, T2); no operation comments: no operation filter');
  selects[0].value = '2'; byText(view.dialog, 'Appliquer les filtres').click();
  assert(/ \/ /.test(byClass(view.dialog, 'pgl-count')[0].textContent));
  const inputs = findAll(view.dialog, n => n.tagName === 'INPUT');
  inputs[0].value = 'abc'; byText(view.dialog, 'Appliquer les filtres').click();
  assert.match(byClass(view.dialog, 'pgl-error')[0].textContent, /illisible/); inputs[0].value = '';
  // Clamps: entered by hand, kept per fingerprint, labelled indicative.
  const fields = byClass(byClass(view.dialog, 'pgl-clamps')[0], 'pgl-field').map(f => f.children[1]);
  ['5', '5', '10', '10', '20'].forEach((v, i) => { fields[i].value = v; });
  byText(view.dialog, 'Ajouter la bride').click();
  assert.match(byClass(view.dialog, 'pgl-overlay-note')[0].textContent, /aucune garantie anticollision/);
  assert.match(page.storage.get('cncjs-touch-clamps-v1'), /aa11/);

  // Back to eco: everything released, the fixed views stay.
  const listenersOpen = page.listenerCount.value;
  page.win.dispatch('cnc-profile-change', { performance: 'eco', kind: 'cnc' });
  assert.equal(view.state().closed, true);
  assert.equal(gl.deleted.buffer, gl.created.buffer); assert.equal(gl.deleted.program, gl.created.program); assert.equal(gl.deleted.shader, gl.created.shader);
  assert.equal(gl.loseContext, true, 'context released');
  assert.equal(released, 1, 'inspection worker released');
  assert.equal(view.dialog.parentNode, null, 'dialog removed');
  assert.equal(page.listenerCount.value, 4, 'only the test’s own document listeners remain (were ' + listenersOpen + ')');
  assert.match(fallbacks[0], /Profil éco/); assert.deepEqual(closes, ['eco']);
  assert.equal(page.win.CNCPreviewGL.active(), false);

  // No WebGL: clean fallback, nothing left behind.
  page = createPage({ noWebGL: true }); fallbacks = [];
  view = page.win.CNCPreviewGL.open(meta, { onFallback: m => fallbacks.push(m) });
  assert.equal(view, null); assert.match(fallbacks[0], /WebGL indisponible.*Vues fixes conservées/);
  assert.equal(page.doc.body.children.length, 0); assert.equal(page.listenerCount.value, 0);
  // A shader refused: same.
  page = createPage({ badShader: true }); fallbacks = [];
  assert.equal(page.win.CNCPreviewGL.open(meta, { onFallback: m => fallbacks.push(m) }), null); assert.match(fallbacks[0], /shader refusé/);
  assert.equal(page.listenerCount.value, 0);
  // Context lost while open: closed, released, fallback.
  page = createPage(); fallbacks = [];
  view = page.win.CNCPreviewGL.open(meta, { onFallback: m => fallbacks.push(m) });
  view.canvas.dispatch('webglcontextlost', {});
  assert.equal(view.state().closed, true); assert.match(fallbacks[0], /Contexte WebGL perdu/); assert.equal(page.listenerCount.value, 0);
  // An old preview without a 3D path: refused with a message, no dialog.
  page = createPage(); fallbacks = [];
  assert.equal(page.win.CNCPreviewGL.open({ file: 'a.nc', fingerprint: 'x', path3d: null }, { onFallback: m => fallbacks.push(m) }), null);
  assert.match(fallbacks[0], /Vue 3D libre indisponible/); assert.equal(page.doc.body.children.length, 0);
  // Leaving the screen closes it.
  page = createPage();
  view = page.win.CNCPreviewGL.open(meta, {});
  page.win.dispatch('cnc-screen-change', 'menu'); assert.equal(view.state().closed, true); assert.equal(page.listenerCount.value, 0);

  // Never script-tagged: only cncProfile.loadAdvanced brings preview-gl.js.
  for (const name of ['index.html', 'simulation.html']) assert(!/preview-gl\.js/.test(fs.readFileSync(path.join(__dirname, 'touch', name), 'utf8')), name);

  // preview-3d.js: the "3D libre" button follows the profile; eco never loads the module.
  async function viewsPage(profile) {
    const ids = {}, observers = [];
    const mk = tag => {
      const n = { tagName: tag, children: [], attributes: {}, listeners: {}, hidden: false, textContent: '', parentNode: null, id: '', classList: { add() {} },
        appendChild(c) { c.parentNode = n; n.children.push(c); return c; }, insertBefore(c) { c.parentNode = n; n.children.push(c); return c; },
        setAttribute(k, v) { n.attributes[k] = String(v); if (k === 'src') observers.filter(o => o.t === n).forEach(o => Promise.resolve().then(() => o.fn())); },
        getAttribute(k) { return k in n.attributes ? n.attributes[k] : null; }, removeAttribute(k) { delete n.attributes[k]; },
        addEventListener(t, fn) { (n.listeners[t] = n.listeners[t] || []).push(fn); }, click() { (n.listeners.click || []).forEach(fn => fn()); } };
      Object.defineProperty(n, 'src', { get: () => n.attributes.src || '', set: v => n.setAttribute('src', v) });
      return n;
    };
    const outer = mk('div');
    for (const id of ['library-image', 'home-job-image']) { const box = mk('div'), img = mk('img'); img.id = id; box.appendChild(img); outer.appendChild(box); ids[id] = img; }
    const win = { document: { hidden: false, currentScript: { src: 'http://t/touch/preview-3d.js' }, getElementById: id => ids[id] || null, createElement: mk, addEventListener() {} },
      localStorage: { getItem: () => null, setItem() {} }, URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
      MutationObserver: class { constructor(fn) { this.fn = fn; } observe(t) { observers.push({ t, fn: this.fn }); } },
      requestIdleCallback() { return 1; }, CNCToolpath3D: T3, cncI18n: { t: s => s, html: s => s, locale: 'fr-FR' }, cncProfile: profile, setTimeout, clearTimeout, Date, Promise, Object, Error, String, JSON,
      listeners: {}, addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); } };
    win.window = win; vm.createContext(win);
    vm.runInContext(fs.readFileSync(path.join(__dirname, 'touch', 'preview-3d.js'), 'utf8'), win);
    const img = ids['library-image']; img.cncPreview = meta; img.src = 'data:image/png;base64,AAAA'; await tick(2);
    const bar = img.parentNode.children.find(c => c.attributes.role === 'group');
    return { win, img, bar, free: bar.children.find(b => b.textContent === '3D libre'), laser: bar.children.find(b => b.attributes['data-view'] === 'laser'), status: img.parentNode.children.find(c => c.attributes.role === 'status') };
  }
  let loads = [];
  const eco = { performance: () => 'eco', kind: () => 'cnc', machine: () => null, loadAdvanced: f => { loads.push(f); return Promise.reject(new Error('eco')); } };
  let vp = await viewsPage(eco);
  assert.equal(vp.free.hidden, true, 'eco: no free 3D button'); assert.equal(vp.laser.hidden, true, 'CNC: no laser view');
  vp.win.cncPreviewViews.openFree('library-image'); await tick(2);
  assert.deepEqual(loads, [], 'eco: preview-gl.js never requested'); assert.match(vp.status.textContent, /profil Performance requis/);
  // Without tablet-profile.js at all: eco.
  vp = await viewsPage(undefined); assert.equal(vp.free.hidden, true);
  // Performance: the button shows, the module is asked through loadAdvanced only.
  let mode = 'performance';
  const perf = { performance: () => mode, kind: () => 'laser', machine: () => ({ laser: { sMax: 1000 } }), loadAdvanced: f => { loads.push(f); return Promise.reject(new Error('script refusé')); } };
  vp = await viewsPage(perf);
  assert.equal(vp.free.hidden, false); assert.equal(vp.laser.hidden, false, 'laser machine: laser view offered (eco too)');
  vp.free.click(); await tick(5);
  assert.equal(JSON.stringify(loads), '[["preview-gl.js"]]');
  assert.match(vp.status.textContent, /Vue 3D libre indisponible : script refusé\. Vues fixes conservées\./, 'load failure: fixed views kept');
  mode = 'eco'; vp.win.listeners['cnc-profile-change'].forEach(fn => fn({ detail: { performance: 'eco' } }));
  assert.equal(vp.free.hidden, true, 'profile back to eco: button hidden');
  console.log('PASS free 3D view: presets and picking match the fixed views, render on change, DPR cap 1.5, ≤ 30 frames/s in gestures, gestures kept in the canvas (no jog reached), ' +
    'inspection simplified then exact, filters, clamps, released on eco/screen change/context loss, fallback without WebGL or shader, never loaded in eco nor script-tagged.');
})().catch(e => { console.error(e); process.exit(1); });
