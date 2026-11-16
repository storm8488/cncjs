'use strict';
const assert = require('assert').strict, vm = require('vm');
const S = require('./browser-surface.cjs'), H = require('./browser-run.cjs');
function element(id, parent) {
  return { id, parentElement: parent, children: [], disabled: false, scrollTop: 7, scrollLeft: 3,
    scrollHeight: 100, clientHeight: 100, css: { display: 'block', visibility: 'visible', overflowY: 'visible' },
    contains(n) { return n === this || this.children.some(c => c.contains(n)); },
    closest(sel) { if (/t-pause/.test(sel)) return /^t-(pause|stop)$/.test(this.id) ? this : null; return this.inert ? this : null; },
    getAttribute() { return null; }, getClientRects() { return [1]; },
    getBoundingClientRect() { return { left: 10, top: this.y || 10, width: 64, height: 64 }; },
    style: { value: 'none', priority: '', getPropertyValue() { return this.value; }, getPropertyPriority() { return this.priority; }, setProperty(k, v, p) { this.value = v; this.priority = p; }, removeProperty() { this.value = ''; } }
  };
}
const background = element('jog-zero-x'), stop = element('t-stop'), first = element('sheet'), top = element('pad'), key = element('key');
top.children.push(key);first.inert = true;
let layers = [first, top], hit = key;
const context = { window: { innerWidth: 1366, innerHeight: 768 }, document: { querySelectorAll: () => layers, elementFromPoint: () => hit }, getComputedStyle: n => n.css };
const run = fn => vm.runInNewContext('(' + fn + ')', context);
let scope = run(S.surface)();
assert(scope(stop));assert(scope(key));assert(!scope(background));assert(!scope(first));
layers = [];scope = run(S.surface)();assert(scope(background), 'without a modal an inert/covered command cannot escape measurement');
background.disabled = true;hit = background;
assert.equal(run(S.centreHit)(background), background);assert.equal(background.style.value, 'none', 'pointer policy is restored');
assert.equal(background.disabled, true, 'probe never enables a machine button');
const scroller = element('content'), target = element('button', scroller);scroller.css.overflowY = 'auto';scroller.scrollHeight = 400;
target.y = 900;target.scrollIntoView = () => { scroller.scrollTop = 150; target.y = 100; };
assert(run(S.scrollReachable)(target, () => target));assert.equal(scroller.scrollTop, 7);
assert(!run(S.scrollReachable)(target, () => background), 'scrolling never excuses a covered target');assert.equal(scroller.scrollLeft, 3);
scroller.css.overflowY = 'hidden';assert(!run(S.scrollReachable)(target, () => target), 'clipping is not scrolling');
function strict(t, scrolls) { return H.strictCheck({ measurements: [{ variant: 'harn', strict: true, results: [{ screen: 'jog', label: 'Zero', scrolls, unreachable: [t] }] }] }, []).violations; }
assert.equal(strict({ label: 'hidden command', offscreen: true }, true).length, 1, 'a scrolling screen needs per-target reachability proof');
assert.equal(strict({ label: 'scrolled command', offscreen: true, scroller: true }, false).length, 0);
assert.equal(strict({ label: 'covered command', offscreen: false, scroller: true }, false).length, 1);
for (const source of [H.MEASURE, H.V2_OVERLAP]) assert(source.includes('var inSurface='), 'both geometry measurers use the foreground surface');
const overlays = require('./browser-strip.cjs');
assert(overlays.OVERLAYS.some(x => x[0] === 'sheet: control details'));
assert(overlays.REAL_ONLY.some(x => x[0] === 'sheet: other zeros'));
assert(!overlays.REAL_ONLY.some(x => /preparation|origin help|dimensions/.test(x[0])));
console.log('PASS HARN measurement: modal surface, kept strip stops, disabled paint, proven scroll and clipping failures.');
