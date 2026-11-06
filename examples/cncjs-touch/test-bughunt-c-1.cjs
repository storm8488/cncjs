'use strict';
// Bug hunt C-1 (not registered in verify-project.cjs): every message of travel-check.js, read in
// English or Spanish, must be translated. The reason « course $130 inconnue. » is built at run time
// (travel-check.js check() and travelBox()) and has no catalogue row, so it stays in French.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const dir = path.join(__dirname, 'touch');
function load(language) {
  const store = new Map([['cncjs-touch-language-v1', language]]);
  const window = { localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) }, document: { documentElement: {}, title: '' } };
  window.window = window;
  const ctx = vm.createContext(window);
  ['i18n-messages.js', 'i18n-messages-machine.js', 'i18n-messages-profiles.js', 'i18n-messages-viz.js', 'i18n-messages-origin.js', 'i18n.js', 'travel-check.js']
    .forEach((f) => vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f }));
  return window;
}
const preview = { projection: { units: 'mm', bounds: [0, 0, 10, 10] } };
const FRENCH = /inconnue|course \$|non vérifi|aperçu|prise d|repère|déplacements|pouces|origine/;
const failures = [];
for (const language of ['en', 'es']) {
  const w = load(language);
  const cases = {
    'no $130': { settings: { $22: 1 }, coordinates: { mpos: { x: -100, y: -100 }, wpos: { x: 0, y: 0 } } },
    'no $131': { settings: { $22: 1, $130: 300 }, coordinates: { mpos: { x: -100, y: -100 }, wpos: { x: 0, y: 0 } } },
    '$22=0': { settings: { $22: 0, $130: 300, $131: 300 } },
    '$23=1': { settings: { $22: 1, $23: 1, $130: 300, $131: 300 } },
    'no position': { settings: { $22: 1, $130: 300, $131: 300 }, coordinates: {} }
  };
  for (const [name, machine] of Object.entries(cases)) {
    const r = w.CNCTravelCheck.check(preview, machine);
    if (FRENCH.test(r.message)) failures.push(language + ' check ' + name + ': ' + r.message);
  }
  const box = w.CNCTravelCheck.travelBox({ settings: { $22: 1 } });
  if (FRENCH.test(box.reason)) failures.push(language + ' travelBox no $130: ' + box.reason);
}
failures.forEach((f) => console.log('FAIL ' + f));
assert.deepStrictEqual(failures, [], failures.length + ' French message(s) in English/Spanish');
console.log('PASS test-bughunt-c-1');
