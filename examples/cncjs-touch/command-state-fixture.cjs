'use strict';
// Read-only test adapter for the published command state; no hidden DOM controls.
module.exports=function probe(window,id){
 const c=window.cncJobControls,s=c.state(),m=s.machine,h=s.halt,online=!!m,p=s.pilot||{};
 if(id==='job-feedback'||id==='home-job-feedback')return {get textContent(){return c.state().feedback||'';},getAttribute:k=>k==='data-state'?c.state().feedbackState:null};
 const op=id.replace(/^home-job-|^job-/,''),disabled=op==='pause'?!(online?m.canPause:h&&h.canPause):op==='stop'?!(online?m.canStop||m.motion&&(m.motion.jog||m.motion.cancelling):h&&h.canStop):!!(s.busy||!m||p.state==='other'||!m.canResume);
 return {disabled,click(){if(!disabled)return c[op]();},focus(){},setAttribute(){}};
};
