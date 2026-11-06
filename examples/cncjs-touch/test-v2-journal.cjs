'use strict';
// L6 Journal under Performance v2: chronological list, touch filters, detail on the right,
// contextual opening from a curve marker and return to Suivi, read only. Real L0 contract and
// L3 journal model (performance-journal-context.js) in a VM; RT/v1 behaviour unchanged.
const assert=require('assert').strict;
const {l6Page,find,all,text}=require('./test-v2-settings.cjs');
const flush=()=>new Promise(setImmediate);
const m={port:'A',generation:'g1',revision:1,name:'piece.nc',originalName:'piece.nc',fingerprint:'sha:a',fresh:true,activeState:'Idle',workflow:'idle',loading:false};
const identity={role:'loaded',file:'piece.nc',fingerprint:'sha:a',controller:'A',generation:'g1',revision:1};
function journalPage(o={}){
  const p=l6Page(Object.assign({eligible:true,screens:['history'],active:'history'},o));
  p.run('download-file.js');p.run('session-journal.js');p.run('real-history.js');return p;
}
function timeline(p){
  p.status(m);p.advance(60000);
  p.status(m,{feedbackState:'sent',feedback:'Demande envoyée…'});p.advance(500);
  p.status(m,{feedbackState:'confirmed',feedback:'Démarrage accepté.'});p.advance(500);
  p.status({...m,activeState:'Run',workflow:'running'},{feedbackState:'confirmed',feedback:'Démarrage accepté.'});p.advance(500);
  p.status({...m,activeState:'Run',workflow:'running'},{feedbackState:'failed',feedback:'Refusé : un autre appareil pilote.'});p.advance(500);
  p.status({...m,activeState:'Run',workflow:'running'},{feedbackState:'uncertain',feedback:'Connexion perdue ou réponse incertaine.'});p.advance(120000);
  p.status({...m,fresh:false});
}
(async()=>{
  // RT / v1: no command entries, no frame, no v2 element; the v1 journal is untouched.
  {
    const p=journalPage({eligible:false,noV2:true});p.show('history');timeline(p);
    const report=p.window.cncSessionJournal;assert(report);
    assert.equal(p.frames.size,0,'v1 journal requests no frame');
    assert.equal(find(p.node('screen-history'),'v2j-list'),null);
    assert.equal(p.node('screen-history').getAttribute('data-v2-presenter'),null);
    assert(!text(p.node('real-history-list')).includes('Demande envoyée'),'v1 journal records no command feedback');
  }
  const p=journalPage();timeline(p);
  // Handlers do not render; the mount is filled in a frame, only on the visible Journal.
  p.open();const content=p.mount('history').content;assert.equal(content.children.length,0);
  p.show('history');assert.equal(content.children.length,0,'no rendering in an event handler');
  p.frame();assert.equal(content.hidden,false);assert.equal(p.node('screen-history').getAttribute('data-v2-presenter'),'on');
  const list=find(content,'v2j-list'),detail=find(content,'v2j-detail'),rows=()=>list.children.filter(li=>li.getAttribute('data-id'));
  // Commands captured before perf-v2 was drawn are not invented; capture starts with the v2 layout.
  assert(!rows().some(r=>r.getAttribute('data-category')==='command'),'no command feedback recorded before the v2 layout');
  // Fresh page with the v2 layout from the start: the same timeline is recorded.
  const q=journalPage();q.open();timeline(q);q.show('history');q.frame();
  const qc=q.mount('history').content,qlist=find(qc,'v2j-list'),qrows=()=>qlist.children.filter(li=>li.getAttribute('data-id'));
  assert.equal(qrows().length,12,'session, report and command events: '+qrows().map(r=>r.textContent).join(' | '));
  const times=qrows().map(r=>Number(r.getAttribute('data-at')));assert.deepEqual(times,[...times].sort((a,b)=>a-b),'chronological order');
  const states=qrows().filter(r=>r.getAttribute('data-category')==='command').map(r=>r.getAttribute('data-state'));
  assert.deepEqual(states,['sent','confirmed','refused','uncertain'],'sent/confirmed/refused/uncertain stay distinct');
  assert.match(text(qlist),/Envoyée/);assert.match(text(qlist),/Confirmée/);assert.match(text(qlist),/Refusée/);assert.match(text(qlist),/Incertaine/);
  // Touch filters: command, state, connection.
  const filter=k=>all(qc).find(e=>e.getAttribute&&e.getAttribute('data-v2j-filter')===k);
  assert.deepEqual(['all','command','state','connection'].map(k=>filter(k).textContent),['Tous','Commande','État','Connexion']);
  filter('command').click();assert.equal(qrows().length,12,'filter applies in the next frame');q.frame();
  assert.equal(qrows().length,4);assert.equal(filter('command').getAttribute('aria-pressed'),'true');
  filter('connection').click();q.frame();assert.equal(qrows().length,3);
  filter('state').click();q.frame();assert.equal(qrows().length,5);
  filter('all').click();q.frame();
  // Detail on the right: origin, state meaning, program; read only, no replay.
  const refused=qrows().find(r=>r.getAttribute('data-state')==='refused');
  all(refused).find(e=>e.tagName==='BUTTON').click();q.frame();
  const qd=find(qc,'v2j-detail');assert.match(text(qd),/Refusé : un autre appareil pilote/);assert.match(text(qd),/Appareil/);
  assert.match(text(qd),/piece\.nc/);assert.match(text(qd),/Lecture seule/);
  const confirmed=qrows().find(r=>r.getAttribute('data-category')==='command'&&r.getAttribute('data-state')==='confirmed');all(confirmed).find(e=>e.tagName==='BUTTON').click();q.frame();
  assert.match(text(qd),/ne prouve pas/,'confirmation is not machine execution');
  assert.equal(all(qd).filter(e=>e.tagName==='BUTTON').length,0,'no action in the detail');
  assert(!/rejouer|replay|renvoyer/i.test(text(qc)),'no replay control');
  assert(!q.calls.some(c=>c[0]==='jobControls'||c[0]==='xhr'),'reading the journal sends nothing');
  // Contextual opening from a curve marker: interval and program, then return to Suivi.
  const navigations=[],returns=[];
  q.window.addEventListener('cnc-navigate',e=>navigations.push(e.detail));q.window.addEventListener('cnc-v2-journal-return',e=>returns.push(e.detail));
  q.show('home');
  q.emit('cnc-v2-journal-open',{marker:{identity,interval:{fromMonoMs:61000,toMonoMs:63000}},view:{camera:'saved'}});
  assert.deepEqual(navigations,['history'],'opens Journal');q.show('history');q.frame();
  assert.equal(qrows().length,6,'events of that program within the marker interval (±30 s)');
  assert.match(find(qc,'v2j-context').textContent,/piece\.nc/);
  assert(qrows().every(r=>{const at=Number(r.getAttribute('data-at'));return at>=31000&&at<=93000;}));
  const back=find(qc,'v2j-back');assert.equal(back.hidden,false);
  back.click();assert.deepEqual(navigations,['history','home']);assert.equal(JSON.stringify(returns),'[{"view":{"camera":"saved"}}]','Suivi receives its saved view');
  q.show('history');q.frame();assert.equal(qrows().length,12,'the context ends with the return');assert.equal(find(qc,'v2j-back').hidden,true);
  // Missing context: another program, or no interval: « Aucun événement conservé ».
  for(const marker of [{identity:{...identity,fingerprint:'sha:other'},interval:{fromMonoMs:61000,toMonoMs:63000}},{identity,interval:null},null]){
    q.emit('cnc-v2-journal-open',{marker});q.show('history');q.frame();
    assert.equal(qrows().length,0);assert.match(text(qlist),/Aucun événement conservé/);
  }
  find(qc,'v2j-all').click();q.frame();assert.equal(qrows().length,12);
  // Hidden Journal: new events do not paint until it is shown again.
  q.show('home');q.status({...m,activeState:'Hold',workflow:'paused'});q.frame();assert.equal(qrows().length,12);
  q.show('history');q.frame();assert.equal(qrows().length,16,'availability back, state, file and workflow');
  // Server history stays read-only, read on demand, labelled as its own source.
  q.window.localStorage.values.set('cnc',JSON.stringify({state:{session:{token:'T'}}}));
  find(qc,'v2j-source-server').click();q.frame();
  const xhr=q.window.sent.at(-1);assert.match(xhr.url,/\/touch-history\?limit=/);
  xhr.status=200;xhr.responseText=JSON.stringify({entries:[{seq:9,event:'start',at:'2026-11-06T10:00:00Z',program:'piece.nc'},{seq:8,event:'alarm',code:2,at:'2026-11-06T09:59:00Z'}],total:2,more:false});xhr.onload();
  q.frame();assert.equal(qrows().length,2);assert.match(text(qlist),/Serveur CNCjs/);assert.match(text(qlist),/Travail démarré/);
  find(qc,'v2j-source-session').click();q.frame();assert.equal(qrows().length,16);
  // Eco / GPU loss: the presenter is released; nothing repaints, nothing moves.
  q.st.open=false;q.emit('cnc-v2-change',q.base.state());q.status({...m,activeState:'Idle',workflow:'idle'});q.frame();
  assert.equal(qrows().length,16);assert.equal(qc.hidden,false);
  await flush();
  console.log('PASS v2 journal: chronological list, command/state/connection filters, distinct sent/confirmed/refused/uncertain, detail without replay, contextual opening and return to Suivi, missing context, hidden screen, server source, release; RT unchanged.');
})().catch(e=>{console.error(e);process.exitCode=1;});
