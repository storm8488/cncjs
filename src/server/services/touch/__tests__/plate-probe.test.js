/* eslint-env jest */
// Z zero with a touch plate (plate-probe.js): how every stop ends the sequence (Arrêter, a socket
// stop, the lease changed, a line still in flight), on a fake board whose reports and answers the
// test gives one by one. LUNYEE settings, machine homed, work offset taken as proven
// (provenOffset). Converted from the proof tests bughunt-V1-2 and bughunt-V1-3.
import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { createService } from '../job-service';
import { createControl } from '../control';
import { provenOffset } from './support/proven-offset';
import { expectCatalogMatch } from './touch-codes-catalog';
import { bridge } from './support/sim-bridge';
import { lineBench } from './support/line-bench';

const GrblSimulator = require('../../../../../grbl-simulator/grbl-simulator');

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
const G54 = { x: 100, y: 100, z: -115 };
const f3 = (n) => n.toFixed(3);
const A = { kind: 'touch', id: 'tablette-A', label: 'Tablette A', user: 'op' };
const B = { kind: 'touch', id: 'tablette-B', label: 'Tablette B', user: 'op' };

let root;
beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'cnc-touch-plate-'));
  await fs.writeFile(path.join(root, 'pause.nc'), 'G21 G90 G94\nG0 Z5\nM6\nM30');
});
afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

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
      c.sender.state = { name: args[0], context: args[2], total: 4 };
      c.sender.emit('load');
      args[3](null);
    } else if (name === 'gcode:start') {
      c.workflow.state = 'running';
      c.workflow.emit('start');
    }
  };
  return lineBench(c);
};

const services = [];
afterEach(() => {
  services.splice(0).forEach((service) => service.dispose());
  jest.useRealTimers();
});

// Machine homed, at rest, probe free, the tool at machine position `m`.
const setup = (m, workOffset = provenOffset) => {
  jest.useFakeTimers();
  const ctx = { now: 10000, c: fakeController(), m: { ...m }, offset: { ...G54 }, active: 'Idle' };
  ctx.control = createControl({ now: () => ctx.now, elapsed: () => ctx.now });
  ctx.service = createService(
    { get: () => ({ TEST: ctx.c }) },
    { get: (key) => ({ watchDirectory: root, macros: [], events: [], 'touch.machines': [], 'touch.motion.enabled': true }[key]) },
    () => ctx.now,
    { control: ctx.control, workOffset }
  );
  services.push(ctx.service);
  ctx.state = () => ctx.service.list()[0];
  ctx.generation = ctx.state().generation;
  ctx.service.openTransport('tA', A);
  ctx.service.openTransport('tB', B);
  ctx.req = (action, extra = {}, actor = A, transportId = actor === B ? 'tB' : 'tA') => ctx.service.action({
    port: 'TEST', generation: ctx.generation, transportId, action, ...extra
  }, actor);
  ctx.report = (active = ctx.active, at = ctx.m) => {
    ctx.c.state.status = {
      ...ctx.c.state.status,
      activeState: active,
      mpos: { x: f3(at.x), y: f3(at.y), z: f3(at.z) },
      wpos: { x: f3(at.x - ctx.offset.x), y: f3(at.y - ctx.offset.y), z: f3(at.z - ctx.offset.z) }
    };
    // Lot C1: the line says the work offset too (WCO:), as the state above does: the work position
    // is read from the report itself.
    ctx.c.runner.emit('status', { raw: '<' + active + '|MPos:' + f3(at.x) + ',' + f3(at.y) + ',' + f3(at.z) + '|FS:0,0|WCO:' + f3(ctx.offset.x) + ',' + f3(ctx.offset.y) + ',' + f3(ctx.offset.z) + '>' });
  };
  ctx.modal = () => {
    ctx.c.state.parserstate = { modal: { motion: 'G0', wcs: 'G54', units: 'G21', distance: 'G90', spindle: 'M5', feedrate: 'G94' }, feedrate: '0', spindle: '0' };
    ctx.c.runner.emit('parserstate', ctx.c.state.parserstate);
  };
  // Time goes by: one report every 50 ms, like CNCjs's poll.
  // Lot C1: CNCjs's own $G exchange, the modal report (M5) then its ok; one every 500 ms of bench time.
  ctx.gc = () => {
    ctx.modal();
    ctx.c.runner.emit('ok');
  };
  ctx.sinceGc = 0;
  ctx.tick = async (ms) => {
    for (let t = 0; t < ms; t += 50) {
      ctx.now += 50;
      ctx.sinceGc += 50;
      if (ctx.sinceGc >= 500) {
        ctx.sinceGc = 0;
        ctx.gc();
      }
      ctx.report();
      // eslint-disable-next-line no-await-in-loop
      await jest.advanceTimersByTimeAsync(50);
    }
  };
  ctx.report('Home', { x: 0, y: 0, z: 0 });
  ctx.report('Idle', { x: 0, y: 0, z: 0 });
  ctx.report();
  // Lot C1: a second report at rest where the tool is.
  ctx.report();
  ctx.modal();
  ctx.lines = () => ctx.c.commands.filter((entry) => entry[0] === 'gcode').map((entry) => entry[1]);
  ctx.names = () => ctx.c.commands.map((entry) => entry[0]);
  ctx.stops = () => ctx.names().filter((name) => ['feedhold', 'reset', 'gcode:stop', 'feeder:stop'].includes(name));
  // Confirms and launches the probe; `outcome` is { ok } or { err } once the sequence is over.
  ctx.start = async (params) => {
    const ticket = await ctx.req('prepare', { operation: 'zeroZ', ...params });
    ctx.outcome = null;
    ctx.req('zeroZ', { nonce: ticket.nonce }).then((ok) => {
      ctx.outcome = { ok };
    }, (err) => {
      ctx.outcome = { err };
    });
    await jest.advanceTimersByTimeAsync(0);
  };
  // Launched and running: the board reports Run.
  ctx.launch = async (params) => {
    await ctx.start(params);
    ctx.active = 'Run';
    await ctx.tick(300);
  };
  // The end of the first G38.2: contact at machine Z −105 (work Z 10), `ok`, then one report at rest.
  ctx.firstContact = async () => {
    ctx.m = { ...ctx.m, z: -105 };
    ctx.active = 'Idle';
    ctx.c.runner.emit('ok');
    ctx.now += 50;
    ctx.report();
    await jest.advanceTimersByTimeAsync(0);
  };
  // The board's banner after the reset (CNCjs's `startup` event).
  ctx.banner = () => ctx.c.runner.emit('startup', { firmware: 'Grbl', version: '1.1f' });
  return ctx;
};

