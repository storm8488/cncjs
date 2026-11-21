(function(root){
  'use strict';
  var uiLocale=(typeof window!=='undefined'&&window.cncI18n)||{t:function(s){return s;},html:function(s){return s;}};
  // Drawing coordinates are illustrative pixels, never machine positions or a trajectory.
  function describe(profile,operation,diameter){
    var p=profile||{},valid=['Z','X','Y','XYZ'].indexOf(operation)>=0;
    var x=valid&&operation.indexOf('X')>=0,y=valid&&operation.indexOf('Y')>=0,z=valid&&operation.indexOf('Z')>=0;
    var corner=['--','+-','-+','++'].indexOf(p.corner)>=0?p.corner:null;
    var cx=corner?(corner[0]==='-'?70:210):null,cy=corner?(corner[1]==='-'?125:50):null;
    function direction(v){return v===1?1:v===-1?-1:null;}
    function sign(v){return v===1?'+':v===-1?'−':' ?';}
    function number(v,min,max){return typeof v==='number'&&isFinite(v)&&v>=min&&v<=max?String(v).replace('.',',')+' mm':uiLocale.t('à renseigner');}
    var dx=direction(p.directionX),dy=direction(p.directionY);
    var cornerLabel=corner?'X'+(corner[0]==='-'?'−':'+')+' / Y'+(corner[1]==='-'?'−':'+'):uiLocale.t('Coin : à définir');
    return {corner:corner,cx:cx,cy:cy,cornerLabel:cornerLabel,
      edgeX:corner&&x?'M'+cx+' 50V125':'',edgeY:corner&&y?'M70 '+cy+'H210':'',
      arrowX:x&&dx?(dx===1?'M85 148H195L188 142M195 148L188 154':'M195 148H85L92 142M85 148L92 154'):'',
      arrowY:y&&dy?(dy===1?'M35 115V65L29 72M35 65L41 72':'M35 65V115L29 108M35 115L41 108'):'',
      labelX:x?uiLocale.t('Sens X')+sign(dx):uiLocale.t('X non sélectionné'),labelY:y?'Y'+sign(dy):'Y —',z:z,
      thickness:uiLocale.t('Épaisseur : ')+number(p.thickness,0.001,100),tool:uiLocale.t('Outil Ø : ')+number(diameter,0.01,100),
      description:uiLocale.t('Schéma de principe, sans échelle. ')+(corner?uiLocale.t('Coin '):'')+cornerLabel+'. '+(x?uiLocale.t('Recherche X')+sign(dx)+'. ':'')+(y?uiLocale.t('Recherche Y')+sign(dy)+'. ':'')+(z?uiLocale.t('Z vers le bas sur une plaque posée au-dessus. '):'')+uiLocale.t('Aucun trajet calculé.')};
  }
  function attach(host,options){
    if(options&&options.mode)return attachWork(host,options);
    host.innerHTML=uiLocale.html('<svg class="probe-diagram probe-config-diagram" viewBox="0 0 480 180" role="img">')+
      uiLocale.html('<text x="10" y="18">XY · vue de dessus</text><text x="270" y="18">Z · vue de côté</text>')+
      uiLocale.html('<path class="probe-piece" d="M70 50H210V125H70Z"/><text x="140" y="80" text-anchor="middle">Pièce</text><text data-part="corner-label" x="140" y="104" text-anchor="middle"></text>')+
      uiLocale.html('<path data-part="edge-x" class="probe-face"/><path data-part="edge-y" class="probe-face"/><circle data-part="corner" r="5" class="probe-corner"/>')+
      uiLocale.html('<path data-part="arrow-x" class="probe-direction"/><path data-part="arrow-y" class="probe-direction"/><text data-part="label-x" x="140" y="174" text-anchor="middle"></text><text data-part="label-y" x="35" y="40" text-anchor="middle"></text>')+
      uiLocale.html('<g data-part="z"><path class="probe-piece" d="M310 110H420V135H310Z"/><path class="probe-plate" d="M310 100H420V110H310Z"/><path d="M358 43V76H372V43"/><path class="probe-direction" d="M365 80V94L359 88M365 94L371 88"/><text x="405" y="87">Z−</text><text x="365" y="37" text-anchor="middle">Outil / pige</text></g>')+
      uiLocale.html('<text data-part="thickness" x="365" y="155" text-anchor="middle"></text><text data-part="tool" x="365" y="174" text-anchor="middle"></text></svg>');
    var svg=host.querySelector('svg'),last='';
    function part(name){return host.querySelector('[data-part="'+name+'"]');}
    return {update:function(p,operation,diameter){
      var data=describe(p,operation,diameter),key=JSON.stringify(data);if(key===last)return false;last=key;
      svg.setAttribute('aria-label',data.description);
      ['edgeX','edgeY','arrowX','arrowY'].forEach(function(k){part(k.replace(/([XY])/,'-$1').toLowerCase()).setAttribute('d',data[k]);});
      part('corner').setAttribute('visibility',data.corner?'visible':'hidden');
      part('corner').setAttribute('cx',data.cx===null?0:data.cx);part('corner').setAttribute('cy',data.cy===null?0:data.cy);
      part('z').setAttribute('opacity',data.z?'1':'0.35');
      [['corner-label','cornerLabel'],['label-x','labelX'],['label-y','labelY'],['thickness','thickness'],['tool','tool']].forEach(function(pair){part(pair[0]).textContent=data[pair[1]];});
      return true;
    }};
  }
  function caption(operation){return uiLocale.t(operation==='XYZ'?'Fraise au-dessus du coin du bloc, loin du trou.':operation==='Z'?'Fraise au-dessus du bloc.':'Fraise à côté de la face, à mi-hauteur du bloc.');}
  function attachWork(host,options){
    // Illustrative SVG pixels only. All numerical clearances come from the server ticket.
    host.innerHTML='<svg class="probe-start-diagram" viewBox="0 0 340 180" role="img"><defs><pattern id="probe-zone-hatch-'+options.mode+'" width="7" height="7" patternUnits="userSpaceOnUse"><path d="M0 7L7 0" class="probe-zone-line"/></pattern></defs><rect class="probe-piece" x="66" y="20" width="250" height="125" rx="3"/><g data-probe-drawing><rect class="probe-plate" x="40" y="60" width="150" height="100" rx="4"/><circle class="probe-hole" cx="150" cy="90" r="20"/><path class="probe-hole-cross" d="M135 75L165 105M165 75L135 105"/><rect class="probe-start-zone" x="44" y="112" width="55" height="44" fill="url(#probe-zone-hatch-'+options.mode+')"/><circle class="probe-tool" cx="68" cy="130" r="7"/><path data-draw-x class="probe-direction" d="M60 130H15L23 124M15 130L23 136"/><path data-draw-y class="probe-direction" d="M68 139V173L62 165M68 173L74 165"/><text data-draw-z x="80" y="135">Z↓</text></g></svg><p class="probe-start-caption"></p><p class="probe-plan-dimensions"></p>';
    var svg=host.querySelector('svg'),group=host.querySelector('[data-probe-drawing]'),legend=host.querySelector('.probe-start-caption'),dimensions=host.querySelector('.probe-plan-dimensions'),last='';
    return {caption:function(value){legend.textContent=value;},update:function(p,op,diameter,ticket){
      var signature=JSON.stringify([p,op,diameter,ticket]);if(last===signature)return false;last=signature;
      var corner=p&&p.corner||'--',right=corner[0]==='+',rear=corner[1]==='+';
      group.setAttribute('transform','translate('+(right?340:0)+' '+(rear?180:0)+') scale('+(right?-1:1)+' '+(rear?-1:1)+')');
      ['X','Y','Z'].forEach(function(a){host.querySelector('[data-draw-'+a.toLowerCase()+']').setAttribute('visibility',op.indexOf(a)>=0?'visible':'hidden');});
      legend.textContent=caption(op);svg.setAttribute('aria-label',caption(op));
      var b=ticket||{},lines=[];
      if(options.mode==='plan'){
        if(op==='XYZ'&&typeof b.window==='number')lines.push(uiLocale.t('À moins de {window} mm des deux bords.').replace('{window}',String(b.window)));
        if(typeof b.lateral==='number'&&typeof b.depth==='number')lines.push(uiLocale.t('La fraise sort de {lateral} mm de chaque côté, puis descend de {depth} mm sous le dessus du bloc.').replace('{lateral}',String(b.lateral)).replace('{depth}',String(b.depth)));
        if(typeof b.reach==='number')lines.push(uiLocale.t('Rien ne doit dépasser à moins de {reach} mm de la fraise.').replace('{reach}',String(b.reach)));
        legend.textContent=uiLocale.t('Le dessin montre où placer la fraise. Il ne voit pas le bloc.');
      }
      dimensions.textContent=lines.join(' ');dimensions.hidden=!lines.length;return true;
    }};
  }
  var api={describe:describe,attach:attach,caption:caption};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.CNCProbeDiagram=api;
})(typeof window==='object'?window:this);

