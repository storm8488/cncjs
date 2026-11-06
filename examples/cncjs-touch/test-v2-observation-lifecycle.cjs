'use strict';
const assert = require('assert').strict, fs = require('fs');
const {page} = require('./test-v2-gate.cjs');
const {setup, cases} = require('./test-v2-observation.cjs');
async function tests() {
  await cases([
    ['late script after screen lock cannot sample or calculate', async () => {
      const p = page(); p.status(); p.frame();
      for (let n = 0; n < 4; n++) await p.step();
      p.window.cncShell = {screen: () => 'home'}; p.emit('cnc-screen-change', 'home');
      const pending = p.requests[p.requests.length - 1], requests = p.requests.length;
      assert.equal(pending.url, 'performance-observation.js?v=v2f');
      assert.equal(p.api.state().ready, false);
      let locked = true; p.window.cncScreenLock = {locked: () => locked};
      p.emit('cnc-screen-lock', true);
      assert(p.api.use('observation').stub, 'lock precedes observation installation');
      assert.equal(p.api.gate(), false); assert.equal(pending.node.parentNode, null);
      // A cancelled script may still execute, but the revoked bootstrap cannot install it.
      p.respond(pending);
      await p.complete(); const o = p.api.use('observation');
      assert(o.stub, 'late observation stays a stub');
      assert.equal(typeof o.chart, 'undefined', 'no chart calculation is installed');
      const snapshot = o.snapshot();
      assert.equal(snapshot.available, false); assert.equal(snapshot.samples.length, 0);
      assert.equal(snapshot.estimate.seconds, null);
      assert.equal(o.update({get report() { assert.fail('stub must not read observation input'); }}), snapshot);
      const life = p.api.lifecycle.scope('home', 'observation'); let cancelled = 0;
      assert.equal(life.token(), null, 'no read or calculation token while locked');
      life.track('read', () => cancelled++); assert.equal(cancelled, 1);
      life.frame(() => assert.fail('late script must not render')); p.frame();
      assert.equal(p.requests.length, requests); assert.equal(p.frames.size, 0);
      // Locking an incomplete bootstrap stops it for this page opening. Unlocking
      // does not retry it, even at fresh Idle; v2 needs a new idle page opening.
      locked = false; p.emit('cnc-screen-lock', false); p.status(); await p.complete();
      assert.equal(p.api.gate(), false); assert.equal(p.api.state().ready, false);
      assert.equal(p.api.state().layout, false); assert.equal(p.api.use('observation'), o);
      assert.equal(o.snapshot(), snapshot); assert.equal(life.token(), null);
      assert.equal(p.requests.length, requests); assert.equal(p.frames.size, 0);
      life.dispose(); p.emit('pagehide');
    }],
    ['lock and hidden document pause the chart and terminal cleanup removes listeners', async () => {
      const p = page(); p.status(); p.frame(); await p.step(); await p.step();
      p.window.cncShell = {screen: () => 'home'}; p.emit('cnc-screen-change', 'home');
      const listeners = new Map();
      p.document.addEventListener = (type, fn) => listeners.set(type, fn);
      p.document.removeEventListener = (type, fn) => { if (listeners.get(type) === fn) listeners.delete(type); };
      await p.complete(); const o = p.api.use('observation'); assert(o.chart());
      p.document.hidden = true; listeners.get('visibilitychange')(); p.advance(1000); assert.equal(o.chart(), null);
      p.document.hidden = false; listeners.get('visibilitychange')(); assert(o.chart());
      p.emit('cnc-screen-lock', true); p.advance(1000); assert.equal(o.chart(), null);
      p.emit('cnc-screen-lock', false); assert(o.chart());
      o.dispose(); assert.equal(listeners.size, 0); assert.equal(o.chart(), null); o.dispose();
    }],
    ['job identity release clears data and terminal events prevent resurrection', async () => {
      for (const reason of ['eco', 'gpu', 'pagehide', 'dispose']) {
        const {p, o, identity, facts} = await setup(); o.update(facts()); o.chart();
        p.status({fingerprint: 'other'}); assert.equal(o.snapshot().identity, null); assert.equal(o.snapshot().samples.length, 0);
        o.reset(identity); o.update(facts());
        if (reason === 'eco') p.window.cncProfile.setPerformance('eco');
        if (reason === 'gpu') { p.gpu.lost = true; p.emit('cnc-gpu-change', null); }
        if (reason === 'pagehide') p.emit('pagehide', {persisted: true});
        if (reason === 'dispose') o.dispose();
        o.reset(identity); o.update(facts()); assert.equal(o.snapshot().available, false); assert.equal(o.snapshot().identity, null);
        assert.equal(o.snapshot().samples.length, 0); assert.equal(o.chart(), null);
      }
    }],
    ['gate guards loading, data-only model never schedules DOM/network/machine work', async () => {
      for (const options of [{profile: 'eco'}, {gpu: false}, {wide: false}, {kind: 'laser'}]) {
        const p = page(options); p.status(); p.frame(); await p.complete(); const before = p.requests.length;
        p.run('performance-observation.js'); assert.equal(p.requests.length, before); assert.equal(p.frames.size, 0);
      }
      const {p, v, o, facts} = await setup(); const before = p.requests.length;
      for (let n = 0; n < 1000; n++) { p.advance(10); o.update(facts()); o.chart(); o.presentation(); }
      assert.equal(p.requests.length, before); assert.equal(p.frames.size, 0); assert.equal(v.commands, null);
      assert.equal(v.notify('observation'), true);
      const source = fs.readFileSync(__dirname + '/touch/performance-observation.js', 'utf8');
      require('acorn').parse(source, {ecmaVersion: 2017}); assert(!source.includes('\r'), 'LF source');
    }]
  ]);
  console.log('PASS v2 observation lifecycle: late lock, hidden document, job release, Eco/GPU/pagehide, no side effects, ES2017/LF.');
}
if (require.main === module) tests().catch(e => { console.error(e); process.exitCode = 1; });
