(function () {
  'use strict';
  // This blocking script runs before the deferred i18n catalogue and the body.
  // Keep these five rows identical to i18n-messages.js (test-startup.cjs).
  var TEXT=[
    ['Chargement de l’interface…','Loading interface…','Cargando interfaz…'],
    ['Réessayer','Retry','Reintentar'],
    ['JavaScript doit être activé pour utiliser l’interface.','JavaScript must be enabled to use the interface.','JavaScript debe estar activado para usar la interfaz.'],
    ['Chargement incomplet. Vérifiez la connexion puis réessayez.','Loading incomplete. Check the connection and try again.','Carga incompleta. Compruebe la conexión y reintente.'],
    ['Le chargement prend plus de temps que prévu. Vous pouvez patienter ou réessayer.','Loading is taking longer than expected. You can wait or try again.','La carga tarda más de lo previsto. Puede esperar o reintentar.']
  ];
  var language=0;
  try{var saved=localStorage.getItem('cncjs-touch-language-v1');if(saved==='en')language=1;else if(saved==='es')language=2;}catch(_){/* French is the fallback when storage is unavailable. */}
  var current=TEXT[0][language];
  var finished=false,failed=false,timer;
  function message(text) {
    current=text;
    var node=document.getElementById('cnc-boot-message');
    if(node)node.textContent=text;
  }
  function bootText(){
    message(current);
    var retry=document.getElementById('cnc-boot-retry'),noscript=document.getElementById('cnc-boot-noscript');
    if(retry)retry.textContent=TEXT[1][language];
    if(noscript)noscript.textContent=TEXT[2][language];
  }
  bootText();document.addEventListener('DOMContentLoaded',bootText);
  function fail() {
    if(finished)return;
    failed=true;clearTimeout(timer);
    message(TEXT[3][language]);
    // A module failed, but the status strip may be built and wired (each module runs on its
    // own, also in the bundle): it stays shown and usable above the message, so Pause and
    // Arrêter of a job in progress remain at hand (index.html, html.cnc-degraded).
    var root=document.documentElement;
    if(root&&root.classList&&typeof root.classList.add==='function')root.classList.add('cnc-degraded');
  }
  function error(event) {
    var target=event.target;
    if(target&&/^(SCRIPT|LINK)$/.test(target.tagName)||event.message)fail();
  }
  window.addEventListener('error',error,true);
  timer=setTimeout(function(){message(TEXT[4][language]);},15000);
  window.cncStartup={ready:function(){
    if(failed||finished)return;
    // A fit may need several frames; reveal only once its measurements settle.
    function reveal(){
      if(failed||finished)return;
      // Any active screen: the job follow-up may already have opened Suivi (a job started from the PC).
      if(!document.body.classList.contains('ks-ui')||!document.querySelector('main .screen.active')){fail();return;}
      finished=true;clearTimeout(timer);window.removeEventListener('error',error,true);
      document.documentElement.classList.remove('cnc-loading');
      var boot=document.getElementById('cnc-boot');if(boot)boot.hidden=true;
    }
    if(window.cncViewportFit)window.cncViewportFit.whenReady(reveal);
    else requestAnimationFrame(reveal);
  }};
})();
