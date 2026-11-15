/* eslint-env jest */
/* eslint-disable no-await-in-loop */ // polls are sequential on purpose
// D2 (PLAN-CORRECTIONS § 1.1, constat C-02): the work offset the board applies is proven
// equal to `$#` before a start, a plate probe, a block probe, a macro or a framing.
// Field fact of the LUNYEE 4040: after any homing the board reports WCO:0,0,0 while `$#`
// still holds G54; G55 then G54 loads it again. Converted from the proof tests
// bughunt-A1-2 (4 tests) and bughunt-A2-3 (2 tests, expectations rewritten: first
// « not proven », then proven, as V4 asked).
// Two benches: the repository's simulator on its LUNYEE profile through CNCjs's own
// GrblRunner (real time), and a small fake board with jest's timers for the table of
// what invalidates the proof.
import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { createService } from '../job-service';
import { createControl } from '../control';
import { analyzeProgram, checkProgram, programCheck } from '../program-check';
import { MAX_ATTEMPTS, MESSAGES, RETRY_MS } from '../work-offset';
import { bridge } from './support/sim-bridge';
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
const WCS = ['G54', 'G55', 'G56', 'G57', 'G58', 'G59'];
const ZERO = { x: 0, y: 0, z: 0 };

let root;
beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'cnc-touch-d2-'));
  // Z from −3 to +5: with the real G54 (Z −115), Z machine from −118 to −110, inside the travel.
  await fs.writeFile(path.join(root, 'gravure.nc'), ['G21 G90', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-3 F300', 'G1 X40 F800', 'G0 Z5', 'M30'].join('\n'));
  // Z from −20 to −2: with the real G54, Z machine from −135 to −117, outside ($132=130).
  await fs.writeFile(path.join(root, 'profond.nc'), ['G21 G90', 'G0 Z-2', 'G0 X0 Y0', 'G1 Z-20 F300', 'G1 X40 F800', 'G0 Z-2', 'M30'].join('\n'));
  await fs.writeFile(path.join(root, 'reprise.nc'), ['G21 G90 G94', 'M3 S9000', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F200',
    'G1 X10 F800', 'G1 Y10', 'G1 X0', 'G0 Z5', 'M5', 'M30'].join('\n'));
});
afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

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

describe('D2 on the simulator (LUNYEE profile and stock Grbl)', () => {
  let sim;
  let c;
  let service;
  let history;

  const start = (options) => {
    sim = new GrblSimulator(options);
    // The stored G54 of the board (its EEPROM), as `$#` gives it.
    sim.workCoordinateOffsets.G54 = { x: 100, y: 100, z: -115 };
    c = bridge(sim);
    history = [];
    service = createService({ get: () => ({ SIM: c }) }, { get: (key) => ({ 'touch.motion.enabled': true, events: [], macros: [] }[key]) }, undefined, { control: createControl(), history: { record: (e) => history.push(e) } });
    service.list();
    service.openTransport('tA', A);
  };
  const state = () => service.list()[0];
  const req = (action, extra = {}) => service.action({ port: 'SIM', generation: state().generation, transportId: 'tA', action, ...extra }, A);

  afterEach(() => {
    service.dispose();
    c.close();
    sim.stopPlannerExecutor();
  });

  test.each([['zero'], ['stored']])('after $H, WCO:0 reported: the offset is loaded again by G55 then G54, then proven (executed offset after homing: %s)', async (executedAfterHoming) => {
    start({ profile: 'lunyee', homingMs: 200, executedAfterHoming });
    await wait(100);
    // The board starts in Alarm (homing lock): nothing is checked, nothing written.
    expect(state().activeState).toBe('Alarm');
    expect(state().workOffset).toMatchObject({ state: 'unknown', code: 'ETOUCH_OFFSET_CHECKING' });
    const home = await req('prepare', { operation: 'home' });
    await req('home', { nonce: home.nonce });
    expect(await until(() => state().homed === true)).toBe(true);
    // Right after the homing: the board reports WCO:0,0,0, `$#` keeps G54.
    expect(await until(() => state().workOffset.state === 'proven')).toBe(true);
    expect(c.written).toEqual(['$H\n', '$#\n', 'G55\n', 'G54\n']);
    expect(state().workOffset).toMatchObject({
      state: 'proven',
code: null,
wcs: 'G54',
reloaded: true,
      stored: { x: '100', y: '100', z: '-115' },
reported: { x: '100', y: '100', z: '-115' }
    });
    expect(history.filter((e) => e.event === 'offset')).toEqual([expect.objectContaining({ result: 'reloaded', wcs: 'G54', lines: ['G55', 'G54'] })]);
    // Executed = reported = $# now, in both hypotheses: X10 Y10 of the work goes to machine 110, 110.
    expect(state().coordinates.wpos).toEqual({ x: '-100.000', y: '-100.000', z: '115.000' });
    c.command('gcode', 'G0 X10 Y10');
    expect(await until(() => sim.machineState === 'Idle' && Math.abs(sim.machinePosition.x - 110) < 1e-6, 4000)).toBe(true);
    expect(sim.machinePosition.y).toBeCloseTo(110, 6);
  }, 20000);

  test('stock Grbl: WCO equals $# at once, nothing is written after `$#`', async () => {
    start({});
    expect(await until(() => state().workOffset.state === 'proven')).toBe(true);
    await wait(1500);
    expect(c.written).toEqual(['$#\n']);
    expect(state().workOffset).toMatchObject({ state: 'proven', reloaded: false, wcs: 'G54', attempts: 1 });
  }, 15000);
});

