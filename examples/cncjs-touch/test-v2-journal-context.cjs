'use strict';
const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');
const {page} = require('./test-v2-gate.cjs');
const filename = path.join(__dirname, 'touch/performance-journal-context.js');
const plain = value => JSON.parse(JSON.stringify(value));
async function setup(options = {}) {
  const p = page(options);
  p.status(); p.frame(); await p.complete();
  if (fs.existsSync(filename)) p.run('performance-journal-context.js');
  const api = p.api;
  const identity = api.identity && api.identity.create({role:'loaded', file:'part.nc', fingerprint:'sha256:a', controller:'A', generation:'g1', revision:1});
  const journal = api.use && api.use('journal');
  function event(id, at, patch = {}) {
    return Object.assign({id, identity, time:{arrivalMonoMs:at, civilMs:100000+at, server:{value:null, source:null}},
      source:'device', state:'sent', code:'command.pause', params:{category:'command'}}, patch);
  }
  function update(events, patch = {}) {
    return journal.update(Object.assign({version:1, identity, interval:{fromMonoMs:100, toMonoMs:200}, civilInterval:null, retained:true, events}, patch));
  }
  return {p, api, identity, journal, event, update};
}
const cases = [];
function test(name, action) { cases.push({name, action}); }

test('contract registration, data-only immutable snapshots, no side effects', async () => {
  const {p, api, journal, event, update} = await setup();
  assert.notEqual(journal.stub, true, 'real provider replaces only the L0 journal stub');
  assert.equal(journal.owner, 'L3');
  assert.deepEqual(Object.keys(journal.snapshot()).sort(), ['available','civilInterval','events','identity','interval','retained','version']);
  assert.equal(journal.snapshot().retained, false);
  const entries = [event(1, 120)];
  const frames = p.frames.size, requests = p.requests.length;
  const result = update(entries);
  assert.equal(result.events.length, 1);
  assert.equal(result.available, true);
  assert.equal(result.retained, true);
  assert(Object.isFrozen(result) && Object.isFrozen(result.events[0].time.server));
  entries[0].params.category = 'connection'; entries[0].time.arrivalMonoMs = 999;
  assert.equal(result.events[0].params.category, 'command');
  assert.equal(result.events[0].time.arrivalMonoMs, 120, 'snapshot cannot alias its caller');
  assert.equal(p.frames.size, frames, 'model schedules no render');
  assert.equal(p.requests.length, requests, 'model requests no history or program');
  assert.equal(api.notify('journal'), true, 'snapshot passes the L0 data-only boundary');
  assert.equal(api.commands, null);
});

test('inclusive monotone interval, strict job identity, deterministic order and four action states', async () => {
  const {api, identity, journal, event, update} = await setup();
  const other = revision => api.identity.create(Object.assign({}, identity, {revision}));
  const result = update([event('late',200,{state:'uncertain'}), event('outside',201), event('first',100,{state:'confirmed'}),
    event('middle',150,{state:'refused'}), event('second',100), event('other-job',140,{identity:other(2)}),
    event('other-fingerprint',140,{identity:api.identity.create(Object.assign({},identity,{fingerprint:'sha256:b'}))}),
    event('selection',140,{identity:api.identity.create(Object.assign({},identity,{role:'selection'}))}),
    event('no-identity',140,{identity:null})]);
  assert.deepEqual(plain(result.events.map(e => e.id)), ['first','second','middle','late']);
  assert.deepEqual(plain(result.events.map(e => e.state)), ['confirmed','sent','refused','uncertain']);
  assert.equal(result.identity.jobKey, identity.jobKey);
  assert.equal(journal.snapshot(), result);
});

test('missing context or retention never manufactures a match or numeric zero', async () => {
  const {api, identity, journal, event, update} = await setup();
  for (const patch of [{identity:null}, {identity:api.identity.create({role:'loaded', file:identity.file})},
    {identity:api.identity.create(Object.assign({},identity,{role:'selection'}))}, {interval:null},
    {interval:{fromMonoMs:null,toMonoMs:200}}, {interval:{fromMonoMs:200,toMonoMs:100}},
    {interval:{fromMonoMs:'100',toMonoMs:200}}, {retained:false}, {retained:null}]) {
    const result = update([event(1,150)], patch);
    assert.equal(result.events.length, 0, JSON.stringify(patch));
    assert.equal(result.retained, false);
    assert.equal(journal.presentation(result).emptyMessage, 'Aucun événement conservé');
  }
  const missing = journal.update({});
  assert.equal(missing.identity, null); assert.equal(missing.interval, null); assert.equal(missing.civilInterval, null);
});

