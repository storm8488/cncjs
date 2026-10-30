'use strict';
// U5: the job confirmation dialog stays modal for the page, but the status strip's Pause and
// ArrÃªter stay usable (never inert, part of the Tab cycle, focus allowed on them) and pressing
// them closes the dialog before the command, so the ticket cannot be used afterwards.
// Offline fixture (simulation mode, fake simulator, no network).
const fs = require('fs'), vm = require('vm'), assert = require('assert');
async function fixture(machinePatch) {
  const nodes = {}, events = {}, calls = []; let now = 100000, pending = null;
  const doc = { hidden: false, activeElement: null };
  function node(id, parent) {
    if (nodes[id]) return nodes[id];
    const n = nodes[id] = { id, tagName: 'DIV', hidden: false, inert: false, isConnected: true, disabled: false, checked: false, value: '', textContent: '', handlers: {}, children: [], parentNode: null, style: {},
      addEventListener(e, f) { this.handlers[e] = f; }, removeEventListener(e) { delete this.handlers[e]; },
      appendChild() {}, insertBefore() {}, setAttribute() {}, getAttribute() { return null; },
      getClientRects() { return this.hidden ? [] : [{}]; }, focus() { doc.activeElement = this; },
      contains(t) { for (let x = t; x; x = x.parentNode) if (x === this) return true; return false; },
      closest(sel) { const ids = sel.split(',').map((s) => s.trim().replace(/^#/, '')); for (let x = this; x; x = x.parentNode) if (ids.includes(x.id)) return x; return null; },
      querySelector(sel) { return sel === '.job-dialog-card' ? node('job-dialog-card', this) : null; },
      click() { if (!this.disabled && this.handlers.click) this.handlers.click.call(this, {}); } };
    if (parent) { n.parentNode = parent; parent.children.push(n); }
    return n;
  }
  // Body: the strip (state, actions with pilot / resume / pause / stop), main, the dialog.
  const banner = node('simulation-banner'), state = node('t-state', banner), actions = node('t-strip-actions', banner);
  ['t-pilot', 't-unlock', 't-resume', 't-pause', 't-stop'].forEach((id) => node(id, actions));
  const right = node('t-strip-right', banner), dialog = node('job-dialog');
  ['job-check', 'job-dismiss', 'job-confirm'].forEach((id) => node(id, dialog));
  const on = (name, fn) => (events[name] || (events[name] = [])).push(fn);
  const emit = (name, event = {}) => (events[name] || []).slice().forEach((f) => f(event));
  Object.assign(doc, { body: { children: [banner, node('main'), node('previously-inert'), dialog], getAttribute: () => 'true', appendChild() {} },
    querySelector: () => node('panel'), querySelectorAll: () => [dialog], getElementById: (id) => node(id), createElement: () => node('option'),
    addEventListener: on, removeEventListener(n, f) { events[n] = (events[n] || []).filter((x) => x !== f); } });
  node('previously-inert').inert = true; right.inert = false; dialog.hidden = true;
  const machine = Object.assign({ port: 'SIMULATION', type: 'Virtual', generation: 'g1', revision: 1, name: 'leaf.nc', fresh: true, statusAgeMs: 0, activeState: 'Idle', workflow: 'idle',
    canLoad: true, canStart: true, canResume: false, canPause: false, canStop: false, canMacro: false }, machinePatch || {});
  const sim = { request(method, body) { if (method === 'GET') return Promise.resolve({ controllers: [Object.assign({}, machine)] }); calls.push(body); if (body.action === 'prepare') return new Promise((r) => { pending = r; }); return Promise.resolve({}); } };
  const win = { cncJobSimulation: sim, addEventListener: on, removeEventListener: doc.removeEventListener, dispatchEvent() {} };
  vm.runInNewContext(fs.readFileSync(process.env.CNC_JOB_CONTROLS || __dirname + '/touch/job-controls.js', 'utf8'), { window: win, document: doc, Date: { now: () => now }, Promise, CustomEvent: function () {}, setInterval: () => 1, clearInterval() {}, XMLHttpRequest() { throw Error('No hardware/network permitted'); } });
  const flush = () => new Promise(setImmediate); await flush();
  async function open(trigger, extra) { node(trigger).focus(); if (trigger === 'macro') win.cncJobControls.prepareMacro('m1'); else node(trigger).click(); await flush(); const f = pending; pending = null; f(Object.assign({ nonce: 'ticket', name: 'leaf.nc', expiresIn: 15 }, extra)); await flush(); assert.equal(dialog.hidden, false, 'dialog opened by ' + trigger); }
  function key(k, shiftKey = false) { let prevented = false; emit('keydown', { key: k, shiftKey, preventDefault() { prevented = true; }, stopImmediatePropagation() {} }); return prevented; }
  const inertPath = (n) => { for (let x = n; x; x = x.parentNode) if (x.inert) return x.id; return null; };
  return { node, doc, win, machine, calls, emit, flush, open, key, inertPath, dialog, banner, advance(ms) { now += ms; } };
}
(async () => {
  // 1. Resume confirmation during a pause: ArrÃªter in the strip stays usable.
  let f = await fixture({ workflow: 'paused', activeState: 'Hold:0', canStart: false, canResume: true, canStop: true });
  f.node('t-pause').hidden = true; // in a pause the strip offers Resume and ArrÃªter
  await f.open('job-resume');
  assert.equal(f.inertPath(f.node('t-stop')), null, 'ArrÃªter of the strip must not be inert under the dialog');
  assert.equal(f.inertPath(f.node('t-pause')), null, 'Pause of the strip must not be inert under the dialog');
  for (const id of ['main', 't-state', 't-pilot', 't-resume', 't-unlock', 't-strip-right']) assert(f.inertPath(f.node(id)), id + ' stays inert (modal for the rest of the page)');
  assert.equal(f.dialog.style.top, 'var(--statusbar-h,0px)', 'the overlay starts below the strip');
  assert.equal(f.doc.activeElement.id, 'job-dismiss');
  // Keyboard: the strip's ArrÃªter is in the Tab cycle; focus on it is not pulled back.
  assert(f.key('Tab', true)); assert.equal(f.doc.activeElement.id, 'job-check');
  assert(f.key('Tab', true)); assert.equal(f.doc.activeElement.id, 't-stop', 'Shift+Tab from the first dialog control reaches ArrÃªter');
  f.emit('focusin', { target: f.node('t-stop') }); assert.equal(f.doc.activeElement.id, 't-stop', 'focus on ArrÃªter is kept');
  f.emit('focusin', { target: f.node('main') }); assert.equal(f.doc.activeElement.id, 'job-dismiss', 'focus elsewhere goes back into the dialog');
  // ArrÃªter (relayed to #job-stop by status-strip.js): immediate, closes the dialog, voids the ticket.
  f.node('job-check').checked = true; f.node('job-check').handlers.change.call(f.node('job-check'));
  f.node('job-stop').click(); await f.flush();
  assert(f.dialog.hidden, 'ArrÃªter closes the confirmation');
  assert.equal(f.calls.filter((c) => c.action === 'stop').length, 1, 'stop sent at once');
  f.node('job-confirm').disabled = false; f.node('job-confirm').handlers.click(); await f.flush();
  assert(!f.calls.some((c) => c.action === 'resume'), 'the ticket cannot be used after ArrÃªter');
  for (const id of ['main', 't-state', 't-pilot', 't-resume', 't-unlock', 't-strip-right']) assert.equal(f.node(id).inert, false, id + ' restored');
  assert.equal(f.node('previously-inert').inert, true, 'previous inert value restored');

  // 2. Start confirmation while ArrÃªter is offered (homing or a jog, canStop at Idle).
  f = await fixture({ canStop: true });
  f.node('t-pause').hidden = true;
  await f.open('job-start');
  f.node('job-check').checked = true; f.node('job-check').handlers.change.call(f.node('job-check'));
  assert.equal(f.node('job-confirm').disabled, false);
  assert(f.key('Tab')); assert.equal(f.doc.activeElement.id, 'job-confirm', 'Tab from Annuler reaches Confirmer once enabled');
  assert(f.key('Tab')); assert.equal(f.doc.activeElement.id, 't-stop', 'then the strip');
  assert(f.key('Tab')); assert.equal(f.doc.activeElement.id, 'job-check', 'then back into the dialog');
  f.node('job-stop').click(); await f.flush();
  assert(f.dialog.hidden); assert.equal(f.calls.filter((c) => c.action === 'stop').length, 1);
  f.node('job-confirm').disabled = false; f.node('job-confirm').handlers.click(); await f.flush();
  assert(!f.calls.some((c) => c.action === 'start'), 'no start after ArrÃªter during the start confirmation');

  // 3. A confirmation open while a job runs (a macro): Pause stays usable and immediate.
  f = await fixture({ workflow: 'running', activeState: 'Run', canStart: false, canPause: true, canStop: true, canMacro: true });
  await f.open('macro');
  assert.equal(f.inertPath(f.node('t-pause')), null); assert.equal(f.inertPath(f.node('t-stop')), null);
  f.node('job-dismiss').focus(); assert(f.key('Tab')); assert.equal(f.doc.activeElement.id, 't-pause', 'Tab from the last control reaches Pause');
  assert(f.key('Tab')); assert.equal(f.doc.activeElement.id, 't-stop');
  f.node('job-pause').click(); await f.flush();
  assert(f.dialog.hidden, 'Pause closes the confirmation'); assert.equal(f.calls.filter((c) => c.action === 'pause').length, 1, 'pause sent at once');
  assert(!f.calls.some((c) => c.action === 'macro'));
  // A hidden or disabled strip command is not in the cycle; Escape still closes.
  f = await fixture({ workflow: 'running', activeState: 'Run', canStart: false, canPause: true, canStop: true, canMacro: true });
  f.node('t-pause').hidden = true; f.node('t-stop').disabled = true;
  await f.open('macro');
  assert(f.key('Tab')); assert.equal(f.doc.activeElement.id, 'job-check');
  assert(f.key('Escape')); assert(f.dialog.hidden); assert.equal(f.node('main').inert, false);
  console.log('PASS: strip Pause / ArrÃªter usable over the confirmation (not inert, below the overlay, in the Tab cycle), immediate, dialog closed and ticket void; rest of the page modal; no network.');
})().catch((e) => { console.error(e); process.exit(1); });
