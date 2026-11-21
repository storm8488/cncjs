'use strict';
// Real L0 + L1 provider + GL owner together (GL driver stub only); no network/browser.
const assert = require('assert').strict;
const fs = require('fs');
const vm = require('vm');
const {createPage} = require('./test-preview-gl.cjs');
const T3 = require('./touch/toolpath-3d.js');
const idle=new Map();let seq=0,now=0;
const gate={gate:()=>true,state:()=>({safeIdle:true,programKey:null})};
const p=createPage({gpu:true,v2:gate,clock:()=>now,dpr:1.58,
  requestIdleCallback:fn=>{idle.set(++seq,fn);return seq;},cancelIdleCallback:id=>idle.delete(id)});
p.win.cncShell={screen:()=> 'home'};
p.win.CustomEvent=class{constructor(type,options){this.type=type;this.detail=options.detail;}};
p.win.dispatchEvent=e=>p.win.dispatch(e.type,e.detail);
for(const name of ['performance-v2-contract.js','performance-inspect.js'])vm.runInContext(fs.readFileSync(__dirname+'/touch/'+name,'utf8'),p.win,{filename:name});
const builder=T3.createBuilder({bounds:[0,0,-1,10,10,0]});
builder.move(0,0,0,10,0,-1,1,1);builder.move(10,0,-1,10,10,-1,1,2);
const meta={file:'scene.nc',fingerprint:'sha256:scene',path3d:builder.finish(2),zBounds:[-1,0]};
function children(n,cls){if(n.classList&&n.classList.contains(cls))return n;for(const c of n.children||[]){const hit=children(c,cls);if(hit)return hit;}return null;}
function drain(){let n=10000;while(idle.size&&n--){const [id,fn]=idle.entries().next().value;idle.delete(id);fn({timeRemaining:()=>10});}assert(n>0);p.runFrames(now+=16);}
(async()=>{
 const view=p.win.CNCPreviewGL.open(meta,{container:p.doc.createElement('div')});drain();
 const inspect=gate.use('inspect');assert(inspect.diagnostics().ready);assert(view.stats().passes.ready);
 const camera=JSON.stringify(view.camera());children(view.dialog,'pgl-examine').click();
 const q=view.project(5,0,-.5);
 view.canvas.dispatch('pointerdown',{pointerId:1,pointerType:'pen',clientX:q.x,clientY:q.y});
 view.canvas.dispatch('pointerup',{pointerId:1,pointerType:'pen',clientX:q.x,clientY:q.y});p.runFrames(now+=16);
 assert.equal(inspect.snapshot().selection.segment,0);assert.equal(inspect.snapshot().selection.sourceLine,1);
 assert(view.canvas.glStub.log.scissors>0);assert.equal(children(view.dialog,'pgl-inspection-crosshair').hidden,false);
 children(view.dialog,'pgl-inspection-return').click();p.runFrames(now+=16);assert.equal(JSON.stringify(view.camera()),camera);
 inspect.setQuality('reduced');p.runFrames(now+=16);assert.equal(view.stats().dpr,1);
 const result=inspect.diagnose({frames:3});for(let i=0;i<4;i++)p.runFrames(now+=16);assert.equal((await result).samples,3);
 inspect.setQuality('fixed');assert(view.state().closed);assert.equal(inspect.snapshot().quality.mode,'fixed');assert.equal(inspect.diagnostics().indexBytes,0);
 assert.equal(p.frames.length,0);assert.equal(idle.size,0);assert.equal(view.canvas.glStub.log.created.buffer,view.canvas.glStub.log.deleted.buffer);
 p.win.dispatch('cnc-screen-change','files');assert.equal(inspect.snapshot().quality.mode,'fixed');
 console.log('PASS v2 inspection scene: real contract/provider/GL, pen picking, one-context loupe, restored camera, measured quality and complete release.');
})().catch(e=>{console.error(e);process.exitCode=1;});
