'use strict';
const assert=require('assert').strict,{page}=require('./session-dom-fixture.cjs'),{machine}=require('./session-fixture.cjs');
for(const lang of ['fr','en','es']){
 const p=page(lang);p.run('touch-shell.js');assert.equal(p.window.cncShell.screen(),'machine');
 const nav=p.document.querySelectorAll('button.ks-nav');assert.deepEqual(nav.map(n=>n.getAttribute('data-ks-screen')),['machine','files','jog','check','home','more']);
 for(let i=0;i<5;i++)assert.equal(nav[i].getAttribute('data-seance-step'),String(i+1));
 p.emit('cnc-job-status',{machine:machine({workflow:'running',activeState:'Run',canPause:true,canStop:true}),transportConnected:true,pilot:{state:'free'}});assert.equal(p.window.cncShell.screen(),'home');
 p.emit('cnc-job-status',{machine:machine(),transportConnected:true,pilot:{state:'free'}});assert.equal(p.window.cncShell.screen(),'home','arrival jumps only once');
 p.window.cncShell.go('check');const hidden=p.node('step-machine-state').textContent;
 const d={machine:machine(),transportConnected:true,pilot:{state:'free'}};p.emit('cnc-job-status',d);const n=p.stats.writes;p.emit('cnc-job-status',d);assert.equal(p.stats.writes,n,'identical state has no DOM mutations');assert.equal(p.node('step-machine-state').textContent,hidden,'hidden step header is not written');
 p.window.cncShell.go('history');assert.equal(p.document.querySelector('.ks-nav.active').getAttribute('data-ks-screen'),'more');p.document.querySelector('#screen-history .ks-back').click();assert.equal(p.window.cncShell.screen(),'more');
 assert.equal(p.node('ks-resume'),null);p.window.cncJobControls.dispose();
}
const laserPage=page();laserPage.run('touch-shell.js');laserPage.emit('cnc-job-status',{machine:machine({machineProfile:{kind:'laser'}}),transportConnected:true});laserPage.window.cncShell.go('home');assert.equal(laserPage.node('step-home-title').textContent,'5 · Gravure');assert.equal(laserPage.document.querySelector('[data-ks-screen="home"] .ks-nav-name').textContent,'Gra­vure');laserPage.window.cncJobControls.dispose();
const q=page();q.run('touch-shell.js');(q.listeners['doc:pointerdown']||[]).forEach(fn=>fn({isTrusted:true}));q.window.cncShell.go('files');q.emit('cnc-job-status',{machine:machine(),transportConnected:true});assert.equal(q.window.cncShell.screen(),'files','an operator navigation wins over arrival');q.window.cncJobControls.dispose();
console.log('PASS rail: six entries, marks, one arrival jump, manual navigation, Plus return, no hidden header or duplicate writes, FR/EN/ES.');
