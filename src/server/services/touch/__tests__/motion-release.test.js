/* eslint-env jest */
// Release of a $J line after two reports without Jog, also on a foreign error or a board
// restart (a0998c97), from the audit 31 counter-review. Own fixture (copied from
// job-service.test.js). The « LIMITE » case records a known limit (S-R1, no line identity):
// it turns red if that limit is ever lifted.
/* eslint-disable no-await-in-loop */
import { EventEmitter } from 'events';
import { createService } from '../job-service';
import { createControl } from '../control';

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
      settings: { $10: '1', $13: '0', $22: '1', $23: '0', $30: '24000', $110: '1000', $111: '1000', $112: '500', $130: '400', $131: '400', $132: '80' }
    },
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

const A = { kind: 'touch', id: 'tablet-A', label: 'Tablette A', user: 'op' };

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
    { get: (key) => ({ 'touch.motion.enabled': true, events: [], macros: [{ id: 'm1', name: 'M', content: 'G0 X0' }] }[key]) },
    () => ctx.now,
    { control: ctx.control, history: { record: () => {} } }
  );
  services.push(ctx.service);
  ctx.generation = ctx.service.list()[0].generation;
  ctx.service.openTransport('tA', A);
  ctx.report = () => ctx.c.runner.emit('status');
  ctx.tick = (ms, every = 50) => {
    for (let t = 0; t < ms; t += every) {
      ctx.now += every;
      ctx.report();
      jest.advanceTimersByTime(every);
    }
  };
  ctx.set = (state) => {
    ctx.c.state.status.activeState = state;
  };
  ctx.req = (action, extra = {}) => ctx.service.action({ port: 'TEST', generation: ctx.generation, transportId: 'tA', action, ...extra }, A);
  ctx.state = () => ctx.service.list()[0];
  ctx.report();
  ctx.set('Home');
  ctx.report();
  ctx.set('Idle');
  ctx.report();
  return ctx;
};

const STEP = { axis: 'X', direction: 1, step: 1, feed: 500 };

const tryAll = async (ctx) => {
  const out = {};
  const tryIt = async (name, fn) => {
    try {
      await fn();
      out[name] = 'ACCEPTÉ';
    } catch (err) {
      out[name] = err.message;
    }
  };
  await tryIt('prepare home', () => ctx.req('prepare', { operation: 'home' }));
  await tryIt('prepare unlock', () => ctx.req('prepare', { operation: 'unlock' }));
  await tryIt('prepare macro', () => ctx.req('prepare', { operation: 'macro', macroId: 'm1' }));
  await tryIt('readSettings', () => ctx.req('readSettings'));
  await tryIt('second jog', () => ctx.req('motion', { operation: 'jog', ...STEP }));
  return out;
};
const accepted = (out) => Object.keys(out).filter((k) => out[k] === 'ACCEPTÉ');

