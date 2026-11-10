const fs=require('fs'),vm=require('vm'),assert=require('assert');
let now=10000;const listeners={},requests=[];
const {document,node:el,activeScreens,stats}=require('./dom-fixture.cjs').createDOM(['home']);
const context={document,window:{CNCGrblHelp:require('./touch/grbl-help'),cncLibrarySelection:{file:'b.nc',name:'b.nc'},addEventListener:(n,f)=>listeners[n]=f},Date:{now:()=>now},localStorage:{getItem:()=>JSON.stringify({state:{session:{token:'fake'}}})},XMLHttpRequest:function(){this.open=(m,p)=>{assert.equal(m,'POST');assert.equal(p,'/api/watch/file');};this.setRequestHeader=()=>{};this.abort=()=>{this.aborted=true;};this.send=body=>requests.push({xhr:this,file:JSON.parse(body).file});}};
vm.runInNewContext(fs.readFileSync(__dirname+'/touch/job-dashboard.js','utf8'),context);
assert.equal(requests.length,1);assert.equal(requests[0].file,'b.nc.cnctouch.json'); // Late subscriber gets initial preview.
const select=file=>listeners['cnc-library-select']({detail:{file,name:file}});
const status=(machine,simulation=true)=>listeners['cnc-job-status']({detail:{machine,simulation}});
const c={port:'SIMULATION',name:'a.nc',originalName:'A',revision:1,fresh:true,total:100,received:25,workflow:'running',remainingSeconds:45};
select('b.nc');status(c);assert.equal(requests.at(-1).file,'a.nc.cnctouch.json');
select('c.nc');assert.equal(requests.length,2);assert.equal(el('home-job-percent').textContent,'25 %');assert.match(el('home-job-eta').textContent,/45 s/);
const old=requests[0].xhr;old.status=200;old.responseText=JSON.stringify({data:JSON.stringify({file:'b.nc',preview:{image:'data:image/png;base64,AAAA'}})});old.onload();assert.equal(el('home-job-image').src,undefined);
const current=requests[1].xhr;current.status=200;current.responseText=JSON.stringify({data:JSON.stringify({file:'a.nc',preview:{image:'data:image/png;base64,AAAA'}})});current.onload();el('home-job-image').onload();assert.equal(el('home-job-image').hidden,false);
now+=10000;status({...c,workflow:'paused'});assert.match(el('home-job-eta').textContent,/En pause.*45 s/);
status({...c,received:100,remainingSeconds:0,workflow:'idle'});assert.equal(el('home-job-percent').textContent,'100 %');assert.match(el('home-job-eta').textContent,/Terminé/);
status({...c,workflow:'idle',canStart:false});assert.match(el('home-job-eta').textContent,/arrêté/);
// Real CNCjs rewinds the counters at the end of a program: the server's finished flag says it ended.
status({...c,received:0,remainingSeconds:undefined,workflow:'idle',canStart:false,finished:true},false);assert.equal(el('home-job-percent').textContent,'100 %');assert.match(el('home-job-eta').textContent,/Terminé — programme exécuté/);
status({...c,received:0,workflow:'idle',canStart:false,finished:false},false);assert.match(el('home-job-eta').textContent,/arrêté/);
// Real controller in alarm: the alarm is explained in plain words.
status({...c,activeState:'Alarm',alarmCode:9,workflow:'idle',canStart:false},false);assert.match(el('home-job-ready').textContent,/^Alarme 9 : Prise d’origine : capteur non trouvé\. .*\$23/);
status({...c,activeState:'Alarm',alarmCode:null,workflow:'idle',canStart:false},false);assert.match(el('home-job-ready').textContent,/^Alarme\. Code non reçu/);
// The simulation keeps its own alarm wording.
status({...c,activeState:'Alarm',workflow:'idle',canStart:false,loadReason:'Alarme simulée : voir l’onglet Machine.'},true);assert.equal(el('home-job-ready').textContent,'Alarme simulée : voir l’onglet Machine.');
// A job ended with Grbl errors names the last one.
status({...c,activeState:'Idle',received:0,workflow:'idle',canStart:false,canLoad:true,finished:false,finishedWithErrors:true,jobErrors:1,jobLastError:24},false);
assert.match(el('home-job-ready').textContent,/^Dernière erreur : Erreur 24 : Deux commandes de mouvement/);
// CNCjs waiting for replies while Grbl idles: the operator is told, with the duration.
status({...c,activeState:'Idle',workflow:'running',stalledMs:42000},false);assert.match(el('home-job-ready').textContent,/^Travail bloqué \? Grbl est au repos depuis 42 s/);
status({...c,activeState:'Run',workflow:'running',stalledMs:null},false);assert.equal(el('home-job-ready').textContent,'Travail en cours.');
// Rehearsal (UI-5, N2): a start refused for another reason than a reload says so; an old report is not a lost connection.
select('a.nc');
status({...c,activeState:'Idle',received:0,workflow:'idle',canStart:false,canLoad:true,startReason:'Broche en marche : arrêtez-la (M5) avant de démarrer.'},false);
assert.equal(el('home-job-ready').textContent,'Broche en marche : arrêtez-la (M5) avant de démarrer.');
status({...c,activeState:'Idle',received:0,workflow:'idle',canStart:false,canLoad:true,startReason:'Rechargez le fichier avant un nouveau démarrage.'},false);
assert.equal(el('home-job-ready').textContent,'Rechargez le fichier pour un nouveau départ.');
status({...c,activeState:'Idle',workflow:'idle',fresh:false},false);assert.equal(el('home-job-ready').textContent,'État machine trop ancien : attendre un rapport récent.');
status(null);assert.equal(el('home-job-ready').textContent,'État indisponible : attendre la connexion.');
select('c.nc');
// A program that reached its end with lines refused by Grbl is never shown as finished.
status({...c,received:0,workflow:'idle',canStart:false,finished:false,finishedWithErrors:true,jobErrors:2},false);assert.equal(el('home-job-percent').textContent,'100 %');assert.doesNotMatch(el('home-job-eta').textContent,/Terminé/);assert.match(el('home-job-eta').textContent,/2 erreur/);
status(null);assert.equal(el('home-job-percent').textContent,'—');assert.match(el('home-job-eta').textContent,/indisponible/);
// Overrides block: hidden for snapshots without the field, values and gating otherwise.
assert.equal(el('home-overrides').hidden,true);
status({...c,canOverride:true,overrides:{feed:90,rapid:100,spindle:110}});
assert.equal(el('home-overrides').hidden,false);assert.equal(el('home-override-feed').textContent,'90 %');assert.equal(el('home-override-spindle').textContent,'110 %');assert.match(el('home-override-note').textContent,/temps réel/);
status({...c,workflow:'idle',canOverride:false,overrideReason:'Les corrections s’appliquent pendant un travail en cours ou en pause.',overrides:null});
assert.equal(el('home-override-feed').textContent,'—');assert.match(el('home-override-note').textContent,/en cours ou en pause/);
status({...c,canOverride:true,overrides:{feed:'x',rapid:100,spindle:Infinity}});assert.equal(el('home-override-feed').textContent,'—');assert.equal(el('home-override-spindle').textContent,'—');
// Rapids: their own guard (also at rest, before a start), value and advice.
status({...c,workflow:'idle',canOverride:false,canRapidOverride:true,overrides:{feed:100,rapid:100,spindle:100}},false);
assert.equal(el('home-override-rapid').textContent,'100 %');assert.match(el('home-rapid-note').textContent,/25 % conseillés pour le premier essai/);
status({...c,workflow:'idle',canOverride:false,canRapidOverride:true,overrides:{feed:100,rapid:25,spindle:100}},false);
assert.equal(el('home-override-rapid').textContent,'25 %');assert.match(el('home-rapid-note').textContent,/Grbl revient à 100 %/);
status({...c,workflow:'idle',canOverride:false,canRapidOverride:false,overrides:{feed:100,rapid:25,spindle:100}},false);assert.equal(el('home-rapid-note').textContent,'');
// Real feed and spindle speed from Grbl; a pause with the spindle on is flagged.
status({...c,canOverride:true,feedrate:400,spindleSpeed:12000});assert.match(el('home-live').textContent,/Avance réelle 400 mm\/min · Broche 12.000 tr\/min/);assert.equal(el('home-spindle-warning').hidden,true);
status({...c,canOverride:true,workflow:'paused',activeState:'Hold:0',feedrate:0,spindleSpeed:12000});assert.equal(el('home-spindle-warning').hidden,false);assert.match(el('home-spindle-warning').textContent,/les axes sont arrêtés mais la broche tourne toujours/);
// Paused on a Grbl error (no feed hold): Grbl still runs, the axes are not said stopped (rehearsal, x06).
status({...c,canOverride:true,workflow:'paused',activeState:'Run',feedrate:600,spindleSpeed:12000});assert.match(el('home-spindle-warning').textContent,/^Envoi suspendu : Grbl peut encore exécuter/);assert.doesNotMatch(el('home-spindle-warning').textContent,/arrêtés/);
status({...c,canOverride:true,workflow:'paused',feedrate:0,spindleSpeed:0});assert.equal(el('home-spindle-warning').hidden,true);
status({...c,fresh:false,canOverride:true,workflow:'paused',spindleSpeed:12000});assert.equal(el('home-live').textContent,'');assert.equal(el('home-spindle-warning').hidden,true,'stale data never claims anything');
status({...c,canOverride:true});assert.equal(el('home-live').textContent,'','simulation snapshots without the fields show nothing');
let real={...c,port:'REAL',remainingSeconds:undefined,received:10};status(real,false);
for(let i=0;i<11;i++){now+=1000;real={...real,received:real.received+1};status(real,false);}
assert.match(el('home-job-eta').textContent,/estimé/);assert.match(el('home-job-note').textContent,/indicative/);
const navigate=name=>{activeScreens.clear();activeScreens.add(name);listeners['cnc-screen-change']({detail:name});};
navigate('menu');const count=requests.length,writes=stats.writes;
for(let i=0;i<50;i++)status(real,false);
assert.equal(stats.writes,writes);assert.equal(requests.length,count);
listeners['cnc-library-preview-updated']({detail:{file:'a.nc'}});assert.equal(requests.length,count);
navigate('home');assert.equal(requests.length,count+1);assert.equal(requests.at(-1).file,'a.nc.cnctouch.json');
const pending=requests.at(-1).xhr;navigate('menu');assert(pending.aborted);
const stable=stats.writes;pending.status=200;pending.responseText=JSON.stringify({data:JSON.stringify({file:'a.nc',preview:{image:'data:image/png;base64,AAAA'}})});pending.onload();assert.equal(stats.writes,stable);
navigate('home');assert.equal(requests.length,count+2);
console.log('PASS: loaded-file image, stale response, progress/estimate, zero hidden repaint/request, same-file invalidation, view abort and immediate reentry.');

