'use strict';
// Real bootstrap in a VM; every request is intercepted locally. No fixture server.
const assert = require('assert').strict, fs = require('fs'), vm = require('vm');
const read = f => fs.readFileSync(__dirname + '/touch/' + f, 'utf8');
const KEY = 'cncjs-touch-performance-ui-v2';
const tick = () => new Promise(setImmediate);
function page(options = {}) {
  const listeners = {}, frames = new Map(), classes = new Set(), requests = [], events = [];
  const values = options.values || new Map([
    ['cncjs-touch-performance-v1', JSON.stringify({version: 1, profile: options.profile || 'performance'})],
    [KEY, options.raw === undefined ? JSON.stringify({version: 1, enabled: true}) : options.raw]
  ]);
  let mono = 100, seq = 0;
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
    addEventListener(n,f) { (listeners['doc:'+n] ||= []).push(f); }, removeEventListener() {}};
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
    const machine = patch === null ? null : Object.assign({port: 'A', generation: 'g1', revision: 1,
      name: 'piece.nc', fingerprint: 'sha256:a', machineProfile: {kind: options.kind || 'cnc'},
      activeState: 'Idle', workflow: 'idle', fresh: true, statusAgeMs: 0, canStop: false,
      loading: false, homing: false, spindleSpeed: 0, motion: {jog: false, cancelling: false}}, patch);
    emit('cnc-job-status', Object.assign({machine, simulation: !!options.simulation, busy: false, transportConnected: true}, detail));
  }
  async function complete() {
    // Sequential bootstrap is intentional: data parsed before the contract is installed.
    for (let i=0; i<12; i++) {
      for (const r of requests.filter(r => !r.done && !r.node.aborted)) {
        r.done = true;
        if (r.kind === 'data') { r.node.status = 200; r.node.responseText = read(r.url.split('?')[0]); r.node.onload(); }
        else { run(r.url.split('?')[0]); if (r.node.onload) r.node.onload(); }
      }
      await tick(); frame();
    }
  }
  return {window, document, context, classes, values, requests, events, gpu, run, emit, frame, status, complete,
    advance(ms) { mono += ms; }, frames, get api() { return window.cncV2; }};
}
async function tests() {
  const p = page();
  assert(p.api, 'L0 exposes the small gate facade without loading any v2 file');
  assert.equal(p.api.version, 1); assert.equal(p.requests.length, 0);
  p.status(); assert.equal(p.requests.length, 0, 'no loading/rendering inside status handler');
  p.frame(); await p.complete();
  assert(p.api.gate()); assert(p.api.state().ready); assert(p.classes.has('perf-v2'));
  assert.deepEqual(p.requests.map(r => r.url.split('?')[0]), ['i18n-messages-v2.js','performance-v2-contract.js']);
  assert(p.requests.every(r => /\?v=v2l0\d+$/.test(r.url)));
  const count = p.requests.length; p.status(); p.frame(); await p.complete(); assert.equal(p.requests.length,count);
  for (const options of [{profile:'eco'}, {gpu:false,height:768}, {gpu:false}, {kind:'laser'}, {wide:false}, {raw:null}, {raw:'true'}, {raw:'{"version":2,"enabled":true}'}, {raw:'{"version":1,"enabled":"true"}'}, {readFail:true}]) {
    const q=page(options); q.status(); q.frame(); await q.complete();
    assert.equal(q.requests.length,0,JSON.stringify(options)); assert(!q.api.gate()); assert(!q.classes.has('perf-v2'));
    assert.equal(q.frames.size,0,'RT/Eco have no v2 timer or animation');
    await assert.rejects(q.window.cncProfile.loadAdvanced('performance-v2-contract.js'));
    await assert.rejects(q.window.cncProfile.loadAdvanced('performance-inspect.js'));
    await assert.rejects(q.window.cncProfile.loadAdvanced('i18n-messages-v2.js'));
    assert.equal(q.requests.length,0,'direct loader cannot bypass gate');
  }
  for (const patch of [null,{activeState:'Run',workflow:'running'}, {workflow:'paused'}, {activeState:'Alarm'}, {fresh:false}, {statusAgeMs:2501}, {statusAgeMs:null}, {canStop:true}, {loading:true}, {homing:true}, {motion:{jog:true}}, {spindleSpeed:12000}]) {
    const q=page(); q.status(patch); q.frame(); await q.complete(); assert.equal(q.requests.length,0,'unsafe snapshot');
  }
  for (const detail of [{busy:true},{systemCommand:{}},{halt:{canStop:true}},{transportConnected:false}]) {
    const q=page(); q.status({},detail); q.frame(); await q.complete(); assert.equal(q.requests.length,0,'pending/unknown state');
  }
  // Preference is captured for this page, even if the first status has not arrived.
  const q=page({raw:null}); const changed=q.api.setPreference(true);
  assert(changed.ok && changed.persisted); assert.equal(changed.message,'Changement préparé pour la prochaine session au repos');
  q.status(); q.frame(); await q.complete(); assert.equal(q.requests.length,0);
  const reload=page({values:q.values}); reload.status(); reload.frame(); await reload.complete(); assert(reload.api.gate());
  const blocked=page({raw:null,writeFail:true}); const unsaved=blocked.api.setPreference(true); assert.equal(unsaved.persisted,false); assert(!blocked.api.preference().enabled);
  assert.match(unsaved.message,/non enregistré/,'a failed storage write must not claim a prepared next session');
  assert.equal(blocked.api.setPreference('true').ok,false);
  // Busy initial session and asynchronous start never replace the layout at the end of a job.
  const late=page(); late.status({workflow:'running',activeState:'Run'}); late.frame(); late.status(); late.frame(); await late.complete(); assert.equal(late.requests.length,0);
  const race=page(); race.status(); race.frame(); race.status({workflow:'running'}); await race.complete(); assert(!race.classes.has('perf-v2')); assert(!race.api.gate());
  const slow=page(); slow.status(); slow.frame(); slow.advance(2501); await slow.complete(); assert(!slow.classes.has('perf-v2'),'stale while loading');
  const swapped=page(); swapped.status(); swapped.frame(); swapped.window.cncProfile.setPerformance('eco'); await swapped.complete();
  assert(swapped.requests[0].node.aborted); assert(!swapped.api.gate()); assert.equal(swapped.requests.length,1,'Eco prevents next bootstrap module');
  const stale=page(); stale.status(); stale.advance(2501); stale.frame(); await stale.complete(); assert.equal(stale.requests.length,0,'monotone age rechecked before load');
  // Disabling and losing resources stops work synchronously, keeps the busy layout.
  p.status({workflow:'running',activeState:'Run'}); p.api.setPreference(false);
  assert(!p.api.gate()); p.frame(); assert(p.classes.has('perf-v2')); assert(p.api.state().holdLayout);
  const eco=page(); eco.status(); eco.frame(); await eco.complete(); eco.status({workflow:'paused'});
  eco.window.cncProfile.setPerformance('eco'); assert(!eco.api.gate()); eco.frame(); assert(eco.classes.has('perf-v2'));
  eco.status(null); eco.frame(); assert(eco.classes.has('perf-v2')); eco.status(); eco.frame(); assert(!eco.classes.has('perf-v2'));
  const lost=page(); lost.status(); lost.frame(); await lost.complete(); lost.status({workflow:'running'});
  lost.gpu.lost=true; lost.emit('cnc-gpu-change',lost.gpu); assert(!lost.api.gate()); lost.frame(); assert(lost.classes.has('perf-v2'));
  const external=page({raw:null}); external.values.set(KEY,JSON.stringify({version:1,enabled:true})); external.emit('storage',{key:KEY}); external.status();external.frame();await external.complete();assert.equal(external.requests.length,0,'another tab cannot hot-switch this session');
  assert(p.events.some(e=>e.type==='cnc-v2-change'));
  const sim=page({simulation:true});sim.values.set('cncjs-touch-sim-kind-v1','{"version":1,"kind":"cnc"}');sim.run('job-simulation.js');
  const snapshot=await sim.window.cncJobSimulation.request('GET');
  sim.emit('cnc-job-status',{simulation:true,machine:snapshot.controllers[0],busy:false,transportConnected:true});
  sim.frame();await sim.complete();assert(sim.api.gate(),'actual virtual Idle is usable without inventing a machine report age');
  console.log('PASS v2 gate: explicit versioned preference, next idle page, bootstrap race, RT 1366x768/software/Eco/laser zero requests, frozen busy layout.');
}
module.exports={page,read,tick,KEY};
if(require.main===module) tests().catch(e=>{console.error(e);process.exitCode=1;});
