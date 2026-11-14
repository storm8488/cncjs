/* Préparer, real page: the arrows, steps, speed and Zéro buttons of #screen-jog (index.html) move
 * the machine and set the work origin through the server's real path (F1, src/server/services/touch/
 * motion.js), never through a check without movement. This module is their only driver.
 *   - steps: one `jog` per tap (0.1 / 1 / 10 mm), one request at a time; a step stays "in flight"
 *     until a report shows the machine free again (or its nominal duration plus 2 s): leaving the
 *     screen, locking it, hiding the page, losing the stream or the pilot meanwhile sends jog-stop;
 *   - continuous (« Continu », offered only when the server enables it): `jog-start` on pointerdown,
 *     `jog-keepalive` every ≤ 150 ms while the finger stays, `jog-stop` at once on pointerup /
 *     pointercancel / pointerleave / lostpointercapture, another press anywhere, window blur, hidden
 *     page, screen change or lock, the stream lost, or the held button covered or hidden. A jog is
 *     never started again by itself: only a new press starts one;
 *   - Zéro X / Y / Z / XYZ: `prepare set-origin` gives a ticket (one for all the axes of the button),
 *     then the operator confirms it in a dialog below the status strip (Pause / Arrêter stay usable).
 * Every control stays in place: greyed out with one sentence saying what to do when the server or
 * the state refuses. The page never decides in the server's place and never computes a position. */
