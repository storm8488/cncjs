(function () {
  'use strict';
  var uiLocale=window.cncI18n||{t:function(s){return s;},html:function(s){return s;}};
  var key = 'cncjs-touch-display-v1';
  var panel = document.getElementById('screen-settings');
  if (!panel) {
    panel = document.createElement('section');
    panel.id = 'screen-settings';panel.className = 'screen';
    document.querySelector('main').appendChild(panel);
  }
  // Réglages is the one screen that scrolls rather than shrinking (viewport-fit.js).
  panel.setAttribute('data-fit', 'scroll');
  // Scope of each row (PROFILES-CONTRACT.md §1): « Cette tablette » (this browser only) or
  // « Serveur CNCjs » (the computer running CNCjs, shared by every device).
  panel.innerHTML = uiLocale.html('<div class="card wide ks-panel-intro"><div><h2>Votre écran</h2><p>Préférences conservées dans ce navigateur, sur cet appareil uniquement.</p></div><span class="ks-readonly" id="display-resolution"></span></div>') +
    uiLocale.html('<div class="card ks-display-card ks-profile-card" id="ks-machine-kind-card"><h2>Type de machine <span class="ks-scope" data-scope="server">Serveur CNCjs</span></h2><p id="profile-machine-target">Machine : —</p><div class="ks-display-choices" role="group" aria-label="Type de machine"><button type="button" data-machine-kind="cnc" aria-pressed="false">CNC</button><button type="button" data-machine-kind="laser" aria-pressed="false">Laser</button></div><p class="ks-help">Enregistré par le serveur CNCjs pour cette machine et partagé par tous les appareils. Seul l’appareil qui pilote peut le changer, machine au repos.</p><p id="profile-machine-unconfirmed" class="t-notice" data-tone="warn" role="status" hidden></p><p id="profile-machine-status" role="status"></p></div>') +
    uiLocale.html('<div class="card ks-display-card ks-profile-card" id="ks-performance-card"><h2>Performances de cette tablette <span class="ks-scope" data-scope="tablet">Cette tablette</span></h2><p>Ce choix ne concerne que ce navigateur, sur cet appareil. Il ne change rien sur la machine ni sur les autres appareils, et ne recharge pas la page.</p><div class="ks-display-choices" role="group" aria-label="Performances de cette tablette"><button type="button" data-performance="eco" aria-pressed="true">Éco</button><button type="button" data-performance="performance" aria-pressed="false">Performance</button></div><p class="ks-help">Éco : aperçu simple, pour les tablettes lentes. Performance : vues avancées chargées à la demande.</p><p id="profile-performance-status" role="status"></p></div>') +
    uiLocale.html('<div class="card ks-display-card"><h2>Taille du texte</h2><p>Choisissez le confort de lecture.</p><div class="ks-display-choices" role="group" aria-label="Taille du texte"><button type="button" data-display-size="standard" aria-pressed="true"><span class="ks-text-sample">Aa</span>Standard</button><button type="button" data-display-size="large" aria-pressed="false"><span class="ks-text-sample ks-text-large">Aa</span>Agrandi</button></div></div>') +
    uiLocale.html('<div class="card ks-display-card"><h2>Thème</h2><p>Sombre pour l’atelier, clair à fort contraste pour la lumière du jour.</p><div class="ks-display-choices" role="group" aria-label="Thème"><button type="button" data-display-theme="dark" aria-pressed="true"><span class="ks-theme-sample ks-theme-dark">Aa</span>Sombre</button><button type="button" data-display-theme="light" aria-pressed="false"><span class="ks-theme-sample ks-theme-light">Aa</span>Clair</button></div></div>') +
    uiLocale.html('<div class="card ks-display-card"><h2>Suivi du travail réel</h2><p>Coordonnées machine en plus des coordonnées de travail.</p><button type="button" id="display-machine-toggle" class="ks-display-toggle" aria-pressed="true"><span>Coordonnées machine</span><b id="display-machine-state">Affichées</b></button><p class="ks-help">Ce choix concerne le suivi réel. Les positions restent disponibles dans Déplacer / Origine.</p></div>') +
    uiLocale.html('<div class="card ks-display-card"><h2>Horloge</h2><p>Heure affichée dans l’en-tête.</p><button type="button" id="display-clock-toggle" class="ks-display-toggle" aria-pressed="true"><span>Heure dans l’en-tête</span><b id="display-clock-state">Affichée</b></button></div>') +
    uiLocale.html('<div class="card ks-display-fullscreen"><div><h2>Plein écran</h2><p id="display-fullscreen-state">Utiliser toute la surface disponible.</p></div><button type="button" id="display-fullscreen" class="ks-secondary">Passer en plein écran</button></div>') +
    uiLocale.html('<div class="card ks-display-sleep"><h2>Veille de l’écran</h2><label for="display-sleep-delay">Après une période sans interaction au repos</label><div class="ks-sleep-controls"><select id="display-sleep-delay"><option value="0">Jamais</option><option value="1">1 minute</option><option value="2">2 minutes</option><option value="5">5 minutes</option><option value="10">10 minutes</option><option value="30">30 minutes</option></select><button id="display-sleep-test" type="button" class="ks-secondary" aria-describedby="display-sleep-status">Tester</button></div><p id="display-sleep-status" role="status"></p><p>Écran noir logiciel au repos. Un toucher réveille sans actionner les commandes.</p></div>') +
    uiLocale.html('<div class="wide ks-display-footer"><p id="display-feedback" role="status">Aucun réglage du contrôleur modifié.</p><button type="button" id="display-reset" class="ks-secondary">Rétablir l’affichage</button></div>');
  var sizes = panel.querySelectorAll('[data-display-size]');
  var themes = panel.querySelectorAll('[data-display-theme]');
  var machine = document.getElementById('display-machine-toggle');
  var clock = document.getElementById('display-clock-toggle');
  var feedback = document.getElementById('display-feedback');
  var fullscreen = document.getElementById('display-fullscreen');
  var prefs = { size: 'standard', machine: true, sleepMinutes: 5, clock: true, theme: 'dark' };
  var savedRaw,storageRead=false,validStored=false;
  var invalidMessage=uiLocale.t('Préférences enregistrées illisibles. Mémorisation bloquée ; utilisez « Rétablir l’affichage » pour les remplacer.');
  try {
    savedRaw=localStorage.getItem(key);storageRead=true;
    var saved = savedRaw===null?null:JSON.parse(savedRaw);
    if(savedRaw!==null&&(!saved||typeof saved!=='object'||Array.isArray(saved)||
      !Object.keys(saved).every(function(k){return ['size','machine','sleepMinutes','clock','theme'].indexOf(k)>=0;})||
      (saved.size!==undefined&&['standard','large'].indexOf(saved.size)<0)||
      (saved.theme!==undefined&&['dark','light'].indexOf(saved.theme)<0)||
      (saved.machine!==undefined&&typeof saved.machine!=='boolean')||
      (saved.clock!==undefined&&typeof saved.clock!=='boolean')||
      (saved.sleepMinutes!==undefined&&[0,1,2,5,10,30].indexOf(saved.sleepMinutes)<0)))throw Error('invalid');
    if (saved) {
      prefs.size = saved.size === 'large' ? 'large' : 'standard';
      prefs.machine = saved.machine !== false;
      prefs.clock = saved.clock !== false;
      prefs.theme = saved.theme === 'light' ? 'light' : 'dark';
      if ([0,1,2,5,10,30].indexOf(saved.sleepMinutes) >= 0) prefs.sleepMinutes = saved.sleepMinutes;
    }
    validStored=true;
  } catch (error) {feedback.textContent=storageRead?invalidMessage:uiLocale.t('Affichage appliqué ; mémorisation indisponible dans ce navigateur.');}
  var home = document.getElementById('screen-home');
  var card = home ? home.querySelector('#mx') : null;
  while (card && card !== home && !card.classList.contains('card')) card = card.parentElement;
  if (card && card !== home) card.classList.add('home-machine-coordinates');
  function apply() {
    document.body.classList.toggle('display-large', prefs.size === 'large');
    document.body.classList.toggle('display-hide-machine', !prefs.machine);
    document.body.classList.toggle('display-hide-clock', !prefs.clock);
    sizes.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-display-size') === prefs.size)); });
    // Theme: the tokens of design-tokens.css switch on html[data-theme="light"]; dark is the default.
    themes.forEach(function (b) { var v = b.getAttribute('data-display-theme'); if (v) b.setAttribute('aria-pressed', String(v === prefs.theme)); });
    var root = document.documentElement;
    if (root && typeof root.setAttribute === 'function') { if (prefs.theme === 'light') root.setAttribute('data-theme', 'light'); else if (typeof root.removeAttribute === 'function') root.removeAttribute('data-theme'); }
    machine.setAttribute('aria-pressed', String(prefs.machine));
    document.getElementById('display-machine-state').textContent = prefs.machine ? uiLocale.t('Affichées') : uiLocale.t('Masquées');
    clock.setAttribute('aria-pressed', String(prefs.clock));
    document.getElementById('display-clock-state').textContent = prefs.clock ? uiLocale.t('Affichée') : uiLocale.t('Masquée');
    if (window.cncHeaderClock) window.cncHeaderClock.tick();
    document.getElementById('display-sleep-delay').value = String(prefs.sleepMinutes);
    if (window.cncScreenSaver) window.cncScreenSaver.configure(prefs.sleepMinutes);
    window.dispatchEvent(new Event('resize'));
  }
  function save(reset) {
    apply();
    var failure=uiLocale.t('Affichage appliqué ; mémorisation indisponible dans ce navigateur.');
    try {
      if(!storageRead)throw Error('unreadable');
      if(localStorage.getItem(key)!==savedRaw){failure=uiLocale.t('Les préférences ont changé dans un autre onglet. Affichage appliqué ici uniquement ; rechargez au repos avant de les enregistrer.');throw Error('conflict');}
      if(!validStored&&!reset){failure=invalidMessage;throw Error('invalid');}
      var encoded=JSON.stringify(prefs);localStorage.setItem(key,encoded);
      if(localStorage.getItem(key)!==encoded){failure=uiLocale.t('La mémorisation de l’affichage n’a pas pu être confirmée. Les changements restent appliqués à cette page.');throw Error('unconfirmed');}
      savedRaw=encoded;validStored=true;feedback.textContent = uiLocale.t('Préférences enregistrées dans ce navigateur.');
    }
    catch (error) { feedback.textContent = failure; }
  }
  sizes.forEach(function (b) { b.addEventListener('click', function () { prefs.size = b.getAttribute('data-display-size');save(); }); });
  themes.forEach(function (b) { b.addEventListener('click', function () { var v = b.getAttribute('data-display-theme'); if (v !== 'dark' && v !== 'light') return; prefs.theme = v; save(); }); });
  machine.addEventListener('click', function () { prefs.machine = !prefs.machine;save(); });
  clock.addEventListener('click', function () { prefs.clock = !prefs.clock;save(); });
  document.getElementById('display-reset').addEventListener('click', function () { prefs = { size: 'standard', machine: true, sleepMinutes: 5, clock: true, theme: 'dark' };save(true); });
  document.getElementById('display-sleep-delay').addEventListener('change', function () {
    var value = Number(this.value); if ([0,1,2,5,10,30].indexOf(value) < 0) return;
    prefs.sleepMinutes = value; save();
  });
  document.getElementById('display-sleep-test').addEventListener('click', function () {
    if (window.cncScreenSaver && !window.cncScreenSaver.preview()) feedback.textContent = window.cncScreenSaver.status().reason || uiLocale.t('Fermez la fenêtre ouverte avant de tester la veille.');
  });
  function sleepStatus() {
    var state = window.cncScreenSaver ? window.cncScreenSaver.status() : { blocked: true, reason: uiLocale.t('Veille indisponible.') };
    var test = document.getElementById('display-sleep-test'), label = document.getElementById('display-sleep-status');
    var text = state.reason || uiLocale.t('Pendant un travail ou une pause, l’écran reste allumé.');
    if (test.disabled !== state.blocked) test.disabled = state.blocked;
    if (label.textContent !== text) label.textContent = text;
  }
  window.addEventListener('cnc-screen-saver-status', sleepStatus);
  function screenState() {
    document.getElementById('display-resolution').textContent = window.innerWidth + ' × ' + window.innerHeight;
    var active = !!document.fullscreenElement;
    fullscreen.textContent = active ? uiLocale.t('Quitter le plein écran') : uiLocale.t('Passer en plein écran');
    fullscreen.disabled = !active && (!document.fullscreenEnabled || !document.documentElement.requestFullscreen);
    document.getElementById('display-fullscreen-state').textContent = active ? uiLocale.t('Plein écran actif · Échap pour quitter.') : fullscreen.disabled ? uiLocale.t('Indisponible ici. Utilisez le mode plein écran du navigateur.') : uiLocale.t('Utiliser toute la surface disponible.');
  }
  fullscreen.addEventListener('click', function () {
    // Browser fullscreen requires this explicit user gesture; never restored automatically.
    var operation;
    try { operation = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); }
    catch (error) { feedback.textContent = uiLocale.t('Le navigateur a refusé le plein écran.');return; }
    Promise.resolve(operation).then(screenState, function () { feedback.textContent = uiLocale.t('Le navigateur a refusé le plein écran. Utilisez son menu d’affichage.');screenState(); });
  });
  document.addEventListener('fullscreenchange', screenState);
  window.addEventListener('resize', screenState);
  var entry = document.createElement('button');entry.type = 'button';entry.id = 'ks-machine-display';entry.className = 'ks-secondary';entry.textContent = uiLocale.t('Réglages d’affichage →');
  document.querySelector('.ks-machine-overview').appendChild(entry);
  apply();screenState();sleepStatus();
})();
/* Réglages → « Type de machine » (server, per machine) and « Performances de cette tablette »
 * (this browser only), PROFILES-CONTRACT.md §1 and §5. The machine kind is read from the
 * server's machineProfile and changed only through cncJobControls.setMachineKind (the job POST
 * path: pilot, generation and refusals as for every machine action): one tap per kind, no name
 * and no confirmation panel. The performance profile is applied and saved
 * here at once: no reload, no request, no command. */
