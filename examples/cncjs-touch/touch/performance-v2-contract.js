/* CNCjs Touch Performance v2 — inter-lot contract, version 1 (L0).
 *
 * BOOT / SESSION (tablet-profile.js owns this part, available even in Eco)
 *   window.cncV2.version = 1
 *   preference() -> {version:1, enabled:Boolean, storage:absent|ok|invalid|unreadable}
 *   setPreference(Boolean) -> {ok, persisted, message}; never reloads or commands.
 *   Storage: cncjs-touch-performance-ui-v2 = {"version":1,"enabled":true|false}.
 *   A session is one page opening, including a restored bfcache page (pagehide ends
 *   its advanced work). A preference is captured at boot. Changed preferences apply
 *   to the NEXT page at fresh Idle, never when the current job finishes. An initially
 *   busy page cannot activate later. Unknown initial state waits for a known Idle.
 *   gate() -> Boolean: resources permitted; NEVER a machine permission.
 *   state() -> {version,enabled,sessionEnabled,eligible,open,ready,layout,safeIdle,
 *               holdLayout,pending,reason,programKey}. `layout` can stay true with
 *   `open:false`. programKey is an invalidation tuple, never proof of content match.
 *   eligible = Performance AND known CNC AND existing cncGpu hardware, not lost,
 *              AND cncLayout.wide(). No probe or URL override is introduced.
 *   Bootstrap and CSS/mount mutations run in RAF and recheck fresh Idle. Resource
 *   revocation is synchronous. body.perf-v2 follows layout, NOT permission to render.
 *   Lock or document hidden during bootstrap cancels its pending resource and
 *   latches cancellation until the next page opening. A bootstrap not yet started
 *   may begin at safe Idle after unlock/visibility; a ready page retains caches.
 *   safeIdle ages each report from its first monotone arrival and initial age;
 *   duplicate server statusObservedAt (or transport observedAt when absent) never
 *   renews it, including civil-clock rollback and temporary missing snapshots.
 *   The simulation page uses the existing explicitly simulated Idle/canChange model;
 *   it does not invent missing Grbl age, coordinates, fingerprint or spindle reports.
 *   Eco/lost GPU stop resources at once; the old layout returns only at known Idle.
 *   Changing the preference off stops resources but retains this page's layout.
 *   `ready` means the catalogue, contract and L1/L2/L3 bootstrap modules loaded:
 *   inspect, sequences, observation and journal replace their stubs. Geometry is
 *   installed from the existing preview-inspect module by sequences; placement
 *   is installed by origin-preview on demand (never on the simulation page).
 *   L4/L5/L6 presenters remain stubs until their modules are integrated.
 *
 * EVENTS (window CustomEvent; state/model handlers must not render)
 *   cnc-v2-change: detail = state() above; read gate() again before asynchronous work.
 *   cnc-v2-data: {slot, snapshot}; consumers queue a RAF via lifecycle.scope().frame().
 *   cnc-v2-lifecycle: {reason, releaseCache}; cancel callbacks run BEFORE this event.
 *   Existing cnc-job-status, cnc-screen-change, cnc-screen-lock, cnc-profile-change,
 *   cnc-gpu-change, visibilitychange and pagehide retain their existing meanings.
 *   Never manufacture cnc-job-status, canStart/canResume or a travel verdict here.
 *
 * MODELS (all snapshots version:1; unavailable information is null, never zero)
 *   identity.create({role:'loaded'|'selection',file,fingerprint,controller,generation,
 *                    revision}) -> frozen Identity. fingerprint is the existing
 *   opaque server fingerprint string. key = JSON [file,fingerprint], or null.
 *   jobKey = JSON [controller,generation,revision,key], only for a known loaded job.
 *   compare(a,b) -> same|different|unknown (content only, NOT job identity).
 *   File names alone never prove a match. Selection never replaces loaded identity.
 *   The controller/generation/revision/fingerprint tuple invalidates loaded caches;
 *   resumed programs keep server revision and source line numbering (1-based).
 *
 *   time.stamp({serverTime,serverSource}) -> {arrivalMonoMs,civilMs,
 *                                            server:{value,source}}.
 *   time.age(stamp[,nowMonoMs]) -> nonnegative ms|null; no Date.now subtraction.
 *   time.freshness(stamp,reportAgeMs[,nowMonoMs]) -> fresh|stale|unknown.
 *   stale when report age + elapsed > 2500 ms. Civil time is presentation only;
 *   server times are never calibrated/compared to the local monotone clock here.
 *
 * L1 `inspect` snapshot:
 *   {version,available,identity,geometryKey,selection:null|{
 *     segment,sourceLine,passId,nominalMm:{x,y,z},approximate,toleranceMm,
 *     candidates:[segment ids]}, quality:{mode:full|reduced|fixed|unknown,dpr:null|n}}.
 *   Candidates are bounded (<=8), ambiguity remains explicit. A selection is visual,
 *   never an instruction to move. L1 owns one active GPU context, not one per mount.
 *
 * L2 `geometry` snapshot (immutable, prepared only at rest):
 *   {version,available,identity,geometryKey,quality:full|simplified|unknown,
 *    toleranceMm:null|n,segmentCount,units:'mm',wcs:null|'G54'...,
 *    buffers:null|{positions:Float32Array(6*n),sourceLines:Uint32Array(n),
 *                  passIds:Uint32Array(n)},
 *    passes:[{id,firstSegment,endSegment,firstLine,lastLine}],
 *    memory:{owner:'L2',mode:'borrowed-readonly',transferables:[]}}.
 *   Positions contain XYZ start/end for every segment, millimetres in program WCS.
 *   toleranceMm bounds arc subdivision plus XYZ rounding in the exported Float32
 *   positions; it describes nominal geometry, never physical machining accuracy.
 *   Segment indexes/ranges are 0-based, endSegment exclusive; sourceLines are 1-based
 *   original program lines, 0 means unknown. Full and simplified share these units.
 *   geometryKey includes identity.key, geometry version, quality, tolerance and filters.
 *   L2 owns the single loaded cache (<=500000 segments) and transfers worker buffers
 *   ONCE to the page; worker loses ownership. L1/L3/UI only BORROW; they must neither
 *   mutate nor transfer/detach these buffers. L1 owns its GPU copies and proximity
 *   index, bounded and built at rest. Invalidation releases ALL borrowers before L2.
 *   JS cannot freeze TypedArray elements: immutability is a consumer obligation.
 *
 * L2 `sequences`:
 *   {version,available,identity,geometryKey,current:null|Sequence,next:null|Sequence,
 *    items:[Sequence]}; Sequence={id,firstLine,lastLine,label:null|string,
 *    provenance:'declared'|'inferred',kind:'rapid'|'pause'|'tool'|'group',
 *    estimated:true,durationSeconds:null|n}. No G-code text read during a job;
 *   an inferred rapid grouping is not a named machining operation.
 * L2 `placement`:
 *   {version,available,identity,current:null|{wcs,offsetMm},hypothesis:null|{
 *    axes:['x','y'],deltaMm:{x,y},zUnchanged:true},
 *    travel:{verdict:'unknown'|'inside'|'outside',source:null|string,marginsMm:null|{
 *    x:{min,max},y:{min,max}},zVerified:false,collisionsVerified:false},
 *    declarations:[{kind:'stock'|'clamp'|'dimension',source:'project'|'operator'|
 *    'program',identity,value,units:'mm',assumptions:[]}]}.
 *   Reuse CNCTravelCheck.place(); missing $23/convention stays unknown. UI may not
 *   upgrade its verdict. No visual origin on simulation.html (mounts.prepare.origin
 *   is null there). Declarations do not check off preparation or prove safety.
 *
 * L3 `observation`:
 *   {version,available,identity,time:null|Stamp,
 *    report:{freshness:'unknown'|'fresh'|'stale',ageMs:null|n,wcs:null|string,
 *      units:null|'mm'|'in',position:null|{x,y,z},feedMmMin:null|n,spindleS:null|n},
 *    acknowledgement:{line:null|n,total:null|n,meaning:'accepted-not-machined'},
 *    estimate:{seconds:null|n,source:null|string,estimated:true,unknowns:[]},
 *    samples:[{atMonoMs,feedMmMin:null|n,gap:Boolean}],markers:[]}.
 *   L3 supplies facts, not permissions. No extrapolation past the last report;
 *   stale freezes last geometry/progress and visibly qualifies it. The history is
 *   bounded to 60 s / 240 samples / 100 markers. Missing intervals are gaps, not 0.
 *   Chart draws <=1 Hz, in RAF, only while visible; the contract starts NO timer.
 * L3 `journal`:
 *   {version,available,identity,interval:null|{fromMonoMs,toMonoMs},
 *    civilInterval:null|{fromMs,toMs,source},events:[],retained:false}.
 *   Events={id,identity,time,source:'device'|'server'|'report'|'inferred',
 *     state:'sent'|'confirmed'|'refused'|'uncertain',code,params}.
 *   No fabricated conversion between clocks; missing history stays unavailable.
 *   Respect existing local 100-entry retention; server history paged on demand.
 *
 * PRESENTERS / STUBS (L4 suivi; L5 files,prepare; L6 machine,history,settings)
 *   use(slot) -> provider or usable no-op stub. Every provider implements
 *   snapshot(), update(facts), cancel(reason), dispose(reason). cancel must release
 *   cached data on program-changed; dispose is terminal (Eco/gate close/pagehide or
 *   unregister). update receives the
 *   models above, not transport objects or permission callbacks. Presentation stub
 *   snapshots are {version,available:false,screen,model:null}; they do not mount.
 *   register(slot,provider) -> unregister function; requires an open gate. A second
 *   registration is refused until the first is unregistered. notify(slot) publishes
 *   its frozen data snapshot only; never pass callbacks, DOM or commands as data.
 *   Models may be shared between screens; a presenter must use its own scope.
 *   Stubs intentionally report unavailable, not convincing demonstration telemetry.
 *
 * MOUNTS (created once at safe activation, never in a state handler)
 *   mounts.get('home'|'files'|'prepare'|'machine'|'history'|'settings') ->
 *   {screen,root,content,origin}; root is the existing section, content a hidden empty
 *   #perf-v2-<screen> container reserved for its presenter (unhide only when ready).
 *   prepare maps to #screen-jog; origin is null in simulation, content otherwise.
 *   mounts.strip() -> {context,messages}; existing read-only context/message cells,
 *   no new strip cell and NO safety button references. Shell/strip own placements.
 *   L4 scopes CSS under body.perf-v2, preserves command IDs/relays and fixed boxes;
 *   L5 keeps >=24 px between scene and jog. Sheets use cncShell.sheet / StripGuard.
 *   No reparenting of Pause/Arrêter. No graphic API accepts a machine send function.
 *   commands === null. Start/resume/origin/jog continue in their existing modules.
 *   Integration obligations in files owned by other lots:
 *   - L4 job-dashboard.js arrange()/resize must honor state().holdLayout before
 *     changing 2/3 zones (its v1 code reads innerWidth independently of the shell).
 *   - L5 job-preparation.js originSync() must retain the origin card while holdLayout,
 *     and ask L2 to suspend rendering; v1 unmounts the card when Eco is chosen.
 *   - L6 display-settings.js exposes preference()/setPreference(), shows persisted
 *     failures and message(); no reload. L1 exposes reduced/fixed quality via inspect.
 *   - L0 integration adds the completed heavy modules and L4 CSS to the guarded
 *     loader. L7 performs real browser hit-tests; VM node identity is not a hit-test.
 *
 * LIFECYCLE — scope(screen[,slot]), prepare maps to jog; screen null = shared model.
 *   L2 uses scope(null,'geometry') for the owned cache; borrowers name their own slot.
 *   This makes borrower cleanup precede buffer-owner cleanup, including providers.
 *   token() -> lease|null: only safe Idle, visible, unlocked and gate open.
 *   valid(lease) must be checked after EVERY asynchronous read/worker result.
 *   track('read'|'render'|'cache',cancelFn) -> untrack; no work is started by track.
 *   frame(fn): coalesced RAF; no rendering when hidden, locked or gate closed.
 *   dispose(): idempotent, cancels frame/read/worker, releases cache/listeners.
 *   screen hidden / document hidden / lock: cancel read/render, retain loaded cache.
 *   job starts OR report unknown/stale: cancel reads, retain prepared scene/cache.
 *   loaded identity changes: cancel everything, release cache (selection is ignored).
 *   Eco / GPU loss / gate close / pagehide (also bfcache): cancel/release everything.
 *   A cancel callback MUST terminate its worker/abort its read; a late result loses
 *   its lease and cannot publish. No worker, read, interval or GPU is created here.
 *   A context loss stays in the same rectangle. Reopening after pagehide is a new
 *   idle page, never an automatic resume of advanced work or a machine operation.
 */
