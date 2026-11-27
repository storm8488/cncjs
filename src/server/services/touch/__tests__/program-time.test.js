/* eslint-env jest */
import { analyzeProgram, checkProgram, programLines } from '../program-check';
import { durationOf, createRunTime, createProgramTime, MAX_TIME_BLOCKS } from '../program-time';

const context = (patch = {}) => ({
  settings: { $110: 4000, $111: 4000, $112: 800 },
  wpos: { x: 0, y: 0, z: 0 },
reportUnits: 'mm',
offsetProven: true,
  wcs: 'G54',
feedMode: 'G94',
tlo: 0,
overrides: { feed: 100, rapid: 100 },
...patch
});
const duration = (text, patch) => durationOf(analyzeProgram(text, context(patch)), context(patch));

test('a short surfacing program has a duration even without any preview, including its first approach', () => {
  const text = ['G21 G90 G94', 'G0 Z5', 'G0 X400 Y80', 'G1 Z-2 F120', 'G1 X0 F400', 'G1 X400', 'G4 P3', 'G0 Z5', 'M30'].join('\n');
  expect(duration(text)).toBeCloseTo(60 * 5 / 800 + 6 + 3.5 + 120 + 3 + 60 * 7 / 800);
  expect(duration(text, { wpos: { x: 400, y: 80, z: 5 } })).toBeCloseTo(3.5 + 120 + 3 + 60 * 7 / 800);
  expect(duration('G20 G90 G94 G1 X1 F1')).toBeCloseTo(60);
  expect(duration('G21 G90 G94 G1 X100 Y100 F600')).toBeCloseTo(Math.sqrt(2) * 10);
  expect(duration('G21 G90 G94 G1 Z100 F4000')).toBeCloseTo(7.5);
  expect(duration('G21 G90 G94 G0 X400', { overrides: { feed: 50, rapid: 25 } })).toBeCloseTo(24);
  expect(duration('G21 G90 G94 G1 X400 F400', { overrides: { feed: 50, rapid: 25 } })).toBeCloseTo(120);
});

test('arc lengths, full circles, helices, modal feeds, relative moves and comments follow the travel walk', () => {
  expect(duration('G21 G90 G94\nG0 X10 Y0 Z0\nG3 X0 Y10 I-10 J0 F600')).toBeCloseTo(0.15 + Math.PI / 2);
  expect(duration('G21 G90 G94\nG0 X10 Y0 Z0\nG2 X10 Y0 I-10 J0 F600')).toBeCloseTo(0.15 + 2 * Math.PI);
  expect(duration('G21 G90 G94\nG0 X10 Y0 Z0\nG3 X0 Y10 Z10 I-10 J0 F600')).toBeCloseTo(0.15 + Math.hypot(5 * Math.PI, 10) / 10);
  expect(duration('G21 G90 G94\nG1 X10 F60\nG91\nX20 (F9999 (nested) G53)\nM30')).toBeCloseTo(30);
  expect(duration('G21 G90 G94\nG1 X10 F60\nM30\nG1 X100 F60')).toBeCloseTo(10);
});

test.each([
  'G21 G90\nG1 X400', 'G21 G90 G93\nG1 X400 F4', 'G21 G91 G94\nG1 X400 F400',
  'G21 G90 G94\nG38.2 Z-2 F100', 'G21 G90\nG53 G0 Z0', 'G21 G90\nG28',
  'G21 G90\nG10 L20 P1 X0', 'G21 G90\nG1 X-1 40 F100', 'G21 G90\nG4',
  'G21 G90\nG1 X10 F100\nM6', 'G21 G90\nG1 X10 F100\nM0', 'G1 X1 F1',
  'G21 G90\nG1 X10 F100\nG55', 'G21 G90\nG1 X10 F100\n$H', 'G21 G90\nG1 X[2] F100'
])('no invented duration for unsupported or incomplete program: %s', (text) => {
  expect(duration(text)).toBeNull();
});

test.each([
  { reportUnits: null }, { offsetProven: false }, { wpos: { x: null, y: 0, z: 0 } },
  { overrides: null }, { settings: { $110: 0 } }, { feedMode: 'G93' }
])('unknown start facts give no duration: %j', (patch) => {
  expect(duration('G21 G90\nG1 X400 F400', patch)).toBeNull();
});

test('the bounded display model does not alter the travel contract', () => {
  const analysis = analyzeProgram('G21 G90 G94\n' + 'G1 X1 F400\n'.repeat(20001), context());
  expect(analysis.timing.supported).toBe(true);
  expect(analysis.timing.moves).toBeUndefined();
  expect(analysis.timing.blocks.length).toBeLessThanOrEqual(MAX_TIME_BLOCKS);
  const result = checkProgram(analysis, context());
  const { timing, ...withoutTiming } = analysis;
  expect(timing.supported).toBe(true);
  expect(checkProgram(withoutTiming, context())).toEqual(result);
});

