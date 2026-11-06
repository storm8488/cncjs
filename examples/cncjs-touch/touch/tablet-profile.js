/* Two settings, two scopes (PROFILES-CONTRACT.md §1, §5).
 * - « Performances de cette tablette » (eco | performance): this browser only, in localStorage
 *   `cncjs-touch-performance-v1` = {"version":1,"profile":…}. Absent, unreadable or unknown reads
 *   as eco and is never rewritten silently. Changing it never reloads, never sends anything.
 * - « Type de machine » (cnc | laser): owned by the server, read from the `machineProfile` of the
 *   controller snapshot (`cnc-job-status`). Never stored in the browser.
 * window.cncProfile is the only API; `cnc-profile-change` is fired on window after any change of
 * either. Advanced scripts are not in index.html: loadAdvanced() injects them once, never in eco. */
(function () {
  'use strict';
  var uiLocale=window.cncI18n||{t:function(s){return s;}};
  var t=uiLocale.t;
  var KEY='cncjs-touch-performance-v1',PROFILES=['eco','performance'];
  // Cache key of the advanced scripts (they are not in the pages, so the pages' ?v= does not reach them).
  var ADVANCED_VERSION='v2h';
  function read(){
    // Any failure (storage blocked, bad JSON, unknown value, other version) reads as eco.
    try{
      var raw=window.localStorage?window.localStorage.getItem(KEY):null;
      if(raw===null||raw===undefined)return {profile:'eco',state:'absent'};
      var v=JSON.parse(raw);
      if(v&&typeof v==='object'&&v.version===1&&PROFILES.indexOf(v.profile)>=0)return {profile:v.profile,state:'ok'};
      return {profile:'eco',state:'invalid'};
    }catch(_){return {profile:'eco',state:'unreadable'};}
  }
  var stored=read(),performance=stored.profile,storage=stored.state,profile=null,signature='null',kind=null;
  function effectiveKind(p){return p&&(p.kind==='laser'||p.kind==='cnc')?p.kind:null;}
  function body(){return document&&document.body&&document.body.classList?document.body.classList:null;}
  function classes(){
    var list=body();if(!list)return;
    list.toggle('perf-eco',performance==='eco');list.toggle('perf-performance',performance==='performance');
    list.toggle('machine-cnc',kind==='cnc');list.toggle('machine-laser',kind==='laser');list.toggle('machine-unknown',kind===null);
  }
  function fire(previous){
    classes();
    var detail={performance:performance,kind:kind,machine:profile,previous:previous};
    try{window.dispatchEvent(new CustomEvent('cnc-profile-change',{detail:detail}));}catch(_){}
  }
  function setPerformance(p){
    if(PROFILES.indexOf(p)<0)return {ok:false,persisted:false,profile:performance,message:t('Profil de performances inconnu.')};
    var previous={performance:performance,kind:kind},persisted=false;
    try{
      var encoded=JSON.stringify({version:1,profile:p});
      window.localStorage.setItem(KEY,encoded);
      persisted=window.localStorage.getItem(KEY)===encoded;
    }catch(_){persisted=false;}
    if(persisted)storage='ok';
    var changed=p!==performance;performance=p;
    if(changed){v2Refresh();fire(previous);}
    return {ok:true,persisted:persisted,profile:performance,message:persisted?t('Enregistré dans ce navigateur uniquement.'):t('Appliqué à cette page ; mémorisation indisponible dans ce navigateur.')};
  }
  // The last profile the server sent, kept while the machine is momentarily unknown (state lost);
  // a machine shown without a profile (older server) clears it.
  function observe(e){
    var d=e&&e.detail;if(!d||!d.machine)return;
    var p=d.machine.machineProfile&&typeof d.machine.machineProfile==='object'?d.machine.machineProfile:null,s;
    try{s=JSON.stringify(p);}catch(_){s=String(Math.random());}
    if(s===signature)return;
    var previous={performance:performance,kind:kind};
    signature=s;profile=p;kind=effectiveKind(p);fire(previous);
  }
  function capability(name){
    var c=profile&&profile.capabilities&&typeof profile.capabilities==='object'?profile.capabilities[name]:null;
    // A refusal's code (no params) is translated alone; otherwise the server's French reason.
    if(c&&typeof c==='object'){
      var reason=typeof c.reason==='string'?c.reason:'',code=typeof c.code==='string'?c.code:'';
      if(c.supported!==true&&code&&typeof uiLocale.format==='function')reason=uiLocale.format(code,{},reason);
      return {supported:c.supported===true,reason:reason,code:code};
    }
    return {supported:false,reason:profile?t('Fonction non indiquée par le serveur CNCjs.'):t('Type de machine non transmis par le serveur CNCjs.'),code:''};
  }
  // Advanced scripts (lot C: preview-gl.js…), each injected once, only in Performance.
  var loading={},v2PendingLoads={};
  function v2File(file){return /^performance-.*\.(js|css)$/.test(file)||file==='i18n-messages-v2.js';}
  function loadOne(file){
    if(Object.prototype.hasOwnProperty.call(loading,file))return loading[file];
    var promise=new Promise(function(resolve,reject){
      if(file==='i18n-messages-v2.js'){
        // Despite its historical .js suffix this is JSON DATA. Never a script or eval.
        var xhr=new window.XMLHttpRequest();
        function failed(){delete loading[file];delete v2PendingLoads[file];reject(new Error('v2-catalog-unavailable'));}
        xhr.open('GET',file+'?v='+ADVANCED_VERSION,true);xhr.timeout=15000;
        xhr.onload=function(){
          if(!v2Gate()){failed();return;}
          try{
            if(xhr.status!==200)throw new Error('catalog-http');
            window.cncI18n.registerCatalog('performance-v2',JSON.parse(xhr.responseText));
            delete v2PendingLoads[file];resolve(file);
          }catch(_){failed();}
        };
        xhr.onerror=xhr.ontimeout=xhr.onabort=failed;
        v2PendingLoads[file]=function(){xhr.abort();};xhr.send();return;
      }
      // The v2 sheet is appended after the baseline head (including responsive.css).
      // Keep it in the same serial, revocable bootstrap as the model providers.
      var css=file==='performance-v2.css',s=document.createElement(css?'link':'script');
      if(css){s.rel='stylesheet';s.href=file+'?v='+ADVANCED_VERSION;}
      else{s.src=file+'?v='+ADVANCED_VERSION;s.async=false;}
      s.onload=function(){delete v2PendingLoads[file];if(v2File(file)&&!v2Gate()){delete loading[file];reject(new Error('v2-gate-closed'));return;}resolve(file);};
      s.onerror=function(){delete loading[file];delete v2PendingLoads[file];if(s.parentNode)s.parentNode.removeChild(s);reject(new Error(t('Module avancé introuvable : ')+file));};
      if(v2File(file))v2PendingLoads[file]=s.onerror;
      (document.head||document.body).appendChild(s);
    });
    loading[file]=promise;return promise;
  }
  function loadAdvanced(files){
    if(performance!=='performance')return Promise.reject(new Error(t('Profil Éco : vues avancées désactivées sur cette tablette.')));
    var list=Array.isArray(files)?files:[files];
    for(var i=0;i<list.length;i++)if(typeof list[i]!=='string'||(!/^[a-z0-9][a-z0-9-]*\.js$/.test(list[i])&&list[i]!=='performance-v2.css'))return Promise.reject(new Error(t('Nom de module avancé invalide.')));
    // Check the complete batch before requesting even its first item.
    for(var j=0;j<list.length;j++)if(v2File(list[j])&&(!v2Gate()||!v2Idle()||v2Suspended()))return Promise.reject(new Error('v2-gate-closed'));
    // preview-gl is also the existing GPU probe: it MUST remain loadable before
    // v2 starts. Once v2 starts, even a cached/in-flight renderer waits for the
    // real inspect provider. Check both sides of the asynchronous load.
    function sceneReady(next){
      if(v2Started&&(list.indexOf('preview-gl.js')>=0||list.indexOf('origin-preview.js')>=0)){
        if(!v2Gate()||v2Suspended())return Promise.reject(new Error('v2-gate-closed'));
        if(!v2Ready)return v2Bootstrap.then(function(){
          if(!v2Gate()||v2Suspended())throw new Error('v2-gate-closed');
          return next();
        });
      }
      return next();
    }
    return sceneReady(function(){return Promise.all(list.map(loadOne)).then(function(result){
      return sceneReady(function(){return result;});
    });});
  }
  // ---- Performance v2 bootstrap. Only this small gate lives in the baseline bundle. ----
  // v2 is the default: an absent preference is ON; the gate still closes it in Éco, laser,
  // narrow screen or software GPU (the RT). A session is one page opening. The preference is captured ONCE here. A user change
  // only affects the next page, with no reload. An initially busy session cannot enable
  // v2 later when its job finishes. Unknown initial state waits for a fresh Idle report.
  var V2_KEY='cncjs-touch-performance-ui-v2';
  function v2Read(){
    try{
      var raw=window.localStorage.getItem(V2_KEY);
      if(raw===null||raw===undefined)return {enabled:true,storage:'absent'};
      var value=JSON.parse(raw);
      if(value&&value.version===1&&typeof value.enabled==='boolean')return {enabled:value.enabled,storage:'ok'};
      return {enabled:false,storage:'invalid'};
    }catch(_){return {enabled:false,storage:'unreadable'};}
  }
  var v2Preference=v2Read(),v2Session=v2Preference.enabled,v2Blocked=false,v2Stopped=false;
  var v2Detail=null,v2Started=false,v2Ready=false,v2Layout=false,v2Frame=0,v2Sent='',v2Reason='waiting';
  // Keep controller provenance across selection changes for this entire page. Do
  // not evict: recreating an evicted report's arrival would make old data fresh.
  var v2Reports=Object.create(null),v2ReportCount=0,V2_REPORT_LIMIT=64;
  var v2Ended=false,v2Locked=false,v2StorageFailed=false;
  var v2Bootstrap=null;
  function v2Now(){return window.performance&&typeof window.performance.now==='function'?window.performance.now():null;}
  function v2Number(n){return typeof n==='number'&&isFinite(n)&&n>=0;}
  function v2ReportStamp(m){return typeof m.statusObservedAt==='number'&&isFinite(m.statusObservedAt)?m.statusObservedAt:null;}
  function v2Virtual(m){return !!(v2Detail&&v2Detail.simulation===true&&m&&m.port==='SIMULATION'&&m.machineProfile&&
    m.machineProfile.simulated===true&&m.machineProfile.canChange===true);}
  function v2RememberReport(m){
    var now=v2Now();
    if(!m||!v2Number(now))return;
    var virtual=v2Virtual(m),server=v2ReportStamp(m);
    // Transport envelopes and new JS objects cannot identify real controller
    // reports. Only the explicitly accepted virtual model keeps its old fallback.
    if(!virtual&&server===null)return;
    var context=JSON.stringify([m.port,m.generation]),record=v2Reports[context];
    var transport=virtual&&v2Detail&&v2Number(v2Detail.observedAt)?v2Detail.observedAt:null;
    var changed=!record||(server!==null&&record.server!==null?server!==record.server:
      virtual&&record.server===null&&transport!==null&&record.transport!==null&&transport!==record.transport);
    if(!record){
      if(v2ReportCount>=V2_REPORT_LIMIT)return;
      v2ReportCount++;
    }
    if(changed){
      record={server:server,transport:transport,arrival:now,virtual:virtual,age:virtual?0:v2Number(m.statusAgeMs)?m.statusAgeMs:null};
      v2Reports[context]=record;
    }
    if(virtual){
      if(server!==null)record.server=server;
      if(transport!==null)record.transport=transport;
    }
  }
  function v2ReportAge(m){
    var unknown={known:false,fresh:false,ageMs:null},now=v2Now();
    if(!m||!v2Number(now))return unknown;
    var virtual=v2Virtual(m),server=v2ReportStamp(m),record=v2Reports[JSON.stringify([m.port,m.generation])];
    // Consultation never creates/replaces an arrival: a consumer may still hold
    // an older snapshot after the status handler has observed a newer report.
    if(!record||record.virtual!==virtual||(!virtual&&server===null)||
      (server!==null&&record.server!==server))return unknown;
    if(!v2Number(record.age)||now<record.arrival||!virtual&&!v2Number(m.statusAgeMs))return unknown;
    var age=record.age+now-record.arrival;
    return {known:true,fresh:m.fresh===true&&age<=2500,ageMs:age};
  }
  function v2Idle(){
    var d=v2Detail,m=d&&d.machine;
    if(!v2ReportAge(m).fresh)return false;
    // The existing virtual model has no Grbl age or spindle telemetry. Its explicit
    // simulated Idle/canChange state is sufficient on the simulation page only;
    // missing real telemetry remains unknown and is never replaced by zero.
    return (v2Virtual(m)||m.spindleSpeed===0)&&
      m.activeState==='Idle'&&m.workflow==='idle'&&!d.busy&&!d.halt&&!d.systemCommand&&
      (d.simulation===true||d.transportConnected===true)&&!m.canStop&&!m.loading&&!m.homing&&!m.probing&&!m.probeBusy&&
      !(m.motion&&(m.motion.jog||m.motion.cancelling));
  }
  function v2Eligible(){
    var g=window.cncGpu&&window.cncGpu.state?window.cncGpu.state():null;
    return performance==='performance'&&kind==='cnc'&&!!g&&g.checked===true&&g.hardware===true&&!g.lost&&
      !!window.cncLayout&&window.cncLayout.wide()===true&&(!window.cncLayout.admissible||window.cncLayout.admissible()===true);
  }
  function v2IsLocked(){return v2Locked||!!(window.cncScreenLock&&typeof window.cncScreenLock.locked==='function'&&window.cncScreenLock.locked());}
  function v2Suspended(){return document.hidden||v2IsLocked();}
  // Before readiness a lock/hidden document revokes the bootstrap until next opening.
  // After readiness the contract suspends reads/rendering while retaining caches.
  function v2Gate(){return v2Session&&v2Started&&!v2Blocked&&!v2Stopped&&!v2Ended&&(v2Ready||!v2Suspended())&&v2Eligible();}
  function v2ProgramKey(){var m=v2Detail&&v2Detail.machine;return m?JSON.stringify([m.port,m.generation,m.revision,m.name,m.fingerprint]):null;}
  function v2State(){return {version:1,enabled:v2Preference.enabled,sessionEnabled:v2Session,
    eligible:v2Eligible(),open:v2Gate(),ready:v2Ready,layout:v2Layout,safeIdle:v2Idle(),
    holdLayout:v2Layout&&!v2Idle(),pending:v2Preference.enabled!==v2Session||v2Blocked||v2Stopped,
    reason:v2Reason,programKey:v2ProgramKey()};}
  function v2Message(){
    // Bootstrap text is embedded: settings must work in Eco without requesting a catalogue.
    // Kept identical to the deferred catalogue by test-v2-i18n.cjs.
    var lang=window.cncI18n&&window.cncI18n.language;
    if(v2StorageFailed)return lang==='en'?'Change not saved: browser storage unavailable.':lang==='es'?'Cambio no guardado: almacenamiento del navegador no disponible.':'Changement non enregistré : stockage du navigateur indisponible.';
    return lang==='en'?'Change prepared for the next idle session':lang==='es'?'Cambio preparado para la próxima sesión en reposo':'Changement préparé pour la prochaine session au repos';
  }
  function v2SetPreference(enabled){
    if(typeof enabled!=='boolean')return {ok:false,persisted:false,message:v2Message()};
    var persisted=false;
    try{var raw=JSON.stringify({version:1,enabled:enabled});window.localStorage.setItem(V2_KEY,raw);persisted=window.localStorage.getItem(V2_KEY)===raw;}catch(_){}
    v2StorageFailed=!persisted;
    if(persisted)v2Preference={enabled:enabled,storage:'ok'};
    // Even if persistence fails, an explicit stop releases this page's resources.
    if(!enabled&&v2Session){v2Stopped=true;v2Reason='preference';}
    v2Refresh();return {ok:true,persisted:persisted,message:v2Message()};
  }
  function v2Publish(){
    if(!v2Session&&!v2Preference.enabled&&!v2Layout)return;
    if(!v2Started&&!v2Layout&&!v2Eligible()&&v2Preference.enabled===v2Session)return;
    var state=v2State(),signature=JSON.stringify(state);
    if(signature===v2Sent)return;v2Sent=signature;
    window.dispatchEvent(new CustomEvent('cnc-v2-change',{detail:state}));
  }
  function v2CancelLoads(){Object.keys(v2PendingLoads).forEach(function(file){var cancel=v2PendingLoads[file];delete v2PendingLoads[file];cancel();});}
  function v2Refresh(){
    if(v2Started&&!v2Eligible()){
      v2Stopped=true;v2Reason=performance==='eco'?'eco':kind!=='cnc'?'machine-kind':'gpu-or-layout';
    }
    if(v2Started&&!v2Ready&&!v2Idle()){v2Blocked=true;v2Reason='unsafe-bootstrap';}
    // Latch synchronously: visibility/unlock can return before a rejected resource
    // promise runs its catch, and must not reopen an already cancelled bootstrap.
    if(v2Started&&!v2Ready&&v2Suspended()){v2Stopped=true;v2Reason='bootstrap-suspended';}
    if(!v2Gate())v2CancelLoads();
    v2Publish();
    // No new timer, frame or DOM mutation on RT/Eco or with an absent preference.
    if(v2Ended||v2Frame||!window.requestAnimationFrame)return;
    if(!v2Layout&&(!v2Session||v2Blocked||v2Stopped||!v2Eligible()||!v2Idle()||document.hidden||v2IsLocked()))return;
    v2Frame=window.requestAnimationFrame(v2Apply);
  }
  function v2Apply(){
    v2Frame=0;if(v2Ended)return;
    if(v2Layout){
      // Preference reversal waits for the next page. Capability loss may return to the
      // old layout at rest, never in unknown/Run/Hold/Alarm. Resources already stopped.
      if(!v2Eligible()&&v2Idle()){v2Layout=false;document.body.classList.toggle('perf-v2',false);v2Publish();}
      return;
    }
    if(!v2Session||v2Blocked||v2Stopped||!v2Eligible()||!v2Idle()||document.hidden||v2IsLocked())return;
    if(v2Ready){
      v2Layout=true;document.body.classList.toggle('perf-v2',true);
      if(window.cncShell&&window.cncShell.v2Mounts)window.cncShell.v2Mounts(true);
      v2Reason='ready';v2Publish();return;
    }
    if(v2Started)return;
    v2Started=true;v2Reason='loading';
    // Serial requests: catalogue, contract, L1 inspection, L2 sequences (which
    // installs the existing geometry provider), then L3 observations and journal.
    // Placement remains owned by the on-demand origin module, never on simulation.
    // Install the barrier BEFORE publishing loading: listeners may synchronously
    // ask for an already cached renderer. Every next request rechecks the gate.
    v2Bootstrap=loadAdvanced('i18n-messages-v2.js');
    ['performance-v2-contract.js','performance-inspect.js','performance-sequences.js',
      'performance-observation.js','performance-journal-context.js','performance-v2.css'].forEach(function(file){
      v2Bootstrap=v2Bootstrap.then(function(){return loadAdvanced(file);});
    });
    v2Bootstrap=v2Bootstrap.then(function(){
      if(!v2Gate()||!v2Idle())throw new Error('v2-gate-closed');
      var api=window.cncV2;
      if(typeof api.use!=='function'||['inspect','sequences','observation','journal'].some(function(slot){
        return api.use(slot).stub===true;
      }))throw new Error('v2-provider-unavailable');
      v2Ready=true;v2Refresh();
    });
    v2Bootstrap.catch(function(){v2Stopped=true;v2Reason='bootstrap-unavailable';v2CancelLoads();v2Publish();});
    // An existing v1 scene cannot acquire v2 inspection retroactively. Close it in
    // this RAF, then let the normal view listener reopen it after the barrier.
    if(window.CNCPreviewGL&&typeof window.CNCPreviewGL.close==='function')window.CNCPreviewGL.close('v2-bootstrap');
    v2Publish();
  }
  function v2Observe(e){
    var d=e&&e.detail;if(!d)return;
    var sim=document.body&&document.body.getAttribute&&document.body.getAttribute('data-simulation')==='true';
    if(!!d.simulation!==!!sim)return;
    var m=d.machine;
    v2Detail=d;
    // Establish first arrival even while v2 is unavailable. All consumers, safe
    // Idle and read leases use this same clock; missing snapshots never clear it.
    v2RememberReport(m);
    // Latch every observed activity, even if it stops before the first RAF. Missing
    // telemetry is still allowed to wait for a known Idle on this page opening.
    if(!v2Layout&&((m&&(m.workflow&&m.workflow!=='idle'||m.activeState&&m.activeState!=='Idle'||m.canStop||m.loading||m.homing||
      m.probing||m.probeBusy||v2Number(m.spindleSpeed)&&m.spindleSpeed>0||m.motion&&(m.motion.jog||m.motion.cancelling)))||d.busy||d.halt||d.systemCommand))v2Blocked=true;
    v2Refresh();
  }
  window.cncV2={version:1,gate:v2Gate,state:v2State,reportAge:v2ReportAge,
    preference:function(){return {version:1,enabled:v2Preference.enabled,storage:v2Preference.storage};},
    setPreference:v2SetPreference,message:v2Message};
  window.addEventListener('cnc-job-status',v2Observe);
  window.addEventListener('cnc-gpu-change',v2Refresh);
  window.addEventListener('cnc-layout-change',v2Refresh);
  window.addEventListener('resize',v2Refresh);
  window.addEventListener('cnc-profile-change',v2Refresh);
  window.addEventListener('cnc-screen-lock',function(e){v2Locked=!!e.detail;v2Refresh();});
  window.addEventListener('pagehide',function(){
    v2Ended=true;v2Reason='pagehide';v2CancelLoads();
    if(v2Frame&&window.cancelAnimationFrame)window.cancelAnimationFrame(v2Frame);v2Frame=0;v2Publish();
  });
  document.addEventListener('visibilitychange',v2Refresh);
  window.addEventListener('cnc-job-status',observe);
  window.cncProfile={
    performance:function(){return performance;},
    setPerformance:setPerformance,
    // 'absent' | 'ok' | 'invalid' | 'unreadable': how the stored value read at start-up.
    storage:function(){return storage;},
    machine:function(){return profile;},
    kind:function(){return kind;},
    capability:capability,
    loadAdvanced:loadAdvanced
  };
  if(document.body)classes();else document.addEventListener('DOMContentLoaded',classes);
})();
