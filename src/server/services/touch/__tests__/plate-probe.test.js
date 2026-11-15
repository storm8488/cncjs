/* eslint-env jest */
// Z zero with a touch plate (plate-probe.js): how every stop ends the sequence (Arrêter, a socket
// stop, the lease changed, a line still in flight), on a fake board whose reports and answers the
// test gives one by one. LUNYEE settings, machine homed, work offset taken as proven
// (provenOffset). Converted from the proof tests bughunt-V1-2 and bughunt-V1-3.
import { EventEmitter } from 'events';
import { createService } from '../job-service';
import { createControl } from '../control';
import { provenOffset } from './support/proven-offset';

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
  };
  return c;
};

const services = [];
afterEach(() => {
  services.splice(0).forEach((service) => service.dispose());
  jest.useRealTimers();
});

// Machine homed, at rest, probe free, the tool at machine position `m`.
const setup = (m) => {
  jest.useFakeTimers();
  const ctx = { now: 10000, c: fakeController(), m: { ...m }, active: 'Idle' };
  ctx.control = createControl({ now: () => ctx.now, elapsed: () => ctx.now });
  ctx.service = createService(
    { get: () => ({ TEST: ctx.c }) },
    { get: (key) => ({ macros: [], events: [], 'touch.machines': [], 'touch.motion.enabled': true }[key]) },
    () => ctx.now,
    { control: ctx.control, workOffset: provenOffset }
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
      wpos: { x: f3(at.x - G54.x), y: f3(at.y - G54.y), z: f3(at.z - G54.z) }
    };
    ctx.c.runner.emit('status', { raw: '<' + active + '|MPos:' + f3(at.x) + ',' + f3(at.y) + ',' + f3(at.z) + '|FS:0,0>' });
  };
  ctx.modal = () => {
    ctx.c.state.parserstate = { modal: { motion: 'G0', wcs: 'G54', units: 'G21', distance: 'G90', spindle: 'M5', feedrate: 'G94' }, feedrate: '0', spindle: '0' };
    ctx.c.runner.emit('parserstate', ctx.c.state.parserstate);
  };
  // Time goes by: one report every 50 ms, like CNCjs's poll.
  ctx.tick = async (ms) => {
    for (let t = 0; t < ms; t += 50) {
      ctx.now += 50;
      ctx.report();
      // eslint-disable-next-line no-await-in-loop
      await jest.advanceTimersByTimeAsync(50);
    }
  };
  ctx.report('Home', { x: 0, y: 0, z: 0 });
  ctx.report('Idle', { x: 0, y: 0, z: 0 });
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

describe('plate probe: every stop ends the sequence (PLAN-CORRECTIONS § 1.6)', () => {
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
