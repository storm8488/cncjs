'use strict';
// D6 (L7, round 2): in v2, opening Préparer during a job or an alarm requested the advanced origin
// modules (and origin-preview.css with them): an advanced load outside rest. Now the request waits
// for a safe Idle (cncV2.state().safeIdle) and is made at the next v2 state change at rest. The v1
// page keeps its behaviour (the card says « suspendu » itself).
const assert = require('assert').strict;
const { preparerPage, idle } = require('./test-v2-preparer-fixture.cjs');
(async () => {
  for (const machine of [idle({ activeState: 'Alarm' }), idle({ workflow: 'running', activeState: 'Run' }), idle({ workflow: 'paused', activeState: 'Hold:0' }), idle({ fresh: false })]) {
    const p = preparerPage({ safeIdle: false }); p.status(machine);
    p.show('home'); p.show('jog'); p.emit('cnc-layout-change'); p.emit('cnc-profile-change'); p.emit('cnc-v2-change'); await p.flush();
    assert.equal(p.calls.loads.length, 0, 'no advanced request outside rest: ' + machine.activeState + '/' + machine.workflow);
    assert.equal(p.calls.mount.length, 0);
    // Back to a safe Idle: the v2 state change brings the request, in a frame.
    p.v2.safeIdle = true; p.status(idle()); p.emit('cnc-v2-change'); await p.flush();
    assert.equal(p.calls.loads.length, 1, 'requested once at rest'); p.resolveLoads(); await p.flush();
    assert.equal(p.calls.mount.length, 1);
  }
  // v1 (no v2 layout): unchanged, the request is made whatever the machine state.
  const v1 = preparerPage({ v2: false, contract: false }); v1.status(idle({ activeState: 'Alarm' })); v1.show('jog'); await v1.flush();
  assert(v1.calls.loads.length >= 1, 'v1 behaviour kept');
  console.log('PASS v2 préparer rest: no advanced origin load outside a safe Idle in v2; requested at the next rest; v1 unchanged.');
})().catch(e => { console.error(e); process.exitCode = 1; });
