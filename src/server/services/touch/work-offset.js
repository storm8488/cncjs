// D2: the work offset the board applies is proven equal to its stored value ($#)
// before anything that runs in work coordinates (PLAN-CORRECTIONS § 1.1).
//
// Field fact (LUNYEE 4040, Grbl_Esp32): after any homing the board reports
// WCO:0,0,0 while `$#` still holds the stored G54; `G54` alone changes nothing,
// `G55` then `G54` loads it again. So, at rest, one transaction per cause:
//   1. `$#` (the active system, G92, TLO, then ok);
//   2. a status report carrying WCO: received after that ok, compared with
//      $#[active] + G92 (+ TLO on Z);
//   3. different: the other system, then the active one, no axis word, one
//      line at a time (no G10: it would write the origin);
//   4. a $G received after the second ok naming the active system, then a
//      report carrying WCO: after it, compared again.
// Proven, failed or interrupted, nothing else is written. During a pause the
// program asked for (M0, M1, M6), steps 1 and 2 only.
//
// Explicit extensions: examples/cncjs-touch/preview-server.cjs loads this
// module with Node's native ES module loader, outside of Babel.
// eslint-disable-next-line import/extensions
import { controllerStatus } from './motion-preflight.js';

// Bounded waits of the transaction, the pause between two attempts, and the attempts per cause.
const LINE_MS = 3000;
const REPORT_MS = 5000;
const MODAL_MS = 3000;
export const RETRY_MS = 5000;
export const MAX_ATTEMPTS = 3;
// Report units ($13): rounding of the reports and of the sums of offsets.
const TOLERANCE = { mm: 0.0025, in: 0.00025 };
const AXES = ['x', 'y', 'z'];
const MAX_REPORT_AGE_MS = 2500;

export const MESSAGES = {
  ETOUCH_OFFSET_CHECKING: 'Vérification de l’origine de la pièce auprès de la carte : patientez quelques secondes.',
  ETOUCH_OFFSET_UNCONFIRMED: 'La carte n’a pas confirmé l’origine de la pièce : touchez de nouveau dans quelques secondes pour la vérifier à nouveau.',
  ETOUCH_OFFSET_MISMATCH: 'La carte n’applique pas l’origine enregistrée de {wcs} en {axis} ({stored} mm enregistré, {reported} mm appliqué), même rechargée : vérifiez la carte avant tout travail.',
  ETOUCH_OFFSET_SETTINGS: 'Réglages de la carte non lus : relisez-les pour vérifier l’origine de la pièce.'
};

const fill = (template, params) => template.replace(/\{(\w+)\}/g, (all, name) => (params[name] === undefined || params[name] === null ? all : String(params[name])));

// A refusal with a stable code (ETOUCH_OFFSET_*) and the values of its French message.
export const offsetRefusal = (code, params = {}) => {
  const err = new Error(fill(MESSAGES[code], params));
  err.status = 409;
  err.code = code;
  err.params = params;
  return err;
};

const num = (v) => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
const fmt = (n) => String(Math.round(n * 1000) / 1000);
const xyzOf = (p) => {
  if (!p || typeof p !== 'object') {
    return null;
  }
  const out = {};
  AXES.forEach((axis) => {
    out[axis] = num(p[axis]);
  });
  return AXES.every((axis) => out[axis] !== null) ? out : null;
};

// Thrown inside the transaction when it must end without a verdict.
const INTERRUPTED = { interrupted: true };

