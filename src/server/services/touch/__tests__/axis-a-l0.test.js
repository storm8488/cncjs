/* eslint-env jest */
// Axis A, lot L0 (examples/cncjs-touch/design/axe-a/AXE-A-CONCEPTION.md): a program that commands
// a rotary axis (A, B or C) is told apart, the X, Y, Z check keeps every verdict and refusal it
// had, and such a program is not resumed from a line. Real functions only.
import fs from 'fs';
import path from 'path';
import { analyzeProgram, checkProgram, programCheck, rotaryLetters, codeOf } from '../program-check';
import { buildResume } from '../resume';
import { CORPUS, EXTRA, corpusFiles, corpusDigests, outcomeOf } from './support/axis-a-l0-digest';
import { expectCatalogMatch } from './touch-codes-catalog';

const baseline = require('./support/axis-a-l0-baseline.json');

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
const warning = (check) => check.info.filter((entry) => entry && entry.code === 'ETOUCH_ROTARY_UNCHECKED');
// The check without what lot L0 adds: what a program had before.
const xyzOnly = (check) => {
  const rest = { ...check, info: check.info.filter((entry) => !entry || entry.code !== 'ETOUCH_ROTARY_UNCHECKED') };
  delete rest.rotary;
  return rest;
};
const INSIDE = 'G21 G90 G54\nG0 Z5\nG0 X0 Y0\nM3 S1000\nG1 Z-1 F100\nG1 X10 F300\nG0 Z5\nM5\nM2\n';

