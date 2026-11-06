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
  assert(/^body\.ks-ui\.perf-wide\.perf-v2 /.test(s), 'scoped to perf-v2: ' + s);
  assert(/\[data-v2="suivi"\]|#perf-v2-(overrides|time)-sheet/.test(s), 'Suivi v2 grid or its sheets only: ' + s);
  assert(!/real-banner|simulation-banner|t-strip|#t-pause|#t-stop|#job-pause|#job-stop|#tabbar/.test(s), 'the strip is never targeted: ' + s);
}
const find = (re, prop) => rules.filter((r) => r.selectors.some((s) => re.test(s)) && (!prop || prop.test(r.decl)));
// One monitoring column of 432 px; the curve shown whatever the v1 zone count, its v1 polyline replaced.
assert(find(/\.job-dashboard\[data-zones\]\[data-v2="suivi"\]$/, /grid-template-columns:minmax\(0,1fr\) 432px/).length === 1, '432 px column');
assert(find(/\[data-v2="suivi"\] \.home-gauge-curve$/, /display:flex/).length === 1, 'curve visible under v2');
assert(!find(/home-gauge-curve$/, /display:none/).length, 'the curve is never hidden by this sheet');
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
console.log('PASS v2 Suivi style: scoped to perf-v2 (no media query, strip untouched), 432 px column, curve visible at 1366 px, text >= 16 px, 64 / 48 px targets, stale shown by form.');