test('D2: a plate ticket cannot move after its offset proof was invalidated', async () => {
  let proven = true;
  const refusal = Object.assign(new Error('Offset unconfirmed'), { code: 'ETOUCH_OFFSET_UNCONFIRMED' });
  const ctx = setup({ x: 100, y: 100, z: -110 }, () => ({
    ...provenOffset(),
    proven: () => proven,
    invalidate: () => {
      proven = false;
    },
    refusal: () => (proven ? null : refusal),
    snapshot: () => ({ state: proven ? 'proven' : 'unknown' })
  }));
  proven = true;
  const ticket = await ctx.req('prepare', { operation: 'zeroZ', thickness: 5, search: 10 });
  ctx.service.socketCommand('TEST', false);
  expect(ctx.state()).toMatchObject({ canZeroZ: false, workOffset: { state: 'unknown' } });
  const attempt = ctx.req('zeroZ', { nonce: ticket.nonce }).catch((err) => err);
  expect(ctx.c.commands).toEqual([]);
  expect(await attempt).toMatchObject({ code: 'ETOUCH_OFFSET_UNCONFIRMED' });
});

test('D4: permanent contact refuses both plate and block before any line is written', async () => {
  const ctx = setup({ x: 100, y: 100, z: -110 });
  for (let i = 0; i <= 5; i++) {
    ctx.now += 1000;
    ctx.c.runner.emit('status', { raw: '<Idle|MPos:100,100,-110|Pn:P>' });
  }
  ctx.modal();
  const snapshot = ctx.state();
  expect(snapshot.probeInput).toMatchObject({ stuck: true, contactMs: 5000 });
  expect(snapshot.refusals).toMatchObject({ zeroZ: { code: 'ETOUCH_PROBE_CONTACT_STUCK' }, blockProbe: { code: 'ETOUCH_PROBE_CONTACT_STUCK' } });
  const refused = await ctx.req('prepare', { operation: 'zeroZ', thickness: 1, search: 10 }).catch((err) => err);
  expect(refused).toMatchObject({ code: 'ETOUCH_PROBE_CONTACT_STUCK', params: { seconds: '5' } });
  expectCatalogMatch(refused);
  await expect(ctx.req('prepare', { operation: 'blockProbe',
axes: 'Z',
wcs: 'G54',
    profile: { thickness: 10, fast: 100, slow: 25, search: 10, retract: 1, clearance: 5 } })).rejects.toMatchObject({ code: 'ETOUCH_PROBE_CONTACT_STUCK' });
  expect(ctx.c.commands).toEqual([]);
});

