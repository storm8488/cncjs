/* eslint-env jest */
import touch from '../../services/touch';
import { getHealth, getJob, postJob, previewMotion, getEvents, getHistory, getSystem, getBacklight, postBacklight, actorOf } from '../api.touch';

// babel-jest hoists this above the imports above.
jest.mock('../../services/touch', () => ({
  __esModule: true,
  default: {
    VERSION: '3.0.0',
    isStarted: jest.fn(() => true),
    snapshot: jest.fn(() => ({ version: 1, controllers: [] })),
    publish: jest.fn(),
    action: jest.fn(() => Promise.resolve({ message: 'ok' })),
    previewMotion: jest.fn(() => ({ dryRun: true })),
    openEvents: jest.fn(() => true),
    readHistory: jest.fn(() => Promise.resolve({ entries: [{ seq: 2, event: 'start' }], total: 2, skipped: 1, more: true, file: '/secret/path' })),
    systemStats: jest.fn(() => ({ cores: [12.5, 3], cpu: 7.8 })),
    backlightStatus: jest.fn(() => ({ available: true, writable: true, percent: 50 })),
    setBacklight: jest.fn((percent) => ({ available: true, writable: true, percent })),
    dimBacklight: jest.fn((percent) => ({ available: true, writable: true, percent, temporary: true })),
    wakeBacklight: jest.fn(() => ({ available: true, writable: true, percent: 60, temporary: false }))
  }
}));

const makeReq = ({ user = { id: 'test' }, body = {} } = {}) => ({ user, body });

const makeRes = () => {
  const res = { statusCode: 200, payload: undefined };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.headers = {};
  res.set = (name, value) => {
    res.headers[name] = value;
    return res;
  };
  res.send = (payload) => {
    res.payload = payload;
    return res;
  };
  return res;
};

// Waits for a handler that answers asynchronously.
const settled = () => new Promise((resolve) => {
  setImmediate(resolve);
});

const handlers = { getHealth, getJob, postJob, previewMotion, getEvents, getHistory, getSystem, getBacklight, postBacklight };

