/* eslint-env jest */
/* eslint-disable no-await-in-loop */ // the cases of a table run one after the other on purpose
// CNC framing in the air (lot F1, examples/cncjs-touch/design/fonctions/F1-CONCEPTION.md § 10.1):
// the plan and its guards, the sequence (one line at a time, arrivals compared), its stops and its
// supervisor, the exclusions while it runs, and the laser framing left as it was. Fake controller
// only: nothing here touches a serial port.
import { EventEmitter } from 'events';
import os from 'os';
import path from 'path';
import { createService } from '../job-service';
import { createControl, SAFE_COMMANDS, SAFE_WRITES } from '../control';
import touch from '../index';
import settings from '../../../config/settings';
import { fingerprint as sha256 } from '../program-identity';
import { cncFrameLinesValid, FRAME_MESSAGES } from '../motion';
import { signatureOf } from '../machine-profile';
import { expectCatalogMatch } from './touch-codes-catalog';
import { provenOffset } from './support/proven-offset';
import { offsetRefusal } from '../work-offset';
import { pageSeesBusy } from './support/auto-reload-rest';
import { lineBench } from './support/line-bench';

// The real touch facade (index.js refuseSocket, refuseUpload) over the service of a test: its
// createService returns `mockFacade.service` when set, else the real one (every other test).
const mockFacade = { service: null };
jest.mock('../job-service', () => {
  const actual = jest.requireActual('../job-service');
  return { ...actual, createService: (...args) => mockFacade.service || actual.createService(...args) };
});
jest.mock('../system-stats', () => ({ createSystemStats: () => ({ start: jest.fn(), stop: jest.fn(), read: () => ({}) }) }));
jest.mock('../backlight', () => ({ createBacklight: () => ({ restore: jest.fn(), status: () => ({}), set: jest.fn(), dim: jest.fn(), wake: jest.fn() }) }));

// A small CNC with standard Grbl conventions ($23=0): machine X, Y in [-400, 0], Z in [-80, 0].
const SETTINGS = {
  $10: '1',
  $13: '0',
  $20: '1',
  $22: '1',
  $23: '0',
  $30: '1000',
  $31: '0',
  $32: '0',
  $100: '80',
  $101: '80',
  $102: '400',
  $110: '3000',
  $111: '3000',
  $112: '500',
  $120: '200',
  $121: '200',
  $122: '50',
  $130: '400',
  $131: '400',
  $132: '80'
};

// Work = machine + 105 in X and Y, + 12 in Z.
const OFFSET = { x: -105, y: -105, z: -12 };
const f3 = (n) => (Math.round(n * 1000) / 1000).toFixed(3);

const fakeController = (settings) => {
  const c = {
    type: 'Grbl',
    options: { port: 'TEST' },
    ready: true,
    closed: false,
    isClose: () => c.closed,
    runner: new EventEmitter(),
    sender: new EventEmitter(),
    workflow: Object.assign(new EventEmitter(), { state: 'idle' }),
    state: { status: { activeState: 'Idle', spindle: 0, mpos: {}, wpos: {} } },
    feeder: { toJSON: () => ({ queue: 0, pending: false }) },
    settings: { version: '1.1h', settings: { ...settings } },
    commands: [],
    written: []
  };
  c.runner.state = c.state;
  c.sender.state = { name: '', context: {}, total: 0 };
  c.sender.toJSON = () => ({ ...c.sender.state });
  // Places the machine (machine coordinates), the work position following the offset.
  c.at = (x, y, z) => {
    c.state.status.mpos = { x: f3(x), y: f3(y), z: f3(z) };
    c.state.status.wpos = { x: f3(x - OFFSET.x), y: f3(y - OFFSET.y), z: f3(z - OFFSET.z) };
  };
  c.machine = () => ['x', 'y', 'z'].map((a) => Number(c.state.status.mpos[a]));
  c.command = (name, ...args) => {
    c.commands.push([name, ...args]);
    if (name === 'gcode') {
      [].concat(args[0]).forEach((line) => c.written.push(line + '\n'));
    }
    if (name === 'jogCancel') {
      c.written.push('\x85');
    }
    if (name === 'gcode:load') {
      c.sender.state = { name: args[0], context: args[2], total: args[1].split('\n').filter((l) => l.trim()).length };
      c.sender.emit('load');
      args[3](null);
    }
    if (name === 'gcode:start') {
      c.workflow.state = 'running';
      c.workflow.emit('start');
    }
  };
  return lineBench(c);
};

const A = { kind: 'touch', id: 'tablet-A', label: 'Tablette A', user: 'op' };
const B = { kind: 'touch', id: 'tablet-B', label: 'Tablette B', user: 'op' };

const PROGRAMS = {
  // X 10 → 60, Y 20 → 50, Z down to −1 (machine −13).
  'box.nc': ['G21 G90 G94', 'M3 S9000', 'G0 Z5', 'G0 X10 Y20', 'G1 Z-1 F200', 'G1 X60 F800', 'G1 Y50', 'G1 X10', 'G1 Y20', 'G0 Z5', 'M5', 'M30'].join('\n'),
  // A single straight line: a flat box.
  'flat.nc': ['G21 G90 G94', 'G0 Z5', 'G0 X10 Y20', 'G1 Z-1 F200', 'G1 X60 F800', 'G0 Z5', 'M30'].join('\n'),
  // A single point.
  'point.nc': ['G21 G90 G94', 'G0 Z5', 'G0 X10 Y20', 'G1 Z-1 F200', 'G0 Z5', 'M30'].join('\n'),
  // Inside in X and Y, far too deep in Z (machine −82, usable −79.5).
  'deep.nc': ['G21 G90 G94', 'G0 Z5', 'G0 X10 Y20', 'G1 Z-70 F200', 'G1 X60 F800', 'G0 Z5', 'M30'].join('\n'),
  // X 10 → 120.3: machine 15.3 past X 0 (the usable high end).
  'wide.nc': ['G21 G90 G94', 'G0 Z5', 'G0 X10 Y20', 'G1 Z-1 F200', 'G1 X120.3 F800', 'G0 Z5', 'M30'].join('\n'),
  'g55.nc': ['G21 G90 G55 G94', 'G0 X10 Y20', 'G1 X60 F1500', 'M30'].join('\n'),
  'idle-y.nc': ['G21 G90 G94', 'G0 X10', 'G1 X60 F1500', 'M30'].join('\n'),
  // The laser bench of machine-profile.test.js.
  'frame.nc': ['G21 G90 G94', 'G0 X10 Y20', 'M4 S300', 'G1 X60 F1500', 'G1 Y50', 'G1 X10', 'G1 Y20', 'M5', 'M30'].join('\n')
};

const services = [];
afterEach(() => {
  services.splice(0).forEach((service) => service.dispose());
  jest.useRealTimers();
});

const laserRecord = (settings) => ({ id: 'm-0123456789ab', label: 'Atelier', kind: 'laser', signature: signatureOf(settings, '1.1h', '1.1h'), createdAt: 'x', updatedAt: 'x' });

// The machine homed, then placed at (−100, −100, −60) machine, i.e. work (5, 5, −48).
const setup = ({ settings = SETTINGS, enabled = true, homed = true, machines = [], at = [-100, -100, -60], offset = null } = {}) => {
  jest.useFakeTimers();
  const ctx = { now: 10000, enabled, machines, history: [], c: fakeController(settings), programs: { ...PROGRAMS }, proof: 1, invalidated: [], events: [] };
  ctx.c.at(...at);
  ctx.controllers = { TEST: ctx.c };
  ctx.control = createControl({ now: () => ctx.now, elapsed: () => ctx.now });
  const config = {
    get: (key) => (key === 'touch.machines' ? ctx.machines : { 'touch.motion.enabled': ctx.enabled, events: ctx.events, macros: [] }[key])
  };
  const files = {
    readProgram: (name) => {
      if (!ctx.programs[name]) {
        const err = new Error('nope');
        err.code = 'ENOENT';
        return Promise.reject(err);
      }
      return Promise.resolve({ text: ctx.programs[name], fingerprint: sha256(Buffer.from(ctx.programs[name])), size: ctx.programs[name].length, mtimeMs: 1 });
    },
    fingerprintOf: (name) => Promise.resolve({ fingerprint: sha256(Buffer.from(ctx.programs[name])), size: 1, mtimeMs: 1 })
  };
  // A proven offset whose proof number the test changes, and which records its invalidations.
  const workOffset = offset || (() => ({
    ...provenOffset(),
    proof: () => ctx.proof,
    invalidate: (cause) => ctx.invalidated.push(cause)
  }));
  const history = { record: (e) => ctx.history.push(e) };
  ctx.files = files;
  ctx.service = createService({ get: () => ctx.controllers }, config, () => ctx.now, { workOffset, control: ctx.control, history, files });
  services.push(ctx.service);
  ctx.generation = ctx.service.list()[0].generation;
  ctx.service.openTransport('tA', A);
  ctx.service.openTransport('tB', B);
  ctx.report = () => ctx.c.runner.emit('status');
  // Lot C1: CNCjs's own $G exchange, the modal report (spindle off, M5) then its ok. The board
  // answers a line (`ok`), and the next exchange follows it; one more every 500 ms of bench time.
  // It says again the modal state a test wrote in the bench's state (another system, M3), if any.
  ctx.gc = () => {
    const said = (ctx.c.state.parserstate && ctx.c.state.parserstate.modal) || {};
    ctx.c.runner.emit('parserstate', { modal: { motion: 'G0', wcs: 'G54', plane: 'G17', units: 'G21', distance: 'G90', feedrate: 'G94', spindle: 'M5', coolant: 'M9', ...said } });
    ctx.c.runner.emit('ok');
  };
  ctx.ok = () => {
    ctx.c.runner.emit('ok');
    ctx.gc();
  };
  ctx.sinceGc = 0;
  ctx.tick = (ms) => {
    for (let t = 0; t < ms; t += 50) {
      ctx.now += 50;
      ctx.sinceGc += 50;
      if (ctx.sinceGc >= 500) {
        ctx.sinceGc = 0;
        ctx.gc();
      }
      ctx.report();
      jest.advanceTimersByTime(50);
    }
  };
  // The line just written runs: Jog reported, the machine at its end (or `shift` off it), ok, Idle.
  ctx.run = (shift = [0, 0, 0]) => {
    const line = ctx.c.written[ctx.c.written.length - 1].trim();
    ctx.c.state.status.activeState = 'Jog';
    ctx.report();
    const [x, y, z] = ctx.c.machine();
    let to = [x, y, z];
    const rel = /^\$J=G91 G21 Z([\d.]+) F/.exec(line);
    const abs = /^\$J=G90 G21 X(-?[\d.]+) Y(-?[\d.]+) F/.exec(line);
    if (rel) {
      to = [x, y, z + Number(rel[1])];
    } else if (abs) {
      to = [Number(abs[1]) + OFFSET.x, Number(abs[2]) + OFFSET.y, z];
    }
    ctx.c.at(to[0] + shift[0], to[1] + shift[1], to[2] + shift[2]);
    ctx.ok();
    ctx.c.state.status.activeState = 'Idle';
    ctx.tick(150);
  };
  ctx.req = (action, extra = {}, actor = A, transportId = actor === B ? 'tB' : 'tA') => ctx.service.action({
    port: 'TEST', generation: ctx.generation, transportId, action, ...extra
  }, actor);
  ctx.machine = (operation, extra = {}, actor) => ctx.req('machine', { operation, ...extra }, actor);
  ctx.state = () => ctx.service.list()[0];
  ctx.lines = () => ctx.c.written.filter((l) => l !== '\x85').map((l) => l.trim());
  ctx.start = async (file = 'box.nc', extra = {}) => {
    await ctx.req('load', { file });
    const ticket = await ctx.machine('frame-prepare', extra);
    const res = await ctx.machine('frame', { nonce: ticket.nonce });
    return { ticket, res };
  };
  ctx.report();
  if (homed) {
    ctx.c.state.status.activeState = 'Home';
    ctx.report();
    ctx.c.state.status.activeState = 'Idle';
    ctx.report();
  }
  // Lot C1: a second report at rest, and the $G exchange a board at rest gets twice a second.
  ctx.report();
  ctx.gc();
  return ctx;
};

