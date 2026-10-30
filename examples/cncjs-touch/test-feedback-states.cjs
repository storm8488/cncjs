'use strict';
// Audit 31 cross-check (U7, job-controls.js): the feedback dot (data-state) must always
// match the feedback text. Scenarios the author's test does not cover: a confirmation
// cancelled by a stream drop and an expired confirmation keep the previous "confirmed"
// state; run() rejecting at once gives "failed"; a lost answer gives "uncertain" and nothing
// is replayed; Stop goes out while a prepare is pending. Same synthetic DOM as
// test-action-feedback.cjs, no network.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
async function fixture(){
 const nodes={},events={},calls=[];let now=100000,answer=null,getFails=false;
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
 const machine={port:'A',type:'Grbl',generation:'g1',revision:1,name:'leaf.nc',fresh:true,statusAgeMs:0,activeState:'Idle',workflow:'idle',canLoad:true,canStart:true,canResume:false,canPause:false,canStop:true,canOverride:true};
 const snapshot=extra=>Object.assign({controllers:[Object.assign({},machine)]},extra||{});
 const sim={request(method,body){if(method==='GET')return getFails?Promise.reject(new Error('Flux coupé.')):Promise.resolve(snapshot());calls.push(body);return new Promise((resolve,reject)=>{answer={resolve,reject};});}};
 const statuses=[];
 const win={cncJobSimulation:sim,addEventListener:on,removeEventListener:doc.removeEventListener,dispatchEvent(e){if(e.type==='cnc-job-status')statuses.push(e.detail);(events[e.type]||[]).forEach(f=>f(e));}};
 const ctx={window:win,document:doc,Date:{now:()=>now},Promise,CustomEvent:function(type,o){this.type=type;this.detail=o&&o.detail;},setInterval:()=>1,clearInterval(){},XMLHttpRequest(){throw Error('No network permitted');}};
 vm.runInNewContext(fs.readFileSync(__dirname+'/touch/job-controls.js','utf8'),ctx);
 const flush=()=>new Promise(setImmediate);await flush();
 return {node,doc,win,machine,calls,events,statuses,created,flush,snapshot,answer:()=>answer,advance:ms=>{now+=ms;},failGet:v=>{getFails=v;}};
}
const findings=[];
function expect(cond,label){if(!cond)findings.push(label);console.log((cond?'ok    ':'DEFECT')+' '+label);}
(async()=>{
 const f=await fixture(),fb=f.node('job-feedback');
 const state=()=>fb.getAttribute('data-state');
 // 1. Start: prepare answered, dialog open, state "confirmed"; then the stream drops while the ticket
 //    is open: the text says the confirmation was cancelled, the dot must not stay "confirmed".
 f.node('job-start').click();await f.flush();
 assert.equal(fb.textContent,'Demande envoyée…');assert.equal(state(),'sent');
 f.answer().resolve({nonce:'n1',expiresIn:15,name:'leaf.nc',message:'Confirmation prête.'});await f.flush();
 assert.equal(state(),'confirmed');assert.equal(f.node('job-dialog').hidden,false,'dialog opened');
 f.failGet(true);f.win.cncJobControls.refresh();await f.flush();
 assert.match(fb.textContent,/Confirmation annulée/);
 expect(state()!=='confirmed','after a stream drop cancels the ticket, the dot is no longer "confirmed" (text: "'+fb.textContent+'", data-state: "'+state()+'")');
 // Suivi's mirror (#home-job-feedback, job-dashboard.js) reads the published detail.
 expect(f.statuses.at(-1).feedbackState===state(),'the published detail carries the same state after the drop ('+f.statuses.at(-1).feedbackState+')');
 f.failGet(false);f.win.cncJobControls.refresh();await f.flush();
 // 2. Expired confirmation: prepare answered after the ticket window, the text says expired.
 f.node('job-start').click();await f.flush();assert.equal(state(),'sent');
 const pending=f.answer();f.advance(16000);
 // The machine must still look fresh for the prepare callback: refresh the snapshot first.
 f.win.cncJobControls.refresh();await f.flush();
 pending.resolve({nonce:'n2',expiresIn:15,name:'leaf.nc',message:'Confirmation prête.'});await f.flush();
 assert.match(fb.textContent,/Confirmation expirée/);
 expect(state()!=='confirmed','after "Confirmation expirée." the dot is no longer "confirmed" (data-state: "'+state()+'")');
 expect(f.statuses.at(-1).feedbackState===state()&&/Confirmation expirée/.test(f.statuses.at(-1).feedback),'the published detail carries the expired text and state at once ('+f.statuses.at(-1).feedbackState+')');
 // 3. run() rejects at once (stale state): "failed" with the message, nothing sent.
 const sent=f.calls.length;f.advance(5000);
 await f.win.cncJobControls.override('feed',10).catch(()=>{});await f.flush();
 expect(state()==='failed'&&/État indisponible/.test(fb.textContent)&&f.calls.length===sent,'run() rejected at once -> failed with its message, nothing sent (state '+state()+', text "'+fb.textContent+'", calls +'+(f.calls.length-sent)+')');
 f.win.cncJobControls.refresh();await f.flush();
 // 4. Lost answer on Start's confirmation: "uncertain", the ticket is consumed, nothing is replayed,
 //    the next Start needs a new prepare.
 f.node('job-start').click();await f.flush();f.answer().resolve({nonce:'n3',expiresIn:15,name:'leaf.nc',message:''});await f.flush();
 f.node('job-check').checked=true;f.node('job-check').handlers.change.call(f.node('job-check'),{});f.node('job-confirm').click();await f.flush();
 assert.equal(f.calls.at(-1).action,'start');assert.equal(state(),'sent');
 const before=f.calls.length;const lost=new Error('Connexion perdue ou réponse incertaine.');lost.uncertain=true;f.answer().reject(lost);await f.flush();
 f.advance(1000);f.win.cncJobControls.refresh();await f.flush();f.advance(1000);f.win.cncJobControls.refresh();await f.flush();
 expect(state()==='uncertain'&&f.calls.length===before,'lost answer to Start -> uncertain, no replay after two polls (calls +'+(f.calls.length-before)+')');
 expect(f.node('job-dialog').hidden===true,'the consumed ticket does not reopen the dialog');
 // 5. Stop goes out while a prepare is pending (busy): never delayed, never refused by busy.
 f.node('job-start').click();await f.flush();const prep=f.answer();
 assert.equal(f.node('job-start').disabled,true,'Start disabled while busy');
 f.node('job-stop').click();await f.flush();
 expect(f.calls.at(-1).action==='stop','Stop sent while a prepare is pending');
 f.answer().resolve({message:'Arrêt demandé.'});await f.flush();prep.reject(new Error('Refusé.'));await f.flush();
 expect(fb.textContent==='Arrêt demandé.'&&state()==='confirmed','the older prepare refusal does not overwrite the newer Stop answer');
 // 6. Second tap on Start during busy: no call, no text change.
 f.node('job-start').click();await f.flush();const n=f.calls.length,text=fb.textContent;
 f.node('job-start').click();f.node('job-start').handlers.click.call(f.node('job-start'),{});await f.flush();
 expect(f.calls.length===n&&fb.textContent===text,'second tap on Start while busy: no call, no text');
 f.answer().reject(new Error('Refusé.'));await f.flush();
 if(findings.length){console.error('\nxv-ui-feedback: '+findings.length+' finding(s):\n- '+findings.join('\n- '));process.exit(1);}
 console.log('PASS feedback states: the dot follows the text after a cancelled or expired confirmation, immediate refusal, lost answer without replay, Stop during a pending prepare, second tap ignored.');
})().catch(e=>{console.error(e);process.exit(1);});
