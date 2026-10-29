/* eslint-env jest */
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

jest.mock('../../services/touch', () => ({
  __esModule: true,
  default: {
    isStarted: jest.fn(() => false),
    reserveSystemCommand: jest.fn(() => ({ release: jest.fn() }))
  }
}));

jest.mock('../../store', () => ({
  __esModule: true,
  default: { get: jest.fn(() => ({})) }
}));

const COMMANDS = [
  { id: 'list', title: 'Lister', enabled: true, commands: 'ls -la' },
  { id: 'off', title: 'Éteindre', enabled: false, commands: 'sudo shutdown -h now' },
  { id: 'reboot', title: 'Redémarrer', enabled: true, commands: 'sudo reboot' },
  { id: 'restart', title: 'Relancer CNCjs', enabled: true, commands: 'pm2 restart cncjs' }
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

// A controller as CNCjs keeps it in the store.
const controller = (workflow, activeState) => ({
  type: 'Grbl',
  isClose: () => false,
  workflow: { state: workflow },
  runner: { state: { status: { activeState } } },
  feeder: { toJSON: () => ({ queue: 0, pending: false }) }
});

describe('api.commands run', () => {
  beforeEach(() => {
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
  });

  test('commands are classed sensitive by their content', () => {
    ['sudo shutdown -h now', 'reboot', '/sbin/poweroff', 'halt', 'init 0', 'init 6', 'systemctl restart cncjs',
      'systemctl stop cncjs', 'systemctl poweroff', 'pm2 restart cncjs', 'pm2 stop all', 'pm2 delete cncjs', 'pm2 kill',
      'kill -9 1234', 'killall node', 'pkill -f cncjs', 'service cncjs restart', 'sudo service cncjs stop',
      'echo bye && sudo reboot'].forEach((commands) => {
      expect(sensitiveCommand(commands)).toBe(true);
    });
    ['ls -la', 'echo hello', 'git pull', 'systemctl status cncjs', 'pm2 list', 'pm2 logs', 'service cncjs status',
      'cat /var/log/syslog', ''].forEach((commands) => {
      expect(sensitiveCommand(commands)).toBe(false);
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
    [['running', 'Run'], ['paused', 'Hold'], ['idle', 'Jog'], ['idle', 'Home'], ['idle', 'Run'], ['idle', 'Hold']].forEach(([workflow, activeState]) => {
      store.get.mockReturnValue({ A: controller(workflow, activeState) });
      res = makeRes();
      run(makeReq('reboot'), res);
      expect(res.statusCode).toBe(409);
      expect(taskRunner.run).not.toHaveBeenCalled();
    });
    store.get.mockReturnValue({ A: controller('idle', 'Idle'), B: controller('idle', 'Alarm') });
    res = makeRes();
    run(makeReq('reboot'), res);
    expect(res.statusCode).toBe(200);
    expect(taskRunner.run).toHaveBeenCalledTimes(1);
    expect(touch.reserveSystemCommand).toHaveBeenCalledTimes(1);
  });
});
