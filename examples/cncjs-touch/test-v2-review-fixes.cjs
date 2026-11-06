'use strict';
// Adversarial transitions against the real bootstrap, contract and screen lock.
// Only the DOM, clock and resource delivery are simulated; no network or machine.
const assert = require('assert').strict;
const {page, BOOTSTRAP} = require('./test-v2-gate.cjs');
const {reviewOriginFixes} = require('./test-v2-origin.cjs');

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
  for (const [name,test] of Object.entries({busySession,lockedBootstrap,contractInstalledAfterLock,readyLockKeepsCache,reviewOriginFixes,effectiveArcTolerance})) {
    try { await test(); console.log('PASS review fixes: '+name); }
    catch (error) { failed++; console.error('FAIL review fixes: '+name+'\n'+error.stack); }
  }
  assert.equal(failed,0,'all review regressions must pass');
  console.log('PASS v2 review fixes: active-opening latch, bootstrap/contract lock, origin cancellation and late replies, effective arc tolerance.');
}
module.exports = {tests};
if (require.main === module) tests().catch(error => { console.error(error); process.exitCode=1; });
