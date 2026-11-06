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
import { buildResume, programLines } from '../resume';
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
    const prog = ['G21 G90', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F100', 'G1 X10', 'G0 Z5', line, 'G1 X20', 'M30'].join('\n');
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
    const prog = ['G21 G90 G54', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F100', 'G0 Z5', 'G10 L20 P1 X0', 'X20', 'M30'].join('\n');
    const r = buildResume(prog, 6);
    expect(r.preamble.at(-2)).toMatch(/^G1 Z5 F100$/);
    expect(r.preamble.at(-1)).toBe('G0');
    expect(after(r)).toEqual(['G10 L20 P1 X0', 'X20', 'M30', '']);
  });

  test('G1 avant la ligne : « G1 F<avance> » rétabli devant « G92 X0 Y0 », « X20 » reste une coupe à l’avance du programme', () => {
    const prog = ['G21 G90', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F100', 'G1 X10 F250', 'G92 X0 Y0', 'X20', 'M30'].join('\n');
    const r = buildResume(prog, 6);
    expect(r.preamble.at(-1)).toBe('G1 F250');
    expect(after(r)).toEqual(['G92 X0 Y0', 'X20', 'M30', '']);
  });

  test('G2 avant la ligne : reprise refusée (ETOUCH_RESUME_FIRST_LINE), le mode arc ne se rétablit pas sans I/J', () => {
    const prog = ['G21 G90', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F100', 'G2 X10 Y0 I5 J0', 'G92 X0 Y0', 'X20 Y0 I5 J0', 'M30'].join('\n');
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
    const prog = ['G21 G90', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F100', 'G0 Z5', 'G38.2 Z-10 F50', 'G0 Z5', 'M30'].join('\n');
    const r = buildResume(prog, 6);
    expect(r.preamble.at(-1)).toMatch(/^G1 Z5 F100$/);
    expect(after(r)).toEqual(['G38.2 Z-10 F50', 'G0 Z5', 'M30', '']);
  });

  test('reprise laser : une telle ligne n’est pas un G0 X/Y, refus inchangé (ETOUCH_LASER_RESUME_NOT_RAPID)', () => {
    const prog = ['G21 G90', 'M3 S500', 'G0 X0 Y0', 'G1 X10 F1000', 'M5', 'G0 X5 Y5', 'G92 X0 Y0', 'G1 X15 F1000', 'M30'].join('\n');
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
