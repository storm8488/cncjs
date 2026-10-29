import { EventEmitter } from 'events';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { pipeline, Readable, Transform } from 'stream';
import minimatch from 'minimatch';
import FSMonitor from './FSMonitor';
import { createHasher } from '../touch/program-identity';

const monitor = new FSMonitor();

const emitter = new EventEmitter();

const fsp = fs.promises;

// Largest program handed to a controller from the library (the job service's
// limit; examples/cncjs-touch refuses larger uploads too).
const MAX_PROGRAM_SIZE = 20 * 1024 * 1024;

const start = ({ watchDirectory }) => {
  monitor.watch(watchDirectory);

  monitor.on('created', (file) => {
    emitter.emit('change', { file });
  });
  monitor.on('changed', (file) => {
    emitter.emit('change', { file });
  });
  monitor.on('removed', (file) => {
    emitter.emit('change', { file });
  });
};

const stop = () => {
  monitor.unwatch();
};

const isConfigured = () => Boolean(monitor.root);

const getFiles = (searchPath) => {
  const root = path.normalize(monitor.root);
  const files = Object.keys(monitor.files);
  const pattern = path.join(root, searchPath, '*');

  if (!root || pattern.indexOf(root) !== 0) {
    return [];
  }

  return minimatch
    .match(files, pattern, { matchBase: true })
    .map(file => {
      const stat = monitor.files[file] || {};

      return {
        name: path.basename(file),
        type: (function() {
          if (stat.isFile()) {
            return 'f';
          }
          if (stat.isDirectory()) {
            return 'd';
          }
          if (stat.isBlockDevice()) {
            return 'b';
          }
          if (stat.isCharacterDevice()) {
            return 'c';
          }
          if (stat.isSymbolicLink()) {
            return 'l';
          }
          if (stat.isFIFO()) {
            return 'p';
          }
          if (stat.isSocket()) {
            return 's';
          }
          return '';
        }()),
        size: stat.size,
        atime: stat.atime,
        mtime: stat.mtime,
        ctime: stat.ctime
      };
    });
};

// Errors carry a `code` so the API layer can map them to a status without
// matching on message text:
//   ENOTCONFIGURED  no watch directory
//   EINVALIDNAME    not a plain file name (readProgram, rename, delete)
//   EOUTSIDE        the real file is not inside the real watch directory
//   ENOENT          no such file
//   ENOTFILE        a directory, a symbolic link or a special file
//   ETOOLARGE       over the size limit
//   EEMPTY/EBINARY  not a program (readProgram)
//   ECHANGED        the file changed while it was read
//   EEXIST/EPARTIAL rename
const failure = (code, message) => {
  const err = new Error(message);
  err.code = code;
  return err;
};

// Resolve a name to a path inside the watch directory, or null if it does not
// name a file directly inside it.
//
// `writeFile()` strips directory components with `path.basename()`, which is
// right when creating a file: the caller gets the file they asked for, in the
// only directory this service writes to. Renaming and deleting must refuse
// instead, because the same silent correction would act on a *different*
// existing file than the caller named — `../../program.nc` becoming
// `program.nc` deletes the wrong file rather than failing.
const resolveInRoot = (root, name) => {
  if (!name || typeof name !== 'string' || name !== path.basename(name)) {
    return null;
  }
  const base = path.resolve(root);
  const resolved = path.resolve(base, name);
  if (path.dirname(resolved) !== base) {
    return null;
  }
  return resolved;
};

// Fingerprints of programs already hashed, so a sidecar check does not read
// 20 MB again at every detail (the server may run on a Tegra 3 tablet). The
// key is the file's identity on disk: real path, size, mtime and inode — a
// file replaced under the same name gets a new key. Bounded; least recently
// used entries go first.
const FINGERPRINT_CACHE_LIMIT = 64;
const fingerprints = new Map();
const cacheKey = (real, stats) => `${real}\0${stats.size}\0${stats.mtimeMs}\0${stats.ino}`;
const recall = (real, stats) => {
  const key = cacheKey(real, stats);
  const hit = fingerprints.get(key);
  if (hit) {
    fingerprints.delete(key);
    fingerprints.set(key, hit);
  }
  return hit || null;
};
const remember = (real, stats, fingerprint) => {
  const key = cacheKey(real, stats);
  fingerprints.delete(key);
  fingerprints.set(key, fingerprint);
  while (fingerprints.size > FINGERPRINT_CACHE_LIMIT) {
    fingerprints.delete(fingerprints.keys().next().value);
  }
};

