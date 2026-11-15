'use strict';
const assert=require('assert').strict,{pure,machine}=require('./session-fixture.cjs');const {evaluate}=pure();
const base={machine:machine(),transportConnected:true,pilot:{state:'free'}};
const causes=[
 ['hors-ligne',{machine:null,transportConnected:false}],['etat-perdu',{machine:null,halt:{canPause:true,canStop:true}}],['non-connectee',{machine:null}],['main-ailleurs',{pilot:{state:'other',name:'PC'}}],['information-ancienne',{machine:machine({fresh:false,statusAgeMs:5000})}],['commande-tablette',{systemCommand:{title:'test'}}],['alarme-usinage',{machine:machine({activeState:'Alarm',workflow:'running'})}],['alarme',{machine:machine({activeState:'Alarm'})}],['reglages-non-lus',{machine:machine({refusals:{home:{code:'ETOUCH_MACHINE_SETTINGS_UNKNOWN'}}})}],['origine-a-prendre',{machine:machine({homed:false})}],['occupee',{machine:machine({homing:true})}],['usinage-en-cours',{machine:machine({workflow:'running'})}],['broche-tourne',{machine:machine({spindleSpeed:12000})}]
];
for(const [id,patch] of causes){const result=evaluate(Object.assign({},base,patch));assert.equal(result.globale.id,id);assert.equal(result.rang,causes.findIndex(r=>r[0]===id)+1);}
for(const [state,code,id,remedy] of [['checking',null,'zero-verification',null],['unknown',null,'zero-verification',null],['failed','ETOUCH_OFFSET_UNCONFIRMED','zero-non-confirme','verifier-zero'],['failed','ETOUCH_OFFSET_MISMATCH','zero-a-refaire','refaire-zero'],['failed','ETOUCH_OFFSET_SETTINGS','reglages-non-lus','relire']]){
 const r=evaluate({...base,machine:machine({workOffset:{state,code,canVerify:false},canStart:false})});assert.equal(r.barres.jog.cause.id,id);assert.notEqual(r.etapes.jog.etat,'fait');if(remedy)assert.equal(r.barres.jog.remedes[0].id,remedy);assert.equal(r.barres.check.action.style,'raye');
}
assert.equal(evaluate({...base,machine:machine({workOffset:undefined})}).barres.jog.cause.id,'zero-non-verifie');
assert.equal(evaluate({...base,machine:machine({motion:{}})}).etapes.jog.mot,'Ancien zéro');
assert.equal(evaluate({...base,machine:machine({probing:true})}).etapes.jog.mot,'Palpage…');
for(const [cap,screen] of [['canLoad','files'],['canStart','check'],['canPause','home']]){const r=evaluate({...base,selection:{file:'other.nc'},machine:machine({[cap]:false,name:screen==='files'?'': 'part.nc',workflow:screen==='home'?'running':'idle'})});assert.equal(r.barres[screen].action.style,'raye',cap);}
for(const [id,patch] of causes.slice(0,6)){const r=evaluate({...base,...patch});for(const bar of Object.values(r.barres))assert.equal(bar.cause.id,id,'global cause stays visible: '+id);assert.notEqual(r.barres.jog.action.style,'raye','navigation remains possible: '+id);if(r.globale.remedes.length)assert(r.barres.machine.action.style==='plein'||r.globale.remedes[0]==='details'||id==='hors-ligne');}
assert.equal(evaluate(base).suite,'home');assert.equal(evaluate({...base,machine:machine({finished:true})}).suite,'check');
for(const workflow of ['running','paused'])assert.equal(evaluate({...base,machine:machine({workflow})}).suite,'home');
assert.equal(evaluate({...base,machine:null}).suite,'machine');
assert.equal(evaluate({...base,machine:machine({name:''})}).suite,'files');
assert.equal(evaluate({...base,machine:machine({workOffset:null})}).suite,'jog');
assert.equal(evaluate({...base,machine:machine({programCheck:{verdict:'unknown'},canStart:true})}).etapes.check.mot,'Non vérifié');
assert.equal(evaluate({...base,machine:machine({programCheck:{verdict:'outside',blocking:[]},canStart:true})}).barres.check.action.style,'raye');
assert.equal(evaluate({...base,machine:machine({workflow:'running'})}).etapes.machine.etat,'fait','machining does not turn completed machine readiness into an anomaly');
assert.equal(evaluate({...base,machine:null}).etapes.machine.etat,'suite','a disconnected machine is the next normal setup stage');
assert.notEqual(evaluate({...base,machine:machine({workOffset:null})}).etapes.check.etat,'fait','a check cannot be marked complete without a proven offset');
assert.match(evaluate({...base,machine:machine({jobStopped:true,stoppedAtLine:123})}).etapes.home.mot,/123/,'stopped state names its line');
assert.equal(evaluate({...base,machine:machine({activeState:'Alarm',homed:false})}).barres.machine.action.id,'prise-origine','recovery on Machine opens the home confirmation, not the same screen');
for(const lang of ['fr','en','es']){const q=pure(lang).evaluate({...base,machine:null});assert(q.barres.machine.cause.texte.length>10);}
console.log('PASS session: all thirteen global causes, D2 states, stage states and actions, conservative missing fields and server permissions.');
