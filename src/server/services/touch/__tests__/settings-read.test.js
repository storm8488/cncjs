/* eslint-env jest */
import { EventEmitter } from 'events';
import GrblSimulator from '../../../../../grbl-simulator/grbl-simulator';
import { createService } from '../job-service';
import { bridge } from './support/sim-bridge';
import { provenOffset } from './support/proven-offset';
import { createWorkOffset } from '../work-offset';
import { expectCatalogMatch } from './touch-codes-catalog';

const A = { kind: 'touch', id: 'tablet', user: 'op' };
const services = [];
afterEach(() => {
  services.splice(0).forEach((s) => s.dispose());
  jest.useRealTimers();
});

const setup = ({ state = 'Idle', version = '', settings = { $13: '0' }, workOffset = provenOffset } = {}) => {
  jest.useFakeTimers();
  const ctx = { now: 10000, queued: false };
  const c = {
    type: 'Grbl',
options: { port: 'TEST' },
ready: true,
isClose: () => false,
    runner: new EventEmitter(),
sender: new EventEmitter(),
    workflow: Object.assign(new EventEmitter(), { state: 'idle' }),
    settings: { version, settings },
written: [],
    feeder: { toJSON: () => ({ queue: ctx.queued ? 1 : 0, pending: false }) },
    command: jest.fn(),
writeln: jest.fn((line) => c.written.push(line))
  };
  c.runner.state = { status: { activeState: state, spindle: 0 }, parserstate: { modal: { wcs: 'G54' } } };
  c.sender.state = { name: '', context: {}, total: 0 };
  c.sender.toJSON = () => c.sender.state;
  ctx.c = c;
  ctx.service = createService({ get: () => ({ TEST: c }) }, { get: () => undefined }, () => ctx.now, { workOffset });
  services.push(ctx.service);
  ctx.state = () => ctx.service.list()[0];
  ctx.generation = ctx.state().generation;
  ctx.service.openTransport('t', A);
  ctx.req = (action, extra = {}) => ctx.service.action({ action, port: 'TEST', transportId: 't', generation: ctx.generation, ...extra }, A);
  ctx.report = () => c.runner.emit('status', { raw: '<' + c.runner.state.status.activeState + '|MPos:0,0,0|FS:0,0>' });
  ctx.tick = (ms) => {
    for (let t = 0; t < ms; t += 100) {
      ctx.now += 100;
      ctx.report();
      ctx.service.observe();
      jest.advanceTimersByTime(100);
    }
  };
  ctx.report();
  return ctx;
};

