/* eslint-env jest */
import { analyzeProgram, checkProgram } from '../program-check';
import { durationOf, createRunTime } from '../program-time';

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
const duration = (text, patch) => durationOf(analyzeProgram(text), context(patch));

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
  const analysis = analyzeProgram('G21 G90 G94\n' + 'G1 X1 F400\n'.repeat(20001));
  expect(analysis.timing.supported).toBe(false);
  expect(analysis.timing.moves).toEqual([]);
  const result = checkProgram(analysis, context());
  const { timing, ...withoutTiming } = analysis;
  expect(timing.supported).toBe(false);
  expect(checkProgram(withoutTiming, context())).toEqual(result);
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
