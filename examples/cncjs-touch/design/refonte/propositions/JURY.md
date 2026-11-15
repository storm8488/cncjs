# Jury des propositions d'organisation (phase 2, 2026-11-15)

Agent « jury et auteur de la spec » (Fable 5.2). Branche `feat/refonte-ui`, HEAD `20aeac36`. Aucun fichier existant modifié.

Propositions jugées :
- (a) `propositions/A-fil-de-la-seance.md` ;
- (b) `propositions/B-poste-de-pilotage.md` ;
- (c) « le minimum » : **le fichier `propositions/C-le-minimum.md` n'existait pas** quand j'ai jugé. J'ai lu la sortie brute d'Astra, `…/scratchpad/refonte/Pc/astra-C.md` (927 lignes, `done.txt` présent). Si le fichier commité diffère de cette sortie, la colonne (c) est à relire.

`CONSTATS.md` et `PLAN-CORRECTIONS.md` n'existaient pas non plus quand j'ai jugé : je me suis appuyé sur D1 à D4 et sur les contre-vérifications `audit/V1`, `V2`, `V3`. `CONSTATS.md` est paru pendant l'écriture de la spec, qui en tient compte ; le jugement ci-dessous n'en dépend pas.

Verdict : **(a) « le fil de la séance » est retenue**, avec onze greffes de (b) et de (c) et vingt désaccords tranchés (§ 5 et § 6). La spec est `design/refonte/SPEC-REFONTE.md`.

---

## 1. Méthode

- Les touchers sont **recomptés par moi** sur les fils de fer de chaque proposition, avec la convention d'`ERGONOMIE.md` (un toucher = un appui sur une cible ; saisies à part ; flèches et gestes physiques non comptés). Départ de chaque parcours : celui de la colonne « avant » d'`ERGONOMIE.md` § A.
- J'ai vérifié dans le code ce que les fils de fer supposent : `job-controls.js` (dialogue, ticket), `block-probe.js` et `job-service.js` (gardes du ticket), `tablet-profile.js` (porte v2), `browser-run.cjs` (règles strictes), les codes `ETOUCH_*`.
- Notes des parcours, de 0 à 3 : 3 = cible atteinte, aucune impasse, compris sans lire ; 2 = mieux qu'aujourd'hui avec une réserve ; 1 = égal à aujourd'hui ; 0 = cible manquée ou pire.
- Notes des principes, de 0 à 2. Risque et effet v1 Éco, de 0 (mauvais) à 3 (bon).

## 2. Parcours : touchers recomptés, impasses, lisible sans lire

« k » = sur la tablette posée à côté de la machine (kiosque local) ; « a » = sur un autre appareil. (c) ne distingue pas.

| Parcours | Avant | (a) recompté | (b) recompté | (c) recompté | Note a / b / c |
|---|---|---|---|---|---|
| P1 Mise en route | 6 (10) | **4** ; 5 si la case reste | **4** k ; 5 a | **6** | 3 / 3 / 1 |
| P2 Fichier | 3 (4 avec le verdict) | **3**, verdict après le chargement seulement | **3**, verdict avant de charger | **3**, verdict avant de charger | 2 / 3 / 3 |
| P3 Bloc, première fois | 35 + ≥ 3, 9 saisies | **14**, 4 saisies | **14**, 4 saisies | **24**, 4 saisies | 3 / 3 / 2 |
| P4 Bloc, fois suivantes | 6 | **3** ; 4 si la case reste | **3** k ; 4 a | **4** si XYZ est resté choisi, 5 sinon | 3 / 3 / 2 |
| P5 Plaque Z | 3 (Suivi), 4 ailleurs | **3** de partout ; 4 si la case reste | **3** depuis le Poste, **4** depuis un autre volet, 2 en pause M6 | **3** depuis Suivi ou Préparer, 4 ailleurs ; deux endroits | 3 / 2 / 2 |
| P6 Zéros à la main | 4 ; XYZ 3 ; origine machine impossible | **3** ; 3 ; **4** | **3** ; 3 ; **3** | **3** ; 3 ; **4** | 2 / 3 / 3 |
| P7 Contrôle et départ | 9 | **7** depuis ④ (8 avec le fil) ; 9 si la case reste | **7** k ; **9** a (la proposition annonce 8) | **9** | 3 / 3 / 1 |
| P8 Après une alarme | 12 | **8** ; 10 si la case reste | **7** k ; 9 a | **12** | 3 / 3 / 1 |
| P9 Pilotage | 3 | **2** | **2** | **3** (cible manquée, dite) | 3 / 3 / 0 |
| P10 Sonde | 3, impasse | **2** + 1 par consigne (≤ 3) | **2**, puis 0 à 2 | **3** à 4 | 3 / 3 / 2 |
| **Total / 30** | | | | | **28 / 29 / 17** |

