'use strict';
const assert = require('assert').strict;
const vm = require('vm');
const {capture, parseArgs, script} = require('./measure-v2-inspect.cjs');
assert.throws(() => parseArgs(['--seconds','0']));
assert.throws(() => parseArgs(['--seconds','1801']));
assert.throws(() => parseArgs(['--port','9230']), /inconnu/);
assert.equal(parseArgs(['--seconds','60']).seconds, 60);
assert(!/fetch\(|XMLHttpRequest|WebSocket|\.click\(|dispatchEvent/.test(script({seconds:1})), 'measurement never transports or generates input');
function surface(slowPick = false) {
  let now=0,seq=0; const frames=new Map(),timers=new Map(),listeners=new Map();
  const eventTarget={addEventListener(n,f,capture){if(!listeners.has(n))listeners.set(n,new Set());listeners.get(n).add({f,capture:!!capture});},removeEventListener(n,f,capture){for(const row of listeners.get(n)||[])if(row.f===f&&row.capture===!!capture)listeners.get(n).delete(row);}};
  const canvas=Object.assign({getBoundingClientRect(){return {x:1,y:2,width:798,height:600};}},eventTarget);
  if(slowPick)canvas.addEventListener('pointerup',()=>{now+=60;});
  const view={canvas,state(){return {segments:160000,geometry:'full',live:{workflow:'running'}};},stats(){return {frames:10};}};
  const context={Promise,Date,Math,Number,Error,Array,JSON,console,performance:{now:()=>now,memory:{usedJSHeapSize:1024}},navigator:{userAgent:'fixture'},innerWidth:1366,innerHeight:911,devicePixelRatio:1.58,
    setTimeout(f,ms){const id=++seq;timers.set(id,{f,at:now+ms});return id;},clearTimeout:id=>timers.delete(id),requestAnimationFrame(f){const id=++seq;frames.set(id,f);return id;},cancelAnimationFrame:id=>frames.delete(id)};
  context.window=Object.assign({cncV2:{gate:()=>true,use:()=>({stub:false,snapshot:()=>({quality:{mode:'full'}}),diagnostics:()=>({ready:true})})},CNCPreviewGL:{view:()=>view},cncGpu:{state:()=>({hardware:true})}},eventTarget);
  context.document=Object.assign({hidden:false},eventTarget);
  const c=vm.createContext(context);
  return {run:opts=>vm.runInContext('('+capture.toString()+')('+JSON.stringify(opts)+')',c),emit(n,e={}){for(const row of Array.from(listeners.get(n)||[]).sort((a,b)=>Number(b.capture)-Number(a.capture)))row.f(e);},
    tick(ms){now+=ms;const q=Array.from(frames.values());frames.clear();q.forEach(f=>f(now));for(const [id,t] of Array.from(timers))if(t.at<=now){timers.delete(id);t.f();}},
    resources:()=>frames.size+timers.size+Array.from(listeners.values()).reduce((n,s)=>n+s.size,0)-(slowPick?1:0)};
}
(async()=>{
  let p=surface(),pending=p.run({seconds:1,scenario:'rejeu',candidate:'L1'});
  p.tick(16);p.emit('pointerup',{pointerType:'pen',timeStamp:16});p.emit('cnc-job-status',{detail:{machine:{statusAgeMs:2490}}});p.tick(16);p.tick(1000);
  let r=await pending;
  assert.equal(r.version,1);assert.equal(r.scenario,'rejeu');assert.equal(r.endReason,'complete');assert.equal(r.pointerToFrameMs.pen.n,1);assert.equal(r.reportAgeMs.max,2490);assert.equal(r.longTasks.available,false);
  assert.equal(p.resources(),0,'all observers/listeners/timers/frames released after capture');
  p=surface();pending=p.run({seconds:30});p.emit('pagehide');r=await pending;assert.equal(r.endReason,'pagehide');assert.equal(p.resources(),0);
  p=surface();pending=p.run({seconds:30});p.emit('cnc-screen-change');r=await pending;assert.equal(r.endReason,'screen-change');assert.equal(p.resources(),0);
  p=surface(true);pending=p.run({seconds:1});p.tick(16);p.emit('pointerup',{pointerType:'touch'});p.tick(16);p.tick(1000);r=await pending;
  assert(r.pointerToFrameMs.touch.max>=60,'input capture includes the existing synchronous proximity search');assert.equal(p.resources(),0);
  console.log('PASS v2 inspection measurement: bounded, no network/input, provenance, gesture latency, report ages and complete cleanup.');
})().catch(e=>{console.error(e);process.exitCode=1;});