// ---------------------------------------------------------------------------
// Bench 2: a fake board (LUNYEE facts) and jest's timers.
// ---------------------------------------------------------------------------

// Stored offsets (`$#`), the reported one (WCO: one report in ten, and the report after a
// change; zero after a homing until another system is selected, a G10 on the active one or
// a restart), CNCjs's WPos from the last WCO received, $G every 500 ms. Lines are answered
// at once unless `hold(line)` keeps them; `mute` leaves `$#` unanswered.
const fakeBoard = (ctx) => {
  const g = {
    m: { x: 150, y: 120, z: -100 },
    active: 'Idle',
    wcs: 'G54',
    stored: { G54: { x: 100, y: 100, z: -115 }, G55: { x: 10, y: 20, z: -30 }, G56: { ...ZERO }, G57: { ...ZERO }, G58: { ...ZERO }, G59: { ...ZERO } },
    void: false,
    counter: 0,
    lastWco: null,
    lines: [],
    hold: null,
    held: [],
    mute: false,
    noWco: false,
    homeEnd: null,
    lastPoll: -Infinity,
    pin: false,
    plateZ: -110
  };
  const c = {
    type: 'Grbl',
    options: { port: 'TEST' },
    ready: true,
    isClose: () => false,
    runner: new EventEmitter(),
    sender: new EventEmitter(),
    workflow: Object.assign(new EventEmitter(), { state: 'idle' }),
    state: {},
    feeder: { toJSON: () => ({ queue: 0, pending: false }) },
    settings: { version: '1.1f', settings: { ...LUNYEE } },
    commands: []
  };
  c.sender.state = { name: '', context: {}, total: 0 };
  c.sender.toJSON = () => ({ ...c.sender.state });
  const offset = () => (g.void ? ZERO : g.stored[g.wcs]);
  g.refresh = () => {
    const o = g.lastWco ? { x: Number(g.lastWco.x), y: Number(g.lastWco.y), z: Number(g.lastWco.z) } : ZERO;
    c.state = {
      status: {
        activeState: g.active,
        mpos: { x: f3(g.m.x), y: f3(g.m.y), z: f3(g.m.z) },
        wpos: { x: f3(g.m.x - o.x), y: f3(g.m.y - o.y), z: f3(g.m.z - o.z) },
        ...(g.lastWco ? { wco: { ...g.lastWco } } : {}),
        spindle: 0,
        feedrate: 0
      },
      parserstate: { modal: { motion: 'G0', wcs: g.wcs, units: 'G21', distance: 'G90', spindle: 'M5', feedrate: 'G94' }, feedrate: '0', spindle: '0' }
    };
    c.runner.state = c.state;
  };
  g.report = () => {
    let wco = null;
    if (g.noWco) {
      // A firmware that never sends WCO: (Grbl 0.9).
    } else if (g.counter > 0) {
      g.counter -= 1;
    } else {
      g.counter = 9;
      const o = offset();
      wco = { x: f3(o.x), y: f3(o.y), z: f3(o.z) };
      g.lastWco = wco;
    }
    g.refresh();
    const raw = '<' + g.active + '|MPos:' + f3(g.m.x) + ',' + f3(g.m.y) + ',' + f3(g.m.z) + '|FS:0,0' + (g.pin ? '|Pn:P' : '') +
      (wco ? '|WCO:' + wco.x + ',' + wco.y + ',' + wco.z : '') + '>';
    c.runner.emit('status', wco ? { raw, wco: { ...wco } } : { raw });
  };
  const ok = () => c.runner.emit('ok');
  const changed = () => {
    g.void = false;
    g.counter = 0;
  };
  g.run = (line) => {
    if (line === '$#') {
      if (g.mute) {
        return;
      }
      WCS.forEach((name) => c.runner.emit('parameters', { name, value: { x: f3(g.stored[name].x), y: f3(g.stored[name].y), z: f3(g.stored[name].z) } }));
      c.runner.emit('parameters', { name: 'G92', value: { x: '0.000', y: '0.000', z: '0.000' } });
      c.runner.emit('parameters', { name: 'TLO', value: '0.000' });
      ok();
      return;
    }
    if (/^G5[4-9]$/.test(line)) {
      // Only another system loads a stored offset; the active one again does nothing.
      if (line !== g.wcs) {
        g.wcs = line;
        changed();
      }
      ok();
      return;
    }
    let m = /^G10 L20 P(\d) (.+)$/.exec(line);
    if (m) {
      const name = Number(m[1]) === 0 ? g.wcs : WCS[Number(m[1]) - 1];
      m[2].split(' ').forEach((word) => {
        const k = word[0].toLowerCase();
        g.stored[name][k] = g.m[k] - Number(word.slice(1));
      });
      if (name === g.wcs) {
        changed();
      }
      g.counter = 0;
      ok();
      return;
    }
    m = /^(G0|G38\.2) Z(-?[\d.]+)/.exec(line);
    if (m) {
      const target = Number(m[2]) + offset().z;
      if (m[1] === 'G38.2') {
        if (g.plateZ <= g.m.z && g.plateZ >= target) {
          g.m.z = g.plateZ;
          c.runner.emit('parameters', { name: 'PRB', value: { x: f3(g.m.x), y: f3(g.m.y), z: f3(g.m.z), result: 1 } });
        } else {
          g.m.z = target;
          c.runner.emit('error', { message: '5' });
          return;
        }
      } else {
        g.m.z = target;
      }
    }
    ok();
  };
  c.command = (name, ...args) => {
    c.commands.push([name, ...args]);
    if (name === 'gcode') {
      [].concat(args[0]).forEach((line) => {
        g.lines.push(line);
        if (g.hold && g.hold(line)) {
          g.held.push(line);
        } else {
          g.run(line);
        }
      });
    } else if (name === 'homing') {
      g.active = 'Home';
      g.homeEnd = ctx.now + 1500;
    } else if (name === 'gcode:load') {
      c.sender.state = { name: args[0], context: args[2], total: 6 };
      c.sender.emit('load');
      args[3](null);
    } else if (name === 'gcode:start') {
      c.workflow.state = 'running';
      c.workflow.emit('start');
    } else if (name === 'macro:run') {
      args[2](null);
    }
  };
  // Answers the lines kept by `hold`.
  g.release = () => {
    g.hold = null;
    g.held.splice(0).forEach((line) => g.run(line));
  };
  g.advance = () => {
    if (ctx.now - g.lastPoll >= 500) {
      g.lastPoll = ctx.now;
      g.refresh();
      c.runner.emit('parserstate', c.state.parserstate);
      ok();
    }
    if (g.active === 'Home' && ctx.now >= g.homeEnd) {
      // LUNYEE: MPos 0,0,0 and WCO:0,0,0 reported at once while $# keeps the stored offset.
      g.m = { x: 0, y: 0, z: 0 };
      g.active = 'Idle';
      g.void = true;
      g.counter = 0;
      ok();
    }
  };
  g.refresh();
  return { c, g };
};

