/* While a job runs: the Suivi screen opens by itself when a job starts (also a
 * job started from the PC), the screen can lock itself at that moment, and a
 * short summary is shown in Suivi when the job ends (result, duration, lines,
 * Grbl errors). Two switches in Réglages, kept in this browser. It only reads
 * the `cnc-job-status` events and navigates; it never sends a command. */
(function () {
  'use strict';
  var uiLocale=window.cncI18n||{t:function(s){return s;},locale:'fr-FR'};
  var t=uiLocale.t;
  var simulation=document.body.getAttribute('data-simulation')==='true';
  var KEY='cncjs-touch-job-follow-v1';
  var prefs={open:true,lock:false};
  try{var saved=JSON.parse(localStorage.getItem(KEY)||'null');if(saved&&typeof saved==='object'){if(typeof saved.open==='boolean')prefs.open=saved.open;if(typeof saved.lock==='boolean')prefs.lock=saved.lock;}}catch(_){}
  function save(){try{localStorage.setItem(KEY,JSON.stringify(prefs));}catch(_){}}
  function el(tag,cls,id){var n=document.createElement(tag);if(cls)n.className=cls;if(id)n.id=id;return n;}
  function text(node,value){if(node&&node.textContent!==value)node.textContent=value;}

  // ---- Réglages: two switches ----
  var settings=document.getElementById('screen-settings'),toggles={};
  if(settings){
    var card=el('div','card ks-display-card ks-job-follow-card');
    card.appendChild(el('h2','',''));card.lastChild.textContent=t('Pendant un travail');
    var help=el('p','');help.textContent=t('Ce qui se passe au démarrage d’un travail, même lancé depuis le PC.');card.appendChild(help);
    [['open',t('Ouvrir le Suivi')],['lock',t('Verrouiller l’écran')]].forEach(function(pair){
      var b=el('button','ks-display-toggle','job-follow-'+pair[0]);b.type='button';
      var span=el('span');span.textContent=pair[1];b.appendChild(span);b.appendChild(el('b'));
      b.addEventListener('click',function(){prefs[pair[0]]=!prefs[pair[0]];save();paintSettings();});
      toggles[pair[0]]=b;card.appendChild(b);
    });
    var intro=settings.querySelector&&settings.querySelector('.ks-commissioning-card');
    settings.insertBefore(card,intro&&intro.nextSibling||null);
  }
  function paintSettings(){
    Object.keys(toggles).forEach(function(k){
      var b=toggles[k],on=!!prefs[k];
      if(b.getAttribute('aria-pressed')!==String(on))b.setAttribute('aria-pressed',String(on));
      text(b.lastChild,on?t('Activé'):t('Désactivé'));
    });
  }
  paintSettings();

  // ---- End-of-job summary in Suivi ----
  var summary=el('div','t-notice home-job-summary','home-job-summary');summary.hidden=true;summary.setAttribute('role','status');
  var summaryText=el('p','home-job-summary-text','home-job-summary-text');summary.appendChild(summaryText);
  var close=el('button','t-btn t-btn--ghost','home-job-summary-close');close.type='button';close.textContent=t('OK');summary.appendChild(close);
  close.addEventListener('click',function(){summary.hidden=true;});
  var feedback=document.getElementById('home-job-feedback');
  if(feedback&&feedback.parentNode)feedback.parentNode.insertBefore(summary,feedback.nextSibling);

  function duration(ms){
    var s=Math.round(ms/1000),h=Math.floor(s/3600),m=Math.floor(s%3600/60),r=s%60;
    return h?h+' h '+(m<10?'0':'')+m+' min':m?m+' min '+(r<10?'0':'')+r+' s':r+' s';
  }
  function number(v){try{return Math.round(v).toLocaleString(uiLocale.locale||'fr-FR');}catch(_){return String(Math.round(v));}}
  // Result from the idle snapshot after the job: the server tells a program run
  // to its end from a stop, and counts the lines Grbl refused.
  function describe(job,m){
    var errors=m&&typeof m.jobErrors==='number'&&m.jobErrors>0?m.jobErrors:0;
    // A job started from the PC is not marked finished by the server: every line
    // acknowledged during the run (seen here before CNCjs rewinds its counters) says so.
    // Grbl acknowledges lines up to ~15 moves before it runs them: after an operator stop
    // (known by the server for its own jobs), all lines acknowledged is not the end.
    var allSent=job.total>0&&job.received>=job.total&&!(m&&m.jobStopped===true);
    var result=errors&&m.finishedWithErrors?'errors':m&&m.finished===true||allSent&&!errors?'done':'stopped';
    var parts=[result==='done'?t('Travail terminé'):result==='errors'?t('Fin du programme avec des erreurs Grbl'):t('Travail arrêté avant la fin')];
    if(job.name)parts.push(job.name);
    if(job.started)parts.push(t('durée ')+duration(Date.now()-job.started-job.pausedMs));
    if(job.total)parts.push(result==='done'?number(job.total)+t(' lignes'):number(job.received)+' / '+number(job.total)+t(' lignes'));
    if(errors)parts.push(errors+t(' erreur(s) Grbl')+(m.jobLastError?' ('+m.jobLastError+')':''));
    return {tone:result==='done'?'ok':result==='errors'?'danger':'warn',text:parts.join(' · ')};
  }

  // ---- Job transitions ----
  var screen='menu',job=null,last=null,pending=null;
  window.addEventListener('cnc-screen-change',function(e){screen=e&&e.detail||screen;});
  function dialogOpen(){
    return Array.prototype.some.call(document.querySelectorAll?document.querySelectorAll('[role="dialog"]'):[],function(n){return !n.hidden&&(!n.getClientRects||n.getClientRects().length);});
  }
  function active(m){return !!(m&&m.workflow&&m.workflow!=='idle');}
  function onStatus(e){
    var d=e&&e.detail||{};if(!!d.simulation!==simulation)return;
    var m=d.machine||null;
    // Another controller, or the same port reopened: what was followed does not apply
    // to it, and a job already running there is treated like one found at page load.
    if(m&&((job&&(m.port!==job.port||m.generation!==job.generation))||(pending&&(m.port!==pending.job.port||m.generation!==pending.job.generation))||(last&&(m.port!==last.port||m.generation!==last.generation)))){job=null;pending=null;last=null;}
    if(active(m)){
      if(!job){
        // A job starts (or the page loaded during one: its duration is then unknown).
        job={port:m.port,generation:m.generation,name:m.originalName||m.name||'',started:last&&!active(last)?Date.now():0,pausedMs:0,pausedAt:0,total:0,received:0};
        summary.hidden=true;pending=null;
        if(last&&!active(last)){
          if(prefs.lock&&window.cncScreenLock)window.cncScreenLock.lock();
          if(prefs.open&&screen!=='home'&&screen!=='commissioning'&&!dialogOpen()&&window.cncShell)window.cncShell.go('home');
        }
      }
      if(typeof m.total==='number'&&m.total>0)job.total=m.total;
      if(typeof m.received==='number')job.received=m.received;
      if(m.workflow==='paused'&&!job.pausedAt)job.pausedAt=Date.now();
      if(m.workflow!=='paused'&&job.pausedAt){job.pausedMs+=Date.now()-job.pausedAt;job.pausedAt=0;}
    }else if(job&&m&&m.fresh){
      // Back to rest: wait for the server's result (finished / errors) for up to 2 s.
      if(job.pausedAt){job.pausedMs+=Date.now()-job.pausedAt;job.pausedAt=0;}
      pending={job:job,until:Date.now()+2000};job=null;
    }
    if(pending&&m&&!active(m)){
      var known=m.finished===true||m.finishedWithErrors===true||m.jobStopped===true;
      if(known||Date.now()>=pending.until){
        var r=describe(pending.job,m);pending=null;
        text(summaryText,r.text);if(summary.getAttribute('data-tone')!==r.tone)summary.setAttribute('data-tone',r.tone);
        summary.hidden=false;
      }
    }
    last=m;
  }
  window.addEventListener('cnc-job-status',onStatus);
  // A new selection or load hides the previous summary.
  window.addEventListener('cnc-library-select',function(){summary.hidden=true;});
  window.cncJobFollow={prefs:function(){return {open:prefs.open,lock:prefs.lock};},describe:describe,duration:duration};
})();
