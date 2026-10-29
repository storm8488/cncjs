/* eslint-env jest */
import monitor from '../../services/monitor';
import { readFile, writeFile } from '../api.watch';

// babel-jest hoists this above the imports above.
jest.mock('../../services/monitor', () => ({
  __esModule: true,
  default: {
    readFile: jest.fn((file, options, callback) => callback(null, 'G0 X1\r\n')),
    fingerprintOf: jest.fn(() => Promise.resolve({ fingerprint: 'sha256:' + 'a'.repeat(64), size: 7, mtimeMs: 1 })),
    writeFile: jest.fn((file, data, callback) => callback(null)),
    writeStream: jest.fn((file, readable, options, callback) => callback(null))
  }
}));

const coded = (code, message = code) => Object.assign(new Error(message), { code });

// Minimal stand-ins for the two Express objects writeFile() touches. req.is()
// answers the way Express does: the matched type, or false.
const makeReq = ({ contentType, body = {}, query = {} }) => ({
  body,
  query,
  is: (type) => (contentType === type ? type : false)
});

const makeRes = () => {
  const res = { statusCode: 200, payload: undefined, headers: {} };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.set = (name, value) => {
    res.headers[name.toLowerCase()] = String(value);
    return res;
  };
  res.send = (payload) => {
    res.payload = payload;
    return res;
  };
  return res;
};

// readFile answers asynchronously once the sidecar check resolves.
const settled = () => new Promise((resolve) => {
  setImmediate(resolve);
});

describe('api.watch readFile', () => {
  beforeEach(() => {
    monitor.readFile.mockClear();
    monitor.fingerprintOf.mockClear();
  });

  test('asks the monitor for a bounded, fingerprinted read of a program', () => {
    monitor.readFile.mockImplementationOnce((file, options, callback) => callback(null, 'G0 X1\r\n', { fingerprint: 'sha256:' + 'b'.repeat(64), size: 7, mtimeMs: 1 }));
    const res = makeRes();
    readFile(makeReq({ contentType: 'application/json', body: { file: 'program.nc' } }), res);

    expect(monitor.readFile).toHaveBeenCalledWith('program.nc', { maxFileSize: expect.any(Number), withFingerprint: true }, expect.any(Function));
    expect(res.statusCode).toEqual(200);
    expect(res.payload).toEqual({ file: 'program.nc', data: 'G0 X1\r\n', fingerprint: 'sha256:' + 'b'.repeat(64), size: 7 });
    expect(res.headers['x-program-fingerprint']).toEqual('sha256:' + 'b'.repeat(64));
    expect(res.headers['x-program-size']).toEqual('7');
  });

  test('maps the monitor codes to statuses without leaking unexpected errors', () => {
    const cases = [
      ['ENOENT', 404, 'File not found'],
      ['EOUTSIDE', 400, 'EOUTSIDE'],
      ['ENOTFILE', 400, 'ENOTFILE'],
      ['ENOTCONFIGURED', 400, 'ENOTCONFIGURED'],
      ['ETOOLARGE', 413, 'ETOOLARGE'],
      ['ECHANGED', 409, 'ECHANGED'],
      ['EIO', 500, 'Failed reading file']
    ];
    cases.forEach(([code, status, msg]) => {
      monitor.readFile.mockImplementationOnce((file, options, callback) => callback(coded(code)));
      const res = makeRes();
      readFile(makeReq({ contentType: 'application/json', body: { file: 'program.nc' } }), res);
      expect([code, res.statusCode]).toEqual([code, status]);
      expect([code, res.payload]).toEqual([code, { msg }]);
    });
  });

  test('a sidecar is checked against its program and served with a verdict', async () => {
    const fp = 'sha256:' + 'a'.repeat(64);
    const meta = { version: 1, file: 'program.nc', fingerprint: fp, size: 7, preview: { image: 'data:image/png;base64,AA==' } };
    monitor.readFile.mockImplementationOnce((file, options, callback) => callback(null, JSON.stringify(meta)));
    const res = makeRes();
    readFile(makeReq({ contentType: 'application/json', body: { file: 'program.nc.cnctouch.json' } }), res);
    await settled();

    expect(monitor.readFile).toHaveBeenCalledWith('program.nc.cnctouch.json', { maxFileSize: expect.any(Number), withFingerprint: false }, expect.any(Function));
    expect(monitor.fingerprintOf).toHaveBeenCalledWith('program.nc');
    expect(res.payload.preview).toEqual({ stale: false, reason: '', fingerprint: fp, size: 7 });
    expect(JSON.parse(res.payload.data)).toEqual(meta);
  });

  test('a sidecar is stale when the program differs, has no fingerprint or is missing', async () => {
    const meta = { version: 1, file: 'program.nc', fingerprint: 'sha256:' + 'c'.repeat(64), size: 7, preview: { image: 'data:image/png;base64,AA==', bounds: [0, 0, 1, 1] } };
    monitor.readFile.mockImplementationOnce((file, options, callback) => callback(null, JSON.stringify(meta)));
    let res = makeRes();
    readFile(makeReq({ contentType: 'application/json', body: { file: 'program.nc.cnctouch.json' } }), res);
    await settled();
    expect(res.payload.preview.stale).toBe(true);
    expect(res.payload.preview.reason).toEqual('fingerprint-mismatch');
    expect(JSON.parse(res.payload.data).preview).toEqual({ stale: true, reason: 'fingerprint-mismatch' });

    monitor.readFile.mockImplementationOnce((file, options, callback) => callback(null, JSON.stringify({ ...meta, fingerprint: undefined })));
    res = makeRes();
    readFile(makeReq({ contentType: 'application/json', body: { file: 'program.nc.cnctouch.json' } }), res);
    await settled();
    expect(res.payload.preview).toMatchObject({ stale: true, reason: 'no-fingerprint' });

    monitor.readFile.mockImplementationOnce((file, options, callback) => callback(null, JSON.stringify(meta)));
    monitor.fingerprintOf.mockImplementationOnce(() => Promise.reject(coded('ENOENT')));
    res = makeRes();
    readFile(makeReq({ contentType: 'application/json', body: { file: 'program.nc.cnctouch.json' } }), res);
    await settled();
    expect(res.statusCode).toEqual(200);
    expect(res.payload.preview).toMatchObject({ stale: true, reason: 'program-missing' });
    expect(JSON.parse(res.payload.data).preview.image).toBeUndefined();
  });
});

