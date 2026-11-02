/* Guided preparation of a job (audit 31, U3): file → tool and stock → work
 * origin → checks → ready, in one sheet opened from Préparer. It reuses what
 * exists (the library selection, the loaded program, the travel check, the
 * plate Z zero, the server's readiness) and adds two operator ticks (tool and
 * stock, origin) that are forgotten as soon as the program or the work offset
 * changes. Every step says: done, blocking, or what to do next. Reaching the
 * end starts nothing: Démarrer stays the separate, confirmed action of Suivi.
 * Distinct from the commissioning assistant (first use of a machine). */
(function (root) {
  'use strict';
  var uiLocale = (typeof window !== 'undefined' && window.cncI18n) || { t: function (s) { return s; }, message: function (s) { return s; } };
  var t = function (s) { return uiLocale.t(s); }, msg = uiLocale.message || t;
  function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
  // Formatter of the server's travel pre-check (program-check-view.js), page or Node.
  function checkView() { return root.CNCProgramCheckView || (typeof module === 'object' && module.exports && typeof require === 'function' ? require('./program-check-view.js') : null); }
  // Key of the program the ticks belong to: name, server revision and preview fingerprint.
  function programKey(c, preview) { return c && c.name ? [c.name, c.revision, preview && preview.fingerprint || ''].join(':') : ''; }
  // Key of the work offset (machine − work, rounded to 0.01 mm): a new zero forgets the origin tick.
  function offsetKey(c) {
    var co = c && c.coordinates, m = co && co.mpos, w = co && co.wpos;
    if (!m || !w) return '';
    return ['x', 'y', 'z'].map(function (a) { var d = num(m[a]) !== null && num(w[a]) !== null ? Math.round((m[a] - w[a]) * 100) / 100 : '?'; return d; }).join(',') + ':' + (c.operator && c.operator.wcs || '');
  }
  // assess({machine, selection, preview, previewVerdict, travel, ticks}) -> {steps, ready, blocked}
  // Each step: {id, state: 'ok' | 'todo' | 'warn' | 'blocking', title, detail, next}.
  function assess(input) {
    var c = input.machine || null, sel = input.selection || null, ticks = input.ticks || {}, steps = [];
    var fresh = !!(c && c.fresh), alarm = !!(c && /^alarm/i.test(c.activeState || '')), busy = !!(c && c.workflow && c.workflow !== 'idle');
    var loaded = fresh && !!c.name, same = loaded && !!sel && sel.file === c.name;
    // 1. File.
    var file;
    if (!fresh) file = { state: 'blocking', detail: t('État machine indisponible.'), next: t('Attendez un rapport récent du contrôleur.') };
    else if (busy) file = { state: 'ok', detail: (c.originalName || c.name) + t(' · travail en cours'), next: '' };
    else if (loaded && same) file = { state: 'ok', detail: t('Chargé : ') + (c.originalName || c.name), next: '' };
    else if (loaded && sel) file = { state: 'warn', detail: t('Chargé : ') + (c.originalName || c.name) + t(' · sélectionné : ') + sel.name, next: t('Chargez la sélection si c’est elle que vous voulez usiner.') };
    else if (loaded) file = { state: 'ok', detail: t('Chargé : ') + (c.originalName || c.name), next: '' };
    else if (sel) file = { state: 'todo', detail: t('Sélectionné : ') + sel.name, next: c.canLoad ? t('Chargez-le (Fichiers ou Suivi).') : msg(c.loadReason || t('Chargement indisponible.')) };
    else file = { state: 'blocking', detail: t('Aucun fichier chargé ni sélectionné.'), next: t('Choisissez un parcours dans Fichiers.') };
    if (loaded && input.previewVerdict === 'stale') { file.state = file.state === 'ok' ? 'warn' : file.state; file.next = (file.next ? file.next + ' ' : '') + t('L’aperçu enregistré ne correspond plus au programme : régénérez-le.'); }
    file.id = 'file'; file.title = t('Fichier'); steps.push(file);
    // 2. Tool and stock (operator tick, bound to the program).
    var canTick = loaded && !busy;
    steps.push({ id: 'tool', title: t('Outil et matière'), state: !canTick ? 'todo' : ticks.tool ? 'ok' : 'todo',
      detail: !loaded ? t('Après le chargement du fichier.') : ticks.tool ? t('Vérifiés pour ce programme.') : t('Outil monté, serré, matière et brides en place ?'),
      next: canTick && !ticks.tool ? t('Cochez après vérification.') : '' });
    // 3. Work origin (operator tick, bound to the program and to the current work offset).
    var frame = c && c.operator && c.operator.wcs, offset = offsetKey(c);
    var origin = { id: 'origin', title: t('Origine de travail') };
    if (!loaded) { origin.state = 'todo'; origin.detail = t('Après le chargement du fichier.'); origin.next = ''; }
    else if (!offset) { origin.state = 'warn'; origin.detail = t('Positions du contrôleur inconnues.'); origin.next = t('Attendez un rapport avec les coordonnées.'); }
    else if (ticks.origin) { origin.state = 'ok'; origin.detail = t('Réglée') + (frame ? ' · ' + frame : '') + (c.zeroZ && !c.zeroZ.failed ? t(' · zéro Z plaque ') + c.zeroZ.thickness + ' mm' : ''); origin.next = ''; }
    else { origin.state = 'todo'; origin.detail = t('Zéro XY sur la pièce, zéro Z sur le dessus (plaque ou touche)') + (frame ? ' · ' + frame : ''); origin.next = t('Réglez dans Préparer (Zéro X / Y / Z, plaque), puis cochez.'); }
    steps.push(origin);
    // 4. Checks: alarm, homing, travel, stalled, server reasons.
    var checks = { id: 'checks', title: t('Vérifications'), state: 'ok', detail: '', next: '' }, notes = [];
    if (!fresh) { checks.state = 'blocking'; notes.push(t('État machine indisponible.')); }
    else {
      if (alarm) { checks.state = 'blocking'; notes.push(t('Alarme active : déverrouillez et refaites la prise d’origine.')); }
      // The server's travel pre-check of the loaded program (F2) replaces the client's XY estimate:
      // anything but validated keeps this step out of green.
      var view = checkView(), pc = loaded && view ? view.describe(c.programCheck) : null;
      if (pc) {
        if (pc.verdict !== 'validated' && checks.state !== 'blocking') checks.state = 'warn';
        notes.push(pc.summary);
      } else {
        var s = c.settings || {}, homingOn = num(Number(s.$22)) === 1;
        if (!alarm && !homingOn) { if (checks.state !== 'blocking') checks.state = 'warn'; notes.push(t('Prise d’origine désactivée ($22) : la course machine n’est pas vérifiable.')); }
        var tr = input.travel;
        if (tr && tr.state === 'outside') { if (checks.state !== 'blocking') checks.state = 'warn'; notes.push(tr.message); }
        else if (tr && tr.state === 'ok') notes.push(tr.message);
        else if (tr && tr.state === 'unknown') notes.push(tr.message);
      }
      if (loaded && input.previewVerdict === 'unverified') notes.push(t('Aperçu non vérifié par le serveur.'));
    }
    checks.detail = notes.join(' ') || t('Rien à signaler.');
    steps.push(checks);
    // 5. Ready: the server's own verdict; nothing here starts the job.
    var ready = { id: 'ready', title: t('Prêt à démarrer'), state: 'todo', detail: '', next: '' };
    var ticksOk = !!(ticks.tool && ticks.origin), blocked = steps.some(function (st) { return st.state === 'blocking'; });
    if (!fresh) { ready.state = 'blocking'; ready.detail = t('État machine indisponible.'); }
    else if (busy) { ready.state = 'ok'; ready.detail = t('Travail en cours ou en pause : voir Suivi.'); }
    // Nothing loaded yet: the server's start reason (« Le fichier chargé a changé… » there,
    // validation D2) does not describe that case; the next step is the loading itself.
    else if (!loaded) { ready.state = blocked ? 'blocking' : 'todo'; ready.detail = t('Après le chargement du fichier.'); }
    else if (!c.canStart) { ready.state = blocked ? 'blocking' : 'todo'; ready.detail = msg(c.startReason || t('Démarrage indisponible.')); }
    else if (!ticksOk) { ready.state = 'todo'; ready.detail = t('La machine accepte le démarrage ; il reste des étapes à cocher.'); ready.next = t('Terminez les étapes ci-dessus.'); }
    else { ready.state = 'ok'; ready.detail = t('Tout est coché et la machine est prête.'); ready.next = t('Démarrer se touche dans Suivi, avec sa confirmation. Rien ne part d’ici.'); }
    steps.push(ready);
    return { steps: steps, ready: ready.state === 'ok' && !busy, blocked: blocked, programKey: programKey(c, input.preview), offsetKey: offset };
  }
  var api = { assess: assess, programKey: programKey, offsetKey: offsetKey };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }
  root.CNCJobPreparation = api;
  var shell = window.cncShell, simulation = document.body.getAttribute('data-simulation') === 'true';
  if (!shell || !shell.sheet || !shell.preparationActions || simulation) return;
  var panel = shell.sheet('ks-preparation', t('Préparer le travail'));
  var list = document.createElement('ol'); list.className = 'ks-prep-steps'; list.id = 'ks-prep-steps'; panel.content.appendChild(list);
  var footer = document.createElement('p'); footer.className = 'ks-help'; footer.id = 'ks-prep-footer'; footer.setAttribute('role', 'status'); panel.content.appendChild(footer);
  var open = document.createElement('button'); open.type = 'button'; open.id = 'ks-preparation-open'; open.className = 'ks-secondary'; open.textContent = t('Préparer le travail…');
  open.addEventListener('click', function () { render(); panel.open(); });
  // Entry point in Fichiers, next to the file tools (the flow starts with the file); the
  // Préparer intro row stays three buttons wide so it fits at 1024 x 600.
  var tools = document.querySelector('.ks-file-tools');
  if (tools) tools.insertBefore(open, tools.firstChild); else shell.preparationActions.appendChild(open);
  var machine = null, selection = window.cncLibrarySelection || null, ticks = { tool: false, origin: false }, keys = { program: '', offset: '' }, rows = {};
  // The preview of this program version only: same file and, when both are known, same fingerprint.
  function preview() { var img = document.getElementById('home-job-image'), pv = img && img.cncPreview; return pv && machine && pv.file === machine.name && !(machine.fingerprint && pv.fingerprint && pv.fingerprint !== machine.fingerprint) ? pv : null; }
  // A preview drawn from another version of the loaded program counts as stale.
  function verdict() { var img = document.getElementById('home-job-image'), pv = img && img.cncPreview; if (pv && machine && pv.file === machine.name && !preview()) return 'stale'; return img && img.cncPreviewVerdict ? img.cncPreviewVerdict : ''; }
  function row(step) {
    var li = rows[step.id];
    if (!li) {
      li = document.createElement('li'); li.className = 'ks-prep-step'; li.setAttribute('data-step', step.id);
      var head = document.createElement('div'); head.className = 'ks-prep-head';
      var mark = document.createElement('span'); mark.className = 'ks-prep-mark'; mark.setAttribute('aria-hidden', 'true'); head.appendChild(mark);
      var title = document.createElement('b'); head.appendChild(title);
      var state = document.createElement('span'); state.className = 'ks-prep-state'; head.appendChild(state);
      li.appendChild(head);
      var detail = document.createElement('p'); detail.className = 'ks-prep-detail'; li.appendChild(detail);
      var next = document.createElement('p'); next.className = 'ks-prep-next'; li.appendChild(next);
      if (step.id === 'tool' || step.id === 'origin') {
        var label = document.createElement('label'); label.className = 't-check ks-prep-check';
        var box = document.createElement('input'); box.type = 'checkbox'; box.id = 'ks-prep-' + step.id;
        box.addEventListener('change', function () { ticks[step.id] = !!box.checked; render(); });
        label.appendChild(box); var text = document.createElement('span'); text.textContent = step.id === 'tool' ? t('Outil et matière vérifiés') : t('Origine de travail réglée'); label.appendChild(text);
        li.appendChild(label); li._box = box;
      }
      if (step.id === 'file') {
        var load = document.createElement('button'); load.type = 'button'; load.className = 't-btn'; load.id = 'ks-prep-load'; load.textContent = t('Charger la sélection');
        load.addEventListener('click', function () { var b = document.getElementById('job-load'); if (b && !b.disabled) b.click(); });
        li.appendChild(load); li._load = load;
      }
      li._title = title; li._state = state; li._detail = detail; li._next = next;
      rows[step.id] = li; list.appendChild(li);
    }
    return li;
  }
  var WORDS = { ok: t('fait'), todo: t('à faire'), warn: t('attention'), blocking: t('bloquant') };
  function render() {
    var pv = preview(), travel = machine && machine.name && window.CNCTravelCheck ? window.CNCTravelCheck.check(pv, machine) : null;
    var result = assess({ machine: machine, selection: selection, preview: pv, previewVerdict: verdict(), travel: travel, ticks: ticks });
    // Ticks are forgotten when the program or the work offset changes.
    if (result.programKey !== keys.program) { ticks.tool = false; ticks.origin = false; keys.program = result.programKey; keys.offset = result.offsetKey; result = assess({ machine: machine, selection: selection, preview: pv, previewVerdict: verdict(), travel: travel, ticks: ticks }); }
    else if (result.offsetKey !== keys.offset) { if (ticks.origin) { ticks.origin = false; result = assess({ machine: machine, selection: selection, preview: pv, previewVerdict: verdict(), travel: travel, ticks: ticks }); } keys.offset = result.offsetKey; }
    result.steps.forEach(function (step) {
      var li = row(step);
      if (li.getAttribute('data-state') !== step.state) li.setAttribute('data-state', step.state);
      if (li._title.textContent !== step.title) li._title.textContent = step.title;
      var word = WORDS[step.state] || step.state; if (li._state.textContent !== word) li._state.textContent = word;
      if (li._detail.textContent !== step.detail) li._detail.textContent = step.detail;
      if (li._next.textContent !== step.next) li._next.textContent = step.next;
      if (li._box) { var can = !!(machine && machine.fresh && machine.name && machine.workflow === 'idle'); if (li._box.disabled !== !can) li._box.disabled = !can; if (li._box.checked !== !!ticks[step.id]) li._box.checked = !!ticks[step.id]; }
      if (li._load) { var b = document.getElementById('job-load'), show = step.state !== 'ok' && !!selection && !!(b && !b.disabled); if (li._load.hidden !== !show) li._load.hidden = !show; }
    });
    var foot = result.ready ? t('Prêt : ouvrez Suivi et touchez Démarrer. Ce panneau ne lance rien.') : result.blocked ? t('Une étape bloque le démarrage.') : t('Étapes restantes ci-dessus. Ce panneau ne lance rien.');
    if (footer.textContent !== foot) footer.textContent = foot;
    var tone = result.ready ? 'ok' : result.blocked ? 'danger' : 'warn'; if (open.getAttribute('data-tone') !== tone) open.setAttribute('data-tone', tone);
  }
  window.addEventListener('cnc-job-status', function (e) { var d = e && e.detail || {}; if (d.simulation) return; machine = d.machine || null; render(); });
  window.addEventListener('cnc-library-select', function (e) { selection = e && e.detail || null; render(); });
  window.addEventListener('cnc-library-preview-updated', render);
  render();
  window.cncJobPreparation = { render: render, ticks: function () { return { tool: ticks.tool, origin: ticks.origin }; } };
})(typeof window === 'object' ? window : this);
