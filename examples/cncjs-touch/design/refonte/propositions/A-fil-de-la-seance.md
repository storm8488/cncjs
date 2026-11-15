# Proposition (a) — Le fil de la séance

Phase 2 (preuves et conception), 2026-11-15. Angle imposé : l'interface est une suite d'étapes dans l'ordre du travail. Base lue : `PROMPT-REFONTE-UI.md`, `ERGONOMIE.md` (comptes « avant »), `VEILLE.md` § 3-4, `TEXTES.md` § 2 et § 4, `audit/COMMANDES-MACHINE.md` et `commandes-machine.json` (65 lignes), résumés de A1 à A4, captures `avant` (Suivi v2 en travail, Sonde v2 bloc prêt, Préparer v1 laser). Ce document ne contient aucun code et ne modifie aucun fichier existant. Ce qui n'est pas vérifié est au § 10.

Conventions de comptage : celles de `ERGONOMIE.md` (un toucher = un appui sur une cible ; la saisie de chiffres comptée à part ; les flèches de déplacement non comptées ; les gestes physiques sur la machine nommés, non comptés).

---

## 1. Le principe et l'arborescence

### 1.1 Le principe en cinq lignes

1. Le rail devient **le fil** : cinq étapes numérotées dans l'ordre du travail — 1 Machine, 2 Fichier, 3 Zéro pièce, 4 Contrôle, 5 Usinage — chacune avec son état écrit dessous (« Prête ✓ », « À poser », « Dépasse Z ! »).
2. La page s'ouvre sur **la première étape qui n'est pas faite** (pendant un usinage : Usinage). Le Menu disparaît.
3. Chaque écran d'étape a **une seule action principale, toujours au même endroit** : en bas à droite (320 × 64 px). Tant que l'étape n'est pas faite, c'est l'action de l'étape ; dès qu'elle l'est, c'est « Suite : <étape> → ».
4. À gauche de ce bouton, la **ligne « Il manque »** : une phrase et le bouton qui lève l'obstacle, sur place. Aucun refus ne renvoie ailleurs par du texte.
5. Ce qui est rare (Journal, Réglages, Mise en service, Guide, Macros, sauvegarde des sondes) est **hors du fil**, sous « Plus », en bas du rail. Le fil n'est pas un assistant verrouillé : on touche n'importe quelle étape à tout moment ; seules les gardes du serveur interdisent.

### 1.2 Arborescence

```
Toujours visible
├── Bandeau (72 px) : état · âge · Broche · Vitesse · [LA MAIN · <qui>] · [Pause | Reprendre… | Remise en route] · [Arrêter] · [cadenas] · heure
└── Fil (rail de 128 px) : ① Machine  ② Fichier  ③ Zéro pièce  ④ Contrôle  ⑤ Usinage  ···  [Plus]

① Machine (écran)                 liste « Pour que la machine soit prête », encart « Ce qui s'est passé »
   ├── volet  Détails de la machine (port, version, course des axes, réglages lus) ← remplace l'écran Limites
   ├── dialogue Prise d'origine machine        ├── dialogue Déverrouiller sans prise d'origine
   └── (en ligne) choix du port à la connexion
② Fichier (écran)                 liste des fichiers · aperçu · emprise et profondeur · verdict après chargement
   ├── volet  Ajouter un fichier   ├── volet Détails du fichier (aperçu, régénérer, empreinte)
   └── dialogues existants : Fiche du projet, aperçu agrandi (fixe / 3D)
③ Zéro pièce (écran)              positions et zéros · croix de déplacement · carte Sonde (bloc et plaque)
   ├── volet  Ma sonde (assistant, 3 pages)    ├── volet Diagnostic de la sonde (guidé)
   ├── volet  Autres zéros (à l'origine machine) ├── volet Vitesse de déplacement
   └── dialogues Poser le zéro · Palper au bloc · Zéro Z à la plaque
④ Contrôle (écran)                dessin de l'emprise dans la machine (dessus + côté), verdict par axe
   ├── volet  Détails du contrôle (lignes non suivies, codes)   [laser : dialogue Cadrage]
   └── dialogues Démarrer l'usinage · Lancer malgré le dépassement (D1)
⑤ Usinage (écran)                 aperçu et avancement · position · corrections · bilan
   ├── volet  Reprendre à une ligne            ├── volet Détail du temps (v2)
   └── dialogue Reprendre l'usinage
Plus (écran à tuiles)             Journal · Réglages · Mise en service · Guide · Macros · Sondes enregistrées
Transverses : dialogue La main · pavé numérique · clavier texte · veille · bouclier du verrou
```

Total : 6 écrans au rail (5 étapes + Plus) et 4 sous-écrans sous Plus (Journal, Réglages, Mise en service, Guide), contre 16 sections aujourd'hui ; 11 volets ; toutes les confirmations (prise d'origine, déverrouillage, zéro, palpages, départ, dérogation, reprise, cadrage, macro) sur un seul gabarit ; les dialogues transverses actuels (pavé, clavier, fiche projet, aperçus agrandis, veille, verrou) gardés. Plus de « Retour » dans le rail : un sous-écran de Plus porte « ← Plus » dans son en-tête ; un volet se ferme par « Fermer × ».

### 1.3 Ce qui reste toujours visible, et les tailles

