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
import { buildResume, programLines } from '../resume';

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
