// Wi-Fi of the computer that runs CNCjs (Réglages → Système), through
// NetworkManager's nmcli: the current network, a scan, and joining a network
// (a known one, a new one with its password, or a hidden one by its name), and
// forgetting a saved network that is not in use. nmcli is called with an
// argument list, never through a shell. The password is passed to nmcli only:
// it is never logged, returned or stored here (NetworkManager keeps it in its
// own connection profile, as when joining from a desktop).
import { execFile } from 'child_process';

const SCAN_TIMEOUT_MS = 20000;
const CONNECT_TIMEOUT_MS = 45000;
const READ_TIMEOUT_MS = 8000;
const MAX_NETWORKS = 30;

const problem = (status, message) => Object.assign(new Error(message), { status });

// nmcli -t: fields separated by ':', a ':' or '\' inside a value escaped with '\'.
export const parseTerse = (line) => {
  const fields = [];
  let current = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\\' && i + 1 < line.length) {
      current += line[i + 1];
      i++;
    } else if (ch === ':') {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
};

const lines = (text) => String(text || '').split('\n').map((l) => l.replace(/\r$/, '')).filter(Boolean);

// SSID: 1 to 32 bytes; WPA passphrase: 8 to 63 characters (or 64 hex digits).
export const checkSsid = (ssid) => {
  const value = typeof ssid === 'string' ? ssid : '';
  const bytes = Buffer.byteLength(value, 'utf8');
  if (!bytes || bytes > 32 || /[\0\n\r]/.test(value)) {
    throw problem(400, 'Nom de réseau Wi-Fi invalide.');
  }
  return value;
};
export const checkPassword = (password) => {
  const value = typeof password === 'string' ? password : '';
  if (!value) {
    return '';
  }
  if (/[\0\n\r]/.test(value) || !(/^[0-9a-fA-F]{64}$/.test(value) || (value.length >= 8 && value.length <= 63))) {
    throw problem(400, 'Mot de passe Wi-Fi invalide : 8 à 63 caractères.');
  }
  return value;
};

// run(file, args, timeoutMs) → Promise<stdout>; rejects with {code, stderr}.
const defaultRun = (file, args, timeout) => new Promise((resolve, reject) => {
  execFile(file, args, { timeout, env: { ...process.env, LC_ALL: 'C' }, windowsHide: true, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
    if (err) {
      reject(Object.assign(err, { stderr: String(stderr || '') }));
    } else {
      resolve(String(stdout || ''));
    }
  });
});