Impasses restantes, vues sur les fils de fer :
- (a) : aucune dans les dix parcours. Une faiblesse : « Charger ce fichier » puis seulement le verdict (P2).
- (b) : aucune. Une faiblesse : passer d'un grand volet à un autre coûte « ← Poste » en plus.
- (c) : P8 reste sur deux écrans sans suite unique ; plusieurs remèdes sont « Voir la machine » (un renvoi, pas un geste) ; P9 manque sa cible.

Écarts relevés entre l'annoncé et le recompté :
1. (b) annonce P7 à 8 hors du kiosque : la reprise porte aussi la case, donc **9**.
2. (a) et (b) placent le **test du contact dans le dialogue** de palpage (« le bouton s'arme seul »). Infaisable tel quel : le ticket est demandé avant l'ouverture du dialogue et sa garde (`job-service.js:1148`, `block-probe.js:398-441`) refuse tant que le test n'est pas fait. Le guidage doit être sur l'écran, avant le toucher. Les comptes ne changent pas.
3. (a) et (b) rendent l'épaisseur de la plaque et le diamètre **modifiables dans le dialogue** : ces valeurs partent dans la demande du ticket (`job-resume.js:205-213`, `probe-ui.js:207-213`). Elles doivent être connues avant.
4. (a) cite le code `ETOUCH_PROBE_INPUT_DOWN`, (b) cite `ETOUCH_MOTION_NOT_HOMED` et `ETOUCH_MOTION_HOMING_SETTING` : **aucun des trois n'existe** (`grep` dans `src/server/services/touch` et `touch/`).
5. (a) et (b) retirent le nom du fichier du bandeau : le harnais strict l'exige pendant un usinage (`browser-run.cjs`, règle « the loaded file's name drawn on less than 120 px in the strip during a job »).
6. (a) élargit le rail à 128 px : la zone utile tombe à 1206 px, alors que le cadre de la spec est 1246 × 791 et 1246 × 648.
7. (a) pose « Connecter la CNC » puis « Ouvrir » au même endroit (le bouton du bas à droite), contre sa propre règle « jamais sous le doigt qui a ouvert ».
8. (c) est exacte sur ses comptes et dit elle-même ce qu'elle n'atteint pas.

## 3. Les dix principes du § 5.2

| # | Principe | (a) | (b) | (c) | Pourquoi |
|---|---|---:|---:|---:|---|
| 1 | L'écran suit l'ordre du travail | 2 | 2 | 1 | (a) le rail est l'ordre ; (b) quatre cartes et l'action suivante ; (c) ordre du rail corrigé, mais ni étape en cours ni suite. |
| 2 | Une fonction, un seul endroit | 2 | 2 | 1 | (c) garde la plaque à deux endroits et « Charger » à trois. |
| 3 | Aucune impasse | 2 | 2 | 1 | (c) : P8 et plusieurs remèdes par renvoi. |
| 4 | Rien n'est masqué sans raison | 2 | 2 | 2 | Les trois gardent les boutons rayés avec leur raison. |
| 5 | Langage d'atelier | 2 | 2 | 1 | (c) garde « Profils de sonde », « Coin et sens », « Confirmer ». |
| 6 | Défauts sûrs, assistant, derniers choix | 2 | 2 | 1 | (c) : trois onglets, listes natives, décalages signés. |
| 7 | Prévenir avant d'engager | 1 | 2 | 2 | (a) ne donne le verdict qu'après le chargement. |
| 8 | Un dessin plutôt qu'un chiffre | 2 | 2 | 1 | (c) nomme les dessins sans les spécifier. |
| 9 | Couleur réservée, une action principale | 2 | 2 | 1 | (c) : deux actions principales sur Machine. |
| 10 | Remise en route guidée | 2 | 2 | 1 | (c) : une liste sur Machine, la reprise ailleurs. |
| | **Total / 20** | **19** | **20** | **13** | |

## 4. Risque de réalisation et effet sur v1 Éco

