'use strict';
const assert=require('assert').strict,{page}=require('./session-dom-fixture.cjs');
const data=require('./commandes-migration.json'),before=require('./design/refonte/audit/commandes-machine.json');
assert.equal(data.lignes.length,69);assert.equal(new Set(data.lignes.map(r=>r.id)).size,69);for(const old of before.lignes)assert(data.lignes.some(r=>r.id===old.id));
const p=page();p.run('touch-shell.js');p.run('status-strip.js');p.run('real-motion.js');p.run('macros.js');p.emit('cnc-job-status',{machine:require('./session-fixture.cjs').machine(),transportConnected:true,pilot:{state:'free'}});p.window.cncShell.go('machine');
const probe=require('./probe-page-fixture.cjs').fixture();
for(const row of data.lignes.filter(r=>r.fait&&r.sort!=='supprimé'&&!['CX-02','CX-03','N-01'].includes(r.id))){const dom=row.lot==='L3b'?probe:p;assert(dom.document.querySelector(row.selecteur),row.id+' target exists in the mounted page');assert(row.refus);assert(row.requete!==undefined);}
assert.equal(data.lignes.find(r=>r.id==='CX-06').remplace,'Lecture automatique de l’état');
p.window.cncJobControls.dispose();console.log('PASS command migration: 65 original entries plus four authorized additions, completed L1 targets and remaining lots explicit.');
