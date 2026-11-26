'use strict';
// Lot N3 — notification of the end of a job, of a pause and of an alarm (touch/notify.js).
// Offline: the pure reducer, the sound engine on a fake AudioContext, then the page part on the DOM fixture.
const assert=require('assert').strict,fs=require('fs'),path=require('path'),vm=require('vm');
const {createDOM}=require('./dom-fixture.cjs');
const file=name=>fs.readFileSync(path.join(__dirname,'touch',name),'utf8');
const source=file('notify.js'),css=file('notify.css');

// ---------- 1. Pure part: which snapshot raises which event ----------
const pure={};vm.runInNewContext(source,pure);
const N=pure.CNCNotify;
const base={port:'/dev/ttyUSB0',generation:'g1',activeState:'Idle',workflow:'idle',fresh:true,finished:false,finishedWithErrors:false,jobStopped:false,jobErrors:0,programPause:null,total:0,received:0,alarmCode:null};
const snap=o=>Object.assign({},base,o);
const types=r=>Array.from(r.events,e=>e.type+(e.kind?':'+e.kind:'')+(e.changed?':changed':'')+(e.errors?':'+e.errors:''));
// Feeds snapshots in turn; returns the event lists.
function feed(list,start){let state=start===undefined?null:start,out=[],now=0;for(const item of list){const m=Array.isArray(item)?item[0]:item;if(Array.isArray(item))now=item[1];const r=N.reduce(state,m,now);state=r.state;out.push(types(r));}return {out,state};}
const running=snap({activeState:'Run',workflow:'running',total:100,received:40});
const idle=snap({});

// Nothing old at page load: the first state seen is a baseline, whatever it is.
for(const first of [snap({activeState:'Alarm',alarmCode:2}),snap({finished:true}),snap({finishedWithErrors:true,jobErrors:3}),snap({activeState:'Hold:0',workflow:'paused',programPause:{kind:'M6'}}),running])
 assert.deepEqual(feed([first,first]).out,[[],[]],'no event for the state found at load');
// Another port, or the same port opened again: a baseline too.
assert.deepEqual(feed([idle,snap({port:'/dev/ttyUSB1',activeState:'Alarm'})]).out,[[],[]]);
assert.deepEqual(feed([idle,snap({generation:'g2',activeState:'Alarm'})]).out,[[],[]]);

// Alarm: once, on the edge.
assert.deepEqual(feed([idle,snap({activeState:'Alarm',alarmCode:2}),snap({activeState:'Alarm',alarmCode:2}),idle,snap({activeState:'Alarm:1'})]).out,[[],['alarm'],[],[],['alarm']]);
// An alarm during a job: the alarm, never « finished », even when every line was acknowledged.
assert.deepEqual(feed([snap({activeState:'Run',workflow:'running',total:100,received:100}),[snap({activeState:'Alarm',alarmCode:2}),0],[snap({activeState:'Alarm',alarmCode:2}),5000]]).out,[[],['alarm'],[]]);

