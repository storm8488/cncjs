/* eslint-env jest */
/* eslint-disable no-await-in-loop */ // the cases of a table run one after the other on purpose
// Lot C1 (design/plaque/C1-CONCEPTION.md § 4): the moves in progress, steps, continuous jogs and
// framings. Every report is a line read by the real parser, every `[GC:…]` is followed by its own
// `ok`, the `ok` of our lines comes apart; every test is judged on the bytes written.
import { setup, disposeAll } from './support/c1-bench';

afterEach(disposeAll);

const CANCEL = '\x85';
const Z_LINE = '$J=G91 G21 Z55 F300';
const XY_1 = '$J=G90 G21 X10 Y20 F600';
const lastFrame = (ctx) => ctx.state().motion.lastFrame || {};
const framing = (ctx) => !!ctx.state().motion.frame;

// The line written last is answered (`ok`), CNCjs's $G exchange follows (`gc`: its spindle word,
// null for none), the machine is reported in Jog, then at `to` at rest `idles` times, 50 ms apart.
const run = async (ctx, to, { gc = 'M5', idles = 3 } = {}) => {
  ctx.ok();
  if (gc) {
    ctx.gc(gc);
  }
  ctx.rep('Jog');
  ctx.m = to.slice();
  await ctx.tick(50 * idles, () => ctx.rep('Idle'));
};
const startFrame = async (options) => {
  const ctx = await setup(options);
  await ctx.load();
  await ctx.frame();
  return ctx;
};
// A CNC framing whose M5 is proven and whose Z line (55 mm, 11 s) is just written.
const inZLine = async () => {
  const ctx = await startFrame();
  await run(ctx, ctx.m);
  expect(ctx.lines()).toEqual(['M5', Z_LINE]);
  ctx.ok();
  ctx.gc();
  return ctx;
};
// `ms` of Jog reports, 50 ms apart, the machine rising; `o` as ctx.line.
const jogging = (ctx, ms, o) => ctx.tick(ms, () => {
  ctx.m[2] += 0.25;
  ctx.rep('Jog', o);
});

