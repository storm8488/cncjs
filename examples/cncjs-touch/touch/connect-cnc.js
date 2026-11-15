/*
 * « Connecter la CNC » on the main screen: opens the controller's serial port in CNCjs from the
 * tablet, as the PC's Connection widget does, when no controller is followed (port closed, e.g.
 * after an emergency stop that cut the USB link). Shown only while the server is reachable and no
 * machine is reported; gone as soon as the touch service reports the opened controller.
 *
 * Only 'list' and 'open' are emitted, on a short-lived Socket.IO connection that is closed right
 * after: no G-code, no $ command, no close. A port already open is never reopened (the operator
 * chooses the controller in Files). Opening resets the board, so the operator confirms first.
 */
(function(){
  'use strict';
  var uiLocale=window.cncI18n||{t:function(s){return s;}},t=uiLocale.t;
  var store=window.cncState,menu=document.querySelector('#machine-layout .ks-machine-column')||document.getElementById('screen-machine');
  if(!store||!menu||document.body.getAttribute('data-simulation')==='true')return;
  var TIMEOUT_MS=10000;
  var OPTIONS={controllerType:'Grbl',baudrate:115200,rtscts:false};

  var bar=document.createElement('div');bar.id='ks-connect';bar.className='ks-connect';bar.hidden=true;
  bar.setAttribute('role','group');
  var text=document.createElement('div');text.className='ks-connect-text';
  var title=document.createElement('b'),hint=document.createElement('small');
  text.appendChild(title);text.appendChild(hint);
  var actions=document.createElement('div');actions.className='ks-connect-actions';
  bar.appendChild(text);bar.appendChild(actions);
  menu.insertBefore(bar,menu.firstChild);

  var shown=false,busy=false,socket=null,timer=null;
  function setText(el,value){if(el.textContent!==value)el.textContent=value;}
  function button(label,cls,fn){var b=document.createElement('button');b.type='button';b.className=cls||'';b.textContent=label;b.addEventListener('click',fn);actions.appendChild(b);return b;}
  function view(head,detail,buttons){
    setText(title,head);setText(hint,detail||'');actions.innerHTML='';
    (buttons||[]).forEach(function(b){button(b[0],b[1],b[2]);});
    if(window.cncSeance)window.cncSeance.render();
  }
  function idle(detail){busy=false;view(t('Machine non connectée'),detail||t('Port fermé : Arrêter n’atteint pas la machine.'),detail===t('Un port est déjà ouvert. Choisissez la machine dans Détails de la machine.')?[[t('Détails de la machine'),'',function(){var b=document.getElementById('machine-details-open');if(b)b.click();}]]:[]);}

  function token(){try{return JSON.parse(localStorage.getItem('cnc')).state.session.token||'';}catch(_){return '';}}
  function end(){
    if(timer){clearTimeout(timer);timer=null;}
    if(socket){var s=socket;socket=null;try{s.disconnect();}catch(_){/* Optional browser facility unavailable. */}}
  }
  // One short connection: fn(socket, ports) once CNCjs answered 'list'. Every failure ends it.
  function session(fn){
    end();busy=true;
    if(!window.io||!window.io.connect){idle(t('Connexion CNCjs indisponible sur cette page.'));return;}
    var s=socket=window.io.connect(location.origin,{reconnection:false,forceNew:true,query:'token='+encodeURIComponent(token())});
    var fail=function(reason){if(socket!==s)return;end();idle(reason);};
    timer=setTimeout(function(){fail(t('CNCjs ne répond pas. Réessayez.'));},TIMEOUT_MS);
    s.on('connect_error',function(){fail(t('Serveur CNCjs injoignable. Réessayez.'));});
    s.on('error',function(){fail(t('Serveur CNCjs injoignable. Réessayez.'));});
    s.on('serialport:list',function(ports){if(socket!==s)return;fn(s,Array.isArray(ports)?ports:[],fail);});
    s.on('connect',function(){if(socket===s)s.emit('list');});
  }
  function inUse(ports){return ports.filter(function(p){return p&&p.inuse;});}
  function search(){
    if(!shown||busy)return;
    busy=true;
    view(t('Recherche des ports USB…'),'',[]);
    session(function(s,ports,fail){
      end();
      if(inUse(ports).length){idle(t('Un port est déjà ouvert. Choisissez la machine dans Détails de la machine.'));return;}
      var free=ports.filter(function(p){return p&&p.port;});
      if(!free.length){idle(t('Aucun port USB : vérifiez le câble et l’alimentation de la carte.'));return;}
      // A single port still needs Open; multiple devices need an explicit port choice first.
      if(free.length===1){confirmOpen(free[0].port);return;}
      busy=true;
      view(t('Choisir le port de la CNC'),t('Port de la mise en service absent. Ne choisissez que le port de la carte CNC.'),
        free.map(function(p){return [p.port+(p.manufacturer?' · '+p.manufacturer:''),'ks-connect-port',function(){confirmOpen(p.port);}];}).concat([[t('Annuler'),'',function(){idle();}]]));
    });
  }
  function confirmOpen(port){
    busy=true;
    view(t('Connecter la machine ?'),t('La machine redémarre. Elle sera en alarme jusqu’à la prise d’origine.'),
      [[t('Détails'),'',function(){if(window.cncShell)window.cncShell.details({lignes:[{libelle:t('Port'),valeur:port+' · 115200'}]});}],[t('Annuler'),'',function(){idle();}],[t('Ouvrir'),'ks-connect-go',function(){open(port);}]]);
  }
  function open(port){
    view(t('Ouverture de la connexion…'),'',[]);
    session(function(s,ports,fail){
      var p=ports.filter(function(x){return x&&x.port===port;})[0];
      if(!p){fail(t('Port disparu : vérifiez le câble et l’alimentation de la carte.'));return;}
      if(inUse(ports).length){fail(t('Un port est déjà ouvert. Choisissez la machine dans Détails de la machine.'));return;}
      s.emit('open',port,OPTIONS,function(err){
        if(socket!==s)return;end();
        if(err){idle(t('Ouverture refusée : ')+(err.message||String(err)));return;}
        busy=true;view(t('Port ouvert, la carte redémarre…'),t('Attente du premier rapport de la machine.'),[]);
        timer=setTimeout(function(){timer=null;if(shown)idle(t('Aucun rapport de la carte. Vérifiez son alimentation, puis réessayez.'));},TIMEOUT_MS);
      });
    });
  }

  // Shown only when the server is reachable and no controller is reported; a reported machine
  // removes it and drops any pending choice.
  function render(state){
    var want=!!(state&&state.transportConnected&&!state.machine);
    if(want===shown)return;
    shown=want;
    if(!want){end();busy=false;}
    else if(!busy)idle();
    bar.hidden=!want;
  }
  store.subscribe(render);render(store.get());
  window.addEventListener('pagehide',function(e){if(!e||!e.persisted)end();});
  window.cncConnectCnc={search:search,state:function(){return {shown:shown,busy:busy,open:!!socket};}};
})();
