/* eslint-env jest */
/* eslint-disable no-await-in-loop */ // the cases of a table run one after the other on purpose
// Lot C1 (design/plaque/C1-CONCEPTION.md § 4): the Z zero with the touch plate, the real proof of
// the work offset (D2), and the stops, which no new guard conditions. Real lines, real parser,
// whole $G exchanges; judged on the bytes written.
import { setup, disposeAll, A, B } from './support/c1-bench';

afterEach(disposeAll);

const PLATE = { thickness: 10, search: 10 };
const HOLD = '!';
const RESET = '\x18';
const CANCEL = '\x85';
// Machine Z −20, work Z −8 (offset −12): the lines of a whole cycle whose contacts are at work Z −13.
const G38_1 = 'G38.2 Z-18 F100';
const BACK = 'G0 Z-12';
const G38_2 = 'G38.2 Z-14 F25';
const G10 = 'G10 L20 P0 Z10';
const RETRACT = 'G0 Z15';
const AT = [-100, -100, -20];
const zAt = (ctx, z) => {
  ctx.m = [ctx.m[0], ctx.m[1], z];
};
// The line written last runs (`runMs` of Run reports), ends at machine Z `z`, is answered, CNCjs's
// $G exchange follows (`gc`: its spindle word, null for none), then `idles` reports at rest.
const run = async (ctx, z, { runMs = 100, gc = 'M5', idles = 2, o } = {}) => {
  await ctx.tick(runMs, () => ctx.rep('Run'));
  zAt(ctx, z);
  ctx.ok();
  if (gc) {
    ctx.gc(gc);
  }
  await ctx.tick(50 * idles, () => ctx.rep('Idle', o));
};
const launched = async (options) => {
  const ctx = await setup({ at: AT, ...options });
  await ctx.launch('zeroZ', PLATE);
  expect(ctx.lines()).toEqual([G38_1]);
  return ctx;
};
// The whole cycle from the first G38.2 written; `first` as run's options for its first line.
const cycle = async (ctx, first = {}) => {
  await run(ctx, -25, first);
  await run(ctx, -24);
  await run(ctx, -25);
  // G10 L20: the board says its new offset in its next report (work Z 10 at machine Z −25).
  ctx.wco = [ctx.wco[0], ctx.wco[1], -35];
  await run(ctx, -25, { o: { wco: ctx.wco } });
  await run(ctx, -20);
};

