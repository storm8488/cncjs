/* eslint-env jest */
/* eslint-disable no-await-in-loop */ // the framing cases run one after the other on purpose
// Machine type (CNC / laser) bound to the board's identity, laser framing,
// laser resume and the capability enforcement of the job service
// (examples/cncjs-touch/PROFILES-CONTRACT.md §2-§4). Fake controllers only:
// nothing here touches a serial port.
import { EventEmitter } from 'events';
import { createService } from '../job-service';
import { createControl } from '../control';
import { buildResume } from '../resume';
import { programCheck } from '../program-check';
import { fingerprint as sha256 } from '../program-identity';
import {
  signatureOf, settingsRead, matchMachine, describeProfile, firmwareFamily, createProfiles, MECHANICS
} from '../machine-profile';
import { catalogCodes, expectCatalogMatch } from './touch-codes-catalog';

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

const fakeController = (port = 'TEST', settings = SETTINGS) => {
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
  'frame.nc': ['G21 G90', 'G0 X10 Y20', 'M4 S300', 'G1 X60 F1500', 'G1 Y50', 'G1 X10', 'G1 Y20', 'M5', 'M30'].join('\n'),
  'passes.nc': ['G21 G90 G54', 'G0 X0 Y0 Z2', 'M3 S800', 'G1 X10 F1200', 'G1 Y10', 'G0 X20 Y0', 'G1 X30', 'G0 X40 Y40', 'M5', 'M30'].join('\n'),
  'cnc.nc': ['G21 G90', 'M3 S9000', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F200', 'G1 X10 F800', 'G1 Y10', 'G1 X0', 'G0 Z5', 'M5', 'M30'].join('\n'),
  'g55.nc': ['G21 G90 G55', 'G0 X10 Y20', 'G1 X60 F1500', 'M30'].join('\n'),
  'idle-y.nc': ['G21 G90', 'G0 X10', 'G1 X60 F1500', 'M30'].join('\n')
};

const services = [];
afterEach(() => {
  services.splice(0).forEach((service) => service.dispose());
  jest.useRealTimers();
});

const family = 'grbl-1.1';
const signature = signatureOf(SETTINGS, '1.1h', '1.1h');
const record = (kind, extra = {}) => ({ id: 'm-0123456789ab', label: 'Atelier', kind, signature, createdAt: 'x', updatedAt: 'x', ...extra });

const setup = ({ machines = [], enabled = true, homed = true, settings = SETTINGS, store = true } = {}) => {
  jest.useFakeTimers();
  const ctx = { now: 10000, enabled, machines, sets: [], history: [], c: fakeController('TEST', settings), programs: { ...PROGRAMS } };
  ctx.controllers = { TEST: ctx.c };
  ctx.control = createControl({ now: () => ctx.now, elapsed: () => ctx.now });
  const config = {
    get: (key) => (key === 'touch.machines' ? ctx.machines : { 'touch.motion.enabled': ctx.enabled, events: [], macros: [] }[key])
  };
  if (store) {
    config.set = (key, value) => {
      ctx.sets.push([key, value]);
      if (key === 'touch.machines') {
        ctx.machines = value;
      }
    };
  }
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
  const history = { record: (event) => ctx.history.push(event) };
  ctx.service = createService({ get: () => ctx.controllers }, config, () => ctx.now, { control: ctx.control, history, files });
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
  ctx.settle = () => {
    ctx.ok();
    ctx.c.state.status.activeState = 'Idle';
    ctx.tick(150);
  };
  ctx.req = (action, extra = {}, actor = A, transportId = actor === B ? 'tB' : 'tA') => ctx.service.action({
    port: 'TEST', generation: ctx.generation, transportId, action, ...extra
  }, actor);
  ctx.machine = (operation, extra = {}, actor) => ctx.req('machine', { operation, ...extra }, actor);
  ctx.state = () => ctx.service.list()[0];
  ctx.profile = () => ctx.state().machineProfile;
  ctx.report();
  if (homed) {
    ctx.c.state.status.activeState = 'Home';
    ctx.report();
    ctx.c.state.status.activeState = 'Idle';
    ctx.report();
  }
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

const NO_EMISSION = /(^|\s)(M3|M4)(\s|$)|S[1-9]/;

describe('machine identity (§2)', () => {
  test('the signature covers the firmware family and the mechanics, not $30-$32 nor the port', () => {
    expect(signature).toMatch(/^[0-9a-f]{16}$/);
    expect(firmwareFamily('Grbl 1.1h', '')).toBe(family);
    expect(firmwareFamily('Grbl 1.3a', '')).toBe('grbl-1.3');
    expect(signatureOf({ ...SETTINGS, $30: '24000', $31: '100', $32: '1' }, 'Grbl 1.1f', '')).toBe(signature);
    // Numbers and their text are the same setting.
    expect(signatureOf({ ...SETTINGS, $100: 80 }, '1.1h', '1.1h')).toBe(signature);
    MECHANICS.forEach((n) => {
      expect(signatureOf({ ...SETTINGS, ['$' + n]: '7777' }, '1.1h', '1.1h')).not.toBe(signature);
    });
    expect(signatureOf(SETTINGS, 'Grbl 1.3a', '')).not.toBe(signature);
    // $$ not read (or still being received), or no version: no signature.
    const partial = { ...SETTINGS };
    delete partial.$132;
    expect(settingsRead(partial)).toBe(false);
    expect(signatureOf(partial, '1.1h', '1.1h')).toBeNull();
    expect(signatureOf({}, '1.1h', '1.1h')).toBeNull();
    expect(signatureOf(SETTINGS, '', '')).toBeNull();
  });

  test('matching: signature, none, ambiguous, unknown; invalid records are ignored', () => {
    expect(matchMachine([record('laser')], signature)).toMatchObject({ match: 'signature', record: { kind: 'laser' } });
    expect(matchMachine([record('laser', { signature: 'ffffffffffffffff' })], signature)).toMatchObject({ match: 'none', record: null });
    expect(matchMachine([record('laser'), record('cnc', { id: 'm-ba9876543210' })], signature)).toMatchObject({ match: 'ambiguous', count: 2 });
    expect(matchMachine([record('laser')], null).match).toBe('unknown');
    expect(matchMachine([{ ...record('laser'), kind: 'plasma' }, { enabled: true }, null, 'x'], signature).match).toBe('none');
  });

  test('describeProfile: the contract shape, coherence with $32 and capabilities', () => {
    const p = describeProfile({ settings: SETTINGS, firmware: '1.1h', version: '1.1h', port: '/dev/ttyUSB0', records: [], frameEnabled: true });
    expect(Object.keys(p)).toEqual(['version', 'id', 'label', 'kind', 'match', 'signature', 'portHint', 'laser', 'coherent', 'issues', 'capabilities']);
    expect(p).toMatchObject({ version: 1, id: null, label: '', kind: null, match: 'none', signature, portHint: '/dev/ttyUSB0', laser: { mode: 0, sMax: 1000, sMin: 0 }, coherent: true, issues: [] });
    expect(Object.keys(p.capabilities)).toEqual(['spindleTest', 'plateProbe', 'toolChange', 'resume', 'laserResume', 'laserFrame', 'focus']);
    ['spindleTest', 'plateProbe', 'toolChange', 'resume'].forEach((n) => expect(p.capabilities[n]).toEqual({ supported: true, reason: '', code: '' }));
    ['laserResume', 'laserFrame', 'focus'].forEach((n) => expect(p.capabilities[n]).toMatchObject({ supported: false, code: 'ETOUCH_LASER_NOT_LASER' }));

    const on = describeProfile({ settings: { ...SETTINGS, $32: '1' }, firmware: '1.1h', records: [record('cnc')], frameEnabled: true });
    expect(on).toMatchObject({ kind: 'cnc', match: 'signature', coherent: false, issues: [{ code: 'ETOUCH_MACHINE_LASER_MODE_ON', params: {} }] });
    ['spindleTest', 'plateProbe', 'toolChange', 'resume'].forEach((n) => expect(on.capabilities[n]).toMatchObject({ supported: false, code: 'ETOUCH_MACHINE_LASER_MODE_ON' }));

    const laser = describeProfile({ settings: { ...SETTINGS, $32: '1' }, firmware: '1.1h', records: [record('laser')], frameEnabled: true });
    expect(laser).toMatchObject({ kind: 'laser', id: 'm-0123456789ab', label: 'Atelier', coherent: true, issues: [], laser: { mode: 1 } });
    expect(laser.capabilities).toMatchObject({
      spindleTest: { supported: false, code: 'ETOUCH_LASER_NO_SPINDLE_TEST' },
      plateProbe: { supported: false, code: 'ETOUCH_LASER_NO_PLATE_PROBE' },
      toolChange: { supported: false, code: 'ETOUCH_LASER_NO_TOOL_CHANGE' },
      resume: { supported: false, code: 'ETOUCH_LASER_NO_CNC_RESUME' },
      laserResume: { supported: true },
      laserFrame: { supported: true },
      focus: { supported: true }
    });
    // A laser with $32=0 (or unknown): no laser resume, framing stays possible.
    const off = describeProfile({ settings: SETTINGS, firmware: '1.1h', records: [record('laser')], frameEnabled: true });
    expect(off).toMatchObject({ coherent: false, issues: [{ code: 'ETOUCH_MACHINE_LASER_MODE_OFF' }] });
    expect(off.capabilities.laserResume).toMatchObject({ supported: false, code: 'ETOUCH_MACHINE_LASER_MODE_OFF' });
    expect(off.capabilities.laserFrame.supported).toBe(true);
    const unknownMode = { ...SETTINGS };
    delete unknownMode.$32;
    expect(describeProfile({ settings: unknownMode, firmware: '1.1h', records: [record('laser')] }).laser.mode).toBeNull();
    // Framing needs the real moves enabled.
    expect(describeProfile({ settings: { ...SETTINGS, $32: '1' }, firmware: '1.1h', records: [record('laser')], frameEnabled: false }).capabilities.laserFrame)
      .toMatchObject({ supported: false, code: 'ETOUCH_LASER_FRAME_DISABLED' });
    // Ambiguous: not associated, said so.
    const twice = describeProfile({ settings: SETTINGS, firmware: '1.1h', records: [record('laser'), record('cnc', { id: 'm-ba9876543210' })] });
    expect(twice).toMatchObject({ kind: null, id: null, match: 'ambiguous', coherent: true, issues: [{ code: 'ETOUCH_MACHINE_AMBIGUOUS', params: { count: 2 } }] });
  });

  test('every capability reason and issue has a catalog row whose French template is the message', () => {
    const p = describeProfile({ settings: { ...SETTINGS, $32: '1' }, firmware: '1.1h', records: [record('laser')], frameEnabled: false });
    const q = describeProfile({ settings: { ...SETTINGS, $32: '1' }, firmware: '1.1h', records: [] });
    [p, q].forEach((profile) => Object.values(profile.capabilities).filter((cap) => !cap.supported).forEach((cap) => {
      expectCatalogMatch({ code: cap.code, params: {}, message: cap.reason });
    }));
    expect(catalogCodes()).toEqual(expect.arrayContaining(['ETOUCH_MACHINE_LASER_MODE_OFF', 'ETOUCH_MACHINE_AMBIGUOUS']));
  });

  test('profiles store: create, update keeps the id, forget; invalid entries are kept; no store, no write', () => {
    let machines = [{ junk: true }];
    const config = { get: () => machines,
set: (key, value) => {
 machines = value;
} };
    const profiles = createProfiles({ config, now: () => 'T', randomId: () => 'abcdefabcdef' });
    const first = profiles.setKind({ signature, kind: 'laser', label: '  Laser\u0007 atelier  ' });
    expect(first.record).toEqual({ id: 'm-abcdefabcdef', label: 'Laser atelier', kind: 'laser', signature, createdAt: 'T', updatedAt: 'T' });
    expect(first.previous).toBeNull();
    const second = profiles.setKind({ signature, kind: 'cnc', label: '' });
    expect(second.record).toMatchObject({ id: 'm-abcdefabcdef', kind: 'cnc', label: 'Laser atelier' });
    expect(second.previous).toEqual({ kind: 'laser', label: 'Laser atelier' });
    expect(machines).toHaveLength(2);
    expect(machines[0]).toEqual({ junk: true });
    expect(profiles.revision()).toBe(2);
    expect(profiles.forget({ signature })).toHaveLength(1);
    expect(machines).toEqual([{ junk: true }]);
    expect(() => profiles.forget({ signature })).toThrow(expect.objectContaining({ code: 'ETOUCH_MACHINE_NOT_ASSOCIATED' }));
    const readOnly = createProfiles({ config: { get: () => [] } });
    expect(() => readOnly.setKind({ signature, kind: 'cnc' })).toThrow(expect.objectContaining({ code: 'ETOUCH_MACHINE_STORE' }));
  });
});

describe('machine type actions (§2)', () => {
  test('an unassociated CNC with $32=0 keeps the existing behaviour and may be declared', () => {
    const ctx = setup();
    const p = ctx.profile();
    expect(p).toMatchObject({ kind: null, match: 'none', signature, portHint: 'TEST', coherent: true, canChange: true, changeReason: '' });
    expect(Object.keys(p)).toEqual(['version', 'id', 'label', 'kind', 'match', 'signature', 'portHint', 'laser', 'coherent', 'issues', 'canChange', 'changeReason', 'capabilities']);
    expect(ctx.state().canSpindleTest).toBe(true);
    expect(ctx.state().zeroZReason).not.toMatch(/laser|\$32/);
    expect(ctx.state().programCheck).toBeNull();
  });

  test('set-kind writes .cncrc only, records the history and never talks to the controller', async () => {
    const ctx = setup();
    const res = await ctx.machine('set-kind', { kind: 'laser', label: 'Laser atelier' });
    expect(res.message).toBe('Type de machine enregistré : laser. Aucune commande envoyée à la carte.');
    expect(res.machine).toMatchObject({ id: expect.stringMatching(/^m-[0-9a-f]{12}$/), kind: 'laser', label: 'Laser atelier' });
    expect(ctx.sets).toHaveLength(1);
    expect(ctx.sets[0][0]).toBe('touch.machines');
    expect(ctx.machines).toEqual([{ id: res.machine.id, label: 'Laser atelier', kind: 'laser', signature, createdAt: expect.any(String), updatedAt: expect.any(String) }]);
    expect(ctx.c.commands).toEqual([]);
    expect(ctx.c.written).toEqual([]);
    expect(ctx.history.filter((e) => e.event === 'machine')).toEqual([expect.objectContaining({
      operation: 'set-kind', machine: { id: res.machine.id, label: 'Laser atelier', kind: 'laser', signature }, previous: null, actor: A
    })]);
    expect(ctx.profile()).toMatchObject({ kind: 'laser', match: 'signature', id: res.machine.id, coherent: false, issues: [{ code: 'ETOUCH_MACHINE_LASER_MODE_OFF' }] });
    // The touch client claimed the free port with it (pilot from now on).
    expect(ctx.state().control.owner).toMatchObject({ id: 'tablet-A' });
    // Back to CNC: same record, history keeps the previous kind; then forget.
    await ctx.machine('set-kind', { kind: 'cnc' });
    expect(ctx.machines).toHaveLength(1);
    expect(ctx.machines[0]).toMatchObject({ id: res.machine.id, kind: 'cnc', label: 'Laser atelier' });
    expect(ctx.history.filter((e) => e.event === 'machine')[1].previous).toEqual({ kind: 'laser', label: 'Laser atelier' });
    const forgot = await ctx.machine('forget');
    expect(forgot.message).toBe('Fiche machine oubliée. Aucune commande envoyée à la carte.');
    expect(ctx.machines).toEqual([]);
    expect(ctx.history.filter((e) => e.event === 'machine')[2]).toMatchObject({ operation: 'forget', removed: [{ id: res.machine.id, kind: 'cnc' }] });
    expect(ctx.profile()).toMatchObject({ kind: null, match: 'none' });
    expect(ctx.c.commands).toEqual([]);
    expect(ctx.c.settings.settings).toEqual(SETTINGS);
  });

  test('the identity follows the board, not the port', () => {
    const ctx = setup({ machines: [record('laser')] });
    expect(ctx.profile()).toMatchObject({ kind: 'laser', portHint: 'TEST' });
    const other = fakeController('/dev/ttyACM1');
    ctx.controllers['/dev/ttyACM1'] = other;
    other.runner.emit('status');
    const listed = ctx.service.list().find((s) => s.port === '/dev/ttyACM1');
    expect(listed.machineProfile).toMatchObject({ kind: 'laser', id: 'm-0123456789ab', portHint: '/dev/ttyACM1' });
  });

  test('refusals: non-pilot, busy, not idle, $$ unknown, stale, connection lost, controller change, invalid kind, ambiguous, nothing to forget, no store', async () => {
    const codeOf = async (ctx, op, extra, actor) => (await refusalOf(ctx.machine(op, extra, actor))).code;
    let ctx = setup();
    ctx.control.claim('TEST', B);
    expect(await codeOf(ctx, 'set-kind', { kind: 'laser' }, A)).toBe('ECONTROL');
    expect(await codeOf(ctx, 'forget', {}, A)).toBe('ECONTROL');

    ctx = setup();
    ctx.c.workflow.state = 'running';
    ctx.report();
    expect(await codeOf(ctx, 'set-kind', { kind: 'laser' })).toBe('ETOUCH_MACHINE_BUSY');
    expect(ctx.profile()).toMatchObject({ canChange: false, changeReason: expect.stringMatching(/seulement au repos/) });
    ctx.c.workflow.state = 'paused';
    expect(await codeOf(ctx, 'set-kind', { kind: 'laser' })).toBe('ETOUCH_MACHINE_BUSY');
    ctx.c.workflow.state = 'idle';
    ctx.c.feeder.toJSON = () => ({ queue: 1, pending: false });
    expect(await codeOf(ctx, 'set-kind', { kind: 'laser' })).toBe('ETOUCH_MACHINE_BUSY');
    ctx.c.feeder.toJSON = () => ({ queue: 0, pending: false });
    ctx.c.state.status.activeState = 'Alarm';
    ctx.report();
    const alarm = await refusalOf(ctx.machine('set-kind', { kind: 'laser' }));
    expect(alarm).toMatchObject({ code: 'ETOUCH_MACHINE_NOT_IDLE', params: { state: 'Alarm' }, status: 409 });
    expectCatalogMatch(alarm);
    ctx.c.state.status.activeState = 'Idle';
    ctx.report();
    // A homing in progress (our $H) is busy too.
    await ctx.req('prepare', { operation: 'home' }).then((t) => ctx.req('home', { nonce: t.nonce }));
    expect(await codeOf(ctx, 'set-kind', { kind: 'laser' })).toBe('ETOUCH_MACHINE_BUSY');

    ctx = setup();
    delete ctx.c.settings.settings.$132;
    ctx.report();
    const unknown = await refusalOf(ctx.machine('set-kind', { kind: 'laser' }));
    expect(unknown.code).toBe('ETOUCH_MACHINE_SETTINGS_UNKNOWN');
    expectCatalogMatch(unknown);
    expect(ctx.profile()).toMatchObject({ match: 'unknown', signature: null, canChange: false });

    ctx = setup();
    ctx.now += 3000;
    expect(await codeOf(ctx, 'set-kind', { kind: 'laser' })).toBe('ETOUCH_MACHINE_STALE');
    ctx.report();
    ctx.c.ready = false;
    expect(await codeOf(ctx, 'set-kind', { kind: 'laser' })).toBe('ETOUCH_MACHINE_CONNECTION');
    ctx.c.ready = true;
    expect(await codeOf(ctx, 'set-kind', { kind: 'plasma' })).toBe('ETOUCH_MACHINE_KIND_INVALID');
    expect(await codeOf(ctx, 'forget', {})).toBe('ETOUCH_MACHINE_NOT_ASSOCIATED');
    expect(await codeOf(ctx, 'rename', {})).toBe('ETOUCH_MACHINE_OPERATION');
    expect((await refusalOf(ctx.req('machine', { operation: 'set-kind', kind: 'laser', generation: 'old' }))).code).toBe('ETOUCH_MACHINE_CONTROLLER_CHANGED');
    // Another controller object on the same port: the old generation is refused.
    ctx.controllers.TEST = fakeController();
    ctx.controllers.TEST.runner.emit('status');
    ctx.service.list();
    expect(await codeOf(ctx, 'set-kind', { kind: 'laser' })).toBe('ETOUCH_MACHINE_CONTROLLER_CHANGED');
    expect(ctx.sets).toEqual([]);

    ctx = setup({ machines: [record('laser'), record('cnc', { id: 'm-ba9876543210' })] });
    const twice = await refusalOf(ctx.machine('set-kind', { kind: 'laser' }));
    expect(twice).toMatchObject({ code: 'ETOUCH_MACHINE_AMBIGUOUS', params: { count: 2 } });
    expect(ctx.profile()).toMatchObject({ match: 'ambiguous', canChange: false });
    // Forget clears both, then the type can be declared again.
    await ctx.machine('forget');
    expect(ctx.machines).toEqual([]);
    expect(ctx.profile().canChange).toBe(true);

    ctx = setup({ store: false });
    expect(await codeOf(ctx, 'set-kind', { kind: 'laser' })).toBe('ETOUCH_MACHINE_STORE');
    expect(ctx.history.filter((e) => e.event === 'machine')).toEqual([]);
  });
});

describe('capability enforcement on the server (§3)', () => {
  const loadAndPause = async (ctx, file = 'cnc.nc') => {
    ctx.c.state.parserstate = { modal: { spindle: 'M3', wcs: 'G54' }, spindle: 9000 };
    await ctx.req('load', { file });
    const t = await ctx.req('prepare', { operation: 'start', revision: ctx.state().revision });
    await ctx.req('start', { nonce: t.nonce });
    ctx.c.workflow.state = 'paused';
    ctx.c.sender.state.holdReason = { data: 'M6', msg: 'T2 M6' };
    ctx.c.runner.emit('parserstate', { modal: { wcs: 'G54' } });
    ctx.report();
  };

  test('laser profile: spindle test, plate probe, tool change restart and CNC resume are refused with a code', async () => {
    const ctx = setup({ machines: [record('laser')], settings: { ...SETTINGS, $32: '1' } });
    const state = ctx.state();
    expect(state.canSpindleTest).toBe(false);
    expect(state.spindleReason).toMatch(/pas de test de broche/);
    expect(state.canZeroZ).toBe(false);
    const spindle = await refusalOf(ctx.req('prepare', { operation: 'spindle' }));
    expect(spindle.code).toBe('ETOUCH_LASER_NO_SPINDLE_TEST');
    expectCatalogMatch(spindle);
    const probe = await refusalOf(ctx.req('prepare', { operation: 'zeroZ', thickness: 10, search: 20 }));
    expect(probe.code).toBe('ETOUCH_LASER_NO_PLATE_PROBE');
    expectCatalogMatch(probe);
    // Resume from a line is the laser mode, never the CNC preamble.
    const plan = await ctx.req('resumePlan', { file: 'passes.nc', line: 6 });
    expect(plan.mode).toBe('laser');
    expect(plan.preamble.join('\n')).not.toMatch(/G4|G1 Z/);
    // A program paused on M6: no tool change on a laser.
    await loadAndPause(ctx);
    const m6 = await refusalOf(ctx.req('prepare', { operation: 'resume', revision: ctx.state().revision }));
    expect(m6.code).toBe('ETOUCH_LASER_NO_TOOL_CHANGE');
    expectCatalogMatch(m6);
    expect(ctx.c.commands.filter(([n]) => n === 'gcode')).toEqual([]);
  });

  test('$32=1 without a laser profile: incoherent, the spindle-turning CNC operations are refused', async () => {
    const ctx = setup({ settings: { ...SETTINGS, $32: '1' } });
    expect(ctx.profile()).toMatchObject({ kind: null, coherent: false, issues: [{ code: 'ETOUCH_MACHINE_LASER_MODE_ON', params: {} }] });
    const codes = await Promise.all([
      refusalOf(ctx.req('prepare', { operation: 'spindle' })),
      refusalOf(ctx.req('prepare', { operation: 'zeroZ', thickness: 10, search: 20 })),
      refusalOf(ctx.req('resumePlan', { file: 'cnc.nc', line: 7 })),
      refusalOf(ctx.req('load', { file: 'cnc.nc', fromLine: 7 }))
    ]);
    codes.forEach((err) => expect(err.code).toBe('ETOUCH_MACHINE_LASER_MODE_ON'));
    expectCatalogMatch(codes[0]);
    expect(ctx.state().spindleReason).toMatch(/\$32=1/);
    // Tool change with a spindle to restart: refused too.
    await loadAndPause(ctx);
    expect(ctx.state().programPause.restartSpindle).toEqual({ mode: 'M3', speed: 9000 });
    expect((await refusalOf(ctx.req('prepare', { operation: 'resume', revision: ctx.state().revision }))).code).toBe('ETOUCH_MACHINE_LASER_MODE_ON');
    expect(ctx.c.commands.filter(([n]) => n === 'gcode')).toEqual([]);
  });

  test('$32=0 CNC: the tool change restart and the CNC resume work as before', async () => {
    const ctx = setup({ machines: [record('cnc')] });
    const plan = await ctx.req('resumePlan', { file: 'cnc.nc', line: 7 });
    expect(plan.mode).toBe('cnc');
    expect(plan.preamble).toContain('M3 S9000');
    await loadAndPause(ctx);
    const t = await ctx.req('prepare', { operation: 'resume', revision: ctx.state().revision });
    expect(t.operation).toBe('resume');
  });

  test('a laser profile with $32=0 refuses the laser resume', async () => {
    const ctx = setup({ machines: [record('laser')] });
    const err = await refusalOf(ctx.req('resumePlan', { file: 'passes.nc', line: 6 }));
    expect(err.code).toBe('ETOUCH_MACHINE_LASER_MODE_OFF');
    expectCatalogMatch(err);
    expect((await refusalOf(ctx.req('load', { file: 'passes.nc', fromLine: 6 }))).code).toBe('ETOUCH_MACHINE_LASER_MODE_OFF');
  });
});

describe('start re-checks the profile and $32', () => {
  test('a laser profile with $32 other than 1 starts nothing; a resume starts only in the mode it was built for', async () => {
    let ctx = setup({ machines: [record('laser')] });
    await ctx.req('load', { file: 'frame.nc' });
    expect(ctx.state().startReason).toBe(ctx.state().machineProfile.capabilities.laserResume.reason);
    let err = await refusalOf(ctx.req('prepare', { operation: 'start', revision: ctx.state().revision }));
    expect(err.code).toBe('ETOUCH_MACHINE_LASER_MODE_OFF');
    ctx = setup({ machines: [record('cnc')] });
    await ctx.req('load', { file: 'cnc.nc', fromLine: 7 });
    ctx.c.settings.settings.$32 = '1';
    await ctx.machine('set-kind', { kind: 'laser' });
    err = await refusalOf(ctx.req('prepare', { operation: 'start', revision: ctx.state().revision }));
    expect(err).toMatchObject({ code: 'ETOUCH_MACHINE_RESUME_MODE_CHANGED', params: { loaded: 'CNC', now: 'laser' } });
    expectCatalogMatch(err);
    expect(ctx.state().canStart).toBe(false);
    expect(ctx.c.commands.filter(([n]) => n === 'gcode:start')).toEqual([]);
  });
});

describe('resume preview (§4), both kinds', () => {
  const sentPreamble = (ctx) => {
    const load = ctx.c.commands.filter(([n]) => n === 'gcode:load').pop();
    return load[2].split('\n');
  };

  test('CNC: the preview is exactly the preamble the load sends before line fromLine', async () => {
    const ctx = setup();
    const plan = await ctx.req('resumePlan', { file: 'cnc.nc', line: 7 });
    expect(plan.preview).toEqual({ version: 1, fingerprint: sha256(Buffer.from(PROGRAMS['cnc.nc'])), fromLine: 7, preamble: plan.preamble, kind: 'cnc' });
    await ctx.req('load', { file: 'cnc.nc', fromLine: 7 });
    const sent = sentPreamble(ctx);
    expect(sent.slice(0, plan.preview.preamble.length)).toEqual(plan.preview.preamble);
    expect(sent[plan.preview.preamble.length]).toBe('G1 Y10');
    expect(ctx.state().resume).toMatchObject({ from: 7, preambleLength: plan.preview.preamble.length, mode: 'cnc' });
  });

  test('laser: the preview is exactly the preamble the load sends, with no emission before the program', async () => {
    const ctx = setup({ machines: [record('laser')], settings: { ...SETTINGS, $32: '1' } });
    const plan = await ctx.req('resumePlan', { file: 'passes.nc', line: 6 });
    expect(plan.preview).toEqual({ version: 1, fingerprint: sha256(Buffer.from(PROGRAMS['passes.nc'])), fromLine: 6, preamble: plan.preamble, kind: 'laser' });
    await ctx.req('load', { file: 'passes.nc', fromLine: 6 });
    const sent = sentPreamble(ctx);
    expect(sent.slice(0, plan.preview.preamble.length)).toEqual(plan.preview.preamble);
    expect(sent[plan.preview.preamble.length]).toBe('G0 X20 Y0');
    expect(ctx.state().resume).toMatchObject({ from: 6, mode: 'laser' });
    expect(ctx.c.written).toEqual([]);
  });
});

describe('laser resume boundaries (§4)', () => {
  const P = (...lines) => lines.join('\n');

  test('after a cut, at the start of a new rapid: M5, modal state, G0 XY, constant Z, F, then M3/M4 S; no dwell, no plunge', () => {
    const plan = buildResume(P('G21 G90 G54', 'G0 X0 Y0 Z2', 'M4 S800', 'G1 X10 F1200', 'G1 Y10', 'G0 X20 Y0', 'G1 X30', 'M5', 'M30'), 6, { name: 'plaque.nc', mode: 'laser' });
    expect(plan.mode).toBe('laser');
    expect(plan.preamble).toEqual(['(CNCjs Touch : reprise laser a la ligne 6 de plaque.nc)', 'M5', 'G21 G90 G17 G54 G94', 'G0 X10 Y10', 'G0 Z2', 'F1200', 'M4 S800']);
    expect(plan.program.split('\n').slice(7, 9)).toEqual(['G0 X20 Y0', 'G1 X30']);
    expect(plan.spindle).toEqual({ mode: 'M4', speed: 800 });
    expect(plan.preamble.join('\n')).not.toMatch(/^(G4|G1) /m);
  });

  test('laser off (M5 or S0): a rapid after it is a boundary; no Z move when the program gives none; S kept when off', () => {
    const off = buildResume(P('G21 G90', 'G0 X0 Y0', 'M3 S500', 'G1 X10 F900', 'M5', 'G0 X5 Y5', 'G0 X7 Y7', 'M3', 'G1 X20'), 7, { mode: 'laser' });
    expect(off.preamble.slice(1)).toEqual(['M5', 'G21 G90 G17 G94', 'G0 X5 Y5', 'F900', 'S500']);
    expect(off.notes.join(' ')).toMatch(/reste à sa hauteur actuelle/);
    const s0 = buildResume(P('G21 G90', 'G0 X0 Y0', 'M3 S500', 'G1 X10 F900', 'S0', 'G0 X5 Y5'), 6, { mode: 'laser' });
    expect(s0.preamble.slice(-1)).toEqual(['M3 S0']);
    // A modal G0 line gets its motion word back.
    const modal = buildResume(P('G21 G90', 'G0 X0 Y0', 'M3 S500', 'G1 X10 F900', 'G0', 'X3 Y3'), 6, { mode: 'laser' });
    expect(modal.program.split('\n')[modal.preamble.length]).toBe('G0 X3 Y3');
  });

  test('refusals with their reason', () => {
    const code = (gcode, from) => {
      try {
        buildResume(gcode, from, { mode: 'laser' });
      } catch (err) {
        expectCatalogMatch(err);
        return err.code;
      }
      return null;
    };
    expect(code(P('G21 G90', 'G0 X0 Y0', 'M3 S500', 'G1 X10 F1000', 'G1 Y10'), 5)).toBe('ETOUCH_LASER_RESUME_NOT_RAPID');
    expect(code(P('G21 G90', 'G0 X0 Y0', 'M3 S500', 'G1 X10 F1000', 'G0 Z5'), 5)).toBe('ETOUCH_LASER_RESUME_NOT_RAPID');
    expect(code(P('G21 G90', 'M3 S500', 'G0 X0 Y0', 'G0 X5 Y5', 'G1 X10 F1000'), 4)).toBe('ETOUCH_LASER_RESUME_NOT_BOUNDARY');
    expect(code(P('G21 G90', 'G1 Z0 F100', 'M5', 'G0 Y5', 'G0 X1 Y1'), 4)).toBe('ETOUCH_LASER_RESUME_POSITION');
    expect(code(P('G21 G90', 'G0 Z1 X0 Y0', 'G0 Z2', 'M5', 'G0 X1 Y1'), 5)).toBe('ETOUCH_LASER_RESUME_Z_VARIES');
    expect(code(P('G21 G90', 'G0 X0 Y0', 'M3', 'G1 X10 F1000', 'G0 X20 Y0'), 5)).toBe('ETOUCH_LASER_RESUME_S_UNKNOWN');
    // The common refusals of the builder still apply.
    expect(code(P('G21 G91', 'G0 X1 Y1', 'M5', 'G0 X1'), 4)).toBe('ETOUCH_RESUME_RELATIVE');
    expect(code(P('G21 G90', 'G92 X0', 'M5', 'G0 X1 Y1'), 4)).toBe('ETOUCH_RESUME_ORIGIN_CHANGED');
  });

  test('the CNC mode is unchanged (default)', () => {
    const gcode = PROGRAMS['cnc.nc'];
    const before = buildResume(gcode, 7);
    expect(buildResume(gcode, 7, { mode: 'cnc' })).toEqual(before);
    expect(before.preamble.slice(1)).toEqual(['G21 G90 G17 G94', 'G0 Z5', 'G0 X10 Y0', 'M3 S9000', 'G4 P3', 'G1 Z-1 F200', 'F800']);
  });
});

describe('program check for a laser (§4)', () => {
  test('S above $30 flagged, M3 / M4 reported, "consigne S" wording; nothing added for a CNC', () => {
    const gcode = ['G21 G90', 'M3 S1200', 'G1 X10 F1000', 'M4 S100', 'G1 Y5', 'M5'].join('\n');
    const laser = programCheck(gcode, { settings: { $30: 1000 }, laser: { sMax: 1000 } }).laser;
    expect(laser).toMatchObject({ mode: 'M3+M4', m3Line: 2, m4Line: 4, sMax: 1200, sMaxLine: 2, settingMax: 1000, aboveMax: true });
    expect(laser.codedReasons.map((r) => r.code)).toEqual(['ETOUCH_LASER_CHECK_M3', 'ETOUCH_LASER_CHECK_M4', 'ETOUCH_LASER_CHECK_S_ABOVE_MAX']);
    expect(laser.reasons[2]).toBe('Consigne S1200 (ligne 2) au-dessus de $30=1000 : la carte la ramènera à $30.');
    laser.codedReasons.forEach(expectCatalogMatch);
    laser.reasons.forEach((text) => expect(text).not.toMatch(/puissance|power/i));
    expect(programCheck(gcode, { settings: {} }).laser).toBeUndefined();
    const within = programCheck(['G21', 'M4 S500', 'G1 X1 F100'].join('\n'), { laser: { sMax: 1000 } }).laser;
    expect(within).toMatchObject({ mode: 'M4', aboveMax: false });
    expect(within.codedReasons.map((r) => r.code)).toEqual(['ETOUCH_LASER_CHECK_M4']);
    const none = programCheck('G21\nG1 X1 F100 S20', { laser: { sMax: null } }).laser;
    expect(none.codedReasons.map((r) => r.code)).toEqual(['ETOUCH_LASER_CHECK_NO_M3_M4', 'ETOUCH_LASER_CHECK_MAX_UNKNOWN']);
    none.codedReasons.forEach(expectCatalogMatch);
  });

  test('the snapshot programCheck has the laser part for a laser profile only', async () => {
    const ctx = setup({ machines: [record('laser')], settings: { ...SETTINGS, $32: '1', $30: '255' } });
    await ctx.req('load', { file: 'frame.nc' });
    expect(ctx.state().programCheck.laser).toMatchObject({ mode: 'M4', sMax: 300, aboveMax: true, settingMax: 255 });
    const cnc = setup();
    await cnc.req('load', { file: 'frame.nc' });
    expect(cnc.state().programCheck.laser).toBeUndefined();
  });
});

describe('laser framing (§4)', () => {
  const LINES = ['M5', '$J=G90 G21 X10 Y20 F1000', '$J=G90 G21 X60 Y20 F1000', '$J=G90 G21 X60 Y50 F1000', '$J=G90 G21 X10 Y50 F1000', '$J=G90 G21 X10 Y20 F1000'];
  const laserSetup = (options = {}) => setup({ machines: [record('laser')], settings: { ...SETTINGS, $32: '1' }, ...options });

  test('prepare → ticket → frame: M5 first, then bounded absolute jogs one at a time, never M3/M4/S', async () => {
    const ctx = laserSetup();
    await ctx.req('load', { file: 'frame.nc' });
    const ticket = await ctx.machine('frame-prepare');
    expect(ticket).toMatchObject({ operation: 'frame', expiresIn: 15, generation: ctx.generation, frame: { lines: LINES, bounds: { xMin: 10, xMax: 60, yMin: 20, yMax: 50 }, feed: 1000 } });
    expect(ticket.name).toMatch(/M5 d’abord, sans émission/);
    expect(ctx.c.written).toEqual([]);
    const res = await ctx.machine('frame', { nonce: ticket.nonce });
    expect(res.lines).toEqual(LINES);
    expect(ctx.c.written).toEqual(['M5\n']);
    expect(ctx.state().canStop).toBe(true);
    expect(ctx.state().motion.frame).toMatchObject({ index: 1 });
    for (let i = 1; i < LINES.length; i++) {
      ctx.settle();
      expect(ctx.c.written).toEqual(LINES.slice(0, i + 1).map((l) => l + '\n'));
      ctx.c.state.status.activeState = 'Jog';
      ctx.report();
    }
    ctx.settle();
    expect(ctx.state().motion.frame).toBeNull();
    expect(ctx.state().motion.lastFrame).toMatchObject({ result: 'ended', sent: 6, total: 6 });
    expect(ctx.c.written.join('')).not.toMatch(NO_EMISSION);
    expect(ctx.history.filter((e) => e.event === 'frame')).toEqual([expect.objectContaining({ result: 'ended', lines: LINES, sent: 6, feed: 1000, actor: A })]);
    // Single use.
    expect((await refusalOf(ctx.machine('frame', { nonce: ticket.nonce }))).code).toBe('ETOUCH_LASER_FRAME_EXPIRED');
  });

  test('Stop, jog stop or the owner\'s stream closing cancels it (0x85) and nothing more is sent', async () => {
    for (const how of ['stop', 'jog-stop', 'pause', 'transport']) {
      const ctx = laserSetup();
      await ctx.req('load', { file: 'frame.nc' });
      const ticket = await ctx.machine('frame-prepare', { feed: 2000 });
      await ctx.machine('frame', { nonce: ticket.nonce });
      ctx.settle();
      expect(ctx.c.written).toEqual(['M5\n', '$J=G90 G21 X10 Y20 F2000\n']);
      ctx.c.state.status.activeState = 'Jog';
      ctx.report();
      if (how === 'stop' || how === 'pause') {
        await ctx.req(how);
      } else if (how === 'jog-stop') {
        await ctx.req('motion', { operation: 'jog-stop' }, B, 'tB');
      } else {
        ctx.service.closeTransport('tA');
      }
      expect(ctx.c.written.at(-1)).toBe('\x85');
      ctx.settle();
      ctx.tick(500);
      expect(ctx.c.written.filter((l) => /^\$J=/.test(l))).toHaveLength(1);
      expect(ctx.state().motion.lastFrame).toMatchObject({ result: 'cancelled' });
      expect(ctx.history.filter((e) => e.event === 'frame')[0]).toMatchObject({ result: 'cancelled', sent: 2 });
    }
  });

  test('an error answer ends it; an alarm cancels it', async () => {
    let ctx = laserSetup();
    await ctx.req('load', { file: 'frame.nc' });
    let ticket = await ctx.machine('frame-prepare');
    await ctx.machine('frame', { nonce: ticket.nonce });
    ctx.c.runner.emit('error', { message: '15' });
    ctx.tick(150);
    expect(ctx.state().motion.lastFrame).toMatchObject({ result: 'refused', reason: 'error:15' });
    expect(ctx.c.written).toEqual(['M5\n']);

    ctx = laserSetup();
    await ctx.req('load', { file: 'frame.nc' });
    ticket = await ctx.machine('frame-prepare');
    await ctx.machine('frame', { nonce: ticket.nonce });
    ctx.settle();
    ctx.c.state.status.activeState = 'Alarm';
    ctx.tick(100);
    expect(ctx.c.written.at(-1)).toBe('\x85');
    expect(ctx.state().motion.lastFrame).toMatchObject({ result: 'cancelled', reason: 'alarm' });
  });

  test('refusals: CNC profile, real moves disabled, no program, check not validated, other WCS, feed, too slow, pilot, ticket', async () => {
    const code = async (promise) => {
      const err = await refusalOf(promise);
      if (/^ETOUCH_/.test(err.code)) {
        expectCatalogMatch(err);
      }
      return err.code;
    };
    let ctx = setup({ machines: [record('cnc')] });
    await ctx.req('load', { file: 'frame.nc' });
    expect(await code(ctx.machine('frame-prepare'))).toBe('ETOUCH_LASER_NOT_LASER');
    ctx = setup();
    expect(await code(ctx.machine('frame-prepare'))).toBe('ETOUCH_LASER_NOT_LASER');

    ctx = laserSetup({ enabled: false });
    await ctx.req('load', { file: 'frame.nc' });
    expect(await code(ctx.machine('frame-prepare'))).toBe('ETOUCH_LASER_FRAME_DISABLED');

    ctx = laserSetup();
    expect(await code(ctx.machine('frame-prepare'))).toBe('ETOUCH_LASER_FRAME_NO_PROGRAM');

    ctx = laserSetup({ homed: false });
    await ctx.req('load', { file: 'frame.nc' });
    expect(await code(ctx.machine('frame-prepare'))).toBe('ETOUCH_LASER_FRAME_CHECK');

    ctx = laserSetup();
    await ctx.req('load', { file: 'idle-y.nc' });
    expect(await code(ctx.machine('frame-prepare'))).toBe('ETOUCH_LASER_FRAME_BOUNDS');

    ctx = laserSetup();
    ctx.c.runner.state.parserstate = { modal: { wcs: 'G54' } };
    ctx.c.runner.emit('parserstate', { modal: { wcs: 'G54' } });
    ctx.c.settings.parameters = { G55: { x: -200, y: -200, z: 0 } };
    await ctx.req('load', { file: 'g55.nc' });
    const wcs = await refusalOf(ctx.machine('frame-prepare'));
    expect(wcs).toMatchObject({ code: 'ETOUCH_LASER_FRAME_WCS', params: { wcs: 'G55', active: 'G54' } });
    expectCatalogMatch(wcs);

    ctx = laserSetup();
    await ctx.req('load', { file: 'frame.nc' });
    expect(await code(ctx.machine('frame-prepare', { feed: 5000 }))).toBe('ETOUCH_LASER_FRAME_FEED');
    expect(await code(ctx.machine('frame-prepare', { feed: '1000' }))).toBe('ETOUCH_LASER_FRAME_FEED');
    expect(await code(ctx.machine('frame-prepare', { feed: 10 }))).toBe('ETOUCH_LASER_FRAME_SLOW');
    // Not at rest: the real-move guard says why.
    ctx.c.state.status.activeState = 'Alarm';
    ctx.report();
    expect(await code(ctx.machine('frame-prepare'))).toBe('ETOUCH_MOTION_ALARM');
    ctx.c.state.status.activeState = 'Idle';
    ctx.report();
    // Someone else pilots: ECONTROL; another device's stream: refused.
    ctx.control.takeover('TEST', B, 'essai');
    expect(await code(ctx.machine('frame-prepare', {}, A))).toBe('ECONTROL');
    await ctx.control.release('TEST', B);
    await expect(ctx.req('machine', { operation: 'frame-prepare' }, A, 'tB')).rejects.toThrow(/appareil dont le suivi est ouvert/);
    expect(await code(ctx.req('machine', { operation: 'frame-prepare' }, A, null))).toBe('ETOUCH_MACHINE_TRANSPORT');
    // Ticket: expiry, another nonce, the program changed on disk.
    let ticket = await ctx.machine('frame-prepare');
    ctx.now += 16000;
    ctx.report();
    expect(await code(ctx.machine('frame', { nonce: ticket.nonce }))).toBe('ETOUCH_LASER_FRAME_EXPIRED');
    ticket = await ctx.machine('frame-prepare');
    expect(await code(ctx.machine('frame', { nonce: 'x' + ticket.nonce }))).toBe('ETOUCH_LASER_FRAME_EXPIRED');
    ticket = await ctx.machine('frame-prepare');
    ctx.programs['frame.nc'] += '\n(changed)';
    expect((await refusalOf(ctx.machine('frame', { nonce: ticket.nonce }))).message).toMatch(/Fichier modifié/);
    expect(ctx.c.written).toEqual([]);
  });
});
