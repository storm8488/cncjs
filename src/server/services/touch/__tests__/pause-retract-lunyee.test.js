/* eslint-env jest */
// « Pause et dégager » (F2) end to end on the LUNYEE profile of the simulator (F2-CONCEPTION.md
// § 12.2): the real GrblController streams a file of arcs to the simulator, the tablet asks for
// « Pause et dégager » in the middle, the bit rises, the spindle stops, the resume lowers it and the
// file goes to its end. Its end point, every line it sent and every block the board planned (start,
// end and centre of each line and arc) are those of a witness run without pause. The simulator keeps
// the interpreter's position apart from the machine position, as upstream Grbl does (option
// interpreterPosition): a jog is planned from it and sets it, so a desync is not hidden by a planner
// that would restart from the machine position (F2-CORRECTIONS.md D10). Fake timers: the
// simulator's planner and CNCjs's own poll run on them.
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
const close = (a, b) => (a === null && b === null) || (!!a && !!b && ['x', 'y', 'z'].every((axis) => Math.abs(a[axis] - b[axis]) < 0.001));
// The blocks of the file the board planned (jogs left out): kind, start, end and centre.
const fileBlocks = (run) => run.sim.blocks.filter((b) => b.kind !== 'jog');
const sameBlock = (a, b) => !!a && !!b && a.kind === b.kind && close(a.start, b.start) && close(a.end, b.end) && close(a.center, b.center);
const sameBlocks = (a, b) => a.length === b.length && a.every((block, i) => sameBlock(block, b[i]));
// Where the machine and the interpreter are when CNCjs writes `~` (the resume of the file).
const watchResume = (run) => {
  const write = run.controller.connection.write;
  run.controller.connection.write = (data) => {
    if (data === '~' && run.atResume === undefined) {
      run.atResume = {
        machine: { ...run.sim.machinePosition },
        interpreter: run.sim.interpreterPosition && { ...run.sim.interpreterPosition },
        blocks: fileBlocks(run).length,
        spindle: run.sim.parserState.spindle,
        speed: run.sim.spindleSpeed
      };
      if (run.onResume) {
        run.onResume();
      }
    }
    write(data);
  };
};
const TRACKED = { interpreterPosition: true, recordBlocks: true };

describe.each([['zero'], ['stored']])('LUNYEE, offset after homing %s (E-B)', (executedAfterHoming) => {
  test('25-26, 29-30. the full path: rest, lift to 5 mm under the top, M5, resume on an arc, same end and same lines as without pause', async () => {
    const witness = await start({ executedAfterHoming, ...TRACKED });
    const end = await finish(witness);
    const lines = fileLines(witness);
    const blocks = fileBlocks(witness);
    expect(witness.errors).toEqual([]);
    runs.splice(0).forEach((run) => {
      run.service.dispose();
      run.close();
    });

    const run = await start({ executedAfterHoming, ...TRACKED });
    watchResume(run);
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
    // The resume point: when `~` leaves, the machine and the interpreter are both where the file
    // stopped, and the first block planned after it starts there (the witness's next block).
    near(run.atResume.machine, rest);
    near(run.atResume.interpreter, rest);
    expect([run.atResume.spindle, run.atResume.speed]).toEqual(['M3', 1000]);
    const d = Number(lift.distance);
    expect(ours(run)).toEqual(['$J=G91 G21 Z' + d + ' F600\n', 'M5\n', 'M3 S1000\n', 'G4 P3\n']
      .concat(d > 5 ? ['$J=G91 G21 Z-' + Math.round((d - 5) * 1000) / 1000 + ' F600\n'] : [])
      .concat(['$J=G91 G21 Z-' + Math.min(d, 5) + ' F100\n']));
    const last = await finish(run);
    near(last, end);
    expect(run.errors).toEqual([]);
    expect(fileLines(run)).toEqual(lines);
    near(fileBlocks(run)[run.atResume.blocks].start, rest);
    // Every block of the file, before and after the pause: same start, end and centre.
    expect(fileBlocks(run).length).toBe(blocks.length);
    fileBlocks(run).forEach((block, i) => expect([i, sameBlock(block, blocks[i])]).toEqual([i, true]));
    expect(run.state().finished).toBe(true);
  }, 120000);
});