describe('C1, CNC framing: the proofs between two lines', () => {
  test('T3 (finding 1d): after the ok of M5, only reports without coordinates: M5 alone, stale, the jog cancel, the work offset not doubted', async () => {
    const ctx = await startFrame();
    ctx.ok();
    await ctx.quiet(3000, 'Idle', { pos: null });
    expect(ctx.lines()).toEqual(['M5']);
    expect(lastFrame(ctx)).toMatchObject({ result: 'cancelled', code: 'ETOUCH_FRAME_STALE' });
    expect(ctx.c.written).toEqual(['M5\n', CANCEL]);
    expect(ctx.invalidated).not.toContain('frame');
  });

  test('T4 (Astra\'s counter-sequence): Z high said once, then a report without coordinates and a $G M5: no X/Y line; then two reports at Z low: position, the work offset doubted', async () => {
    const ctx = await startFrame({ at: [-100, -100, -4] });
    ctx.ok();
    ctx.rep('Idle');
    ctx.rep('Idle', { pos: null });
    ctx.gc();
    await ctx.tick(300, () => ctx.rep('Idle', { pos: null }));
    expect(ctx.lines()).toEqual(['M5']);
    expect(framing(ctx)).toBe(true);
    ctx.m[2] = -70;
    ctx.rep('Idle');
    ctx.rep('Idle');
    await ctx.tick(50);
    expect(lastFrame(ctx)).toMatchObject({ code: 'ETOUCH_FRAME_POSITION', params: { axis: 'Z' } });
    expect(ctx.lines()).toEqual(['M5']);
    expect(ctx.invalidated).toContain('frame');
  });

  test('T4c (mutation M5): after the ok of a line, a $G M5, a Jog then a single Idle at the target: no next line; a second Idle frees it', async () => {
    const ctx = await inZLine();
    ctx.rep('Jog', { pos: [-100, -100, -30] });
    ctx.m = [-100, -100, -5];
    ctx.rep('Idle');
    await ctx.tick(150);
    expect(ctx.lines()).toEqual(['M5', Z_LINE]);
    expect(framing(ctx)).toBe(true);
    ctx.rep('Idle');
    await ctx.tick(50);
    expect(ctx.lines()).toEqual(['M5', Z_LINE, XY_1]);
  });

  test('T4c, arrival (mutation M5): a first Idle 0.2 mm short of the target, then two that agree on it: the arrival is judged at the proven rest, the framing goes on', async () => {
    const ctx = await inZLine();
    ctx.rep('Jog', { pos: [-100, -100, -30] });
    ctx.rep('Idle', { pos: [-100, -100, -5.2] });
    await ctx.tick(100);
    ctx.m = [-100, -100, -5];
    ctx.rep('Idle');
    await ctx.tick(50);
    ctx.rep('Idle');
    await ctx.tick(50);
    expect(ctx.lines()).toEqual(['M5', Z_LINE, XY_1]);
    expect(ctx.invalidated).not.toContain('frame');
  });

  test('§ 4.1 point 4: an arrival already validated, then a Jog and a single Idle at the target while the $G is waited for: no line', async () => {
    const ctx = await startFrame();
    ctx.ok();
    await ctx.tick(150, () => ctx.rep('Idle'));
    // Arrived and validated; the $G after the ok has not come yet.
    expect(ctx.lines()).toEqual(['M5']);
    ctx.rep('Jog');
    ctx.rep('Idle');
    ctx.gc();
    await ctx.tick(50);
    expect(ctx.lines()).toEqual(['M5']);
    ctx.rep('Idle');
    await ctx.tick(50);
    expect(ctx.lines()).toEqual(['M5', Z_LINE]);
  });

  test('T4h (mutation M6): the safe height alone: M5 arrived at Z −5.005, two reports at rest at −5.054 (inside the arrival, under the safe height): no X/Y', async () => {
    const ctx = await startFrame({ at: [-100, -100, -5.005] });
    ctx.ok();
    ctx.gc();
    ctx.m[2] = -5.054;
    await ctx.tick(100, () => ctx.rep('Idle'));
    expect(lastFrame(ctx)).toMatchObject({ code: 'ETOUCH_FRAME_POSITION', params: { axis: 'Z', reported: '-5.054' } });
    expect(ctx.lines()).toEqual(['M5']);
  });

  test('T9 (witness 2c): FS:0,1000 after the ok of M5: stopped (spindle), as before', async () => {
    const ctx = await startFrame();
    ctx.ok();
    ctx.rep('Idle', { fs: '0,1000' });
    await ctx.tick(50);
    expect(lastFrame(ctx)).toMatchObject({ code: 'ETOUCH_FRAME_STATE', params: { state: 'spindle' } });
    expect(ctx.c.written).toEqual(['M5\n', CANCEL]);
  });

  test('T10 (mutation M13): a $G M3 then a $G M5 between two steps of the watch: stopped (spindle)', async () => {
    const ctx = await inZLine();
    await jogging(ctx, 200);
    ctx.gc('M3');
    ctx.gc('M5');
    await jogging(ctx, 50);
    expect(lastFrame(ctx)).toMatchObject({ code: 'ETOUCH_FRAME_STATE', params: { state: 'spindle' } });
    expect(ctx.c.written.slice(-1)).toEqual([CANCEL]);
    expect(ctx.lines()).toEqual(['M5', Z_LINE]);
  });

  test('T11 (mutation M12): no $G after the ok of M5, reports perfect: no next line, stopped at the end of the wait', async () => {
    const ctx = await startFrame();
    ctx.ok();
    await ctx.tick(2400, () => ctx.rep('Idle'));
    expect([ctx.lines(), framing(ctx)]).toEqual([['M5'], true]);
    // The wait of 2.5 s runs from the moment the line was seen over (two reports after its ok).
    await ctx.tick(400, () => ctx.rep('Idle'));
    expect(lastFrame(ctx)).toMatchObject({ code: 'ETOUCH_FRAME_STATE', params: { state: 'spindle' } });
    expect(ctx.c.written).toEqual(['M5\n', CANCEL]);
  });

  test('T11, variants: a $G reply already in flight when the line is sent, or received before its ok, does not count', async () => {
    // CNCjs's flag: the $G report is parsed, its ok is on its way when M5 is written.
    let ctx = await setup();
    await ctx.load();
    ctx.c.actionMask.queryParserState.reply = true;
    await ctx.frame();
    ctx.ok();
    ctx.c.actionMask.queryParserState.reply = false;
    await ctx.tick(300, () => ctx.rep('Idle'));
    // That ok was the $G's: M5 is not answered yet.
    expect(ctx.state().motion.frame.index).toBe(1);
    ctx.ok();
    await ctx.tick(500, () => ctx.rep('Idle'));
    expect(ctx.lines()).toEqual(['M5']);
    ctx.gc();
    await ctx.tick(50, () => ctx.rep('Idle'));
    expect(ctx.lines()).toEqual(['M5', Z_LINE]);
    // The $G report and its ok come between the write of M5 and the ok of M5.
    ctx = await startFrame();
    ctx.gc();
    ctx.ok();
    await ctx.tick(500, () => ctx.rep('Idle'));
    expect(ctx.lines()).toEqual(['M5']);
    ctx.gc();
    await ctx.tick(50, () => ctx.rep('Idle'));
    expect(ctx.lines()).toEqual(['M5', Z_LINE]);
  });

  test('T11, variant (mutation M27): a $G M5 right after the ok of a long jog, none since: at the arrival no next line before a new $G M5', async () => {
    const ctx = await inZLine();
    await jogging(ctx, 3000);
    ctx.m = [-100, -100, -5];
    await ctx.tick(150, () => ctx.rep('Idle'));
    expect([ctx.lines(), framing(ctx)]).toEqual([['M5', Z_LINE], true]);
    ctx.gc();
    await ctx.tick(50, () => ctx.rep('Idle'));
    expect(ctx.lines()).toEqual(['M5', Z_LINE, XY_1]);
  });

  test('T12 (mutation M7): reports without MPos: during a Jog for 2.6 s: stale, the jog cancel; a single one: nothing', async () => {
    const ctx = await inZLine();
    await jogging(ctx, 200);
    await jogging(ctx, 50, { pos: null });
    await jogging(ctx, 200);
    expect([framing(ctx), ctx.c.written.includes(CANCEL)]).toEqual([true, false]);
    await jogging(ctx, 2600, { pos: null });
    expect(lastFrame(ctx)).toMatchObject({ code: 'ETOUCH_FRAME_STALE' });
    expect(ctx.c.written.slice(-1)).toEqual([CANCEL]);
    expect(ctx.invalidated).not.toContain('frame');
  });

  test('T12b: a Jog of 5 s with whole FS: and no new $G, then a single report without FS:: the framing goes on', async () => {
    const ctx = await inZLine();
    await jogging(ctx, 5000);
    await jogging(ctx, 50, { fs: null });
    await jogging(ctx, 500);
    expect([framing(ctx), ctx.c.written.includes(CANCEL)]).toEqual([true, false]);
  });

  test('T7s, framing (mutation M16): FS: alone missing for 2.6 s during a line: stopped (spindle)', async () => {
    const ctx = await inZLine();
    await jogging(ctx, 2600, { fs: null });
    expect(lastFrame(ctx)).toMatchObject({ code: 'ETOUCH_FRAME_STATE', params: { state: 'spindle' } });
    expect(ctx.c.written.slice(-1)).toEqual([CANCEL]);
  });

  test('T19, during a sequence: A:S in a report stops it', async () => {
    const ctx = await inZLine();
    await jogging(ctx, 100);
    await jogging(ctx, 50, { extra: '|Ov:100,100,100|A:S' });
    expect(lastFrame(ctx)).toMatchObject({ code: 'ETOUCH_FRAME_STATE', params: { state: 'spindle' } });
  });

  test('T14: a whole framing on reports at 5 Hz and $G at 2 Hz writes the lines of before, in order; the journal notes the reports and the wait of each line', async () => {
    const ctx = await startFrame();
    const targets = [[-100, -100, -60], [-100, -100, -5], [-95, -85, -5], [-45, -85, -5], [-45, -55, -5], [-95, -55, -5], [-95, -85, -5], [-100, -100, -5]];
    for (const to of targets) {
      ctx.ok();
      ctx.rep('Jog');
      ctx.m = to.slice();
      // Reports every 200 ms, the $G exchange every 500 ms.
      await ctx.tick(1000, (t) => {
        if (t % 500 === 250) {
          ctx.gc();
        }
        if (t % 200 === 0) {
          ctx.rep('Idle');
        }
      });
    }
    expect(lastFrame(ctx)).toMatchObject({ result: 'ended' });
    expect(ctx.lines()).toEqual(['M5', Z_LINE, XY_1, '$J=G90 G21 X60 Y20 F600', '$J=G90 G21 X60 Y50 F600', '$J=G90 G21 X10 Y50 F600', '$J=G90 G21 X10 Y20 F600', '$J=G90 G21 X5 Y5 F600']);
    expect(ctx.c.written).not.toContain(CANCEL);
    const entry = ctx.history.filter((e) => e.event === 'frame').pop();
    expect(entry.reports).toMatchObject({ noXyz: 0, noFs: 0 });
    expect(entry.reports.reports).toBeGreaterThan(40);
    expect(entry.waits).toHaveLength(7);
    entry.waits.forEach((ms) => expect(ms).toBeLessThanOrEqual(500));
  });

  test('T14, 1 Hz: reports once a second: the framing still goes from M5 to its Z line', async () => {
    const ctx = await startFrame();
    ctx.ok();
    await ctx.tick(2000, (t) => {
      if (t % 500 === 0) {
        ctx.gc();
      }
      if (t % 1000 === 950) {
        ctx.rep('Idle');
      }
    });
    expect(ctx.lines()).toEqual(['M5', Z_LINE]);
  });
});

