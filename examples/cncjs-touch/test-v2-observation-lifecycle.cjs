'use strict';
const assert = require('assert').strict, fs = require('fs');
const {page} = require('./test-v2-gate.cjs');
const {setup, cases} = require('./test-v2-observation.cjs');
async function tests() {
  await cases([
    ['late script after screen lock cannot sample or calculate', async () => {
      const p = page(); p.status(); p.frame(); await p.step(); await p.step();
      p.window.cncShell = {screen: () => 'home'}; p.emit('cnc-screen-change', 'home');
      p.emit('cnc-screen-lock', true); p.window.cncScreenLock = {locked: () => true};
      assert(p.api.use('observation').stub, 'lock precedes observation installation');
      await p.complete(); const o = p.api.use('observation');
      assert.equal(o.chart(), null, 'lock existed before script loaded');
      p.emit('cnc-screen-lock', false); assert(o.chart());
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
