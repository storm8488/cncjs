'use strict';
// Free 3D view (touch/preview-gl.js) with a WebGL stub in a small page. The page and WebGL stubs at
// the top are also used by measure-preview-gl.cjs. Events bubble from a node to the document unless stopped, so a test can
// check that a camera gesture never reaches a handler above the canvas (a jog control).
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');

// options.lineWidthRange (ALIASED_LINE_WIDTH_RANGE, default [1, 7.375] as the Surface Pro 3 reports),
// options.noAntialias (the context refuses antialiasing). log.calls: every drawArrays with the line
// width, the uniforms and the depth test of that call (GPU renderer of spec 4).
function createGL(options = {}) {
  const log = { created: { buffer: 0, program: 0, shader: 0 }, deleted: { buffer: 0, program: 0, shader: 0 }, draws: 0, uploads: [], lost: false, vertices: 0,
    calls: [], uniforms: {}, lineWidth: 1, depthTest: false, attrs: null, frames: 0 };
  const range = options.lineWidthRange || [1, 7.375];
  const gl = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4, ARRAY_BUFFER: 5, STATIC_DRAW: 6, COLOR_BUFFER_BIT: 7, FLOAT: 8, LINES: 9, NO_ERROR: 0,
    DEPTH_BUFFER_BIT: 10, DEPTH_TEST: 11, LEQUAL: 12, ALIASED_LINE_WIDTH_RANGE: 13, SCISSOR_TEST: 14,
    getParameter(p) { return p === 13 ? new Float32Array(range) : null; },
    getContextAttributes() { return { antialias: !!(log.attrs && log.attrs.antialias) && !options.noAntialias, depth: !!(log.attrs && log.attrs.depth) }; },
    lineWidth(w) { log.lineWidth = w; }, enable(c) { if (c === 11) log.depthTest = true; }, disable(c) { if (c === 11) log.depthTest = false; }, depthFunc() {}, clearDepth() {},
    uniform1f(u, v) { log.uniforms[u.name] = v; }, uniform3f(u, a, b, c) { log.uniforms[u.name] = [a, b, c]; },
    createShader() { log.created.shader++; return {}; }, shaderSource() {}, compileShader() {}, getShaderParameter() { return !options.badShader; },
    createProgram() { log.created.program++; return {}; }, attachShader() {}, linkProgram() {}, getProgramParameter() { return true; },
    getAttribLocation(_, n) { return n === 'p' ? 0 : n === 'c' ? 1 : 2; }, getUniformLocation(_, name) { return { name }; },
    createBuffer() { log.created.buffer++; return {}; }, bindBuffer() {}, bufferData(_, data) { log.uploads.push(data.length); log.vertices = data.length / 6; },
    viewport() {}, scissor() { log.scissors = (log.scissors || 0) + 1; }, clearColor() {}, clear() { log.frames++; }, useProgram() {}, enableVertexAttribArray() {}, vertexAttribPointer() {}, uniformMatrix4fv(_, __, m) { log.matrix = Array.from(m); },
    drawArrays(mode, first, count) {
      log.draws++; log.drawn = count;
      const u = log.uniforms;
      log.calls.push({ frame: log.frames, first, count, width: log.lineWidth, depth: log.depthTest, mode: u.mode, ack: u.a, shift: u.o && u.o.slice(), scale: u.s && u.s.slice(), solid: u.mode > 0.5 ? u.solid.slice() : null, ackColour: u.ack && u.ack.slice() });
    }, getError() { return 0; }, isContextLost() { return log.lost; },
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
    const names = () => n.className.split(/\s+/).filter(Boolean);
    n.classList = { contains: c => names().includes(c), add: c => { if (!names().includes(c)) n.className = names().concat(c).join(' '); },
      remove: c => { n.className = names().filter(x => x !== c).join(' '); }, toggle: (c, on) => { if (on === undefined ? !names().includes(c) : on) n.classList.add(c); else n.classList.remove(c); } };
    Object.defineProperty(n, 'textContent', { get: () => text, set: v => { text = String(v); n.children.forEach(c => { c.parentNode = null; }); n.children = []; } });
    if (n.tagName === 'CANVAS') {
      n.width = 300; n.height = 150;
      n.getContext = (kind, attrs) => {
        if (kind === '2d') { if (!options.with2d) return null; return n.ctx2d || (n.ctx2d = { calls: { lineTo: 0, stroke: 0, fillRect: 0 }, fillRect() { this.calls.fillRect++; }, beginPath() {}, moveTo() {}, lineTo() { this.calls.lineTo++; }, stroke() { this.calls.stroke++; } }); }
        if (kind !== 'webgl' && kind !== 'experimental-webgl') return null;
        if (options.noWebGL) return null;
        if (!n.glStub) { n.glStub = createGL(options); n.glStub.log.attrs = attrs || null; }
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
    cncI18n: { t: s => s, locale: 'fr-FR' }, Math, Date, JSON, Promise, Error, Float32Array, Float64Array, Uint8Array, Uint16Array, Int16Array, Int32Array, ArrayBuffer, Array, Object, Number, String, isFinite, parseInt,
    setTimeout: options.setTimeout || setTimeout, clearTimeout: options.clearTimeout || clearTimeout };
  // options.gpu: the GPU gate open (cncGpu as preview-3d.js exposes it after a hardware probe); options.clock: performance.now().
  if (options.gpu) win.cncGpu = { state: () => Object.assign({ checked: true, hardware: true, lost: false, renderer: 'stub', webgl2: true, antialias: true, lineWidth: [1, 7.375], maxTextureSize: 16384, reason: '' }, options.gpu === true ? {} : options.gpu), _contextLost() { win.gpuLost = (win.gpuLost || 0) + 1; } };
  if (options.clock) win.performance = { now: options.clock };
  if (options.v2) win.cncV2 = options.v2;
  if (options.requestIdleCallback) { win.requestIdleCallback = options.requestIdleCallback; win.cancelIdleCallback = options.cancelIdleCallback || (() => {}); }
  win.window = win; win.self = win;
  vm.createContext(win);
  for (const f of ['toolpath-3d.js', 'motion-estimate.js', 'preview-inspect.js', 'preview-gl.js'].concat(options.toolPosition ? ['tool-position.js'] : [])) vm.runInContext(fs.readFileSync(path.join(__dirname, 'touch', f), 'utf8'), win);
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

  // The capability probe also has a single live context: WebGL1 is released before WebGL2.
  {
    let contexts = 0, maximum = 0;
    const document = { createElement() { return { getContext() {
      contexts++; maximum = Math.max(maximum, contexts); let released = false;
      return { RENDERER: 1, ALIASED_LINE_WIDTH_RANGE: 2, MAX_TEXTURE_SIZE: 3,
        getParameter: p => p === 1 ? 'Intel' : p === 2 ? [1, 8] : 4096, getContextAttributes: () => ({ antialias: true }),
        getExtension: name => name === 'WEBGL_lose_context' ? { loseContext() { if (!released) contexts--; released = true; } } : null };
    } }; } };
    const probe = GL.probeGpu(document); assert.equal(probe.hardware, true); assert.equal(contexts, 0);
    assert.equal(maximum, 1, 'the probe never overlaps its contexts');
  }

  // v2: local loupe, explicit mode, constant-time prepared passes, bounded diagnostics and release.
  {
    const idle = [], seen = []; let selected = null, adapter = null, saved = null, alive = true, safeIdle = true, truncated = false;
    const provider = {
      attach(v) { adapter = v; }, detach(r) { seen.push(['detach', r]); adapter = null; },
      updatePath(p, facts) { seen.push(['path', p.count, facts.identity.key, facts.geometryKey]); },
      begin() { saved = adapter.camera(); return true; }, end() { adapter.restoreCamera(saved); adapter.setInspection(null); },
      pick(q) { seen.push(['pick', q.x, q.y]); if (truncated) adapter.setInspection(null); return { ready: true, truncated, candidates: [{ segment: 1, sourceLine: 6, passId: 1, nominalMm: { x: 25, y: 0, z: -1 }, approximate: true, toleranceMm: .1 }] }; },
      choose(id) { selected = { segment: id, sourceLine: 6, passId: 1, nominalMm: { x: 25, y: 0, z: -1 }, approximate: true, toleranceMm: .1, candidates: [id] }; adapter.setInspection(selected); return selected; },
      snapshot() { return { selection: selected }; }
    };
    const v2 = { gate: () => alive, state: () => ({ safeIdle }), use: () => provider,
      identity: { create: x => ({ key: JSON.stringify([x.file, x.fingerprint]), ...x }) } };
    let pg = createPage({ gpu: true, v2, dpr: 2, requestIdleCallback: fn => { idle.push(fn); return idle.length; } });
    pg.win.cncState = { get: () => ({ machine: { name: meta.file, fingerprint: meta.fingerprint, port: 'P', generation: 'g', revision: 1 } }) };
    let vv = pg.win.CNCPreviewGL.open(meta, { container: pg.doc.createElement('div'), loaded: true });
    assert.equal(typeof vv.attachInspector, 'function', 'v2 view connects to L0 inspect provider');
    pg.runFrames(0);
    while (idle.length) idle.shift()({ timeRemaining: () => 8 });
    assert.equal(vv.stats().passes.ready, true, 'pass bounds prepared at idle');
    assert(seen.some(x => x[0] === 'path' && x[2]), 'borrow decoded geometry with a fingerprint identity');
    const examine = byClass(vv.dialog, 'pgl-examine')[0]; assert(examine, 'inline Examiner is explicit');
    const beforeCam = JSON.stringify(vv.camera()); examine.click();
    vv.canvas.dispatch('pointerdown', { pointerId: 1, pointerType: 'pen', clientX: 350, clientY: 220 });
    vv.canvas.dispatch('pointercancel', { pointerId: 1, clientX: 350, clientY: 220 });
    assert(!seen.some(x => x[0] === 'pick'), 'pointercancel does not select');
    vv.canvas.dispatch('pointerdown', { pointerId: 2, pointerType: 'touch', clientX: 350, clientY: 220 });
    vv.canvas.dispatch('pointerup', { pointerId: 2, clientX: 350, clientY: 220 });
    pg.runFrames(16); assert(seen.some(x => x[0] === 'pick'), 'finger selects inline');
    assert(vv.canvas.glStub.log.scissors > 0, 'loupe reuses the same context with a clipped viewport');
    assert.equal(byClass(vv.dialog, 'pgl-inspection-crosshair')[0].hidden, false, 'inspection reticle is separate from tool');
    assert.match(byClass(vv.dialog, 'pgl-inspection-rows')[0].textContent, /nominal.*Ligne 6.*0,1 mm/, 'qualification, source line and known tolerance are explicit');
    truncated = true;
    vv.canvas.dispatch('pointerdown', { pointerId: 3, clientX: 350, clientY: 220 }); vv.canvas.dispatch('pointerup', { pointerId: 3, clientX: 350, clientY: 220 }); pg.runFrames(24);
    assert.equal(byClass(vv.dialog, 'pgl-inspection-crosshair')[0].hidden, true, 'incomplete search cannot choose implicitly');
    assert.equal(byClass(vv.dialog, 'pgl-candidate').length, 1, 'even a sole candidate from an incomplete search needs explicit choice');
    byClass(vv.dialog, 'pgl-inspection-return')[0].click(); pg.runFrames(32);
    assert.equal(JSON.stringify(vv.camera()), beforeCam, 'return restores entire camera');
    const oldKey = seen.filter(x => x[0] === 'path').slice(-1)[0][3];
    byClass(vv.dialog, 'pgl-toggle')[0].click();
    assert.notEqual(seen.filter(x => x[0] === 'path').slice(-1)[0][3], oldKey, 'filter participates in geometry identity');
    assert.equal(vv.stats().passes.ready, false, 'filter invalidates visible pass ranges');
    safeIdle = false; while (idle.length) idle.shift()({ timeRemaining: () => 8 });
    assert.equal(vv.stats().passes.ready, false, 'job cancels preparation, never publishes partial bounds');
    safeIdle = true; pg.runFrames(40); while (idle.length) idle.shift()({ timeRemaining: () => 8 });
    assert.equal(vv.stats().passes.ready, true, 'new idle preparation recovers after interruption');
    assert.equal(vv.setQuality('reduced').mode, 'reduced'); pg.runFrames(48); assert.equal(vv.stats().dpr, 1, 'reduced DPR');
    const measurement = vv.measure({ frames: 5, budgetMs: 1 });
    for (let i = 1; i <= 8; i++) pg.runFrames(48 + i * 16);
    const measured = await measurement; assert.equal(measured.samples, 5); assert.equal(measured.cancelled, false);
    assert.equal(pg.frames.length, 0, 'no permanent diagnostic frame loop');
    const pending = vv.measure({ frames: 20 });
    pg.doc.hidden = true; pg.doc.listeners.visibilitychange.forEach(fn => fn());
    assert.equal(vv.state().closed, true); assert.equal((await pending).cancelled, true, 'hidden cancels diagnostic');
    assert(seen.some(x => x[0] === 'detach')); assert.equal(vv.stats().passes.ready, false);
    assert.equal(vv.canvas.glStub.log.loseContext, true); assert.equal(pg.frames.length, 0);
    provider.attach = next => { adapter = next; next.setQuality('fixed'); };
    pg = createPage({ gpu: true, v2 });
    assert.equal(pg.win.CNCPreviewGL.open(meta, { container: pg.doc.createElement('div') }), null, 'a fixed preference can close synchronously during attach without a later upload');
    assert.equal(pg.win.CNCPreviewGL.active(), false); assert.equal(pg.frames.length, 0);
  }

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

  // No WebGL (Surface RT kiosk): the Canvas 2D renderer takes over, same camera and gestures, released on close.
  page = createPage({ noWebGL: true, with2d: true }); fallbacks = [];
  view = page.win.CNCPreviewGL.open(meta, { onFallback: m => fallbacks.push(m) });
  assert(view, 'opened without WebGL'); assert.equal(view.state().software, true); assert.deepEqual(fallbacks, []);
  view.paint(0); const ctx = view.canvas.ctx2d;
  assert(ctx.calls.lineTo > 0 && ctx.calls.fillRect > 0, 'drawn on the CPU');
  view.close('user'); assert.equal(view.state().closed, true); assert.equal(page.listenerCount.value, 0);
  // While a finger moves, at most SOFT_GESTURE_SEGMENTS segments; the whole path at rest.
  {
    const R = page.win.CNCPreviewGL, c = { getContext: () => ({ fillRect() {}, beginPath() {}, moveTo() {}, stroke() {}, lineTo() { this.n = (this.n || 0) + 1; } }) };
    const r = R.create2DRenderer(c), segments = 20000, d = new Float32Array(segments * 2 * 6);
    r.upload(d); const g = c.getContext();
    c.getContext = () => g; const r2 = R.create2DRenderer(c); r2.upload(d);
    g.n = 0; r2.draw(new Float32Array(16), 800, 450, true); assert(g.n > 0 && g.n <= 1500, 'light while turning: ' + g.n);
    g.n = 0; r2.draw(new Float32Array(16), 800, 450, false); assert.equal(g.n, segments, 'whole path at rest');
    r.release(); r2.release();
    // Colours alternating at every segment (depth shading): one stroke() per colour, not per change.
    const shaded = new Float32Array(1000 * 12); for (let i = 0; i < 1000; i++) for (const v of [0, 6]) shaded[i * 12 + v + 3] = (i % 4) / 4;
    let strokes = 0, lines = 0; const sc = { getContext: () => ({ fillRect() {}, beginPath() {}, moveTo() {}, stroke() { strokes++; }, lineTo() { lines++; } }) };
    const r3 = R.create2DRenderer(sc); r3.upload(shaded); r3.draw(new Float32Array(16), 800, 450, false);
    assert.equal(strokes, 4, 'one stroke per colour'); assert.equal(lines, 1000, 'every segment drawn'); r3.release();
  }
  // Neither WebGL nor Canvas 2D: clean fallback, nothing left behind.
  page = createPage({ noWebGL: true }); fallbacks = [];
  view = page.win.CNCPreviewGL.open(meta, { onFallback: m => fallbacks.push(m) });
  assert.equal(view, null); assert.match(fallbacks[0], /indisponibles.*Vues fixes conservées/);
  assert.equal(page.doc.body.children.length, 0); assert.equal(page.listenerCount.value, 0);
  // A shader refused and no Canvas 2D: same.
  page = createPage({ badShader: true }); fallbacks = [];
  assert.equal(page.win.CNCPreviewGL.open(meta, { onFallback: m => fallbacks.push(m) }), null); assert.match(fallbacks[0], /indisponibles/);
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

  // Inline (preview frame): the camera buttons fold behind « Vues »; a preset folds them again.
  page = createPage();
  const frameBox = page.doc.createElement('div');
  view = page.win.CNCPreviewGL.open(meta, { container: frameBox });
  const tools = view.dialog.children.find(c => /pgl-tools/.test(c.className));
  assert(/pgl-inline/.test(view.dialog.className) && view.dialog.parentNode === frameBox, 'drawn in the frame');
  const foldButton = tools.children.find(c => c.className === 'pgl-fold');
  assert.equal(foldButton.textContent, 'Vues'); assert.equal(tools.classList.contains('is-folded'), true, 'folded at first');
  foldButton.click(); assert.equal(tools.classList.contains('is-folded'), false); assert.equal(foldButton.getAttribute('aria-expanded'), 'true');
  tools.children.find(c => c.getAttribute('data-preset') === 'top').click();
  assert.equal(tools.classList.contains('is-folded'), true, 'a preset folds the buttons again');
  view.close('test');
  // The large view has no fold: every camera button shown.
  page = createPage(); view = page.win.CNCPreviewGL.open(meta, {});
  assert(!view.dialog.children.find(c => /pgl-tools/.test(c.className)).children.some(c => c.className === 'pgl-fold')); view.close('test');

  // Never script-tagged: only cncProfile.loadAdvanced brings preview-gl.js.
  for (const name of ['index.html', 'simulation.html']) assert(!/preview-gl\.js/.test(fs.readFileSync(path.join(__dirname, 'touch', name), 'utf8')), name);

  // preview-3d.js: the "3D libre" button follows the profile; eco never loads the module.
  async function viewsPage(profile, extra) {
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
    Object.assign(win, extra || {}); win.window = win; vm.createContext(win);
    vm.runInContext(fs.readFileSync(path.join(__dirname, 'touch', 'preview-3d.js'), 'utf8'), win);
    const img = ids['library-image']; img.cncPreview = meta; img.src = 'data:image/png;base64,AAAA'; await tick(2);
    const bar = img.parentNode.children.find(c => c.attributes.role === 'group');
    return { win, img, bar, free: bar.children.find(b => b.textContent === '3D libre'), laser: bar.children.find(b => b.attributes['data-view'] === 'laser'), status: img.parentNode.children.concat(img.parentNode.parentNode.children).find(c => c.attributes.role === 'status') };
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
  let mode = 'performance', kind = 'laser';
  const perf = { performance: () => mode, kind: () => kind, machine: () => ({ laser: { sMax: 1000 } }), loadAdvanced: f => { loads.push(f); return Promise.reject(new Error('script refusé')); } };
  vp = await viewsPage(perf);
  // A laser machine has the laser view only: no free 3D view, even in Performance.
  assert.equal(vp.free.hidden, true, 'laser: no free 3D'); assert.equal(vp.laser.hidden, false, 'laser machine: laser view offered (eco too)');
  assert.deepEqual(loads, [], 'laser: preview-gl.js not requested');
  // CNC in Performance: the preview itself becomes the free view (no button, no dialog), loaded once.
  kind = 'cnc'; vp = await viewsPage(perf); await tick(5);
  assert.equal(vp.free.hidden, true, 'no 3D libre button: the preview is the free view'); assert.equal(vp.laser.hidden, true);
  assert.equal(JSON.stringify(loads), '[["preview-gl.js"]]', 'loaded once for the inline view');
  assert.equal(vp.bar.hidden, false, 'load failure: the fixed view buttons come back');
  assert.match(vp.status.textContent, /Vue 3D libre indisponible : script refusé\. Vues fixes conservées\./, 'load failure: fixed views kept');
  mode = 'eco'; vp.win.listeners['cnc-profile-change'].forEach(fn => fn({ detail: { performance: 'eco' } }));
  assert.equal(vp.free.hidden, true, 'profile back to eco: button hidden');
  // « Agrandir » over the inline view: the free view opens in large (no container), the inline one
  // comes back when it closes; the flat image viewer is not reached.
  mode = 'performance'; kind = 'cnc';
  const opened = []; let currentGL = null;
  const stubGL = { open(m, o) { if (currentGL) currentGL.close('replaced'); const h = { o, close(r) { if (currentGL === h) currentGL = null; if (o.onClose) o.onClose(r); } }; currentGL = h; opened.push(o.container ? 'inline' : 'large'); return h; } };
  const ready = { performance: () => mode, kind: () => kind, machine: () => null, loadAdvanced: () => Promise.resolve() };
  vp = await viewsPage(ready, { CNCPreviewGL: stubGL }); await tick(5);
  assert.deepEqual(opened, ['inline']);
  const flat = []; let stopped = false;
  vp.img.parentNode.listeners.click.forEach(fn => fn({ target: { closest: sel => (sel === '.preview-open' ? {} : null) }, stopPropagation() { stopped = true; }, preventDefault() {} }));
  await tick(5);
  assert.deepEqual(opened, ['inline', 'large'], 'Agrandir opens the large free view'); assert.equal(stopped, true, 'flat viewer not reached');
  currentGL.close('user'); await tick(5);
  assert.deepEqual(opened, ['inline', 'large', 'inline'], 'inline view back after the large one closes');
  // A click elsewhere in the frame is left alone.
  stopped = false; vp.img.parentNode.listeners.click.forEach(fn => fn({ target: { closest: () => null }, stopPropagation() { stopped = true; }, preventDefault() {} }));
  assert.equal(stopped, false); assert.equal(flat.length, 0);
  // Eco while the large view loads: nothing opens; back in Performance the inline view returns.
  opened.length = 0; currentGL = null; let calls = 0, release = null;
  const slowLoad = { performance: () => mode, kind: () => 'cnc', machine: () => null, loadAdvanced: () => (++calls === 2 ? new Promise(r => { release = r; }) : Promise.resolve()) };
  vp = await viewsPage(slowLoad, { CNCPreviewGL: stubGL }); await tick(5);
  vp.img.parentNode.listeners.click.forEach(fn => fn({ target: { closest: () => ({}) }, stopPropagation() {}, preventDefault() {} }));
  mode = 'eco'; vp.win.listeners['cnc-profile-change'].forEach(fn => fn({ detail: { performance: 'eco' } }));
  currentGL && currentGL.close('eco'); release(); await tick(5);
  assert.deepEqual(opened, ['inline'], 'no large view opened after eco');
  mode = 'performance'; vp.win.listeners['cnc-profile-change'].forEach(fn => fn({ detail: { performance: 'performance' } })); await tick(5);
  assert.deepEqual(opened, ['inline', 'inline'], 'inline view back (freeOpen released)');
  // ---------------- GPU rendering (PERFORMANCE-UI-SPEC.md 4): only under the GPU gate ----------------
  {
    const plain = v => JSON.parse(JSON.stringify(v));
    const frameCalls = g => g.calls.filter(c => c.frame === g.frames);
    page = createPage({ dpr: 3, gpu: true });
    view = page.win.CNCPreviewGL.open(meta, { container: page.doc.createElement('div') });
    const g = view.canvas.glStub.log;
    assert.equal(g.attrs.antialias, true, 'antialiasing asked'); assert.equal(g.attrs.depth, true, 'depth buffer for the depth test');
    assert.equal(g.attrs.failIfMajorPerformanceCaveat, true); assert.equal(g.attrs.powerPreference, 'low-power', 'WebGL1, low-power, as before');
    let st = view.state();
    assert.equal(st.gpu, true); assert.equal(st.software, false); assert.equal(st.antialias, true); assert.deepEqual(plain(st.lineWidth), [1, 7.375]);
    assert.equal(st.geometry, 'simplified'); assert.equal(st.segments, T3.decode(meta.path3d).count - 1);
    assert.equal(view.canvas.width, 1600, 'device pixel ratio capped at 2 (800 px × 2)'); assert.equal(st.dpr, 2);
    assert.equal(page.runFrames(1000), 1);
    let calls = frameCalls(g);
    assert(calls.every(c => c.width >= 1 && c.width <= 7.375), 'line widths within ALIASED_LINE_WIDTH_RANGE');
    const pathCalls = calls.filter(c => c.ackColour && c.mode === 0 && c.ack === -1 && c.count > 6);
    assert.deepEqual(pathCalls.map(c => c.width).sort(), [2, 4], 'rapids 1 px, work 2 px, × DPR 2');
    assert(calls.some(c => c.depth === true), 'depth test on for the path');
    assert(/clamp\(d\*0\.5\+0\.5/.test(require('node:fs').readFileSync(require('node:path').join(__dirname, 'touch', 'preview-gl.js'), 'utf8')), 'depth fade in the fragment shader');
    assert.notEqual(g.matrix[10], 0, 'depth row in the matrix (depth test and fade)');
    assert.equal(page.frames.length, 0, 'no frame loop at rest');
    // A gesture: one frame per animation frame (target 60 frames/s), no 33 ms throttle.
    const frames0 = g.frames, stats0 = view.stats();
    view.canvas.dispatch('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
    for (let i = 1; i <= 6; i++) { const e = view.canvas.dispatch('pointermove', { pointerId: 1, clientX: 100 + i * 5, clientY: 100 }); assert(e.defaultPrevented && e.propagationStopped, 'gesture kept in the canvas'); page.runFrames(2000 + i * 16); }
    assert.equal(g.frames, frames0 + 6, 'a frame every 16 ms during the gesture');
    assert.equal(view.stats().gestureFrames, stats0.gestureFrames + 6);
    view.canvas.dispatch('pointerup', { pointerId: 1, clientX: 130, clientY: 100 }); page.runFrames(2200);
    const s1 = view.stats();
    assert(s1.frames >= 8 && s1.lastPaintMs >= 0 && s1.maxPaintMs >= s1.lastPaintMs && s1.uploads >= 3 && s1.uploadBytes > 0 && s1.dpr === 2 && s1.canvas.width === 1600, JSON.stringify(s1));
    // Release: every buffer, the program, the context, the listeners.
    view.close('user');
    assert.equal(g.deleted.buffer, g.created.buffer); assert.equal(g.deleted.program, g.created.program); assert.equal(g.deleted.shader, g.created.shader); assert.equal(g.loseContext, true);
    assert.equal(page.listenerCount.value, 0);

    // The kiosk at scale 1.58: DPR 1.58 kept (≤ 2).
    page = createPage({ dpr: 1.58, gpu: true }); view = page.win.CNCPreviewGL.open(meta, {});
    assert.equal(view.canvas.width, Math.round(800 * 1.58)); view.close('test');
    // A driver allowing 1 px only: every line at 1 px, and state() says so.
    page = createPage({ dpr: 2, gpu: true, lineWidthRange: [1, 1] }); view = page.win.CNCPreviewGL.open(meta, {}); page.runFrames(10);
    assert(view.canvas.glStub.log.calls.every(c => c.width === 1)); assert.deepEqual(plain(view.state().lineWidth), [1, 1]); view.close('test');
    // Antialiasing refused by the context: said in state(), the view goes on.
    page = createPage({ gpu: true, noAntialias: true }); view = page.win.CNCPreviewGL.open(meta, {}); page.runFrames(10);
    assert.equal(view.state().antialias, false); assert.equal(view.state().gpu, true); assert(view.canvas.glStub.log.draws > 0); view.close('test');

    // Gate closed (no cncGpu, a software probe, or a context lost since): exactly the previous rendering.
    for (const gate of [null, { hardware: false, reason: 'software' }, { lost: true, reason: 'context-lost' }]) {
      page = gate ? createPage({ dpr: 3, gpu: gate }) : createPage({ dpr: 3 });
      view = page.win.CNCPreviewGL.open(meta, {});
      const lg = view.canvas.glStub.log;
      assert.equal(view.canvas.width, 1200, 'DPR 1.5 without the gate'); assert.equal(lg.attrs.antialias, false); assert.equal(lg.attrs.depth, false);
      assert.equal(view.state().gpu, false);
      page.runFrames(1000); const d0 = lg.draws;
      view.canvas.dispatch('pointerdown', { pointerId: 1, clientX: 1, clientY: 1 }); view.canvas.dispatch('pointermove', { pointerId: 1, clientX: 20, clientY: 1 });
      page.runFrames(1010); assert.equal(lg.draws, d0, '33 ms between gesture frames without the gate'); page.runFrames(1040); assert.equal(lg.draws, d0 + 1);
      view.close('test');
    }

    // Released at each cause of closing: close(), screen change, eco, screen lock, pagehide, context loss.
    const causes = [['user', v => v.close('user')], ['screen', p => p.win.dispatch('cnc-screen-change', 'menu')], ['eco', p => p.win.dispatch('cnc-profile-change', { performance: 'eco' })],
      ['lock', p => p.win.dispatch('cnc-screen-lock', true)], ['pagehide', p => p.win.dispatch('pagehide', {})], ['fallback', (p, v) => v.canvas.dispatch('webglcontextlost', {})]];
    for (const [reason, act] of causes) {
      page = createPage({ gpu: true }); let srcReleased = 0, closed = [];
      view = page.win.CNCPreviewGL.open(meta, { container: page.doc.createElement('div'), live: { progress: true, tool: true }, source: { stateAt: () => Promise.resolve(null), release() { srcReleased++; } }, onClose: r => closed.push(r),
        overlays: [{ id: 'b', kind: 'box', min: [0, 0, 0], max: [5, 5, 5], colour: 'ok' }, { id: 's', kind: 'segments', points: [0, 0, 0, 1, 1, 1], colour: 'warn' }] });
      page.runFrames(10); view.inspect(1);
      const lg = view.canvas.glStub.log;
      act(reason === 'user' || reason === 'fallback' ? (reason === 'user' ? view : page) : page, view);
      assert.deepEqual(closed, [reason], reason);
      assert.equal(lg.deleted.buffer, lg.created.buffer, reason + ': buffers'); assert.equal(lg.deleted.program, lg.created.program, reason + ': program');
      assert.equal(lg.loseContext, true, reason + ': context'); assert.equal(page.listenerCount.value, 0, reason + ': listeners'); assert.equal(srcReleased, 1, reason + ': inspection worker');
      assert.deepEqual(plain(view.state().overlays), [], reason + ': overlays'); assert.equal(page.frames.length, 0, reason + ': no frame left');
      if (reason === 'fallback') assert.equal(page.win.gpuLost, 1, 'a lost context closes the gate (cncGpu)');
    }
  }
  // ---------------- Full geometry (spec 3.8, Q7): the whole program in the worker of preview-inspect.js ----------------
  {
    const PIN = require('./touch/preview-inspect.js');
    // Arcs cut at a sagitta of 0.01 mm at most; sender lines as path3d counts them.
    const circle = PIN.buildGeometry('G21 G90\nG0 X10 Y0 Z1\nG1 Z-1 F100\nG2 X10 Y0 I-10 J0\nG0 Z5\nM2');
    let worst = 0;
    for (let i = 3; i < circle.count - 1; i++) {
      const ax = circle.positions[i * 3 - 3], ay = circle.positions[i * 3 - 2], bx = circle.positions[i * 3], by = circle.positions[i * 3 + 1];
      assert(Math.abs(Math.hypot(bx, by) - 10) < 1e-4, 'arc points on the circle');
      const half = Math.hypot(bx - ax, by - ay) / 2; worst = Math.max(worst, 10 - Math.sqrt(100 - half * half));
    }
    assert(worst <= 0.0101, 'sagitta ≤ 0.01 mm: ' + worst);
    const g = PIN.buildGeometry(code), p3 = T3.decode(meta.path3d);
    assert.equal(g.lines[g.count - 1], p3.lines[p3.count - 1], 'same sender line numbering as path3d');
    assert.equal(g.rapid[0], 1); assert(g.positions instanceof Float32Array && g.lines instanceof Float32Array && g.rapid instanceof Uint8Array);
    assert.deepEqual(PIN.buildGeometry(code, { cap: 3 }), { tooLong: true, segments: g.segments }, 'over the cap: the count only');
    assert.equal(PIN.GEOMETRY_CAP, 500000, 'design cap of Q7');

    // preview-inspect.js run as a worker (vm): the geometry message, typed arrays transferred.
    function workerClass(log) {
      return class {
        constructor(url) {
          log.urls.push(url); const outer = this;
          const ctx = { Math, Promise, Error, JSON, Float32Array, Float64Array, Uint8Array, Int16Array, Int32Array, Array, Object, Number, String, isFinite, parseInt, setTimeout,
            postMessage(m, transfer) { log.transfer = transfer; Promise.resolve().then(() => { if (outer.onmessage) outer.onmessage({ data: m }); }); },
            importScripts(...names) { names.forEach(n => vm.runInContext(fs.readFileSync(path.join(__dirname, 'touch', n.split('?')[0]), 'utf8'), ctx)); } };
          ctx.self = ctx; vm.createContext(ctx); this.ctx = ctx;
          vm.runInContext(fs.readFileSync(path.join(__dirname, 'touch', 'preview-inspect.js'), 'utf8'), ctx);
        }
        postMessage(m) { log.posted.push(m.type); Promise.resolve().then(() => this.ctx.onmessage({ data: m })); }
        terminate() { log.terminated++; }
      };
    }
    const glog = { urls: [], posted: [], terminated: 0 }, reads = [];
    const fetchProgram = file => { reads.push(file); return Promise.resolve({ blob: { text: () => Promise.resolve(JSON.stringify({ data: code })) }, fingerprint: 'SHA256:AA11' }); };
    page = createPage({ gpu: true });
    view = page.win.CNCPreviewGL.open(meta, { container: page.doc.createElement('div'), fullGeometry: true, Worker: workerClass(glog), fetchProgram });
    assert.equal(view.state().geometry, 'simplified'); assert.equal(view.state().geometryPending, true);
    page.runFrames(1); const up0 = view.stats().uploads;
    await tick(5);
    let st = view.state();
    assert.equal(st.geometry, 'full'); assert.equal(st.segments, g.segments); assert.deepEqual(reads, ['piece.nc'], 'read once');
    assert.match(glog.urls[0], /^preview-inspect\.js\?v=/); assert.deepEqual(glog.posted, ['geometry']); assert.equal(glog.transfer.length, 3, 'positions, lines, rapid transferred');
    assert.equal(glog.terminated, 1, 'worker ended once the geometry is back');
    assert.equal(view.stats().uploads, up0 + 2, 'path and extras sent again, once');
    assert.equal(page.frames.length, 1); page.runFrames(2);
    assert.match(byClass(view.dialog, 'pgl-foot')[0].textContent, /^Géométrie complète \(\d+ segments, arcs à 0,01 mm\)/);
    // Kept for the loaded program from one screen to the other: reopened without a read.
    page.win.dispatch('cnc-screen-change', 'menu'); assert.equal(view.state().closed, true);
    view = page.win.CNCPreviewGL.open(meta, { container: page.doc.createElement('div'), fullGeometry: true, Worker: workerClass(glog), fetchProgram });
    assert.equal(view.state().geometry, 'full', 'from the cache'); assert.deepEqual(reads, ['piece.nc'], 'not read again');
    view.close('test');
    assert.equal(page.listenerCount.value, 2, 'only the cache listeners (eco, pagehide) remain while it is kept');
    // Eco drops it (and its listeners).
    page.win.dispatch('cnc-profile-change', { performance: 'eco' });
    assert.equal(page.listenerCount.value, 0);
    view = page.win.CNCPreviewGL.open(meta, { container: page.doc.createElement('div') });
    assert.equal(view.state().geometry, 'simplified', 'dropped in eco'); view.close('test');
    // Not asked without fullGeometry (Fichiers, Suivi during a job) nor without the gate.
    reads.length = 0;
    view = page.win.CNCPreviewGL.open(meta, { container: page.doc.createElement('div'), Worker: workerClass(glog), fetchProgram }); await tick(5);
    assert.deepEqual(reads, []); assert.equal(view.state().geometry, 'simplified'); view.close('test');
    let soft = createPage({});
    view = soft.win.CNCPreviewGL.open(meta, { fullGeometry: true, Worker: workerClass(glog), fetchProgram }); await tick(5);
    assert.deepEqual(reads, [], 'no read without the GPU gate'); view.close('test');
    // Another version of the file on the server: simplified kept, nothing cached.
    const changed = file => { reads.push(file); return Promise.resolve({ blob: { text: () => Promise.resolve(JSON.stringify({ data: code })) }, fingerprint: 'sha256:bb' }); };
    view = page.win.CNCPreviewGL.open(meta, { container: page.doc.createElement('div'), fullGeometry: true, Worker: workerClass(glog), fetchProgram: changed }); await tick(5);
    assert.equal(view.state().geometry, 'simplified'); assert.equal(view.state().geometryPending, false); view.close('test');
    assert.equal(page.listenerCount.value, 0, 'nothing cached');
    // Over the cap: simplified, and the reason with the count.
    const realGeometry = page.win.CNCPreviewInspect.geometry;
    page.win.CNCPreviewInspect.geometry = () => ({ promise: Promise.resolve({ tooLong: true, segments: 612345, path: null }), cancel() {} });
    view = page.win.CNCPreviewGL.open(meta, { container: page.doc.createElement('div'), fullGeometry: true }); await tick(2);
    assert.equal(view.state().geometry, 'simplified'); assert.equal(view.state().geometryReason, 'too-long'); assert.equal(view.state().geometryTotal, 612345); view.close('test');
    // Closed while reading: the worker is ended, nothing kept.
    page.win.CNCPreviewInspect.geometry = realGeometry;
    let slow = null; const slowFetch = () => new Promise(r => { slow = r; });
    const before = glog.terminated;
    view = page.win.CNCPreviewGL.open(meta, { container: page.doc.createElement('div'), fullGeometry: true, Worker: workerClass(glog), fetchProgram: slowFetch });
    view.close('screen'); slow({ blob: { text: () => Promise.resolve(JSON.stringify({ data: code })) }, fingerprint: 'sha256:aa11' }); await tick(5);
    assert.equal(glog.terminated, before, 'no worker started after the close'); assert.equal(page.listenerCount.value, 0);
    // A lost context drops the cache too.
    view = page.win.CNCPreviewGL.open(meta, { container: page.doc.createElement('div'), fullGeometry: true, Worker: workerClass(glog), fetchProgram }); await tick(5);
    assert.equal(view.state().geometry, 'full'); view.canvas.dispatch('webglcontextlost', {});
    assert.equal(page.listenerCount.value, 0, 'cache dropped on a lost context');
  }
  console.log('PASS free 3D view: v2 inline inspection/loupe/camera restore, explicit truncated choices, idle pass invalidation, bounded diagnostic and hidden/fixed cleanup; presets and picking match the fixed views, render on change, DPR cap 1.5, ≤ 30 frames/s in gestures, gestures kept in the canvas (no jog reached), ' +
    'inspection simplified then exact, filters, clamps, inline buttons folded behind Vues, Agrandir opens the large free view, released on eco/screen change/context loss, Canvas 2D without WebGL (light while turning), clean fallback without either, never loaded in eco nor script-tagged; ' +
    'GPU gate open: antialiasing and depth asked, DPR ≤ 2, a frame per animation frame in gestures, widths × DPR bounded by the line width range (1 px driver), antialias refusal reported, previous rendering when the gate is closed, everything released at the six closing causes; ' +
    'full geometry: arcs at 0.01 mm, path3d line numbering, cap 500 000 (count only), read once in a worker at rest and only with the gate, kept by fingerprint across screens, dropped in eco / on a lost context / for another version, cancelled on close.');
})().catch(e => { console.error(e); process.exit(1); });
