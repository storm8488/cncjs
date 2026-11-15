'use strict';
const assert=require('assert').strict,{createBench}=require('./parcours-server.cjs');
(async()=>{const b=createBench();try{
 await new Promise(r=>b.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+b.server.address().port;
 const post=async(url,body)=>{const r=await fetch(base+url,{method:'POST',body:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;};
 assert.equal((await post('/parcours/open',{})).controllers.length,1);assert.equal(b.sim.profile.name,'lunyee');
 // P1/P8 through the real service and parser, with no browser or physical machine.
 const until=async(check)=>{const end=Date.now()+10000;while(Date.now()<end){const m=b.service.list()[0];if(check(m))return m;await new Promise(r=>setTimeout(r,25));}throw Error('Timed out waiting for machine: '+JSON.stringify(b.service.list()[0]));};
 const who={kind:'touch',id:'local-page',label:'Tablet'};b.service.openTransport('recovery-test',who);
 const home=async function(){const m=await until(m=>m.canHome);const body={port:'SIM',generation:m.generation,transportId:'recovery-test',clientId:'local-page'};const ticket=await post('/api/touch-job',{...body,action:'prepare',operation:'home'});assert(ticket.nonce);await post('/api/touch-job',{...body,action:'home',nonce:ticket.nonce});return until(m=>m.homed&&m.workOffset.state==='proven');}
 let ready=await home();assert.equal(ready.referenceLost,null);assert.equal(ready.workOffset.state,'proven');
 await post('/parcours/sim',{input:'job',clientId:'local-page',transportId:'recovery-test'});assert.equal(b.service.list()[0].workflow,'running');
 await post('/parcours/sim',{input:'limit',axis:'x',on:true});await post('/parcours/sim',{input:'limit',axis:'x',on:false});
 const incident=await until(m=>m.lastAlarm&&m.lastAlarm.code===1);assert.equal(incident.homed,false);assert(incident.referenceLost);
 await post('/api/touch-job',{action:'stop',port:'SIM',clientId:'local-page',transportId:'recovery-test'});await until(m=>m.jobStopped&&m.workflow==='idle');assert.equal(b.service.list()[0].stoppedFile,'recovery.nc');assert.equal(b.service.list()[0].stoppedAtLine,2);
 ready=await home();assert.equal(ready.lastAlarm,null);assert.equal(ready.workOffset.state,'proven');await post('/api/touch-job',{action:'control',operation:'release',port:'SIM',clientId:'local-page'});b.service.closeTransport('recovery-test');
 await post('/parcours/sim',{input:'probe',state:'permanent'});assert(b.sim.probeStuck);await post('/parcours/sim',{input:'probe',state:'free'});assert(!b.sim.probeStuck);
 await post('/parcours/sim',{input:'pilot'});const snapshot=await (await fetch(base+'/api/touch-job')).json();assert.equal(snapshot.controllers[0].control.owner.label,'PC atelier');
 const result=await post('/api/touch-job',{action:'control',port:'SIM',operation:'takeover',reason:'Operator at machine',clientId:'local-page',clientLabel:'Tablet'});assert.equal(result.snapshot.controllers[0].control.owner.id,'local-page');
 assert.equal((await fetch(base+'/connection-fixture.js')).status,200);
 }finally{await b.close();}console.log('PASS parcours bench: loopback, real service and LUNYEE bridge, physical inputs, other pilot and takeover snapshot.');})().catch(e=>{console.error(e);process.exitCode=1;});
