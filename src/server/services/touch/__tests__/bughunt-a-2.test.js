/* eslint-env jest */
// Chasse aux bugs, angle A, défaut A-2 (preuve, non commité).
// Commande hôte sensible (.cncrc : redémarrer, éteindre) avec la broche en marche, machine Idle :
// la page tablette refuse (tablet-actions.js restless(), « La broche tourne encore ») mais le
// serveur (system-command.js reserveSystemCommand) accepte la réservation : depuis l'interface
// CNCjs classique (api/commands/run) ou tout client HTTP, CNCjs peut être redémarré ou l'hôte
// éteint pendant que la broche tourne, sans M5 possible jusqu'au retour du service.
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
    state: { status: { activeState: 'Idle', spindle: 12000 } },
    feeder: { toJSON: () => ({ queue: 0, pending: false }) },
    settings: { version: '1.1h', settings: { $30: 24000, $31: 0 } },
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
});

test('A-2 : une commande hôte sensible est refusée pendant que la broche tourne (Idle, M3 S12000 rapporté)', () => {
  const ctx = { now: 10000, c: fakeController() };
  ctx.service = createService({ get: () => ({ TEST: ctx.c }) }, { get: () => [] }, () => ctx.now);
  services.push(ctx.service);
  ctx.service.list(); // enregistre le contrôleur (écouteur de rapports)
  ctx.c.runner.emit('status');
  // Le serveur sait que la broche tourne : il refuse un démarrage et offre M5.
  const s = ctx.service.list()[0];
  expect(s.fresh).toBe(true);
  expect(s.canSpindleStop).toBe(true);
  expect(s.homeReason).toMatch(/broche tourne/);
  // Mais il accepte de réserver la machine pour « sudo reboot ».
  expect(() => ctx.service.reserveSystemCommand({ id: 'cmd-1', title: 'Redémarrer', commands: 'sudo reboot' })).toThrow(/broche/);
});
