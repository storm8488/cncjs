/* eslint-env jest */
// Chasse aux bugs, angle E, défaut E-4 (mineur) : un programme chargé par la
// tablette puis démarré depuis l'interface CNCjs du PC est enregistré
// « start » dans l'historique durable (job-service.js:399-414, r.run), mais
// sa fin, ses erreurs, ses alarmes et un redémarrage de carte ne le sont
// jamais, et le snapshot ne le dit jamais « finished » : r.end (:350),
// r.error (:382), r.alarmed (:283) et r.reset (:305) exigent r.job.started,
// que seuls un start tactile (:1614) ou un stop tactile (:1677) posent.
// Le Journal → Serveur montre un départ sans fin. (La reprise refusée d'un
// travail démarré par le PC est, elle, une décision documentée, TESTING.md l. 247.)
// Ce test ÉCHOUE sur cbde7cee : c'est la preuve.
import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { createService } from '../job-service';

const fakeController = () => {
  const c = {
    type: 'Grbl',
    options: { port: 'TEST' },
    ready: true,
    isClose: () => false,
    runner: new EventEmitter(),
    sender: new EventEmitter(),
    workflow: Object.assign(new EventEmitter(), { state: 'idle' }),
    state: { status: { activeState: 'Idle' } },
    feeder: { toJSON: () => ({ queue: 0, pending: false }) },
    settings: { settings: { $110: 1000, $111: 1000, $112: 200 } },
    commands: []
  };
  c.runner.state = c.state;
  c.sender.state = { name: '', context: {}, total: 0 };
  c.sender.toJSON = () => ({ ...c.sender.state });
  c.command = (name, ...args) => {
    c.commands.push([name, ...args]);
    if (name === 'gcode:load') {
      c.sender.state = { name: args[0], context: args[2], total: 3, sent: 0, received: 0 };
      c.sender.emit('load');
      args[3](null);
    }
  };
  return c;
};

let root;
beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'cnc-touch-bughunt-e4-'));
  await fs.writeFile(path.join(root, 'test.nc'), 'G21 G90\nG1 X1 F100\nM2');
});
afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

test('E-4 : travail chargé par la tablette, démarré et terminé depuis le PC → « finish » enregistré et finished vrai', async () => {
  const recorded = [];
  const c = fakeController();
  let now = 10000;
  const service = createService(
    { get: () => ({ TEST: c }) },
    { get: (key) => ({ watchDirectory: root, macros: [], events: [] }[key]) },
    () => now,
    { history: { record: (e) => recorded.push(e) } }
  );
  try {
    const generation = service.list()[0].generation;
    service.openTransport('t1');
    c.runner.emit('status');
    await service.action({ port: 'TEST', generation, transportId: 't1', action: 'load', file: 'test.nc' });
    // Le PC démarre le programme chargé (interface classique) : le service voit workflow 'start'.
    c.workflow.state = 'running';
    c.state.status.activeState = 'Run';
    c.workflow.emit('start');
    c.runner.emit('status');
    expect(recorded.map((e) => e.event)).toEqual(['load', 'start']);
    // Toutes les lignes acquittées, le programme se termine : CNCjs rembobine (end) puis repasse idle.
    c.sender.state = { ...c.sender.state, sent: 3, received: 3 };
    c.sender.emit('end');
    c.workflow.state = 'idle';
    c.state.status.activeState = 'Idle';
    now += 100;
    c.runner.emit('status');
    const state = service.list()[0];
    expect(recorded.map((e) => e.event)).toEqual(['load', 'start', 'finish']);
    expect(state.finished).toBe(true);
  } finally {
    service.dispose();
  }
});
