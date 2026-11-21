/* eslint-env jest */
/* eslint-disable no-await-in-loop */ // polls are sequential on purpose
// Reference guards (PLAN-CORRECTIONS § 1.5, constats C-05 and C-18, journal T2, parcours P8).
// Field fact of the LUNYEE 4040: ALARM:2, a limit alarm or a Stop in the middle of a job
// restart the board, which comes back at MPos 0,0,0 where the tool stopped, not referenced,
// while G54 stays in its memory: wrong by the whole distance between the old machine origin
// and that point. After Unlock ($X), with homing enabled ($22=1), the server must start
// nothing (a program, a resume from a line) and take no work zero (plate, « zero here ») until
// a homing: a zero set before it would be wrong after it. Never overridden. $22=0 or unknown:
// nothing changes. Converted from bughunt-A1-4 and bughunt-V1-1.
// Two benches: the repository's simulator on its LUNYEE profile (real time, real D2 proof),
// and a small fake board with a proven offset for the plate and the settings.
import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { createService, START_MESSAGES } from '../job-service';
import { createControl } from '../control';
import { bridge } from './support/sim-bridge';
import { provenOffset } from './support/proven-offset';
import { expectCatalogMatch } from './touch-codes-catalog';

const GrblSimulator = require('../../../../../grbl-simulator/grbl-simulator');

const A = { kind: 'touch', id: 'tablet-A', label: 'Tablette A', user: 'op' };
const LUNYEE = {
  $10: '1',
$13: '0',
$20: '1',
$21: '1',
$22: '1',
$23: '3',
$27: '2.000',
$30: '1000',
$31: '0',
$32: '0',
  $110: '4000',
$111: '4000',
$112: '800',
$130: '408',
$131: '396',
$132: '130'
};
const f3 = (n) => n.toFixed(3);

let root;
beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'cnc-touch-ref-'));
  await fs.writeFile(path.join(root, 'piece.nc'), ['G21 G90 G94', 'M3 S9000', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F200',
    'G1 X10 F800', 'G1 Y10', 'G1 X0', 'G0 Z5', 'M5', 'M30'].join('\n'));
});
afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

const refusalOf = (promise) => promise.then(() => null, (err) => err);

// ---------------------------------------------------------------------------
// Bench 1: the simulator, LUNYEE profile, through the shared bridge (real time).
// ---------------------------------------------------------------------------

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

