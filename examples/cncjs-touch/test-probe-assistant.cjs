'use strict';
const assert=require('assert').strict,fs=require('fs');
const {fixture,profile}=require('./probe-page-fixture.cjs');
const model=require('./touch/probe-model.js');
require('@babel/register')({babelrc:false,configFile:false,cache:false,plugins:['@babel/plugin-transform-modules-commonjs'],only:[/src/],ignore:[/node_modules/]});
const {blockParams}=require('../../src/server/services/touch/block-probe.js');
(async()=>{
 for(const corner of ['--','+-','-+','++']){
  const p=model.fromCorner(model.empty(),corner,9.9,12);
  assert.equal(p.directionX,corner[0]==='-'?1:-1);assert.equal(p.directionY,corner[1]==='-'?1:-1);
  assert.equal(p.faceX,-p.directionX*9.9);assert.equal(p.faceY,-p.directionY*12);
  // The exact invariant enforced by block-probe.js validateProfile.
  assert.equal(Math.sign(p.faceX),-p.directionX);assert.equal(Math.sign(p.faceY),-p.directionY);
  const accepted=blockParams(require('./touch/probe-real.js').request({...p,thickness:5},'XYZ',6,'G54'));assert.equal(accepted.faceX,p.faceX);assert.equal(accepted.directionY,p.directionY);
  const q=fixture({empty:true});q.node('probe-start').click();assert.equal(q.document.querySelectorAll('[data-corner]').length,8);
  q.document.querySelector('button[data-corner="'+corner+'"]').click();
  for(const name of ['thickness','wallX','wallY','diameter'])assert.equal(q.node('probe-measure-'+name).value,'','no proposed physical dimension');
  assert(q.node('probe-setup-save').disabled);q.input('probe-measure-thickness',5);q.input('probe-measure-wallX',9.9);q.input('probe-measure-wallY',12);q.input('probe-measure-diameter',6);
  assert(!q.node('probe-setup-save').disabled);q.node('probe-setup-save').click();await q.flush();assert.equal(q.calls.at(-1).op,'blockProbe');assert.equal(q.calls.at(-1).body.profile.faceX,p.faceX);assert.equal(q.calls.at(-1).body.profile.faceY,p.faceY);
  assert(q.pads.filter(x=>/^probe-measure/.test(x.input.id)).every(x=>x.rules.dock==='right'&&x.rules.negative===false));
 }
 const q=fixture({empty:true});q.document.querySelector('[data-probe-operation="Z"]').click();q.node('probe-start').click();assert(q.node('probe-measure-thickness'));assert.equal(q.node('probe-measure-wallX'),null);assert.equal(q.node('probe-measure-diameter'),null);
 q.send({canBlockProbe:false,probeInput:{fresh:true,ageMs:0,state:'contact',code:'EXPLICIT',test:{stage:'contact',done:false}}});assert(!q.node('probe-setup-instruction').hidden);assert(q.node('probe-setup-checks').textContent.startsWith('☑'));
 q.send({probeInput:{fresh:true,ageMs:0,state:'free',code:'EXPLICIT',test:{stage:'free',done:true}}});assert(q.node('probe-setup-instruction').hidden);
 const r=fixture();r.node('probe-setup-open').click();assert.equal(r.node('probe-setup-save').textContent,'Enregistrer');assert(r.node('probe-setup-instruction').hidden);r.input('probe-measure-thickness',6);r.node('probe-setup-save').click();await r.flush();assert.equal(r.calls.length,0);
 for(const axis of ['X','Y']){const single=fixture({empty:true});single.document.querySelector('[data-probe-operation="'+axis+'"]').click();single.node('probe-start').click();single.document.querySelector('button[data-corner="--"]').click();assert(single.node('probe-measure-wall'+axis));assert(single.node('probe-measure-diameter'));assert.equal(single.node('probe-measure-thickness'),null);assert.equal(single.node('probe-measure-wall'+(axis==='X'?'Y':'X')),null);}
 assert.equal(profile.fast,100);assert.equal(model.empty().slow,25);assert.equal(model.empty().thickness,null);
 const css=fs.readFileSync(__dirname+'/touch/probe.css','utf8');assert(/data-dock="right"[^}]*background:transparent;justify-content:flex-end/.test(css));assert(/zero-measures\{display:grid;grid-template-columns:minmax\(260px,400px\)/.test(css));
 console.log('PASS probe assistant: four corners/signs, empty physical fields, Z thickness only, persisted defaults, contact checkboxes, Save vs Save and probe, right-docked numeric fields.');
})().catch(e=>{console.error(e);process.exitCode=1;});
