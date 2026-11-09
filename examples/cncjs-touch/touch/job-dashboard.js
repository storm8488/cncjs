(function () {
  'use strict';
  var uiLocale=window.cncI18n||{t:function(s){return s;},html:function(s){return s;}};
  var $=function(id){return document.getElementById(id);};
  // Laser profile (server-side machine type): the spindle value is an S set point, not a speed.
  function laser(){return !!(window.cncProfile&&window.cncProfile.kind()==='laser');}
  // The spindle labels follow the machine type when it changes (Réglages), not only at load.
  function relabel(){
    var a=$('home-override-spindle-label'),b=$('home-live-spindle-label');
    // Performance v2: Grbl reports the spindle set point, not a tachometer reading (REFLEXION.md, proposition 1).
    var override=laser()?uiLocale.t('Consigne S'):uiLocale.t('Broche'),live=laser()?uiLocale.t('Consigne S rapportée'):zones&&zones.v2?say('S rapporté'):uiLocale.t('Broche réelle');
    if(a&&a.textContent!==override)a.textContent=override;
    if(b&&b.textContent!==live)b.textContent=live;
  }
  window.addEventListener('cnc-profile-change',function(){relabel();if(typeof loadedProfile==='function')loadedProfile();});
  var home=$('file');if(!home)return;
  // UI 2027: preview and overrides on the left; progress, coordinates, live
  // values and the actions on the right. Démarrer or Reprendre is the one
  // primary action; Arrêter stands alone at the bottom, never next to Pause.
  var simulationPage=document.body.getAttribute('data-simulation')==='true';
  home.parentNode.insertAdjacentHTML('beforeend',uiLocale.html('<div class="job-dashboard"><div id="home-left" class="home-left"><div class="job-art"><img id="home-job-image" alt="Aperçu du fichier" hidden><p id="home-image-status">Sélectionnez un fichier pour afficher son aperçu.</p></div></div><div class="job-metrics"><h2 id="home-job-title" class="ks-sr-only">Suivi du travail</h2><div class="t-card home-progress"><div class="home-progress-head"><strong id="home-job-percent">—</strong><div class="home-progress-text"><p id="home-job-eta">Temps restant : —</p><p id="home-job-motion" class="home-job-motion" hidden></p><p id="home-job-name" class="ks-sr-only"></p></div></div><progress id="home-job-progress" max="100" value="0" aria-label="Avancement du travail"></progress></div><div id="home-coords" class="home-coords"></div><div class="home-live-tiles"><div class="t-card"><small>Avance réelle</small><b id="home-live-feed">—</b></div><div class="t-card"><small id="home-live-spindle-label">Broche réelle</small><b id="home-live-spindle">—</b></div></div><p id="home-job-note" class="ks-sr-only"></p></div></div>'));
  var execution=document.querySelector('.library-execution');
  $('home-job-note').insertAdjacentHTML('afterend',uiLocale.html('<p id="home-job-ready" class="t-notice" role="status"></p><p id="home-job-selection" class="t-help"></p><button id="home-job-load" class="t-btn home-load" disabled>Charger la sélection</button><div id="home-job-primary-row" class="home-job-actions home-job-primary"><button id="home-job-start" class="t-btn t-btn--primary" disabled>Démarrer…</button><button id="home-job-pause" class="t-btn t-btn--warn t-btn--lg" disabled>Pause</button></div><div id="home-job-resume-row" class="home-job-actions home-job-resume" hidden><button id="home-job-resume" class="t-btn t-btn--primary" disabled>Reprendre…</button></div><p id="home-job-feedback" class="t-sent" role="status"></p><div class="home-stop"><button id="home-job-stop" class="t-btn t-btn--danger" disabled>Arrêter le travail</button><span class="t-help">Arrêt logiciel · pas un arrêt d’urgence</span></div>'));
  // The real page keeps its coordinate cards (#wx…, #mx…, written by app.js): they move under the progress.
  var coordsBox=$('home-coords');
  ['home-work-card','home-machine-card'].forEach(function(id){var card=$(id);if(card&&coordsBox&&typeof coordsBox.appendChild==='function')coordsBox.appendChild(card);});
  if(simulationPage&&coordsBox)coordsBox.insertAdjacentHTML('beforeend',uiLocale.html('<div class="card t-coords-card"><h2>Travail</h2><div class="t-coords"><span class="t-axis">X</span><b id="home-sim-x" class="t-val">—</b><span class="t-unit">mm</span><span class="t-axis">Y</span><b id="home-sim-y" class="t-val">—</b><span class="t-unit">mm</span><span class="t-axis">Z</span><b id="home-sim-z" class="t-val">—</b><span class="t-unit">mm</span></div></div>'));
  // A tap on Pause or Reprendre freezes both for 600 ms (as on the status strip): Pause becomes
  // Reprendre… in place, and a double tap must not reach it. Arrêter is never delayed. A clock set
  // back after a tap does not keep them frozen.
  var coolUntil=0;
  ['load','start','pause','resume','stop'].forEach(function(action){
    $('home-job-'+action).addEventListener('click',function(){
      var source=$('job-'+action);
      if(this.disabled||!source||source.disabled)return;
      if(action==='pause'||action==='resume'){var now=Date.now();if(now>=coolUntil-600&&now<coolUntil)return;coolUntil=now+600;}
      source.click();
    });
  });
  // Realtime overrides (feed and spindle), active only while a program runs or is held.
  // Overrides under the preview: ±10 % and 100 % as large steps, ±1 % as a second level.
  $('home-left').insertAdjacentHTML('beforeend',uiLocale.html('<div id="home-overrides" class="home-overrides t-card" hidden><div class="home-overrides-head"><p class="home-overrides-title">Corrections</p><p id="home-live" class="home-live ks-sr-only"></p></div><p id="home-spindle-warning" class="t-notice" data-tone="warn" role="alert" hidden></p>')+
    ['feed','spindle'].map(function(kind){
      var label=kind==='feed'?uiLocale.t('Avance'):laser()?uiLocale.t('Consigne S'):uiLocale.t('Broche');
      return '<div class="t-override" data-kind="'+kind+'"><div class="t-ov-name"><span id="home-override-'+kind+'-label">'+label+'</span><b id="home-override-'+kind+'">—</b></div><div class="t-ov-row">'+
        [[-10,'−10 %',''],[0,'100 %',' t-btn--ghost'],[10,'+10 %',''],[-1,'−1 %',' t-btn--ghost t-fine'],[1,'+1 %',' t-btn--ghost t-fine']].map(function(step){return '<button type="button" class="t-btn'+step[2]+'" data-kind="'+kind+'" data-value="'+step[0]+'" disabled>'+step[1]+'</button>';}).join('')+'</div></div>';
    }).join('')+
    // Rapids (G0 only): 25 / 50 / 100 %, also at rest so a first run can start slowed.
    '<div class="t-override t-override--rapid" data-kind="rapid"><div class="t-ov-name">'+uiLocale.t('Rapides')+'<b id="home-override-rapid">—</b></div><div class="t-ov-row">'+
      [[25,'25 %'],[50,'50 %'],[100,'100 %']].map(function(step){return '<button type="button" class="t-btn t-btn--ghost" data-kind="rapid" data-value="'+step[0]+'" aria-pressed="false" disabled>'+step[1]+'</button>';}).join('')+'</div></div>'+
    uiLocale.html('<p id="home-override-note" class="t-help"></p><p id="home-rapid-note" class="t-help"></p></div>'));
  relabel();
  var overridesBox=$('home-overrides');
  // The same relay serves the rows Performance v2 shows in their sheet (« Broche / rapides… »).
  function overrideClick(e){
    var button=e.target&&e.target.closest?e.target.closest('button[data-kind]'):null;
    if(!button||button.disabled||!window.cncJobControls||typeof window.cncJobControls.override!=='function')return;
    window.cncJobControls.override(button.getAttribute('data-kind'),Number(button.getAttribute('data-value'))).catch(function(){});
  }
  overridesBox.addEventListener('click',overrideClick);
  // One formatter per locale: Number.prototype.toLocaleString builds a new one at every call,
  // which was the first script cost of Suivi during a job (two live values, 5 reports a second).
  var formats={};
  function number(v){var r=Math.round(v),loc=uiLocale.locale||'fr-FR';try{var f=formats[loc]||(formats[loc]=typeof Intl!=='undefined'&&Intl.NumberFormat?new Intl.NumberFormat(loc):null);return f?f.format(r):r.toLocaleString(loc);}catch(_){return String(r);}}
  function overrideButtons(){
    var list=overridesBox.querySelectorAll?overridesBox.querySelectorAll('button'):[],host=v2&&v2.rowHost;
    if(!host||!host.querySelectorAll)return list;
    // Under Performance v2 the spindle and rapid rows live in their sheet: same guards, same buttons.
    return Array.prototype.slice.call(list).concat(Array.prototype.slice.call(host.querySelectorAll('button'))).filter(function(b){return !!b.getAttribute('data-kind');});
  }
  execution.insertAdjacentHTML('beforeend',uiLocale.html('<p id="job-progress-summary" role="status"></p>'));
  var selection=window.cncLibrarySelection||null,machine=null,simulation=false,imageKey='',request=0,track=null,busy=false,feedback='';
  var previewRequest=null,imageLoading=false,previewFailed=false,mounted=false,imageRevision;
  function finiteNumber(value){return typeof value==='number'&&isFinite(value);}
  function elapsedClock(){return window.performance&&typeof window.performance.now==='function'?window.performance.now():Date.now();}
  function visible(name){var screen=$('screen-'+name);return !document.hidden&&!!screen&&screen.classList.contains('active');}
  // A text is written into its single text node: replacing the node (textContent) also
  // restyles it, at every report for the live values.
  function set(id,key,value){var el=$(id);if(el[key]===value)return;var n=key==='textContent'&&el.firstChild;if(n&&n.nodeType===3&&!n.nextSibling)n.data=value;else el[key]=value;}
  function cancelPreview(){
    request++;var xhr=previewRequest;previewRequest=null;
    if(xhr&&typeof xhr.abort==='function')xhr.abort();
    if(xhr||imageLoading)imageKey='';
    imageLoading=false;$('home-job-image').onload=null;$('home-job-image').onerror=null;
  }
  function duration(s) {
    s=Math.max(0,Math.ceil(s));var h=Math.floor(s/3600),m=Math.floor(s%3600/60),sec=s%60;
    return (h?h+' h ':'')+(m?m+' min ':'')+sec+' s';
  }
  // API base of this CNCjs installation (cnc-state.js derives it from the page's path).
  function apiBase(){try{return window.cncState.get().apiBase;}catch(_){return '/api';}}
  // The server's verdict on a stored preview (same rule as shared-library.js): the sidecar's
  // fingerprint is compared with the program on disk; stale is never shown, unchecked is flagged.
  function verdict(response,meta){
    var p=response&&response.preview;
    if(p&&typeof p==='object')return p.stale?{state:'stale',reason:String(p.reason||'')}:{state:'ok',reason:''};
    if(meta&&meta.preview&&meta.preview.stale)return {state:'stale',reason:String(meta.preview.reason||'')};
    return {state:'unverified',reason:'unverified'};
  }
  function previewNotice(v){
    if(v.reason==='no-fingerprint')return uiLocale.t('Aperçu sans empreinte (ancienne version) : régénérez-le depuis le PC.');
    if(v.reason==='program-missing')return uiLocale.t('Fichier G-code introuvable sur le serveur : actualisez la liste.');
    if(v.state==='unverified')return uiLocale.t('Aperçu non vérifié par le serveur : régénérez-le depuis le PC.');
    return uiLocale.t('Aperçu périmé : régénérez-le depuis le PC.');
  }
  // Remaining time: to the second under 2 minutes, then to the (next) minute. Shown at every
  // report, a seconds count rewrote the text 4 times a second, and each rewrite lays Suivi out.
  function remainingText(s) {
    if(!(s>=120))return duration(s);
    var m=Math.ceil(s/60),h=Math.floor(m/60);m%=60;
    return (h?h+' h ':'')+(h&&!m?'':m+' min');
  }
  function sessionToken(){var token='';try{token=JSON.parse(localStorage.getItem('cnc')).state.session.token;}catch(_){}return token;}
  function previewXhr(file,token){
    var xhr=new XMLHttpRequest();xhr.open('POST',apiBase()+'/watch/file',true);xhr.timeout=20000;
    xhr.setRequestHeader('Authorization','Bearer '+token);xhr.setRequestHeader('Content-Type','application/json');
    return xhr;
  }
  // The answer of /watch/file for a program's sidecar: { refused: notice } for a stale preview,
  // { src, note, preview } otherwise; throws on anything malformed.
  function previewAnswer(xhr,file){
    if(xhr.status!==200)throw new Error();
    var envelope=JSON.parse(xhr.responseText),meta=JSON.parse(envelope.data);
    if(meta.file!==file)throw new Error();
    // A preview of another version of the program (replaced under the same name, older
    // sidecar) is never shown: the server's verdict says so.
    var v=verdict(envelope,meta);
    if(v.state==='stale')return {refused:previewNotice(v)};
    var src=meta.preview&&meta.preview.image,note=v.state==='unverified'?previewNotice(v):'';
    if(typeof src!=='string'||src.length>2500000||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(src))throw new Error();
    // Depth and the 3D path (newer previews) feed the 3D views and their trail (preview-3d.js).
    return {src:src,note:note,preview:{file:file,fingerprint:typeof meta.fingerprint==='string'?meta.fingerprint:'',projection:meta.preview.projection,trail:Array.isArray(meta.preview.trail)?meta.preview.trail:null,lines:meta.preview.lines,
      trailZ:Array.isArray(meta.preview.trailZ)?meta.preview.trailZ:null,zBounds:meta.preview.zBounds,path3d:meta.preview.path3d||null,
      // Version 3 of the preview: motion-based estimate and laser summary (absent from older sidecars).
      estimate:window.CNCMotionEstimate&&window.CNCMotionEstimate.valid(meta.preview.estimate)?meta.preview.estimate:null,laser:meta.preview.laser||null}};
  }
  function preview(file) {
    if(file===imageKey)return;
    cancelPreview();imageKey=file;previewFailed=false;var id=++request;
    // The version of the loaded program this preview is read for (loadedPreview() compares it).
    imageRevision=machine&&machine.name===file?machine.revision:undefined;
    var img=$('home-job-image');img.hidden=true;img.removeAttribute('src');
    img.cncPreview=null;
    $('home-image-status').hidden=false;
    $('home-image-status').textContent=file?uiLocale.t('Chargement de l’aperçu…'):uiLocale.t('Sélectionnez un fichier pour afficher son aperçu.');
    if(!file)return;
    var token=sessionToken();
    if(!token){$('home-image-status').textContent=uiLocale.t('Session CNCjs requise pour lire l’aperçu.');return;}
    var xhr=previewXhr(file,token);previewRequest=xhr;
    function fail(notice){if(id===request){previewRequest=null;imageLoading=false;previewFailed=true;img.hidden=true;$('home-image-status').hidden=false;set('home-image-status','textContent',typeof notice==='string'&&notice?notice:uiLocale.t('Aperçu indisponible. Régénérez-le dans Fichiers.'));}}
    xhr.onload=function(){
      if(id!==request)return;
      previewRequest=null;
      try{
        var answer=previewAnswer(xhr,file);
        if(answer.refused){fail(answer.refused);return;}
        var src=answer.src,note=answer.note;
        img.cncPreview=answer.preview;
        imageLoading=true;
        img.onload=function(){if(id===request){imageLoading=false;img.hidden=false;if(note)set('home-image-status','textContent',note);$('home-image-status').hidden=!note;}};
        img.onerror=fail;img.src=src;
      }catch(_){fail();}
    };xhr.onerror=xhr.ontimeout=fail;xhr.send(JSON.stringify({file:file+'.cnctouch.json'}));
  }
  var halt=null;
  // ---- Motion-based estimate (motion-estimate.js), shown next to the rhythm-based one ----
  // Model of the program (lengths / programmed feeds, G4 dwells, rapids from $110-$112 when known,
  // no acceleration); corrected during the job by the time observed per acknowledged line.
  var motionTrack=null,motionLeft=null;
  var UNKNOWN_TEXT={pause:'pause M0','optional-pause':'pause optionnelle M1',toolchange:'changement d’outil M6',home:'retour G28/G30',probe:'palpage G38',machine:'déplacement G53',frame:'changement de repère G10/G92',position:'position inconnue',feed:'avance F absente',dwell:'pause G4 sans durée',code:'code non pris en charge',arc:'arc illisible'};
  function unknownsText(list){
    var counts={},order=[];
    (list||[]).forEach(function(u){if(u.kind==='rapid')return;if(!counts[u.kind]){counts[u.kind]={n:0,line:u.line};order.push(u.kind);}counts[u.kind].n++;});
    return order.map(function(k){var c=counts[k];return (c.n>1?c.n+' × ':'')+uiLocale.t(UNKNOWN_TEXT[k]||'inconnue')+uiLocale.t(' (l. ')+c.line+(c.n>1?'…':'')+')';}).join(', ');
  }
  function motionText(c,file,now){
    var ME=window.CNCMotionEstimate,img=$('home-job-image'),pv=img&&img.cncPreview;motionLeft=null;
    if(!ME||!pv||pv.file!==file||img.hidden)return '';
    var est=pv.estimate;
    if(!est)return uiLocale.t('Estimation par les mouvements : indisponible pour cet aperçu (régénérez-le dans Fichiers).');
    var rates=c&&!simulation?ME.ratesFrom(c.settings):null,running=!!(c&&(c.workflow==='running'||c.workflow==='paused')),parts=[];
    var valid=c&&c.fresh&&c.name===file&&finiteNumber(c.total)&&c.total>0&&finiteNumber(c.received);
    if(running&&valid){
      // Acknowledged line in the preview's numbering (a resume counts the lines before it as done).
      var r=c.resume,line=r&&typeof r.from==='number'&&typeof r.preambleLength==='number'?r.from-1+Math.max(0,c.received-r.preambleLength):c.received/c.total*est.lines;
      line=Math.max(0,Math.min(est.lines,line));
      var key=c.port+':'+c.name+':'+c.revision+':'+c.total;
      if(!motionTrack||motionTrack.key!==key||line<motionTrack.line){motionTrack={key:key,fromLine:line,line:line,active:0,last:now};}
      var dt=(now-motionTrack.last)/1000;
      if(dt<0||dt>3){motionTrack.fromLine=line;motionTrack.active=0;}
      else if(c.workflow==='running')motionTrack.active+=dt;
      motionTrack.last=now;motionTrack.line=line;
      var left=ME.remaining(est,rates,line,{activeSeconds:motionTrack.active,fromLine:motionTrack.fromLine});
      if(!left)return '';
      motionLeft=left;
      parts.push(uiLocale.t('Selon les mouvements : ')+remainingText(left.seconds)+uiLocale.t(' restantes')+(left.corrected?uiLocale.t(', corrigé ×')+(Math.round(left.factor*10)/10).toLocaleString(uiLocale.locale||'fr-FR')+uiLocale.t(' d’après les lignes acquittées'):''));
      if(!left.rapidKnown)parts.push(uiLocale.t('rapides non comptés ($110–$112 inconnus)'));
      var ahead=unknownsText(left.unknownsAhead);if(ahead)parts.push(uiLocale.t('durées inconnues à venir : ')+ahead);
    }else{
      motionTrack=null;
      var tt=ME.total(est,rates);if(!tt)return '';
      var low=remainingText(tt.low);
      parts.push(uiLocale.t('Selon les mouvements (sans accélérations) : ')+(tt.high===null?uiLocale.t('au moins ')+low:Math.abs(tt.high-tt.low)<30?'≈ '+low:uiLocale.t('entre ')+low+uiLocale.t(' et ')+remainingText(tt.high)));
      if(!tt.rapidKnown)parts.push(uiLocale.t('rapides non comptés ($110–$112 inconnus)'));
      var unknown=unknownsText(tt.unknowns);if(unknown)parts.push(uiLocale.t('durées inconnues : ')+unknown);
    }
    return parts.join(' · ');
  }
  function jogging(m){return !!(m&&m.motion&&typeof m.motion==='object'&&(m.motion.jog||m.motion.cancelling));}
  function render() {
    var c=machine,now=elapsedClock(),file=c&&c.name?c.name:selection&&selection.file||'';
    set('home-job-load','disabled',busy||!c||!c.fresh||!selection||!c.canLoad);
    set('home-job-start','disabled',busy||!c||!c.fresh||!c.canStart);
    // These states also guard the enlarged preview's command relay while Home is hidden.
    // During a loss of the state, Pause and Arrêter follow the last busy controller (detail.halt).
    set('home-job-pause','disabled',c?!c.canPause:!(halt&&halt.canPause));
    set('home-job-resume','disabled',busy||!c||!c.canResume);
    set('home-job-stop','disabled',c?!(c.canStop||jogging(c)):!(halt&&halt.canStop));
    var overrides=c&&c.overrides&&typeof c.overrides==='object'?c.overrides:null,overrideOn=!!(c&&c.fresh&&c.canOverride&&!busy);
    set('home-overrides','hidden',!c||!('canOverride' in c));
    set('home-override-feed','textContent',overrides&&finiteNumber(overrides.feed)?overrides.feed+' %':'—');
    set('home-override-spindle','textContent',overrides&&finiteNumber(overrides.spindle)?overrides.spindle+' %':'—');
    // The rapid override has its own guard (also allowed at rest); an older server only sends canOverride.
    var rapidOn=!!(c&&c.fresh&&!busy&&('canRapidOverride' in c?c.canRapidOverride:c.canOverride)),rapid=overrides&&finiteNumber(overrides.rapid)?overrides.rapid:null;
    set('home-override-rapid','textContent',rapid===null?'—':rapid+' %');
    Array.prototype.forEach.call(overrideButtons(),function(button){
      var isRapid=button.getAttribute('data-kind')==='rapid',on=isRapid?rapidOn:overrideOn;
      if(button.disabled!==!on)button.disabled=!on;
      if(isRapid){var pressed=String(rapid!==null&&Number(button.getAttribute('data-value'))===rapid);if(button.getAttribute('aria-pressed')!==pressed)button.setAttribute('aria-pressed',pressed);}
    });
    set('home-rapid-note','textContent',rapidOn?(rapid!==null&&rapid<100?uiLocale.t('Rapides ralentis : Grbl revient à 100 % à la fin du programme (M2/M30) ou après un arrêt.'):uiLocale.t('Rapides à 25 % conseillés pour le premier essai d’un programme.')):'');
    // Real values from Grbl's FS: field. A feed hold stops the axes, not the spindle.
    var liveOk=!!(c&&c.fresh),feed=liveOk&&finiteNumber(c.feedrate)?c.feedrate:null,rpm=liveOk&&finiteNumber(c.spindleSpeed)?c.spindleSpeed:null;
    // The live values are written only while Suivi is shown (mount() renders again on opening):
    // hidden, they were rewritten at every report for nothing.
    var homeShown=visible('home');
    if(homeShown)set('home-live','textContent',feed===null&&rpm===null?'':uiLocale.t('Avance réelle ')+(feed===null?'—':number(feed)+' mm/min')+(laser()?uiLocale.t(' · Consigne S ')+(rpm===null?'—':number(rpm)):uiLocale.t(' · Broche ')+(rpm===null?'—':number(rpm)+uiLocale.t(' tr/min'))));
    // Work frame (G54…) next to the work coordinates, as reported by the controller; blank when unknown.
    var frameNode=$('home-work-frame');if(frameNode&&homeShown){var frame=c&&c.fresh&&c.operator&&/^G5[4-9]$/.test(String(c.operator.wcs||''))?' · '+c.operator.wcs:'';set('home-work-frame','textContent',frame);}
    if(homeShown){set('home-live-feed','textContent',feed===null?'—':number(feed)+' mm/min');
    set('home-live-spindle','textContent',rpm===null?'—':number(rpm)+(laser()?'':uiLocale.t(' tr/min')));}
    // Reprendre takes the primary place while the job is held; Démarrer otherwise.
    var held=!!(c&&c.workflow==='paused');
    // In an alarm at rest nothing here can start (the ready line says why, Déverrouiller is on
    // the strip): the inactive Démarrer / Pause row gives its room to the alarm's help (N1).
    var alarmRest=!!(c&&c.workflow==='idle'&&/^alarm/i.test(String(c.activeState||'')));
    set('home-job-resume-row','hidden',!held);set('home-job-primary-row','hidden',held||alarmRest);
    // Presentation only (performance-v2.css): Charger / Recharger alone in its row (both rows hidden) takes the row.
    var load=$('home-job-load'),alone=!held&&alarmRest?'1':'0';if(load&&typeof load.setAttribute==='function'&&(!load.getAttribute||load.getAttribute('data-alone')!==alone))load.setAttribute('data-alone',alone);
    // Presentation only (ui-2027.css): during a job the active Pause takes the large cell. Read by no handler.
    var row=$('home-job-primary-row'),run=c&&c.workflow==='running'?'1':'0';if(row&&typeof row.setAttribute==='function'&&(!row.getAttribute||row.getAttribute('data-run')!==run))row.setAttribute('data-run',run);
    // Charger only shows while the machine is idle and something is selected: one primary action per screen.
    var busyJob=!!(c&&c.workflow&&c.workflow!=='idle');
    set('home-job-load','hidden',!selection||busyJob);
    // Presentation only (performance-v2.css): Charger, Démarrer / Pause and Reprendre all hidden (an alarm at rest, nothing
    // selected): the v2 action row gives its room to the messages slot. Read by no handler.
    var actionsBoard=$('home-left').parentNode,actionsEmpty=alarmRest&&!held&&!selection?'1':'0';
    if(actionsBoard&&typeof actionsBoard.setAttribute==='function'&&(!actionsBoard.getAttribute||actionsBoard.getAttribute('data-v2-actions-empty')!==actionsEmpty))actionsBoard.setAttribute('data-v2-actions-empty',actionsEmpty);
    // During a job nothing else distracts: no selection notice, the override help only as a reason.
    set('home-job-selection','hidden',busyJob);
    var box=$('home-overrides');if(box&&typeof box.setAttribute==='function'&&(!box.getAttribute||box.getAttribute('data-on')!==String(overrideOn)))box.setAttribute('data-on',String(overrideOn));
    if(homeShown&&simulationPage&&c&&c.workPosition)['x','y','z'].forEach(function(a){set('home-sim-'+a,'textContent',finiteNumber(c.workPosition[a])?c.workPosition[a].toFixed(3):'—');});
    var spinning=!!(c&&c.workflow==='paused'&&rpm!==null&&rpm>0);
    set('home-spindle-warning','hidden',!spinning);
    set('home-spindle-warning','textContent',spinning?(laser()?uiLocale.t('Pause : la consigne S reste active. En mode laser ($32=1), Grbl coupe l’émission tant que les axes sont arrêtés ; gardez la protection en place.'):uiLocale.t('Pause : les axes sont arrêtés mais la broche tourne toujours (Grbl ne l’arrête pas en pause). Ne mettez pas les mains près de l’outil.')):'');
    set('home-override-note','textContent',overrideOn?uiLocale.t('Pas de ±1 % / ±10 % envoyés au contrôleur en temps réel ; 100 % rétablit la valeur programmée.'):(c&&c.overrideReason?uiLocale.message?uiLocale.message(c.overrideReason):uiLocale.t(c.overrideReason):''));
    var valid=c&&c.fresh&&c.name&&finiteNumber(c.total)&&c.total>0&&finiteNumber(c.received)&&c.received>=0&&c.received<=c.total,p=valid?c.received/c.total*100:0;
    // CNCjs rewinds the line counters when a program ends: the server says whether it finished.
    // A program that reached its end with lines refused by Grbl (error:N) is not "finished".
    var failed=!simulation&&c&&c.finishedWithErrors===true&&finiteNumber(c.jobErrors)&&c.jobErrors>0;
    if(valid&&(c.finished===true||failed)&&c.workflow==='idle')p=100;
    var percent=valid?Math.floor(p)+' %':'—',remaining=null,eta=uiLocale.t('Temps restant : —');
    var key=c?simulation+':'+c.port+':'+c.name+':'+c.revision+':'+c.total:'',alarmNow=!!(c&&/^alarm/i.test(String(c.activeState||'')));
    if(!valid){track=null;eta=c&&c.fresh&&!c.name?uiLocale.t('Temps restant : chargez un fichier'):uiLocale.t('Temps restant : état indisponible');}
    else {
      if(!track||track.key!==key||p<track.p)track={key:key,p:p,last:now,active:0,advance:0,running:false};
      var dt=(now-track.last)/1000;
      // Discontinuous observations must not reuse an estimate learned before sleep or a clock jump.
      if(dt<0||dt>3){track.active=0;track.advance=0;}
      else if(track.running&&c.workflow==='running'&&!alarmNow&&dt>0){track.active+=dt;track.advance+=Math.max(0,p-track.p);}
      track.last=now;track.p=p;track.running=c.workflow==='running'&&!alarmNow;
      if(simulation){if(finiteNumber(c.remainingSeconds)&&c.remainingSeconds>=0)remaining=c.remainingSeconds;}
      else if(track.active>=10&&track.advance>0)remaining=(100-p)*track.active/track.advance;
      if(!finiteNumber(remaining)||remaining<0)remaining=null;
      if(p>=100&&failed)eta=uiLocale.t('Fin du programme avec ')+c.jobErrors+uiLocale.t(' erreur(s) Grbl — vérifiez la pièce');
      else if(p>=100&&(simulation||c.finished===true))eta=simulation?uiLocale.t('Terminé — 0 s restantes'):uiLocale.t('Terminé — programme exécuté jusqu’au bout');
      // An alarm overrides the texts that expect motion to go on or a stop without cause (display only).
      else if(alarmNow)eta=uiLocale.t('Alarme — estimation suspendue');
      else if(p>=100)eta=uiLocale.t('Toutes les lignes acquittées — attendre la fin des mouvements');
      else if(c.workflow==='idle'&&!c.canStart)eta=uiLocale.t('Travail arrêté — temps restant indisponible');
      else if(c.canStart)eta=simulation?(remaining!==null?uiLocale.t('Durée simulée : ')+duration(remaining):uiLocale.t('Temps restant : état indisponible')):uiLocale.t('Temps restant : après démarrage');
      else if(c.workflow==='paused')eta=uiLocale.t('En pause — ')+(remaining!==null?remainingText(remaining)+uiLocale.t(' restantes'):uiLocale.t('estimation suspendue'));
      else eta=remaining!==null?uiLocale.t('Temps restant ')+(simulation?uiLocale.t('simulé'):uiLocale.t('estimé'))+' : '+remainingText(remaining):uiLocale.t('Temps restant : calcul en cours…');
    }
    if(visible('home')){
      var same=!!(c&&selection&&c.name===selection.file),different=!!(c&&c.name&&selection&&!same);
      var readiness=!c||!c.fresh?uiLocale.t('État indisponible : attendre la connexion.'):busy?uiLocale.t('Opération en cours…'):/^alarm/i.test(c.activeState||'')?(!simulation&&window.CNCGrblHelp?window.CNCGrblHelp.text(window.CNCGrblHelp.alarm(c.alarmCode,c.alarmCodeInferred)):(c.loadReason?(uiLocale.message||uiLocale.t)(c.loadReason):uiLocale.t('Alarme active : commandes bloquées.'))):
        // CNCjs still waits for Grbl's reply while Grbl stays idle: a lost line or acknowledgement.
        c.workflow==='running'&&finiteNumber(c.stalledMs)?uiLocale.t('Travail bloqué ? Grbl est au repos depuis ')+Math.round(c.stalledMs/1000)+uiLocale.t(' s alors que CNCjs attend encore sa réponse (ligne ou acquittement perdu). Si rien ne bouge, arrêtez le travail.'):
        c.workflow==='running'?uiLocale.t('Travail en cours.'):
        failed&&window.CNCGrblHelp&&finiteNumber(c.jobLastError)?uiLocale.t('Dernière erreur : ')+window.CNCGrblHelp.text(window.CNCGrblHelp.error(c.jobLastError)):c.workflow==='paused'?uiLocale.t('Travail en pause.'):c.canStart?uiLocale.t('Fichier chargé, prêt à démarrer.'):!c.canLoad?((c.loadReason||c.startReason)?(uiLocale.message||uiLocale.t)(c.loadReason||c.startReason):uiLocale.t('Commande indisponible.')):
        c.name?(same?uiLocale.t('Rechargez le fichier pour un nouveau départ.'):uiLocale.t('Choisissez et chargez le fichier du prochain travail.')):
        selection?uiLocale.t('Chargez la sélection avant de démarrer.'):uiLocale.t('Choisissez un fichier dans Fichiers.');
      set('home-job-ready','textContent',readiness);
      // The notice's tone follows the colour rules: red alarm, amber hold, blue running, green ready.
      var tone=!c||!c.fresh?'off':/^alarm/i.test(c.activeState||'')||failed?'danger':c.workflow==='paused'||finiteNumber(c.stalledMs)&&c.workflow==='running'?'warn':c.workflow==='running'?'info':c.canStart?'ok':'off';
      var ready=$('home-job-ready');if(ready&&typeof ready.setAttribute==='function'&&(!ready.getAttribute||ready.getAttribute('data-tone')!==tone))ready.setAttribute('data-tone',tone);
      // Presentation only (performance-v2.css): the safety texts of a hold or an alarm are read without scrolling.
      var alertBoard=$('home-left').parentNode,alertOn=tone==='danger'||tone==='warn'||spinning?'1':'0';if(alertBoard&&typeof alertBoard.setAttribute==='function'&&(!alertBoard.getAttribute||alertBoard.getAttribute('data-v2-alert')!==alertOn))alertBoard.setAttribute('data-v2-alert',alertOn);
      set('home-job-selection','textContent',different?uiLocale.t('Sélection différente : ')+selection.name+uiLocale.t('. Charger la sélection remplacera le fichier chargé.'):'');
      set('home-job-load','textContent',same?uiLocale.t('Recharger le fichier'):uiLocale.t('Charger la sélection'));
      preview(file);
      set('home-job-title','textContent',simulation?uiLocale.t('Suivi — SIMULATION'):uiLocale.t('Suivi du travail'));
      set('home-job-name','textContent',c&&c.name?(c.originalName||c.name):selection?uiLocale.t('Sélectionné : ')+selection.name:uiLocale.t('Aucun fichier chargé'));
      set('home-job-percent','textContent',percent);set('home-job-progress','value',p);
      // The static help sentence of the job controls is not a command result: only results show here.
      set('home-job-eta','textContent',eta);
      // In an alarm no remaining time sits under « estimation suspendue » (motionText still refreshes motionLeft).
      var motion=motionText(c,file,now);if(alarmNow)motion='';set('home-job-motion','textContent',motion);set('home-job-motion','hidden',!motion);set('home-job-feedback','textContent',feedback===uiLocale.t('Le chargement ne démarre pas le travail.')?'':feedback);
      if(zones.on)gauges(c,valid,p,eta,remaining);
      set('home-job-note','textContent',simulation?uiLocale.t('Progression fictive sur 60 secondes, hors pauses. Aucun G-code exécuté.'):uiLocale.t('Progression des lignes acquittées. Estimation indicative selon le rythme observé, pas selon la durée des mouvements.'));
    }
    if(visible('files'))set('job-progress-summary','textContent',percent+' · '+eta);
  }
  window.addEventListener('cnc-library-select',function(e){selection=e.detail;render();});
  window.addEventListener('cnc-job-status',function(e){machine=e.detail.machine;halt=!machine&&e.detail.halt&&typeof e.detail.halt==='object'?e.detail.halt:null;simulation=e.detail.simulation;busy=!!e.detail.busy;feedback=e.detail.feedback||'';
    // Sent / confirmed / failed / uncertain, mirrored from job-controls.js (ui-2027.css .t-sent).
    var fb=$('home-job-feedback'),state=e.detail.feedbackState||'';if(fb&&typeof fb.setAttribute==='function'&&(!fb.getAttribute||fb.getAttribute('data-state')!==state))fb.setAttribute('data-state',state);
    loadedStatus();
    if(zones.on){sample(machine);requestCurve();}
    render();
    // Performance v2: facts for the observation model only; its views are written in an animation frame.
    if(zones.v2){v2Facts(machine);requestV2();}});
  window.addEventListener('cnc-library-preview-updated',function(e){
    var file=machine&&machine.name?machine.name:selection&&selection.file||'';
    forgetLoaded(e.detail&&e.detail.file||'');
    if(e.detail&&e.detail.file&&e.detail.file!==file)return;
    cancelPreview();imageKey='';render();
  });
  function mount(){if(mounted||!visible('home'))return;mounted=true;if(previewFailed)imageKey='';render();requestCurve();requestV2();if(zones.v2)armV2();}
  function unmount(){if(!mounted)return;mounted=false;cancelPreview();if(v2.timer!==null&&typeof window.clearTimeout==='function')window.clearTimeout(v2.timer);v2.timer=null;}
  window.addEventListener('cnc-screen-change',function(e){if(e.detail==='home')mount();else{unmount();if(e.detail==='files')render();}});
  document.addEventListener('visibilitychange',function(){if(document.hidden)forgetLoaded('');if(visible('home'))mount();else unmount();});
  // ---- Wide workstation (body.perf-wide, touch-shell.js; PERFORMANCE-UI-SPEC.md 5.2, 6) ----
  // Suivi in zones: View (#home-left) | Instruments (#home-zone-gauges) | Commandes (#home-zone-controls),
  // the last two in .job-metrics. Two zones (Q3b, 1366 x 911): the instruments over the commands, the
  // overrides under the view as today; three columns where the view keeps at least today's width. The
  // wrappers and instruments are built the first time the layout is wide; out of it every element goes
  // back where it was, in the same order (on the RT they are never built). Display only: no command here.
  var THREE_ZONES_MIN_WIDTH=1600,CURVE_N=600,CURVE_MS=60000;
  var zones={on:false,three:false,v2:false,built:false,gauges:null,controls:null,eta:null,ack:null,read:null,curve:null,svg:null};
  var curve={t:[],v:[],i:0,n:0,frame:null,drawn:-Infinity,max:0,points:''};
  function el(tag,id,cls,text){var e=document.createElement(tag);if(id)e.id=id;if(cls)e.className=cls;if(text)e.textContent=text;return e;}
  function buildZones(){
    zones.built=true;
    zones.gauges=el('section','home-zone-gauges','home-zone home-zone-gauges');zones.gauges.setAttribute('aria-label',uiLocale.t('Instruments'));
    zones.controls=el('section','home-zone-controls','home-zone home-zone-controls');zones.controls.setAttribute('aria-label',uiLocale.t('Commandes'));
    // Acknowledged line, beside the percentage: « acquittée », never « en cours d’usinage ».
    zones.ack=el('span','home-gauge-ack','home-gauge-ack');
    zones.ack.appendChild(el('small','home-gauge-ack-label','',uiLocale.t('Ligne acquittée')));zones.ack.appendChild(el('b','home-gauge-ack-value','','—'));
    // Remaining time with its source, the other estimate, the unknown durations ahead.
    zones.eta=el('div','home-gauge-eta','t-card home-gauge-eta');
    [['p','home-gauge-eta-title','home-gauge-eta-title'],['p','home-gauge-eta-source','t-help'],['p','home-gauge-eta-second','t-help'],['p','home-gauge-eta-unknown','t-help']].forEach(function(d){zones.eta.appendChild(el(d[0],d[1],d[2]));});
    // Overrides as read from Grbl (the buttons stay in Commandes).
    zones.read=el('p','home-gauge-overrides','home-gauge-overrides');
    [['feed','Avance'],['spindle','Broche'],['rapid','Rapides']].forEach(function(d,i){
      if(i)zones.read.appendChild(document.createTextNode(' · '));
      zones.read.appendChild(el('span','home-gauge-ov-'+d[0]+'-label','',d[0]==='spindle'&&laser()?uiLocale.t('Consigne S'):uiLocale.t(d[1])));
      zones.read.appendChild(document.createTextNode(' '));zones.read.appendChild(el('b','home-gauge-ov-'+d[0],'','—'));
    });
    // Real feed over the last minute (Q10): an SVG polyline rewritten at most once a second.
    zones.curve=el('div','home-gauge-curve','t-card home-gauge-curve');
    zones.curve.appendChild(el('p','home-gauge-curve-title','home-gauge-curve-title',uiLocale.t('Avance réelle, dernière minute')));
    if(typeof document.createElementNS==='function'){
      var NS='http://www.w3.org/2000/svg',svg=document.createElementNS(NS,'svg'),grid=document.createElementNS(NS,'path'),line=document.createElementNS(NS,'polyline');
      svg.setAttribute('viewBox','0 0 300 70');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-hidden','true');
      grid.setAttribute('class','home-gauge-curve-grid');grid.setAttribute('d','M0 69.5H300M0 35H300');line.setAttribute('class','home-gauge-curve-line');line.id='home-gauge-curve-line';
      svg.appendChild(grid);svg.appendChild(line);zones.curve.appendChild(svg);zones.svg=svg;
    }
  }
  function arrange(){
    // Performance v2 (body.perf-v2, only ever with the wide layout): one monitoring column, whatever the width.
    var wide=!!(window.cncLayout&&typeof window.cncLayout.wide==='function'&&window.cncLayout.wide()),v2on=wide&&v2Body(),three=wide&&!v2on&&window.innerWidth>=THREE_ZONES_MIN_WIDTH;
    if(wide===zones.on&&three===zones.three&&v2on===zones.v2)return;
    // L0 contract: no grid change in Run/Hold/Alarm or with an unknown report; cnc-v2-change arranges again at rest.
    if(zones.on&&v2Held())return;
    var title=$('home-job-title'),metrics=title&&title.parentNode,left=$('home-left'),board=left&&left.parentNode;
    if(!metrics||!left||!board||typeof metrics.insertBefore!=='function')return;
    var progress=$('home-job-progress').parentNode,head=$('home-job-percent').parentNode,coords=$('home-coords'),tiles=$('home-live-feed').parentNode.parentNode,overrides=$('home-overrides'),stop=$('home-job-stop').parentNode,n,next;
    if(zones.v2&&!v2on)applyV2(false,board,left,tiles,overrides);
    if(wide&&!zones.built)buildZones();
    if(wide&&!zones.on){
      metrics.insertBefore(zones.gauges,progress);
      [progress,zones.eta,coords,tiles,zones.read,zones.curve].forEach(function(node){zones.gauges.appendChild(node);});
      head.appendChild(zones.ack);
      // Everything after the instruments (ready line, Charger, Démarrer / Pause, Reprendre, feedback,
      // what job-resume.js added, Arrêter alone at the bottom) goes into Commandes, in order.
      metrics.appendChild(zones.controls);
      for(n=zones.gauges.nextSibling;n&&n!==zones.controls;n=next){next=n.nextSibling;zones.controls.appendChild(n);}
    }else if(!wide&&zones.on){
      left.appendChild(overrides);
      while(zones.controls.firstChild)metrics.insertBefore(zones.controls.firstChild,zones.controls);
      metrics.removeChild(zones.controls);
      [progress,coords,tiles].forEach(function(node){metrics.insertBefore(node,zones.gauges);});
      metrics.removeChild(zones.gauges);head.removeChild(zones.ack);
      board.removeAttribute('data-zones');
    }
    if(wide){
      if(three)zones.controls.insertBefore(overrides,stop);else left.appendChild(overrides);
      board.setAttribute('data-zones',three?'3':'2');
    }
    if(v2on&&!zones.v2)applyV2(true,board,left,tiles,overrides);
    zones.on=wide;zones.three=three;
    if(wide){render();requestCurve();requestV2();}
  }
  window.addEventListener('cnc-layout-change',arrange);
  // perf-v2 is set or cleared by tablet-profile.js in its own frame, then announced: arranged in a frame too.
  window.addEventListener('cnc-v2-change',function(){
    loadedGate();
    if(v2.arrangeFrame!==null||typeof window.requestAnimationFrame!=='function')return;
    if(!zones.on&&!v2Body())return;
    v2.arrangeFrame=window.requestAnimationFrame(function(){v2.arrangeFrame=null;arrange();requestV2();});
  });
  window.addEventListener('resize',function(){if(zones.on||window.cncLayout&&window.cncLayout.wide())arrange();});
  function overrideRead(v){return finiteNumber(v)?v+' %'+(v!==100?' ('+(v>100?'+':'−')+Math.abs(v-100)+' %)':''):'—';}
  // The acknowledged line, by CNCToolPosition.acknowledged (tool-position.js) when the page has it,
  // else the same rule: the received share of the lines, a resume counting the lines before it, all of
  // them once the program finished.
  function acknowledgedLine(c,totalLines){
    var tp=window.CNCToolPosition;
    if(tp&&typeof tp.acknowledged==='function')return tp.acknowledged(c,totalLines);
    if((c.finished===true||c.finishedWithErrors===true)&&c.workflow==='idle')return totalLines;
    var r=c.resume;
    if(r&&typeof r.from==='number'&&typeof r.preambleLength==='number')return Math.min(totalLines,Math.max(0,r.from-1+Math.max(0,c.received-r.preambleLength)));
    return Math.min(totalLines,Math.max(0,c.received/c.total*totalLines));
  }
  // Lines of the original file: the preview's count, else resume.total for a resumed job, else CNCjs's total.
  function linesTotal(c){
    var pv=$('home-job-image').cncPreview,r=c.resume;
    return pv&&pv.file===c.name&&finiteNumber(pv.lines)&&pv.lines>0?pv.lines:r&&finiteNumber(r.from)&&finiteNumber(r.total)&&r.total>0?r.total:c.total;
  }
  function gauges(c,valid,p,eta,remaining){
    var left=motionLeft,running=!!(valid&&c.workflow==='running'&&p<100&&!/^alarm/i.test(String(c.activeState||'')));
    var title=eta,source='',second='',unknown='';
    var factor=left?(Math.round(left.factor*10)/10).toLocaleString(uiLocale.locale||'fr-FR'):'';
    // The estimate as given to the v2 observation model: the value shown, and where it comes from.
    v2.estimate={seconds:null,source:null,unknowns:[]};
    if(running&&simulation&&remaining!==null){title=uiLocale.t('Reste ')+remainingText(remaining);source=uiLocale.t('durée simulée, aucun G-code exécuté');v2.estimate={seconds:remaining,source:'simulation',unknowns:[]};}
    else if(running&&left&&left.rapidKnown){
      title=uiLocale.t('Reste ')+remainingText(left.seconds);
      source=left.corrected?uiLocale.t('mouvements, corrigé ×')+factor+uiLocale.t(' d’après les lignes acquittées'):uiLocale.t('mouvements (sans accélérations), pas encore corrigé');
      if(remaining!==null)second=uiLocale.t('Selon le rythme observé : ')+remainingText(remaining);
      v2.estimate={seconds:left.seconds,source:left.corrected?'motion-corrected':'motion',unknowns:[]};
    }else if(running&&remaining!==null){
      title=uiLocale.t('Reste ')+remainingText(remaining);source=uiLocale.t('rythme observé des lignes acquittées');
      if(left)second=uiLocale.t('Selon les mouvements : ')+remainingText(left.seconds)+uiLocale.t(' (rapides non comptés)');
      v2.estimate={seconds:remaining,source:'rhythm',unknowns:[]};
    }else if(valid&&c.workflow==='paused'&&remaining!==null)source=uiLocale.t('rythme observé des lignes acquittées');
    if(left&&(running||valid&&c.workflow==='paused')){
      var ahead=unknownsText(left.unknownsAhead);if(ahead)unknown=uiLocale.t('Durées inconnues à venir : ')+ahead;
      (left.unknownsAhead||[]).forEach(function(u){if(u&&u.kind!=='rapid'&&v2.estimate.unknowns.indexOf(u.kind)<0)v2.estimate.unknowns.push(u.kind);});
    }
    // Performance v2: the shorter titles of the 432 px column (the v1 ones were cut).
    if(zones.v2&&title===eta)V2_TITLES.forEach(function(d){if(eta===uiLocale.t(d[0]))title=say(d[1]);});
    set('home-gauge-eta-title','textContent',title);
    [['home-gauge-eta-source',source],['home-gauge-eta-second',second],['home-gauge-eta-unknown',unknown]].forEach(function(d){set(d[0],'textContent',d[1]);set(d[0],'hidden',!d[1]);});
    // Without the preview, a resumed job counts in the original file (resume.total), as acknowledgedLine() does.
    var total=valid?linesTotal(c):0;
    set('home-gauge-ack-value','textContent',valid?number(Math.floor(acknowledgedLine(c,total)))+' / '+number(total):'—');
    var ov=c&&c.fresh&&c.overrides&&typeof c.overrides==='object'?c.overrides:null;
    ['feed','spindle','rapid'].forEach(function(kind){
      var v=ov&&finiteNumber(ov[kind])?ov[kind]:null,node=$('home-gauge-ov-'+kind),off=String(v!==null&&v!==100);
      set('home-gauge-ov-'+kind,'textContent',overrideRead(v));
      if(node&&typeof node.setAttribute==='function'&&node.getAttribute('data-off')!==off)node.setAttribute('data-off',off);
    });
    set('home-gauge-ov-spindle-label','textContent',laser()?uiLocale.t('Consigne S'):uiLocale.t('Broche'));
  }
  // The curve: samples stored by the status handler, drawn in an animation frame at most once a
  // second, only on three zones (two zones have no room for it) and only while Suivi is shown.
  function sample(m){
    if(!(m&&m.fresh&&finiteNumber(m.feedrate)))return;
    curve.t[curve.i]=elapsedClock();curve.v[curve.i]=m.feedrate;curve.i=(curve.i+1)%CURVE_N;if(curve.n<CURVE_N)curve.n++;
  }
  function requestCurve(){
    if(curve.frame!==null||!zones.three||!visible('home')||typeof window.requestAnimationFrame!=='function'||elapsedClock()-curve.drawn<1000)return;
    curve.frame=window.requestAnimationFrame(drawCurve);
  }
  function drawCurve(){
    curve.frame=null;
    if(!zones.three||!visible('home'))return;
    var now=elapsedClock(),from=now-CURVE_MS,max=0,k,j,points=[];
    curve.drawn=now;
    for(k=0;k<curve.n;k++){j=(curve.i-curve.n+k+CURVE_N)%CURVE_N;if(curve.t[j]>=from&&curve.v[j]>max)max=curve.v[j];}
    // The axis ends at a round value: 100, 200, 500, 1 000, 2 000, 5 000…
    var top=100;while(top<max)top=top*(String(top).charAt(0)==='2'?2.5:2);
    for(k=0;k<curve.n;k++){j=(curve.i-curve.n+k+CURVE_N)%CURVE_N;if(curve.t[j]<from)continue;points.push(Math.round((curve.t[j]-from)/CURVE_MS*3000)/10+','+Math.round((70-curve.v[j]/top*69)*10)/10);}
    var text=points.join(' '),line=$('home-gauge-curve-line');
    if(text!==curve.points&&line&&typeof line.setAttribute==='function'){curve.points=text;line.setAttribute('points',text);}
    if(top!==curve.max){curve.max=top;set('home-gauge-curve-title','textContent',uiLocale.t('Avance réelle, dernière minute')+uiLocale.t(' · 0 à ')+number(top)+' mm/min');}
  }
  // ---- Performance v2 Suivi (body.perf-v2, lot L4; design/v2/REFLEXION.md propositions 1, 2 and 8) ----
  // Only under perf-v2, which implies the wide layout (never on the RT): the scene keeps the left column with
  // a confidence band at its edge and the planned / next sequence under it; one monitoring column on the right
  // (time and its source, reported position, feed and S, the minute curve, the feed correction, « Broche /
  // rapides… » and « Détail du temps » in sheets of the shell). Existing elements move with their IDs and
  // relays; Pause / Arrêter stay in the strip. The status handler only gives normalized facts to the L3
  // observation model; the v2 texts and the curve are written in an animation frame, while Suivi is shown.
  // The strings of this lot are embedded (FR / EN / ES): no catalogue request, nothing loaded on the RT.
  var V2_MESSAGES=[
    ['S rapporté','Reported S','S informado'],
    ['Programme chargé : ','Loaded program: ','Programa cargado: '],
    ['Aucun programme chargé','No program loaded','Ningún programa cargado'],
    ['Repère inconnu','Unknown frame','Sistema de coordenadas desconocido'],
    ['Rapport frais','Fresh report','Informe reciente'],
    ['Rapport périmé (> 2,5 s)','Stale report (> 2.5 s)','Informe caducado (> 2,5 s)'],
    ['Rapport inconnu','Unknown report','Informe desconocido'],
    ['Géométrie complète','Full geometry','Geometría completa'],
    ['Géométrie simplifiée','Simplified geometry','Geometría simplificada'],
    ['Géométrie inconnue','Unknown geometry','Geometría desconocida'],
    ['Acquitté par Grbl','Acknowledged by Grbl','Confirmado por Grbl'],
    ['À acquitter','Not yet acknowledged','Por confirmar'],
    ['Acquitté = accepté par Grbl, pas nécessairement usiné.','Acknowledged = accepted by Grbl, not necessarily machined.','Confirmado = aceptado por Grbl, quizá sin mecanizar.'],
    ['Rapportée · rapport frais','Reported · fresh report','Informada · informe reciente'],
    ['Figée · rapport périmé','Frozen · stale report','Congelada · informe caducado'],
    ['Inconnue · pas de rapport','Unknown · no report','Desconocida · sin informe'],
    ['Séquence prévue · estimée','Planned sequence · estimated','Secuencia prevista · estimada'],
    ['Ensuite','Next','A continuación'],
    ['Séquences non préparées','Sequences not prepared','Secuencias no preparadas'],
    ['Séquence indéterminée','Indeterminate sequence','Secuencia indeterminada'],
    ['Prochaine séquence inconnue','Next sequence unknown','Próxima secuencia desconocida'],
    ['Déclarée dans le fichier','Declared in the file','Declarada en el archivo'],
    ['Regroupement inféré, pas une opération nommée','Inferred grouping, not a named operation','Agrupación inferida, no una operación nombrada'],
    ['Aucune accroche sûre au rapport','No reliable link to the report','Ningún vínculo fiable con el informe'],
    ['Ordre du fichier, pas heure de début','File order, not a start time','Orden del archivo, no hora de inicio'],
    [' à venir',' ahead',' por venir'],
    ['durée inconnue','unknown duration','duración desconocida'],
    ['Avance rapportée, dernière minute','Reported feed, last minute','Avance informado, 1 min'],
    [' · 0 à ',' · 0 to ',' · 0 a '],
    ['Courbe indisponible','Curve unavailable','Curva no disponible'],
    ['Aucun événement sur la minute','No event in the last minute','Ningún evento en el último minuto'],
    ['Corrections : ','Corrections: ','Correcciones: '],
    ['pauses : ','pauses: ','pausas: '],
    ['trous de données : ','data gaps: ','huecos de datos: '],
    ['Broche / rapides…','Spindle / rapids…','Husillo / rápidos…'],
    ['Détail du temps','Time details','Detalle del tiempo'],
    ['Broche et rapides','Spindle and rapids','Husillo y rápidos'],
    ['Ce que le temps indique','What the time means','Qué indica el tiempo'],
    ['Estimation sans accélérations. Pauses manuelles, interventions et durées inconnues ne sont pas comptées.','Estimate without accelerations. Manual pauses, interventions and unknown durations are not counted.','Estimación sin aceleraciones. No se cuentan las pausas manuales, las intervenciones ni las duraciones desconocidas.'],
    ['État des données','Data status','Estado de los datos'],
    ['Séquences','Sequences','Secuencias'],
    ['Estimation après démarrage','Estimate after start','Estimación tras iniciar'],
    ['Arrêté — pas d’estimation','Stopped — no estimate','Detenido — sin estimación'],
    ['État indisponible','Status unavailable','Estado no disponible'],
    ['Alarme — sans estimation','Alarm — no estimate','Alarma — sin estimación'],
    ['Alarme : position non garantie','Alarm: position not guaranteed','Alarma: posición no garantizada']
  ];
  // v1 remaining-time texts (catalogue) and their short v2 titles.
  var V2_TITLES=[['Temps restant : après démarrage','Estimation après démarrage'],['Travail arrêté — temps restant indisponible','Arrêté — pas d’estimation'],['Temps restant : état indisponible','État indisponible'],['Alarme — estimation suspendue','Alarme — sans estimation']];
  function say(fr){var l=uiLocale.language,i=l==='en'?1:l==='es'?2:0;for(var k=0;k<V2_MESSAGES.length;k++)if(V2_MESSAGES[k][0]===fr)return V2_MESSAGES[k][i];return fr;}
  var v2={built:false,arrangeFrame:null,frame:null,timer:null,due:null,rows:null,rowHost:null,timeHost:null,more:null,band:null,sequence:null,position:null,axis:null,paths:{},
    key:null,id:null,last:null,reports:[],markers:[],serial:0,chart:null,estimate:{seconds:null,source:null,unknowns:[]}};
  function v2Body(){var b=document.body;return !!(b&&b.classList&&typeof b.classList.contains==='function'&&b.classList.contains('perf-v2'));}
  function v2Held(){try{var s=window.cncV2&&typeof window.cncV2.state==='function'?window.cncV2.state():null;return !!(s&&s.holdLayout);}catch(_){return false;}}
  function v2Use(slot){try{var v=window.cncV2;return v&&typeof v.use==='function'?v.use(slot):null;}catch(_){return null;}}
  function v2Number(v){var n=typeof v==='number'?v:typeof v==='string'&&v.trim()?Number(v):NaN;return isFinite(n)?n:null;}
  function attr(node,name,value){if(node&&typeof node.setAttribute==='function'&&node.getAttribute(name)!==value)node.setAttribute(name,value);}
  function addSpan(parent,id,cls,text){parent.appendChild(el('span',id,cls,text));}
  function buildV2(overrides){
    v2.built=true;
    // Confidence band at the edge of the scene: loaded program, frame and units, report age, geometry; the legend.
    v2.band=el('div','home-v2-confidence','home-v2-confidence');v2.band.setAttribute('aria-label',say('État des données'));
    var facts=el('p','home-v2-facts','home-v2-facts'),legend=el('p','home-v2-legend','home-v2-legend');
    ['home-v2-program','home-v2-frame','home-v2-age','home-v2-geometry'].forEach(function(id){addSpan(facts,id,id);});
    addSpan(legend,'','home-v2-key home-v2-key--done',say('Acquitté par Grbl'));addSpan(legend,'','home-v2-key home-v2-key--todo',say('À acquitter'));
    addSpan(legend,'home-v2-meaning','home-v2-meaning',say('Acquitté = accepté par Grbl, pas nécessairement usiné.'));
    v2.band.appendChild(facts);v2.band.appendChild(legend);
    v2.position=el('p','home-v2-position','home-v2-position');
    // Planned / next sequence, prepared at rest by L2: never a G-code line or a resume cursor.
    v2.sequence=el('div','home-v2-sequence','home-v2-sequence');v2.sequence.setAttribute('aria-label',say('Séquences'));
    [['now','Séquence prévue · estimée'],['next','Ensuite']].forEach(function(d){
      var cell=el('div','','home-v2-seq home-v2-seq--'+d[0]);cell.appendChild(el('span','','home-v2-eyebrow',say(d[1])));
      cell.appendChild(el('b','home-v2-'+d[0],'home-v2-seq-title'));cell.appendChild(el('small','home-v2-'+d[0]+'-detail','home-v2-seq-detail'));v2.sequence.appendChild(cell);
    });
    // The curve: the line split at the gaps, the gaps shaded, reported corrections and pauses marked.
    if(zones.svg&&typeof document.createElementNS==='function')[['gaps','home-v2-curve-gaps'],['line','home-v2-curve-line'],['marks','home-v2-curve-marks']].forEach(function(d){
      var path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('class',d[1]);path.id=d[1];v2.paths[d[0]]=path;
    });
    // A touch near an event of the curve opens the Journal at its interval (lot L6), read only.
    zones.curve.addEventListener('click',v2CurveTap);
    // Time axis, with the events of the minute between its ends.
    v2.axis=el('p','home-v2-curve-axis','home-v2-curve-axis');addSpan(v2.axis,'','','−60 s');addSpan(v2.axis,'home-v2-curve-events','home-v2-curve-events');addSpan(v2.axis,'','','0 s');
    // Fixed slots of the commands (REFLEXION § 3.10): one scrolling slot for every message that comes and
    // goes, one action slot of a fixed height where Charger, Démarrer / Pause and Reprendre keep their place.
    v2.info=el('div','home-v2-info','home-v2-info');v2.actions=el('div','home-v2-actions','home-v2-actions');
    // « Broche / rapides… » and « Détail du temps »: sheets of the shell, under the strip (Pause / Arrêter kept).
    var shell=window.cncShell;
    if(!shell||typeof shell.sheet!=='function')return;
    var rowsSheet=shell.sheet('perf-v2-overrides-sheet',say('Broche et rapides')),timeSheet=shell.sheet('perf-v2-time-sheet',say('Ce que le temps indique'));
    v2.rowHost=rowsSheet.content;v2.timeHost=timeSheet.content;v2.rowHost.addEventListener('click',overrideClick);
    v2.timeHost.appendChild(el('p','home-v2-time-note','t-help home-v2-time-note',say('Estimation sans accélérations. Pauses manuelles, interventions et durées inconnues ne sont pas comptées.')));
    v2.more=el('div','home-v2-more','home-v2-more');
    [['home-v2-more-overrides','Broche / rapides…',rowsSheet],['home-v2-time-detail','Détail du temps',timeSheet]].forEach(function(d){
      var b=el('button',d[0],'t-btn t-btn--ghost',say(d[1]));b.type='button';b.addEventListener('click',d[2].open);v2.more.appendChild(b);
    });
    var find=typeof overrides.querySelector==='function'?function(s){return overrides.querySelector(s);}:function(){return null;};
    v2.rows=[find('.t-override[data-kind="spindle"]'),find('.t-override[data-kind="rapid"]'),$('home-rapid-note')].filter(Boolean);
  }
  // Moves the existing elements in (on) or back exactly where the v1 wide layout had them (off): the children
  // of the boxes it rearranges are recorded first and given back in that order.
  function kidsOf(node){return Array.prototype.slice.call(node.children);}
  function applyV2(on,board,left,tiles,overrides){
    var art=$('home-job-image').parentNode,second=$('home-gauge-eta-second'),unknown=$('home-gauge-eta-unknown');
    var controls=zones.controls,stop=$('home-job-stop').parentNode,actions=[$('home-job-load'),$('home-job-primary-row'),$('home-job-resume-row')];
    if(art.parentNode!==left)art=left.firstChild;
    if(on){
      if(!v2.built)buildV2(overrides);
      v2.saved={controls:kidsOf(controls),overrides:kidsOf(overrides),eta:kidsOf(zones.eta)};
      // Messages (spindle warning, override reason, ready line, resume help, feedback…) in their slot, in order.
      v2.info.appendChild($('home-spindle-warning'));
      v2.saved.controls.forEach(function(n){if(n!==stop&&actions.indexOf(n)<0)v2.info.appendChild(n);});
      v2.info.appendChild($('home-override-note'));
      actions.forEach(function(n){v2.actions.appendChild(n);});
      controls.insertBefore(v2.info,stop);controls.insertBefore(v2.actions,stop);
      left.insertBefore(v2.band,art.nextSibling);left.appendChild(v2.sequence);
      // The reported feed and S head the curve card, as in the mockup.
      $('home-coords').appendChild(v2.position);zones.curve.insertBefore(tiles,zones.svg);zones.gauges.appendChild(overrides);
      zones.curve.appendChild(v2.axis);
      ['gaps','line','marks'].forEach(function(k){if(v2.paths[k])zones.svg.appendChild(v2.paths[k]);});
      if(v2.more){
        overrides.appendChild(v2.more);v2.rows.forEach(function(r){v2.rowHost.appendChild(r);});
        v2.timeHost.appendChild(second);v2.timeHost.appendChild(unknown);
      }
      overrides.appendChild(zones.read);
      board.setAttribute('data-v2','suivi');
    }else{
      if(v2.timer!==null&&typeof window.clearTimeout==='function')window.clearTimeout(v2.timer);v2.timer=null;v2.due=null;
      [v2.band,v2.sequence,v2.position,v2.axis,v2.more,v2.paths.gaps,v2.paths.line,v2.paths.marks].forEach(function(n){if(n&&n.parentNode)n.parentNode.removeChild(n);});
      zones.gauges.insertBefore(tiles,zones.curve);zones.gauges.insertBefore(zones.read,zones.curve);
      var saved=v2.saved;
      saved.overrides.forEach(function(n){overrides.appendChild(n);});saved.eta.forEach(function(n){zones.eta.appendChild(n);});
      saved.controls.forEach(function(n){controls.appendChild(n);});
      // Anything another module added to the slots meanwhile stays among the commands, above Arrêter.
      [v2.info,v2.actions].forEach(function(box){kidsOf(box).forEach(function(n){controls.insertBefore(n,stop);});if(box.parentNode)box.parentNode.removeChild(box);});
      board.removeAttribute('data-v2');board.removeAttribute('data-v2-report');
      // The v1 curve writes its own title again.
      v2.chart=null;curve.max=0;curve.points='';set('home-gauge-curve-title','textContent',uiLocale.t('Avance réelle, dernière minute'));
    }
    zones.v2=on;relabel();
  }
  // Normalized facts for the L3 model (performance-observation.js): its loaded identity, the arrival stamp,
  // the report as given (age, frame, units, feed in mm/min), the acknowledged ORIGINAL line, the estimate
  // shown with its source, and reported override / pause transitions as markers. Unknown stays null.
  function v2Facts(m){
    var o=v2Use('observation'),v=window.cncV2;
    if(!o||o.stub||typeof o.reset!=='function'||!v||!v.identity||!v.time||!m||!m.name)return;
    var id=v.identity.create({role:'loaded',file:m.name,fingerprint:m.fingerprint,controller:m.port,generation:m.generation,revision:m.revision});
    if(!id.jobKey)return;
    if(v2.key!==id.jobKey||!o.snapshot().identity){v2.key=id.jobKey;v2.id=id;v2.last=null;v2.markers=[];o.reset(id);}
    // Freshness has one source, the L0 contract cncV2.reportAge(machine) (monotone, per [port, generation,
    // statusObservedAt]); absent or failing, the report is unknown, never m.fresh. A report gets a monotone
    // arrival only the first time it is seen: the same report re-projected later (job-controls.js recomputes
    // its age with Date.now(), which a clock change can lower), even after A -> B -> A, keeps its first stamp
    // and age. The memory survives identity changes and is bounded.
    var r=v2ReportAge(m),reportKey=finiteNumber(m.statusObservedAt)?JSON.stringify([m.port,m.generation,m.statusObservedAt]):null,memo=null;
    if(reportKey)for(var k=0;k<v2.reports.length;k++)if(v2.reports[k].key===reportKey){memo=v2.reports[k];break;}
    var same=!!memo,time=same?memo.time:v.time.stamp({serverTime:m.statusObservedAt,serverSource:'status'}),at=time.arrivalMonoMs;
    var age=same?memo.age:r.known?r.ageMs:null,op=m.operator&&typeof m.operator==='object'?m.operator:{};
    var fresh=r.known&&r.fresh&&age!==null;
    if(!same&&reportKey){v2.reports.push({key:reportKey,time:time,age:age});if(v2.reports.length>32)v2.reports.shift();}
    var units=op.reportUnits==='mm'||op.reportUnits==='in'?op.reportUnits:null,w=m.coordinates&&m.coordinates.wpos,pos=null;
    if(w){var x=v2Number(w.x),y=v2Number(w.y),z=v2Number(w.z);if(x!==null&&y!==null&&z!==null)pos={x:x,y:y,z:z};}
    var valid=fresh&&finiteNumber(m.total)&&m.total>0&&finiteNumber(m.received)&&m.received>=0&&m.received<=m.total;
    var total=valid?linesTotal(m):null,line=valid?Math.floor(acknowledgedLine(m,total)):null;
    var ov=fresh&&m.overrides&&typeof m.overrides==='object'?m.overrides:null,last=v2.last;
    function mark(kind,value,code,params){
      v2.markers.push({id:'report:'+(++v2.serial),kind:kind,identity:id,time:time,interval:{fromMonoMs:last.at,toMonoMs:at},value:value,source:'report',code:code,params:params});
      if(v2.markers.length>100)v2.markers.shift();
    }
    if(last&&ov&&age!==null&&finiteNumber(at)&&at>=last.at){
      ['feed','spindle','rapid'].forEach(function(ch){var a=last.ov[ch],b=ov[ch];if(finiteNumber(a)&&finiteNumber(b)&&a!==b)mark('correction',b,'override-'+ch,{channel:ch,previous:a});});
      if(last.workflow==='running'&&m.workflow==='paused')mark('pause',true,'pause',{});
      else if(last.workflow==='paused'&&m.workflow==='running')mark('pause',false,'resume',{});
    }
    if(ov&&age!==null&&finiteNumber(at))v2.last={ov:{feed:ov.feed,spindle:ov.spindle,rapid:ov.rapid},workflow:m.workflow,at:at};
    var feed=units&&finiteNumber(m.feedrate)?Math.round((units==='in'?m.feedrate*25.4:m.feedrate)*10)/10:null,est=v2.estimate;
    o.update({version:1,available:r.known&&age!==null,identity:id,time:time,
      report:{freshness:!r.known||age===null?'unknown':fresh?'fresh':'stale',ageMs:age,wcs:typeof op.wcs==='string'&&op.wcs?op.wcs:null,units:units,position:pos,
        feedMmMin:feed,spindleS:finiteNumber(m.spindleSpeed)?m.spindleSpeed:null},
      acknowledgement:{line:line,total:total,meaning:'accepted-not-machined'},
      estimate:{seconds:est.seconds,source:est.source,estimated:true,unknowns:est.unknowns.slice()},markers:v2.markers});
    // One timer per report: the band turns stale 2.5 s after it, even when no other report arrives.
    if(same)return;
    v2.due=age!==null&&age<=2500?elapsedClock()+2550-age:null;
    armV2();
  }
  // The stale turn is a timer only while Suivi is shown: hidden, nothing is armed (mount() arms it again).
  function armV2(){
    if(v2.timer!==null&&typeof window.clearTimeout==='function')window.clearTimeout(v2.timer);v2.timer=null;
    if(v2.due===null||!visible('home')||typeof window.setTimeout!=='function')return;
    var wait=v2.due-elapsedClock();if(wait<=0){v2.due=null;return;}
    v2.timer=window.setTimeout(function(){v2.timer=null;v2.due=null;requestV2();},wait);
  }
  function v2ReportAge(m){
    var v=window.cncV2;
    try{var r=v&&typeof v.reportAge==='function'?v.reportAge(m):null;
      if(r&&r.known===true&&typeof r.fresh==='boolean')return {known:true,fresh:r.fresh,ageMs:finiteNumber(r.ageMs)&&r.ageMs>=0?r.ageMs:null};}catch(_){}
    return {known:false,fresh:false,ageMs:null};
  }
  function requestV2(){
    if(!zones.v2||v2.frame!==null||!visible('home')||typeof window.requestAnimationFrame!=='function')return;
    v2.frame=window.requestAnimationFrame(paintV2);
  }
  function paintV2(){
    v2.frame=null;
    if(!zones.v2||!visible('home'))return;
    var o=v2Use('observation'),live=!!(o&&!o.stub&&typeof o.snapshot==='function'),s=live?o.snapshot():null,r=s&&s.report;
    var state=r&&s.identity?r.freshness:'unknown',age=r&&finiteNumber(r.ageMs)?r.ageMs:null,c=machine,v=window.cncV2;
    set('home-v2-program','textContent',c&&c.name?say('Programme chargé : ')+(c.originalName||c.name):say('Aucun programme chargé'));
    set('home-v2-frame','textContent',r&&r.wcs&&r.units?r.wcs+' · '+r.units:say('Repère inconnu'));
    set('home-v2-age','textContent',state==='fresh'?say('Rapport frais')+' · '+(age!==null&&age>=1000?Math.floor(age/1000)+' s':'< 1 s'):state==='stale'?say('Rapport périmé (> 2,5 s)'):say('Rapport inconnu'));
    attr($('home-v2-age'),'data-state',state);attr($('home-left').parentNode,'data-v2-report',state);
    var g=v2Use('geometry'),gs=g&&!g.stub&&typeof g.snapshot==='function'?g.snapshot():null;
    var quality=gs&&gs.available&&v2.id&&v&&v.identity&&v.identity.compare(gs.identity,v2.id)==='same'?gs.quality:'unknown';
    set('home-v2-geometry','textContent',quality==='full'?say('Géométrie complète'):quality==='simplified'?say('Géométrie simplifiée'):say('Géométrie inconnue'));
    // In an alarm Grbl may have lost the position: never shown as reported (display only).
    var alarm=!!(c&&/^alarm/i.test(String(c.activeState||''))),placed=!alarm&&state==='fresh'&&!!r.position;
    set('home-v2-position','textContent',alarm?say('Alarme : position non garantie'):placed?say('Rapportée · rapport frais'):state==='stale'?say('Figée · rapport périmé'):say('Inconnue · pas de rapport'));
    attr($('home-v2-position'),'data-state',alarm?'alarm':placed||state==='stale'?state:'unknown');
    paintSequence();paintCurve(live?o:null);
  }
  function paintSequence(){
    var q=v2Use('sequences'),s=q&&!q.stub&&typeof q.snapshot==='function'?q.snapshot():null,L=window.CNCPerformanceSequences,v=window.cncV2;
    function label(x){return L&&typeof L.label==='function'?L.label(x):x&&x.label?x.label:say('Séquence indéterminée');}
    var ready=!!(s&&s.available&&s.items&&s.items.length&&v2.id&&v&&v.identity&&v.identity.compare(s.identity,v2.id)==='same');
    var now=ready?s.current:null,up=now&&typeof q.upcoming==='function'?q.upcoming():null;
    set('home-v2-now','textContent',ready?label(now):say('Séquences non préparées'));
    set('home-v2-now-detail','textContent',!ready?'':!now?say('Aucune accroche sûre au rapport'):now.provenance==='declared'?say('Déclarée dans le fichier'):say('Regroupement inféré, pas une opération nommée'));
    set('home-v2-next','textContent',ready&&s.next?label(s.next):say('Prochaine séquence inconnue'));
    set('home-v2-next-detail','textContent',up?label(up)+say(' à venir')+(up.durationSeconds===null?' — '+say('durée inconnue'):''):say('Ordre du fichier, pas heure de début'));
  }
  // Journal context (contract of lot L6): the marker's loaded identity and interval, and the Suivi view to
  // restore. Display navigation only: nothing is sent to the controller. Nothing happens outside perf-v2.
  function v2CurveTap(e){
    var ch=v2.chart,svg=zones.svg,v=window.cncV2,m=machine;
    if(!zones.v2||!ch||!svg||typeof svg.getBoundingClientRect!=='function'||!e||!finiteNumber(e.clientX)||!v||!v.identity)return;
    var r=svg.getBoundingClientRect();if(!r||!(r.width>0))return;
    var x=(e.clientX-r.left)/r.width*CURVE_MS+ch.toMonoMs-CURVE_MS,reach=24/r.width*CURVE_MS,best=null,gap=Infinity;
    ch.markers.forEach(function(k){
      var span=k.interval,at=k.kind==='gap'?null:k.time&&k.time.arrivalMonoMs,d;
      if(!span)return;
      d=at===null?(x<span.fromMonoMs?span.fromMonoMs-x:x>span.toMonoMs?x-span.toMonoMs:0):finiteNumber(at)?Math.abs(x-at):Infinity;
      if(d<=reach&&d<gap){gap=d;best=k;}
    });
    if(!best||!m||!m.name)return;
    var id=v.identity.create({role:'loaded',file:m.name,fingerprint:m.fingerprint,controller:m.port,generation:m.generation,revision:m.revision});
    window.dispatchEvent(new CustomEvent('cnc-v2-journal-open',{detail:{marker:{identity:id,interval:{fromMonoMs:best.interval.fromMonoMs,toMonoMs:best.interval.toMonoMs}},view:{screen:'home'}}}));
  }
  window.addEventListener('cnc-v2-journal-return',function(e){
    var view=e&&e.detail&&e.detail.view,shell=window.cncShell;
    if(!zones.v2||!view||view.screen!=='home'||!shell||typeof shell.go!=='function')return;
    shell.go('home');requestV2();
  });
  function pathD(key,d){var p=v2.paths[key];if(p&&p.getAttribute('d')!==d)p.setAttribute('d',d);}
  // chart() is the model's own result, recomputed at most once a second and null while Suivi is hidden:
  // drawn only when its reference changes. A gap stays a gap; no point is interpolated.
  function paintCurve(o){
    if(!o){
      if(v2.chart!==false){v2.chart=false;['line','gaps','marks'].forEach(function(k){pathD(k,'');});set('home-gauge-curve-title','textContent',say('Courbe indisponible'));set('home-v2-curve-events','textContent','');}
      return;
    }
    var ch=typeof o.chart==='function'?o.chart():null;
    if(!ch||ch===v2.chart)return;
    v2.chart=ch;
    var to=ch.toMonoMs,max=0,top=100,gaps='',marks='',n={correction:0,pause:0,gap:0},parts=[];
    ch.samples.forEach(function(p){if(finiteNumber(p.feedMmMin)&&p.feedMmMin>max)max=p.feedMmMin;});
    while(top<max)top=top*(String(top).charAt(0)==='2'?2.5:2);
    function X(t){return Math.round(Math.max(0,Math.min(300,(t-to+CURVE_MS)/CURVE_MS*300))*10)/10;}
    function Y(f){return Math.round((70-f/top*69)*10)/10;}
    pathD('line',ch.segments.map(function(seg){return seg.map(function(p,i){return (i?'L':'M')+X(p.atMonoMs)+' '+Y(p.feedMmMin);}).join('')+(seg.length===1?'h0.5':'');}).join(''));
    ch.markers.forEach(function(m){
      if(m.kind==='gap'){gaps+='M'+X(m.interval.fromMonoMs)+' 0H'+X(m.interval.toMonoMs)+'V70H'+X(m.interval.fromMonoMs)+'Z';n.gap++;}
      else if(n[m.kind]!==undefined&&m.time&&finiteNumber(m.time.arrivalMonoMs)){marks+='M'+X(m.time.arrivalMonoMs)+' 0V70';n[m.kind]++;}
    });
    pathD('gaps',gaps);pathD('marks',marks);
    set('home-gauge-curve-title','textContent',say('Avance rapportée, dernière minute')+say(' · 0 à ')+number(top)+' mm/min');
    if(n.correction)parts.push(say('Corrections : ')+n.correction);if(n.pause)parts.push(say('pauses : ')+n.pause);if(n.gap)parts.push(say('trous de données : ')+n.gap);
    set('home-v2-curve-events','textContent',parts.length?parts.join(' · '):say('Aucun événement sur la minute'));
  }
  // Preview of the loaded program for the other screens (spec 8.6, origin preview): the one Suivi
  // already read when it is there, else one read of its own (one in flight, same verdict and checks),
  // kept for that program until its preview is regenerated. null without a loaded program or a valid preview.
  var loadedRead=null;
  function samePrint(a,b){return String(a||'').toLowerCase().replace(/^sha256:/,'')===String(b||'').toLowerCase().replace(/^sha256:/,'');}
  // A preview belongs to the loaded program when the name matches and, both being known, the
  // fingerprint too (a file replaced under the same name is another program).
  function ofLoaded(meta,file,revision){
    if(!meta||!machine||machine.name!==file||machine.revision!==revision)return false;
    return !(machine.fingerprint&&meta.fingerprint&&!samePrint(machine.fingerprint,meta.fingerprint));
  }
  // The loaded program a read belongs to: controller, generation, revision, name and fingerprint.
  function programOf(m){return m?JSON.stringify([m.port,m.generation,m.revision,m.name,String(m.fingerprint||'').toLowerCase().replace(/^sha256:/,'')]):'';}
  function loadedPreview(){
    var file=machine&&machine.name?machine.name:'';
    if(!file)return Promise.resolve(null);
    var img=$('home-job-image'),shown=img&&img.cncPreview,revision=machine.revision;
    if(shown&&shown.file===file&&imageKey===file&&!previewFailed&&imageRevision===revision&&ofLoaded(shown,file,revision))return Promise.resolve(shown);
    var program=programOf(machine);
    if(loadedRead&&loadedRead.program===program)return loadedRead.promise;
    forgetLoaded('');
    // No sidecar read during a job (or with an unknown state): only what is already shown is given.
    if(!idleNow())return Promise.resolve(null);
    var token=sessionToken();if(!token)return Promise.resolve(null);
    var read={file:file,revision:revision,program:program,xhr:null,promise:null,resolve:null,cancelled:false};loadedRead=read;
    read.promise=new Promise(function(resolve){
      var xhr=previewXhr(file,token);read.xhr=xhr;read.resolve=resolve;
      // A result given as null (no preview, no state, another version by now) is never kept: asked again later.
      // A cancelled read resolves null once, and its late answer is never given (forgetLoaded).
      function done(meta){if(read.cancelled)return;read.xhr=null;var result=ofLoaded(meta,file,revision)&&programOf(machine)===program?meta:null;if(loadedRead===read&&!result)loadedRead=null;resolve(result);}
      xhr.onload=function(){var meta=null;try{var answer=previewAnswer(xhr,file);meta=answer.refused?null:answer.preview;}catch(_){}done(meta);};
      xhr.onerror=xhr.ontimeout=xhr.onabort=function(){done(null);};
      xhr.send(JSON.stringify({file:file+'.cnctouch.json'}));
    });
    return read.promise;
  }
  // Aborts a pending read (its handlers removed first, so no late answer can arrive) and drops the cache.
  function forgetLoaded(file){
    if(!loadedRead||file&&loadedRead.file!==file)return;
    var read=loadedRead,xhr=read.xhr;loadedRead=null;read.cancelled=true;read.xhr=null;
    if(xhr){xhr.onload=xhr.onerror=xhr.ontimeout=xhr.onabort=null;if(typeof xhr.abort==='function')xhr.abort();}
    if(read.resolve)read.resolve(null);
  }
  // A safe rest only: Idle and also no spindle, probing, homing, loading or jog; and, where the v2 contract
  // judges it, its safeIdle (fresh monotone report, connected transport…).
  function idleNow(){
    var m=machine,v=window.cncV2;
    if(!(m&&m.fresh&&(!m.workflow||m.workflow==='idle')&&!/^(run|hold|jog|alarm|door|home|check)/i.test(String(m.activeState||''))))return false;
    if(finiteNumber(m.spindleSpeed)&&m.spindleSpeed>0||m.probing||m.probeBusy||m.homing||m.loading||jogging(m))return false;
    try{if(v&&typeof v.state==='function'&&v.state().safeIdle===false)return false;}catch(_){}
    return true;
  }
  // Cancelled by its consumer's transitions too: a job starts or the program changes, Éco is chosen, the v2
  // gate closes (only where v2 was opened), the page is hidden for good.
  // (Called from the existing cnc-job-status, cnc-profile-change and cnc-v2-change listeners.)
  // A missing state alone does not abort: the answer then resolves null (no loaded program to match).
  function loadedStatus(){if(loadedRead&&machine&&(!idleNow()||programOf(machine)!==loadedRead.program))forgetLoaded('');}
  function loadedProfile(){var p=window.cncProfile;try{if(loadedRead&&p&&typeof p.performance==='function'&&p.performance()==='eco')forgetLoaded('');}catch(_){}}
  function loadedGate(){var v=window.cncV2;try{if(loadedRead&&v&&typeof v.gate==='function'&&!v.gate()&&v.state().sessionEnabled)forgetLoaded('');}catch(_){}}
  window.addEventListener('pagehide',function(){forgetLoaded('');});
  window.addEventListener('cnc-screen-lock',function(e){if(e&&e.detail)forgetLoaded('');});
  // cancelLoadedPreview(): for the consumer (origin-preview.js on unmount, screen change, lock, hidden).
  window.cncDashboardView={mount:mount,unmount:unmount,loadedPreview:loadedPreview,cancelLoadedPreview:function(){forgetLoaded('');}};
  mount();
  render();
})();
