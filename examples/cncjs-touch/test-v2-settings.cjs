'use strict';
// L6 Réglages under Performance v2: deferred preference entry, visual-only quality and an
// on-demand diagnostic. Real L0 contract and L3 journal model in a VM, fake base gate.
// Also exports l6Page(), the shared fixture of test-v2-journal*.cjs and test-v2-machine*.cjs.
const assert=require('assert').strict,fs=require('fs'),vm=require('vm');
const {createDOM}=require('./dom-fixture.cjs');
const read=f=>fs.readFileSync(__dirname+'/touch/'+f,'utf8');
const all=root=>[root,...root.querySelectorAll('*')];
const find=(root,id)=>all(root).find(e=>e.id===id)||null;
const text=root=>all(root).map(e=>e.textContent).join(' ');
function l6Page(o={}){
  const dom=createDOM(o.screens||[]),listeners={},frames=new Map(),timers=new Map(),calls=[],body=new Set(o.layout?['perf-v2']:[]);
  let seq=0,mono=1000,active=o.active||'menu',contract=false,mounts={};
  dom.document.body.classList={contains:n=>body.has(n),toggle(n,on){if(on)body.add(n);else body.delete(n);}};
  dom.document.documentElement={};dom.node('screen-home').querySelector=()=>null;
  const st={version:1,enabled:false,sessionEnabled:false,eligible:!!o.eligible,open:false,ready:false,layout:false,
    safeIdle:o.safeIdle!==false,holdLayout:false,pending:false,reason:'waiting',programKey:null};
  const pref={enabled:false,storage:'absent'};
  const failed='Changement non enregistré : stockage du navigateur indisponible.',prepared='Changement préparé pour la prochaine session au repos';
  let lastFailed=false;
  const base={version:1,gate:()=>st.open,state:()=>Object.assign({},st),preference:()=>({version:1,enabled:pref.enabled,storage:pref.storage}),
    message:()=>lastFailed?failed:prepared,
    setPreference(b){calls.push(['setPreference',b]);lastFailed=!!o.writeFail;
      if(!o.writeFail){pref.enabled=b;pref.storage='ok';st.enabled=b;}
      st.pending=pref.enabled!==st.sessionEnabled||(!b&&st.sessionEnabled);
      return {ok:true,persisted:!o.writeFail,message:base.message()};}};
  class CustomEvent{constructor(type,init){this.type=type;this.detail=init&&init.detail;}}
  const window={cncV2:o.noV2?undefined:base,cncI18n:{t:s=>s,html:s=>s,language:o.language||'fr',locale:'fr-FR'},
    innerWidth:1366,innerHeight:911,devicePixelRatio:1.5,performance:{now:()=>mono},
    requestAnimationFrame(f){frames.set(++seq,f);return seq;},cancelAnimationFrame(id){frames.delete(id);},
    setTimeout(f,ms){timers.set(++seq,{f,ms});return seq;},clearTimeout(id){timers.delete(id);},
    addEventListener(n,f){(listeners[n]||(listeners[n]=[])).push(f);},
    removeEventListener(n,f){listeners[n]=(listeners[n]||[]).filter(x=>x!==f);},
    dispatchEvent(e){(listeners[e.type]||[]).slice().forEach(f=>f(e));return true;},
    cncGpu:{state:()=>Object.assign({checked:true,hardware:true,lost:false},o.gpu||{})},
    cncShell:{screen:()=>active,v2Mounts:()=>mounts},
    location:{reload(){calls.push(['reload']);}},fetch(){calls.push(['fetch']);},
    XMLHttpRequest:class{open(m,u){calls.push(['xhr',m,u]);this.url=u;}setRequestHeader(){}send(){(window.sent=window.sent||[]).push(this);}abort(){this.aborted=true;}},
    cncJobControls:new Proxy({},{get(_,k){calls.push(['jobControls',String(k)]);return ()=>Promise.resolve({});}})};
  window.CustomEvent=CustomEvent;
  const storage={values:new Map(),getItem(k){return this.values.has(k)?this.values.get(k):null;},setItem(k,v){this.values.set(k,v);}};
  window.localStorage=storage;
  const context=vm.createContext({window,document:dom.document,localStorage:storage,CustomEvent,Event:class{constructor(t){this.type=t;}},
    Promise,console,Blob:class{constructor(p,x){this.text=p.join('');this.type=x&&x.type;}},Date,JSON,Math,Object,Array,String,Number,isFinite,Proxy});
  const run=f=>vm.runInContext(read(f),context,{filename:f});
  const emit=(type,detail)=>window.dispatchEvent(new CustomEvent(type,{detail}));
  function frame(){for(let i=0;i<5&&frames.size;i++){const batch=[...frames.values()];frames.clear();batch.forEach(f=>f(mono));}}
  let quality={mode:'full',dpr:1.5},inspectDisposed=false;
  const inspect={owner:'L1',snapshot:()=>({version:1,available:true,identity:null,geometryKey:null,selection:null,quality:Object.assign({},quality)}),
    update(){},cancel(){},dispose(){inspectDisposed=true;},diagnostics:()=>({ready:true}),
    setQuality(m){calls.push(['setQuality',m]);quality={mode:m,dpr:m==='reduced'?1:m==='fixed'?null:1.5};return Object.assign({},quality);},
    diagnose(x){calls.push(['diagnose',x]);return Promise.resolve({samples:60,cancelled:false,paintP95Ms:4.2,frameP95Ms:16.7,budgetMs:12,quality:{mode:'full',dpr:1.5}});}};
  function open(){
    Object.assign(st,{enabled:true,sessionEnabled:true,eligible:true,open:true,ready:true,layout:true,reason:'ready'});
    pref.enabled=true;pref.storage='ok';body.add('perf-v2');
    if(!contract){contract=true;run('performance-v2-contract.js');run('performance-journal-context.js');window.cncV2.register('inspect',inspect);
      const m={};
      for(const name of ['home','files','prepare','machine','history','settings']){
        const screen=name==='prepare'?'jog':name,root=dom.node('screen-'+screen),content=dom.element('div','perf-v2-'+name);
        content.hidden=true;root.appendChild(content);m[name]=Object.freeze({screen,root,content,origin:null});
      }
      mounts=Object.freeze(m);}
    emit('cnc-v2-change',base.state());
  }
  function show(screen){active=screen;dom.activeScreens.clear();dom.activeScreens.add(screen);emit('cnc-screen-change',screen);}
  return {...dom,window,base,st,pref,body,calls,frames,timers,emit,frame,run,open,show,inspect:()=>inspect,inspectDisposed:()=>inspectDisposed,
    mount:name=>mounts[name],advance(ms){mono+=ms;},get mono(){return mono;},status(machine,extra){emit('cnc-job-status',Object.assign({machine,simulation:false,transportConnected:true},extra||{}));}};
}
module.exports={l6Page,find,all,text,read};
const flush=()=>new Promise(setImmediate);
async function tests(){
  const settings=p=>{p.run('display-settings.js');return p;};
  // RT/Eco/software/narrow: no frame, no element, whatever the events.
  for(const o of [{noV2:true},{eligible:false}]){
    const p=settings(l6Page(o)),before=p.document.body.children.length;
    for(const e of ['cnc-profile-change','cnc-gpu-change','cnc-layout-change','resize','cnc-v2-change'])p.emit(e,{});
    assert.equal(p.frames.size,0,'no frame outside eligibility');p.frame();
    assert.equal(p.document.body.children.length,before);assert.equal(find(p.document.body,'ks-v2-card'),null,'no v2 entry outside eligibility');
  }
  // Eligible (Performance + CNC + hardware GPU + wide): the entry explains, toggles the
  // deferred preference only, and announces the change for the next idle session.
  {
    const p=settings(l6Page({eligible:true}));
    p.emit('cnc-profile-change',{});assert.equal(find(p.document.body,'ks-v2-card'),null,'event handler does not render');
    p.frame();const card=find(p.document.body,'ks-v2-card');assert(card,'entry visible when eligible');
    assert.equal(p.document.body.children.indexOf(card),p.document.body.children.indexOf(p.node('ks-performance-card'))+1,'right after the tablet performance card');
    assert.match(text(card),/Interface Performance v2/);assert.match(text(card),/GPU matériel/);assert.match(text(card),/prochaine/);
    const toggle=find(card,'ks-v2-toggle'),status=find(card,'ks-v2-status');
    assert.equal(toggle.getAttribute('aria-pressed'),'false');assert.equal(status.textContent,'');
    toggle.click();assert.deepEqual(p.calls,[['setPreference',true]],'only the deferred preference changes: no request, reload, host or machine call');
    p.frame();assert.equal(toggle.getAttribute('aria-pressed'),'true');assert.equal(status.textContent,'Changement préparé pour la prochaine session au repos');
    assert.equal(find(p.document.body,'ks-v2-quality'),null,'no quality controls without perf-v2');
    toggle.click();p.frame();assert.deepEqual(p.calls.at(-1),['setPreference',false]);assert.equal(toggle.getAttribute('aria-pressed'),'false');
    assert.equal(status.textContent,'','back to the session state: nothing pending');
    p.st.eligible=false;p.emit('cnc-profile-change',{});p.frame();assert.equal(card.hidden,true,'hidden again when Eco/GPU/layout no longer allow it');
  }
  // A storage failure is reported, never shown as prepared.
  {
    const p=settings(l6Page({eligible:true,writeFail:true}));p.emit('cnc-gpu-change',{});p.frame();
    const card=find(p.document.body,'ks-v2-card');find(card,'ks-v2-toggle').click();p.frame();
    assert.match(find(card,'ks-v2-status').textContent,/non enregistré/);assert.equal(find(card,'ks-v2-toggle').getAttribute('aria-pressed'),'false');
  }
  // English labels are embedded: the entry works before any v2 catalogue is loaded.
  {
    const p=settings(l6Page({eligible:true,language:'en'}));p.emit('cnc-layout-change',{});p.frame();
    assert.match(text(find(p.document.body,'ks-v2-card')),/Performance v2 interface/);
  }
  // perf-v2: visual quality and on-demand diagnostic inside the settings mount.
  {
    const p=settings(l6Page({eligible:true,screens:['settings'],active:'settings'}));
    p.open();const content=p.mount('settings').content;
    assert.equal(content.hidden,true,'mount unhidden only in a frame');assert.equal(content.children.length,0);
    p.frame();assert.equal(content.hidden,false);
    const q=find(content,'ks-v2-quality');assert(q,'quality card');
    const button=m=>all(q).find(e=>e.getAttribute&&e.getAttribute('data-v2-quality')===m);
    assert.equal(button('full').getAttribute('aria-pressed'),'true');
    assert.match(text(q),/Rendu allégé/);assert.match(text(q),/Arrêter le rendu 3D/);
    button('reduced').click();assert.deepEqual(p.calls.at(-1),['setQuality','reduced']);p.frame();
    assert.equal(button('reduced').getAttribute('aria-pressed'),'true');assert.equal(button('full').getAttribute('aria-pressed'),'false');
    const list=find(content,'ks-v2-diagnostic-list');assert.equal(list.children.length,0,'diagnostic only on demand');
    assert(!p.calls.some(c=>c[0]==='diagnose'),'no measurement without a request');
    find(content,'ks-v2-diagnostic-run').click();p.frame();
    const d=text(list);assert.match(d,/GPU matériel/);assert.match(d,/Oui/);assert.match(d,/1366 × 911/);assert.match(d,/2049 × 1367/);
    assert.match(d,/1\.5/);assert.match(d,/Rendu allégé/);assert.match(d,/Qualité effective/);
    assert(!p.calls.some(c=>c[0]==='diagnose'),'reading values does not measure');
    p.st.safeIdle=false;find(content,'ks-v2-measure').click();p.frame();
    assert(!p.calls.some(c=>c[0]==='diagnose'),'no measurement during work or with an unknown state');
    assert.match(find(content,'ks-v2-quality-status').textContent,/repos/);
    p.st.safeIdle=true;find(content,'ks-v2-measure').click();assert.equal(JSON.stringify(p.calls.at(-1)),'["diagnose",{"frames":60}]');
    await flush();p.frame();assert.match(text(list),/60 images/);assert.match(text(list),/16\.7/);
    button('fixed').click();assert.deepEqual(p.calls.at(-1),['setQuality','fixed']);
    assert(!p.calls.some(c=>['xhr','fetch','reload','jobControls'].includes(c[0])),'visual only: nothing sent, nothing reloaded');
    // Eco / GPU loss: the contract disposes the presenter; the controls go inert, nothing moves.
    p.st.open=false;p.emit('cnc-v2-change',p.base.state());p.frame();
    assert.equal(button('reduced').disabled,true);const n=p.calls.length;button('reduced').click();assert.equal(p.calls.length,n);
    assert.equal(content.hidden,false,'same rectangle retained until the layout changes at rest');
  }
  // CSS: v2 rules are scoped to body.perf-v2 and the mounts disappear outside it.
  {
    const css=read('settings-list.css'),start=css.indexOf('/* Performance v2 (L6)');
    assert(start>=0,'v2 CSS block');
    css.slice(start).replace(/\/\*[\s\S]*?\*\//g,'').split('}').map(r=>r.trim()).filter(Boolean).forEach(rule=>{
      const sel=rule.split('{')[0].trim();
      sel.split(',').forEach(s=>assert(/^body(\.perf-v2|:not\(\.perf-v2\))/.test(s.trim()),'scoped v2 rule: '+s));
    });
  }
  // Chromium 106 kiosk: every L6 browser file parses as ES2017.
  for(const f of ['display-settings.js','tablet-diagnostic.js','session-journal.js','real-history.js','machine-limits.js'])require('acorn').parse(read(f),{ecmaVersion:2017});
  console.log('PASS v2 settings: entry only when eligible, deferred preference without reload/request/command, storage failure, embedded EN, visual quality, on-demand diagnostic, idle-only measurement, inert after disposal, scoped CSS.');
}
if(require.main===module)tests().catch(e=>{console.error(e);process.exitCode=1;});
