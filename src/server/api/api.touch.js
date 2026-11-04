import logger from '../lib/logger';
import touch from '../services/touch';
import { list as listProjects, read as readProjectSheet, write as writeProjectSheet } from '../services/touch/projects';
import {
  ERR_BAD_REQUEST,
  ERR_UNAUTHORIZED,
  ERR_NOT_FOUND,
  ERR_CONFLICT,
  ERR_PAYLOAD_TOO_LARGE,
  ERR_INTERNAL_SERVER_ERROR,
  ERR_SERVICE_UNAVAILABLE
} from '../constants';

const log = logger('api:touch');

// express-jwt populates req.user, but the error handler in app.js lets
// unauthenticated requests through in development mode. These routes can move
// a machine, so every one of them re-checks the session itself.
const authorized = (handler) => (req, res) => {
  if (!req.user || typeof req.user !== 'object') {
    res.status(ERR_UNAUTHORIZED).send({ message: 'Session CNCjs requise.' });
    return;
  }
  if (!touch.isStarted()) {
    res.status(ERR_SERVICE_UNAVAILABLE).send({ message: 'Suivi indisponible.' });
    return;
  }
  handler(req, res);
};

export const getHealth = authorized((req, res) => {
  res.send({ loaded: true, version: touch.VERSION, protocol: 1, transport: 'ndjson' });
});

export const getJob = authorized((req, res) => {
  try {
    res.send(touch.snapshot());
  } catch (err) {
    // The client only gets a generic message; the details belong in the log.
    log.error(`snapshot failed: ${err && err.stack}`);
    res.status(ERR_INTERNAL_SERVER_ERROR).send({ message: 'État indisponible.' });
  }
});

// Who asks, for the attribution of control (F5) and the history (F4): the
// session user from the token, the persistent client id the touch page sends
// (`clientId`, kept in its localStorage) and its label. Never the body alone.
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export const actorOf = (req) => {
  const user = text(req.user.name, 60) || text(req.user.id, 60);
  const body = req.body || {};
  const query = req.query || {};
  const clientId = text(body.clientId, 80) || text(query.clientId, 80);
  if (clientId) {
    return { kind: 'touch', id: clientId, label: text(body.clientLabel, 60) || text(query.clientLabel, 60), user };
  }
  return { kind: 'http', id: 'http:' + (user || 'anonyme'), label: '', user };
};

export const postJob = authorized((req, res) => {
  // A continuous jog's keepalive (F1) comes every 100 ms: it answers alone,
  // without a snapshot or a stream publication.
  const keepalive = !!req.body && req.body.action === 'motion' && req.body.operation === 'jog-keepalive';
  touch.action(req.body, actorOf(req))
    .then((result) => {
      if (keepalive) {
        res.send(result);
        return;
      }
      res.send({ ...result, snapshot: touch.snapshot() });
      touch.publish();
    })
    .catch((err) => {
      // A control refusal (F5) names its code and the current owner, as documented.
      const control = err.code === 'ECONTROL' ? { code: err.code, owner: err.owner || null } : {};
      // A stable Touch refusal code (ETOUCH_*) travels with the values of its
      // message, so a client can translate it; the French message is unchanged.
      const coded = typeof err.code === 'string' && /^ETOUCH_[A-Z0-9_]+$/.test(err.code)
        ? { code: err.code, ...(err.params && typeof err.params === 'object' ? { params: err.params } : {}) } : {};
      res.status(err.status || ERR_BAD_REQUEST).send({ message: err.message, ...control, ...coded });
    });
});

export const previewMotion = authorized((req, res) => {
  try {
    res.send(touch.previewMotion(req.body));
  } catch (err) {
    // A coded error names what blocks the dry run; anything else is a server fault.
    if (err.code) {
      res.status(ERR_CONFLICT).send({ message: err.message });
    } else {
      log.error(`motion preview failed: ${err && err.stack}`);
      res.status(ERR_INTERNAL_SERVER_ERROR).send({ message: 'Vérification serveur indisponible.' });
    }
  }
});

export const getEvents = authorized((req, res) => {
  // The stream carries the client's presence: its control lease lives while
  // a stream with its clientId is open (see touch/control.js).
  if (!touch.openEvents(req, res, actorOf(req))) {
    res.status(ERR_SERVICE_UNAVAILABLE).send({ message: 'Suivi indisponible.' });
  }
});

// Durable job history (F4): `?limit=` entries (1-200, 50 by default), most
// recent first; `?before=<seq>` pages towards older entries.
export const getHistory = authorized((req, res) => {
  const query = req.query || {};
  touch.readHistory({ limit: query.limit, before: query.before })
    .then((page) => {
      res.set('Cache-Control', 'no-store');
      res.send({ entries: page.entries, total: page.total, skipped: page.skipped, more: page.more });
    })
    .catch((err) => {
      log.error(`history failed: ${err && err.stack}`);
      res.status(ERR_INTERNAL_SERVER_ERROR).send({ message: 'Historique indisponible.' });
    });
});

