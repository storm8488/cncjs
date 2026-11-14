(function(){
  'use strict';
  var uiLocale=window.cncI18n||{t:function(s){return s;},html:function(s){return s;}};
  var paths={menu:'M3 3h6v6H3z M15 3h6v6h-6z M3 15h6v6H3z M15 15h6v6h-6z',
    home:'M3 4h18v13H3z M8 21h8 M12 17v4 M6 12l4-4 4 5 4-6',
    files:'M3 7V4h7l3 3h8v13H3z M3 10h18',
    jog:'M12 2v20 M2 12h20 M8 6l4-4 4 4 M8 18l4 4 4-4 M6 8l-4 4 4 4 M18 8l4 4-4 4',
    origin:'M12 2v5 M12 17v5 M2 12h5 M17 12h5 M18 12a6 6 0 1 1-12 0 6 6 0 0 1 12 0 M12 10v4 M10 12h4',
    machine:'M4 3h16v18H4z M7 7h10v5H7z M8 17h1 M15 17h1',
    history:'M5 3h14v18H5z M8 7h8 M8 11h8 M8 15h5',
    back:'M10 5l-7 7 7 7 M3 12h18',
    alarm:'M12 3L2 21h20z M12 9v5 M12 17v1',
    check:'M4 12l5 5L20 6',settings:'M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6'};
  function icon(name){return uiLocale.html('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="')+paths[name]+uiLocale.html('"/></svg>');}
  var simulation=document.body.getAttribute('data-simulation')==='true';
  var names={menu:uiLocale.t('Menu'),home:uiLocale.t('Suivi du travail'),files:uiLocale.t('Fichiers'),jog:uiLocale.t('Déplacer / Origine'),machine:uiLocale.t('Machine'),history:uiLocale.t('Journal'),settings:uiLocale.t('Réglages'),limits:uiLocale.t('Limites')};
  names.probe=uiLocale.t('Palpage');names['probe-profile']=uiLocale.t('Profils de sonde');names['probe-contact']=uiLocale.t('Test du contact');names['probe-report']=uiLocale.t('Résultats du palpage');
  names['probe-transfer']=uiLocale.t('Sauvegarde des profils');
  names['probe-preparation']=uiLocale.t('Préparation du palpage');
  names['guide']=uiLocale.t('Guide d’utilisation');
  names['commissioning']=uiLocale.t('Mise en service');
  var main=document.querySelector('main'),nav=document.getElementById('tabbar'),banner=document.getElementById(simulation?'simulation-banner':'real-banner');
  document.body.classList.add('ks-ui');
  document.body.classList.toggle('ks-real',!simulation);
  // The header is the status strip (status-strip.js fills its left part). The
  // screen title stays for assistive technology; the rail shows the place. The real page
  // shows no mode badge: its empty, hidden span only anchors the clock (header-clock.js).
  banner.innerHTML=uiLocale.html('<h1 id="ks-title" class="ks-sr-only">Menu</h1><div class="t-strip-right"><span class="ks-simulation"'+(simulation?'':' hidden')+'>')+(simulation?uiLocale.t('SIMULATION'):'')+uiLocale.html('</span>')+(simulation?'<a href="index.html" class="ks-exit">'+uiLocale.t('Réel ↗')+'</a>':'')+uiLocale.html('</div>');
  var menu=document.createElement('section');menu.id='screen-menu';menu.className='screen';
  // Menu (UI 2027): the machine state lives in the strip; the menu is the
  // "resume where I was" shortcut plus six tiles, each with a live indicator.
  menu.innerHTML=uiLocale.html('<button type="button" id="ks-resume" class="ks-resume" hidden>')+icon('back')+uiLocale.html('<span class="ks-resume-text"><b id="ks-resume-title"></b><small id="ks-resume-hint"></small></span><span class="ks-resume-go">Ouvrir →</span></button><div class="ks-tiles"></div>');
  main.insertBefore(menu,main.firstChild);
  var menuLabels={jog:uiLocale.t('Préparer'),home:uiLocale.t('Suivi')},menuHints={jog:uiLocale.t('Déplacer · Origine · Palpage'),files:uiLocale.t('Choisir et charger un parcours'),home:uiLocale.t('Avancement et commandes'),machine:uiLocale.t('État et limites'),history:uiLocale.t('Événements et exports'),settings:uiLocale.t('Affichage · machine · système')};
  var tileOrder=['home','files','jog','machine','history','settings'],lives={};
  tileOrder.forEach(function(name){
    var b=document.createElement('button');b.type='button';b.className='ks-tile';b.setAttribute('data-ks-tile',name);
    b.innerHTML=icon(name)+uiLocale.html('<div class="ks-tile-text"><span>')+(menuLabels[name]||names[name])+uiLocale.html('</span><small>')+menuHints[name]+uiLocale.html('</small></div><span class="t-live"><i></i><span></span></span>');
    lives[name]=b.querySelector('.t-live');
    b.addEventListener('click',function(){go(name);});menu.querySelector('.ks-tiles').appendChild(b);
  });
  // An indicator with nothing to say keeps its place, unseen (ui-2027.css, data-empty): the titles stay aligned.
  function live(name,tone,text){var el=lives[name];if(!el)return;if(el.getAttribute('data-tone')!==tone)el.setAttribute('data-tone',tone);setText(el.lastChild,text);var empty=String(!text);if(el.getAttribute('data-empty')!==empty)el.setAttribute('data-empty',empty);}
  nav.innerHTML='';
  // Every screen on the rail; Retour appears only on a sub-screen (probe, limits…).
  var mainScreens=['menu','jog','files','home','machine','history','settings'],keptScreens=['menu','jog','files','home','machine','history'];
  ['back'].concat(mainScreens).forEach(function(name){
    var label=name==='back'?uiLocale.t('Retour'):menuLabels[name]||names[name];
    var b=document.createElement('button');b.className='ks-nav';b.setAttribute('aria-label',label);b.innerHTML=icon(name)+uiLocale.html('<span>')+label+uiLocale.html('</span>');b.setAttribute('data-ks-screen',name);b.addEventListener('click',function(){go(name==='back'?trail.pop()||'menu':name,name==='back');});nav.appendChild(b);
  });
  var active='menu',trail=[];
  // Compact layout (ui-2027.css, body.t-compact) under 1100 x 650: screens are laid out
  // shorter rather than shrunk by viewport-fit.js, which stays a safety net. Decided
  // from the window only (a visual preference, never a permission).
  function fitLibrary(){
    var compact=window.innerHeight<650||window.innerWidth<1100;
    if(document.body.classList.contains('t-compact')!==compact)document.body.classList.toggle('t-compact',compact);
    window.dispatchEvent(new CustomEvent('cnc-library-page-size',{detail:compact?3:5}));window.dispatchEvent(new CustomEvent('cnc-history-page-size',{detail:compact?4:6}));}
  window.addEventListener('resize',fitLibrary);fitLibrary();
  // Wide workstation (PERFORMANCE-UI-SPEC.md 2.2, body.perf-wide): Performance profile, hardware WebGL
  // (body.perf-gpu, preview-3d.js) and a landscape window of at least 1300 x 880 CSS px. The style
  // sheets key on the class only; cnc-layout-change tells the modules. A lost GPU context keeps
  // perf-gpu, so the layout never moves during a job (Q4).
  var layoutWideOn=false;
  function layoutWide(){var b=document.body.classList;return b.contains('perf-performance')&&b.contains('perf-gpu')&&window.innerWidth>=1300&&window.innerHeight>=880&&window.innerWidth>=window.innerHeight;}
  function fitLayout(){
    // V2 resources may stop immediately, but the wide grid must not move under a
    // finger in Run/Hold/Alarm or with an unknown report. The RT/v1 path is unchanged.
    if(window.cncV2&&window.cncV2.state().holdLayout)return;
    var on=layoutWide();if(on===layoutWideOn)return;layoutWideOn=on;document.body.classList.toggle('perf-wide',on);window.dispatchEvent(new CustomEvent('cnc-layout-change',{detail:{wide:on}}));
  }
  window.cncLayout={wide:function(){return layoutWideOn;},admissible:layoutWide};
  var v2LayoutFrame=0;
  window.addEventListener('cnc-v2-change',function(){
    if(v2LayoutFrame||!window.requestAnimationFrame)return;
    v2LayoutFrame=window.requestAnimationFrame(function(){v2LayoutFrame=0;fitLayout();});
  });
  window.addEventListener('resize',fitLayout);window.addEventListener('cnc-profile-change',fitLayout);window.addEventListener('cnc-gpu-change',fitLayout);fitLayout();
  // BEGIN V2 MOUNTS
  // Empty, hidden slots, created only by the safe bootstrap RAF. Nothing is moved;
  // L4/L5/L6 own the contents and unhide them when their presenter is ready.
  var v2Slots=null;
  function v2Mounts(build){
    if(v2Slots)return v2Slots;
    var v=window.cncV2;
    if(build!==true||!v||!v.state().layout||!v.state().safeIdle)return {};
    v2Slots={};
    ['home','files','prepare','machine','history','settings'].forEach(function(name){
      var screen=name==='prepare'?'jog':name,root=document.getElementById('screen-'+screen);
      if(!root)return;
      var content=document.createElement('div');content.id='perf-v2-'+name;content.hidden=true;
      content.setAttribute('data-v2-mount',name);
      var performanceCard=name==='settings'?document.getElementById('ks-performance-card'):null;
      if(performanceCard&&performanceCard.parentNode===root)root.insertBefore(content,performanceCard.nextSibling);
      else root.appendChild(content);
      v2Slots[name]=Object.freeze({screen:screen,root:root,content:content,origin:name==='prepare'&&!simulation?content:null});
    });
    return Object.freeze(v2Slots);
  }
  // END V2 MOUNTS
  var openedSheet=null,sheetReturn=null,sheetRestore=null;
  // Pause / Arrêter of the strip stay usable over a sheet (strip-guard.js, U5): the sheet
  // starts below the strip and makes the rest inert; without the guard, everything else.
  function isolate(overlay){
    if(window.CNCStripGuard)return window.CNCStripGuard.isolate(overlay);
    main.inert=true;nav.inert=true;banner.inert=true;
    return function(){main.inert=false;nav.inert=false;banner.inert=false;};
  }
  function closeSheet(){
    if(!openedSheet)return;
    openedSheet.hidden=true;openedSheet=null;
    if(sheetRestore){sheetRestore();sheetRestore=null;}
    if(sheetReturn)sheetReturn.focus({preventScroll:true});
  }
  function sheet(id,title){
    var overlay=document.createElement('div');overlay.id=id;overlay.className='ks-sheet';overlay.hidden=true;
    overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby',id+'-title');
    overlay.innerHTML=uiLocale.html('<div class="ks-sheet-card"><header><h2 id="')+id+uiLocale.html('-title"></h2><button type="button" aria-label="Fermer">Fermer ×</button></header><div class="ks-sheet-content"></div></div>');
    overlay.querySelector('h2').textContent=title;overlay.querySelector('button').addEventListener('click',closeSheet);document.body.appendChild(overlay);
    return {content:overlay.querySelector('.ks-sheet-content'),open:function(){if(openedSheet===overlay)return;if(openedSheet)closeSheet();sheetReturn=document.activeElement;openedSheet=overlay;sheetRestore=isolate(overlay);overlay.hidden=false;overlay.querySelector('button').focus();}};
  }
  document.addEventListener('keydown',function(e){
    // An overlay opened above (the pad) made this one inert: the keys are its own (V1).
    if(!openedSheet||(window.CNCStripGuard&&window.CNCStripGuard.covered(openedSheet)))return;
    if(e.key==='Escape'){e.preventDefault();closeSheet();}
    if(e.key==='Tab'){
      var focusable=Array.prototype.filter.call(openedSheet.querySelectorAll('button,input,select,a[href]'),function(el){return !el.disabled&&!el.hidden&&el.getClientRects().length;});
      // The strip's Pause / Arrêter belong to the cycle (strip-guard.js).
      if(window.CNCStripGuard){window.CNCStripGuard.tab(e,openedSheet,focusable);return;}
      var first=focusable[0],last=focusable[focusable.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    }
  });
  var info=sheet('ks-file-info',uiLocale.t('Détails du fichier et de l’aperçu'));
  ['library-preview-note','library-regenerate','library-regenerate-status','job-state','job-selected'].forEach(function(id){info.content.appendChild(document.getElementById(id));});
  var portLabel=document.querySelector('label[for="job-port"]');info.content.appendChild(portLabel);info.content.appendChild(document.getElementById('job-port'));
  var tools=document.createElement('div');tools.className='ks-file-tools';
  var dimensionsPanel=sheet('ks-dimensions',uiLocale.t('Dimensions du parcours XY')),dimensionsContent=document.getElementById('library-dimensions-content');
  dimensionsContent.hidden=false;dimensionsPanel.content.appendChild(dimensionsContent);
  var dimensionsButton=document.createElement('button');dimensionsButton.type='button';dimensionsButton.textContent=uiLocale.t('Dimensions XY');dimensionsButton.addEventListener('click',dimensionsPanel.open);tools.appendChild(dimensionsButton);
  var detailsButton=document.createElement('button');detailsButton.type='button';detailsButton.textContent=uiLocale.t('Détails de l’aperçu');detailsButton.addEventListener('click',info.open);tools.appendChild(detailsButton);
  var followButton=document.createElement('button');followButton.type='button';followButton.textContent=uiLocale.t('Ouvrir le suivi →');followButton.addEventListener('click',function(){go('home');});tools.appendChild(followButton);
  document.querySelector('.library-detail').appendChild(tools);
  var upload=sheet('ks-upload',uiLocale.t('Ajouter un fichier à la bibliothèque'));
  var uploadBlock=document.getElementById('library-upload');uploadBlock.open=true;uploadBlock.querySelector('summary').hidden=true;upload.content.appendChild(uploadBlock);
  var uploadButton=document.createElement('button');uploadButton.type='button';uploadButton.className='ks-upload-button';uploadButton.textContent=uiLocale.t('+ Ajouter un fichier');uploadButton.addEventListener('click',upload.open);document.querySelector('.library-list-panel').appendChild(uploadButton);
  var refresh=document.getElementById('library-refresh');document.querySelector('.library-list-title').appendChild(refresh);document.querySelector('.library-header').hidden=true;
  document.getElementById('job-load').textContent=uiLocale.t('Charger et ouvrir le Suivi');
  document.querySelector('.library-execution h2').textContent=simulation?uiLocale.t('Travail simulé'):uiLocale.t('Exécution sur la machine');
  function bindSheet(id,title,contentId,buttonId){
    var panel=sheet(id,title),content=document.getElementById(contentId);
    content.hidden=false;panel.content.appendChild(content);
    document.getElementById(buttonId).addEventListener('click',panel.open);
  }
  bindSheet('ks-origin-help-sheet',uiLocale.t('Comprendre l’origine'),'ks-origin-explanation','ks-origin-info');
  var preparationActions=document.createElement('div');preparationActions.className='ks-preparation-actions';
  var probeEntry=document.querySelector('#screen-jog .probe-entry');if(probeEntry){probeEntry.textContent=simulation?uiLocale.t('Palpage X / Y / Z'):uiLocale.t('Sonde');preparationActions.appendChild(probeEntry);}
  var originInfo=document.getElementById('ks-origin-info');originInfo.textContent=uiLocale.t('Aide aux repères');preparationActions.appendChild(originInfo);
  document.querySelector('#screen-jog .ks-panel-intro').appendChild(preparationActions);
  var originProbe=document.createElement('button');originProbe.type='button';originProbe.className='ks-secondary';originProbe.textContent=simulation?uiLocale.t('Ouvrir le palpage X / Y / Z'):uiLocale.t('Ouvrir la sonde');originProbe.addEventListener('click',function(){go('probe');});document.getElementById('ks-origin-explanation').appendChild(originProbe);
  if(simulation){
    bindSheet('ks-origin-reset-sheet',uiLocale.t('Réinitialiser la simulation'),'ks-origin-reset-content','ks-origin-reset');
    bindSheet('ks-machine-help-sheet',uiLocale.t('Test d’alarme fictive'),'ks-machine-explanation','ks-machine-info');
  }else{
    bindSheet('ks-machine-help-sheet',uiLocale.t('Fonctions de la machine'),'ks-machine-explanation','ks-machine-info');
    bindSheet('ks-jog-settings-sheet',uiLocale.t('Vitesse de déplacement'),'ks-jog-settings-content','ks-jog-settings');
  }
  bindSheet('ks-history-export-sheet',uiLocale.t('Exporter le journal'),'ks-history-export-content','ks-history-export');
  if(!simulation){
    var historyButton=document.createElement('button');historyButton.type='button';historyButton.id='ks-machine-history';historyButton.className='ks-secondary';
    historyButton.textContent=uiLocale.t('Journal des événements →');historyButton.addEventListener('click',function(){go('history');});
    document.querySelector('.ks-machine-overview').appendChild(historyButton);
  }
  // Machine (UI 2027): the state as one large word, and an alarm explained in
  // plain words with what to do next, at the top of the overview card.
  var overview=document.querySelector('.ks-machine-overview');
  var machineWord=document.createElement('p');machineWord.id='ks-machine-word';machineWord.className='ks-machine-word';machineWord.setAttribute('data-tone','off');machineWord.textContent=uiLocale.t('Hors ligne');
  var machineAlarm=document.createElement('div');machineAlarm.id='ks-machine-alarm';machineAlarm.className='t-notice';machineAlarm.setAttribute('data-tone','danger');machineAlarm.hidden=true;
  machineAlarm.innerHTML=uiLocale.html('<div><b id="ks-machine-alarm-title"></b><span id="ks-machine-alarm-action"></span></div>');
  overview.insertBefore(machineAlarm,overview.firstChild);overview.insertBefore(machineWord,overview.firstChild);
  // The note under the coordinates sends to CNCjs for the cause: useless when the notice above explains the code.
  var coordNote=simulation?null:document.querySelector('#screen-machine .ks-machine-coordinates>.ks-help');
  if(coordNote&&!/\bks-help\b/.test(coordNote.className||''))coordNote=null;
  document.getElementById('ks-machine-follow').addEventListener('click',function(){go('home');});
  document.getElementById('ks-machine-limits').addEventListener('click',function(){go('limits');});
  document.getElementById('ks-machine-display').addEventListener('click',function(){go('settings');});
  [['.ks-origin-zero','origin'],['#sim-trigger-alarm','alarm'],['#sim-clear-alarm','check']].forEach(function(pair){
    var button=document.querySelector(pair[0]);if(!button)return;
    var label=button.textContent;button.innerHTML=icon(pair[1])+uiLocale.html('<span>')+label+uiLocale.html('</span>');
  });
  function go(name,back){
    if(!document.getElementById('screen-'+name))return;
    closeSheet();
    if(name==='menu')trail=[];
    else if(name!==active&&!back){var earlier=trail.lastIndexOf(name);if(earlier>=0)trail=trail.slice(0,earlier);else{trail.push(active);if(trail.length>20)trail.shift();}}
    active=name;
    if(name==='menu')resumeBar();else remember(name);
    // Kept screens stay laid out once shown (ui-2027.css): modules still only look at .active.
    document.querySelectorAll('.screen').forEach(function(s){var on=s.id==='screen-'+name;s.classList.toggle('active',on);if(on&&keptScreens.indexOf(name)>=0&&!s.classList.contains('kept'))s.classList.add('kept');});
    var navScreen=name==='probe'||name.indexOf('probe-')===0?'jog':name==='limits'||name==='commissioning'?'machine':name==='guide'?'settings':name;
    var sub=mainScreens.indexOf(name)<0;
    document.querySelectorAll('.ks-nav').forEach(function(b){var target=b.getAttribute('data-ks-screen');b.classList.toggle('active',target===navScreen);if(target===navScreen)b.setAttribute('aria-current',target===name?'page':'location');else b.removeAttribute('aria-current');if(target==='back'){b.disabled=name==='menu';if(b.hidden!==!sub)b.hidden=!sub;}});
    document.getElementById('ks-title').textContent=names[name];
    window.dispatchEvent(new CustomEvent('cnc-screen-change',{detail:name}));
  }
  // The last screen used survives a reload (the kiosk reloads after a deployment).
  var lastKey='cncjs-touch-last-screen',lastScreen='',lastMachine=null;
  try{var savedScreen=localStorage.getItem(lastKey);if(savedScreen&&mainScreens.indexOf(savedScreen)>0)lastScreen=savedScreen;}catch(_){}
  // Written when the page is hidden or left, not at every navigation (storage writes cost on the tablet).
  function remember(name){if(mainScreens.indexOf(name)<=0)return;lastScreen=name;}
  function persistLast(){if(!lastScreen)return;try{if(localStorage.getItem(lastKey)!==lastScreen)localStorage.setItem(lastKey,lastScreen);}catch(_){}}
  window.addEventListener('pagehide',persistLast);
  document.addEventListener('visibilitychange',function(){if(document.hidden)persistLast();});
  function resumeBar(){
    var bar=document.getElementById('ks-resume');if(!bar)return;
    var show=!!lastScreen&&lastScreen!==active;
    if(bar.hidden!==!show)bar.hidden=!show;
    if(!show)return;
    var m=lastMachine;
    setText(document.getElementById('ks-resume-title'),uiLocale.t('Reprendre où j’en étais : ')+(menuLabels[lastScreen]||names[lastScreen]));
    // The file line only under Suivi or Fichiers (the job's screens). No state published (observation lost):
    // the file's state is unknown, not « no file ». An alarm or a stale report is said before the workflow.
    var alarm=!!(m&&/^alarm/i.test(m.activeState||''));
    setText(document.getElementById('ks-resume-hint'),lastScreen!=='home'&&lastScreen!=='files'?'':!m?uiLocale.t('État du fichier indisponible'):m.name?(m.originalName||m.name)+(alarm?uiLocale.t(' · alarme'):!m.fresh?uiLocale.t(' · rapport ancien'):m.workflow==='running'?uiLocale.t(' · en cours'):m.workflow==='paused'?uiLocale.t(' · en pause'):m.canStart?uiLocale.t(' · prêt à démarrer'):''):uiLocale.t('Aucun fichier chargé'));
  }
  document.getElementById('ks-resume').addEventListener('click',function(){if(lastScreen)go(lastScreen);});
  function updateTiles(m,connected){
    var alarm=!!(m&&/^alarm/i.test(m.activeState||'')),running=!!(m&&m.workflow==='running'),paused=!!(m&&m.workflow==='paused');
    var pct=m&&typeof m.total==='number'&&m.total>0&&typeof m.received==='number'?Math.min(100,Math.floor(m.received/m.total*100)):null;
    var file=m&&m.name?(m.originalName||m.name):'';
    var word=window.cncStatusStrip?window.cncStatusStrip.describe(m,connected):{word:connected&&m?m.activeState:uiLocale.t('Hors ligne'),tone:connected&&m?'info':'off'};
    // A deduced alarm code is never shown as received (V6): « Alarme 3 déduite ».
    if(word.note)word={word:word.word+' '+word.note,tone:word.tone};
    // Words only (the tiles open a screen, they send nothing). Offline, a stale report and a machine that
    // moves outside a job (homing, probing, jog: tone run) are said before the routine words.
    var off=!m||!connected,stale=!off&&!m.fresh,moving=!off&&word.tone==='run'&&!running&&!paused;
    var share=pct!==null?' · '+pct+' %':'';
    live('home',off?'off':alarm?'danger':stale?'warn':running?'info':paused?'warn':moving?'info':m.canStart?'ok':'',
      off?uiLocale.t('Hors ligne'):alarm?uiLocale.t('Alarme'):stale?uiLocale.t('Rapport ancien')+share:running?uiLocale.t('En cours')+share:paused?uiLocale.t('En pause'):moving?word.word:m.canStart?uiLocale.t('Prêt à démarrer'):file||uiLocale.t('Aucun fichier chargé'));
    live('files',off?'off':file?'ok':'',off?uiLocale.t('État du fichier indisponible'):file?uiLocale.t('Chargé : ')+file:uiLocale.t('Choisir un parcours'));
    var canJog=!!(m&&m.motion&&m.motion.canJog===true);
    live('jog',alarm?'danger':off?'off':running||paused||moving?'warn':simulation?'':canJog?'ok':'warn',alarm?uiLocale.t('Bloqué : alarme'):off?uiLocale.t('Hors ligne'):running||paused?uiLocale.t('Bloqué : travail en cours'):moving?uiLocale.t('Machine en mouvement'):simulation?uiLocale.t('Simulateur'):canJog?uiLocale.t('Prêt à déplacer'):uiLocale.t('Déplacement indisponible'));
    var commissioning=!simulation&&window.cncCommissioning&&typeof window.cncCommissioning.status==='function'?window.cncCommissioning.status():null;
    var toDo=commissioning&&(commissioning.state==='none'||commissioning.state==='progress');
    // The tiles have no « run » style: a moving machine is shown in the info tone.
    var machineTone=word.tone==='run'?'info':word.tone;
    if(off||alarm||stale||word.tone==='run')live('machine',machineTone,word.word);
    else live('machine',toDo?'warn':machineTone,toDo?(commissioning.state==='progress'?uiLocale.t('Mise en service en cours'):uiLocale.t('Mise en service à faire')):word.word);
    // Journal and Réglages have no live state: their hint says it all, the indicator stays empty.
    live('history','','');
    live('settings','','');
    // Machine screen: the state word and the alarm explained.
    setText(machineWord,word.word);if(machineWord.getAttribute('data-tone')!==word.tone)machineWord.setAttribute('data-tone',word.tone);
    var help=alarm?(simulation?{title:uiLocale.t('Alarme fictive'),action:uiLocale.t('Effacez l’alarme ci-contre, puis confirmez la reprise dans Suivi.')}:window.CNCGrblHelp?window.CNCGrblHelp.alarm(m.alarmCode,m.alarmCodeInferred):{title:word.word,action:''}):null;
    if(machineAlarm.hidden!==!help)machineAlarm.hidden=!help;
    if(help){setText(document.getElementById('ks-machine-alarm-title'),help.title);setText(document.getElementById('ks-machine-alarm-action'),help.action);}
    if(coordNote){
      var helped=alarm&&!!window.CNCGrblHelp&&!!window.CNCGrblHelp.codes&&window.CNCGrblHelp.codes.alarms.indexOf(m.alarmCode)>=0;
      if(coordNote.hidden!==helped)coordNote.hidden=helped;
      setText(coordNote,alarm&&!helped?uiLocale.t('Code non reconnu : consulter CNCjs.'):uiLocale.t('En cas d’alarme, consulter sa cause dans CNCjs.'));
    }
  }
  window.addEventListener('cnc-job-status',function(e){
    if(!!e.detail.simulation!==simulation)return;
    lastMachine=e.detail.machine;
    // A published machine state is recent (read by the stream or by HTTP): shown as such (N3).
    updateTiles(e.detail.machine,!!e.detail.machine);
    if(active==='menu')resumeBar();
  });
  window.addEventListener('cnc-navigate',function(e){if(Object.prototype.hasOwnProperty.call(names,e.detail))go(e.detail);});
  function setText(el,value){if(el&&el.textContent!==value)el.textContent=value;}
  updateTiles(null,false);
  // A disabled control answers a tap with its reason: disabled buttons let the
  // tap through (pointer-events: none in ui-2027.css), the document finds the
  // button under the finger and shows its title, its data-reason, or the
  // screen's own status line, in a short toast. No hover, no long press.
  var toast=document.createElement('div');toast.id='ks-why';toast.className='ks-why';toast.setAttribute('role','status');toast.hidden=true;document.body.appendChild(toast);
  var toastTimer=null;
  function whyFor(button){
    var reason=button.title||button.getAttribute('data-reason')||'';
    if(!reason){
      var status=document.querySelector('#screen-'+active+' [role="status"]'),text=status&&status.textContent.trim();
      if(button.id==='t-pause'||button.id==='t-stop')reason=uiLocale.t('Aucun travail en cours.');
      else if(text)reason=text;
      else reason=uiLocale.t('Indisponible dans l’état actuel de la machine.');
    }
    return reason;
  }
  document.addEventListener('click',function(e){
    if(!e.isTrusted||(e.target&&e.target.closest&&e.target.closest('button,a,input,select,label')))return;
    var x=e.clientX,y=e.clientY,hit=null;
    var candidates=document.querySelectorAll('.screen.active button:disabled, #real-banner button:disabled, #simulation-banner button:disabled, .job-dialog button:disabled, .ks-sheet button:disabled');
    for(var i=0;i<candidates.length&&!hit;i++){var r=candidates[i].getBoundingClientRect();if(r.width&&x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom)hit=candidates[i];}
    if(!hit)return;
    setText(toast,whyFor(hit));toast.hidden=false;
    if(toastTimer!==null)clearTimeout(toastTimer);toastTimer=setTimeout(function(){toast.hidden=true;toastTimer=null;},4000);
  });
  // Inspection mode of Suivi (responsive.css, body.t-inspect): the path enlarged, the details
  // panel folded. A view preference of this page only; kept across resizes and rotations.
  var metrics=document.querySelector('#screen-home .job-art');
  if(metrics){
    var inspectRow=document.createElement('div');inspectRow.className='home-inspect-row';
    var inspect=document.createElement('button');inspect.type='button';inspect.id='t-inspect';inspect.className='t-inspect-toggle';inspect.setAttribute('aria-pressed','false');
    var inspectLabel=function(on){inspect.textContent=on?uiLocale.t('Afficher les détails'):uiLocale.t('Agrandir le tracé');};inspectLabel(false);
    inspect.addEventListener('click',function(){
      var on=!document.body.classList.contains('t-inspect');
      document.body.classList.toggle('t-inspect',on);inspect.setAttribute('aria-pressed',String(on));inspectLabel(on);
      window.dispatchEvent(new Event('resize'));
    });
    inspectRow.appendChild(inspect);metrics.appendChild(inspectRow);
  }
  // Shared with later modules (macros): sheets with focus trapping and navigation.
  window.cncShell={sheet:sheet,closeSheet:closeSheet,go:go,preparationActions:preparationActions,v2Mounts:v2Mounts,screen:function(){return active;}};
  go('menu',true);
})();
