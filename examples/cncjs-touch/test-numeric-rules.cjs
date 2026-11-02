'use strict';
// Audit 31 cross-check (U6): parser edge cases (sign alone, trailing separator, -0,
// 18 digits), the modal pad writing "0.5" with input + change, cancel restoring the field,
// open() without rules, and job-resume.js with and without CNCNumeric (resume line and
// plate fields: empty / zero / unreadable / out of range never become a number).
const assert=require('assert').strict,fs=require('fs'),vm=require('vm');
const N=require('./touch/numeric-pad');
const notes=[];
// --- Parser edges.
assert.equal(N.parse('0',{}).value,0);assert.equal(N.parse('0,5',{}).value,0.5);assert.equal(N.parse('0.5',{}).value,0.5);
assert.equal(N.parse('-1',{}).state,'ok');assert.equal(N.parse('-1',{negative:false}).state,'negative');
for(const s of ['.',',','-','+','-.','1-','1,2,','1..2'])assert.equal(N.parse(s,{}).state,'invalid','invalid: '+s);
assert.equal(N.parse('1,',{}).state,'ok');notes.push('"1," and "1." are read as 1 (trailing separator tolerated)');
assert.equal(N.parse('+5',{}).value,5);
assert.equal(N.parse('-0',{negative:false}).state,'ok');assert.equal(String(N.parse('-0',{negative:false}).value),'0');
assert.equal(N.parse(' 0 ',{min:0}).value,0);assert.equal(N.parse('00',{}).value,0);assert.equal(N.parse('007',{}).value,7);
assert.equal(N.parse('0',{min:2,integer:true}).state,'range','zero for the line: range, not empty');
assert.equal(N.parse('0',{min:0.01,max:50}).state,'range','zero for the thickness: range, not empty');
assert.equal(N.parse('',{min:2}).state,'empty');assert.equal(N.parse('abc',{min:2}).state,'invalid');
// Sign key alone leaves an unreadable draft that never becomes a number.
assert.equal(N.press('±','',{}),'-');assert.equal(N.parse('-',{}).state,'invalid');assert.equal(N.press('5','-',{}),'-5');
// 18 digits: accepted by the rules without a max, but the written value loses precision.
const big='123456789012345678';assert.equal(N.parse(big,{integer:true,min:2}).state,'ok');
if(String(N.parse(big,{}).value)!==big)notes.push('18-digit draft '+big+' is written as '+String(N.parse(big,{}).value)+' (double precision; only the line field has no max)');
// --- Modal pad on a DOM.
const {document,element}=require('./dom-fixture.cjs').createDOM(['home']);
const listeners={};const window={cncI18n:{t:s=>s},addEventListener:(n,f)=>listeners[n]=f};
document.body.children=[];document.body.appendChild=function(c){this.children.push(c);c.parentNode=this;};
const realCreate=document.createElement;document.createElement=tag=>{const e=realCreate(tag);e.isConnected=true;e.dispatchEvent=ev=>{(e._listeners&&e._listeners[ev.type]||[]).forEach(f=>f.call(e,ev));};return e;};
vm.runInNewContext(fs.readFileSync(__dirname+'/touch/numeric-pad.js','utf8'),{window,document,Event:function(type,o){this.type=type;this.bubbles=!!(o&&o.bubbles);}});
const Pad=window.CNCNumeric;
const field=document.createElement('input');field.value='10';const events=[];field.addEventListener('input',()=>events.push('input'));field.addEventListener('change',()=>events.push('change'));
Pad.bind(field,{label:'Épaisseur',unit:'mm',min:0.01,max:50,negative:false});
field.handlers.click();
const modal=document.body.children.find(c=>c.id==='t-numpad'),all=()=>modal.querySelectorAll('*'),byId=id=>all().find(e=>e.id===id),key=k=>all().find(e=>e.getAttribute&&e.getAttribute('data-numpad-key')===k),btn=t=>all().find(e=>e.textContent===t);
// The draft starts from the field's value: a digit is appended to "10".
key('5').click();assert.equal(byId('t-numpad-display').textContent,'105');notes.push('the pad opens on the field value ("10"): a first digit appends ("105"); Effacer is needed to start over');
// Keyboard-typed comma in the field: the pad shows it as typed and writes a point.
btn('Annuler').click();assert.equal(field.value,'10');field.value='0,5';field.handlers.click();assert.equal(byId('t-numpad-display').textContent,'0,5');
btn('Valider').click();assert.equal(field.value,'0.5');assert.deepEqual(events,['input','change'],'input then change on Valider');
// Zero accepted where allowed, refused where below the minimum (message, field untouched).
field.handlers.click();key('Effacer').click();key('0').click();btn('Valider').click();assert(!modal.hidden);assert.match(byId('t-numpad-error').textContent,/Hors limites : de 0,01 à 50 mm/);assert.equal(field.value,'0.5');
// Negative refused: the sign key is inert and a typed "-1" is refused with its own message.
key('±').click();assert.equal(byId('t-numpad-display').textContent,'0');btn('Annuler').click();
field.value='-1';field.handlers.click();btn('Valider').click();assert.match(byId('t-numpad-error').textContent,/négative/);assert.equal(field.value,'-1','Valider refused: the field keeps what the keyboard typed');
notes.push('a keyboard-typed "-1" stays in the field after a refused Valider (the pad never rewrites a refused draft; the consumer re-parses on use)');
btn('Annuler').click();
// A field allowing negatives.
const signed=document.createElement('input');signed.value='';Pad.bind(signed,{label:'Décalage',unit:'mm',min:-100,max:100});
signed.handlers.click();key('±').click();key('1').click();btn('Valider').click();assert.equal(signed.value,'-1');
// Unit shown next to the value follows the rules of the bound field.
signed.handlers.click();assert.equal(all().find(e=>e.className==='t-numpad-unit').textContent,'mm');assert.match(all().find(e=>e.className==='t-numpad-bounds').textContent,/de -100 à 100 mm/);btn('Annuler').click();
// open() without rules.
let openError=null;try{Pad.open(signed);}catch(e){openError=e;}
if(openError){notes.push('CNCNumeric.open(input) without rules throws ('+openError.message+'): bind() always passes rules, so unreachable from the pages');if(Pad.opened())Pad.close();}else Pad.close();
// --- job-resume.js: with the pad module, and without it (fallback parser).
function resumeFixture(withPad){
 const dom=require('./dom-fixture.cjs').createDOM(['home']);const d=dom.document;
 const ready=dom.node('home-job-ready'),parent=dom.element('div','home-actions');parent.appendChild(ready);d.body.getAttribute=()=>null;
 const ls={},calls=[];const win={cncLibrarySelection:{file:'a.nc',name:'a.nc'},addEventListener:(n,f)=>(ls[n]=ls[n]||[]).push(f),cncI18n:{t:s=>s},
  cncJobControls:{resumePlan:(f,l)=>{calls.push(['plan',f,l]);return Promise.resolve({from:l,total:9,line:'G1',safeZ:5,position:{X:0,Y:0,Z:-1}});},loadFrom:()=>Promise.resolve({}),spindleStop:()=>Promise.resolve({}),prepareCommand:(op,extra)=>{calls.push(['prepare',op,extra]);}}};
 const ctx={window:win,document:d,localStorage:{getItem:()=>null,setItem(){}},Event:function(type){this.type=type;}};
 if(withPad)vm.runInNewContext(fs.readFileSync(__dirname+'/touch/numeric-pad.js','utf8'),ctx);
 vm.runInNewContext(fs.readFileSync(__dirname+'/touch/job-resume.js','utf8'),ctx);
 const byId=id=>parent.querySelectorAll('*').find(c=>c.id===id);
 ls['cnc-job-status'].forEach(f=>f({detail:{machine:{fresh:true,workflow:'idle',canLoad:true,canZeroZ:true,stoppedAtLine:200,stoppedFile:'a.nc',programPause:null},simulation:false}}));
 return {byId,calls,win};
}
for(const withPad of [true,false]){
 const r=resumeFixture(withPad),input=r.byId('home-resume-input'),plan=r.byId('home-resume-plan');
 r.byId('home-resume-line').click();assert.equal(input.value,'185');
 assert.equal(input.getAttribute('type'),'text');assert.equal(input.getAttribute('inputmode'),withPad?'none':'numeric');
 const tryLine=v=>{input.value=v;input.handlers.input();r.byId('home-resume-check').click();return plan.textContent;};
 const n0=r.calls.length;
 assert.match(tryLine('0'),/^Indiquez une ligne \(2 ou plus\)\./);assert.match(tryLine(''),/^Indiquez une ligne/);assert.match(tryLine('abc'),/^Indiquez une ligne/);assert.match(tryLine('2.5'),/^Indiquez une ligne/);assert.match(tryLine('-3'),/^Indiquez une ligne/);
 assert.equal(r.calls.length,n0,'no plan asked for an unusable line');
 if(withPad){assert.match(tryLine('0'),/Hors limites : au moins 2 ligne\./);assert.match(tryLine('abc'),/illisible/);assert.match(tryLine(''),/Aucune valeur/);}
 else assert.equal(tryLine('0'),'Indiquez une ligne (2 ou plus).','fallback: generic message only');
 tryLine('12');assert.equal(JSON.stringify(r.calls.at(-1)),JSON.stringify(['plan','a.nc',12]));
 // Plate fields: the probe reads them through the same parser.
 const thick=r.byId('home-plate-thickness'),search=r.byId('home-plate-search'),probe=r.byId('home-plate-probe'),status=r.byId('home-plate-status');
 assert.equal(search.value,'10');probe.disabled=false;
 const tryPlate=(t,s)=>{thick.value=t;search.value=s;const n=r.calls.length;probe.click();return {text:status.textContent,sent:r.calls.length>n?r.calls.at(-1):null};};
 let p=tryPlate('','10');assert.match(p.text,/^Indiquez l’épaisseur/);assert.equal(p.sent,null);
 p=tryPlate('0','10');assert.match(p.text,/^Indiquez l’épaisseur/);assert.equal(p.sent,null);
 p=tryPlate('abc','10');assert.match(p.text,/^Indiquez l’épaisseur/);assert.equal(p.sent,null);
 p=tryPlate('10,5','0');assert.match(p.text,/^Descente maximale invalide/);assert.equal(p.sent,null);
 p=tryPlate('10,5','abc');assert.match(p.text,/^Descente maximale invalide/);assert.equal(p.sent,null);
 p=tryPlate('0,5','10');assert.equal(JSON.stringify(p.sent),JSON.stringify(['prepare','zeroZ',{thickness:0.5,search:10}]));
 p=tryPlate('.5','1,0');assert.equal(JSON.stringify(p.sent),JSON.stringify(['prepare','zeroZ',{thickness:0.5,search:1}]));
 const unitText=thick.parentNode.children[1].textContent;
 if(!withPad&&/·\s*$/.test(unitText))notes.push('without CNCNumeric the plate unit text ends with a dangling separator: "'+unitText+'"');
 console.log('ok     job-resume '+(withPad?'with':'without')+' CNCNumeric: line and plate fields never turn empty/zero/unreadable into a number');
}
console.log('NOTES:\n- '+notes.join('\n- '));
console.log('PASS numeric rules: parser edges, modal pad writes input+change, cancel keeps the field, job-resume with and without the pad never turns empty/zero/unreadable into a number.');
