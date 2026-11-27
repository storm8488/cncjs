/* eslint-env jest */
/* eslint-disable no-await-in-loop */ // the cases of a table run one after the other on purpose
// Lot C1 (design/plaque/C1-CONCEPTION.md § 4): the starts. Every report is a line read by the real
// parser; every test is judged on the bytes written and on the code of the refusal.
import { setup, disposeAll, gcLine, SETTINGS } from './support/c1-bench';

afterEach(disposeAll);

const NO_POSITION = 'ETOUCH_MOTION_NO_POSITION';
const COMMANDED = 'ETOUCH_MOTION_SPINDLE_COMMANDED';
const UNKNOWN = 'ETOUCH_MOTION_SPINDLE_UNKNOWN';
const MACROS = [{ id: 'm1', name: 'Dégager', content: 'G0 X1' }];
const PLATE = { operation: 'zeroZ', thickness: 10, search: 10 };

// Every guarded start, by name: what it writes first when accepted.
const STARTS = {
  'step 10 mm': { run: (ctx) => ctx.jog(10), first: '$J=G91 G21 X10 F600' },
  'continuous jog': { run: (ctx) => ctx.hold('X', 1), first: /^\$J=G91 G21 X/ },
  'CNC framing': { run: async (ctx) => {
 await ctx.load(); return ctx.frame();
},
first: 'M5' },
  'plate probe': { run: (ctx) => ctx.launch('zeroZ', PLATE), first: /^G38\.2 Z/ },
  macro: { run: (ctx) => ctx.confirmed('macro', { macroId: 'm1' }), first: 'MACRO m1' },
  'program start': {
    run: async (ctx) => {
 await ctx.load(); return ctx.confirmed('start', { revision: ctx.state().revision });
},
first: 'START'
  }
};

const firstOf = (name) => (typeof STARTS[name].first === 'string' ? STARTS[name].first : expect.stringMatching(STARTS[name].first));

