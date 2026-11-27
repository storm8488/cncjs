// Axis A, lot L0: what the program analysers say of every program of the shared corpus
// (examples/cncjs-touch/gcode-corpus), reduced to one digest per file. The same function wrote
// axis-a-l0-baseline.json on the code before lot L0 (commit e574a298) and is compared with it by
// axis-a-l0.test.js: a file without A, B or C words is analysed exactly as before.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { analyzeProgram, checkProgram } from '../../program-check';
import { buildResume, programLines } from '../../resume';

export const CORPUS = path.join(__dirname, '../../../../../../examples/cncjs-touch/gcode-corpus');

const MACHINES = [
  { settings: { $20: '1', $22: '1', $23: '0', $130: '300', $131: '200', $132: '80' }, mpos: { x: -250, y: -150, z: -40 }, wpos: { x: 0, y: 0, z: 0 }, modal: { units: 'G21', distance: 'G90', wcs: 'G54' }, parameters: null, homed: true, reportUnits: 'mm' },
  { settings: { $20: '0', $22: '1', $23: '3', $130: '400', $131: '400', $132: '130' }, mpos: { x: 5, y: 5, z: -5 }, wpos: { x: 0, y: 0, z: 0 }, modal: { units: 'G21', distance: 'G90', wcs: 'G54' }, parameters: null, homed: true, reportUnits: 'mm' },
  {}
];
const TIMING = { settings: { $110: 4000, $111: 4000, $112: 800 }, wpos: { x: 0, y: 0, z: 0 }, reportUnits: 'mm', offsetProven: true, wcs: 'G54', feedMode: 'G94', tlo: 0, overrides: { feed: 100, rapid: 100 } };

export const corpusFiles = () => fs.readdirSync(CORPUS).filter((name) => name.endsWith('.nc')).sort();

// Everything the analysers return for one program text: the analysis, the check on three
// machines, and for every line a resume could start from, its program or its refusal.
export const outcomeOf = (text) => {
  const analysis = analyzeProgram(text, TIMING);
  const resumes = programLines(text).map((line, i) => {
    try {
      return buildResume(text, i + 1, { name: 'p.nc' });
    } catch (err) {
      return { refused: err.code || err.message, params: err.params || null };
    }
  });
  return { analysis, checks: MACHINES.map((machine) => checkProgram(analysis, machine)), resumes };
};

export const digestOf = (text) => crypto.createHash('sha256').update(JSON.stringify(outcomeOf(text))).digest('hex');

// Programs the shared corpus lacks, none with a rotary word: CNCjs directives and assignments
// (`%`), expressions, `$J=` on X, Y, Z, board commands, block delete. Same baseline, same proof.
export const EXTRA = {
  'extra-percent.nc': ['G21 G90 G94', '%wait', '%A1=5', '%msg turn to A90', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F100', 'G1 X10 F300', 'G1 X20', 'G0 Z5', 'M2'],
  'extra-expression.nc': ['G21 G90 G94', 'G0 Z5', 'G0 X[1+1] Y0', 'G1 Z-1 F[100]', 'G1 X#1', 'G1 X5 F300', 'G0 Z5', 'M2'],
  'extra-jog-xyz.nc': ['G21 G90 G94', 'G0 Z5', 'G0 X0 Y0', '$J=G91 X5 F100', '$j = g91 y 5 f100', 'G1 Z-1 F100', 'G1 X10 F300', 'G1 X20', 'G0 Z5', 'M2'],
  'extra-board-commands.nc': ['$H', 'G21 G90 G94', 'G0 Z5', 'G0 X0 Y0', '$X', '$103=26.667', 'G1 Z-1 F100', 'G1 X10 F300', 'G0 Z5', 'M2'],
  'extra-block-delete.nc': ['G21 G90 G94', 'G0 Z5', '/G0 X50', 'G0 X0 Y0', 'G1 Z-1 F100', 'G1 X10 F300', 'G0 Z5', 'M2']
};

export const corpusDigests = () => {
  const out = {};
  corpusFiles().forEach((name) => {
    out[name] = digestOf(fs.readFileSync(path.join(CORPUS, name), 'utf8'));
  });
  Object.keys(EXTRA).forEach((name) => {
    out[name] = digestOf(EXTRA[name].join('\n') + '\n');
  });
  return out;
};
