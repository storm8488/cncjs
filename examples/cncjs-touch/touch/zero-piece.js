/* Work-zero probe card. Server-owned permissions, plans, contact tests and outcomes only. */
(function(root){
  'use strict';
  var t=function(s){return root.cncI18n?root.cncI18n.t(s):s;};
  var INSTRUCTIONS={
    unsafe:'Arrêtez d’abord la machine et la broche.',unknown:'La machine ne donne pas l’état de la sonde.',
    touch:'Touchez le bloc avec la fraise.',release:'Contact vu. Écartez le bloc.',done:'La sonde marche.',
    A1:'Écartez le bloc de la fraise.',A2:'Laissez la pince sur la fraise. Débranchez la prise de la broche.',
    A3:'Retirez la pince de la fraise.',A4:'Le fil de la sonde est en court-circuit. Faites vérifier le câblage.',
    B1:'Mettez la pince sur la fraise, puis touchez le bloc avec la fraise.',B2:'Vérifiez le fil du bloc côté machine, puis touchez le bloc.',
    B3:'La machine ne voit pas la sonde. Faites vérifier le câblage.',
    spindle:'C’est la broche : elle relie la fraise à la masse.',ground:'La fraise touche la masse de la machine, broche débranchée. Faites vérifier le montage.'
  };
  function safe(m,elapsed){return !!(m&&m.fresh===true&&elapsed>=0&&elapsed<2500&&['Idle','Alarm'].indexOf(m.activeState)>=0&&m.workflow==='idle'&&!m.probing&&!m.homing&&!m.loading&&!m.busy&&!(m.motion&&(m.motion.jog||m.motion.cancelling||m.motion.cancelUnconfirmed||m.motion.frame))&&m.spindleSpeed===0&&(!m.operator||!m.operator.spindle||m.operator.spindle==='M5'));}
  // Touches advance hypotheses only. Success requires the actual contact -> free transition.
  function diagnostic(stage,signal,next,stuck){
    if(signal==='unknown')return 'unknown';
    if(!stage||stage==='unsafe'||stage==='unknown')return stuck||signal==='contact'?'A1':'touch';
    if(stage==='touch'&&signal==='contact')return 'release';
    if(stage==='release'&&signal==='free')return 'done';
    if(stage==='A1'&&signal==='free')return 'touch';
    if(stage==='A2'&&signal==='free')return 'spindle';
    if(stage==='A3'&&signal==='free')return 'ground';
    if((stage==='B1'||stage==='B2')&&signal==='contact')return 'release';
    if(stage==='done'&&signal==='contact')return 'release';
    if(next){var steps={touch:'B1',release:'A1',A1:'A2',A2:'A3',A3:'A4',B1:'B2',B2:'B3'};return steps[stage]||stage;}
    return stage;
  }
  function outcome(m){
    var b=m&&m.blockProbe,z=m&&m.zeroZ;
    if(z&&(!b||Number(z.at)>Number(b.endedAt||b.startedAt||0))){var lost=z.failed&&m.homed===false;return {text:(z.failed?t('Le zéro pièce est peut-être changé : refaites-le.'):t('Zéro Z posé à la plaque. X et Y n’ont pas changé.'))+(lost?' '+t('La machine a perdu sa position.'):''),remedy:lost?'remise-en-route':z.failed?'relancer-palpage':'',source:z};}
    if(!b||b.state==='running'||b.state==='stopping')return null;
    var text='',remedy='',f=b.failure||{};
    if(b.state==='done'&&b.written==='yes'){
      var axes=Array.isArray(b.axes)?b.axes.join(''):b.axes||b.operation||'',w=b.work||{};
      text=t('Zéro pièce posé : {axes}.').replace('{axes}',axes.split('').map(function(a){var n=w[a.toLowerCase()]===undefined?w[a]:w[a.toLowerCase()];return a+' '+(typeof n==='number'?n.toFixed(3).replace('.',root.cncI18n&&root.cncI18n.language==='en'?'.':','):'—');}).join(' · '));
    }else if(b.written==='no'){
      text=/^ETOUCH_PROBE_(STOPPED|PAUSED)$/.test(f.code)?t('Palpage arrêté. Le zéro pièce n’a pas changé.'):(root.cncRefus?root.cncRefus.lire(f).phrase:t('Action refusée.'))+' '+t('Le zéro pièce n’a pas changé.');
      remedy=/^ETOUCH_PROBE_(STOPPED|PAUSED)$/.test(f.code)?'relancer-palpage':null;
    }else{text=t('Le zéro pièce est peut-être changé : refaites-le.');remedy='relancer-palpage';}
    if(b.needsHoming||m.homed===false){text+=' '+t('La machine a perdu sa position.');remedy='remise-en-route';}
    return {text:text,remedy:remedy,failure:f,source:b};
  }
  var api={safe:safe,diagnostic:diagnostic,outcome:outcome};
  if(typeof module==='object'&&module.exports){module.exports=api;return;}
  if(document.body.getAttribute('data-simulation')==='true')return;
  var model=root.CNCProbe,real=root.CNCProbeReal,shell=root.cncShell,host=document.querySelector('#screen-jog .ks-zero-tools');
  if(!model||!real||!shell||!host)return;
  function el(tag,id,label,parent){var n=document.createElement(tag);if(id)n.id=id;if(label)n.textContent=t(label);if(tag==='button'){n.type='button';n.className='ks-secondary';}if(parent)parent.appendChild(n);return n;}
  function set(n,k,v){if(n[k]!==v)n[k]=v;}
  function text(n,v){set(n,'textContent',v);}
  function button(parent,id,label,fn){var b=el('button',id,label,parent);b.addEventListener('click',fn);return b;}
  function sheet(id,title){return shell.sheet(id,t(title));}
  function close(){shell.closeSheet();}
  function controls(){return root.cncJobControls;}
  var card=el('div','probe-card','',host);card.className='zero-probe-card';card.setAttribute('aria-label',t('Sonde'));
  var row=el('div','','',card);row.className='zero-probe-row';
  var signal=el('span','probe-signal','? Inconnu',row),test=button(row,'probe-test','Tester',function(){openTest();});
  var ops=el('div','probe-operations','',card);ops.className='zero-probe-ops';
  var operation='XYZ',machine=null,status={},received=0,pending=false,refusal=null,refusalRetry=null,refusalVersion=0,refusalKey='',lastOutcome='',dismissed='',active='',sheetId='',diagnosticStage='',history=[],answerOutcome=null,wasProbing=false;
  var choices=['XYZ','Z','X','Y'].map(function(a){var b=button(ops,'','',function(){if(cycle())return;operation=a;clearCause();render();});b.textContent=a;b.setAttribute('data-probe-operation',a);return b;});
  var zone=el('div','probe-zone','',card),diagramHost=el('div','probe-diagram-host','',zone),cause=el('div','probe-cause','',zone),result=el('div','probe-outcome','',zone),progress=el('progress','probe-progress','',zone),phase=el('p','probe-phase','',zone);
  progress.max=100;cause.setAttribute('role','status');result.setAttribute('role','status');
  var tool=el('div','','',card);tool.className='zero-probe-row';var dl=el('label','','Fraise Ø',tool),diameterInput=el('input','probe-diameter','',dl);diameterInput.type='text';
  var setup=button(tool,'probe-setup-open','Ma sonde…',function(){openSetup(false);});
  var start=button(card,'probe-start','Palper au bloc XYZ…',launch),stop=button(card,'probe-stop','Arrêter le palpage',function(){var c=controls();if(c&&c.stop)c.stop();});stop.className='ks-secondary probe-stop';
  var plateStart=button(card,'probe-plate-start','Zéro Z à la plaque…',function(){launchPlate(false);});
  var diameterReason=el('span','probe-diameter-reason','',dl);diameterReason.className='sr-only';diameterInput.setAttribute('aria-describedby','probe-diameter-reason');
  var diagram=root.CNCProbeDiagram.attach(diagramHost,{mode:'screen'});
  var key='cnc-touch-probes-v1-real',store=null,collection={profiles:[model.empty()],selected:0,removed:null},diameter=null,storageError='';
  try{
    store=root.CNCProfileStorage.open(localStorage,key);var saved=JSON.parse(store.read()||'null');
    if(saved){if(saved.version!==1)throw Error('version');collection.profiles=root.CNCProbeTransfer.decode(root.CNCProbeTransfer.encode(saved.profiles,'real'),'real');collection.selected=Number.isInteger(saved.selected)&&saved.selected>=0&&saved.selected<collection.profiles.length?saved.selected:0;collection.removed=saved.removed||null;diameter=typeof saved.diameter==='number'&&saved.diameter>0&&saved.diameter<=100?saved.diameter:null;}
  }catch(_){store=null;storageError=t('Profils locaux illisibles : paramètres à vérifier.');}
  diameterInput.value=diameter===null?'':String(diameter);
  function profile(){return collection.profiles[collection.selected];}
  function save(next,d){
    if(!store)throw Error(storageError||t('Stockage des profils indisponible ou illisible. Les données enregistrées ne sont pas remplacées.'));
    store.write({version:1,profiles:next.profiles,selected:next.selected,removed:next.removed,diameter:d});collection=next;diameter=d;storageError='';diameterInput.value=d===null?'':String(d);
  }
  function clearCause(){refusal=null;refusalRetry=null;refusalKey='';dismissed=lastOutcome;}
  function inputsKey(){return JSON.stringify([machine&&machine.port,machine&&machine.generation,machine&&machine.coordinates,machine&&machine.operator,machine&&machine.workOffset,machine&&machine.refusals,machine&&machine.canBlockProbe,machine&&machine.canZeroZ,status.pilot,operation,profile(),diameter]);}
  function cycle(){return real.cycle(machine)||!!status.probeRun||!machine&&wasProbing&&!!(status.halt&&status.halt.canStop);}
  function live(){return machine&&machine.probeInput?model.liveInput(machine.probeInput,Date.now()-received).state:'unknown';}
  function flowConnected(){return (status.streamConnected===undefined?status.transportConnected:status.streamConnected)===true;}
  function permitted(name){return !!(machine&&machine.fresh===true&&Date.now()-received<2500&&flowConnected()&&!status.busy&&!status.systemCommand&&!(status.pilot&&status.pilot.state==='other')&&machine[name]===true&&!pending&&!cycle());}
  function missing(p,d){return model.validate(p,operation,d).length>0;}
  function errorFor(op){
    if(!flowConnected())return {code:'CNC_TOUCH_STREAM_LOST'};
    if(!machine||!machine.port)return {message:'Machine non connectée.'};
    if(machine.fresh!==true||Date.now()-received>=2500||status.transportConnected!==true)return {code:'ETOUCH_MACHINE_STALE'};
    if(status.pilot&&status.pilot.state==='other')return {code:'ECONTROL',params:{appareil:status.pilot.name||status.pilot.value}};
    return machine.refusals&&machine.refusals[op]||{message:machine[op==='zeroZ'?'zeroZReason':'blockProbeReason']||t('Impossible pour l’instant.')};
  }
  function renderRefusal(node,error){var signature=JSON.stringify([error&&error.code,error&&error.params,error&&error.message,error&&error.reasons,error===refusal?refusalVersion:0]);if(node.getAttribute('data-refusal')===signature&&node.querySelector('.ks-refus'))return;var names={};Object.keys(NAMES||{}).forEach(function(k){names[k]=t(NAMES[k]);});names.faceX=t('Paroi côté X');names.faceY=t('Paroi côté Y');var r=root.cncRefus.lire(real.cause(error,names));r.details.brut=error;root.cncRefus.montrer(node,r,error===refusal?refusalRetry:null);node.setAttribute('data-refusal',signature);}
  function showRefusal(error){renderRefusal(cause,error);}
  function contactChecks(parent,id){var p=el('p',id,'',parent);p.className='zero-contact-checks';return p;}
  function checks(p){var v=machine&&machine.probeInput,ts=v&&v.fresh&&v.test||{};text(p,(ts.stage==='contact'||ts.done?'☑ ':'☐ ')+t('contact vu')+' · '+(ts.done&&ts.stage==='free'?'☑ ':'☐ ')+t('libéré'));}
  var cardChecks=contactChecks(cause,'probe-contact-checks');
  function render(){
    var kind=machine&&machine.machineProfile&&machine.machineProfile.kind;
    set(card,'hidden',kind!=='cnc');
    var running=cycle(),incomplete=missing(profile(),diameter),can=permitted('canBlockProbe'),canPlate=permitted('canZeroZ');
    set(start,'hidden',running);set(stop,'hidden',!running);set(stop,'disabled',!(running&&(machine&&machine.canStop||status.halt&&status.halt.canStop)));
    set(start,'disabled',running||pending||!incomplete&&!can);set(plateStart,'disabled',running||pending||!canPlate);
    text(start,t('Palper au bloc {axes}…').replace('{axes}',operation));
    choices.forEach(function(b){set(b,'disabled',running||pending);var value=String(b.getAttribute('data-probe-operation')===operation);if(b.getAttribute('aria-pressed')!==value)b.setAttribute('aria-pressed',value);});
    set(diameterInput,'disabled',running||operation==='Z');text(diameterReason,operation==='Z'?t('Le diamètre ne sert pas pour Z.'):'');set(setup,'disabled',running);set(test,'disabled',running);
    var actual=live(),pi=machine&&machine.probeInput,held=actual==='free'&&pi&&typeof pi.lastContactAgeMs==='number'&&pi.lastContactAgeMs+Date.now()-received<1500;
    var stuck=!!(pi&&pi.stuck&&actual==='contact'&&!running),word=stuck?'! Touche en permanence':actual==='contact'||held?'● Touche':actual==='free'?'● Libre':'? Inconnu';
    text(signal,t(word));if(signal.getAttribute('data-signal')!==(stuck?'stuck':actual))signal.setAttribute('data-signal',stuck?'stuck':actual);text(test,t(stuck||actual==='unknown'?'Pourquoi ?':'Tester'));
    var o=answerOutcome||outcome(machine),oKey=o?JSON.stringify(o.source):'';lastOutcome=oKey;
    var error=pending?null:refusal||(o&&dismissed!==oKey?null:!can&&!incomplete?errorFor('blockProbe'):!canPlate?errorFor('zeroZ'):null);
    var windowError=error&&error.code==='ETOUCH_PROBE_WINDOW';
    set(diagramHost,'hidden',running||pending||!!error&&!windowError||!!o&&dismissed!==oKey&&!error);
    set(cause,'hidden',running||pending||!error);set(result,'hidden',running||pending||!!error||!o||dismissed===oKey);
    set(progress,'hidden',!running);set(phase,'hidden',!running&&!pending);
    if(pending)text(phase,t('Vérification…'));
    if(running){var b=machine&&machine.blockProbe;text(phase,b&&(b.state==='running'||b.state==='stopping')?real.summary(b).phase:t('Zéro Z à la plaque en cours…'));set(progress,'value',real.progress(b));}
    if(error){showRefusal(error);var needsTest=root.cncRefus.lire(error).famille==='test-contact';set(cardChecks,'hidden',!needsTest);if(needsTest){if(cause.lastChild!==cardChecks)cause.appendChild(cardChecks);checks(cardChecks);}if(windowError){diagramHost.setAttribute('data-highlight','true');diagram.caption(root.cncRefus.lire(error).phrase);}else diagramHost.removeAttribute('data-highlight');}
    else if(o&&dismissed!==oKey&&result.getAttribute('data-outcome')!==oKey){text(result,o.text);result.setAttribute('data-outcome',oKey);var remedy=o.remedy;if(remedy===null&&o.failure){root.cncRefus.lire(o.failure).remedes.forEach(function(id){button(result,'',root.cncSeance.libelle(id),function(){root.cncSeance.lancer(id);});});}else if(remedy)button(result,'',root.cncSeance.libelle(remedy),function(){root.cncSeance.lancer(remedy);});button(result,'','Détails',showDetails);}
    if(!windowError)diagram.update(profile(),operation,diameter);
    var done=root.cncSeance&&root.cncSeance.state(),isDone=done&&done.etapes.jog.etat==='fait';start.classList.toggle('is-primary',!isDone);
    if(sheetId==='ks-probe-test')renderTest();
    if(sheetId==='ks-probe-setup')renderSetup();
    if(sheetId==='ks-plate')renderPlate();
    homeButtons.forEach(function(b){set(b,'disabled',!canPlate);});
    set(homePause,'hidden',kind!=='cnc'||!(machine&&machine.programPause&&machine.programPause.kind==='M6'));
    set(homeFinish,'hidden',kind!=='cnc'||!(machine&&machine.finished));
    homeReasons.forEach(function(n){if(canPlate){root.cncRefus.effacer(n);text(n,'');}else renderRefusal(n,errorFor('zeroZ'));});
  }
  function showDetails(){shell.details({titre:t('Sonde'),lignes:[{libelle:t('Repère de travail'),valeur:machine&&machine.operator&&machine.operator.wcs||'—'}].concat(real.resultLines(machine&&machine.blockProbe).map(function(s){return {libelle:'',valeur:s};})),brut:machine&&machine.blockProbe});}
  function prepare(op,body){
    var c=controls();if(!c||!c.prepareCommand||pending)return;var request=JSON.parse(JSON.stringify(body));pending=true;refusal=null;refusalVersion++;refusalRetry=function(){return prepare(op,request);};render();
    return Promise.resolve(c.prepareCommand(op,request)).then(function(r){pending=false;if(r&&r.opened===false&&r.error){refusal=r.error;refusalKey=inputsKey();}render();return r;},function(e){pending=false;refusal=e;refusalKey=inputsKey();render();return {opened:false,error:e};});
  }
  function launch(){
    if(pending||cycle())return;
    if(missing(profile(),diameter)){openSetup(true);return;}
    if(!permitted('canBlockProbe')){render();return;}
    var wcs=machine.operator&&machine.operator.wcs;if(!/^G5[4-9]$/.test(wcs||'')){refusal={code:'ETOUCH_CHECK_ACTIVE_WCS_UNKNOWN'};refusalKey=inputsKey();render();return;}
    return prepare('blockProbe',real.request(profile(),operation,diameter,wcs));
  }
  diameterInput.addEventListener('change',function(){var p=root.CNCNumeric.parse(diameterInput.value,{min:0.01,max:100,negative:false});try{save(collection,p.state==='ok'?p.value:null);}catch(e){storageError=e.message;refusal={message:storageError};refusalKey=inputsKey();}clearCause();render();});
  root.CNCNumeric.bind(diameterInput,{min:0.01,max:100,optional:true,negative:false,unit:'mm',label:t('Diamètre de la fraise')});
  // Setup: only the requested measurements; tuning and saved probes stay available in the same sheet.
  var setupSheet=sheet('ks-probe-setup','Ma sonde'),setupBody=el('div','','',setupSheet.content),setupFromStart=false,setupPage=1,draft=null,draftDiameter=null,cornerChosen=false,setupFields={},setupError='',setupMeasure=null;
  var NAMES={thickness:'Épaisseur du bloc',wallX:'Paroi côté X',wallY:'Paroi côté Y',diameter:'Diamètre de la fraise',fast:'Vitesse d’approche',slow:'Seconde touche',search:'Recherche maximale',retract:'Retrait',clearance:'Dégagement'};
  function openSetup(fromStart){if(cycle())return;setupFromStart=fromStart;draft=JSON.parse(JSON.stringify(profile()));draftDiameter=diameter;setupError='';setupPage=operation==='Z'||cornerChosen||draft.thickness!==null||draft.faceX!==null||draft.faceY!==null?2:1;buildSetup();setupSheet.open();}
  function field(parent,id,name,value,rules,changed,drawing){
    var label=el('label','',name,parent),input=el('input',id,'',label);input.type='text';input.value=value===null||value===undefined?'':String(value);
    el('span','','',label).textContent=rules.unit||'mm';
    root.CNCNumeric.bind(input,Object.assign({dock:'right',optional:true,label:t(name),unit:'mm',negative:false},rules));
    input.addEventListener('click',function(){if(drawing)drawing.setAttribute('data-measure',id);});
    input.addEventListener('change',function(){var r=root.CNCNumeric.parse(input.value,rules);changed(r.state==='ok'?r.value:null);});return input;
  }
  var setupStatus=null,setupSave=null,setupChecks=null,setupInstruction=null;
  function buildSetup(){
    setupBody.textContent='';setupFields={};
    var heading=el('div','','',setupBody);heading.className='zero-probe-row';el('span','','',heading).textContent=t('Sonde : {nom}').replace('{nom}',draft.name);button(heading,'probe-other-open','Autres sondes…',openProfiles);
    if(setupPage===1){el('h3','','Où est le bloc sur la pièce ?',setupBody);var grid=el('div','','',setupBody);grid.className='zero-probe-corners';[['-+','Arrière gauche'],['++','Arrière droit'],['--','Avant gauche'],['+-','Avant droit']].forEach(function(pair){var b=button(grid,'','',function(){draft=model.fromCorner(draft,pair[0],draft.faceX===null?null:Math.abs(draft.faceX),draft.faceY===null?null:Math.abs(draft.faceY));cornerChosen=true;setupPage=2;buildSetup();});b.textContent=t(pair[1]);b.setAttribute('data-corner',pair[0]);b.setAttribute('aria-pressed',String(draft.corner===pair[0]));var icon=el('span','','',b);icon.className='zero-corner-drawing';icon.setAttribute('data-corner',pair[0]);});return;}
    el('h3','',''+(setupPage===3?'Vitesses et distances':'Mesures du bloc'),setupBody);
    var layout=el('div','','',setupBody);layout.className='zero-measures';setupMeasure=el('div','probe-measures-drawing','',layout);setupMeasure.className='zero-measures-drawing';
    setupMeasure.innerHTML='<svg viewBox="0 0 400 300" role="img" aria-label="'+t('Mesures du bloc')+'"><path class="probe-piece" d="M55 100H300V240H55Z"/><g data-dimension="diameter"><circle cx="200" cy="160" r="32" class="probe-hole"/><path class="probe-direction" d="M168 160H232"/><text x="175" y="212">Ø</text></g><g data-dimension="thickness"><path class="probe-direction" d="M32 100V240"/><text x="12" y="75">'+t('Épaisseur du bloc')+'</text></g><g data-dimension="wallX"><path class="probe-direction" d="M55 260H150"/><text x="60" y="290">'+t('Paroi côté X')+'</text></g><g data-dimension="wallY"><path class="probe-direction" d="M320 100V180"/><text x="220" y="65">'+t('Paroi côté Y')+'</text></g></svg>';
    var fields=el('div','','',layout);fields.className='zero-measure-fields';
    var names=setupPage===3?['fast','slow','search','retract','clearance']:operation==='Z'?['thickness']:operation==='X'?['wallX','diameter']:operation==='Y'?['wallY','diameter']:['thickness','wallX','wallY','diameter'];
    names.forEach(function(k){
      var value=k==='diameter'?draftDiameter:k==='wallX'||k==='wallY'?draft[k==='wallX'?'faceX':'faceY']===null?null:Math.abs(draft[k==='wallX'?'faceX':'faceY']):draft[k];
      var bounds=k==='diameter'?[0.01,100]:k==='wallX'||k==='wallY'?[0,100]:model.fields[k];
      setupFields[k]=field(fields,'probe-measure-'+k,NAMES[k],value,{min:bounds[0],max:bounds[1],negative:false,unit:k==='fast'||k==='slow'?'mm/min':'mm'},function(v){if(k==='diameter')draftDiameter=v;else if(k==='wallX'||k==='wallY'){var wx=k==='wallX'?v:draft.faceX===null?null:Math.abs(draft.faceX),wy=k==='wallY'?v:draft.faceY===null?null:Math.abs(draft.faceY);draft=model.fromCorner(draft,draft.corner,wx,wy);}else draft[k]=v;setupError='';clearCause();renderSetup();},setupMeasure);
    });
    if(setupPage!==3){el('p','','Vitesses et distances : valeurs de départ.',setupBody);button(setupBody,'probe-tuning-open','Modifier…',function(){setupPage=3;buildSetup();});}
    setupInstruction=el('p','probe-setup-instruction','',setupBody);setupChecks=contactChecks(setupBody,'probe-setup-checks');
    var foot=el('div','','',setupBody);foot.className='zero-probe-footer';button(foot,'probe-setup-back','← Retour',function(){setupPage=setupPage===3?2:1;buildSetup();});
    if(operation!=='Z')button(foot,'probe-corner-change','Changer de coin',function(){setupPage=1;buildSetup();});
    setupStatus=el('p','probe-setup-status','',foot);setupStatus.setAttribute('role','status');
    setupSave=button(foot,'probe-setup-save',setupFromStart?'Enregistrer et palper':'Enregistrer',function(){
      if(cycle()||setupSave.disabled)return;
      try{var next=root.CNCProbeProfiles.save(collection,collection.selected,draft,false);save(next,draftDiameter);clearCause();close();if(setupFromStart)launch();else render();}catch(e){setupError=e.message;renderSetup();}
    });renderSetup();
  }
  function renderSetup(){
    if(setupPage===1||!setupSave)return;
    var missingField=Object.keys(setupFields).filter(function(k){return !setupFields[k].value.trim();})[0];
    var errors=model.validate(draft,operation,draftDiameter),why=setupError|| (missingField?t('Il manque : {champ}.').replace('{champ}',t(NAMES[missingField])):errors[0]||'');
    text(setupStatus,why);set(setupSave,'disabled',!!why||cycle());
    Object.keys(setupFields).forEach(function(k){set(setupFields[k],'disabled',cycle());});
    var pi=machine&&machine.probeInput,needed=setupFromStart&&!(pi&&pi.fresh&&pi.test&&pi.test.done);set(setupInstruction,'hidden',!needed);set(setupChecks,'hidden',!needed);text(setupInstruction,t('Avant de palper : touchez le bloc avec la fraise, puis écartez-le.'));checks(setupChecks);
  }
  var profileSheet=sheet('ks-probe-list','Autres sondes…'),profileBody=profileSheet.content,deleteIndex=null;
  function openProfiles(){if(cycle())return;deleteIndex=null;renderProfiles();profileSheet.open();}
  function profileAction(fn){if(cycle())return;try{save(fn(),diameter);clearCause();renderProfiles();render();}catch(e){el('p','',e.message,profileBody);}}
  function renderProfiles(){
    profileBody.textContent='';var select=el('select','probe-profile','',profileBody);select.setAttribute('aria-label',t('Sonde'));
    collection.profiles.forEach(function(p,i){var o=el('option','','',select);o.value=String(i);o.textContent=p.name;});select.value=String(collection.selected);
    select.addEventListener('change',function(){profileAction(function(){return {profiles:collection.profiles,selected:Number(select.value),removed:collection.removed};});});
    var nameLabel=el('label','','Nom du profil',profileBody),name=el('input','probe-profile-name','',nameLabel);name.value=profile().name;if(root.CNCTextKeyboard)root.CNCTextKeyboard.bind(name,{label:t('Nom du profil')});
    button(profileBody,'probe-profile-rename','Enregistrer',function(){profileAction(function(){var p=JSON.parse(JSON.stringify(profile()));p.name=name.value;return root.CNCProbeProfiles.save(collection,collection.selected,p,false);});});
    button(profileBody,'probe-new','Nouveau',function(){profileAction(function(){return root.CNCProbeProfiles.create(collection);});});
    button(profileBody,'probe-duplicate','Dupliquer',function(){profileAction(function(){return root.CNCProbeProfiles.duplicate(collection,collection.selected,false);});});
    button(profileBody,'probe-delete','Supprimer…',function(){if(cycle())return;deleteIndex=collection.selected;renderProfiles();});
    if(deleteIndex!==null){el('p','','Supprimer ce profil ?',profileBody);button(profileBody,'probe-delete-yes','Confirmer la suppression',function(){var i=deleteIndex;deleteIndex=null;profileAction(function(){return root.CNCProbeProfiles.remove(collection,i);});});button(profileBody,'probe-delete-cancel','Annuler',function(){deleteIndex=null;renderProfiles();});}
    button(profileBody,'probe-restore','Restaurer',function(){profileAction(function(){return root.CNCProbeProfiles.restore(collection);});});
    button(profileBody,'probe-edit','Ma sonde…',function(){cornerChosen=true;openSetup(false);});button(profileBody,'probe-backup-open','Sauvegarde…',openTransfer);
    set(document.getElementById('probe-new'),'disabled',collection.profiles.length>=8||cycle());set(document.getElementById('probe-duplicate'),'disabled',collection.profiles.length>=8||cycle());set(document.getElementById('probe-delete'),'disabled',collection.profiles.length<=1||cycle());set(document.getElementById('probe-restore'),'disabled',!collection.removed||collection.profiles.length>=8||cycle());
  }
  var transferSheet=sheet('ks-probe-transfer','Sauvegarde des sondes'),transferBody=transferSheet.content,reader=null,readVersion=0,incoming=null,importStatus=null,importButton=null,importPreview=null;
  function cancelRead(){readVersion++;if(reader&&reader.readyState===1)reader.abort();reader=null;incoming=null;}
  function previewImport(){
    importPreview.textContent='';var select=el('select','probe-import-profile','',importPreview);select.setAttribute('aria-label',t('Profil à examiner'));
    incoming.forEach(function(p,i){var o=el('option','','',select);o.value=String(i);o.textContent=p.name;});select.value='0';
    var values=el('div','probe-import-values','',importPreview);
    function show(){var p=incoming[Number(select.value)];values.textContent='';if(!p)return;Object.keys(model.fields).forEach(function(k){el('p','','',values).textContent=t(model.fieldNames[k])+': '+(p[k]===null?t('non configuré'):String(p[k]));});el('p','','',values).textContent=t('Coin : ')+p.corner;}
    select.addEventListener('change',show);show();
  }
  function openTransfer(){
    if(cycle())return;cancelRead();transferBody.textContent='';
    button(transferBody,'probe-profiles-export','Télécharger la sauvegarde',function(){try{root.CNCDownload.save(new Blob([root.CNCProbeTransfer.encode(collection.profiles,'real')],{type:'application/json'}),'cnc-profils-sonde-reel.json');text(importStatus,t('Sauvegarde proposée au téléchargement.'));}catch(e){text(importStatus,e.message);}});
    var label=el('label','','Fichier de sauvegarde · JSON, 64 Ko maximum',transferBody),file=el('input','probe-profiles-file','',label);file.type='file';file.setAttribute('accept','.json,application/json');
    importStatus=el('p','probe-import-status','Choisissez un fichier pour afficher son contenu avant l’ajout.',transferBody);importStatus.setAttribute('role','status');importPreview=el('div','probe-import-preview','',transferBody);
    importButton=button(transferBody,'probe-profiles-import','Ajouter les profils',function(){if(!incoming||cycle())return;try{var plan=root.CNCProbeTransfer.merge(collection.profiles,incoming);save({profiles:plan.profiles,selected:collection.selected,removed:collection.removed},diameter);cancelRead();set(importButton,'disabled',true);text(importStatus,t('Profils enregistrés.'));}catch(e){text(importStatus,e.message);}});importButton.disabled=true;
    file.addEventListener('change',function(){cancelRead();importButton.disabled=true;importPreview.textContent='';var f=file.files&&file.files[0];if(!f||cycle())return;if(f.size>root.CNCProbeTransfer.maxBytes){text(importStatus,t('Fichier trop volumineux (64 Ko maximum). Aucun profil ajouté.'));return;}var version=readVersion;reader=new FileReader();reader.onload=function(e){if(version!==readVersion||sheetId!=='ks-probe-transfer'||cycle())return;try{incoming=root.CNCProbeTransfer.decode(e.target.result,'real');var plan=root.CNCProbeTransfer.merge(collection.profiles,incoming);previewImport();text(importStatus,t('Vérifiez les valeurs ci-dessous.'));importButton.disabled=!plan.added;}catch(err){incoming=null;text(importStatus,err.message);}};reader.onerror=function(){if(version===readVersion)text(importStatus,t('Lecture du fichier impossible. Aucun profil ajouté.'));};reader.readAsText(f);});transferSheet.open();
  }
  var plateKey='cncjs-touch-plate-v1',plate={thickness:null,search:10};
  try{var loaded=JSON.parse(localStorage.getItem(plateKey)||'null');if(loaded){plate.thickness=root.CNCNumeric.parse(loaded.thickness,{min:0.01,max:50,negative:false}).state==='ok'?Number(loaded.thickness):null;plate.search=root.CNCNumeric.parse(loaded.search,{min:1,max:100,negative:false}).state==='ok'?Number(loaded.search):10;}}catch(_){/* No invented physical thickness. */}
  var plateSheet=sheet('ks-plate','Plaque'),plateBody=plateSheet.content,plateDraft=null,plateSave=null,plateStatus=null,plateFields={};
  function openPlate(){
    if(cycle())return;plateDraft={thickness:plate.thickness,search:plate.search};plateBody.textContent='';var layout=el('div','','',plateBody);layout.className='zero-measures';var draw=el('div','plate-measures-drawing','',layout);draw.className='zero-measures-drawing';draw.innerHTML='<svg viewBox="0 0 400 300" role="img" aria-label="'+t('Plaque')+'"><path class="probe-piece" d="M20 230H380V280H20Z"/><path class="probe-plate" d="M130 206H250V230H130Z"/><g data-dimension="thickness"><path class="probe-direction" d="M110 206V230"/><text x="20" y="195">'+t('Épaisseur de la plaque')+'</text></g><g data-dimension="search"><path class="probe-direction" d="M190 80V196"/><text x="200" y="150">'+t('Descente au plus')+'</text></g></svg>';
    var fields=el('div','','',layout);fields.className='zero-measure-fields';
    [['thickness','Épaisseur de la plaque',0.01,50],['search','Descente au plus',1,100]].forEach(function(v){plateFields[v[0]]=field(fields,'plate-'+v[0],v[1],plateDraft[v[0]],{min:v[2],max:v[3],negative:false},function(n){plateDraft[v[0]]=n;draw.setAttribute('data-measure','plate-'+v[0]);renderPlate();},draw);});
    plateStatus=el('p','plate-status','',plateBody);plateSave=button(plateBody,'plate-save','Enregistrer et palper',function(){if(plateSave.disabled||cycle())return;plate={thickness:Math.round(plateDraft.thickness*1000)/1000,search:Math.round(plateDraft.search*1000)/1000};try{localStorage.setItem(plateKey,JSON.stringify(plate));}catch(_){/* Values still available for this session. */}close();launchPlate(false);});renderPlate();plateSheet.open();
  }
  function renderPlate(){if(!plateSave)return;var why=plateDraft.thickness===null?t('Il manque : {champ}.').replace('{champ}',t('Épaisseur de la plaque')):plateDraft.search===null?t('Il manque : {champ}.').replace('{champ}',t('Descente au plus')):'';text(plateStatus,why);set(plateSave,'disabled',!!why||cycle());}
  function launchPlate(modify){if(cycle()||pending)return;if(modify||plate.thickness===null){openPlate();return;}if(!permitted('canZeroZ')){refusal=errorFor('zeroZ');refusalKey=inputsKey();render();return;}return prepare('zeroZ',plate);}
  var diagnosticSheet=sheet('ks-probe-test','Tester la sonde'),diagnosticBody=diagnosticSheet.content,diagnosticText=el('p','probe-test-instruction','',diagnosticBody),diagnosticSignal=el('div','probe-test-signal','',diagnosticBody),diagnosticHistory=el('ol','probe-test-history','',diagnosticBody),diagnosticNote=el('p','probe-test-note','',diagnosticBody),diagnosticActions=el('div','probe-test-actions','',diagnosticBody);
  var diagnosticKey='';
  function openTest(branch){diagnosticStage=branch==='B'?'B1':branch==='A'?'A1':'';history=[];diagnosticKey='';renderTest();diagnosticSheet.open();}
  function renderTest(next){
    var prior=diagnosticStage,now=Date.now()-received;
    diagnosticStage=!document.hidden&&safe(machine,now)&&!status.busy&&!status.systemCommand?diagnostic(diagnosticStage,live(),next,machine.probeInput&&machine.probeInput.stuck):'unsafe';
    if(prior&&prior!==diagnosticStage&&prior!=='unsafe'&&diagnosticStage!=='unsafe')history.push(prior);
    var signature=JSON.stringify([diagnosticStage,history,signal.textContent,machine&&machine.canSpindleStop]);if(diagnosticKey===signature)return;diagnosticKey=signature;
    text(diagnosticText,t(INSTRUCTIONS[diagnosticStage]));text(diagnosticSignal,diagnosticStage==='unsafe'?'':signal.textContent);
    diagnosticHistory.textContent='';if(diagnosticStage!=='unsafe')history.forEach(function(s){el('li','',INSTRUCTIONS[s],diagnosticHistory);});
    diagnosticNote.textContent='';diagnosticActions.textContent='';
    if(diagnosticStage==='unsafe'){if(machine&&machine.canSpindleStop===true)button(diagnosticActions,'probe-test-m5','Arrêter la broche',function(){var c=controls();if(c&&c.spindleStop)Promise.resolve(c.spindleStop()).catch(function(){/* The command owner shows its refusal in this sheet. */});});return;}
    if(diagnosticStage==='spindle'){text(diagnosticNote,t('Palpez broche débranchée. Rebranchez-la avant d’usiner.'));button(diagnosticActions,'probe-test-again','Tester',function(){diagnosticStage='touch';renderTest();});}
    else if(['A4','B3','ground','unknown'].indexOf(diagnosticStage)>=0)button(diagnosticActions,'probe-test-details','Détails',showDetails);
    else if(diagnosticStage==='done')button(diagnosticActions,'probe-test-close','Fermer',close);
    else button(diagnosticActions,'probe-test-next',diagnosticStage==='touch'||diagnosticStage.charAt(0)==='B'?'Rien ne se passe':'Ça touche toujours',function(){renderTest(true);});
  }
  // Tool-change pause and completion use the same plate owner and display refusals on the spot.
  var pauseParent=document.getElementById('home-notice-actions')||document.getElementById('home-job-ready'),homePause=el('div','home-pause-plate','',pauseParent),finishParent=document.getElementById('home-notice-actions')||document.getElementById('home-job-ready'),homeFinish=el('div','home-finish-plate','',finishParent);

  var homeButtons=[homePause,homeFinish].map(function(n,i){return button(n,i?'home-finish-plate-start':'home-pause-plate-start','Zéro Z à la plaque…',function(){launchPlate(false);});});
  var homeReasons=[homePause,homeFinish].map(function(n){return el('div','','',n);});
  homeReasons.forEach(function(n){n.setAttribute('role','status');});
  document.addEventListener('click',function(e){if(lastOutcome&&e.target&&e.target.closest&&e.target.closest('#screen-jog')){dismissed=lastOutcome;set(result,'hidden',true);}});
  root.addEventListener('cnc-job-status',function(e){var d=e.detail||{};if(d.simulation)return;status=d;var old=machine;machine=d.machine||null;received=Date.now();if(machine)wasProbing=real.cycle(machine);if(answerOutcome&&(!machine||!old||machine.port!==old.port||machine.generation!==old.generation||JSON.stringify(machine.blockProbe)!==JSON.stringify(old.blockProbe)))answerOutcome=null;if(refusal&&refusalKey!==inputsKey())refusal=null;render();});
  root.addEventListener('cnc-screen-change',function(e){active=e.detail;if(active==='jog'){operation='XYZ';clearCause();render();}});
  root.addEventListener('cnc-sheet-change',function(e){var d=e.detail||{};if(d.open)sheetId=d.id;else if(sheetId===d.id){sheetId='';if(d.id==='ks-probe-transfer')cancelRead();}});
  document.addEventListener('visibilitychange',function(){if(document.hidden){diagnosticStage='unsafe';cancelRead();}});
  if(root.cncSeance){
    root.cncSeance.enregistrer('ma-sonde',function(){openSetup(false);});root.cncSeance.enregistrer('plaque',openPlate);
    root.cncSeance.enregistrer('tester-sonde',function(){var failure=refusal||machine&&machine.blockProbe&&machine.blockProbe.failure;openTest(failure&&failure.code==='ETOUCH_PROBE_NO_CONTACT'?'B':null);});root.cncSeance.enregistrer('pourquoi-sonde',function(){openTest('A');});
    root.cncSeance.enregistrer('dessin-depart',function(){diagramHost.setAttribute('data-highlight','true');set(diagramHost,'hidden',false);});
    root.cncSeance.enregistrer('relancer-palpage',function(){if(machine&&machine.zeroZ&&(!machine.blockProbe||machine.zeroZ.at>machine.blockProbe.endedAt))launchPlate(false);else launch();});
  }
  api.failure=function(b,target){if(!machine||!target||target.port!==machine.port||target.generation!==machine.generation)return;answerOutcome=outcome(Object.assign({},machine,{blockProbe:b,zeroZ:null}));render();};
  api.launch=launch;api.plate=launchPlate;api.setup=openSetup;api.test=openTest;api.render=render;root.cncZeroPiece=api;render();
})(typeof window==='object'?window:this);
