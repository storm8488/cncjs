'use strict';
// Zero piece never loads the removed comparison presenter, in either renderer.
const assert=require('assert').strict,fs=require('fs');
const {preparerPage,idle}=require('./test-v2-preparer-fixture.cjs');
(async()=>{
 for(const v2 of [false,true])for(const performance of ['eco','performance']){
  const q=preparerPage({v2,performance,screen:'jog'});q.show('jog');q.status(idle());await q.flush();q.resolveLoads();await q.flush();
  assert.equal(q.calls.loads.length,0,'initial Zero piece performs no advanced load');const requests=q.calls.loads.length;q.show('jog');for(let i=0;i<10;i++)q.status(idle());await q.flush();
  assert.equal(q.calls.loads.length,requests,'no advanced load on Zero piece');assert.equal(q.calls.mount.length,0);assert.equal(q.calls.reads,0);assert.equal(q.calls.updates.length,0);assert.equal(q.calls.catalogues.length,0);assert.equal(q.content.children.length,0);
 }
 const manual=preparerPage({manual:true});manual.status(idle());await manual.flush();assert.equal(manual.calls.loads.length,0,'no placement resource before explicit opening');manual.open();assert.equal(manual.calls.loads.length,1);manual.resolveLoads();await manual.flush();assert.equal(manual.calls.mount.length,1);
 const source=fs.readFileSync(__dirname+'/touch/check-screen.js','utf8');
 assert(!/pv2-|data-pv2|XMLHttpRequest|fetch\(/.test(source),'removed presenter, no direct transport');
 assert(source.includes('c.checkFile(file)'),'file check uses the guarded owner');
 console.log('PASS Zero piece: no comparison presenter, declarations, reads or advanced resources on jog in Eco and Performance.');
})().catch(e=>{console.error(e);process.exitCode=1;});
