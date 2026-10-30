/* eslint-env jest */
/* eslint-disable no-await-in-loop */ // keepalives and polls are sequential on purpose
import { EventEmitter } from 'events';
import { createService } from '../job-service';
import { createControl } from '../control';
import {
  capabilitiesOf, envelopeOf, maxFeedOf, grblVersion, jogLine, originLine, motionEnabled,
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

const setup = ({ enabled = true, homed = false } = {}) => {
  jest.useFakeTimers();
  const ctx = { now: 10000, enabled, c: fakeController(), history: [] };
  ctx.controllers = { TEST: ctx.c };
  ctx.control = createControl({ now: () => ctx.now, elapsed: () => ctx.now });
  ctx.service = createService(
    { get: () => ctx.controllers },
    { get: (key) => ({ 'touch.motion.enabled': ctx.enabled, events: [], macros: [] }[key]) },
    () => ctx.now,
    { control: ctx.control, history: { record: (event) => ctx.history.push(event) } }
  );
  services.push(ctx.service);
  ctx.generation = ctx.service.list()[0].generation;
  ctx.service.openTransport('tA', A);
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
  ctx.report();
  if (homed) {
    ctx.home();
  }
  return ctx;
};

const STEP = { axis: 'X', direction: 1, step: 1, feed: 500 };

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
    expect(envelopeOf(s, true)).toEqual({
      X: { limits: { low: -400, high: 0 }, reason: '' },
      Y: { limits: { low: 0, high: 300 }, reason: '' },
      Z: { limits: null, reason: 'course $132 inconnue' }
    });
    expect(envelopeOf(s, false).X).toEqual({ limits: null, reason: expect.stringMatching(/non constaté/) });
    expect(envelopeOf({ ...s, $22: '0' }, true).X.reason).toMatch(/\$22=0/);
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
  const HOLD = { axis: 'X', direction: 1, feed: 500 };

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
