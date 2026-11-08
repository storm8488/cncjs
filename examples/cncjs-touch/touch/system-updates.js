/* Réglages → Système → Mises à jour du système: Debian updates of the computer that runs CNCjs
 * (the tablet itself in the kiosk), through GET/POST api/touch-updates (apt on the server, in the
 * background). « Rechercher » lists what an update would install; « Installer » asks a second tap
 * to confirm, then refreshes and upgrades. The page follows the task until it ends and says when a
 * restart of the tablet is needed (done with « Redémarrer la tablette », Tablette block). The server
 * refuses during a job, a pause, a move, a homing, a probe or a load, and while another device
 * pilots; machine actions wait while it runs. Nothing here reaches the controller. */
(function () {
  'use strict';
  var uiLocale = window.cncI18n || { t: function (s) { return s; } }, t = uiLocale.t;
  var section = document.getElementById('ks-system'), panel = document.getElementById('screen-settings');
  if (!section || !panel) return;
  var CONFIRM_MS = 8000, POLL_MS = 3000, SHOWN_PACKAGES = 12;

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
  function set(n, value) { if (n.textContent !== value) n.textContent = value; }
  function token() { try { return JSON.parse(localStorage.getItem('cnc')).state.session.token || ''; } catch (_) { return ''; } }
  function apiBase() { try { return window.cncState.get().apiBase; } catch (_) { return '/api'; } }
  function machine() { try { return window.cncState.get().machine; } catch (_) { return null; } }
  function jobActive() { var m = machine(); return !!(m && m.workflow && m.workflow !== 'idle'); }
  function shown() { return !document.hidden && panel.classList.contains('active') && panel.getAttribute('data-settings-tab') === 'system'; }
  // This device's identity (job-controls.js, F5): the tablet that pilots may update its own computer.
  function named(body) {
    var c = window.cncJobControls, id = c && typeof c.clientId === 'function' ? c.clientId() : '';
    if (!body || !id) return body;
    return { action: body.action, clientId: id, clientLabel: typeof c.clientLabel === 'function' ? c.clientLabel() : '' };
  }
  function request(method, body, done) {
    var c = token(); if (!c) { done(401, { message: t('Session CNCjs requise.') }); return; }
    body = named(body);
    var x = new XMLHttpRequest(); x.open(method, apiBase() + '/touch-updates', true); x.timeout = 10000;
    x.setRequestHeader('Authorization', 'Bearer ' + c);
    if (body !== undefined) x.setRequestHeader('Content-Type', 'application/json');
    x.onload = function () { var data = null; try { data = JSON.parse(x.responseText); } catch (_) {} done(x.status, data); };
    x.onerror = x.ontimeout = function () { done(0, null); };
    x.send(body === undefined ? null : JSON.stringify(body));
  }

  var box = el('div', 'ks-system-block ks-updates');
  var head = el('div', 'ks-system-row'); head.appendChild(el('h3', '', t('Mises à jour du système'))); box.appendChild(head);
  var summary = el('p', 'ks-updates-summary', '—'); box.appendChild(summary);
  var names = el('p', 'ks-system-note ks-updates-list', ''); names.hidden = true; box.appendChild(names);
  var reboot = el('p', 'ks-updates-reboot', t('Redémarrage nécessaire pour finir la mise à jour : utilisez la commande de redémarrage du bloc Tablette, hors travail.')); reboot.hidden = true; box.appendChild(reboot);
  var tools = el('div', 'ks-wifi-tools');
  var checkButton = el('button', 'ks-secondary ks-updates-check', t('Rechercher les mises à jour')); checkButton.type = 'button'; tools.appendChild(checkButton);
  var installButton = el('button', 't-btn t-btn--primary ks-updates-install', t('Installer les mises à jour')); installButton.type = 'button'; tools.appendChild(installButton);
  box.appendChild(tools);
  var status = el('p', 'ks-system-note', ''); status.setAttribute('role', 'status'); box.appendChild(status);
  box.appendChild(el('p', 'ks-system-note', t('Mises à jour Debian de l’ordinateur du serveur CNCjs (cette tablette en mode kiosque), sans changement de version. Refusé pendant un travail ; la machine reste bloquée pendant l’installation, qui peut durer plusieurs minutes : n’éteignez pas la tablette.')));
  var foot = section.lastChild; section.insertBefore(box, foot || null);

  var busy = false, info = null, notice = '', armed = false, armTimer = null, pollTimer = null, loaded = false;
  function running() { return !!(info && info.running); }
  // 401, or CNCjs' plain-text 403 (« Forbidden Access »): the session is refused, not the action.
  function message(code, data, fallback) { return data && data.message ? data.message : code === 0 ? t('Serveur CNCjs injoignable.') : code === 401 || (code === 403 && !data) ? t('Session CNCjs requise : ouvrez CNCjs et connectez-vous.') : fallback; }
  function clock(ms) { try { return new Date(ms).toLocaleTimeString(uiLocale.locale || undefined, { hour: '2-digit', minute: '2-digit' }); } catch (_) { return ''; } }
  function disarm() { clearTimeout(armTimer); armTimer = null; armed = false; paint(); }
  function paint() {
    var blocked = busy || running() || jobActive() || !info || info.available === false;
    checkButton.disabled = blocked; installButton.disabled = blocked;
    set(installButton, armed ? t('Confirmer : installer les mises à jour') : t('Installer les mises à jour'));
    installButton.setAttribute('data-state', armed ? 'armed' : 'idle');
    if (!info) return;
    if (info.available === false) { set(summary, info.reason || t('Mises à jour indisponibles.')); names.hidden = true; reboot.hidden = true; return; }
    var list = Array.isArray(info.packages) ? info.packages : [];
    if (info.running) set(summary, info.running.action === 'install' ? t('Installation des mises à jour en cours… n’éteignez pas la tablette.') : t('Recherche des mises à jour en cours…'));
    else if (!info.checkedAt) set(summary, t('Pas encore vérifié depuis le démarrage de CNCjs.'));
    else if (!list.length) set(summary, t('Système à jour') + ' (' + t('vérifié à ') + clock(info.checkedAt) + ').');
    else {
      var security = list.filter(function (p) { return p.security; }).length;
      set(summary, list.length + t(' mise(s) à jour disponible(s)') + (security ? ', ' + t('dont ') + security + t(' de sécurité') : '') + ' (' + t('vérifié à ') + clock(info.checkedAt) + ').');
    }
    names.hidden = info.running || !list.length;
    set(names, list.slice(0, SHOWN_PACKAGES).map(function (p) { return p.name; }).join(', ') + (list.length > SHOWN_PACKAGES ? ' … +' + (list.length - SHOWN_PACKAGES) : ''));
    reboot.hidden = !info.rebootRequired;
    if (jobActive() && !busy && !info.running) set(status, t('Travail en cours : mise à jour impossible.'));
    else if (armed) set(status, t('Touchez à nouveau pour confirmer (8 s).'));
    else if (notice) set(status, notice);
    else if (info.running) set(status, '');
    else if (info.lastRun) set(status, (info.lastRun.ok ? '' : t('Échec : ')) + info.lastRun.message);
  }
  function schedule() {
    clearTimeout(pollTimer); pollTimer = null;
    if (running() && shown()) pollTimer = setTimeout(load, POLL_MS);
  }
  function load() {
    request('GET', undefined, function (code, data) {
      loaded = true; notice = '';
      if (code === 200 && data) info = data; else if (!info) set(summary, message(code, data, t('Mises à jour indisponibles.')));
      if (code !== 200 && info && !info.running) notice = message(code, data, t('État des mises à jour illisible.'));
      paint(); schedule();
    });
  }
  function start(action) {
    busy = true; notice = ''; paint();
    set(status, action === 'install' ? t('Lancement de l’installation…') : t('Lancement de la recherche…'));
    request('POST', { action: action }, function (code, data) {
      busy = false;
      if (code === 200 && data) { info = data; set(status, ''); } else notice = message(code, data, t('Mise à jour impossible.'));
      paint(); schedule();
    });
  }
  checkButton.addEventListener('click', function () { if (checkButton.disabled) return; disarm(); start('check'); });
  installButton.addEventListener('click', function () {
    if (installButton.disabled) return;
    if (!armed) { armed = true; clearTimeout(armTimer); armTimer = setTimeout(disarm, CONFIRM_MS); paint(); return; }
    clearTimeout(armTimer); armTimer = null; armed = false; start('install');
  });
  window.addEventListener('cnc-settings-tab', function (e) { if (e && e.detail === 'system') load(); else { clearTimeout(pollTimer); pollTimer = null; if (armed) disarm(); } });
  window.addEventListener('cnc-job-status', function () { if (jobActive()) disarm(); else paint(); });
  document.addEventListener('visibilitychange', function () { if (shown() && running()) load(); });
  if (shown() && !loaded) load();
  window.cncSystemUpdates = { load: load, state: function () { return { busy: busy, armed: armed, running: running(), info: info }; } };
})();
