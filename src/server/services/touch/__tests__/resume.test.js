/* eslint-env jest */
import gcodeParser from 'gcode-parser';
import translateExpression from '../../../lib/translate-expression';
import { buildResume, programLines, stateBefore } from '../resume';
import { codeOf, analyzeProgram } from '../program-check';
import { changesOffset } from '../job-service';
import { expectCatalogMatch } from './touch-codes-catalog';

const PROGRAM = [
  '(roughing)',
  'G21 G90 G17',
  'G54',
  'T2 M6',
  'M3 S12000',
  'M8',
  'G0 Z5',
  'G0 X10 Y10',
  '',
  'G1 Z-1.5 F300',
  'G1 X40 F1200',
  'Y30',
  'G2 X50 Y40 I10 J0',
  'G1 X10 Y40',
  'G0 Z5',
  'M5 M9',
  'M30'
].join('\n');

describe('resume after a nested comment', () => {
  test('a "(" inside an unclosed comment hides the rest of the line, as the CNCjs sender does', () => {
    // The sender (gcode-parser 2.2) sends nothing of line 4: the tool stays at X0 Y0.
    const program = ['G21 G90', 'G0 Z5', 'G0 X0 Y0', '(old (v1) G0 X50 Y50', 'G1 Z-1 F100', 'G1 X10', 'G0 Z5', 'M30'].join('\n');
    const plan = buildResume(program, 6);
    expect(plan.position).toEqual({ X: 0, Y: 0, Z: -1 });
    expect(plan.preamble).toContain('G0 X0 Y0');
    // A balanced nested comment still leaves the code after it.
    expect(stateBefore(programLines('G21 G90\nG0 Z5 X1 Y1\n(note (v2) end) G1 X5 F100\nM30'), 4).pos).toEqual({ X: 5, Y: 1, Z: 5 });
  });
});

describe('resume refusals carry a stable code and the values of their message', () => {
  const P = (...lines) => lines.join('\n');
  const refusal = (fn) => {
    try {
      fn();
    } catch (err) {
      return { status: err.status, code: err.code, params: err.params, message: err.message };
    }
    throw new Error('not refused');
  };
  test.each([
    ['ETOUCH_RESUME_LINE', () => buildResume(P('G21 G90', 'G0 Z5'), 9), { min: 2, max: 2 }],
    ['ETOUCH_RESUME_ORIGIN_CHANGED', () => buildResume(P('G21 G90', 'G92 X0', 'G0 Z5'), 3), { from: 3, line: 2 }],
    ['ETOUCH_RESUME_INVERSE_TIME', () => buildResume(P('G21 G90', 'G93', 'G0 Z5'), 3), { from: 3 }],
    ['ETOUCH_RESUME_EXPRESSION', () => buildResume(P('G21 G90', 'G0 Z[5+1]', 'G0 X1'), 3), { line: 2, from: 3 }],
    ['ETOUCH_RESUME_CUTTER_COMPENSATION', () => buildResume(P('G21 G90', 'G41 D1', 'G0 Z5'), 3), { line: 2 }],
    ['ETOUCH_RESUME_TOOL_LENGTH', () => buildResume(P('G21 G90', 'G43 H1', 'G0 Z5'), 3), { line: 2 }],
    ['ETOUCH_RESUME_UNITS_LATE', () => buildResume(P('G0 Z5', 'G21', 'G0 X1'), 3), { units: 'G21', line: 2 }],
    ['ETOUCH_RESUME_RELATIVE', () => buildResume(P('G21 G91', 'G0 Z5', 'G0 X1'), 3), { from: 3 }],
    ['ETOUCH_RESUME_TOOL_OFFSET', () => buildResume(P('G21 G90', 'G43.1 Z2', 'G0 Z5 X0 Y0', 'G1 Z-1 F100', 'G1 X1'), 5), { line: 2, from: 5 }],
    ['ETOUCH_RESUME_POSITION', () => buildResume(P('G21 G90', 'G0 Z5', 'G1 X1 F100'), 3), { from: 3 }],
    ['ETOUCH_RESUME_WCS_POSITION', () => buildResume(P('G21 G90 G54', 'G0 Z5 X0 Y0', 'G55', 'G0 X1', 'G1 X2 F100'), 5), { wcs: 'G55', line: 3, from: 5 }],
    // ETOUCH_RESUME_CLEARANCE is defensive: a known Z always sets the clearance.
    ['ETOUCH_RESUME_NO_RAPID_Z', () => buildResume(P('G21 G90', 'G0 X0 Y0', 'G1 Z5 F100', 'G1 Z-1', 'G1 X1'), 5), { from: 5, wcs: null }],
    ['ETOUCH_RESUME_FEED', () => buildResume(P('G21 G90', 'G0 Z5 X0 Y0', 'G0 Z1', 'G1 X1'), 4), { from: 4 }],
    ['ETOUCH_RESUME_SPINDLE_SPEED', () => buildResume(P('G21 G90', 'M3', 'G0 Z5 X0 Y0', 'G1 Z-1 F100', 'G1 X1'), 5), { from: 5 }]
  ])('%s', (code, fn, params) => {
    const r = refusal(fn);
    expect(r).toMatchObject({ status: 409, code, params });
    // The French message is built from the same values.
    Object.values(params).filter((v) => v !== null).forEach((v) => expect(r.message).toContain(String(v)));
  });
});

