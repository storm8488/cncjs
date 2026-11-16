'use strict';
// Source contracts for defects recorded by the strict browser harness. Browser
// hit tests remain necessary: these checks do not claim to render CSS.
const assert = require('assert').strict;
const fs = require('fs');
const postcss = require('postcss');
const css = postcss.parse(fs.readFileSync(__dirname + '/touch/responsive.css', 'utf8'));
const failures = [];
function expect(ok, message) { if (!ok) failures.push(message); }
function rule(selector, property, value) {
 let found = false;
 css.walkRules(r => {
  if (!r.selectors.includes(selector)) return;
  r.walkDecls(property, d => { if (d.value === value) found = true; });
 });
 expect(found, selector + ' must keep ' + property + ': ' + value);
}
rule('body.ks-ui #tabbar .ks-nav', 'font-size', '16px');
rule('.ks-step-mark', 'font-size', '16px');
rule('body.ks-ui #tabbar .ks-nav>b', 'font-size', '16px');
rule('body.ks-ui #screen-home #home-machine-card', 'display', 'none');
rule('body.ks-ui #screen-home .home-coords .t-unit:not(:last-child)', 'display', 'none');
rule('body.ks-ui #screen-home .home-coords .t-coords', 'flex', '1');
rule('body.ks-ui #screen-home .home-coords .t-val', 'font-size', '20px');
rule('body.ks-ui #screen-home .home-coords .t-coords', 'grid-template-columns', '20px minmax(96px,1fr) 20px minmax(96px,1fr) 20px minmax(96px,1fr) 20px');
rule('body.ks-ui #screen-home .home-coords .t-coords-card', 'flex-direction', 'column');
rule('body.ks-ui #screen-home .job-metrics', 'overflow', 'auto');
rule('body.ks-ui .t-seg', 'gap', '12px');
rule('body.ks-ui .pv3d-views', 'flex-wrap', 'wrap');
rule('body.ks-ui #screen-settings .ks-settings-tabs', 'gap', '12px');
rule('body.ks-ui:not(.t-compact) #screen-files .library-list-panel', 'grid-template-areas', '"title title" "search fav" "list list" "pages pages"');
rule('body.ks-ui:not(.t-compact) #screen-files .library-list-panel', 'grid-template-columns', 'minmax(120px,1fr) auto');
rule('body.ks-ui .t-strip-actions #t-pause', 'min-width', '128px');
rule('body.ks-ui .t-strip-actions #t-stop', 'min-width', '96px');
// Compact cards must contribute their full content height to their grid row.
// A fixed row and min-height:0 let the coordinates overflow over the jog arrows.
const compact = css.nodes.find(n => n.type === 'atrule' && n.name === 'media' &&
 n.params === '(max-width:1099px),(max-height:649px)' &&
 n.toString().includes('grid-template-rows:repeat(3,max-content)'));
const compactText = compact ? compact.toString() : '';
expect(compact, 'compact jog rows must size to their commands');
expect(compactText.includes('.ks-stepbar{position:static;'), 'compact footer participates in layout');
expect(compactText.includes('#machine-ready{flex:none;'), 'machine checklist cannot shrink over the secondary actions');
expect(compactText.includes('grid-template-areas:none!important'), 'stacked cards cannot retain desktop grid areas');
expect(compactText.includes('.ks-step-body{display:flex!important;'), 'compact card hosts have a real content box');
expect(compactText.includes('overflow:auto!important'), 'the content scrolls independently of the footer');
const short = css.nodes.find(n => n.type === 'atrule' && n.params === '(max-height:499px)');
expect(short && short.toString().includes('flex-direction:row!important'), 'a short viewport must keep all six rail targets reachable');
assert.equal(failures.length, 0, failures.join('\n'));
console.log('PASS session geometry: rail type, compact content and footer flow, instrument widths and touch spacing.');