const without = (key) => {
  const s = { ...SETTINGS };
  delete s[key];
  return s;
};

const refusalOf = async (promise) => {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error('not refused');
};

const LINES = [
  'M5',
  '$J=G91 G21 Z55 F300',
  '$J=G90 G21 X10 Y20 F600',
  '$J=G90 G21 X60 Y20 F600',
  '$J=G90 G21 X60 Y50 F600',
  '$J=G90 G21 X10 Y50 F600',
  '$J=G90 G21 X10 Y20 F600',
  '$J=G90 G21 X5 Y5 F600'
];
const NO_SPINDLE = /(^|\s)(M3|M4)(\s|$)|S[1-9]|G0|G1\b|G53|\$H|\$X/;

// Runs a started framing line after line up to `count` lines written (M5 included).
const runTo = (ctx, count) => {
  while (ctx.lines().length < count) {
    const before = ctx.lines().length;
    ctx.run();
    if (ctx.lines().length === before) {
      throw new Error('no next line after ' + before);
    }
  }
};

// After a stop: 0x85 written once at least, then nothing but 0x85, even back at rest and a minute later.
const expectNothingAfter = (ctx, count) => {
  ctx.c.state.status.activeState = 'Idle';
  ctx.ok();
  ctx.tick(61000);
  expect(ctx.lines()).toHaveLength(count);
  expect(ctx.c.written).toContain('\x85');
  ['\x18', '!', '~'].forEach((byte) => expect(ctx.c.written.join('')).not.toContain(byte));
};

describe('CNC framing: the plan (§ 4)', () => {
  test('1. ticket: M5, Z alone relative and upwards, the box in work coordinates, back to the start; 600 and 300 mm/min', async () => {
    const ctx = setup();
    await ctx.req('load', { file: 'box.nc' });
    const ticket = await ctx.machine('frame-prepare');
    expect(ticket).toMatchObject({
      operation: 'frame',
      expiresIn: 15,
      frame: {
        kind: 'cnc',
        lines: LINES,
        bounds: { xMin: 10, xMax: 60, yMin: 20, yMax: 50 },
        feed: 600,
        zFeed: 300,
        safeZ: { machine: -5, rise: 55 },
        start: { x: 5, y: 5 }
      }
    });
    // 55 mm at 300 mm/min, then 5√(5²+15²)… : about 11 s + 37.8 s.
    expect(ticket.frame.seconds).toBe(Math.ceil((55 / 300 + (Math.hypot(5, 15) + 50 + 30 + 50 + 30 + Math.hypot(5, 15)) / 600) * 60));
    expect(ticket.name).toMatch(/^Cadrage à vide/);
    expect(ctx.c.written).toEqual([]);
    // A feed asked within the bounds: min(1500, $110, $111).
    expect((await ctx.machine('frame-prepare', { feed: 1500 })).frame.lines[2]).toBe('$J=G90 G21 X10 Y20 F1500');
  });

  test('2. Z already above the safe height, or less than 0.01 mm under it: no Z line', async () => {
    for (const z of [-4, -5, -5.005, -0.2]) {
      const ctx = setup({ at: [-100, -100, z] });
      await ctx.req('load', { file: 'box.nc' });
      const { frame } = await ctx.machine('frame-prepare');
      expect([z, frame.lines.filter((l) => /Z/.test(l))]).toEqual([z, []]);
      expect(frame.lines).toEqual(LINES.filter((l) => !/Z/.test(l)));
      expect(frame.safeZ.rise).toBe(0);
    }
    const ctx = setup({ at: [-100, -100, -5.02] });
    await ctx.req('load', { file: 'box.nc' });
    expect((await ctx.machine('frame-prepare')).frame.lines[1]).toBe('$J=G91 G21 Z0.02 F300');
  });

  test('3. property: whatever the start height, no line holds a negative Z or a Z outside line 1; a bad plan is refused', async () => {
    for (let z = -79.5; z <= 0; z += 3.7) {
      const ctx = setup({ at: [-100, -100, z] });
      await ctx.req('load', { file: 'box.nc' });
      const { frame } = await ctx.machine('frame-prepare');
      expect(cncFrameLinesValid(frame.lines)).toBe(true);
      frame.lines.forEach((line, i) => {
        expect([i, /Z-/.test(line)]).toEqual([i, false]);
        expect([i, /Z/.test(line) && i !== 1]).toEqual([i, false]);
      });
    }
    const ok = ['M5', '$J=G91 G21 Z5 F300', '$J=G90 G21 X1 Y2 F600'];
    expect(cncFrameLinesValid(ok)).toBe(true);
    [
      ['M5', '$J=G91 G21 Z-5 F300'],
      ['M5', '$J=G91 G21 Z+5 F300'],
      ['M5', '$J=G90 G21 X1 Y2 Z3 F600'],
      ['M5', '$J=G90 G21 X1 Y2 F600', '$J=G91 G21 Z5 F300'],
      ['M5', '$J=G91 G21 Z5 F300', '$J=G91 G21 Z5 F300'],
      ['M3 S1000', '$J=G90 G21 X1 Y2 F600'],
      ['M5', 'G0 X1 Y2'],
      ['M5', '$J=G53 G90 G21 Z-5 F300'],
      ['$J=G90 G21 X1 Y2 F600'],
      ['M5', '$J=G90 G21 X1 Y2 F600 S100']
    ].forEach((lines) => expect([lines, cncFrameLinesValid(lines)]).toEqual([lines, false]));
  });

  test('4. a flat box and a single point send no segment of no length; a start on the first corner has no approach nor return', async () => {
    let ctx = setup();
    await ctx.req('load', { file: 'flat.nc' });
    expect((await ctx.machine('frame-prepare')).frame.lines).toEqual(['M5', '$J=G91 G21 Z55 F300', '$J=G90 G21 X10 Y20 F600', '$J=G90 G21 X60 Y20 F600', '$J=G90 G21 X10 Y20 F600', '$J=G90 G21 X5 Y5 F600']);
    ctx = setup();
    await ctx.req('load', { file: 'point.nc' });
    expect((await ctx.machine('frame-prepare')).frame.lines).toEqual(['M5', '$J=G91 G21 Z55 F300', '$J=G90 G21 X10 Y20 F600', '$J=G90 G21 X5 Y5 F600']);
    ctx = setup({ at: [10 + OFFSET.x, 20 + OFFSET.y, -60] });
    await ctx.req('load', { file: 'box.nc' });
    expect((await ctx.machine('frame-prepare')).frame.lines).toEqual(['M5', '$J=G91 G21 Z55 F300', ...LINES.slice(3, 7)]);
  });
});