describe('resume from a line', () => {
  test('lines are numbered like the CNCjs sender: non-empty lines, comments included', () => {
    const lines = programLines(PROGRAM);
    expect(lines).toHaveLength(16);
    expect(lines[0]).toBe('(roughing)');
    expect(lines[11]).toBe('G2 X50 Y40 I10 J0');
  });

  test('the preamble restores modes, clears at the clearance height, restarts spindle and coolant, plunges', () => {
    const r = buildResume(PROGRAM, 12, { name: 'part.nc' });
    expect(r.preamble).toEqual([
      '(CNCjs Touch : reprise a la ligne 12 de part.nc)',
      'G21 G90 G17 G54 G94',
      'G0 Z5',
      'G0 X40 Y30',
      'M3 S12000',
      'G4 P3',
      'M8',
      'G1 Z-1.5 F300',
      'F1200'
    ]);
    expect(r.line).toBe('G2 X50 Y40 I10 J0');
    expect(r.program.split('\n').slice(9, 11)).toEqual(['G2 X50 Y40 I10 J0', 'G1 X10 Y40']);
    expect(r.program.endsWith('M30\n')).toBe(true);
    expect(r).toMatchObject({ tool: 2, toolChanged: true, spindle: { mode: 'M3', speed: 12000 }, coolant: 'M8', total: 16 });
  });

  test('units and work offset the program never chose are left to the controller (no forced G54/G21)', () => {
    // E-3 (5e tour) : the distance mode must be chosen (G90), units and offset may not.
    const prog = ['G90 G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F200', 'G1 X10 F800', 'G1 Y10', 'G1 X0', 'M30'].join('\n');
    const r = buildResume(prog, 5);
    expect(r.preamble[1]).toBe('G90 G94');
    expect(r).toMatchObject({ wcs: null, units: null });
    const chosen = buildResume('G20 G55\n' + prog, 6);
    expect(chosen.preamble[1]).toBe('G20 G90 G55 G94');
  });

  test('a compact first line keeps its own motion word (G90G1X10)', () => {
    const prog = ['G21 G90', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F200', 'G90G1X20', 'N7G1X30', 'M30'].join('\n');
    expect(buildResume(prog, 5).program.split('\n')).toContain('G90G1X20');
    expect(buildResume(prog, 6).program.split('\n')).toContain('N7G1X30');
  });

  test('a first line relying on the modal motion gets it back', () => {
    const r = buildResume(PROGRAM, 11);
    expect(r.position).toEqual({ X: 40, Y: 10, Z: -1.5 });
    expect(r.program.split('\n')[9]).toBe('G1 Y30');
  });

  test('incremental moves are followed, but a resume inside G91 is refused', () => {
    const prog = ['G21 G90', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F100', 'G91', 'G1 X10 F500', 'G1 Y5', 'G90', 'G1 X20 Y20', 'M30'].join('\n');
    expect(stateBefore(programLines(prog), 9).pos).toEqual({ X: 10, Y: 5, Z: -1 });
    expect(buildResume(prog, 9).preamble).toContain('G0 X10 Y5');
    expect(() => buildResume(prog, 7)).toThrow(/G91/);
  });

  test('anything that makes the state uncertain is refused, not guessed', () => {
    const base = ['G21 G90', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F100', 'G1 X5', 'G1 X6', 'M30'];
    const at = (insert, from) => {
      const prog = base.slice(0, 4).concat(insert, base.slice(4)).join('\n');
      return () => buildResume(prog, from);
    };
    expect(at(['G92 X0'], 7)).toThrow(/G10\/G92/);
    expect(at(['G10 L20 P1 Z0'], 7)).toThrow(/G10\/G92/);
    expect(at(['G93'], 7)).toThrow(/G93/);
    // A machine-coordinate move hides the work position until it is set again.
    expect(at(['G53 G0 Z-1'], 6)).toThrow(/Position/);
    expect(at(['G28'], 6)).toThrow(/Position/);
    expect(() => buildResume(base.join('\n'), 3)).toThrow(/Position|dégagement/);
    expect(() => buildResume(base.join('\n'), 1)).toThrow(/entre 2 et 7/);
    expect(() => buildResume(base.join('\n'), 8)).toThrow(/entre 2 et 7/);
    expect(() => buildResume(['G21 G90', 'G0 X0 Y0 Z5', 'G1 Z-1', 'G1 X5', 'M30'].join('\n'), 4)).toThrow(/Avance/);
    expect(() => buildResume(['G21 G90', 'M3', 'G0 X0 Y0 Z5', 'G1 Z-1 F100', 'G1 X5', 'M30'].join('\n'), 5)).toThrow(/broche/);
  });

  test('a program without spindle or coolant gets neither, and comments do not count as moves', () => {
    const prog = ['G20 G90', 'G0 Z0.5 (clear)', 'G0 X1 Y1 ; start', 'G1 Z-0.1 F10', '(note X99)', 'G1 X2', 'M30'].join('\n');
    const r = buildResume(prog, 6);
    expect(r.preamble).toEqual(['(CNCjs Touch : reprise a la ligne 6)', 'G20 G90 G94', 'G0 Z0.5', 'G0 X1 Y1', 'G1 Z-0.1 F10']);
    expect(r.spindle).toBe(null);
    expect(r.coolant).toBe(null);
  });

  test('a unit change converts positions, clearance and feeds together (5 mm under G20 is Z0.1969, never Z5)', () => {
    const prog = ['G21 G90', 'G0 X100 Y0 Z5', 'G20', 'G1 X4 F10', 'G1 Y1'].join('\n');
    const r = buildResume(prog, 5);
    expect(r.preamble).toEqual(['(CNCjs Touch : reprise a la ligne 5)', 'G20 G90 G94', 'G0 Z0.1969', 'G0 X4 Y0', 'G1 Z0.1969 F10']);
    expect(r.preamble.join('\n')).not.toMatch(/Z5\b/);
    expect(r.units).toBe('G20');
    expect(r.safeZ).toBeCloseTo(5 / 25.4, 6);
    expect(r.notes).toEqual(expect.arrayContaining([expect.stringMatching(/unités.*ligne 3/)]));
    // Feeds (units per minute) and the plunge feed follow the same conversion.
    const feeds = ['G21 G90', 'G0 X0 Y0 Z5', 'G1 Z-1 F300', 'G20', 'G1 X1'].join('\n');
    expect(buildResume(feeds, 5).preamble.slice(1)).toEqual(['G20 G90 G94', 'G0 Z0.1969', 'G0 X0 Y0', 'G1 Z-0.0394 F11.811']);
  });

  test('a program that alternates units several times, with incremental moves in between, is followed', () => {
    const prog = ['G21 G90', 'G0 X25.4 Y0 Z5', 'G20', 'G1 X2 F10', 'G91 G1 X1', 'G90 G21', 'G1 Y10 F200', 'G1 X3'].join('\n');
    const r = buildResume(prog, 8);
    expect(r.position.X).toBeCloseTo(76.2, 6);
    expect(r.position).toMatchObject({ Y: 10 });
    expect(r.position.Z).toBeCloseTo(5, 6);
    expect(r.preamble.slice(1)).toEqual(['G21 G90 G94', 'G0 Z5', 'G0 X76.2 Y10', 'G1 Z5 F200']);
  });

  test('units chosen after moves made in the machine units cannot be converted: refused', () => {
    const prog = ['G0 Z5', 'G0 X0 Y0', 'G21', 'G1 Z-1 F100', 'G1 X10', 'M30'].join('\n');
    expect(() => buildResume(prog, 5)).toThrow(/unités.*ligne 3/);
  });

  test('a work offset change makes the positions acquired under the old one unknown until X, Y and Z are given again', () => {
    const prog = ['G21 G90 G54', 'G0 X10 Y20 Z5', 'G1 Z-1 F100', 'G55', 'G1 X20', 'G1 Y5', 'G0 Z3', 'G1 Z-1', 'G1 X30'].join('\n');
    expect(() => buildResume(prog, 5)).toThrow(/repère.*G55.*ligne 4/);
    expect(() => buildResume(prog, 6)).toThrow(/repère/);
    expect(() => buildResume(prog, 7)).toThrow(/repère/);
    expect(buildResume(prog, 8)).toMatchObject({ wcs: 'G55', position: { X: 20, Y: 5, Z: 3 }, safeZ: 3 });
    const r = buildResume(prog, 9);
    expect(r).toMatchObject({ wcs: 'G55', position: { X: 20, Y: 5, Z: -1 }, safeZ: 3 });
    expect(r.preamble.slice(1)).toEqual(['G21 G90 G55 G94', 'G0 Z3', 'G0 X20 Y5', 'G1 Z-1 F100']);
    // Selecting the same offset again changes nothing.
    const same = ['G21 G90 G54', 'G0 X10 Y20 Z5', 'G1 Z-1 F100', 'G54', 'G1 X20'].join('\n');
    expect(buildResume(same, 5).position).toEqual({ X: 10, Y: 20, Z: -1 });
  });

  test('tool compensations are not replayed: G41/G42/G43 are refused, a G43.1 still active too, and its Z is not a move', () => {
    const base = ['G21 G90', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F100', 'G1 X5', 'G1 X6', 'M30'];
    const at = (insert, from) => {
      const prog = base.slice(0, 4).concat(insert, base.slice(4)).join('\n');
      return () => buildResume(prog, from);
    };
    expect(at(['G41 D1'], 7)).toThrow(/G41\/G42/);
    expect(at(['G42'], 7)).toThrow(/G41\/G42/);
    expect(at(['G43 H1'], 7)).toThrow(/G43/);
    expect(at(['G43.1 Z2.5'], 7)).toThrow(/G43\.1.*ligne 5/);
    // E-3 (5e tour) : un G43.1 vu avant la ligne, même annulé, refuse la reprise (hauteurs Z non modélisées).
    expect(at(['G43.1 Z2.5', 'G49'], 8)).toThrow(/G43\.1.*ligne 5/);
  });

  test('arcs: end points are followed, I/J/R are never taken for positions, a modal arc line gets its G2 back', () => {
    // The plane is chosen (E-3, round 4: arcs without a chosen plane are refused).
    const prog = ['G21 G90 G17', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F100', 'G2 X10 Y10 I5 J5', 'X0 Y0 I-5 J-5', 'G3 X4 Y4 R3', 'G1 X1'].join('\n');
    expect(buildResume(prog, 6).position).toEqual({ X: 10, Y: 10, Z: -1 });
    expect(buildResume(prog, 6).program.split('\n')).toContain('G2 X0 Y0 I-5 J-5');
    expect(buildResume(prog, 7).position).toEqual({ X: 0, Y: 0, Z: -1 });
    expect(buildResume(prog, 7).program.split('\n')).toContain('G3 X4 Y4 R3');
    expect(buildResume(prog, 8).position).toEqual({ X: 4, Y: 4, Z: -1 });
  });

  test('machine-coordinate and probe moves hide the touched axes until they are set again', () => {
    const base = ['G21 G90', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F100', 'G1 X5', 'G1 X6', 'M30'];
    const at = (insert, from) => {
      const prog = base.slice(0, 4).concat(insert, base.slice(4)).join('\n');
      return () => buildResume(prog, from);
    };
    expect(at(['G30'], 6)).toThrow(/Position/);
    expect(at(['G38.2 Z-10 F50'], 6)).toThrow(/Position/);
    expect(at(['G53 G0 Z-1', 'G0 Z5'], 7)().preamble.slice(1)).toEqual(['G21 G90 G94', 'G0 Z5', 'G0 X0 Y0', 'G1 Z5 F100']);
  });

  test('notes state the limits: the clearance is the highest Z seen, modes left to the controller are named', () => {
    const r = buildResume(PROGRAM, 12);
    expect(r.notes).toEqual([expect.stringMatching(/dégagement.*Z5.*pas une garantie/), expect.stringMatching(/Retrait en rapide constaté à Z5/)]);
    const bare = buildResume(['G90 G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F200', 'G1 X10 F800', 'G1 Y10', 'M30'].join('\n'), 5);
    expect(bare.notes).toEqual([
      expect.stringMatching(/dégagement/),
      expect.stringMatching(/Retrait en rapide/),
      expect.stringMatching(/unités/),
      expect.stringMatching(/repère/)
    ]);
  });
});

// Cross-check (audit 31): attempts to break the unit conversion, the work
// offset rule and the compensation tracking.
const IN = 25.4;
const near = (v, digits = 4) => expect.closeTo(v, digits);

describe('resume cross-check: units', () => {
  test('G20 at the start then G21 right before the line: everything is given back in mm', () => {
    const prog = ['G20 G90', 'G0 X1 Y1 Z0.2', 'G1 Z-0.05 F10', 'G21', 'G1 X30'].join('\n');
    const r = buildResume(prog, 5);
    expect(r.units).toBe('G21');
    expect(r.position).toEqual({ X: near(1 * IN), Y: near(1 * IN), Z: near(-0.05 * IN) });
    expect(r.safeZ).toBeCloseTo(0.2 * IN, 6);
    expect(r.preamble.slice(1)).toEqual(['G21 G90 G94', 'G0 Z5.08', 'G0 X25.4 Y25.4', 'G1 Z-1.27 F254']);
    expect(r.notes.join(' ')).toMatch(/unités.*ligne 4.*G21/);
  });

  test('a feed given before G20 and reused after it is converted (working and plunge feeds)', () => {
    const prog = ['G21 G90', 'G0 X0 Y0 Z5', 'G1 Z-1 F300', 'G1 X10 F600', 'G20', 'G1 X1', 'G1 Y1'].join('\n');
    const r = buildResume(prog, 7);
    expect(r.preamble.slice(1)).toEqual(['G20 G90 G94', 'G0 Z0.1969', 'G0 X1 Y0', 'G1 Z-0.0394 F11.811', 'F23.622']);
  });

  test('several G words on a line: G1 G20 X1 F10 converts the state before X is applied in inches', () => {
    const prog = ['G21 G90', 'G0 X0 Y0 Z5', 'G1 G20 X1 F10', 'G1 Y1'].join('\n');
    const r = buildResume(prog, 4);
    expect(r.position).toEqual({ X: 1, Y: 0, Z: near(5 / IN) });
    expect(r.preamble.slice(1)).toEqual(['G20 G90 G94', 'G0 Z0.1969', 'G0 X1 Y0', 'G1 Z0.1969 F10']);
  });

  test('G21, G20, G21, G20 with G91 between two changes', () => {
    const prog = [
      'G21 G90', // 1
      'G0 X10 Y0 Z5', // 2
      'G20', // 3: X .3937 Z .1969
      'G91 G1 X1 F10', // 4: X 1.3937 in (incremental)
      'G21', // 5: X 35.4 Z 5 F 254
      'G1 Y10 F200', // 6: Y 0+10 (still G91)
      'G90', // 7
      'G20', // 8: X 1.3937 Y .3937 Z .1969 F 7.874
      'G1 X2' // 9
    ].join('\n');
    const r = buildResume(prog, 9);
    expect(r.position).toEqual({ X: near(35.4 / IN), Y: near(10 / IN), Z: near(5 / IN) });
    expect(r.preamble.slice(1)).toEqual(['G20 G90 G94', 'G0 Z0.1969', 'G0 X1.3937 Y0.3937', 'G1 Z0.1969 F7.874']);
    expect(r.notes.join(' ')).toMatch(/ligne 8/);
    expect(() => buildResume(prog, 6)).toThrow(/G91/);
  });

  test('G91 then G90 with a clearance reached under G91: the absolute height is followed', () => {
    const prog = ['G21 G90', 'G0 X0 Y0 Z5', 'G1 Z-1 F100', 'G91', 'G0 Z6', 'G90', 'G0 X10 Y10', 'G1 Z-1', 'G1 X20'].join('\n');
    expect(buildResume(prog, 9)).toMatchObject({ position: { X: 10, Y: 10, Z: -1 }, safeZ: 5 });
    expect(buildResume(prog, 8).preamble.slice(1)).toEqual(['G21 G90 G94', 'G0 Z5', 'G0 X10 Y10', 'G1 Z5 F100']);
  });

  test('a lone F before G21 (no move) refuses the resume: conservative, its unit depends on the machine', () => {
    const prog = ['S12000 M3', 'F500', 'G21 G90', 'G0 X0 Y0 Z5', 'G1 Z-1 F100', 'G1 X5'].join('\n');
    expect(() => buildResume(prog, 6)).toThrow(/unités.*ligne 3/);
  });

  test('lower case, compact code, comments holding G words', () => {
    const prog = ['g21 g90 g54', 'g0z5', 'g0x10y10', 'g1z-1f100 (G20 G91 G55)', 'g1x20 ; G92 X0 G10', 'g1y5'].join('\n');
    const r = buildResume(prog, 6);
    expect(r).toMatchObject({ units: 'G21', wcs: 'G54', position: { X: 20, Y: 10, Z: -1 }, safeZ: 5 });
    expect(r.preamble.slice(1)).toEqual(['G21 G90 G54 G94', 'G0 Z5', 'G0 X20 Y10', 'G1 Z-1 F100']);
    // The clearance note and the rapid-retract note only (no mode left to the machine).
    expect(r.notes).toHaveLength(2);
  });

  test('a program without G20/G21 nor G54 keeps units/wcs null', () => {
    const prog = ['G90', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F100', 'G1 X5'].join('\n');
    const r = buildResume(prog, 5);
    expect(r).toMatchObject({ units: null, wcs: null });
    expect(r.preamble[1]).toBe('G90 G94');
    expect(r.notes).toEqual([
      expect.stringMatching(/dégagement/), expect.stringMatching(/Retrait en rapide/), expect.stringMatching(/unités/), expect.stringMatching(/repère/)
    ]);
  });
});

describe('resume cross-check: work offsets, origin, machine coordinates', () => {
  test('G53 G0 Z0 (or modal G53 Z0, or lower case) before the line: Z unknown, explicit refusal', () => {
    const base = ['G21 G90', 'G0 X0 Y0 Z5', 'G1 Z-1 F100'];
    ['G53 G0 Z0', 'G53 Z0', 'g53 g0 z0'].forEach((line) => {
      const prog = base.concat([line, 'G1 X10']).join('\n');
      expect(() => buildResume(prog, 5)).toThrow(/Position/);
      expect(stateBefore(programLines(prog), 5).pos).toEqual({ X: 0, Y: 0, Z: null });
    });
    // Z given again: the clearance seen before the G53 still holds (same offset).
    const prog = base.concat(['G53 G0 Z0', 'G0 Z5', 'G1 Z-1', 'G1 X10']).join('\n');
    expect(buildResume(prog, 7)).toMatchObject({ position: { X: 0, Y: 0, Z: -1 }, safeZ: 5 });
  });

  test('G92/G10 in every form are refused, but not inside a comment', () => {
    const base = ['G21 G90', 'G0 X0 Y0 Z5', 'G1 Z-1 F100'];
    ['G92 X0 Y0', 'G92.1', 'G92.2', 'g92 z0', 'G10 L2 P1 X0', 'G10 L20 P0 Z0', 'G90 G10 L2 P2 X-1'].forEach((line) => {
      expect(() => buildResume(base.concat([line, 'G1 X10']).join('\n'), 5)).toThrow(/G10\/G92/);
    });
    expect(() => buildResume(base.concat(['G1 X5 (G92 X0) ; G10 L20', 'G1 X10']).join('\n'), 5)).not.toThrow();
  });

  test('a real CAM program (Fusion 360 grbl post): G28 G91 Z0 then G54 does not trigger the offset refusal', () => {
    const prog = [
      '%', '(1001)', '(T1 D=6. CR=0. - ZMIN=-5. - flat end mill)',
      'G90 G94 G17', 'G21', 'G28 G91 Z0', 'G90',
      '(2D Contour1)', 'T1 M6', 'S12000 M3', 'G54', 'M8',
      'G0 X10 Y10', 'G0 Z15', 'G1 Z-1 F300', 'G1 X20', 'G1 Y20',
      'G0 Z15', 'M5', 'M9', 'G28 G91 Z0', 'G90', 'M30', '%'
    ].join('\n');
    const lines = programLines(prog);
    const at = lines.indexOf('G1 Y20') + 1;
    const r = buildResume(prog, at);
    expect(r).toMatchObject({ units: 'G21', wcs: 'G54', tool: 1, toolChanged: true, coolant: 'M8', position: { X: 20, Y: 10, Z: -1 }, safeZ: 15 });
    expect(r.preamble.slice(1)).toEqual(['G21 G90 G17 G54 G94', 'G0 Z15', 'G0 X20 Y10', 'M3 S12000', 'G4 P3', 'M8', 'G1 Z-1 F300']);
    expect(r.notes).toHaveLength(2);
    // G53 G0 Z0 as the safe retract: same result.
    const g53 = prog.replace(/G28 G91 Z0\nG90/g, 'G53 G0 Z0');
    expect(buildResume(g53, programLines(g53).indexOf('G1 Y20') + 1).preamble[2]).toBe('G0 Z15');
  });

  test('a first G54 after a G0 Z5 made under the machine offset: refused until X, Y, Z are given again, and a clearance too', () => {
    const prog = ['G21 G90', 'G0 Z5', 'G54', 'G0 X10 Y10', 'G1 Z-1 F100', 'G1 X20', 'G0 Z5', 'G1 Z-1', 'G1 X30'].join('\n');
    expect(() => buildResume(prog, 4)).toThrow(/repère.*G54.*ligne 3/);
    expect(() => buildResume(prog, 5)).toThrow(/repère/);
    // At line 6 X, Y and Z are known under G54, but the only Z seen there is the cutting depth.
    expect(() => buildResume(prog, 6)).toThrow(/dégagement/);
    expect(buildResume(prog, 9)).toMatchObject({ position: { X: 20, Y: 10, Z: -1 }, safeZ: 5 });
  });

  test('units, offset and move on one line (G20 G55 G0 X1 Y1 Z0.5)', () => {
    const prog = ['G21 G90 G54', 'G0 X10 Y10 Z5', 'G1 Z-1 F100', 'G20 G55 G0 X1 Y1 Z0.5', 'G1 Z-0.1', 'G1 X2'].join('\n');
    const r = buildResume(prog, 6);
    expect(r).toMatchObject({ units: 'G20', wcs: 'G55', position: { X: 1, Y: 1, Z: -0.1 }, safeZ: 0.5 });
    expect(r.preamble.slice(1)).toEqual(['G20 G90 G55 G94', 'G0 Z0.5', 'G0 X1 Y1', 'G1 Z-0.1 F3.937']);
  });
});

describe('resume cross-check: compensations, probes, arcs', () => {
  const base = ['G21 G90', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F100'];
  const at = (insert, from) => () => buildResume(base.concat(insert, ['G1 X5', 'G1 X6', 'M30']).join('\n'), from);

  test('G41.1/G42.1/G43 H, lower case and compact are refused; G43.1 is tracked then lifted by G49', () => {
    expect(at(['G41.1 D1'], 7)).toThrow(/G41\/G42/);
    expect(at(['g42.1 d1'], 7)).toThrow(/G41\/G42/);
    expect(at(['G43H1'], 7)).toThrow(/G43/);
    expect(at(['G43.1Z2.5'], 7)).toThrow(/G43\.1.*ligne 5/);
    // E-3 (5e tour) : un G43.1 vu avant la ligne, même annulé, refuse la reprise.
    expect(at(['G43.1 Z2.5', 'G1 X3', 'G49'], 8)).toThrow(/G43\.1.*ligne 5/);
    expect(at(['G43.1 Z2.5', 'G49', 'G43.1 Z1'], 8)).toThrow(/G43\.1.*ligne 5/);
  });

  test('G38.2 to G38.5 make only the probed axes unknown; the probe feed stays modal (like Grbl)', () => {
    expect(at(['G38.3 X-10 F50'], 6)).toThrow(/Position/);
    expect(at(['G38.4 Z-10 F50'], 6)).toThrow(/Position/);
    expect(at(['G38.5 Y-10 F50'], 6)).toThrow(/Position/);
    const r = at(['G38.2 Z-10 F50', 'G0 Z5', 'G1 Z-1'], 8)();
    expect(r.position).toEqual({ X: 0, Y: 0, Z: -1 });
    expect(r.preamble.at(-1)).toBe('G1 Z-1 F50');
  });

  test('arcs: I/J/K/R are never positions, a helical G2 follows Z, the modal G2/G3 is given back', () => {
    // The plane is chosen on the arc line (E-3, round 4: arcs without a chosen plane are refused).
    const prog = base.concat(['G17 G2 X10 Y0 I5 J0', 'X0 Y0 I-5 J0', 'G2 X10 Y0 Z-2 I5 J0 K0', 'G3 X0 Y0 R5', 'G1 X1']).join('\n');
    expect(buildResume(prog, 6)).toMatchObject({ position: { X: 10, Y: 0, Z: -1 } });
    expect(buildResume(prog, 6).program.split('\n')).toContain('G2 X0 Y0 I-5 J0');
    expect(buildResume(prog, 8)).toMatchObject({ position: { X: 10, Y: 0, Z: -2 } });
    expect(buildResume(prog, 9)).toMatchObject({ position: { X: 0, Y: 0, Z: -2 } });
    expect(buildResume(prog, 9).program.split('\n')).toContain('G1 X1');
    // A descending helical arc is not a plunge: the plunge feed stays the one of G1 Z-1.
    expect(buildResume(prog, 8).preamble.at(-1)).toBe('G1 Z-2 F100');
  });
});

describe('resume cross-check: a clearance that is only a cutting depth is refused', () => {
  test('after an offset change without a Z retract, the only Z seen is the cutting depth', () => {
    // G54: clearance Z5. G55: the only Z seen is -1 (cutting). A preamble
    // G0 Z-1 then a rapid XY move at that depth would cross the part.
    const prog = ['G21 G90 G54', 'G0 X10 Y20 Z5', 'G1 Z-1 F100', 'G55', 'G0 X20 Y5', 'G1 Z-1', 'G1 X30'].join('\n');
    expect(() => buildResume(prog, 7)).toThrow(/dégagement/);
  });

  test('a program whose only absolute Z is the cutting depth (clearance made in G91): same refusal', () => {
    const prog = ['G21 G90', 'G0 X0 Y0', 'G91', 'G0 Z5', 'G90', 'G1 Z-1 F100', 'G1 X10', 'G1 Y10'].join('\n');
    expect(() => buildResume(prog, 8)).toThrow(/dégagement/);
  });

  test('a clearance equal to the current Z is accepted when reached in rapid, also after a G1 retract', () => {
    const rapid = ['G21 G90', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F100', 'G0 Z5', 'G1 X10', 'G1 Y10'].join('\n');
    expect(buildResume(rapid, 6).preamble.slice(1)).toEqual(['G21 G90 G94', 'G0 Z5', 'G0 X0 Y0', 'G1 Z5 F100']);
    const modal = ['G21 G90', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F100', 'G0', 'Z5', 'G1 X10'].join('\n');
    expect(buildResume(modal, 7).preamble.slice(1)).toEqual(['G21 G90 G94', 'G0 Z5', 'G0 X0 Y0', 'G1 Z5 F100']);
    // A retract made at feed (G1 Z8) followed by a plunge: the clearance Z8 is above the resume Z.
    const feed = ['G21 G90', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F100', 'G1 Z8 F500', 'G1 Z-2 F100', 'G1 X10'].join('\n');
    expect(buildResume(feed, 7)).toMatchObject({ position: { X: 0, Y: 0, Z: -2 }, safeZ: 8 });
    // A G1 up to the same height as an earlier rapid keeps that height as a clearance.
    const same = ['G21 G90', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F100', 'G1 Z5 F500', 'G1 X10'].join('\n');
    expect(buildResume(same, 6).preamble[2]).toBe('G0 Z5');
  });
});

// Counter-review 2 (audit 31): the motion word of the current line decides
// whether a Z is a rapid; CAM posts; variant B (the clearance needs a rapid Z
// retract under the current offset: `rapidZ`).
const xvState = (lines, from) => stateBefore(programLines(lines.join('\n')), from);
// The preamble (as one string) or the refusal message: a failing expectation shows the real program.
const xvOutcome = (lines, from) => {
  try {
    return buildResume(lines.join('\n'), from).preamble.join(' / ');
  } catch (err) {
    return err.message;
  }
};

describe('resume cross-check 2: the motion of the current line decides whether a Z is a rapid', () => {
  test('Z5 without a G word under a modal G0 (after a G0 X5 line) is a rapid', () => {
    const prog = ['G21 G90', 'G0 X0 Y0 Z5', 'G1 Z-1 F100', 'G0 X5', 'Z5', 'G1 X10'];
    expect(xvState(prog, 6)).toMatchObject({ motion: 'G0', safeZ: 5, rapidZ: 5, pos: { X: 5, Y: 0, Z: 5 } });
    expect(buildResume(prog.join('\n'), 6).preamble.slice(1)).toEqual(['G21 G90 G94', 'G0 Z5', 'G0 X5 Y0', 'G1 Z5 F100']);
  });

  test('G1 Z5 after a modal G0 line, never reached in rapid: refused (no rapid Z at all)', () => {
    const prog = ['G21 G90', 'G0 X0 Y0', 'G1 Z-1 F100', 'G0 X5', 'G1 Z5', 'G1 X10'];
    expect(xvState(prog, 6)).toMatchObject({ motion: 'G1', safeZ: 5, rapidZ: null });
    expect(xvOutcome(prog, 6)).toMatch(/dégagement.*aucun déplacement rapide G0 en Z/);
  });

  test('G1 Z5 first, then G0 Z5 on the same height: the rapid marks it free', () => {
    const prog = ['G21 G90', 'G0 X0 Y0', 'G1 Z5 F100', 'G0 Z5', 'G1 X10'];
    expect(xvState(prog, 4)).toMatchObject({ safeZ: 5, rapidZ: null });
    expect(xvState(prog, 5)).toMatchObject({ safeZ: 5, rapidZ: 5 });
    expect(buildResume(prog.join('\n'), 5).preamble[2]).toBe('G0 Z5');
  });

  test('G0 X10 Z5 combined: Z is a rapid whatever the axis order on the line', () => {
    ['G0 X10 Z5', 'G0 Z5 X10', 'X10 Z5 G0', 'G0X10Z5'].forEach((line) => {
      const prog = ['G21 G90', 'G0 X0 Y0 Z0', 'G1 Z-1 F100', line, 'G1 X20'];
      expect(xvState(prog, 5)).toMatchObject({ safeZ: 5, rapidZ: 5, pos: { X: 10, Y: 0, Z: 5 } });
      expect(buildResume(prog.join('\n'), 5).preamble.slice(2)).toEqual(['G0 Z5', 'G0 X10 Y0', 'G1 Z5 F100']);
    });
  });

  test('G91, G0 Z6 relative, G90: the absolute height reached is a rapid; in G1 it is a cut above the rapid Z2 (accepted at Z5 >= rapid)', () => {
    const rapid = ['G21 G90', 'G0 X0 Y0 Z2', 'G1 Z-1 F100', 'G91', 'G0 Z6', 'G90', 'G1 X10'];
    expect(xvState(rapid, 7)).toMatchObject({ safeZ: 5, rapidZ: 5, pos: { Z: 5 }, distance: 'G90' });
    expect(buildResume(rapid.join('\n'), 7).preamble.slice(2)).toEqual(['G0 Z5', 'G0 X0 Y0', 'G1 Z5 F100']);
    // Variant B: the G0 Z2 of line 2 is a rapid under this offset, so Z5 (above it) is a clearance.
    const feed = ['G21 G90', 'G0 X0 Y0 Z2', 'G1 Z-1 F100', 'G91', 'G1 Z6', 'G90', 'G1 X10'];
    expect(xvState(feed, 7)).toMatchObject({ safeZ: 5, rapidZ: 2 });
    expect(xvOutcome(feed, 7)).toMatch(/G0 Z5 \/ G0 X0 Y0/);
  });

  test('a unit change scales the clearance and the rapid Z together', () => {
    const rapid = ['G21 G90', 'G0 X0 Y0 Z5', 'G1 Z-1 F100', 'G0 Z5', 'G20', 'G1 X1'];
    expect(xvState(rapid, 6)).toMatchObject({ rapidZ: expect.closeTo(5 / 25.4, 6), unitsChanged: 5 });
    expect(buildResume(rapid.join('\n'), 6).preamble.slice(1)).toEqual(['G20 G90 G94', 'G0 Z0.1969', 'G0 X0 Y0', 'G1 Z0.1969 F3.937']);
    const feed = ['G21 G90', 'G0 X0 Y0', 'G1 Z-1 F100', 'G1 Z5', 'G20', 'G1 X1'];
    expect(xvState(feed, 6)).toMatchObject({ rapidZ: null });
    expect(xvOutcome(feed, 6)).toMatch(/dégagement/);
  });

  test('a work offset change resets the rapid Z: a G1 Z5 under G55 is not a clearance, a G0 Z5 is', () => {
    const feed = ['G21 G90 G54', 'G0 X0 Y0 Z5', 'G55', 'G0 X1 Y1', 'G1 Z5 F100', 'G1 X2'];
    expect(xvState(feed, 3)).toMatchObject({ rapidZ: 5 });
    expect(xvState(feed, 4)).toMatchObject({ safeZ: null, rapidZ: null });
    expect(xvState(feed, 6)).toMatchObject({ safeZ: 5, rapidZ: null });
    expect(xvOutcome(feed, 6)).toMatch(/dégagement.*aucun déplacement rapide G0 en Z sous G55/);
    const rapid = ['G21 G90 G54 F100', 'G0 X0 Y0 Z5', 'G55', 'G0 X1 Y1', 'G0 Z5', 'G1 X2'];
    expect(buildResume(rapid.join('\n'), 6).preamble.slice(1)).toEqual(['G21 G90 G55 G94', 'G0 Z5', 'G0 X1 Y1', 'G1 Z5 F100']);
    // Same offset repeated (G54 again): nothing is reset.
    const same = ['G21 G90 G54', 'G0 X0 Y0 Z5', 'G54', 'G1 Z-1 F100', 'G1 X2'];
    expect(xvState(same, 5)).toMatchObject({ safeZ: 5, rapidZ: 5, wcsReset: null });
  });

  test('G53 Z0 keeps the clearance and the rapid Z; a G1 back to that height keeps them too', () => {
    const prog = ['G21 G90', 'G0 X0 Y0 Z5', 'G1 Z-1 F100', 'G53 G0 Z0', 'G1 Z5', 'G1 X10'];
    expect(xvState(prog, 5)).toMatchObject({ safeZ: 5, rapidZ: 5, pos: { X: 0, Y: 0, Z: null } });
    expect(xvState(prog, 6)).toMatchObject({ safeZ: 5, rapidZ: 5, pos: { Z: 5 } });
    expect(buildResume(prog.join('\n'), 6).preamble[2]).toBe('G0 Z5');
    const modal = ['G21 G90', 'G0 X0 Y0 Z5', 'G1 Z-1 F100', 'G53 Z0', 'G0 Z5', 'G1 X10'];
    expect(buildResume(modal.join('\n'), 6).preamble[2]).toBe('G0 Z5');
  });

  test('a helical arc climbing to or above the rapid height: the clearance is at or above a rapid Z, accepted', () => {
    const same = ['G21 G90', 'G0 X0 Y0 Z5', 'G1 Z-1 F100', 'G2 X10 Y0 Z5 I5 J0', 'G1 X20'];
    expect(xvState(same, 5)).toMatchObject({ safeZ: 5, rapidZ: 5, pos: { X: 10, Y: 0, Z: 5 } });
    expect(buildResume(same.join('\n'), 5).preamble.slice(2)).toEqual(['G0 Z5', 'G0 X10 Y0', 'G1 Z5 F100']);
    // Variant B: Z6 reached by the arc is above the rapid Z5: accepted at Z6 (inverted from the strict reading).
    const above = ['G21 G90', 'G0 X0 Y0 Z5', 'G1 Z-1 F100', 'G2 X10 Y0 Z6 I5 J0', 'G1 X20', 'G1 Z-1', 'G1 Y5'];
    expect(xvState(above, 5)).toMatchObject({ safeZ: 6, rapidZ: 5 });
    expect(buildResume(above.join('\n'), 5).preamble[2]).toBe('G0 Z6');
    expect(buildResume(above.join('\n'), 7).preamble[2]).toBe('G0 Z6');
    // Modal arc line (no G word) after G3, no rapid Z anywhere: refused.
    const modal = ['G21 G90', 'G0 X0 Y0', 'G1 Z-1 F100', 'G3 X10 Y0 I5 J0', 'X0 Y0 Z5 I-5 J0', 'G1 X20'];
    expect(xvState(modal, 6)).toMatchObject({ motion: 'G3', safeZ: 5, rapidZ: null });
    expect(xvOutcome(modal, 6)).toMatch(/dégagement/);
  });
});

describe('resume cross-check 2: CAM programs', () => {
  const fusion = (clearanceLine) => [
    '%', '(1001)', 'G90 G94 G17', 'G21', 'G53 G0 Z0', '(2D Adaptive1)', 'T1 M6', 'S12000 M3', 'G54', 'M8',
    'G0 X10 Y10', clearanceLine, 'G1 Z-1 F300', 'G1 X20', 'G1 Y20', 'G0 Z15', 'M5', 'M9', 'G53 G0 Z0', 'M30', '%'
  ];

  test('Fusion 360 grbl.cps (G0 Z15 after the XY rapid): accepted everywhere after the plunge', () => {
    const prog = fusion('G0 Z15');
    const lines = programLines(prog.join('\n'));
    const at = lines.indexOf('G1 Y20') + 1;
    const r = buildResume(prog.join('\n'), at);
    expect(r.preamble.slice(1)).toEqual(['G21 G90 G17 G54 G94', 'G0 Z15', 'G0 X20 Y10', 'M3 S12000', 'G4 P3', 'M8', 'G1 Z-1 F300']);
    // Resume on the plunge line itself: refused, but for the feed (F300 is on that
    // very line, Fusion gives F with the first G1): the clearance is fine there.
    const plunge = lines.indexOf('G1 Z-1 F300') + 1;
    expect(xvOutcome(prog, plunge)).toMatch(/^Avance inconnue/);
    expect(xvState(prog, plunge)).toMatchObject({ safeZ: 15, rapidZ: 15, pos: { X: 10, Y: 10, Z: 15 } });
    expect(buildResume(prog.join('\n'), plunge + 1).preamble.slice(2, 4)).toEqual(['G0 Z15', 'G0 X10 Y10']);
    expect(buildResume(prog.join('\n'), lines.lastIndexOf('G0 Z15') + 1).position).toEqual({ X: 20, Y: 20, Z: -1 });
    // On the clearance line itself (just after G53 G0 Z0): Z unknown, explicit refusal.
    expect(xvOutcome(prog, lines.indexOf('G0 Z15') + 1)).toMatch(/^Position avant la ligne 12 inconnue/);
  });

  test('Fusion 360 generic post (G43 Z15 H1): refused on the G43 line (Grbl 1.1 rejects G43 Hn itself)', () => {
    const prog = fusion('G43 Z15 H1');
    const lines = programLines(prog.join('\n'));
    expect(xvOutcome(prog, lines.indexOf('G1 Y20') + 1)).toMatch(/G43.*ligne 12/);
  });

  test('G1-only post (Easel style): without any rapid Z, no line is resumable (variant B, documented compromise)', () => {
    const prog = ['G90 G21', 'G1 Z3.81 F228.6', 'G1 X0 Y0 F762', 'G1 Z-1.5875 F228.6', 'G1 X10 F762', 'G1 Y10',
      'G1 Z3.81 F228.6', 'G1 X20 Y20 F762', 'G1 Z-1.5875 F228.6', 'G1 X30'];
    [6, 8, 10].forEach((from) => {
      expect(xvOutcome(prog, from)).toMatch(/aucun déplacement rapide G0 en Z/);
    });
  });
});

describe('resume cross-check 2: a highest Z reached by cutting only, above the current depth (variant B)', () => {
  test('after an offset change without a Z retract, a cut at -0.5 then -1: refused instead of G0 Z-0.5', () => {
    const prog = ['G21 G90 G54', 'G0 X10 Y20 Z5', 'G1 Z-1 F100', 'G55', 'G0 X20 Y5', 'G1 Z-0.5', 'G1 Z-1', 'G1 X30'];
    expect(xvState(prog, 8)).toMatchObject({ safeZ: -0.5, rapidZ: null, pos: { X: 20, Y: 5, Z: -1 } });
    expect(xvOutcome(prog, 8)).toMatch(/dégagement.*aucun déplacement rapide G0 en Z sous G55/);
  });

  test('clearance made in G91, then two cutting depths in G90: refused instead of G0 Z-0.5', () => {
    const prog = ['G21 G90', 'G0 X0 Y0', 'G91', 'G0 Z5', 'G90', 'G1 Z-0.5 F100', 'G1 Z-1', 'G1 X10', 'G1 Y10'];
    expect(xvState(prog, 9)).toMatchObject({ safeZ: -0.5, rapidZ: null, pos: { X: 10, Y: 0, Z: -1 } });
    expect(xvOutcome(prog, 9)).toMatch(/dégagement.*aucun déplacement rapide/);
  });
});

describe('resume, cross-check 3', () => {
  const P = (...lines) => lines.join('\n');

  describe('variante B: dégagement atteint en rapide', () => {
    test('post G1-seul (Easel) : refus explicite nommant l’absence de G0 en Z, à chaque ligne de reprise possible', () => {
      const easel = P('G21 G90', 'M3 S12000', 'G1 Z5 F500', 'G1 X0 Y0 F1000', 'G1 Z-1 F200', 'G1 X10', 'G1 Y10', 'G1 Z5 F500', 'G1 X20 Y20', 'G1 Z-1 F200', 'M5', 'M30');
      [6, 7, 9, 10].forEach((line) => {
        expect(() => buildResume(easel, line)).toThrow(/Hauteur de dégagement inconnue avant la ligne \d+ \(aucun déplacement rapide G0 en Z\) : choisissez une ligne après un retrait en rapide\./);
      });
      // Même après un `G1 Z5` (retrait en coupe à la ligne 8), la ligne 9 reste refusée : c'est le compromis assumé.
      expect(() => buildResume(easel, 9)).toThrow(/aucun déplacement rapide G0 en Z/);
    });

    test('G0 Z5 puis G1 Z-1 / G1 Z-0.5 : dégagement Z5, note nommant le rapide', () => {
      const prog = P('G21 G90', 'M3 S9000', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F200', 'G1 X10 F800', 'G1 Z-0.5', 'G1 X0', 'M5', 'M30');
      const plan = buildResume(prog, 8);
      expect(plan.safeZ).toBe(5);
      expect(plan.preamble).toContain('G0 Z5');
      expect(plan.position).toEqual({ X: 10, Y: 0, Z: -0.5 });
      expect(plan.notes[1]).toBe('Retrait en rapide constaté à Z5 : sans déplacement rapide G0 en Z, aucune reprise ne serait proposée.');
      // Un retrait en G1 plus haut que le rapide : dégagement = Z max (G1 Z8), justifié par le rapide Z5 au-dessous.
      const higherG1 = P('G21 G90', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F200', 'G1 Z8 F500', 'G1 X10 F800', 'G1 Z-1 F200', 'G1 X0');
      const p2 = buildResume(higherG1, 8);
      expect(p2.safeZ).toBe(8);
      expect(p2.notes[1]).toMatch(/Retrait en rapide constaté à Z5/);
    });

    test('changement de repère sans nouveau G0 Z : refus « sous G55 » ; avec un G0 Z sous G55 : accepté', () => {
      const noRapid = P('G21 G90 G54', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F200', 'G1 X10', 'G55', 'G0 X0 Y0', 'G1 Z-1 F200', 'G1 X10', 'G1 Y10');
      expect(() => buildResume(noRapid, 10)).toThrow(/aucun déplacement rapide G0 en Z sous G55/);
      const withRapid = P('G21 G90 G54', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F200', 'G1 X10', 'G55', 'G0 Z3', 'G0 X0 Y0', 'G1 Z-1 F200', 'G1 X10', 'G1 Y10');
      const plan = buildResume(withRapid, 11);
      expect(plan).toMatchObject({ safeZ: 3, wcs: 'G55' });
      expect(plan.notes[1]).toMatch(/Retrait en rapide constaté à Z3 sous G55/);
      expect(plan.preamble[1]).toBe('G21 G90 G55 G94');
    });

    test('G91 G0 Z5 relatif puis G90 : le rapide relatif compte comme retrait (position absolue connue avant)', () => {
      const prog = P('G21 G90', 'G0 X0 Y0 Z0', 'G91', 'G0 Z5', 'G90', 'G1 Z-1 F100', 'G1 X10', 'G1 Y10');
      const plan = buildResume(prog, 8);
      expect(plan.safeZ).toBe(5);
      expect(plan.position).toEqual({ X: 10, Y: 0, Z: -1 });
      expect(plan.preamble).toContain('G0 Z5');
      // Le même rapide relatif depuis une position Z inconnue : pas de dégagement connu.
      const unknownStart = P('G21 G90', 'G0 X0 Y0', 'G91', 'G0 Z5', 'G90', 'G1 Z-1 F100', 'G1 X10', 'G1 Y10');
      // Z absolu redonné seulement par G1 Z-1 : safeZ = -1 et rapidZ null → refus (correct : aucun retrait rapide connu).
      expect(() => buildResume(unknownStart, 8)).toThrow(/aucun déplacement rapide G0 en Z/);
    });
  });
});

// Final server cross-check (xvf) of 33b32db9: comments read like CNCjs's sender,
// resume after nested comments, CNCjs expressions (D3) and changesOffset (D4), fixed.
// What GrblController's sender writes for a program line (dataFilter, l. 271-278).
const sent = (line, context = {}) => gcodeParser.parseLine(translateExpression(line.trim(), context), { flatten: true, lineMode: 'stripped' }).line;

// Deterministic pseudo-random generator (reproducible fuzz).
const rng = (seed) => () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

describe('final cross-check · codeOf lit les lignes comme gcode-parser (expéditeur CNCjs)', () => {
  test('20 000 lignes aléatoires de ( ) ; G X 1 espace : même code que la ligne envoyée', () => {
    const next = rng(42);
    const alphabet = ['(', ')', ';', 'G', '0', 'X', '1', ' ', 'Y', '.', '-', 'a'];
    const mismatches = [];
    for (let n = 0; n < 20000; n++) {
      const len = 1 + Math.floor(next() * 18);
      let line = '';
      for (let i = 0; i < len; i++) {
        line += alphabet[Math.floor(next() * alphabet.length)];
      }
      const expected = gcodeParser.parseLine(line, { flatten: true, lineMode: 'stripped' }).line.toUpperCase();
      if (codeOf(line) !== expected && mismatches.length < 5) {
        mismatches.push([line, codeOf(line), expected]);
      }
    }
    expect(mismatches).toEqual([]);
  });

  // D4 (corrigé) : changesOffset lisait les commentaires sans imbrication (faux négatif).
  test('changesOffset (job-load.js) lit les commentaires comme l’expéditeur CNCjs : G55 après un commentaire imbriqué', () => {
    const line = '(a (b) ; c) G55';
    expect(sent(line)).toBe('G55');
    expect(codeOf(line)).toBe('G55');
    expect(changesOffset(line)).toBe(true);
    expect(changesOffset('(G55 in a comment) G0 X1\n; G92 X0')).toBe(false);
    expect(changesOffset('G[54+1]')).toBe(true);
    // Le précontrôle F2, lui, le voit.
    expect(analyzeProgram('G21 G90 G54\nG0 X1 Y1 Z5\n' + line + '\nG0 X2\n').wcsChanges).toEqual([3]);
  });
});

describe('final cross-check · reprise après commentaires imbriqués', () => {
  const PROGRAM = [
    'G21 G90 G54',
    'G0 Z5',
    'G0 X0 Y0',
    'G1 Z-1 F200',
    'G1 X5 F600',
    '(old (v1) G0 X50 Y50',
    '(note (a) b) G1 Y7',
    'G1 X8',
    'G0 Z5',
    'M30'
  ].join('\n');

  test('ligne 8 : la position avant la reprise est celle que Grbl a reçue (X5 Y7), pas X50 Y50', () => {
    expect(sent('(old (v1) G0 X50 Y50')).toBe('');
    expect(sent('(note (a) b) G1 Y7')).toBe('G1 Y7');
    const plan = buildResume(PROGRAM, 8);
    expect(plan.position).toEqual({ X: 5, Y: 7, Z: -1 });
    expect(plan.preamble).toEqual([
      '(CNCjs Touch : reprise a la ligne 8)',
      'G21 G90 G54 G94',
      'G0 Z5',
      'G0 X5 Y7',
      'G1 Z-1 F200',
      'F600'
    ]);
  });

  test('première ligne reprise commentée par imbrication : pas de G1 ajouté devant une ligne sans code', () => {
    const plan = buildResume(PROGRAM, 6);
    expect(plan.program.split('\n')[plan.preamble.length]).toBe('(old (v1) G0 X50 Y50');
  });

  // D3 (corrigé) : la reprise acceptait et plaçait l'outil en X10 Y50 au lieu de X50 Y50.
  test('expression CNCjs [..] avant la ligne : reprise refusée (ETOUCH_RESUME_EXPRESSION)', () => {
    const program = [
      'G21 G90 G54',
      'G0 Z5',
      'G0 X0 Y0',
      'G1 Z-1 F200',
      'G1 X10 F600',
      'G0 Z5',
      'G0 X[40+10] Y50',
      'G1 Z-1 F200',
      'G1 X60 F600',
      'G0 Z5'
    ].join('\n');
    // L'expéditeur CNCjs évalue l'expression : Grbl reçoit X50.
    expect(sent('G0 X[40+10] Y50')).toBe('G0 X50 Y50');
    // F2 déclare l'axe imprévisible (ETOUCH_CHECK_MACRO)...
    expect(analyzeProgram(program).unknownAxes.X).toMatch(/expression/);
    // ...and the resume refuses: the value Grbl received cannot be known here.
    let err = null;
    try {
      buildResume(program, 9);
    } catch (e) {
      err = e;
    }
    expect(err).toMatchObject({
      status: 409,
      code: 'ETOUCH_RESUME_EXPRESSION',
      params: { line: 7, from: 9 },
      message: 'Expression ou macro CNCjs à la ligne 7 avant la ligne 9 : reprise impossible.'
    });
    expectCatalogMatch(err);
    // After the expression line, nothing before the resume line is unknown: accepted.
    expect(buildResume(program.replace('G0 X[40+10] Y50', 'G0 X50 Y50'), 9).position).toEqual({ X: 50, Y: 50, Z: -1 });
  });
});

// Re-check (xvg) of c4c048c7: CNCjs expressions and directives before the resume
// line (D3; %wait and %msg are refused on purpose, see audit31-machine.md) and
// changesOffset (D4). Own helpers, scoped.
describe('resume, re-check of c4c048c7 (xvg)', () => {
  // What GrblController's sender writes for a program line (dataFilter, l. 375-414):
  // '%' lines are directives (nothing sent), else expressions then comments stripped.
  const sent = (line, context = {}) => {
    const t = line.trim();
    if (t[0] === '%') {
      return '';
    }
    return gcodeParser.parseLine(translateExpression(t, context), { flatten: true, lineMode: 'stripped' }).line;
  };

  const BASE = ['G21 G90 G54', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F200', 'G1 X5 F600'];
  // Program with `extra` inserted as line 6, resume at line 8 (G1 X8).
  const prog = (extra) => BASE.concat([extra, 'G1 Y7', 'G1 X8', 'G0 Z5', 'M30']).join('\n');
  const attempt = (gcode, from) => {
    try {
      return { ok: buildResume(gcode, from) };
    } catch (err) {
      return { err };
    }
  };

  describe('re-check c4c048c7 · D3 : expressions et directives CNCjs avant la ligne de reprise', () => {
    test.each([
      ['G0 X[40+10] Y5'],
      ['G0 x[1]'],
      ['G0 X1 ]'],
      ['#1=5'],
      ['G0 X#1'],
      ['%_x=posx'],
      ['  %wait'],
      ['%msg bonjour'],
      ['(c) %_x=5']
    ])('« %s » avant la ligne : ETOUCH_RESUME_EXPRESSION, ligne 6, catalogue identique', (extra) => {
      const { err } = attempt(prog(extra), 8);
      expect(err).toMatchObject({ status: 409, code: 'ETOUCH_RESUME_EXPRESSION', params: { line: 6, from: 8 } });
      expect(err.message).toBe('Expression ou macro CNCjs à la ligne 6 avant la ligne 8 : reprise impossible.');
      expectCatalogMatch(err);
    });

    test.each([
      ['(note [x])', ''],
      ['G1 Y6 ; [posx] 50%', 'G1 Y6'],
      ['(50%) G1 Y6', 'G1 Y6'],
      ['; 50%', ''],
      ['(#1 = outil)', ''],
      ['(%wait)', ''],
      ['(a (b [c]) d) G1 Y6', 'G1 Y6'],
      ['%', '']
    ])('« %s » (commentaire ou % seul) : pas de refus', (extra, cncjs) => {
      expect(sent(extra)).toBe(cncjs);
      const { ok, err } = attempt(prog(extra), 8);
      expect(err).toBeUndefined();
      expect(ok.position).toEqual({ X: 5, Y: 7, Z: -1 });
    });

    test('expressions APRÈS la ligne de reprise : acceptées et laissées à CNCjs (évaluées à l’envoi)', () => {
      const gcode = BASE.concat(['G1 Y7', 'G1 X8', 'G1 X[posx+1]', '%_z=5', 'G0 Z[_z]', 'M30']).join('\n');
      const { ok } = attempt(gcode, 7);
      expect(ok.position).toEqual({ X: 5, Y: 7, Z: -1 });
      expect(ok.program).toMatch(/G1 X\[posx\+1\]\n%_z=5\nG0 Z\[_z\]/);
    });

    // Bug hunt E-3 (4e tour) : la ligne de reprise elle-même n'est pas lue par le
    // serveur quand CNCjs l'évalue à l'envoi (« G[0] X20 » lu comme un G0, « X[4*2] »
    // sans mot d'axe) : refusée, comme une expression avant la ligne.
    test('la ligne de reprise elle-même est une expression : refusée (ETOUCH_RESUME_FIRST_EXPRESSION)', () => {
      const gcode = BASE.concat(['G1 Y7', 'G1 X[4*2]', 'G0 Z5', 'M30']).join('\n');
      const { err } = attempt(gcode, 7);
      expect(err).toMatchObject({ status: 409, code: 'ETOUCH_RESUME_FIRST_EXPRESSION', params: { from: 7 } });
    });

    // Observation d'alors : une première ligne « X[..] » sans mot de mouvement ne recevait
    // pas le mouvement modal (hasAxis exige un chiffre après la lettre) et s'exécutait
    // dans le mode laissé par le préambule (G1). Bug hunt E-3 (4e tour) : refusée.
    test('première ligne « X[..] Y[..] » après un G0 modal : refusée ; la même ligne sans expression reçoit son G0', () => {
      const gcode = BASE.concat(['G0 Z5', 'G0 X1 Y1', 'X[4*2] Y[3]', 'M30']).join('\n');
      const { err } = attempt(gcode, 8);
      expect(err).toMatchObject({ status: 409, code: 'ETOUCH_RESUME_FIRST_EXPRESSION', params: { from: 8 } });
      // Même ligne sans expression : le G0 modal est rajouté.
      const plain = attempt(gcode.replace('X[4*2] Y[3]', 'X8 Y3'), 8).ok;
      expect(plain.program.split('\n')[plain.preamble.length]).toBe('G0 X8 Y3');
    });
  });

  describe('re-check c4c048c7 · D4 : changesOffset', () => {
    test.each([
      ['(a (b) ; c) G55', true],
      ['(a (G55) b) G0 X1', false],
      ['(a (b) G55', false],
      ['G0 X1 (G92 X0)', false],
      ['G0 X1 ; G10 L20 P1 X0', false],
      ['G[54+1]', true],
      ['(G[54+1])', false],
      ['G0 X1 ; G[54+1]', false],
      ['g55', true],
      ['G10 L20 P1 X0', true],
      ['G92.1', true],
      // G54.1 (LinuxCNC, absent de Grbl) compte comme changement : sur-détection sans effet.
      ['G54.1', true],
      ['G540', false],
      ['M54', false],
      ['G0 X[posx]', true],
      ['G0 X1\r\nG55\r\n', true]
    ])('%j → %s', (gcode, expected) => {
      expect(changesOffset(gcode)).toBe(expected);
      // Same verdict on what CNCjs sends, for the lines without expression.
      if (!/[[\]]/.test(gcode)) {
        const cncjs = gcode.split('\n').map((l) => sent(l)).join('\n');
        expect(/G0*(5[4-9]|10|92)/i.test(cncjs.replace(/G540/gi, ''))).toBe(expected);
      }
    });
  });
});
