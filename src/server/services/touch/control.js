// Explicit attribution of machine control (F5): per port, one visible owner
// (a touch tablet, a socket client, an HTTP caller or the system) holds a
// lease; everyone else is an observer. The lease lives while its owner is
// present (an open touch event stream with the same persistent clientId, a
// connected socket) and for a grace delay after the owner vanishes, so a
// network blip or a page reload keeps it and an abandoned tab frees the port
// — never transfers it. A port is only taken from a present owner by an
// explicit takeover carrying a reason (or made by an admin), which is
// recorded and shown to the previous owner through the stream.
//
// Policy on a free port: operations are allowed (classic interface
// compatibility); a touch client that identifies itself claims the port by
// its first guarded operation (the claim is visible in every snapshot).
// Pause and Stop never need the lease.
import { performance } from 'perf_hooks';

// After its last presence vanished, a lease survives this long.
export const GRACE_MS = 60000;

// An owner back within this delay was never absent: the planned rotation of
// its stream (every 60 s) or a page reload reattaches well within it, and
// neither is worth an 'absent' / 'restored' pair in the durable history
// (bug hunt B-1). The lease is still "not present" meanwhile.
export const REATTACH_MS = 10000;

// A lease whose owner did nothing for this long, while the machine is at
// rest (no job, load, probe, homing, jog or pending confirmation), is
// released: an idle kiosk must not lock the PC out indefinitely. The port
// becomes free; nobody gets it without asking (decision of 2026-10-30).
export const IDLE_MS = 5 * 60 * 1000;

export const KINDS = ['touch', 'socket', 'http', 'system'];

// Job-service actions that stop or hold the machine: allowed to every
// authenticated client, owner or not.
export const SAFE_ACTIONS = ['pause', 'stop', 'spindleStop', 'settings', 'resumePlan', 'check', 'control'];

// Socket.IO `command` names that only stop, hold, cancel, report or unload
// nothing dangerous: free for everyone. Every other command (start, resume,
// cycle start, feed, jog, homing, unlock, overrides, laser test, macros,
// G-code, tool change, autolevel start, loading) needs the lease when the
// port is owned.
export const SAFE_COMMANDS = ['pause', 'gcode:pause', 'stop', 'gcode:stop', 'feedhold', 'reset', 'feeder:stop',
  'jogCancel', 'statusreport', 'sleep', 'lasertest:off', 'autolevel:stop', 'autolevel:getProbeState'];

// Raw lines free for everyone: status (?), feed hold (!), soft reset (^X),
// safety door (0x84), jog cancel (0x85), spindle stop toggle during a hold
// (0x9E). Cycle start (~), overrides and coolant toggles need the lease.
export const SAFE_WRITES = ['?', '!', '\x18', '\x84', '\x85', '\x9e'];

const KIND_LABELS = { touch: 'tablette', socket: 'interface CNCjs', http: 'client HTTP', system: 'système' };

const conflict = (message, owner) => {
  const err = new Error(message);
  err.status = 409;
  err.code = 'ECONTROL';
  err.owner = owner;
  return err;
};

const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// Normalizes an actor descriptor; throws when it cannot identify anyone.
export const actorOf = (who) => {
  const kind = who && KINDS.includes(who.kind) ? who.kind : null;
  const id = text(who && who.id, 80);
  if (!kind || !id) {
    throw conflict('Client non identifié : impossible d’attribuer le pilotage.');
  }
  return { kind, id, label: text(who.label, 60), user: text(who.user, 60) };
};

const keyOf = (who) => who.kind + ':' + who.id;

export const describeOwner = (owner) => {
  if (!owner) {
    return '';
  }
  const name = owner.label || owner.user || owner.id;
  return '« ' + name + ' » (' + (KIND_LABELS[owner.kind] || owner.kind) + (owner.user && owner.user !== name ? ', ' + owner.user : '') + ')';
};