describe('CNC framing: the guards before (§ 5.1)', () => {
  const code = async (promise) => {
    const err = await refusalOf(promise);
    if (/^ETOUCH_/.test(err.code)) {
      expectCatalogMatch(err);
    }
    return err;
  };

  test('5. one refusal per guard, with its code, nothing written', async () => {
    const cases = [
      ['$32=1 undeclared', { settings: { ...SETTINGS, $32: '1' } }, 'box.nc', {}, 'ETOUCH_MACHINE_LASER_MODE_ON'],
      ['moves disabled', { enabled: false }, 'box.nc', {}, 'ETOUCH_LASER_FRAME_DISABLED'],
      ['not homed', { homed: false }, 'box.nc', {}, 'ETOUCH_CNC_FRAME_NOT_HOMED'],
      ['not homed, $22=0', { homed: false, settings: { ...SETTINGS, $22: '0' } }, 'box.nc', {}, 'ETOUCH_CNC_FRAME_NOT_HOMED'],
      ['no program', {}, null, {}, 'ETOUCH_LASER_FRAME_NO_PROGRAM'],
      ['$20=0', { settings: { ...SETTINGS, $20: '0' } }, 'box.nc', {}, 'ETOUCH_CNC_FRAME_SOFT_LIMITS'],
      ['$20 unknown', { settings: without('$20') }, 'box.nc', {}, 'ETOUCH_CNC_FRAME_SOFT_LIMITS'],
      ['Z travel unknown', { settings: without('$132') }, 'box.nc', {}, 'ETOUCH_CNC_FRAME_Z'],
      ['start in the 0.5 mm band', { at: [-399.7, -100, -60] }, 'point.nc', {}, 'ETOUCH_CNC_FRAME_START'],
      ['outline unknown', {}, 'idle-y.nc', {}, 'ETOUCH_LASER_FRAME_BOUNDS'],
      ['feed', {}, 'box.nc', { feed: 1600 }, 'ETOUCH_LASER_FRAME_FEED'],
      ['feed as text', {}, 'box.nc', { feed: '600' }, 'ETOUCH_LASER_FRAME_FEED'],
      ['too slow', {}, 'box.nc', { feed: 30 }, 'ETOUCH_LASER_FRAME_SLOW']
    ];
    for (const [name, options, file, extra, expected] of cases) {
      const ctx = setup(options);
      if (file) {
        await ctx.req('load', { file });
      }
      const err = await code(ctx.machine('frame-prepare', extra));
      expect([name, err.code]).toEqual([name, expected]);
      expect([name, ctx.c.written]).toEqual([name, []]);
      // The snapshot judges the default feed: only the feed cases leave it possible.
      expect([name, ctx.state().canFrame]).toEqual([name, extra.feed !== undefined]);
    }
  });

  test('5b. the travel: X unknown → its reasons; X outside → the figures of each overrun; the spindle; the work offset (D2); another WCS', async () => {
    // Outside: X 120.3 + offset −105 = 15.3 machine, usable high 0: 15.3 mm past X+.
    let ctx = setup();
    await ctx.req('load', { file: 'wide.nc' });
    let err = await code(ctx.machine('frame-prepare'));
    expect(err).toMatchObject({ code: 'ETOUCH_CNC_FRAME_OUTSIDE', params: { count: 1 } });
    expect(err.reasons).toEqual([expect.objectContaining({ code: 'ETOUCH_TRAVEL_BEYOND', params: { axis: 'X', sign: '+', over: '15.3', value: '15.3', limit: '0' } })]);
    expect(ctx.state().refusals.frame).toMatchObject({ code: 'ETOUCH_CNC_FRAME_OUTSIDE', params: { count: 1 }, reasons: [{ code: 'ETOUCH_TRAVEL_BEYOND' }] });
    // Unknown: $23 bit of X set without a learnt convention, at a position both conventions hold.
    ctx = setup({ settings: { ...SETTINGS, $23: '1' }, at: [0, -100, -60] });
    await ctx.req('load', { file: 'box.nc' });
    err = await code(ctx.machine('frame-prepare'));
    expect(err.code).toBe('ETOUCH_LASER_FRAME_CHECK');
    expect(err.reasons.length).toBeGreaterThan(0);
    // The spindle turning.
    ctx = setup();
    await ctx.req('load', { file: 'box.nc' });
    ctx.c.state.status.spindle = 9000;
    ctx.report();
    expect((await refusalOf(ctx.machine('frame-prepare'))).message).toMatch(/La broche tourne encore/);
    // No speed reported and no recent $G: maybe turning, refused too.
    // Lot C1: the bench now has a $G exchange at rest; « no recent $G » is 3 s without one.
    ctx.c.state.status.spindle = undefined;
    ctx.now += 3000;
    ctx.report();
    expect((await refusalOf(ctx.machine('frame-prepare'))).message).toMatch(/La broche tourne peut-être/);
    expect(ctx.c.written).toEqual([]);
    // D2: the three codes of the offset proof.
    for (const offsetCode of ['ETOUCH_OFFSET_CHECKING', 'ETOUCH_OFFSET_UNCONFIRMED', 'ETOUCH_OFFSET_MISMATCH']) {
      const params = offsetCode === 'ETOUCH_OFFSET_MISMATCH' ? { wcs: 'G54', axis: 'X', stored: '1', reported: '0' } : {};
      ctx = setup({ offset: () => ({ ...provenOffset(), proven: () => false, refusal: () => offsetRefusal(offsetCode, params) }) });
      await ctx.req('load', { file: 'box.nc' });
      expect((await refusalOf(ctx.machine('frame-prepare'))).code).toBe(offsetCode);
      expect(ctx.c.written).toEqual([]);
    }
    // Another work offset.
    ctx = setup();
    // Lot C1: the $G of this test says M5 too (a $G without a spindle word proves no stopped spindle).
    ctx.c.runner.state.parserstate = { modal: { wcs: 'G54', spindle: 'M5' } };
    ctx.c.runner.emit('parserstate', { modal: { wcs: 'G54', spindle: 'M5' } });
    ctx.c.settings.parameters = { G55: { x: -200, y: -200, z: 0 } };
    await ctx.req('load', { file: 'g55.nc' });
    expect(await code(ctx.machine('frame-prepare'))).toMatchObject({ code: 'ETOUCH_LASER_FRAME_WCS', params: { wcs: 'G55', active: 'G54' } });
  });

  test('5c. the lease and the stream: another pilot, another device\'s stream', async () => {
    const ctx = setup();
    await ctx.req('load', { file: 'box.nc' });
    ctx.control.takeover('TEST', B, 'essai');
    expect((await refusalOf(ctx.machine('frame-prepare', {}, A))).code).toBe('ECONTROL');
    await ctx.control.release('TEST', B);
    await expect(ctx.req('machine', { operation: 'frame-prepare' }, A, 'tB')).rejects.toThrow(/appareil dont le suivi est ouvert/);
    expect(ctx.c.written).toEqual([]);
  });

  test('5d. the start in the 0.5 mm band is refused with its figures; at the usable bound it is accepted', async () => {
    let ctx = setup({ at: [-399.7, -100, -60] });
    await ctx.req('load', { file: 'point.nc' });
    // point.nc at X 10 is machine −95: inside; the start (the way back) is not.
    expect(await code(ctx.machine('frame-prepare'))).toMatchObject({ code: 'ETOUCH_CNC_FRAME_START', params: { axis: 'X', value: '-399.7', low: '-399.5', high: '0' } });
    ctx = setup({ at: [-399.5, -100, -60] });
    await ctx.req('load', { file: 'point.nc' });
    expect((await ctx.machine('frame-prepare')).frame.lines.at(-1)).toBe('$J=G90 G21 X-294.5 Y5 F600');
  });

  test('6. a file too deep in Z: framing allowed, start refused', async () => {
    const ctx = setup();
    await ctx.req('load', { file: 'deep.nc' });
    const state = ctx.state();
    expect(state.programCheck.axes.Z.verdict).toBe('outside');
    expect(state.canStart).toBe(false);
    expect(state.canFrame).toBe(true);
    expect((await ctx.machine('frame-prepare')).frame.kind).toBe('cnc');
  });

  test('7. ticket: single use, expiry, another stream, the file changed on disk, the machine moved since', async () => {
    const ctx = setup();
    await ctx.req('load', { file: 'box.nc' });
    let ticket = await ctx.machine('frame-prepare');
    ctx.now += 16000;
    ctx.report();
    // Lot C1: 16 s later, CNCjs's $G exchange has come again.
    ctx.gc();
    expect((await refusalOf(ctx.machine('frame', { nonce: ticket.nonce }))).code).toBe('ETOUCH_LASER_FRAME_EXPIRED');
    ticket = await ctx.machine('frame-prepare');
    expect((await refusalOf(ctx.req('machine', { operation: 'frame', nonce: ticket.nonce }, A, 'tB'))).message).toMatch(/appareil dont le suivi est ouvert/);
    ticket = await ctx.machine('frame-prepare');
    expect((await refusalOf(ctx.machine('frame', { nonce: ticket.nonce }, B))).code).toBe('ECONTROL');
    ticket = await ctx.machine('frame-prepare');
    ctx.programs['box.nc'] += '\n(changed)';
    expect((await refusalOf(ctx.machine('frame', { nonce: ticket.nonce }))).message).toMatch(/Fichier modifié/);
    ctx.programs['box.nc'] = PROGRAMS['box.nc'];
    // Moved by 0.1 mm in Z, then in X: the Z line or the way back differ.
    for (const move of [[0, 0, 0.1], [0.1, 0, 0]]) {
      // Lot C1: two reports at rest at each place (a single one is no proven rest).
      ctx.c.at(-100, -100, -60);
      ctx.report();
      ctx.report();
      ticket = await ctx.machine('frame-prepare');
      ctx.c.at(-100 + move[0], -100 + move[1], -60 + move[2]);
      ctx.report();
      ctx.report();
      const err = await refusalOf(ctx.machine('frame', { nonce: ticket.nonce }));
      expect(err.code).toBe('ETOUCH_LASER_FRAME_CHANGED');
      expectCatalogMatch(err);
    }
    expect(ctx.c.written).toEqual([]);
    // Single use.
    ctx.c.at(-100, -100, -60);
    ctx.report();
    ctx.report();
    ticket = await ctx.machine('frame-prepare');
    await ctx.machine('frame', { nonce: ticket.nonce });
    expect((await refusalOf(ctx.machine('frame', { nonce: ticket.nonce }))).code).toBe('ETOUCH_LASER_FRAME_EXPIRED');
  });

  test('8. every new server message has its catalog row in FR, EN and ES', () => {
    const params = {
      ETOUCH_FRAME_STATE: { state: 'Hold' },
      ETOUCH_FRAME_REFUSED: { n: 15 },
      ETOUCH_FRAME_ALARM: { alarm: 2 },
      ETOUCH_FRAME_POSITION: { axis: 'X', expected: '-95', reported: '-94.94' }
    };
    Object.keys(FRAME_MESSAGES).forEach((key) => {
      const p = params[key] || {};
      expectCatalogMatch({ code: key, params: p, message: FRAME_MESSAGES[key](p) });
    });
    expectCatalogMatch({ code: 'ETOUCH_FRAME_ALARM', params: { alarm: null }, message: FRAME_MESSAGES.ETOUCH_FRAME_ALARM({ alarm: null }) });
  });
});

describe('CNC framing: the sequence (§ 4.2, § 5.3)', () => {
  test('9. one line at a time: not before its ok, not with one report after it, not while Jog', async () => {
    const ctx = setup();
    const { res } = await ctx.start();
    expect(res.lines).toEqual(LINES);
    expect(ctx.lines()).toEqual(['M5']);
    ctx.tick(500);
    expect(ctx.lines()).toEqual(['M5']);
    ctx.ok();
    ctx.c.state.status.activeState = 'Idle';
    ctx.now += 50;
    ctx.report();
    jest.advanceTimersByTime(50);
    expect(ctx.lines()).toEqual(['M5']);
    ctx.tick(100);
    expect(ctx.lines()).toEqual(LINES.slice(0, 2));
    // The Z line answered, but Jog still reported: nothing more.
    ctx.ok();
    ctx.c.state.status.activeState = 'Jog';
    ctx.tick(500);
    expect(ctx.lines()).toEqual(LINES.slice(0, 2));
  });

  test('10. no X/Y line while Z is not seen at the safe height: 0.06 mm short → stopped, D2 invalidated', async () => {
    const ctx = setup();
    await ctx.start();
    ctx.run();
    ctx.run([0, 0, -0.06]);
    expect(ctx.lines()).toEqual(LINES.slice(0, 2));
    const last = ctx.state().motion.lastFrame;
    expect(last).toMatchObject({ result: 'cancelled', kind: 'cnc', code: 'ETOUCH_FRAME_POSITION', params: { axis: 'Z', expected: '-5', reported: '-5.06' } });
    expectCatalogMatch(last);
    expect(ctx.invalidated).toContain('frame');
    expectNothingAfter(ctx, 2);
  });

  test('11. an X/Y arrival 0.06 mm off stops it (D2 invalidated); 0.04 mm off goes on', async () => {
    let ctx = setup();
    await ctx.start();
    runTo(ctx, 4);
    ctx.run([0.06, 0, 0]);
    expect(ctx.lines()).toHaveLength(4);
    expect(ctx.state().motion.lastFrame).toMatchObject({ code: 'ETOUCH_FRAME_POSITION', params: { axis: 'X', expected: '-45', reported: '-44.94' } });
    expect(ctx.invalidated).toContain('frame');
    expectNothingAfter(ctx, 4);

    ctx = setup();
    await ctx.start();
    runTo(ctx, 4);
    ctx.run([0.04, -0.04, 0]);
    expect(ctx.lines()).toHaveLength(5);
    expect(ctx.state().motion.frame).not.toBeNull();
    // Z lower than reached after the rise, by more than 0.05 mm: stopped.
    ctx.run([0, 0, -0.06]);
    expect(ctx.state().motion.lastFrame).toMatchObject({ code: 'ETOUCH_FRAME_POSITION', params: { axis: 'Z', expected: '-5', reported: '-5.06' } });
  });

  test('12. normal end: every line, Z never lower, ended with its kind and revision, logged, framing possible again', async () => {
    const ctx = setup();
    const { ticket } = await ctx.start();
    const zs = [];
    for (let i = 0; i < LINES.length; i++) {
      ctx.run();
      zs.push(ctx.c.machine()[2]);
    }
    expect(ctx.lines()).toEqual(LINES);
    expect(ctx.c.written.join('')).not.toMatch(NO_SPINDLE);
    expect(ctx.c.written).not.toContain('\x85');
    zs.slice(1).forEach((z) => expect(z).toBe(-5));
    expect(ctx.c.machine()).toEqual([-100, -100, -5]);
    const state = ctx.state();
    expect(state.motion.frame).toBeNull();
    expect(state.motion.lastFrame).toMatchObject({ result: 'ended', kind: 'cnc', code: null, revision: state.revision, sent: 8, total: 8 });
    expect(ctx.history.filter((e) => e.event === 'frame')).toEqual([expect.objectContaining({ result: 'ended', kind: 'cnc', lines: LINES, safeZ: ticket.frame.safeZ, actor: A })]);
    expect(state.canFrame).toBe(true);
  });
});

