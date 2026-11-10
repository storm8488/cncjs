'use strict';
// Menu (lot écrans 6): the words of the six tiles and of the resume bar for every machine state of the screens
// fixture (homing, probing, stale report, offline, alarm during a job…), the menu's style fixes (tiles of full
// height without the resume bar, the pill of the indicator, outlines at 3:1, a readable greyed-out Pause, the
// short rail at 1024 x 600, the strip's cells each with its own ellipsis), and the strip's machine buttons: the
// menu sends nothing, and Pause / Arrêter / Reprendre / Déverrouiller keep the hidden and disabled state they had.
// FR / EN / ES.
const fs=require('fs'),vm=require('vm'),assert=require('assert').strict;
const read=f=>fs.readFileSync(__dirname+'/touch/'+f,'utf8');
const strip=s=>s.replace(/\/\*[\s\S]*?\*\//g,'');
// Translator over the real catalogue (i18n.js keeps the spaces around a known phrase).
function locale(language){
  const sb={window:{}};vm.runInNewContext(read('i18n-messages.js'),sb);
  const col=language==='en'?1:language==='es'?2:0,map=new Map(sb.window.CNCTouchMessages.map(r=>[r[0].trim().replace(/\s+/g,' '),r[col]]));
  const t=s=>{const k=String(s).trim().replace(/\s+/g,' ');if(!col||!map.has(k))return s;const lead=/^\s*/.exec(s)[0],tail=/\s*$/.exec(s)[0];return lead+map.get(k)+tail;};
  return {t,html:s=>s,language,locale:language==='es'?'es-ES':language==='en'?'en-GB':'fr-FR',has:s=>map.has(String(s).trim().replace(/\s+/g,' '))};
}
function describeWith(uiLocale){
  const src=read('status-strip.js'),a=src.indexOf('function describe(m,connected){'),b=src.indexOf("var tone='',lastDetail=null;");
  assert(a>0&&b>a,'describe() found in status-strip.js');
  return vm.runInNewContext('(function(uiLocale){function finite(v){return typeof v==="number"&&isFinite(v);}'+src.slice(a,b)+'return describe;})',{isFinite,String})(uiLocale);
}
// --- 1. touch-shell.js's own live(), resumeBar() and updateTiles(), cut from the module, over stub elements.
const shell=read('touch-shell.js');
const liveLine=shell.slice(shell.indexOf('  function live(name,tone,text)'),shell.indexOf('\n',shell.indexOf('  function live(name,tone,text)')));
const segStart=shell.indexOf('  function resumeBar(){'),segEnd=shell.indexOf("  window.addEventListener('cnc-job-status'");
assert(liveLine.length>20&&segStart>0&&segEnd>segStart,'live(), resumeBar() and updateTiles() found');
const segment=shell.slice(segStart,segEnd);
// The menu sends nothing: its code path has no command, relay or job-control call, and touches no strip button.
assert.doesNotMatch(segment+liveLine,/relay\(|prepareCommand|cncJobControls|\.click\(|t-pause|t-stop|t-resume|t-unlock|\.disabled\s*=/,'the menu tiles and resume bar only write words');
// Every DOM write is counted (attributes and texts), to see that an unchanged update writes nothing.
const writes={n:0};
function textNode(){let v='';return {get textContent(){return v;},set textContent(x){writes.n++;v=x;}};}
function stub(){
  const attrs={},own=textNode();
  return {attrs,hidden:false,get textContent(){return own.textContent;},set textContent(x){own.textContent=x;},lastChild:textNode(),getAttribute:k=>Object.prototype.hasOwnProperty.call(attrs,k)?attrs[k]:null,setAttribute:(k,v)=>{writes.n++;attrs[k]=String(v);},addEventListener(){}};
}
function menu(language,opts){
  const o=opts||{},uiLocale=locale(language),t=uiLocale.t;
  const lives={},els={};['home','files','jog','machine','history','settings'].forEach(n=>lives[n]=stub());
  ['ks-resume','ks-resume-title','ks-resume-hint','ks-machine-alarm-title','ks-machine-alarm-action'].forEach(id=>els[id]=stub());
  const machineWord=stub(),machineAlarm=stub(),coordNote=null;
  const window={cncStatusStrip:{describe:describeWith(uiLocale)},cncCommissioning:{status:()=>({state:o.commissioning||'progress'})}};
  const src='(function(uiLocale,simulation,lives,menuLabels,names,machineWord,machineAlarm,coordNote,document,window,go){var lastScreen="",active="menu",lastMachine=null;'+
    'function setText(el,value){if(el&&el.textContent!==value)el.textContent=value;}\n'+liveLine+'\n'+segment+
    '\nreturn {updateTiles:updateTiles,resumeBar:resumeBar,set:function(ls,a,lm){lastScreen=ls;active=a;lastMachine=lm;}};})';
  const api=vm.runInNewContext(src,{RegExp,Math,String,Object})(uiLocale,!!o.simulation,lives,{jog:t('Préparer'),home:t('Suivi')},
    {files:t('Fichiers'),machine:t('Machine'),history:t('Journal'),settings:t('Réglages')},machineWord,machineAlarm,coordNote,{getElementById:id=>els[id]},window,()=>{});
  const tile=n=>({tone:lives[n].getAttribute('data-tone'),text:lives[n].lastChild.textContent,empty:lives[n].getAttribute('data-empty')});
  return {t,uiLocale,api,tile,els,machineWord,
    show(m,last){api.updateTiles(m,!!m);if(last!==undefined){api.set(last,'menu',m);api.resumeBar();}return this;}};
}
// The states of the screens fixture (browser-run.cjs SCREENS_STATES) as the page publishes them.
const base={port:'/dev/replay',name:'Parcours_de_test_1.gcode',fresh:true,workflow:'idle',activeState:'Idle',canStart:true,total:200,received:0};
const STATES={
  repos:base,
  homing:{...base,activeState:'Home',homing:true,canStart:false},
  palpage:{...base,activeState:'Run',probing:true,canStart:false},
  jog:{...base,activeState:'Jog',canStart:false},
  travail:{...base,workflow:'running',activeState:'Run',canStart:false,received:34},
  pause:{...base,workflow:'paused',activeState:'Hold:0',canStart:false,received:34},
  alarme:{...base,workflow:'running',activeState:'Alarm',alarmCode:1,canStart:false,received:34},
  perime:{...base,workflow:'running',activeState:'Run',fresh:false,canStart:false,received:34},
  'hors-ligne':null
};
for(const lang of ['fr','en','es']){
  const p=menu(lang),t=p.t;
  // New strings of the lot are in the catalogue (FR/EN/ES).
  ['Machine en mouvement','État du fichier indisponible',' · alarme',' · rapport ancien'].forEach(s=>assert(p.uiLocale.has(s),lang+': catalogue row for « '+s+' »'));
  // Repos: unchanged words.
  p.show(STATES.repos,'home');
  assert.deepEqual(p.tile('home'),{tone:'ok',text:t('Prêt à démarrer'),empty:'false'});
  assert.deepEqual(p.tile('jog'),{tone:'warn',text:t('Déplacements à blanc'),empty:'false'});
  assert.deepEqual(p.tile('machine'),{tone:'warn',text:t('Mise en service en cours'),empty:'false'});
  assert.equal(p.tile('files').text,t('Chargé : ')+'Parcours_de_test_1.gcode');
  assert.equal(p.els['ks-resume-hint'].textContent,'Parcours_de_test_1.gcode'+t(' · prêt à démarrer'));
  // A2: Journal and Réglages say nothing live; their indicator stays in place, empty (no repeat of the hint).
  for(const n of ['history','settings'])assert.deepEqual(p.tile(n),{tone:'',text:'',empty:'true'},lang+' '+n+' indicator empty');
  // M7 homing: the machine moves outside a job; Préparer no longer offers dry runs, Machine says it first.
  p.show(STATES.homing);
  assert.deepEqual(p.tile('home'),{tone:'info',text:t('Prise d’origine'),empty:'false'},lang+' homing: Suivi');
  assert.deepEqual(p.tile('jog'),{tone:'warn',text:t('Machine en mouvement'),empty:'false'},lang+' homing: Préparer');
  assert.deepEqual(p.tile('machine'),{tone:'info',text:t('Prise d’origine'),empty:'false'},lang+' homing: Machine before the commissioning');
  // Probing (Run outside a job) and a jog: the state word of the strip, the same « moving » on Préparer.
  for(const k of ['palpage','jog']){
    p.show(STATES[k]);const word=describeWith(p.uiLocale)(STATES[k],true).word;
    assert.deepEqual(p.tile('home'),{tone:'info',text:word,empty:'false'},lang+' '+k+': Suivi');
    assert.equal(p.tile('jog').text,t('Machine en mouvement'),lang+' '+k+': Préparer');
    assert.deepEqual(p.tile('machine'),{tone:'info',text:word,empty:'false'},lang+' '+k+': Machine');
  }
  // Travail: unchanged words, Machine now says « En cours » (tone run shown as info).
  p.show(STATES.travail,'home');
  assert.deepEqual(p.tile('home'),{tone:'info',text:t('En cours')+' · 17 %',empty:'false'});
  assert.deepEqual(p.tile('jog'),{tone:'warn',text:t('Bloqué : travail en cours'),empty:'false'});
  assert.deepEqual(p.tile('machine'),{tone:'info',text:t('En cours'),empty:'false'});
  assert.equal(p.els['ks-resume-hint'].textContent,'Parcours_de_test_1.gcode'+t(' · en cours'));
  // Pause: unchanged.
  p.show(STATES.pause,'home');
  assert.deepEqual(p.tile('home'),{tone:'warn',text:t('En pause'),empty:'false'});
  assert.equal(p.els['ks-resume-hint'].textContent,'Parcours_de_test_1.gcode'+t(' · en pause'));
  // M8 alarm during a job: the resume bar says « alarme », not « en cours ».
  p.show(STATES.alarme,'files');
  assert.deepEqual(p.tile('home'),{tone:'danger',text:t('Alarme'),empty:'false'});
  assert.deepEqual(p.tile('jog'),{tone:'danger',text:t('Bloqué : alarme'),empty:'false'});
  assert.deepEqual(p.tile('machine'),{tone:'danger',text:t('Alarme')+' 1',empty:'false'});
  assert.equal(p.els['ks-resume-hint'].textContent,'Parcours_de_test_1.gcode'+t(' · alarme'),lang+' alarm: resume bar');
  // M7/M8 stale report: Suivi and Machine say it (warn), the resume bar too.
  p.show(STATES.perime,'home');
  assert.deepEqual(p.tile('home'),{tone:'warn',text:t('Rapport ancien')+' · 17 %',empty:'false'},lang+' stale: Suivi');
  assert.deepEqual(p.tile('machine'),{tone:'warn',text:t('Rapport ancien'),empty:'false'},lang+' stale: Machine');
  assert.equal(p.els['ks-resume-hint'].textContent,'Parcours_de_test_1.gcode'+t(' · rapport ancien'),lang+' stale: resume bar');
  // Offline (job-controls publishes machine:null once the observation is lost): every tile says so.
  p.show(STATES['hors-ligne'],'files');
  assert.deepEqual(p.tile('home'),{tone:'off',text:t('Hors ligne'),empty:'false'});
  assert.deepEqual(p.tile('jog'),{tone:'off',text:t('Hors ligne'),empty:'false'},lang+' offline: Préparer');
  assert.deepEqual(p.tile('machine'),{tone:'off',text:t('Hors ligne'),empty:'false'},lang+' offline: Machine');
  assert.deepEqual(p.tile('files'),{tone:'off',text:t('État du fichier indisponible'),empty:'false'},lang+' offline: Fichiers');
  assert.equal(p.els['ks-resume-hint'].textContent,t('État du fichier indisponible'),lang+' offline: resume bar');
  // M8: under a screen that is not about the job, no file line (it was the job's state under « Journal »).
  for(const last of ['history','settings','machine','jog']){
    p.show(STATES.travail,last);
    assert.equal(p.els['ks-resume-hint'].textContent,'',lang+' resume to '+last+': no file line');
    assert(p.els['ks-resume-title'].textContent.length>0);
  }
  // Loaded nothing, observed: still « Aucun fichier chargé ».
  p.show({...base,name:'',canStart:false},'home');assert.equal(p.els['ks-resume-hint'].textContent,t('Aucun fichier chargé'));
  // The Machine screen's word is the strip's, untouched by the tile rules.
  p.show(STATES.travail);assert.equal(p.machineWord.textContent,t('En cours'));assert.equal(p.machineWord.getAttribute('data-tone'),'run');
}
// Simulation at rest: Préparer still says « Simulateur » (neutral), with a commissioning that never applies.
{
  const p=menu('fr',{simulation:true});p.show(STATES.repos);
  assert.deepEqual(p.tile('jog'),{tone:'',text:'Simulateur',empty:'false'});
  p.show(STATES.homing);assert.equal(p.tile('jog').text,'Machine en mouvement');
}
// No unchanged DOM write: a second identical update writes nothing.
{
  for(const k of Object.keys(STATES)){
    const p=menu('fr');p.show(STATES[k],'home');
    const lives=['home','files','jog','machine','history','settings'].map(n=>p.tile(n));
    const before=JSON.stringify(lives),count=writes.n;p.show(STATES[k],'home');
    assert.equal(JSON.stringify(['home','files','jog','machine','history','settings'].map(n=>p.tile(n))),before);
    assert.equal(writes.n,count,k+': a second identical update writes no attribute and no text');
  }
}
// --- 2. Style: the measured fixes of the menu (ui-2027.css, responsive.css, design-tokens.css).
const ui=strip(read('ui-2027.css')),responsive=strip(read('responsive.css')),tokens=strip(read('design-tokens.css'));
// The last rule with exactly this selector (the lot's rules come after the general ones).
const rule=(css,sel)=>{let i=-1,from=0,j;while((j=css.indexOf(sel+'{',from))>=0){const c=j?css[j-1]:'}';if(c==='}'||/\s/.test(c))i=j;from=j+1;}return i<0?null:css.slice(i+sel.length+1,css.indexOf('}',i));};
// M3: the tiles' indicator is a pill (dot + word): inline-flex, in the base rule placed before the tone rules
// (a more specific selector would override the tone colours).
{
  const i=ui.indexOf('.t-tile .t-live,.ks-tile .t-live{'),tone=ui.indexOf('.t-live[data-tone="ok"]');
  assert(i>0&&i<tone,'.ks-tile .t-live shares the pill rule, before the tone rules');
  assert.match(ui.slice(i,ui.indexOf('}',i)),/display:inline-flex/);
  assert.doesNotMatch(ui,/\.ks-ui \.ks-tile \.t-live\{[^}]*display:(block|flex|none)/,'no later rule takes the pill back');
}
// M9: the tiles keep the second row of the menu grid, with or without the resume bar.
assert.match(ui,/#screen-menu\.active,\.ks-ui #screen-menu\.kept\{display:grid;[^}]*grid-template-rows:auto minmax\(0,1fr\)/);
assert.equal(rule(ui,'.ks-ui .ks-tiles'),'grid-row:2');
assert.match(ui,/\.ks-ui \.ks-resume\[hidden\]\+\.ks-tiles\{margin-top:calc\(-1 \* var\(--sp-4\)\)\}/,'the empty first row gives its gap back');
// M2: icon and indicator never squeezed; in the compact window the hint holds one line.
assert.match(rule(ui,'.ks-ui .ks-tile svg'),/flex:none/);
assert.match(ui,/\.ks-ui \.ks-tile \.t-live\{align-self:flex-start;max-width:100%;flex:none\}/);
assert.match(rule(ui,'.ks-ui.t-compact .ks-tile small'),/white-space:nowrap;overflow:hidden;text-overflow:ellipsis/);
// A2: an empty indicator keeps its place (visibility, not display: .ks-ui [hidden] would remove it).
assert.equal(rule(ui,'.ks-ui .ks-tile .t-live[data-empty=true]'),'visibility:hidden');
// …and its height: an empty pill had no text line (18 px instead of 32), the titles of Journal and Réglages sat 6 px lower.
assert.equal(rule(ui,'.ks-ui .ks-tile .t-live[data-empty=true]>span::before'),'content:"\\a0"');
// M8: an empty file line under the resume title takes no room.
assert.equal(rule(ui,'.ks-resume small:empty'),'display:none');
// M5: Pause, Reprendre, Déverrouiller greyed out in the strip stay opaque (app.css button:disabled{opacity:.4}).
assert.equal(rule(ui,'.t-strip-actions .t-btn:disabled'),'opacity:1');
// Appearance only: no rule of any stylesheet of the page hides, disables or lets taps through a strip button,
// whether by id or through the strip's action box (its only hiding rule: the box itself when it is empty).
// browser-run.cjs (strip-button) checks the drawn buttons themselves, page and stylesheets loaded.
for(const name of fs.readdirSync(__dirname+'/touch').filter(f=>/\.css$/.test(f))){
  const css=strip(read(name)),re=/([^{}@]*)\{([^{}]*)\}/g;let m;
  while((m=re.exec(css))){
    const sel=m[1].trim();
    if(!/#t-(pause|stop|resume|unlock)\b|\.t-strip-actions\b/.test(sel)||sel==='.t-strip-actions:empty')continue;
    assert.doesNotMatch(m[2],/display:none|visibility:hidden|pointer-events:none|opacity:0(?![.\d])/,name+': '+sel);
  }
}
// The disabled text keeps 4.5:1 on its striped background too (the stripe darkens or lightens it), both themes.
{
  const block=sel=>{const i=tokens.indexOf(sel+'{');return tokens.slice(i,tokens.indexOf('}',i));};
  const hex=s=>[1,3,5].map(i=>parseInt(s.slice(i,i+2),16));
  const lum=c=>{const l=c.map(v=>v/255).map(v=>v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4));return 0.2126*l[0]+0.7152*l[1]+0.0722*l[2];};
  const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);};
  for(const sel of [':root',':root[data-theme="light"]']){
    const b=block(sel),fg=hex(/--disabled-fg:(#[0-9a-f]{6})/.exec(b)[1]),bg=hex(/--disabled-bg:(#[0-9a-f]{6})/.exec(b)[1]);
    const st=/--disabled-stripe:rgba\((\d+),(\d+),(\d+),([.\d]+)\)/.exec(b),a=Number(st[4]),striped=bg.map((v,i)=>v*(1-a)+Number(st[i+1])*a);
    assert(ratio(fg,bg)>=4.5&&ratio(fg,striped)>=4.5,sel+' disabled text: '+ratio(fg,bg).toFixed(2)+' plain, '+ratio(fg,striped).toFixed(2)+' on a stripe');
  }
}
// M1: in the strip, the machine cell shrinks twice as fast as the file and each has its ellipsis; a
// confirmation (Déverrouiller…, Reprendre…) hides the machine name as a job does.
assert.match(ui,/\.ks-ui \[data-job=true\] \.t-vital--machine\{display:none\}/);
assert.equal(rule(ui,'.ks-ui [data-confirm=true] .t-vital--machine'),'display:none');
// …and so does another device's name in the Pilote box (the cell was cut to « MAC… / Lase… » at 1366 x 768).
assert.equal(rule(ui,'.ks-ui [data-pilot=other] .t-vital--machine'),'display:none');
assert.equal(rule(ui,'.ks-ui .t-vital--machine'),'flex:0 2 auto;min-width:0');
assert.equal(rule(ui,'.ks-ui .t-vital--machine span,.ks-ui .t-vital--machine b'),'white-space:nowrap;overflow:hidden;text-overflow:ellipsis');
assert.equal(rule(ui,'.ks-ui .t-vitals'),'overflow:hidden','the information zone still clips, as a safety net');
// M6: short rail (labels only) from 650 px high, the compact threshold: at 1024 x 600 the icon of « Segui-miento »
// was squeezed to 10 px.
assert.match(responsive,/@media \(max-height:650px\) and \(min-width:600px\)\{\s*body\.ks-ui #tabbar\{gap:4px!important;padding:4px!important;overflow:hidden\}[\s\S]*?#tabbar \.ks-nav svg\{display:none\}/);
assert.doesNotMatch(responsive,/@media \(max-height:560px\) and \(min-width:600px\)/);
// M4: outlines of the menu's controls on --line-control, at 3:1 at least on --bg and --surface in both themes.
{
  const block=sel=>{const i=tokens.indexOf(sel+'{');return tokens.slice(i,tokens.indexOf('}',i));};
  const val=(b,name)=>{const m=new RegExp('--'+name+':(#[0-9a-f]{6})').exec(b);assert(m,name+' in '+b.slice(0,20));return m[1];};
  const lum=h=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4));return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2];};
  const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);};
  for(const sel of [':root',':root[data-theme="light"]']){
    const b=block(sel),line=val(b,'line-control');
    for(const bg of ['bg','surface'])assert(ratio(line,val(b,bg))>=3,sel+' --line-control on --'+bg+': '+ratio(line,val(b,bg)).toFixed(2));
    // The plain --line it replaces did not reach 3:1 (the bug).
    assert(ratio(val(b,'line'),val(b,'bg'))<3);
  }
  assert.equal(rule(ui,'.ks-ui .ks-tile'),'border-color:var(--line-control)');
  assert.equal(rule(ui,'.ks-resume-go'),'border-color:var(--line-control)');
  assert.equal(rule(ui,'.ks-resume'),'border-top-color:var(--line-control);border-right-color:var(--line-control);border-bottom-color:var(--line-control)','the blue left edge stays');
}
// --- 3. Strip machine buttons: the hidden / disabled state of Pause, Arrêter, Reprendre and Déverrouiller for
// every state of the screens fixture, as before the lot (status-strip.js is not part of it).
{
  const {createDOM}=require('./dom-fixture.cjs');
  const {document,node,element}=createDOM(['home']);
  document.body.getAttribute=()=>null;
  const banner=node('real-banner'),listeners={};
  const window={cncI18n:{t:s=>s,html:s=>s,locale:'fr-FR'},addEventListener(n,f){listeners[n]=f;},removeEventListener(n){delete listeners[n];}};
  document.createElement=tag=>{const e=element(tag);Object.defineProperty(e,'innerHTML',{set(){e._path={attributes:{},setAttribute(k,v){this.attributes[k]=v;}};},get(){return '';}});e.querySelector=()=>e._path;return e;};
  vm.runInNewContext(read('status-strip.js'),{document,window,Date:{now:()=>1e12}});
  const byId=id=>banner.querySelectorAll('*').find(e=>e.id===id);
  const caps={canPause:false,canStop:false,canResume:false,canUnlock:false};
  const FIX={
    repos:{...base,...caps},
    'pilote-pris':{...base,...caps,control:{owner:{kind:'touch',id:'browser-run-other',label:'Tablette atelier',present:true},lastChange:null}},
    homing:{...STATES.homing,...caps,canStop:true},
    palpage:{...STATES.palpage,...caps,canStop:true},
    travail:{...STATES.travail,...caps,canPause:true,canStop:true},
    pause:{...STATES.pause,...caps,canStop:true,canResume:true},
    alarme:{...STATES.alarme,...caps,canStop:true},
    'alarme-repos':{...base,activeState:'Alarm',alarmCode:1,...caps,canUnlock:true},
    perime:{...STATES.perime,...caps,canPause:true,canStop:true},
    'hors-ligne':null
  };
  // Recorded on the code before the lot (status-strip.js at f365ae33): [hidden, disabled] of each button.
  const EXPECTED={
    repos:{pause:[true,true],stop:[true,true],resume:[true,true],unlock:[true,true],job:'false',confirm:'false'},
    'pilote-pris':{pause:[true,true],stop:[true,true],resume:[true,true],unlock:[true,true],job:'false',confirm:'false'},
    homing:{pause:[true,true],stop:[false,false],resume:[true,true],unlock:[true,true],job:'true',confirm:'false'},
    palpage:{pause:[true,true],stop:[false,false],resume:[true,true],unlock:[true,true],job:'true',confirm:'false'},
    travail:{pause:[false,false],stop:[false,false],resume:[true,true],unlock:[true,true],job:'true',confirm:'false'},
    pause:{pause:[true,true],stop:[false,false],resume:[false,false],unlock:[true,true],job:'true',confirm:'true'},
    alarme:{pause:[false,true],stop:[false,false],resume:[true,true],unlock:[true,true],job:'true',confirm:'false'},
    'alarme-repos':{pause:[true,true],stop:[true,true],resume:[true,true],unlock:[false,false],job:'false',confirm:'true'},
    perime:{pause:[false,false],stop:[false,false],resume:[true,true],unlock:[true,true],job:'true',confirm:'false'},
    'hors-ligne':{pause:[true,true],stop:[true,true],resume:[true,true],unlock:[true,true],job:'false',confirm:'false'}
  };
  // The pilot as job-controls.js publishes it (another device holds the machine in « pilote pris »).
  const PILOT={'pilote-pris':{state:'other',value:'Tablette atelier',sentence:'Piloté par Tablette atelier.'}};
  for(const k of Object.keys(FIX)){
    listeners['cnc-job-status']({detail:{simulation:false,machine:FIX[k],transportConnected:!!FIX[k],pilot:PILOT[k]||(FIX[k]?{state:'mine',value:'Cet appareil',sentence:''}:undefined)}});
    const got={};for(const b of ['pause','stop','resume','unlock']){const e=byId('t-'+b);got[b]=[e.hidden,e.disabled];}
    got.job=banner.getAttribute('data-job');got.confirm=banner.getAttribute('data-confirm');
    assert.deepEqual(got,EXPECTED[k],'strip buttons in state '+k);
    // M1 (correction): the banner says who pilots, for the stylesheet only.
    assert.equal(banner.getAttribute('data-pilot'),PILOT[k]?'other':FIX[k]?'mine':'unknown','data-pilot in state '+k);
  }
}
// --- 4. Cache: the files of the lot are served as v2p.
for(const page of ['index.html','simulation.html']){
  const html=read(page);
  for(const f of ['design-tokens.css','ui-2027.css','responsive.css','touch-shell.js','header-clock.js','i18n-messages.js'])assert(html.includes(f+'?v=v2p'),page+': '+f+'?v=v2p');
}
console.log('PASS menu screen: tile and resume words for homing, probing, jog, stale, offline and alarm (FR/EN/ES), empty indicators kept in place, full-height tiles, pill, 3:1 outlines, opaque disabled strip buttons, short rail at 650 px, strip cells with their own ellipsis; strip buttons hidden/disabled unchanged in 10 states, none hidden by a stylesheet, disabled text at 4.5:1 on its stripes, no repeated DOM write.');
