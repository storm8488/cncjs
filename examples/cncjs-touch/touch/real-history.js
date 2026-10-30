(function () {
  'use strict';
  var uiLocale=(typeof window!=='undefined'&&window.cncI18n)||{t:function(s){return s;},html:function(s){return s;}};
  if (document.body.getAttribute('data-simulation') === 'true') return;
  var journal = window.cncSessionJournal.create(), page = 0, size = 5, dirty = true;
  var $ = function (id) { return document.getElementById(id); };
  var rows = Object.create(null), mounted = false, filter = 'all';
  // Two sources (F4): this page's session journal (local, 100 events, lost on reload) and the
  // durable history kept by the server (every device, read-only, paged by `before` = seq).
  var source = 'session', server = { pages: [null], index: 0, data: null, error: '', loading: false, request: null, id: 0 };
  function set(el, key, value) { if (el[key] !== value) el[key] = value; }
  // Filters (UI 2027): errors = lost connection or unavailable state; jobs = files and workflow; alarms = an alarm state.
  function matches(e) {
    if (filter === 'errors') return e.kind === 'connection' && /indisponible|unavailable|no disponible/i.test(e.message) || e.kind === 'availability';
    if (filter === 'jobs') return e.kind === 'workflow' || e.kind === 'file';
    if (filter === 'alarms') return e.kind === 'state' && /alarm/i.test(e.message);
    return true;
  }
  function render() {
    if (!mounted || document.hidden || !$('screen-history').classList.contains('active') || !dirty) return;
    dirty = false;
    if (source === 'server') { renderServer(); return; }
    var events = journal.report().events.filter(matches), list = $('real-history-list');
    page = Math.min(page, Math.max(0, Math.ceil(events.length / size) - 1));
    var desired = [], keep = Object.create(null);
    events.slice(page * size, (page + 1) * size).forEach(function (e) {
      var row = rows[e.id];
      if (!row) {
        row = document.createElement('li'); row._title = document.createElement('strong'); row._detail = document.createElement('p');
        row.appendChild(row._title); row.appendChild(row._detail); rows[e.id] = row;
      }
      set(row._title, 'textContent', new Date(e.time).toLocaleTimeString(window.cncI18n?window.cncI18n.locale:'fr-FR') + ' — ' + e.message);
      if (typeof row.setAttribute === 'function' && row.getAttribute('data-kind') !== e.kind) row.setAttribute('data-kind', e.kind);
      set(row._detail, 'textContent', (e.port || '') + (e.file ? ' · ' + e.file : ''));
      set(row._detail, 'hidden', !row._detail.textContent); desired.push(row); keep[e.id] = true;
    });
    if (!events.length) { var empty = list._empty || (list._empty = document.createElement('li')); set(empty, 'textContent', uiLocale.t('Aucun événement pour le moment.')); desired.push(empty); }
    desired.forEach(function (row, i) { if (list.children[i] !== row) list.insertBefore(row, list.children[i] || null); });
    while (list.children.length > desired.length) list.removeChild(list.lastChild);
    Object.keys(rows).forEach(function (id) { if (!keep[id]) delete rows[id]; });
    set($('real-history-page'), 'textContent', uiLocale.t('Page ') + (page + 1) + ' / ' + Math.max(1,Math.ceil(events.length / size)) + ' · ' + events.length + uiLocale.t(' événements'));
    set($('real-history-prev'), 'disabled', page === 0);
    set($('real-history-next'), 'disabled', (page + 1) * size >= events.length);
  }
  function changed(value) { if (value) { page = 0; if (source === 'session') { dirty = true; render(); } } }
  var filters = typeof document.querySelectorAll === 'function' ? document.querySelectorAll('[data-history-filter]') : [];
  Array.prototype.forEach.call(filters, function (b) {
    b.addEventListener('click', function () {
      filter = b.getAttribute('data-history-filter') || 'all'; page = 0; dirty = true;
      Array.prototype.forEach.call(filters, function (o) { o.setAttribute('aria-pressed', String(o === b)); });
      render();
    });
  });
  $('real-history-prev').addEventListener('click', function () {
    if (source === 'server') { if (server.index > 0 && !server.loading) { server.index--; fetchServer(); } return; }
    page = Math.max(0, page - 1); dirty = true; render();
  });
  $('real-history-next').addEventListener('click', function () {
    if (source === 'server') {
      var d = server.data, last = d && d.entries.length ? d.entries[d.entries.length - 1].seq : null;
      if (d && d.more && typeof last === 'number' && !server.loading) { server.pages[server.index + 1] = last; server.pages.length = server.index + 2; server.index++; fetchServer(); }
      return;
    }
    page++; dirty = true; render();
  });
  // Source switch at the top of the journal card: Cette session | Serveur, and what each one holds.
  // Built when the journal is first shown (a hidden view writes nothing).
  var scope = null, sources = {};
  function buildSources() {
    if (scope) return;
    var card = typeof document.querySelector === 'function' ? document.querySelector('#screen-history .ks-history-card') : null;
    var bar = document.createElement('div'), seg = document.createElement('div');
    scope = document.createElement('p'); bar.className = 'ks-history-source'; scope.id = 'real-history-scope'; scope.className = 'ks-history-scope';
    seg.className = 't-seg'; seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', uiLocale.t('Source du journal'));
    [['session', uiLocale.t('Cette session')], ['server', uiLocale.t('Serveur')]].forEach(function (pair) {
      var b = document.createElement('button'); b.type = 'button'; b.id = 'real-history-source-' + pair[0]; b.textContent = pair[1];
      b.setAttribute('aria-pressed', String(pair[0] === source)); b.addEventListener('click', function () { choose(pair[0]); });
      sources[pair[0]] = b; seg.appendChild(b);
    });
    bar.appendChild(seg); bar.appendChild(scope);
    if (card && typeof card.insertBefore === 'function') card.insertBefore(bar, card.firstChild || null);
    describeSource();
  }
  function describeSource() {
    if (!scope) return;
    set(scope, 'textContent', source === 'server'
      ? uiLocale.t('Historique serveur : enregistré par CNCjs pour tous les appareils (tablettes et PC), conservé après un redémarrage, 500 entrées au plus. Lecture seule.')
      : uiLocale.t('Journal de session : cet appareil seulement, 100 événements au plus, effacé au rechargement de la page.'));
    // The filters sort the session journal; the server history is read page by page as it is.
    Array.prototype.forEach.call(filters, function (b) { set(b, 'disabled', source === 'server'); });
  }
  function choose(next) {
    if ((next !== 'session' && next !== 'server') || next === source) return;
    source = next; dirty = true;
    Object.keys(sources).forEach(function (k) { sources[k].setAttribute('aria-pressed', String(k === source)); });
    describeSource();
    if (source === 'server') { server.pages = [null]; server.index = 0; if (mounted) fetchServer(); else server.data = null; }
    else { cancelServer(); render(); }
  }
  function cancelServer() {
    var x = server.request; server.request = null; server.loading = false; server.id++;
    if (x) { x.onload = x.onerror = x.ontimeout = null; if (typeof x.abort === 'function') x.abort(); }
  }
  function token() { try { return JSON.parse(localStorage.getItem('cnc')).state.session.token || ''; } catch (_) { return ''; } }
  function fetchServer() {
    cancelServer();
    var credential = token(), id = server.id, before = server.pages[server.index];
    server.data = null; server.error = ''; server.loading = true; dirty = true;
    if (!credential) { server.loading = false; server.error = uiLocale.t('Session CNCjs requise.'); render(); return; }
    var base = window.cncState && window.cncState.get().apiBase || '/api', xhr = new XMLHttpRequest();
    server.request = xhr;
    xhr.open('GET', base + '/touch-history?limit=' + size + (typeof before === 'number' ? '&before=' + before : ''), true);
    xhr.timeout = 15000; xhr.setRequestHeader('Authorization', 'Bearer ' + credential);
    function finish(data, error) { if (id !== server.id) return; server.request = null; server.loading = false; server.data = data; server.error = error || ''; dirty = true; render(); }
    xhr.onload = function () {
      var data = null; try { data = JSON.parse(xhr.responseText); } catch (_) { data = null; }
      if (xhr.status >= 200 && xhr.status < 300 && data && Array.isArray(data.entries)) {
        finish({ entries: data.entries.filter(function (e) { return e && typeof e === 'object'; }), total: Number(data.total) || 0, skipped: Number(data.skipped) || 0, more: data.more === true }, '');
      } else {
        finish(null, xhr.status === 401 ? uiLocale.t('Session CNCjs requise.') : uiLocale.t('Historique serveur indisponible') + (xhr.status ? ' (HTTP ' + xhr.status + ')' : '') +
          (data && typeof data.message === 'string' ? ' : ' + uiLocale.t(data.message.slice(0, 200)) : '.'));
      }
    };
    xhr.onerror = xhr.ontimeout = function () { finish(null, uiLocale.t('Historique serveur injoignable : vérifiez la connexion, puis touchez Serveur à nouveau.')); };
    xhr.send(null);
    render();
  }
  // One server entry → title, detail and tone. Only listed fields are shown, never a raw entry
  // (the server already drops tickets and tokens; nothing here prints an unknown field).
  var EVENTS = { load: 'Fichier chargé', start: 'Travail démarré', pause: 'Pause', resume: 'Reprise', stop: 'Travail arrêté', error: 'Ligne refusée par Grbl', alarm: 'Alarme', aborted: 'Carte redémarrée pendant le travail' };
  var CHANGES = { claim: 'Pilotage pris', release: 'Pilotage libéré', takeover: 'Pilotage repris', expired: 'Pilotage libéré (appareil absent)', absent: 'Pilote absent', restored: 'Pilote revenu' };
  function str(v, max) { return typeof v === 'string' ? v.slice(0, max || 120) : typeof v === 'number' && isFinite(v) ? String(v) : ''; }
  function who(actor) { return actor && typeof actor === 'object' ? str(actor.label, 60) || str(actor.user, 60) || str(actor.kind, 20) : ''; }
  function describeEntry(e) {
    var what;
    if (e.event === 'finish') what = e.result === 'error' ? uiLocale.t('Terminé avec erreurs') : uiLocale.t('Travail terminé');
    else if (e.event === 'control') what = uiLocale.t(CHANGES[e.change] || 'Pilotage');
    else what = EVENTS[e.event] ? uiLocale.t(EVENTS[e.event]) : str(e.event, 40) || '?';
    var when = new Date(e.at), time = isFinite(when.getTime()) ? when.toLocaleString(window.cncI18n ? window.cncI18n.locale : 'fr-FR') : str(e.at, 40);
    var program = str(e.program, 120) || str(e.file, 120), parts = [];
    if (str(e.fromLine)) parts.push(uiLocale.t('depuis la ligne ') + str(e.fromLine));
    if (str(e.line)) parts.push(uiLocale.t('ligne ') + str(e.line));
    if (str(e.code, 20)) parts.push(uiLocale.t('code ') + str(e.code, 20));
    if (e.event === 'finish' && str(e.errors)) parts.push(uiLocale.t('erreurs : ') + str(e.errors));
    if (e.event === 'control') {
      if (who(e.previous)) parts.push(uiLocale.t('avant : ') + who(e.previous));
      if (who(e.owner)) parts.push(uiLocale.t('après : ') + who(e.owner));
      if (str(e.reason, 200)) parts.push(uiLocale.t('motif : ') + str(e.reason, 200));
    }
    if (who(e.actor)) parts.push(uiLocale.t('par ') + who(e.actor));
    if (e.controller && typeof e.controller === 'object' && str(e.controller.port, 60)) parts.push(str(e.controller.port, 60));
    var alarm = e.event === 'alarm' || e.event === 'error' || e.event === 'aborted' || (e.event === 'finish' && e.result === 'error');
    return { title: time + ' — ' + what + (program ? ' · ' + program : ''), detail: parts.join(' · '), kind: alarm ? 'alarm' : e.event === 'control' ? 'connection' : 'workflow' };
  }
  function renderServer() {
    var list = $('real-history-list'), d = server.data, out = [];
    function line(title, detail, kind) {
      var li = document.createElement('li'), strong = document.createElement('strong'), p = document.createElement('p');
      strong.textContent = title; p.textContent = detail || ''; p.hidden = !detail; li.appendChild(strong); li.appendChild(p);
      li.setAttribute('data-kind', kind || 'server'); out.push(li);
    }
    if (server.loading) line(uiLocale.t('Lecture de l’historique serveur…'), '', '');
    else if (server.error) line(server.error, '', 'alarm');
    else if (d && !d.entries.length) line(server.index ? uiLocale.t('Aucune entrée plus ancienne.') : uiLocale.t('Aucune entrée dans l’historique serveur.'), '', '');
    else if (d) d.entries.forEach(function (e) { var x = describeEntry(e); line(x.title, x.detail, x.kind); });
    while (list.children.length) list.removeChild(list.lastChild);
    out.forEach(function (li) { list.appendChild(li); });
    rows = Object.create(null);
    set($('real-history-page'), 'textContent', uiLocale.t('Serveur · page ') + (server.index + 1) + (d ? ' · ' + d.total + uiLocale.t(' entrées') + (d.skipped ? ' · ' + d.skipped + uiLocale.t(' ligne(s) illisible(s) ignorée(s)') : '') : ''));
    set($('real-history-prev'), 'disabled', server.loading || server.index === 0);
    set($('real-history-next'), 'disabled', server.loading || !(d && d.more && d.entries.length));
  }
  function mount() {
    if (document.hidden || !$('screen-history').classList.contains('active')) return;
    var was = mounted; mounted = true; buildSources();
    // The server history is read again each time the journal is opened on it.
    if (source === 'server' && (!was || !server.data && !server.loading && !server.error)) fetchServer(); else render();
  }
  function unmount() { mounted = false; if (source === 'server') cancelServer(); }
  window.addEventListener('cnc-screen-change', function (e) { if (e.detail === 'history') mount(); else unmount(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) unmount(); else mount(); });
  window.cncRealHistoryView = { mount: mount, unmount: unmount, source: function () { return source; }, choose: choose };
  window.addEventListener('cnc-history-page-size', function (e) {
    var next = Number(e.detail); if ((next !== 3 && next !== 4 && next !== 5 && next !== 8) || next === size) return;
    page = Math.floor(page * size / next); size = next; dirty = true;
    if (source === 'server') { server.pages = [null]; server.index = 0; if (mounted) fetchServer(); } else render();
  });
  window.addEventListener('cnc-job-status', function (e) {
    if (!e.detail.simulation) {
      if(window.cncState&&window.CNCJobStream)changed(journal.connection(window.cncState.get().transportConnected));
      changed(journal.observe(e.detail.machine));
    }
  });
  if (window.cncSocket&&!(window.cncState&&window.CNCJobStream)) {
    var socket = window.cncSocket;
    socket.on('connect', function () { changed(journal.connection(true)); });
    ['disconnect', 'connect_error', 'error'].forEach(function (event) {
      socket.on(event, function () { changed(journal.connection(false)); });
    });
    if (socket.connected) changed(journal.connection(true));
  }
  function download(format) {
    try {
      var report = journal.report();
      var blob = new Blob([format === 'json' ? JSON.stringify(report, null, 2) : window.cncSessionJournal.text(report)],
        { type: format === 'json' ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8' });
      var name = 'cnc-journal-' + report.exportedAt.replace(/[:.]/g, '-') + '.' + format;
      window.CNCDownload.save(blob,name);
      $('real-export-status').textContent = uiLocale.t('Téléchargement demandé : ') + name;
    } catch (e) { $('real-export-status').textContent = uiLocale.t('Téléchargement indisponible dans ce navigateur.'); }
  }
  $('real-export-text').addEventListener('click', function () { download('txt'); });
  $('real-export-json').addEventListener('click', function () { download('json'); });
  mount();
})();
