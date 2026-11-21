# Proposition (b) — Un poste de pilotage

Phase 2, proposition d'organisation (b), 2026-11-15. Base : `feat/refonte-ui` à `20aeac36` (page `3049a0e4`, cache `v2u`). Sources : `PROMPT-REFONTE-UI.md`, `ERGONOMIE.md` (mesure « avant »), `TEXTES.md` (glossaire, refus), `VEILLE.md` (idées n° 1 à 15, pièges n° 1 à 5), `audit/COMMANDES-MACHINE.md` (65 lignes), `audit/A1` à `A4`. Les comptes « avant » sont ceux de `ERGONOMIE.md` § A (tablette CNC, v2). Aucun code, aucun fichier existant touché. Ce qui n'est pas vérifié est au § 10.

---

## 1. Principe et arborescence

### 1.1 Le principe en cinq lignes

1. Un seul écran, le **Poste**, ouvert au démarrage et toujours au retour : quatre cartes dans l'ordre du travail (Machine, Fichier, Zéro pièce, Contrôle), le dessin du fichier dans la machine, la position pièce.
2. Le Poste porte **toujours l'action suivante** : une phrase et un seul gros bouton, au même endroit, calculés par une table de priorités fixe (§ 1.4).
3. Chaque tâche s'ouvre dans un **volet par-dessus** le Poste (Zéro pièce, Fichiers, Machine, Reprendre à une ligne…) ; une tâche réussie referme son volet et son résultat s'inscrit sur la carte du Poste.
4. **Un refus ne fait jamais changer d'endroit** : sa phrase s'affiche sous le bouton touché, avec le bouton qui le lève ; ce bouton agit sur place (dialogue), il n'emmène pas ailleurs.
5. Plus de rail : la navigation, c'est le Poste. Le bandeau garde l'état, qui a la main, **Pause** et **Arrêter**, au-dessus de tout.

### 1.2 Arborescence

```
Bandeau (72 px, au-dessus de tout, toujours) : Plus · état · à jour · Broche · La main · Pause · Arrêter · cadenas · heure
│
POSTE (le seul écran)
├── carte 1 Machine ──────► volet latéral MACHINE (connexion, origine machine, déverrouiller, réglages, la main, course, macros)
├── carte 2 Fichier ──────► grand volet FICHIERS (liste avec verdict, aperçu, Charger, Ajouter)
├── carte 3 Zéro pièce ───► grand volet ZÉRO PIÈCE
│                             colonne A : flèches, pas, vitesse
│                             colonne B : position, « Zéro ici », « Zéro à l'origine machine », « Zéro XYZ ici »
│                             colonne C : tuiles de palpage (Bloc XYZ, Z, X, Y, Plaque Z) ; la même colonne accueille
│                                         l'assistant « Bloc de palpage », « Tester la sonde » et le palpage en cours
├── carte 4 Contrôle ─────► surcouche DÉTAILS DU CONTRÔLE (marges par axe, dessin agrandi) ; laser : « Cadrer… »
├── zone Action suivante ─► dialogues de commande ; après un arrêt : grand volet REPRENDRE À UNE LIGNE
└── mode Usinage / Pause / Remise en route (même écran, zones réaffectées, § 2.5 et § 2.4)

Menu « Plus » (bandeau) ─► grands volets JOURNAL, RÉGLAGES, GUIDE, MISE EN SERVICE (contenus actuels)

Dialogues (au-dessus de tout volet) : Confirmer une commande · Connecter la machine · Prendre la main ·
  Lancer le palpage · Poser le zéro · Démarrer malgré le dépassement · pavé numérique · clavier texte ·
  aperçu agrandi · veille · verrou
Surcouche « Détails » (texte technique, codes, réglages) : ouvrable de partout, un toucher pour la fermer.
```

Règles des volets :
- **Un seul niveau.** Poste → un volet → des dialogues. Jamais un volet sur un volet ; « Tester la sonde » et l'assistant du bloc remplacent la colonne C du volet Zéro pièce au lieu de s'empiler.
- **Deux tailles.** Grand volet : toute la zone sous le bandeau, en-tête de 64 px avec « ← Poste » (160 × 64) à gauche. Volet latéral : 664 px à droite ; la colonne des cartes du Poste reste visible à gauche.
- **Retour.** « ← Poste », Échap, ou fermeture automatique quand la tâche réussit (connexion, chargement, palpage, reprise chargée, prise d'origine). Les zéros à la main ne ferment pas le volet (on fait souvent X, puis Y, puis Z).
- **Départ d'un usinage** : tout volet se ferme, le Poste passe en mode Usinage (comme `job-follow.js` aujourd'hui).

### 1.3 Ce qui reste toujours visible, et la géométrie

- **Bandeau, 72 px (inchangé).** De gauche à droite : « ≡ Plus » 64 × 64 ; mot d'état avec icône (220) ; pastille « à jour » / « ancienne » (96) ; Broche ou Consigne S (170) ; bouton « La main : Cet appareil » (200 × 48, avec bord et flèche : il a l'air d'un bouton) ; **Pause** (120 × 64), devenant **Reprendre…** à la même place en pause ; **Arrêter** (160 × 64) ; cadenas (64) ; heure. Somme : 1 302 px + marges, tient en 1 366.
- **Retirés du bandeau** : Avance, Machine, Fichier, messages (ils sont sur le Poste) et « Déverrouiller… » (le bandeau ne doit pas offrir le mauvais premier geste après une alarme, ERGONOMIE P8-I3). Pause et Arrêter sont **toujours présents** au même endroit ; Pause est grisé avec sa raison quand rien ne tourne.
- **Rail supprimé (88 px).** Justification : dans cette organisation il n'y a plus d'écrans entre lesquels naviguer ; ses 7 entrées deviennent 4 cartes et un menu « Plus ». La place rendue élargit la zone utile à **1 334 × 791 px (v2)** et **1 334 × 648 px (v1)**, ce qui permet la croix de déplacement et les tuiles de palpage côte à côte (§ 2.6). Les fils de fer sont à cette échelle.

### 1.4 La table de l'action suivante (le cœur de la proposition)

Le premier cas vrai donne la phrase et le bouton principal (440 × 96, toujours en bas à gauche de la zone de droite). Calculée par la page à partir de l'instantané du serveur, sans requête.

| # | Condition | Phrase (exemple) | Bouton principal |
|---|---|---|---|
| 1 | Serveur injoignable | La tablette ne joint plus le serveur. Elle réessaie seule. | « Recharger la page » (secondaire) |
| 2 | Un autre appareil a la main | PC bureau a la main. Pause et Arrêter restent possibles ici. | « Prendre la main » |
| 3 | Machine non connectée | La machine n'est pas connectée. | « Connecter la machine » |
| 4 | Alarme pendant un usinage | Alarme 2 : la machine a dépassé sa course. Arrêtez l'usinage. | « Arrêter l'usinage » |
| 5 | Alarme (au repos) | La machine est en alarme : sa position est perdue. | « Prise d'origine machine » |
| 6 | Réglages de la machine pas lus | La machine n'a pas encore donné ses réglages. | « Relire les réglages » (ou attente si relecture automatique, D4) |
| 7 | Au repos, origine machine pas prise | Origine machine pas encore prise. | « Prise d'origine machine » |
| 8 | Palpage, prise d'origine ou déplacement en cours | Palpage XYZ : étape 8 / 22. | aucun (Arrêter est dans le bandeau et dans le volet) |
| 9 | Usinage / pause / pause M6 | Usinage en cours. / Pause : la broche tourne toujours. / Changement de fraise demandé. | « Pause » / « Reprendre l'usinage » / « Palper Z à la plaque » |
| 10 | Arrêté avant la fin (ligne connue) | Usinage arrêté à la ligne 1 249. | « Reprendre à la ligne 1 234… » (secondaire « Recharger le fichier ») |
| 11 | Aucun fichier chargé | Choisissez le fichier à usiner. | « Choisir le fichier » |
| 12 | Zéro pièce non posé depuis le chargement d'un autre fichier, ou non vérifié depuis la prise d'origine (D2) | Posez le zéro pièce. | « Poser le zéro pièce » (secondaire « Garder ce zéro ») |
| 13 | Contrôle : dépassement prouvé (D1) | Le fichier descend 15 mm trop bas : relevez la pièce, puis reposez le zéro Z. | « Zéro pièce » ; « Démarrer » grisé avec la même raison |
| 14 | Contrôle : non vérifiable | La course n'a pas pu être vérifiée en Z : vérifiez à la main. | « Démarrer l'usinage » (avertissement lisible) |
| 15 | Contrôle : tient | Tout est prêt : le fichier tient dans la machine. | « Démarrer l'usinage » |
| 16 | Usinage terminé | Usinage terminé en 42 min. | « Recharger le fichier » (secondaire « Choisir un autre fichier ») |