describe('C1, Z zero with the plate: the proofs before each line (§ 2.5)', () => {
  test('a whole cycle writes the lines of before, in order, nothing else', async () => {
    const ctx = await launched();
    await cycle(ctx);
    expect(ctx.result.ok.message).toMatch(/^Zéro Z réglé avec la plaque de 10 mm/);
    expect(ctx.c.written).toEqual([G38_1, BACK, G38_2, G10, RETRACT].map((l) => l + '\n'));
  });

  test('T13: without coordinates before the start: refused, nothing written', async () => {
    const ctx = await setup({ at: AT });
    ctx.rep('Idle', { pos: null });
    ctx.gc();
    expect(await ctx.codeOf(ctx.launch('zeroZ', PLATE))).toBe('ETOUCH_MOTION_NO_POSITION');
    expect(ctx.c.written).toEqual([]);
  });

  test('T13 (mutation M20): after the ok of the first G38.2, reports without coordinates: no line more; stopped through halt.js, no jog cancel; the work offset doubted', async () => {
    const ctx = await launched();
    await ctx.tick(100, () => ctx.rep('Run'));
    ctx.ok();
    ctx.gc();
    await ctx.tick(2700, (t) => {
      if (t % 500 === 450) {
        ctx.gc();
      }
      ctx.rep('Idle', { pos: null });
    });
    // A feed hold, then its reset once a newer report shows the machine at rest: halt.js, no jog cancel.
    expect(ctx.c.written).toEqual([G38_1 + '\n', HOLD, RESET]);
    ctx.say('Grbl 1.1h [\'$\' for help]');
    await ctx.tick(100);
    expect(ctx.result.err.code).toBe('ETOUCH_PLATE_STALE');
    expect(ctx.invalidated).toContain('zero');
  });

  test('T13: coordinates explicit but a single Idle after the ok: no line more until a second one agrees', async () => {
    const ctx = await launched();
    await ctx.tick(100, () => ctx.rep('Run'));
    zAt(ctx, -25);
    ctx.ok();
    ctx.gc();
    ctx.rep('Run');
    ctx.rep('Idle');
    await ctx.tick(200);
    expect(ctx.lines()).toEqual([G38_1]);
    ctx.rep('Idle');
    await ctx.tick(100);
    expect(ctx.lines()).toEqual([G38_1, BACK]);
  });

  test('T13c (mutation M19): the contact is read at the proven rest, not at the first Idle: the next line carries it', async () => {
    const ctx = await launched();
    await ctx.tick(100, () => ctx.rep('Run'));
    ctx.ok();
    ctx.rep('Run');
    // A first Idle at work Z −11 (machine −23), then two that agree at work Z −13.2 (machine −25.2).
    zAt(ctx, -23);
    ctx.rep('Idle');
    await ctx.tick(100);
    zAt(ctx, -25.2);
    ctx.rep('Idle');
    await ctx.tick(100);
    ctx.rep('Idle');
    ctx.gc();
    await ctx.tick(100);
    expect(ctx.lines()).toEqual([G38_1, 'G0 Z-12.2']);
  });

  test('T13p (mutations M21p, M20): the machine moved while the $G was waited for: neither the retract nor the G10 is written, the probe stops, the work offset doubted', async () => {
    // Before the retract: contact proven at work Z −13, then the machine is found at work Z +10.
    let ctx = await launched();
    await run(ctx, -25, { gc: null });
    expect(ctx.lines()).toEqual([G38_1]);
    zAt(ctx, -2);
    ctx.rep('Idle');
    ctx.rep('Idle');
    ctx.gc();
    await ctx.tick(100);
    // `G0` alone, without an axis word, only takes G38.2 out of the motion mode (as before C1).
    expect(ctx.lines()).toEqual([G38_1, 'G0']);
    expect(ctx.result.err.code).toBe('ETOUCH_PLATE_POSITION');
    expect(ctx.invalidated).toContain('zero');
    // Before the G10 L20.
    ctx = await launched();
    await run(ctx, -25);
    await run(ctx, -24);
    await run(ctx, -25, { gc: null });
    zAt(ctx, -2);
    ctx.rep('Idle');
    ctx.rep('Idle');
    ctx.gc();
    await ctx.tick(100);
    expect(ctx.lines()).toEqual([G38_1, BACK, G38_2, 'G0']);
    expect(ctx.result.err.code).toBe('ETOUCH_PLATE_POSITION');
    // Another work coordinate system in the $G that was waited for.
    ctx = await launched();
    await run(ctx, -25, { gc: null });
    ctx.gc('M5', { wcs: 'G55' });
    await ctx.tick(100, () => ctx.rep('Idle'));
    expect(ctx.lines()).toEqual([G38_1, 'G0']);
    expect(ctx.result.err.code).toBe('ETOUCH_PLATE_POSITION');
    // The work offset changed in the same G54 (a WCO: said meanwhile): the work position is elsewhere.
    ctx = await launched();
    await run(ctx, -25, { gc: null });
    ctx.rep('Idle', { wco: [-105, -105, -30] });
    ctx.rep('Idle');
    ctx.gc();
    await ctx.tick(100);
    expect(ctx.lines()).toEqual([G38_1, 'G0']);
    expect(ctx.result.err.code).toBe('ETOUCH_PLATE_POSITION');
  });

  test('T13p, without coordinates (mutations M20 with M21p): the rest proven, then the coordinates disappear while the $G is waited for: no line when it comes', async () => {
    const ctx = await launched();
    await run(ctx, -25, { gc: null });
    ctx.rep('Idle', { pos: null });
    ctx.rep('Idle', { pos: null });
    ctx.gc();
    await ctx.tick(300, () => ctx.rep('Idle', { pos: null }));
    expect(ctx.lines()).toEqual([G38_1]);
    await ctx.tick(2500, (t) => {
      if (t % 500 === 0) {
        ctx.gc();
      }
      ctx.rep('Idle', { pos: null });
    });
    expect(ctx.result.err.code).toBe('ETOUCH_PLATE_STALE');
    expect(ctx.lines().filter((l) => l !== 'G0')).toEqual([G38_1]);
  });

  test('T11, plate (mutations M12, M27): no $G after the ok of a line: no next line, then the probe stops (spindle); a $G grown old does not count', async () => {
    let ctx = await launched();
    await run(ctx, -25, { gc: null });
    await ctx.tick(2000, () => ctx.rep('Idle'));
    expect([ctx.lines(), ctx.result]).toEqual([[G38_1], null]);
    await ctx.tick(700, () => ctx.rep('Idle'));
    expect(ctx.result.err.code).toBe('ETOUCH_PLATE_SPINDLE');
    expect(ctx.c.written).toEqual([G38_1 + '\n', 'G0\n']);
    // A $G M5 right after the ok of a line that then runs 3 s: old at its end.
    ctx = await launched();
    await run(ctx, -25);
    expect(ctx.lines()).toEqual([G38_1, BACK]);
    ctx.ok();
    ctx.gc();
    await ctx.tick(3000, () => ctx.rep('Run'));
    zAt(ctx, -24);
    await ctx.tick(200, () => ctx.rep('Idle'));
    expect(ctx.lines()).toEqual([G38_1, BACK]);
    ctx.gc();
    await ctx.tick(100, () => ctx.rep('Idle'));
    expect(ctx.lines()).toEqual([G38_1, BACK, G38_2]);
  });

  test('T7s, T10, T12, plate (mutation M16): during a G38.2, FS: missing or the position missing for 2.6 s, or a $G M3: stopped through halt.js, no jog cancel; a single such report: nothing', async () => {
    const cases = [
      ['FS: missing', (ctx) => ctx.tick(2600, () => ctx.rep('Run', { fs: null })), 'ETOUCH_PLATE_SPINDLE'],
      ['position missing', (ctx) => ctx.tick(2600, () => ctx.rep('Run', { pos: null })), 'ETOUCH_PLATE_STALE'],
      ['$G M3 then M5', async (ctx) => {
        ctx.gc('M3');
        ctx.gc('M5');
        await ctx.tick(100, () => ctx.rep('Run'));
      }, 'ETOUCH_PLATE_SPINDLE']
    ];
    for (const [name, act, code] of cases) {
      const ctx = await launched();
      await ctx.tick(200, () => ctx.rep('Run'));
      ctx.rep('Run', { fs: null });
      ctx.rep('Run', { pos: null });
      await ctx.tick(200, () => ctx.rep('Run'));
      expect([name, ctx.c.written]).toEqual([name, [G38_1 + '\n']]);
      await act(ctx);
      expect([name, ctx.c.written]).toEqual([name, [G38_1 + '\n', HOLD]]);
      await ctx.tick(200, () => ctx.rep('Hold:0'));
      ctx.say('Grbl 1.1h [\'$\' for help]');
      await ctx.tick(100);
      expect([name, ctx.result.err.code, ctx.c.written.includes(CANCEL)]).toEqual([name, code, false]);
    }
  });

  test('T13g: a long G38.2 (20 s) without any $G during the descent, a $G reply in flight at the start: no stop, the cycle goes to its end', async () => {
    const ctx = await setup({ at: AT });
    // CNCjs's flag: its $G report is parsed, its ok still on its way when the G38.2 is written.
    ctx.c.actionMask.queryParserState.reply = true;
    await ctx.launch('zeroZ', PLATE);
    ctx.ok();
    ctx.c.actionMask.queryParserState.reply = false;
    await cycle(ctx, { runMs: 20000 });
    expect(ctx.result.ok.message).toMatch(/^Zéro Z réglé/);
    expect(ctx.c.written).toEqual([G38_1, BACK, G38_2, G10, RETRACT].map((l) => l + '\n'));
  });
});

