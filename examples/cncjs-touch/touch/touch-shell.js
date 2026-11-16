(function(){
  'use strict';
  var uiLocale=window.cncI18n||{t:function(s){return s;},html:function(s){return s;}};
  var paths={more:'M3 3h6v6H3z M15 3h6v6h-6z M3 15h6v6H3z M15 15h6v6h-6z',
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
  var names={more:uiLocale.t('Plus'),check:uiLocale.t('Contrôle'),home:uiLocale.t('Usinage'),files:uiLocale.t('Fichier'),jog:uiLocale.t('Zéro pièce'),machine:uiLocale.t('Machine'),history:uiLocale.t('Journal'),settings:uiLocale.t('Réglages'),limits:uiLocale.t('Limites')};
  if(simulation){
  names.probe=uiLocale.t('Palpage');names['probe-profile']=uiLocale.t('Profils de sonde');names['probe-contact']=uiLocale.t('Test du contact');names['probe-report']=uiLocale.t('Résultats du palpage');
  names['probe-transfer']=uiLocale.t('Sauvegarde des profils');
  names['probe-preparation']=uiLocale.t('Préparation du palpage');
  }
  names['guide']=uiLocale.t('Guide');
  names['commissioning']=uiLocale.t('Mise en service');
  var main=document.querySelector('main'),nav=document.getElementById('tabbar'),banner=document.getElementById(simulation?'simulation-banner':'real-banner');
  document.body.classList.add('ks-ui');
  document.body.classList.toggle('ks-real',!simulation);
  // The header is the status strip (status-strip.js fills its left part). The
  // screen title stays for assistive technology; the rail shows the place. The real page
  // shows no mode badge: its empty, hidden span only anchors the clock (header-clock.js).
  banner.innerHTML=uiLocale.html('<h1 id="ks-title" class="ks-sr-only">Machine</h1><div class="t-strip-right"><span class="ks-simulation"'+(simulation?'':' hidden')+'>')+(simulation?uiLocale.t('SIMULATION'):'')+uiLocale.html('</span>')+(simulation?'<a href="index.html" class="ks-exit">'+uiLocale.t('Réel ↗')+'</a>':'')+uiLocale.html('</div>');
  var more=document.createElement('section');more.id='screen-more';more.className='screen';
  more.innerHTML=uiLocale.html('<h2>Plus</h2><div class="ks-tiles"></div><p id="more-version"></p>');main.insertBefore(more,main.firstChild);
  var check=document.createElement('section');check.id='screen-check';check.className='screen';check.innerHTML='<div id="check-verdict" class="card t-pcheck"></div>';main.appendChild(check);
  var tileHints={history:'Événements et exports',settings:'Affichage, système',commissioning:'Mise en service de la machine',guide:'Le fil de la séance',macros:'Aucune macro dans CNCjs'};
  ['history','settings','commissioning','guide','macros'].forEach(function(name){var b=document.createElement('button');b.type='button';b.className='ks-tile';b.setAttribute('data-ks-tile',name);b.innerHTML=icon(paths[name]?name:'check')+'<div class="ks-tile-text"><span></span><small></small></div>';b.querySelector('span').textContent=name==='macros'?uiLocale.t('Macros'):names[name];b.querySelector('small').textContent=uiLocale.t(tileHints[name]);if(simulation&&name==='commissioning'){b.disabled=true;b.querySelector('small').textContent=uiLocale.t('Mise en service : page réelle uniquement.');}if(name==='macros'){b.id='ks-macros-open';b.disabled=true;}else b.addEventListener('click',function(){if(name==='commissioning'&&window.cncCommissioning)window.cncCommissioning.open();else go(name);});more.querySelector('.ks-tiles').appendChild(b);});
  nav.innerHTML='';
  var mainScreens=['machine','files','jog','check','home','more'],keptScreens=['more','jog','files','check','home','machine','history'];
  mainScreens.forEach(function(name,i){var b=document.createElement('button');b.type='button';b.className='ks-nav';b.setAttribute('data-ks-screen',name);b.setAttribute('aria-label',names[name]);if(i<5){b.setAttribute('data-seance-step',String(i+1));b.setAttribute('data-seance-state','inconnu');b.innerHTML='<span class="ks-step-number">'+(i+1)+'<small class="ks-step-mark">?</small></span><span class="ks-nav-name"></span>';}else b.innerHTML='<b>···</b><span class="ks-nav-name"></span>';b.querySelector('.ks-nav-name').textContent=names[name];b.addEventListener('click',function(){go(name);});nav.appendChild(b);});
  ['machine','files','jog','check','home'].forEach(function(name,i){
    var root=document.getElementById('screen-'+name),body=document.createElement('div');body.className='ks-step-body';while(root.firstChild)body.appendChild(root.firstChild);root.appendChild(body);root.classList.add('ks-step-screen');
    var head=document.createElement('header');head.className='ks-step-head';head.innerHTML='<h2 id="step-'+name+'-title"></h2><span id="step-'+name+'-context"></span><b id="step-'+name+'-state"></b>';head.querySelector('h2').textContent=(i+1)+' · '+names[name];root.insertBefore(head,root.firstChild);
    var bar=document.createElement('footer');bar.className='ks-stepbar';bar.innerHTML='<p id="step-'+name+'-cause" role="status"></p><button id="step-'+name+'-remedy" data-action="details" hidden></button><button id="step-'+name+'-remedy2" data-action="details" hidden></button><button id="step-'+name+'-details" data-action="details">'+uiLocale.t('Détails')+'</button><button id="step-'+name+'-main" data-action="details" disabled></button>';root.appendChild(bar);
  });
  var active='machine';
  // Compact layout (ui-2027.css, body.t-compact) under 1100 x 650: screens are laid out
  // shorter rather than shrunk by viewport-fit.js, which stays a safety net. Decided
  // from the window only (a visual preference, never a permission).
  function fitLibrary(){
    var compact=window.innerHeight<650||window.innerWidth<1100;
    if(document.body.classList.contains('t-compact')!==compact)document.body.classList.toggle('t-compact',compact);
    window.dispatchEvent(new CustomEvent('cnc-library-page-size',{detail:compact?3:window.innerHeight<880?4:6}));window.dispatchEvent(new CustomEvent('cnc-history-page-size',{detail:compact?4:document.body.classList.contains('display-large')?5:6}));}
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
      var screen=name==='prepare'?'check':name,root=name==='machine'?document.getElementById('ks-machine-details'):document.getElementById('screen-'+screen);
      if(!root)return;
      var content=document.createElement('div');content.id='perf-v2-'+name;content.hidden=true;
      content.setAttribute('data-v2-mount',name);
      var performanceCard=name==='settings'?document.getElementById('ks-performance-card'):null;
      if(performanceCard&&performanceCard.parentNode===root)root.insertBefore(content,performanceCard.nextSibling);
      else (root.querySelector&&(name==='machine'?root.querySelector('.ks-sheet-content'):root.querySelector('.ks-step-body'))||root).appendChild(content);
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
    var closed=openedSheet.id;openedSheet.hidden=true;openedSheet=null;window.dispatchEvent(new CustomEvent('cnc-sheet-change',{detail:{id:closed,open:false}}));
    if(sheetRestore){sheetRestore();sheetRestore=null;}
    if(sheetReturn)sheetReturn.focus({preventScroll:true});
  }
  function sheet(id,title){
    var overlay=document.createElement('div');overlay.id=id;overlay.className='ks-sheet';overlay.hidden=true;
    overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby',id+'-title');
    overlay.innerHTML=uiLocale.html('<div class="ks-sheet-card"><header><h2 id="')+id+uiLocale.html('-title"></h2><button type="button" aria-label="Fermer">Fermer ×</button></header><div class="ks-sheet-content"></div></div>');
    overlay.querySelector('h2').textContent=title;overlay.querySelector('button').addEventListener('click',closeSheet);document.body.appendChild(overlay);
    return {content:overlay.querySelector('.ks-sheet-content'),open:function(){if(openedSheet===overlay)return;if(openedSheet)closeSheet();sheetReturn=document.activeElement;openedSheet=overlay;sheetRestore=isolate(overlay);overlay.hidden=false;overlay.querySelector('button').focus();window.dispatchEvent(new CustomEvent('cnc-sheet-change',{detail:{id:id,open:true}}));}};
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
  ['library-status','library-preview-note','library-regenerate','library-regenerate-status','job-state','job-state-reason','job-selected'].forEach(function(id){info.content.appendChild(document.getElementById(id));});
  var machineDetails=sheet('ks-machine-details',uiLocale.t('Détails de la machine'));
  var machineContent=document.getElementById('machine-details-content');if(machineContent){machineContent.hidden=false;machineDetails.content.appendChild(machineContent);}
  var portLabel=document.querySelector('label[for="job-port"]');machineDetails.content.appendChild(portLabel);machineDetails.content.appendChild(document.getElementById('job-port'));
  var limits=document.getElementById('machine-limits-content');if(limits)machineDetails.content.appendChild(limits);
  var machineDetailsOpen=document.getElementById('machine-details-open');if(machineDetailsOpen)machineDetailsOpen.addEventListener('click',machineDetails.open);
  var tools=document.createElement('div');tools.className='ks-file-tools';
  var dimensionsContent=document.getElementById('library-dimensions-content');dimensionsContent.hidden=false;info.content.appendChild(dimensionsContent);
  var detailsButton=document.createElement('button');detailsButton.type='button';detailsButton.textContent=uiLocale.t('Détails du fichier');detailsButton.addEventListener('click',info.open);tools.appendChild(detailsButton);
  document.querySelector('.library-detail').appendChild(tools);
  var upload=sheet('ks-upload',uiLocale.t('Ajouter un fichier à la bibliothèque'));
  var uploadBlock=document.getElementById('library-upload');uploadBlock.open=true;uploadBlock.querySelector('summary').hidden=true;upload.content.appendChild(uploadBlock);
  var uploadButton=document.createElement('button');uploadButton.type='button';uploadButton.className='ks-upload-button';uploadButton.textContent=uiLocale.t('+ Ajouter un fichier');uploadButton.addEventListener('click',upload.open);tools.insertBefore(uploadButton,tools.firstChild);
  var projectOpen=document.getElementById('project-open');if(projectOpen){projectOpen.textContent=uiLocale.t('Fiche du projet');tools.appendChild(projectOpen);}
  ['library-project','library-meta','library-selection-state'].forEach(function(id){var node=document.getElementById(id);if(node)info.content.appendChild(node);});
  var refresh=document.getElementById('library-refresh');document.querySelector('.library-list-title').appendChild(refresh);document.querySelector('.library-header').hidden=true;
  document.querySelector('.library-execution h2').textContent=simulation?uiLocale.t('Travail simulé'):uiLocale.t('Exécution sur la machine');
  function bindSheet(id,title,contentId,buttonId){
    var panel=sheet(id,title),content=document.getElementById(contentId);
    content.hidden=false;panel.content.appendChild(content);
    document.getElementById(buttonId).addEventListener('click',panel.open);
  }
  if(simulation)bindSheet('ks-origin-help-sheet',uiLocale.t('Comprendre l’origine'),'ks-origin-explanation','ks-origin-info');
  var preparationActions=simulation&&document.querySelector('#screen-jog .ks-preparation-actions');
  if(simulation&&!preparationActions){preparationActions=document.createElement('div');preparationActions.className='ks-preparation-actions';document.querySelector('#screen-jog .ks-panel-intro').appendChild(preparationActions);}
  var probeEntry=document.querySelector('#screen-jog .probe-entry');if(probeEntry){probeEntry.textContent=simulation?uiLocale.t('Palpage X / Y / Z'):uiLocale.t('Sonde');preparationActions.appendChild(probeEntry);}
  if(simulation){var originInfo=document.getElementById('ks-origin-info');originInfo.textContent=uiLocale.t('Aide aux repères');preparationActions.appendChild(originInfo);
    var originProbe=document.createElement('button');originProbe.type='button';originProbe.className='ks-secondary';originProbe.textContent=uiLocale.t('Ouvrir le palpage X / Y / Z');originProbe.addEventListener('click',function(){go('probe');});document.getElementById('ks-origin-explanation').appendChild(originProbe);}
  if(simulation){
    bindSheet('ks-origin-reset-sheet',uiLocale.t('Réinitialiser la simulation'),'ks-origin-reset-content','ks-origin-reset');
    bindSheet('ks-machine-help-sheet',uiLocale.t('Test d’alarme fictive'),'ks-machine-explanation','ks-machine-info');
  }
  bindSheet('ks-history-export-sheet',uiLocale.t('Exporter le journal'),'ks-history-export-content','ks-history-export');
  var overview=simulation?document.querySelector('.ks-machine-overview'):null,machineWord=null,machineAlarm=null;
  if(overview){
    if(!machineDetailsOpen){machineDetailsOpen=document.createElement('button');machineDetailsOpen.id='machine-details-open';machineDetailsOpen.textContent=uiLocale.t('Détails de la machine');machineDetailsOpen.addEventListener('click',machineDetails.open);overview.appendChild(machineDetailsOpen);}
    machineWord=document.createElement('p');machineWord.id='ks-machine-word';overview.appendChild(machineWord);
    machineAlarm=document.createElement('div');machineAlarm.id='ks-machine-alarm';machineAlarm.hidden=true;machineAlarm.innerHTML='<b id="ks-machine-alarm-title"></b><span id="ks-machine-alarm-action"></span>';overview.appendChild(machineAlarm);
    ['ks-machine-follow','ks-machine-limits','ks-machine-display'].forEach(function(id){var b=document.getElementById(id);if(b)b.addEventListener('click',id==='ks-machine-limits'?machineDetails.open:function(){go(id==='ks-machine-follow'?'home':'settings');});});
  }
  [['.ks-origin-zero','origin'],['#sim-trigger-alarm','alarm'],['#sim-clear-alarm','check']].forEach(function(pair){
    var button=document.querySelector(pair[0]);if(!button)return;
    var label=button.textContent;button.innerHTML=icon(pair[1])+uiLocale.html('<span>')+label+uiLocale.html('</span>');
  });
  function go(name){
    var root=document.getElementById('screen-'+name);if(!root)return;
    closeSheet();active=name;
    document.querySelectorAll('.screen').forEach(function(s){var on=s===root;s.classList.toggle('active',on);if(on&&keptScreens.indexOf(name)>=0&&!s.classList.contains('kept'))s.classList.add('kept');});
    var navScreen=name==='probe'||name.indexOf('probe-')===0?'jog':name==='limits'?'machine':mainScreens.indexOf(name)<0?'more':name;
    document.querySelectorAll('.ks-nav').forEach(function(b){var on=b.getAttribute('data-ks-screen')===navScreen;b.classList.toggle('active',on);if(on)b.setAttribute('aria-current',navScreen===name?'page':'location');else b.removeAttribute('aria-current');});
    if(mainScreens.indexOf(name)<0&&!root.querySelector('.ks-sub-head')){var back=root.querySelector('#guide-back')||document.createElement('button');back.type='button';back.className='ks-back';var destination=navScreen==='more'?'more':navScreen;back.textContent='← '+names[destination];if(back.id!=='guide-back')back.addEventListener('click',function(){go(destination);});var subhead=document.createElement('header');subhead.className='ks-sub-head';subhead.appendChild(back);var subTitle=document.createElement('h2');subTitle.textContent=names[name];subhead.appendChild(subTitle);root.insertBefore(subhead,root.firstChild);}
    document.getElementById('ks-title').textContent=names[name]||names.more;
    window.dispatchEvent(new CustomEvent('cnc-screen-change',{detail:name}));
  }
  function updateTiles(m,connected){
    if(!simulation)return;
    var alarm=!!(m&&/^alarm/i.test(m.activeState||''));
    var word=window.cncStatusStrip?window.cncStatusStrip.describe(m,connected):{word:connected&&m?m.activeState:uiLocale.t('Hors ligne'),tone:connected&&m?'info':'off'};
    // Machine screen: the state word and the alarm explained.
    setText(machineWord,word.word);if(machineWord.getAttribute('data-tone')!==word.tone)machineWord.setAttribute('data-tone',word.tone);
    var help=alarm?(simulation?{title:uiLocale.t('Alarme fictive'),action:uiLocale.t('Effacez l’alarme ci-contre, puis confirmez la reprise dans Suivi.')}:window.CNCGrblHelp?window.CNCGrblHelp.alarm(m.alarmCode,m.alarmCodeInferred):{title:word.word,action:''}):null;
    if(machineAlarm.hidden!==!help)machineAlarm.hidden=!help;
    if(help){setText(document.getElementById('ks-machine-alarm-title'),help.title);setText(document.getElementById('ks-machine-alarm-action'),help.action);}
  }
  window.addEventListener('cnc-job-status',function(e){
    if(!!e.detail.simulation!==simulation)return;
    // A published machine state is recent (read by the stream or by HTTP): shown as such (N3).
    updateTiles(e.detail.machine,!!e.detail.machine);
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
  var detailSheet=null;
  function details(data){data=data||{};if(!detailSheet)detailSheet=sheet('ks-details',uiLocale.t('Détails'));detailSheet.content.textContent='';(data.lignes||[]).forEach(function(line){var p=document.createElement('p');p.textContent=String(line.libelle||'')+' : '+String(line.valeur===undefined?'—':line.valeur);detailSheet.content.appendChild(p);});if(data.brut){var pre=document.createElement('pre');pre.textContent=JSON.stringify(data.brut,null,2);detailSheet.content.appendChild(pre);}detailSheet.open();}
  window.cncShell={details:details,sheet:sheet,closeSheet:closeSheet,go:go,v2Mounts:v2Mounts,screen:function(){return active;}};
  go('machine');
  if(window.cncSeance)window.cncSeance.render();
})();
