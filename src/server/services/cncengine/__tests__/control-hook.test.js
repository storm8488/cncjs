/* eslint-env jest */
// Attribution of control (F5) at the Socket.IO entry: a `command`, `write` or
// `writeln` on a port piloted by someone else is refused with a message the
// classic client shows (console line) plus a dedicated event; stops pass.
import { EventEmitter } from 'events';
import touch from '../../touch';
import store from '../../../store';
import CNCEngine from '../CNCEngine';

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
  removeConnection: jest.fn()
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
    engine = new CNCEngine();
    engine.start({}, '');
    controller = fakeController();
    store.set('controllers', { COM3: controller });
    socket = fakeSocket();
    mockIo.handlers.connection(socket);
  });

  afterEach(() => {
    engine.stop();
    store.set('controllers', {});
  });

  test('a connected socket is attached (presence) and detached on disconnect', () => {
    expect(touch.attachSocket).toHaveBeenCalledWith(socket);
    socket.emit('disconnect');
    expect(touch.detachSocket).toHaveBeenCalledWith(socket);
    expect(controller.removeConnection).toHaveBeenCalledWith(socket);
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
});
