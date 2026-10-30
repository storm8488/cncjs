/* eslint-env jest */
// HTTP mapping of the project sheets (F3/F6): session check and status codes.
import * as projects from '../../services/touch/projects';
import { getProjects, readProject, writeProject } from '../api.touch';

jest.mock('../../services/touch', () => ({ __esModule: true, default: { isStarted: jest.fn(() => false) } }));
jest.mock('../../services/touch/projects', () => ({
  __esModule: true,
  list: jest.fn(),
  read: jest.fn(),
  write: jest.fn()
}));

const makeRes = () => {
  const res = { statusCode: 200, headers: {} };
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
const coded = (code, message) => Object.assign(new Error(message), { code });

describe('api.touch project sheets', () => {
  beforeEach(() => {
    projects.list.mockReset();
    projects.read.mockReset();
    projects.write.mockReset();
  });

  test.each([['getProjects', getProjects], ['readProject', readProject], ['writeProject', writeProject]])('%s refuses a request without a session', async (name, handler) => {
    const res = makeRes();
    handler({ user: null, body: {} }, res);
    await settled();
    expect(res.statusCode).toBe(401);
    expect(projects.list).not.toHaveBeenCalled();
    expect(projects.write).not.toHaveBeenCalled();
  });

  test('the sheets answer without the touch service started (they never reach a controller)', async () => {
    projects.list.mockResolvedValue({ entries: [] });
    const res = makeRes();
    getProjects({ user: { id: 'u' } }, res);
    await settled();
    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual({ entries: [] });
    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  test('a write passes only the documented fields, adopt only when true', async () => {
    projects.write.mockResolvedValue({ file: 'a.nc', version: 'current' });
    const res = makeRes();
    writeProject({ user: { id: 'u' }, body: { file: 'a.nc', fingerprint: 'f', meta: { notes: 'x' }, adopt: 'yes', extra: 1 } }, res);
    await settled();
    expect(projects.write).toHaveBeenCalledWith({ file: 'a.nc', fingerprint: 'f', meta: { notes: 'x' }, adopt: false });
  });

  test.each([
    ['EINVALIDNAME', 400], ['EINVALID', 400], ['ENOENT', 404], ['ECHANGED', 409], ['EOTHERVERSION', 409],
    ['ENOORIGINAL', 409], ['ETOOLARGE', 413], ['ETOOMANY', 413], ['ENOTCONFIGURED', 503], ['ECORRUPT', 500]
  ])('%s answers %i with its message and code', async (code, status) => {
    projects.read.mockRejectedValue(coded(code, 'Message ' + code));
    const res = makeRes();
    readProject({ user: { id: 'u' }, body: { file: 'a.nc' } }, res);
    await settled();
    expect(res.statusCode).toBe(status);
    expect(res.payload).toEqual({ message: 'Message ' + code, code });
  });

  test('an unexpected failure stays generic', async () => {
    projects.write.mockRejectedValue(coded('EIO', '/secret/path'));
    const res = makeRes();
    writeProject({ user: { id: 'u' }, body: {} }, res);
    await settled();
    expect(res.statusCode).toBe(500);
    expect(res.payload).toEqual({ message: 'Fiches projets indisponibles.' });
  });
});
