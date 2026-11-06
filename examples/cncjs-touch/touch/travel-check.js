(function(root){
  'use strict';
  var uiLocale=(typeof window!=='undefined'&&window.cncI18n)||{t:function(s){return s;}};
  // Before a start: does the program's XY extent, placed at the current work
  // offset, stay inside the machine travel? Stock Grbl 1.1's machine space after
  // homing is [-$13x, 0] per axis whatever the homing direction; with an axis homing
  // the other way ($23 bit) a build with HOMING_FORCE_SET_ORIGIN uses [0, $13x]
  // instead, which the tablet cannot tell: such an axis is not checked (unknown).
  // Only meaningful once homed ($22=1); Z is not in the 2D preview.
  function number(v){var n=typeof v==='string'?Number(v):v;return typeof n==='number'&&isFinite(n)?n:null;}
  function fmt(v){return (Math.round(v*10)/10).toFixed(1).replace('.',',');}
  function check(preview,machine){
    var p=preview&&preview.projection,b=p&&p.bounds,c=machine||{},s=c.settings||{},co=c.coordinates||{};
    function unknown(reason){return {state:'unknown',message:uiLocale.t('Course machine non vérifiée : ')+uiLocale.t(reason)};}
    if(!p||p.units!=='mm'||!Array.isArray(b)||b.length!==4||!b.every(function(v){return number(v)!==null;})||b[2]<b[0]||b[3]<b[1])return unknown('aperçu du fichier indisponible.');
    // A program that starts with relative (G91) moves runs from the tool's current place,
    // not from the work origin the extent is placed at.
    if(p.relativeStart)return unknown('programme en déplacements relatifs (G91) depuis la position de l’outil.');
    // The extent is placed at the active work offset: a program that selects another one
    // (or any one while the active one is unknown) is not placed.
    if(typeof p.programWcs==='string'&&!(c.operator&&c.operator.wcs===p.programWcs))return unknown('le programme choisit un repère qui n’est pas le repère actif connu.');
    if(number(s.$22)!==1)return unknown('prise d’origine désactivée ($22), les coordonnées machine ne sont pas repérées.');
    if(c.operator&&c.operator.reportUnits&&c.operator.reportUnits!=='mm')return unknown('positions rapportées en pouces ($13=1).');
    var mask=number(s.$23)||0,axes=[],outside=[];
    if(mask&3)return unknown('sens de prise d’origine inversé ($23) : selon la compilation du firmware, la course est [−$13x, 0] ou [0, $13x].');
    for(var i=0;i<2;i++){
      var axis=i?'y':'x',travel=number(s['$'+(130+i)]),m=number(co.mpos&&co.mpos[axis]),w=number(co.wpos&&co.wpos[axis]);
      if(travel===null||travel<=0)return unknown(i?'course $131 inconnue.':'course $130 inconnue.');
      if(m===null||w===null)return unknown('position machine inconnue.');
      var offset=m-w,min=b[i]+offset,max=b[i+2]+offset,low=-travel,high=0;
      var entry={axis:axis.toUpperCase(),min:min,max:max,low:low,high:high};
      axes.push(entry);
      if(min<low-0.001||max>high+0.001)outside.push(entry);
    }
    if(outside.length)return {state:'outside',axes:axes,message:uiLocale.t('Hors course machine : ')+outside.map(function(a){
      return a.axis+' '+fmt(a.min)+' → '+fmt(a.max)+' mm ('+uiLocale.t('course ')+fmt(a.low)+' → '+fmt(a.high)+')';
    }).join(' ; ')+uiLocale.t('. Vérifiez l’origine de travail avant de démarrer.')};
    return {state:'ok',axes:axes,message:uiLocale.t('Dans la course machine en X et Y (Z non vérifié ; valable si la prise d’origine a été faite).')+
      (p.returns?' '+uiLocale.t('Retours G28/G30 non vérifiés.'):'')};
  }
  // Writes a result into the confirmation dialog; null hides the line.
  function show(node,result){
    if(!node)return;
    var hidden=!result,text=result?result.message:'',cls='job-travel'+(result?' '+result.state:'');
    if(node.hidden!==hidden)node.hidden=hidden;
    if(node.textContent!==text)node.textContent=text;
    if(node.className!==cls)node.className=cls;
  }
  // Data only (Performance UI, lot O): the machine space after homing, machine frame, for drawing.
  // No rule of its own: the same $22 and $130/$131 refusals as check(); Z drawn only when $132 is known.
  function travelBox(machine){
    var s=(machine||{}).settings||{},mask=number(s.$23)||0,min=[0,0,0],max=[0,0,0],reason='',zKnown=false;
    if(number(s.$22)!==1)reason=uiLocale.t('prise d’origine désactivée ($22), les coordonnées machine ne sont pas repérées.');
    else if(mask&3)reason=uiLocale.t('sens de prise d’origine inversé ($23) : selon la compilation du firmware, la course est [−$13x, 0] ou [0, $13x].');
    for(var i=0;i<3;i++){
      var travel=number(s['$'+(130+i)]);
      if(travel===null||travel<=0){if(i<2&&!reason)reason=uiLocale.t(i?'course $131 inconnue.':'course $130 inconnue.');continue;}
      // Z homing the other way: same uncertainty as X/Y, so Z is not drawn.
      if(i===2){if((mask>>2)&1)continue;zKnown=true;}
      min[i]=-travel;max[i]=0;
    }
    return {known:!reason,min:min,max:max,zKnown:zKnown,reason:reason};
  }
  // check() on a copy of the state where the work position is 0 in X and Y: what the next report
  // would be right after « Zéro X » and « Zéro Y » here. Nothing is sent; only 'xy' exists (Z is never checked).
  function place(preview,machine){
    var c=machine||{},copy={},co=c.coordinates||{},coords={},wpos={};
    Object.keys(c).forEach(function(k){copy[k]=c[k];});
    Object.keys(co).forEach(function(k){coords[k]=co[k];});
    Object.keys(co.wpos||{}).forEach(function(k){wpos[k]=co.wpos[k];});
    wpos.x=0;wpos.y=0;coords.wpos=wpos;copy.coordinates=coords;
    return check(preview,copy);
  }
  var api={check:check,show:show,travelBox:travelBox,place:place};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.CNCTravelCheck=api;
})(typeof window==='object'?window:this);