describe('LUNYEE, the witness detects a desync of the interpreter (D10)', () => {
  test('an interpreter 1 mm off while the bit is up: the descent does not end where expected, F2 stops, no `~`', async () => {
    const run = await start(TRACKED);
    watchResume(run);
    await pauseAndRetract(run);
    const p = run.sim.interpreterPosition || run.sim.machinePosition;
    run.sim.interpreterPosition = { ...p, z: p.z + 1 };
    await run.wait(1000);
    const t = await run.req('prepare', { operation: 'resume', revision: run.state().revision });
    await run.req('resume', { nonce: t.nonce });
    await run.until(() => (run.state().pauseRetract || {}).phase === 'failed', 60000, 'failed');
    expect(run.state().pauseRetract.failure.code).toBe('ETOUCH_RETRACT_POSITION');
    expect(run.atResume).toBe(undefined);
    expect(run.written.slice(run.retractMark)).not.toContain('~');
  }, 120000);

  test('a descent 0.005 mm short (inside the 0.01 mm tolerance of F2): the resume point and the blocks after it show it', async () => {
    const witness = await start(TRACKED);
    await finish(witness);
    const blocks = fileBlocks(witness);
    runs.splice(0).forEach((run) => {
      run.service.dispose();
      run.close();
    });
    const run = await start(TRACKED);
    watchResume(run);
    // The last millimetres of the descent altered on the line to the board: F2 cannot see it.
    const write = run.controller.connection.write;
    const plunge = /^\$J=G91 G21 Z-\d+(\.\d+)? F100\n$/;
    run.controller.connection.write = (data) => write(plunge.test(data) ? data.replace(/Z-(\d+(\.\d+)?)/, (all, v) => 'Z-' + (Number(v) - 0.005).toFixed(3)) : data);
    const rest = await pauseAndRetract(run);
    await resume(run);
    await run.wait(3000);
    expect(Math.abs(run.atResume.interpreter.z - rest.z - 0.005)).toBeLessThan(0.0005);
    const k = run.atResume.blocks;
    expect(sameBlocks(fileBlocks(run).slice(0, k), blocks.slice(0, k))).toBe(true);
    expect(sameBlock(fileBlocks(run)[k], blocks[k])).toBe(false);
  }, 120000);

  test('an interpreter shifted when `~` leaves (invisible to the reports): the blocks after it differ from the witness', async () => {
    const witness = await start(TRACKED);
    await finish(witness);
    const blocks = fileBlocks(witness);
    runs.splice(0).forEach((run) => {
      run.service.dispose();
      run.close();
    });
    const run = await start(TRACKED);
    watchResume(run);
    run.onResume = () => {
      const p = run.sim.interpreterPosition || run.sim.machinePosition;
      run.sim.interpreterPosition = { ...p, x: p.x + 0.5 };
    };
    await pauseAndRetract(run);
    await resume(run);
    await run.wait(3000);
    const k = run.atResume.blocks;
    expect(sameBlocks(fileBlocks(run).slice(0, k), blocks.slice(0, k))).toBe(true);
    expect(fileBlocks(run).length).toBeGreaterThan(k);
    expect(sameBlock(fileBlocks(run)[k], blocks[k])).toBe(false);
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

// Up to the lift: the file paused at line 20, then « Pause et dégager » confirmed, until the jog leaves.
const untilLift = async (run) => {
  await run.until(() => run.controller.sender.state.received >= 20, 120000, 'line 20');
  const t = await run.req('prepare', { operation: 'retract', revision: run.state().revision });
  run.retractMark = run.written.length;
  await run.req('retract', { nonce: t.nonce });
  await run.until(() => run.written.slice(run.retractMark).some((d) => /^\$J=/.test(d)), 60000, 'the lift');
};

test('27. the board refuses the lift beyond its soft limits (error:15): no alarm, no restart, the bit stays (held)', async () => {
  const run = await start();
  // At the lift, the board's Z envelope no longer matches what the server learned: Z homes
  // towards + now, so the target 5 mm under the top (machine Z -5) lies outside it.
  const write = run.controller.connection.write;
  run.controller.connection.write = (data) => {
    if (/^\$J=/.test(data)) {
      run.sim.settings[23] = 7;
    }
    write(data);
  };
  await untilLift(run);
  await run.until(() => ['held', 'failed'].includes((run.state().pauseRetract || {}).phase), 10000, 'held');
  await run.wait(1500);
  expect(run.errors).toEqual(['error:15']);
  expect(run.state().pauseRetract).toMatchObject({ phase: 'held', failure: { code: 'ETOUCH_RETRACT_ERROR', params: { error: 15 } } });
  expect(run.sim.machineState).toBe('Idle');
  expect(run.state()).toMatchObject({ homed: true, activeState: 'Idle' });
  // One jog, refused; nothing else of ours, no hold, no reset.
  expect(linesOf(run.written.slice(run.retractMark))).toEqual([expect.stringMatching(/^\$J=G91 G21 Z\d+(\.\d+)? F600\n$/)]);
  expect(run.written.slice(run.retractMark).filter((d) => d === '!' || d === '\x18')).toEqual([]);
}, 120000);

test('28. a limit switch during the lift (ALARM:1, the board restarts): nothing of ours in the new session, resume refused', async () => {
  const run = await start();
  await untilLift(run);
  await run.wait(200);
  expect(run.sim.setLimitPin('z', true)).toBe(true);
  run.sim.setLimitPin('z', false);
  const mark = run.written.length;
  await run.wait(3000);
  expect(run.sim.machinePosition).toEqual({ x: 0, y: 0, z: 0 });
  expect(run.state().pauseRetract).toMatchObject({ phase: 'failed' });
  expect(['ETOUCH_RETRACT_ALARM', 'ETOUCH_RETRACT_RESTART']).toContain(run.state().pauseRetract.failure.code);
  expect(linesOf(run.written.slice(mark))).toEqual([]);
  expect(run.written.slice(mark).filter((d) => d === '\x85' || d === '~')).toEqual([]);
  expect(run.state()).toMatchObject({ canResume: false, homed: false });
  await expect(run.req('prepare', { operation: 'resume', revision: run.state().revision })).rejects.toThrow();
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
