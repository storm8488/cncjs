'use strict';
// Real bootstrap in a VM; every request is intercepted locally. No fixture server.
const assert = require('assert').strict, fs = require('fs'), vm = require('vm');
const read = f => fs.readFileSync(__dirname + '/touch/' + f, 'utf8');
const KEY = 'cncjs-touch-performance-ui-v2';
const BOOTSTRAP = ['i18n-messages-v2.js','performance-v2-contract.js','performance-inspect.js',
  'performance-sequences.js','performance-observation.js','performance-journal-context.js','performance-v2.css'];
const tick = () => new Promise(setImmediate);
const OFF = JSON.stringify({version: 1, enabled: false});
function page(options = {}) {
  const listeners = {}, frames = new Map(), classes = new Set(), requests = [], events = [];
  const values = options.values || new Map([
    ['cncjs-touch-performance-v1', JSON.stringify({version: 1, profile: options.profile || 'performance'})],
    [KEY, options.raw === undefined ? JSON.stringify({version: 1, enabled: true}) : options.raw]
  ]);
  let mono = 100, seq = 0, report = 0;
  const storage = {getItem(k) { if (options.readFail) throw Error('blocked'); return values.has(k) ? values.get(k) : null; },
    setItem(k,v) { if (options.writeFail) throw Error('blocked'); values.set(k,v); }};
  function element(tag) { return {tagName: tag.toUpperCase(), children: [], style: {}, hidden: false,
    appendChild(n) { this.children.push(n); n.parentNode = this; if (n.src || n.href) requests.push({kind: tag, node: n, url: n.src || n.href}); return n; },
    removeChild(n) { this.children = this.children.filter(x => x !== n); n.parentNode = null; },
    setAttribute(k,v) { this[k] = v; }, getAttribute(k) { return this[k] || null; }}; }
  const body = element('body');
  body.classList = {contains: n => classes.has(n), toggle(n,on) { if (on) classes.add(n); else classes.delete(n); }};
  body['data-simulation'] = options.simulation ? 'true' : 'false';
  const document = {body, head: element('head'), hidden: false, documentElement: {}, title: '',
    createElement: element, querySelectorAll: () => [], getElementById: () => null,
    addEventListener(n,f) { (listeners['doc:'+n] ||= []).push(f); },
    removeEventListener(n,f) { listeners['doc:'+n] = (listeners['doc:'+n] || []).filter(x => x !== f); },
    dispatchEvent(e) { (listeners['doc:'+e.type] || []).slice().forEach(f => f(e)); }};
  // Baseline sheets are already in the head before the deferred bootstrap runs.
  const responsive = element('link'); responsive.rel = 'stylesheet'; responsive.href = 'responsive.css?v=v2l';
  document.head.children.push(responsive); responsive.parentNode = document.head;
  const window = {document, localStorage: storage, performance: {now: () => mono},
    innerWidth: options.width || 1366, innerHeight: options.height || 911,
    requestAnimationFrame(f) { frames.set(++seq,f); return seq; }, cancelAnimationFrame: id => frames.delete(id),
    addEventListener(n,f) { (listeners[n] ||= []).push(f); },
    removeEventListener(n,f) { listeners[n] = (listeners[n] || []).filter(x => x !== f); },
    dispatchEvent(e) { events.push(e); (listeners[e.type] || []).slice().forEach(f => f(e)); },
    location: {reload() { throw Error('reload forbidden'); }},
    fetch() { throw Error('unexpected request'); }};
  class CustomEvent { constructor(type, o) { this.type = type; this.detail = o && o.detail; } }
  window.CustomEvent = CustomEvent;
  window.XMLHttpRequest = class {
    open(method,url) { this.method = method; this.url = url; }
    send() { requests.push({kind: 'data', node: this, url: this.url}); }
    abort() { this.aborted = true; if (this.onabort) this.onabort(); }
  };
  const gpu = {checked: true, hardware: options.gpu !== false, lost: false};
  window.cncGpu = {state: () => ({...gpu}), ready() { throw Error('must reuse existing probe'); }};
  window.cncLayout = {wide: () => options.wide !== false && window.innerHeight >= 880 && window.innerWidth >= 1300};
  const context = vm.createContext({window, document, localStorage: storage, CustomEvent, Promise, console});
  function run(f) { vm.runInContext(read(f), context, {filename: f}); }
  // Same static catalogues as the production pages (v2 must not conflict with them).
  ['i18n-messages.js','i18n-messages-machine.js','i18n-messages-profiles.js','i18n-messages-viz.js','i18n-messages-origin.js','i18n.js','tablet-profile.js'].forEach(run);
  const emit = (type,detail) => window.dispatchEvent(new CustomEvent(type,{detail}));
  function frame() { const batch = [...frames.values()]; frames.clear(); batch.forEach(f => f(mono)); }
  function status(patch = {}, detail = {}) {
    report++;
    const machine = patch === null ? null : Object.assign({port: 'A', generation: 'g1', revision: 1,
      name: 'piece.nc', fingerprint: 'sha256:a', machineProfile: {kind: options.kind || 'cnc'},
      activeState: 'Idle', workflow: 'idle', fresh: true, statusAgeMs: 0, statusObservedAt: report, canStop: false,
      loading: false, homing: false, spindleSpeed: 0, motion: {jog: false, cancelling: false}}, patch);
    emit('cnc-job-status', Object.assign({machine, observedAt: report, simulation: !!options.simulation, busy: false, transportConnected: true}, detail));
  }
  function respond(r) {
    r.done = true;
    if (r.kind === 'data') { r.node.status = 200; r.node.responseText = read(r.url.split('?')[0]); r.node.onload(); }
    else { if (r.node.tagName === 'SCRIPT') run(r.url.split('?')[0]); if (r.node.onload) r.node.onload(); }
  }
  async function step() {
    // Only actually attached scripts complete. Late execution after removal is
    // exercised explicitly below; it must not install a provider behind a closed gate.
    const r = requests.find(r => !r.done && !r.node.aborted && (r.kind === 'data' || r.node.parentNode));
    if (r) respond(r);
    await tick(); frame();
    return r;
  }
  async function complete() {
    for (let i=0; i<20; i++) await step();
  }
  return {window, document, context, classes, values, requests, events, gpu, run, emit, frame, status, complete, step, respond,
    advance(ms) { mono += ms; }, frames, get api() { return window.cncV2; }};
}
async function tests() {
  await repeatedReportClock();
  await hiddenBootstrap();
  const p = page();
  assert(p.api, 'L0 exposes the small gate facade without loading any v2 file');
  assert.equal(p.api.version, 1); assert.equal(p.requests.length, 0);
  p.status(); assert.equal(p.requests.length, 0, 'no loading/rendering inside status handler');
  p.frame(); await p.complete();
  assert(p.api.gate()); assert(p.api.state().ready); assert(p.classes.has('perf-v2'));
  assert.deepEqual(p.requests.map(r => r.url.split('?')[0]), BOOTSTRAP);
  assert(p.requests.every(r => /\?v=v2l$/.test(r.url)));
  const style = p.requests.find(r => r.url.startsWith('performance-v2.css?')).node;
  assert.equal(style.tagName, 'LINK'); assert.equal(style.rel, 'stylesheet');
  assert(p.document.head.children.indexOf(style) > p.document.head.children.findIndex(n => /^responsive\.css\?/.test(n.href || '')),
    'v2 stylesheet follows responsive.css in the cascade');
  for (const file of ['index.html','simulation.html']) assert(!/performance-v2\.css/.test(read(file)), file+' never requests v2 CSS statically');
  await assert.rejects(p.window.cncProfile.loadAdvanced('responsive.css'), 'only the guarded v2 stylesheet is accepted');
  for (const slot of ['inspect','sequences','observation','journal']) assert(!p.api.use(slot).stub, slot+' is installed before ready');
  const count = p.requests.length; p.status(); p.frame(); await p.complete(); assert.equal(p.requests.length,count);
  for (const options of [{profile:'eco'}, {gpu:false,height:768}, {gpu:false}, {kind:'laser'}, {wide:false}, {raw:'{"version":1,"enabled":false}'}, {raw:'true'}, {raw:'{"version":2,"enabled":true}'}, {raw:'{"version":1,"enabled":"true"}'}, {readFail:true}]) {
    const q=page(options); q.status(); q.frame(); await q.complete();
    assert.equal(q.requests.length,0,JSON.stringify(options)); assert(!q.api.gate()); assert(!q.classes.has('perf-v2'));
    assert.equal(q.frames.size,0,'RT/Eco have no v2 timer or animation');
    for (const file of BOOTSTRAP) await assert.rejects(q.window.cncProfile.loadAdvanced(file));
    await assert.rejects(q.window.cncProfile.loadAdvanced(['preview-gl.js', 'performance-sequences.js']));
    assert.equal(q.requests.length,0,'direct loader cannot bypass gate');
  }
  for (const patch of [null,{activeState:'Run',workflow:'running'}, {workflow:'paused'}, {activeState:'Alarm'}, {fresh:false}, {statusAgeMs:2501}, {statusAgeMs:null}, {canStop:true}, {loading:true}, {homing:true}, {motion:{jog:true}}, {spindleSpeed:12000}]) {
    const q=page(); q.status(patch); q.frame(); await q.complete(); assert.equal(q.requests.length,0,'unsafe snapshot');
  }
  for (const detail of [{busy:true},{systemCommand:{}},{halt:{canStop:true}},{transportConnected:false}]) {
    const q=page(); q.status({},detail); q.frame(); await q.complete(); assert.equal(q.requests.length,0,'pending/unknown state');
  }
  // v2 is the default: an absent preference opens the gate (Performance, CNC, wide, hardware GPU).
  { const d=page({raw:null}); assert.equal(d.api.preference().storage,'absent'); assert(d.api.preference().enabled); d.status(); d.frame(); await d.complete(); assert(d.api.gate(),'absent preference = v2 on'); }
  // Preference is captured for this page, even if the first status has not arrived.
  const q=page({raw:OFF}); const changed=q.api.setPreference(true);
  assert(changed.ok && changed.persisted); assert.equal(changed.message,'Changement préparé pour la prochaine session au repos');
  q.status(); q.frame(); await q.complete(); assert.equal(q.requests.length,0);
  const reload=page({values:q.values}); reload.status(); reload.frame(); await reload.complete(); assert(reload.api.gate());
  const blocked=page({raw:OFF,writeFail:true}); const unsaved=blocked.api.setPreference(true); assert.equal(unsaved.persisted,false); assert(!blocked.api.preference().enabled);
  assert.match(unsaved.message,/non enregistré/,'a failed storage write must not claim a prepared next session');
  assert.equal(blocked.api.setPreference('true').ok,false);
  // Busy initial session and asynchronous start never replace the layout at the end of a job.
  const late=page(); late.status({workflow:'running',activeState:'Run'}); late.frame(); late.status(); late.frame(); await late.complete(); assert.equal(late.requests.length,0);
  const race=page(); race.status(); race.frame(); race.status({workflow:'running'}); await race.complete(); assert(!race.classes.has('perf-v2')); assert(!race.api.gate());
  const slow=page(); slow.status(); slow.frame(); slow.advance(2501); await slow.complete(); assert(!slow.classes.has('perf-v2'),'stale while loading');
  const swapped=page(); swapped.status(); swapped.frame(); swapped.window.cncProfile.setPerformance('eco'); await swapped.complete();
  assert(swapped.requests[0].node.aborted); assert(!swapped.api.gate()); assert.equal(swapped.requests.length,1,'Eco prevents next bootstrap module');
  const stale=page(); stale.status(); stale.advance(2501); stale.frame(); await stale.complete(); assert.equal(stale.requests.length,0,'monotone age rechecked before load');
  // Check ordering and revocation at EVERY network boundary, including late script
  // execution after cancellation. No filtered request trace or substitute providers.
  for (const close of ['eco','gpu','laser','resize','preference','job','pagehide']) {
    for (let stage=0; stage<BOOTSTRAP.length; stage++) {
      const q=page(); q.status(); q.frame();
      for (let n=0; n<stage; n++) {
        assert.equal(q.requests.length,n+1,'one bootstrap request at a time');
        assert(!q.api.state().ready); await q.step();
      }
      const pending=q.requests[stage]; assert.equal(pending.url,BOOTSTRAP[stage]+'?v=v2l');
      assert(!q.api.state().ready); assert(!q.classes.has('perf-v2'));
      if(close==='eco') q.window.cncProfile.setPerformance('eco');
      if(close==='gpu') { q.gpu.lost=true; q.emit('cnc-gpu-change'); }
      if(close==='laser') q.status({machineProfile:{kind:'laser'}});
      if(close==='resize') { q.window.innerWidth=1024; q.emit('resize'); }
      if(close==='preference') q.api.setPreference(false);
      if(close==='job') q.status({workflow:'running',activeState:'Run'});
      if(close==='pagehide') q.emit('pagehide',{persisted:true});
      assert(!q.api.gate());
      assert(pending.kind==='data' ? pending.node.aborted : !pending.node.parentNode,'pending resource cancelled');
      if(pending.kind!=='data') q.respond(pending);
      await q.complete();
      assert.equal(q.requests.length,stage+1,'nothing requested after revocation');
      assert(!q.classes.has('perf-v2')); assert(!q.api.state().ready);
      if(q.api.use) for(const slot of ['inspect','sequences','observation','journal']) assert(q.api.use(slot).stub,'released '+slot);
    }
  }
  // A cached renderer (the existing hardware probe) and a renderer request already
  // in flight must both wait for B. A synchronous loading listener cannot race it.
  for(const cached of [false,true]) {
    const q=page(), order=[];
    const first=q.window.cncProfile.loadAdvanced('preview-gl.js');
    if(cached) { await q.step(); await first; }
    q.window.CNCPreviewGL={close:reason=>order.push(reason)};
    let scene;
    q.window.addEventListener('cnc-v2-change',e=>{
      if(!scene&&e.detail.reason==='loading') scene=q.window.cncProfile.loadAdvanced('preview-gl.js').then(()=>{
        assert(q.api.state().ready); assert(!q.api.use('inspect').stub); order.push('scene');
      });
    });
    q.status(); q.frame(); await tick(); assert.deepEqual(order,['v2-bootstrap']);
    let resolved=false; first.then(()=>{resolved=true;});
    if(!cached) { await q.step(); assert(!resolved,'in-flight renderer waits for bootstrap'); }
    await q.complete(); await first; await scene;
    assert.equal(q.requests.filter(r=>r.url.startsWith('preview-gl.js?')).length,1,'probe not repeated');
    assert.deepEqual(order,['v2-bootstrap','scene']);
  }
  for(let stage=0; stage<BOOTSTRAP.length; stage++) {
    const q=page(); q.status(); q.frame();
    for(let n=0; n<stage; n++) await q.step();
    const scene=q.window.cncProfile.loadAdvanced(['preview-gl.js','origin-preview.js']);
    const rejected=assert.rejects(scene);
    const pending=q.requests[stage]; pending.done=true; pending.node.onerror();
    await q.complete(); await rejected;
    assert(!q.api.gate()); assert(!q.api.state().ready); assert(!q.classes.has('perf-v2'));
    assert.equal(q.requests.length,stage+1,'failed bootstrap never requests its waiting scene');
    if(q.api.use) for(const slot of ['inspect','sequences','observation','journal']) assert(q.api.use(slot).stub);
  }
  // A script load event alone is not proof that its provider installed (e.g. a
  // script execution error). Do not expose a ready UI backed by a leftover stub.
  for(const missing of BOOTSTRAP.slice(2).filter(file => file.endsWith('.js'))) {
    const q=page(); q.status(); q.frame();
    while(q.requests[q.requests.length-1].url!==missing+'?v=v2l') await q.step();
    const pending=q.requests[q.requests.length-1]; pending.done=true; pending.node.onload();
    await q.complete();
    assert(!q.api.state().ready,'missing provider '+missing); assert(!q.api.gate()); assert(!q.classes.has('perf-v2'));
  }
  // Disabling and losing resources stops work synchronously, keeps the busy layout.
  p.status({workflow:'running',activeState:'Run'}); p.api.setPreference(false);
  assert(!p.api.gate()); p.frame(); assert(p.classes.has('perf-v2')); assert(p.api.state().holdLayout);
  const eco=page(); eco.status(); eco.frame(); await eco.complete(); eco.status({workflow:'paused'});
  eco.window.cncProfile.setPerformance('eco'); assert(!eco.api.gate()); eco.frame(); assert(eco.classes.has('perf-v2'));
  eco.status(null); eco.frame(); assert(eco.classes.has('perf-v2')); eco.status(); eco.frame(); assert(!eco.classes.has('perf-v2'));
  const lost=page(); lost.status(); lost.frame(); await lost.complete(); lost.status({workflow:'running'});
  lost.gpu.lost=true; lost.emit('cnc-gpu-change',lost.gpu); assert(!lost.api.gate()); lost.frame(); assert(lost.classes.has('perf-v2'));
  const external=page({raw:OFF}); external.values.set(KEY,JSON.stringify({version:1,enabled:true})); external.emit('storage',{key:KEY}); external.status();external.frame();await external.complete();assert.equal(external.requests.length,0,'another tab cannot hot-switch this session');
  assert(p.events.some(e=>e.type==='cnc-v2-change'));
  const sim=page({simulation:true});sim.values.set('cncjs-touch-sim-kind-v1','{"version":1,"kind":"cnc"}');sim.run('job-simulation.js');
  const snapshot=await sim.window.cncJobSimulation.request('GET');
  sim.emit('cnc-job-status',{simulation:true,machine:snapshot.controllers[0],busy:false,transportConnected:true});
  sim.frame();await sim.complete();assert(sim.api.gate(),'actual virtual Idle is usable without inventing a machine report age');
  console.log('PASS v2 gate: real providers and guarded CSS after responsive, cache v2l, probe/scene barrier, cancellation at every stage, RT/software/Eco/laser zero requests, frozen busy layout.');
}

