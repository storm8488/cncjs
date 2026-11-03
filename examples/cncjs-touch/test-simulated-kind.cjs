'use strict';
// Simulated machine type (simulation page only): the virtual controller carries a machineProfile
// whose kind is chosen with the same machine/set-kind action, kept in this browser
// (cncjs-touch-sim-kind-v1) and never sent anywhere; refused while the simulated job runs;
// forget clears it; laser framing and laser resume stay unavailable with a reason.
const assert = require('assert').strict, fs = require('fs'), path = require('path'), vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, 'touch', 'job-simulation.js'), 'utf8');
const KEY = 'cncjs-touch-sim-kind-v1';

function page(values) {
  const spies = { xhr: 0 };
  const window = {
    localStorage: { getItem: (k) => (values.has(k) ? values.get(k) : null), setItem: (k, v) => values.set(k, String(v)), removeItem: (k) => values.delete(k) },
    performance: { now: () => Date.now() }, addEventListener() {}, dispatchEvent() {}, XMLHttpRequest: function () { spies.xhr++; }
  };
  vm.runInNewContext(source, { window, document: { querySelectorAll: () => [] }, Date, Math, JSON, Promise, CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } } });
  const sim = window.cncJobSimulation;
  const profile = async () => JSON.parse(JSON.stringify((await sim.request('GET')).controllers[0].machineProfile));
  const post = (body) => sim.request('POST', Object.assign({ port: 'SIMULATION' }, body));
  return { sim, profile, post, spies };
}

(async () => {
  const values = new Map();
  let p = page(values);
  // No choice yet: simulated profile without a kind (the CNC interface), changeable at rest.
  let mp = await p.profile();
  assert.equal(mp.simulated, true); assert.equal(mp.kind, null); assert.equal(mp.canChange, true); assert.equal(mp.portHint, 'SIMULATION');
  // Laser: kind, laser mode, laser capabilities; fraisage refused with a reason; framing and resume not simulated.
  const answer = await p.post({ action: 'machine', operation: 'set-kind', kind: 'laser', label: 'x' });
  assert.match(answer.message, /SIMULATION — Type simulé : Laser/); assert.match(answer.message, /rien envoyé au serveur/);
  mp = await p.profile();
  assert.equal(mp.kind, 'laser'); assert.equal(mp.label, 'Machine simulée'); assert.equal(mp.laser.mode, 1);
  assert.equal(mp.capabilities.spindleTest.supported, false); assert.match(mp.capabilities.spindleTest.reason, /fraisage indisponible/);
  assert.equal(mp.capabilities.plateProbe.supported, false); assert.equal(mp.capabilities.focus.supported, true);
  assert.equal(mp.capabilities.laserFrame.supported, false); assert.match(mp.capabilities.laserFrame.reason, /cadrage non simulé/);
  assert.equal(mp.capabilities.laserResume.supported, false);
  assert.deepEqual(JSON.parse(values.get(KEY)), { version: 1, kind: 'laser' });
  // Kept in this browser: a reloaded simulation page starts in laser.
  p = page(values); mp = await p.profile(); assert.equal(mp.kind, 'laser');
  // CNC: milling capabilities back, laser ones refused.
  await p.post({ action: 'machine', operation: 'set-kind', kind: 'cnc' });
  mp = await p.profile(); assert.equal(mp.kind, 'cnc'); assert.equal(mp.capabilities.spindleTest.supported, true); assert.equal(mp.capabilities.laserFrame.supported, false);
  assert.match(mp.capabilities.laserFrame.reason, /Profil CNC simulé/);
  // Invalid kind and unknown operation refused; nothing changed.
  await assert.rejects(p.post({ action: 'machine', operation: 'set-kind', kind: 'plasma' }), /inconnu/);
  await assert.rejects(p.post({ action: 'machine', operation: 'frame' }), /inconnue/);
  assert.equal((await p.profile()).kind, 'cnc');
  // During a simulated job: refused with the reason, kind unchanged.
  await p.post({ action: 'load', file: 'a.nc', name: 'a.nc' }).catch(() => {});
  const state = (await p.sim.request('GET')).controllers[0];
  const ticket = await p.post({ action: 'prepare', operation: 'start', revision: state.revision });
  await p.post({ action: 'start', nonce: ticket.nonce });
  mp = await p.profile(); assert.equal(mp.canChange, false); assert.match(mp.changeReason, /Arrêtez la simulation/);
  await assert.rejects(p.post({ action: 'machine', operation: 'set-kind', kind: 'laser' }), /Arrêtez la simulation/);
  assert.equal((await p.profile()).kind, 'cnc');
  await p.post({ action: 'stop' });
  // Forget: back to no kind, the stored value removed.
  await p.post({ action: 'machine', operation: 'forget' });
  assert.equal((await p.profile()).kind, null); assert.equal(values.has(KEY), false);
  // A corrupt stored value reads as no kind.
  values.set(KEY, '{bad'); p = page(values); assert.equal((await p.profile()).kind, null);
  assert.equal(p.spies.xhr, 0, 'no request');
  // The real page's job controls no longer refuse the change on the simulation page.
  assert(!/Simulation : type de machine non modifiable/.test(fs.readFileSync(path.join(__dirname, 'touch', 'job-controls.js'), 'utf8')));
  console.log('PASS simulated machine type: simulation-only profile, laser and CNC capabilities, kept in this browser, refused during a simulated job, forget, corrupt value, no request.');
})().catch((e) => { console.error(e); process.exit(1); });
