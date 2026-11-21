// Surface Pro — endurance on the SIMULATED Grbl (/tmp/ttyGRBL only), up to 24 h.
// Loop: load a simulated program through CNCjs, start it, wait for its end, again.
// Every minute one CSV row: real memory (PSS) of the kiosk Chromium and of the Node
// processes, CPU, errors. Stops by itself at the deadline, at once when a real serial
// port appears (/dev/ttyUSB*, /dev/ttyACM*) or another port is open in CNCjs, or when
// the STOP file exists; then it stops the job, closes /tmp/ttyGRBL and stops the
// simulator and its bridge (sim.sh stop). The machine profile is forgotten afterwards
// by the operator (surface.sh port clean, simulator running), not here.
// Usage (Surface, node 22, port already open and prepared):
//   setsid nohup node endurance.cjs <dir> [hours] </dev/null >><dir>/run.log 2>&1 &
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const nm = path.join(process.env.HOME, 'cncjs-v2/node_modules');
const io = require(nm + '/socket.io-client');
const jwt = require(nm + '/jsonwebtoken');

const PORT = '/tmp/ttyGRBL';
const BASE = 'http://127.0.0.1:8000';
const DIR = process.argv[2];
const HOURS = Math.min(24, Number(process.argv[3] || 24));
if (!DIR || !(HOURS > 0)) {
  console.log('usage : node endurance.cjs <dossier> [heures <= 24]');
  process.exit(2);
}
fs.mkdirSync(DIR, { recursive: true });
const CSV = path.join(DIR, 'samples.csv');
const EVENTS = path.join(DIR, 'events.log');
const STOP = path.join(DIR, 'STOP');
const SIM = '/tmp/sim-surface/sim.sh';
const T0 = Date.now();
const DEADLINE = T0 + HOURS * 3600 * 1000;
const JOB_TIMEOUT_MS = 10 * 60 * 1000;

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const iso = () => new Date().toISOString();
const event = (text) => fs.appendFileSync(EVENTS, iso() + ' ' + text + '\n');

const secret = JSON.parse(fs.readFileSync(path.join(process.env.HOME, '.cncrc'), 'utf8')).secret;
const token = jwt.sign({ id: '', name: '' }, secret, { expiresIn: '30h' });

// A square spiral in the air, about 2 min 30 s at the simulator's real time.
const PROGRAM = (() => {
  const lines = ['(endurance - Grbl simule)', 'G21 G90 G94', 'M3 S1000', 'G0 Z5', 'G0 X-20 Y-20', 'G1 Z-1 F300'];
  for (let i = 0; i < 40; i++) {
    lines.push('G1 X20 Y-20 F3000', 'G1 X20 Y20', 'G1 X-20 Y20', 'G1 X-20 Y-20');
  }
  lines.push('G0 Z5', 'M5', 'G0 X0 Y0', 'M2', '');
  return lines.join('\n');
})();
const NAME = 'endurance-sim.nc';

// ---- Counters (cumulative) ----
const count = { cycles: 0, jobErrors: 0, alarms: 0, refused: 0, disconnects: 0, serialErrors: 0, timeouts: 0 };
let lastError = '';
let stopping = null;
const fail = (what, key) => {
  if (stopping) {
    // The stop itself (reset, port closed) is not an error of the run.
    event('pendant l’arrêt : ' + what);
    return;
  }
  count[key] += 1;
  lastError = what;
  event('ERREUR ' + what);
};

// ---- Guards ----
const realPorts = () => fs.readdirSync('/dev').filter((n) => /^tty(USB|ACM)/.test(n));
const http = async (p) => {
  const res = await fetch(BASE + p, { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(10000) });
  return res.json();
};
const otherOpenPorts = async () => {
  const list = await http('/api/controllers');
  return Array.isArray(list) ? list.map((c) => c && c.port).filter((p) => p !== PORT) : [];
};

