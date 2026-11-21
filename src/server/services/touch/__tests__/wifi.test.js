/* eslint-env jest */
import { createWifi, parseTerse, checkSsid, checkPassword } from '../wifi';

// A fake nmcli: answers by the first arguments, records every call.
const fakeRun = (answers) => {
  const calls = [];
  const run = (file, args) => {
    calls.push([file, args]);
    const key = args.filter((a) => !/^-/.test(a)).slice(0, 3).join(' ');
    const answer = typeof answers === 'function' ? answers(args) : answers[key];
    if (answer instanceof Error) {
      return Promise.reject(answer);
    }
    return Promise.resolve(answer === undefined ? '' : answer);
  };
  return { run, calls };
};
const DEVICES = 'mlan0:wifi:connected:Livebox-0FB0_2.4GHz\np2p-dev-mlan0:wifi-p2p:disconnected:\nlo:loopback:unmanaged:\n';
const LIST = '*:Livebox-0FB0_2.4GHz:59:WPA2\n :DIRECT-mb\\:EPSON:54:WPA2\n ::44:\n :Atelier:30:\n :Atelier:70:\n';
const SAVED = 'Livebox-0FB0_2.4GHz:802-11-wireless\nAirbox-893A:802-11-wireless\nWired:802-3-ethernet\n';
const answers = (extra = {}) => (args) => {
  const a = args.join(' ');
  if (/device$/.test(a)) {
    return DEVICES;
  }
  if (/wifi list/.test(a)) {
    return LIST;
  }
  if (/connection show/.test(a)) {
    return SAVED;
  }
  const key = Object.keys(extra).find((k) => a.indexOf(k) >= 0);
  return key ? extra[key] : '';
};

