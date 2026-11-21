// Touch service: the job service and its NDJSON event stream for the
// experimental touchscreen interface (see examples/cncjs-touch), plus the
// durable job history (F4) and the attribution of machine control (F5).
import settings from '../../config/settings';
import logger from '../../lib/logger';
import store from '../../store';
import { localRequest } from '../../lib/local-request';
import config from '../configstore';
import { createService } from './job-service';
import { createStream, VERSION } from './touch-stream';
import { createSystemStats } from './system-stats';
import { createBacklight } from './backlight';
import { createWifi } from './wifi';
import { createUpdates } from './updates';
import { createHistory } from './history';
import { createControl, describeOwner, safeCommand, safeWrite } from './control';

const log = logger('service:touch');

let service = null;
let stream = null;
let system = null;
let backlight = null;
let history = null;
let control = null;

const start = () => {
  if (stream) {
    return;
  }
  history = createHistory({
    rcfile: settings.rcfile,
    onError: (err) => log.warn(`history: ${err && err.message}`)
  });
  control = createControl({
    onEvent: (event) => {
      // Control changes are part of the job history (who took the machine, when).
      history.record({
        event: 'control',
        change: event.type,
        port: event.port,
        owner: event.owner,
        previous: event.previous || null,
        reason: event.reason || '',
        by: event.by || null,
        admin: !!event.admin
      });
    }
  });
  service = createService(store, config, undefined, { history, control });
  stream = createStream(service);
  system = createSystemStats();
  system.start();
  backlight = createBacklight({ config });
  backlight.restore();
};

const stop = () => {
  if (!stream) {
    return;
  }
  stream.dispose(); // also disposes the service
  system.stop();
  control.dispose();
  history.dispose();
  stream = null;
  service = null;
  system = null;
  backlight = null;
  history = null;
  control = null;
};

const isStarted = () => Boolean(stream);

const snapshot = () => stream.snapshot();

const publish = () => stream.publish();

// `actor` is who asks ({kind, id, label, user}), set by the API from the
// session and the client's persistent id, never from the body alone.
const action = (body, actor) => service.action(body, actor);

const previewMotion = (body) => service.previewMotion(body);

const openEvents = (req, res, client) => stream.open(req, res, client);

// Reserves the machine for a host command (see job-service): throws 409 when
// a controller is busy or another command holds it; returns { release }.
const reserveSystemCommand = (command) => service.reserveSystemCommand(command);

// Durable job history, most recent first.
const readHistory = (query) => history.read(query);

// Socket.IO policy hook (CNCEngine): a `command`, `write` or `writeln` from a
// socket is refused, with a French message naming the owner, when the port
// is owned by someone else and the command moves the machine. Stops, holds,
// resets and status queries always pass. Returns null when allowed.
const socketActor = (socket) => {
  const user = (socket && socket.decoded_token) || {};
  const address = socket && socket.handshake && socket.handshake.address;
  return {
    kind: 'socket',
    id: String(socket && socket.id),
    label: 'CNCjs' + (address ? ' ' + address : ''),
    user: typeof user.name === 'string' ? user.name : ''
  };
};

// F5: recheck the actual Socket.IO HTTP peer and all leases at the open boundary.
// A closed port normally has no lease; refusing every remaining lease is conservative.
const refuseAutoConnect = (socket) => {
  if (!control || !localRequest(socket && socket.request)) {
    return { message: 'Reconnexion automatique réservée à la tablette de la machine.' };
  }
  if (Object.keys(control.owners()).length) {
    return { message: 'Un appareil a la main. Connectez la machine manuellement.' };
  }
  return null;
};

