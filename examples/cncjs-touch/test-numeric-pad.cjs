'use strict';
// Shared numeric entry (numeric-pad.js): empty, zero and unreadable kept apart, comma or
// point, negative and whole-number rules, limits with the unit, key presses, and the modal
// pad bound to a field: Valider writes the accepted number only, Annuler leaves the field
// alone, an unreadable draft never becomes zero. Synthetic DOM, no network.
const assert=require('assert').strict,fs=require('fs'),vm=require('vm');
const N=require('./touch/numeric-pad');
// Parser.
assert.deepEqual(N.parse('0',{min:0,max:50}),{state:'ok',value:0,message:''},'zero is a value, not an empty field');
assert.equal(N.parse('',{}).state,'empty');assert.equal(N.parse('   ',{}).state,'empty');assert.equal(N.parse(null,{}).value,null);
assert.equal(N.parse('0,5',{}).value,0.5);assert.equal(N.parse('0.5',{}).value,0.5);assert.equal(N.parse(',5',{}).value,0.5);assert.equal(N.parse('-1,25',{}).value,-1.25);
for(const bad of ['abc','1.2.3','1,2,3','1e3','--1','12 mm','0x10','1,5.2'])assert.equal(N.parse(bad,{}).state,'invalid','unreadable: '+bad);
assert.equal(N.parse('-3',{negative:false}).state,'negative');assert.equal(N.parse('-3',{}).state,'ok');
assert.equal(N.parse('2.5',{integer:true}).state,'integer');assert.equal(N.parse('3',{integer:true,min:2}).value,3);
assert.equal(N.parse('60',{min:0.01,max:50,unit:'mm'}).state,'range');assert.match(N.parse('60',{min:0.01,max:50,unit:'mm'}).message,/^Hors limites : de 0,01 à 50 mm\.$/);
assert.equal(N.parse('0',{min:0.01,max:50}).state,'range','zero below the minimum is out of range, not empty');
assert.equal(N.limits({min:2,integer:true,unit:'ligne'}),'au moins 2 ligne');assert.equal(N.limits({max:100}),'au plus 100');assert.equal(N.limits({}),'');
// Key presses (the coordinate editor's rules).
assert.equal(N.press('5','1',{}),'15');assert.equal(N.press('.','1',{}),'1.');assert.equal(N.press('.','1.',{}),'1.','one separator');assert.equal(N.press('.','1,5',{}),'1,5');
assert.equal(N.press('±','1',{}),'-1');assert.equal(N.press('±','-1',{}),'1');assert.equal(N.press('±','1',{negative:false}),'1','sign key inert when negatives are refused');
assert.equal(N.press('⌫','12',{}),'1');assert.equal(N.press('Effacer','12',{}),'');assert.equal(N.press('.','2',{integer:true}),'2','no separator for whole numbers');
assert.equal(N.press('9','123456789012345678',{}),'123456789012345678','18 characters at most');
assert.equal(N.KEYS.length,14);
// Modal pad bound to a field (DOM).
const {document,node,element}=require('./dom-fixture.cjs').createDOM(['home']);
const listeners={},events=[];
const window={cncI18n:{t:s=>s},addEventListener:(n,f)=>listeners[n]=f};
document.body.children=[];document.body.appendChild=function(c){this.children.push(c);c.parentNode=this;};
// The fixture's createElement lacks querySelectorAll on lists of buttons and isConnected: add what the pad needs.
const realCreate=document.createElement;
document.createElement=tag=>{const e=realCreate(tag);e.isConnected=true;e.dispatchEvent=ev=>{(e._listeners&&e._listeners[ev.type]||[]).forEach(f=>f.call(e,ev));};return e;};
vm.runInNewContext(fs.readFileSync(__dirname+'/touch/numeric-pad.js','utf8'),{window,document,Event:function(type,o){this.type=type;this.bubbles=!!(o&&o.bubbles);}});
const Pad=window.CNCNumeric;
const field=document.createElement('input');field.value='10';field.isConnected=true;let inputs=0;field.addEventListener('input',()=>inputs++);
Pad.bind(field,{label:'Épaisseur de la plaque',unit:'mm',min:0.01,max:50,negative:false});
assert.equal(field.getAttribute('inputmode'),'none','the pad replaces the virtual keyboard');
field.handlers.click();
const modal=document.body.children.find(c=>c.id==='t-numpad');assert(modal&&!modal.hidden,'pad opened by a tap');
const all=modal.querySelectorAll('*'),byId=id=>all.find(e=>e.id===id),key=k=>all.find(e=>e.getAttribute&&e.getAttribute('data-numpad-key')===k);
assert.equal(byId('t-numpad-title').textContent,'Épaisseur de la plaque');assert.match(all.find(e=>e.className==='t-numpad-bounds').textContent,/de 0,01 à 50 mm/);
assert.equal(byId('t-numpad-display').textContent,'10','the field value is the draft');
key('Effacer').click();key('0').click();key(',')||key('.').click();key('5').click();
assert.equal(byId('t-numpad-display').textContent,'0.5');assert.equal(byId('t-numpad-error').textContent,'');
// A draft out of range: Valider explains and keeps the draft; the field is untouched.
key('Effacer').click();key('6').click();key('0').click();all.find(e=>e.textContent==='Valider').click();
assert(!modal.hidden,'stays open on an error');assert.match(byId('t-numpad-error').textContent,/Hors limites/);assert.equal(field.value,'10');assert.equal(inputs,0);
// An unreadable draft never becomes zero: the sign key is inert here, Effacer then Valider says empty.
key('±').click();assert.equal(byId('t-numpad-display').textContent,'60');
key('Effacer').click();all.find(e=>e.textContent==='Valider').click();assert.match(byId('t-numpad-error').textContent,/Aucune valeur/);assert.equal(field.value,'10');
// Accepted: the field gets the number with a point and an input event; the pad closes and focus returns.
key('2').click();key('.').click();key('5').click();all.find(e=>e.textContent==='Valider').click();
assert(modal.hidden);assert.equal(field.value,'2.5');assert.equal(inputs,1);assert.equal(document.activeElement,field,'focus returns to the field');
// Annuler leaves the field alone.
field.handlers.click();key('Effacer').click();key('9').click();all.find(e=>e.textContent==='Annuler').click();assert(modal.hidden);assert.equal(field.value,'2.5');
// Whole numbers: the separator key does nothing, a decimal typed on the keyboard is refused at Valider.
const line=document.createElement('input');line.value='';line.isConnected=true;Pad.bind(line,{label:'Ligne',unit:'ligne',min:2,integer:true,negative:false});
line.handlers.click();assert(!modal.hidden);key('1').click();key('.').click();key('5').click();assert.equal(byId('t-numpad-display').textContent,'15');
all.find(e=>e.textContent==='Valider').click();assert.equal(line.value,'15');
line.value='1.5';line.handlers.click();all.find(e=>e.textContent==='Valider').click();assert(!modal.hidden);assert.match(byId('t-numpad-error').textContent,/entier/);assert.equal(line.value,'1.5');
// Escape closes without writing; a screen change closes too.
listeners.keydown||document.handlers.keydown({key:'Escape',preventDefault(){}});assert(modal.hidden);assert.equal(line.value,'1.5');
line.handlers.click();assert(!modal.hidden);listeners['cnc-screen-change']();assert(modal.hidden);
// A disabled field never opens the pad.
line.disabled=true;line.handlers.click();assert(modal.hidden);
// Every phrase is in the FR/EN/ES catalog.
const source=fs.readFileSync(__dirname+'/touch/numeric-pad.js','utf8');
const phrases=[...source.matchAll(/\bt\('((?:[^'\\]|\\.)*)'\)/g)].map(m=>m[1]);
const catalog={window:{}};vm.runInNewContext(fs.readFileSync(__dirname+'/touch/i18n-messages.js','utf8'),catalog);
const keys=new Set(catalog.window.CNCTouchMessages.map(r=>r[0].trim().replace(/\s+/g,' ')));
for(const p of new Set(phrases))if(/[a-zà-ÿ]{2}/i.test(p))assert(keys.has(p.trim().replace(/\s+/g,' ')),'missing translation: '+p);
for(const name of ['index.html','simulation.html']){const html=fs.readFileSync(__dirname+'/touch/'+name,'utf8');assert(html.indexOf('numeric-pad.js')>html.indexOf('i18n.js')&&html.indexOf('numeric-pad.js')<html.indexOf('job-resume.js'),name+': numeric-pad.js before job-resume.js');if(html.indexOf('coordinate-editor.js')>=0)assert(html.indexOf('numeric-pad.js')<html.indexOf('coordinate-editor.js'));}
// The real page no longer loads the coordinate editor (local preparation without movement); simulation.html keeps it.
assert(fs.readFileSync(__dirname+'/touch/index.html','utf8').indexOf('coordinate-editor.js')<0&&fs.readFileSync(__dirname+'/touch/simulation.html','utf8').indexOf('coordinate-editor.js')>0);
// The coordinate editor builds its keys from the shared pad (no second key pad).
const editor=fs.readFileSync(__dirname+'/touch/coordinate-editor.js','utf8');
assert(editor.includes("CNCNumeric.keys(pad"),'coordinate editor uses the shared keys');assert(!/\['7','8','9'/.test(editor),'no private key list left');
console.log('PASS numeric pad: empty/zero/unreadable, comma and point, negative and whole-number rules, limits with unit, key presses, modal pad (error keeps the draft, Valider writes, Annuler and Escape do not), translations, single key pad.');
