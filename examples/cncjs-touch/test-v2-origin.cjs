'use strict';
const assert = require('assert').strict;
const { page } = require('./test-v2-gate.cjs');
const { originPage, machine, preview, eq } = require('./test-origin-preview.cjs');
const TC = require('./touch/travel-check.js');
const pview = () => preview([0, 0, 60, 70]);
const state = (patch = {}) => machine(-350, -250, 12, 30, {}, { port: 'A', generation: 'g1', fingerprint: 'sha256:aa', statusAgeMs: 0, ...patch });

async function reviewOriginFixes() {
  // Real bootstrap, lifecycle contract, travel checker and origin consumer. Only
  // DOM/GPU and the deferred L4 response/cancellation boundary are simulated.
  for (const cancellation of ['cancel', 'abort', 'dashboard', 'none']) {
    for (const transition of ['run', 'eco', 'pagehide', 'unmount']) {
      const p = page(), ui = originPage(), reads = [];
      p.status(state()); p.frame(); await p.complete();
      for (const key of ['body', 'head', 'createElement', 'createTextNode', 'getElementById']) p.document[key] = ui.document[key];
      p.window.CNCPreviewGL = ui.win.CNCPreviewGL;
      p.window.cncState = { get: () => ({ machine: state() }) };
      p.window.cncDashboardView = { loadedPreview() {
        const read = { cancelled: 0 };
        read.promise = new Promise(resolve => { read.resolve = resolve; });
        if (cancellation === 'cancel' || cancellation === 'abort') read.promise[cancellation] = () => { read.cancelled++; };
        reads.push(read); return read.promise;
      } };
      if (cancellation === 'dashboard') p.window.cncDashboardView.cancelLoadedPreview = promise => {
        const read = reads.find(r => r.promise === promise);
        assert(read, 'dashboard cancellation is scoped to the original promise'); read.cancelled++;
      };
      p.run('travel-check.js'); p.run('origin-preview.js');
      p.emit('cnc-screen-change', 'jog'); p.window.CNCOriginPreview.mount(ui.screen); p.frame();
      assert.equal(reads.length, 1);
      if (transition === 'run') p.status(state({ workflow: 'running', activeState: 'Run' }));
      if (transition === 'eco') p.window.cncProfile.setPerformance('eco');
      if (transition === 'pagehide') p.emit('pagehide');
      if (transition === 'unmount') p.window.CNCOriginPreview.unmount();
      assert.equal(reads[0].cancelled, cancellation === 'none' ? 0 : 1, transition + ': pending L4 preview is cancelled immediately through ' + cancellation);
      if (transition === 'run') {
        p.status(state()); p.frame();
        assert.equal(reads.length, 2, 'idle return obtains a new request');
      }
      reads[0].resolve(pview()); await new Promise(setImmediate); p.frame();
      assert.equal(ui.opened.length, 0, transition + ': cancelled preview never opens a scene, even without an L4 cancellation API');
      if (transition === 'run') {
        assert.equal(reads[1].cancelled, 0, 'old result cannot cancel the current request');
        reads[1].resolve(pview()); await new Promise(setImmediate); p.frame();
        assert.equal(ui.opened.length, 1, 'new result remains consumable after the old result');
      }
      p.window.CNCOriginPreview.unmount();
      assert.equal(reads[0].cancelled, cancellation === 'none' ? 0 : 1, 'cancellation is idempotent');
    }
  }
}
module.exports = { reviewOriginFixes };

