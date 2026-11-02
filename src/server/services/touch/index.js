// Touch service: the job service and its NDJSON event stream for the
// experimental touchscreen interface (see examples/cncjs-touch), plus the
// durable job history (F4) and the attribution of machine control (F5).
import settings from '../../config/settings';
import logger from '../../lib/logger';
import store from '../../store';
import config from '../configstore';
import { createService } from './job-service';
import { createStream, VERSION } from './touch-stream';
import { createSystemStats } from './system-stats';
import { createBacklight } from './backlight';
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

const refuseSocket = (socket, port, kind, cmdOrData) => {
  if (!control) {
    return null;
  }
  const safe = kind === 'command' ? safeCommand(cmdOrData) : safeWrite(cmdOrData);
  try {
    control.authorize(port, socketActor(socket), kind === 'command' ? cmdOrData : kind, { safe });
    return null;
  } catch (err) {
    if (err.code !== 'ECONTROL') {
      throw err;
    }
    return { message: err.message, owner: err.owner };
  }
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
  attachSocket,
  detachSocket,
  refuseSystemCommand,
  systemStats,
  backlightStatus,
  setBacklight,
  dimBacklight,
  wakeBacklight
};
