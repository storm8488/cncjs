/* Screen lock: a padlock in the page header turns the screen into read-only.
 * A transparent shield over the content (below the header) swallows every tap,
 * so nothing can be started, loaded or moved by a brush of the hand, while
 * the status strip's Pause and Stop stay reachable above it. Unlocking takes
 * two taps on the padlock within 3 s. No inert attribute is used: the screen
 * saver and the confirmation dialogs already manage it and restore it.
 * Other modules: window.cncScreenLock.lock()/unlock()/locked(), and the
 * `cnc-screen-lock` event (detail: true when locked). */
(function () {
  'use strict';
  var uiLocale=window.cncI18n||{t:function(s){return s;}};
  var t=uiLocale.t;
  var simulation=document.body.getAttribute('data-simulation')==='true';
  var banner=document.getElementById(simulation?'simulation-banner':'real-banner');
  if(!banner)return;
  var CONFIRM_MS=3000;
  function el(tag,cls,id){var n=document.createElement(tag);if(cls)n.className=cls;if(id)n.id=id;return n;}
  function text(node,value){if(node.textContent!==value)node.textContent=value;}
  function attr(node,name,value){if(node.getAttribute(name)!==value)node.setAttribute(name,value);}

  var CLOSED='M7 11V8a5 5 0 0 1 10 0v3 M5 11h14v10H5z M12 15v2',OPEN='M7 11V8a5 5 0 0 1 9.6-2 M5 11h14v10H5z M12 15v2';
  var button=el('button','t-btn t-btn--ghost t-lock','t-lock');button.type='button';
  button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+OPEN+'"/></svg>';
  var label=el('span','t-lock-label','t-lock-label');button.appendChild(label);
  var right=banner.querySelector&&banner.querySelector('.t-strip-right');
  if(right)right.insertBefore(button,right.firstChild);else banner.appendChild(button);

  var shield=el('div','t-lock-shield','t-lock-shield');shield.hidden=true;
  var notice=el('p','t-lock-notice','t-lock-notice');shield.appendChild(notice);
  document.body.appendChild(shield);

  var locked=false,armedUntil=0,armTimer=null;
  function paint(){
    var armed=locked&&armedUntil>0;
    text(label,!locked?t('Verrouiller'):armed?t('Toucher encore'):t('Verrouillé'));
    attr(button,'aria-pressed',String(locked));
    attr(button,'data-armed',String(armed));
    button.setAttribute('aria-label',!locked?t('Verrouiller l’écran'):t('Déverrouiller l’écran (deux appuis)'));
    var path=button.querySelector&&button.querySelector('path');if(path)path.setAttribute('d',locked?CLOSED:OPEN);
    if(shield.hidden!==!locked)shield.hidden=!locked;
    text(notice,armed?t('Touchez encore le cadenas pour déverrouiller.'):t('Écran verrouillé : Pause et Arrêter restent actifs. Touchez deux fois le cadenas pour déverrouiller.'));
    if(document.body.classList)document.body.classList.toggle('is-locked',locked);
  }
  function announce(){window.dispatchEvent(new CustomEvent('cnc-screen-lock',{detail:locked}));}
  function disarm(){clearTimeout(armTimer);armTimer=null;armedUntil=0;}
  function lock(){if(locked)return;locked=true;disarm();paint();announce();}
  function unlock(){if(!locked)return;locked=false;disarm();paint();announce();}
  button.addEventListener('click',function(){
    if(!locked){lock();return;}
    if(armedUntil&&Date.now()<=armedUntil){unlock();return;}
    armedUntil=Date.now()+CONFIRM_MS;clearTimeout(armTimer);
    armTimer=setTimeout(function(){armTimer=null;armedUntil=0;paint();},CONFIRM_MS);
    paint();
  });
  // A tap on the shield says why nothing happens and points at the padlock.
  shield.addEventListener('click',function(){
    attr(button,'data-flash','true');setTimeout(function(){attr(button,'data-flash','false');},600);
  });
  paint();
  window.cncScreenLock={lock:lock,unlock:unlock,locked:function(){return locked;}};
})();
