/* eslint-env jest */
import { analyzeProgram, checkProgram, programCheck } from '../program-check';

// A homed Grbl with 300 x 200 x 80 mm travel, homing towards positive (machine
// space [-travel, 0]), work origin at machine X-250 Y-150 Z-40 (G54 active).
const machine = ({ settings, ...over } = {}) => ({
  settings: { $20: '1', $22: '1', $23: '0', $130: '300', $131: '200', $132: '80', ...(settings || {}) },
  mpos: { x: -250, y: -150, z: -40 },
  wpos: { x: 0, y: 0, z: 0 },
  modal: { units: 'G21', distance: 'G90', wcs: 'G54' },
  parameters: null,
  homed: true,
  reportUnits: 'mm',
  ...over
});

const SQUARE = ['G21 G90 G54', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-3 F100', 'G1 X40 F500', 'G1 Y30', 'G1 X0', 'G1 Y0', 'G0 Z5', 'M30'].join('\n');

describe('program check (F2): analysis', () => {
  test('a plain square is followed: units, mode, offset, XYZ extent, Z depth and clearance', () => {
    const a = analyzeProgram(SQUARE);
    expect(a).toMatchObject({ units: 'G21', distance: 'G90', wcs: 'G54', rawUnits: false, relativeStart: false, moves: 8 });
    expect(a.extent).toEqual({ X: { min: 0, max: 40 }, Y: { min: 0, max: 30 }, Z: { min: -3, max: 5 } });
    expect(a.zMin).toBe(-3);
    expect(a.zMax).toBe(5);
    expect(a.uninterpreted).toEqual([]);
    expect(a.unknownAxes).toEqual({ X: null, Y: null, Z: null });
  });

  test('inch programs are converted to millimetres; a unit change mid-program is listed and converted', () => {
    const a = analyzeProgram('G20 G90\nG0 X1 Y2\nG1 Z-0.5 F10');
    expect(a.units).toBe('G20');
    expect(a.extent.X).toEqual({ min: 25.4, max: 25.4 });
    expect(a.extent.Z).toEqual({ min: -12.7, max: -12.7 });
    const b = analyzeProgram('G21 G90\nG0 X10\nG20\nG0 X2\nG21\nG0 X30');
    expect(b.unitsChanges).toEqual([3, 5]);
    expect(b.extent.X).toEqual({ min: 10, max: 50.8 });
    expect(b.unknownAxes.X).toBeNull();
  });

  test('units fixed after moves made in the machine units leave every axis unknown', () => {
    const a = analyzeProgram('G90\nG0 X10 Y10\nG21\nG1 Z-1 F100');
    expect(a.rawUnits).toBe(true);
    expect(a.unitsChanges).toEqual([3]);
    expect(a.unknownAxes.X).toMatch(/Unités fixées.*ligne 3/);
    expect(a.extent.X).toBeNull();
  });

  test('a program that never sets its units keeps a raw extent, converted later from the machine modal', () => {
    const a = analyzeProgram('G90\nG0 X10 Y5\nG1 Z-2 F100');
    expect(a.rawUnits).toBe(true);
    expect(a.extent.X).toEqual({ min: 10, max: 10 });
    const mm = checkProgram(a, machine());
    expect(mm.verdict).toBe('validated');
    expect(mm.axes.X.max).toBe(10);
    // In inches the same words reach X254 mm: 4 mm past the machine end.
    const inch = checkProgram(a, machine({ modal: { units: 'G20', distance: 'G90', wcs: 'G54' } }));
    expect(inch.axes.X.max).toBe(254);
    expect(inch.axes.X).toMatchObject({ verdict: 'outside', machineMax: 4 });
    expect(inch.verdict).toBe('outside');
    expect(inch.info.join(' ')).toMatch(/G20 appliqué/);
    const stale = checkProgram(a, machine({ modal: null }));
    expect(stale.verdict).toBe('unknown');
    expect(stale.reasons.join(' ')).toMatch(/ne fixe pas ses unités/);
  });

  test('G91 moves accumulate from a known position; an initial G91 makes the start relative and unknown', () => {
    const a = analyzeProgram('G21 G90\nG0 X10 Y10 Z5\nG91\nG1 X5 F100\nG1 X5\nG1 Y-20\nG90\nG0 X0');
    expect(a.distanceChanges).toEqual([3, 7]);
    expect(a.extent.X).toEqual({ min: 0, max: 20 });
    expect(a.extent.Y).toEqual({ min: -10, max: 10 });
    const b = analyzeProgram('G21 G91\nG1 X5 F100\nG1 Y5');
    expect(b.relativeStart).toBe(true);
    expect(b.unknownAxes.X).toMatch(/relatif.*ligne 2/);
    expect(checkProgram(b, machine()).verdict).toBe('unknown');
    expect(checkProgram(b, machine()).reasons.join(' ')).toMatch(/G91/);
  });

  test('arcs get a conservative envelope (the whole circle), in I/J and R forms, helical Z included', () => {
    const ij = analyzeProgram('G21 G90\nG0 X10 Y0 Z0\nG2 X-10 Y0 I-10 J0 Z-4 F200');
    expect(ij.extent.X).toEqual({ min: -10, max: 10 });
    expect(ij.extent.Y).toEqual({ min: -10, max: 10 });
    expect(ij.extent.Z).toEqual({ min: -4, max: 0 });
    // Quarter circle from (10,0) to (0,10), radius 10, centre at the origin.
    const r = analyzeProgram('G21 G90\nG0 X10 Y0\nG3 X0 Y10 R10 F200');
    expect(r.extent.X.min).toBeCloseTo(-10, 6);
    expect(r.extent.X.max).toBeCloseTo(10, 6);
    expect(r.extent.Y.min).toBeCloseTo(-10, 6);
    expect(r.extent.Y.max).toBeCloseTo(10, 6);
    const impossible = analyzeProgram('G21 G90\nG0 X0 Y0\nG2 X100 Y0 R10 F200');
    expect(impossible.unknownAxes.X).toMatch(/rayon trop court/);
    const plane = analyzeProgram('G21 G90 G18\nG0 X0 Y0\nG2 X10 Z-5 I5 K0 F200');
    expect(plane.unknownAxes.X).toMatch(/hors plan XY/);
    expect(plane.uninterpreted[0].code).toMatch(/G2 G18/);
  });

  test('offset changes, work offset changes, machine moves, probes, G43.1 and macros are never followed', () => {
    expect(analyzeProgram('G21 G90\nG0 X10\nG92 X0\nG0 X10').unknownAxes.X).toMatch(/G92 ligne 3/);
    expect(analyzeProgram('G21 G90\nG10 L20 P1 X0\nG0 X10').unknownAxes.Y).toMatch(/G10 ligne 2/);
    expect(analyzeProgram('G21 G90 G54\nG0 X10\nG55\nG0 X10').unknownAxes.X).toMatch(/change de repère \(ligne 3\)/);
    expect(analyzeProgram('G21 G90\nG0 X10\nG54\nG0 X10').unknownAxes.X).toMatch(/change de repère/);
    const g53 = analyzeProgram('G21 G90\nG53 G0 Z-5\nG0 X10 Y10\nG1 Z-2 F100');
    expect(g53.machineMoves).toEqual([{ line: 2, code: 'G53' }]);
    expect(g53.extent.Z).toEqual({ min: -2, max: -2 });
    const g28 = analyzeProgram('G21 G90\nG0 X10 Y10 Z5\nG28\nG91\nG1 X5 F100');
    expect(g28.unknownAxes.X).toMatch(/relatif.*ligne 5/);
    const probe = analyzeProgram('G21 G90\nG0 X10\nG38.2 Z-20 F50\nG0 X20');
    expect(probe.unknownAxes.Z).toMatch(/Palpage/);
    expect(probe.unknownAxes.X).toBeNull();
    expect(probe.extent.X).toEqual({ min: 10, max: 20 });
    const tlo = analyzeProgram('G21 G90\nG43.1 Z2.5\nG0 X10 Z5');
    expect(tlo.unknownAxes.Z).toMatch(/G43.1/);
    expect(tlo.extent.X).toEqual({ min: 10, max: 10 });
    const macro = analyzeProgram('G21 G90\n%wait\nG0 X10\n[posx]\nG1 X20 F100');
    expect(macro.unknownAxes.X).toMatch(/Macro ou expression.*ligne 2/);
    expect(macro.uninterpreted.map((u) => u.code)).toEqual(['%wait', '[posx]']);
    const odd = analyzeProgram('G21 G90\nG5 X10\nM100\nG0 X1');
    expect(odd.uninterpreted).toEqual([{ line: 2, code: 'G5', impact: true }, { line: 3, code: 'M100', impact: false }]);
    expect(odd.unknownAxes.X).toMatch(/G5/);
  });
});

describe('program check (F2): comparison with the machine', () => {
  test('a square inside the travel is validated on every axis, with the machine extent', () => {
    const r = programCheck(SQUARE, machine());
    expect(r.verdict).toBe('validated');
    expect(r.axes.X).toMatchObject({ verdict: 'validated', min: 0, max: 40, low: -300, high: 0, machineMin: -250, machineMax: -210 });
    expect(r.axes.Z).toMatchObject({ verdict: 'validated', machineMin: -43, machineMax: -35 });
    expect(r.zMin).toBe(-3);
    expect(r.zMax).toBe(5);
    expect(r.info.join(' ')).toMatch(/\$20=1/);
    expect(r.scope).toMatch(/ni brides, ni outil, ni matière/);
  });

  test('a Z plunge below the machine floor is outside, with the figures; the other axes stay validated', () => {
    const r = programCheck(SQUARE.replace('G1 Z-3 F100', 'G1 Z-45 F100'), machine());
    expect(r.verdict).toBe('outside');
    expect(r.axes.Z.verdict).toBe('outside');
    expect(r.axes.Z.reasons[0]).toMatch(/Hors course Z : -85 → -35 mm machine \(course -80 → 0\)/);
    expect(r.axes.X.verdict).toBe('validated');
    // Clearance above the machine ceiling as well.
    const up = programCheck(SQUARE.replace(/G0 Z5/g, 'G0 Z45'), machine());
    expect(up.axes.Z.verdict).toBe('outside');
    expect(up.axes.Z.machineMax).toBe(5);
  });

  test('the homing direction mask flips an axis to [0, travel]', () => {
    const r = programCheck(SQUARE, machine({ settings: { $23: '1' }, mpos: { x: 50, y: -150, z: -40 } }));
    expect(r.axes.X).toMatchObject({ verdict: 'validated', low: 0, high: 300, machineMin: 50, machineMax: 90 });
    const out = programCheck(SQUARE, machine({ settings: { $23: '1' }, mpos: { x: 280, y: -150, z: -40 } }));
    expect(out.axes.X.verdict).toBe('outside');
  });

  test('homing enabled is not homing done: without an observed homing cycle, the verdict is unknown, never validated', () => {
    const r = programCheck(SQUARE, machine({ homed: false }));
    expect(r.verdict).toBe('unknown');
    expect(r.reasons.join(' ')).toMatch(/Référencement non constaté.*\$22=1 signifie activé, pas effectué/);
    expect(['validated']).not.toContain(r.axes.X.verdict);
    // Even a program far outside is not reported "outside" from meaningless coordinates.
    const far = programCheck(SQUARE.replace('G1 X40 F500', 'G1 X4000 F500'), machine({ homed: false }));
    expect(far.verdict).toBe('unknown');
    expect(programCheck(SQUARE, machine({ settings: { $22: '0' } })).reasons.join(' ')).toMatch(/désactivée \(\$22=0\)/);
    expect(programCheck(SQUARE, machine({ settings: { $22: undefined } })).reasons.join(' ')).toMatch(/\$22 inconnu/);
  });

  test('missing data gives unknown with the missing item named: travel setting, positions, report units', () => {
    const noTravel = programCheck(SQUARE, machine({ settings: { $130: undefined } }));
    expect(noTravel.axes.X.verdict).toBe('unknown');
    expect(noTravel.axes.X.reasons).toContain('Course $130 inconnue.');
    expect(noTravel.axes.Y.verdict).toBe('validated');
    expect(noTravel.verdict).toBe('unknown');
    const noPos = programCheck(SQUARE, machine({ mpos: {} }));
    expect(noPos.axes.X.reasons.join(' ')).toMatch(/Position machine ou de travail X inconnue/);
    const inches = programCheck(SQUARE, machine({ reportUnits: 'in' }));
    expect(inches.verdict).toBe('unknown');
    expect(inches.reasons.join(' ')).toMatch(/\$13=1/);
  });

  test('a program selecting another work offset needs the $# parameters; with them the offset is applied', () => {
    const prog = SQUARE.replace('G54', 'G55');
    const without = programCheck(prog, machine());
    expect(without.verdict).toBe('unknown');
    expect(without.reasons.join(' ')).toMatch(/G55 alors que le repère actif est G54/);
    const params = { G54: { x: -250, y: -150, z: -40 }, G55: { x: -40, y: -20, z: -40 }, G92: { x: 0, y: 0, z: 0 }, TLO: 0 };
    const withParams = programCheck(prog, machine({ parameters: params }));
    expect(withParams.verdict).toBe('outside');
    // G55 origin at X-40: 0..40 ends exactly at the machine end; Y-20: 0..30 passes it by 10 mm.
    expect(withParams.axes.X).toMatchObject({ verdict: 'validated', machineMin: -40, machineMax: 0 });
    expect(withParams.axes.Y.verdict).toBe('outside');
    expect(withParams.axes.Y.reasons[0]).toMatch(/Hors course Y : -20 → 10/);
    expect(withParams.info.join(' ')).toMatch(/Repère G55 du programme lu dans les paramètres/);
    const staleModal = programCheck(prog, machine({ modal: null }));
    expect(staleModal.reasons.join(' ')).toMatch(/Repère actif inconnu/);
  });

  test('an axis the program never moves is validated as not solicited; an unfollowed program is unknown, and the followed part can still be outside', () => {
    const xy = programCheck('G21 G90\nG0 X10 Y10\nG1 X20 F100', machine());
    expect(xy.verdict).toBe('validated');
    expect(xy.axes.Z).toMatchObject({ verdict: 'validated', min: null, reasons: ['Axe Z non sollicité par le programme.'] });
    const partly = programCheck('G21 G90\nG0 X10 Y10 Z5\nG1 X20 F100\nG43.1 Z2\nG1 Z-1', machine());
    expect(partly.axes.Z.verdict).toBe('unknown');
    expect(partly.axes.X.verdict).toBe('validated');
    expect(partly.verdict).toBe('unknown');
    const partlyOut = programCheck('G21 G90\nG0 X10 Y10 Z5\nG1 X300 F100\nG43.1 Z2\nG1 Z-1', machine());
    expect(partlyOut.axes.X.verdict).toBe('outside');
    expect(partlyOut.axes.Z.verdict).toBe('unknown');
    expect(partlyOut.verdict).toBe('outside');
  });

  test('a program that leaves its distance mode to the machine is unknown unless the machine is in a fresh G90', () => {
    const prog = 'G21\nG0 X10 Y10\nG1 Z-1 F100';
    expect(programCheck(prog, machine()).verdict).toBe('validated');
    const r = programCheck(prog, machine({ modal: { units: 'G21', distance: 'G91', wcs: 'G54' } }));
    expect(r.verdict).toBe('unknown');
    expect(r.reasons.join(' ')).toMatch(/ne fixe pas son mode/);
  });
});
