// Display-only duration of the exact loaded program. The travel walk accumulates
// durations at load; only the initial approach is resolved at each real start.
// Unsupported or interrupted observations never fall back to the sender's buffer counters.
const AXES = ['X', 'Y', 'Z'];
const number = (value) => ((typeof value === 'number' || (typeof value === 'string' && value.trim())) && Number.isFinite(Number(value)) ? Number(value) : null);

export const MAX_TIME_BLOCKS = 1024;

const profileOf = (context) => ({
  rates: AXES.map((axis, i) => number((context.settings || {})['$' + (110 + i)])),
  feed: number(context.overrides && context.overrides.feed),
  rapid: number(context.overrides && context.overrides.rapid)
});

const moveTimer = (profile, context) => {
  const { rates, feed, rapid } = profile;
  const position = context.wpos || {};
  const initial = AXES.map((axis) => number(position[axis.toLowerCase()]));
  return (move) => {
    const delta = AXES.map((axis, j) => {
      const from = move.start[axis] === null ? initial[j] : move.start[axis];
      const to = move.end[axis] === null ? initial[j] : move.end[axis];
      return from === null || to === null ? null : to - from;
    });
    if (delta.some((v) => v === null)) {
      return null;
    }
    const length = move.arcLength === null ? Math.hypot(...delta) : Math.hypot(move.arcLength, delta[2]);
    if (!length) {
      return 0;
    }
    const mode = move.mode || context.feedMode;
    if (!move.rapid && (mode !== 'G94' || !(move.feed > 0))) {
      return null;
    }
    let duration = move.rapid ? 0 : length / (move.feed * feed / 100) * 60;
    for (let j = 0; j < AXES.length; j++) {
      // Arcs also need planar axis limits; use the slower XY rate as a conservative bound.
      const distance = move.arcLength !== null && j < 2 ? length : Math.abs(delta[j]);
      if (distance && !(rates[j] > 0)) {
        return null;
      }
      if (distance) {
        duration = Math.max(duration, distance / (rates[j] * (move.rapid ? rapid / 100 : 1)) * 60);
      }
    }
    return Number.isFinite(duration) ? duration : null;
  };
};

// The profile is a value snapshot, never a reference to mutable controller settings.
// A changed profile is rebuilt from the exact source at start; it never changes a guard.
export const createProgramTime = (context = {}) => {
  const profile = profileOf(context);
  const timing = {
    supported: profile.feed > 0 && profile.rapid > 0,
    profile,
    blocks: [],
    initial: [],
    needsInitial: false,
    inheritsFeedMode: false
  };
  const timer = moveTimer(profile, { wpos: { x: 0, y: 0, z: 0 }, feedMode: 'G94' });
  let seconds = 0;
  let span = 1024;
  let lastLine = 0;
  const checkpoint = (line, final = false) => {
    if (line === lastLine || (!final && line - lastLine < span)) {
      return;
    }
    timing.blocks.push({ line, seconds });
    lastLine = line;
    if (timing.blocks.length > MAX_TIME_BLOCKS) {
      // Keep cumulative endpoints: merging blocks introduces no duration rounding.
      timing.blocks = timing.blocks.filter((block, i) => i % 2 === 1 || block.line === line);
      span *= 2;
    }
  };
  return {
    timing,
    dwell: (value, line) => {
      seconds += value;
      checkpoint(line);
    },
    move: (move, line) => {
      const symbolic = AXES.some((axis) => move.start[axis] === null || move.end[axis] === null);
      timing.needsInitial = timing.needsInitial || symbolic;
      // At most three initial assignments are expected. Repeated position invalidations
      // must refuse timing instead of retaining an unbounded list of approaches.
      if (AXES.some((axis) => move.start[axis] === null && move.end[axis] !== null)) {
        if (timing.initial.length >= AXES.length) {
          timing.supported = false;
        } else {
          timing.initial.push(move);
        }
      } else {
        const duration = timer(move);
        if (duration === null) {
          timing.supported = false;
        } else {
          seconds += duration;
          if (duration > 0 && !move.rapid && !move.mode) {
            timing.inheritsFeedMode = true;
          }
        }
      }
      checkpoint(line);
    },
    finish: (line) => {
      checkpoint(line, true);
      if (!timing.supported || !Number.isFinite(seconds)) {
        timing.supported = false;
        timing.blocks = [];
        timing.initial = [];
      }
    }
  };
};

export const durationOf = (analysis, context) => {
  let t = analysis && analysis.timing;
  if (!t || analysis.rawUnits || !analysis.distance || analysis.relativeStart ||
      AXES.some((axis) => analysis.unknownAxes[axis]) || !context.offsetProven || context.reportUnits !== 'mm' ||
      (analysis.wcs && analysis.wcs !== context.wcs) || (analysis.tloCancel !== null && number(context.tlo) !== 0)) {
    return null;
  }
  if (JSON.stringify(t.profile) !== JSON.stringify(profileOf(context))) {
    t = t.rebuild(context);
    analysis.timing = t;
  }
  if (!t.supported || (t.inheritsFeedMode && context.feedMode !== 'G94')) {
    return null;
  }
  const position = context.wpos || {};
  if (t.needsInitial && AXES.some((axis) => number(position[axis.toLowerCase()]) === null)) {
    return null;
  }
  let seconds = t.blocks.length ? t.blocks[t.blocks.length - 1].seconds : 0;
  const timer = moveTimer(t.profile, context);
  for (let i = 0; i < t.initial.length; i++) {
    const duration = timer(t.initial[i]);
    if (duration === null) {
      return null;
    }
    seconds += duration;
  }
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
};

export const createRunTime = (duration, at, overrides) => {
  let last = at;
  let active = 0;
  let running = true;
  let endedAt = null;
  let known = duration !== null;
  const signature = (value) => (value ? value.feed + ':' + value.rapid : '');
  const original = signature(overrides);
  return (now, state) => {
    const dt = (now - last) / 1000;
    if (endedAt === null) {
      // Beyond the report freshness window, elapsed time is known, executed work is not.
      if (dt < 0 || dt > 2.5) {
        known = false;
      } else if (running && dt > 0) {
        active += dt;
      }
      if (state.ended || state.stopped) {
        endedAt = now;
      }
    }
    if (state.invalid || signature(state.overrides) !== original) {
      known = false;
    }
    last = now;
    running = state.fresh && state.workflow === 'running' && /^Run(?::|$)/.test(state.activeState);
    const available = known && active < duration;
    return {
      durationSeconds: known ? duration : null,
      elapsedSeconds: Math.max(0, ((endedAt === null ? now : endedAt) - at) / 1000),
      activeSeconds: active,
      percent: available ? Math.min(99, 100 * active / duration) : null,
      remainingSeconds: available ? Math.max(0, duration - active) : null
    };
  };
};
