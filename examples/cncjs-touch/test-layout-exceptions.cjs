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
// Lot Journal: rows closer than their height (v2 rows squeezed to a 37.5 px pitch for 56 px) and a v1 page that
// scrolls inside its box fail; adjacent rows exactly one height apart pass.
{
  const ok = { rows: 6, scrollHeight: 416, clientHeight: 432, bad: [] };
  const j = strictCheck({ measurements: [{ variant: 'screens v2-911-es-clair-cnc hors-ligne', strict: true, overlap: true, v2: true, results: [
    screen({ screen: 'history', label: 'Journal', journal: { v1: null, v2: { rows: 15, scrollHeight: 556, clientHeight: 556, bad: [{ row: 1, pitch: 37.5, height: 56 }] } } }),
    screen({ screen: 'history', label: 'Journal', journal: { v1: { rows: 8, scrollHeight: 476, clientHeight: 433, bad: [] }, v2: null } }),
    screen({ screen: 'history', label: 'Journal', journal: { v1: ok, v2: { rows: 15, scrollHeight: 930, clientHeight: 556, bad: [] } } }),
    // A row scrolled out of its scrolling list (v2 Journal kept at its newest end) is reached by scrolling it.
    screen({ screen: 'history', label: 'Journal', unreachable: [target({ label: 'row in list', kind: 'secondary', reachable: false, offscreen: true, scroller: true, hit: 'Commande' })] })
  ] }] }, []);
  assert.deepStrictEqual(j.violations.map((v) => v.check + ':' + v.label), ['journal-pitch:#v2k-list', 'journal-scroll:#real-history-list']);
}
// Lot C (avant l'essai CNC): a line of the v2 messages slot (#home-v2-info) cut net by its edge fails; a line whose drawn
// part lies in the fade band of the summary's mask, a line scrolled out of the box and a line inside pass. No exception.
{
  const { infoClipOf, stoppedChecks } = require('./browser-run.cjs');
  const line = (id, top, bottom) => ({ text: id, id, top, bottom });
  const slot = (fade, lines, clip) => ({ infoSlot: Object.assign({ top: 400, bottom: 600, clipTop: 400, clipBottom: 600, fadeTop: fade, fadeBottom: fade, lines }, clip || {}) });
  const lines = [line('above', 360, 385), line('inside', 420, 445), line('cut-bottom', 585, 610), line('cut-top', 390, 415), line('below', 620, 645)];
  assert.deepStrictEqual(infoClipOf(slot(0, lines)).map((c) => c.id + ':' + c.edge + ':' + c.out), ['cut-bottom:bottom:10', 'cut-top:top:10'], 'no mask: both cut lines fail');
  assert.deepStrictEqual(infoClipOf(slot(24, lines)), [], 'summary fade (24 px): the cut lines are drawn in the fade band');
  // In the band only: a line that starts above the band is still cut net at the edge.
  assert.deepStrictEqual(infoClipOf(slot(24, [line('tall', 560, 610)])).map((c) => c.id), ['tall']);
  // The fade belongs to the slot's own edge: cut by an ancestor above that edge, the line is cut net.
  assert.deepStrictEqual(infoClipOf(slot(24, [line('ancestor', 570, 595)], { clipBottom: 590 })).map((c) => c.id), ['ancestor']);
  assert.deepStrictEqual(infoClipOf({ infoSlot: null }), []);
  // A bottom-only fade (plate form): the top edge still cuts net.
  assert.deepStrictEqual(infoClipOf(slot(0, lines, { fadeBottom: 28 })).map((c) => c.id), ['cut-top']);
  const s = strictCheck({ measurements: [{ variant: 'screens v2-911-fr-sombre-cnc alarme-arret', strict: true, overlap: true, v2: true, results: [screen({ infoClip: infoClipOf(slot(0, lines)) })] }] }, []);
  assert.deepStrictEqual(s.violations.map((v) => v.check + ':' + v.label), ['info-clip:#cut-bottom', 'info-clip:#cut-top']);
  // « alarme après arrêt avec bilan »: the summary says the gauge's « line / lines » of the file (its preview), stopped.
  const ok = { shown: true, tone: 'warn', summary: 'Travail arrêté avant la fin · Parcours_de_test_1.gcode · durée 3 s · 6 / 25 lignes', gauge: '6 / 25', lines: 25, total: 20000 };
  assert.deepStrictEqual(stoppedChecks(ok), []);
  assert.deepStrictEqual(stoppedChecks(Object.assign({}, ok, { shown: false })), ['end-of-job summary not shown']);
  assert.equal(stoppedChecks(Object.assign({}, ok, { summary: 'Travail arrêté avant la fin · 4 800 / 20 000 lignes' })).length, 1, 'CNCjs count, not the gauge');
  assert.equal(stoppedChecks(Object.assign({}, ok, { gauge: '6 / 7' , summary: 'Travail arrêté · 6 / 7 lignes' })).length, 1, 'gauge scale not the file lines');
  assert.equal(stoppedChecks(Object.assign({}, ok, { total: 25 })).length, 1, 'file lines equal to CNCjs total prove nothing');
  assert.equal(stoppedChecks(Object.assign({}, ok, { tone: 'ok' })).length, 1, 'a stop is not « terminé »');
}
console.log('PASS layout exceptions: the strict harness fails on covered commands, scale under 1, targets under 64/48/96 px and text under 16 px, except documented entries; zoom 200 % and scrolling screens below the fold are not enforced.');
