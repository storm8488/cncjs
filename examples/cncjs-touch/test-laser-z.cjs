'use strict';
// « Axe Z du laser » (laser-z.js): shown by default; Masqué hides the Z elements only with a laser
// profile (body.laser-no-z + data-laser-z), never in CNC; kept in this browser; corrupt value reads
// as shown; no request, no command.
const assert = require('assert').strict, fs = require('fs'), path = require('path'), vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, 'touch', 'laser-z.js'), 'utf8');
const KEY = 'cncjs-touch-laser-z-v1';

function el(tagName, textContent, attrs) {
  const a = Object.assign({}, attrs || {});
  return { tagName, textContent: textContent || '', hidden: false, attrs: a, handlers: {}, nextElementSibling: null,
    setAttribute(k, v) { a[k] = String(v); }, getAttribute(k) { return k in a ? a[k] : null; }, hasAttribute(k) { return k in a; },
    addEventListener(n, f) { this.handlers[n] = f; }, click() { this.handlers.click(); }, querySelector() { return null; }, querySelectorAll() { return []; } };
}
function setup(values, kind) {
  const spies = { xhr: 0 }, listeners = {}, classes = new Set();
  // Z elements of the screens: a coordinate triple, a table row, Z buttons, the jog row, its heading; and X ones.
  const axisZ = el('SPAN', 'Z', { class: 't-axis' }), valZ = el('B', '0.000'), unitZ = el('SPAN', 'mm'); axisZ.nextElementSibling = valZ; valZ.nextElementSibling = unitZ;
  const axisX = el('SPAN', 'X', { class: 't-axis' }), valX = el('B', '1.000'); axisX.nextElementSibling = valX;
  const thZ = el('TH', 'Z'), rowZ = el('TR', 'Z 0'); rowZ.querySelector = () => thZ;
  const thX = el('TH', 'X'), rowX = el('TR', 'X 0'); rowX.querySelector = () => thX;
  const zero = el('BUTTON', 'Zéro Z'), zplus = el('BUTTON', 'Z+'), xplus = el('BUTTON', 'X+'), zrow = el('DIV', ''), title = el('H2', 'Axe Z'), titleXY = el('H2', 'Axes X / Y');
  const choices = [el('BUTTON', 'Affiché', { 'data-laser-z-choice': 'on' }), el('BUTTON', 'Masqué', { 'data-laser-z-choice': 'off' })];
  const card = el('DIV', '', {}); card.querySelectorAll = () => choices;
  const machineCard = { insertAdjacentHTML(where, html) { assert.equal(where, 'afterend'); assert.match(html, /id="ks-laser-z-card"/); } };
  const select = (sel) => {
    if (sel === '.t-coords > .t-axis') return [axisZ, axisX];
    if (sel === 'tr') return [rowZ, rowX];
    if (sel === 'button') return [zero, zplus, xplus];
    if (/data-axis/.test(sel)) return [zrow];
    if (sel === 'h2') return [title, titleXY];
    if (sel === '[data-laser-z-choice]') return choices;
    return [];
  };
  const document = { readyState: 'complete', body: { classList: { toggle: (n, on) => (on ? classes.add(n) : classes.delete(n)) } },
    getElementById: (id) => (id === 'ks-machine-kind-card' ? machineCard : id === 'ks-laser-z-card' ? card : id === 'laser-z-status' ? el('P') : null),
    querySelectorAll: select, addEventListener() {} };
  let current = kind;
  const window = { localStorage: { getItem: (k) => (values.has(k) ? values.get(k) : null), setItem: (k, v) => values.set(k, String(v)) },
    cncProfile: { kind: () => current }, XMLHttpRequest: function () { spies.xhr++; },
    addEventListener(n, f) { listeners[n] = f; } };
  vm.runInNewContext(source, { window, document, JSON, String, Array, setTimeout });
  const change = (k) => { current = k; listeners['cnc-profile-change'](); };
  return { window, classes, card, choices, change, spies, z: [axisZ, valZ, unitZ, rowZ, zero, zplus, zrow, title], other: [axisX, valX, rowX, xplus, titleXY] };
}

const values = new Map();
// CNC: the card stays hidden, nothing is hidden even if Masqué was stored.
values.set(KEY, JSON.stringify({ version: 1, z: false }));
let s = setup(values, 'cnc');
assert.equal(s.card.hidden, true); assert.equal(s.classes.has('laser-no-z'), false);
// Laser with Masqué stored: every Z element tagged, X/Y untouched, the body class set, Masqué pressed.
s.change('laser');
assert.equal(s.card.hidden, false); assert(s.classes.has('laser-no-z'));
s.z.forEach((e) => assert(e.hasAttribute('data-laser-z'), 'tagged: ' + e.tagName + ' ' + e.textContent));
s.other.forEach((e) => assert(!e.hasAttribute('data-laser-z'), 'not tagged: ' + e.tagName + ' ' + e.textContent));
assert.equal(s.choices[1].getAttribute('aria-pressed'), 'true');
// Affiché: shown again at once and stored; back to CNC keeps it shown.
s.choices[0].click();
assert.equal(s.classes.has('laser-no-z'), false); assert.deepEqual(JSON.parse(values.get(KEY)), { version: 1, z: true });
s.choices[1].click(); assert(s.classes.has('laser-no-z'));
s.change('cnc'); assert.equal(s.classes.has('laser-no-z'), false); assert.equal(s.card.hidden, true);
// Default (nothing stored) and corrupt value: Z shown.
s = setup(new Map(), 'laser'); assert.equal(s.classes.has('laser-no-z'), false); assert.equal(s.choices[0].getAttribute('aria-pressed'), 'true');
s = setup(new Map([[KEY, '{bad']]), 'laser'); assert.equal(s.classes.has('laser-no-z'), false);
assert.equal(s.spies.xhr, 0);
// The rule exists and only applies to a laser profile.
assert.match(fs.readFileSync(path.join(__dirname, 'touch', 'responsive.css'), 'utf8'), /body\.machine-laser\.laser-no-z \[data-laser-z\]\{display:none!important\}/);
for (const page of ['index.html', 'simulation.html']) assert(fs.readFileSync(path.join(__dirname, 'touch', page), 'utf8').includes('laser-z.js?v='), page);
console.log('PASS laser Z switch: hidden by choice in laser only, every Z element tagged and no X/Y one, shown by default and on a corrupt value, kept in this browser, no request.');