const sameStat = (a, b) => a.size === b.size && a.mtimeMs === b.mtimeMs && a.ino === b.ino;

const hashBuffer = (buffer) => {
  const hasher = createHasher();
  hasher.update(buffer);
  return hasher.digest();
};

// Where `target` (an absolute path under the watch root) really is. Resolves
// {real, stats} for a plain file whose real location is inside the real watch
// directory (`direct`: immediately inside it, no subdirectory).
//
// `lstat()` first: a symbolic link is refused as such, whatever it points at,
// so `prog.nc -> /etc/passwd` is neither read nor written through. Then both
// the root and the target go through `realpath()`: a directory link inside
// the watch directory (a junction, a symlinked folder) makes `sub/x.nc`
// textually inside while the file is elsewhere.
const locateFile = async (target, { direct = false } = {}) => {
  let stats;
  try {
    stats = await fsp.lstat(target);
  } catch (err) {
    throw err.code === 'ENOENT' ? failure('ENOENT', 'File not found') : err;
  }
  if (stats.isSymbolicLink()) {
    throw failure('ENOTFILE', 'Symbolic links are not allowed');
  }
  if (!stats.isFile()) {
    throw failure('ENOTFILE', 'Not a file');
  }
  const [root, real] = await Promise.all([fsp.realpath(monitor.root), fsp.realpath(target)]);
  const inside = direct ? path.dirname(real) === root : real.indexOf(root + path.sep) === 0;
  if (!inside) {
    throw failure('EOUTSIDE', 'File is outside of the watch directory');
  }
  return { real, stats };
};

// Read a located file whole, then check that what was read is the file that
// was located: same size, mtime and inode before and after.
const readChecked = async (target, { maxFileSize = Infinity, direct = false, withFingerprint = false } = {}) => {
  const { real, stats } = await locateFile(target, { direct });
  if (stats.size > maxFileSize) {
    throw failure('ETOOLARGE', 'File too large');
  }
  const buffer = await fsp.readFile(real);
  const after = await fsp.stat(real);
  if (buffer.length !== stats.size || !sameStat(stats, after)) {
    throw failure('ECHANGED', 'File changed while it was read');
  }
  let fingerprint;
  if (withFingerprint) {
    fingerprint = hashBuffer(buffer);
    remember(real, after, fingerprint);
  }
  return { real, buffer, stats: after, fingerprint };
};

// Hand a promise's outcome to a Node-style callback, outside the promise
// chain so an exception thrown by the callback is not mistaken for a failure.
const settle = (promise, callback, onValue) => {
  promise.then((value) => {
    process.nextTick(() => callback(null, ...onValue(value)));
  }, (err) => {
    process.nextTick(() => callback(err));
  });
};

// Read a file inside the watch directory, in a subdirectory if the name has
// one (the Watch Directory widget navigates them). `options.maxFileSize`
// bounds the read; `options.withFingerprint` adds a third callback argument
// `{fingerprint, size, mtimeMs}` describing the bytes served.
const readFile = (file, options, callback) => {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  const { maxFileSize = Infinity, withFingerprint = false } = options || {};
  const root = monitor.root;

  if (!root) {
    callback(failure('ENOTCONFIGURED', 'Watch directory is not configured'));
    return;
  }

  // Refuse names that leave the watched directory (`../`, absolute paths).
  const base = path.resolve(root);
  const target = path.resolve(base, String(file));
  const relative = path.relative(base, target);
  if (!relative || relative.split(path.sep)[0] === '..' || path.isAbsolute(relative)) {
    callback(failure('EOUTSIDE', 'File is outside of the watch directory'));
    return;
  }

  settle(readChecked(target, { maxFileSize, withFingerprint }), callback, ({ buffer, stats, fingerprint }) => [
    buffer.toString('utf8'),
    withFingerprint ? { fingerprint, size: stats.size, mtimeMs: stats.mtimeMs } : undefined
  ]);
};