test('D4: no automatic settings write between lines of a plate sequence', async () => {
  const ctx = setup({ x: 100, y: 100, z: -110 });
  await ctx.start({ thickness: 1, search: 10 });
  ctx.c.settings.version = '';
  ctx.c.writeln = jest.fn();
  ctx.service.observe();
  expect(ctx.c.writeln).not.toHaveBeenCalled();
  expect(ctx.lines()[0]).toMatch(/^G38\.2/);
});

describe('plate probe: every stop ends the sequence (PLAN-CORRECTIONS § 1.6)', () => {
  test('SURETE D-05: API Pause during an M6 plate ends the sequence and refuses the program resume', async () => {
    const ctx = setup({ x: 150, y: 120, z: -100 });
    await ctx.req('load', { file: 'pause.nc' });
    const start = await ctx.req('prepare', { operation: 'start', revision: ctx.state().revision });
    await ctx.req('start', { nonce: start.nonce });
    // A real job record, paused for a tool change, using the public plate action.
    ctx.c.workflow.state = 'paused';
    ctx.c.sender.state = { ...ctx.c.sender.state, holdReason: { data: 'M6' } };
    await ctx.launch({ thickness: 10, search: 20 });
    await ctx.req('pause', {}, B);
    expect(ctx.names()).toContain('feedhold');
    ctx.active = 'Idle';
    await ctx.tick(7400);
    expect(ctx.outcome.err.message).toBe('Palpage interrompu par l’opérateur.');
    expect(ctx.lines()).toEqual(['G38.2 Z-5 F100']);
    expect(ctx.state().canResume).toBe(false);
    expect(ctx.state().resumeReason).toMatch(/palpage.*échoué/i);
  });

  test.each(['in flight', 'between lines'])('SURETE D-06: a banner returning directly Idle cancels the plate %s without an old ok authorizing another line', async (phase) => {
    const ctx = setup({ x: 150, y: 120, z: -100 });
    ctx.c.settings.settings.$22 = '0';
    await ctx.launch({ thickness: 10, search: 20 });
    // Keep a plausible completed contact so an old-session success would try the retract.
    ctx.m.z = -105;
    if (phase === 'between lines') {
      await ctx.firstContact();
    } else {
      ctx.c.runner.emit('ok');
    }
    ctx.banner();
    ctx.active = 'Idle';
    await ctx.tick(500);
    expect(ctx.outcome).toHaveProperty('err');
    expect(ctx.state().probing).toBe(false);
    expect(ctx.lines()).toEqual(['G38.2 Z-5 F100']);
    // The banner already stopped the old session: no delayed reset in the new one.
    await ctx.tick(6000);
    expect(ctx.stops()).toEqual([]);
  });

  test('SURETE D-05: Pause during a plate in M6 ends it and prevents resuming the program', async () => {
    const ctx = setup({ x: 150, y: 120, z: -100 });
    ctx.c.workflow.state = 'paused';
    ctx.c.sender.state.holdReason = { data: 'M6' };
    await ctx.start({ thickness: 10, search: 20 });
    await ctx.req('pause', {}, B);
    expect(ctx.names()).toContain('feedhold');
    ctx.banner();
    await ctx.tick(200);
    expect(ctx.outcome.err).toBeDefined();
    expect(ctx.lines()).toEqual(['G38.2 Z-5 F100']);
    expect(ctx.names()).not.toContain('gcode:resume');
  });

  test.each(['before', 'after'])('SURETE D-06: a banner returning to Idle invalidates an old ok (%s the banner)', async (when) => {
    const ctx = setup({ x: 150, y: 120, z: -100 });
    ctx.c.settings.settings.$22 = '0';
    await ctx.start({ thickness: 10, search: 20 });
    ctx.m.z = -105;
    if (when === 'before') {
      ctx.c.runner.emit('ok');
    }
    ctx.banner();
    if (when === 'after') {
      ctx.c.runner.emit('ok');
    }
    await ctx.tick(500);
    expect(ctx.outcome).toHaveProperty('err');
    expect(ctx.outcome.err).toBeDefined();
    expect(ctx.state().homed).toBe(false);
    expect(ctx.lines()).toEqual(['G38.2 Z-5 F100']);
  });

  test('SURETE C-01: the second search is reserved before either touch near the low Z limit', async () => {
    const ctx = setup({ x: 150, y: 120, z: -128 });
    await expect(ctx.req('prepare', { operation: 'zeroZ', thickness: 1, search: 1 })).rejects.toMatchObject({ code: 'ETOUCH_PLATE_TRAVEL' });
    expect(ctx.lines()).toEqual([]);
  });

  test.each(['in flight', 'between lines'])('SURETE: API Pause stops the plate %s, even for an observer', async (phase) => {
    const ctx = setup({ x: 150, y: 120, z: -100 });
    await ctx.launch({ thickness: 10, search: 20 });
    if (phase === 'between lines') {
      await ctx.firstContact();
    }
    const reply = await ctx.req('pause', {}, B);
    expect(reply.message).toBe('Palpage interrompu. Vérifiez l’immobilisation ; le zéro Z n’est pas réglé.');
    expect(ctx.names()).toContain('feedhold');
    expect(ctx.service.socketRefusal('TEST')).not.toBeNull();
    ctx.active = 'Idle';
    await ctx.tick(300);
    ctx.banner();
    await ctx.tick(100);
    expect(ctx.outcome.err.message).toBe('Palpage interrompu par l’opérateur.');
    expect(ctx.state().probing).toBe(false);
    expect(ctx.lines()).toEqual(['G38.2 Z-5 F100']);
  });

  test('C-08 Arrêter right after the G38.2 left, the report still Idle: a feed hold, then the reset; the lock holds until the banner proves the stop', async () => {
    const ctx = setup({ x: 150, y: 120, z: -100 });
    await ctx.start({ thickness: 10, search: 20 });
    expect(ctx.lines()).toEqual(['G38.2 Z-5 F100']);
    // Less than one polling period later, the last report still says Idle.
    const reply = await ctx.req('stop', {});
    expect(reply.message).toBe('Palpage interrompu. Vérifiez l’immobilisation ; le zéro Z n’est pas réglé.');
    expect(ctx.names()).toContain('feedhold');
    await ctx.tick(300);
    // A newer report at rest: halt.js sends the reset; the stop is not proven yet (no banner).
    expect(ctx.names()).toContain('reset');
    expect(ctx.state()).toMatchObject({ probing: true, canZeroZ: false, canStop: true });
    expect(ctx.outcome).toBeNull();
    ctx.banner();
    await ctx.tick(100);
    expect(ctx.outcome.err.message).toBe('Palpage interrompu par l’opérateur.');
    expect(ctx.state().probing).toBe(false);
    expect(ctx.lines()).toEqual(['G38.2 Z-5 F100']);
  });

  test('C-08 without any banner, a report at rest 7 s after the stop proves it; before that the lock holds', async () => {
    const ctx = setup({ x: 150, y: 120, z: -100 });
    await ctx.start({ thickness: 10, search: 20 });
    await ctx.req('stop', {});
    await ctx.tick(6000);
    expect(ctx.state().probing).toBe(true);
    await ctx.tick(1500);
    expect(ctx.state().probing).toBe(false);
    expect(ctx.outcome.err.message).toBe('Palpage interrompu par l’opérateur.');
    expect(ctx.lines()).toEqual(['G38.2 Z-5 F100']);
  });

  test('the same Arrêter once the descent is reported (Run) sends the feed hold too', async () => {
    const ctx = setup({ x: 150, y: 120, z: -100 });
    await ctx.launch({ thickness: 10, search: 20 });
    await ctx.req('stop', {});
    expect(ctx.names()).toContain('feedhold');
  });

  test('C-09 a socket stop at rest between the G38.2 and the retract: the next line does not leave, the machine is held', async () => {
    const ctx = setup({ x: 150, y: 120, z: -100 });
    await ctx.launch({ thickness: 10, search: 20 });
    expect(ctx.lines()).toEqual(['G38.2 Z-5 F100']);
    await ctx.firstContact();
    // CNCjs's Stop on the PC (index.js refuseSocket calls this before the command goes its way).
    ctx.service.socketStop('TEST');
    expect(ctx.names()).toContain('feedhold');
    await ctx.tick(600);
    ctx.banner();
    await ctx.tick(100);
    expect(ctx.lines()).toEqual(['G38.2 Z-5 F100']);
    expect(ctx.outcome.err.message).toBe('Palpage interrompu par l’opérateur.');
    expect(ctx.state().probing).toBe(false);
  });

  test('the tablet’s Arrêter at the same moment stops the sequence as well', async () => {
    const ctx = setup({ x: 150, y: 120, z: -100 });
    await ctx.launch({ thickness: 10, search: 20 });
    await ctx.firstContact();
    await ctx.req('stop', {});
    await ctx.tick(600);
    expect(ctx.lines()).toEqual(['G38.2 Z-5 F100']);
  });

  test('C-12 the lease released during the probe: the probe stops at once, and a socket command that is not safe is refused until it ends', async () => {
    const ctx = setup({ x: 150, y: 120, z: -100 });
    await ctx.launch({ thickness: 10, search: 20 });
    expect(ctx.control.inspect('TEST').owner).toMatchObject({ id: 'tablette-A' });
    expect(ctx.service.socketRefusal('TEST')).toMatchObject({ message: 'Palpage en cours sur la tablette : commande refusée jusqu’à sa fin (Arrêter reste possible).' });
    await ctx.req('control', { operation: 'release' });
    // In the same step, before any other command can be read.
    expect(ctx.names()).toEqual(expect.arrayContaining(['feeder:stop', 'gcode:stop', 'feedhold']));
    expect(ctx.service.socketRefusal('TEST')).not.toBeNull();
    ctx.active = 'Idle';
    await ctx.tick(300);
    ctx.banner();
    await ctx.tick(100);
    expect(ctx.state().probing).toBe(false);
    expect(ctx.service.socketRefusal('TEST')).toBeNull();
    expect(ctx.lines()).toEqual(['G38.2 Z-5 F100']);
  });
});

