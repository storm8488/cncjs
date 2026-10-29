/* eslint-env jest */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import monitor from '../index';
import { fingerprint, sameProgram } from '../../touch/program-identity';

// Whether this platform lets the test process create file symlinks (Windows
// refuses without the SeCreateSymbolicLink privilege or developer mode). The
// probe is real: a test that needs a link is skipped only when the link cannot
// be made, never unconditionally.
const canSymlink = (() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cncjs-symlink-probe-'));
  try {
    fs.writeFileSync(path.join(dir, 'target.txt'), 'x');
    fs.symlinkSync(path.join(dir, 'target.txt'), path.join(dir, 'link.txt'));
    return fs.lstatSync(path.join(dir, 'link.txt')).isSymbolicLink();
  } catch (err) {
    return false;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
})();
const symlinkTest = canSymlink ? test : test.skip;

const MB = 1024 * 1024;

describe('monitor file access', () => {
  let watchDirectory;
  let outsideDirectory;

  beforeAll(() => {
    watchDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'cncjs-watch-'));
    outsideDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'cncjs-outside-'));
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
    fs.rmSync(outsideDirectory, { recursive: true, force: true });
  });

  const inWatch = (name) => path.join(watchDirectory, name);
  const write = (name, contents) => fs.writeFileSync(inWatch(name), contents);
  const read = (name) => fs.readFileSync(inWatch(name));
  const tempFiles = () => fs.readdirSync(watchDirectory).filter(name => name.endsWith('.tmp'));
  const readFile = (name, options) => new Promise((resolve) => {
    const cb = (err, data, info) => resolve({ err, data, info });
    if (options) {
      monitor.readFile(name, options, cb);
    } else {
      monitor.readFile(name, cb);
    }
  });
  const writeFile = (name, data) => new Promise((resolve) => {
    monitor.writeFile(name, data, (err, info) => resolve({ err, info }));
  });
  const writeStream = (name, readable, options = {}) => new Promise((resolve) => {
    monitor.writeStream(name, readable, options, (err, info) => resolve({ err, info }));
  });
  const removeLink = (target) => {
    try {
      fs.unlinkSync(target);
    } catch (err) {
      fs.rmdirSync(target);
    }
  };

  describe('readFile', () => {
    test('reads a file inside the directory and reports its fingerprint when asked', async () => {
      write('plain.nc', 'G0 X1 (pièce)\r\n');
      const plain = await readFile('plain.nc');
      expect(plain.err).toBeFalsy();
      expect(plain.data).toEqual('G0 X1 (pièce)\r\n');

      const withInfo = await readFile('plain.nc', { withFingerprint: true });
      expect(withInfo.err).toBeFalsy();
      expect(withInfo.info.fingerprint).toEqual(fingerprint(read('plain.nc')));
      expect(withInfo.info.size).toEqual(read('plain.nc').length);
      expect(typeof withInfo.info.mtimeMs).toEqual('number');
    });

    test('still reads a file in a real subdirectory (the classic Watch Directory widget navigates them)', async () => {
      fs.mkdirSync(inWatch('nested'), { recursive: true });
      write(path.join('nested', 'deep.nc'), 'G0 X2\r\n');
      const result = await readFile(path.join('nested', 'deep.nc'));
      expect(result.err).toBeFalsy();
      expect(result.data).toEqual('G0 X2\r\n');
    });

    test('reports a missing file as ENOENT and a directory as ENOTFILE', async () => {
      expect((await readFile('absent.nc')).err.code).toEqual('ENOENT');
      fs.mkdirSync(inWatch('a-dir'), { recursive: true });
      expect((await readFile('a-dir')).err.code).toEqual('ENOTFILE');
    });

    test('refuses a name that leaves the directory textually', async () => {
      const result = await readFile(path.join('..', path.basename(outsideDirectory), 'x.nc'));
      expect(result.err).toBeTruthy();
      expect(result.err.code).toEqual('EOUTSIDE');
      expect(result.err.message).toMatch(/outside/);
    });

    // A directory link (a junction on Windows, which needs no privilege; a
    // symlink elsewhere) inside the watch directory points outside it. The
    // path `sub/secret.txt` is textually inside, so a resolve-and-compare
    // check accepts it, and the read follows the link.
    test('refuses a path that leaves the directory through a directory link', async () => {
      fs.writeFileSync(path.join(outsideDirectory, 'secret.txt'), 'outside the library\n');
      const link = inWatch('sub');
      fs.symlinkSync(outsideDirectory, link, 'junction');
      try {
        const result = await readFile(path.join('sub', 'secret.txt'));
        expect(result.data).toBeUndefined();
        expect(result.err).toBeTruthy();
        expect(result.err.code).toEqual('EOUTSIDE');
      } finally {
        removeLink(link);
      }
    });

    symlinkTest('refuses a file symlink rather than following it, even one pointing inside', async () => {
      fs.writeFileSync(path.join(outsideDirectory, 'passwd'), 'root:x:0:0\n');
      write('inside-target.nc', 'inside\r\n');
      fs.symlinkSync(path.join(outsideDirectory, 'passwd'), inWatch('link-out.nc'));
      fs.symlinkSync(inWatch('inside-target.nc'), inWatch('link-in.nc'));
      try {
        const out = await readFile('link-out.nc');
        expect(out.data).toBeUndefined();
        expect(out.err.code).toEqual('ENOTFILE');
        const inside = await readFile('link-in.nc');
        expect(inside.data).toBeUndefined();
        expect(inside.err.code).toEqual('ENOTFILE');
      } finally {
        fs.unlinkSync(inWatch('link-out.nc'));
        fs.unlinkSync(inWatch('link-in.nc'));
      }
    });

    test('refuses a file larger than maxFileSize', async () => {
      write('big.nc', Buffer.alloc(64 * 1024, 0x41));
      const result = await readFile('big.nc', { maxFileSize: 32 * 1024 });
      expect(result.err).toBeTruthy();
      expect(result.err.code).toEqual('ETOOLARGE');
      expect((await readFile('big.nc', { maxFileSize: 64 * 1024 })).err).toBeFalsy();
    });
  });

  describe('writeFile', () => {
    test('writes the UTF-8 bytes and reports their fingerprint and size', async () => {
      const text = 'G0 X1 (pièce)\r\nG1 X2\r\n';
      const result = await writeFile('written.nc', text);
      expect(result.err).toBeFalsy();
      expect(read('written.nc')).toEqual(Buffer.from(text, 'utf8'));
      expect(result.info.fingerprint).toEqual(fingerprint(Buffer.from(text, 'utf8')));
      expect(result.info.size).toEqual(Buffer.byteLength(text, 'utf8'));
      expect(tempFiles()).toEqual([]);
    });

    test('strips directory components from the file name', async () => {
      const result = await writeFile(path.join('..', '..', 'escaped-json.nc'), 'G0\r\n');
      expect(result.err).toBeFalsy();
      expect(fs.existsSync(inWatch('escaped-json.nc'))).toBe(true);
      expect(fs.existsSync(path.resolve(watchDirectory, '..', '..', 'escaped-json.nc'))).toBe(false);
    });

    // The write is interrupted (disk full) after the target was opened. A
    // direct `fs.writeFile` has already truncated the target by then: the old
    // version is lost and an empty file is left under the program's name.
    test('keeps the previous version intact when the write fails midway, and leaves no temporary', async () => {
      await writeFile('kept.nc', 'version one\r\n');
      expect(read('kept.nc').toString()).toEqual('version one\r\n');

      const spy = jest.spyOn(fs, 'write').mockImplementation((fd, buffer, ...rest) => {
        const callback = rest[rest.length - 1];
        const err = new Error('no space left on device');
        err.code = 'ENOSPC';
        process.nextTick(() => callback(err));
      });
      let result;
      try {
        result = await writeFile('kept.nc', 'version two, which never completes\r\n');
      } finally {
        spy.mockRestore();
      }
      expect(result.err).toBeTruthy();
      expect(result.err.code).toEqual('ENOSPC');
      expect(read('kept.nc').toString()).toEqual('version one\r\n');
      expect(tempFiles()).toEqual([]);
    });

    test('two concurrent writes of the same name leave one of the two versions whole, never a mix', async () => {
      const a = Buffer.alloc(3 * MB, 'A');
      const b = Buffer.alloc(3 * MB, 'B');
      const [first, second] = await Promise.all([
        writeFile('raced.nc', a.toString()),
        writeFile('raced.nc', b.toString())
      ]);
      expect(first.err).toBeFalsy();
      expect(second.err).toBeFalsy();
      const final = read('raced.nc');
      const whole = final.equals(a) || final.equals(b);
      expect(whole).toBe(true);
      expect(tempFiles()).toEqual([]);
    });

    test('refuses to write over a directory', async () => {
      fs.mkdirSync(inWatch('dir-target'), { recursive: true });
      const result = await writeFile('dir-target', 'G0\r\n');
      expect(result.err).toBeTruthy();
      expect(result.err.code).toEqual('ENOTFILE');
      expect(fs.statSync(inWatch('dir-target')).isDirectory()).toBe(true);
      expect(tempFiles()).toEqual([]);
    });

    // `prog.nc -> /etc/passwd`: the link must neither be followed (which would
    // overwrite the target) nor replaced silently.
    symlinkTest('refuses to write through or over an existing symlink', async () => {
      const outside = path.join(outsideDirectory, 'shadow');
      fs.writeFileSync(outside, 'original outside\n');
      fs.symlinkSync(outside, inWatch('shadow.nc'));
      try {
        const result = await writeFile('shadow.nc', 'G0 X1\r\n');
        expect(result.err).toBeTruthy();
        expect(result.err.code).toEqual('ENOTFILE');
        expect(fs.readFileSync(outside, 'utf8')).toEqual('original outside\n');
        expect(fs.lstatSync(inWatch('shadow.nc')).isSymbolicLink()).toBe(true);
        expect(tempFiles()).toEqual([]);

        const streamed = await writeStream('shadow.nc', Readable.from(['G0 X2\r\n']));
        expect(streamed.err.code).toEqual('ENOTFILE');
        expect(fs.readFileSync(outside, 'utf8')).toEqual('original outside\n');
      } finally {
        fs.unlinkSync(inWatch('shadow.nc'));
      }
    });

    test('writeStream reports the fingerprint of the bytes written', async () => {
      const contents = Buffer.from('G0 X1\r\nG0 X2\r\n', 'utf8');
      const result = await writeStream('streamed.nc', Readable.from([contents]));
      expect(result.err).toBeFalsy();
      expect(result.info.fingerprint).toEqual(fingerprint(contents));
      expect(result.info.size).toEqual(contents.length);
    });
  });

  describe('readProgram', () => {
    test('returns the text, fingerprint, size and mtime of a program', async () => {
      write('prog.nc', 'G0 X1\r\nG1 X2 (pièce)\r\n');
      const program = await monitor.readProgram('prog.nc');
      expect(program.text).toEqual('G0 X1\r\nG1 X2 (pièce)\r\n');
      expect(program.fingerprint).toEqual(fingerprint(read('prog.nc')));
      expect(program.size).toEqual(read('prog.nc').length);
      expect(program.mtimeMs).toEqual(fs.statSync(inWatch('prog.nc')).mtimeMs);
    });

    // The detail was served, then the file changed under the same name: the
    // next read must not describe the same program, even at the same length.
    test('a file replaced between two reads yields a different fingerprint', async () => {
      write('replaced.nc', 'G0 X10 Y10\r\nG1 X50\r\n');
      const before = await monitor.readProgram('replaced.nc');
      fs.utimesSync(inWatch('replaced.nc'), new Date(2020, 0, 1), new Date(2020, 0, 1));
      write('replaced.nc', 'G0 X11 Y10\r\nG1 X50\r\n');
      fs.utimesSync(inWatch('replaced.nc'), new Date(2020, 0, 1), new Date(2020, 0, 1));
      const after = await monitor.readProgram('replaced.nc');
      expect(after.size).toEqual(before.size);
      expect(after.text).not.toEqual(before.text);
      expect(sameProgram(before.fingerprint, after.fingerprint)).toBe(false);
    });

    const codeOf = (promise) => promise.then(() => null, (err) => err.code);

    test('refuses names with directory components, missing, empty, binary and oversized files', async () => {
      fs.mkdirSync(inWatch('nested'), { recursive: true });
      write(path.join('nested', 'inner.nc'), 'G0 X1\r\n');
      expect(await codeOf(monitor.readProgram(path.join('nested', 'inner.nc')))).toEqual('EINVALIDNAME');
      expect(await codeOf(monitor.readProgram('../x.nc'))).toEqual('EINVALIDNAME');
      expect(await codeOf(monitor.readProgram(''))).toEqual('EINVALIDNAME');
      expect(await codeOf(monitor.readProgram('nested'))).toEqual('ENOTFILE');
      expect(await codeOf(monitor.readProgram('absent.nc'))).toEqual('ENOENT');
      write('empty.nc', '');
      expect(await codeOf(monitor.readProgram('empty.nc'))).toEqual('EEMPTY');
      write('binary.nc', Buffer.from([0x47, 0x30, 0x00, 0x58]));
      expect(await codeOf(monitor.readProgram('binary.nc'))).toEqual('EBINARY');
      const big = inWatch('huge.nc');
      const fd = fs.openSync(big, 'w');
      fs.writeSync(fd, 'x', 20 * MB); // sparse: 20 MB + 1 byte
      fs.closeSync(fd);
      expect(await codeOf(monitor.readProgram('huge.nc'))).toEqual('ETOOLARGE');
    });

    symlinkTest('refuses a symlinked program', async () => {
      fs.writeFileSync(path.join(outsideDirectory, 'real.nc'), 'G0 X1\r\n');
      fs.symlinkSync(path.join(outsideDirectory, 'real.nc'), inWatch('linked.nc'));
      try {
        expect(await codeOf(monitor.readProgram('linked.nc'))).toEqual('ENOTFILE');
      } finally {
        fs.unlinkSync(inWatch('linked.nc'));
      }
    });
  });

  describe('fingerprintOf', () => {
    test('matches readProgram and is served from the cache while the file is unchanged', async () => {
      write('cached.nc', 'G0 X1\r\n'.repeat(1000));
      const first = await monitor.fingerprintOf('cached.nc');
      expect(first.fingerprint).toEqual(fingerprint(read('cached.nc')));
      expect(first.size).toEqual(read('cached.nc').length);

      const spy = jest.spyOn(fs, 'createReadStream');
      try {
        const second = await monitor.fingerprintOf('cached.nc');
        expect(second).toEqual(first);
        expect(spy).not.toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    });

    test('a write through the monitor primes the cache, and a replaced file is hashed again', async () => {
      const written = await writeFile('primed.nc', 'G0 X1\r\n');
      const spy = jest.spyOn(fs, 'createReadStream');
      try {
        const cached = await monitor.fingerprintOf('primed.nc');
        expect(cached.fingerprint).toEqual(written.info.fingerprint);
        expect(spy).not.toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
      write('primed.nc', 'G0 X2\r\n');
      const replaced = await monitor.fingerprintOf('primed.nc');
      expect(replaced.fingerprint).toEqual(fingerprint('G0 X2\r\n'));
      expect(replaced.fingerprint).not.toEqual(written.info.fingerprint);
    });

    test('reports a missing program as ENOENT and refuses an oversized one', async () => {
      await expect(monitor.fingerprintOf('nowhere.nc')).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(monitor.fingerprintOf('huge.nc')).rejects.toMatchObject({ code: 'ETOOLARGE' });
      await expect(monitor.fingerprintOf('../x.nc')).rejects.toMatchObject({ code: 'EINVALIDNAME' });
    });
  });
});
