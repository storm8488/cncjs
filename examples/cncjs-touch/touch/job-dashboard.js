(function () {
  'use strict';
  var uiLocale=window.cncI18n||{t:function(s){return s;},html:function(s){return s;}};
  var $=function(id){return document.getElementById(id);};
  // Laser profile (server-side machine type): the spindle value is an S set point, not a speed.
  function laser(){return !!(window.cncProfile&&window.cncProfile.kind()==='laser');}
  // The spindle labels follow the machine type when it changes (Réglages), not only at load.
  function relabel(){
    var a=$('home-override-spindle-label'),b=$('home-live-spindle-label');
    var override=laser()?uiLocale.t('Consigne S'):uiLocale.t('Broche'),live=laser()?uiLocale.t('Consigne S rapportée'):uiLocale.t('Broche réelle');
    if(a&&a.textContent!==override)a.textContent=override;
    if(b&&b.textContent!==live)b.textContent=live;
  }
  window.addEventListener('cnc-profile-change',function(){relabel();});
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
  ['load','start','pause','resume','stop'].forEach(function(action){
    $('home-job-'+action).addEventListener('click',function(){
      var source=$('job-'+action);
      if(!this.disabled&&source&&!source.disabled)source.click();
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
  overridesBox.addEventListener('click',function(e){
    var button=e.target&&e.target.closest?e.target.closest('button[data-kind]'):null;
    if(!button||button.disabled||!window.cncJobControls||typeof window.cncJobControls.override!=='function')return;
    window.cncJobControls.override(button.getAttribute('data-kind'),Number(button.getAttribute('data-value'))).catch(function(){});
  });
  // One formatter per locale: Number.prototype.toLocaleString builds a new one at every call,
  // which was the first script cost of Suivi during a job (two live values, 5 reports a second).
  var formats={};
  function number(v){var r=Math.round(v),loc=uiLocale.locale||'fr-FR';try{var f=formats[loc]||(formats[loc]=typeof Intl!=='undefined'&&Intl.NumberFormat?new Intl.NumberFormat(loc):null);return f?f.format(r):r.toLocaleString(loc);}catch(_){return String(r);}}
  function overrideButtons(){return overridesBox.querySelectorAll?overridesBox.querySelectorAll('button'):[];}
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
    set('home-live-spindle','textContent',rpm===null?'—':number(rpm)+uiLocale.t(' tr/min'));}
    // Reprendre takes the primary place while the job is held; Démarrer otherwise.
    var held=!!(c&&c.workflow==='paused');
    // In an alarm at rest nothing here can start (the ready line says why, Déverrouiller is on
    // the strip): the inactive Démarrer / Pause row gives its room to the alarm's help (N1).
    var alarmRest=!!(c&&c.workflow==='idle'&&/^alarm/i.test(String(c.activeState||'')));
    set('home-job-resume-row','hidden',!held);set('home-job-primary-row','hidden',held||alarmRest);
    // Charger only shows while the machine is idle and something is selected: one primary action per screen.
    var busyJob=!!(c&&c.workflow&&c.workflow!=='idle');
    set('home-job-load','hidden',!selection||busyJob);
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
    var key=c?simulation+':'+c.port+':'+c.name+':'+c.revision+':'+c.total:'';
    if(!valid){track=null;eta=c&&c.fresh&&!c.name?uiLocale.t('Temps restant : chargez un fichier'):uiLocale.t('Temps restant : état indisponible');}
    else {
      if(!track||track.key!==key||p<track.p)track={key:key,p:p,last:now,active:0,advance:0,running:false};
      var dt=(now-track.last)/1000;
      // Discontinuous observations must not reuse an estimate learned before sleep or a clock jump.
      if(dt<0||dt>3){track.active=0;track.advance=0;}
      else if(track.running&&c.workflow==='running'&&dt>0){track.active+=dt;track.advance+=Math.max(0,p-track.p);}
      track.last=now;track.p=p;track.running=c.workflow==='running';
      if(simulation){if(finiteNumber(c.remainingSeconds)&&c.remainingSeconds>=0)remaining=c.remainingSeconds;}
      else if(track.active>=10&&track.advance>0)remaining=(100-p)*track.active/track.advance;
      if(!finiteNumber(remaining)||remaining<0)remaining=null;
      if(p>=100&&failed)eta=uiLocale.t('Fin du programme avec ')+c.jobErrors+uiLocale.t(' erreur(s) Grbl — vérifiez la pièce');
      else if(p>=100&&(simulation||c.finished===true))eta=simulation?uiLocale.t('Terminé — 0 s restantes'):uiLocale.t('Terminé — programme exécuté jusqu’au bout');
      else if(p>=100)eta=uiLocale.t('Toutes les lignes acquittées — attendre la fin des mouvements');
      else if(c.workflow==='idle'&&!c.canStart)eta=uiLocale.t('Travail arrêté — temps restant indisponible');
      else if(c.canStart)eta=simulation?(remaining!==null?uiLocale.t('Durée simulée : ')+duration(remaining):uiLocale.t('Temps restant : état indisponible')):uiLocale.t('Temps restant : estimation après démarrage');
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
      set('home-job-selection','textContent',different?uiLocale.t('Sélection différente : ')+selection.name+uiLocale.t('. Charger la sélection remplacera le fichier chargé.'):'');
      set('home-job-load','textContent',same?uiLocale.t('Recharger le fichier'):uiLocale.t('Charger la sélection'));
      preview(file);
      set('home-job-title','textContent',simulation?uiLocale.t('Suivi — SIMULATION'):uiLocale.t('Suivi du travail'));
      set('home-job-name','textContent',c&&c.name?(c.originalName||c.name):selection?uiLocale.t('Sélectionné : ')+selection.name:uiLocale.t('Aucun fichier chargé'));
      set('home-job-percent','textContent',percent);set('home-job-progress','value',p);
      // The static help sentence of the job controls is not a command result: only results show here.
      set('home-job-eta','textContent',eta);
      var motion=motionText(c,file,now);set('home-job-motion','textContent',motion);set('home-job-motion','hidden',!motion);set('home-job-feedback','textContent',feedback===uiLocale.t('Le chargement ne démarre pas le travail.')?'':feedback);
      if(zones.on)gauges(c,valid,p,eta,remaining);
      set('home-job-note','textContent',simulation?uiLocale.t('Progression fictive sur 60 secondes, hors pauses. Aucun G-code exécuté.'):uiLocale.t('Progression des lignes acquittées. Estimation indicative selon le rythme observé, pas selon la durée des mouvements.'));
    }
    if(visible('files'))set('job-progress-summary','textContent',percent+' · '+eta);
  }
  window.addEventListener('cnc-library-select',function(e){selection=e.detail;render();});
  window.addEventListener('cnc-job-status',function(e){machine=e.detail.machine;halt=!machine&&e.detail.halt&&typeof e.detail.halt==='object'?e.detail.halt:null;simulation=e.detail.simulation;busy=!!e.detail.busy;feedback=e.detail.feedback||'';
    // Sent / confirmed / failed / uncertain, mirrored from job-controls.js (ui-2027.css .t-sent).
    var fb=$('home-job-feedback'),state=e.detail.feedbackState||'';if(fb&&typeof fb.setAttribute==='function'&&(!fb.getAttribute||fb.getAttribute('data-state')!==state))fb.setAttribute('data-state',state);
    if(zones.on){sample(machine);requestCurve();}
    render();});
  window.addEventListener('cnc-library-preview-updated',function(e){
    var file=machine&&machine.name?machine.name:selection&&selection.file||'';
    forgetLoaded(e.detail&&e.detail.file||'');
    if(e.detail&&e.detail.file&&e.detail.file!==file)return;
    cancelPreview();imageKey='';render();
  });
  function mount(){if(mounted||!visible('home'))return;mounted=true;if(previewFailed)imageKey='';render();requestCurve();}
  function unmount(){if(!mounted)return;mounted=false;cancelPreview();}
  window.addEventListener('cnc-screen-change',function(e){if(e.detail==='home')mount();else{unmount();if(e.detail==='files')render();}});
  document.addEventListener('visibilitychange',function(){if(visible('home'))mount();else unmount();});
  // ---- Wide workstation (body.perf-wide, touch-shell.js; PERFORMANCE-UI-SPEC.md 5.2, 6) ----
  // Suivi in zones: View (#home-left) | Instruments (#home-zone-gauges) | Commandes (#home-zone-controls),
  // the last two in .job-metrics. Two zones (Q3b, 1366 x 911): the instruments over the commands, the
  // overrides under the view as today; three columns where the view keeps at least today's width. The
  // wrappers and instruments are built the first time the layout is wide; out of it every element goes
  // back where it was, in the same order (on the RT they are never built). Display only: no command here.
  var THREE_ZONES_MIN_WIDTH=1600,CURVE_N=600,CURVE_MS=60000;
  var zones={on:false,three:false,built:false,gauges:null,controls:null,eta:null,ack:null,read:null,curve:null};
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
      svg.appendChild(grid);svg.appendChild(line);zones.curve.appendChild(svg);
    }
  }
  function arrange(){
    var wide=!!(window.cncLayout&&typeof window.cncLayout.wide==='function'&&window.cncLayout.wide()),three=wide&&window.innerWidth>=THREE_ZONES_MIN_WIDTH;
    if(wide===zones.on&&three===zones.three)return;
    var title=$('home-job-title'),metrics=title&&title.parentNode,left=$('home-left'),board=left&&left.parentNode;
    if(!metrics||!left||!board||typeof metrics.insertBefore!=='function')return;
    var progress=$('home-job-progress').parentNode,head=$('home-job-percent').parentNode,coords=$('home-coords'),tiles=$('home-live-feed').parentNode.parentNode,overrides=$('home-overrides'),stop=$('home-job-stop').parentNode,n,next;
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
    zones.on=wide;zones.three=three;
    if(wide){render();requestCurve();}
  }
  window.addEventListener('cnc-layout-change',arrange);
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
  function gauges(c,valid,p,eta,remaining){
    var pv=$('home-job-image').cncPreview,left=motionLeft,running=!!(valid&&c.workflow==='running'&&p<100);
    var title=eta,source='',second='',unknown='';
    var factor=left?(Math.round(left.factor*10)/10).toLocaleString(uiLocale.locale||'fr-FR'):'';
    if(running&&simulation&&remaining!==null){title=uiLocale.t('Reste ')+remainingText(remaining);source=uiLocale.t('durée simulée, aucun G-code exécuté');}
    else if(running&&left&&left.rapidKnown){
      title=uiLocale.t('Reste ')+remainingText(left.seconds);
      source=left.corrected?uiLocale.t('mouvements, corrigé ×')+factor+uiLocale.t(' d’après les lignes acquittées'):uiLocale.t('mouvements (sans accélérations), pas encore corrigé');
      if(remaining!==null)second=uiLocale.t('Selon le rythme observé : ')+remainingText(remaining);
    }else if(running&&remaining!==null){
      title=uiLocale.t('Reste ')+remainingText(remaining);source=uiLocale.t('rythme observé des lignes acquittées');
      if(left)second=uiLocale.t('Selon les mouvements : ')+remainingText(left.seconds)+uiLocale.t(' (rapides non comptés)');
    }else if(valid&&c.workflow==='paused'&&remaining!==null)source=uiLocale.t('rythme observé des lignes acquittées');
    if(left&&(running||valid&&c.workflow==='paused')){var ahead=unknownsText(left.unknownsAhead);if(ahead)unknown=uiLocale.t('Durées inconnues à venir : ')+ahead;}
    set('home-gauge-eta-title','textContent',title);
    [['home-gauge-eta-source',source],['home-gauge-eta-second',second],['home-gauge-eta-unknown',unknown]].forEach(function(d){set(d[0],'textContent',d[1]);set(d[0],'hidden',!d[1]);});
    // Without the preview, a resumed job counts in the original file (resume.total), as acknowledgedLine() does.
    var r=c&&c.resume,total=valid?(pv&&pv.file===c.name&&finiteNumber(pv.lines)&&pv.lines>0?pv.lines:r&&finiteNumber(r.from)&&finiteNumber(r.total)&&r.total>0?r.total:c.total):0;
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
  function loadedPreview(){
    var file=machine&&machine.name?machine.name:'';
    if(!file)return Promise.resolve(null);
    var img=$('home-job-image'),shown=img&&img.cncPreview,revision=machine.revision;
    if(shown&&shown.file===file&&imageKey===file&&!previewFailed&&imageRevision===revision&&ofLoaded(shown,file,revision))return Promise.resolve(shown);
    if(loadedRead&&loadedRead.file===file&&loadedRead.revision===revision)return loadedRead.promise;
    forgetLoaded('');
    var token=sessionToken();if(!token)return Promise.resolve(null);
    var read={file:file,revision:revision,xhr:null,promise:null};loadedRead=read;
    read.promise=new Promise(function(resolve){
      var xhr=previewXhr(file,token);read.xhr=xhr;
      // A result given as null (no preview, no state, another version by now) is never kept: asked again later.
      function done(meta){read.xhr=null;var result=ofLoaded(meta,file,revision)?meta:null;if(loadedRead===read&&!result)loadedRead=null;resolve(result);}
      xhr.onload=function(){var meta=null;try{var answer=previewAnswer(xhr,file);meta=answer.refused?null:answer.preview;}catch(_){}done(meta);};
      xhr.onerror=xhr.ontimeout=xhr.onabort=function(){done(null);};
      xhr.send(JSON.stringify({file:file+'.cnctouch.json'}));
    });
    return read.promise;
  }
  function forgetLoaded(file){if(!loadedRead||file&&loadedRead.file!==file)return;var xhr=loadedRead.xhr;loadedRead=null;if(xhr&&typeof xhr.abort==='function')xhr.abort();}
  window.cncDashboardView={mount:mount,unmount:unmount,loadedPreview:loadedPreview};
  mount();
  render();
})();
