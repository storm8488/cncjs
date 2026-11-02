/* eslint-env jest */
import { analyzeProgram, checkProgram, programCheck } from '../program-check';
import { catalogCodes, expectCatalogMatch } from './touch-codes-catalog';

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

  test('arcs get their exact envelope (end points and swept cardinal points), in I/J and R forms, helical Z included', () => {
    // Half circle clockwise from (10,0) to (-10,0) around the origin: passes through (0,-10), never (0,10).
    const ij = analyzeProgram('G21 G90\nG0 X10 Y0 Z0\nG2 X-10 Y0 I-10 J0 Z-4 F200');
    expect(ij.extent.X).toEqual({ min: -10, max: 10 });
    expect(ij.extent.Y).toEqual({ min: -10, max: 0 });
    expect(ij.extent.Z).toEqual({ min: -4, max: 0 });
    // Quarter circle counter-clockwise from (10,0) to (0,10), radius 10, centre at the origin.
    const r = analyzeProgram('G21 G90\nG0 X10 Y0\nG3 X0 Y10 R10 F200');
    expect(r.extent.X.min).toBeCloseTo(0, 6);
    expect(r.extent.X.max).toBeCloseTo(10, 6);
    expect(r.extent.Y.min).toBeCloseTo(0, 6);
    expect(r.extent.Y.max).toBeCloseTo(10, 6);
    // Same end points clockwise: R10 is the short arc around (10,10), R-10 the long one around the origin.
    const short = analyzeProgram('G21 G90\nG0 X10 Y0\nG2 X0 Y10 R10 F200');
    expect(short.extent.X.min).toBeCloseTo(0, 6);
    expect(short.extent.Y.min).toBeCloseTo(0, 6);
    expect(short.extent.Y.max).toBeCloseTo(10, 6);
    const long = analyzeProgram('G21 G90\nG0 X10 Y0\nG2 X0 Y10 R-10 F200');
    expect(long.extent.X.min).toBeCloseTo(-10, 6);
    expect(long.extent.Y.min).toBeCloseTo(-10, 6);
    expect(long.extent.X.max).toBeCloseTo(10, 6);
    expect(long.extent.Y.max).toBeCloseTo(10, 6);
    // Same start and end in I/J form: the full circle.
    const full = analyzeProgram('G21 G90\nG0 X0 Y0\nG3 X0 Y0 I5 J0 F200');
    expect(full.extent.X).toEqual({ min: 0, max: 10 });
    expect(full.extent.Y).toEqual({ min: -5, max: 5 });
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

describe('program check (F2), cross-check 3: dépassements détectés', () => {
  test('Z trop haut (+) et Z trop profond (−) → outside avec les chiffres machine', () => {
    const up = programCheck('G21 G90\nG0 Z41\nM30', machine());
    expect(up.axes.Z).toMatchObject({ verdict: 'outside', machineMax: 1 });
    expect(up.verdict).toBe('outside');
    const down = programCheck('G21 G90\nG0 Z5\nG1 Z-41 F100\nM30', machine());
    expect(down.axes.Z).toMatchObject({ verdict: 'outside', machineMin: -81 });
    expect(down.axes.Z.reasons[0]).toMatch(/Hors course Z : -81 → -35 mm machine \(course -80 → 0\)/);
    // À la limite exacte : accepté (tolérance 1 µm).
    expect(programCheck('G21 G90\nG0 Z40\nG1 Z-40 F100', machine()).axes.Z.verdict).toBe('validated');
  });

  test('X avec repère G55 décalé lu dans $# : dépassement détecté là où G54 l’aurait validé', () => {
    const program = 'G21 G90 G55\nG0 X0 Y0\nG1 X40 F500\nM30';
    const unknown = programCheck(program, machine());
    expect(unknown.verdict).toBe('unknown');
    expect(unknown.reasons.join(' ')).toMatch(/G55.*G54.*\$#.*inconnus/);
    // G55 X = -10 : X40 travail → X30 machine, au-delà de 0.
    const withParams = programCheck(program, machine({ parameters: { G55: { x: '-10', y: '-150', z: '-40' }, G92: { x: '0', y: '0', z: '0' }, TLO: '0' } }));
    expect(withParams.axes.X).toMatchObject({ verdict: 'outside', machineMin: -10, machineMax: 30 });
    expect(withParams.info.join(' ')).toMatch(/Repère G55 du programme lu/);
    // Le même programme sous G54 serait validé.
    expect(programCheck(program.replace('G55', 'G54'), machine()).verdict).toBe('validated');
  });

  test('G20 : pouces convertis avant comparaison ; X2 in = 50,8 mm → X12 in = 304,8 mm dépasse', () => {
    const ok = programCheck('G20 G90\nG0 X2 Y1\nG1 Z-0.1 F10', machine());
    expect(ok.axes.X.max).toBeCloseTo(50.8);
    expect(ok.verdict).toBe('validated');
    const out = programCheck('G20 G90\nG0 X12', machine());
    expect(out.axes.X).toMatchObject({ verdict: 'outside' });
  });

  test('direction de homing $23 : bit X (1) → espace X [0, +300] ; un programme à X machine négatif devient hors course', () => {
    const m = machine({ settings: { $23: '1' }, mpos: { x: 50, y: -150, z: -40 } }); // X travail 0 = X machine +50
    const r = programCheck('G21 G90\nG0 X-60 Y-10\nG0 X200', m);
    expect(r.axes.X).toMatchObject({ low: 0, high: 300, machineMin: -10, machineMax: 250, verdict: 'outside' });
    expect(r.axes.Y).toMatchObject({ low: -200, high: 0 });
    const z = programCheck('G21 G90\nG0 Z1', machine({ settings: { $23: '4' }, mpos: { x: -250, y: -150, z: 40 } }));
    expect(z.axes.Z).toMatchObject({ low: 0, high: 80, verdict: 'validated' });
  });
});

describe('program check (F2), cross-check 3: inconnu jamais validé', () => {
  test('$130 absent → X inconnu même si Y et Z sont validés ; $22=1 (chaîne) sans homing constaté → inconnu, même très hors course', () => {
    const r = programCheck('G21 G90\nG0 X10 Y10 Z1', machine({ settings: { $130: undefined } }));
    expect(r.axes.X.verdict).toBe('unknown');
    expect(r.axes.X.reasons).toContain('Course $130 inconnue.');
    expect(r.axes.Y.verdict).toBe('validated');
    expect(r.verdict).toBe('unknown');
    const far = programCheck('G21 G90\nG0 X5000 Y5000 Z500', machine({ homed: false }));
    expect(far.verdict).toBe('unknown');
    expect(far.axes.X.verdict).toBe('unknown'); // jamais `outside` sur des coordonnées sans référence
    expect(far.reasons.join(' ')).toMatch(/Référencement non constaté/);
    // homed: 'true' (chaîne) ou 1 ne vaut pas true.
    expect(programCheck('G21 G90\nG0 X1', machine({ homed: 'true' })).verdict).toBe('unknown');
    expect(programCheck('G21 G90\nG0 X1', machine({ homed: 1 })).verdict).toBe('unknown');
  });

  test('G91 initial → inconnu ; G91 après une position absolue connue → suivi et validé/outside', () => {
    const rel = programCheck('G21 G91\nG0 X10 Y10\nG1 Z-1 F100', machine());
    expect(rel.verdict).toBe('unknown');
    expect(rel.reasons.join(' ')).toMatch(/commence en déplacements relatifs/);
    const later = analyzeProgram('G21 G90\nG0 X10 Y10 Z0\nG91\nG0 X35\nG1 Z-5 F100\nG90');
    expect(later.extent.X).toEqual({ min: 10, max: 45 });
    expect(later.distanceChanges).toEqual([3, 6]);
    expect(checkProgram(later, machine()).verdict).toBe('validated');
    // X10 puis +260 relatif = X270 travail = +20 mm machine.
    expect(checkProgram(analyzeProgram('G21 G90\nG0 X10\nG91\nG0 X260'), machine()).axes.X).toMatchObject({ verdict: 'outside', machineMax: 20 });
  });

  test('$20=0 est mentionné dans `info` (pas une raison) ; $20 absent : rien', () => {
    const off = programCheck('G21 G90\nG0 X1', machine({ settings: { $20: '0' } }));
    expect(off.info.join(' ')).toMatch(/Limites logicielles Grbl inactives \(\$20=0\)/);
    expect(off.verdict).toBe('validated');
    expect(programCheck('G21 G90\nG0 X1', machine({ settings: { $20: undefined } })).info.join(' ')).not.toMatch(/Limites logicielles/);
  });

  test('macros/expressions, codes G inconnus, G38, G43.1 : inconnu ; un programme vide : tout « non sollicité » → validated', () => {
    expect(programCheck('G21 G90\nG0 X[#1+2]', machine()).verdict).toBe('unknown');
    expect(programCheck('G21 G90\nG0 X1\n%wait', machine()).verdict).toBe('unknown');
    expect(programCheck('G21 G90\nG5 X1 Y1 I0 J1 P2 Q3', machine()).verdict).toBe('unknown');
    expect(programCheck('G21 G90\nG38.2 Z-10 F50\nG0 X1', machine()).axes.Z.verdict).toBe('unknown');
    const empty = programCheck('', machine());
    expect(empty.verdict).toBe('validated');
    expect(empty.reasons).toEqual(['Axe X non sollicité par le programme.', 'Axe Y non sollicité par le programme.', 'Axe Z non sollicité par le programme.']);
  });
});

describe('program check (F2), cross-check 3: « axe non sollicité = validé »', () => {
  test('un programme XY sans Z : Z validé avec la raison, même si la position Z est inconnue et $132 absent', () => {
    const r = programCheck('G21 G90\nG0 X10 Y10\nG1 X20 F100', machine({ mpos: { x: -250, y: -150 }, wpos: { x: 0, y: 0 }, settings: { $132: undefined } }));
    expect(r.axes.Z).toMatchObject({ verdict: 'validated', reasons: ['Axe Z non sollicité par le programme.'] });
    expect(r.verdict).toBe('validated');
    // Et même sans référencement : l'axe non sollicité court-circuite les doutes de référence.
    const noHome = programCheck('G21 G90\nG0 X10 Y10', machine({ homed: false }));
    expect(noHome.axes.Z.verdict).toBe('validated');
    expect(noHome.verdict).toBe('unknown');
  });

  // D4 (corrigé) : G53 porte des coordonnées MACHINE explicites, comparées
  // directement à la course ; jamais « non sollicité ».
  test('G53 G0 X-400 (hors course en coordonnées machine) → outside ; G53 G0 Z0 des posts Fusion reste validé', () => {
    const r = programCheck('G21 G90\nG53 G0 X-400 Y-10\nM30', machine());
    expect(r.machineMoves).toEqual([{ line: 2, code: 'G53' }]);
    expect(r.axes.X).toMatchObject({ verdict: 'outside', machineMin: -400, machineMax: -400 });
    expect(r.axes.X.reasons[0]).toBe('Hors course X en coordonnées machine (G53) : -400 → -400 mm (course -300 → 0).');
    expect(r.axes.Y).toMatchObject({ verdict: 'validated', machineMin: -10, machineMax: -10 });
    expect(r.verdict).toBe('outside');
    // Post Fusion 360 : retraits G53 G0 Z0 autour du travail.
    const fusion = programCheck('G90 G94 G17\nG21\nG53 G0 Z0\nG0 X10 Y10\nG0 Z5\nG1 Z-1 F100\nG53 G0 Z0\nM30', machine());
    expect(fusion.axes.Z).toMatchObject({ verdict: 'validated', machineMin: -41, machineMax: 0 });
    expect(fusion.verdict).toBe('validated');
    expect(programCheck('G21 G90\nG53 G0 Z0', machine({ settings: { $23: '4' }, mpos: { x: -250, y: -150, z: 40 } })).axes.Z.verdict).toBe('validated');
    // Pouces : G20 G53 X-12 = -304,8 mm machine.
    const inch = programCheck('G20 G90\nG53 G0 X-12', machine()).axes.X;
    expect(inch.verdict).toBe('outside');
    expect(inch.machineMin).toBeCloseTo(-304.8, 6);
    // Absolu même sous G91 (Grbl ignore le mode de distance en G53).
    expect(programCheck('G21 G90\nG0 X0\nG91\nG53 G0 X-301', machine()).axes.X.verdict).toBe('outside');
    // Un axe déjà non suivi (G43.1) garde l'alarme d'une cible G53 hors course.
    const tlo = programCheck('G21 G90\nG43.1 Z2\nG53 G0 Z10', machine());
    expect(tlo.axes.Z.verdict).toBe('outside');
    expect(tlo.axes.Z.reasons.join(' ')).toMatch(/G53.*G43\.1/);
  });

  test('G53 sans référencement constaté ou sans course connue : inconnu, jamais validé ni hors course', () => {
    const noHome = programCheck('G21 G90\nG53 G0 X-400', machine({ homed: false }));
    expect(noHome.axes.X.verdict).toBe('unknown');
    expect(noHome.axes.X.reasons.join(' ')).toMatch(/Référencement non constaté/);
    expect(programCheck('G21 G90\nG53 G0 Z0', machine({ homed: false })).axes.Z.verdict).toBe('unknown');
    const noTravel = programCheck('G21 G90\nG53 G0 X-10', machine({ settings: { $130: undefined } }));
    expect(noTravel.axes.X).toMatchObject({ verdict: 'unknown', reasons: ['Course $130 inconnue.'] });
    // Coordonnées machine sans position de travail : la comparaison G53 n'en a pas besoin.
    expect(programCheck('G21 G90\nG53 G0 Z-5', machine({ mpos: {}, wpos: {} })).axes.Z.verdict).toBe('validated');
    // Unités laissées à la machine : converties comme le reste.
    expect(programCheck('G90\nG53 G0 X-12', machine({ modal: { units: 'G20', distance: 'G90', wcs: 'G54' } })).axes.X.verdict).toBe('outside');
    expect(programCheck('G90\nG53 G0 X-12', machine({ modal: null })).axes.X.verdict).toBe('unknown');
  });

  // D5 (corrigé) : le point intermédiaire de G28/G30 et les mots d'axe sans
  // mode de déplacement ne sont plus ignorés.
  test('G28 X-500 Y0 : point intermédiaire non suivi → X et Y inconnus ; G28 G91 Z0 (aucun point intermédiaire) reste accepté', () => {
    const r = programCheck('G21 G90\nG28 X-500 Y0\nG28\nM30', machine());
    expect(r.machineMoves.map((m) => m.code)).toEqual(['G28', 'G28']);
    expect(r.axes.X.verdict).toBe('unknown');
    expect(r.axes.X.reasons).toContain('Retour G28 par un point intermédiaire X (ligne 2) : non suivi.');
    expect(r.axes.Y.verdict).toBe('unknown');
    expect(r.verdict).toBe('unknown');
    expect(programCheck('G21 G90\nG0 X10 Y10\nG30 Z5', machine()).axes.Z.reasons.join(' ')).toMatch(/Retour G30 par un point intermédiaire Z \(ligne 3\)/);
    const old = programCheck('G21 G90\nG0 X10 Y10 Z5\nG1 Z-1 F100\nG28 G91 Z0\nG90\nG28 G91 X0 Y0\nM30', machine());
    expect(old.verdict).toBe('validated');
  });

  test('« X500 Y500 » sans G0/G1 préalable : inconnu pour X et Y, avec la ligne ; G92/G10 ne sont pas des déplacements', () => {
    const r = programCheck('G21 G90\nX500 Y500\nM30', machine());
    expect(r.moves).toBe(0);
    expect(r.axes.X).toMatchObject({ verdict: 'unknown' });
    expect(r.axes.X.reasons).toContain('Mot d’axe X sans mode de déplacement (ligne 2) : exécuté dans le mode modal de la carte, non suivi.');
    expect(r.axes.Y.verdict).toBe('unknown');
    expect(r.axes.Z.verdict).toBe('validated');
    expect(analyzeProgram('G21 G90\nG92 X0\nG0 X10').unknownAxes.X).toMatch(/G92 ligne 2/);
  });
});

describe('program check (F2), cross-check 3: arcs', () => {
  test('un arc qui sort est détecté (I/J et R) ; un cercle complet dedans est validé', () => {
    // Centre (20, 0) rayon 20 : le cercle complet va de X0 à X40, Y-20 à Y20 ; Y-20 travail → Y machine -170 : dedans.
    const full = programCheck('G21 G90\nG0 X0 Y0\nG2 X0 Y0 I20 J0 F300', machine());
    expect(full.axes.X).toMatchObject({ min: 0, max: 40, verdict: 'validated' });
    expect(full.verdict).toBe('validated');
    // Arc G2 de (0,0) à (0,-20) de centre (0,-10) rayon 10... poussé vers X machine > 0 : centre à X travail 245.
    const out = programCheck('G21 G90\nG0 X245 Y0\nG2 X245 Y-20 I0 J-10 F300', machine());
    expect(out.axes.X).toMatchObject({ verdict: 'outside', machineMax: 5 });
    const outR = programCheck('G21 G90\nG0 X245 Y0\nG2 X245 Y-20 R10 F300', machine());
    expect(outR.axes.X.verdict).toBe('outside');
  });

  // L1 (corrigé) : enveloppe exacte de l'arc ; un quart d'arc dans la course
  // près du bord n'est plus un faux « outside ».
  test('quart d’arc entièrement dans la course près du bord → validé (enveloppe exacte) ; le cercle complet au même endroit sort', () => {
    const m = machine({ mpos: { x: -250, y: -200, z: -40 } });
    // Quart d'arc G2 de (0,0) à (10,10), centre (10,0) : y ∈ [0,10] réellement.
    const r = programCheck('G21 G90\nG0 X0 Y0\nG2 X10 Y10 I10 J0 F300', m);
    expect(r.axes.Y).toMatchObject({ verdict: 'validated', machineMin: -200, machineMax: -190 });
    expect(r.verdict).toBe('validated');
    expect(programCheck('G21 G90\nG0 X0 Y0\nG1 X2.93 Y7.07 F300\nG1 X10 Y10', m).verdict).toBe('validated');
    // Le même cercle parcouru en entier descend à y = -10 → Y machine -210.
    expect(programCheck('G21 G90\nG0 X0 Y0\nG2 X0 Y0 I10 J0 F300', m).axes.Y).toMatchObject({ verdict: 'outside', machineMin: -210 });
  });

  test('arc en G18/G19 ou en G90.1 : inconnu, jamais validé', () => {
    expect(programCheck('G21 G90 G18\nG0 X0 Z0\nG2 X10 Z0 I5 K0 F100', machine()).verdict).toBe('unknown');
    expect(programCheck('G21 G90 G90.1\nG0 X0 Y0\nG2 X10 Y0 I5 J0 F100', machine()).verdict).toBe('unknown');
  });
});

describe('program check (F2), cross-check 3: unités laissées à la machine', () => {
  test('rawUnits + $G frais en G20 : extent × 25,4 ; $G absent → inconnu ; mode absent et machine en G91 → inconnu', () => {
    const a = analyzeProgram('G90\nG0 X10');
    expect(a.rawUnits).toBe(true);
    expect(checkProgram(a, machine({ modal: { units: 'G20', distance: 'G90', wcs: 'G54' } })).axes.X.max).toBeCloseTo(254);
    expect(checkProgram(a, machine({ modal: null })).verdict).toBe('unknown');
    const noMode = analyzeProgram('G21\nG0 X10');
    expect(checkProgram(noMode, machine({ modal: { units: 'G21', distance: 'G91', wcs: 'G54' } })).verdict).toBe('unknown');
    expect(checkProgram(noMode, machine()).verdict).toBe('validated');
    // $13=1 : comparaison non faite.
    expect(programCheck('G21 G90\nG0 X10', machine({ reportUnits: 'in' })).verdict).toBe('unknown');
  });
});

describe('program check (F2): coded reasons (ETOUCH_CHECK_*)', () => {
  const P = (...lines) => lines.join('\n');
  const noWcs = { units: 'G21', distance: 'G90', wcs: null };
  // [code, program, machine overrides, expected params]
  const cases = [
    ['ETOUCH_CHECK_HOMING_SETTING', SQUARE, { settings: { $22: undefined } }, {}],
    ['ETOUCH_CHECK_HOMING_DISABLED', SQUARE, { settings: { $22: '0' } }, {}],
    ['ETOUCH_CHECK_NOT_HOMED', SQUARE, { homed: false }, {}],
    ['ETOUCH_CHECK_REPORT_INCHES', SQUARE, { reportUnits: 'in' }, {}],
    ['ETOUCH_CHECK_REPORT_UNITS', SQUARE, { reportUnits: null }, {}],
    ['ETOUCH_CHECK_UNITS_UNKNOWN', P('G90', 'G0 X10'), { modal: null }, {}],
    ['ETOUCH_CHECK_DISTANCE_UNKNOWN', P('G21', 'G0 X10'), { modal: { units: 'G21', distance: 'G91', wcs: 'G54' } }, {}],
    ['ETOUCH_CHECK_RELATIVE_START', P('G21 G91', 'G0 X10'), {}, {}],
    ['ETOUCH_CHECK_WCS_OFFSET_UNKNOWN', P('G21 G90 G55', 'G0 X10'), {}, { wcs: 'G55', active: 'G54' }],
    ['ETOUCH_CHECK_ACTIVE_WCS_UNKNOWN', P('G21 G90 G55', 'G0 X10'), { modal: noWcs }, { wcs: 'G55' }],
    ['ETOUCH_CHECK_AXIS_IDLE', P('G21 G90', 'G0 X10 Y10'), {}, { axis: 'Z' }],
    ['ETOUCH_CHECK_TRAVEL_UNKNOWN', SQUARE, { settings: { $131: undefined } }, { setting: 131 }],
    ['ETOUCH_CHECK_POSITION_UNKNOWN', P('G21 G90', 'G0 X10'), { mpos: {} }, { axis: 'X' }],
    ['ETOUCH_CHECK_OUTSIDE', P('G21 G90', 'G0 X300.0004'), {}, { axis: 'X', min: '50', max: '50', low: '-300', high: '0' }],
    ['ETOUCH_CHECK_OUTSIDE_G53', P('G21 G90', 'G53 G0 X10'), {}, { axis: 'X', min: '10', max: '10', low: '-300', high: '0' }],
    ['ETOUCH_CHECK_MACRO', P('G21 G90', '%wait', 'G0 X1'), {}, { line: 2 }],
    ['ETOUCH_CHECK_UNINTERPRETED', P('G21 G90', 'G0 X1', 'G5 X2'), {}, { code: 'G5', line: 3 }],
    ['ETOUCH_CHECK_UNITS_LATE', P('G90', 'G0 X10 Y10', 'G21', 'G1 Z-1 F100'), {}, { code: 'G21', line: 3 }],
    ['ETOUCH_CHECK_WCS_CHANGE', P('G21 G90 G54', 'G0 X1', 'G55', 'G0 X2'), {}, { line: 3 }],
    ['ETOUCH_CHECK_ORIGIN_CHANGE', P('G21 G90', 'G92 X0', 'G0 X1'), {}, { code: 'G92', line: 2 }],
    ['ETOUCH_CHECK_DYNAMIC_TLO', P('G21 G90', 'G43.1 Z2', 'G0 Z1'), {}, { line: 2 }],
    ['ETOUCH_CHECK_PROBE', P('G21 G90', 'G38.2 Z-10 F50'), {}, { line: 2, axis: 'Z' }],
    ['ETOUCH_CHECK_RETURN_INTERMEDIATE', P('G21 G90', 'G28 Z5'), {}, { code: 'G28', axis: 'Z', line: 2 }],
    ['ETOUCH_CHECK_NO_MOTION_MODE', P('G21 G90', 'X10'), {}, { axis: 'X', line: 2 }],
    ['ETOUCH_CHECK_RELATIVE_FROM_UNKNOWN', P('G21 G90', 'G0 X0', 'G91', 'G0 Y5'), {}, { line: 4, axis: 'Y' }],
    ['ETOUCH_CHECK_ARC_PLANE', P('G21 G90 G18', 'G0 X0 Z0', 'G2 X10 Z0 I5 K0 F100'), {}, { line: 3 }],
    ['ETOUCH_CHECK_ARC_FROM_UNKNOWN', P('G21 G90', 'G0 X0', 'G2 X10 Y0 I5 J0 F100'), {}, { line: 3 }],
    ['ETOUCH_CHECK_ARC_RADIUS', P('G21 G90', 'G0 X0 Y0', 'G2 X10 Y0 R1 F100'), {}, { line: 3 }]
  ];
  // Every list of reasons has its coded twin: same length, same order, same text.
  const expectParallel = (r) => {
    expect(r.codedReasons.map((c) => c.message)).toEqual(r.reasons);
    ['X', 'Y', 'Z'].forEach((axis) => {
      expect(r.axes[axis].codedReasons.map((c) => c.message)).toEqual(r.axes[axis].reasons);
    });
  };

  test.each(cases)('%s: code, params and the unchanged French reason', (code, program, over, params) => {
    const r = programCheck(program, machine(over));
    expectParallel(r);
    const found = r.codedReasons.filter((c) => c.code === code);
    expect(found).toHaveLength(1);
    expect(found[0].params).toEqual(params);
    expect(r.reasons).toContain(found[0].message);
    // The client's French template, filled with these params, is this very message.
    expectCatalogMatch(found[0]);
  });

  test('every ETOUCH_CHECK_* row of the client catalog is emitted by one case above', () => {
    const catalog = catalogCodes().filter((code) => /^ETOUCH_CHECK_/.test(code)).sort();
    expect(cases.map(([code]) => code).sort()).toEqual(catalog);
    expect(catalog).toHaveLength(28);
  });

  test('French reasons and verdicts are those of the uncoded check; a validated program has none', () => {
    expect(programCheck(SQUARE, machine())).toMatchObject({ verdict: 'validated', reasons: [], codedReasons: [] });
    const stale = programCheck(P('G21 G90 G55', 'G0 X10'), machine({ modal: noWcs, homed: false }));
    expectParallel(stale);
    expect(stale.verdict).toBe('unknown');
    expect(stale.reasons).toEqual([
      'Référencement non constaté depuis le dernier redémarrage de la carte ($22=1 signifie activé, pas effectué) : course non vérifiable.',
      'Repère actif inconnu (état $G trop ancien) : le programme utilise G55.',
      'Axe Y non sollicité par le programme.',
      'Axe Z non sollicité par le programme.'
    ]);
    // Deduplicated by message: a global reason shared by X and Y is listed once.
    const shared = programCheck(P('G21 G90', 'G0 X10 Y10'), machine({ homed: false }));
    expect(shared.codedReasons.filter((c) => c.code === 'ETOUCH_CHECK_NOT_HOMED')).toHaveLength(1);
    expect(shared.axes.X.codedReasons[0]).toBe(shared.axes.Y.codedReasons[0]);
    // Outside first on its axis, then the other reasons, as before.
    const out = programCheck(P('G21 G90', 'G0 X300', 'G0 Y-10', 'G91', 'G0 Z1'), machine({ settings: { $131: undefined } }));
    expectParallel(out);
    expect(out.axes.X).toMatchObject({ verdict: 'outside' });
    expect(out.axes.X.codedReasons.map((c) => c.code)).toEqual(['ETOUCH_CHECK_OUTSIDE']);
    expect(out.axes.Y.codedReasons.map((c) => c.code)).toEqual(['ETOUCH_CHECK_TRAVEL_UNKNOWN']);
    expect(out.axes.Z.codedReasons.map((c) => c.code)).toEqual(['ETOUCH_CHECK_RELATIVE_FROM_UNKNOWN']);
  });

  test('the analysis keeps the first reason per axis as text and as a coded reason', () => {
    const a = analyzeProgram(P('G21 G90', 'G0 X0', 'G5', 'G38.2 Z-1 F10'));
    expect(a.unknownAxes.Z).toBe('Code G5 (ligne 3) non interprété.');
    expect(a.unknownCodes.Z).toEqual({ code: 'ETOUCH_CHECK_UNINTERPRETED', params: { code: 'G5', line: 3 }, message: a.unknownAxes.Z });
    expect(analyzeProgram(SQUARE).unknownCodes).toEqual({ X: null, Y: null, Z: null });
  });

  test('an analysis made without coded reasons keeps its French reason, uncoded (shown as sent)', () => {
    const a = analyzeProgram(P('G21 G90', 'G0 X1', 'G5 X2'));
    delete a.unknownCodes;
    const r = checkProgram(a, machine());
    expect(r.verdict).toBe('unknown');
    expect(r.codedReasons).toEqual([{ code: null, params: {}, message: 'Code G5 (ligne 3) non interprété.' }]);
    expect(r.reasons).toEqual(['Code G5 (ligne 3) non interprété.']);
  });
});