// A full homing cycle sent by a socket and written to the port at once: the `homing` command or
// the single line $H by `writeln` (GrblController writes both directly). A $H by the `gcode`
// command goes through the feeder, which may drop it (feeder:stop, Alarm) after the cycle of an
// earlier $HX: it is not one. $HX/$HY/$HZ home some axes only and are not one either.
const fullHoming = (kind, cmdOrData) => {
  if (kind === 'command') {
    return cmdOrData === 'homing';
  }
  // ASCII spaces only: a character ≥ 0x80 makes writeln send the data without its newline (realtime).
  return kind === 'writeln' && typeof cmdOrData === 'string' && /^[ \t]*\$h[ \t]*$/i.test(cmdOrData);
};

// What a safe socket command or raw write (control.js SAFE_COMMANDS, SAFE_WRITES: the only ones
// that pass while a sequence of the server runs) does to that sequence (PLAN-CORRECTIONS § 1.6,
// lot F1 second review): 'query' only asks (a status, the probe state); 'jog-cancel' only cancels
// a jog (`jogCancel`, 0x85 alone or with queries); everything else is a 'stop' (a hold, a reset,
// autolevel:stop which resets, the safety door 0x84, a feeder stop…), including a safe command
// added later to control.js and not named here.
const SOCKET_QUERY_COMMANDS = ['statusreport', 'autolevel:getProbeState'];
const socketEffect = (kind, cmdOrData) => {
  if (kind === 'command') {
    if (SOCKET_QUERY_COMMANDS.includes(cmdOrData)) {
      return 'query';
    }
    return cmdOrData === 'jogCancel' ? 'jog-cancel' : 'stop';
  }
  // Read as safeWrite reads it.
  const line = String(cmdOrData === undefined || cmdOrData === null ? '' : cmdOrData).replace(/[\r\n]/g, '').trim();
  const acts = Array.from(line).filter((ch) => ch !== '?');
  if (!acts.length) {
    return 'query';
  }
  return acts.every((ch) => ch === '\x85') ? 'jog-cancel' : 'stop';
};

const refuseSocket = (socket, port, kind, cmdOrData) => {
  if (!control) {
    return null;
  }
  const safe = kind === 'command' ? safeCommand(cmdOrData) : safeWrite(cmdOrData);
  // The one passage of a safe command or write that is not a query: it first ends, synchronously,
  // a framing of the server (either way), and a stop also the probes and the work offset check D2;
  // then it goes its own way.
  const effect = safe ? socketEffect(kind, cmdOrData) : '';
  if (effect === 'stop') {
    service.socketStop(port);
  } else if (effect === 'jog-cancel') {
    service.socketJogCancel(port);
  }
  try {
    // Nothing that moves or writes passes, whoever owns the port, while a sequence of the server
    // runs or a host command holds the machine (C-12, C-60).
    if (!safe) {
      const busy = service.socketRefusal(port);
      if (busy) {
        return { message: busy.message, code: busy.code };
      }
    }
    control.authorize(port, socketActor(socket), kind === 'command' ? cmdOrData : kind, { safe });
    // Allowed: what it sends decides whether a homing cycle seen next may teach the
    // travel convention (job-service socketCommand). Stops and status queries change nothing.
    if (!safe) {
      service.socketCommand(port, fullHoming(kind, cmdOrData));
    }
    return null;
  } catch (err) {
    if (err.code !== 'ECONTROL') {
      throw err;
    }
    return { message: err.message, owner: err.owner };
  }
};

// CNCjs's own upload (api.gcode.js, POST /api/gcode) replaces the program of the sender: refused
// while a framing of the server runs or waits to start (lot F1, review C3). Null when allowed,
// else { message }.
const refuseUpload = (port) => {
  if (!service) {
    return null;
  }
  const busy = service.uploadRefusal(port);
  return busy ? { message: busy.message } : null;
};

const attachSocket = (socket) => {
  if (control) {
    control.attach(socketActor(socket), socket.id);
  }
};

const detachSocket = (socket) => {
  if (control) {
    control.detach(socketActor(socket), socket.id);
  }
};