if (require.main === module) (async () => {
  await reviewOriginFixes();
  for (const language of ['en','es']) {
    const translated=page(); translated.values.set('cncjs-touch-language-v1',language); translated.run('i18n.js');
    translated.status(state()); translated.frame(); await translated.complete();
    translated.run('travel-check.js'); translated.run('origin-preview.js');
    const unknownState=state(); delete unknownState.settings.$23;
    assert(translated.window.CNCOriginPreview.hint(unknownState,pview()).includes(language==='en'?'Unknown source':'Origen desconocido'),'deferred L0 catalogue translates v2 unknown source');
  }
  assert.equal(typeof TC.placementData, 'function', 'v2 travel exposure is separate from the unchanged rules');
  let result = TC.placementData(pview(), state());
  eq(result, { verdict: 'inside', source: 'CNCTravelCheck.place', marginsMm: { x: { min: 50, max: 290 }, y: { min: 50, max: 180 } }, zVerified: false, collisionsVerified: false });
  const outside = state({ coordinates: { mpos: { x: -20, y: -250, z: -5 }, wpos: { x: 12, y: 30, z: 2 } } });
  result = TC.placementData(pview(), outside);
  assert.equal(result.verdict, 'outside'); assert.equal(result.marginsMm.x.max, -40);
  for (const settings of [{ $23: '1' }, { $23: undefined }, { $23: '' }, { $23: 'oops' }, { $23: 0.5 }, { $130: undefined }, { $22: 0 }]) {
    const m = state(); Object.assign(m.settings, settings);
    result = TC.placementData(pview(), m); assert.equal(result.verdict, 'unknown'); assert.equal(result.marginsMm, null);
  }
  // The original rules and all their callers keep exactly their own result.
  assert.equal(TC.place(pview(), state()).state, 'ok');
  const before = JSON.stringify(state()); TC.placementData(pview(), state()); assert.equal(JSON.stringify(state()), before);

  const p = page(); p.status(state()); p.frame(); await p.complete(); p.run('travel-check.js'); p.run('origin-preview.js');
  p.window.CNCPreviewInspect = require('./touch/preview-inspect.js');
  const api = p.api, provider = api.use('placement'); assert(!provider.stub, 'L2 installs the L0 placement provider');
  let m = provider.update({ machine: state(), preview: pview() });
  assert(m.available); assert(Object.isFrozen(m)); assert.equal(m.identity.role, 'loaded');
  eq(m.current, { wcs: 'G54', offsetMm: { x: -362, y: -280, z: -7 } });
  eq(m.hypothesis, { axes: ['x', 'y'], deltaMm: { x: 12, y: 30 }, zUnchanged: true });
  assert.equal(m.travel.verdict, 'inside'); assert.equal(m.travel.zVerified, false); assert.equal(m.travel.collisionsVerified, false);
  const identity = m.identity;
  m = provider.update({ machine: state(), preview: pview(), declarations: [
    { kind: 'stock', source: 'project', identity, value: { x: 100, y: 80, z: 15 }, units: 'mm', assumptions: ['X0Y0', 'topZ0'] },
    ...Array.from({length: 6}, (_,i) => ({kind:'dimension',source:'program',identity,value:{axis:'x',valueMm:i + 1},units:'mm',assumptions:[]})),
    { kind: 'clamp', source: 'operator', identity: api.identity.create({file:'a.nc',fingerprint:'wrong'}), value: {}, units:'mm', assumptions:[] }
  ] });
  assert.equal(m.declarations.length, 5); assert.equal(m.declarations.filter(d=>d.kind==='dimension').length, 4);
  assert(Object.isFrozen(m.declarations[0].value)); assert.equal(m.declarations[0].source,'project');
  m = provider.update({ machine: state(), preview: pview() }); assert.equal(m.declarations.length,5,'placement refresh retains supplied declarations of the same loaded job');
  m = provider.update({machine:state(),preview:pview(),declarations:[
    {kind:'dimension',source:'operator',identity,value:{axis:'x',valueMm:NaN},units:'mm',assumptions:[]},
    {kind:'stock',source:'project',identity,value:{x:-10,y:20,z:5},units:'mm',assumptions:[]}
  ]}); assert.equal(m.declarations.length,0,'malformed declarations are not presented as measured values');
  for (const patch of [{fresh:false},{statusAgeMs:2501},{workflow:'paused'},{workflow:'running'},{activeState:'Alarm'},{operator:{wcs:'G54',reportUnits:'in'}}]) {
    m = provider.update({ machine: state(patch), preview: pview() });
    assert.equal(m.hypothesis, null, JSON.stringify(patch)); assert.equal(m.travel.verdict, 'unknown');
  }
  m = provider.update({ machine: state(), preview: {...pview(), fingerprint:'wrong'} }); assert(!m.available);
  m = provider.update({ machine: state(), preview: {...pview(), fingerprint:null} }); assert(!m.available);
  m = provider.update({ machine: state(), preview: preview([0,0,60,70],{programWcs:'G55'}) }); assert.equal(m.travel.verdict,'unknown'); assert.equal(m.hypothesis,null);
  m = provider.update({ machine: state({operator:{wcs:'G55',reportUnits:'mm'}}), preview: preview([0,0,60,70],{programWcs:'G55'}) }); assert.equal(m.travel.verdict,'unknown'); assert.equal(m.hypothesis,null,'current renderer only supports G54');
  m = provider.update({ machine: state(), preview: pview() }); assert(m.available);
  p.status(state({workflow:'running',activeState:'Run'})); assert.equal(provider.snapshot().hypothesis,null);
  assert.equal(provider.update({machine:state(),preview:pview()}).available,false,'stale caller cannot bypass real L0 job state');
  p.status(state()); provider.update({machine:state(),preview:pview()}); p.advance(2501);
  assert.equal(provider.snapshot().travel.verdict,'unknown','monotone staleness without another status event');
  p.status(state()); provider.update({machine:state(),preview:pview()}); p.status(state({fingerprint:'other',revision:2}));
  assert.equal(provider.snapshot().identity,null,'program replacement releases old placement');
  assert.equal(provider.update({machine:state(),preview:pview()}).available,false,'old caller cannot republish a superseded job at idle');
  p.window.cncProfile.setPerformance('eco'); assert(api.use('placement').stub); assert.equal(provider.snapshot().available,false);

  // Existing card and GPU API: one scene, no re-open/refit when the visual selector changes.
  const ui = originPage();
  ui.win.cncV2 = { gate:()=>true };
  ui.win.cncDashboardView._setPreview(pview());
  const O = ui.win.CNCOriginPreview; O.mount(ui.screen); ui.status(state()); await ui.flush();
  assert.equal(ui.opened.length,1); assert.equal(ui.opened[0].opts.pathStyle,'hidden');
  assert.equal(ui.opened[0].opts.fit,'all');
  const overlays = ui.opened[0].opts.overlays;
  const current = overlays.find(o=>o.id==='current'), hypothesis = overlays.find(o=>o.id==='placed');
  eq(current.translate,[0,0,0]); assert.equal(current.colour,'neutral'); assert.equal(hypothesis.colour,'info');
  assert.equal(O.comparison(),'both'); assert.equal(O.comparison('current'),'current'); await ui.flush();
  assert(!ui.sets.at(-1).some(o=>o.id==='placed')); assert(ui.sets.at(-1).some(o=>o.id==='current'));
  O.comparison('hypothesis'); await ui.flush(); assert(!ui.sets.at(-1).some(o=>o.id==='current')); assert(ui.sets.at(-1).some(o=>o.id==='placed'));
  assert.equal(O.comparison('unsafe'),'hypothesis'); O.comparison('both'); await ui.flush();
  assert.equal(ui.opened.length,1); eq(ui.requests,[]); eq(ui.clicks,[]); O.unmount();
  // Late previews after work starts never publish a v2 placement or open a renderer.
  const late = originPage(); late.win.cncV2={gate:()=>true}; let finish;
  late.win.cncDashboardView.loadedPreview=()=>new Promise(resolve=>{finish=resolve;});
  late.win.CNCOriginPreview.mount(late.screen); late.status(state()); await late.flush();
  late.status(state({workflow:'running',activeState:'Run'})); finish(pview()); await late.flush(); assert.equal(late.opened.length,0);
  late.win.CNCOriginPreview.unmount();
  const corrupt = originPage(); corrupt.win.cncV2={gate:()=>true};
  corrupt.win.cncDashboardView._setPreview({...pview(),fingerprint:'wrong'});
  corrupt.win.CNCOriginPreview.mount(corrupt.screen); corrupt.status(state()); await corrupt.flush();
  assert.equal(corrupt.opened.length,0,'v2 card rejects metadata from a different fingerprint'); corrupt.win.CNCOriginPreview.unmount();
  const unknown = originPage(); unknown.win.cncV2={gate:()=>true};
  unknown.win.cncDashboardView._setPreview(pview()); unknown.win.CNCOriginPreview.mount(unknown.screen);
  const missing23=state(); delete missing23.settings.$23; unknown.status(missing23); await unknown.flush();
  assert(!unknown.opened[0].opts.overlays.some(o=>o.colour==='ok'),'unknown $23 never produces a green overlay');
  assert(!unknown.opened[0].opts.overlays.some(o=>o.id==='travel'),'unknown $23 does not draw a guessed travel box');
  assert(!/dans la course/.test(unknown.win.CNCOriginPreview.hint(missing23,pview())),'v2 hint never bypasses conservative unknown $23');
  unknown.win.CNCOriginPreview.unmount();
  const oldRead = originPage(); oldRead.win.cncV2={gate:()=>true}; const answers=[];
  oldRead.win.cncDashboardView.loadedPreview=()=>new Promise(resolve=>answers.push(resolve));
  oldRead.win.CNCOriginPreview.mount(oldRead.screen); oldRead.status(state()); await oldRead.flush();
  oldRead.status(state({workflow:'running',activeState:'Run'})); oldRead.status(state());
  answers[0](pview()); await oldRead.flush();
  assert.equal(oldRead.opened.length,0,'a read started before work cannot publish after an idle return');
  assert.equal(answers.length,2,'the idle return may ask for fresh metadata');
  answers[1](pview()); await oldRead.flush(); assert.equal(oldRead.opened.length,1);
  oldRead.win.CNCOriginPreview.unmount();
  const busy = originPage(); busy.win.cncV2={gate:()=>true,state:()=>({safeIdle:false})}; let reads=0;
  busy.win.cncDashboardView.loadedPreview=()=>{reads++;return Promise.resolve(pview());};
  busy.win.CNCOriginPreview.mount(busy.screen); busy.status(state()); await busy.flush();
  assert.equal(reads,0,'actual L0 unsafe state blocks even an apparently idle cached machine object'); busy.win.CNCOriginPreview.unmount();
  const frame = originPage(); frame.win.cncV2={gate:()=>true};
  frame.win.cncDashboardView._setPreview(preview([0,0,60,70],{programWcs:'G55'}));
  frame.win.CNCOriginPreview.mount(frame.screen); frame.status(state()); await frame.flush();
  assert(!frame.opened[0].opts.overlays.some(o=>o.id==='placed'),'unsupported work frame never draws a false XY hypothesis'); frame.win.CNCOriginPreview.unmount();
  const sheet = originPage(); sheet.win.cncV2={gate:()=>true}; sheet.win.CNCProjects={stock:()=>({x:999,y:999,z:99})};
  sheet.win.cncDashboardView._setPreview(pview()); sheet.win.CNCOriginPreview.mount(sheet.screen); sheet.status(state()); await sheet.flush();
  assert(!sheet.opened[0].opts.overlays.some(o=>o.id==='stock'),'name-only project stock cannot enter v2 comparison'); sheet.win.CNCOriginPreview.unmount();
  const first = originPage(); first.win.cncV2={gate:()=>true}; let resolveFirst;
  first.win.cncDashboardView.loadedPreview=()=>new Promise(resolve=>{resolveFirst=resolve;});
  first.win.CNCOriginPreview.mount(first.screen); first.status(state()); await first.flush();
  first.win.CNCOriginPreview.comparison('current'); resolveFirst(pview()); await first.flush();
  assert(first.opened[0].opts.overlays.some(o=>o.id==='placed'),'initial fit always includes both placements even when a selector changed during loading');
  assert(!first.sets.at(-1).some(o=>o.id==='placed')); first.win.CNCOriginPreview.unmount();
  const leased = originPage(); let epoch=0, paused=false, cancelRead=null, disposeCount=0, resolveLease;
  const life={token:()=>paused?null:{epoch},valid:t=>!paused&&t.epoch===epoch,
    track:(kind,cancel)=>{assert.equal(kind,'read');cancelRead=cancel;return ()=>{};},dispose:()=>{disposeCount++;}};
  leased.win.cncV2={gate:()=>true,lifecycle:{scope:()=>life}};
  leased.win.cncDashboardView.loadedPreview=()=>new Promise(resolve=>{resolveLease=resolve;});
  leased.win.CNCOriginPreview.mount(leased.screen); leased.status(state()); await leased.flush();
  assert.equal(typeof cancelRead,'function','loaded metadata is protected by an L0 read lease');
  paused=true;epoch++;cancelRead('lock');resolveLease(pview());await leased.flush();assert.equal(leased.opened.length,0);
  leased.win.CNCOriginPreview.unmount();assert.equal(disposeCount,1);
  console.log('PASS v2 origin: unchanged travel rules, qualified margins, loaded identity, XY-only placement, declaration provenance/4 dimensions, lifecycle and visual comparison without refit or commands.');
})().catch(e=>{console.error(e);process.exitCode=1;});
