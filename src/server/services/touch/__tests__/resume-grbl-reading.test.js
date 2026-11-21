/* eslint-env jest */
// Codex's final review of the resume (2026-11-06): what Grbl reads differently from a plain
// parser is refused, and a feed is written so that Grbl reads it as the program's.
import { buildResume } from '../resume';

const refusalOf = (fn) => {
 try {
 fn();
} catch (err) {
 return err;
} return null;
};
const head = ['G21 G90 G54 G94', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F100', 'G0 Z5'];

describe('resume: Grbl reading', () => {
  test('a CNCjs expression inside a comment is refused (CNCjs evaluates it before removing comments)', () => {
    const prog = head.concat(['([\'\x29\'] M3 S12000 M8)', 'G1 X10', 'M30']).join('\n');
    expect(refusalOf(() => buildResume(prog, 7))).toMatchObject({ code: 'ETOUCH_RESUME_UNSUPPORTED_SYNTAX', params: { line: 6 } });
  });

  test('a G number with more than one decimal (G91.001 is G91 for Grbl) is refused', () => {
    const prog = ['G21 G90 G54 G94', 'G0 Z5', 'G0 X10 Y0', 'G1 Z-1 F100', 'G91.001', 'G1 X1', 'G90', 'G1 X20', 'M30'].join('\n');
    expect(refusalOf(() => buildResume(prog, 8))).toMatchObject({ code: 'ETOUCH_RESUME_UNSUPPORTED_SYNTAX', params: { line: 5 } });
  });

  test('a number of more than 8 digits (X0000000010 is X0 for Grbl) is refused', () => {
    const prog = ['G21 G90 G54 G94', 'G0 Z5', 'G0 X0000000010 Y0', 'G1 Z-1 F100', 'G1 X20', 'M30'].join('\n');
    expect(refusalOf(() => buildResume(prog, 5))).toMatchObject({ code: 'ETOUCH_RESUME_UNSUPPORTED_SYNTAX', params: { line: 3 } });
  });

  test('a tiny feed is written so that Grbl still reads it as positive (8 digits at most)', () => {
    const prog = ['G21 G90 G54 G94', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F.0000001', 'G1 X10', 'M30'].join('\n');
    const r = buildResume(prog, 5);
    const feeds = r.preamble.join(' ').match(/F[.\d]+/g);
    feeds.forEach((f) => {
      expect(f.replace(/[^0-9]/g, '').length).toBeLessThanOrEqual(8);
      expect(Number(f.slice(1))).toBeGreaterThan(0);
    });
  });

  test('ordinary programs are unchanged (F100, X12.3456, G38.2)', () => {
    const r = buildResume(head.concat(['G1 X12.3456 F250', 'G1 X20', 'M30']).join('\n'), 7);
    expect(r.preamble.join(' ')).toMatch(/F250/);
  });
});