(function () {
  'use strict';
  var uiLocale=window.cncI18n||{t:function(s){return s;}};
  var t=uiLocale.t,profiles=window.cncProfile,card=document.getElementById('ks-machine-kind-card');
  if(!profiles||!card||typeof card.querySelectorAll!=='function')return;
  var $=function(id){return document.getElementById(id);};
  function set(n,v){if(n&&n.textContent!==v)n.textContent=v;}
  function prop(n,k,v){if(n&&n[k]!==v)n[k]=v;}
  function attr(n,k,v){if(n&&n.getAttribute(k)!==v)n.setAttribute(k,v);}
  var kinds=card.querySelectorAll('[data-machine-kind]'),perfCard=$('ks-performance-card');
  var perfs=perfCard&&typeof perfCard.querySelectorAll==='function'?perfCard.querySelectorAll('[data-performance]'):[];
  var KIND_WORDS={cnc:t('CNC'),laser:t('Laser')};
  var MATCH_WORDS={signature:t('reconnue par ses réglages'),none:t('pas encore associée'),ambiguous:t('plusieurs fiches correspondent'),unknown:t('réglages $$ pas encore lus')};
  var machine=null,sending=false;
  // The server's reason, translated when it is a catalogue phrase.
  function reasonOf(p){
    if(!p)return t('Type de machine non transmis par le serveur CNCjs.');
    return p.changeReason?(uiLocale.message?uiLocale.message(p.changeReason):p.changeReason):t('Changement impossible dans l’état actuel de la machine.');
  }
  function target(p){
    if(!p)return t('Machine : aucune information du serveur CNCjs.');
    return t('Machine : ')+(p.kind?KIND_WORDS[p.kind]:t('type non choisi'))+(p.portHint?' · '+p.portHint:'')+(p.simulated?' · '+t('simulation : cette page seulement, rien sur le serveur'):p.match==='unknown'||p.match==='ambiguous'?' · '+MATCH_WORDS[p.match]:'');
  }
  // Coded issues (ETOUCH_MACHINE_*: incoherent $32…), translated by the tablet's catalogue.
  function issuesText(p){
    var list=p&&Array.isArray(p.issues)?p.issues:[];
    return list.map(function(i){return i&&i.code&&uiLocale.format?uiLocale.format(i.code,i.params||{},''):'';}).filter(Boolean).join(' ');
  }
  function renderMachine(){
    var p=profiles.machine(),kind=profiles.kind(),can=!!(p&&p.canChange&&machine&&!sending);
    set($('profile-machine-target'),target(p));
    var why=can?'':sending?t('Demande envoyée…'):!machine?t('Aucune machine connectée.'):reasonOf(p);
    Array.prototype.forEach.call(kinds,function(b){
      var k=b.getAttribute('data-machine-kind');
      attr(b,'aria-pressed',String(kind===k));prop(b,'disabled',!can);
      if(why)attr(b,'title',why);else if(b.removeAttribute)b.removeAttribute('title');
    });
    // Unknown kind: the CNC interface stays, with a visible prompt to choose the type.
    var unknown=!!machine&&kind===null,note=$('profile-machine-unconfirmed');
    var text=unknown?t('Type de machine non confirmé : l’interface CNC est utilisée. Choisissez CNC ou Laser pour cette machine.'):'';
    var issues=issuesText(p);if(issues)text=(text?text+' ':'')+issues;
    set(note,text);prop(note,'hidden',!text);
  }
  // A plain switch: one tap sends the kind (the server still checks pilot, rest and $$); no name asked.
  function choose(kind){
    var c=window.cncJobControls,p=profiles.machine();
    if(!p||!p.canChange||!machine||sending||profiles.kind()===kind)return;
    if(!c||typeof c.setMachineKind!=='function'){set($('profile-machine-status'),t('Commandes indisponibles.'));return;}
    var simulated=!!p.simulated;
    sending=true;set($('profile-machine-status'),t('Demande envoyée…'));renderMachine();
    c.setMachineKind(kind,p.label||KIND_WORDS[kind]).then(function(){sending=false;set($('profile-machine-status'),simulated?t('Type simulé appliqué à cette page : ')+KIND_WORDS[kind]+t('. Rien n’est envoyé au serveur CNCjs.'):t('Type enregistré : ')+KIND_WORDS[kind]+'.');renderMachine();},
      function(e){sending=false;set($('profile-machine-status'),e&&e.message?e.message:t('Refus du serveur sans détail.'));renderMachine();});
  }
  Array.prototype.forEach.call(kinds,function(b){b.addEventListener('click',function(){
    var k=b.getAttribute('data-machine-kind');if(k!=='cnc'&&k!=='laser')return;
    if(b.disabled){set($('profile-machine-status'),b.getAttribute('title')||'');return;}
    choose(k);
  });});
  function renderPerformance(){
    var p=profiles.performance();
    Array.prototype.forEach.call(perfs,function(b){attr(b,'aria-pressed',String(b.getAttribute('data-performance')===p));});
  }
  Array.prototype.forEach.call(perfs,function(b){b.addEventListener('click',function(){
    var r=profiles.setPerformance(b.getAttribute('data-performance'));
    set($('profile-performance-status'),r.message||'');renderPerformance();
  });});
  if(profiles.storage&&profiles.storage()!=='ok'&&profiles.storage()!=='absent')set($('profile-performance-status'),t('Valeur enregistrée illisible : Éco appliqué. Elle sera remplacée à votre prochain choix.'));
  window.addEventListener('cnc-profile-change',function(){renderMachine();renderPerformance();});
  window.addEventListener('cnc-job-status',function(e){var d=e&&e.detail||{};machine=d.machine||null;renderMachine();});
  renderMachine();renderPerformance();
  window.cncProfileSettings={choose:choose,render:renderMachine};
})();
/* Performance v2 (L6) — Réglages. « Interface Performance v2 » appears only where the v2 gate
 * could open (Performance + known CNC + hardware GPU + wide workstation, cncV2.state().eligible)
 * or while this page uses the v2 layout. It writes the deferred preference (cncV2.setPreference)
 * and nothing else: no reload, request, host command, Wi-Fi or machine kind. Under body.perf-v2
 * only, the settings mount offers visual quality (cncV2.use('inspect').setQuality) and a
 * diagnostic read on demand; the frame measurement runs only at a safe Idle. Event handlers
 * only queue a frame; RT/Eco/software/narrow get no frame, timer or element. */