// Read a program directly inside the watch directory, with the guarantees the
// job service relies on before handing it to a controller: a plain file (no
// link) really inside the directory, not empty, at most MAX_PROGRAM_SIZE, no
// NUL byte, unchanged between the stat before and after the read. Resolves
// {text, fingerprint, size, mtimeMs}; `fingerprint` describes the exact bytes
// read.
const readProgram = async (name) => {
  const root = monitor.root;
  if (!root) {
    throw failure('ENOTCONFIGURED', 'Watch directory is not configured');
  }
  const target = resolveInRoot(root, name);
  if (!target) {
    throw failure('EINVALIDNAME', 'Invalid file name');
  }
  const { buffer, stats, fingerprint } = await readChecked(target, { maxFileSize: MAX_PROGRAM_SIZE, direct: true, withFingerprint: true });
  if (!stats.size) {
    throw failure('EEMPTY', 'Empty file');
  }
  if (buffer.includes(0)) {
    throw failure('EBINARY', 'Binary file');
  }
  return { text: buffer.toString('utf8'), fingerprint, size: stats.size, mtimeMs: stats.mtimeMs };
};

// The fingerprint of a program directly inside the watch directory, from the
// cache when the file has not changed since it was last hashed or written.
// Resolves {fingerprint, size, mtimeMs}.
const fingerprintOf = async (name) => {
  const root = monitor.root;
  if (!root) {
    throw failure('ENOTCONFIGURED', 'Watch directory is not configured');
  }
  const target = resolveInRoot(root, name);
  if (!target) {
    throw failure('EINVALIDNAME', 'Invalid file name');
  }
  const { real, stats } = await locateFile(target, { direct: true });
  if (stats.size > MAX_PROGRAM_SIZE) {
    throw failure('ETOOLARGE', 'File too large');
  }
  const cached = recall(real, stats);
  if (cached) {
    return { fingerprint: cached, size: stats.size, mtimeMs: stats.mtimeMs };
  }
  const hasher = createHasher();
  for await (const chunk of fs.createReadStream(real)) {
    hasher.update(chunk);
  }
  const after = await fsp.stat(real);
  if (!sameStat(stats, after)) {
    throw failure('ECHANGED', 'File changed while it was read');
  }
  const fingerprint = hasher.digest();
  remember(real, after, fingerprint);
  return { fingerprint, size: after.size, mtimeMs: after.mtimeMs };
};

// Stat a name inside the watch directory, rejecting anything that is not a
// plain file. Shared by rename and delete so both refuse directories the same
// way.
//
// `lstat()` rather than `stat()`: `stat()` follows symbolic links, so a symlink
// pointing at a regular file would satisfy `isFile()` and be accepted — which
// is the wrong answer for an operation meant to act on plain files in this
// directory, and lets a link stand in for a file somewhere else entirely.
const statFileInRoot = (name, callback) => {
  const root = monitor.root;

  if (!root) {
    callback(failure('ENOTCONFIGURED', 'Watch directory is not configured'));
    return;
  }

  const target = resolveInRoot(root, name);
  if (!target) {
    callback(failure('EINVALIDNAME', 'Invalid file name'));
    return;
  }

  fs.lstat(target, (err, stats) => {
    if (err) {
      callback(err.code === 'ENOENT' ? failure('ENOENT', 'File not found') : err);
      return;
    }
    if (!stats.isFile()) {
      callback(failure('ENOTFILE', 'Not a file'));
      return;
    }
    callback(null, target);
  });
};

// Filesystems that support ordinary reads, writes and deletes but no hard
// links — FAT32 and exFAT removable media, some network mounts — reject
// `link()` outright. A watch directory on a USB stick is an ordinary setup, so
// rename falls back rather than failing on those.
const NO_HARDLINK_SUPPORT = ['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EXDEV'];