(function () {
  'use strict';
  var uiLocale=window.cncI18n||{t:function(s){return s;},html:function(s){return s;}};
  var t=uiLocale.t,msg=uiLocale.message||uiLocale.t;
  if(!document.body||document.body.getAttribute('data-simulation')==='true')return;
  var screen=document.getElementById('screen-jog');if(!screen)return;
  var FEEDS=[100,250,500,1000,2000],AXES=['X','Y','Z'];
  // Keepalive period: the server's (100 ms), never more than 150 ms (server timeout 250 ms).
  var KEEPALIVE_MAX_MS=150;
  // After a release or a step, a new press is ignored this long (double tap); a stop never waits.
  var REPEAT_GUARD_MS=300;
  // Without any state event this long, every control is greyed out.
  var STALE_MS=3000;
  // A step is taken as over at the latest its nominal duration plus this margin.
  var STEP_MARGIN_MS=2000;
  var DISABLED='Déplacements réels non activés : validation matérielle supervisée requise (voir HANDOFF.md).';
  var machine=null,connected=false,pilot=null,received=null,observedAt=null,lastJogAt=null,first=true;
  var mode='step',step=1,feed=250,hold=null,stepping=null,quietUntil=0;
  var ticket=null,originBusy=false,settingsBusy=false,last=null,dialog=null,restore=null,returnTo=null,clock=null,disposed=false,seq=0;
  // The arrows pressed in « Continu » (one per button, several fingers): the click that may follow
  // each release never sends a step.
  var downHold=[];
  // A continuous jog whose stop the server accepted: « arrêté » only once a report shows it stopped.
  var stopWait=null;
  function noop(){}
  // Monotonic when the browser has it: a clock change never extends a guard or a ticket.
  function now(){var p=window.performance;return p&&typeof p.now==='function'?p.now():Date.now();}
  function $(id){return document.getElementById(id);}
  function list(n,sel){return n&&typeof n.querySelectorAll==='function'?Array.prototype.slice.call(n.querySelectorAll(sel)):[];}
  function make(tag,cls,id,text){var n=document.createElement(tag);if(cls)n.className=cls;if(id)n.id=id;if(text!==undefined)n.textContent=text;if(tag==='button')n.type='button';return n;}
  function setText(n,v){if(n&&n.textContent!==v)n.textContent=v;}
  function prop(n,k,v){if(n&&n[k]!==v)n[k]=v;}
  function attr(n,k,v){if(!n)return;if(v===null||v===''){if(n.getAttribute(k)!==null)n.removeAttribute(k);}else if(n.getAttribute(k)!==v)n.setAttribute(k,v);}
  function klass(n,name,on){if(n&&n.classList&&n.classList.contains(name)!==on)n.classList.toggle(name,on);}
  function caps(){return machine&&machine.capabilities&&typeof machine.capabilities==='object'?machine.capabilities:null;}
  function cap(name){var c=caps(),v=c&&c[name];return v&&typeof v==='object'?v:null;}
  function on(name){var c=cap(name);return !!(c&&c.enabled===true);}
  function motion(){return machine&&machine.motion&&typeof machine.motion==='object'?machine.motion:null;}
  function controls(){return window.cncJobControls||null;}
  function post(body){var c=controls();if(!c||typeof c.motion!=='function')return Promise.reject(new Error(t('Commandes indisponibles : rechargez la page.')));return c.motion(body);}
  function live(){return !!(machine&&connected&&machine.fresh);}
  function stale(){return received===null||now()-received>=STALE_MS;}
  function shown(){return !!(screen.classList&&screen.classList.contains('active'))&&!document.hidden;}
  function locked(){var l=window.cncScreenLock;return !!(l&&typeof l.locked==='function'&&l.locked());}
  function fmt(v){var n=typeof v==='string'&&v.trim()!==''?Number(v):v;return typeof n==='number'&&isFinite(n)?n.toFixed(3):'—';}
  function units(){var o=machine&&machine.operator;return o&&o.reportUnits==='mm'?'mm':o&&o.reportUnits==='in'?t('pouces'):'';}
  function wcs(){var o=machine&&machine.operator;return o&&typeof o.wcs==='string'&&/^G5[4-9]$/.test(o.wcs)?o.wcs:'';}
  function dir(d){return d>0?'+':'−';}
  // The controller's state in the status strip's words (« Repos », « Alarme »…), Grbl's word without the strip.
  function stateWord(m){var w=null;try{w=window.cncStatusStrip&&window.cncStatusStrip.describe(m,true);}catch(_){w=null;}return w&&w.word?w.word:String(m&&m.activeState||'');}
  // A control usable now: Préparer shown, page visible, screen not locked, button shown and enabled.
  function usable(b){
    if(!shown()||locked()||!b||b.disabled||b.hidden)return false;
    return typeof b.getClientRects!=='function'||b.getClientRects().length>0;
  }
  function inert(b){for(var n=b;n&&n!==document.body;n=n.parentNode)if(n.inert===true)return true;return false;}

  // ---- Server reasons that carry a value, rewritten as one sentence saying what to do ----
  function inches(){var o=machine&&machine.operator;return !!(o&&o.reportUnits==='in');}
  function alarmed(){return !!machine&&/^alarm/i.test(String(machine.activeState||''));}
  // After a board restart in alarm: $$ is read at rest only, so $X comes first (Machine).
  function rereadInAlarm(){return t('Alarme : touchez Déverrouiller ($X) dans Machine, puis Relire les réglages ($$), puis Prise d’origine ($H).');}
  function reasonText(r){
    r=String(r||'');if(!r)return '';
    var m;
    if(/^Rapports en pouces \(\$13=1\) ou réglage \$13 inconnu/.test(r))return inches()?t('Rapports de la carte en pouces ($13=1) : réglez $13=0 sur la carte pour déplacer depuis la tablette.'):t('Réglage $13 inconnu : touchez Relire les réglages ($$).');
    if((m=/^Pas de ([\d.]+) mm refusé : au-delà de/.exec(r)))return t('Pas de ')+m[1]+t(' mm refusé : machine non référencée ou course inconnue. Faites la prise d’origine (Machine) ; sinon 1 mm au plus.');
    if((m=/convention de course ambiguë à cette position \(([XYZ]) /.exec(r)))return t('Course ')+m[1]+t(' ambiguë à cette position : refaites la prise d’origine (Machine) pour fixer le sens de la course.');
    if(/hors de la course supposée/.test(r))return t('Position machine incohérente avec la course ($23, $130–$132) : refaites la prise d’origine et faites vérifier les réglages.');
    if(/^Broche en rotation : maintien continu refusé/.test(r))return t('Broche en rotation : pas de continu, pas de 0,1 mm au plus. Arrêtez la broche (M5).');
    if(/^Maintien continu impossible/.test(r))return t('Continu indisponible : machine non référencée ou course inconnue. Faites la prise d’origine (Machine) ou utilisez les pas.');
    if((m=/^Avance hors limites pour ([XYZ]) : de 1 à ([\d.]+) mm\/min/.exec(r)))return t('Vitesse trop élevée pour ')+m[1]+' : '+m[2]+t(' mm/min au plus. Choisissez une vitesse plus basse.');
    return msg(r);
  }
  // Settings CNCjs forgot (board restart): a reading of $$ ($I banner) gives them back.
  // Any case (« Réglage $22 inconnu » too); $13 known as 1 (inches) is not a lost setting: a reading changes nothing.
  var UNKNOWN_SETTINGS=/(réglage \$\d+[^:.]*inconnu|\$1[0-3]\d? inconnu|course \$13\d inconnue|Version Grbl inconnue)/i;
  function settingsMissing(){
    var m=motion(),c=cap('jog'),texts=[c&&c.reason,m&&m.jogReason,m&&m.setOriginReason,machine&&machine.homeReason];
    if(m&&m.continuousReason)AXES.forEach(function(a){texts.push(m.continuousReason[a]);});
    return texts.some(function(s){return typeof s==='string'&&UNKNOWN_SETTINGS.test(inches()?s.replace(/ou réglage \$13 inconnu/,''):s);});
  }

  // ---- Why nothing can move now, in the order of the report's own fields ('' when it can) ----
  function common(){
    var m=motion();
    if(m&&m.cancelUnconfirmed)return t('ANNULATION NON CONFIRMÉE : utilisez l’arrêt physique si la machine bouge encore');
    if(!connected)return t('Suivi interrompu : déplacement bloqué jusqu’à son retour.');
    // No machine published: none on the server (recent packets), or none recent enough.
    if(!machine)return typeof observedAt==='number'&&observedAt>0&&Date.now()-observedAt>=STALE_MS?t('État machine trop ancien : attendez un rapport récent.'):t('Aucune machine connectée : touchez Connecter la CNC dans le Menu.');
    if(!machine.fresh||stale())return t('État machine trop ancien : attendez un rapport récent.');
    if(pilot&&pilot.state==='other')return t('Pilotée par « ')+(pilot.name||'—')+t(' » : touchez Pilote (bandeau) pour prendre la main.');
    if(!caps()||!m)return t('Ce serveur CNCjs ne permet pas les déplacements depuis la tablette.');
    var c=cap('jog');
    if(!c||c.enabled!==true){
      var r=c&&c.reason||'';
      if(!r||r===DISABLED)return t('Déplacements non activés sur ce serveur CNCjs (touch.motion.enabled).');
      if(/^Version Grbl inconnue/.test(r))return alarmed()?rereadInAlarm():t('Version de la carte inconnue : touchez Relire les réglages.');
      return msg(r);
    }
    if(machine.probing)return t('Palpage en cours : attendez sa fin.');
    if(machine.loading)return t('Chargement en cours : attendez sa fin.');
    if(machine.workflow==='running')return t('Travail en cours : déplacement manuel impossible.');
    if(machine.workflow==='paused')return t('Travail en pause : reprenez-le ou arrêtez-le avant de déplacer.');
    var a=String(machine.activeState||'');
    if(/^alarm/i.test(a)&&settingsMissing())return rereadInAlarm();
    if(/^alarm/i.test(a))return t('Alarme')+(typeof machine.alarmCode==='number'?' '+machine.alarmCode:'')+t(' : Déverrouiller ($X) ou Prise d’origine ($H) dans Machine.');
    if(machine.homing||/^home/i.test(a))return t('Prise d’origine en cours : attendez sa fin.');
    if(m.jog||m.cancelling||/^jog/i.test(a))return t('Déplacement en cours : attendez l’arrêt.');
    if(/^hold/i.test(a))return t('Machine en pause : touchez Arrêter (bandeau), puis Prise d’origine.');
    if(/^door/i.test(a))return t('Porte de sécurité ouverte : fermez-la, puis touchez Arrêter (bandeau).');
    if(/^sleep/i.test(a))return t('Carte en veille : réinitialisez-la (bouton de la carte ou remise sous tension).');
    if(!/^idle/i.test(a))return t('La machine doit être au repos : état ')+stateWord(machine)+'.';
    return '';
  }
  function ours(){
    if(hold||stepping)return t('Déplacement en cours : attendez l’arrêt.');
    if(ticket||originBusy)return t('Confirmation d’origine en attente : confirmez ou annulez-la d’abord.');
    return '';
  }
  function jogReason(){var g=common();if(g)return g;var m=motion();return m.canJog===true?'':reasonText(m.jogReason)||t('Déplacement indisponible.');}
  function axisReason(axis){var m=motion();return mode==='hold'&&m&&m.continuousReason&&m.continuousReason[axis]?reasonText(m.continuousReason[axis]):'';}
  function moveReason(axis){return jogReason()||ours()||axisReason(axis);}
  function originReason(){return originState()||ours();}
  // The origin refused by the state or the server (our own move or ticket aside).
  function originState(){
    var g=common();if(g)return g;
    var c=cap('setOrigin');if(!c||c.enabled!==true)return msg(c&&c.reason||'')||t('Déplacements non activés sur ce serveur CNCjs (touch.motion.enabled).');
    var m=motion();if(m.canSetOrigin!==true)return reasonText(m.setOriginReason)||t('Origine de travail indisponible.');
    return '';
  }

  // ---- What was asked and what the server answered (#jog-feedback) ----
  function tell(text,state){last={text:text,state:state||''};render();}
  function refusal(e){
    if(e&&e.uncertain)return t('Sans réponse du serveur : vérifiez la position avant de continuer.');
    if(e&&(e.control||e.code))return String(e.message||'');
    return t('Refusé : ')+reasonText(e&&e.message?e.message:t('raison inconnue'));
  }

  // ---- Continuous jog while held ----
  function stopHold(why){
    var h=hold;if(!h)return false;
    hold=null;if(h.timer)clearInterval(h.timer);h.timer=null;
    quietUntil=now()+REPEAT_GUARD_MS;
    try{if(h.button.releasePointerCapture&&h.pointerId!==undefined)h.button.releasePointerCapture(h.pointerId);}catch(_){}
    // Sent at once, with the jog's id once known (the server stops any jog of ours without it).
    var body={operation:'jog-stop',port:h.port};if(h.jogId)body.jogId=h.jogId;
    var label=h.axis+dir(h.direction)+t(' · continu : ');
    tell(label+t('arrêt envoyé…')+(why?' ('+why+')':''),'sent');
    // The answer only says the cancel (0x85) went out: « arrêté » once a report shows the machine stopped.
    post(body).then(function(){if(!hold){stopWait={label:label,port:h.port,generation:h.generation};tell(label+t('annulation envoyée, attente de l’arrêt…'),'sent');confirmStop();}},
      function(e){if(!hold)tell(label+refusal(e)+' '+t('Sans maintien, le serveur annule lui-même le jog après 250 ms.'),'uncertain');});
    return true;
  }
  function confirmStop(){
    var w=stopWait;if(!w||hold||stepping)return;
    var m=motion(),a=String(machine&&machine.activeState||'');
    // The same controller and board start as the jog stopped (another one at rest proves nothing).
    if(!live()||machine.port!==w.port||machine.generation!==w.generation||!m||m.jog||m.cancelling||/^jog/i.test(a))return;
    stopWait=null;tell(w.label+t('arrêté.'),'confirmed');
  }
  function keepalive(h){
    if(hold!==h)return;
    if(!live()){stopHold(t('suivi interrompu'));return;}
    // The held button hidden, covered by a sheet or a dialog (inert), or Préparer left: stop.
    if(!shown()||locked()||typeof h.button.getClientRects==='function'&&h.button.getClientRects().length===0||inert(h.button)){stopHold(t('bouton masqué'));return;}
    if(h.inflight>=2)return;
    h.inflight++;
    post({operation:'jog-keepalive',jogId:h.jogId}).then(function(k){
      h.inflight--;if(hold!==h)return;
      if(!k||k.active!==true){
        // The server ended the jog (bound reached, refused, cancelled): no more keepalives.
        hold=null;clearInterval(h.timer);h.timer=null;quietUntil=now()+REPEAT_GUARD_MS;
        tell(msg(k&&k.message?k.message:t('Déplacement terminé ou annulé')),'failed');
      }
    },function(e){h.inflight--;if(hold!==h)return;var text=refusal(e);stopHold(t('maintien refusé'));tell(text,e&&e.uncertain?'uncertain':'failed');});
  }
  function press(b,e){
    if(mode!=='hold')return;
    if(e&&e.preventDefault)e.preventDefault();
    if(e&&typeof e.button==='number'&&e.button!==0)return;
    if(hold||stepping||now()<quietUntil||!usable(b))return;
    var axis=b.getAttribute('data-axis'),direction=Number(b.getAttribute('data-dir'));
    if(AXES.indexOf(axis)<0||(direction!==1&&direction!==-1))return;
    var why=moveReason(axis);if(why){tell(why,'failed');return;}
    stopWait=null;
    var h={id:++seq,axis:axis,direction:direction,button:b,pointerId:e&&e.pointerId,jogId:null,timer:null,inflight:0,port:machine.port,generation:machine.generation};
    hold=h;
    try{if(b.setPointerCapture&&h.pointerId!==undefined)b.setPointerCapture(h.pointerId);}catch(_){}
    tell(axis+dir(direction)+t(' · continu · ')+feed+' mm/min'+t(' : envoi…'),'sent');
    post({operation:'jog-start',axis:axis,direction:direction,feed:feed}).then(function(r){
      if(hold!==h){if(r&&r.jogId)post({operation:'jog-stop',jogId:r.jogId,port:h.port}).catch(noop);return;}
      h.jogId=r&&r.jogId;
      tell(axis+dir(direction)+t(' · continu : en cours, relâchez pour arrêter.'),'confirmed');
      var period=Math.min(KEEPALIVE_MAX_MS,r&&r.keepalivePeriodMs>0?r.keepalivePeriodMs:KEEPALIVE_MAX_MS);
      h.timer=setInterval(function(){keepalive(h);},period);
    },function(e){
      if(hold===h){hold=null;quietUntil=now()+REPEAT_GUARD_MS;}
      // No answer (network error, 30 s timeout): the jog may have started on the server. A
      // precautionary jog-stop of this port goes at once (without jogId the server stops any
      // jog of ours), rather than relying on its 250 ms keepalive timeout alone.
      if(e&&e.uncertain)post({operation:'jog-stop',port:h.port}).catch(noop);
      tell(refusal(e),e&&e.uncertain?'uncertain':'failed');
    });
  }
  function release(b,why){if(hold&&hold.button===b)stopHold(why);}

  // ---- Discrete step ----
  // A step sent stays followed until a report shows the machine free again: until then, leaving
  // Préparer, the lock, a hidden page, the stream or the pilot lost cancel it (the server watches
  // a step only for the function disabled and the stream closed).
  function stopStep(why){
    var s=stepping;if(!s||s.stopped)return false;
    s.stopped=true;
    post({operation:'jog-stop',port:s.port}).catch(noop);
    tell(s.label+t('arrêt envoyé')+(why?' ('+why+')':'')+'.','uncertain');
    return true;
  }
  function stepOver(){var s=stepping;if(!s)return;stepping=null;quietUntil=now()+REPEAT_GUARD_MS;render();}
  function tapStep(b){
    // The click after a press begun in « Continu » (the mode changed meanwhile): never a step.
    var held=downHold.indexOf(b);if(held>=0){downHold.splice(held,1);return;}
    if(mode!=='step'||hold||stepping||now()<quietUntil||!usable(b))return;
    var axis=b.getAttribute('data-axis'),direction=Number(b.getAttribute('data-dir'));
    if(AXES.indexOf(axis)<0||(direction!==1&&direction!==-1))return;
    var why=moveReason(axis);if(why){tell(why,'failed');return;}
    stopWait=null;
    var s={port:machine.port,step:step,feed:feed,label:axis+dir(direction)+' · '+step+' mm · '+feed+' mm/min : ',answered:false,stopped:false,until:0};
    stepping=s;
    tell(s.label+t('envoi…'),'sent');
    post({operation:'jog',axis:axis,direction:direction,step:step,feed:feed}).then(function(){
      if(stepping!==s)return;
      // Stopped while the request was on its way: its jog-stop may have reached the server first
      // (« Aucun déplacement en cours ») and this step started after it: stopped again now.
      if(s.stopped)post({operation:'jog-stop',port:s.port}).catch(noop);
      // Sent: the machine runs it; its end is read on the positions, never announced here.
      s.answered=true;s.until=now()+60000*s.step/s.feed+STEP_MARGIN_MS;
      if(!s.stopped)tell(s.label+t('envoyé à la machine.'),'confirmed');
    },function(e){
      if(stepping!==s)return;
      tell(s.label+refusal(e),e&&e.uncertain?'uncertain':'failed');
      // No answer: the step may run; it stays followed (and stoppable) until its end.
      if(e&&e.uncertain){if(s.stopped)post({operation:'jog-stop',port:s.port}).catch(noop);s.answered=true;s.until=now()+60000*s.step/s.feed+STEP_MARGIN_MS;}else stepOver();
    });
  }
  // The step's end: a recent report shows the machine free (canJog again, no Jog), or in alarm (Grbl
  // stopped every motion); past its nominal time plus the margin, it is let go only if the server no
  // longer holds it (« Déplacement précédent non terminé »). A report too old cancels it (jog-stop) and
  // it stays followed: leaving Préparer still sends jog-stop.
  var STEP_PENDING=/^Déplacement précédent non terminé/;
  function followStep(){
    var s=stepping;if(!s||!s.answered)return;
    if(!live()||stale()){stopStep(t('rapport machine trop ancien'));return;}
    var m=motion(),a=String(machine.activeState||''),jogging=/^jog/i.test(a)||!!(m&&(m.jog||m.cancelling));
    if(jogging)return;
    if((m&&m.canJog===true)||/^alarm/i.test(a)||now()>=s.until&&m&&!STEP_PENDING.test(String(m.jogReason||'')))stepOver();
  }

  // ---- Work origin, two steps (server ticket, then confirmation here) ----
  function dropTicket(text){if(!ticket)return;ticket=null;closePanel(true);if(text)tell(text,'failed');else render();}
  // via: the visible button that relays this one (v2 summary, job-preparation.js), checked in its place.
  function askOrigin(b,via){
    if(ticket||originBusy||(via?!usable(via)||b.disabled:!usable(b)))return;
    var axes=String(b.getAttribute('data-axis')||'').toUpperCase().split('').filter(function(a){return AXES.indexOf(a)>=0;});
    if(!axes.length)return;
    var why=originReason();if(why){tell(why,'failed');return;}
    var c=controls();if(!c||typeof c.origin!=='function'){tell(t('Commandes indisponibles : rechargez la page.'),'failed');return;}
    originBusy=true;var port=machine.port,generation=machine.generation,label=t('Origine ')+axes.join(' ')+' : ';
    tell(label+t('demande de confirmation…'),'sent');
    c.origin({axes:axes}).then(function(d){
      originBusy=false;
      // Préparer left, another controller or board start meanwhile: nothing is offered.
      if(!d||!d.nonce||!machine||machine.port!==port||machine.generation!==generation||!shown()||locked()){render();return;}
      ticket={nonce:d.nonce,name:String(d.name||''),axes:axes,port:port,generation:d.generation||generation,until:now()+Math.min(15,Number(d.expiresIn)||0)*1000,
        wcs:wcs(),units:units(),wpos:machine.coordinates&&machine.coordinates.wpos||{}};
      last=null;openPanel();
    },function(e){originBusy=false;tell(label+refusal(e),e&&e.uncertain?'uncertain':'failed');});
  }
  function ticketValid(k){return !!k&&now()<k.until&&!!machine&&machine.port===k.port&&machine.generation===k.generation&&connected;}
  function confirmOrigin(){
    var k=ticket;if(!k)return;
    if(!ticketValid(k)||!shown()||locked()){dropTicket(t('Confirmation expirée ou état changé : demandez-la à nouveau.'));return;}
    // The state seen since the ticket (alarm, job, stale report, origin refused): nothing is sent.
    var why=originState();if(why){dropTicket(why);return;}
    ticket=null;closePanel(true);originBusy=true;
    var label=t('Origine ')+k.axes.join(' ')+(k.wcs?' · '+k.wcs:'')+' : ';
    tell(label+t('envoi…'),'sent');
    controls().origin({nonce:k.nonce}).then(function(){tell(t('Origine ')+k.axes.join(' ')+(k.wcs?' · '+k.wcs:'')+t(' réglée.'),'confirmed');},
      function(e){tell(label+refusal(e),e&&e.uncertain?'uncertain':'failed');}).then(function(){originBusy=false;render();});
  }

  // ---- The confirmation dialog (the only window left of the real moves) ----
  function build(){
    var panel=make('div','job-dialog real-motion-ticket','real-motion-ticket');panel.hidden=true;
    panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','real-motion-ticket-title');
    var card=make('div','job-dialog-card');panel.appendChild(card);
    card.appendChild(make('h2','','real-motion-ticket-title',t('Définir l’origine de travail')));
    var plan=make('p','','real-motion-ticket-plan'),name=make('p','','real-motion-ticket-name'),left=make('p','','real-motion-ticket-left');
    card.appendChild(plan);card.appendChild(name);card.appendChild(left);
    var actions=make('div','job-dialog-actions'),cancel=make('button','t-btn t-btn--ghost','real-motion-origin-cancel',t('Annuler')),confirm=make('button','t-btn t-btn--warn','real-motion-origin-confirm');
    actions.appendChild(cancel);actions.appendChild(confirm);card.appendChild(actions);
    document.body.appendChild(panel);
    cancel.addEventListener('click',function(){dropTicket(t('Définition d’origine annulée : rien n’a été envoyé.'));});
    confirm.addEventListener('click',confirmOrigin);
    panel.addEventListener('keydown',function(e){
      // An overlay opened above makes this one inert: the keys are its own.
      if(panel.hidden||(window.CNCStripGuard&&window.CNCStripGuard.covered(panel)))return;
      if(e.key==='Escape'){if(e.preventDefault)e.preventDefault();dropTicket(t('Définition d’origine annulée : rien n’a été envoyé.'));}
      else if(e.key==='Tab'&&window.CNCStripGuard)window.CNCStripGuard.tab(e,panel,[cancel,confirm].filter(function(n){return !n.disabled;}));
    });
    return {panel:panel,plan:plan,name:name,left:left,cancel:cancel,confirm:confirm};
  }
  function openPanel(){
    if(!dialog)dialog=build();
    if(!dialog.panel.hidden){render();return;}
    returnTo=document.activeElement;
    // Pause / Arrêter of the strip stay usable over the dialog (strip-guard.js, U5), and the padlock:
    // locking the screen closes it (V3), as it closed the former real move panel.
    if(window.CNCStripGuard){var padlock=document.getElementById('t-lock');restore=window.CNCStripGuard.isolate(dialog.panel,padlock?[padlock]:[]);}
    else{var entries=Array.prototype.filter.call(document.body.children||[],function(n){return n!==dialog.panel&&n.id!=='real-banner'&&!/^(SCRIPT|LINK|STYLE)$/.test(n.tagName);}).map(function(n){var e={node:n,inert:n.inert};n.inert=true;return e;});restore=function(){entries.forEach(function(e){e.node.inert=e.inert;});};}
    dialog.panel.hidden=false;render();
    if(dialog.cancel.focus)dialog.cancel.focus();
  }
  // Closes the origin dialog (its ticket is dropped, nothing is sent) and stops what moves.
  function closePanel(restoreFocus){
    if(!dialog||dialog.panel.hidden){ticket=null;return;}
    ticket=null;dialog.panel.hidden=true;
    var back=restore;restore=null;if(typeof back==='function')back();
    var target=returnTo;returnTo=null;
    if(restoreFocus!==false&&target&&target.isConnected&&!target.hidden&&typeof target.focus==='function')target.focus({preventScroll:true});
  }
  function renderTicket(){
    if(!dialog||dialog.panel.hidden)return;
    var k=ticket;if(!k)return;
    // The work position (the Travail column) the origin sets to 0, never the machine position.
    var co=machine&&machine.coordinates&&machine.coordinates.wpos||k.wpos;
    setText(dialog.plan,(k.wcs?t('Repère ')+k.wcs+' · ':'')+k.axes.map(function(a){return a+' '+fmt(co[a.toLowerCase()])+' → 0';}).join(' · ')+(k.units?' · '+k.units:'')+'. '+t('Aucun axe ne bouge.'));
    setText(dialog.name,msg(k.name));
    setText(dialog.left,t('Confirmation valable ')+Math.max(0,Math.ceil((k.until-now())/1000))+' s · '+t('Arrêter reste disponible dans le bandeau.'));
    setText(dialog.confirm,t('Confirmer l’origine ')+k.axes.join(' ')+(k.wcs?' · '+k.wcs:''));
  }

  // ---- The static controls of Préparer ----
  var arrows=list(screen,'.jog'),stepBox=$('steps'),feedBox=$('feeds'),zeros=list(screen,'[data-origin]');
  var status=$('jog-msg'),feedback=$('jog-feedback'),controller=$('jog-controller'),limits=$('jog-feed-limits'),speed=$('ks-jog-settings'),mid=screen.querySelector('.pad-mid');
  var frameLabel=null,title=screen.querySelector('.ks-motion-coordinates h2');
  if(title){frameLabel=make('span','coordinate-frame','coordinate-frame-label','');title.appendChild(frameLabel);}
  // « Relire les réglages » where the refusal shows (CNCjs forgets $$ after a board restart).
  var reread=make('button','ks-secondary','jog-read-settings',t('Relire les réglages ($$)'));reread.hidden=true;
  var host=screen.querySelector('.ks-preparation-actions')||screen.querySelector('.ks-panel-intro');if(host)host.appendChild(reread);
  reread.addEventListener('click',function(){
    var c=controls();if(!usable(reread)||settingsBusy||!c||typeof c.readSettings!=='function')return;
    settingsBusy=true;tell(t('Relecture des réglages de la carte ($$)…'),'sent');
    c.readSettings().then(function(){tell(t('Réglages relus : vérifiez que les commandes sont de nouveau disponibles.'),'confirmed');},
      function(e){tell(refusal(e),e&&e.uncertain?'uncertain':'failed');}).then(function(){settingsBusy=false;render();});
  });
  var stepButtons=list(stepBox,'button');
  stepButtons.forEach(function(b){b.addEventListener('click',function(){
    if(hold||stepping||!usable(b))return;
    var v=b.getAttribute('data-step');
    if(v==='hold'){if(!on('jogContinuous'))return;mode='hold';}
    else{var n=Number(v);if(!(n>0))return;mode='step';step=n;}
    last=null;render();
  });});
  arrows.forEach(function(b){
    b.addEventListener('pointerdown',function(e){var i=downHold.indexOf(b);if(mode==='hold'){if(i<0)downHold.push(b);}else if(i>=0)downHold.splice(i,1);press(b,e);});
    ['pointerup','pointercancel','pointerleave','lostpointercapture'].forEach(function(name){b.addEventListener(name,function(){release(b,name);});});
    b.addEventListener('click',function(){tapStep(b);});
    b.addEventListener('contextmenu',function(e){if(e&&e.preventDefault)e.preventDefault();});
  });
  zeros.forEach(function(b){b.addEventListener('click',function(){askOrigin(b);});});
  var feedButtons=[];
  function feedChoices(){
    var m=motion(),low=Infinity;
    AXES.forEach(function(a){var f=m&&m.maxFeed&&m.maxFeed[a];if(f&&typeof f.max==='number'&&f.max>0)low=Math.min(low,f.max);});
    if(low===Infinity)low=500;
    var values=FEEDS.filter(function(v){return v<=low;});
    return values.length?values:[Math.max(1,Math.floor(low))];
  }
  function syncFeeds(values){
    if(!feedBox||feedButtons.map(function(b){return b.getAttribute('data-feed');}).join()===values.join())return;
    feedBox.textContent='';feedButtons=[];
    values.forEach(function(v){
      var b=make('button','step','',String(v));b.setAttribute('data-feed',String(v));
      b.addEventListener('click',function(){if(hold||stepping)return;feed=v;render();});
      feedBox.appendChild(b);feedButtons.push(b);
    });
  }

  // ---- Rendering: only what changed, only while Préparer is shown ----
  function render(){
    if(disposed)return;
    if(ticket&&!ticketValid(ticket))dropTicket(t('Confirmation expirée ou état changé : demandez-la à nouveau.'));
    // Before the first state event the page's own « Machine non prête. » and disabled controls stay.
    if(!shown()||received===null)return;
    var m=motion();
    // « Continu » given up only when the server says so (not while its state is momentarily missing).
    if(mode==='hold'&&caps()&&!on('jogContinuous')&&!hold)mode='step';
    var allowed=cap('jog')&&Array.isArray(cap('jog').steps)?cap('jog').steps:null;
    if(allowed&&allowed.indexOf(step)<0){var firstStep=[0.1,1,10].filter(function(v){return allowed.indexOf(v)>=0;})[0];if(firstStep)step=firstStep;}
    var feeds=feedChoices();if(feeds.indexOf(feed)<0)feed=feeds.filter(function(v){return v<=250;}).pop()||feeds[0];
    syncFeeds(feeds);
    var busy=!!hold||!!stepping;
    stepButtons.forEach(function(b){
      var v=b.getAttribute('data-step'),isHold=v==='hold';
      prop(b,'hidden',isHold?!on('jogContinuous'):!!allowed&&allowed.indexOf(Number(v))<0);
      var pressed=isHold?mode==='hold':mode==='step'&&Number(v)===step;
      klass(b,'active',pressed);attr(b,'aria-pressed',String(pressed));prop(b,'disabled',busy);
    });
    feedButtons.forEach(function(b){var pressed=Number(b.getAttribute('data-feed'))===feed;klass(b,'active',pressed);attr(b,'aria-pressed',String(pressed));prop(b,'disabled',busy);});
    var mf=m&&m.maxFeed||{};
    setText(limits,t('Avance max X / Y / Z : ')+AXES.map(function(a){return mf[a]&&mf[a].max?mf[a].max:'—';}).join(' / ')+' mm/min'+(AXES.some(function(a){return mf[a]&&mf[a].source==='fallback';})?t(' · limite prudente ($11x inconnu)'):''));
    setText(speed,t('Vitesse · ')+feed+' mm/min…');
    setText(mid,mode==='hold'?t('continu'):step+' mm');
    // The arrows: a held button is never disabled (its release must reach it); the others wait.
    var reasons={},all=true;
    arrows.forEach(function(b){
      var held=!!(hold&&hold.button===b),axis=b.getAttribute('data-axis'),why=held?'':moveReason(axis);
      if(!held&&!(axis in reasons)){reasons[axis]=why;if(!why)all=false;}
      prop(b,'disabled',!held&&!!why);attr(b,'title',why||null);attr(b,'data-held',String(held));
    });
    var oz=originReason();
    zeros.forEach(function(b){prop(b,'disabled',!!oz);attr(b,'title',oz||null);});
    prop(reread,'hidden',!(machine&&connected&&settingsMissing())||busy);prop(reread,'disabled',settingsBusy||!live()||machine.activeState!=='Idle'||machine.workflow!=='idle');
    attr(reread,'title',reread.disabled&&!settingsBusy?(alarmed()?rereadInAlarm():t('La machine doit être au repos (Idle), sans commande en attente.')):null);
    // The status line: what to do now, or what the arrows do.
    var g=jogReason(),text;
    if(m&&m.cancelUnconfirmed)text=g;
    else if(hold)text=t('Déplacement continu ')+hold.axis+dir(hold.direction)+t(' : relâchez pour arrêter.');
    else if(g)text=g;
    else if(ours())text=ours();
    else if(all&&reasons.X)text=reasons.X;
    else text=t('Les flèches déplacent la machine · ')+(mode==='hold'?t('continu · ')+feed+' mm/min'+t(' · relâchez pour arrêter'):t('pas ')+step+' mm · '+feed+' mm/min');
    setText(status,text);
    setText(controller,machine&&machine.port?t('Contrôleur suivi : ')+machine.port:t('Contrôleur suivi : aucun'));
    var f=last;
    if(!f&&machine&&connected&&machine.homed!==true&&!g)f={text:t('Machine non référencée : pas de 1 mm au plus, pas de continu. Prise d’origine dans Machine.'),state:''};
    setText(feedback,f?f.text:'');attr(feedback,'data-state',f&&f.state?f.state:null);
    setText(frameLabel,wcs()?' · '+wcs()+(units()?' · '+units():''):units()?' · '+units():'');
    renderTicket();
  }
  function viewClock(){
    var want=shown()&&!disposed;
    if(want&&clock===null)clock=setInterval(function(){followStep();render();},1000);
    else if(!want&&clock!==null){clearInterval(clock);clock=null;}
  }
  window.addEventListener('cnc-job-status',function(e){
    var d=e&&e.detail;if(!d||d.simulation)return;
    var next=d.machine||null;
    // Another controller, another board start, or the stream gone: the held jog stops now.
    var lost=!next||!d.transportConnected||(machine&&(next.port!==machine.port||next.generation!==machine.generation));
    if(hold&&(lost||next.port!==hold.port))stopHold(t('suivi interrompu'));
    var other=!!(d.pilot&&d.pilot.state==='other');
    if(stepping&&(lost||other||!next.fresh))stopStep(other?t('pilotage pris par un autre appareil'):lost?t('suivi interrompu'):t('rapport machine trop ancien'));
    machine=next;connected=!!d.transportConnected;pilot=d.pilot||null;received=now();observedAt=typeof d.observedAt==='number'?d.observedAt:null;
    // The function switched off on the server: the held jog stops now (the server cancels it too).
    if(hold&&caps()&&!on('jogContinuous'))stopHold(t('fonction désactivée'));
    // A jog the server ended by itself (bound, alarm, keepalive): said once, in its own words.
    var lj=motion()&&motion().lastJog;
    if(lj&&lj.at!==lastJogAt){if(!first&&lj.reason&&lj.reason!=='operator'&&lj.message)tell(t('Déplacement arrêté : ')+msg(lj.message)+'.','failed');lastJogAt=lj.at;}
    first=false;
    followStep();confirmStop();render();
  });
  window.addEventListener('blur',function(){stopHold(t('fenêtre quittée'));stopStep(t('fenêtre quittée'));});
  // Another press anywhere while a button is held stops the jog (a second finger may open a sheet).
  document.addEventListener('pointerdown',function(e){var n=e&&e.target;if(hold&&n!==hold.button&&!(hold.button.contains&&n&&hold.button.contains(n)))stopHold(t('autre appui'));},true);
  // Arrêter (strip, Suivi or preview viewer) during a hold also ends the keepalives here, in the
  // same tap (capture, before the stop is relayed): the jog never waits for the server's answer.
  document.addEventListener('click',function(e){var n=e&&e.target;if(hold&&n&&typeof n.closest==='function'&&n.closest('#t-stop,#job-stop,#home-job-stop,#preview-job-stop'))stopHold(t('arrêt demandé'));},true);
  document.addEventListener('visibilitychange',function(){if(document.hidden){stopHold(t('page masquée'));stopStep(t('page masquée'));closePanel(false);}viewClock();render();});
  window.addEventListener('cnc-screen-change',function(){stopHold(t('écran changé'));stopStep(t('écran changé'));closePanel(false);viewClock();render();});
  // Locking the screen closes the origin dialog (V3): a held jog stops at once.
  window.addEventListener('cnc-screen-lock',function(e){if(e&&e.detail){stopHold(t('écran verrouillé'));closePanel(false);stopStep(t('écran verrouillé'));}});
  // The page leaving: the request may not get out, the stream closing stops the jog on the server.
  window.addEventListener('pagehide',function(e){stopHold(t('page quittée'));stopStep(t('page quittée'));if(e&&e.persisted)return;disposed=true;if(clock!==null){clearInterval(clock);clock=null;}});
  // « Zéro XYZ » (XY in laser) asked from the v2 summary (#pv2-tool-zero, job-preparation.js) while its own row
  // is not shown: the same ticket and confirmation, the visible button checked in place of the hidden one.
  document.addEventListener('click',function(e){var n=e&&e.target,via=n&&typeof n.closest==='function'?n.closest('#pv2-tool-zero'):null,b=$('jog-zero-xyz');if(via&&b)askOrigin(b,via);});
  window.cncRealMotion={holding:function(){return !!hold;},stop:function(){var a=stopHold(t('arrêt demandé')),b=stopStep(t('arrêt demandé'));return a||b;}};
  viewClock();render();
})();