describe('C1, Z zero with the plate during a tool change pause (M6)', () => {
  // A program started, then held by its M6 with the machine at rest.
  const paused = async () => {
    const ctx = await setup({ at: AT });
    await ctx.load();
    await ctx.confirmed('start', { revision: ctx.state().revision });
    ctx.c.workflow.state = 'paused';
    ctx.c.sender.state = { ...ctx.c.sender.state, holdReason: { data: 'M6' } };
    ctx.c.written.length = 0;
    ctx.rest();
    return ctx;
  };

  test('T13g, M6: a long G38.2 without any $G during the descent: the cycle goes to its end, the program may be resumed', async () => {
    const ctx = await paused();
    await ctx.launch('zeroZ', PLATE);
    await cycle(ctx, { runMs: 20000 });
    // The motion mode of the paused program is sent back.
    await run(ctx, -20);
    expect(ctx.result.ok.message).toMatch(/^Zéro Z réglé/);
    expect(ctx.c.written).toEqual([G38_1, BACK, G38_2, G10, RETRACT, 'G0'].map((l) => l + '\n'));
    ctx.rest();
    expect(await ctx.codeOf(ctx.req('prepare', { operation: 'resume', revision: ctx.state().revision }))).toBe(null);
  });

  test('§ 4.1 point 6: a $G reply really lost during the pause: the probe stops between two lines, the resume is refused, Arrêter still ends the program', async () => {
    const ctx = await paused();
    await ctx.launch('zeroZ', PLATE);
    await run(ctx, -25, { runMs: 5000, gc: null });
    // Nothing stops during the descent; the wait for the $G starts once the line is over.
    expect([ctx.lines(), ctx.result]).toEqual([[G38_1], null]);
    await ctx.tick(2700, () => ctx.rep('Idle'));
    expect(ctx.result.err.code).toBe('ETOUCH_PLATE_SPINDLE');
    expect(ctx.lines()).toEqual([G38_1, 'G0']);
    const state = ctx.state();
    expect([state.canResume, state.canStop]).toEqual([false, true]);
    expect(state.resumeReason).toMatch(/Palpage échoué pendant la pause/);
    await ctx.req('stop');
    expect(ctx.c.commands.map((cmd) => cmd[0])).toContain('gcode:stop');
  });
});

