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
    card.appendChild(el('h2','',''));card.lastChild.textContent=t('Pendant un travail')+' ';
    var scope=el('span','ks-scope');scope.setAttribute('data-scope','tablet');scope.textContent=t('Cette tablette');card.lastChild.appendChild(scope);
    var help=el('p','');help.textContent=t('Ce qui se passe au démarrage d’un travail, même lancé depuis le PC.');card.appendChild(help);
    [['open',t('Ouvrir le Suivi')],['lock',t('Verrouiller l’écran')]].forEach(function(pair){
      var b=el('button','ks-display-toggle','job-follow-'+pair[0]);b.type='button';
      var span=el('span');span.textContent=pair[1];b.appendChild(span);b.appendChild(el('b'));
      b.addEventListener('click',function(){prefs[pair[0]]=!prefs[pair[0]];save();paintSettings();});
      toggles[pair[0]]=b;card.appendChild(b);
    });
    // Right after the screen sleep card (Affichage tab), the same place in index and simulation.
    var sleep=settings.querySelector&&settings.querySelector('.ks-display-sleep');
    settings.insertBefore(card,sleep&&sleep.nextSibling||null);
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
  // Presentation only (performance-v2.css data-v2-summary): the v2 messages slot knows when the summary is shown.
  function showSummary(on){
    summary.hidden=!on;
    var left=document.getElementById('home-left'),board=left&&left.parentNode,v=on?'1':'0';
    if(board&&typeof board.setAttribute==='function'&&(!board.getAttribute||board.getAttribute('data-v2-summary')!==v))board.setAttribute('data-v2-summary',v);
  }
  var summaryText=el('p','home-job-summary-text','home-job-summary-text');summary.appendChild(summaryText);
  var close=el('button','t-btn t-btn--ghost','home-job-summary-close');close.type='button';close.textContent=t('OK');summary.appendChild(close);
  close.addEventListener('click',function(){showSummary(false);});
  var feedback=document.getElementById('home-job-feedback');
  if(feedback&&feedback.parentNode)feedback.parentNode.insertBefore(summary,feedback.nextSibling);

  function duration(ms){
    var s=Math.round(ms/1000),h=Math.floor(s/3600),m=Math.floor(s%3600/60),r=s%60;
    return h?h+' h '+(m<10?'0':'')+m+' min':m?m+' min '+(r<10?'0':'')+r+' s':r+' s';
  }
  function number(v){try{return Math.round(v).toLocaleString(uiLocale.locale||'fr-FR');}catch(_){return String(Math.round(v));}}
  // The gauge's scale (job-dashboard.js linesTotal): Suivi's preview of this file, else a resume's file total.
  function fileLines(m){
    var img=document.getElementById('home-job-image'),pv=img&&img.cncPreview,r=m.resume;
    if(pv&&pv.file===m.name&&typeof pv.lines==='number'&&isFinite(pv.lines)&&pv.lines>0)return pv.lines;
    return r&&typeof r.from==='number'&&typeof r.total==='number'&&r.total>0?r.total:0;
  }
  // The gauge's acknowledged line (tool-position.js acknowledged): a resume counts the lines before it as done.
  function gaugeLine(m,lines){
    var tp=window.CNCToolPosition;if(tp&&typeof tp.acknowledged==='function')return tp.acknowledged(m,lines);
    var r=m.resume;
    if(r&&typeof r.from==='number'&&typeof r.preambleLength==='number')return Math.min(lines,Math.max(0,r.from-1+Math.max(0,m.received-r.preambleLength)));
    return Math.min(lines,Math.max(0,m.received/m.total*lines));
  }
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
    // Lines of the file when known (the Suivi gauge's own count), else CNCjs's count.
    var total=job.lines||job.total,received=job.lines?job.line:job.received;
    if(job.total)parts.push(result==='done'?number(total)+t(' lignes'):number(received)+' / '+number(total)+t(' lignes'));
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
        showSummary(false);pending=null;
        if(last&&!active(last)){
          if(prefs.lock&&window.cncScreenLock)window.cncScreenLock.lock();
          if(prefs.open&&screen!=='home'&&screen!=='commissioning'&&!dialogOpen()&&window.cncShell)window.cncShell.go('home');
        }
      }
      if(typeof m.total==='number'&&m.total>0)job.total=m.total;
      if(typeof m.received==='number')job.received=m.received;
      // The line the Suivi gauge shows (job-dashboard.js linesTotal / acknowledgedLine), kept while the job
      // runs: the summary says what the gauge said (« 6 / 7 », not CNCjs's « 7 / 8 »; a resume counts in the file).
      var lines=fileLines(m);if(lines&&m.total>0){job.lines=lines;job.line=Math.floor(gaugeLine(m,lines));}
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
        showSummary(true);
      }
    }
    last=m;
  }
  window.addEventListener('cnc-job-status',onStatus);
  // A new selection or load hides the previous summary.
  window.addEventListener('cnc-library-select',function(){showSummary(false);});
  window.cncJobFollow={prefs:function(){return {open:prefs.open,lock:prefs.lock};},describe:describe,duration:duration};
})();
