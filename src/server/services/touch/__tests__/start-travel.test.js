/* eslint-env jest */
/* eslint-disable no-await-in-loop */ // polls are sequential on purpose
// D1 (PLAN-CORRECTIONS § 1.2, constat C-01, journal T2): a program whose overrun is proven
// (machine referenced, axis checkable, work offset proven by D2) does not start; the refusal
// gives the overruns in the operator's terms. A second, deliberate gesture (prepare with
// override: 'travel', the board's soft limits on) may start it, bound to what it overrides and
// logged twice. A verdict `unknown` stays a warning. Converted from bughunt-A1-1.
// Two benches: the repository's simulator on its LUNYEE profile through CNCjs's own GrblRunner
// (real time, the real D2 proof), and a small fake board with a proven offset for what
// changes between the two gestures.
import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { createService, START_MESSAGES } from '../job-service';
import { createControl } from '../control';
import { programCheck } from '../program-check';
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
const P = (...lines) => lines.join('\n');

let root;
beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'cnc-touch-d1-'));
  const write = (name, ...lines) => fs.writeFile(path.join(root, name), P(...lines));
  // The cut of 14 November (T2): last pass at Z −20.76 on G54 Z −115, i.e. Z machine −135.76.
  await write('decoupe.nc', 'G21 G90', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-20.76 F300', 'G1 X40 F800', 'G0 Z5', 'M30');
  // Inside the travel: Z machine from −118 to −110.
  await write('gravure.nc', 'G21 G90', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-3 F300', 'G1 X40 F800', 'G0 Z5', 'M30');
  // In the 0.5 mm band before the far end: Z machine −129.8 (the board refused −129.945).
  await write('bande.nc', 'G21 G90', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-14.8 F300', 'G0 Z5', 'M30');
  // The last usable depth: Z machine −129.5.
  await write('limite.nc', 'G21 G90', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-14.5 F300', 'G0 Z5', 'M30');
  // A probe in the program: Z cannot be followed, the verdict is unknown.
  await write('sonde.nc', 'G21 G90', 'G0 Z5', 'G0 X0 Y0', 'G38.2 Z-10 F50', 'G0 Z5', 'M30');
  // A resume from line 6: its preamble rises to the highest Z seen before (Z120, machine +5),
  // while the lines from 6 on stay inside the travel.
  await write('reprise.nc', 'G21 G90 G94', 'M3 S9000', 'G0 Z120', 'G0 X0 Y0', 'G1 Z5 F300', 'G1 Z-1 F200', 'G1 X10 F800', 'G0 Z5', 'M5', 'M30');
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

describe('D1 on the simulator (LUNYEE profile): the cut of T2', () => {
  let sim;
  let c;
  let service;
  let history;

  // The board as on 14 November: stored G54 (100, 100, −115), homed from the tablet, the
  // offset loaded again and proven by D2. The cycle lasts more than HOMING_MIN_MS (1 s), so the
  // service sees it as its own full cycle and learns the convention of X and Y (C-04).
  const ready = async () => {
    sim = new GrblSimulator({ profile: 'lunyee', homingMs: 1200 });
    sim.workCoordinateOffsets.G54 = { x: 100, y: 100, z: -115 };
    c = bridge(sim);
    history = [];
    service = createService(
      { get: () => ({ SIM: c }) },
      { get: (key) => ({ watchDirectory: root, 'touch.motion.enabled': true, events: [], macros: [] }[key]) },
      undefined,
      { control: createControl(), history: { record: (e) => history.push(e) } }
    );
    service.list();
    service.openTransport('tA', A);
    await wait(100);
    const home = await req('prepare', { operation: 'home' });
    await req('home', { nonce: home.nonce });
    expect(await until(() => state().homed === true && state().workOffset.state === 'proven')).toBe(true);
  };
  const state = () => service.list()[0];
  const req = (action, extra = {}) => service.action({ port: 'SIM', generation: state().generation, transportId: 'tA', action, ...extra }, A);
  const started = () => c.jobs.filter((j) => j[0] === 'gcode:start').length;

  afterEach(() => {
    service.dispose();
    c.close();
    sim.stopPlannerExecutor();
  });

  test('the cut of T2 is refused before any start, with its figures; nothing is sent', async () => {
    await ready();
    const written = c.written.length;
    await req('load', { file: 'decoupe.nc' });
    const check = state().programCheck;
    // X and Y are checked too (convention learnt by our own homing), Z is proven outside.
    expect(check.axes.X).toMatchObject({ verdict: 'validated', machineMin: 100, machineMax: 140 });
    expect(check.axes.Z).toMatchObject({ verdict: 'outside', usable: { low: -129.5, high: 0 } });
    expect(check.axes.Z.machineMin).toBeCloseTo(-135.76, 3);
    const tooLow = {
      code: 'ETOUCH_TRAVEL_TOO_LOW',
      params: { over: '6.3', min: '-135.76', limit: '-129.5' },
      message: 'Le programme descend 6.3 mm trop bas (Z machine -135.76, limite -129.5).'
    };
    expect(check.blocking).toEqual([tooLow]);
    expect(check.overridable).toBe(true);
    // Published before any touch: canStart and the coded refusal of the snapshot.
    expect(state().canStart).toBe(false);
    expect(state().startReason).toBe('Départ refusé : le programme sort de la course de la machine (dépassements : 1).');
    expect(state().refusals.start).toEqual({ code: 'ETOUCH_START_OUTSIDE', params: { count: 1 }, reasons: [tooLow] });
    const err = await refusalOf(req('prepare', { operation: 'start', revision: state().revision }));
    expect(err).toMatchObject({ status: 409, code: 'ETOUCH_START_OUTSIDE', params: { count: 1 }, reasons: [tooLow] });
    expectCatalogMatch({ code: err.code, params: err.params, message: err.message });
    expectCatalogMatch(tooLow);
    expect(started()).toBe(0);
    // The load wrote nothing on the board; the refusal neither.
    expect(c.written.slice(written)).toEqual([]);
  }, 20000);

  test('the 0.5 mm band before the far end is refused; the last usable depth starts', async () => {
    await ready();
    await req('load', { file: 'bande.nc' });
    expect(state().programCheck.blocking).toEqual([expect.objectContaining({ code: 'ETOUCH_TRAVEL_TOO_LOW', params: { over: '0.3', min: '-129.8', limit: '-129.5' } })]);
    expect(await refusalOf(req('prepare', { operation: 'start', revision: state().revision }))).toMatchObject({ code: 'ETOUCH_START_OUTSIDE' });
    await req('load', { file: 'limite.nc' });
    expect(state().programCheck).toMatchObject({ verdict: 'validated', blocking: [] });
    const ticket = await req('prepare', { operation: 'start', revision: state().revision });
    expect(ticket.override).toBeUndefined();
    await req('start', { nonce: ticket.nonce });
    expect(started()).toBe(1);
  }, 20000);

  test('a verdict unknown stays a warning: the ticket is issued with the check and its reasons', async () => {
    await ready();
    await req('load', { file: 'sonde.nc' });
    const ticket = await req('prepare', { operation: 'start', revision: state().revision });
    expect(ticket.programCheck).toMatchObject({ verdict: 'unknown', blocking: [] });
    expect(ticket.programCheck.codedReasons.map((r) => r.code)).toContain('ETOUCH_CHECK_PROBE');
    expect(ticket.override).toBeUndefined();
    await req('start', { nonce: ticket.nonce });
    expect(started()).toBe(1);
  }, 20000);

  test('the override: a second gesture, logged when confirmed and when started; the start entry says so', async () => {
    await ready();
    await req('load', { file: 'decoupe.nc' });
    const blocking = state().programCheck.blocking;
    const ticket = await req('prepare', { operation: 'start', revision: state().revision, override: 'travel' });
    expect(ticket.override).toEqual({ blocking });
    expect(ticket.programCheck.verdict).toBe('outside');
    expect(history.filter((e) => e.event === 'override')).toEqual([
      expect.objectContaining({ kind: 'travel', stage: 'confirmed', file: 'decoupe.nc', controller: expect.objectContaining({ port: 'SIM' }), actor: A, overruns: blocking })
    ]);
    expect(started()).toBe(0);
    await req('start', { nonce: ticket.nonce });
    expect(started()).toBe(1);
    const overrides = history.filter((e) => e.event === 'override');
    expect(overrides.map((e) => e.stage)).toEqual(['confirmed', 'started']);
    expect(overrides[1]).toMatchObject({ kind: 'travel', file: 'decoupe.nc', actor: A, overruns: blocking });
    // `started` is logged before the program is sent, the start entry follows it.
    const order = history.map((e) => e.event + (e.stage ? ':' + e.stage : ''));
    expect(order.indexOf('override:started')).toBeLessThan(order.indexOf('start'));
    expect(history.find((e) => e.event === 'start')).toMatchObject({ override: true, actor: A });
  }, 20000);

  test('a resume from a line whose preamble leaves the travel: the plan says it, its start is refused', async () => {
    await ready();
    const plan = await req('resumePlan', { file: 'reprise.nc', line: 6 });
    expect(plan.preamble.join(' ')).toMatch(/G0 Z120/);
    expect(plan.programCheck.blocking).toEqual([expect.objectContaining({ code: 'ETOUCH_TRAVEL_TOO_HIGH', params: { over: '5', max: '5', limit: '0' } })]);
    await req('load', { file: 'reprise.nc', fromLine: 6 });
    expect(state().resume).toMatchObject({ from: 6 });
    expect(await refusalOf(req('prepare', { operation: 'start', revision: state().revision }))).toMatchObject({ code: 'ETOUCH_START_OUTSIDE', params: { count: 1 } });
    expect(started()).toBe(0);
  }, 20000);

  test('a zero set from the PC while the override ticket waits: nothing starts', async () => {
    await ready();
    await req('load', { file: 'decoupe.nc' });
    const ticket = await req('prepare', { operation: 'start', revision: state().revision, override: 'travel' });
    // CNCjs on the PC sets Z0 here (a socket command: index.js tells the service, D2 is invalidated).
    service.socketCommand('SIM', false);
    c.command('gcode', 'G10 L20 P1 Z0');
    await wait(300);
    const err = await refusalOf(req('start', { nonce: ticket.nonce }));
    expect(err && err.code).toMatch(/^ETOUCH_(OFFSET_CHECKING|START_OVERRIDE_CHANGED)$/);
    expect(started()).toBe(0);
  }, 20000);
});

// ---------------------------------------------------------------------------
// Bench 2: a fake board, the offset taken as proven (provenOffset), jest's clock.
// ---------------------------------------------------------------------------

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
      c.sender.state = { name: args[0], context: args[2], total: 6 };
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
});

// Homed (Home then Idle), the tool above the stock, the work offset G54 at (100, 100, −115).
const setup = (options = {}) => {
  const ctx = { now: 10000, c: fakeController(), history: [], wco: { x: 100, y: 100, z: -115 } };
  ctx.service = createService(
    { get: () => ({ TEST: ctx.c }) },
    { get: (key) => ({ watchDirectory: root, macros: [], events: [], 'touch.machines': [] }[key]) },
    () => ctx.now,
    { workOffset: provenOffset, history: { record: (e) => ctx.history.push(e) }, ...options }
  );
  services.push(ctx.service);
  ctx.state = () => ctx.service.list()[0];
  ctx.generation = ctx.state().generation;
  ctx.service.openTransport('t1', A);
  ctx.req = (action, extra = {}) => ctx.service.action({ port: 'TEST', generation: ctx.generation, transportId: 't1', action, ...extra }, A);
  ctx.report = (active, m) => {
    const o = ctx.wco;
    ctx.c.state.status = {
      ...ctx.c.state.status,
      activeState: active,
      mpos: { x: f3(m.x), y: f3(m.y), z: f3(m.z) },
      wpos: { x: f3(m.x - o.x), y: f3(m.y - o.y), z: f3(m.z - o.z) }
    };
    ctx.c.runner.emit('status', { raw: '<' + active + '|MPos:' + f3(m.x) + ',' + f3(m.y) + ',' + f3(m.z) + '|FS:0,0>' });
  };
  ctx.c.state.parserstate = { modal: { motion: 'G0', wcs: 'G54', units: 'G21', distance: 'G90', spindle: 'M5', feedrate: 'G94' }, feedrate: '0', spindle: '0' };
  ctx.c.runner.emit('parserstate', ctx.c.state.parserstate);
  ctx.report('Home', { x: 0, y: 0, z: 0 });
  ctx.report('Idle', { x: 0, y: 0, z: 0 });
  ctx.report('Idle', { x: 150, y: 120, z: -100 });
  ctx.starts = () => ctx.c.commands.filter((e) => e[0] === 'gcode:start').length;
  return ctx;
};

describe('D1: the override and what changes between the two gestures (fake board, proven offset)', () => {
  test('a zero set while the override ticket waits changes what is overridden: refused, nothing sent', async () => {
    const ctx = setup();
    await ctx.req('load', { file: 'decoupe.nc' });
    const ticket = await ctx.req('prepare', { operation: 'start', revision: ctx.state().revision, override: 'travel' });
    expect(ticket.override.blocking).toEqual([expect.objectContaining({ code: 'ETOUCH_TRAVEL_TOO_LOW', params: expect.objectContaining({ over: '6.3' }) })]);
    // Z0 set 3 mm lower: the cut now reaches Z machine −138.76.
    ctx.wco = { ...ctx.wco, z: -118 };
    ctx.report('Idle', { x: 150, y: 120, z: -100 });
    const err = await refusalOf(ctx.req('start', { nonce: ticket.nonce }));
    expect(err).toMatchObject({ status: 409, code: 'ETOUCH_START_OVERRIDE_CHANGED', params: {} });
    expect(err.message).toBe(START_MESSAGES.ETOUCH_START_OVERRIDE_CHANGED);
    expectCatalogMatch({ code: err.code, params: err.params, message: err.message });
    expect(ctx.starts()).toBe(0);
    expect(ctx.history.filter((e) => e.event === 'override').map((e) => e.stage)).toEqual(['confirmed']);
  });

  test('a ticket without the override whose check finds an overrun at the start is refused', async () => {
    const ctx = setup();
    await ctx.req('load', { file: 'gravure.nc' });
    const ticket = await ctx.req('prepare', { operation: 'start', revision: ctx.state().revision });
    // Z0 set 15 mm lower meanwhile: Z machine −133 for the −3 mm pass.
    ctx.wco = { ...ctx.wco, z: -130 };
    ctx.report('Idle', { x: 150, y: 120, z: -100 });
    expect(await refusalOf(ctx.req('start', { nonce: ticket.nonce }))).toMatchObject({ code: 'ETOUCH_START_OUTSIDE', params: { count: 1 } });
    expect(ctx.starts()).toBe(0);
  });

  test('the overrun gone at the start of an override ticket: an ordinary start, no override logged', async () => {
    const ctx = setup();
    await ctx.req('load', { file: 'decoupe.nc' });
    const ticket = await ctx.req('prepare', { operation: 'start', revision: ctx.state().revision, override: 'travel' });
    // The stock raised: Z0 set 10 mm higher, the cut ends at Z machine −125.76.
    ctx.wco = { ...ctx.wco, z: -105 };
    ctx.report('Idle', { x: 150, y: 120, z: -100 });
    await ctx.req('start', { nonce: ticket.nonce });
    expect(ctx.starts()).toBe(1);
    expect(ctx.history.filter((e) => e.event === 'override').map((e) => e.stage)).toEqual(['confirmed']);
    expect(ctx.history.find((e) => e.event === 'start').override).toBeUndefined();
  });

  test('no override without the board’s soft limits ($20 off or unknown); the plain refusal stays', async () => {
    for (const $20 of ['0', undefined]) {
      const ctx = setup();
      ctx.c.settings.settings.$20 = $20;
      await ctx.req('load', { file: 'decoupe.nc' });
      expect(ctx.state().programCheck).toMatchObject({ verdict: 'outside', overridable: false });
      expect(await refusalOf(ctx.req('prepare', { operation: 'start', revision: ctx.state().revision }))).toMatchObject({ code: 'ETOUCH_START_OUTSIDE' });
      const err = await refusalOf(ctx.req('prepare', { operation: 'start', revision: ctx.state().revision, override: 'travel' }));
      expect(err).toMatchObject({ status: 409, code: 'ETOUCH_START_NO_OVERRIDE', params: {} });
      expectCatalogMatch({ code: err.code, params: err.params, message: err.message });
      expect(ctx.starts()).toBe(0);
      expect(ctx.history.filter((e) => e.event === 'override')).toEqual([]);
    }
  });

  test('the override never passes D2: an unproven offset refuses with its own code', async () => {
    const refusal = Object.assign(new Error('Vérification de l’origine de la pièce auprès de la carte : patientez quelques secondes.'), { status: 409, code: 'ETOUCH_OFFSET_CHECKING', params: {} });
    const ctx = setup({ workOffset: () => ({ ...provenOffset(), proven: () => false, proof: () => null, refusal: () => refusal }) });
    await ctx.req('load', { file: 'decoupe.nc' });
    expect(await refusalOf(ctx.req('prepare', { operation: 'start', revision: ctx.state().revision, override: 'travel' }))).toMatchObject({ code: 'ETOUCH_OFFSET_CHECKING' });
    expect(ctx.starts()).toBe(0);
  });

  test('an override is only `travel`, and only for a start', async () => {
    const ctx = setup();
    await ctx.req('load', { file: 'decoupe.nc' });
    await expect(ctx.req('prepare', { operation: 'start', revision: ctx.state().revision, override: true })).rejects.toThrow('Action invalide.');
    await expect(ctx.req('prepare', { operation: 'home', override: 'travel' })).rejects.toThrow('Action invalide.');
    expect(ctx.state().canStart).toBe(false);
  });

  test('the operator’s terms: Z too low or too high, X and Y past the travel on their side (pure check)', () => {
    const machine = {
      settings: LUNYEE,
      mpos: { x: 150, y: 120, z: -100 },
      wpos: { x: 50, y: 20, z: 15 },
      modal: { units: 'G21', distance: 'G90', wcs: 'G54' },
      parameters: null,
      homed: true,
      reportUnits: 'mm',
      homeAt: { X: 0, Y: 0, Z: 0, mask: 3 }
    };
    const r = programCheck(P('G21 G90', 'G0 Z120', 'G0 X-101 Y310', 'G1 Z-16 F100'), machine);
    expect(r.blocking).toEqual([
      {
        code: 'ETOUCH_TRAVEL_BEYOND',
        params: { axis: 'X', sign: '−', over: '1', value: '-1', limit: '0' },
        message: 'Le programme dépasse la course de 1 mm en X− (X machine -1, limite 0).'
      },
      {
        code: 'ETOUCH_TRAVEL_BEYOND',
        params: { axis: 'Y', sign: '+', over: '14.5', value: '410', limit: '395.5' },
        message: 'Le programme dépasse la course de 14.5 mm en Y+ (Y machine 410, limite 395.5).'
      },
      {
        code: 'ETOUCH_TRAVEL_TOO_LOW',
        params: { over: '1.5', min: '-131', limit: '-129.5' },
        message: 'Le programme descend 1.5 mm trop bas (Z machine -131, limite -129.5).'
      },
      {
        code: 'ETOUCH_TRAVEL_TOO_HIGH',
        params: { over: '5', max: '5', limit: '0' },
        message: 'Le programme monte 5 mm trop haut (Z machine 5, limite 0).'
      }
    ]);
    r.blocking.forEach(expectCatalogMatch);
    // Rounded up to the tenth: raising the stock by `over` is enough.
    expect(programCheck(P('G21 G90', 'G0 Z5', 'G1 Z-14.51 F100'), machine).blocking[0].params.over).toBe('0.1');
    expect(programCheck(P('G21 G90', 'G0 Z5', 'G1 Z-14.8 F100'), machine).blocking[0].params.over).toBe('0.3');
    // An unknown verdict has no blocking; a validated one neither.
    expect(programCheck(P('G21 G90', 'G0 Z5', 'G38.2 Z-100 F50'), machine)).toMatchObject({ verdict: 'unknown', blocking: [] });
    expect(programCheck(P('G21 G90', 'G0 Z5', 'G1 Z-3 F100'), machine)).toMatchObject({ verdict: 'validated', blocking: [], overridable: true });
  });
});
