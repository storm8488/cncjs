'use strict';
// Adversarial transitions against the real bootstrap, contract and screen lock.
// Only the DOM, clock and resource delivery are simulated; no network or machine.
const assert = require('assert').strict;
const {page, BOOTSTRAP, tick} = require('./test-v2-gate.cjs');
const {reviewOriginFixes} = require('./test-v2-origin.cjs');

async function controllerRoundTrip() {
  const p = page(), nodes = {}, pending = [], intervals = [];
  let civil = 10000;
  class Clock extends Date { static now() { return civil; } }
  const element = id => nodes[id] || (nodes[id] = {value:'',textContent:'',style:{},handlers:{},
    addEventListener(type,fn) { this.handlers[type] = fn; }, removeEventListener(){},
    appendChild(){},insertBefore(){},setAttribute(){},focus(){}});
  p.document.getElementById = element;
  p.document.querySelector = () => element('panel');
  const create = p.document.createElement;
  p.document.createElement = tag => Object.assign(create(tag),{addEventListener(){},focus(){}});
  p.context.Date = Clock;
  p.context.setInterval = fn => { intervals.push(fn); return intervals.length; };
  p.context.clearInterval = () => {};
  p.context.XMLHttpRequest = function() {
    this.open = method => assert.equal(method,'GET','no machine command');
    this.setRequestHeader = this.abort = () => {};
    this.send = () => pending.push(this);
  };
  p.values.set('cnc',JSON.stringify({state:{session:{token:'fixture'}}}));
  p.run('job-controls.js');
  assert.equal(pending.length,1);
  const response = pending.shift();
  response.status = 200;
  response.responseText = JSON.stringify({controllers:['A','B'].map(port => ({port,generation:'g1',revision:1,
    type:'Grbl',name:'piece.nc',fingerprint:'sha256:a',machineProfile:{kind:'cnc'},
    activeState:'Idle',workflow:'idle',fresh:true,statusAgeMs:0,statusObservedAt:5000,
    spindleSpeed:0,canStop:false,loading:false,homing:false,motion:{jog:false,cancelling:false}}))});
  response.onload(); await tick();
  const select = port => { nodes['job-port'].value = port; nodes['job-port'].handlers.change(); };
  select('A'); p.frame(); await p.complete();
  const life = p.api.lifecycle.scope(null);
  assert(p.api.state().safeIdle && life.token());
  p.advance(2501); civil = 12501; intervals[0](); p.frame();
  assert.equal(p.api.state().safeIdle,false); assert.equal(life.token(),null);
  p.advance(1); civil = 9000; intervals[0]();
  select('B'); select('A');
  const last = p.events.filter(e => e.type === 'cnc-job-status').pop().detail;
  assert.equal(last.machine.port,'A'); assert.equal(last.machine.statusObservedAt,5000);
  assert.equal(last.observedAt,10000,'no new transport response was delivered');
  assert.equal(p.api.state().safeIdle,false,'A -> B -> A cannot renew an expired report after civil rollback');
  assert.equal(life.token(),null,'returning to A must not grant a read lease');
  assert.deepEqual({...p.api.reportAge(last.machine)},{known:true,fresh:false,ageMs:2502});
  life.dispose(); p.emit('pagehide');
}

