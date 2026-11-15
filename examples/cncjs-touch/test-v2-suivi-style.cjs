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
const common=fs.readFileSync(__dirname+'/touch/responsive.css','utf8');
const layout=common.slice(common.indexOf('/* L5: fixed machining layout'));
assert(layout.includes('grid-template-columns:minmax(0,1.08fr) minmax(0,1fr)'),'same columns in both renderers');
assert(layout.includes('body.ks-ui.perf-wide.perf-v2 #screen-home .job-dashboard[data-zones][data-v2="suivi"]'),'shared layout overrides the old v2 grid');
assert(layout.includes('.home-stop{flex:0 0 98px;height:98px'),'Stop keeps a fixed space under the preview');
assert(layout.includes('#home-job-stop{min-height:64px;width:100%'),'full-width 64 px Stop');
assert(layout.includes('grid-template-columns:repeat(5,minmax(0,1fr));gap:12px'),'five equally sized override controls');
assert(layout.includes('.t-override--rapid .t-ov-row{grid-template-columns:repeat(3,minmax(0,1fr))}'),'three rapid controls');
assert(layout.includes('.t-ov-row .t-btn.t-fine{min-height:64px'),'fine overrides also 64 px');
assert(!css.includes('#perf-v2-overrides-sheet'),'no removed override sheet styles');
assert(layout.includes('#home-notice{min-height:100px'),'notice always has its space');
assert(!/#home-notice[^}]*overflow-y:auto/.test(layout),'no scrolling message slot');
assert(layout.includes('#home-resume-load{min-height:64px'),'resume load is a primary target');
assert(layout.includes('max-width:1100px'),'compact view stacks progress before preview');
assert(!/:has\(|color-mix\(|\bdvh\b/.test(layout),'shared style supports Chromium 106');
for(const r of rules){for(const m of r.decl.matchAll(/font(?:-size)?:[^;]*?(\d+(?:\.\d+)?)px/g))assert(Number(m[1])>=16,'v2 text >=16 px');assert(!/--fs-1[24]\b/.test(r.decl));}
assert(!/transform\s*:\s*scale/.test(layout),'no scaling of the fixed columns');
console.log('PASS machining style: shared command columns and targets, three permanent rows, fixed Stop, notice, compact ordering, v2 gate and Chromium 106 syntax.');