| Élément | Taille | Changement et raison |
|---|---|---|
| Bandeau | 72 px de haut (inchangé) | Retirés : « Fichier » (il est dans les étapes 2, 4, 5) et « Machine » (dans Machine › Détails). Ajouté : « LA MAIN · … », un vrai bouton de 160 × 48 (T12, P9). « Déverrouiller… » quitte le bandeau (P8-I3 : il menait au repos sans référence). |
| Emplacement 1 du bandeau | 120 à 200 × 64 | Pause (en travail) → Reprendre… (en pause) → **Remise en route** (en alarme ou après un arrêt : ouvre l'étape 1). Jamais vide quand il y a un geste à faire. |
| Emplacement 2 | 160 × 64 | **Arrêter**, toujours, rouge, jamais retardé ni confirmé (inchangé, `strip-guard.js`). |
| Fil | 128 px de large (aujourd'hui 88) | Cinq tuiles de 112 × 88 au pas de 100, puis « Plus » 112 × 64 en bas. Il faut 40 px de plus pour écrire l'état de chaque étape à 16 px sous son nom ; c'est l'essentiel de l'angle (« où j'en suis, ce qui manque »). |
| Zone utile | **1206 × 791** (v2) et **1206 × 648** (v1), x 144 → 1350 | 40 px de moins en largeur. Toutes les mises en page des § 2 sont faites à cette largeur. |
| Barre d'étape | 64 px en bas de chaque étape | « Il manque : … [remède] » à gauche, action principale à droite (x 1030 → 1350). |

L'action principale (en bas à droite) et Arrêter (en haut à droite) sont à plus de 600 px l'un de l'autre : l'habitude « toucher en bas à droite pour avancer » ne peut jamais arrêter ni démarrer un usinage sans dialogue (§ 6.3).

---

## 2. Fils de fer

Échelle : 1 caractère ≈ 13 px, 1 ligne ≈ 26 px ; les cotes en px sont entre parenthèses. Les écrans sont dessinés en v1 (1206 × 648, la place la plus étroite) ; ce que v2 ajoute est dit sous chaque dessin. Cibles : principale 64, secondaire 48, flèche 96, écart 12, texte 16 (agrandi 18).

### 2.1 Cadre commun (fenêtre entière, 1366 × 768)

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────┐
│[✓ Repos ](200)  ● à jour   BROCHE 0 tr/min   VITESSE 0 mm/min  [LA MAIN · Cet appareil](160×48) [Pause](120×64) [■ Arrêter](160×64) [cadenas] 14:02│ 72
├───────────┬──────────────────────────────────────────────────────────────────────────────────────────┤
│ ①    ✓   │ 3 · Zéro pièce                                              À poser            (40)      │
│ Machine   │ ─────────────────────────────────────────────────────────────────────────────────────── │
│ Prête     │                                                                                          │
│ ②    ✓   │                                                                                          │
│ Fichier   │                    contenu de l'étape : 1206 × 520 (v1) · 1206 × 663 (v2)                │
│ Chargé    │                                                                                          │
│ ③    ●   │                                                                                          │
│ Zéro pièce│                                                                                          │
│ À poser   │                                                                                          │
│ ④    ○   │                                                                                          │
│ Contrôle  │                                                                                          │
│ En attente│ ─────────────────────────────────────────────────────────────────────────────────────── │
│ ⑤    ○   │ Il manque : le zéro pièce.                              ┌───────────────────────────┐   │
│ Usinage   │                                                         │  Suite : Contrôle  →      │64 │
│ ───────── │                                                         └───────────────────────────┘   │
│ ··· Plus  │                                                               (320 × 64)                 │
└───────────┴──────────────────────────────────────────────────────────────────────────────────────────┘
   (128)
```

Tuile du fil (112 × 88) : ligne 1, numéro dans un rond et marque d'état à droite ; ligne 2, nom (16 px gras) ; ligne 3, état (16 px). Marques : `✓` fait (gris neutre, jamais vert vif) ; `●` étape suivante (contour bleu) ; `○` en attente ; `!` bloqué ou anormal (ambre, ou rouge pour une alarme, toujours avec le mot) ; `?` inconnu (hors ligne). L'étape affichée est marquée par le fond, comme aujourd'hui.

États écrits sous chaque étape (un mot ou deux) :

| Étape | États possibles |
|---|---|
| ① Machine | Hors ligne · Non connectée · Réglages ? · Alarme ! · Origine à prendre · Prise d'origine… · Prête ✓ · Main ailleurs ! |
| ② Fichier | Aucun · Choisi · Chargement… · Chargé ✓ · Autre version ! |
| ③ Zéro pièce | À poser · Posé ✓ (heure) · À vérifier ! (après prise d'origine, tant que D2 n'a pas prouvé le décalage) · Palpage… |
| ④ Contrôle | En attente (il manque fichier ou zéro) · Tient ✓ · Dépasse X/Y/Z ! · Non vérifiable ! |
| ⑤ Usinage | — · En cours 42 % · Pause · Terminé ✓ · Arrêté ligne N ! |

Règle d'invalidation (un seul endroit dans le code, § 8 L1) : changer de fichier remet ④ en attente ; poser un zéro remet ④ en attente ; une prise d'origine met ③ à « À vérifier » jusqu'à la preuve D2 ; un redémarrage de la carte remet ① à « Origine à prendre ». L'état de ④ ne vient que du contrôle du serveur sur l'instantané courant, jamais d'un calcul de la page.

### 2.2 ① Machine

État « alarme pendant un usinage, carte redémarrée » (le plus chargé) :

```
1 · Machine                                                          Alarme !
┌ Pour que la machine soit prête (720) ────────────────────┐ ┌ Ce qui s'est passé (474) ─────────────┐
│ ✓ Connectée                                               │ │ ! Alarme 2 : course dépassée en Z     │
│ ✓ Réglages lus                          [Relire](48)      │ │ La machine a redémarré.               │
│ ✓ Usinage arrêté à la ligne 1 234                         │ │ Perdu : la position de la machine.    │
│ ! Origine machine à reprendre                              │ │ Gardé : le zéro pièce (à revérifier).  │
│ ○ Zéro pièce : gardé, vérifié après la prise d'origine     │ │ Gardé : le fichier chargé.             │
│ ○ Reprendre à la ligne 1 219            [Changer…](48)    │ │                        [Détails](48)  │
│ ✓ La main : cet appareil                                  │ └───────────────────────────────────────┘
└───────────────────────────────────────────────────────────┘
 [Déverrouiller sans prise d'origine…](48)       [Détails de la machine](48)
───────────────────────────────────────────────────────────────────────────────────────────────────────
 Il manque : l'origine machine.                                    [ Prise d'origine machine… ](320×64)
```

- Chaque ligne fait 64 px ; la liste est **l'ordre de la remise en route** : la première ligne non faite est celle de l'action principale. Les lignes « Usinage arrêté » et « Reprendre à la ligne » n'existent qu'après un incident en usinage.
- « Ce qui s'est passé » n'existe qu'après une alarme, un arrêt ou un redémarrage de la carte ; il vient de l'aide d'alarme réécrite (`grbl-help.js`), sans `$X`, sans « Reset au PC » ; « La machine a redémarré » est dit quand la position est revenue à 0 (fait de terrain § 2 du prompt).
- La prise d'origine est proposée **directement depuis l'alarme** : le serveur l'accepte en alarme (`homeReady` : Idle ou Alarm, `COMMANDES-MACHINE.md` OR-04). « Déverrouiller » reste possible, en secondaire, avec la phrase « La position peut être fausse : faites ensuite la prise d'origine. »

Les autres états de l'écran ① (même gabarit, seules les lignes et le bouton changent) :

| État | Ligne en tête qui n'est pas faite | Action principale (slot) | Remarque |
|---|---|---|---|
| Hors ligne | « La tablette ne joint plus le serveur. Elle réessaie seule. » | aucune (grisée, raison écrite) ; après 30 s : « Recharger la page » | Le bandeau garde Arrêter (« État perdu »). |
| Non connectée | « Machine non connectée » | **Connecter la CNC** → la ligne devient « Ouvrir /dev/ttyUSB0 ? La machine redémarre et sera en alarme jusqu'à la prise d'origine. » | slot : **Ouvrir** ; plusieurs ports : boutons de 64 px dans la ligne, puis Ouvrir. |
| Réglages ? | « Réglages pas encore lus » | **Relire les réglages** | D4 : relus seuls au repos ; la ligne n'apparaît que si la relecture a échoué. |
| Origine à prendre | « Origine machine pas prise » | **Prise d'origine machine…** | |
| Prise d'origine… | « Prise d'origine en cours » | aucune ; Arrêter dans le bandeau | |
| Main ailleurs | « C'est PC atelier qui a la main » | **Prendre la main** | Pause et Arrêter restent possibles (dit dans la ligne). |
| Prête | toutes cochées | **Suite : Fichier →** (ou Zéro pièce si un fichier est chargé, ou Contrôle si les deux sont faits) | |

v2 : même écran ; « Détails de la machine » affiche en plus le schéma de la course (repris de la carte « Paramètres de course » actuelle).

### 2.3 ② Fichier

```
2 · Fichier                                                    Chargé ✓  planche_400x70.nc
┌ Fichiers (520) ─────────────────────────┐ ┌ planche_400x70.nc (674) ─────────────────────────────┐
│ [Rechercher…](48)      [★ Favoris](48)  │ │ ┌ aperçu (fixe en v1, 3D en v2) 420×300 ┐  Emprise    │
│ ▌vignette  planche_400x70.nc   ● chargé │ │ │                                       │  400 × 70 mm│
│ ▌vignette  ebauche_coffret.nc           │ │ │                                       │  Profondeur │
│ ▌vignette  finition_coffret.nc          │ │ │                                       │  20 mm      │
│ ▌vignette  plaque_test.nc               │ │ └───────────────────────────────────────┘  Fraise 6 mm│
│ ▌vignette  …                  (5×76)    │ │ [2D][Iso][Face][Côté][Dessus](48)   [Agrandir](48)   │
│ [← Précédents](48)   [Suivants →](48)   │ │ ! Descend 15 mm trop bas pour ce zéro pièce.         │
└─────────────────────────────────────────┘ │   [Voir le contrôle](48)                              │
 [+ Ajouter un fichier](48)  [Détails du fichier](48)  [Fiche du projet](48)                         │
───────────────────────────────────────────────────────────────────────────────────────────────────────
 Il manque : —                                                     [ Suite : Zéro pièce → ](320×64)
```

- Toucher une ligne **choisit** ; l'action principale devient **Charger ce fichier** ; après le chargement (aucun mouvement), elle devient « Suite : … → » et la ligne de verdict apparaît **dans cet écran** (l'arrivée forcée sur Suivi disparaît).
- Verdict (source unique : le contrôle du serveur fait au chargement) : « Tient dans la machine ✓ » ; « Descend 15 mm trop bas pour ce zéro pièce » ; « Course vérifiée dès que le zéro pièce sera posé » ; « Non vérifiable : origine machine pas prise » + [Prise d'origine machine…].
- « Profondeur » est nommée et écrite en grand avant même le chargement (Z min de l'aperçu) : T15.
- États : en travail, Charger est grisé avec « Un usinage est en cours. » ; « Autre version ! » si le fichier chargé n'est pas la sélection.

v2 : aperçu 3D et tableau « Sélection / Chargé dans la machine » à la place de l'aperçu fixe ; même place, mêmes boutons.

### 2.4 ③ Zéro pièce

État « prête, sonde libre, XYZ choisi » :

```
3 · Zéro pièce                                                   À poser
┌ Position pièce (360) ──────┐ ┌ Déplacer (432) ──────────────────┐ ┌ Sonde (390) ──────────────────┐
│ X   66,952   [Zéro X](64)  │ │          [ Y+ ]          [ Z+ ]  │ │ ● Libre       [Tester](48)    │
│ Y   10,000   [Zéro Y](64)  │ │  [ X− ] [ 1 mm ] [ X+ ]          │ │ [XYZ][ Z ][ X ][ Y ]  (4×88×64)│
│ Z   −1,000   [Zéro Z](64)  │ │          [ Y− ]          [ Z− ]  │ │ ┌ dessin de départ 366×150 ┐  │
│ [Zéro XYZ ici](64)         │ │   (flèches 96×96, écart 12)      │ │ │ coin du bloc, zone ≤28 mm│  │
│ [Autres zéros…](48)        │ │ Pas : [0,1][1][10][25][50](48)   │ │ └──────────────────────────┘  │
│ Position machine : Détails │ │ [Vitesse · 1000 mm/min…](48)     │ │ [ Palper au bloc XYZ… ](64)   │
└────────────────────────────┘ └──────────────────────────────────┘ │ [ Zéro Z à la plaque… ](64)   │
                                                                    │ [Ma sonde…](48)               │
                                                                    └───────────────────────────────┘
───────────────────────────────────────────────────────────────────────────────────────────────────────
 Il manque : le zéro pièce. Placez la fraise au-dessus du coin du bloc.     [ Suite : Contrôle → ](320×64)
```

Hauteurs en v1 : colonne gauche 3 × 64 + 64 + 48 + 4 × 12 = 352 ; croix 312 + pas 48 + vitesse 48 + 24 = 432 ; carte Sonde 48 + 64 + 150 + 64 + 64 + 48 + 5 × 12 = 498 ≤ 520. Largeurs : 360 + 432 + 390 + 2 × 12 = 1206.

- **Une seule action principale** : tant que le zéro n'est pas posé, « Palper au bloc XYZ… » est la seule cible pleine de l'écran ; le slot « Suite : Contrôle → » est en contour. Dès que le zéro est posé, l'inverse.
- Le bloc et la plaque sont **côte à côte** (T4, P5) ; la croix est **sur le même écran** que la sonde (P3 : plus de détour par un autre écran).
- Le choix XYZ / Z / X / Y est retenu d'une fois sur l'autre (aujourd'hui il revient à Z au rechargement, `probe-ui.js:9`) ; le libellé du bouton suit le choix.
- Le voyant de la sonde a la forme d'un voyant (pas d'un bouton) : « ● Libre », « ● Touche » (tenu 1,5 s comme aujourd'hui), « ! Touche en permanence » (ambre, avec [Pourquoi ?](48) qui ouvre le diagnostic, T9), « ? Inconnu ».
- Pendant un palpage : le bouton « Palper… » devient « Arrêter le palpage » (rouge, même place), la progression s'écrit dans le dessin (« Étape 8 / 22 · X · approche »), le bilan ensuite (« Zéro pièce posé : X 0 · Y 0 · Z 0. »), sans écran de résultats séparé (détail dans le Journal).
- Rien ne disparaît : en laser, la carte Sonde est remplacée par une carte « Laser : amenez le point sur le coin de la pièce, puis Zéro XYZ ici » ; en alarme, non référencée ou main ailleurs, les boutons restent, rayés, et la ligne « Il manque » donne la cause et le remède.

| État | Ligne « Il manque » et remède | Boutons |
|---|---|---|
| Non référencée | « Origine machine pas prise : la machine ne sait pas où elle est. » [Prise d'origine machine…](48) | croix, zéros, palpages rayés ; le remède ouvre le même dialogue que l'étape ① |
| Alarme | « La machine est en alarme. » [Remise en route](48) | tous rayés |
| Main ailleurs | « C'est PC atelier qui a la main. » [Prendre la main](48) | rayés |
| En travail | « Un usinage est en cours. » [Voir l'usinage](48) | rayés ; la croix aussi |
| Zéro à vérifier | « Zéro pièce en vérification après la prise d'origine… » puis ✓ ou « Zéro pièce illisible. » [Relire les réglages](48) | palpages et Suite rayés tant que D2 n'a pas prouvé |

v2 : identique ; le dessin de départ peut être plus grand (la zone a 143 px de plus) ; aucune vue 3D sur cet écran (la vue « Où le programme se placera » passe dans ④).

### 2.5 ④ Contrôle

État « dépassement prouvé » (D1) :

```
4 · Contrôle                                         Dépasse Z !   planche_400x70.nc · zéro posé 14:12
┌ Vue de dessus · table 408 × 396 (440×430) ────────┐ ┌ Vue de côté · Z (300×430) ┐ ┌ Verdict (442) ──────┐
│ ┌───────────────────────────────────────────────┐ │ │  0 ─ haut de la course     │ │ X  ✓ tient          │
│ │                                               │ │ │                            │ │    marge 8 mm       │
│ │        ┌──────────────┐ emprise 400 × 70      │ │ │  ── dessus de la pièce     │ │ Y  ✓ tient          │
│ │        ●──────────────┘ zéro pièce            │ │ │   ▓ fichier : 20 mm        │ │ Z  ! descend 15 mm  │
│ │                                               │ │ │  ── plus bas possible ──   │ │    trop bas         │
│ └───────────────────────────────────────────────┘ │ │   ▓▓ 15 mm de trop (rouge) │ │ Broche : le fichier │
└───────────────────────────────────────────────────┘ └────────────────────────────┘ │ demande 18 000 tr/min│
 [Détails du contrôle](48)                                                           │ la machine plafonne. │
───────────────────────────────────────────────────────────────────────────────────────────────────────
 ! Le fichier descend 15 mm plus bas que la machine ne peut aller.
   [Refaire le zéro Z](48)  [Changer de fichier](48)                       [ Démarrer l'usinage… ](rayé)
```

- Les deux dessins sont du **SVG statique tracé depuis les nombres du contrôle du serveur** (par axe : min, max, course basse, course haute ; `program-check.js` les calcule déjà), donc identiques en v1 et en v2, sans WebGL.
- « Tient ✓ » : la ligne « Il manque » dit « — » et l'action principale **Démarrer l'usinage…** est pleine.
- « Non vérifiable » (verdict `unknown`, D1) : la raison en une phrase et son remède (« Origine machine pas prise » [Prise d'origine machine…] ; « Réglages pas lus » [Relire les réglages]) ; Démarrer reste possible, mais son dialogue demande alors la case « J'ai vérifié à la main que le fichier tient » (§ 6.3).
- La dérogation D1 vit dans « Détails du contrôle » : [Lancer malgré le dépassement…](48) → dialogue à geste maintenu (§ 6.3), journalisé par le serveur.
- Laser : un bouton secondaire [Cadrage…](48) (DE-08) sous le dessin de dessus ; le contour parcouru est le rectangle dessiné.
- Rapides à 25 % conseillés pour un premier essai : une ligne du verdict, avec [Rapides 25 %](48), qui pose la correction avant le départ.

v2 : sous le dessin de dessus, la vue « Où le programme se placera » (`origin-preview.js`) peut remplacer le SVG dans la même boîte ; le verdict et la ligne « Il manque » sont les mêmes.

### 2.6 ⑤ Usinage

État « en travail » :

```
5 · Usinage                                               En cours 42 %   planche_400x70.nc
┌ Aperçu (600×400) ─────────────────────────────┐ ┌ Avancement (594) ──────────────────────────────┐
│ [2D][Iso][Face][Côté][Dessus](48) [Agrandir]  │ │ 42 %  ▓▓▓▓▓▓▓░░░░░░░   Reste 12 min            │
│                                               │ │ Position pièce  X 120,4  Y 35,0  Z −6,0        │
│        tracé, fraise, partie usinée           │ │ Vitesse  [−10][−1][ 100 % ][+1][+10]  (64)     │
│                                               │ │ Broche   [−10][−1][ 100 % ][+1][+10]  (64)     │
│                                               │ │ Rapides  [ 25 % ][ 50 % ][ 100 % ]     (48)    │
└───────────────────────────────────────────────┘ │ Usinage en cours.                     (1 ligne)│
 [ ■ Arrêter l'usinage ](600×64, rouge)           └────────────────────────────────────────────────┘
───────────────────────────────────────────────────────────────────────────────────────────────────────
 Il manque : —                                                              [ Pause ](320×64, ambre)
```

| État | Encart et slot |
|---|---|
| Pas démarré | « Rien en cours. » ; slot **Suite : Contrôle →** |
| Pause | « Pause. La broche tourne toujours. » [Arrêter la broche](48) (M5, visible et rayé avec raison hors des cas où il sert) ; slot **Reprendre…** |
| Pause du programme (M0/M6) | « Le fichier demande une pause (changement d'outil ?). » ; slot **Reprendre…** |
| Alarme en usinage | encart rouge « Alarme 2 : course dépassée en Z. » ; ligne « Il manque : arrêter l'usinage » [Arrêter l'usinage](48) ; slot **Remise en route →** (ouvre ①) |
| Arrêté | bilan « Arrêté à la ligne 1 234 sur 25 000. » [Reprendre à une ligne…](48) ; slot **Remise en route →** si la machine n'est pas prête, sinon **Reprendre à la ligne 1 219…** |
| Terminé | bilan « Terminé en 38 min. » ; slot **Suite : Fichier →** |
| Main ailleurs | corrections rayées (« C'est PC atelier qui a la main » [Prendre la main]) ; Pause et Arrêter restent actifs |

- Les **trois rangées de corrections** sont sur l'écran **en v1 et en v2** (le volet v2 « Broche / rapides… » disparaît, § 1.5 de `ERGONOMIE.md`).
- Les messages tiennent sur **une ligne fixe** ; le reste va au Journal. Plus de zone défilante de 235 px.
- « Arrêter l'usinage » est en bas à gauche, sous l'aperçu, à plus de 400 px du slot : l'habitude « bas à droite » donne Pause, jamais Arrêter.

v2 : aperçu 3D, courbe de vitesse et « Séquence prévue » sous l'aperçu (la colonne de gauche a 143 px de plus) ; rien de plus à droite.

### 2.7 Plus

```
Plus
┌ Journal (380×160) ─┐ ┌ Réglages (380×160) ─┐ ┌ Mise en service (380×160) ┐
└────────────────────┘ └─────────────────────┘ └───────────────────────────┘
┌ Guide (380×160) ───┐ ┌ Macros (380×160) ───┐ ┌ Sondes enregistrées ──────┐
└────────────────────┘ └─────────────────────┘ └───────────────────────────┘
 Version 2027.11 · page v2v · installée le 15/11                  (une ligne, 16 px)
```

Macros grisé « Aucune macro dans CNCjs. » écrit sur la tuile (A2-15). Les sous-écrans gardent leur contenu (Réglages : cohérence seulement).

### 2.8 Dialogues et volets

Gabarit commun des confirmations (§ 6.3) — 640 px de large, centré, bandeau et Arrêter restent utilisables par-dessus :

```
┌ Lancer la prise d'origine machine ────────────────────────────── 15 s ┐
│ La machine va chercher ses fins de course, Z d'abord.                  │
│ Dégagez la table et gardez la main près de l'arrêt d'urgence.          │
│                                                                        │
│ [Annuler](160×48)                       [ Lancer la prise d'origine ](320×64) │
└────────────────────────────────────────────────────────────────────────┘
```

Le bouton qui engage est **nommé par son effet**, placé en bas à droite du dialogue, jamais sous le doigt qui a ouvert le dialogue, et il ne s'arme qu'après 400 ms (un double toucher ne confirme pas).

| Dialogue ou volet | Contenu (FR exact) | Boutons |
|---|---|---|
| Poser le zéro | « Poser le zéro X ici · X pièce 66,952 → 0 · Aucun axe ne bouge. » | [Annuler] [Poser le zéro X] |
| Palper au bloc | dessin de départ (coin, zone de 28 mm, trajet) ; si le test est dû : « Faites toucher le bloc à la fraise, puis relâchez. » avec le voyant en direct ; le bouton s'arme seul quand le serveur a vu contact puis libre | [Annuler] [Lancer le palpage XYZ] |
| Zéro Z à la plaque | « Épaisseur de la plaque » [5,0 mm](48, repris) ; « Descente au plus » [10 mm](48) | [Annuler] [Lancer le zéro Z] |
| Démarrer l'usinage | fichier, zéro posé à 14:12, « Tient dans la machine ✓ », rapides | [Annuler] [Lancer l'usinage] ; si non vérifiable, la case avant |
| Lancer malgré le dépassement | le dessin de côté et « 15 mm de trop en Z : l'outil va heurter la limite. » | [Annuler] [Maintenir 2 s pour lancer malgré tout] |
| Reprendre l'usinage | « La broche se remet à tourner si elle était arrêtée. » | [Annuler] [Reprendre l'usinage] |
| Déverrouiller | « La position peut être fausse. Faites ensuite la prise d'origine. » | [Annuler] [Déverrouiller] |
| La main | « PC atelier a la main depuis 14:02. Pause et Arrêter restent possibles ici. » | [Fermer] [Prendre la main] (motif « Opérateur devant la machine » envoyé) |
| Volet Ma sonde | page 1 « Où est le bloc sur la pièce ? » : 4 coins dessinés (180 × 120 chacun) ; page 2 « Mesures du bloc » : dessin coté + Épaisseur, Paroi X, Paroi Y, Diamètre de la fraise (champs 48, valeurs positives, le signe vient du coin) ; page 3 « Vitesses et distances » : préremplies (D4), [Modifier](48) ; | [← Retour] [Suivant →] / [Enregistrer et palper](64) |
| Volet Diagnostic de la sonde | une consigne à la fois, voyant en direct : « Écartez le bloc de la fraise. » → « Retirez la pince de la fraise. » → « Débranchez la broche : son câble met la fraise à la masse. » ; à chaque consigne [C'est fait](64) ; dès que le voyant passe à Libre : « Trouvé : … Laissez-la débranchée pour palper, rebranchez-la avant d'usiner. » ; branche « jamais de contact » : touchez le bloc → pince → câble branché | [C'est fait] [Fermer] |
| Volet Autres zéros | « X = origine machine », « Y = origine machine », « Z = origine machine » (64), « Aucun axe ne bouge » | ouvre « Poser le zéro » |
| Volet Reprendre à une ligne | « Ligne proposée : 1 219 (arrêt à 1 234, quinze mouvements avant). » [Changer la ligne](48) ; le plan est vérifié dès l'ouverture (RL-02) : « La fraise montera, ira au-dessus du point, descendra, puis reprendra. » | [Charger la reprise](64) |

---

## 3. Les dix parcours sur la proposition

Comptes « avant » : `ERGONOMIE.md` § A (tablette CNC, v2). Écrans : écrans d'étape traversés + volets et dialogues.

| Parcours | Avant (touchers / saisies / écrans / impasses) | Proposition (touchers / saisies / écrans / impasses) |
|---|---|---|
| P1 Mise en route | 6 (10 si CNCjs a redémarré) / 0 / 2 + 1 dialogue / 3 | **4** (4 si D4 et A1-8 corrigés, sinon 7) / 0 / 1 + 1 dialogue / 0 |
| P2 Fichier | 3 (4 pour le verdict) / 0 / 2 / 2 | **3** verdict compris / 0 / 1 / 0 |
| P3 Bloc, première fois | 35 + détour ≥ 3 / 9 / 3 + 1 dialogue / 5 | **14** / 4 / 1 + 1 volet + 1 dialogue / 0 |
| P4 Bloc, fois suivantes | 6 + détour / 0 / 2 + 1 / 3 | **3** / 0 / 1 + 1 dialogue / 0 |
| P5 Zéro Z plaque | 3 (Suivi), 4 ailleurs / 0 / 1 + 1 / 3 | **3** de partout (2 depuis ③) / 0 / 1 + 1 / 0 |
| P6 Zéros à la main | 4 + flèches ; XYZ 3 ; origine machine impossible / 0 / 1 + 1 / 2 | **3** ; XYZ 3 ; origine machine **4** / 0 / 1 + 1 / 0 |
| P7 Contrôle et départ | 9 / 0 / 1 + 2 / 2 | **8** (7 depuis ④) / 0 / 2 + 2 / 0 |
| P8 Après une alarme | 12 / 0 / 2 + 2 / 5 | **8** / 0 / 3 + 1 volet + 2 / 0 |
| P9 Pilotage | 3 / 0 / 0 + 1 / 2 | **2** / 0 / 0 + 1 / 0 |
| P10 Sonde qui ne répond pas | 3, sans guidage / 0 / 3 / totale | **2** pour le diagnostic + 1 « C'est fait » par consigne (≤ 3) / 0 / 1 + 1 volet / 0 |

Aucun parcours fréquent ne prend plus de touchers qu'aujourd'hui. P6 « un axe ici » gagne 1 toucher en v2, 0 en v1 (la croix est déjà visible en v1).

### P1. Mise en route (tablette allumée, port fermé)

La page s'ouvre sur ① (première étape non faite). Ligne en tête : « Machine non connectée ».
1. Slot **Connecter la CNC** → ligne « Ouvrir /dev/ttyUSB0 ? La machine redémarre et sera en alarme jusqu'à la prise d'origine. » (port de la mise en service reconnu ; sinon + 1 toucher sur le port, 64 px).
2. Slot **Ouvrir** → « Connectée ✓ » ; bandeau « Alarme » ; relecture automatique de la version et des réglages (D4) ; ligne en tête « Origine machine pas prise ».
3. Slot **Prise d'origine machine…** → dialogue.
4. **Lancer la prise d'origine** → bandeau « Prise d'origine » ; puis « Repos », ① « Prête ✓ », slot « Suite : Fichier → ».

Refus possibles et leur remède sur place : port absent → « La CNC n'est pas branchée ou pas allumée. » [Chercher à nouveau](64) ; réglages non lus (si la relecture automatique échoue en alarme, A1-8 non corrigé) → « Les réglages de la machine ne sont pas lus. » [Déverrouiller…] puis [Relire les réglages] dans la même liste (+ 3 touchers : 7) ; prise d'origine refusée car la broche tourne → « La broche tourne : arrêtez-la d'abord. » [Arrêter la broche](48) ; main ailleurs → [Prendre la main]. Ce que l'opérateur lit : une ligne par toucher.

### P2. Fichier (depuis ① prête)

1. Slot **Suite : Fichier →** (ou le fil) → liste ; l'aperçu du fichier sélectionné, son emprise et sa **profondeur** en grand.
2. Ligne du fichier → aperçu, « Emprise 400 × 70 mm · Profondeur 20 mm ».
3. Slot **Charger ce fichier** → sans quitter l'écran : « Tient dans la machine ✓ » ou « Descend 15 mm trop bas pour ce zéro pièce » [Voir le contrôle], ou « Course vérifiée dès que le zéro pièce sera posé ». ④ change d'état dans le fil.

Refus : « Un usinage est en cours. » (Charger rayé) [Voir l'usinage] ; « C'est PC atelier qui a la main. » [Prendre la main] ; « La machine n'est pas connectée. » [Connecter la CNC] (ouvre ① et lance la même action).

### P3. Origine au bloc, première fois (profil vide, machine prête, fichier chargé)

1. Fil **③ Zéro pièce** → XYZ choisi par défaut ; flèches sur le même écran pour amener la fraise au-dessus du coin (non comptées).
2. **Palper au bloc XYZ…** → le profil est incomplet : le volet « Ma sonde » s'ouvre à la page 1 (aucun refus ; « Il faut d'abord décrire votre bloc, une seule fois »).
3. Page 1 : toucher le **coin** dessiné (avant gauche…) → page 2 (le sens de recherche est déduit du coin).
4-11. Page 2 : Épaisseur, Paroi X, Paroi Y, Diamètre de la fraise → 4 × (champ + saisie + Valider) = 8 touchers, 4 saisies.
12. **Suivant →** → page 3, vitesses et distances préremplies (D4).
13. **Enregistrer et palper** → le dialogue « Palper au bloc » s'ouvre, avec le dessin de départ ; « Faites toucher le bloc à la fraise, puis relâchez. » (geste physique ; le bouton s'arme seul).
14. **Lancer le palpage XYZ** → progression dans la carte, puis « Zéro pièce posé : X 0 · Y 0 · Z 0. » ; ③ « Posé ✓ 14:12 ».

Impasses levées : I1 (valeurs proposées et dessin coté), I2 (aucun champ caché, coin non demandé pour Z seul), I3 (test dans le dialogue), I4 (dessin de la zone de départ), I5 (refus dans le dialogue avec son bouton). Refus : « La fraise n'est pas au bon endroit : placez-la au-dessus du coin, à moins de 28 mm des deux bords. » [Voir le dessin de départ] ; « La sonde touche déjà. » [Pourquoi ?] ; « Le palpage sortirait de la machine en Y : éloignez la fraise du bord. » + le dessin de la course (au lieu de « Y irait de −5,9 à 35,9 mm machine », T7).

### P4. Origine au bloc, fois suivantes (depuis n'importe quel écran)

1. Fil **③ Zéro pièce** (XYZ retenu ; flèches sur place). 2. **Palper au bloc XYZ…** → dialogue ; si le dernier test a plus de 10 min, la consigne « Faites toucher le bloc… » et le voyant (geste, 0 toucher). 3. **Lancer le palpage XYZ**. Total : 3 touchers (cible ≤ 4).

### P5. Zéro Z seul à la plaque (entre ébauche et finition, depuis Usinage)

1. Fil **③ Zéro pièce**. 2. **Zéro Z à la plaque…** (à côté du bloc) → dialogue, épaisseur reprise. 3. **Lancer le zéro Z**. La première fois : + 2 touchers et 1 saisie (épaisseur). Refus : « La sonde touche déjà. » [Pourquoi ?] ; « Origine machine pas prise. » [Prise d'origine machine…] (le zéro Z à la plaque exigera la référence après A1-6 : la refonte l'affiche déjà). La carte ne disparaît plus (T11).

### P6. Zéros à la main

Un axe : 1. **③**, flèches, 2. **Zéro X**, 3. **Poser le zéro X**. Trois axes : 3 + 2 + 2 = 7, ou **Zéro XYZ ici** + confirmer = 3. Axe à l'origine machine (D4, T13) : 1. **③**, 2. **Autres zéros…**, 3. **X = origine machine**, 4. **Poser le zéro X** (« X pièce = X machine · Aucun axe ne bouge »). Refus : non référencée → « Origine machine pas prise : la machine ne sait pas où elle est. » [Prise d'origine machine…] (le zéro à l'origine machine n'a de sens qu'après elle).

### P7. Contrôle et départ (fichier chargé, zéro posé)

1. Fil **④ Contrôle** (ou « Suite : Contrôle → ») → dessin et verdict. S'il dépasse : Démarrer rayé, « Le fichier descend 15 mm plus bas que la machine ne peut aller. » [Refaire le zéro Z] [Changer de fichier] — **avant** tout dialogue, sans compte à rebours.
2. **Démarrer l'usinage…** → dialogue. 3. **Lancer l'usinage** → la page passe sur ⑤.
4. Bandeau **Pause** (ou slot). 5. **Reprendre…** (même place). 6. **Reprendre l'usinage**. 7. **Arrêter**. 8. Une correction (vitesse, broche ou rapides : 1 toucher chacune, en v1 et en v2).

Total 8 avec la navigation (avant : 9 sans navigation, Suivi supposé ouvert ; 11 pour une correction de broche en v2).

### P8. Après une alarme en plein usinage (ALARM:2, carte redémarrée)

État : bandeau « Alarme 2 », emplacement 1 « Remise en route », ⑤ encart rouge, ① « Alarme ! » dans le fil.
1. Ligne « Il manque » de ⑤ : **Arrêter l'usinage** (ou Arrêter du bandeau) → « Arrêté à la ligne 1 234 ».
2. Slot **Remise en route →** → ① : « Ce qui s'est passé » (alarme 2, la machine a redémarré, perdu / gardé) et la liste ordonnée.
3. Slot **Prise d'origine machine…** (depuis l'alarme, sans Déverrouiller). 4. **Lancer la prise d'origine** → Repos ; la ligne « Zéro pièce » passe à « gardé ✓ » quand le serveur a prouvé le décalage (D2), sinon « à refaire » [Aller au zéro pièce].
5. Slot **Reprendre à la ligne 1 219…** → volet ; le plan est vérifié à l'ouverture. 6. **Charger la reprise** → la page passe sur ④ avec le contrôle de la reprise.
7. **Démarrer l'usinage…** 8. **Lancer l'usinage**.

Impasses levées : I1 (liste ordonnée), I2 (plus de « Reset au PC » ; « La machine a redémarré » dit en clair), I3 (Déverrouiller n'est plus le bouton vert du bandeau), I4 (ligne « Zéro pièce gardé / à refaire »), I5 (la reprise porte sur le programme arrêté, pas sur la sélection, A2-9).

### P9. Pilotage

Qui a la main : bandeau « LA MAIN · PC atelier » (ambre quand c'est un autre). 1. Ce bouton (ou le [Prendre la main] de n'importe quel refus). 2. **Prendre la main** → le motif « Opérateur devant la machine » part avec la demande. Sur l'appareil qui n'a pas la main, tous les boutons machine sont rayés avec « C'est PC atelier qui a la main. » ; plus de « Démarrer… » vert.

### P10. Sonde qui ne répond pas comme prévu

Contact permanent : 1. **③** → voyant « ! Touche en permanence » et [Pourquoi ?]. 2. **Pourquoi ?** → volet, consigne 1 « Écartez le bloc de la fraise. » ; voyant toujours en contact → 3. **C'est fait** → « Retirez la pince. » → 4. **C'est fait** → « Débranchez la broche : son câble met la fraise à la masse. » → 5. **C'est fait** → voyant Libre : « Trouvé : la broche. Laissez-la débranchée pour palper, rebranchez-la avant d'usiner. » [Fermer]. Jamais de contact (après « La sonde n'a rien touché sur 10 mm en X ») : [Tester la sonde] → « Touchez le bloc avec la fraise. » → « Vérifiez la pince sur la fraise. » → « Vérifiez que le câble de la sonde est branché. » → « La machine ne voit pas la sonde : faites vérifier le câblage. » [Détails] (entrée sonde). Le test de l'assistant de mise en service et celui-ci deviennent un seul volet.

---

## 4. Le journal de terrain : pourquoi chaque ligne ne se reproduit plus

| # | Ce qui change | Part de l'organisation / part du chantier A |
|---|---|---|
| T1 | Le réglage de luminosité n'apparaît que sur la page locale du kiosque ; une page distante l'affiche grisé « Réglable seulement sur la tablette ». | Organisation : retirer la tentation. Le fond est D3 et A3-1, A3-2 (serveur et hôte). |
| T2 | Le dépassement est dit dans ② dès le chargement, dans le fil (④ « Dépasse Z ! ») et dans ④ en dessin ; Démarrer est refusé, avec deux remèdes. | D1 côté serveur (A1-1, A1-5 marge) ; la page n'active plus Confirmer sur une case (A2-1). |
| T3 | Plus de dialogue rouge « X inconnu, Y inconnu, Z hors course » : après une prise d'origine, ③ affiche « À vérifier » puis « Posé ✓ » quand le décalage est prouvé. | D2 (A1-2, A2-2), A1-3. |
| T4 | Bloc et plaque sont côte à côte sur ③ avec la croix. | Organisation seule. |
| T5 | Assistant « Ma sonde » : coin dessiné, 4 mesures positives, vitesses préremplies. | D4 (défauts) + organisation. |
| T6 | Test du contact dans le dialogue, voyant en direct ; un refus s'écrit dans le dialogue avec son bouton, et le bouton refusé est rayé. | Organisation + A2-3, A2-4, A2-13. |
| T7 | Refus de course du palpage en dessin et en mots (« éloignez la fraise du bord »), plus en coordonnées machine. | Organisation ; A1-11 (enveloppe trop large). |
| T8 | Dessin de la zone de départ (28 mm) sur la carte et dans le dialogue. | Organisation ; le serveur a déjà élargi la fenêtre (`3049a0e4`). |
| T9 | Voyant « Touche en permanence » + [Pourquoi ?] → consigne « Débranchez la broche ». | D4 (diagnostic guidé). |
| T10 | Relecture automatique ; sinon ligne « Réglages pas lus » avec son bouton dans ①, jamais masqué. | D4 et A1-8 (relecture en alarme). |
| T11 | « Zéro Z à la plaque… » ne disparaît plus : rayé, la raison et le remède dans la ligne « Il manque ». | Organisation + A2-5. |
| T12 | « LA MAIN · … » est un bouton ; chaque refus de main porte [Prendre la main]. | Organisation + A2-6, A2-18. |
| T13 | Volet « Autres zéros » : « X = origine machine ». | D4. |
| T14 | Plus › une ligne « Version … installée le … » ; la bande « Nouvelle version installée — Recharger » s'affiche au repos ; le rechargement se fait seul quand rien n'est en cours. | A3-3, A3-4 et le mécanisme `VERSION.json` de A3 § 2.2 ; suffixe unique `v2v`. |
| T15 | Profondeur nommée dans ② avant le chargement ; comparée à la course dans ② et ④ dès que le zéro Z est posé. | Organisation + D1. |

---

## 5. Vocabulaire

### 5.1 Navigation, actions principales, états

Un mot par notion, tirés du glossaire de `TEXTES.md` § 2.1.

| Notion | Libellé retenu | Écarté |
|---|---|---|
| Étapes du fil | « Machine », « Fichier », « Zéro pièce », « Contrôle », « Usinage », « Plus » | Menu, Préparer, Suivi, Sonde (comme écran) |
| Origine de la machine | « Prise d'origine machine… », état « Origine machine pas prise » | $H, référencer, référencée |
| Point de départ du programme | « zéro pièce », « Zéro X », « Zéro XYZ ici », « X = origine machine » | origine de travail, repère, G54 (hors Détails) |
| Palpage | « Palper au bloc XYZ… », « Zéro Z à la plaque… », « Ma sonde… », « Tester », voyant « Libre / Touche » | profil de sonde (hors Plus), diagnostic de l'entrée |
| Programme | « fichier » (le choisir, le charger) ; « usinage » (le lancer) | programme, travail, parcours |
| Pilotage | « LA MAIN · <qui> », « Prendre la main » | Pilote, pilotage, bail |
| Course | « Tient ✓ », « Dépasse Z ! », « descend 15 mm trop bas », « dépasse de N mm à droite » | hors course, limite logicielle, mm machine |
| Alarme | « Alarme », « Remise en route », « Déverrouiller » | $X, Reset |
| Pause et arrêt | « Pause », « Reprendre… », « Arrêter », « Arrêter l'usinage » | interrompre, relancer |
| Reprise | « Reprendre à la ligne 1 219… » | redémarrer, plan de reprise |
| Engagement | bouton nommé par l'effet : « Lancer la prise d'origine », « Lancer le palpage XYZ », « Lancer l'usinage », « Poser le zéro X » | Confirmer, OK, acquitter |
| Fraise / broche | « fraise » (ce qui coupe), « broche » (le moteur) | outil (hors changement d'outil), tête |
| Vitesse | « Vitesse » (bandeau, corrections, déplacement) | avance, feed |
| État à jour | « ● à jour » / « ! ancien (5 s) » | rapport frais, périmé |
| Position | « Position pièce » ; « Position machine » dans Détails | coordonnées, MPos, WPos |
| Rare | « Plus », « Journal », « Réglages », « Mise en service », « Guide », « Détails » | paramètres, configuration, historique |

### 5.2 Les dix refus les plus fréquents

Chaque refus : une phrase dans la ligne « Il manque » (ou dans le dialogue ouvert), le bouton à côté, et « Détails » pour le code et la phrase technique.

| # | Codes du serveur | Phrase affichée | Bouton remède |
|---|---|---|---|
| 1 | `ETOUCH_MACHINE_CONNECTION`, `ETOUCH_PROBE_INPUT_DOWN` | La machine n'est pas connectée. | Connecter la CNC |
| 2 | `ECONTROL`, `ETOUCH_PROBE_PILOT`, `ETOUCH_PROBE_CONTROL` | C'est « PC atelier » qui a la main. | Prendre la main |
| 3 | `ETOUCH_CHECK_NOT_HOMED`, `ETOUCH_MOTION_POSITION_UNKNOWN`, `ETOUCH_CHECK_POSITION_UNKNOWN`, raison `homed` du palpage | Origine machine pas prise : la machine ne sait pas où elle est. | Prise d'origine machine… |
| 4 | `ETOUCH_MOTION_ALARM`, `ETOUCH_PROBE_ALARM` | La machine est en alarme. | Remise en route |
| 5 | `ETOUCH_CHECK_OUTSIDE`, `ETOUCH_CHECK_OUTSIDE_G53`, refus D1 (code à créer) | Le fichier descend 15 mm plus bas que la machine ne peut aller. (X/Y : « dépasse de 12 mm à droite ») | Refaire le zéro Z · Changer de fichier |
| 6 | refus D2 (code à créer) | Zéro pièce en vérification après la prise d'origine : patientez. Puis, si elle échoue : Le zéro pièce n'a pas pu être relu. | Relire les réglages |
| 7 | `ETOUCH_PROBE_CONTACT_AT_START`, `ETOUCH_PROBE_STUCK` | La sonde touche déjà. Écartez le bloc ; si le voyant reste allumé, voyez pourquoi. | Pourquoi ? |
| 8 | `ETOUCH_PROBE_NO_CONTACT` | La sonde n'a rien touché sur 10 mm en X. Rapprochez la fraise du bloc. | Tester la sonde |
| 9 | `ETOUCH_PROBE_WINDOW`, `ETOUCH_PROBE_DESCENT_CONTACT`, `ETOUCH_PROBE_TRAVEL` | La fraise n'est pas au bon endroit : placez-la au-dessus du coin, à moins de 28 mm des deux bords. | Voir le dessin de départ |
| 10 | raison `test` du palpage (sans code aujourd'hui), `ETOUCH_MACHINE_STALE` | Faites toucher le bloc à la fraise, puis relâchez. / La machine ne répond plus depuis 3 s : patientez. | (le voyant arme le bouton) / aucun, le bouton se réarme seul |

Les 140 codes gardent les phrases et remèdes proposés par `TEXTES.md` § 4.2 ; la refonte ajoute la règle « le remède est un bouton posé dans la ligne Il manque de l'écran où l'on a touché », et le test du § 9 du prompt (chaque code → phrase → bouton).

---

## 6. Commandes machine, disparitions, confirmations

### 6.1 Où va chacune des 65 commandes

Ce qui part vers le serveur et ses gardes ne change pas (§ 5.5 du prompt), sauf la case à cocher de la page (§ 6.3), à inscrire dans `SURETE.md`.

| ID | Place actuelle | Nouvelle place |
|---|---|---|
| CX-01, CX-02, CX-03 | Menu, barre « Connecter la CNC », choix du port, « Ouvrir » | ① ligne « Machine non connectée » : slot « Connecter la CNC », ports en boutons de 64 dans la ligne, slot « Ouvrir » |
| CX-04, CX-05 | automatique | inchangé |
| CX-06 | `#status-bar` masqué | **supprimé** (inaccessible, code mort) |
| PI-01 | `#t-pilot`, étiquette | bandeau « LA MAIN · … », bouton 160 × 48 |
| PI-02 | dialogue Pilote, motif à choisir | dialogue « La main » : « Prendre la main » envoie le motif prédéfini ; aussi depuis tout refus de main |
| PI-03 | automatique | inchangé |
| OR-01 | bandeau « Déverrouiller… » | **quitte le bandeau** ; ① bouton secondaire « Déverrouiller sans prise d'origine… » |
| OR-02 | Machine › « Déverrouiller ($X)… » | même que OR-01 (une seule place) |
| OR-03, OR-05, OR-08 | Mise en service | inchangés (Plus › Mise en service) |
| OR-04 | Machine › « Prise d'origine ($H)… » | ① slot « Prise d'origine machine… » ; ③ et ② : remède de la ligne « Il manque » (même dialogue) |
| OR-06, OR-07 | Machine (masqué), Préparer (masqué) | ① ligne « Réglages lus » [Relire] toujours visible ; remède [Relire les réglages] des refus 6 et `ETOUCH_CHECK_*` ; + relecture automatique (D4, nouvelle, au serveur) |
| DE-01 à DE-05 | Préparer, croix (v2 : derrière « Déplacer la machine… ») | ③ croix toujours visible ; mêmes sélecteurs `.jog[data-axis][data-dir]` |
| DE-06 | automatique | inchangé |
| DE-07 | pas, vitesse de déplacement | ③ rangée des pas ; volet « Vitesse de déplacement » |
| DE-08 | Suivi › cadrage laser | ④ (laser) [Cadrage…] |
| ZE-01, ZE-02 | Préparer « Zéro X/Y/Z », « Zéro XYZ » | ③ colonne Position pièce |
| ZE-03 | Préparer v2 `#pv2-tool-zero` | **supprimé** (doublon de ZE-02) |
| ZE-04 | dialogue « Définir l'origine de travail » | dialogue « Poser le zéro » (mêmes deux temps, textes réécrits) |
| ZE-05 | `#pv2-set-xy`, `#pv2-jog-open/close` | **supprimés** (navigation v2 seule) |
| (nouveau, D4) | — | ③ « Autres zéros… » › « X = origine machine » |
| PA-01 | Suivi, carte de la plaque | ③ « Zéro Z à la plaque… » ; champs dans le dialogue |
| PA-02 | Sonde « Zéro Z avec plaque → Suivi » | **supprimé** (la plaque est à côté) |
| PA-03 | Sonde « Palper… » | ③ « Palper au bloc XYZ… » |
| PA-04 | Sonde « Arrêter le palpage » | ③ même place que « Palper… » pendant le palpage + Arrêter du bandeau |
| PA-05 | profils, diagnostic, résultats, transfert | volets « Ma sonde » et « Diagnostic » ; résultat dans la carte ; transfert : Plus › Sondes enregistrées |
| PA-06 | automatique | inchangé |
| FI-01 | Fichiers « Charger et ouvrir le Suivi » | ② slot « Charger ce fichier » (reste sur ②) |
| FI-02, FI-03 | relais Suivi, volet Préparer le travail | **supprimés** (doublons) |
| FI-04 | volet Détails de l'aperçu › `#job-port` | ① volet « Détails de la machine » |
| FI-05 | envoi, régénération de l'aperçu | ② volet « Détails du fichier » |
| EX-01 | dialogue commun, case + Confirmer | dialogue au gabarit du § 2.8, par classe (§ 6.3) |
| EX-02 | Suivi « Démarrer… » (relais vers `#job-start` caché) | ④ slot « Démarrer l'usinage… », **appel direct** (le relais disparaît, A2 piste 11) |
| EX-03 | bandeau, Suivi | bandeau emplacement 1 + slot de ⑤ |
| EX-04 | bandeau, Suivi | même emplacement que Pause, devenu « Reprendre… » |
| EX-05 | bandeau, Suivi, aperçu agrandi | bandeau + « Arrêter l'usinage » sous l'aperçu de ⑤ + aperçu agrandi |
| EX-06 | Suivi, apparaît selon le cas | ⑤ encart de pause, toujours là en pause, rayé avec raison sinon |
| EX-07 | Préparer › Macros… | Plus › Macros |
| CO-01, CO-02, CO-03 | Suivi (v2 : broche et rapides dans un volet) | ⑤ trois rangées, v1 et v2 ; rapides 25 % aussi depuis ④ |
| RL-01, RL-02, RL-03 | Suivi, masqué sans sélection | ⑤ bilan d'arrêt et ① liste : « Reprendre à la ligne N… » → volet ; RL-02 lancé à l'ouverture |
| RM-01 | Réglages › Type de machine | inchangé |
| RM-02 à RM-05 | Mise en service | inchangés |
| SY-01 à SY-05 | Réglages, veille | inchangés (SY-01 grisé avec raison hors du kiosque local, D3) |
| SY-06 | cadenas du bandeau | inchangé |

### 6.2 Ce qui disparaît, et pourquoi

| Disparaît | Pourquoi |
|---|---|
| Écran **Menu** (tuiles, barre de connexion, barre « Reprendre où j'en étais ») | Le fil montre l'état de chaque étape ; la page s'ouvre sur l'étape suivante. La connexion va dans ①. |
| Écran **Préparer**, sa vue de comparaison v2 et son résumé « 1 · 2 · 3 » | Partagé entre ③ (déplacer, zéros) et ④ (où le programme se place). |
| Écran **Sonde** et ses cinq sous-écrans (Profils à 3 onglets, Diagnostic en lecture seule, Résultats, Transfert, Préparation inaccessible) | Carte Sonde de ③ + deux volets ; Transfert dans Plus. |
| Écran **Limites** et la carte « Paramètres de course » (doublon) | Volet « Détails de la machine ». |
| Volet **« Préparer le travail »** (5 étapes, deux cases qui n'engagent rien) | C'est le fil lui-même. |
| Volets « Comprendre l'origine », « Fonctions de la machine » | Paragraphes ; le Guide (Plus) les reprend en une page par étape. |
| Volet v2 « Broche / rapides… » | Les rangées sont sur ⑤. |
| Bouton « Retour » du rail ; les liens « Ouvrir le suivi → », « Journal des événements → » de Machine | Plus de sous-écrans d'étape. |
| Valeurs « Fichier » et « Machine » du bandeau ; « Déverrouiller… » du bandeau | Place pour « LA MAIN » ; Déverrouiller menait au repos sans référence. |
| Relais vers `#job-load`, `#job-start`, `#job-pause`, `#job-resume`, `#job-stop` cachés dans Fichiers | Un bouton, un appel ; les tests sont migrés dans le même lot. |
| Zone de messages défilante de Suivi v2 | Une ligne fixe ; le reste au Journal. |
| Textes : « Bornes de saisie du logiciel… », « Sans champ Pn… », « Acquitté = accepté par Grbl… », « Ligne acquittée », « Géométrie inconnue », « Séquences non préparées », « Hypothèse : zéro X Y à la position de l'outil », « Reset dans CNCjs au PC », « (G10 L20 P1 X0) », tous les `($X)`, `($H)`, `($$)` des boutons | Principe 5 ; ce qui est vrai et utile passe dans « Détails ». |

### 6.3 Confirmations, classe par classe

Aujourd'hui : bouton, case `#job-check`, « Confirmer » `#job-confirm` en 15 s pour toute commande (3 touchers) ; zéro : 2 touchers. Le serveur garde **dans tous les cas** son ticket en deux temps (`prepare` puis nonce, 15 s, lié au flux, gardes refaites au second temps). Seule la case de la page change.

| Classe | Commandes | Avant | Proposition | Justification de sûreté |
|---|---|---|---|---|
| Arrêt et pause | EX-03, EX-05, PA-04, M5 (EX-06) | 1 | **1** (inchangé) | Ne jamais ralentir l'arrêt. |
| Sans mouvement, sans risque | charger (FI-01), relire (OR-06), corrections (CO-*), type de machine (RM-01) | 1 | **1** (inchangé) | Rien ne bouge ; le serveur garde ses refus. |
| Sans mouvement, change le zéro | ZE-01, ZE-02, ZE-04, zéro à l'origine machine | 2 | **2** (inchangé) | « Aucun axe ne bouge » est dit ; une erreur se rattrape en reposant le zéro, et ④ revient « En attente ». |
| Libère la machine | Déverrouiller (OR-01, OR-02) | 3 | **2** : bouton → « Déverrouiller » | $X ne bouge rien. Le danger est d'usiner ensuite sans référence : D2 (pas de départ, palpage ni reprise sans décalage prouvé) et les refus de position inconnue le couvrent ; le dialogue le dit. Le bouton n'est plus l'action verte du bandeau. |
| Mouvement automatique sans coupe | prise d'origine (OR-04), palpages (PA-01, PA-03), cadrage laser (DE-08) | 3 | **2** : bouton → « Lancer … » nommé par l'effet, armé après 400 ms, hors de la place du premier toucher | La case n'apporte aucune information ; le second geste reste délibéré et différent du premier ; la zone de départ est dessinée dans le dialogue ; Arrêter reste au-dessus. Le compte à rebours du ticket reste affiché. |
| Fait tourner la broche et coupe, verdict « tient » | Démarrer (EX-02), Reprendre (EX-04), reprise à la ligne (RL-03 puis EX-02) | 3 | **2** : « Démarrer l'usinage… » → « Lancer l'usinage » | Le verdict a été montré avant, en dessin, dans ④ ; le dialogue le répète en une ligne. Un dépassement prouvé n'atteint plus ce dialogue (D1). |
| Idem, verdict « non vérifiable » | EX-02 | 3 | **3** : case « J'ai vérifié à la main que le fichier tient » + « Lancer l'usinage » | Là, la case porte une information que la machine n'a pas : on la garde. |
| Dérogation D1 | « Lancer malgré le dépassement » | n'existe pas (la case suffisait, A1-1) | Détails du contrôle → bouton → dialogue → **appui maintenu 2 s** (4 touchers + maintien), journalisé | « Second geste délibéré, journalisé » (D1) : impossible par réflexe, impossible par double toucher. |
| Contenu inconnu | Macros (EX-07), test de broche (RM-02) | 3 | **3** (inchangé) | Rare ; la page ne sait pas ce que fait une macro. |
| Prise de main | PI-02 | 3 | **2** | Ne bouge rien ; le motif reste journalisé (motif prédéfini). |

---

## 7. v1 Éco et la règle du rendu v2

- **Même organisation, mêmes écrans, mêmes places** en v1 et en v2 ; tous les fils de fer du § 2 sont dessinés en v1 (1206 × 648) et tiennent en hauteur (§ 2.4 donne le calcul de l'écran le plus chargé). v2 ajoute, **dans les mêmes boîtes** : aperçu 3D (② et ⑤), vue « Où le programme se placera » dans la boîte de dessus de ④, courbe de vitesse et séquence prévue sous l'aperçu de ⑤, volet « Détail du temps ».
- Les dessins nouveaux (dessin de départ du palpage, emprise de ④, vue de côté) sont du **SVG statique** tiré des nombres de l'instantané ou du profil de sonde : aucun WebGL, aucune requête, aucune minuterie. En Éco : aucune requête, minuterie ni image de v2 (§ 5.5) — le fil calcule ses états à partir de l'instantané déjà reçu, sans appel supplémentaire. La seule requête périodique ajoutée est la relecture de `VERSION.json` (A3 § 2.2), commune aux deux rendus.
- **Laser (la RT)** : ③ remplace la carte Sonde par la carte « Laser : amenez le point sur le coin » ; ④ porte [Cadrage…] ; ⑤ écrit « Puissance » au lieu de « Broche ». Le fil a les mêmes cinq étapes.
- Le rail passe de 88 à 128 px : à 1366 × 768, les cinq tuiles de 88 px et « Plus » tiennent (5 × 100 + 64 + marges = 600 ≤ 696). Les captures du harnais (`responsive-*`, `1024x600*`) seront à refaire : à 1024 × 600 la zone tombe à 864 × 480, ce que ce document ne dessine pas (§ 9).
- **Règle unique du rendu v2 (problème 8)** : « Le rendu v2 est choisi une fois, à l'ouverture de la page, sur le seul profil de l'appareil (réglage Performance, machine CNC, GPU matériel, fenêtre d'au moins 1300 × 880). L'état de la machine n'y entre jamais. Si la page s'ouvre pendant un usinage, la vue 3D attend le premier repos et la vue fixe tient sa place. » La condition « premier état au repos » de `tablet-profile.js:309-310` disparaît : elle protégeait d'un changement d'organisation en cours de route, qui n'existe plus puisque v1 et v2 ont la même. Conséquence : après une mise en route normale (Alarme → prise d'origine), la Surface Pro est en v2, ce qu'elle n'est pas aujourd'hui.

---

## 8. Lots, en série, un agent à la fois

Chaque lot se termine par : `verify-project.cjs` N/N, `npx jest src/server/services/touch src/server/services/cncengine grbl-simulator` toutes suites vertes, harnais `--strict` « 0 violation(s), 0 excepted » et « every step passed », aucune nouvelle ligne dans `layout-exceptions.json`, et l'étape `parcours` (créée en L1) qui compte les touchers des parcours déjà refaits. Les commandes machine gardent sélecteurs ou correspondance prouvée par test (`commandes-machine.json` → nouveau sélecteur). Les lots supposent les corrections serveur du chantier A faites avant (D1, D2, D4, A1-8) ; sinon la ligne « Il manque » affiche les remèdes actuels.

| Lot | Contenu | Fichiers (dossier `examples/cncjs-touch/touch/` sauf mention) | Laisse en marche | Taille |
|---|---|---|---|---|
| **L1 Socle** | Fil (rail 128 px, 5 étapes + Plus, états, règle d'invalidation dans un seul module pur), page d'arrivée = étape suivante, barre d'étape (« Il manque » + slot), composant « refus + remède » (table code → phrase → bouton), bandeau (LA MAIN, emplacement 1 à trois rôles, retrait Fichier / Machine / Déverrouiller), gabarit de dialogue, cache `v2u` → `v2v` en une seule valeur contrôlée par `verify-project.cjs`. Les étapes pointent **provisoirement** sur les écrans existants : ① → `screen-machine`, ② → `screen-files`, ③ → `screen-jog`, ④ et ⑤ → `screen-home`, Plus → `screen-menu` réduit. | `touch-shell.js`, `touch-shell.css`, `ui-2027.css`, `design-tokens.css`, `status-strip.js`, `strip-guard.js`, `job-controls.js` (dialogue, refus), `index.html`, `i18n-messages.js` ; nouveaux : un module d'état du fil et un module des remèdes, avec leurs tests ; `verify-project.cjs`, `browser-run.cjs` (étape `parcours`, nouveaux états), `test-menu-screen.cjs`, `test-status-strip.cjs`, `test-job-dialog.cjs`, `test-job-dialog-strip.cjs` migrés | toute la page actuelle, sous le nouveau rail | ≈ 900 lignes, 15 fichiers |
| **L2 Machine prête** | Écran ①, liste ordonnée, « Ce qui s'est passé », connexion en ligne, prise d'origine depuis l'alarme, Déverrouiller en secondaire, relecture visible, dialogue La main, volet « Détails de la machine » (absorbe Limites et `#job-port`) | `commissioning.js`, `connect-cnc.js`, `grbl-help.js`, `machine-limits.js`, `status-strip.js`, `job-controls.js`, `index.html`, `commissioning.css` ; tests `test-machine-screen.cjs`, `test-connect-cnc.cjs`, `test-control-attribution.cjs`, `test-commissioning.cjs` | P1, P8 (moitié machine), P9 | ≈ 700 lignes |
| **L3a Zéro pièce : déplacer et zéros** | Écran ③ sans sonde : positions, zéros, croix, pas, vitesse, « Autres zéros » (D4) ; retrait de la comparaison v2 de Préparer | `real-motion.js`, `job-preparation.js`, `origin-preview.css`, `operator-tools.css`, `index.html` ; tests `test-preparation-keys.cjs` et les tests de `real-motion` | P6 | ≈ 600 lignes |
| **L3b Zéro pièce : sonde** | Carte Sonde (bloc et plaque côte à côte), dessin de départ, assistant « Ma sonde » (défauts D4), diagnostic guidé (D4), test du contact dans le dialogue ; suppression des sous-écrans de Sonde et de la carte plaque de Suivi | `probe-ui.js`, `probe-real.js`, `probe-model.js`, `probe-profiles.js`, `probe-diagram.js`, `probe-preparation.js`, `probe-transfer.js`, `job-resume.js` (plaque), `probe.css`, `index.html` ; tests `test-probe-*.cjs`, `test-block-probe-dialog.cjs`, `test-job-resume.cjs` | P3, P4, P5, P10 | ≈ 1 200 lignes (le plus gros) |
| **L4 Fichier et Contrôle** | ② qui reste sur place après Charger, profondeur nommée, verdict ; écran ④ (dessins SVG, verdict par axe, D1 et sa dérogation, rapides 25 %, cadrage laser) ; suppression du volet « Préparer le travail » et des relais | `shared-library.js`, `projects.js`, `library-preview.js`, `program-check-view.js`, `travel-check.js`, `job-controls.js`, `job-preparation.js`, `laser-view.js`, `origin-preview.js` (v2 dans ④), `index.html` ; tests `test-job-preparation.cjs`, `test-job-dialog.cjs`, `test-dashboard.cjs` | P2, P7 (départ) | ≈ 900 lignes |
| **L5 Usinage** | Écran ⑤ : trois rangées de corrections, ligne de message fixe, Arrêter sous l'aperçu, encarts pause / alarme / bilan, reprise à une ligne sur le programme arrêté (A2-9), règle unique du rendu v2 | `job-dashboard.js`, `job-resume.js`, `job-follow.js`, `tablet-profile.js`, `performance-observation.js`, `performance-sequences.js`, `performance-v2.css` ; tests `test-dashboard*.cjs`, `test-job-resume.cjs`, `test-v2-gate.cjs` | P7, P8 complets | ≈ 800 lignes |
| **L6 Plus et finitions** | Écran Plus, Journal, Réglages (cohérence), Mise en service (entrée unique), Guide réécrit sur le fil, Macros, anglais et espagnol complets ; `PERFORMANCE-UI-SPEC.md`, `TESTING.md`, `BUGHUNT-MAP.md` | `session-journal.js`, `real-history.js`, `display-settings.js`, `interface-guide.js`, `macros.js`, `commissioning.js`, `i18n-messages*.js` | tout | ≈ 600 lignes + catalogues |

L1 est le seul lot qui touche toute la page à la fois ; s'il échoue au harnais, rien d'autre ne peut avancer. L3 est coupé en deux pour qu'aucun lot ne dépasse ≈ 1 200 lignes.

---

## 9. Risques et points faibles

1. **Un fil suggère une ligne droite ; une séance réelle boucle.** Ébauche puis finition, deux fichiers sur le même zéro, changement d'outil M6, zéro Z refait entre deux fichiers : l'opérateur revient en arrière plusieurs fois par séance. Le fil le permet (étapes libres), mais il peut afficher un « ✓ » qui n'a plus de sens (« Contrôle ✓ » d'un fichier précédent) si la règle d'invalidation a un trou. **Un ✓ faux est pire qu'aucun ✓.** C'est le risque principal : la règle doit être unique, testée, et ④ ne doit lire que le contrôle du serveur sur l'instantané courant.
2. **L'état « zéro pièce posé » n'existe pas aujourd'hui.** La page ne sait pas, après un rechargement, si le zéro a été posé dans cette séance. Il faut une donnée de l'instantané (heure et moyen du dernier zéro réussi, remise à « à vérifier » par une prise d'origine ou un redémarrage de la carte). C'est une addition au serveur qui dépasse peut-être D2 et D4 : si le jury la refuse, ③ ne peut dire que « Posé ? » d'après le décalage non nul, ce qui affaiblit l'angle.
3. **Plus de navigation pendant l'usinage.** Un zéro Z à la plaque entre ébauche et finition fait quitter ⑤ pour ③ ; un poste de pilotage (b) garderait tout sous les yeux. Les comptes restent bons (3 touchers), mais l'opérateur perd la vue de l'usinage pendant ce temps.
4. **40 px de largeur en moins** pour la zone utile, et des tuiles de fil serrées : « Zéro pièce » en texte agrandi (18 px) et en espagnol (« Cero pieza », « Mecanizado ») tient juste dans 112 px ; non mesuré. Si cela casse, le fil devra passer à 140 px ou l'état à une icône seule, ce qui retire une partie de l'angle.
5. **L'allègement des confirmations** (3 → 2 pour Déverrouiller, prise d'origine, palpages, départ « tient », reprise) retire un garde de la page. Il est justifié au § 6.3, mais il doit passer par `SURETE.md`, la relecture d'Astra et de Fable, et un test qui prouve qu'un double toucher ne confirme pas (armement 400 ms, bouton déplacé). Si le jury le refuse, P1 remonte à 5, P4 à 4, P7 à 10 : P7 dépasse alors le compte actuel.
6. **La dérogation D1 par appui maintenu** n'existe nulle part ailleurs dans la page, se teste mal au harnais et peut surprendre ; la conception exacte de D1 (chantier A) peut imposer autre chose.
7. **La page change de rendu par rapport à aujourd'hui** : la Surface Pro sera en v2 après une mise en route normale. Si la condition « premier repos » protégeait aussi d'un pic de charge (WebGL chargé pendant un mouvement), la règle proposée ne le couvre que par le report de la vue 3D ; non mesuré.
8. **Le slot « toujours en bas à droite » crée une habitude** : pendant l'usinage il vaut Pause. Toucher par réflexe met en pause (réversible), jamais ne démarre ni n'arrête ; mais une pause intempestive laisse la broche tourner sur place (marque sur la pièce).
9. **Laser** : l'étape « Zéro pièce » y est mince (pas de sonde) ; le fil y apporte moins.
10. **L1 est gros et transversal** : nouveau rail, bandeau, dialogues, refus, cache ; tous les tests d'écran et une grande partie des captures du harnais changent en même temps. Le risque de régression est concentré là.
11. **La v1 actuelle à 1024 × 600** (familles `1024x600*` du harnais) n'est pas dessinée ici ; avec un rail de 128 px, ③ n'y tient pas sur trois colonnes.
12. **Le dessin de ④ dépend des nombres du contrôle du serveur** (min, max, course par axe) : quand le verdict est « non vérifiable », il n'y a rien à dessiner en Z, précisément quand l'opérateur en aurait besoin.

---

## 10. Ce qui n'a pas été vérifié

- Rien n'a été lancé : aucun test, aucun harnais, aucune maquette. Les tailles des fils de fer sont calculées, pas mesurées ; la tenue du texte agrandi et de l'espagnol dans les tuiles de 112 px n'est pas vérifiée.
- Les comptes « avant » viennent de `ERGONOMIE.md`, qui les a déduits du code ; les comptes « après » sont déduits de ce document.
- Lu en entier : le prompt, `ERGONOMIE.md`, `VEILLE.md` § 2-5, `TEXTES.md` § 1-2 et la table des codes du § 4.2 (colonnes code, proposition, remède) ; `COMMANDES-MACHINE.md` lu jusqu'à OR-06, puis les 65 lignes par `commandes-machine.json` (identifiant, écran, sélecteur, geste, opération), sans les colonnes de gardes. Des audits A1 à A4 : résumés, titres et gravités seulement ; A3 § 2.2 (T14). Captures regardées : Suivi v2 en travail, Sonde v2 bloc prêt, Préparer v1 laser.
- Non vérifié dans le code : que l'instantané publie déjà les nombres par axe du contrôle de course (`program-check.js:543-586` les calcule ; leur présence dans l'instantané reçu par la page n'est pas vérifiée) ; les valeurs par défaut du profil de sonde (D4 les fixera) ; que la prise d'origine depuis l'alarme marche sur la LUNYEE après un redémarrage de la carte (le serveur l'accepte en alarme, la carte n'a pas été essayée).
- La règle unique du rendu v2 n'a pas été rejouée dans `test-v2-gate.cjs`.
