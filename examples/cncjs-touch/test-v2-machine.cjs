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
  // Stub of the L0 freshness contract (single source, v2/fixe): monotone per
  // [port, generation, statusObservedAt]; never known without statusObservedAt.
  const seen=new Map();
  p.base.reportAge=m=>{
    if(!m||m.statusObservedAt===undefined||m.statusObservedAt===null||typeof m.statusAgeMs!=='number')return {known:false,fresh:false,ageMs:null};
    const key=JSON.stringify([m.port,m.generation,m.statusObservedAt]);
    if(!seen.has(key))seen.set(key,{t0:p.mono,a0:m.statusAgeMs});
    const s=seen.get(key),ageMs=s.a0+p.mono-s.t0;return {known:true,fresh:ageMs<=2500,ageMs};
  };
  p.run('grbl-help.js');p.run('machine-limits.js');return p;
}
const settings={'$110':'5000','$111':'5000','$112':'800','$120':'100','$121':'100','$122':'50','$130':'600','$131':'400','$20':'1','$21':'0','$22':'1'};
const alarm={port:'A',generation:'g1',fresh:true,statusAgeMs:100,statusObservedAt:1,activeState:'Alarm',workflow:'idle',alarmCode:2,settings};
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
  // Lot écrans 4 (A4): the readable title and the explanation are those of the v1 notice, now shown in v2 too
  // (settings-list.css no longer hides it, checked below); the block adds the code's origin and a short next
  // action that points at the $X / $H buttons above (with their confirmation dialog, unchanged).
  assert(!/Limite logicielle dépassée/.test(c),'readable title: in the v1 notice above, not repeated');assert.match(c,/rapporté par Grbl/,'reported origin');
  assert(!/Vérifiez l’origine de travail/.test(c),'explanation: in the v1 notice above, not repeated');assert.match(c,/\$X ou \$H plus haut/,'next action points at $X / $H');assert(!/Cet écran n’envoie rien/.test(c));
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
  p.status({...alarm,statusAgeMs:2000,statusObservedAt:2},{pilot:{state:'other',value:'PC bureau',sentence:'Piloté par « PC bureau ».'}});p.frame();
  assert.match(text(condition),/Rapport frais/);assert.match(text(condition),/PC bureau/);
  const timers=[...p.timers.values()];assert.equal(timers.length,1);assert(timers[0].ms<=600,'expiry timer at the stale threshold');
  p.advance(600);timers[0].f();assert.equal(text(condition).includes('périmé'),false,'the timer only queues a frame');
  p.frame();assert.match(text(condition),/Rapport périmé/);
  // Review 3, defect 2: civil clock going back, no new controller answer (same report identity):
  // v1 recomputes a small age with Date.now(), the v2 panel keeps the L0 monotone verdict.
  p.advance(1);p.status({...alarm,statusAgeMs:0,statusObservedAt:2,fresh:true},{pilot});p.frame();
  assert.match(text(condition),/Rapport périmé/,'same report, monotone age: still stale');assert(!/Rapport frais/.test(text(condition)));
  // Contract absent or throwing: never fresh.
  const reportAge=p.base.reportAge;
  for(const broken of [undefined,()=>{throw Error('boom');},()=>null]){
    p.base.reportAge=broken;p.status({...alarm,statusObservedAt:'x'+Math.random()},{pilot});p.frame();
    assert(!/Rapport frais/.test(text(condition)),'never fresh without the L0 contract');assert.match(text(condition),/Fraîcheur inconnue|Rapport périmé/);
  }
  p.base.reportAge=reportAge;
  // No statusObservedAt: unknown, even when v1 says fresh.
  p.status({...alarm,statusObservedAt:undefined},{pilot});p.frame();assert.match(text(condition),/Fraîcheur inconnue/);
  p.status({...alarm,fresh:false},{pilot:null});p.frame();assert.match(text(condition),/Rapport périmé/);assert.match(text(condition),/Appareil pilote : inconnu/);
  // Not in alarm: no alarm block; no report at all: everything unknown, not zero.
  p.status({...alarm,activeState:'Idle',alarmCode:null},{pilot});p.frame();assert.match(text(condition),/Aucune alarme rapportée/);
  p.status(null,{});p.frame();assert.match(text(condition),/Fraîcheur inconnue/);assert.match(text(params),/0\/13 paramètres connus/);
  // Hidden screen: no paint until shown again.
  p.show('menu');p.status(alarm,{pilot});p.frame();assert.match(text(condition),/Fraîcheur inconnue/);
  p.show('machine');p.frame();assert.match(text(condition),/ALARM:2 rapporté par Grbl/);
  // Released with the gate: static, same rectangle, no new timer.
  p.st.open=false;p.emit('cnc-v2-change',p.base.state());p.timers.clear();p.status({...alarm,activeState:'Idle',alarmCode:null},{pilot});p.frame();
  assert.match(text(condition),/Rapport non suivi/,'released: explicitly not followed');assert(!/Limite logicielle|Rapport frais/.test(text(condition)));
  assert.equal(p.node('screen-machine').getAttribute('data-v2-presenter'),'off','presenter off: the v2 grid row is released');
  assert.equal(p.timers.size,0);assert.equal(content.hidden,false);
  // Lot écrans 4 (M1): the v1 alarm notice (cause and what to do) is never hidden in v2: it was hidden while the
  // presenter was on, which left the cause in the inner-scrolled third row, cut at 911 px.
  {
    const css=require('fs').readFileSync(__dirname+'/touch/settings-list.css','utf8').replace(/\/\*[\s\S]*?\*\//g,'');
    css.split('}').forEach(rule=>{const sel=rule.split('{')[0];if(/#ks-machine-alarm/.test(sel))assert(!/display\s*:\s*none/.test(rule),'v1 alarm notice hidden by: '+sel.trim());});
  }
  // Lot écrans 4 (A3): a new report of the same condition only renews the age text: no node rebuilt.
  {
    const q=machinePage();q.open();const cont=q.mount('machine').content;q.show('machine');
    q.status({...alarm,statusAgeMs:100,statusObservedAt:10},{pilot});q.frame();
    const cond=find(cont,'v2m-condition'),par=find(cont,'v2m-parameters'),before=all(cont);
    const age=()=>all(cond).find(e=>e.className==='v2m-freshness');
    const first=age().textContent;
    q.advance(300);q.status({...alarm,statusAgeMs:50,statusObservedAt:11},{pilot});q.frame();
    const after=all(cont);assert.equal(after.length,before.length);after.forEach((e,i)=>assert.equal(e,before[i],'node kept: '+(e.className||e.tagName)));
    assert.match(age().textContent,/Rapport frais/);assert.equal(age().getAttribute('data-freshness'),'fresh');
    q.advance(300);q.status({...alarm,statusAgeMs:1800,statusObservedAt:12},{pilot});q.frame();
    assert.notEqual(age().textContent,first,'the age text follows');all(cont).forEach((e,i)=>assert.equal(e,before[i]));
    // Parameters changed: only the right zone is rebuilt; condition changed: only the left one.
    const condKids=cond.children.slice();q.status({...alarm,statusObservedAt:13,settings:{...settings,$132:'90'}},{pilot});q.frame();
    assert.deepEqual(cond.children,condKids,'condition kept when only parameters change');assert.match(text(par),/12\/13 paramètres connus/);
    const parKids=par.children.slice();q.status({...alarm,alarmCode:3,statusObservedAt:14,settings:{...settings,$132:'90'}},{pilot});q.frame();
    assert.deepEqual(par.children,parKids,'parameters kept when only the condition changes');assert.match(text(cond),/ALARM:3/);
  }
  // Lot écrans 4 (M3): the State line says the state in the interface's words (status-strip.js describe), never
  // Grbl's English word, in FR and ES; the transport flag is the real one (offline shows « Hors ligne » like the card).
  {
    const vm=require('vm'),fs=require('fs'),touch=f=>fs.readFileSync(__dirname+'/touch/'+f,'utf8');
    const ENGLISH=/\b(Idle|Run|Hold|Jog|Alarm|Door|Check|Home|Sleep)\b/;
    for(const language of ['fr','es']){
      const sb={window:{}};vm.runInNewContext(touch('i18n-messages.js'),sb);
      const map=new Map(sb.window.CNCTouchMessages.map(r=>[r[0].trim().replace(/\s+/g,' '),r[2]]));
      const t=s=>{const k=String(s).trim();return language==='es'&&map.has(k)?s.replace(k,map.get(k)):s;};
      const src=touch('status-strip.js'),a=src.indexOf('function describe(m,connected){'),b=src.indexOf("var tone='',lastDetail=null;");
      const describe=vm.runInNewContext('(function(uiLocale){function finite(v){return typeof v==="number"&&isFinite(v);}'+src.slice(a,b)+'return describe;})',{isFinite,String})({t});
      const q=machinePage({language});q.window.cncI18n.t=t;q.window.cncStatusStrip={describe};q.open();const cont=q.mount('machine').content;q.show('machine');
      const state=()=>all(find(cont,'v2m-condition')).find(e=>e.className==='v2m-state').textContent;
      for(const [m,fr,es] of [[{...alarm,alarmCode:1},'État : Alarme 1','Estado: Alarma 1'],[{...alarm,activeState:'Idle',alarmCode:null},'État : Repos','Estado: Reposo'],
        [{...alarm,activeState:'Run',alarmCode:null},'État : En cours','Estado: En curso'],[{...alarm,activeState:'Hold:0',alarmCode:null},'État : Pause','Estado: Pausa'],
        [{...alarm,activeState:'Home',alarmCode:null},'État : Prise d’origine',null],[{...alarm,alarmCode:3,alarmCodeInferred:true},'État : Alarme 3 déduite','Estado: Alarma 3 deducida']]){
        q.status(m,{pilot});q.frame();const s=state();
        assert(!ENGLISH.test(s),language+': '+s);if(language==='fr')assert.equal(s,fr);else if(es)assert.equal(s,es);
      }
      q.status({...alarm,activeState:'Idle',alarmCode:null},{pilot,transportConnected:false});q.frame();assert.equal(state(),language==='fr'?'État : Hors ligne':'Estado: Sin conexión');
      // No machine at all (offline snapshot): the strip's « Hors ligne », not « inconnu » (counter-review).
      q.status(null,{pilot});q.frame();assert.equal(state(),language==='fr'?'État : Hors ligne':'Estado: Sin conexión');
    }
    // Without status-strip.js (older page), Grbl's word rather than nothing.
    const q=machinePage();q.open();q.show('machine');q.status({...alarm,activeState:'Idle',alarmCode:null},{pilot});q.frame();
    assert.match(text(find(q.mount('machine').content,'v2m-condition')),/État : Idle/);
  }
  console.log('PASS v2 machine: readable alarm with reported/deduced/missing origin, explanation and next action; freshness with bounded expiry; pilot device; known/unknown parameters with units; no command; hidden and released states; RT unchanged.');
})().catch(e=>{console.error(e);process.exitCode=1;});
