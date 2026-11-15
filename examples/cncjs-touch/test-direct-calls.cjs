'use strict';
const assert=require('assert').strict,{load}=require('./job-controls-fixture.cjs');
(async()=>{
 for(const action of ['load','start','resume','pause','stop']){
  const f=load();assert.equal(typeof f.controls()[action],'function');f.controls()[action]();assert.equal(f.posts().length,0,action+' offline');
  await f.connect(f.machine({canLoad:false,canStart:false,canResume:false,canPause:false,canStop:false}));f.window.dispatchEvent({type:'cnc-library-select',detail:{file:'part.nc',name:'Part'}});f.controls()[action]();assert.equal(f.posts().length,0,action+' server refused');f.controls().dispose();
 }
 const lost=load();const stream=await lost.connect(lost.machine({workflow:'running',activeState:'Run',canPause:true,canStop:true}));stream.onerror();await lost.flush();lost.controls().pause();lost.controls().stop();assert.deepEqual(lost.posts().map(r=>r.body.action),['pause','stop']);assert(lost.posts().every(r=>r.body.port==='COM3'&&!r.body.transportId),'halt is the lost-state target');lost.controls().dispose();
 const other=load();await other.connect(other.machine({control:{owner:{kind:'touch',id:'other',label:'PC'},lastChange:null}}));other.window.dispatchEvent({type:'cnc-library-select',detail:{file:'part.nc',name:'Part'}});assert(other.el('job-load').disabled&&other.el('job-start').disabled,'C-30: commands are refused on the other device');other.controls().load();other.controls().start();assert.equal(other.posts().length,0);other.controls().dispose();
 const f=load();await f.connect();f.window.dispatchEvent({type:'cnc-library-select',detail:{file:'part.nc',name:'Part'}});f.controls().load();assert.equal(f.posts().at(-1).body.action,'load');const n=f.posts().length;f.controls().load();f.controls().start();f.controls().resume();assert.equal(f.posts().length,n,'busy blocks direct mutations');f.controls().dispose();
 console.log('PASS direct calls: five guards, offline/server refusal and concurrent requests; stops retain their own path.');
})().catch(e=>{console.error(e);process.exitCode=1;});
