'use strict';
// Affichage → Luminosité: status on display, one request at a time with the last
// slider position winning, ±10 steps, minimum 5 %, read-only and missing panels.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const {document,node,element,activeScreens}=require('./dom-fixture.cjs').createDOM(['menu']);
const panel=node('screen-settings'),footer=element('div');footer.className='wide ks-display-footer';panel.appendChild(footer);
panel.querySelector=sel=>sel==='.ks-display-footer'?footer:null;
let requests=[],token='jwt';
const handlers={};
const window={addEventListener:(n,f)=>handlers[n]=f,cncState:{get:()=>({apiBase:'/api'})}};
function XHR(){this.headers={};requests.push(this);}
XHR.prototype.open=function(m,u){this.method=m;this.url=u;};
XHR.prototype.setRequestHeader=function(k,v){this.headers[k]=v;};
XHR.prototype.send=function(body){this.body=body;};
const storage=new Map();
const timers=[];
const context={window,document,XMLHttpRequest:XHR,setTimeout:(f,ms)=>{timers.push({f,ms,live:true});return timers.length;},clearTimeout:id=>{if(timers[id-1])timers[id-1].live=false;},localStorage:{getItem:k=>k==='cnc'?(token?JSON.stringify({state:{session:{token}}}):null):(storage.has(k)?storage.get(k):null),setItem:(k,v)=>storage.set(k,String(v))}};
vm.runInNewContext(fs.readFileSync(__dirname+'/touch/backlight.js','utf8'),context);
// A page loaded while the panel may be off asks the server to wake it, once.
assert.equal(requests.length,1);assert.equal(requests[0].method,'POST');assert.deepEqual(JSON.parse(requests[0].body),{wake:true});
requests[0].status=200;requests[0].responseText='{}';requests[0].onload();requests.length=0;
const card=panel.children[0];
assert.equal(card.id,'ks-backlight');assert.equal(panel.children[1],footer,'the card goes before the footer');
const row=card.children[2],[down,slider,up,value]=row.children,sleepRow=card.children[3],select=sleepRow.children[1],status=card.children[4];
const answer=(code,data)=>{const r=requests.at(-1);r.status=code;r.responseText=JSON.stringify(data);r.onload();};
const posts=()=>requests.filter(r=>r.method==='POST');

assert.equal(requests.length,0,'nothing is read while the settings screen is not shown');
assert(down.disabled&&slider.disabled&&up.disabled,'disabled until the status is known');
assert.equal(select.value,'off','the panel is turned off during the screen saver by default');
assert.deepEqual(select.children.map(o=>o.value),['off','min','keep']);
activeScreens.clear();activeScreens.add('settings');handlers['cnc-screen-change']();
assert.equal(requests.length,1);assert.equal(requests[0].method,'GET');assert.equal(requests[0].url,'/api/touch-backlight');assert.equal(requests[0].headers.Authorization,'Bearer jwt');
handlers['cnc-screen-change']();assert.equal(requests.length,1,'no duplicate read in flight');
answer(200,{available:true,writable:true,device:'backlight',percent:50,minPercent:5});
assert(!slider.disabled&&!down.disabled&&!up.disabled);assert.equal(slider.value,'50');assert.equal(value.textContent,'50 %');assert.equal(status.textContent,'');