// Host commands (api.commands): refused while a port is owned by someone else
// than the caller (the owner is piloting; the command would take the machine
// away from them). Returns null when allowed, else { message, owner }.
const refuseSystemCommand = (actor) => {
  if (!control) {
    return null;
  }
  const owners = control.owners();
  const ports = Object.keys(owners);
  for (let i = 0; i < ports.length; i++) {
    const port = ports[i];
    try {
      control.authorize(port, actor, 'systemCommand');
    } catch (err) {
      if (err.code !== 'ECONTROL') {
        throw err;
      }
      return { message: 'Pilotage de ' + port + ' attribué à ' + describeOwner(err.owner) + ' : commande système refusée tant qu’il pilote.', owner: err.owner };
    }
  }
  return null;
};

const systemStats = () => system.read();

const backlightStatus = () => backlight.status();

const setBacklight = (percent) => backlight.set(percent);

const dimBacklight = (percent) => backlight.dim(percent);

const wakeBacklight = () => backlight.wake();

// Wi-Fi of the CNCjs host (Réglages → Système). Joining a network or scanning
// cuts the link for a moment: taken like a host command, refused while a job,
// a pause, a move, a homing, a probe or a load is in progress, or while
// another device pilots a port, and machine actions wait while it runs.
const wifi = createWifi();
const wifiStatus = () => wifi.status();
const wifiAction = async (body, actor) => {
  const action = body && body.action;
  if (action !== 'scan' && action !== 'connect' && action !== 'forget') {
    throw Object.assign(new Error('Action Wi-Fi inconnue.'), { status: 400 });
  }
  const refused = refuseSystemCommand(actor);
  if (refused) {
    throw Object.assign(new Error(refused.message), { status: 409 });
  }
  const titles = { scan: 'Recherche des réseaux Wi-Fi', forget: 'Oubli d’un réseau Wi-Fi', connect: 'Changement de réseau Wi-Fi' };
  const reservation = service.reserveSystemCommand({ id: 'touch-wifi', title: titles[action] });
  try {
    if (action === 'scan') {
      return await wifi.scan();
    }
    if (action === 'forget') {
      return await wifi.forget({ ssid: body.ssid });
    }
    return await wifi.connect({ ssid: body.ssid, password: body.password, hidden: body.hidden === true });
  } finally {
    reservation.release();
  }
};

// System updates of the CNCjs host (Réglages → Système). Taken like a host
// command for the whole task (minutes for an install): refused while a job, a
// pause, a move, a homing, a probe or a load is in progress, or while another
// device pilots a port; machine actions wait until it ends. The API answers at
// once; the page follows updatesStatus().
const updates = createUpdates();
const updatesStatus = () => updates.status();
const updatesAction = (body, actor) => {
  const action = body && body.action;
  if (action !== 'check' && action !== 'install') {
    throw Object.assign(new Error('Action de mise à jour inconnue.'), { status: 400 });
  }
  const refused = refuseSystemCommand(actor);
  if (refused) {
    throw Object.assign(new Error(refused.message), { status: 409 });
  }
  const titles = { check: 'Recherche des mises à jour du système', install: 'Installation des mises à jour du système' };
  const reservation = service.reserveSystemCommand({ id: 'touch-updates', title: titles[action] });
  try {
    updates.start(action).then(() => reservation.release());
  } catch (err) {
    reservation.release();
    throw err;
  }
  return updates.status();
};

export default {
  VERSION,
  start,
  stop,
  isStarted,
  snapshot,
  publish,
  action,
  previewMotion,
  openEvents,
  reserveSystemCommand,
  readHistory,
  refuseSocket,
  refuseAutoConnect,
  refuseUpload,
  attachSocket,
  detachSocket,
  refuseSystemCommand,
  systemStats,
  backlightStatus,
  setBacklight,
  dimBacklight,
  wakeBacklight,
  wifiStatus,
  wifiAction,
  updatesStatus,
  updatesAction
};
