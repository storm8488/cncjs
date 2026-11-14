(function(root){
  'use strict';
  // Real block probing of the Sonde screen (palpage au bloc, server action blockProbe): the texts and the
  // request of the page, pure functions. The server plans, moves, checks and writes the origin; nothing here
  // decides a move. Contract: examples/cncjs-touch/design (conception du palpage au bloc, § 3 and § 4).
  var uiLocale=(typeof window!=='undefined'&&window.cncI18n)||{t:function(s){return s;}};
  function t(s){return uiLocale.t(s);}
  function msg(s){return typeof uiLocale.message==='function'?uiLocale.message(s):t(s);}
  var WCS=['G54','G55','G56','G57','G58','G59'],NO_DETAIL='Refus du serveur sans détail.';
  function num(v){return typeof v==='number'&&isFinite(v)?v:null;}
  function has(operation,axis){return typeof operation==='string'&&operation.indexOf(axis)>=0;}
  // The prepare body (contract § 3.1): every profile field, null when this operation does not use it.
  function request(p,operation,diameter,wcs){
    p=p||{};var x=has(operation,'X'),y=has(operation,'Y'),z=has(operation,'Z'),sign=function(v){return v===1||v===-1?v:null;};
    return {axes:operation,wcs:wcs,diameter:x||y?num(diameter):null,profile:{thickness:z?num(p.thickness):null,faceX:x?num(p.faceX):null,faceY:y?num(p.faceY):null,
      fast:num(p.fast),slow:num(p.slow),search:num(p.search),retract:num(p.retract),clearance:z?num(p.clearance):null,
      corner:operation==='XYZ'&&['--','+-','-+','++'].indexOf(p.corner)>=0?p.corner:null,directionX:x?sign(p.directionX):null,directionY:y?sign(p.directionY):null}};
  }
  function current(m){var b=m&&m.blockProbe;return b&&typeof b==='object'?b:null;}
  // A probing cycle on this controller (block probe running or stopping, or the plate probe).
  function cycle(m){var b=current(m);return !!(m&&(m.probing===true||b&&(b.state==='running'||b.state==='stopping')));}
  function refused(reason){return {ready:false,reason:reason};}
  // Whether Palper… can be touched, and else the first actionable reason (an empty reason: inactive while busy).
  // s: {machine, connected, pilot, profile, operation, diameter, wcs, pending, validate}.
  function launchState(s){
    var m=s.machine;
    if(!m)return refused(t('Aucune machine connectée : touchez Connecter la CNC dans le Menu.'));
    if(m.fresh!==true||s.connected===false)return refused(t('État machine trop ancien : attendez un rapport récent.'));
    if(s.pilot&&s.pilot.state==='other')return refused(t('Pilotée par « ')+String(s.pilot.name||s.pilot.value||'?')+t(' » : touchez Pilote (bandeau) pour prendre la main.'));
    if(cycle(m))return refused('');
    var errors=typeof s.validate==='function'?s.validate(s.profile,s.operation,s.diameter):[];
    if(errors.length)return refused(errors[0]+(errors[0]===t('Diamètre outil / pige à renseigner.')?'':t(' Ouvrez Profils de sonde.')));
    var active=m.operator&&WCS.indexOf(m.operator.wcs)>=0?m.operator.wcs:null;
    if(!active)return refused(t('Repère actif inconnu : attendez un rapport de la machine.'));
    if(s.wcs!==active)return refused(t('Repère choisi ')+s.wcs+t(' différent du repère actif ')+active+t(' : choisissez ')+active+'.');
    if(m.canBlockProbe!==true){
      var why=typeof m.blockProbeReason==='string'?m.blockProbeReason:'';
      if(!why)return refused(m.canBlockProbe===false?t('Palpage au bloc indisponible dans l’état actuel de la machine.'):t('Palpage au bloc non pris en charge par ce serveur CNCjs : mettez-le à jour.'));
      return refused(msg(why)+(/^Test du contact/.test(why)?t(' Ouvrez Diagnostic de l’entrée.'):''));
    }
    if(s.pending)return refused('');
    return {ready:true,reason:''};
  }
  // Where to put the tool before touching Palper… (shown when nothing blocks).
  function startHint(operation){
    if(operation==='Z')return t('Outil au-dessus du bloc, pince en place.');
    if(operation==='XYZ')return t('Outil au-dessus du coin extérieur du bloc, pince en place.');
    return t('Outil à côté de la face, à la hauteur de palpage, à moins de la distance de recherche.');
  }
  function n(v){return typeof v==='number'&&isFinite(v)?String(v):'?';}
  function fixed(v){return typeof v==='number'&&isFinite(v)?v.toFixed(3):'—';}
  // The confirmation's note, with the server's numbers (ticket.blockProbe, contract § 3.1).
  function signed(v){return typeof v==='number'&&isFinite(v)&&v<0?'−'+n(-v):n(v);}
  // What the server adds to the contact on X / Y (ticket.blockProbe.offsets): a wrong face sign shows here.
  function offsetNote(b,axis){
    var o=b.offsets&&b.offsets[axis];if(!o||typeof o!=='object'||typeof o.total!=='number'||typeof o.radius!=='number')return '';
    return t(' Zéro ')+axis+t(' = contact ')+(o.total<0?'− ':'+ ')+n(Math.abs(o.total))+t(' mm (rayon ')+n(Math.abs(o.radius))+t(' vers ')+axis+(o.radius<0?'−':'+')+t(', face ')+signed(o.face)+').';
  }
  function zNote(b){var o=b.offsets&&b.offsets.Z;return o&&typeof o.thickness==='number'?t(' Zéro Z = contact − ')+n(o.thickness)+t(' mm (épaisseur du bloc).'):'';}
  function dialogNote(b){
    if(!b||typeof b!=='object')return '';
    var end=t(' Origine ')+b.wcs+t(' écrite seulement à la fin.');
    if(b.axes==='Z')return t('Descente de ')+n(b.search)+t(' mm au plus.')+zNote(b)+end;
    if(b.axes==='X'||b.axes==='Y'){var d=b.direction&&b.direction[b.axes];return t('Recherche de ')+n(b.search)+t(' mm au plus vers ')+b.axes+(d===1?'+':d===-1?'−':'')+t(', sans mouvement en Z.')+offsetNote(b,b.axes)+end;}
    if(b.axes==='XYZ')return t('Centre de l’outil au-dessus du bloc, à ')+n(b.window)+t(' mm au plus en retrait des deux faces. L’outil palpe Z, sort de ')+n(b.lateral)+
      t(' mm de chaque côté, descend de ')+n(b.depth)+t(' mm sous le dessus du bloc, palpe X puis Y et revient au-dessus du coin de la pièce. Rien ne doit dépasser le dessus du bloc à moins de ')+n(b.reach)+t(' mm du point de départ.')+
      t(' Jamais au bord du trou du bloc.')+zNote(b)+offsetNote(b,'X')+offsetNote(b,'Y')+end;
    return '';
  }
  var STEP_AXIS={FAST:'approche',RETRACT:'retrait',SLOW:'touche lente',CLEAR:'dégagement',TRAVERSE:'déplacement latéral',DESCENT:'descente surveillée',LIFT:'remontée'};
  var STEP_PLAIN={CHECK:'Vérifications',RETURN:'Retour au-dessus du coin',WRITE:'Écriture de l’origine',VERIFY:'Vérification'};
  function stepLabel(code){
    if(Object.prototype.hasOwnProperty.call(STEP_PLAIN,code))return t(STEP_PLAIN[code]);
    var m=/^([XYZ])_([A-Z]+)$/.exec(String(code||''));
    return m&&Object.prototype.hasOwnProperty.call(STEP_AXIS,m[2])?m[1]+' · '+t(STEP_AXIS[m[2]]):String(code||'');
  }
  function progress(b){var s=b&&b.step;return s&&typeof s.index==='number'&&typeof s.total==='number'&&s.total>0?Math.max(0,Math.min(100,Math.round(100*s.index/s.total))):0;}
  // The failure as the server builds it: the code's sentence, then whether the origin changed, then $H.
  function failureText(f,written,needsHoming){
    f=f&&typeof f==='object'?f:{};
    var end=(written==='no'?t(' Origine de travail inchangée.'):t(' Le repère a peut-être changé : vérifiez-le avant tout travail.'))+(needsHoming?t(' Refaites la prise d’origine ($H) avant de recommencer.'):'');
    var phrase=f.code&&typeof uiLocale.format==='function'?uiLocale.format(f.code,f.params||{},''):'';
    if(phrase&&phrase!==t(NO_DETAIL))return phrase+end;
    // Unknown code: the server's whole message (it carries its own endings).
    return typeof f.message==='string'&&f.message?msg(f.message):t('Palpage interrompu sans détail du serveur.')+end;
  }
  function work(w){return w&&typeof w==='object'?'X '+fixed(w.x)+' · Y '+fixed(w.y)+' · Z '+fixed(w.z):'—';}
  // {phase, message} of the Sonde screen for the controller's last block probe.
  function summary(b){
    if(!b)return {phase:'',message:''};
    if(b.state==='running'){var s=b.step||{};return {phase:t('Étape ')+n(s.index)+' / '+n(s.total)+' · '+stepLabel(s.code),message:t('Palpage en cours. Arrêter interrompt.')};}
    var failed=failureText(b.failure,b.written,b.needsHoming);
    if(b.state==='stopping')return {phase:t('Arrêt en cours…'),message:failed};
    if(b.state==='done')return {phase:t('Palpage ')+b.axes+t(' terminé'),message:t('Origine ')+b.wcs+t(' écrite. Position de travail : ')+work(b.work)+'.'};
    return {phase:t('Palpage interrompu'),message:failed};
  }
  // Results screen: one line per probed axis, the G10 line sent, the work position read back.
  function resultLines(b){
    if(!b)return [t('Aucun palpage au bloc sur cette machine depuis le démarrage du serveur.')];
    var lines=['X','Y','Z'].filter(function(a){return has(b.axes,a);}).map(function(a){
      var v=function(o){return o&&typeof o==='object'?fixed(o[a]):'—';};
      return a+t(' · contact machine ')+v(b.contacts)+t(' · zéro machine ')+v(b.origin)+t(' · valeur écrite ')+v(b.values);
    });
    lines.push(t('Ligne envoyée : ')+(typeof b.command==='string'&&b.command?b.command:'—'));
    lines.push(t('Position de travail relue : ')+work(b.work));
    return lines;
  }
  // A refusal of the prepare request (error from job-controls.js): a profile field named in the interface language.
  var FIELDS={diameter:'diamètre de l’outil',corner:'coin de montage',directionX:'sens de recherche X',directionY:'sens de recherche Y',wcs:'repère de travail'};
  function refusalText(e,fieldNames){
    if(!e)return '';
    if((e.code==='ETOUCH_PROBE_PARAM'||e.code==='ETOUCH_PROBE_MISSING')&&e.params&&typeof e.params.field==='string'&&typeof uiLocale.format==='function'){
      var k=e.params.field,params={};Object.keys(e.params).forEach(function(p){params[p]=e.params[p];});
      params.field=fieldNames&&Object.prototype.hasOwnProperty.call(fieldNames,k)?fieldNames[k]:Object.prototype.hasOwnProperty.call(FIELDS,k)?t(FIELDS[k]):k;
      var out=uiLocale.format(e.code,params,'');if(out&&out!==t(NO_DETAIL))return out;
    }
    return String(e.message||'');
  }
  var api={request:request,launchState:launchState,startHint:startHint,dialogNote:dialogNote,stepLabel:stepLabel,progress:progress,summary:summary,resultLines:resultLines,failureText:failureText,refusalText:refusalText,cycle:cycle};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CNCProbeReal=api;
})(typeof window==='undefined'?this:window);
