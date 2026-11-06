// Project sheets of the shared library (F3) and the provenance of a file compensated by
// CNCjs's Autolevel (F6), shown in the selected file's card of Fichiers.
//
// The server (api/touch-projects, src/server/services/touch/projects.js) binds every sheet to
// the SHA-256 fingerprint of the file it describes: a sheet written for another version is
// shown as such and never applied to the current one until the operator keeps it explicitly.
// A sheet is descriptive only: nothing here sends a feed, a spindle speed, a setting or a
// command to the controller, and nothing changes the program.
(function (root) {
  'use strict';
  var uiLocale = (typeof window !== 'undefined' && window.cncI18n) || { t: function (s) { return s; }, html: function (s) { return s; } };
  var t = uiLocale.t;

  // ---- Model (pure; also loaded by the offline tests under Node) ----
  function lower(s) { return String(s || '').toLowerCase(); }
  function haystack(entry) {
    if (!entry) return '';
    var c = entry.compensation, parts = [entry.material, entry.tool, entry.notes].concat(entry.related || []);
    if (c) parts.push(c.original, c.grid && c.grid.name, c.tool, c.probeProfile && c.probeProfile.name);
    return lower(parts.filter(Boolean).join('\n'));
  }
  // Whether a sheet matches a search query (already lower-cased by the caller or not).
  function matches(entry, query) { query = lower(query); return !!query && haystack(entry).indexOf(query) >= 0; }
  function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
  function fmt(n, digits) {
    var locale = (typeof window !== 'undefined' && window.cncI18n && window.cncI18n.locale) || 'fr-FR';
    return Number(n).toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: digits === undefined ? 3 : digits });
  }
  // Work offset (machine − work) in the report units, or null.
  function offsetOf(machine) {
    var co = machine && machine.coordinates, m = co && co.mpos, w = co && co.wpos, out = {};
    if (!m || !w) return null;
    for (var i = 0, axes = ['x', 'y', 'z']; i < axes.length; i++) {
      var a = axes[i], mv = Number(m[a]), wv = Number(w[a]);
      if (m[a] === undefined || w[a] === undefined || !isFinite(mv) || !isFinite(wv)) return null;
      out[a] = Math.round((mv - wv) * 1000) / 1000;
    }
    return out;
  }
  // What the machine allows to record now as the probing frame, or null with a reason.
  function captureNow(machine) {
    if (!machine || !machine.fresh) return { capture: null, reason: t('État machine indisponible : repère non enregistrable.') };
    var op = machine.operator || {}, offset = offsetOf(machine);
    if (!/^G5[4-9]$/.test(op.wcs || '') || (op.reportUnits !== 'mm' && op.reportUnits !== 'in') || !offset) return { capture: null, reason: t('Repère ou unités inconnus : repère non enregistrable.') };
    return { capture: { wcs: op.wcs, reportUnits: op.reportUnits, offset: offset }, reason: '' };
  }
  // FNV-1a over the profile's fields in a fixed order: a short revision that changes
  // whenever a measured value of the Touch probe profile changes.
  function profileRevision(profile) {
    if (!profile) return '';
    var keys = Object.keys(profile).sort(), text = keys.map(function (k) { return k + '=' + JSON.stringify(profile[k]); }).join(';'), h = 0x811c9dc5;
    for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
    return h.toString(16);
  }
  // "Compensé depuis <original> · grille 3 × 2 points, pas 10 × 15 mm, X 0 à 20, Y 0 à 15 mm · palpée le …"
  function provenance(entry, displayName) {
    var c = entry && entry.compensation;
    if (!c) return '';
    var g = c.grid || {}, show = displayName || function (n) { return n; };
    var text = t('Compensé depuis ') + show(c.original) + ' · ' + t('grille ') + g.columns + ' × ' + g.rows + t(' points') +
      (g.regular ? '' : ' (' + g.points + t(', irrégulière') + ')') +
      (num(g.stepX) !== null && num(g.stepY) !== null ? t(', pas ') + fmt(g.stepX) + ' × ' + fmt(g.stepY) + ' mm' : '') +
      ', X ' + fmt(g.xMin) + t(' à ') + fmt(g.xMax) + ', Y ' + fmt(g.yMin) + t(' à ') + fmt(g.yMax) + ' mm';
    var date = c.probedAt || c.declaredAt;
    if (date) text += ' · ' + (c.probedAt ? t('palpée le ') : t('déclarée le ')) + new Date(date).toLocaleDateString((typeof window !== 'undefined' && window.cncI18n && window.cncI18n.locale) || 'fr-FR');
    if (c.capture) text += ' · ' + c.capture.wcs;
    if (c.tool) text += ' · ' + t('outil ') + c.tool;
    if (c.probeProfile) text += ' · ' + t('profil ') + c.probeProfile.name;
    return text;
  }
  // Incompatibilities between a compensated file and the machine now, most serious first.
  // profiles: the Touch probe profiles of this tablet ([{name, ...}]).
  function warnings(entry, machine, profiles) {
    var c = entry && entry.compensation, out = [];
    if (!c) return out;
    if (c.originalVersion === 'other') out.push({ level: 'danger', text: t('L’original a changé depuis la compensation : ce fichier compensé ne correspond plus à l’original actuel.') });
    else if (c.originalVersion === 'missing') out.push({ level: 'warn', text: t('Original absent de la bibliothèque : la provenance ne peut plus être vérifiée.') });
    if (!c.capture) out.push({ level: 'warn', text: t('Repère et origine du palpage non enregistrés : vérifiez vous-même que la pièce et l’origine n’ont pas bougé.') });
    else if (!machine || !machine.fresh) out.push({ level: 'warn', text: t('État machine indisponible : repère et origine non comparés.') });
    else {
      var op = machine.operator || {}, offset = offsetOf(machine);
      if (op.wcs && op.wcs !== c.capture.wcs) out.push({ level: 'danger', text: t('Repère actuel ') + op.wcs + t(' différent du repère du palpage ') + c.capture.wcs + '.' });
      if (op.reportUnits && op.reportUnits !== c.capture.reportUnits) out.push({ level: 'danger', text: t('Unités de rapport différentes de celles du palpage : origine non comparée.') });
      else if (offset) {
        var tolerance = c.capture.reportUnits === 'in' ? 0.002 : 0.05, moved = [];
        ['x', 'y', 'z'].forEach(function (a) { var d = offset[a] - c.capture.offset[a]; if (Math.abs(d) > tolerance) moved.push(a.toUpperCase() + ' ' + (d > 0 ? '+' : '') + fmt(d)); });
        if (moved.length) out.push({ level: 'danger', text: t('Origine déplacée depuis le palpage (') + moved.join(', ') + ' ' + c.capture.reportUnits + t(') : la grille ne correspond plus à la pièce.') });
      } else out.push({ level: 'warn', text: t('Position machine inconnue : origine non comparée.') });
    }
    if (c.probeProfile) {
      var p = (profiles || []).filter(function (x) { return x && x.name === c.probeProfile.name; })[0];
      if (!p) out.push({ level: 'warn', text: t('Profil de palpage « ') + c.probeProfile.name + t(' » absent de cette tablette.') });
      else if (profileRevision(p) !== c.probeProfile.revision) out.push({ level: 'warn', text: t('Profil de palpage « ') + c.probeProfile.name + t(' » modifié depuis la grille.') });
    }
    return out;
  }
  // Stock dimension typed by the operator ('' = not given), or NaN when unreadable.
  function stockValue(text) { var s = String(text || '').trim().replace(',', '.'); return s ? (/^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN) : null; }
  var model = { matches: matches, haystack: haystack, offsetOf: offsetOf, captureNow: captureNow, profileRevision: profileRevision, provenance: provenance, warnings: warnings, stockValue: stockValue };
  if (typeof module === 'object' && module.exports) { module.exports = model; return; }

  // ---- View ----
  var mountPoint = document.getElementById('library-project');
  if (!mountPoint) { root.CNCProjects = { model: model, matches: function () { return false; }, isFavorite: function () { return false; }, label: function () { return ''; }, revision: function () { return 0; } }; return; }
  var simulation = /simulation/.test((root.location && root.location.pathname) || '');
  // Sizes on the design tokens: 48 px taps, 18 px text. The card keeps one line per item (the file
  // card has no room for more at 1366 × 768); the whole sheet, its warnings and the two editors
  // open in a dialog over the screen.
  var style = document.createElement('style');
  style.textContent = '#library-project{display:flex;flex-direction:column;gap:var(--sp-2)}' +
    '#library-project p{margin:0}#library-project button,#project-dialog button,#project-dialog select,#project-dialog input,#project-dialog textarea{min-height:var(--tap,48px);font-size:var(--fs-18,18px)}' +
    '.library-project-head,.library-project-actions,#project-version-actions,#project-related-links{display:flex;flex-wrap:wrap;gap:var(--sp-2);align-items:center}' +
    '#library-project .project-line{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:0;min-width:100%}#library-project [data-tone="danger"],#project-version-full{color:var(--danger-text);font-weight:600}#library-project [data-tone="warn"]{color:var(--warn-text,var(--fg))}' +
    '#project-warnings{margin:0;padding-left:var(--sp-4)}#project-warnings li[data-tone="danger"]{color:var(--danger-text)}#project-details-summary{white-space:pre-line;color:var(--fg)}' +
    '#project-dialog[hidden],#project-dialog section[hidden]{display:none}#project-dialog .t-dialog{max-height:calc(100vh - 48px);overflow:auto}#project-dialog.t-below-strip .t-dialog{max-height:calc(100vh - var(--statusbar-h,72px) - 48px)}#project-dialog .project-dialog-close{position:sticky;top:calc(-1 * var(--sp-6,24px));align-self:flex-end;z-index:1;flex:none;box-shadow:0 0 0 var(--sp-2,8px) var(--surface)}' +
    '#project-dialog label{display:block;margin-top:var(--sp-2);color:var(--fg);font-size:var(--fs-18,18px)}#project-dialog input[type=text],#project-dialog select,#project-dialog textarea{width:100%;box-sizing:border-box}' +
    '#project-dialog .project-stock{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--sp-2)}#project-dialog .t-check input{min-height:0;width:28px;height:28px}';
  document.head && document.head.appendChild && document.head.appendChild(style);
  mountPoint.innerHTML =
    uiLocale.html('<div class="library-project-head"><strong>Fiche projet</strong> <button id="project-favorite" type="button" aria-pressed="false" disabled>☆ Favori</button> <button id="project-open" type="button" disabled>Ouvrir la fiche</button></div>') +
    uiLocale.html('<p id="project-version" class="project-line" data-tone="danger" role="status" hidden></p>') +
    uiLocale.html('<p id="project-summary" class="project-line mute"></p>') +
    uiLocale.html('<p id="project-alert" class="project-line" hidden></p>') +
    uiLocale.html('<p id="project-status" class="project-line" role="status"></p>');
  var dialog = document.createElement('div');
  dialog.id = 'project-dialog'; dialog.className = 't-scrim'; dialog.hidden = true;
  dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true');
  dialog.innerHTML =
    // « Fermer » first, kept at the top of the card while it scrolls (X2: it lay below the
    // visible part of the card at 1024 x 600 and in large text).
    uiLocale.html('<div class="t-dialog"><button id="project-dialog-close" class="project-dialog-close" type="button">Fermer</button><section id="project-details" hidden><h2>Fiche projet</h2>') +
    uiLocale.html('<p id="project-version-full" hidden></p>') +
    uiLocale.html('<div id="project-version-actions" hidden><button id="project-adopt" type="button">Garder pour cette version</button> <button id="project-clear" type="button">Effacer la fiche</button></div>') +
    uiLocale.html('<p id="project-details-summary"></p><div id="project-related-links"></div>') +
    uiLocale.html('<p id="project-provenance" hidden></p><ul id="project-warnings" hidden></ul>') +
    uiLocale.html('<p>Une fiche décrit le fichier : elle ne change ni les avances, ni la broche, ni les réglages machine.</p>') +
    uiLocale.html('<div class="library-project-actions"><button id="project-edit" type="button" disabled>Modifier la fiche</button> <button id="project-compensate" type="button" disabled>Provenance Autolevel</button> <button id="project-open-original" type="button" hidden>Ouvrir l’original</button></div></section>') +
    uiLocale.html('<section id="project-editor" hidden><h2>Modifier la fiche</h2>') +
    uiLocale.html('<p>Une fiche décrit le fichier : elle ne change ni les avances, ni la broche, ni les réglages machine.</p>') +
    uiLocale.html('<label for="project-material">Matière</label><input id="project-material" type="text" maxlength="80">') +
    uiLocale.html('<label for="project-tool">Outil</label><input id="project-tool" type="text" maxlength="80">') +
    uiLocale.html('<label>Brut X × Y × Z (mm)</label><div class="project-stock"><input id="project-stock-x" type="text" aria-label="Brut X (mm)"><input id="project-stock-y" type="text" aria-label="Brut Y (mm)"><input id="project-stock-z" type="text" aria-label="Brut Z (mm)"></div>') +
    uiLocale.html('<label for="project-notes">Notes</label><textarea id="project-notes" maxlength="2000" rows="3"></textarea>') +
    uiLocale.html('<label for="project-related-choice">Fichiers associés</label><select id="project-related-choice"></select> <button id="project-related-add" type="button">Ajouter</button><div id="project-related-edit"></div>') +
    uiLocale.html('<button id="project-save" class="t-btn t-btn--primary" type="button">Enregistrer la fiche</button></section>') +
    uiLocale.html('<section id="project-compensation" hidden><h2>Provenance Autolevel</h2>') +
    uiLocale.html('<p>Pour un fichier compensé par l’Autolevel de CNCjs : l’original, la grille (.probe) et le repère du palpage. Touch ne compense rien lui-même.</p>') +
    uiLocale.html('<label for="project-original">Fichier original</label><select id="project-original"></select>') +
    uiLocale.html('<label for="project-probe">Grille de palpage (.probe)</label><input id="project-probe" type="file" accept=".probe,.txt">') +
    uiLocale.html('<label for="project-probed-at">Date du palpage</label><input id="project-probed-at" type="date">') +
    uiLocale.html('<label for="project-comp-tool">Outil</label><input id="project-comp-tool" type="text" maxlength="80">') +
    uiLocale.html('<label for="project-profile">Profil de palpage Touch</label><select id="project-profile"></select>') +
    uiLocale.html('<label class="t-check"><input id="project-capture" type="checkbox"> Enregistrer le repère et l’origine actuels (juste après le palpage, sans avoir changé d’origine)</label><p id="project-capture-now"></p>') +
    uiLocale.html('<button id="project-compensation-save" class="t-btn t-btn--primary" type="button">Enregistrer la provenance</button> <button id="project-compensation-remove" type="button">Retirer la provenance</button></section>') +
    uiLocale.html('<p id="project-dialog-status" role="status"></p></div>');
  document.body.appendChild(dialog);
  var $ = function (id) { return document.getElementById(id); };
  var index = Object.create(null), indexRevision = 0, available = true, current = null, selected = null, readId = 0, busy = false, related = [];
  function auth() { try { var d = JSON.parse(localStorage.getItem('cnc') || '{}'); return d.state.session.token || ''; } catch (_) { return ''; } }
  function apiBase() { try { return root.cncState.get().apiBase; } catch (_) { return '/api'; } }
  function machine() { try { return root.cncState.get().machine || null; } catch (_) { return null; } }
  function libraryFiles() { try { return root.cncLibraryView.files(); } catch (_) { return []; } }
  function display(name) { var f = libraryFiles().filter(function (x) { return x.name === name; })[0]; return f ? f.display : name; }
  function profiles() {
    try { var saved = JSON.parse(localStorage.getItem('cnc-touch-probes-v1-' + (simulation ? 'simulation' : 'real')) || 'null'); return saved && saved.version === 1 && Array.isArray(saved.profiles) ? saved.profiles : []; } catch (_) { return []; }
  }
  function request(method, path, body) {
    return new Promise(function (resolve, reject) {
      var token = auth();
      if (!token) { reject({ status: 0, message: t('Ouvrez CNCjs à la racine du serveur pour établir la session, puis rechargez cette page.') }); return; }
      var xhr = new XMLHttpRequest();
      xhr.open(method, apiBase() + '/touch-projects' + path, true);
      xhr.setRequestHeader('Authorization', 'Bearer ' + token);
      xhr.timeout = 30000;
      if (body) xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.onload = function () {
        var data = null; try { data = JSON.parse(xhr.responseText); } catch (_) {}
        if (xhr.status >= 200 && xhr.status < 300 && data) { resolve(data); return; }
        reject({ status: xhr.status, code: data && data.code, message: data && data.message ? t(data.message) : (xhr.status === 404 && !(data && data.code) ? t('Fiches projets indisponibles sur ce serveur.') : t('Le serveur a refusé la demande (HTTP ') + xhr.status + ').') });
      };
      xhr.onerror = function () { reject({ status: 0, message: t('Serveur inaccessible. Vérifiez la connexion réseau.') }); };
      xhr.ontimeout = function () { reject({ status: 0, message: t('Le serveur ne répond pas. Actualisez la liste avant de réessayer.') }); };
      xhr.send(body ? JSON.stringify(body) : null);
    });
  }
  function status(text) { $('project-status').textContent = text; $('project-dialog-status').textContent = $('project-dialog').hidden ? '' : text; }
  function openDialog(section) {
    if (!current) return;
    fillEditor();
    $('project-details').hidden = section !== 'details'; $('project-editor').hidden = section !== 'editor'; $('project-compensation').hidden = section !== 'compensation';
    $('project-dialog-status').textContent = '';
    // Pause / Arrêter of the strip stay usable over the sheet (strip-guard.js, U5): it starts
    // below the strip and makes the rest of the page inert.
    if ($('project-dialog').hidden) { dialogReturn = document.activeElement; if (root.CNCStripGuard) dialogRestore = root.CNCStripGuard.isolate($('project-dialog')); }
    $('project-dialog').hidden = false;
    renderCapture();
    var sheet = $('project-dialog'), first = typeof sheet.querySelector === 'function' ? sheet.querySelector('section:not([hidden]) button, section:not([hidden]) input, #project-dialog-close') : null; if (first && typeof first.focus === 'function') first.focus({ preventScroll: true });
  }
  var dialogRestore = null, dialogReturn = null;
  function closeDialog() {
    if ($('project-dialog').hidden) return;
    $('project-dialog').hidden = true; $('project-dialog-status').textContent = '';
    var restore = dialogRestore; dialogRestore = null; if (restore) restore();
    var target = dialogReturn; dialogReturn = null;
    if (target && target.isConnected && !target.disabled && typeof target.focus === 'function') target.focus({ preventScroll: true });
  }
  // Escape closes the sheet; Tab cycles through the strip's Pause / Arrêter and the sheet.
  document.addEventListener('keydown', function (e) {
    // An overlay opened above (the pad) made this one inert: the keys are its own (V1).
    if ($('project-dialog').hidden || (root.CNCStripGuard && root.CNCStripGuard.covered($('project-dialog')))) return;
    if (e.key === 'Escape') { e.preventDefault(); closeDialog(); return; }
    if (e.key === 'Tab' && root.CNCStripGuard) root.CNCStripGuard.tab(e, $('project-dialog'));
  });
  function updated() { indexRevision++; root.dispatchEvent(new CustomEvent('cnc-projects-updated', { detail: { revision: indexRevision } })); }
  function remember(file, entry, version) {
    if (entry) index[file] = { favorite: !!entry.favorite, version: version, compensated: !!entry.compensation, haystack: haystack(entry) };
    else delete index[file];
    updated();
  }
  function refreshIndex() {
    return request('GET', '').then(function (data) {
      index = Object.create(null); available = true;
      (data.entries || []).forEach(function (e) { if (e && typeof e.file === 'string') index[e.file] = { favorite: !!e.favorite, version: e.version, compensated: !!e.compensation, haystack: haystack(e) }; });
      updated();
    }, function (err) {
      if (err.status === 404 && !err.code) available = false;
      index = Object.create(null); updated();
    });
  }
  function option(select, value, text) { var o = document.createElement('option'); o.value = value; o.textContent = text; select.appendChild(o); }
  function fillChoices() {
    var files = libraryFiles(), file = current && current.file;
    var choice = $('project-related-choice'); choice.textContent = ''; option(choice, '', t('Choisir un fichier…'));
    files.forEach(function (f) { if (f.name !== file && related.indexOf(f.name) < 0) option(choice, f.name, f.display); });
    var original = $('project-original'), c = current && current.entry && current.entry.compensation, guess = c ? c.original : '';
    if (!guess && file) { var base = file.replace(/^AL_/, ''); if (base !== file && files.some(function (f) { return f.name === base; })) guess = base; }
    original.textContent = ''; option(original, '', t('Choisir l’original…'));
    files.forEach(function (f) { if (f.name !== file) option(original, f.name, f.display); });
    original.value = guess;
    var profile = $('project-profile'); profile.textContent = ''; option(profile, '', t('Aucun'));
    profiles().forEach(function (p) { if (p && typeof p.name === 'string') option(profile, p.name, p.name); });
    profile.value = c && c.probeProfile ? c.probeProfile.name : '';
  }
  function renderRelatedEdit() {
    var box = $('project-related-edit'); box.textContent = '';
    related.forEach(function (name) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = '✕ ' + display(name); b.setAttribute('data-file', name);
      b.addEventListener('click', function () { related = related.filter(function (n) { return n !== name; }); renderRelatedEdit(); fillChoices(); });
      box.appendChild(b);
    });
  }
  function renderCapture() {
    var now = captureNow(machine()), box = $('project-capture');
    box.disabled = !now.capture; if (!now.capture) box.checked = false;
    $('project-capture-now').textContent = now.capture ? t('Maintenant : ') + now.capture.wcs + ' · X ' + fmt(now.capture.offset.x) + ' Y ' + fmt(now.capture.offset.y) + ' Z ' + fmt(now.capture.offset.z) + ' ' + now.capture.reportUnits : now.reason;
  }
  function renderWarnings() {
    var list = $('project-warnings'), entry = current && current.entry, items = current && current.version === 'current' ? warnings(entry, machine(), profiles()) : [];
    var key = JSON.stringify([items, current && current.version, entry && entry.compensation && entry.compensation.original]);
    if (list.getAttribute('data-key') === key) return;
    list.setAttribute('data-key', key); list.textContent = '';
    items.forEach(function (w) { var li = document.createElement('li'); li.textContent = '⚠ ' + w.text; li.setAttribute('data-tone', w.level); list.appendChild(li); });
    list.hidden = !items.length;
    // On the card: the most serious warning, else the provenance in short.
    var c = entry && entry.compensation, alert = $('project-alert');
    alert.textContent = items.length ? '⚠ ' + items[0].text + (items.length > 1 ? ' (+' + (items.length - 1) + ')' : '') : c && current.version === 'current' ? '≈ ' + t('Compensé depuis ') + display(c.original) : '';
    alert.setAttribute('data-tone', items.length ? items[0].level : '');
    alert.title = items.map(function (w) { return w.text; }).join('\n');
    alert.hidden = !alert.textContent;
  }
  function render() {
    var entry = current && current.entry, version = current ? current.version : 'none', other = version === 'other';
    var editable = !!current && available && !busy && !other;
    $('project-favorite').disabled = !editable;
    $('project-favorite').setAttribute('aria-pressed', entry && entry.favorite ? 'true' : 'false');
    $('project-favorite').textContent = entry && entry.favorite ? t('★ Favori') : t('☆ Favori');
    $('project-open').disabled = !current || !available;
    $('project-version').hidden = !other;
    $('project-version').textContent = other ? t('⚠ Fiche d’une autre version de ce fichier : non appliquée. Ouvrez la fiche.') : '';
    $('project-version-full').hidden = !other;
    $('project-version-full').textContent = other ? t('Ces informations concernent une autre version de ce fichier (modifié depuis). Elles ne sont pas appliquées à cette version.') : '';
    $('project-version-actions').hidden = !other;
    $('project-adopt').disabled = busy; $('project-clear').disabled = busy;
    $('project-save').disabled = !editable; $('project-compensation-save').disabled = !editable;
    $('project-edit').disabled = !editable; $('project-compensate').disabled = !editable;
    if ((!current || !available) && !busy) closeDialog();
    $('project-compensation-remove').disabled = !editable || !(entry && entry.compensation);
    var parts = [];
    if (entry) {
      if (entry.material) parts.push(t('Matière : ') + entry.material);
      if (entry.tool) parts.push(t('Outil : ') + entry.tool);
      if (entry.stock) parts.push(t('Brut : ') + ['x', 'y', 'z'].map(function (a) { return entry.stock[a] === null ? '?' : fmt(entry.stock[a]); }).join(' × ') + ' mm');
      if (entry.notes) parts.push(t('Notes : ') + entry.notes);
    }
    $('project-summary').textContent = !available ? t('Fiches projets indisponibles sur ce serveur.') : !current ? '' : parts.length ? parts.join(' · ') : t('Aucune fiche pour ce fichier.');
    $('project-summary').title = $('project-summary').textContent;
    $('project-details-summary').textContent = parts.length ? parts.join('\n') : $('project-summary').textContent;
    var links = $('project-related-links'); links.textContent = '';
    var names = libraryFiles().map(function (f) { return f.name; });
    ((entry && entry.related) || []).forEach(function (name) {
      var b = document.createElement('button'); b.type = 'button'; b.setAttribute('data-file', name);
      var present = names.indexOf(name) >= 0; b.disabled = !present;
      b.textContent = '↗ ' + display(name) + (present ? '' : t(' (absent)'));
      b.addEventListener('click', function () { try { root.cncLibraryView.selectName(name); } catch (_) {} });
      links.appendChild(b);
    });
    var c = entry && entry.compensation;
    $('project-provenance').hidden = !c; $('project-provenance').textContent = c ? provenance(entry, display) : '';
    $('project-open-original').hidden = !c || c.originalVersion === 'missing' || names.indexOf(c.original) < 0;
    renderWarnings(); renderCapture();
  }
  function fillEditor() {
    var e = (current && current.entry) || {};
    $('project-material').value = e.material || ''; $('project-tool').value = e.tool || '';
    ['x', 'y', 'z'].forEach(function (a) { $('project-stock-' + a).value = e.stock && e.stock[a] !== null && e.stock[a] !== undefined ? String(e.stock[a]) : ''; });
    $('project-notes').value = e.notes || ''; related = (e.related || []).slice();
    var c = e.compensation;
    $('project-comp-tool').value = c ? c.tool || '' : e.tool || '';
    $('project-probed-at').value = c && c.probedAt ? c.probedAt.slice(0, 10) : '';
    $('project-probe').value = ''; $('project-capture').checked = false;
    renderRelatedEdit(); fillChoices();
  }
  function load(file) {
    var id = ++readId; current = null; closeDialog(); status(''); render();
    if (!file) return Promise.resolve();
    return request('POST', '/read', { file: file }).then(function (data) {
      if (id !== readId) return;
      available = true; current = data; remember(file, data.entry, data.version); fillEditor(); render();
    }, function (err) {
      if (id !== readId) return;
      if (err.status === 404 && !err.code) available = false;
      current = null; render(); if (available) status(err.message);
    });
  }
  function write(body, done) {
    if (!current || busy) return Promise.resolve();
    busy = true; render(); status(t('Enregistrement de la fiche…'));
    var file = current.file, id = readId;
    body.file = file; body.fingerprint = current.fingerprint;
    return request('PUT', '', body).then(function (data) {
      busy = false;
      if (id !== readId) return;
      current = data; remember(file, data.entry, data.version); closeDialog(); fillEditor(); render(); status(done);
    }, function (err) {
      busy = false; render();
      if (id !== readId) return;
      status(err.message);
      // The file or the sheet changed meanwhile: read them again rather than keep a stale view.
      if (err.code === 'ECHANGED' || err.code === 'EOTHERVERSION') load(file).then(function () { status(err.message); });
    });
  }
  function readText(file) {
    return new Promise(function (resolve, reject) {
      if (!file) { reject(new Error(t('Choisissez la grille de palpage (.probe) enregistrée par l’Autolevel de CNCjs.'))); return; }
      if (file.size > 512 * 1024) { reject(new Error(t('Grille de palpage trop grande (512 Ko au plus).'))); return; }
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { reject(new Error(t('Grille de palpage illisible.'))); };
      reader.readAsText(file);
    });
  }
  $('project-favorite').addEventListener('click', function () {
    var fav = !!(current && current.entry && current.entry.favorite);
    write({ meta: { favorite: !fav } }, fav ? t('Retiré des favoris.') : t('Ajouté aux favoris.'));
  });
  $('project-open').addEventListener('click', function () { openDialog('details'); });
  $('project-edit').addEventListener('click', function () { openDialog('editor'); });
  $('project-compensate').addEventListener('click', function () { openDialog('compensation'); });
  $('project-dialog-close').addEventListener('click', closeDialog);
  $('project-adopt').addEventListener('click', function () { write({ adopt: true }, t('Fiche gardée pour cette version du fichier.')); });
  $('project-clear').addEventListener('click', function () { write({ meta: null }, t('Fiche effacée.')); });
  $('project-related-add').addEventListener('click', function () {
    var name = $('project-related-choice').value;
    if (!name || related.indexOf(name) >= 0) return;
    if (related.length >= 10) { status(t('Fichiers associés : 10 au plus.')); return; }
    related.push(name); renderRelatedEdit(); fillChoices();
  });
  $('project-save').addEventListener('click', function () {
    var stock = {}, bad = '';
    ['x', 'y', 'z'].forEach(function (a) { var v = stockValue($('project-stock-' + a).value); if (v !== null && !(v > 0 && v <= 10000)) bad = a.toUpperCase(); stock[a] = v; });
    if (bad) { status(t('Brut ') + bad + t(' : nombre de 0 à 10000 mm attendu.')); return; }
    write({ meta: { material: $('project-material').value, tool: $('project-tool').value, stock: stock, notes: $('project-notes').value, related: related.slice() } }, t('Fiche enregistrée.'));
  });
  $('project-compensation-remove').addEventListener('click', function () { write({ meta: { compensation: null } }, t('Provenance retirée.')); });
  $('project-compensation-save').addEventListener('click', function () {
    var original = $('project-original').value, input = $('project-probe'), file = input.files && input.files[0];
    if (!original) { status(t('Choisissez le fichier original.')); return; }
    var capture = null;
    if ($('project-capture').checked) { capture = captureNow(machine()).capture; if (!capture) { status(t('Repère non enregistrable maintenant : décochez la case ou attendez un rapport récent.')); return; } }
    var profileName = $('project-profile').value, profile = profiles().filter(function (p) { return p && p.name === profileName; })[0];
    var date = $('project-probed-at').value;
    readText(file).then(function (text) {
      write({ meta: { compensation: {
        original: original,
        probe: { name: file.name, text: text, probedAt: /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T12:00:00').toISOString() : (file.lastModified ? new Date(file.lastModified).toISOString() : null) },
        capture: capture,
        tool: $('project-comp-tool').value,
        probeProfile: profile ? { name: profile.name, revision: profileRevision(profile) } : null
      } } }, t('Provenance enregistrée.'));
    }, function (err) { status(err.message); });
  });
  $('project-open-original').addEventListener('click', function () { var c = current && current.entry && current.entry.compensation; if (c) { try { root.cncLibraryView.selectName(c.original); } catch (_) {} } });
  // Stock fields take the shared numeric pad (window.CNCNumeric), like every other value on the tablet.
  if (root.CNCNumeric && typeof root.CNCNumeric.bind === 'function') ['x', 'y', 'z'].forEach(function (a) { root.CNCNumeric.bind($('project-stock-' + a), { min: 0.001, max: 10000, unit: 'mm', negative: false, label: t('Brut ') + a.toUpperCase() + ' (mm)' }); });

  root.addEventListener('cnc-library-select', function (e) {
    var sel = e && e.detail, file = sel && sel.file || null;
    if (file === selected) return;
    selected = file; load(file);
  });
  // The selected file replaced under the same name (new mtime or size): its sheet is read again,
  // so a sheet for the previous bytes shows as written for another version.
  root.addEventListener('cnc-library-preview-updated', function (e) { if (e && e.detail && e.detail.file === selected) { load(selected); refreshIndex(); } });
  root.addEventListener('cnc-screen-change', function (e) { closeDialog(); if (e && e.detail === 'files') refreshIndex(); });
  root.addEventListener('cnc-screen-lock', function (e) { if (e && e.detail) closeDialog(); });
  var refreshButton = $('library-refresh');
  if (refreshButton) refreshButton.addEventListener('click', function () { refreshIndex(); if (selected) load(selected); });
  try { if (root.cncState && typeof root.cncState.subscribe === 'function') root.cncState.subscribe(function () { if (current) { renderWarnings(); renderCapture(); } }); } catch (_) {}

  root.CNCProjects = {
    model: model,
    // Used by shared-library.js: extended search, favourites filter and row labels.
    matches: function (name, query) { var e = index[name]; return !!e && !!query && e.haystack.indexOf(lower(query)) >= 0; },
    isFavorite: function (name) { var e = index[name]; return !!e && e.favorite; },
    label: function (name) {
      var e = index[name]; if (!e) return '';
      var parts = [];
      if (e.favorite) parts.push(t('★ Favori'));
      if (e.compensated) parts.push(t('≈ Compensé'));
      if (e.version === 'other') parts.push(t('⚠ Fiche d’une autre version'));
      return parts.join(' · ');
    },
    revision: function () { return indexRevision; },
    // For the previews (preview-gl.js, the resume preview): the stock of the selected file's sheet,
    // only for the current version of that file. Indicative: its placement on the machine is not known.
    stock: function (file) {
      var e = current && current.version === 'current' && current.entry;
      if (!e || !e.stock || (file && file !== selected)) return null;
      var s = e.stock, out = {};
      ['x', 'y', 'z'].forEach(function (a) { out[a] = typeof s[a] === 'number' && isFinite(s[a]) && s[a] > 0 ? s[a] : null; });
      return out.x && out.y ? out : null;
    },
    // For the Performance v2 comparisons (Fichiers, Préparer): what the selected file's sheet declares,
    // with the fingerprint of the file it was read for. A sheet of another version declares nothing.
    // Declarations only: never a measurement, never a check of the real set-up.
    declared: function (file) {
      if (!current || !file || current.file !== file || file !== selected) return null;
      var e = current.version === 'current' && current.entry || null;
      return { file: current.file, fingerprint: typeof current.fingerprint === 'string' && current.fingerprint ? current.fingerprint : null, version: current.version,
        material: e && e.material || null, tool: e && e.tool || null, stock: e ? this.stock(file) : null };
    },
    refresh: refreshIndex,
    reload: function () { return load(selected); }
  };
  refreshIndex();
  if (root.cncLibrarySelection && root.cncLibrarySelection.file) { selected = root.cncLibrarySelection.file; load(selected); }
})(typeof window === 'object' ? window : this);