const services = [];
afterEach(() => {
  services.splice(0).forEach((service) => service.dispose());
  jest.useRealTimers();
});

const setup = async ({ macros = [], motion = true } = {}) => {
  jest.useFakeTimers();
  const ctx = { now: 100000, history: [] };
  const { c, g } = fakeBoard(ctx);
  Object.assign(ctx, { c, g });
  ctx.control = createControl({ now: () => ctx.now, elapsed: () => ctx.now });
  ctx.service = createService(
    { get: () => ({ TEST: c }) },
    { get: (key) => ({ watchDirectory: root, 'touch.motion.enabled': motion, events: [], macros, 'touch.machines': [] }[key]) },
    () => ctx.now,
    { control: ctx.control, history: { record: (event) => ctx.history.push(event) } }
  );
  services.push(ctx.service);
  ctx.state = () => ctx.service.list()[0];
  ctx.offset = () => ctx.state().workOffset;
  ctx.generation = ctx.state().generation;
  ctx.service.openTransport('tA', A);
  ctx.req = (action, extra = {}) => ctx.service.action({ port: 'TEST', generation: ctx.generation, transportId: 'tA', action, ...extra }, A);
  ctx.tick = async (ms) => {
    for (let t = 0; t < ms; t += 50) {
      ctx.now += 50;
      g.advance();
      g.report();
      await jest.advanceTimersByTimeAsync(50);
    }
  };
  ctx.until = async (test, max = 30000) => {
    for (let t = 0; t < max && !test(); t += 50) {
      await ctx.tick(50);
    }
    expect(test()).toBe(true);
  };
  ctx.proven = () => ctx.until(() => ctx.offset().state === 'proven');
  ctx.home = async () => {
    const t = await ctx.req('prepare', { operation: 'home' });
    await ctx.req('home', { nonce: t.nonce });
    await ctx.until(() => ctx.state().homed === true && g.active === 'Idle');
  };
  ctx.lines = () => g.lines.slice();
  ctx.since = (before) => g.lines.slice(before.length);
  // The tool over the piece, a probe contact test done (free, contact, free).
  ctx.ready = async () => {
    g.m = { x: 150, y: 120, z: -100 };
    await ctx.tick(100);
    g.pin = true;
    await ctx.tick(100);
    g.pin = false;
    await ctx.tick(100);
  };
  await ctx.tick(600);
  return ctx;
};

