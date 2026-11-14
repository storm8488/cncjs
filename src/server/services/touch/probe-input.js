// Passive probe-input diagnostic: it consumes the controller's status events
// and never queries or commands Grbl.

// A status report older than this is not trusted to describe the probe input.
const MAX_REPORT_AGE_MS = 2500;

// Contact test (block probe, block-probe.js): consecutive recognized reports
// free → contact → free date it. Free: Pn without P, or Pn left out ($6 set as
// verified on the machine). Anything unrecognized in between starts it over.
const TEST_IDLE = 0;
const TEST_FREE = 1;
const TEST_CONTACT = 2;

// Only modern, pipe-separated reports are interpreted. PRB is never read.
const STATUS_REPORT = /^<(?:Idle|Run|Hold(?::\d+)?|Jog|Alarm|Door(?::\d+)?|Check|Home|Sleep)\|[^<>\r\n]+>$/;

export const createProbeInput = (store, clock = Date.now) => {
  const observed = new Map();

  // A controller destroyed by CNCjs has runner set to null: forget it anyway.
  const remove = (port) => {
    const record = observed.get(port);
    observed.delete(port);
    if (record && record.controller.runner) {
      record.controller.runner.removeListener('status', record.status);
      record.controller.runner.removeListener('startup', record.reset);
    }
  };

  // Drops records whose controller has been closed or replaced.
  const sync = () => {
    const registry = store.get('controllers') || {};
    for (const [port, record] of observed) {
      if (!Object.prototype.hasOwnProperty.call(registry, port) ||
          registry[port] !== record.controller || record.controller.isClose()) {
        remove(port);
      }
    }
    return registry;
  };

  const watch = (port, c) => {
    const record = { controller: c, seen: null, state: 'unknown', code: 'WAITING', pins: null, stage: TEST_IDLE, testedAt: null };
    record.reset = () => {
      record.seen = null;
      record.state = 'unknown';
      record.code = 'WAITING';
      record.pins = null;
      // A board restart: the test is due again.
      record.stage = TEST_IDLE;
      record.testedAt = null;
    };
    // Read the raw report: GrblRunner fills a missing pinState with an empty
    // string, which would hide the difference between "free" and "unreported".
    const read = (report) => {
      record.seen = clock();
      record.state = 'unknown';
      record.code = 'MALFORMED';
      record.pins = null;

      const raw = report && report.raw;
      if (typeof raw !== 'string' || raw.length > 2048 || !STATUS_REPORT.test(raw)) {
        return;
      }
      const fields = raw.slice(1, -1).split('|').slice(1);
      const pins = fields.filter((field) => /^Pn(?::|$)/.test(field));
      if (!pins.length) {
        // Grbl 1.1 leaves Pn out when no input is triggered.
        record.code = 'MISSING';
        record.pins = '';
        return;
      }
      // Grbl_ESP32 also reports A/B/C limits and macro buttons 0-3.
      if (pins.length !== 1 || !/^Pn:[XYZABCPDHRS0-3]+$/.test(pins[0])) {
        return;
      }
      const value = pins[0].slice(3);
      if (new Set(value).size !== value.length) {
        return;
      }
      record.state = value.includes('P') ? 'contact' : 'free';
      record.code = 'EXPLICIT';
      record.pins = value.replace(/[^XYZP]/g, '');
    };
    record.status = (report) => {
      read(report);
      const contact = record.code === 'EXPLICIT' && record.state === 'contact';
      const free = record.code === 'MISSING' || (record.code === 'EXPLICIT' && record.state === 'free');
      if (contact) {
        record.stage = record.stage === TEST_IDLE ? TEST_IDLE : TEST_CONTACT;
      } else if (free) {
        if (record.stage === TEST_CONTACT) {
          record.testedAt = clock();
        }
        record.stage = TEST_FREE;
      } else {
        record.stage = TEST_IDLE;
      }
    };
    observed.set(port, record);
    c.runner.on('status', record.status);
    c.runner.on('startup', record.reset);
  };

  const inspect = (port) => {
    const registry = sync();
    const c = Object.prototype.hasOwnProperty.call(registry, port) && registry[port];
    const result = {
      state: 'unknown',
      code: 'CONNECTION',
      reason: 'Contrôleur Grbl déconnecté ou indisponible.',
      fresh: false,
      ageMs: null,
      observedAt: null,
      source: 'Grbl Pn',
      readOnly: true,
      canProbe: false,
      // Triggered limit and probe inputs (X, Y, Z, P) from a fresh report, or null.
      pins: null,
      // Contact test free → contact → free (block probe): when (service clock), and how long ago.
      testedAt: null,
      test: { done: false, ageMs: null }
    };

    if (!c || c.type !== 'Grbl' || !c.options || c.options.port !== port ||
        c.isClose() || c.ready !== true || !c.runner) {
      remove(port);
      return result;
    }
    if (!observed.has(port)) {
      watch(port, c);
    }

    const record = observed.get(port);
    const now = clock();
    if (record.testedAt !== null) {
      result.testedAt = record.testedAt;
      result.test = { done: true, ageMs: Number.isFinite(now) && now >= record.testedAt ? now - record.testedAt : null };
    }
    result.observedAt = Number.isFinite(record.seen) ? record.seen : null;
    result.ageMs = (Number.isFinite(now) && result.observedAt !== null && now >= record.seen)
      ? now - record.seen
      : null;

    if (result.ageMs === null || result.ageMs > MAX_REPORT_AGE_MS) {
      result.code = record.seen === null ? 'WAITING' : 'STALE';
      result.reason = record.seen === null
        ? 'En attente d’un nouveau rapport Grbl.'
        : 'Rapport trop ancien : entrée sonde inconnue.';
      return result;
    }

    result.fresh = true;
    result.state = record.state;
    result.code = record.code;
    result.pins = record.pins;
    if (record.code === 'EXPLICIT') {
      result.reason = record.state === 'contact'
        ? 'Contact signalé par le champ Pn du rapport Grbl.'
        : 'Champ Pn explicite : entrée P non active.';
    } else if (record.code === 'MISSING') {
      result.reason = 'Champ Pn absent : entrée libre non confirmée. Capacité du firmware à valider.';
    } else {
      result.reason = 'Rapport sonde non reconnu : état inconnu.';
    }
    return result;
  };

  const dispose = () => {
    for (const port of observed.keys()) {
      remove(port);
    }
  };

  return { inspect, sync, dispose };
};