describe('CNC framing: the stops (§ 6)', () => {
  const stopBy = (ctx, how) => {
    if (how === 'stop' || how === 'pause' || how === 'spindleStop') {
      return ctx.req(how, {}, B);
    }
    return ctx.req('motion', { operation: 'jog-stop' }, B, 'tB');
  };

  test.each(['stop', 'pause', 'jog-stop', 'spindleStop'])('13-14. %s by a device without the lease, during M5, the rise, a side, after an ok: 0x85, nothing after', async (how) => {
    for (const [where, count] of [['M5', 1], ['raise', 2], ['side', 4], ['after ok', 5]]) {
      const ctx = setup();
      await ctx.start();
      runTo(ctx, count);
      if (where === 'after ok') {
        ctx.ok();
      } else if (where !== 'M5') {
        ctx.c.state.status.activeState = 'Jog';
        ctx.report();
      }
      await stopBy(ctx, how);
      expect([how, where, ctx.c.written.at(-1)]).toEqual([how, where, '\x85']);
      expect(ctx.state().motion.lastFrame).toMatchObject({ result: 'cancelled', code: null });
      expectNothingAfter(ctx, count);
      // Arrêter la broche writes no M5 of its own.
      expect(ctx.lines().filter((l) => l === 'M5')).toHaveLength(1);
    }
  });

  test('15. a stop from a CNCjs socket ends it before passing (P1); a socket command is refused meanwhile', async () => {
    for (const count of [4, 5]) {
      const ctx = setup();
      await ctx.start();
      runTo(ctx, count);
      expect(ctx.service.socketRefusal('TEST')).toMatchObject({ message: expect.stringMatching(/^Cadrage en cours/) });
      ctx.c.state.status.activeState = count === 4 ? 'Jog' : 'Idle';
      ctx.report();
      ctx.service.socketStop('TEST');
      expect(ctx.c.written.at(-1)).toBe('\x85');
      expect(ctx.state().motion.lastFrame).toMatchObject({ result: 'cancelled', reason: 'socket' });
      expectNothingAfter(ctx, count);
      expect(ctx.service.socketRefusal('TEST')).toBeNull();
    }
  });

  test('16. the stream: a rotation reopened by the device within 3 s goes on, nothing written while away (P2)', async () => {
    const ctx = setup();
    await ctx.start();
    runTo(ctx, 3);
    expect(ctx.service.ticketPending('tA')).toBe(true);
    ctx.c.state.status.activeState = 'Jog';
    ctx.report();
    ctx.service.closeTransport('tA', true);
    // The approach ends while the stream is away: the next side waits.
    ctx.run();
    ctx.tick(1000);
    expect(ctx.lines()).toHaveLength(3);
    ctx.service.openTransport('tA2', A);
    ctx.tick(100);
    expect(ctx.lines()).toHaveLength(4);
    expect(ctx.c.written).not.toContain('\x85');
    runTo(ctx, 8);
    ctx.run();
    expect(ctx.state().motion.lastFrame).toMatchObject({ result: 'ended' });
  });

  test('16b. the stream: not reopened → stopped at 3 s; really closed → stopped at once; another stream of the device → goes on; another device only → stopped', async () => {
    let ctx = setup();
    await ctx.start();
    runTo(ctx, 3);
    ctx.service.closeTransport('tA', true);
    ctx.tick(2900);
    expect(ctx.state().motion.frame).not.toBeNull();
    ctx.tick(200);
    expect(ctx.state().motion.lastFrame).toMatchObject({ code: 'ETOUCH_FRAME_STREAM' });
    expectNothingAfter(ctx, 3);

    ctx = setup();
    await ctx.start();
    runTo(ctx, 3);
    ctx.service.closeTransport('tA');
    expect(ctx.c.written.at(-1)).toBe('\x85');
    expect(ctx.state().motion.lastFrame).toMatchObject({ code: 'ETOUCH_FRAME_STREAM' });

    ctx = setup();
    ctx.service.openTransport('tA3', A);
    await ctx.start();
    runTo(ctx, 3);
    ctx.service.closeTransport('tA');
    ctx.run();
    expect(ctx.lines()).toHaveLength(4);
    expect(ctx.state().motion.frame).not.toBeNull();

    ctx = setup();
    await ctx.start();
    runTo(ctx, 3);
    // B's stream stays open, A's is gone: stopped.
    ctx.service.closeTransport('tA', true);
    ctx.tick(3100);
    expect(ctx.state().motion.lastFrame).toMatchObject({ code: 'ETOUCH_FRAME_STREAM' });
  });

  test('17. the lease: taken by another, released, in the same step as the action', async () => {
    for (const how of ['takeover', 'release']) {
      const ctx = setup();
      await ctx.start();
      runTo(ctx, 3);
      expect(ctx.state().control.owner).toMatchObject({ id: 'tablet-A' });
      if (how === 'takeover') {
        await ctx.req('control', { operation: 'takeover', reason: 'At the machine' }, B);
      } else {
        await ctx.req('control', { operation: 'release' }, A);
      }
      // Before any clock tick.
      expect([how, ctx.c.written.at(-1)]).toEqual([how, '\x85']);
      expect(ctx.state().motion.lastFrame).toMatchObject({ code: 'ETOUCH_FRAME_CONTROL' });
      expectNothingAfter(ctx, 3);
    }
  });

  test('18. a report older than 2.5 s stops it', async () => {
    const ctx = setup();
    await ctx.start();
    runTo(ctx, 4);
    ctx.now += 2600;
    jest.advanceTimersByTime(50);
    expect(ctx.state().motion.lastFrame).toMatchObject({ code: 'ETOUCH_FRAME_STALE' });
    expect(ctx.c.written.at(-1)).toBe('\x85');
  });

  test('19. an alarm: an ALARM line, or the Alarm state without a line', async () => {
    let ctx = setup();
    await ctx.start();
    runTo(ctx, 4);
    ctx.c.runner.emit('alarm', { message: '2' });
    ctx.tick(50);
    let last = ctx.state().motion.lastFrame;
    expect(last).toMatchObject({ code: 'ETOUCH_FRAME_ALARM', params: { alarm: 2 } });
    expectCatalogMatch(last);
    expectNothingAfter(ctx, 4);

    ctx = setup();
    await ctx.start();
    runTo(ctx, 4);
    ctx.c.state.status.activeState = 'Alarm';
    ctx.tick(50);
    last = ctx.state().motion.lastFrame;
    expect(last).toMatchObject({ code: 'ETOUCH_FRAME_ALARM', params: { alarm: null } });
    expectCatalogMatch(last);
  });

  // At $22=0 the travel cannot be checked: no CNC framing starts at all (test 5).
  test('20. a banner, then Idle reports: ended, not a byte after the banner (P3)', async () => {
    const ctx = setup();
    await ctx.start();
    runTo(ctx, 4);
    const before = ctx.c.written.length;
    ctx.c.runner.emit('startup', { firmware: 'Grbl', version: '1.1h' });
    ctx.c.state.status.activeState = 'Idle';
    ctx.c.at(0, 0, 0);
    ctx.ok();
    ctx.tick(61000);
    expect(ctx.c.written).toHaveLength(before);
    expect(ctx.state().motion.lastFrame).toMatchObject({ result: 'cancelled', code: 'ETOUCH_FRAME_RESTART' });
    expect(ctx.state().homed).toBe(false);
  });

  test('21. error:15 during a side: 0x85, refused, D2 invalidated; error:9: refused, D2 kept', async () => {
    for (const n of [15, 9]) {
      const ctx = setup();
      await ctx.start();
      runTo(ctx, 4);
      ctx.c.runner.emit('error', { message: String(n) });
      ctx.tick(50);
      expect(ctx.c.written.at(-1)).toBe('\x85');
      const last = ctx.state().motion.lastFrame;
      expect(last).toMatchObject({ result: 'refused', code: 'ETOUCH_FRAME_REFUSED', params: { n } });
      expectCatalogMatch(last);
      expect([n, ctx.invalidated.includes('frame')]).toEqual([n, n === 15]);
      expectNothingAfter(ctx, 4);
    }
  });

  test('22. a line past its time limit, or let go without its ok: timeout, no next line', async () => {
    let ctx = setup();
    await ctx.start();
    runTo(ctx, 4);
    ctx.c.state.status.activeState = 'Jog';
    // Side 1: 50 mm at 600 mm/min (5 s) + 10 s.
    ctx.tick(15200);
    expect(ctx.state().motion.lastFrame).toMatchObject({ code: 'ETOUCH_FRAME_TIMEOUT' });
    expectNothingAfter(ctx, 4);

    // M5 never answered while the board says Idle: released by settle (lost), without its ok.
    ctx = setup();
    await ctx.start();
    ctx.tick(10200);
    expect(ctx.state().motion.lastFrame).toMatchObject({ code: 'ETOUCH_FRAME_TIMEOUT' });
    expectNothingAfter(ctx, 1);
  });

  test('23-24. during it: D2 proof changed, Home, a job started elsewhere, Hold, the spindle, moves disabled → state', async () => {
    // The reference lost comes with an alarm or a banner (tests 19 and 20).
    const cases = [
      ['offset', (ctx) => {
        ctx.proof = 2;
      }],
      ['Home', (ctx) => {
        ctx.c.state.status.activeState = 'Home';
      }],
      ['job', (ctx) => {
        ctx.c.workflow.state = 'running';
      }],
      ['Hold', (ctx) => {
        ctx.c.state.status.activeState = 'Hold';
      }],
      ['spindle', (ctx) => {
        ctx.c.state.status.spindle = 1000;
      }],
      ['disabled', (ctx) => {
        ctx.enabled = false;
      }]
    ];
    for (const [cause, act] of cases) {
      const ctx = setup();
      await ctx.start();
      runTo(ctx, 4);
      act(ctx);
      ctx.tick(50);
      const last = ctx.state().motion.lastFrame;
      expect([cause, last && last.code, last && last.params.state]).toEqual([cause, 'ETOUCH_FRAME_STATE', cause]);
      expect(ctx.c.written.at(-1)).toBe('\x85');
    }
  });

  test('25. the controller closed: lost, nothing written', async () => {
    const ctx = setup();
    await ctx.start();
    runTo(ctx, 4);
    const before = ctx.c.written.length;
    ctx.c.closed = true;
    ctx.tick(100);
    expect(ctx.c.written).toHaveLength(before);
  });
});

describe('CNC framing: exclusions and snapshot', () => {
  test('26. while it runs: load, start, homing, jog, set-kind, a second framing, a system command are refused; Stop and Pause offered; the lease kept', async () => {
    const ctx = setup();
    await ctx.start();
    runTo(ctx, 4);
    const before = ctx.c.written.length;
    const state = ctx.state();
    expect(state).toMatchObject({ canStop: true, canPause: true, canFrame: false, canStart: false, canLoad: false, canHome: false });
    expect(state.motion.canJog).toBe(false);
    for (const [action, extra] of [['load', { file: 'box.nc' }], ['prepare', { operation: 'home' }], ['prepare', { operation: 'start', revision: state.revision }], ['motion', { operation: 'jog', axis: 'X', direction: 1, step: 1, feed: 500 }]]) {
      await expect(ctx.req(action, extra)).rejects.toBeTruthy();
    }
    await expect(ctx.machine('frame-prepare')).rejects.toBeTruthy();
    await expect(ctx.machine('set-kind', { kind: 'laser' })).rejects.toBeTruthy();
    expect(() => ctx.service.reserveSystemCommand({ title: 'Maintenance' })).toThrow();
    expect(ctx.c.written).toHaveLength(before);
    // The lease does not expire by itself while it runs (5 minutes idle otherwise).
    ctx.now += 6 * 60 * 1000;
    ctx.service.observe();
    expect(ctx.state().control.owner).toMatchObject({ id: 'tablet-A' });
  });

  test('27. the snapshot: phase and side of the line in progress, the reason when refused', async () => {
    const ctx = setup();
    await ctx.req('load', { file: 'box.nc' });
    expect(ctx.state()).toMatchObject({ canFrame: true, frameReason: '' });
    const ticket = await ctx.machine('frame-prepare');
    await ctx.machine('frame', { nonce: ticket.nonce });
    const seen = [];
    seen.push(ctx.state().motion.frame);
    for (let i = 1; i < LINES.length; i++) {
      ctx.run();
      seen.push(ctx.state().motion.frame);
    }
    expect(seen.map((f) => [f.kind, f.phase, f.side, f.sides])).toEqual([
      ['cnc', 'spindle', null, 4],
      ['cnc', 'raise', null, 4],
      ['cnc', 'approach', null, 4],
      ['cnc', 'side', 1, 4],
      ['cnc', 'side', 2, 4],
      ['cnc', 'side', 3, 4],
      ['cnc', 'side', 4, 4],
      ['cnc', 'return', null, 4]
    ]);
    // The machine is held by the framing from its first line to its end (review D1).
    expect(ctx.state()).toMatchObject({ canFrame: false, frameReason: 'Cadrage en cours.' });
  });
});

