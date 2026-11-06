(function () {
  'use strict';
  var uiLocale=window.cncI18n||{t:function(s){return s;},html:function(s){return s;}};
  var screen = document.getElementById('screen-files');
  if (!screen) return;
  screen.innerHTML =
    uiLocale.html('<div class="card wide library-header"><div><h2>Bibliothèque partagée</h2>') +
    uiLocale.html('<p class="mute">Envoyez depuis le PC, retrouvez vos fichiers sur la tablette.</p></div>') +
    uiLocale.html('<button id="library-refresh" type="button">↻ Actualiser</button></div>') +
    uiLocale.html('<div class="card library-list-panel"><div class="library-list-title"><h2>Fichiers sur le serveur</h2><span id="library-count" class="tag">0</span></div>') +
    uiLocale.html('<label class="library-label" for="library-search">Rechercher un fichier</label>') +
    uiLocale.html('<input id="library-search" type="search" placeholder="Nom, matière, outil, notes…">') +
    uiLocale.html('<button id="library-favorites" type="button" aria-pressed="false">★ Favoris seulement</button>') +
    uiLocale.html('<p id="library-status" role="status">Connexion à la bibliothèque…</p>') +
    uiLocale.html('<div id="library-list" aria-label="Fichiers disponibles"></div>') +
    uiLocale.html('<div class="library-pages"><button id="library-prev" type="button" hidden>← Précédent</button><span id="library-page"></span><button id="library-more" type="button" hidden>Suivant →</button></div>') +
    uiLocale.html('<details id="library-upload"><summary>+ Envoyer depuis ce PC</summary>') +
    uiLocale.html('<p>Le fichier et son image 2D seront enregistrés sur le serveur.</p>') +
    uiLocale.html('<label for="library-input">Fichier G-code — 20 Mo maximum</label>') +
    uiLocale.html('<input id="library-input" type="file" accept=".nc,.gcode,.tap,.ngc,.cnc,.txt">') +
    uiLocale.html('<button id="library-send" class="library-primary" type="button" disabled>Envoyer à la bibliothèque</button>') +
    uiLocale.html('<button id="library-cancel" type="button" hidden>Annuler la préparation</button>') +
    uiLocale.html('<p id="library-upload-status" role="status">Aucun fichier choisi.</p></details></div>') +
    uiLocale.html('<div class="card library-detail"><div class="library-eyebrow">FICHIER SÉLECTIONNÉ</div>') +
    uiLocale.html('<h2 id="library-name">Sélectionnez un fichier</h2>') +
    uiLocale.html('<p id="library-selection-state" class="library-selection-state"></p>') +
    uiLocale.html('<p id="library-meta" class="mute"></p>') +
    uiLocale.html('<div class="library-image-wrap"><img id="library-image" alt="Aperçu du parcours XY" hidden>') +
    uiLocale.html('<p id="library-image-status">L’aperçu 2D apparaîtra ici.</p></div>') +
    uiLocale.html('<p id="library-preview-note" class="mute"></p>') +
    uiLocale.html('<div id="library-dimensions-content" hidden><p id="library-dimensions-file"></p>') +
    uiLocale.html('<p id="library-dimensions-status" role="status">Sélectionnez un fichier dans la bibliothèque.</p>') +
    uiLocale.html('<table id="library-dimensions-table" class="ks-dimensions-table" hidden><thead><tr><th scope="col">Axe</th><th scope="col">Minimum</th><th scope="col">Maximum</th><th scope="col">Étendue</th></tr></thead>') +
    uiLocale.html('<tbody><tr><th scope="row">X</th><td id="library-dimensions-xmin"></td><td id="library-dimensions-xmax"></td><td id="library-dimensions-width"></td></tr>') +
    uiLocale.html('<tr><th scope="row">Y</th><td id="library-dimensions-ymin"></td><td id="library-dimensions-ymax"></td><td id="library-dimensions-height"></td></tr>') +
    uiLocale.html('<tr id="library-dimensions-zrow" hidden><th scope="row">Z</th><td id="library-dimensions-zmin"></td><td id="library-dimensions-zmax"></td><td id="library-dimensions-depth"></td></tr></tbody></table>') +
    uiLocale.html('<p>Trajets rapides G0 inclus. Départ supposé X0 Y0 Z0. Projection approximative : ce ne sont pas les dimensions de la pièce. Z minimum = passe la plus profonde, sous Z0 si négatif.</p></div>') +
    uiLocale.html('<div id="library-project" class="library-project"></div>') +
    uiLocale.html('<button id="library-regenerate" type="button" disabled>Régénérer l’aperçu depuis ce PC</button>') +
    uiLocale.html('<p id="library-regenerate-status" role="status"></p>') +
    uiLocale.html('<div class="library-execution"><strong>Stocké pour plus tard</strong>') +
    uiLocale.html('<p>L’envoi et la sélection ne démarrent pas la machine.</p>') +
    uiLocale.html('<button type="button" disabled>Exécution — prochaine étape</button></div></div>');

  var $ = function (id) { return document.getElementById(id); };
  // The preview's note and refusals are stored in French (sidecar): shown in the interface language.
  function previewText(text) { var p = window.CNCLibraryPreview; return p && typeof p.localize === 'function' ? p.localize(text, window.cncI18n ? window.cncI18n.language : 'fr') : text; }
  var files = [], selected = '', detailVersion = '', requestId = 0;
  var refreshing = false, busy = false, generation = 0, reader = null, pageSize = 4, page = 0;
  var mounted = false, refreshId = 0, refreshAgain = 0, refreshPromise = null, requests = {}, rows = Object.create(null), listKey = '', deferredText = {}, detailLoading = false;
  var regenerating = false, regenerationId = 0;
  var machine = null, fileStateKey = '', listState = 'loading', listSignature = '';
  var suffix = '.cnctouch.json';
  // Project sheets (projects.js, loaded after this file): extended search, favourites, row labels.
  var favoritesOnly = false;
  function projects() { return window.CNCProjects || null; }
  function visible() { return !document.hidden && screen.classList.contains('active'); }
  function setText(id, value) {
    value = String(value);
    if (!visible()) { deferredText[id] = value; return; }
    var el = $(id); if (el.textContent !== value) el.textContent = value;
  }
  function property(el, key, value) { if (el[key] !== value) el[key] = value; }
  function attribute(el, key, value) { if (el.getAttribute(key) !== value) el.setAttribute(key, value); }
  function cancelRequest(kind) {
    var xhr = requests[kind]; delete requests[kind];
    if (xhr && typeof xhr.abort === 'function') xhr.abort();
  }
  function cancelRegeneration() {
    regenerationId++; regenerating = false;
    cancelRequest('regenerate');
  }
  function previewChanged(file) { window.dispatchEvent(new CustomEvent('cnc-library-preview-updated', { detail: { file: file } })); }
  function publishSelection(file, name) {
    var previous = window.cncLibrarySelection;
    if (previous && previous.file === file && previous.name === name || !previous && !file) return;
    window.cncLibrarySelection = file ? { file: file, name: name } : null;
    window.dispatchEvent(new CustomEvent('cnc-library-select', { detail: window.cncLibrarySelection }));
  }
  function auth() {
    try { var d = JSON.parse(localStorage.getItem('cnc') || '{}'); return d.state.session.token || ''; }
    catch (_) { return ''; }
  }
  // API base of this CNCjs installation, derived from the page's path by cnc-state.js
  // (CNCjs may be served under a route prefix such as /cnc/).
  function apiBase() { try { return window.cncState.get().apiBase; } catch (_) { return '/api'; } }
  var pendingUpload = '', pendingUntil = 0;
  // Resolves with the parsed JSON, or for a Blob response with { blob, fingerprint, size }:
  // the server names the exact bytes it served in headers the Blob cannot carry.
  function request(method, path, body, kind, cancelled, responseBlob) {
    return new Promise(function (resolve, reject) {
      if (cancelled && cancelled()) { reject(new Error(uiLocale.t('Lecture annulée.'))); return; }
      var token = auth();
      if (!token) { reject(new Error(uiLocale.t('Ouvrez CNCjs à la racine du serveur pour établir la session, puis rechargez cette page.'))); return; }
      var xhr = new XMLHttpRequest();
      if (kind) requests[kind] = xhr;
      function done() { if (kind && requests[kind] === xhr) delete requests[kind]; }
      function header(name) { try { return xhr.getResponseHeader(name) || ''; } catch (_) { return ''; } }
      xhr.open(method, apiBase() + '/watch/' + path, true);
      if (responseBlob) {
        try {
          xhr.responseType = 'blob';
          if (xhr.responseType !== 'blob') throw new Error('Blob indisponible');
        } catch (_) { done(); reject(new Error(uiLocale.t('Lecture binaire indisponible : utilisez un navigateur compatible pour régénérer l’aperçu.'))); return; }
      }
      xhr.setRequestHeader('Authorization', 'Bearer ' + token);
      xhr.timeout = 120000;
      // A Blob with a type (a raw upload, application/octet-stream) goes out as it is; everything else is JSON.
      if (body) xhr.setRequestHeader('Content-Type', typeof Blob !== 'undefined' && body instanceof Blob && body.type ? body.type : 'application/json');
      xhr.onload = function () {
        done();
        // A completed obsolete read must not parse a potentially large G-code response.
        if (cancelled && cancelled()) { reject(new Error(uiLocale.t('Lecture annulée.'))); return; }
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error(xhr.status === 401 || xhr.status === 403 ? uiLocale.t('Session expirée : ouvrez CNCjs et reconnectez-vous.') : uiLocale.t('Le serveur a refusé la demande (HTTP ') + xhr.status + ').')); return;
        }
        if (responseBlob) { resolve({ blob: xhr.response, fingerprint: header('X-Program-Fingerprint'), size: Number(header('X-Program-Size')) || 0 }); return; }
        try { resolve(JSON.parse(xhr.responseText)); } catch (_) { reject(new Error(uiLocale.t('Réponse du serveur illisible.'))); }
      };
      xhr.onerror = function () { done(); reject(new Error(uiLocale.t('Serveur inaccessible. Vérifiez la connexion réseau.'))); };
      xhr.ontimeout = function () { done(); reject(new Error(uiLocale.t('Le serveur ne répond pas. Actualisez la liste avant de réessayer.'))); };
      xhr.onabort = function () { done(); reject(new Error(uiLocale.t('Lecture annulée.'))); };
      xhr.send(body ? (typeof Blob !== 'undefined' && body instanceof Blob ? body : JSON.stringify(body)) : null);
    });
  }
  function size(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + uiLocale.t(' Mo') : Math.max(1, Math.ceil(n / 1024)) + uiLocale.t(' Ko'); }
  function displayName(name) { return name.replace(/--touch-\d{14}-[a-f0-9]{16}(?=\.[^.]+$)/, ''); }
  // Whether a stored preview describes the program on the server. The server compares the
  // sidecar's fingerprint with the file and answers `preview: {stale, reason}` beside the data;
  // a stale preview is never shown, and one the server did not check (older server) is shown
  // only as unverified. Returns { state: 'ok' | 'stale' | 'unverified', reason }.
  function verdict(response, meta) {
    var p = response && response.preview;
    if (p && typeof p === 'object') return p.stale ? { state: 'stale', reason: String(p.reason || '') } : { state: 'ok', reason: '' };
    if (meta && meta.preview && meta.preview.stale) return { state: 'stale', reason: String(meta.preview.reason || '') };
    return { state: 'unverified', reason: 'unverified' };
  }
  function previewNotice(v) {
    if (v.reason === 'no-fingerprint') return uiLocale.t('Aperçu sans empreinte (ancienne version) : régénérez-le depuis le PC.');
    if (v.reason === 'program-missing') return uiLocale.t('Fichier G-code introuvable sur le serveur : actualisez la liste.');
    if (v.state === 'unverified') return uiLocale.t('Aperçu non vérifié par le serveur : régénérez-le depuis le PC.');
    return uiLocale.t('Aperçu périmé : régénérez-le depuis le PC.');
  }
  function dimensions(bounds, message, zBounds, note) {
    var fields = ['xmin', 'ymin', 'xmax', 'ymax', 'width', 'height'];
    var valid = Array.isArray(bounds) && bounds.length === 4 && bounds.every(function (n) { return typeof n === 'number' && isFinite(n); }) &&
      bounds[2] >= bounds[0] && bounds[3] >= bounds[1] && isFinite(bounds[2] - bounds[0]) && isFinite(bounds[3] - bounds[1]);
    // Depth (previews made since the 3D path): the deepest and highest Z of the program.
    var depth = valid && Array.isArray(zBounds) && zBounds.length === 2 && zBounds.every(function (n) { return typeof n === 'number' && isFinite(n); }) && zBounds[1] >= zBounds[0];
    property($('library-dimensions-table'), 'hidden', !valid);
    property($('library-dimensions-zrow'), 'hidden', !depth);
    setText('library-dimensions-status', valid ? note || uiLocale.t('D’après l’aperçu enregistré · en millimètres') : message || uiLocale.t('Dimensions indisponibles. Régénérez l’aperçu depuis le PC via « Détails de l’aperçu ».'));
    var values = valid ? bounds.concat([bounds[2] - bounds[0], bounds[3] - bounds[1]]) : [];
    function mm(value) { return (Math.abs(value) < 0.005 ? 0 : value).toLocaleString(window.cncI18n?window.cncI18n.locale:'fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    fields.forEach(function (field, i) { setText('library-dimensions-' + field, valid ? mm(values[i]) : '—'); });
    setText('library-dimensions-zmin', depth ? mm(zBounds[0]) : '—');
    setText('library-dimensions-zmax', depth ? mm(zBounds[1]) : '—');
    setText('library-dimensions-depth', depth ? mm(zBounds[1] - zBounds[0]) : '—');
  }
  // What the 3D views and the tool marker read: the stored preview of the file whose image is
  // shown, with the fingerprint of the program it was drawn from (the 3D views are kept per
  // fingerprint; without one they are not drawn).
  function describe(file, preview, fingerprint) {
    $('library-image').cncPreview = preview ? { file: file, fingerprint: typeof fingerprint === 'string' ? fingerprint : '', projection: preview.projection, zBounds: preview.zBounds, path3d: preview.path3d || null, estimate: preview.estimate || null, laser: preview.laser || null } : null;
  }
  // Row thumbnails and XY extents come from each file's stored preview, read one
  // at a time in idle time after the list is drawn (never before the selected
  // file's own detail), and cached per file version. Without requestIdleCallback
  // (tests, very old browsers) rows simply show no thumbnail.
  var thumbs = Object.create(null), thumbBusy = false, thumbIdle = null;
  function thumbKey(f) { return f.name + ':' + (f.previewMtime || ''); }
  function rowInfo(f, bounds) {
    var valid = Array.isArray(bounds) && bounds.length === 4 && bounds.every(function (n) { return typeof n === 'number' && isFinite(n); }) && bounds[2] >= bounds[0] && bounds[3] >= bounds[1];
    var extent = valid ? Math.round(bounds[2] - bounds[0]) + ' × ' + Math.round(bounds[3] - bounds[1]) + ' mm · ' : '';
    return extent + size(f.size) + ' · ' + new Date(f.mtime).toLocaleString(window.cncI18n ? window.cncI18n.locale : 'fr-FR');
  }
  function scheduleThumbs() {
    if (typeof requestIdleCallback !== 'function' || thumbIdle !== null) return;
    // Only in a real idle period (parsing a stored preview can take a few hundred ms on
    // the tablet): never with a timeout, so a screen opening is never delayed by it.
    // A short idle period is retried half a second later (never in a loop of idle callbacks),
    // and nothing is retried once Fichiers is left: mount() schedules again.
    thumbIdle = requestIdleCallback(function (deadline) {
      thumbIdle = null;
      if (!visible()) return;
      if (deadline && typeof deadline.timeRemaining === 'function' && deadline.timeRemaining() < 45) {
        thumbIdle = setTimeout(function () { thumbIdle = null; scheduleThumbs(); }, 500); return;
      }
      nextThumb();
    });
  }
  function nextThumb() {
    if (thumbBusy || !visible() || detailLoading) { if (detailLoading) scheduleThumbs(); return; }
    var row = null, names = Object.keys(rows);
    for (var i = 0; i < names.length && !row; i++) { var candidate = rows[names[i]], f = candidate._file; if (f && f.previewMtime && !thumbs[thumbKey(f)]) row = candidate; }
    if (!row) return;
    var file = row._file, key = thumbKey(file);
    if (Object.keys(thumbs).length > 40) thumbs = Object.create(null);
    thumbBusy = true;
    // Only the row's part of the sidecar: the stored 192 × 108 thumbnail and the extents
    // (tens of kB) instead of the full image, trail and 3D path (about 1 MB). A sidecar
    // from before thumbnails still answers with its full image, downscaled here.
    request('POST', 'file', { file: file.name + suffix, part: 'thumbnail' }, 'thumb').then(function (response) {
      var meta = JSON.parse(response.data), p = meta && meta.file === file.name && verdict(response, meta).state !== 'stale' && meta.preview || {};
      var bounds = Array.isArray(p.bounds) ? p.bounds : null;
      if (typeof p.thumbnail === 'string' && p.thumbnail.length <= 120000 && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(p.thumbnail)) { thumbs[key] = { image: p.thumbnail, bounds: bounds }; return undefined; }
      var image = typeof p.image === 'string' && p.image.length <= 2500000 && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(p.image) ? p.image : '';
      // The stored preview is 960 × 540: a 192 × 108 copy is kept for the row, so the
      // list never decodes five full previews when it is shown again.
      return downscale(image).then(function (small) { thumbs[key] = { image: small, bounds: bounds }; });
    }).catch(function () { thumbs[key] = { image: '', bounds: null }; }).then(function () { thumbBusy = false; applyThumbs(); scheduleThumbs(); });
  }
  function downscale(image) {
    return new Promise(function (resolve) {
      if (!image || typeof Image !== 'function') { resolve(''); return; }
      var im = new Image();
      im.onload = function () { try { var c = document.createElement('canvas'); c.width = 192; c.height = 108; c.getContext('2d').drawImage(im, 0, 0, 192, 108); resolve(c.toDataURL('image/png')); } catch (_) { resolve(''); } };
      im.onerror = function () { resolve(''); };
      im.src = image;
    });
  }
  // A new sidecar carries its row thumbnail (192 × 108, about 10-30 kB): the list then
  // reads only that part (`part: 'thumbnail'`) and decodes no full preview. Without
  // Image/canvas (tests) the sidecar simply has none and rows fall back to the image.
  function withThumbnail(preview) {
    return downscale(preview && preview.image).then(function (small) {
      if (small && small.length <= 120000) preview.thumbnail = small;
    });
  }
  function applyThumbs() {
    if (!visible()) return;
    Object.keys(rows).forEach(function (name) {
      var row = rows[name], f = row._file, t = f && thumbs[thumbKey(f)];
      if (!t || !row._img) return;
      if (t.image) { if (row._img.getAttribute('src') !== t.image) row._img.setAttribute('src', t.image); property(row._img, 'hidden', false); }
      else property(row._img, 'hidden', true);
      property(row._info, 'textContent', rowInfo(f, t.bounds));
    });
  }
  function selectedRow() {
    if (!visible()) return;
    Object.keys(rows).forEach(function (key) {
      var label = fileState(key);
      attribute(rows[key], 'aria-pressed', key === selected ? 'true' : 'false');
      property(rows[key]._state, 'textContent', label);
      property(rows[key]._state, 'hidden', !label);
    });
    setText('library-selection-state', selected ? fileState(selected) + (!machine || !machine.fresh ? uiLocale.t(' · État chargé indisponible') : '') : '');
  }
  function fileState(name) {
    var labels = name === selected ? [uiLocale.t('✓ Sélectionné')] : [];
    if (machine && machine.fresh && machine.name === name) {
      labels.push(/^Alarm/.test(machine.activeState || '') ? uiLocale.t('! Alarme · chargé') :
        machine.workflow === 'paused' || /^Hold/.test(machine.activeState || '') ? uiLocale.t('Ⅱ En pause') :
        machine.workflow === 'running' || /^Run/.test(machine.activeState || '') ? uiLocale.t('▶ En cours') : uiLocale.t('● Chargé'));
    }
    var P = projects(), project = P ? P.label(name) : '';
    if (project) labels.push(project);
    return labels.join(' · ');
  }
  // Only the rows that fit are listed: a row half hidden at the bottom of the list (under the
  // pages) can be neither read nor tapped reliably. The shell gives the upper bound (5 or 3 rows);
  // the tallest row seen in this window and text size decides, read once in the next frame.
  // The selected row may be taller (its state chip narrows the text), so it is counted apart.
  var pageLimit = pageSize, rowHeight = 0, selectedHeight = 0, rowLarge = null, fitFrame = 0;
  function fitPage() {
    fitFrame = 0;
    if (!visible()) return;
    var list = $('library-list'), large = document.body.classList.contains('display-large');
    if (large !== rowLarge) { rowLarge = large; rowHeight = 0; selectedHeight = 0; }
    var cs = window.getComputedStyle(list), gap = parseFloat(cs.rowGap) || 0;
    var height = list.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
    Array.prototype.forEach.call(list.children, function (row) {
      if (!/(^|\s)library-file(\s|$)/.test(row.className || '')) return;
      if (row.getAttribute('aria-pressed') === 'true') selectedHeight = Math.max(selectedHeight, row.offsetHeight); else rowHeight = Math.max(rowHeight, row.offsetHeight);
    });
    var tallest = Math.max(rowHeight, selectedHeight), usual = rowHeight || selectedHeight;
    if (!usual || height <= 0) return;
    var size = Math.max(2, Math.min(pageLimit, 1 + Math.floor((height - tallest) / (usual + gap))));
    if (size !== pageSize) { page = Math.floor(page * pageSize / size); pageSize = size; renderList(); }
  }
  // Without a rendering frame (no layout to read) the shell's size is kept.
  function schedulePageFit() { if (!fitFrame && typeof window.requestAnimationFrame === 'function' && typeof window.getComputedStyle === 'function') fitFrame = window.requestAnimationFrame(fitPage); }
  function renderList() {
    if (!visible()) return;
    schedulePageFit();
    var query = $('library-search').value.toLowerCase(), P = projects();
    // The name search is unchanged; a file whose project sheet matches is found too.
    var matches = files.filter(function (f) {
      if (favoritesOnly && !(P && P.isFavorite(f.name))) return false;
      return displayName(f.name).toLowerCase().indexOf(query) >= 0 || !!(P && query && P.matches(f.name, query));
    });
    page=Math.min(page,Math.max(0,Math.ceil(matches.length/pageSize)-1));
    var shown = matches.slice(page*pageSize, (page+1)*pageSize);
    var key = JSON.stringify([shown, files.length, matches.length, query, page, pageSize, selected, listState, favoritesOnly, P ? P.revision() : 0]);
    if (key === listKey) { selectedRow(); return; } listKey = key;
    var list = $('library-list'), desired = [], keep = Object.create(null), focused = document.activeElement;
    setText('library-count', files.length);
    shown.forEach(function (f) {
      var button = rows[f.name];
      if (!button) {
        button = document.createElement('button'); button.type = 'button'; button.className = 'library-file'; button.setAttribute('data-file', f.name);
        // Thumbnail (the stored preview, loaded in idle time), name, then size and date.
        button._thumb = document.createElement('span'); button._thumb.className = 'library-thumb';
        button._img = document.createElement('img'); button._img.alt = ''; button._img.hidden = true; button._thumb.appendChild(button._img);
        button._name = document.createElement('strong'); button._info = document.createElement('span');
        button._state = document.createElement('span'); button._state.className = 'library-file-state';
        var text = document.createElement('div'); text.className = 'library-row-text';
        var meta = document.createElement('div'); meta.className = 'library-row-meta';
        meta.appendChild(button._info); text.appendChild(button._name); text.appendChild(meta);
        button.appendChild(button._thumb); button.appendChild(text); button.appendChild(button._state);
        button.addEventListener('click', function () { select(button._file, false); });
        rows[f.name] = button;
      }
      button._file = f;
      property(button._name, 'textContent', displayName(f.name));
      var known = thumbs[thumbKey(f)];
      property(button._info, 'textContent', rowInfo(f, known && known.bounds));
      desired.push(button); keep[f.name] = true;
    });
    applyThumbs(); scheduleThumbs();
    if (!desired.length) {
      var empty = list._empty || (list._empty = document.createElement('p'));
      property(empty, 'textContent', files.length ? uiLocale.t('Aucun résultat.') : listState === 'loading' ? uiLocale.t('Chargement de la liste…') :
        listState === 'error' ? uiLocale.t('Liste indisponible. Utilisez Actualiser pour réessayer.') : uiLocale.t('La bibliothèque est vide. Envoyez un premier fichier depuis le PC.')); desired.push(empty);
    }
    desired.forEach(function (node, i) { if (list.children[i] !== node) list.insertBefore(node, list.children[i] || null); });
    while (list.children.length > desired.length) list.removeChild(list.lastChild);
    if (focused && list.contains(focused) && document.activeElement !== focused) focused.focus({ preventScroll: true });
    Object.keys(rows).forEach(function (name) { if (!keep[name]) delete rows[name]; });
    property($('library-more'), 'hidden', (page+1)*pageSize >= matches.length);
    property($('library-prev'), 'hidden', page === 0);
    setText('library-page', matches.length?uiLocale.t('Page ')+(page+1)+' / '+Math.ceil(matches.length/pageSize):'');
    selectedRow();
  }
  function select(f, force) {
    var version = f.name + ':' + f.mtime + ':' + f.size + ':' + (f.previewMtime || '');
    if (!force && version === detailVersion) return;
    var changedPreview = selected === f.name && !!detailVersion && (force || version !== detailVersion);
    cancelRequest('detail');
    if (selected !== f.name) { cancelRegeneration(); setText('library-regenerate-status', ''); }
    selected = f.name; detailVersion = version; detailLoading = true; var id = ++requestId;
    var previous = window.cncLibrarySelection;
    publishSelection(f.name, previous && previous.file === f.name ? previous.name : displayName(f.name));
    if (changedPreview) previewChanged(f.name);
    $('library-regenerate').disabled = false;
    selectedRow();
    $('library-name').textContent = displayName(f.name);
    $('library-dimensions-file').textContent = displayName(f.name);
    dimensions(null, uiLocale.t('Chargement des dimensions enregistrées…'));
    $('library-meta').textContent = size(f.size) + ' · ' + new Date(f.mtime).toLocaleString(window.cncI18n?window.cncI18n.locale:'fr-FR');
    $('library-image').hidden = true; $('library-image').removeAttribute('src'); describe(f.name, null);
    $('library-image-status').hidden = false; $('library-image-status').textContent = uiLocale.t('Chargement de l’image…');
    $('library-preview-note').textContent = '';
    v2Selected({ file: f.name, name: displayName(f.name), mtime: f.mtime, bounds: null, zBounds: null, fingerprint: '', verdict: 'loading' });
    request('POST', 'file', { file: f.name + suffix }, 'detail').then(function (response) {
      if (id !== requestId) return;
      var meta = JSON.parse(response.data);
      if (meta.version !== 1 || meta.file !== f.name || typeof meta.originalName !== 'string') throw new Error(uiLocale.t('Métadonnées non reconnues'));
      publishSelection(f.name, meta.originalName);
      $('library-name').textContent = meta.originalName;
      $('library-dimensions-file').textContent = meta.originalName;
      // The server's verdict on the sidecar: a stale preview (program replaced under the same
      // name, older sidecar without fingerprint) shows a notice instead of the old image.
      var v = verdict(response, meta), usable = v.state !== 'stale', note = v.state === 'unverified' ? previewNotice(v) : '';
      v2Selected({ file: f.name, name: meta.originalName, mtime: f.mtime, bounds: usable && meta.preview ? meta.preview.bounds : null, zBounds: usable && meta.preview ? meta.preview.zBounds : null,
        fingerprint: typeof meta.fingerprint === 'string' ? meta.fingerprint : '', verdict: v.state });
      dimensions(usable && meta.preview && meta.preview.bounds, usable ? null : previewNotice(v), usable && meta.preview && meta.preview.zBounds, note);
      var image = usable && meta.preview && meta.preview.image;
      if (!usable) { detailLoading = false; $('library-image-status').textContent = previewNotice(v); }
      else if (typeof image === 'string' && image.length <= 2500000 && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(image)) {
        describe(f.name, meta.preview, meta.fingerprint);
        $('library-image').onload = function () {
          if (id !== requestId) return;
          detailLoading = false;
          $('library-image').hidden = false; $('library-image-status').hidden = !note;
          if (note) $('library-image-status').textContent = note;
        };
        $('library-image').onerror = function () {
          if (id !== requestId) return;
          detailLoading = false;
          $('library-image').hidden = true; $('library-image-status').hidden = false;
          $('library-image-status').textContent = uiLocale.t('Image illisible. Le G-code reste enregistré.');
        };
        $('library-image').src = image;
        $('library-preview-note').textContent = previewText(String(meta.preview.note || '')) + ' · ' + Number(meta.preview.segments || 0).toLocaleString(window.cncI18n?window.cncI18n.locale:'fr-FR') + uiLocale.t(' segments.');
      } else { detailLoading = false; $('library-image-status').textContent = uiLocale.t('Aperçu indisponible : ') + (meta.previewError ? previewText(String(meta.previewError)) : uiLocale.t('aucune image enregistrée')) + uiLocale.t('. Le G-code reste disponible.'); }
    }).catch(function () {
      if (id !== requestId) return;
      detailLoading = false;
      detailVersion = ''; // Retry a sidecar still being uploaded at the next refresh.
      v2Selected({ file: f.name, name: displayName(f.name), mtime: f.mtime, bounds: null, zBounds: null, fingerprint: '', verdict: 'unavailable' });
      dimensions(null);
      $('library-image-status').textContent = uiLocale.t('Aucune image disponible pour ce fichier. Envoyez-le depuis cette interface pour créer son aperçu.');
    });
  }
  function refresh(manual) {
    if (!visible()) { refreshAgain = Math.max(refreshAgain, manual ? 2 : 1); return Promise.resolve(); }
    if (refreshing) { refreshAgain = Math.max(refreshAgain, manual ? 2 : 1); return refreshPromise; }
    // Re-opening Fichiers checks a list already shown without touching the screen: the
    // status and the rows are only written again when the answer differs (each write
    // makes the tablet lay the whole screen out again).
    var quiet = !manual && listState === 'ready';
    refreshing = true;
    if (!quiet) { listState = 'loading'; renderList(); setText('library-status', uiLocale.t('Actualisation de la bibliothèque…')); }
    var id = ++refreshId;
    refreshPromise = request('GET', 'status', null, 'list').then(function (status) {
      if (id !== refreshId) return null;
      if (!status.configured) throw new Error(uiLocale.t('Le dossier partagé CNCjs n’est pas encore configuré.'));
      return request('POST', 'files', { path: '' }, 'list');
    }).then(function (response) {
      if (id !== refreshId || !response) return;
      var all = response.files || [];
      files = all.filter(function (f) { return f.type === 'f' && /\.(nc|gcode|tap|ngc|cnc|txt)$/i.test(f.name); });
      var previews = {};
      all.forEach(function (f) { if (f.name.slice(-suffix.length) === suffix) previews[f.name.slice(0, -suffix.length)] = f.mtime; });
      files.forEach(function (f) { f.previewMtime = previews[f.name] || ''; });
      files.sort(function (a, b) { return new Date(b.mtime) - new Date(a.mtime) || a.name.localeCompare(b.name); });
      var signature = JSON.stringify(files), unchanged = quiet && signature === listSignature; listSignature = signature;
      listState = 'ready'; renderList();
      if (!unchanged) setText('library-status', uiLocale.t('À jour · ') + new Date().toLocaleTimeString(window.cncI18n?window.cncI18n.locale:'fr-FR', { hour: '2-digit', minute: '2-digit' }));
      var f = files.filter(function (item) { return item.name === selected; })[0];
      // A file just uploaded appears in CNCjs's list a few seconds later: keep it
      // selected meanwhile instead of falling back to another file.
      if (f && f.name === pendingUpload) pendingUpload = '';
      var waited = !f && selected && selected === pendingUpload;
      if (waited && Date.now() < pendingUntil) return;
      // Still not listed after that: clear the selection rather than silently
      // selecting another file, which could then be loaded by mistake.
      if (waited) pendingUpload = '';
      // Only an empty selection defaults to the newest file: a selected file that disappeared
      // (deleted, renamed) clears the selection too.
      f = f || (waited || selected ? null : files[0]);
      if (f) select(f, !!manual);
      else {
        if (selected) { cancelRegeneration(); setText('library-regenerate-status', ''); }
        selected = ''; detailVersion = ''; detailLoading = false; requestId++;
        selectedRow();
        cancelRequest('detail');
        publishSelection(null); v2Selected(null);
        $('library-regenerate').disabled = true;
        $('library-name').textContent = uiLocale.t('Sélectionnez un fichier'); $('library-meta').textContent = '';
        $('library-dimensions-file').textContent = '';
        dimensions(null, uiLocale.t('Sélectionnez un fichier dans la bibliothèque.'));
        $('library-image').hidden = true; $('library-image-status').hidden = false;
        $('library-image-status').textContent = uiLocale.t('L’aperçu 2D apparaîtra ici.'); $('library-preview-note').textContent = '';
      }
    }).catch(function (error) { if (id === refreshId) { listState = 'error'; renderList(); setText('library-status', error.message); } }).then(function () {
      if (id !== refreshId) return;
      refreshing = false; refreshPromise = null;
      var again = refreshAgain; refreshAgain = 0;
      if (again) return refresh(again === 2);
    });
    return refreshPromise;
  }
  function lock(value) {
    busy = value; property($('library-input'), 'disabled', value);
    property($('library-send'), 'disabled', value || !$('library-input').files.length);
    property($('library-cancel'), 'hidden', !value);
  }
  function safeName(name) {
    var extension = (name.match(/\.[^.]+$/) || ['.nc'])[0].toLowerCase();
    var base = name.slice(0, -extension.length).replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 90) || 'fichier';
    var bytes = new Uint8Array(8), random = '';
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (var i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    for (var j = 0; j < bytes.length; j++) random += ('0' + bytes[j].toString(16)).slice(-2);
    return base + '--touch-' + new Date().toISOString().replace(/\D/g, '').slice(0, 14) + '-' + random + extension;
  }
  function readAs(file, encoding) {
    return new Promise(function (resolve, reject) {
      reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { reject(new Error(uiLocale.t('Lecture du fichier impossible.'))); };
      reader.onabort = function () { reject(new Error(uiLocale.t('Annulé'))); };
      if (encoding) reader.readAsText(file, encoding); else reader.readAsText(file);
    });
  }
  // Read as UTF-8; a file that is not valid UTF-8 (U+FFFD replacements, typically
  // an older CAM writing Latin-1 comments) is read again as Windows-1252.
  // Resolves with { text, legacy }.
  function read(file) {
    if (typeof file.text === 'string') return Promise.resolve({ text: file.text, legacy: false }); // generated in the page (commissioning test file)
    return readAs(file).then(function (text) {
      if (text.indexOf('�') < 0) return { text: text, legacy: false };
      return readAs(file, 'windows-1252').then(function (legacy) {
        // EF BF BD read as Windows-1252: the file was valid UTF-8 holding a real U+FFFD.
        return legacy.indexOf('ï¿½') >= 0 ? { text: text, legacy: false } : { text: legacy, legacy: true };
      });
    });
  }
  $('library-input').addEventListener('change', function () {
    var f = this.files[0]; $('library-send').disabled = !f;
    $('library-upload-status').textContent = f ? f.name + ' · ' + size(f.size) : uiLocale.t('Aucun fichier choisi.');
  });
  $('library-cancel').addEventListener('click', function () {
    generation++;
    if (reader && reader.readyState === 1) reader.abort();
    lock(false); $('library-upload-status').textContent = uiLocale.t('Préparation annulée. Aucun fichier envoyé.');
  });
  // Stores a G-code and its 2D preview in the library; resolves with the stored name.
  function send(file) {
    if (!file || busy) return Promise.reject(new Error(uiLocale.t('Un envoi est déjà en cours.')));
    if (!/\.(nc|gcode|tap|ngc|cnc|txt)$/i.test(file.name) || !file.size || file.size > 20 * 1048576) {
      $('library-upload-status').textContent = uiLocale.t('Choisissez un G-code non vide de 20 Mo maximum.'); return Promise.reject(new Error($('library-upload-status').textContent));
    }
    var current = ++generation, text = '', stored = safeName(file.name), wrote = false, legacy = false;
    var meta = { version: 1, file: stored, originalName: file.name, bytes: file.size, createdAt: new Date().toISOString() };
    function cancelled() { return current !== generation; }
    function status(s) { if (!cancelled()) setText('library-upload-status', s); }
    lock(true); status(uiLocale.t('Lecture du fichier…'));
    return read(file).then(function (data) {
      if (cancelled()) throw new Error(uiLocale.t('Annulé'));
      text = data.text; legacy = data.legacy;
      if (/\x00/.test(text)) throw new Error(uiLocale.t('Ce fichier semble binaire. Un G-code texte est attendu.'));
      return window.CNCLibraryPreview.render(text, document.createElement('canvas'), cancelled, status).then(function (preview) {
        if (preview.image.length > 2500000) { meta.previewError = uiLocale.t('image trop volumineuse'); return undefined; }
        meta.preview = preview;
        return withThumbnail(preview);
      }).catch(function (error) { if (cancelled()) throw error; meta.previewError = error.message; });
    }).then(function () {
      if (cancelled()) throw new Error(uiLocale.t('Annulé'));
      $('library-cancel').hidden = true; // Once the server write starts, report its actual outcome.
      status(uiLocale.t('Envoi du G-code au serveur…'));
      // The bytes themselves (application/octet-stream, the name in the query): the server
      // streams them to disk instead of parsing a JSON body holding the whole program (which
      // the tablet's CPU did for up to 20 MB). A Windows-1252 file was decoded above and goes
      // out as UTF-8, as before.
      var payload = new Blob([text], { type: 'application/octet-stream' });
      text = '';
      return request('PUT', 'file?file=' + encodeURIComponent(stored), payload);
    }).then(function (written) {
      wrote = true; text = ''; status(uiLocale.t('Enregistrement de l’image 2D…'));
      // The sidecar names the exact bytes the server wrote (fingerprint and size): once the
      // program is replaced under this name, the server serves this preview as stale.
      if (written && typeof written.fingerprint === 'string' && written.fingerprint) { meta.fingerprint = written.fingerprint; meta.size = written.size; }
      return request('PUT', 'file?file=' + encodeURIComponent(stored + suffix), new Blob([JSON.stringify(meta)], { type: 'application/octet-stream' }));
    }).then(function () {
      if (selected !== stored) { cancelRegeneration(); setText('library-regenerate-status', ''); }
      selected = stored; pendingUpload = stored; pendingUntil = Date.now() + 15000; detailVersion = ''; $('library-input').value = ''; lock(false);
      publishSelection(stored, file.name);
      // Until CNCjs lists the new file (about 4 s), the card shows it from what was just
      // written: the file named here is the one that "Charger" loads.
      cancelRequest('detail'); requestId++; detailLoading = false; selectedRow();
      $('library-name').textContent = file.name; $('library-dimensions-file').textContent = file.name;
      $('library-meta').textContent = size(file.size) + ' · ' + new Date().toLocaleString(window.cncI18n?window.cncI18n.locale:'fr-FR');
      dimensions(meta.preview && meta.preview.bounds, null, meta.preview && meta.preview.zBounds);
      // Just written: the server has not checked this sidecar against the file yet, so its fingerprint stays unverified.
      v2Selected({ file: stored, name: file.name, mtime: new Date().toISOString(), bounds: meta.preview && meta.preview.bounds, zBounds: meta.preview && meta.preview.zBounds, fingerprint: meta.fingerprint || '', verdict: 'unverified' });
      var uploadedImage = meta.preview && meta.preview.image;
      $('library-image').onload = $('library-image').onerror = null;
      if (typeof uploadedImage === 'string' && uploadedImage) { describe(stored, meta.preview, meta.fingerprint); $('library-image').src = uploadedImage; $('library-image').hidden = false; $('library-image-status').hidden = true; }
      else { $('library-image').hidden = true; $('library-image').removeAttribute('src'); $('library-image-status').hidden = false;
        $('library-image-status').textContent = uiLocale.t('Aperçu indisponible : ') + (meta.previewError ? previewText(String(meta.previewError)) : uiLocale.t('aucune image enregistrée')) + uiLocale.t('. Le G-code reste disponible.'); }
      status('✓ ' + file.name + uiLocale.t(' enregistré. Disponible sur la tablette.') + (legacy ? uiLocale.t(' Fichier non UTF-8 : lu en Windows-1252 (accents convertis).') : '') + (meta.previewError ? uiLocale.t(' Aperçu indisponible : ') + previewText(String(meta.previewError)) : '') + (meta.fingerprint ? '' : uiLocale.t(' Serveur sans empreinte : l’aperçu sera signalé « à vérifier ».')));
      previewChanged(stored);
      // CNCjs's watch list sees a new file a few seconds after it is written
      // (measured: about 4 s on the tablet): look again a few times.
      [2000, 5000, 9000].forEach(function (delay) { setTimeout(function () { refresh(true); }, delay); });
      refresh(true);
      return stored;
    }).catch(function (error) {
      if (cancelled()) throw error;
      lock(false); status((wrote ? uiLocale.t('G-code enregistré, mais image non enregistrée. ') : uiLocale.t('Envoi non confirmé. ')) + error.message);
      refresh(true);
      throw error;
    });
  }
  $('library-send').addEventListener('click', function () { send($('library-input').files[0]).catch(function () {}); });
  // Adds a G-code generated in the page (commissioning air-cut test) to the library.
  window.cncLibraryImport = function (name, text) { return send({ name: name, size: text.length, text: String(text) }); };
  $('library-refresh').addEventListener('click', function () { refresh(true); });
  $('library-regenerate').addEventListener('click', function () {
    if (regenerating || !selected) return;
    var file = files.filter(function (f) { return f.name === selected; })[0];
    if (!file || file.size > 20 * 1048576) return;
    regenerating = true;
    var name = file.name, meta, current = ++regenerationId;
    function cancelled() { return current !== regenerationId || selected !== name; }
    function check() { if (cancelled()) throw new Error(uiLocale.t('Sélection modifiée : régénération annulée.')); }
    function status(value) { if (!cancelled()) setText('library-regenerate-status', value); }
    status(uiLocale.t('Lecture du fichier enregistré…'));
    request('POST', 'file', {file: name + suffix}, 'regenerate', cancelled).then(function (result) {
      check();
      try {meta = JSON.parse(result.data);} catch (_) {}
    }).catch(function (error) { if (cancelled()) throw error; }).then(function () {
      check();
      if (!meta || meta.file !== name) meta = {version:1, file:name, originalName:displayName(name), bytes:file.size};
      return request('POST', 'file', {file:name}, 'regenerate', cancelled, true);
    }).then(function (response) {
      check();
      // The server names the bytes it served; the new sidecar describes exactly those.
      if (!response.fingerprint) throw new Error(uiLocale.t('Empreinte du fichier absente : mettez le serveur CNCjs à jour.'));
      meta.fingerprint = response.fingerprint; meta.size = response.size;
      return window.CNCLibraryPreview.renderResponse(response.blob, document.createElement('canvas'), cancelled, status);
    }).then(function (preview) {
      check();
      if (preview.image.length > 2500000) throw new Error(uiLocale.t('Image trop volumineuse.'));
      meta.preview = preview; delete meta.previewError; meta.previewVersion = 2;
      return withThumbnail(preview);
    }).then(function () {
      check();
      return request('POST', 'files', {path:''}, 'regenerate', cancelled);
    }).then(function (result) {
      check();
      var current = result.files.filter(function (f) {return f.name === name;})[0];
      if (!current || current.mtime !== file.mtime || current.size !== file.size || cancelled()) throw new Error(uiLocale.t('Fichier ou sélection modifiés : relancez la régénération.'));
      // Once transmitted, this write is allowed to finish even if selection changes.
      return request('PUT', 'file?file=' + encodeURIComponent(name + suffix), new Blob([JSON.stringify(meta)], { type: 'application/octet-stream' }));
    }).then(function () {
      if (selected === name) detailVersion = '';
      status(uiLocale.t('✓ Aperçu mis à jour sur le serveur, visible aussi sur la tablette.'));
      previewChanged(name);
      return refresh(false);
    }).catch(function (error) { status(uiLocale.t('Aperçu non modifié : ') + error.message); }).then(function () { if (current === regenerationId) regenerating = false; });
  });
  $('library-search').addEventListener('input', function () { page = 0; renderList(); });
  $('library-more').addEventListener('click', function () { page++; renderList(); });
  $('library-prev').addEventListener('click', function () { page=Math.max(0,page-1); renderList(); });
  window.addEventListener('cnc-job-status', function (event) {
    machine = event.detail && event.detail.machine || null;
    var key = JSON.stringify(machine ? [machine.name, !!machine.fresh, machine.workflow, machine.activeState] : null);
    if (key !== fileStateKey) { fileStateKey = key; selectedRow(); }
    v2FilesSchedule();
  });
  window.addEventListener('cnc-library-page-size',function(e){
    var size=Number(e.detail);
    if(size!==2&&size!==3&&size!==4&&size!==5)return;
    pageLimit=size;rowHeight=0;selectedHeight=0;
    if(size!==pageSize){page=Math.floor(page*pageSize/size);pageSize=size;renderList();}else schedulePageFit();
  });
  function mount() {
    if (mounted || !visible()) return;
    mounted = true;
    Object.keys(deferredText).forEach(function (id) { setText(id, deferredText[id]); }); deferredText = {};
    renderList(); applyThumbs(); scheduleThumbs(); v2FilesSchedule();
    var manual = refreshAgain === 2; refreshAgain = 0;
    refresh(manual);
  }
  function unmount() {
    if (!mounted) return;
    mounted = false; refreshId++; requestId++;
    if (detailLoading) detailVersion = '';
    detailLoading = false; $('library-image').onload = null; $('library-image').onerror = null;
    cancelRequest('list'); cancelRequest('detail'); cancelRequest('thumb'); thumbBusy = false;
    refreshing = false; refreshPromise = null;
  }
  window.addEventListener('cnc-screen-change', function (e) { if (e.detail === 'files') mount(); else unmount(); });
  document.addEventListener('visibilitychange', function () { if (visible()) mount(); else unmount(); });
  $('library-favorites').addEventListener('click', function () {
    favoritesOnly = !favoritesOnly; page = 0;
    $('library-favorites').setAttribute('aria-pressed', favoritesOnly ? 'true' : 'false');
    renderList();
  });
  window.addEventListener('cnc-projects-updated', function () { renderList(); v2FilesSchedule(); });

  // ---- Performance v2 · Fichiers (lot L5; REFLEXION.md proposition 7, §5 « Fichiers ») ----
  // Its lines live in V2_FILES_MESSAGES (registered when the band is built), not in the static catalogues.
  function tv2(s) { return uiLocale.t(s); }
  // Only while cncV2's layout holds (body.perf-v2), in the files mount (#perf-v2-files): a band that
  // tells « Sélection » from « Chargé dans la machine », and a short comparison of name/version,
  // dimensions, declared tool and material, and fingerprint. A match needs both fingerprints: a name
  // alone never makes the selection « the loaded program ». Nothing here loads, starts or reads: the
  // selection's values come from its detail already read, the loaded program's from its report and the
  // preview Suivi already shows. Every DOM write happens in requestAnimationFrame.
  var V2_FILES_MESSAGES = [
    ['Sélection et programme chargé', 'Selection and loaded program', 'Selección y programa cargado'],
    ['Sélection', 'Selection', 'Selección'],
    ['Chargé dans la machine', 'Loaded in the machine', 'Cargado en la máquina'],
    ['Version (date · révision)', 'Version (date · revision)', 'Versión (fecha · revisión)'],
    ['Dimensions (aperçu)', 'Dimensions (preview)', 'Dimensiones (vista previa)'],
    ['Outil · matière déclarés', 'Declared tool · material', 'Herramienta · material declarados'],
    ['Empreinte', 'Fingerprint', 'Huella'],
    ['valide', 'valid', 'válida'],
    ['inconnue', 'unknown', 'desconocida'],
    ['périmée', 'stale', 'caducada'],
    ['connue', 'known', 'conocida'],
    ['inconnus', 'unknown', 'desconocidos'],
    ['non déclarés', 'not declared', 'no declarados'],
    ['aucune fiche', 'no sheet', 'ninguna ficha'],
    ['fiche d’une autre version', 'sheet of another version', 'ficha de otra versión'],
    ['révision', 'revision', 'revisión'],
    ['Aucun programme chargé', 'No program loaded', 'Ningún programa cargado'],
    ['État machine indisponible', 'Machine state unavailable', 'Estado de la máquina no disponible'],
    ['Aucune sélection', 'No selection', 'Ninguna selección'],
    ['✓ La sélection est le programme chargé (même empreinte).', '✓ The selection is the loaded program (same fingerprint).', '✓ La selección es el programa cargado (misma huella).'],
    ['La sélection n’est pas le programme chargé.', 'The selection is not the loaded program.', 'La selección no es el programa cargado.'],
    ['Correspondance inconnue : empreinte absente ou non vérifiée.', 'Match unknown: fingerprint missing or not verified.', 'Correspondencia desconocida: huella ausente o no verificada.'],
    ['Programme chargé inconnu : état machine indisponible.', 'Loaded program unknown: machine state unavailable.', 'Programa cargado desconocido: estado de la máquina no disponible.'],
    ['Rien n’est chargé dans la machine.', 'Nothing is loaded in the machine.', 'No hay nada cargado en la máquina.']
  ];
  var v2f = { built: false, frame: 0, nodes: null, sel: null, catalogue: false };
  function v2FilesMount() { var v = window.cncV2; try { return v && typeof v.state === 'function' && v.state().layout === true && v.mounts ? v.mounts.get('files') : null; } catch (_) { return null; } }
  // Outside perf-v2 this returns at once: no frame, no DOM.
  function v2FilesSchedule() { if (v2f.frame || typeof window.requestAnimationFrame !== 'function' || (!v2f.built && !v2FilesMount())) return; v2f.frame = window.requestAnimationFrame(v2FilesRender); }
  function v2Selected(info) { v2f.sel = info; v2FilesSchedule(); }
  function v2Dims(bounds, zBounds) {
    var b = bounds, z = zBounds;
    if (!Array.isArray(b) || b.length !== 4 || !b.every(function (n) { return typeof n === 'number' && isFinite(n); }) || b[2] < b[0] || b[3] < b[1]) return '—';
    var f = function (n) { return (Math.abs(n) < 0.05 ? 0 : n).toLocaleString(uiLocale.locale || 'fr-FR', { maximumFractionDigits: 1 }); };
    var parts = [f(b[2] - b[0]), f(b[3] - b[1])];
    if (Array.isArray(z) && z.length === 2 && z.every(function (n) { return typeof n === 'number' && isFinite(n); }) && z[1] >= z[0]) parts.push(f(z[1] - z[0]));
    return parts.join(' × ') + ' mm';
  }
  // The sheet's values only for the program shown: same file AND the sheet read for the same bytes as
  // that program's fingerprint (selection: its verified preview; loaded: its report). A sheet without
  // a fingerprint, or a program without one, is not bound: « inconnus ».
  function v2Declared(file, fingerprint) {
    var P = projects(), d = null, key = function (s) { return String(s || '').toLowerCase().replace(/^sha256:/, ''); };
    try { d = P && typeof P.declared === 'function' ? P.declared(file) : null; } catch (_) {}
    if (!d) return tv2('aucune fiche');
    if (d.version !== 'current') return tv2('fiche d’une autre version');
    if (!d.fingerprint || !fingerprint) return tv2('inconnus');
    if (key(d.fingerprint) !== key(fingerprint)) return tv2('fiche d’une autre version');
    return [d.tool, d.material].filter(Boolean).join(' · ') || tv2('non déclarés');
  }
  function v2FilesBuild(mount) {
    if (v2f.built) return;
    v2f.built = true; v2f.content = mount.content;
    if (uiLocale.registerCatalog) { try { uiLocale.registerCatalog('performance-v2-files', V2_FILES_MESSAGES); } catch (_) { /* French text stays readable. */ } }
    var n = {}, root = mount.content;
    function el(tag, cls, text, parent) { var e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; parent.appendChild(e); return e; }
    var box = el('section', 'lv2', '', root); box.setAttribute('aria-label', tv2('Sélection et programme chargé'));
    // One compact table: its header row is the band (« Sélection » / « Chargé dans la machine »), so the
    // detail keeps its preview and « Charger et ouvrir le Suivi » in the frame (D3).
    var table = el('table', 'lv2-compare', '', box), head = el('thead', '', '', table), headRow = el('tr', '', '', head), body = el('tbody', '', '', table);
    el('td', '', '', headRow);
    [['sel', tv2('Sélection')], ['load', tv2('Chargé dans la machine')]].forEach(function (c) {
      var col = el('th', 'lv2-col', '', headRow); col.setAttribute('scope', 'col'); col.setAttribute('data-role', c[0] === 'sel' ? 'selection' : 'loaded');
      el('span', 'lv2-eyebrow', c[1], col);
      n[c[0] + 'Name'] = el('b', 'lv2-name', '', col); n[c[0] + 'Name'].id = 'lv2-' + c[0] + '-name';
      if (c[0] === 'load') { n.loadState = el('span', 'lv2-state', '', col); n.loadState.id = 'lv2-load-state'; }
    });
    n.cells = {};
    [['version', tv2('Version (date · révision)')], ['dims', tv2('Dimensions (aperçu)')], ['tool', tv2('Outil · matière déclarés')], ['print', tv2('Empreinte')]].forEach(function (r) {
      var tr = el('tr', '', '', body), th = el('th', '', r[1], tr); th.setAttribute('scope', 'row');
      ['sel', 'load'].forEach(function (c) { var td = el('td', '', '', tr); td.id = 'lv2-' + r[0] + '-' + c; n.cells[r[0] + '-' + c] = td; });
    });
    n.match = el('p', 'lv2-match', '', box); n.match.id = 'lv2-match'; n.match.setAttribute('role', 'status');
    v2f.nodes = n;
  }
  function v2FilesRender() {
    v2f.frame = 0;
    var mount = v2FilesMount();
    if (!mount) { if (v2f.content) property(v2f.content, 'hidden', true); return; }
    if (!visible()) return; // Drawn again when Fichiers is shown (mount() schedules it).
    v2FilesBuild(mount);
    var n = v2f.nodes, sel = v2f.sel, m = machine, put = function (node, text) { property(node, 'textContent', String(text)); };
    property(mount.content, 'hidden', false);
    // Selection: the detail already read (name, version, extents, fingerprint verdict of its preview).
    put(n.selName, sel ? sel.name : tv2('Aucune sélection'));
    put(n.cells['version-sel'], sel ? new Date(sel.mtime).toLocaleString(uiLocale.locale || 'fr-FR') : '—');
    put(n.cells['dims-sel'], sel ? v2Dims(sel.bounds, sel.zBounds) : '—');
    put(n.cells['tool-sel'], sel ? v2Declared(sel.file, sel.verdict === 'ok' ? sel.fingerprint : '') : '—');
    put(n.cells['print-sel'], !sel ? '—' : sel.verdict === 'ok' && sel.fingerprint ? tv2('valide') : sel.verdict === 'stale' ? tv2('périmée') : tv2('inconnue'));
    // Loaded: its report only; an unavailable state is « unknown », never « nothing loaded ».
    var fresh = !!(m && m.fresh), loaded = fresh && !!m.name;
    put(n.loadName, !fresh ? tv2('État machine indisponible') : loaded ? m.originalName || m.name : tv2('Aucun programme chargé'));
    put(n.loadState, !loaded ? '' : /^Alarm/.test(m.activeState || '') ? tv2('! Alarme · chargé') : m.workflow === 'paused' || /^Hold/.test(m.activeState || '') ? tv2('Ⅱ En pause') :
      m.workflow === 'running' || /^Run/.test(m.activeState || '') ? tv2('▶ En cours') : tv2('● Chargé'));
    // Match: different names are different files; the same name needs both fingerprints.
    var selPrint = sel && sel.verdict === 'ok' && sel.fingerprint || '', match = !sel || !loaded ? '' : sel.file !== m.name ? 'different' : !selPrint || !m.fingerprint ? 'unknown' : selPrint === m.fingerprint ? 'same' : 'different';
    var shown = document.getElementById('home-job-image'), pv = shown && shown.cncPreview;
    var loadedPreview = loaded && pv && pv.file === m.name && pv.fingerprint && pv.fingerprint === m.fingerprint ? pv : null;
    put(n.cells['version-load'], loaded ? (m.revision !== undefined && m.revision !== null ? tv2('révision') + ' ' + m.revision : '—') : '—');
    put(n.cells['dims-load'], match === 'same' ? v2Dims(sel.bounds, sel.zBounds) : loadedPreview && loadedPreview.projection ? v2Dims(loadedPreview.projection.bounds, loadedPreview.zBounds) : '—');
    put(n.cells['tool-load'], match === 'same' ? v2Declared(m.name, m.fingerprint) : loaded ? tv2('inconnus') : '—');
    put(n.cells['print-load'], loaded ? (m.fingerprint ? tv2('connue') : tv2('inconnue')) : '—');
    var text = !fresh ? tv2('Programme chargé inconnu : état machine indisponible.') : !loaded ? tv2('Rien n’est chargé dans la machine.') : !sel ? '' :
      match === 'same' ? tv2('✓ La sélection est le programme chargé (même empreinte).') : match === 'different' ? tv2('La sélection n’est pas le programme chargé.') : tv2('Correspondance inconnue : empreinte absente ou non vérifiée.');
    put(n.match, text); attribute(n.match, 'data-tone', match === 'same' ? 'ok' : match === 'different' ? 'warn' : 'neutral'); property(n.match, 'hidden', !text);
  }
  window.addEventListener('cnc-v2-change', v2FilesSchedule);
  window.cncLibraryView = {
    mount: mount, unmount: unmount,
    // For projects.js: the programs listed, and the selection of an associated file.
    files: function () { return files.map(function (f) { return { name: f.name, display: displayName(f.name) }; }); },
    v2Messages: V2_FILES_MESSAGES,
    selectName: function (name) { var f = files.filter(function (x) { return x.name === name; })[0]; if (f) select(f, false); return !!f; }
  };
  mount();
})();
