// Surface Pro — pilote CNCjs du Grbl SIMULÉ, comme un client CNCjs (socket.io + jeton signé).
// Le secret de ~/.cncrc sert à signer le jeton et n'est jamais affiché. Seul /tmp/ttyGRBL est ouvert.
// Usage (node 22 de la Surface) : node port.cjs <commande> [arguments]
//   open                 ouvre /tmp/ttyGRBL (Grbl 115200)
//   prepare              reset, $21=1 (fins de course), $22=1 (prise d'origine), $$ ; affiche $21 $22 $132
//   send '<ligne>'       envoie une ligne (ex. '$H', '$X', 'G38.2 Z-5 F100'), affiche 3 s de réponses
//   cmd <nom> [args]     commande CNCjs (reset, unlock, homing, feedhold, cyclestart, gcode:stop…)
//   state                état Grbl vu par CNCjs (activeState, Pn, alarme) et état Touch du port
//   watch <secondes>     affiche les lignes reçues de Grbl pendant ce temps
//   machine-cnc          fiche « Simulateur Grbl (test) » déclarée CNC (active la v2)
//   machine-forget       oublie la fiche (après $X, machine Idle)
//   close                ferme /tmp/ttyGRBL
//   clean                $X si Alarm, oublie la fiche, ferme le port (fin de séance)
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const nm = path.join(process.env.HOME, 'cncjs-v2/node_modules');
const io = require(nm + '/socket.io-client');
const jwt = require(nm + '/jsonwebtoken');

const PORT = '/tmp/ttyGRBL';
const LABEL = 'Simulateur Grbl (test)';
const BASE = 'http://127.0.0.1:8000';
const [, , action = 'state', ...args] = process.argv;

try {
  execFileSync('bash', [path.join(__dirname, 'guard.sh')], { stdio: 'inherit' });
} catch (e) {
  process.exit(1);
}

const secret = JSON.parse(fs.readFileSync(path.join(process.env.HOME, '.cncrc'), 'utf8')).secret;
const token = jwt.sign({ id: '', name: '' }, secret, { expiresIn: '10m' });
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const http = async (method, p, body) => {
  const res = await fetch(BASE + p, {
    method,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000)
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
};
const isOpen = async () => {
  const { json } = await http('GET', '/api/controllers');
  return Array.isArray(json) && json.some((c) => c && c.port === PORT);
};
const touchEntry = async () => {
  const { json } = await http('GET', '/api/touch-job');
  return ((json && json.controllers) || []).find((c) => c.port === PORT) || null;
};

const s = io.connect(BASE, { query: 'token=' + token, reconnection: false });
let state = null;
let settings = null;
const received = [];
let echo = false;
s.on('controller:state', (type, st) => {
  state = st;
});
s.on('controller:settings', (type, st) => {
  settings = st;
});
s.on('serialport:read', (line) => {
  received.push(line);
  if (echo) console.log('<', line);
});
s.on('serialport:close', () => console.log('serialport:close'));
s.on('serialport:error', (o) => console.log('serialport:error', JSON.stringify(o)));

const join = () => new Promise((ok, ko) => {
  s.emit('open', PORT, { controllerType: 'Grbl', baudrate: 115200, rtscts: false }, (err) => (err ? ko(err) : ok()));
});
const writeln = (line) => s.emit('writeln', PORT, line);
const printState = async () => {
  const st = (state && state.status) || {};
  console.log('Grbl', JSON.stringify({ activeState: st.activeState, pinState: (state && state.status && state.status.pinState) || '', mpos: st.mpos }));
  const t = await touchEntry();
  if (t) {
    console.log('Touch', JSON.stringify({ workflow: t.workflow, activeState: t.activeState, statusAgeMs: t.statusAgeMs, machine: t.machine && { kind: t.machine.kind, label: t.machine.label } }));
  }
};
const machine = async (operation) => {
  const t = await touchEntry();
  if (!t) throw new Error('port absent de Touch');
  const body = { port: PORT, action: 'machine', operation, generation: t.generation };
  if (operation === 'set-kind') Object.assign(body, { kind: 'cnc', label: LABEL });
  const { status, json } = await http('POST', '/api/touch-job', body);
  console.log(operation, status, json.message || '', json.code || '');
  return status === 200;
};

const main = async () => {
  await new Promise((ok, ko) => {
    s.on('connect', ok);
    s.on('connect_error', (e) => ko(new Error('connexion CNCjs : ' + e.message)));
  });
  if (action !== 'open' && !(await isOpen())) {
    if (action === 'clean' || action === 'close') {
      console.log('port déjà fermé');
      return 0;
    }
    throw new Error(PORT + " n'est pas ouvert (node port.cjs open)");
  }
  await join();
  await sleep(1000);
  switch (action) {
  case 'open':
    console.log('ouvert', PORT);
    await printState();
    return 0;
  case 'prepare':
    s.emit('command', PORT, 'reset');
    await sleep(1500);
    writeln('$21=1');
    writeln('$22=1');
    await sleep(500);
    writeln('$$');
    await sleep(2500);
    console.log('réglages', JSON.stringify({ version: settings && settings.version, $21: settings && settings.settings.$21, $22: settings && settings.settings.$22, $132: settings && settings.settings.$132 }));
    await printState();
    return 0;
  case 'send':
    echo = true;
    writeln(args.join(' '));
    await sleep(3000);
    await printState();
    return 0;
  case 'cmd':
    echo = true;
    s.emit('command', PORT, ...args);
    await sleep(2000);
    await printState();
    return 0;
  case 'watch':
    echo = true;
    await sleep(1000 * Number(args[0] || 5));
    return 0;
  case 'state':
    await printState();
    return 0;
  case 'machine-cnc':
    return (await machine('set-kind')) ? 0 : 1;
  case 'machine-forget':
    return (await machine('forget')) ? 0 : 1;
  case 'close':
  case 'clean': {
    let forgotten = action !== 'clean';
    if (action === 'clean') {
      if (((state && state.status && state.status.activeState) || '').startsWith('Alarm')) {
        // After a hard limit, Grbl hears only the reset; $X then unlocks.
        s.emit('command', PORT, 'reset');
        await sleep(1500);
        writeln('$X');
        await sleep(1500);
      }
      // The profile is matched on the settings read back ($$): read them before forgetting
      // (console $$ as in prepare; the service's readSettings needs an open Touch stream).
      writeln('$$');
      await sleep(2500);
      console.log('réglages relus', settings && settings.settings && settings.settings.$22 !== undefined ? 'oui' : 'non');
      forgotten = await machine('forget');
    }
    await new Promise((ok) => s.emit('close', PORT, () => ok()));
    console.log('fermé', PORT);
    if (!forgotten) {
      console.log('ÉCHEC : fiche machine non oubliée');
      return 1;
    }
    return 0;
  }
  default:
    console.log('commande inconnue :', action);
    return 2;
  }
};

main().then((code) => {
  s.close();
  process.exit(code);
}, (e) => {
  console.log('erreur :', e.message);
  s.close();
  process.exit(1);
});
setTimeout(() => {
  console.log('délai dépassé');
  process.exit(2);
}, 60000).unref();
