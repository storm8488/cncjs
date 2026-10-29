/* eslint-env jest */
// The watch API over the real monitor: a preview sidecar is served as valid
// only while the program it describes is the one on disk.
import fs from 'fs';
import os from 'os';
import path from 'path';
import monitor from '../index';
import { readFile, writeFile } from '../../../api/api.watch';
import { fingerprint } from '../../touch/program-identity';

const SUFFIX = '.cnctouch.json';

const makeReq = ({ contentType, body = {}, query = {} }) => ({
  body,
  query,
  is: (type) => (contentType === type ? type : false)
});

// Resolves with the response once the handler answers.
const call = (handler, req) => new Promise((resolve) => {
  const res = { statusCode: 200, headers: {} };
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
    resolve(res);
    return res;
  };
  handler(req, res);
});

const readJSON = (file) => call(readFile, makeReq({ contentType: 'application/json', body: { file } }));
const putJSON = (file, data) => call(writeFile, makeReq({ contentType: 'application/json', body: { file, data } }));

describe('preview identity through the watch API', () => {
  let watchDirectory;

  beforeAll(() => {
    watchDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'cncjs-watch-'));
    monitor.start({ watchDirectory });

    return new Promise((resolve, reject) => {
      const deadline = Date.now() + 2000;
      const poll = () => {
        if (monitor.isConfigured()) {
          resolve();
          return;
        }
        if (Date.now() > deadline) {
          reject(new Error('monitor did not become configured'));
          return;
        }
        setTimeout(poll, 20);
      };
      poll();
    });
  });

  afterAll(() => {
    monitor.stop();
    fs.rmSync(watchDirectory, { recursive: true, force: true });
  });

  const sidecar = (file, extra) => JSON.stringify({
    version: 1,
    file,
    originalName: file,
    ...extra,
    preview: { image: 'data:image/png;base64,AA==', bounds: [0, 0, 10, 10], segments: 1, ...(extra && extra.preview) }
  });

  test('a program upload answers with the fingerprint and size of the bytes written', async () => {
    const res = await putJSON('part.nc', 'G0 X1 (pièce)\r\n');
    expect(res.statusCode).toEqual(200);
    expect(res.payload.file).toEqual('part.nc');
    expect(res.payload.fingerprint).toEqual(fingerprint(fs.readFileSync(path.join(watchDirectory, 'part.nc'))));
    expect(res.payload.size).toEqual(Buffer.byteLength('G0 X1 (pièce)\r\n', 'utf8'));
  });

  test('a program read carries the fingerprint of the served bytes, in the body and the headers', async () => {
    const res = await readJSON('part.nc');
    expect(res.statusCode).toEqual(200);
    expect(res.payload.data).toEqual('G0 X1 (pièce)\r\n');
    const expected = fingerprint(fs.readFileSync(path.join(watchDirectory, 'part.nc')));
    expect(res.payload.fingerprint).toEqual(expected);
    expect(res.payload.size).toEqual(Buffer.byteLength('G0 X1 (pièce)\r\n', 'utf8'));
    expect(res.headers['x-program-fingerprint']).toEqual(expected);
    expect(res.headers['x-program-size']).toEqual(String(res.payload.size));
  });

  test('a sidecar whose fingerprint matches the program is served as current', async () => {
    const written = await putJSON('part.nc', 'G0 X1\r\nG1 X2\r\n');
    const stored = await putJSON('part.nc' + SUFFIX, sidecar('part.nc', { fingerprint: written.payload.fingerprint, size: written.payload.size }));
    expect(stored.statusCode).toEqual(200);

    const res = await readJSON('part.nc' + SUFFIX);
    expect(res.statusCode).toEqual(200);
    expect(res.payload.preview).toEqual({ stale: false, reason: '', fingerprint: written.payload.fingerprint, size: written.payload.size });
    const meta = JSON.parse(res.payload.data);
    expect(meta.preview.image).toEqual('data:image/png;base64,AA==');
    expect(meta.fingerprint).toEqual(written.payload.fingerprint);
  });

  // The program is replaced under the same name by a copy into the directory
  // (or an upload from the classic interface); the old sidecar stays beside it.
  test('the old sidecar is served as stale once the program is replaced under the same name', async () => {
    const written = await putJSON('same-name.nc', 'G0 X10 Y10\r\nG1 X50\r\n');
    await putJSON('same-name.nc' + SUFFIX, sidecar('same-name.nc', { fingerprint: written.payload.fingerprint, size: written.payload.size }));
    expect((await readJSON('same-name.nc' + SUFFIX)).payload.preview.stale).toBe(false);

    // Same length, same mtime second: only the content differs.
    fs.writeFileSync(path.join(watchDirectory, 'same-name.nc'), 'G0 X11 Y10\r\nG1 X50\r\n');

    const res = await readJSON('same-name.nc' + SUFFIX);
    expect(res.statusCode).toEqual(200);
    expect(res.payload.preview.stale).toBe(true);
    expect(res.payload.preview.reason).toEqual('fingerprint-mismatch');
    expect(res.payload.preview.fingerprint).toEqual(fingerprint('G0 X11 Y10\r\nG1 X50\r\n'));
    // The old image is not handed out as if it were current.
    const meta = JSON.parse(res.payload.data);
    expect(meta.preview.stale).toBe(true);
    expect(meta.preview.reason).toEqual('fingerprint-mismatch');
    expect(meta.preview.image).toBeUndefined();
    expect(meta.preview.bounds).toBeUndefined();
    expect(meta.originalName).toEqual('same-name.nc');
  });

  // Served just before, modified right after: the following read must notice.
  test('a change between a detail and the next read is detected', async () => {
    const written = await putJSON('between.nc', 'G1 X1\r\n');
    await putJSON('between.nc' + SUFFIX, sidecar('between.nc', { fingerprint: written.payload.fingerprint, size: written.payload.size }));
    const first = await readJSON('between.nc' + SUFFIX);
    expect(first.payload.preview.stale).toBe(false);
    fs.appendFileSync(path.join(watchDirectory, 'between.nc'), 'G1 X2\r\n');
    const second = await readJSON('between.nc' + SUFFIX);
    expect(second.payload.preview.stale).toBe(true);
    expect(JSON.parse(second.payload.data).preview.image).toBeUndefined();
  });

  test('a sidecar without a fingerprint (older version) is never served as valid', async () => {
    await putJSON('old.nc', 'G1 X1\r\n');
    await putJSON('old.nc' + SUFFIX, sidecar('old.nc'));
    const res = await readJSON('old.nc' + SUFFIX);
    expect(res.payload.preview.stale).toBe(true);
    expect(res.payload.preview.reason).toEqual('no-fingerprint');
    expect(JSON.parse(res.payload.data).preview.image).toBeUndefined();
  });

  test('a sidecar whose program is gone is stale', async () => {
    await putJSON('orphan.nc' + SUFFIX, sidecar('orphan.nc', { fingerprint: fingerprint('x'), size: 1 }));
    const res = await readJSON('orphan.nc' + SUFFIX);
    expect(res.statusCode).toEqual(200);
    expect(res.payload.preview.stale).toBe(true);
    expect(res.payload.preview.reason).toEqual('program-missing');
  });

  test('a sidecar that is not JSON is passed through, marked unreadable', async () => {
    await putJSON('broken.nc', 'G1 X1\r\n');
    await putJSON('broken.nc' + SUFFIX, '{not json');
    const res = await readJSON('broken.nc' + SUFFIX);
    expect(res.statusCode).toEqual(200);
    expect(res.payload.data).toEqual('{not json');
    expect(res.payload.preview.stale).toBe(true);
    expect(res.payload.preview.reason).toEqual('unreadable');
  });

  test('a read that leaves the directory is refused with 400, a missing file with 404', async () => {
    const outside = await readJSON('../' + path.basename(watchDirectory) + '-outside.nc');
    expect(outside.statusCode).toEqual(400);
    const missing = await readJSON('missing.nc');
    expect(missing.statusCode).toEqual(404);
  });

  // A program replaced while its old sidecar is still beside it: after a new
  // upload of the program through the API, the sidecar from the previous
  // upload must not be reported current (half of a program/sidecar pair).
  test('a program rewritten through the API without its sidecar leaves that sidecar stale', async () => {
    const written = await putJSON('pair.nc', 'G1 X1\r\n');
    await putJSON('pair.nc' + SUFFIX, sidecar('pair.nc', { fingerprint: written.payload.fingerprint, size: written.payload.size }));
    await putJSON('pair.nc', 'G1 X2\r\n');
    const res = await readJSON('pair.nc' + SUFFIX);
    expect(res.payload.preview.stale).toBe(true);
    expect(res.payload.preview.reason).toEqual('fingerprint-mismatch');
  });
});
