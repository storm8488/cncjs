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
    if(p.kind==='M6'&&laserOf(c))return t('Ce laser ne gère pas le changement d’outil. Arrêtez et vérifiez le fichier.');
    if(p.kind==='M6')return t('Changement d’outil')+(p.tool!==null&&p.tool!==undefined?' T'+p.tool:'')+t(' : attendez l’arrêt, arrêtez la broche, changez la fraise et refaites le zéro Z.')+
      (p.restartSpindle?t(' La broche sera relancée (')+p.restartSpindle.speed+t(' tr/min')+t(', 3 s) avant la reprise.'):'');
    if(p.kind==='M0'||p.kind==='M1')return t('Pause demandée par le fichier. Touchez Reprendre quand vous êtes prêt.');
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
    if(operation==='resume'&&p&&p.kind==='M6')return t('Outil')+(p.tool!==null&&p.tool!==undefined?' T'+p.tool:'')+t(' en place et zéro Z vérifié ?')+(p.restartSpindle?t(' La broche sera relancée (')+p.restartSpindle.speed+t(' tr/min')+t(', 3 s) avant la reprise.'):'');
    if(operation==='start'&&c.resume&&(laserOf(c)||laserPlan(c.resume))){var lr=c.resume;
      return t('Reprise laser à la ligne ')+lr.from+' / '+lr.total+t('. Le laser reste éteint pendant le déplacement, puis reprend la puissance du fichier.');}
    if(operation==='start'&&c.resume){var r=c.resume;
      return t('Reprise à la ligne ')+r.from+' / '+r.total+(r.tool!==null&&r.tool!==undefined?t(' — outil attendu T')+r.tool:'')+t('. La machine monte à la hauteur de dégagement, se place en XY, relance la broche puis plonge.');}
    return '';
  }
  // Server notes on a rebuilt program (units, work frame, clearance): French strings written by the
  // server, like its messages; its fixed notes are in the catalogue, the others are shown as they come.
  function suggestedLine(c,file){
    if(!c||typeof c.stoppedAtLine!=='number'||!isFinite(c.stoppedAtLine)||c.stoppedAtLine<=0||c.stoppedFile!==file)return null;
    return Math.max(2,c.stoppedAtLine-PLANNER_MARGIN);
  }
  function planText(plan){
    var pv=plan&&plan.preview&&typeof plan.preview==='object'?plan.preview:null;
    var file=plan&&plan.file?t('Fichier : ')+plan.file+' · ':'';
    if(laserPlan(plan)){
      var lines=[t('Ligne ')+plan.from+' / '+plan.total+' : '+plan.line+'.',t('Début de passe : laser éteint (M5), G0 en XY jusqu’au départ (Z rétabli seulement si le programme garde un Z constant), puis M3/M4 et consigne S du programme.')];
      if(pv&&Array.isArray(pv.preamble)&&pv.preamble.length)lines.push(t('Lignes envoyées avant la reprise : ')+pv.preamble.filter(function(l){return typeof l==='string';}).join(' · ')+'.');
      if(Array.isArray(plan.notes))plan.notes.forEach(function(n){if(typeof n==='string'&&n)lines.push(message(n));});
      return file+lines.join(' ');
    }
    var parts=[t('Ligne ')+plan.from+' / '+plan.total+' : '+plan.line+'.'];
    parts.push(t('Départ : Z ')+plan.safeZ+t(', puis X ')+plan.position.X+' Y '+plan.position.Y+t(', plongée à Z ')+plan.position.Z+'.');
    if(plan.spindle)parts.push(t('Broche ')+spindleText(plan.spindle)+t(' relancée 3 s avant la plongée.'));
    if(plan.coolant)parts.push(t('Arrosage ')+plan.coolant+'.');
    if(plan.tool!==null&&plan.tool!==undefined)parts.push(t('Outil attendu : T')+plan.tool+t(' (vérifiez qu’il est en place et que le zéro Z lui correspond).'));
    if(Array.isArray(plan.notes))plan.notes.forEach(function(n){if(typeof n==='string'&&n)parts.push(message(n));});
    return file+parts.join(' ');
  }
  // One presentation for the notice and the session bar; all permissions come from the server.
  function screenState(d){
    var m=d&&d.machine||null,h=d&&d.halt||{},out={word:t('Rien en cours'),text:t('Rien en cours.'),action:m&&m.name?'suite:check':'suite:files',label:t(m&&m.name?'Suite : Contrôle →':'Suite : Fichier →'),allowed:true,tone:'neutre',pause:false,plate:false};
    if(!m){out.text=t('État indisponible.');if(h.canStop){out.action='arreter-usinage';out.label=t('Arrêter l’usinage');out.allowed=true;}else if(h.canPause){out.action='pause';out.label=t('Pause');out.allowed=true;}return out;}
    var running=m.workflow==='running',paused=m.workflow==='paused',alarm=/^alarm/i.test(m.activeState||''),door=/^door/i.test(m.activeState||''),p=m.programPause;
    if(running||paused||door){out.action=paused||door?'reprendre':'pause';out.label=t(paused||door?'Reprendre…':'Pause');out.allowed=out.action==='pause'?!!m.canPause:!!(m.canResume&&!d.busy&&(!d.pilot||d.pilot.state!=='other'));}
    if(running){out.word=t('En cours')+' · '+(m.total>0?Math.min(99,Math.floor((m.received||0)/m.total*100)):'—')+' %';out.text=t(typeof m.stalledMs==='number'?'La machine attend. Si rien ne bouge, arrêtez l’usinage.':'Usinage en cours.');if(typeof m.stalledMs==='number')out.tone='warn';}
    if(paused){out.pause=true;out.tone='warn';out.word=t(p?'Pause du fichier':'Pause');out.text=t(p&&p.kind==='M6'?'Le fichier demande un changement de fraise.':p?'Pause demandée par le fichier.':'Pause. La broche tourne toujours.');out.plate=!!(p&&p.kind==='M6'&&!laserOf(m));if(p&&p.kind==='M6'&&laserOf(m))out.text=pauseText(p,m);
      if(!m.canResume){out.text=m.resumeReason?message(m.resumeReason):t('Reprise indisponible.');out.remedy='arreter-usinage';}
    }
    if(door){out.word=t('Porte ouverte');out.text=t('La porte de la machine est ouverte. Fermez-la.');out.tone='warn';}
    if(m.jobStopped&&!running&&!paused){out.tone='warn';var n=typeof m.stoppedAtLine==='number'&&isFinite(m.stoppedAtLine)&&m.stoppedAtLine>0?m.stoppedAtLine:null,s=suggestedLine(m,m.stoppedFile||m.name);
      out.word=typeof n==='number'?t('Arrêté ligne {n}').replace('{n}',n):t('Arrêté');out.text=typeof n==='number'?t('Arrêté à la ligne {n} sur {total}.').replace('{n}',n).replace('{total}',m.resume&&m.resume.total||m.total||'—'):t('Usinage arrêté avant la fin.');
      if(!m.homed||m.referenceLost){out.text+=' '+t('La machine a perdu sa position.');out.action='remise-en-route';out.label=t('Remise en route →');}
      else if(s!==null){out.action='changer-ligne';out.label=t('Reprendre à la ligne {n}…').replace('{n}',s);out.allowed=!!(m.fresh&&m.canLoad&&!d.busy&&(!d.pilot||d.pilot.state!=='other'));}
    }
    if(!running&&!paused&&(m.finished||m.finishedWithErrors)){out.word=t('Terminé');out.text=m.finishedWithErrors?t('Terminé avec {n} lignes refusées par la machine.').replace('{n}',m.jobErrors||0):d.summary&&d.summary.short||t('Terminé.');out.action='suite:files';out.label=t('Suite : Fichier →');out.plate=!laserOf(m);out.tone=m.finishedWithErrors?'danger':'neutre';out.details=!!m.finishedWithErrors;}
    if(!running&&!paused&&!m.jobStopped&&!m.finished&&!m.finishedWithErrors&&m.spindleSpeed>0){out.text=t(laserOf(m)?'Le laser est encore allumé : éteignez-le.':'La broche tourne encore : arrêtez-la.');out.pause=true;out.tone='warn';}
    if(alarm){var code=m.lastAlarm&&m.lastAlarm.code||m.alarmCode;out.word=t('Alarme')+(code?' '+code:'');var help=root.CNCGrblHelp&&root.CNCGrblHelp.alarm(code);out.text=out.word+(help?' : '+message(help.title):'')+'. '+t('Arrêtez l’usinage.');out.tone='danger';out.action='arreter-usinage';out.label=t('Arrêter l’usinage');out.allowed=!!m.canStop;out.plate=false;}
    if(m.probing&&out.plate)out.text=t('Zéro Z à la plaque en cours… Arrêter l’interrompt.');
    else if(m.zeroZ&&(paused||m.finished)&&out.plate)out.text=m.zeroZ.failed?message(m.resumeReason||m.zeroZ.failed):paused&&!m.canResume?out.text:t('Zéro Z posé à la plaque.');
    if(!m.fresh){out.text=t('Attendez une information à jour.');if(out.action!=='arreter-usinage'&&out.action!=='pause'&&out.action.indexOf('suite:')!==0)out.allowed=false;}
    return out;
  }

  var api={screenState:screenState,pauseText:pauseText,dialogNote:dialogNote,laserOf:laserOf,capabilityOf:capabilityOf,suggestedLine:suggestedLine,planText:planText,plateNote:plateNote,lastZeroText:lastZeroText,PLANNER_MARGIN:PLANNER_MARGIN,
    setPendingPlate:function(p){pendingPlate=p;}};
  if(typeof module==='object'&&module.exports){module.exports=api;return;}
  root.CNCJobResume=api;
  var simulation=document.body.getAttribute('data-simulation')==='true',ready=document.getElementById('home-job-ready');if(!ready)return;
  function el(tag,id,text,parent){var n=document.createElement(tag);if(id)n.id=id;if(text)n.textContent=t(text);if(parent)parent.appendChild(n);return n;}
  function button(parent,id,text,fn){var n=el('button',id,text,parent);n.type='button';n.className='t-btn';n.addEventListener('click',fn);return n;}
  var notice=el('div','home-notice','',ready.parentNode);notice.className='t-notice';notice.setAttribute('role','status');
  var noticeText=el('p','home-notice-text','',notice),actions=el('div','home-notice-actions','',notice);
  var m5=button(actions,'home-pause-m5','Arrêter la broche',function(){if(!m5.disabled&&controls())controls().spindleStop().catch(function(){});});
  var m5Reason=el('span','home-spindle-stop-reason','',notice);
  var open=button(actions,'home-resume-line','Reprendre à une ligne…',openResume),openReason=el('span','home-resume-reason','',notice);
  var details=button(actions,'home-notice-details','Détails',function(){if(root.cncShell)root.cncShell.details({lignes:[{libelle:t('Bilan'),valeur:summary&&summary.text||''},{libelle:t('Détails'),valeur:ready.textContent}],brut:machine});});
  var machine=null,status={},summary=null,sheet=null,panel=null,input=null,hint=null,plan=null,load=null,checked=null,resumeFile='',sequence=0,isOpen=false,loading=false,openedKey='',planKey='';
  var LINE_RULES={label:t('Ligne de reprise'),unit:t('ligne'),min:2,integer:true,negative:false};
  function controls(){return root.cncJobControls;}
  function set(n,key,v){if(n&&n[key]!==v)n[key]=v;}
  function targetFile(){return machine&&(machine.stoppedFile||machine.name)||'';}
  function identity(){return JSON.stringify(machine&&[machine.port,machine.generation,machine.revision,machine.stoppedFile,machine.name]);}
  function permitted(){var lr=laserOf(machine)?capabilityOf(machine,'laserResume'):null;return !!(machine&&machine.fresh&&machine.workflow==='idle'&&machine.canLoad&&targetFile()&&!status.busy&&(!status.pilot||status.pilot.state!=='other')&&(!lr||lr.supported));}
  function line(){var v=String(input&&input.value||'').trim();if(root.CNCNumeric){var parsed=root.CNCNumeric.parse(v,LINE_RULES);return parsed.state==='ok'?parsed.value:null;}var n=Number(v.replace(',','.'));return /^[+]?\d+(?:[.,]\d*)?$/.test(v)&&n>=2&&Math.floor(n)===n?n:null;}
  function close(){sequence++;isOpen=false;checked=null;loading=false;planKey='';set(load,'disabled',true);if(root.cncResumePreview&&panel)root.cncResumePreview.hide(panel);}
  function initialize(){
    if(sheet||!root.cncShell||!root.cncShell.sheet)return !!sheet;
    sheet=root.cncShell.sheet('ks-resume-sheet',t('Reprendre à une ligne'));panel=sheet.content;
    hint=el('p','home-resume-hint','',panel);var label=el('label','home-resume-label','Reprendre à la ligne',panel);input=el('input','home-resume-input','',panel);label.setAttribute('for',input.id);input.setAttribute('type','text');input.setAttribute('inputmode','numeric');input.setAttribute('autocomplete','off');
    if(root.CNCNumeric)root.CNCNumeric.bind(input,LINE_RULES);
    el('p','home-resume-route','La fraise remonte, va au-dessus du point, redescend, puis l’usinage reprend.',panel);
    button(panel,'home-resume-details','Détails',function(){root.cncShell.details({lignes:[{libelle:t('Détails'),valeur:checked?planText(checked.data):''}],brut:checked&&checked.data});});
    plan=el('p','home-resume-plan','',panel);plan.setAttribute('role','status');
    var remedy=el('div','home-resume-remedies','',panel);
    button(remedy,'home-resume-change','Changer la ligne',function(){if(root.CNCNumeric&&root.CNCNumeric.open)root.CNCNumeric.open(input,LINE_RULES);else input.focus();});
    button(remedy,'home-resume-begin','Reprendre au début',begin);
    load=button(panel,'home-resume-load','Charger la reprise',loadResume);load.className='t-btn t-btn--primary';load.disabled=true;
    input.addEventListener('input',requestPlan);input.addEventListener('change',function(){if(!checked||checked.line!==line())requestPlan();});return true;
  }
  function openResume(){
    if(!permitted()||!initialize())return;resumeFile=targetFile();openedKey=identity();planKey='';var n=suggestedLine(machine,resumeFile);input.value=String(n===null?2:n);isOpen=true;
    var title=document.getElementById('ks-resume-sheet-title');set(title,'textContent',t(laserOf(machine)?'Reprendre à un début de passe':'Reprendre à une ligne')+' — '+resumeFile);
    set(hint,'textContent',(typeof machine.stoppedAtLine==='number'?t('Arrêté à la ligne {n}.').replace('{n}',machine.stoppedAtLine):'')+' '+t('proposée : quinze mouvements avant l’arrêt'));
    sheet.open();requestPlan();render();
  }
  function error(e){checked=null;planKey='';set(load,'disabled',true);var r=root.cncRefus&&root.cncRefus.lire(e);set(plan,'textContent',r?r.phrase:message(e&&e.message||t('Action refusée.')));}
  function requestPlan(){
    if(!isOpen)return;var n=line(),file=resumeFile,key=identity(),next=JSON.stringify([key,file,n]);if(n!==null&&next===planKey)return;planKey=n===null?'':next;var own=++sequence;checked=null;set(load,'disabled',true);
    if(root.cncResumePreview)root.cncResumePreview.hide(panel);
    if(n===null){var invalid=root.CNCNumeric&&root.CNCNumeric.parse(input.value,LINE_RULES);set(plan,'textContent',t('Indiquez une ligne (2 ou plus).')+(invalid&&invalid.message?' '+invalid.message:''));return;}
    set(plan,'textContent',t('Vérification de la ligne…'));var c=controls();if(!c||!c.resumePlan)return;
    c.resumePlan(file,n).then(function(data){if(!isOpen||own!==sequence||file!==resumeFile||line()!==n||identity()!==key)return;
      checked={file:file,line:n,key:key,data:data};var check=data&&data.programCheck,view=root.CNCProgramCheckView;
      set(plan,'textContent',check&&view?view.fileVerdict(check).text:t('Ligne vérifiée.'));
      set(load,'disabled',!permitted()||loading);
      if(root.cncResumePreview)root.cncResumePreview.show(panel,data&&data.preview);
    },function(e){if(isOpen&&own===sequence&&identity()===key)error(e);});
  }
  function loadResume(){
    var c=controls(),target=checked;if(!target||load.disabled||!permitted()||loading||target.line!==line()||target.key!==identity())return;
    loading=true;set(load,'disabled',true);var own=sequence;
    c.loadFrom(target.file,target.line).then(function(){if(!isOpen||own!==sequence)return;close();root.cncShell.closeSheet();root.cncShell.go('check');},function(e){if(!isOpen||own!==sequence)return;loading=false;error(e);});
  }
  function begin(){if(!permitted()||loading)return;var file=resumeFile,own=++sequence;checked=null;loading=true;set(load,'disabled',true);controls().loadFrom(file,1).then(function(){if(!isOpen||own!==sequence)return;close();root.cncShell.closeSheet();root.cncShell.go('check');},function(e){if(!isOpen||own!==sequence)return;loading=false;error(e);});}
  function render(){
    var state=screenState(Object.assign({},status,{summary:summary}));set(noticeText,'textContent',state.text);if(notice.getAttribute('data-tone')!==state.tone)notice.setAttribute('data-tone',state.tone);
    set(m5,'hidden',!state.pause);set(m5,'disabled',!(machine&&machine.canSpindleStop));set(m5,'textContent',t(laserOf(machine)?'Éteindre le laser':'Arrêter la broche'));
    set(m5Reason,'textContent',state.pause&&!(machine&&machine.canSpindleStop)?message(machine&&machine.spindleStopReason||t('Arrêt de la broche indisponible.')):'');
    set(open,'hidden',false);set(open,'disabled',!permitted());set(open,'textContent',t(laserOf(machine)?'Reprendre à un début de passe…':'Reprendre à une ligne…'));
    var lr=laserOf(machine)?capabilityOf(machine,'laserResume'):null;set(open,'title',lr&&!lr.supported?lr.reason:'');
    set(openReason,'textContent',permitted()?'':lr&&!lr.supported?lr.reason:!targetFile()?t('Aucun fichier chargé.'):machine&&machine.workflow!=='idle'?t('Un usinage est en cours.'):message(machine&&machine.loadReason||t('Impossible pour l’instant.')));
    set(details,'hidden',!state.details);
    if(isOpen&&!loading&&(!machine||resumeFile!==targetFile()||openedKey!==identity()||machine.workflow!=='idle')){close();if(root.cncShell)root.cncShell.closeSheet();}
    if(isOpen)set(load,'disabled',!checked||!permitted()||loading);
  }
  api.screenState=screenState;api.open=openResume;api.summary=function(value){summary=value;render();if(root.cncSeance)root.cncSeance.render();};
  api.project=function(input,result){var state=screenState(Object.assign({},input,{summary:summary}));result.etapes.home.mot=state.word;var b=result.barres.home;b.cause={id:'usinage',texte:state.text,ton:state.tone};b.remedes=state.remedy?[{id:state.remedy,actif:!!(input.machine&&input.machine.canStop)}]:[];if(input.pilot&&input.pilot.state==='other'&&state.action==='reprendre')b.remedes.push({id:'prendre-la-main',actif:true});b.details=!!state.details;b.action={id:state.action,libelle:state.label,style:state.allowed?'plein':'raye'};return result;};
  root.addEventListener('cnc-job-status',function(e){var d=e.detail||{};if(!!d.simulation!==simulation)return;var old=identity();status=d;machine=d.machine||null;if(old!==identity())summary=null;render();if(root.cncSeance)root.cncSeance.render();});
  root.addEventListener('cnc-sheet-change',function(e){if(e.detail.id==='ks-resume-sheet'&&!e.detail.open)close();});
  root.addEventListener('cnc-screen-change',function(){render();});
  root.addEventListener('cnc-screen-lock',function(e){if(e.detail){close();if(root.cncShell)root.cncShell.closeSheet();}});
  document.addEventListener('visibilitychange',function(){if(document.hidden){close();if(root.cncShell)root.cncShell.closeSheet();}});
  render();
})(typeof window==='object'?window:this);
