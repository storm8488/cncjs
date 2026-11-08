const fs=require('fs'), vm=require('vm'), assert=require('assert');
const elements={}, listeners={};
function el(id){return elements[id]||(elements[id]={value:'',textContent:'',addEventListener(){},appendChild(){},insertBefore(){},setAttribute(){},focus(){}});}
const document={body:{appendChild(){},getAttribute(){return null;}},querySelector:()=>el('panel'),getElementById:el,createElement:()=>el('option'),addEventListener(){},hidden:false};
let response={controllers:[{port:'TEST',type:'Grbl',activeState:'Alarm',workflow:'idle',fresh:true,name:'',canLoad:false,canStart:false,loadReason:'Idle requis',startReason:'Fichier changé'}]};
const pending=[];
function XHR(){this.open=()=>{};this.setRequestHeader=()=>{};this.send=()=>pending.push(()=>{this.status=200;this.responseText=JSON.stringify(response);this.onload();});}
const timers=[];
let now=10000;class Clock extends Date{static now(){return now;}}
vm.runInNewContext(fs.readFileSync(__dirname+'/touch/job-controls.js','utf8'),{document,window:{cncLibrarySelection:{name:'Feuille.nc',file:'leaf.nc'},addEventListener:(n,fn)=>listeners[n]=fn,dispatchEvent(){}},CustomEvent:function(type,options){this.type=type;this.detail=options.detail;},localStorage:{getItem:()=>JSON.stringify({state:{session:{token:'test'}}})},XMLHttpRequest:XHR,Promise,Date:Clock,setInterval:fn=>timers.push(fn)});
// Wide workstation (PERFORMANCE-UI-SPEC.md 5.2, 6): display only. Suivi's zones and instruments send
// nothing and click nothing; Suivi's buttons still relay to these job controls, by the same IDs.
{
 const dash=fs.readFileSync(__dirname+'/touch/job-dashboard.js','utf8'),controls=fs.readFileSync(__dirname+'/touch/job-controls.js','utf8');
 const start=dash.indexOf('// ---- Wide workstation'),end=dash.indexOf('// Preview of the loaded program');
 assert(start>0&&end>start,'wide section of job-dashboard.js found');
 const wide=dash.slice(start,end);
 for(const word of ['cncJobControls','.click(','XMLHttpRequest','fetch(','api/','sendBeacon','.override('])assert(!wide.includes(word),'wide Suivi code is display only: '+word);
 assert(/\['load','start','pause','resume','stop'\]\.forEach\(function\(action\)\{\s*\$\('home-job-'\+action\)\.addEventListener\('click'/.test(dash),'Suivi buttons relay to the job controls');
 for(const action of ['load','start','pause','resume','stop'])assert(new RegExp('job-'+action+'\\b').test(controls),'job-controls.js owns job-'+action);
}
(async()=>{
 pending.shift()();await new Promise(setImmediate);
 assert.match(el('job-selected').textContent,/Feuille.nc/); // Selection arrived before this script was loaded.
 assert.match(el('job-reason').textContent,/ALARM/);assert.match(el('file').textContent,/Feuille.nc/);assert.match(el('file').textContent,/Aucun fichier chargé dans CNCjs/);assert.equal(el('job-start').disabled,true);
 response.controllers[0]={...response.controllers[0],activeState:'Idle',name:'leaf.nc',originalName:'Feuille.nc',canLoad:true,canStart:true};
 now+=10000;timers[0]();pending.shift()();await new Promise(setImmediate);
 assert.match(el('file').textContent,/Chargé dans CNCjs : Feuille.nc/);assert.equal(el('job-start').disabled,false);
 // Lot Fichiers: Fichiers has no Démarrer, its reason line sends to Suivi; Suivi (#file) keeps « Touchez Démarrer ».
 assert.equal(el('job-reason').textContent,'Fichier chargé : ouvrez le Suivi pour démarrer.');assert.match(el('file').textContent,/Touchez Démarrer pour confirmer/);
 // A stale report (fresh false) no longer says « Chargé dans CNCjs : … » under « état de charge indisponible ».
 response.controllers[0]={...response.controllers[0],fresh:false,canLoad:false,canStart:false};
 now+=10000;timers[0]();pending.shift()();await new Promise(setImmediate);
 assert.equal(el('job-loaded').textContent,'Fichier chargé : état indisponible.');assert.equal(el('job-load').disabled,true);assert.equal(el('job-start').disabled,true);
 assert.match(el('job-reason').textContent,/En attente d’un état récent/);
 response.controllers[0]={...response.controllers[0],fresh:true,canLoad:true,canStart:true};
 now+=10000;timers[0]();pending.shift()();await new Promise(setImmediate);
 assert.match(el('job-loaded').textContent,/Chargé dans CNCjs : Feuille.nc/);
 response.controllers=[];now+=10000;timers[0]();pending.shift()();await new Promise(setImmediate);
 assert.match(el('file').textContent,/état indisponible/);assert.equal(el('job-start').disabled,true);
 console.log('PASS: alarme, sélection distincte du chargement, accueil synchronisé et déconnexion.');
})().catch(e=>{console.error(e);process.exitCode=1});

