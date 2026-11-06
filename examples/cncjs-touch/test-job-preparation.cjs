'use strict';
// Guided job preparation (job-preparation.js): the five steps and their states from the
// machine snapshot, the selection, the preview verdict and the travel check; the operator
// ticks forgotten when the program or the work offset changes; nothing started from the
// sheet. Pure model plus the sheet flow on a synthetic DOM, no network.
const assert=require('assert').strict,fs=require('fs'),vm=require('vm');
const P=require('./touch/job-preparation');
const states=r=>r.steps.map(s=>s.id+':'+s.state).join(' ');
const idle={port:'A',name:'a.nc',originalName:'Pièce A.nc',revision:3,fresh:true,activeState:'Idle',workflow:'idle',canStart:true,canLoad:true,
  coordinates:{mpos:{x:-100,y:-50,z:-10},wpos:{x:0,y:0,z:0}},operator:{wcs:'G54',reportUnits:'mm'},settings:{$22:'1'}};
const sel={file:'a.nc',name:'Pièce A.nc'};
// Nothing known.
let r=P.assess({machine:null,selection:null,ticks:{}});
assert.equal(states(r),'file:blocking tool:todo origin:todo checks:blocking ready:blocking');assert(!r.ready&&r.blocked);
// Selected, not loaded.
r=P.assess({machine:{...idle,name:''},selection:sel,ticks:{}});
assert.equal(r.steps[0].state,'todo');assert.match(r.steps[0].next,/Chargez-le/);assert.equal(r.steps[4].state,'todo');
// Validation D2: before any load the server's start reason (« Le fichier chargé a changé… ») is not shown.
r=P.assess({machine:{...idle,name:'',canStart:false,startReason:'Le fichier chargé a changé. Rechargez-le et confirmez à nouveau.'},selection:sel,ticks:{}});
assert.equal(r.steps[4].detail,'Après le chargement du fichier.');assert.doesNotMatch(r.steps.map(x=>x.detail).join(' '),/a changé/);
// Loaded and selected, nothing ticked: the machine accepts a start but steps remain; not ready.
r=P.assess({machine:idle,selection:sel,ticks:{},travel:{state:'ok',message:'Dans la course machine en X et Y.'}});
assert.equal(states(r),'file:ok tool:todo origin:todo checks:ok ready:todo');assert(!r.ready);assert.match(r.steps[4].detail,/étapes à cocher/);
assert.match(r.steps[3].detail,/Dans la course/);assert.equal(r.programKey,'a.nc:3:');assert.equal(r.offsetKey,'-100,-50,-10:G54');
// Both ticked: ready, and the text says Démarrer is elsewhere.
r=P.assess({machine:idle,selection:sel,ticks:{tool:true,origin:true}});
assert.equal(r.steps[4].state,'ok');assert(r.ready);assert.match(r.steps[4].next,/Démarrer se touche dans Suivi.*Rien ne part/);
assert.match(r.steps[2].detail,/^Réglée · G54$/);
// Plate Z zero shown with the origin.
r=P.assess({machine:{...idle,zeroZ:{thickness:10,wcs:'G54',machineZ:-35}},selection:sel,ticks:{tool:true,origin:true}});assert.match(r.steps[2].detail,/zéro Z plaque 10 mm/);
// Loaded file differs from the selection: a warning, with the load as next action.
r=P.assess({machine:idle,selection:{file:'b.nc',name:'B.nc'},ticks:{tool:true,origin:true}});
assert.equal(r.steps[0].state,'warn');assert.match(r.steps[0].detail,/Chargé : Pièce A\.nc · sélectionné : B\.nc/);
// Server refuses the start: the reason is the ready step's text.
r=P.assess({machine:{...idle,canStart:false,startReason:'Fichier modifié depuis le chargement : rechargez-le.'},selection:sel,ticks:{tool:true,origin:true}});
assert.equal(r.steps[4].state,'todo');assert.equal(r.steps[4].detail,'Fichier modifié depuis le chargement : rechargez-le.');assert(!r.ready);
// Alarm blocks; outside the travel warns; homing off warns; stale preview warns on the file step.
r=P.assess({machine:{...idle,activeState:'Alarm',canStart:false,startReason:'Alarme.'},selection:sel,ticks:{tool:true,origin:true}});
assert.equal(r.steps[3].state,'blocking');assert.equal(r.steps[4].state,'blocking');assert(r.blocked);
r=P.assess({machine:idle,selection:sel,ticks:{},travel:{state:'outside',message:'Hors course machine : X …'}});assert.equal(r.steps[3].state,'warn');assert.match(r.steps[3].detail,/Hors course/);
r=P.assess({machine:{...idle,settings:{$22:'0'}},selection:sel,ticks:{}});assert.equal(r.steps[3].state,'warn');assert.match(r.steps[3].detail,/\$22/);
r=P.assess({machine:idle,selection:sel,ticks:{},previewVerdict:'stale'});assert.equal(r.steps[0].state,'warn');assert.match(r.steps[0].next,/régénérez/);
// A running job: nothing to tick, the ready step points at Suivi.
r=P.assess({machine:{...idle,workflow:'running',activeState:'Run',canStart:false},selection:sel,ticks:{}});assert.equal(r.steps[0].state,'ok');assert.match(r.steps[4].detail,/voir Suivi/);assert(!r.ready);
// Keys: another revision or another offset changes the key (the sheet forgets the ticks).
assert.notEqual(P.programKey({...idle,revision:4}),P.programKey(idle));assert.notEqual(P.offsetKey({...idle,coordinates:{mpos:{x:-100,y:-50,z:-12},wpos:{x:0,y:0,z:0}}}),P.offsetKey(idle));
assert.equal(P.offsetKey({...idle,coordinates:null}),'');assert.equal(P.programKey({...idle},{fingerprint:'sha256:abc'}),'a.nc:3:sha256:abc');

