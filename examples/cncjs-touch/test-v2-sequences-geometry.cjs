'use strict';
const assert=require('node:assert/strict'), vm=require('node:vm'), fs=require('node:fs');
const {page}=require('./test-v2-gate.cjs');
const PI=require('./touch/preview-inspect.js'), ME=require('./touch/motion-estimate.js');
const tick=()=>new Promise(setImmediate);
const text='G21 G54\n(operation: Poche)\nG0 X1\nG1 X10 F100\nM0\nG1 Y10';
async function fixture() {
  const p=page(); p.status(); p.frame(); await p.complete();
  const workers=[], reads=[];
  p.window.CNCMotionEstimate=ME;
  p.window.Worker=class {
    constructor(url){this.url=url;workers.push(this);}
    postMessage(m){this.message=m;}
    terminate(){this.terminated=true;}
    result(){this.onmessage({data:{type:'geometry-v2',id:1,geometry:PI.buildV2Geometry(text)}});}
  };
  p.run('preview-inspect.js');
  const id=p.api.identity.create({role:'loaded',file:'piece.nc',fingerprint:'sha256:a',controller:'A',generation:'g1',revision:1});
  function input(identity=id) {return {identity,meta:{file:identity && identity.file,fingerprint:identity && identity.fingerprint},fetchProgram(file,onRequest){
    const request={file,abort(){this.aborted=true;}}; reads.push(request); onRequest(request);
    return new Promise(resolve=>{request.resolve=resolve;});
  }};}
  return {p,id,workers,reads,input,get model(){return p.api.use('geometry');}};
}
(async()=>{
  let f=await fixture(); assert.equal(f.model.stub,undefined,'real geometry provider installed');
  f.model.update(f.input()); assert.equal(f.reads.length,1);
  f.reads[0].resolve({fingerprint:'sha256:a',blob:{}}); await tick();
  assert.equal(f.workers.length,1); assert.equal(f.workers[0].message.type,'geometry-v2');
  f.workers[0].result(); await tick();
  const model=f.model.snapshot(); assert.equal(model.available,true); assert.equal(model.identity.jobKey,f.id.jobKey);
  assert.equal(model.memory.owner,'L2'); assert.equal(model.memory.mode,'borrowed-readonly'); assert.equal(model.memory.transferables.length,0);
  assert.equal(model.buffers.positions.length,6*model.segmentCount); assert(Object.isFrozen(model));
  assert(f.model.prepared().prepared.items.some(x=>x.kind==='pause'));
  f.model.update(f.input()); assert.equal(f.reads.length,1,'one loaded cache');
  f.p.emit('cnc-library-select',{file:'other.nc'}); assert.equal(f.model.snapshot(),model,'selection cannot evict loaded data');
  f.p.status({workflow:'running',activeState:'Run'});
  f.model.update(f.input()); assert.equal(f.reads.length,1,'no read during job'); assert.equal(f.model.snapshot(),model);
  f.p.status({fingerprint:'new',revision:2,workflow:'running'}); assert.equal(f.model.snapshot().available,false);
  // Identity unknown, selection and stale job identities cannot read a file.
  f=await fixture();
  for(const id of [null,{...f.id,role:'selection'},{...f.id,jobKey:null},f.p.api.identity.create({...f.id,revision:2})]) f.model.update(f.input(id));
  assert.equal(f.reads.length,0);
  // Every async boundary must re-check the lease; cancelled results cannot publish.
  for(const event of ['job','paused','stale','hidden','lock','screen','eco','gpu','pagehide','identity']) {
    for(const stage of ['read','worker']) {
      const q=await fixture(); q.model.update(q.input());
      if(stage==='worker'){q.reads[0].resolve({fingerprint:'sha256:a',blob:{}});await tick();}
      const late=q.workers[0]&&q.workers[0].onmessage;
      if(event==='job'||event==='paused')q.p.status({workflow:event==='job'?'running':'paused',activeState:'Run'});
      if(event==='stale')q.p.advance(2501);
      if(event==='hidden'){q.p.document.hidden=true;q.p.emit('doc:visibilitychange');}
      if(event==='lock')q.p.emit('cnc-screen-lock',true);
      if(event==='screen')q.p.emit('cnc-screen-change','files');
      if(event==='eco')q.p.window.cncProfile.setPerformance('eco');
      if(event==='gpu'){q.p.gpu.lost=true;q.p.emit('cnc-gpu-change');}
      if(event==='pagehide')q.p.emit('pagehide',{persisted:true});
      if(event==='identity')q.p.status({fingerprint:'new',revision:2});
      if(stage==='read')q.reads[0].resolve({fingerprint:'sha256:a',blob:{}});
      else late({data:{type:'geometry-v2',id:1,geometry:PI.buildV2Geometry(text)}});
      await tick();
      assert.equal(q.model.snapshot().available,false,event+' '+stage+' late result discarded');
      if(stage==='read')assert.equal(q.workers.length,0,event+' never starts late worker');
      else assert(q.workers[0].terminated,event+' worker terminated');
    }
  }
  f=await fixture();f.model.update(f.input());f.reads[0].resolve({fingerprint:'sha256:OTHER',blob:{}});await tick();assert.equal(f.workers.length,0,'opaque fingerprint mismatch');
  f.model.update(f.input());assert.equal(f.reads.length,2,'a failed read can retry');
  f=await fixture();f.model.update(f.input());f.reads[0].resolve({fingerprint:'sha256:a',blob:{}});await tick();
  f.workers[0].onmessage({data:{type:'geometry-v2',id:1,geometry:PI.buildV2Geometry(text,{cap:1})}});
  assert.equal(f.model.snapshot().available,false,'overflow never publishes partial full geometry');
  assert(f.model.prepared().prepared.items.some(i=>i.kind==='pause'),'sequence facts survive a geometry cap');
  f.model.update(f.input());assert.equal(f.reads.length,1,'over-cap file is not parsed on every view');
  // Exercise the actual worker branch and transfer list (no page-side parser).
  const messages=[];
  const worker={CNCMotionEstimate:ME,importScripts(){throw Error('ME already provided');},postMessage(m,b){messages.push({m,b});}};
  worker.self=worker;vm.createContext(worker);vm.runInContext(fs.readFileSync(__dirname+'/touch/preview-inspect.js','utf8'),worker);
  worker.onmessage({data:{type:'geometry-v2',id:7,blob:{text:()=>Promise.resolve(JSON.stringify({data:text}))}}});await tick();
  assert.equal(messages.length,1);assert.equal(messages[0].m.type,'geometry-v2');assert.equal(messages[0].b.length,3);
  assert.equal(new Set(messages[0].b).size,3,'one transfer per buffer');
  assert(messages[0].m.geometry.sequences.items.length>0);
  // The actual worker result and immutable provider retain the effective arc
  // tolerance; a capped subdivision must not revert to the requested 0.01 mm.
  const largeCircle='G21 G90 G54\nG0 X100000 Y0\nG2 X100000 Y0 I-100000 J0 F100';
  worker.onmessage({data:{type:'geometry-v2',id:8,blob:{text:()=>Promise.resolve(JSON.stringify({data:largeCircle}))}}});await tick();
  const large=messages[1].m.geometry, sagitta=100000*(1-Math.cos(Math.PI/4096));
  assert(Math.abs(large.toleranceMm-sagitta)<1e-7,'worker exposes effective tolerance');
  f=await fixture();f.model.update(f.input());f.reads[0].resolve({fingerprint:'sha256:a',blob:{}});await tick();
  f.workers[0].onmessage({data:messages[1].m});
  assert.equal(f.model.snapshot().available,true);
  assert.equal(f.model.snapshot().toleranceMm,large.toleranceMm,'provider preserves the worker tolerance');
  assert.equal(JSON.parse(f.model.snapshot().geometryKey)[3],large.toleranceMm,'geometry identity includes the effective tolerance');
  console.log('PASS v2 geometry: worker segments and sequences, single immutable cache, strict identities, transfer ownership, no job reads, all cancellation races.');
})().catch(e=>{console.error(e);process.exitCode=1;});
