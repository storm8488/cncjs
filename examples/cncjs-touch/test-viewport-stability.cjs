'use strict';
// Deterministic layout: a classic scrollbar takes 17 px from clientWidth, but
// never from offsetWidth. Live content asks for a fit once a second for 10 s.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const source = fs.readFileSync(__dirname + '/touch/viewport-fit.js', 'utf8');
function bench(code, width, height, v2, name) {
  let now = 0, id = 0, contentHeight = height + 240, active = name;
  const queue = new Map(), timers = new Map(), handlers = {}, observers = [], writes = [], keys = [];
  const trackStyle = (label) => new Proxy({ top: '', bottom: '', overflowY: '', transform: '', width: '', visibility: '' }, {
    set(o, k, value) { writes.push({ target: label, key: k, from: o[k], to: value }); o[k] = value; return true; }
  });
  const attrs = {};
  const screen = { id: 'screen-' + name, style: trackStyle('screen'), nodeType: 1, hidden: false,
    classList: { contains: n => n === 'screen' || n === 'active' },
    getAttribute: n => attrs[n] || null,
    setAttribute(n, value) { writes.push({ target: 'screen', key: n, from: attrs[n], to: value }); attrs[n] = value; },
    removeAttribute(n) { writes.push({ target: 'screen', key: n, from: attrs[n], to: null }); delete attrs[n]; },
    get scrollWidth() { return main.clientWidth - 32; },
    get scrollHeight() { return contentHeight; }
  };
  const main = { style: trackStyle('main'), scrollTop: 0, scrollLeft: 0,
    offsetWidth: width - 88,
    get clientWidth() { return this.offsetWidth - (this.style.overflowY === 'auto' ? 17 : 0); },
    querySelector: () => screen, querySelectorAll: () => [screen]
  };
  screen.parentElement = main;
  const liveText = { nodeType: 3, parentElement: screen, nodeValue: '0' };
  class Layouts extends WeakMap {
    set(node, entry) { keys.push(entry.key); return super.set(node, entry); }
  }
  const context = { WeakMap: Layouts, Date: { now: () => now },
    requestAnimationFrame(fn) { queue.set(++id, fn); return id; },
    setTimeout(fn, delay) { timers.set(++id, { fn, at: now + delay }); return id; }, clearTimeout: n => timers.delete(n),
    MutationObserver: function (fn) { this.callback = fn; this.observe = () => {}; this.disconnect = () => {}; observers.push(this); },
    window: { innerWidth: width, innerHeight: height,
      getComputedStyle: () => ({ getPropertyValue: () => '1' }),
      addEventListener: (n, fn) => { handlers[n] = fn; }, removeEventListener: n => { delete handlers[n]; },
      cancelAnimationFrame: n => queue.delete(n) },
    document: { querySelector: () => main,
      getElementById: n => n === 'real-banner' ? { hidden: false, getBoundingClientRect: () => ({ bottom: 72 }) } : null,
      body: { classList: { contains: n => n === 'ks-ui' || (v2 && n === 'perf-v2') } },
      documentElement: { style: { setProperty(k, v) { writes.push({ target: 'root', key: k, to: v }); } } },
      addEventListener: (n, fn) => { handlers[n] = fn; }, removeEventListener: n => { delete handlers[n]; } }
  };
  function flush() {
    let frames = 0;
    while (queue.size) {
      assert(++frames < 25, 'fit must settle');
      const [n, fn] = queue.entries().next().value; queue.delete(n); fn();
    }
  }
  function tick() {
    now += 1000;
    for (const [n, timer] of timers) if (timer.at <= now) { timers.delete(n); timer.fn(); }
    liveText.nodeValue = String(now);
    observers[0].callback([{ target: liveText }]); flush();
  }
  vm.runInNewContext(code, context); flush();
  assert.strictEqual(attrs['data-fit-overflow'], 'true');
  assert.strictEqual(main.style.overflowY, 'auto');
  const initialKey = keys[keys.length - 1];
  writes.length = 0; keys.length = 0;
  main.scrollTop = 120;
  for (let n = 0; n < 10; n++) tick();
  const periodic = writes.slice(), layoutKeys = keys.slice();
  const label = width + 'x' + height + ' v' + (v2 ? 2 : 1) + ' ' + active;
  assert(!periodic.some(w => w.key === 'data-fit-overflow' && w.to === null), label + ': no overflow removal');
  assert.strictEqual(new Set(layoutKeys).size, 1, label + ': layout key independent of scrollbar');
  assert.strictEqual(layoutKeys[0], initialKey, label + ': scrollbar appearance cannot change the key');
  assert.deepStrictEqual(periodic, [], label + ': an unchanged fit writes no attributes or styles');
  assert.strictEqual(main.scrollTop, 120, label + ': keep reading position');
  // Even a resize/reactivation must not clear and restore the same overflow.
  context.window.innerWidth += 100; main.offsetWidth += 100; handlers.resize(); flush();
  handlers['cnc-screen-change'](); flush();
  assert(!writes.some(w => w.key === 'data-fit-overflow'), label + ': still overflowing after resize/open');
  assert(!writes.some(w => w.key === 'overflowY'), label + ': no scrollbar toggle');
  // A shorter screen can leave overflow directly, without a destructive probe.
  contentHeight = 250; context.window.innerHeight += 100; handlers.resize(); flush();
  assert.strictEqual(screen.getAttribute('data-fit-overflow'), null, label + ': content fits again');
  assert.strictEqual(main.style.overflowY, '');
  writes.length = 0; tick(); assert.deepStrictEqual(writes, [], label + ': fits without more writes');
  contentHeight = height + 240; tick();
  assert.strictEqual(screen.getAttribute('data-fit-overflow'), 'true', label + ': growing content scrolls again');
  // A data-fit=scroll screen is idempotent too, and switching away clears main once.
  attrs['data-fit'] = 'scroll'; active = 'settings'; handlers['cnc-screen-change'](); flush();
  writes.length = 0; handlers.resize(); flush(); assert.deepStrictEqual(writes, []);
  delete attrs['data-fit']; contentHeight = 250; handlers['cnc-screen-change'](); flush();
  assert.strictEqual(main.style.overflowY, '');
  assert.strictEqual(writes.filter(w => w.target === 'main' && w.key === 'overflowY').length, 1, 'leave scrolling in one write');
  context.window.cncViewportFit.dispose();
  return { periodicWrites: periodic.length, overflowRemovals: periodic.filter(w => w.key === 'data-fit-overflow' && w.to === null).length,
    scrollbarWrites: periodic.filter(w => w.key === 'overflowY').length, keys: layoutKeys };
}
function run(code) {
  const results = [];
  for (const [w, h] of [[1665, 764], [1366, 911], [1366, 768]])
    for (const v2 of [false, true]) for (const name of ['machine', 'files', 'jog', 'check', 'home', 'more', 'history'])
      results.push(bench(code, w, h, v2, name));
  return results;
}
if (require.main === module) {
  assert.strictEqual(run(source).length, 42);
  console.log('PASS viewport stability: 42 responsive layouts, 10 seconds of live content, zero fit writes, stable scrollbar-independent keys, resize/open and scroll recovery.');
}
module.exports = { run };