// Claim `toPath` for `fromPath`'s contents without overwriting anything.
//
// `fs.link()` is preferred because it fails with EEXIST *atomically*: a
// stat-then-rename check cannot, since the target may appear in between.
// Where hard links are unsupported, `copyFile()` with COPYFILE_EXCL still
// refuses to overwrite, though the check and the write are no longer one
// operation.
const claimName = (fromPath, toPath, callback) => {
  fs.link(fromPath, toPath, (linkErr) => {
    if (!linkErr) {
      callback(null);
      return;
    }
    if (linkErr.code === 'EEXIST') {
      callback(failure('EEXIST', 'Target file already exists'));
      return;
    }
    if (NO_HARDLINK_SUPPORT.indexOf(linkErr.code) < 0) {
      callback(linkErr);
      return;
    }
    fs.copyFile(fromPath, toPath, fs.constants.COPYFILE_EXCL, (copyErr) => {
      if (copyErr) {
        callback(copyErr.code === 'EEXIST'
          ? failure('EEXIST', 'Target file already exists')
          : copyErr);
        return;
      }
      callback(null);
    });
  });
};

// Rename a file within the watch directory.
//
// Unlike writing, this must not overwrite: `fs.rename()` would silently
// replace an existing target, destroying a program the caller never named. The
// new name is claimed first (see `claimName`), and the original removed only
// once that has succeeded.
const renameFile = (file, to, callback) => {
  statFileInRoot(file, (err, fromPath) => {
    if (err) {
      callback(err);
      return;
    }

    const toPath = resolveInRoot(monitor.root, to);
    if (!toPath) {
      callback(failure('EINVALIDNAME', 'Invalid file name'));
      return;
    }
    if (toPath === fromPath) {
      callback(null);
      return;
    }

    claimName(fromPath, toPath, (claimErr) => {
      if (claimErr) {
        callback(claimErr);
        return;
      }
      fs.unlink(fromPath, (unlinkErr) => {
        if (!unlinkErr) {
          callback(null);
          return;
        }
        // The new name exists but the old one could not be removed. Give the
        // new name back so the directory is left as it was found.
        fs.unlink(toPath, (rollbackErr) => {
          if (rollbackErr) {
            // Both removals failed, so both names now refer to the file and
            // the caller must be told rather than shown the original error.
            callback(failure('EPARTIAL',
              `Renamed to ${path.basename(toPath)} but ${path.basename(fromPath)} could not be removed; both names now exist`));
            return;
          }
          callback(unlinkErr);
        });
      });
    });
  });
};

// Delete a file within the watch directory. Files only — a directory is
// refused rather than removed.
const deleteFile = (file, callback) => {
  statFileInRoot(file, (err, target) => {
    if (err) {
      callback(err);
      return;
    }
    fs.unlink(target, (unlinkErr) => {
      callback(unlinkErr || null);
    });
  });
};

// Fail the stream once more than `maxFileSize` bytes have passed through.
// Counting here rather than trusting Content-Length means a body that lies
// about its length, or sends none at all, is still bounded. `observe` sees
// every chunk let through, in order.
const createLimitStream = (maxFileSize, observe) => {
  let size = 0;

  return new Transform({
    transform(chunk, encoding, callback) {
      size += chunk.length;

      if (size > maxFileSize) {
        const err = new Error('Payload too large');
        err.code = 'ETOOLARGE';
        callback(err);
        return;
      }

      observe(chunk);
      callback(null, chunk);
    }
  });
};

// Replace `target` with `temp`. Windows refuses to replace a file that another
// handle holds open at that instant (EPERM/EBUSY/EACCES), which a concurrent
// writer's stat, the directory monitor or an antivirus scan can cause for a few
// milliseconds: a bounded retry, as graceful-fs does, rather than a failed
// upload. Other platforms never take the retry path.
const RENAME_RETRY_CODES = ['EPERM', 'EBUSY', 'EACCES'];
const RENAME_ATTEMPTS = 20;
const replaceFile = (temp, target, callback, attempt = 1) => {
  fs.rename(temp, target, (err) => {
    if (err && RENAME_RETRY_CODES.indexOf(err.code) >= 0 && attempt < RENAME_ATTEMPTS) {
      setTimeout(() => replaceFile(temp, target, callback, attempt + 1), 25);
      return;
    }
    callback(err || null);
  });
};