// Read-only figures about the computer running CNCjs (settings screen).
export const getSystem = authorized((req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.send(touch.systemStats());
  } catch (err) {
    log.error(`system figures failed: ${err && err.stack}`);
    res.status(ERR_INTERNAL_SERVER_ERROR).send({ message: 'Mesures système indisponibles.' });
  }
});

// Screen backlight of the computer running CNCjs (settings screen).
export const getBacklight = authorized((req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.send(touch.backlightStatus());
  } catch (err) {
    res.status(ERR_INTERNAL_SERVER_ERROR).send({ message: 'Luminosité indisponible.' });
  }
});

// { percent } sets the operator's level; { percent, temporary: true } is the
// screen saver dimming (never stored); { wake: true } puts the operator's level back.
export const postBacklight = authorized((req, res) => {
  const body = req.body || {};
  try {
    if (body.wake === true) {
      res.send(touch.wakeBacklight());
    } else if (body.temporary === true) {
      res.send(touch.dimBacklight(body.percent));
    } else {
      res.send(touch.setBacklight(body.percent));
    }
  } catch (err) {
    if (err.status) {
      res.status(err.status).send({ message: err.message });
    } else {
      res.status(ERR_INTERNAL_SERVER_ERROR).send({ message: 'Luminosité non modifiée.' });
    }
  }
});

// Wi-Fi of the computer running CNCjs (Réglages → Système). The password goes
// to nmcli only: it is never logged nor sent back.
export const getWifi = authorized((req, res) => {
  res.set('Cache-Control', 'no-store');
  touch.wifiStatus()
    .then((data) => res.send(data))
    .catch((err) => res.status(err.status || ERR_INTERNAL_SERVER_ERROR).send({ message: err.status ? err.message : 'Wi-Fi indisponible.' }));
});

export const postWifi = authorized((req, res) => {
  const body = req.body || {};
  res.set('Cache-Control', 'no-store');
  touch.wifiAction({ action: body.action, ssid: body.ssid, password: body.password, hidden: body.hidden === true }, actorOf(req))
    .then((data) => {
      log.info(`wifi ${body.action}${body.action === 'connect' || body.action === 'forget' ? ': ' + String(body.ssid || '').slice(0, 32) : ''}`);
      res.send(data);
    })
    .catch((err) => {
      log.warn(`wifi ${body.action} refused: ${err.message}`);
      res.status(err.status || ERR_INTERNAL_SERVER_ERROR).send({ message: err.status ? err.message : 'Action Wi-Fi impossible.' });
    });
});

// Project sheets of the shared library (F3) and the provenance of compensated
// files (F6). They describe programs only: nothing here reaches a controller,
// so they need a session but not the touch service.
const projectStatus = (err) => {
  switch (err && err.code) {
  case 'EINVALIDNAME':
  case 'EINVALID':
    return ERR_BAD_REQUEST;
  case 'ENOENT':
    return ERR_NOT_FOUND;
  case 'ECHANGED':
  case 'EOTHERVERSION':
  case 'ENOORIGINAL':
    return ERR_CONFLICT;
  case 'ETOOLARGE':
  case 'ETOOMANY':
    return ERR_PAYLOAD_TOO_LARGE;
  case 'ENOTCONFIGURED':
    return ERR_SERVICE_UNAVAILABLE;
  default:
    return ERR_INTERNAL_SERVER_ERROR;
  }
};
const sessionOnly = (handler) => (req, res) => {
  if (!req.user || typeof req.user !== 'object') {
    res.status(ERR_UNAUTHORIZED).send({ message: 'Session CNCjs requise.' });
    return;
  }
  handler(req, res);
};
const answerProjects = (res, promise, what) => {
  promise
    .then((result) => {
      res.set('Cache-Control', 'no-store');
      res.send(result);
    })
    .catch((err) => {
      const status = projectStatus(err);
      // Coded refusals name what to do; anything else stays generic (details in the log),
      // except an unreadable store, which the operator must hear about.
      if (status === ERR_INTERNAL_SERVER_ERROR && err.code !== 'ECORRUPT') {
        log.error(`${what} failed: ${err && err.stack}`);
        res.status(status).send({ message: 'Fiches projets indisponibles.' });
        return;
      }
      res.status(status).send({ message: err.message, code: err.code });
    });
};

export const getProjects = sessionOnly((req, res) => {
  answerProjects(res, listProjects(), 'project list');
});

export const readProject = sessionOnly((req, res) => {
  answerProjects(res, readProjectSheet((req.body || {}).file), 'project read');
});

export const writeProject = sessionOnly((req, res) => {
  const body = req.body || {};
  answerProjects(res, writeProjectSheet({ file: body.file, fingerprint: body.fingerprint, meta: body.meta, adopt: body.adopt === true }), 'project write');
});
