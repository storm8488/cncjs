'use strict';
// Real Sonde checks migrated to the common card and shared sheets. Card/assistant/diagnostic matrices have their own tests.
const assert=require('assert').strict,fs=require('fs');
const {fixture}=require('./probe-page-fixture.cjs');
(async()=>{
 const q=fixture(),$=q.node;
 $('probe-plate-start').click();assert(!$('ks-plate').hidden);assert.equal($('plate-thickness').value,'');assert.equal($('plate-search').value,'10');assert($('plate-save').disabled);assert.equal(q.calls.length,0);
 for(const value of ['',0,'abc',-1,51]){q.input('plate-thickness',value);assert($('plate-save').disabled);$('plate-save').click();assert.equal(q.calls.length,0);}
 q.input('plate-thickness','10,5');
 for(const value of ['',0,'abc',-1,101]){q.input('plate-search',value);assert($('plate-save').disabled);}
 q.input('plate-search',15);assert(!$('plate-save').disabled);$('plate-save').click();await q.flush();assert.deepEqual(q.calls.at(-1),{op:'zeroZ',body:{thickness:10.5,search:15}});
 assert.deepEqual(JSON.parse(q.context.localStorage.getItem('cncjs-touch-plate-v1')),{thickness:10.5,search:15});assert($('ks-plate').hidden);
 $('probe-plate-start').click();await q.flush();assert.equal(q.calls.length,2,'known thickness skips the sheet');
 q.window.cncSeance.lancer('plaque');assert(!$('ks-plate').hidden);assert.equal($('plate-thickness').value,'10.5');assert(q.pads.filter(p=>p.input.id.indexOf('plate-')===0).every(p=>p.rules.dock==='right'));
 q.window.cncShell.closeSheet();q.send({finished:true});assert(!$('home-finish-plate').hidden);$('home-finish-plate-start').click();await q.flush();assert.equal(q.calls.at(-1).op,'zeroZ');
 q.send({workflow:'paused',programPause:{kind:'M6'},canZeroZ:true});assert(!$('home-pause-plate').hidden);$('home-pause-plate-start').click();await q.flush();assert.equal(q.calls.at(-1).op,'zeroZ');
 for(const patch of [{canZeroZ:false},{fresh:false},{probing:true,canStop:true},{canZeroZ:undefined}]){q.send(patch);const count=q.calls.length;assert($('probe-plate-start').disabled);$('probe-plate-start').click();await q.flush();assert.equal(q.calls.length,count);assert(!$('probe-plate-start').hidden);}
 q.send({operator:{}});const count=q.calls.length;$('probe-start').click();await q.flush();assert.equal(q.calls.length,count);assert(!$('probe-cause').hidden);
 q.send({operator:{wcs:'G59'}});$('probe-start').click();await q.flush();assert.equal(q.calls.at(-1).body.wcs,'G59');
 q.send({canStop:true}, {probeRun:'COM3'});assert(!$('probe-stop').disabled);$('probe-stop').click();assert.equal(q.calls.at(-1).op,'stop');
 q.send({}, {probeRun:'COM3',halt:{canStop:true},transportConnected:false});assert(!$('probe-stop').disabled,'awaited stop remains usable across loss of stream');
 q.send();$('probe-setup-open').click();q.context.localStorage.setItem('cnc-touch-probes-v1-real','other tab');q.input('probe-measure-thickness',8);$('probe-setup-save').click();assert(!$('ks-probe-setup').hidden);assert($('probe-setup-status').textContent.includes('autre onglet'));assert.equal(q.context.localStorage.getItem('cnc-touch-probes-v1-real'),'other tab');
 // The profile list keeps all management/backup functions in sheets, including a deliberate deletion.
 const r=fixture(),node=r.node;r.node('probe-setup-open').click();node('probe-other-open').click();
 node('probe-duplicate').click();assert.equal(JSON.parse(r.context.localStorage.getItem('cnc-touch-probes-v1-real')).profiles.length,2);
 node('probe-delete').click();assert(node('probe-delete-yes'));node('probe-delete-cancel').click();assert.equal(JSON.parse(r.context.localStorage.getItem('cnc-touch-probes-v1-real')).profiles.length,2);
 node('probe-delete').click();node('probe-delete-yes').click();assert.equal(JSON.parse(r.context.localStorage.getItem('cnc-touch-probes-v1-real')).profiles.length,1);
 node('probe-restore').click();assert.equal(JSON.parse(r.context.localStorage.getItem('cnc-touch-probes-v1-real')).profiles.length,2);
 node('probe-new').click();assert.equal(JSON.parse(r.context.localStorage.getItem('cnc-touch-probes-v1-real')).profiles.at(-1).thickness,null);
 const downloads=[];r.window.CNCDownload={save:(blob,name)=>downloads.push({blob,name})};r.context.Blob=Blob;
 r.context.FileReader=class{readAsText(file){this.readyState=2;this.onload({target:{result:file.content}});}abort(){this.readyState=2;}};
 node('probe-backup-open').click();assert(!node('ks-probe-transfer').hidden);node('probe-profiles-export').click();assert.equal(downloads.length,1);
 const backup=await downloads[0].blob.text();assert.equal(JSON.parse(backup).mode,'real');
 const incoming={...require('./probe-page-fixture.cjs').profile,name:'Imported block'};
 const content=r.window.CNCProbeTransfer.encode([incoming],'real');node('probe-profiles-file').files=[{size:content.length,content}];node('probe-profiles-file').handlers.change[0].call(node('probe-profiles-file'));
 assert(!node('probe-profiles-import').disabled);assert(node('probe-import-preview').textContent.includes('Imported block'));
 node('probe-profiles-import').click();assert.equal(JSON.parse(r.context.localStorage.getItem('cnc-touch-probes-v1-real')).profiles.length,4);
 const wrong=r.window.CNCProbeTransfer.encode([incoming],'simulation');node('probe-profiles-file').files=[{size:wrong.length,content:wrong}];node('probe-profiles-file').handlers.change[0].call(node('probe-profiles-file'));assert(node('probe-profiles-import').disabled);assert(node('probe-import-status').textContent.includes('incompatible'));
 const broken=fixture({rawStorage:'{'});broken.node('probe-start').click();broken.document.querySelector('button[data-corner="--"]').click();for(const [k,v] of [['thickness',5],['wallX',10],['wallY',10],['diameter',6]])broken.input('probe-measure-'+k,v);broken.node('probe-setup-save').click();assert.equal(broken.context.localStorage.getItem('cnc-touch-probes-v1-real'),'{');assert.equal(broken.calls.length,0);
 const index=fs.readFileSync(__dirname+'/touch/index.html','utf8');assert(index.indexOf('zero-piece.js')>index.indexOf('touch-shell.js'));assert(index.indexOf('zero-piece.js')>index.indexOf('profile-storage.js'));
 console.log('PASS probe real UI migration: invalid/blank/comma plate fields, persistence, repeat, Modify, pause/completion, permissions/freshness, active-only WCS, immediate stop and profile conflict preservation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