// Estimation runs entirely on synthetic snapshots: no server and no controller commands.
function estimateFixture(monotonic=false){
  let wall=10000,elapsed=10000;
  const events={},dom=require('./dom-fixture.cjs').createDOM(['home']);
  const window={addEventListener:(name,fn)=>events[name]=fn};
  if(monotonic)window.performance={now:()=>elapsed};
  vm.runInNewContext(fs.readFileSync(__dirname+'/touch/job-dashboard.js','utf8'),{
    window,document:dom.document,Date:{now:()=>wall},localStorage:{getItem:()=>null},
    XMLHttpRequest:function(){throw Error('Unexpected network request');}
  });
  let machine={port:'TEST',name:'part.nc',revision:1,fresh:true,total:100,received:10,workflow:'running'};
  return {
    send(changes={},simulation=false){machine={...machine,...changes};events['cnc-job-status']({detail:{machine,simulation}});},
    advance(ms){wall+=ms;elapsed+=ms;},jumpWall(ms){wall+=ms;},
    dom,
    eta:()=>dom.node('home-job-eta').textContent,
    percent:()=>dom.node('home-job-percent').textContent,
    progress:()=>dom.node('home-job-progress').value
  };
}
function learn(f){f.send({received:10});for(let i=1;i<=10;i++){f.advance(1000);f.send({received:10+i});}assert.match(f.eta(),/1 min 20 s/);}
for(const changes of [
  {total:Infinity},{total:NaN},{total:'100'},{total:0},{total:-1},
  {received:Infinity},{received:NaN},{received:null},{received:'25'},
  {received:-1},{received:101},{fresh:false}
]){
  const f=estimateFixture();learn(f);f.send(changes);
  assert.equal(f.percent(),'—',JSON.stringify(changes));assert.equal(f.progress(),0);
  assert.match(f.eta(),/état indisponible/);assert.doesNotMatch(f.eta(),/chargez|NaN|Infinity/);
  f.send({fresh:true,total:100,received:21});assert.match(f.eta(),/calcul en cours/);
}
for(const gap of [-1000,4000,3600000]){
  const f=estimateFixture();learn(f);f.advance(gap);f.send({received:21});
  assert.match(f.eta(),/calcul en cours/,'Discard an estimate across a discontinuity');
  for(let i=1;i<=10;i++){f.advance(1000);f.send({received:21+i});}
  assert.match(f.eta(),/1 min 9 s/);
}
{
  const f=estimateFixture(true);learn(f);f.jumpWall(-3600000);f.advance(1000);f.send({received:21});
  assert.match(f.eta(),/1 min 19 s/,'Elapsed clock must ignore wall-clock changes');
  f.send({workflow:'paused'});
  for(let i=0;i<20;i++){f.advance(1000);f.send();}
  assert.match(f.eta(),/En pause.*1 min 19 s/);
  f.send({workflow:'running'});f.advance(1000);f.send({received:22});
  assert.match(f.eta(),/1 min 18 s/,'Paused time must not increase the estimate');
  for(let i=0;i<20;i++)f.send();
  assert.match(f.eta(),/1 min 18 s/,'Repeated paints must not change the estimate');
  f.send({received:100});assert.match(f.eta(),/attendre la fin des mouvements/);
  assert.doesNotMatch(f.eta(),/Terminé/);
}
for(const remainingSeconds of [null,undefined,NaN,Infinity,-1,'60']){
  const f=estimateFixture();f.send({received:0,canStart:true,remainingSeconds},true);
  assert.match(f.eta(),/état indisponible/);assert.doesNotMatch(f.eta(),/0 s|NaN|Infinity/);
  f.send({canStart:false,workflow:'running'},true);assert.match(f.eta(),/calcul en cours/);
  f.send({workflow:'paused'},true);assert.match(f.eta(),/estimation suspendue/);
}
for(const changes of [{revision:2},{total:200},{received:5},{name:'other.nc'}]){
  const f=estimateFixture();learn(f);f.send(changes);assert.match(f.eta(),/calcul en cours/);
}
{
  const f=estimateFixture();f.send({name:'',total:0,received:0});assert.match(f.eta(),/chargez un fichier/);
  f.send({name:'part.nc',received:12.5,remainingSeconds:52.5},true);
  f.send({total:100},true);assert.equal(f.percent(),'12 %');assert.match(f.eta(),/53 s/);
}
// Above 2 minutes the remaining time is shown to the (next) minute: the text does not change
// at every report (each change lays Suivi out on the tablet); seconds come back under 2 min.
{
  const f=estimateFixture();f.send({total:1000,received:10});for(let i=1;i<=10;i++){f.advance(1000);f.send({received:10+i});}
  const shown=f.eta();assert.match(shown,/Temps restant estimé : 17 min$/,shown);
  for(let i=1;i<=4;i++){f.advance(250);f.send({received:20+i/4});}assert.equal(f.eta(),shown,'unchanged over a second of reports at the same pace');
  const g=estimateFixture();g.send({total:100,received:10});for(let i=1;i<=10;i++){g.advance(1000);g.send({received:10+i});}assert.match(g.eta(),/1 min 20 s/);
}
console.log('PASS: strict finite counters, stale status, clock jumps, pause, sleep/relearning, job identity, malformed simulation duration and acknowledged-lines completion.');