describe('api.touch', () => {
  beforeEach(() => {
    Object.values(touch).forEach((fn) => fn.mockClear && fn.mockClear());
    touch.isStarted.mockReturnValue(true);
  });

  test.each(Object.keys(handlers))('%s refuses a request without a session, even in development mode', async (name) => {
    const res = makeRes();
    handlers[name](makeReq({ user: null }), res);
    await settled();
    expect(res.statusCode).toBe(401);
    expect(touch.action).not.toHaveBeenCalled();
    expect(touch.openEvents).not.toHaveBeenCalled();
  });

  test.each(Object.keys(handlers))('%s answers 503 while the service is not started', async (name) => {
    touch.isStarted.mockReturnValue(false);
    const res = makeRes();
    handlers[name](makeReq(), res);
    await settled();
    expect(res.statusCode).toBe(503);
  });

  test('getHealth describes the protocol', () => {
    const res = makeRes();
    getHealth(makeReq(), res);
    expect(res.payload).toEqual({ loaded: true, version: '3.0.0', protocol: 1, transport: 'ndjson' });
  });

  test('getJob sends a snapshot and hides snapshot failures', () => {
    let res = makeRes();
    getJob(makeReq(), res);
    expect(res.payload).toEqual({ version: 1, controllers: [] });

    touch.snapshot.mockImplementationOnce(() => {
      throw new Error('private');
    });
    res = makeRes();
    getJob(makeReq(), res);
    expect(res.statusCode).toBe(500);
    expect(res.payload.message).not.toMatch(/private/);
  });

  test('postJob returns the result with a snapshot and publishes it', async () => {
    const res = makeRes();
    postJob(makeReq({ body: { port: 'A', action: 'pause' } }), res);
    await settled();
    expect(touch.action).toHaveBeenCalledWith({ port: 'A', action: 'pause' }, { kind: 'http', id: 'http:test', label: '', user: 'test' });
    expect(res.payload).toEqual({ message: 'ok', snapshot: { version: 1, controllers: [] } });
    expect(touch.publish).toHaveBeenCalledTimes(1);
  });

  test('postJob maps a service error to its status, defaulting to 400', async () => {
    const conflict = new Error('La machine doit être au repos.');
    conflict.status = 409;
    touch.action.mockReturnValueOnce(Promise.reject(conflict));
    let res = makeRes();
    postJob(makeReq(), res);
    await settled();
    expect(res.statusCode).toBe(409);
    expect(res.payload).toEqual({ message: conflict.message });
    expect(touch.publish).not.toHaveBeenCalled();

    touch.action.mockReturnValueOnce(Promise.reject(new Error('Choisissez une machine.')));
    res = makeRes();
    postJob(makeReq(), res);
    await settled();
    expect(res.statusCode).toBe(400);
  });

  test('previewMotion answers 409 for a coded refusal and 500 otherwise', () => {
    let res = makeRes();
    previewMotion(makeReq({ body: { port: 'A' } }), res);
    expect(res.payload).toEqual({ dryRun: true });

    const busy = new Error('La machine doit être au repos (Idle).');
    busy.code = 'BUSY';
    touch.previewMotion.mockImplementationOnce(() => {
      throw busy;
    });
    res = makeRes();
    previewMotion(makeReq(), res);
    expect(res.statusCode).toBe(409);
    expect(res.payload).toEqual({ message: busy.message });

    touch.previewMotion.mockImplementationOnce(() => {
      throw new Error('private');
    });
    res = makeRes();
    previewMotion(makeReq(), res);
    expect(res.statusCode).toBe(500);
    expect(res.payload.message).not.toMatch(/private/);
  });

  test('getEvents hands the response to the stream and answers 503 when it is full', () => {
    const req = makeReq();
    let res = makeRes();
    getEvents(req, res);
    expect(touch.openEvents).toHaveBeenCalledWith(req, res, { kind: 'http', id: 'http:test', label: '', user: 'test' });
    expect(res.statusCode).toBe(200);

    touch.openEvents.mockReturnValueOnce(false);
    res = makeRes();
    getEvents(req, res);
    expect(res.statusCode).toBe(503);
  });

  test('getSystem sends uncached figures and hides read failures', () => {
    let res = makeRes();
    getSystem(makeReq(), res);
    expect(res.payload).toEqual({ cores: [12.5, 3], cpu: 7.8 });
    expect(res.headers['Cache-Control']).toBe('no-store');

    touch.systemStats.mockImplementationOnce(() => {
      throw new Error('private');
    });
    res = makeRes();
    getSystem(makeReq(), res);
    expect(res.statusCode).toBe(500);
    expect(res.payload.message).not.toMatch(/private/);
  });

  test('getBacklight sends the panel status, uncached', () => {
    const res = makeRes();
    getBacklight(makeReq(), res);
    expect(res.payload).toEqual({ available: true, writable: true, percent: 50 });
    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  test('postBacklight sets the level and maps refusals to their status', () => {
    let res = makeRes();
    postBacklight(makeReq({ body: { percent: 70 } }), res);
    expect(touch.setBacklight).toHaveBeenCalledWith(70);
    expect(res.payload.percent).toBe(70);

    const refused = Object.assign(new Error('Réglage refusé.'), { status: 409 });
    touch.setBacklight.mockImplementationOnce(() => {
      throw refused;
    });
    res = makeRes();
    postBacklight(makeReq({ body: { percent: 70 } }), res);
    expect(res.statusCode).toBe(409);
    expect(res.payload).toEqual({ message: 'Réglage refusé.' });

    touch.setBacklight.mockImplementationOnce(() => {
      throw new Error('private');
    });
    res = makeRes();
    postBacklight(makeReq({ body: null }), res);
    expect(res.statusCode).toBe(500);
    expect(res.payload.message).not.toMatch(/private/);
  });

  test('postBacklight routes temporary dimming and wake to the screen-saver calls', () => {
    let res = makeRes();
    postBacklight(makeReq({ body: { percent: 0, temporary: true } }), res);
    expect(touch.dimBacklight).toHaveBeenCalledWith(0);
    expect(touch.setBacklight).not.toHaveBeenCalled();
    expect(res.payload.temporary).toBe(true);
    res = makeRes();
    postBacklight(makeReq({ body: { wake: true } }), res);
    expect(touch.wakeBacklight).toHaveBeenCalledTimes(1);
    expect(res.payload.percent).toBe(60);
    // Only a literal true selects them.
    res = makeRes();
    postBacklight(makeReq({ body: { percent: 30, temporary: 'yes', wake: 1 } }), res);
    expect(touch.setBacklight).toHaveBeenCalledWith(30);
  });
});

describe('api.touch: continuous jog keepalive (F1)', () => {
  beforeEach(() => {
    Object.values(touch).forEach((fn) => fn.mockClear && fn.mockClear());
    touch.isStarted.mockReturnValue(true);
  });

  test('a keepalive answers alone: no snapshot, no stream publication; other motion operations keep both', async () => {
    touch.action.mockReturnValueOnce(Promise.resolve({ active: true, jogId: 'j1' }));
    let res = makeRes();
    postJob(makeReq({ body: { action: 'motion', operation: 'jog-keepalive', jogId: 'j1', clientId: 'tab' } }), res);
    await settled();
    expect(res.payload).toEqual({ active: true, jogId: 'j1' });
    expect(touch.snapshot).not.toHaveBeenCalled();
    expect(touch.publish).not.toHaveBeenCalled();

    res = makeRes();
    postJob(makeReq({ body: { action: 'motion', operation: 'jog-stop', clientId: 'tab' } }), res);
    await settled();
    expect(res.payload).toMatchObject({ message: 'ok', snapshot: { version: 1 } });
    expect(touch.publish).toHaveBeenCalledTimes(1);
  });
});

describe('api.touch: actor identity (F5) and the durable history (F4)', () => {
  beforeEach(() => {
    Object.values(touch).forEach((fn) => fn.mockClear && fn.mockClear());
    touch.isStarted.mockReturnValue(true);
  });

  test('the actor comes from the session and the persistent clientId, never from a kind or user claimed in the body', () => {
    expect(actorOf({ user: { id: 'u1', name: 'ana' }, body: { clientId: 'tablet-abc', clientLabel: 'Tablette atelier', kind: 'system', user: 'root' } }))
      .toEqual({ kind: 'touch', id: 'tablet-abc', label: 'Tablette atelier', user: 'ana' });
    expect(actorOf({ user: { id: 'u1' }, body: {} })).toEqual({ kind: 'http', id: 'http:u1', label: '', user: 'u1' });
    // The event stream is a GET: the client id travels in the query string.
    expect(actorOf({ user: { name: 'ana' }, query: { clientId: 'tablet-abc' } })).toEqual({ kind: 'touch', id: 'tablet-abc', label: '', user: 'ana' });
    expect(actorOf({ user: { name: 'ana' }, body: { clientId: 'x'.repeat(100), clientLabel: 'y'.repeat(100) } }).id).toHaveLength(80);
    const res = makeRes();
    postJob(makeReq({ user: { name: 'ana' }, body: { port: 'A', action: 'control', operation: 'claim', clientId: 'tablet-abc' } }), res);
    expect(touch.action).toHaveBeenCalledWith(expect.objectContaining({ action: 'control' }), { kind: 'touch', id: 'tablet-abc', label: '', user: 'ana' });
  });

  test('getHistory passes limit and before, answers uncached, hides the file path and read failures', async () => {
    let res = makeRes();
    getHistory({ user: { id: 'test' }, query: { limit: '20', before: '7' } }, res);
    await settled();
    expect(touch.readHistory).toHaveBeenCalledWith({ limit: '20', before: '7' });
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(res.payload).toEqual({ entries: [{ seq: 2, event: 'start' }], total: 2, skipped: 1, more: true });
    expect(JSON.stringify(res.payload)).not.toContain('/secret/path');

    touch.readHistory.mockReturnValueOnce(Promise.reject(new Error('private')));
    res = makeRes();
    getHistory(makeReq(), res);
    await settled();
    expect(res.statusCode).toBe(500);
    expect(res.payload.message).not.toMatch(/private/);
  });
});

describe('api.touch, cross-check 3: control refusals on the wire', () => {
  beforeEach(() => {
    Object.values(touch).forEach((fn) => fn.mockClear && fn.mockClear());
    touch.isStarted.mockReturnValue(true);
  });

  // D2 (corrigé) : le corps HTTP d'un refus de pilotage porte le code et le
  // propriétaire annoncés, pas seulement le texte.
  test('un refus ECONTROL du service part en 409 avec le message, code: ECONTROL et le propriétaire', async () => {
    const owner = { kind: 'touch', id: 'tablet-A', label: 'Tablette A' };
    const err = Object.assign(new Error('Pilotage de COM3 attribué à « Tablette A » (tablette, ana) : Pause et Arrêt restent possibles ; prenez le pilotage avec un motif ou attendez la fin de son bail.'), {
      status: 409, code: 'ECONTROL', owner
    });
    touch.action.mockReturnValueOnce(Promise.reject(err));
    const res = makeRes();
    postJob({ user: { name: 'bob' }, body: { port: 'COM3', action: 'start', clientId: 'tablet-B' } }, res);
    await settled();
    expect(res.statusCode).toBe(409);
    expect(res.payload).toEqual({ message: err.message, code: 'ECONTROL', owner });
    expect(touch.publish).not.toHaveBeenCalled();
    // Any other refusal keeps the plain {message} body.
    touch.action.mockReturnValueOnce(Promise.reject(Object.assign(new Error('Machine pas au repos.'), { status: 409, code: 'EOTHER', owner })));
    const other = makeRes();
    postJob({ user: { name: 'bob' }, body: { port: 'COM3', action: 'start' } }, other);
    await settled();
    expect(other.payload).toEqual({ message: 'Machine pas au repos.' });
  });

  test('l’acteur transmis au service vient de la session et du clientId ; un `kind`/`user` du corps est ignoré ; sans clientId → http', async () => {
    let res = makeRes();
    postJob({ user: { id: 'u7', name: 'ana' }, body: { port: 'COM3', action: 'pause', clientId: 'tab-1', clientLabel: 'Atelier', kind: 'system', user: 'root' } }, res);
    await settled();
    expect(touch.action).toHaveBeenLastCalledWith(expect.anything(), { kind: 'touch', id: 'tab-1', label: 'Atelier', user: 'ana' });
    res = makeRes();
    postJob({ user: { id: 'u7' }, body: { port: 'COM3', action: 'pause', clientId: '   ' } }, res);
    await settled();
    expect(touch.action).toHaveBeenLastCalledWith(expect.anything(), { kind: 'http', id: 'http:u7', label: '', user: 'u7' });
    // Le flux : clientId en query, donc présence ; sans query → acteur http (aucune présence Touch).
    getEvents({ user: { name: 'ana' }, query: { clientId: 'tab-1' } }, makeRes());
    expect(touch.openEvents).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), { kind: 'touch', id: 'tab-1', label: '', user: 'ana' });
  });

  test('GET api/touch-history : 401 sans session, 503 service arrêté, sinon pagination transmise et no-store', async () => {
    let res = makeRes();
    getHistory({ user: null, query: { limit: '5' } }, res);
    await settled();
    expect(res.statusCode).toBe(401);
    expect(touch.readHistory).not.toHaveBeenCalled();
    touch.isStarted.mockReturnValueOnce(false);
    res = makeRes();
    getHistory({ user: { id: 'u' }, query: {} }, res);
    await settled();
    expect(res.statusCode).toBe(503);
    res = makeRes();
    getHistory({ user: { id: 'u' }, query: { limit: '5', before: '42' } }, res);
    await settled();
    expect(touch.readHistory).toHaveBeenCalledWith({ limit: '5', before: '42' });
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(Object.keys(res.payload).sort()).toEqual(['entries', 'more', 'skipped', 'total']);
  });
});
