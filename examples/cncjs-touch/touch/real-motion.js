/* Real jogging and work origins (F1, EXPERIMENTAL). Shown only when the server says the
 * capability is enabled (snapshot `capabilities.jog.enabled` or `jogContinuous.enabled`, which
 * needs `touch.motion.enabled` in .cncrc after the supervised hardware validation). Otherwise
 * nothing appears but a note in the origin help sheet with the server's reason.
 *
 * The dry-run check of dry-motion.js stays apart: its arrows never move the machine. This panel
 * has its own arrows and sends `POST touch-job {action:'motion'}` through job-controls.js:
 *   - steps: one `jog` per tap (0.01 / 0.1 / 1 / 10 mm), one request at a time;
 *   - hold: `jog-start` on pointerdown, `jog-keepalive` every ≤ 150 ms while the finger stays,
 *     `jog-stop` at once on pointerup / pointercancel / pointerleave / lostpointercapture, window
 *     blur, hidden page, screen change, closing the panel, or the event stream lost. A jog is never
 *     started again by itself (reconnection, new state): only a new press starts one;
 *   - origin: `prepare set-origin` gives a ticket (offset, axis, G10 line), then the operator
 *     confirms it here; Pause / Arrêter of the status strip stay usable (the panel starts below it).
 * What is shown: the request sent, the server's answer (accepted or refused, with its reason) and
 * the state observed in the next reports (position reported by the controller, never computed). */
