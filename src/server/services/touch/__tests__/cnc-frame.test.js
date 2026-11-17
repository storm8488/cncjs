/* eslint-env jest */
/* eslint-disable no-await-in-loop */ // the cases of a table run one after the other on purpose
// CNC framing in the air (lot F1, examples/cncjs-touch/design/fonctions/F1-CONCEPTION.md § 10.1):
// the plan and its guards, the sequence (one line at a time, arrivals compared), its stops and its
// supervisor, the exclusions while it runs, and the laser framing left as it was. Fake controller
// only: nothing here touches a serial port.
import { EventEmitter } from 'events';
import { createService } from '../job-service';
import { createControl } from '../control';
import { fingerprint as sha256 } from '../program-identity';
import { cncFrameLinesValid, FRAME_MESSAGES } from '../motion';
import { signatureOf } from '../machine-profile';
import { expectCatalogMatch } from './touch-codes-catalog';
import { provenOffset } from './support/proven-offset';
import { offsetRefusal } from '../work-offset';

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
  return c;
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
  const ctx = { now: 10000, enabled, machines, history: [], c: fakeController(settings), programs: { ...PROGRAMS }, proof: 1, invalidated: [] };
  ctx.c.at(...at);
  ctx.controllers = { TEST: ctx.c };
  ctx.control = createControl({ now: () => ctx.now, elapsed: () => ctx.now });
  const config = {
    get: (key) => (key === 'touch.machines' ? ctx.machines : { 'touch.motion.enabled': ctx.enabled, events: [], macros: [] }[key])
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
  ctx.service = createService({ get: () => ctx.controllers }, config, () => ctx.now, { workOffset, control: ctx.control, history, files });
  services.push(ctx.service);
  ctx.generation = ctx.service.list()[0].generation;
  ctx.service.openTransport('tA', A);
  ctx.service.openTransport('tB', B);
  ctx.report = () => ctx.c.runner.emit('status');
  ctx.ok = () => ctx.c.runner.emit('ok');
  ctx.tick = (ms) => {
    for (let t = 0; t < ms; t += 50) {
      ctx.now += 50;
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
    ctx.c.state.status.spindle = undefined;
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
    ctx.c.runner.state.parserstate = { modal: { wcs: 'G54' } };
    ctx.c.runner.emit('parserstate', { modal: { wcs: 'G54' } });
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
      ctx.c.at(-100, -100, -60);
      ctx.report();
      ticket = await ctx.machine('frame-prepare');
      ctx.c.at(-100 + move[0], -100 + move[1], -60 + move[2]);
      ctx.report();
      const err = await refusalOf(ctx.machine('frame', { nonce: ticket.nonce }));
      expect(err.code).toBe('ETOUCH_LASER_FRAME_CHANGED');
      expectCatalogMatch(err);
    }
    expect(ctx.c.written).toEqual([]);
    // Single use.
    ctx.c.at(-100, -100, -60);
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
    expect(ctx.state()).toMatchObject({ canFrame: false, frameReason: expect.stringMatching(/Déplacement précédent non terminé/) });
  });
});

describe('laser framing stays as it was (non-regression of lot F1)', () => {
  test('a declared laser: the same lines byte for byte, no Z line, no $20 guard', async () => {
    const settings = { ...SETTINGS, $32: '1' };
    delete settings.$20;
    const ctx = setup({ settings, machines: [laserRecord(settings)] });
    ctx.c.at(-100, -100, -10);
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