// Pause: every cause, once; the job must be under way.
const paused=(kind,state)=>snap({activeState:state||'Hold:0',workflow:'paused',total:100,received:40,programPause:kind?{kind}:null});
assert.deepEqual(feed([running,paused(null)]).out[1],['pause:operator']);
for(const kind of ['M0','M1','M6','error','other'])assert.deepEqual(feed([running,paused(kind,'Idle'),paused(kind,'Idle')]).out,[[],['pause:'+kind],[]],kind);
assert.deepEqual(feed([running,snap({activeState:'Hold:1',workflow:'running',total:100,received:40})]).out[1],['pause:hold'],'feed hold outside CNCjs');
assert.deepEqual(feed([running,snap({activeState:'Door:0',workflow:'running',total:100,received:40})]).out[1],['pause:door']);
assert.deepEqual(feed([idle,snap({activeState:'Hold:0'})]).out,[[],[]],'a hold with no job (jog, homing) is not a job pause');
// The cause known one report late, then the end of the pause.
assert.deepEqual(feed([running,snap({activeState:'Hold:1',workflow:'running',total:100,received:40}),paused('M6'),running]).out,[[],['pause:hold'],['pause:M6:changed'],['pause-end']]);
// A plate probe during a tool change pause reports Run: still the same pause.
assert.deepEqual(feed([running,paused('M6','Idle'),paused('M6','Run'),paused('M6','Idle')]).out,[[],['pause:M6'],[],[]]);
// Resume: CNCjs runs again one status report before the machine leaves its hold. Not a new pause.
const lag=snap({activeState:'Hold:0',workflow:'running',total:100,received:40});
assert.deepEqual(feed([running,paused(null),lag,running]).out,[[],['pause:operator'],[],['pause-end']],'resume seen before the machine state');
assert.deepEqual(feed([running,paused('M6','Idle'),snap({activeState:'Door:0',workflow:'running',total:100,received:40}),running]).out,[[],['pause:M6'],[],['pause-end']]);
// … and a program stop met while the hold still shows is announced as such.
assert.deepEqual(feed([running,paused(null),lag,paused('M0')]).out[3],['pause:M0:changed']);
// Stopped while paused: the pause ends, nothing is « finished ».
assert.deepEqual(feed([running,paused(null),[snap({jobStopped:true}),10]]).out,[[],['pause:operator'],['pause-end']]);

// End of the job.
assert.deepEqual(feed([running,snap({finished:true})]).out[1],['finish']);
assert.deepEqual(feed([running,snap({finishedWithErrors:true,jobErrors:2})]).out[1],['finish:2']);
assert.deepEqual(feed([running,snap({jobStopped:true}),[snap({jobStopped:true}),9000]]).out,[[],[],[]],'an operator stop is not an end');
// Result not known yet: waited for 2 s, then decided on what was acknowledged (job started from the PC).
const sent=snap({activeState:'Run',workflow:'running',total:100,received:100});
assert.deepEqual(feed([[sent,0],[idle,100],[idle,1900],[idle,2100],[idle,2200]]).out,[[],[],[],['finish'],[]]);
assert.deepEqual(feed([[running,0],[idle,100],[idle,2200]]).out,[[],[],[]],'lines missing and no result: not an end');
assert.deepEqual(feed([[sent,0],[idle,100],[snap({finished:true}),300]]).out[2],['finish'],'the server result ends the wait');
assert.deepEqual(feed([[sent,0],[idle,100],[snap({jobErrors:1}),2200]]).out[2],[],'refused lines without the server verdict: not announced as finished');
// The last report of the job is short of the total and the report at rest carries the rest (simulation
// page at one report a second; job started from the PC): announced, on the report at rest.
const short=snap({activeState:'Run',workflow:'running',total:100,received:98.8}),rest=snap({total:100,received:100});
assert.deepEqual(feed([[short,0],[rest,1000],[rest,2000],[rest,3100],[rest,4000]]).out,[[],[],[],['finish'],[]]);
assert.deepEqual(feed([[short,0],[idle,1000],[rest,1500],[idle,3100]]).out[3],['finish'],'the acknowledgements may come one report after the rest');
assert.deepEqual(feed([[short,0],[snap({total:100,received:98.8}),1000],[snap({total:100,received:98.8}),3100]]).out,[[],[],[]],'still short at rest: not an end');
assert.deepEqual(feed([[short,0],[snap({total:250,received:250}),1000],[snap({total:250,received:250}),3100]]).out,[[],[],[]],'another program at rest says nothing of this job');
assert.deepEqual(feed([[short,0],[snap({total:100,received:100,jobStopped:true}),1000],[snap({total:100,received:100,jobStopped:true}),3100]]).out,[[],[],[]],'stopped by the operator: not an end');
assert.deepEqual(feed([[short,0],[snap({total:100,received:100,activeState:'Alarm'}),1000],[snap({total:100,received:100,activeState:'Alarm'}),3100]]).out,[[],['alarm'],[]]);
// An old report does not end the job; the next fresh one does.
assert.deepEqual(feed([running,snap({fresh:false,finished:true}),snap({finished:true})]).out,[[],[],['finish']]);
// A new job after an end.
assert.deepEqual(feed([running,snap({finished:true}),running]).out[2],['start']);
// State lost, then back: what happened meanwhile is announced (same port, same opening).
assert.deepEqual(feed([running,null,null,snap({activeState:'Alarm',alarmCode:1})]).out,[[],[],[],['alarm']]);
assert.deepEqual(feed([running,null,snap({finished:true})]).out[2],['finish']);

