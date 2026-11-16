/* File selection and Control share the server's check. No motion or travel permission is inferred here. */
(function () {
  'use strict';
  var locale=window.cncI18n,t=locale.t,view=window.CNCProgramCheckView,shell=window.cncShell;
  if(!shell||!view)return;
  var $=function(id){return document.getElementById(id);},screen=$('screen-check'),body=screen&&screen.querySelector('.ks-step-body');
  if(!body)return;
  body.innerHTML=locale.html('<div class="check-layout"><section class="t-card check-top-card"><h2>Vue de dessus</h2><div id="check-top" class="check-drawing"></div><button type="button" id="check-placement-open" hidden>Vue 3D du placement</button></section><section class="t-card check-side-card"><h2>Vue de côté</h2><div id="check-side" class="check-drawing"></div></section><section class="t-card check-result-card"><h2>Verdict</h2><div id="check-verdict" role="status"></div><p id="check-spindle"></p><div id="check-rapids"></div><button type="button" id="check-frame-start" hidden>Cadrer…</button><p id="check-frame-reason"></p><button type="button" id="check-details-open">Détails du contrôle</button></section></div>');
  var details=shell.sheet('ks-check-details',t('Détails du contrôle'));
  details.content.innerHTML=locale.html('<div id="check-details-values"></div><p>Ni les brides ni la pièce ne sont vues.</p><p id="check-override-warning"></p><div id="check-override-host"></div><p id="check-override-feedback" role="status"></p>');
  var placement=shell.sheet('ks-check-placement',t('Vue 3D du placement'));
  placement.content.classList.add('active');
  placement.content.innerHTML=locale.html('<p id="check-placement-state" role="status" hidden></p><button type="button" id="check-placement-retry" hidden>Réessayer</button>');
  var facts=document.createElement('div');facts.className='files-facts';facts.innerHTML=locale.html('<div><span>Emprise</span><strong id="files-extent">—</strong></div><div><span>Profondeur sous le zéro</span><strong id="files-depth">—</strong></div>');
  var image=$('library-image').parentNode;image.parentNode.insertBefore(facts,image.nextSibling);
  var verdict=document.createElement('div');verdict.className='files-verdict';verdict.innerHTML='<p id="files-verdict" role="status"></p><button type="button" id="files-verdict-remedy" hidden></button>';
  facts.parentNode.insertBefore(verdict,facts.nextSibling);var loaded=$('job-loaded');if(loaded)facts.parentNode.insertBefore(loaded,verdict);
  var last={},selected=window.cncLibrarySelection||null,fileCheck=null,fileError=null,checking=false,awaitingZero=false,serial=0,askedKey='',drawKey='',detailKey='',originRequest=0,originMounted=false,originLoading=false,originFailed=false,placementOpen=false,locked=false,ended=false;
  function text(id,value){var n=$(id);if(n&&n.textContent!==String(value))n.textContent=String(value);}
  function prop(id,k,v){var n=$(id);if(n&&n[k]!==v)n[k]=v;}
  function machine(){return last.machine||null;}
  function isLaser(m){return !!(m&&m.machineProfile&&m.machineProfile.kind==='laser');}
  function isActive(name){return !document.hidden&&shell.screen()===name;}
  function trusted(m,input){var d=input||last;return !!(m&&m.fresh&&d.transportConnected&&(!d.pilot||d.pilot.state!=='other')&&!d.systemCommand&&!d.busy);}
  function offsetProven(m){return !!(m&&m.workOffset&&m.workOffset.state==='proven');}
  function overrideAllowed(m){return !!(trusted(m)&&m.homed&&!m.referenceLost&&offsetProven(m)&&m.workflow==='idle'&&view.outside(m.programCheck)&&m.programCheck.overridable===true);}
  function codes(check){return check&&check.codedReasons||[];}
  function checkProjection(input,base){
    var m=input.machine,c=m&&m.programCheck,global=base.globale,rank=base.rang,word='En attente',phrase='',remedies=[],allowed=false,id='demarrer';
    if(global&&rank<=11){word=global.texte;phrase=global.texte;remedies=global.remedes;}
    else if(m&&(m.workflow==='running'||m.workflow==='paused')){word='Usinage en cours';phrase='Un usinage est en cours.';id='suite:home';allowed=true;}
    else if(!m||!m.name){phrase='Aucun fichier chargé.';remedies=['choisir-fichier'];}
    else if(m.jobStopped||m.finished||m.finishedWithErrors){word='À recharger';phrase=t('Rechargez « {fichier} » avant de démarrer.').replace('{fichier}',m.originalName||m.name);remedies=['recharger-fichier'];}
    else if(!offsetProven(m)){
      var o=m.workOffset;
      if(o&&(o.state==='unknown'||o.state==='checking'))phrase='La machine vérifie le zéro pièce. Attendez quelques secondes.';
      else {word='Zéro pièce à vérifier';var r=window.cncRefus.lire({code:o&&o.code||'ETOUCH_OFFSET_UNCONFIRMED'});phrase=r.phrase;remedies=r.remedes;}
    }else if(view.outside(c)){
      word='Dépasse';var g53=codes(c).filter(function(r){return r.code==='ETOUCH_CHECK_OUTSIDE_G53';})[0],b=view.blocks(c)[0];
      if(g53){phrase=t('Le fichier demande une position hors de la machine, ligne {n}. Refaire le zéro n’y change rien.').replace('{n}',g53.params&&g53.params.line||'—');remedies=['choisir-fichier'];}
      else if(b){phrase=window.cncRefus.lire(b).phrase;remedies=window.cncRefus.lire(b).remedes;if(b.code==='ETOUCH_TRAVEL_TOO_LOW'||b.code==='ETOUCH_TRAVEL_TOO_HIGH')word='Dépasse en Z';}
      else {phrase='Le fichier dépasse la course de la machine.';remedies=['refaire-zero','choisir-fichier'];}
    }else if(m.canStart===false){
      var refused=window.cncRefus.lire(m.refusals&&m.refusals.start||{message:m.startReason});word='En attente';phrase=refused.phrase;remedies=refused.remedes;
    }else if(!c||c.verdict!=='validated'){
      word='Non vérifié';var r0=codes(c).filter(function(r){return /HOMING|NOT_HOMED|TRAVEL_UNKNOWN|REPORT_UNITS/.test(r.code);})[0];
      if(r0){var why=window.cncRefus.lire(r0);phrase=why.phrase;remedies=why.remedes;}
      else {var axes=['X','Y','Z'].filter(function(a){return !c||!c.axes||!c.axes[a]||c.axes[a].verdict==='unknown';}).join(', ');phrase=t('Ce fichier ne peut pas être vérifié en {axe}. Vérifiez à la main qu’il tient.').replace('{axe}',axes||'—');remedies=['details'];}
      allowed=!!m.canStart;
    }else {word='Tient dans la machine';phrase='Tout est prêt : le fichier tient dans la machine.';allowed=!!m.canStart;}
    if(id==='demarrer'&&global&&rank===13){word=global.texte;phrase=global.texte;remedies=global.remedes;allowed=false;}
    if(id==='demarrer'&&(!trusted(m,input)||!offsetProven(m)))allowed=false;
    var guards={'prise-origine':!!(m&&m.canHome),relire:!!(m&&m.canReadSettings),'verifier-zero':!!(m&&m.workOffset&&m.workOffset.canVerify),'recharger-fichier':!!(m&&m.canLoad)};
    return {word:t(word),bar:{cause:{id:'controle',texte:t(phrase),ton:/^Dépasse/.test(word)?'danger':word==='Non vérifié'||word==='Zéro pièce à vérifier'?'warn':'neutre'},remedes:remedies.slice(0,2).map(function(r){return {id:r,actif:!(r in guards)||guards[r]};}),details:true,action:{id:id,libelle:id==='suite:home'?t('Suite : {etape} →').replace('{etape}',t(isLaser(m)?'Gravure':'Usinage')):t(isLaser(m)?'Démarrer la gravure…':'Démarrer l’usinage…'),style:allowed?'plein':'raye'}}};
  }
  // Called by the session presenter so rail, heading and action bar keep one owner.
  function project(input,base){
    var m=input.machine,r=checkProjection(input,base);base.etapes.check.mot=r.word;base.barres.check=r.bar;
    var b=base.barres.files,s=input.selection,same=!!(s&&m&&s.file===m.name),running=!!(m&&(m.workflow==='running'||m.workflow==='paused'));
    base.etapes.files.mot=t(same?'Chargé':s?'Choisi':'Aucun fichier');base.etapes.files.contexte=s&&s.name||m&&m.originalName||m&&m.name||'';
    if(same&&!(base.globale&&base.rang<=6)&&!running){
      var next=base.etapes.jog.etat==='fait'?'check':'jog';b.action={id:'suite:'+next,libelle:t('Suite : {etape} →').replace('{etape}',t(next==='jog'?'Zéro pièce':'Contrôle')),style:'plein'};
      b.cause={id:'fichier-charge',texte:t('Fichier chargé. Le zéro Z sera à refaire.'),ton:'neutre'};b.remedes=[{id:'voir-controle',actif:true}];
    }else if(s){b.action={id:'charger',libelle:t('Charger ce fichier'),style:trusted(m,input)&&m.canLoad?'plein':'raye'};if(trusted(m,input)&&m.canLoad){b.cause={id:'choisi',texte:t('Fichier choisi. Chargez-le pour continuer.'),ton:'neutre'};b.remedes=[];}}
    return base;
  }
  function fileKey(){var m=machine();return JSON.stringify([selected&&selected.file,m&&m.port,m&&m.generation]);}
  function requestCheck(){
    var key=fileKey(),file=selected&&selected.file,own=++serial;askedKey=key;fileCheck=null;fileError=null;checking=!!file;awaitingZero=false;paintFiles();
    if(!file)return Promise.resolve();
    var c=window.cncJobControls;
    return (c&&c.checkFile?c.checkFile(file):Promise.reject(new Error(t('Contrôle indisponible.')))).then(function(data){
      if(own!==serial||fileKey()!==key||ended)return;
      fileCheck=data&&data.programCheck||null;fileError=fileCheck?null:new Error(t('Contrôle indisponible.'));checking=false;paintFiles();
    },function(e){if(own!==serial||fileKey()!==key||ended)return;fileError=e;checking=false;paintFiles();});
  }
  function paintFiles(){
    if(!isActive('files'))return;
    var m=machine(),preview=$('library-image').cncPreview,check=fileCheck;
    if(preview&&(!selected||preview.file!==selected.file))preview=null;
    var axes=check&&check.axes,x=axes&&axes.X,y=axes&&axes.Y,b=preview&&preview.projection&&preview.projection.bounds;
    var width=x&&typeof x.min==='number'&&typeof x.max==='number'?x.max-x.min:b&&b[2]-b[0],height=y&&typeof y.min==='number'&&typeof y.max==='number'?y.max-y.min:b&&b[3]-b[1];
    text('files-extent',selected&&isFinite(width)&&isFinite(height)?view.fmt(width)+' × '+view.fmt(height)+' mm':'—');
    var z=check&&check.zMin;if(typeof z!=='number'&&preview&&preview.zBounds)z=preview.zBounds[0];
    text('files-depth',!selected||typeof z!=='number'?'—':z>=0?t('Ne descend pas sous le zéro'):view.fmt(-z)+' mm');
    var v=!selected?{text:t('Choisissez un fichier.'),remedy:''}:checking?{text:t('Vérification…'),remedy:''}:view.fileVerdict(check);
    if(selected&&awaitingZero)v={text:t(m&&m.homed?'Course pas encore vérifiée : la machine vérifie le zéro pièce.':'Course non vérifiée : origine machine pas prise.'),remedy:m&&m.homed?'':'prise-origine'};
    if(check&&view.outside(check)&&m&&selected&&selected.file===m.name)v.remedy='voir-controle';
    text('files-verdict',(check&&view.outside(check)?'! ':'')+v.text);
    var button=$('files-verdict-remedy');prop('files-verdict-remedy','hidden',!v.remedy);if(button.getAttribute('data-file-remedy')!==v.remedy)button.setAttribute('data-file-remedy',v.remedy);text('files-verdict-remedy',t(v.remedy==='retry'?'Réessayer':v.remedy==='voir-controle'?'Voir le contrôle':v.remedy==='prise-origine'?'Prise d’origine machine…':'Détails'));
    var tone=check&&check.verdict||'unknown';if(verdict.getAttribute('data-verdict')!==tone)verdict.setAttribute('data-verdict',tone);
  }
  function paintDetails(){
    var m=machine(),c=m&&m.programCheck,key=JSON.stringify([c,overrideAllowed(m),fileError&&fileError.message]);
    if(key===detailKey)return;detailKey=key;
    var host=$('check-details-values');view.show(host,c);
    ['X','Y','Z'].forEach(function(a){var e=c&&c.axes&&c.axes[a],p=document.createElement('p');p.textContent=a+' · '+t('Fichier')+' '+view.fmt(e&&e.machineMin)+' → '+view.fmt(e&&e.machineMax)+' mm · '+t('Course utilisable')+' '+view.fmt(e&&e.usable&&e.usable.low)+' → '+view.fmt(e&&e.usable&&e.usable.high)+' mm';host.appendChild(p);});
    (c&&c.codedReasons||[]).concat(c&&c.info||[],c&&c.uninterpreted||[],m&&m.laserCheck&&m.laserCheck.reasons||[]).forEach(function(r){var p=document.createElement('p');p.textContent=typeof r==='string'?(locale.message||t)(r):r.code&&locale.format?locale.format(r.code,r.params,r.message||r.code)+' · '+r.code+' · '+(r.message||''):JSON.stringify(r);host.appendChild(p);});
    var out=view.outside(c),allow=overrideAllowed(m),container=$('check-override-host');container.textContent='';
    text('check-override-warning',!out?'':allow?t('Démarrer quand même arrêtera la machine en alarme et lui fera perdre sa position.'):t('Sur cette machine, on ne peut pas démarrer malgré un dépassement.'));
    if(allow){var button=document.createElement('button');button.id='check-override-open';button.className='t-btn t-btn--warn';button.textContent=t('Démarrer malgré le dépassement…');button.addEventListener('click',function(){if(!overrideAllowed(machine()))return;window.cncJobControls.startOverride().then(function(r){if(r&&r.error)window.cncSeance.refuser(r.error);});});container.appendChild(button);}
  }
  function paint(){
    var mount=$('perf-v2-files'),detail=document.querySelector('.library-detail');if(mount&&detail&&mount.parentNode!==detail)detail.insertBefore(mount,facts);
    paintFiles();if(!isActive('check'))return;
    var m=machine(),c=m&&m.programCheck,key=JSON.stringify([c,m&&m.coordinates]);
    if(key!==drawKey){drawKey=key;$('check-top').innerHTML=view.drawing(c,'top',m&&m.coordinates);$('check-side').innerHTML=view.drawing(c,'side');var node=$('check-verdict');node.textContent='';view.axisLines(c).forEach(function(a){var p=document.createElement('p');p.setAttribute('data-verdict',a.verdict);p.textContent=a.text;node.appendChild(p);});}
    var info=(c&&c.info||[]).filter(function(r){return r&&r.code==='ETOUCH_CHECK_S_ABOVE_MAX';})[0];
    text('check-spindle',info?t('Le fichier demande {n} tr/min : la broche tournera à son maximum.').replace('{n}',info.params&&info.params.s):'');
    prop('check-rapids','hidden',isLaser(m));prop('check-frame-start','hidden',!isLaser(m));
    var cap=m&&m.machineProfile&&m.machineProfile.capabilities&&m.machineProfile.capabilities.laserFrame,ok=!!(trusted(m)&&cap&&cap.supported);
    prop('check-frame-start','disabled',!ok);text('check-frame-reason',isLaser(m)&&!ok?(last.pilot&&last.pilot.state==='other'?t('La main est sur un autre appareil.'):cap&&(locale.message||t)(cap.reason)||t('Cadrage indisponible.')):'');
    prop('check-placement-open','hidden',!advanced());paintDetails();
  }
  function advanced(){try{return !!(window.cncV2&&window.cncV2.state().layout&&window.cncV2.gate()&&window.cncProfile&&window.cncProfile.performance()==='performance'&&!isLaser(machine()));}catch(_){return false;}}
  function unmount(){originRequest++;if(originMounted&&window.CNCOriginPreview)window.CNCOriginPreview.unmount();originMounted=false;originLoading=false;originFailed=false;text('check-placement-state','');prop('check-placement-state','hidden',true);prop('check-placement-retry','hidden',true);}
  function syncPlacement(){
    var v=window.cncV2,state=v&&v.state();
    if(!placementOpen||!isActive('check')||document.hidden||locked||ended||!advanced()){
      if(originMounted&&placementOpen&&state&&state.layout&&state.holdLayout&&!document.hidden&&!locked&&isActive('check'))return;
      unmount();return;
    }
    if(!state.safeIdle){if(!originMounted){originRequest++;originLoading=false;}return;}
    if(originMounted||originLoading||originFailed)return;
    var own=++originRequest;
    originLoading=true;text('check-placement-state',t('Chargement…'));prop('check-placement-state','hidden',false);prop('check-placement-retry','hidden',true);
    var current=function(){return own===originRequest&&placementOpen&&advanced()&&isActive('check')&&!document.hidden&&!locked&&!ended&&window.cncV2.state().safeIdle;};
    window.cncProfile.loadAdvanced(['preview-gl.js','origin-preview.js']).then(function(){
      if(own!==originRequest)return;originLoading=false;
      if(!current()){unmount();return;}
      originMounted=true;prop('check-placement-state','hidden',true);window.CNCOriginPreview.mount(placement.content);
    },function(){
      if(own!==originRequest)return;originLoading=false;
      if(!current()){unmount();return;}
      originFailed=true;text('check-placement-state',t('Aperçu indisponible.'));prop('check-placement-retry','hidden',false);
    });
  }
  $('check-placement-retry').addEventListener('click',function(){if(originLoading||!placementOpen)return;originFailed=false;syncPlacement();});
  $('check-details-open').addEventListener('click',function(){paintDetails();details.open();});
  $('check-placement-open').addEventListener('click',function(){if(!advanced())return;placement.open();});
  $('check-frame-start').addEventListener('click',function(){if(!this.disabled)window.cncJobControls.prepareFrame();});
  $('files-verdict-remedy').addEventListener('click',function(){var id=this.getAttribute('data-file-remedy');if(id==='retry')requestCheck();else if(id==='details')shell.details({brut:fileError||fileCheck});else window.cncSeance.lancer(id);});
  window.addEventListener('cnc-library-select',function(e){selected=e.detail||null;requestCheck();});
  window.addEventListener('cnc-job-status',function(e){var prev=machine();last=e.detail||{};var m=machine();if(selected&&offsetProven(prev)&&!offsetProven(m)){serial++;checking=false;fileCheck=null;awaitingZero=true;}if(selected&&(askedKey!==fileKey()||!offsetProven(prev)&&offsetProven(m)))requestCheck();paint();});
  window.addEventListener('cnc-screen-change',function(){paint();syncPlacement();});
  window.addEventListener('cnc-sheet-change',function(e){if(e.detail.id==='ks-check-placement'){placementOpen=e.detail.open;syncPlacement();}});
  window.addEventListener('cnc-v2-change',function(){paint();syncPlacement();});
  window.addEventListener('cnc-profile-change',function(){paint();syncPlacement();});
  window.addEventListener('cnc-screen-lock',function(e){locked=!!e.detail;syncPlacement();});
  document.addEventListener('visibilitychange',function(){paint();syncPlacement();});
  $('library-image').addEventListener('load',paintFiles);
  window.addEventListener('pagehide',function(){ended=true;serial++;unmount();});
  window.cncCheckScreen={project:project,retry:requestCheck,overrideChanged:function(){text('check-override-feedback',t('Le contrôle a changé. Recommencez.'));}};
  if(window.cncDashboardView&&window.cncDashboardView.rapidRow)window.cncDashboardView.rapidRow($('check-rapids'),'check');
  if(window.cncSeance)window.cncSeance.render();paint();
})();
