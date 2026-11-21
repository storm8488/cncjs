(function(){
  'use strict';
  var uiLocale=window.cncI18n||{t:function(s){return s;},html:function(s){return s;}};
  var simulation=document.body.getAttribute('data-simulation')==='true';
  var panel=document.createElement('section');panel.id='screen-guide';panel.className='screen';
  panel.innerHTML=uiLocale.html('<div class="card wide ks-panel-intro"><div><h2>Prendre en main CNCjs Touch</h2><p>Mode actuel : ')+(simulation?uiLocale.t('simulation'):uiLocale.t('interface réelle'))+uiLocale.html('</p></div><button type="button" class="ks-secondary" id="guide-back">← Plus</button></div>')+
    uiLocale.html('<div class="wide ks-guide-tabs" role="group" aria-label="Rubriques du guide"><button type="button" data-guide-page="0">Machine</button><button type="button" data-guide-page="1">Fichier</button><button type="button" data-guide-page="2">Zéro pièce</button><button type="button" data-guide-page="3">Contrôle</button><button type="button" data-guide-page="4">Usinage</button><button type="button" data-guide-page="5">Après un incident</button><button type="button" data-guide-page="6">La sonde</button></div><div class="card" id="guide-left"></div><div class="card" id="guide-right"></div>');
  document.querySelector('main').appendChild(panel);
  var pages=[
    [['1 · Machine','Connectez la machine, puis prenez la main.','Dégagez la table avant la prise d’origine machine.','Relire les réglages ne déplace pas la machine.'],['Avant de bouger','La main : ici signifie que cet appareil peut commander.','Pause et Arrêter restent possibles depuis chaque appareil.','L’arrêt logiciel ne remplace pas l’arrêt physique.']],
    [['2 · Fichier','Choisissez un fichier pour voir son emprise et sa profondeur.','Charger ce fichier ne démarre aucun mouvement.','Un dépassement se corrige avant le départ.'],['Choisi et chargé','Choisir un aperçu ne remplace pas le fichier chargé.','Ajoutez vos fichiers depuis le PC ou cette tablette.','Le contrôle utilise le zéro pièce actuel.']],
    [['3 · Zéro pièce','Déplacez la fraise avec les flèches et le pas choisi.','Posez les zéros ici, à la plaque ou au bloc.','Ma sonde contient les mesures de votre bloc.'],['Comprendre l’origine','L’origine machine donne les limites des déplacements.','Le zéro pièce place le fichier sur la pièce.','Après une prise d’origine, attendez la vérification du zéro pièce.']],
    [['4 · Contrôle','Vérifiez l’emprise, la profondeur et le zéro pièce.','Trop bas : relevez la pièce, puis refaites le zéro Z.','Course non vérifiée : vérifiez à la main que le fichier tient.'],['Avant le départ','Dégagez les brides et préparez l’aspiration.','Vérifiez le nom du fichier chargé.','La case confirme votre présence devant la machine.']],
    [['5 · Usinage','Pause suspend le travail. Reprendre le poursuit après confirmation.','Arrêter interrompt le travail. Une reprise doit être préparée.','Vitesse, Broche et Rapides changent les corrections autorisées.'],['Pendant et après',simulation?'Les déplacements et le palpage sont simulés.':'Gardez la main près de l’arrêt physique.','Le point bleu indique la position pièce connue.','En changement d’outil, refaites le zéro Z à la plaque si nécessaire.','Après la fin, rechargez le fichier pour recommencer.']],
    [['Après un incident','Dans Machine, lisez ce qui s’est passé.','Déverrouillez, puis refaites la prise d’origine si elle est demandée.','Vérifiez le zéro pièce avant de préparer la reprise.'],['Garder une trace','Reprendre à une ligne utilise le fichier arrêté.','Journal conserve les événements de cette page et l’historique du serveur.','Exportez le journal de cette page avant de la recharger.']],
    [['La sonde','Dans Zéro pièce, ouvrez Tester.','Touchez le bloc avec la fraise, puis écartez-le.','Contact permanent : débranchez la broche, puis recommencez le test.'],['Confort et profils','Ma sonde permet de sauvegarder et transférer vos profils.','Plus → Réglages donne accès au texte, à l’affichage et au système.','La veille est suspendue pendant un travail. Le premier toucher réveille l’écran.']]
  ];
  pages=pages.map(function(columns){return columns.map(function(lines){return lines.map(function(line){return uiLocale.t(line);});});});
  var shortcuts=[{screen:'machine',label:uiLocale.t('Ouvrir Machine →')},{screen:'history',label:uiLocale.t('Ouvrir Journal →')},{screen:'files',label:uiLocale.t('Ouvrir Fichiers →')}];
  var current=-1;
  function show(index){if(index===current||!pages[index])return;current=index;
    ['guide-left','guide-right'].forEach(function(id,column){var host=document.getElementById(id);host.textContent='';pages[index][column].forEach(function(value,n){var el=document.createElement(n?'p':'h2');el.textContent=value;host.appendChild(el);});});
    if(index===5) shortcuts.forEach(function(item,n){var b=document.createElement('button');b.type='button';b.className='ks-secondary ks-guide-shortcut';b.textContent=item.label;b.addEventListener('click',function(){window.dispatchEvent(new CustomEvent('cnc-navigate',{detail:item.screen}));});document.getElementById(n?'guide-right':'guide-left').appendChild(b);});
    panel.querySelectorAll('[data-guide-page]').forEach(function(b){b.setAttribute('aria-pressed',String(Number(b.getAttribute('data-guide-page'))===index));});
  }
  panel.querySelectorAll('[data-guide-page]').forEach(function(b){b.addEventListener('click',function(){show(Number(b.getAttribute('data-guide-page')));});});
  document.getElementById('guide-back').addEventListener('click',function(){window.dispatchEvent(new CustomEvent('cnc-navigate',{detail:'more'}));});
  var entry=document.createElement('button');entry.type='button';entry.id='display-guide';entry.className='ks-secondary';entry.textContent=uiLocale.t('Guide d’utilisation');
  entry.addEventListener('click',function(){window.dispatchEvent(new CustomEvent('cnc-navigate',{detail:'guide'}));});
  document.querySelector('#screen-settings .ks-panel-intro').appendChild(entry);show(0);
})();
