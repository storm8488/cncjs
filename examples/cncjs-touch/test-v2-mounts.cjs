'use strict';
const assert=require('assert').strict,vm=require('vm');
const {page,read}=require('./test-v2-gate.cjs');
function block(file,start,end) {const s=read(file),a=s.indexOf(start),b=s.indexOf(end,a);assert(a>=0&&b>a,'mount block exists: '+file);return s.slice(a,b);}
(async()=>{
  const mountSource=block('touch-shell.js','  // BEGIN V2 MOUNTS','  // END V2 MOUNTS');
  for(const simulation of [false,true]) for(const withPerformanceCard of [false,true]) {
    const p=page({simulation}); const nodes={};
    for(const name of ['home','files','jog','machine','history','settings']) nodes['screen-'+name]=p.document.createElement('section');
    const settings=nodes['screen-settings'];
    if(withPerformanceCard) {
      const perf=nodes['ks-performance-card']=p.document.createElement('div');
      const entry=p.document.createElement('div'), following=p.document.createElement('div');
      entry.id='ks-v2-card'; following.id='text-size-card';
      settings.appendChild(perf); settings.appendChild(entry); settings.appendChild(following);
      // Real DOM insertion and nextSibling semantics, including L6's existing entry.
      Object.defineProperty(perf,'nextSibling',{get:()=>settings.children[settings.children.indexOf(perf)+1]||null});
      settings.insertBefore=(node,ref)=>{const index=ref?settings.children.indexOf(ref):settings.children.length;assert(index>=0);settings.children.splice(index,0,node);node.parentNode=settings;return node;};
    }
    p.document.getElementById=id=>nodes[id]||null;
    vm.runInContext('(function(){var simulation='+simulation+';'+mountSource+'window.testMounts=v2Mounts;})();',p.context);
    assert.equal(Object.keys(p.window.testMounts()).length,0,'no DOM without gate');
    p.window.cncShell={v2Mounts:p.window.testMounts}; p.status(); p.frame(); await p.complete();
    const mounts=p.window.testMounts();
    assert.equal(Object.keys(mounts).length,6);
    for(const [name,m] of Object.entries(mounts)) {assert.equal(m.root.children.length,name==='settings'&&withPerformanceCard?4:1);assert(m.content.hidden);assert.equal(m.content.id,'perf-v2-'+name);}
    if(withPerformanceCard) assert.equal(settings.children[1],mounts.settings.content,'settings mount immediately after Performance, before existing L6 entry');
    const settingsOrder=settings.children.slice();
    assert.equal(mounts.prepare.origin,simulation?null:mounts.prepare.content);
    p.status({workflow:'running'}); p.window.cncProfile.setPerformance('eco'); p.frame();
    assert.equal(p.window.testMounts(),mounts,'same mount nodes throughout work/loss/Eco');
    assert(Object.entries(mounts).every(([name,m])=>m.root.children.length===(name==='settings'&&withPerformanceCard?4:1)));
    assert.deepEqual(settings.children,settingsOrder,'settings siblings stay in place during work/Eco');
  }
  // Exercise the shell's real wide block. V2 freezes layout, not the resource gate.
  const p=page(); p.classes.add('perf-performance');p.classes.add('perf-gpu');
  const shell=read('touch-shell.js'),start=shell.indexOf('var layoutWideOn'),end="window.addEventListener('cnc-gpu-change',fitLayout);fitLayout();";
  const rt=page({gpu:false,height:768});
  vm.runInContext('(function(){'+shell.slice(start,shell.indexOf(end,start)+end.length)+'})();',rt.context);
  rt.status();assert.equal(rt.frames.size,0,'RT startup adds no frame even with preference stored');
  vm.runInContext('(function(){'+shell.slice(start,shell.indexOf(end,start)+end.length)+'})();',p.context);
  p.status(); p.frame(); await p.complete(); assert(p.classes.has('perf-wide'));
  p.status({workflow:'running'});p.window.cncProfile.setPerformance('eco');p.frame();assert(p.classes.has('perf-wide'),'Eco preserves busy grid');
  p.status(null);p.frame();assert(p.classes.has('perf-wide'),'unknown cannot move grid');
  p.status();p.frame();p.frame();assert(!p.classes.has('perf-wide'),'old grid only at fresh Idle');
  const narrow=page();narrow.classes.add('perf-performance');narrow.classes.add('perf-gpu');
  vm.runInContext('(function(){'+shell.slice(start,shell.indexOf(end,start)+end.length)+'})();',narrow.context);
  narrow.status();narrow.frame();await narrow.complete();narrow.status({workflow:'running'});
  let released=0;narrow.api.lifecycle.scope(null).track('cache',()=>released++);
  narrow.window.innerHeight=700;narrow.emit('resize');
  assert.equal(released,1,'viewport loss releases resources even when the wide class is frozen');
  narrow.frame();assert(narrow.classes.has('perf-wide'));assert(narrow.classes.has('perf-v2'));
  // Strip mounts are existing cells. Relay identities, cooldown and immediate Stop survive.
  const {document,node,element}=require('./dom-fixture.cjs').createDOM(['home']);
  document.body.getAttribute=()=>null;const banner=node('real-banner');const listeners={},frames=[],clicks=[];
  node('job-pause').addEventListener('click',()=>clicks.push('pause'));node('job-stop').addEventListener('click',()=>clicks.push('stop'));
  document.createElement=tag=>{const e=element(tag);Object.defineProperty(e,'innerHTML',{set(){e._path={setAttribute(){}};}});e.querySelector=()=>e._path;return e;};
  const window={cncI18n:{t:s=>s,html:s=>s},requestAnimationFrame:f=>{frames.push(f);return frames.length;},cancelAnimationFrame(){},
    addEventListener(n,f){(listeners[n]||=[]).push(f);},removeEventListener(){}};
  vm.runInNewContext(read('status-strip.js'),{window,document,Date});
  const before=banner.children.slice(),m=window.cncStatusStrip.v2Mounts();assert(m.context&&m.messages);assert(!m.pause&&!m.stop);
  const byId=id=>banner.querySelectorAll('*').find(e=>e.id===id);
  const send=detail=>(listeners['cnc-job-status']||[]).forEach(f=>f({detail:{simulation:false,transportConnected:true,...detail}}));
  send({machine:{activeState:'Run',workflow:'running',fresh:true,canPause:true,canStop:true}});
  const pause=byId('t-pause'),stop=byId('t-stop'),parent=pause.parentNode;
  pause.click();stop.click();assert.deepEqual(clicks,['pause','stop']);
  send({machine:null,halt:{workflow:'running',canPause:true,canStop:true}});stop.click();assert.equal(clicks.at(-1),'stop');
  assert.deepEqual(banner.children,before);assert.equal(pause.parentNode,parent);assert.equal(stop.parentNode,parent);
  window.cncV2={message:()=> 'Changement préparé pour la prochaine session au repos',state:()=>({pending:true,enabled:true,sessionEnabled:false})};
  (listeners['cnc-v2-change']||[]).forEach(f=>f({detail:window.cncV2.state()}));
  assert(!m.messages.children.some(n=>n.id==='t-v2-pending'),'no DOM write in event handler');
  frames.splice(0).forEach(f=>f());
  assert(m.messages.children.some(n=>n.textContent===window.cncV2.message()),'pending preference is visibly announced');
  assert.equal(pause.parentNode,parent);assert.equal(stop.parentNode,parent);assert.deepEqual(banner.children,before);
  console.log('PASS v2 mounts: six stable lazy slots, no simulated visual origin, busy/unknown wide layout frozen, strip nodes and Pause/Stop relays unchanged.');
})().catch(e=>{console.error(e);process.exitCode=1;});
