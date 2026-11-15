'use strict';
const assert=require('assert').strict,fs=require('fs'),path=require('path'),{page}=require('./session-dom-fixture.cjs');
for(const simulation of [false,true])for(const lang of ['fr','en','es']){
 const p=page(lang,simulation);p.run('touch-shell.js');p.run('macros.js');p.window.cncShell.go('more');
 const tiles=p.document.querySelectorAll('#screen-more button.ks-tile');assert.deepEqual(tiles.map(n=>n.getAttribute('data-ks-tile')),['history','settings','commissioning','guide','macros']);
 assert(p.node('ks-macros-open').disabled);assert(!p.node('ks-macros-open').hidden);assert(p.node('ks-macros-open').textContent.length>15);assert(p.node('more-version').textContent.includes('v2v'));
 assert.equal(p.document.querySelector('#screen-more .ks-stepbar'),null);assert.equal(p.node('screen-menu'),null);p.window.cncJobControls.dispose();
}
for(const f of fs.readdirSync(path.join(__dirname,'touch')).filter(f=>/\.(js|html|css)$/.test(f)))assert(!fs.readFileSync(path.join(__dirname,'touch',f),'utf8').includes('screen-menu'),f+' has no obsolete screen');
console.log('PASS Plus: five tiles including visible refused macros, loaded page cache, both pages, FR/EN/ES and no Menu.');