// ---- Process sampling (/proc) ----
const CLK = 100;
const readText = (f) => {
  try {
    return fs.readFileSync(f, 'utf8');
  } catch (e) {
    return '';
  }
};
const procs = () => fs.readdirSync('/proc').filter((n) => /^\d+$/.test(n)).map((pid) => {
  const cmd = readText('/proc/' + pid + '/cmdline').split('\0').join(' ');
  return { pid: Number(pid), cmd };
}).filter((p) => p.cmd);
const group = (p) => {
  if (p.pid === process.pid) return 'endurance';
  if (/^\/usr\/lib\/chromium\/(chromium|chrome_crashpad_handler)/.test(p.cmd)) {
    return /cnc-measure-v2/.test(p.cmd) ? 'testWindow' : 'kiosk';
  }
  if (/grbl-server\.js|bridge\.py/.test(p.cmd)) return 'sim';
  if (/bin\/cncjs/.test(p.cmd)) return 'cncjs';
  if (/^PM2 |pm2-logrotate/.test(p.cmd)) return 'pm2';
  return null;
};
const pss = (pid) => {
  const m = /^Pss:\s+(\d+)/m.exec(readText('/proc/' + pid + '/smaps_rollup'));
  return m ? Number(m[1]) : 0;
};
const ticks = (pid) => {
  const s = readText('/proc/' + pid + '/stat');
  const f = s.slice(s.lastIndexOf(')') + 2).split(' ');
  return f.length > 13 ? Number(f[11]) + Number(f[12]) : 0;
};
const cpuTotal = () => {
  const f = readText('/proc/stat').split('\n')[0].trim().split(/\s+/).slice(1).map(Number);
  const idle = f[3] + (f[4] || 0);
  return { busy: f.reduce((a, b) => a + b, 0) - idle, all: f.reduce((a, b) => a + b, 0) };
};
const meminfo = (key) => {
  const m = new RegExp('^' + key + ':\\s+(\\d+)', 'm').exec(readText('/proc/meminfo'));
  return m ? Number(m[1]) : 0;
};
let prev = null;
const snapshot = () => {
  const g = {};
  const ids = { kioskMain: '', cncjs: '' };
  procs().forEach((p) => {
    const k = group(p);
    if (!k) return;
    g[k] = g[k] || { pss: 0, n: 0, ticks: 0 };
    g[k].pss += pss(p.pid);
    g[k].n += 1;
    g[k].ticks += ticks(p.pid);
    if (k === 'cncjs') ids.cncjs = p.pid;
    if (k === 'kiosk' && !/--type=/.test(p.cmd) && /\/chromium /.test(p.cmd + ' ')) ids.kioskMain = p.pid;
  });
  return { at: Date.now(), g, ids, cpu: cpuTotal() };
};

// ---- CNCjs ----
let socket = null;
let connected = false;
let workflow = '';
let activeState = '';
let sender = {};
// Highest acknowledged line and line count of the current run (CNCjs rewinds its counters
// when a program ends, so the end is judged on what was seen during the run).
let run = { received: 0, total: 0 };
const connect = () => {
  socket = io.connect(BASE, { query: 'token=' + token, reconnection: true, reconnectionDelay: 2000 });
  socket.on('connect', () => {
    connected = true;
    socket.emit('open', PORT, { controllerType: 'Grbl', baudrate: 115200, rtscts: false }, (err) => {
      if (err) fail('ouverture ' + PORT + ' : ' + (err.message || err), 'serialErrors');
    });
  });
  socket.on('disconnect', () => {
    connected = false;
    fail('socket CNCjs déconnecté', 'disconnects');
  });
  socket.on('workflow:state', (s) => {
    workflow = s;
  });
  socket.on('controller:state', (type, s) => {
    const a = (s && s.status && s.status.activeState) || '';
    if (/^Alarm/.test(a) && !/^Alarm/.test(activeState)) fail('alarme Grbl (' + a + ')', 'alarms');
    activeState = a;
  });
  socket.on('sender:status', (s) => {
    sender = s || {};
    run.received = Math.max(run.received, Number(sender.received) || 0);
    run.total = Math.max(run.total, Number(sender.total) || 0);
  });
  socket.on('serialport:error', (o) => fail('serialport:error ' + JSON.stringify(o), 'serialErrors'));
  socket.on('touch:control:refused', (o) => fail('commande refusée : ' + (o && o.message), 'refused'));
};
const command = (...args) => socket.emit('command', PORT, ...args);

// ---- Stop and clean ----
const shouldStop = async () => {
  if (realPorts().length) return 'port série réel présent : ' + realPorts().join(', ');
  if (fs.existsSync(STOP)) return 'fichier STOP';
  if (Date.now() >= DEADLINE) return 'durée atteinte (' + HOURS + ' h)';
  try {
    const other = await otherOpenPorts();
    if (other.length) return 'autre port ouvert dans CNCjs : ' + other.join(', ');
  } catch (e) {
    // CNCjs restarting: not a reason to stop, the socket reconnects.
  }
  return null;
};
const finish = async (reason) => {
  if (stopping) return;
  stopping = reason;
  event('ARRÊT : ' + reason);
  try {
    // Only the simulator's port is ever addressed.
    if (connected) {
      command('gcode:stop', { force: true });
      await sleep(1500);
      await new Promise((ok) => {
        socket.emit('close', PORT, () => ok());
        setTimeout(ok, 5000);
      });
    }
  } catch (e) {
    event('fermeture : ' + e.message);
  }
  try {
    socket.close();
  } catch (e) {
    // already closed
  }
  try {
    event(execFileSync('bash', [SIM, 'stop'], { encoding: 'utf8', timeout: 30000 }).trim());
  } catch (e) {
    event('sim.sh stop : ' + e.message);
  }
  sample();
  event('fin, ' + count.cycles + ' cycles');
  process.exit(0);
};

