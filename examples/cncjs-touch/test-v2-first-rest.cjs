'use strict';
// SPEC-REFONTE §3.1: setup activity waits for safe idle; only a machining
// workflow latches v1. Keep the real bootstrap and every existing gate check.
const assert = require('assert').strict;
const { page } = require('./test-v2-gate.cjs');
async function tests() {
  const setup = [
    [{ activeState: 'Alarm' }, {}],
    [{ activeState: 'Home', homing: true, canStop: true }, {}],
    [{ activeState: 'Jog', canStop: true, motion: { jog: true } }, {}],
    [{ probing: true, canStop: true }, {}],
    [{ probeBusy: true, canStop: true }, {}],
    [{ loading: true }, {}],
    [{ spindleSpeed: 1000 }, {}],
    [{}, { busy: true }],
    [{}, { halt: { canStop: true } }],
    [{}, { systemCommand: { title: 'fixture' } }]
  ];
  for (const [machine, detail] of setup) {
    const p = page();
    p.status(machine, detail); p.frame(); await p.complete();
    assert.equal(p.requests.length, 0, 'setup cannot start the bootstrap: ' + JSON.stringify([machine, detail]));
    p.status(); p.frame(); await p.complete();
    assert(p.classes.has('perf-v2'), 'setup permits v2 at the first safe rest: ' + JSON.stringify([machine, detail]));
    p.emit('pagehide');
  }
  for (const workflow of ['running', 'paused']) {
    const p = page();
    p.status({ workflow, activeState: workflow === 'running' ? 'Run' : 'Hold' });
    p.status(); p.frame(); await p.complete();
    assert.equal(p.requests.length, 0, 'a job seen before the first frame retains v1');
    assert(!p.classes.has('perf-v2'));
    p.emit('pagehide');
  }
  console.log('PASS v2 first rest: homing with canStop, setup, spindle and command waits, running/paused session latch.');
}
tests().catch(error => { console.error(error); process.exitCode = 1; });
