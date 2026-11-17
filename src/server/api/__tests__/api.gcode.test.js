/* eslint-env jest */
// CNCjs's own upload (POST /api/gcode) and the touch service (lot F1, review C3): refused, with
// nothing loaded, while the touch service says a framing holds the machine.
import touch from '../../services/touch';
import store from '../../store';
import { upload } from '../api.gcode';

jest.mock('../../services/touch', () => ({
  __esModule: true,
  default: { isStarted: jest.fn(() => true), refuseUpload: jest.fn(() => null) }
}));

jest.mock('../../store', () => ({
  __esModule: true,
  default: { get: jest.fn() }
}));

const response = () => {
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

describe('POST /api/gcode and the touch service', () => {
  let controller;
  beforeEach(() => {
    controller = { command: jest.fn((name, file, gcode, context, done) => done(null, { name: file })) };
    store.get.mockReturnValue(controller);
    touch.isStarted.mockReturnValue(true);
    touch.refuseUpload.mockReturnValue(null);
  });

  test('a framing in progress: 409 with the reason, nothing loaded', () => {
    touch.refuseUpload.mockReturnValue({ message: 'Cadrage en cours sur la tablette : commande refusée jusqu’à sa fin (Arrêter reste possible).' });
    const res = response();
    upload({ body: { port: 'COM3', name: 'a.nc', gcode: 'G0 X1' } }, res);
    expect(touch.refuseUpload).toHaveBeenCalledWith('COM3');
    expect(res.statusCode).toBe(409);
    expect(res.payload).toMatchObject({ msg: expect.stringMatching(/^Cadrage en cours/) });
    expect(controller.command).not.toHaveBeenCalled();
  });

  test('otherwise, or without the touch service: loaded as before', () => {
    let res = response();
    upload({ body: { port: 'COM3', name: 'a.nc', gcode: 'G0 X1' } }, res);
    expect(res.statusCode).toBe(200);
    expect(controller.command).toHaveBeenCalledWith('gcode:load', 'a.nc', 'G0 X1', {}, expect.any(Function));
    touch.isStarted.mockReturnValue(false);
    touch.refuseUpload.mockClear();
    res = response();
    upload({ body: { port: 'COM3', name: 'b.nc', gcode: 'G0 X2' } }, res);
    expect(touch.refuseUpload).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });
});