// A drag: the first value is sent, later ones wait, and only the last of them follows.
slider.value='65';slider.handlers.input();assert.equal(posts().length,1);assert.deepEqual(JSON.parse(posts()[0].body),{percent:65});assert.equal(value.textContent,'65 %');
slider.value='70';slider.handlers.input();slider.value='85';slider.handlers.input();assert.equal(posts().length,1,'one request at a time');
answer(200,{available:true,writable:true,percent:65});
assert.equal(posts().length,2);assert.deepEqual(JSON.parse(posts()[1].body),{percent:85});assert.equal(slider.value,'85','an older answer never moves the slider back');
answer(200,{available:true,writable:true,percent:85});assert.equal(slider.value,'85');assert.equal(value.textContent,'85 %');
// Steps of 10, clamped to 5..100.
up.click();assert.deepEqual(JSON.parse(posts().at(-1).body),{percent:95});answer(200,{available:true,writable:true,percent:95});
up.click();answer(200,{available:true,writable:true,percent:100});up.click();assert.deepEqual(JSON.parse(posts().at(-1).body),{percent:100});answer(200,{available:true,writable:true,percent:100});
slider.value='10';slider.handlers.input();answer(200,{available:true,writable:true,percent:10});
down.click();assert.deepEqual(JSON.parse(posts().at(-1).body),{percent:5},'never below 5 %');answer(200,{available:true,writable:true,percent:5});
down.click();assert.deepEqual(JSON.parse(posts().at(-1).body),{percent:5});answer(200,{available:true,writable:true,percent:5});
// A touch on the slider is settled on release: a swipe the browser hands over to the scroll
// (pointercancel) sends no level and puts the previous one back, in either order of the events.
{
  const pointer=(type,pointerType='touch',pointerId=7)=>slider.handlers[type]({type,pointerId,pointerType});
  const flushTimers=(ms)=>{for(const x of timers)if(x.live&&x.ms===ms){x.live=false;x.f();}};
  const move=(v)=>{slider.value=v;slider.handlers.input();};
  let n=posts().length;
  pointer('pointerdown');move('60');assert.equal(value.textContent,'60 %','the thumb follows the finger');assert.equal(posts().length,n,'nothing sent while the finger is down');
  move('65');pointer('pointercancel');assert.equal(slider.value,'5');assert.equal(value.textContent,'5 %','vertical swipe: the level is put back');
  move('40');assert.equal(slider.value,'5','a late input of the cancelled gesture is undone');
  pointer('pointerup');flushTimers(0);assert.equal(posts().length,n,'a vertical swipe sends no level');
  flushTimers(500);
  // The other order: the late input first, then the cancel.
  pointer('pointerdown');move('30');move('35');pointer('pointercancel');flushTimers(0);flushTimers(500);assert.equal(slider.value,'5');assert.equal(posts().length,n);
  // Horizontal drag or a deliberate tap: one level, sent once on release.
  pointer('pointerdown');move('20');move('30');move('45');assert.equal(posts().length,n);
  pointer('pointerup');assert.equal(posts().length,n,'settled after the release events');flushTimers(0);
  assert.equal(posts().length,n+1);assert.deepEqual(JSON.parse(posts().at(-1).body),{percent:45});answer(200,{available:true,writable:true,percent:45});
  pointer('pointerdown');pointer('pointerup');flushTimers(0);assert.equal(posts().length,n+1,'a tap on the current level sends nothing');
  // An answer arriving during the gesture never moves the thumb under the finger.
  up.click();n=posts().length;pointer('pointerdown');move('70');answer(200,{available:true,writable:true,percent:55});
  assert.equal(slider.value,'70');pointer('pointerup');flushTimers(0);assert.deepEqual(JSON.parse(posts().at(-1).body),{percent:70});answer(200,{available:true,writable:true,percent:70});
  // A gesture interrupted by a tab change is not a setting.
  n=posts().length;pointer('pointerdown');move('90');handlers['cnc-settings-tab']({detail:'machine'});assert.equal(slider.value,'70');
  pointer('pointerup');flushTimers(0);assert.equal(posts().length,n,'nothing sent after leaving the tab');
  // Mouse and keyboard keep the live setting.
  pointer('pointerdown','mouse',1);move('75');assert.equal(posts().length,n+1,'mouse: sent at once');answer(200,{available:true,writable:true,percent:75});
  pointer('pointerdown');pointer('pointercancel');slider.handlers.keydown();move('80');assert.equal(posts().length,n+2,'keyboard right after a cancelled touch: sent');answer(200,{available:true,writable:true,percent:80});
  slider.value='5';slider.handlers.input();answer(200,{available:true,writable:true,percent:5});
  // A screen change or a hidden page also ends the gesture: nothing sent on the release.
  for(const leave of [()=>handlers['cnc-screen-change'](),()=>document.handlers.visibilitychange()]){
    n=posts().length;pointer('pointerdown');move('90');leave();assert.equal(slider.value,'5','the gesture is dropped');
    answer(200,{available:true,writable:true,percent:5});pointer('pointerup');flushTimers(0);assert.equal(posts().length,n,'nothing sent after leaving');
  }
  // A cancelled gesture while a request is refused: once the gesture ends the confirmed level is shown
  // again, so the next + starts from it (50 → 60, not 70).
  slider.value='50';slider.handlers.input();answer(200,{available:true,writable:true,percent:50});
  up.click();assert.deepEqual(JSON.parse(posts().at(-1).body),{percent:60});
  pointer('pointerdown');pointer('pointercancel');answer(409,{message:'refusé'});
  assert.equal(requests.at(-1).method,'GET');answer(200,{available:true,writable:true,percent:50});
  assert.equal(slider.value,'60','held back while the gesture is absorbed');
  flushTimers(500);assert.equal(slider.value,'50','the confirmed level once the gesture ends');assert.equal(value.textContent,'50 %');
  up.click();assert.deepEqual(JSON.parse(posts().at(-1).body),{percent:60},'the next + starts from the confirmed level');answer(200,{available:true,writable:true,percent:60});
  // Same for a tap without change.
  up.click();pointer('pointerdown');pointer('pointerup');answer(409,{message:'refusé'});answer(200,{available:true,writable:true,percent:60});
  flushTimers(0);assert.equal(slider.value,'60','a tap without change shows the confirmed level');
  up.click();assert.deepEqual(JSON.parse(posts().at(-1).body),{percent:70});answer(200,{available:true,writable:true,percent:70});
  slider.value='5';slider.handlers.input();answer(200,{available:true,writable:true,percent:5});
}

