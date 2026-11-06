/* eslint-env jest */
// Chasse aux bugs, angle E, défaut E-3 : la reprise à une ligne préfixe la
// première ligne envoyée avec le mode de déplacement modal (resume.js:276-287,
// firstLineOf) dès que la ligne porte un mot d'axe sans G0-G3. Pour une ligne
// G28/G30/G10/G92/G43.1 (commande non modale à mots d'axe) ou G38.x (groupe
// modal 1), Grbl 1.1 refuse alors la ligne : gcode.c, « Check for G0/1/2/3/38
// being called with G10/28/30/92 on same block » → error:24
// (STATUS_GCODE_AXIS_COMMAND_CONFLICT), et deux G du groupe 1 → error:21.
// Le préambule a déjà déplacé la machine (Z de dégagement, XY, broche, plongée)
// quand CNCjs met le travail en pause sur l'erreur. Cas réel : reprendre au
// « G28 G91 Z0 » qui ouvre un bloc de changement d'outil (post Fusion 360).
// Ces tests ÉCHOUENT sur cbde7cee : c'est la preuve.
// Correction retenue : la ligne est envoyée telle quelle (ses mots d'axe sont
// ceux de G10/G28/G30/G92/G43.1/G38.x, pas d'un déplacement modal) plutôt que
// de refuser la reprise (ETOUCH_RESUME_FIRST_LINE envisagé dans FINDINGS.md) :
// la ligne est du Grbl complet, exécutée depuis la position que le préambule
// a rejointe, exactement comme dans le programme ; le cas réel (reprise au
// bloc de changement d'outil d'un post Fusion 360) reste possible.
import { buildResume, programLines, stateBefore } from '../resume';
import { expectCatalogMatch } from './touch-codes-catalog';

const sentFirst = (r) => r.program.split('\n')[r.preamble.length];