(function () {
  'use strict';
  var uiLocale=window.cncI18n||{t:function(s){return s;},html:function(s){return s;}};
  var t=uiLocale.t,msg=uiLocale.message||uiLocale.t;
  if(!document.body||document.body.getAttribute('data-simulation')==='true')return;
  var STEPS=[0.01,0.1,1,10],FEEDS=[100,250,500,1000,2000],AXES=['X','Y','Z'];
  // Keepalive period: the server's (100 ms), never more than 150 ms (server timeout 250 ms).
  var KEEPALIVE_MAX_MS=150;
  // After a release or a step, a new press is ignored this long (double tap); a stop never waits.
  var REPEAT_GUARD_MS=300;
  var machine=null,connected=false,pilot=null,mode='step',step=0.1,feed=250,hold=null,stepping=false,quietUntil=0;
  var ticket=null,originBusy=false,ui=null,note=null,returnTo=null,background=[],clock=null,disposed=false,seq=0;
  function noop(){}
  function make(tag,cls,id,text){var n=document.createElement(tag);if(cls)n.className=cls;if(id)n.id=id;if(text!==undefined)n.textContent=text;if(tag==='button')n.type='button';return n;}
  function setText(n,v){if(n&&n.textContent!==v)n.textContent=v;}
  function prop(n,k,v){if(n&&n[k]!==v)n[k]=v;}
  function attr(n,k,v){if(n&&n.getAttribute(k)!==v)n.setAttribute(k,v);}
  function caps(){return machine&&machine.capabilities&&typeof machine.capabilities==='object'?machine.capabilities:{};}
  function cap(name){var c=caps()[name];return c&&typeof c==='object'?c:null;}
  function on(name){var c=cap(name);return !!(c&&c.enabled===true);}
  function allowed(){return on('jog')||on('jogContinuous');}
  function motion(){return machine&&machine.motion&&typeof machine.motion==='object'?machine.motion:null;}
  function controls(){return window.cncJobControls||null;}
  function post(body){var c=controls();if(!c||typeof c.motion!=='function')return Promise.reject(new Error(t('Commandes indisponibles : rechargez la page.')));return c.motion(body);}
  function live(){return !!(machine&&connected&&machine.fresh);}
  function fmt(v){var n=typeof v==='string'&&v.trim()!==''?Number(v):v;return typeof n==='number'&&isFinite(n)?n.toFixed(3):'—';}
  function units(){var o=machine&&machine.operator;return o&&o.reportUnits==='mm'?'mm':o&&o.reportUnits==='in'?t('pouces'):t('unité inconnue');}
  function frame(){var o=machine&&machine.operator;return o&&typeof o.wcs==='string'&&o.wcs?o.wcs:t('repère inconnu');}
  function dir(d){return d>0?'+':'−';}

  // ---- What was sent, what the server answered, what the reports show ----
  function sent(text){if(ui)setText(ui.sent,t('Demande envoyée : ')+text);}
  function answer(text,state){if(!ui)return;setText(ui.answer,text);attr(ui.answer,'data-state',state||'');}
  function refusal(e){return (e&&e.uncertain?t('Sans réponse du serveur : '):t('Refusé par le serveur : '))+msg(e&&e.message?e.message:t('raison inconnue'));}
  function observed(){
    if(!machine)return t('État observé : aucun rapport.');
    var m=motion(),parts=[t('État observé : ')+(machine.activeState||t('inconnu'))];
    if(m&&m.jog)parts.push(t('jog du serveur en cours ')+m.jog.axis+dir(m.jog.direction)+' ('+t('au plus ')+m.jog.distanceMm+' mm)');
    if(m&&m.cancelling)parts.push(t('annulation (0x85) en cours de confirmation'));
    if(m&&m.cancelUnconfirmed)parts.push(t('ANNULATION NON CONFIRMÉE : utilisez l’arrêt physique si la machine bouge encore'));
    if(m&&m.lastJog&&m.lastJog.message)parts.push(t('dernier jog : ')+msg(m.lastJog.message));
    if(m&&m.lastOrigin)parts.push(m.lastOrigin.failed?t('dernière origine : échec — ')+msg(m.lastOrigin.failed):t('dernière origine : ')+m.lastOrigin.axes.join(' ')+' '+m.lastOrigin.wcs+t(' réglée'));
    return parts.join(' · ');
  }

  // ---- Why a move cannot be sent now ('' when it can) ----
  function moveReason(axis){
    if(!machine||!connected)return t('Suivi continu interrompu : déplacement réel bloqué.');
    if(!machine.fresh)return t('État machine trop ancien : attendre un rapport récent.');
    if(mode==='hold'&&!on('jogContinuous'))return msg((cap('jogContinuous')||{}).reason)||t('Maintien continu non activé.');
    if(mode==='step'&&!on('jog'))return msg((cap('jog')||{}).reason)||t('Pas réels non activés.');
    var m=motion();if(!m)return t('Serveur sans état de déplacement : rechargez la page.');
    if(!m.canJog)return msg(m.jogReason)||t('Déplacement réel indisponible.');
    if(mode==='hold'&&m.continuousReason&&m.continuousReason[axis])return msg(m.continuousReason[axis]);
    if(ticket||originBusy)return t('Confirmation d’origine en attente : confirmez ou annulez-la d’abord.');
    return '';
  }
  function originReason(){
    if(!machine||!connected)return t('Suivi continu interrompu : déplacement réel bloqué.');
    if(!on('setOrigin'))return msg((cap('setOrigin')||{}).reason)||t('Origine réelle non activée.');
    var m=motion();if(!m)return t('Serveur sans état de déplacement : rechargez la page.');
    if(!m.canSetOrigin)return msg(m.setOriginReason)||t('Origine réelle indisponible.');
    if(hold||stepping)return t('Déplacement en cours : attendez le repos.');
    return '';
  }

  // ---- Continuous jog while held ----
  function stopHold(why){
    var h=hold;if(!h)return false;
    hold=null;if(h.timer)clearInterval(h.timer);h.timer=null;
    quietUntil=Date.now()+REPEAT_GUARD_MS;
    try{if(h.button.releasePointerCapture&&h.pointerId!==undefined)h.button.releasePointerCapture(h.pointerId);}catch(_){}
    // Sent at once, with the jog's id once known (the server stops any jog of ours without it).
    var body={operation:'jog-stop',port:h.port};if(h.jogId)body.jogId=h.jogId;
    sent(t('arrêt du déplacement (jog-stop)')+(why?' · '+why:''));answer(t('Arrêt envoyé…'),'sent');
    post(body).then(function(r){if(!hold)answer(t('Arrêt accepté : ')+msg(r&&r.message||''),'confirmed');},
      function(e){if(!hold)answer(refusal(e)+' '+t('Sans maintien, le serveur annule lui-même le jog après 250 ms.'),'uncertain');});
    render();return true;
  }
  function keepalive(h){
    if(hold!==h)return;
    if(!live()){stopHold(t('suivi interrompu'));return;}
    if(h.inflight>=2)return;
    h.inflight++;
    post({operation:'jog-keepalive',jogId:h.jogId}).then(function(k){
      h.inflight--;if(hold!==h)return;
      if(!k||k.active!==true){
        // The server ended the jog (bound reached, refused, cancelled): no more keepalives.
        hold=null;clearInterval(h.timer);h.timer=null;quietUntil=Date.now()+REPEAT_GUARD_MS;
        answer(msg(k&&k.message?k.message:t('Déplacement terminé ou annulé')),'failed');render();
      }
    },function(e){h.inflight--;if(hold!==h)return;var text=refusal(e);stopHold(t('maintien refusé'));answer(text,e&&e.uncertain?'uncertain':'failed');});
  }
  function press(b,e){
    if(mode!=='hold')return;
    if(e&&e.preventDefault)e.preventDefault();
    if(e&&typeof e.button==='number'&&e.button!==0)return;
    if(hold||stepping||Date.now()<quietUntil)return;
    var axis=b.getAttribute('data-axis'),direction=Number(b.getAttribute('data-dir'));
    var why=moveReason(axis);if(why){answer(why,'failed');render();return;}
    var h={id:++seq,axis:axis,direction:direction,button:b,pointerId:e&&e.pointerId,jogId:null,timer:null,inflight:0,port:machine.port};
    hold=h;
    try{if(b.setPointerCapture&&h.pointerId!==undefined)b.setPointerCapture(h.pointerId);}catch(_){}
    sent(axis+dir(direction)+t(' en maintien · ')+feed+' mm/min');answer(t('En attente du serveur…'),'sent');render();
    post({operation:'jog-start',axis:axis,direction:direction,feed:feed}).then(function(r){
      if(hold!==h){if(r&&r.jogId)post({operation:'jog-stop',jogId:r.jogId,port:h.port}).catch(noop);return;}
      h.jogId=r&&r.jogId;
      answer(t('Accepté par le serveur : ')+msg(r&&r.message||''),'confirmed');
      var period=Math.min(KEEPALIVE_MAX_MS,r&&r.keepalivePeriodMs>0?r.keepalivePeriodMs:KEEPALIVE_MAX_MS);
      h.timer=setInterval(function(){keepalive(h);},period);
      render();
    },function(e){
      if(hold===h){hold=null;quietUntil=Date.now()+REPEAT_GUARD_MS;}
      // No answer (network error, 30 s timeout): the jog may have started on the server. A
      // precautionary jog-stop of this port goes at once (without jogId the server stops any
      // jog of ours), rather than relying on its 250 ms keepalive timeout alone.
      if(e&&e.uncertain)post({operation:'jog-stop',port:h.port}).catch(noop);
      answer(refusal(e),e&&e.uncertain?'uncertain':'failed');render();
    });
  }
  function release(b,why){if(hold&&hold.button===b)stopHold(why);}

  // ---- Discrete step ----
  function tapStep(b){
    if(mode!=='step'||hold||stepping||Date.now()<quietUntil)return;
    var axis=b.getAttribute('data-axis'),direction=Number(b.getAttribute('data-dir'));
    var why=moveReason(axis);if(why){answer(why,'failed');render();return;}
    stepping=true;var s=step,f=feed;
    sent(axis+dir(direction)+t(' · pas ')+s+' mm · '+f+' mm/min');answer(t('En attente du serveur…'),'sent');render();
    post({operation:'jog',axis:axis,direction:direction,step:s,feed:f}).then(function(r){answer(t('Accepté par le serveur : ')+msg(r&&r.message||''),'confirmed');},
      function(e){answer(refusal(e),e&&e.uncertain?'uncertain':'failed');})
      .then(function(){stepping=false;quietUntil=Date.now()+REPEAT_GUARD_MS;render();});
  }

  // ---- Work origin, two steps (server ticket, then confirmation here) ----
  function dropTicket(text){if(!ticket)return;ticket=null;if(text)answer(text,'failed');render();}
  function askOrigin(axis){
    if(ticket||originBusy)return;
    var why=originReason();if(why){answer(why,'failed');render();return;}
    var c=controls();if(!c||typeof c.origin!=='function'){answer(t('Commandes indisponibles : rechargez la page.'),'failed');return;}
    originBusy=true;var port=machine.port,generation=machine.generation;
    sent(t('préparation de l’origine ')+axis+' · '+frame());answer(t('En attente du serveur…'),'sent');render();
    c.origin({axes:[axis]}).then(function(d){
      originBusy=false;
      if(!ui||ui.panel.hidden||!machine||machine.port!==port||!d||!d.nonce){render();return;}
      ticket={nonce:d.nonce,name:String(d.name||''),axis:axis,port:port,generation:d.generation||generation,until:Date.now()+Math.min(15,Number(d.expiresIn)||0)*1000};
      answer(t('Ticket reçu du serveur : vérifiez puis confirmez.'),'confirmed');render();
    },function(e){originBusy=false;answer(refusal(e),e&&e.uncertain?'uncertain':'failed');render();});
  }
  function confirmOrigin(){
    var k=ticket;if(!k)return;
    if(Date.now()>=k.until||!machine||machine.port!==k.port||machine.generation!==k.generation||!connected){dropTicket(t('Confirmation expirée ou état changé : demandez-la à nouveau.'));return;}
    ticket=null;originBusy=true;
    sent(t('confirmation : ')+msg(k.name));answer(t('En attente du serveur…'),'sent');render();
    controls().origin({nonce:k.nonce}).then(function(r){answer(t('Accepté par le serveur : ')+msg(r&&r.message||''),'confirmed');},
      function(e){answer(refusal(e),e&&e.uncertain?'uncertain':'failed');}).then(function(){originBusy=false;render();});
  }

  // ---- Panel ----
  function segment(label,values,current,choose,format){
    var box=make('div','real-motion-seg'),title=make('span','real-motion-label','',label),row=make('div','real-motion-choices');box.appendChild(title);box.appendChild(row);
    var buttons=[];
    function sync(list,value){
      row.textContent='';buttons=[];
      list.forEach(function(v){var b=make('button','real-motion-choice','',format?format(v):String(v));b.setAttribute('data-value',String(v));b.addEventListener('click',function(){if(hold||stepping)return;choose(v);render();});row.appendChild(b);buttons.push(b);});
      mark(value);
    }
    function mark(value){buttons.forEach(function(b){attr(b,'aria-pressed',String(b.getAttribute('data-value')===String(value)));});}
    sync(values,current);
    return {node:box,sync:sync,mark:mark,buttons:function(){return buttons;}};
  }
  function build(){
    var host=document.querySelector('#screen-jog .ks-preparation-actions')||document.querySelector('#screen-jog .ks-panel-intro');
    if(!host)return null;
    var entry=make('button','ks-secondary real-motion-entry','real-motion-open');
    entry.appendChild(make('span','',null,t('Déplacement réel')));entry.appendChild(make('span','tag real-motion-tag',null,t('EXPÉRIMENTAL')));
    entry.hidden=true;host.appendChild(entry);
    var panel=make('div','job-dialog real-motion','real-motion');panel.hidden=true;
    panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','real-motion-title');
    var card=make('div','job-dialog-card real-motion-card');panel.appendChild(card);
    var head=make('header','real-motion-head'),title=make('h2','','real-motion-title',t('Déplacement réel'));title.appendChild(make('span','tag real-motion-tag',null,t('EXPÉRIMENTAL')));
    var close=make('button','t-btn','real-motion-close',t('Fermer ×'));var warning=make('p','real-motion-warning','real-motion-warning');
    head.appendChild(title);head.appendChild(warning);head.appendChild(close);card.appendChild(head);
    var cols=make('div','real-motion-cols'),left=make('div','real-motion-left'),right=make('div','real-motion-right');cols.appendChild(left);cols.appendChild(right);card.appendChild(cols);
    var where=make('p','real-motion-frame','real-motion-frame');left.appendChild(where);
    // One column per axis: machine and work positions as reported, then the origin of that axis.
    var table=make('table','real-motion-pos','real-motion-pos'),rows={},originButtons={};
    var hr=make('tr'),mr=make('tr'),wr=make('tr'),origin=make('tr','real-motion-origin','real-motion-origin');
    hr.appendChild(make('th'));mr.appendChild(make('th','',null,t('Machine')));wr.appendChild(make('th','',null,t('Travail')));origin.appendChild(make('th','',null,t('Origine ici')));
    AXES.forEach(function(a){
      hr.appendChild(make('th','',null,a));rows[a]={m:make('td','','real-motion-m'+a.toLowerCase()),w:make('td','','real-motion-w'+a.toLowerCase())};mr.appendChild(rows[a].m);wr.appendChild(rows[a].w);
      var cell=make('td'),b=make('button','t-btn real-motion-set','real-motion-origin-'+a.toLowerCase(),a+' = 0');b.setAttribute('aria-label',t('Définir l’origine ')+a);b.title=t('Définir l’origine ')+a;
      b.addEventListener('click',function(){askOrigin(a);});cell.appendChild(b);origin.appendChild(cell);originButtons[a]=b;
    });
    [hr,mr,wr,origin].forEach(function(row){table.appendChild(row);});
    left.appendChild(table);
    var modes=segment(t('Mode'),['step','hold'],mode,function(v){if(v==='hold'&&!on('jogContinuous'))return;mode=v;},function(v){return v==='step'?t('Par pas'):t('Maintien');});
    var steps=segment(t('Pas · mm'),STEPS,step,function(v){step=v;});
    var feeds=segment(t('Avance · mm/min'),FEEDS,feed,function(v){feed=v;});
    left.appendChild(modes.node);left.appendChild(steps.node);left.appendChild(feeds.node);
    var limits=make('p','real-motion-help','real-motion-limits');left.appendChild(limits);
    var reasonLine=make('p','real-motion-reason','real-motion-reason');reasonLine.setAttribute('role','status');left.appendChild(reasonLine);
    var ticketBox=make('div','real-motion-ticket','real-motion-ticket');ticketBox.hidden=true;
    var ticketName=make('p','','real-motion-ticket-name'),ticketLeft=make('p','real-motion-help','real-motion-ticket-left');
    var ticketActions=make('div','real-motion-ticket-actions'),cancel=make('button','t-btn t-btn--ghost','real-motion-origin-cancel',t('Annuler')),confirm=make('button','t-btn t-btn--warn','real-motion-origin-confirm');
    ticketActions.appendChild(cancel);ticketActions.appendChild(confirm);ticketBox.appendChild(ticketName);ticketBox.appendChild(ticketLeft);ticketBox.appendChild(ticketActions);right.appendChild(ticketBox);
    var pad=make('div','real-motion-pad'),arrows=[];
    [[null],['Y',1],[null],['X',-1],['mid'],['X',1],[null],['Y',-1],[null]].forEach(function(cell){
      if(cell[0]==='mid'){pad.appendChild(make('span','real-motion-mid','real-motion-mid','XY'));return;}
      if(!cell[0]){pad.appendChild(make('span'));return;}
      pad.appendChild(arrow(cell[0],cell[1]));
    });
    var zpad=make('div','real-motion-zpad');zpad.appendChild(arrow('Z',1));zpad.appendChild(arrow('Z',-1));
    function arrow(a,d){
      var b=make('button','real-motion-jog','real-motion-'+a.toLowerCase()+(d>0?'p':'m'),a+dir(d));b.setAttribute('data-axis',a);b.setAttribute('data-dir',String(d));
      b.addEventListener('pointerdown',function(e){press(b,e);});
      ['pointerup','pointercancel','pointerleave','lostpointercapture'].forEach(function(name){b.addEventListener(name,function(){release(b,name);});});
      b.addEventListener('click',function(){tapStep(b);});
      b.addEventListener('contextmenu',function(e){if(e.preventDefault)e.preventDefault();});
      arrows.push(b);return b;
    }
    var padRow=make('div','real-motion-pads');padRow.appendChild(pad);padRow.appendChild(zpad);right.appendChild(padRow);
    // A pending origin takes the arrows' place: no move may change the position it is bound to.
    var status=make('div','real-motion-status');
    var pilotLine=make('p','real-motion-help','real-motion-pilot'),sentLine=make('p','real-motion-line','real-motion-sent'),answerLine=make('p','real-motion-line t-sent','real-motion-answer'),seen=make('p','real-motion-line','real-motion-observed');
    answerLine.setAttribute('role','status');[pilotLine,sentLine,answerLine,seen].forEach(function(n){status.appendChild(n);});right.appendChild(status);
    document.body.appendChild(panel);
    entry.addEventListener('click',openPanel);close.addEventListener('click',function(){closePanel();});
    cancel.addEventListener('click',function(){dropTicket(t('Définition d’origine annulée : rien n’a été envoyé.'));});
    confirm.addEventListener('click',confirmOrigin);
    return {entry:entry,panel:panel,close:close,warning:warning,where:where,rows:rows,modes:modes,steps:steps,feeds:feeds,limits:limits,reason:reasonLine,origin:origin,pads:padRow,originButtons:originButtons,
      ticket:ticketBox,ticketName:ticketName,ticketLeft:ticketLeft,confirm:confirm,cancel:cancel,arrows:arrows,pilot:pilotLine,sent:sentLine,answer:answerLine,observed:seen};
  }
  function openPanel(){
    if(!ui||!ui.panel.hidden||!allowed())return;
    returnTo=document.activeElement;
    // Everything but the panel and the status strip (Pause / Arrêter) becomes inert.
    background=Array.prototype.filter.call(document.body.children||[],function(n){return n!==ui.panel&&n.id!=='real-banner'&&!/^(SCRIPT|LINK|STYLE)$/.test(n.tagName);}).map(function(n){var e={node:n,inert:n.inert};n.inert=true;return e;});
    ui.panel.hidden=false;sent('—');answer('','');
    if(clock===null)clock=setInterval(render,1000);
    render();ui.close.focus();
  }
  function closePanel(restore){
    if(!ui||ui.panel.hidden)return;
    stopHold(t('panneau fermé'));ticket=null;
    ui.panel.hidden=true;background.forEach(function(e){e.node.inert=e.inert;});background=[];
    if(clock!==null){clearInterval(clock);clock=null;}
    var target=returnTo;returnTo=null;
    if(restore!==false&&target&&target.isConnected&&!target.hidden&&typeof target.focus==='function')target.focus({preventScroll:true});
  }
  function feedChoices(){
    var m=motion(),low=Infinity;
    AXES.forEach(function(a){var f=m&&m.maxFeed&&m.maxFeed[a];if(f&&typeof f.max==='number'&&f.max>0)low=Math.min(low,f.max);});
    if(low===Infinity)low=500;
    var list=FEEDS.filter(function(v){return v<=low;});
    return list.length?list:[Math.max(1,Math.floor(low))];
  }
  function render(){
    if(disposed)return;
    var any=!!(machine&&machine.capabilities);
    // Disabled or unsupported: no real control at all, only the note with the server's reason.
    if(!allowed()){
      if(hold)stopHold(t('fonction désactivée'));
      if(ui){prop(ui.entry,'hidden',true);closePanel(false);}
      if(any){
        if(!note){var help=document.getElementById('ks-origin-explanation');if(help){note=make('p','ks-help real-motion-note','real-motion-note');help.appendChild(note);}}
        var reason=msg((cap('jog')||{}).reason||'');
        setText(note,t('Déplacements réels non activés (validation matérielle requise).')+(reason&&reason!==msg('Déplacements réels non activés : validation matérielle supervisée requise (voir HANDOFF.md).')?' '+reason:''));
        if(note)prop(note,'hidden',false);
      }
      return;
    }
    if(note)prop(note,'hidden',true);
    if(!ui){ui=build();if(!ui)return;}
    prop(ui.entry,'hidden',false);
    if(ui.panel.hidden)return;
    if(!on('jogContinuous')&&mode==='hold')mode='step';
    if(!on('jog')&&on('jogContinuous'))mode='hold';
    var list=STEPS.filter(function(v){var s=cap('jog')&&cap('jog').steps;return !Array.isArray(s)||s.indexOf(v)>=0;});
    if(list.indexOf(step)<0)step=list[0];
    var feeds=feedChoices();if(feeds.indexOf(feed)<0)feed=feeds.filter(function(v){return v<=250;}).pop()||feeds[0];
    if(ui.feeds.buttons().map(function(b){return b.getAttribute('data-value');}).join()!==feeds.join())ui.feeds.sync(feeds,feed);
    if(ui.steps.buttons().map(function(b){return b.getAttribute('data-value');}).join()!==list.join())ui.steps.sync(list,step);
    ui.modes.mark(mode);ui.steps.mark(step);ui.feeds.mark(feed);
    ui.modes.buttons().forEach(function(b){prop(b,'disabled',!!hold||stepping||(b.getAttribute('data-value')==='hold'?!on('jogContinuous'):!on('jog')));});
    ui.steps.buttons().forEach(function(b){prop(b,'disabled',mode!=='step'||!!hold||stepping);});
    ui.feeds.buttons().forEach(function(b){prop(b,'disabled',!!hold||stepping);});
    setText(ui.warning,mode==='hold'?t('RÉEL · la machine bouge · relâchez pour arrêter'):t('RÉEL · chaque appui envoie un pas à la machine'));
    attr(ui.panel,'data-mode',mode);
    setText(ui.where,t('Position rapportée par le contrôleur · ')+t('repère ')+frame()+' · '+units()+(machine&&typeof machine.statusAgeMs==='number'?' · '+(machine.statusAgeMs<1000?'< 1 s':Math.ceil(machine.statusAgeMs/1000)+' s'):''));
    var co=machine&&machine.coordinates||{};
    AXES.forEach(function(a){var k=a.toLowerCase();setText(ui.rows[a].m,fmt(co.mpos&&co.mpos[k]));setText(ui.rows[a].w,fmt(co.wpos&&co.wpos[k]));});
    var m=motion(),mf=m&&m.maxFeed||{};
    setText(ui.limits,t('Avance max X / Y / Z : ')+AXES.map(function(a){return mf[a]&&mf[a].max?mf[a].max:'—';}).join(' / ')+' mm/min'+(AXES.some(function(a){return mf[a]&&mf[a].source==='fallback';})?t(' · limite prudente ($11x inconnu)'):''));
    var blocked=moveReason('X')&&moveReason('Y')&&moveReason('Z');
    ui.arrows.forEach(function(b){
      var held=!!(hold&&hold.button===b);
      // A held button is never disabled (its release must reach it); the others wait.
      prop(b,'disabled',!held&&(!!hold||stepping||!!moveReason(b.getAttribute('data-axis'))));
      attr(b,'data-held',String(held));
    });
    prop(ui.origin,'hidden',!on('setOrigin')||!!ticket);
    AXES.forEach(function(a){prop(ui.originButtons[a],'disabled',!!originReason()||originBusy||!!ticket);});
    if(ticket&&(Date.now()>=ticket.until||!machine||machine.port!==ticket.port||machine.generation!==ticket.generation||!connected)){ticket=null;answer(t('Confirmation expirée ou état changé : demandez-la à nouveau.'),'failed');}
    prop(ui.ticket,'hidden',!ticket);prop(ui.pads,'hidden',!!ticket);
    if(ticket){
      setText(ui.ticketName,msg(ticket.name)+' · '+t('position machine ')+ticket.axis+' '+fmt(co.mpos&&co.mpos[ticket.axis.toLowerCase()])+' '+units()+t(' → travail ')+ticket.axis+' 0');
      setText(ui.ticketLeft,t('Confirmation valable ')+Math.max(0,Math.ceil((ticket.until-Date.now())/1000))+' s · '+t('Arrêter reste disponible dans le bandeau.'));
      setText(ui.confirm,t('Confirmer l’origine ')+ticket.axis+' · '+frame());
    }
    // Why the arrows wait, from the server's own reasons (course unknown, spindle, 60 s, pilot…).
    setText(ui.reason,blocked&&!hold&&!stepping?t('Déplacement réel indisponible : ')+blocked:'');prop(ui.reason,'hidden',!ui.reason.textContent);
    setText(ui.pilot,pilot&&pilot.sentence?t('Pilote : ')+pilot.sentence:'');
    setText(ui.observed,observed());
  }
  window.addEventListener('cnc-job-status',function(e){
    var d=e&&e.detail;if(!d||d.simulation)return;
    var next=d.machine||null;
    // Another controller, another board start, or the stream gone: the held jog stops now.
    if(hold&&(!next||next.port!==hold.port||(machine&&next.generation!==machine.generation)||!d.transportConnected))stopHold(t('suivi interrompu'));
    if(ticket&&(!next||next.port!==ticket.port||next.generation!==ticket.generation))ticket=null;
    machine=next;connected=!!d.transportConnected;pilot=d.pilot||null;render();
  });
  window.addEventListener('blur',function(){stopHold(t('fenêtre quittée'));});
  // Arrêter (strip, Suivi or preview viewer) during a hold also ends the keepalives here, in the
  // same tap (capture, before the stop is relayed): the jog never waits for the server's answer.
  document.addEventListener('click',function(e){var n=e&&e.target;if(hold&&n&&typeof n.closest==='function'&&n.closest('#t-stop,#job-stop,#home-job-stop,#preview-job-stop'))stopHold(t('arrêt demandé'));},true);
  document.addEventListener('visibilitychange',function(){if(document.hidden){stopHold(t('page masquée'));closePanel(false);}});
  window.addEventListener('cnc-screen-change',function(){stopHold(t('écran changé'));closePanel(false);});
  document.addEventListener('keydown',function(e){if(ui&&!ui.panel.hidden&&e.key==='Escape'){if(e.preventDefault)e.preventDefault();closePanel();}});
  // The page leaving: the request may not get out, the stream closing stops the jog on the server.
  window.addEventListener('pagehide',function(e){stopHold(t('page quittée'));if(e&&e.persisted)return;disposed=true;if(clock!==null){clearInterval(clock);clock=null;}});
  window.cncRealMotion={holding:function(){return !!hold;},stop:function(){return stopHold(t('arrêt demandé'));}};
})();
