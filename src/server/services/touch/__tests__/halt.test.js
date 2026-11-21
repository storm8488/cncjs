/* eslint-env jest */
import { createHalt } from '../halt';

const setup = () => {
  jest.useFakeTimers();
  const c = { options: { port: 'TEST' }, isClose: () => false, runner: {}, state: { status: { activeState: 'Run' } }, command: jest.fn() };
  c.runner.state = c.state;
  const r = { startups: 0, reports: 10 };
  const service = createHalt({
    clock: () => Date.now(),
    controllers: () => ({ TEST: c }),
    record: () => r,
    later: (controller, record, fn, ms) => setTimeout(fn, ms),
    spindleOn: () => false
  });
  return { c, r, ...service };
};

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('S4 deferred halt belongs to the board session that requested it (C-39)', () => {
  test.each(['hold', 'settle'])('%s: a banner without a newer report drops the late reset, even past the deadline', (plan) => {
    const ctx = setup();
    ctx.halt(ctx.c, plan);
    ctx.r.startups += 1;
    jest.advanceTimersByTime(6000);
    expect(ctx.c.command).not.toHaveBeenCalledWith('reset');
    expect(jest.getTimerCount()).toBe(0);
  });

  test.each(['hold', 'settle'])('%s: a banner followed by Idle drops the late reset', (plan) => {
    const ctx = setup();
    ctx.halt(ctx.c, plan);
    ctx.r.startups += 1;
    ctx.r.reports += 1;
    ctx.c.state.status.activeState = 'Idle';
    jest.advanceTimersByTime(100);
    expect(ctx.c.command).not.toHaveBeenCalledWith('reset');
    expect(jest.getTimerCount()).toBe(0);
  });

  test.each(['hold', 'settle'])('%s: without a banner the newer Idle report still triggers the reset', (plan) => {
    const ctx = setup();
    ctx.halt(ctx.c, plan);
    ctx.r.reports += 1;
    ctx.c.state.status.activeState = 'Idle';
    jest.advanceTimersByTime(100);
    expect(ctx.c.command).toHaveBeenCalledWith('reset');
  });
});