// Sheet flow on the real page.
const {document,node,element}=require('./dom-fixture.cjs').createDOM(['jog']);
document.body.getAttribute=()=>null;document.body.children=[];document.body.appendChild=function(c){this.children.push(c);c.parentNode=this;};
const listeners={},opened=[];const actions=element('div','actions'),tools=element('div','tools');tools.className='ks-file-tools';document.querySelector=sel=>sel==='.ks-file-tools'?tools:node('panel');
const sheetContent=element('div','sheet-content');
const window={cncI18n:{t:s=>s,message:s=>s},cncLibrarySelection:sel,addEventListener:(n,f)=>(listeners[n]=listeners[n]||[]).push(f),
  cncShell:{sheet:(id,title)=>({content:sheetContent,open:()=>opened.push(id)}),preparationActions:actions},
  CNCTravelCheck:{check:()=>({state:'ok',message:'Dans la course machine en X et Y.'})}};
vm.runInNewContext(fs.readFileSync(__dirname+'/touch/job-preparation.js','utf8'),{window,document});
const send=(machine,detail)=>listeners['cnc-job-status'].forEach(f=>f({detail:Object.assign({machine,simulation:false},detail||{})}));
const open=tools.children[0];assert.equal(open.id,'ks-preparation-open','entry point in the Fichiers tools');assert.equal(actions.children.length,0,'the Préparer intro row keeps three buttons');assert.equal(open.textContent,'Préparer le travail…');
const steps=()=>sheetContent.querySelectorAll('*').filter(e=>e.getAttribute&&e.getAttribute('data-step'));
const box=id=>sheetContent.querySelectorAll('*').find(e=>e.id==='ks-prep-'+id);
open.click();assert.deepEqual(opened,['ks-preparation']);assert.equal(steps().length,5);
send(idle);
assert.equal(steps()[0].getAttribute('data-state'),'ok');assert.equal(steps()[4].getAttribute('data-state'),'todo');assert(!box('tool').disabled);
box('tool').checked=true;box('tool').handlers.change();box('origin').checked=true;box('origin').handlers.change();
assert.equal(steps()[4].getAttribute('data-state'),'ok');assert.equal(open.getAttribute('data-tone'),'ok');
assert.match(node('ks-prep-footer').textContent||sheetContent.querySelectorAll('*').find(e=>e.id==='ks-prep-footer').textContent,/ne lance rien/);
// A new work zero forgets the origin tick only; a new revision of the program forgets both.
send({...idle,coordinates:{mpos:{x:-100,y:-50,z:-12},wpos:{x:0,y:0,z:0}}});
assert.equal(JSON.stringify(window.cncJobPreparation.ticks()),JSON.stringify({tool:true,origin:false}));assert.equal(steps()[2].getAttribute('data-state'),'todo');
box('origin').checked=true;box('origin').handlers.change();assert.equal(JSON.stringify(window.cncJobPreparation.ticks()),JSON.stringify({tool:true,origin:true}));
send({...idle,revision:4,coordinates:{mpos:{x:-100,y:-50,z:-12},wpos:{x:0,y:0,z:0}}});
assert.equal(JSON.stringify(window.cncJobPreparation.ticks()),JSON.stringify({tool:false,origin:false}));
// Ticks are disabled during a job and when nothing is loaded; the load relay only clicks an enabled job-load.
send({...idle,workflow:'running',activeState:'Run',canStart:false});assert(box('tool').disabled);
let loads=0;node('job-load').addEventListener('click',()=>loads++);node('job-load').disabled=true;
send({...idle,name:''});const load=sheetContent.querySelectorAll('*').find(e=>e.id==='ks-prep-load');assert(load.hidden,'no load button while job-load is disabled');
node('job-load').disabled=false;send({...idle,name:''});assert(!load.hidden);load.click();assert.equal(loads,1);
// Nothing in the module sends a command: no cncJobControls call, no XMLHttpRequest.
const source=fs.readFileSync(__dirname+'/touch/job-preparation.js','utf8');
assert(!/cncJobControls|XMLHttpRequest|fetch\(/.test(source),'the sheet never commands the machine');
// Every phrase is in the FR/EN/ES catalog; the script loads after touch-shell.js and macros.js on both pages.
const phrases=[...source.matchAll(/\bt\('((?:[^'\\]|\\.)*)'\)/g)].map(m=>m[1]);
const catalog={window:{}};['i18n-messages.js','i18n-messages-profiles.js'].forEach(n=>vm.runInNewContext(fs.readFileSync(__dirname+'/touch/'+n,'utf8'),catalog));
const keys=new Set(catalog.window.CNCTouchMessages.map(r=>r[0].trim().replace(/\s+/g,' ')));
for(const p of new Set(phrases))if(/[a-zà-ÿ]{2}/i.test(p))assert(keys.has(p.trim().replace(/\s+/g,' ')),'missing translation: '+p);
for(const name of ['index.html','simulation.html']){const html=fs.readFileSync(__dirname+'/touch/'+name,'utf8');assert(html.indexOf('job-preparation.js')>html.indexOf('touch-shell.js')&&html.indexOf('job-preparation.js')>html.indexOf('macros.js'),name);}
console.log('PASS job preparation: five steps from the snapshot, selection, verdict and travel check; ticks forgotten on a new program or work zero; sheet flow; nothing started from the sheet; translations.');
