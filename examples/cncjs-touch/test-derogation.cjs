'use strict';
const assert=require('assert'),{fixture,check}=require('./check-page-fixture.cjs'),{load}=require('./job-controls-fixture.cjs');
(async()=>{
 const blocking=[{code:'ETOUCH_TRAVEL_TOO_LOW',axis:'Z',params:{over:'15'}}],outside=check('outside',{blocking,overridable:true});outside.axes.Z.verdict='outside';
 const q=fixture();q.send({canStart:false,programCheck:outside});let b=q.node('check-override-open');assert(b);assert(b.closest('#ks-check-details'));q.node('check-details-open').click();b.click();await q.flush();assert.deepEqual(q.calls.at(-1),{op:'override'});
 q.send({canStart:false,programCheck:check('outside')});assert(!q.node('check-override-open'));q.send({workOffset:{state:'failed'},programCheck:outside});assert(!q.node('check-override-open'));
 const f=load();await f.connect(f.machine({canStart:false,programCheck:outside}));f.controls().startOverride();await f.flush();assert.equal(f.posts().at(-1).body.override,'travel');assert.equal(f.posts().at(-1).body.operation,'start');
 f.answer(f.posts().at(-1),{nonce:'over',expiresIn:15,programCheck:outside,override:{blocking}});await f.flush();assert(!f.el('job-dialog').hidden);assert(f.el('job-check-text').textContent.includes('15 mm'));assert(f.el('job-confirm').disabled);
 f.advance(600);f.el('job-check').checked=true;f.el('job-check').fire('change');assert(!f.el('job-confirm').disabled);f.el('job-confirm').click();await f.flush();assert.equal(f.posts().at(-1).body.nonce,'over');assert.equal(f.posts().at(-1).body.action,'start');
 f.answer(f.posts().at(-1),{code:'ETOUCH_START_OVERRIDE_CHANGED',message:'Le contrôle a changé. Recommencez.'},409);await f.flush();assert(f.el('job-dialog').hidden);assert(f.el('job-feedback').textContent.includes('changé'));f.controls().dispose();
 const missing=load();await missing.connect(missing.machine({canStart:true,workOffset:null}));await missing.controls().start();assert.equal(missing.posts().length,0,'the direct owner also refuses missing D2, even with canStart');missing.controls().dispose();
 const late=load();await late.connect(late.machine({canStart:false,programCheck:outside}));const sourceSheet={hidden:false},origin=late.el('check-override-open');origin.closest=()=>sourceSheet;origin.focus();late.controls().startOverride();sourceSheet.hidden=true;late.answer(late.posts().at(-1),{nonce:'late',expiresIn:15,programCheck:outside,override:{blocking}});await late.flush();assert(late.el('job-dialog').hidden,'closing Details cancels a pending override opening');assert(!late.posts().some(r=>r.body.action==='start'));late.controls().dispose();
 console.log('PASS derogation: details only, proven D2 and reference, separate prepare, checkbox and changed check refusal.');
})().catch(e=>{console.error(e);process.exitCode=1;});