describe('laser framing stays as it was (non-regression of lot F1)', () => {
  test('a declared laser: the same lines byte for byte, no Z line, no $20 guard', async () => {
    const settings = { ...SETTINGS, $32: '1' };
    delete settings.$20;
    const ctx = setup({ settings, machines: [laserRecord(settings)] });
    ctx.c.at(-100, -100, -10);
    ctx.report();
    // Lot C1: a second report at rest at the new place.
    ctx.report();
    await ctx.req('load', { file: 'frame.nc' });
    const ticket = await ctx.machine('frame-prepare');
    expect(ticket.frame).toEqual({
      kind: 'laser',
      lines: ['M5', '$J=G90 G21 X10 Y20 F1000', '$J=G90 G21 X60 Y20 F1000', '$J=G90 G21 X60 Y50 F1000', '$J=G90 G21 X10 Y50 F1000', '$J=G90 G21 X10 Y20 F1000'],
      bounds: { xMin: 10, xMax: 60, yMin: 20, yMax: 50 },
      feed: 1000
    });
    expect(ticket.name).toMatch(/^Cadrage laser/);
  });

  test('a laser framing ends at a banner too, with nothing written after it (P3, common to both kinds)', async () => {
    const settings = { ...SETTINGS, $32: '1' };
    const ctx = setup({ settings, machines: [laserRecord(settings)] });
    await ctx.req('load', { file: 'frame.nc' });
    const ticket = await ctx.machine('frame-prepare');
    await ctx.machine('frame', { nonce: ticket.nonce });
    ctx.ok();
    ctx.c.state.status.activeState = 'Idle';
    ctx.tick(150);
    expect(ctx.lines()).toHaveLength(2);
    const before = ctx.c.written.length;
    ctx.c.runner.emit('startup', { firmware: 'Grbl', version: '1.1h' });
    ctx.ok();
    ctx.tick(61000);
    expect(ctx.c.written).toHaveLength(before);
    expect(ctx.state().motion.lastFrame).toMatchObject({ result: 'cancelled', code: 'ETOUCH_FRAME_RESTART', kind: 'laser' });
  });
});

// The safety review of the lot (Astra, F1): each danger (D1-D4) and correction (C1-C3) in its
// exact window. Each case failed before its correction.
describe('CNC framing: the windows of the safety review', () => {
  // The line just written is answered and seen at rest twice, without any supervisor tick.
  const answeredAtRest = (ctx) => {
    ctx.ok();
    ctx.c.state.status.activeState = 'Idle';
    ctx.report();
    ctx.report();
  };
  const BUSY = /^Cadrage en cours/;
  // Every request that would move or zero the machine, from the device that runs the framing.
  const moves = (ctx, transportId = 'tA') => [
    ['step Z−1', () => ctx.req('motion', { operation: 'jog', axis: 'Z', direction: -1, step: 1, feed: 300 }, A, transportId)],
    ['continuous X+', () => ctx.req('motion', { operation: 'jog-start', axis: 'X', direction: 1, feed: 300 }, A, transportId)],
    ['zero X', () => ctx.req('prepare', { operation: 'set-origin', axes: ['X'] }, A, transportId)],
    ['second framing', () => ctx.req('machine', { operation: 'frame-prepare' }, A, transportId)]
  ];

  test('D1 / 26b. between two lines (ok and two reports at rest, before the supervisor runs): step, continuous jog, zero and a second framing refused; the box goes on at the safe height', async () => {
    // Astra's case: started at Z machine −5 (no Z line), M5 answered.
    const ctx = setup({ at: [-100, -100, -5] });
    await ctx.start();
    answeredAtRest(ctx);
    const before = ctx.c.written.length;
    for (const [name, attempt] of moves(ctx)) {
      const err = await refusalOf(attempt());
      expect([name, err.message]).toEqual([name, expect.stringMatching(BUSY)]);
    }
    expect(ctx.c.written).toHaveLength(before);
    expect(ctx.state().motion).toMatchObject({ canJog: false, jogReason: expect.stringMatching(BUSY), canSetOrigin: false });
    // The supervisor's next step: the approach, at the height it was.
    ctx.tick(50);
    expect(ctx.lines()).toEqual(['M5', '$J=G90 G21 X10 Y20 F600']);
    expect(ctx.c.machine()[2]).toBe(-5);
  });

  test('D1 / 26b. the same during a rotation of the stream: the new stream of the device cannot move the machine either', async () => {
    const ctx = setup();
    await ctx.start();
    runTo(ctx, 3);
    ctx.service.closeTransport('tA', true);
    ctx.c.state.status.activeState = 'Jog';
    ctx.report();
    ctx.c.at(10 + OFFSET.x, 20 + OFFSET.y, -5);
    answeredAtRest(ctx);
    ctx.service.openTransport('tA2', A);
    const before = ctx.c.written.length;
    for (const [name, attempt] of moves(ctx, 'tA2')) {
      const err = await refusalOf(attempt());
      expect([name, err.message]).toEqual([name, expect.stringMatching(BUSY)]);
    }
    expect(ctx.c.written).toHaveLength(before);
  });

  test('D2. no rise planned: the machine moved while M5 waited → stopped before any X/Y (_POSITION), never taken as the new floor', async () => {
    for (const [name, to, params] of [
      ['Z down to −60', [-100, -100, -60], { axis: 'Z', expected: '0', reported: '-60' }],
      ['X moved', [-90, -100, 0], { axis: 'X', expected: '-100', reported: '-90' }]
    ]) {
      // Prepared at Z 0, above the safe height (−5): no Z line.
      const ctx = setup({ at: [-100, -100, 0] });
      const { res } = await ctx.start();
      expect(res.lines.some((l) => /Z/.test(l))).toBe(false);
      ctx.c.at(...to);
      ctx.report();
      answeredAtRest(ctx);
      ctx.tick(150);
      expect([name, ctx.lines()]).toEqual([name, ['M5']]);
      expect([name, ctx.state().motion.lastFrame]).toEqual([name, expect.objectContaining({ code: 'ETOUCH_FRAME_POSITION', params })]);
      expect(ctx.invalidated).toContain('frame');
      expectNothingAfter(ctx, 1);
    }
  });

  test('D2 / D3. the safe height is required right before the first X/Y, even after the rise was validated', async () => {
    const ctx = setup();
    await ctx.start();
    runTo(ctx, 2);
    // The rise arrives while the stream rotates: validated, the approach waits.
    ctx.service.closeTransport('tA', true);
    ctx.run();
    expect(ctx.lines()).toHaveLength(2);
    // Then Z goes 0.2 mm down, at rest: the approach must not leave.
    ctx.c.at(-100, -100, -5.2);
    ctx.service.openTransport('tA2', A);
    ctx.tick(150);
    expect(ctx.lines()).toHaveLength(2);
    expect(ctx.state().motion.lastFrame).toMatchObject({ code: 'ETOUCH_FRAME_POSITION', params: { axis: 'Z', reported: '-5.2' } });
    expectNothingAfter(ctx, 2);
  });

  test('D3. an arrival validated while the stream rotates is no leave to send: a report elsewhere, lower, in Jog or at rest stops it before the next side', async () => {
    for (const [name, state] of [['Jog', 'Jog'], ['at rest', 'Idle']]) {
      const ctx = setup();
      await ctx.start();
      runTo(ctx, 3);
      ctx.service.closeTransport('tA', true);
      ctx.run();
      expect(ctx.lines()).toHaveLength(3);
      // Another client moves the machine: 2 mm off in X and Y, Z at −50.
      ctx.c.at(12 + OFFSET.x, 22 + OFFSET.y, -50);
      ctx.c.state.status.activeState = state;
      ctx.report();
      ctx.service.openTransport('tA2', A);
      ctx.tick(100);
      expect([name, ctx.lines().length]).toEqual([name, 3]);
      expect([name, ctx.state().motion.frame]).toEqual([name, null]);
      expect([name, ctx.state().motion.lastFrame.code]).toEqual([name, expect.stringMatching(/^ETOUCH_FRAME_(STATE|POSITION)$/)]);
      expectNothingAfter(ctx, 3);
    }
  });

  describe('through the real facade (index.js refuseSocket, refuseUpload)', () => {
    const socket = { id: 's1', handshake: { address: '10.0.0.5' }, decoded_token: { id: 'u', name: 'pc' } };
    let rcfile;
    beforeAll(() => {
      rcfile = settings.rcfile;
      settings.rcfile = path.join(os.tmpdir(), 'cnc-touch-f1-facade-' + process.pid, '.cncrc');
    });
    afterAll(() => {
      settings.rcfile = rcfile;
    });
    // The facade over this test's service; stopping the facade disposes that service.
    const facade = (ctx) => {
      mockFacade.service = ctx.service;
      touch.start();
      mockFacade.service = null;
      services.splice(services.indexOf(ctx.service), 1);
    };
    afterEach(() => {
      if (touch.isStarted()) {
        touch.stop();
      }
      mockFacade.service = null;
    });

    test.each([
      ['command', 'jogCancel'],
      ['write', '\x85'],
      ['write', '?\x85'],
      ['writeln', '\x85'],
      ['command', 'feedhold'],
      ['write', '!']
    ])('D4. %s %j from a CNCjs client, during M5 and once a side reached its end: the framing ends before it passes, nothing leaves after it', async (kind, data) => {
      for (const [where, count] of [['M5', 1], ['side reached', 4]]) {
        const ctx = setup();
        facade(ctx);
        await ctx.start();
        runTo(ctx, count);
        if (where === 'side reached') {
          ctx.c.state.status.activeState = 'Jog';
          ctx.report();
          ctx.c.at(60 + OFFSET.x, 20 + OFFSET.y, -5);
        }
        answeredAtRest(ctx);
        expect([where, touch.refuseSocket(socket, 'TEST', kind, data)]).toEqual([where, null]);
        expect([where, ctx.state().motion.frame]).toEqual([where, null]);
        expect([where, ctx.state().motion.lastFrame]).toEqual([where, expect.objectContaining({ result: 'cancelled', reason: 'socket' })]);
        expect(ctx.c.written.at(-1)).toBe('\x85');
        expectNothingAfter(ctx, count);
        touch.stop();
      }
    });

    test('C3. the classic upload (POST /api/gcode) is refused while a framing runs or waits to start', async () => {
      const ctx = setup();
      facade(ctx);
      await ctx.req('load', { file: 'box.nc' });
      expect(touch.refuseUpload('TEST')).toBeNull();
      const ticket = await ctx.machine('frame-prepare');
      const started = ctx.machine('frame', { nonce: ticket.nonce });
      // Waiting for the file to be read again (frameStarting).
      expect(touch.refuseUpload('TEST')).toMatchObject({ message: expect.stringMatching(BUSY) });
      await started;
      expect(touch.refuseUpload('TEST')).toMatchObject({ message: expect.stringMatching(BUSY) });
      await expect(ctx.req('load', { file: 'box.nc' })).rejects.toBeTruthy();
      ctx.service.socketStop('TEST');
      expect(touch.refuseUpload('TEST')).toBeNull();
    });

    // Second review, family 1: every command and raw write that index.js lets pass while a framing
    // runs, read from control.js (SAFE_COMMANDS, SAFE_WRITES), not from the review. A query leaves
    // the framing alone; anything else ends it before it passes. autolevel:stop resets the board
    // (GrblController), 0x84 opens the safety door: neither did (D4 of the second review).
    const QUERIES = [['command', 'statusreport'], ['command', 'autolevel:getProbeState'], ['write', '?'], ['writeln', '?'], ['write', '??']];
    const PASSING = [
      ...SAFE_COMMANDS.map((cmd) => ['command', cmd]),
      ...SAFE_WRITES.flatMap((ch) => [['write', ch], ['writeln', ch], ['write', '?' + ch]])
    ];
    const isQuery = ([kind, data]) => QUERIES.some(([k, d]) => k === kind && d === data);

    test('second review, family 1: every safe command or write of a CNCjs client other than a query ends the framing before it passes; no line after, even before its reset or door is reported', async () => {
      expect(PASSING.filter((p) => !isQuery(p)).map(([, d]) => d)).toEqual(expect.arrayContaining(['autolevel:stop', 'reset', '\x18', '\x84', '\x85']));
      for (const [kind, data] of PASSING.filter((p) => !isQuery(p))) {
        for (const where of ['between two lines', 'during a side']) {
          const label = [kind, data, where];
          // Astra's case: Z machine −5 (no Z line), M5 answered and two reports at rest, no tick yet.
          const ctx = setup({ at: [-100, -100, -5] });
          facade(ctx);
          await ctx.start();
          if (where === 'during a side') {
            runTo(ctx, 3);
            ctx.c.state.status.activeState = 'Jog';
            ctx.report();
          } else {
            answeredAtRest(ctx);
          }
          const count = ctx.lines().length;
          expect([label, touch.refuseSocket(socket, 'TEST', kind, data)]).toEqual([label, null]);
          expect([label, ctx.state().motion.frame]).toEqual([label, null]);
          expect([label, ctx.state().motion.lastFrame]).toEqual([label, expect.objectContaining({ result: 'cancelled', reason: 'socket' })]);
          // No report and no banner for 2 s: the reset (autolevel:stop, 0x18) or the door is not seen yet.
          for (let t = 0; t < 2000; t += 50) {
            ctx.now += 50;
            jest.advanceTimersByTime(50);
          }
          expect([label, ctx.lines()]).toEqual([label, ctx.lines().slice(0, count)]);
          // Then the banner, and a minute at rest: not a byte.
          const before = ctx.c.written.length;
          ctx.c.runner.emit('startup', { firmware: 'Grbl', version: '1.1h' });
          ctx.c.state.status.activeState = 'Idle';
          ctx.ok();
          ctx.tick(61000);
          expect([label, ctx.c.written.slice(before), ctx.lines().length]).toEqual([label, [], count]);
          touch.stop();
        }
      }
    });

    test('second review, family 1: a query from a CNCjs client leaves the framing alone; it goes on to its end', async () => {
      for (const [kind, data] of PASSING.filter(isQuery)) {
        const ctx = setup({ at: [-100, -100, -5] });
        facade(ctx);
        await ctx.start();
        answeredAtRest(ctx);
        expect([kind, data, touch.refuseSocket(socket, 'TEST', kind, data)]).toEqual([kind, data, null]);
        expect([kind, data, ctx.state().motion.frame]).not.toEqual([kind, data, null]);
        ctx.tick(50);
        runTo(ctx, 7);
        ctx.run();
        expect([kind, data, ctx.state().motion.lastFrame]).toEqual([kind, data, expect.objectContaining({ result: 'ended' })]);
        expect(ctx.c.written).not.toContain('\x85');
        touch.stop();
      }
    });

    test('second review, family 1: every other command or write of a CNCjs client is refused while the framing runs, which goes on', async () => {
      const ctx = setup({ at: [-100, -100, -5] });
      facade(ctx);
      await ctx.start();
      answeredAtRest(ctx);
      const before = ctx.c.written.length;
      for (const [kind, data] of [
        ['command', 'gcode'], ['command', 'gcode:start'], ['command', 'gcode:resume'], ['command', 'cyclestart'], ['command', 'homing'],
        ['command', 'unlock'], ['command', 'sleep'], ['command', 'feeder:start'], ['command', 'feeder:feed'], ['command', 'macro:run'],
        ['command', 'lasertest:on'], ['command', 'feedOverride'], ['command', 'autolevel:start'], ['command', 'gcode:load'], ['command', 'close'],
        ['writeln', '$X'], ['writeln', 'G0 X0'], ['write', '~'], ['write', '\x9e'], ['write', '\x85~'], ['write', '! G0']
      ]) {
        expect([kind, data, touch.refuseSocket(socket, 'TEST', kind, data)]).toEqual([kind, data, expect.objectContaining({ message: expect.stringMatching(BUSY) })]);
      }
      expect(ctx.state().motion.frame).not.toBeNull();
      expect(ctx.c.written).toHaveLength(before);
    });
  });

  test('C3. a program replaced anyway (the sender loads or unloads a file) ends the framing at once: 0x85, nothing after', async () => {
    for (const how of ['load', 'unload']) {
      const ctx = setup();
      await ctx.start();
      runTo(ctx, 4);
      ctx.c.state.status.activeState = 'Jog';
      ctx.report();
      if (how === 'load') {
        ctx.c.command('gcode:load', 'other.nc', 'G0 X0', {}, () => {});
      } else {
        ctx.c.sender.emit('unload');
      }
      expect([how, ctx.state().motion.frame]).toEqual([how, null]);
      expect([how, ctx.state().motion.lastFrame]).toEqual([how, expect.objectContaining({ result: 'cancelled', code: 'ETOUCH_FRAME_STATE', params: { state: 'program' } })]);
      expect(ctx.c.written.at(-1)).toBe('\x85');
      expectNothingAfter(ctx, 4);
    }
  });

  test('C1. after a banner, before the next supervisor tick: a change of the lease or the stream closing write nothing; _RESTART kept', async () => {
    const acts = [
      ['release', (ctx) => ctx.req('control', { operation: 'release' }, A)],
      ['takeover', (ctx) => ctx.req('control', { operation: 'takeover', reason: 'At the machine' }, B)],
      ['stream closed', (ctx) => ctx.service.closeTransport('tA')],
      ['stream rotated', (ctx) => ctx.service.closeTransport('tA', true)]
    ];
    for (const [name, act] of acts) {
      const ctx = setup();
      await ctx.start();
      runTo(ctx, 4);
      ctx.c.state.status.activeState = 'Jog';
      ctx.report();
      const before = ctx.c.written.length;
      ctx.c.runner.emit('startup', { firmware: 'Grbl', version: '1.1h' });
      await act(ctx);
      ctx.c.state.status.activeState = 'Idle';
      ctx.tick(61000);
      expect([name, ctx.c.written.slice(before)]).toEqual([name, []]);
      expect([name, ctx.state().motion.lastFrame]).toEqual([name, expect.objectContaining({ result: 'cancelled', code: 'ETOUCH_FRAME_RESTART' })]);
    }
  });

  // An explicit stop of an operator after the banner is not a callback of the sequence: with a jog
  // line of ours maybe still in flight (settle), it sends its 0x85, which moves nothing; no line.
  test('C1. after a banner, Arrêter or a stop of a CNCjs client: no line, a jog cancel at most; _RESTART kept', async () => {
    for (const [name, act] of [['stop', (ctx) => ctx.req('stop', {}, B)], ['socket stop', (ctx) => ctx.service.socketStop('TEST')]]) {
      const ctx = setup();
      await ctx.start();
      runTo(ctx, 4);
      ctx.c.state.status.activeState = 'Jog';
      ctx.report();
      const before = ctx.c.written.length;
      ctx.c.runner.emit('startup', { firmware: 'Grbl', version: '1.1h' });
      expect([name, ctx.state().motion.frame]).toEqual([name, null]);
      await act(ctx);
      ctx.c.state.status.activeState = 'Idle';
      ctx.tick(61000);
      expect([name, ctx.c.written.slice(before).filter((b) => b !== '\x85')]).toEqual([name, []]);
      expect([name, ctx.c.written.slice(before).length <= 1]).toEqual([name, true]);
      expect([name, ctx.state().motion.lastFrame]).toEqual([name, expect.objectContaining({ result: 'cancelled', code: 'ETOUCH_FRAME_RESTART' })]);
    }
  });

  test('C1. a jog cancel being repeated stops repeating at a banner', async () => {
    const ctx = setup();
    await ctx.start();
    runTo(ctx, 4);
    ctx.c.state.status.activeState = 'Jog';
    ctx.report();
    await ctx.req('stop', {}, B);
    expect(ctx.c.written.at(-1)).toBe('\x85');
    ctx.c.runner.emit('startup', { firmware: 'Grbl', version: '1.1h' });
    const before = ctx.c.written.length;
    // Jog still reported (a report parsed late, or another client's jog in the new session).
    ctx.tick(3000);
    expect(ctx.c.written.slice(before)).toEqual([]);
  });

  // Lot C1 (design/plaque/C1-CONCEPTION.md, R-3 and § 4.1 point 2): before C1 this test started a
  // framing without any reported speed, on the $G alone, and showed a $G with M3 / M4 or a $G too old
  // stopping it. A board that gives no whole FS: is now refused at the start (no fallback on $G);
  // with the speed reported, a $G with M3 or M4 still stops the framing, and a $G that only grows
  // old during a line stops nothing (no fresh $G is asked for during a line).
  test('C2. without a reported speed the framing is refused at its start; with it, a $G with M3 or M4 during the framing stops it, a $G growing old during a line does not', async () => {
    const cases = [
      ['M3', (ctx) => ctx.modal('M3'), true],
      ['M4', (ctx) => ctx.modal('M4'), true],
      ['$G too old', (ctx) => {
        ctx.now += 2600;
        ctx.report();
      }, false]
    ];
    for (const [name, act, stops] of cases) {
      const ctx = setup();
      ctx.modal = (spindle) => {
        ctx.c.state.parserstate = { modal: { wcs: 'G54', spindle } };
        ctx.c.runner.emit('parserstate', ctx.c.state.parserstate);
      };
      ctx.c.state.status.spindle = undefined;
      ctx.modal('M5');
      ctx.report();
      await ctx.req('load', { file: 'box.nc' });
      expect([name, (await refusalOf(ctx.machine('frame-prepare'))).code]).toEqual([name, 'ETOUCH_MOTION_SPINDLE_UNKNOWN']);
      expect([name, ctx.c.written]).toEqual([name, []]);
      // The speed reported again (FS:0,0), two reports at rest.
      ctx.c.state.status.spindle = 0;
      ctx.report();
      ctx.report();
      await ctx.start();
      runTo(ctx, 4);
      ctx.modal('M5');
      ctx.c.state.status.activeState = 'Jog';
      ctx.report();
      act(ctx);
      ctx.tick(50);
      if (stops) {
        expect([name, ctx.state().motion.lastFrame]).toEqual([name, expect.objectContaining({ code: 'ETOUCH_FRAME_STATE', params: { state: 'spindle' } })]);
        expect([name, ctx.c.written.at(-1)]).toEqual([name, '']);
      } else {
        expect([name, !!ctx.state().motion.frame, ctx.c.written.includes('')]).toEqual([name, true, false]);
      }
    }
  });
});

