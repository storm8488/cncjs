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
