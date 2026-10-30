'use strict';
// Audit 31 (fixes): what the real page's job controls keep across a loss of the state, offline
// fixture job-controls-fixture.cjs (no request leaves the process).
//   D-S1  stream lost during a job: Pause / Arrêter stay offered and are sent at once (the server
//         accepts them without the stream), the state is read by HTTP at once, the rest waits;
//   R-S2  browser offline flag: Pause / Arrêter still attempted, like jog-stop;
//   no replay after a reconnection, a new server epoch, a reload or a restoration (former
//         xvf-no-replay.cjs, all required);
//   D5    a confirmed action's line (« Démarrage demandé. ») is cleared once another device
//         changes the workflow;
//   D6    an alarm code wiped by the board's restart banner stays shown (kept or inferred).
const assert = require('assert').strict;
const { load } = require('./job-controls-fixture.cjs');
const RUNNING = { workflow: 'running', activeState: 'Run', canPause: true, canStop: true, canStart: false, canLoad: false };
const MOVES = ['start', 'resume', 'macro', 'home', 'unlock', 'spindle', 'zeroZ', 'set-origin', 'motion', 'load', 'prepare'];
const moves = (f, from) => f.posts().slice(from).filter((r) => MOVES.includes(r.body.action));
const stream = (f) => f.requests.filter((r) => f.isStream(r.url)).at(-1);
const gets = (f) => f.requests.filter((r) => r.method === 'GET' && /\/touch-job$/.test(r.url));

// The first HTTP read of the page is answered (as in a browser): no read is left pending.
async function connected(patch) {
  const f = load(); await f.connect(f.machine(patch));
  gets(f).filter((r) => !r.status).forEach((r) => f.answer(r, { controllers: [f.machine(patch)] })); await f.flush();
  return f;
}
async function ticketOpen(f, op) {
  f.el(op === 'resume' ? 'job-resume' : 'job-start').click(); await f.flush();
  const prep = f.posts().at(-1); assert.equal(prep.body.action, 'prepare');
  f.answer(prep, { nonce: 'n-' + op, name: 'part.nc', expiresIn: 15 }); await f.flush();
  return prep;
}
async function dropAndReconnect(f, epoch) {
  const s = stream(f);
  s.onerror(); await f.flush();
  f.advance(31000); f.tick(); await f.flush();
  const h = f.requests.filter((r) => r.url.endsWith('/custom/health')).at(-1); if (h && !h.status) { f.answer(h, { loaded: true, protocol: 1 }); await f.flush(); }
  f.advance(1000); f.tick(); await f.flush();
  const n = stream(f);
  if (n === s) return false;
  n.status = 200; n.responseText = JSON.stringify({ version: 1, epoch: epoch || 'server-one', sequence: 999, sentAt: Date.now(), transportId: 'stream-two', controllers: [f.machine()] }) + '\n'; n.onprogress(); await f.flush();
  return true;
}