« Démarrer l'usinage » n'est jamais l'action suivante tant qu'un cas 1 à 13 est vrai.

### 1.5 Le composant « refus »

Bande sous le bouton touché (ou dans la zone d'action) : icône + **une phrase** (16 px, deux lignes au plus) + **bouton remède** (64 px) + « Détails » (48 px). Le bouton refusé passe grisé rayé tant que la cause dure ; la bande disparaît quand la cause change (A2-13). Le remède agit sur place : « Prise d'origine machine » ouvre son dialogue de confirmation par-dessus le volet courant, « Prendre la main » ouvre le sien. Seuls quatre remèdes changent de volet : « Fichiers », « Zéro pièce », « Tester la sonde » (colonne C) et « Reprendre à une ligne ».

---

## 2. Fils de fer

Échelle : 1 colonne ≈ 14 px, 1 ligne ≈ 32 px. `[Libellé]` = bouton, `(n × m)` = taille de la cible en px, `▓` = rayé (grisé avec raison). Écart entre cibles : 12 px partout.

### 2.1 Bandeau (1 366 × 72), trois états

```
┌────────┬──────────────────┬──────────┬─────────────────┬────────────────────┬──────────┬────────────┬─────┬───────┐
│[≡ Plus]│ [ok] Au repos    │ ● à jour │ Broche 0 tr/min │[La main : Cet app.]│[▓Pause▓] │ [Arrêter]  │[cad]│ 14:02 │
└────────┴──────────────────┴──────────┴─────────────────┴────────────────────┴──────────┴────────────┴─────┴───────┘
  usinage : « > Usinage »                Broche 11 800        idem               [Pause]     [Arrêter]
  pause   : « || Pause » (ambre)                                                 [Reprendre…]
  alarme  : « (!) Alarme 2 » (rouge)      Broche 0                               [▓Pause▓]   [Arrêter]
  autre   : « La main : PC bureau » sur fond ambre, toujours touchable → dialogue « Prendre la main »
  hors ligne : « Hors ligne », pastille « ancienne · 12 s » ; Pause et Arrêter gardés (envoi direct, comme aujourd'hui)
```

### 2.2 Poste v2 (1 334 × 791), machine prête, fichier chargé, zéro posé, contrôle bon

```
x 0                         420 432                                                                1334
┌───────────────────────────────┐┌─────────────────────────────────────────────────────────────────┐ y 0
│ 1  MACHINE              [ok]  ││ LE FICHIER DANS LA MACHINE                         [Aperçu 3D]  │
│ Prête · origine prise 14:01   ││ ┌ dessus : course 408 × 396 ─────────────┐ ┌ côté : Z ──────────┐│
│                 [ Machine ]   ││ │                                        │ │ 0 ················ ││
├───────────────────────────────┤│ │   ┌──────────────────────┐             │ │ dessus pièce ───── ││
│ 2  FICHIER              [ok]  ││ │   │ planche 400 × 70     │  + fraise   │ │ ░░ 12 mm ░░        ││
│ planche-rainures.nc           ││ │   └──────────────────────┘             │ │ marge 3 mm         ││
│ 400 × 70 mm · profondeur 12   ││ │ zéro pièce ●                           │ │ −130 ············· ││
│                 [ Fichiers ]  ││ └────────────────────────────────────────┘ └────────────────────┘│
├───────────────────────────────┤├─────────────────────────────────────────────────────────────────┤ y 432
│ 3  ZÉRO PIÈCE           [ok]  ││ POSITION PIÈCE    X  0,00      Y  0,00      Z  10,00  mm        │
│ Posé au bloc XYZ à 14:06      ││─────────────────────────────────────────────────────────────────│ y 516
│                [ Zéro pièce ] ││ Tout est prêt : le fichier tient dans la machine.               │
├───────────────────────────────┤│ ┌──────────────────────────────────┐                            │
│ 4  CONTRÔLE             [ok]  ││ │                                  │                            │
│ Tient dans la machine         ││ │       Démarrer l'usinage         │       [ Détails ]          │
│ marge en bas : 3 mm           ││ │                                  │                            │
│                 [ Détails ]   ││ └──────────────────────────────────┘                            │
└───────────────────────────────┘└─────────────────────────────────────────────────────────────────┘ y 791
```

Cibles : cartes 420 × 184 ; boutons de carte 200 × 64 (ouvrent un volet : traités comme actions principales pour des doigts poussiéreux) ; « Démarrer l'usinage » 440 × 96 ; « Détails » 160 × 48 ; « Aperçu 3D » (v2 seulement) 160 × 48. Pastille de carte : mot + icône (« prête », « à faire », « attention », « refusé »), couleur vive seulement pour « attention » et « refusé ».

### 2.3 Poste v1 (1 334 × 648), même état

```
┌───────────────────────────────┐┌─────────────────────────────────────────────────────────────────┐ y 0
│ 1 MACHINE   Prête · 14:01 [ok]││ LE FICHIER DANS LA MACHINE (dessin SVG, deux vues fixes)        │
│                 [ Machine ]   ││ ┌ dessus ──────────────────────────────┐ ┌ côté ───────────────┐ │
├───────────────────────────────┤│ │   [planche 400 × 70]   + fraise      │ │ dessus · 12 · −130  │ │
│ 2 FICHIER planche-rainures    ││ └──────────────────────────────────────┘ └─────────────────────┘ │
│ 400 × 70 · prof. 12 [Fichiers]││─────────────────────────────────────────────────────────────────│ y 276
├───────────────────────────────┤│ POSITION PIÈCE    X 0,00     Y 0,00     Z 10,00 mm              │
│ 3 ZÉRO PIÈCE  bloc XYZ · 14:06││─────────────────────────────────────────────────────────────────│ y 348
│                [ Zéro pièce ] ││ Tout est prêt : le fichier tient dans la machine.               │
├───────────────────────────────┤│ ┌──────────────────────────────────┐                            │
│ 4 CONTRÔLE  Tient · marge 3 mm││ │       Démarrer l'usinage         │       [ Détails ]          │
│                 [ Détails ]   ││ └──────────────────────────────────┘                            │
└───────────────────────────────┘└─────────────────────────────────────────────────────────────────┘ y 648
```

Cartes 420 × 150 ; mêmes boutons et mêmes tailles qu'en v2 ; dessin 902 × 264 ; « Démarrer l'usinage » 440 × 96. Rien ne défile, y compris en texte agrandi si les lignes d'état des cartes sont tronquées à une ligne (point à mesurer, § 9).

### 2.4 Poste, variantes d'état (seules les zones qui changent)

```
HORS LIGNE        cartes grisées « information ancienne · 12 s » ; dessin figé
                  Zone d'action : « La tablette ne joint plus le serveur. Elle réessaie seule. »  [Recharger la page] (240 × 64)

NON CONNECTÉE     carte 1 : « Machine non connectée »  [à faire]
                  Zone d'action : « La machine n'est pas connectée. »   [ Connecter la machine ] (440 × 96)

NON RÉFÉRENCÉE    carte 1 : « Au repos · origine machine pas prise » [à faire] ; carte 4 : « À vérifier après la prise d'origine »
                  Zone d'action : « Origine machine pas encore prise. »   [ Prise d'origine machine ] (440 × 96)

PRÊTE SANS FICHIER carte 2 : « Aucun fichier chargé » ; cartes 3-4 : « après le fichier »
                  Zone d'action : « Choisissez le fichier à usiner. »   [ Choisir le fichier ] (440 × 96)

PILOTE PRIS       bandeau « La main : PC bureau » (ambre)
                  Zone d'action : « PC bureau a la main depuis 14:10. Pause et Arrêter restent possibles ici. »
                  [ Prendre la main ] (440 × 96) ; dans les volets, les boutons gardés sont ▓ avec la même phrase et le même remède

REFUS (D1)        carte 4 : « Dépasse de 15 mm en bas » [refusé] ; vue de côté : bande rouge hachurée sous −130, cotée « 15 mm »
                  Zone d'action : « Le fichier descend 15 mm trop bas : la fraise ne peut pas aller si bas.
                                    Relevez la pièce (martyr de 15 mm au moins), puis reposez le zéro Z. »
                  [ Zéro pièce ] (440 × 96)   [▓ Démarrer l'usinage ▓] (240 × 64)   [Choisir un autre fichier] (240 × 48)   [Détails]
                  « Démarrer malgré le dépassement… » vit seulement dans Détails (§ 2.11)
```

Remise en route (alarme, ou arrêt avant la fin) : la zone de droite entière (902 × 791) devient une liste ordonnée ; le bouton principal reste au même endroit.

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ (!) ALARME 2 : la machine a dépassé sa course. Elle a redémarré : sa position est perdue.     │
│ Perdu : l'origine machine. Gardés : le fichier, le zéro pièce (revérifié à l'étape 3).        │
│                                                                                               │
│  1  [fait]   Arrêter l'usinage                                                                │
│  2  ▶        Prise d'origine machine        la machine va jusqu'à ses capteurs                │
│  3           Vérifier le zéro pièce         automatique après l'étape 2                       │
│  4           Reprendre à la ligne 1 234     dernière ligne usinée : 1 249                     │
│  5           Démarrer la reprise                                                              │
│                                                                                               │
│ ┌──────────────────────────────────┐                                                          │
│ │    Prise d'origine machine       │    [Déverrouiller seulement…] (280 × 48)   [Détails]     │
│ └──────────────────────────────────┘                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

