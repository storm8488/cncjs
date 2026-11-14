# Palpage réel X / Y / XYZ avec le bloc de coin (multi-agent, 2026-11-14)

Tu écris en français. Dépôt `C:\Users\damou\Documents\claude\cncjs`, branche `feat/ecrans-ergonomie`, HEAD `0cb5d90a` : déployé sur la Surface Pro CNC (cache `v2t`), pas encore poussé.

## La machine
Elle est réelle et en service :
- LUNYEE 4040, Grbl 1.1f sur ESP32, `/dev/ttyUSB0` ;
- `$6=1`, vérifié à la main : `Pn:P` seulement quand le bloc touche l'outil ;
- `$10=1`, `$13=0`, `$20=1`, `$21=1`, `$22=1`, `$23=3` ;
- courses `$130-132` = 408 / 396 / 130 ;
- vitesses maximales : X et Y 4000, Z 800.

Ce qu'on sait de son comportement :
- origine forcée à 0 ; X et Y vont de 0 vers +, Z va de −130 vers 0 ;
- 6 fins de course, prouvés ;
- une alarme de fin de course redémarre la carte ;
- le zéro Z réel à la plaque marche : `plate-probe.js` du serveur, carte « Zéro Z avec une plaque » dans Suivi. Premier essai réussi le 2026-11-14, contact à Z machine −119,565, plaque de 5 mm.

## Le bloc de l'opérateur
Bloc de coin XYZ en aluminium, avec un trou pour palper par l'intérieur, et une pince (masse) sur l'outil.

Son profil de sonde est réglé dans `probe-ui.js` / `probe-model.js`, et stocké localement dans le navigateur. Les champs du profil :
- `thickness` (épaisseur Z, 5 mm) ;
- `faceX` et `faceY` : décalage signé entre la face touchée et le bord de la pièce, 9,9 mm chez lui ;
- `fast` et `slow` (mm/min) ;
- `search`, `retract` et `clearance` (mm) ;
- `corner` : `--`, `+-`, `-+` ou `++` ;
- `directionX` et `directionY` (±1) ;
- le diamètre de l'outil, saisi à part dans l'écran Sonde : 6 mm.

`probe-model.js` contient déjà, pour la simulation :
- la séquence XYZ ;
- `compensate()` (rayon, décalages, épaisseur) ;
- la validation des champs ;
- le journal.

Sur la page réelle, les boutons Palper X / Y / XYZ ne font que sélectionner le dessin, et `probe-start` est masqué.

## Objectif
Un palpage **réel**, lancé depuis l'écran Sonde de la page réelle, pour les 4 opérations Z, X, Y et XYZ. Il est exécuté **par le serveur** :
- nouvelle action touch, sur le modèle de `plate-probe.js` : G38.2 / G38.4, deux touches rapide puis lente, retraits ;
- il écrit l'origine de travail (G10 L20 sur le repère choisi) **seulement à la fin réussie** de toute l'opération. Rien de partiel.

Séquence XYZ attendue, avec le coin et les sens du profil :
1. **Z** sur le dessus du bloc (Z0 = contact − épaisseur).
2. Dégagement en Z (`clearance`), puis déplacement latéral hors du bloc, d'après le coin et le rayon de l'outil.
3. Descente sous le dessus du bloc, de la profondeur prévue par le modèle.
4. **X** contre la face (X0 = contact ± rayon ± `faceX`, selon le sens).
5. Dégagement, puis **Y** de la même façon.
6. Retour au-dessus du coin, en Z dégagé.

Concevoir les déplacements latéraux et la profondeur pour que la fraise ne touche jamais le dessus du bloc ni la pièce, et le documenter.

## Sûreté (non négociable ; Astra la vérifie)
- **Avant chaque approche :** sonde « libre » sur un rapport frais, sinon refus (« sonde déjà en contact »).
- **À chaque touche :** contact confirmé par `PRB:...:1`, sinon échec. Une absence de contact dans `search` donne un arrêt propre (`ALARM:4/5` gérés).
- **Courses et vitesses :**
  - toutes les cibles dans la course connue de la machine (`$13x`, convention prouvée par l'origine) ; machine **référencée** obligatoire ;
  - vitesses bornées par `$11x` ;
  - distances bornées par le profil et des maxima du serveur.
- **Contrôle de l'opérateur :**
  - pilotage obligatoire ;
  - confirmation « devant la machine, bloc et pince en place » ;
  - Arrêter et Pause toujours actifs (feed hold, puis reset) ;
  - perte de la tablette (flux fermé) ou rapport ancien → arrêt ;
  - broche refusée si elle tourne ;
  - délai maximal global.
- **Origine de travail :** écrite une seule fois à la fin. En cas d'échec, l'ancienne est conservée et c'est dit à l'écran.
- Aucun changement du chemin `zeroZ` existant, sauf mutualisation prouvée sans régression.
- Ne pas affaiblir les garde-fous existants (`motion.js`, `control.js`, `halt.js`, `plate-probe.js`).

## Écran
- Sur la page réelle, le bouton de lancement de l'écran Sonde devient réel, pour l'opération sélectionnée :
  - il est actif seulement si le profil est complet pour cette opération, le diamètre saisi, le coin et les sens définis, et la machine prête ;
  - sinon, une phrase actionnable explique pourquoi.
- Pendant le palpage : progression par étape, et Arrêter.
- À la fin : valeurs appliquées et nouvelle position de travail.
- Le bouton « Zéro Z avec plaque → Suivi » doit amener à la carte de palpage, carte visible et défilée.
- i18n FR / EN / ES. Chromium 106 : pas de `:has()`, `color-mix` ni `dvh`. Cache `v2t` → `v2u`. Ne jamais renommer les classes `v2m-`/`v2n-` ni la regex `V2_NODE`.

## Garde-fous de travail
- Aucun agent ne touche la Surface ni la CNC : pas de ssh, de déploiement ni de push. Les essais physiques sont faits ensuite par l'orchestrateur, avec l'opérateur.
- Chaque changement de comportement a un test qui échoue sans lui.
  - Serveur : Jest, avec le simulateur `grbl-simulator` ou de faux contrôleurs. Couvrir notamment : contact absent, contact déjà actif, Arrêter au milieu, perte du flux, sortie de course, origine non écrite en cas d'échec.
- Interdits : `git reset/stash/checkout` de fichiers d'autrui, contournement des hooks, `COMPTE-RENDU-*.md`, PNG commités, fichiers de `tablet-exclude.txt` réintroduits.
- Vérifications :
  - `node examples/cncjs-touch/verify-project.cjs` ;
  - `npx jest src/server/services/touch src/server/services/cncengine grbl-simulator` ;
  - harnais strict complet `node examples/cncjs-touch/browser-run.cjs --strict --out <dossier>` : 0 violation, 0 excepted, every step passed, aucun msedge `cnc-browser-run` restant.

## Livrable pour l'orchestrateur
- Un commit local.
- La liste exacte des fichiers serveur à recompiler.
- Un protocole d'essai réel pas à pas, du plus prudent au complet :
  1. diagnostic de la sonde ;
  2. Z seul, avec une recherche courte ;
  3. X seul ;
  4. Y seul ;
  5. XYZ.

  Pour chaque étape : la mise en place, les valeurs attendues, et quoi faire si ça échoue.
