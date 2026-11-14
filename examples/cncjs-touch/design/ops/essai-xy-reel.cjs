'use strict';
// Essai réel des déplacements par le MÊME chemin serveur que la tablette (Préparer, real-motion.js) :
// flux GET <route>api/touch-events?clientId=… (NDJSON), puis POST <route>api/touch-job avec clientId,
// clientLabel, port, generation et transportId. Chaque lancement a sa propre identité
// (essai-xy-reel-<aléa>) : le pilotage est pris par la première opération gardée réussie et rendu à la
// fin ({action:'control', operation:'release'}) seulement si CE lancement l'a pris. Si un autre appareil
// (ou un autre lancement de ce script) pilote le port, le script s'arrête sans prendre la main.
//
// À lancer SUR LA SURFACE (là où tourne CNCjs), avec les modules de ~/cncjs-v2/node_modules :
//   NODE_PATH=~/cncjs-v2/node_modules node essai-xy-reel.cjs [options]
//
// Sans option : lecture seule (état, pilotage, raisons du serveur). Rien n'est envoyé, rien n'est rendu.
//   --reset        Arrêter (comme le bouton du bandeau), seulement carte en Hold sans travail, rapport
//                  récent et aucune prise d'origine en cours ; au repos (Idle) il n'y a rien à arrêter :
//                  le script le dit et n'envoie rien.
//   --home         prise d'origine ($H) par le ticket de la tablette (prepare home → home), puis attente
//                  du début (homing vu après l'envoi) et de la fin du même cycle (Idle et homed vrai) ;
//                  affiche MPos et broches. Arrêt à toute alarme survenue pendant l'essai (une alarme déjà
//                  là au départ n'est pas comptée), au premier refus ou à un redémarrage de la carte.
//   --go           pas de jog X, Y puis Z, 0,1 mm puis 1 mm, aller et retour, à vitesse basse
//                  (X/Y ≤ 500 mm/min, Z ≤ 300) ; Z seulement sur machine référencée ($H constaté) et
//                  course $132 connue, d'abord vers le bas puis retour, jamais hors de [-$132, 0] ;
//                  MPos comparée avant/après (0,01 mm) ; arrêt au premier écart, refus, alarme, rapport
//                  ancien ou annulation non confirmée.
//   --axes=XY      avec --go : axes essayés (XY exclut Z ; défaut XYZ).
//   --feed=N       avec --go : avance X/Y en mm/min (défaut 400, 500 au plus ; Z : min(N, 300), défaut 200).
//   --port=/dev/ttyUSB0   --base=http://127.0.0.1:8000/   --config=~/.cncrc
// Jeton : JWT signé avec le « secret » de ~/.cncrc (jsonwebtoken), jamais affiché ; à défaut, la
// connexion sans compte de CNCjs (POST api/signin). Code de sortie : 0 réussi (ou rien à faire),
// 2 arrêt sur un problème (refus, délai, alarme, écart).
// Banc local : examples/cncjs-touch/test-essai-xy-reel.cjs (faux contrôleur, jamais la machine).
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), crypto = require('crypto');

const args = process.argv.slice(2);
const opt = (name, fallback) => { const a = args.find((x) => x.startsWith('--' + name + '=')); return a ? a.slice(name.length + 3) : fallback; };
const has = (name) => args.includes('--' + name);
const known = ['reset', 'home', 'go'];
args.forEach((a) => { if (!/^--(reset|home|go|axes=.+|feed=\d+|port=.+|base=.+|config=.+)$/.test(a)) { console.error('Option inconnue : ' + a); process.exit(2); } });
if (known.filter(has).length > 1) { console.error('Une seule action à la fois : --reset, --home ou --go.'); process.exit(2); }
const PORT = opt('port', '/dev/ttyUSB0');
const BASE = new URL(opt('base', 'http://127.0.0.1:8000/'));
const CONFIG = opt('config', path.join(os.homedir(), '.cncrc')).replace(/^~(?=$|\/)/, os.homedir());
const AXES = opt('axes', 'XYZ').toUpperCase().split('').filter((a, i, all) => 'XYZ'.includes(a) && all.indexOf(a) === i);
const FEED_XY = Math.min(500, Math.max(1, Number(opt('feed', 400)) || 400));
const FEED_Z = Math.min(300, opt('feed') ? FEED_XY : 200);
// One identity per run: a read-only run never releases the lease of another run.
const PREFIX = 'essai-xy-reel', CLIENT = PREFIX + '-' + crypto.randomBytes(4).toString('hex'), LABEL = 'Essai XY réel';
const route = (p) => BASE.pathname.replace(/\/?$/, '/') + p;

