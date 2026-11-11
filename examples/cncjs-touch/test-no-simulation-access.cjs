'use strict';
// Final interface (2026-11-11): the real page (index.html) offers no way into the
// simulation page and shows no wording of that mode. simulation.html stays in the
// repository as a test bench for the harness; the six files below are not deployed
// on the tablet. Offline, no browser: sources, the header statement and the guide.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert').strict;
const acorn=require('acorn');
const dir=path.join(__dirname,'touch'),read=name=>fs.readFileSync(path.join(dir,name),'utf8');
const SIMULATION_ONLY=['job-simulation.js','simulation-history.js','simulation-machine.js','simulation-motion.js','simulation-report.js'];
const FORBIDDEN=/simul|fictif|fictiv|fictic|virtuel|virtual/i;
function scripts(html){return [...html.matchAll(/<script[^>]*\ssrc="([^"?]+)/g)].map(m=>m[1]);}

// a. index.html names neither the simulation page nor its own scripts.
const index=read('index.html');
assert(!/simulation\.html/.test(index),'index.html links simulation.html');
SIMULATION_ONLY.forEach(f=>assert(!index.includes(f),'index.html loads '+f));

// b. No string of a script kept on the tablet builds a path to the excluded files
// (comments are ignored): removing them can neither break a link nor cause a 404.
const excluded=['simulation.html'].concat(SIMULATION_ONLY);
for(const file of fs.readdirSync(dir).filter(n=>n.endsWith('.js')&&SIMULATION_ONLY.indexOf(n)<0)){
  const src=read(file),hits=[];
  let ast;try{ast=acorn.parse(src,{ecmaVersion:2020,sourceType:'script'});}catch(_){ast=acorn.parse(src,{ecmaVersion:2020,sourceType:'module'});}
  (function visit(n){if(!n||typeof n!=='object')return;
    const value=n.type==='Literal'&&typeof n.value==='string'?n.value:n.type==='TemplateElement'?n.value.cooked:null;
    if(value!==null)excluded.forEach(f=>{if(value.includes(f))hits.push(f);});
    Object.keys(n).forEach(k=>{const v=n[k];if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object'&&k!=='parent')visit(v);});
  })(ast);
  // touch-shell.js: only the way back to index.html exists, inside the simulation branch.
  assert.deepEqual(hits,[],file+' names an excluded file');
}

// c. The exclusion list is exact: what simulation.html loads and index.html does not.
const simulationScripts=scripts(read('simulation.html')),indexScripts=scripts(index);
assert.deepEqual(simulationScripts.filter(s=>indexScripts.indexOf(s)<0).sort(),SIMULATION_ONLY.slice().sort());
SIMULATION_ONLY.concat('simulation.html').forEach(f=>assert(fs.existsSync(path.join(dir,f)),f+' kept in the repository for the harness'));
// The versioned list the tablet deployment applies holds exactly these six files.
const listed=fs.readFileSync(path.join(__dirname,'tablet-exclude.txt'),'utf8').split(/\r?\n/).map(l=>l.trim()).filter(l=>l&&l[0]!=='#');
assert.deepEqual(listed,excluded,'tablet-exclude.txt lists the six files, simulation.html first');

// The translation catalogue, in a given language, as the page builds it.
function locale(language){
  const context={window:{},document:{documentElement:{},title:'',body:null},localStorage:{getItem:()=>language,setItem(){}}};
  ['i18n-messages.js','i18n-messages-profiles.js','i18n-messages-machine.js','i18n-messages-origin.js','i18n-messages-viz.js','i18n.js'].forEach(n=>vm.runInNewContext(read(n),context));
  assert.equal(context.window.cncI18n.language,language);
  return context.window.cncI18n;
}

// d. Header: the real page has no link at all; the simulation page keeps its way back.
const shell=read('touch-shell.js'),start=shell.indexOf('banner.innerHTML=uiLocale.html(');
assert(start>0,'header statement found');
const statement=shell.slice(start,shell.indexOf(';\n',start)+1);
for(const language of ['fr','en','es']){
  const uiLocale=locale(language);
  const real={banner:{},uiLocale,simulation:false};vm.runInNewContext(statement,real);
  assert(!/<a[\s>]|href=/.test(real.banner.innerHTML),language+': link in the real header');
  assert(!FORBIDDEN.test(real.banner.innerHTML.replace(/class="[^"]*"/g,'')),language+': simulation wording in the real header: '+real.banner.innerHTML);
  assert(/ks-simulation/.test(real.banner.innerHTML),language+': the badge (clock anchor) stays');
  const sim={banner:{},uiLocale,simulation:true};vm.runInNewContext(statement,sim);
  assert(/href="index\.html"/.test(sim.banner.innerHTML),language+': way back to the real page');
}

// e. The library link is neither created nor moved into « Détails de l’aperçu ».
assert(!/createElement\('a'\)/.test(read('job-controls.js')),'job-controls.js creates a link');
assert(!shell.includes('.library-execution>a'),'touch-shell.js still moves the library link');

// f. Catalogue rows of the removed entry points are gone.
const catalogue=read('i18n-messages.js');
assert(!catalogue.includes("'Simulation ↗'"),'catalogue row Simulation ↗');
assert(!catalogue.includes("'Ouvrir le mode SIMULATION (sans machine)'"),'catalogue row of the library link');

// g. Usage guide, real page, in the three languages: four pages, every column a
// title and at least one paragraph, no simulation wording. The simulation page keeps its own.
function guide(simulation,language){
  const uiLocale=locale(language),byId={},texts=[];
  function element(tag){
    const el={tagName:tag.toUpperCase(),children:[],attributes:{},listeners:{},textValue:'',
      get textContent(){return this.textValue+this.children.map(c=>c.textContent).join('');},
      set textContent(v){this.textValue=String(v);this.children=[];},
      set innerHTML(v){this.html=v;},appendChild(c){this.children.push(c);return c;},
      setAttribute(k,v){this.attributes[k]=String(v);},getAttribute(k){return k in this.attributes?this.attributes[k]:null;},
      addEventListener(n,f){(this.listeners[n]=this.listeners[n]||[]).push(f);},click(){(this.listeners.click||[]).forEach(f=>f.call(this));},
      querySelectorAll(){return buttons;}};
    return el;
  }
  const buttons=[0,1,2,3].map(n=>{const b=element('button');b.attributes['data-guide-page']=String(n);return b;});
  ['guide-left','guide-right','guide-back'].forEach(id=>{byId[id]=element('div');});
  const main=element('main'),intro=element('div');
  const document={body:{getAttribute:k=>k==='data-simulation'?String(simulation):null},createElement:element,getElementById:id=>byId[id]||null,
    querySelector:s=>s==='main'?main:s==='#screen-settings .ks-panel-intro'?intro:null};
  vm.runInNewContext(read('interface-guide.js'),{window:{cncI18n:uiLocale,dispatchEvent(){}},document,CustomEvent:function(){}});
  texts.push(main.children[0].html);
  const pages=buttons.map(b=>{b.click();return ['guide-left','guide-right'].map(id=>byId[id].children.filter(c=>c.tagName!=='BUTTON').map(c=>({tag:c.tagName,text:c.textContent})));});
  pages.forEach(p=>p.forEach(col=>col.forEach(c=>texts.push(c.text))));
  return {pages,texts};
}
for(const language of ['fr','en','es']){
  const g=guide(false,language);
  assert.equal(g.pages.length,4);
  g.pages.forEach((p,n)=>p.forEach((col,c)=>{assert.equal(col[0].tag,'H2',language+' page '+n+' column '+c+': title');assert(col.length>=2,language+' page '+n+' column '+c+': a paragraph');}));
  g.texts.forEach(t=>assert(!FORBIDDEN.test(t),language+': simulation wording in the real guide: '+t));
  const s=guide(true,language);
  assert(s.texts.some(t=>FORBIDDEN.test(t)),language+': the simulation page keeps its guide');
}

// h. Probing (display only): on the real page the bench wording is replaced, in the
// three languages; the import of a simulation backup is still refused, without
// sending the operator to the removed mode.
const probe=read('probe-ui.js');
['Progression du palpage','Journal de cette page, 100 événements maximum','Ces origines sont propres au banc de palpage. Les coordonnées de la CNC ne sont pas modifiées.',
 'Copiez le fichier sur l’autre appareil puis ouvrez ce panneau pour l’importer.','Banc réinitialisé. Aucun repère réel modifié.'].forEach(text=>{
  assert(probe.includes("uiLocale.t('"+text+"')"),'probe-ui.js real wording: '+text);
  for(const language of ['fr','en','es']){const t=locale(language).t(text);assert(language==='fr'||t!==text,language+': no translation for '+text);assert(!FORBIDDEN.test(t),language+': '+t);}
});
assert(probe.includes("'cnc-palpage-'+(simulation?'simulation':'preparation')+'-'"),'real probing export not named simulation');
// The profile count after an import is translated like the one shown on opening.
assert(!/[^(]'préparation réelle'/.test(probe)&&probe.split("uiLocale.t('préparation réelle')").length===3,'probe-ui.js: « préparation réelle » translated in both counts');
{
  const model=require('./touch/probe-model.js'),transfer=require('./touch/probe-transfer.js');
  const backup=JSON.stringify({kind:'cnc-touch-probe-profiles',version:1,mode:'simulation',units:'mm-mm/min',profiles:[model.demo()]});
  assert.throws(()=>transfer.decode(backup,'real'),e=>!FORBIDDEN.test(e.message)&&/incompatible/.test(e.message));
  const real=backup.replace('"simulation"','"real"');
  assert.throws(()=>transfer.decode(real,'simulation'),/appartient au mode/);
  assert.equal(transfer.decode(real,'real').length,1);
}
console.log('PASS no simulation access: index.html and kept scripts never name the 6 excluded files, real header without link (FR/EN/ES), library link gone, real guide and probing wording without the simulation mode, import refusal kept.');
