/* eslint-env jest */
import { buildResume, programLines, stateBefore } from '../resume';

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
    const prog = ['G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F200', 'G1 X10 F800', 'G1 Y10', 'G1 X0', 'M30'].join('\n');
    const r = buildResume(prog, 5);
    expect(r.preamble[1]).toBe('G90 G17 G94');
    expect(r).toMatchObject({ wcs: null, units: null });
    const chosen = buildResume('G20 G55\n' + prog, 6);
    expect(chosen.preamble[1]).toBe('G20 G90 G17 G55 G94');
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
    expect(r.preamble).toEqual(['(CNCjs Touch : reprise a la ligne 6)', 'G20 G90 G17 G94', 'G0 Z0.5', 'G0 X1 Y1', 'G1 Z-0.1 F10']);
    expect(r.spindle).toBe(null);
    expect(r.coolant).toBe(null);
  });

  test('a unit change converts positions, clearance and feeds together (5 mm under G20 is Z0.1969, never Z5)', () => {
    const prog = ['G21 G90', 'G0 X100 Y0 Z5', 'G20', 'G1 X4 F10', 'G1 Y1'].join('\n');
    const r = buildResume(prog, 5);
    expect(r.preamble).toEqual(['(CNCjs Touch : reprise a la ligne 5)', 'G20 G90 G17 G94', 'G0 Z0.1969', 'G0 X4 Y0', 'G1 Z0.1969 F10']);
    expect(r.preamble.join('\n')).not.toMatch(/Z5\b/);
    expect(r.units).toBe('G20');
    expect(r.safeZ).toBeCloseTo(5 / 25.4, 6);
    expect(r.notes).toEqual(expect.arrayContaining([expect.stringMatching(/unités.*ligne 3/)]));
    // Feeds (units per minute) and the plunge feed follow the same conversion.
    const feeds = ['G21 G90', 'G0 X0 Y0 Z5', 'G1 Z-1 F300', 'G20', 'G1 X1'].join('\n');
    expect(buildResume(feeds, 5).preamble.slice(1)).toEqual(['G20 G90 G17 G94', 'G0 Z0.1969', 'G0 X0 Y0', 'G1 Z-0.0394 F11.811']);
  });

  test('a program that alternates units several times, with incremental moves in between, is followed', () => {
    const prog = ['G21 G90', 'G0 X25.4 Y0 Z5', 'G20', 'G1 X2 F10', 'G91 G1 X1', 'G90 G21', 'G1 Y10 F200', 'G1 X3'].join('\n');
    const r = buildResume(prog, 8);
    expect(r.position.X).toBeCloseTo(76.2, 6);
    expect(r.position).toMatchObject({ Y: 10 });
    expect(r.position.Z).toBeCloseTo(5, 6);
    expect(r.preamble.slice(1)).toEqual(['G21 G90 G17 G94', 'G0 Z5', 'G0 X76.2 Y10', 'G1 Z5 F200']);
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
    expect(r.preamble.slice(1)).toEqual(['G21 G90 G17 G55 G94', 'G0 Z3', 'G0 X20 Y5', 'G1 Z-1 F100']);
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
    expect(at(['G43.1 Z2.5', 'G49'], 8)().position).toEqual({ X: 5, Y: 0, Z: -1 });
  });

  test('arcs: end points are followed, I/J/R are never taken for positions, a modal arc line gets its G2 back', () => {
    const prog = ['G21 G90', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F100', 'G2 X10 Y10 I5 J5', 'X0 Y0 I-5 J-5', 'G3 X4 Y4 R3', 'G1 X1'].join('\n');
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
    expect(at(['G53 G0 Z-1', 'G0 Z5'], 7)().preamble.slice(1)).toEqual(['G21 G90 G17 G94', 'G0 Z5', 'G0 X0 Y0', 'G1 Z5 F100']);
  });

  test('notes state the limits: the clearance is the highest Z seen, modes left to the controller are named', () => {
    const r = buildResume(PROGRAM, 12);
    expect(r.notes).toEqual([expect.stringMatching(/dégagement.*Z5.*pas une garantie/)]);
    const bare = buildResume(['G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F200', 'G1 X10 F800', 'G1 Y10', 'M30'].join('\n'), 5);
    expect(bare.notes).toEqual([
      expect.stringMatching(/dégagement/),
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
    expect(r.preamble.slice(1)).toEqual(['G21 G90 G17 G94', 'G0 Z5.08', 'G0 X25.4 Y25.4', 'G1 Z-1.27 F254']);
    expect(r.notes.join(' ')).toMatch(/unités.*ligne 4.*G21/);
  });

  test('a feed given before G20 and reused after it is converted (working and plunge feeds)', () => {
    const prog = ['G21 G90', 'G0 X0 Y0 Z5', 'G1 Z-1 F300', 'G1 X10 F600', 'G20', 'G1 X1', 'G1 Y1'].join('\n');
    const r = buildResume(prog, 7);
    expect(r.preamble.slice(1)).toEqual(['G20 G90 G17 G94', 'G0 Z0.1969', 'G0 X1 Y0', 'G1 Z-0.0394 F11.811', 'F23.622']);
  });

  test('several G words on a line: G1 G20 X1 F10 converts the state before X is applied in inches', () => {
    const prog = ['G21 G90', 'G0 X0 Y0 Z5', 'G1 G20 X1 F10', 'G1 Y1'].join('\n');
    const r = buildResume(prog, 4);
    expect(r.position).toEqual({ X: 1, Y: 0, Z: near(5 / IN) });
    expect(r.preamble.slice(1)).toEqual(['G20 G90 G17 G94', 'G0 Z0.1969', 'G0 X1 Y0', 'G1 Z0.1969 F10']);
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
    expect(r.preamble.slice(1)).toEqual(['G20 G90 G17 G94', 'G0 Z0.1969', 'G0 X1.3937 Y0.3937', 'G1 Z0.1969 F7.874']);
    expect(r.notes.join(' ')).toMatch(/ligne 8/);
    expect(() => buildResume(prog, 6)).toThrow(/G91/);
  });

  test('G91 then G90 with a clearance reached under G91: the absolute height is followed', () => {
    const prog = ['G21 G90', 'G0 X0 Y0 Z5', 'G1 Z-1 F100', 'G91', 'G0 Z6', 'G90', 'G0 X10 Y10', 'G1 Z-1', 'G1 X20'].join('\n');
    expect(buildResume(prog, 9)).toMatchObject({ position: { X: 10, Y: 10, Z: -1 }, safeZ: 5 });
    expect(buildResume(prog, 8).preamble.slice(1)).toEqual(['G21 G90 G17 G94', 'G0 Z5', 'G0 X10 Y10', 'G1 Z5 F100']);
  });

  test('a lone F before G21 (no move) refuses the resume: conservative, its unit depends on the machine', () => {
    const prog = ['S12000 M3', 'F500', 'G21 G90', 'G0 X0 Y0 Z5', 'G1 Z-1 F100', 'G1 X5'].join('\n');
    expect(() => buildResume(prog, 6)).toThrow(/unités.*ligne 3/);
  });

  test('lower case, compact code, comments holding G words', () => {
    const prog = ['g21 g90 g54', 'g0z5', 'g0x10y10', 'g1z-1f100 (G20 G91 G55)', 'g1x20 ; G92 X0 G10', 'g1y5'].join('\n');
    const r = buildResume(prog, 6);
    expect(r).toMatchObject({ units: 'G21', wcs: 'G54', position: { X: 20, Y: 10, Z: -1 }, safeZ: 5 });
    expect(r.preamble.slice(1)).toEqual(['G21 G90 G17 G54 G94', 'G0 Z5', 'G0 X20 Y10', 'G1 Z-1 F100']);
    expect(r.notes).toHaveLength(1);
  });

  test('a program without G20/G21 nor G54 keeps units/wcs null', () => {
    const prog = ['G90', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F100', 'G1 X5'].join('\n');
    const r = buildResume(prog, 5);
    expect(r).toMatchObject({ units: null, wcs: null });
    expect(r.preamble[1]).toBe('G90 G17 G94');
    expect(r.notes).toEqual([
      expect.stringMatching(/dégagement/), expect.stringMatching(/unités/), expect.stringMatching(/repère/)
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
    expect(r.notes).toHaveLength(1);
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
    expect(r.preamble.slice(1)).toEqual(['G20 G90 G17 G55 G94', 'G0 Z0.5', 'G0 X1 Y1', 'G1 Z-0.1 F3.937']);
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
    expect(at(['G43.1 Z2.5', 'G1 X3', 'G49'], 8)().position).toEqual({ X: 3, Y: 0, Z: -1 });
    expect(at(['G43.1 Z2.5', 'G49', 'G43.1 Z1'], 8)).toThrow(/G43\.1.*ligne 7/);
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
    const prog = base.concat(['G2 X10 Y0 I5 J0', 'X0 Y0 I-5 J0', 'G2 X10 Y0 Z-2 I5 J0 K0', 'G3 X0 Y0 R5', 'G1 X1']).join('\n');
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
    expect(buildResume(rapid, 6).preamble.slice(1)).toEqual(['G21 G90 G17 G94', 'G0 Z5', 'G0 X0 Y0', 'G1 Z5 F100']);
    const modal = ['G21 G90', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F100', 'G0', 'Z5', 'G1 X10'].join('\n');
    expect(buildResume(modal, 7).preamble.slice(1)).toEqual(['G21 G90 G17 G94', 'G0 Z5', 'G0 X0 Y0', 'G1 Z5 F100']);
    // A retract made at feed (G1 Z8) followed by a plunge: the clearance Z8 is above the resume Z.
    const feed = ['G21 G90', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F100', 'G1 Z8 F500', 'G1 Z-2 F100', 'G1 X10'].join('\n');
    expect(buildResume(feed, 7)).toMatchObject({ position: { X: 0, Y: 0, Z: -2 }, safeZ: 8 });
    // A G1 up to the same height as an earlier rapid keeps that height as a clearance.
    const same = ['G21 G90', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F100', 'G1 Z5 F500', 'G1 X10'].join('\n');
    expect(buildResume(same, 6).preamble[2]).toBe('G0 Z5');
  });
});
