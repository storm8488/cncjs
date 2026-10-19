'use strict';
// Screen lock: the padlock locks at once, unlocking takes two taps within 3 s,
// a shield covers the content while locked, the state is announced, and no
// inert attribute is touched (the screen saver and dialogs own it).
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const {document,node,element}=require('./dom-fixture.cjs').createDOM(['home']);
document.body.getAttribute=()=>null;
const classes=new Set();document.body.classList={toggle:(c,on)=>{if(on)classes.add(c);else classes.delete(c);},contains:c=>classes.has(c)};
const banner=node('real-banner'),right=element('div');right.className='t-strip-right';banner.appendChild(right);
banner.querySelector=sel=>sel==='.t-strip-right'?right:null;
const realCreate=document.createElement;
document.createElement=tag=>{const e=realCreate(tag);Object.defineProperty(e,'innerHTML',{set(){e._path={attributes:{},setAttribute(k,v){this.attributes[k]=v;}};},get(){return '';}});e.querySelector=()=>e._path;return e;};
const events=[],listeners={},timers=[];let now=1e12;
const window={cncI18n:{t:s=>s},addEventListener:(n,f)=>listeners[n]=f,dispatchEvent:e=>events.push(e.detail)};
vm.runInNewContext(fs.readFileSync(__dirname+'/touch/screen-lock.js','utf8'),{document,window,CustomEvent:function(type,o){this.type=type;this.detail=o.detail;},
  Date:{now:()=>now},setTimeout:(f,ms)=>{timers.push({f,ms,live:true});return timers.length;},clearTimeout:id=>{if(timers[id-1])timers[id-1].live=false;}});
const button=right.children[0],shield=document.body.children.find(c=>c.id==='t-lock-shield');
assert.equal(button.id,'t-lock');assert(shield&&shield.hidden);assert.equal(button.getAttribute('aria-pressed'),'false');
const main=node('main');main.inert=false;
button.click();
assert.equal(window.cncScreenLock.locked(),true);assert.equal(shield.hidden,false);assert(classes.has('is-locked'));
assert.deepEqual(events,[true]);assert.equal(button.getAttribute('aria-pressed'),'true');assert.equal(main.inert,false,'inert is never used');
// One tap is not enough; the arming expires after 3 s.
button.click();assert.equal(window.cncScreenLock.locked(),true);assert.equal(button.getAttribute('data-armed'),'true');
const arm=timers.filter(x=>x.live).at(-1);assert.equal(arm.ms,3000);now+=3001;arm.live=false;arm.f();
assert.equal(button.getAttribute('data-armed'),'false');
button.click();now+=4000;button.click();assert.equal(window.cncScreenLock.locked(),true,'a second tap after 3 s only arms again');
now+=1000;button.click();assert.equal(window.cncScreenLock.locked(),false);assert(shield.hidden);assert(!classes.has('is-locked'));
assert.deepEqual(events,[true,false]);
// The API used by the job follow-up.
window.cncScreenLock.lock();window.cncScreenLock.lock();assert.deepEqual(events,[true,false,true],'locking twice announces once');
window.cncScreenLock.unlock();assert.equal(window.cncScreenLock.locked(),false);
// A tap on the shield flashes the padlock.
window.cncScreenLock.lock();shield.click();assert.equal(button.getAttribute('data-flash'),'true');timers.filter(x=>x.live&&x.ms===600).forEach(x=>x.f());assert.equal(button.getAttribute('data-flash'),'false');
for(const name of ['index.html','simulation.html']){
  const html=fs.readFileSync(__dirname+'/touch/'+name,'utf8');
  assert.equal((html.match(/src="screen-lock\.js\?v=/g)||[]).length,1);
  assert(html.indexOf('touch-shell.js')<html.indexOf('screen-lock.js'),'the header group exists first');
}
console.log('PASS screen lock: immediate lock, two-tap unlock within 3 s, shield, announcement, no inert, script order.');
