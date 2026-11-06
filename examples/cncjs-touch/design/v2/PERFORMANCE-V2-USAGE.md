# Interface Performance v2 — guide de l’opérateur

Ce guide s’adresse à la personne qui conduit la CNC depuis la tablette Surface Pro 3 (écran 1366 × 911 à l’échelle 1,58). Il explique comment activer et désactiver la v2, comment lire chaque écran et ce que la v2 ne fait pas.

La v2 change la **présentation**. Elle ne change pas les commandes :

- Pause et Arrêter restent dans le bandeau du haut, à la même place.
- Démarrer et Reprendre gardent leur confirmation.
- Les zéros gardent la leur.
- Aucun geste sur un dessin ne déplace la machine.
- Arrêter est un arrêt logiciel. Il ne remplace pas l’arrêt d’urgence matériel.

## 1. Activer ou désactiver la v2

### Conditions

La v2 ne s’ouvre que si quatre conditions sont réunies :

1. le profil **Performance** est choisi (Réglages › Affichage) ;
2. la machine est déclarée **CNC** (le laser garde sa vue 2D) ;
3. le **GPU matériel** est reconnu par le test existant (pas de rendu logiciel) ;
4. la fenêtre est **large** : au moins 1300 × 880 px CSS, en paysage (le poste large).

Si une condition manque, l’entrée « Interface Performance v2 » n’apparaît pas dans Réglages et l’interface reste exactement celle d’avant. C’est le cas sur la Surface RT, en Éco, sur une tablette plus petite et en rendu logiciel.

### Activer

1. Machine au repos, sans travail en cours.
2. **Réglages › Interface Performance v2 · Cette tablette** : touchez le bouton. Il passe à « Activée ».
3. Le message « Changement préparé pour la prochaine session au repos » s’affiche, dans Réglages et dans le bandeau. **La page ne se recharge pas** et rien ne bouge.
4. La v2 s’ouvre à la **prochaine ouverture de l’interface**, machine au repos avec un rapport récent. Rechargez donc l’interface vous-même au repos, ou attendez le prochain démarrage du kiosque.

Si l’interface s’ouvre alors qu’un travail tourne, ou si l’état de la machine est inconnu, la v2 ne s’ouvre pas pendant cette session : elle attendra une ouverture au repos.

Le choix est mémorisé dans ce navigateur seulement (clé `cncjs-touch-performance-ui-v2`). Si le navigateur refuse de l’enregistrer, Réglages affiche « Changement non enregistré : stockage du navigateur indisponible. ».

### Désactiver

- **Réglages › Interface Performance v2** : touchez le bouton, il passe à « Désactivée ». Les calculs et la scène v2 s’arrêtent tout de suite. **La disposition reste celle de la v2 jusqu’à la fin de la session**, pour que rien ne bouge sous le doigt. L’ancienne disposition revient à la prochaine ouverture au repos.
- **Choisir Éco** arrête aussi tout de suite les ressources de la v2. Pendant un travail, la grille reste figée ; elle revient à l’ancienne disposition dès que la machine est de nouveau au repos.
- **Perte du GPU** (contexte graphique perdu) : la vue 3D est remplacée par une vue fixe dans le même cadre. Les commandes ne bougent pas.

### Réglages de rendu (session v2 seulement)

Dans Réglages, sous « Rendu 3D de cette session » :

- **Qualité complète** : rendu normal.
- **Rendu allégé** : moins de détails, même cadre.
- **Arrêter le rendu 3D** : vue fixe, même cadre.

Ces choix n’agissent que sur l’affichage. **Diagnostic du rendu** affiche, à la demande, GPU matériel, résolution, DPR et qualité effective. **Mesurer 60 images** ne fonctionne qu’au repos, avec un état récent. C’est une mesure isolée, pas une garantie.

## 2. Lire les écrans

### Suivi

À gauche, la **scène** : parcours du programme, partie acquittée et repère d’outil.

Sous la scène, la **bande de confiance**, toujours au même endroit :

