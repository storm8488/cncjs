(function(root){
  'use strict';
  var uiLocale=(typeof window!=='undefined'&&window.cncI18n)||{t:function(s){return s;}};
  // Plain-language help for Grbl 1.1 alarm and error codes (alarms 1-9 are the
  // same on Grbl_ESP32) and errors 1-38 of Grbl 1.1. Written for this interface; other
  // codes (another firmware's) get a generic line.
  var ALARMS={
    1:['Fin de course touchée','Position perdue. Carte sans réponse : Reset dans CNCjs au PC. Dégagez l’axe (à la main, ou au jog après $X), puis prise d’origine ($H).'],
    2:['Limite logicielle dépassée','Hors course machine ($130–$132). Carte sans réponse : Reset dans CNCjs au PC. Vérifiez l’origine de travail et le programme, puis déverrouillez ($X).'],
    3:['Réinitialisation pendant un mouvement','Un arrêt ou une réinitialisation a coupé un déplacement : la position peut être fausse. Refaites la prise d’origine ($H) avant de reprendre.'],
    4:['Sonde déjà en contact au départ','Vérifiez la sonde, son câble et l’entrée sonde avant de recommencer le palpage.'],
    5:['Palpage sans contact','La sonde n’a rien touché sur la distance prévue. Rapprochez l’outil de la pièce ou augmentez la distance de recherche.'],
    6:['Prise d’origine interrompue','Une réinitialisation a arrêté la prise d’origine. Relancez-la ($H).'],
    7:['Prise d’origine interrompue : porte ouverte','Fermez la porte puis relancez la prise d’origine ($H).'],
    8:['Prise d’origine : capteur toujours appuyé','Le dégagement n’a pas libéré le capteur. Augmentez le dégagement ($27) ou vérifiez le câblage du capteur.'],
    9:['Prise d’origine : capteur non trouvé','Vérifiez le capteur et son câblage, le sens de recherche ($23) et la course ($130–$132).']
  };
  var ERRORS={
    1:['Ligne sans lettre de commande','Ligne mal formée dans le programme ou altérée pendant l’envoi.'],
    2:['Nombre mal écrit','Ligne mal formée ou altérée pendant l’envoi : vérifiez le fichier et la liaison.'],
    3:['Commande $ inconnue','Cette commande système n’existe pas sur cette carte.'],
    8:['Commande refusée hors repos','Cette commande $ n’est acceptée que machine au repos (Idle).'],
    9:['G-code bloqué par une alarme ou un jog','Déverrouillez ($X) ou attendez la fin du déplacement manuel.'],
    15:['Déplacement manuel hors course','La destination dépasse la course de la machine ($130–$132).'],
    20:['Commande non prise en charge','Grbl ne connaît pas cette commande : retirez-la ou changez le post-processeur.'],
    22:['Avance non définie','Ajoutez une avance F avant le premier G1, G2 ou G3.'],
    24:['Deux commandes de mouvement sur une ligne','Ligne mal formée ou deux lignes fusionnées pendant l’envoi : vérifiez le fichier et la liaison.'],
    25:['Mot répété sur une ligne','Une même lettre apparaît deux fois sur la ligne : corrigez le programme.'],
    26:['Mouvement sans coordonnées','Un G0, G1, G2 ou G3 sans X, Y ni Z : corrigez le programme.'],
    33:['Arc ou cible invalide','Vérifiez les arcs (rayon, centre I/J/K) produits par le post-processeur.'],
    4:['Valeur négative refusée','Ce réglage ou cette commande n’accepte pas de valeur négative.'],
    5:['Prise d’origine non activée','La prise d’origine ($H) demande $22=1 dans les réglages de la carte.'],
    6:['Impulsion de pas trop courte','Le réglage $0 doit valoir au moins 3 µs.'],
    7:['Réglages illisibles, valeurs par défaut','La mémoire de la carte n’a pas pu être lue : vérifiez tous les réglages ($$) avant d’usiner.'],
    10:['Limites logicielles sans prise d’origine','Les limites logicielles ($20) exigent la prise d’origine activée ($22).'],
    11:['Ligne trop longue pour Grbl','La ligne dépasse la taille acceptée par Grbl : raccourcissez-la ou changez le post-processeur.'],
    12:['Vitesse de pas trop élevée','La vitesse demandée dépasse ce que la carte peut produire : réduisez l’avance ou les pas par mm.'],
    13:['Porte de sécurité ouverte','La porte de sécurité est ouverte : fermez-la avant de continuer.'],
    14:['Ligne de démarrage trop longue','Une ligne de démarrage ($N) ou d’information dépasse la place disponible en mémoire.'],
    16:['Commande de déplacement manuel invalide','La commande de jog est mal formée ou contient un mot interdit.'],
    17:['Mode laser sans sortie PWM','Le mode laser ($32) demande une sortie de broche PWM.'],
    21:['Deux commandes du même groupe','La ligne contient deux commandes G ou M incompatibles (même groupe modal) : corrigez le programme.'],
    23:['Valeur de commande non entière','Une commande G ou M a une valeur non entière que Grbl ne connaît pas.'],
    27:['Numéro de ligne invalide','Le mot N de la ligne est hors plage : retirez les numéros de ligne ou corrigez-les.'],
    28:['Valeur requise absente','Une commande attend une valeur qui manque (par exemple P pour G4, ou L/P pour G10).'],
    29:['Repère G59.x non pris en charge','Grbl ne connaît que G54 à G59 : changez le repère dans le programme.'],
    30:['G53 hors G0 ou G1','G53 n’est accepté qu’avec un déplacement G0 ou G1.'],
    31:['Coordonnées sans commande','La ligne donne X, Y ou Z sans commande qui les utilise : corrigez le programme.'],
    32:['Arc sans axe dans le plan','Un G2 ou G3 doit donner au moins un axe du plan choisi (G17, G18 ou G19).'],
    34:['Rayon d’arc invalide','Le rayon R ne relie pas les deux extrémités de l’arc : vérifiez le post-processeur.'],
    35:['Arc sans centre dans le plan','Un G2 ou G3 en mode centre doit donner I, J ou K dans le plan choisi.'],
    36:['Mots inutilisés sur la ligne','La ligne contient des valeurs qu’aucune commande n’utilise : corrigez le programme.'],
    37:['Correction d’outil G43.1 sur un autre axe','G43.1 ne s’applique qu’à l’axe de longueur d’outil configuré (Z).'],
    38:['Numéro d’outil trop grand','Le numéro d’outil T dépasse la valeur acceptée par la carte.']
  };
  // inferred: the code was wiped by the board's restart banner and deduced from the state just
  // before (job-controls.js, ALARM:3 after a reset during a move); the title says so.
  function entry(table,code,kind,inferred){
    var n=typeof code==='number'&&isFinite(code)?code:null,row=n!==null&&Object.prototype.hasOwnProperty.call(table,n)?table[n]:null;
    var label=kind==='alarm'?(n===null?uiLocale.t('Alarme'):uiLocale.t('Alarme ')+n+(inferred?uiLocale.t(' (code effacé au redémarrage de la carte, déduit de l’état précédent)'):'')):uiLocale.t('Erreur ')+(n===null?'?':n);
    if(row)return {code:n,title:label+' : '+uiLocale.t(row[0]),action:uiLocale.t(row[1])};
    if(kind==='alarm'&&n===null)return {code:null,title:label,action:uiLocale.t('Code non reçu. Si la carte demande la prise d’origine ou le déverrouillage, faites $H (ou $X) ; sinon consultez CNCjs.')};
    return {code:n,title:label,action:uiLocale.t('Code propre à la carte : consultez sa documentation.')};
  }
  function text(help){return help.title+'. '+help.action;}
  var api={
    alarm:function(code,inferred){return entry(ALARMS,code,'alarm',!!inferred);},
    error:function(code){return entry(ERRORS,code,'error');},
    text:text,
    codes:{alarms:Object.keys(ALARMS).map(Number),errors:Object.keys(ERRORS).map(Number)},
    rows:function(){var out=[];[ALARMS,ERRORS].forEach(function(t){Object.keys(t).forEach(function(k){out.push(t[k][0],t[k][1]);});});return out;}
  };
  if(typeof module==='object'&&module.exports)module.exports=api;else root.CNCGrblHelp=api;
})(typeof window==='object'?window:this);
