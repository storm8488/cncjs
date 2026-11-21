'use strict';
// Machine screen (lot écrans 4): why $X / $H are greyed out, said in one status line under them (a title
// is not shown on touch), or the answer to a request sent from this screen; the buttons' handlers, guards
// and disabled state stay those of commissioning.js. The simulated state pill in the interface's words.
// The help sheet describes the real commands. FR / EN / ES.
const fs=require('fs'),vm=require('vm'),assert=require('assert').strict;
const read=f=>fs.readFileSync(__dirname+'/touch/'+f,'utf8');
// Translator over the real catalogue (i18n.js keeps the spaces around a known phrase).
function locale(language){
  const sb={window:{}};vm.runInNewContext(read('i18n-messages.js'),sb);
  const col=language==='en'?1:language==='es'?2:0,map=new Map(sb.window.CNCTouchMessages.map(r=>[r[0].trim().replace(/\s+/g,' '),r[col]]));
  const t=s=>{const k=String(s).trim().replace(/\s+/g,' ');if(!col||!map.has(k))return s;const lead=/^\s*/.exec(s)[0],tail=/\s*$/.exec(s)[0];return lead+map.get(k)+tail;};
  return {t,message:t,html:s=>s,language,locale:language==='es'?'es-ES':language==='en'?'en-GB':'fr-FR'};
}
// status-strip.js describe(), alone (the word the strip, the menu and the Machine card show).
function describeWith(uiLocale){
  const src=read('status-strip.js'),a=src.indexOf('function describe(m,connected){'),b=src.indexOf("var tone='',lastDetail=null;");
  assert(a>0&&b>a,'describe() found in status-strip.js');
  return vm.runInNewContext('(function(uiLocale){function finite(v){return typeof v==="number"&&isFinite(v);}'+src.slice(a,b)+'return describe;})',{isFinite,String})(uiLocale);
}
const ENGLISH=/\b(Idle|Run|Hold|Jog|Alarm|Door|Check|Home|Sleep)\b/;

{
  // (c) Simulation: the pill says the state in the interface's words, « déduite » included (FR / ES); class and
  // disabled of the two alarm buttons keep reading activeState.
  for(const [language,word] of [['fr','État fictif : Alarme 3 déduite'],['es','Estado simulado: Alarma 3 deducida']]){
    const nodes={},events={},uiLocale=locale(language);
    const doc={hidden:false,getElementById:id=>nodes[id]||(nodes[id]={id,textContent:'',className:'',disabled:false,addEventListener(){}}),addEventListener(){}};
    const window={cncI18n:uiLocale,addEventListener:(n,f)=>events[n]=f};
    vm.runInNewContext(read('simulation-machine.js'),{window,document:doc});
    window.cncStatusStrip={describe:describeWith(uiLocale)};
    events['cnc-job-status']({detail:{simulation:true,machine:{activeState:'Alarm',alarmCode:3,alarmCodeInferred:true,workflow:'paused',fresh:true}}});
    assert.equal(nodes['sim-machine-state'].textContent,word);assert(!ENGLISH.test(nodes['sim-machine-state'].textContent));
    assert.equal(nodes['sim-machine-state'].className,'badge err');assert.equal(nodes['sim-trigger-alarm'].disabled,true);assert.equal(nodes['sim-clear-alarm'].disabled,false);
    events['cnc-job-status']({detail:{simulation:true,machine:{activeState:'Idle',workflow:'idle',fresh:true}}});
    assert(!ENGLISH.test(nodes['sim-machine-state'].textContent),nodes['sim-machine-state'].textContent);assert.equal(nodes['sim-machine-state'].className,'badge ok');
    assert.equal(nodes['sim-trigger-alarm'].disabled,false);assert.equal(nodes['sim-clear-alarm'].disabled,true);
  }
  // Before status-strip.js is loaded (it comes after this file), Grbl's word rather than nothing.
  const nodes={},doc={hidden:false,getElementById:id=>nodes[id]||(nodes[id]={id,textContent:'',addEventListener(){}}),addEventListener(){}},events={};
  vm.runInNewContext(read('simulation-machine.js'),{window:{addEventListener:(n,f)=>events[n]=f},document:doc});
  events['cnc-job-status']({detail:{simulation:true,machine:{activeState:'Idle',workflow:'idle'}}});assert.equal(nodes['sim-machine-state'].textContent,'État fictif : Idle');
}

// L2 migrates the old $X/$H reason card to the shared checklist and details sheet.
const {page}=require('./session-dom-fixture.cjs'),{machine}=require('./session-fixture.cjs');
(async()=>{
 for(const language of ['fr','en','es']){
  const p=page(language);p.run('grbl-help.js');p.run('touch-shell.js');const calls=[];
  p.window.cncJobControls.prepareCommand=op=>{calls.push(op);return Promise.resolve({opened:true});};
  const status=(m,pilot={state:'free'})=>{p.emit('cnc-job-status',{machine:m,transportConnected:true,pilot});p.window.cncShell.go('machine');p.advance(601);};
  status(machine({homed:false}));p.node('step-machine-main').click();assert.deepEqual(calls,['home']);
  assert(p.node('machine-unlock').disabled);assert(p.node('machine-unlock-reason').textContent);
  status(machine({homed:false,activeState:'Alarm',canUnlock:true}));assert(!p.node('machine-unlock').disabled);p.node('machine-unlock').click();assert.deepEqual(calls,['home','unlock']);
  status(machine({homed:false,activeState:'Alarm',canUnlock:true}),{state:'other',name:'PC'});assert(p.node('machine-unlock').disabled);assert.equal(p.node('step-machine-main').getAttribute('data-action'),'prendre-la-main');
  for(const patch of [{canHome:false},{fresh:false},{canHome:false,workflow:'running',activeState:'Run'}]){status(machine({homed:false,...patch}));const n=calls.length;p.node('step-machine-main').click();assert.equal(calls.length,n,'disabled home sends nothing');}
  status(machine({homed:false,workOffset:{state:'proven',wcs:'G54',stored:{x:'1.250',y:'2',z:'-3'}}}));
  p.node('machine-details-open').click();assert(!p.node('ks-machine-details').hidden);assert(p.node('ks-machine-details').contains(p.node('job-port')));assert(p.node('ks-machine-details').contains(p.node('machine-limits-content')));assert(p.node('ks-machine-details').contains(p.node('machine-details-content')));
  assert(p.node('machine-offset-details').textContent.includes('G54'));assert(p.node('machine-offset-details').textContent.includes('X 1.250'));
  p.window.cncJobControls.readSettings=()=>Promise.reject({code:'ETOUCH_SETTINGS_READING'});p.node('machine-details-reread').click();await Promise.resolve();
  assert(p.node('ks-machine-details').querySelector('.ks-refus'),'details read refusal stays inside its sheet');
  p.window.cncShell.closeSheet();
  p.window.cncJobControls.prepareCommand=()=>Promise.resolve({opened:false,error:{code:'ETOUCH_START_NOT_HOMED'}});
  status(machine({homed:false}));p.node('step-machine-main').click();await Promise.resolve();assert(p.node('step-machine-cause').textContent.startsWith('!'),'refusal on the screen where requested');
  p.window.cncShell.go('files');assert(!p.node('step-files-cause').textContent.startsWith('!'),'leaving clears local refusal');
  p.window.cncJobControls.dispose();
 }
 console.log('PASS Machine: home/unlock owners and guards, shared refusal, details and simulated states (FR/EN/ES).');
})().catch(e=>{console.error(e);process.exitCode=1;});
