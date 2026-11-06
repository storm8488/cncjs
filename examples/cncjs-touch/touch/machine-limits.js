(function () {
  'use strict';
  var uiLocale=(typeof window!=='undefined'&&window.cncI18n)||{t:function(s){return s;},html:function(s){return s;}};
  var simulation = document.body.getAttribute('data-simulation') === 'true';
  var panel = document.createElement('section');
  panel.id = 'screen-limits';
  panel.className = 'screen';
  panel.innerHTML = uiLocale.html('<div class="card wide ks-panel-intro"><div><h2>Limites de la machine</h2><p id="limits-source" role="status"></p></div><span class="ks-readonly">Lecture seule</span></div>') +
    uiLocale.html('<div class="card wide ks-limits-card"><table class="ks-limits-table"><thead><tr><th scope="col">Paramètre</th><th scope="col">X</th><th scope="col">Y</th><th scope="col">Z</th></tr></thead><tbody></tbody></table></div>') +
    uiLocale.html('<div class="card wide ks-limit-protections"></div><p class="wide ks-help" id="limits-note"></p>');
  document.querySelector('main').appendChild(panel);
  var values = {}, flags = {};
  [[110, uiLocale.t('Vitesse maximale'), 'mm/min'], [120, uiLocale.t('Accélération'), 'mm/s²'], [130, uiLocale.t('Course maximale'), 'mm']].forEach(function (row) {
    var tr = document.createElement('tr');
    tr.innerHTML = uiLocale.html('<th scope="row">') + row[1] + uiLocale.html('<small>') + row[2] + uiLocale.html('</small></th>');
    for (var i = 0; i < 3; i++) {
      var td = document.createElement('td'), key = '$' + (row[0] + i);
      td.innerHTML = uiLocale.html('<b>—</b><small>') + key + uiLocale.html('</small>');
      values[key] = td.querySelector('b');
      tr.appendChild(td);
    }
    panel.querySelector('tbody').appendChild(tr);
  });
  [[20, uiLocale.t('Limites logicielles')], [21, uiLocale.t('Fins de course')], [22, uiLocale.t('Référencement')]].forEach(function (row) {
    var item = document.createElement('div'), key = '$' + row[0];
    item.innerHTML = uiLocale.html('<span>') + row[1] + uiLocale.html(' <small>') + key + uiLocale.html('</small></span><b>Indisponible</b>');
    flags[key] = item.querySelector('b');
    panel.querySelector('.ks-limit-protections').appendChild(item);
  });
  var source = document.getElementById('limits-source'), note = document.getElementById('limits-note');
  var button = document.createElement('button');
  button.id = 'ks-machine-limits';button.className = 'ks-secondary ks-limits-link';button.type = 'button';
  button.textContent = uiLocale.t('Limites de la machine →');
  document.querySelector('.ks-machine-overview').appendChild(button);
  var port = null;
  function text(el,value){if(el.textContent!==value)el.textContent=value;}
  var lastSignature='';
  function clear(message) {
    port = null;
    lastSignature='';
    Object.keys(values).forEach(function (key) { text(values[key],'—'); });
    Object.keys(flags).forEach(function (key) { text(flags[key],uiLocale.t('Indisponible')); if(flags[key].className!=='')flags[key].className = ''; });
    text(source,message);
    text(note,simulation ? uiLocale.t('Les déplacements fictifs ne modélisent ni vitesse, ni accélération, ni course physique.') : uiLocale.t('En attente des réglages transmis par CNCjs. Aucun réglage du contrôleur n’est modifié ici.'));
  }
  clear(simulation ? uiLocale.t('Simulation · limites physiques non simulées') : uiLocale.t('Aucun réglage reçu du contrôleur'));
  function receiveSettings(type,payload) {
    if (!port) return;
    if (type !== 'Grbl') { clear(uiLocale.t('Contrôleur non compatible avec les limites Grbl'));return; }
    var settings=payload&&payload.settings||{}, signature=JSON.stringify([port,settings]);
    if(signature===lastSignature)return;lastSignature=signature;
    var count=0;
    Object.keys(values).forEach(function(key){
      var raw=settings[key],n=(typeof raw==='number'||typeof raw==='string'&&raw.trim()!=='')?Number(raw):NaN;
      var valid=isFinite(n)&&n>0;
      text(values[key],valid?n.toLocaleString(window.cncI18n?window.cncI18n.locale:'fr-FR',{maximumFractionDigits:3}):'—');if(valid)count++;
    });
    Object.keys(flags).forEach(function(key){
      var raw=settings[key],on=raw==='1'||raw===1,off=raw==='0'||raw===0;
      text(flags[key],on?uiLocale.t('Activé'):off?uiLocale.t('Désactivé'):uiLocale.t('Indisponible'));
      var name=on?'ks-limit-on':off?'ks-limit-off':'';if(flags[key].className!==name)flags[key].className=name;
      if(on||off)count++;
    });
    text(source,'Grbl · '+port+' · '+count+uiLocale.t('/12 paramètres reçus'));
    text(note,uiLocale.t('Derniers réglages connus de CNCjs, reçus à ')+new Date().toLocaleTimeString(window.cncI18n?window.cncI18n.locale:'fr-FR')+uiLocale.t('. « — » : valeur absente ou invalide. Le référencement activé ne signifie pas que la machine est référencée.'));
  }
  if(!simulation&&window.cncState){
    var unsubscribe=window.cncState.subscribe(function(state){
      var machine=state.machine;
      if(!machine||!machine.fresh){clear(uiLocale.t('Contrôleur sélectionné indisponible · valeurs inconnues'));return;}
      if(port!==machine.port)clear(uiLocale.t('Grbl · en attente des réglages'));
      port=machine.port;receiveSettings(machine.type,{settings:machine.settings});
    });
    var disposed=false;
    function dispose(){if(disposed)return;disposed=true;unsubscribe();window.removeEventListener('pagehide',onPageHide);}
    function onPageHide(event){if(!event||!event.persisted)dispose();}
    window.addEventListener('pagehide',onPageHide);
    window.cncMachineLimits={dispose:dispose};return;
  }
  if (simulation || !window.cncSocket) return;
  var socket = window.cncSocket;
  function unavailable() { clear(uiLocale.t('Connexion perdue · valeurs indisponibles')); }
  socket.on('disconnect', unavailable);
  socket.on('connect_error', unavailable);
  socket.on('error', unavailable);
  socket.on('serialport:open', function (data) {
    if (!socket.connected || !data || data.controllerType !== 'Grbl' || !data.port) {
      clear(uiLocale.t('Limites disponibles pour un contrôleur Grbl connecté'));return;
    }
    if (port !== data.port) clear(uiLocale.t('Grbl · en attente des réglages'));
    port = data.port;
  });
  socket.on('serialport:close', function (data) { if (!data || data.port === port) unavailable(); });
  socket.on('serialport:error', function (data) { if (!data || data.port === port) unavailable(); });
  socket.on('serialport:list', function (ports) {
    if (port && !(ports || []).some(function (p) { return p.port === port && p.inuse; })) unavailable();
    if (!(ports || []).some(function (p) { return p.inuse; })) clear(uiLocale.t('Aucune machine connectée · valeurs indisponibles'));
  });
  socket.on('controller:settings', function (type, payload) {
    if (!port || !socket.connected) return;
    receiveSettings(type,payload);
  });
})();
/* Performance v2 (L6) — Machine, under body.perf-v2 only (mount #perf-v2-machine). Left: the
 * current condition, an alarm with a readable title, its reported or deduced origin, the
 * explanation and the next possible action; report freshness and the pilot device. Right: the
 * travel parameters known/unknown with their units, never an invented value or a machine
 * drawing. Read only: no button; unlock and homing keep their place, conditions and
 * confirmations. Handlers only queue a frame; one bounded timer marks the report stale. */