(function () {
  'use strict';
  var api=window.cncV2;
  // A script requested before an Eco/job transition can still finish executing.
  if(!api||!api.gate()||api.identity)return;
  function finite(n){return typeof n==='number'&&isFinite(n);}
  function string(s){return typeof s==='string'&&s?s:null;}
  function freeze(value){
    if(!value||typeof value!=='object'||Object.isFrozen(value))return value;
    if(typeof ArrayBuffer!=='undefined'&&ArrayBuffer.isView(value))return value;
    Object.keys(value).forEach(function(k){freeze(value[k]);});return Object.freeze(value);
  }
  function now(){return window.performance&&window.performance.now?window.performance.now():null;}
  function identity(input){
    var x=input||{},role=x.role==='selection'?'selection':'loaded',file=string(x.file),fp=string(x.fingerprint);
    var key=file&&fp?JSON.stringify([file,fp]):null,controller=string(x.controller),generation=string(x.generation);
    var revision=typeof x.revision==='string'||finite(x.revision)?x.revision:null;
    return freeze({version:1,role:role,file:file,fingerprint:fp,controller:controller,generation:generation,revision:revision,key:key,
      jobKey:role==='loaded'&&key&&controller&&generation&&revision!==null?JSON.stringify([controller,generation,revision,key]):null});
  }
  function stamp(input){var x=input||{};return freeze({arrivalMonoMs:now(),civilMs:Date.now(),server:{value:finite(x.serverTime)?x.serverTime:null,source:string(x.serverSource)}});}
  function age(s,at){var n=at===undefined?now():at;return s&&finite(s.arrivalMonoMs)&&finite(n)&&n>=s.arrivalMonoMs?n-s.arrivalMonoMs:null;}
  api.identity={create:identity,compare:function(a,b){return !a||!b||!a.key||!b.key?'unknown':a.key===b.key?'same':'different';}};
  api.time={stamp:stamp,age:age,freshness:function(s,reportAge,at){var elapsed=age(s,at);return elapsed===null||!finite(reportAge)||reportAge<0?'unknown':reportAge+elapsed>2500?'stale':'fresh';}};
  api.events=freeze({change:'cnc-v2-change',data:'cnc-v2-data',lifecycle:'cnc-v2-lifecycle'});
  api.commands=null;
  var definitions={
    inspect:['L1',{identity:null,geometryKey:null,selection:null,quality:{mode:'unknown',dpr:null}}],
    geometry:['L2',{identity:null,geometryKey:null,quality:'unknown',toleranceMm:null,segmentCount:null,units:'mm',wcs:null,buffers:null,passes:[],memory:{owner:'L2',mode:'borrowed-readonly',transferables:[]}}],
    sequences:['L2',{identity:null,geometryKey:null,current:null,next:null,items:[]}],
    placement:['L2',{identity:null,current:null,hypothesis:null,travel:{verdict:'unknown',source:null,marginsMm:null,zVerified:false,collisionsVerified:false},declarations:[]}],
    observation:['L3',{identity:null,time:null,report:{freshness:'unknown',ageMs:null,wcs:null,units:null,position:null,feedMmMin:null,spindleS:null},acknowledgement:{line:null,total:null,meaning:'accepted-not-machined'},estimate:{seconds:null,source:null,estimated:true,unknowns:[]},samples:[],markers:[]}],
    journal:['L3',{identity:null,interval:null,civilInterval:null,events:[],retained:false}],
    suivi:['L4',{screen:'home',model:null}],files:['L5',{screen:'files',model:null}],prepare:['L5',{screen:'prepare',model:null}],
    machine:['L6',{screen:'machine',model:null}],history:['L6',{screen:'history',model:null}],settings:['L6',{screen:'settings',model:null}]
  },stubs=Object.create(null),providers=Object.create(null),scopes=[],active=window.cncShell&&window.cncShell.screen?window.cncShell.screen():'menu',
    // The lock may have announced while this script was still being fetched.
    locked=!!(window.cncScreenLock&&typeof window.cncScreenLock.locked==='function'&&window.cncScreenLock.locked()),
    ended=false,lastIdentity=api.state().programKey,wasIdle=api.state().safeIdle;
  Object.keys(definitions).forEach(function(name){
    var d=definitions[name],empty=freeze(Object.assign({version:1,available:false},d[1]));
    stubs[name]=freeze({owner:d[0],stub:true,snapshot:function(){return empty;},update:function(){return empty;},cancel:function(){},dispose:function(){}});
  });
  api.use=function(name){if(!stubs[name])throw new Error('Unknown v2 slot');return providers[name]||stubs[name];};
  api.register=function(name,provider){
    if(!stubs[name]||providers[name]||!api.gate()||!provider||['snapshot','update','cancel','dispose'].some(function(k){return typeof provider[k]!=='function';}))throw new Error('Invalid v2 provider');
    providers[name]=provider;var removed=false;
    return function(){if(removed)return;removed=true;if(providers[name]===provider){delete providers[name];provider.dispose('unregister');}};
  };
  api.notify=function(name){
    if(!api.gate())return false;
    var value=api.use(name).snapshot();
    function dataOnly(data,ancestors){
      if(data===null||typeof data==='string'||typeof data==='boolean'||finite(data))return;
      if(!data||typeof data!=='object'||ancestors.indexOf(data)>=0||data.nodeType||data.tagName)throw new Error('V2 models contain data only');
      if(typeof ArrayBuffer!=='undefined'&&ArrayBuffer.isView(data))return;
      Object.keys(data).forEach(function(k){dataOnly(data[k],ancestors.concat([data]));});
    }
    dataOnly(value,[]);
    window.dispatchEvent(new CustomEvent(api.events.data,{detail:freeze({slot:name,snapshot:value})}));return true;
  };
  api.mounts={get:function(screen){var s=window.cncShell;return s&&s.v2Mounts?s.v2Mounts()[screen]||null:null;},
    strip:function(){var s=window.cncStatusStrip;return s&&s.v2Mounts?s.v2Mounts():null;}};
  function visible(screen){return !ended&&!document.hidden&&!locked&&api.gate()&&(!screen||active===(screen==='prepare'?'jog':screen));}
  function invoke(fn,reason){try{fn(reason);}catch(_){/* One failing consumer must not prevent the others releasing. */}}
  function scope(screen,slot){
    if(slot!==undefined&&!stubs[slot])throw new Error('Unknown v2 resource owner');
    var epoch=0,disposed=false,frameId=0,latest=null,tasks=[];
    function invalidate(reason,release,readsOnly){
      epoch++;
      if(!readsOnly){if(frameId)window.cancelAnimationFrame(frameId);frameId=0;latest=null;}
      var remove=tasks.filter(function(t){return t.kind==='read'||(!readsOnly&&t.kind==='render')||release;});
      tasks=tasks.filter(function(t){return remove.indexOf(t)<0;});
      remove.forEach(function(t){invoke(t.cancel,reason);});
    }
    var life={screen:screen||null,slot:slot||null,
      token:function(){return !disposed&&visible(screen)&&api.state().safeIdle?Object.freeze({scope:life,epoch:epoch}):null;},
      valid:function(token){return !!token&&token.scope===life&&token.epoch===epoch&&!disposed&&visible(screen)&&api.state().safeIdle;},
      track:function(kind,cancel){
        if(['read','render','cache'].indexOf(kind)<0||typeof cancel!=='function')throw new Error('Invalid v2 resource');
        if(disposed||!api.gate()||(kind!=='cache'&&!visible(screen))||(kind==='read'&&!life.token())){invoke(cancel,'unavailable');return function(){};}
        var entry={kind:kind,cancel:cancel};tasks.push(entry);
        return function(){tasks=tasks.filter(function(t){return t!==entry;});};
      },
      frame:function(fn){
        if(disposed||!visible(screen))return;latest=fn;if(frameId)return;
        frameId=window.requestAnimationFrame(function(){frameId=0;var render=latest;latest=null;if(!disposed&&visible(screen)&&render)render();});
      },
      dispose:function(){if(disposed)return;disposed=true;invalidate('dispose',true);scopes=scopes.filter(function(s){return s.life!==life;});}
    };
    scopes.push({life:life,invalidate:invalidate});return life;
  }
  api.lifecycle={scope:scope};
  function cancel(reason,release,readsOnly){
    // Order BOTH scope cleanup and provider cleanup: no L2 buffer owner is released
    // before an L1/L3/UI borrower, regardless of registration order.
    function rank(slot){return definitions[slot]&&definitions[slot][0]==='L2'?1:0;}
    var cleanup=scopes.slice().map(function(s){return {rank:rank(s.life.slot),run:function(){s.invalidate(reason,release,readsOnly);}};});
    Object.keys(providers).forEach(function(name){var p=providers[name];cleanup.push({rank:rank(name),run:function(){
      invoke(function(){p.cancel(reason);},reason);
      if(release&&reason!=='program-changed'){delete providers[name];invoke(function(){p.dispose(reason);},reason);}
    }});});
    cleanup.sort(function(a,b){return a.rank-b.rank;}).forEach(function(c){c.run();});
    window.dispatchEvent(new CustomEvent(api.events.lifecycle,{detail:{reason:reason,releaseCache:release}}));
  }
  function status(e){
    var d=e.detail,m=d&&d.machine;
    if(!d||!!d.simulation!==(document.body.getAttribute('data-simulation')==='true'))return;
    var key=m?JSON.stringify([m.port,m.generation,m.revision,m.name,m.fingerprint]):null;
    if(lastIdentity!==null&&key!==lastIdentity)cancel('program-changed',true);
    lastIdentity=key;
    var idle=api.state().safeIdle;
    if(!idle&&wasIdle)cancel('job-or-unknown',false,true);
    wasIdle=idle;
  }
  var gateWasOpen=true;
  function gate(){var open=api.gate();if(!open&&gateWasOpen)cancel(api.state().reason,true);gateWasOpen=open;}
  function screen(e){active=e.detail;scopes.slice().forEach(function(s){if(!visible(s.life.screen))s.invalidate('screen-hidden',false);});}
  function lock(e){locked=!!e.detail;if(locked)cancel('lock',false);}
  function hidden(){if(document.hidden)cancel('document-hidden',false);}
  function leave(){if(ended)return;ended=true;cancel('pagehide',true);scopes.slice().forEach(function(s){s.life.dispose();});
    window.removeEventListener('cnc-job-status',status);window.removeEventListener('cnc-v2-change',gate);
    window.removeEventListener('cnc-screen-change',screen);window.removeEventListener('cnc-screen-lock',lock);
    window.removeEventListener('pagehide',leave);document.removeEventListener('visibilitychange',hidden);
  }
  window.addEventListener('cnc-job-status',status);window.addEventListener('cnc-v2-change',gate);
  window.addEventListener('cnc-screen-change',screen);window.addEventListener('cnc-screen-lock',lock);
  window.addEventListener('pagehide',leave);document.addEventListener('visibilitychange',hidden);
})();