describe('E-3 : première ligne de la reprise, commandes non modales à mots d’axe', () => {
  test('post Fusion 360 : reprise au G28 G91 Z0 du changement d’outil → la ligne envoyée doit rester « G28 G91 Z0 » (sinon error:24)', () => {
    const prog = [
      'G90 G94 G17', 'G21', 'G28 G91 Z0', 'G90',
      '(2D Contour1)', 'T1 M6', 'S12000 M3', 'G54', 'M8',
      'G0 X10 Y10', 'G0 Z15', 'G1 Z-1 F300', 'G1 X20', 'G1 Y20',
      'G0 Z15', 'M5', 'M9',
      'G28 G91 Z0', 'G90',
      '(2D Contour2)', 'T2 M6', 'S10000 M3', 'G54', 'M8',
      'G0 X30 Y30', 'G0 Z15', 'G1 Z-2 F250', 'G1 X40',
      'G0 Z15', 'M5', 'M9', 'G28 G91 Z0', 'G90', 'M30'
    ].join('\n');
    const lines = programLines(prog);
    const from = lines.indexOf('G28 G91 Z0', 5) + 1; // le second G28, après les déplacements
    const r = buildResume(prog, from);
    expect(sentFirst(r)).toBe('G28 G91 Z0');
  });

  test.each([
    ['G10 L20 P1 X0', 'G10 : error:24'],
    ['G92 X0 Y0', 'G92 : error:24'],
    ['G43.1 Z-5', 'G43.1 : error:24'],
    ['G38.2 Z-10 F50', 'G38.2 : error:21 (deux G du groupe 1)']
  ])('ligne de reprise « %s » (%s) : envoyée telle quelle, sans G0/G1 devant', (line) => {
    const prog = ['G21 G90 G94', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F100', 'G1 X10', 'G0 Z5', line, 'G1 X20', 'M30'].join('\n');
    const r = buildResume(prog, 7);
    expect(sentFirst(r)).toBe(line);
  });
});

// Second round (revue Codex) : envoyée telle quelle, une commande non modale
// laisse le mode de déplacement du préambule (G1) aux lignes suivantes, alors
// que le programme était en G0 : « X20 » après « G10 L20 P1 X0 » devenait une
// coupe. Le mode modal du programme est rétabli sur sa propre ligne avant la
// première ligne ; un arc (G2/G3) ou un mode inconnu refuse la reprise.
describe('E-3 (suite) : les lignes après la première gardent le mode de déplacement du programme', () => {
  const after = (r, n) => r.program.split('\n').slice(r.preamble.length);

  test('G0 avant la ligne : « G0 » seul rétabli devant « G10 L20 P1 X0 », « X20 » reste un rapide', () => {
    const prog = ['G21 G90 G54 G94', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F100', 'G0 Z5', 'G10 L20 P1 X0', 'X20', 'M30'].join('\n');
    const r = buildResume(prog, 6);
    expect(r.preamble.at(-2)).toMatch(/^G1 Z5 F100$/);
    expect(r.preamble.at(-1)).toBe('G0');
    expect(after(r)).toEqual(['G10 L20 P1 X0', 'X20', 'M30', '']);
  });

  test('G1 avant la ligne : « G1 F<avance> » rétabli devant « G92 X0 Y0 », « X20 » reste une coupe à l’avance du programme', () => {
    const prog = ['G21 G90 G94', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F100', 'G1 X10 F250', 'G92 X0 Y0', 'X20', 'M30'].join('\n');
    const r = buildResume(prog, 6);
    expect(r.preamble.at(-1)).toBe('G1 F250');
    expect(after(r)).toEqual(['G92 X0 Y0', 'X20', 'M30', '']);
  });

  test('G2 avant la ligne : reprise refusée (ETOUCH_RESUME_FIRST_LINE), le mode arc ne se rétablit pas sans I/J', () => {
    const prog = ['G21 G90 G17 G94', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F100', 'G2 X10 Y0 I5 J0', 'G92 X0 Y0', 'X20 Y0 I5 J0', 'M30'].join('\n');
    let refusal = null;
    try {
      buildResume(prog, 6);
    } catch (err) {
      refusal = err;
    }
    expect(refusal).toMatchObject({ code: 'ETOUCH_RESUME_FIRST_LINE', params: { motion: 'G2', from: 6 } });
    expect(refusal.message).toMatch(/Mode de déplacement G2 avant la ligne 6/);
    expectCatalogMatch(refusal);
    // Un rapide après l'arc : la reprise redevient possible, « G0 » rétabli.
    expect(buildResume(prog.replace('G92 X0 Y0', 'G0 Z5\nG92 X0 Y0'), 7).preamble.at(-1)).toBe('G0');
  });

  test('G38.2 en première ligne : le palpage fixe lui-même le mode de déplacement, rien à rétablir', () => {
    const prog = ['G21 G90 G94', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F100', 'G0 Z5', 'G38.2 Z-10 F50', 'G0 Z5', 'M30'].join('\n');
    const r = buildResume(prog, 6);
    expect(r.preamble.at(-1)).toMatch(/^G1 Z5 F100$/);
    expect(after(r)).toEqual(['G38.2 Z-10 F50', 'G0 Z5', 'M30', '']);
  });

  // Troisième tour (revue Codex) : la règle vaut pour toute première ligne qui
  // ne fixe pas le mode de déplacement (G4, G28 sans axe, commentaire, code M),
  // pas seulement pour une commande non modale à mots d'axe ; « G4 P1 » ne
  // contourne plus le refus en mode arc.
  const G0_PROGRAM = (line) => ['G21 G90 G94', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F100', 'G0 Z5', line, 'X20', 'M30'].join('\n');
  const G1_PROGRAM = (line) => ['G21 G90 G94', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F100', 'G1 X10 F250', line, 'X20', 'M30'].join('\n');

  test.each([['G4 P1'], ['G28'], ['(changement de passe)'], ['M8'], ['M3 S9000']])('programme en G0, première ligne « %s » : « G0 » rétabli, « X20 » reste un rapide', (line) => {
    const r = buildResume(G0_PROGRAM(line), 6);
    expect(r.preamble.at(-2)).toMatch(/^G1 Z5 F100$/);
    expect(r.preamble.at(-1)).toBe('G0');
    expect(after(r)).toEqual([line, 'X20', 'M30', '']);
  });

  test.each([['G4 P1'], ['G28'], ['(changement de passe)'], ['M8']])('programme en G1, première ligne « %s » : « G1 F250 » rétabli, « X20 » reste une coupe', (line) => {
    const r = buildResume(G1_PROGRAM(line), 6);
    expect(r.preamble.at(-1)).toBe('G1 F250');
    expect(after(r)).toEqual([line, 'X20', 'M30', '']);
  });

  test('programme en G2, première ligne « G4 P1 » : reprise refusée (ETOUCH_RESUME_FIRST_LINE), plus de contournement', () => {
    const prog = ['G21 G90 G17 G94', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F100', 'G2 X10 Y0 I5 J0', 'G4 P1', 'X20 Y0 I5 J0', 'M30'].join('\n');
    let refusal = null;
    try {
      buildResume(prog, 6);
    } catch (err) {
      refusal = err;
    }
    expect(refusal).toMatchObject({ code: 'ETOUCH_RESUME_FIRST_LINE', params: { motion: 'G2', from: 6 } });
    expectCatalogMatch(refusal);
  });

  test('une ligne qui fixe son mode (G0 X…, G1 Y…, G38.2) ou un mot d’axe seul préfixé : rien d’autre n’est ajouté', () => {
    expect(buildResume(G0_PROGRAM('G1 X5 F200'), 6).preamble.at(-1)).toMatch(/^G1 Z5 F100$/);
    expect(buildResume(G0_PROGRAM('G0 X5'), 6).preamble.at(-1)).toMatch(/^G1 Z5 F100$/);
    const plain = buildResume(G0_PROGRAM('Y5'), 6);
    expect(plain.preamble.at(-1)).toMatch(/^G1 Z5 F100$/);
    expect(after(plain)[0]).toBe('G0 Y5');
  });
});

// Quatrième tour (revue Codex) : cas de resume.js refusés plutôt que modélisés.
describe('E-3 (4e tour) : G49 avec axe, palpage modal, expressions en ligne de reprise, plan non fixé', () => {
  const P = ['G21 G90 G54 G94', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F100', 'G0 Z5'];
  const refusalOf = (fn) => {
    try {
      fn();
    } catch (err) {
      return err;
    }
    return null;
  };

  test('G49 Z-100 (mot d’axe avec G49) : refusé avant la ligne de reprise et comme ligne de reprise (ETOUCH_RESUME_G49_AXIS)', () => {
    const prog = P.concat(['G49 Z-100', 'G4 P1', 'X20']).join('\n');
    const before = refusalOf(() => buildResume(prog, 7));
    expect(before).toMatchObject({ code: 'ETOUCH_RESUME_G49_AXIS', params: { line: 6 } });
    expectCatalogMatch(before);
    const first = refusalOf(() => buildResume(prog, 6));
    expect(first).toMatchObject({ code: 'ETOUCH_RESUME_G49_AXIS', params: { line: 6 } });
    // G49 seul reste accepté (annulation du décalage, aucun mot d'axe).
    expect(buildResume(prog.replace('G49 Z-100', 'G49'), 7).preamble.at(-1)).toBe('G0');
  });

  test('G38.3 reste le mode modal : « X20 » après lui est un palpage, la position est inconnue, reprise refusée (ETOUCH_RESUME_POSITION)', () => {
    const prog = P.slice(0, 4).concat(['G38.3 X10 F50', 'X20', 'G4 P1', 'X30']).join('\n');
    const s = stateBefore(programLines(prog), 7);
    expect(s.motion).toBe('G38.3');
    expect(s.pos.X).toBeNull();
    expect(refusalOf(() => buildResume(prog, 7))).toMatchObject({ code: 'ETOUCH_RESUME_POSITION', params: { from: 7 } });
    expect(refusalOf(() => buildResume(prog, 6))).toMatchObject({ code: 'ETOUCH_RESUME_POSITION', params: { from: 6 } });
    // Une position redonnée en absolu après le palpage (G0 fixe aussi le mode) : reprise possible, « G0 » rétabli.
    const again = P.slice(0, 4).concat(['G38.3 X10 F50', 'G0 Z5', 'G0 X5 Y5', 'G4 P1', 'X30']).join('\n');
    const r = buildResume(again, 8);
    expect(r.position).toEqual({ X: 5, Y: 5, Z: 5 });
    expect(r.preamble.at(-1)).toBe('G0');
  });

  test.each([['G[0] X20'], ['G[10] L20 P1 X0'], ['X[4*2] Y[3]']])('ligne de reprise « %s » : expression CNCjs, refusée (6e tour : ETOUCH_RESUME_UNSUPPORTED_SYNTAX)', (line) => {
    const prog = P.concat([line, 'X20', 'M30']).join('\n');
    const err = refusalOf(() => buildResume(prog, 6));
    expect(err).toMatchObject({ code: 'ETOUCH_RESUME_UNSUPPORTED_SYNTAX', params: { line: 6 } });
    expectCatalogMatch(err);
  });

  test('ligne de reprise « %wait » : directive CNCjs, refusée (ETOUCH_RESUME_FIRST_EXPRESSION)', () => {
    const prog = P.concat(['%wait', 'X20', 'M30']).join('\n');
    const err = refusalOf(() => buildResume(prog, 6));
    expect(err).toMatchObject({ code: 'ETOUCH_RESUME_FIRST_EXPRESSION', params: { from: 6 } });
    expectCatalogMatch(err);
  });

  test('plan non fixé (pas de G17/G18/G19) et arc à partir de la ligne de reprise : refusé (ETOUCH_RESUME_PLANE), jamais de G17 supposé', () => {
    const prog = P.concat(['G1 X10', 'G2 X20 Y0 I5 J0', 'G1 X30', 'M30']).join('\n');
    const err = refusalOf(() => buildResume(prog, 6));
    expect(err).toMatchObject({ code: 'ETOUCH_RESUME_PLANE', params: { from: 6, line: 7 } });
    expectCatalogMatch(err);
    // Plan déclaré par le programme avant la reprise : préambule en G18, reprise acceptée.
    const g18 = buildResume(prog.replace('G21 G90 G54 G94', 'G21 G90 G54 G94 G18'), 6);
    expect(g18.preamble[1]).toBe('G21 G90 G18 G54 G94');
    // Plan déclaré plus loin, avant le premier arc : affaire du programme, reprise acceptée.
    expect(buildResume(prog.replace('G2 X20', 'G17\nG2 X20'), 6).preamble[1]).toBe('G21 G90 G54 G94');
    // Sans arc : rien n'est supposé, le préambule ne nomme aucun plan.
    expect(buildResume(prog.replace('G2 X20 Y0 I5 J0', 'G1 X20'), 6).preamble[1]).toBe('G21 G90 G54 G94');
  });
});

// Cinquième tour (revue Codex) : lecture structurellement conforme à Grbl
// (espaces retirés, texte des expressions ignoré), mode modal suivi pour les
// arcs, refus de ce qui ne peut pas être connu (G43.1, mode de distance).
describe('E-3 (5e tour) : lecture comme Grbl, expressions, arcs modaux, G43.1, G90/G91', () => {
  const P = ['G21 G90 G54 G94', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F100', 'G0 Z5'];
  const refusalOf = (fn) => {
    try {
      fn();
    } catch (err) {
      return err;
    }
    return null;
  };

  test('« G4 9 Z-100 » est G49 Z-100 pour Grbl : refusé à la ligne 7 comme à la ligne 6', () => {
    const prog = P.concat(['G4 9 Z-100', 'G4 P1', 'X20']).join('\n');
    expect(refusalOf(() => buildResume(prog, 7))).toMatchObject({ code: 'ETOUCH_RESUME_G49_AXIS', params: { line: 6 } });
    expect(refusalOf(() => buildResume(prog, 6))).toMatchObject({ code: 'ETOUCH_RESUME_G49_AXIS', params: { line: 6 } });
  });

  test('« G9 2 X100 » est G92 X100 : changement d’origine refusé avant la ligne 7 ; « G0 X1 0 » est X10', () => {
    const g92 = P.concat(['G9 2 X100', 'G4 P1', 'X20']).join('\n');
    expect(refusalOf(() => buildResume(g92, 7))).toMatchObject({ code: 'ETOUCH_RESUME_ORIGIN_CHANGED', params: { line: 6, from: 7 } });
    const x10 = P.concat(['G0 X1 0', 'G4 P1', 'X20']).join('\n');
    const r = buildResume(x10, 7);
    expect(r.position).toEqual({ X: 10, Y: 0, Z: 5 });
    expect(r.preamble).toContain('G0 X10 Y0');
    // Ligne de reprise elle-même espacée : lue de même (G 1 X1 5 → G1 X15, préfixe inutile).
    expect(buildResume(P.concat(['G 1 X1 5', 'X20']).join('\n'), 6).preamble.at(-1)).toMatch(/^G1 Z5 F100$/);
  });

  // 6e tour : plus de neutralisation du texte des expressions, toute expression
  // CNCjs est refusée où qu'elle soit (voir « E-3 (6e tour) »).
  test('une expression CNCjs après la ligne de reprise est refusée (ETOUCH_RESUME_UNSUPPORTED_SYNTAX), même sans arc', () => {
    const after = P.concat(['G1 X10', 'X[\'G2\'.length]', 'M30']).join('\n');
    expect(refusalOf(() => buildResume(after, 6))).toMatchObject({ code: 'ETOUCH_RESUME_UNSUPPORTED_SYNTAX', params: { line: 7 } });
  });

  test('mode modal suivi après la reprise : « X20 I5 » après « G2 X10 I5 » est un arc, refusé sans plan choisi', () => {
    const prog = P.concat(['G2 X10 I5', 'X20 I5', 'M30']).join('\n');
    expect(refusalOf(() => buildResume(prog, 7))).toMatchObject({ code: 'ETOUCH_RESUME_PLANE', params: { from: 7, line: 7 } });
    // Avec le plan choisi, la ligne d'arc modale reçoit son G2 (comportement existant).
    const g17 = buildResume(prog.replace('G21 G90 G54 G94', 'G21 G90 G54 G94 G17'), 7);
    expect(g17.program.split('\n')[g17.preamble.length]).toBe('G2 X20 I5');
    // Un « G2 » seul après la reprise fixe le mode : la ligne d'axe suivante est un arc, refusée ;
    // G80 annule le mode entre les deux : plus d'arc, reprise acceptée.
    expect(refusalOf(() => buildResume(P.concat(['G1 X10', 'G2', 'X20 I5', 'M30']).join('\n'), 6))).toMatchObject({ code: 'ETOUCH_RESUME_PLANE', params: { from: 6, line: 8 } });
    expect(buildResume(P.concat(['G1 X10', 'G2', 'G80', 'X20', 'M30']).join('\n'), 6).preamble.at(-1)).toMatch(/^G1 Z5 F100$/);
  });

  test('G43.1 avant la ligne de reprise, même annulé par G49 : refusé (ETOUCH_RESUME_TOOL_OFFSET)', () => {
    const prog = P.concat(['G43.1 Z10', 'G1 Z-1', 'G49', 'G4 P1', 'X20']).join('\n');
    const err = refusalOf(() => buildResume(prog, 9));
    expect(err).toMatchObject({ code: 'ETOUCH_RESUME_TOOL_OFFSET', params: { line: 6, from: 9 } });
    expectCatalogMatch(err);
  });

  test('ni G90 ni G91 avant le premier déplacement : refusé (ETOUCH_RESUME_DISTANCE), la carte a pu rester en G91', () => {
    const prog = ['G21 G94 G54', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F100', 'G0 Z5', 'G1 X10', 'M30'].join('\n');
    const err = refusalOf(() => buildResume(prog, 6));
    expect(err).toMatchObject({ code: 'ETOUCH_RESUME_DISTANCE', params: { line: 2, from: 6 } });
    expectCatalogMatch(err);
    expect(buildResume(prog.replace('G21 G94 G54', 'G21 G90 G94 G54'), 6).preamble[1]).toBe('G21 G90 G54 G94');
  });
});

// Sixième tour (revue Codex) : la reprise n'accepte que ce qu'elle certifie.
describe('E-3 (6e tour) : syntaxe CNCjs, modes G94/G90, G49, S, M2/M30, précision F, arrosage', () => {
  const P = ['G21 G90 G94 G54', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F100', 'G0 Z5'];
  const refusalOf = (fn) => {
    try {
      fn();
    } catch (err) {
      return err;
    }
    return null;
  };

  test.each([
    ['[\'G2\'] X10 I5', 'avant'], ['X[\'G17\'.length+\'[\'.length]', 'avant'], ['G0 X1/0', 'avant'], ['G4/9 Z-100', 'avant'], ['X[\'G2\'.length+\'[\'.length]', 'avant']
  ])('« %s » n’importe où dans le fichier : refusé (ETOUCH_RESUME_UNSUPPORTED_SYNTAX)', (line) => {
    const before = P.concat([line, 'G1 X10', 'G1 X20', 'M30']).join('\n');
    expect(refusalOf(() => buildResume(before, 8))).toMatchObject({ code: 'ETOUCH_RESUME_UNSUPPORTED_SYNTAX', params: { line: 6 } });
    const at = P.concat(['G1 X10', line, 'G1 X20', 'M30']).join('\n');
    expect(refusalOf(() => buildResume(at, 7))).toMatchObject({ code: 'ETOUCH_RESUME_UNSUPPORTED_SYNTAX', params: { line: 7 } });
    const after = P.concat(['G1 X10', 'G1 X20', line, 'M30']).join('\n');
    const err = refusalOf(() => buildResume(after, 6));
    expect(err).toMatchObject({ code: 'ETOUCH_RESUME_UNSUPPORTED_SYNTAX', params: { line: 8 } });
    expectCatalogMatch(err);
    // Un « / » dans un commentaire n'est pas du code.
    expect(buildResume(P.concat(['(1/2)', 'G1 X10', 'M30']).join('\n'), 7).preamble[1]).toBe('G21 G90 G54 G94');
  });

  test('ni G93 ni G94 avant la ligne : reprise acceptée, la machine garde son mode et le plan le dit (comme les unités)', () => {
    const prog = ['G21 G90 G54', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F100', 'G0 Z5', 'G1 X10', 'M30'].join('
');
    const r = buildResume(prog, 6);
    expect(r.preamble[1]).toBe('G21 G90 G54');
    expect(r.notes).toContain('Le programme ne fixe pas son mode d’avance (G94) : la machine garde le sien.');
    // G94 déclaré avant la ligne : rétabli, pas de note.
    const declared = buildResume(prog.replace('G0 X0 Y0', 'G94 G0 X0 Y0'), 6);
    expect(declared.preamble[1]).toBe('G21 G90 G54 G94');
    expect(declared.notes).not.toContain('Le programme ne fixe pas son mode d’avance (G94) : la machine garde le sien.');
    // Reprise laser : même règle.
    const laser = ['G21 G90', 'M3 S500', 'G0 X0 Y0', 'G1 X10 F1000', 'M5', 'G0 X5 Y5', 'G1 X15 F1000', 'M30'].join('
');
    expect(buildResume(laser, 6, { mode: 'laser' }).mode).toBe('laser');
    // Un G93 du fichier lui-même reste refusé.
    expect(refusalOf(() => buildResume(prog.replace('G0 Z5', 'G93 G0 Z5'), 6))).toMatchObject({ code: 'ETOUCH_RESUME_INVERSE_TIME' });
  });

  test('G90 déclaré après un premier déplacement : refusé (ETOUCH_RESUME_DISTANCE, ligne du déplacement)', () => {
    const prog = ['G21 G94 G54', 'G0 Z5', 'G90', 'G0 X0 Y0', 'G1 Z-1 F100', 'G0 Z5', 'G1 X10', 'M30'].join('\n');
    const err = refusalOf(() => buildResume(prog, 7));
    expect(err).toMatchObject({ code: 'ETOUCH_RESUME_DISTANCE', params: { line: 2, from: 7 } });
    expectCatalogMatch(err);
  });

  test('G49 avant la ligne : le préambule le répète juste après la ligne des modes (un G43.1 hérité resterait actif)', () => {
    const prog = P.concat(['G49', 'G4 P1', 'X20', 'M30']).join('\n');
    const r = buildResume(prog, 7);
    expect(r.preamble.slice(1, 3)).toEqual(['G21 G90 G54 G94', 'G49']);
    expect(buildResume(P.concat(['G4 P1', 'X20', 'M30']).join('\n'), 6).preamble).not.toContain('G49');
  });

  test('S connu et broche arrêtée à la ligne : le préambule émet S12000, le M3 repris démarre à cette vitesse', () => {
    const prog = ['G21 G90 G94', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F100', 'M3 S12000', 'M5', 'M3', 'G1 X10', 'M30'].join('\n');
    const r = buildResume(prog, 7);
    expect(r.preamble).toContain('S12000');
    expect(r.preamble).not.toContain('M3 S12000');
    expect(r.spindle).toBeNull();
    expect(r.program.split('\n')[r.preamble.length]).toBe('M3');
  });

  test.each([['M30'], ['M2']])('%s avant la ligne de reprise : refusé (ETOUCH_RESUME_PROGRAM_END)', (end) => {
    const prog = P.concat([end, 'G1 X10', 'M30']).join('\n');
    const err = refusalOf(() => buildResume(prog, 7));
    expect(err).toMatchObject({ code: 'ETOUCH_RESUME_PROGRAM_END', params: { line: 6, from: 7 } });
    expectCatalogMatch(err);
  });

  test('avance minuscule : écrite sans jamais tomber à 0 ; trop petite pour être écrite : refusée (ETOUCH_RESUME_FEED_PRECISION)', () => {
    const tiny = P.map((l) => l.replace('F100', 'F0.00001')).concat(['G1 X10', 'M30']).join('\n');
    const r = buildResume(tiny, 6);
    expect(r.preamble.at(-1)).toBe('G1 Z5 F0.00001');
    const absurd = P.map((l) => l.replace('F100', 'F0.00000000001')).concat(['G1 X10', 'M30']).join('\n');
    const err = refusalOf(() => buildResume(absurd, 6));
    expect(err).toMatchObject({ code: 'ETOUCH_RESUME_FEED_PRECISION', params: { from: 6 } });
    expectCatalogMatch(err);
  });

  test('arrosage : M7 et M8 suivis séparément, M9 les efface ; le préambule émet M9 puis les actifs, rien si jamais commandé', () => {
    const both = buildResume(P.concat(['M7', 'M8', 'G4 P1', 'X20', 'M30']).join('\n'), 9);
    expect(both.preamble.filter((l) => /^M[789]$/.test(l))).toEqual(['M9', 'M7', 'M8']);
    expect(both.coolant).toBe('M7 M8');
    const off = buildResume(P.concat(['M8', 'M9', 'G4 P1', 'X20', 'M30']).join('\n'), 8);
    expect(off.preamble.filter((l) => /^M[789]$/.test(l))).toEqual(['M9']);
    expect(off.coolant).toBeNull();
    const never = buildResume(P.concat(['G4 P1', 'X20', 'M30']).join('\n'), 6);
    expect(never.preamble.filter((l) => /^M[789]$/.test(l))).toEqual([]);
    expect(never.coolant).toBeNull();
    const mist = buildResume(P.concat(['M8', 'M9', 'M7', 'G4 P1', 'X20', 'M30']).join('\n'), 9);
    expect(mist.preamble.filter((l) => /^M[789]$/.test(l))).toEqual(['M9', 'M7']);
  });
});

describe('E-3 (suite, laser)', () => {
  test('reprise laser : une telle ligne n’est pas un G0 X/Y, refus inchangé (ETOUCH_LASER_RESUME_NOT_RAPID)', () => {
    const prog = ['G21 G90 G94', 'M3 S500', 'G0 X0 Y0', 'G1 X10 F1000', 'M5', 'G0 X5 Y5', 'G92 X0 Y0', 'G1 X15 F1000', 'M30'].join('\n');
    let refusal = null;
    try {
      buildResume(prog, 7, { mode: 'laser' });
    } catch (err) {
      refusal = err;
    }
    expect(refusal && refusal.code).toBe('ETOUCH_LASER_RESUME_NOT_RAPID');
    // Le G0 X/Y précédent (limite de passe, laser éteint) reste une reprise laser valide.
    expect(buildResume(prog, 6, { mode: 'laser' }).mode).toBe('laser');
  });
});