// The second safety review (Astra, F1): each family closed by one passage, listed from the code
// (F1-CORRECTIONS.md, « Second tour »). Each case failed before its correction, unless said otherwise.
describe('CNC framing: the families of the second review', () => {
  const banner = (ctx) => ctx.c.runner.emit('startup', { firmware: 'Grbl', version: '1.1h' });
  const STEP = { operation: 'jog', axis: 'X', direction: 1, step: 1, feed: 300 };
  const CONTINUOUS = { operation: 'jog-start', axis: 'X', direction: 1, feed: 300 };
  // A framing in a side, a step or a continuous jog in progress (Jog reported).
  const startMove = async (ctx, what) => {
    if (what === 'framing') {
      await ctx.start();
      runTo(ctx, 4);
    } else {
      await ctx.req('motion', what === 'step' ? STEP : CONTINUOUS);
    }
    ctx.c.state.status.activeState = 'Jog';
    ctx.report();
  };

  // Family 2: a write after a banner. A framing's line or cancel belongs to its board session: nothing
  // automatic reaches a restarted board for it. A step or a continuous jog keeps the automatic stop
  // it had before the lot (third review: the second round had taken it away; manual-jog-banner.test.js).
  test('family 2 (third review): the service disposed after a banner writes nothing for a framing of the old session; a step or a continuous jog gets its 0x85 as before the lot; before a banner, one 0x85 each', async () => {
    for (const what of ['framing', 'step', 'continuous']) {
      for (const restarted of [true, false]) {
        const ctx = setup();
        await startMove(ctx, what);
        if (restarted) {
          banner(ctx);
        }
        const before = ctx.c.written.length;
        services.splice(services.indexOf(ctx.service), 1);
        ctx.service.dispose();
        expect([what, restarted, ctx.c.written.slice(before)]).toEqual([what, restarted, restarted && what === 'framing' ? [] : ['\x85']]);
      }
    }
  });

  // Third review: the regression of the second round. A $J run by the restarted board (Jog reported)
  // is stopped by the supervision of the step or continuous jog, as before the lot.
  test('family 2 (third review): after a banner, the supervision of a step or a continuous jog still cancels it (0x85, nothing else) when its report goes stale, its stream closes or its lease is taken', async () => {
    const causes = [
      ['stale report', () => {}],
      ['stream closed', (ctx) => ctx.service.closeTransport('tA')],
      ['lease taken', (ctx) => ctx.req('control', { operation: 'takeover', reason: 'At the machine' }, B)]
    ];
    for (const what of ['step', 'continuous']) {
      for (const [cause, act] of causes) {
        const ctx = setup();
        await startMove(ctx, what);
        banner(ctx);
        const before = ctx.c.written.length;
        await act(ctx);
        jest.advanceTimersByTime(100);
        ctx.c.state.status.activeState = 'Idle';
        ctx.tick(3000);
        const after = ctx.c.written.slice(before);
        expect([what, cause, after[0], after.filter((b) => b !== '\x85')]).toEqual([what, cause, '\x85', []]);
      }
    }
  });

  // Not a failure before the correction: the policy kept and now tested (C1 of the second review). A
  // stop asked by a person after the banner acts on the restarted board like on any other.
  test('family 2: Arrêter asked after the banner: 0x85 repeated only while a newer report says Jog, 200 ms apart at least; never a line; nothing once at rest', async () => {
    const ctx = setup();
    await startMove(ctx, 'framing');
    banner(ctx);
    expect(ctx.state().motion.lastFrame).toMatchObject({ code: 'ETOUCH_FRAME_RESTART' });
    const before = ctx.c.written.length;
    await ctx.req('stop', {}, B);
    // The restarted board reports Jog for a second (a $J of ours received after its restart).
    ctx.c.state.status.activeState = 'Jog';
    ctx.tick(1000);
    const sent = ctx.c.written.slice(before);
    expect(sent.every((b) => b === '\x85')).toBe(true);
    expect(sent.length).toBeGreaterThan(1);
    expect(sent.length).toBeLessThanOrEqual(1 + 1000 / 200);
    const atRest = ctx.c.written.length;
    ctx.c.state.status.activeState = 'Idle';
    ctx.tick(61000);
    expect(ctx.c.written).toHaveLength(atRest);
    expect(ctx.lines()).toHaveLength(4);
  });

  // Family 3: a check made once at the start, then relied upon. Each start condition is checked again
  // at every step of the supervisor, or right before each line.
  const finishSide = (ctx, act) => {
    const line = ctx.lines()[ctx.lines().length - 1];
    const abs = /X(-?[\d.]+) Y(-?[\d.]+)/.exec(line);
    act(ctx);
    ctx.tick(50);
    ctx.c.at(Number(abs[1]) + OFFSET.x, Number(abs[2]) + OFFSET.y, ctx.c.machine()[2]);
    if (act.keep) {
      act.keep(ctx);
    }
    ctx.ok();
    ctx.c.state.status.activeState = 'Idle';
    ctx.tick(150);
  };
  const shiftWpos = (ctx) => {
    ctx.c.state.status.wpos = { ...ctx.c.state.status.wpos, x: f3(Number(ctx.c.state.status.wpos.x) + 1) };
  };
  shiftWpos.keep = shiftWpos;
  const modal = (wcs) => (ctx) => {
    ctx.c.state.parserstate = { modal: { wcs, spindle: 'M5' } };
    ctx.c.runner.emit('parserstate', ctx.c.state.parserstate);
  };
  test.each([
    ['CNCjs automations configured meanwhile', (ctx) => ctx.events.push({ event: 'gcode:stop', trigger: 'gcode', commands: 'G0 Z0', enabled: true }), 'automations'],
    ['reports in inches ($13=1)', (ctx) => {
      ctx.c.settings.settings.$13 = '1';
    }, 'settings'],
    ['a travel setting changed ($130)', (ctx) => {
      ctx.c.settings.settings.$130 = '300';
    }, 'settings'],
    ['another work coordinate system ($G G55), the D2 proof unchanged', modal('G55'), 'offset'],
    ['the work offset changed (WCO 1 mm in X), the D2 proof unchanged', shiftWpos, 'offset'],
    ['the start guard itself (CNCjs controller not ready)', (ctx) => {
      ctx.c.ready = false;
    }, 'busy']
  ])('family 3: %s while a side runs → stopped, no next side', async (name, act, cause) => {
    const ctx = setup();
    modal('G54')(ctx);
    await ctx.start();
    runTo(ctx, 4);
    ctx.c.state.status.activeState = 'Jog';
    ctx.report();
    finishSide(ctx, act);
    expect(ctx.lines()).toHaveLength(4);
    expect(ctx.state().motion.lastFrame).toMatchObject({ result: 'cancelled', code: 'ETOUCH_FRAME_STATE', params: { state: cause } });
    expect(ctx.c.written).toContain('\x85');
    expectNothingAfter(ctx, 4);
  });

  test('family 3, witness: the same framing with nothing changed goes to its end', async () => {
    const ctx = setup();
    modal('G54')(ctx);
    await ctx.start();
    runTo(ctx, 4);
    ctx.c.state.status.activeState = 'Jog';
    ctx.report();
    finishSide(ctx, () => {});
    runTo(ctx, 8);
    ctx.run();
    expect(ctx.state().motion.lastFrame).toMatchObject({ result: 'ended' });
  });

  // A remark of the second review (not a failure before): the safe height alone, independent of the arrival.
  test('remark: the safe height alone (−5.005 at the start, no rise; −5.054 at rest, within 0.05 mm of the arrival but under the safe height) → no X/Y', async () => {
    const ctx = setup({ at: [-100, -100, -5.005] });
    const { res } = await ctx.start();
    expect(res.lines.some((l) => /Z/.test(l))).toBe(false);
    ctx.c.at(-100, -100, -5.054);
    ctx.ok();
    ctx.c.state.status.activeState = 'Idle';
    ctx.tick(150);
    expect(ctx.lines()).toEqual(['M5']);
    expect(ctx.state().motion.lastFrame).toMatchObject({ code: 'ETOUCH_FRAME_POSITION', params: { axis: 'Z', expected: '-5', reported: '-5.054' } });
    expectNothingAfter(ctx, 1);
  });
});

