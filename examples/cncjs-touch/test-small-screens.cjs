'use strict';
// Lot F16 « Petits écrans et portrait » (design/PROMPT-FONCTIONS-6.md § 2). Static half of the lot's proof; the
// rendered half is the step « small » of browser-run.cjs (browser-small.cjs).
//  1. The F16 rules of responsive.css are all inside media queries, and none of these queries matches the two
//     tablets (1366 x 911 Surface Pro CNC, 1366 x 768 RT laser, in either orientation of the rounding): the two
//     tablets render exactly as before. Each query matches the window it was written for.
//  2. No :has(), color-mix() or dvh (Chromium 106 on the RT).
//  3. The step « small » covers the phone held upright (412 x 915, 360 x 800) and 1024 x 600, in FR / EN / ES,
//     standard and large text, at rest, in a job, paused and in alarm, and browser-run.cjs runs it by default.
//  4. Its checks (stripChecks) refuse a strip without Pause or Arrêter, a command under 64 px, covered or out of
//     the window, a horizontal scroll, and a rail that is not one row along the bottom edge.
const fs = require('fs'), path = require('path'), assert = require('assert');
const css = fs.readFileSync(path.join(__dirname, 'touch', 'responsive.css'), 'utf8');
const MARK = '/* === F16: phone held upright';
const start = css.indexOf(MARK);
assert(start > 0, 'F16 section of responsive.css found');
// The F16 section runs to the end of the file; another lot may append after it under its own heading.
const section = css.slice(start).replace(/\/\*[\s\S]*?\*\//g, '');

// --- 1. Top-level blocks of the section: every one is an @media block.
const blocks = [];
for (let i = 0, depth = 0, head = 0; i < section.length; i++) {
  const c = section[i];
  if (c === '{') { if (depth === 0) blocks.push({ prelude: section.slice(head, i).trim(), at: i }); depth++; }
  else if (c === '}') { depth--; assert(depth >= 0, 'balanced braces'); if (depth === 0) head = i + 1; }
}
assert(blocks.length >= 4, 'F16 media blocks found (' + blocks.length + ')');
const queries = blocks.map((b) => { assert(/^@media\b/.test(b.prelude), 'F16 rule outside a media query: ' + b.prelude.slice(0, 80)); return b.prelude.replace(/^@media\s*/, ''); });

// A media query evaluator for what the section uses: comma = or, and, (min|max)-(width|height), orientation.
function matches(query, w, h) {
  return query.split(',').some((alt) => alt.trim().split(/\s+and\s+/).every((cond) => {
    const m = /^\((min|max)-(width|height):\s*(\d+)px\)$/.exec(cond.trim());
    if (m) { const v = m[2] === 'width' ? w : h, n = Number(m[3]); return m[1] === 'min' ? v >= n : v <= n; }
    const o = /^\(orientation:\s*(portrait|landscape)\)$/.exec(cond.trim());
    if (o) return o[1] === 'portrait' ? h >= w : w > h;
    throw new Error('condition not understood: ' + cond);
  }));
}
// The two tablets, the rounding of their windows, and each with a 320 px on-screen keyboard over it.
const TABLETS = [[1366, 911], [1367, 911], [1366, 912], [1366, 768], [1367, 768], [1366, 591], [1366, 448]];
for (const q of queries) for (const [w, h] of TABLETS) assert(!matches(q, w, h), '@media ' + q + ' matches the tablet ' + w + ' x ' + h);
const phone = queries.filter((q) => matches(q, 412, 915)), small = queries.filter((q) => matches(q, 360, 800)), low = queries.filter((q) => matches(q, 1024, 600));
assert(phone.length >= 2 && small.length === phone.length, 'the phone blocks match 412 x 915 and 360 x 800 alike');
assert(low.length >= 3, 'the 1024 x 600 blocks match 1024 x 600');
assert(queries.every((q) => matches(q, 412, 915) || matches(q, 1024, 600) || matches(q, 1180, 820)), 'every F16 block serves a target window');
// The phone block holds the strip (Pause / Arrêter beside the state) and the folded rail.
const phoneCss = section.slice(blocks.find((b) => b.prelude === '@media (max-width:599px)').at);
['#t-pause', '#t-stop', '#t-pilot', '.ks-nav-name', '--statusbar-h'].forEach((s) => assert(phoneCss.indexOf(s) > 0, 'phone block styles ' + s));
assert(/#t-stop\{grid-column:3;grid-row:1;[^}]*height:64px/.test(phoneCss), 'Arrêter 64 px on the first row of the phone strip');

// --- 2. Chromium 106.
assert(!/:has\(|color-mix\(|\bdvh\b/.test(section), 'no :has(), color-mix() or dvh in the F16 rules');

// --- 3. The step and its variants.
const small2 = require('./browser-small.cjs');
const sizes = new Set(small2.VARIANTS.map((v) => v.w + 'x' + v.h));
['412x915', '360x800', '1024x600'].forEach((s) => assert(sizes.has(s), 'variant ' + s));
['fr', 'en', 'es'].forEach((l) => assert(small2.VARIANTS.some((v) => v.lang === l && v.portrait) && small2.VARIANTS.some((v) => v.lang === l && v.w === 1024), 'language ' + l + ' on a phone and at 1024 x 600'));
['standard', 'large'].forEach((s) => ['412x915', '360x800', '1024x600'].forEach((z) => assert(small2.VARIANTS.some((v) => v.size === s && v.w + 'x' + v.h === z), s + ' text at ' + z)));
['idle', 'running', 'paused', 'alarm'].forEach((p) => ['412x915', '360x800', '1024x600'].forEach((z) => assert(small2.VARIANTS.some((v) => v.states.indexOf(p) >= 0 && v.w + 'x' + v.h === z), p + ' at ' + z)));
assert.deepStrictEqual(small2.SCREENS.slice(0, 2).map((s) => s[0]), ['home', 'machine'], 'Usinage and Machine first');
assert(small2.VARIANTS.every((v) => (v.w < 600) === !!v.portrait), 'phones checked as portrait, 1024 x 600 not');
const run = fs.readFileSync(path.join(__dirname, 'browser-run.cjs'), 'utf8');
assert(/option\('--only', '[^']*\bsmall\b/.test(run), 'browser-run.cjs runs « small » by default');
assert(/ONLY\.includes\('small'\)[^\n]*browser-small\.cjs/.test(run), 'browser-run.cjs calls browser-small.cjs');

// --- 4. The strip and rail checks.
const btn = (id, o) => Object.assign({ id, disabled: false, inside: true, w: 120, h: 64, bad: [], inert: null }, o);
const rail = (o) => Object.assign({ top: 843, bottom: 915, left: 0, right: 412, entries: ['machine', 'files', 'jog', 'check', 'home', 'more'].map((s, i) => ({ screen: s, x: i * 68, y: 847, w: 64, h: 64, hit: true })) }, o);
const good = { vw: 412, vh: 915, buttons: [btn('t-stop'), btn('t-pause')], wide: { document: 0, main: 0, active: 0, clientWidth: 412 }, rail: rail() };
assert.deepStrictEqual(small2.stripChecks(good, true), [], 'a correct phone strip passes');
const variant = (patch) => small2.stripChecks(Object.assign({}, good, patch), true);
assert(variant({ buttons: [btn('t-pause')] }).some((e) => /Arrêter not shown/.test(e)), 'Arrêter missing');
assert(variant({ buttons: [btn('t-stop')] }).some((e) => /Pause .* not shown/.test(e)), 'Pause missing');
assert(variant({ buttons: [btn('t-stop', { h: 60 }), btn('t-resume')] }).some((e) => /t-stop .*goal 64/.test(e)), 'Arrêter under 64 px');
assert(variant({ buttons: [btn('t-stop'), btn('t-pause', { inside: false })] }).some((e) => /t-pause not wholly inside/.test(e)), 'Pause out of the window');
assert(variant({ buttons: [btn('t-stop', { bad: ['centre: #ks-sheet'] }), btn('t-pause')] }).some((e) => /t-stop covered/.test(e)), 'Arrêter covered');
assert(variant({ wide: { document: 0, main: 430, active: 0, clientWidth: 412 } }).some((e) => /horizontal scroll/.test(e)), 'horizontal scroll');
assert(variant({ cause: { text: 'Usinage en cours.', scroll: 26, client: 25, max: 77 } }).some((e) => /step bar sentence scrolls/.test(e)), 'step bar sentence scrolling for a pixel');
assert.deepStrictEqual(variant({ cause: { text: 'long', scroll: 120, client: 77, max: 77 } }), [], 'a sentence longer than three lines may scroll');
assert(variant({ stateCut: 'Mecanizado en curso' }).some((e) => /step state cut/.test(e)), 'step state cut by an ellipsis');
assert(variant({ rail: rail({ top: 0, bottom: 915, right: 88 }) }).some((e) => /bottom edge/.test(e)), 'rail on the side');
const twoRows = rail(); twoRows.entries[5] = Object.assign({}, twoRows.entries[5], { y: 790 });
assert(variant({ rail: twoRows }).some((e) => /2 rows/.test(e)), 'rail on two rows');
const thin = rail(); thin.entries[2] = Object.assign({}, thin.entries[2], { w: 40 });
assert(variant({ rail: thin }).some((e) => /rail jog .*goal 48/.test(e)), 'rail entry under 48 px');
assert.deepStrictEqual(small2.stripChecks(Object.assign({}, good, { rail: null }), false), [], 'the rail is not checked at 1024 x 600');
console.log('test-small-screens: PASS (' + queries.length + ' F16 media blocks, none matches 1366 x 911 or 1366 x 768; ' + small2.VARIANTS.length + ' variants)');
