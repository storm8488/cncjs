'use strict';
const assert=require('assert').strict,{preparerPage,tick}=require('./test-v2-preparer-fixture.cjs');
(async()=>{
 for(const language of ['fr','en','es']){
  const p=preparerPage({manual:true,language}),t=p.window.cncI18n.t;
  p.open();assert.equal(p.calls.loads.length,1);p.rejectLoads('offline');await tick();
  assert(p.content.textContent.includes(t('Aperçu indisponible.')),'loading failure is visible');
  const retry=p.node('check-placement-retry');assert(retry&&!retry.hidden);assert.equal(retry.textContent,t('Réessayer'));
  retry.click();assert.equal(p.calls.loads.length,2);retry.click();assert.equal(p.calls.loads.length,2,'only one pending load');
  p.window.cncShell.closeSheet();p.rejectLoads('late');await tick();
  assert(!p.content.textContent.includes(t('Aperçu indisponible.')),'a closed sheet ignores a late rejection');
  p.open();assert.equal(p.calls.loads.length,3);p.resolveLoads();await tick();assert.equal(p.calls.mount.length,1);
  assert(p.node('check-placement-state').hidden);assert(p.node('check-placement-retry').hidden);
  p.window.cncShell.closeSheet();p.open();p.window.cncShell.closeSheet();p.resolveLoads();await tick();
  assert.equal(p.calls.mount.length,1,'a closed sheet ignores a late success');
  const gated=preparerPage({manual:true,language});gated.open();
  gated.v2.gate=false;gated.rejectLoads('gate closed');await tick();
  assert.equal(gated.calls.mount.length,0);
  gated.v2.gate=true;gated.emit('cnc-v2-change');
  assert.equal(gated.calls.loads.length,2,'a rejected load outside its gate does not leave a permanent loading lock');
  gated.resolveLoads();await tick();assert.equal(gated.calls.mount.length,1);
 }
 console.log('PASS placement loading: translated failure and retry, no duplicate request or late mount after closing.');
})().catch(e=>{console.error(e);process.exitCode=1;});