describe('jog line release after errors and restarts (a0998c97)', () => {
  test('error:15 légitime : refusé avant deux rapports, libéré après, Arrêter offert pendant', async () => {
    const ctx = setup();
    await ctx.req('motion', { operation: 'jog', ...STEP });
    ctx.c.runner.emit('error', { message: '15' });
    expect(ctx.state().canStop).toBe(true);
    expect(accepted(await tryAll(ctx))).toEqual([]);
    ctx.tick(50);
    expect(accepted(await tryAll(ctx))).toEqual([]);
    ctx.tick(50);
    expect(ctx.state().canStop).toBe(false);
    expect(accepted(await tryAll(ctx))).toContain('readSettings');
  });

  test('erreur étrangère puis notre $J planifié (Jog) : jamais libéré pendant Jog, Arrêter offert', async () => {
    const ctx = setup();
    await ctx.req('motion', { operation: 'jog', ...STEP });
    ctx.c.runner.emit('error', { message: '1' });
    ctx.c.runner.emit('ok');
    ctx.set('Jog');
    for (let i = 0; i < 10; i += 1) {
      ctx.tick(250, 250);
      expect(ctx.state().canStop).toBe(true);
      expect(accepted(await tryAll(ctx))).toEqual([]);
    }
    ctx.set('Idle');
    ctx.tick(500, 250);
    expect(ctx.state().canStop).toBe(false);
  });

  test('Arrêter pendant la fenêtre d’erreur : 0x85 envoyé', async () => {
    const ctx = setup();
    await ctx.req('motion', { operation: 'jog', ...STEP });
    ctx.c.runner.emit('error', { message: '1' });
    const before = ctx.c.commands.length;
    await ctx.req('stop').catch(() => {});
    expect(ctx.c.commands.slice(before).map((x) => x[0])).toContain('jogCancel');
  });

  // Limite résiduelle (documentée) : une erreur étrangère n'est pas une preuve que
  // notre $J a été lu ; si Grbl le lit plus de deux rapports plus tard (ligne
  // étrangère G4 en tête du tampon RX), la fenêtre se referme avant le Jog.
  test('LIMITE : erreur étrangère + notre $J lu tard (G4 étranger) : action acceptée avant le premier Jog', async () => {
    const ctx = setup();
    await ctx.req('motion', { operation: 'jog', ...STEP });
    ctx.c.runner.emit('error', { message: '1' });
    ctx.tick(500, 250); // dwell étranger : Idle rapporté
    const out = await tryAll(ctx);
    // Constat : au moins une action passe alors que notre $J est encore dans le tampon.
    expect(accepted(out).length).toBeGreaterThan(0);
    // Le $J arrive ensuite : Jog rapporté, Arrêter offert, plus rien n'est accepté.
    ctx.set('Jog');
    ctx.tick(250, 250);
    expect(ctx.state().canStop).toBe(true);
    const later = await tryAll(ctx);
    expect(accepted(later)).toEqual([]);
  });

  test('redémarrage, $J reçu après le bandeau puis Jog : rien avant deux rapports, Arrêter offert ensuite', async () => {
    const ctx = setup();
    ctx.c.settings.settings.$22 = '0';
    await ctx.req('motion', { operation: 'jog', ...STEP });
    ctx.c.runner.emit('startup', { firmware: 'Grbl', version: '1.1h' });
    ctx.tick(50);
    expect(accepted(await tryAll(ctx))).toEqual([]);
    ctx.set('Jog');
    ctx.tick(250, 250);
    expect(ctx.state().canStop).toBe(true);
    expect(accepted(await tryAll(ctx))).toEqual([]);
    ctx.set('Idle');
    ctx.tick(500, 250);
    expect(ctx.state().canStop).toBe(false);
  });

  test('redémarrage puis error:9 (Alarm, $22=1) : fenêtre refermée, $X accepté', async () => {
    const ctx = setup();
    await ctx.req('motion', { operation: 'jog', ...STEP });
    ctx.c.runner.emit('startup', { firmware: 'Grbl', version: '1.1h' });
    ctx.set('Alarm');
    ctx.c.runner.emit('error', { message: '9' });
    ctx.tick(50);
    await expect(ctx.req('prepare', { operation: 'unlock' })).rejects.toThrow();
    ctx.tick(50);
    await expect(ctx.req('prepare', { operation: 'unlock' })).resolves.toMatchObject({ operation: 'unlock' });
  });

  test('erreur pendant un Jog étranger sans fin : fenêtre refermée par la borne (≤ 70 s + marge)', async () => {
    const ctx = setup();
    await ctx.req('motion', { operation: 'jog', ...STEP });
    ctx.c.runner.emit('error', { message: '1' });
    ctx.set('Jog');
    ctx.tick(60000, 250);
    expect(ctx.state().canStop).toBe(true);
    ctx.tick(20000, 250);
    // Toujours Jog rapporté : Arrêter reste offert par l'état, la ligne n'est plus en attente.
    expect(ctx.state().canStop).toBe(true);
    ctx.set('Idle');
    ctx.tick(500, 250);
    expect(ctx.state().canStop).toBe(false);
    expect(accepted(await tryAll(ctx))).toContain('readSettings');
  });
});
