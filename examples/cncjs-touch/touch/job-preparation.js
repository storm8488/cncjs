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
    // Laser profile (PROFILES-CONTRACT.md §3): material and focus instead of tool and stock, an XY
    // origin checked by framing; no Z zero with a plate. Unknown or CNC: the CNC steps.
    var profile = c && c.machineProfile && typeof c.machineProfile === 'object' ? c.machineProfile : null, laser = !!(profile && profile.kind === 'laser');
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
    if (laser) steps.push({ id: 'tool', title: t('Matériau et mise au point'), state: !canTick ? 'todo' : ticks.tool ? 'ok' : 'todo',
      detail: !loaded ? t('Après le chargement du fichier.') : ticks.tool ? t('Vérifiés pour ce programme.') : t('Matériau posé à plat et maintenu ; mise au point : laser éteint, tête au-dessus du matériau, hauteur réglée avec la cale ou la méthode du fabricant, tête serrée, cale retirée ; lunettes, assistance d’air et extraction en marche ?'),
      next: canTick && !ticks.tool ? t('Cochez après vérification. Aucune commande n’est envoyée.') : '' });
    else steps.push({ id: 'tool', title: t('Outil et matière'), state: !canTick ? 'todo' : ticks.tool ? 'ok' : 'todo',
      detail: !loaded ? t('Après le chargement du fichier.') : ticks.tool ? t('Vérifiés pour ce programme.') : t('Outil monté, serré, matière et brides en place ?'),
      next: canTick && !ticks.tool ? t('Cochez après vérification.') : '' });
    // 3. Work origin (operator tick, bound to the program and to the current work offset).
    var frame = c && c.operator && c.operator.wcs, offset = offsetKey(c);
    var origin = { id: 'origin', title: t('Origine de travail') };
    if (!loaded) { origin.state = 'todo'; origin.detail = t('Après le chargement du fichier.'); origin.next = ''; }
    else if (!offset) { origin.state = 'warn'; origin.detail = t('Positions du contrôleur inconnues.'); origin.next = t('Attendez un rapport avec les coordonnées.'); }
    else if (ticks.origin) { origin.state = 'ok'; origin.detail = t('Réglée') + (frame ? ' · ' + frame : '') + (!laser && c.zeroZ && !c.zeroZ.failed ? t(' · zéro Z plaque ') + c.zeroZ.thickness + ' mm' : ''); origin.next = ''; }
    else if (laser) { origin.state = 'todo'; origin.detail = t('Zéro XY sur le matériau ; la hauteur est celle de la mise au point') + (frame ? ' · ' + frame : ''); origin.next = t('Réglez dans Préparer (Zéro X / Y), vérifiez avec le cadrage (Suivi), puis cochez.'); }
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
      if (profile && profile.coherent === false) { if (checks.state !== 'blocking') checks.state = 'warn'; notes.push(t('Réglages du contrôleur incohérents avec le type de machine : voir Réglages → Type de machine.')); }
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
    return { steps: steps, ready: ready.state === 'ok' && !busy, blocked: blocked, programKey: programKey(c, input.preview), offsetKey: offset, laser: laser };
  }
  // FR/EN/ES lines of the v2 Préparer presenter below, registered only when it is built (v2 open).
  var V2_MESSAGES = [
    ['Comparer les placements', 'Compare placements', 'Comparar colocaciones'],
    ['Placement · dessus XY · affichage seul', 'Placement · XY top view · display only', 'Colocación · vista superior XY · solo visualización'],
    ['Les deux', 'Both', 'Ambas'],
    ['Actuelle', 'Current', 'Actual'],
    ['Hypothèse XY', 'XY hypothesis', 'Hipótesis XY'],
    ['Cotes', 'Dimensions', 'Cotas'],
    ['1 · Programme chargé', '1 · Loaded program', '1 · Programa cargado'],
    ['Aucun programme chargé', 'No program loaded', 'Ningún programa cargado'],
    ['révision', 'revision', 'revisión'],
    ['2 · Origine X Y', '2 · X Y origin', '2 · Origen X Y'],
    ['À confirmer', 'To confirm', 'Por confirmar'],
    ['Suspendu', 'Suspended', 'Suspendido'],
    ['Inconnu', 'Unknown', 'Desconocido'],
    ['Hypothèse : zéro X Y à la position de l’outil.', 'Hypothesis: X Y zero at the tool position.', 'Hipótesis: cero X Y en la posición de la herramienta.'],
    ['Poser X Y ici…', 'Set X Y here…', 'Fijar X Y aquí…'],
    ['Ouvre « Déplacement réel » : X = 0 puis Y = 0, chacun avec sa confirmation.', 'Opens « Real motion »: X = 0 then Y = 0, each with its confirmation.', 'Abre « Movimiento real »: X = 0 y luego Y = 0, cada uno con su confirmación.'],
    ['Origine réelle indisponible ici : « Déplacement réel » n’est pas ouvert sur ce poste.', 'Real origin unavailable here: « Real motion » is not open on this station.', 'Origen real no disponible aquí: « Movimiento real » no está abierto en este puesto.'],
    ['3 · Origine Z et contrôle final', '3 · Z origin and final check', '3 · Origen Z y control final'],
    ['Z séparé · validation manuelle.', 'Z separate · manual validation.', 'Z aparte · validación manual.'],
    ['Contrôle final…', 'Final check…', 'Control final…'],
    ['Coordonnées…', 'Coordinates…', 'Coordenadas…'],
    ['Décalage X', 'X offset', 'Desplazamiento X'],
    ['Décalage Y', 'Y offset', 'Desplazamiento Y'],
    ['Z conserve son origine actuelle.', 'Z keeps its current origin.', 'Z conserva su origen actual.'],
    ['Dans la course machine en X et Y', 'Within machine travel in X and Y', 'Dentro del recorrido de la máquina en X e Y'],
    ['Hors course machine en X ou Y', 'Outside machine travel in X or Y', 'Fuera del recorrido de la máquina en X o Y'],
    ['△ Course machine non vérifiée', '△ Machine travel not verified', '△ Recorrido de la máquina no verificado'],
    ['Estimation de la tablette ($130–$132), pas le contrôle du serveur. Z et collisions non vérifiés.', 'Tablet estimate ($130–$132), not the server check. Z and collisions not verified.', 'Estimación de la tableta ($130–$132), no el control del servidor. Z y colisiones no verificados.'],
    ['Données insuffisantes ($23, course, repère ou unités). Z et collisions non vérifiés.', 'Insufficient data ($23, travel, frame or units). Z and collisions not verified.', 'Datos insuficientes ($23, recorrido, sistema o unidades). Z y colisiones no verificados.'],
    ['Marges', 'Margins', 'Márgenes'],
    ['Comparaison suspendue : travail en cours.', 'Comparison suspended: job running.', 'Comparación suspendida: trabajo en curso.'],
    ['Comparaison suspendue : travail en pause.', 'Comparison suspended: job paused.', 'Comparación suspendida: trabajo en pausa.'],
    ['Comparaison suspendue : alarme.', 'Comparison suspended: alarm.', 'Comparación suspendida: alarma.'],
    ['Comparaison suspendue : état machine indisponible.', 'Comparison suspended: machine state unavailable.', 'Comparación suspendida: estado de la máquina no disponible.'],
    ['Aucun programme chargé : rien à comparer.', 'No program loaded: nothing to compare.', 'Ningún programa cargado: nada que comparar.'],
    ['Brut déclaré', 'Declared stock', 'Bruto declarado'],
    ['Étendue X', 'X extent', 'Extensión X'],
    ['Étendue Y', 'Y extent', 'Extensión Y'],
    ['Profondeur Z', 'Z depth', 'Profundidad Z'],
    ['Distance', 'Distance', 'Distancia'],
    ['fiche projet, pas une mesure', 'project sheet, not a measurement', 'ficha de proyecto, no una medida'],
    ['saisie opérateur, pas une mesure', 'operator entry, not a measurement', 'entrada del operador, no una medida'],
    ['programme, valeur nominale', 'program, nominal value', 'programa, valor nominal'],
    ['Aucune cote disponible pour ce programme.', 'No dimension available for this program.', 'Ninguna cota disponible para este programa.'],
    ['Déplacer l’outil…', 'Move the tool…', 'Mover la herramienta…'],
    ['Déplacer l’outil', 'Move the tool', 'Mover la herramienta'],
    ['Revenir à la comparaison', 'Back to the comparison', 'Volver a la comparación'],
    ['Toucher le dessin ne déplace jamais l’outil.', 'Touching the drawing never moves the tool.', 'Tocar el dibujo nunca mueve la herramienta.']
  ];
  var api = { assess: assess, programKey: programKey, offsetKey: offsetKey, v2Messages: V2_MESSAGES };
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
        label.appendChild(box); var text = document.createElement('span'); label.appendChild(text);
        li.appendChild(label); li._box = box; li._tickText = text;
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
      if (li._tickText) { var tick = step.id === 'tool' ? (result.laser ? t('Matériau et mise au point vérifiés') : t('Outil et matière vérifiés')) : t('Origine de travail réglée'); if (li._tickText.textContent !== tick) li._tickText.textContent = tick; }
      if (li._load) { var b = document.getElementById('job-load'), show = step.state !== 'ok' && !!selection && !!(b && !b.disabled); if (li._load.hidden !== !show) li._load.hidden = !show; }
      // Visual origin (origin-preview.js, once loaded): its verdict under the step, display only; the tick stays manual.
      if (step.id === 'origin' && window.CNCOriginPreview) {
        if (!li._hint) { li._hint = document.createElement('p'); li._hint.className = 'ks-prep-origin-hint'; li.insertBefore(li._hint, li._next); }
        var hint = window.CNCOriginPreview.hint(machine, pv) || '';
        if (li._hint.textContent !== hint) li._hint.textContent = hint; if (li._hint.hidden !== !hint) li._hint.hidden = !hint;
      }
    });
    var foot = result.ready ? t('Prêt : ouvrez Suivi et touchez Démarrer. Ce panneau ne lance rien.') : result.blocked ? t('Une étape bloque le démarrage.') : t('Étapes restantes ci-dessus. Ce panneau ne lance rien.');
    if (footer.textContent !== foot) footer.textContent = foot;
    var tone = result.ready ? 'ok' : result.blocked ? 'danger' : 'warn'; if (open.getAttribute('data-tone') !== tone) open.setAttribute('data-tone', tone);
  }
  // Visual origin in Préparer (Performance UI, lot O): only in the wide layout, on a CNC machine, while
  // Préparer is visible; the advanced module is loaded then, never otherwise. Display only.
  var originMounted = false, originRequest = 0;
  function originWanted() {
    var jog = document.getElementById('screen-jog'), P = window.cncProfile, L = window.cncLayout;
    try { return !!(jog && jog.classList.contains('active') && L && L.wide() === true && P && P.performance() === 'performance' && P.kind() !== 'laser'); } catch (_) { return false; }
  }
  // Performance v2 (cncV2, L0 contract): its layout (body.perf-v2) and its resource gate are distinct.
  function v2State() { var v = window.cncV2; try { return v && typeof v.state === 'function' && typeof v.gate === 'function' ? { layout: v.state().layout === true, hold: v.state().holdLayout === true, open: v.gate() === true } : null; } catch (_) { return null; } }
  // A v2 page whose gate has closed (Eco, GPU loss, preference off): no origin is opened again.
  function v2Closed() { var s = v2State(); return !!s && s.layout && !s.open; }
  // A v2 page outside a safe Idle (Run/Hold/Alarm/unknown): no advanced load now; cnc-v2-change
  // (safeIdle is part of the state) brings the request back at rest.
  function v2Busy() { var s = v2State(), idle = false; try { idle = window.cncV2.state().safeIdle === true; } catch (_) {} return !!s && s.layout && !idle; }
  function originSync() {
    if (!originWanted()) {
      // v2: while the layout is held (Run/Hold/Alarm/unknown), the card keeps its rectangle in Préparer;
      // origin-preview.js itself stops drawing once the gate is closed (Eco during a job).
      var held = v2State(), jog = document.getElementById('screen-jog');
      if (originMounted && held && held.layout && held.hold && jog && jog.classList.contains('active')) return;
      originRequest++; if (originMounted) { originMounted = false; v2Unmounted(); if (window.CNCOriginPreview) window.CNCOriginPreview.unmount(); } return;
    }
    if (originMounted) return;
    var request = ++originRequest;
    if (v2Closed() || v2Busy()) return;
    function mount() {
      if (request !== originRequest || originMounted || !originWanted() || v2Closed() || !window.CNCOriginPreview) return;
      originMounted = true; window.CNCOriginPreview.mount(document.getElementById('screen-jog')); v2Mounted(); render();
    }
    // Without preview-gl.js the card still says why the 3D view is missing; a refusal because the v2
    // gate closed is not a missing module: it never mounts (it would reopen a closed v2 session).
    window.cncProfile.loadAdvanced(['preview-gl.js', 'origin-preview.js']).then(mount, function (error) { if (!(error && error.message === 'v2-gate-closed')) mount(); });
  }
  ['cnc-screen-change', 'cnc-layout-change', 'cnc-profile-change'].forEach(function (name) { window.addEventListener(name, originSync); });
  // A v2 state change (hold released, gate closed) is applied in a frame, never in its handler.
  var syncFrame = 0;
  window.addEventListener('cnc-v2-change', function () { if (!syncFrame && window.requestAnimationFrame) syncFrame = window.requestAnimationFrame(function () { syncFrame = 0; originSync(); if (originMounted && !v2.active) v2Mounted(); }); });

  // ---- Performance v2 · Préparer (lot L5; REFLEXION.md §4 propositions 5–6, §5 « Préparer ») ----
  // Its lines live in V2_MESSAGES (registered with the v2 presenter), not in the static catalogues.
  function tv2(s) { return t(s); }
  // Only under body.perf-v2 (cncV2.state().layout), on the real page (mounts.prepare.origin), once the
  // visual origin card is mounted. It presents L2's placement model (cncV2.use('placement')) beside the
  // scene: comparison Les deux / Actuelle / Hypothèse (CNCOriginPreview.comparison, same framing), the
  // XY offsets only when computable, Z unchanged, the travel verdict as qualified as L2 gives it
  // (unknown stays unknown), at most four dimensions with their source, and « Déplacer l'outil… », which
  // shows the existing jog card in its own zone (CSS: 96 px targets, 24 px from the scene).
  // Nothing here sends, zeroes, moves or ticks: the zero buttons stay in the coordinates card with their
  // confirmation, and no listener is put on the scene. Every DOM write happens in requestAnimationFrame.
  var v2 = { built: false, active: false, frame: 0, jog: false, cotes: true, machine: null, nodes: null, life: null, declaredKey: '', reading: false };
  function v2Layout() { var s = v2State(), v = window.cncV2, mount = null; try { mount = s && s.layout && v.mounts ? v.mounts.get('prepare') : null; } catch (_) {} return mount && mount.origin ? mount : null; }
  function v2Schedule() { if (v2.active && !v2.frame && window.requestAnimationFrame) v2.frame = window.requestAnimationFrame(v2Render); }
  function el(tag, cls, text, parent) { var n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; if (parent) parent.appendChild(n); return n; }
  function set(node, text) { text = String(text); if (node.textContent !== text) node.textContent = text; }
  function hide(node, hidden) { if (node.hidden !== hidden) node.hidden = hidden; }
  function attr(node, name, value) { if (node.getAttribute(name) !== value) node.setAttribute(name, value); }
  function prop(node, name, value) { if (node[name] !== value) node[name] = value; }
  // An existing control this presenter may relay a tap to: present, shown and enabled.
  function relayTarget(id) { var b = document.getElementById(id); return b && !b.hidden && !b.disabled ? b : null; }
  function locale() { return window.cncI18n && window.cncI18n.locale || 'fr-FR'; }
  function decimals(v, n) { return Math.abs(v).toLocaleString(locale(), { minimumFractionDigits: n, maximumFractionDigits: n }); }
  // Signed offset, three decimals: '+18,000'; a missing value is a dash, never zero.
  function signed(v) { return num(v) === null ? '—' : (v < 0 ? '−' : '+') + decimals(v, 3); }
  function mm(v) { return num(v) === null ? '—' : (v < 0 ? '−' : '') + decimals(v, 1); }
  function v2Build(mount) {
    if (v2.built) return;
    v2.built = true; v2.content = mount.content;
    if (window.cncI18n && typeof window.cncI18n.registerCatalog === 'function') { try { window.cncI18n.registerCatalog('performance-v2-preparer', V2_MESSAGES); } catch (_) { /* French text stays readable. */ } }
    var root = mount.content, n = {};
    // Comparison bar above the scene: three exclusive choices and the dimensions toggle.
    n.bar = el('div', 'pv2-bar', '', root); n.bar.setAttribute('role', 'group'); n.bar.setAttribute('aria-label', tv2('Comparer les placements'));
    el('span', 'pv2-bar-title', tv2('Placement · dessus XY · affichage seul'), n.bar);
    n.modes = {};
    [['both', tv2('Les deux')], ['current', tv2('Actuelle')], ['hypothesis', tv2('Hypothèse XY')]].forEach(function (m) {
      var b = el('button', 'pv2-mode', m[1], n.bar); b.type = 'button'; b.id = 'pv2-mode-' + m[0]; b.setAttribute('data-mode', m[0]); b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () { if (window.CNCOriginPreview && window.CNCOriginPreview.comparison) window.CNCOriginPreview.comparison(m[0]); v2Schedule(); });
      n.modes[m[0]] = b;
    });
    n.cotesToggle = el('button', 'pv2-cotes-toggle', tv2('Cotes'), n.bar); n.cotesToggle.type = 'button'; n.cotesToggle.id = 'pv2-cotes-toggle'; n.cotesToggle.setAttribute('aria-pressed', 'true');
    n.cotesToggle.addEventListener('click', function () { v2.cotes = !v2.cotes; v2Schedule(); });
    // Dimensions under the scene: at most four, each with its source.
    n.cotes = el('ul', 'pv2-cotes', '', root); n.cotes.id = 'pv2-cotes';
    // Summary beside the scene.
    n.summary = el('section', 'pv2-summary', '', root); n.summary.id = 'pv2-summary';
    var program = el('div', 'pv2-program', '', n.summary), programHead = el('div', 'pv2-program-head', '', program);
    el('span', 'pv2-eyebrow', tv2('1 · Programme chargé'), programHead); n.programSub = el('span', 'pv2-sub', '', programHead);
    n.program = el('b', 'pv2-program-name', '', program);
    var origin = el('div', 'pv2-origin', '', n.summary), head = el('div', 'pv2-origin-head', '', origin);
    el('h3', '', tv2('2 · Origine X Y'), head); n.state = el('span', 'pv2-state', '', head); n.state.id = 'pv2-state';
    n.hypothesis = el('p', 'pv2-hypothesis', tv2('Hypothèse : zéro X Y à la position de l’outil.'), origin);
    var offsets = el('div', 'pv2-offsets', '', origin); n.offsets = {};
    ['x', 'y'].forEach(function (a) {
      var box = el('div', 'pv2-offset', '', offsets); el('span', '', tv2(a === 'x' ? 'Décalage X' : 'Décalage Y'), box);
      var value = el('strong', '', '', box); value.id = 'pv2-offset-' + a; n.offsets[a] = value;
    });
    el('p', 'pv2-z', tv2('Z conserve son origine actuelle.'), origin);
    // « Poser X Y ici… » relays to the existing origin entry (real-motion.js « Déplacement réel »), whose
    // X = 0 and Y = 0 keep their own ticket and confirmation: no new command path.
    n.setXY = el('button', 'pv2-set-xy', tv2('Poser X Y ici…'), origin); n.setXY.type = 'button'; n.setXY.id = 'pv2-set-xy';
    n.setXY.addEventListener('click', function () { var entry = relayTarget('real-motion-open'); if (entry && v2Phase(v2.machine) === 'idle') entry.click(); });
    n.travel = el('div', 'pv2-travel', '', n.summary); n.travel.id = 'pv2-travel'; n.travel.setAttribute('role', 'status');
    n.travelTitle = el('b', '', '', n.travel); n.travelText = el('p', '', '', n.travel); n.margins = el('p', 'pv2-margins', '', n.travel);
    // Step 3: Z stays its own operation; the final check is the guided preparation sheet of this module.
    var final = el('div', 'pv2-final', '', n.summary), finalText = el('div', '', '', final);
    el('h3', '', tv2('3 · Origine Z et contrôle final'), finalText); el('p', 'pv2-sub', tv2('Z séparé · validation manuelle.'), finalText);
    n.final = el('button', 'pv2-final-open', tv2('Contrôle final…'), final); n.final.type = 'button'; n.final.id = 'pv2-final-open';
    n.final.addEventListener('click', function () { render(); panel.open(); });
    n.open = el('button', 'pv2-jog-open', tv2('Déplacer l’outil…'), n.summary); n.open.type = 'button'; n.open.id = 'pv2-jog-open';
    n.open.addEventListener('click', function () { v2.jog = true; v2.focus = 'close'; v2Schedule(); });
    // The coordinates card is not shown beside the comparison: its two tools stay one tap away.
    var tools = el('div', 'pv2-tools', '', n.summary); n.tools = {};
    [['speed', 'ks-jog-settings', tv2('Vitesse du test…')], ['coordinates', 'coordinate-open', tv2('Coordonnées…')]].forEach(function (x) {
      var b = el('button', '', x[2], tools); b.type = 'button'; b.id = 'pv2-tool-' + x[0];
      b.addEventListener('click', function () { var target = relayTarget(x[1]); if (target) target.click(); });
      n.tools[x[1]] = b;
    });
    // Head of the jog zone (the jog card itself is the existing .ks-motion-arrows, shown by CSS).
    n.jogHead = el('div', 'pv2-jog-head', '', root); n.jogHead.id = 'pv2-jog-head';
    var jogText = el('div', '', '', n.jogHead); el('h3', '', tv2('Déplacer l’outil'), jogText);
    el('p', '', tv2('Toucher le dessin ne déplace jamais l’outil.'), jogText);
    n.close = el('button', 'pv2-jog-close', tv2('Revenir à la comparaison'), n.jogHead); n.close.type = 'button'; n.close.id = 'pv2-jog-close';
    n.close.addEventListener('click', function () { v2.jog = false; v2.focus = 'open'; v2Schedule(); });
    v2.nodes = n;
  }
  function v2Mounted() {
    var mount = v2Layout();
    if (!mount) return;
    v2.active = true; v2.jog = false; v2.cotes = true; v2.declaredKey = '';
    try { v2.life = window.cncV2.lifecycle.scope('prepare', 'prepare'); } catch (_) { v2.life = null; }
    v2Schedule();
  }
  function v2Unmounted() {
    if (!v2.active) return;
    v2.active = false; v2.reading = false;
    if (v2.frame && window.cancelAnimationFrame) window.cancelAnimationFrame(v2.frame); v2.frame = 0;
    if (v2.life) { v2.life.dispose(); v2.life = null; }
    v2Clear();
  }
  // Hidden presenter and no data-pv2: the v2 rules of origin-preview.css no longer apply.
  function v2Clear() {
    var jog = document.getElementById('screen-jog');
    if (v2.content) hide(v2.content, true);
    if (jog && jog.getAttribute('data-pv2') !== null) jog.removeAttribute('data-pv2');
  }
  // 'stale' | 'alarm' | 'running' | 'paused' | 'empty' | 'idle' (idle only at a safe, fresh v2 Idle).
  function v2Phase(m) {
    if (!m || !m.fresh) return 'stale';
    if (/^alarm/i.test(m.activeState || '')) return 'alarm';
    if (m.workflow === 'paused' || /^hold/i.test(m.activeState || '')) return 'paused';
    if (m.workflow && m.workflow !== 'idle') return 'running';
    if (!m.name) return 'empty';
    try { if (!window.cncV2.state().safeIdle) return 'stale'; } catch (_) { return 'stale'; }
    return 'idle';
  }
  function samePrint(a, b) { var k = function (s) { return String(s || '').toLowerCase().replace(/^sha256:/, ''); }; return !!a && !!b && k(a) === k(b); }
  // Declarations for L2's placement: the project sheet's stock (bound to the same fingerprint) and the
  // program's nominal extents from the loaded preview. Data only; nothing is measured or checked off.
  function v2Declarations(meta, identity) {
    var list = [], P = window.CNCProjects, sheet = null;
    try { sheet = P && typeof P.declared === 'function' ? P.declared(identity.file) : null; } catch (_) {}
    if (sheet && sheet.version === 'current' && samePrint(sheet.fingerprint, identity.fingerprint) && sheet.stock)
      list.push({ kind: 'stock', source: 'project', identity: identity, value: { x: sheet.stock.x, y: sheet.stock.y, z: sheet.stock.z }, units: 'mm', assumptions: [] });
    var p = meta && meta.projection, b = p && p.units === 'mm' && p.bounds, z = meta && meta.zBounds;
    if (Array.isArray(b) && b.length === 4 && b.every(function (v) { return num(v) !== null; }) && b[2] >= b[0] && b[3] >= b[1]) {
      list.push({ kind: 'dimension', source: 'program', identity: identity, value: { axis: 'x', valueMm: b[2] - b[0] }, units: 'mm', assumptions: [] });
      list.push({ kind: 'dimension', source: 'program', identity: identity, value: { axis: 'y', valueMm: b[3] - b[1] }, units: 'mm', assumptions: [] });
      if (Array.isArray(z) && z.length === 2 && num(z[0]) !== null && num(z[1]) !== null && z[1] >= z[0])
        list.push({ kind: 'dimension', source: 'program', identity: identity, value: { axis: 'z', valueMm: z[1] - z[0] }, units: 'mm', assumptions: [] });
    }
    return list;
  }
  // Supplies the declarations once per loaded job (and project sheet revision), at a safe Idle, with
  // the same loaded preview origin-preview.js reads (cncDashboardView.loadedPreview(), cached).
  function v2Supply(placement) {
    var v = window.cncV2, id = placement.identity, P = window.CNCProjects, sheet = null;
    if (!placement.available || !id || !id.jobKey || !v2.life || v2.reading) return;
    try { sheet = P && typeof P.declared === 'function' ? P.declared(id.file) : null; } catch (_) {}
    var key = JSON.stringify([id.jobKey, sheet]);
    if (key === v2.declaredKey) return;
    var dash = window.cncDashboardView, lease = v2.life.token();
    if (!lease || !dash || typeof dash.loadedPreview !== 'function') return;
    var cancelled = false, untrack = v2.life.track('read', function () { cancelled = true; v2.reading = false; });
    if (cancelled) return;
    v2.reading = true;
    function done(meta) {
      untrack(); v2.reading = false;
      if (cancelled || !v2.active || !v2.life || !v2.life.valid(lease)) return;
      var m = v2.machine, now = v.use('placement').snapshot();
      if (!m || !now.identity || now.identity.jobKey !== id.jobKey) return;
      v2.declaredKey = key;
      // Only the preview of this exact program version: the provider would otherwise reset the placement.
      if (!meta || meta.file !== m.name || !meta.fingerprint || meta.fingerprint !== m.fingerprint) return;
      v.use('placement').update({ machine: m, preview: meta, declarations: v2Declarations(meta, id) });
    }
    try { dash.loadedPreview().then(done, function () { done(null); }); } catch (_) { done(null); }
  }
  var SOURCES = { project: 'fiche projet, pas une mesure', operator: 'saisie opérateur, pas une mesure', program: 'programme, valeur nominale' };
  function cote(d) {
    var v = d.value || {}, label, value;
    if (d.kind === 'stock') { label = tv2('Brut déclaré'); value = [v.x, v.y, v.z].filter(function (x) { return num(x) !== null; }).map(function (x) { return decimals(x, 1); }).join(' × ') + ' mm'; }
    else if (d.kind === 'dimension') { label = v.axis === 'x' ? tv2('Étendue X') : v.axis === 'y' ? tv2('Étendue Y') : v.axis === 'z' ? tv2('Profondeur Z') : tv2('Distance'); value = mm(v.valueMm) + ' mm'; }
    else return null;
    return { label: label, value: value, source: tv2(SOURCES[d.source] || 'Source inconnue') };
  }
  function v2Render() {
    v2.frame = 0;
    var mount = v2Layout(), jog = document.getElementById('screen-jog');
    if (!v2.active || !jog) return;
    // The v2 layout ended (known Idle after a loss of eligibility) while the card stays: back to v1.
    if (!mount) { v2Clear(); return; }
    v2Build(mount);
    var n = v2.nodes, m = v2.machine, phase = v2Phase(m), v = window.cncV2, placement = null;
    try { placement = v.use('placement').snapshot(); } catch (_) {}
    if (phase !== 'idle' || !placement) placement = null;
    else if (placement.identity && placement.identity.jobKey) v2Supply(placement);
    hide(mount.content, false);
    attr(jog, 'data-pv2', v2.jog ? 'jog' : 'compare');
    // Comparison bar: the mode is origin-preview's (it resets to « Les deux » at each mount).
    var mode = window.CNCOriginPreview && window.CNCOriginPreview.comparison ? window.CNCOriginPreview.comparison() : 'both';
    Object.keys(n.modes).forEach(function (k) { attr(n.modes[k], 'aria-pressed', k === mode ? 'true' : 'false'); });
    attr(n.cotesToggle, 'aria-pressed', v2.cotes ? 'true' : 'false');
    // Program.
    set(n.program, m && m.name ? m.originalName || m.name : tv2('Aucun programme chargé'));
    set(n.programSub, m && m.name && m.revision !== undefined && m.revision !== null ? tv2('révision') + ' ' + m.revision : '');
    // Origin X Y: offsets only when L2 computed them; '—' otherwise, never a zero.
    var h = placement && placement.available ? placement.hypothesis : null;
    set(n.state, phase !== 'idle' && phase !== 'empty' ? tv2('Suspendu') : h ? tv2('À confirmer') : tv2('Inconnu'));
    attr(n.state, 'data-tone', phase !== 'idle' && phase !== 'empty' ? 'neutral' : h ? 'info' : 'neutral');
    set(n.offsets.x, h ? signed(h.deltaMm.x) + ' mm' : '—'); set(n.offsets.y, h ? signed(h.deltaMm.y) + ' mm' : '—');
    // Travel: L2's verdict as it is. Unknown stays a warning; suspended states say so.
    var tr = placement && placement.travel, title, text, tone, margins = '';
    if (phase === 'running' || phase === 'paused' || phase === 'alarm' || phase === 'stale') {
      title = tv2('Suspendu'); tone = 'neutral';
      text = tv2(phase === 'running' ? 'Comparaison suspendue : travail en cours.' : phase === 'paused' ? 'Comparaison suspendue : travail en pause.' : phase === 'alarm' ? 'Comparaison suspendue : alarme.' : 'Comparaison suspendue : état machine indisponible.');
    } else if (phase === 'empty') { title = tv2('Inconnu'); tone = 'neutral'; text = tv2('Aucun programme chargé : rien à comparer.'); }
    else if (tr && h && (tr.verdict === 'inside' || tr.verdict === 'outside')) {
      title = tv2(tr.verdict === 'inside' ? 'Dans la course machine en X et Y' : 'Hors course machine en X ou Y');
      tone = tr.verdict === 'inside' ? 'ok' : 'danger';
      text = tv2('Estimation de la tablette ($130–$132), pas le contrôle du serveur. Z et collisions non vérifiés.');
      var mg = tr.marginsMm;
      if (mg && mg.x && mg.y) margins = tv2('Marges') + ' · X ' + mm(mg.x.min) + ' / ' + mm(mg.x.max) + ' mm · Y ' + mm(mg.y.min) + ' / ' + mm(mg.y.max) + ' mm';
    } else { title = tv2('△ Course machine non vérifiée'); tone = 'warn'; text = tv2('Données insuffisantes ($23, course, repère ou unités). Z et collisions non vérifiés.'); }
    set(n.travelTitle, title); set(n.travelText, text); set(n.margins, margins); hide(n.margins, !margins); attr(n.travel, 'data-tone', tone);
    // Dimensions: at most four, with their source; hidden by « Cotes » without moving the scene.
    var list = (placement && placement.declarations || []).map(cote).filter(Boolean).slice(0, 4);
    var sig = JSON.stringify(list);
    if (n.cotes.getAttribute('data-key') !== sig) {
      n.cotes.setAttribute('data-key', sig); n.cotes.textContent = '';
      if (!list.length) el('li', 'pv2-cote-empty', tv2('Aucune cote disponible pour ce programme.'), n.cotes);
      list.forEach(function (c) { var li = el('li', 'pv2-cote', '', n.cotes); el('span', 'pv2-cote-label', c.label, li); el('b', 'pv2-cote-value', c.value, li); el('span', 'pv2-cote-source', c.source, li); });
    }
    attr(n.cotes, 'data-visible', v2.cotes ? 'true' : 'false');
    // Jog zone: the summary or the jog head, chosen by the operator only (never automatically).
    hide(n.summary, v2.jog); hide(n.jogHead, !v2.jog);
    // Relays: enabled only while their existing target can be used (its own guards still apply).
    var canSet = phase === 'idle' && !!h && !!relayTarget('real-motion-open');
    prop(n.setXY, 'disabled', !canSet);
    attr(n.setXY, 'title', tv2(relayTarget('real-motion-open') ? 'Ouvre « Déplacement réel » : X = 0 puis Y = 0, chacun avec sa confirmation.' : 'Origine réelle indisponible ici : « Déplacement réel » n’est pas ouvert sur ce poste.'));
    Object.keys(n.tools).forEach(function (id) { prop(n.tools[id], 'disabled', !relayTarget(id)); });
    if (v2.focus) { var target = v2.focus === 'close' ? n.close : n.open; v2.focus = ''; if (target.focus) target.focus({ preventScroll: true }); }
  }
  window.addEventListener('cnc-job-status', function (e) { var d = e && e.detail || {}; if (d.simulation) return; v2.machine = d.machine || null; v2Schedule(); });
  ['cnc-v2-change', 'cnc-projects-updated', 'cnc-library-preview-updated'].forEach(function (name) { window.addEventListener(name, v2Schedule); });
  window.addEventListener('cnc-v2-data', function (e) { if (e && e.detail && e.detail.slot === 'placement') v2Schedule(); });
  originSync();
  window.addEventListener('cnc-job-status', function (e) { var d = e && e.detail || {}; if (d.simulation) return; machine = d.machine || null; render(); });
  window.addEventListener('cnc-library-select', function (e) { selection = e && e.detail || null; render(); });
  window.addEventListener('cnc-library-preview-updated', render);
  render();
  window.cncJobPreparation = { render: render, ticks: function () { return { tool: ticks.tool, origin: ticks.origin }; } };
})(typeof window === 'object' ? window : this);
