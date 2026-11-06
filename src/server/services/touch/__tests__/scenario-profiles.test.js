/* eslint-env jest */
// Lot D (independent validation) — cross-lot scenarios for the machine type
// (CNC / laser) and the server guards (examples/cncjs-touch/PROFILES-CONTRACT.md
// §2-§4). Fake controllers only: nothing here touches a serial port.
//
// Tests whose name starts with "BUG:" describe the safe behaviour the contract
// or the user's requirements call for and FAIL on the current code: they are
// kept on purpose (see lot D report), do not weaken them to make them pass.
import { EventEmitter } from 'events';
import { createService } from '../job-service';
import { createControl } from '../control';
import { fingerprint as sha256 } from '../program-identity';
import { signatureOf } from '../machine-profile';

const SETTINGS = {
  $10: '1',
$13: '0',
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
const signature = signatureOf(SETTINGS, '1.1h', '1.1h');
const record = (kind) => ({ id: 'm-0123456789ab', label: 'Atelier', kind, signature, createdAt: 'x', updatedAt: 'x' });

const fakeController = (port, settings) => {
  const c = {
    type: 'Grbl',
    options: { port },
    ready: true,
    isClose: () => false,
    runner: new EventEmitter(),
    sender: new EventEmitter(),
    workflow: Object.assign(new EventEmitter(), { state: 'idle' }),
    state: {
      status: {
        activeState: 'Idle',
        spindle: 0,
        mpos: { x: '-100.000', y: '-100.000', z: '-10.000' },
        wpos: { x: '5.000', y: '5.000', z: '2.000' }
      }
    },
    feeder: { toJSON: () => ({ queue: 0, pending: false }) },
    settings: { version: '1.1h', settings: { ...settings } },
    commands: [],
    written: []
  };
  c.runner.state = c.state;
  c.sender.state = { name: '', context: {}, total: 0 };
  c.sender.toJSON = () => ({ ...c.sender.state });
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
  // Laser: passes separated by rapids, constant Z.
  'passes.nc': ['G21 G90 G54 G94', 'G0 X0 Y0 Z2', 'M4 S800', 'G1 X10 F1200', 'G1 Y10', 'G0 X20 Y0', 'G1 X30', 'G0 X40 Y40', 'G1 X45', 'M5', 'M30'].join('\n'),
  // The same passes without an explicit G54 (the active WCS is then not needed by the travel check).
  'passes-frame.nc': ['G21 G90 G94', 'G0 X0 Y0 Z2', 'M4 S800', 'G1 X10 F1200', 'G1 Y10', 'G0 X20 Y0', 'G1 X30', 'G0 X40 Y40', 'G1 X45', 'M5', 'M30'].join('\n'),
  // CNC: retract, spindle, plunge.
  'cnc.nc': ['G21 G90 G94', 'M3 S9000', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F200', 'G1 X10 F800', 'G1 Y10', 'G1 X0', 'G0 Z5', 'M5', 'M30'].join('\n'),
  // Inches: the framing box must be in millimetres (G21 jogs).
  'inch.nc': ['G20 G90 G94', 'G0 X1 Y1', 'M3 S500', 'G1 X2 F40', 'G1 Y2', 'M5', 'M30'].join('\n'),
  // A whole laser job (no resume).
  'laser-job.nc': ['G21 G90 G94', 'M3 S1000', 'G0 X10 Y10', 'G1 X20 F1000', 'G0 X30 Y30', 'G1 X40', 'M5', 'M30'].join('\n'),
  // Library name with the touch upload suffix: the comment of the preamble uses the original name.
  'part--touch-20260101120000-0123456789abcdef.nc': ['G21 G90 G94', 'M3 S9000', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F200', 'G1 X10 F800', 'G1 Y10', 'G0 Z5', 'M5', 'M30'].join('\n')
};

const services = [];
afterEach(() => {
  services.splice(0).forEach((service) => service.dispose());
  jest.useRealTimers();
});

const setup = ({ machines = [], enabled = true, settings = SETTINGS } = {}) => {
  jest.useFakeTimers();
  const ctx = { now: 10000, enabled, machines, sets: [], history: [], c: fakeController('TEST', settings), programs: { ...PROGRAMS } };
  ctx.controllers = { TEST: ctx.c };
  ctx.control = createControl({ now: () => ctx.now, elapsed: () => ctx.now });
  const config = {
    get: (key) => (key === 'touch.machines' ? ctx.machines : { 'touch.motion.enabled': ctx.enabled, events: [], macros: [] }[key]),
    set: (key, value) => {
      ctx.sets.push([key, value]);
      if (key === 'touch.machines') {
        ctx.machines = value;
      }
    }
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
  ctx.service = createService({ get: () => ctx.controllers }, config, () => ctx.now, { control: ctx.control, history: { record: (e) => ctx.history.push(e) }, files });
  services.push(ctx.service);
  ctx.generation = ctx.service.list()[0].generation;
  ctx.service.openTransport('tA', A);
  ctx.service.openTransport('tB', B);
  ctx.report = () => ctx.c.runner.emit('status');
  ctx.tick = (ms) => {
    for (let t = 0; t < ms; t += 50) {
      ctx.now += 50;
      ctx.report();
      jest.advanceTimersByTime(50);
    }
  };
  ctx.settle = () => {
    ctx.c.runner.emit('ok');
    ctx.c.state.status.activeState = 'Idle';
    ctx.tick(150);
  };
  ctx.req = (action, extra = {}, actor = A, transportId = actor === B ? 'tB' : 'tA') => ctx.service.action({
    port: 'TEST', generation: ctx.generation, transportId, action, ...extra
  }, actor);
  ctx.machine = (operation, extra = {}, actor) => ctx.req('machine', { operation, ...extra }, actor);
  ctx.state = () => ctx.service.list()[0];
  ctx.profile = () => ctx.state().machineProfile;
  ctx.setting = (n, v) => {
    ctx.c.settings.settings['$' + n] = v;
    ctx.report();
  };
  ctx.report();
  // Homed (travel check validated for the framing).
  ctx.c.state.status.activeState = 'Home';
  ctx.report();
  ctx.c.state.status.activeState = 'Idle';
  ctx.report();
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

// Prepare + start of the loaded program; resolves with what happened.
const tryStart = async (ctx) => {
  try {
    const t = await ctx.req('prepare', { operation: 'start', revision: ctx.state().revision });
    await ctx.req('start', { nonce: t.nonce });
    return { started: true };
  } catch (err) {
    return { started: false, err };
  }
};
const startSent = (ctx) => ctx.c.commands.some(([n]) => n === 'gcode:start');
const sentProgram = (ctx) => {
  const load = ctx.c.commands.filter(([n]) => n === 'gcode:load').pop();
  return load ? load[2] : '';
};
const EMISSION = /(^|\s)(M3|M4)(\s|$)|S[1-9]/m;
const CNC_RESUME_MOVES = /^(G4 |G1 Z|G0 Z)/m;

describe('lot D: laser profile, every CNC action refused through the real job service', () => {
  test('spindle test, plate probe, CNC resume, M6 restart: refused with a code and nothing written to the board', async () => {
    const ctx = setup({ machines: [record('laser')], settings: { ...SETTINGS, $32: '1' } });
    expect(ctx.profile()).toMatchObject({ kind: 'laser', coherent: true });
    const caps = ctx.profile().capabilities;
    ['spindleTest', 'plateProbe', 'toolChange', 'resume'].forEach((n) => expect(caps[n].supported).toBe(false));
    expect((await refusalOf(ctx.req('prepare', { operation: 'spindle' }))).code).toBe('ETOUCH_LASER_NO_SPINDLE_TEST');
    expect((await refusalOf(ctx.req('prepare', { operation: 'zeroZ', thickness: 10, search: 20 }))).code).toBe('ETOUCH_LASER_NO_PLATE_PROBE');
    // A forged direct call without a ticket never reaches the controller either.
    await refusalOf(ctx.req('spindle', { nonce: 'forged' }));
    await refusalOf(ctx.req('zeroZ', { nonce: 'forged' }));
    // A CNC program resumed on a laser: never the CNC preamble (refused, or laser mode).
    const plan = await ctx.req('resumePlan', { file: 'cnc.nc', line: 6 }).catch((err) => err);
    if (plan instanceof Error) {
      expect(plan.code).toMatch(/^ETOUCH_LASER_RESUME_/);
    } else {
      expect(plan.mode).toBe('laser');
      expect(plan.preamble.join('\n')).not.toMatch(/^G4 |^G1 Z/m);
    }
    expect(ctx.c.written).toEqual([]);
    expect(ctx.c.commands.filter(([n]) => n === 'gcode')).toEqual([]);
  });
});

describe('lot D: $32=1 with a CNC profile', () => {
  test('incoherent; spindle test, plate probe and CNC resume refused; the board settings never written', async () => {
    const ctx = setup({ machines: [record('cnc')], settings: { ...SETTINGS, $32: '1' } });
    expect(ctx.profile()).toMatchObject({ kind: 'cnc', coherent: false, issues: [{ code: 'ETOUCH_MACHINE_LASER_MODE_ON' }] });
    expect((await refusalOf(ctx.req('prepare', { operation: 'spindle' }))).code).toBe('ETOUCH_MACHINE_LASER_MODE_ON');
    expect((await refusalOf(ctx.req('prepare', { operation: 'zeroZ', thickness: 10, search: 20 }))).code).toBe('ETOUCH_MACHINE_LASER_MODE_ON');
    expect((await refusalOf(ctx.req('resumePlan', { file: 'cnc.nc', line: 6 }))).code).toBe('ETOUCH_MACHINE_LASER_MODE_ON');
    expect((await refusalOf(ctx.req('load', { file: 'cnc.nc', fromLine: 6 }))).code).toBe('ETOUCH_MACHINE_LASER_MODE_ON');
    // set-kind never touches $30-$32 nor sends anything.
    await ctx.machine('set-kind', { kind: 'laser' });
    expect(ctx.c.commands).toEqual([]);
    expect(ctx.c.settings.settings).toEqual({ ...SETTINGS, $32: '1' });
    expect(ctx.profile()).toMatchObject({ kind: 'laser', coherent: true });
  });
});

describe('lot D: set-kind guards across the seams', () => {
  test('non-pilot, during a job, during a pause, during a framing, after connection loss, after a controller change', async () => {
    let ctx = setup();
    ctx.control.claim('TEST', B);
    expect((await refusalOf(ctx.machine('set-kind', { kind: 'laser' }, A))).code).toBe('ECONTROL');

    ctx = setup();
    await ctx.req('load', { file: 'cnc.nc' });
    expect((await tryStart(ctx)).started).toBe(true);
    ctx.report();
    expect((await refusalOf(ctx.machine('set-kind', { kind: 'laser' }))).code).toBe('ETOUCH_MACHINE_BUSY');
    ctx.c.workflow.state = 'paused';
    ctx.c.state.status.activeState = 'Hold:0';
    ctx.report();
    expect((await refusalOf(ctx.machine('set-kind', { kind: 'laser' }))).code).toBe('ETOUCH_MACHINE_BUSY');

    // During a framing (laser, $32=1): busy, the framing is not disturbed.
    ctx = setup({ machines: [record('laser')], settings: { ...SETTINGS, $32: '1' } });
    await ctx.req('load', { file: 'passes-frame.nc' });
    const ticket = await ctx.machine('frame-prepare');
    await ctx.machine('frame', { nonce: ticket.nonce });
    expect((await refusalOf(ctx.machine('set-kind', { kind: 'cnc' }))).code).toBe('ETOUCH_MACHINE_BUSY');
    expect(ctx.machines[0].kind).toBe('laser');

    // Connection lost.
    ctx = setup();
    ctx.c.isClose = () => true;
    // Refused before the machine action (the service's own "not available" conflict) or with a coded refusal.
    expect(await refusalOf(ctx.machine('set-kind', { kind: 'laser' }))).toBeInstanceOf(Error);
    expect(ctx.sets).toEqual([]);

    // Controller replaced on the same port: the old generation is refused.
    ctx = setup();
    ctx.controllers.TEST = fakeController('TEST', SETTINGS);
    ctx.controllers.TEST.runner.emit('status');
    ctx.service.list();
    expect((await refusalOf(ctx.machine('set-kind', { kind: 'laser' }))).code).toBe('ETOUCH_MACHINE_CONTROLLER_CHANGED');
    expect(ctx.sets).toEqual([]);
  });
});

describe('lot D: framing never emits and stays inside the program box', () => {
  test('M5 first, only $J=G90 G21 X Y F lines, inside the program extent, no Z, no M3/M4/S', async () => {
    const ctx = setup({ machines: [record('laser')], settings: { ...SETTINGS, $32: '1' } });
    await ctx.req('load', { file: 'passes-frame.nc' });
    const ticket = await ctx.machine('frame-prepare');
    const { lines, bounds } = ticket.frame;
    expect(lines[0]).toBe('M5');
    expect(bounds).toEqual({ xMin: 0, xMax: 45, yMin: 0, yMax: 40 });
    lines.slice(1).forEach((l) => {
      expect(l).toMatch(/^\$J=G90 G21 X-?[\d.]+ Y-?[\d.]+ F[\d.]+$/);
      const x = Number(/X(-?[\d.]+)/.exec(l)[1]);
      const y = Number(/Y(-?[\d.]+)/.exec(l)[1]);
      expect(x).toBeGreaterThanOrEqual(bounds.xMin);
      expect(x).toBeLessThanOrEqual(bounds.xMax);
      expect(y).toBeGreaterThanOrEqual(bounds.yMin);
      expect(y).toBeLessThanOrEqual(bounds.yMax);
    });
    expect(lines.join('\n')).not.toMatch(EMISSION);
    expect(lines.join('\n')).not.toMatch(/Z/);
  });

  test('$32=0 on a laser profile: framing still possible (it never emits) but the laser resume is refused', async () => {
    const ctx = setup({ machines: [record('laser')] });
    await ctx.req('load', { file: 'passes-frame.nc' });
    const ticket = await ctx.machine('frame-prepare');
    expect(ticket.frame.lines.join('\n')).not.toMatch(EMISSION);
    expect((await refusalOf(ctx.req('resumePlan', { file: 'passes.nc', line: 6 }))).code).toBe('ETOUCH_MACHINE_LASER_MODE_OFF');
  });

  test('an inch program is framed in millimetres (jogs are G21)', async () => {
    const ctx = setup({ machines: [record('laser')], settings: { ...SETTINGS, $32: '1' } });
    await ctx.req('load', { file: 'inch.nc' });
    const ticket = await ctx.machine('frame-prepare');
    expect(ticket.frame.bounds).toEqual({ xMin: 25.4, xMax: 50.8, yMin: 25.4, yMax: 50.8 });
  });
});

describe('lot D: resume preview equals what the load sends', () => {
  const check = async (ctx, file, line, kind) => {
    const plan = await ctx.req('resumePlan', { file, line });
    expect(plan.preview).toMatchObject({ version: 1, fromLine: line, kind, fingerprint: sha256(Buffer.from(ctx.programs[file])) });
    await ctx.req('load', { file, fromLine: line });
    const sent = sentProgram(ctx).split('\n');
    expect(sent.slice(0, plan.preview.preamble.length)).toEqual(plan.preview.preamble);
    // After the preamble: the file from fromLine (the first line may only gain its modal motion word).
    const original = ctx.programs[file].split('\n').filter((l) => l.trim());
    expect(sent[plan.preview.preamble.length]).toMatch(new RegExp(original[line - 1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'));
    expect(sent.slice(plan.preview.preamble.length + 1).filter((l) => l.trim())).toEqual(original.slice(line));
    return plan;
  };

  test('CNC (suffixed library name): identical preamble, original name in the comment', async () => {
    const ctx = setup();
    const plan = await check(ctx, 'part--touch-20260101120000-0123456789abcdef.nc', 6, 'cnc');
    expect(plan.preview.preamble[0]).toMatch(/de part\.nc\)$/);
  });

  test('laser: identical preamble, no dwell, no plunge, no CNC retract, M5 before any move, emission replayed last', async () => {
    const ctx = setup({ machines: [record('laser')], settings: { ...SETTINGS, $32: '1' } });
    const plan = await check(ctx, 'passes.nc', 6, 'laser');
    const pre = plan.preview.preamble;
    expect(pre.join('\n')).not.toMatch(/^G4 |^G1 /m);
    expect(pre.indexOf('M5')).toBe(1);
    const firstMove = pre.findIndex((l) => /^G0 /.test(l));
    expect(firstMove).toBeGreaterThan(pre.indexOf('M5'));
    // The only Z move is the program's own constant Z (2), never a retract above it.
    expect(pre.filter((l) => /Z/.test(l))).toEqual(['G0 Z2']);
    const emitting = pre.findIndex((l) => EMISSION.test(l));
    expect(emitting).toBe(pre.length - 1);
    expect(ctx.c.written).toEqual([]);
  });
});

describe('lot D: the profile and $32 at the moment the resumed program starts', () => {
  // The laser resume preamble ends with "M4 S800" and the next line is a G0
  // rapid: Grbl only keeps the beam off during that rapid in laser mode
  // ($32=1). $32 is checked at resumePlan and load, not at start.
  test('BUG: a laser resume loaded with $32=1 must not start once the board reports $32=0', async () => {
    const ctx = setup({ machines: [record('laser')], settings: { ...SETTINGS, $32: '1' } });
    await ctx.req('load', { file: 'passes.nc', fromLine: 6 });
    expect(sentProgram(ctx)).toMatch(/M4 S800\nG0 X20 Y0/);
    ctx.setting(32, '0');
    expect(ctx.profile().coherent).toBe(false);
    const res = await tryStart(ctx);
    expect(res.started).toBe(false);
    expect(startSent(ctx)).toBe(false);
  });

  // The CNC preamble (retract, M3 S9000, G4 spin-up, G1 Z plunge) loaded while
  // the machine was CNC, then the machine declared laser at rest (allowed
  // with a loaded, not started job): starting it runs the CNC preamble on a laser.
  test('BUG: a CNC resume loaded before the machine was declared laser must not start', async () => {
    const ctx = setup({ machines: [record('cnc')] });
    await ctx.req('load', { file: 'cnc.nc', fromLine: 6 });
    expect(sentProgram(ctx)).toMatch(CNC_RESUME_MOVES);
    ctx.setting(32, '1');
    await ctx.machine('set-kind', { kind: 'laser' });
    expect(ctx.profile()).toMatchObject({ kind: 'laser', coherent: true });
    const res = await tryStart(ctx);
    expect(res.started).toBe(false);
    expect(startSent(ctx)).toBe(false);
  });

  test('BUG: a CNC resume loaded with $32=0 must not start once the board reports $32=1', async () => {
    const ctx = setup({ machines: [record('cnc')] });
    await ctx.req('load', { file: 'cnc.nc', fromLine: 6 });
    ctx.setting(32, '1');
    expect(ctx.profile()).toMatchObject({ coherent: false, issues: [{ code: 'ETOUCH_MACHINE_LASER_MODE_ON' }] });
    const res = await tryStart(ctx);
    expect(res.started).toBe(false);
    expect(startSent(ctx)).toBe(false);
  });

  // Contract gap (§2 lists only the laser resume): a whole laser job on a
  // laser profile with $32=0 fires during every G0 between objects.
  test('GAP: a laser job must not start on a laser profile whose board reports $32=0', async () => {
    const ctx = setup({ machines: [record('laser')] });
    expect(ctx.profile()).toMatchObject({ coherent: false, issues: [{ code: 'ETOUCH_MACHINE_LASER_MODE_OFF' }] });
    await ctx.req('load', { file: 'laser-job.nc' });
    const res = await tryStart(ctx);
    expect(res.started).toBe(false);
    expect(startSent(ctx)).toBe(false);
  });

  test('control: a CNC job on an unassociated board with $32=0 starts exactly as before', async () => {
    const ctx = setup();
    await ctx.req('load', { file: 'cnc.nc' });
    expect((await tryStart(ctx)).started).toBe(true);
    expect(startSent(ctx)).toBe(true);
  });
});
