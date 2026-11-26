/* Plus → Réglages → Machine et performances → « Sauvegarde des réglages de la carte » (lot N8).
 * The CNCjs server keeps dated copies of the board's settings, as it last read them, in a folder of
 * its own (GET/POST api/touch-settings-backups). This card saves one, lists them, compares one with
 * the board and exports its file. When the board differs from the last backup, one discreet line says
 * so here and on 1 · Machine.
 * Read-only for the machine: there is NO restoration (writing a setting into the board needs the
 * operator at the machine) and no new machine command. « Relire » is the existing guarded action
 * (cncJobControls.readSettings), refused by the server during a job as before. */
(function () {
  'use strict';
  var uiLocale = window.cncI18n || { t: function (s) { return s; }, locale: 'fr-FR' }, t = uiLocale.t;
  var panel = document.getElementById('screen-settings');
  if (!panel) return;
  var SHOWN = 5, SHOWN_CHANGES = 60;
  // What a setting is, in workshop words; an unknown number keeps its name alone.
  var LABELS = { 0: 'Durée de l’impulsion de pas', 1: 'Délai de maintien des moteurs', 2: 'Inversion des signaux de pas', 3: 'Inversion du sens des axes',
    4: 'Inversion de l’activation des moteurs', 5: 'Inversion des fins de course', 6: 'Inversion de la sonde', 10: 'Contenu des rapports d’état',
    11: 'Écart de jonction', 12: 'Tolérance des arcs', 13: 'Rapports en pouces', 20: 'Limites logicielles', 21: 'Fins de course actifs',
    22: 'Prise d’origine activée', 23: 'Sens de la prise d’origine', 24: 'Vitesse lente de la prise d’origine', 25: 'Vitesse de recherche de l’origine',
    26: 'Antirebond des fins de course', 27: 'Dégagement après la prise d’origine', 30: 'Vitesse maximale de la broche', 31: 'Vitesse minimale de la broche', 32: 'Mode laser' };
  var AXIS_LABELS = { 10: 'Pas par millimètre', 11: 'Vitesse maximale', 12: 'Accélération', 13: 'Course de l’axe' }, AXES = ['X', 'Y', 'Z', 'A', 'B', 'C'];
  function label(name) {
    var n = Number(String(name).slice(1));
    if (LABELS[n]) return t(LABELS[n]);
    var group = Math.floor(n / 10), axis = n % 10;
    return AXIS_LABELS[group] && axis < AXES.length ? t(AXIS_LABELS[group]) + ' · ' + AXES[axis] : '';
  }

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
  function set(n, value) { if (n.textContent !== value) n.textContent = value; }
  function show(n, on) { if (n.hidden !== !on) n.hidden = !on; }
  function token() { try { return JSON.parse(localStorage.getItem('cnc')).state.session.token || ''; } catch (_) { return ''; } }
  function apiBase() { try { return window.cncState.get().apiBase; } catch (_) { return '/api'; } }
  function machine() { try { return window.cncState.get().machine; } catch (_) { return null; } }
  function reading(m) { return !!(m && m.refusals && m.refusals.readSettings && m.refusals.readSettings.code === 'ETOUCH_SETTINGS_READING'); }
  function settingsRead(m) { return !!(m && m.settingsCount > 0); }
  // « Relire » here is allowed exactly when « Relire » of 1 · Machine is: seance.js answers for both.
  function rereadAllowed() {
    var seance = window.cncSeance && window.cncSeance.state(), rows = seance && seance.lignes || [];
    var line = rows.filter(function (r) { return r.id === 'reglages'; })[0];
    return !!(line && line.boutons.some(function (b) { return b.id === 'relire' && b.actif === true; }));
  }
  function shown() { return !document.hidden && panel.classList.contains('active') && panel.getAttribute('data-settings-tab') === 'machine'; }
  function when(at) {
    try { return new Date(at).toLocaleString(uiLocale.locale || undefined, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (_) { return String(at); }
  }
  function count(n) { return n === 1 ? t('1 réglage') : t('{n} réglages').replace('{n}', n); }
  function request(method, body, done) {
    var c = token(); if (!c) { done(401, null); return; }
    var x = new XMLHttpRequest(), m = machine(), port = m && typeof m.port === 'string' ? m.port : '';
    // The port travels in the JSON body of a POST; a GET names it to learn what changed on that board.
    x.open(method, apiBase() + '/touch-settings-backups' + (method === 'GET' && port ? '?port=' + encodeURIComponent(port) : ''), true); x.timeout = 10000;
    x.setRequestHeader('Authorization', 'Bearer ' + c);
    if (body !== undefined) { body.port = port; x.setRequestHeader('Content-Type', 'application/json'); }
    x.onload = function () { var data = null; try { data = JSON.parse(x.responseText); } catch (_) { /* An invalid response keeps the fallback text. */ } done(x.status, data); };
    x.onerror = x.ontimeout = function () { done(0, null); };
    x.send(body === undefined ? null : JSON.stringify(body));
  }
  // The server's refusals, in the operator's language (their French message is never shown raw).
  function message(code, data, fallback) {
    var known = data && data.code;
    if (code === 0) return t('Serveur CNCjs injoignable.');
    if (code === 401 || (code === 403 && !data)) return t('Session CNCjs requise : ouvrez CNCjs et connectez-vous.');
    if (code === 404 && !known) return t('Sauvegarde indisponible : le serveur CNCjs de la tablette doit être mis à jour.');
    if (known === 'EBACKUP_NO_MACHINE') return t('Connectez la machine d’abord.');
    if (known === 'EBACKUP_NO_SETTINGS') return t('Réglages pas encore lus : touchez « Relire », machine au repos.');
    if (known === 'ETOUCH_SETTINGS_READING') return t('Lecture des réglages en cours : réessayez dans quelques secondes.');
    if (known === 'EBACKUP_UNREADABLE' || known === 'EBACKUP_ID') return t('Cette sauvegarde est illisible.');
    return fallback;
  }

  var card = el('div', 'card wide ks-backup-card'); card.id = 'ks-settings-backup';
  var heading = el('h2', '', t('Sauvegarde des réglages de la carte') + ' '), scope = el('span', 'ks-scope', t('Serveur CNCjs')); scope.setAttribute('data-scope', 'server'); heading.appendChild(scope); card.appendChild(heading);
  card.appendChild(el('p', '', t('Une copie datée des réglages de la carte, gardée sur le serveur CNCjs.')));
  var summary = el('p', 'ks-backup-summary', '—'); card.appendChild(summary);
  var drift = el('p', 'ks-backup-drift', ''); drift.hidden = true; card.appendChild(drift);
  var tools = el('div', 'ks-backup-tools');
  var saveButton = el('button', 't-btn t-btn--primary ks-backup-save', t('Sauvegarder maintenant')); saveButton.type = 'button'; tools.appendChild(saveButton);
  var rereadButton = el('button', 'ks-secondary ks-backup-reread', t('Relire')); rereadButton.type = 'button'; tools.appendChild(rereadButton);
  card.appendChild(tools);
  var status = el('p', 'ks-backup-status', ''); status.setAttribute('role', 'status'); card.appendChild(status);
  var list = el('ul', 'ks-backup-list'); card.appendChild(list);
  var moreButton = el('button', 'ks-secondary ks-backup-more', ''); moreButton.type = 'button'; moreButton.hidden = true; card.appendChild(moreButton);
  var result = el('div', 'ks-backup-result'); result.hidden = true; result.setAttribute('role', 'status'); card.appendChild(result);
  card.appendChild(el('p', 'ks-help', t('La restauration se fait à la main, réglage par réglage. Rien n’est écrit dans la carte d’ici.')));
  card.appendChild(el('p', 'ks-help', t('La comparaison porte sur la dernière lecture des réglages. Pour les relire : « Relire », machine au repos.')));
  panel.appendChild(card);

  var info = null, busy = false, notice = '', listNotice = false, expanded = false, loadedKey = '', compared = null, machineLine = null, compareButtons = [], exportButtons = [];

  function latest() { var b = info && Array.isArray(info.backups) ? info.backups : []; for (var i = 0; i < b.length; i++) if (!b[i].damaged) return b[i]; return null; }
  function driftText() {
    var d = info && info.drift;
    if (!d || !(d.changed > 0)) return '';
    return (d.changed === 1 ? t('1 réglage de la machine a changé depuis la sauvegarde du {date}.') : t('{n} réglages de la machine ont changé depuis la sauvegarde du {date}.').replace('{n}', d.changed)).replace('{date}', when(d.at));
  }
  // 1 · Machine: one more line of « Pour que la machine soit prête », only while the board differs
  // from the last backup and nothing more urgent (an incident) is shown there.
  function paintMachineLine() {
    var m = machine(), text = m && info && info.port === m.port ? driftText() : '', host = document.getElementById('machine-list'), layout = document.getElementById('machine-layout');
    var on = !!(text && host && !(layout && layout.getAttribute('data-incident') === 'true'));
    if (!on) { if (machineLine && machineLine.parentNode) machineLine.parentNode.removeChild(machineLine); return; }
    if (!machineLine) {
      machineLine = el('li', ''); machineLine.setAttribute('data-line', 'sauvegarde'); machineLine.setAttribute('data-line-state', 'attente');
      var mark = el('span', 'ks-line-mark', '○'); mark.setAttribute('aria-hidden', 'true'); machineLine.appendChild(mark); machineLine.appendChild(el('span', 'ks-line-text', ''));
    }
    set(machineLine.lastChild, text + ' ' + t('À voir dans Plus → Réglages.'));
    if (machineLine.parentNode !== host || host.lastChild !== machineLine) host.appendChild(machineLine);
  }
  function row(b) {
    var li = el('li', ''), text = el('span', 'ks-backup-when', '');
    if (b.damaged) { set(text, b.id + ' · ' + t('fichier illisible')); li.appendChild(text); return li; }
    set(text, when(b.at) + ' · ' + count(b.count) + (b.firmware ? ' · ' + b.firmware : '') + (b.profile && b.profile.label ? ' · ' + b.profile.label : ''));
    li.appendChild(text);
    if (b.first) li.appendChild(el('span', 'ks-backup-first', t('Première sauvegarde, toujours gardée')));
    var compare = el('button', 'ks-secondary ks-backup-compare', t('Comparer à la carte')); compare.type = 'button';
    var exportButton = el('button', 'ks-secondary ks-backup-export', t('Exporter')); exportButton.type = 'button';
    compare.addEventListener('click', function () { if (!compare.disabled) compareWith(b.id); });
    exportButton.addEventListener('click', function () { if (!exportButton.disabled) exportFile(b.id); });
    compareButtons.push(compare); exportButtons.push(exportButton);
    li.appendChild(compare); li.appendChild(exportButton);
    return li;
  }
  function paintList() {
    var all = info && Array.isArray(info.backups) ? info.backups : [], short = all.slice(0, SHOWN);
    // The first backup stays in sight: it is the reference.
    if (all.length > SHOWN && all[all.length - 1].first) short.push(all[all.length - 1]);
    var foldable = short.length < all.length, rows = foldable && !expanded ? short : all;
    while (list.lastChild) list.removeChild(list.lastChild);
    compareButtons = []; exportButtons = [];
    rows.forEach(function (b) { list.appendChild(row(b)); });
    show(moreButton, foldable);
    set(moreButton, expanded ? t('Afficher moins') : t('Afficher les {n} autres').replace('{n}', all.length - short.length));
  }
  function paintResult() {
    while (result.lastChild) result.removeChild(result.lastChild);
    show(result, !!compared);
    if (!compared) return;
    var changes = Array.isArray(compared.changes) ? compared.changes : [];
    result.appendChild(el('h3', '', t('Comparaison avec la sauvegarde du {date}').replace('{date}', when(compared.at))));
    if (!changes.length) { result.appendChild(el('p', '', t('Aucune différence : la carte a les mêmes réglages que cette sauvegarde.'))); return; }
    result.appendChild(el('p', '', changes.length === 1 ? t('1 réglage différent.') : t('{n} réglages différents.').replace('{n}', changes.length)));
    var table = el('table', 'ks-backup-diff'), head = el('tr', '');
    [t('Réglage'), t('Sauvegarde'), t('Carte maintenant')].forEach(function (s) { var th = el('th', '', s); th.setAttribute('scope', 'col'); head.appendChild(th); });
    var thead = el('thead', ''), body = el('tbody', ''); thead.appendChild(head); table.appendChild(thead); table.appendChild(body);
    changes.slice(0, SHOWN_CHANGES).forEach(function (c) {
      var tr = el('tr', ''), what = label(c.name), name = el('th', '', c.name + (what ? ' · ' + what : '')); name.setAttribute('scope', 'row');
      tr.appendChild(name);
      tr.appendChild(el('td', '', c.saved === null || c.saved === undefined ? t('absent') : String(c.saved)));
      tr.appendChild(el('td', '', c.current === null || c.current === undefined ? t('absent') : String(c.current)));
      body.appendChild(tr);
    });
    result.appendChild(table);
    if (changes.length > SHOWN_CHANGES) result.appendChild(el('p', '', t('… et {n} autres : exportez la sauvegarde pour tout voir.').replace('{n}', changes.length - SHOWN_CHANGES)));
  }
  function paint() {
    paintMachineLine();
    if (!shown()) return;
    var m = machine(), ready = settingsRead(m) && !reading(m), last = latest(), all = info && Array.isArray(info.backups) ? info.backups : [];
    saveButton.disabled = busy || !info || !ready;
    rereadButton.disabled = busy || !rereadAllowed();
    compareButtons.forEach(function (b) { b.disabled = busy || !ready; });
    exportButtons.forEach(function (b) { b.disabled = busy; });
    if (info) set(summary, last ? t('Dernière sauvegarde : {date}').replace('{date}', when(last.at)) + ' · ' + count(last.count) + ' · ' + t('{n} sur {max} gardées').replace('{n}', all.length).replace('{max}', info.max) : t('Aucune sauvegarde pour l’instant.'));
    var changed = m && info && info.port === m.port ? driftText() : '';
    show(drift, !!changed || !!(m && info && info.port === m.port && info.drift && info.drift.changed === 0));
    set(drift, changed || t('La carte a les mêmes réglages que la dernière sauvegarde.'));
    drift.setAttribute('data-tone', changed ? 'warn' : 'ok');
    if (notice) set(status, notice);
    else if (!m) set(status, t('Machine non connectée : la liste reste consultable, pas la comparaison.'));
    else if (reading(m)) set(status, t('Lecture des réglages…'));
    else if (!settingsRead(m)) set(status, t('Réglages pas encore lus : touchez « Relire », machine au repos.'));
    else set(status, '');
  }
  function accept(data) {
    var m = machine();
    info = { backups: Array.isArray(data.backups) ? data.backups : [], max: data.max, drift: data.drift || null, port: m && m.port || '' };
    paintList();
  }
  var loading = false, again = false;
  function load() {
    // One list request at a time (the tab shown and the settings read may ask together); a request
    // asked meanwhile runs after it, so the answer never predates the last reading of the settings.
    if (loading) { again = true; return; }
    loading = true;
    request('GET', undefined, function (code, data) {
      loading = false;
      if (again) { again = false; load(); return; }
      // A list that answers takes back only what a failed list said: the outcome of a save, of an
      // export or of « Relire » stays until the next action.
      if (code === 200 && data) { accept(data); if (listNotice) { notice = ''; listNotice = false; } }
      else { if (!info) set(summary, '—'); notice = message(code, data, t('Liste des sauvegardes indisponible.')); listNotice = true; }
      paint();
    });
  }
  function act(body, fallback, done) {
    if (busy) return;
    busy = true; notice = ''; listNotice = false; paint();
    request('POST', body, function (code, data) {
      busy = false; listNotice = false;
      if (code === 200 && data) done(data); else notice = message(code, data, fallback);
      paint();
    });
  }
  saveButton.addEventListener('click', function () {
    if (saveButton.disabled) return;
    act({ action: 'save' }, t('Sauvegarde impossible.'), function (data) {
      accept(data); compared = null; paintResult();
      notice = t('Sauvegarde enregistrée : {date}').replace('{date}', data.saved ? when(data.saved.at) : '') + (data.saved ? ' · ' + count(data.saved.count) : '');
    });
  });
  rereadButton.addEventListener('click', function () {
    var controls = window.cncJobControls;
    if (rereadButton.disabled || !controls || typeof controls.readSettings !== 'function') return;
    compared = null; paintResult(); notice = ''; listNotice = false;
    controls.readSettings().then(function () { paint(); }, function (error) { listNotice = false; notice = (uiLocale.message || t)(error && error.message || '') || t('Impossible pour l’instant.'); paint(); });
  });
  moreButton.addEventListener('click', function () { expanded = !expanded; paintList(); paint(); });
  function compareWith(id) {
    act({ action: 'compare', id: id }, t('Comparaison impossible.'), function (data) { compared = data; paintResult(); });
  }
  function exportFile(id) {
    act({ action: 'read', id: id }, t('Export impossible.'), function (data) {
      try {
        window.CNCDownload.save(new Blob([JSON.stringify(data.backup, null, 2) + '\n'], { type: 'application/json' }), id);
        notice = t('Sauvegarde proposée au téléchargement.');
      } catch (error) { notice = t('Export impossible : ') + error.message; }
    });
  }

  // The board's settings were read (connection, « Relire », another board): ask once what changed
  // since the last backup. Nothing is asked while they are missing or being read.
  // CNCjs hands a reading over to its controller up to 250 ms after the board's `ok`, without any
  // change of this key: the first answer may predate it (the server then gives no drift, or the
  // drift of a partial first reading), so the list is asked once more when that delay has passed.
  var SETTLE_MS = 400, settle = 0;
  function follow() {
    var m = machine(), key = m ? [m.port, m.generation, m.startups, settingsRead(m), reading(m)].join('|') : '';
    if (key !== loadedKey) {
      loadedKey = key;
      clearTimeout(settle); settle = 0;
      if (!m) { if (info) info.drift = null; compared = null; paintResult(); }
      else if (settingsRead(m) && !reading(m)) {
        compared = null; paintResult(); load();
        settle = setTimeout(function () { settle = 0; var now = machine(); if (now && settingsRead(now) && !reading(now)) load(); }, SETTLE_MS);
      }
    }
    paint();
  }
  window.addEventListener('cnc-job-status', follow);
  window.addEventListener('cnc-settings-tab', function (e) { if (e && e.detail === 'machine' && shown()) { paint(); load(); } });
  window.addEventListener('cnc-screen-change', function () { if (shown()) { paint(); load(); } else paintMachineLine(); });
  document.addEventListener('visibilitychange', function () { if (shown()) paint(); });
  follow();
  if (shown() && !info) load();
  window.cncSettingsBackup = { load: load, state: function () { return { busy: busy, info: info, compared: compared }; } };
})();