// ---------- 2. Sound engine ----------
function fakeAudio(policy){
 const made=[];
 class Ctx{
  constructor(){made.push(this);this.state=policy.state;this.currentTime=10;this.oscs=[];this.gains=[];this.destination={};this.resumed=0;}
  resume(){this.resumed++;if(policy.allow){this.state='running';if(this.onstatechange)this.onstatechange();return Promise.resolve();}return Promise.reject(new Error('NotAllowedError'));}
  createOscillator(){const o={type:'',frequency:{setValueAtTime(f,t){o.freq=f;o.at=t;}},connect(g){o.to=g;},start(t){o.started=t;},stop(t){o.stopped=t;}};this.oscs.push(o);return o;}
  createGain(){const g={peak:0,gain:{setValueAtTime(v){g.peak=Math.max(g.peak,v);},linearRampToValueAtTime(v){g.peak=Math.max(g.peak,v);}},connect(d){g.to=d;}};this.gains.push(g);return g;}
  close(){this.state='closed';return Promise.resolve();}
 }
 return {Ctx,made};
}
async function soundChecks(){
 // Before any gesture nothing exists; a blocked context plays nothing and queues nothing.
 const a=fakeAudio({state:'suspended',allow:false}),s=N.createSound(a.Ctx);
 assert.equal(a.made.length,0,'no AudioContext before a gesture');assert.equal(s.ready(),false);assert.equal(s.play('alarm',1,0),false);
 s.arm();await null;await null;
 assert.equal(a.made.length,1);assert.equal(s.ready(),false);assert.equal(s.play('alarm',1,0),false);assert.equal(a.made[0].oscs.length,0,'nothing queued on a suspended context');
 // Allowed by a gesture: one context for the page, each pattern short and distinct.
 const b=fakeAudio({state:'suspended',allow:true}),t=N.createSound(b.Ctx);let armed=0,changes=0;
 const u=N.createSound(b.Ctx,()=>changes++);u.arm(()=>armed++);await null;await null;assert.equal(armed,1,'the callback runs once the context runs');assert(changes>=1);
 t.arm();t.arm();assert.equal(b.made.length,2,'a second gesture reuses the context');
 const ctx=b.made[1],shape={};
 for(const kind of ['finish','pause','alarm']){
  const from=ctx.oscs.length;assert.equal(t.play(kind,0.4,0),true);
  const oscs=ctx.oscs.slice(from),gains=ctx.gains.slice(from);
  assert.equal(oscs.length,N.PATTERNS[kind].notes.length);
  oscs.forEach((o,i)=>{assert(o.started>=ctx.currentTime&&o.stopped>o.started);assert.equal(o.to,gains[i]);assert.equal(gains[i].to,ctx.destination);assert.equal(gains[i].peak,0.4,'volume applied');});
  const length=Math.max(...oscs.map(o=>o.stopped))-ctx.currentTime;assert(length<2,kind+' is short: '+length);
  shape[kind]=oscs[0].type+':'+oscs.map(o=>o.freq).join(',');
 }
 assert.equal(new Set(Object.values(shape)).size,3,'three distinct sounds');
 assert.equal(t.play('finish',0,0),false,'volume off plays nothing');assert.equal(t.play('nothing',1,0),false);
 // No Web Audio at all: said, never thrown.
 const none=N.createSound(undefined);none.arm();assert.equal(none.available,false);assert.equal(none.play('alarm',1,0),false);
 // A constructor that throws leaves the page working.
 const bad=N.createSound(function(){throw new Error('no audio device');});bad.arm();assert.equal(bad.ready(),false);
}

