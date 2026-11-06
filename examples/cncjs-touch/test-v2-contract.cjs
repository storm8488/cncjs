'use strict';
const assert=require('assert').strict;
const {page}=require('./test-v2-gate.cjs');
(async()=>{
  const p=page(); p.status(); p.frame(); await p.complete(); const v=p.api;
  assert(v.identity,'documented inter-lot API installed');
  const a=v.identity.create({role:'loaded',file:'part.nc',fingerprint:'aaa',controller:'A',generation:'g1',revision:1});
  const b=v.identity.create({role:'selection',file:'part.nc',fingerprint:'bbb'});
  assert.notEqual(a.key,b.key); assert.equal(v.identity.compare(a,b),'different');
  assert.equal(v.identity.compare(a,v.identity.create({role:'selection',file:'part.nc',fingerprint:'aaa'})),'same');
  assert.equal(v.identity.compare(a,v.identity.create({role:'selection',file:'part.nc'})),'unknown');
  assert.notEqual(a.jobKey,v.identity.create({role:'loaded',file:'part.nc',fingerprint:'aaa',controller:'A',generation:'g2',revision:1}).jobKey);
  assert(Object.isFrozen(a));
  const time=v.time.stamp({serverTime:123,serverSource:'server-status'}); p.advance(2500);
  assert.equal(v.time.age(time),2500); assert.equal(v.time.freshness(time,0),'fresh'); p.advance(1); assert.equal(v.time.freshness(time,0),'stale');
  assert.equal(v.time.age({arrivalMonoMs:null}),null); assert.equal(time.server.source,'server-status');
  assert.equal(v.time.freshness(time,null),'unknown','missing server report age is not zero');
  const required={inspect:'L1',geometry:'L2',sequences:'L2',placement:'L2',observation:'L3',journal:'L3',suivi:'L4',files:'L5',prepare:'L5',machine:'L6',history:'L6',settings:'L6'};
  for(const [name,owner] of Object.entries(required)) {
    const s=v.use(name); assert.equal(s.owner,owner); assert.equal(s.stub,true);
    const result=s.snapshot(); assert.equal(result.version,1); assert.equal(result.available,false); assert(Object.isFrozen(result));
    assert.equal(s.update({canStart:true}).available,false); s.cancel('test'); s.dispose();
  }
  assert.equal(v.use('observation').snapshot().report.position,null);
  assert.equal(v.use('observation').snapshot().acknowledgement.line,null);
  assert.equal(v.use('geometry').snapshot().quality,'unknown');
  assert.equal(v.use('placement').snapshot().travel.verdict,'unknown');
  assert.equal(v.use('inspect').snapshot().selection,null);
  assert.equal(v.use('sequences').snapshot().next,null);
  assert.equal(v.use('journal').snapshot().interval,null);
  assert.equal(v.commands,null,'no command transport in the presentation contract');
  const early=v.lifecycle.scope(null);let initialCacheReleased=0;early.track('cache',()=>initialCacheReleased++);
  p.status({fingerprint:'first-change'});assert.equal(initialCacheReleased,1,'bootstrap identity known before first contract event');early.dispose();p.status();
  const disposed=[], cancelled=[];
  v.register('inspect',{snapshot:()=>({version:1,available:false}),update:()=>null,cancel:r=>cancelled.push(r),dispose:r=>disposed.push(r)});
  assert.equal(v.use('inspect').stub,undefined);
  assert.throws(()=>v.register('unknown',{})); assert.throws(()=>v.register('geometry',{snapshot(){}}));
  assert.throws(()=>v.use('__proto__'));
  const remove=v.register('geometry',{snapshot:()=>({version:1,send:function(){}}),update(){},cancel(){},dispose(){}});
  assert.throws(()=>v.notify('geometry'),'model events cannot carry a command callback');remove();
  // Render callbacks only run in RAF, only for the active screen; program reads carry a revocable lease.
  p.emit('cnc-screen-change','home'); p.status();
  const life=v.lifecycle.scope('home'), calls=[];
  let token=life.token(); life.track('read',()=>calls.push('abort')); life.track('cache',()=>calls.push('release'));
  life.frame(()=>calls.push('render')); assert.deepEqual(calls,[]); p.frame(); assert.deepEqual(calls,['render']);
  life.frame(()=>calls.push('hidden-render')); p.emit('cnc-screen-change','files'); p.frame();
  assert(!life.valid(token)); assert(calls.includes('abort')); assert(!calls.includes('release')); assert(!calls.includes('hidden-render'));
  life.track('render',()=>calls.push('late-hidden-render-cancel'));
  assert(calls.includes('late-hidden-render-cancel'),'late renderer must also be cancelled after its screen was hidden');
  p.emit('cnc-screen-change','home'); token=life.token(); life.track('read',()=>calls.push('job-abort'));
  p.status({workflow:'running',activeState:'Run'}); assert(calls.includes('job-abort')); assert(!life.valid(token)); assert(!calls.includes('release'));
  assert.equal(life.token(),null,'no read lease during job');
  life.frame(()=>calls.push('live-render')); p.frame(); assert(calls.includes('live-render'),'already prepared scene remains renderable');
  p.status({fingerprint:'new',revision:2,workflow:'running'}); assert(calls.includes('release'),'loaded identity invalidates cached geometry');
  p.status(); life.track('cache',()=>calls.push('eco-release')); p.window.cncProfile.setPerformance('eco'); assert(calls.includes('eco-release'));
  assert(disposed.includes('eco')); life.dispose(); life.dispose();
  // Every cancellation case has an executable stub test; pagehide includes bfcache suspension.
  for(const [event,detail] of [['cnc-screen-lock',true],['pagehide',{persisted:true}],['cnc-gpu-change',null]]) {
    const q=page(); q.status(); q.frame(); await q.complete(); q.emit('cnc-screen-change','home');
    const s=q.api.lifecycle.scope('home'); let aborted=0; s.track('read',()=>aborted++); s.frame(()=>assert.fail('cancelled frame'));
    if(event==='cnc-gpu-change') q.gpu.lost=true;
    q.emit(event,detail); q.frame(); assert.equal(aborted,1,event);
  }
  const ordered=page();ordered.status();ordered.frame();await ordered.complete();
  const order=[];
  ordered.api.lifecycle.scope(null,'geometry').track('cache',()=>order.push('owner'));
  ordered.api.lifecycle.scope(null,'inspect').track('cache',()=>order.push('borrower'));
  let ends=0;const unregister=ordered.api.register('sequences',{snapshot(){},update(){},cancel(){},dispose(){ends++;}});
  ordered.window.cncProfile.setPerformance('eco');unregister();unregister();
  assert.deepEqual(order,['borrower','owner'],'borrowers release before transferable owner');assert.equal(ends,1,'provider disposed exactly once');
  console.log('PASS v2 contract: L1-L6 stubs, identity, monotone freshness, unknowns, read leases, RAF, cache ownership, cancellation and no commands.');
})().catch(e=>{console.error(e);process.exitCode=1;});