| | (a) | (b) | (c) |
|---|---|---|---|
| Structure du code touchée | Garde les sections `screen-*`, le rail `#tabbar`, `cncShell.go`. Le rail change de contenu, un écran naît (Contrôle), le Menu disparaît. | Supprime le rail ; tous les écrans deviennent des volets ; L1 annoncé à ≈ 1 800 lignes ; les modules ne regardent que `.screen.active` (`touch-shell.js:207`). | Déplace des composants ; rien de structurel. |
| Harnais | Les noms d'écran de `screens.json` survivent pour 5 écrans sur 7. | Étape `screens` et `responsive` à refaire en entier ; la page de simulation aussi. | Presque intact. |
| Point de défaillance unique | Règle d'invalidation des « ✓ ». | Table de l'action suivante, avec un gros bouton. | Aucun. |
| Garde de la page retirée | Case retirée partout (3 → 2). | Case retirée sur le kiosque local seulement. | Aucune. |
| **Risque (3 = faible)** | **2** | **0** | **3** |
| v1 Éco à 1366 × 768 | Même organisation ; 40 px de moins. | Poste calculé au pixel près à 648 px ; textes tronqués en agrandi (dit au § 9). | Inchangé, Préparer plus dense. |
| Requêtes, minuteries, images v2 en Éco | aucune | une requête `check` par fichier touché | une requête `check` par fichier touché |
| **Effet v1 Éco (3 = bon)** | **2** | **1** | **3** |

## 5. Verdict

| | Parcours / 30 | Principes / 20 | Risque / 3 | v1 Éco / 3 |
|---|---:|---:|---:|---:|
| (a) Le fil de la séance | 28 | 19 | 2 | 2 |
| (b) Un poste de pilotage | 29 | 20 | 0 | 1 |
| (c) Le minimum | 17 | 13 | 3 | 3 |

**(a) est retenue.**
1. Elle atteint toutes les cibles (P4 ≤ 4, P5 ≤ 3, P9 = 2) et lève toutes les impasses, comme (b), à un point près.
2. Elle garde les écrans et le rail du code actuel : le premier lot peut poser le fil sur les écrans existants et laisser la page en marche. (b) demande de tout déplacer d'un coup.
3. Elle est la seule à montrer en permanence où l'on en est (principe 1), ce que l'opérateur a demandé le 14 novembre. (c) ne le fait pas et manque P9.

(b) perd sur le risque, pas sur l'idée : ses meilleures idées entrent dans la spec. (c) sert de garde-fou : ce qu'elle refuse de casser n'est pas cassé.

## 6. Greffes et désaccords tranchés

### 6.1 Greffes

| # | Idée | Vient de | Place dans la spec |
|---|---|---|---|
| G1 | Table de priorités fixe qui donne la cause et l'action suivante, dans un module pur testé cas par cas | (b) § 1.4 | § 6.4 (`seance.js`) |
| G2 | Remise en route : liste numérotée, « Perdu / Gardé » | (b) § 2.4, (a) § 2.2 | § 6.9 |
| G3 | Prise de main par deux boutons-motifs qui prennent la main | (b) § 2.11 | § 5.3 |
| G4 | Case de présence retirée seulement sur le kiosque local | (b) § 6.3 | § 6.3 |
| G5 | Verdict de course dès la sélection, par l'action `check` qui existe et que rien n'appelle | (b) § 2.7, (c) | § 4.2 |
| G6 | Zéro Z à la plaque offert sur place pendant une pause de changement d'outil | (b) § 1.4 cas 9 | § 4.5 |
| G7 | Dérogation D1 par une case qui dit le dépassement et un bouton nommé, pas par un appui maintenu | (b), (c) | § 6.3 |
| G8 | Rail à 88 px, zone utile 1246 px, nom du fichier gardé dans le bandeau | (c) | § 2 |
| G9 | Règle du rendu v2 : attendre un repos sûr, sans verrou pour une alarme | (c), `audit/V3` (ERG-8) | § 3 |
| G10 | Le diagnostic suit le signal réel ; aucun bouton ne déclare la sonde bonne | (c) | § 5.6 |
| G11 | Repli honnête d'un refus non reconnu : « Action refusée » et « Détails », jamais un faux remède | (c) | § 9.1 |

### 6.2 Désaccords tranchés