// ---------- 3. Page part ----------
function page(options){
 options=options||{};
 const dom=createDOM(['home']),audio=fakeAudio({state:options.audioState||'suspended',allow:options.allow!==false});
 const store=new Map(Object.entries(options.storage||{})),handlers={};let now=100000;
 const body=dom.document.body;body.attributes['data-simulation']=options.simulation?'true':'false';
 const settings=dom.node('screen-settings');settings.querySelector=()=>null;
 const window={addEventListener:(n,f)=>{handlers[n]=f;},removeEventListener:n=>{delete handlers[n];},performance:{now:()=>now},
  cncI18n:options.i18n||{t:s=>s},AudioContext:options.noAudio?undefined:audio.Ctx,
  CNCGrblHelp:{incident:m=>m.alarmCode===2?['Alarme 2 : la machine a dépassé sa course.','La machine a redémarré.']:[]}};
 const context={window,document:dom.document,localStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v))}};
 vm.runInNewContext(source,context);
 const find=id=>{let hit=null;(function walk(n){if(n.id===id)hit=n;n.children.forEach(walk);})(body);(function walk(n){if(n.id===id)hit=n;n.children.forEach(walk);})(settings);return hit;};
 return {dom,window,audio,store,handlers,find,body,settings,banner:find('notify-banner'),
  status:(m,sim)=>handlers['cnc-job-status']({detail:{machine:m,simulation:!!sim}}),
  touch:()=>dom.document.handlers.pointerup({type:'pointerup'}),advance:ms=>{now+=ms;},
  oscs:()=>audio.made.reduce((n,c)=>n+c.oscs.length,0)};
}
const alarm2=snap({activeState:'Alarm',alarmCode:2}),m6=snap({activeState:'Idle',workflow:'paused',total:100,received:40,programPause:{kind:'M6'},name:'plaque.nc'});
const run=snap({activeState:'Run',workflow:'running',total:100,received:40,name:'plaque.nc'}),done=snap({finished:true,name:'plaque.nc',originalName:'Plaque été.nc'});

