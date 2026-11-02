import find from 'lodash/find';
import castArray from 'lodash/castArray';
import isPlainObject from 'lodash/isPlainObject';
import uuid from 'uuid';
import settings from '../config/settings';
import logger from '../lib/logger';
import taskRunner from '../services/taskrunner';
import config from '../services/configstore';
import touch from '../services/touch';
import store from '../store';
import { getPagingRange } from './paging';
import {
  ERR_BAD_REQUEST,
  ERR_FORBIDDEN,
  ERR_NOT_FOUND,
  ERR_CONFLICT,
  ERR_INTERNAL_SERVER_ERROR
} from '../constants';

const log = logger('api:commands');
const CONFIG_KEY = 'commands';

// Host commands that stop, restart or power the computer off, or kill
// processes (CNCjs itself included): they take the machine's supervision away,
// so they run only with every controller at rest and nothing starting meanwhile.
// Linux hosts (systemd, pm2, SysV) and Windows hosts (shutdown.exe, taskkill,
// PowerShell Restart-/Stop-Computer|Service, net stop, sc stop) alike.
const SENSITIVE = /(^|[^\w.-])(shutdown(?:\.exe)?|reboot|poweroff|halt|(?:init|telinit)\s+[06]|systemctl\s+(?:[-\w]+\s+)*(?:stop|restart|reload|reload-or-restart|try-restart|kill|poweroff|reboot|halt|isolate)|pm2\s+(?:[-\w]+\s+)*(?:stop|restart|reload|delete|kill)|kill|killall|pkill|taskkill(?:\.exe)?|(?:restart|stop)-(?:computer|service)|net\s+stop|sc(?:\.exe)?\s+stop|service\s+\S+\s+(?:stop|restart|reload|force-reload))(?![\w.-])/i;
export const sensitiveCommand = (commands) => SENSITIVE.test(String(commands || ''));

// A sensitive command holds the machine until its task ends. A task that never
// reports its end (the computer is going down, or CNCjs itself is restarted
// and the new process knows nothing of it) is released after this delay anyway.
const SYSTEM_COMMAND_MAX_MS = 5 * 60 * 1000;

const BUSY_STATES = ['Run', 'Hold', 'Home', 'Jog'];

const conflict = (message) => {
  const err = new Error(message);
  err.status = ERR_CONFLICT;
  return err;
};

// Without the touch service only the store can tell, and nothing can hold the
// machine while the task runs: every connected controller must be at rest.
const controllersAtRest = () => {
  const registry = store.get('controllers') || {};
  Object.keys(registry).forEach((port) => {
    const c = registry[port];
    if (!c || (typeof c.isClose === 'function' && c.isClose())) {
      return;
    }
    const workflow = c.workflow && c.workflow.state;
    const status = (c.runner && c.runner.state && c.runner.state.status) || {};
    const state = status.activeState || '';
    if (workflow && workflow !== 'idle') {
      throw conflict('Un travail est en cours ou en pause sur ' + port + ' : commande système refusée.');
    }
    if (BUSY_STATES.includes(state) || /^Door/.test(state)) {
      throw conflict('Machine en mouvement ou occupée (' + state + ') sur ' + port + ' : commande système refusée.');
    }
    const feeder = c.feeder && typeof c.feeder.toJSON === 'function' ? c.feeder.toJSON() : {};
    if (feeder.queue || feeder.pending) {
      throw conflict('Commandes en attente sur ' + port + ' : commande système refusée.');
    }
  });
};

// Taken synchronously, before the task starts: the touch service then refuses
// every start until release(). Throws (409) when the machine is busy or another
// sensitive command already holds it.
const reserveMachine = (command) => {
  if (touch.isStarted()) {
    return touch.reserveSystemCommand(command);
  }
  controllersAtRest();
  return null;
};

const releaseWhenDone = (reservation, taskId) => {
  let timer = null;
  let onFinish = null;
  let onError = null;
  const done = () => {
    taskRunner.removeListener('finish', onFinish);
    taskRunner.removeListener('error', onError);
    clearTimeout(timer);
    reservation.release();
  };
  onFinish = (id) => {
    if (id === taskId) {
      done();
    }
  };
  onError = (id) => {
    if (id === taskId) {
      done();
    }
  };
  taskRunner.on('finish', onFinish);
  taskRunner.on('error', onError);
  timer = setTimeout(done, SYSTEM_COMMAND_MAX_MS);
  if (timer && typeof timer.unref === 'function') {
    timer.unref();
  }
};

const getSanitizedRecords = () => {
  const records = castArray(config.get(CONFIG_KEY, []));

  let shouldUpdate = false;
  for (let i = 0; i < records.length; ++i) {
    if (!isPlainObject(records[i])) {
      records[i] = {};
    }

    const record = records[i];

    if (!record.id) {
      record.id = uuid.v4();
      shouldUpdate = true;
    }

    // Defaults to true
    if (record.enabled === undefined) {
      record.enabled = true;
    }

    // Alias command
    if (!record.commands) {
      record.commands = record.command || '';
      delete record.command;
    }
  }

  if (shouldUpdate) {
    log.debug(`update sanitized records: ${JSON.stringify(records)}`);

    // Pass `{ silent changes }` will suppress the change event
    config.set(CONFIG_KEY, records, { silent: true });
  }

  return records;
};

