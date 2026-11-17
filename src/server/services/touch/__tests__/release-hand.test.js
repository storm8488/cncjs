/* eslint-env jest */
// F4 "Rendre la main": the owner of the lease gives it back from the tablet. Free port afterwards:
// another device takes it without a reason; refused while a job runs or is paused, with its code;
// any sequence of ours (jog, step) is cancelled in the same step; Pause and Stop never need it.
import { EventEmitter } from 'events';
import { createService } from '../job-service';
import { createControl } from '../control';
import { provenOffset } from './support/proven-offset';
import { expectCatalogMatch } from './touch-codes-catalog';

const fakeController = (port = 'TEST') => {
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
    settings: {
      version: '1.1h',
      settings: { $10: '1', $13: '0', $22: '1', $23: '0', $110: '1000', $111: '1000', $112: '500', $130: '400', $131: '400', $132: '80' }
    },
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
  };
  return c;
};

const A = { kind: 'touch', id: 'tablet-A', label: 'Tablette A', user: 'op' };
const B = { kind: 'touch', id: 'tablet-B', label: 'Poste PC', user: 'op' };

const services = [];
afterEach(() => {
  services.splice(0).forEach((service) => service.dispose());
  jest.useRealTimers();
});

const setup = () => {
  jest.useFakeTimers();
  const ctx = { now: 10000, c: fakeController() };
  ctx.controllers = { TEST: ctx.c };
  ctx.control = createControl({ now: () => ctx.now, elapsed: () => ctx.now });
  ctx.service = createService(
    { get: () => ctx.controllers },
    { get: (key) => ({ 'touch.motion.enabled': true, events: [], macros: [] }[key]) },
    () => ctx.now,
    { workOffset: provenOffset, control: ctx.control, history: { record: () => null } }
  );
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
  ctx.req = (action, extra = {}, actor = A) => ctx.service.action({
    port: 'TEST', generation: ctx.generation, transportId: actor === B ? 'tB' : 'tA', action, ...extra
  }, actor);
  ctx.state = () => ctx.service.list()[0];
  ctx.cancels = () => ctx.c.written.filter((b) => b === '\x85').length;
  ctx.report();
  // A homing seen complete: the reference guards pass.
  ctx.c.state.status.activeState = 'Home';
  ctx.report();
  ctx.c.state.status.activeState = 'Idle';
  ctx.report();
  return ctx;
};

const HOLD = { axis: 'X', direction: 1, feed: 500 };
const STEP = { axis: 'X', direction: 1, step: 10, feed: 100 };

describe('F4 · Rendre la main', () => {
  test('the owner gives the hand back at rest; another device then takes it without any reason', async () => {
    const ctx = setup();
    await ctx.req('motion', { operation: 'jog', ...STEP }, A);
    ctx.ok();
    ctx.tick(200);
    expect(ctx.state().control.owner).toMatchObject({ id: 'tablet-A' });
    const out = await ctx.req('control', { operation: 'release' }, A);
    expect(out).toMatchObject({ owner: null });
    expect(ctx.state().control).toMatchObject({ owner: null, lastChange: { type: 'release', previous: { id: 'tablet-A' }, by: { id: 'tablet-A' } } });
    // No reason asked: a free port is claimed as it always was.
    await expect(ctx.req('control', { operation: 'claim' }, B)).resolves.toMatchObject({ owner: { id: 'tablet-B' } });
    expect(ctx.state().control.lastChange).toMatchObject({ type: 'claim' });
    // And the previous owner is now an observer, told who holds it.
    await expect(ctx.req('control', { operation: 'release' }, A)).rejects.toMatchObject({ code: 'ECONTROL' });
  });

  test.each([['running', 'Run'], ['paused', 'Hold']])('refused while a job is %s: code, reason, the lease stays', async (workflow, activeState) => {
    const ctx = setup();
    await ctx.req('motion', { operation: 'jog', ...STEP }, A);
    ctx.ok();
    ctx.tick(200);
    ctx.c.workflow.state = workflow;
    ctx.c.state.status.activeState = activeState;
    ctx.tick(50);
    let error;
    try {
      await ctx.req('control', { operation: 'release' }, A);
    } catch (e) {
      error = e;
    }
    expect(error).toMatchObject({ status: 409, code: 'ETOUCH_CONTROL_JOB' });
    expect(error.message).toMatch(/usinage/);
    expectCatalogMatch({ code: error.code, params: error.params, message: error.message });
    expect(ctx.state().control.owner).toMatchObject({ id: 'tablet-A' });
    expect(ctx.state().control.lastChange).not.toMatchObject({ type: 'release' });
    // Pause and Stop are never affected, and the refusal ends with the job.
    ctx.c.workflow.state = 'idle';
    ctx.c.state.status.activeState = 'Idle';
    ctx.tick(50);
    await expect(ctx.req('control', { operation: 'release' }, A)).resolves.toMatchObject({ owner: null });
  });

  test('another device that is not the owner gets the control refusal, not the job one', async () => {
    const ctx = setup();
    await ctx.req('motion', { operation: 'jog', ...STEP }, A);
    ctx.ok();
    ctx.tick(200);
    ctx.c.workflow.state = 'running';
    ctx.c.state.status.activeState = 'Run';
    ctx.tick(50);
    await expect(ctx.req('control', { operation: 'release' }, B)).rejects.toMatchObject({ code: 'ECONTROL' });
    expect(ctx.state().control.owner).toMatchObject({ id: 'tablet-A' });
  });

  test('a free port: releasing during a job changes nothing and is not refused', async () => {
    const ctx = setup();
    ctx.c.workflow.state = 'running';
    ctx.c.state.status.activeState = 'Run';
    ctx.tick(50);
    expect(ctx.state().control.owner).toBeNull();
    await expect(ctx.req('control', { operation: 'release' }, A)).resolves.toMatchObject({ owner: null });
  });

  test('a continuous jog of the owner is cancelled (0x85) in the same step as the release', async () => {
    const ctx = setup();
    await ctx.req('motion', { operation: 'jog-start', ...HOLD }, A);
    ctx.ok();
    ctx.c.state.status.activeState = 'Jog';
    ctx.tick(100);
    expect(ctx.cancels()).toBe(0);
    await ctx.req('control', { operation: 'release' }, A);
    expect(ctx.cancels()).toBe(1);
    expect(ctx.state().motion.lastJog).toMatchObject({ result: 'cancelled', reason: 'released' });
    ctx.tick(100);
    expect(ctx.state().control.owner).toBeNull();
  });

  test('a discrete step in flight is cancelled by the release too', async () => {
    const ctx = setup();
    await ctx.req('motion', { operation: 'jog', ...STEP }, A);
    ctx.ok();
    ctx.c.state.status.activeState = 'Jog';
    ctx.tick(200);
    expect(ctx.cancels()).toBe(0);
    await ctx.req('control', { operation: 'release' }, A);
    expect(ctx.cancels()).toBeGreaterThanOrEqual(1);
    expect(ctx.state().motion.lastJog.reason).toBe('released');
  });

  test('nothing moving: the release sends nothing to the board', async () => {
    const ctx = setup();
    await ctx.req('motion', { operation: 'jog', ...STEP }, A);
    ctx.ok();
    ctx.c.state.status.activeState = 'Idle';
    ctx.tick(200);
    const before = ctx.c.commands.length;
    await ctx.req('control', { operation: 'release' }, A);
    expect(ctx.c.commands.length).toBe(before);
  });
});
