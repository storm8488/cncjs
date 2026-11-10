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
    const html=read(name);
    assert(!/<script[^>]+(?:performance-(?:v2|inspect|sequences|observation|journal-context)|i18n-messages-v2)/.test(html),'no eager phase B request');
    // Static page dependencies changed since 793da19e, plus worker creators whose
    // URL is updated by phase C integration. Deferred v2 resources stay deferred.
    for(const file of ['display-settings.js','i18n.js','job-dashboard.js','job-preparation.js',
      'machine-limits.js','motion-estimate.js','preview-3d.js','preview-advanced.css','preview-inspect.js',
      'projects.js','settings-list.css','shared-library.css',
      'shared-library.js','status-strip.js','tablet-diagnostic.js','tablet-profile.js','tool-position.js',
      'touch-shell.js','travel-check.js','library-preview.js','laser-view.js']) {
      assert(html.includes(file+'?v=v2p'),'phase C page cache version: '+name+' / '+file);
    }
    if(name==='index.html') for(const file of ['real-history.js','session-journal.js']) {
      assert(html.includes(file+'?v=v2p'),'phase C real page cache version: '+file);
    }
  }
  assert(/ADVANCED_VERSION\s*=\s*'v2p'/.test(read('tablet-profile.js')),'phase C deferred resources cache version');
  for(const [module,file] of [['preview-inspect.js','preview-inspect.js'],['library-preview.js','library-preview-worker.js'],
    ['laser-view.js','laser-view.js']]) {
    const source=read(module);
    const urls=source.match(new RegExp(file.replace(/\./g,'\\.')+'\\?v=[a-z0-9]+','g')) || [];
    assert(urls.length>0,'worker URL exists: '+module);
    assert(urls.every(url=>url===file+'?v=v2p'),'phase C worker cache version: '+module);
  }
  for(const module of ['preview-inspect.js','laser-view.js']) {
    assert(read(module).includes("importScripts('motion-estimate.js?v=v2p')"),'phase C worker dependency cache version: '+module);
  }
  // The library preview worker loads its own copies of library-preview.js and motion-estimate.js.
  {
    const deps=(/importScripts\(([^)]*)\)/.exec(read('library-preview-worker.js'))||[])[1]||'';
    for(const file of ['library-preview.js','motion-estimate.js']) {
      assert(deps.includes("'"+file+"?v=v2p'"),'phase C worker dependency cache version: library-preview-worker.js / '+file);
    }
  }
  // All executable L0 / phase B browser files parse at ES2017; the catalogue is strictly JSON data.
  const acorn=require('acorn');
  for(const name of ['tablet-profile.js','touch-shell.js','status-strip.js','i18n.js','performance-v2-contract.js',
    'performance-inspect.js','performance-sequences.js','performance-observation.js','performance-journal-context.js',
    'preview-gl.js','preview-3d.js','tool-position.js','preview-inspect.js','motion-estimate.js','origin-preview.js','travel-check.js'])acorn.parse(read(name),{ecmaVersion:2017});
  const sandbox={window:{}}; vm.runInNewContext(read('i18n-messages-v2.js'),sandbox); assert.deepEqual(sandbox.window,{});
  console.log('PASS v2 i18n: FR/EN/ES deferred catalogue, atomic registration, JSON-only load, no eager RT request, ES2017 and cache versions.');
})().catch(e=>{console.error(e);process.exitCode=1;});