test('500000 varying 3D G1 moves retain only cumulative blocks and match an independent duration sum', () => {
  const lines = ['G21 G90 G94 F600'];
  let expected = 0;
  let previous = [0, 0, 0];
  for (let i = 0; i < 500000; i++) {
    const point = [i % 401, (i * 7) % 71, -(i % 200) / 10];
    lines.push('G1 X' + point[0] + ' Y' + point[1] + ' Z' + point[2]);
    const delta = [Math.abs(point[0] - previous[0]), Math.abs(point[1] - previous[1]), Math.abs(point[2] - previous[2])];
    expected += Math.max(Math.hypot(...delta) / 10, delta[0] * 60 / 4000, delta[1] * 60 / 4000, delta[2] * 60 / 800);
    previous = point;
  }
  const analysis = analyzeProgram(lines.join('\n'), context());
  expect(analysis).toMatchObject({ lines: 500001, moves: 500000, timing: { supported: true } });
  expect(analysis.timing.moves).toBeUndefined();
  expect(analysis.timing.initial.length).toBeLessThanOrEqual(3);
  expect(analysis.timing.blocks.length).toBeLessThanOrEqual(MAX_TIME_BLOCKS);
  expect(Buffer.byteLength(JSON.stringify(analysis.timing))).toBeLessThan(65536);
  expect(analysis.timing.blocks[analysis.timing.blocks.length - 1].line).toBe(500001);
  expect(durationOf(analysis, context())).toBeCloseTo(expected, 6);
  const progress = createRunTime(durationOf(analysis, context()), 0, context().overrides);
  expect(progress(1000, state())).toMatchObject({ remainingSeconds: expected - 1, activeSeconds: 1 });
  expect(progress(1000, state()).percent).toBeCloseTo(100 / expected);
});

test('block compaction keeps exact cumulative endpoints within a fixed memory bound', () => {
  const collector = createProgramTime(context());
  for (let i = 1; i <= 4000; i++) {
    collector.dwell(0.25, i * 1024);
    expect(collector.timing.blocks.length).toBeLessThanOrEqual(MAX_TIME_BLOCKS);
  }
  collector.finish(4096001);
  const blocks = collector.timing.blocks;
  expect(blocks.length).toBeLessThanOrEqual(MAX_TIME_BLOCKS);
  expect(blocks[blocks.length - 1]).toEqual({ line: 4096001, seconds: 1000 });
  expect(blocks.every((block, i) => i === 0 || (block.line > blocks[i - 1].line && block.seconds >= blocks[i - 1].seconds))).toBe(true);
});

test('the streaming walk preserves sender line numbering, including comments, CRLF and blank lines', () => {
  const text = '\n \r\nG21 G90 G94\r\n\t\n(comment)\nG1 X1 F60\n;comment\nG4 P2\r\nG1 X2\nM30\n\n';
  const normalized = programLines(text).join('\n');
  const { timing, ...streamed } = analyzeProgram(text, context());
  const { timing: normalizedTiming, ...arrayWalk } = analyzeProgram(normalized, context());
  expect(streamed).toEqual(arrayWalk);
  expect(JSON.stringify(timing)).toEqual(JSON.stringify(normalizedTiming));
  expect(duration(text)).toBeCloseTo(4);
});

test('initial approaches are resolved at each start and do not grow with unset idle axes', () => {
  const analysis = analyzeProgram('G21 G90 G94\nG0 Z5\n' + 'G1 Z4 F60\nG1 Z5\n'.repeat(11000) + 'G0 X10\nG0 Y20', context());
  expect(analysis.timing.initial).toHaveLength(3);
  expect(durationOf(analysis, context())).toBeCloseTo(22000 + 5 * 60 / 800 + 30 * 60 / 4000);
  expect(durationOf(analysis, context({ wpos: { x: 10, y: 20, z: 5 } }))).toBeCloseTo(22000);
});

test('the collector refuses a fourth initial approach and never retains more than three', () => {
  const collector = createProgramTime(context());
  const move = {
    start: { X: null, Y: 0, Z: 0 },
    end: { X: 3, Y: 0, Z: 0 },
    rapid: false,
    feed: 60,
    mode: 'G94',
    arcLength: null
  };
  for (let i = 1; i <= 4; i++) {
    collector.move(move, i * 3);
    expect(collector.timing.initial.length).toBeLessThanOrEqual(3);
    expect(collector.timing.supported).toBe(i <= 3);
  }
  for (let i = 5; i <= 100000; i++) {
    collector.move(move, i * 3);
  }
  expect(collector.timing.initial).toHaveLength(3);
  expect(collector.timing.supported).toBe(false);
  collector.finish(300000);
  expect(collector.timing).toMatchObject({ supported: false, blocks: [], initial: [] });
});

