'use strict';
// The shared primary slot owns Pause/Resume's double-tap guard; Stop remains immediate.
const assert=require('assert').strict;
(async()=>{
 const q=require('./test-reprise-volet.cjs').setup(),sent=[];
 for(const op of ['pause','resume','stop'])q.window.cncJobControls[op]=()=>{sent.push(op);return Promise.resolve();};
 q.send({workflow:'running',activeState:'Run',canPause:true,canStop:true});q.advance(650);q.node('step-home-main').click();assert.deepEqual(sent,['pause']);
 q.send({workflow:'paused',activeState:'Hold',canPause:false,canStop:true,canResume:true});q.advance(150);q.node('step-home-main').click();assert.deepEqual(sent,['pause'],'a second tap cannot reach Resume');
 q.node('home-job-stop').click();assert.deepEqual(sent,['pause','stop'],'Stop never waits');q.advance(500);q.node('step-home-main').click();assert.deepEqual(sent,['pause','stop','resume']);
 q.send({workflow:'paused',activeState:'Idle',canResume:false,resumeReason:'La carte a redémarré.'});assert(q.node('step-home-main').disabled);assert.equal(q.node('home-notice-text').textContent,'La carte a redémarré.');
 for(const lang of ['fr','en','es']){const f=require('./check-page-fixture.cjs').fixture(lang);f.run('job-resume.js');f.window.cncShell.go('home');f.send({workflow:'paused',canResume:false,resumeReason:'Palpage en cours.'});assert.equal(f.node('home-notice-text').textContent,f.window.cncI18n.message('Palpage en cours.'));}
 console.log('PASS primary slot: Pause, double-tap protected Resume, immediate Stop, refused resume reason and FR/EN/ES.');
})().catch(e=>{console.error(e);process.exitCode=1;});