async function pageChecks(){
 // Loaded during an alarm, after an end, in a pause: no banner, no sound, no audio context.
 for(const first of [alarm2,done,m6]){const p=page();p.touch();p.status(first);p.status(first);assert.equal(p.banner.hidden,true,'nothing old at load');assert.equal(p.oscs(),0);}
 {
  // Not armed: the banner comes alone and says the sound was blocked.
  const p=page();assert.equal(p.banner.parentNode,p.body);assert.equal(p.banner.hidden,true);assert.equal(p.banner.getAttribute('role'),'alert');
  const focused=p.dom.document.activeElement;
  p.status(idle);p.status(alarm2);
  assert.equal(p.audio.made.length,0,'no AudioContext without a gesture');
  assert.equal(p.banner.hidden,false);assert.equal(p.banner.getAttribute('data-tone'),'danger');assert.equal(p.banner.getAttribute('data-type'),'alarm');
  assert.equal(p.find('notify-title').textContent,'Alarme 2');
  assert.equal(p.find('notify-detail').textContent,'Alarme 2 : la machine a dépassé sa course. La machine a redémarré.');
  assert(/^Son bloqué par le navigateur/.test(p.find('notify-hint').textContent),'says the sound is not armed');
  assert.equal(p.window.cncNotify.shown().silent,true);
  assert.equal(p.dom.document.activeElement,focused,'takes no focus');assert(!p.banner.inert&&!p.body.inert,'makes nothing inert');
  // An alarm banner never closes by itself: unlocked, a job run, paused and finished after it.
  p.touch();p.status(idle);p.status(run);p.status(m6);p.status(run);p.status(done);
  assert.equal(p.banner.hidden,false);assert.equal(p.find('notify-title').textContent,'Alarme 2');assert.equal(p.find('notify-detail').textContent,'Alarme 2 : la machine a dépassé sa course. La machine a redémarré.');
  assert.equal(p.oscs(),0,'nothing rings behind an alarm banner');
  p.banner.click();assert.equal(p.banner.hidden,true,'a touch closes it');assert.equal(p.window.cncNotify.shown(),null);
 }
 {
  // Armed by the first touch: each event rings its own pattern.
  const p=page();p.status(run);p.touch();assert.equal(p.audio.made.length,1);assert.equal(p.audio.made[0].state,'running');p.touch();assert.equal(p.audio.made.length,1);
  p.status(m6);
  assert.equal(p.banner.hidden,false);assert.equal(p.banner.getAttribute('data-tone'),'warn');assert.equal(p.find('notify-title').textContent,'Pause');
  assert.equal(p.find('notify-detail').textContent,'Changement de fraise demandé par le fichier.');
  assert.equal(p.find('notify-hint').textContent,'Touchez ce message pour le fermer.');
  assert.equal(p.oscs(),N.PATTERNS.pause.notes.length);assert.equal(p.audio.made[0].gains[0].peak,N.LEVELS.high,'loud by default');
  // The pause is over: its banner goes.
  p.status(run);assert.equal(p.banner.hidden,true);
  // End of the job: the banner stays through later reports, until touched.
  p.status(done);
  assert.equal(p.banner.hidden,false);assert.equal(p.banner.getAttribute('data-tone'),'ok');assert.equal(p.find('notify-title').textContent,'Usinage terminé');assert.equal(p.find('notify-detail').textContent,'Plaque été.nc');
  assert.equal(p.oscs(),N.PATTERNS.pause.notes.length+N.PATTERNS.finish.notes.length);
  p.advance(600000);p.status(snap({finished:true,name:'plaque.nc',statusAgeMs:5}));assert.equal(p.banner.hidden,false,'stays until touched');
  // A new job makes it stale.
  p.status(run);assert.equal(p.banner.hidden,true);
  // Refused lines at the end: amber, with their count.
  p.status(snap({finishedWithErrors:true,jobErrors:3}));assert.equal(p.banner.getAttribute('data-tone'),'warn');assert.equal(p.find('notify-detail').textContent,'3 lignes refusées par la machine : vérifiez la pièce.');
  // An alarm replaces anything.
  p.status(alarm2);assert.equal(p.banner.getAttribute('data-type'),'alarm');
  p.window.cncNotify.dismiss();assert.equal(p.banner.hidden,true);
 }
 {
  // A code deduced after the board restarted is never shown as received (rule V6 of the strip).
  const p=page();p.status(run);p.status(snap({activeState:'Alarm',alarmCode:null}));assert.equal(p.find('notify-title').textContent,'Alarme');
  p.status(snap({activeState:'Alarm',alarmCode:3,alarmCodeInferred:true}));assert.equal(p.find('notify-title').textContent,'Alarme 3 déduite');
  p.status(idle);assert.equal(p.find('notify-title').textContent,'Alarme 3 déduite','kept after the unlock');
 }
 {
  // Operator pause: held back when this screen has just been touched (the strip says it), announced otherwise.
  const p=page(),op=snap({activeState:'Hold:0',workflow:'paused',total:100,received:40});
  p.status(run);p.touch();p.advance(500);p.status(op);assert.equal(p.banner.hidden,true,'own pause: no banner');assert.equal(p.oscs(),0);
  // … but a program cause known later is announced.
  p.status(Object.assign({},op,{programPause:{kind:'M0'}}));assert.equal(p.banner.hidden,false);assert.equal(p.find('notify-detail').textContent,'Pause demandée par le fichier.');assert.equal(p.oscs(),N.PATTERNS.pause.notes.length);
  p.status(run);assert.equal(p.banner.hidden,true);
  p.advance(3000);p.status(op);assert.equal(p.banner.hidden,false,'pause from elsewhere: announced');assert.equal(p.find('notify-detail').textContent,'Usinage en pause.');
  // Own pause, then own resume: the machine still reports its hold for one report. Nothing is announced.
  p.status(run);p.banner.click();const quiet=p.oscs();p.touch();p.advance(300);p.status(op);assert.equal(p.banner.hidden,true);
  p.advance(20000);p.touch();p.advance(300);p.status(snap({activeState:'Hold:0',workflow:'running',total:100,received:40}));
  assert.equal(p.banner.hidden,true,'no pause banner at the resume');assert.equal(p.oscs(),quiet,'no pause sound at the resume');
  p.status(run);assert.equal(p.banner.hidden,true);
  // An announced pause keeps its words through the resume, then goes.
  p.advance(5000);p.status(m6);p.status(snap({activeState:'Hold:0',workflow:'running',total:100,received:40}));
  assert.equal(p.find('notify-detail').textContent,'Changement de fraise demandé par le fichier.');p.status(run);assert.equal(p.banner.hidden,true);
  // A program stop is announced even right after a touch.
  p.status(run);p.touch();p.status(m6);assert.equal(p.banner.hidden,false);
 }
 {
  // Simulation page: the last report of the job is short of the total, the report at rest is complete.
  const p=page({simulation:true});p.touch();p.status(snap({activeState:'Run',workflow:'running',total:100,received:98.8,name:'plaque.nc'}),true);
  p.status(snap({total:100,received:100,name:'plaque.nc'}),true);assert.equal(p.banner.hidden,true,'the server result is waited for');
  p.advance(2100);p.status(snap({total:100,received:100,name:'plaque.nc'}),true);
  assert.equal(p.banner.hidden,false);assert.equal(p.find('notify-title').textContent,'Usinage terminé');assert.equal(p.find('notify-detail').textContent,'plaque.nc');assert.equal(p.oscs(),N.PATTERNS.finish.notes.length);
 }
 {
  // Laser words.
  const p=page(),laser={machineProfile:{kind:'laser'}};p.status(snap(Object.assign({activeState:'Run',workflow:'running',total:10,received:1},laser)));
  p.status(snap(Object.assign({activeState:'Idle',workflow:'paused',total:10,received:5,programPause:{kind:'M6'}},laser)));assert.equal(p.find('notify-detail').textContent,'Pause demandée par le fichier.');
  p.status(snap(Object.assign({finished:true},laser)));assert.equal(p.find('notify-title').textContent,'Gravure terminée');
 }
 {
  // The simulation page ignores the real machine and the real page the simulation.
  const p=page();p.status(idle,true);p.status(alarm2,true);assert.equal(p.banner.hidden,true);
  const q=page({simulation:true});q.status(idle,false);q.status(alarm2,false);assert.equal(q.banner.hidden,true);q.status(idle,true);q.status(alarm2,true);assert.equal(q.banner.hidden,false);
 }
 {
  // Réglages: volume kept in this browser, « Essayer le son », status line.
  const p=page(),card=p.find('ks-notify-card'),status=p.find('notify-status'),test=p.find('notify-test');
  assert(card&&card.parentNode===p.settings,'card in Réglages');
  const buttons=[];(function walk(n){if(n.attributes['data-notify-volume'])buttons.push(n);n.children.forEach(walk);})(card);
  assert.deepEqual(buttons.map(b=>b.attributes['data-notify-volume']),['off','low','medium','high']);
  const pressed=()=>buttons.filter(b=>b.attributes['aria-pressed']==='true').map(b=>b.attributes['data-notify-volume']);
  assert.deepEqual(pressed(),['high']);assert.equal(status.textContent,'Son en attente : touchez l’écran une fois après l’ouverture de la page.');
  // The test button is a gesture: it arms, then plays the three sounds.
  test.click();await null;await null;
  assert.equal(p.oscs(),N.PATTERNS.finish.notes.length+N.PATTERNS.pause.notes.length+N.PATTERNS.alarm.notes.length);assert.equal(status.textContent,'Trois sons : fin, pause, puis alarme.');
  buttons[1].click();assert.deepEqual(pressed(),['low']);assert.equal(p.store.get('cncjs-touch-notify-v1'),'{"volume":"low"}');assert.equal(status.textContent,'Son prêt.');
  const before=p.oscs();p.status(idle);p.status(alarm2);assert.equal(p.audio.made[0].gains[before].peak,N.LEVELS.low,'chosen volume used');p.banner.click();
  // Off: the banner still comes, without a sound and without the « blocked » line.
  buttons[0].click();assert.equal(test.disabled,true);assert.equal(status.textContent,'Son coupé : seul le message s’affiche.');assert.equal(p.store.get('cncjs-touch-notify-v1'),'{"volume":"off"}');
  const quiet=p.oscs();p.status(idle);p.status(alarm2);assert.equal(p.oscs(),quiet);assert.equal(p.banner.hidden,false);assert.equal(p.find('notify-hint').textContent,'Touchez ce message pour le fermer.');
  // Read back at the next load; an unreadable value falls back to the default.
  assert.equal(page({storage:{'cncjs-touch-notify-v1':'{"volume":"medium"}'}}).window.cncNotify.volume(),'medium');
  assert.equal(page({storage:{'cncjs-touch-notify-v1':'{"volume":"11"}'}}).window.cncNotify.volume(),'high');
  assert.equal(page({storage:{'cncjs-touch-notify-v1':'{{'}}).window.cncNotify.volume(),'high');
  // Sound off: a touch creates no audio context.
  const off=page({storage:{'cncjs-touch-notify-v1':'{"volume":"off"}'}});off.touch();assert.equal(off.audio.made.length,0);
  // No Web Audio: said in Réglages, the banner still works.
  const none=page({noAudio:true});assert.equal(none.find('notify-status').textContent,'Son indisponible dans ce navigateur.');assert.equal(none.find('notify-test').disabled,true);
  none.touch();none.status(idle);none.status(alarm2);assert.equal(none.banner.hidden,false);
  // Still blocked after a gesture (browser policy): said, and nothing rings later.
  const blocked=page({allow:false});blocked.touch();await null;await null;blocked.status(idle);blocked.status(alarm2);assert.equal(blocked.oscs(),0);assert(/^Son bloqué/.test(blocked.find('notify-hint').textContent));
 }
 {
  // Leaving the page: listeners removed, the context closed.
  const p=page();p.touch();p.handlers.pagehide({persisted:true});assert(p.handlers['cnc-job-status'],'kept in the back-forward cache');
  p.handlers.pagehide({persisted:false});assert(!p.handlers['cnc-job-status']);assert.equal(p.audio.made[0].state,'closed');assert(!p.dom.document.handlers.pointerup);
 }
}