describe('reference guards on the simulator (LUNYEE profile): restart, Unlock, then nothing', () => {
  let sim;
  let c;
  let service;

  const state = () => service.list()[0];
  const req = (action, extra = {}) => service.action({ port: 'SIM', generation: state().generation, transportId: 'tA', action, ...extra }, A);
  const started = () => c.jobs.filter((j) => j[0] === 'gcode:start').length;
  const home = async () => {
    const t = await req('prepare', { operation: 'home' });
    await req('home', { nonce: t.nonce });
    expect(await until(() => state().homed === true && state().workOffset.state === 'proven')).toBe(true);
  };
  // Homed, G54 (100, 100, −115) proven, the program loaded; then a target of the PC above the
  // travel (G53 G0 Z0.5): ALARM:2, the board restarts at MPos 0, then Unlock from the tablet.
  const restarted = async () => {
    sim = new GrblSimulator({ profile: 'lunyee', homingMs: 200 });
    sim.workCoordinateOffsets.G54 = { x: 100, y: 100, z: -115 };
    c = bridge(sim);
    service = createService(
      { get: () => ({ SIM: c }) },
      { get: (key) => ({ watchDirectory: root, 'touch.motion.enabled': true, events: [], macros: [] }[key]) },
      undefined,
      { control: createControl() }
    );
    service.list();
    service.openTransport('tA', A);
    await wait(100);
    await home();
    await req('load', { file: 'piece.nc' });
    expect(state()).toMatchObject({ canStart: true, referenceLost: null, motion: { canSetOrigin: true } });
    c.command('gcode', 'G53 G0 Z0.5');
    expect(await until(() => state().startups === 1 && state().activeState === 'Alarm' && state().fresh)).toBe(true);
    // ALARM:2, then the restart: MPos 0 where the tool stood.
    expect(state().coordinates.mpos).toEqual({ x: '0.000', y: '0.000', z: '0.000' });
    const unlock = await req('prepare', { operation: 'unlock' });
    await req('unlock', { nonce: unlock.nonce });
    expect(await until(() => state().activeState === 'Idle' && state().workOffset.state === 'proven')).toBe(true);
  };

  afterEach(() => {
    service.dispose();
    c.close();
    sim.stopPlannerExecutor();
  });

  test('C-05: after the restart and Unlock, the loaded program does not start, even overridden; a homing lifts it', async () => {
    await restarted();
    // The offset is proven (the board loaded G54 back), the reference is not: what A1-4 showed.
    expect(state()).toMatchObject({ homed: false, referenceLost: 'restart', canStart: false });
    expect(state().refusals.start).toEqual({ code: 'ETOUCH_START_NOT_HOMED', params: {} });
    expect(state().startReason).toBe(START_MESSAGES.ETOUCH_START_NOT_HOMED);
    const err = await refusalOf(req('prepare', { operation: 'start', revision: state().revision }));
    expect(err).toMatchObject({ status: 409, code: 'ETOUCH_START_NOT_HOMED', params: {} });
    expectCatalogMatch({ code: err.code, params: err.params, message: err.message });
    expect(await refusalOf(req('prepare', { operation: 'start', revision: state().revision, override: 'travel' }))).toMatchObject({ code: 'ETOUCH_START_NOT_HOMED' });
    expect(started()).toBe(0);
    // The program is reloaded (a restart keeps it, but a new run needs a new load anyway): still refused.
    await req('load', { file: 'piece.nc' });
    expect(await refusalOf(req('prepare', { operation: 'start', revision: state().revision }))).toMatchObject({ code: 'ETOUCH_START_NOT_HOMED' });
    // A homing: the start is possible again.
    await home();
    expect(state()).toMatchObject({ homed: true, referenceLost: null, canStart: true });
    const ticket = await req('prepare', { operation: 'start', revision: state().revision });
    await req('start', { nonce: ticket.nonce });
    expect(started()).toBe(1);
  }, 30000);

  test('C-05: the resume from a line (its preamble starts with G0 Z5 in the stale G54) is refused the same way', async () => {
    await restarted();
    const plan = await req('resumePlan', { file: 'piece.nc', line: 7 });
    expect(plan.preamble).toContain('G0 Z5');
    await req('load', { file: 'piece.nc', fromLine: 7 });
    expect(state().resume).toMatchObject({ from: 7 });
    expect(await refusalOf(req('prepare', { operation: 'start', revision: state().revision }))).toMatchObject({ code: 'ETOUCH_START_NOT_HOMED' });
    expect(started()).toBe(0);
  }, 30000);

  test('C-18: « zero here » is refused before the homing, nothing written; allowed after it', async () => {
    await restarted();
    const written = c.written.length;
    expect(state().motion.canSetOrigin).toBe(false);
    expect(state().refusals.setOrigin).toEqual({ code: 'ETOUCH_ORIGIN_NOT_HOMED', params: {} });
    const err = await refusalOf(req('prepare', { operation: 'set-origin', axes: ['Z'] }));
    expect(err).toMatchObject({ status: 409, code: 'ETOUCH_ORIGIN_NOT_HOMED', params: {} });
    expect(err.message).toBe(START_MESSAGES.ETOUCH_ORIGIN_NOT_HOMED);
    expectCatalogMatch({ code: err.code, params: err.params, message: err.message });
    expect(c.written.slice(written).filter((l) => /^G10/.test(l))).toEqual([]);
    await home();
    const ticket = await req('prepare', { operation: 'set-origin', axes: ['Z'] });
    expect(ticket.name).toMatch(/G10 L20 P1 Z0/);
  }, 30000);
});

// ---------------------------------------------------------------------------
// Bench 2: a fake board, the offset taken as proven (provenOffset), jest's timers.
// ---------------------------------------------------------------------------