| Élément | Ce qu’il dit |
| --- | --- |
| « Programme chargé : … » | le programme que la machine a reçu (pas la sélection de Fichiers) |
| « G54 · mm » | le repère et les unités du rapport ; « Repère inconnu » s’ils ne sont pas connus |
| « Rapport frais · < 1 s » | le dernier rapport de Grbl a moins de 2,5 s |
| « Rapport périmé (> 2,5 s) » | plus de 2,5 s sans rapport : position et avancement sont **figés**, pas extrapolés |
| « Rapport inconnu » | aucun rapport exploitable (flux perdu, simulation) |
| « Géométrie complète / simplifiée / inconnue » | ce que la scène dessine |
| « Acquitté par Grbl » / « À acquitter » | la couleur du parcours |

Le rappel « Acquitté = accepté par Grbl, pas nécessairement usiné » est important : une ligne acquittée est entrée dans la mémoire de Grbl. **Elle n’est pas forcément usinée.**

Dans la carte des coordonnées, la position est « Rapportée · rapport frais », « Figée · rapport périmé » ou « Inconnue · pas de rapport ». La couleur est toujours doublée par un mot.

Sous la scène, la **frise « Séquence prévue · estimée / Ensuite »** :

- elle indique la séquence du programme et la suivante ;
- elles sont préparées au repos, à partir du fichier ;
- « Déclarée dans le fichier » vient d’un commentaire ou d’un outil du programme ;
- « Regroupement inféré, pas une opération nommée » est une déduction de la tablette ;
- « Ordre du fichier, pas heure de début » rappelle qu’il n’y a pas d’horaire ;
- « Séquences non préparées » veut dire que l’information manque. Rien n’est inventé.

À droite, une seule colonne de surveillance :

1. avancement et ligne acquittée ;
2. **temps restant**, avec sa source juste dessous. C’est une estimation, sans accélérations ; « Détail du temps » dit ce qu’elle ne compte pas (pauses, interventions, durées inconnues) ;
3. **coordonnées** de travail rapportées ;
4. **avance rapportée et S rapporté**, avec la courbe de la dernière minute ;
   - « S rapporté » est la consigne que Grbl renvoie. **Ce n’est pas une mesure de tachymètre.**
   - Sur la courbe, un trou est un **trou de données**, jamais un zéro.
   - Les traits verticaux marquent les corrections et les pauses rapportées. Le texte sous la courbe les compte (« Corrections : 1 · trous de données : 2 »).
5. **correction d’avance** (−10 %, −1 %, 100 %, +1 %, +10 %) : les mêmes boutons qu’avant. « Broche / rapides… » ouvre, dans une fiche, les corrections de broche et de rapides ;
6. les commandes du Suivi (Démarrer…, Pause, Arrêter le travail), inchangées.

**Ouvrir le Journal depuis la courbe.** Touchez un trait de la courbe. Le Journal s’ouvre sur l’intervalle de cet événement. « ← Retour à Suivi » ramène la vue. Rien n’est envoyé à la machine.

**Examiner un détail (vue 3D).** Le bouton « Examiner » de la vue 3D active la loupe. Touchez un segment, au doigt ou au stylet. La tablette affiche les coordonnées nominales, la ligne du programme et la passe. Si plusieurs segments sont proches, elle propose les candidats. « Revenir au direct » rend la vue telle qu’elle était. La sélection est **visuelle** : elle ne déplace jamais l’outil.

### Fichiers

En haut du détail, deux colonnes côte à côte :

- **Sélection** : le fichier que vous regardez ;
- **Chargé dans la machine** : le programme que la machine a reçu.

Elles comparent le nom et la version, les dimensions de l’aperçu, l’outil et la matière déclarés et l’empreinte. « La sélection n’est pas le programme chargé. » signale une différence. Une empreinte différente rend les informations déclarées invalides.

**Sélectionner ne charge pas ; charger ne démarre pas.** Le chargement suit les mêmes gardes qu’avant. Pendant un travail, Pause et Arrêter restent dans le bandeau.

### Préparer

À gauche, la scène **Placement · dessus XY** :