describe('C1: the stops stay free of every new guard (T16)', () => {
  test('the snapshot is whole without coordinates; the arrows are disabled with their reason; Pause, Arrêter and Arrêter la broche answer from a device without the hand', async () => {
    const ctx = await setup();
    await ctx.jog(50);
    ctx.ok();
    await ctx.tick(200, () => ctx.rep('Jog', { pos: null, fs: null }));
    const state = ctx.state();
    expect(state.motion).toMatchObject({ canJog: false });
    expect(state.canStop).toBe(true);
    expect((await ctx.req('motion', { operation: 'jog-stop' }, B)).message).toMatch(/0x85/);
    expect(ctx.c.written).toEqual(['$J=G91 G21 X50 F600\n', CANCEL]);
    const idle = await setup();
    await idle.quiet(500, 'Idle', { pos: null, fs: null });
    const quiet = idle.state();
    expect([quiet.motion.canJog, quiet.refusals.jog.code, quiet.canFrame, quiet.canSpindleStop]).toEqual([false, 'ETOUCH_MOTION_NO_POSITION', false, true]);
    expect(Object.values(quiet.motion.continuousReason).every((text) => typeof text === 'string' && text.length > 0)).toBe(true);
    expect((await idle.req('spindleStop', {}, B)).message).toBe('Arrêt broche (M5) envoyé.');
    expect(idle.c.written).toEqual(['M5\n']);
  });

  test('during the wait for a proof between two lines: Pause from another device ends the probe, nothing is written after it', async () => {
    const ctx = await launched();
    await run(ctx, -25, { gc: null });
    expect(ctx.state()).toMatchObject({ probing: true, canPause: true, canStop: true, canSpindleStop: true });
    expect((await ctx.req('pause', {}, B)).message).toMatch(/Palpage interrompu/);
    ctx.gc();
    await ctx.tick(500, () => ctx.rep('Idle'));
    expect(ctx.lines()).toEqual([G38_1, 'G0']);
    expect(ctx.c.written).not.toContain(CANCEL);
    expect(ctx.state().probing).toBe(false);
  });

  test('§ 4.1 point 5, Arrêter la broche between two lines of the plate (at rest, nothing in flight): the probe stops and the board is reset; no M5 joins its lines', async () => {
    const ctx = await launched();
    await run(ctx, -25, { gc: null });
    expect(ctx.lines()).toEqual([G38_1]);
    const answer = await ctx.req('spindleStop', {}, B);
    expect(answer.message).toMatch(/réinitialisation de la carte demandée/);
    expect(answer.message).not.toMatch(/M5|broche arrêtée/i);
    expect(ctx.c.written).toEqual([G38_1 + '\n', RESET]);
    ctx.say('Grbl 1.1h [\'$\' for help]');
    await ctx.tick(200, () => ctx.rep('Alarm'));
    expect(ctx.c.written).toEqual([G38_1 + '\n', RESET]);
    expect(ctx.state().probing).toBe(false);
  });

  test('§ 4.1 point 5, a $G M3 seen during a G38.2 (FS 0): the supervisor stops the probe (feed hold); Arrêter la broche right after adds no M5 and says no « M5 sent »; the reset follows', async () => {
    const ctx = await launched();
    await ctx.tick(200, () => ctx.rep('Run'));
    ctx.gc('M3');
    await ctx.tick(100, () => ctx.rep('Run'));
    expect(ctx.c.written).toEqual([G38_1 + '\n', HOLD]);
    const answer = await ctx.req('spindleStop', {}, B);
    expect(answer.message).toMatch(/réinitialisation de la carte demandée/);
    expect(answer.message).not.toMatch(/M5|broche arrêtée/i);
    await ctx.tick(200, () => ctx.rep('Hold:0'));
    expect(ctx.c.written).toEqual([G38_1 + '\n', HOLD, RESET]);
  });

  test('§ 4.1 point 5, Arrêter la broche during a G38.2: a feed hold then the reset, never an M5 nor a jog cancel; the same button after the supervisor stopped the probe at rest writes the ordinary M5', async () => {
    let ctx = await launched();
    await ctx.tick(200, () => ctx.rep('Run'));
    await ctx.req('spindleStop', {}, A);
    expect(ctx.c.written).toEqual([G38_1 + '\n', HOLD]);
    await ctx.tick(200, () => ctx.rep('Hold:0'));
    expect(ctx.c.written).toEqual([G38_1 + '\n', HOLD, RESET]);
    // Stopped by the supervisor between two lines (no $G): nothing of the probe is left.
    ctx = await launched();
    await run(ctx, -25, { gc: null });
    await ctx.tick(2700, () => ctx.rep('Idle'));
    expect(ctx.result.err.code).toBe('ETOUCH_PLATE_SPINDLE');
    expect((await ctx.req('spindleStop', {}, A)).message).toBe('Arrêt broche (M5) envoyé.');
    expect(ctx.lines()).toEqual([G38_1, 'G0', 'M5']);
  });

  test('a banner, or the service stopped, during the wait for a proof: no line afterwards, even once the proof comes', async () => {
    let ctx = await launched();
    await run(ctx, -25, { gc: null });
    ctx.say('Grbl 1.1h [\'$\' for help]');
    ctx.rep('Idle', { wco: ctx.wco });
    ctx.rep('Idle');
    ctx.gc();
    await ctx.tick(500, () => ctx.rep('Idle'));
    expect(ctx.c.written).toEqual([G38_1 + '\n']);
    ctx = await launched();
    await run(ctx, -25, { gc: null });
    ctx.service.dispose();
    ctx.gc();
    ctx.rep('Idle');
    await ctx.tick(500);
    expect(ctx.c.written).toEqual([G38_1 + '\n']);
  });
});

