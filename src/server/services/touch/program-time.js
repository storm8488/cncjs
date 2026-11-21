// Display-only duration of the exact loaded program. The travel walk supplies lengths,
// feeds and dwells; current coordinates and axis rates are captured at each real start.
// Unsupported or interrupted observations never fall back to the sender's buffer counters.
const AXES = ['X', 'Y', 'Z'];
const number = (value) => ((typeof value === 'number' || (typeof value === 'string' && value.trim())) && Number.isFinite(Number(value)) ? Number(value) : null);

export const durationOf = (analysis, context) => {
  const t = analysis && analysis.timing;
  if (!t || !t.supported || analysis.rawUnits || !analysis.distance || analysis.relativeStart ||
      AXES.some((axis) => analysis.unknownAxes[axis]) || !context.offsetProven || context.reportUnits !== 'mm' ||
      (analysis.wcs && analysis.wcs !== context.wcs) || (analysis.tloCancel !== null && number(context.tlo) !== 0)) {
    return null;
  }
  const rates = AXES.map((axis, i) => number(context.settings['$' + (110 + i)]));
  const initial = AXES.map((axis) => number(context.wpos[axis.toLowerCase()]));
  const overrides = context.overrides;
  if (!overrides || !(overrides.feed > 0) || !(overrides.rapid > 0)) {
    return null;
  }
  let seconds = t.dwell;
  for (let i = 0; i < t.moves.length; i++) {
    const move = t.moves[i];
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
      continue;
    }
    const mode = move.mode || context.feedMode;
    if (!move.rapid && (mode !== 'G94' || !(move.feed > 0))) {
      return null;
    }
    let duration = move.rapid ? 0 : length / (move.feed * overrides.feed / 100) * 60;
    for (let j = 0; j < AXES.length; j++) {
      // Arcs also need planar axis limits; use the slower XY rate as a conservative bound.
      const distance = move.arcLength !== null && j < 2 ? length : Math.abs(delta[j]);
      if (distance && !(rates[j] > 0)) {
        return null;
      }
      if (distance) {
        duration = Math.max(duration, distance / (rates[j] * (move.rapid ? overrides.rapid / 100 : 1)) * 60);
      }
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