describe('C1: the position is the one the last report carried itself (R-1, R-2)', () => {
  test('T1 (finding 1b): ten seconds of reports without coordinates, then a step: nothing written, ETOUCH_MOTION_NO_POSITION', async () => {
    const ctx = await setup();
    await ctx.quiet(10000, 'Idle', { pos: null });
    const state = ctx.state();
    expect([state.motion.canJog, state.refusals.jog && state.refusals.jog.code]).toEqual([false, NO_POSITION]);
    expect(await ctx.codeOf(ctx.jog(10))).toBe(NO_POSITION);
    expect(await ctx.codeOf(ctx.jog(0.01))).toBe(NO_POSITION);
    expect(ctx.c.written).toEqual([]);
  });

  test('T1b: a fresh, explicit position but a single Idle after a Jog: neither a step nor a continuous jog; a second Idle that agrees frees them', async () => {
    for (const name of ['step 10 mm', 'continuous jog']) {
      const ctx = await setup();
      ctx.rep('Jog');
      ctx.rep('Idle');
      expect([name, await ctx.codeOf(STARTS[name].run(ctx))]).toEqual([name, NO_POSITION]);
      expect([name, ctx.c.written]).toEqual([name, []]);
      // A second Idle elsewhere does not agree.
      ctx.m[0] += 0.02;
      ctx.rep('Idle');
      expect([name, await ctx.codeOf(STARTS[name].run(ctx))]).toEqual([name, NO_POSITION]);
      ctx.rep('Idle');
      expect([name, await ctx.codeOf(STARTS[name].run(ctx))]).toEqual([name, null]);
      expect([name, ctx.lines()[0]]).toEqual([name, firstOf(name)]);
    }
  });

  test('T1b, framing (mutation M4): the plan of a CNC framing is refused on a single Idle', async () => {
    const ctx = await setup();
    await ctx.load();
    ctx.rep('Jog');
    ctx.rep('Idle');
    expect(await ctx.codeOf(ctx.machine('frame-prepare'))).toBe(NO_POSITION);
    ctx.rep('Idle');
    expect(await ctx.codeOf(ctx.machine('frame-prepare'))).toBe(null);
    expect(ctx.c.written).toEqual([]);
  });

  test('T2 (finding 1c): a framing prepared, then confirmed on reports without coordinates: refused, nothing written', async () => {
    const ctx = await setup({ at: [-100, -100, -4] });
    await ctx.load();
    await ctx.quiet(10000, 'Idle', { pos: null });
    expect(await ctx.codeOf(ctx.machine('frame-prepare'))).toBe(NO_POSITION);
    ctx.rest();
    const ticket = await ctx.machine('frame-prepare');
    ctx.rep('Idle', { pos: null });
    expect(await ctx.codeOf(ctx.machine('frame', { nonce: ticket.nonce }))).toBe(NO_POSITION);
    expect(ctx.c.written).toEqual([]);
  });

  test('T8: a field counts only when it is whole and alone; the values come from the raw field', async () => {
    // Positions: each line twice, with a fresh $G saying M5.
    const positions = [
      '<Idle|MPos:1,2,3foo|FS:0,0>',
      '<Idle|MPos:-100.000,-100.000,-60.000|MPos:-100.000,-100.000,-60.000|FS:0,0>',
      '<Idle|MPos:-100.000,-100.000,-60.000|junk:MPos:-90.000,-90.000,-60.000|FS:0,0>',
      '<Idle|MPos:-100.000,-100.000|FS:0,0>',
      '<Idle|MPos:-100.000,-100.000,|FS:0,0>',
      '<Idle|MPos:|FS:0,0>'
    ];
    for (const line of positions) {
      const ctx = await setup();
      ctx.say(line, line);
      ctx.gc();
      expect([line, await ctx.codeOf(ctx.jog(10))]).toEqual([line, NO_POSITION]);
      expect([line, ctx.c.written]).toEqual([line, []]);
    }
    // Speeds: the position is perfect, the $G says M5; the last two reports carry this FS: field.
    for (const fs of ['0', '0,', '0,-1', '0,0foo', '0,0|FS:0,0', '0,0|junk:FS:0,0']) {
      const ctx = await setup();
      ctx.rep('Idle', { fs });
      ctx.rep('Idle', { fs });
      ctx.gc();
      expect([fs, await ctx.codeOf(ctx.jog(10))]).toEqual([fs, UNKNOWN]);
      expect([fs, ctx.c.written]).toEqual([fs, []]);
    }
    // $G: no spindle word (mutation M17), then two of them.
    for (const [spindle, line] of [['none', gcLine(null)], ['M3 M5', gcLine('M3 M5')]]) {
      const ctx = await setup();
      ctx.rep('Idle');
      ctx.rep('Idle');
      ctx.say(line, 'ok');
      expect([spindle, await ctx.codeOf(ctx.jog(10))]).toEqual([spindle, UNKNOWN]);
      expect([spindle, ctx.c.written]).toEqual([spindle, []]);
    }
  });

  test('T8x: the other frame is derived by Touch from the offset kept; without any WCO: since the banner it is unknown', async () => {
    // WCO 0, 0, −5 received three reports earlier: work Z = machine Z + 5.
    let ctx = await setup({ at: [-100, -100, -20], wco: [0, 0, -5] });
    ctx.rep('Idle');
    ctx.rest();
    await ctx.launch('zeroZ', PLATE);
    expect(ctx.lines()).toEqual(['G38.2 Z-25 F100']);
    // No WCO: at all since the banner: the machine position is readable, the work position is not.
    ctx = await setup({ at: [-100, -100, -20], rest: false });
    ctx.say('Grbl 1.1h [\'$\' for help]');
    ctx.rep('Home');
    ctx.rest();
    expect(await ctx.codeOf(ctx.jog(10))).toBe(null);
    await ctx.tick(50);
    ctx.ok();
    await ctx.quiet(300);
    expect((await ctx.refused(ctx.req('prepare', PLATE))).message).toBe('Position Z inconnue.');
    await ctx.load();
    expect(await ctx.codeOf(ctx.machine('frame-prepare'))).toBe('ETOUCH_LASER_FRAME_POSITION');
    expect(ctx.lines()).toEqual(['$J=G91 G21 X10 F600']);
    // A broken WCO: field leaves no offset kept (the parser would keep its last zero).
    ctx = await setup({ at: [-100, -100, -20], wco: [0, 0, -5] });
    ctx.say('<Idle|MPos:-100.000,-100.000,-20.000|FS:0,0|WCO:0,0,20|junk:WCO:0,0,0>');
    ctx.rest();
    expect((await ctx.refused(ctx.req('prepare', PLATE))).message).toBe('Position Z inconnue.');
    // And a whole one received later is kept again.
    ctx.rep('Idle', { wco: [0, 0, -5] });
    ctx.rest();
    expect(await ctx.codeOf(ctx.req('prepare', PLATE))).toBe(null);
    expect(ctx.c.written).toEqual([]);
  });
});

