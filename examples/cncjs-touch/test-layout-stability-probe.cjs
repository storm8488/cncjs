'use strict';
// Exercise the browser probe with observer deliveries containing transient
// resets, including remove/restore in one delivery and in separate deliveries.
const assert = require('assert').strict, vm = require('vm');
const { observeLayout, checks } = require('./browser-stability.cjs');
function node(id, owner) {
  const attrs = {};
  return { id, nodeType: 1, tagName: 'DIV', parentElement: null, attrs,
    closest: () => owner, getClientRects: () => [{}], getAttribute: k => attrs[k] === undefined ? null : attrs[k] };
}
async function sample(mode) {
  let now = 0, callback, end, listener, disconnected = false;
  const screen = node('screen-home'), child = node('home-job-image', screen), hidden = node('hidden', screen);
  hidden.hidden = true;
  const machine = { workflow: 'running' };
  const document = { documentElement: {}, querySelector: () => screen,
    createElement: () => {
      const style = {};
      Object.defineProperty(style, 'cssText', { set(value) {
        const values = {};
        value.split(';').filter(Boolean).forEach(s => { const i = s.indexOf(':'); values[s.slice(0, i).trim()] = s.slice(i + 1).trim(); });
        const names = Object.keys(values); style.length = names.length;
        names.forEach((k, i) => { style[i] = k; }); style.getPropertyValue = k => values[k];
      } });
      return { style };
    }
  };
  const window = { cncState: { get: () => ({ machine }) }, addEventListener: (n, f) => { listener = f; }, removeEventListener: () => { listener = null; } };
  const pending = [];
  const context = { document, window, WeakMap, Promise, Date: { now: () => now },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', contentVisibility: 'visible' }),
    setTimeout: (f, ms) => { end = () => { now = ms; f(); }; },
    MutationObserver: function (f) { callback = f; this.observe = () => {}; this.takeRecords = () => pending.splice(0); this.disconnect = () => { disconnected = true; }; } };
  screen.attrs['data-fit-overflow'] = 'true';
  const result = vm.runInNewContext('(' + observeLayout + ')(10000)', context);
  const deliver = (target, name, values, batch = true) => {
    const records = values.slice(0, -1).map(oldValue => ({ target, attributeName: name, oldValue }));
    if (batch) { target.attrs[name] = values[values.length - 1]; callback(records); }
    else records.forEach((r, i) => { target.attrs[name] = values[i + 1]; callback([r]); });
  };
  for (let second = 1; second <= 10; second++) {
    now = second * 1000; listener();
    if (mode === 'overflow') deliver(screen, 'data-fit-overflow', ['true', null, 'true']);
    if (mode === 'transform') deliver(screen, 'style', ['transform:none; width:1200px', 'width:1200px', 'transform:none; width:1200px']);
    if (mode === 'main-style') deliver(child, 'style', ['overflow-y:auto', '', 'overflow-y:auto'], second % 2 === 0);
    if (mode === 'child') deliver(child, 'data-state', ['ready', null, 'ready']);
    if (mode === 'hidden') deliver(hidden, 'data-state', ['ready', null, 'ready']);
    if (mode === 'live') deliver(child, 'style', ['transform:translateX(' + second + 'px)', 'transform:translateX(' + (second + 1) + 'px)']);
    if (mode === 'redundant') deliver(screen, 'style', ['transform:none', 'transform:none']);
  }
  if (mode === 'queued') {
    pending.push({ target: screen, attributeName: 'data-fit-overflow', oldValue: 'true' }); screen.attrs['data-fit-overflow'] = null;
  }
  end(); const value = await result;
  assert(disconnected && listener === null, 'observer and listener disposed');
  return value;
}
(async () => {
  for (const mode of ['stable', 'hidden', 'live', 'redundant']) assert.deepEqual(checks(await sample(mode), 'running', 10000), [], mode);
  for (const mode of ['overflow', 'transform', 'queued']) {
    const s = await sample(mode);
    assert(s.protectedChanges.length > 0, mode + ': transient changes must be captured');
    assert(checks(s, 'running', 10000).some(s => /overflow\/transform/.test(s)));
  }
  for (const mode of ['main-style', 'child']) {
    const s = await sample(mode);
    assert.equal(s.periodicResets.length, 1, mode + ': visible periodic resets captured');
    assert.equal(s.periodicResets[0].count, 10);
    assert(checks(s, 'running', 10000).some(s => /repeatedly cleared/.test(s)));
  }
  const stable = await sample('stable');
  for (const patch of [{ screen: null }, { activeChanged: true }, { durationMs: 4999 }, { packets: 0 }, { workflowStart: 'idle' }, { workflowEnd: 'idle' }, { truncated: true }])
    assert(checks(Object.assign({}, stable, patch), 'running', 10000).length, JSON.stringify(patch));
  assert(checks(null, 'running', 10000).length);
  console.log('PASS layout stability probe: transient overflow/transform, visible attribute/style resets, oldValue chains, final queue, live updates, hidden screens and teardown.');
})().catch(e => { console.error(e); process.exitCode = 1; });
