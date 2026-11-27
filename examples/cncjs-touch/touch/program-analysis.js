/* File analysis before the start (lot N1), from the server's program check (`programCheck`):
 * (1) the depth of the file against the stock thickness the operator types, (2) the tools the
 * file names, (3) the time the spindle has to spin up before the first entry into the material.
 * Display only: three warnings that never refuse a start, never change the file and never
 * send anything. The thickness is the operator's (kept per file on this tablet), never
 * invented; a figure the server could not compute is shown as not computed, never as correct. */
(function (root) {
  'use strict';
  var uiLocale = (typeof window !== 'undefined' && window.cncI18n) || { t: function (s) { return s; } };
  function t(s) { return uiLocale.t(s); }
  function number(v) { return typeof v === 'number' && isFinite(v); }
  function tenth(v) { return Math.round(v * 10) / 10; }
  function fmt(v) { return String(tenth(v)).replace('.', uiLocale.language === 'en' ? '.' : ','); }
  function fill(s, values) { return t(s).replace(/\{(\w+)\}/g, function (_, k) { return values[k] === undefined ? '—' : values[k]; }); }
  var SPIN_DEFAULT = 3, SPIN_MIN = 0.5, SPIN_MAX = 30, STOCK_MIN = 0.1, STOCK_MAX = 300, MAX_FILES = 40, MAX_ROWS = 8, MAX_TEXT = 60;

  // (1) Depth against the stock. `entry` = {thickness, ref: 'top' | 'bed'} or null.
  // → {state: 'unknown' | 'ask' | 'ok' | 'warn', depth, result, note}
  function stock(check, entry) {
    var z = check && check.zMin, bed = !!(entry && entry.ref === 'bed'), thickness = entry && number(entry.thickness) && entry.thickness > 0 ? entry.thickness : null;
    var note = t(bed ? 'Calcul valable si le zéro Z est posé sur le martyr.' : 'Calcul valable si le zéro Z est posé sur le dessus du brut.');
    if (!number(z)) return { state: 'unknown', depth: t('Profondeur non calculée pour ce fichier.'), result: '', note: '' };
    var low = tenth(z), depth = low >= 0 ? t('Le fichier ne descend pas sous le zéro Z.') : fill('Le fichier descend à {n} mm sous le zéro Z.', { n: fmt(-low) });
    if (bed) {
      // Work zero on the spoilboard: anything below the zero is in the spoilboard.
      if (low < 0) return { state: 'warn', depth: depth, result: fill('La fraise descend {n} mm dans le martyr.', { n: fmt(-low) }), note: note };
      if (low === 0) return { state: 'ok', depth: depth, result: t('La fraise arrive juste sur le martyr.'), note: note };
      return { state: 'ok', depth: depth, result: fill('Il reste {n} mm de matière sous la fraise.', { n: fmt(low) }), note: note };
    }
    if (thickness === null) return { state: 'ask', depth: depth, result: t('Saisissez l’épaisseur du brut pour la comparer.'), note: note };
    // A file that stays above the zero does not enter the stock: the whole thickness is left.
    var over = tenth(Math.max(0, -low) - thickness);
    if (over > 0) return { state: 'warn', depth: depth, result: fill('La fraise descend {n} mm sous le brut : elle touchera le martyr.', { n: fmt(over) }), note: note };
    if (over === 0) return { state: 'ok', depth: depth, result: t('La fraise arrive juste au fond du brut.'), note: note };
    return { state: 'ok', depth: depth, result: fill('Il reste {n} mm de matière sous la fraise.', { n: fmt(-over) }), note: note };
  }

  // (2) Tools named by the file. The description is the file's text: plain text, bounded again here.
  // → {known, rows: [text], notes: [text]}; known false when the server sent no list (older server).
  function tools(check) {
    var data = check && check.tools, list = data && Array.isArray(data.list) ? data.list : null;
    if (!list) return { known: false, rows: [], notes: [] };
    var rows = list.filter(function (e) { return e && typeof e === 'object'; }).slice(0, MAX_ROWS).map(function (e) {
      var parts = [];
      if (number(e.number)) parts.push('T' + e.number);
      if (typeof e.text === 'string' && e.text) parts.push(Array.from(e.text).slice(0, MAX_TEXT).join(''));
      if (number(e.line)) parts.push(fill('ligne {n}', { n: e.line }));
      else if (number(e.noteLine)) parts.push(fill('annoncée ligne {n}', { n: e.noteLine }));
      return parts.join(' · ');
    }).filter(function (s) { return s; });
    var notes = [];
    if (!rows.length) notes.push(t('Le fichier n’indique pas sa fraise.'));
    if (number(data.changes) && data.changes > 0) notes.push(fill('Changements de fraise demandés : {n}.', { n: data.changes }));
    if (data.truncated === true || list.length > MAX_ROWS) notes.push(t('Liste abrégée : le fichier en nomme davantage.'));
    return { known: true, rows: rows, notes: notes };
  }

  function threshold(v) { return number(v) && v >= SPIN_MIN && v <= SPIN_MAX ? v : SPIN_DEFAULT; }

  // (3) Spindle spin-up. → {state: 'hidden' | 'none' | 'unknown' | 'ok' | 'warn', text, note}
  function spinUp(check, wanted) {
    var s = check && check.spinUp, min = threshold(wanted);
    if (!s || typeof s !== 'object') return { state: 'hidden', text: '', note: '' };
    var lines = number(s.startLine) && number(s.entryLine) ? fill('Broche démarrée ligne {a}, première descente ligne {b}.', { a: s.startLine, b: s.entryLine }) : '';
    if (s.state === 'noEntry') return { state: 'none', text: t('Aucune descente dans la matière trouvée dans ce fichier.'), note: '' };
    if (s.state === 'noStart') return { state: 'warn', text: fill('Le fichier ne démarre pas la broche avant de descendre (ligne {n}).', { n: number(s.entryLine) ? s.entryLine : '—' }), note: t('Démarrez la broche vous-même avant l’usinage, ou corrigez le fichier.') };
    if (s.state !== 'computed' || !number(s.seconds) || s.seconds < 0) return { state: 'unknown', text: t('Temps de montée en vitesse non calculé pour ce fichier.'), note: lines };
    var seconds = Math.floor(s.seconds * 10) / 10, dwell = number(s.dwell) && s.dwell > 0 ? ' ' + fill('Dont {n} s de temporisation.', { n: fmt(s.dwell) }) : '';
    if (seconds >= min) return { state: 'ok', text: fill(s.atLeast ? 'Au moins {n} s entre le démarrage de la broche et la première descente.' : '{n} s entre le démarrage de la broche et la première descente.', { n: fmt(seconds) }), note: lines + dwell };
    // A lower bound below the wanted time proves nothing: the approach is not counted.
    if (s.atLeast) return { state: 'unknown', text: fill('Au moins {n} s, plus le trajet d’approche : non calculé.', { n: fmt(seconds) }), note: t('Ce trajet dépend de la position de la fraise au départ.') + (lines ? ' ' + lines : '') };
    return { state: 'warn', text: fill('La broche n’a que {n} s pour monter en vitesse.', { n: fmt(seconds) }), note: t('Ajoutez une temporisation après le démarrage de la broche, dans le post-processeur.') + (lines ? ' ' + lines : '') + dwell };
  }

  // The warnings of a check, in the order of the sheet. A laser has neither stock depth nor spindle.
  function warnings(check, entry, wanted) {
    if (!check) return [];
    var out = [], a = stock(check, entry), b = spinUp(check, wanted);
    if (a.state === 'warn') out.push(a.result);
    if (b.state === 'warn') out.push(b.text);
    return out;
  }

  // Thickness and reading of the work zero, per file, on this tablet. Unreadable storage = nothing typed.
  function store(storage, key) {
    function read() { try { var v = JSON.parse(storage.getItem(key) || '{}'); return v && typeof v === 'object' && v.files && typeof v.files === 'object' ? v : { files: {} }; } catch (_) { return { files: {} }; } }
    return {
      get: function (file) {
        var e = file ? read().files[file] : null;
        if (!e || typeof e !== 'object') return null;
        return { thickness: number(e.thickness) && e.thickness >= STOCK_MIN && e.thickness <= STOCK_MAX ? e.thickness : null, ref: e.ref === 'bed' ? 'bed' : 'top' };
      },
      set: function (file, entry) {
        if (!file) return false;
        var data = read(), names;
        data.files[file] = { thickness: number(entry.thickness) ? entry.thickness : null, ref: entry.ref === 'bed' ? 'bed' : 'top', at: Date.now() };
        names = Object.keys(data.files).sort(function (x, y) { return (data.files[y].at || 0) - (data.files[x].at || 0); });
        names.slice(MAX_FILES).forEach(function (name) { delete data.files[name]; });
        try { storage.setItem(key, JSON.stringify(data)); return true; } catch (_) { return false; }
      }
    };
  }

  var api = { stock: stock, tools: tools, spinUp: spinUp, warnings: warnings, threshold: threshold, store: store, fmt: fmt, SPIN_DEFAULT: SPIN_DEFAULT };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }
  root.CNCProgramAnalysis = api;

  // ---- The page: one button on 2 · Fichier, one on 4 · Contrôle, one sheet. ----
  var shell = window.cncShell, $ = function (id) { return document.getElementById(id); };
  var verdict = $('files-verdict') && $('files-verdict').parentNode, detailsOpen = $('check-details-open');
  if (!shell || !shell.sheet || !verdict || !detailsOpen) return;
  var STOCK_KEY = 'cncjs-touch-stock-v1', SPIN_KEY = 'cncjs-touch-spinup-v1';
  var memory = { getItem: function () { return null; }, setItem: function () {} };
  var saved = store((function () { try { return localStorage || memory; } catch (_) { return memory; } })(), STOCK_KEY);
  // Typed in this page but not stored (storage refused): kept for the session.
  // `read`: what the storage holds, per file, read once (again when the sheet opens or a value
  // is kept): painting on every machine state must not read and parse the storage.
  var session = {}, read = {}, wanted = SPIN_DEFAULT;
  try { wanted = threshold(Number(localStorage.getItem(SPIN_KEY))); } catch (_) { /* default */ }

  var filesOpen = document.createElement('button'); filesOpen.type = 'button'; filesOpen.id = 'files-analysis-open'; filesOpen.hidden = true; verdict.appendChild(filesOpen);
  // On Contrôle the button shares the line of « Détails du contrôle »: the verdict card gains no height.
  var checkOpen = document.createElement('button'); checkOpen.type = 'button'; checkOpen.id = 'check-analysis-open'; checkOpen.hidden = true;
  var actions = document.createElement('div'); actions.className = 'check-actions';
  detailsOpen.parentNode.insertBefore(actions, detailsOpen); actions.appendChild(detailsOpen); actions.appendChild(checkOpen);
  var sheet = shell.sheet('ks-program-analysis', t('Analyse du fichier'));
  sheet.content.innerHTML = uiLocale.html('<p id="pa-file"></p>' +
    '<section class="pa-block"><h3>Profondeur et brut</h3><p id="pa-depth"></p>' +
    '<div class="pa-row"><label for="pa-thickness">Épaisseur du brut</label><input id="pa-thickness" type="text" autocomplete="off"><span>mm</span></div>' +
    '<div class="t-seg pa-ref" role="group" aria-label="Position du zéro Z"><button type="button" id="pa-ref-top">Zéro Z sur le dessus du brut</button><button type="button" id="pa-ref-bed">Zéro Z sur le martyr</button></div>' +
    '<p id="pa-stock" role="status"></p><p id="pa-stock-note" class="pa-note"></p></section>' +
    '<section class="pa-block" id="pa-tools-block"><h3>Fraises du fichier</h3><div id="pa-tools"></div></section>' +
    '<section class="pa-block" id="pa-spin-block"><h3>Montée en vitesse de la broche</h3><p id="pa-spin" role="status"></p><p id="pa-spin-note" class="pa-note"></p>' +
    '<div class="pa-row"><label for="pa-spin-min">Temps voulu</label><input id="pa-spin-min" type="text" autocomplete="off"><span>s</span></div></section>' +
    '<p class="pa-note">Ces avertissements n’empêchent pas de démarrer.</p>');

  var last = {}, selection = { file: '', name: '', check: null }, source = 'check', paintKey = '';
  function machine() { return last.machine || null; }
  function isLaser() { var m = machine(); return !!(m && m.machineProfile && m.machineProfile.kind === 'laser'); }
  function subject(from) {
    var m = machine();
    if (from === 'files') return { file: selection.file || '', name: selection.name || selection.file || '', check: selection.file ? selection.check : null };
    return { file: m && m.name || '', name: m && (m.originalName || m.name) || '', check: m && m.name ? m.programCheck || null : null };
  }
  function entryOf(file) { if (session[file]) return session[file]; if (!(file in read)) read[file] = saved.get(file); return read[file]; }
  function text(node, value) { if (node && node.textContent !== String(value)) node.textContent = String(value); }
  function tone(node, value) { if (node && node.getAttribute('data-tone') !== value) node.setAttribute('data-tone', value); }
  function mark(state) { return state === 'warn' ? '! ' : state === 'ok' ? '✓ ' : ''; }
  function label(count) { return count ? '! ' + fill(count === 1 ? '{n} avertissement' : '{n} avertissements', { n: count }) : t('Analyse du fichier…'); }
  function paintButton(button, s) {
    var show = !!(s.file && s.check) && !isLaser(), list = show ? warnings(s.check, entryOf(s.file), wanted) : [];
    if (button.hidden !== !show) button.hidden = !show;
    text(button, label(list.length)); tone(button, list.length ? 'warn' : '');
    // The sentences themselves, for a reader that does not see the colour.
    var said = list.join(' '); if ((button.getAttribute('aria-label') || '') !== said) { if (said) button.setAttribute('aria-label', said); else button.removeAttribute('aria-label'); }
  }
  function paintSheet() {
    var s = subject(source), c = s.check, entry = entryOf(s.file) || { thickness: null, ref: 'top' };
    text($('pa-file'), s.name);
    var a = stock(c, entry), bed = entry.ref === 'bed';
    text($('pa-depth'), a.depth); text($('pa-stock'), mark(a.state) + a.result); tone($('pa-stock'), a.state); text($('pa-stock-note'), a.note);
    var field = $('pa-thickness'), value = number(entry.thickness) ? String(entry.thickness) : '';
    if (field.value !== value) field.value = value;
    if ($('pa-ref-top').getAttribute('aria-pressed') !== String(!bed)) { $('pa-ref-top').setAttribute('aria-pressed', String(!bed)); $('pa-ref-bed').setAttribute('aria-pressed', String(bed)); }
    var named = tools(c), host = $('pa-tools'); if ($('pa-tools-block').hidden !== !named.known) $('pa-tools-block').hidden = !named.known;
    host.textContent = '';
    // The file's own words: text nodes only, never markup.
    named.rows.concat(named.notes).forEach(function (row, i) { var p = document.createElement('p'); if (i >= named.rows.length) p.className = 'pa-note'; p.textContent = row; host.appendChild(p); });
    var b = spinUp(c, wanted); if ($('pa-spin-block').hidden !== (b.state === 'hidden')) $('pa-spin-block').hidden = b.state === 'hidden';
    text($('pa-spin'), mark(b.state) + b.text); tone($('pa-spin'), b.state); text($('pa-spin-note'), b.note);
    if ($('pa-spin-min').value !== String(wanted)) $('pa-spin-min').value = String(wanted);
  }
  function paint() {
    var files = subject('files'), check = subject('check');
    var key = JSON.stringify([source, isLaser(), wanted, [files, check].map(function (s) { var c = s.check; return [s.file, s.name, !!c, c && c.zMin, c && c.tools, c && c.spinUp, entryOf(s.file)]; })]);
    if (key === paintKey) return; paintKey = key;
    paintButton(filesOpen, files); paintButton(checkOpen, check);
    paintSheet();
  }
  function keep(patch) {
    var file = subject(source).file; if (!file) return;
    var entry = entryOf(file) || { thickness: null, ref: 'top' }, next = { thickness: 'thickness' in patch ? patch.thickness : entry.thickness, ref: patch.ref || entry.ref };
    if (saved.set(file, next)) delete session[file]; else session[file] = next;
    read = {};
    paint();
  }
  function open(from) { source = from; read = {}; paintKey = ''; paint(); sheet.open(); }
  filesOpen.addEventListener('click', function () { open('files'); });
  checkOpen.addEventListener('click', function () { open('check'); });
  $('pa-ref-top').addEventListener('click', function () { keep({ ref: 'top' }); });
  $('pa-ref-bed').addEventListener('click', function () { keep({ ref: 'bed' }); });
  $('pa-thickness').addEventListener('change', function () {
    var p = window.CNCNumeric ? window.CNCNumeric.parse(this.value, { min: STOCK_MIN, max: STOCK_MAX, negative: false }) : { state: this.value ? 'invalid' : 'empty' };
    // An unreadable or out-of-range text is never turned into a thickness: the last one stays.
    if (p.state === 'ok') keep({ thickness: p.value }); else if (p.state === 'empty') keep({ thickness: null }); else { paintKey = ''; paint(); }
  });
  $('pa-spin-min').addEventListener('change', function () {
    var p = window.CNCNumeric ? window.CNCNumeric.parse(this.value, { min: SPIN_MIN, max: SPIN_MAX, negative: false }) : { state: 'invalid' };
    if (p.state === 'ok') { wanted = p.value; try { localStorage.setItem(SPIN_KEY, String(wanted)); } catch (_) { /* kept for the session */ } }
    else if (p.state === 'empty') { wanted = SPIN_DEFAULT; try { localStorage.setItem(SPIN_KEY, String(wanted)); } catch (_) { /* kept for the session */ } }
    paintKey = ''; paint();
  });
  if (window.CNCNumeric && window.CNCNumeric.bind) {
    window.CNCNumeric.bind($('pa-thickness'), { min: STOCK_MIN, max: STOCK_MAX, negative: false, optional: true, unit: 'mm', label: t('Épaisseur du brut') });
    window.CNCNumeric.bind($('pa-spin-min'), { min: SPIN_MIN, max: SPIN_MAX, negative: false, optional: true, unit: 's', label: t('Temps voulu') });
  }
  window.addEventListener('cnc-job-status', function (e) { last = e.detail || {}; paint(); });
  window.addEventListener('cnc-file-check', function (e) { var d = e.detail || {}; selection = { file: d.file || '', name: d.name || '', check: d.check || null }; paint(); });
  var current = window.cncCheckScreen && window.cncCheckScreen.selection && window.cncCheckScreen.selection();
  if (current) selection = { file: current.file || '', name: current.name || '', check: current.check || null };
  window.cncProgramAnalysis = { open: open };
  paint();
})(typeof window === 'object' ? window : this);
