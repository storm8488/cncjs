'use strict';
const assert=require('assert').strict,{createBench}=require('./parcours-server.cjs');
(async()=>{const b=createBench();try{
 await new Promise(r=>b.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+b.server.address().port;
 const post=async(url,body)=>{const r=await fetch(base+url,{method:'POST',body:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;};
 assert.equal((await post('/parcours/open',{})).controllers.length,1);assert.equal(b.sim.profile.name,'lunyee');
 await post('/parcours/sim',{input:'probe',state:'permanent'});assert(b.sim.probeStuck);await post('/parcours/sim',{input:'probe',state:'free'});assert(!b.sim.probeStuck);
 await post('/parcours/sim',{input:'pilot'});const snapshot=await (await fetch(base+'/api/touch-job')).json();assert.equal(snapshot.controllers[0].control.owner.label,'PC atelier');
 const result=await post('/api/touch-job',{action:'control',port:'SIM',operation:'takeover',reason:'Operator at machine',clientId:'local-page',clientLabel:'Tablet'});assert.equal(result.snapshot.controllers[0].control.owner.id,'local-page');
 assert.equal((await fetch(base+'/connection-fixture.js')).status,200);
 }finally{await b.close();}console.log('PASS parcours bench: loopback, real service and LUNYEE bridge, physical inputs, other pilot and takeover snapshot.');})().catch(e=>{console.error(e);process.exitCode=1;});