describe('C1, after the reviews: a machine position that is unknown', () => {
  // The rule of before C1 for a travel that cannot be checked (machine not referenced, $10 without
  // MPos and no WCO): steps of 1 mm at most, nothing longer. A machine position unknown to Touch
  // falls under the same rule, never under « inside the travel ».
  test('A2, jog and framing: a board in WPos: whose kept offset was erased: a 10 mm step, the continuous jog and the framing are refused; a 1 mm step stays possible', async () => {
    const ctx = await setup({ wpos: true });
    await ctx.load();
    ctx.say('<Idle|WPos:5.000,5.000,48.000|FS:0,0|WCO:0,0>');
    ctx.rest();
    expect((await ctx.refused(ctx.jog(10))).message).toMatch(/au-delà de 1 mm.*position machine X inconnue/);
    expect((await ctx.refused(ctx.hold('X', 1))).message).toMatch(/position machine X inconnue/);
    expect(await ctx.codeOf(ctx.machine('frame-prepare'))).not.toBe(null);
    expect(ctx.c.written).toEqual([]);
    expect(await ctx.codeOf(ctx.jog(1))).toBe(null);
    expect(ctx.lines()).toEqual(['$J=G91 G21 X1 F600']);
  });
});

describe('C1: the spindle is stopped only on two positive proofs (R-3)', () => {
  test('T6: M3 S0 with complete reports FS:0,0: every guarded start refused (commanded); a 0.1 mm step, $H and $X as before', async () => {
    for (const name of Object.keys(STARTS)) {
      const ctx = await setup({ macros: MACROS, at: [-100, -100, -20] });
      ctx.rep('Idle');
      ctx.rep('Idle');
      ctx.gc('M3');
      const err = await ctx.refused(STARTS[name].run(ctx));
      expect([name, err && err.code, err && err.params]).toEqual([name, COMMANDED, { mode: 'M3' }]);
      expect([name, ctx.c.written]).toEqual([name, []]);
      // The remedy: the $G says M5 again.
      ctx.rest();
      expect([name, await ctx.codeOf(STARTS[name].run(ctx))]).toEqual([name, null]);
      expect([name, ctx.lines()[0]]).toEqual([name, firstOf(name)]);
    }
    const ctx = await setup();
    ctx.rep('Idle');
    ctx.rep('Idle');
    ctx.gc('M4');
    expect(await ctx.codeOf(ctx.jog(0.1))).toBe(null);
    expect(ctx.lines()).toEqual(['$J=G91 G21 X0.1 F600']);
    await ctx.tick(50);
    ctx.ok();
    await ctx.tick(300, () => ctx.rep('Idle'));
    ctx.gc('M4');
    expect(await ctx.codeOf(ctx.confirmed('home'))).toBe(null);
    expect(ctx.lines()).toEqual(['$J=G91 G21 X0.1 F600', '$H']);
  });

  test('T7 (mutation M15): FS: alone disappears, position and $G perfect: the same starts refused (unknown); $H accepted', async () => {
    for (const name of Object.keys(STARTS)) {
      const ctx = await setup({ macros: MACROS, at: [-100, -100, -20] });
      ctx.rep('Idle', { fs: null });
      ctx.rep('Idle', { fs: null });
      ctx.gc();
      expect([name, await ctx.codeOf(STARTS[name].run(ctx))]).toEqual([name, UNKNOWN]);
      expect([name, ctx.c.written]).toEqual([name, []]);
    }
    const ctx = await setup();
    ctx.rep('Idle', { fs: null });
    ctx.rep('Idle', { fs: null });
    ctx.gc();
    expect(await ctx.codeOf(ctx.jog(0.1))).toBe(null);
    await ctx.tick(50);
    ctx.ok();
    await ctx.tick(300, () => ctx.rep('Idle', { fs: null }));
    expect(await ctx.codeOf(ctx.confirmed('home'))).toBe(null);
    expect(ctx.lines()).toEqual(['$J=G91 G21 X0.1 F600', '$H']);
  });

  test('T8b (mutation M18): from the connection and after a banner, a board that never gave a whole FS: is refused, no fallback on $G alone', async () => {
    for (const fs of ['0', '0,', null]) {
      const ctx = await setup({ fs });
      expect([fs, await ctx.codeOf(ctx.jog(10))]).toEqual([fs, UNKNOWN]);
      ctx.fs = '0,0';
      ctx.rest();
      ctx.fs = fs;
      ctx.say('Grbl 1.1h [\'$\' for help]');
      ctx.rep('Idle', { wco: ctx.wco });
      ctx.rep('Home');
      ctx.rest();
      expect([fs, await ctx.codeOf(ctx.jog(10))]).toEqual([fs, UNKNOWN]);
      expect([fs, ctx.c.written]).toEqual([fs, []]);
    }
  });

  test('a $G older than 2.5 s proves nothing; a speed above 0 keeps the sentence of before', async () => {
    const ctx = await setup();
    await ctx.tick(2600, () => ctx.rep('Idle'));
    expect(await ctx.codeOf(ctx.jog(10))).toBe(UNKNOWN);
    ctx.gc();
    ctx.rep('Idle', { fs: '0,1000' });
    ctx.rep('Idle', { fs: '0,1000' });
    expect((await ctx.refused(ctx.jog(10))).code).toBe('ETOUCH_MOTION_SPINDLE_STEP');
    expect((await ctx.refused(ctx.confirmed('macro', { macroId: 'none' }))).message).toMatch(/La broche tourne encore \(1000 tr\/min\)/);
    expect(ctx.c.written).toEqual([]);
  });

  test('T19: A:S seen in a report with Ov:, then M5: a start is accepted before any Ov: report without A:', async () => {
    const ctx = await setup();
    ctx.rep('Idle', { fs: '0,8000', extra: '|Ov:100,100,100|A:S' });
    ctx.rest();
    expect(await ctx.codeOf(ctx.jog(10))).toBe(null);
    expect(ctx.lines()).toEqual(['$J=G91 G21 X10 F600']);
  });

  test('T20: in alarm, the last $G (M3) older than the alarm, FS:0,0: $H then $X are written as before', async () => {
    let ctx = await setup();
    ctx.gc('M3');
    ctx.say('ALARM:1');
    ctx.rep('Alarm');
    ctx.rep('Alarm');
    expect(await ctx.codeOf(ctx.confirmed('home'))).toBe(null);
    expect(ctx.lines()).toEqual(['$H']);
    ctx = await setup();
    ctx.gc('M3');
    ctx.say('ALARM:1');
    ctx.rep('Alarm');
    ctx.rep('Alarm');
    expect(await ctx.codeOf(ctx.confirmed('unlock'))).toBe(null);
    expect(ctx.lines()).toEqual(['$X']);
  });
});