Étape faite : « [fait] » + heure ; étape courante : flèche et seul bouton principal. Si le serveur ne prouve pas le zéro pièce (D2), l'étape 3 devient « Zéro pièce à refaire » avec « Zéro pièce ». Sans ligne d'arrêt connue, l'étape 4 devient « Recharger le fichier ». Le code d'alarme et le texte Grbl sont dans Détails.

### 2.5 Poste en usinage, v2 (en v1 : mêmes zones, dessin 240 px de haut, rien ne défile)

```
┌───────────────────────────────┐┌─────────────────────────────────────────────────────────────────┐ y 0
│ planche-rainures.nc           ││ APERÇU EN COURS        [2D][Iso][Face][Côté][Dessus] [Agrandir]  │
│ zéro bloc XYZ 14:06 · tient   ││                                                                 │
├───────────────────────────────┤│              (v1 : images fixes ; v2 : vue 3D)                  │
│ VITESSE 100 %                 ││                    + position de la fraise                      │
│[−10%][−1%][100%][+1%][+10%]   ││                                                                 │ y 420
│ BROCHE 100 %                  ││─────────────────────────────────────────────────────────────────│
│[−10%][−1%][100%][+1%][+10%]   ││  37 %      Reste 12 min       Ligne 1 234 / 3 310                │
│ RAPIDES 100 %                 ││  ████████████░░░░░░░░░░░░░░░░░░░░                                │
│[ 25 % ][ 50 % ][ 100 % ]      ││ POSITION PIÈCE    X 120,50    Y 35,00    Z −4,00 mm              │ y 600
│                               ││─────────────────────────────────────────────────────────────────│
│                               ││ Usinage en cours.                                               │
│                               ││ ┌──────────────────────────────────┐                            │
│┌─────────────────────────────┐││ │              Pause               │        [ Détails ]         │
││     Arrêter l'usinage       │││ └──────────────────────────────────┘                            │
│└─────────────────────────────┘│└─────────────────────────────────────────────────────────────────┘ y 791
```

Corrections : 15 boutons de 74 × 64 (« 100 % » compris), rapides 132 × 64 ; « Arrêter l'usinage » 420 × 72, seul en bas à gauche, à 420 px du bouton Pause. Les trois rangées sont sur l'écran **en v1 comme en v2** (le volet « Broche / rapides… » disparaît). Pause : la zone d'action dit « Pause : la broche tourne toujours. » avec « Reprendre l'usinage » (440 × 96) et « Arrêter la broche » (240 × 64). Pause du programme M6 (CNC) : « Le fichier demande un changement de fraise. » avec « Palper Z à la plaque » (principal), « Reprendre l'usinage » et « Arrêter la broche » (secondaires). v2 seulement : courbe de vitesse et « Séquence prévue » dans Détails.

### 2.6 Grand volet « Zéro pièce », v2 (corps 1 334 × 715)

```
┌──────────────┬───────────────────────────────────────────────────────────────────────────────────────┐
│ [ ← Poste ]  │ ZÉRO PIÈCE        actuel : posé au bloc XYZ à 14:06                                   │ 64
├──────────────┴─────────────────┬───────────────────────────────┬─────────────────────────────────────┤
│ A  DÉPLACER                    │ B  POSITION PIÈCE             │ C  PALPER         Sonde : libre [·]  │
│          [ Y+ ]       [ Z+ ]   │ X     66,95 mm                │                  [Tester la sonde]   │
│  [ X− ] (1 mm) [ X+ ]          │ [Zéro ici][Zéro à l'origine   │ ┌─────────────────────────────────┐  │
│          [ Y− ]       [ Z− ]   │            machine]           │ │ BLOC XYZ   coin avant gauche  ◣ │  │
│                                │ Y     10,00 mm                │ ├─────────────────────────────────┤  │
│ PAS mm                         │ [Zéro ici][Zéro à l'origine   │ │ BLOC Z     dessus du bloc     ▭ │  │
│[0,1][1][10][25][50][100][Cont.]│            machine]           │ ├─────────────────────────────────┤  │
│ VITESSE mm/min                 │ Z     −1,00 mm                │ │ BLOC X     face gauche        ▯ │  │
│ [250][500][1000][2000][4000]   │ [Zéro ici][Zéro à l'origine   │ ├─────────────────────────────────┤  │
│                                │            machine]           │ │ BLOC Y     face avant         ▯ │  │
│                                │ [      Zéro XYZ ici         ] │ ├─────────────────────────────────┤  │
│                                │ Position machine : Détails    │ │ PLAQUE Z   épaisseur 20 mm    ▬ │  │
│                                │                               │ └─────────────────────────────────┘  │
└────────────────────────────────┴───────────────────────────────┴─────────────────────────────────────┘
```

Cibles : flèches 96 × 96 (croix 312 + colonne Z = 432 px) ; pas et vitesses 52 × 48 ; « Zéro ici » 160 × 64, « Zéro à l'origine machine » 262 × 64 (deux lignes) ; « Zéro XYZ ici » 434 × 64 ; tuiles 444 × 96, **chaque tuile lance son palpage** (elle ouvre le dialogue « Lancer le palpage », § 2.11) ; voyant de sonde 220 × 48 (ce n'est pas un bouton : pas de bord) ; « Tester la sonde » 200 × 48. En v1 (corps 572 px) : tuiles 444 × 88, rien d'autre ne change. En laser : colonne C = « Un laser n'a pas de palpage. Posez le zéro X Y à la main. » ; le Z est masqué comme aujourd'hui (`laser-z.js`).

États de la colonne C :
- **Profil de bloc vide** : les quatre tuiles « Bloc » portent « à régler la première fois » ; les toucher ouvre l'assistant dans la colonne C :
  `1/3 Quel coin du bloc ?` dessin de dessus + quatre boutons de coin (200 × 96) ; `2/3 Mesurez le bloc` trois champs avec leur dessin (« Épaisseur du dessus », « Paroi côté X », « Paroi côté Y », en mm, sans signe : le signe vient du coin) ; `3/3 Fraise` « Diamètre de la fraise » + « Vitesses et distances : réglages sûrs » [Modifier] ; boutons « Retour » (160 × 48) et « Suivant » / « Enregistrer et palper » (260 × 64). Le coin n'est demandé que pour XYZ, X et Y.
- **Palpage en cours** : tuiles remplacées par « Palpage XYZ · étape 8 / 22 · approche X », barre, et « Arrêter le palpage » (444 × 72) seul ; la croix et les zéros sont ▓ « Palpage en cours ».
- **Palpage refusé ou échoué** : bande de refus en tête de colonne (phrase + remède, § 5.2), la tuile reste touchable.
- **Tester la sonde** (assistant de diagnostic, D4) : voyant agrandi (444 × 96), une consigne à la fois, la page avance seule quand le voyant change (« Touchez le bloc avec la fraise. » → « Contact vu. Relâchez. » → « La sonde marche. ») ; branches du contact permanent : « Retirez la pince de la fraise. » → si libre : « La pince ou le fil touchait. » ; sinon « Débranchez la broche (prise du moteur). » → si libre : « La broche met la fraise à la masse : gardez-la débranchée pour palper, rebranchez-la avant d'usiner. » ; sinon « Le fil de sonde est en court-circuit : vérifiez-le. ». Jamais de contact : « Pince sur la fraise ? Fil branché à la machine ? » Bouton « Terminé » (200 × 64).

### 2.7 Grand volet « Fichiers »

```
┌──────────────┬────────────────────────────────────────────────────────────────────────────────────────┐
│ [ ← Poste ]  │ FICHIERS       [Rechercher] [Favoris]                               [+ Ajouter]       │
├──────────────┴────────────────────────────────────┬───────────────────────────────────────────────────┤
│ ┌───┐ planche-rainures.nc     [Sélectionné]       │ APERÇU   [2D][Iso][Face][Côté][Dessus]            │
│ └───┘ 400 × 70 mm · profondeur 12 · Tient en taille│                                                   │
│ ┌───┐ tablette-chene.nc                           │              (images fixes ; v2 : 3D)             │
│ └───┘ 380 × 250 · profondeur 20 · À voir en Z      │                                                   │
│ ┌───┐ boite-mdf.nc                                │───────────────────────────────────────────────────│
│ └───┘ 450 × 90 · profondeur 6 · Trop long en X     │ 400 × 70 mm · profondeur 12 mm                    │
│ ...                                               │ Dans cette machine, avec le zéro actuel :         │
│                                                   │ tient (marges X 4 mm, Y 163 mm, en bas 3 mm)      │
│                                [Suivant →]        │ [Détails de l'aperçu]      [   Charger   ]        │
└───────────────────────────────────────────────────┴───────────────────────────────────────────────────┘
```