function token() {
  let secret = null;
  try { secret = JSON.parse(fs.readFileSync(CONFIG, 'utf8')).secret || null; } catch (_) { secret = null; }
  if (secret) {
    try {
      const jwt = require('jsonwebtoken');
      return Promise.resolve(jwt.sign({ id: '', name: '' }, secret, { expiresIn: '1h' }));
    } catch (_) { /* module absent: the sign-in below */ }
  }
  return request('POST', route('api/signin'), {}).then((r) => {
    if (!r.body || !r.body.token) throw new Error('jeton indisponible (signin ' + r.status + ')');
    return r.body.token;
  });
}
function request(method, p, body, auth) {
  return new Promise((ok, ko) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = Object.assign({ 'Content-Type': 'application/json' }, auth ? { Authorization: 'Bearer ' + auth } : {}, data ? { 'Content-Length': Buffer.byteLength(data) } : {});
    const r = http.request({ host: BASE.hostname, port: BASE.port || 80, method, path: p, headers }, (res) => {
      let s = ''; res.setEncoding('utf8'); res.on('data', (c) => { s += c; });
      res.on('end', () => { let j = null; try { j = JSON.parse(s); } catch (_) { j = null; } ok({ status: res.statusCode, body: j || s }); });
    });
    r.setTimeout(30000, () => r.destroy(new Error('sans réponse du serveur (30 s)')));
    r.on('error', ko); if (data) r.write(data); r.end();
  });
}
const num = (v) => { const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v; return typeof n === 'number' && isFinite(n) ? n : null; };
const mpos = (c, a) => num(c && c.coordinates && c.coordinates.mpos && c.coordinates.mpos[a.toLowerCase()]);
const fmt = (c) => !c ? 'aucun contrôleur sur ' + PORT : c.activeState + (c.subState !== null && c.subState !== undefined ? ':' + c.subState : '') +
  ' · travail ' + c.workflow + ' · référencée ' + (c.homed === true ? 'oui' : 'non') + ' · MPos ' + ['X', 'Y', 'Z'].map((a) => { const v = mpos(c, a); return a + ' ' + (v === null ? '?' : v.toFixed(3)); }).join(' ') +
  ' · broches ' + (c.probeInput && typeof c.probeInput.pins === 'string' ? (c.probeInput.pins || 'aucune') : 'inconnues') + (c.alarmCode ? ' · ALARM:' + c.alarmCode : '') + (c.fresh === false ? ' · rapport ancien' : '');
const ownerText = (o) => (!o ? 'libre' : o.id === CLIENT ? 'ce lancement' : String(o.id || '').indexOf(PREFIX) === 0 ? 'un autre lancement de ce script' : '« ' + (o.label || o.id) + ' »') + (o && o.present === false ? ' (absent)' : '');

