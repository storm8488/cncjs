/* eslint-env jest */
import { createUpdates, parseSimulation, explain } from '../updates';

const SIM = [
  'NOTE: This is only a simulation!',
  'Inst zlib1g [1:1.3.dfsg+really1.3.1-1+b1] (1:1.3.dfsg+really1.3.1-1+deb13u1 Debian-Security:13/stable-security [amd64])',
  'Inst libfoo1 (2.0-1 Debian:13.7/stable [amd64])',
  'Conf zlib1g (1:1.3.dfsg+really1.3.1-1+deb13u1 Debian-Security:13/stable-security [amd64])'
].join('\n');

// A fake command runner: answers by the apt verb, records every call.
const fake = ({ sim = SIM, fail = {} } = {}) => {
  const calls = [];
  const run = (file, args) => {
    calls.push([file].concat(args).join(' '));
    let verb = 'upgrade';
    if (args.indexOf('-s') >= 0) {
      verb = 'simulate';
    } else if (args.indexOf('update') >= 0) {
      verb = 'update';
    }
    if (fail[verb]) {
      return Promise.reject(Object.assign(new Error('Command failed'), fail[verb]));
    }
    if (verb === 'upgrade') {
      sim = '';
    }
    return Promise.resolve(verb === 'simulate' ? sim : '');
  };
  return { run, calls };
};
const make = (opts = {}, reboot = false) => {
  const f = fake(opts);
  let t = 1000;
  const now = () => {
    t += 1000;
    return t;
  };
  const exists = (p) => (p === '/usr/bin/apt-get' ? true : reboot);
  const updates = createUpdates({ run: f.run, platform: 'linux', exists, now });
  return { updates, calls: f.calls };
};

describe('touch system updates (apt)', () => {
  test('parseSimulation: upgrades and new packages, security origin flagged, Conf lines ignored', () => {
    expect(parseSimulation(SIM)).toEqual([
      { name: 'zlib1g', from: '1:1.3.dfsg+really1.3.1-1+b1', to: '1:1.3.dfsg+really1.3.1-1+deb13u1', security: true },
      { name: 'libfoo1', from: '', to: '2.0-1', security: false }
    ]);
  });

  test('unavailable without apt or off Linux', () => {
    expect(createUpdates({ platform: 'win32', exists: () => true }).status().available).toBe(false);
    expect(createUpdates({ platform: 'linux', exists: () => false }).status().available).toBe(false);
    expect(() => createUpdates({ platform: 'win32', exists: () => true }).start('check')).toThrow(/indisponibles/);
  });

  test('check: sudo -n apt-get update, then an unprivileged simulation; runs in the background', async () => {
    const { updates, calls } = make();
    const done = updates.start('check');
    expect(updates.status().running).toEqual({ action: 'check', since: expect.any(Number) });
    expect(() => updates.start('install')).toThrow(/déjà en cours/);
    await done;
    expect(calls).toEqual([
      'sudo -n /usr/bin/apt-get update',
      '/usr/bin/apt-get -s -o Debug::NoLocking=1 --with-new-pkgs upgrade'
    ]);
    const s = updates.status();
    expect(s.running).toBe(null);
    expect(s.packages.map((p) => p.name)).toEqual(['zlib1g', 'libfoo1']);
    expect(s.lastRun).toEqual({ action: 'check', at: expect.any(Number), ok: true, message: '2 mise(s) à jour disponible(s).' });
  });

  test('install: refresh, upgrade keeping configuration files, list refreshed, reboot flag reported', async () => {
    const { updates, calls } = make({}, true);
    await updates.start('install');
    expect(calls[2]).toBe('sudo -n /usr/bin/apt-get -y -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold --with-new-pkgs upgrade');
    const s = updates.status();
    expect(s.packages).toEqual([]);
    expect(s.rebootRequired).toBe(true);
    expect(s.lastRun.ok).toBe(true);
    expect(s.lastRun.message).toBe('2 paquet(s) mis à jour. Redémarrage de la tablette nécessaire.');
  });

  test('install with nothing pending does not upgrade', async () => {
    const { updates, calls } = make({ sim: '' });
    await updates.start('install');
    expect(calls.some((c) => / -y /.test(c))).toBe(false);
    expect(updates.status().lastRun.message).toBe('Système déjà à jour : rien à installer.');
  });

  test('sudo without password right, apt lock, timeout: clear messages, task ends', async () => {
    let u = make({ fail: { update: { stderr: 'sudo: a password is required\n' } } }).updates;
    await u.start('install');
    expect(u.status().lastRun).toMatchObject({ ok: false, message: expect.stringMatching(/Droits administrateur manquants/) });
    expect(u.status().running).toBe(null);
    u = make({ fail: { upgrade: { stderr: 'E: Could not get lock /var/lib/dpkg/lock-frontend. It is held by process 42 (unattended-upgr)\n' } } }).updates;
    await u.start('install');
    expect(u.status().lastRun.message).toMatch(/autre mise à jour est déjà en cours/);
    expect(explain({ killed: true, stderr: '' }).status).toBe(504);
    expect(explain({ stderr: 'W: something\nE: Broken packages\n' }).message).toBe('Mise à jour impossible : Broken packages');
  });

  test('unknown action refused', () => {
    expect(() => make().updates.start('dist-upgrade')).toThrow(/inconnue/);
  });
});