(function () {
  'use strict';
  // tablet-profile.js always defines cncV2 (even in Eco); without it there is nothing to present.
  if (!window.cncV2 || document.body.getAttribute('data-simulation') === 'true') return;
  var uiLocale=window.cncI18n||{t:function(s){return s;}};
  var TEXT={
    'Condition actuelle':['Current condition','Condición actual'],'Paramètres de course':['Travel parameters','Parámetros de recorrido'],
    'État : ':['State: ','Estado: '],'inconnu':['unknown','desconocido'],'Aucune alarme rapportée.':['No alarm reported.','Ninguna alarma notificada.'],
    ' rapporté par Grbl.':[' reported by Grbl.',' notificado por Grbl.'],'Code ALARM:':['Code ALARM:','Código ALARM:'],'Code ':['Code ','Código '],
    ' déduit de l’état précédent : la carte l’a effacé en redémarrant.':[' deduced from the previous state: the board erased it when restarting.',' deducido del estado anterior: la placa lo borró al reiniciarse.'],
    'Aucun code reçu : cause non rapportée par la carte.':['No code received: cause not reported by the board.','Ningún código recibido: causa no notificada por la placa.'],
    'Prochaine action possible : corriger la cause, puis Déverrouiller ($X) ou faire la prise d’origine ($H) depuis leurs commandes habituelles, avec leur confirmation. Cet écran n’envoie rien.':['Next possible action: fix the cause, then Unlock ($X) or home ($H) from their usual controls, with their confirmation. This screen sends nothing.','Próxima acción posible: corregir la causa y luego Desbloquear ($X) o hacer el referenciado ($H) desde sus mandos habituales, con su confirmación. Esta pantalla no envía nada.'],
    'Rapport frais · âge ':['Fresh report · age ','Informe reciente · antigüedad '],
    'Rapport périmé : dernières valeurs connues, non actualisées.':['Stale report: last known values, not updated.','Informe caducado: últimos valores conocidos, sin actualizar.'],
    'Fraîcheur inconnue : aucun rapport récent du contrôleur.':['Freshness unknown: no recent controller report.','Antigüedad desconocida: ningún informe reciente del controlador.'],
    'Appareil pilote : ':['Pilot device: ','Dispositivo piloto: '],
    'Rapport non suivi : l’interface v2 est arrêtée pour cette session. L’état et l’alarme à jour sont affichés dans la carte « Connexion et état ».':['Report not followed: the v2 interface is stopped for this session. The current state and alarm are shown in the “Connection and state” card.','Informe no seguido: la interfaz v2 está detenida en esta sesión. El estado y la alarma actuales se muestran en la tarjeta «Conexión y estado».'],
    'Paramètres non suivis depuis l’arrêt de l’interface v2.':['Parameters not followed since the v2 interface stopped.','Parámetros no seguidos desde que se detuvo la interfaz v2.'],
    'Sens de prise d’origine':['Homing direction','Sentido del referenciado'],
    ' paramètres connus':[' parameters known',' parámetros conocidos'],
    'Valeurs transmises par Grbl via CNCjs ; « inconnu » : non reçue ou invalide. Le référencement activé ne signifie pas que la machine est référencée.':['Values sent by Grbl through CNCjs; “unknown”: not received or invalid. Homing enabled does not mean the machine is homed.','Valores enviados por Grbl a través de CNCjs; «desconocido»: no recibido o no válido. El referenciado activado no significa que la máquina esté referenciada.']
  };
  function vt(s){var l=uiLocale.language,row=TEXT[s];return row&&l==='en'?row[0]:row&&l==='es'?row[1]:s;}
  var AXES=['X','Y','Z'],ROWS=[[110,'Vitesse maximale','mm/min'],[120,'Accélération','mm/s²'],[130,'Course maximale','mm']],FLAGS=[[20,'Limites logicielles'],[21,'Fins de course'],[22,'Référencement']];
  var v2={registered:false,disposed:false,frame:0,timer:0,detail:null,arrival:null,nodes:null,shown:''};
  function api(){var a=window.cncV2;return a&&typeof a.gate==='function'&&typeof a.state==='function'?a:null;}
  function layout(){return !!(document.body.classList&&document.body.classList.contains('perf-v2'));}
  function visible(){var s=document.getElementById('screen-machine');return !document.hidden&&!!s&&s.classList.contains('active');}
  function now(){var p=window.performance,n=p&&typeof p.now==='function'?p.now():null;return typeof n==='number'&&isFinite(n)?n:null;}
  function finite(n){return typeof n==='number'&&isFinite(n);}
  function queue(){if(!v2.registered||v2.disposed||v2.frame||!window.requestAnimationFrame)return;v2.frame=window.requestAnimationFrame(render);}
  function clearTimer(){if(v2.timer&&window.clearTimeout)window.clearTimeout(v2.timer);v2.timer=0;}
  function el(tag,cls,value){var n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=value;return n;}
  function number(raw){var n=(typeof raw==='number'||typeof raw==='string'&&raw.trim()!=='')?Number(raw):NaN;return isFinite(n)?n:null;}
  function format(n){return n.toLocaleString(uiLocale.locale||'fr-FR',{maximumFractionDigits:3});}
  // A view model of facts only; unknown stays unknown, never zero.
  function model(){
    var d=v2.detail||{},m=d.machine||null,at=now(),age=m&&finite(m.statusAgeMs)&&finite(at)&&finite(v2.arrival)?m.statusAgeMs+Math.max(0,at-v2.arrival):null;
    var freshness=!m?'unknown':m.fresh===true&&age!==null&&age<=2500?'fresh':m.fresh===false||age!==null?'stale':'unknown';
    var alarm=!!(m&&/^alarm/i.test(m.activeState||'')),code=alarm&&finite(m.alarmCode)?m.alarmCode:null,inferred=alarm&&code!==null&&m.alarmCodeInferred===true;
    var help=alarm&&window.CNCGrblHelp?window.CNCGrblHelp.alarm(code,inferred):null,pilot=d.pilot;
    var s=m&&m.settings&&typeof m.settings==='object'?m.settings:{},known=0,rows=[],flags=[];
    ROWS.forEach(function(r){rows.push({label:uiLocale.t(r[1]),unit:r[2],cells:AXES.map(function(_,i){var key='$'+(r[0]+i),n=number(s[key]),ok=n!==null&&n>0;if(ok)known++;return {key:key,value:ok?format(n)+' '+r[2]:vt('inconnu')};})});});
    FLAGS.forEach(function(f){var raw=s['$'+f[0]],on=raw==='1'||raw===1,off=raw==='0'||raw===0;if(on||off)known++;flags.push({key:'$'+f[0],label:uiLocale.t(f[1]),value:on?uiLocale.t('Activé'):off?uiLocale.t('Désactivé'):vt('inconnu')});});
    var mask=number(s.$23),maskOk=mask!==null&&mask>=0&&Math.floor(mask)===mask;if(maskOk)known++;
    flags.push({key:'$23',label:vt('Sens de prise d’origine'),value:maskOk?String(mask):vt('inconnu')});
    return {state:m&&m.activeState?m.activeState:null,alarm:alarm,title:help?help.title:null,action:help?help.action:null,
      origin:!alarm?null:inferred?vt('Code ')+code+vt(' déduit de l’état précédent : la carte l’a effacé en redémarrant.'):code!==null?vt('Code ALARM:')+code+vt(' rapporté par Grbl.'):vt('Aucun code reçu : cause non rapportée par la carte.'),
      freshness:freshness,age:freshness==='fresh'?age:null,
      pilot:pilot&&pilot.sentence?pilot.sentence:pilot&&pilot.value&&pilot.value!=='—'?vt('Appareil pilote : ')+pilot.value:vt('Appareil pilote : ')+vt('inconnu'),
      rows:rows,flags:flags,known:known};
  }
  function build(content){
    var n={},zones=el('div','v2m-zones');
    n.condition=el('section','v2m-zone v2m-condition');n.condition.id='v2m-condition';
    n.parameters=el('section','v2m-zone v2m-parameters');n.parameters.id='v2m-parameters';
    zones.appendChild(n.condition);zones.appendChild(n.parameters);content.appendChild(zones);return n;
  }
  function clear(node){while(node.children.length)node.removeChild(node.children[node.children.length-1]);}
  function draw(n,x){
    clear(n.condition);clear(n.parameters);
    n.condition.appendChild(el('h2',null,vt('Condition actuelle')));
    n.condition.appendChild(el('p','v2m-state',vt('État : ')+(x.state||vt('inconnu'))));
    if(x.alarm){
      var box=el('div','v2m-alarm');box.setAttribute('data-tone','danger');
      box.appendChild(el('h3',null,x.title||uiLocale.t('Alarme')));box.appendChild(el('p','v2m-origin',x.origin));
      if(x.action)box.appendChild(el('p','v2m-explanation',x.action));
      box.appendChild(el('p','v2m-next',vt('Prochaine action possible : corriger la cause, puis Déverrouiller ($X) ou faire la prise d’origine ($H) depuis leurs commandes habituelles, avec leur confirmation. Cet écran n’envoie rien.')));
      n.condition.appendChild(box);
    } else n.condition.appendChild(el('p','v2m-calm',vt('Aucune alarme rapportée.')));
    var fresh=el('p','v2m-freshness',x.freshness==='fresh'?vt('Rapport frais · âge ')+format(Math.round(x.age/100)/10)+' s':x.freshness==='stale'?vt('Rapport périmé : dernières valeurs connues, non actualisées.'):vt('Fraîcheur inconnue : aucun rapport récent du contrôleur.'));
    fresh.setAttribute('data-freshness',x.freshness);n.condition.appendChild(fresh);
    n.condition.appendChild(el('p','v2m-pilot',x.pilot));
    n.parameters.appendChild(el('h2',null,vt('Paramètres de course')));
    var table=el('table','v2m-table'),head=el('tr');
    [uiLocale.t('Paramètre')].concat(AXES).forEach(function(h){var th=el('th',null,h);th.setAttribute('scope','col');head.appendChild(th);});
    var thead=el('thead');thead.appendChild(head);table.appendChild(thead);var body=el('tbody');
    x.rows.forEach(function(r){var tr=el('tr'),th=el('th',null,r.label+' · '+r.unit);th.setAttribute('scope','row');tr.appendChild(th);
      r.cells.forEach(function(c){var td=el('td');td.appendChild(el('b',null,c.value));td.appendChild(el('small',null,c.key));td.setAttribute('data-known',String(c.value!==vt('inconnu')));tr.appendChild(td);});body.appendChild(tr);});
    table.appendChild(body);n.parameters.appendChild(table);
    var dl=el('dl','v2m-flags');
    x.flags.forEach(function(f){dl.appendChild(el('dt',null,f.label+' '+f.key));dl.appendChild(el('dd',null,f.value));});
    n.parameters.appendChild(dl);
    n.parameters.appendChild(el('p','v2m-count',x.known+'/13'+vt(' paramètres connus')));
    n.parameters.appendChild(el('p','v2m-note',vt('Valeurs transmises par Grbl via CNCjs ; « inconnu » : non reçue ou invalide. Le référencement activé ne signifie pas que la machine est référencée.')));
  }
  // Resources closed (Éco, GPU loss, preference off, pagehide) while the layout may be held: the
  // panel stops following the reports, so it says so in the same rectangle and gives the alarm
  // back to the v1 notice (its CSS hiding keys on data-v2-presenter=on). Never a frozen « frais ».
  function retire(){
    var a=api(),mount=a&&a.mounts&&a.mounts.get('machine'),n=v2.nodes;
    if(!n)return;
    clear(n.condition);clear(n.parameters);v2.shown='';
    n.condition.appendChild(el('h2',null,vt('Condition actuelle')));
    var notice=el('p','v2m-freshness',vt('Rapport non suivi : l’interface v2 est arrêtée pour cette session. L’état et l’alarme à jour sont affichés dans la carte « Connexion et état ».'));
    notice.setAttribute('data-freshness','untracked');n.condition.appendChild(notice);
    n.parameters.appendChild(el('h2',null,vt('Paramètres de course')));
    n.parameters.appendChild(el('p','v2m-note',vt('Paramètres non suivis depuis l’arrêt de l’interface v2.')));
    if(mount&&mount.root&&mount.root.getAttribute('data-v2-presenter')==='on')mount.root.setAttribute('data-v2-presenter','off');
  }
  function render(){
    v2.frame=0;
    var a=api(),mounts=a&&a.mounts,mount=mounts&&mounts.get('machine');
    if(v2.disposed||!a||!a.gate()||!layout()||!mount||!mount.content||!visible())return;
    var n=v2.nodes||(v2.nodes=build(mount.content));
    if(mount.content.hidden)mount.content.hidden=false;
    if(mount.root.getAttribute('data-v2-presenter')!=='on')mount.root.setAttribute('data-v2-presenter','on');
    var x=model(),signature=JSON.stringify(x);
    if(signature!==v2.shown){v2.shown=signature;draw(n,x);}
    // The age keeps running without a new report: one timer at the stale threshold.
    clearTimer();
    if(x.freshness==='fresh'&&window.setTimeout)v2.timer=window.setTimeout(function(){v2.timer=0;queue();},Math.ceil(2500-x.age)+20);
  }
  window.addEventListener('cnc-v2-change',function(){
    var a=api(),s=a&&a.state();
    if(!v2.registered&&a&&typeof a.register==='function'&&a.gate()&&s.ready&&s.layout){
      v2.registered=true;
      var snap={version:1,available:true,screen:'machine',model:null};
      a.register('machine',{snapshot:function(){return snap;},update:function(){return snap;},cancel:function(){},
        dispose:function(){v2.disposed=true;clearTimer();if(v2.frame&&window.cancelAnimationFrame)window.cancelAnimationFrame(v2.frame);v2.frame=0;
          if(v2.nodes&&window.requestAnimationFrame)window.requestAnimationFrame(retire);}});
    }
    queue();
  });
  window.addEventListener('cnc-job-status',function(e){var d=e&&e.detail;if(!d||d.simulation)return;v2.detail=d;v2.arrival=now();queue();});
  window.addEventListener('cnc-screen-change',function(e){if(e&&e.detail==='machine')queue();else clearTimer();});
  document.addEventListener('visibilitychange',function(){if(document.hidden)clearTimer();else queue();});
})();
