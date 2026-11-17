/* eslint-env jest */
// « Pause et dégager » (F2) end to end on the LUNYEE profile of the simulator (F2-CONCEPTION.md
// § 12.2): the real GrblController streams a file of arcs to the simulator, the tablet asks for
// « Pause et dégager » in the middle, the bit rises, the spindle stops, the resume lowers it and the
// file goes to its end. Its end point and every line it sent are those of a witness run without
// pause. Fake timers: the simulator's planner and CNCjs's own poll run on them.
import fs from 'fs';
import os from 'os';
import path from 'path';
import config from '../../configstore';
import { createService } from '../job-service';
import { createControl } from '../control';
import { provenOffset } from './support/proven-offset';
import { simController } from './support/sim-controller';

jest.mock('../../../lib/logger', () => {
  const l = () => ({ error: () => {}, warn: () => {}, info: () => {}, verbose: () => {}, debug: () => {}, silly: () => {} });
  return { __esModule: true, default: l, getLevel: () => 'info', setLevel: () => {} };
});

const A = { kind: 'touch', id: 'tablet-A', label: 'Tablette A' };
// Lines CNCjs writes by itself (its poll, its reading of the settings).
const POLL = ['$G\n', '$$\n', '$I\n'];
const linesOf = (written) => written.filter((d) => /\n$/.test(d) && !POLL.includes(d));

