#!/usr/bin/env node
'use strict';
/* L1 tablet measurement, no connection and no generated gestures.
 * node measure-v2-inspect.cjs --seconds 60 --scenario replay --candidate <revision> > /tmp/measure-l1.js
 * Paste the emitted JavaScript into DevTools of the visible /touch-next/ page, with
 * a scene already open. Use Examiner with finger then pen. After completion:
 * copy(JSON.stringify(window.cncV2InspectMeasurement,null,2)) saves the report.
 * Repeat with 160000 and 500000 SEGMENTS (not lines), overlaps/arcs/shallow depths;
 * full/reduced, 20 open/close cycles, then --seconds 1800 for thermal endurance.
 * Use an explicitly simulated replay, never start a machine from this script.
 * It observes pagehide/hidden/screen/lock/gate closure and releases its resources.
 * Repeat same file/gestures for the reference. Record CPU Chromium AND CNCjs,
 * process RSS/PSS and temperature separately: heap and frame gaps are not CPU/GPU
 * utilization. Pointer-to-next-RAF is a scheduling proxy, not physical touch latency.
 * Use inspect.diagnose() separately at rest for the measured render budget; this
 * script itself neither changes quality nor requests geometry nor invokes paint().
 */
function capture(options) {
  'use strict';
  options=options||{};
  var seconds=Number(options.seconds||60), api=window.cncV2;
  if(!(seconds>=1&&seconds<=1800))return Promise.reject(new Error('Durée entre 1 et 1800 secondes requise.'));
  var inspector=api&&api.use&&api.use('inspect'),view=window.CNCPreviewGL&&window.CNCPreviewGL.view();
  if(!api||!api.gate()||!inspector||inspector.stub||!view||document.hidden)return Promise.reject(new Error('Ouvrez une scène Performance v2 visible.'));
  var canvas=view.canvas,start=performance.now(),frame=0,timer=0,observer=null,ended=false,last=null,frameCount=0,reports=0;
  var gaps=[],ages=[],statusDelays=[],touch=[],pen=[],mouse=[],longTasks=[],pendingPointers=[],pendingReports=[],listeners=[],samplesDropped=0;
  var maxSamples=120000,rect=canvas.getBoundingClientRect();
  function push(a,n){if(typeof n==='number'&&isFinite(n)&&n>=0){if(a.length<maxSamples)a.push(n);else samplesDropped++;}}
  function quantiles(a){var s=a.slice().sort(function(a,b){return a-b;});function at(q){return s.length?s[Math.min(s.length-1,Math.floor(s.length*q))]:null;}return {n:s.length,p50:at(.5),p95:at(.95),p99:at(.99),max:s.length?s[s.length-1]:null,over50:s.filter(function(n){return n>50;}).length};}
  function heap(){return performance.memory?performance.memory.usedJSHeapSize:null;}
  var before={view:view.state(),stats:view.stats(),inspect:inspector.diagnostics?inspector.diagnostics():null,heapBytes:heap()};
  var environment={userAgent:navigator.userAgent,css:[innerWidth,innerHeight],dpr:devicePixelRatio,canvas:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},gpu:window.cncGpu?window.cncGpu.state():null};
  return new Promise(function(resolve,reject){
    function on(target,name,fn,capture){target.addEventListener(name,fn,capture);listeners.push([target,name,fn,capture]);}
    function finish(reason,error){
      if(ended)return;ended=true;
      if(frame)cancelAnimationFrame(frame);clearTimeout(timer);
      if(observer){var tail=observer.takeRecords?observer.takeRecords():[];tail.forEach(function(e){push(longTasks,e.duration);});observer.disconnect();}
      listeners.forEach(function(l){l[0].removeEventListener(l[1],l[2],l[3]);});listeners=[];
      if(error){reject(error);return;}
      resolve({version:1,candidate:options.candidate||null,scenario:options.scenario||'unspecified',civil:new Date().toISOString(),seconds:(performance.now()-start)/1000,endReason:reason,environment:environment,
        before:before,after:{view:view.state(),stats:view.stats(),inspect:inspector.diagnostics?inspector.diagnostics():null,heapBytes:heap()},frames:frameCount,reports:reports,
        frameIntervalsMs:quantiles(gaps),pointerToFrameMs:{touch:quantiles(touch),pen:quantiles(pen),mouse:quantiles(mouse)},statusToFrameMs:quantiles(statusDelays),reportAgeMs:quantiles(ages),
        longTasks:{available:!!observer,durationsMs:quantiles(longTasks)},samplesDropped:samplesDropped,
        limits:['Pointer and status delays end at the next RAF, not physical presentation.','Long tasks cover the whole page, not only inspection.','JS heap excludes native/GPU/process memory.','CPU, RSS/PSS and temperature require external sampling.']});
    }
    function tick(now){
      frame=0;if(ended)return;
      try{
        if(document.hidden){finish('hidden');return;}
        if(!api.gate()){finish('gate-closed');return;}
        if(view.state().closed){finish('view-closed');return;}
        if(last!==null)push(gaps,now-last);last=now;frameCount++;
        pendingPointers.forEach(function(p){push(p.kind==='pen'?pen:p.kind==='touch'?touch:mouse,now-p.at);});pendingPointers=[];
        pendingReports.forEach(function(at){push(statusDelays,now-at);});pendingReports=[];
        if(now-start>=seconds*1000){finish('complete');return;}
        frame=requestAnimationFrame(tick);
      }catch(e){finish('error',e);}
    }
    try{
      // Capture before the renderer's existing bubble listener, so pick() is timed too.
      on(canvas,'pointerup',function(e){if(pendingPointers.length<32)pendingPointers.push({kind:e.pointerType,at:performance.now()});else samplesDropped++;},true);
      on(canvas,'pointercancel',function(){pendingPointers=[];});
      on(window,'cnc-job-status',function(e){reports++;if(pendingReports.length<32)pendingReports.push(performance.now());var m=e.detail&&e.detail.machine;if(m)push(ages,m.statusAgeMs);},true);
      on(window,'pagehide',function(){finish('pagehide');});
      on(window,'cnc-screen-change',function(){finish('screen-change');});
      on(window,'cnc-screen-lock',function(e){if(e.detail)finish('lock');});
      on(window,'cnc-v2-change',function(){if(!api.gate())finish('gate-closed');});
      on(document,'visibilitychange',function(){if(document.hidden)finish('hidden');});
      if(typeof PerformanceObserver==='function'){
        try{observer=new PerformanceObserver(function(list){list.getEntries().forEach(function(e){push(longTasks,e.duration);});});observer.observe({entryTypes:['longtask']});}
        catch(_){if(observer)observer.disconnect();observer=null;}
      }
      timer=setTimeout(function(){finish('complete');},seconds*1000+250);frame=requestAnimationFrame(tick);
    }catch(e){finish('error',e);}
  });
}
function parseArgs(args){
  const options={seconds:60,scenario:'unspecified',candidate:null};
  for(let i=0;i<args.length;i++){
    const key=args[i];if(key==='--help'){options.help=true;continue;}
    if(!['--seconds','--scenario','--candidate'].includes(key))throw Error('Argument inconnu : '+key);
    const value=args[++i];if(!value||value.startsWith('--'))throw Error('Valeur manquante : '+key);
    options[key.slice(2)]=key==='--seconds'?Number(value):value;
  }
  if(!Number.isFinite(options.seconds)||options.seconds<1||options.seconds>1800)throw Error('--seconds : 1 à 1800');
  return options;
}
function script(options){return '('+capture.toString()+')('+JSON.stringify(options)+').then(function(result){window.cncV2InspectMeasurement=result;console.log(JSON.stringify(result,null,2));return result;});\n';}
module.exports={capture,parseArgs,script};
if(require.main===module){
  try{const options=parseArgs(process.argv.slice(2));process.stdout.write(options.help?'Usage : node measure-v2-inspect.cjs [--seconds 60] [--scenario replay] [--candidate revision]\nÉmet du JavaScript à coller dans DevTools, scène v2 visible. Aucun réseau ni geste automatique.\n':script(options));}
  catch(e){console.error(e.message);process.exitCode=2;}
}