test('category filters are pure, preserve states and leave unknown categories explicit', async () => {
  const {journal, event, update} = await setup();
  const result = update([event(1,110), event(2,120,{code:'state.hold',params:{}}),
    event(3,130,{code:'connection.lost',params:{}}), event(4,140,{code:'custom.notice',params:{}}),
    event(5,150,{code:'custom.command',params:{category:'command'},state:'refused'})]);
  assert.deepEqual(plain(journal.filter('command').events.map(e => e.id)), [1,5]);
  assert.deepEqual(plain(journal.filter('state').events.map(e => e.id)), [2]);
  assert.deepEqual(plain(journal.filter('connection').events.map(e => e.id)), [3]);
  assert.equal(journal.filter('all').events.length, 5);
  assert.equal(journal.filter('unknown-filter').events.length, 0, 'invalid filter cannot expose unrelated entries');
  assert.equal(journal.snapshot(), result, 'filters do not change context or retained history');
});

test('server history is matched only in its declared civil clock, never fetch arrival', async () => {
  const {event, update} = await setup();
  const server = event('server',150,{source:'server',time:{arrivalMonoMs:150,civilMs:100150,server:{value:5000,source:'server-history'}}});
  assert.equal(update([server]).events.length, 0, 'fetch arrival is not the server event time');
  const result = update([server], {civilInterval:{fromMs:4999,toMs:5000,source:'server-history'}});
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].time.server.value, 5000);
  assert.equal(result.events[0].time.server.source, 'server-history');
  assert.equal(update([server], {civilInterval:{fromMs:0,toMs:10000,source:'other-server'}}).events.length, 0);
  assert.equal(update([server], {civilInterval:{fromMs:100100,toMs:100200,source:'device'}}).events.length, 0);
  const civilOnly = update([server], {interval:null,civilInterval:{fromMs:4999,toMs:5001,source:'server-history'}});
  assert.equal(civilOnly.events.length, 1);
  assert.equal(civilOnly.interval, null, 'civil clocks never synthesize local monotone timestamps');
});

test('device monotone chronology survives wall clock jumps and local civil context is explicit', async () => {
  const {event, update} = await setup();
  const first = event(1,110,{time:{arrivalMonoMs:110,civilMs:900000,server:{value:null,source:null}}});
  const second = event(2,190,{time:{arrivalMonoMs:190,civilMs:100,server:{value:null,source:null}}});
  assert.deepEqual(plain(update([second,first]).events.map(e => e.id)), [1,2]);
  const civil = update([first,second],{interval:null,civilInterval:{fromMs:90,toMs:110,source:'device'}});
  assert.deepEqual(plain(civil.events.map(e => e.id)), [2]);
  assert.equal(update([first],{interval:null,civilInterval:{fromMs:899999,toMs:900001,source:null}}).events.length,0);
});

test('curve context preserves exact identity and interval, without clock conversion or navigation', async () => {
  const {p, identity, journal} = await setup();
  const marker = {id:'gap-1',kind:'gap',identity,time:{arrivalMonoMs:180,civilMs:100180,server:{value:5000,source:'server-history'}},
    interval:{fromMonoMs:120,toMonoMs:180},value:null,source:'inferred',code:'observation.gap',params:{}};
  const before = journal.snapshot(), eventCount = p.events.length;
  const context = journal.contextFor(marker,20);
  assert.deepEqual(plain(context.interval), {fromMonoMs:100,toMonoMs:200});
  assert.equal(context.identity.jobKey, identity.jobKey);
  assert.equal(context.civilInterval,null);
  assert.equal(context.events.length,0); assert.equal(context.retained,false);
  assert.equal(journal.snapshot(),before); assert.equal(p.events.length,eventCount);
  assert.equal(journal.contextFor(Object.assign({},marker,{identity:null})).available,false);
  assert.equal(journal.contextFor(Object.assign({},marker,{interval:null})).interval,null);
  assert.deepEqual(plain(journal.contextFor(marker,-1).interval), {fromMonoMs:120,toMonoMs:180});
  assert.equal(journal.contextFor(marker,1e12).interval.toMonoMs,60180,'context padding is capped at one minute');
});