export const fetch = (req, res) => {
  const records = getSanitizedRecords();
  const paging = !!req.query.paging;

  if (paging) {
    const { page = 1, pageLength = 10 } = req.query;
    const totalRecords = records.length;
    const [begin, end] = getPagingRange({ page, pageLength, totalRecords });
    const pagedRecords = records.slice(begin, end);

    res.send({
      pagination: {
        page: Number(page),
        pageLength: Number(pageLength),
        totalRecords: Number(totalRecords)
      },
      records: pagedRecords.map(record => {
        const { id, mtime, enabled, title, commands } = { ...record };
        return { id, mtime, enabled, title, commands };
      })
    });
  } else {
    res.send({
      records: records.map(record => {
        const { id, mtime, enabled, title, commands } = { ...record };
        return { id, mtime, enabled, title, commands };
      })
    });
  }
};

export const create = (req, res) => {
  const {
    enabled = true,
    title = '',
    commands = ''
  } = { ...req.body };

  if (!title) {
    res.status(ERR_BAD_REQUEST).send({
      msg: 'The "title" parameter must not be empty'
    });
    return;
  }

  if (!commands) {
    res.status(ERR_BAD_REQUEST).send({
      msg: 'The "commands" parameter must not be empty'
    });
    return;
  }

  try {
    const records = getSanitizedRecords();
    const record = {
      id: uuid.v4(),
      mtime: new Date().getTime(),
      enabled: !!enabled,
      title: title,
      commands: commands
    };

    records.push(record);
    config.set(CONFIG_KEY, records);

    res.send({ id: record.id, mtime: record.mtime });
  } catch (err) {
    res.status(ERR_INTERNAL_SERVER_ERROR).send({
      msg: 'Failed to save ' + JSON.stringify(settings.rcfile)
    });
  }
};

export const read = (req, res) => {
  const id = req.params.id;
  const records = getSanitizedRecords();
  const record = find(records, { id: id });

  if (!record) {
    res.status(ERR_NOT_FOUND).send({
      msg: 'Not found'
    });
    return;
  }

  const { mtime, enabled, title, commands } = { ...record };
  res.send({ id, mtime, enabled, title, commands });
};

export const update = (req, res) => {
  const id = req.params.id;
  const records = getSanitizedRecords();
  const record = find(records, { id: id });

  if (!record) {
    res.status(ERR_NOT_FOUND).send({
      msg: 'Not found'
    });
    return;
  }

  const {
    enabled = record.enabled,
    title = record.title,
    commands = record.commands
  } = { ...req.body };

  // Skip validation for "enabled", "title", and "commands"

  try {
    record.mtime = new Date().getTime();
    record.enabled = Boolean(enabled);
    record.title = String(title || '');
    record.commands = String(commands || '');

    // Remove deprecated parameter
    if (record.command !== undefined) {
      delete record.command;
    }

    config.set(CONFIG_KEY, records);

    res.send({ id: record.id, mtime: record.mtime });
  } catch (err) {
    res.status(ERR_INTERNAL_SERVER_ERROR).send({
      msg: 'Failed to save ' + JSON.stringify(settings.rcfile)
    });
  }
};

export const __delete = (req, res) => {
  const id = req.params.id;
  const records = getSanitizedRecords();
  const record = find(records, { id: id });

  if (!record) {
    res.status(ERR_NOT_FOUND).send({
      msg: 'Not found'
    });
    return;
  }

  try {
    const filteredRecords = records.filter(record => {
      return record.id !== id;
    });
    config.set(CONFIG_KEY, filteredRecords);

    res.send({ id: record.id });
  } catch (err) {
    res.status(ERR_INTERNAL_SERVER_ERROR).send({
      msg: 'Failed to save ' + JSON.stringify(settings.rcfile)
    });
  }
};

export const run = (req, res) => {
  const id = req.params.id;
  const records = getSanitizedRecords();
  const record = find(records, { id: id });

  if (!record) {
    res.status(ERR_NOT_FOUND).send({
      msg: 'Not found'
    });
    return;
  }

  // The commands list only shows enabled records; a request made directly
  // with the id of a disabled one is refused here, not left to the client.
  if (!record.enabled) {
    res.status(ERR_FORBIDDEN).send({ msg: 'Commande désactivée.', message: 'Commande désactivée.' });
    return;
  }

  const title = record.title;
  const commands = record.commands;

  let reservation = null;
  if (sensitiveCommand(commands)) {
    // Someone else holds the control of a port (F5): the command would take
    // the machine away from them.
    if (touch.isStarted() && typeof touch.refuseSystemCommand === 'function') {
      const user = req.user && typeof req.user === 'object' ? req.user : {};
      let name = typeof user.name === 'string' ? user.name : '';
      if (!name && user.id) {
        name = String(user.id);
      }
      const refused = touch.refuseSystemCommand({ kind: 'http', id: 'http:' + (name || 'anonyme'), user: name });
      if (refused) {
        log.warn(`run refused: title="${title}", reason="${refused.message}"`);
        res.status(ERR_CONFLICT).send({ msg: refused.message, message: refused.message });
        return;
      }
    }
    try {
      reservation = reserveMachine({ id, title, commands });
    } catch (err) {
      log.warn(`run refused: title="${title}", reason="${err.message}"`);
      res.status(err.status || ERR_CONFLICT).send({ msg: err.message, message: err.message });
      return;
    }
  }

  log.info(`run: title="${title}", commands="${commands}"`);

  let taskId;
  try {
    taskId = taskRunner.run(commands, title);
  } catch (err) {
    if (reservation) {
      reservation.release();
    }
    log.error(`run failed: title="${title}", err=${err && err.message}`);
    res.status(ERR_INTERNAL_SERVER_ERROR).send({ msg: 'Commande non lancée.', message: 'Commande non lancée.' });
    return;
  }
  if (reservation) {
    releaseWhenDone(reservation, taskId);
  }

  res.send({ taskId: taskId });
};
