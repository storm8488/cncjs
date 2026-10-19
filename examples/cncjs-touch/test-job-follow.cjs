'use strict';
// Job follow-up: Suivi opens when a job starts (not when the page loads during
// one, not over a dialog or the commissioning assistant), optional lock at the
// start, summary at the end (finished / errors / stopped, duration without the
// pauses, lines), two switches kept in this browser. No command is ever sent.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
function fixture(saved){
  const {document,node,element}=require('./dom-fixture.cjs').createDOM(['home']);
  document.body.getAttribute=()=>null;
  const settings=node('screen-settings');settings.querySelector=()=>null;
  const feedback=node('home-job-feedback'),parent=element('div');parent.appendChild(feedback);
  let dialogs=[];document.querySelectorAll=()=>dialogs;
  const store=new Map(saved?[['cncjs-touch-job-follow-v1',saved]]:[]),listeners={},went=[],locks=[];let now=1e12;
  const window={cncI18n:{t:s=>s,locale:'fr-FR'},addEventListener:(n,f)=>listeners[n]=f,
    cncShell:{go:n=>went.push(n)},cncScreenLock:{lock:()=>locks.push(true)}};
  vm.runInNewContext(fs.readFileSync(__dirname+'/touch/job-follow.js','utf8'),{document,window,Date:{now:()=>now},
    localStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,v)},JSON,Math,Array,Object,String,Number});
  const summary=parent.children.find(c=>c.id==='home-job-summary');
  return {node,settings,store,listeners,went,locks,summary,set dialogs(v){dialogs=v;},
    advance:ms=>{now+=ms;},screen:n=>listeners['cnc-screen-change']({detail:n}),
    send:m=>listeners['cnc-job-status']({detail:{simulation:false,machine:m}})};
}
const M=p=>Object.assign({port:'A',fresh:true,workflow:'idle',activeState:'Idle',name:'a--touch-1.nc',originalName:'Support.nc',total:0,received:0},p);
let f=fixture();
assert(f.summary&&f.summary.hidden,'the summary sits after the job feedback, hidden');
// The page loads during a job: no jump, and the duration stays unknown.
f.screen('files');f.send(M({workflow:'running',total:100,received:10}));assert.deepEqual(f.went,[]);
f.send(M({workflow:'idle',finished:true}));assert(!f.summary.hidden);assert.match(f.summary.children[0].textContent,/^Travail terminé · Support\.nc · 100 lignes$/);
// A job started from the PC while Fichiers is shown: Suivi opens.
f=fixture();f.screen('files');f.send(M());f.send(M({workflow:'running',total:1200,received:5}));assert.deepEqual(f.went,['home']);assert.deepEqual(f.locks,[],'lock is off by default');
f.advance(30000);f.send(M({workflow:'paused',activeState:'Hold:0',total:1200,received:400}));
f.advance(60000);f.send(M({workflow:'running',total:1200,received:400}));
f.advance(45000);f.send(M({workflow:'idle',finished:true,total:1200,received:0}));
assert.equal(f.summary.getAttribute('data-tone'),'ok');
assert.equal(f.summary.children[0].textContent.replace(/[  ]/g,' '),'Travail terminé · Support.nc · durée 1 min 15 s · 1 200 lignes','the pause is not counted, lines come from the run');
f.summary.children[1].click();assert(f.summary.hidden);
// Stopped before the end; then a program with Grbl errors.
f.send(M({workflow:'running',total:50,received:1}));f.advance(5000);f.send(M({workflow:'running',total:50,received:20}));f.send(M({workflow:'idle'}));
assert(f.summary.hidden,'waits for the server result');f.advance(2500);f.send(M({workflow:'idle'}));
assert.equal(f.summary.getAttribute('data-tone'),'warn');assert.match(f.summary.children[0].textContent,/^Travail arrêté avant la fin · .* · 20 \/ 50 lignes$/);
f.send(M({workflow:'running',total:10,received:1}));assert(f.summary.hidden,'a new job hides the previous summary');
f.send(M({workflow:'idle',finishedWithErrors:true,jobErrors:2,jobLastError:'error:20'}));
assert.equal(f.summary.getAttribute('data-tone'),'danger');assert.match(f.summary.children[0].textContent,/Fin du programme avec des erreurs Grbl.*2 erreur\(s\) Grbl \(error:20\)/);
// A job started from the PC: the server does not mark it finished, every line acknowledged does.
f=fixture();f.send(M());f.send(M({workflow:'running',total:17,received:3}));f.send(M({workflow:'running',total:17,received:17}));
f.send(M({workflow:'idle',finished:false,total:17,received:0}));f.advance(2500);f.send(M({workflow:'idle',finished:false}));
assert.equal(f.summary.getAttribute('data-tone'),'ok');assert.match(f.summary.children[0].textContent,/^Travail terminé · .* · 17 lignes$/);
// Not over a dialog, not out of the commissioning assistant, not when already in Suivi.
f=fixture();f.screen('files');f.dialogs=[{hidden:false,getClientRects:()=>[{}]}];f.send(M());f.send(M({workflow:'running'}));assert.deepEqual(f.went,[]);
f=fixture();f.screen('commissioning');f.send(M());f.send(M({workflow:'running'}));assert.deepEqual(f.went,[]);
f=fixture();f.screen('home');f.send(M());f.send(M({workflow:'running'}));assert.deepEqual(f.went,[]);
// Switches: lock at the start on, Suivi off; kept in this browser.
f=fixture();const card=f.settings.children[0],[,,open,lock]=card.children;
assert.equal(open.getAttribute('aria-pressed'),'true');assert.equal(lock.getAttribute('aria-pressed'),'false');
open.click();lock.click();assert.deepEqual(JSON.parse(f.store.get('cncjs-touch-job-follow-v1')),{open:false,lock:true});
f.screen('files');f.send(M());f.send(M({workflow:'running'}));assert.deepEqual(f.went,[]);assert.deepEqual(f.locks,[true]);
f=fixture(JSON.stringify({open:false,lock:true}));assert.equal(f.settings.children[0].children[2].getAttribute('aria-pressed'),'false');
f=fixture('{broken');assert.equal(f.settings.children[0].children[2].getAttribute('aria-pressed'),'true','unreadable storage: defaults');
for(const name of ['index.html','simulation.html']){
  const html=fs.readFileSync(__dirname+'/touch/'+name,'utf8');
  assert.equal((html.match(/src="job-follow\.js\?v=/g)||[]).length,1);
  ['job-dashboard.js','touch-shell.js','screen-lock.js'].forEach(dep=>assert(html.indexOf(dep)<html.indexOf('job-follow.js'),dep+' loads first'));
}
console.log('PASS job follow-up: Suivi on a new job only, lock option, summary (finished, errors, stopped, pauses excluded), switches kept, script order.');
