import settings from '../config/settings';
import monitor from '../services/monitor';
import { isFingerprint, sameProgram } from '../services/touch/program-identity';
import {
  ERR_BAD_REQUEST,
  ERR_NOT_FOUND,
  ERR_CONFLICT,
  ERR_PAYLOAD_TOO_LARGE,
  ERR_UNSUPPORTED_MEDIA_TYPE,
  ERR_INTERNAL_SERVER_ERROR
} from '../constants';

// The monitor tags its errors with a `code`; anything else is unexpected and
// becomes a 500.
const statusForError = (err) => {
  switch (err && err.code) {
  case 'ENOTCONFIGURED':
  case 'EINVALIDNAME':
  case 'ENOTFILE':
  case 'EOUTSIDE':
  case 'EEMPTY':
  case 'EBINARY':
    return ERR_BAD_REQUEST;
  case 'ENOENT':
    return ERR_NOT_FOUND;
  case 'EEXIST':
  case 'ECHANGED':
    return ERR_CONFLICT;
  case 'ETOOLARGE':
    return ERR_PAYLOAD_TOO_LARGE;
  case 'EPARTIAL':
  default:
    return ERR_INTERNAL_SERVER_ERROR;
  }
};

export const getStatus = (req, res) => {
  res.send({ configured: monitor.isConfigured() });
};

export const getFiles = (req, res) => {
  const path = req.body.path || req.query.path || '';
  const files = monitor.getFiles(path);

  res.send({ path: path, files: files });
};

// A preview sidecar written by the touch interface beside a program:
// `<program>.cnctouch.json`, carrying the `fingerprint` and `size` of the
// program it was drawn from (examples/cncjs-touch/touch/shared-library.js).
const SIDECAR_SUFFIX = '.cnctouch.json';
const isSidecar = (file) => typeof file === 'string' && file.length > SIDECAR_SUFFIX.length && file.slice(-SIDECAR_SUFFIX.length) === SIDECAR_SUFFIX;

// The sidecar with its preview replaced by the verdict: the old image, bounds
// and 3D path are never handed out as current once the program differs.
const markStale = (meta, reason) => JSON.stringify({ ...meta, preview: { stale: true, reason } });

// Serve a sidecar only after comparing it with the program really on disk.
// The response carries `preview: {stale, reason, fingerprint, size}` (the
// program's actual fingerprint and size) next to `data`; when stale, `data`
// itself says so and no longer holds the old preview. Reasons:
//   fingerprint-mismatch  the program changed since the preview was made
//   size-mismatch         the sidecar's size does not describe the program
//   no-fingerprint        a sidecar from before fingerprints: to regenerate
//   program-missing       no program beside the sidecar
//   program-unreadable    the program cannot be checked (link, too large…)
//   unreadable            the sidecar is not JSON
// The sidecar reduced to what a file row needs (`part: 'thumbnail'`): the
// 192 × 108 thumbnail and the extents, without the full image, the progress
// trail and the 3D path (about 1 MB of text for a typical preview, tens of kB
// here). A sidecar written before thumbnails existed keeps its full image, so
// one request still gives the row something to show.
const THUMBNAIL_FIELDS = ['thumbnail', 'bounds', 'zBounds', 'segments', 'lines'];
const thumbnailPart = (meta) => {
  const preview = meta.preview && typeof meta.preview === 'object' ? meta.preview : null;
  if (!preview) {
    return JSON.stringify(meta);
  }
  const reduced = {};
  THUMBNAIL_FIELDS.forEach((key) => {
    if (preview[key] !== undefined) {
      reduced[key] = preview[key];
    }
  });
  if (typeof preview.thumbnail !== 'string' && preview.image !== undefined) {
    reduced.image = preview.image;
  }
  return JSON.stringify({ ...meta, preview: reduced });
};

