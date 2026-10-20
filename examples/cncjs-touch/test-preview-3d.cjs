'use strict';
// Preview views (preview-3d.js) in a small fake page: selector, remembered choice,
// asked view first then the others only when idle, cache, old previews, errors,
// both the OffscreenCanvas worker (preview-3d-worker.js run for real) and the page fallback.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const T3 = require('./touch/toolpath-3d.js');
global.self = { CNCToolpath3D: T3 };
const { scan } = require('./touch/library-preview.js');
const dir = path.join(__dirname, 'touch');
const tick = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));

async function pathOf(code) {
  const first = await scan(code), z = first.zBounds, b = first.bounds;
  const builder = T3.createBuilder({ bounds: [b[0], b[1], z[0], b[2], b[3], z[1]] });
  await scan(code, null, null, null, null, builder.move);
  return { path3d: builder.finish(first.lines), zBounds: z };
}
function fakeContext(log) {
  return { fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, arc() {}, setLineDash() {},
    stroke() { log.strokes++; }, fillText(text) { log.texts.push(text); } };
}

function page(options = {}) {
  const observers = [], idle = [], storage = new Map(options.saved ? [['cncjs-touch-preview-view-v1', options.saved]] : []);
  const log = { strokes: 0, texts: [], workers: [], posted: [], urls: 0, revoked: [] };
  function element(tag, id) {
    const el = { tagName: tag.toUpperCase(), id: id || '', children: [], parentNode: null, attributes: {}, listeners: {}, hidden: false, textContent: '', title: '',
      classList: { set: new Set(), add(n) { this.set.add(n); }, contains(n) { return this.set.has(n); } },
      appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
      setAttribute(name, value) { this.attributes[name] = String(value); if (name === 'src') notify(this); },
      getAttribute(name) { return name in this.attributes ? this.attributes[name] : null; },
      removeAttribute(name) { delete this.attributes[name]; if (name === 'src') notify(this); },
      addEventListener(name, fn) { (this.listeners[name] = this.listeners[name] || []).push(fn); },
      click() { (this.listeners.click || []).forEach(fn => fn()); } };
    Object.defineProperty(el, 'src', { get() { return el.attributes.src || ''; }, set(v) { el.setAttribute('src', v); } });
    if (tag === 'canvas') { el.getContext = () => fakeContext(log); el.toBlob = cb => setTimeout(() => cb({ size: 1 }), 0); }
    return el;
  }
  function notify(target) { observers.filter(o => o.target === target).forEach(o => Promise.resolve().then(() => o.fn([]))); }
  const ids = {};
  for (const [imageId, boxId] of [['library-image', 'files-box'], ['home-job-image', 'home-box']]) {
    const box = element('div', boxId), img = element('img', imageId); box.appendChild(img); ids[imageId] = img; ids[boxId] = box;
  }
  const document = { hidden: false, listeners: {}, currentScript: { src: 'http://tablet/touch/preview-3d.js?v=x' },
    getElementById: id => ids[id] || null, createElement: tag => element(tag),
    addEventListener(name, fn) { (this.listeners[name] = this.listeners[name] || []).push(fn); } };
  const window = {
    document, localStorage: { getItem: k => storage.has(k) ? storage.get(k) : null, setItem: (k, v) => storage.set(k, String(v)) },
    URL: { createObjectURL: () => 'blob:http://tablet/' + (++log.urls), revokeObjectURL: url => log.revoked.push(url) },
    MutationObserver: class { constructor(fn) { this.fn = fn; } observe(target) { this.target = target; observers.push(this); } },
    requestIdleCallback: fn => { idle.push(fn); return idle.length; },
    CNCToolpath3D: T3, cncI18n: { t: s => s, html: s => s, locale: 'fr-FR' }, setTimeout, clearTimeout, Date
  };
  if (options.worker) window.Worker = class {
    constructor(url) {
      assert.match(url, /^http:\/\/tablet\/touch\/preview-3d-worker\.js\?v=view\d+$/);
      log.workers.push(this);
      const outer = this, context = {
        setTimeout, Date, Math, Promise, Error, Float64Array, Uint8Array, Int16Array,
        OffscreenCanvas: options.offscreen === false ? undefined : class {
          constructor(w, h) { this.width = w; this.height = h; }
          getContext() { return fakeContext(log); }
          convertToBlob() { return options.blobFailure ? Promise.reject(Error('encodage refusé')) : Promise.resolve({ size: 2, type: 'image/png' }); }
        },
        postMessage(message) { setTimeout(() => { if (!outer.terminated && outer.onmessage) outer.onmessage({ data: message }); }, 0); },
        importScripts(...names) { names.forEach(name => vm.runInContext(fs.readFileSync(path.join(dir, name.split('?')[0]), 'utf8'), context)); }
      };
      context.self = context; vm.createContext(context); this.context = context;
      vm.runInContext(fs.readFileSync(path.join(dir, 'preview-3d-worker.js'), 'utf8'), context);
    }
    postMessage(message) { log.posted.push(message.type + (message.view ? ':' + message.view : '')); setTimeout(() => this.context.onmessage({ data: message }), 0); }
    terminate() { this.terminated = true; }
  };
  window.window = window;
  vm.createContext(window);
  vm.runInContext(fs.readFileSync(path.join(dir, 'preview-3d.js'), 'utf8'), window);
  const files = ids['library-image'], home = ids['home-job-image'];
  return { window, document, log, idle, storage, files, home, ids,
    bar: img => img.parentNode.children.find(c => c.attributes.role === 'group'),
    status: img => img.parentNode.children.find(c => c.attributes.role === 'status'),
    button: (img, view) => img.parentNode.children.find(c => c.attributes.role === 'group').children.find(b => b.attributes['data-view'] === view),
    show(img, file, preview) { img.cncPreview = preview ? Object.assign({ file }, preview) : null; img.src = 'data:image/png;base64,' + Buffer.from(file).toString('base64'); },
    async runIdle() { while (idle.length) { idle.shift()({ timeRemaining: () => 50 }); await settle(); } },
    async settle() { await settle(); }
  };
  async function settle() { for (let i = 0; i < 40; i++) await tick(1); }
}

