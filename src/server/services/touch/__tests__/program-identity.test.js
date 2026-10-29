/* eslint-env jest */
import crypto from 'crypto';
import { fingerprint, sameProgram, isFingerprint, createHasher } from '../program-identity';

describe('program-identity', () => {
  test('fingerprint is the SHA-256 of the exact bytes, prefixed', () => {
    const bytes = Buffer.from('G0 X1\r\nG1 X2 (pièce)\r\n', 'utf8');
    const expected = 'sha256:' + crypto.createHash('sha256').update(bytes).digest('hex');
    expect(fingerprint(bytes)).toEqual(expected);
    expect(fingerprint(bytes)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  test('a string is hashed as its UTF-8 bytes', () => {
    const text = 'G0 X1 (pièce)\n';
    expect(fingerprint(text)).toEqual(fingerprint(Buffer.from(text, 'utf8')));
    // Windows-1252 bytes of the same text are a different program.
    expect(fingerprint(text)).not.toEqual(fingerprint(Buffer.from(text, 'latin1')));
  });

  test('two programs of the same length that differ only at the start are different', () => {
    const a = 'G0 X10 Y10\n' + 'G1 X1\nG1 X2\n'.repeat(50);
    const b = 'G0 X11 Y10\n' + 'G1 X1\nG1 X2\n'.repeat(50);
    expect(a.length).toEqual(b.length);
    expect(fingerprint(a)).not.toEqual(fingerprint(b));
  });

  test('the incremental hasher matches the one-shot fingerprint', () => {
    const hasher = createHasher();
    hasher.update(Buffer.from('G0 X1\n'));
    hasher.update('G1 X2\n');
    expect(hasher.digest()).toEqual(fingerprint('G0 X1\nG1 X2\n'));
  });

  test('sameProgram is strict and false when either side is missing', () => {
    const fp = fingerprint('G0 X1');
    expect(sameProgram(fp, fp)).toBe(true);
    expect(sameProgram(fp, fingerprint('G0 X2'))).toBe(false);
    expect(sameProgram(fp, undefined)).toBe(false);
    expect(sameProgram(null, fp)).toBe(false);
    expect(sameProgram('', '')).toBe(false);
    expect(sameProgram(fp.toUpperCase(), fp)).toBe(false);
    expect(sameProgram('abc', 'abc')).toBe(false);
  });

  test('isFingerprint accepts only the sha256 form', () => {
    expect(isFingerprint(fingerprint('x'))).toBe(true);
    expect(isFingerprint('sha256:' + 'g'.repeat(64))).toBe(false);
    expect(isFingerprint('md5:' + 'a'.repeat(32))).toBe(false);
    expect(isFingerprint(42)).toBe(false);
  });
});