async function repeatedReportClock() {
  for (const delayedGpu of [false,true]) {
    const p=page({gpu:!delayedGpu}), nodes={}, pending=[], intervals=[];
    let civil=10000;
    class Clock extends Date { static now() { return civil; } }
    // The unmodified job-controls transport/projection runs against a minimal DOM,
    // as in test-job-display. Only response delivery and both clocks are controlled.
    const element=id=>nodes[id]||(nodes[id]={value:'',textContent:'',style:{},addEventListener(){},
      removeEventListener(){},appendChild(){},insertBefore(){},setAttribute(){},focus(){}});
    p.document.getElementById=element;
    p.document.querySelector=()=>element('panel');
    const create=p.document.createElement;
    p.document.createElement=tag=>Object.assign(create(tag),{addEventListener(){},focus(){}});
    p.context.Date=Clock;
    p.context.setInterval=f=>{intervals.push(f);return intervals.length;};
    p.context.clearInterval=()=>{};
    p.context.XMLHttpRequest=function(){
      this.open=method=>assert.equal(method,'GET','no machine command');
      this.setRequestHeader=()=>{};
      this.abort=()=>{};
      this.send=()=>pending.push(this);
    };
    p.values.set('cnc',JSON.stringify({state:{session:{token:'fixture'}}}));
    p.run('job-controls.js');
    assert.equal(pending.length,1);
    const response=pending.shift();
    response.status=200;
    response.responseText=JSON.stringify({controllers:[{port:'A',generation:'g1',revision:1,
      type:'Grbl',name:'piece.nc',fingerprint:'sha256:a',machineProfile:{kind:'cnc'},
      activeState:'Idle',workflow:'idle',fresh:true,statusAgeMs:0,statusObservedAt:5000,
      spindleSpeed:0,canStop:false,loading:false,homing:false,motion:{jog:false,cancelling:false}}]});
    response.onload(); await tick(); p.frame(); await p.complete();
    assert(p.api.state().safeIdle);
    const life=delayedGpu?null:p.api.lifecycle.scope(null);
    if(life)assert(life.token());
    p.advance(2501);civil=12501;intervals[0]();p.frame();
    assert.equal(p.api.state().safeIdle,false,'original report expires at 2501 ms');
    if(life)assert.equal(life.token(),null);
    p.advance(1);civil=9000;intervals[0]();p.frame();await p.complete();
    const last=p.events.filter(e=>e.type==='cnc-job-status').pop().detail;
    assert.equal(last.observedAt,10000);
    // The real v1 projection supplies these values. No fixture makes it stale;
    // a later upstream fix may also keep it stale without changing this contract.
    assert.equal(p.api.state().safeIdle,false,'civil rollback cannot renew the same report');
    if(life)assert.equal(life.token(),null,'the real contract still refuses its read lease');
    if(delayedGpu){
      p.gpu.hardware=true;p.emit('cnc-gpu-change');p.frame();await p.complete();
      assert.equal(p.requests.length,0,'GPU becoming available cannot bootstrap on a revived v1 report');
      assert.equal(p.api.state().open,false);assert.equal(p.api.state().ready,false);assert.equal(p.api.state().layout,false);
      // A genuinely new report may start a session that never began its bootstrap.
      p.advance(1);civil=9001;p.window.cncJobControls.refresh();
      const fresh=pending.shift();assert(fresh);fresh.status=200;
      const updated=JSON.parse(response.responseText);updated.controllers[0].statusObservedAt=4999;
      fresh.responseText=JSON.stringify(updated);fresh.onload();await tick();p.frame();await p.complete();
      assert(p.api.state().safeIdle && p.api.state().ready && p.api.lifecycle.scope(null).token());
    }
    if(life)life.dispose();p.emit('pagehide');
  }
  {
    const p=page(), detail={observedAt:10000}, patch={statusObservedAt:5000};
    p.status({...patch,statusAgeMs:500},detail);p.frame();await p.complete();
    p.advance(2000);
    // A new transport envelope carrying the same server report must not renew it.
    p.status({...patch,statusAgeMs:0},{observedAt:9000});
    assert(p.api.state().safeIdle,'exactly 2500 ms stays fresh');
    p.advance(1);assert.equal(p.api.state().safeIdle,false,'the initial 500 ms age cannot decrease');
    p.status({...patch,statusAgeMs:0},{observedAt:9001});
    assert.equal(p.api.state().safeIdle,false);
    p.emit('pagehide');
  }
  for(const missing of ['snapshot','timestamps']){
    const p=page(), detail={observedAt:10000};
    p.status({statusObservedAt:5000},detail);p.frame();await p.complete();
    p.advance(2501);
    if(missing==='snapshot')p.status(null,detail);
    else p.status({statusObservedAt:undefined},{observedAt:undefined});
    p.status({statusObservedAt:5000},detail);
    assert.equal(p.api.state().safeIdle,false,'missing '+missing+' cannot renew the old report');
    assert.equal(p.api.lifecycle.scope(null).token(),null);p.emit('pagehide');
  }
  const incomplete=page();incomplete.status({statusObservedAt:5000},{observedAt:10000});
  incomplete.frame();await incomplete.complete();incomplete.advance(2501);
  incomplete.status({statusObservedAt:undefined}, {observedAt:9000});
  assert.equal(incomplete.api.state().safeIdle,false,'omitting a known server stamp is not evidence of a new report');
  incomplete.status({statusObservedAt:5000},{observedAt:9001});
  assert.equal(incomplete.api.state().safeIdle,false,'restoring the same stamp preserves its initial age');
  incomplete.emit('pagehide');
  for(const stamp of [undefined,null,'5000',NaN,Infinity]){
    const p=page();p.status({statusObservedAt:stamp}, {observedAt:10000});p.frame();await p.complete();
    assert.equal(p.api.state().safeIdle,false,'a real controller without a numeric report identity is unknown');
    assert.equal(p.requests.length,0,'transport timestamps alone cannot bootstrap v2');
    p.advance(2501);p.status({statusObservedAt:stamp},{observedAt:9000});p.frame();await p.complete();
    assert.equal(p.api.state().safeIdle,false);assert.equal(p.requests.length,0);
    p.status({statusObservedAt:5000});p.frame();await p.complete();
    assert(p.api.state().safeIdle && p.api.state().ready,'a first identified report can activate at known Idle');
    p.emit('pagehide');
  }
  console.log('PASS v2 monotone report: real job-controls 10000 -> +2501 -> civil 9000, read leases refused, delayed GPU and initial report age.');
}

