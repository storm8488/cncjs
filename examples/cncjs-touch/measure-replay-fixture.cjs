'use strict';
// Deterministic job replay for the performance measurements (preview-server.cjs
// --replay). Serves what the touch service would stream during a job: one
// snapshot every 208 ms (4.8 a second, the pace recorded on the tablet during
// the fluidity pass), the same values at the same offsets at every run, so two
// versions of the page can be compared on identical input. Positions follow a
// square path, lines are acknowledged at a steady rate, feed and spindle vary
// smoothly. No machine, no command: POST /api/touch-job is refused by the
// fixture. Never used by the page itself.
const PERIOD_MS = 208;
const PROGRAM_LINES = 20000;
const JOB_SECONDS = 600; // a ten-minute job, restarted when it ends
const STREAM_LIFETIME_MS = 60000; // the touch service rotates its responses after a minute

function create(options) {
  const file = (options && options.file) || 'Parcours_de_test_1.gcode';
  const started = Date.now();
  let sequence = 0;
  const epoch = 'replay-' + started.toString(36);
  const round = (v) => Math.round(v * 1000) / 1000;

  // The state at an offset (ms since the fixture started): a function, not a
  // recording, so every run sees the same sequence of values.
  function at(offset) {
    const t = (offset / 1000) % JOB_SECONDS;
    const received = Math.min(PROGRAM_LINES, Math.floor(t / JOB_SECONDS * PROGRAM_LINES));
    const sent = Math.min(PROGRAM_LINES, received + 16);
    // One 100 mm square every 40 s, 1 mm deeper each lap, within the fixture's preview (10..90 mm).
    const lap = (t / 40) % 1, side = Math.floor(lap * 4), along = (lap * 4) % 1 * 80;
    const x = side === 0 ? 10 + along : side === 1 ? 90 : side === 2 ? 90 - along : 10;
    const y = side === 0 ? 10 : side === 1 ? 10 + along : side === 2 ? 90 : 90 - along;
    const z = -1 - Math.floor(t / 40) * 0.5;
    const feed = 800 + Math.round(200 * Math.sin(t / 7));
    const spindle = 12000 + Math.round(300 * Math.sin(t / 11));
    return { received, sent, x: round(x), y: round(y), z: round(z), feed, spindle };
  }

  function controller(now) {
    const s = at(now - started);
    const wpos = { x: s.x, y: s.y, z: s.z }, mpos = { x: round(s.x - 600), y: round(s.y - 600), z: round(s.z - 5) };
    return {
      port: '/dev/replay', controllerId: '/dev/replay', generation: 'replay-1', operator: { reportUnits: 'mm', wcs: 'G54' }, type: 'Grbl',
      activeState: 'Run', feedrate: s.feed, spindleSpeed: s.spindle, workflow: 'running',
      statusAgeMs: 40, statusObservedAt: now - 40, coordinates: { wpos, mpos },
      settings: { $20: 1, $21: 1, $22: 1, $23: 0, $110: 5000, $111: 5000, $112: 800, $120: 100, $121: 100, $122: 50, $130: 600, $131: 600, $132: 100 },
      fresh: true, name: file, revision: 1, originalName: file, fingerprint: null, programCheck: null, homed: true,
      control: { owner: null, lastChange: null }, total: PROGRAM_LINES, sent: s.sent, received: s.received, probeInput: null, loading: false,
      canPreviewMotion: false, motionReason: 'Travail en cours.', canLoad: false, loadReason: 'Travail en cours.', canStart: false, startReason: 'Travail en cours.',
      canResume: false, resumeReason: 'Travail en cours.', finished: false, jobStopped: false, finishedWithErrors: false, jobErrors: 0, jobLastError: null,
      alarmCode: null, stalledMs: null, programPause: null, resume: null, stoppedAtLine: null, stoppedFile: null, canPause: true, canStop: true, homing: false,
      overrides: { feed: 100, rapid: 100, spindle: 100 }, canOverride: true, overrideReason: '', canRapidOverride: true, rapidOverrideReason: '', macros: [], canMacro: false,
      macroReason: 'Travail en cours.', firmware: 'Grbl 1.1h', startups: 1, settingsCount: 34, canUnlock: false, unlockReason: 'Travail en cours.', canHome: false, homeReason: 'Travail en cours.',
      canSpindleTest: false, spindleReason: 'Travail en cours.', spindleTestSpeed: 1000, canSpindleStop: false, canZeroZ: false, zeroZReason: 'Travail en cours.', probing: false, zeroZ: null
    };
  }

  // options.alarm: the controller at rest in ALARM (a hard limit), program loaded, unlock
  // offered: the strip shows « Déverrouiller… » (layout check of browser-run.cjs --strict).
  function alarmed(now) {
    const c = controller(now);
    return Object.assign(c, { activeState: 'Alarm', workflow: 'idle', alarmCode: 1, feedrate: 0, spindleSpeed: 0, homed: false, sent: 0, received: 0,
      canPause: false, canStop: false, canOverride: false, canRapidOverride: false, canUnlock: true, unlockReason: '', canHome: true, homeReason: '',
      startReason: 'Machine en alarme.', loadReason: 'Machine en alarme.', resumeReason: 'Machine en alarme.' });
  }
  function packet() {
    const now = Date.now();
    return { version: 1, epoch, sequence: ++sequence, sentAt: now, controllers: [options && options.alarm ? alarmed(now) : controller(now)] };
  }

  // NDJSON like src/server/services/touch/touch-stream.js: a packet at once, then
  // one per period, `{rotate:true}` and the end of the response after a minute.
  function stream(req, res) {
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' });
    const transportId = 'replay-' + sequence.toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    const opened = Date.now();
    let timer = null, closed = false;
    const tick = () => {
      if (closed) return;
      if (Date.now() - opened >= STREAM_LIFETIME_MS) { res.write(JSON.stringify({ rotate: true }) + '\n'); res.end(); stop(); return; }
      res.write(JSON.stringify({ ...packet(), transportId }) + '\n');
      // Drift-corrected: the n-th packet goes out at opened + n * PERIOD_MS.
      const n = Math.floor((Date.now() - opened) / PERIOD_MS) + 1;
      timer = setTimeout(tick, Math.max(1, opened + n * PERIOD_MS - Date.now()));
    };
    const stop = () => { closed = true; if (timer) clearTimeout(timer); };
    req.on('close', stop); res.on('close', stop);
    tick();
  }

  return { packet, stream, at, PERIOD_MS, PROGRAM_LINES };
}

module.exports = { create };