const B = { kind: 'touch', id: 'tablet-B', label: 'Tablette B', user: 'op' };
const G54 = { x: 100, y: 100, z: -115 };

const fakeController = () => {
  const c = {
    type: 'Grbl',
    options: { port: 'TEST' },
    ready: true,
    isClose: () => false,
    runner: new EventEmitter(),
    sender: new EventEmitter(),
    workflow: Object.assign(new EventEmitter(), { state: 'idle' }),
    state: { status: { activeState: 'Idle', spindle: 0, feedrate: 0 }, parserstate: { modal: {}, feedrate: '0', spindle: '0' } },
    feeder: { toJSON: () => ({ queue: 0, pending: false }) },
    settings: { version: '1.1f', settings: { ...LUNYEE }, parameters: {} },
    commands: []
  };
  c.runner.state = c.state;
  c.sender.state = { name: '', context: {}, total: 0 };
  c.sender.toJSON = () => ({ ...c.sender.state });
  c.command = (name, ...args) => {
    c.commands.push([name, ...args]);
    if (name === 'gcode:load') {
      c.sender.state = { name: args[0], context: args[2], total: 9 };
      c.sender.emit('load');
      args[3](null);
    }
    if (name === 'gcode:start') {
      c.workflow.state = 'running';
      c.workflow.emit('start');
    }
  };
  return c;
};

const services = [];
afterEach(() => {
  services.splice(0).forEach((service) => service.dispose());
  jest.useRealTimers();
});

// Homed, at rest, probe free, the tool at machine (150, 120, −90).
const setup = () => {
  jest.useFakeTimers();
  const ctx = { now: 10000, c: fakeController(), m: { x: 150, y: 120, z: -90 }, active: 'Idle' };
  ctx.control = createControl({ now: () => ctx.now, elapsed: () => ctx.now });
  ctx.service = createService(
    { get: () => ({ TEST: ctx.c }) },
    { get: (key) => ({ watchDirectory: root, macros: [], events: [], 'touch.machines': [], 'touch.motion.enabled': true }[key]) },
    () => ctx.now,
    { control: ctx.control, workOffset: provenOffset }
  );
  services.push(ctx.service);
  ctx.state = () => ctx.service.list()[0];
  ctx.generation = ctx.state().generation;
  ctx.service.openTransport('tA', A);
  ctx.service.openTransport('tB', B);
  ctx.req = (action, extra = {}) => ctx.service.action({ port: 'TEST', generation: ctx.generation, transportId: 'tA', action, ...extra }, A);
  ctx.report = (active = ctx.active, at = ctx.m) => {
    ctx.c.state.status = {
      ...ctx.c.state.status,
      activeState: active,
      mpos: { x: f3(at.x), y: f3(at.y), z: f3(at.z) },
      wpos: { x: f3(at.x - G54.x), y: f3(at.y - G54.y), z: f3(at.z - G54.z) }
    };
    ctx.c.runner.emit('status', { raw: '<' + active + '|MPos:' + f3(at.x) + ',' + f3(at.y) + ',' + f3(at.z) + '|FS:0,0>' });
  };
  ctx.modal = () => {
    ctx.c.state.parserstate = { modal: { motion: 'G0', wcs: 'G54', units: 'G21', distance: 'G90', spindle: 'M5', feedrate: 'G94' }, feedrate: '0', spindle: '0' };
    ctx.c.runner.emit('parserstate', ctx.c.state.parserstate);
  };
  ctx.homed = () => {
    ctx.report('Home', { x: 0, y: 0, z: 0 });
    ctx.report('Idle', { x: 0, y: 0, z: 0 });
    ctx.report();
    ctx.modal();
  };
  ctx.homed();
  return ctx;
};

