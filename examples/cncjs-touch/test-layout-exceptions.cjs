'use strict';
// Strict layout check of the browser harness (audit 31, layout): browser-run.cjs --strict fails on
// a covered command, a non-scrolling screen under scale 1, a target under its size goal or text
// under 16 px, in the variants the interface is made for, minus the documented exceptions of
// layout-exceptions.json (each with a reason). Checked here on synthetic measurements, no browser.
const fs = require('fs'), path = require('path'), assert = require('assert');
const { strictCheck, loadExceptions } = require('./browser-run.cjs');

// The exceptions file: every entry names a known check, valid patterns and a reason.
const file = JSON.parse(fs.readFileSync(path.join(__dirname, 'layout-exceptions.json'), 'utf8'));
assert(Array.isArray(file.exceptions), 'layout-exceptions.json has an "exceptions" list');
for (const e of loadExceptions()) {
  assert(['covered', 'scale', 'size', 'text'].includes(e.check), 'unknown check ' + e.check);
  assert(typeof e.reason === 'string' && e.reason.trim().length >= 20, 'each exception explains why: ' + JSON.stringify(e));
  for (const k of ['variant', 'screen', 'label']) if (e[k] !== undefined) new RegExp(e[k]);
}

const target = (o) => Object.assign({ label: 'Démarrer…', kind: 'primary', goal: 64, w: 282, h: 63.4, fontPx: 18, reachable: true, offscreen: false, hit: null }, o);
const screen = (o) => Object.assign({ screen: 'home', label: 'Suivi', scale: 1, scrolls: false, below: [], textTargets: [], small: [], unreachable: [] }, o);
const summary = { measurements: [
  { variant: '1024x600 texte agrandi', strict: true, results: [
    screen({ scale: 0.99, below: [target()] }),
    screen({ screen: 'files', label: 'Fichiers', unreachable: [target({ label: '2D', kind: 'secondary', reachable: false, hit: 'Fiche projet' }), target({ label: 'Parcours_3', reachable: false, offscreen: true, hit: 'Page 1 / 2' })] }),
    screen({ screen: 'settings', label: 'Réglages', scrolls: true, scale: 1, unreachable: [target({ label: 'Verrouiller l’écran', reachable: false, offscreen: true, hit: 'nothing' })] }),
    screen({ screen: 'jog', label: 'Préparer', small: [{ text: 'Pas', fontPx: 14.9 }] }),
    { screen: 'machine', label: 'Machine', error: 'timeout' }
  ] },
  { variant: '1366x768 zoom 200 %', strict: false, results: [screen({ scale: 0.5, below: [target()] })] }
] };
const r = strictCheck(summary, [
  { check: 'text', screen: '^jog$', label: '^Pas$', reason: 'synthetic: a documented label kept at 15 px for the test' },
  { check: 'size', variant: 'nothing matches', reason: 'synthetic: an exception that no longer applies' }
]);
const kinds = r.violations.map((v) => v.check + ':' + v.screen + ':' + v.label).sort();
assert.deepStrictEqual(kinds, ['covered:files:2D', 'covered:files:Parcours_3', 'scale:home:Suivi', 'size:home:Démarrer…'].sort(),
  'scale under 1, a 63.4 px primary, a covered segment and a row clipped under the pages fail; ' + JSON.stringify(kinds));
assert(!kinds.some((k) => k.includes('settings')), 'a target below the fold of a scrolling screen is not covered');
assert(!r.violations.some((v) => v.variant.includes('zoom')), 'browser zoom 200 % is reported, not enforced');
assert.equal(r.excepted.length, 1); assert.equal(r.excepted[0].reason, 'synthetic: a documented label kept at 15 px for the test');
assert.equal(r.staleExceptions.length, 1, 'an exception that matched nothing is listed as unused');
console.log('PASS layout exceptions: the strict harness fails on covered commands, scale under 1, targets under 64/48/96 px and text under 16 px, except documented entries; zoom 200 % and scrolling screens below the fold are not enforced.');