test('bounded retention keeps at most the newest 100 matching events and deduplicates IDs', async () => {
  const {journal, event, update} = await setup();
  const events = Array.from({length:150},(_,i)=>event(i,i));
  const result = update(events,{interval:{fromMonoMs:0,toMonoMs:200}});
  assert.equal(result.events.length,100); assert.equal(result.events[0].id,50); assert.equal(result.events[99].id,149);
  const duplicate = update([event('a',120),event('a',120),event('b',130)]);
  assert.deepEqual(plain(duplicate.events.map(e=>e.id)),['a','b']);
  assert.equal(journal.presentation(duplicate).readOnly,true);
});

test('data sanitization drops callbacks, malformed facts and keeps explicit absence', async () => {
  const {api, journal, event, update} = await setup();
  const cyclic = {category:'command', value:NaN, missing:undefined, callback(){throw Error('never call');}, element:{nodeType:1}};
  cyclic.loop=cyclic;
  const result=update([event('good',120,{params:cyclic}),event('bad-state',130,{state:'machined'}),
    event('bad-source',130,{source:'transport'}),event('bad-time',130,{time:null}),event('no-id',130,{id:null})]);
  assert.equal(result.events.length,1);
  assert.equal(result.events[0].params.value,null);
  assert.equal(result.events[0].params.callback,null);
  assert.equal(result.events[0].params.element,null);
  assert.equal(result.events[0].params.loop,null);
  assert.equal(api.notify('journal'),true);
  assert.equal(journal.snapshot().events[0].time.server.value,null);
});

test('read-only presentation supplies French, English, Spanish and no replay action', async () => {
  const {journal} = await setup();
  const fr=journal.presentation(), en=journal.presentation(undefined,'en'), es=journal.presentation(undefined,'es');
  assert.equal(fr.emptyMessage,'Aucun événement conservé');
  assert.equal(en.emptyMessage,'No retained events');
  assert.equal(es.emptyMessage,'Ningún evento conservado');
  assert.equal(fr.readOnly,true);
  assert.equal(fr.states.confirmed,'Confirmée');
  assert.deepEqual(Object.keys(fr.filters).sort(),['all','command','connection','state']);
  for(const language of ['unknown','toString','__proto__','constructor']) {
    assert.equal(journal.presentation(undefined,language).emptyMessage,'Aucun événement conservé','unknown locale falls back to French');
  }
  assert.equal(journal.replay,undefined); assert.equal(journal.send,undefined); assert.equal(journal.execute,undefined);
});

test('program change releases context; pagehide and gate revocation are terminal', async () => {
  for(const reason of ['program-changed','pagehide','eco']) {
    const {p,journal,event,update}=await setup(); update([event(1,150)]);
    if(reason==='program-changed') p.status({fingerprint:'changed'});
    else if(reason==='pagehide') p.emit('pagehide',{persisted:true});
    else p.window.cncProfile.setPerformance('eco');
    assert.equal(journal.snapshot().events.length,0,reason);
    assert.equal(journal.snapshot().identity,null,reason);
    if(reason==='program-changed') assert.equal(update([event(2,150)]).events.length,1,'explicit next context can be supplied');
    else assert.equal(update([event(2,150)]).events.length,0,'late asynchronous result cannot republish after disposal');
    journal.dispose();journal.dispose();
  }
});

test('module is inert without L0 or when the v2 gate is closed; syntax is ES2017', async () => {
  assert(fs.existsSync(filename),'module exists');
  const source=fs.readFileSync(filename,'utf8');
  assert(!source.includes('\r'),'LF line endings');
  require('acorn').parse(source,{ecmaVersion:2017});
  const p=page({profile:'eco'});p.run('performance-journal-context.js');
  assert.equal(p.requests.length,0);assert.equal(p.frames.size,0);
  const vm=require('vm');vm.runInNewContext(source,{window:{}});
});

(async()=>{
  let failures=0;
  for(const entry of cases) {
    try { await entry.action(); console.log('OK journal '+entry.name); }
    catch(error) { failures++;console.error('FAIL journal '+entry.name+'\n'+error.stack); }
  }
  if(failures) { process.exitCode=1;return; }
  console.log('PASS v2 journal context: '+cases.length+' behaviors; identity, clocks, retention, filters, read-only context and lifecycle.');
})().catch(error=>{console.error(error);process.exitCode=1;});