| # | Question | (a) | (b) | (c) | Tranché |
|---|---|---|---|---|---|
| 1 | Le rail | élargi à 128 px, états écrits | supprimé | gardé, réordonné | Gardé à 88 px ; c'est le fil ; l'état d'une étape est une marque, le mot est dans l'en-tête de l'écran. |
| 2 | Le Menu | supprimé | supprimé | gardé | Supprimé. La page s'ouvre sur l'étape suivante. Le rare va sous « Plus ». |
| 3 | Le contrôle | une étape | une carte du Poste | dans Fichiers et Suivi | Une étape, avec les deux dessins. |
| 4 | La plaque dans Suivi | non | sur place en pause M6 | raccourci permanent | Un seul endroit (③), plus G6. |
| 5 | Confirmation des mouvements | 2 partout | 2 sur le kiosque, 3 ailleurs | 3 partout | G4. Repli si le kiosque n'est pas reconnu : la case reste, et aucun parcours ne dépasse le compte actuel sauf P5 depuis ⑤ (4 contre 3), dit dans la spec. |
| 6 | Dérogation D1 | appui maintenu 2 s | case + bouton nommé | intention + case + Confirmer | G7. |
| 7 | Quand v2 s'affiche | à l'ouverture, par l'appareil seul | idem | au premier repos sûr | G9. Charger WebGL pendant un usinage n'a jamais été mesuré. |
| 8 | Assistant de la sonde | 3 pages | 3 pages | 3 onglets | 2 pages : le coin, puis les quatre mesures ; les vitesses sont préréglées et se modifient derrière un bouton. P3 passe à 13. |
| 9 | Choix du palpage | sélecteur + un bouton | cinq tuiles qui lancent | tuiles + un bouton | Sélecteur retenu d'une fois sur l'autre + un bouton ; le dessin reste à côté des flèches. |
| 10 | Test du contact | dans le dialogue | dans le dialogue | sur l'écran | Sur l'écran (écart n° 2). |
| 11 | Épaisseur de plaque, diamètre | dans le dialogue | dans le dialogue | sur l'écran | Avant le ticket (écart n° 3) : champ sur la carte, volet « Plaque » la première fois. |
| 12 | Zéro à l'origine machine | volet « Autres zéros » (4) | un bouton par axe (3) | dialogue à choix d'axe (4) | Volet (4 touchers) : la colonne des positions fait 380 px, six boutons de 64 px n'y tiennent pas avec un texte de 16 px. |
| 13 | Bandeau | retire Fichier et Machine | retire Vitesse, Machine, Fichier | garde tout | Garde tout ; « Déverrouiller… » seul en sort ; « Pilote » devient le bouton « La main ». |
| 14 | Barre d'étape | « Il manque » + bouton | zone d'action du Poste | bande de 64 px | Barre d'étape de (a), pilotée par G1. |
| 15 | État « zéro pièce posé » | à ajouter au serveur | heuristique sur le journal | « valeurs relues » | Lu dans l'instantané (`motion.lastOrigin`, `blockProbe`, `zeroZ`) ; sans trace : « Ancien zéro », non bloquant. Rien n'est ajouté au serveur. |
| 16 | Journal et Réglages | sous « Plus » | menu « Plus » du bandeau | sur le rail | Sous « Plus » (écran à tuiles, qui reprend le code du Menu). |
| 17 | Diagnostic de la sonde | « C'est fait » à chaque consigne | avance seul | l'opérateur choisit la branche | Avance seul avec le voyant ; un bouton « Ça touche toujours » passe à l'hypothèse suivante ; G10. |
| 18 | Connexion | dans la liste de ① | dialogue | carte de Machine | Carte en tête de ① ; « Ouvrir » est dans la carte, loin du bouton du bas. |
| 19 | Corrections de broche et de rapides | sur ⑤, v1 = v2 | idem | idem | Unanime. Les rapides sont aussi sur ④, là où l'on démarre (comme en v1 aujourd'hui). |
| 20 | Page de simulation | non traitée | non traitée | non traitée | Elle charge les mêmes modules : elle suit le même cadre ; son banc de palpage garde `probe-ui.js`. |

## 7. Ce que je n'ai pas vérifié

- Aucune maquette, aucun rendu, aucun test lancé : les notes « compréhensible sans lire » viennent de la lecture des fils de fer.
- Les comptes « avant » sont ceux d'`ERGONOMIE.md`, déduits du code par son auteur ; je ne les ai pas rejoués.
- La proposition (c) a été lue dans le dossier de travail d'Astra, pas dans `propositions/`.
- Je n'ai pas lu `FIRMWARE.md` en entier ni les fiches détaillées des audits A1 à A4 : seulement leurs titres, gravités et les tableaux de `V1`, `V2`, `V3`.
- La reconnaissance du kiosque local (greffe G4) n'a été ni écrite ni essayée ; l'adresse du kiosque de la Surface n'est pas dans le dépôt (`audit/A3`, constat A3-8).

---

## Révision (2026-11-15, après les deux critiques)

