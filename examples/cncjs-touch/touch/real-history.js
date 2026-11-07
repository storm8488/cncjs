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
    v2Queue();
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
  function serverNewer() { if (server.index > 0 && !server.loading) { server.index--; fetchServer(); } }
  function serverOlder() {
    var d = server.data, last = d && d.entries.length ? d.entries[d.entries.length - 1].seq : null;
    if (d && d.more && typeof last === 'number' && !server.loading) { server.pages[server.index + 1] = last; server.pages.length = server.index + 2; server.index++; fetchServer(); }
  }
  $('real-history-prev').addEventListener('click', function () {
    if (source === 'server') { serverNewer(); return; }
    page = Math.max(0, page - 1); dirty = true; render();
  });
  $('real-history-next').addEventListener('click', function () {
    if (source === 'server') { serverOlder(); return; }
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
        // 401, or CNCjs' plain-text 403 (« Forbidden Access »): the session is refused.
        finish(null, xhr.status === 401 || (xhr.status === 403 && !data) ? uiLocale.t('Session CNCjs requise.') : uiLocale.t('Historique serveur indisponible') + (xhr.status ? ' (HTTP ' + xhr.status + ')' : '') +
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
      v2Feedback(e.detail);
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
  // ---- Performance v2 (L6): contextual journal, read only, under body.perf-v2 only. ----
  // Same sources and retention: this page's 100 local events and the server history read page
  // by page on demand. A curve marker (cnc-v2-journal-open, detail {marker:{identity,interval},
  // view}) opens the program and interval through the L3 model (cncV2.use('journal'));
  // « Retour à Suivi » hands the view back (cnc-v2-journal-return, detail {view}). Handlers only
  // queue a frame; nothing here can send or replay a command. FR/EN/ES rows are embedded.
  var V2TEXT = {
    'Journal de cette session': ['This session’s journal', 'Diario de esta sesión'], 'Historique serveur': ['Server history', 'Historial del servidor'],
    'Cette session': ['This session', 'Esta sesión'], 'Serveur': ['Server', 'Servidor'],
    '← Retour à Suivi': ['← Back to Monitoring', '← Volver a Seguimiento'], 'Tout le journal': ['Whole journal', 'Todo el diario'],
    'Programme : ': ['Program: ', 'Programa: '], 'programme inconnu': ['unknown program', 'programa desconocido'],
    ' · intervalle de ': [' · interval of ', ' · intervalo de '],
    ' s autour de l’événement de la courbe (horloge de cette tablette).': [' s around the chart event (this tablet’s clock).', ' s alrededor del evento de la curva (reloj de esta tableta).'],
    'Contexte indisponible : programme ou intervalle inconnu.': ['Context unavailable: unknown program or interval.', 'Contexto no disponible: programa o intervalo desconocido.'],
    'Appareil (cette tablette)': ['Device (this tablet)', 'Dispositivo (esta tableta)'], 'Rapport du contrôleur': ['Controller report', 'Informe del controlador'],
    'Serveur CNCjs': ['CNCjs server', 'Servidor CNCjs'], 'Déduit par l’interface': ['Deduced by the interface', 'Deducido por la interfaz'],
    'Heure': ['Time', 'Hora'], 'Origine': ['Origin', 'Origen'], 'Catégorie': ['Category', 'Categoría'], 'Demande': ['Request', 'Solicitud'],
    'Programme': ['Program', 'Programa'], 'Contrôleur': ['Controller', 'Controlador'], 'Événement': ['Event', 'Evento'], 'Détail': ['Details', 'Detalle'],
    'Touchez un événement pour afficher son détail.': ['Tap an event to show its details.', 'Toque un evento para ver su detalle.'],
    'Lecture seule : aucune commande ne peut être rejouée depuis le journal.': ['Read only: no command can be replayed from the journal.', 'Solo lectura: ninguna orden puede repetirse desde el diario.'],
    'Envoyée : aucune réponse reçue à ce moment.': ['Sent: no answer received at that time.', 'Enviada: ninguna respuesta recibida en ese momento.'],
    'Confirmée par le serveur CNCjs : cela ne prouve pas que la machine l’a exécutée.': ['Confirmed by the CNCjs server: this does not prove the machine executed it.', 'Confirmada por el servidor CNCjs: no prueba que la máquina la haya ejecutado.'],
    'Refusée : le motif est indiqué ci-dessus.': ['Refused: the reason is shown above.', 'Rechazada: el motivo se indica arriba.'],
    'Incertaine : réponse perdue. Vérifiez l’état de la machine avant toute nouvelle action.': ['Uncertain: answer lost. Check the machine state before any new action.', 'Incierta: respuesta perdida. Compruebe el estado de la máquina antes de cualquier nueva acción.'],
    'Enregistré par le serveur CNCjs : ce n’est pas une preuve d’usinage.': ['Recorded by the CNCjs server: this is not proof of machining.', 'Registrado por el servidor CNCjs: no es una prueba de mecanizado.'],
    '← Plus récent': ['← Newer', '← Más reciente'], 'Plus ancien →': ['Older →', 'Más antiguo →']
  };
  function vt(s) { var l = window.cncI18n && window.cncI18n.language, row = V2TEXT[s]; return row && l === 'en' ? row[0] : row && l === 'es' ? row[1] : s; }
  var FEEDBACK = { sent: 'sent', confirmed: 'confirmed', failed: 'refused', uncertain: 'uncertain' };
  var SOURCES = { device: 'Appareil (cette tablette)', report: 'Rapport du contrôleur', server: 'Serveur CNCjs', inferred: 'Déduit par l’interface' };
  var STATE_NOTES = { sent: 'Envoyée : aucune réponse reçue à ce moment.', confirmed: 'Confirmée par le serveur CNCjs : cela ne prouve pas que la machine l’a exécutée.',
    refused: 'Refusée : le motif est indiqué ci-dessus.', uncertain: 'Incertaine : réponse perdue. Vérifiez l’état de la machine avant toute nouvelle action.' };
  var v2 = { registered: false, disposed: false, frame: 0, filter: 'all', selected: null, context: null, view: null, nodes: null, feedback: '', rows: Object.create(null) };
  function v2Api() { var a = window.cncV2; return a && typeof a.use === 'function' && typeof a.gate === 'function' ? a : null; }
  function v2Layout() { return !!(document.body && document.body.classList && document.body.classList.contains('perf-v2')); }
  function v2Model() { var a = v2Api(), m = a && !v2.disposed && a.gate() ? a.use('journal') : null; return m && typeof m.presentation === 'function' ? m : null; }
  function v2Queue() {
    if (!v2 || !v2.registered || v2.disposed || v2.frame || !window.requestAnimationFrame) return;
    v2.frame = window.requestAnimationFrame(v2Render);
  }
  // The action feedback job-controls already shows, recorded only under the v2 layout.
  function v2Feedback(detail) {
    var state = detail && detail.feedbackState, signature = state ? state + '|' + (detail.feedback || '') : '';
    if (signature === v2.feedback) return;
    v2.feedback = signature;
    if (FEEDBACK[state] && v2Layout()) changed(journal.command(FEEDBACK[state], String(detail.feedback || '')));
  }
  var CATEGORIES = { command: 'command', connection: 'connection', session: 'connection', availability: 'connection' };
  // Local entry -> L0 journal event, with the identity and stamps captured at the event.
  function adaptSession(e) {
    var category = CATEGORIES[e.kind] || 'state', at = Date.parse(e.time);
    var origin = e.kind === 'command' || e.kind === 'connection' || e.kind === 'session' ? 'device' : e.lost ? 'inferred' : 'report';
    return { id: e.id, identity: e.job ? { role: 'loaded', file: e.job.file, fingerprint: e.job.fingerprint, controller: e.job.controller, generation: e.job.generation, revision: e.job.revision } : null,
      time: { arrivalMonoMs: e.mono, civilMs: isFinite(at) ? at : null, server: { value: null, source: null } },
      source: origin, state: e.command || (e.lost ? 'uncertain' : 'confirmed'), code: category + '.' + (e.command || e.kind),
      params: { category: category, message: e.message, file: e.job ? e.job.file : e.file, port: e.port || (e.job ? e.job.controller : null) } };
  }
  // Server entry -> event of the server's own clock; never placed on the local monotone clock.
  function adaptServer(e, i) {
    var x = describeEntry(e), at = Date.parse(e.at);
    var category = e.event === 'control' ? 'connection' : ['alarm', 'error', 'aborted', 'finish'].indexOf(e.event) >= 0 ? 'state' : 'command';
    return { id: 'server-' + (typeof e.seq === 'number' ? e.seq : i), identity: null,
      time: { arrivalMonoMs: null, civilMs: null, server: { value: isFinite(at) ? at : null, source: 'server-history' } },
      source: 'server', state: 'confirmed', code: category + '.' + str(e.event, 40),
      params: { category: category, message: x.title.slice(x.title.indexOf(' — ') + 3), detail: x.detail,
        file: str(e.program, 120) || str(e.file, 120) || null, port: e.controller && typeof e.controller === 'object' ? str(e.controller.port, 60) || null : null } };
  }
  function v2Events(model) {
    if (source === 'server') return server.data ? server.data.entries.map(adaptServer).reverse() : [];
    var local = journal.entries().map(adaptSession).reverse();
    if (!v2.context) return local.filter(function (e) { return v2.filter === 'all' || e.params.category === v2.filter; });
    model.update({ identity: v2.context.identity, interval: v2.context.interval, civilInterval: null, events: local, retained: true });
    return model.filter(v2.filter).events.slice();
  }
  function node(tag, cls, value) { var n = document.createElement(tag); if (cls) n.className = cls; if (value !== undefined) n.textContent = value; return n; }
  function button(id, label, cls) { var b = node('button', cls || 'ks-secondary', label); b.type = 'button'; if (id) b.id = id; return b; }
  function v2Build(content) {
    var n = {}, head = node('div', 'v2k-head'), titles = node('div', 'v2k-titles'), seg = node('div', 't-seg v2k-sources');
    n.title = node('h2'); n.context = node('p', 'v2k-context'); n.context.id = 'v2k-context';
    titles.appendChild(n.title); titles.appendChild(n.context); head.appendChild(titles);
    n.readOnly = node('span', 'ks-readonly'); head.appendChild(n.readOnly);
    seg.setAttribute('role', 'group'); n.sources = {};
    ['session', 'server'].forEach(function (k) {
      var b = button('v2k-source-' + k, vt(k === 'session' ? 'Cette session' : 'Serveur'), ''); b.setAttribute('aria-pressed', 'false');
      // The filters sort the session journal only (disabled on the server): reset on switching.
      b.addEventListener('click', function () { if (v2.context) return; v2.selected = null; if (k === 'server') v2.filter = 'all'; choose(k); v2Queue(); });
      n.sources[k] = b; seg.appendChild(b);
    });
    head.appendChild(seg);
    n.all = button('v2k-all', vt('Tout le journal')); n.back = button('v2k-back', vt('← Retour à Suivi'));
    n.all.addEventListener('click', function () { v2.context = null; v2.view = null; v2.selected = null; v2Queue(); });
    n.back.addEventListener('click', function () {
      var view = v2.view; v2.context = null; v2.view = null; v2.selected = null; v2Queue();
      window.dispatchEvent(new CustomEvent('cnc-v2-journal-return', { detail: { view: view } }));
      window.dispatchEvent(new CustomEvent('cnc-navigate', { detail: 'home' }));
    });
    head.appendChild(n.all); head.appendChild(n.back);
    n.filters = node('div', 't-seg v2k-filters'); n.filters.setAttribute('role', 'group'); n.filterButtons = [];
    ['all', 'command', 'state', 'connection'].forEach(function (k) {
      var b = button(null, k, ''); b.setAttribute('data-v2k-filter', k); b.setAttribute('aria-pressed', String(k === 'all'));
      b.addEventListener('click', function () { v2.filter = k; v2.selected = null; v2Queue(); });
      n.filterButtons.push(b); n.filters.appendChild(b);
    });
    var body = node('div', 'v2k-body');
    n.list = node('ol', 'v2k-list'); n.list.id = 'v2k-list'; n.detail = node('aside', 'v2k-detail'); n.detail.id = 'v2k-detail';
    body.appendChild(n.list); body.appendChild(n.detail);
    n.pages = node('div', 'v2k-pages'); n.newer = button('v2k-newer', vt('← Plus récent')); n.page = node('span'); n.older = button('v2k-older', vt('Plus ancien →'));
    n.newer.addEventListener('click', serverNewer); n.older.addEventListener('click', serverOlder);
    n.pages.appendChild(n.newer); n.pages.appendChild(n.page); n.pages.appendChild(n.older);
    content.appendChild(head); content.appendChild(n.filters); content.appendChild(body); content.appendChild(n.pages);
    return n;
  }
  function clock(e) {
    var value = e.time.civilMs !== null ? e.time.civilMs : e.time.server.value, at = new Date(value);
    if (value === null || !isFinite(at.getTime())) return '—';
    var locale = window.cncI18n ? window.cncI18n.locale : 'fr-FR';
    return e.source === 'server' ? at.toLocaleString(locale) : at.toLocaleTimeString(locale);
  }
  function v2Row(e, labels) {
    var key = String(e.id), row = v2.rows[key];
    var badge = e.params.category === 'command' && e.source !== 'server' ? labels.states[e.state] : vt(SOURCES[e.source]);
    var sig = JSON.stringify([clock(e), e.params.message, badge, v2.selected === key]);
    if (!row) { row = node('li'); row._button = button(null, '', 'v2k-row'); row.appendChild(row._button);
      row._button.addEventListener('click', function () { v2.selected = key; v2Queue(); }); v2.rows[key] = row; }
    if (row._sig !== sig) {
      row._sig = sig; var b = row._button; b.textContent = '';
      b.appendChild(node('span', 'v2k-time', clock(e))); b.appendChild(node('span', 'v2k-message', e.params.message || ''));
      b.appendChild(node('b', 'v2k-badge', badge || ''));
      b.setAttribute('aria-pressed', String(v2.selected === key));
      row.setAttribute('data-id', key); row.setAttribute('data-kind', e.params.category); row.setAttribute('data-category', e.params.category);
      row.setAttribute('data-state', e.state); row.setAttribute('data-source', e.source);
      row.setAttribute('data-at', String(e.time.arrivalMonoMs !== null ? e.time.arrivalMonoMs : e.time.server.value));
    }
    return row;
  }
  function v2Detail(n, e, labels) {
    while (n.detail.children.length) n.detail.removeChild(n.detail.lastChild);
    if (!e) { n.detail.appendChild(node('p', 'v2k-hint', vt('Touchez un événement pour afficher son détail.'))); return; }
    var dl = node('dl');
    function line(label, value) { if (!value) return; dl.appendChild(node('dt', null, vt(label))); dl.appendChild(node('dd', null, value)); }
    line('Événement', e.params.message); line('Heure', clock(e)); line('Origine', vt(SOURCES[e.source]));
    line('Catégorie', labels.filters[e.params.category]);
    if (e.params.category === 'command' && e.source !== 'server') line('Demande', labels.states[e.state]);
    line('Programme', e.params.file); line('Contrôleur', e.params.port); if (e.params.detail) line('Détail', e.params.detail);
    n.detail.appendChild(dl);
    var note = e.source === 'server' ? 'Enregistré par le serveur CNCjs : ce n’est pas une preuve d’usinage.' : e.params.category === 'command' ? STATE_NOTES[e.state] : '';
    if (note) n.detail.appendChild(node('p', 'v2k-note', vt(note)));
    n.detail.appendChild(node('p', 'v2k-readonly', vt('Lecture seule : aucune commande ne peut être rejouée depuis le journal.')));
  }
  function v2Render() {
    v2.frame = 0;
    var model = v2Model(), mounts = v2Api() && v2Api().mounts, mountPoint = mounts && mounts.get('history');
    if (!model || !v2Layout() || !mountPoint || !mountPoint.content || document.hidden || !$('screen-history').classList.contains('active')) return;
    var n = v2.nodes || (v2.nodes = v2Build(mountPoint.content)), lang = window.cncI18n && window.cncI18n.language;
    if (mountPoint.content.hidden) mountPoint.content.hidden = false;
    if (mountPoint.root.getAttribute('data-v2-presenter') !== 'on') mountPoint.root.setAttribute('data-v2-presenter', 'on');
    var events = v2Events(model), labels = model.presentation({ retained: events.length > 0, events: events }, lang), ctx = v2.context;
    set(n.title, 'textContent', ctx ? labels.title : vt(source === 'server' ? 'Historique serveur' : 'Journal de cette session'));
    set(n.readOnly, 'textContent', labels.readOnlyLabel);
    set(n.context, 'textContent', !ctx ? '' : ctx.identity && ctx.interval ? vt('Programme : ') + (ctx.identity.file || vt('programme inconnu')) + vt(' · intervalle de ') +
      Math.round((ctx.interval.toMonoMs - ctx.interval.fromMonoMs) / 1000) + vt(' s autour de l’événement de la courbe (horloge de cette tablette).') : vt('Contexte indisponible : programme ou intervalle inconnu.'));
    set(n.context, 'hidden', !ctx); set(n.back, 'hidden', !ctx); set(n.all, 'hidden', !ctx);
    Object.keys(n.sources).forEach(function (k) { n.sources[k].setAttribute('aria-pressed', String(k === source)); set(n.sources[k], 'disabled', !!ctx); });
    n.filterButtons.forEach(function (b) { var k = b.getAttribute('data-v2k-filter'); set(b, 'textContent', labels.filters[k]); b.setAttribute('aria-pressed', String(k === v2.filter)); set(b, 'disabled', source === 'server'); });
    if (source === 'server') events = events.filter(function (e) { return v2.filter === 'all' || e.params.category === v2.filter; });
    var desired = [], keep = Object.create(null), selected = null;
    events.forEach(function (e) { desired.push(v2Row(e, labels)); keep[String(e.id)] = true; if (String(e.id) === v2.selected) selected = e; });
    if (!events.length) {
      var empty = n.list._empty || (n.list._empty = node('li', 'v2k-empty'));
      set(empty, 'textContent', source === 'server' && server.loading ? uiLocale.t('Lecture de l’historique serveur…') : source === 'server' && server.error ? server.error : labels.emptyMessage);
      desired.push(empty);
    }
    desired.forEach(function (row, i) { if (n.list.children[i] !== row) n.list.insertBefore(row, n.list.children[i] || null); });
    while (n.list.children.length > desired.length) n.list.removeChild(n.list.lastChild);
    Object.keys(v2.rows).forEach(function (id) { if (!keep[id]) delete v2.rows[id]; });
    v2Detail(n, selected, labels);
    set(n.pages, 'hidden', source !== 'server');
    set(n.page, 'textContent', uiLocale.t('Serveur · page ') + (server.index + 1));
    set(n.newer, 'disabled', server.loading || server.index === 0); set(n.older, 'disabled', server.loading || !(server.data && server.data.more));
  }
  window.addEventListener('cnc-v2-change', function () {
    var a = v2Api(), s = a && a.state();
    if (!v2.registered && a && typeof a.register === 'function' && a.gate() && s.ready && s.layout) {
      v2.registered = true;
      var snap = { version: 1, available: true, screen: 'history', model: null };
      a.register('history', { snapshot: function () { return snap; }, update: function () { return snap; }, cancel: function () {},
        dispose: function () { v2.disposed = true; if (v2.frame && window.cancelAnimationFrame) window.cancelAnimationFrame(v2.frame); v2.frame = 0; } });
    }
    v2Queue();
  });
  window.addEventListener('cnc-v2-journal-open', function (e) {
    var model = v2Model(), d = e && e.detail || {};
    if (!model || !v2Layout()) return;
    v2.context = model.contextFor(d.marker || null, 30000); v2.view = d.view === undefined ? null : d.view;
    v2.filter = 'all'; v2.selected = null;
    if (source !== 'session') choose('session');
    window.dispatchEvent(new CustomEvent('cnc-navigate', { detail: 'history' }));
    v2Queue();
  });
  $('real-export-text').addEventListener('click', function () { download('txt'); });
  $('real-export-json').addEventListener('click', function () { download('json'); });
  mount();
})();