// A refusal shows the reason and re-reads the status.
up.click();const before=requests.length;answer(409,{message:'Réglage refusé : le système ne permet pas à CNCjs de modifier la luminosité.'});
assert.match(status.textContent,/Réglage refusé/);assert.equal(requests.length,before+1);assert.equal(requests.at(-1).method,'GET');
answer(200,{available:true,writable:false,percent:5});
assert(slider.disabled&&up.disabled&&down.disabled);assert.match(status.textContent,/règle udev/);
const sent=posts().length;up.click();slider.handlers.input();assert.equal(posts().length,sent,'nothing is sent to a read-only panel');
// No panel at all.
handlers['cnc-settings-tab']({detail:'display'});answer(200,{available:false,writable:false,percent:null,minPercent:5});
assert.match(status.textContent,/Aucun rétroéclairage/);assert.equal(value.textContent,'—');
// Errors and session.
handlers['cnc-screen-change']();answer(404,{});assert.match(status.textContent,/ne gère pas/);
token='';handlers['cnc-screen-change']();assert.match(status.textContent,/Session CNCjs requise/);token='jwt';
// Hidden page: no read.
document.hidden=true;const n=requests.length;document.handlers.visibilitychange();assert.equal(requests.length,n);document.hidden=false;
// Screen saver: off by default, minimum, or unchanged; the operator level comes back on wake.
const saver=v=>handlers['cnc-screen-saver-sleep']({detail:v});
handlers['cnc-screen-change']();answer(200,{available:true,writable:true,percent:60,userPercent:60,temporary:false});
let mark=requests.length;saver(true);
assert.equal(requests.length,mark+1);assert.deepEqual(JSON.parse(requests.at(-1).body),{percent:0,temporary:true});
saver(false);assert.equal(requests.length,mark+1,'the wake waits for the dim answer');
answer(200,{percent:0,userPercent:60,temporary:true});
assert.deepEqual(JSON.parse(requests.at(-1).body),{wake:true});answer(200,{percent:60,userPercent:60,temporary:false});
assert.equal(slider.value,'60','a temporary level never reaches the slider');
saver(false);assert.equal(requests.length,mark+2,'no wake without a dim');
select.value='min';select.handlers.change();assert.deepEqual(JSON.parse(storage.get('cncjs-touch-backlight-v1')),{sleep:'min'});
saver(true);assert.deepEqual(JSON.parse(requests.at(-1).body),{percent:5,temporary:true});answer(200,{});saver(false);answer(200,{});
// A failed wake is retried (2 s later, then on the next touch) until the server confirms it.
saver(true);answer(200,{});saver(false);mark=requests.length;answer(0,null);
const retry=timers.filter(x=>x.live).at(-1);assert.equal(retry.ms,2000);retry.live=false;retry.f();
assert.equal(requests.length,mark+1);assert.deepEqual(JSON.parse(requests.at(-1).body),{wake:true});answer(200,{});
mark=requests.length;document.handlers.pointerdown();assert.equal(requests.length,mark,'nothing more once confirmed');
saver(true);answer(200,{});saver(false);for(let i=0;i<5;i++){answer(0,null);const t=timers.filter(x=>x.live).at(-1);t.live=false;t.f();}
answer(0,null);assert(!timers.some(x=>x.live),'five automatic tries at most');
mark=requests.length;document.handlers.pointerdown();assert.equal(requests.length,mark+1,'then the next touch tries again');answer(200,{});
// A host without a controllable backlight (409/404) or a lost session (401/403) is not retried on every touch.
for(const code of [401,403,404,409]){
  saver(true);answer(200,{});saver(false);answer(code,{message:'refusé'});
  mark=requests.length;document.handlers.pointerdown();document.handlers.pointerdown();assert.equal(requests.length,mark,'no wake retry after '+code);
}
select.value='keep';select.handlers.change();mark=requests.length;saver(true);saver(false);assert.equal(requests.length,mark,'unchanged: nothing sent');
select.value='bogus';select.handlers.change();assert.deepEqual(JSON.parse(storage.get('cncjs-touch-backlight-v1')),{sleep:'keep'});
// A read-only panel is left alone.
select.value='off';select.handlers.change();handlers['cnc-screen-change']();answer(200,{available:true,writable:false,percent:60});
mark=requests.length;saver(true);assert.equal(requests.length,mark);
// Affichage tab: the card goes just before the screen sleep card (the footer is only the fallback above).
{
  const d=require('./dom-fixture.cjs').createDOM(['menu']),p=d.node('screen-settings'),sleep=d.element('div'),foot=d.element('div');
  sleep.className='card ks-display-sleep';foot.className='wide ks-display-footer';p.appendChild(sleep);p.appendChild(foot);
  p.querySelector=sel=>sel==='.ks-display-sleep'?sleep:sel==='.ks-display-footer'?foot:null;
  vm.runInNewContext(fs.readFileSync(__dirname+'/touch/backlight.js','utf8'),{...context,document:d.document,window:{addEventListener(){},cncState:window.cncState}});
  assert.deepEqual(p.children.map(c=>c.id||c.className),['ks-backlight','card ks-display-sleep','wide ks-display-footer'],'brightness before the screen sleep card');
}
for(const name of ['index.html','simulation.html']){
  const html=fs.readFileSync(__dirname+'/touch/'+name,'utf8');
  assert.equal((html.match(/src="backlight\.js/g)||[]).length,1);
  assert(html.indexOf('display-settings.js')<html.indexOf('backlight.js'),'the settings cards exist before the brightness card');
}
// Settings scroll guards (Surface 2026-11): a vertical swipe that starts on the slider scrolls the list
// (pan-y, never none), the native main scrollbar is moved by the compositor (the WebKit one was repainted
// at every scroll update, measured before/after with a 4x CPU slowdown), and the tablet diagnostic spans its card.
{
  const shell=fs.readFileSync(__dirname+'/touch/touch-shell.css','utf8'),list=fs.readFileSync(__dirname+'/touch/settings-list.css','utf8');
  assert.match(shell,/\.ks-backlight-slider\{[^}]*touch-action:pan-y/,'the slider lets a vertical swipe scroll');
  assert.match(list,/(^|\n)main\{scrollbar-width:thin;scrollbar-color:var\(--line-strong\) transparent\}/,'native thin scrollbar on main');
  assert.match(list,/#ks-performance-card>\.ks-diagnostic\{grid-column:1\/-1\}/,'the diagnostic spans the performance card');
}
console.log('PASS backlight: shown-only reads, one request at a time with the last value winning, steps and minimum, read-only and missing panels.');