// The board restarts (banner), comes back in Alarm at MPos 0,0,0, then Unlock.
const restartThenUnlock = async (ctx) => {
  ctx.c.runner.emit('startup', { firmware: 'Grbl', version: '1.1f' });
  ctx.m = { x: 0, y: 0, z: 0 };
  ctx.report('Alarm');
  ctx.modal();
  const unlock = await ctx.req('prepare', { operation: 'unlock' });
  await ctx.req('unlock', { nonce: unlock.nonce });
  ctx.now += 100;
  ctx.report('Idle');
  ctx.modal();
  expect(ctx.state()).toMatchObject({ homed: false, referenceLost: 'restart' });
};

describe('reference guards (fake board): the plate, the reason kept, $22', () => {
  test('C-18: the plate probe is refused after a restart, with its code; nothing written; allowed after a homing', async () => {
    const ctx = setup();
    expect(ctx.state().canZeroZ).toBe(true);
    await restartThenUnlock(ctx);
    expect(ctx.state().canZeroZ).toBe(false);
    expect(ctx.state().refusals.zeroZ).toEqual({ code: 'ETOUCH_ORIGIN_NOT_HOMED', params: {} });
    expect(await refusalOf(ctx.req('prepare', { operation: 'zeroZ', thickness: 10, search: 20 }))).toMatchObject({ status: 409, code: 'ETOUCH_ORIGIN_NOT_HOMED' });
    expect(ctx.c.commands.filter((e) => e[0] === 'gcode')).toEqual([]);
    ctx.m = { x: 150, y: 120, z: -90 };
    ctx.homed();
    expect(ctx.state()).toMatchObject({ canZeroZ: true, referenceLost: null });
    expect(await ctx.req('prepare', { operation: 'zeroZ', thickness: 10, search: 20 })).toMatchObject({ operation: 'zeroZ' });
  });

  test('C-18: a plate ticket issued before an alarm is refused at its run', async () => {
    const ctx = setup();
    const ticket = await ctx.req('prepare', { operation: 'zeroZ', thickness: 10, search: 20 });
    // An alarm line, the board back to Idle (an Unlock from the PC): the reference is lost.
    ctx.c.runner.emit('alarm', { message: '1', raw: 'ALARM:1' });
    ctx.report('Idle');
    expect(ctx.state()).toMatchObject({ homed: false, referenceLost: 'alarm' });
    expect(await refusalOf(ctx.req('zeroZ', { nonce: ticket.nonce }))).toMatchObject({ code: 'ETOUCH_ORIGIN_NOT_HOMED' });
    expect(ctx.c.commands.filter((e) => e[0] === 'gcode')).toEqual([]);
  });

  test('referenceLost: restart is kept over a later alarm, an Alarm state of a homed machine says alarm, a homing clears it', () => {
    const ctx = setup();
    expect(ctx.state().referenceLost).toBeNull();
    // An Alarm state without its ALARM:n line (a board restarted unseen).
    ctx.report('Alarm');
    expect(ctx.state()).toMatchObject({ homed: false, referenceLost: 'alarm' });
    ctx.homed();
    ctx.c.runner.emit('startup', { firmware: 'Grbl', version: '1.1f' });
    ctx.c.runner.emit('alarm', { message: '2', raw: 'ALARM:2' });
    ctx.report('Alarm');
    expect(ctx.state().referenceLost).toBe('restart');
    ctx.homed();
    expect(ctx.state()).toMatchObject({ homed: true, referenceLost: null });
  });

  test('$22=0, or $22 unknown: nothing changes (start and zeros as before)', async () => {
    for (const $22 of ['0', undefined]) {
      const ctx = setup();
      await restartThenUnlock(ctx);
      ctx.c.settings.settings.$22 = $22;
      ctx.report('Idle');
      await ctx.req('load', { file: 'piece.nc' });
      expect(ctx.state()).toMatchObject({ canStart: true, canZeroZ: true, motion: { canSetOrigin: true } });
      const ticket = await ctx.req('prepare', { operation: 'start', revision: ctx.state().revision });
      expect(ticket.programCheck.verdict).toBe('unknown');
      await ctx.req('start', { nonce: ticket.nonce });
      expect(ctx.c.commands.map((e) => e[0])).toContain('gcode:start');
      services.splice(0).forEach((service) => service.dispose());
    }
  });
});
