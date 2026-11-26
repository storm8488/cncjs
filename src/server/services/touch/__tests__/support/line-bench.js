// Lot C1 (design/plaque/C1-CONCEPTION.md § 4.1): what "the board says" in a bench is a line of
// text read by CNCjs's real parser (GrblRunner.parse), never an event made by hand.
//
// 1. `lineBench(c)` converts a bench written before C1, whose fake controller emits `status` and
//    `parserstate` on a plain emitter and writes the position straight into `c.runner.state`:
//    every such emission becomes the line that says the same thing, parsed by a real GrblRunner,
//    and the payload that parser gives is what the service receives. The state the bench wrote
//    stays as the bench wrote it. The conversion says only what the bench set:
//      - `status` without a payload: `<State|MPos:…|FS:…|WCO:…|Pn:…|Ov:…|A:…>` from the bench's
//        state. MPos (or WPos when the state has no machine position) only when X, Y and Z are
//        numbers; FS: only when the state has a spindle speed (the feed is the state's, 0 when it
//        has none); WCO: = MPos − WPos when the state has both, in the first report after a banner
//        and whenever it changes (as a board does), or the `wco` the bench gave;
//      - `status` with a `raw` line: that very line (the entry for deliberate omissions); a `raw`
//        that is no status line for the parser is passed on untouched;
//      - `parserstate`: `[GC:…]` made of the words of the modal state the bench gave, in Grbl's
//        order; nothing is added (no M5 unless the bench says M5), except `F0` when the bench gave
//        a single word, which the parser would not take for a $G report.
//    It never adds a report, an `ok`, a second Idle or time.
// 2. `board(runner)` is for the tests of C1: full lines and their acknowledgements, one by one.
import GrblRunner from '../../../../controllers/Grbl/GrblRunner';

const num = (v) => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
const f3 = (n) => (Math.round(n * 1000) / 1000).toFixed(3);
const xyz = (p) => {
  const out = ['x', 'y', 'z'].map((axis) => num(p && p[axis]));
  return out.includes(null) ? null : out;
};

// The status line that says what `status` (a bench's `runner.state.status`) holds.
export const statusLine = (status = {}, { wco = null, memo = null } = {}) => {
  const fields = [(status.activeState || 'Idle') + (Number.isInteger(status.subState) && /^(Hold|Door)$/.test(status.activeState) ? ':' + status.subState : '')];
  const m = xyz(status.mpos);
  const w = xyz(status.wpos);
  if (m) {
    fields.push('MPos:' + m.map(f3).join(','));
  } else if (w) {
    fields.push('WPos:' + w.map(f3).join(','));
  }
  if (num(status.spindle) !== null && num(status.spindle) >= 0) {
    fields.push('FS:' + Math.max(0, Math.round(num(status.feedrate) || 0)) + ',' + Math.round(num(status.spindle)));
  }
  let offset = xyz(wco);
  if (!offset && m && w) {
    const derived = m.map((v, i) => v - w[i]).map(f3);
    if (!memo || memo.wco !== derived.join(',')) {
      offset = derived.map(Number);
    }
  }
  if (offset) {
    fields.push('WCO:' + offset.map(f3).join(','));
    if (memo) {
      memo.wco = offset.map(f3).join(',');
    }
  }
  if (typeof status.pinState === 'string' && /^[A-Za-z]+$/.test(status.pinState)) {
    fields.push('Pn:' + status.pinState);
  }
  if (Array.isArray(status.ov) && status.ov.length === 3) {
    fields.push('Ov:' + status.ov.join(','));
  }
  if (typeof status.accessoryState === 'string' && /^[A-Za-z]+$/.test(status.accessoryState)) {
    fields.push('A:' + status.accessoryState);
  }
  return '<' + fields.join('|') + '>';
};

// The `[GC:…]` line made of the words a bench's parser state gives.
export const modalLine = (parserstate = {}) => {
  const modal = parserstate.modal || {};
  const words = [];
  ['motion', 'wcs', 'plane', 'units', 'distance', 'feedrate', 'program', 'spindle', 'coolant'].forEach((group) => {
    [].concat(modal[group] === undefined || modal[group] === null ? [] : modal[group]).forEach((word) => words.push(String(word)));
  });
  [['T', parserstate.tool], ['F', parserstate.feedrate], ['S', parserstate.spindle]].forEach(([letter, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '' && Number.isFinite(Number(value))) {
      words.push(letter + String(value).trim());
    }
  });
  if (words.length < 2) {
    words.push('F0');
  }
  return '[GC:' + words.join(' ') + ']';
};

export const FULL_MODAL = '[GC:G0 G54 G17 G21 G90 G94 M5 M9 T0 F0 S0]';

// See 1. above. Returns `c`.
export const lineBench = (c) => {
  const runner = c.runner;
  const real = new GrblRunner();
  const emit = runner.emit.bind(runner);
  const memo = { wco: null };
  let parsed = null;
  real.on('status', (payload) => {
    parsed = payload;
  });
  real.on('parserstate', (payload) => {
    parsed = payload;
  });
  const through = (line) => {
    parsed = null;
    real.parse(line);
    return parsed;
  };
  runner.emit = (name, payload, ...rest) => {
    if (name === 'startup') {
      memo.wco = null;
    }
    if (name === 'status') {
      const given = payload && typeof payload === 'object' ? payload : {};
      const line = typeof given.raw === 'string' ? given.raw : statusLine(runner.state && runner.state.status, { wco: given.wco, memo });
      const out = through(line);
      return emit('status', out ? { ...given, ...out } : { ...given, raw: line }, ...rest);
    }
    if (name === 'parserstate' && payload && typeof payload === 'object' && typeof payload.raw !== 'string') {
      const out = through(modalLine(payload));
      return emit('parserstate', out ? { ...payload, ...out, modal: { ...(payload.modal || {}), ...(out.modal || {}) } } : payload, ...rest);
    }
    return emit(name, payload, ...rest);
  };
  return c;
};

// See 2. above: the lines of a board, read one by one by the real parser.
export const board = (runner) => {
  const say = (...lines) => lines.forEach((line) => runner.parse(line));
  return {
    say,
    ok: () => say('ok'),
    // A whole $G exchange: the report, then its own ok.
    modal: (line = FULL_MODAL) => say(line, 'ok'),
    // The $G report alone: its ok is still on its way.
    modalOnly: (line = FULL_MODAL) => say(line)
  };
};