describe('plate probe: the search against the Z travel, the supervision (C-07, C-17, C-55)', () => {
  test('SURETE C-01: a full two-touch cycle at the allowed boundary keeps both targets above the 1 mm band', async () => {
    const ctx = setup({ x: 150, y: 120, z: -127 });
    const command = ctx.c.command;
    const targets = [];
    ctx.c.command = (name, ...args) => {
      command(name, ...args);
      if (name !== 'gcode') {
        return;
      }
      const line = args[0];
      const move = /^(G38\.2|G0) Z(-?[\d.]+)/.exec(line);
      if (move) {
        const target = Number(move[2]) + ctx.offset.z;
        targets.push(target);
        ctx.m.z = move[1] === 'G38.2' ? -127.9 : target;
      } else if (line === 'G10 L20 P0 Z1') {
        ctx.offset.z = ctx.m.z - 1;
      }
      ctx.report();
      ctx.c.runner.emit('ok');
      // Lot C1: CNCjs's $G exchange after the ok of each line (M5).
      ctx.gc();
    };
    await ctx.start({ thickness: 1, search: 1 });
    await ctx.tick(2000);
    expect(ctx.outcome).toHaveProperty('ok');
    expect(ctx.lines().filter((line) => /^G38/.test(line))).toEqual(['G38.2 Z-13 F100', 'G38.2 Z-13.9 F25']);
    expect(Math.min(...targets)).toBeCloseTo(-128.9, 3);
    expect(targets.every((z) => z >= -129 && z <= 0)).toBe(true);
    expect(ctx.state().zeroZ).toMatchObject({ thickness: 1 });
  });

  // Time goes by without any report from the board.
  const silence = async (ctx, ms) => {
    for (let t = 0; t < ms; t += 50) {
      ctx.now += 50;
      // eslint-disable-next-line no-await-in-loop
      await jest.advanceTimersByTimeAsync(50);
    }
  };
  // The refusal of a confirmation, or null when a ticket was issued.
  const refusalOf = (ctx, params) => ctx.req('prepare', { operation: 'zeroZ', ...params }).then(() => null, (err) => err);

  test('C-07 homed, Z machine −60, search 100 (target −160 for a travel of −130): refused with the longest search allowed, no G38.2', async () => {
    const ctx = setup({ x: 150, y: 120, z: -60 });
    expect(ctx.state().homed).toBe(true);
    const err = await refusalOf(ctx, { thickness: 10, search: 100 });
    expect(err).toMatchObject({ status: 409, code: 'ETOUCH_PLATE_TRAVEL', params: { search: '100', max: '68' } });
    expect(err.message).toBe('Recherche de 100 mm trop longue : l’outil sortirait de la course en Z. Au plus 68 mm d’ici.');
    expectCatalogMatch(err);
    expect(ctx.lines()).toEqual([]);
    // 68 mm: even a second target 1 mm below the first contact stays at or above −129.
    await ctx.start({ thickness: 10, search: 68 });
    expect(ctx.lines()).toEqual(['G38.2 Z-13 F100']);
  });

  test('C-07 checked again at the run: the tool lowered after the confirmation, nothing is sent', async () => {
    const ctx = setup({ x: 150, y: 120, z: -60 });
    const ticket = await ctx.req('prepare', { operation: 'zeroZ', thickness: 10, search: 50 });
    ctx.m = { ...ctx.m, z: -100 };
    ctx.report();
    // Lot C1: at rest there, a second report.
    ctx.report();
    const err = await ctx.req('zeroZ', { nonce: ticket.nonce }).then(() => null, (e) => e);
    expect(err).toMatchObject({ code: 'ETOUCH_PLATE_TRAVEL', params: { search: '50', max: '28' } });
    expect(ctx.lines()).toEqual([]);
    expect(ctx.state().probing).toBe(false);
  });

  test('C-07 a machine whose Z travel is not known ($22=0: never referenced) keeps the plate probe as before', async () => {
    const ctx = setup({ x: 150, y: 120, z: -60 });
    ctx.c.settings.settings.$22 = '0';
    ctx.report();
    await ctx.start({ thickness: 10, search: 100 });
    expect(ctx.lines()).toEqual(['G38.2 Z-45 F100']);
  });

  test('C-17 the stream of the tablet that launched the probe closes during the descent: stopped at once', async () => {
    const ctx = setup({ x: 150, y: 120, z: -100 });
    await ctx.launch({ thickness: 10, search: 20 });
    expect(ctx.lines()).toEqual(['G38.2 Z-5 F100']);
    expect(ctx.state().probing).toBe(true);
    expect(ctx.service.ticketPending('tA')).toBe(true);
    expect(ctx.service.ticketPending('tB')).toBe(false);
    ctx.service.closeTransport('tA');
    expect(ctx.names()).toEqual(expect.arrayContaining(['feeder:stop', 'gcode:stop', 'feedhold']));
    ctx.active = 'Idle';
    await ctx.tick(300);
    ctx.banner();
    await ctx.tick(100);
    expect(ctx.outcome.err).toMatchObject({ code: 'ETOUCH_PLATE_STREAM', message: 'Palpage arrêté : la tablette qui l’a lancé ne suit plus la machine (connexion perdue). Le zéro Z n’est pas réglé.' });
    expectCatalogMatch(ctx.outcome.err);
    expect(ctx.state().zeroZ).toMatchObject({ code: 'ETOUCH_PLATE_STREAM', failed: ctx.outcome.err.message });
    expect(ctx.lines()).toEqual(['G38.2 Z-5 F100']);
  });

  test('C-17 a rotation of the stream reopened within 3 s goes on; one not reopened stops the probe after 3 s', async () => {
    let ctx = setup({ x: 150, y: 120, z: -100 });
    await ctx.launch({ thickness: 10, search: 20 });
    ctx.service.closeTransport('tA', true);
    await ctx.tick(1000);
    ctx.service.openTransport('tA2', A);
    await ctx.tick(3000);
    expect(ctx.stops()).toEqual([]);
    expect(ctx.state().probing).toBe(true);
    services.splice(0).forEach((service) => service.dispose());

    ctx = setup({ x: 150, y: 120, z: -100 });
    await ctx.launch({ thickness: 10, search: 20 });
    ctx.service.closeTransport('tA', true);
    await ctx.tick(2800);
    expect(ctx.stops()).toEqual([]);
    await ctx.tick(400);
    expect(ctx.names()).toContain('feedhold');
    ctx.active = 'Idle';
    await ctx.tick(300);
    ctx.banner();
    await ctx.tick(100);
    expect(ctx.outcome.err.code).toBe('ETOUCH_PLATE_STREAM');
  });

  test('C-17 another device takes control during the descent: stopped at once', async () => {
    const ctx = setup({ x: 150, y: 120, z: -100 });
    await ctx.launch({ thickness: 10, search: 20 });
    expect(ctx.control.inspect('TEST').owner).toMatchObject({ id: 'tablette-A' });
    await ctx.req('control', { operation: 'takeover', reason: 'essai de reprise en main' }, B);
    expect(ctx.control.inspect('TEST').owner).toMatchObject({ id: 'tablette-B' });
    expect(ctx.names()).toContain('feedhold');
    ctx.active = 'Idle';
    await ctx.tick(300);
    ctx.banner();
    await ctx.tick(100);
    expect(ctx.outcome.err).toMatchObject({ code: 'ETOUCH_PLATE_CONTROL' });
    expectCatalogMatch(ctx.outcome.err);
  });

  test('C-17 another open stream of the confirming device keeps the probe watched', async () => {
    const ctx = setup({ x: 150, y: 120, z: -100 });
    await ctx.launch({ thickness: 10, search: 20 });
    ctx.service.openTransport('tA2', A);
    expect(ctx.service.ticketPending('tA2')).toBe(true);
    ctx.service.closeTransport('tA');
    await ctx.tick(500);
    expect(ctx.stops()).toEqual([]);
    ctx.service.closeTransport('tA2');
    expect(ctx.names()).toContain('feedhold');
    ctx.active = 'Idle';
    await ctx.tick(300);
    ctx.banner();
    await ctx.tick(100);
    expect(ctx.outcome.err.code).toBe('ETOUCH_PLATE_STREAM');
  });

  test('C-17 the reports stop for more than 2.5 s: stopped', async () => {
    const ctx = setup({ x: 150, y: 120, z: -100 });
    await ctx.launch({ thickness: 10, search: 20 });
    await silence(ctx, 2400);
    expect(ctx.stops()).toEqual([]);
    await silence(ctx, 300);
    expect(ctx.names()).toContain('feedhold');
    ctx.active = 'Idle';
    await ctx.tick(300);
    ctx.banner();
    await ctx.tick(100);
    expect(ctx.outcome.err).toMatchObject({ code: 'ETOUCH_PLATE_STALE' });
    expectCatalogMatch(ctx.outcome.err);
  });

  test('C-17 a line past its time limit (search 20 mm at 100 mm/min, plus 15 s) is stopped, not only given up', async () => {
    const ctx = setup({ x: 150, y: 120, z: -100 });
    await ctx.launch({ thickness: 10, search: 20 });
    // The board says Run and never answers the G38.2.
    await ctx.tick(26000);
    expect(ctx.stops()).toEqual([]);
    await ctx.tick(1500);
    expect(ctx.names()).toContain('feedhold');
    ctx.active = 'Idle';
    await ctx.tick(300);
    ctx.banner();
    await ctx.tick(100);
    expect(ctx.outcome.err).toMatchObject({ code: 'ETOUCH_PLATE_TIMEOUT' });
    expectCatalogMatch(ctx.outcome.err);
  });

  test('C-55 a probe failed at rest without a reset (no clear contact): G0 without any axis word, so G38.2 does not stay the motion mode', async () => {
    const ctx = setup({ x: 150, y: 120, z: -100 });
    await ctx.launch({ thickness: 10, search: 20 });
    // The G38.2 answered without moving (no clear contact).
    ctx.active = 'Idle';
    ctx.c.runner.emit('ok');
    await ctx.tick(300);
    expect(ctx.outcome.err.message).toMatch(/^Palpage sans contact net/);
    expect(ctx.lines()).toEqual(['G38.2 Z-5 F100', 'G0']);
    expect(ctx.state().probing).toBe(false);
  });
});
// Real protocol through GrblRunner and the repository's LUNYEE simulator, without a port.
test('S4 two Idle reports after the ok are required before the plate retract leaves', async () => {
  const ctx = setup({ x: 150, y: 120, z: -100 });
  await ctx.launch({ thickness: 10, search: 20 });
  ctx.m = { ...ctx.m, z: -105 };
  ctx.active = 'Idle';
  // Reports before the ok do not count either.
  await ctx.tick(100);
  expect(ctx.lines()).toEqual(['G38.2 Z-5 F100']);
  ctx.c.runner.emit('ok');
  // Lot C1: CNCjs's $G exchange after the ok (M5); the two reports below stay what releases the line.
  ctx.gc();
  ctx.now += 100;
  await jest.advanceTimersByTimeAsync(100);
  expect(ctx.lines()).toEqual(['G38.2 Z-5 F100']);
  ctx.report();
  ctx.now += 100;
  await jest.advanceTimersByTimeAsync(100);
  expect(ctx.lines()).toEqual(['G38.2 Z-5 F100']);
  ctx.report();
  ctx.now += 100;
  await jest.advanceTimersByTimeAsync(100);
  expect(ctx.lines()).toEqual(['G38.2 Z-5 F100', 'G0 Z11']);
});