// Stream a readable (e.g. a request body) into the watch directory without
// holding the whole file in memory. Writes to a temporary name first and
// renames into place on completion, so a partially written file never appears
// under its final name inside the watched directory, and a write that fails
// midway leaves the previous version untouched. Two writers of the same name
// each have their own temporary; the last rename wins whole.
//
// `pipeline()` owns the lifecycle: it propagates errors in either direction,
// applies backpressure, destroys every participating stream when one fails,
// and reports a client that disconnects mid-upload as a premature close. The
// temporary file is removed on any of those, so a failed or abandoned upload
// leaves nothing behind.
//
// The callback receives `{fingerprint, size, mtimeMs}` describing the bytes
// written; the fingerprint is cached for `fingerprintOf()`.
const writeStream = (file, readable, { maxFileSize = Infinity } = {}, callback) => {
  const root = monitor.root;

  if (!root) {
    callback(failure('ENOTCONFIGURED', 'Watch directory is not configured'));
    return;
  }

  // Strip any directory components to prevent writing outside of the watched directory
  const filename = path.basename(String(file));
  if (!filename || filename === '.' || filename === '..') {
    callback(failure('EINVALIDNAME', 'Invalid file name'));
    return;
  }
  const target = path.join(root, filename);
  const temp = path.join(root, `.${filename}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`);

  // An existing link under this name is neither written through nor replaced,
  // and a directory is never overwritten. (A link planted between this check
  // and the rename would be replaced by the rename, never followed.)
  fs.lstat(target, (statErr, existing) => {
    if (statErr && statErr.code !== 'ENOENT') {
      callback(statErr);
      return;
    }
    if (existing && !existing.isFile()) {
      callback(failure('ENOTFILE', existing.isSymbolicLink() ? 'Symbolic links are not allowed' : 'Not a file'));
      return;
    }

    const hasher = createHasher();
    let size = 0;

    pipeline(
      readable,
      createLimitStream(maxFileSize, (chunk) => {
        hasher.update(chunk);
        size += chunk.length;
      }),
      fs.createWriteStream(temp, { flags: 'wx' }),
      (err) => {
        if (err) {
          fs.unlink(temp, () => {
            callback(err);
          });
          return;
        }

        replaceFile(temp, target, (renameErr) => {
          if (renameErr) {
            fs.unlink(temp, () => {
              callback(renameErr);
            });
            return;
          }

          const fingerprint = hasher.digest();
          const described = (async () => {
            const real = await fsp.realpath(target);
            const stats = await fsp.stat(real);
            if (stats.size === size) {
              remember(real, stats, fingerprint);
            }
            return { fingerprint, size, mtimeMs: stats.mtimeMs };
          })();
          described.then((info) => {
            process.nextTick(() => callback(null, info));
          }, () => {
            // The file is written; only the description after the fact failed.
            process.nextTick(() => callback(null, { fingerprint, size, mtimeMs: undefined }));
          });
        });
      }
    );
  });
};

// Write a string (or buffer) as a file in the watch directory, through the
// same temporary-then-rename path as `writeStream()`: never a direct write
// over the previous version.
const writeFile = (file, data, callback) => {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data === undefined || data === null ? '' : String(data), 'utf8');
  writeStream(file, Readable.from([buffer]), {}, callback);
};

const on = (...args) => {
  emitter.on(...args);
};

const removeListener = (...args) => {
  emitter.removeListener(...args);
};

export default {
  MAX_PROGRAM_SIZE,
  start,
  stop,
  isConfigured,
  getFiles,
  readFile,
  readProgram,
  fingerprintOf,
  writeFile,
  writeStream,
  renameFile,
  deleteFile,
  on,
  removeListener
};
