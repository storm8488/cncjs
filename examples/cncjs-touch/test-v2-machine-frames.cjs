'use strict';
// Codex review 4 (P3): the v2 Machine presenter must not request animation frames while its
// screen is inactive, the document hidden or after pagehide. It marks itself dirty and draws once
// on the next show. Frame requests are counted against the real L0 bootstrap alone.
const assert=require('assert').strict;
const {page}=require('./test-v2-gate.cjs');
const all=root=>[root,...root.children.flatMap(c=>all(c))];
const text=root=>all(root).map(e=>typeof e.textContent==='string'?e.textContent:'').join(' ');
async function setup(withMachine){
  const p=page(),doc=p.document,nodes={},mounts={},active=new Set(['machine']),timers=new Map();let timerId=0;
  p.window.setTimeout=(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId;};p.window.clearTimeout=id=>timers.delete(id);
  const create=doc.createElement;
  doc.createElement=tag=>{const e=create(tag),found={};e.querySelector=s=>found[s]||(found[s]=doc.createElement('b'));return e;};
  const byId=id=>nodes[id]||(nodes[id]=Object.assign(doc.createElement('div'),{id}));
  for(const s of ['machine','history','settings','home','files','jog'])byId('screen-'+s).classList={contains:n=>n==='active'&&active.has(s)};
  doc.getElementById=byId;doc.querySelector=()=>byId('main');
  p.window.cncShell={screen:()=>'machine',v2Mounts(build){
    if(!Object.keys(mounts).length&&build===true)for(const n of ['home','files','prepare','machine','history','settings']){
      const root=byId(n==='machine'?'ks-machine-details':'screen-'+(n==='prepare'?'jog':n)),content=doc.createElement('div');content.hidden=true;root.appendChild(content);
      mounts[n]=Object.freeze({screen:n,root,content,origin:null});}
    return mounts;}};
  if(withMachine){p.run('grbl-help.js');p.run('machine-limits.js');}
  p.status();p.frame();await p.complete();
  assert(p.api.gate()&&p.classes.has('perf-v2'),'v2 open at Idle');
  let requests=0;const raf=p.window.requestAnimationFrame;
  p.window.requestAnimationFrame=f=>{requests++;return raf.call(p.window,f);};
  const show=s=>{active.clear();active.add(s);p.emit('cnc-screen-change',s);p.emit('cnc-sheet-change',{id:'ks-machine-details',open:s==='machine'});};
  return {p,mounts,show,timers,count(fn){const before=requests;fn();const n=requests-before;p.frame();return n;}};
}
const report=(n,patch)=>({activeState:'Run',workflow:'running',canStop:true,statusAgeMs:50,statusObservedAt:n,...patch});
(async()=>{
  const alone=await setup(false),machine=await setup(true);
  machine.show('machine');machine.count(()=>machine.p.status(report(1)));
  assert.match(text(machine.mounts.machine.content),/État : Run/,'drawn while visible');
  // Machine itself can be visible with the details sheet closed: zero presenter work.
  for(const x of [alone,machine])x.p.emit('cnc-sheet-change',{id:'ks-machine-details',open:false});
  let closedA=0,closedB=0;for(let i=0;i<10;i++){closedA+=alone.count(()=>alone.p.status(report(101+i)));closedB+=machine.count(()=>machine.p.status(report(101+i)));}
  console.log('MEASURE Machine, details closed: '+closedB+' extra RAF / 10 reports, '+machine.timers.size+' timers.');
  assert.equal(closedB,closedA,'visible Machine, closed sheet adds zero RAF requests');
  assert.equal(machine.timers.size,alone.timers.size,'closed sheet owns no freshness timer');
  assert.match(text(machine.mounts.machine.content),/État : Run/,'closed sheet retains its nodes without drawing');
  for(const x of [alone,machine])x.show('home');
  const seq=x=>[2,3,4,5].map(n=>x.count(()=>x.p.status(report(n,n===5?{activeState:'Hold',workflow:'paused'}:{}))));
  const a=seq(alone),b=seq(machine);
  assert.deepEqual(b,a,'inactive Machine screen adds no frame request: L0 '+JSON.stringify(a)+' vs L0+Machine '+JSON.stringify(b));
  assert.match(text(machine.mounts.machine.content),/État : Run/,'not drawn while inactive');
  // Dirty: one draw on the next show, with the latest report.
  const shown=machine.count(()=>machine.show('machine'));assert(shown>=1,'one frame on show');
  assert.match(text(machine.mounts.machine.content),/État : Hold/,'latest report drawn on show');
  // Hidden document: no request either; drawn again when visible.
  for(const x of [alone,machine])x.p.document.hidden=true;
  const ha=[6,7].map(n=>alone.count(()=>alone.p.status(report(n)))),hb=[6,7].map(n=>machine.count(()=>machine.p.status(report(n))));
  assert.deepEqual(hb,ha,'hidden document adds no frame request');
  // Release while inactive: no frame now; « Rapport non suivi » on the next show.
  for(const x of [alone,machine]){x.p.document.hidden=false;x.show('home');}
  const ea=alone.count(()=>alone.p.window.cncProfile.setPerformance('eco')),eb=machine.count(()=>machine.p.window.cncProfile.setPerformance('eco'));
  assert.equal(eb,ea,'release while inactive adds no frame request');
  machine.count(()=>machine.show('machine'));assert.match(text(machine.mounts.machine.content),/Rapport non suivi/,'release behaviour kept');
  // pagehide: no frame request afterwards.
  const pa=alone.count(()=>{alone.p.emit('pagehide',{persisted:false});alone.p.status(report(8));});
  const pb=machine.count(()=>{machine.p.emit('pagehide',{persisted:false});machine.show('machine');machine.p.status(report(8));});
  assert.equal(pb,pa,'no frame request after pagehide');
  console.log('PASS v2 machine frames: no frame request while Machine is inactive, hidden or after pagehide (same count as L0 alone); dirty draw on show; release notice kept.');
})().catch(e=>{console.error(e);process.exitCode=1;});