(async () => {
  const pocket = await pathOf('G21 G90\nG0 Z5\nG0 X10 Y10\nG1 Z-1 F100\nG1 X50\nG1 Y30\nG1 Z-2\nG1 X10\nG0 Z5\nM2');
  const other = await pathOf('G21 G90\nG0 X0 Y0\nG1 Z-0.5 F100\nG2 X0 Y0 I8 J0\nG0 Z3\nM2');

  // OffscreenCanvas worker.
  let p = page({ worker: true });
  assert.equal(p.bar(p.files).children.length, 5); assert.equal(p.bar(p.home).children.length, 5);
  assert.deepEqual(p.bar(p.files).children.map(b => b.textContent), ['2D', 'Iso', 'Face', 'Côté', 'Dessus']);
  assert.equal(p.button(p.files, '2d').attributes['aria-pressed'], 'true', '2D by default');
  p.show(p.files, 'a.nc', pocket); await p.settle();
  assert.match(p.files.src, /^data:/); assert.equal(p.files.cncView, null); assert.equal(p.log.workers.length, 0, 'nothing computed while 2D is shown');
  p.button(p.files, 'iso').click();
  assert.equal(p.storage.get('cncjs-touch-preview-view-v1'), 'iso', 'choice remembered');
  assert.equal(p.status(p.files).textContent, 'Calcul de la vue 3D…'); assert.match(p.files.src, /^data:/, '2D stays until the view is ready');
  await p.settle();
  assert.match(p.files.src, /^blob:/); assert.equal(p.files.cncView.view, 'iso'); assert.equal(p.files.cncView.projection.version, 2); assert.equal(p.files.cncView.src, p.files.src);
  assert.equal(p.status(p.files).hidden, true);
  assert.deepEqual(p.log.posted, ['render:iso'], 'only the asked view, at once');
  assert(p.log.texts.includes('Vue isométrique') && p.log.strokes > 0, 'drawn in the worker with its title');
  // The other views wait for an idle period, then are drawn one by one.
  assert.equal(p.idle.length, 1);
  await p.runIdle();
  assert.deepEqual(p.log.posted, ['render:iso', 'render:front', 'render:side', 'render:top']);
  assert.deepEqual(Array.from(p.window.cncPreviewViews.cached()[0].views).sort(), ['front', 'iso', 'side', 'top']);
  // Kept: switching views draws nothing again.
  const before = p.log.posted.length;
  p.button(p.home, 'top').click(); await p.settle();
  assert.equal(p.files.cncView.view, 'top'); assert.equal(p.button(p.files, 'top').attributes['aria-pressed'], 'true', 'both previews follow the choice');
  assert.equal(p.log.posted.length, before);
  // Suivi shows the same file: the cached views are used there too.
  p.show(p.home, 'a.nc', pocket); await p.settle();
  assert.equal(p.home.cncView.view, 'top'); assert.equal(p.log.posted.length, before);
  // Another file: its 2D image first, the asked view, then the others at rest.
  p.show(p.home, 'b.nc', other);
  assert.notEqual(p.home.cncView.src, p.home.getAttribute('src'), 'the old projection names the old image');
  await Promise.resolve(); assert.equal(p.home.cncView, null, 'a new image never keeps the old projection');
  await p.settle();
  assert.equal(p.home.cncView.view, 'top'); assert.equal(p.log.posted.at(-1), 'render:top');
  // The asked view goes before a view drawn in the background.
  p.idle.shift()({ timeRemaining: () => 50 });
  assert.equal(p.log.posted.at(-1), 'render:iso');
  p.button(p.home, 'side').click();
  assert.deepEqual(p.log.posted.slice(-2), ['cancel', 'render:side']);
  await p.settle(); assert.equal(p.home.cncView.view, 'side');
  // Back to 2D: the stored image and its own projection.
  p.button(p.files, '2d').click(); await p.settle();
  assert.match(p.files.src, /^data:/); assert.equal(p.files.cncView, null); assert.equal(p.home.cncView, null);
  // An old preview (no 3D path): the 2D image stays, with a hint.
  p.button(p.files, 'iso').click();
  p.show(p.files, 'old.nc', { projection: { version: 1 } }); await p.settle();
  assert.match(p.files.src, /^data:/); assert.equal(p.files.cncView, null);
  assert.match(p.status(p.files).textContent, /régénérez-le dans Fichiers/);
  // No image: no view, no message.
  p.files.removeAttribute('src'); await p.settle();
  assert.equal(p.status(p.files).hidden, true); assert.equal(p.files.cncView, null);
  // A broken path: refused with a message, the 2D image stays.
  p.show(p.files, 'bad.nc', { path3d: Object.assign({}, pocket.path3d, { data: '@@@@' }) }); await p.settle();
  assert.match(p.status(p.files).textContent, /^Vue 3D indisponible : parcours 3D illisible/); assert.match(p.files.src, /^data:/);
  // Hidden page: views nobody asked for are not drawn.
  p.document.hidden = true; p.show(p.files, 'c.nc', other); await p.settle();
  assert(p.files.cncView && p.files.cncView.view === 'iso', 'the asked view is still drawn');
  const hiddenPosted = p.log.posted.length; await p.runIdle(); assert.equal(p.log.posted.length, hiddenPosted);
  // Three files at most are kept; the evicted views are released.
  assert(p.window.cncPreviewViews.cached().length <= 3); assert(p.log.revoked.length >= 4);

  // Remembered choice at start, worker without OffscreenCanvas: drawn in the page.
  p = page({ worker: true, offscreen: false, saved: 'front' });
  assert.equal(p.button(p.home, 'front').attributes['aria-pressed'], 'true');
  p.show(p.home, 'a.nc', pocket); await p.settle();
  assert.equal(p.home.cncView.view, 'front'); assert(p.log.workers[0].terminated, 'worker given up');
  assert(p.log.texts.includes('Vue de face (XZ)'));
  // No Worker at all: drawn in the page too.
  p = page({ saved: 'side' }); p.show(p.files, 'a.nc', pocket); await p.settle();
  assert.equal(p.files.cncView.view, 'side'); assert.match(p.files.src, /^blob:/);
  // An unknown saved value falls back to 2D.
  p = page({ saved: 'perspective' }); assert.equal(p.window.cncPreviewViews.view(), '2d');
  // Encoding failure in the worker: a message, the 2D image stays.
  p = page({ worker: true, blobFailure: true, saved: 'iso' }); p.show(p.files, 'a.nc', pocket); await p.settle();
  assert.match(p.status(p.files).textContent, /encodage refusé/); assert.match(p.files.src, /^data:/);
  // Tool marker and trail (tool-position.js): the projection of a 3D view (version 2) needs Z,
  // except for a view that ignores it; the 2D projection (version 1) is unchanged.
  const { project } = require('./touch/tool-position.js');
  const box = [0, 0, -3, 90, 50, 5];
  for (const view of T3.VIEWS) {
    const proj = T3.projection(view, box), q = T3.apply(proj.matrix, 40, 20, -2), r = project(proj, { x: 40, y: 20, z: -2 });
    assert(Math.abs(r.x * 960 - q[0]) < 1e-9 && Math.abs(r.y * 540 - q[1]) < 1e-9, view + ': same matrix as the image');
    if (view === 'top') assert.deepEqual(project(proj, { x: 40, y: 20 }), project(proj, { x: 40, y: 20, z: 7 }), 'top view: Z not needed');
    else assert.equal(project(proj, { x: 40, y: 20 }), null, view + ': no Z, no marker');
  }
  assert.equal(project(Object.assign({}, T3.projection('iso', box), { matrix: [1, 2, 3] }), { x: 1, y: 1, z: 1 }), null);
  assert.equal(project(Object.assign({}, T3.projection('iso', box), { wcs: 'G55' }), { x: 1, y: 1, z: 1 }), null);
  assert.equal(project(T3.projection('iso', box), { x: 1e6, y: 0, z: 0 }), null, 'outside the image');
  const flat = { version: 1, width: 960, height: 540, units: 'mm', wcs: 'G54', bounds: [0, 0, 90, 50] };
  const corner = project(flat, { x: 0, y: 50 }); // scale 8.8: 84 px left margin, 50 px top margin
  assert(Math.abs(corner.x - 84 / 960) < 1e-12 && Math.abs(corner.y - 50 / 540) < 1e-12);
  console.log('PASS preview views: selector and remembered choice, asked view first then idle-only background, cache shared by Fichiers and Suivi, eviction, old previews, broken paths, hidden page, worker and page rendering.');
})().catch(e => { console.error(e); process.exitCode = 1; });