// The third safety review (Astra, F1): the state table of the sequence (F1-CORRECTIONS.md,
// « Troisième tour »). Each state, each event, one answer, one case. The manual moves (a step, a
// continuous jog) are not in it: they behave exactly as before the lot (manual-jog-banner.test.js).
describe('CNC framing: the state table of the third review', () => {
  const banner = (ctx) => ctx.c.runner.emit('startup', { firmware: 'Grbl', version: '1.1h' });
  const jog = (ctx) => {
    ctx.c.state.status.activeState = 'Jog';
    ctx.report();
  };
  // Each state, reached from a fresh setup.
  const STATES = {
    // The start confirmed, the file being read again (frameStarting), held until the event is
    // over: nothing written yet.
    'start pending': async (ctx) => {
      await ctx.req('load', { file: 'box.nc' });
      const ticket = await ctx.machine('frame-prepare');
      const read = ctx.files.fingerprintOf;
      ctx.files.fingerprintOf = (name) => new Promise((resolve) => {
        ctx.release = () => resolve(read(name));
      });
      ctx.started = ctx.machine('frame', { nonce: ticket.nonce }).then(() => 'started', (err) => err.message);
    },
    'M5 sent, unanswered': async (ctx) => {
      await ctx.start();
    },
    'a side in flight (Jog)': async (ctx) => {
      await ctx.start();
      runTo(ctx, 4);
      jog(ctx);
    },
    // The side answered and seen twice at rest at its end, before the supervisor's next step.
    'between two lines': async (ctx) => {
      await ctx.start();
      runTo(ctx, 4);
      jog(ctx);
      ctx.c.at(60 + OFFSET.x, 20 + OFFSET.y, -5);
      ctx.ok();
      ctx.c.state.status.activeState = 'Idle';
      ctx.report();
      ctx.report();
    },
    // The stream of the device rotating (its grace): the side ended meanwhile, the next one waits.
    'stream rotating': async (ctx) => {
      await ctx.start();
      runTo(ctx, 4);
      ctx.service.closeTransport('tA', true);
      ctx.run();
    },
    // Stopped by Arrêter during a side: the framing is over, its 0x85 repeated while Jog is reported.
    cancelling: async (ctx) => {
      await ctx.start();
      runTo(ctx, 4);
      jog(ctx);
      await ctx.req('stop', {}, B);
    },
    // Ended by a banner while a side ran; the restarted board reports Jog (a $J received after it).
    'ended by a banner': async (ctx) => {
      await ctx.start();
      runTo(ctx, 4);
      jog(ctx);
      banner(ctx);
    }
  };
  const shiftZero = (ctx) => {
    ctx.proof += 1;
    ctx.c.state.status.wpos = { ...ctx.c.state.status.wpos, x: f3(Number(ctx.c.state.status.wpos.x) + 1) };
  };
  // Each event: what it does, whether it acts in its own step (sync), how long it takes otherwise
  // (wait, with reports unless silent).
  const EVENTS = {
    Arrêter: { act: (ctx) => ctx.req('stop', {}, B), sync: true },
    Pause: { act: (ctx) => ctx.req('pause', {}, B), sync: true },
    'relâchement (jog-stop)': { act: (ctx) => ctx.req('motion', { operation: 'jog-stop' }, B, 'tB'), sync: true },
    'Arrêter la broche': { act: (ctx) => ctx.req('spindleStop', {}, B), sync: true },
    'arrêt du PC': { act: (ctx) => ctx.service.socketStop('TEST'), sync: true },
    'annulation de jog du PC': { act: (ctx) => ctx.service.socketJogCancel('TEST'), sync: true },
    bannière: { act: banner, sync: true },
    alarme: {
      act: (ctx) => {
        ctx.c.runner.emit('alarm', { message: '2' });
        ctx.c.state.status.activeState = 'Alarm';
      },
      wait: 50
    },
    'flux fermé': { act: (ctx) => ctx.service.closeTransport('tA'), sync: true },
    'flux en rotation, non rouvert': { act: (ctx) => ctx.service.closeTransport('tA', true), wait: 3100 },
    'main perdue': { act: (ctx) => ctx.req('control', { operation: 'takeover', reason: 'At the machine' }, B), sync: true },
    // Merge with lot F4: the device of the framing gives the hand back (« Rendre la main »).
    'main rendue (F4)': { act: (ctx) => ctx.req('control', { operation: 'release' }, A), sync: true },
    'rapport de broche': {
      act: (ctx) => {
        ctx.c.state.status.spindle = 9000;
      },
      wait: 50
    },
    'rapport de zéro (WCO, preuve D2)': { act: shiftZero, wait: 50 },
    // The last report 2.6 s old at the supervisor's next step.
    'rapports périmés': {
      act: (ctx) => {
        ctx.now += 2600;
      },
      wait: 50,
      silent: true
    },
    // The line in flight past its limit: M5 10 s, a side of 50 mm at 600 mm/min 5 s + 10 s.
    'ligne hors délai': { act: () => {}, wait: 15200 },
    'service arrêté': {
      act: (ctx) => {
        services.splice(services.indexOf(ctx.service), 1);
        ctx.service.dispose();
      },
      sync: true
    }
  };
  const E = Object.keys(EVENTS);
  // The answers. 'refused': the start never happens, nothing written. '<code>' or 'reason:<why>':
  // the framing ends (in the event's own step when it is sync) with that code or reason, then 0x85
  // and nothing but 0x85, never a line. 'restart': ends, and not a byte after the banner, whatever
  // is reported. 'cancel': the stop asked by a person, not refused: at least one 0x85 and nothing
  // else. 'cancel only': no line; nothing but 0x85 (the cancel in progress, repeated while Jog is
  // reported). 'M5 only': Arrêter la broche's own M5, not refused, and not another byte (fourth
  // review: no cancel of the framing after its banner). 'nothing': not a byte. 'disposed': one 0x85
  // and nothing after. 'n/a': cannot happen in that state.
  const all = (answer) => Object.fromEntries(E.map((event) => [event, answer]));
  const RUNNING = {
    Arrêter: 'reason:stop',
    Pause: 'reason:pause',
    'relâchement (jog-stop)': 'reason:operator',
    'Arrêter la broche': 'reason:spindle',
    'arrêt du PC': 'reason:socket',
    'annulation de jog du PC': 'reason:socket',
    bannière: 'restart',
    alarme: 'ETOUCH_FRAME_ALARM',
    'flux fermé': 'ETOUCH_FRAME_STREAM',
    'flux en rotation, non rouvert': 'ETOUCH_FRAME_STREAM',
    'main perdue': 'ETOUCH_FRAME_CONTROL',
    'main rendue (F4)': 'ETOUCH_FRAME_CONTROL',
    'rapport de broche': 'ETOUCH_FRAME_STATE:spindle',
    'rapport de zéro (WCO, preuve D2)': 'ETOUCH_FRAME_STATE:offset',
    'rapports périmés': 'ETOUCH_FRAME_STALE',
    'ligne hors délai': 'ETOUCH_FRAME_TIMEOUT',
    'service arrêté': 'disposed'
  };
  const TABLE = {
    'start pending': { ...all('refused'), 'ligne hors délai': 'n/a' },
    'M5 sent, unanswered': RUNNING,
    'a side in flight (Jog)': RUNNING,
    'between two lines': { ...RUNNING, 'ligne hors délai': 'n/a' },
    'stream rotating': { ...RUNNING, 'flux fermé': 'n/a', 'ligne hors délai': 'n/a' },
    cancelling: {
      ...all('cancel only'),
      Arrêter: 'cancel',
      Pause: 'cancel',
      'relâchement (jog-stop)': 'cancel',
      'arrêt du PC': 'cancel',
      'annulation de jog du PC': 'cancel',
      bannière: 'nothing',
      'ligne hors délai': 'n/a',
      'service arrêté': 'disposed'
    },
    'ended by a banner': {
      ...all('nothing'),
      Arrêter: 'cancel',
      Pause: 'cancel',
      'relâchement (jog-stop)': 'cancel',
      'Arrêter la broche': 'M5 only',
      'ligne hors délai': 'n/a'
    }
  };
  const CELLS = Object.keys(STATES).flatMap((state) => E.map((event) => [state, event, TABLE[state][event]]))
    .filter(([, , answer]) => answer !== 'n/a');

  // Two events in a row: a cancel that takes over a framing's cancel or line stays the framing's.
  test('cancelling, Arrêter again (or a stop of a CNCjs client, or the jog stop), then the banner: not a byte after the banner (laser and CNC)', async () => {
    for (const kind of ['cnc', 'laser']) {
      for (const [name, again] of [
        ['Arrêter', (ctx) => ctx.req('stop', {}, B)],
        ['jog-stop', (ctx) => ctx.req('motion', { operation: 'jog-stop' }, B, 'tB')],
        ['Pause', (ctx) => ctx.req('pause', {}, B)]
      ]) {
        const label = [kind, name];
        const laser = { ...SETTINGS, $32: '1' };
        const ctx = kind === 'cnc' ? setup() : setup({ settings: laser, machines: [laserRecord(laser)] });
        if (kind === 'cnc') {
          await ctx.start();
          runTo(ctx, 4);
        } else {
          await ctx.start('frame.nc');
          runTo(ctx, 3);
        }
        jog(ctx);
        await ctx.req('stop', {}, B);
        ctx.tick(300);
        await again(ctx);
        ctx.tick(300);
        expect([label, ctx.state().motion.cancelling]).toEqual([label, true]);
        banner(ctx);
        const before = ctx.c.written.length;
        ctx.tick(3000);
        ctx.c.state.status.activeState = 'Idle';
        ctx.tick(61000);
        expect([label, ctx.c.written.slice(before)]).toEqual([label, []]);
      }
    }
  });

  test('ended by a banner, Arrêter (0x85 while Jog, a person asked it), then a second banner: not a byte after it', async () => {
    const ctx = setup();
    await ctx.start();
    runTo(ctx, 4);
    jog(ctx);
    banner(ctx);
    await ctx.req('stop', {}, B);
    ctx.tick(300);
    expect(ctx.c.written.at(-1)).toBe('\x85');
    banner(ctx);
    const before = ctx.c.written.length;
    ctx.tick(3000);
    expect(ctx.c.written.slice(before)).toEqual([]);
  });

  // A remark of the third review: the 200 ms between two 0x85 hold for the repeats on Jog reports;
  // a late ok of the $J cancelled sends its 0x85 at once (it may have been parsed after the first).
  test('cancelling: an ok of the $J arriving after the 0x85 sends one more at once; the repeats on Jog reports stay 200 ms apart', async () => {
    const ctx = setup();
    await ctx.start();
    runTo(ctx, 4);
    jog(ctx);
    const times = [];
    const watchWrites = (ms) => {
      for (let t = 0; t < ms; t += 50) {
        const before = ctx.c.written.length;
        ctx.tick(50);
        ctx.c.written.slice(before).forEach(() => times.push(ctx.now));
      }
    };
    const t0 = ctx.now;
    await ctx.req('stop', {}, B);
    times.push(ctx.now);
    ctx.ok();
    watchWrites(50);
    expect(times).toEqual([t0, t0 + 50]);
    watchWrites(2000);
    const gaps = times.slice(2).map((t, i) => t - times[i + 1]);
    expect(gaps.length).toBeGreaterThan(5);
    gaps.forEach((gap) => expect(gap).toBeGreaterThanOrEqual(200));
    expect(ctx.c.written.slice(-times.length).every((b) => b === '\x85')).toBe(true);
  });

  test('every cell of the table has one answer', () => {
    Object.keys(STATES).forEach((state) => {
      expect([state, Object.keys(TABLE[state]).sort()]).toEqual([state, E.slice().sort()]);
      E.forEach((event) => expect([state, event, typeof TABLE[state][event]]).toEqual([state, event, 'string']));
    });
  });

  test.each(CELLS)('%s × %s → %s', async (state, event, answer) => {
    const ctx = setup();
    await STATES[state](ctx);
    const count = ctx.lines().length;
    const before = ctx.c.written.length;
    const { act, sync, wait = 0, silent = false } = EVENTS[event];
    let refusal = null;
    try {
      await act(ctx);
    } catch (err) {
      refusal = err.message;
    }
    const disposed = event === 'service arrêté';
    const frameNow = () => (disposed ? null : ctx.state().motion.frame);
    if (sync && answer !== 'refused') {
      // In the event's own step: no framing any more.
      expect(frameNow()).toBeNull();
    }
    for (let t = 0; t < wait; t += 50) {
      ctx.now += 50;
      if (!silent) {
        // Lot C1: CNCjs's $G exchange goes on with the reports, every 500 ms.
        if (t % 500 === 450) {
          ctx.gc();
        }
        ctx.report();
      }
      jest.advanceTimersByTime(50);
    }
    if (ctx.release) {
      ctx.release();
    }
    const result = ctx.started ? await ctx.started : null;
    // Then a second of Jog reported, and a minute at rest.
    if (ctx.c.state.status.activeState !== 'Alarm') {
      ctx.c.state.status.activeState = 'Jog';
    }
    ctx.tick(1000);
    ctx.c.state.status.activeState = 'Idle';
    ctx.ok();
    ctx.tick(61000);
    const written = ctx.c.written.slice(before);
    // Arrêter la broche with no framing running (not started, or over) writes its own M5, as it
    // would without a framing (Grbl refuses it in Jog); never a framing line.
    const own = event === 'Arrêter la broche' && ['start pending', 'cancelling', 'ended by a banner'].includes(state);
    expect(ctx.lines().slice(count)).toEqual(own ? ['M5'] : []);
    expect(frameNow()).toBeNull();
    const after = written.filter((b) => !(own && b === 'M5\n'));
    if (answer === 'refused') {
      expect([result, after.filter((b) => b === '\x85')]).toEqual([expect.not.stringMatching(/^started$/), []]);
    } else if (answer === 'restart' || answer === 'nothing') {
      expect(after).toEqual([]);
      if (answer === 'restart') {
        expect(ctx.state().motion.lastFrame).toMatchObject({ result: 'cancelled', code: 'ETOUCH_FRAME_RESTART' });
      }
    } else if (answer === 'cancel') {
      expect([refusal, after.length > 0, after.filter((b) => b !== '\x85')]).toEqual([null, true, []]);
    } else if (answer === 'cancel only') {
      expect(after.filter((b) => b !== '\x85')).toEqual([]);
    } else if (answer === 'M5 only') {
      expect([refusal, written]).toEqual([null, ['M5\n']]);
    } else if (answer === 'disposed') {
      expect(after).toEqual(['\x85']);
    } else {
      expect([refusal, after[0], after.filter((b) => b !== '\x85')]).toEqual([null, '\x85', []]);
      const last = ctx.state().motion.lastFrame;
      if (answer.startsWith('reason:')) {
        expect(last).toMatchObject({ result: 'cancelled', reason: answer.slice(7), code: null });
      } else {
        const [code, cause] = answer.split(':');
        expect(last).toMatchObject({ code, ...(cause ? { params: { state: cause } } : {}) });
      }
    }
  });
});

