'use strict';
const assert=require('assert').strict;
const {fixture,machine}=require('./probe-page-fixture.cjs');
const {diagnostic,safe}=require('./touch/zero-piece.js');
const transitions=[['','free',false,false,'touch'],['','contact',false,true,'A1'],['touch','free',true,false,'B1'],['touch','contact',false,false,'release'],['release','free',false,false,'done'],['release','contact',true,false,'A1'],['A1','contact',true,true,'A2'],['A1','free',false,false,'touch'],['A2','free',false,false,'spindle'],['A2','contact',true,true,'A3'],['A3','free',false,false,'ground'],['A3','contact',true,true,'A4'],['B1','free',true,false,'B2'],['B1','contact',false,false,'release'],['B2','free',true,false,'B3'],['B2','contact',false,false,'release'],['touch','unknown',false,false,'unknown']];
for(const [from,signal,next,stuck,to] of transitions)assert.equal(diagnostic(from,signal,next,stuck),to,from+' '+signal);
for(const s of ['touch','release','A1','A2','A3','A4','B1','B2','B3','spindle','ground','unknown'])assert.notEqual(diagnostic(s,'contact',true,true),'done','no button declares success');
assert(safe(machine(),0));assert(safe(machine({activeState:'Alarm'}),0));
for(const patch of [{fresh:false},{activeState:'Run'},{workflow:'paused'},{probing:true},{spindleSpeed:100},{operator:{spindle:'M3'}},{motion:{jog:{axis:'X'}}},{homing:true}])assert(!safe(machine(patch),0));assert(!safe(machine(),2600));
for(const language of ['fr','en','es']){
 const q=fixture({language}),t=q.window.cncI18n.t,$=q.node;
 const signal=(state,stuck=false)=>q.send({probeInput:{fresh:true,ageMs:0,state,code:'EXPLICIT',stuck,test:{stage:state==='free'?'free':'contact',done:false}}});
 signal('contact',true);$('probe-test').click();assert.equal($('probe-test-instruction').textContent,t('Écartez le bloc de la fraise.'));
 $('probe-test-next').click();assert.equal($('probe-test-instruction').textContent,t('Laissez la pince sur la fraise. Débranchez la prise de la broche.'));
 signal('free');assert.equal($('probe-test-instruction').textContent,t('C’est la broche : elle relie la fraise à la masse.'));assert($('probe-test-note').textContent.includes(t('Palpez broche débranchée. Rebranchez-la avant d’usiner.')));
 $('probe-test-again').click();signal('contact');assert.equal($('probe-test-instruction').textContent,t('Contact vu. Écartez le bloc.'));signal('free');assert.equal($('probe-test-instruction').textContent,t('La sonde marche.'));
 signal('contact',true);q.window.cncZeroPiece.test('A');$('probe-test-next').click();$('probe-test-next').click();assert.equal($('probe-test-instruction').textContent,t('Retirez la pince de la fraise.'));signal('free');assert.equal($('probe-test-instruction').textContent,t('La fraise touche la masse de la machine, broche débranchée. Faites vérifier le montage.'));
 q.send({spindleSpeed:500,operator:{spindle:'M3'}});assert.equal($('probe-test-instruction').textContent,t('Arrêtez d’abord la machine et la broche.'));assert.equal($('probe-test-history').textContent,'');assert.equal($('probe-test-next'),null);$('probe-test-m5').click();assert.equal(q.calls.at(-1).op,'spindleStop');
 q.send({canSpindleStop:false,spindleSpeed:500});assert.equal($('probe-test-m5'),null);
 q.send();assert.equal($('probe-test-instruction').textContent,t('Touchez le bloc avec la fraise.'));q.advance(2600);q.window.cncZeroPiece.test();assert.equal($('probe-test-instruction').textContent,t('Arrêtez d’abord la machine et la broche.'));
}
console.log('PASS probe diagnostic: every real-signal transition, November spindle ground case, ordered clip hypothesis, no success button, stale/motion/spindle gate and shared FR/EN/ES sheet.');
