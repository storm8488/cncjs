(function (root) {
  'use strict';
  function finiteNonnegative(value){return typeof value==='number'&&isFinite(value)&&value>=0;}
  function identity(value){return typeof value==='string'&&value.length>0;}
  // Shared by the streaming and fallback HTTP paths. Simulation has its own local schema.
  function validSnapshot(packet, streaming){
    if(!packet||typeof packet!=='object'||Array.isArray(packet)||packet.version!==1||
      !identity(packet.epoch)||!finiteNonnegative(packet.sequence)||packet.sequence<1||
      packet.sequence>9007199254740991||Math.floor(packet.sequence)!==packet.sequence||
      !finiteNonnegative(packet.sentAt)||!Array.isArray(packet.controllers)||
      (streaming&&!identity(packet.transportId)))return false;
    var ports=Object.create(null);
    return packet.controllers.every(function(c){
      if(!c||typeof c!=='object'||!identity(c.port)||ports[c.port]||c.controllerId!==c.port||
        !identity(c.generation)||typeof c.type!=='string'||typeof c.activeState!=='string'||
        typeof c.workflow!=='string'||typeof c.name!=='string'||typeof c.fresh!=='boolean')return false;
      ports[c.port]=true;
      if(!['canLoad','canStart','canResume','canPause','canStop'].every(function(key){return typeof c[key]==='boolean';}))return false;
      if(c.statusAgeMs!==null&&!finiteNonnegative(c.statusAgeMs))return false;
      if(c.statusObservedAt!==null&&!finiteNonnegative(c.statusObservedAt))return false;
      return !c.fresh||(c.statusAgeMs!==null&&c.statusObservedAt!==null);
    });
  }
  // Whether the API answers on this computer (kiosk: http://localhost:8000/touch/). Chromium sets
  // navigator.onLine to false when only the loopback interface is up (Wi-Fi off or changing), yet
  // the local server still answers: the flag is then ignored, never trusted to stop Pause / Arrêter.
  function loopback(base){
    var host='';
    try{host=/^[a-z][a-z0-9+.-]*:\/\//i.test(String(base))?new URL(String(base)).hostname:(root.location&&root.location.hostname)||'';}catch(_){host='';}
    host=String(host).toLowerCase().replace(/^\[|\]$/g,'');
    return host==='localhost'||/\.localhost$/.test(host)||/^127\.\d+\.\d+\.\d+$/.test(host)||host==='::1';
  }
  // XHR progress supports Authorization headers and older Chromium without ReadableStream.
  function create(options) {
    var XHR = options.XMLHttpRequest || root.XMLHttpRequest, base = options.apiBase || '/api', local=loopback(base);
    var locale=root.cncI18n||{t:function(s){return s;}}, offline=!local&&!!(root.navigator&&root.navigator.onLine===false);
    var offlineReason=locale.t('Réseau indisponible. Suivi suspendu ; aucune commande ne sera relancée automatiquement.');
    var xhr = null, generation = 0, disposed = false, available = false, retryAt = 0, healthAt = 0, lastMessage = 0, openedAt = 0;
    // Delays (retry, health, silence) on the monotonic clock: a wall clock set back (NTP at boot)
    // must not freeze the recovery. Only differences of this clock are used, also for transitMs.
    var perf = root.performance, monotonic = perf && typeof perf.now === 'function' ? function () { return perf.now(); } : Date.now;
    var token = options.token, clock = options.clock || monotonic, timer = options.timer || root;
    function close(reason, delay, rotating) {
      generation++; var old = xhr; xhr = null; lastMessage = 0;
      if (old) { old.onload = old.onerror = old.ontimeout = old.onprogress = null; old.abort(); }
      retryAt = clock() + (delay === undefined ? 30000 : delay);
      options.onDisconnect(locale.t(reason), !!rotating);
    }
    function open() {
      if (disposed || offline || xhr || !available || clock() < retryAt || !token()) return;
      var id = ++generation, cursor = 0, rotate = false, clockOffset = null, sequence = 0, epoch = '', transport = '';
      xhr = new XHR(); var request = xhr; openedAt = clock();
      // The stream carries this device's presence (F5): its control lease lives while it is open.
      request.open('GET', base+'/touch-events'+(options.clientId?'?clientId='+encodeURIComponent(options.clientId):''), true); request.timeout = 90000; // > server lifetime + confirmation grace (80 s)
      request.setRequestHeader('Authorization','Bearer '+token());
      request.onprogress = function () {
        if (id !== generation || request.status !== 200) return;
        var data = request.responseText || '', end;
        if (data.length > 1200000) { close('Flux trop volumineux.'); return; } // > server grace limit (1 MiB)
        while ((end = data.indexOf('\n', cursor)) >= 0) {
          var line = data.slice(cursor, end); cursor = end + 1;
          if (!line) continue;
          try {
            var packet = JSON.parse(line);
            if (packet&&packet.rotate === true&&Object.keys(packet).length===1&&!rotate) { rotate = true; continue; }
            if (rotate||!validSnapshot(packet,true)||packet.sequence<=sequence||
              (epoch&&(packet.epoch!==epoch||packet.transportId!==transport))) throw Error('protocol');
            sequence=packet.sequence;epoch=packet.epoch;transport=packet.transportId;
            // Conservative lower bound on clock skew: include the initial request's
            // server/network delay rather than treating buffered packets as fresh.
            if (clockOffset === null) clockOffset = openedAt - packet.sentAt;
            packet.transitMs = Math.max(0, clock() - packet.sentAt - clockOffset);
            lastMessage = clock(); options.onSnapshot(packet);
          } catch (_) { close('Réponse de suivi invalide.'); return; }
        }
      };
      request.onload = function () {
        if (id !== generation) return;
        // Session refused (CNCjs answers 403 « Forbidden Access » in plain text, or 401): the health
        // check runs again at once; its refusal asks app.js for a renewal (onRefused).
        if (request.status === 401 || request.status === 403) { available = false; healthAt = 0; close('Session CNCjs expirée.'); return; }
        request.onprogress();
        if (id !== generation) return;
        close(rotate ? 'Renouvellement du suivi…' : 'Flux interrompu. Secours toutes les 10 s.', rotate ? 0 : 30000, rotate);
        if (rotate) open();
      };
      request.onerror = request.ontimeout = function () { if (id === generation) close('Flux indisponible. Secours toutes les 10 s.'); };
      request.send();
    }
    var healthRequest = null;
    function cancelHealth(){var old=healthRequest;healthRequest=null;if(old){old.onload=old.onerror=old.ontimeout=null;old.abort();}}
    function health() {
      if (disposed || offline || healthRequest || clock() < healthAt) return;
      healthAt = clock() + 60000;
      // No session yet (first start, expired token): nothing to send, app.js renews it and reloads.
      if (!token()) { available = false; options.onStatus(locale.t('Session CNCjs requise.')); return; }
      var request = healthRequest = new XHR();
      request.open('GET',base+'/custom/health',true); request.timeout=5000;
      request.setRequestHeader('Authorization','Bearer '+token());
      function fail(message) { healthRequest=null; available=false; options.onStatus(locale.t(message)); }
      request.onload=function(){
        if(disposed||offline||healthRequest!==request)return;
        healthRequest=null;
        try {
          var result=JSON.parse(request.responseText);
          if(request.status!==200 || result.loaded!==true || result.protocol!==1) throw Error('unavailable');
          available=true; options.onStatus(''); open();
        } catch (_) {
          var refused=request.status===401||request.status===403;
          fail(refused?'Session CNCjs expirée.': 'Module de suivi absent ou incompatible. Secours toutes les 10 s ; actions bloquées si état ancien.');
          if(refused&&options.onRefused)options.onRefused();
        }
      };
      request.onerror=request.ontimeout=function(){if(!disposed&&!offline&&healthRequest===request)fail('Santé du suivi indisponible. Secours toutes les 10 s.');};
      request.send();
    }
    function tick() {
      if (disposed || offline) return;
      if (xhr && clock() - (lastMessage || openedAt) >= 3000) close('Flux muet ou tamponné. État indisponible ; secours toutes les 10 s.');
      if (!available) health(); else open();
    }
    function setOnline(value){
      if(disposed||local||offline===!value)return;
      offline=!value;available=false;cancelHealth();
      close(offline?offlineReason:locale.t('Réseau rétabli. Vérification du suivi ; nouvelle confirmation requise.'),0);
      if(!offline){healthAt=0;health();}
    }
    var interval=timer.setInterval(tick,1000); if(offline)options.onDisconnect(offlineReason);else health();
    return {alive:function(){return !offline&&!!lastMessage && clock()-lastMessage>=0&&clock()-lastMessage<3000;},
      setOnline:setOnline,
      // A request of the page was refused for its session: the health check runs again at once.
      refused:function(){if(disposed)return;available=false;healthAt=0;},
      reconnect:function(reason, immediate){
        if(disposed)return;
        close(offline?offlineReason:reason||'Connexion interrompue. Nouvelle confirmation requise.',immediate?0:30000);
        if(immediate){if(available)open();else{healthAt=0;health();}}
      },
      dispose:function(){if(disposed)return;disposed=true;timer.clearInterval(interval);close('Suivi fermé.');cancelHealth();}
    };
  }
  root.CNCJobStream = {create:create,validSnapshot:validSnapshot,loopback:loopback};
})(typeof window === 'undefined' ? globalThis : window);