test('S4 C-19 the plate refuses an announced homing before its first Home report', async () => {
  const ctx = setup({ x: 150, y: 120, z: -100 });
  const ticket = await ctx.req('prepare', { operation: 'home' });
  await ctx.req('home', { nonce: ticket.nonce });
  expect(ctx.c.state.status.activeState).toBe('Idle');
  await expect(ctx.req('prepare', { operation: 'zeroZ', thickness: 10, search: 20 })).rejects.toMatchObject({ code: 'ETOUCH_MOTION_HOMING' });
  expect(ctx.lines()).toEqual([]);
});

describe('plate probe on the LUNYEE simulator', () => {
  let sim;
  let c;
  let service;
  const wait = (ms) => new Promise((resolve) => {
 setTimeout(resolve, ms);
});
  const until = async (check) => {
    const deadline = Date.now() + 12000;
    while (!check() && Date.now() < deadline) {
      // eslint-disable-next-line no-await-in-loop
      await wait(25);
    }
    expect(check()).toBe(true);
  };
  const state = () => service.list()[0];
  const req = (action, extra = {}) => service.action({ port: 'SIM', generation: state().generation, transportId: 'tA', action, ...extra }, A);
  beforeEach(async () => {
    jest.useRealTimers();
    sim = new GrblSimulator({ profile: 'lunyee', homingMs: 1200 });
    c = bridge(sim);
    // No sender or feeder queue on this bench; these commands empty those queues in CNCjs.
    const command = c.command;
    c.command = (name, ...args) => {
      if (name !== 'feeder:stop' && name !== 'gcode:stop') {
        command(name, ...args);
      }
    };
    service = createService(
      { get: () => ({ SIM: c }) },
      { get: (key) => ({ events: [], macros: [], 'touch.motion.enabled': true }[key]) },
      undefined,
{ control: createControl(), workOffset: provenOffset }
    );
    service.list();
    service.openTransport('tA', A);
    await until(() => state().fresh);
    const ticket = await req('prepare', { operation: 'home' });
    await req('home', { nonce: ticket.nonce });
    await until(() => state().homed && state().canZeroZ);
  });
  afterEach(() => {
    if (service) {
 service.dispose();
}
    if (c) {
 c.close();
}
    if (sim) {
 sim.stopPlannerExecutor();
}
  });

  test('C-07 a search below the LUNYEE travel is refused before the board can raise ALARM:2', async () => {
    c.command('gcode', 'G53 G0 Z-60');
    // Lot C1: and seen at rest there (two reports), the plate ready again.
    await until(() => state().activeState === 'Idle' && Number(state().coordinates.mpos.z) === -60 && state().canZeroZ);
    const before = c.written.slice();
    await expect(req('prepare', { operation: 'zeroZ', thickness: 1, search: 100 })).rejects.toMatchObject({
      code: 'ETOUCH_PLATE_TRAVEL', params: { search: '100', max: '68' }
    });
    expect(c.written).toEqual(before);
    expect(state()).toMatchObject({ homed: true, activeState: 'Idle' });
  }, 20000);

  test('a bounded search completes both touches and sets Z without an alarm', async () => {
    const ticket = await req('prepare', { operation: 'zeroZ', thickness: 1, search: 5 });
    await req('zeroZ', { nonce: ticket.nonce });
    expect(c.written.filter((line) => /^G38/.test(line))).toHaveLength(2);
    expect(c.written).toContain('G10 L20 P0 Z1\n');
    expect(state()).toMatchObject({ probing: false, homed: true, activeState: 'Idle', zeroZ: { thickness: 1 } });
  }, 20000);

  test('C-17 losing the stream during a descent sends hold and reset and no later probe line', async () => {
    const ticket = await req('prepare', { operation: 'zeroZ', thickness: 1, search: 20 });
    const result = req('zeroZ', { nonce: ticket.nonce }).then(() => null, (err) => err);
    await until(() => state().activeState === 'Run');
    service.closeTransport('tA');
    const err = await result;
    expect(err).toMatchObject({ code: 'ETOUCH_PLATE_STREAM' });
    expect(c.written).toEqual(expect.arrayContaining(['!', '\x18']));
    expect(c.written.filter((line) => /^G38/.test(line))).toHaveLength(1);
    expect(c.written.some((line) => /^G10/.test(line))).toBe(false);
    expect(state().probing).toBe(false);
  }, 20000);
});
