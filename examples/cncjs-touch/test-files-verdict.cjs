'use strict';
const assert=require('assert'),{fixture,check}=require('./check-page-fixture.cjs');
(async()=>{
 const q=fixture();q.window.cncShell.go('files');q.select('a.nc');q.select('b.nc');assert.deepEqual(q.requests.map(r=>r.file),['a.nc','b.nc']);
 q.requests[0].resolve({programCheck:check('outside')});await q.flush();assert(!q.node('files-verdict').textContent.includes('dépasse'));
 q.requests[1].resolve({programCheck:check()});await q.flush();assert.equal(q.node('files-verdict').textContent,'Tient dans la machine avec le zéro pièce actuel.');assert.equal(q.node('files-depth').textContent,'20 mm');assert.equal(q.node('files-extent').textContent,'90 × 70 mm');
 for(const [code,params,expected] of [['ETOUCH_TRAVEL_TOO_LOW',{over:'15'},'Descend 15 mm trop bas'],['ETOUCH_TRAVEL_TOO_HIGH',{over:'2'},'Monte 2 mm trop haut'],['ETOUCH_TRAVEL_BEYOND',{axis:'X',sign:'+',over:'3'},'Dépasse de 3 mm à droite']]){q.select(code);q.requests.at(-1).resolve({programCheck:check('outside',{blocking:[{code,params}]})});await q.flush();assert(q.node('files-verdict').textContent.includes(expected));}
 for(const [code,phrase] of [['ETOUCH_CHECK_OFFSET_UNPROVEN','Course pas encore vérifiée'],['ETOUCH_CHECK_NOT_HOMED','origine machine pas prise'],['ETOUCH_CHECK_PROBE','Course non vérifiable']]){q.select(code);q.requests.at(-1).resolve({programCheck:check('unknown',{codedReasons:[{code}]})});await q.flush();assert(q.node('files-verdict').textContent.includes(phrase));}
 q.select('broken.nc');q.requests.at(-1).reject(new Error('fixture'));await q.flush();assert.equal(q.node('files-verdict').textContent,'Contrôle indisponible.');let n=q.requests.length;q.node('files-verdict-remedy').click();assert.equal(q.requests.length,n+1);
 q.send({workOffset:{state:'checking'}});assert(q.node('files-verdict').textContent.includes('machine vérifie le zéro'));n=q.requests.length;q.send();assert.equal(q.requests.length,n+1,'one new check when D2 becomes proven');q.send();assert.equal(q.requests.length,n+1);
 q.send({generation:'g2'});assert.equal(q.requests.length,n+2,'controller generation invalidates selection result');
 q.window.innerHeight=768;q.emit('resize');assert(q.listeners['cnc-library-page-size']);
 for(const lang of ['en','es']){const f=fixture(lang);f.window.cncShell.go('files');f.select('x.nc');f.requests[0].resolve({programCheck:check()});await f.flush();assert(!f.node('files-verdict').textContent.includes('Tient dans'));}
 const transport=require('./job-controls-fixture.cjs').load(),navigation=[];await transport.connect();transport.window.cncShell={go:name=>navigation.push(name)};
 transport.window.dispatchEvent({type:'cnc-library-select',detail:{file:'selected.nc',name:'Selected'}});
 const loading=transport.controls().load('explicit.nc');assert.equal(transport.posts().at(-1).body.file,'explicit.nc','load(file) preserves its explicit target');assert.equal(transport.posts().at(-1).body.action,'load');transport.answer(transport.posts().at(-1),{message:'Loaded'});await loading;assert.deepEqual(navigation,[],'loading itself never changes screen');transport.controls().dispose();
 const content=q.document.createElement('div');content.id='perf-v2-files';q.node('screen-files').appendChild(content);
 q.window.cncV2={state:()=>({layout:true,safeIdle:true}),gate:()=>true,mounts:{get:name=>name==='files'?{root:q.node('screen-files'),content}:null}};q.emit('cnc-v2-change');q.frames.splice(0).forEach(fn=>fn());
 assert(q.node('lv2-match').closest('#ks-file-info'),'fingerprint diagnostics live in file details');assert(!q.node('lv2-match').closest('#perf-v2-files'));
 assert(q.node('lv2-dims-sel').closest('#ks-file-info'),'technical comparison rows do not push the verdict out of the main card');assert(q.node('lv2-sel-name').closest('#perf-v2-files'),'chosen and loaded names stay on File');
 console.log('PASS file verdict: one request per selection, stale responses ignored, eight messages, retry and D2 refresh.');
})().catch(e=>{console.error(e);process.exitCode=1;});
