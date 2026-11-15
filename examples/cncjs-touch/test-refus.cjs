'use strict';
const assert=require('assert').strict,{page}=require('./session-dom-fixture.cjs'),{machine}=require('./session-fixture.cjs');
const p=page();p.run('touch-shell.js');p.window.cncShell.go('check');const d={machine:machine(),transportConnected:true,pilot:{state:'free'}};p.emit('cnc-job-status',d);p.window.cncShell.go('check');
p.window.cncSeance.refuser({code:'ETOUCH_PROBE_TRAVEL',params:{axis:'X',min:-2,max:20,low:0,high:400},message:'technical'});assert.match(p.node('step-check-cause').textContent,/palpage/);assert.equal(p.node('step-check-main').disabled,false,'a response does not invent a false canStart');
p.emit('cnc-job-status',d);assert.match(p.node('step-check-cause').textContent,/palpage/,'same request data retains the refusal');
p.emit('cnc-job-status',{...d,machine:machine({coordinates:{machine:{x:2,y:1,z:-5}}})});assert(!/palpage/.test(p.node('step-check-cause').textContent),'position change clears the refusal');
const sheet=p.window.cncShell.sheet('test-refusal-sheet','Test');p.window.cncRefus.montrer(sheet.content,{code:'ECONTROL',owner:{label:'PC atelier'}});assert(sheet.content.querySelector('.ks-refus'));assert.match(sheet.content.textContent,/PC atelier/);assert.equal(sheet.content.querySelector('button').textContent,'Prendre la main');p.window.cncRefus.effacer(sheet.content);assert.equal(sheet.content.querySelector('.ks-refus'),null);
p.window.cncShell.go('more');p.window.cncSeance.refuser({code:'unknown'});assert.match(p.node('screen-more').textContent,/Action refusée/);p.window.cncJobControls.dispose();
console.log('PASS refusal presenter: initiating stage, sheet and Plus, retry remains active, request data clears cause and unknown code has Details.');
