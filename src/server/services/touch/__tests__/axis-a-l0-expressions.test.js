/* eslint-env jest */
// Axis A, lot L0: the rotary detector against the translator the controller really uses
// (src/server/lib/translate-expression.js, called by GrblController.js before a line is sent).
// For a wide table of lines with expressions: whenever the translated line holds a real A, B or
// C word, the detector tells that letter. No false negative is tolerated; the false positives
// left are listed below, each with its reason.
import translateExpression from '../../../lib/translate-expression';
import { rotaryLetters, codeOf, programCheck } from '../program-check';

// Numbers only: an expression is taken to give a number (see the report for a text value).
const CONTEXT = { posx: 1, posy: 2, posz: 3, posa: 4, xmax: 50, ymax: 60, a1: 7, b2: 8, c3: 9, n: 3, v: -2 };

const lettersIn = (text) => {
  const found = [];
  const re = /([A-Z])[-+]?(?:\d+\.?\d*|\.\d+)/g;
  let m;
  while ((m = re.exec(text))) {
    found.push(m[1]);
  }
  return ['A', 'B', 'C'].filter((letter) => found.includes(letter)).join('');
};

// What the board is sent, as it reads it. `rejected`: a bracket or a `#` is still there, or a
// number has two signs (`A--2`, a sign in front of a negative value): Grbl refuses the whole
// line, no move. There the detector may tell or not; it tells by caution.
const TWO_SIGNS = /[A-Z][-+]{2}/;
const sentOf = (line) => {
  const sent = codeOf(translateExpression(line, CONTEXT)).replace(/\s+/g, '');
  return { sent, rejected: /\[|\]|#/.test(sent) || TWO_SIGNS.test(sent), letters: lettersIn(sent) };
};

const VALUES = ['[1+2]', '[ 1 + 2 ]', '[posx]', '[posx - 8]', '[v]', '[n*2]', '[0-3]', '[posa + 1]', '[a1]', '[xmax/2]'];
const SIGNS = ['', '-', '+', ' - ', ' + ', '- ', ' +'];
const LETTERS = ['A', 'B', 'C', 'a', 'b', 'c'];

const lines = [];
// A rotary letter whose value is an expression, signed or not, spaced or not.
LETTERS.forEach((letter) => SIGNS.forEach((sign) => VALUES.forEach((value) => {
  lines.push('G0 ' + letter + sign + value);
  lines.push('g1 x[posx] ' + letter + sign + value + ' f[n*100]');
  lines.push('$J=G91 ' + letter + sign + value + ' F100');
})));
// A literal rotary word next to an expression elsewhere on the line.
VALUES.forEach((value) => {
  lines.push('G0 X' + value + ' A90');
  lines.push('G0 A90 F' + value);
  lines.push('G1 X' + value + 'B-1.5Y' + value);
  lines.push('g0 y' + value + ' c.5');
  lines.push('G0 X' + value + ' (A90 in a comment)');
  lines.push('G0 X' + value + ' ; A90');
});
// Digits or a dot between the letter and the expression.
['A1[n]', 'A.[n]', 'A-.[n]', 'B0.[n]', 'C-1[n]', 'a 1 [ n ]'].forEach((word) => lines.push('G0 X1 ' + word));
// Letters A, B, C only inside expressions: no rotary word is sent.
['G0 X[a1 + 2]', 'G0 X[a1] Y[b2] Z[c3]', 'G0 X[posa]', 'G1 X[xmax - a1] F[b2 * 100]', 'G0 X-[a1]', 'G0 X[ a1 ] Y1', 'G0 X1 Y[c3 - b2]'].forEach((line) => lines.push(line));
// Variables, nested or broken brackets, unknown names: lines the board refuses.
['G0 A#1', 'G0 A-#1', 'G0 A#<v>', 'G0 X#<a1>', 'G0 X[1+[2]+a1]', 'G0 X[[a1]]', 'G0 X[a1[0]]', 'G0 A[unknown]', 'G0 A-[unknown]',
  'G0 X[unknown] A90', 'G0 X[1+2 A90', 'G0 X1] A90', 'G0 X[!]', 'G0 A[', 'G0 A]'].forEach((line) => lines.push(line));

// False positives accepted, each on a line the board refuses anyway (a bracket or `#` is left):
// the letter stands in front of a value that cannot be read, or outside brackets that do not
// pair; telling it is the cautious side.
const ACCEPTED = {
  'G0 A#1': 'A in front of a variable CNCjs does not translate',
  'G0 A-#1': 'the same, signed',
  'G0 A#<v>': 'the same, named variable',
  'G0 A[unknown]': 'A in front of an expression that has no value',
  'G0 A-[unknown]': 'the same, signed',
  'G0 X[unknown] A90': 'a literal A word, on a line refused for its X',
  'G0 X[1+2 A90': 'bracket never closed: nothing is masked',
  'G0 X1] A90': 'bracket never opened: nothing is masked',
  'G0 A[': 'bracket never closed'
};

describe('lot L0: the rotary detector agrees with the controller translator', () => {
  test('the table is wide and the translator really translates it', () => {
    expect(lines.length).toBeGreaterThan(900);
    expect(sentOf('G0 A-[1+2]')).toEqual({ sent: 'G0A-3', rejected: false, letters: 'A' });
    expect(sentOf('G0 a + [ 1 + 2 ]')).toEqual({ sent: 'G0A+3', rejected: false, letters: 'A' });
    expect(sentOf('G0 X[a1 + 2]')).toEqual({ sent: 'G0X9', rejected: false, letters: '' });
    expect(sentOf('G0 X[1+[2]+a1]').rejected).toBe(true);
    expect(lines.filter((line) => sentOf(line).letters && !sentOf(line).rejected).length).toBeGreaterThan(900);
  });

  test('no false negative: every rotary word the board would be sent is told, with its letter', () => {
    const missed = lines.filter((line) => {
      const { rejected, letters } = sentOf(line);
      const told = rotaryLetters(codeOf(line));
      return !rejected && letters.split('').some((letter) => !told.includes(letter));
    });
    expect(missed).toEqual([]);
  });

  test('the false positives are the listed ones, all on lines the board refuses', () => {
    // One whole family is not decided without evaluating: a sign in front of an expression whose
    // value is negative (`A-[v]`, v = -2, sent as `A--2`). The board refuses it; it is told.
    const signedNegative = lines.filter((line) => TWO_SIGNS.test(sentOf(line).sent) && rotaryLetters(codeOf(line)));
    expect(signedNegative.length).toBeGreaterThan(100);
    const extra = lines.filter((line) => {
      const { sent, rejected, letters } = sentOf(line);
      const told = rotaryLetters(codeOf(line));
      return !TWO_SIGNS.test(sent) && told.split('').some((letter) => rejected || !letters.includes(letter));
    });
    expect(extra.sort()).toEqual(Object.keys(ACCEPTED).sort());
    extra.forEach((line) => expect([line, sentOf(line).rejected]).toEqual([line, true]));
  });

  test.each([
    ['G0 A-[1+2]', 'A'], ['G0 A+[1+2]', 'A'], ['G0 B-[1+2]', 'B'], ['G0 C+[1+2]', 'C'], ['g0 a - [ 1 ]', 'A'], ['G0 A-#1', 'A'], ['G0 A.[n]', 'A']
  ])('%s is told', (line, letter) => {
    expect(rotaryLetters(codeOf(line))).toBe(letter);
    const check = programCheck('G21 G90\n' + line + '\n', {});
    expect(check.rotary).toEqual({ letters: letter, line: 2, count: 1 });
  });

  test.each(['G0 X[1+[2]+a1]', 'G0 X[[a1]]', 'G0 X[a1[0]]', 'G0 X#<a1>', 'G0 X[a1] Y[b2] Z[c3]'])('%s is not told: the letter is inside the expression', (line) => {
    expect(rotaryLetters(codeOf(line))).toBe('');
  });

  test('an expression line keeps its sorting and its verdict, with or without the sign', () => {
    const plain = programCheck('G21 G90\nG0 X-[1+2]\n', {});
    const turning = programCheck('G21 G90\nG0 X-[1+2] A-[1+2]\n', {});
    expect(turning.verdict).toBe(plain.verdict);
    expect(turning.codedReasons).toEqual(plain.codedReasons);
    expect(turning.axes).toEqual(plain.axes);
    expect(turning.uninterpreted.map((u) => u.line)).toEqual(plain.uninterpreted.map((u) => u.line));
  });
});
