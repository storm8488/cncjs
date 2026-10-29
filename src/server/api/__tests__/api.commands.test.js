/* eslint-env jest */
import { EventEmitter } from 'events';
import config from '../../services/configstore';
import taskRunner from '../../services/taskrunner';
import touch from '../../services/touch';
import store from '../../store';
import { run, sensitiveCommand } from '../api.commands';

// babel-jest hoists these above the imports above.
jest.mock('../../services/configstore', () => ({
  __esModule: true,
  default: { get: jest.fn(() => []), set: jest.fn() }
}));

jest.mock('../../services/taskrunner', () => {
  const { EventEmitter } = require('events');
  const runner = new EventEmitter();
  runner.run = jest.fn(() => 'task-1');
  return { __esModule: true, default: runner };
});

// The touch facade over a real job-service (concurrency and release are
// exercised for real); tests that only need the API wiring stub the reservation.
jest.mock('../../services/touch', () => {
  const { createService } = require('../../services/touch/job-service');
  const state = { registry: {}, now: 10000 };
  const service = createService({ get: () => state.registry }, { get: () => [] }, () => state.now);
  return {
    __esModule: true,
    default: {
      __state: state,
      __service: service,
      isStarted: jest.fn(() => false),
      reserveSystemCommand: jest.fn((command) => service.reserveSystemCommand(command))
    }
  };
});

jest.mock('../../store', () => ({
  __esModule: true,
  default: { get: jest.fn(() => ({})) }
}));

const COMMANDS = [
  { id: 'list', title: 'Lister', enabled: true, commands: 'ls -la' },
  { id: 'off', title: 'Éteindre', enabled: false, commands: 'sudo shutdown -h now' },
  { id: 'halt', title: 'Éteindre maintenant', enabled: true, commands: 'sudo shutdown -h now' },
  { id: 'reboot', title: 'Redémarrer', enabled: true, commands: 'sudo reboot' },
  { id: 'restart', title: 'Relancer CNCjs', enabled: true, commands: 'pm2 restart cncjs' },
  { id: 'deploy', title: 'Déployer', enabled: true, commands: 'git pull && pm2 restart cncjs-next' },
  { id: 'kiosk', title: 'Relancer le kiosque', enabled: true, commands: 'pkill -f kiosk' }
];

const makeReq = (id) => ({ params: { id }, body: {}, query: {} });

const makeRes = () => {
  const res = { statusCode: 200, payload: undefined };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.send = (payload) => {
    res.payload = payload;
    return res;
  };
  return res;
};

const conflict = (message) => {
  const err = new Error(message);
  err.status = 409;
  return err;
};

// A controller as CNCjs keeps it in the store (no events needed).
const controller = (workflow, activeState, feeder = { queue: 0, pending: false }) => ({
  type: 'Grbl',
  isClose: () => false,
  workflow: { state: workflow },
  runner: { state: { status: { activeState } } },
  feeder: { toJSON: () => feeder }
});

// A Grbl controller the job-service can listen to.
const liveController = (port = 'COM3') => {
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
    settings: { settings: {} },
    commands: []
  };
  c.runner.state = c.state;
  c.sender.state = { name: '', context: {}, total: 0 };
  c.sender.toJSON = () => ({ ...c.sender.state });
  c.command = (name, ...args) => c.commands.push([name, ...args]);
  return c;
};

const resetMocks = () => {
  config.get.mockReset();
  config.get.mockImplementation(() => COMMANDS.map((c) => ({ ...c })));
  taskRunner.run.mockReset();
  taskRunner.run.mockImplementation(() => 'task-1');
  taskRunner.removeAllListeners();
  touch.isStarted.mockReset();
  touch.isStarted.mockReturnValue(false);
  touch.reserveSystemCommand.mockReset();
  touch.reserveSystemCommand.mockImplementation(() => ({ release: jest.fn() }));
  store.get.mockReset();
  store.get.mockReturnValue({});
};

afterAll(() => {
  touch.__service.dispose();
});