Agent « révision de la spec » (Fable 5.2), de nouveau jury. Lus en entier : le prompt, la spec, ce document, `CRITIQUE-OPERATEUR.md` (26 bloquants B1 à B26, 7 améliorations A1 à A7), `CRITIQUE-REALISATION.md` (17 bloquants B-01 à B-17, 24 améliorations A-01 à A-24), `CONSTATS.md`, `PLAN-CORRECTIONS.md`. Les deux critiques étaient présentes. Seul `SPEC-REFONTE.md` a été modifié, sur place ; cette section est ajoutée ici. Rien d'autre.

Résultat : **les 43 bloquants sont levés, aucun n'est réfuté.** 37 sont acceptés tels quels ; 6 le sont par une autre correction que celle proposée, ou sans une partie d'elle (B5, B7, B9, B15, B-04, B-06 : la raison est dite ci-dessous). Les 31 améliorations sont acceptées, sauf deux libellés d'A1.

### R1. Trois décisions du jury qui changent

| Décision d'origine | Révision | Pourquoi |
|---|---|---|
| G4 et désaccord 5 : la case « Je suis devant la machine » retirée sur la tablette posée à côté de la machine | **La case reste partout.** L'allègement devient une idée pour l'opérateur (spec § 13.1, n° 11). | Le prompt interdit de retirer un garde-fou (§ 4.5) et réserve tout changement de garde au chantier A (§ 5.5) ; le plan n'en prévoit pas. La case fait attester ce que rien ne mesure (table dégagée, bloc, plaque et pince en place), ce qu'une adresse en boucle locale ne prouve pas (critique de l'opérateur, B4). Le lot L1 l'aurait retirée avant l'écran qui devait la remplacer (critique de réalisation, B-17). Les cibles tiennent sans cela : P4 = 4, P5 = 3, P9 = 2, et aucun parcours ne dépasse le compte d'aujourd'hui. |
| Désaccord 9 : le choix du palpage (XYZ, Z, X, Y) retenu d'une fois sur l'autre | **XYZ à chaque arrivée sur l'écran.** | Avec un choix retenu, P4 passait à 5 après un palpage d'un seul axe (B6). Et un bouton qui dit toujours la même chose à l'arrivée ne lance pas, par habitude, un palpage X à la place d'un XYZ. |
| Désaccord 4 : la plaque à un seul endroit (③), plus la pause de changement d'outil (G6) | **Le même bouton est aussi sur ⑤ à la fin d'un usinage.** | P5 valait 4 depuis ⑤ avec la case : au-dessus de la cible de 3 et du compte actuel (B6). Entre l'ébauche et la finition, l'opérateur est sur ⑤ « Terminé », ou sur ③ où le fil le mène : P5 = 3 aux deux endroits. Même commande, même garde, même dialogue. |

Conséquence sur les comptes (désaccord 8 compris) : P1 = 5, P3 = 14, P4 = 4, P5 = 3, P7 = 9, P8 = 10, P9 = 2. Une seule colonne « après » : il n'y a plus de différence entre la tablette et un autre appareil.

### R2. Critique de l'opérateur

| Point | Verdict | Ce qui change dans la spec, ou la raison du rejet |
|---|---|---|
| B1 preuve absente comptée vraie | accepté | Seul `workOffset.state === 'proven'` vaut preuve ; champ absent = « non vérifié » ; le zéro non prouvé passe avant tout verdict de course, sans case ni dérogation (§ 0.2 K3, § 4.4, § 6.4, § 9.2 n° 12). |
| B2 pas de bouton pour refaire la preuve | accepté | Remède `verifier-zero` (action `verifyOffset`), bouton [Vérifier à nouveau] sur la ligne `zero` de ① et comme remède de ③ et ④ ; « Refaire le zéro pièce » mène au zéro « ici », que le serveur permet (§ 4.1, § 6.4, § 10.4 N-01 ; lots L1, L2, L4). |
| B3 contrat provisoire | accepté | Table K réécrite avec les noms du plan (K1 à K14) ; plus aucun « à caler » ; table « constat → lot → critère de fin » (§ 0.2). |
| B4 case retirée sur `localhost` | accepté | Voir R1. |
| B5 parcours non rejouables sur les dessins | accepté en partie | Accepté : `suite` partout (plus de `.next`) ; action de barre et action de carte séparées sur ③ ; la correction de P7 avant l'arrêt ; chaque dessin nomme son état, et les barres des états nominaux de ①, ②, ④, ⑤ sont dessinées. Rejeté : dessiner chaque variante dans la spec — les tableaux d'états les décrivent toutes, et les maquettes les dessinent. |
| B6 P4 et P5 hors plafond | accepté | Voir R1. |
| B7 premier palpage implicite | accepté en partie | Accepté : assistant dessiné vide ; consigne et coches du test du contact dans le volet ; les trois cas de [Palper au bloc …] écrits (§ 4.3, § 5.5). Rejeté : renommer le bouton « Configurer le bloc et préparer le palpage » — trop long pour 362 px, et le bouton fait bien ce qu'il dit dès que les mesures sont là. |
| B8 refus du ticket avec `canBlockProbe` vrai | accepté | Règle 1 du § 6.1 : la page ne raye pas ce que le serveur dit possible ; la cause reste écrite jusqu'au changement d'une donnée de la demande. Test dans `test-zero-piece.cjs`. |
| B9 refus de course du palpage sans côté ni distance | accepté en partie | Accepté : la phrase dit la distance et le côté, tirés des bornes du refus (`ETOUCH_PROBE_TRAVEL` : vérifié, `block-probe.js:101, 328`) ; le remède n'est plus le dessin du bloc (§ 9.2 n° 21). Rejeté : un dessin de la course pour ce refus — la phrase suffit, et le calcul par le serveur est une idée (§ 13.1, n° 13). |
| B10 T8 dit « traité » | accepté | T8 est « atténuée » ; le dessin conseille, le serveur refuse ; scénario « départ hors de la zone » dans la recette de L3b (§ 6.6, § 8). |
| B11 diagnostic : la pince accusée à tort | accepté | Vérifié par le raisonnement sur le montage : retirer la pince fait cesser le contact aussi quand c'est la broche. Ordre refait : broche débranchée pince en place, puis pince (§ 5.6) ; le cas du 14 novembre est un test nommé de L3b. |
| B12 consignes physiques sans condition | accepté | Aucune consigne tant que la machine bouge ou que la broche tourne (§ 5.6). |
| B13 « La broche est arrêtée » à tort | accepté | Vérifié : le serveur refuse l'arrêt de la broche seul pendant une pause demandée par l'opérateur (`job-service.js:924-934`). Le bouton suit `canSpindleStop`, la raison est celle du serveur, la page n'écrit jamais cette phrase d'elle-même (§ 0.2 K10, § 4.5). |
| B14 relecture limitée au repos | accepté | Tous les accès suivent `canReadSettings` (§ 4.1, § 6.4). |
| B15 attente sans sortie | accepté en partie | Accepté : [Réessayer] sur « Contrôle indisponible » ; la cause « ne répond plus » dit le geste (allumée, branchée) ; hors ligne, la barre rappelle l'arrêt d'urgence. Rejeté : distinguer attente courte et longue par une durée — ce serait une minuterie de plus ; la phrase est la même dès le début. |
| B16 plaque et arrêt du palpage flous | accepté | Dans le bandeau, « Pause » s'écrit « Arrêter le palpage » pendant un palpage au bloc (vérifié : `canPause` y est vrai, `job-service.js:1308`) ; tableau des bilans (réussi, arrêté, échec, écriture incertaine, position perdue) ; états de la plaque sur ⑤ (§ 2.2, § 4.3, § 4.5). |
| B17 prise de main qui arrête sans le dire | accepté | Boutons « Prendre la main — … » ; le dialogue dit ce qui sera arrêté ; une demande à la fois (§ 5.3). |
| B18 remèdes faux pour un dépassement | accepté | Position machine écrite dans le fichier : « Refaire le zéro n'y change rien », seul remède « Choisir un autre fichier » ; trop haut : « Abaissez la pièce », plus « refaites le zéro plus bas » (§ 4.4, § 9.2 n° 11). |
| B19 « dessus de la pièce » | accepté | Le trait s'appelle « zéro Z » (§ 6.7). |
| B20 même bouton pour deux zéros | accepté | « Poser le zéro X ici » et « Mettre le zéro X à l'origine machine » (§ 5.4). |
| B21 retrait de 2 mm contre 1 mm | accepté | Valeurs du plan (retrait 1 mm), posées par son lot P1 ; une sonde enregistrée garde les siennes (§ 5.5, § 13.2 n° 8). |
| B22 reprise : réponses anciennes, hauteur inventée | accepté | Une seule réponse compte ; [Charger la reprise] rayé tant que le plan de la ligne affichée n'est pas accepté ; la phrase ne cite plus « 5 mm » (la hauteur est celle du fichier, dans Détails) ; « une autre ligne » au lieu de « plus loin » (§ 5.12). |
| B23 cible de « Recharger le fichier » | accepté | [Recharger ce fichier] recharge le fichier de la machine, nommé dans la phrase (§ 4.4, § 10.4 FI-02). |
| B24 causes qui rayent leur propre remède | accepté | Trois exceptions écrites : le remède de la cause, Pause et Arrêter, le relâchement d'une flèche (§ 6.4). |
| B25 T14 dit « réglé » par le cache | accepté | T14 « atténuée, à trancher à l'essai » ; la valeur de cache unique est un gain d'entretien (§ 8, § 12). |
| B26 test de migration trop faible | accepté | Chaque ligne porte son état de banc, sa requête et un état de refus ; les lignes supprimées et automatiques n'ont pas de sélecteur (§ 10.4). |
| A1 libellés | accepté en partie | Accepté : « Zéro X ici », « valeurs de départ » (plus « réglages sûrs »), « Rien en cours » (plus « Prêt » sur ⑤), le port hors de la question de connexion. Rejeté : « Mesures du bloc… » à la place de « Ma sonde… » (le volet règle aussi le coin, les vitesses et la liste des sondes ; le libellé espagnol ne tient pas à côté du diamètre) et « Vitesse d'usinage », « Déplacements rapides » (colonne de libellés de 80 px, trop étroite en espagnol). Les deux sont posés à l'opérateur (§ 13.2, n° 16 et 17). |
| A2 textes trop longs | accepté | Phrases de refus et consignes ramenées sous 90 caractères, une consigne à la fois ; contrôle ajouté à `test-textes-regles.cjs`. |
| A3 place | accepté | Sommes de hauteurs refaites pour chaque écran, titres compris (voir R3, B-03 à B-07). |
| A4 `#probe-result` deux fois | accepté | Le bilan s'appelle `#probe-outcome`. |
| A5 accès rares plus longs | accepté | Liste écrite au § 10.4. |
| A6 définition de l'incident | accepté | Lue dans `lastAlarm` et `referenceLost` : elle survit à un rechargement (§ 6.9). |
| A7 zéro d'un seul axe pris pour tout le zéro | accepté | Le contexte de l'en-tête dit le moyen et les axes ; le bilan de la plaque dit « X et Y n'ont pas changé ». |

### R3. Critique de réalisation

Chaque affirmation de code a été relue avant d'être acceptée (liste au § 14 de la spec).

| Point | Verdict | Ce qui change dans la spec |
|---|---|---|
| B-01 `preparationActions` retiré trop tôt | accepté (vérifié : `macros.js:8`, `job-preparation.js:158`, `touch-shell.js:157-160`) | L'export et son conteneur restent jusqu'en L4 ; `macros.js` passe en L1 (tuile de Plus) ; l'entrée Sonde reste en place jusqu'en L3b. |
| B-02 L4 retire le chargeur de la vue 3D | accepté (vérifié : `job-preparation.js:260`, `origin-preview.js:31`) | `check-screen.js` devient l'appelant de `loadAdvanced` ; `travel-check.js` reste pour `place()` seul ; les tests touchés sont nommés. |
| B-03 bandeau trop large | accepté | « La main » en 160 px fixes avec un texte court (le nom de l'appareil va dans le dialogue), emplacement 1 fixe à 200 px, ordre dans lequel les cellules de gauche cèdent ; cas espagnol, texte agrandi, usinage dans les critères de L1. |
| B-04 rangée des pas | accepté, autrement | Deux rangées comme aujourd'hui ; les cartes de ③ n'ont plus de titre visible, ce qui rend les 32 px. Rejeté : retirer un pas (ce serait retirer un choix de déplacement). |
| B-05 colonne Sonde | accepté | Voyant et [Tester] seuls sur la ligne 1 ; [Ma sonde…] à côté du diamètre ; la cause prend la place du dessin ; somme refaite à 520. |
| B-06 colonne des fichiers | accepté, autrement | Lignes de 80 px : 4 à 768, 6 à 911 (la critique proposait 3 et 5) ; les trois boutons montent dans la carte de droite ; `fitLibrary` adapté en L4. |
| B-07 phrase sous Arrêter | accepté | La phrase courte actuelle sur une ligne ; aperçu à 326 px. |
| B-08, B-09 D4 et D2 hors contrat | accepté | Voir R2, B14, B1, B2. |
| B-10 règle du rendu v2 | accepté | Vérifié : `canStop` est vrai pendant une prise d'origine (`job-service.js:1310`), et le test de preuve `test-bughunt-V3-1.cjs` exige que la mise en route ouvre la v2. La règle étroite de la spec fait foi ; L1 la rejoue et corrige `tablet-profile.js` si un cas est rouge. Je ne peux pas modifier le plan : **à signaler à l'agent du lot P2**. |
| B-11 pas de banc pour les parcours | accepté (vérifié : `preview-server.cjs:22`) | L1 crée `parcours-server.cjs` : le vrai service sur le simulateur « LUNYEE » par `sim-bridge.js`. |
| B-12 `measure-refonte.cjs` | accepté (vérifié : lignes 279 à 393, 634) | Adapté en L1. |
| B-13 gardes des boutons cachés | accepté (vérifié : `job-controls.js:368-373` et les six relais) | Chaque appel direct reprend la garde de son bouton ; `test-direct-calls.cjs` ; `#probe-stop` et `#preview-job-stop` nommés. |
| B-14 « mêmes places » contre les 143 px | accepté | La place dépend de la fenêtre, pas du rendu (§ 0.1) ; dit sous chaque dessin. |
| B-15 pavé qui cache les dessins | accepté (vérifié : `ui-2027.css:855`) | Option `dock: 'right'` du pavé, en L3b. |
| B-16 libellés espagnols | accepté | Remède jusqu'à 300 px ; « Buscar origen… » au glossaire. |
| B-17 case retirée avant sa remplaçante | accepté | Sans objet depuis R1 ; condition d'entrée écrite : S1 à S6 et P1 à P3 faits avant L1. |
| A-01 à A-24 | acceptés | A-01 `start()` créé en L1 ; A-02 chaque code rangé dans une famille au § 9.2 (les 138 du serveur au commit `02e76c19` et les 32 du plan, contrôlés par script) ; A-03 noms du plan ; A-04 cotes tirées de `over` et de `usable` ; A-05 tuile de 72 px et tirets conditionnels ; A-06 rail compact ; A-07 barre recomptée ; A-08 sept lignes au plus sur ① ; A-09 emplacement v2 de Machine rendu volet ouvert ; A-10 `v2n-` sans objet, `test-performance-v2-safety.cjs` nommé ; A-11 `SIMULATION_ONLY` ; A-12 égalité des suffixes, `view3` et `worker13` compris ; A-13 fin de la mise en service sur ① ; A-14 hôte provisoire du bouton de pause ; A-15 ordre de P3 réécrit ; A-16 commandes nouvelles N-01 à N-04, CX-06 en L1, « une demande à la fois » ; A-17 état de banc par ligne ; A-18 `commandes-migration.json` à côté des tests ; A-19 `data-seance-step` ; A-20 écriture seulement de ce qui change ; A-21 type non déclaré, porte ouverte, machine qui attend ; A-22 rangée des rapides en fonction commune ; A-23 pas de `:has()` ; A-24 les deux ajouts de Réglages dits. |
| § 5 et § 7 (remarques hors numéros) | acceptées | « Puissance » au glossaire ; le contour du dessin est fixe (pas d'animation) ; les trois documents sont mis à jour lot par lot. |

### R4. Ce que le jury signale à l'orchestrateur

1. **Lot P2 du plan, point 4** : la condition écrite garde `canStop`, vrai pendant une prise d'origine ; elle ferait échouer le test de preuve de C-35. La spec retient le verrou pour un usinage en cours ou en pause seulement (§ 3.1).
2. **Le plan dit « L5 » pour le bouton de dérogation** ; la spec le pose en L4, avec l'écran ④.
3. **`v2n-`** (prompt § 5.5) n'a aucune occurrence dans le dépôt.
4. **Le lot S2 était en cours d'écriture** pendant cette révision (`work-offset.js`, codes `ETOUCH_OFFSET_*`) : ses noms suivent le plan.
5. **Les maquettes** doivent trancher les budgets sans marge listés au § 14 de la spec (bandeau en espagnol agrandi, colonnes de ③ à 768).

### R5. Ce que je n'ai pas vérifié

- Rien n'a été lancé : aucun test, aucun harnais, aucun rendu. Les sommes de place sont des calculs ; les largeurs de texte sont celles mesurées par la critique de réalisation.
- Les listes de tests par lot ne sont pas recomptées : je m'appuie sur les comptes de la critique et sur la règle commune du § 11 (chercher chaque identifiant avant d'éditer).
- Le diagnostic de la sonde suit le récit du 14 novembre, pas un essai ; que prendre la main laisse un usinage continuer n'a pas été relu dans le code.
- Le banc des parcours est conçu, pas essayé : `sim-bridge.js` a été écrit pour Jest.