(async () => {
  // ---- D-S1: the stream drops during a job.
  {
    const f = await connected(RUNNING);
    assert.equal(f.el('job-stop').disabled, false);
    const before = gets(f).length;
    stream(f).onerror(); await f.flush();
    const st = f.lastStatus();
    assert.equal(st.machine, null, 'no machine state any more');
    assert(st.halt && st.halt.port === 'COM3' && st.halt.canStop && st.halt.canPause && st.halt.workflow === 'running', 'the last busy controller stays the target: ' + JSON.stringify(st.halt));
    assert.equal(f.el('job-stop').disabled, false, 'Arrêter stays enabled during the loss (no 1-2 s gap)');
    assert.equal(f.el('job-pause').disabled, false, 'Pause stays enabled during the loss');
    assert(gets(f).length > before, 'the state is read by HTTP at once, not at the next tick');
    assert.match(f.el('job-reason').textContent, /Pause et Arrêter restent disponibles/, 'the rest is explained: ' + f.el('job-reason').textContent);
    assert.equal(f.el('job-start').disabled, true); assert.equal(f.el('job-load').disabled, true);
    const n = f.posts().length;
    f.el('job-stop').click(); await f.flush();
    const sent = f.posts().slice(n);
    assert.equal(sent.length, 1); assert.equal(sent[0].body.action, 'stop'); assert.equal(sent[0].body.port, 'COM3');
    f.answer(sent[0], { message: 'Arrêt demandé.' }); await f.flush();
    f.el('job-pause').click(); await f.flush();
    assert.equal(f.posts().at(-1).body.action, 'pause', 'Pause sent during the loss too');
    // Nothing else can be sent without a recent state.
    const m = f.posts().length; f.controls().override('feed', 110).catch(() => {}); await f.flush();
    assert.equal(f.posts().length, m, 'an override waits for a recent state');
  }
  // A controller at rest (nothing to stop) gives no target; a fresh idle state clears it.
  {
    const f = await connected();
    stream(f).onerror(); await f.flush();
    assert.equal(f.lastStatus().halt, null, 'idle controller: no Pause / Arrêter during a loss');
    assert.equal(f.el('job-stop').disabled, true);
  }
  {
    const f = await connected(RUNNING);
    f.push([f.machine()]); await f.flush();
    stream(f).onerror(); await f.flush();
    assert.equal(f.lastStatus().halt, null, 'cleared by a fresh idle state');
  }
  // A real jog of the server's (F1) is stoppable during a loss as well.
  {
    const f = await connected({ activeState: 'Jog', motion: { jog: { axis: 'X' }, cancelling: false } });
    stream(f).onerror(); await f.flush();
    assert(f.lastStatus().halt && f.lastStatus().halt.canStop, 'a jog stays stoppable');
    assert.equal(f.el('job-stop').disabled, false);
  }
  // ---- R-S2: the browser's offline flag during a job.
  {
    const f = await connected(RUNNING);
    (f.listeners.offline || []).forEach((fn) => fn({})); await f.flush();
    assert(f.lastStatus().halt, 'offline: the target is kept');
    assert.equal(f.el('job-stop').disabled, false, 'offline: Arrêter stays enabled');
    const n = f.posts().length; f.el('job-stop').click(); await f.flush();
    assert.equal(f.posts().length, n + 1, 'offline: Arrêter is still attempted');
    assert.equal(f.posts().at(-1).body.action, 'stop');
    f.el('job-pause').click(); await f.flush();
    assert.equal(f.posts().at(-1).body.action, 'pause', 'offline: Pause is still attempted');
    const m = f.posts().length; f.controls().override('feed', 110).catch(() => {}); await f.flush();
    assert.equal(f.posts().length, m, 'offline: anything else is not sent');
  }

  // ---- No replay (former xvf-no-replay.cjs, every case required).
  {
    const f = await connected(); await ticketOpen(f, 'start');
    assert.equal(f.el('job-dialog').hidden, false);
    const n = f.posts().length; await dropAndReconnect(f);
    f.el('job-check').checked = true; f.el('job-check').fire('change'); f.el('job-confirm').disabled = false; f.el('job-confirm').click(); await f.flush();
    f.tick(); f.tick(); await f.flush();
    assert(f.el('job-dialog').hidden && moves(f, n).length === 0, 'drop + reconnection during a confirmation: nothing sent');
  }
  {
    const f = await connected(); await ticketOpen(f, 'start');
    const n = f.posts().length, s = stream(f);
    s.responseText += JSON.stringify({ version: 1, epoch: 'server-two', sequence: 1, sentAt: Date.now(), transportId: 'stream-one', controllers: [f.machine()] }) + '\n'; s.onprogress(); await f.flush();
    f.el('job-confirm').disabled = false; f.el('job-check').checked = true; f.el('job-confirm').click(); await f.flush();
    assert(moves(f, n).length === 0 && f.el('job-dialog').hidden, 'new server epoch during the confirmation: nothing sent');
  }
  {
    const f = await connected();
    f.el('job-start').click(); await f.flush(); const prep = f.posts().at(-1);
    await dropAndReconnect(f);
    f.answer(prep, { nonce: 'late', name: 'part.nc', expiresIn: 15 }); await f.flush();
    assert.equal(f.el('job-dialog').hidden, true, 'a ticket answered after the reconnection opens no dialog');
  }
  {
    const f = await connected(); await ticketOpen(f, 'start');
    f.el('job-check').checked = true; f.el('job-check').fire('change'); f.el('job-confirm').click(); await f.flush();
    const start = f.posts().at(-1); assert.equal(start.body.action, 'start');
    const n = f.posts().length; start.onerror(); await f.flush();
    assert.equal(f.el('job-feedback').getAttribute('data-state'), 'uncertain');
    await dropAndReconnect(f); for (let i = 0; i < 5; i++) { f.advance(2000); f.tick(); await f.flush(); }
    assert.equal(moves(f, n).length, 0, 'answer lost, reconnection and 10 s: no start / resume replayed');
  }
  {
    const f = await connected(RUNNING);
    f.el('job-pause').click(); await f.flush(); f.el('job-stop').click(); await f.flush();
    const halts = () => f.posts().filter((r) => r.body.action === 'pause' || r.body.action === 'stop');
    const sent = halts().length; halts().forEach((r) => r.onerror());
    await dropAndReconnect(f); for (let i = 0; i < 5; i++) { f.advance(2000); f.tick(); await f.flush(); }
    assert(sent === 2 && halts().length === 2, 'Pause / Arrêter without answer then reconnection: neither replayed nor doubled');
  }
  {
    const f1 = await connected({ workflow: 'paused', activeState: 'Hold:0', canResume: true, canStop: true });
    await ticketOpen(f1, 'resume');
    const f2 = load({ storage: f1.storage }); await f2.connect(f2.machine({ workflow: 'paused', activeState: 'Hold:0', canResume: true, canStop: true }));
    for (let i = 0; i < 5; i++) { f2.advance(2000); f2.tick(); await f2.flush(); }
    assert(f2.posts().length === 0 && f2.el('job-dialog').hidden, 'reload during a resume confirmation: the new page sends nothing');
  }
  {
    const f = await connected({ workflow: 'paused', activeState: 'Hold:0', canResume: true, canStop: true });
    await ticketOpen(f, 'resume'); const n = f.posts().length;
    (f.listeners.pagehide || []).forEach((fn) => fn({ persisted: true })); await f.flush();
    (f.listeners.pageshow || []).forEach((fn) => fn({ persisted: true })); await f.flush();
    await dropAndReconnect(f);
    f.el('job-check').checked = true; f.el('job-confirm').disabled = false; f.el('job-confirm').click(); await f.flush();
    assert(f.el('job-dialog').hidden && moves(f, n).length === 0, 'restored from the back/forward cache: Confirmer sends nothing');
  }
  {
    const f = await connected(); await ticketOpen(f, 'start'); const n = f.posts().length;
    f.document.hidden = true; (f.listeners['doc:visibilitychange'] || []).forEach((fn) => fn({})); await f.flush();
    f.document.hidden = false; (f.listeners['doc:visibilitychange'] || []).forEach((fn) => fn({})); await f.flush();
    await dropAndReconnect(f);
    assert(f.el('job-dialog').hidden && moves(f, n).length === 0, 'page hidden then back: dialog closed, nothing sent');
  }

  // ---- D5: the action line follows the observed workflow.
  {
    const f = await connected(); await ticketOpen(f, 'start');
    f.el('job-check').checked = true; f.el('job-check').fire('change'); f.el('job-confirm').click(); await f.flush();
    f.answer(f.posts().at(-1), { message: 'Démarrage demandé.' }); await f.flush();
    assert.equal(f.el('job-feedback').textContent, 'Démarrage demandé.');
    f.push([f.machine(RUNNING)]); await f.flush();
    assert.equal(f.el('job-feedback').textContent, 'Démarrage demandé.', 'kept while the job runs');
    // Another device pauses the job.
    f.push([f.machine({ workflow: 'paused', activeState: 'Hold:0', canResume: true, canStop: true })]); await f.flush();
    assert.equal(f.el('job-feedback').textContent, '', 'cleared once another device paused');
    assert.equal(f.el('job-feedback').getAttribute('data-state'), '');
    assert.equal(f.lastStatus().feedback, '', 'the strip / Suivi line is cleared too');
  }
  {
    const f = await connected(RUNNING);
    f.el('job-pause').click(); await f.flush();
    f.answer(f.posts().at(-1), { message: 'Pause demandée.' }); await f.flush();
    f.push([f.machine({ workflow: 'paused', activeState: 'Hold:0', canResume: true, canStop: true })]); await f.flush();
    assert.equal(f.el('job-feedback').textContent, 'Pause demandée.');
    f.push([f.machine({ workflow: 'idle', activeState: 'Idle' })]); await f.flush();
    assert.equal(f.el('job-feedback').textContent, '', 'cleared once another device stopped the paused job');
  }
  {
    // A failed or uncertain action keeps its line (it says what happened here).
    const f = await connected(RUNNING);
    f.el('job-stop').click(); await f.flush(); f.posts().at(-1).onerror(); await f.flush();
    f.push([f.machine({ workflow: 'paused', activeState: 'Hold:0', canStop: true })]); await f.flush();
    assert.equal(f.el('job-feedback').getAttribute('data-state'), 'uncertain', 'an uncertain line is not cleared by the workflow');
  }

  // ---- D6: the alarm code after the restart banner.
  {
    const f = await connected(RUNNING);
    f.push([f.machine({ activeState: 'Alarm', workflow: 'idle', alarmCode: null, canStop: false })]); await f.flush();
    let m = f.lastStatus().machine;
    assert.equal(m.alarmCode, 3, 'Run then Alarm without code: ALARM:3 inferred');
    assert.equal(m.alarmCodeInferred, true);
    const help = require('./touch/grbl-help.js');
    assert.equal(help.text(help.alarm(m.alarmCode, m.alarmCodeInferred)), 'Alarme 3 (code effacé au redémarrage de la carte, déduit de l’état précédent) : Réinitialisation pendant un mouvement. Un arrêt ou une réinitialisation a coupé un déplacement : la position peut être fausse. Refaites la prise d’origine ($H) avant de reprendre.');
    f.push([f.machine({ activeState: 'Alarm', workflow: 'idle', alarmCode: null })]); await f.flush();
    assert.equal(f.lastStatus().machine.alarmCode, 3, 'kept while the alarm lasts');
    f.push([f.machine({ activeState: 'Idle', workflow: 'idle' })]); await f.flush();
    f.push([f.machine({ activeState: 'Alarm', workflow: 'idle', alarmCode: null })]); await f.flush();
    m = f.lastStatus().machine;
    assert.equal(m.alarmCode, null, 'a new alarm from rest without code: no code invented');
  }
  {
    const f = await connected(RUNNING);
    f.push([f.machine({ activeState: 'Alarm', workflow: 'idle', alarmCode: 2 })]); await f.flush();
    f.push([f.machine({ activeState: 'Alarm', workflow: 'idle', alarmCode: null })]); await f.flush();
    const m = f.lastStatus().machine;
    assert.equal(m.alarmCode, 2, 'a received code stays after the banner');
    assert.equal(m.alarmCodeKept, true); assert.notEqual(m.alarmCodeInferred, true);
  }
  {
    const f = await connected({ activeState: 'Home', workflow: 'idle', homing: true, canStop: true });
    f.push([f.machine({ activeState: 'Alarm', workflow: 'idle', alarmCode: null })]); await f.flush();
    assert.equal(f.lastStatus().machine.alarmCode, 6, 'reset during homing: ALARM:6 inferred');
  }
  // ---- V7: deduce ALARM:3 only from a move really reported in the last 5 s (former xvz-d6).
  {
    // A program pause at rest (M0, tool change: Grbl Idle): a reset there raises no ALARM:3.
    const f = await connected({ workflow: 'paused', activeState: 'Idle', canStop: true, canResume: true });
    f.push([f.machine({ activeState: 'Alarm', workflow: 'idle', alarmCode: null })]); await f.flush();
    assert.equal(f.lastStatus().machine.alarmCode, null, 'program pause at rest: no code deduced');
  }
  {
    // Run seen 10 min before (no report since): too old to explain the alarm.
    const f = await connected(RUNNING);
    f.advance(10 * 60 * 1000);
    f.push([f.machine({ activeState: 'Alarm', workflow: 'idle', alarmCode: null })]); await f.flush();
    assert.equal(f.lastStatus().machine.alarmCode, null, 'a move seen 10 min ago deduces nothing');
  }
  {
    // A completed hold (Hold:0) after the move, 6 s later: no longer a reset during a move.
    const f = await connected(RUNNING);
    f.advance(1000); f.push([f.machine({ activeState: 'Hold:0', workflow: 'paused', canStop: true })]); await f.flush();
    f.advance(6000); f.push([f.machine({ activeState: 'Alarm', workflow: 'idle', alarmCode: null })]); await f.flush();
    assert.equal(f.lastStatus().machine.alarmCode, null, 'Hold:0 for 6 s then a restart: nothing deduced');
  }
  {
    // The stop of the touch service (hold, then reset) 2 s after the last Run report: deduced.
    const f = await connected(RUNNING);
    f.advance(1500); f.push([f.machine({ activeState: 'Hold:0', workflow: 'running', canStop: true })]); await f.flush();
    f.advance(500); f.push([f.machine({ activeState: 'Alarm', workflow: 'idle', alarmCode: null })]); await f.flush();
    const m = f.lastStatus().machine;
    assert.equal(m.alarmCode, 3); assert.equal(m.alarmCodeInferred, true);
  }
  {
    // A received code replaces a deduction.
    const f = await connected(RUNNING);
    f.push([f.machine({ activeState: 'Alarm', workflow: 'idle', alarmCode: null })]); await f.flush();
    f.push([f.machine({ activeState: 'Alarm', workflow: 'idle', alarmCode: 1 })]); await f.flush();
    const m = f.lastStatus().machine;
    assert.equal(m.alarmCode, 1); assert.notEqual(m.alarmCodeInferred, true);
  }
  {
    // Idle → Alarm without code: no code invented.
    const f = await connected();
    f.push([f.machine({ activeState: 'Alarm', workflow: 'idle', alarmCode: null })]); await f.flush();
    assert.equal(f.lastStatus().machine.alarmCode, null);
  }
  // ---- N4: the unlock confirmation says what an unlock does (no move, no file).
  {
    const f = await connected({ activeState: 'Alarm', workflow: 'idle', canUnlock: true, canStart: false });
    f.controls().prepareCommand('unlock'); await f.flush();
    const prep = f.posts().at(-1); assert.equal(prep.body.action, 'prepare'); assert.equal(prep.body.operation, 'unlock');
    f.answer(prep, { nonce: 'n-unlock', name: '', expiresIn: 15 }); await f.flush();
    assert.equal(f.el('job-dialog').hidden, false);
    assert.match(f.el('job-warning').textContent, /\$X\) lève l’alarme sans aucun mouvement/);
    assert.equal(f.el('job-check-text').textContent, 'Je suis devant la machine et la cause de l’alarme est réglée.');
    assert.doesNotMatch(f.el('job-warning').textContent + f.el('job-check-text').textContent, /met la machine en mouvement|lancer ce fichier/);
    f.el('job-dismiss').click(); await f.flush();
    // The start confirmation keeps its own texts.
    f.push([f.machine()]); await f.flush();
    await ticketOpen(f, 'start');
    assert.match(f.el('job-warning').textContent, /met la machine en mouvement/);
    assert.equal(f.el('job-check-text').textContent, 'Je suis devant la machine et prêt à lancer ce fichier.');
  }
  console.log('PASS strip continuity: Pause / Arrêter offered and sent during a loss of the state and with the offline flag, HTTP read at once, no command replayed, action line follows the workflow, alarm code kept after the restart banner.');
})().catch((e) => { console.error(e); process.exit(1); });
