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
  var store=window.cncState,menu=document.getElementById('screen-menu');
  if(!store||!menu||document.body.getAttribute('data-simulation')==='true')return;
  var COMMISSIONING='cncjs-touch-commissioning-v1',TIMEOUT_MS=10000;
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
  }
  function idle(detail){busy=false;view(t('CNC non connectée'),detail||t('Port fermé : Arrêter n’atteint pas la machine.'),[[t('Connecter la CNC'),'ks-connect-go',search]]);}

  function token(){try{return JSON.parse(localStorage.getItem('cnc')).state.session.token||'';}catch(_){return '';}}
  function commissioned(){try{var d=JSON.parse(localStorage.getItem(COMMISSIONING)||'null');return d&&d.machines&&typeof d.machines==='object'?Object.keys(d.machines):[];}catch(_){return [];}}
  function end(){
    if(timer){clearTimeout(timer);timer=null;}
    if(socket){var s=socket;socket=null;try{s.disconnect();}catch(_){}}
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
    view(t('Recherche des ports USB…'),'',[]);
    session(function(s,ports,fail){
      end();
      if(inUse(ports).length){idle(t('Un port est déjà ouvert dans CNCjs : choisissez le contrôleur dans Fichiers.'));return;}
      var free=ports.filter(function(p){return p&&p.port;}),known=commissioned();
      var mine=free.filter(function(p){return known.indexOf(p.port)>=0;});
      if(!free.length){idle(t('Aucun port USB : vérifiez le câble et l’alimentation de la carte.'));return;}
      // Only the commissioned port is offered directly; any other serial device (another board,
      // a built-in ttyS port) must be picked explicitly, with its manufacturer shown.
      if(mine.length===1){confirmOpen(mine[0].port);return;}
      busy=true;
      view(t('Choisir le port de la CNC'),t('Port de la mise en service absent. Ne choisissez que le port de la carte CNC.'),
        free.map(function(p){return [p.port+(p.manufacturer?' · '+p.manufacturer:''),'',function(){confirmOpen(p.port);}];}).concat([[t('Annuler'),'',function(){idle();}]]));
    });
  }
  function confirmOpen(port){
    busy=true;
    view(t('Ouvrir ')+port+' ?',t('La carte redémarre : la machine sera en Alarme jusqu’à la prise d’origine ou le déverrouillage.'),
      [[t('Ouvrir'),'ks-connect-go',function(){open(port);}],[t('Annuler'),'',function(){idle();}]]);
  }
  function open(port){
    view(t('Ouverture de ')+port+'…','',[]);
    session(function(s,ports,fail){
      var p=ports.filter(function(x){return x&&x.port===port;})[0];
      if(!p){fail(t('Port disparu : vérifiez le câble et l’alimentation de la carte.'));return;}
      if(inUse(ports).length){fail(t('Un port est déjà ouvert dans CNCjs : choisissez le contrôleur dans Fichiers.'));return;}
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
  window.cncConnectCnc={state:function(){return {shown:shown,busy:busy,open:!!socket};}};
})();