async function hiddenBootstrap() {
  const initial=page();initial.document.hidden=true;initial.status();initial.frame();await initial.complete();
  assert.equal(initial.requests.length,0);
  initial.document.hidden=false;initial.document.dispatchEvent({type:'visibilitychange'});initial.frame();await initial.complete();
  assert(initial.api.state().ready,'an untouched bootstrap may start after becoming visible');initial.emit('pagehide');
  for(let stage=0;stage<BOOTSTRAP.length;stage++){
    const p=page();p.status();p.frame();for(let n=0;n<stage;n++)await p.step();
    const pending=p.requests[stage];p.document.hidden=true;p.document.dispatchEvent({type:'visibilitychange'});
    assert.equal(p.api.gate(),false,'hidden closes incomplete bootstrap at '+BOOTSTRAP[stage]);
    assert(pending.kind==='data'?pending.node.aborted:!pending.node.parentNode,'hidden cancels pending resource');
    // Returning visible before the rejection microtask cannot reopen the bootstrap.
    p.document.hidden=false;p.document.dispatchEvent({type:'visibilitychange'});
    assert.equal(p.api.gate(),false,'cancellation is latched until next page opening');
    p.respond(pending);await p.complete();
    assert.equal(p.requests.length,stage+1);assert.equal(p.api.state().ready,false);assert.equal(p.api.state().layout,false);
    const next=page({values:p.values});next.status();next.frame();await next.complete();assert(next.api.state().ready);
    next.emit('pagehide');p.emit('pagehide');
  }
  console.log('PASS v2 hidden bootstrap: all seven boundaries cancelled, late execution ignored, next-opening restart only.');
}
module.exports={page,read,tick,KEY,BOOTSTRAP,repeatedReportClock,hiddenBootstrap};
if(require.main===module) tests().catch(e=>{console.error(e);process.exitCode=1;});