- « Les deux » montre l’origine actuelle et l’hypothèse ensemble ;
- « Actuelle » montre l’origine actuelle seule ;
- « Hypothèse XY » montre le placement si le zéro X Y était posé à la position actuelle de l’outil ;
- « Cotes » montre ou masque, sous la scène, au plus quatre cotes, chacune avec sa source : « fiche projet, pas une mesure », « saisie opérateur, pas une mesure » ou « programme, valeur nominale ».

À droite :

- **1 · Programme chargé**, avec sa révision ;
- **2 · Origine X Y**, avec son état (« À confirmer », « Inconnu », « Suspendu ») et les décalages X et Y. Un décalage inconnu s’affiche « — », jamais zéro ;
- « Z conserve son origine actuelle. » : l’hypothèse ne concerne que X et Y ;
- le verdict de course :
  - « Dans la course machine en X et Y » ou « Hors course machine en X ou Y » est une estimation de la tablette ($130–$132). Ce n’est pas le contrôle du serveur. Z et collisions ne sont pas vérifiés ;
  - « △ Course machine non vérifiée » s’affiche quand les données manquent ($23, course, repère ou unités) ;
- **Déplacer l’outil…** ouvre la zone de jog : les flèches et les vérifications existantes, avec des cibles de 96 px. « Revenir à la comparaison » rend la scène au même cadrage.

Pendant un travail, une pause ou une alarme, la carte garde sa place et affiche « Comparaison suspendue : … ». Les zéros restent dans la carte des coordonnées, avec leur confirmation. **Toucher le dessin ne déplace jamais l’outil**, et une scène qui semble correcte ne coche aucune étape de préparation.

### Machine

« Condition actuelle » donne :

- le titre lisible de l’alarme et son code ALARM ;
- l’origine de l’information : rapportée par la carte, ou déduite (« Aucun code reçu : cause non rapportée par la carte. ») ;
- une explication et la prochaine action possible ;
- la fraîcheur du rapport et l’appareil pilote.

« Paramètres de course » liste les valeurs connues et inconnues, avec leurs unités.

Déverrouiller et la prise d’origine restent à leur place, avec leurs conditions et leurs confirmations. La v2 n’ajoute ni terminal ni macro.

### Journal

La liste chronologique est à gauche, le détail de l’événement touché à droite.

- Les filtres « Tous / Commande / État / Connexion » trient la liste.
- « Cette session / Serveur » choisit la source.
- « Contexte du journal » rappelle le programme et l’intervalle quand le Journal est ouvert depuis la courbe.
- « Tout le journal » enlève l’intervalle.
- Le Journal est en **lecture seule** : il n’a aucun bouton pour rejouer une commande.
- Les 100 derniers événements de cet appareil sont effacés au rechargement. Une information absente reste absente.

### Réglages

Voir la partie 1. Les réglages système gardent leurs interdictions pendant un travail ou un mouvement.

## 3. Limites à connaître

- **Rien n’est mesuré sur la pièce.** Le parcours est celui du programme. La v2 ne connaît ni la fixation, ni le faux-rond, ni le diamètre réel de l’outil. Elle ne fait aucune détection de collision.
- **Aucune extrapolation.** Le repère d’outil ne dépasse pas le dernier rapport. Au-delà de 2,5 s, il se fige et le dit. Le temps restant est une estimation sans accélérations, jamais un compte à rebours.
- **Le brut, les brides et les cotes sont des déclarations** (fiche projet, saisie, programme). Ce ne sont pas des mesures.
- **Le verdict de course est une estimation de la tablette.** Le contrôle du serveur reste celui qui compte. Un `$23` inconnu laisse le verdict « non vérifié ».
- **La simulation** (`simulation.html`) n’a ni rapport Grbl ni origine visuelle. La bande y affiche « Rapport inconnu », et Préparer n’y montre pas la comparaison.
- **Un geste n’est jamais une commande.** Rotation, zoom, loupe, toucher de la courbe ou du dessin : affichage seulement.
- **Ce qui a été vérifié, et ce qui reste à vérifier sur la tablette et à la machine**, est décrit dans `PERFORMANCE-V2-VALIDATION.md`. Jusqu’à ces mesures, la v2 n’est publiée que sous `/touch-next/`, pas sur le kiosque.
