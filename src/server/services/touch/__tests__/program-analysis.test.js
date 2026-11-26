/* eslint-env jest */
// Lot N1: what the program check tells the operator before the start, beyond the travel:
// the tools the file names and the time the spindle has to spin up before the first entry
// into the material. Display only: no verdict, no guard, no line sent depends on them.
import fs from 'fs';
import path from 'path';
import { analyzeProgram, checkProgram } from '../program-check';
import { durationOf } from '../program-time';

const CORPUS = path.join(__dirname, '../../../../../examples/cncjs-touch/gcode-corpus');

// Display profile (P5): maximum rates X/Y/Z 4000/4000/800 mm/min, overrides 100 %.
const profile = (patch = {}) => ({ settings: { $110: 4000, $111: 4000, $112: 800 }, overrides: { feed: 100, rapid: 100 }, ...patch });
const machine = (patch = {}) => ({
  settings: { $20: '1', $22: '1', $23: '0', $130: '300', $131: '200', $132: '80' },
  mpos: { x: -250, y: -150, z: -40 },
  wpos: { x: 0, y: 0, z: 0 },
  modal: { units: 'G21', distance: 'G90', wcs: 'G54', feedMode: 'G94' },
  parameters: null,
  homed: true,
  reportUnits: 'mm',
  ...patch
});
const check = (text, machinePatch, context = profile()) => checkProgram(analyzeProgram(text, context), machine(machinePatch));
const tools = (text) => analyzeProgram(text).tools;

describe('N1 tools named by the file', () => {
  test('a Fusion 360 header comment gives the description, the T word the line of first use', () => {
    const text = fs.readFileSync(path.join(CORPUS, '20-fusion360-grbl.nc'), 'utf8');
    expect(tools(text)).toEqual({
      list: [{ number: 1, text: 'D=3.175 CR=0. - ZMIN=-1.5 - flat end mill', line: 11, noteLine: 6 }],
      truncated: false,
      changes: 0,
      changeLine: null
    });
    expect(check(text).tools).toEqual(tools(text));
  });

  test('the usual comment forms are read; the text is the file\'s own', () => {
    const list = (text) => tools(text).list;
    expect(list('; Tool: End Mill 6 mm\nG21')).toEqual([{ number: null, text: 'End Mill 6 mm', line: null, noteLine: 1 }]);
    expect(list('( Tool 2 = V-Bit {60 deg} )')).toEqual([{ number: 2, text: 'V-Bit {60 deg}', line: null, noteLine: 1 }]);
    expect(list('(Tool Number: 3)')).toEqual([{ number: 3, text: '', line: null, noteLine: null }]);
    expect(list('(T3=6mm_Endmill)\nM6 T3')).toEqual([{ number: 3, text: '6mm_Endmill', line: 2, noteLine: 1 }]);
    expect(list('(Begin operation: TC: 6mm Endmill)')).toEqual([{ number: null, text: 'Begin operation: TC: 6mm Endmill', line: null, noteLine: 1 }]);
    expect(list('(TOOL/MILL,6,0,10,0)')).toEqual([{ number: null, text: 'TOOL/MILL,6,0,10,0', line: null, noteLine: 1 }]);
    expect(list(';Werkzeug 1: Fräser 3mm')).toEqual([{ number: 1, text: 'Fräser 3mm', line: null, noteLine: 1 }]);
    expect(list('G0 X1 (T4 ball nose (R3)) ; trailing')).toEqual([{ number: 4, text: 'ball nose (R3)', line: null, noteLine: 1 }]);
    // The first description of a number is kept; the first T word gives the line.
    expect(list('(T1 first)\n(T1 second)\nT1\nG0 X0\nT1')).toEqual([{ number: 1, text: 'first', line: 3, noteLine: 1 }]);
  });

  test('T words and M6 are counted from the code, never from a comment', () => {
    expect(tools('G21\nT2 M6\nG0 X0\nM6 T5\n(M6 T9 is a comment)\n;M6')).toEqual({
      list: [{ number: 2, text: '', line: 2, noteLine: null }, { number: 5, text: '', line: 4, noteLine: null }],
      truncated: false,
      changes: 2,
      changeLine: 2
    });
  });

  test('other comments name no tool; a file without any tool gives an empty list', () => {
    const text = ['(Toolpath: Profile 1)', '(Total time: 5 min)', '(Tool change)', '(TOOLPATH 1 = Pocket)', '; Tooling by hand', '(Text T1)', 'G21 G90', 'G0 X1'].join('\n');
    expect(tools(text)).toEqual({ list: [], truncated: false, changes: 0, changeLine: null });
    expect(check('G21 G90\nG0 X1').tools.list).toEqual([]);
  });

  test('the file\'s text is kept as written, without control characters, bounded in length', () => {
    const [entry] = tools('; Tool: <img src=x onerror=alert(1)>\t&amp;\u0007 ' + 'x'.repeat(500)).list;
    expect(entry.text.startsWith('<img src=x onerror=alert(1)> &amp; xxx')).toBe(true);
    expect(entry.text).toHaveLength(60);
    // A huge comment line is not scanned beyond its beginning.
    expect(tools('(' + 'T1 '.repeat(2000000) + ')').list).toEqual([{ number: 1, text: 'T1 '.repeat(20).trim().slice(0, 60), line: null, noteLine: 1 }]);
  });

  test('500000 lines naming a tool each keep a bounded list', () => {
    const lines = ['G21 G90 G94 F600'];
    for (let i = 0; i < 500000; i++) {
      lines.push('T' + i + ' G1 X' + (i % 400) + ' (T' + i + ' D=' + (i % 12) + ' end mill number ' + i + ') ; Tool: unnumbered ' + i);
    }
    const analysis = analyzeProgram(lines.join('\n'), profile());
    expect(analysis.lines).toBe(500001);
    expect(analysis.tools.list).toHaveLength(8);
    expect(analysis.tools.truncated).toBe(true);
    expect(analysis.tools.list.every((entry) => entry.text.length <= 60)).toBe(true);
    expect(analysis.tools.list[0]).toEqual({ number: 0, text: 'D=0 end mill number 0', line: 2, noteLine: 2 });
    expect(Buffer.byteLength(JSON.stringify(analysis.tools))).toBeLessThan(2048);
    expect(Buffer.byteLength(JSON.stringify(analysis.spinUp))).toBeLessThan(256);
  });
});

