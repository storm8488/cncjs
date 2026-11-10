/* eslint-env jest */
// Rehearsal before the CNC trial (2026-11), second file: Arrêter during $H with the reset byte lost
// (E2 / N6, not reproducible on the simulator, SIM-11) and the retract of the
// plate probe against the start height. Real touch job service, fake
// controller of the repository's own tests.
import { EventEmitter } from 'events';
import { createService } from '../job-service';

const fakeController = (port = 'TEST') => {
  const c = {
    type: 'Grbl',
    options: { port },
    ready: true,
    isClose: () => false,
    runner: new EventEmitter(),
    sender: new EventEmitter(),
    workflow: Object.assign(new EventEmitter(), { state: 'idle' }),
    state: { status: { activeState: 'Idle' } },
    feeder: { toJSON: () => ({ queue: 0, pending: false }) },
    settings: { settings: { $13: 0, $22: 1, $110: 1000, $111: 1000, $112: 200 } },
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

const setup = (c = fakeController(), clock) => {
  const ctx = { now: 10000, c };
  ctx.controllers = { TEST: ctx.c };
  ctx.service = createService({ get: () => ctx.controllers }, { get: (key) => ({ macros: [], events: [] }[key]) }, clock || (() => ctx.now), { files: {} });
  services.push(ctx.service);
  ctx.generation = ctx.service.list()[0].generation;
  ctx.service.openTransport('t');
  ctx.req = (action, extra = {}) => ctx.service.action({ port: 'TEST', generation: ctx.generation, transportId: 't', action, ...extra });
  ctx.report = () => ctx.c.runner.emit('status');
  ctx.state = () => ctx.service.list()[0];
  return ctx;
};

describe('E2 / N6: Arrêter during a homing cycle, the reset byte lost on the link', () => {
  test('Arrêter stays offered until the board shows it restarted (banner) or reports Idle / Alarm', async () => {
    const ctx = setup();
    ctx.report();
    const ticket = await ctx.req('prepare', { operation: 'home' });
    await ctx.req('home', { nonce: ticket.nonce });
    expect(ctx.c.commands.at(-1)).toEqual(['homing']);
    // Real Grbl 1.1 sends no report during $H: the last one still says Idle.
    ctx.now += 3000;
    expect(ctx.state()).toMatchObject({ homing: true, canStop: true });
    const answer = await ctx.req('stop');
    expect(ctx.c.commands.at(-1)).toEqual(['reset']);
    // N6: the sentence no longer asserts the interruption when the byte is written.
    expect(answer.message).toBe('Réinitialisation envoyée pour interrompre la prise d’origine. Vérifiez l’immobilisation ; la carte demandera $H ou $X.');
    // 0x18 lost (silent link): no banner, no report, the axes still home.
    ctx.now += 1000;
    expect(ctx.state().canStop).toBe(true);
    // A second Arrêter sends the reset again.
    await ctx.req('stop');
    expect(ctx.c.commands.filter((x) => x[0] === 'reset')).toHaveLength(2);
    // The banner (the reset arrived) ends it: no homing, nothing to stop, not homed.
    ctx.c.runner.emit('startup', {});
    ctx.c.state.status.activeState = 'Alarm';
    ctx.report();
    expect(ctx.state()).toMatchObject({ homing: false, canStop: false, homed: false });
  });

  test('unchanged: a cycle stopped by Arrêter is never taken for a completed homing by a later Idle report', async () => {
    const ctx = setup();
    ctx.report();
    const ticket = await ctx.req('prepare', { operation: 'home' });
    await ctx.req('home', { nonce: ticket.nonce });
    ctx.now += 3000;
    await ctx.req('stop');
    ctx.report();
    expect(ctx.state()).toMatchObject({ homing: false, homed: false });
  });
});

describe('Plate probe: retract after the contact against the start height', () => {
  // The fixture of job-service.test.js ('Z zero with a touch plate'), with the
  // tool 2.85 mm above the plate at the start, as on the rehearsal (step 17).
  const probeController = ({ plateZ, delay = 5 }) => {
    const c = fakeController();
    c.settings = { version: '1.1h', settings: { $13: 0, $22: 1, $30: 24000, $31: 6000, $110: 1000, $111: 1000, $112: 200 } };
    // Start: machine Z -1 (pull-off after $H, top of the Z travel), work Z 3.
    c.state.status = { activeState: 'Idle', wpos: { x: '0.000', y: '0.000', z: '3.000' }, mpos: { x: '-100.000', y: '-100.000', z: '-1.000' }, spindle: 0 };
    c.runner.state = c.state;
    c.state.parserstate = { modal: { motion: 'G0', wcs: 'G54', distance: 'G90', units: 'G21', spindle: 'M5' }, feedrate: '0' };
    c.sent = [];
    c.pinState = '';
    c.machineZ = [];
    const report = () => c.runner.emit('status', { raw: '<' + c.state.status.activeState + '|WPos:0,0,' + c.state.status.wpos.z + (c.pinState ? '|Pn:' + c.pinState : '') + '>' });
    c.report = report;
    const z = () => Number(c.state.status.wpos.z);
    const setZ = (v) => {
      const offset = Number(c.state.status.mpos.z) - z();
      c.state.status = { ...c.state.status, wpos: { ...c.state.status.wpos, z: v.toFixed(3) }, mpos: { ...c.state.status.mpos, z: (v + offset).toFixed(3) } };
      c.runner.state = c.state;
    };
    c.command = (name, ...args) => {
      if (name !== 'gcode') {
        return;
      }
      const line = args[0];
      c.sent.push(line);
      setTimeout(() => {
        report();
        c.runner.emit('parserstate', c.state.parserstate);
        c.runner.emit('ok');
      }, 1);
      setTimeout(() => {
        let m;
        if ((m = /^G38\.2 Z(-?[\d.]+) F(\d+)$/.exec(line))) {
          setZ(plateZ);
          c.pinState = 'P';
        } else if ((m = /^G0 Z(-?[\d.]+)$/.exec(line))) {
          setZ(Number(m[1]));
          c.pinState = '';
          c.machineZ.push(Number(c.state.status.mpos.z));
        } else if ((m = /^G10 L20 P0 Z(-?[\d.]+)$/.exec(line))) {
          c.state.status = { ...c.state.status, wpos: { ...c.state.status.wpos, z: Number(m[1]).toFixed(3) } };
          c.runner.state = c.state;
        }
        c.runner.emit('ok');
        report();
        setTimeout(report, delay);
        setTimeout(report, 2 * delay);
      }, delay);
    };
    return c;
  };

  test('the final retract (contact + 5 mm) never ends above the height the operator started from', async () => {
    const c = probeController({ plateZ: 0.15 });
    const ctx = setup(c, () => performance.now());
    c.runner.emit('parserstate', c.state.parserstate);
    c.report();
    const startMachineZ = Number(c.state.status.mpos.z);
    expect(ctx.state().zeroZReason).toBe('');
    const ticket = await ctx.req('prepare', { operation: 'zeroZ', thickness: 10, search: 20 });
    await ctx.req('zeroZ', { nonce: ticket.nonce });
    // -1 (start) - 2.85 (contact) + 5 (retract) would be +1.15, above machine
    // Z0 (the homing switch of Z): the retract ends at the start height.
    expect(c.sent.at(-1)).toBe('G0 Z12.85');
    expect(Math.max(...c.machineZ)).toBeLessThanOrEqual(startMachineZ);
  });

  test('witness: started well above the plate, the retract stays contact + 5 mm', async () => {
    const c = probeController({ plateZ: -10 });
    const ctx = setup(c, () => performance.now());
    c.runner.emit('parserstate', c.state.parserstate);
    c.report();
    const ticket = await ctx.req('prepare', { operation: 'zeroZ', thickness: 10, search: 20 });
    const answer = await ctx.req('zeroZ', { nonce: ticket.nonce });
    expect(c.sent.at(-1)).toBe('G0 Z15');
    expect(answer.message).toMatch(/Outil dégagé à Z 15\.$/);
  });
});