describe('api.watch writeFile', () => {
  beforeEach(() => {
    monitor.writeFile.mockClear();
    monitor.writeStream.mockClear();
  });

  test('streams a body sent as application/octet-stream, naming it from the query', () => {
    const req = makeReq({ contentType: 'application/octet-stream', query: { file: 'program.nc' } });
    const res = makeRes();
    writeFile(req, res);

    expect(res.statusCode).toEqual(200);
    expect(res.payload).toEqual({ file: 'program.nc' });
    expect(monitor.writeStream).toHaveBeenCalledWith(
      'program.nc',
      req,
      { maxFileSize: expect.any(Number) },
      expect.any(Function)
    );
    expect(monitor.writeFile).not.toHaveBeenCalled();
  });

  test('writes a JSON body through writeFile, unchanged', () => {
    const req = makeReq({ contentType: 'application/json', body: { file: 'program.nc', data: 'G0 X1\r\n' } });
    const res = makeRes();
    writeFile(req, res);

    expect(res.statusCode).toEqual(200);
    expect(res.payload).toEqual({ file: 'program.nc' });
    expect(monitor.writeFile).toHaveBeenCalledWith('program.nc', 'G0 X1\r\n', expect.any(Function));
    expect(monitor.writeStream).not.toHaveBeenCalled();
  });

  test('answers with the fingerprint and size the monitor reports for the bytes written', () => {
    const info = { fingerprint: 'sha256:' + 'd'.repeat(64), size: 7, mtimeMs: 1 };
    monitor.writeFile.mockImplementationOnce((file, data, callback) => callback(null, info));
    const res = makeRes();
    writeFile(makeReq({ contentType: 'application/json', body: { file: 'program.nc', data: 'G0 X1\r\n' } }), res);
    expect(res.payload).toEqual({ file: 'program.nc', fingerprint: info.fingerprint, size: 7 });

    monitor.writeStream.mockImplementationOnce((file, readable, options, callback) => callback(null, info));
    const raw = makeRes();
    writeFile(makeReq({ contentType: 'application/octet-stream', query: { file: 'program.nc' } }), raw);
    expect(raw.payload).toEqual({ file: 'program.nc', fingerprint: info.fingerprint, size: 7 });
  });

  test('maps write refusals to their status', () => {
    [['ENOTFILE', 400], ['ENOTCONFIGURED', 400], ['ETOOLARGE', 413], ['EIO', 500]].forEach(([code, status]) => {
      monitor.writeFile.mockImplementationOnce((file, data, callback) => callback(coded(code)));
      const res = makeRes();
      writeFile(makeReq({ contentType: 'application/json', body: { file: 'program.nc', data: 'G0' } }), res);
      expect([code, res.statusCode]).toEqual([code, status]);
    });
  });

  // An empty JSON body parses to an empty object, which is indistinguishable
  // from "body-parser produced nothing". Selecting on the content type keeps it
  // on the JSON path, so it still answers "No file specified" rather than
  // streaming an empty request to disk under the query string's name.
  test('an empty JSON body is not mistaken for a raw upload', () => {
    const req = makeReq({ contentType: 'application/json', body: {}, query: { file: 'program.nc' } });
    const res = makeRes();
    writeFile(req, res);

    expect(res.statusCode).toEqual(400);
    expect(res.payload).toEqual({ msg: 'No file specified' });
    expect(monitor.writeStream).not.toHaveBeenCalled();
    expect(monitor.writeFile).not.toHaveBeenCalled();
  });

  test('rejects an unsupported content type with 415', () => {
    const req = makeReq({ contentType: 'text/plain', query: { file: 'program.nc' } });
    const res = makeRes();
    writeFile(req, res);

    expect(res.statusCode).toEqual(415);
    expect(res.payload).toEqual({ msg: 'Unsupported content type' });
    expect(monitor.writeStream).not.toHaveBeenCalled();
    expect(monitor.writeFile).not.toHaveBeenCalled();
  });

  test('rejects a request with no content type at all', () => {
    const req = makeReq({ contentType: undefined, query: { file: 'program.nc' } });
    const res = makeRes();
    writeFile(req, res);

    expect(res.statusCode).toEqual(415);
  });

  test('requires a file name on each path', () => {
    const raw = makeRes();
    writeFile(makeReq({ contentType: 'application/octet-stream' }), raw);
    expect(raw.statusCode).toEqual(400);

    const json = makeRes();
    writeFile(makeReq({ contentType: 'application/json', body: { data: 'G0 X1' } }), json);
    expect(json.statusCode).toEqual(400);
  });
});
