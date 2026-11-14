'use strict';
// Banc local du script design/ops/essai-xy-reel.cjs, jamais la machine : le vrai service touch
// (job-service.js, motion.js, touch-stream.js) derrière un petit serveur HTTP sur 127.0.0.1, devant un
// faux Grbl 1.1f réglé comme la LUNYEE 4040 ($23=3, $130-132=408/396/130, origine forcée à 0 par $H).
// Le script tourne en processus séparé, comme sur la Surface. Vérifie : lecture seule sans aucune
// requête d'action, --home (début puis fin du même cycle, alarme pendant le cycle), --go X/Y après $H
// (la convention apprise lève l'ambiguïté), Z refusé sans référencement, --reset (Hold seulement),
// un lancement en lecture seule qui ne rend jamais le pilotage d'un autre lancement.
// Hors de verify-project.cjs (qui n'ouvre aucun serveur) ; Node.js 22.12 ou plus (require d'un module ES).
const assert = require('assert').strict, http = require('http'), fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const { createService } = require('../../src/server/services/touch/job-service.js');
const { createStream } = require('../../src/server/services/touch/touch-stream.js');
const { createControl } = require('../../src/server/services/touch/control.js');

const PORT = '/dev/ttyUSB0';
function bench() {
  const st = { activeState: 'Alarm', spindle: 0, mpos: { x: '0.000', y: '0.000', z: '0.000' }, wpos: { x: '0.000', y: '0.000', z: '0.000' } };
  const c = { type: 'Grbl', options: { port: PORT }, ready: true, isClose: () => false, runner: new EventEmitter(), sender: new EventEmitter(),
    workflow: Object.assign(new EventEmitter(), { state: 'idle' }), state: { status: st }, feeder: { toJSON: () => ({ queue: 0, pending: false }) },
    settings: { version: '1.1f', settings: { $10: '1', $13: '0', $20: '1', $21: '1', $22: '1', $23: '3', $27: '2', $110: '2000', $111: '2000', $112: '500', $130: '408', $131: '396', $132: '130' } },
    written: [], homingAlarm: false };
  c.runner.state = c.state; c.sender.state = { name: '', context: {}, total: 0 }; c.sender.toJSON = () => ({ ...c.sender.state });
  const set = (axis, v) => { st.mpos[axis] = v.toFixed(3); st.wpos[axis] = v.toFixed(3); };
  c.command = (name, line) => {
    c.written.push(name === 'gcode' ? line : name);
    if (name === 'gcode' && /^\$J=G91 G21 ([XYZ])(-?[\d.]+) F([\d.]+)$/.test(line)) {
      const [, axis, d, f] = /^\$J=G91 G21 ([XYZ])(-?[\d.]+) F([\d.]+)$/.exec(line);
      setImmediate(() => c.runner.emit('ok'));
      st.activeState = 'Jog';
      const a = axis.toLowerCase(), to = Number(st.mpos[a]) + Number(d);
      setTimeout(() => { set(a, to); st.activeState = 'Idle'; }, Math.max(100, 60000 * Math.abs(Number(d)) / Number(f)));
    } else if (name === 'homing') {
      st.activeState = 'Home';
      setTimeout(() => {
        if (c.homingAlarm) { st.activeState = 'Alarm'; c.runner.emit('alarm', 'ALARM:9'); return; }
        ['x', 'y', 'z'].forEach((a) => set(a, 0)); st.activeState = 'Idle'; c.runner.emit('ok');
      }, 1500);
    } else if (name === 'jogCancel') {
      st.activeState = 'Idle';
    } else if (name === 'reset') {
      st.activeState = 'Alarm';
    }
  };
  const service = createService({ get: () => ({ [PORT]: c }) }, { get: (key) => ({ 'touch.motion.enabled': true, events: [], macros: [] }[key]) }, undefined,
    { control: createControl(), history: { record: () => {} } });
  const stream = createStream(service);
  const reports = setInterval(() => c.runner.emit('status'), 100);
  const posts = [];
  const actor = (q, b) => ({ kind: 'touch', id: String((b && b.clientId) || q.get('clientId') || ''), label: String((b && b.clientLabel) || q.get('clientLabel') || ''), user: '' });
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (req.method === 'GET' && url.pathname === '/api/touch-events') { if (!stream.open(req, res, actor(url.searchParams))) { res.statusCode = 503; res.end(); } return; }
    let raw = ''; req.on('data', (x) => { raw += x; });
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      if (url.pathname === '/api/signin') { res.end(JSON.stringify({ token: 'bench' })); return; }
      const body = JSON.parse(raw || '{}'); posts.push(body);
      service.action(body, actor(url.searchParams, body)).then((r) => { res.end(JSON.stringify(r)); stream.publish(); },
        (e) => { res.statusCode = e.status || 400; res.end(JSON.stringify({ message: e.message, code: e.code })); });
    });
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ c, st, service, stream, posts, base: 'http://127.0.0.1:' + server.address().port + '/',
    close() { clearInterval(reports); stream.dispose(); server.close(); } })));
}
const config = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'essai-xy-')), 'cncrc.json');
fs.writeFileSync(config, JSON.stringify({ secret: 'banc-local-seulement' }));
const script = path.join(__dirname, 'design', 'ops', 'essai-xy-reel.cjs');
function run(b, ...options) {
  return new Promise((ok) => {
    const child = spawn(process.execPath, [script, '--base=' + b.base, '--config=' + config, ...options], { windowsHide: true });
    let out = ''; child.stdout.on('data', (x) => { out += x; }); child.stderr.on('data', (x) => { out += x; });
    const t = setTimeout(() => child.kill(), 90000);
    child.on('exit', (code) => { clearTimeout(t); ok({ code, out }); });
  });
}
const jogs = (b) => b.c.written.filter((l) => /^\$J=/.test(l));
const actions = (b) => b.posts.filter((p) => p.action !== 'control');

