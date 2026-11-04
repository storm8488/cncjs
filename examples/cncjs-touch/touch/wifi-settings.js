/* Réglages → Système → Wi-Fi: the network of the computer that runs CNCjs (the tablet itself in the
 * kiosk), through GET/POST api/touch-wifi (NetworkManager on the server). Shows the current network,
 * scans on request, and joins a network: a known one with one tap, a new one with its password.
 * The server refuses a scan or a change during a job, a pause, a move, a homing, a probe or a load,
 * and while another device pilots; machine actions wait while it runs. The password is sent once to
 * the server and never kept in this page. Nothing here reaches the controller. */
(function () {
  'use strict';
  var uiLocale = window.cncI18n || { t: function (s) { return s; } }, t = uiLocale.t;
  var section = document.getElementById('ks-system'), panel = document.getElementById('screen-settings');
  if (!section || !panel) return;

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
  function set(n, value) { if (n.textContent !== value) n.textContent = value; }
  function token() { try { return JSON.parse(localStorage.getItem('cnc')).state.session.token || ''; } catch (_) { return ''; } }
  function apiBase() { try { return window.cncState.get().apiBase; } catch (_) { return '/api'; } }
  function machine() { try { return window.cncState.get().machine; } catch (_) { return null; } }
  function jobActive() { var m = machine(); return !!(m && m.workflow && m.workflow !== 'idle'); }
  function shown() { return !document.hidden && panel.classList.contains('active') && panel.getAttribute('data-settings-tab') === 'system'; }
  function request(method, body, timeout, done) {
    var c = token(); if (!c) { done(401, { message: t('Session CNCjs requise.') }); return; }
    var x = new XMLHttpRequest(); x.open(method, apiBase() + '/touch-wifi', true); x.timeout = timeout;
    x.setRequestHeader('Authorization', 'Bearer ' + c);
    if (body !== undefined) x.setRequestHeader('Content-Type', 'application/json');
    x.onload = function () { var data = null; try { data = JSON.parse(x.responseText); } catch (_) {} done(x.status, data); };
    x.onerror = x.ontimeout = function () { done(0, null); };
    x.send(body === undefined ? null : JSON.stringify(body));
  }

  var box = el('div', 'ks-system-block ks-wifi');
  var head = el('div', 'ks-system-row'); head.appendChild(el('h3', '', t('Wi-Fi'))); box.appendChild(head);
  var current = el('p', 'ks-wifi-current', '—'); box.appendChild(current);
  var scanButton = el('button', 'ks-secondary ks-wifi-scan', t('Rechercher les réseaux')); scanButton.type = 'button'; box.appendChild(scanButton);
  var list = el('div', 'ks-wifi-list'); list.setAttribute('role', 'list'); box.appendChild(list);
  var form = el('div', 'ks-wifi-form'); form.hidden = true;
  var formTitle = el('p', 'ks-wifi-form-title', '');
  var label = el('label', 'ks-wifi-label', t('Mot de passe du réseau')); label.setAttribute('for', 'wifi-password');
  var password = el('input', ''); password.id = 'wifi-password'; password.type = 'password'; password.autocomplete = 'off'; password.setAttribute('autocapitalize', 'off'); password.setAttribute('spellcheck', 'false'); password.maxLength = 64;
  var show = el('button', 'ks-secondary', t('Afficher')); show.type = 'button';
  var row = el('div', 'ks-wifi-password'); row.appendChild(password); row.appendChild(show);
  var actions = el('div', 'ks-wifi-actions');
  var cancel = el('button', 'ks-secondary', t('Annuler')); cancel.type = 'button';
  var join = el('button', 't-btn t-btn--primary', t('Se connecter')); join.type = 'button';
  actions.appendChild(cancel); actions.appendChild(join);
  form.appendChild(formTitle); form.appendChild(label); form.appendChild(row); form.appendChild(actions); box.appendChild(form);
  var status = el('p', 'ks-system-note', ''); status.setAttribute('role', 'status'); box.appendChild(status);
  box.appendChild(el('p', 'ks-system-note', t('Réseau de l’ordinateur du serveur CNCjs (cette tablette en mode kiosque). Changer de réseau coupe la liaison quelques secondes : refusé pendant un travail. Le mot de passe est enregistré par le système, pas par cette page.')));
  var foot = section.lastChild; section.insertBefore(box, foot || null);

  var busy = false, chosen = null, loaded = false;
  function disable() {
    var blocked = busy || jobActive();
    scanButton.disabled = blocked; join.disabled = blocked;
    Array.prototype.forEach.call(list.querySelectorAll('button'), function (b) { b.disabled = blocked; });
    if (jobActive() && !busy) set(status, t('Travail en cours : réseau Wi-Fi non modifiable.'));
  }
  function message(code, data, fallback) { return data && data.message ? data.message : code === 0 ? t('Serveur CNCjs injoignable.') : fallback; }
  function showCurrent(data) {
    if (!data || data.available === false) { set(current, data && data.reason ? data.reason : t('Wi-Fi indisponible.')); return; }
    set(current, data.ssid ? t('Connecté à « ') + data.ssid + ' »' + (data.signal !== null && data.signal !== undefined ? ' · ' + data.signal + ' %' : '') : t('Aucun réseau Wi-Fi connecté.'));
  }
  function load() {
    request('GET', undefined, 10000, function (code, data) {
      loaded = true;
      if (code === 200) showCurrent(data); else set(current, message(code, data, t('Wi-Fi indisponible.')));
    });
  }
  function closeForm() { form.hidden = true; chosen = null; password.value = ''; password.type = 'password'; set(show, t('Afficher')); }
  function choose(net) {
    chosen = net; password.value = ''; password.type = 'password'; set(show, t('Afficher'));
    set(formTitle, t('Réseau « ') + net.ssid + ' »' + (net.saved ? t(' · enregistré : laissez vide pour utiliser le mot de passe connu') : net.secure ? '' : t(' · réseau ouvert, sans mot de passe')));
    label.hidden = row.hidden = !net.secure && !net.saved;
    form.hidden = false;
    if (!row.hidden && password.focus) password.focus();
  }
  function render(networks) {
    list.textContent = '';
    if (!networks.length) { list.appendChild(el('p', 'ks-system-note', t('Aucun réseau trouvé.'))); return; }
    networks.forEach(function (net) {
      var b = el('button', 'ks-wifi-network' + (net.inUse ? ' is-current' : '')); b.type = 'button'; b.setAttribute('role', 'listitem');
      b.appendChild(el('span', 'ks-wifi-ssid', net.ssid));
      b.appendChild(el('span', 'ks-wifi-meta', net.signal + ' %' + (net.secure ? t(' · protégé') : t(' · ouvert')) + (net.inUse ? t(' · connecté') : net.saved ? t(' · enregistré') : '')));
      b.addEventListener('click', function () { if (!b.disabled) choose(net); });
      list.appendChild(b);
    });
    disable();
  }
  scanButton.addEventListener('click', function () {
    if (busy || jobActive()) return;
    busy = true; closeForm(); disable(); set(status, t('Recherche des réseaux…'));
    request('POST', { action: 'scan' }, 30000, function (code, data) {
      busy = false;
      if (code === 200 && data && Array.isArray(data.networks)) { set(status, ''); render(data.networks); } else set(status, message(code, data, t('Recherche impossible.')));
      disable();
    });
  });
  show.addEventListener('click', function () { var hidden = password.type === 'password'; password.type = hidden ? 'text' : 'password'; set(show, hidden ? t('Masquer') : t('Afficher')); });
  cancel.addEventListener('click', function () { closeForm(); set(status, t('Aucun changement.')); });
  join.addEventListener('click', function () {
    if (!chosen || busy || jobActive()) return;
    var secret = password.value, ssid = chosen.ssid;
    if (chosen.secure && !chosen.saved && secret.length < 8) { set(status, t('Mot de passe trop court : 8 caractères au moins.')); return; }
    busy = true; disable(); set(status, t('Connexion à « ') + ssid + t(' »… la liaison peut se couper quelques secondes.'));
    // The password leaves the field at once; it is sent once and not kept.
    password.value = '';
    request('POST', { action: 'connect', ssid: ssid, password: secret }, 60000, function (code, data) {
      secret = '';
      busy = false;
      if (code === 200) { set(status, message(code, data, t('Connecté.'))); closeForm(); setTimeout(load, 1500); }
      else set(status, message(code, data, t('Connexion impossible. Si la liaison a changé, rechargez la page.')));
      disable();
    });
  });
  window.addEventListener('cnc-settings-tab', function (e) { if (e && e.detail === 'system') load(); });
  window.addEventListener('cnc-job-status', disable);
  if (shown() && !loaded) load();
  window.cncWifiSettings = { load: load, state: function () { return { busy: busy, chosen: chosen ? chosen.ssid : null, formOpen: !form.hidden }; } };
})();
