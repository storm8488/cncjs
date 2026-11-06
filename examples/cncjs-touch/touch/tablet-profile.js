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
  var ADVANCED_VERSION='fixf3b';
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
    if(changed)fire(previous);
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
  var loading={};
  function loadOne(file){
    if(Object.prototype.hasOwnProperty.call(loading,file))return loading[file];
    var promise=new Promise(function(resolve,reject){
      var s=document.createElement('script');s.src=file+'?v='+ADVANCED_VERSION;s.async=false;
      s.onload=function(){resolve(file);};
      s.onerror=function(){delete loading[file];if(s.parentNode)s.parentNode.removeChild(s);reject(new Error(t('Module avancé introuvable : ')+file));};
      (document.head||document.body).appendChild(s);
    });
    loading[file]=promise;return promise;
  }
  function loadAdvanced(files){
    if(performance!=='performance')return Promise.reject(new Error(t('Profil Éco : vues avancées désactivées sur cette tablette.')));
    var list=Array.isArray(files)?files:[files];
    for(var i=0;i<list.length;i++)if(typeof list[i]!=='string'||!/^[a-z0-9][a-z0-9-]*\.js$/.test(list[i]))return Promise.reject(new Error(t('Nom de module avancé invalide.')));
    return Promise.all(list.map(loadOne));
  }
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