async function sharedReportAge() {
  const p = page(), report = {port:'A',generation:'g1',statusObservedAt:5000,statusAgeMs:500,fresh:true};
  assert.equal(typeof p.api.reportAge,'function','reportAge is available in the baseline facade');
  const reportAge = p.api.reportAge;
  const age = machine => ({...p.api.reportAge(machine)});
  assert.deepEqual(age(report),{known:false,fresh:false,ageMs:null},'unobserved reports cannot invent a first arrival');
  p.status(report);
  assert.deepEqual(age(report),{known:true,fresh:true,ageMs:500});
  p.frame(); await p.complete();
  assert.equal(p.api.reportAge,reportAge,'the contract and its stubs retain the L0 source of freshness');
  const life = p.api.lifecycle.scope(null), lease = life.token(); assert(lease);
  p.advance(2000);
  const duplicate = {...report,statusAgeMs:0};
  p.status(duplicate,{observedAt:9000});
  assert.deepEqual(age(duplicate),{known:true,fresh:true,ageMs:2500});
  assert(p.api.state().safeIdle && life.valid(lease));
  p.advance(1);
  assert.deepEqual(age(duplicate),{known:true,fresh:false,ageMs:2501});
  assert.equal(p.api.state().safeIdle,false); assert.equal(life.token(),null); assert.equal(life.valid(lease),false);
  for (const stamp of [undefined,null,'5000',NaN,Infinity]) {
    const missing = {...report,statusObservedAt:stamp,statusAgeMs:0};
    p.status(missing,{observedAt:10001});
    assert.deepEqual(age(missing),{known:false,fresh:false,ageMs:null},'transport arrival cannot replace report identity');
    assert.equal(p.api.state().safeIdle,false); assert.equal(life.token(),null);
  }
  p.status(duplicate);
  assert.deepEqual(age(duplicate),{known:true,fresh:false,ageMs:2501},'omissions never erase the first arrival');
  const generation = {...report,generation:'g2',statusAgeMs:0};
  p.status(generation);
  assert.deepEqual(age(generation),{known:true,fresh:true,ageMs:0},'generation belongs to controller identity');
  p.status(duplicate);
  assert.deepEqual(age(duplicate),{known:true,fresh:false,ageMs:2501},'returning to an old generation keeps its age');
  const fresh = {...report,statusObservedAt:4999,statusAgeMs:0};
  p.status(fresh);
  assert.deepEqual(age(fresh),{known:true,fresh:true,ageMs:0},'a different report can have a lower civil timestamp');
  assert(p.api.state().safeIdle && life.token());
  assert.deepEqual(age({...fresh,fresh:false}),{known:true,fresh:false,ageMs:0});
  p.advance(100);
  assert.deepEqual(age({...fresh,revision:2,name:'other.nc',fingerprint:'other'}),{known:true,fresh:true,ageMs:100},
    'program changes do not change report identity');
  assert.deepEqual(age(duplicate),{known:false,fresh:false,ageMs:null},'reading a superseded snapshot cannot register it again');
  assert.deepEqual(age(fresh),{known:true,fresh:true,ageMs:100},'an old consumer cannot replace the current report clock');
  life.dispose(); p.emit('pagehide');
}

async function virtualReportAge() {
  const p = page({simulation:true});
  p.values.set('cncjs-touch-sim-kind-v1','{"version":1,"kind":"cnc"}'); p.run('job-simulation.js');
  const snapshot = await p.window.cncJobSimulation.request('GET'), machine = snapshot.controllers[0];
  const detail = {simulation:true,machine,observedAt:10000,busy:false,transportConnected:true};
  assert.equal(typeof machine.statusObservedAt,'undefined');
  p.emit('cnc-job-status',detail); p.frame(); await p.complete();
  const life = p.api.lifecycle.scope(null);
  assert.deepEqual({...p.api.reportAge(machine)},{known:true,fresh:true,ageMs:0});
  assert(p.api.state().safeIdle && life.token());
  p.advance(2500); assert.equal(p.api.reportAge(machine).fresh,true);
  p.advance(1); p.emit('cnc-job-status',detail);
  assert.deepEqual({...p.api.reportAge(machine)},{known:true,fresh:false,ageMs:2501});
  assert.equal(p.api.state().safeIdle,false); assert.equal(life.token(),null);
  p.emit('cnc-job-status',{...detail,observedAt:9000});
  assert.deepEqual({...p.api.reportAge(machine)},{known:true,fresh:true,ageMs:0},'virtual model retains its existing envelope clock');
  assert(p.api.state().safeIdle && life.token());
  life.dispose(); p.emit('pagehide');
  const real = page();
  real.emit('cnc-job-status',detail);
  assert.deepEqual({...real.api.reportAge(machine)},{known:false,fresh:false,ageMs:null},'simulation event is ignored on the real page');
  real.emit('cnc-job-status',{...detail,simulation:false});
  assert.deepEqual({...real.api.reportAge(machine)},{known:false,fresh:false,ageMs:null},'virtual fields alone do not replace a real report');
  assert.equal(real.api.state().safeIdle,false); real.emit('pagehide');
}

