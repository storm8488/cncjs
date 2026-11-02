'use strict';
// Honest action feedback and system commands (audit 31, U7 and A3 client side): a command
// says "sent" until the server answers, then confirmed / failed / uncertain (no answer is
// not a refusal); the state is relayed to Suivi; a snapshot carrying `systemCommand` shows
// a status line, reaches the store and disables the tablet actions; Stop is never delayed
// by a pending command. job-controls.js and job-dashboard.js on a synthetic DOM, no network.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
async function fixture(){
 const nodes={},events={},calls=[];let now=100000,answer=null;
 const doc={hidden:false,activeElement:null};
 const node=id=>nodes[id]||(nodes[id]={id,tagName:'DIV',hidden:false,inert:false,isConnected:true,disabled:false,value:'',textContent:'',handlers:{},attrs:{},
  addEventListener(n,f){this.handlers[n]=f;},removeEventListener(n){delete this.handlers[n];},
  appendChild(){},insertBefore(){},setAttribute(k,v){this.attrs[k]=String(v);},getAttribute(k){return k in this.attrs?this.attrs[k]:null;},
  getClientRects(){return this.hidden?[]:[{}];},focus(){doc.activeElement=this;},contains(){return false;},
  click(){if(!this.disabled&&this.handlers.click)this.handlers.click.call(this,{});}});
 const on=(name,fn)=>(events[name]||(events[name]=[])).push(fn);
 const created=[];
 Object.assign(doc,{body:{children:[node('main'),node('job-dialog')],getAttribute:()=>null,appendChild(n){created.push(n);}},
  querySelector:()=>node('panel'),querySelectorAll:()=>[node('job-dialog')],getElementById:node,createElement:tag=>{const n=node('created-'+created.length+'-'+tag);n.tagName=tag.toUpperCase();return n;},
  addEventListener:on,removeEventListener(n,f){events[n]=(events[n]||[]).filter(x=>x!==f);}});
 node('job-dialog').hidden=true;
 const machine={port:'A',type:'Grbl',generation:'g1',revision:1,name:'leaf.nc',fresh:true,statusAgeMs:0,activeState:'Idle',workflow:'idle',canLoad:true,canStart:true,canResume:false,canPause:false,canStop:true};
 const snapshot=extra=>Object.assign({controllers:[Object.assign({},machine)]},extra||{});
 // Simulation transport: GET answers at once; POST waits for the test to answer or fail.
 const sim={request(method,body){if(method==='GET')return Promise.resolve(snapshot());calls.push(body);return new Promise((resolve,reject)=>{answer={resolve,reject};});}};
 const statuses=[];
 const win={cncJobSimulation:sim,addEventListener:on,removeEventListener:doc.removeEventListener,dispatchEvent(e){if(e.type==='cnc-job-status')statuses.push(e.detail);(events[e.type]||[]).forEach(f=>f(e));}};
 const ctx={window:win,document:doc,Date:{now:()=>now},Promise,CustomEvent:function(type,o){this.type=type;this.detail=o&&o.detail;},setInterval:()=>1,clearInterval(){},XMLHttpRequest(){throw Error('No network permitted');}};
 vm.runInNewContext(fs.readFileSync(__dirname+'/touch/job-controls.js','utf8'),ctx);
 const flush=()=>new Promise(setImmediate);await flush();
 return {node,doc,win,machine,calls,events,statuses,created,flush,snapshot,answer:()=>answer,advance:ms=>{now+=ms;}};
}
(async()=>{
 const f=await fixture();
 const line=f.created.find(n=>n.id&&n.id==='t-system-command')||f.node('t-system-command');
 assert(f.created.some(n=>n.attrs.role==='status'||n.id==='t-system-command'),'a status line for system commands is created');
 const fb=f.node('job-feedback');
 // Pause: sent, then confirmed with the server's message.
 f.machine.workflow='running';f.machine.canPause=true;f.machine.canStart=false;f.win.cncJobControls.refresh();await f.flush();
 f.node('job-pause').click();await f.flush();
 assert.equal(fb.textContent,'Demande envoyée…');assert.equal(fb.getAttribute('data-state'),'sent');
 assert.equal(f.statuses.at(-1).feedbackState,'sent','Suivi is told the request is on its way');
 f.answer().resolve({message:'Pause demandée.'});await f.flush();
 assert.equal(fb.textContent,'Pause demandée.');assert.equal(fb.getAttribute('data-state'),'confirmed');assert.equal(f.statuses.at(-1).feedbackState,'confirmed');
 // A refusal is a failure with the server's reason.
 f.node('job-pause').click();await f.flush();assert.equal(fb.getAttribute('data-state'),'sent');
 f.answer().reject(new Error('Travail déjà en pause.'));await f.flush();
 assert.equal(fb.textContent,'Travail déjà en pause.');assert.equal(fb.getAttribute('data-state'),'failed');
 // No answer (network error or timeout) is uncertain, never shown as a refusal.
 f.node('job-pause').click();await f.flush();const lost=new Error('Connexion perdue ou réponse incertaine.');lost.uncertain=true;f.answer().reject(lost);await f.flush();
 assert.equal(fb.getAttribute('data-state'),'uncertain');assert.match(fb.textContent,/incertaine/);
 // Stop is accepted while another command is pending: it is never delayed by the busy flag.
 f.node('job-pause').click();await f.flush();const pendingPause=f.answer();
 assert.equal(f.node('job-stop').disabled,false,'Stop stays enabled while a command is pending');
 f.node('job-stop').click();await f.flush();assert.equal(f.calls.at(-1).action,'stop');
 f.answer().resolve({message:'Arrêt demandé.'});await f.flush();pendingPause.resolve({message:'Pause (ancienne réponse).'});await f.flush();
 assert.equal(fb.textContent,'Arrêt demandé.','an older answer never overwrites a newer one');assert.equal(fb.getAttribute('data-state'),'confirmed');
 // Double tap on Start: busy blocks the second prepare until the first is answered.
 f.machine.workflow='idle';f.machine.canPause=false;f.machine.canStart=true;f.win.cncJobControls.refresh();await f.flush();
 const before=f.calls.length;f.node('job-start').click();await f.flush();f.node('job-start').click();await f.flush();
 assert.equal(f.calls.length,before+1,'one prepare for two taps');assert.equal(f.node('job-start').disabled,true);
 f.answer().reject(new Error('Refusé.'));await f.flush();
 // System command in the snapshot: status line, store detail, cleared when it ends.
 const feed=f.events['cnc-job-status']||[];
 f.win.cncJobControls.refresh();await f.flush();
 // Inject a snapshot with a system command through the simulation transport.
 const sysSnapshot=f.snapshot({systemCommand:{title:'Redémarrer la tablette',since:now()}});
 function now(){return 123;}
 const simRequest=f.win.cncJobSimulation.request;f.win.cncJobSimulation.request=method=>method==='GET'?Promise.resolve(sysSnapshot):simRequest(method);
 f.win.cncJobControls.refresh();await f.flush();
 const detail=f.statuses.at(-1);assert.deepEqual(detail.systemCommand,{title:'Redémarrer la tablette',since:123});
 const status=f.created.find(n=>n.textContent==='Commande système en cours : Redémarrer la tablette');assert(status&&!status.hidden,'status line shows the running command');
 assert.equal(status.attrs.role,'status');
 f.win.cncJobSimulation.request=method=>method==='GET'?Promise.resolve(f.snapshot({systemCommand:null})):simRequest(method);
 f.win.cncJobControls.refresh();await f.flush();assert.equal(f.statuses.at(-1).systemCommand,null);assert(status.hidden,'line hidden when the command ends');
 // Malformed values are ignored.
 f.win.cncJobSimulation.request=method=>method==='GET'?Promise.resolve(f.snapshot({systemCommand:{title:42}})):simRequest(method);
 f.win.cncJobControls.refresh();await f.flush();assert.equal(f.statuses.at(-1).systemCommand,null);
 // Tablet actions: disabled with the reason while a system command runs (store relay).
 {
  const {document,node,element}=require('./dom-fixture.cjs').createDOM(['settings']);
  const panel=node('screen-settings'),section=node('ks-system');section.appendChild(element('p'));panel.setAttribute('data-settings-tab','system');
  let systemCommand=null;const handlers={},requests=[];
  const window={addEventListener:(n,f)=>handlers[n]=f,cncState:{get:()=>({apiBase:'/api',machine:{workflow:'idle'},systemCommand})}};
  function XHR(){this.headers={};requests.push(this);}XHR.prototype.open=function(m,u){this.method=m;this.url=u;};XHR.prototype.setRequestHeader=function(){};XHR.prototype.send=function(){};
  vm.runInNewContext(fs.readFileSync(__dirname+'/touch/tablet-actions.js','utf8'),{window,document,XMLHttpRequest:XHR,Date:Object.assign(function(v){return new Date(v);},{now:()=>1e12}),localStorage:{getItem:()=>JSON.stringify({state:{session:{token:'jwt'}}})},setTimeout:()=>1,clearTimeout(){}});
  handlers['cnc-settings-tab']({detail:'system'});
  const list=requests.find(r=>r.url==='/api/commands');list.status=200;list.responseText=JSON.stringify({records:[{id:'r1',title:'Redémarrer',enabled:true}]});list.onload();
  const box=section.children[0],[,,,buttons,status]=box.children;const button=buttons.children[0];
  assert(!button.disabled);
  systemCommand={title:'Mise à jour',since:1};handlers['cnc-job-status']();
  assert(button.disabled,'disabled while a system command runs');assert.equal(status.textContent,'Commande système en cours : Mise à jour');
  const posts=requests.length;button.click();assert.equal(requests.length,posts,'nothing sent while one runs');
  systemCommand=null;handlers['cnc-job-status']();assert(!button.disabled);
  // 401 is a session problem; 403 and 409 show the server's message; 403 without one says disabled.
  const run=code=>{button.click();button.click();const g=requests.at(-1);g.status=200;g.responseText=JSON.stringify({controllers:[]});g.onload();const p=requests.at(-1);assert.equal(p.method,'POST');p.status=code.status;p.responseText=JSON.stringify(code.body||{});p.onload();return status.textContent;};
  assert.match(run({status:401}),/Session CNCjs requise/);
  assert.equal(run({status:403,body:{message:'Commande désactivée.'}}),'Commande désactivée.');
  assert.equal(run({status:409,body:{message:'Commande système déjà en cours (Mise à jour).'}}),'Commande système déjà en cours (Mise à jour).');
  assert.equal(run({status:403}),'Commande désactivée dans CNCjs.');
 }
 // Suivi mirrors the state on its own feedback line.
 {
  const listeners={};const {document,node}=require('./dom-fixture.cjs').createDOM(['home']);
  vm.runInNewContext(fs.readFileSync(__dirname+'/touch/job-dashboard.js','utf8'),{document,window:{addEventListener:(n,f)=>listeners[n]=f},Date:{now:()=>1e12},localStorage:{getItem:()=>null},XMLHttpRequest:function(){throw Error('no network');}});
  listeners['cnc-job-status']({detail:{machine:null,simulation:false,feedback:'Demande envoyée…',feedbackState:'sent'}});
  assert.equal(node('home-job-feedback').getAttribute('data-state'),'sent');assert.equal(node('home-job-feedback').textContent,'Demande envoyée…');
  listeners['cnc-job-status']({detail:{machine:null,simulation:false,feedback:'Arrêt demandé.',feedbackState:'confirmed'}});assert.equal(node('home-job-feedback').getAttribute('data-state'),'confirmed');
 }
 console.log('PASS action feedback: sent → confirmed / failed / uncertain, old answers ignored, Stop never delayed, one prepare per double tap, system command line and store relay, tablet actions disabled with 401/403/409 told apart, Suivi mirror.');
})().catch(e=>{console.error(e);process.exit(1);});
