'use strict';
// Audit 31 cross-check (U3, job-preparation.js): what the program key does when the
// server has no revision (program loaded from CNCjs itself), when the machine vanishes,
// when the operator block appears later, and what the checks step says when $22 is unknown.
// Pure model plus the sheet flow on a synthetic DOM, no network.
const assert=require('assert').strict,fs=require('fs'),vm=require('vm');
const P=require('./touch/job-preparation');
const notes=[];
const idle={port:'A',name:'a.nc',originalName:'A.nc',revision:3,fresh:true,activeState:'Idle',workflow:'idle',canStart:true,canLoad:true,
  coordinates:{mpos:{x:-100,y:-50,z:-10},wpos:{x:0,y:0,z:0}},operator:{wcs:'G54',reportUnits:'mm'},settings:{$22:'1'}};
const sel={file:'a.nc',name:'A.nc'};
// 1. Program loaded by CNCjs itself: the snapshot carries name but no revision (r.job is null).
const cncjsLoaded={...idle,revision:undefined,canStart:false,startReason:'Le fichier chargé a changé. Rechargez-le et confirmez à nouveau.'};
assert.equal(P.programKey(cncjsLoaded),'a.nc::');
assert.equal(P.programKey({...cncjsLoaded}),P.programKey(cncjsLoaded),'a second CNCjs load of a file with the same name gives the same key');
notes.push('programKey without a server revision is "name::": a program reloaded from CNCjs itself (same name, other content) keeps the operator ticks; the Ready step still follows the server (canStart false, its reason shown)');
let r=P.assess({machine:cncjsLoaded,selection:sel,ticks:{tool:true,origin:true}});
assert.equal(r.steps[1].state,'ok');assert.equal(r.steps[4].state,'todo');assert.match(r.steps[4].detail,/Rechargez-le/);assert(!r.ready);
// 2. Floating noise on the positions does not change the offset key (rounded to 0.01 mm).
assert.equal(P.offsetKey({...idle,coordinates:{mpos:{x:-100.001,y:-50.004,z:-9.996},wpos:{x:0,y:0,z:0}}}),P.offsetKey(idle));
// 3. $22 unknown (settings not read yet, or an empty object): the checks step warns as if homing were disabled.
r=P.assess({machine:{...idle,settings:undefined},selection:sel,ticks:{}});
assert.equal(r.steps[3].state,'warn');assert.match(r.steps[3].detail,/\$22/);
notes.push('with settings absent or without $22 the checks step says "Prise d’origine désactivée ($22)" although the setting is simply unknown (same text as a true $22=0)');
// 4. Sheet flow: ticks survive a stale report, are forgotten when the machine vanishes, and the
//    origin tick is forgotten when the operator block (work frame) appears after the tick.
const {document,element,node}=require('./dom-fixture.cjs').createDOM(['files']);
document.body.getAttribute=()=>null;document.body.children=[];document.body.appendChild=function(c){this.children.push(c);c.parentNode=this;};
const listeners={},opened=[];const actions=element('div','actions'),tools=element('div','tools');tools.className='ks-file-tools';document.querySelector=s=>s==='.ks-file-tools'?tools:node('panel');
const sheetContent=element('div','sheet-content');
const window={cncI18n:{t:s=>s,message:s=>s},cncLibrarySelection:sel,addEventListener:(n,f)=>(listeners[n]=listeners[n]||[]).push(f),
  cncShell:{sheet:()=>({content:sheetContent,open:()=>opened.push(1)}),preparationActions:actions},CNCTravelCheck:{check:()=>({state:'ok',message:'Dans la course.'})}};
vm.runInNewContext(fs.readFileSync(__dirname+'/touch/job-preparation.js','utf8'),{window,document});
const send=(machine)=>listeners['cnc-job-status'].forEach(f=>f({detail:{machine,simulation:false}}));
const box=id=>sheetContent.querySelectorAll('*').find(e=>e.id==='ks-prep-'+id);
tools.children[0].click();
send(idle);box('tool').checked=true;box('tool').handlers.change();box('origin').checked=true;box('origin').handlers.change();
assert.equal(JSON.stringify(window.cncJobPreparation.ticks()),JSON.stringify({tool:true,origin:true}));
// A stale report (fresh false) keeps the ticks (same name and revision).
send({...idle,fresh:false});assert.equal(JSON.stringify(window.cncJobPreparation.ticks()),JSON.stringify({tool:true,origin:true}),'stale report keeps the ticks');
send(idle);
// The machine vanishes for a moment (transport lost): both ticks are forgotten.
send(null);const afterNull=window.cncJobPreparation.ticks();send(idle);
assert.equal(JSON.stringify(afterNull),JSON.stringify({tool:false,origin:false}));
notes.push('a snapshot without machine (transport lost, 401, controller closed) forgets both ticks even if the same program comes back: conservative, but not a "program or offset change"');
// Operator block arriving after the tick: the offset key gains ":G54" and the origin tick is lost.
box('tool').checked=true;box('tool').handlers.change();box('origin').checked=true;box('origin').handlers.change();
send({...idle,operator:undefined});const noOp=window.cncJobPreparation.ticks();
send(idle);const withOp=window.cncJobPreparation.ticks();
if(!noOp.origin||!withOp.origin)notes.push('the operator block (work frame) toggling between two reports forgets the origin tick: '+JSON.stringify(noOp)+' then '+JSON.stringify(withOp));
// The load relay never fires when job-load is disabled; nothing else is called from the sheet.
const source=fs.readFileSync(__dirname+'/touch/job-preparation.js','utf8');
assert(!/cncJobControls|XMLHttpRequest|fetch\(|\.request\(/.test(source));
assert(!/'start'|"start"/.test(source.replace(/startReason|canStart|Démarr|starts/g,'')),'no start action in the module');
console.log('NOTES:\n- '+notes.join('\n- '));
console.log('PASS preparation keys: program key without revision, offset rounding, unknown $22, machine lost, operator block toggling, no command from the sheet.');