describe('lot L0: the rotary warning stays apart from the X, Y, Z check', () => {
  test.each(['0', '1'])('G0 X500 A90 stays outside, with the same refusals as G0 X500 ($20=%s)', ($20) => {
    const m = machine({ settings: { $20 } });
    const plain = programCheck('G21 G90 G54\nG0 X500\n', m);
    const turning = programCheck('G21 G90 G54\nG0 X500 A90\n', m);
    expect(plain.verdict).toBe('outside');
    expect(plain.blocking.length).toBeGreaterThan(0);
    expect(turning.verdict).toBe('outside');
    expect(turning.blocking).toEqual(plain.blocking);
    expect(turning.axes).toEqual(plain.axes);
    expect(turning.overridable).toBe(plain.overridable);
    expect(xyzOnly(turning)).toEqual(plain);
    expect(warning(turning)).toHaveLength(1);
    expect(warning(plain)).toHaveLength(0);
    expect('rotary' in plain).toBe(false);
  });

  test('X, Y, Z and A inside the travel: the verdict of X, Y, Z alone, plus the warning', () => {
    const plain = programCheck(INSIDE, machine());
    const turning = programCheck(INSIDE.replace('G0 X0 Y0', 'G0 X0 Y0 A0').replace('G1 X10 F300', 'G1 X10 A90 F300\nG1 A360'), machine());
    expect(plain.verdict).toBe('validated');
    expect(turning.verdict).toBe('validated');
    expect(turning.axes).toEqual(plain.axes);
    expect(turning.blocking).toEqual([]);
    expect(turning.reasons).toEqual(plain.reasons);
    expect(turning.rotary).toEqual({ letters: 'A', line: 3, count: 3 });
    expect(warning(turning)[0].params).toEqual({ axis: 'A', line: 3, count: 3 });
    expect(warning(turning)[0].message).toContain('CNC Touch ne le contrôle pas encore');
  });

  test('an unknown X, Y, Z verdict keeps its reasons when an A word is added', () => {
    const m = machine({ homed: false });
    const plain = programCheck(INSIDE, m);
    const turning = programCheck(INSIDE.replace('G1 X10 F300', 'G1 X10 F300\nG0 A90'), m);
    expect(plain.verdict).toBe('unknown');
    expect(turning.verdict).toBe('unknown');
    expect(turning.codedReasons).toEqual(plain.codedReasons);
    expect(turning.axes).toEqual(plain.axes);
    expect(warning(turning)).toHaveLength(1);
  });

  test.each([
    ['A alone', 'G21 G90\nG0 A90\nG1 A720 F500\nM2\n', { letters: 'A', line: 2, count: 2 }, 'A'],
    ['B', 'G21 G90\nG0 X1\nG0 B45\n', { letters: 'B', line: 3, count: 1 }, 'B'],
    ['C', 'G21 G90\nG1 X1 C-10 F100\n', { letters: 'C', line: 2, count: 1 }, 'C'],
    ['A then B', 'G21 G90\nG0 B5\nG0 A1\nG0 X1 A2 B3\n', { letters: 'AB', line: 2, count: 3 }, 'A, B'],
    ['lower case, no space', 'g21 g90\ng0x1a90\n', { letters: 'A', line: 2, count: 1 }, 'A'],
    ['spaces inside the word, as the board reads it', 'G21 G90\nG0 A 9 0\n', { letters: 'A', line: 2, count: 1 }, 'A'],
    ['inverse time feed', 'G21 G90 G93\nG1 X10 A90 F2\n', { letters: 'A', line: 2, count: 1 }, 'A'],
    ['G10 with A', 'G21 G90\nG10 L20 P1 A0\nG0 X1\n', { letters: 'A', line: 2, count: 1 }, 'A'],
    // After the code reviews: a jog line is a move, and an expression does not hide the word.
    ['a jog line, absolute', 'G21 G90\nG0 X1\n$J=G90 A90 F100\n', { letters: 'A', line: 3, count: 1 }, 'A'],
    ['a jog line, relative', 'G21 G90\n$J=G91 G21 B-5 F100\n', { letters: 'B', line: 2, count: 1 }, 'B'],
    ['a jog line, lower case and spaces', 'G21 G90\n$j = g91 a 10 f100\n', { letters: 'A', line: 2, count: 1 }, 'A'],
    ['an expression on X next to an A word', 'G21 G90\nG0 X[1+1] A90\n', { letters: 'A', line: 2, count: 1 }, 'A'],
    ['an expression on F after an A word', 'G21 G90\nG0 A90 F[100]\n', { letters: 'A', line: 2, count: 1 }, 'A'],
    ['an expression as the A value', 'G21 G90\nG0 A[1+2]\n', { letters: 'A', line: 2, count: 1 }, 'A'],
    ['a variable as the A value', 'G21 G90\nG0 X1 C#1\n', { letters: 'C', line: 2, count: 1 }, 'C']
  ])('%s is told, first line and letters', (name, text, rotary, axis) => {
    const check = programCheck(text, machine());
    expect(check.rotary).toEqual(rotary);
    expect(warning(check)).toHaveLength(1);
    expect(warning(check)[0].params.axis).toBe(axis);
    expect(warning(check)[0].params.line).toBe(rotary.line);
  });

  test.each([
    ['a comment in parentheses', 'G21 G90\nG0 X1 (A90 then B2)\n'],
    ['a comment after a semicolon', 'G21 G90\nG0 X1 ; A90\n'],
    ['nested comments', 'G21 G90\n(outer (A12) C3)\nG0 X1\n'],
    ['a message comment', 'G21 G90\n(MSG, turn the part to A90)\nG0 X1\n'],
    ['a dwell, a spindle speed, a tool change', 'G21 G90\nG4 P2\nM3 S1000\nT1 M6\nG0 X1\n'],
    ['board commands that move no rotary axis', 'G21 G90\n$J=G91 X10 F100\n$103=26.667\n$H\n$X\n$A\n'],
    ['CNCjs directives and assignments', 'G21 G90\n%wait\n%A1=5\n%msg turn to A90\n%B2 = [posa + 1]\nG0 X1\n'],
    ['a letter inside an expression', 'G21 G90\nG0 X[a1 + 2] Y#<b2>\n'],
    ['letters without a number', 'G21 G90\nG0 X1\nM30\n%\n'],
    ['arc words', 'G21 G90 G17\nG0 X0 Y0\nG2 X10 Y0 I5 J0 F100\nG3 X0 Y0 R5\n']
  ])('%s is not a rotary word: nothing is added', (name, text) => {
    const analysis = analyzeProgram(text);
    const check = checkProgram(analysis, machine());
    expect('rotary' in analysis).toBe(false);
    expect('rotary' in check).toBe(false);
    expect(warning(check)).toHaveLength(0);
  });

  test('rotaryLetters reads one line without its comments', () => {
    expect(rotaryLetters(codeOf('G1 X1 A2 (B3)'))).toBe('A');
    expect(rotaryLetters(codeOf('g0 c1 b2 a3'))).toBe('ABC');
    expect(rotaryLetters(codeOf('$J=G91 A10 F100'))).toBe('A');
    expect(rotaryLetters(codeOf('$j = g91 a 10 f100'))).toBe('A');
    expect(rotaryLetters(codeOf('$J=G91 X10 F100'))).toBe('');
    expect(rotaryLetters(codeOf('$103=26.667'))).toBe('');
    expect(rotaryLetters(codeOf('%A1=5'))).toBe('');
    expect(rotaryLetters(codeOf('G0 A[1+2] B#1'))).toBe('AB');
    expect(rotaryLetters(codeOf('G0 X[a1+2]'))).toBe('');
    expect(rotaryLetters(codeOf('G0 X1 Y2 Z3'))).toBe('');
    expect(rotaryLetters(codeOf('A'))).toBe('');
  });
});

