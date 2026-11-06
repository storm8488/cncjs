'use strict';
const assert = require('assert').strict;
const {page} = require('./test-v2-gate.cjs');
const {geometry, adapter} = require('./test-v2-inspect.cjs');
async function setup() {
  const p = page(); p.status(); p.frame(); await p.complete();
  p.window.cncShell = {screen: () => 'home'}; p.emit('cnc-screen-change', 'home');
  const idle = new Map(); let serial = 0;
  p.window.requestIdleCallback = fn => {idle.set(++serial, fn); return serial;};
  p.window.cancelIdleCallback = id => idle.delete(id);
  p.inspect = p.api.use('inspect'); p.idle = idle;
  assert(!p.inspect.stub, 'bootstrap installs the real inspect provider');
  p.flush = () => {let limit = 10000; while (idle.size && limit--) {const [id, fn] = idle.entries().next().value; idle.delete(id); fn({timeRemaining: () => 10});} assert(limit > 0);};
  p.attach = n => {
    const g = geometry(n); g.identity = p.api.identity.create({role: 'loaded', file: 'piece.nc', fingerprint: 'sha256:a', controller: 'A', generation: 'g1', revision: 1});
    const view = adapter(); assert(p.inspect.attach(view)); p.inspect.update(g); return {g, view};
  };
  return p;
}
(async () => {
  const p = await setup(); const {g, view} = p.attach(); p.flush();
  assert.equal(p.api.commands, null); assert.equal(p.inspect.diagnostics().ready, true);
  const requests = p.requests.length;
  assert(p.inspect.begin()); p.inspect.pick({x: 2, y: 0, radius: 2});
  const notified = p.events.filter(e => e.type === 'cnc-v2-data' && e.detail.slot === 'inspect').pop();
  assert.equal(notified.detail.snapshot.selection.sourceLine, 10); assert(Object.isFrozen(notified.detail.snapshot.selection.nominalMm));
  p.status({workflow: 'running', activeState: 'Run'}); assert(p.inspect.diagnostics().ready);
  assert.equal(p.inspect.pick({x: 12, y: 0, radius: 1}).candidates[0].segment, 1);
  p.status({workflow: 'running', activeState: 'Run', statusAgeMs: 2501, fresh: false});
  assert.equal(p.inspect.pick({x: 12, y: 0, radius: 1}).candidates[0].segment, 1, 'nominal inspection does not claim a fresh tool position');
  assert.equal(p.requests.length, requests, 'job inspection creates no program request');
  p.status({workflow: 'running', activeState: 'Run', revision: 2, fingerprint: 'sha256:b'});
  assert.equal(p.inspect.diagnostics().indexBytes, 0); assert.equal(p.inspect.snapshot().identity, null); assert.equal(view.selection, null);
  for (const reason of ['screen', 'hidden', 'lock', 'eco', 'gpu', 'pagehide']) {
    const q = await setup(); q.attach(50000); assert(q.idle.size);
    if (reason === 'screen') q.emit('cnc-screen-change', 'files');
    if (reason === 'hidden') {q.document.hidden = true; q.emit('doc:visibilitychange');}
    if (reason === 'lock') q.emit('cnc-screen-lock', true);
    if (reason === 'eco') q.window.cncProfile.setPerformance('eco');
    if (reason === 'gpu') {q.gpu.lost = true; q.emit('cnc-gpu-change');}
    if (reason === 'pagehide') q.emit('pagehide', {persisted: true});
    q.flush(); assert.equal(q.inspect.diagnostics().indexBytes, 0, reason); assert.equal(q.inspect.snapshot().available, false, reason);
  }
  const before = await setup(); before.attach(50000); before.status({workflow: 'running', activeState: 'Run'}); before.flush();
  assert.equal(before.inspect.diagnostics().ready, false); assert.equal(before.inspect.diagnostics().indexBytes, 0, 'real read lease cancels incomplete index');
  before.status(); assert(before.idle.size, 'return to fresh Idle resumes pending preparation'); before.flush(); assert(before.inspect.diagnostics().ready);
  const canonical = await setup(); canonical.attach(); canonical.flush();
  const revised = geometry(); revised.identity = g.identity; revised.geometryKey = 'filtered-v2'; revised.buffers.positions[0] = 2;
  canonical.emit('cnc-v2-data', {slot: 'geometry', snapshot: revised}); canonical.flush();
  assert.equal(canonical.inspect.snapshot().geometryKey, 'filtered-v2');
  canonical.emit('cnc-v2-data', {slot: 'geometry', snapshot: {version: 1, available: false, identity: null}});
  assert.equal(canonical.inspect.snapshot().available, false, 'withdrawn geometry cannot leave an inspectable stale index');
  const local = await setup(); const attached = local.attach(); local.flush();
  local.inspect.updatePath({count: 2, positions: new Float64Array([0, 0, 0, 5, 0, 0]), lines: new Uint32Array([0, 10])},
    {identity: attached.g.identity, geometryKey: 'local-decoded-visible', quality: 'simplified', toleranceMm: 0.1}); local.flush();
  local.emit('cnc-v2-data', {slot: 'geometry', snapshot: revised}); local.flush();
  assert.equal(local.inspect.snapshot().geometryKey, 'local-decoded-visible', 'L2 segment ids cannot replace an independently drawn local path');
  console.log('PASS v2 inspect contract: real L0 events/scopes, identities, job reuse, stale reports, no reads and all release paths.');
})().catch(e => {console.error(e); process.exitCode = 1;});
