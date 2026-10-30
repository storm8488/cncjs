(function () {
  'use strict';
  var key='cncjs-touch-language-v1', language='fr', messages=Object.create(null);
  try { var saved=localStorage.getItem(key); if(saved==='en'||saved==='es')language=saved; } catch (_) {}
  // Rows are found by their trimmed text: a phrase written with its outer
  // spaces (' tr/min', 'Confirmer : ') keeps the caller's spaces around it.
  (window.CNCTouchMessages||[]).forEach(function(row){messages[row[0].trim().replace(/\s+/g,' ')]=row;});
  function text(value) {
    if(typeof value!=='string'||language==='fr')return value;
    var parts=/^(\s*)([\s\S]*?)(\s*)$/.exec(value), row=messages[parts[2].replace(/\s+/g,' ')];
    if(!row)return value;
    // Written exactly as in the catalog: the translation as written there (French
    // puts spaces inside « », English “” and Spanish «» do not).
    if(row[0]===value)return row[language==='en'?1:2];
    return parts[1]+row[language==='en'?1:2].trim()+parts[3];
  }
  function message(value){
    if(typeof value!=='string')return value;
    var prefix='SIMULATION — ';
    return value.indexOf(prefix)===0?text(prefix)+text(value.slice(prefix.length)):text(value);
  }
  function escape(value){return value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  // Server refusals with a stable code (ETOUCH_*): [code, fr, en, es] templates with {name}
  // values and [optional parts] dropped when one of their values is null. A string value is
  // trimmed, stripped of control characters and capped; it is never re-read as a template.
  // The result is plain text: callers write it with textContent, never with innerHTML (it
  // is not HTML-escaped, so « A&B » is shown as written, not as « A&amp;B »). Unknown code, missing value or no row: the server's French message, through
  // message(); never an empty text.
  var templates=Object.create(null);
  (window.CNCTouchCodes||[]).forEach(function(row){templates[row[0]]=row;});
  function value(params,name){
    var v=params&&typeof params==='object'&&Object.prototype.hasOwnProperty.call(params,name)?params[name]:undefined;
    if(typeof v==='number')return isFinite(v)?String(v):undefined;
    if(typeof v==='string'){v=v.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,64);return v?v:undefined;}
    return v===null?null:undefined;
  }
  function format(code,params,fallback){
    var server=typeof fallback==='string'&&fallback.trim()?fallback:'';
    var row=typeof code==='string'?templates[code]:null,missing=false;
    if(row&&!(language==='fr'&&server)){
      var fill=function(part){return part.replace(/\{([A-Za-z]+)\}/g,function(all,name){var v=value(params,name);if(v===undefined||v===null){missing=true;return all;}return v;});};
      // One pass over the template: an inserted value is never read again.
      var out=row[language==='en'?2:language==='es'?3:1].replace(/\[([^\]]*)\]|\{[A-Za-z]+\}/g,function(all,part){
        if(part===undefined)return fill(all);
        var names=part.match(/\{[A-Za-z]+\}/g)||[];
        return names.some(function(n){return value(params,n.slice(1,-1))===null;})?'':fill(part);
      });
      if(!missing)return out;
    }
    return server?message(server):text('Refus du serveur sans détail.');
  }
  // Called only for developer-authored markup literals, never for uploaded files or profile names.
  function html(value) {
    if(language==='fr')return value;
    return value.replace(/\b(aria-label|title|alt|placeholder)="([^"]*)"/g,function(all,name,label){var translated=text(label);return translated===label?all:name+'="'+escape(translated)+'"';})
      .replace(/(^|>)([^<]*)(?=<|$)/g,function(all,prefix,label){var translated=text(label);return translated===label?all:prefix+escape(translated);});
  }
  // Translate the server's initial, static HTML once, before application scripts mount.
  // Dynamic views translate at their rendering source; there is no DOM translation observer.
  function staticText(node) {
    if(node.nodeType===3){var next=text(node.nodeValue);if(next!==node.nodeValue)node.nodeValue=next;return;}
    if(node.nodeType!==1||/^(SCRIPT|STYLE)$/.test(node.tagName))return;
    ['aria-label','title','alt','placeholder'].forEach(function(name){var value=node.getAttribute(name);if(value){var next=text(value);if(next!==value)node.setAttribute(name,next);}});
    if(/^(TEXTAREA|INPUT)$/.test(node.tagName))return;
    for(var child=node.firstChild;child;child=child.nextSibling)staticText(child);
  }
  function save(value){if(['fr','en','es'].indexOf(value)<0)return false;try{localStorage.setItem(key,value);return localStorage.getItem(key)===value;}catch(_){return false;}}
  window.cncI18n={t:text,message:message,format:format,html:html,language:language,locale:{fr:'fr-FR',en:'en-GB',es:'es-ES'}[language],save:save};
  document.documentElement.lang=language;
  document.title=text(document.title);
  if(document.body)staticText(document.body);
})();