describe('lot L0: no resume from a line for a program that turns a rotary axis', () => {
  const plain = ['G21 G90 G94 G17', 'G0 Z5', 'G0 X0 Y0', 'M3 S1000', 'G1 Z-1 F100', 'G1 X10 F300', 'G1 X20', 'G0 Z5', 'M5', 'M2'];
  const refusal = (lines, from) => {
    try {
      buildResume(lines.join('\n') + '\n', from, { name: 'p.nc' });
    } catch (err) {
      return err;
    }
    return null;
  };
  const withWord = (index, word) => plain.map((line, i) => (i === index ? line + ' ' + word : line));

  test('the same program without a rotary word is resumed', () => {
    expect(refusal(plain, 7)).toBe(null);
  });

  test.each([
    ['before the line', 2, 'A0', 3, 'A'],
    ['on the line', 6, 'A90', 7, 'A'],
    ['after the line', 7, 'A180', 8, 'A'],
    ['a B word', 7, 'B1', 8, 'B'],
    ['a C word', 2, 'C1', 3, 'C']
  ])('refused when the word is %s', (name, index, word, line, axis) => {
    const err = refusal(withWord(index, word), 7);
    expect(err).not.toBe(null);
    expect(err.code).toBe('ETOUCH_RESUME_ROTARY');
    expect(err.status).toBe(409);
    expect(err.params).toEqual({ axis, line });
    expect(err.message).toContain('Reprise à une ligne impossible');
  });

  test('an expression keeps the verdict and the reasons the line had, plus the warning', () => {
    const plainCheck = programCheck('G21 G90\nG0 X[1+1]\n', machine());
    const turning = programCheck('G21 G90\nG0 X[1+1] A90\n', machine());
    expect(turning.verdict).toBe(plainCheck.verdict);
    expect(turning.codedReasons).toEqual(plainCheck.codedReasons);
    expect(turning.axes).toEqual(plainCheck.axes);
    expect(turning.overridable).toBe(plainCheck.overridable);
  });

  // A jog line in a program is a move the resume does not replay: before, on and after the line.
  test.each([
    ['before the line, absolute', 3, '$J=G90 A90 F100', 4],
    ['on the line, relative', 6, '$J=G91 A90 F100', 7],
    ['after the line, relative', 8, '$J=G91 A90 F100', 9],
    ['lower case and spaces', 3, '$j = g91 a 10 f100', 4]
  ])('refused for a jog line %s', (name, index, jog, line) => {
    const lines = plain.slice(0, index).concat([jog], plain.slice(index));
    const err = refusal(lines, 7);
    expect(err).not.toBe(null);
    expect([err.code, err.params]).toEqual(['ETOUCH_RESUME_ROTARY', { axis: 'A', line }]);
  });

  test('a CNCjs assignment named A keeps the refusal, or the resume, it had', () => {
    const named = (name) => plain.slice(0, 2).concat(['%' + name + '1=5'], plain.slice(2));
    const a = refusal(named('A'), 7);
    const x = refusal(named('X'), 7);
    expect(a && a.code).toBe(x && x.code);
    expect(a === null || a.code !== 'ETOUCH_RESUME_ROTARY').toBe(true);
  });

  test('a rotary letter in a comment does not refuse the resume', () => {
    expect(refusal(withWord(2, '(A0)'), 7)).toBe(null);
    expect(refusal(withWord(8, '; A90'), 7)).toBe(null);
  });

  test('the page catalog has the French text of both codes, filled with their params', () => {
    expectCatalogMatch(warning(programCheck('G21 G90\nG0 X1 A2\nG0 B3\n', machine()))[0]);
    const err = refusal(withWord(2, 'A0'), 7);
    expectCatalogMatch({ code: err.code, params: err.params, message: err.message });
  });

  test('an invalid line keeps its own refusal', () => {
    expect(refusal(withWord(2, 'A0'), 1).code).toBe('ETOUCH_RESUME_LINE');
  });
});

describe('lot L0: nothing changes for a program without A, B or C', () => {
  const texts = corpusFiles().map((name) => [name, fs.readFileSync(path.join(CORPUS, name), 'utf8')]);

  test('the corpus has no rotary word (else the baseline below would not apply to that file)', () => {
    expect(texts.length).toBeGreaterThan(20);
    Object.keys(EXTRA).forEach((name) => {
      expect([name, EXTRA[name].map((line) => rotaryLetters(codeOf(line))).filter(Boolean)]).toEqual([name, []]);
    });
    texts.forEach(([name, text]) => {
      const lines = text.split('\n').map((line) => rotaryLetters(codeOf(line)));
      expect([name, lines.filter(Boolean)]).toEqual([name, []]);
    });
  });

  test('every corpus program gives the analysis, the checks and the resumes it gave before lot L0', () => {
    expect(corpusDigests()).toEqual(baseline);
  });

  test('with an A word added, every corpus program keeps its X, Y, Z check on three machines', () => {
    texts.forEach(([name, text]) => {
      // The same number of lines on both sides: a comment line, then the A word in its place.
      const before = outcomeOf(text + '\n(turn)\n');
      const after = outcomeOf(text + '\nA1\n');
      expect([name, after.analysis.rotary.letters]).toEqual([name, 'A']);
      after.checks.forEach((check, i) => {
        expect([name, i, xyzOnly(check)]).toEqual([name, i, before.checks[i]]);
        expect(warning(check)).toHaveLength(1);
      });
    });
  });
});
