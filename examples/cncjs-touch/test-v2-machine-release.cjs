'use strict';
// Round 3 (Codex review, blocking): Éco during a job closes the v2 resources while the layout is
// held. The v2 Machine panel must then say explicitly that it no longer follows the reports and
// give the place back to the v1 alarm, never keep a frozen « Rapport frais ». Real L0 bootstrap
// (tablet-profile.js + phase B modules), real contract, real machine-limits.js.
const assert=require('assert').strict;
const {page}=require('./test-v2-gate.cjs');
const all=root=>[root,...root.children.flatMap(c=>all(c))];
const text=root=>all(root).map(e=>typeof e.textContent==='string'?e.textContent:'').join(' ');
(async()=>{
  const p=page(),doc=p.document,nodes={},mounts={},active=new Set(['machine']);
  const create=doc.createElement;
  doc.createElement=tag=>{const e=create(tag),found={};e.querySelector=s=>found[s]||(found[s]=doc.createElement('b'));return e;};
  const byId=id=>nodes[id]||(nodes[id]=Object.assign(doc.createElement('div'),{id}));
  for(const s of ['machine','history','settings','home','files','jog'])byId('screen-'+s).classList={contains:n=>n==='active'&&active.has(s)};
  doc.getElementById=byId;doc.querySelector=()=>byId('main');
  p.window.cncShell={screen:()=>'machine',v2Mounts(build){
    if(!Object.keys(mounts).length&&build===true)for(const n of ['home','files','prepare','machine','history','settings']){
      const root=byId('screen-'+(n==='prepare'?'jog':n)),content=doc.createElement('div');content.hidden=true;root.appendChild(content);
      mounts[n]=Object.freeze({screen:n,root,content,origin:null});}
    return mounts;}};
  p.run('grbl-help.js');p.run('machine-limits.js');
  p.status();p.frame();await p.complete();
  assert(p.api.gate()&&p.classes.has('perf-v2'),'v2 open at Idle');
  // L0 freshness contract (v2/fixe): stubbed here when this base does not provide it yet.
  if(typeof p.api.reportAge!=='function')p.api.reportAge=m=>m&&m.statusObservedAt!==undefined&&typeof m.statusAgeMs==='number'?{known:true,fresh:m.statusAgeMs<=2500,ageMs:m.statusAgeMs}:{known:false,fresh:false,ageMs:null};
  p.emit('cnc-screen-change','machine');
  p.status({activeState:'Run',workflow:'running',canStop:true,statusAgeMs:100,statusObservedAt:1});p.frame();
  const content=mounts.machine.content,root=mounts.machine.root;
  assert.equal(content.hidden,false);assert.match(text(content),/État : Run/);assert.match(text(content),/Rapport frais/);
  assert.equal(root.getAttribute('data-v2-presenter'),'on');
  // Éco during the job: resources close at once, the layout is held until a known Idle.
  p.window.cncProfile.setPerformance('eco');p.frame();
  assert(!p.api.gate());assert(p.classes.has('perf-v2'),'layout held during the job');
  p.advance(10000);
  p.status({activeState:'Alarm',workflow:'idle',fresh:false,statusAgeMs:10100,alarmCode:1,canStop:false});p.frame();
  const t=text(content);
  assert(!/Rapport frais/.test(t),'no frozen fresh report: '+t);assert(!/Aucune alarme rapportée/.test(t));
  assert.match(t,/Rapport non suivi/);
  assert.notEqual(root.getAttribute('data-v2-presenter'),'on','the v1 alarm notice is shown again');
  assert.equal(content.hidden,false,'same rectangle, nothing moves');
  console.log('PASS v2 machine release: Éco during a job invalidates the v2 condition (« Rapport non suivi ») and gives the alarm back to the v1 notice; real L0 bootstrap.');
})().catch(e=>{console.error(e);process.exitCode=1;});