// Merge of the lots (feat/fonctions-5): the CNC framing with « Rendre la main » (F4) and with the
// automatic reload of the page (F10).
describe('CNC framing with the other lots of the merge', () => {
  test('F4: giving the hand back during a framing ends it once, with its own code, and nothing leaves after it', async () => {
    const ctx = setup();
    await ctx.start();
    runTo(ctx, 4);
    await ctx.req('control', { operation: 'release' }, A);
    // The framing's own stop (C-12), then the release's stop of any other jog: one jog cancel only.
    expect(ctx.c.written.filter((w) => w === '\x85')).toHaveLength(1);
    expect(ctx.state().motion.lastFrame).toMatchObject({ result: 'cancelled', code: 'ETOUCH_FRAME_CONTROL' });
    expect(ctx.state().control.owner).toBeNull();
    expectNothingAfter(ctx, 4);
  });

  test('F4: the same with Jog reported (a side in flight): one jog cancel when the hand is given back', async () => {
    const ctx = setup();
    await ctx.start();
    runTo(ctx, 4);
    ctx.c.state.status.activeState = 'Jog';
    ctx.report();
    const before = ctx.c.written.length;
    await ctx.req('control', { operation: 'release' }, A);
    expect(ctx.c.written.slice(before)).toEqual(['\x85']);
    expect(ctx.state().motion.lastFrame).toMatchObject({ result: 'cancelled', code: 'ETOUCH_FRAME_CONTROL' });
  });

  test('F10: from the confirmation to the return, the page never sees the machine at rest', async () => {
    const ctx = setup();
    await ctx.req('load', { file: 'box.nc' });
    const ticket = await ctx.machine('frame-prepare');
    await ctx.machine('frame', { nonce: ticket.nonce });
    const seen = [];
    while (ctx.state().motion.frame) {
      // Between two lines the board reports Idle and the job is idle: only the framing says busy.
      const s = ctx.state();
      seen.push([s.activeState || s.state, pageSeesBusy(s)]);
      expect(pageSeesBusy(s)).toBe(true);
      ctx.run();
    }
    expect(seen.length).toBe(LINES.length);
    expect(ctx.state().motion.lastFrame).toMatchObject({ result: 'ended' });
    // Back at rest after the framing: the same rule lets the page reload.
    ctx.tick(200);
    expect(pageSeesBusy(ctx.state())).toBe(false);
  });
});
