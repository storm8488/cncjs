/* global globalThis */
/* Notification (lot N3): the operator is told, without standing at the screen, that the job
 * ended, paused (operator, program stop, tool change, refused line, feed hold, door) or that
 * the machine went into alarm. A large banner under the status strip, kept until it is
 * touched, and a short sound generated here (Web Audio, no file).
 *
 * It only reads the `cnc-job-status` detail already published by job-controls.js: no request,
 * no timer, no command, no second channel. Only what happens while this page is watching is
 * announced: the first state seen (page load, another port) is a baseline, never an event.
 * The banner is not a dialog: it takes no focus, makes nothing inert, lies under the strip
 * (Pause and Arrêter stay free) and under every sheet and confirmation. An alarm banner is
 * closed by a touch only. Nothing here animates. */
(function (root) {
  'use strict';

  // ---- Pure part: the events a new machine snapshot raises ----
  function isAlarm(m) { return /^alarm/i.test(String(m.activeState || '')); }
  function isActive(m) { return !!(m.workflow && m.workflow !== 'idle'); }
  // '' when the job is not held; else who asked: 'operator' (CNCjs pause without a program
  // reason), the program ('M0', 'M1', 'M6', 'error', 'other'), or the machine alone ('hold', 'door').
  function pauseOf(m) {
    if (!isActive(m)) return '';
    var a = String(m.activeState || '');
    if (m.workflow === 'paused') { var p = m.programPause; return p && typeof p.kind === 'string' && p.kind ? p.kind : 'operator'; }
    return /^door/i.test(a) ? 'door' : /^hold/i.test(a) ? 'hold' : '';
  }
  function machineOnly(kind) { return kind === 'hold' || kind === 'door'; }
  // The machine seen at rest with every line acknowledged while CNCjs still counts the job as
  // running: the program ran to its end (CNCjs then waits half a second before going to rest).
  // Every line acknowledged while the machine still moves proves nothing: a stop may follow.
  function observe(m) {
    var s = { port: m.port, generation: m.generation, alarm: isAlarm(m), active: isActive(m), pause: pauseOf(m),
      total: typeof m.total === 'number' && m.total > 0 ? m.total : 0, received: typeof m.received === 'number' ? m.received : 0, pending: null };
    s.settled = s.active && !s.pause && /^idle/i.test(String(m.activeState || '')) && s.total > 0 && s.received >= s.total;
    return s;
  }
  // reduce(previous state, machine snapshot, monotonic ms) → {state, events}.
  // Events: {type:'alarm'}, {type:'pause', kind, changed}, {type:'pause-end'}, {type:'start'},
  // {type:'finish', errors}. A lost state (no machine) keeps what was known: what happened during
  // the gap is announced when the state comes back, on the same port and the same opening.
  function reduce(prev, m, now) {
    if (!m) return { state: prev, events: [] };
    if (!prev || prev.port !== m.port || prev.generation !== m.generation) return { state: observe(m), events: [] };
    var next = observe(m), events = [];
    next.pending = prev.pending;
    if (next.alarm && !prev.alarm) events.push({ type: 'alarm' });
    if (next.active) {
      if (!next.total) next.total = prev.active ? prev.total : 0;
      if (!prev.active) events.push({ type: 'start' });
    } else if (prev.active) {
      // An old report does not say the job is over: the job is kept as it was.
      if (m.fresh === false) { next.active = true; next.pause = prev.pause; next.total = prev.total; next.received = prev.received; next.settled = prev.settled; }
      // Back to rest: the server's result (finished, errors, stopped) is waited for up to 2 s.
      else next.pending = { until: now + 2000, total: prev.total, received: prev.received, settled: prev.settled };
    }
    if (next.pause) {
      if (!next.alarm && !prev.pause) events.push({ type: 'pause', kind: next.pause, changed: false });
      // A resume in progress: CNCjs runs again while the machine still reports its hold, for one
      // status report. Not a new pause; a hold or a door that lasts after a resume is not announced.
      else if (!next.alarm && prev.pause !== next.pause && !(machineOnly(next.pause) && !machineOnly(prev.pause))) events.push({ type: 'pause', kind: next.pause, changed: true });
    } else if (prev.pause) events.push({ type: 'pause-end' });
    if (next.pending && !next.active) {
      var p = next.pending;
      // The report at rest carries the last acknowledgements of the same job (the simulation, a job
      // started from the PC): the last report of the job itself may be short of the total.
      if (next.total === p.total && next.received > p.received) p = next.pending = { until: p.until, total: p.total, received: next.received, settled: p.settled || next.received >= p.total };
      var known = m.finished === true || m.finishedWithErrors === true || m.jobStopped === true;
      if (known || now >= p.until) {
        next.pending = null;
        var refused = typeof m.jobErrors === 'number' && m.jobErrors > 0 ? m.jobErrors : 0;
        var errors = refused && m.finishedWithErrors === true ? refused : 0;
        // A job started from the PC is not marked finished by the server, and a stop from the PC is
        // not marked stopped: only the machine seen at rest with every line acknowledged says the
        // program ended. In doubt nothing is announced, rather than a false end.
        var allSent = p.settled && m.jobStopped !== true;
        var done = !errors && (m.finished === true || (allSent && !refused));
        // A job cut by an alarm is not finished, whatever was acknowledged before.
        if (!next.alarm && (errors || done)) events.push({ type: 'finish', errors: errors });
      }
    }
    return { state: next, events: events };
  }

  // ---- Sound: short patterns, one per event, generated by the page ----
  var LEVELS = { off: 0, low: 0.12, medium: 0.4, high: 1 };
  // [frequency Hz, start s, duration s]
  var PATTERNS = {
    finish: { wave: 'sine', notes: [[659, 0, 0.16], [880, 0.18, 0.16], [1319, 0.36, 0.4]] },
    pause: { wave: 'triangle', notes: [[740, 0, 0.22], [740, 0.34, 0.22]] },
    alarm: { wave: 'square', notes: [[988, 0, 0.2], [622, 0.22, 0.2], [988, 0.44, 0.2], [622, 0.66, 0.2], [988, 0.88, 0.2], [622, 1.1, 0.2]] }
  };
  function createSound(AudioCtor, changed) {
    var ctx = null;
    function ready() { return !!ctx && ctx.state === 'running'; }
    // Called from a user gesture only: Chromium refuses to start audio before one.
    function arm(then) {
      if (!AudioCtor) return;
      try {
        if (!ctx) { ctx = new AudioCtor(); api.available = true; ctx.onstatechange = function () { if (changed) changed(); }; }
        if (ready()) { if (then) then(); return; }
        var p = typeof ctx.resume === 'function' ? ctx.resume() : null;
        if (p && typeof p.then === 'function') p.then(function () { if (changed) changed(); if (ready() && then) then(); }, function () { /* Still blocked: said by the status line. */ });
      } catch (_) { ctx = null; api.available = false; if (changed) changed(); }
    }
    // Never queued on a suspended context: a sound refused now must not ring at a later touch.
    function play(kind, gain, delay) {
      var pattern = PATTERNS[kind];
      if (!pattern || !ready() || !(gain > 0)) return false;
      var t0 = ctx.currentTime + 0.03 + (delay || 0);
      pattern.notes.forEach(function (n) {
        var o = ctx.createOscillator(), g = ctx.createGain(), at = t0 + n[1], end = at + n[2];
        o.type = pattern.wave; o.frequency.setValueAtTime(n[0], at);
        g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(gain, at + 0.01);
        g.gain.setValueAtTime(gain, end - 0.02); g.gain.linearRampToValueAtTime(0, end);
        o.connect(g); g.connect(ctx.destination); o.start(at); o.stop(end + 0.02);
      });
      return true;
    }
    function dispose() { var old = ctx; ctx = null; if (old) { old.onstatechange = null; if (typeof old.close === 'function') { try { var p = old.close(); if (p && p.catch) p.catch(function () { /* Already closed. */ }); } catch (_) { /* Already closed. */ } } } }
    // available: false without Web Audio, or once its constructor has failed (no touch will help).
    var api = { available: !!AudioCtor, ready: ready, arm: arm, play: play, dispose: dispose };
    return api;
  }
  root.CNCNotify = { reduce: reduce, pauseOf: pauseOf, createSound: createSound, PATTERNS: PATTERNS, LEVELS: LEVELS };

  // ---- Page part ----
  // The pure part above also loads without a page (tests).
  if (typeof document === 'undefined' || !document.body) return;
  var uiLocale = root.cncI18n || { t: function (s) { return s; } }, t = uiLocale.t;
  var simulation = document.body.getAttribute('data-simulation') === 'true';
  var perf = root.performance, clock = perf && typeof perf.now === 'function' ? function () { return perf.now(); } : Date.now;
  function el(tag, cls, id) { var n = document.createElement(tag); if (cls) n.className = cls; if (id) n.id = id; return n; }
  function text(n, v) { if (n && n.textContent !== v) n.textContent = v; }
  function prop(n, k, v) { if (n && n[k] !== v) n[k] = v; }
  function attr(n, k, v) { if (n && n.getAttribute(k) !== v) n.setAttribute(k, v); }

  // Volume: this browser only (« Cette tablette »).
  var KEY = 'cncjs-touch-notify-v1', volume = 'high';
  try { var saved = JSON.parse(localStorage.getItem(KEY) || 'null'); if (saved && typeof saved === 'object' && Object.prototype.hasOwnProperty.call(LEVELS, saved.volume)) volume = saved.volume; } catch (_) { /* Storage is optional. */ }
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ volume: volume })); } catch (_) { /* Storage is optional. */ } }
  var sound = createSound(root.AudioContext || root.webkitAudioContext, function () { paintSettings(); });

  // ---- Banner ----
  // Same shapes as the status strip: the tone is never carried by the colour alone.
  var ICONS = { finish: 'M4 12l5 5L20 6', pause: 'M8 5h3v14H8z M13 5h3v14h-3z', alarm: 'M12 3L2 21h20z M12 9v5 M12 17v1' };
  var TONES = { finish: 'ok', pause: 'warn', alarm: 'danger' };
  var banner = el('div', 'ks-notify', 'notify-banner'); banner.hidden = true; banner.setAttribute('role', 'alert');
  banner.innerHTML = '<svg class="ks-notify-icon" viewBox="0 0 24 24" aria-hidden="true"><path d=""/></svg>';
  var words = el('div', 'ks-notify-words'), title = el('strong', 'ks-notify-title', 'notify-title'), detail = el('span', 'ks-notify-detail', 'notify-detail'), hint = el('small', 'ks-notify-hint', 'notify-hint');
  var close = el('button', 'ks-secondary ks-notify-close', 'notify-close'); close.type = 'button'; close.textContent = t('Fermer');
  words.appendChild(title); words.appendChild(detail); words.appendChild(hint); banner.appendChild(words); banner.appendChild(close);
  document.body.appendChild(banner);
  var path = typeof banner.querySelector === 'function' ? banner.querySelector('path') : null;

  // What is shown: {type, kind, errors, file, laser, silent, detail}; null when the banner is closed.
  var shown = null, state = null, lastTouch = null, heldBack = false, disposed = false;
  function laserOf(m) { var p = m && m.machineProfile; return !!(p && typeof p === 'object' && p.kind === 'laser'); }
  function pauseText(kind, laser) {
    if (kind === 'M6' && !laser) return t('Changement de fraise demandé par le fichier.');
    if (kind === 'M0' || kind === 'M1' || kind === 'M6' || kind === 'other') return t('Pause demandée par le fichier.');
    if (kind === 'error') return t('Une ligne a été refusée par la machine.');
    if (kind === 'door') return t('Porte ouverte.');
    if (kind === 'hold') return t('La machine s’est mise en pause.');
    return laser ? t('Gravure en pause.') : t('Usinage en pause.');
  }
  function alarmText(m) {
    var help = root.CNCGrblHelp, lines = help && typeof help.incident === 'function' ? help.incident(m) : [];
    return lines.length ? lines.join(' ') : t('La machine s’est arrêtée.');
  }
  function paint(m) {
    if (!shown) { prop(banner, 'hidden', true); return; }
    var head, body = shown.detail || '';
    if (shown.type === 'finish') {
      head = shown.laser ? t('Gravure terminée') : t('Usinage terminé');
      body = shown.errors === 1 ? t('1 ligne refusée par la machine : vérifiez la pièce.') : shown.errors ? t('{n} lignes refusées par la machine : vérifiez la pièce.').replace('{n}', shown.errors) : shown.file;
    } else if (shown.type === 'pause') {
      head = t('Pause'); body = pauseText(shown.kind, shown.laser);
    } else {
      // The code and the facts may come one report after the state: followed while the alarm lasts.
      if (m && isAlarm(m)) {
        if (typeof m.alarmCode === 'number' && isFinite(m.alarmCode)) { shown.code = m.alarmCode; shown.inferred = !!m.alarmCodeInferred; }
        body = alarmText(m);
      }
      // A code deduced after the board restarted is never shown as received (as on the status strip).
      head = t('Alarme') + (typeof shown.code === 'number' ? ' ' + shown.code + (shown.inferred ? ' ' + t('déduite') : '') : '');
    }
    shown.detail = body;
    text(title, head); text(detail, body);
    // Touching the screen arms a blocked sound; it does nothing where there is no Web Audio.
    text(hint, shown.silent ? (sound.available ? t('Son bloqué par le navigateur : touchez l’écran une fois.') : t('Son indisponible dans ce navigateur.')) + ' ' + t('Touchez ce message pour le fermer.') : t('Touchez ce message pour le fermer.'));
    attr(banner, 'data-tone', shown.type === 'finish' && shown.errors ? 'warn' : TONES[shown.type]); attr(banner, 'data-type', shown.type);
    if (path && path.getAttribute('d') !== ICONS[shown.type]) path.setAttribute('d', ICONS[shown.type]);
    prop(banner, 'hidden', false);
  }
  function notify(event, m) {
    // An alarm banner is closed by a touch only: nothing replaces it but another alarm.
    if (shown && shown.type === 'alarm' && event.type !== 'alarm') return;
    var played = sound.play(event.type, LEVELS[volume], 0);
    shown = { type: event.type, kind: event.kind || '', errors: event.errors || 0, file: m && (m.originalName || m.name) || '', laser: laserOf(m),
      silent: volume !== 'off' && !played, detail: '', code: null, inferred: false };
    paint(m);
  }
  function dismiss() { shown = null; paint(null); }
  banner.addEventListener('click', dismiss);

  function onStatus(e) {
    var d = e && e.detail || {}; if (disposed || !!d.simulation !== simulation) return;
    var m = d.machine || null, r = reduce(state, m, clock());
    state = r.state;
    r.events.forEach(function (event) {
      if (event.type === 'alarm' || event.type === 'finish') { heldBack = false; notify(event, m); }
      else if (event.type === 'start') { heldBack = false; if (shown && shown.type === 'finish') dismiss(); }
      else if (event.type === 'pause-end') { heldBack = false; if (shown && shown.type === 'pause') dismiss(); }
      else if (event.changed) {
        // The reason of a pause known one report late: the text follows, the sound is not repeated;
        // a pause held back as the operator's own is announced once the program is its cause.
        if (shown && shown.type === 'pause') shown.kind = event.kind;
        else if (heldBack && event.kind !== 'operator') { heldBack = false; notify(event, m); }
      } else if (event.kind === 'operator' && lastTouch !== null && clock() - lastTouch >= 0 && clock() - lastTouch < 3000) {
        // Pause asked while someone has just touched this screen: the strip already says it.
        heldBack = true;
      } else notify(event, m);
    });
    if (shown) paint(m);
  }
  root.addEventListener('cnc-job-status', onStatus);

  // Chromium starts audio only after a gesture (pointerup, click or key): the first one arms the sound.
  function gesture() { lastTouch = clock(); if (volume !== 'off' && !sound.ready()) sound.arm(); }
  ['pointerup', 'click', 'keydown'].forEach(function (name) { document.addEventListener(name, gesture, true); });

  // ---- Réglages → Affichage: volume and « Essayer le son » ----
  var settings = document.getElementById('screen-settings'), choices = [], status = null, test = null;
  var NAMES = [['off', 'Coupé'], ['low', 'Faible'], ['medium', 'Moyen'], ['high', 'Fort']];
  function paintSettings() {
    if (!status) return;
    choices.forEach(function (b) { attr(b, 'aria-pressed', String(b.getAttribute('data-notify-volume') === volume)); });
    prop(test, 'disabled', volume === 'off' || !sound.available);
    text(status, !sound.available ? t('Son indisponible dans ce navigateur.') : volume === 'off' ? t('Son coupé : seul le message s’affiche.') :
      sound.ready() ? t('Son prêt.') : t('Son en attente : touchez l’écran une fois après l’ouverture de la page.'));
  }
  if (settings && typeof settings.insertBefore === 'function') {
    var card = el('div', 'card ks-display-card ks-notify-card', 'ks-notify-card');
    var h = el('h2'); h.textContent = t('Son des notifications') + ' ';
    var scope = el('span', 'ks-scope'); scope.setAttribute('data-scope', 'tablet'); scope.textContent = t('Cette tablette'); h.appendChild(scope);
    var help = el('p'); help.textContent = t('Un son court à la fin de l’usinage, à chaque pause et à chaque alarme. Le message à l’écran reste toujours affiché.');
    var controls = el('div', 'ks-notify-controls'), group = el('div', 'ks-notify-choices'); group.setAttribute('role', 'group'); group.setAttribute('aria-label', t('Son des notifications'));
    NAMES.forEach(function (pair) {
      var b = el('button'); b.type = 'button'; b.setAttribute('data-notify-volume', pair[0]); b.setAttribute('aria-pressed', 'false'); b.textContent = t(pair[1]);
      b.addEventListener('click', function () { volume = pair[0]; save(); if (volume !== 'off') sound.arm(); paintSettings(); });
      choices.push(b); group.appendChild(b);
    });
    test = el('button', 'ks-secondary', 'notify-test'); test.type = 'button'; test.textContent = t('Essayer le son');
    // The three sounds in turn: end, pause, alarm. The tap is the gesture that arms the sound.
    test.addEventListener('click', function () {
      sound.arm(function () {
        sound.play('finish', LEVELS[volume], 0); sound.play('pause', LEVELS[volume], 1.2); sound.play('alarm', LEVELS[volume], 2.2);
        paintSettings(); text(status, t('Trois sons : fin, pause, puis alarme.'));
      });
      paintSettings();
    });
    status = el('p', '', 'notify-status'); status.setAttribute('role', 'status');
    controls.appendChild(group); controls.appendChild(test);
    card.appendChild(h); card.appendChild(help); card.appendChild(controls); card.appendChild(status);
    // On the Affichage tab, above the footer of display-settings.js.
    var footer = typeof settings.querySelector === 'function' ? settings.querySelector('.ks-display-footer') : null;
    settings.insertBefore(card, footer && footer.parentNode === settings ? footer : null);
    paintSettings();
  }

  function leave(e) {
    if (e && e.persisted) return;
    disposed = true; root.removeEventListener('cnc-job-status', onStatus); root.removeEventListener('pagehide', leave);
    ['pointerup', 'click', 'keydown'].forEach(function (name) { document.removeEventListener(name, gesture, true); });
    sound.dispose();
  }
  root.addEventListener('pagehide', leave);
  root.cncNotify = { shown: function () { return shown ? { type: shown.type, kind: shown.kind, errors: shown.errors, silent: shown.silent } : null; },
    volume: function () { return volume; }, dismiss: dismiss };
})(typeof window === 'undefined' ? globalThis : window);
