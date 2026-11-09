'use strict';
// performance-v2.css (lot L4): scoped to body.perf-v2, the curve shown at 1366 px, Chromium 106 syntax,
// text >= 16 px, targets 64 / 48 px, strip never targeted. Static checks of the sheet; L7 measures it.
const assert = require('assert').strict, fs = require('fs');
const css = fs.readFileSync(__dirname + '/touch/performance-v2.css', 'utf8');
assert(!/\r/.test(css), 'LF line endings');
const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
assert(!/@media|@container|@supports/.test(body), 'the gate is the class, never a media query');
assert(!/:has\(|color-mix\(|\bdvh\b|\bsvh\b|&/.test(body), 'Chromium 106 syntax only');
assert(!/transform\s*:\s*scale/.test(body), 'no scaling to make things fit');
const rules = [...body.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({selectors: m[1].split(',').map((s) => s.trim()), decl: m[2]}));
assert(rules.length > 20, 'rules parsed');
for (const r of rules) for (const s of r.selectors) {
  // Large text (.display-large, a display setting, never a machine state) may give a slot more room.
  assert(/^body\.ks-ui\.perf-wide\.perf-v2(\.t-inspect|\.display-large)? /.test(s), 'scoped to perf-v2: ' + s);
  assert(/\[data-v2="suivi"\]|#perf-v2-(overrides|time)-sheet/.test(s), 'Suivi v2 grid or its sheets only: ' + s);
  assert(!/real-banner|simulation-banner|t-strip|#t-pause|#t-stop|#job-pause|#job-stop|#tabbar/.test(s), 'the strip is never targeted: ' + s);
}
const find = (re, prop) => rules.filter((r) => r.selectors.some((s) => re.test(s)) && (!prop || prop.test(r.decl)));
// One monitoring column of 432 px; the curve shown whatever the v1 zone count, its v1 polyline replaced.
assert(find(/\.job-dashboard\[data-zones\]\[data-v2="suivi"\]$/, /grid-template-columns:minmax\(0,1fr\) 432px/).length === 1, '432 px column');
assert(find(/\[data-v2="suivi"\] \.home-gauge-curve$/, /display:flex/).length === 1, 'curve visible under v2');
// Migrated (lot Suivi 2026-11): the curve gives its room only to a hold / alarm safety text, an open plate or resume
// form, or large text; never otherwise.
assert(!find(/home-gauge-curve$/, /display:none/).filter((r) => !r.selectors.every((x) => /\[data-v2-(alert|form)="1"\] \.home-gauge-curve$|^body\.ks-ui\.perf-wide\.perf-v2\.display-large /.test(x))).length, 'the curve is never hidden by this sheet, except for a safety text, a form or large text');
assert(find(/\[data-v2-alert="1"\] #home-v2-info$/, /min-height:calc\(4 \* 1\.35em \+ 12px\)/).length === 1, 'a hold or alarm text: four lines without scrolling');
assert(find(/\[data-v2-form="1"\] #home-v2-info$/, /min-height:180px/).length === 1, 'an open plate or resume form: its first field without scrolling');
// Final harness (2026-11-09): with the curve above the corrections, hiding it moved the feed row 152 px between rest
// (plate shown) and a job. The curve is drawn after the corrections, so only the messages slot below gets its room.
assert(find(/\.home-zone-gauges>\.home-gauge-curve$/, /(^|;)order:1(;|$)/).length === 1, 'curve drawn under the corrections: hiding it never moves a command');
assert(!rules.some((r) => /(^|;)order:/.test(r.decl) && r.selectors.some((s) => /\.home-overrides$|\.home-progress$|\.home-gauge-eta$|\.home-coords$/.test(s))), 'the slots above the curve keep their order');
assert(find(/#home-v2-actions #home-job-load$/, /font-size:var\(--fs-18\)/).length === 1, 'Charger at 18 px (the id alone lost to #home-v2-actions .t-btn)');
assert(find(new RegExp('\\[data-v2="suivi"\\] \\.home-stop$'), /(^|;)height:96px/).filter((r) => /padding-top:6px/.test(r.decl)).length === 1, 'Arrêter at least 12 px under the actions (gap 6 + padding 6), its caption whole');
assert(find(/\.home-gauge-curve-line$/, /display:none/).length === 1, 'v1 polyline replaced by the v2 path');
// Text: no size below 16 px, no small token.
for (const r of rules) {
  for (const m of r.decl.matchAll(/font(?:-size)?:[^;]*?(\d+(?:\.\d+)?)px/g)) assert(Number(m[1]) >= 16, 'text >= 16 px: ' + r.decl);
  assert(!/--fs-1[24]\b/.test(r.decl), 'no 12 / 14 px token: ' + r.decl);
}
// Targets: buttons of the column and sheets at 64 (main) or 48 px (fine, secondary).
for (const r of find(/\.t-btn/, /min-height/)) assert(/min-height:var\(--tap(-primary)?\)/.test(r.decl), 'button target 48 / 64 px: ' + r.selectors[0]);
assert(find(/\.t-override\[data-kind="feed"\] \.t-ov-row \.t-btn$/, /min-height:var\(--tap-primary\)/).length === 1, '±10 / 100 % at 64 px');
assert(find(/\.home-v2-more \.t-btn$/, /min-height:var\(--tap\)/).length === 1, 'sheet buttons at 48 px');
// Stale is a form, not only a colour.
assert(find(/#home-v2-age\[data-state="stale"\]/, /border-left-style:dashed/).length === 1, 'stale age: dashed mark');
assert(find(/\[data-v2-report="stale"\].*\.t-coords-card/, /border-style:dashed/).length === 1, 'stale position: dashed frame');
// D1 (REFLEXION § 3.10): every slot of the scene and the column keeps its rectangle in every state. Fixed
// heights; content that comes and goes is hidden inside its slot, never collapsing it.
const S = '\\[data-v2="suivi"\\] ';
for (const slot of ['\\.home-v2-confidence', '\\.tool-position-note', '\\.home-v2-sequence', '\\.home-progress', '\\.home-gauge-eta', '\\.home-coords', '\\.home-gauge-curve', '\\.home-overrides', '#home-v2-actions', '\\.home-stop'])
  assert(find(new RegExp(S + slot + '$'), /(^|;)height:\d+px/).length >= 1, 'fixed height: ' + slot);
assert(find(new RegExp(S + '#home-v2-info$'), /flex:1 1 0/).filter((r) => /min-height:0/.test(r.decl) && /overflow-y:auto/.test(r.decl)).length === 1, 'messages share one scrolling slot');
assert(find(new RegExp(S + '#home-overrides\\[hidden\\]$'), /visibility:hidden/).length === 1, 'an unavailable override card keeps its place');
for (const [id, column] of [['home-job-load', '1'], ['home-job-primary-row', '2/4'], ['home-job-resume-row', '2/4']])
  assert(find(new RegExp(S + '#' + id + '$'), new RegExp('grid-column:' + column + ';grid-row:1')).length === 1, 'fixed place in the action slot: ' + id);
assert(!rules.some((r) => /:empty|\[hidden\]/.test(r.selectors.join()) && /display:none/.test(r.decl) && /\[data-v2="suivi"\]/.test(r.selectors.join()) && !/#home-v2-info|#home-v2-actions/.test(r.selectors.join())), 'no slot collapses when empty or hidden');
// D5: the work coordinates of both pages (index #home-work-card, simulation's own card) on one line.
assert(find(new RegExp(S + '\\.home-coords \\.t-coords-card \\.t-coords$'), /grid-template-columns/).length === 1, 'one-line coordinates on both pages');
// Surface Pro 2026-11-09, alarm after a stop: the summary's slot fades at both edges (no half line shown whole),
// and « Recharger le fichier » alone takes the whole row. Display only, both scoped to v2 Suivi.
assert(/\[data-v2-summary="1"\] #home-v2-info\{[^}]*padding:var\(--v2-info-fade\) 0;[^}]*mask-image:linear-gradient\(to bottom,transparent/.test(css), 'summary slot fades at both edges');
assert(/\[data-v2="suivi"\] #home-v2-actions #home-job-load\[data-alone="1"\]\{grid-column:1\/-1\}/.test(css), 'reload alone takes the row');
console.log('PASS v2 Suivi style: fixed slots in every state (D1), one-line coordinates on both pages (D5), scoped to perf-v2 (no media query, strip untouched), 432 px column, curve visible at 1366 px, text >= 16 px, 64 / 48 px targets, stale shown by form.');
