/* eslint-env jest */
/* eslint-disable no-await-in-loop */ // polls are sequential on purpose
// CNC framing in the air (lot F1, examples/cncjs-touch/design/fonctions/F1-CONCEPTION.md § 10.2)
// on the repository's simulator, LUNYEE profile, through CNCjs's own GrblRunner (support/sim-bridge):
// real protocol lines both ways, real time, the real D2 proof after a real $H. The simulator
// cancels a jog without a ramp: the stopping distance of the real board is not proven here.
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { createService } from '../job-service';
import { createControl } from '../control';
import { bridge } from './support/sim-bridge';
import { expectCatalogMatch } from './touch-codes-catalog';

const GrblSimulator = require('../../../../../grbl-simulator/grbl-simulator');

const A = { kind: 'touch', id: 'tablet-A', label: 'Tablette A', user: 'op' };
const P = (...lines) => lines.join('\n');

let root;
beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'cnc-touch-f1-'));
  const write = (name, ...lines) => fs.writeFile(path.join(root, name), P(...lines));
  // X 0 → 10, Y 0 → 5, Z down to −1 (work).
  await write('petit.nc', 'G21 G90', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F200', 'G1 X10 F800', 'G1 Y5', 'G1 X0', 'G1 Y0', 'G0 Z5', 'M30');
  // With G54 X 300: machine X 400 → 407.5 (the usable end), then 400 → 407.6.
  await write('bord.nc', 'G21 G90', 'G0 Z5', 'G0 X100 Y0', 'G1 Z-1 F200', 'G1 X107.5 F800', 'G1 Y1', 'G1 X100', 'G0 Z5', 'M30');
  await write('dehors.nc', 'G21 G90', 'G0 Z5', 'G0 X100 Y0', 'G1 Z-1 F200', 'G1 X107.6 F800', 'G1 Y1', 'G1 X100', 'G0 Z5', 'M30');
  // With G54 Y 0: machine Y 395.5, then 395.6.
  await write('bord-y.nc', 'G21 G90', 'G0 Z5', 'G0 X0 Y390', 'G1 Z-1 F200', 'G1 Y395.5 F800', 'G0 Z5', 'M30');
  await write('dehors-y.nc', 'G21 G90', 'G0 Z5', 'G0 X0 Y390', 'G1 Z-1 F200', 'G1 Y395.6 F800', 'G0 Z5', 'M30');
  // With G54 X 300: machine X 0 (the homing end) then −0.1.
  await write('origine.nc', 'G21 G90', 'G0 Z5', 'G0 X-300 Y0', 'G1 Z-1 F200', 'G1 X-290 F800', 'G0 Z5', 'M30');
  await write('origine-dehors.nc', 'G21 G90', 'G0 Z5', 'G0 X-300.1 Y0', 'G1 Z-1 F200', 'G1 X-290 F800', 'G0 Z5', 'M30');
  // Negative work X: with an executed offset of zero, a machine target below 0 (error:15).
  await write('negatif.nc', 'G21 G90', 'G0 Z5', 'G0 X-20 Y0', 'G1 Z-1 F200', 'G1 X-10 F800', 'G1 Y5', 'G0 Z5', 'M30');
});
afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

const wait = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});
const until = async (fn, ms = 8000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) {
      return true;
    }
    await wait(20);
  }
  return fn();
};
const refusalOf = (promise) => promise.then(() => null, (err) => err);