describe('touch wifi (nmcli)', () => {
  test('parseTerse splits on unescaped colons only', () => {
    expect(parseTerse('a:b\\:c:d\\\\e')).toEqual(['a', 'b:c', 'd\\e']);
  });

  test('status: current network, signal, saved profiles; hidden SSIDs and duplicates folded', async () => {
    const { run } = fakeRun(answers());
    const s = await createWifi({ run }).status();
    expect(s).toEqual({ available: true, device: 'mlan0', state: 'connected', ssid: 'Livebox-0FB0_2.4GHz', signal: 59, saved: ['Livebox-0FB0_2.4GHz', 'Airbox-893A'] });
  });

  test('scan: rescans, best signal per SSID, escaped colons, open networks, saved flag', async () => {
    const { run, calls } = fakeRun(answers());
    const { networks } = await createWifi({ run }).scan();
    expect(calls.some(([, args]) => args.join(' ').indexOf('--rescan yes') >= 0)).toBe(true);
    expect(networks).toEqual([
      { ssid: 'Livebox-0FB0_2.4GHz', signal: 59, secure: true, inUse: true, saved: true },
      { ssid: 'Atelier', signal: 70, secure: false, inUse: false, saved: false },
      { ssid: 'DIRECT-mb:EPSON', signal: 54, secure: true, inUse: false, saved: false }
    ]);
  });

  test('connect: a saved network without password is brought up by its profile', async () => {
    const { run, calls } = fakeRun(answers());
    const r = await createWifi({ run }).connect({ ssid: 'Airbox-893A' });
    expect(r.message).toMatch(/Connecté au réseau Wi-Fi « Airbox-893A »/);
    expect(calls.pop()[1]).toEqual(['connection', 'up', 'id', 'Airbox-893A']);
  });

  test('connect: a new network with its password, as separate arguments (no shell), password never returned', async () => {
    const { run, calls } = fakeRun(answers());
    const r = await createWifi({ run }).connect({ ssid: 'Atelier; rm -rf /', password: 'secret-pass-1' });
    const [file, args] = calls.pop();
    expect(file).toBe('nmcli');
    expect(args).toEqual(['device', 'wifi', 'connect', 'Atelier; rm -rf /', 'password', 'secret-pass-1', 'ifname', 'mlan0']);
    expect(JSON.stringify(r)).not.toMatch(/secret-pass-1/);
  });

  test('connect failures: nmcli error explained, without the password; timeout named', async () => {
    const wrong = Object.assign(new Error('Command failed'), { stderr: 'Error: Connection activation failed: Secrets were required, but not provided.\n' });
    const { run } = fakeRun(answers({ 'wifi connect': wrong }));
    await expect(createWifi({ run }).connect({ ssid: 'Atelier', password: 'secret-pass-1' })).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/Connexion à « Atelier » impossible : Connection activation failed/) });
    const slow = Object.assign(new Error('Command failed: nmcli device wifi connect Atelier password secret-pass-1 ifname mlan0'), { killed: true, stderr: '' });
    const late = fakeRun(answers({ 'wifi connect': slow }));
    await expect(createWifi({ run: late.run }).connect({ ssid: 'Atelier', password: 'secret-pass-1' })).rejects.toMatchObject({ message: expect.not.stringMatching(/secret-pass-1/) });
    await expect(createWifi({ run: late.run }).connect({ ssid: 'Atelier', password: 'secret-pass-1' })).rejects.toMatchObject({ message: expect.stringMatching(/délai dépassé/) });
    const errors = [];
    try {
      await createWifi({ run }).connect({ ssid: 'Atelier', password: 'secret-pass-1' });
    } catch (e) {
      errors.push(e.message);
    }
    expect(errors.join()).not.toMatch(/secret-pass-1/);
  });

  test('connect: a hidden network is joined by its name with hidden yes', async () => {
    const { run, calls } = fakeRun(answers());
    await createWifi({ run }).connect({ ssid: 'Cache', password: 'secret-pass-1', hidden: true });
    expect(calls.pop()[1]).toEqual(['device', 'wifi', 'connect', 'Cache', 'password', 'secret-pass-1', 'ifname', 'mlan0', 'hidden', 'yes']);
  });

  test('forget: a saved network is deleted; the one in use and an unknown one are refused', async () => {
    const { run, calls } = fakeRun(answers());
    const w = createWifi({ run });
    const r = await w.forget({ ssid: 'Airbox-893A' });
    expect(r.message).toMatch(/Réseau « Airbox-893A » oublié/);
    expect(calls.pop()[1]).toEqual(['connection', 'delete', 'id', 'Airbox-893A']);
    await expect(w.forget({ ssid: 'Livebox-0FB0_2.4GHz' })).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/réseau utilisé/) });
    await expect(w.forget({ ssid: 'Inconnu' })).rejects.toMatchObject({ status: 404 });
    expect(calls.some(([, args]) => args[1] === 'delete' && args[3] !== 'Airbox-893A')).toBe(false);
  });

  test('invalid SSID or password refused before nmcli runs', async () => {
    const { run, calls } = fakeRun(answers());
    const w = createWifi({ run });
    await expect(w.connect({ ssid: '' })).rejects.toMatchObject({ status: 400 });
    await expect(w.connect({ ssid: 'x'.repeat(33) })).rejects.toMatchObject({ status: 400 });
    await expect(w.connect({ ssid: 'Atelier', password: 'court' })).rejects.toMatchObject({ status: 400 });
    await expect(w.connect({ ssid: 'Atelier', password: 'a\nb-cdefghij' })).rejects.toMatchObject({ status: 400 });
    expect(calls).toEqual([]);
    expect(checkSsid('Wi-Fi atelier')).toBe('Wi-Fi atelier');
    expect(checkPassword('')).toBe('');
    expect(checkPassword('a'.repeat(64).replace(/a/g, 'f'))).toHaveLength(64);
  });

  test('no nmcli or no Wi-Fi device: unavailable, explained', async () => {
    const missing = fakeRun(() => Object.assign(new Error('spawn nmcli ENOENT'), { code: 'ENOENT' }));
    await expect(createWifi({ run: missing.run }).status()).rejects.toMatchObject({ status: 501, message: expect.stringMatching(/nmcli/) });
    const wired = fakeRun(() => 'eth0:ethernet:connected:Wired\n');
    expect(await createWifi({ run: wired.run }).status()).toMatchObject({ available: false });
  });
});
