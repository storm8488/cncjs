(function () {
  'use strict';
  var uiLocale=window.cncI18n||{t:function(s){return s;},html:function(s){return s;}};
  var panel = document.querySelector('.library-execution');
  if (!panel) return;
  var simulation=window.cncJobSimulation;
  // The browser's offline flag is only a hint (B-4): it never stops a request nor disables Pause /
  // Arrêter (the kiosk on localhost, a misread link); real request failures decide. Shown as a warning.
  var browserOffline=!simulation&&!!(window.navigator&&window.navigator.onLine===false);
  // While the session is refused, the fallback state read waits a minute between attempts (B-3).
  var refusedUntil=0;
  panel.innerHTML = uiLocale.html('<h2>Exécution sur la machine</h2>') +
    uiLocale.html('<label for="job-port">Contrôleur CNCjs</label><select id="job-port"><option value="">Aucune machine connectée</option></select>') +
    uiLocale.html('<p id="job-state" role="status">Lecture de l’état…</p>') +
    uiLocale.html('<p id="job-selected"></p><p id="job-loaded">Aucun fichier chargé.</p><p id="job-reason" role="status"></p><progress id="job-progress" max="100" value="0"></progress>') +
    uiLocale.html('<div class="job-buttons"><button id="job-load" disabled>Charger le fichier sélectionné</button>') +
    uiLocale.html('<button id="job-start" class="job-start" disabled>Démarrer…</button><button id="job-pause" disabled>Pause</button>') +
    uiLocale.html('<button id="job-resume" disabled>Reprendre…</button><button id="job-stop" class="job-stop" disabled>Arrêter le travail</button></div>') +
    uiLocale.html('<p id="job-feedback" role="status">Le chargement ne démarre pas le travail.</p>') +
    uiLocale.html('<p class="mute">L’arrêt logiciel ne remplace pas l’arrêt physique de la machine.</p>') +
    uiLocale.html('<div id="job-dialog" class="job-dialog" role="dialog" aria-modal="true" aria-labelledby="job-dialog-title" hidden>') +
    uiLocale.html('<div class="job-dialog-card"><h2 id="job-dialog-title">Confirmer le démarrage</h2><p id="job-dialog-file"></p><p id="job-travel" class="job-travel" hidden></p><div id="job-program-check" class="t-pcheck" hidden></div><p id="job-note" class="job-note" hidden></p>') +
    uiLocale.html('<p id="job-warning">')+(simulation?uiLocale.t('Test des boutons uniquement. Aucun mouvement ni activation du laser.'):uiLocale.t('Cette action met la machine en mouvement et peut activer l’outil. Vérifiez la machine, l’origine et la zone de travail.'))+uiLocale.html('</p>') +
    uiLocale.html('<label class="job-confirm-label t-check"><input id="job-check" type="checkbox"><span id="job-check-text">')+(simulation?uiLocale.t('Je souhaite lancer cette simulation.'):uiLocale.t('Je suis devant la machine et prêt à lancer ce fichier.'))+uiLocale.html('</span></label>') +
    // The confirmation window is visible: a countdown in words and a bar that empties.
    uiLocale.html('<div class="t-countdown"><p id="job-countdown"></p><div class="t-bar"><i id="job-countdown-bar"></i></div></div><div class="job-dialog-actions"><button id="job-dismiss" class="t-btn t-btn--ghost t-btn--lg">Annuler</button><button id="job-confirm" class="t-btn t-btn--primary" disabled>Confirmer</button></div></div></div>') +
    // Who pilots the machine (F5), opened from the strip: details, and an explicit takeover with a reason.
    uiLocale.html('<div id="pilot-dialog" class="job-dialog" role="dialog" aria-modal="true" aria-labelledby="pilot-dialog-title" aria-describedby="pilot-dialog-text" hidden>') +
    uiLocale.html('<div class="job-dialog-card"><h2 id="pilot-dialog-title">Pilotage de la machine</h2><p id="pilot-dialog-text"></p>') +
    uiLocale.html('<div id="pilot-form" class="pilot-form" hidden><label for="pilot-reason">Motif de la prise de pilotage (3 caractères au moins, enregistré et montré à l’autre appareil)</label><input id="pilot-reason" type="text" maxlength="200" autocomplete="off">') +
    uiLocale.html('<div class="pilot-reasons"><button type="button" id="pilot-reason-a" class="t-btn">Opérateur devant la machine</button><button type="button" id="pilot-reason-b" class="t-btn">Autre appareil hors service</button></div></div>') +
    uiLocale.html('<p id="pilot-feedback" role="status"></p><div class="job-dialog-actions"><button id="pilot-dismiss" class="t-btn t-btn--ghost t-btn--lg">Fermer</button><button id="pilot-takeover" class="t-btn t-btn--warn t-btn--lg" hidden disabled>Prendre le pilotage</button></div></div></div>');
  var $ = function(id) {return document.getElementById(id);};
  // Status line for a host command running on the server (fixed under the strip, ui-2027.css).
  var systemLine=document.createElement('p');systemLine.id='t-system-command';systemLine.className='t-system-command';systemLine.setAttribute('role','status');systemLine.hidden=true;
  if(document.body&&typeof document.body.appendChild==='function')document.body.appendChild(systemLine);
  // The confirmation must remain visible when opened from the home screen (appended last).
  document.body.appendChild($('pilot-dialog'));document.body.appendChild($('job-dialog'));
  // Persistent identity of this device for the attribution of control (F5): the server binds
  // the lease to it, so a reload or a stream renewal keeps the lease. An unreadable or malformed
  // stored value is replaced; without storage the identity lasts as long as this page.
  var CLIENT_KEY='cnc-touch-client-id';
  function loadClientId(){
    var id='';try{id=localStorage.getItem(CLIENT_KEY)||'';}catch(_){id='';}
    if(typeof id==='string'&&/^t-[a-z0-9]{1,12}-[a-z0-9]{4,16}$/.test(id))return id;
    id='t-'+Date.now().toString(36)+'-'+(Math.random().toString(36).slice(2,10)||'0000');
    try{localStorage.setItem(CLIENT_KEY,id);}catch(_){}
    return id;
  }
  var clientId=simulation?'':loadClientId();
  // Name shown to the other devices: the kind of device and the end of its identity.
  var touchDevice=!!(window.navigator&&window.navigator.maxTouchPoints>0);
  var clientLabel=clientId?(touchDevice?uiLocale.t('Tablette'):uiLocale.t('Poste'))+' '+clientId.slice(-4):'';
  var selection=window.cncLibrarySelection||null, machines=[], current=null, busy=false, polling=false, lastSeen=0, seenAt=0, ticket=null, until=0, portSignature='';
  var store=window.cncState, compact=!!(store&&window.CNCJobStream), stream=null, transportId=null, epoch='', serverSequence=0;
  var generation=0, mutation=0, confirmation=0, pending=0, commandSequence=0, feedbackSequence=0, nextPoll=0, disposed=false, stateSignature='', streamReason='';
  var latestMachine=null, lastTransit=0, appliedRequest=0, requestSequence=0, requests=[], bindings=[], explicitPort=false, protocolReady=false;
  var dialogReturn=null,dialogBackground=[], observationSuspended=!!document.hidden, preparing=0, renewing=0;
  // Pilot dialog (F5): focus to give back, background made inert, takeover request on its way.
  var pilot={state:'unknown',value:'—',sentence:''},takeoverSeen=null,pilotReturn=null,pilotBackground=[],pilotSending=false;
  // Host command (shutdown, restart…) holding the machine on the server: {title, since} or null,
  // carried by every snapshot (stream packet and HTTP read); shown in a status line under the strip.
  var systemCommand=null,feedbackState='';
  // Pause / Arrêter during a loss of the state (stream muted, HTTP read failing, offline flag):
  // the last controller seen busy (a job, a jog, anything Stop can end) stays the target of
  // these two commands, which the server accepts without the stream (relayed by HTTP). Every
  // other command waits for a recent state. Cleared by a fresh idle state or a port change.
  var halt=null;
  // Action feedback (D5): what the confirmed command was to lead to, and whether it was seen.
  // When the observed workflow later leaves it (another device paused, stopped or resumed),
  // the line « Démarrage demandé. » no longer describes the machine and is cleared.
  var feedbackExpect=null,feedbackReached=false,feedbackRaw='';
  // Last alarm code per port (D6): Grbl's restart banner after ALARM:3 makes the server forget
  // the code; the alarm's help stays shown while the controller remains in Alarm.
  var alarmMemory=null;
  // Action feedback state (ui-2027.css .t-sent): sent → confirmed | failed | uncertain (no answer).
  function setFeedbackState(state){feedbackState=state;if(state!=='confirmed'){feedbackExpect=null;feedbackReached=false;}var node=$('job-feedback');if(node&&typeof node.setAttribute==='function'&&typeof node.getAttribute==='function'&&node.getAttribute('data-state')!==state)node.setAttribute('data-state',state);}
  // A planned stream renewal (every minute) is not a disconnection: for up to 3 s
  // the transport still counts as connected and no notice is shown, while the
  // confirmations bound to the old stream are void as before.
  function renewalGrace(){return renewing>0&&elapsedClock()-renewing>=0&&elapsedClock()-renewing<3000&&sinceSeen()<3000;}
  // Time since the last report on the monotone clock (a civil clock set back renews nothing).
  function sinceSeen(){return lastSeen?elapsedClock()-seenAt:Infinity;}
  function bind(target,name,fn){target.addEventListener(name,fn);bindings.push(function(){if(target.removeEventListener)target.removeEventListener(name,fn);});}
  function text(id,value){if(window.cncI18n&&(id==='job-feedback'||id==='job-reason'||id==='job-state'))value=window.cncI18n.message(value);var node=$(id);if(node&&node.textContent!==String(value))node.textContent=String(value);}
  function prop(id,name,value){var node=$(id);if(node&&node[name]!==value)node[name]=value;}
  function token(){try{return JSON.parse(localStorage.getItem('cnc')).state.session.token||'';}catch(_){return '';}}
  function elapsedClock(){return window.performance&&typeof window.performance.now==='function'?window.performance.now():Date.now();}
  // Who pilots the selected port (F5), from the snapshot's `control` (shared by every client: the
  // role is derived from this device's id): this device, another one (named), nobody, or unknown.
  function ownerName(owner){return owner&&typeof owner==='object'?String(owner.label||owner.user||owner.id||'?').slice(0,60):'?';}
  function hourOf(ms){try{return new Date(ms).toLocaleTimeString(uiLocale.locale||'fr-FR',{hour:'2-digit',minute:'2-digit'});}catch(_){return '';}}
  function pilotOf(machine){
    if(simulation)return {state:'unknown',value:'—',sentence:''};
    if(!machine)return {state:'unknown',value:'—',sentence:uiLocale.t('Pilotage : état machine indisponible.')};
    var ctl=machine.control&&typeof machine.control==='object'?machine.control:null;
    if(!ctl)return {state:'unknown',value:'—',sentence:uiLocale.t('Pilotage : non indiqué par ce serveur CNCjs.')};
    var owner=ctl.owner&&typeof ctl.owner==='object'?ctl.owner:null,change=ctl.lastChange&&typeof ctl.lastChange==='object'?ctl.lastChange:null,p;
    if(!owner){
      p={state:'free',value:uiLocale.t('Libre'),sentence:uiLocale.t('Libre : aucun appareil ne pilote cette machine. La première action réussie d’un appareil le lui attribue.')};
      // The server ended the lease after a rest of idleMs (control.js 'idle'): said, with whose it was.
      if(change&&change.type==='idle'){
        var minutes=Math.max(1,Math.round((typeof change.idleMs==='number'&&change.idleMs>0?change.idleMs:300000)/60000));
        p.released=uiLocale.t('Libéré après ')+minutes+uiLocale.t(' min d’inactivité')+(change.previous?' (« '+ownerName(change.previous)+' »)':'')+'.';
        p.sentence=p.released+' '+p.sentence;
        if(change.previous&&change.previous.kind==='touch'&&change.previous.id===clientId){p.idleNotice=uiLocale.t('Pilotage de cet appareil libéré après ')+minutes+uiLocale.t(' min d’inactivité.');p.changeAt=change.at;}
      }
      // The lease ended because this device was away (control.js 'expired', E5 of the rehearsal): said once.
      if(change&&change.type==='expired'&&change.previous&&change.previous.kind==='touch'&&change.previous.id===clientId){
        p.idleNotice=uiLocale.t('Pilotage de cet appareil libéré : appareil absent trop longtemps. La première action réussie le reprend.');p.changeAt=change.at;}
    }
    else if(owner.kind==='touch'&&owner.id===clientId)p={state:'mine',value:uiLocale.t('Cet appareil'),sentence:uiLocale.t('Piloté par cet appareil (')+clientLabel+').'};
    else{
      var name=ownerName(owner),away=owner.present===false&&typeof owner.expires==='number';
      p={state:'other',value:name+(away?' '+uiLocale.t('(absent)'):''),name:name,
        sentence:uiLocale.t('Piloté par « ')+name+(away?uiLocale.t(' », absent : libéré vers ')+hourOf(owner.expires)+uiLocale.t(' s’il ne revient pas.'):uiLocale.t(' ».'))+' '+uiLocale.t('Pause et Arrêter restent possibles depuis cet appareil.')};
    }
    // This device lost the lease to an explicit takeover: by whom and why (shown once in the feedback).
    if(change&&change.type==='takeover'&&change.previous&&change.previous.kind==='touch'&&change.previous.id===clientId&&p.state!=='mine'){
      p.takenOver=uiLocale.t('Pilotage repris par « ')+ownerName(change.owner)+(change.reason?uiLocale.t(' » — motif : ')+String(change.reason).slice(0,200):uiLocale.t(' » (sans motif).'));
      p.changeAt=change.at;
    }
    return p;
  }
  // The machine the commands go to, as the server names it: label and kind (unknown kind: CNC).
  function targetText(m){
    var p=m&&m.machineProfile&&typeof m.machineProfile==='object'?m.machineProfile:null;
    var kind=p&&p.kind==='laser'?uiLocale.t('Laser'):p&&p.kind==='cnc'?uiLocale.t('CNC'):uiLocale.t('type non confirmé');
    return uiLocale.t('Machine : ')+(p&&p.label?'« '+p.label+' »':uiLocale.t('sans nom'))+' ('+kind+')';
  }
  // A refusal because another device pilots the port (HTTP 409, code ECONTROL): who, and what to do next.
  function controlRefusal(data){
    var e=new Error(data.owner?uiLocale.t('Refusé : pilotage attribué à « ')+ownerName(data.owner)+uiLocale.t(' ». Pause et Arrêter restent possibles. Pour agir ici, touchez Pilote dans le bandeau et prenez le pilotage avec un motif, ou attendez sa libération.'):String(data.message||uiLocale.t('Refusé : la machine est pilotée par un autre appareil.')));
    e.control=true;e.owner=data.owner||null;return e;
  }
  // Any other refusal: a stable code (ETOUCH_*) is shown in the interface language with its
  // values; otherwise the server's French message (translated when it is a catalog phrase).
  function serverRefusal(data,status){
    var fallback=data&&typeof data.message==='string'&&data.message?data.message:uiLocale.t('Commandes indisponibles (HTTP ')+status+').';
    // Coded reasons behind the refusal (laser framing refused by the travel check: {code, params,
    // message}, like a program check's codedReasons), 3 at most, in the interface language.
    var why=data&&Array.isArray(data.reasons)?data.reasons.filter(function(r){return r&&typeof r==='object'&&typeof r.message==='string'&&r.message;}).slice(0,3).map(function(r){
      var m=r.message.slice(0,300);return uiLocale.format?uiLocale.format(r.code,r.params,m):m;}):[];
    var e=new Error((data&&data.code&&uiLocale.format?uiLocale.format(data.code,data.params,fallback):fallback)+(why.length?' '+why.join(' '):''));
    if(data&&typeof data.code==='string'){e.code=data.code;e.params=data.params||null;}
    return e;
  }
  function api(method,body) {
    if(simulation) return simulation.request(method,body);
    if(document.body && document.body.getAttribute('data-simulation')==='true') return Promise.reject(new Error(uiLocale.t('Simulateur indisponible. Rechargez la page.')));
    return new Promise(function(resolve,reject) {
      var credential=token();
      if (!credential) {reject(new Error(uiLocale.t('Session CNCjs requise.')));return;}
      // The plate probe is answered once its whole sequence is over (up to about 3 min).
      var xhr=new XMLHttpRequest(); requests.push(xhr); xhr.open(method,(store?store.get().apiBase:'/api')+'/touch-job',true); xhr.timeout=body&&body.action==='zeroZ'?180000:30000;
      xhr.setRequestHeader('Authorization','Bearer '+credential);
      function done(){var i=requests.indexOf(xhr);if(i>=0)requests.splice(i,1);}
      if(body) xhr.setRequestHeader('Content-Type','application/json');
      xhr.onload=function(){done();var data,raw=false;try{data=JSON.parse(xhr.responseText);}catch(_){data={};raw=true;}
        if(xhr.status>=200&&xhr.status<300) resolve(data);
        // Session refused (401, or CNCjs' plain-text 403 « Forbidden Access »): not a refusal of the
        // command; app.js renews the session (or asks to sign in again) and the stream rechecks it.
        else if(xhr.status===401||(xhr.status===403&&(raw||!data||typeof data!=='object'))){sessionRefused();reject(raw||!data||typeof data.message!=='string'||!data.message?new Error(uiLocale.t('Session CNCjs expirée.')):serverRefusal(data,xhr.status));}
        else if(data&&data.code==='ECONTROL')reject(controlRefusal(data));
        else reject(serverRefusal(data,xhr.status));};
      // No answer is not a refusal: the command may have been applied (the next state says).
      xhr.onerror=xhr.ontimeout=function(){done();var e=new Error(uiLocale.t('Connexion perdue ou réponse incertaine. Vérifiez l’état avant toute nouvelle action.'));e.uncertain=true;reject(e);};
      // Every request names this device (F5): the server makes it the actor of the operation.
      var payload=body;
      if(body&&clientId){payload={};Object.keys(body).forEach(function(k){payload[k]=body[k];});payload.clientId=clientId;payload.clientLabel=clientLabel;}
      xhr.send(payload?JSON.stringify(payload):null);
    });
  }
  function sessionRefused(){refusedUntil=elapsedClock()+60000;if(stream&&stream.refused)stream.refused();window.dispatchEvent(new CustomEvent('cnc-session-refused',{detail:null}));}
  function dismiss(restore) {
    confirmation++;ticket=null;prop('job-dialog','hidden',true);prop('job-check','checked',false);prop('job-confirm','disabled',true);
    dialogBackground.forEach(function(entry){if(entry.restore)entry.restore();else entry.node.inert=entry.inert;});dialogBackground=[];
    var target=dialogReturn;dialogReturn=null;
    if(restore!==false&&!document.hidden&&target&&target.isConnected&&!target.disabled&&target.getClientRects().length)target.focus({preventScroll:true});
  }
  // Pause and Arrêter of the status strip stay usable over the confirmation (U5): the dialog
  // starts below the strip, they are never made inert and they belong to its Tab cycle. Both
  // close the dialog before sending (#job-pause / #job-stop), so no ticket outlives them.
  var STRIP_STOPS=['t-pause','t-stop'];
  // Dialog texts of the real page per operation: [warning, what the box confirms].
  var DIALOG_TEXT={
    start:[uiLocale.t('Cette action met la machine en mouvement et peut activer l’outil. Vérifiez la machine, l’origine et la zone de travail.'),uiLocale.t('Je suis devant la machine et prêt à lancer ce fichier.')],
    resume:[uiLocale.t('Cette action met la machine en mouvement et peut activer l’outil. Vérifiez la machine, l’origine et la zone de travail.'),uiLocale.t('Je suis devant la machine et prêt à reprendre ce fichier.')],
    macro:[uiLocale.t('Cette macro peut mettre la machine en mouvement et activer l’outil. Vérifiez la machine et la zone de travail.'),uiLocale.t('Je suis devant la machine et prêt à lancer cette macro.')],
    unlock:[uiLocale.t('Le déverrouillage ($X) lève l’alarme sans aucun mouvement. La position peut être fausse : refaites la prise d’origine avant de travailler.'),uiLocale.t('Je suis devant la machine et la cause de l’alarme est réglée.')],
    home:[uiLocale.t('La prise d’origine ($H) déplace chaque axe jusqu’à ses capteurs. Dégagez la zone de travail.'),uiLocale.t('Je suis devant la machine et la zone est dégagée.')],
    spindle:[uiLocale.t('Le test fait tourner la broche. Tenez mains et objets à distance de l’outil.'),uiLocale.t('Je suis devant la machine et l’outil peut tourner.')],
    zeroZ:[uiLocale.t('Le palpage descend Z jusqu’au contact avec la plaque. Vérifiez la plaque et la pince.'),uiLocale.t('Je suis devant la machine, la plaque et la pince sont en place.')],
    // Laser framing (PROFILES-CONTRACT.md §4): XY moves around the program, M5 first, never emits.
    frame:[uiLocale.t('Le cadrage déplace la tête en XY autour du programme chargé, à la hauteur actuelle, laser éteint (M5 envoyé d’abord). Arrêter interrompt le mouvement.'),uiLocale.t('Je suis devant la machine et la zone est dégagée.')]
  };
  function inStrip(node){return !!(node&&typeof node.closest==='function'&&node.closest('#real-banner,#simulation-banner'));}
  function stripKept(){return STRIP_STOPS.map($).filter(inStrip);}
  function stripStops(){return stripKept().filter(function(n){return !n.hidden&&!n.disabled&&n.getClientRects().length;});}
  // Everything outside the dialog becomes inert except the kept strip commands: their ancestors
  // stay active and every other branch under them is made inert (previous values are restored).
  function inertOutside(dialog,keep){
    var entries=[];
    function holds(node){return keep.some(function(k){return typeof node.contains==='function'&&node.contains(k);});}
    (function walk(children){Array.prototype.forEach.call(children||[],function(node){
      if(node===dialog||keep.indexOf(node)>=0||/^(SCRIPT|LINK|STYLE)$/.test(node.tagName))return;
      if(holds(node)){walk(node.children);return;}
      entries.push({node:node,inert:node.inert});node.inert=true;
    });})(document.body.children);
    return entries;
  }
  // Pilot dialog (F5): who pilots, and for another owner an explicit takeover with a reason of
  // 3 characters at least. Never automatic: only the Take control button sends it.
  function pilotReason(){return String($('pilot-reason').value||'').trim();}
  function renderPilotDialog(){
    if($('pilot-dialog').hidden)return;
    text('pilot-dialog-text',(pilot.sentence||uiLocale.t('Pilotage : état machine indisponible.'))+(pilot.takenOver?' '+pilot.takenOver:''));
    var other=pilot.state==='other';
    prop('pilot-form','hidden',!other);prop('pilot-takeover','hidden',!other);
    prop('pilot-takeover','disabled',!other||pilotSending||pilotReason().length<3);
  }
  function openPilot(){
    if(simulation||disposed||!$('pilot-dialog').hidden||otherDialog('pilot-dialog'))return false;
    // Locked screen: only Pause, Arrêter and the padlock answer (V4).
    if(window.cncScreenLock&&typeof window.cncScreenLock.locked==='function'&&window.cncScreenLock.locked())return false;
    pilotReturn=document.activeElement;
    // The status strip stays usable under this dialog (ui-2027.css starts it below the strip):
    // Pause and Arrêter must never wait for the operator to close a dialog about who pilots.
    // With the guard (strip-guard.js), only the strip's Pause / Arrêter stay active, as for the
    // confirmation; otherwise the whole strip.
    if(window.CNCStripGuard&&typeof window.CNCStripGuard.isolate==='function'){var restore=window.CNCStripGuard.isolate($('pilot-dialog'));pilotBackground=[{restore:restore}];}
    else pilotBackground=Array.prototype.filter.call(document.body.children||[],function(node){return node!==$('pilot-dialog')&&node.id!=='real-banner'&&!/^(SCRIPT|LINK|STYLE)$/.test(node.tagName);}).map(function(node){var entry={node:node,inert:node.inert};node.inert=true;return entry;});
    $('pilot-reason').value='';text('pilot-feedback','');$('pilot-dialog').hidden=false;renderPilotDialog();
    (pilot.state==='other'?$('pilot-reason'):$('pilot-dismiss')).focus();
    return true;
  }
  function closePilot(restore){
    if($('pilot-dialog').hidden)return;
    $('pilot-dialog').hidden=true;$('pilot-reason').value='';
    pilotBackground.forEach(function(entry){if(entry.restore)entry.restore();else entry.node.inert=entry.inert;});pilotBackground=[];
    var target=pilotReturn;pilotReturn=null;
    if(restore!==false&&!document.hidden&&target&&target.isConnected&&!target.disabled&&target.getClientRects().length)target.focus({preventScroll:true});
  }
  function takeOver(){
    var reason=pilotReason();
    if(pilotSending||pilot.state!=='other'||reason.length<3)return;
    pilotSending=true;text('pilot-feedback',uiLocale.t('Demande envoyée…'));renderPilotDialog();
    var started=Date.now();
    run('control',{operation:'takeover',reason:reason}).then(function(data){
      pilotSending=false;if(disposed)return;
      text('job-feedback',uiLocale.t('Pilotage pris par cet appareil.'));setFeedbackState('confirmed');
      closePilot();if(data&&data.snapshot)apply(data.snapshot,Date.now()-started);else render();
    },function(e){pilotSending=false;if(disposed)return;text('pilot-feedback',e.message);renderPilotDialog();});
  }
  // The preview and the Suivi trail belong to one version of the program: when the loaded job's
  // fingerprint differs from the preview's, neither is drawn as the loaded program's (ui-2027.css
  // hides the image, the trail and the marker on data-identity="other").
  function samePreview(pv,m){return !!(pv&&m&&pv.file===m.name&&!(m.fingerprint&&pv.fingerprint&&pv.fingerprint!==m.fingerprint));}
  function previewIdentity(m){
    if(simulation)return;
    var img=$('home-job-image'),art=img&&img.parentNode;
    if(!art||typeof art.setAttribute!=='function'||typeof art.getAttribute!=='function')return;
    var pv=img.cncPreview,other=!!(m&&m.name&&pv&&pv.file===m.name&&!samePreview(pv,m));
    if(art.getAttribute('data-identity')!==(other?'other':'same'))art.setAttribute('data-identity',other?'other':'same');
    var note=$('home-preview-identity');
    if(!note){if(!other)return;note=document.createElement('p');note.id='home-preview-identity';}
    if(note.parentNode!==art){note.className='t-preview-identity';note.setAttribute('role','status');art.appendChild(note);}
    var message=other?uiLocale.t('Aperçu d’une autre version du fichier : ni l’aperçu ni le tracé ne correspondent au programme chargé. Régénérez l’aperçu ou rechargez le fichier.'):'';
    if(note.textContent!==message)note.textContent=message;if(note.hidden!==!other)note.hidden=!other;
  }
  // Whether the machine state still allows what a ticket was issued for.
  // Commissioning commands confirmed through the same dialog (no loaded program involved).
  var COMMANDS={unlock:'canUnlock',home:'canHome',spindle:'canSpindleTest',zeroZ:'canZeroZ'};
  // Laser framing: a ticket of the machine action (frame-prepare, then frame with its nonce).
  function laserFrame(state){var c=state&&state.machineProfile&&state.machineProfile.capabilities;return !!(c&&c.laserFrame&&c.laserFrame.supported===true);}
  function standalone(operation){return operation==='macro'||operation==='frame'||Object.prototype.hasOwnProperty.call(COMMANDS,operation);}
  function ticketAllowed(t,state){
    if(t.operation==='macro')return !!state.canMacro;
    if(t.operation==='frame')return laserFrame(state)&&state.revision===t.revision;
    if(Object.prototype.hasOwnProperty.call(COMMANDS,t.operation))return !!state[COMMANDS[t.operation]];
    if(state.revision!==t.revision)return false;
    return t.operation==='start'?!!state.canStart:!!state.canResume;
  }
  function confirmable(){
    var state=projected();
    return !!ticket&&!document.hidden&&elapsedClock()>=ticket.started&&elapsedClock()<until&&sinceSeen()>=0&&sinceSeen()<3000&&
      ticket.generation===generation&&state&&state.fresh&&state.port===ticket.port&&ticketAllowed(ticket,state);
  }
  function otherDialog(own){
    var self=$(own||'job-dialog');
    return document.querySelectorAll&&Array.prototype.some.call(document.querySelectorAll('[role="dialog"]'),function(node){return node!==self&&!node.hidden&&node.getClientRects().length;});
  }
  // rotating: the server renews the event stream (every minute); the machine
  // state stays shown, but confirmations bound to the old stream are void.
  function unavailable(reason,rotating){
    var dropped=!!ticket||preparing>0;generation++;mutation++;dismiss();transportId=null;
    renewing=rotating?elapsedClock():0;
    if(!rotating){current=null;latestMachine=null;lastSeen=0;systemCommand=null;}
    streamReason=reason||'';
    if(dropped){text('job-feedback',uiLocale.t('Confirmation annulée : le suivi a été renouvelé. Touchez à nouveau le bouton.'));setFeedbackState('failed');}
    render();
    // The state by HTTP at once rather than at the next tick of the 1 s loop (Pause / Arrêter
    // stay offered meanwhile through `halt`).
    if(!rotating&&!simulation&&!disposed){nextPoll=0;poll(true);}
  }
  function projected(){
    if(!latestMachine)return null;
    var elapsed=Math.max(0,sinceSeen()), next={};
    Object.keys(latestMachine).forEach(function(key){next[key]=latestMachine[key];});
    if(compact&&!simulation&&!protocolReady){next.fresh=false;next.canLoad=next.canStart=next.canResume=next.canPreviewMotion=false;next.loadReason=next.startReason=next.resumeReason=uiLocale.t('Module de suivi absent ou incompatible. Installez la version attendue avant de charger ou démarrer.');}
    else if(compact&&!simulation&&(!transportId||!stream||!stream.alive())){next.canLoad=next.canStart=next.canResume=next.canPreviewMotion=false;next.loadReason=next.startReason=next.resumeReason=uiLocale.t('Suivi continu interrompu. Lecture de secours ; attendez le rétablissement avant de charger ou confirmer.');}
    if(typeof next.statusAgeMs==='number'){
      next.statusAgeMs+=elapsed+lastTransit;
      if(next.statusAgeMs>2500){next.fresh=false;next.canLoad=next.canStart=next.canResume=next.canPreviewMotion=false;next.loadReason=next.startReason=next.resumeReason=uiLocale.t('État machine trop ancien : attendre un rapport récent.');}
    }
    if(next.probeInput){var p={};Object.keys(next.probeInput).forEach(function(key){p[key]=next.probeInput[key];});if(typeof p.ageMs==='number')p.ageMs+=elapsed+lastTransit;if(p.ageMs===null||p.ageMs>2500){p.fresh=false;p.state='unknown';}next.probeInput=p;}
    return next;
  }
  function render() {
    current=projected();
    var online=current && sinceSeen()<3000;
    var grace=compact&&!simulation&&!transportId&&renewalGrace();
    var transportConnected=compact&&!simulation?(!!transportId&&!!stream&&stream.alive())||grace:sinceSeen()<3000;
    var command=online?systemCommand:null;
    pilot=pilotOf(online?current:null);
    if(pilot.takenOver&&pilot.changeAt!==takeoverSeen){takeoverSeen=pilot.changeAt;text('job-feedback',pilot.takenOver);setFeedbackState('failed');}
    else if(pilot.idleNotice&&pilot.changeAt!==takeoverSeen){takeoverSeen=pilot.changeAt;text('job-feedback',pilot.idleNotice);setFeedbackState('');}
    renderPilotDialog();previewIdentity(online?current:null);
    if(online&&current.fresh!==false)halt=haltOf(current);
    var lost=!online&&halt&&!simulation?halt:null;
    var detail={machine:online?current:null,observedAt:lastSeen,transportConnected:transportConnected,simulation:!!simulation,busy:busy,feedback:$('job-feedback').textContent,feedbackState:feedbackState,systemCommand:command,pilot:pilot,halt:lost};
    if(store)store.set({machine:detail.machine,controllerId:detail.machine?detail.machine.port:null,transportConnected:transportConnected,transportReason:grace?'':(streamReason||(browserOffline?uiLocale.t('Le navigateur signale le réseau coupé : le suivi continue tant que CNCjs répond.'):'')),systemCommand:command});
    var line=command?uiLocale.t('Commande système en cours : ')+command.title:'';
    if(systemLine.textContent!==line)systemLine.textContent=line;if(systemLine.hidden!==!line)systemLine.hidden=!line;
    var signature=JSON.stringify(detail);
    if(signature!==stateSignature){stateSignature=signature;window.dispatchEvent(new CustomEvent('cnc-job-status',{detail:detail}));}
    var selectedText=selection?uiLocale.t('Sélectionné dans la bibliothèque : ')+selection.name:uiLocale.t('Aucun fichier sélectionné dans la bibliothèque.');
    // A report too old (fresh false) does not tell what CNCjs holds now: same words as offline.
    var loadedText=online&&current.fresh!==false?(current.name?uiLocale.t('Chargé dans CNCjs : ')+(current.originalName||current.name):uiLocale.t('Aucun fichier chargé dans CNCjs.')):uiLocale.t('Fichier chargé : état indisponible.');
    var reason='';
    // Text only: it names the commands the lost state still allows (lost.canPause / lost.canStop, as below).
    var still=!lost?'':lost.canPause&&lost.canStop?uiLocale.t('Pause et Arrêter restent disponibles ; les autres commandes attendent un état récent.'):lost.canStop?uiLocale.t('Arrêter reste disponible ; les autres commandes attendent un état récent.'):lost.canPause?uiLocale.t('Pause reste disponible ; les autres commandes attendent un état récent.'):'';
    var filesReason='';
    // The server's load / start / resume reasons are French catalogue phrases: shown in the interface language
    // (« Palpage en cours. » stayed French in Spanish, lot Transverses M5). Text only, the guards below are unchanged.
    if(!online) reason=(streamReason||uiLocale.t('Connectez le contrôleur dans CNCjs et attendez un état récent.'))+(still?' '+still:'');
    else if(/^alarm/i.test(current.activeState)) reason=simulation?uiLocale.t('Alarme fictive : ouvrez Machine pour terminer le test d’alarme. La reprise devra être confirmée.'):(window.CNCGrblHelp?window.CNCGrblHelp.text(window.CNCGrblHelp.alarm(current.alarmCode,current.alarmCodeInferred))+' ':'')+uiLocale.t('Chargement et démarrage bloqués : le contrôleur est en ALARM. Consultez le message d’alarme dans CNCjs et résolvez sa cause. Quand la machine sera prête (Idle), chargez le fichier puis touchez Démarrer.');
    else if(!current.fresh) reason=uiLocale.t('En attente d’un état récent du contrôleur.');
    else if(!current.name) reason=current.canLoad?(selection?uiLocale.t('Étape suivante : Charger le fichier sélectionné, puis Démarrer.'):uiLocale.t('Sélectionnez un fichier dans la bibliothèque.')):(uiLocale.t(current.loadReason)||uiLocale.t('Chargement indisponible.'));
    else if(current.workflow==='paused') reason=current.canResume?uiLocale.t('Travail en pause. Touchez Reprendre pour confirmer la reprise.'):uiLocale.t(current.resumeReason);
    // A feed hold given from the PC leaves CNCjs's workflow running: the server's reason says what to touch (N1). Text only.
    else if(current.workflow==='running') reason=/^hold/i.test(current.activeState||'')&&current.resumeReason?uiLocale.t(current.resumeReason):uiLocale.t('Travail en cours.');
    // Fichiers has no Démarrer (it lives in Suivi): its reason line says where to start; #file (Suivi) keeps reason.
    else {reason=current.canStart?uiLocale.t('Fichier chargé. Touchez Démarrer pour confirmer.'):uiLocale.t(current.startReason);if(current.canStart)filesReason=uiLocale.t('Fichier chargé : ouvrez le Suivi pour démarrer.');}
    text('job-selected',selectedText);
    text('job-loaded',loadedText);
    text('job-reason',filesReason||reason);
    var homeFile=$('file');
    if(simulation) {loadedText=loadedText.replace(uiLocale.t('dans CNCjs'),uiLocale.t('dans le simulateur'));text('job-loaded',loadedText);}
    if(homeFile) text('file',(simulation?uiLocale.t('SIMULATION — '):'')+selectedText+' — '+loadedText+' '+reason);
    prop('job-port','disabled',busy);
    prop('job-load','disabled',busy || !online || !selection || !current.canLoad);
    prop('job-start','disabled',busy || !online || !current.canStart);
    prop('job-resume','disabled',busy || !online || !current.canResume);
    // Pause and stop stay available while another request is pending.
    prop('job-pause','disabled',online?!current.canPause:!(lost&&lost.canPause));
    prop('job-stop','disabled',online?!(current.canStop||jogging(current)):!(lost&&lost.canStop));
    if(!online){text('job-state',uiLocale.t('Machine non connectée ou état indisponible.'));prop('job-progress','value',0);if(ticket)dismiss();return;}
    text('job-state',current.port+' · '+current.activeState+' · '+({idle:uiLocale.t('au repos'),running:uiLocale.t('travail en cours'),paused:uiLocale.t('en pause')}[current.workflow]||current.workflow));
    prop('job-progress','value',current.total?Math.min(100,Math.round(current.received/current.total*100)):0);
    var label=(simulation?uiLocale.t('Progression fictive : '):uiLocale.t('Lignes acquittées : '))+$('job-progress').value+' %';
    if(!$('job-progress').getAttribute||$('job-progress').getAttribute('aria-label')!==label)$('job-progress').setAttribute('aria-label',label);
    // Unchanged titles are not written again (an attribute write at every report, also while Fichiers is parked).
    prop('job-start','title',current.canStart?'':uiLocale.t(reason));prop('job-load','title',uiLocale.t(current.loadReason||''));
    if(ticket && (ticket.port!==current.port || !ticketAllowed(ticket,current))){
      // A plate probe confirmation closed by the server's refusal (probe already in contact...) says why (UI-6).
      var why=ticket.operation==='zeroZ'&&ticket.port===current.port&&current.zeroZReason?(uiLocale.message||uiLocale.t)(current.zeroZReason):'';
      dismiss();if(why){text('job-feedback',uiLocale.t('Confirmation annulée : ')+why);setFeedbackState('failed');}
    }
  }
  // A real jog of the server's (F1) can be stopped even before Grbl reports Jog.
  function jogging(m){return !!(m&&m.motion&&typeof m.motion==='object'&&(m.motion.jog||m.motion.cancelling));}
  function haltOf(m){
    var stoppable=!!(m.canStop||jogging(m));
    return m.workflow!=='idle'||stoppable?{port:m.port,generation:m.generation||null,workflow:m.workflow,canPause:!!m.canPause,canStop:stoppable}:null;
  }
  // D6: an Alarm without code just after a code was seen on the same port keeps that code
  // (marked alarmCodeKept). A reset during a move (Grbl 1.1 raises ALARM:3; 6 during homing)
  // whose code the restart banner wiped is deduced, marked inferred, and only from a move
  // really reported (Run, Jog, Hold:1 decelerating; Home) on that port in the last 5 s (V7),
  // with no rest reported since (Idle, Hold:0): never from an old report or a pause at rest.
  var INFER_MS=5000,motionSeen=null;
  function recall(m){
    if(!m)return m;
    var a=String(m.activeState||'');
    if(/^home/i.test(a)||m.homing)motionSeen={port:m.port,code:6,at:Date.now()};
    else if(/^(run|jog|hold:1)/i.test(a))motionSeen={port:m.port,code:3,at:Date.now()};
    // At rest since (Idle, or a completed hold Hold:0: an M0 / tool-change pause, or the end of a
    // feed hold): Grbl 1.1 raises no ALARM:3 for a reset there, so a later alarm is not deduced (X3).
    else if(/^(idle|hold:0)/i.test(a))motionSeen=null;
    if(!/^alarm/i.test(a)){alarmMemory=null;return m;}
    var code=typeof m.alarmCode==='number'&&isFinite(m.alarmCode)?m.alarmCode:null;
    if(code!==null){alarmMemory={port:m.port,code:code,startups:m.startups,generation:m.generation};return m;}
    // A board restart cleared a hard/soft limit (ALARM:1/2): its « Reset in CNCjs » advice no longer
    // applies, and the move seen before it is not a reset during a move either. Proven restart only:
    // the server's startups count rose in the same generation, or a new generation (port reopened,
    // CNCjs restarted: its count starts at 0) already counted a restart banner. A reconnection
    // without banner keeps the code. Codes 3/6 may arrive just before the banner that explains them: kept.
    if(alarmMemory&&alarmMemory.port===m.port&&(alarmMemory.code===1||alarmMemory.code===2)&&
       typeof m.startups==='number'&&isFinite(m.startups)&&typeof alarmMemory.startups==='number'&&isFinite(alarmMemory.startups)&&
       (typeof m.generation==='string'&&typeof alarmMemory.generation==='string'&&m.generation!==alarmMemory.generation?m.startups>=1:m.startups>alarmMemory.startups)){alarmMemory=null;motionSeen=null;}
    var known=alarmMemory&&alarmMemory.port===m.port?alarmMemory.code:null,inferred=!!(known!==null&&alarmMemory.inferred);
    if(known===null&&motionSeen&&motionSeen.port===m.port&&Date.now()-motionSeen.at>=0&&Date.now()-motionSeen.at<=INFER_MS){
      known=motionSeen.code;inferred=true;alarmMemory={port:m.port,code:known,inferred:true};
    }
    if(known===null)return m;
    var copy={};Object.keys(m).forEach(function(k){copy[k]=m[k];});
    copy.alarmCode=known;copy.alarmCodeKept=true;if(inferred)copy.alarmCodeInferred=true;
    return copy;
  }
  // D5: the confirmed action's line stays while the workflow it led to is observed; once the
  // workflow leaves it (another device acted), the line is cleared rather than kept beside a
  // state it no longer describes.
  var PAUSE_WAIT='Pause demandée. Attendre l’état Hold.';
  function followFeedback(m){
    if(feedbackState!=='confirmed'||!feedbackExpect||!m)return;
    if(m.workflow===feedbackExpect){
      feedbackReached=true;
      // The server's pause answer asks to wait for Hold: once a recent report (< 1 s) says Hold, that wait is over
      // (text only). An old Hold kept by the server (reports lost) does not confirm this pause.
      if(feedbackExpect==='paused'&&feedbackRaw===PAUSE_WAIT&&/^hold/i.test(String(m.activeState||''))&&m.fresh===true&&typeof m.statusAgeMs==='number'&&m.statusAgeMs<1000){feedbackRaw='';text('job-feedback',uiLocale.t('Pause confirmée : la machine est en Hold.'));}
      return;
    }
    if(feedbackReached){feedbackExpect=null;feedbackReached=false;text('job-feedback','');setFeedbackState('');}
  }
  function apply(data,transit) {
      if(disposed)return;
      if(!data||!Array.isArray(data.controllers)||(!simulation&&compact&&
        (data.version!==undefined||data.epoch!==undefined)&&!window.CNCJobStream.validSnapshot(data,false))){
        var invalid=uiLocale.t('Réponse de suivi invalide.');
        if(stream)stream.reconnect(invalid);else unavailable(invalid);
        return;
      }
      if(epoch&&!data.epoch)return;
      protocolReady=data.version===1&&typeof data.epoch==='string';
      if(data.epoch){
        if(epoch&&data.epoch!==epoch){generation++;dismiss();serverSequence=0;}
        if(data.epoch===epoch&&data.sequence<=serverSequence)return;
        epoch=data.epoch;serverSequence=data.sequence;
      }
      machines=data.controllers||[];lastSeen=Date.now();seenAt=elapsedClock();lastTransit=transit||0;
      var sc=data.systemCommand;systemCommand=sc&&typeof sc==='object'&&typeof sc.title==='string'&&sc.title?{title:sc.title,since:sc.since}:null;
      var old=$('job-port').value, signature=machines.map(function(m){return m.port;}).join('|');
      if(signature!==portSignature){
        portSignature=signature;$('job-port').textContent='';
        var blank=document.createElement('option');blank.value='';blank.textContent=machines.length?uiLocale.t('Choisir une machine'):uiLocale.t('Aucune machine connectée');$('job-port').appendChild(blank);
        machines.forEach(function(m){var o=document.createElement('option');o.value=m.port;o.textContent=m.port+' · '+m.type;$('job-port').appendChild(o);});
        // A controller busy with a job (or anything Stop can end) stays selected when another
        // one appears, so its Stop and Pause never vanish while it moves.
        var oldBusy=!!(latestMachine&&latestMachine.port===old&&(latestMachine.workflow!=='idle'||latestMachine.canStop));
        $('job-port').value=machines.some(function(m){return m.port===old;})&&(explicitPort||machines.length===1||oldBusy)?old:(machines.length===1?machines[0].port:'');
        if(!$('job-port').value)explicitPort=false;
      }
      var next=machines.filter(function(m){return m.port===$('job-port').value;})[0]||null;
      if(latestMachine&&(!next||latestMachine.port!==next.port||latestMachine.generation!==next.generation)){generation++;dismiss();}
      next=recall(next);
      latestMachine=next;followFeedback(next);
      render();
  }
  function poll(force) {
    if(disposed||polling)return;
    if(!force&&!simulation&&elapsedClock()<refusedUntil&&elapsedClock()>=refusedUntil-60000)return;
    if(!force&&!simulation&&(stream&&stream.alive()||elapsedClock()<nextPoll))return;
    // Without the stream, a job (or anything Stop can end) is read every 2 s, so Stop and
    // Pause, which need a state younger than 3 s, stay usable between two reads.
    var active=!!(latestMachine&&(latestMachine.workflow!=='idle'||latestMachine.canStop));
    // With a server that has the event stream (protocol seen), these reads are the fallback while
    // it is down: every 2 s too (a legacy server stays at 10 s at rest), so the state stays shown (younger than 3 s) until the stream returns (N3).
    polling=true;nextPoll=elapsedClock()+(active||(compact&&!simulation&&protocolReady)?2000:10000);
    var id=++requestSequence, ownGeneration=generation, ownMutation=mutation, started=elapsedClock();
    api('GET').then(function(data){
      if(disposed||ownGeneration!==generation||ownMutation!==mutation||id<appliedRequest)return;
      refusedUntil=0;appliedRequest=id;apply(data,elapsedClock()-started);
    }).catch(function(e){if(ownGeneration===generation&&ownMutation===mutation){unavailable(e.message);text('job-state',e.message);}}).then(function(){
      polling=false;
      // The answer may be the first to show a job: the next read comes 2 s after this one.
      if(latestMachine&&(latestMachine.workflow!=='idle'||latestMachine.canStop))nextPoll=Math.min(nextPoll,started+2000);
    });
  }
  function run(action,extra) {
    if((!current || sinceSeen()>=3000)&&halt&&!simulation&&(action==='pause'||action==='stop')){
      var target={action:action,port:halt.port};if(halt.generation)target.generation=halt.generation;
      return api('POST',target);
    }
    if(!current || sinceSeen()>=3000)return Promise.reject(new Error('État indisponible.'));
    if(!simulation&&(['prepare','start','resume','macro','override','unlock','home','spindle','readSettings','set-origin','machine'].indexOf(action)>=0||(action==='motion'&&!(extra&&extra.operation==='jog-stop')))&&(!current.generation||!transportId||!stream||!stream.alive()))return Promise.reject(new Error(uiLocale.t('Suivi continu interrompu. Nouvelle confirmation requise.')));
    var body={action:action,port:current.port};
    if(current.generation)body.generation=current.generation;
    if(transportId)body.transportId=transportId;
    Object.keys(extra||{}).forEach(function(k){body[k]=extra[k];});
    return api('POST',body);
  }
  function command(action,extra) {
    var id=++commandSequence, ownGeneration=generation, started=Date.now();mutation++;pending++;busy=true;
    // Sent, not yet answered: the text says so until the server's answer (or its absence) replaces it.
    if(id>=feedbackSequence){feedbackSequence=id;text('job-feedback',uiLocale.t('Demande envoyée…'));setFeedbackState('sent');}
    render();
    // After the answer (or none), the state is read again from the server: nothing is replayed.
    function finish(){pending--;busy=pending>0;render();if(!stream||!stream.alive())poll(true);}
    return run(action,extra).then(function(data){
      if(ownGeneration===generation){
        if(id>=feedbackSequence){feedbackSequence=id;feedbackRaw=data.message||'';text('job-feedback',feedbackRaw);setFeedbackState('confirmed');feedbackExpect={start:'running',resume:'running',pause:'paused',stop:'idle'}[action]||null;feedbackReached=false;}
        if(data.snapshot)apply(data.snapshot,Date.now()-started);
      }
      return data;
    }).catch(function(e){if(ownGeneration===generation&&id>=feedbackSequence){feedbackSequence=id;text('job-feedback',e.message);setFeedbackState(e&&e.uncertain?'uncertain':'failed');}throw e;})
      .then(function(data){finish();return data;},function(e){finish();throw e;});
  }
  // operation: 'start' | 'resume' (the loaded program) | 'macro' (extra.macroId).
  function prepare(operation,extra) {
    if(busy||!current)return;
    var port=current.port,revision=current.revision, ownGeneration=generation, ownConfirmation=++confirmation, started=elapsedClock(),origin=document.activeElement;
    var request=operation==='macro'?{operation:'macro',macroId:extra&&extra.macroId}:standalone(operation)?{operation:operation}:{operation:operation,revision:revision};
    // Commands with parameters (the plate probe: thickness and search distance).
    if(standalone(operation)&&operation!=='macro'&&extra)Object.keys(extra).forEach(function(k){request[k]=extra[k];});
    preparing++;
    (operation==='frame'?command('machine',{operation:'frame-prepare'}):command('prepare',request)).then(function(data){
      preparing--;
      if(ownGeneration!==generation||ownConfirmation!==confirmation||document.hidden||!current||current.port!==port||(!standalone(operation)&&current.revision!==revision))return;
      until=started+Math.min(15,Number(data.expiresIn)||0)*1000;
      if(elapsedClock()<started||elapsedClock()>=until){text('job-feedback',uiLocale.t('Confirmation expirée. Préparez une nouvelle confirmation.'));setFeedbackState('failed');render();return;}
      ticket={nonce:data.nonce,operation:operation,port:port,revision:revision,generation:generation,started:started};
      if(!confirmable()||otherDialog()){dismiss(false);return;}
      dialogReturn=origin;
      // One stack of layers with the other overlays (strip-guard.js): a confirmation opened from a
      // sheet (macros) and closed in any order gives back exactly the values it found.
      var keep=stripKept();
      if(window.CNCStripGuard&&typeof window.CNCStripGuard.isolate==='function')dialogBackground=[{restore:window.CNCStripGuard.isolate($('job-dialog'))}];
      else dialogBackground=inertOutside($('job-dialog'),keep);
      // Below the strip, as #pilot-dialog (ui-2027.css): the overlay never covers Pause / Arrêter.
      // The card keeps its own scroll within the shorter overlay (its buttons are never clipped).
      if(keep.length&&$('job-dialog').style){$('job-dialog').style.top='var(--statusbar-h,0px)';var card=$('job-dialog').querySelector&&$('job-dialog').querySelector('.job-dialog-card');if(card&&card.style)card.style.maxHeight='calc(100vh - var(--statusbar-h,0px) - 48px)';}
      // What this operation does, and what the operator confirms (N4: an unlock moves nothing).
      if(!simulation){var words=DIALOG_TEXT[operation]||DIALOG_TEXT.start;if($('job-warning'))$('job-warning').textContent=words[0];if($('job-check-text'))$('job-check-text').textContent=words[1];}
      $('job-dialog-title').textContent=({start:uiLocale.t('Confirmer le démarrage'),macro:uiLocale.t('Exécuter la macro'),unlock:uiLocale.t('Déverrouiller la machine'),home:uiLocale.t('Lancer la prise d’origine'),spindle:uiLocale.t('Démarrer la broche'),zeroZ:uiLocale.t('Régler le zéro Z avec la plaque'),frame:uiLocale.t('Cadrer le programme (laser éteint)')})[operation]||uiLocale.t('Confirmer la reprise');
      // The target machine (label and kind, from the server's profile) and the piloting device.
      $('job-dialog-file').textContent=(data.name||current.originalName||current.name||'')+' · '+port+(simulation?'':' · '+targetText(current)+' · '+uiLocale.t('Pilote : ')+(pilot.value||'—'));
      // Start of a real job: the server's travel pre-check of this exact program (F2), joined to the
      // ticket; unknown is never shown as a green light. Without it (older server), the client's
      // XY estimate from the preview of this program version.
      var checked=operation==='start'&&!simulation&&window.CNCProgramCheckView?window.CNCProgramCheckView.show($('job-program-check'),data.programCheck||current.programCheck||null):null;
      if(!checked&&$('job-program-check'))$('job-program-check').hidden=true;
      if(window.CNCTravelCheck){var img=$('home-job-image'),pv=img&&samePreview(img.cncPreview,current)?img.cncPreview:null;
        window.CNCTravelCheck.show($('job-travel'),operation==='start'&&!simulation&&!checked?window.CNCTravelCheck.check(pv,current):null);}
      // Tool change resume or a resume from a line: what will happen, in one line.
      var note=window.CNCJobResume&&!simulation?window.CNCJobResume.dialogNote(operation,current,request):'';if($('job-note')){$('job-note').textContent=note;$('job-note').hidden=!note;}
      countdown(Math.max(0,Math.ceil((until-elapsedClock())/1000)));
      $('job-check').checked=false;$('job-confirm').disabled=true;$('job-dialog').hidden=false;$('job-dismiss').focus();
    },function(){preparing--;});
  }
  bind(window,'cnc-library-select',function(event){selection=event.detail;if(store)store.set({selection:selection});render();});
  bind($('job-port'),'change',function(){generation++;explicitPort=!!$('job-port').value;halt=null;dismiss();latestMachine=machines.filter(function(m){return m.port===$('job-port').value;})[0]||null;render();});
  bind($('job-load'),'click',function(){
    if(!selection||busy)return;dismiss();
    // Loading from Fichiers leads to the Suivi, where the start is confirmed.
    var files=document.getElementById('screen-files'),fromFiles=!!(files&&files.classList&&files.classList.contains('active'));
    command('load',{file:selection.file}).then(function(){if(fromFiles&&!disposed)window.dispatchEvent(new CustomEvent('cnc-navigate',{detail:'home'}));}).catch(function(){});
  });
  bind($('job-start'),'click',function(){prepare('start');});
  bind($('job-resume'),'click',function(){prepare('resume');});
  bind($('job-pause'),'click',function(){dismiss();command('pause').catch(function(){});});
  bind($('job-stop'),'click',function(){dismiss();command('stop').catch(function(){});});
  bind($('job-dismiss'),'click',dismiss);
  bind($('job-check'),'change',function(){$('job-confirm').disabled=!this.checked||!confirmable();});
  bind($('job-confirm'),'click',function(){
    if(!confirmable()){dismiss();return;}
    if(!$('job-check').checked)return;
    var t=ticket;dismiss();(t.operation==='frame'?command('machine',{operation:'frame',nonce:t.nonce}):command(t.operation,{nonce:t.nonce})).then(function(){
      // Tells the commissioning assistant which confirmed command the server accepted.
      if(Object.prototype.hasOwnProperty.call(COMMANDS,t.operation))window.dispatchEvent(new CustomEvent('cnc-command-sent',{detail:t.operation}));
    }).catch(function(){});
  });
  bind(document,'keydown',function(e){
    if(e.key==='Escape'){var visible=!$('job-dialog').hidden;dismiss();if(visible){e.preventDefault();e.stopImmediatePropagation();}return;}
    if($('job-dialog').hidden||e.key!=='Tab')return;
    // One cycle: the strip's Pause / Arrêter when offered, then the dialog's own controls
    // (Confirmer once enabled). Focus never leaves this list while the dialog is open.
    var order=stripStops().concat(['job-check','job-dismiss','job-confirm'].map($).filter(function(n){return n&&!n.hidden&&!n.disabled;}));
    var at=order.indexOf(document.activeElement),next=order[at<0?(e.shiftKey?order.length-1:0):(at+(e.shiftKey?order.length-1:1))%order.length];
    e.preventDefault();if(next)next.focus();
    e.stopImmediatePropagation();
  });
  bind(document,'focusin',function(e){if(!$('job-dialog').hidden&&!$('job-dialog').contains(e.target)&&stripStops().indexOf(e.target)<0)$('job-dismiss').focus();});
  bind($('pilot-dismiss'),'click',function(){closePilot();});
  bind($('pilot-takeover'),'click',takeOver);
  bind($('pilot-reason'),'input',function(){text('pilot-feedback','');renderPilotDialog();});
  ['pilot-reason-a','pilot-reason-b'].forEach(function(id){bind($(id),'click',function(){$('pilot-reason').value=this.textContent;renderPilotDialog();$('pilot-takeover').focus();});});
  // Escape closes, Tab stays inside the open pilot dialog.
  bind(document,'keydown',function(e){
    // The confirmation, when open, owns the keys (its handler comes first).
    if($('pilot-dialog').hidden||!$('job-dialog').hidden)return;
    if(window.CNCStripGuard&&typeof window.CNCStripGuard.covered==='function'&&window.CNCStripGuard.covered($('pilot-dialog')))return;
    if(e.key==='Escape'){closePilot();e.preventDefault();e.stopImmediatePropagation();return;}
    if(e.key!=='Tab')return;
    var order=['pilot-reason','pilot-reason-a','pilot-reason-b','pilot-dismiss','pilot-takeover'].map($).filter(function(n){return n&&!n.hidden&&!n.disabled&&!(pilot.state!=='other'&&/^pilot-reason/.test(n.id));});
    // One cycle with the strip's Pause / Arrêter first, as for the confirmation (U5).
    order=stripStops().concat(order);
    if(order.length){var at=order.indexOf(document.activeElement),next=order[at<0?(e.shiftKey?order.length-1:0):(at+(e.shiftKey?order.length-1:1))%order.length];e.preventDefault();next.focus();e.stopImmediatePropagation();return;}
    var first=order[0],last=order[order.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    e.stopImmediatePropagation();
  });
  // A preview image loaded for another version of the program is marked before it is painted.
  function previewLoaded(e){if(e&&e.target&&e.target.id==='home-job-image')previewIdentity(current&&sinceSeen()<3000?current:null);}
  if(document.addEventListener){document.addEventListener('load',previewLoaded,true);bindings.push(function(){if(document.removeEventListener)document.removeEventListener('load',previewLoaded,true);});}
  bind(window,'cnc-screen-change',function(){dismiss(false);closePilot(false);});
  bind(window,'cnc-screen-lock',function(e){if(e&&e.detail){dismiss(false);closePilot(false);}});
  function resumeObservation(){
    if(disposed)return;
    if(observationSuspended&&!simulation){
      observationSuspended=false;
      var reason=uiLocale.t('Retour à la page : attendre un nouvel état.');
      if(stream)stream.reconnect(reason,true);else unavailable(reason);
    }
    observationSuspended=false;
    poll(true);
  }
  bind(document,'visibilitychange',function(){if(document.hidden){observationSuspended=true;dismiss(false);closePilot(false);}else resumeObservation();});
  function network(online){
    if(simulation||disposed)return;
    browserOffline=!online;
    if(stream)stream.setOnline(online);
    if(online){nextPoll=0;poll(true);}
    render();
  }
  // New token stored without a reload (app.js, reload guard): the stream checks it at once.
  bind(window,'cnc-session-renewed',function(){if(disposed||simulation)return;refusedUntil=0;if(stream)stream.reconnect(undefined,true);nextPoll=0;poll(true);});
  bind(window,'offline',function(){network(false);});
  bind(window,'online',function(){network(true);});
  // Seconds left in words, and the bar's remaining fraction of the ticket window (15 s at most).
  function countdown(left){
    text('job-countdown',uiLocale.t('Confirmation valable ')+Math.max(0,left)+' s.');
    var bar=$('job-countdown-bar'),total=ticket?Math.max(1,Math.round((until-ticket.started)/1000)):15;
    if(bar&&bar.style)bar.style.transform='scaleX('+Math.max(0,Math.min(1,left/total))+')';
  }
  var interval=setInterval(function(){render();if(ticket){var now=elapsedClock(),left=Math.ceil((until-now)/1000);countdown(left);if(left<=0||now<ticket.started)dismiss();}if(!document.hidden)poll();},1000);
  if(compact&&!simulation){
    stream=window.CNCJobStream.create({apiBase:store.get().apiBase,token:token,clientId:clientId,
      onSnapshot:function(data){transportId=data.transportId;streamReason='';renewing=0;apply(data,data.transitMs);},
      onDisconnect:function(reason,rotating){unavailable(reason,rotating);},onStatus:function(reason){streamReason=reason;render();},
      onRefused:function(){window.dispatchEvent(new CustomEvent('cnc-session-refused',{detail:null}));}});
  }
  if(!simulation&&!compact&&window.cncSocket){
    ['disconnect','connect_error','error'].forEach(function(name){var fn=function(){if(stream)stream.reconnect();else unavailable(uiLocale.t('Connexion interrompue. Nouvelle confirmation requise.'));};window.cncSocket.on(name,fn);bindings.push(function(){if(window.cncSocket.off)window.cncSocket.off(name,fn);});});
  }
  function dispose(){if(disposed)return;dismiss(false);closePilot(false);disposed=true;if(typeof clearInterval==='function')clearInterval(interval);if(stream)stream.dispose();bindings.forEach(function(fn){fn();});requests.forEach(function(xhr){xhr.onload=xhr.onerror=xhr.ontimeout=null;xhr.abort();});requests=[];}
  bind(window,'pagehide',function(event){if(event&&event.persisted){observationSuspended=true;dismiss();if(stream)stream.reconnect();else unavailable(uiLocale.t('Retour à la page : attendre un nouvel état.'));}else dispose();});
  bind(window,'pageshow',function(event){if(event&&event.persisted)resumeObservation();});
  window.cncJobControls={refresh:function(){poll(true);},dispose:dispose,
    // Realtime override step (kind: feed | spindle | rapid; value as accepted by the server).
    override:function(kind,value){if(busy||!current)return Promise.reject(new Error(uiLocale.t('Opération en cours…')));return command('override',{kind:kind,value:value});},
    // Opens the confirmation for a CNCjs macro; the macro runs only after the confirmed nonce.
    prepareMacro:function(id){prepare('macro',{macroId:id});},
    // Commissioning: unlock ($X), home ($H) or spindle test (M3), each after the confirmation dialog.
    // Closes an open confirmation and drops a prepare still on its way.
    cancel:function(){dismiss(false);},
    prepareCommand:function(operation,extra){if(Object.prototype.hasOwnProperty.call(COMMANDS,operation))prepare(operation,extra);},
    // Laser framing (frame-prepare → confirmation → frame); offered only when the server says so.
    prepareFrame:function(){if(simulation||!current||!laserFrame(current))return false;prepare('frame');return true;},
    // Machine kind (PROFILES-CONTRACT.md §2): written in .cncrc by the server, nothing sent to the
    // controller. Same path as every machine action: pilot, generation, stream, refusals.
    setMachineKind:function(kind,label){
      if(busy||!current)return Promise.reject(new Error(uiLocale.t('Opération en cours…')));
      if(kind!=='cnc'&&kind!=='laser')return Promise.reject(new Error(uiLocale.t('Type de machine inconnu.')));
      return command('machine',{operation:'set-kind',kind:kind,label:String(label||'').slice(0,60)});
    },
    forgetMachine:function(){
      if(busy||!current)return Promise.reject(new Error(uiLocale.t('Opération en cours…')));
      return command('machine',{operation:'forget'});
    },
    targetText:function(){return targetText(current);},
    spindleStop:function(){if(!current)return Promise.reject(new Error(uiLocale.t('État indisponible.')));return command('spindleStop');},
    // Resume from a line: what would be sent (nothing loaded), then the load itself.
    resumePlan:function(file,line){if(!current)return Promise.reject(new Error(uiLocale.t('État indisponible.')));return run('resumePlan',{file:file,line:line});},
    loadFrom:function(file,line){if(busy||!current)return Promise.reject(new Error(uiLocale.t('Opération en cours…')));return command('load',{file:file,fromLine:line});},
    readSettings:function(){if(busy||!current)return Promise.reject(new Error(uiLocale.t('Opération en cours…')));return command('readSettings');},
    // Full $$ list and firmware banner, read-only.
    settings:function(){if(!current)return Promise.reject(new Error(uiLocale.t('État indisponible.')));return run('settings');},
    // Attribution of control (F5): this device's identity, who pilots now, the pilot dialog.
    clientId:function(){return clientId;},clientLabel:function(){return clientLabel;},pilot:function(){return pilot;},openPilot:openPilot,closePilot:closePilot,
    // Real moves (F1, experimental; real-motion.js): jog, jog-start and jog-keepalive need a fresh
    // state, the open stream and the generation (run). jog-stop is never held back by the client:
    // it goes out even with a lost stream or an old state, to the port given or the last one shown.
    motion:function(extra){
      if(simulation)return Promise.reject(new Error(uiLocale.t('Simulation : aucun déplacement réel.')));
      var e=extra||{};
      if(e.operation!=='jog-stop')return run('motion',e).then(answered);
      var body={action:'motion',operation:'jog-stop',port:e.port||(current&&current.port)||(latestMachine&&latestMachine.port)||$('job-port').value};
      if(e.jogId)body.jogId=e.jogId;if(transportId)body.transportId=transportId;
      return api('POST',body).then(answered);
    },
    // Work origin (F1): {axes} asks the server for a ticket (prepare set-origin), {nonce} confirms it.
    origin:function(extra){
      if(simulation)return Promise.reject(new Error(uiLocale.t('Simulation : aucun déplacement réel.')));
      return (extra&&extra.nonce?run('set-origin',{nonce:extra.nonce}):run('prepare',{operation:'set-origin',axes:extra&&extra.axes})).then(answered);
    }};
  // The snapshot joined to an answer is applied at once (the stream may bring it later).
  function answered(data){if(data&&data.snapshot&&!disposed)apply(data.snapshot,0);return data;}
  // Deferred subscribers can load after the first resolved local snapshot.
  bind(document,'DOMContentLoaded',function(){stateSignature='';render();});
  poll(true);
})();