// ---- CSV ----
const HEADER = ['time', 'elapsed_min', 'cycles', 'job_errors', 'timeouts', 'alarms', 'refused', 'disconnects', 'serial_errors',
  'kiosk_pss_kb', 'kiosk_procs', 'kiosk_cpu_pct', 'cncjs_pss_kb', 'cncjs_cpu_pct', 'pm2_pss_kb', 'sim_pss_kb', 'endurance_pss_kb',
  'cpu_total_pct', 'mem_available_kb', 'load1', 'kiosk_main_pid', 'cncjs_pid', 'history_bytes', 'socket', 'workflow', 'active_state', 'last_error'];
if (!fs.existsSync(CSV)) fs.writeFileSync(CSV, HEADER.join(',') + '\n');
const sample = () => {
  const now = snapshot();
  const pct = (k) => {
    if (!prev || !prev.g[k] || !now.g[k]) return '';
    const dt = (now.at - prev.at) / 1000;
    return Math.max(0, (now.g[k].ticks - prev.g[k].ticks) / CLK / dt * 100).toFixed(1);
  };
  const total = prev ? ((now.cpu.busy - prev.cpu.busy) / Math.max(1, now.cpu.all - prev.cpu.all) * 100).toFixed(1) : '';
  const v = (k, f) => (now.g[k] ? now.g[k][f] : 0);
  let historyBytes = '';
  try {
    historyBytes = fs.statSync(path.join(process.env.HOME, 'cncjs-touch-history.jsonl')).size;
  } catch (e) {
    historyBytes = '';
  }
  const row = [iso(), ((Date.now() - T0) / 60000).toFixed(1), count.cycles, count.jobErrors, count.timeouts, count.alarms, count.refused,
    count.disconnects, count.serialErrors, v('kiosk', 'pss'), v('kiosk', 'n'), pct('kiosk'), v('cncjs', 'pss'), pct('cncjs'),
    v('pm2', 'pss'), v('sim', 'pss'), v('endurance', 'pss'), total, meminfo('MemAvailable'), readText('/proc/loadavg').split(' ')[0],
    now.ids.kioskMain, now.ids.cncjs, historyBytes, connected ? 'up' : 'down', workflow, activeState, JSON.stringify(lastError)];
  fs.appendFileSync(CSV, row.join(',') + '\n');
  prev = now;
};

// ---- Job loop ----
const waitFor = async (test, ms) => {
  const end = Date.now() + ms;
  while (Date.now() < end && !stopping) {
    if (test()) return true;
    await sleep(500);
  }
  return test();
};
const cycle = async () => {
  if (!connected) {
    await sleep(5000);
    return;
  }
  if (/^Alarm/.test(activeState)) {
    command('reset');
    await sleep(1500);
    socket.emit('writeln', PORT, '$X');
    await sleep(1500);
  }
  if (activeState !== 'Idle' || workflow !== 'idle') {
    await sleep(5000);
    return;
  }
  const loaded = await new Promise((ok) => {
    command('gcode:load', NAME, PROGRAM, {}, (err) => ok(!err));
    setTimeout(() => ok(false), 10000);
  });
  if (!loaded) {
    fail('chargement refusé ou sans réponse', 'jobErrors');
    await sleep(10000);
    return;
  }
  if (stopping) return;
  run = { received: 0, total: 0 };
  command('gcode:start');
  if (!(await waitFor(() => workflow === 'running', 15000))) {
    fail('démarrage sans effet (workflow ' + workflow + ', ' + activeState + ')', 'jobErrors');
    await sleep(10000);
    return;
  }
  if (!(await waitFor(() => workflow === 'idle', JOB_TIMEOUT_MS))) {
    if (stopping) return;
    fail('travail non fini en ' + JOB_TIMEOUT_MS / 60000 + ' min (ligne ' + run.received + '/' + run.total + ')', 'timeouts');
    command('gcode:stop', { force: true });
    await sleep(3000);
    return;
  }
  if (stopping) return;
  if (!run.total || run.received < run.total) {
    fail('travail arrêté avant la fin (' + run.received + '/' + run.total + ')', 'jobErrors');
  } else {
    count.cycles += 1;
  }
  command('gcode:unload');
  await sleep(5000);
};

const main = async () => {
  const first = await shouldStop();
  if (first) {
    event('refus de démarrer : ' + first);
    process.exit(1);
  }
  event('début, ' + HOURS + ' h, arrêt prévu ' + new Date(DEADLINE).toISOString() + ', pid ' + process.pid);
  connect();
  sample();
  setInterval(sample, 60000);
  setInterval(() => {
    // Real port check every 5 s, the rest with it.
    shouldStop().then((why) => why && finish(why), () => {});
  }, 5000);
  for (;;) {
    if (stopping) return;
    try {
      await cycle();
    } catch (e) {
      fail('boucle : ' + e.message, 'jobErrors');
      await sleep(10000);
    }
  }
};
process.on('SIGTERM', () => finish('SIGTERM'));
process.on('SIGINT', () => finish('SIGINT'));
main();