(async () => {
  const b = await bench();
  try {
    // Read only: no action at all, the secret never printed.
    let r = await run(b);
    assert.equal(r.code, 0, r.out); assert.match(r.out, /Lecture seule : rien n’a été envoyé\./); assert.equal(b.posts.length, 0, 'no POST at all');
    assert(!r.out.includes('banc-local-seulement'), 'secret never printed');
    // Not homed: Z refused before anything moves.
    b.st.activeState = 'Idle';
    r = await run(b, '--go');
    assert.equal(r.code, 2, r.out); assert.match(r.out, /Z non essayé : machine non référencée/); assert.equal(jogs(b).length, 0);
    // --reset at rest: nothing to stop, nothing sent.
    r = await run(b, '--reset');
    assert.equal(r.code, 0, r.out); assert.match(r.out, /Au repos : rien à arrêter/); assert.equal(actions(b).length, 0);
    // --reset in Hold:0 without a job (CNCjs keeps Hold and its substate apart): stop, then out of Hold.
    b.st.activeState = 'Hold'; b.st.subState = 0;
    r = await run(b, '--reset');
    assert.equal(r.code, 0, r.out); assert.equal(actions(b).at(-1).action, 'stop'); assert.match(r.out, /Après {5}: Alarm/);
    assert.equal(b.posts.at(-1).action, 'stop', 'Arrêter takes no lease: nothing to give back');
    // --home from Alarm (board restarted): start then end of the same cycle, MPos 0 0 0 (forced origin).
    r = await run(b, '--home');
    assert.equal(r.code, 0, r.out); assert.match(r.out, /Fin {7}: Idle · travail idle · référencée oui · MPos X 0\.000 Y 0\.000 Z 0\.000/);
    assert.match(r.out, /Continu {3}: X possible · Y possible · Z possible/, 'the convention learnt at our $H: X / Y not ambiguous at 0');
    // --go X Y: 0.1 then 1 mm there and back on each, exact, no Z.
    r = await run(b, '--go', '--axes=XY');
    assert.equal(r.code, 0, r.out); assert.match(r.out, /tous les pas sont exacts/);
    assert.deepEqual(jogs(b), ['$J=G91 G21 X0.1 F400', '$J=G91 G21 X-0.1 F400', '$J=G91 G21 X1 F400', '$J=G91 G21 X-1 F400',
      '$J=G91 G21 Y0.1 F400', '$J=G91 G21 Y-0.1 F400', '$J=G91 G21 Y1 F400', '$J=G91 G21 Y-1 F400']);
    // --go with Z after the homing: Z down first, 200 mm/min.
    r = await run(b, '--go', '--axes=Z');
    assert.equal(r.code, 0, r.out); assert.deepEqual(jogs(b).slice(-4), ['$J=G91 G21 Z-0.1 F200', '$J=G91 G21 Z0.1 F200', '$J=G91 G21 Z-1 F200', '$J=G91 G21 Z1 F200']);
    // Another run holds the lease: a read-only run neither takes nor releases it; an action run stops.
    const other = 'essai-xy-reel-0000aaaa';
    b.service.openTransport('other-stream', { kind: 'touch', id: other, label: 'Essai XY réel' });
    await b.service.action({ port: PORT, generation: b.service.list()[0].generation, transportId: 'other-stream', action: 'control', operation: 'claim' }, { kind: 'touch', id: other, label: 'Essai XY réel' });
    const before = b.posts.length;
    r = await run(b);
    assert.equal(r.code, 0, r.out); assert.match(r.out, /Pilotage {2}: un autre lancement de ce script/); assert.equal(b.posts.length, before, 'read only: no release');
    assert.equal(b.service.list()[0].control.owner.id, other, 'the other run keeps its lease');
    r = await run(b, '--go', '--axes=XY');
    assert.equal(r.code, 2, r.out); assert.match(r.out, /pilotée par un autre lancement de ce script/); assert.equal(b.posts.length, before);
    await b.service.action({ port: PORT, generation: b.service.list()[0].generation, transportId: 'other-stream', action: 'control', operation: 'release' }, { kind: 'touch', id: other, label: 'Essai XY réel' });
    b.service.closeTransport('other-stream');
    // An alarm during the homing cycle: stopped at once, exit 2.
    b.c.homingAlarm = true;
    r = await run(b, '--home');
    assert.equal(r.code, 2, r.out); assert.match(r.out, /ARRÊT : alarme pendant la prise d’origine|prise d’origine non constatée/);
  } finally { b.close(); }
  console.log('PASS essai-xy-reel: lecture seule sans requête, Z refusé sans $H, --reset en Hold seulement, --home début puis fin du même cycle (alarme arrêtée), --go X/Y puis Z exacts après $H, le pilotage d’un autre lancement jamais rendu.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