(function () {
  'use strict';
  var v2=window.cncV2,perfCard=document.getElementById('ks-performance-card');
  if(!v2||typeof v2.state!=='function'||!perfCard)return;
  // Embedded EN/ES rows: the entry must work before (or without) the deferred v2 catalogue.
  var TEXT={
    'Interface Performance v2':['Performance v2 interface','Interfaz Performance v2'],
    'Cette tablette':['This tablet','Esta tableta'],
    'Disponible ici : profil Performance, machine CNC, GPU matériel et poste large. Le choix s’applique à la prochaine ouverture de l’interface au repos ; la page n’est pas rechargée et rien n’est envoyé à la machine.':['Available here: Performance profile, CNC machine, hardware GPU and wide workstation. The choice applies the next time the interface opens while idle; the page is not reloaded and nothing is sent to the machine.','Disponible aquí: perfil Performance, máquina CNC, GPU por hardware y puesto ancho. La elección se aplica la próxima vez que se abra la interfaz en reposo; la página no se recarga y no se envía nada a la máquina.'],
    'Activée':['On','Activada'],'Désactivée':['Off','Desactivada'],
    'Interface v2 active pour cette session.':['v2 interface active for this session.','Interfaz v2 activa en esta sesión.'],
    'Rendu 3D de cette session':['3D rendering for this session','Renderizado 3D de esta sesión'],
    'Agit seulement sur l’affichage, dans le même cadre : les commandes ne bougent pas et rien n’est envoyé à la machine.':['Affects the display only, in the same frame: the controls do not move and nothing is sent to the machine.','Solo afecta a la visualización, en el mismo marco: los mandos no se mueven y no se envía nada a la máquina.'],
    'Qualité complète':['Full quality','Calidad completa'],'Rendu allégé':['Reduced rendering detail','Renderizado simplificado'],
    'Arrêter le rendu 3D':['Stop 3D rendering','Detener el renderizado 3D'],'Rendu 3D arrêté':['3D rendering stopped','Renderizado 3D detenido'],
    'Diagnostic du rendu':['Rendering diagnostic','Diagnóstico del renderizado'],'Mesurer 60 images':['Measure 60 frames','Medir 60 imágenes'],
    'GPU matériel':['Hardware GPU','GPU por hardware'],'Oui':['Yes','Sí'],'Non (rendu logiciel)':['No (software rendering)','No (renderizado por software)'],
    'Contexte GPU perdu':['GPU context lost','Contexto GPU perdido'],'Inconnu':['Unknown','Desconocido'],
    'Résolution':['Resolution','Resolución'],'Rapport de pixels (DPR)':['Device pixel ratio (DPR)','Relación de píxeles (DPR)'],
    'Qualité effective':['Effective quality','Calidad efectiva'],'DPR de rendu ':['Rendering DPR ','DPR de renderizado '],
    'inconnu':['unknown','desconocido'],'Mesure du rendu':['Rendering measurement','Medición del renderizado'],
    ' images · tracé p95 ':[' frames · drawing p95 ',' imágenes · trazado p95 '],' ms · intervalle p95 ':[' ms · interval p95 ',' ms · intervalo p95 '],
    ' ms. Mesure isolée sur cette tablette, pas une garantie.':[' ms. One measurement on this tablet, not a guarantee.',' ms. Medición aislada en esta tableta, no una garantía.'],
    'Mesure annulée ou indisponible.':['Measurement cancelled or unavailable.','Medición cancelada o no disponible.'],
    'Mesure possible seulement au repos, avec un état récent.':['Measurement only possible while idle, with a recent state.','Medición posible solo en reposo, con un estado reciente.'],
    'Mesure en cours…':['Measuring…','Midiendo…'],
    'Interface v2 arrêtée pour cette session : vue fixe conservée, rien n’a bougé.':['v2 interface stopped for this session: fixed view kept, nothing moved.','Interfaz v2 detenida en esta sesión: vista fija conservada, nada se ha movido.'],
    'Vue 3D indisponible pour le moment.':['3D view unavailable for now.','Vista 3D no disponible por ahora.']
  };
  function vt(s){var l=window.cncI18n&&window.cncI18n.language,row=TEXT[s];return row&&l==='en'?row[0]:row&&l==='es'?row[1]:s;}
  function el(tag,cls,txt){var n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n;}
  function set(n,k,v){if(n&&n[k]!==v)n[k]=v;}
  function attr(n,k,v){if(n&&n.getAttribute(k)!==v)n.setAttribute(k,v);}
  function v2Layout(){return !!(document.body&&document.body.classList&&document.body.classList.contains('perf-v2'));}
  var card=null,toggle=null,toggleState=null,status=null,result=null,frame=0;
  var quality=null,qualityButtons=[],qualityStatus=null,list=null,diagnosis=null,measured=null,measuring=false,disposed=false,registered=false;
  function wanted(){var s=v2.state();return s.eligible===true||s.layout===true;}
  function queue(){
    if(frame||!window.requestAnimationFrame||(!card&&!wanted()))return;
    frame=window.requestAnimationFrame(render);
  }
  function buildEntry(){
    card=el('div','card ks-display-card ks-v2-card');card.id='ks-v2-card';
    var h=el('h2',null,vt('Interface Performance v2')+' '),scope=el('span','ks-scope',vt('Cette tablette'));scope.setAttribute('data-scope','tablet');h.appendChild(scope);
    toggle=el('button','ks-display-toggle');toggle.type='button';toggle.id='ks-v2-toggle';toggle.setAttribute('aria-pressed','false');
    toggle.appendChild(el('span',null,vt('Interface Performance v2')));toggleState=el('b');toggle.appendChild(toggleState);
    status=el('p','ks-v2-status');status.id='ks-v2-status';status.setAttribute('role','status');
    card.appendChild(h);card.appendChild(el('p',null,vt('Disponible ici : profil Performance, machine CNC, GPU matériel et poste large. Le choix s’applique à la prochaine ouverture de l’interface au repos ; la page n’est pas rechargée et rien n’est envoyé à la machine.')));
    card.appendChild(toggle);card.appendChild(status);
    toggle.addEventListener('click',function(){
      var p=v2.preference();result=v2.setPreference(!(p&&p.enabled===true));queue();
    });
    perfCard.parentNode.insertBefore(card,perfCard.nextSibling||null);
  }
  function inspect(){var x=!disposed&&v2.gate()&&typeof v2.use==='function'?v2.use('inspect'):null;return x&&typeof x.setQuality==='function'?x:null;}
  var MODES={full:'Qualité complète',reduced:'Rendu allégé',fixed:'Rendu 3D arrêté'};
  function currentQuality(){var x=inspect(),q=x&&x.snapshot().quality;return q||null;}
  function line(dl,label,value){dl.appendChild(el('dt',null,label));dl.appendChild(el('dd',null,value));}
  function buildQuality(content){
    quality=el('div','card ks-display-card ks-v2-quality');quality.id='ks-v2-quality';
    quality.appendChild(el('h2',null,vt('Rendu 3D de cette session')));
    quality.appendChild(el('p',null,vt('Agit seulement sur l’affichage, dans le même cadre : les commandes ne bougent pas et rien n’est envoyé à la machine.')));
    var group=el('div','ks-display-choices');group.setAttribute('role','group');group.setAttribute('aria-label',vt('Rendu 3D de cette session'));
    [['full','Qualité complète'],['reduced','Rendu allégé'],['fixed','Arrêter le rendu 3D']].forEach(function(pair){
      var b=el('button',null,vt(pair[1]));b.type='button';b.setAttribute('data-v2-quality',pair[0]);b.setAttribute('aria-pressed','false');
      b.addEventListener('click',function(){
        var x=inspect();if(!x||b.disabled)return;
        if(x.setQuality(pair[0])===false)result={quality:vt('Vue 3D indisponible pour le moment.')};queue();
      });
      qualityButtons.push(b);group.appendChild(b);
    });
    quality.appendChild(group);
    var tools=el('div','ks-v2-diagnostic-tools'),run=el('button','ks-secondary',vt('Diagnostic du rendu')),measure=el('button','ks-secondary',vt('Mesurer 60 images'));
    run.type=measure.type='button';run.id='ks-v2-diagnostic-run';measure.id='ks-v2-measure';tools.appendChild(run);tools.appendChild(measure);
    list=el('dl','ks-diagnostic-list');list.id='ks-v2-diagnostic-list';
    qualityStatus=el('p','ks-v2-status');qualityStatus.id='ks-v2-quality-status';qualityStatus.setAttribute('role','status');
    quality.appendChild(tools);quality.appendChild(list);quality.appendChild(qualityStatus);
    // Read once, on request: no polling, no permanent dashboard.
    run.addEventListener('click',function(){if(disposed)return;diagnosis=read();queue();});
    measure.addEventListener('click',function(){
      var x=inspect();if(!x||measuring)return;
      if(v2.state().safeIdle!==true){result={quality:vt('Mesure possible seulement au repos, avec un état récent.')};queue();return;}
      measuring=true;result={quality:vt('Mesure en cours…')};queue();
      Promise.resolve(x.diagnose({frames:60})).then(function(r){measuring=false;measured=r&&!r.cancelled?r:null;
        if(!diagnosis)diagnosis=read();result={quality:measured?'':vt('Mesure annulée ou indisponible.')};queue();},
        function(){measuring=false;result={quality:vt('Mesure annulée ou indisponible.')};queue();});
    });
    content.appendChild(quality);
  }
  function read(){
    var g=window.cncGpu&&window.cncGpu.state?window.cncGpu.state():null,dpr=window.devicePixelRatio||1,w=window.innerWidth||0,h=window.innerHeight||0,q=currentQuality();
    return {gpu:!g||g.checked!==true?vt('Inconnu'):g.lost?vt('Contexte GPU perdu'):g.hardware?vt('Oui'):vt('Non (rendu logiciel)'),
      resolution:w+' × '+h+' px CSS · '+Math.round(w*dpr)+' × '+Math.round(h*dpr)+' px',dpr:String(dpr),
      quality:q&&MODES[q.mode]?vt(MODES[q.mode])+' · '+vt('DPR de rendu ')+(typeof q.dpr==='number'&&isFinite(q.dpr)?q.dpr:vt('inconnu')):vt('Inconnu')};
  }
  function render(){
    frame=0;
    var show=wanted();
    if(!card&&show)buildEntry();
    if(card){
      var p=v2.preference(),on=!!(p&&p.enabled===true),s=v2.state();
      set(card,'hidden',!show);attr(toggle,'aria-pressed',String(on));set(toggleState,'textContent',vt(on?'Activée':'Désactivée'));
      var message=result&&result.persisted===false?result.message:s.pending?v2.message():s.layout&&s.open&&on?vt('Interface v2 active pour cette session.'):'';
      set(status,'textContent',message||'');
    }
    if(!v2Layout()||!v2.mounts)return;
    var mount=v2.mounts.get('settings');if(!mount||!mount.content)return;
    if(!quality&&!disposed&&v2.gate())buildQuality(mount.content);
    if(!quality)return;
    set(mount.content,'hidden',false);
    var q=currentQuality();
    qualityButtons.forEach(function(b){attr(b,'aria-pressed',String(!!q&&q.mode===b.getAttribute('data-v2-quality')));set(b,'disabled',disposed);});
    set(qualityStatus,'textContent',disposed?vt('Interface v2 arrêtée pour cette session : vue fixe conservée, rien n’a bougé.'):result&&result.quality!==undefined?result.quality:'');
    var shown=diagnosis?JSON.stringify([diagnosis,measured]):'';
    if(diagnosis&&list.getAttribute('data-shown')!==shown){
      list.setAttribute('data-shown',shown);
      while(list.children.length)list.removeChild(list.lastChild);
      line(list,vt('GPU matériel'),diagnosis.gpu);line(list,vt('Résolution'),diagnosis.resolution);
      line(list,vt('Rapport de pixels (DPR)'),diagnosis.dpr);line(list,vt('Qualité effective'),diagnosis.quality);
      if(measured)line(list,vt('Mesure du rendu'),measured.samples+vt(' images · tracé p95 ')+measured.paintP95Ms+vt(' ms · intervalle p95 ')+measured.frameP95Ms+vt(' ms. Mesure isolée sur cette tablette, pas une garantie.'));
    }
  }
  // The presenter slot lets the contract release it on Eco, GPU loss, gate close or pagehide.
  function register(){
    if(registered||typeof v2.register!=='function'||!v2.gate())return;
    var s=v2.state();if(!s.ready||!s.layout)return;
    registered=true;
    var snap={version:1,available:true,screen:'settings',model:null};
    v2.register('settings',{snapshot:function(){return snap;},update:function(){return snap;},cancel:function(){},
      dispose:function(){disposed=true;measuring=false;queue();}});
  }
  window.addEventListener('cnc-v2-change',function(){register();queue();});
  ['cnc-profile-change','cnc-gpu-change','cnc-layout-change'].forEach(function(name){window.addEventListener(name,queue);});
  window.addEventListener('cnc-v2-data',function(e){if(quality&&e&&e.detail&&e.detail.slot==='inspect')queue();});
  queue();
})();