Lignes 620 × 92 (comme aujourd'hui) ; « Charger » 280 × 64, seule action principale ; « + Ajouter » 200 × 48 (secondaire, contour). La pastille de la liste compare la taille et la profondeur à la course (données déjà dans l'aperçu, aucune requête) ; le détail du fichier touché demande au serveur son contrôle de course avec le zéro actuel (`{action:"check"}`, qui existe et n'est appelé par aucun bouton aujourd'hui, COMMANDES-MACHINE § « non atteintes »). Sans zéro pièce : « Position à vérifier après le zéro pièce ». Charger referme le volet ; la carte 2 et la carte 4 se mettent à jour. Le choix du port, quand il y en a plusieurs, n'est plus ici (§ 2.8).

### 2.8 Volet latéral « Machine » (664 × 791 ; poste visible à gauche)

```
┌──────────────┬─────────────────────────────────────────────┐
│ [ ← Poste ]  │ MACHINE                                     │
├──────────────┴─────────────────────────────────────────────┤
│ Connexion : /dev/ttyUSB0 · connectée          [Connecter]  │ 200 × 48 (grisé avec raison si déjà connectée)
│ Origine machine : prise à 14:01                            │
│ [   Prise d'origine machine   ] (420 × 64)                 │
│ [ Déverrouiller ] (200 × 48)  sert seulement en alarme     │
│ Réglages : lus à 14:01 · Grbl 1.1f   [Relire les réglages] │ toujours visible, grisé avec raison
│ La main : Cet appareil               [Prendre la main]     │
│ Course : X 408 · Y 396 · Z 130 mm                          │ (remplace l'écran Limites et la carte v2)
│ [Macros…] (200 × 48)   [Mise en service…] (220 × 48)       │
│ [Détails] : version, réglages $$, zéros enregistrés, port  │
└────────────────────────────────────────────────────────────┘
```

En v1 (648 px) le volet tient sans défiler si « Course » et « Macros » partagent une ligne.

### 2.9 Grand volet « Reprendre à une ligne »

Gauche (620 px) : aperçu avec le point de reprise. Droite : « Dernière ligne usinée : 1 249 » ; champ « Reprendre à la ligne » (240 × 64, pavé numérique) prérempli à 1 234 ; le plan, vérifié automatiquement à l'ouverture et à chaque changement de ligne : « La fraise monte à 5 mm, va en X 120 Y 35, descend, puis reprend. » ; bande de refus éventuelle (remède : champ « ligne » sélectionné, ou « Reprendre au début ») ; « Charger la reprise » (280 × 64). Il porte sur **le fichier arrêté**, nommé en titre, pas sur la sélection de la bibliothèque (A2-9).

### 2.10 Menu « Plus » et volets repris tels quels

Liste déroulante sous « ≡ Plus » (320 × 4 × 64) : « Journal », « Réglages », « Guide », « Mise en service ». Chacun ouvre un grand volet dont le contenu est celui de l'écran actuel (Réglages : cohérence seulement, § 5.5 du prompt). Le cadenas reste dans le bandeau.

### 2.11 Dialogues

```
CONFIRMER UNE COMMANDE (720 × ~360, centré)          LANCER LE PALPAGE (900 × ~560)
┌──────────────────────────────────────────┐        ┌──────────────────────────────────────────────────────┐
│ Lancer la prise d'origine machine ?      │        │ Palper le bloc XYZ                                   │
│ Les trois axes vont jusqu'à leurs        │        │ ┌ dessin de départ (dessus) ┐  Placez la fraise :     │
│ capteurs. Dégagez la zone.               │        │ │  bloc ◣, zone hachurée     │  au-dessus du coin avant│
│ Machine · cet appareil a la main         │        │ │  de départ, fraise ●       │  gauche, à moins de     │
│ (case seulement hors kiosque local,§6.3) │        │ └────────────────────────────┘  28 mm des deux bords,  │
│ ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ 15 s                 │        │  5 à 10 mm au-dessus.   │
│ [Annuler]               [Lancer la prise │        │ Sonde : libre · test du contact fait à 14:05         │
│ 160 × 48                 d'origine] 300×64│        │ Fraise Ø 6 mm [Modifier]   ▬▬▬▬▬▬▬▬▬▬▬ 15 s            │
└──────────────────────────────────────────┘        │ [Annuler]                      [Lancer le palpage]   │
                                                    └──────────────────────────────────────────────────────┘
```

