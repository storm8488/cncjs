'use strict';
// Resolve the shipped cascade, including the deferred v2 sheet. These are
// source/layout contracts; browser-run still owns rendered hit tests.
const assert = require('assert').strict;
const { value, parseDOM, select } = require('./test-vert-layout.cjs');
const { page } = require('./session-dom-fixture.cjs');
function dom(html) { return parseDOM(html); }
function node(tree, selector) { const n = select.selectOne(selector, tree); assert(n, selector); return n; }
for (const [w, h] of [[720,1080],[960,1440],[540,960],[683,384],[1366,448]]) {
 const tree = dom('<body class="ks-ui t-compact"><nav id="tabbar"><button class="ks-nav"><span class="ks-nav-name">Machine</span></button></nav></body>');
 const rail = node(tree, 'nav'), button = node(tree, 'button');
 const padding = parseFloat(value(rail, 'padding', w, h));
 const height = parseFloat(value(button, 'height', w, h));
 assert(height >= 64);
 assert(padding * 2 + height + 1 <= 72, w + 'x' + h + ': bottom rail includes its border and padding');
}
for (const [w, h] of [[1024,600],[1080,720],[600,960],[1366,448]]) {
 const tree = dom('<body class="ks-ui ks-real t-compact"><main><section id="screen-machine" class="screen ks-step-screen active"><div class="ks-step-body"><div id="machine-layout" data-incident="true"><div class="ks-machine-column"><div id="machine-ready" class="card"></div></div></div></div></section></main></body>');
 const layout = node(tree, '#machine-layout');
 assert.equal(value(layout, 'flex', w, h), 'none', 'the complete checklist and incident contribute their natural height');
 assert.equal(value(layout, 'grid-auto-rows', w, h), 'max-content');
}
for (const [w, h] of [[1366,768],[1024,600]]) {
 const tree = dom('<body class="ks-ui" data-simulation="true"><main><section id="screen-jog" class="screen ks-step-screen active"><div class="ks-step-body"><div class="card ks-motion-coordinates"></div></div></section></main></body>');
 assert.equal(value(node(tree, '.ks-motion-coordinates'), 'min-height', w, h), 'min-content', 'simulation coordinates cannot paint outside their card');
 assert.equal(value(node(tree, '.ks-step-body'), 'overflow', w, h), 'auto', 'simulation cards scroll inside the session body');
}
for (const classes of ['ks-ui','ks-ui perf-wide perf-v2','ks-ui perf-wide perf-v2 display-large']) {
 for (const alarm of ['0','1']) {
  const tree = dom('<body class="' + classes + '"><main><section id="screen-home" class="screen ks-step-screen active" data-fit-overflow="true"><div class="ks-step-body"><div class="card wide"><div class="job-dashboard" data-zones="2" data-v2="suivi" data-v2-alert="' + alarm + '"><div class="home-left"><div class="job-art"></div><div class="home-stop"></div><div class="home-gauge-curve"></div></div><div class="job-metrics"><div id="home-overrides"><div class="t-override"><div class="t-ov-row">' + Array.from({ length: 5 }, () => '<button class="t-btn"></button>').join('') + '</div></div></div></div></div></div></div></section></main></body>');
  for (const [w, h] of [[1366,911],[1728,1152]]) {
   const v = (s, p) => value(node(tree, s), p, w, h);
   assert.equal(v('#screen-home', 'height'), 'calc(var(--view-height) - 32px)', 'desktop machining has a definite viewport height');
   assert.equal(v('.ks-step-body>.card', 'height'), '100%', 'percentage dashboard resolves against a definite parent');
   assert.equal(v('.job-dashboard', 'height'), '100%', 'fit overflow cannot enlarge the desktop command frame');
   assert.equal(v('.home-left', 'gap'), '12px', 'read-only v2 instruments cannot change command spacing');
   assert.equal(v('.home-stop', 'height'), '98px');
   assert.equal(v('.home-stop', 'padding-top'), '0');
   assert.equal(v('.t-btn:nth-child(4)', 'grid-column'), 'auto', 'fourth override stays in the fourth of five columns');
   if (classes.includes('perf-v2')) {
    if (classes.includes('display-large')) assert.equal(v('.home-gauge-curve', 'display'), 'none', 'large text consistently omits the curve in every state');
    else assert.notEqual(v('.home-gauge-curve', 'display'), 'none', 'alarm reserves the curve slot so the preview cannot grow');
    assert.equal(v('.home-gauge-curve', 'visibility'), alarm === '1' ? 'hidden' : null);
   }
  }
 }
}
for (const language of ['fr','en','es']) {
 const p = page(language);p.run('touch-shell.js');
 const label = p.document.querySelector('[data-ks-screen="machine"] .ks-nav-name').textContent;
 assert.equal(label, p.window.cncI18n.t('Machine'), language + ': Machine keeps its whole translated word');
 p.emit('pagehide');
}
console.log('PASS VERT2 cascade: portrait rail, natural machine/simulation cards, fixed machining frame, five override columns, v2 Stop/preview stability and whole localized rail words.');
