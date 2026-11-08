/* Adapted concept: cncjs-shopfloor-tablet toolpath-displayer.js (MIT).
 * A DOM marker replaces canvas patch restoration: the cached image is untouched.
 * See THIRD-PARTY-NOTICES.md for attribution. */
(function(root){
  'use strict';
  // Version 1: the stored XY image. Version 2: a fixed 3D view (preview-3d.js), an affine
  // matrix of the image; Z is then needed, unless the view ignores it (top view).
  function project(meta,point){
    if(!meta||meta.width!==960||meta.height!==540||meta.units!=='mm'||meta.wcs!=='G54')return null;
    if(!point||typeof point.x!=='number'||typeof point.y!=='number'||!isFinite(point.x)||!isFinite(point.y))return null;
    var x,y;
    if(meta.version===2){
      var m=meta.matrix,z=point.z;
      if(!Array.isArray(m)||m.length!==8||!m.every(function(v){return typeof v==='number'&&isFinite(v);}))return null;
      if(typeof z!=='number'||!isFinite(z)){if(m[2]!==0||m[6]!==0)return null;z=0;}
      x=m[0]*point.x+m[1]*point.y+m[2]*z+m[3];y=m[4]*point.x+m[5]*point.y+m[6]*z+m[7];
    }else{
      var b=meta.bounds;
      if(meta.version!==1||!Array.isArray(b)||b.length!==4||!b.every(function(v){return typeof v==='number'&&isFinite(v);})||b[2]<b[0]||b[3]<b[1])return null;
      var sx=b[2]-b[0],sy=b[3]-b[1],scale=Math.min(880/(sx||1),440/(sy||1));
      x=(960-sx*scale)/2+(point.x-b[0])*scale;y=540-(540-sy*scale)/2-(point.y-b[1])*scale;
    }
    return x<0||x>960||y<0||y>540?null:{x:x/960,y:y/540};
  }
  // Number of trail samples ([sentLine, x, y, ...]) whose sent-line count is within `acknowledged`.
  function trailCount(samples,acknowledged){
    var lo=0,hi=samples.length/3;
    while(lo<hi){var mid=(lo+hi)>>1;if(samples[mid*3]<=acknowledged)lo=mid+1;else hi=mid;}
    return lo;
  }
  // Trail lines acknowledged so far. CNCjs rewinds its counters when a program
  // ends: a program run to its end (even with Grbl errors) shows its whole path.
  function acknowledged(s,totalLines){
    if((s.finished===true||s.finishedWithErrors===true)&&s.workflow==='idle')return totalLines;
    // A resume from a line runs a preamble, then the file from that line: the lines before it
    // count as done, the preamble's do not (lines in the sender's numbering, like the trail).
    var r=s.resume;
    if(r&&typeof r.from==='number'&&typeof r.preambleLength==='number')return Math.min(totalLines,Math.max(0,r.from-1+Math.max(0,s.received-r.preambleLength)));
    return Math.min(totalLines,Math.max(0,s.received/s.total*totalLines));
  }
  if(typeof module!=='undefined'&&module.exports){module.exports={project:project,trailCount:trailCount,acknowledged:acknowledged};return;}
  // Same functions in the page (PERFORMANCE-UI-SPEC.md 8.4): one rule for the acknowledged lines, read by the live 3D view and the gauges.
  root.CNCToolPosition={project:project,trailCount:trailCount,acknowledged:acknowledged};
  var img=document.getElementById('home-job-image');if(!img)return;
  var marker=document.createElement('span');marker.className='tool-position-marker';marker.hidden=true;marker.setAttribute('aria-hidden','true');img.parentNode.appendChild(marker);
  // Progress trail: the acknowledged part of the toolpath, drawn from the
  // samples stored with the preview, as one polyline over the image.
  var SVG='http://www.w3.org/2000/svg',trail=document.createElementNS(SVG,'svg'),trailLine=document.createElementNS(SVG,'polyline');
  trail.setAttribute('class','toolpath-progress');trail.setAttribute('viewBox','0 0 960 540');trail.setAttribute('aria-hidden','true');trail.setAttribute('preserveAspectRatio','none');
  trail.appendChild(trailLine);trail.hidden=true;img.parentNode.appendChild(trail);
  var drawnTrail={source:null,points:-1};
  // The note explains the marker: it sits right under the preview (UI 2027), not among the actions.
  var note=document.createElement('p');note.className='tool-position-note';note.id='tool-position-note';
  if(img.parentNode&&typeof img.parentNode.insertAdjacentElement==='function')img.parentNode.insertAdjacentElement('afterend',note);else document.getElementById('home-job-note').insertAdjacentElement('afterend',note);
  var t=(root.cncI18n&&root.cncI18n.t)||function(s){return s;};
  var state=null,simulation=false,received=0,receivedMono=null,frame=null,expiry=null,disposed=false,v2Seen=false;
  function v2(){if(root.cncV2&&typeof root.cncV2.gate==='function'&&root.cncV2.gate())v2Seen=true;return v2Seen;}
  function mono(){return root.performance&&typeof root.performance.now==='function'?root.performance.now():null;}
  function reportAge(){
    var age=state&&state.statusAgeMs,n=mono();
    if(typeof age!=='number'||!isFinite(age)||age<0||receivedMono===null||typeof n!=='number'||!isFinite(n)||n<receivedMono)return null;
    return age+n-receivedMono;
  }
  function sameContent(meta,s){
    var a=meta&&meta.fingerprint,b=s&&s.fingerprint;
    return typeof a==='string'&&!!a&&typeof b==='string'&&!!b&&a.toLowerCase().replace(/^sha256:/,'')===b.toLowerCase().replace(/^sha256:/,'');
  }
  // The image box is read at most once a second (and at once after a screen change, a resize
  // or a new image): reading it forces a layout of the screen, and reports come 4 times a
  // second during a job. The marker then moves with a transform, which needs no layout.
  var box=null,boxAt=-Infinity;
  function invalidate(){box=null;}
  function hide(message){marker.hidden=true;trail.hidden=true;if(note.textContent!==message)note.textContent=message;}
  // projection: the shown image's (2D, or the chosen 3D view); a 3D view also needs the Z of each sample.
  function drawTrail(meta,s,box,projection){
    var samples=meta.trail,depth=projection.version===2?meta.trailZ:null;
    if(!Array.isArray(samples)||samples.length<6||typeof s.total!=='number'||!(s.total>0)||typeof s.received!=='number'||!(s.received>=0)||
      projection.version===2&&(!Array.isArray(depth)||depth.length*3!==samples.length)){trail.hidden=true;return;}
    // Simulation counts percent, real jobs count sender lines; both scale onto the trail's line count.
    // A finished program shows its whole path: CNCjs rewinds the line counters at the end.
    var totalLines=samples[samples.length-3];
    var n=trailCount(samples,acknowledged(s,totalLines));
    if(drawnTrail.source!==samples||drawnTrail.points!==n||drawnTrail.projection!==projection){
      var points=[];
      for(var i=0;i<n;i++){var p=project(projection,{x:samples[i*3+1],y:samples[i*3+2],z:depth?depth[i]:undefined});if(p)points.push((p.x*960).toFixed(1)+','+(p.y*540).toFixed(1));}
      trailLine.setAttribute('points',points.join(' '));drawnTrail={source:samples,points:n,projection:projection};
    }
    var ratio=Math.min(box.width/960,box.height/540),width=960*ratio,height=540*ratio;
    trail.style.left=(box.left+(box.width-width)/2)+'px';trail.style.top=(box.top+(box.height-height)/2)+'px';
    trail.style.width=width+'px';trail.style.height=height+'px';
    trail.hidden=n<2;
  }
  function paint(){
    frame=null;if(disposed)return;
    var screen=document.getElementById('screen-home');
    if(document.hidden||!screen.classList.contains('active')){hide('');return;}
    var meta=img.cncPreview,s=state;
    // The live 3D view (preview-gl.js under the GPU gate) draws its own marker and progress: the DOM
    // marker and the trail stay hidden, and during a job or a pause the note describes the live view.
    var lv=img.cncLiveView,ls=null;
    try{ls=lv&&typeof lv.state==='function'?lv.state():null;}catch(_){ls=null;}
    if(ls&&(ls.closed||!ls.gpu||!ls.live))ls=null;
    if(ls){var text=liveNote(ls);if(text!==null){marker.hidden=true;trail.hidden=true;if(note.textContent!==text)note.textContent=text;return;}}
    var ageV2=v2()&&!simulation?reportAge():null;
    if(!s||!s.fresh||(v2()&&!simulation?ageV2===null||ageV2>2500||!sameContent(meta,s):Date.now()-received>2500)||img.hidden||!meta||!s.name||meta.file!==s.name){hide(t('Position outil : données ou aperçu indisponibles.'));return;}
    if(!meta.projection){hide(t('Position outil : régénérez cet ancien aperçu dans Fichiers.'));return;}
    // The chosen 3D view, when it is the image shown; otherwise the stored 2D image.
    var view=img.cncView&&img.cncView.src===img.getAttribute('src')?img.cncView:null,projection=view?view.projection:meta.projection;
    // Layout reads are batched in one animation frame, only on the visible view.
    if(!box||Date.now()-boxAt>=1000||Date.now()<boxAt){
      var r=img.getBoundingClientRect(),parent=img.parentNode.getBoundingClientRect();
      // viewport-fit may scale the screen with a CSS transform: rects are screen pixels,
      // left/top/width styles are layout pixels, so divide by the current scale.
      var k=img.offsetWidth>0?r.width/img.offsetWidth:1;if(!(k>0))k=1;
      box={left:(r.left-parent.left)/k,top:(r.top-parent.top)/k,width:r.width/k,height:r.height/k};boxAt=Date.now();
    }
    var ratio=Math.min(box.width/960,box.height/540),width=960*ratio,height=540*ratio;
    if(!width||!height){hide('');return;}
    // The trail only needs the acknowledged lines and the preview, not the tool
    // position: it stays visible when the position cannot be projected.
    drawTrail(meta,s,box,projection);
    if(ls)trail.hidden=true;
    // Three things, never mixed up: the planned path (the preview), the lines Grbl acknowledged
    // ("acquittées": accepted into its buffer, not necessarily cut yet) and the reported position.
    var trailLabel=trail.hidden?'':simulation?t(' Tracé orange : avancement fictif.'):t(' Tracé orange : lignes acquittées par Grbl (acceptées, pas forcément usinées), indicatif.');
    function noMarker(message){marker.hidden=true;var text=message+trailLabel;if(note.textContent!==text)note.textContent=text;}
    // In an alarm Grbl may have lost the position: no blue point, the note says so (display only).
    if(!simulation&&/^alarm/i.test(String(s.activeState||''))){noMarker(t('Alarme : position non garantie.'));return;}
    var point;
    if(simulation){
      if(s.wcs!=='G54'){noMarker(t('Position fictive : aperçu limité au repère G54.'));return;}
      point=s.workPosition;
    }else{
      if(!s.operator||s.operator.reportUnits!=='mm'||s.operator.wcs!=='G54'){noMarker(t('Position outil : repère G54 et rapports en mm requis.'));return;}
      var w=s.coordinates&&s.coordinates.wpos;
      if(!w||w.x===undefined||w.y===undefined){noMarker(t('Position outil inconnue.'));return;}
      point={x:typeof w.x==='string'&&w.x.trim()!==''?Number(w.x):w.x,y:typeof w.y==='string'&&w.y.trim()!==''?Number(w.y):w.y,z:typeof w.z==='string'&&w.z.trim()!==''?Number(w.z):w.z};
    }
    var pixel=project(projection,point);
    if(!pixel){noMarker(t('Position outil hors aperçu ou projection invalide.'));return;}
    var left=(box.left+(box.width-width)/2)+'px',top=(box.top+(box.height-height)/2)+'px',move='translate('+(pixel.x*width)+'px,'+(pixel.y*height)+'px) translate(-50%,-50%)';
    if(marker.style.left!==left)marker.style.left=left;if(marker.style.top!==top)marker.style.top=top;
    if(marker.style.transform!==move)marker.style.transform=move;marker.hidden=!!ls;
    // Age of the reported position: the server's age of the status report plus its time in transit here.
    var age=v2()&&!simulation?ageV2:(typeof s.statusAgeMs==='number'&&isFinite(s.statusAgeMs)&&s.statusAgeMs>=0?s.statusAgeMs:0)+Math.max(0,Date.now()-received);
    // In whole seconds: a tenth would rewrite the note (and lay Suivi out) at every report.
    var ageText=age<1000?t('moins d’une seconde'):Math.floor(age/1000)+' s';
    var label=(simulation?t('Point bleu : position fictive G54. Le travail simulé ne déplace pas ce point.'):t('Image : parcours prévu.')+' '+t('Point bleu : position de travail rapportée par Grbl il y a ')+ageText+t(', G54 · projection indicative.'))+trailLabel;
    if(note.textContent!==label)note.textContent=label;
  }
  // Note of the live 3D view during a job or a pause (PERFORMANCE-UI-SPEC.md 3.6), or null at rest
  // (the note above is kept). One sentence per state, whole seconds: rewritten only when it changes.
  function seconds(ms){return ms<1000?t('moins d’une seconde'):Math.floor(ms/1000)+' s';}
  function liveNote(ls){
    var v=ls.live,m=v.marker;
    if(v.workflow!=='running'&&v.workflow!=='paused')return null;
    var text;
    if(v.simulation)text=t('Tracé orange : avancement fictif.')+' '+t('Point bleu : position fictive G54. Le travail simulé ne déplace pas ce point.');
    else if(m.shown&&m.alarm)text=t('Alarme : position non garantie. Repère et avancement figés.');
    else if(m.shown&&m.stale)text=t('Position périmée : dernier rapport il y a ')+Math.floor((m.ageMs||0)/1000)+t(' s. Repère et avancement figés.');
    else{
      var head=t('Parcours prévu · orange : lignes acquittées par Grbl (acceptées, pas forcément usinées) · blanc : passe en cours');
      if(!m.shown)text=head+'. '+(v.reason||t('Position outil inconnue.'));
      else text=head+t(' · repère : position de travail rapportée par Grbl il y a ')+seconds(m.ageMs||0)+(v.workflow==='paused'?t(', G54.'):m.snapped?t(', G54, interpolée entre deux rapports.'):t(', G54 (hors du parcours dessiné : non interpolée).'));
    }
    if(ls.geometry==='simplified')text+=' '+(ls.geometryReason==='too-long'?t('Géométrie simplifiée : programme trop long pour la géométrie complète (')+ls.geometryTotal+t(' segments).'):t('Géométrie simplifiée (')+(ls.segments+1)+t(' points).'));
    return text;
  }
  function schedule(){
    if(disposed)return;
    if(document.hidden||!document.getElementById('screen-home').classList.contains('active')){if(!marker.hidden)marker.hidden=true;return;}
    if(frame===null)frame=requestAnimationFrame(paint);
  }
  function expire(){
    clearTimeout(expiry);expiry=null;if(disposed||document.hidden||!document.getElementById('screen-home').classList.contains('active'))return;
    if(v2()&&!simulation){var age=reportAge();if(age!==null&&age<=2500)expiry=setTimeout(schedule,2501-age);}
    else expiry=setTimeout(schedule,2600);
  }
  root.addEventListener('cnc-job-status',function(e){if(disposed)return;state=e.detail.machine;simulation=!!e.detail.simulation;received=Date.now();receivedMono=mono();schedule();expire();});
  root.addEventListener('cnc-screen-change',function(){invalidate();schedule();expire();});
  root.addEventListener('resize',function(){invalidate();schedule();});img.addEventListener('load',function(){invalidate();schedule();});
  document.addEventListener('visibilitychange',function(){schedule();expire();});
  root.addEventListener('pagehide',function(e){if(e.persisted&&!v2())return;disposed=true;if(frame!==null)cancelAnimationFrame(frame);frame=null;clearTimeout(expiry);expiry=null;state=null;drawnTrail={source:null,points:-1};});
  schedule();
})(typeof window==='undefined'?globalThis:window);
