/* Session indicators are projections of the received state, never stored permissions. */
(function(){
  'use strict';
  var order=['machine','files','jog','check','home'];
  var labels={machine:'Machine',files:'Fichier',jog:'Zéro pièce',check:'Contrôle',home:'Usinage',more:'Plus'};
  var remedies={connecter:'Connecter la CNC','prendre-la-main':'Prendre la main','remise-en-route':'Remise en route','prise-origine':'Prise d’origine machine…',relire:'Relire les réglages','verifier-zero':'Vérifier à nouveau','arreter-broche':'Arrêter la broche','arreter-usinage':'Arrêter l’usinage','voir-usinage':'Voir l’usinage','refaire-zero-z':'Refaire le zéro Z','refaire-zero':'Refaire le zéro pièce','choisir-fichier':'Choisir un fichier','recharger-fichier':'Recharger ce fichier','reessayer-controle':'Vérifier à nouveau','ma-sonde':'Ma sonde…',plaque:'Modifier…','tester-sonde':'Tester la sonde','pourquoi-sonde':'Pourquoi ?','dessin-depart':'Voir le dessin de départ','relancer-palpage':'Relancer le palpage','changer-ligne':'Changer la ligne','reprendre-debut':'Reprendre au début',recommencer:'Recommencer','voir-controle':'Voir le contrôle',vitesse:'Vitesse…','type-machine':'Type de machine…','recharger-page':'Recharger la page',details:'Détails',aucun:''};
  function t(s){return window.cncI18n?window.cncI18n.t(s):s;}
  function cause(id,texte,remedes,ton){return {id:id,texte:t(texte),remedes:remedes||[],ton:ton||'warn'};}
  function fromRefusal(error){var r=window.cncRefus&&window.cncRefus.lire(error);return r?cause(r.famille,r.phrase,r.remedes):cause('indisponible','Impossible pour l’instant.',['details']);}
  function evaluate(input){
    input=input||{};
    var m=input.machine,kind=input.kind||m&&m.machineProfile&&m.machineProfile.kind,p=input.pilot||{},h=input.halt,online=!!input.transportConnected,selection=input.selection;
    var alarm=!!(m&&/^alarm/i.test(m.activeState||'')),running=!!(m&&(m.workflow==='running'||m.workflow==='paused'));
    var offset=m&&m.workOffset,proven=!!(offset&&offset.state==='proven'),global=null,rank=0;
    function pick(n,id,phrase,remedies){if(!global){rank=n;global=cause(id,phrase,remedies);}}
    if(!m&&!online)pick(1,'hors-ligne','La tablette ne joint plus le serveur. Elle réessaie seule.',['recharger-page']);
    // Lost activity takes precedence over the offline idle message.
    if(h){global=null;pick(2,'etat-perdu','L’état de la machine est perdu. Arrêter reste possible.',[]);}
    if(!m&&online)pick(3,'non-connectee','La machine n’est pas connectée.',['connecter']);
    if(p.state==='other')pick(4,'main-ailleurs',t('C’est « {appareil} » qui a la main. Pause et Arrêter restent possibles ici.').replace('{appareil}',p.name||p.value||t('autre appareil')),['prendre-la-main']);
    if(m&&m.fresh!==true)pick(5,'information-ancienne',t('La machine ne répond plus depuis {n} s. Vérifiez qu’elle est allumée et branchée.').replace('{n}',typeof m.statusAgeMs==='number'?Math.ceil(m.statusAgeMs/1000):'—'),['details']);
    if(input.systemCommand)pick(6,'commande-tablette','Une commande de la tablette est en cours. Attendez sa fin.',[]);
    if(alarm&&running)pick(7,'alarme-usinage','Alarme pendant l’usinage. Arrêtez l’usinage.',['arreter-usinage']);
    if(alarm)pick(8,'alarme','La machine est en alarme : sa position est perdue.',['remise-en-route']);
    var settings=!!(m&&(offset&&offset.code==='ETOUCH_OFFSET_SETTINGS'||Object.keys(m.refusals||{}).some(function(k){return window.CNCTouchRefus&&window.CNCTouchRefus.codes[m.refusals[k].code]==='reglages-non-lus';})));
    if(settings)pick(9,'reglages-non-lus','La machine n’a pas encore donné ses réglages.',['relire']);
    if(m&&/^idle/i.test(m.activeState||'')&&(m.homed!==true||m.referenceLost))pick(10,'origine-a-prendre','Origine machine pas prise : la machine ne sait pas où elle est.',['prise-origine']);
    var moving=m&&m.motion&&(m.motion.jog||m.motion.cancelling),busyCode=m&&m.refusals&&m.refusals.readSettings;
    if(m&&(m.homing||m.probing||moving||busyCode&&busyCode.code==='ETOUCH_SETTINGS_READING'))pick(11,'occupee',m.homing?'Prise d’origine en cours.':m.probing?'Palpage en cours.':moving?'Déplacement en cours.':'Lecture des réglages en cours.',[]);
    if(running)pick(12,'usinage-en-cours','Un usinage est en cours.',['voir-usinage']);
    if(m&&m.spindleSpeed>0)pick(13,'broche-tourne','La broche tourne : arrêtez-la d’abord.',['arreter-broche']);
    var zeroCause=null;
    if(!offset)zeroCause=cause('zero-non-verifie','Le zéro pièce n’est pas vérifié.',['details']);
    else if(!proven){
      if(offset.code==='ETOUCH_OFFSET_SETTINGS')zeroCause=cause('reglages-non-lus','La machine n’a pas encore donné ses réglages.',['relire']);
      else if(offset.state==='unknown'||offset.state==='checking')zeroCause=cause('zero-verification','La machine vérifie le zéro pièce. Attendez quelques secondes.',[]);
      else if(offset.code==='ETOUCH_OFFSET_MISMATCH')zeroCause=cause('zero-a-refaire','La machine n’applique pas le zéro pièce enregistré. Refaites-le.',['refaire-zero','verifier-zero']);
      else zeroCause=cause('zero-non-confirme','La machine n’a pas confirmé le zéro pièce.',['verifier-zero']);
    }
    var traces=m?[m.motion&&m.motion.lastOrigin,m.blockProbe&&m.blockProbe.state==='done'&&m.blockProbe.written==='yes'?m.blockProbe:null,m.zeroZ].filter(function(o){return o&&!o.failed;}):[];
    var zeroDone=proven&&traces.length>0,check=m&&m.programCheck,outside=!!(check&&(check.verdict==='outside'||['X','Y','Z'].some(function(a){return check.axes&&check.axes[a]&&check.axes[a].verdict==='outside';})));
    var done={machine:!!(m&&online&&m.fresh&&p.state!=='other'&&!alarm&&!settings&&m.homed===true&&!m.referenceLost&&!m.lastAlarm&&m.firmware&&m.settingsCount>0),files:!!(m&&m.name),jog:zeroDone,check:!!(m&&proven&&check&&check.verdict==='validated'&&m.canStart&&!outside),home:!!(m&&m.finished)};
    var suite=running?'home':order.filter(function(k){return !done[k];})[0]||'check';
    var words={machine:done.machine?'Prête':global?global.texte:'En attente',files:done.files?'Chargé':selection?'Choisi':'Aucun fichier',jog:m&&m.probing?'Palpage…':!proven?'À vérifier':zeroDone?'Posé':'Ancien zéro',check:!m||!m.name?'En attente':!proven?'Zéro pièce à vérifier':outside?'Dépasse':check&&check.verdict==='unknown'?'Non vérifié':m.jobStopped?'À recharger':done.check?'Tient':'En attente',home:alarm?'Alarme':m&&m.jobStopped?'Arrêté':m&&m.workflow==='paused'?'Pause':m&&m.workflow==='running'?'En cours':done.home?'Terminé':'Rien en cours'};
    if(m&&m.workflow==='running')words.home=t('En cours')+' · '+(m.total>0?Math.min(99,Math.floor((m.received||0)/m.total*100)):'—')+' %';
    if(m&&m.jobStopped&&typeof m.stoppedAtLine==='number')words.home=t('Arrêté ligne {n}').replace('{n}',String(m.stoppedAtLine));
    if(alarm){var alarmCode=m.lastAlarm&&m.lastAlarm.code||m.alarmCode;if(alarmCode)words.home=t('Alarme')+' '+alarmCode;}
    var own={machine:global,files:!selection?cause('aucun-choix','Choisissez un fichier dans la liste.',['choisir-fichier']):null,jog:zeroCause||(!zeroDone?cause('zero-ancien','Zéro pièce d’une séance précédente. Refaites-le pour cette pièce.',['refaire-zero']):null),check:!m||!m.name?cause('aucun-fichier','Aucun fichier chargé.',['choisir-fichier']):zeroCause|| (outside?fromRefusal(check.blocking&&check.blocking[0]||{code:'ETOUCH_START_OUTSIDE'}):m.jobStopped?cause('a-recharger','Rechargez le fichier avant de démarrer.',['recharger-fichier']):check&&check.verdict==='unknown'?fromRefusal({code:'ETOUCH_CHECK_UNITS_UNKNOWN'}):null),home:null};
    var actions={machine:{id:global&&global.remedes[0]||'suite:files',allowed:true},files:{id:'charger',allowed:!!(m&&m.canLoad&&selection&&!input.busy)},jog:{id:'suite:check',allowed:true},check:{id:'demarrer',allowed:!!(m&&m.canStart&&!outside&&!input.busy)},home:{id:m&&m.canResume?'reprendre':'pause',allowed:!!(m&&(m.canResume||m.canPause)||h&&h.canPause)}};
    if(global&&(global.id==='alarme'||global.id==='occupee'))actions.machine.id='prise-origine';
    var guards={connecter:online&&!m,'prendre-la-main':p.state==='other',relire:!!(m&&m.canReadSettings),'prise-origine':!!(m&&m.canHome),'arreter-usinage':!!(m&&m.canStop||h&&h.canStop),'verifier-zero':!!(offset&&offset.canVerify),'arreter-broche':!!(m&&m.canSpindleStop)};
    if(actions.machine.id in guards)actions.machine.allowed=guards[actions.machine.id];
    var etapes={},barres={};
    order.forEach(function(k,i){
      var a=actions[k],abnormal=k==='machine'&&!!(global&&['main-ailleurs','information-ancienne','alarme-usinage','alarme'].indexOf(global.id)>=0||m&&(m.lastAlarm||m.referenceLost))||k==='jog'&&!!zeroCause||k==='check'&&(outside||!!(check&&check.verdict==='unknown'))||k==='home'&&!!(alarm||m&&m.jobStopped);
      var c=rank>0&&rank<=6?global:own[k],blocked=rank>0&&rank<=6&&k!=='jog'&&a.id!==(global.remedes[0]||'');
      // Navigation, stop and release never inherit a machine command refusal.
      if(k==='home'&&a.id==='pause')blocked=false;
      if(blocked){a.allowed=false;c=global;}else if(!a.allowed)c=global||c||fromRefusal(m&&m.refusals&&m.refusals[k==='check'?'start':k==='files'?'load':'resume']||{});
      if(done[k]&&!(k==='files'&&selection&&m&&selection.file!==m.name)&&k!=='home'&&!(global&&rank<=6)){
        var next=order.slice(i+1).filter(function(n){return !done[n];})[0]||'check';a={id:'suite:'+next,allowed:true};
      }
      var label=a.id.indexOf('suite:')===0?t('Suite : {etape} →').replace('{etape}',t(a.id==='suite:home'&&kind==='laser'?'Gravure':labels[a.id.slice(6)])):t({charger:'Charger ce fichier',demarrer:kind==='laser'?'Démarrer la gravure…':'Démarrer l’usinage…',reprendre:'Reprendre…',pause:'Pause'}[a.id]||remedies[a.id]||'Détails');
      etapes[k]={etat:!online&&!h?'inconnu':abnormal?'alerte':done[k]?'fait':suite===k?'suite':'attente',mot:t(words[k]),contexte:m&&m.name?(m.originalName||m.name):''};
      barres[k]={cause:c||cause('pret',done[k]?'Tout est prêt.':words[k],[],'neutre'),remedes:(c&&c.remedes||[]).filter(function(id){return id!==a.id&&!(k==='machine'&&id==='remise-en-route');}).map(function(id){return {id:id,actif:!(id in guards)||guards[id]};}),details:!!c,action:{id:a.id,libelle:label,style:a.allowed?k==='jog'&&!zeroDone?'contour':'plein':'raye'}};
    });
    return {etapes:etapes,suite:suite,barres:barres,lignes:{cause:global,connectee:!!m,zero:proven},globale:global,rang:rank};
  }
  window.CNCSeance={evaluate:evaluate};
  var lastAction='',handlers={},last={},selection=window.cncLibrarySelection||null,manual=false,arrived=false,result=null,armed={},pendingRefusal=null;
  function setText(n,v){if(n&&n.textContent!==v)n.textContent=v;}
  function attr(n,k,v){if(n&&n.getAttribute(k)!==v)n.setAttribute(k,v);}
  function prop(n,k,v){if(n&&n[k]!==v)n[k]=v;}
  function inputKey(d){var m=d.machine;return JSON.stringify([m&&m.port,m&&m.coordinates,m&&m.workOffset,m&&m.refusals,d.pilot&&d.pilot.state]);}
  function paint(){
    var shell=window.cncShell;if(!shell)return;
    result=evaluate(Object.assign({},last,{selection:selection}));
    if(document.hidden)return;
    if(pendingRefusal&&pendingRefusal.key!==inputKey(last))pendingRefusal=null;
    order.forEach(function(k,i){var n=document.querySelector('[data-seance-step="'+(i+1)+'"]'),e=result.etapes[k];if(n){attr(n,'data-seance-state',e.etat);attr(n,'aria-label',t('Étape {n}, {etape} : {etat}').replace('{n}',i+1).replace('{etape}',t(labels[k])).replace('{etat}',e.mot));var mark=n.querySelector('.ks-step-mark');setText(mark,{fait:'✓',suite:'○',alerte:'!',inconnu:'?'}[e.etat]||'');}});
    var laser=!!(last.machine&&last.machine.machineProfile&&last.machine.machineProfile.kind==='laser'),homeNav=document.querySelector('[data-ks-screen="home"] .ks-nav-name');setText(homeNav,t(laser?'Gra­vure':'Usi­nage'));
    var active=shell.screen(),b=result.barres[active];if(active==='more'){var version=document.getElementById('more-version'),loaded=window.cncTabletActions&&window.cncTabletActions.loadedVersion&&window.cncTabletActions.loadedVersion(),stamp=window.cncProfile&&window.cncProfile.version||'—';if(loaded&&loaded.commit)stamp+=' · '+String(loaded.commit).slice(0,8);setText(version,t('CNCjs Touch · page {version}').replace('{version}',stamp));}if(!b)return;
    var r=pendingRefusal&&pendingRefusal.screen===active?pendingRefusal.refusal:null;
    var prefix='step-'+active+'-',by=function(id){return document.getElementById(prefix+id);};
    if(active==='home')setText(by('title'),'5 · '+t(laser?'Gravure':'Usinage'));
    setText(by('state'),result.etapes[active].mot);setText(by('context'),result.etapes[active].contexte);setText(by('cause'),r?'! '+r.phrase:(b.cause.id==='pret'?'':t('Il manque : '))+b.cause.texte);
    var ids=r?r.remedes.map(function(id){return {id:id,actif:true};}):b.remedes;
    ['remedy','remedy2'].forEach(function(slot,i){var node=by(slot),item=ids[i];if(!node)return;prop(node,'hidden',!item);if(item){attr(node,'data-action',item.id);setText(node,t(remedies[item.id]));prop(node,'disabled',!item.actif);}});
    prop(by('details'),'hidden',!r&&!b.details);
    var main=by('main');if(main){if(main.textContent!==b.action.libelle){setText(main,b.action.libelle);armed[active]=Date.now()+600;}attr(main,'data-action',b.action.id);attr(main,'data-style',b.action.style);prop(main,'disabled',b.action.style==='raye');attr(main,'title',b.action.style==='raye'?b.cause.texte:'');}
    if(active==='check'&&window.CNCProgramCheckView){var key=JSON.stringify(last.machine&&last.machine.programCheck||null),node=document.getElementById('check-verdict');if(node&&node.getAttribute('data-check')!==key){window.CNCProgramCheckView.show(node,last.machine&&last.machine.programCheck||null);attr(node,'data-check',key);}}
  }
  function lancer(id){
    if(id!=='recommencer'&&id!=='details')lastAction=id;
    if(id.indexOf('suite:')===0){window.cncShell.go(id.slice(6));return;}
    if(id==='details'){window.cncShell.details(pendingRefusal?pendingRefusal.refusal.details:{lignes:[],brut:last.machine});return;}
    var nav={'remise-en-route':'machine','choisir-fichier':'files','refaire-zero':'jog','refaire-zero-z':'jog','voir-controle':'check','voir-usinage':'home'};
    if(nav[id]){window.cncShell.go(nav[id]);return;}
    if(handlers[id])return handlers[id]();
    // An unavailable owner never silently consumes a remedy.
    window.cncShell.details({lignes:[],brut:last.machine});
  }
  function refuse(error){var origin=document.activeElement,strip=origin&&origin.closest&&origin.closest('#real-banner,#simulation-banner'),messages=strip&&document.getElementById('t-messages');if(messages&&window.cncRefus){window.cncRefus.montrer(messages,error);if(window.cncStatusStrip)window.cncStatusStrip.syncMessages();}var r=window.cncRefus&&window.cncRefus.lire(error);if(!r)return;var screen=window.cncShell&&window.cncShell.screen();if(screen&&order.indexOf(screen)<0){window.cncRefus.montrer(document.getElementById('screen-'+screen),r);return;}pendingRefusal={screen:window.cncShell&&window.cncShell.screen(),key:inputKey(last),refusal:r};paint();}
  function owner(method,arg){return function(){var c=window.cncJobControls;if(!c||typeof c[method]!=='function')return;var out=c[method](arg);if(out&&typeof out.then==='function')out.then(function(result){if(result&&result.error)refuse(result.error);},refuse);return out;};}
  handlers.charger=owner('load');handlers.demarrer=owner('start');handlers.reprendre=owner('resume');handlers.pause=owner('pause');handlers['arreter-usinage']=owner('stop');handlers['arreter-broche']=owner('spindleStop');handlers.relire=owner('readSettings');handlers['verifier-zero']=owner('verifyOffset');handlers['prise-origine']=owner('prepareCommand','home');handlers['prendre-la-main']=owner('openPilot');handlers.connecter=function(){if(window.cncConnectCnc)window.cncConnectCnc.search();};
  handlers['recharger-fichier']=function(){var c=window.cncJobControls,m=last.machine;if(c&&m&&m.canLoad&&!last.busy)return c.loadFrom(m.name,1).catch(refuse);};handlers['recharger-page']=function(){var m=last.machine;if(last.halt||last.busy||last.systemCommand||m&&(m.workflow!=='idle'||m.canStop||m.probing||m.homing)){refuse({message:t('Impossible pour l’instant.')});return;}window.location.reload();};
  var legacy={'ma-sonde':'probe-profile','tester-sonde':'probe-contact','pourquoi-sonde':'probe-contact','dessin-depart':'probe','relancer-palpage':'probe'};Object.keys(legacy).forEach(function(id){handlers[id]=function(){window.cncShell.go(legacy[id]);};});
  handlers.vitesse=function(){var b=document.getElementById('ks-jog-settings');if(b&&!b.disabled)b.click();};
  handlers['type-machine']=function(){window.cncShell.go('settings');};
  handlers.plaque=function(){window.cncShell.go('home');window.dispatchEvent(new CustomEvent('cnc-plate-show',{detail:null}));};
  handlers['changer-ligne']=function(){window.cncShell.go('home');var b=document.getElementById('home-resume-line');if(b&&!b.disabled)b.click();};
  handlers['reprendre-debut']=handlers['recharger-fichier'];handlers['reessayer-controle']=function(){window.cncShell.go('check');};
  handlers.recommencer=function(){if(lastAction&&lastAction!=='recommencer')return lancer(lastAction);return lancer('details');};
  window.cncSeance={enregistrer:function(id,fn){handlers[id]=fn;},lancer:lancer,libelle:function(id){return t(remedies[id]||labels[id]||id);},refuser:refuse,render:paint,state:function(){return result;}};
  if(!window.addEventListener)return;
  window.addEventListener('cnc-job-status',function(e){if(!e.detail||!!e.detail.simulation!==(document.body.getAttribute('data-simulation')==='true'))return;last=e.detail;paint();if(!arrived&&result&&window.cncShell){arrived=true;if(!manual)window.cncShell.go(result.suite);}});
  window.addEventListener('cnc-library-select',function(e){selection=e.detail;pendingRefusal=null;paint();});
  document.addEventListener('visibilitychange',function(){if(!document.hidden)paint();});
  document.addEventListener('input',function(){if(pendingRefusal){pendingRefusal=null;paint();}});
  window.addEventListener('cnc-screen-change',function(e){pendingRefusal=null;armed[e.detail]=Date.now()+600;paint();});
  document.addEventListener('pointerdown',function(e){if(e.isTrusted)manual=true;},true);
  document.addEventListener('keydown',function(e){if(e.isTrusted)manual=true;},true);
  document.addEventListener('click',function(e){var node=e.target&&e.target.closest&&e.target.closest('[data-action]');if(!node||node.disabled)return;if(/-main$/.test(node.id)&&Date.now()<(armed[window.cncShell.screen()]||0))return;pendingRefusal=null;lancer(node.getAttribute('data-action'));});
})();
