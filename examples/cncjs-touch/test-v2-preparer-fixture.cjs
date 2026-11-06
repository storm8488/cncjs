'use strict';
// Shared fixture of the v2 Préparer tests (L5): job-preparation.js on the DOM fixture with a
// controllable v2 contract, profile, layout, advanced loader and a recording origin card module.
// Not a test by itself: the test-v2-preparer*.cjs files listed in verify-project.cjs use it.
const fs = require('fs'), vm = require('vm');
const { createDOM } = require('./dom-fixture.cjs');
const tick = () => new Promise(setImmediate);
const idle = (patch = {}) => Object.assign({ port: 'A', generation: 'g1', revision: 3, name: 'a.nc', originalName: 'Pièce A.nc', fingerprint: 'sha256:aa',
  fresh: true, activeState: 'Idle', workflow: 'idle', statusAgeMs: 0, canStart: true, canLoad: true,
  coordinates: { mpos: { x: -100, y: -50, z: -10 }, wpos: { x: 18, y: 12, z: 0 } }, operator: { wcs: 'G54', reportUnits: 'mm' }, settings: { $22: '1' } }, patch);
function preparerPage(options = {}) {
  const dom = createDOM(['jog']), { document, node, element, activeScreens } = dom;
  const classes = new Set(options.v2 === false ? [] : ['perf-v2']);
  document.body.classList = { contains: n => classes.has(n), add: n => classes.add(n), remove: n => classes.delete(n), toggle(n, on) { if (on) classes.add(n); else classes.delete(n); } };
  document.body.getAttribute = () => null;
  document.querySelector = sel => sel === '.ks-file-tools' ? node('tools') : null;
  const listeners = {}, frames = [], calls = { mount: [], unmount: 0, comparison: [], loads: [], updates: [], reads: 0, catalogues: [], tracked: 0, sheets: [] };
  const window = { document, addEventListener: (n, f) => (listeners[n] = listeners[n] || []).push(f),
    removeEventListener: (n, f) => { listeners[n] = (listeners[n] || []).filter(x => x !== f); },
    requestAnimationFrame: f => { frames.push(f); return frames.length; }, cancelAnimationFrame() {},
    cncI18n: { t: s => s, message: s => s, locale: 'fr-FR', registerCatalog: (name, rows) => { calls.catalogues.push([name, rows]); return true; } },
    cncShell: { sheet: id => ({ content: element('div'), open() { calls.sheets.push(id); } }), preparationActions: element('div') },
    CNCTravelCheck: { check: () => null } };
  if (options.i18n === false) delete window.cncI18n;
  const pending = [];
  window.cncProfile = { performance: () => options.performance || 'performance', kind: () => 'cnc',
    loadAdvanced: files => { calls.loads.push(files); return new Promise((resolve, reject) => pending.push({ resolve, reject })); } };
  window.cncLayout = { wide: () => true };
  let comparisonMode = 'both';
  const card = element('section', 'op-card');
  window.CNCOriginPreview = { mount: screen => { calls.mount.push(screen); comparisonMode = 'both'; screen.appendChild(card); classes.add('perf-origin'); },
    unmount: () => { calls.unmount++; if (card.parentNode) card.parentNode.removeChild(card); classes.delete('perf-origin'); },
    hint: () => '', comparison: mode => { if (['both', 'current', 'hypothesis'].includes(mode)) { calls.comparison.push(mode); comparisonMode = mode; } return comparisonMode; } };
  // Contract: gate, layout, holdLayout, placement model and the prepare mount (real page).
  const v2 = { gate: true, layout: options.v2 !== false, safeIdle: options.safeIdle !== false, placement: null };
  const content = element('div', 'perf-v2-prepare'); content.hidden = true;
  const empty = { version: 1, available: false, identity: null, current: null, hypothesis: null, travel: { verdict: 'unknown', source: null, marginsMm: null, zVerified: false, collisionsVerified: false }, declarations: [] };
  const life = { token: () => (v2.gate && v2.safeIdle ? { ok: true } : null), valid: t => !!t && v2.gate && v2.safeIdle,
    track: (kind, cancel) => { calls.tracked++; calls.cancelRead = cancel; return () => {}; }, frame: f => window.requestAnimationFrame(f), dispose() { calls.disposed = (calls.disposed || 0) + 1; } };
  if (options.contract !== false) window.cncV2 = {
    gate: () => v2.gate,
    state: () => ({ layout: v2.layout, open: v2.gate, safeIdle: v2.safeIdle, holdLayout: v2.layout && !v2.safeIdle }),
    use: slot => slot === 'placement' ? { snapshot: () => v2.placement || empty, update: input => { calls.updates.push(input); return v2.placement || empty; } } : { snapshot: () => null },
    mounts: { get: name => name === 'prepare' && v2.layout ? { screen: 'jog', root: node('screen-jog'), content, origin: options.simulation ? null : content } : null },
    lifecycle: { scope: () => life }
  };
  window.cncDashboardView = { loadedPreview: () => { calls.reads++; return Promise.resolve(options.preview === undefined ? null : options.preview); } };
  const source = fs.readFileSync(__dirname + '/touch/job-preparation.js', 'utf8');
  vm.runInNewContext(source, { window, document, Promise, JSON, Math, Object, Array, Number, String, isFinite });
  const emit = (name, detail) => (listeners[name] || []).slice().forEach(f => f({ detail }));
  const frame = () => { const batch = frames.splice(0); batch.forEach(f => f(0)); return batch.length; };
  const flush = async () => { for (let i = 0; i < 4; i++) { await tick(); frame(); } };
  const status = machine => emit('cnc-job-status', { machine, simulation: false });
  const show = screen => { activeScreens.clear(); activeScreens.add(screen); emit('cnc-screen-change', screen); };
  const find = id => content.querySelectorAll('*').find(e => e.id === id);
  return { window, document, node, element, dom, classes, listeners, frames, calls, pending, v2, content, card, emit, frame, flush, status, show, empty, find,
    resolveLoads: () => pending.splice(0).forEach(p => p.resolve()), rejectLoads: message => pending.splice(0).forEach(p => p.reject(new Error(message))) };
}
module.exports = { preparerPage, idle, tick };
