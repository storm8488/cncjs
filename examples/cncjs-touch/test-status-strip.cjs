'use strict';
// Status strip: one word and one tone per Grbl state, report age, live values,
// Pause/Stop relayed to the job buttons, no unchanged DOM writes, listener cleanup.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
function fixture(simulation){
 const {document,node,element,stats}=require('./dom-fixture.cjs').createDOM(['home']);
 document.body.getAttribute=()=>simulation?'true':null;
 const banner=node(simulation?'simulation-banner':'real-banner');
 // querySelector('path') on the state box: a tiny stub keeping the last d attribute.
 const listeners={},clicks={};
 node('job-pause').addEventListener('click',()=>{clicks.pause=(clicks.pause||0)+1;});
 node('job-stop').addEventListener('click',()=>{clicks.stop=(clicks.stop||0)+1;});
 const window={cncI18n:{t:s=>s,html:s=>s,locale:'fr-FR'},addEventListener(n,f){listeners[n]=f;},removeEventListener(n){delete listeners[n];}};
 const realCreate=document.createElement;
 document.createElement=tag=>{const e=element(tag);Object.defineProperty(e,'innerHTML',{set(){e._path={attributes:{},setAttribute(k,v){this.attributes[k]=v;}};},get(){return '';}});e.querySelector=()=>e._path;return e;};
 const clock={now:1e12};
 vm.runInNewContext(fs.readFileSync(__dirname+'/touch/status-strip.js','utf8'),{document,window,Date:{now:()=>clock.now}});
 // Elements built by the module are found in the banner tree (the fixture's getElementById only knows ids it created).
 const byId=id=>banner.querySelectorAll('*').find(e=>e.id===id);
 return {clock,document,node,stats,window,listeners,clicks,banner,byId,send:detail=>listeners['cnc-job-status']({detail:Object.assign({simulation},detail)})};
}
let f=fixture(false);
assert.equal(f.banner.children[0].id,'t-state');assert.equal(f.banner.children[1].id,'t-fresh');
assert.equal(f.byId('t-state-text').textContent,'Hors ligne');assert.equal(f.byId('t-state').getAttribute('data-tone'),'off');
assert(f.byId('t-pause').hidden&&f.byId('t-stop').hidden);
const m=(patch)=>Object.assign({port:'A',activeState:'Idle',workflow:'idle',fresh:true,statusAgeMs:300,feedrate:0,spindleSpeed:0,name:'',canPause:false,canStop:false},patch);
f.send({machine:m(),transportConnected:true});
assert.equal(f.byId('t-state-text').textContent,'Repos');assert.equal(f.byId('t-state').getAttribute('data-tone'),'ok');
assert.equal(f.byId('t-fresh-text').textContent,'< 1 s');assert.equal(f.byId('t-fresh').getAttribute('data-stale'),'false');
assert.equal(f.byId('t-spindle').textContent,'0 tr/min');assert.equal(f.byId('t-file').textContent,'—');
let writes=f.stats.writes;f.send({machine:m(),transportConnected:true});assert.equal(f.stats.writes,writes,'no unchanged writes');
f.send({machine:m({activeState:'Run',workflow:'running',feedrate:1800,spindleSpeed:12000,name:'a.nc',originalName:'Support moteur.nc',canPause:true,canStop:true}),transportConnected:true});
assert.equal(f.byId('t-state-text').textContent,'En cours');assert.equal(f.byId('t-state').getAttribute('data-tone'),'run');
assert.match(f.byId('t-spindle').textContent,/12.000 tr\/min/);assert.match(f.byId('t-feed').textContent,/1.800 mm\/min/);
assert.equal(f.byId('t-file').textContent,'Support moteur.nc');
assert(!f.byId('t-pause').hidden&&!f.byId('t-stop').hidden&&!f.byId('t-pause').disabled&&!f.byId('t-stop').disabled);
f.byId('t-pause').click();f.byId('t-stop').click();assert.equal(f.clicks.pause,1);assert.equal(f.clicks.stop,1);
// A disabled job button is never relayed.
f.node('job-stop').disabled=true;f.byId('t-stop').click();assert.equal(f.clicks.stop,1);f.node('job-stop').disabled=false;
f.send({machine:m({activeState:'Hold:0',workflow:'paused',canPause:false,canStop:true,canResume:true}),transportConnected:true});
assert.equal(f.byId('t-state-text').textContent,'Pause');assert.equal(f.byId('t-state').getAttribute('data-tone'),'warn');assert(f.byId('t-pause').disabled);
// In a pause the strip offers Resume (relayed to the job button, so its confirmation opens).
f.clock.now+=1000;assert(!f.byId('t-resume').hidden&&!f.byId('t-resume').disabled);assert(f.byId('t-pause').hidden,'in a pause, Resume takes the place of Pause');f.node('job-resume').addEventListener('click',()=>{f.clicks.resume=(f.clicks.resume||0)+1;});
f.byId('t-resume').click();assert.equal(f.clicks.resume,1);
f.byId('t-resume').click();assert.equal(f.clicks.resume,1,'a double tap is absorbed for 600 ms');
f.byId('t-stop').click();assert.equal(f.clicks.stop,2,'Stop is never delayed');
// Locked screen: Resume and Unlock are hidden, Pause and Stop stay.
f.listeners['cnc-screen-lock']({detail:true});assert(f.byId('t-resume').hidden);assert(!f.byId('t-stop').hidden);
f.listeners['cnc-screen-lock']({detail:false});assert(!f.byId('t-resume').hidden);
// Homing or a jog with the workflow idle: Stop is offered (the server ends them), Pause is not.
f.send({machine:m({activeState:'Home',canStop:true}),transportConnected:true});assert(!f.byId('t-stop').hidden&&f.byId('t-pause').hidden);
// Alarm: Unlock opens the $X confirmation through cncJobControls.
const prepared=[];f.window.cncJobControls={prepareCommand:op=>prepared.push(op)};
f.send({machine:m({activeState:'Alarm',alarmCode:1,canUnlock:true}),transportConnected:true});
f.clock.now+=1000;assert(!f.byId('t-unlock').hidden);f.byId('t-unlock').click();assert.deepEqual(prepared,['unlock']);
f.send({machine:m({activeState:'Alarm',alarmCode:1,canUnlock:false}),transportConnected:true});assert(f.byId('t-unlock').hidden,'not offered when the server refuses it');
f.send({machine:m({activeState:'Alarm',alarmCode:1}),transportConnected:true});
assert.equal(f.byId('t-state-text').textContent,'Alarme 1');assert.equal(f.byId('t-state').getAttribute('data-tone'),'danger');
f.send({machine:m({activeState:'Door:1'}),transportConnected:true});assert.equal(f.byId('t-state-text').textContent,'Porte ouverte');
f.send({machine:m({statusAgeMs:4000,fresh:false}),transportConnected:true});
assert.equal(f.byId('t-state-text').textContent,'Rapport ancien');assert.equal(f.byId('t-fresh').getAttribute('data-stale'),'true');assert.equal(f.byId('t-fresh-text').textContent,'4 s');assert.equal(f.byId('t-spindle').textContent,'—');
f.send({machine:m(),transportConnected:false});assert.equal(f.byId('t-state-text').textContent,'Hors ligne');
// Events of the other page kind are ignored.
f.listeners['cnc-job-status']({detail:{simulation:true,machine:m({activeState:'Run'})}});assert.equal(f.byId('t-state-text').textContent,'Hors ligne');
f.listeners.pagehide({persisted:true});assert(f.listeners['cnc-job-status']);f.listeners.pagehide({persisted:false});assert(!f.listeners['cnc-job-status']);
// Simulation: no transport, the state comes from the local controller.
f=fixture(true);f.send({machine:m({activeState:'Run',workflow:'running',canPause:true,canStop:true})});
assert.equal(f.byId('t-state-text').textContent,'En cours');assert.equal(f.byId('t-fresh-text').textContent,'simulé');assert.equal(f.byId('t-fresh').getAttribute('data-stale'),'false');
for(const name of ['index.html','simulation.html']){const html=fs.readFileSync(__dirname+'/touch/'+name,'utf8');assert(html.indexOf('status-strip.js')>html.indexOf('job-controls.js'));assert(html.indexOf('status-strip.js')>html.indexOf('touch-shell.js'));assert(html.includes('design-tokens.css'));assert(html.includes('ui-2027.css'));}
console.log('PASS status strip: state words and tones, report age, live values, relayed Pause/Stop, no unchanged writes, page kind, cleanup.');
