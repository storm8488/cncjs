/* Status strip (UI 2027): the machine state is visible on every screen. One
 * row in the page header: Grbl state as a word and a colour, report age,
 * spindle and feed, loaded file, and the action the state calls for: Pause and
 * Stop while a job runs, Stop during homing or a jog, Resume in a pause, Unlock
 * in an alarm (both through their usual confirmation). It only
 * projects the `cnc-job-status` detail already published by job-controls.js
 * (no timer, no request); Pause and Stop relay to the existing #job-pause and
 * #job-stop buttons, so every guard and confirmation stays where it is. */
(function () {
  'use strict';
  var uiLocale=window.cncI18n||{t:function(s){return s;},html:function(s){return s;},locale:'fr-FR'};
  var simulation=document.body.getAttribute('data-simulation')==='true';
  var banner=document.getElementById(simulation?'simulation-banner':'real-banner');
  if(!banner)return;
  var $=function(id){return document.getElementById(id);};
  function el(tag,cls,id){var n=document.createElement(tag);if(cls)n.className=cls;if(id)n.id=id;return n;}
  function text(node,value){if(!node||node.textContent===value)return;var n=node.firstChild;if(n&&n.nodeType===3&&!n.nextSibling)n.data=value;else node.textContent=value;}
  function attr(node,name,value){if(node.getAttribute(name)!==value)node.setAttribute(name,value);}
  function prop(node,key,value){if(node[key]!==value)node[key]=value;}
  // Icons: one shape per tone, so the state is never carried by colour alone.
  var icons={ok:'M4 12l5 5L20 6',run:'M7 5l12 7-12 7z',warn:'M8 5h3v14H8z M13 5h3v14h-3z',danger:'M12 3L2 21h20z M12 9v5 M12 17v1',off:'M5 5l14 14M19 5L5 19',info:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 11v5 M12 8v.5'};
  var state=el('div','t-state','t-state');state.setAttribute('data-tone','off');state.setAttribute('role','status');state.setAttribute('aria-live','polite');
  state.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+icons.off+'"/></svg>';
  // The word, and under it a short note (« déduite » for a deduced alarm code, V6).
  var stateWords=el('span','t-state-words');var stateText=el('span','','t-state-text');var stateNote=el('span','t-state-note','t-state-note');stateNote.hidden=true;
  stateWords.appendChild(stateText);stateWords.appendChild(stateNote);state.appendChild(stateWords);
  var fresh=el('span','t-fresh','t-fresh');fresh.setAttribute('data-stale','true');fresh.appendChild(el('i'));
  var freshText=el('span','','t-fresh-text');fresh.appendChild(freshText);fresh.title=uiLocale.t('Âge du dernier rapport machine');
  var vitals=el('div','t-vitals');
  function vital(label,id,extra){var box=el('div','t-vital'+(extra||''));var l=el('span');l.textContent=label;var b=el('b','',id);b.textContent='—';box.appendChild(l);box.appendChild(b);vitals.appendChild(box);return b;}
  var spindle=vital(uiLocale.t('Broche'),'t-spindle'),feed=vital(uiLocale.t('Avance'),'t-feed');
  // The target machine as the server names it (label · CNC / Laser), PROFILES-CONTRACT.md §2.
  var target=vital(uiLocale.t('Machine'),'t-machine',' t-vital--machine'),file=vital(uiLocale.t('Fichier'),'t-file',' t-vital--file');
  var spindleLabel=spindle.previousSibling;
  // The simulation has no machine record: the cell is not shown there.
  if(simulation&&target.parentNode)target.parentNode.hidden=true;
  var actions=el('div','t-strip-actions');
  var pause=el('button','t-btn t-btn--warn','t-pause');pause.type='button';pause.textContent=uiLocale.t('Pause');pause.hidden=true;
  var stop=el('button','t-btn t-btn--danger','t-stop');stop.type='button';stop.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>';
  var stopText=el('span');stopText.textContent=uiLocale.t('Arrêter');stop.appendChild(stopText);stop.hidden=true;
  var resume=el('button','t-btn t-btn--primary','t-resume');resume.type='button';resume.textContent=uiLocale.t('Reprendre…');resume.hidden=true;
  var unlock=el('button','t-btn t-btn--primary','t-unlock');unlock.type='button';unlock.textContent=uiLocale.t('Déverrouiller…');unlock.hidden=true;
  // Who pilots the machine (F5), always shown, never hidden to make room: this device, another
  // one (named), free, or unknown. A tap opens the pilot dialog (details, explicit takeover).
  // It sits in the actions cell, which a message never covers; Pause and Stop stay on its right.
  var pilot=el('button','t-pilot','t-pilot');pilot.type='button';pilot.setAttribute('data-state','unknown');
  var pilotLabel=el('span');pilotLabel.textContent=uiLocale.t('Pilote');var pilotValue=el('b','','t-pilot-value');pilotValue.textContent='—';
  pilot.appendChild(pilotLabel);pilot.appendChild(pilotValue);
  pilot.addEventListener('click',function(){var c=window.cncJobControls;if(c&&typeof c.openPilot==='function')c.openPilot();});
  actions.appendChild(pilot);
  actions.appendChild(unlock);actions.appendChild(resume);actions.appendChild(pause);actions.appendChild(stop);
  // Messages (what to do next, a system command running): one cell of the strip laid over the
  // report age and the live values, never over the state, the actions or the right-hand group.
  // Showing a message therefore moves no command and covers none, on the strip or on the screen.
  // Three lines at most (two plus one when both are shown); a tap on the cell drops the whole
  // text below it until the next tap anywhere, or 15 s.
  var messages=el('div','t-messages','t-messages');messages.hidden=true;messages.setAttribute('data-count','0');
  var more=el('div','t-messages-more','t-messages-more');more.hidden=true;more.setAttribute('aria-hidden','true');
  // Before the title and the right-hand group written by touch-shell.js.
  var first=banner.firstChild||null;[state,fresh,vitals,actions,messages].forEach(function(node){banner.insertBefore(node,first);});
  // The strip is contained (contain:strict): the full text lies in the body, under the cell.
  if(document.body&&typeof document.body.appendChild==='function')document.body.appendChild(more);
  var opened=false,closeTimer=0,moreFrame=0;
  function adopt(){['notice','t-system-command'].forEach(function(id){var n=$(id);if(n&&n.parentNode!==messages)messages.appendChild(n);});}
  function shownMessages(){var list=[];for(var i=0;i<messages.children.length;i++){var c=messages.children[i];if(!c.hidden&&c.textContent)list.push(c);}return list;}
  function fill(list){
    more.textContent='';
    list.forEach(function(c){var p=el('p',c.id==='notice'?'t-messages-notice':'t-messages-system');p.textContent=c.textContent;more.appendChild(p);});
    if(typeof messages.getBoundingClientRect!=='function')return;
    // From the rail to the cell's right edge (never past the strip actions' left edge, so never
    // over Suivi's right-hand column with Démarrer / Pause / Arrêter).
    var r=messages.getBoundingClientRect(),nav=$('tabbar'),left=nav&&nav.getBoundingClientRect?Math.ceil(nav.getBoundingClientRect().right)+8:r.left;
    left=Math.min(left,r.left);
    more.style.left=Math.round(left)+'px';more.style.width=Math.round(r.right-left)+'px';
  }
  function close(){
    if(!opened)return;opened=false;prop(more,'hidden',true);attr(messages,'aria-expanded','false');
    if(closeTimer&&window.clearTimeout)window.clearTimeout(closeTimer);closeTimer=0;
    if(document.removeEventListener)document.removeEventListener('pointerdown',outside,true);
  }
  function outside(e){var t=e&&e.target;if(t&&(messages.contains(t)||more.contains(t)))return;close();}
  function toggle(){
    if(opened){close();return;}
    var list=shownMessages();if(!list.length)return;
    opened=true;fill(list);prop(more,'hidden',false);attr(messages,'aria-expanded','true');
    if(window.setTimeout)closeTimer=window.setTimeout(close,15000);
    if(document.addEventListener)document.addEventListener('pointerdown',outside,true);
  }
  function measureMore(){
    moreFrame=0;var clipped=false;
    shownMessages().forEach(function(c){if(c.scrollHeight>c.clientHeight+1)clipped=true;});
    attr(messages,'data-more',String(clipped));
  }
  function syncMessages(){
    adopt();
    var list=shownMessages(),count=list.length;
    attr(messages,'data-count',String(count));prop(messages,'hidden',!count);attr(banner,'data-message',String(!!count));
    if(!count){close();attr(messages,'data-more','false');return;}
    if(opened)fill(list);
    if(!moreFrame&&window.requestAnimationFrame)moreFrame=window.requestAnimationFrame(measureMore);
  }
  messages.addEventListener('click',toggle);more.addEventListener('click',close);
  var messageObserver=typeof window.MutationObserver==='function'?new window.MutationObserver(syncMessages):null;
  if(messageObserver)messageObserver.observe(messages,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['hidden']});
  syncMessages();
  function relay(id){var source=$(id);if(source&&!source.disabled)source.click();}
  // A tap on Pause, Resume or Unlock freezes those three for 600 ms: a double tap
  // cannot reach the button that replaces the first one (Pause becoming Resume).
  // Stop is never delayed.
  var coolUntil=0;
  function guarded(fn){return function(){var now=Date.now();if(now<coolUntil)return;coolUntil=now+600;fn();};}
  pause.addEventListener('click',guarded(function(){relay('job-pause');}));
  stop.addEventListener('click',function(){relay('job-stop');});
  resume.addEventListener('click',guarded(function(){relay('job-resume');}));
  unlock.addEventListener('click',guarded(function(){var c=window.cncJobControls;if(c&&typeof c.prepareCommand==='function')c.prepareCommand('unlock');}));
  var screenLocked=false;
  window.addEventListener('cnc-screen-lock',function(e){screenLocked=!!(e&&e.detail);if(lastDetail)render(lastDetail);});
  function number(v){try{return Math.round(v).toLocaleString(uiLocale.locale||'fr-FR');}catch(_){return String(Math.round(v));}}
  function finite(v){return typeof v==='number'&&isFinite(v);}
  // Grbl state → word and tone. The word says what the machine does; the tone
  // follows the colour rules (green safe, amber attention, red alarm, blue info).
  function describe(m,connected){
    if(!m||!connected)return {word:uiLocale.t('Hors ligne'),tone:'off'};
    var a=String(m.activeState||'');
    // A code deduced after the board's restart banner (job-controls.js recall) is never shown as
    // received: « Alarme 3 déduite » (V6), on the strip, the Machine screen and the menu tile.
    if(/^alarm/i.test(a))return {word:uiLocale.t('Alarme')+(finite(m.alarmCode)?' '+m.alarmCode:''),note:finite(m.alarmCode)&&m.alarmCodeInferred?uiLocale.t('déduite'):'',tone:'danger'};
    // Grbl sends no report during a homing cycle: the server knows it from the $H sent.
    if(m.homing)return {word:uiLocale.t('Prise d’origine'),tone:'run'};
    if(!m.fresh)return {word:uiLocale.t('Rapport ancien'),tone:'warn'};
    if(/^hold/i.test(a))return {word:uiLocale.t('Pause'),tone:'warn'};
    if(/^door/i.test(a))return {word:uiLocale.t('Porte ouverte'),tone:'warn'};
    if(/^run/i.test(a))return {word:uiLocale.t('En cours'),tone:'run'};
    if(/^home/i.test(a))return {word:uiLocale.t('Prise d’origine'),tone:'run'};
    if(/^jog/i.test(a))return {word:uiLocale.t('Déplacement'),tone:'run'};
    if(/^check/i.test(a))return {word:uiLocale.t('Vérification'),tone:'info'};
    if(/^sleep/i.test(a))return {word:uiLocale.t('Veille'),tone:'off'};
    if(/^idle/i.test(a))return {word:uiLocale.t('Repos'),tone:'ok'};
    return {word:a||uiLocale.t('Inconnu'),tone:'info'};
  }
  var tone='',lastDetail=null;
  function render(detail){
    lastDetail=detail;
    var m=detail.machine,connected=simulation?!!m:!!detail.transportConnected&&!!m;
    // State lost (stream muted, HTTP read failing): the last busy controller stays the target
    // of Pause and Arrêter (job-controls.js, detail.halt); the word says the state is lost.
    var h=!m&&!simulation&&detail.halt&&typeof detail.halt==='object'?detail.halt:null;
    // A machine state is only published while recent (job-controls.js): read by HTTP while the
    // stream is down, it is shown at once rather than « Hors ligne » until the stream returns
    // (N3); only Resume and Unlock still wait for the stream (usable, below).
    var d=h?{word:uiLocale.t('État perdu'),tone:'warn'}:describe(m,!!m);
    text(stateText,d.word);text(stateNote,d.note||'');prop(stateNote,'hidden',!d.note);
    if(d.tone!==tone){tone=d.tone;attr(state,'data-tone',tone);state.querySelector('path').setAttribute('d',icons[tone]);}
    var age=m&&m.statusAgeMs,known=finite(age)&&age>=0;
    // Whole seconds only: a text that changed at every report (4 per second) would repaint the
    // strip continuously, which costs measurable CPU on the tablet at rest.
    text(freshText,simulation&&m?uiLocale.t('simulé'):!known?'—':age<1000?'< 1 s':age<60000?Math.ceil(age/1000)+' s':Math.ceil(age/60000)+' min');
    attr(fresh,'data-stale',String(!m||(!simulation&&(!known||age>2500||!m.fresh))));
    var live=!!(m&&m.fresh);
    // Laser: the S value is a set point (« consigne S »), never a measured power.
    var p=m&&m.machineProfile&&typeof m.machineProfile==='object'?m.machineProfile:null,laser=!!(p&&p.kind==='laser');
    text(spindleLabel,laser?uiLocale.t('Consigne S'):uiLocale.t('Broche'));
    text(spindle,live&&finite(m.spindleSpeed)?(laser?'S '+number(m.spindleSpeed):number(m.spindleSpeed)+uiLocale.t(' tr/min')):'—');
    text(target,!m?'—':p?(p.label||uiLocale.t('sans nom'))+' · '+(laser?uiLocale.t('Laser'):p.kind==='cnc'?uiLocale.t('CNC'):uiLocale.t('non confirmé')):uiLocale.t('non indiqué'));
    attr(target.parentNode,'data-kind',p&&p.kind?p.kind:'unknown');
    text(feed,live&&finite(m.feedrate)?number(m.feedrate)+' mm/min':'—');
    text(file,m&&m.name?(m.originalName||m.name):'—');
    // Stop and Pause need a recent machine state only: the server accepts them without the
    // event stream, so they stay offered while the page reads the state by HTTP. Resume and
    // Unlock need confirmations bound to the stream.
    var running=!!(m&&m.workflow&&m.workflow!=='idle'),usable=!!(m&&connected),reachable=!!m;
    // Stop also covers a homing cycle or a jog (the server ends them); Pause only a running job.
    // In a pause, Resume takes the place of Pause (which is then inactive anyway).
    // A real jog of the server's (F1) is stoppable before Grbl reports Jog too.
    var jogging=!!(m&&m.motion&&typeof m.motion==='object'&&(m.motion.jog||m.motion.cancelling));
    var stopShown=reachable?(running||!!m.canStop||jogging):!!(h&&h.canStop),pauseShown=reachable?m.workflow==='running':!!(h&&h.workflow==='running');
    var resumeShown=usable&&!screenLocked&&m.workflow==='paused'&&!!m.canResume;
    var unlockShown=usable&&!screenLocked&&!running&&/^alarm/i.test(String(m.activeState||''))&&!!m.canUnlock;
    prop(pause,'hidden',!pauseShown);prop(stop,'hidden',!stopShown);prop(resume,'hidden',!resumeShown);prop(unlock,'hidden',!unlockShown);
    // During a job the page switch link gives its room to the file name (and is not to be tapped then).
    attr(banner,'data-job',String(running||stopShown));attr(banner,'data-confirm',String(unlockShown||resumeShown));attr(banner,'data-lost',String(!!h));
    prop(pause,'disabled',m?!m.canPause:!(h&&h.canPause));prop(stop,'disabled',m?!(m.canStop||jogging):!(h&&h.canStop));
    var lostTitle=h?uiLocale.t('État machine perdu : Pause et Arrêter sont envoyés quand même (sans confirmation) ; les autres commandes attendent le retour du suivi.'):'';
    attr(pause,'title',lostTitle);attr(stop,'title',lostTitle);attr(state,'title',lostTitle);
    prop(resume,'disabled',!m||!m.canResume);prop(unlock,'disabled',!m||!m.canUnlock);
    // The pilot never changes what Pause and Stop accept: the server takes them from everyone.
    var p=!simulation&&detail.pilot&&typeof detail.pilot==='object'?detail.pilot:null,pilotState=p?p.state:'unknown';
    text(pilotValue,p&&p.value?p.value:'—');attr(pilot,'data-state',pilotState);
    var pilotTitle=p&&p.sentence?p.sentence:uiLocale.t('Pilotage : état machine indisponible.');attr(pilot,'title',pilotTitle);attr(pilot,'aria-label',uiLocale.t('Pilote : ')+pilotTitle);
    prop(pilot,'hidden',simulation);
  }
  var disposed=false;
  var v2MessageFrame=0,v2PendingMessage=null;
  function v2PreferenceChanged(){
    var v=window.cncV2,s=v&&v.state();
    if(!s||(!v2PendingMessage&&!(s.pending&&(s.enabled!==s.sessionEnabled||s.reason==='preference')))||v2MessageFrame||!window.requestAnimationFrame)return;
    v2MessageFrame=window.requestAnimationFrame(function(){
      v2MessageFrame=0;if(disposed)return;
      var v=window.cncV2,s=v&&v.state(),show=!!(s&&s.pending&&(s.enabled!==s.sessionEnabled||s.reason==='preference'));
      if(!show&&!v2PendingMessage)return;
      if(!v2PendingMessage){v2PendingMessage=el('p','','t-v2-pending');v2PendingMessage.setAttribute('role','status');messages.appendChild(v2PendingMessage);}
      text(v2PendingMessage,v.message());prop(v2PendingMessage,'hidden',!show);syncMessages();
    });
  }
  window.addEventListener('cnc-v2-change',v2PreferenceChanged);
  function onStatus(e){if(disposed||!e.detail||!!e.detail.simulation!==simulation)return;render(e.detail);}
  window.addEventListener('cnc-job-status',onStatus);
  function leave(e){if(e&&e.persisted)return;disposed=true;close();if(messageObserver)messageObserver.disconnect();if(v2MessageFrame&&window.cancelAnimationFrame)window.cancelAnimationFrame(v2MessageFrame);window.removeEventListener('cnc-v2-change',v2PreferenceChanged);window.removeEventListener('cnc-job-status',onStatus);window.removeEventListener('pagehide',leave);}
  window.addEventListener('pagehide',leave);
  render({machine:null,transportConnected:false});
  // V2 presenters borrow the existing context/messages cells only. No new cell,
  // reparenting or access to the action relays is introduced by the mount contract.
  var v2MountPoints=Object.freeze({context:vitals,messages:messages});
  window.cncStatusStrip={render:render,describe:describe,syncMessages:syncMessages,toggleMessages:toggle,
    v2Mounts:function(){return v2MountPoints;}};
})();