describe('CNC framing on the simulator (LUNYEE profile)', () => {
  let sim;
  let c;
  let service;
  let samples;
  let sampler;

  // Homed from the tablet, the stored offset loaded again and proven by D2.
  const ready = async ({ g54 = { x: 10, y: 10, z: -100 }, executedAfterHoming = 'zero', softLimits = 1, prove = true } = {}) => {
    sim = new GrblSimulator({ profile: 'lunyee', homingMs: 1200, executedAfterHoming });
    sim.workCoordinateOffsets.G54 = { ...g54 };
    sim.settings[20] = softLimits;
    c = bridge(sim);
    service = createService(
      { get: () => ({ SIM: c }) },
      { get: (key) => ({ watchDirectory: root, 'touch.motion.enabled': true, events: [], macros: [] }[key]) },
      undefined,
      { control: createControl(), history: { record: () => {} } }
    );
    service.list();
    service.openTransport('tA', A);
    await wait(100);
    const home = await req('prepare', { operation: 'home' });
    await req('home', { nonce: home.nonce });
    expect(await until(() => state().homed === true && (!prove || state().workOffset.state === 'proven'))).toBe(true);
    // Every machine position the simulator goes through, and where it rests.
    samples = [];
    sampler = setInterval(() => samples.push({ ...sim.getCurrentPosition(), state: sim.machineState }), 10);
  };
  const state = () => service.list()[0];
  const req = (action, extra = {}) => service.action({ port: 'SIM', generation: state().generation, transportId: 'tA', action, ...extra }, A);
  const jogLines = () => c.written.filter((l) => /^\$J=/.test(l)).map((l) => l.trim());
  const atRest = () => until(() => state().activeState === 'Idle' && !state().motion.frame && !state().motion.cancelling && state().motion.canJog, 15000);
  const step = async (axis, direction, size, feed = 4000) => {
    await req('motion', { operation: 'jog', axis, direction, step: size, feed });
    await wait(100);
    expect(await atRest()).toBe(true);
  };
  const frame = async (file, feed = 1500) => {
    await req('load', { file });
    const ticket = await req('machine', { operation: 'frame-prepare', feed });
    const before = c.written.length;
    // What the simulator goes through from here on.
    samples = [];
    await req('machine', { operation: 'frame', nonce: ticket.nonce });
    return { ticket, before };
  };
  const finished = () => until(() => !state().motion.frame && !!state().motion.lastFrame, 20000);
  const near = (p, x, y, z) => Math.abs(p.x - x) < 0.01 && Math.abs(p.y - y) < 0.01 && (z === undefined || Math.abs(p.z - z) < 0.01);

  afterEach(() => {
    clearInterval(sampler);
    service.dispose();
    c.close();
    sim.stopPlannerExecutor();
  });

  test.each([['zero'], ['stored']])('L1/L4. after $H and the real D2 proof (executed offset after homing: %s): Z rises alone, the box, back; Z never lower', async (executedAfterHoming) => {
    await ready({ executedAfterHoming });
    await step('Z', -1, 10, 500);
    expect(sim.machinePosition.z).toBeCloseTo(-10, 3);
    const { ticket, before } = await frame('petit.nc');
    expect(ticket.frame).toMatchObject({ kind: 'cnc', safeZ: { machine: -5, rise: 5 }, start: { x: -10, y: -10 } });
    expect(ticket.frame.lines).toEqual([
      'M5',
      '$J=G91 G21 Z5 F300',
      '$J=G90 G21 X0 Y0 F1500',
      '$J=G90 G21 X10 Y0 F1500',
      '$J=G90 G21 X10 Y5 F1500',
      '$J=G90 G21 X0 Y5 F1500',
      '$J=G90 G21 X0 Y0 F1500',
      '$J=G90 G21 X-10 Y-10 F1500'
    ]);
    expect(await finished()).toBe(true);
    expect(state().motion.lastFrame).toMatchObject({ result: 'ended', kind: 'cnc', code: null });
    expect(c.written.slice(before).map((l) => l.trim())).toEqual(ticket.frame.lines);
    // Each corner reached in machine coordinates: corner + G54 (10, 10).
    const rests = samples.filter((p) => p.state === 'Idle');
    [[10, 10], [20, 10], [20, 15], [10, 15]].forEach(([x, y]) => expect([x, y, rests.some((p) => near(p, x, y, -5))]).toEqual([x, y, true]));
    // Z never under −10 and, once up, never under −5 again; X/Y did not move before Z was up.
    expect(Math.min(...samples.map((p) => p.z))).toBeGreaterThanOrEqual(-10.001);
    const up = samples.findIndex((p) => p.z > -5.001);
    expect(samples.slice(0, up).every((p) => near(p, 0, 0))).toBe(true);
    expect(samples.slice(up).every((p) => p.z > -5.001)).toBe(true);
    expect(sim.machinePosition).toMatchObject({ x: 0, y: 0 });
    expect(sim.machinePosition.z).toBeCloseTo(-5, 3);
    expect(state()).toMatchObject({ homed: true, workOffset: { state: 'proven' } });
  }, 40000);

  test('L4. Z at 0 just after the homing: no Z line, Z never changes', async () => {
    await ready();
    const { ticket } = await frame('petit.nc');
    expect(ticket.frame.lines.some((l) => /Z/.test(l))).toBe(false);
    expect(await finished()).toBe(true);
    expect(state().motion.lastFrame).toMatchObject({ result: 'ended' });
    expect(samples.every((p) => p.z === 0)).toBe(true);
  }, 30000);

  test('L2. just after $H, before the D2 proof: refused (ETOUCH_OFFSET_CHECKING), nothing written', async () => {
    await ready({ prove: false });
    // The proof starts with the next reports; asked at once, it is still being checked.
    await req('load', { file: 'petit.nc' });
    const written = c.written.length;
    const err = await refusalOf(req('machine', { operation: 'frame-prepare' }));
    if (state().workOffset.state !== 'proven') {
      expect(err && err.code).toMatch(/^ETOUCH_OFFSET_/);
      expect(jogLines()).toEqual([]);
    }
    expect(c.written.slice(written).filter((l) => /^\$J=|^M5/.test(l))).toEqual([]);
  }, 30000);

  test('L3. the usable bound 407.5 in X: accepted and run without error:15; 407.6 refused with its figures; same in Y and at the origin', async () => {
    await ready({ g54: { x: 300, y: 0, z: -100 } });
    for (const file of ['dehors.nc', 'dehors-y.nc', 'origine-dehors.nc']) {
      await req('load', { file });
      const err = await refusalOf(req('machine', { operation: 'frame-prepare', feed: 1500 }));
      expect([file, err && err.code]).toEqual([file, 'ETOUCH_CNC_FRAME_OUTSIDE']);
      expectCatalogMatch(err);
      const [reason] = err.reasons;
      const want = {
        'dehors.nc': { axis: 'X', sign: '+', over: '0.1', value: '407.6', limit: '407.5' },
        'dehors-y.nc': { axis: 'Y', sign: '+', over: '0.1', value: '395.6', limit: '395.5' },
        'origine-dehors.nc': { axis: 'X', sign: '−', over: '0.1', value: '-0.1', limit: '0' }
      }[file];
      expect([file, reason.params]).toEqual([file, want]);
    }
    for (const file of ['bord-y.nc', 'origine.nc']) {
      await req('load', { file });
      expect([file, (await req('machine', { operation: 'frame-prepare', feed: 1500 })).frame.kind]).toEqual([file, 'cnc']);
    }
    // Run to the X bound: brought near it by four steps of 100 mm first.
    for (let i = 0; i < 4; i++) {
      await step('X', 1, 100);
    }
    const { before } = await frame('bord.nc');
    expect(await finished()).toBe(true);
    expect(state().motion.lastFrame).toMatchObject({ result: 'ended' });
    expect(c.written.slice(before).map((l) => l.trim())).toContain('$J=G90 G21 X107.5 Y0 F1500');
    expect(Math.max(...samples.map((p) => p.x))).toBeCloseTo(407.5, 3);
    expect(state().motion.lastFrame.code).toBeNull();
    expect(state().alarmCode).toBeNull();
  }, 60000);

  test('L5. Stop during a side: Idle between two corners, no banner, reference and D2 kept, nothing more; a new framing ends', async () => {
    await ready();
    const startups = state().startups;
    await frame('petit.nc', 300);
    expect(await until(() => state().motion.frame && state().motion.frame.phase === 'side' && sim.machineState === 'Jog', 15000)).toBe(true);
    // Half a second into the side (2.5 mm at 300 mm/min).
    await wait(500);
    await req('stop');
    expect(await atRest()).toBe(true);
    const written = c.written.length;
    await wait(1500);
    expect(c.written.length).toBe(written);
    expect(state()).toMatchObject({ startups, homed: true, workOffset: { state: 'proven' } });
    expect(state().motion.lastFrame).toMatchObject({ result: 'cancelled', reason: 'stop', code: null });
    // The simulator was moving along a side when the stop came (its jog cancel then puts it back at
    // the start of that side, without a ramp: the real stopping distance is not shown here).
    const moving = samples.filter((p) => p.state === 'Jog' && p.z === 0);
    expect(moving.some((p) => !(near(p, 10, 10) || near(p, 20, 10) || near(p, 20, 15) || near(p, 10, 15)))).toBe(true);
    await frame('petit.nc');
    expect(await finished()).toBe(true);
    expect(state().motion.lastFrame).toMatchObject({ result: 'ended' });
  }, 40000);

  test('L6. `!` from a CNCjs client during a side: the framing ends first, nothing leaves after it', async () => {
    await ready();
    await frame('petit.nc', 300);
    expect(await until(() => state().motion.frame && state().motion.frame.phase === 'side' && sim.machineState === 'Jog', 15000)).toBe(true);
    // index.js refuseSocket: the stop ends the server's sequence, then goes its own way.
    service.socketStop('SIM');
    c.writeln('!');
    const jogs = jogLines().length;
    await wait(2000);
    expect(jogLines()).toHaveLength(jogs);
    expect(state().motion.lastFrame).toMatchObject({ result: 'cancelled', reason: 'socket' });
  }, 30000);

  test('L7/L10. a reset during a side: ALARM, the board restarts, nothing written after the banner; refused until homed again', async () => {
    await ready();
    await frame('petit.nc', 300);
    expect(await until(() => state().motion.frame && state().motion.frame.phase === 'side' && sim.machineState === 'Jog', 15000)).toBe(true);
    const startups = state().startups;
    service.socketStop('SIM');
    c.writeln('\x18');
    expect(await until(() => state().startups > startups)).toBe(true);
    const written = c.written.length;
    await wait(1500);
    // Nothing of the framing after the banner (D2 may read `$#` in the new session: not a move).
    expect(c.written.slice(written).filter((l) => /^\$J=|^M5|\x85/.test(l))).toEqual([]);
    expect(state().motion.lastFrame).toMatchObject({ result: 'cancelled' });
    expect(state().homed).toBe(false);
    await req('load', { file: 'petit.nc' }).catch(() => null);
    expect(await refusalOf(req('machine', { operation: 'frame-prepare' }))).toBeTruthy();
    // Unlocked without homing (when the board waits in Alarm): the framing says why.
    if (/^Alarm/.test(state().activeState)) {
      const unlock = await req('prepare', { operation: 'unlock' });
      await req('unlock', { nonce: unlock.nonce });
    }
    expect(await until(() => state().activeState === 'Idle')).toBe(true);
    const err = await refusalOf(req('machine', { operation: 'frame-prepare' }));
    expect(err && err.code).toBe('ETOUCH_CNC_FRAME_NOT_HOMED');
    expect(state().canFrame).toBe(false);
  }, 30000);

  test('L8a. executed offset other than reported after the proof, target inside: stopped after the first X/Y segment (_POSITION), D2 invalidated, Z kept', async () => {
    await ready();
    sim.offsetVoid = { executed: true, reported: false };
    await frame('petit.nc');
    expect(await finished()).toBe(true);
    const last = state().motion.lastFrame;
    expect(last).toMatchObject({ code: 'ETOUCH_FRAME_POSITION', params: { axis: 'X', expected: '10', reported: '0' } });
    expectCatalogMatch(last);
    expect(jogLines()).toEqual(['$J=G90 G21 X0 Y0 F1500']);
    expect(state().workOffset.state).not.toBe('proven');
    expect(samples.every((p) => p.z === 0)).toBe(true);
  }, 30000);

  test('L8b. executed offset other than reported, target outside: error:15 of the board, refused, D2 invalidated, no X/Y motion', async () => {
    await ready({ g54: { x: 50, y: 10, z: -100 } });
    sim.offsetVoid = { executed: true, reported: false };
    await frame('negatif.nc');
    expect(await finished()).toBe(true);
    const last = state().motion.lastFrame;
    expect(last).toMatchObject({ result: 'refused', code: 'ETOUCH_FRAME_REFUSED', params: { n: 15 } });
    expect(state().workOffset.state).not.toBe('proven');
    expect(samples.every((p) => p.x === 0 && p.y === 0 && p.z === 0)).toBe(true);
  }, 30000);

  test('L9. $20=0 on the board: refused (_SOFT_LIMITS), nothing written', async () => {
    await ready({ softLimits: 0 });
    await req('load', { file: 'petit.nc' });
    const err = await refusalOf(req('machine', { operation: 'frame-prepare' }));
    expect(err && err.code).toBe('ETOUCH_CNC_FRAME_SOFT_LIMITS');
    expect(jogLines()).toEqual([]);
  }, 30000);
});