describe('D4: version and settings reads', () => {
  test.each(['Idle', 'Alarm'])('unknown version is read automatically in %s, at most three times, 5 seconds apart', (state) => {
    const ctx = setup({ state });
    ctx.tick(100);
    expect(ctx.c.written).toEqual(['$I']);
    const refusal = ctx.service.socketRefusal('TEST');
    expect(refusal.code).toBe('ETOUCH_SETTINGS_READING');
    expectCatalogMatch(refusal);
    ctx.tick(4800);
    expect(ctx.c.written).toHaveLength(1);
    ctx.tick(200);
    expect(ctx.c.written).toHaveLength(2);
    ctx.tick(20000);
    expect(ctx.c.written).toEqual(['$I', '$I', '$I']);
    ctx.c.runner.emit('startup', {});
    ctx.tick(100);
    expect(ctx.c.written).toHaveLength(4);
  });

  test('the read reserves guarded actions until its own ok; D2 cannot interleave', async () => {
    const checking = jest.fn(() => false);
    const tick = jest.fn();
    const offset = () => ({ ...provenOffset(), checking, tick });
    const ctx = setup({ workOffset: offset });
    ctx.tick(100);
    await expect(ctx.req('readSettings')).rejects.toMatchObject({ code: 'ETOUCH_SETTINGS_READING' });
    expect(ctx.state()).toMatchObject({ canReadSettings: false, refusals: { readSettings: { code: 'ETOUCH_SETTINGS_READING' } } });
    expect(() => ctx.service.reserveSystemCommand({ title: 'test' })).toThrow(/Commandes en attente/);
    ctx.c.runner.emit('raw', { raw: '[VER:1.1f.20231030:]' });
    ctx.c.runner.emit('ok');
    ctx.tick(100);
    expect(ctx.state().canReadSettings).toBe(true);
    expect(ctx.service.socketRefusal('TEST')).toBeNull();
    expect(ctx.c.command).not.toHaveBeenCalled();
  });

  test('manual read uses writeln in Alarm, serializes $I then $$ and exposes its reason', async () => {
    const ctx = setup({ state: 'Alarm', version: '1.1f' });
    expect(ctx.state()).toMatchObject({ canReadSettings: true, readSettingsReason: '' });
    await ctx.req('readSettings');
    expect(ctx.c.written).toEqual(['$$']);
    expect(ctx.c.command).not.toHaveBeenCalled();
    ctx.c.runner.emit('ok');
    ctx.tick(100);
    expect(ctx.state().canReadSettings).toBe(true);
  });

  test('missing settings cause $$ after $I is acknowledged, never before', () => {
    const ctx = setup({ settings: {} });
    ctx.tick(100);
    expect(ctx.c.written).toEqual(['$I']);
    ctx.c.runner.emit('ok');
    ctx.tick(100);
    expect(ctx.c.written).toEqual(['$I', '$$']);
    ctx.c.settings.settings = { $13: '0' };
    ctx.c.runner.emit('raw', { raw: '[VER:1.1f:]' });
    ctx.c.runner.emit('ok');
    ctx.tick(10000);
    expect(ctx.c.written).toHaveLength(2);
  });

  test.each(['running', 'paused', 'queue', 'offset', 'stale'])('no automatic write during %s', (mode) => {
    const ctx = setup({ workOffset: () => ({ ...provenOffset(), checking: () => mode === 'offset' }) });
    if (['running', 'paused'].includes(mode)) {
 ctx.c.workflow.state = mode;
}
    if (mode === 'queue') {
 ctx.queued = true;
}
    if (mode === 'stale') {
 ctx.now += 3000;
}
    ctx.service.observe();
    expect(ctx.c.written).toEqual([]);
  });

  test('write exceptions do not reserve the machine or leak answer listeners', () => {
    const ctx = setup();
    ctx.c.writeln.mockImplementation(() => {
 throw new Error('port gone');
});
    const count = ctx.c.runner.listenerCount('ok');
    expect(() => ctx.tick(100)).not.toThrow();
    expect(ctx.c.runner.listenerCount('ok')).toBe(count);
    expect(ctx.service.socketRefusal('TEST')).toBeNull();
  });

  test('a pending confirmation blocks automatic reads; a new session can read afterwards', async () => {
    const ctx = setup({ version: '1.1f', settings: { $22: '1', $13: '0' } });
    await ctx.req('prepare', { operation: 'home' });
    ctx.c.settings.version = '';
    ctx.tick(1000);
    expect(ctx.c.written).toEqual([]);
    ctx.service.closeTransport('t', true);
    ctx.service.openTransport('t', A);
    ctx.tick(100);
    expect(ctx.c.written).toEqual(['$I']);
  });

  test('real D2 waits until the settings answer has been consumed', () => {
    const ctx = setup({ workOffset: createWorkOffset });
    ctx.service.observe();
    ctx.now += 1;
    ctx.c.runner.emit('parserstate', { modal: { wcs: 'G54' } });
    ctx.c.runner.emit('ok'); // answer to CNCjs's $G, not to $I
    ctx.report();
    expect(ctx.c.written).toEqual(['$I']);
    expect(ctx.c.command).not.toHaveBeenCalled();
    ctx.c.runner.emit('raw', { raw: '[VER:1.1f:]' });
    ctx.c.runner.emit('ok');
    ctx.tick(200);
    expect(ctx.c.command).toHaveBeenCalledWith('gcode', '$#');
  });

  test.each(['Idle', 'Alarm'])('LUNYEE silent connection learns the version in %s through the real Grbl parser', async (state) => {
    jest.useRealTimers();
    const sim = new GrblSimulator({ profile: 'lunyee' });
    sim.machineState = state;
    const c = bridge(sim, { silentConnect: true });
    const service = createService({ get: () => ({ SIM: c }) }, { get: () => undefined });
    services.push(service);
    service.list();
    try {
      await new Promise((resolve) => {
 setTimeout(resolve, 150);
});
      service.observe();
      await new Promise((resolve) => {
 setTimeout(resolve, 150);
});
      expect(c.written).toContain('$I\n');
      expect(service.list()[0].firmware).toMatch(/1\.1/);
    } finally {
      c.close();
    }
  });
});
