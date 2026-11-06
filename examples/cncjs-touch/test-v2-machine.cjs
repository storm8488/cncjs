'use strict';
// L6 Machine under Performance v2: a readable alarm (title, reported/deduced origin, explanation,
// next possible action), freshness and pilot device, known/unknown travel parameters with units.
// No command: unlock and homing keep their existing places, conditions and confirmations.
const assert=require('assert').strict;
const {l6Page,find,all,text}=require('./test-v2-settings.cjs');
function machinePage(o={}){
  const p=l6Page(Object.assign({eligible:true,screens:['machine'],active:'machine'},o));
  // machine-limits.js (v1) queries its own table cells.
  const create=p.document.createElement;
  p.document.createElement=tag=>{const e=create(tag);const found={};e.querySelector=s=>found[s]||(found[s]=create('b'));return e;};
  p.node('panel').querySelector=s=>p.node('panel:'+s);
  p.run('grbl-help.js');p.run('machine-limits.js');return p;
}
const settings={'$110':'5000','$111':'5000','$112':'800','$120':'100','$121':'100','$122':'50','$130':'600','$131':'400','$20':'1','$21':'0','$22':'1'};
const alarm={port:'A',generation:'g1',fresh:true,statusAgeMs:100,activeState:'Alarm',workflow:'idle',alarmCode:2,settings};
const pilot={state:'mine',value:'Cet appareil',sentence:'Piloté par cet appareil (Tablette atelier).'};
(async()=>{
  // RT / v1: no v2 frame, mount or presenter attribute.
  for(const o of [{noV2:true},{eligible:false}]){
    const p=machinePage(o);p.status(alarm,{pilot});p.emit('cnc-v2-change',{});
    assert.equal(p.frames.size,0);assert.equal(p.node('screen-machine').getAttribute('data-v2-presenter'),null);
  }
  const p=machinePage();p.open();const content=p.mount('machine').content;
  p.show('machine');p.status(alarm,{pilot});assert.equal(content.children.length,0,'no rendering in a state handler');
  p.frame();assert.equal(content.hidden,false);assert.equal(p.node('screen-machine').getAttribute('data-v2-presenter'),'on');
  const condition=find(content,'v2m-condition'),params=find(content,'v2m-parameters');
  let c=text(condition);
  assert.match(c,/Limite logicielle dépassée/,'readable title');assert.match(c,/rapporté par Grbl/,'reported origin');
  assert.match(c,/Vérifiez l’origine de travail/,'explanation');assert.match(c,/Déverrouiller/);assert.match(c,/confirmation/,'next action keeps its confirmation');
  assert.match(c,/Rapport frais/);assert.match(c,/Piloté par cet appareil/);
  // Known and unknown parameters with their units, never a fabricated value.
  const t=text(params);assert.match(t,/mm\/min/);assert.match(t,/mm\/s²/);assert.match(t,/\bmm\b/);
  assert.match(t,/600/);assert.match(t,/inconnu/);assert.match(t,/\$132/);assert.match(t,/\$23/);
  assert.match(t,/11\/13 paramètres connus/);
  // No command from this screen: no button at all, nothing sent.
  assert.equal(all(content).filter(e=>e.tagName==='BUTTON').length,0,'no unlock/home/replay button added');
  assert(!p.calls.some(c=>['jobControls','xhr','fetch'].includes(c[0])));
  // Deduced code (board restart) and missing code stay qualified.
  p.status({...alarm,alarmCode:3,alarmCodeInferred:true},{pilot});p.frame();c=text(condition);
  assert.match(c,/déduit/);assert(!/rapporté par Grbl/.test(c));
  p.status({...alarm,alarmCode:null},{pilot});p.frame();assert.match(text(condition),/Aucun code reçu/);
  // Freshness: the age keeps running without new reports (one bounded timer, no loop).
  p.status({...alarm,statusAgeMs:2000},{pilot:{state:'other',value:'PC bureau',sentence:'Piloté par « PC bureau ».'}});p.frame();
  assert.match(text(condition),/Rapport frais/);assert.match(text(condition),/PC bureau/);
  const timers=[...p.timers.values()];assert.equal(timers.length,1);assert(timers[0].ms<=600,'expiry timer at the stale threshold');
  p.advance(600);timers[0].f();assert.equal(text(condition).includes('périmé'),false,'the timer only queues a frame');
  p.frame();assert.match(text(condition),/Rapport périmé/);
  p.status({...alarm,fresh:false},{pilot:null});p.frame();assert.match(text(condition),/Rapport périmé/);assert.match(text(condition),/Appareil pilote : inconnu/);
  // Not in alarm: no alarm block; no report at all: everything unknown, not zero.
  p.status({...alarm,activeState:'Idle',alarmCode:null},{pilot});p.frame();assert.match(text(condition),/Aucune alarme rapportée/);
  p.status(null,{});p.frame();assert.match(text(condition),/Fraîcheur inconnue/);assert.match(text(params),/0\/13 paramètres connus/);
  // Hidden screen: no paint until shown again.
  p.show('menu');p.status(alarm,{pilot});p.frame();assert.match(text(condition),/Fraîcheur inconnue/);
  p.show('machine');p.frame();assert.match(text(condition),/Limite logicielle dépassée/);
  // Released with the gate: static, same rectangle, no new timer.
  p.st.open=false;p.emit('cnc-v2-change',p.base.state());p.timers.clear();p.status({...alarm,activeState:'Idle',alarmCode:null},{pilot});p.frame();
  assert.match(text(condition),/Rapport non suivi/,'released: explicitly not followed');assert(!/Limite logicielle|Rapport frais/.test(text(condition)));
  assert.equal(p.node('screen-machine').getAttribute('data-v2-presenter'),'off','v1 alarm notice back');
  assert.equal(p.timers.size,0);assert.equal(content.hidden,false);
  console.log('PASS v2 machine: readable alarm with reported/deduced/missing origin, explanation and next action; freshness with bounded expiry; pilot device; known/unknown parameters with units; no command; hidden and released states; RT unchanged.');
})().catch(e=>{console.error(e);process.exitCode=1;});