describe('api.commands run', () => {
  beforeEach(resetMocks);

  test('commands are classed sensitive by their content (whole words only)', () => {
    ['sudo shutdown -h now', 'reboot', '/sbin/poweroff', 'halt', 'init 0', 'init 6', 'sudo telinit 0', 'systemctl restart cncjs',
      'systemctl stop cncjs', 'systemctl poweroff', 'sudo systemctl reload cncjs', 'sudo systemctl reload-or-restart cncjs',
      'systemctl try-restart cncjs', 'systemctl kill cncjs', 'systemctl --user restart cncjs',
      'pm2 restart cncjs', 'pm2 stop all', 'pm2 delete cncjs', 'pm2 kill', 'pm2 reload cncjs', 'pm2 reload all',
      'pm2 stop cncjs; pm2 start cncjs', 'git pull && pm2 restart cncjs-next',
      'kill -9 1234', 'kill -9 $(pgrep -f cncjs)', 'killall node', 'killall chromium', 'pkill -f cncjs', 'pkill -f kiosk',
      'service cncjs restart', 'sudo service cncjs stop', 'service cncjs reload',
      'echo bye && sudo reboot', 'cd /home/pi && sudo reboot', 'sudo shutdown -r +1 "redémarrage"', 'sudo /sbin/reboot',
      'sudo halt -p', 'shutdown /r /t 0'].forEach((commands) => {
      expect([commands, sensitiveCommand(commands)]).toEqual([commands, true]);
    });
    ['ls -la', 'echo hello', 'git pull', 'systemctl status cncjs', 'sudo systemctl start cncjs', 'pm2 list', 'pm2 logs',
      'pm2 logs cncjs --lines 50', 'service cncjs status', 'cat /var/log/syslog', 'cat /var/log/shutdown.log', 'df -h', 'uptime',
      'vcgencmd measure_temp', 'tail -n 20 /home/pi/.pm2/logs/cncjs-out.log', ''].forEach((commands) => {
      expect([commands, sensitiveCommand(commands)]).toEqual([commands, false]);
    });
    // Known false positives: the command is merely reserved (refused during a job).
    ['echo reboot', 'cat /var/log/shutdown', 'grep -i halt /var/log/syslog', 'man shutdown'].forEach((commands) => {
      expect([commands, sensitiveCommand(commands)]).toEqual([commands, true]);
    });
    // Known false negatives: a wrapper script is not looked into (documented for .cncrc).
    ['/home/pi/deploy-touch.sh', './shutdown-safe.sh', 'sh /opt/shutdown.sh', 'bash -c "$(cat /opt/cmd.txt)"'].forEach((commands) => {
      expect([commands, sensitiveCommand(commands)]).toEqual([commands, false]);
    });
  });

  test('a disabled command called directly is refused and never run', () => {
    const res = makeRes();
    run(makeReq('off'), res);
    expect(res.statusCode).toBe(403);
    expect(res.payload.message).toMatch(/désactivée/);
    expect(taskRunner.run).not.toHaveBeenCalled();
    expect(touch.reserveSystemCommand).not.toHaveBeenCalled();
  });

  test('an unknown command still answers 404', () => {
    const res = makeRes();
    run(makeReq('nope'), res);
    expect(res.statusCode).toBe(404);
    expect(taskRunner.run).not.toHaveBeenCalled();
  });

  test('an enabled, harmless command runs without any reservation, Touch started or not', () => {
    touch.isStarted.mockReturnValue(true);
    store.get.mockReturnValue({ A: controller('running', 'Run') });
    const res = makeRes();
    run(makeReq('list'), res);
    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual({ taskId: 'task-1' });
    expect(taskRunner.run).toHaveBeenCalledWith('ls -la', 'Lister');
    expect(touch.reserveSystemCommand).not.toHaveBeenCalled();
  });

  test('a sensitive command reserves the machine before it runs, and releases it when the task ends', () => {
    touch.isStarted.mockReturnValue(true);
    const release = jest.fn();
    touch.reserveSystemCommand.mockReturnValue({ release });
    const res = makeRes();
    run(makeReq('reboot'), res);
    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual({ taskId: 'task-1' });
    expect(touch.reserveSystemCommand).toHaveBeenCalledWith({ id: 'reboot', title: 'Redémarrer', commands: 'sudo reboot' });
    expect(touch.reserveSystemCommand.mock.invocationCallOrder[0]).toBeLessThan(taskRunner.run.mock.invocationCallOrder[0]);
    expect(release).not.toHaveBeenCalled();
    taskRunner.emit('finish', 'task-other', 0);
    expect(release).not.toHaveBeenCalled();
    taskRunner.emit('finish', 'task-1', 0);
    expect(release).toHaveBeenCalledTimes(1);
    taskRunner.emit('finish', 'task-1', 0);
    expect(release).toHaveBeenCalledTimes(1);
    expect(taskRunner.listenerCount('finish')).toBe(0);
    expect(taskRunner.listenerCount('error')).toBe(0);
  });

  test('a task that fails to start releases the reservation too', () => {
    touch.isStarted.mockReturnValue(true);
    const release = jest.fn();
    touch.reserveSystemCommand.mockReturnValue({ release });
    run(makeReq('restart'), makeRes());
    taskRunner.emit('error', 'task-1', new Error('spawn failed'));
    expect(release).toHaveBeenCalledTimes(1);

    const failing = jest.fn();
    touch.reserveSystemCommand.mockReturnValue({ release: failing });
    taskRunner.run.mockImplementation(() => {
      throw new Error('no shell');
    });
    const res = makeRes();
    run(makeReq('restart'), res);
    expect(res.statusCode).toBe(500);
    expect(failing).toHaveBeenCalledTimes(1);
  });

  test('a task that never reports its end releases the reservation after a bounded delay', () => {
    jest.useFakeTimers();
    try {
      touch.isStarted.mockReturnValue(true);
      const release = jest.fn();
      touch.reserveSystemCommand.mockReturnValue({ release });
      run(makeReq('reboot'), makeRes());
      jest.advanceTimersByTime(5 * 60 * 1000 - 1);
      expect(release).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
      expect(release).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  test('two clients at once: the first holds the reservation, the second is refused and nothing runs twice', () => {
    touch.isStarted.mockReturnValue(true);
    let held = null;
    touch.reserveSystemCommand.mockImplementation((command) => {
      if (held) {
        throw conflict('Commande système déjà en cours (' + held.title + ').');
      }
      held = command;
      return { release: jest.fn() };
    });
    const first = makeRes();
    const second = makeRes();
    run(makeReq('reboot'), first);
    run(makeReq('restart'), second);
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(409);
    expect(second.payload.message).toMatch(/déjà en cours.*Redémarrer/);
    expect(taskRunner.run).toHaveBeenCalledTimes(1);
    expect(taskRunner.run).toHaveBeenCalledWith('sudo reboot', 'Redémarrer');
  });

  test('a sensitive command is refused while the machine works, Touch started (reservation) or not (store)', () => {
    touch.isStarted.mockReturnValue(true);
    touch.reserveSystemCommand.mockImplementation(() => {
      throw conflict('Un travail est en cours ou en pause sur A : commande système refusée.');
    });
    let res = makeRes();
    run(makeReq('reboot'), res);
    expect(res.statusCode).toBe(409);
    expect(res.payload.message).toMatch(/travail/);
    expect(taskRunner.run).not.toHaveBeenCalled();

    touch.isStarted.mockReturnValue(false);
    [['running', 'Run'], ['paused', 'Hold'], ['idle', 'Jog'], ['idle', 'Home'], ['idle', 'Run'], ['idle', 'Hold'], ['idle', 'Door:0']].forEach(([workflow, activeState]) => {
      store.get.mockReturnValue({ A: controller(workflow, activeState) });
      res = makeRes();
      run(makeReq('reboot'), res);
      expect(res.statusCode).toBe(409);
      expect(taskRunner.run).not.toHaveBeenCalled();
    });
    // Without Touch: CNCjs's feeder queue counts too, a closed controller does not.
    store.get.mockReturnValue({ A: controller('idle', 'Idle', { queue: 3, pending: true }) });
    res = makeRes();
    run(makeReq('reboot'), res);
    expect(res.statusCode).toBe(409);
    expect(res.payload.message).toMatch(/attente/);
    store.get.mockReturnValue({ A: { ...controller('running', 'Run'), isClose: () => true }, B: controller('idle', 'Alarm') });
    res = makeRes();
    run(makeReq('reboot'), res);
    expect(res.statusCode).toBe(200);
    expect(taskRunner.run).toHaveBeenCalledTimes(1);
    expect(touch.reserveSystemCommand).toHaveBeenCalledTimes(1);
  });
});

// Cross-check (audit 31): run over the real job-service, for the concurrency
// and the release as they happen.
describe('api.commands run with a real job-service', () => {
  const service = touch.__service;
  const state = touch.__state;
  let c;

  beforeEach(() => {
    resetMocks();
    let n = 0;
    taskRunner.run.mockImplementation(() => 'task-' + (++n));
    touch.isStarted.mockReturnValue(true);
    touch.reserveSystemCommand.mockImplementation((command) => service.reserveSystemCommand(command));
    c = liveController();
    state.registry = { COM3: c };
    service.list(); // the controller is registered (a tablet is connected)
    c.runner.emit('status');
  });

  test('two POST run at once: one taskRunner.run; the second gets 409 with the first title; finish releases', () => {
    const a = makeRes();
    const b = makeRes();
    run(makeReq('reboot'), a);
    run(makeReq('halt'), b);
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(409);
    expect(b.payload.message).toMatch(/déjà en cours \(Redémarrer\)/);
    expect(taskRunner.run).toHaveBeenCalledTimes(1);
    expect(service.systemCommand()).toMatchObject({ title: 'Redémarrer' });
    expect(service.list()[0].canLoad).toBe(false);
    taskRunner.emit('finish', 'task-1', 0);
    expect(service.systemCommand()).toBe(null);
    expect(service.list()[0].canLoad).toBe(true);
    expect(taskRunner.listenerCount('finish')).toBe(0);
    // The second one passes now.
    const again = makeRes();
    run(makeReq('halt'), again);
    expect(again.statusCode).toBe(200);
    taskRunner.emit('error', 'task-2', new Error('x'));
    expect(service.systemCommand()).toBe(null);
  });

  test('taskRunner.run throwing: 500, reservation released, the machine is available again', () => {
    taskRunner.run.mockImplementation(() => {
      throw new Error('spawn');
    });
    const res = makeRes();
    run(makeReq('deploy'), res);
    expect(res.statusCode).toBe(500);
    expect(service.systemCommand()).toBe(null);
    expect(taskRunner.listenerCount('finish')).toBe(0);
    expect(service.list()[0].canLoad).toBe(true);
  });

  test('a sensitive command during a job (Run / running): 409 without run; a harmless one: 200 without reservation', () => {
    c.workflow.state = 'running';
    c.state.status.activeState = 'Run';
    c.runner.emit('status');
    const res = makeRes();
    run(makeReq('kiosk'), res);
    expect(res.statusCode).toBe(409);
    expect(res.payload.message).toMatch(/travail est en cours/);
    expect(taskRunner.run).not.toHaveBeenCalled();
    const ok = makeRes();
    run(makeReq('list'), ok);
    expect(ok.statusCode).toBe(200);
    expect(service.systemCommand()).toBe(null);
  });

  test('a stale report: explicit 409 (no blind reservation)', () => {
    state.now += 10000;
    const res = makeRes();
    run(makeReq('reboot'), res);
    expect(res.statusCode).toBe(409);
    expect(res.payload.message).toMatch(/trop ancien/);
    expect(taskRunner.run).not.toHaveBeenCalled();
    state.now -= 10000;
  });

  test('a controller never listed (no tablet connected): the first attempt starts listening, the next one runs', () => {
    const fresh = liveController('COM4');
    state.registry = { COM4: fresh };
    fresh.runner.emit('status');
    fresh.runner.emit('status'); // nobody listened yet
    let res = makeRes();
    run(makeReq('reboot'), res);
    expect(res.statusCode).toBe(409);
    expect(res.payload.message).toMatch(/réessayer/);
    expect(fresh.runner.listenerCount('status')).toBe(1);
    fresh.runner.emit('status');
    res = makeRes();
    run(makeReq('reboot'), res);
    expect([res.statusCode, res.payload]).toEqual([200, { taskId: 'task-1' }]);
    taskRunner.emit('finish', 'task-1', 0);
    expect(service.systemCommand()).toBe(null);
  });
});