let root;
beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'retract-lunyee-'));
  const lines = ['G21 G90 G94 G54', 'M3 S1000', 'G0 X10 Y10', 'G0 Z2', 'G1 Z-1 F300'];
  for (let i = 0; i < 40; i++) {
    // Arcs only: whatever line comes first after the resume starts from the interpreter's position.
    lines.push(i % 2 ? 'G3 X10 Y10 R5 F1500' : 'G2 X20 Y10 R5 F1500');
  }
  lines.push('G0 Z5', 'M5', 'M2');
  fs.writeFileSync(path.join(root, 'arcs.nc'), lines.join('\n'));
});
afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const runs = [];
afterEach(() => {
  runs.splice(0).forEach((run) => {
    run.service.dispose();
    run.close();
  });
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// A homed LUNYEE simulator with its G54, the file loaded and started from tablet A.
const start = async (simOptions = {}) => {
  jest.spyOn(config, 'get').mockImplementation((key, def) => def);
  jest.useFakeTimers();
  const made = simController(simOptions);
  const run = { ...made, machines: [], log: [] };
  runs.push(run);
  const registry = { '/dev/null': made.controller };
  run.control = createControl({ now: () => Date.now(), elapsed: () => Date.now() });
  run.service = createService(
    { get: () => registry },
    { get: (key, def) => (key === 'touch.machines' ? run.machines : { watchDirectory: root, events: [], macros: [], 'touch.motion.enabled': true }[key] ?? def) },
    () => Date.now(),
    { workOffset: provenOffset, control: run.control, history: { record: (e) => run.log.push(e) } }
  );
  run.state = () => run.service.list()[0];
  // Time goes by in steps of 50 ms; the stream heartbeat (observe) every step.
  run.wait = async (ms) => {
    for (let t = 0; t < ms; t += 50) {
      // eslint-disable-next-line no-await-in-loop
      await jest.advanceTimersByTimeAsync(50);
      run.service.observe();
    }
  };
  run.until = async (test, maxMs, what) => {
    for (let t = 0; t < maxMs; t += 50) {
      if (test()) {
        return;
      }
      // eslint-disable-next-line no-await-in-loop
      await jest.advanceTimersByTimeAsync(50);
      run.service.observe();
    }
    throw new Error('not reached in ' + maxMs + ' ms: ' + what + ' ' + JSON.stringify(run.state().pauseRetract));
  };
  run.service.list();
  run.service.openTransport('tA', A);
  made.controller.write('?');
  await run.wait(1000);
  made.controller.writeln('$H');
  await run.wait(2500);
  made.controller.writeln('G10 L2 P1 X100 Y100 Z-20');
  await run.wait(1500);
  run.machines.push({ id: 'm-0123456789ab', label: 'CNC', kind: 'cnc', signature: run.state().machineProfile.signature, createdAt: 'x', updatedAt: 'x' });
  expect(run.state()).toMatchObject({ homed: true, activeState: 'Idle' });
  run.generation = run.state().generation;
  run.req = (action, extra = {}) => run.service.action({ port: '/dev/null', generation: run.generation, transportId: 'tA', action, ...extra }, A);
  await run.req('load', { file: 'arcs.nc' });
  await run.wait(500);
  const ticket = await run.req('prepare', { operation: 'start', revision: run.state().revision });
  await run.req('start', { nonce: ticket.nonce });
  return run;
};

const finish = async (run) => {
  await run.until(() => run.controller.workflow.state === 'idle' && run.state().finished, 240000, 'end of the file');
  await run.wait(500);
  return { ...run.sim.machinePosition };
};

// The lines of the file: all but those written between « Pause et dégager » and the resume (`~`).
const fileLines = (run) => (run.retractMark === undefined ? linesOf(run.written)
  : linesOf(run.written.slice(0, run.retractMark)).concat(linesOf(run.written.slice(run.written.indexOf('~', run.retractMark)))));
const ours = (run) => linesOf(run.written.slice(run.retractMark, run.written.indexOf('~', run.retractMark)));

const pauseAndRetract = async (run) => {
  await run.until(() => run.controller.sender.state.received >= 20, 120000, 'line 20');
  const t = await run.req('prepare', { operation: 'retract', revision: run.state().revision });
  run.retractMark = run.written.length;
  await run.req('retract', { nonce: t.nonce });
  await run.until(() => (run.state().pauseRetract || {}).phase === 'lifting', 60000, 'rest');
  const rest = { ...run.sim.machinePosition };
  await run.until(() => (run.state().pauseRetract || {}).phase === 'parked', 60000, 'parked');
  return rest;
};

const resume = async (run) => {
  await run.wait(1000);
  const t = await run.req('prepare', { operation: 'resume', revision: run.state().revision });
  await run.req('resume', { nonce: t.nonce });
  await run.until(() => run.state().pauseRetract === null && run.controller.workflow.state === 'running', 60000, 'resume');
};

const near = (a, b) => ['x', 'y', 'z'].forEach((axis) => expect([axis, Math.abs(a[axis] - b[axis]) < 0.001]).toEqual([axis, true]));

describe.each([['zero'], ['stored']])('LUNYEE, offset after homing %s (E-B)', (executedAfterHoming) => {
  test('25-26, 29-30. the full path: rest, lift to 5 mm under the top, M5, resume on an arc, same end and same lines as without pause', async () => {
    const witness = await start({ executedAfterHoming });
    const end = await finish(witness);
    const lines = fileLines(witness);
    expect(witness.errors).toEqual([]);
    runs.splice(0).forEach((run) => {
      run.service.dispose();
      run.close();
    });

    const run = await start({ executedAfterHoming });
    const rest = await pauseAndRetract(run);
    // The simulator stopped at the end of the last line received; then only Z moved.
    expect(run.sim.machinePosition.x).toBeCloseTo(rest.x, 3);
    expect(run.sim.machinePosition.y).toBeCloseTo(rest.y, 3);
    expect(run.sim.machinePosition.z).toBeCloseTo(-5, 3);
    expect(run.sim.parserState.spindle).toBe('M5');
    expect(run.written.filter((d) => d === '!' || d === '\x18')).toEqual([]);
    const lift = run.state().pauseRetract.lift;
    expect(Number(lift.to)).toBeCloseTo(-5, 3);
    await resume(run);
    // Back where the file stopped, spindle running, before the first arc after the resume.
    const d = Number(lift.distance);
    expect(ours(run)).toEqual(['$J=G91 G21 Z' + d + ' F600\n', 'M5\n', 'M3 S1000\n', 'G4 P3\n']
      .concat(d > 5 ? ['$J=G91 G21 Z-' + Math.round((d - 5) * 1000) / 1000 + ' F600\n'] : [])
      .concat(['$J=G91 G21 Z-' + Math.min(d, 5) + ' F100\n']));
    const last = await finish(run);
    near(last, end);
    expect(run.errors).toEqual([]);
    expect(fileLines(run)).toEqual(lines);
    expect(run.state().finished).toBe(true);
  }, 120000);
});

test.each([['keep'], ['restart']])('31. Arrêter while parked writes no reset (resetAtRest %s): the machine keeps its reference', async (resetAtRest) => {
  const run = await start({ resetAtRest });
  await pauseAndRetract(run);
  const mark = run.written.length;
  await run.req('stop');
  await run.wait(2000);
  expect(run.written.slice(mark).filter((d) => d === '\x18' || d === '!')).toEqual([]);
  expect(run.state()).toMatchObject({ homed: true, jobStopped: true, pauseRetract: null });
}, 120000);

test('32. a feed override of 10 % during the lift: no false time limit (the jog does not follow it)', async () => {
  const run = await start();
  await run.until(() => run.controller.sender.state.received >= 20, 120000, 'line 20');
  for (let i = 0; i < 9; i++) {
    // eslint-disable-next-line no-await-in-loop
    await run.req('override', { kind: 'feed', value: -10 });
  }
  const t = await run.req('prepare', { operation: 'retract', revision: run.state().revision });
  await run.req('retract', { nonce: t.nonce });
  await run.until(() => ['parked', 'failed', 'held'].includes((run.state().pauseRetract || {}).phase), 120000, 'parked');
  expect(run.state().pauseRetract).toMatchObject({ phase: 'parked', failure: null });
}, 120000);