describe('N1 spindle spin-up time before the first entry into the material', () => {
  // A Vectric-like start: the tool is placed, then the spindle starts, then one rapid and the plunge.
  const VECTRIC = ['T1', 'G17', 'G21', 'G90', 'G0Z20.000', 'G0X0.000Y0.000', 'S18000M3', 'G0X10.000Y20.000Z5.000', 'G1Z-1.000F300.0', 'G1X50.000F900.0', 'G0Z20.000', 'M5', 'M30'].join('\n');

  test('spindle started after the tool is placed: the time of what lies between, in the model of the duration', () => {
    // One rapid: Z 15 mm at 800 mm/min (the slowest axis decides), 1.125 s.
    expect(check(VECTRIC).spinUp).toEqual({ state: 'computed', seconds: 1.125, dwell: 0, atLeast: false, startLine: 7, entryLine: 9 });
    // Rapids at 25 %: four times longer.
    expect(check(VECTRIC, {}, profile({ overrides: { feed: 100, rapid: 25 } })).spinUp).toMatchObject({ state: 'computed', seconds: 4.5 });
  });

  test('a dwell after the start is counted, on its own line or on the line of the start', () => {
    expect(check(VECTRIC.replace('S18000M3', 'S18000M3\nG4 P3')).spinUp).toEqual({ state: 'computed', seconds: 4.125, dwell: 3, atLeast: false, startLine: 7, entryLine: 10 });
    expect(check(VECTRIC.replace('S18000M3', 'S18000M3 G4P2.5')).spinUp).toMatchObject({ state: 'computed', seconds: 3.625, dwell: 2.5, entryLine: 9 });
    // A dwell before the start gives the spindle nothing.
    expect(check(VECTRIC.replace('S18000M3', 'G4 P5\nS18000M3')).spinUp).toMatchObject({ state: 'computed', seconds: 1.125, dwell: 0, startLine: 8 });
  });

  test('the start in force at the entry counts: M4, a stop and a second start', () => {
    expect(check(VECTRIC.replace('S18000M3', 'S18000M4')).spinUp).toMatchObject({ state: 'computed', seconds: 1.125, startLine: 7 });
    expect(check(VECTRIC.replace('S18000M3', 'S18000M3\nG4 P9\nM5\nS18000M3')).spinUp).toEqual({ state: 'computed', seconds: 1.125, dwell: 0, atLeast: false, startLine: 10, entryLine: 12 });
    expect(check(VECTRIC.replace('S18000M3', 'S18000M3\nG4 P9\nM5')).spinUp).toEqual({ state: 'noStart', startLine: null, entryLine: 11 });
  });

  test('what counts as the entry: below the work zero, or a feed move going down', () => {
    const entry = (lines) => check(['G21 G90 G94', 'G0 X0 Y0 Z10', 'M3 S1000'].concat(lines).join('\n')).spinUp;
    // A rapid above the zero and a level feed move are not an entry; the plunge is.
    expect(entry(['G0 Z5', 'G1 X10 F600', 'G1 Z-2 F100'])).toMatchObject({ state: 'computed', entryLine: 6, seconds: 5 * 60 / 800 + 1 });
    // A feed move going down above the zero (work zero on the spoilboard) is the entry.
    expect(entry(['G0 Z8', 'G1 Z6 F100', 'G1 Z-2'])).toMatchObject({ state: 'computed', entryLine: 5, seconds: 2 * 60 / 800 });
    // A rapid that ends below the zero is one too.
    expect(entry(['G0 Z-1'])).toMatchObject({ state: 'computed', entryLine: 4, seconds: 0 });
    // An arc below the zero; a helix going down.
    expect(entry(['G0 X10 Y0 Z5', 'G3 X0 Y10 Z4 I-10 J0 F600'])).toMatchObject({ state: 'computed', entryLine: 5 });
    // The spindle and the plunge on the same line: no time at all.
    expect(check('G21 G90 G94\nG0 X0 Y0 Z5\nM3 S1000 G1 Z-1 F100').spinUp).toMatchObject({ state: 'computed', seconds: 0, startLine: 3, entryLine: 3 });
    // A feed move while the height is not known is taken as an entry (the tool is where it was left).
    expect(check('G21 G90 G94\nG0 X0 Y0\nM3 S1000\nG1 X10 F100').spinUp).toMatchObject({ state: 'computed', entryLine: 4, seconds: 0 });
  });

  test('spindle started before the first moves: a lower bound, the approach is not counted', () => {
    const text = fs.readFileSync(path.join(CORPUS, '20-fusion360-grbl.nc'), 'utf8');
    // M3 (line 12), X/Y and Z15 from an unknown position (not counted), Z15 to Z5 (0.75 s), plunge line 17.
    expect(check(text).spinUp).toEqual({ state: 'computed', seconds: 0.75, dwell: 0, atLeast: true, startLine: 12, entryLine: 17 });
  });

  test('no start before the entry, or no entry at all, are told apart', () => {
    expect(check('G21 G90\nG0 Z5\nG0 X0 Y0\nG1 Z-1 F100\nM3 S1000').spinUp).toEqual({ state: 'noStart', startLine: null, entryLine: 4 });
    expect(check('G21 G90\nM3 S1000\nG0 Z5\nG0 X10 Y10').spinUp).toEqual({ state: 'noEntry', startLine: 2, entryLine: null });
    expect(check('').spinUp).toEqual({ state: 'noEntry', startLine: null, entryLine: null });
    // Nothing after the end of the program is read as an entry.
    expect(check('G21 G90\nM3 S1000\nG0 Z5\nM30\nG1 Z-1 F100').spinUp).toMatchObject({ state: 'noEntry' });
  });

  test.each([
    ['no duration profile at load', VECTRIC, {}, {}],
    ['rates unknown', VECTRIC, {}, profile({ settings: {} })],
    ['a tool change in between', VECTRIC.replace('S18000M3', 'S18000M3\nM6'), {}, profile()],
    ['a program pause in between', VECTRIC.replace('S18000M3', 'S18000M3\nM0'), {}, profile()],
    ['a machine-coordinate move before', 'G53 G0 Z0\n' + VECTRIC, {}, profile()],
    ['a macro before', '%wait\n' + VECTRIC, {}, profile()],
    ['a feed move in inverse time', 'G21 G90 G93\nG0 X0 Y0 Z5\nM3 S1000\nG1 X60 F2\nG1 Z-1 F2', {}, profile()],
    ['units left to an unknown machine', VECTRIC.replace('G21\n', ''), { modal: null }, profile()],
    ['units left to a machine in inches', VECTRIC.replace('G21\n', ''), { modal: { units: 'G20', distance: 'G90', feedMode: 'G94' } }, profile()],
    ['distance mode left to an unknown machine', VECTRIC.replace('G90\n', ''), { modal: null }, profile()],
    ['a relative start', VECTRIC.replace('G90', 'G91'), {}, profile()]
  ])('never a figure when the model cannot follow: %s', (name, text, machinePatch, context) => {
    const spinUp = check(text, machinePatch, context).spinUp;
    expect(spinUp.state).toBe('unknown');
    expect(spinUp.seconds).toBeUndefined();
    expect(spinUp.entryLine).toEqual(expect.any(Number));
  });

  test('a feed move timed in an inherited feed mode needs the machine in a known G94', () => {
    const text = ['G21 G90', 'G0 X0 Y0 Z5', 'M3 S1000', 'G1 X60 F600', 'G1 Z-1 F100'].join('\n');
    expect(check(text).spinUp).toMatchObject({ state: 'computed', seconds: 6 });
    expect(check(text, { modal: { units: 'G21', distance: 'G90', feedMode: 'G93' } }).spinUp.state).toBe('unknown');
    expect(check(text, { modal: { units: 'G21', distance: 'G90' } }).spinUp.state).toBe('unknown');
    expect(check(text, { modal: null }).spinUp.state).toBe('unknown');
    // Stated by the program: the machine's mode does not matter.
    expect(check(text.replace('G21 G90', 'G21 G90 G94'), { modal: null }).spinUp).toMatchObject({ state: 'computed', seconds: 6 });
    // Units and distance mode left to a machine known in G21 / G90.
    expect(check(VECTRIC.replace('G21\n', '').replace('G90\n', '')).spinUp).toMatchObject({ state: 'computed', seconds: 1.125 });
  });

  test('a laser has no spindle to wait for; an analysis made before this lot gives nothing', () => {
    expect(check(VECTRIC, { laser: { sMax: 1000 } }).spinUp).toBeNull();
    const { spinUp, tools: named, ...older } = analyzeProgram(VECTRIC, profile());
    expect(spinUp.entryLine).toBe(9);
    expect(named.list).toHaveLength(1);
    expect(checkProgram(older, machine())).toMatchObject({ spinUp: null, tools: { list: [], truncated: false, changes: 0, changeLine: null } });
  });
});