async function boundedReportAge() {
  const p = page(), report = {port:'A',generation:'g1',statusObservedAt:5000,statusAgeMs:0,fresh:true};
  p.status(report); p.frame(); await p.complete();
  const life = p.api.lifecycle.scope(null);
  p.advance(2501);
  for (let index=0; index<63; index++) {
    const controller = {...report,port:'controller-'+index};
    p.status(controller);
    assert.equal(p.api.reportAge(controller).known,true);
  }
  const overflow = {...report,port:'overflow'};
  p.status(overflow);
  assert.deepEqual({...p.api.reportAge(overflow)},{known:false,fresh:false,ageMs:null},'full table refuses untracked contexts');
  assert.equal(p.api.state().safeIdle,false); assert.equal(life.token(),null);
  p.status(report);
  assert.deepEqual({...p.api.reportAge(report)},{known:true,fresh:false,ageMs:2501},'saturation never evicts and renews A');
  assert.equal(p.api.state().safeIdle,false); assert.equal(life.token(),null);
  p.status({...report,statusObservedAt:5001});
  assert(p.api.state().safeIdle && life.token(),'tracked controllers still accept genuinely new reports at capacity');
  life.dispose(); p.emit('pagehide');
}

function screenLock(p) {
  const create = p.document.createElement;
  p.document.createElement = tag => {
    const node = create(tag);
    node.addEventListener = () => {};
    return node;
  };
  const banner = p.document.createElement('div');
  p.document.getElementById = id => id === 'real-banner' ? banner : null;
  p.context.clearTimeout = () => {};
  p.context.setTimeout = () => { throw Error('unexpected lock timer'); };
  p.run('screen-lock.js');
  return p.window.cncScreenLock;
}

async function busySession() {
  for (const patch of [{spindleSpeed:12000}, {motion:{jog:true}}, {motion:{cancelling:true}},
    {probing:true}, {probeBusy:true}, {homing:true}, {canStop:true}, {loading:true},
    {activeState:'Run'}, {workflow:'running'}]) {
    // Include an activity report that disappears before the very first RAF.
    for (const paintBusy of [false,true]) {
      const p = page();
      p.status(patch);
      if (paintBusy) { p.frame(); await p.complete(); }
      assert.equal(p.requests.length,0,'active opening cannot request v2');
      p.status(); p.frame(); await p.complete();
      assert.equal(p.requests.length,0,'activity stays latched until next opening: '+JSON.stringify(patch));
      assert.equal(p.api.state().pending,true);
      assert.equal(p.api.state().open,false);
      assert.equal(p.api.state().layout,false);
      const next = page({values:p.values});
      next.status(); next.frame(); await next.complete();
      assert(next.api.state().ready && next.api.state().layout,'a new idle opening can activate');
      p.emit('pagehide'); next.emit('pagehide');
    }
  }
  for (const patch of [null,{spindleSpeed:null},{fresh:false},{statusAgeMs:null}]) {
    const p = page(); p.status(patch); p.frame(); await p.complete();
    assert.equal(p.requests.length,0);
    p.status(); p.frame(); await p.complete();
    assert(p.api.state().ready,'unknown initial telemetry may wait for a known idle report');
    p.emit('pagehide');
  }
}

async function lockedBootstrap() {
  // Availability is read from the lock API even when its earlier event was missed.
  const initial = page(), initialLock = screenLock(initial);
  const dispatch = initial.window.dispatchEvent;
  initial.window.dispatchEvent = () => {};
  initialLock.lock(); initial.window.dispatchEvent = dispatch;
  initial.status(); initial.frame(); await initial.complete();
  assert.equal(initial.requests.length,0,'an already locked screen cannot begin bootstrap');
  initialLock.unlock(); initial.frame(); await initial.complete();
  assert(initial.api.state().ready,'an untouched bootstrap can begin after unlock');
  initial.emit('pagehide');
  for (let stage=0; stage<BOOTSTRAP.length; stage++) {
    const p = page(), lock = screenLock(p);
    p.status(); p.frame();
    for (let n=0; n<stage; n++) await p.step();
    const pending = p.requests[stage];
    lock.lock();
    assert(lock.locked());
    assert.equal(p.api.gate(),false,'lock closes the incomplete bootstrap at '+BOOTSTRAP[stage]);
    assert(pending.kind === 'data' ? pending.node.aborted : !pending.node.parentNode,'pending resource cancelled');
    // A delayed load or script execution may still arrive after cancellation.
    p.respond(pending); await p.complete();
    assert.equal(p.requests.length,stage+1,'no next resource while locked');
    assert.equal(p.api.state().ready,false); assert.equal(p.api.state().layout,false);
    if (p.api.lifecycle) {
      const life = p.api.lifecycle.scope(null);
      assert.equal(life.token(),null);
      life.frame(() => assert.fail('render while locked')); p.frame(); life.dispose();
    }
    p.emit('pagehide');
  }
}

