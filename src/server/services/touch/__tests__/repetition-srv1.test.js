/* eslint-env jest */
// Rehearsal before the CNC trial (2026-11), SRV-1: a .cncrc without an `events` key (a CNCjs install where no event was
// ever configured: the Surface) greys the dry-run arrows for good, while the
// load/start guard (job-service.js:137) reads the same absence as "none".
import { EventEmitter } from 'events';
import { createPreflight } from '../motion-preflight';

const controller = () => {
  const state = { status: { activeState: 'Idle' } };
  return {
    type: 'Grbl',
    options: { port: 'TEST' },
    ready: true,
    isClose: () => false,
    runner: Object.assign(new EventEmitter(), { state }),
    workflow: { state: 'idle' },
    state,
    feeder: { toJSON: () => ({ queue: 0, pending: false }) },
    settings: { settings: { $110: 1600, $111: 1600, $112: 1600 } }
  };
};

// CNCjs's config store: _.get(config, key, defaultValue).
const store = (data) => ({ get: (key, def) => (data[key] === undefined ? def : data[key]) });

const inspect = (data) => {
  const c = controller();
  const service = createPreflight({ get: () => ({ TEST: c }) }, store(data), () => ({ loading: false, confirmationPending: false }), () => 0);
  service.inspect('TEST');
  c.runner.emit('status');
  return service.inspect('TEST');
};

test('witness: an empty events list lets the dry run through', () => {
  expect(inspect({ events: [] })).toMatchObject({ available: true });
});

test('SRV-1: no events key in .cncrc (the Surface) must not grey the dry-run arrows', () => {
  expect(inspect({})).toMatchObject({ available: true });
});

test('unchanged: an enabled or malformed automation still refuses', () => {
  expect(inspect({ events: [{ enabled: true }] }).code).toBe('EVENTS');
  expect(inspect({ events: null }).code).toBe('EVENTS');
  expect(inspect({ events: {} }).code).toBe('EVENTS');
});
