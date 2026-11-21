/*
 * « Connecter la CNC » on the main screen: opens the controller's serial port in CNCjs from the
 * tablet, as the PC's Connection widget does, when no controller is followed (port closed, e.g.
 * after an emergency stop that cut the USB link). Shown only while the server is reachable and no
 * machine is reported; gone as soon as the touch service reports the opened controller.
 *
 * Only 'list' and 'open' are emitted, on a short-lived Socket.IO connection that is closed right
 * after: no G-code, no $ command, no close. A port already open is never reopened (the operator
 * chooses the controller in Files). Manual opening resets the board and needs confirmation.
 * F5 allows one automatic attempt on local kiosk startup, to the last successful port only.
 */
(function(){
  'use strict';
  var uiLocale=window.cncI18n||{t:function(s){return s;}},t=uiLocale.t;
  var store=window.cncState,menu=document.querySelector('#machine-layout .ks-machine-column')||document.getElementById('screen-machine');
  if(!store||!menu||document.body.getAttribute('data-simulation')==='true')return;
  var TIMEOUT_MS=10000;
  var OPTIONS={controllerType:'Grbl',baudrate:115200,rtscts:false};
  var KEY='cncjs-touch-auto-connect-v1',prefs={enabled:true,port:''};
  var attempted=false,disposed=false,localRead=null,automaticSession=false;
  try{
    var saved=JSON.parse(localStorage.getItem(KEY)||'null');
    if(saved){
      if(typeof saved!=='object'||Array.isArray(saved)||typeof saved.enabled!=='boolean'||typeof saved.port!=='string')throw Error('invalid');
      prefs.enabled=saved.enabled;prefs.port=saved.port;
    }
  }catch(_){prefs={enabled:false,port:''};}
  function save(){try{localStorage.setItem(KEY,JSON.stringify(prefs));return true;}catch(_){return false;}}
  function remember(port){if(typeof port==='string'&&port&&prefs.port!==port){prefs.port=port;save();}}

  // Same tablet scope and toggle as the other browser preferences, on the Machine tab.
  var settings=document.getElementById('screen-settings'),toggle=null,toggleValue=null,settingStatus=null;
  function paintSetting(){if(toggle){toggle.setAttribute('aria-pressed',String(prefs.enabled));setText(toggleValue,t(prefs.enabled?'Activé':'Désactivé'));}}
  if(settings){
    var card=document.createElement('div');card.id='ks-auto-connect';card.className='card ks-display-card';
    var heading=document.createElement('h2');heading.textContent=t('Reconnexion automatique')+' ';
    var scope=document.createElement('span');scope.className='ks-scope';scope.setAttribute('data-scope','tablet');scope.textContent=t('Cette tablette');heading.appendChild(scope);card.appendChild(heading);
    var explanation=document.createElement('p');explanation.textContent=t('Au chargement du kiosque, reconnecter une fois la dernière machine.');card.appendChild(explanation);
    var warning=document.createElement('p');warning.textContent=t('La connexion redémarre la machine. La prise d’origine reste à faire.');card.appendChild(warning);
    toggle=document.createElement('button');toggle.id='auto-connect-toggle';toggle.type='button';toggle.className='ks-display-toggle';
    var label=document.createElement('span');label.textContent=t('Reconnexion automatique');toggle.appendChild(label);toggleValue=document.createElement('b');toggle.appendChild(toggleValue);card.appendChild(toggle);
    settingStatus=document.createElement('p');settingStatus.setAttribute('role','status');card.appendChild(settingStatus);
    toggle.addEventListener('click',function(){
      prefs.enabled=!prefs.enabled;
      // A preference change never starts an opening in this page, even when switched back on.
      attempted=true;cancelLocalRead();
      if(automaticSession){end();automaticSession=false;idle();}
      setText(settingStatus,save()?t('Choix appliqué à la prochaine ouverture de la page.'):t('Choix appliqué ; mémorisation indisponible dans ce navigateur.'));
      paintSetting();
    });
    settings.appendChild(card);paintSetting();
  }

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
    if(window.cncRefus)window.cncRefus.effacer(bar);
    setText(title,head);setText(hint,detail||'');actions.innerHTML='';
    (buttons||[]).forEach(function(b){button(b[0],b[1],b[2]);});
    if(window.cncSeance)window.cncSeance.render();
  }
  function idle(detail){
    busy=false;view(t('Machine non connectée'),detail||t('Port fermé : Arrêter n’atteint pas la machine.'),detail===t('Un port est déjà ouvert. Choisissez la machine dans Détails de la machine.')?[[t('Détails de la machine'),'',function(){var b=document.getElementById('machine-details-open');if(b)b.click();}]]:[]);
    if(detail&&automaticSession&&window.cncRefus){
      var refusal=window.cncRefus.lire({message:detail});refusal.phrase=detail;refusal.remedes=['connecter'];
      window.cncRefus.montrer(bar,refusal);
    }
    automaticSession=false;
  }

  function token(){try{return JSON.parse(localStorage.getItem('cnc')).state.session.token||'';}catch(_){return '';}}
  function end(){
    if(timer){clearTimeout(timer);timer=null;}
    if(socket){var s=socket;socket=null;try{s.disconnect();}catch(_){/* Optional browser facility unavailable. */}}
  }
  function cancelLocalRead(){if(localRead){var x=localRead;localRead=null;x.abort();}}
  function automatic(){
    var state=store.get();
    if(attempted||!state.transportConnected)return;
    attempted=true;
    if(!prefs.enabled||!prefs.port||state.machine||busy||!token()||typeof XMLHttpRequest==='undefined')return;
    var port=prefs.port,x=new XMLHttpRequest();localRead=x;
    x.open('GET',(state.apiBase||'/api')+'/touch-backlight',true);x.timeout=5000;
    x.setRequestHeader('Authorization','Bearer '+token());
    x.onload=function(){
      if(localRead!==x||disposed)return;localRead=null;
      var data=null;try{data=JSON.parse(x.responseText);}catch(_){/* Unknown locality never permits an automatic reset. */}
      var current=store.get();
      if(x.status!==200||!data||data.local!==true||!prefs.enabled||busy||!current.transportConnected||current.machine)return;
      automaticSession=true;open(port,true);
    };
    x.onerror=x.ontimeout=function(){if(localRead===x)localRead=null;};
    x.send(null);
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
    var listed=false;
    s.on('serialport:list',function(ports){if(socket!==s||listed)return;listed=true;fn(s,Array.isArray(ports)?ports:[],fail);});
    s.on('connect',function(){if(socket===s)s.emit('list');});
  }
  function inUse(ports){return ports.filter(function(p){return p&&p.inuse;});}
  function search(){
    if(!shown||busy)return;
    attempted=true;cancelLocalRead();automaticSession=false;
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
  function open(port,auto){
    view(t('Ouverture de la connexion…'),'',[]);
    session(function(s,ports,fail){
      var p=ports.filter(function(x){return x&&x.port===port;})[0];
      if(!p){fail(t('Port disparu : vérifiez le câble et l’alimentation de la carte.'));return;}
      if(inUse(ports).length){fail(t('Un port est déjà ouvert. Choisissez la machine dans Détails de la machine.'));return;}
      s.emit('open',port,auto?Object.assign({},OPTIONS,{touchAutoConnect:true}):OPTIONS,function(err){
        if(socket!==s)return;end();
        if(err){idle(t('Ouverture refusée : ')+t(err.message||String(err)));return;}
        automaticSession=false;
        remember(port);
        busy=true;view(t('Port ouvert, la carte redémarre…'),t('Attente du premier rapport de la machine.'),[]);
        timer=setTimeout(function(){timer=null;if(shown)idle(t('Aucun rapport de la carte. Vérifiez son alimentation, puis réessayez.'));},TIMEOUT_MS);
      });
    });
  }

  // Shown only when the server is reachable and no controller is reported; a reported machine
  // removes it and drops any pending choice.
  function render(state){
    if(disposed)return;
    if(!state||!state.transportConnected)cancelLocalRead();
    // A reported connected port is also evidence of a successful opening (including the PC).
    if(state&&state.transportConnected&&state.machine)remember(state.machine.port);
    automatic();
    var want=!!(state&&state.transportConnected&&!state.machine);
    if(want===shown)return;
    shown=want;
    if(!want){end();busy=false;}
    else if(!busy)idle();
    bar.hidden=!want;
  }
  store.subscribe(render);render(store.get());
  window.addEventListener('pagehide',function(){disposed=true;attempted=true;cancelLocalRead();end();});
  window.addEventListener('pageshow',function(e){if(e&&e.persisted){disposed=false;render(store.get());}});
  window.cncConnectCnc={search:search,state:function(){return {shown:shown,busy:busy,open:!!socket};}};
})();
