/* eslint-env jest */
import { createControl, safeCommand, safeWrite, actorOf, SAFE_ACTIONS } from '../control';

const tablet = { kind: 'touch', id: 'tablet-abc', label: 'Tablette atelier', user: 'ana' };
const phone = { kind: 'touch', id: 'phone-xyz', label: 'Téléphone', user: 'bob' };
const pc = { kind: 'socket', id: 'sock-1', label: 'PC bureau', user: 'ana' };

const setup = (options = {}) => {
  const ctx = { now: 1700000000000, ms: 5000, events: [] };
  ctx.control = createControl({
    now: () => ctx.now,
    elapsed: () => ctx.ms,
    graceMs: 60000,
    onEvent: (e) => ctx.events.push(e),
    ...options
  });
  ctx.advance = (ms) => {
    ctx.now += ms;
    ctx.ms += ms;
  };
  return ctx;
};

describe('control attribution (F5)', () => {
  test('a second client is refused with a message naming the owner; Pause and Stop stay allowed to it', () => {
    const { control, events } = setup();
    control.attach(tablet, 't1');
    const claimed = control.claim('COM3', tablet);
    expect(claimed.role).toBe('operator');
    expect(claimed.owner).toMatchObject({ kind: 'touch', id: 'tablet-abc', label: 'Tablette atelier', user: 'ana', present: true, expires: null });
    expect(() => control.authorize('COM3', phone, 'start')).toThrow(/Pilotage de COM3 attribué à « Tablette atelier » \(tablette, ana\).*Pause et Arrêt restent possibles/);
    expect(() => control.claim('COM3', phone)).toThrow(/Tablette atelier/);
    let refusal;
    try {
      control.authorize('COM3', phone, 'jog');
    } catch (err) {
      refusal = err;
    }
    expect(refusal.status).toBe(409);
    expect(refusal.code).toBe('ECONTROL');
    expect(refusal.owner.id).toBe('tablet-abc');
    // Safe operations never need the lease.
    expect(control.authorize('COM3', phone, 'pause', { safe: true }).id).toBe('tablet-abc');
    expect(control.authorize('COM3', phone, 'stop', { safe: true }).id).toBe('tablet-abc');
    // The owner itself passes, and an anonymous caller is refused too.
    expect(control.authorize('COM3', tablet, 'start').id).toBe('tablet-abc');
    expect(() => control.authorize('COM3', null, 'start')).toThrow(/attribué/);
    expect(control.inspect('COM3', phone)).toMatchObject({ role: 'observer', owner: { id: 'tablet-abc' } });
    expect(events.map((e) => e.type)).toEqual(['claim']);
    expect(SAFE_ACTIONS).toEqual(expect.arrayContaining(['pause', 'stop', 'spindleStop']));
  });

  test('an abandoned tab frees the port after the grace delay, never transfers it, and the event is recorded', () => {
    const ctx = setup();
    const { control, events } = ctx;
    control.attach(tablet, 't1');
    control.claim('COM3', tablet);
    control.detach(tablet, 't1');
    let owner = control.inspect('COM3').owner;
    expect(owner).toMatchObject({ id: 'tablet-abc', present: false, expires: ctx.now + 60000 });
    ctx.advance(59000);
    expect(control.inspect('COM3').owner.id).toBe('tablet-abc');
    expect(() => control.authorize('COM3', phone, 'start')).toThrow(/Tablette atelier/);
    ctx.advance(1000);
    expect(control.inspect('COM3').owner).toBeNull();
    expect(control.inspect('COM3').lastChange).toMatchObject({ type: 'expired', previous: { id: 'tablet-abc' } });
    expect(events.map((e) => e.type)).toEqual(['claim', 'absent', 'expired']);
    // Free again: the next client claims explicitly, nothing was handed over.
    expect(control.authorize('COM3', phone, 'start')).toBeNull();
    expect(control.claim('COM3', phone).owner.id).toBe('phone-xyz');
    expect(events.map((e) => e.type)).toEqual(['claim', 'absent', 'expired', 'claim']);
  });

  test('a reconnection with the same clientId inside the grace delay restores the lease', () => {
    const ctx = setup();
    const { control, events } = ctx;
    control.attach(tablet, 't1');
    control.claim('COM3', tablet);
    control.detach(tablet, 't1');
    ctx.advance(45000);
    control.attach(tablet, 't2');
    expect(control.inspect('COM3').owner).toMatchObject({ id: 'tablet-abc', present: true, expires: null });
    ctx.advance(120000);
    expect(control.inspect('COM3').owner.id).toBe('tablet-abc');
    expect(events.map((e) => e.type)).toEqual(['claim', 'absent', 'restored']);
    // Two tabs on the same tablet: the lease stays while one of them is open.
    control.attach(tablet, 't3');
    control.detach(tablet, 't2');
    expect(control.inspect('COM3').owner.present).toBe(true);
    control.detach(tablet, 't3');
    expect(control.inspect('COM3').owner.present).toBe(false);
    // A different clientId after the grace delay does not inherit anything.
    ctx.advance(60000);
    control.attach(phone, 'p1');
    expect(control.inspect('COM3').owner).toBeNull();
  });

  test('a claim without presence expires after the grace delay unless the owner keeps acting', () => {
    const ctx = setup();
    const { control } = ctx;
    const who = { kind: 'http', id: 'http:ana', user: 'ana' };
    control.claim('COM3', who);
    expect(control.inspect('COM3').owner.expires).toBe(ctx.now + 60000);
    ctx.advance(40000);
    control.authorize('COM3', who, 'start');
    expect(control.inspect('COM3').owner.expires).toBe(ctx.now + 60000);
    ctx.advance(40000);
    expect(control.inspect('COM3').owner.id).toBe('http:ana');
    ctx.advance(20000);
    expect(control.inspect('COM3').owner).toBeNull();
  });

  test('an explicit takeover needs a reason, is recorded with it, and the previous owner is then refused', () => {
    const { control, events } = setup();
    control.attach(tablet, 't1');
    control.attach(phone, 'p1');
    control.claim('COM3', tablet);
    expect(() => control.takeover('COM3', phone)).toThrow(/indiquez un motif/);
    expect(() => control.takeover('COM3', phone, 'ok')).toThrow(/motif/);
    const taken = control.takeover('COM3', phone, 'Opérateur parti déjeuner');
    expect(taken.owner.id).toBe('phone-xyz');
    expect(taken.previous.id).toBe('tablet-abc');
    expect(taken.role).toBe('operator');
    const change = control.inspect('COM3', tablet).lastChange;
    expect(change).toMatchObject({ type: 'takeover', reason: 'Opérateur parti déjeuner', previous: { id: 'tablet-abc' }, owner: { id: 'phone-xyz' }, admin: false });
    expect(control.inspect('COM3', tablet).role).toBe('observer');
    expect(() => control.authorize('COM3', tablet, 'resume')).toThrow(/Téléphone/);
    expect(control.authorize('COM3', tablet, 'stop', { safe: true }).id).toBe('phone-xyz');
    expect(events.map((e) => e.type)).toEqual(['claim', 'takeover']);
    // A takeover of a free port, or of one's own port, is a plain claim.
    expect(control.takeover('COM4', tablet, 'x').owner.id).toBe('tablet-abc');
    expect(control.takeover('COM3', phone).owner.id).toBe('phone-xyz');
  });

  test('an admin may take over or release without a reason', () => {
    const { control } = setup({ isAdmin: (who) => who.user === 'root' });
    const admin = { kind: 'http', id: 'http:root', user: 'root' };
    control.claim('COM3', tablet);
    expect(control.inspect('COM3', admin).role).toBe('admin');
    const taken = control.takeover('COM3', admin);
    expect(taken.owner.id).toBe('http:root');
    expect(control.inspect('COM3').lastChange.admin).toBe(true);
    control.claim('COM4', tablet);
    expect(control.release('COM4', admin).owner).toBeNull();
  });

  test('release is for the owner only and is idempotent; a closed port forgets its lease', () => {
    const { control, events } = setup();
    control.claim('COM3', tablet);
    expect(() => control.release('COM3', phone)).toThrow(/Tablette atelier/);
    expect(control.release('COM3', tablet).owner).toBeNull();
    expect(control.release('COM3', tablet).owner).toBeNull();
    expect(control.inspect('COM3').lastChange).toMatchObject({ type: 'release', previous: { id: 'tablet-abc' } });
    control.claim('COM5', pc);
    control.forget('COM5');
    expect(control.inspect('COM5').owner).toBeNull();
    expect(events.map((e) => e.type)).toEqual(['claim', 'release', 'claim', 'release']);
  });

  test('a free port is open to everyone; a guarded touch operation claims it only when asked to', () => {
    const { control } = setup();
    expect(control.authorize('COM3', pc, 'gcode:start')).toBeNull();
    expect(control.inspect('COM3').owner).toBeNull();
    expect(control.authorize('COM3', tablet, 'start', { claim: true })).toMatchObject({ id: 'tablet-abc' });
    expect(control.inspect('COM3', tablet).role).toBe('operator');
    expect(control.inspect('COM3', pc).role).toBe('observer');
    expect(() => control.authorize('COM3', pc, 'gcode:start')).toThrow(/interface CNCjs|tablette/);
    expect(control.owners().COM3.owner.id).toBe('tablet-abc');
    expect(control.signature()).toMatch(/COM3=touch:tablet-abc/);
    // Unidentified callers cannot claim.
    expect(() => control.claim('COM3', { kind: 'touch' })).toThrow(/non identifié/);
    expect(() => actorOf({ kind: 'other', id: 'x' })).toThrow(/non identifié/);
    expect(actorOf({ kind: 'touch', id: ' id ', label: 'x'.repeat(100) }).label).toHaveLength(60);
  });

  test('socket commands and raw writes are classed: stops, holds, resets and status are free; motion needs the lease', () => {
    ['pause', 'gcode:pause', 'stop', 'gcode:stop', 'feedhold', 'reset', 'feeder:stop', 'jogCancel', 'statusreport', 'sleep'].forEach((cmd) => {
      expect(safeCommand(cmd)).toBe(true);
    });
    ['gcode:start', 'gcode:resume', 'cyclestart', 'start', 'resume', 'gcode', 'gcode:load', 'homing', 'unlock', 'feedOverride',
      'spindleOverride', 'rapidOverride', 'macro:run', 'macro:load', 'feeder:feed', 'feeder:start', 'lasertest:on', 'tool:change',
      'autolevel:start', 'watchdir:load', 'gcode:unload'].forEach((cmd) => {
      expect(safeCommand(cmd)).toBe(false);
    });
    expect(safeWrite('?')).toBe(true);
    expect(safeWrite('!')).toBe(true);
    expect(safeWrite('\x18')).toBe(true);
    expect(safeWrite('\x85\n')).toBe(true);
    expect(safeWrite('~')).toBe(false);
    expect(safeWrite('G0 X10')).toBe(false);
    expect(safeWrite('$X')).toBe(false);
    expect(safeWrite('$J=X10 F500')).toBe(false);
    expect(safeWrite('\x91')).toBe(false);
    expect(safeWrite('')).toBe(false);
    expect(safeWrite(undefined)).toBe(false);
  });

  test('dispose ends every lease', () => {
    const { control } = setup();
    control.claim('COM3', tablet);
    control.dispose();
    expect(control.owners()).toEqual({});
  });
});