const refusalOf = async (promise) => {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error('not refused');
};

describe('D2: the work offset is proven against $# (fake LUNYEE board)', () => {
  test('the messages of the new codes are the catalog’s French templates, in EN and ES too', () => {
    expectCatalogMatch({ code: 'ETOUCH_OFFSET_CHECKING', params: {}, message: MESSAGES.ETOUCH_OFFSET_CHECKING });
    expectCatalogMatch({ code: 'ETOUCH_OFFSET_UNCONFIRMED', params: { detail: 'no-report' }, message: MESSAGES.ETOUCH_OFFSET_UNCONFIRMED });
    expectCatalogMatch({ code: 'ETOUCH_OFFSET_SETTINGS', params: {}, message: MESSAGES.ETOUCH_OFFSET_SETTINGS });
    const params = { wcs: 'G54', axis: 'Z', stored: '-115', reported: '0' };
    expectCatalogMatch({ code: 'ETOUCH_OFFSET_MISMATCH', params, message: 'La carte n’applique pas l’origine enregistrée de G54 en Z (-115 mm enregistré, 0 mm appliqué), même rechargée : vérifiez la carte avant tout travail.' });
    const check = checkProgram(analyzeProgram('G21 G90\nG0 Z5\nG1 Z-3 F300\n'), {
      settings: { ...LUNYEE }, mpos: { x: 0, y: 0, z: 0 }, wpos: { x: 0, y: 0, z: 0 }, modal: { units: 'G21', distance: 'G90', wcs: 'G54' }, homed: true, reportUnits: 'mm', offsetProven: false
    });
    check.axes.Z.codedReasons.forEach(expectCatalogMatch);
  });

  test('checkProgram (A1-2, A2-3): `$#` G54 Z −115 while WCO reads 0 → neither « outside » nor « validated » until proven; G53 targets still compared', () => {
    const machine = {
      settings: { ...LUNYEE },
      mpos: { x: '150.000', y: '120.000', z: '-100.000' },
      wpos: { x: '150.000', y: '120.000', z: '-100.000' },
      modal: { units: 'G21', distance: 'G90', wcs: 'G54' },
      parameters: { G54: { x: '100.000', y: '100.000', z: '-115.000' }, G92: { x: '0.000', y: '0.000', z: '0.000' }, TLO: '0.000' },
      homed: true,
      reportUnits: 'mm',
      offsetProven: false
    };
    // T3: inside with the real G54, « Z outside » (+5 machine) on the reported offset.
    const gravure = checkProgram(analyzeProgram('G21 G90\nG0 Z5\nG1 Z-3 F300\nG0 Z5\n'), machine);
    expect(gravure.axes.Z.verdict).toBe('unknown');
    expect(gravure.axes.Z.codedReasons.map((r) => r.code)).toContain('ETOUCH_CHECK_OFFSET_UNPROVEN');
    // The reverse case: outside with the real G54 (−135), « validated » (−20) on the reported offset.
    const profond = checkProgram(analyzeProgram('G21 G90\nG0 Z-2\nG1 Z-20 F300\nG0 Z-2\n'), machine);
    expect(profond.axes.Z.verdict).toBe('unknown');
    // A G53 target needs no work offset: still outside.
    expect(checkProgram(analyzeProgram('G21 G90\nG53 G0 Z5\n'), machine).axes.Z.verdict).toBe('outside');
    // Without offsetProven (a direct call), the reported offset as before.
    const { offsetProven, ...asBefore } = machine;
    expect(offsetProven).toBe(false);
    expect(checkProgram(analyzeProgram('G21 G90\nG0 Z5\nG1 Z-3 F300\nG0 Z5\n'), asBefore).axes.Z.verdict).toBe('outside');
  });

  test('T3 replayed (A2-3): after the homing Z is « not proven », then once proven the pocket is inside and the deep cut outside', async () => {
    const ctx = await setup();
    await ctx.proven();
    await ctx.home();
    // WCO:0 reported, $# G54 = (100, 100, −115); the tool over the piece.
    ctx.g.m = { x: 150, y: 120, z: -100 };
    const POCKET = ['G21 G90 G54', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-10 F300', 'G1 X40 F1000', 'G1 Y30', 'G1 X0', 'G1 Y0', 'G0 Z5', 'M30'].join('\n');
    const DEEP = ['G21 G90 G54', 'G0 Z0', 'G0 X0 Y0', 'G1 Z-35 F300', 'G1 X40 F1000', 'G0 Z0', 'M30'].join('\n');
    const machineNow = () => {
      const s = ctx.state();
      return {
        settings: s.settings,
mpos: s.coordinates.mpos,
wpos: s.coordinates.wpos,
modal: { units: 'G21', distance: 'G90', wcs: 'G54' },
        homed: s.homed,
reportUnits: 'mm',
offsetProven: s.workOffset.state === 'proven'
      };
    };
    expect(ctx.offset().state).not.toBe('proven');
    expect(programCheck(POCKET, machineNow()).axes.Z.verdict).toBe('unknown');
    expect(programCheck(DEEP, machineNow()).axes.Z.verdict).toBe('unknown');
    await ctx.proven();
    expect(ctx.offset()).toMatchObject({ reloaded: true, stored: { z: '-115' }, reported: { z: '-115' } });
    expect(programCheck(POCKET, machineNow()).axes.Z.verdict).toBe('validated');
    expect(programCheck(DEEP, machineNow()).axes.Z.verdict).toBe('outside');
  });

  test('A1-2: a start (and the start of a resume from a line) is refused until proven, then allowed; the loaded check says why', async () => {
    const ctx = await setup();
    await ctx.proven();
    await ctx.req('load', { file: 'profond.nc' });
    await ctx.home();
    // Proof under way: refused with its code, nothing started.
    expect(ctx.offset().state).not.toBe('proven');
    expect(ctx.state().canStart).toBe(false);
    expect(ctx.state().refusals.start).toEqual({ code: 'ETOUCH_OFFSET_CHECKING', params: {} });
    expect(ctx.state().programCheck.axes.Z.verdict).toBe('unknown');
    expect(ctx.state().programCheck.codedReasons.map((r) => r.code)).toContain('ETOUCH_CHECK_OFFSET_UNPROVEN');
    const err = await refusalOf(ctx.req('prepare', { operation: 'start', revision: ctx.state().revision }));
    expect(err).toMatchObject({ status: 409, code: 'ETOUCH_OFFSET_CHECKING' });
    expect(ctx.c.commands.map((e) => e[0])).not.toContain('gcode:start');
    await ctx.proven();
    // The true verdict now: −20 → −2 on G54 Z −115 is −135 → −117 machine, below −130.
    expect(ctx.state().programCheck.axes.Z.verdict).toBe('outside');
    // D1 (S3): an overrun proven once the offset is proven refuses the start in its turn.
    expect(ctx.state().canStart).toBe(false);
    expect(ctx.state().refusals.start).toMatchObject({ code: 'ETOUCH_START_OUTSIDE', params: { count: 1 } });

    await ctx.req('load', { file: 'reprise.nc', fromLine: 7 });
    expect(ctx.state().resume).toMatchObject({ from: 7 });
    ctx.service.socketCommand('TEST', false);
    expect(ctx.state().canStart).toBe(false);
    expect(await refusalOf(ctx.req('prepare', { operation: 'start', revision: ctx.state().revision }))).toMatchObject({ code: 'ETOUCH_OFFSET_CHECKING' });
    await ctx.proven();
    const ticket = await ctx.req('prepare', { operation: 'start', revision: ctx.state().revision });
    await ctx.req('start', { nonce: ticket.nonce });
    expect(ctx.c.commands.map((e) => e[0])).toContain('gcode:start');
  });

  test('the plate, the block probe and a macro are refused until proven; a zero here is not, except while the lines are written', async () => {
    const ctx = await setup({ macros: [{ id: 'm1', name: 'Dégagement', content: 'G0 Z0' }] });
    await ctx.proven();
    // A board that does not answer `$#` after the homing: the proof fails.
    ctx.g.mute = true;
    await ctx.home();
    await ctx.ready();
    await ctx.until(() => ctx.offset().state === 'failed', 60000);
    const unconfirmed = { code: 'ETOUCH_OFFSET_UNCONFIRMED', params: { detail: 'no-answer' } };
    expect(ctx.state()).toMatchObject({
      canZeroZ: false, canBlockProbe: false, canMacro: false, refusals: { zeroZ: unconfirmed, blockProbe: unconfirmed, macro: unconfirmed }
    });
    // A zero here does not depend on the offset loaded (and its G10 loads it again).
    expect(ctx.state().motion.canSetOrigin).toBe(true);
    const zero = await ctx.req('prepare', { operation: 'set-origin', axes: ['X'] });
    const before = ctx.lines();
    const done = ctx.req('set-origin', { nonce: zero.nonce });
    await ctx.tick(1000);
    await expect(done).resolves.toMatchObject({ message: expect.stringMatching(/^Origine X du repère G54/) });
    expect(ctx.since(before)[0]).toBe('G10 L20 P1 X0');
    expect(await refusalOf(ctx.req('prepare', { operation: 'zeroZ', thickness: 5, search: 20 }))).toMatchObject({ code: expect.stringMatching(/^ETOUCH_OFFSET_/) });
    expect(await refusalOf(ctx.req('prepare', { operation: 'macro', macroId: 'm1' }))).toMatchObject({ code: expect.stringMatching(/^ETOUCH_OFFSET_/) });
    // While the transaction writes its lines, every guarded action waits, a zero here too.
    ctx.g.mute = false;
    ctx.g.void = true;
    ctx.g.counter = 0;
    ctx.g.hold = (line) => line === 'G55';
    await ctx.req('verifyOffset').catch(() => {});
    await ctx.until(() => ctx.g.held.length === 1, 60000);
    expect(ctx.offset().state).toBe('checking');
    expect(ctx.state().refusals.setOrigin).toEqual({ code: 'ETOUCH_OFFSET_CHECKING', params: {} });
    expect(ctx.state().refusals.jog).toEqual({ code: 'ETOUCH_OFFSET_CHECKING', params: {} });
    expect(await refusalOf(ctx.req('prepare', { operation: 'set-origin', axes: ['Y'] }))).toMatchObject({ code: 'ETOUCH_OFFSET_CHECKING' });
    ctx.g.release();
    await ctx.proven();
    expect(ctx.state()).toMatchObject({ canZeroZ: true, canMacro: true, canBlockProbe: true, refusals: {} });
  });

  test('three attempts without an answer, 5 s apart, then failed; an operation refused for it tries again', async () => {
    const ctx = await setup();
    await ctx.proven();
    ctx.g.mute = true;
    const before = ctx.lines();
    await ctx.home();
    await ctx.until(() => ctx.offset().state === 'failed', 60000);
    expect(ctx.since(before)).toEqual(['$#', '$#', '$#']);
    expect(ctx.offset()).toMatchObject({ state: 'failed', code: 'ETOUCH_OFFSET_UNCONFIRMED', detail: 'no-answer', attempts: MAX_ATTEMPTS });
    await ctx.tick(RETRY_MS * 3);
    expect(ctx.since(before)).toHaveLength(3);
    await ctx.req('load', { file: 'gravure.nc' });
    expect(ctx.state().refusals.start).toEqual({ code: 'ETOUCH_OFFSET_UNCONFIRMED', params: { detail: 'no-answer' } });
    ctx.g.mute = false;
    expect(await refusalOf(ctx.req('prepare', { operation: 'start', revision: ctx.state().revision }))).toMatchObject({ code: 'ETOUCH_OFFSET_UNCONFIRMED' });
    await ctx.proven();
    expect(ctx.since(before).slice(3)).toEqual(['$#', 'G55', 'G54']);
  });

  test('no WCO: in the reports: « no-report » after 5 s; verifyOffset proves it again (guarded by the lease, no confirmation)', async () => {
    const ctx = await setup();
    await ctx.proven();
    ctx.g.noWco = true;
    await ctx.home();
    await ctx.until(() => ctx.offset().state === 'failed', 60000);
    expect(ctx.offset()).toMatchObject({ code: 'ETOUCH_OFFSET_UNCONFIRMED', detail: 'no-report' });
    ctx.g.noWco = false;
    const answer = await ctx.req('verifyOffset');
    expect(answer).toMatchObject({ message: 'Vérification de l’origine de la pièce relancée.', workOffset: { state: 'unknown', attempts: 0 } });
    await ctx.proven();
    // Another device pilots: verifyOffset needs the lease.
    ctx.control.takeover('TEST', { kind: 'touch', id: 'tablet-B', label: 'B' }, 'essai du bail');
    await expect(ctx.req('verifyOffset')).rejects.toMatchObject({ code: 'ECONTROL' });
  });

  test('the board still applies 0 after the reload: failed with ETOUCH_OFFSET_MISMATCH, no G10 ever sent', async () => {
    const ctx = await setup();
    await ctx.proven();
    // A board that never loads its stored offset again.
    const run = ctx.g.run;
    ctx.g.run = (line) => {
      run(line);
      if (/^G5[4-9]$/.test(line)) {
        ctx.g.void = true;
      }
    };
    await ctx.home();
    await ctx.until(() => ctx.offset().state === 'failed', 60000);
    expect(ctx.offset()).toMatchObject({ code: 'ETOUCH_OFFSET_MISMATCH', params: { wcs: 'G54', axis: 'X', stored: '100', reported: '0' }, reloaded: true });
    expect(ctx.lines().some((l) => /^G10/.test(l))).toBe(false);
    expect(ctx.history.filter((e) => e.event === 'offset')).toEqual([]);
  });

  test('cut between its two lines (Stop), the next attempt sends the active system back first', async () => {
    const ctx = await setup();
    await ctx.proven();
    ctx.g.hold = (line) => line === 'G55';
    await ctx.home();
    await ctx.until(() => ctx.g.held.length === 1);
    const before = ctx.lines();
    // Stop: the transaction ends where it is; nothing to stop otherwise.
    await expect(ctx.req('stop')).rejects.toMatchObject({ message: 'Aucun travail à arrêter.' });
    expect(ctx.offset()).toMatchObject({ state: 'unknown', detail: 'interrupted' });
    // The board answers late: it is in G55 now.
    ctx.g.release();
    await ctx.tick(1000);
    expect(ctx.g.wcs).toBe('G55');
    expect(ctx.since(before)).toEqual([]);
    await ctx.proven();
    expect(ctx.since(before)).toEqual(['G54', '$#']);
    expect(ctx.g.wcs).toBe('G54');
    expect(ctx.offset()).toMatchObject({ wcs: 'G54', reloaded: false });
  });

  test('a stop from a socket ends the transaction; a command that is not safe is refused while it writes', async () => {
    const ctx = await setup();
    await ctx.proven();
    ctx.g.hold = (line) => line === 'G55';
    await ctx.home();
    await ctx.until(() => ctx.g.held.length === 1);
    expect(ctx.service.socketRefusal('TEST')).toMatchObject({ code: 'ETOUCH_OFFSET_CHECKING' });
    ctx.service.socketStop('TEST');
    expect(ctx.service.socketRefusal('TEST')).toBeNull();
    expect(ctx.offset()).toMatchObject({ state: 'unknown', detail: 'interrupted' });
  });

  test('Pause, spindle stop and a jog stop end the transaction where it is too', async () => {
    const ctx = await setup();
    await ctx.proven();
    ctx.g.mute = true;
    await ctx.home();
    const stops = [
      () => ctx.req('pause'),
      () => ctx.req('spindleStop'),
      () => ctx.req('motion', { operation: 'jog-stop' })
    ];
    for (const stop of stops) {
      await ctx.until(() => ctx.offset().state === 'checking');
      const before = ctx.lines();
      await stop().catch(() => null);
      expect(ctx.offset()).toMatchObject({ state: 'unknown', detail: 'interrupted' });
      // Nothing more from the transaction (the spindle stop writes its own M5 at rest).
      await ctx.tick(1000);
      expect(ctx.since(before).filter((l) => l !== 'M5')).toEqual([]);
      await ctx.req('verifyOffset');
    }
  });

  test('a pause the program asked for (M6): `$#` only, never a reload', async () => {
    const ctx = await setup();
    await ctx.proven();
    await ctx.req('load', { file: 'gravure.nc' });
    const ticket = await ctx.req('prepare', { operation: 'start', revision: ctx.state().revision });
    await ctx.req('start', { nonce: ticket.nonce });
    // The program's tool change: CNCjs holds it; the board idle.
    ctx.c.workflow.state = 'paused';
    ctx.c.sender.state = { ...ctx.c.sender.state, holdReason: { data: 'M6' } };
    // Frozen during the job: a change of system by the program does not invalidate it.
    ctx.g.wcs = 'G55';
    await ctx.tick(1000);
    expect(ctx.offset().state).toBe('proven');
    ctx.g.wcs = 'G54';
    // A client of the PC writes (its content is not read): proven anew, read-only.
    ctx.service.socketCommand('TEST', false);
    const before = ctx.lines();
    await ctx.proven();
    expect(ctx.since(before)).toEqual(['$#']);
    // A board reporting 0 during the pause: no G55, no G54, a mismatch.
    ctx.g.void = true;
    ctx.g.counter = 0;
    ctx.service.socketCommand('TEST', false);
    await ctx.until(() => ctx.offset().state === 'failed', 60000);
    expect(ctx.since(before).filter((l) => l !== '$#')).toEqual([]);
    expect(ctx.offset()).toMatchObject({ code: 'ETOUCH_OFFSET_MISMATCH', reloaded: false });
    expect(ctx.state().refusals.zeroZ).toMatchObject({ code: 'ETOUCH_OFFSET_MISMATCH' });
  });

  describe('what invalidates the proof (§ 1.1)', () => {
    // The event leaves the proof (at once, or by the end of an operation that runs a while:
    // then the new `$#` is what shows it), and the next transaction proves it again.
    const proofAgain = async (ctx, event, { reload = false, immediate = true } = {}) => {
      await ctx.proven();
      const before = ctx.lines();
      await event();
      if (immediate) {
        expect(ctx.offset().state).not.toBe('proven');
      }
      await ctx.proven();
      expect(ctx.since(before).filter((l) => /^(\$#|G5[4-9])$/.test(l))).toEqual(reload ? ['$#', 'G55', 'G54'] : ['$#']);
    };

    test('a homing seen finished: ours, and one of another client (Home then Idle)', async () => {
      const ctx = await setup();
      await proofAgain(ctx, () => ctx.home(), { reload: true });
      await proofAgain(ctx, async () => {
        ctx.g.active = 'Home';
        await ctx.tick(300);
        ctx.g.active = 'Idle';
        ctx.g.void = true;
        ctx.g.counter = 0;
        ctx.g.m = { x: 0, y: 0, z: 0 };
        ctx.g.advance();
        ctx.g.report();
      }, { reload: true });
    });

    test('the board’s banner', async () => {
      const ctx = await setup();
      await proofAgain(ctx, () => ctx.c.runner.emit('startup', { firmware: 'Grbl', version: '1.1f' }));
    });

    test('an alarm line, and an Alarm state without its line', async () => {
      const ctx = await setup();
      await proofAgain(ctx, async () => {
        ctx.c.runner.emit('alarm', { message: '2' });
        ctx.g.active = 'Alarm';
        await ctx.tick(300);
        ctx.g.active = 'Idle';
      });
      await proofAgain(ctx, async () => {
        ctx.g.active = 'Alarm';
        ctx.g.report();
        expect(ctx.offset().state).toBe('unknown');
        await ctx.tick(300);
        ctx.g.active = 'Idle';
      });
    });

    test('a system change seen in $G at rest (another channel): the new system is proven', async () => {
      const ctx = await setup();
      await ctx.proven();
      const before = ctx.lines();
      ctx.g.wcs = 'G55';
      ctx.g.counter = 0;
      await ctx.tick(600);
      await ctx.proven();
      expect(ctx.since(before)).toEqual(['$#']);
      expect(ctx.offset()).toMatchObject({ wcs: 'G55', stored: { x: '10', y: '20', z: '-30' } });
    });

    test('a zero written by the service (zero here, plate)', async () => {
      const ctx = await setup();
      await ctx.proven();
      await ctx.home();
      await ctx.proven();
      await ctx.ready();
      await proofAgain(ctx, async () => {
        const t = await ctx.req('prepare', { operation: 'set-origin', axes: ['X', 'Y'] });
        const done = ctx.req('set-origin', { nonce: t.nonce });
        await ctx.tick(200);
        await done;
      }, { immediate: false });
      await proofAgain(ctx, async () => {
        const t = await ctx.req('prepare', { operation: 'zeroZ', thickness: 5, search: 20 });
        const done = ctx.req('zeroZ', { nonce: t.nonce });
        await ctx.tick(3000);
        await expect(done).resolves.toMatchObject({ message: expect.stringMatching(/^Zéro Z réglé/) });
      }, { immediate: false });
      // A plate that fails (no contact) may have written nothing: proven anew all the same.
      ctx.g.plateZ = -200;
      await proofAgain(ctx, async () => {
        const t = await ctx.req('prepare', { operation: 'zeroZ', thickness: 5, search: 5 });
        const done = ctx.req('zeroZ', { nonce: t.nonce }).then(() => null, (err) => err);
        await ctx.tick(3000);
        expect(await done).toMatchObject({ message: 'Grbl a refusé une ligne du palpage (error:5).' });
      }, { immediate: false });
    });

    test('the end of a job, and a job stopped', async () => {
      const ctx = await setup();
      await ctx.proven();
      await ctx.req('load', { file: 'gravure.nc' });
      let ticket = await ctx.req('prepare', { operation: 'start', revision: ctx.state().revision });
      await ctx.req('start', { nonce: ticket.nonce });
      ctx.c.sender.emit('end');
      expect(ctx.offset().state).toBe('unknown');
      ctx.c.workflow.state = 'idle';
      await ctx.proven();
      await ctx.req('load', { file: 'gravure.nc' });
      ticket = await ctx.req('prepare', { operation: 'start', revision: ctx.state().revision });
      await ctx.req('start', { nonce: ticket.nonce });
      await ctx.req('stop');
      expect(ctx.offset().state).toBe('unknown');
    });

    test('a socket command that is not safe, accepted (its content is not read)', async () => {
      const ctx = await setup();
      await proofAgain(ctx, () => ctx.service.socketCommand('TEST', false));
    });

    test('an explicit WCO: different from the proven one, at rest (a client on the board’s Wi-Fi)', async () => {
      const ctx = await setup();
      await proofAgain(ctx, () => {
        ctx.g.stored.G54 = { x: 50, y: 60, z: -70 };
        ctx.g.counter = 0;
        ctx.g.report();
      });
      expect(ctx.offset()).toMatchObject({ stored: { x: '50', y: '60', z: '-70' } });
    });
  });

  test('$13 unknown: no transaction, the refusal asks for the settings', async () => {
    const ctx = await setup();
    await ctx.proven();
    delete ctx.c.settings.settings.$13;
    ctx.service.socketCommand('TEST', false);
    const before = ctx.lines();
    await ctx.tick(RETRY_MS * 2);
    expect(ctx.since(before)).toEqual([]);
    expect(ctx.offset()).toMatchObject({ state: 'unknown', code: 'ETOUCH_OFFSET_SETTINGS' });
  });
});