// deps (from job-service.js):
//   c, r                 the controller and the service's record of it (reports, wcs, startups)
//   clock()              monotonic time, in ms
//   later(c, r, fn, ms, cancel)  deferred step, cancelled with the record
//   changed()            notifies the stream listeners
//   answers(c, r), quiet(c, r, t, ms)  Grbl's answers to a line of ours (plate-probe.js)
//   connected()          the controller is still the one CNCjs holds, open
//   mode()               'write' at rest, 'read' in a pause the program asked for, or null
//                        when a transaction may not start now (see job-service.js)
//   reportUnits()        'mm' | 'in' | null ($13)
//   workflowIdle()       CNCjs's workflow is idle (no job running or paused)
//   log(event)           durable history; controllerInfo()  port, type, firmware
// Returns the per-controller interface (provenOffset under __tests__ has the same one).
export const createWorkOffset = (deps) => {
  const { c, r, clock, later, changed, answers, quiet, connected, mode, reportUnits, workflowIdle, log, controllerInfo } = deps;
  const s = {
    state: 'unknown',
    attempts: 0,
    retryAt: 0,
    // The last failure of this cause: { code, params }.
    failure: null,
    // The system to send back first: a transaction cut between its two lines.
    restore: null,
    // The last transaction's system, stored sum ($# + G92 + TLO) and reported WCO.
    wcs: null,
    stored: null,
    reported: null,
    reloaded: false,
    run: null,
    // The last explicit WCO: { value, report } (report: r.reports when it came).
    wco: null,
    // $G reports received, and how many had come at the last invalidation: a transaction
    // starts on a $G received after it (a WCO: changed by another client may come before its $G).
    modals: 0,
    modalFloor: 0,
    // Proofs made so far: the one a D1 override is bound to (job-service.js travelOf).
    proofs: 0
  };

  const tolerance = () => TOLERANCE[reportUnits()] || null;
  const differs = (a, b) => !a || !b || AXES.some((axis) => Math.abs(a[axis] - b[axis]) > tolerance());

  const end = (t, failure) => {
    if (s.run !== t) {
      return;
    }
    s.run = null;
    s.failure = failure;
    if (s.attempts >= MAX_ATTEMPTS) {
      s.state = 'failed';
    } else {
      s.state = 'unknown';
      s.retryAt = clock() + RETRY_MS;
    }
    changed();
  };

  const proven = (t) => {
    if (s.run !== t) {
      return;
    }
    s.run = null;
    s.state = 'proven';
    s.proofs += 1;
    s.failure = null;
    changed();
  };

  // A new cause: the proof (or the failure) no longer holds, the attempts start again.
  const invalidate = (cause) => {
    if (cause === 'restart') {
      s.restore = null;
    }
    s.modalFloor = s.modals;
    if (s.state === 'unknown' && !s.run && !s.attempts && !s.failure && s.stored === null) {
      return;
    }
    if (s.run) {
      s.run.cancelled = true;
      s.run = null;
    }
    Object.assign(s, { state: 'unknown', attempts: 0, retryAt: 0, failure: null, stored: null, reported: null, reloaded: false });
    changed();
  };

  // Pause, Stop, spindle stop, a jog stop, a stop from a socket: the transaction ends where it is.
  const cancel = () => {
    if (s.run) {
      const t = s.run;
      t.cancelled = true;
      end(t, { code: 'ETOUCH_OFFSET_UNCONFIRMED', params: { detail: 'interrupted' } });
    }
  };

  const fresh = () => Number.isFinite(r.seen) && clock() >= r.seen && clock() - r.seen <= MAX_REPORT_AGE_MS;

  const transaction = (readOnly) => {
    const t = { cancelled: false };
    s.run = t;
    s.state = 'checking';
    s.attempts += 1;
    s.reloaded = false;
    s.failure = null;
    changed();
    const startups = r.startups;
    const live = () => s.run === t && !t.cancelled;
    const usable = () => live() && connected() && r.startups === startups && fresh() &&
      (controllerStatus(c).activeState || '') === 'Idle' && mode() === (readOnly ? 'read' : 'write');

    const waitFor = (test, ms) => new Promise((resolve, reject) => {
      const until = clock() + ms;
      const check = () => {
        if (!live() || !connected() || r.startups !== startups) {
          reject(INTERRUPTED);
          return;
        }
        if (test()) {
          resolve(true);
          return;
        }
        if (clock() > until) {
          resolve(false);
          return;
        }
        later(c, r, check, 50, () => reject(INTERRUPTED));
      };
      check();
    });

    // One line alone, acknowledged and seen at rest; resolves with the report count at its ok.
    const send = async (line, collect) => {
      if (!usable()) {
        throw INTERRUPTED;
      }
      const tracker = answers(c, r);
      const runner = c.runner;
      const onParameters = (payload) => {
        if (payload && typeof payload.name === 'string') {
          collect[payload.name] = payload.value;
        }
      };
      if (collect) {
        runner.on('parameters', onParameters);
      }
      try {
        c.command('gcode', line);
        await quiet(c, r, tracker, LINE_MS);
      } catch (_) {
        throw live() ? { failed: true } : INTERRUPTED;
      } finally {
        tracker.done();
        if (collect) {
          runner.removeListener('parameters', onParameters);
        }
      }
      if (!live()) {
        throw INTERRUPTED;
      }
      return tracker.reportsAtOk;
    };

    // The WCO of a report received after report number `after`, or null after REPORT_MS.
    const reportedAfter = async (after) => {
      const ok = await waitFor(() => s.wco && s.wco.report > after, REPORT_MS);
      return ok ? s.wco.value : null;
    };

    const mismatch = (stored, reported, wcs) => {
      const axis = AXES.find((a) => Math.abs(stored[a] - reported[a]) > tolerance());
      return { code: 'ETOUCH_OFFSET_MISMATCH', params: { wcs, axis: axis.toUpperCase(), stored: fmt(stored[axis]), reported: fmt(reported[axis]) } };
    };
    const unconfirmed = (detail) => ({ code: 'ETOUCH_OFFSET_UNCONFIRMED', params: { detail } });

    const sequence = async () => {
      let active = r.wcs;
      // A transaction cut between its two lines left the other system active.
      if (s.restore) {
        if (s.restore !== active) {
          const back = s.restore;
          await send(back).catch(() => {
            throw INTERRUPTED;
          });
          const modals = s.modals;
          if (!(await waitFor(() => s.modals > modals, MODAL_MS)) || r.wcs !== back) {
            throw INTERRUPTED;
          }
          active = back;
        }
        s.restore = null;
      }
      s.wcs = active;
      const parameters = {};
      let okAt;
      try {
        okAt = await send('$#', parameters);
      } catch (err) {
        return err === INTERRUPTED ? err : unconfirmed('no-answer');
      }
      const stored = xyzOf(parameters[active]);
      const g92 = xyzOf(parameters.G92);
      const tlo = num(parameters.TLO);
      if (!stored || !g92 || tlo === null) {
        return unconfirmed('no-answer');
      }
      const expected = { x: stored.x + g92.x, y: stored.y + g92.y, z: stored.z + g92.z + tlo };
      s.stored = expected;
      let seen = await reportedAfter(okAt);
      if (!seen) {
        return unconfirmed('no-report');
      }
      s.reported = seen;
      if (!differs(seen, expected)) {
        return null;
      }
      if (readOnly) {
        return mismatch(expected, seen, active);
      }
      // Load the stored offset again: another system, then the active one, no axis word.
      const other = active === 'G54' ? 'G55' : 'G54';
      s.restore = active;
      try {
        await send(other);
        await send(active);
      } catch (_) {
        throw INTERRUPTED;
      }
      s.restore = null;
      const modals = s.modals;
      if (!(await waitFor(() => s.modals > modals, MODAL_MS))) {
        return unconfirmed('no-answer');
      }
      if (r.wcs !== active) {
        s.restore = active;
        throw INTERRUPTED;
      }
      seen = await reportedAfter(r.reports);
      if (!seen) {
        return unconfirmed('no-report');
      }
      s.reported = seen;
      s.reloaded = true;
      if (differs(seen, expected)) {
        return mismatch(expected, seen, active);
      }
      log({
        event: 'offset',
        result: 'reloaded',
        controller: controllerInfo(),
        wcs: active,
        stored: { x: fmt(expected.x), y: fmt(expected.y), z: fmt(expected.z) },
        lines: [other, active],
        actor: { kind: 'system', id: 'grbl', label: 'machine' }
      });
      return null;
    };

    sequence().then((failure) => {
      if (failure === INTERRUPTED) {
        end(t, unconfirmed('interrupted'));
      } else if (failure) {
        end(t, failure);
      } else {
        proven(t);
      }
    }, (err) => {
      end(t, unconfirmed(err === INTERRUPTED ? 'interrupted' : 'no-answer'));
    });
  };

  // At each status report: an explicit WCO is kept; a transaction starts when it may.
  const tick = (payload) => {
    const value = xyzOf(payload && payload.wco);
    if (value) {
      s.wco = { value, report: r.reports };
      // A client on another channel (the board's Wi-Fi) changed the offset at rest.
      if (s.state === 'proven' && !s.run && workflowIdle() && tolerance() && differs(value, s.reported)) {
        invalidate('wco');
      }
    }
    if (s.state !== 'unknown' || s.run || clock() < s.retryAt || s.modals <= s.modalFloor || !tolerance()) {
      return;
    }
    const how = mode();
    if (!how || (how === 'read' && s.restore)) {
      return;
    }
    transaction(how === 'read');
  };

  // At each $G report: counted; a system changed at rest outside a transaction is proven anew.
  const modal = () => {
    s.modals += 1;
    if (!s.run && (s.state === 'proven' || s.state === 'failed') && workflowIdle() && r.wcs && s.wcs && r.wcs !== s.wcs) {
      invalidate('wcs');
    }
  };

  // The action verifyOffset: the proof starts again, attempts included.
  const verify = () => {
    if (s.run) {
      return;
    }
    Object.assign(s, { state: 'unknown', attempts: 0, retryAt: 0, failure: null, reloaded: false });
    changed();
  };

  // An operation refused for a failed proof: the next report tries again.
  const retry = () => {
    if (s.state === 'failed' && !s.run) {
      verify();
    }
  };

  const refusal = () => {
    if (s.state === 'proven') {
      return null;
    }
    if (s.state === 'failed' && s.failure) {
      return offsetRefusal(s.failure.code, s.failure.params);
    }
    if (!tolerance() && !s.run) {
      return offsetRefusal('ETOUCH_OFFSET_SETTINGS');
    }
    return offsetRefusal('ETOUCH_OFFSET_CHECKING');
  };

  const xyz = (p) => (p ? { x: fmt(p.x), y: fmt(p.y), z: fmt(p.z) } : null);
  const snapshot = () => {
    const err = refusal();
    return {
      state: s.state,
      code: err ? err.code : null,
      params: err ? err.params : null,
      detail: s.failure && s.failure.params && s.failure.params.detail ? s.failure.params.detail : null,
      wcs: s.wcs,
      stored: xyz(s.stored),
      reported: xyz(s.reported),
      reloaded: s.reloaded,
      attempts: s.attempts,
      canVerify: !s.run
    };
  };

  return {
    state: () => s.state,
    proven: () => s.state === 'proven',
    // Which proof holds now (a number), or null when none does.
    proof: () => (s.state === 'proven' ? s.proofs : null),
    checking: () => !!s.run,
    tick,
    modal,
    invalidate,
    cancel,
    verify,
    retry,
    refusal,
    snapshot,
    signature: () => [s.state, s.attempts, s.failure && s.failure.code, s.reloaded, !!s.restore].join('/')
  };
};
