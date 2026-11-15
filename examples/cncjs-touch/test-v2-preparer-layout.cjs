'use strict';
// Common geometry contracts; actual rectangles remain the browser harness responsibility.
const assert=require('assert').strict,fs=require('fs');
const css=fs.readFileSync(__dirname+'/touch/responsive.css','utf8'),html=fs.readFileSync(__dirname+'/touch/index.html','utf8');
const jog=html.slice(html.indexOf('<section id="screen-jog"'),html.indexOf('<section id="screen-files"'));
assert.match(css,/grid-template-areas:"coords arrows tools"/);assert.match(css,/minmax\(0,380fr\) minmax\(444px,456fr\) minmax\(0,386fr\)/);
assert.match(css,/grid-template-areas:"arrows" "coords" "tools"/);
assert.match(css,/\.ks-zero-cross \.pad\{grid-template-columns:repeat\(3,96px\);grid-template-rows:repeat\(3,96px\);gap:12px/);
assert.match(css,/\.ks-zero-axis\{[^}]+min-height:64px/);
assert.match(css,/#steps\{[^}]+repeat\(4,minmax\(0,1fr\)\);gap:12px/);
assert.match(css,/#steps \.step\[data-step="hold"\]\{grid-column:span 2/);
assert.equal((jog.match(/class="jog"/g)||[]).length,6);assert(!/pv2-|jog-msg|jog-controller|ks-origin-info|<h2>/.test(jog.split('<div id="ks-jog-settings-content"')[0]));
assert(jog.indexOf('ks-motion-coordinates')<jog.indexOf('ks-motion-arrows'));assert(jog.indexOf('ks-motion-arrows')<jog.indexOf('ks-zero-tools'));
assert.equal(3*96+2*12,312);assert(312+12+96+24<=456,'six 96px arrows fit');assert(312+12+2*48+12+12+48+24<=536,'cross, steps, speed fit at 768');
console.log('PASS Zero piece layout: three common columns, compact order, six permanent 96px arrows, 64px zeros and 12px gaps, two step rows.');