export const createControl = ({ now = Date.now, elapsed = () => performance.now(), graceMs = GRACE_MS, idleMs = IDLE_MS, isAdmin = () => false, onEvent } = {}) => {
  // port → { who, key, since, graceEnd (elapsed() when the lease ends, null while
  // present), absentAt (elapsed() of the last detach, null otherwise), absentTold
  // ('absent' emitted for this absence) }
  const leases = new Map();
  // key → Set of presence handles (transport ids, socket ids)
  const present = new Map();
  // port → last change, kept until the next one (the stream shows it)
  const changes = new Map();
  let disposed = false;

  const publicOwner = (lease) => {
    if (!lease) {
      return null;
    }
    const remaining = lease.graceEnd === null ? null : Math.max(0, lease.graceEnd - elapsed());
    return {
      kind: lease.who.kind,
      id: lease.who.id,
      label: lease.who.label,
      user: lease.who.user,
      since: lease.since,
      present: lease.graceEnd === null,
      expires: remaining === null ? null : now() + remaining
    };
  };

  const emit = (type, port, lease, extra = {}) => {
    const change = { type, port, owner: publicOwner(lease), at: now(), ...extra };
    changes.set(port, change);
    if (typeof onEvent === 'function') {
      onEvent(change);
    }
    return change;
  };

  const isPresent = (key) => present.has(key) && present.get(key).size > 0;

  // Ends the leases whose grace delay is over. With `busy` (a function of the
  // port telling whether the machine is doing or about to do something), the
  // leases idle for idleMs on a machine at rest end too ('idle'); without it
  // (the internal checks before an operation) only the grace delay applies.
  // An absence that outlasts REATTACH_MS is told here ('absent'), once.
  const tick = ({ busy } = {}) => {
    if (disposed) {
      return [];
    }
    const expired = [];
    for (const [port, lease] of leases) {
      if (lease.graceEnd !== null && lease.absentAt !== null && !lease.absentTold && elapsed() - lease.absentAt >= REATTACH_MS) {
        lease.absentTold = true;
        expired.push(emit('absent', port, lease));
      }
      if (lease.graceEnd !== null && elapsed() >= lease.graceEnd) {
        leases.delete(port);
        expired.push(emit('expired', port, null, { previous: publicOwner({ ...lease, graceEnd: lease.graceEnd }) }));
      } else if (typeof busy === 'function') {
        // Activity of the machine counts as activity of its owner, sampled at
        // every heartbeat: the rest is counted from the end of that activity.
        if (busy(port)) {
          lease.active = elapsed();
        } else if (elapsed() - lease.active >= idleMs) {
          leases.delete(port);
          expired.push(emit('idle', port, null, { previous: publicOwner(lease), idleMs }));
        }
      }
    }
    return expired;
  };

  const roleOf = (lease, who) => {
    if (who && isAdmin(who)) {
      return 'admin';
    }
    return lease && who && lease.key === keyOf(who) ? 'operator' : 'observer';
  };

  const inspect = (port, who) => {
    tick();
    const lease = leases.get(port) || null;
    const actor = who ? actorOf(who) : null;
    return { owner: publicOwner(lease), role: roleOf(lease, actor), lastChange: changes.get(port) || null };
  };

  const refusal = (port, lease) => {
    const owner = publicOwner(lease);
    return conflict('Pilotage de ' + port + ' attribué à ' + describeOwner(owner) + ' : Pause et Arrêt restent possibles ; prenez le pilotage avec un motif ou attendez la fin de son bail.', owner);
  };

  // Starts (or renews) the grace delay of a lease whose owner is not present.
  const renew = (lease) => {
    if (!isPresent(lease.key)) {
      lease.graceEnd = elapsed() + graceMs;
    }
  };

  const claim = (port, who) => {
    tick();
    const actor = actorOf(who);
    const key = keyOf(actor);
    let lease = leases.get(port);
    if (lease && lease.key !== key) {
      throw refusal(port, lease);
    }
    if (!lease) {
      lease = { who: actor, key, since: now(), graceEnd: null, active: elapsed(), absentAt: null, absentTold: false };
      leases.set(port, lease);
      renew(lease);
      emit('claim', port, lease);
    } else {
      lease.who = { ...lease.who, label: actor.label || lease.who.label, user: actor.user || lease.who.user };
      lease.graceEnd = isPresent(key) ? null : elapsed() + graceMs;
      lease.active = elapsed();
    }
    return { owner: publicOwner(lease), role: roleOf(lease, actor) };
  };

  const release = (port, who) => {
    tick();
    const actor = actorOf(who);
    const lease = leases.get(port);
    if (!lease) {
      return { owner: null, role: roleOf(null, actor) };
    }
    if (lease.key !== keyOf(actor) && !isAdmin(actor)) {
      throw refusal(port, lease);
    }
    leases.delete(port);
    emit('release', port, null, { previous: publicOwner(lease), by: actor });
    return { owner: null, role: roleOf(null, actor) };
  };

  // Takes an owned port: a reason is required unless the caller is an admin.
  const takeover = (port, who, reason) => {
    tick();
    const actor = actorOf(who);
    const why = text(reason, 200);
    const lease = leases.get(port);
    if (!lease || lease.key === keyOf(actor)) {
      return claim(port, actor);
    }
    if (why.length < 3 && !isAdmin(actor)) {
      throw conflict('Prise de pilotage refusée : indiquez un motif (3 caractères au moins). Pilotage actuel : ' + describeOwner(publicOwner(lease)) + '.', publicOwner(lease));
    }
    const previous = publicOwner(lease);
    const next = { who: actor, key: keyOf(actor), since: now(), graceEnd: null, active: elapsed(), absentAt: null, absentTold: false };
    leases.set(port, next);
    renew(next);
    emit('takeover', port, next, { previous, reason: why, admin: isAdmin(actor) });
    return { owner: publicOwner(next), previous, role: roleOf(next, actor) };
  };

  // Throws when `port` is owned by someone else and the operation is not a
  // safe one. Returns the current public owner (null when free). `options.claim`
  // claims a free port for the caller.
  const authorize = (port, who, operation, { safe = false, claim: wanted = false } = {}) => {
    tick();
    const lease = leases.get(port);
    if (!lease) {
      if (wanted && who) {
        return claim(port, who).owner;
      }
      return null;
    }
    const actor = who ? actorOf(who) : null;
    if (actor && lease.key === keyOf(actor)) {
      renew(lease);
      lease.active = elapsed();
      return publicOwner(lease);
    }
    if (safe) {
      return publicOwner(lease);
    }
    throw refusal(port, lease);
  };

  const attach = (who, handle) => {
    // A lease whose grace is over ends first: coming back late restores nothing.
    tick();
    const actor = actorOf(who);
    const key = keyOf(actor);
    if (!present.has(key)) {
      present.set(key, new Set());
    }
    present.get(key).add(handle);
    for (const [port, lease] of leases) {
      if (lease.key === key && lease.graceEnd !== null) {
        lease.graceEnd = null;
        const told = lease.absentTold;
        lease.absentAt = null;
        lease.absentTold = false;
        // Back before the absence was told: nothing happened worth recording.
        if (told) {
          emit('restored', port, lease);
        }
      }
    }
  };

  const detach = (who, handle) => {
    const actor = actorOf(who);
    const key = keyOf(actor);
    const handles = present.get(key);
    if (!handles) {
      return;
    }
    handles.delete(handle);
    if (handles.size) {
      return;
    }
    present.delete(key);
    for (const [port, lease] of leases) {
      if (lease.key === key && lease.graceEnd === null) {
        lease.graceEnd = elapsed() + graceMs;
        lease.absentAt = elapsed();
        lease.absentTold = false;
      }
    }
  };

  // Port → public owner, for the shared snapshot.
  const owners = () => {
    tick();
    const out = {};
    for (const [port, lease] of leases) {
      out[port] = { owner: publicOwner(lease), lastChange: changes.get(port) || null };
    }
    return out;
  };

  // Forgets a port (controller closed): its lease ends without transfer.
  const forget = (port) => {
    const lease = leases.get(port);
    if (lease) {
      leases.delete(port);
      emit('release', port, null, { previous: publicOwner(lease), by: { kind: 'system', id: 'port-closed' } });
    }
  };

  const dispose = () => {
    disposed = true;
    leases.clear();
    present.clear();
    changes.clear();
  };

  // Cheap signature of everything a snapshot shows, for change detection.
  const signature = () => {
    const parts = [];
    for (const [port, lease] of leases) {
      parts.push(port + '=' + lease.key + ':' + lease.since + ':' + (lease.graceEnd === null ? 'p' : 'a'));
    }
    for (const [port, change] of changes) {
      parts.push(port + '!' + change.type + ':' + change.at);
    }
    return parts.join('|');
  };

  return { inspect, claim, release, takeover, authorize, attach, detach, tick, owners, forget, signature, dispose };
};

// Socket.IO commands: is this command free for everyone?
export const safeCommand = (cmd) => SAFE_COMMANDS.includes(cmd);

// Raw writes: a line made only of realtime stop/status characters is free.
export const safeWrite = (data) => {
  const line = String(data === undefined || data === null ? '' : data).replace(/[\r\n]/g, '').trim();
  return line.length > 0 && Array.from(line).every((ch) => SAFE_WRITES.includes(ch));
};

export default { createControl, actorOf, describeOwner, safeCommand, safeWrite, GRACE_MS, IDLE_MS, SAFE_ACTIONS, SAFE_COMMANDS, SAFE_WRITES, KINDS };
