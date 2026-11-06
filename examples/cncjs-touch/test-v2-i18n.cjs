'use strict';
const assert=require('assert').strict, vm=require('vm');
const {page,read}=require('./test-v2-gate.cjs');
(async()=>{
  const rows=JSON.parse(read('i18n-messages-v2.js'));
  assert(Array.isArray(rows)); const keys=new Set();
  rows.forEach(row=>{assert.equal(row.length,3); row.forEach(s=>assert.equal(typeof s,'string')); assert(!keys.has(row[0]));keys.add(row[0]);});
  for(const [lang,expected] of [['fr','Acquitté par Grbl'],['en','Acknowledged by Grbl'],['es','Confirmado por Grbl']]) {
    const p=page({raw:null}); p.values.set('cncjs-touch-language-v1',lang); p.run('i18n.js');
    const i=p.window.cncI18n;
    assert.equal(i.registerCatalog('performance-v2',rows),true);
    assert.equal(i.t('Acquitté par Grbl'),expected);
    assert.equal(i.registerCatalog('performance-v2',rows),true,'same version may be registered twice');
    assert.throws(()=>i.registerCatalog('bad',[['Invalid','OK',null]]));
    assert.equal(i.t('Invalid'),'Invalid','registration validates before applying anything');
    const r=p.api.setPreference(true); assert.equal(r.message,rows.find(r=>r[0].startsWith('Changement préparé'))[['fr','en','es'].indexOf(lang)]);
  }
  // Data is never injected as a script. Malformed/active content fails as JSON.
  const p=page(); p.status(); p.frame();
  const request=p.requests[0]; assert.equal(request.kind,'data');
  request.done=true; request.node.status=200; request.node.responseText='window.pwned = true'; request.node.onload();
  await new Promise(setImmediate); p.frame(); assert(!p.window.pwned); assert(!p.api.gate()); assert(!p.classes.has('perf-v2'));
  for(const name of ['index.html','simulation.html']) {
    assert(!/<script[^>]+(?:performance-v2|i18n-messages-v2)/.test(read(name)),'no eager v2 request');
    for(const file of ['tablet-profile','touch-shell','status-strip','i18n']) assert(read(name).includes(file+'.js?v=v2l01'));
  }
  // All executable L0 browser files parse at ES2017; the catalogue is strictly JSON data.
  const acorn=require('acorn');
  for(const name of ['tablet-profile.js','touch-shell.js','status-strip.js','i18n.js','performance-v2-contract.js']) acorn.parse(read(name),{ecmaVersion:2017});
  const sandbox={window:{}}; vm.runInNewContext(read('i18n-messages-v2.js'),sandbox); assert.deepEqual(sandbox.window,{});
  console.log('PASS v2 i18n: FR/EN/ES deferred catalogue, atomic registration, JSON-only load, no eager RT request, ES2017 and cache versions.');
})().catch(e=>{console.error(e);process.exitCode=1;});
