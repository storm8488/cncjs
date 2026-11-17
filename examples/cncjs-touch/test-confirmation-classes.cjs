'use strict';
const assert=require('assert').strict,{load}=require('./job-controls-fixture.cjs');
(async()=>{
 for(const op of ['home','unlock','zeroZ','blockProbe','spindle','start','resume','macro','frame']){
 const f=load();await f.connect(f.machine({canHome:true,canUnlock:true,canZeroZ:true,canBlockProbe:true,canSpindleTest:true,canMacro:true,canResume:true,machineProfile:{kind:'cnc',capabilities:{laserFrame:{supported:true},cncFrame:{supported:true}}}}));
 if(op==='start')f.controls().start();else if(op==='resume')f.controls().resume();else if(op==='macro')f.controls().prepareMacro('m1');else if(op==='frame')f.controls().prepareFrame();else f.controls().prepareCommand(op);
 const req=f.posts().at(-1);assert(req);f.answer(req,{nonce:'test',expiresIn:15,revision:'rev-1',name:'part.nc',blockProbe:{axes:'XYZ'}});await f.flush();assert.equal(f.el('job-dialog').hidden,false,op);
 assert(!/Confirmer|^OK$/.test(f.el('job-confirm').textContent),op+' names its effect');
 const count=f.posts().length;f.el('job-confirm').fire('click');assert.equal(f.posts().length,count,op+' before 600 ms');
 f.el('job-check').checked=true;f.el('job-check').fire('change');assert.equal(f.el('job-confirm').disabled,true,op+' checked before arming');f.advance(599);f.el('job-confirm').fire('click');assert.equal(f.posts().length,count,op+' still refuses at 599 ms');f.advance(1);f.el('job-check').checked=false;f.el('job-confirm').fire('click');assert.equal(f.posts().length,count,op+' checkbox required');
 f.el('job-check').checked=true;f.el('job-check').fire('change');f.el('job-confirm').click();assert.equal(f.posts().length,count+1,op+' sends after arming and check');f.controls().dispose();
 }
 const plate=load();await plate.connect(plate.machine({canZeroZ:true}));const prepared=plate.controls().prepareCommand('zeroZ',{thickness:10,search:15});plate.answer(plate.posts().at(-1),{nonce:'plate',expiresIn:15});await prepared;assert.match(plate.el('job-warning').textContent,/10 mm.*15 mm/);const before=plate.posts().length;plate.el('job-dialog-modify').click();assert(plate.el('job-dialog').hidden);plate.advance(600);plate.el('job-check').checked=true;plate.el('job-confirm').fire('click');assert.equal(plate.posts().length,before,'Modify discards the plate ticket');plate.controls().dispose();
 console.log('PASS confirmation classes: nine operations, named effects, 600 ms arming and retained checkbox.');
})().catch(e=>{console.error(e);process.exitCode=1;});
