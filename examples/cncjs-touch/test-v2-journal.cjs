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
    assert.equal(find(p.node('screen-history'),'v2k-list'),null);
    assert.equal(p.node('screen-history').getAttribute('data-v2-presenter'),null);
    assert(!text(p.node('real-history-list')).includes('Demande envoyée'),'v1 journal records no command feedback');
  }
  const p=journalPage();timeline(p);
  // Handlers do not render; the mount is filled in a frame, only on the visible Journal.
  p.open();const content=p.mount('history').content;assert.equal(content.children.length,0);
  p.show('history');assert.equal(content.children.length,0,'no rendering in an event handler');
  p.frame();assert.equal(content.hidden,false);assert.equal(p.node('screen-history').getAttribute('data-v2-presenter'),'on');
  const list=find(content,'v2k-list'),detail=find(content,'v2k-detail'),rows=()=>list.children.filter(li=>li.getAttribute('data-id'));
  // Commands captured before perf-v2 was drawn are not invented; capture starts with the v2 layout.
  assert(!rows().some(r=>r.getAttribute('data-category')==='command'),'no command feedback recorded before the v2 layout');
  // Fresh page with the v2 layout from the start: the same timeline is recorded.
  const q=journalPage();q.open();timeline(q);q.show('history');q.frame();
  const qc=q.mount('history').content,qlist=find(qc,'v2k-list'),qrows=()=>qlist.children.filter(li=>li.getAttribute('data-id'));
  assert.equal(qrows().length,12,'session, report and command events: '+qrows().map(r=>r.textContent).join(' | '));
  const times=qrows().map(r=>Number(r.getAttribute('data-at')));assert.deepEqual(times,[...times].sort((a,b)=>a-b),'chronological order');
  const states=qrows().filter(r=>r.getAttribute('data-category')==='command').map(r=>r.getAttribute('data-state'));
  assert.deepEqual(states,['sent','confirmed','refused','uncertain'],'sent/confirmed/refused/uncertain stay distinct');
  assert.match(text(qlist),/Envoyée/);assert.match(text(qlist),/Confirmée/);assert.match(text(qlist),/Refusée/);assert.match(text(qlist),/Incertaine/);
  // Touch filters: command, state, connection.
  const filter=k=>all(qc).find(e=>e.getAttribute&&e.getAttribute('data-v2k-filter')===k);
  assert.deepEqual(['all','command','state','connection'].map(k=>filter(k).textContent),['Tous','Commande','État','Connexion']);
  filter('command').click();assert.equal(qrows().length,12,'filter applies in the next frame');q.frame();
  assert.equal(qrows().length,4);assert.equal(filter('command').getAttribute('aria-pressed'),'true');
  filter('connection').click();q.frame();assert.equal(qrows().length,3);
  filter('state').click();q.frame();assert.equal(qrows().length,5);
  filter('all').click();q.frame();
  // Detail on the right: origin, state meaning, program; read only, no replay.
  const refused=qrows().find(r=>r.getAttribute('data-state')==='refused');
  all(refused).find(e=>e.tagName==='BUTTON').click();q.frame();
  const qd=find(qc,'v2k-detail');assert.match(text(qd),/Refusé : un autre appareil pilote/);assert.match(text(qd),/Appareil/);
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
  assert.match(find(qc,'v2k-context').textContent,/piece\.nc/);
  assert(qrows().every(r=>{const at=Number(r.getAttribute('data-at'));return at>=31000&&at<=93000;}));
  const back=find(qc,'v2k-back');assert.equal(back.hidden,false);
  back.click();assert.deepEqual(navigations,['history','home']);assert.equal(JSON.stringify(returns),'[{"view":{"camera":"saved"}}]','Suivi receives its saved view');
  q.show('history');q.frame();assert.equal(qrows().length,12,'the context ends with the return');assert.equal(find(qc,'v2k-back').hidden,true);
  // Missing context: another program, or no interval: « Aucun événement conservé ».
  for(const marker of [{identity:{...identity,fingerprint:'sha:other'},interval:{fromMonoMs:61000,toMonoMs:63000}},{identity,interval:null},null]){
    q.emit('cnc-v2-journal-open',{marker});q.show('history');q.frame();
    assert.equal(qrows().length,0);assert.match(text(qlist),/Aucun événement conservé/);
  }
  find(qc,'v2k-all').click();q.frame();assert.equal(qrows().length,12);
  // Hidden Journal: new events do not paint until it is shown again.
  q.show('home');q.status({...m,activeState:'Hold',workflow:'paused'});q.frame();assert.equal(qrows().length,12);
  q.show('history');q.frame();assert.equal(qrows().length,16,'availability back, state, file and workflow');
  // Server history stays read-only, read on demand, labelled as its own source.
  q.window.localStorage.values.set('cnc',JSON.stringify({state:{session:{token:'T'}}}));
  filter('connection').click();q.frame();
  find(qc,'v2k-source-server').click();q.frame();
  assert.equal(filter('all').getAttribute('aria-pressed'),'true','a session filter does not survive the switch to the server source');
  const xhr=q.window.sent.at(-1);assert.match(xhr.url,/\/touch-history\?limit=/);
  xhr.status=200;xhr.responseText=JSON.stringify({entries:[{seq:9,event:'start',at:'2026-11-06T10:00:00Z',program:'piece.nc'},{seq:8,event:'alarm',code:2,at:'2026-11-06T09:59:00Z'}],total:2,more:false});xhr.onload();
  q.frame();assert.equal(qrows().length,2);assert.match(text(qlist),/Serveur CNCjs/);assert.match(text(qlist),/Travail démarré/);
  find(qc,'v2k-source-session').click();q.frame();assert.equal(qrows().length,16);
  // Eco / GPU loss: the presenter is released; nothing repaints, nothing moves.
  q.st.open=false;q.emit('cnc-v2-change',q.base.state());q.status({...m,activeState:'Idle',workflow:'idle'});q.frame();
  assert.equal(qrows().length,16);assert.equal(qc.hidden,false);
  await flush();
  // Lot Journal (a1, a2, a5, m10): own page, the rest above unchanged.
  {
    const r=journalPage();r.open();timeline(r);r.show('history');r.frame();
    const rc=r.mount('history').content,rlist=find(rc,'v2k-list'),rr=()=>rlist.children.filter(li=>li.getAttribute('data-id'));
    // a2 / m10: an alarm state gets the red tone and the « Alarme » badge instead of « Rapport du contrôleur ».
    r.status({...m,activeState:'Alarm',workflow:'running'});r.frame();
    const alarm=rr().find(li=>/Alarm/.test(text(li))&&li.getAttribute('data-category')==='state');
    assert(alarm,'alarm state row: '+rr().map(text).join(' | '));
    assert.equal(alarm.getAttribute('data-tone'),'alarm');assert.equal(all(alarm).find(e=>e.className==='v2k-badge').textContent,'Alarme');
    assert(rr().filter(li=>li!==alarm).every(li=>li.getAttribute('data-tone')===''),'no other row is red');
    // a1: chronological list kept at its newest end while the reader is at the bottom; left alone once scrolled up.
    let rowsHeight=()=>rr().length*62;Object.defineProperty(rlist,'scrollHeight',{get:()=>rowsHeight(),configurable:true});rlist.clientHeight=300;rlist.scrollTop=rlist.scrollHeight-300;
    r.status({...m,activeState:'Idle',workflow:'idle'});r.frame();
    assert.equal(rlist.scrollTop,rlist.scrollHeight-300,'a new row keeps the newest event in view');
    rlist.scrollTop=0;r.status({...m,activeState:'Run',workflow:'running'});r.frame();assert.equal(rlist.scrollTop,0,'a reader scrolled up is not moved');
    const filter=k=>all(rc).find(e=>e.getAttribute&&e.getAttribute('data-v2k-filter')===k);
    filter('state').click();r.frame();assert.equal(rlist.scrollTop,rlist.scrollHeight-300,'a new filter opens at the newest event');
    filter('all').click();r.frame();
    // a1 (contre-revue): scrolled up, then the Journal left and opened again: it opens at its newest event.
    rlist.scrollTop=0;r.show('home');r.show('history');r.frame();
    assert.equal(rlist.scrollTop,rlist.scrollHeight-300,'reopened, the journal shows its newest event');
    // a5: no frame on another screen or a hidden page; a pending frame is cancelled when the Journal is left.
    r.status({...m,activeState:'Hold',workflow:'paused'});assert.equal(r.frames.size,1,'a new event queues one frame');
    r.show('home');assert.equal(r.frames.size,0,'leaving the Journal cancels its frame');
    r.emit('cnc-v2-change',r.base.state());r.status({...m,activeState:'Idle',workflow:'idle'});
    assert.equal(r.frames.size,0,'no frame while another screen is shown');
    r.show('history');assert.equal(r.frames.size,1,'shown again: one frame');r.frame();
    r.document.hidden=true;r.emit('cnc-v2-change',r.base.state());r.status({...m,activeState:'Run',workflow:'running'});
    assert.equal(r.frames.size,0,'no frame on a hidden page');r.document.hidden=false;
  }
  // D4 (L7): the « Lecture seule » pill uses the shared .ks-readonly class (14 px, 12 px when
  // narrow, touch-shell.css); the v2 journal overrides it to >= 16 px, and no L6 v2 rule is smaller.
  {
    const css=require('fs').readFileSync(__dirname+'/touch/settings-list.css','utf8'),v2=css.slice(css.indexOf('/* Performance v2 (L6)')).replace(/\/\*[\s\S]*?\*\//g,'');
    const pill=v2.split('}').find(r=>r.split('{')[0].split(',').some(s=>/#perf-v2-history \.ks-readonly$/.test(s.trim())));
    // Lot Journal a4: a size may be a --fs-N token (N px in standard text, larger under Agrandi).
    assert(pill,'v2 journal rule for the read-only pill');const size=/font-size:(?:(\d+)px|var\(--fs-(\d+)\))/.exec(pill);
    assert(size&&Number(size[1]||size[2])>=16&&/!important/.test(pill),'pill text >= 16 px over the narrow-screen rule: '+pill);
    for(const m of v2.matchAll(/font-size:(\d+)px/g))assert(Number(m[1])>=16,'v2 text >= 16 px: '+m[0]);
    for(const m of v2.matchAll(/font-size:(?:calc\()?var\(--fs-(\d+)\)/g))assert(Number(m[1])>=16,'v2 text token >= 16 px: '+m[0]);
    assert.equal(all(qc).find(e=>e.className==='ks-readonly').textContent,'Lecture seule');
  }
  // Lot Journal, style sheet (m1, m3, m4, m5, m6, m7, m10, empty line): the rules that fix the measured defects.
  {
    const read=f=>require('fs').readFileSync(__dirname+'/touch/'+f,'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
    const css=read('settings-list.css'),v2=css.slice(css.indexOf('body.perf-v2 #perf-v2-settings[hidden]')),P='body.perf-v2 #perf-v2-history ';
    const rule=sel=>{const r=v2.split('}').find(x=>x.split('{')[0].split(',').some(s=>s.trim()===sel));return r?r.slice(r.indexOf('{')+1):null;};
    assert.match(rule(P+'.v2k-list>li')||'',/flex:0 0 auto/,'m1: v2 rows keep their height in the scrolling list (they overlapped by 18 px)');
    assert.match(rule(P+'.t-seg button[aria-pressed=true]')||'',/background:var\(--accent\)/,'m3: the pressed segment shows over .ks-secondary');
    assert.match(rule(P+'.t-seg button:disabled')||'',/background:var\(--disabled-bg\)/,'m3: a disabled segment looks disabled');
    assert.match(rule(P+'.v2k-sources button')||'',/min-width:140px/,'m5');
    assert.match(rule('body.perf-v2 #screen-history[data-v2-presenter=on] .ks-panel-intro p')||'',/display:none/,'m6');
    assert.match(rule(P+'li[data-source=server] .v2k-row')||'',/minmax\(96px,max-content\)/,'m7');
    assert.match(rule(P+'.v2k-list>li.v2k-empty')||'',/padding:16px/,'the empty / error line keeps its 16 px inset');
    assert.match(rule(P+'li[data-tone=alarm]')||'',/border-left-color:var\(--danger-text\)/,'m10 v2 (--danger-text: the bar keeps >= 3:1)');
    assert.match(rule(P+'li[data-tone=alarm][data-source] .v2k-badge')||'',/color:var\(--danger-text\)/,'a2: red alarm badge');
    assert.match(read('ui-2027.css'),/\.ks-ui #screen-history li\[data-tone=alarm\]\{border-left-color:var\(--danger-text\)\}/,'m10 v1');
    assert.match(read('ui-2027.css'),/\.ks-ui #screen-history li\[data-kind=alarm\]\{border-left-color:var\(--danger-text\)\}/,'v1 server alarm bar, same red');
    // Contre-revue: disabled filters and paging at full opacity (app.css button:disabled is 0.4).
    for(const sel of ['.t-seg button:disabled','.v2k-pages button:disabled'])assert.match(rule(P+sel)||'',/opacity:1;.*color:var\(--disabled-fg\).*background:var\(--disabled-bg\)/,'disabled at full opacity: '+sel);
    assert(!/diario/i.test(read('real-history.js')+read('performance-journal-context.js')),'m13: one Spanish word, « registro », like the tab');
    // m4: badge text >= 4.5:1 on its --surface-2 pill in both themes (--danger was 1.86:1 dark, --warn 3.68:1 light).
    const tokens=read('design-tokens.css'),theme=re=>{const b=re.exec(tokens)[1],o={};for(const m of b.matchAll(/--([\w-]+):(#[0-9a-f]{6})/gi))o[m[1]]=m[2];return o;};
    const lum=h=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4));return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2];};
    const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);};
    for(const [name,t] of [['dark',theme(/:root\{([^}]*)\}/)],['light',theme(/:root\[data-theme="light"\]\{([^}]*)\}/)]])
      for(const [state,token] of [['refused','danger-text'],['uncertain','warn-text']]){
        assert.match(rule(P+'li[data-category=command][data-state='+state+'] .v2k-badge')||'',new RegExp('color:var\\(--'+token+'\\)'),state+' badge token');
        assert(ratio(t[token],t['surface-2'])>=4.5,name+' '+state+' badge '+ratio(t[token],t['surface-2']).toFixed(2)+':1');
      }
    // Contre-revue: the alarm bar (a mark, >= 3:1 on the row and the page) and a disabled label (>= 4.5:1).
    for(const [name,t] of [['dark',theme(/:root\{([^}]*)\}/)],['light',theme(/:root\[data-theme="light"\]\{([^}]*)\}/)]]){
      for(const bg of ['surface-2','surface','bg'])assert(ratio(t['danger-text'],t[bg])>=3,name+' alarm bar on --'+bg+' '+ratio(t['danger-text'],t[bg]).toFixed(2)+':1');
      assert(ratio(t['disabled-fg'],t['disabled-bg'])>=4.5,name+' disabled label '+ratio(t['disabled-fg'],t['disabled-bg']).toFixed(2)+':1');
    }
  }
  console.log('PASS v2 journal: chronological list, command/state/connection filters, distinct sent/confirmed/refused/uncertain, detail without replay, contextual opening and return to Suivi, missing context, hidden screen, server source, release; RT unchanged.');
})().catch(e=>{console.error(e);process.exitCode=1;});
