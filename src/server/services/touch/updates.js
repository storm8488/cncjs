// System updates of the computer that runs CNCjs (Réglages → Système), through
// apt: "check" refreshes the package lists and lists what an upgrade would
// install; "install" refreshes and upgrades (no Debian release change, no
// package removal, existing configuration files kept). Both run in the
// background: the API answers at once and the page reads status() until the
// task ends. apt needs root: `sudo -n` (never a password); without that right
// the task fails with a clear message and the update is done over SSH.
// Commands are called with an argument list, never through a shell.
import { execFile } from 'child_process';
import fs from 'fs';

const UPDATE_TIMEOUT_MS = 5 * 60000;
const SIMULATE_TIMEOUT_MS = 60000;
const UPGRADE_TIMEOUT_MS = 40 * 60000;
const MAX_PACKAGES = 200;
const APT = '/usr/bin/apt-get';
const REBOOT_FLAG = '/var/run/reboot-required';

const problem = (status, message) => Object.assign(new Error(message), { status });

// run(file, args, timeoutMs) → Promise<stdout>; rejects with {code, stderr, killed}.
const defaultRun = (file, args, timeout) => new Promise((resolve, reject) => {
  execFile(file, args, { timeout, env: { ...process.env, LC_ALL: 'C', DEBIAN_FRONTEND: 'noninteractive' }, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
    if (err) {
      reject(Object.assign(err, { stderr: String(stderr || '') }));
    } else {
      resolve(String(stdout || ''));
    }
  });
});

// `apt-get -s upgrade` lines: "Inst name [old] (new origin [arch])"; [old] is absent for a new package.
export const parseSimulation = (text) => String(text || '').split('\n').map((line) => {
  const m = /^Inst (\S+) (?:\[([^\]]*)\] )?\((\S+) ([^[)]*)/.exec(line.replace(/\r$/, ''));
  return m ? { name: m[1], from: m[2] || '', to: m[3], security: /-security/i.test(m[4]) } : null;
})
  .filter(Boolean)
  .slice(0, MAX_PACKAGES);

// apt's or sudo's own words, turned into what the operator can act on.
export const explain = (err) => {
  const text = String((err && err.stderr) || '');
  if (/a password is required|a terminal is required|not allowed to execute|may not run sudo|is not in the sudoers/i.test(text)) {
    return problem(403, 'Droits administrateur manquants : l’utilisateur du serveur CNCjs ne peut pas lancer apt sans mot de passe. Faites la mise à jour par SSH.');
  }
  if (/Could not get lock|Unable to acquire the dpkg frontend lock|Unable to lock/i.test(text)) {
    return problem(409, 'Une autre mise à jour est déjà en cours sur l’ordinateur (automatique ?) : réessayez dans quelques minutes.');
  }
  if (/dpkg was interrupted/i.test(text)) {
    return problem(409, 'Une installation précédente a été interrompue : terminez-la par SSH (sudo dpkg --configure -a).');
  }
  if (err && err.killed) {
    return problem(504, 'Mise à jour trop longue : arrêtée. Réessayez, ou faites-la par SSH.');
  }
  const last = text.split('\n').map((l) => l.trim()).filter((l) => /^(E|W):/.test(l)).pop() || '';
  return problem(500, 'Mise à jour impossible' + (last ? ' : ' + last.replace(/^(E|W):\s*/, '').slice(0, 200) : '.'));
};

export const createUpdates = ({ run = defaultRun, exists = fs.existsSync, platform = process.platform, now = Date.now } = {}) => {
  let running = null; // {action, since}
  let checkedAt = null;
  let packages = [];
  let lastRun = null; // {action, at, ok, message}

  const available = () => platform === 'linux' && exists(APT);
  const sudoApt = (args, timeout) => run('sudo', ['-n', APT].concat(args), timeout);
  const simulate = async () => {
    const out = await run(APT, ['-s', '-o', 'Debug::NoLocking=1', '--with-new-pkgs', 'upgrade'], SIMULATE_TIMEOUT_MS);
    packages = parseSimulation(out);
    checkedAt = now();
  };

  const status = () => {
    if (!available()) {
      return { available: false, reason: 'Mises à jour indisponibles : pas de gestionnaire apt sur l’ordinateur du serveur CNCjs.' };
    }
    return {
      available: true,
      running: running ? { ...running } : null,
      checkedAt,
      packages: packages.map((p) => ({ ...p })),
      lastRun: lastRun ? { ...lastRun } : null,
      rebootRequired: !!exists(REBOOT_FLAG)
    };
  };

  const tasks = {
    check: async () => {
      await sudoApt(['update'], UPDATE_TIMEOUT_MS);
      await simulate();
      return packages.length ? packages.length + ' mise(s) à jour disponible(s).' : 'Système à jour.';
    },
    install: async () => {
      await sudoApt(['update'], UPDATE_TIMEOUT_MS);
      await simulate();
      const count = packages.length;
      if (!count) {
        return 'Système déjà à jour : rien à installer.';
      }
      await sudoApt(['-y', '-o', 'Dpkg::Options::=--force-confdef', '-o', 'Dpkg::Options::=--force-confold', '--with-new-pkgs', 'upgrade'], UPGRADE_TIMEOUT_MS);
      await simulate().catch(() => {});
      return count + ' paquet(s) mis à jour.' + (exists(REBOOT_FLAG) ? ' Redémarrage de la tablette nécessaire.' : '');
    }
  };

  // Starts a task in the background; the returned promise ends with it (never rejects).
  const start = (action) => {
    if (!tasks[action]) {
      throw problem(400, 'Action de mise à jour inconnue.');
    }
    if (!available()) {
      throw problem(501, 'Mises à jour indisponibles : pas de gestionnaire apt sur l’ordinateur du serveur CNCjs.');
    }
    if (running) {
      throw problem(409, 'Mise à jour déjà en cours.');
    }
    running = { action, since: now() };
    return tasks[action]()
      .then((message) => {
        lastRun = { action, at: now(), ok: true, message };
      }, (err) => {
        lastRun = { action, at: now(), ok: false, message: (err && err.status ? err : explain(err)).message };
      })
      .then(() => {
        running = null;
      });
  };

  return { status, start };
};

export default { createUpdates, parseSimulation, explain };