describe('C1, a step and a continuous jog in progress', () => {
  const STEP = '$J=G91 G21 X50 F600';
  const moves = {
    step: async (ctx) => {
      await ctx.jog(50);
      return () => {};
    },
    continuous: async (ctx) => {
      const { jogId } = await ctx.hold('X', 1);
      // The device holds: a keepalive every 100 ms.
      return (t) => {
        if (t % 100 === 0) {
          ctx.req('motion', { operation: 'jog-keepalive', jogId }).catch(() => {});
        }
      };
    }
  };
  const moving = (ctx, keep, ms, o, before = () => {}) => ctx.tick(ms, (t) => {
    keep(t);
    before(t);
    ctx.m[0] += 0.5;
    ctx.rep('Jog', o);
  });

  test.each(Object.keys(moves))('T12 (mutations M8, M9), %s: reports without MPos: for 2.6 s: jog cancel (stale); a single one: nothing', async (name) => {
    const ctx = await setup();
    const keep = await moves[name](ctx);
    ctx.ok();
    await moving(ctx, keep, 200);
    await moving(ctx, keep, 50, { pos: null });
    await moving(ctx, keep, 200);
    expect([name, ctx.c.written.length]).toEqual([name, 1]);
    await moving(ctx, keep, 2600, { pos: null });
    expect([name, ctx.c.written[1], ctx.state().motion.lastJog.reason]).toEqual([name, CANCEL, 'stale']);
  });

  test.each(Object.keys(moves))('T7s (mutation M16), %s: FS: alone missing for 2.6 s: jog cancel (spindle proof); a single report without FS:: nothing', async (name) => {
    const ctx = await setup();
    const keep = await moves[name](ctx);
    ctx.ok();
    await moving(ctx, keep, 200);
    await moving(ctx, keep, 50, { fs: null });
    await moving(ctx, keep, 200);
    expect([name, ctx.c.written.length]).toEqual([name, 1]);
    await moving(ctx, keep, 2600, { fs: null });
    expect([name, ctx.c.written[1], ctx.state().motion.lastJog.reason]).toEqual([name, CANCEL, 'spindleProof']);
  });

  test.each(Object.keys(moves))('T10 (mutation M13), %s: a $G M3 then a $G M5 between two steps of the watch: jog cancel', async (name) => {
    const ctx = await setup();
    const keep = await moves[name](ctx);
    ctx.ok();
    await moving(ctx, keep, 200);
    ctx.gc('M3');
    ctx.gc('M5');
    await moving(ctx, keep, 50);
    expect([name, ctx.c.written[1], ctx.state().motion.lastJog.reason]).toEqual([name, CANCEL, 'spindleProof']);
  });

  test('a step of 0.1 mm keeps its exception: the spindle commanded (M3) does not stop it', async () => {
    const ctx = await setup();
    ctx.rep('Idle');
    ctx.rep('Idle');
    ctx.gc('M3');
    await ctx.jog(0.1);
    ctx.ok();
    await ctx.tick(300, () => ctx.rep('Jog', { fs: '600,8000' }));
    expect(ctx.c.written).toEqual(['$J=G91 G21 X0.1 F600\n']);
    expect(STEP).toMatch(/X50/);
  });
});

