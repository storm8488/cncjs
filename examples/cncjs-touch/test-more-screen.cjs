'use strict';
const assert=require('assert').strict,fs=require('fs'),path=require('path'),{page}=require('./session-dom-fixture.cjs');
for(const simulation of [false,true])for(const lang of ['fr','en','es']){
 const p=page(lang,simulation);p.run('touch-shell.js');p.run('macros.js');p.window.cncShell.go('more');
 const tiles=p.document.querySelectorAll('#screen-more button.ks-tile');assert.deepEqual(tiles.map(n=>n.getAttribute('data-ks-tile')),['history','settings','commissioning','guide','macros']);
 assert.equal(p.document.querySelector('[data-ks-tile="guide"] span').textContent,lang==='es'?'Guía':'Guide','exact Guide label');
 assert(p.node('ks-macros-open').disabled);assert(!p.node('ks-macros-open').hidden);assert(p.node('ks-macros-open').textContent.length>15);assert(p.node('more-version').textContent.includes('v2v'));
 assert.equal(p.document.querySelector('#screen-more .ks-stepbar'),null);assert.equal(p.node('screen-menu'),null);p.window.cncJobControls.dispose();
 for(const screen of ['history','settings']){
  p.window.cncShell.go(screen);
  const head=p.document.querySelector('#screen-'+screen+' .ks-sub-head');
  assert(head,'shared More subheader');assert(head.querySelector('h2').textContent);
  assert.equal(p.document.querySelector('.ks-nav.active').getAttribute('data-ks-screen'),'more');
  head.querySelector('.ks-back').click();assert.equal(p.window.cncShell.screen(),'more');
 }
 p.emit('cnc-job-status',{simulation,machine:{port:'COM3',fresh:true,canMacro:false,macros:[{id:'m1',name:'Test'}],refusals:{macro:{code:'ECONTROL',params:{owner:'PC'}}}},pilot:{state:'other'}});
 p.node('ks-macros-open').click();
 const refusal=p.document.querySelector('#ks-macros .ks-refus');
 assert(refusal,'macro refusal carries its remedy inside the sheet');
 assert(refusal.querySelectorAll('button').length>=2,'control remedy and Details');
 assert(p.document.querySelector('#ks-macros-list button').disabled,'macro still follows the server guard');
 p.window.cncShell.closeSheet();
 if(!simulation){
  p.run('commissioning.js');
  p.emit('cnc-job-status',{machine:{port:'COM3',fresh:true,activeState:'Idle',workflow:'idle'}});
  p.document.querySelector('[data-ks-tile="commissioning"]').click();
  assert.equal(p.window.cncShell.screen(),'commissioning');
  assert(p.document.querySelector('.ks-wiz-content').textContent.length>20,'tile actually starts the assistant');
 }
}
for(const f of fs.readdirSync(path.join(__dirname,'touch')).filter(f=>/\.(js|html|css)$/.test(f)))assert(!fs.readFileSync(path.join(__dirname,'touch',f),'utf8').includes('screen-menu'),f+' has no obsolete screen');
assert.match(fs.readFileSync(path.join(__dirname,'touch/touch-shell.css'),'utf8'),/#screen-more \.ks-tile:disabled\{[^}]*opacity:1[^}]*repeating-linear-gradient/,'disabled More tile is readable and hatched');
console.log('PASS Plus: five tiles including visible refused macros, loaded page cache, both pages, FR/EN/ES and no Menu.');
