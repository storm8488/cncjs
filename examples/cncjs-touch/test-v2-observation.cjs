'use strict';
const assert = require('assert').strict;
const {page} = require('./test-v2-gate.cjs');
const plain = x => JSON.parse(JSON.stringify(x));
async function setup(options = {}) {
  const p = page(options);
  p.status(); p.frame(); await p.complete();
  p.window.cncShell = {screen: () => 'home'};
  p.emit('cnc-screen-change', 'home');
  p.run('performance-observation.js');
  const v = p.api, o = v.use('observation');
  const identity = v.identity.create({role: 'loaded', file: 'piece.nc', fingerprint: 'sha256:a', controller: 'A', generation: 'g1', revision: 1});
  o.reset(identity);
  function facts(patch = {}) {
    return Object.assign({version: 1, available: true, identity, time: v.time.stamp({serverTime: 17, serverSource: 'status'}),
      report: {freshness: 'fresh', ageMs: 0, wcs: 'G54', units: 'mm', position: {x: 1, y: 2, z: -3}, feedMmMin: 1800, spindleS: 12000},
      acknowledgement: {line: 801, total: 1000, meaning: 'accepted-not-machined'},
      estimate: {seconds: 600, source: 'motion', estimated: true, unknowns: ['acceleration']}, markers: []}, patch);
  }
  return {p, v, o, identity, facts};
}
async function cases(entries) {
  let failed = 0;
  for (const [name, test] of entries) {
    try { await test(); console.log('OK ' + name); }
    catch (e) { failed++; console.error('FAIL ' + name + ': ' + e.stack); }
  }
  assert.equal(failed, 0, failed + ' observation scenarios failed');
}
async function tests() {
  await cases([
    ['monotone age, exact L0 boundary, no extrapolation or civil-clock dependency', async () => {
      const {p, o, facts} = await setup(); const f = facts();
      o.update(f); p.advance(2500);
      assert.equal(o.snapshot().report.freshness, 'fresh');
      p.advance(1);
      const s = o.snapshot(); assert.equal(s.report.freshness, 'stale'); assert.equal(s.report.ageMs, 2501);
      assert.deepEqual(plain(s.report.position), {x: 1, y: 2, z: -3}); assert.equal(s.acknowledgement.line, 801);
      assert.equal(s.estimate.seconds, 600, 'no synthetic countdown');
      f.time = Object.assign({}, f.time, {civilMs: -1e15, server: {value: 1e15, source: 'remote'}});
      o.update(f); assert.equal(o.snapshot().report.freshness, 'stale', 'same stamp cannot rejuvenate');
    }],
    ['reported age is included, stale packets cannot advance position or acknowledgement', async () => {
      const {p, o, facts} = await setup(); o.update(facts()); p.advance(100);
      const f = facts(); f.report.ageMs = 2401; f.report.position.x = 900; f.acknowledgement.line = 999;
      p.advance(100); o.update(f);
      const s = o.snapshot(); assert.equal(s.report.freshness, 'stale'); assert.equal(s.report.ageMs, 2501);
      assert.equal(s.report.position.x, 1); assert.equal(s.acknowledgement.line, 801);
    }],
    ['absence is null, genuine zero survives, invalid/partial values never become zero', async () => {
      const {p, o, facts} = await setup();
      o.update(facts({report: {freshness: 'fresh', ageMs: 0}, acknowledgement: {}, estimate: {}}));
      let s = o.snapshot(); assert.equal(s.report.position, null); assert.equal(s.report.feedMmMin, null);
      assert.equal(s.report.spindleS, null); assert.equal(s.acknowledgement.line, null); assert.equal(s.estimate.seconds, null);
      p.advance(1); const f = facts(); f.report.feedMmMin = 0; f.report.spindleS = 0; f.report.position = {x: 0, y: 0, z: 0};
      f.acknowledgement.line = 0; f.estimate.seconds = 0; o.update(f);
      s = o.snapshot(); assert.equal(s.report.feedMmMin, 0); assert.equal(s.report.position.x, 0); assert.equal(s.acknowledgement.line, 0); assert.equal(s.estimate.seconds, 0);
      p.advance(1); f.time = facts().time; f.report.position = {x: 1, y: null, z: 3}; f.report.spindleS = '12000'; f.report.feedMmMin = NaN;
      o.update(f); s = o.snapshot(); assert.equal(s.report.position, null); assert.equal(s.report.spindleS, null); assert.equal(s.report.feedMmMin, null);
    }],
    ['missing/future/invalid report time or age is unknown', async () => {
      for (const patch of [{time: null}, {time: {arrivalMonoMs: 1e9}}, {report: {freshness: 'fresh', ageMs: null}}, {report: {freshness: 'fresh', ageMs: -1}}, {report: {freshness: 'unknown', ageMs: 0}}]) {
        const {o, facts} = await setup(); o.update(facts(patch));
        const s = o.snapshot(); assert.equal(s.report.freshness, 'unknown'); assert.equal(s.report.position, null); assert.equal(s.acknowledgement.line, null);
      }
    }],
    ['identity reset is explicit, selection and delayed other-job facts cannot bind', async () => {
      const {p, v, o, identity, facts} = await setup(); o.update(facts());
      const next = v.identity.create(Object.assign({}, identity, {revision: 2}));
      p.advance(10); o.update(facts({identity: next})); assert.equal(o.snapshot().identity.jobKey, identity.jobKey);
      o.reset(next); assert.equal(o.snapshot().report.position, null); assert.equal(o.snapshot().time, null);
      o.update(facts()); assert.equal(o.snapshot().report.position, null, 'late old job ignored');
      o.update(facts({identity: next})); assert.equal(o.snapshot().report.position.x, 1);
      o.reset(next); assert.equal(o.snapshot().report.position.x, 1, 'same job does not clear');
      o.update(facts({identity: v.identity.create({role: 'selection', file: identity.file, fingerprint: identity.fingerprint})}));
      assert.equal(o.snapshot().identity.jobKey, next.jobKey);
      o.reset(v.identity.create({file: identity.file})); assert.equal(o.snapshot().available, false); assert.equal(o.snapshot().report.position, null);
    }],
    ['old stamps ignored, caller data copied, exact L0 data-only snapshot', async () => {
      const {p, v, o, facts} = await setup(); const old = facts(); p.advance(100);
      const f = facts(); o.update(f); f.report.position.x = 100; f.estimate.unknowns.push('new');
      o.update(old); const s = o.snapshot(); assert.equal(s.time.arrivalMonoMs, 200); assert.equal(s.report.position.x, 1); assert.equal(s.estimate.unknowns.length, 1);
      assert(Object.isFrozen(s) && Object.isFrozen(s.report.position)); assert(Object.isFrozen(s.estimate.unknowns));
      assert.deepEqual(Object.keys(s).sort(), ['version', 'available', 'identity', 'time', 'report', 'acknowledgement', 'estimate', 'samples', 'markers'].sort());
      assert.equal(v.notify('observation'), true);
    }],
    ['five confidence states and FR/EN/ES qualifications', async () => {
      const {p, o, facts} = await setup(); o.update(facts()); let view = o.presentation();
      assert.equal(view.position.state, 'fresh'); assert.equal(view.estimate.state, 'estimated'); assert.equal(view.acknowledgement.state, 'acknowledged');
      assert.equal(view.spindle.label, 'S rapporté'); assert.equal(view.acknowledgement.meaning, 'accepted-not-machined');
      assert.match(view.acknowledgement.note, /pas nécessairement usiné/);
      assert.equal(o.presentation('en').spindle.label, 'Reported S'); assert.equal(o.presentation('es').spindle.label, 'S informado');
      p.advance(2501); assert.equal(o.presentation().position.state, 'stale');
      o.cancel('program-changed'); view = o.presentation(); assert.equal(view.position.state, 'unknown'); assert.equal(view.estimate.state, 'unknown');
    }],
    ['future stamps never become fresh by waiting, cached-packet revocation is effective', async () => {
      const {p, o, facts} = await setup(); const original = facts(); o.update(original); p.advance(1);
      const future = facts(); future.time = Object.assign({}, future.time, {arrivalMonoMs: 1000}); o.update(future);
      assert.equal(o.snapshot().report.freshness, 'unknown'); p.advance(899);
      assert.equal(o.snapshot().report.freshness, 'unknown', 'invalid at arrival stays invalid');
      const good = facts(); o.update(good); assert.equal(o.snapshot().report.freshness, 'fresh');
      o.update(Object.assign({}, good, {available: false})); assert.equal(o.snapshot().available, false);
      assert.equal(o.snapshot().report.freshness, 'unknown');
      o.update(good); assert.equal(o.snapshot().report.freshness, 'unknown', 'same original stamp cannot restore revoked confidence');
      p.advance(1); o.update(facts()); assert.equal(o.snapshot().report.freshness, 'fresh');
      const same = facts(); same.report.freshness = 'stale'; o.update(same);
      assert.equal(o.snapshot().report.freshness, 'stale', 'same stamp may conservatively degrade');
    }]
  ]);
  console.log('PASS v2 observation: confidence, monotone freshness, absence, explicit job identity, immutable facts and FR/EN/ES.');
}
module.exports = {setup, plain, cases};
if (require.main === module) tests().catch(e => { console.error(e); process.exitCode = 1; });
