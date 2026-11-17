/* eslint-env jest */
// Attribution of control (F5) at the Socket.IO entry: a `command`, `write` or
// `writeln` on a port piloted by someone else is refused with a message the
// classic client shows (console line) plus a dedicated event; stops pass.
import { EventEmitter } from 'events';
import touch from '../../touch';
import store from '../../../store';
import CNCEngine from '../CNCEngine';
import { createControl, safeCommand, safeWrite } from '../../touch/control';

jest.mock('serialport', () => ({ SerialPort: { list: jest.fn(() => Promise.resolve([])) } }));
jest.mock('socketio-jwt', () => ({ authorize: () => (socket, next) => next() }));
jest.mock('../../../access-control', () => ({
  authorizeIPAddress: jest.fn(() => Promise.resolve()),
  validateUser: jest.fn(() => Promise.resolve())
}));
jest.mock('../../taskrunner', () => {
  const { EventEmitter: Emitter } = require('events');
  const runner = new Emitter();
  runner.run = jest.fn();
  return { __esModule: true, default: runner };
});
jest.mock('../../monitor', () => {
  const { EventEmitter: Emitter } = require('events');
  const emitter = new Emitter();
  return { __esModule: true, default: { on: emitter.on.bind(emitter), removeListener: emitter.removeListener.bind(emitter) } };
});
jest.mock('../../configstore', () => {
  const { EventEmitter: Emitter } = require('events');
  const config = new Emitter();
  config.get = jest.fn((key, fallback) => fallback);
  return { __esModule: true, default: config };
});
jest.mock('../../../controllers', () => {
  const Controller = function Controller() {};
  return { GrblController: Controller, MarlinController: Controller, SmoothieController: Controller, TinyGController: Controller };
});
// The Socket.IO server: the engine's connection handler is driven by hand.
const mockIo = {
  handlers: {},
  use: jest.fn(),
  on: jest.fn((event, fn) => {
    mockIo.handlers[event] = fn;
  }),
  emit: jest.fn(),
  close: jest.fn()
};
jest.mock('socket.io', () => () => mockIo);
jest.mock('../../touch', () => ({
  __esModule: true,
  default: {
    attachSocket: jest.fn(),
    detachSocket: jest.fn(),
    refuseAutoConnect: jest.fn(() => null),
    refuseSocket: jest.fn(() => null)
  }
}));

const fakeSocket = (id = 'sock-1') => {
  const socket = new EventEmitter();
  socket.id = id;
  socket.handshake = { address: '192.168.1.20' };
  socket.decoded_token = { id: 'u1', name: 'ana' };
  socket.emitted = [];
  const emit = socket.emit.bind(socket);
  socket.emit = (event, ...args) => {
    socket.emitted.push([event, ...args]);
    return emit(event, ...args);
  };
  socket.join = jest.fn();
  socket.leave = jest.fn();
  return socket;
};

const fakeController = () => ({
  isClose: () => false,
  isOpen: () => true,
  command: jest.fn(),
  write: jest.fn(),
  writeln: jest.fn(),
  addConnection: jest.fn(),
  removeConnection: jest.fn(),
  close: jest.fn((cb) => cb()),
  destroy: jest.fn()
});

