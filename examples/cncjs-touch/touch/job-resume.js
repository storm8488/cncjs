(function(root){
  'use strict';
  var uiLocale=(typeof window!=='undefined'&&window.cncI18n)||{t:function(s){return s;}};
  var t=function(s){return uiLocale.t(s);};
  // A server text shown as it comes, translated when the catalogue has it (its fixed notes), else in French.
  var message=function(s){return typeof uiLocale.message==='function'?uiLocale.message(s):t(s);};
  // Grbl acknowledges a line when it enters its planner, up to ~15 moves before
  // it is executed: a resume after a stop starts that far back.
  var PLANNER_MARGIN=15;
  function spindleText(s){return s?s.mode+' S'+s.speed:'';}
  // What Suivi says while the program itself holds the job (M0, M1, M6, error).
  // Laser profile (PROFILES-CONTRACT.md §2-§4): no tool change, no plate, a resume at a pass boundary.
  function laserOf(c){var p=c&&c.machineProfile;return !!(p&&typeof p==='object'&&p.kind==='laser');}
  // A refused capability carries a code (no params): translated alone, else the server's French reason.
  function capabilityOf(c,name){var k=c&&c.machineProfile&&c.machineProfile.capabilities,v=k&&k[name];if(!v||typeof v!=='object')return {supported:false,reason:''};
    var reason=typeof v.reason==='string'?v.reason:'';if(v.supported!==true&&typeof v.code==='string'&&v.code&&uiLocale.format)reason=uiLocale.format(v.code,{},reason);
    return {supported:v.supported===true,reason:reason};}
  function laserPlan(p){return !!(p&&(p.mode==='laser'||p.kind==='laser'||p.preview&&p.preview.kind==='laser'));}
  function pauseText(p,c){
    if(!p)return '';
    if(p.kind==='M6'&&laserOf(c))return t('Pause sur M6 : le changement d’outil n’est pas géré pour un laser. Arrêtez le travail et vérifiez le programme.');
    if(p.kind==='M6')return t('Changement d’outil')+(p.tool!==null&&p.tool!==undefined?' T'+p.tool:'')+t(' : attendez l’arrêt, arrêtez la broche (M5), changez l’outil et refaites le zéro Z si sa longueur change, puis touchez Reprendre.')+
      (p.restartSpindle?t(' La broche sera relancée (')+spindleText(p.restartSpindle)+t(', 3 s) avant la reprise.'):'');
    if(p.kind==='M0'||p.kind==='M1')return t('Pause demandée par le programme (')+p.kind+')'+(p.message?' : '+p.message:'')+t('. Touchez Reprendre quand vous êtes prêt.');
    if(p.kind==='error')return t('Pause sur une erreur Grbl : arrêtez le travail, corrigez la cause, puis reprenez à une ligne.');
    return '';
  }
  // Plate probe parameters of the confirmation being prepared (set by the panel below).
  var pendingPlate=null;
  function plateNote(p){
    return t('Plaque de ')+p.thickness+t(' mm posée sous l’outil et sonde branchée ? Descente de ')+p.search+t(' mm au plus ; le dessus de la plaque deviendra Z = épaisseur, puis l’outil remontera jusqu’à 5 mm au-dessus, sans dépasser sa hauteur de départ.');
  }
  function lastZeroText(z){
    if(!z)return '';
    if(z.failed)return t('Dernier palpage échoué : ')+z.failed;
    return t('Dernier zéro Z : plaque ')+z.thickness+t(' mm, repère ')+z.wcs+t(', contact à Z machine ')+z.machineZ+'.';
  }
  // Extra line in the confirmation dialog.
  // `request`: the parameters the confirmation was prepared with (a later tap must not change the note).
  function dialogNote(operation,c,request){
    if(operation==='zeroZ')return request&&request.thickness!==undefined?plateNote(request):pendingPlate?plateNote(pendingPlate):'';
    if(!c)return '';
    var p=c.programPause;
    if(operation==='resume'&&p&&p.kind==='M6'&&laserOf(c))return '';
    if(operation==='resume'&&p&&p.kind==='M6')return t('Outil')+(p.tool!==null&&p.tool!==undefined?' T'+p.tool:'')+t(' en place et zéro Z vérifié ?')+(p.restartSpindle?t(' La broche sera relancée (')+spindleText(p.restartSpindle)+t(', 3 s) avant la reprise.'):'');
    if(operation==='start'&&c.resume&&(laserOf(c)||laserPlan(c.resume))){var lr=c.resume;
      return t('Reprise laser à la ligne ')+lr.from+' / '+lr.total+' : '+lr.line+t('. Laser éteint (M5), déplacement en XY jusqu’au début de passe (Z rétabli seulement si le programme garde un Z constant), puis M3/M4 et consigne S du programme.')+notesText(lr.notes);}
    if(operation==='start'&&c.resume){var r=c.resume;
      return t('Reprise à la ligne ')+r.from+' / '+r.total+' : '+r.line+(r.tool!==null&&r.tool!==undefined?t(' — outil attendu T')+r.tool:'')+t('. La machine monte à la hauteur de dégagement, se place en XY, relance la broche puis plonge.')+notesText(r.notes);}
    return '';
  }
  // Server notes on a rebuilt program (units, work frame, clearance): French strings written by the
  // server, like its messages; its fixed notes are in the catalogue, the others are shown as they come.
  function notesText(notes){return Array.isArray(notes)&&notes.length?' '+notes.filter(function(n){return typeof n==='string'&&n;}).map(message).join(' '):'';}
  function suggestedLine(c,file){
    if(!c||typeof c.stoppedAtLine!=='number'||c.stoppedFile!==file)return null;
    return Math.max(2,c.stoppedAtLine-PLANNER_MARGIN);
  }
  function planText(plan){
    var pv=plan&&plan.preview&&typeof plan.preview==='object'?plan.preview:null;
    if(laserPlan(plan)){
      var lines=[t('Ligne ')+plan.from+' / '+plan.total+' : '+plan.line+'.',t('Début de passe : laser éteint (M5), G0 en XY jusqu’au départ (Z rétabli seulement si le programme garde un Z constant), puis M3/M4 et consigne S du programme.')];
      if(pv&&Array.isArray(pv.preamble)&&pv.preamble.length)lines.push(t('Lignes envoyées avant la reprise : ')+pv.preamble.filter(function(l){return typeof l==='string';}).join(' · ')+'.');
      if(Array.isArray(plan.notes))plan.notes.forEach(function(n){if(typeof n==='string'&&n)lines.push(message(n));});
      return lines.join(' ');
    }
    var parts=[t('Ligne ')+plan.from+' / '+plan.total+' : '+plan.line+'.'];
    parts.push(t('Départ : Z ')+plan.safeZ+t(', puis X ')+plan.position.X+' Y '+plan.position.Y+t(', plongée à Z ')+plan.position.Z+'.');
    if(plan.spindle)parts.push(t('Broche ')+spindleText(plan.spindle)+t(' relancée 3 s avant la plongée.'));
    if(plan.coolant)parts.push(t('Arrosage ')+plan.coolant+'.');
    if(plan.tool!==null&&plan.tool!==undefined)parts.push(t('Outil attendu : T')+plan.tool+t(' (vérifiez qu’il est en place et que le zéro Z lui correspond).'));
    if(Array.isArray(plan.notes))plan.notes.forEach(function(n){if(typeof n==='string'&&n)parts.push(message(n));});
    return parts.join(' ');
  }
  var api={pauseText:pauseText,dialogNote:dialogNote,laserOf:laserOf,capabilityOf:capabilityOf,suggestedLine:suggestedLine,planText:planText,plateNote:plateNote,lastZeroText:lastZeroText,PLANNER_MARGIN:PLANNER_MARGIN,
    setPendingPlate:function(p){pendingPlate=p;}};
  if(typeof module==='object'&&module.exports){module.exports=api;return;}
  root.CNCJobResume=api;
  var ready=document.getElementById('home-job-ready');if(!ready)return;
  var simulation=document.body.getAttribute('data-simulation')==='true';
  if(simulation)return; // the simulation has no file to rebuild nor real program pauses
  function el(tag,id,cls,text){var e=document.createElement(tag);if(id)e.id=id;if(cls)e.className=cls;if(text)e.textContent=t(text);return e;}
  function after(ref,node){var p=ref.parentNode;if(!p)return;if(ref.nextSibling)p.insertBefore(node,ref.nextSibling);else p.appendChild(node);}
  // Program pause notice with the M5 button.
  var pause=el('div','home-program-pause','t-notice'),pauseText_=el('p','home-program-pause-text'),m5=el('button','home-pause-m5','t-btn t-btn--warn','Arrêter la broche (M5)');
  pause.setAttribute('data-tone','warn');pause.setAttribute('role','status');pause.hidden=true;m5.hidden=true;pause.appendChild(pauseText_);pause.appendChild(m5);
  // Resume from a line.
  var open=el('button','home-resume-line','t-btn','Reprendre à une ligne…'),panel=el('div','home-resume-panel','t-card'),
    label=el('label','home-resume-label','','Ligne de reprise'),input=el('input','home-resume-input'),hint=el('p','home-resume-hint','t-help'),
    check=el('button','home-resume-check','t-btn','Vérifier'),load=el('button','home-resume-load','t-btn t-btn--primary','Charger la reprise'),
    cancel=el('button','home-resume-cancel','t-btn t-btn--ghost','Annuler'),plan=el('p','home-resume-plan','t-help');
  // Text fields read by the shared parser (numeric-pad.js): a comma or a point, empty, zero
  // and unreadable kept apart; a tap opens the shared key pad with the unit and the limits.
  input.setAttribute('type','text');input.setAttribute('inputmode','numeric');input.setAttribute('autocomplete','off');
  var LINE_RULES={label:t('Ligne de reprise'),unit:t('ligne'),min:2,integer:true,negative:false};
  plan.setAttribute('role','status');open.hidden=true;panel.hidden=true;load.disabled=true;
  var lineRow=el('div','home-resume-row','t-field-row');lineRow.appendChild(input);var lineUnit=el('span');lineUnit.textContent=t('n° de ligne, 2 ou plus');lineRow.appendChild(lineUnit);
  [label,lineRow,hint,check,load,cancel,plan].forEach(function(n){panel.appendChild(n);});
  // Z zero with a touch plate: thickness and search distance, remembered on this device.
  var plate=el('div','home-plate','t-card'),plateTitle=el('p','home-plate-title','','Zéro Z avec une plaque'),
    thickLabel=el('label','home-plate-thickness-label','','Épaisseur de la plaque (mm)'),thick=el('input','home-plate-thickness'),
    searchLabel=el('label','home-plate-search-label','','Descente maximale (mm)'),search=el('input','home-plate-search'),
    probe=el('button','home-plate-probe','t-btn','Palper le zéro Z…'),plateHelp=el('p','home-plate-help','t-help','Posez la plaque sur la pièce sous l’outil et branchez la sonde. Descente à 100 mm/min, recul 1 mm, seconde touche à 25 mm/min ; le dessus de la plaque devient Z = épaisseur, puis l’outil remonte jusqu’à 5 mm au-dessus, sans dépasser sa hauteur de départ.'),
    plateLast=el('p','home-plate-last','t-help'),plateStatus=el('p','home-plate-status','t-notice');
  var THICK_RULES={label:t('Épaisseur de la plaque'),unit:'mm',min:0.01,max:50,negative:false},SEARCH_RULES={label:t('Descente maximale'),unit:'mm',min:1,max:100,negative:false};
  [thick,search].forEach(function(i){i.setAttribute('type','text');i.setAttribute('inputmode','decimal');i.setAttribute('autocomplete','off');});
  function fieldRow(field,rules){var row=el('div','','t-field-row');row.appendChild(field);var unit=el('span');unit.textContent=rules.unit+' · '+(window.CNCNumeric?window.CNCNumeric.limits(rules):'');row.appendChild(unit);return row;}
  plateStatus.setAttribute('role','status');plate.hidden=true;
  [plateTitle,thickLabel,fieldRow(thick,THICK_RULES),searchLabel,fieldRow(search,SEARCH_RULES),probe,plateHelp,plateLast,plateStatus].forEach(function(n){plate.appendChild(n);});
  if(window.CNCNumeric&&typeof window.CNCNumeric.bind==='function'){window.CNCNumeric.bind(thick,THICK_RULES);window.CNCNumeric.bind(search,SEARCH_RULES);window.CNCNumeric.bind(input,LINE_RULES);}
  var PLATE_KEY='cncjs-touch-plate-v1';
  function loadPlate(){try{var v=JSON.parse(localStorage.getItem(PLATE_KEY)||'null');if(v&&typeof v==='object'){thick.value=v.thickness>0?String(v.thickness):'';search.value=v.search>0?String(v.search):'10';return;}}catch(_){}
    thick.value='';search.value='10';}
  function savePlate(p){try{localStorage.setItem(PLATE_KEY,JSON.stringify(p));}catch(_){}}
  // Shared parser (numeric-pad.js): {state, value, message}; only 'ok' carries a value.
  function parsed(v,rules){
    if(window.CNCNumeric&&typeof window.CNCNumeric.parse==='function')return window.CNCNumeric.parse(v,rules);
    // Same rules without the pad (messages come from the pad module only).
    var s=String(v===null||v===undefined?'':v).trim(),n=Number(s.replace(',','.'));rules=rules||{};
    if(!s)return {state:'empty',value:null,message:''};
    if(!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(s)||!isFinite(n))return {state:'invalid',value:null,message:''};
    if(n<0&&rules.negative===false)return {state:'negative',value:n,message:''};
    if(rules.integer&&Math.floor(n)!==n)return {state:'integer',value:n,message:''};
    if((typeof rules.min==='number'&&n<rules.min)||(typeof rules.max==='number'&&n>rules.max))return {state:'range',value:n,message:''};
    return {state:'ok',value:n,message:''};
  }
  // Laser framing (PROFILES-CONTRACT.md §4) in place of the plate: offered only when the server
  // says it is possible, otherwise disabled with its reason. Confirmed through the usual dialog.
  var frame=el('div','home-frame','t-card'),frameTitle=el('p','home-frame-title','','Cadrage du programme (laser éteint)'),
    frameStart=el('button','home-frame-start','t-btn','Cadrer…'),frameHelp=el('p','home-frame-help','t-help','La tête parcourt le contour XY du programme à la hauteur actuelle, M5 envoyé d’abord : aucune émission. Arrêter interrompt le mouvement.'),
    frameWhy=el('p','home-frame-why','t-help');
  frameWhy.setAttribute('role','status');frame.hidden=true;
  [frameTitle,frameStart,frameHelp,frameWhy].forEach(function(n){frame.appendChild(n);});
  frameStart.addEventListener('click',function(){var c=controls();if(frameStart.disabled||!c||typeof c.prepareFrame!=='function')return;c.prepareFrame();});
  loadPlate();
  after(ready,pause);after(pause,open);after(open,panel);after(panel,plate);after(plate,frame);
  var machine=null,selection=window.cncLibrarySelection||null,checked=null,sequence=0,plateMessage='';
  function controls(){return window.cncJobControls;}
  function set(node,key,value){if(node[key]!==value)node[key]=value;}
  function canResumeFromLine(){return !!(machine&&selection&&machine.fresh&&machine.workflow==='idle'&&machine.canLoad);}
  // A laser resumes only at a pass boundary the server identifies: unsupported, the button stays
  // shown but disabled with the server's reason (never a decorative button).
  function laserResume(){return laserOf(machine)?capabilityOf(machine,'laserResume'):null;}
  function close(){panel.hidden=true;checked=null;sequence++;set(load,'disabled',true);set(plan,'textContent','');if(window.cncResumePreview)window.cncResumePreview.hide(panel);}
  function render(){
    var p=machine&&machine.programPause;
    var laser=laserOf(machine),lr=laserResume();
    var text=pauseText(p,machine);if(p&&p.kind==='M6'&&!laser&&machine.canZeroZ)text+=t(' Le zéro Z avec la plaque se règle ci-dessous.');
    // Spindle still on with no job (the board finished its buffer after a lost link or CNCjs restart):
    // the server accepts M5 from anyone, so the same button is offered at rest (E3).
    var turning=!!(machine&&!p&&machine.workflow==='idle'&&machine.canSpindleStop&&machine.spindleSpeed>0);
    if(turning)text=laser?t('Le laser est encore allumé alors qu’aucun travail n’est en cours : éteignez-le (M5).'):t('La broche tourne encore alors qu’aucun travail n’est en cours : arrêtez-la (M5).');
    set(pause,'hidden',!(p||turning)||!text);set(pauseText_,'textContent',text);
    set(plate,'hidden',laser||!(machine&&(machine.canZeroZ||machine.probing)));
    var fc=laser?capabilityOf(machine,'laserFrame'):null,idle=!!(machine&&machine.workflow==='idle');
    set(frame,'hidden',!laser||!idle);
    var frameReason=fc&&!fc.supported?(fc.reason||t('Cadrage indisponible.')):'';
    set(frameStart,'disabled',!!frameReason);set(frameStart,'title',frameReason);set(frameWhy,'textContent',frameReason);
    set(probe,'disabled',!(machine&&machine.canZeroZ));
    set(plateLast,'textContent',lastZeroText(machine&&machine.zeroZ));
    // A refused parameter stays shown until the field changes (reports come several times a second).
    set(plateStatus,'textContent',machine&&machine.probing?t('Palpage en cours… Arrêter interrompt.'):plateMessage);
    set(m5,'hidden',!((p||turning)&&machine.canSpindleStop&&machine.spindleSpeed>0));
    set(m5,'textContent',laser?t('Éteindre le laser (M5)'):t('Arrêter la broche (M5)'));
    set(open,'textContent',laser?t('Reprendre à un début de passe…'):t('Reprendre à une ligne…'));
    var can=canResumeFromLine();set(open,'hidden',!can||!panel.hidden);
    set(open,'disabled',!!lr&&!lr.supported);set(open,'title',lr&&!lr.supported?(lr.reason||t('Reprise laser indisponible.')):'');
    // A job that starts closes the panel; a passing refusal (an M5 or a $G on
    // its way) only disables the load and keeps the check.
    if(!panel.hidden&&(!machine||!selection||machine.workflow!=='idle'))close();
    else set(load,'disabled',!checked||!can);
    // Presentation only (performance-v2.css): an open plate or resume form gets its room in the v2 messages slot.
    var left=document.getElementById('home-left'),board=left&&left.parentNode,form=!plate.hidden||!panel.hidden?'1':'0';
    if(board&&typeof board.setAttribute==='function'&&board.getAttribute('data-v2-form')!==form)board.setAttribute('data-v2-form',form);
  }
  function line(){var p=parsed(input.value,LINE_RULES);return p.state==='ok'?p.value:null;}
  open.addEventListener('click',function(){
    if(!canResumeFromLine()||open.disabled)return;
    var s=suggestedLine(machine,selection.file);input.value=s===null?'':String(s);
    set(hint,'textContent',typeof machine.stoppedAtLine==='number'&&machine.stoppedFile===selection.file?
      t('Dernier arrêt après la ligne ')+machine.stoppedAtLine+t(' (acquittée). Jusqu’à 15 mouvements acquittés peuvent ne pas avoir été exécutés : ligne proposée ')+s+'.':
      t('Numéro de ligne tel qu’affiché pendant le travail (lignes non vides).')+(laserOf(machine)?' '+t('Laser : le serveur reprend au début de passe qu’il identifie (laser éteint par M5, S0 ou un G0 après une découpe).'):''));
    panel.hidden=false;render();
  });
  cancel.addEventListener('click',function(){close();render();});
  input.addEventListener('input',function(){checked=null;set(load,'disabled',true);set(plan,'textContent','');});
  check.addEventListener('click',function(){
    var n=line(),c=controls(),own=++sequence;
    if(n===null){var why=parsed(input.value,LINE_RULES);set(plan,'textContent',t('Indiquez une ligne (2 ou plus).')+(why.message?' '+why.message:''));return;}
    if(!c||typeof c.resumePlan!=='function')return;
    set(plan,'textContent',t('Vérification…'));
    c.resumePlan(selection.file,n).then(function(data){if(own!==sequence)return;checked={file:selection.file,line:n};set(plan,'textContent',planText(data));set(load,'disabled',false);
      // The server's exact preamble and the file from the resume line, drawn by lot C (never recomputed here).
      if(window.cncResumePreview)window.cncResumePreview.show(panel,data&&data.preview);},
      function(e){if(own!==sequence)return;checked=null;set(load,'disabled',true);set(plan,'textContent',e.message);});
  });
  load.addEventListener('click',function(){
    var c=controls();if(!checked||!c||typeof c.loadFrom!=='function'||load.disabled)return;
    var target=checked;set(load,'disabled',true);
    c.loadFrom(target.file,target.line).then(function(){close();render();},function(e){set(plan,'textContent',e.message);set(load,'disabled',false);});
  });
  probe.addEventListener('click',function(){
    var c=controls();if(!c||typeof c.prepareCommand!=='function'||probe.disabled)return;
    // Empty, unreadable and out-of-range values are told apart; none of them becomes a number.
    var th=parsed(thick.value,THICK_RULES),se=parsed(search.value,SEARCH_RULES);
    if(th.state!=='ok'){plateMessage=t('Indiquez l’épaisseur de la plaque (mm).')+(th.message?' '+th.message:'');render();return;}
    if(se.state!=='ok'){plateMessage=t('Descente maximale invalide (1 à 100 mm).')+(se.message?' '+se.message:'');render();return;}
    var params={thickness:Math.round(th.value*1000)/1000,search:Math.round(se.value*1000)/1000};
    savePlate(params);pendingPlate=params;plateMessage='';render();
    c.prepareCommand('zeroZ',params);
  });
  [thick,search].forEach(function(field){field.addEventListener('input',function(){if(plateMessage){plateMessage='';render();}});});
  m5.addEventListener('click',function(){var c=controls();if(c&&typeof c.spindleStop==='function')c.spindleStop().catch(function(){});});
  window.addEventListener('cnc-job-status',function(e){var d=e&&e.detail||{};if(d.simulation)return;machine=d.machine||null;render();});
  window.addEventListener('cnc-library-select',function(e){selection=e&&e.detail||null;if(checked&&(!selection||checked.file!==selection.file))close();render();});
  render();
})(typeof window==='object'?window:this);