(async () => {
  const auth = await token();
  // packets: controller packets received so far, so a wait can ignore what was known before a command.
  let latest = null, transportId = null, stream = null, closed = false, packets = 0;
  const waiters = new Set();
  // The event stream, reopened when the server renews it ({rotate:true}, every minute): the new transportId is used.
  function open() {
    if (closed) return;
    const req = http.request({ host: BASE.hostname, port: BASE.port || 80, path: route('api/touch-events') + '?clientId=' + encodeURIComponent(CLIENT) + '&clientLabel=' + encodeURIComponent(LABEL), headers: { Authorization: 'Bearer ' + auth } }, (res) => {
      if (res.statusCode !== 200) { console.log('Flux refusé : HTTP ' + res.statusCode); res.resume(); return; }
      let buf = ''; res.setEncoding('utf8');
      res.on('data', (chunk) => {
        buf += chunk; let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue;
          let p; try { p = JSON.parse(line); } catch (_) { continue; }
          if (p.transportId) transportId = p.transportId;
          if (Array.isArray(p.controllers)) { latest = p.controllers.find((c) => c.port === PORT) || null; packets++; waiters.forEach((w) => w()); }
        }
      });
      res.on('end', () => { transportId = null; setTimeout(open, 200); });
    });
    req.on('error', () => { transportId = null; setTimeout(open, 1000); });
    req.end(); stream = req;
  }
  open();
  // Resolves with the first state, received after packet number `after`, that `pred` accepts; `pred` may throw to stop at once.
  const until = (pred, ms, label, after = 0) => new Promise((ok, ko) => {
    const t0 = Date.now();
    const check = () => {
      try {
        if (latest && transportId && packets > after && pred(latest)) { done(); ok(latest); } else if (Date.now() - t0 > ms) { done(); ko(new Error('délai dépassé : ' + label + ' — ' + fmt(latest))); }
      } catch (e) { done(); ko(e); }
    };
    const iv = setInterval(check, 100); const done = () => { clearInterval(iv); waiters.delete(check); };
    waiters.add(check); check();
  });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let piloted = false;
  const act = async (body) => {
    const r = await request('POST', route('api/touch-job'), Object.assign({ clientId: CLIENT, clientLabel: LABEL, port: PORT, transportId, generation: latest && latest.generation }, body), auth);
    const text = r.body && typeof r.body === 'object' ? (r.body.message || (r.body.nonce ? 'ticket « ' + (r.body.name || '') + ' »' : 'accepté')) : String(r.body).slice(0, 200);
    console.log('  ' + body.action + (body.operation ? '/' + body.operation : '') + (body.axis ? ' ' + body.axis + (body.direction > 0 ? '+' : '−') + body.step + ' mm F' + body.feed : '') + ' → ' + r.status + ' ' + text);
    if (r.status >= 300) throw new Error('refus du serveur : ' + text);
    // A guarded operation accepted: this run holds the lease (released at the end). Arrêter takes none.
    if (body.action !== 'control' && body.action !== 'stop') piloted = true;
    return r.body;
  };
  try {
    const c = await until((x) => !!x, 10000, 'premier état');
    const owner = c.control && c.control.owner;
    console.log('État      : ' + fmt(c));
    console.log('Pilotage  : ' + ownerText(owner));
    console.log('Capacités : jog ' + (c.capabilities && c.capabilities.jog ? (c.capabilities.jog.enabled ? 'activé' : 'non activé — ' + c.capabilities.jog.reason) : 'inconnues (serveur ancien)'));
    console.log('Jog       : ' + (c.motion ? (c.motion.canJog ? 'possible' : c.motion.jogReason) : '—'));
    console.log('Continu   : ' + (c.motion && c.motion.continuousReason ? ['X', 'Y', 'Z'].map((a) => a + ' ' + (c.motion.continuousReason[a] || 'possible')).join(' · ') : '—'));
    console.log('Origine   : ' + (c.motion ? (c.motion.canSetOrigin ? 'zéro de travail possible' : c.motion.setOriginReason) : '—') + ' · $H ' + (c.canHome ? 'possible' : c.homeReason));
    const s = c.settings || {};
    console.log('Réglages  : $13=' + s.$13 + ' $20=' + s.$20 + ' $21=' + s.$21 + ' $22=' + s.$22 + ' $23=' + s.$23 + ' $130-132=' + [s.$130, s.$131, s.$132].join('/') + ' $110-112=' + [s.$110, s.$111, s.$112].join('/'));
    if (!has('reset') && !has('home') && !has('go')) { console.log('Lecture seule : rien n’a été envoyé.'); return; }
    if (owner) throw new Error('ARRÊT : la machine est pilotée par ' + ownerText(owner) + ' ; ce script ne prend pas la main.');
    if (c.fresh === false) throw new Error('ARRÊT : rapport machine trop ancien.');
    if (has('reset')) {
      if (c.workflow !== 'idle' || c.homing || !/^(Hold|Idle)/.test(c.activeState)) throw new Error('ARRÊT : Arrêter seulement en Hold ou au repos, sans travail ni prise d’origine en cours (état ' + c.activeState + ', travail ' + c.workflow + ').');
      if (/^Idle/.test(c.activeState)) { console.log('Au repos : rien à arrêter, rien n’a été envoyé.'); return; }
      const mark = packets;
      await act({ action: 'stop' });
      await until((x) => /^(Alarm|Idle)/.test(x.activeState), 15000, 'sortie de Hold', mark);
      await sleep(1500);
      console.log('Après     : ' + fmt(latest));
      return;
    }
    if (has('home')) {
      if (!c.canHome) throw new Error('ARRÊT : prise d’origine refusée par le serveur : ' + c.homeReason);
      const startAlarm = /^Alarm/.test(c.activeState), startCode = c.alarmCode || null, startGeneration = c.generation, startups = c.startups;
      const ticket = await act({ action: 'prepare', operation: 'home' });
      if (!ticket || !ticket.nonce) throw new Error('ARRÊT : pas de ticket de prise d’origine.');
      const mark = packets;
      let begun = false;
      // Every state received after the $H is watched from before its sending (its whole cycle may
      // arrive before the answer): its start (homing or Home), then its end (homing over).
      const watchStart = () => { if (packets > mark && latest && (latest.homing === true || /^Home/.test(latest.activeState))) begun = true; };
      waiters.add(watchStart);
      try { await act({ action: 'home', nonce: ticket.nonce }); } finally { watchStart(); }
      const t0 = Date.now();
      // A new alarm code or an alarm from rest, or a board restart, stops at once; the code already there
      // at the start may go away (Grbl clears it with the homing).
      const end = await until((x) => {
        watchStart();
        if (x.generation !== startGeneration || (startups !== undefined && x.startups !== startups)) throw new Error('ARRÊT : la carte a redémarré pendant la prise d’origine — ' + fmt(x));
        if ((x.alarmCode && x.alarmCode !== startCode) || (!startAlarm && /^Alarm/.test(x.activeState))) throw new Error('ARRÊT : alarme pendant la prise d’origine — ' + fmt(x));
        return begun && !x.homing && /^(Idle|Alarm)/.test(x.activeState);
      }, 180000, 'fin de la prise d’origine', mark).finally(() => waiters.delete(watchStart));
      await sleep(1000);
      console.log('Fin       : ' + fmt(latest) + ' (' + Math.round((Date.now() - t0) / 1000) + ' s)');
      if (!/^Idle/.test(end.activeState) || latest.homed !== true) throw new Error('ARRÊT : prise d’origine non constatée — ' + fmt(latest));
      console.log('Jog       : ' + (latest.motion ? (latest.motion.canJog ? 'possible' : latest.motion.jogReason) : '—'));
      console.log('Continu   : ' + (latest.motion && latest.motion.continuousReason ? ['X', 'Y', 'Z'].map((a) => a + ' ' + (latest.motion.continuousReason[a] || 'possible')).join(' · ') : '—'));
      return;
    }
    // --go: steps there and back, the end of each one read on MPos.
    if (!c.motion || !c.motion.canJog) throw new Error('ARRÊT : jog refusé par le serveur : ' + (c.motion ? c.motion.jogReason : 'serveur sans déplacements'));
    // Z: its lower switch may not answer; never tried without a homing seen and a known travel.
    if (AXES.includes('Z') && (c.homed !== true || num(s.$132) === null || num(s.$132) <= 0)) {
      throw new Error('ARRÊT : Z non essayé : machine non référencée ou course $132 inconnue (faites --home, ou --axes=XY).');
    }
    for (const axis of AXES) {
      const travel = num(s['$' + (130 + 'XYZ'.indexOf(axis))]);
      const feed = axis === 'Z' ? FEED_Z : FEED_XY;
      let first;
      if (axis === 'Z') first = -1;
      else { const p = mpos(latest, axis); first = travel !== null && p !== null && p > travel / 2 ? -1 : 1; }
      for (const step of [0.1, 1]) {
        for (const direction of [first, -first]) {
          const ready = await until((x) => x.fresh !== false && /^Idle/.test(x.activeState) && x.motion && x.motion.canJog, 15000, 'repos avant ' + axis);
          const before = mpos(ready, axis);
          if (before === null) throw new Error('ARRÊT : MPos ' + axis + ' inconnue.');
          const target = before + direction * step;
          // Z never beyond its known travel [-$132, 0] (nor X / Y beyond [-$13x, $13x]); the server checks it too.
          if (axis === 'Z' && (target < -travel - 1e-6 || target > 1e-6)) throw new Error('ARRÊT : Z ' + target.toFixed(3) + ' sortirait de la course connue [-' + travel + ', 0].');
          if (travel !== null && Math.abs(target) > travel + 1e-6) throw new Error('ARRÊT : ' + axis + ' ' + target.toFixed(3) + ' sortirait de la course connue.');
          const mark = packets;
          await act({ action: 'motion', operation: 'jog', axis, direction, step, feed });
          const end = await until((x) => {
            if (/^Alarm/.test(x.activeState)) throw new Error('ARRÊT : alarme pendant ' + axis + ' — ' + fmt(x));
            if (x.motion && x.motion.cancelUnconfirmed) throw new Error('ARRÊT : annulation non confirmée — utilisez l’arrêt physique si la machine bouge encore.');
            if (x.fresh === false) throw new Error('ARRÊT : rapport machine trop ancien pendant ' + axis + '.');
            return /^Idle/.test(x.activeState) && x.motion && x.motion.canJog && mpos(x, axis) !== null && Math.abs(mpos(x, axis) - target) < 0.01;
          }, 60000 * step / feed + 15000, axis + ' ' + (direction > 0 ? '+' : '−') + step + ' mm', mark);
          const after = mpos(end, axis);
          console.log('  ' + axis + ' ' + (direction > 0 ? '+' : '−') + step + ' mm : ' + before.toFixed(3) + ' → ' + after.toFixed(3) + ' (attendu ' + target.toFixed(3) + ')');
          await sleep(400);
          const other = ['X', 'Y', 'Z'].filter((a) => a !== axis).find((a) => { const p0 = mpos(ready, a), p1 = mpos(latest, a); return p0 !== null && p1 !== null && Math.abs(p1 - p0) >= 0.01; });
          if (other) throw new Error('ARRÊT : l’axe ' + other + ' a bougé pendant le pas ' + axis + ' — ' + fmt(latest));
        }
      }
    }
    console.log('Fin       : ' + fmt(latest) + ' · tous les pas sont exacts.');
  } catch (e) {
    console.log('ERREUR : ' + e.message);
    process.exitCode = 2;
  } finally {
    // Only the lease this run took itself.
    if (piloted) {
      try { await act({ action: 'control', operation: 'release' }); } catch (e) { console.log('  rendu du pilotage : ' + e.message); }
    }
    closed = true; if (stream) stream.destroy();
    setTimeout(() => process.exit(), 300);
  }
})().catch((e) => { console.log('ERREUR : ' + e.message); process.exit(2); });
