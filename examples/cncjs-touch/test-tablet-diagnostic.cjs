'use strict';
// Optional diagnostic of this tablet (Réglages → Performances): refused during a job, a pause or
// a move; at rest it reads the CSS window, visual viewport, DPR, profile and capabilities and times
// two short drawings; the WebGL context it opens is released; export through CNCDownload; no
// request and no command.
const assert = require('assert').strict, fs = require('fs'), path = require('path'), vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, 'touch', 'tablet-diagnostic.js'), 'utf8');

function setup(gl) {
  const nodes = {}, listeners = {}, saved = [], spies = { lost: 0, requests: 0 };
  const node = (id) => nodes[id] || (nodes[id] = { id, hidden: false, textContent: '', innerHTML: '', handlers: {}, addEventListener(n, f) { this.handlers[n] = f; }, click() { this.handlers.click.call(this); } });
  const card = { insertAdjacentHTML(where, html) { assert.equal(where, 'beforeend'); (html.match(/id="([^"]+)"/g) || []).forEach((m) => { const n = node(m.slice(4, -1)); if (/ hidden>/.test(html.split(m)[1].split('>')[0] + '>')) n.hidden = true; }); } };
  const ctx2d = { beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, getImageData() { return {}; } };
  const document = {
    getElementById: (id) => (id === 'ks-performance-card' ? card : node(id)),
    createElement: () => ({ width: 0, height: 0, getContext: (kind) => (kind === '2d' ? ctx2d : gl) })
  };
  const window = {
    document, innerWidth: 1440, innerHeight: 960, devicePixelRatio: 1.5, screen: { width: 2160, height: 1440 },
    visualViewport: { width: 1440, height: 660, scale: 1 }, navigator: { userAgent: 'Chromium/106' },
    performance: { now: () => Date.now() }, Worker: function () {}, XMLHttpRequest: function () { spies.requests++; }, fetch: () => { spies.requests++; },
    addEventListener(n, f) { listeners[n] = f; },
    cncProfile: { performance: () => 'performance', kind: () => 'laser' },
    CNCDownload: { save(blob, name) { saved.push({ blob, name }); } }
  };
  window.window = window;
  const context = { window, Float32Array, Uint8Array, Math, Date, JSON, String, Blob: class { constructor(parts, o) { this.text = parts.join(''); this.type = o.type; } } };
  vm.runInNewContext(source, context);
  const status = (machine) => listeners['cnc-job-status']({ detail: { machine, simulation: false } });
  return { node, window, saved, spies, status };
}

// A WebGL stub that records the release of its context.
function fakeGL(spies) {
  const gl = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, ARRAY_BUFFER: 3, STATIC_DRAW: 4, FLOAT: 5, COLOR_BUFFER_BIT: 6, LINE_STRIP: 7, RGBA: 8, UNSIGNED_BYTE: 9, LINK_STATUS: 10, RENDERER: 11,
    getExtension: (n) => (n === 'WEBGL_lose_context' ? { loseContext() { spies.lost++; } } : null),
    getParameter: () => 'Mesa Intel(R) HD Graphics 4400', createShader: () => ({}), shaderSource() {}, compileShader() {},
    createProgram: () => ({}), attachShader() {}, linkProgram() {}, getProgramParameter: () => true, useProgram() {}, bindBuffer() {},
    createBuffer: () => ({}), bufferData() {}, getAttribLocation: () => 0, enableVertexAttribArray() {}, vertexAttribPointer() {},
    clear() {}, drawArrays(mode, first, count) { spies.drawn = count; }, readPixels() {}
  };
  return gl;
}

// During a job (or a pause, or a jog): refused, nothing measured.
{
  const s = setup(null);
  s.status({ workflow: 'running', activeState: 'Run' });
  s.node('profile-diagnostic-run').click();
  assert.match(s.node('profile-diagnostic-status').textContent, /seulement au repos/);
  assert.equal(s.node('profile-diagnostic-list').innerHTML, '');
  s.status({ workflow: 'idle', activeState: 'Jog' }); s.node('profile-diagnostic-run').click();
  assert.match(s.node('profile-diagnostic-status').textContent, /seulement au repos/);
  s.status({ workflow: 'paused', activeState: 'Hold:0' }); s.node('profile-diagnostic-run').click();
  assert.match(s.node('profile-diagnostic-status').textContent, /seulement au repos/);
  assert.equal(s.node('profile-diagnostic-export').hidden, true);
}
// At rest, without WebGL: the window, the visible area (virtual keyboard), DPR, profile and the 2D timing.
{
  const s = setup(null);
  s.status({ workflow: 'idle', activeState: 'Idle' });
  s.node('profile-diagnostic-run').click();
  const r = s.window.cncTabletDiagnostic.collect();
  assert.equal(JSON.stringify(r.cssWindow), '[1440,960]'); assert.equal(JSON.stringify(r.visualViewport), '[1440,660,1]');
  assert.equal(r.devicePixelRatio, 1.5); assert.equal(r.performance, 'performance'); assert.equal(r.machineKind, 'laser');
  assert.equal(r.render.webgl.available, false); assert.equal(typeof r.render.canvas2dMs, 'number');
  const list = s.node('profile-diagnostic-list').innerHTML;
  assert.match(list, /1440 × 960 px/); assert.match(list, /1440 × 660 px/); assert.match(list, /WebGL<\/dt><dd>indisponible/);
  assert.equal(s.node('profile-diagnostic-export').hidden, false);
  s.node('profile-diagnostic-export').click();
  assert.equal(s.saved.length, 1); assert.match(s.saved[0].name, /^cncjs-touch-diagnostic-.*\.json$/);
  assert.equal(JSON.parse(s.saved[0].blob.text).kind, 'cncjs-touch-tablet-diagnostic');
  assert.equal(s.spies.requests, 0, 'no request');
}
// With WebGL: renderer named, 20 000 segments drawn, the context released.
{
  const spies = { lost: 0 };
  const s = setup(fakeGL(spies));
  s.node('profile-diagnostic-run').click();
  const r = s.window.cncTabletDiagnostic.collect();
  assert.equal(r.render.webgl.available, true); assert.equal(r.render.webgl.software, false); assert.equal(typeof r.render.webgl.drawMs, 'number');
  assert.equal(spies.drawn, 20000); assert(spies.lost >= 1, 'WebGL context released');
  assert.match(s.node('profile-diagnostic-list').innerHTML, /HD Graphics 4400/);
}
// Performance v2 (L6): the live v2 scene owns the only WebGL context, so the diagnostic does not
// open a second one; it says so, and reports the existing probe's hardware verdict.
{
  const spies = { lost: 0 };
  const s = setup(fakeGL(spies));
  s.window.document.body = { classList: { contains: (n) => n === 'perf-v2' } };
  s.window.cncGpu = { state: () => ({ checked: true, hardware: true, lost: false }) };
  s.node('profile-diagnostic-run').click();
  const r = s.window.cncTabletDiagnostic.collect();
  assert.equal(spies.drawn, undefined, 'no second WebGL drawing under perf-v2'); assert.equal(spies.lost, 0, 'no second context created');
  assert.equal(r.render.webgl.skipped, true); assert.equal(r.render.webgl.software, false); assert.equal(r.render.webgl.drawMs, null);
  assert.match(s.node('profile-diagnostic-list').innerHTML, /Non mesuré/);
  assert.equal(typeof r.render.canvas2dMs, 'number');
}
for (const page of ['index.html', 'simulation.html']) {
  const html = fs.readFileSync(path.join(__dirname, 'touch', page), 'utf8');
  assert(html.indexOf('tablet-diagnostic.js') > html.indexOf('display-settings.js'), page + ': after display-settings.js');
}
console.log('PASS tablet diagnostic: refused during a job, pause or jog; window, visible area, DPR, profile and capabilities at rest; 2D and WebGL timings with the context released; JSON export; no request.');