describe('N1 is display only', () => {
  test('tools and spin-up change no verdict, no reason, no blocking overrun, no duration', () => {
    const plain = ['G21 G90 G94', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-3 F100', 'G1 X40 F500', 'G0 Z5', 'M30'].join('\n');
    const noted = ['G21 G90 G94 (T1 D=6 flat end mill) ; Tool: 6 mm', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-3 F100', 'G1 X40 F500', 'G0 Z5', 'M30'].join('\n');
    const strip = ({ tools: named, spinUp, uninterpreted, ...rest }) => rest;
    expect(strip(check(noted))).toEqual(strip(check(plain)));
    expect(check(noted).tools.list).toHaveLength(2);
    // An overrun stays an overrun, a spindle without time blocks nothing.
    const deep = check(plain.replace('Z-3', 'Z-60'));
    expect(deep.verdict).toBe('outside');
    expect(deep.blocking).toHaveLength(1);
    const short = check(plain.replace('G0 X0 Y0', 'G0 X0 Y0\nM3 S1000'));
    expect(short.spinUp).toMatchObject({ state: 'computed', seconds: 0 });
    expect(short.verdict).toBe('validated');
    expect(short.blocking).toEqual([]);
    const context = { ...profile(), wpos: { x: 0, y: 0, z: 0 }, reportUnits: 'mm', offsetProven: true, wcs: 'G54', feedMode: 'G94', tlo: 0 };
    expect(durationOf(analyzeProgram(noted, profile()), context)).toBeCloseTo(durationOf(analyzeProgram(plain, profile()), context));
  });
});