describe('CNCEngine socket hook for the attribution of control', () => {
  let engine;
  let controller;
  let socket;

  beforeEach(() => {
    touch.attachSocket.mockClear();
    touch.detachSocket.mockClear();
    touch.refuseSocket.mockReset();
    touch.refuseSocket.mockReturnValue(null);
    touch.refuseAutoConnect.mockReset();
    touch.refuseAutoConnect.mockReturnValue(null);
    engine = new CNCEngine();
    engine.start({}, '');
    controller = fakeController();
    store.replace('controllers', { COM3: controller });
    socket = fakeSocket();
    mockIo.handlers.connection(socket);
  });

  afterEach(() => {
    engine.stop();
    store.replace('controllers', {});
  });

  test('a connected socket is attached (presence) and detached on disconnect', () => {
    expect(touch.attachSocket).toHaveBeenCalledWith(socket);
    socket.emit('disconnect');
    expect(touch.detachSocket).toHaveBeenCalledWith(socket);
    expect(controller.removeConnection).toHaveBeenCalledWith(socket);
  });

  test('automatic open rechecks locality/control and never attaches to an already open port', () => {
    const callback = jest.fn();
    socket.emit('open', 'COM3', { touchAutoConnect: true }, callback);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ message: expect.any(String) }));
    expect(JSON.parse(JSON.stringify(callback.mock.calls[0][0])).message).toBeTruthy();
    expect(controller.addConnection).not.toHaveBeenCalled();
    expect(socket.join).not.toHaveBeenCalled();
  });

  test('automatic open cannot reset a closed board while any other board is open', () => {
    const closed = { ...fakeController(), isOpen: () => false, open: jest.fn() };
    store.set('controllers', { COM3: controller, COM4: closed });
    socket.emit('open', 'COM4', { touchAutoConnect: true }, jest.fn());
    expect(closed.open).not.toHaveBeenCalled();
  });

  test('automatic open is refused by the live control/locality policy before opening', () => {
    const closed = { ...fakeController(), isOpen: () => false, open: jest.fn() };
    store.replace('controllers', { COM4: closed });
    touch.refuseAutoConnect.mockReturnValue({ message: 'Not local or another owner' });
    const callback = jest.fn();
    socket.emit('open', 'COM4', { touchAutoConnect: true }, callback);
    expect(touch.refuseAutoConnect).toHaveBeenCalledWith(socket);
    expect(closed.open).not.toHaveBeenCalled();
    expect(callback).toHaveBeenCalledWith({ message: 'Not local or another owner' });
  });

  test.each([false, true])('automatic open excludes simultaneous opens (first automatic: %s)', (automatic) => {
    let finish;
    const closed = {
      ...fakeController(),
      isOpen: () => false,
      open: jest.fn(cb => {
        finish = cb;
      })
    };
    store.replace('controllers', { COM4: closed });
    socket.emit('open', 'COM4', { touchAutoConnect: automatic }, jest.fn());
    const refused = jest.fn();
    socket.emit('open', 'COM4', { touchAutoConnect: true }, refused);
    expect(closed.open).toHaveBeenCalledTimes(1);
    expect(refused).toHaveBeenCalledWith(expect.objectContaining({ message: expect.any(String) }));
    if (automatic) {
      socket.emit('open', 'COM4', {}, jest.fn());
      expect(closed.open).toHaveBeenCalledTimes(1);
    }
    finish(new Error('USB unavailable'));
    socket.emit('open', 'COM4', { touchAutoConnect: true }, jest.fn());
    expect(closed.open).toHaveBeenCalledTimes(2);
  });

  test('successful automatic open keeps the existing open acknowledgement and sends no command', () => {
    const closed = { ...fakeController(), isOpen: () => false, open: jest.fn(cb => cb(null)) };
    store.replace('controllers', { COM4: closed });
    const callback = jest.fn();
    socket.emit('open', 'COM4', { touchAutoConnect: true }, callback);
    expect(callback).toHaveBeenCalledWith(null);
    expect(closed.command).not.toHaveBeenCalled();
    expect(closed.write).not.toHaveBeenCalled();
    expect(closed.writeln).not.toHaveBeenCalled();
    expect(socket.join).toHaveBeenCalledWith('COM4');
  });

  test('a synchronous open failure releases the automatic opening reservation', () => {
    const closed = {
      ...fakeController(),
      isOpen: () => false,
      open: jest.fn(() => {
        throw Error('USB failure');
      })
    };
    store.replace('controllers', { COM4: closed });
    const callback = jest.fn();
    socket.emit('open', 'COM4', { touchAutoConnect: true }, callback);
    socket.emit('open', 'COM4', { touchAutoConnect: true }, callback);
    expect(closed.open).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenCalledTimes(2);
  });

  test('a command, a write and a writeln pass as before when the facade allows them', () => {
    socket.emit('command', 'COM3', 'gcode:start');
    socket.emit('write', 'COM3', 'G0 X10\n', { source: 'x' });
    socket.emit('writeln', 'COM3', '$X', {});
    expect(touch.refuseSocket).toHaveBeenCalledWith(socket, 'COM3', 'command', 'gcode:start');
    expect(touch.refuseSocket).toHaveBeenCalledWith(socket, 'COM3', 'write', 'G0 X10\n');
    expect(touch.refuseSocket).toHaveBeenCalledWith(socket, 'COM3', 'writeln', '$X');
    expect(controller.command).toHaveBeenCalledWith('gcode:start');
    expect(controller.write).toHaveBeenCalledWith('G0 X10\n', { source: 'x' });
    expect(controller.writeln).toHaveBeenCalledWith('$X', {});
  });

  test('a refused command never reaches the controller; the socket gets a console line and a dedicated event', () => {
    const owner = { kind: 'touch', id: 'tablet-A', label: 'Tablette A' };
    touch.refuseSocket.mockReturnValue({ message: 'Pilotage de COM3 attribué à « Tablette A » (tablette) : …', owner });
    socket.emit('command', 'COM3', 'gcode:start');
    socket.emit('write', 'COM3', '~');
    socket.emit('writeln', 'COM3', '$J=X10 F500');
    expect(controller.command).not.toHaveBeenCalled();
    expect(controller.write).not.toHaveBeenCalled();
    expect(controller.writeln).not.toHaveBeenCalled();
    const lines = socket.emitted.filter(([e]) => e === 'serialport:read').map(([, line]) => line);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^error: Pilotage de COM3 attribué à « Tablette A »/);
    const events = socket.emitted.filter(([e]) => e === 'touch:control:refused').map(([, payload]) => payload);
    expect(events).toEqual([
      { port: 'COM3', kind: 'command', message: expect.stringMatching(/Tablette A/), owner },
      { port: 'COM3', kind: 'write', message: expect.stringMatching(/Tablette A/), owner },
      { port: 'COM3', kind: 'writeln', message: expect.stringMatching(/Tablette A/), owner }
    ]);
  });

  test('a closed or unknown port is still answered as before, without consulting the facade', () => {
    socket.emit('command', 'COM9', 'gcode:start');
    expect(touch.refuseSocket).not.toHaveBeenCalled();
    expect(controller.command).not.toHaveBeenCalled();
  });

  test('close requires the lease before triggering anything or leaving the room', () => {
    touch.refuseSocket.mockReturnValue({ message: 'Lease held by tablet', owner: { id: 'tablet' } });
    const callback = jest.fn();
    socket.emit('close', 'COM3', callback);
    expect(touch.refuseSocket).toHaveBeenCalledWith(socket, 'COM3', 'command', 'close');
    expect(controller.close).not.toHaveBeenCalled();
    expect(controller.destroy).not.toHaveBeenCalled();
    expect(socket.leave).not.toHaveBeenCalled();
    expect(store.get('controllers').COM3).toEqual(controller);
    expect(callback).toHaveBeenCalledWith(expect.any(Error));
    expect(socket.emitted.some(([event]) => event === 'touch:control:refused')).toBe(true);
  });

  test('an allowed close still closes, destroys and acknowledges the port', () => {
    const callback = jest.fn();
    socket.emit('close', 'COM3', callback);
    expect(touch.refuseSocket).toHaveBeenCalledWith(socket, 'COM3', 'command', 'close');
    expect(controller.close).toHaveBeenCalledTimes(1);
    expect(controller.destroy).toHaveBeenCalledTimes(1);
    expect(socket.leave).toHaveBeenCalledWith('COM3');
    expect(callback).toHaveBeenCalledWith(null);
    expect(store.get('controllers').COM3).toBeUndefined();
  });

  test('the real lease policy prevents PC sleep, laser off and spindle toggle during a tablet job', () => {
    const control = createControl();
    const tablet = { kind: 'touch', id: 'tablet' };
    const pc = { kind: 'socket', id: socket.id };
    control.claim('COM3', tablet);
    controller.workflow = { state: 'running' };
    touch.refuseSocket.mockImplementation((client, port, kind, value) => {
      if (kind === 'command' ? safeCommand(value) : safeWrite(value)) {
        return null;
      }
      try {
        control.authorize(port, pc, value);
        return null;
      } catch (err) {
        return err;
      }
    });
    socket.emit('command', 'COM3', 'sleep');
    socket.emit('command', 'COM3', 'lasertest:off');
    socket.emit('write', 'COM3', '\x9e');
    expect(controller.command).not.toHaveBeenCalled();
    expect(controller.write).not.toHaveBeenCalled();
    expect(controller.workflow.state).toBe('running');
    socket.emit('command', 'COM3', 'feedhold');
    expect(controller.command).toHaveBeenCalledWith('feedhold');
    control.release('COM3', tablet);
    control.claim('COM3', pc);
    socket.emit('command', 'COM3', 'sleep');
    socket.emit('command', 'COM3', 'lasertest:off');
    socket.emit('write', 'COM3', '\x9e');
    expect(controller.command).toHaveBeenCalledWith('sleep');
    expect(controller.command).toHaveBeenCalledWith('lasertest:off');
    expect(controller.write).toHaveBeenCalledWith('\x9e', {});
    control.dispose();
  });
});
