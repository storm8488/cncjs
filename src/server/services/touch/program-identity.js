// Identity of a G-code program: the SHA-256 of its exact bytes as stored in
// the watch directory. A preview sidecar carries the fingerprint of the file it
// was drawn from, so a program replaced under the same name (a copy into the
// directory, an upload from the classic interface) is never served with the
// old preview as if it were current.
import crypto from 'crypto';

const PREFIX = 'sha256:';
const PATTERN = /^sha256:[0-9a-f]{64}$/;

// Incremental hasher for streamed files; `digest()` returns the fingerprint.
export const createHasher = () => {
  const hash = crypto.createHash('sha256');
  return {
    update: (chunk) => {
      hash.update(chunk);
    },
    digest: () => PREFIX + hash.digest('hex')
  };
};

// `fingerprint(bufferOrString)` → 'sha256:<64 hex>'. A string is hashed as its
// UTF-8 bytes, which is what the monitor writes for a JSON upload.
export const fingerprint = (input) => {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf8');
  const hasher = createHasher();
  hasher.update(buffer);
  return hasher.digest();
};

export const isFingerprint = (value) => typeof value === 'string' && PATTERN.test(value);

// Strict comparison; false whenever either side is missing or malformed.
export const sameProgram = (a, b) => isFingerprint(a) && isFingerprint(b) && a === b;

export default { fingerprint, sameProgram, isFingerprint, createHasher };