test('100000 repetitions of G80 and axis-only lines release the unsupported timing model', () => {
  const analysis = analyzeProgram('G21 G90 G94 F60\nG1 X0 Y0 Z0\n' + 'G80\nX5\nG1 X3\n'.repeat(100000), context());
  expect(analysis.moves).toBe(100001);
  expect(analysis.timing.initial.length).toBe(0);
  expect(analysis.timing.blocks.length).toBe(0);
  expect(analysis.timing.supported).toBe(false);
  expect(durationOf(analysis, context())).toBeNull();
});

test.each([
  'G93 G1 X5 F1', 'G2 X2 Y2 R0.1', 'M6', 'M0', 'G53 G0 Z0', 'G1 X[2]'
])('an unsupported line after a large supported prefix releases the model: %s', (last) => {
  const analysis = analyzeProgram('G21 G90 G94\nG1 X1 Y1 Z1 F600\n' + 'G1 X2\nG1 X1\n'.repeat(11000) + last, context());
  expect(analysis.timing).toMatchObject({ supported: false, blocks: [], initial: [] });
  expect(durationOf(analysis, context())).toBeNull();
});

test('a new start rebuilds changed rate profiles and can recover a program loaded before settings were known', () => {
  const load = context();
  const text = 'G21 G90 G94\nG1 X1 Y1 Z1 F600\nG1 X20 F5000';
  const analysis = analyzeProgram(text, load);
  const original = durationOf(analysis, context());
  const rebuild = jest.fn(analysis.timing.rebuild);
  analysis.timing.rebuild = rebuild;
  expect(durationOf(analysis, context())).toBe(original);
  expect(rebuild).not.toHaveBeenCalled();
  load.settings.$110 = 500;
  expect(analysis.timing.profile.rates[0]).toBe(4000);
  expect(durationOf(analysis, load)).toBeCloseTo(Math.sqrt(3) / 10 + 19 * 60 / 500);
  expect(rebuild).toHaveBeenCalledTimes(1);
  expect(durationOf(analysis, context())).toBeCloseTo(original);
  const slower = context({ overrides: { feed: 50, rapid: 100 } });
  expect(durationOf(analysis, slower)).toBeCloseTo(duration(text, slower));
  expect(durationOf(analyzeProgram('G21 G90 G94\nG1 X1 F60'), context())).toBeCloseTo(1);
});

test('an inherited G93 mode refuses known moves too, while an explicit G94 is independent of it', () => {
  expect(duration('G21 G90\nG0 X0 Y0 Z0\nG1 X10 F60', { feedMode: 'G93' })).toBeNull();
  expect(duration('G21 G90 G94\nG0 X0 Y0 Z0\nG1 X10 F60', { feedMode: 'G93' })).toBeCloseTo(10);
});

const state = (patch = {}) => ({ fresh: true, workflow: 'running', activeState: 'Run', overrides: { feed: 100, rapid: 100 }, ...patch });
test('the clock advances with every line already buffered, freezes in hold, and ends only on the server end', () => {
  const sample = createRunTime(420, 10000, state().overrides);
  expect(sample(10000, state()).percent).toBe(0);
  for (let i = 1; i <= 60; i++) {
 sample(10000 + i * 1000, state());
}
  expect(sample(70000, state())).toMatchObject({ activeSeconds: 60, elapsedSeconds: 60, percent: 100 / 7 });
  sample(70000, state({ workflow: 'paused', activeState: 'Hold' }));
  for (let i = 1; i <= 10; i++) {
 sample(70000 + i * 1000, state({ workflow: 'paused', activeState: 'Hold' }));
}
  expect(sample(80000, state()).activeSeconds).toBe(60);
  expect(sample(81000, state())).toMatchObject({ activeSeconds: 61, elapsedSeconds: 71 });
  sample(81000, state({ ended: true, workflow: 'idle', activeState: 'Idle' }));
  expect(sample(99000, state({ ended: true })).elapsedSeconds).toBe(71);
});

test.each([
  { invalid: true }, { overrides: { feed: 90, rapid: 100 } }, { overrides: null }
])('a model invalidated during the run stays unavailable: %j', (patch) => {
  const sample = createRunTime(420, 0, state().overrides);
  sample(1000, state(patch));
  expect(sample(2000, state()).percent).toBeNull();
  expect(sample(2000, state()).elapsedSeconds).toBe(2);
});

test('a report gap, clock reversal or exhausted estimate never produces a frozen near-finished bar', () => {
  for (const now of [-1, 3000]) {
    const sample = createRunTime(420, 0, state().overrides);
    expect(sample(now, state()).percent).toBeNull();
  }
  const sample = createRunTime(1, 0, state().overrides);
  expect(sample(1000, state())).toMatchObject({ elapsedSeconds: 1, percent: null, remainingSeconds: null });
  expect(createRunTime(null, 0, null)(1000, state()).percent).toBeNull();
});
