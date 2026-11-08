/* Réglages → Système → Wi-Fi: the network of the computer that runs CNCjs (the tablet itself in the
 * kiosk), through GET/POST api/touch-wifi (NetworkManager on the server). Shows the current network,
 * scans on request, and joins a network: a known one with one tap, a new one with its password,
 * a hidden one by its name; a saved network not in use can be forgotten. The kiosk has no keyboard:
 * an on-screen keyboard types into the field chosen with a tap (a physical keyboard still works).
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
  // This device's identity (job-controls.js, F5): the server compares it with who pilots the machine,
  // so the tablet that pilots may change its own network.
  function named(body) {
    var c = window.cncJobControls, id = c && typeof c.clientId === 'function' ? c.clientId() : '';
    if (!body || !id) return body;
    var copy = {}; Object.keys(body).forEach(function (k) { copy[k] = body[k]; });
    copy.clientId = id; copy.clientLabel = typeof c.clientLabel === 'function' ? c.clientLabel() : '';
    return copy;
  }
  function request(method, body, timeout, done) {
    var c = token(); if (!c) { done(401, { message: t('Session CNCjs requise.') }); return; }
    body = named(body);
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
  var tools = el('div', 'ks-wifi-tools');
  var scanButton = el('button', 'ks-secondary ks-wifi-scan', t('Rechercher les réseaux')); scanButton.type = 'button'; tools.appendChild(scanButton);
  var hiddenButton = el('button', 'ks-secondary ks-wifi-hidden', t('Réseau masqué…')); hiddenButton.type = 'button'; tools.appendChild(hiddenButton);
  box.appendChild(tools);
  var list = el('div', 'ks-wifi-list'); list.setAttribute('role', 'list'); box.appendChild(list);
  var form = el('div', 'ks-wifi-form'); form.hidden = true;
  var formTitle = el('p', 'ks-wifi-form-title', '');
  var ssidLabel = el('label', 'ks-wifi-label', t('Nom du réseau (SSID)')); ssidLabel.setAttribute('for', 'wifi-ssid');
  var ssidInput = el('input', ''); ssidInput.id = 'wifi-ssid'; ssidInput.type = 'text'; ssidInput.autocomplete = 'off'; ssidInput.setAttribute('autocapitalize', 'off'); ssidInput.setAttribute('spellcheck', 'false'); ssidInput.maxLength = 32;
  var label = el('label', 'ks-wifi-label', t('Mot de passe du réseau')); label.setAttribute('for', 'wifi-password');
  var password = el('input', ''); password.id = 'wifi-password'; password.type = 'password'; password.autocomplete = 'off'; password.setAttribute('autocapitalize', 'off'); password.setAttribute('spellcheck', 'false'); password.maxLength = 64;
  var show = el('button', 'ks-secondary', t('Afficher')); show.type = 'button';
  var row = el('div', 'ks-wifi-password'); row.appendChild(password); row.appendChild(show);
  var keyboard = el('div', 'ks-wifi-keys'); keyboard.setAttribute('role', 'group'); keyboard.setAttribute('aria-label', t('Clavier à l’écran'));
  var actions = el('div', 'ks-wifi-actions');
  var forget = el('button', 'ks-secondary ks-wifi-forget', t('Oublier ce réseau')); forget.type = 'button';
  var cancel = el('button', 'ks-secondary', t('Annuler')); cancel.type = 'button';
  var join = el('button', 't-btn t-btn--primary', t('Se connecter')); join.type = 'button';
  actions.appendChild(forget); actions.appendChild(cancel); actions.appendChild(join);
  [formTitle, ssidLabel, ssidInput, label, row, keyboard, actions].forEach(function (n) { form.appendChild(n); }); box.appendChild(form);
  var status = el('p', 'ks-system-note', ''); status.setAttribute('role', 'status'); box.appendChild(status);
  box.appendChild(el('p', 'ks-system-note', t('Réseau de l’ordinateur du serveur CNCjs (cette tablette en mode kiosque). Changer de réseau coupe la liaison quelques secondes : refusé pendant un travail. Le mot de passe est enregistré par le système, pas par cette page.')));
  // First block of Système, under the host status line (stale data, session); test fixtures: before the last child.
  var anchor = (section.querySelector && section.querySelector('.ks-system-grid')) || section.lastChild; section.insertBefore(box, anchor || null);

  // ---- On-screen keyboard: AZERTY letters, then digits and symbols ----
  var LETTERS = ['azertyuiop', 'qsdfghjklm', 'wxcvbn'], SYMBOLS = ['1234567890', '@#$%&*-_+=', '!?.,;:\'"/\\', '()[]{}<>~|^`'];
  var layer = 'letters', upper = false, target = password;
  function aim(input) { target = input; [ssidInput, password].forEach(function (i) { i.className = i === target ? 'is-target' : ''; }); }
  function type(ch) { if (!(target.maxLength > 0 && target.value.length >= target.maxLength)) target.value += ch; }
  function key(text, action, cls, name) {
    var b = el('button', 'ks-wifi-key' + (cls ? ' ' + cls : ''), text); b.type = 'button';
    if (name) b.setAttribute('aria-label', name);
    b.addEventListener('click', function () { if (!b.disabled) action(); });
    return b;
  }
  function backspace() { target.value = target.value.slice(0, -1); }
  function drawKeys() {
    keyboard.textContent = '';
    var letters = layer === 'letters';
    (letters ? LETTERS : SYMBOLS).forEach(function (chars, i) {
      var r = el('div', 'ks-wifi-keyrow');
      if (letters && i === 2) { var shift = key(t('Maj'), function () { upper = !upper; drawKeys(); }, 'ks-wifi-key--wide', t('Majuscules')); shift.setAttribute('aria-pressed', String(upper)); r.appendChild(shift); }
      chars.split('').forEach(function (c) { var ch = letters && upper ? c.toUpperCase() : c; r.appendChild(key(ch, function () { type(ch); })); });
      if (letters && i === 2) r.appendChild(key('⌫', backspace, 'ks-wifi-key--wide', t('Effacer le dernier caractère')));
      keyboard.appendChild(r);
    });
    var last = el('div', 'ks-wifi-keyrow');
    last.appendChild(key(letters ? '?123' : 'ABC', function () { layer = letters ? 'symbols' : 'letters'; drawKeys(); }, 'ks-wifi-key--wide', letters ? t('Chiffres et symboles') : t('Lettres')));
    last.appendChild(key(t('Espace'), function () { type(' '); }, 'ks-wifi-key--space'));
    if (!letters) last.appendChild(key('⌫', backspace, 'ks-wifi-key--wide', t('Effacer le dernier caractère')));
    keyboard.appendChild(last);
    disable();
  }
  [ssidInput, password].forEach(function (input) {
    input.setAttribute('inputmode', 'none'); // the on-screen keyboard replaces the system one
    input.addEventListener('focus', function () { aim(input); });
    input.addEventListener('click', function () { aim(input); });
  });
  drawKeys();

  var busy = false, chosen = null, loaded = false, networks = [];
  function disable() {
    var blocked = busy || jobActive();
    scanButton.disabled = blocked; hiddenButton.disabled = blocked; join.disabled = blocked; forget.disabled = blocked;
    Array.prototype.forEach.call(list.querySelectorAll('button'), function (b) { b.disabled = blocked; });
    Array.prototype.forEach.call(keyboard.querySelectorAll('button'), function (b) { b.disabled = blocked; });
    if (jobActive() && !busy) set(status, t('Travail en cours : réseau Wi-Fi non modifiable.'));
  }
  // 401, or CNCjs' plain-text 403 (« Forbidden Access »): the session is refused, not the action.
  function message(code, data, fallback) { return data && data.message ? data.message : code === 0 ? t('Serveur CNCjs injoignable.') : code === 401 || (code === 403 && !data) ? t('Session CNCjs requise : ouvrez CNCjs et connectez-vous.') : fallback; }
  function showCurrent(data) {
    if (!data || data.available === false) { set(current, data && data.reason ? data.reason : t('Wi-Fi indisponible.')); return; }
    set(current, data.ssid ? t('Connecté à « ') + data.ssid + t(' »') + (data.signal !== null && data.signal !== undefined ? ' · ' + data.signal + ' %' : '') : t('Aucun réseau Wi-Fi connecté.'));
  }
  function load() {
    request('GET', undefined, 10000, function (code, data) {
      loaded = true;
      if (code === 200) showCurrent(data); else set(current, message(code, data, t('Wi-Fi indisponible.')));
    });
  }
  function closeForm() { form.hidden = true; chosen = null; password.value = ''; ssidInput.value = ''; password.type = 'password'; set(show, t('Afficher')); }
  function openForm(net) {
    chosen = net; password.value = ''; ssidInput.value = ''; password.type = 'password'; set(show, t('Afficher'));
    ssidLabel.hidden = ssidInput.hidden = !net.hidden;
    label.hidden = row.hidden = !net.hidden && !net.secure && !net.saved;
    keyboard.hidden = row.hidden && ssidInput.hidden;
    forget.hidden = !(net.saved && !net.inUse);
    layer = 'letters'; upper = false; drawKeys();
    aim(net.hidden ? ssidInput : password);
    form.hidden = false; disable();
  }
  function choose(net) {
    set(formTitle, t('Réseau « ') + net.ssid + t(' »') + (net.saved ? t(' · enregistré : laissez vide pour utiliser le mot de passe connu') : net.secure ? '' : t(' · réseau ouvert, sans mot de passe')));
    openForm(net);
  }
  hiddenButton.addEventListener('click', function () {
    if (busy || jobActive()) return;
    set(formTitle, t('Réseau masqué : son nom exact, puis son mot de passe (vide pour un réseau ouvert).'));
    openForm({ ssid: '', hidden: true, secure: true, saved: false, inUse: false });
  });
  function render(next) {
    networks = next;
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
    var secret = password.value, hidden = !!chosen.hidden, ssid = hidden ? ssidInput.value : chosen.ssid;
    if (hidden && !ssid.trim()) { set(status, t('Nom du réseau requis.')); return; }
    // 32 bytes at most, as the server counts (an accented letter takes two).
    if (hidden && unescape(encodeURIComponent(ssid)).length > 32) { set(status, t('Nom du réseau trop long : 32 octets au plus.')); return; }
    if ((hidden ? secret.length > 0 : chosen.secure && !chosen.saved) && secret.length < 8) { set(status, t('Mot de passe trop court : 8 caractères au moins.')); return; }
    busy = true; disable(); set(status, t('Connexion à « ') + ssid + t(' »… la liaison peut se couper quelques secondes.'));
    // The password leaves the field at once; it is sent once and not kept.
    password.value = '';
    var body = { action: 'connect', ssid: ssid, password: secret }; if (hidden) body.hidden = true;
    request('POST', body, 60000, function (code, data) {
      secret = '';
      busy = false;
      if (code === 200) { set(status, message(code, data, t('Connecté.'))); closeForm(); setTimeout(load, 1500); }
      else set(status, message(code, data, t('Connexion impossible. Si la liaison a changé, rechargez la page.')));
      disable();
    });
  });
  forget.addEventListener('click', function () {
    if (!chosen || !chosen.saved || chosen.inUse || busy || jobActive()) return;
    var ssid = chosen.ssid;
    busy = true; disable(); set(status, t('Oubli du réseau « ') + ssid + t(' »…'));
    request('POST', { action: 'forget', ssid: ssid }, 15000, function (code, data) {
      busy = false;
      if (code === 200) {
        set(status, message(code, data, t('Réseau oublié.'))); closeForm();
        render(networks.map(function (n) { if (n.ssid !== ssid) return n; var c = {}; Object.keys(n).forEach(function (k) { c[k] = n[k]; }); c.saved = false; return c; }));
      } else set(status, message(code, data, t('Impossible d’oublier ce réseau.')));
      disable();
    });
  });
  window.addEventListener('cnc-settings-tab', function (e) { if (e && e.detail === 'system') load(); });
  window.addEventListener('cnc-job-status', disable);
  if (shown() && !loaded) load();
  window.cncWifiSettings = { load: load, state: function () { return { busy: busy, chosen: chosen ? (chosen.hidden ? '(masqué)' : chosen.ssid) : null, formOpen: !form.hidden, keyboard: !keyboard.hidden && !form.hidden, layer: layer, upper: upper, target: target === ssidInput ? 'ssid' : 'password' }; } };
})();