// Wide workstation (body.perf-wide, PERFORMANCE-UI-SPEC.md 5.2, 6): Suivi in zones and its instruments.
// The fixture gets the sibling links a browser has; the Suivi elements are placed as job-dashboard.js
// and tool-position.js build them (the fixture does not parse insertAdjacentHTML).
{
  const ME = require('./touch/motion-estimate.js');
  let clock = 10000, wide = false;
  const events = {}, frames = [], dom = require('./dom-fixture.cjs').createDOM(['home']), { node } = dom;
  const link = (e) => {
    if (e._linked) return e; e._linked = true;
    Object.defineProperty(e, 'nextSibling', { get() { const p = this.parentNode, i = p && p.children ? p.children.indexOf(this) : -1; return i >= 0 ? p.children[i + 1] || null : null; } });
    Object.defineProperty(e, 'firstChild', { get() { return this.children[0] || null; } });
    return e;
  };
  const make = dom.document.createElement;
  // An id given after creation registers the element, as getElementById finds it in a browser.
  dom.document.createElement = (tag) => { const e = link(make(tag)); let own = ''; Object.defineProperty(e, 'id', { get: () => own, set(v) { own = v; dom.nodes[v] = e; } }); return e; };
  dom.document.createTextNode = (text) => { const t = link(make('#text')); t.textContent = text; return t; };
  dom.document.createElementNS = (ns, tag) => link(make(tag));
  const el = (id) => link(node(id)), box = (cls) => { const e = dom.document.createElement('div'); e.className = cls; return e; };
  const board = box('job-dashboard'), left = el('home-left'), metrics = box('job-metrics'), art = box('job-art');
  board.appendChild(left); board.appendChild(metrics);
  left.appendChild(art); art.appendChild(el('home-job-image')); left.appendChild(el('tool-position-note')); left.appendChild(el('home-overrides'));
  const progress = box('t-card home-progress'), head = box('home-progress-head'), coords = el('home-coords'), tiles = box('home-live-tiles'), feedCard = box('t-card'), stop = box('home-stop');
  head.appendChild(el('home-job-percent')); progress.appendChild(head); progress.appendChild(el('home-job-progress'));
  feedCard.appendChild(el('home-live-feed')); tiles.appendChild(feedCard);
  stop.appendChild(el('home-job-stop'));
  [el('home-job-title'), progress, coords, tiles, el('home-job-note'), el('home-job-ready'), el('home-program-pause'), el('home-job-selection'), el('home-job-load'), el('home-job-primary-row'), el('home-job-resume-row'), el('home-job-feedback'), stop].forEach((n) => metrics.appendChild(n));
  const shape = () => JSON.stringify([board, left, metrics].map((p) => p.children.map((c) => c.id || c.className)));
  const before = shape();
  const window = { CNCMotionEstimate: ME, innerWidth: 1366, addEventListener: (n, f) => { events[n] = f; },
    cncLayout: { wide: () => wide }, requestAnimationFrame: (f) => { frames.push(f); return frames.length; }, performance: { now: () => clock } };
  vm.runInNewContext(fs.readFileSync(__dirname + '/touch/job-dashboard.js', 'utf8'), { window, document: dom.document, Date: { now: () => clock },
    localStorage: { getItem: () => JSON.stringify({ state: { session: { token: 'fake' } } }) },
    XMLHttpRequest: function () { this.open = () => {}; this.setRequestHeader = () => {}; this.abort = () => {}; this.send = () => {}; } });
  const send = (machine, simulation = false) => events['cnc-job-status']({ detail: { machine, simulation } });
  const layout = (on, width) => { wide = on; if (width) window.innerWidth = width; events['cnc-layout-change']({ detail: { wide: on } }); };
  const text = (id) => node(id).textContent;
  // Out of the wide layout nothing is built and the DOM is the one of today (the RT never changes).
  send({ port: 'P', name: 'part.nc', revision: 1, fresh: true, total: 100, received: 0, workflow: 'idle', canStart: true });
  assert.equal(shape(), before, 'no change without perf-wide');
  assert.equal(board.getAttribute('data-zones'), null);
  assert(!dom.nodes['home-zone-gauges'], 'no zone built without perf-wide');
  // Two zones (1366 x 911): instruments then commands in the right column, the overrides under the view.
  layout(true, 1366);
  const gauges = node('home-zone-gauges'), controls = node('home-zone-controls');
  assert.equal(board.getAttribute('data-zones'), '2');
  assert.deepEqual(metrics.children.map((c) => c.id || c.className), ['home-job-title', 'home-zone-gauges', 'home-zone-controls']);
  assert.deepEqual(gauges.children.map((c) => c.id || c.className), ['t-card home-progress', 'home-gauge-eta', 'home-coords', 'home-live-tiles', 'home-gauge-overrides', 'home-gauge-curve']);
  assert.deepEqual(controls.children.map((c) => c.id || c.className), ['home-job-note', 'home-job-ready', 'home-program-pause', 'home-job-selection', 'home-job-load', 'home-job-primary-row', 'home-job-resume-row', 'home-job-feedback', 'home-stop'], 'commands in order, Arrêter alone at the bottom');
  assert.equal(head.children.at(-1).id, 'home-gauge-ack', 'acknowledged line beside the percentage');
  assert.equal(node('home-overrides').parentNode, left, 'two zones: overrides under the view');
  assert(['home-job-percent', 'home-job-progress', 'home-job-eta', 'home-live-feed', 'home-job-stop', 'home-job-image'].every((id) => node(id).tagName === 'DIV'), 'existing IDs kept, same elements');
  // Three zones (1728 x 1152): the overrides join the commands, above Arrêter.
  window.innerWidth = 1728; events.resize();
  assert.equal(board.getAttribute('data-zones'), '3');
  assert.deepEqual(controls.children.slice(-2).map((c) => c.id || c.className), ['home-overrides', 'home-stop']);
  // Back out of the wide layout: every element where it was, the wrappers gone.
  layout(false, 1366);
  assert.equal(shape(), before, 'DOM restored in order'); assert.equal(board.getAttribute('data-zones'), null);
  layout(true, 1366);
  // Remaining time: from the moves (corrected) when the rapids are known, its source written, the
  // observed rhythm as the second estimate; acknowledged line by CNCToolPosition when present.
  const lines = ['G21 G90', 'G0 Z5', 'G0 X0 Y0'];
  for (let i = 0; i < 100; i++) lines.push('G1 X' + (i % 2 ? 0 : 100) + ' Y' + i + ' F3000');
  lines.splice(50, 0, 'M0'); lines.push('T2 M6', 'G1 X50 Y50', 'M30');
  const est = JSON.parse(JSON.stringify(ME.estimate(lines.join('\n'))));
  node('home-job-image').cncPreview = { file: 'part.nc', lines: est.lines, estimate: est }; node('home-job-image').hidden = false;
  const rates = { $110: '6000', $111: '6000', $112: '1000' };
  const run = { port: 'P', name: 'part.nc', revision: 1, fresh: true, total: est.lines, received: 20, workflow: 'running', canStart: false, activeState: 'Run', settings: rates, overrides: { feed: 110, spindle: 100, rapid: 25 }, feedrate: 1800 };
  send(run);
  assert.match(text('home-gauge-eta-title'), /^Reste /); assert.match(text('home-gauge-eta-source'), /^mouvements \(sans accélérations\), pas encore corrigé$/);
  for (let r = 21; r <= 50; r++) { clock += 1000; send({ ...run, received: r }); }
  assert.match(text('home-gauge-eta-title'), /^Reste \d/); assert.match(text('home-gauge-eta-source'), /^mouvements, corrigé ×0,5 d’après les lignes acquittées$/);
  assert.match(text('home-gauge-eta-second'), /^Selon le rythme observé : /); assert.equal(node('home-gauge-eta-second').hidden, false);
  assert.match(text('home-gauge-eta-unknown'), /^Durées inconnues à venir : pause M0 \(l\. 51\), changement d’outil M6/);
  assert.equal(text('home-gauge-ack-value'), '50 / ' + est.lines, 'fallback rule: the received lines');
  window.CNCToolPosition = { acknowledged: () => 8412.7 };
  send({ ...run, received: 50 });
  assert.match(text('home-gauge-ack-value'), /^8\s412 \/ \d/u, 'acknowledged line by CNCToolPosition.acknowledged');
  assert.doesNotMatch(text('home-gauge-ack-label'), /usin/);
  // Overrides as read: a value off 100 % with its sign, flagged for the amber colour.
  assert.equal(text('home-gauge-ov-feed'), '110 % (+10 %)'); assert.equal(node('home-gauge-ov-feed').getAttribute('data-off'), 'true');
  assert.equal(text('home-gauge-ov-spindle'), '100 %'); assert.equal(node('home-gauge-ov-spindle').getAttribute('data-off'), 'false');
  assert.equal(text('home-gauge-ov-rapid'), '25 % (−75 %)');
  // Rapids unknown: the observed rhythm is the title, the moves the second estimate.
  delete window.CNCToolPosition;
  send({ ...run, settings: null, received: 51 }); clock += 1000; send({ ...run, settings: null, received: 52 });
  assert.match(text('home-gauge-eta-source'), /^rythme observé des lignes acquittées$/); assert.match(text('home-gauge-eta-second'), /^Selon les mouvements : .*\(rapides non comptés\)$/);
  // Paused: the existing wording, nothing invented; stale: no override value.
  send({ ...run, received: 52, workflow: 'paused' }); assert.match(text('home-gauge-eta-title'), /^En pause — /);
  send({ ...run, received: 52, fresh: false }); assert.equal(text('home-gauge-ov-feed'), '—'); assert.equal(text('home-gauge-ack-value'), '—');
  // Simulation: the simulated duration, said so.
  send({ ...run, received: 20, remainingSeconds: 40 }, true); assert.equal(text('home-gauge-eta-title'), 'Reste 40 s'); assert.match(text('home-gauge-eta-source'), /simulée/);
  // Curve: samples stored by the handler, drawn in an animation frame, at most once a second, only on
  // three zones and only while Suivi is shown.
  while (frames.length) frames.shift()(); // the frame asked for on three zones earlier runs (and draws nothing on two)
  send({ ...run, received: 53 });
  assert.equal(frames.length, 0, 'two zones: no curve drawn');
  window.innerWidth = 1728; events.resize(); while (frames.length) frames.shift()(); clock += 2000;
  const drawn = node('home-gauge-curve-line').getAttribute('points');
  send({ ...run, received: 54, feedrate: 1200 });
  assert.equal(frames.length, 1, 'one frame requested'); assert.equal(node('home-gauge-curve-line').getAttribute('points'), drawn, 'nothing drawn in the handler');
  send({ ...run, received: 55, feedrate: 1300 }); assert.equal(frames.length, 1, 'no second frame while one waits');
  frames.shift()();
  const points = node('home-gauge-curve-line').getAttribute('points');
  assert(points && points.split(' ').length >= 2, 'polyline written'); assert.match(text('home-gauge-curve-title'), /^Avance réelle, dernière minute · 0 à 2\s000 mm\/min$/u);
  clock += 500; send({ ...run, received: 56, feedrate: 1250 }); assert.equal(frames.length, 0, 'not again within a second');
  clock += 600; send({ ...run, received: 57, feedrate: 1250 }); assert.equal(frames.length, 1, 'again after a second'); frames.shift()();
  // Suivi hidden: no frame, no DOM write at all.
  dom.activeScreens.clear(); dom.activeScreens.add('menu'); events['cnc-screen-change']({ detail: 'menu' });
  const writes = dom.stats.writes; clock += 5000;
  for (let i = 0; i < 20; i++) { clock += 250; send({ ...run, received: 58 + i, feedrate: 1000 + i }); }
  assert.equal(frames.length, 0, 'no frame while Suivi is hidden'); assert.equal(dom.stats.writes, writes, 'no DOM write while Suivi is hidden');
  console.log('PASS wide Suivi: zones built only under perf-wide and undone in order, IDs kept, Arrêter alone at the bottom, remaining time with its source and second estimate, acknowledged line, overrides read, curve in an animation frame at most once a second and never while hidden.');
}

