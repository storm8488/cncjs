'use strict';
const assert=require('assert').strict,fs=require('fs');
const {fixture}=require('./check-page-fixture.cjs');
function setup(){const q=fixture();q.run('job-resume.js');q.window.cncShell.go('home');const requests=[];q.window.cncJobControls.resumePlan=(file,line)=>new Promise((resolve,reject)=>requests.push({file,line,resolve,reject}));return Object.assign(q,{plans:requests});}
module.exports={setup};
if(require.main===module)(async()=>{
 const q=setup();q.select('other.nc');q.send({jobStopped:true,stoppedAtLine:200,stoppedFile:'stopped.nc',name:'loaded.nc'});
 q.node('home-resume-line').click();assert.equal(q.plans.length,1);assert.deepEqual([q.plans[0].file,q.plans[0].line],['stopped.nc',185]);assert(q.node('home-resume-load').disabled);assert.equal(q.node('home-resume-check'),null);assert.match(q.node('ks-resume-sheet-title').textContent,/stopped.nc/);
 const input=q.node('home-resume-input');input.value='190';q.emit('unused');input.handlers.input[0]();assert.equal(q.plans.length,2);input.handlers.change[0]();assert.equal(q.plans.length,2,'input plus change requests one plan');assert(q.node('home-resume-load').disabled);
 q.plans[0].resolve({from:185});await q.flush();assert(q.node('home-resume-load').disabled,'old answer cannot arm another line');
 q.plans[1].resolve({from:190,programCheck:{verdict:'unknown'}});await q.flush();assert(!q.node('home-resume-load').disabled);
 q.select('third.nc');const loadOwner=q.window.cncJobControls.loadFrom;q.window.cncJobControls.loadFrom=(file,line)=>{const result=loadOwner(file,line);q.send({revision:'loaded-resume',jobStopped:false});return result;};q.node('home-resume-load').click();await q.flush();assert.deepEqual(q.calls.at(-1),{op:'loadFrom',file:'stopped.nc',line:190});assert.equal(q.window.cncShell.screen(),'check');
 q.window.cncJobControls.loadFrom=loadOwner;q.send({jobStopped:true,stoppedAtLine:200,stoppedFile:'stopped.nc'});q.window.cncShell.go('home');q.node('home-resume-line').click();input.value='192';input.handlers.input[0]();q.plans.at(-1).reject({code:'ETOUCH_RESUME_FEED',params:{line:192},message:'Reprise refusée.'});await q.flush();assert(q.node('home-resume-load').disabled);assert(q.node('home-resume-change'));assert(q.node('home-resume-begin'));assert(q.node('home-resume-plan').textContent);
 q.node('home-resume-begin').click();await q.flush();assert.deepEqual(q.calls.at(-1),{op:'loadFrom',file:'stopped.nc',line:1});assert.equal(q.window.cncShell.screen(),'check');
 q.window.cncShell.go('home');q.node('home-resume-line').click();q.send({revision:'r2'});q.plans.at(-1).resolve({from:185});await q.flush();assert(q.node('home-resume-load').disabled,'revision invalidates pending plan');
 q.send({name:null,stoppedFile:null,canLoad:false});assert(!q.node('home-resume-line').hidden);assert(q.node('home-resume-line').disabled);assert.match(q.node('home-resume-reason').textContent,/Aucun fichier/);
 assert(!fs.readFileSync(__dirname+'/touch/job-resume.js','utf8').includes("selection&&selection.file"));console.log('PASS resume sheet: stopped file, automatic plans, latest response only, guards, remedies, load then Control.');
})().catch(e=>{console.error(e);process.exitCode=1;});