describe('C1, laser framing', () => {
  const L1 = '$J=G90 G21 X10 Y20 F1000';
  const L2 = '$J=G90 G21 X60 Y20 F1000';
  const inFirstLine = async () => {
    const ctx = await startFrame({ laser: true });
    await run(ctx, ctx.m);
    expect(ctx.lines()).toEqual(['M5', L1]);
    ctx.ok();
    ctx.gc();
    return ctx;
  };

  test('§ 3.1: a laser at rest in M4 (dynamic power, FS:…,0) is not refused its framing: M5 first, then its proof', async () => {
    const ctx = await setup({ laser: true });
    ctx.rep('Idle');
    ctx.rep('Idle');
    ctx.gc('M4');
    await ctx.load();
    await ctx.frame();
    expect(ctx.lines()).toEqual(['M5']);
    // The $G still says M4 after the ok: the next line waits.
    ctx.ok();
    ctx.gc('M4');
    await ctx.tick(300, () => ctx.rep('Idle'));
    expect(ctx.lines()).toEqual(['M5']);
    ctx.gc('M5');
    await ctx.tick(50, () => ctx.rep('Idle'));
    expect(ctx.lines()).toEqual(['M5', L1]);
  });

  test('T4c, laser (mutation M11): a single Idle at the target after the ok of a line: no next line; a second one frees it', async () => {
    const ctx = await inFirstLine();
    ctx.rep('Jog');
    ctx.m = [-95, -85, -60];
    ctx.rep('Idle');
    await ctx.tick(150);
    expect(ctx.lines()).toEqual(['M5', L1]);
    ctx.rep('Idle');
    await ctx.tick(50);
    expect(ctx.lines()).toEqual(['M5', L1, L2]);
  });

  test('T12, laser (mutation M10): reports without MPos: during a Jog for 2.6 s: jog cancel (stale); T7s: FS: missing: jog cancel (spindle proof)', async () => {
    let ctx = await inFirstLine();
    await ctx.tick(2600, () => ctx.rep('Jog', { pos: null }));
    expect([ctx.c.written.slice(-1), lastFrame(ctx).reason]).toEqual([[CANCEL], 'stale']);
    ctx = await inFirstLine();
    await ctx.tick(50, () => ctx.rep('Jog', { fs: null }));
    expect(ctx.c.written).not.toContain(CANCEL);
    await ctx.tick(2600, () => ctx.rep('Jog', { fs: null }));
    expect([ctx.c.written.slice(-1), lastFrame(ctx).reason]).toEqual([[CANCEL], 'spindleProof']);
  });

  test('T11, laser: no $G M5 after the ok of a line: no next line, cancelled at the end of the wait', async () => {
    const ctx = await startFrame({ laser: true });
    ctx.ok();
    await ctx.tick(2400, () => ctx.rep('Idle'));
    expect(ctx.lines()).toEqual(['M5']);
    // The wait of 2.5 s runs from the moment the line was seen over (two reports after its ok).
    await ctx.tick(400, () => ctx.rep('Idle'));
    expect([ctx.c.written, lastFrame(ctx).reason]).toEqual([['M5\n', CANCEL], 'spindleProof']);
  });
});