- **Le bouton de confirmation dit l'effet** (« Lancer la prise d'origine », « Démarrer l'usinage », « Reprendre l'usinage », « Déverrouiller », « Lancer le palpage », « Poser le zéro X ») ; il est à l'opposé du bouton qui a ouvert le dialogue (pas de double toucher accidentel au même endroit).
- **Plaque Z** : même dialogue, avec « Épaisseur de la plaque 20 mm » et « Descente au plus 10 mm » préremplis (derniers choix), modifiables.
- **Poser le zéro** : « Zéro X ici ? Aucun axe ne bouge. X pièce 66,95 → 0. » [Annuler] [Poser le zéro X] (2 touchers, comme aujourd'hui).
- **Connecter la machine** : « Connecter /dev/ttyUSB0 ? La machine redémarre et reste en alarme jusqu'à la prise d'origine. » [Annuler] [Connecter] ; s'il y a plusieurs ports : une ligne de 64 px par port.
- **Prendre la main** : « PC bureau a la main depuis 14:10. » Deux boutons qui prennent la main **directement** avec leur motif : [Je suis devant la machine] (420 × 64), [L'autre appareil est abandonné] (420 × 64) ; [Autre motif…] (clavier) ; [Annuler].
- **Démarrer malgré le dépassement** (dérogation D1, depuis Détails) : « Le fichier descend 15 mm trop bas. La machine s'arrêtera en alarme et perdra sa position. » case « Je sais que le fichier dépasse de 15 mm » + [Démarrer malgré le dépassement] ; journalisé.

---

## 3. Les dix parcours, toucher par toucher

Départ : le Poste. Convention de `ERGONOMIE.md` : flèches non comptées, une saisie = chiffres d'une valeur, ouvrir le champ et « Valider » sont des touchers.

| Parcours | Avant : touchers / saisies / écrans | Proposition : touchers / saisies / écrans | Impasses |
|---|---|---|---|
| P1 Mise en route | 6 (10 si CNCjs a redémarré) / 0 / 2 + dialogue | **4** (6 tant que A1-8 n'est pas corrigé, 4 ensuite) / 0 / Poste + 2 dialogues | 3 → 0 |
| P2 Fichier | 3 (4 pour lire le verdict) / 0 / 2 | **3**, verdict lu avant de choisir / 0 / Poste + volet | 2 → 0 |
| P3 Bloc, première fois | 35 + détour ≥ 3 / 9 / 3 + dialogue | **14** (8 si les cotes du bloc sont connues d'avance) / 4 (1) / Poste + volet + dialogue | 5 → 0 |
| P4 Bloc, fois suivantes | 6 / 0 / 2 + dialogue | **3** / 0 / Poste + volet + dialogue | 3 → 0 |
| P5 Plaque Z | 3 depuis Suivi, 4 ailleurs | **3** depuis le Poste ; **2** en pause M6 ; 4 depuis un autre volet | 3 → 0 |
| P6 Zéros à la main | 4 / 3 (XYZ) / impossible (origine machine) | **3 / 3 / 3** | 2 → 0 |
| P7 Contrôle et départ | 9 / 0 / 1 + 2 dialogues | **7** (8 hors kiosque local) / 0 / Poste + 2 dialogues | 2 → 0 |
| P8 Après une alarme | 12 / 0 / 2 + 2 dialogues | **7** / 0 / Poste + volet + 2 dialogues | 5 → 0 |
| P9 Pilotage | 3 / 0 / dialogue | **2** / 0 / dialogue | 2 → 0 |
| P10 Sonde | 3, impasse totale | **2** puis guidé (0 à 2 touchers par branche) | 1 → 0 |

**P1 — Mise en route.** 1. Poste « Connecter la machine » → dialogue. 2. « Connecter » → carte 1 « Alarme : connexion faite, origine machine à prendre » ; action suivante « Prise d'origine machine ». 3. « Prise d'origine machine ». 4. « Lancer la prise d'origine » → bandeau « Prise d'origine », puis carte 1 « Prête · origine prise 14:01 » ; action suivante « Choisir le fichier ». Si CNCjs a redémarré (réglages inconnus) : avec A1-8 corrigé, la relecture part seule en alarme (0 toucher, la carte dit « Lecture des réglages… ») ; sans A1-8, l'action suivante devient « Déverrouiller pour lire les réglages » (+2), la relecture au repos part seule (D4), puis « Prise d'origine machine ». Refus possibles : port absent → « Aucune machine trouvée sur les prises USB. Vérifiez le câble et l'interrupteur. » [Chercher à nouveau] ; autre appareil a la main → [Prendre la main].

**P2 — Fichier.** 1. « Choisir le fichier » (ou carte 2 « Fichiers ») → liste avec la pastille de taille et de profondeur. 2. Ligne du fichier → détail : dimensions, « profondeur 12 mm », verdict du serveur avec le zéro actuel. 3. « Charger » → volet fermé, cartes 2 et 4 à jour. Refus : « Ce fichier n'est pas du G-code. Choisissez un fichier .nc. » (le bouton Charger reste grisé avec cette phrase).

**P3 — Bloc, première fois.** 1. Carte 3 « Zéro pièce » (ou action suivante « Poser le zéro pièce »). Flèches dans la colonne A pour placer la fraise au-dessus du coin (même volet : plus de détour). 2. Tuile « Bloc XYZ » → assistant 1/3. 3. Coin « Avant gauche » → 2/3. 4-9. Trois champs (toucher, saisir, « Valider ») : 6 touchers, 3 saisies. 10. « Suivant » → 3/3. 11-12. « Diamètre de la fraise » : 2 touchers, 1 saisie. 13. « Enregistrer et palper » → dialogue « Palper le bloc XYZ » avec le dessin de départ ; le voyant demande « Touchez le bloc avec la fraise, puis relâchez » (geste physique, observé seul). 14. « Lancer le palpage » → progression dans la colonne C, puis volet fermé, carte 3 « Posé au bloc XYZ à 14:06 ». Si la spec fixe les cotes nominales du bloc (D4), les étapes 4-9 disparaissent : 8 touchers, 1 saisie. Refus : départ hors de la fenêtre → « La fraise n'est pas au bon endroit. Placez-la au-dessus du coin, à moins de 28 mm du bord. » [Voir le dessin de départ] ; palpage hors course → « Le palpage sortirait de la machine en Y. Éloignez la fraise du bord. » [Voir le dessin de départ].

**P4 — Bloc, fois suivantes.** 1. « Zéro pièce ». (flèches) 2. Tuile « Bloc XYZ ». 3. « Lancer le palpage ». Le test du contact, s'il a plus de 10 min, est un geste physique demandé dans le dialogue ; « Lancer » reste grisé avec « Touchez le bloc avec la fraise, puis relâchez » jusqu'à ce que le voyant l'ait vu.

**P5 — Plaque Z.** 1. « Zéro pièce ». 2. Tuile « Plaque Z ». 3. « Lancer le palpage ». En pause M6 : action suivante « Palper Z à la plaque » (1) puis « Lancer le palpage » (2). La tuile ne disparaît jamais : refusée, elle est ▓ avec sa phrase (« Zéro Z à la plaque impossible pendant cette pause. Arrêtez l'usinage. ») et son remède.

**P6 — Zéros à la main.** Un axe : 1. « Zéro pièce ». (flèches) 2. « Zéro ici » de la ligne X. 3. « Poser le zéro X ». XYZ : « Zéro pièce », « Zéro XYZ ici », « Poser le zéro XYZ ». Origine machine (T13, D4) : « Zéro pièce », « Zéro à l'origine machine » de la ligne X, « Poser X0 à l'origine machine ». Refus : non référencée → « Origine machine pas encore prise. » [Prise d'origine machine] (dialogue sur place, le volet reste ouvert).

**P7 — Contrôle et départ.** Le contrôle est déjà sur la carte 4 et dans la zone d'action (0 toucher). 1. « Démarrer l'usinage ». 2. « Démarrer l'usinage » du dialogue (kiosque local ; ailleurs, + la case). Pause : 3. « Pause » (bandeau ou Poste). Reprise : 4. « Reprendre l'usinage ». 5. « Reprendre l'usinage » du dialogue. Arrêt : 6. « Arrêter » (sans confirmation). Correction : 7. « +10 % » de la rangée Vitesse (Broche et Rapides : aussi 1 toucher, en v1 comme en v2). Dépassement prouvé : cas 13 de § 1.4, la phrase est affichée avant tout toucher.

**P8 — Après une alarme en usinage.** La zone de droite affiche la remise en route (§ 2.4). 1. « Arrêter l'usinage ». 2. « Prise d'origine machine ». 3. « Lancer la prise d'origine ». (zéro pièce revérifié par le serveur, D2, 0 toucher) 4. « Reprendre à la ligne 1 234… » → volet, plan vérifié seul. 5. « Charger la reprise » → Poste, action suivante « Démarrer la reprise ». 6. « Démarrer la reprise ». 7. « Démarrer » du dialogue. Refus : zéro pièce non prouvé → étape 3 « Zéro pièce à refaire » [Zéro pièce] ; ligne impossible → phrase de `TEXTES.md` § 4.2 et champ « ligne » sélectionné.

**P9 — Pilotage.** Qui a la main : bandeau, toujours. 1. « Prendre la main » (bandeau ou action suivante). 2. « Je suis devant la machine » (prend la main avec ce motif).

**P10 — Sonde.** 1. « Zéro pièce » (le voyant dit « Sonde : contact permanent » en ambre, avec icône). 2. « Tester la sonde » → assistant dans la colonne C, qui avance avec le voyant (pince, puis broche, puis fil). Les refus `ETOUCH_PROBE_CONTACT_AT_START`, `_NO_CONTACT`, `_STUCK`, `_PRB` portent le même bouton « Tester la sonde ».

---

## 4. Journal de terrain : pourquoi T1 à T15 ne se reproduisent plus

| # | Pourquoi plus jamais |
|---|---|
| T1 | Pas par l'organisation : par D3 (A1-10, A3-1, A3-2). La proposition n'ajoute aucun réglage de luminosité hors de Réglages, et le premier toucher après la veille ne fait que réveiller (pas de toucher à l'aveugle sur le bouton principal du Poste). |
| T2 | D1 refuse le départ côté serveur ; le Poste affiche le dépassement dès que fichier et zéro sont connus (carte 4, vue de côté hachurée), et l'action suivante devient le remède. Le départ reste ▓ avec la raison. |
| T3 | D2 revérifie le zéro pièce après la prise d'origine ; l'étape « Vérifier le zéro pièce » le dit en clair. Plus aucun dialogue rouge après une prise d'origine : le contrôle se lit sur la carte 4, en mots. Les axes `$23` relèvent de A1-3. |
| T4 | Tous les zéros et tous les palpages sont dans un seul volet ; « Plaque Z » est une tuile à côté de « Bloc XYZ ». |
| T5 | Assistant en trois pas, un dessin par champ, mesures sans signe, coin demandé seulement s'il sert, vitesses et distances préréglées (D4). |
| T6 | Le test du contact est observé seul et dit dans le dialogue ; un refus s'écrit sous le bouton avec son remède, et le bouton passe ▓. |
| T7 | Refus en mots de la pièce et dessin de la zone de départ ; les coordonnées machine sont dans Détails. |
| T8 | Le dessin de départ montre la fenêtre admise autour du coin et la fraise ; la phrase dit la distance. |
| T9 | L'assistant « Tester la sonde » nomme la pince, puis la broche à débrancher. |
| T10 | Relecture automatique (D4, A1-8) ; « Relire les réglages » toujours visible dans le volet Machine, et remède des refus concernés. |
| T11 | Rien ne disparaît : la tuile « Plaque Z » est ▓ avec sa raison et son remède. |
| T12 | « La main : … » est un bouton du bandeau ; « Prendre la main » devient l'action suivante ; les boutons gardés sont ▓ avec cette raison sur l'appareil qui n'a pas la main. |
| T13 | « Zéro à l'origine machine » sur chaque ligne d'axe (D4). |
| T14 | Pas par l'organisation : par la correction du cache (A3 § 2). L1 passe à un suffixe unique `v2v` pour tous les fichiers (19 valeurs isolées aujourd'hui). |
| T15 | La liste des fichiers compare déjà la profondeur à la course ; le détail donne la marge en bas avec le zéro actuel ; au chargement, la carte 4 le redit. |

---

## 5. Vocabulaire

### 5.1 Un mot par notion (d'après le glossaire de `TEXTES.md` § 2.1)

- **Navigation** : « Poste » (« ← Poste »), « Machine », « Fichiers », « Zéro pièce », « Contrôle », « Plus », « Journal », « Réglages », « Guide », « Mise en service », « Détails ».
- **Boutons principaux** : « Connecter la machine », « Prise d'origine machine », « Choisir le fichier », « Charger », « Poser le zéro pièce », « Palper le bloc XYZ » / « Bloc Z » / « Bloc X » / « Bloc Y » / « Plaque Z », « Lancer le palpage », « Démarrer l'usinage », « Pause », « Reprendre l'usinage », « Reprendre à la ligne N… », « Charger la reprise », « Démarrer la reprise », « Prendre la main », « Tester la sonde », « Recharger le fichier ».
- **Boutons secondaires** : « Zéro ici », « Zéro à l'origine machine », « Zéro XYZ ici », « Déverrouiller », « Relire les réglages », « Arrêter la broche », « Arrêter l'usinage », « Arrêter le palpage », « Cadrer… » (laser), « + Ajouter », « Annuler ».
- **États (bandeau)** : Hors ligne, Non connectée, Alarme N, Au repos, Prise d'origine, Déplacement, Palpage, Usinage, Pause, Porte ouverte, Information ancienne, État perdu.
- **États des cartes** : Machine « prête · origine prise », « origine machine pas prise », « alarme » ; Fichier « chargé », « aucun » ; Zéro pièce « posé au bloc / à la plaque / à la main à hh:mm », « à revérifier », « à poser » ; Contrôle « tient », « dépasse de N mm (côté) », « non vérifiable (raison) », « après le zéro pièce ».
- **Mots écartés** (jamais hors Détails) : origine de travail, repère, G54, référencé, programme, travail, pilote, bail, carte, contrôleur, $X, $H, $$, acquitté, rapport frais, empreinte, hors course, limite logicielle, avance (→ vitesse), interrompre, reset. Le mot « fraise » est retenu (choix de `TEXTES.md` à faire confirmer par l'opérateur).

### 5.2 Les dix refus les plus fréquents (phrase · bouton remède)

| # | Cause (code) | Phrase | Remède |
|---|---|---|---|
| 1 | Origine machine pas prise (`ETOUCH_CHECK_NOT_HOMED`, `ETOUCH_MOTION_NOT_HOMED`) | Origine machine pas encore prise. | Prise d'origine machine |
| 2 | Un autre appareil a la main (`ECONTROL`, `ETOUCH_PROBE_PILOT`) | PC bureau a la main. Pause et Arrêter restent possibles. | Prendre la main |
| 3 | Alarme (`ETOUCH_MOTION_ALARM`) | La machine est en alarme : sa position est perdue. | Prise d'origine machine |
| 4 | Dépassement prouvé (`ETOUCH_CHECK_OUTSIDE`, D1) | Le fichier descend 15 mm trop bas : relevez la pièce, puis reposez le zéro Z. | Zéro pièce |
| 5 | Sonde déjà en contact (`ETOUCH_PROBE_CONTACT_AT_START`) | La sonde touche déjà. Relevez la fraise et vérifiez la pince. | Tester la sonde |
| 6 | Aucun contact (`ETOUCH_PROBE_NO_CONTACT`) | La sonde n'a rien touché sur 10 mm. Rapprochez la fraise du bloc. | Tester la sonde |
| 7 | Fraise mal placée (`ETOUCH_PROBE_WINDOW`, `_TRAVEL`, `_DESCENT_CONTACT`) | La fraise n'est pas au bon endroit. Placez-la au-dessus du coin, à moins de 28 mm du bord. | Voir le dessin de départ |
| 8 | Réglages non lus (`ETOUCH_CHECK_HOMING_SETTING`, `ETOUCH_MOTION_HOMING_SETTING`) | La machine n'a pas encore donné ses réglages. | Relire les réglages |
| 9 | Zéro pièce non prouvé (D2, code à créer) | Zéro pièce pas encore revérifié depuis la prise d'origine. | Zéro pièce |
| 10 | Liaison perdue (`ETOUCH_MACHINE_TRANSPORT`, `ETOUCH_PROBE_STREAM`) | La liaison avec la machine s'est coupée. Recommencez. | Confirmer à nouveau |

Les 140 codes et les 90 phrases sans code de `TEXTES.md` § 4.2-4.3 gardent la proposition « cause + remède » qui y est écrite ; la seule règle ajoutée est que le remède agit sur place.

---

## 6. Les commandes machine, ce qui disparaît, les confirmations

### 6.1 Les 65 lignes de `COMMANDES-MACHINE.md` (ancien → nouveau). Rien de ce qui part ne change.

| ID | Aujourd'hui | Proposition |
|---|---|---|
| CX-01 | Menu, barre « Connecter la CNC » | Poste, action suivante « Connecter la machine » ; volet Machine « Connecter » |
| CX-02 | Menu, liste des ports | dialogue « Connecter la machine », une ligne par port |
| CX-03 | Menu, « Ouvrir » | même dialogue, « Connecter » |
| CX-04, CX-05 | automatiques | inchangés |
| CX-06 | « ↻ Actualiser » caché (code mort, RQ-8) | retiré par L1 si la spec l'accepte |
| PI-01 | bandeau `#t-pilot` | bandeau « La main : … » (bouton 200 × 48) |
| PI-02 | dialogue Pilotage, motif puis « Prendre le pilotage » | dialogue « Prendre la main », bouton-motif qui envoie la même requête `takeover` |
| PI-03 | automatique | inchangé |
| OR-01 | bandeau « Déverrouiller… » | retiré du bandeau ; remise en route « Déverrouiller seulement… » |
| OR-02 | Machine « Déverrouiller ($X)… » | volet Machine « Déverrouiller » |
| OR-03, OR-05, OR-08 | Mise en service | inchangés (volet Mise en service) |
| OR-04 | Machine « Prise d'origine ($H)… » | action suivante et remise en route « Prise d'origine machine » ; volet Machine ; remède des refus n° 1 et 3 |
| OR-06 | Machine `#ks-machine-reread`, masqué | volet Machine « Relire les réglages », toujours visible ; remède du refus n° 8 |
| OR-07 | Préparer `#jog-read-settings` | remède seulement (plus de bouton fixe dans Zéro pièce) |
| DE-01 à DE-05 | Préparer, croix (cachée en v2) | volet Zéro pièce, colonne A, toujours visible |
| DE-06 | automatique | inchangé |
| DE-07 | Préparer, pas ; volet « Vitesse » | colonne A, pas et vitesses en rangées (le volet « Vitesse » disparaît) |
| DE-08 | Suivi « Cadrer… » (laser) | Poste, carte 4 « Cadrer… » |
| ZE-01 | Préparer « Zéro X / Y / Z » | colonne B « Zéro ici » par axe |
| ZE-02, ZE-03 | « Zéro XYZ » (v1) et `#pv2-tool-zero` (v2) | colonne B « Zéro XYZ ici », un seul bouton v1 = v2 |
| ZE-04 | dialogue « Confirmer l'origine » | dialogue « Poser le zéro » (2 touchers, inchangé) |
| ZE-05 | « Poser X Y ici… », « Déplacer la machine… », « Revenir… » (n'envoient rien) | disparaissent : la croix est toujours là |
| PA-01 | Suivi, carte de la plaque | tuile « Plaque Z » → dialogue « Lancer le palpage » (épaisseur, descente) |
| PA-02 | Sonde « Zéro Z avec plaque → Suivi » | disparaît (même volet) |
| PA-03 | Sonde, tuiles + « Palper… » | tuiles « Bloc XYZ / Z / X / Y » qui ouvrent le dialogue |
| PA-04 | Sonde « Arrêter le palpage » | colonne C pendant le palpage (seul) + Arrêter du bandeau |
| PA-05 | Diagnostic, profils, transfert, résultats | « Tester la sonde » (colonne C) ; profil = assistant et « Modifier » ; transfert dans Détails du bloc ; résultats sur la carte 3 (Détails) |
| PA-06 | automatique | inchangé |
| FI-01 | Fichiers `#job-load` | volet Fichiers « Charger » (seul endroit) |
| FI-02 | Suivi « Charger la sélection / Recharger » | Poste, action suivante « Recharger le fichier » (fin ou arrêt) |
| FI-03 | volet « Préparer le travail » | disparaît avec le volet |
| FI-04 | volet « Détails de l'aperçu », `#job-port` | volet Machine, ligne Connexion |
| FI-05 | Fichiers, Suivi, Mise en service | volet Fichiers (« + Ajouter », régénération dans « Détails de l'aperçu ») |
| EX-01 | dialogue commun, case + Confirmer | dialogue par classe (§ 6.3) |
| EX-02 | Suivi « Démarrer… » | Poste, action suivante « Démarrer l'usinage » |
| EX-03 | bandeau + Suivi « Pause » | bandeau + Poste en usinage |
| EX-04 | bandeau + Suivi « Reprendre… » | bandeau (place de Pause) + Poste en pause |
| EX-05 | bandeau, Suivi, aperçu agrandi | bandeau, Poste « Arrêter l'usinage », aperçu agrandi |
| EX-06 | Suivi `#home-pause-m5` | Poste en pause et broche qui tourne au repos, « Arrêter la broche » |
| EX-07 | Préparer « Macros… » | volet Machine « Macros… » |
| CO-01 à CO-03 | Suivi (v1) ; avance sur Suivi + volet (v2) | Poste en usinage, trois rangées, v1 = v2 |
| RL-01 | Suivi « Reprendre à une ligne… », masqué sans sélection | Poste, action suivante après un arrêt ; volet « Reprendre à une ligne » |
| RL-02 | « Vérifier » | automatique à l'ouverture et à chaque changement (même requête `resumePlan`, libre) |
| RL-03 | « Charger la reprise » | volet, « Charger la reprise » |
| RM-01 à RM-05 | Réglages, Mise en service | inchangés |
| SY-01 à SY-05 | Réglages, veille | inchangés |
| SY-06 | bandeau, cadenas | inchangé |

Nouveau (D4, envoi défini par le chantier A et inscrit dans `SURETE.md`) : « Zéro à l'origine machine », relecture automatique, assistant de diagnostic. La table sera prouvée par un test « ancien sélecteur → nouveau sélecteur, même requête » à partir de `commandes-machine.json`.

### 6.2 Ce qui disparaît, et pourquoi

- **Écrans** : Menu et ses tuiles (le Poste les remplace), Préparer, Suivi, Machine, Fichiers, Limites (deviennent Poste et volets) ; Sonde, Profils de sonde, Diagnostic de l'entrée, Résultats, Sauvegarde (une colonne et des Détails) ; « Préparation du palpage » (inaccessible, A2-12).
- **Rail** et sa ligne « Retour » qui décale tout (`ERGONOMIE` principe 1).
- **Volets** : « Préparer le travail » (le Poste est la préparation), « Comprendre l'origine » et « Fonctions de la machine » (cinq et quatre paragraphes : remplacés par des dessins et des phrases sur place), « Vitesse de déplacement », « Broche et rapides », « Dimensions XY » (dans le détail du fichier).
- **Boutons** : relais vers les boutons cachés de Fichiers (`#job-start`, `#job-pause`… : un seul bouton par endroit), « Poser X Y ici… », « Déplacer la machine… », « Revenir à la comparaison », « Zéro Z avec plaque → Suivi », « Charger la sélection » de Suivi et du volet, barre « Reprendre où j'en étais » (le Poste est toujours l'arrivée), « Déverrouiller… » du bandeau.
- **Textes** : tout ce que `TEXTES.md` marque « technique » ou « réserve » sur le chemin de l'opérateur part dans Détails (« Acquitté = accepté par Grbl… », « Sans champ Pn… », « Bornes de saisie du logiciel… », « Arrêt logiciel · pas un arrêt d'urgence » reste, raccourci, sous « Arrêter l'usinage »).

### 6.3 La confirmation en trois touchers, classe par classe

| Classe | Commandes | Aujourd'hui | Proposition | Pourquoi c'est sûr |
|---|---|---|---|---|
| Arrêts | Pause, Arrêter, Arrêter la broche, Arrêter le palpage | 1 | 1 (inchangé) | ne jamais ralentir un arrêt |
| Petits déplacements | pas, continu | 0 | 0 (inchangé) | gardes du serveur inchangés |
| Sans mouvement | Zéro ici, Zéro XYZ, Zéro à l'origine machine | 2 | 2 (inchangé) | le dialogue dit « aucun axe ne bouge » et la valeur avant/après |
| Mouvement automatique fréquent | Prise d'origine, Déverrouiller, palpages bloc et plaque, Démarrer, Reprendre l'usinage, Démarrer la reprise | 3 (bouton, case, Confirmer en 15 s) | **2 sur le kiosque local** (bouton, puis bouton nommé par l'effet, en 15 s) ; **3 ailleurs** (la case « Je suis devant la machine » reste) | Le ticket du serveur (nonce, 15 s, même flux) et la revérification des gardes au second temps ne changent pas. La case n'apporte qu'une attestation de présence : sur la tablette posée à côté de la machine (client en boucle locale, la même détection que D3), la présence est acquise par construction ; ailleurs (PC), elle reste exigée. Le risque que la case couvrait au départ (partir hors course) est désormais refusé par le serveur (D1) et annoncé avant (carte 4). Le second bouton est à l'opposé du premier et nomme l'effet (piège n° 5 de `VEILLE.md`). |
| Rare, contenu inconnu | Macros, test de broche, cadrage laser | 3 | 3 (inchangé) | une macro peut tout faire ; ces gestes sont rares |
| Dérogation D1 | Démarrer malgré le dépassement | n'existe pas | Détails + case + bouton nommé = 4, journalisé | geste délibéré exigé par D1 |
| Hôte | mises à jour, extinction, Wi-Fi, type de machine | inchangé | inchangé | Réglages : cohérence seulement |

Tout allègement est un changement de garde de la page : il est inscrit dans `SURETE.md`, relu par Astra et Fable, et n'entre qu'après D3 (sans la détection du client local, la case reste partout). Si le jury refuse l'allègement, le reste de la proposition tient : P1 passe à 5, P4 et P5 à 4, P7 à 9, P8 à 9 (tous encore sous les comptes actuels, P7 égal).

---

## 7. v1 Éco et la règle du rendu

**Même organisation, même géométrie.** v1 et v2 ont le même Poste, les mêmes volets, les mêmes boutons aux mêmes places ; seule la hauteur change (791 / 648), absorbée par le dessin du Poste (420 / 264 px) et la hauteur des tuiles (96 / 88 px).

**Ce que v2 ajoute (sans rien déplacer)** : bouton « Aperçu 3D » dans la zone du dessin ; vue 3D en usinage et dans Fichiers ; courbe de vitesse et « Séquence prévue » dans Détails de l'usinage ; Journal à contexte. **Ce que v1 Éco garde** : le dessin « Le fichier dans la machine » est un SVG statique calculé à partir du contrôle de course et des dimensions de l'aperçu, redessiné à chaque changement de ces données, sans minuterie ; images fixes pour l'aperçu ; aucune requête, minuterie ni image de v2 ; pas de transition animée des volets en Éco.

**Laser (RT)** : « Consigne S » au lieu de « Broche » ; carte 3 « Zéro X Y » ; colonne C du volet Zéro pièce remplacée par une phrase ; « Cadrer… » sur la carte 4. Chromium 106 : volets en `position: fixed` et `hidden`, pas de `:has()`, `color-mix()` ni `dvh` (la hauteur vient de `viewport-fit.js` comme aujourd'hui).

**Règle unique du rendu (problème 8)** : *le rendu est choisi une fois, au chargement de la page, par l'appareil seul : v2 si le profil Performance est choisi, le GPU matériel présent, la machine déclarée CNC et la fenêtre d'au moins 1 300 × 880 px ; sinon v1. L'état de la machine n'entre jamais dans la règle.* Comme l'organisation est identique, une session restée en v1 ne perd rien ; la Surface est toujours en v2, la RT toujours en v1. La garde actuelle « premier état au repos » (`tablet-profile.js:309-310`) disparaît ; le coût de monter la v2 pendant un usinage (page rechargée en plein travail) est à mesurer par le chantier C avant de l'accepter (§ 9).

---

## 8. Lots, en série (un agent à la fois)

Préalable : les corrections du chantier A (D1, D2, D3, D4 côté serveur, A1-8, A2-9) sont faites avant L2. Chaque lot finit avec `verify-project.cjs` à N/N, les suites Jest vertes, le harnais strict à « 0 violation(s), 0 excepted », aucune entrée nouvelle dans `layout-exceptions.json`, et ajoute ses parcours à l'étape `parcours` du harnais.

| Lot | Contenu | Fichiers (dans `examples/cncjs-touch/`) | Laisse en marche | Taille |
|---|---|---|---|---|
| **L1 Socle** | Poste squelette (4 cartes, dessin vide, zone d'action et sa table § 1.4 réduite aux cas 1-3, 11, 15) ; conteneur de volets (grand, latéral, un niveau, « ← Poste ») ; **les écrans actuels hébergés tels quels dans des grands volets** (Préparer, Fichiers, Suivi, Machine, Sonde, Journal, Réglages) ; rail retiré ; menu Plus ; bandeau (La main, Pause et Arrêter fixes, valeurs retirées) ; composant refus ; règle unique du rendu ; cache `v2u` → `v2v` partout | `touch/index.html`, `touch/touch-shell.js`, `touch/touch-shell.css`, `touch/status-strip.js`, `touch/strip-guard.js`, `touch/ui-2027.css`, `touch/design-tokens.css`, `touch/responsive.css`, `touch/viewport-fit.js`, `touch/tablet-profile.js`, `touch/i18n-messages.js` ; nouveaux `touch/poste.js`, `touch/poste.css`, `touch/refus.js` ; tests `test-menu-screen.cjs` (→ Poste), `test-transverse-screen.cjs`, `test-status-strip.cjs`, `test-kept-screens.cjs`, `test-hidden-views.cjs`, `test-v2-gate.cjs`, `test-compact-layout.cjs`, `browser-run.cjs` (écrans → volets, étape `parcours` avec P9) | toutes les fonctions, aux anciennes places, ouvertes depuis le Poste | grand (≈ 1 800 lignes) |
| **L2 Machine prête** | volet Machine ; dialogue Connecter ; Prendre la main à boutons-motifs ; dialogue de confirmation par classe (§ 6.3, avec `SURETE.md`) ; remise en route ; cas 4-8 de la table | `touch/commissioning.js`, `touch/connect-cnc.js`, `touch/machine-limits.js`, `touch/job-controls.js`, `touch/grbl-help.js`, `touch/poste.js` ; tests `test-machine-screen.cjs`, `test-connect-cnc.cjs`, `test-control-attribution.cjs`, `test-job-dialog.cjs`, `test-job-dialog-strip.cjs`, `test-grbl-help.cjs`, `test-machine-limits.cjs` ; parcours P1, P8 (début) | écrans Machine et Limites retirés | moyen (≈ 1 200) |
| **L3 Zéro pièce** | volet à trois colonnes ; tuiles qui lancent ; assistant du bloc (D4) ; « Tester la sonde » ; dessin de départ ; « Zéro à l'origine machine » | `touch/real-motion.js`, `touch/probe-ui.js`, `touch/probe-real.js`, `touch/probe-model.js`, `touch/probe-profiles.js`, `touch/probe-diagram.js`, `touch/probe-transfer.js`, `touch/job-resume.js` (plaque), `touch/laser-z.js`, `touch/probe.css`, `touch/operator-tools.css` ; retire `touch/probe-preparation.js`, `touch/job-preparation.js` du chargement ; tests `test-real-motion.cjs`, `test-probe-real-ui.cjs`, `test-probe-model.cjs`, `test-probe-profiles.cjs`, `test-probe-diagram.cjs`, `test-job-resume.cjs`, `test-v2-preparer*.cjs`, `test-laser-z.cjs` ; parcours P3-P6, P10 | Préparer et Sonde retirés | grand (≈ 1 500) |
| **L4 Fichier et contrôle** | volet Fichiers avec pastilles et verdict ; cartes 2 et 4 ; dessin SVG « Le fichier dans la machine » | `touch/shared-library.js`, `touch/shared-library.css`, `touch/projects.js`, `touch/program-check-view.js`, `touch/travel-check.js`, `touch/origin-preview.js` (v2), `touch/poste.js` ; tests `test-files-screen.cjs`, `test-library-*.cjs`, `test-program-check-view.cjs`, `test-travel-check.cjs`, `test-v2-files.cjs`, `test-origin-preview.cjs` ; parcours P2 | Fichiers retiré comme écran | moyen (≈ 900) |
| **L5 Usinage** | Poste en usinage, pause, M6 ; corrections v1 = v2 ; reprise à une ligne en volet, vérification automatique ; dérogation D1 ; cadrage sur la carte 4 | `touch/job-dashboard.js`, `touch/job-follow.js`, `touch/job-resume.js`, `touch/job-controls.js`, `touch/laser-view.js`, `touch/performance-sequences.js`, `touch/performance-observation.js`, `touch/performance-v2.css` ; tests `test-home-suivi.cjs`, `test-dashboard.cjs`, `test-dashboard-pause-guard.cjs`, `test-home-actions.cjs`, `test-job-follow.cjs`, `test-job-resume.cjs`, `test-v2-suivi*.cjs` ; parcours P7, P8 complet | Suivi retiré comme écran | grand (≈ 1 300) |
| **L6 Le reste** | Journal, Réglages, Guide, Mise en service en grands volets ; Guide réécrit pour le Poste ; anglais et espagnol complets ; documents | `touch/session-journal.js`, `touch/real-history.js`, `touch/display-settings.js`, `touch/interface-guide.js`, `touch/commissioning.js`, `touch/i18n-messages*.js` ; `PERFORMANCE-UI-SPEC.md`, `TESTING.md`, `BUGHUNT-MAP.md` ; test des codes de refus (phrase + remède) | toutes les variantes du harnais | moyen (≈ 800 + traductions) |

Pourquoi L1 héberge les anciens écrans dans des volets : c'est ce qui permet de livrer un lot à la fois sans casser la page ; chaque lot suivant remplace un volet hébergé par le volet définitif.

---

## 9. Risques et points faibles, sans complaisance

1. **Le Poste peut devenir le nouveau « bordel ».** Tout converge vers un écran ; si chaque lot y ajoute « juste une ligne », on retrouve Suivi surchargé (problème 12). Garde-fou proposé : la liste des éléments du Poste est fermée dans la spec, et le harnais vérifie qu'il ne défile jamais.
2. **La table de l'action suivante est un point de défaillance unique.** Si elle se trompe (cas 12 surtout : « zéro pièce posé pour ce fichier ? » est une heuristique sur le journal), elle pousse l'opérateur qui ne lit pas vers le mauvais geste, avec un gros bouton. Elle doit être testée cas par cas, et « Démarrer » ne doit jamais sortir d'un cas incertain.
3. **Les grands volets sont des écrans déguisés.** Fichiers, Zéro pièce, Reprendre couvrent tout le Poste ; aller de Fichiers à Zéro pièce coûte un toucher de plus qu'un rail (« ← Poste », puis « Zéro pièce »). P5 depuis un autre volet coûte 4.
4. **Le rail disparaît** : l'opérateur qui avait appris Préparer / Suivi perd ses repères ; captures, tests et `screens.json` du harnais sont à refaire en grande partie (L1 est gros et risqué).
5. **Allègement des confirmations** : il dépend de la détection du client local (D3) et d'une relecture de sûreté ; refusé, il retire l'essentiel du gain de P4, P5 et P7.
6. **Tuiles qui lancent** : un toucher sur une tuile ouvre un dialogue de palpage. Un toucher égaré ne fait rien bouger (le dialogue demande un second bouton), mais l'habitude « tuile = choisir » des versions actuelles est cassée.
7. **Le dessin de départ ne voit pas le bloc.** Il montre la fenêtre admise autour de la fraise ; si le bloc n'est pas où l'opérateur le croit, rien ne le détecte avant le contact (piège n° 4 de `VEILLE.md`).
8. **Place en v1 à 648 px et en texte agrandi** : les cartes à 150 px et la colonne C (tuiles de 88 px) sont calculées au pixel près ; en texte agrandi ou en espagnol, les lignes d'état des cartes devront être tronquées. Non mesuré.
9. **Règle unique du rendu** : monter la v2 (WebGL) pendant un usinage, après un rechargement, n'a jamais été fait aujourd'hui ; si le coût mesuré est trop haut, il faudra une exception, donc une seconde règle.
10. **Cotes du bloc** : P3 à 8 touchers suppose des cotes nominales connues ; sinon 14 touchers et 3 mesures au pied à coulisse.
11. **Vérification automatique des reprises et contrôle par fichier** : quelques requêtes de plus (`resumePlan`, `check`) au repos ; sans effet sur la machine, mais à compter par le chantier C.
12. **Deux bandeaux d'information perdus** : Avance et nom du fichier ne sont plus visibles quand un grand volet est ouvert ; on compte sur le fait qu'un usinage ferme les volets.

---

## 10. Ce qui n'a pas été vérifié

- Aucune maquette, aucun rendu : les tailles des fils de fer sont calculées, pas mesurées dans un navigateur ; rien n'a été lancé (ni tests, ni harnais).
- Les comptes « après » sont déduits de cette conception, pas rejoués. Les comptes « avant » sont repris de `ERGONOMIE.md`, sans recomptage.
- Que `{action:"check"}` sur un fichier de la bibliothèque rende le verdict avec le zéro actuel dans le format attendu par la carte 4 : lu dans `COMMANDES-MACHINE.md`, pas dans le code.
- Que le serveur sache dire « client en boucle locale » à la page (supposé par D3, non lu).
- Que la RT soit un client local de son propre serveur (sinon la case reste chez elle).
- Les cotes nominales du bloc de palpage de l'opérateur, et les valeurs « sûres » des vitesses et distances (à fixer dans la spec, dans les bornes du serveur).
- Le comportement de Grbl sur la LUNYEE pour `$I` et `$$` en alarme (A1-8 le dit non vérifié).