describe('C1 with the real proof of the work offset (D2)', () => {
  // Reports that carry the offset until the proof holds.
  const proven = async (options) => {
    const ctx = await setup({ realD2: true, ...options });
    for (let i = 0; i < 60 && ctx.state().workOffset.state !== 'proven'; i += 1) {
      await ctx.tick(50, () => {
        if (i % 10 === 9) {
          ctx.gc();
        }
        ctx.rep('Idle', { wco: ctx.wco });
      });
    }
    expect(ctx.state().workOffset.state).toBe('proven');
    ctx.c.written.length = 0;
    return ctx;
  };

  test('T8w (mutation M30): a stray WPos: beside the real MPos:, the offset proven on WCO 0: refused, no G38.2; witness without the stray field: G38.2 Z-30', async () => {
    let ctx = await proven({ at: [1, 2, -20], wco: [0, 0, 0] });
    const stray = '<Idle|MPos:1.000,2.000,-20.000|junk:WPos:1.000,2.000,-40.000|FS:0,0>';
    ctx.say(stray, stray);
    ctx.gc();
    expect(ctx.state().workOffset.state).toBe('proven');
    expect(await ctx.codeOf(ctx.launch('zeroZ', PLATE))).toBe('ETOUCH_MOTION_NO_POSITION');
    expect(ctx.c.written).toEqual([]);
    ctx = await proven({ at: [1, 2, -20], wco: [0, 0, 0] });
    ctx.rest();
    await ctx.launch('zeroZ', PLATE);
    expect(ctx.lines()).toEqual(['G38.2 Z-30 F100']);
  });

  test('T8w, symmetric: a board in WPos: with a stray MPos:: a step, a framing and the plate are refused', async () => {
    const ctx = await proven({ at: [-100, -100, -20], wco: [0, 0, 0], wpos: true });
    await ctx.load();
    const stray = '<Idle|WPos:-100.000,-100.000,-20.000|junk:MPos:-100.000,-100.000,-40.000|FS:0,0>';
    ctx.say(stray, stray);
    ctx.gc();
    expect(await ctx.codeOf(ctx.jog(10))).toBe('ETOUCH_MOTION_NO_POSITION');
    expect(await ctx.codeOf(ctx.machine('frame-prepare'))).toBe('ETOUCH_MOTION_NO_POSITION');
    expect(await ctx.codeOf(ctx.launch('zeroZ', PLATE))).toBe('ETOUCH_MOTION_NO_POSITION');
    expect(ctx.c.written).toEqual([]);
    // Witness: the same board without the stray field moves.
    ctx.rest();
    expect(await ctx.codeOf(ctx.jog(10))).toBe(null);
    expect(ctx.lines()).toEqual(['$J=G91 G21 X10 F600']);
  });

  test('T17: an explicit WCO: that differs, in a report without X/Y/Z, still doubts the proof', async () => {
    const ctx = await proven({ at: AT });
    ctx.say('<Idle|FS:0,0|WCO:1.000,2.000,3.000>');
    await ctx.tick(50);
    expect(ctx.state().workOffset.state).not.toBe('proven');
  });

  test('a framing on the real proof: a position that goes missing ends it stale and leaves the proof as it is; a position off doubts it', async () => {
    let ctx = await proven();
    await ctx.load();
    ctx.rest();
    await ctx.frame();
    ctx.ok();
    await ctx.tick(2800, (t) => {
      if (t % 500 === 0) {
        ctx.gc();
      }
      ctx.rep('Idle', { pos: null });
    });
    expect(ctx.state().motion.lastFrame.code).toBe('ETOUCH_FRAME_STALE');
    expect(ctx.state().workOffset.state).toBe('proven');
    ctx = await proven();
    await ctx.load();
    ctx.rest();
    await ctx.frame();
    ctx.ok();
    ctx.gc();
    zAt(ctx, -70);
    await ctx.tick(150, () => ctx.rep('Idle'));
    expect(ctx.state().motion.lastFrame.code).toBe('ETOUCH_FRAME_POSITION');
    expect(ctx.state().workOffset.state).not.toBe('proven');
  });
});