// nmcli's own error text (stderr only), without its "Error: " prefix. Never err.message: on a
// timeout it is "Command failed: nmcli … password <secret> …". A password word is masked anyway.
const nmcliMessage = (err) => {
  const parts = String((err && err.stderr) || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const text = parts.length ? parts[parts.length - 1] : '';
  return text.replace(/^Error:\s*/i, '').replace(/(password\s+)\S+/gi, '$1***').slice(0, 200);
};

export const createWifi = ({ run = defaultRun } = {}) => {
  const nmcli = (args, timeout) => run('nmcli', args, timeout).catch((err) => {
    if (err && err.code === 'ENOENT') {
      throw problem(501, 'Gestion du Wi-Fi indisponible : NetworkManager (nmcli) absent sur l’ordinateur du serveur CNCjs.');
    }
    throw err;
  });

  // The Wi-Fi device, its state and its connection.
  const device = async () => {
    const out = await nmcli(['-t', '-f', 'DEVICE,TYPE,STATE,CONNECTION', 'device'], READ_TIMEOUT_MS);
    const wifi = lines(out).map(parseTerse).find((f) => f[1] === 'wifi');
    return wifi ? { name: wifi[0], state: wifi[2], connection: wifi[3] || '' } : null;
  };

  // Networks seen in the last scan (or a new one): best signal per SSID, hidden ones left out.
  const listNetworks = async (rescan) => {
    const out = await nmcli(['-t', '-f', 'IN-USE,SSID,SIGNAL,SECURITY', 'device', 'wifi', 'list', '--rescan', rescan ? 'yes' : 'no'], SCAN_TIMEOUT_MS);
    const best = {};
    lines(out).map(parseTerse).forEach((f) => {
      const ssid = f[1];
      if (!ssid) {
        return;
      }
      const net = { ssid, signal: Math.max(0, Math.min(100, Number(f[2]) || 0)), secure: !!f[3] && f[3] !== '--', inUse: f[0] === '*' };
      const old = best[ssid];
      if (!old || net.inUse || (!old.inUse && net.signal > old.signal)) {
        best[ssid] = { ...net, inUse: net.inUse || (old && old.inUse) || false };
      }
    });
    return Object.keys(best).map((k) => best[k]).sort((a, b) => (b.inUse - a.inUse) || (b.signal - a.signal)).slice(0, MAX_NETWORKS);
  };

  // Wi-Fi profiles NetworkManager already knows (joined before): joined again without a password.
  const saved = async () => {
    const out = await nmcli(['-t', '-f', 'NAME,TYPE', 'connection', 'show'], READ_TIMEOUT_MS);
    return lines(out).map(parseTerse).filter((f) => f[1] === '802-11-wireless').map((f) => f[0]);
  };

  const connectedName = (dev) => (dev.state === 'connected' ? dev.connection : '');
  const status = async () => {
    const dev = await device();
    if (!dev) {
      return { available: false, reason: 'Aucune carte Wi-Fi sur l’ordinateur du serveur CNCjs.' };
    }
    const [networks, known] = await Promise.all([listNetworks(false).catch(() => []), saved().catch(() => [])]);
    const current = networks.find((n) => n.inUse) || null;
    return {
      available: true,
      device: dev.name,
      state: dev.state,
      ssid: current ? current.ssid : connectedName(dev),
      signal: current ? current.signal : null,
      saved: known
    };
  };

  const scan = async () => {
    const dev = await device();
    if (!dev) {
      throw problem(501, 'Aucune carte Wi-Fi sur l’ordinateur du serveur CNCjs.');
    }
    const [networks, known] = await Promise.all([listNetworks(true), saved().catch(() => [])]);
    return { networks: networks.map((n) => ({ ...n, saved: known.indexOf(n.ssid) >= 0 })) };
  };

  // A known network without a password: its profile is brought up. Otherwise
  // nmcli joins (and saves) the network with the password given.
  // A hidden network (not in the scan) is joined by its name with `hidden yes`.
  const connect = async ({ ssid, password, hidden } = {}) => {
    const name = checkSsid(ssid);
    const secret = checkPassword(password);
    const dev = await device();
    if (!dev) {
      throw problem(501, 'Aucune carte Wi-Fi sur l’ordinateur du serveur CNCjs.');
    }
    const known = await saved().catch(() => []);
    const join = ['device', 'wifi', 'connect', name].concat(secret ? ['password', secret] : []).concat(['ifname', dev.name]).concat(hidden === true ? ['hidden', 'yes'] : []);
    const args = !secret && known.indexOf(name) >= 0 ? ['connection', 'up', 'id', name] : join;
    try {
      await nmcli(args, CONNECT_TIMEOUT_MS);
    } catch (err) {
      if (err && err.status) {
        throw err;
      }
      const why = nmcliMessage(err);
      throw problem(409, 'Connexion à « ' + name + ' » impossible' + (why ? ' : ' + why : '.') + (err && err.killed ? ' (délai dépassé)' : ''));
    }
    return { message: 'Connecté au réseau Wi-Fi « ' + name + ' ».', ssid: name };
  };

  // Forgets a saved network (its NetworkManager profile and password). The network in
  // use is refused: forgetting it would cut the link to this tablet.
  const forget = async ({ ssid } = {}) => {
    const name = checkSsid(ssid);
    const dev = await device();
    if (!dev) {
      throw problem(501, 'Aucune carte Wi-Fi sur l’ordinateur du serveur CNCjs.');
    }
    if (dev.connection === name) {
      throw problem(409, '« ' + name + ' » est le réseau utilisé : rejoignez d’abord un autre réseau pour l’oublier.');
    }
    const known = await saved();
    if (known.indexOf(name) < 0) {
      throw problem(404, '« ' + name + ' » n’est pas un réseau enregistré.');
    }
    try {
      await nmcli(['connection', 'delete', 'id', name], READ_TIMEOUT_MS);
    } catch (err) {
      if (err && err.status) {
        throw err;
      }
      const why = nmcliMessage(err);
      throw problem(409, 'Impossible d’oublier « ' + name + ' »' + (why ? ' : ' + why : '.'));
    }
    return { message: 'Réseau « ' + name + ' » oublié.', ssid: name };
  };

  return { status, scan, connect, forget };
};

export default { createWifi, parseTerse, checkSsid, checkPassword };
