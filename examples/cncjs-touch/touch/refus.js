/* Shared refusal presenter. A response never invents a permission. */
(function () {
  'use strict';
  var data=window.CNCTouchRefus||{familles:[],codes:{}},t=function(s){return window.cncI18n?window.cncI18n.t(s):s;};
  var families={};data.familles.forEach(function(r){families[r[0]]=r;});
  function lire(error){
    error=error||{};
    var family=data.codes[error.code],message=String(error.message||error.reason||'');
    if(!family){
      var patterns=[[/non connecté|Connexion machine/,'non-connectee'],[/Test du contact/,'test-contact'],[/Machine non référencée/,'origine-a-prendre'],[/Version Grbl inconnue|Réglage .* inconnu|maximale.*inconnue/,'reglages-non-lus'],[/Rechargez le fichier|Aucun fichier chargé/,'a-recharger'],[/pendant un travail|Pendant un travail/,'usinage-en-cours'],[/broche tourne|broche est commandée/,'broche-tourne'],[/Palpage en cours|Prise d’origine en cours|Déplacement en cours|doit être au repos/,'occupee']];
      patterns.some(function(p){if(p[0].test(message)){family=p[1];return true;}return false;});
    }
    var row=families[family]||families.inconnu,params=error.params||{},phrase=t(row[1]);
    var values={appareil:params.appareil||params.owner||error.owner&&error.owner.label||t('autre appareil'),axe:params.axis||params.axe||'—',n:params.n||'—',N:params.over||params.line||'—',champ:params.field||params.name||'—',recherche:params.search||'—',search:params.search||'—',max:params.max||'—',s:params.s||'—',fichier:params.file||'—'};
    var remedies=row.slice(4).filter(function(r){return r&&r!=='aucun';});
    if(error.code==='ETOUCH_OFFSET_CHECKING'){phrase=t('La machine vérifie le zéro pièce. Attendez quelques secondes.');remedies=[];}
    if(error.code==='ETOUCH_OFFSET_MISMATCH'||error.code==='ETOUCH_PROBE_OFFSET'){phrase=t('La machine n’applique pas le zéro pièce enregistré. Refaites-le.');remedies=['refaire-zero','verifier-zero'];}
    if(error.code==='ETOUCH_START_OUTSIDE'&&error.reasons&&error.reasons.length)return lire(error.reasons[0]);
    if(error.code==='ETOUCH_CHECK_OUTSIDE_G53'){phrase=t('Le fichier demande une position hors de la machine, ligne {N}. Refaire le zéro n’y change rien.');remedies=['choisir-fichier'];}
    if(error.code==='ETOUCH_MACHINE_LASER_MODE_ON')phrase=t('Le mode laser est actif dans la machine.');
    if(error.code==='ETOUCH_TRAVEL_TOO_LOW')phrase=t('Le fichier descend {N} mm trop bas. Relevez la pièce, puis refaites le zéro Z.');
    if(error.code==='ETOUCH_TRAVEL_TOO_HIGH')phrase=t('Le fichier monte {N} mm trop haut. Abaissez la pièce, puis refaites le zéro Z.');
    if(error.code==='ETOUCH_PROBE_TRAVEL'){
      var over=Math.max(Number(params.low)-Number(params.min),Number(params.max)-Number(params.high));
      values.N=isFinite(over)?String(Math.ceil(Math.max(0,over)*10)/10):'—';
    }
    if(window.cncI18n&&window.cncI18n.language==='fr')values.N=String(values.N).replace('.',',');
    phrase=phrase.replace(/\{([A-Za-z]+)\}/g,function(all,key){return Object.prototype.hasOwnProperty.call(values,key)?String(values[key]):'—';});
    return {famille:row[0],phrase:phrase,remedes:remedies,details:{titre:t('Détails'),lignes:[{libelle:t('Code'),valeur:error.code||'—'},{libelle:t('Message'),valeur:message}],brut:error}};
  }
  var bands=[],requestKey='';
  function effacer(host){
    bands=bands.filter(function(b){if(b.host!==host)return true;if(b.node.parentNode)b.node.parentNode.removeChild(b.node);return false;});
  }
  function montrer(host,refusal){
    if(!host)return;
    var r=refusal&&refusal.famille?refusal:lire(refusal);effacer(host);
    var band=document.createElement('div');band.className='ks-refus';band.setAttribute('role','status');
    var p=document.createElement('span');p.textContent='! '+r.phrase;band.appendChild(p);
    r.remedes.concat(['details']).filter(function(id,i,a){return a.indexOf(id)===i;}).forEach(function(id){
      var b=document.createElement('button');b.type='button';b.textContent=window.cncSeance?window.cncSeance.libelle(id):t('Détails');
      b.addEventListener('click',function(){if(id==='details'&&window.cncShell)window.cncShell.details(r.details);else if(window.cncSeance)window.cncSeance.lancer(id);});band.appendChild(b);
    });
    host.appendChild(band);bands.push({host:host,node:band,key:requestKey});return r;
  }
  window.cncRefus={lire:lire,montrer:montrer,effacer:effacer};
  if(window.addEventListener){
    window.addEventListener('cnc-screen-change',function(){bands.slice().forEach(function(b){effacer(b.host);});});
    window.addEventListener('cnc-job-status',function(e){var d=e.detail||{},m=d.machine;requestKey=JSON.stringify([m&&m.port,m&&m.name,m&&m.coordinates,m&&m.workOffset,m&&m.refusals,d.pilot&&d.pilot.state]);bands.slice().forEach(function(b){if(b.key!==requestKey)effacer(b.host);});});
    document.addEventListener('input',function(){bands.slice().forEach(function(b){effacer(b.host);});});
  }
})();
