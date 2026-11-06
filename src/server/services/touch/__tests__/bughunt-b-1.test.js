/* eslint-env jest */
// Chasse aux bugs, angle B, n° 1 (non commité) : la rotation planifiée du flux
// (60 s) d'une tablette qui pilote écrit « Pilote absent » puis « Pilote revenu »
// dans l'historique durable à chaque minute. Câblage identique à index.js
// (control.onEvent → history.record), horloges injectées.
import { EventEmitter } from 'events';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createService } from '../job-service';
import { createStream } from '../touch-stream';
import { createControl } from '../control';
import { createHistory } from '../history';

const fakeTimers = () => {
  let id = 0;
  const intervals = new Map();
  const timeouts = new Map();
  return {
    intervals,
    setInterval: (fn) => {
      intervals.set(++id, fn);
      return id;
    },
    clearInterval: (key) => intervals.delete(key),
    setTimeout: (fn) => {
      timeouts.set(++id, fn);
      return id;
    },
    clearTimeout: (key) => timeouts.delete(key),
    beat: () => {
      Array.from(timeouts.values()).forEach((fn) => fn());
      timeouts.clear();
      Array.from(intervals.values()).forEach((fn) => fn());
    }
  };
};

const fakeResponse = () => {
  const res = new EventEmitter();
  return Object.assign(res, {
    lines: [],
    ended: false,
    setHeader() {},
    write(line) {
      this.lines.push(JSON.parse(line));
      return true;
    },
    flush() {},
    flushHeaders() {},
    end() {
      this.ended = true;
    }
  });
};

const fakeController = () => {
  const c = {
    type: 'Grbl',
    options: { port: 'A' },
    ready: true,
    isClose: () => false,
    runner: new EventEmitter(),
    sender: new EventEmitter(),
    workflow: { state: 'idle' },
    state: { status: { activeState: 'Idle', wpos: { x: 1, y: 2, z: 3 }, mpos: { x: 4, y: 5, z: 6 } } },
    settings: { settings: { $110: '5000' } },
    feeder: { toJSON: () => ({ queue: 0, pending: false }) },
    commands: []
  };
  c.runner.state = JSON.parse(JSON.stringify(c.state));
  c.sender.state = { name: '', context: {}, total: 0 };
  c.sender.toJSON = () => c.sender.state;
  c.command = (name, ...args) => {
    c.commands.push(name);
    if (name === 'gcode:load') {
      c.sender.state = { name: args[0], context: args[2], total: 1 };
      c.sender.emit('load');
      args[3](null);
    }
  };
  return c;
};

let dir;
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bughunt-b-1-'));
  fs.writeFileSync(path.join(dir, 'test.nc'), 'G21 G90\nG1 X1 F100\n');
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

test('la rotation planifiée du flux de la tablette pilote n’écrit rien dans l’historique durable', async () => {
  const box = { now: 100000 };
  const timers = fakeTimers();
  const history = createHistory({ file: path.join(dir, 'h.jsonl'), now: () => box.now });
  const control = createControl({
    now: () => box.now,
    elapsed: () => box.now,
    onEvent: (event) => history.record({ event: 'control', change: event.type, port: event.port, owner: event.owner })
  });
  const c = fakeController();
  const service = createService({ get: () => ({ A: c }) }, { get: (k) => (k === 'watchDirectory' ? dir : []) }, () => box.now, { control, history });
  const stream = createStream(service, { clock: () => box.now, timers });
  const A = { kind: 'touch', id: 't-abc-1234', label: 'Tablette 1234', user: '' };

  // La page ouvre son flux (job-stream.js:42, ?clientId=) puis rouvre à chaque { rotate: true } (:65-70).
  let res = fakeResponse();
  stream.open(new EventEmitter(), res, A);
  c.runner.emit('status');
  const transportId = res.lines[0].transportId;
  const generation = service.list()[0].generation;
  await service.action({ action: 'load', port: 'A', file: 'test.nc', generation, transportId }, A);
  expect(service.list()[0].control.owner).toMatchObject({ kind: 'touch', id: A.id });

  // Quatre minutes, au repos (avant la libération pour inactivité de 5 min) : une rotation par minute.
  let rotations = 0;
  for (let s = 0; s < 240; s++) {
    box.now += 1000;
    c.runner.emit('status');
    timers.beat();
    if (res.ended && res.lines.some((l) => l.rotate === true)) {
      rotations++;
      res = fakeResponse();
      stream.open(new EventEmitter(), res, A);
    }
  }
  expect(rotations).toBeGreaterThanOrEqual(3);
  expect(service.list()[0].control.owner).toMatchObject({ id: A.id, present: true });
  await history.flush();
  const page = await history.read({ limit: 200 });
  const noise = page.entries.filter((e) => e.event === 'control' && (e.change === 'absent' || e.change === 'restored'));
  // Attendu : 0 (la tablette n'a jamais été absente). Observé : 2 entrées par rotation.
  expect(noise.map((e) => e.change)).toEqual([]);
  stream.dispose();
  history.dispose();
});