async function contractInstalledAfterLock() {
  const p = page(), lock = screenLock(p);
  p.status(); p.frame(); lock.lock();
  // Contract unit boundary: the gate facade grants availability, while the real
  // lock has already announced before this module installs its own listener.
  p.api.gate = () => true;
  p.run('performance-v2-contract.js');
  const life = p.api.lifecycle.scope(null);
  assert.equal(life.token(),null,'contract must sample the pre-existing real lock');
  let readsCancelled = 0, renders = 0;
  life.track('read',() => readsCancelled++);
  life.frame(() => renders++); p.frame();
  assert.equal(readsCancelled,1); assert.equal(renders,0);
  lock.unlock(); assert(life.token(),'unlock makes the isolated scope available');
  life.dispose(); p.emit('pagehide'); await p.complete();
}

async function readyLockKeepsCache() {
  const p = page(), lock = screenLock(p);
  p.status(); p.frame(); await p.complete();
  const life = p.api.lifecycle.scope(null), geometry = p.api.use('geometry');
  let releases = 0, aborts = 0;
  life.track('cache',() => releases++); life.track('read',() => aborts++);
  lock.lock();
  assert.equal(life.token(),null); assert.equal(aborts,1); assert.equal(releases,0);
  assert.equal(p.api.use('geometry'),geometry,'a ready lock retains its installed providers');
  const requests = p.requests.length;
  for (const file of ['performance-v2-contract.js','preview-gl.js','origin-preview.js']) {
    await assert.rejects(p.window.cncProfile.loadAdvanced(file),'no advanced load while locked');
  }
  assert.equal(p.requests.length,requests);
  lock.unlock();
  assert(life.token()); assert.equal(p.api.use('geometry'),geometry);
  life.dispose(); p.emit('pagehide');
}

function effectiveArcTolerance() {
  const geometry = require('./touch/preview-inspect.js').buildV2Geometry(
    'G21 G90 G54\nG0 X100000 Y0\nG2 X100000 Y0 I-100000 J0 F100');
  assert.equal(geometry.segmentCount,4097);
  const analyticalSagitta = 100000*(1-Math.cos(Math.PI/4096));
  assert(geometry.toleranceMm >= analyticalSagitta,
    'the 4096-step cap must still expose at least its effective sagitta');
  assert(geometry.buffers.positions instanceof Float32Array);
  const positions = geometry.buffers.positions;
  let maxExportedError = 0;
  // Skip the first rapid; inspect the endpoints and midpoints of every exported
  // chord of the 100 m circle, including the actual Float32 rounding.
  for (let offset=6; offset<positions.length; offset+=6) {
    for (const t of [0,0.5,1]) {
      const x = positions[offset]*(1-t)+positions[offset+3]*t;
      const y = positions[offset+1]*(1-t)+positions[offset+4]*t;
      maxExportedError = Math.max(maxExportedError,Math.abs(100000-Math.hypot(x,y)));
    }
  }
  assert(geometry.toleranceMm >= maxExportedError,
    'announced tolerance '+geometry.toleranceMm+' must include exported Float32 error '+maxExportedError);
}

async function tests() {
  let failed = 0;
  for (const [name,test] of Object.entries({controllerRoundTrip,sharedReportAge,virtualReportAge,boundedReportAge,busySession,lockedBootstrap,contractInstalledAfterLock,readyLockKeepsCache,reviewOriginFixes,effectiveArcTolerance})) {
    try { await test(); console.log('PASS review fixes: '+name); }
    catch (error) { failed++; console.error('FAIL review fixes: '+name+'\n'+error.stack); }
  }
  assert.equal(failed,0,'all review regressions must pass');
  console.log('PASS v2 review fixes: shared reportAge, A -> B -> A, bounded controller memory, virtual model, locks, suspended origin verdict, late replies and arc tolerance.');
}
module.exports = {tests};
if (require.main === module) tests().catch(error => { console.error(error); process.exitCode=1; });