// ---------- 4. Texts, styles and page wiring ----------
function staticChecks(){
 // Every phrase of notify.js has its EN and ES row.
 const sandbox={window:{}};['i18n-messages.js','i18n-messages-machine.js','i18n-messages-profiles.js','i18n-messages-viz.js','i18n-messages-origin.js','i18n-messages-refus.js'].forEach(n=>vm.runInNewContext(file(n),sandbox));
 const rows=new Map(sandbox.window.CNCTouchMessages.map(r=>[r[0].trim().replace(/\s+/g,' '),r]));
 const phrases=new Set();let match;const literal=/\bt\('((?:[^'\\]|\\.)*)'\)/g;
 while((match=literal.exec(source)))phrases.add(match[1]);
 ['Coupé','Faible','Moyen','Fort'].forEach(s=>phrases.add(s));
 assert(phrases.size>=24,'phrases found: '+phrases.size);
 // No setting name, G-code word or firmware name (the glossary's English « Door open » is an operator word).
 const technical=/\$\d|\b[GM]\d+\b|\b(?:Idle|Hold|Jog)\b|\bGrbl\b/;
 for(const s of phrases){
  const row=rows.get(s.trim().replace(/\s+/g,' '));assert(row,'no translation row: '+s);
  row.forEach(v=>{assert(v.trim().length>0);assert(!technical.test(v),'technical word in operator text: '+v);});
  if(!['Pause','Alarme'].includes(s))assert(row[1]!==row[0]&&row[2]!==row[0],'translated: '+s);
 }
 // The page part with the real catalogue, in English and Spanish.
 for(const [language,title,detail] of [['en','Machining finished','Bit change requested by the file.'],['es','Mecanizado terminado','Cambio de fresa pedido por el archivo.']]){
  const p=page({i18n:{t:s=>{const r=rows.get(String(s).trim().replace(/\s+/g,' '));return r?r[language==='en'?1:2]:s;}}});
  p.status(run);p.status(m6);assert.equal(p.find('notify-detail').textContent,detail);p.status(run);p.status(done);assert.equal(p.find('notify-title').textContent,title);
 }
 // Styles: under the strip, under the lock shield, the sheets and the dialogs; tokens only; nothing moves.
 const rule=/\.ks-notify\{([^}]*)\}/.exec(css)[1];
 assert(/position:fixed/.test(rule)&&/top:calc\(var\(--statusbar-h,72px\) \+ 8px\)/.test(rule),'starts under the status strip');
 assert(/left:calc\(var\(--rail-w,88px\) \+ 16px\)/.test(rule),'right of the rail');
 const z=Number(/z-index:(\d+)/.exec(rule)[1]),layer=(name,selector)=>Number(new RegExp(selector.replace(/[.#-]/g,'\\$&')+'\\{[^}]*z-index:(\\d+)').exec(file(name))[1]);
 assert(z<layer('ui-2027.css','.t-lock-shield')&&z<layer('touch-shell.css','.ks-sheet')&&z<layer('ui-2027.css','.t-scrim')&&z<layer('ui-2027.css','.ks-ui .job-dialog')&&z<layer('ui-2027.css','.t-numpad'),'under every sheet, dialog and pad');
 assert(!/animation|transition|@keyframes/.test(css.replace(/\/\*[\s\S]*?\*\//g,'')),'no animation');
 assert(!/:has\(|color-mix|\ddvh/.test(css),'CSS the RT knows');
 assert(!/#[0-9a-f]{3,8}\b/i.test(css.replace(/box-shadow:[^;}]*/g,'')),'colours through the tokens');
 assert(/\.ks-notify-title\{[^}]*font-size:72px/.test(css),'title read from afar');
 assert(/\.ks-notify \.ks-notify-close\{[^}]*min-height:64px/.test(css)&&/\.ks-notify-choices button\{[^}]*min-height:64px/.test(css),'touch targets');
 // Source: no focus taken, no timer, no request, no command; ES2017 at most.
 assert(!/\.focus\(|setTimeout|setInterval|requestAnimationFrame|XMLHttpRequest|fetch\(|cncJobControls|cncSocket|\.inert\b/.test(source),'reads the published state only');
 assert(!/\?\.|\?\?|\basync\b|=>/.test(source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm,'')),'syntax the RT runs');
 assert(!/<audio|new Audio\(|\.mp3\b|\.wav\b|\.ogg\b/.test(source),'no sound file');
 // Both pages load it once, after what it reads, and its stylesheet.
 for(const name of ['index.html','simulation.html']){
  const html=file(name);
  assert.equal((html.match(/src="notify\.js\?v=/g)||[]).length,1,name);assert.equal((html.match(/href="notify\.css\?v=/g)||[]).length,1,name);
  for(const before of ['i18n.js','grbl-help.js','display-settings.js','job-follow.js'])assert(html.indexOf('src="'+before)>0&&html.indexOf('src="'+before)<html.indexOf('src="notify.js'),name+': after '+before);
  assert.equal(/src="notify\.js\?v=([^"]+)"/.exec(html)[1],/src="job-follow\.js\?v=([^"]+)"/.exec(html)[1],'same cache version');
 }
}

(async function(){
 await soundChecks();await pageChecks();staticChecks();
 console.log('PASS notification: nothing old at load, alarm / pause / end once each, alarm kept until touched, sound armed by a gesture, volume, FR/EN/ES.');
})().catch(error=>{console.error(error);process.exitCode=1;});
