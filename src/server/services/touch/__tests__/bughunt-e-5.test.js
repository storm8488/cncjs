/* eslint-env jest */
// Chasse aux bugs, angle E, défaut E-5 (mineur) : la confirmation de
// démarrage est posée après l'étape asynchrone sameFileAsLoaded
// (job-service.js:1527-1531). Si le flux du client se ferme entre la demande
// et cette étape (rotation du flux, perte Wi-Fi), closeTransport (:1878) a déjà
// révoqué les tickets de ce flux… et le ticket est posé ensuite, lié à un
// transportId mort. Il vit 15 s : motion.inspect → confirmationPending
// (:488-493) bloque l'essai à blanc (canPreviewMotion=false, code SESSION), et
// busy() (:1783) tient le bail. Le start lui-même reste refusé (:1441) :
// aucun risque machine, mais un état incohérent pendant 15 s.
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
      c.sender.state = { name: args[0], context: args[2], total: 3 };
      c.sender.emit('load');
      args[3](null);
    }
  };
  return c;
};

let root;
beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'cnc-touch-bughunt-e5-'));
  await fs.writeFile(path.join(root, 'test.nc'), 'G21 G90\nG1 X1 F100\nM2');
});
afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

test('E-5 : flux fermé pendant prepare(start) → aucune confirmation en attente ensuite', async () => {
  const c = fakeController();
  const service = createService(
    { get: () => ({ TEST: c }) },
    { get: (key) => ({ watchDirectory: root, macros: [], events: [] }[key]) },
    () => 10000
  );
  try {
    const generation = service.list()[0].generation;
    service.openTransport('t1');
    c.runner.emit('status');
    await service.action({ port: 'TEST', generation, transportId: 't1', action: 'load', file: 'test.nc' });
    const revision = service.list()[0].revision;
    expect(service.list()[0].canPreviewMotion).toBe(true);
    const pending = service.action({ port: 'TEST', generation, transportId: 't1', action: 'prepare', operation: 'start', revision });
    // Le flux t1 se ferme (rotation, coupure) avant la fin de la lecture du fichier.
    service.closeTransport('t1');
    // Correction retenue (FINDINGS.md) : la confirmation est refusée, pas posée
    // sur un flux mort (avant : la demande aboutissait et le ticket vivait 15 s).
    await expect(pending).rejects.toThrow(/Connexion de suivi interrompue/);
    expect(service.ticketPending('t1')).toBe(false);
    const state = service.list()[0];
    expect(state.canPreviewMotion).toBe(true);
  } finally {
    service.dispose();
  }
});
