/* eslint-env jest */
// Chasse aux bugs, angle A, défaut A-1 (preuve, non commité).
// Arrêter pendant un travail : feed hold envoyé, puis halt.js attend un rapport Hold:0 / Idle pour
// envoyer la réinitialisation. Si la porte de sécurité s'ouvre pendant cette attente (Door:0 /
// Door:1 : machine arrêtée), halt.js sort sans réinitialiser : Grbl garde les blocs du programme
// « arrêté » dans son planificateur et un cycle start (~) ultérieur les exécute. La branche
// « porte ouverte au moment de l'Arrêter » (job-service.js, stop) réinitialise, elle.
import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
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
    settings: { version: '1.1h', settings: { $22: 1, $110: 1000, $111: 1000, $112: 200 } },
    commands: []
  };
  c.runner.state = c.state;
  c.sender.state = { name: '', context: {}, total: 0 };
  c.sender.toJSON = () => ({ ...c.sender.state });
  c.command = (name, ...args) => {
    c.commands.push([name, ...args]);
    if (name === 'gcode:load') {
      c.sender.state = { name: args[0], context: args[2], total: 3 };
      c.sender.emit('load');
      args[3](null);
    }
    if (name === 'gcode:stop') {
      c.workflow.state = 'idle';
      c.sender.state = { ...c.sender.state, sent: 0, received: 0 };
    }
  };
  return c;
};

let root;
const services = [];
beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'cnc-touch-bughunt-a1-'));
  await fs.writeFile(path.join(root, 'test.nc'), 'G21 G90\nG1 X1 F100\nM2');
});
afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});
afterEach(() => {
  services.splice(0).forEach((service) => service.dispose());
});

const setup = () => {
  const ctx = { now: 10000, c: fakeController() };
  ctx.controllers = { TEST: ctx.c };
  ctx.service = createService({ get: () => ctx.controllers }, { get: (key) => ({ watchDirectory: root, macros: [] }[key] || []) }, () => ctx.now);
  services.push(ctx.service);
  ctx.generation = ctx.service.list()[0].generation;
  ctx.transportId = 'offline-transport';
  ctx.service.openTransport(ctx.transportId);
  ctx.req = (action, extra = {}) => ctx.service.action({ port: 'TEST', generation: ctx.generation, transportId: ctx.transportId, action, ...extra });
  ctx.report = () => ctx.c.runner.emit('status');
  return ctx;
};
const wait = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

describe('A-1 : porte ouverte pendant la fenêtre d’arrêt', () => {
  test.each([['Door', 0], ['Door', 1]])('Arrêter, puis %s:%i avant la réinitialisation : Grbl doit être réinitialisé (blocs du travail arrêté encore planifiés)', async (activeState, subState) => {
    const ctx = setup();
    ctx.report();
    await ctx.req('load', { file: 'test.nc' });
    ctx.c.workflow.state = 'running';
    ctx.c.state.status = { activeState: 'Run', subState: 0 };
    ctx.c.sender.state = { ...ctx.c.sender.state, sent: 3, received: 1 };
    await ctx.req('stop');
    expect(ctx.c.commands.slice(-2)).toEqual([['gcode:stop'], ['feedhold']]);
    // L'opérateur ouvre la porte juste après Arrêter : Grbl passe en Door (hold terminé, machine
    // arrêtée) ; les blocs restants du programme sont toujours dans le planificateur.
    ctx.now += 300;
    ctx.c.state.status = { activeState, subState };
    ctx.report();
    await wait(200);
    // Attendu : une réinitialisation, comme pour un Arrêter demandé porte ouverte (job-service.js).
    expect(ctx.c.commands.at(-1)).toEqual(['reset']);
    // Et même après la limite de 5 s, rien ne vient.
    ctx.now += 6000;
    ctx.report();
    await wait(200);
    expect(ctx.c.commands.filter(([n]) => n === 'reset')).toHaveLength(1);
  });
});
