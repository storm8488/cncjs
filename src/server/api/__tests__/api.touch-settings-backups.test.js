/* eslint-env jest */
// Lot N8: the HTTP face of the settings backups. A session is required, the body's fields are
// passed by name (never the whole body), refusals keep their status and code, and a server
// fault stays generic.
import touch from '../../services/touch';
import { getSettingsBackups, postSettingsBackups } from '../api.touch';

// babel-jest hoists this above the imports above.
jest.mock('../../services/touch', () => ({
  __esModule: true,
  default: {
    isStarted: jest.fn(() => true),
    settingsBackupList: jest.fn(() => Promise.resolve({ backups: [{ id: 'reglages-20261126T211530Z.json', first: true }], max: 20, drift: null })),
    settingsBackupAction: jest.fn(() => Promise.resolve({ changes: [], same: 12 }))
  }
}));

const makeRes = () => {
  const res = { statusCode: 200, payload: undefined, headers: {} };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.set = (name, value) => {
    res.headers[name] = value;
    return res;
  };
  res.send = (payload) => {
    res.payload = payload;
    return res;
  };
  return res;
};

const settled = () => new Promise((resolve) => {
  setImmediate(resolve);
});

describe('api/touch-settings-backups (lot N8)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    touch.isStarted.mockReturnValue(true);
  });

  test.each([['GET', getSettingsBackups], ['POST', postSettingsBackups]])('%s needs a session and a started service', (_, handler) => {
    let res = makeRes();
    handler({ body: { action: 'save', port: 'COM3' }, query: {} }, res);
    expect(res.statusCode).toBe(401);
    touch.isStarted.mockReturnValue(false);
    res = makeRes();
    handler({ user: { id: 'u' }, body: { action: 'save', port: 'COM3' }, query: {} }, res);
    expect(res.statusCode).toBe(503);
    expect(touch.settingsBackupList).not.toHaveBeenCalled();
    expect(touch.settingsBackupAction).not.toHaveBeenCalled();
  });

  test('GET lists the backups for the port asked, never cached', async () => {
    const res = makeRes();
    getSettingsBackups({ user: { id: 'u' }, query: { port: '/dev/ttyUSB0' } }, res);
    await settled();
    expect(touch.settingsBackupList).toHaveBeenCalledWith('/dev/ttyUSB0');
    expect(res.statusCode).toBe(200);
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(res.payload.backups).toHaveLength(1);
  });

  test('POST passes the action, the port and the id only', async () => {
    const res = makeRes();
    postSettingsBackups({ user: { id: 'u' }, body: { action: 'compare', port: 'COM3', id: 'reglages-20261126T211530Z.json', settings: { $130: '1' }, restore: true } }, res);
    await settled();
    expect(touch.settingsBackupAction).toHaveBeenCalledWith({ action: 'compare', port: 'COM3', id: 'reglages-20261126T211530Z.json' });
    expect(res.payload).toEqual({ changes: [], same: 12 });
    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  test('a refusal keeps its status, message and code; a server fault stays generic', async () => {
    touch.settingsBackupAction.mockReturnValueOnce(Promise.reject(Object.assign(new Error('Aucun réglage lu : relisez les réglages, machine au repos.'), { status: 409, code: 'EBACKUP_NO_SETTINGS' })));
    let res = makeRes();
    postSettingsBackups({ user: { id: 'u' }, body: { action: 'save', port: 'COM3' } }, res);
    await settled();
    expect(res.statusCode).toBe(409);
    expect(res.payload).toEqual({ message: 'Aucun réglage lu : relisez les réglages, machine au repos.', code: 'EBACKUP_NO_SETTINGS' });

    touch.settingsBackupAction.mockReturnValueOnce(Promise.reject(Object.assign(new Error('EACCES: /home/pi/.cncjs-touch-settings'), { code: 'EACCES' })));
    res = makeRes();
    postSettingsBackups({ user: { id: 'u' }, body: { action: 'save', port: 'COM3' } }, res);
    await settled();
    expect(res.statusCode).toBe(500);
    expect(res.payload).toEqual({ message: 'Sauvegardes des réglages indisponibles.' });
  });
});
