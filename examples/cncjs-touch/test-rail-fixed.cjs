'use strict';
// Source/DOM contracts and negative controls for the rendered rail measurement.
// Actual rectangles are checked by browser-run --strict --only rail.
const assert = require('assert').strict;
const fs = require('fs');
const vm = require('vm');
const postcss = require('postcss');
const { page } = require('./session-dom-fixture.cjs');
const read = file => fs.readFileSync(__dirname + '/' + file, 'utf8');
const app = postcss.parse(read('touch/app.css'));
const responsive = postcss.parse(read('touch/responsive.css'));
function declaration(css, selector, property) {
 let value;
 css.walkRules(rule => {
  if (rule.parent.type !== 'root' || !rule.selectors.includes(selector)) return;
  rule.walkDecls(property, d => { value = d.value; });
 });
 return value;
}
assert.equal(declaration(app, '#tabbar', 'overflow'), 'hidden', 'both rail axes must forbid scrollbars');
assert.equal(declaration(app, '#tabbar', 'overflow-x'), undefined, 'no leftover automatic horizontal scrolling');
assert.equal(declaration(responsive, 'body.ks-ui #tabbar .ks-nav', 'width'), '100%', 'buttons use the space inside the rail border');
assert.equal(declaration(responsive, 'body.ks-ui.display-large #tabbar .ks-nav-name', 'font-size'), '18px', 'large labels are actually enlarged');
// Border-box rail: 88 - border 1 - padding 2*8 = 71, not the former 72px.
const rail = declaration(responsive, 'body.ks-ui #tabbar', 'padding');
const padding = parseFloat(rail);
const top = parseFloat(declaration(responsive, 'body.ks-ui #tabbar', 'top'));
const gap = parseFloat(declaration(responsive, 'body.ks-ui #tabbar', 'gap'));
const stepHeight = parseFloat(declaration(responsive, 'body.ks-ui #tabbar .ks-nav', 'height'));
const moreHeight = parseFloat(declaration(responsive, 'body.ks-ui #tabbar .ks-nav[data-ks-screen="more"]', 'height'));
assert(88 - 1 - 2 * padding >= 64, 'rail targets stay at least 64px wide');
assert(stepHeight >= 64 && moreHeight >= 64, 'rail targets stay at least 64px high');
for (const height of [768, 911]) {
 for (const back of [false, true]) {
  const steps = back ? 6 : 5;
  assert(steps * stepHeight + moreHeight + steps * gap + 2 * padding <= height - top,
   'all entries fit vertically, even with an extra Back entry, at ' + height);
 }
}
for (const language of ['fr', 'en', 'es']) {
 const p = page(language);
 p.run('interface-guide.js');
 p.run('touch-shell.js');
 const entries = () => p.document.querySelectorAll('#tabbar .ks-nav').map(n => n.getAttribute('data-ks-screen'));
 const expected = ['machine', 'files', 'jog', 'check', 'home', 'more'];
 assert.deepEqual(entries(), expected);
 for (const screen of ['history', 'settings', 'guide']) {
  p.window.cncShell.go(screen);
  assert(p.document.querySelector('#screen-' + screen + ' .ks-back'), screen + ' provides its own Back button');
  assert.deepEqual(entries(), expected, 'Back never displaces a session entry');
 }
 p.emit('pagehide');
}
const { MEASURE, railChecks, strictCheck } = require('./browser-run.cjs');
const geometry = () => ({ clientWidth: 87, scrollWidth: 87, clientHeight: 696, scrollHeight: 696,
 overflowX: 'hidden', overflowY: 'hidden', scrollLeft: 0, scrollTop: 0, large: false,
 buttons: ['machine', 'files', 'jog', 'check', 'home', 'more'].map(screen => ({
  screen, shown: true, w: 71, h: 88, inside: true, hit: true, textOut: 0, font: 16, gap: 12
 })) });
assert.deepEqual(railChecks(geometry()), []);
assert.deepEqual(railChecks({ ...geometry(), buttons: undefined }), [], 'ordinary measurements also check both scroll axes');
for (const mutate of [d => { d.scrollWidth++; }, d => { d.scrollHeight++; },
 d => { d.overflowX = 'auto'; }, d => { d.overflowY = 'scroll'; },
 d => { d.scrollLeft = 1; }, d => { d.scrollTop = 1; },
 d => { d.buttons.pop(); }, d => { d.buttons[1].screen = 'back'; },
 d => { d.buttons[5].shown = false; }, d => { d.buttons[0].w = 63; },
 d => { d.buttons[0].h = 63; }, d => { d.buttons[5].inside = false; },
 d => { d.buttons[5].hit = false; }, d => { d.buttons[0].textOut = 1; },
 d => { d.buttons[0].font = 15; }, d => { d.large = true; },
 d => { d.buttons[1].gap = 8; }]) {
 const data = geometry(); mutate(data);
 assert(railChecks(data).length, 'rail measurement must reject its negative control');
}
const large = geometry(); large.large = true; large.buttons.forEach(b => { b.font = 18; });
assert.deepEqual(railChecks(large), []);
for (const axis of ['scrollWidth', 'scrollHeight']) {
 const data = geometry(); data[axis]++;
 const result = strictCheck({ measurements: [{ strict: true, variant: 'rail v1-768', results: [{ screen: 'machine', label: 'Machine', railScroll: data }] }] }, []);
 assert(result.violations.some(v => v.check === 'rail-scroll'), 'strict mode rejects even one pixel on ' + axis);
}
// Execute the actual generic browser measurement with an otherwise empty DOM.
// Reverting MEASURE to its former width-only +1 tolerance must fail as well.
for (const patch of [{}, { scrollWidth: 88 }, { scrollHeight: 697 }, { overflowX: 'auto', overflowY: 'auto' }]) {
 const rail = { ...geometry(), ...patch }; delete rail.buttons;
 const data = vm.runInNewContext('(' + MEASURE + ')({})', {
  window: { innerWidth: 1366, innerHeight: 768, devicePixelRatio: 1 },
  document: { body: { className: 'ks-ui' }, documentElement: { scrollWidth: 1366, clientWidth: 1366, scrollHeight: 768, clientHeight: 768, getAttribute: () => null },
   querySelector: () => null, querySelectorAll: () => [], getElementById: id => id === 'tabbar' ? rail : null },
  getComputedStyle: () => rail
 });
 assert(data.railScroll && typeof data.railScroll === 'object', 'generic measurement must expose both axes even when only one pixel overflows');
 assert.equal(data.railScroll.clientWidth, 87, 'generic measurement retains the exact rail dimensions');
 assert.equal(railChecks(data.railScroll).length > 0, Object.keys(patch).length > 0, 'generic measurement feeds both axes and overflow policy into strict mode');
}
console.log('PASS fixed rail: border budget, six entries with Back, both scroll axes, 64px targets and strict negative controls, FR/EN/ES.');