describe('C1: the position learnt at the end of the homing cycle (§ 2.9)', () => {
  // $23=3: X and Y homed towards their negative end; found at 0, the firmware forces the origin there.
  const home = async (last) => {
    const ctx = await setup({ settings: { ...SETTINGS, 23: 3 }, at: [0, 0, 0], wco: [0, 0, 0] });
    await ctx.confirmed('home');
    ctx.now += 1100;
    ctx.rep('Home');
    ctx.say(last(ctx));
    await ctx.flush();
    // Perfect reports afterwards do not correct what was learnt.
    ctx.rest();
    return ctx;
  };

  test('T18 (mutation M28): Home, then a final Idle without X/Y/Z: homed, the convention not learnt, a step towards the edge refused; witness with MPos: learnt as before', async () => {
    let ctx = await home(() => '<Idle|FS:0,0>');
    expect(ctx.state().homed).toBe(true);
    expect(await ctx.codeOf(ctx.jog(10))).toBe('ETOUCH_MOTION_AMBIGUOUS');
    expect(ctx.lines()).toEqual(['$H']);
    ctx = await home((c) => c.line('Idle'));
    expect(ctx.state().homed).toBe(true);
    expect(await ctx.codeOf(ctx.jog(10))).toBe(null);
    expect(ctx.lines()).toEqual(['$H', '$J=G91 G21 X10 F600']);
  });
});