const serveSidecar = (res, file, data, part) => {
  let meta = null;
  try {
    meta = JSON.parse(data);
  } catch (err) {
    meta = null;
  }
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    res.send({ file, data, preview: { stale: true, reason: 'unreadable' } });
    return;
  }

  const program = file.slice(0, -SIDECAR_SUFFIX.length);
  monitor.fingerprintOf(program).then((actual) => {
    let reason = '';
    if (!isFingerprint(meta.fingerprint)) {
      reason = 'no-fingerprint';
    } else if (!sameProgram(meta.fingerprint, actual.fingerprint)) {
      reason = 'fingerprint-mismatch';
    } else if (meta.size !== undefined && meta.size !== actual.size) {
      reason = 'size-mismatch';
    }
    let served = data;
    if (reason) {
      served = markStale(meta, reason);
    } else if (part === 'thumbnail') {
      served = thumbnailPart(meta);
    }
    res.send({
      file,
      data: served,
      preview: { stale: !!reason, reason, fingerprint: actual.fingerprint, size: actual.size }
    });
  }, (err) => {
    const reason = err && err.code === 'ENOENT' ? 'program-missing' : 'program-unreadable';
    res.send({ file, data: markStale(meta, reason), preview: { stale: true, reason, error: err && err.code } });
  });
};

export const readFile = (req, res) => {
  const file = req.body.file || req.query.file || '';
  const sidecar = isSidecar(file);
  const part = req.body.part || req.query.part || '';
  const { maxFileSize } = settings.middleware.upload;

  // A program read also reports the fingerprint of the bytes served, in the
  // body and in headers a Blob response can still read.
  monitor.readFile(file, { maxFileSize, withFingerprint: !sidecar }, (err, data, info) => {
    if (err) {
      const status = statusForError(err);
      let msg = 'Failed reading file';
      if (err.code === 'ENOENT') {
        msg = 'File not found';
      } else if (status !== ERR_INTERNAL_SERVER_ERROR) {
        msg = err.message || msg;
      }
      res.status(status).send({ msg });
      return;
    }

    if (sidecar) {
      serveSidecar(res, file, data, part);
      return;
    }

    if (info && info.fingerprint) {
      res.set('X-Program-Fingerprint', info.fingerprint);
      res.set('X-Program-Size', String(info.size));
      res.send({ file, data, fingerprint: info.fingerprint, size: info.size });
      return;
    }

    res.send({ file: file, data: data });
  });
};

export const writeFile = (req, res) => {
  // The upload kind is taken from the content type rather than inferred from
  // whether body-parser produced anything: an empty JSON body (`{}`) parses to
  // an empty object, which is indistinguishable from "not parsed" and would
  // otherwise be streamed to disk instead of answering "No file specified".
  const isRawUpload = req.is('application/octet-stream');
  const isJSON = req.is('application/json');

  if (!isRawUpload && !isJSON) {
    res.status(ERR_UNSUPPORTED_MEDIA_TYPE).send({
      msg: 'Unsupported content type'
    });
    return;
  }

  // A raw upload carries only the file's bytes, so its name comes from the
  // query string.
  const file = (isRawUpload ? req.query.file : req.body.file) || '';

  if (!file) {
    res.status(ERR_BAD_REQUEST).send({
      msg: 'No file specified'
    });
    return;
  }

  // The answer names the file and, from the monitor, the fingerprint and size
  // of the bytes written: what a preview sidecar must carry.
  const done = (err, info) => {
    if (err) {
      let status = statusForError(err);
      if (err.message === 'Watch directory is not configured') {
        status = ERR_BAD_REQUEST;
      }
      res.status(status).send({
        msg: err.message || 'Failed writing file'
      });
      return;
    }

    if (info && info.fingerprint) {
      res.send({ file, fingerprint: info.fingerprint, size: info.size });
      return;
    }
    res.send({ file });
  };

  if (isRawUpload) {
    const { maxFileSize } = settings.middleware.upload;
    monitor.writeStream(file, req, { maxFileSize }, done);
    return;
  }

  monitor.writeFile(file, req.body.data || '', done);
};

export const renameFile = (req, res) => {
  const file = req.body.file || req.query.file || '';
  const to = req.body.to || req.query.to || '';

  if (!file || !to) {
    res.status(ERR_BAD_REQUEST).send({
      msg: 'No file specified'
    });
    return;
  }

  monitor.renameFile(file, to, (err) => {
    if (err) {
      res.status(statusForError(err)).send({
        msg: err.message || 'Failed renaming file'
      });
      return;
    }

    res.send({ file: to });
  });
};

export const deleteFile = (req, res) => {
  const file = req.body.file || req.query.file || '';

  if (!file) {
    res.status(ERR_BAD_REQUEST).send({
      msg: 'No file specified'
    });
    return;
  }

  monitor.deleteFile(file, (err) => {
    if (err) {
      res.status(statusForError(err)).send({
        msg: err.message || 'Failed deleting file'
      });
      return;
    }

    res.send({ file: file });
  });
};
