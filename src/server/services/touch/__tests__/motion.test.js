/* eslint-env jest */
/* eslint-disable no-await-in-loop */ // keepalives and polls are sequential on purpose
import { EventEmitter } from 'events';
import { createService } from '../job-service';
import { createControl } from '../control';
import {
  capabilitiesOf, envelopeOf, limitsAt, maxFeedOf, grblVersion, jogLine, originLine, motionEnabled,
  DISABLED_MESSAGE, KEEPALIVE_TIMEOUT_MS, FALLBACK_MAX_FEED
} from '../motion';

// A fake Grbl controller: `written` holds the exact bytes GrblController
// would put on the serial line for the commands the service uses
// (gcode → line + '\n', jogCancel → 0x85). It never touches a port.
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
        mpos: { x: '-100.000', y: '-100.000', z: '-10.000' },
        wpos: { x: '5.000', y: '5.000', z: '2.000' }
      }
    },
    feeder: { toJSON: () => ({ queue: 0, pending: false }) },
    settings: {
      version: '1.1h',
      settings: { $13: '0', $22: '1', $23: '0', $110: '1000', $111: '1000', $112: '500', $130: '400', $131: '400', $132: '80' }
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
const B = { kind: 'touch', id: 'tablet-B', label: 'Tablette B', user: 'op' };

const services = [];
afterEach(() => {
  services.splice(0).forEach((service) => service.dispose());
  jest.useRealTimers();
});

const setup = ({ enabled = true, homed = false, hasKey = true } = {}) => {
  jest.useFakeTimers();
  const ctx = { now: 10000, enabled, c: fakeController(), history: [] };
  ctx.controllers = { TEST: ctx.c };
  ctx.control = createControl({ now: () => ctx.now, elapsed: () => ctx.now });
  ctx.service = createService(
    { get: () => ctx.controllers },
    { get: (key) => ({ ...(hasKey ? { 'touch.motion.enabled': ctx.enabled } : {}), events: [], macros: [] }[key]) },
    () => ctx.now,
    { control: ctx.control, history: { record: (event) => ctx.history.push(event) } }
  );
  services.push(ctx.service);
  ctx.generation = ctx.service.list()[0].generation;
  ctx.service.openTransport('tA', A);
  ctx.service.openTransport('tA2', A);
  ctx.service.openTransport('tB', B);
  ctx.report = () => ctx.c.runner.emit('status');
  ctx.modal = (wcs = 'G54') => ctx.c.runner.emit('parserstate', { modal: { wcs } });
  ctx.ok = () => ctx.c.runner.emit('ok');
  // Advances both clocks, with a status report every 50 ms like CNCjs's poll.
  ctx.tick = (ms, { reports = true } = {}) => {
    for (let t = 0; t < ms; t += 50) {
      ctx.now += 50;
      if (reports) {
        ctx.report();
      }
      jest.advanceTimersByTime(50);
    }
  };
  ctx.req = (action, extra = {}, actor = A, transportId = actor === B ? 'tB' : 'tA') => ctx.service.action({
    port: 'TEST', generation: ctx.generation, transportId, action, ...extra
  }, actor);
  ctx.motion = (operation, extra, actor, transportId) => ctx.req('motion', { operation, ...extra }, actor, transportId);
  ctx.state = () => ctx.service.list()[0];
  ctx.home = () => {
    ctx.c.state.status.activeState = 'Home';
    ctx.report();
    ctx.c.state.status.activeState = 'Idle';
    ctx.report();
  };
  // Settles a step: ok + Idle reports.
  ctx.settle = () => {
    ctx.ok();
    ctx.c.state.status.activeState = 'Idle';
    ctx.tick(150);
  };
  ctx.cancels = () => ctx.c.written.filter((b) => b === '\x85').length;
  ctx.report();
  if (homed) {
    ctx.home();
  }
  return ctx;
};

const STEP = { axis: 'X', direction: 1, step: 1, feed: 500 };
const HOLD = { axis: 'X', direction: 1, feed: 500 };
const J = '$J=G91 G21 X99 F500\n';

// Starts a continuous jog that Grbl acknowledged and reports in Jog.
const running = async (ctx, body = HOLD) => {
  const res = await ctx.motion('jog-start', body);
  ctx.ok();
  ctx.c.state.status.activeState = 'Jog';
  return res;
};

describe('motion capabilities (F1)', () => {
  test('Grbl 1.1 or later: jog, continuous jog, jog cancel and work origin, all experimental, enabled only by the setting', () => {
    ['Grbl 1.1h', 'Grbl 1.3a', 'Grbl 1.1f.20170801'].forEach((firmware) => {
      const caps = capabilitiesOf({ type: 'Grbl', firmware, enabled: true });
      ['jog', 'jogContinuous', 'jogCancel', 'setOrigin'].forEach((name) => {
        expect(caps[name]).toMatchObject({ supported: true, enabled: true, experimental: true, reason: '' });
      });
      expect(caps.jogCancel.command).toBe('0x85');
      expect(caps.setOrigin.command).toBe('G10 L20 P<n> <axe>0');
    });
    const off = capabilitiesOf({ type: 'Grbl', version: '1.1h', enabled: false });
    expect(off.jog).toMatchObject({ supported: true, enabled: false, experimental: true, reason: DISABLED_MESSAGE });
  });

  test('other controllers, Grbl 0.9 and an unknown version: false with a reason', () => {
    expect(capabilitiesOf({ type: 'Marlin', firmware: 'Marlin 2.1', enabled: true }).jog).toMatchObject({ supported: false, enabled: false, experimental: true, reason: expect.stringMatching(/Marlin/) });
    expect(capabilitiesOf({ type: 'TinyG', enabled: true }).setOrigin.supported).toBe(false);
    expect(capabilitiesOf({ type: 'Grbl', firmware: 'Grbl 0.9j', enabled: true }).jog).toMatchObject({ supported: false, reason: expect.stringMatching(/1\.1 ou plus/) });
    expect(capabilitiesOf({ type: 'Grbl', firmware: '', version: '', enabled: true }).jogContinuous).toMatchObject({ supported: false, reason: expect.stringMatching(/Version Grbl inconnue/) });
    expect(grblVersion('Grbl 1.1h')).toMatchObject({ major: 1, minor: 1 });
    expect(grblVersion('', undefined)).toBe(null);
  });

  test('travel, feed bounds and command lines', () => {
    const s = { $22: '1', $23: '2', $130: '400', $131: '300', $132: '' };
    // $23 bit set: standard Grbl [-T, 0] and Grbl_ESP32 / HOMING_FORCE_SET_ORIGIN [0, T] are both candidates.
    expect(envelopeOf(s, true)).toEqual({
      X: { candidates: [{ low: -400, high: 0 }], travel: 400, reason: '' },
      Y: { candidates: [{ low: -300, high: 0 }, { low: 0, high: 300 }], travel: 300, reason: '' },
      Z: { candidates: null, travel: null, reason: 'course $132 inconnue' }
    });
    expect(envelopeOf(s, false).X).toMatchObject({ candidates: null, reason: expect.stringMatching(/non constaté/) });
    expect(envelopeOf({ ...s, $22: '0' }, true).X.reason).toMatch(/\$22=0/);
    expect(envelopeOf({ ...s, $23: undefined }, true).X.reason).toMatch(/\$23 .* inconnu/);
    const y = envelopeOf(s, true).Y;
    expect(limitsAt(y, -299, 'Y')).toMatchObject({ limits: { low: -300, high: 0 } });
    expect(limitsAt(y, 5, 'Y')).toMatchObject({ limits: { low: 0, high: 300 } });
    expect(limitsAt(y, 0, 'Y')).toMatchObject({ limits: { low: 0, high: 0 } });
    expect(limitsAt(envelopeOf(s, true).X, 5, 'X')).toMatchObject({ limits: null, outside: true, reason: expect.stringMatching(/hors de la course supposée \(-400 → 0\)/) });
    expect(limitsAt(envelopeOf(s, true).X, null, 'X')).toMatchObject({ limits: null, reason: 'position machine X inconnue' });
    expect(maxFeedOf({ $110: '800' }, 'X')).toEqual({ max: 800, source: '$110' });
    expect(maxFeedOf({}, 'Z')).toEqual({ max: FALLBACK_MAX_FEED, source: 'fallback' });
    expect(jogLine('X', 1, 500)).toBe('$J=G91 G21 X1 F500');
    expect(jogLine('Y', -0.01, 200)).toBe('$J=G91 G21 Y-0.01 F200');
    expect(originLine(2, ['X', 'Z'])).toBe('G10 L20 P2 X0 Z0');
  });

  test('the setting is read through config and must be exactly true', () => {
    expect(motionEnabled({ get: (k) => (k === 'touch.motion.enabled' ? true : undefined) })).toBe(true);
    expect(motionEnabled({ get: () => 'true' })).toBe(false);
    expect(motionEnabled({ get: () => {
 throw new Error('x');
} })).toBe(false);
    expect(motionEnabled(null)).toBe(false);
  });
});

describe('real jog (F1)', () => {
  test('disabled by default: 409 with the supervised-validation message, nothing written; the dry-run preflight stays available', async () => {
    // No `touch.motion.enabled` in .cncrc (null: a default parameter would turn undefined into true).
    const ctx = setup({ enabled: null });
    await expect(ctx.motion('jog', STEP)).rejects.toMatchObject({ status: 409, message: DISABLED_MESSAGE });
    await expect(ctx.motion('jog-start', { axis: 'X', direction: 1, feed: 500 })).rejects.toMatchObject({ status: 409, message: DISABLED_MESSAGE });
    await expect(ctx.req('prepare', { operation: 'set-origin', axes: ['X'] })).rejects.toMatchObject({ status: 409, message: DISABLED_MESSAGE });
    expect(ctx.c.written).toEqual([]);
    const state = ctx.state();
    expect(state.capabilities.jog).toMatchObject({ supported: true, enabled: false, experimental: true });
    expect(state.motion).toMatchObject({ canJog: false, jogReason: DISABLED_MESSAGE, canSetOrigin: false });
    // The independent preflight still describes the jog and writes nothing.
    expect(ctx.service.previewMotion({ port: 'TEST', axis: 'X', direction: 1, step: 1, feed: 800 })).toMatchObject({ dryRun: true, gcode: '$J=G21 G91 X1 F800' });
    expect(ctx.c.commands).toEqual([]);
    // Releasing a button is always accepted.
    await expect(ctx.motion('jog-stop')).resolves.toMatchObject({ message: 'Aucun déplacement en cours.' });
  });

  test('a discrete step writes the exact jog line and claims the free port only after it succeeded', async () => {
    const ctx = setup();
    expect(ctx.state().control.owner).toBe(null);
    const res = await ctx.motion('jog', STEP);
    expect(ctx.c.written).toEqual(['$J=G91 G21 X1 F500\n']);
    expect(res.command).toBe('$J=G91 G21 X1 F500');
    expect(ctx.state().control.owner).toMatchObject({ kind: 'touch', id: 'tablet-A' });
    // The next move waits for Grbl's ok and a machine seen at rest after it.
    await expect(ctx.motion('jog', STEP)).rejects.toThrow(/non terminé/);
    ctx.ok();
    ctx.c.state.status.activeState = 'Jog';
    ctx.tick(100);
    await expect(ctx.motion('jog', STEP)).rejects.toThrow(/non terminé/);
    ctx.c.state.status.activeState = 'Idle';
    ctx.tick(100);
    await ctx.motion('jog', { axis: 'Y', direction: -1, step: 0.01, feed: 200 });
    expect(ctx.c.written.at(-1)).toBe('$J=G91 G21 Y-0.01 F200\n');
  });

  test('a refused step does not claim the port', async () => {
    const ctx = setup();
    await expect(ctx.motion('jog', { ...STEP, step: 0.5 })).rejects.toThrow(/pas invalide/);
    await expect(ctx.motion('jog', { ...STEP, feed: 5000 })).rejects.toThrow(/Avance hors limites pour X : de 1 à 1000 mm\/min/);
    expect(ctx.state().control.owner).toBe(null);
    expect(ctx.c.written).toEqual([]);
  });

  test('steps above 1 mm need a referenced machine with a known travel, and never leave it', async () => {
    const ctx = setup();
    await expect(ctx.motion('jog', { ...STEP, step: 10 })).rejects.toThrow(/Pas de 10 mm refusé.*référencement/);
    ctx.home();
    ctx.c.state.status.mpos.x = '-395.000';
    await expect(ctx.motion('jog', { ...STEP, direction: -1, step: 10 })).rejects.toThrow(/sortirait de la course \(-405 mm machine, course -400 → 0\)/);
    // A 1 mm step is checked against the travel too once it is known.
    ctx.c.state.status.mpos.x = '-0.500';
    await expect(ctx.motion('jog', STEP)).rejects.toThrow(/sortirait/);
    ctx.c.state.status.mpos.x = '-100.000';
    await ctx.motion('jog', { ...STEP, step: 10 });
    expect(ctx.c.written).toEqual(['$J=G91 G21 X10 F500\n']);
  });

  test('a 1 mm step without referencing is allowed (Grbl soft limits are the only bound then)', async () => {
    const ctx = setup();
    ctx.c.settings.settings.$22 = '0';
    await ctx.motion('jog', STEP);
    expect(ctx.c.written).toEqual(['$J=G91 G21 X1 F500\n']);
  });

  test('$13=1 or unknown, a stale report, an alarm, a job and pending commands are refused', async () => {
    const ctx = setup();
    ctx.c.settings.settings.$13 = '1';
    await expect(ctx.motion('jog', STEP)).rejects.toThrow(/\$13=1/);
    delete ctx.c.settings.settings.$13;
    await expect(ctx.motion('jog', STEP)).rejects.toThrow(/\$13 inconnu/);
    ctx.c.settings.settings.$13 = '0';

    ctx.now += 3000;
    await expect(ctx.motion('jog', STEP)).rejects.toThrow(/trop ancien/);
    ctx.report();

    ctx.c.state.status.activeState = 'Alarm';
    ctx.c.runner.emit('alarm', { message: '1' });
    await expect(ctx.motion('jog', STEP)).rejects.toThrow(/alarme \(ALARM:1\)/);
    ctx.c.state.status.activeState = 'Idle';

    ctx.c.workflow.state = 'running';
    await expect(ctx.motion('jog', STEP)).rejects.toThrow(/Travail en cours/);
    ctx.c.workflow.state = 'idle';

    ctx.c.feeder.toJSON = () => ({ queue: 1, pending: true });
    await expect(ctx.motion('jog', STEP)).rejects.toThrow(/en attente/);
    ctx.c.feeder.toJSON = () => ({ queue: 0, pending: false });

    ctx.c.state.status.activeState = 'Hold';
    await expect(ctx.motion('jog', STEP)).rejects.toThrow(/repos \(Idle\) : état Hold/);
    expect(ctx.c.written).toEqual([]);
  });

  test('feed: bounded by $110-$112, or by the documented fallback when unknown', async () => {
    const ctx = setup();
    delete ctx.c.settings.settings.$110;
    await expect(ctx.motion('jog', { ...STEP, feed: FALLBACK_MAX_FEED + 1 })).rejects.toThrow(/\$110 inconnu : limite prudente/);
    await expect(ctx.motion('jog', { ...STEP, axis: 'Z', feed: '200' })).rejects.toThrow(/Avance hors limites/);
    await expect(ctx.motion('jog', { ...STEP, axis: 'Z', feed: 501 })).rejects.toThrow(/de 1 à 500 mm\/min \(limite \$112\)/);
    await ctx.motion('jog', { ...STEP, feed: FALLBACK_MAX_FEED });
    expect(ctx.c.written).toEqual(['$J=G91 G21 X1 F500\n']);
  });

  test('a port piloted by another client refuses the move with ECONTROL; jog-stop stays free', async () => {
    const ctx = setup();
    await ctx.req('control', { operation: 'claim' }, B);
    await expect(ctx.motion('jog', STEP)).rejects.toMatchObject({ status: 409, code: 'ECONTROL', owner: expect.objectContaining({ id: 'tablet-B' }) });
    await expect(ctx.motion('jog-start', { axis: 'X', direction: 1, feed: 500 })).rejects.toMatchObject({ code: 'ECONTROL' });
    await expect(ctx.req('prepare', { operation: 'set-origin', axes: ['X'] })).rejects.toMatchObject({ code: 'ECONTROL' });
    await expect(ctx.motion('jog-stop')).resolves.toBeTruthy();
    expect(ctx.c.written).toEqual([]);
  });

  test('a move must come from the device whose own event stream is open', async () => {
    const ctx = setup();
    await expect(ctx.motion('jog', STEP, A, 'tB')).rejects.toThrow(/suivi est ouvert/);
    await expect(ctx.motion('jog', STEP, { kind: 'http', id: 'http:op' }, 'tA')).rejects.toThrow(/suivi est ouvert/);
    expect(ctx.c.written).toEqual([]);
  });
});

describe('continuous jog (F1)', () => {
  test('refused without referencing or a known travel: steps only', async () => {
    const ctx = setup();
    await expect(ctx.motion('jog-start', HOLD)).rejects.toThrow(/Maintien continu impossible : référencement.*Utilisez les pas \(1 mm au plus\)/);
    ctx.home();
    delete ctx.c.settings.settings.$130;
    await expect(ctx.motion('jog-start', HOLD)).rejects.toThrow(/course \$130 inconnue/);
    expect(ctx.state().motion.continuousReason.X).toMatch(/\$130 inconnue/);
    expect(ctx.state().motion.continuousReason.Y).toBe('');
    expect(ctx.c.written).toEqual([]);
  });

  test('one $J bounded by the travel; keepalives keep it; a missing keepalive cancels it with 0x85', async () => {
    const ctx = setup({ homed: true });
    const res = await ctx.motion('jog-start', HOLD);
    // mpos X -100, travel [-400, 0], 1 mm margin: at most 99 mm.
    expect(ctx.c.written).toEqual(['$J=G91 G21 X99 F500\n']);
    expect(res).toMatchObject({ distanceMm: 99, keepalivePeriodMs: 100, keepaliveTimeoutMs: KEEPALIVE_TIMEOUT_MS, jogId: expect.any(String) });
    ctx.ok();
    ctx.c.state.status.activeState = 'Jog';
    for (let i = 0; i < 10; i++) {
      ctx.tick(100);
      await expect(ctx.motion('jog-keepalive', { jogId: res.jogId })).resolves.toEqual({ active: true, jogId: res.jogId });
    }
    expect(ctx.state().motion.jog).toMatchObject({ axis: 'X', direction: 1, owner: { id: 'tablet-A' } });
    expect(ctx.c.written).toEqual(['$J=G91 G21 X99 F500\n']);
    ctx.tick(300);
    expect(ctx.c.written).toEqual(['$J=G91 G21 X99 F500\n', '\x85']);
    expect(ctx.state().motion).toMatchObject({ jog: null, lastJog: { result: 'cancelled', reason: 'keepalive' } });
    await expect(ctx.motion('jog-keepalive', { jogId: res.jogId })).resolves.toMatchObject({ active: false, message: expect.stringMatching(/maintien non confirmé/) });
    // Still reported in Jog after the cancel: 0x85 is sent again.
    ctx.tick(250);
    expect(ctx.c.written.filter((b) => b === '\x85').length).toBeGreaterThanOrEqual(2);
    ctx.c.state.status.activeState = 'Idle';
    ctx.tick(200);
    expect(ctx.state().motion.cancelling).toBe(false);
  });

  test('the owner\'s event stream closing cancels the jog at once', async () => {
    const ctx = setup({ homed: true });
    await ctx.motion('jog-start', HOLD);
    ctx.service.closeTransport('tA');
    expect(ctx.c.written).toEqual(['$J=G91 G21 X99 F500\n', '\x85']);
    expect(ctx.state().motion.lastJog.reason).toBe('transport');
  });

  test('a takeover of the control lease cancels the jog', async () => {
    const ctx = setup({ homed: true });
    const res = await ctx.motion('jog-start', HOLD);
    expect(ctx.state().control.owner).toMatchObject({ id: 'tablet-A' });
    await ctx.motion('jog-keepalive', { jogId: res.jogId });
    await ctx.req('control', { operation: 'takeover', reason: 'urgence atelier' }, B);
    ctx.tick(50);
    expect(ctx.c.written.at(-1)).toBe('\x85');
    expect(ctx.state().motion.lastJog.reason).toBe('control');
  });

  test('jog-stop (release, pointercancel, blur) cancels with 0x85; a $J acknowledged after the cancel gets a second 0x85', async () => {
    const ctx = setup({ homed: true });
    const res = await ctx.motion('jog-start', HOLD);
    // Released before Grbl even acknowledged the $J: its 0x85 may have been ignored.
    await expect(ctx.motion('jog-stop', { jogId: res.jogId })).resolves.toMatchObject({ message: expect.stringMatching(/0x85/) });
    expect(ctx.c.written).toEqual(['$J=G91 G21 X99 F500\n', '\x85']);
    ctx.ok();
    ctx.tick(50);
    expect(ctx.c.written).toEqual(['$J=G91 G21 X99 F500\n', '\x85', '\x85']);
    expect(ctx.state().motion.lastJog).toMatchObject({ result: 'cancelled', reason: 'operator' });
  });

  test('the Stop button stops a jog Grbl has not reported yet (report still Idle)', async () => {
    const ctx = setup({ homed: true });
    await ctx.motion('jog-start', HOLD);
    await expect(ctx.req('stop')).resolves.toMatchObject({ message: expect.stringMatching(/0x85/) });
    expect(ctx.c.written).toEqual(['$J=G91 G21 X99 F500\n', '\x85']);
  });

  test('a keepalive from another client is refused; a stale report cancels the jog', async () => {
    const ctx = setup({ homed: true });
    const res = await ctx.motion('jog-start', HOLD);
    // The jog claimed the port for A: B is refused by the control lease first.
    await expect(ctx.motion('jog-keepalive', { jogId: res.jogId }, B)).rejects.toMatchObject({ code: 'ECONTROL' });
    // Reports stop arriving (link trouble) while keepalives continue.
    for (let i = 0; i < 30; i++) {
      ctx.tick(100, { reports: false });
      await ctx.motion('jog-keepalive', { jogId: res.jogId }).catch(() => null);
    }
    expect(ctx.c.written).toContain('\x85');
    expect(ctx.state().motion.lastJog.reason).toBe('stale');
  });

  test('near the end of travel no continuous jog starts; a jog that reaches its bound ends by itself', async () => {
    const ctx = setup({ homed: true });
    ctx.c.state.status.mpos.x = '-1.200';
    await expect(ctx.motion('jog-start', HOLD)).rejects.toThrow(/Fin de course proche/);
    ctx.c.state.status.mpos.x = '-100.000';
    const res = await ctx.motion('jog-start', HOLD);
    ctx.ok();
    ctx.c.state.status.activeState = 'Jog';
    ctx.tick(100);
    await ctx.motion('jog-keepalive', { jogId: res.jogId });
    ctx.c.state.status.activeState = 'Idle';
    ctx.tick(150);
    expect(ctx.state().motion.lastJog).toMatchObject({ result: 'ended' });
    expect(ctx.c.written).toEqual(['$J=G91 G21 X99 F500\n']);
  });

  test('an active jog keeps its stream from being rotated', async () => {
    const ctx = setup({ homed: true });
    expect(ctx.service.ticketPending('tA')).toBe(false);
    await ctx.motion('jog-start', HOLD);
    expect(ctx.service.ticketPending('tA')).toBe(true);
    expect(ctx.service.ticketPending('tB')).toBe(false);
  });
});

describe('work origin (F1)', () => {
  const prepare = (ctx, axes = ['X', 'Y'], actor = A) => ctx.req('prepare', { operation: 'set-origin', axes }, actor);

  test('two steps: the ticket names the exact G10 L20 line, the confirmation sends it, the result is checked and recorded', async () => {
    const ctx = setup();
    ctx.modal('G54');
    const ticket = await prepare(ctx);
    expect(ticket).toMatchObject({ operation: 'set-origin', name: 'Origine X Y du repère G54 à la position actuelle (G10 L20 P1 X0 Y0)' });
    expect(ctx.c.written).toEqual([]);
    const done = ctx.req('set-origin', { nonce: ticket.nonce });
    expect(ctx.c.written).toEqual(['G10 L20 P1 X0 Y0\n']);
    ctx.ok();
    ctx.c.state.status.wpos = { x: '0.000', y: '0.000', z: '2.000' };
    ctx.modal('G54');
    ctx.tick(300);
    await expect(done).resolves.toMatchObject({ message: 'Origine X Y du repère G54 réglée à la position actuelle (G10 L20 P1 X0 Y0).' });
    expect(ctx.history.filter((e) => e.event === 'origin')).toEqual([expect.objectContaining({
      event: 'origin',
result: 'set',
wcs: 'G54',
axes: ['X', 'Y'],
command: 'G10 L20 P1 X0 Y0',
      machine: { X: -100, Y: -100 },
actor: expect.objectContaining({ id: 'tablet-A' })
    })]);
    expect(ctx.state().control.owner).toMatchObject({ id: 'tablet-A' });
    expect(ctx.state().motion.lastOrigin).toMatchObject({ wcs: 'G54', axes: ['X', 'Y'] });
  });

  test('the active offset gives P (G55 → P2); a work position that did not become 0 fails and is recorded', async () => {
    const ctx = setup();
    ctx.modal('G55');
    const ticket = await prepare(ctx, ['Z']);
    const done = ctx.req('set-origin', { nonce: ticket.nonce });
    expect(ctx.c.written).toEqual(['G10 L20 P2 Z0\n']);
    ctx.ok();
    ctx.modal('G55');
    ctx.tick(300);
    await expect(done).rejects.toThrow(/n’a pas pris la valeur attendue \(Z 2 au lieu de 0\)/);
    expect(ctx.history.at(-1)).toMatchObject({ event: 'origin', result: 'failed' });
  });

  test('a controller that moved instead of changing the offset is not reported as an origin set', async () => {
    const ctx = setup();
    ctx.modal('G54');
    const ticket = await prepare(ctx, ['X']);
    const done = ctx.req('set-origin', { nonce: ticket.nonce });
    ctx.ok();
    // Work X is 0, but because the machine went to X0 (what the simulator does).
    ctx.c.state.status.mpos = { x: '-95.000', y: '-100.000', z: '-10.000' };
    ctx.c.state.status.wpos = { x: '0.000', y: '5.000', z: '2.000' };
    ctx.modal('G54');
    ctx.tick(300);
    await expect(done).rejects.toThrow(/La machine a bougé pendant la définition d’origine \(X -95\)/);
    expect(ctx.history.at(-1)).toMatchObject({ event: 'origin', result: 'failed' });
  });

  test('refused during a job, in alarm, on a stale report, without a known offset, for another owner, and after the machine moved', async () => {
    const ctx = setup();
    await expect(prepare(ctx)).rejects.toThrow(/Repère de travail inconnu/);
    ctx.modal('G54');
    ctx.c.workflow.state = 'paused';
    await expect(prepare(ctx)).rejects.toThrow(/Travail en cours ou en pause/);
    ctx.c.workflow.state = 'idle';
    ctx.c.state.status.activeState = 'Alarm';
    await expect(prepare(ctx)).rejects.toThrow(/alarme/);
    ctx.c.state.status.activeState = 'Idle';
    ctx.now += 3000;
    await expect(prepare(ctx)).rejects.toThrow(/trop ancien/);
    ctx.report();
    ctx.modal('G54');
    await expect(prepare(ctx, ['X', 'X'])).rejects.toThrow(/Axes invalides/);
    await expect(prepare(ctx, ['A'])).rejects.toThrow(/Axes invalides/);

    const ticket = await prepare(ctx);
    ctx.c.state.status.mpos.x = '-90.000';
    await expect(ctx.req('set-origin', { nonce: ticket.nonce })).rejects.toThrow(/a bougé depuis la confirmation/);
    ctx.c.state.status.mpos.x = '-100.000';
    const again = await prepare(ctx);
    ctx.modal('G56');
    await expect(ctx.req('set-origin', { nonce: again.nonce })).rejects.toThrow(/repère actif a changé \(G54 → G56\)|repère actif a changé depuis la confirmation \(G54 → G56\)/);
    expect(ctx.c.written).toEqual([]);

    await ctx.req('control', { operation: 'takeover', reason: 'autre poste' }, B);
    await expect(prepare(ctx)).rejects.toMatchObject({ code: 'ECONTROL' });
  });

  test('disabled after the confirmation was issued: the run is refused too', async () => {
    const ctx = setup();
    ctx.modal('G54');
    const ticket = await prepare(ctx);
    ctx.enabled = false;
    await expect(ctx.req('set-origin', { nonce: ticket.nonce })).rejects.toThrow(DISABLED_MESSAGE);
    expect(ctx.c.written).toEqual([]);
  });
});

// Cross-check 4 (xv4): the verifier's tests, defects inverted once fixed.
const setupHeld = (options = {}) => setup({ homed: true, ...options });

describe('cross-check 4 · 1. désactivation', () => {
  const values = [
    ['clé absente', undefined, false],
    ['null', null, true],
    ['false', false, true],
    ['"true"', 'true', true],
    ['1', 1, true],
    ['{}', {}, true],
    ['[true]', [true], true]
  ];
  test.each(values)('touch.motion.enabled = %s : 409, aucune écriture pour jog / jog-start / keepalive / prepare / set-origin', async (label, value, hasKey) => {
    const ctx = setup({ enabled: value, homed: true, hasKey });
    ctx.modal('G54');
    await expect(ctx.motion('jog', STEP)).rejects.toMatchObject({ status: 409, message: DISABLED_MESSAGE });
    await expect(ctx.motion('jog-start', HOLD)).rejects.toMatchObject({ status: 409, message: DISABLED_MESSAGE });
    await expect(ctx.req('prepare', { operation: 'set-origin', axes: ['X'] })).rejects.toMatchObject({ status: 409, message: DISABLED_MESSAGE });
    await expect(ctx.req('set-origin', { nonce: 'deadbeef' })).rejects.toMatchObject({ status: 409 });
    await expect(ctx.motion('jog-stop')).resolves.toMatchObject({ message: 'Aucun déplacement en cours.' });
    await expect(ctx.req('stop')).rejects.toMatchObject({ status: 409 }); // rien à arrêter, mais pas de refus « désactivé »
    // Un refus ne revendique pas le port.
    expect(ctx.state().control.owner).toBe(null);
    await expect(ctx.motion('jog-keepalive', { jogId: 'x' })).rejects.toMatchObject({ status: 409, message: DISABLED_MESSAGE });
    expect(ctx.c.written).toEqual([]);
    expect(ctx.c.commands).toEqual([]);
    expect(ctx.state().capabilities.jog.enabled).toBe(false);
  });

  // Défaut 6a (corrigé) : un keepalive sans jog « réussissait » ({active:false})
  // et revendiquait le port libre, même désactivé.
  test('défaut 6a (corrigé) : un jog-keepalive ne revendique jamais le port (désactivé, ou sans jog actif)', async () => {
    const ctx = setup({ enabled: false });
    await expect(ctx.motion('jog-keepalive', { jogId: 'x' }, B)).rejects.toThrow(DISABLED_MESSAGE);
    expect(ctx.state().control.owner).toBe(null);
    ctx.enabled = true;
    ctx.home();
    await expect(ctx.motion('jog-keepalive', { jogId: 'nothing' }, B)).resolves.toMatchObject({ active: false });
    await expect(ctx.motion('jog-stop', {}, B)).resolves.toBeTruthy();
    expect(ctx.state().control.owner).toBe(null);
    await ctx.motion('jog', STEP);
    expect(ctx.state().control.owner).toMatchObject({ id: 'tablet-A' });
  });

  test('lu à chaque requête : activé → pas écrit ; désactivé à chaud → refus immédiat', async () => {
    const ctx = setup({ enabled: true });
    await ctx.motion('jog', STEP);
    expect(ctx.c.written).toEqual(['$J=G91 G21 X1 F500\n']);
    ctx.settle();
    ctx.enabled = false;
    await expect(ctx.motion('jog', STEP)).rejects.toThrow(DISABLED_MESSAGE);
    expect(ctx.state().capabilities.jog.enabled).toBe(false);
    ctx.enabled = true;
    await ctx.motion('jog', STEP);
    expect(ctx.c.written).toEqual(['$J=G91 G21 X1 F500\n', '$J=G91 G21 X1 F500\n']);
  });

  test('désactivé à chaud PENDANT un jog continu : le keepalive suivant est refusé et annule le jog (0x85)', async () => {
    const ctx = setup({ enabled: true, homed: true });
    const res = await running(ctx);
    ctx.enabled = false;
    await expect(ctx.motion('jog-keepalive', { jogId: res.jogId })).rejects.toThrow(DISABLED_MESSAGE);
    expect(ctx.c.written).toEqual([J, '\x85']);
    expect(ctx.state().motion.lastJog).toMatchObject({ result: 'cancelled', reason: 'disabled' });
  });

  test('désactivé à chaud PENDANT un jog continu, sans keepalive à temps : le chien de garde annule (raison disabled)', async () => {
    const ctx = setup({ enabled: true, homed: true });
    await running(ctx);
    ctx.enabled = false;
    ctx.tick(50);
    expect(ctx.c.written).toEqual([J, '\x85']);
    expect(ctx.state().motion.lastJog.reason).toBe('disabled');
  });

  test('ordre des refus : désactivé + port piloté par un autre → message de désactivation avant ECONTROL', async () => {
    const ctx = setup({ enabled: false });
    ctx.modal('G54');
    await ctx.req('control', { operation: 'claim' }, B);
    await expect(ctx.motion('jog', STEP)).rejects.toMatchObject({ message: DISABLED_MESSAGE });
    await expect(ctx.motion('jog-start', HOLD)).rejects.toMatchObject({ message: DISABLED_MESSAGE });
    await expect(ctx.motion('jog-keepalive', { jogId: 'x' })).rejects.toMatchObject({ message: DISABLED_MESSAGE });
    await expect(ctx.req('prepare', { operation: 'set-origin', axes: ['X'] })).rejects.toMatchObject({ message: DISABLED_MESSAGE });
    await expect(ctx.motion('jog', STEP)).rejects.not.toMatchObject({ code: 'ECONTROL' });
    expect(ctx.c.written).toEqual([]);
  });
});

describe('cross-check 4 · 2. commande écrite', () => {
  const bad = [
    ['axe avec injection', { axis: 'X\nG0 Z-50' }],
    ['axe minuscule', { axis: 'x' }],
    ['plusieurs axes', { axis: 'XY' }],
    ['axe tableau', { axis: ['X'] }],
    ['axe A', { axis: 'A' }],
    ['pas 1e3', { step: 1e3 }],
    ['pas NaN', { step: NaN }],
    ['pas -0', { step: -0 }],
    ['pas négatif', { step: -1 }],
    ['pas chaîne', { step: '1' }],
    ['pas objet', { step: { valueOf: () => 1 } }],
    ['pas 0.5', { step: 0.5 }],
    ['pas 1.0000001', { step: 1.0000001 }],
    ['sens 0', { direction: 0 }],
    ['sens 2', { direction: 2 }],
    ['sens "1"', { direction: '1' }],
    ['sens -0', { direction: -0 }],
    ['avance négative', { feed: -500 }],
    ['avance 0', { feed: 0 }],
    ['avance chaîne', { feed: '500' }],
    ['avance chaîne injectée', { feed: '500\nG0 Z-50' }],
    ['avance NaN', { feed: NaN }],
    ['avance Infinity', { feed: Infinity }],
    ['avance 1e21', { feed: 1e21 }],
    ['avance 0.9999', { feed: 0.9999 }],
    ['avance objet', { feed: { valueOf: () => 500 } }]
  ];
  test.each(bad)('%s → 409, rien écrit', async (label, patch) => {
    const ctx = setup({ homed: true });
    await expect(ctx.motion('jog', { ...STEP, ...patch })).rejects.toMatchObject({ status: 409 });
    if (!('step' in patch)) {
      await expect(ctx.motion('jog-start', { ...HOLD, ...patch })).rejects.toMatchObject({ status: 409 });
    }
    expect(ctx.c.written).toEqual([]);
  });

  test('formats acceptés : chaque pas, chaque sens, arrondi de l’avance, champs en trop ignorés ; jamais G90/G53', async () => {
    const ctx = setup({ homed: true });
    const lines = [];
    for (const step of [0.01, 0.1, 1, 10]) {
      for (const direction of [1, -1]) {
        if (direction === 1 && step === 10) {
          continue; // -100 + 10 = -90 : permis, mais garder simple
        }
        await ctx.motion('jog', { axis: 'Y', direction, step, feed: 123.4567, distance: 500, gcode: 'G0 Z-50', absolute: true });
        lines.push(ctx.c.written.at(-1));
        ctx.settle();
      }
    }
    expect(lines).toEqual([
      '$J=G91 G21 Y0.01 F123.457\n', '$J=G91 G21 Y-0.01 F123.457\n',
      '$J=G91 G21 Y0.1 F123.457\n', '$J=G91 G21 Y-0.1 F123.457\n',
      '$J=G91 G21 Y1 F123.457\n', '$J=G91 G21 Y-1 F123.457\n',
      '$J=G91 G21 Y-10 F123.457\n'
    ]);
    await ctx.motion('jog', { ...STEP, feed: 999.9999 });
    expect(ctx.c.written.at(-1)).toBe('$J=G91 G21 X1 F1000\n');
    ctx.settle();
    await ctx.motion('jog', { ...STEP, feed: 1.0004 });
    expect(ctx.c.written.at(-1)).toBe('$J=G91 G21 X1 F1\n');
    ctx.c.written.forEach((l) => {
      expect(l).toMatch(/^\$J=G91 G21 [XYZ]-?\d+(\.\d+)? F\d+(\.\d+)?\n$/);
      expect(l).not.toMatch(/G90|G53|G0 |G1 /);
    });
  });

  test('jog continu : distance arrondie vers le bas au µm sur une position fractionnaire', async () => {
    const ctx = setup({ homed: true });
    ctx.c.state.status.mpos.x = '-100.0005';
    const res = await ctx.motion('jog-start', HOLD);
    // edge = -1, room = floor((-1 - -100.0005) * 1000) / 1000 = 99 (≤ 99.0005)
    expect(res.distanceMm).toBeLessThanOrEqual(99.0005);
    expect(ctx.c.written).toEqual(['$J=G91 G21 X' + res.distanceMm + ' F500\n']);
  });
});

describe('cross-check 4 · 3. bornes', () => {
  test('sans référencement : 10 mm refusé, 1 mm permis sans contrôle de course ; continu refusé', async () => {
    const ctx = setup({ homed: false });
    ctx.c.state.status.mpos.x = '-0.200'; // 0,2 mm de la fin (si la course était connue)
    await expect(ctx.motion('jog', { ...STEP, step: 10 })).rejects.toThrow(/Pas de 10 mm refusé/);
    await expect(ctx.motion('jog-start', HOLD)).rejects.toThrow(/Maintien continu impossible/);
    await ctx.motion('jog', STEP);
    expect(ctx.c.written).toEqual(['$J=G91 G21 X1 F500\n']);
  });

  test('référencé, position machine inconnue : 10 mm refusé, 1 mm permis, continu refusé', async () => {
    const ctx = setup({ homed: true });
    ctx.c.state.status.mpos = {};
    await expect(ctx.motion('jog', { ...STEP, step: 10 })).rejects.toThrow(/position machine X inconnue/);
    await expect(ctx.motion('jog-start', HOLD)).rejects.toThrow(/position machine X inconnue/);
    await ctx.motion('jog', STEP);
    expect(ctx.c.written).toEqual(['$J=G91 G21 X1 F500\n']);
  });

  test('$23 bit X : course [0, 400] ; pas qui sortirait refusé (pas réduit)', async () => {
    const ctx = setup({ homed: true });
    ctx.c.settings.settings.$23 = '1';
    ctx.c.state.status.mpos.x = '1.500';
    await expect(ctx.motion('jog', { ...STEP, direction: -1, step: 10 })).rejects.toThrow(/sortirait de la course \(-8.5 mm machine, course 0 → 400\)/);
    await ctx.motion('jog', { ...STEP, direction: -1, step: 1 });
    expect(ctx.c.written).toEqual(['$J=G91 G21 X-1 F500\n']);
  });

  test('$23 inconnu : signalé ; continu et pas > 1 mm refusés, pas de 1 mm permis comme sans référencement', async () => {
    const ctx = setup({ homed: true });
    delete ctx.c.settings.settings.$23;
    await expect(ctx.motion('jog-start', HOLD)).rejects.toThrow(/réglage \$23 \(sens de prise d’origine\) inconnu/);
    await expect(ctx.motion('jog', { ...STEP, step: 10 })).rejects.toThrow(/\$23 .*inconnu/);
    expect(ctx.state().motion.continuousReason.X).toMatch(/\$23/);
    await ctx.motion('jog', STEP);
    expect(ctx.c.written).toEqual(['$J=G91 G21 X1 F500\n']);
  });

  test('rapport périmé (> 2,5 s) : pas et continu refusés', async () => {
    const ctx = setup({ homed: true });
    ctx.now += 2600;
    await expect(ctx.motion('jog', STEP)).rejects.toThrow(/trop ancien/);
    await expect(ctx.motion('jog-start', HOLD)).rejects.toThrow(/trop ancien/);
    expect(ctx.c.written).toEqual([]);
  });

  // Défaut 3 (corrigé) : la position machine n'était pas confrontée à l'enveloppe
  // supposée avant de calculer la distance du jog continu. Sur Grbl 1.1 standard
  // (sans HOMING_FORCE_SET_ORIGIN), l'espace machine est TOUJOURS [-$13x, 0],
  // même avec un bit $23 à 1 : après $H vers X-, MPos X ≈ -$130 + pull-off.
  // Sortie avant correction : `$J=G91 G21 X798 F500` (3a), `$J=G91 G21 X-404 F500` (3b).
  test('défaut 3a (corrigé) : Grbl 1.1 standard, $23 bit X, MPos X=-399 après $H : le jog continu X+ doit être refusé ou ≤ 398 mm', async () => {
    const ctx = setup({ homed: true });
    ctx.c.settings.settings.$23 = '1';
    ctx.c.state.status.mpos.x = '-399.000';
    let res = null;
    try {
      res = await ctx.motion('jog-start', HOLD);
    } catch (err) {
      res = { refused: err.message };
    }
    expect(res.refused || res.distanceMm <= 398).toBeTruthy();
    expect(res.distanceMm).toBe(398);
    expect(ctx.c.written).toEqual(['$J=G91 G21 X398 F500\n']);
  });

  test('défaut 3b (corrigé) : MPos hors de l’enveloppe supposée ([-400,0], MPos X=+5) : jog continu X− doit être refusé', async () => {
    const ctx = setup({ homed: true });
    ctx.c.state.status.mpos.x = '5.000';
    await expect(ctx.motion('jog-start', { ...HOLD, direction: -1 })).rejects.toThrow(/hors de la course supposée \(-400 → 0\)/);
    // Every step is refused too while the position contradicts the envelope.
    await expect(ctx.motion('jog', { ...STEP, direction: -1, step: 0.01 })).rejects.toThrow(/Pas refusé : position machine X 5 hors de la course supposée/);
    await expect(ctx.motion('jog', { ...STEP, direction: -1, step: 10 })).rejects.toThrow(/hors de la course supposée/);
    expect(ctx.state().motion.continuousReason.X).toMatch(/hors de la course supposée/);
    expect(ctx.c.written).toEqual([]);
  });

  test('$23 bit X, position 0 : les deux conventions sont plausibles, aucune distance n’est sûre dans les deux', async () => {
    const ctx = setup({ homed: true });
    ctx.c.settings.settings.$23 = '1';
    ctx.c.state.status.mpos.x = '0.000';
    await expect(ctx.motion('jog-start', HOLD)).rejects.toThrow(/Fin de course proche/);
    await expect(ctx.motion('jog-start', { ...HOLD, direction: -1 })).rejects.toThrow(/Fin de course proche/);
    await expect(ctx.motion('jog', { ...STEP, step: 0.1 })).rejects.toThrow(/sortirait de la course \(0.1 mm machine, course 0 → 0\)/);
    // Away from 0, only one convention remains: [0, 400] at X 150 (Grbl_ESP32 style).
    ctx.c.state.status.mpos.x = '150.000';
    const res = await ctx.motion('jog-start', HOLD);
    expect(res.command).toBe('$J=G91 G21 X249 F500');
  });

  test('pas > 1 mm : sûr dans les deux conventions et dans la course', async () => {
    const ctx = setup({ homed: true });
    ctx.c.settings.settings.$23 = '1';
    ctx.c.state.status.mpos.x = '-395.000';
    await expect(ctx.motion('jog', { ...STEP, direction: -1, step: 10 })).rejects.toThrow(/sortirait de la course \(-405 mm machine, course -400 → 0\)/);
    await ctx.motion('jog', { ...STEP, step: 10 });
    expect(ctx.c.written).toEqual(['$J=G91 G21 X10 F500\n']);
  });
});

describe('cross-check 4 · 6. pilotage F5', () => {
  test('non-propriétaire : ECONTROL sur jog, jog-start, keepalive, prepare et set-origin ; Pause/Arrêter/jog-stop libres', async () => {
    const ctx = setup({ homed: true });
    ctx.modal('G54');
    const ticket = await ctx.req('prepare', { operation: 'set-origin', axes: ['X'] });
    expect(ctx.state().control.owner).toMatchObject({ id: 'tablet-A' });
    await expect(ctx.motion('jog', STEP, B)).rejects.toMatchObject({ code: 'ECONTROL' });
    await expect(ctx.motion('jog-start', HOLD, B)).rejects.toMatchObject({ code: 'ECONTROL' });
    await expect(ctx.motion('jog-keepalive', { jogId: 'x' }, B)).rejects.toMatchObject({ code: 'ECONTROL' });
    await expect(ctx.req('prepare', { operation: 'set-origin', axes: ['X'] }, B)).rejects.toMatchObject({ code: 'ECONTROL' });
    await expect(ctx.req('set-origin', { nonce: ticket.nonce }, B)).rejects.toMatchObject({ code: 'ECONTROL' });
    expect(ctx.c.written).toEqual([]);
    await expect(ctx.motion('jog-stop', {}, B)).resolves.toBeTruthy();
    await expect(ctx.req('pause', {}, B)).rejects.not.toMatchObject({ code: 'ECONTROL' });
    await expect(ctx.req('stop', {}, B)).rejects.not.toMatchObject({ code: 'ECONTROL' });
  });

  test('revendication seulement après succès (pas, continu, origine) ; refus = port libre', async () => {
    const ctx = setup({ homed: true });
    await expect(ctx.motion('jog', { ...STEP, step: 0.5 })).rejects.toThrow();
    await expect(ctx.motion('jog-start', { ...HOLD, feed: 5000 })).rejects.toThrow();
    await expect(ctx.req('prepare', { operation: 'set-origin', axes: ['X'] })).rejects.toThrow(/Repère/);
    expect(ctx.state().control.owner).toBe(null);
    await ctx.motion('jog-start', HOLD, B);
    expect(ctx.state().control.owner).toMatchObject({ id: 'tablet-B' });
  });

  test('B arrête le jog continu de A (jog-stop libre) et Arrêter de B l’arrête aussi', async () => {
    const ctx = setup({ homed: true });
    await ctx.motion('jog-start', HOLD);
    await expect(ctx.motion('jog-stop', {}, B)).resolves.toMatchObject({ message: expect.stringMatching(/0x85/) });
    expect(ctx.c.written).toEqual(['$J=G91 G21 X99 F500\n', '\x85']);
    const ctx2 = setup({ homed: true });
    await ctx2.motion('jog-start', HOLD);
    await expect(ctx2.req('stop', {}, B)).resolves.toMatchObject({ message: expect.stringMatching(/0x85/) });
    expect(ctx2.c.written).toEqual(['$J=G91 G21 X99 F500\n', '\x85']);
  });

  test('jog-stop libre même avec une génération périmée et un flux fermé', async () => {
    const ctx = setup({ homed: true });
    await ctx.motion('jog-start', HOLD);
    await expect(ctx.service.action({ port: 'TEST', generation: 'old', transportId: 'gone', action: 'motion', operation: 'jog-stop' }, B)).resolves.toMatchObject({ message: expect.stringMatching(/0x85/) });
    expect(ctx.c.written.at(-1)).toBe('\x85');
  });
});

describe('cross-check 4 · 4. keepalive et annulation', () => {
  test('250 ms sans keepalive → 0x85 entre 250 et 300 ms après le dernier keepalive, pas avant', async () => {
    const ctx = setupHeld();
    const res = await running(ctx);
    ctx.tick(50);
    await ctx.motion('jog-keepalive', { jogId: res.jogId });
    const t0 = ctx.now;
    let first = null;
    for (let i = 0; i < 10 && first === null; i++) {
      ctx.tick(50);
      if (ctx.cancels() > 0) {
        first = ctx.now - t0;
      }
    }
    expect(first).toBeGreaterThan(250);
    expect(first).toBeLessThanOrEqual(300);
    expect(ctx.state().motion.lastJog).toMatchObject({ result: 'cancelled', reason: 'keepalive' });
  });

  test('keepalive tardif (après l’échéance mais avant le tick du chien de garde) : refusé, 0x85', async () => {
    const ctx = setupHeld();
    const res = await running(ctx);
    const t0 = ctx.now;
    // 250 ms écoulées pile au tick : pas encore annulé (strictement >)…
    ctx.tick(250);
    expect(ctx.cancels()).toBe(0);
    // …un keepalive arrivé à +270 ms (horloge seule, sans tick) ne prolonge plus rien.
    ctx.now = t0 + 270;
    await expect(ctx.motion('jog-keepalive', { jogId: res.jogId })).rejects.toThrow(/trop tard.*0x85/);
    expect(ctx.cancels()).toBe(1);
    expect(ctx.state().motion.lastJog).toMatchObject({ result: 'cancelled', reason: 'late' });
  });

  test('keepalive du même client par un autre flux (tA2) : refusé, et ne prolonge pas', async () => {
    const ctx = setupHeld();
    const res = await running(ctx);
    for (let i = 0; i < 4; i++) {
      ctx.tick(50);
      await expect(ctx.motion('jog-keepalive', { jogId: res.jogId }, A, 'tA2')).rejects.toThrow(/appartient à un autre client/);
    }
    ctx.tick(100);
    expect(ctx.cancels()).toBeGreaterThanOrEqual(1);
    expect(ctx.state().motion.lastJog.reason).toBe('keepalive');
  });

  test('keepalive d’un autre client avec le bon jogId : ECONTROL, ne prolonge pas', async () => {
    const ctx = setupHeld();
    const res = await running(ctx);
    for (let i = 0; i < 6; i++) {
      ctx.tick(50);
      await expect(ctx.motion('jog-keepalive', { jogId: res.jogId }, B)).rejects.toMatchObject({ code: 'ECONTROL' });
    }
    expect(ctx.cancels()).toBeGreaterThanOrEqual(1);
  });

  test('flux du propriétaire fermé → 0x85 immédiat ; flux d’un autre fermé → rien', async () => {
    const ctx = setupHeld();
    await running(ctx);
    ctx.service.closeTransport('tB');
    ctx.service.closeTransport('tA2');
    expect(ctx.cancels()).toBe(0);
    ctx.service.closeTransport('tA');
    expect(ctx.c.written).toEqual([J, '\x85']);
    expect(ctx.state().motion.lastJog.reason).toBe('transport');
  });

  test('prise de contrôle par B → 0x85 au tick suivant (≤ 50 ms)', async () => {
    const ctx = setupHeld();
    await running(ctx);
    await ctx.req('control', { operation: 'takeover', reason: 'atelier' }, B);
    expect(ctx.cancels()).toBe(0);
    ctx.tick(50);
    expect(ctx.cancels()).toBe(1);
    expect(ctx.state().motion.lastJog.reason).toBe('control');
  });

  test('A libère son bail puis B revendique le port libre → 0x85', async () => {
    const ctx = setupHeld();
    const res = await running(ctx);
    await ctx.req('control', { operation: 'release' }, A);
    ctx.tick(50);
    expect(ctx.cancels()).toBe(0);
    // Un keepalive de A ne re-revendique pas le port libéré (défaut 6a corrigé) :
    await ctx.motion('jog-keepalive', { jogId: res.jogId });
    expect(ctx.state().control.owner).toBe(null);
    await ctx.req('control', { operation: 'claim' }, B);
    ctx.tick(50);
    expect(ctx.cancels()).toBe(1);
    expect(ctx.state().motion.lastJog.reason).toBe('control');
  });

  test('alarme pendant le jog → 0x85 (raison alarm)', async () => {
    const ctx = setupHeld();
    const res = await running(ctx);
    ctx.tick(50);
    await ctx.motion('jog-keepalive', { jogId: res.jogId });
    ctx.c.state.status.activeState = 'Alarm';
    ctx.tick(50);
    expect(ctx.cancels()).toBe(1);
    expect(ctx.state().motion.lastJog.reason).toBe('alarm');
  });

  test('rapports qui cessent (keepalives continus) → 0x85 raison stale vers 2,5 s', async () => {
    const ctx = setupHeld();
    const res = await running(ctx);
    let at = null;
    for (let i = 0; i < 40 && at === null; i++) {
      ctx.tick(100, { reports: false });
      await ctx.motion('jog-keepalive', { jogId: res.jogId }).catch(() => null);
      if (ctx.cancels()) {
        at = (i + 1) * 100;
      }
    }
    expect(ctx.state().motion.lastJog.reason).toBe('stale');
    expect(at).toBeGreaterThan(2500);
    expect(at).toBeLessThanOrEqual(2600);
  });

  test('double jog-start, deuxième axe, pas pendant un continu : refusés, un seul $J écrit', async () => {
    const ctx = setupHeld();
    const res = await ctx.motion('jog-start', HOLD);
    await expect(ctx.motion('jog-start', HOLD)).rejects.toThrow(/non terminé/);
    await expect(ctx.motion('jog-start', { ...HOLD, axis: 'Y' })).rejects.toThrow(/non terminé/);
    await expect(ctx.motion('jog', { ...HOLD, step: 1 })).rejects.toThrow(/non terminé/);
    ctx.ok();
    ctx.c.state.status.activeState = 'Jog';
    ctx.tick(50);
    await ctx.motion('jog-keepalive', { jogId: res.jogId });
    await expect(ctx.motion('jog-start', { ...HOLD, axis: 'Y' })).rejects.toThrow(/non terminé/);
    expect(ctx.c.written).toEqual([J]);
  });

  test('après une annulation, aucun nouveau jog tant que l’annulation n’est pas confirmée', async () => {
    const ctx = setupHeld();
    await running(ctx);
    await ctx.motion('jog-stop');
    await expect(ctx.motion('jog-start', HOLD)).rejects.toThrow(/non terminé/);
    ctx.c.state.status.activeState = 'Idle';
    ctx.tick(200);
    expect(ctx.state().motion.cancelling).toBe(false);
    await ctx.motion('jog-start', HOLD);
    expect(ctx.c.written.filter((l) => l.startsWith('$J')).length).toBe(2);
  });

  test('défaut 2 de l’auteur : 0x85 renvoyé à l’ok du $J reçu après l’annulation, une seule fois par ok', async () => {
    const ctx = setupHeld();
    await ctx.motion('jog-start', HOLD);
    await ctx.motion('jog-stop');
    expect(ctx.c.written).toEqual([J, '\x85']);
    ctx.tick(100); // aucun ok encore : pas de renvoi (rapport Idle)
    expect(ctx.cancels()).toBe(1);
    ctx.ok();
    ctx.tick(50);
    expect(ctx.cancels()).toBe(2);
    ctx.tick(50);
    expect(ctx.cancels()).toBe(2);
  });

  test('ok du $J arrivé AVANT le jog-stop, rapport encore Idle : un seul 0x85 au départ, renvoi dès que Jog est vu', async () => {
    const ctx = setupHeld();
    await ctx.motion('jog-start', HOLD);
    ctx.ok();
    await ctx.motion('jog-stop');
    expect(ctx.cancels()).toBe(1);
    ctx.c.state.status.activeState = 'Jog';
    ctx.tick(250);
    expect(ctx.cancels()).toBeGreaterThanOrEqual(2);
  });

  test('annulation jamais confirmée : renvois toutes les ~200 ms, signalée et historisée après 5 s, renvois tant que Jog, bornés', async () => {
    const ctx = setupHeld();
    await running(ctx);
    await ctx.motion('jog-stop');
    ctx.tick(5200);
    const sent = ctx.cancels();
    expect(sent).toBeGreaterThanOrEqual(20);
    expect(ctx.state().motion).toMatchObject({ cancelling: true, cancelUnconfirmed: true, lastJog: { unconfirmed: true } });
    expect(ctx.history.filter((e) => e.event === 'jog-cancel-unconfirmed')).toHaveLength(1);
    ctx.tick(2000);
    expect(ctx.cancels()).toBeGreaterThanOrEqual(sent + 8);
    // Bounded by the planned duration of the $J (99 mm at 500 mm/min ≈ 12 s, + 10 s).
    ctx.tick(20000);
    const last = ctx.cancels();
    expect(ctx.state().motion.cancelling).toBe(false);
    ctx.tick(2000);
    expect(ctx.cancels()).toBe(last);
    expect(ctx.history.filter((e) => e.event === 'jog-cancel-unconfirmed')).toHaveLength(1);
  });

  test('annulation confirmée tard (Jog → Idle après 6 s) : les renvois cessent', async () => {
    const ctx = setupHeld();
    await running(ctx);
    await ctx.motion('jog-stop');
    ctx.tick(6000);
    ctx.c.state.status.activeState = 'Idle';
    ctx.tick(200);
    const n = ctx.cancels();
    expect(ctx.state().motion.cancelling).toBe(false);
    ctx.tick(1000);
    expect(ctx.cancels()).toBe(n);
  });

  test('Arrêter pendant un jog continu → 0x85 (raison stop)', async () => {
    const ctx = setupHeld();
    await running(ctx);
    await expect(ctx.req('stop')).resolves.toMatchObject({ message: expect.stringMatching(/0x85/) });
    expect(ctx.c.written).toEqual([J, '\x85']);
    expect(ctx.state().motion.lastJog.reason).toBe('stop');
  });

  test('Pause pendant un jog (même non encore signalé) → 0x85, et le message le dit ; Pause sans travail ni jog → refusée', async () => {
    const ctx = setupHeld();
    await ctx.motion('jog-start', HOLD);
    await expect(ctx.req('pause', {}, B)).resolves.toMatchObject({ message: 'Pause pendant un déplacement : Grbl ne suspend pas un jog, annulation de jog (0x85) envoyée.' });
    expect(ctx.c.written).toEqual([J, '\x85']);
    expect(ctx.state().motion.lastJog.reason).toBe('pause');
    const idle = setupHeld();
    await expect(idle.req('pause')).rejects.toThrow(/Aucun travail en cours/);
    expect(idle.c.written).toEqual([]);
  });

  test('dispose() pendant un jog et pendant une annulation : aucune temporisation, aucune écriture ensuite', async () => {
    const ctx = setupHeld();
    await running(ctx);
    expect(jest.getTimerCount()).toBeGreaterThan(0);
    ctx.service.dispose();
    expect(jest.getTimerCount()).toBe(0);
    const n = ctx.c.written.length;
    jest.advanceTimersByTime(10000);
    expect(ctx.c.written.length).toBe(n);

    const ctx2 = setupHeld();
    await running(ctx2);
    await ctx2.motion('jog-stop');
    ctx2.service.dispose();
    expect(jest.getTimerCount()).toBe(0);
  });

  test('dispose() pendant un jog continu, contrôleur encore ouvert : un 0x85, session historisée, aucune temporisation', async () => {
    const ctx = setupHeld();
    await running(ctx);
    ctx.service.dispose();
    expect(ctx.c.written).toEqual([J, '\x85']);
    expect(ctx.history.at(-1)).toMatchObject({ event: 'jog', result: 'cancelled', reason: 'dispose' });
    expect(jest.getTimerCount()).toBe(0);
  });

  test('dispose() d’un contrôleur déjà fermé : rien n’est écrit', async () => {
    const ctx = setupHeld();
    await running(ctx);
    ctx.c.isClose = () => true;
    ctx.service.dispose();
    expect(ctx.c.written).toEqual([J]);
  });

  test('contrôleur retiré pendant le jog : session perdue, pas de temporisation résiduelle', async () => {
    const ctx = setupHeld();
    await running(ctx);
    ctx.controllers = {};
    ctx.tick(100);
    expect(() => ctx.service.list()).not.toThrow();
    ctx.service.dispose();
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('cross-check 4 · 5. origines', () => {
  const prepare = (ctx, axes = ['X'], actor = A, transportId) => ctx.req('prepare', { operation: 'set-origin', axes }, actor, transportId);

  test.each([['G54', 1], ['G55', 2], ['G56', 3], ['G57', 4], ['G58', 5], ['G59', 6]])('%s → G10 L20 P%d', async (wcs, p) => {
    const ctx = setupHeld({ homed: false });
    ctx.modal(wcs);
    const ticket = await prepare(ctx, ['Z', 'X']);
    expect(ticket.name).toContain('G10 L20 P' + p + ' X0 Z0');
    const done = ctx.req('set-origin', { nonce: ticket.nonce });
    expect(ctx.c.written).toEqual(['G10 L20 P' + p + ' X0 Z0\n']);
    ctx.ok();
    ctx.c.state.status.wpos = { x: '0.000', y: '5.000', z: '0.000' };
    ctx.modal(wcs);
    ctx.tick(300);
    await expect(done).resolves.toMatchObject({ message: expect.stringContaining(wcs) });
    expect(ctx.history.at(-1)).toMatchObject({ event: 'origin', result: 'set', wcs, command: 'G10 L20 P' + p + ' X0 Z0' });
  });

  test('ticket expiré (15 s), réutilisé, d’un autre flux ou d’un autre client : refusé, rien écrit', async () => {
    const ctx = setupHeld();
    ctx.modal('G54');
    let t = await prepare(ctx);
    ctx.tick(15100);
    ctx.modal('G54');
    await expect(ctx.req('set-origin', { nonce: t.nonce })).rejects.toThrow(/expirée/);
    t = await prepare(ctx);
    await expect(ctx.req('set-origin', { nonce: t.nonce }, A, 'tA2')).rejects.toThrow(/expirée/);
    // le ticket est consommé par la tentative ratée
    await expect(ctx.req('set-origin', { nonce: t.nonce })).rejects.toThrow(/expirée/);
    t = await prepare(ctx);
    await expect(ctx.req('set-origin', { nonce: t.nonce }, B)).rejects.toMatchObject({ code: 'ECONTROL' });
    await expect(ctx.req('set-origin', { nonce: 'nope' })).rejects.toThrow(/expirée/);
    expect(ctx.c.written).toEqual([]);
  });

  test('repère inconnu (modal périmé), pause M6, travail, alarme : refus', async () => {
    const ctx = setupHeld();
    ctx.modal('G54');
    ctx.tick(2600);
    await expect(prepare(ctx)).rejects.toThrow(/Repère de travail inconnu/);
    ctx.modal('G53');
    await expect(prepare(ctx)).rejects.toThrow(/Repère de travail inconnu/);
    ctx.modal('G54');
    ctx.c.workflow.state = 'paused';
    ctx.c.sender.state.holdReason = { data: 'M6' };
    await expect(prepare(ctx)).rejects.toThrow(/Travail en cours ou en pause/);
    ctx.c.workflow.state = 'running';
    await expect(prepare(ctx)).rejects.toThrow(/Travail en cours/);
    ctx.c.workflow.state = 'idle';
    ctx.c.state.status.activeState = 'Alarm';
    await expect(prepare(ctx)).rejects.toThrow(/alarme/);
    expect(ctx.c.written).toEqual([]);
  });

  test('ticket émis, puis travail démarré / alarme avant la confirmation : refus à la confirmation', async () => {
    const ctx = setupHeld();
    ctx.modal('G54');
    let t = await prepare(ctx);
    ctx.c.workflow.state = 'paused';
    await expect(ctx.req('set-origin', { nonce: t.nonce })).rejects.toThrow(/Travail en cours ou en pause/);
    ctx.c.workflow.state = 'idle';
    t = await prepare(ctx);
    ctx.c.state.status.activeState = 'Alarm';
    await expect(ctx.req('set-origin', { nonce: t.nonce })).rejects.toThrow(/alarme/);
    expect(ctx.c.written).toEqual([]);
  });

  test('Grbl error:n → échec historisé ; mpos inchangée et wpos 0 exigés', async () => {
    const ctx = setupHeld();
    ctx.modal('G54');
    const t = await prepare(ctx, ['Y']);
    const done = ctx.req('set-origin', { nonce: t.nonce });
    ctx.c.runner.emit('error', { message: '20' });
    ctx.tick(100);
    await expect(done).rejects.toThrow(/error:20/);
    expect(ctx.history.at(-1)).toMatchObject({ event: 'origin', result: 'failed', command: 'G10 L20 P1 Y0', actor: expect.objectContaining({ id: 'tablet-A' }) });
  });

  test('pendant l’attente de l’origine : pas de jog, et la machine qui bouge fait échouer', async () => {
    const ctx = setupHeld();
    ctx.modal('G54');
    const t = await prepare(ctx, ['X']);
    const done = ctx.req('set-origin', { nonce: t.nonce });
    await expect(ctx.motion('jog', { ...HOLD, step: 1 })).rejects.toThrow(/non terminé/);
    ctx.ok();
    ctx.c.state.status.mpos.x = '-100.020';
    ctx.c.state.status.wpos.x = '0.000';
    ctx.modal('G54');
    ctx.tick(300);
    await expect(done).rejects.toThrow(/a bougé pendant/);
    expect(ctx.c.written).toEqual(['G10 L20 P1 X0\n']);
  });
});

describe('cross-check 4 · choix tranchés : broche, historique des sessions', () => {
  test('broche en rotation (FS) : continu refusé, pas limités à 0,1 mm', async () => {
    const ctx = setupHeld();
    ctx.c.state.status.spindle = 12000;
    await expect(ctx.motion('jog-start', HOLD)).rejects.toThrow(/Broche en rotation : maintien continu refusé/);
    await expect(ctx.motion('jog', STEP)).rejects.toThrow(/Broche en rotation : pas de 0.1 mm au plus/);
    expect(ctx.state().motion.continuousReason.Y).toMatch(/Broche en rotation/);
    await ctx.motion('jog', { ...STEP, step: 0.1 });
    expect(ctx.c.written).toEqual(['$J=G91 G21 X0.1 F500\n']);
  });

  test('broche commandée (M3 d’un $G frais, sans FS) : même règle', async () => {
    const ctx = setupHeld();
    ctx.c.state.parserstate = { modal: { spindle: 'M3', wcs: 'G54' } };
    ctx.c.runner.emit('parserstate', { modal: { wcs: 'G54', spindle: 'M3' } });
    await expect(ctx.motion('jog-start', HOLD)).rejects.toThrow(/Broche en rotation/);
    await ctx.motion('jog', { ...STEP, step: 0.01 });
    expect(ctx.c.written).toEqual(['$J=G91 G21 X0.01 F500\n']);
  });

  test('une entrée d’historique par session de jog continu : début, fin, raison de fin ; aucune par keepalive ni par pas', async () => {
    const ctx = setupHeld();
    const res = await running(ctx);
    for (let i = 0; i < 3; i++) {
      ctx.tick(100);
      await ctx.motion('jog-keepalive', { jogId: res.jogId });
    }
    ctx.c.state.status.activeState = 'Idle';
    ctx.tick(150);
    expect(ctx.history.filter((e) => e.event === 'jog')).toEqual([expect.objectContaining({
      event: 'jog',
result: 'ended',
reason: 'bound',
axis: 'X',
direction: 1,
feed: 500,
distanceMm: 99,
      command: '$J=G91 G21 X99 F500',
startedAt: expect.any(String),
durationMs: expect.any(Number),
      actor: expect.objectContaining({ id: 'tablet-A' }),
controller: expect.objectContaining({ port: 'TEST' })
    })]);
    await running(ctx);
    ctx.tick(300);
    expect(ctx.history.filter((e) => e.event === 'jog').map((e) => [e.result, e.reason])).toEqual([['ended', 'bound'], ['cancelled', 'keepalive']]);
    ctx.c.state.status.activeState = 'Idle';
    ctx.tick(200);
    await ctx.motion('jog', STEP);
    expect(ctx.history.filter((e) => e.event === 'jog')).toHaveLength(2);
  });
});
