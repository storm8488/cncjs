# Axe A, lot L0 : rapport

27 novembre 2026. Arbre `cncjs-wt/A`, branche `feat/axe-A`. Conception : `AXE-A-CONCEPTION.md` révision 3, § 3 « L0 ». **Rien n'a été installé sur une tablette, rien n'a été envoyé à une carte, rien n'est poussé.**

## Ce qui est fait

Un programme qui contient un mot A, B ou C est maintenant **signalé**, et il n'est **plus repris à une ligne**. Tout le reste est comme avant : le contrôle X Y Z, ses verdicts, ses refus, le droit de démarrer.

### Serveur

| Fichier | Changement |
|---|---|
| `src/server/services/touch/program-check.js` | `rotaryLetters(code)` : les lettres A, B, C qu'une ligne commande, lue comme la carte la lit (commentaires retirés, espaces retirés) ; une ligne `%…` ou une commande `$` autre que `$J=` ne compte jamais (corrigé après relecture, voir plus bas). `analyzeProgram` note `rotary = { letters, line, count }` (lettres vues, première ligne, nombre de lignes) **seulement si le fichier en contient**. `checkProgram` ajoute alors une entrée codée `ETOUCH_ROTARY_UNCHECKED` dans `info` et recopie `rotary`. Aucune raison d'axe, aucune enveloppe, aucun `blocking`, aucun verdict n'en dépend. |
| `src/server/services/touch/resume.js` | `buildResume` refuse (`ETOUCH_RESUME_ROTARY`, 409) dès qu'une ligne du fichier, avant ou après la ligne choisie, porte un tel mot. `buildResume` sert à l'aperçu et au chargement (`job-load.js:162`, `:220`) : les deux sont couverts. |

Ne comptent pas : une lettre dans un commentaire `( … )` ou après `;`, même imbriqué ; `(MSG, …)` ; `G4 P…`, `M3 S…`, `T1 M6`, les mots d'arc I J K R ; une ligne `$103=…`, `$H` ; une directive `%…` ; une lettre sans nombre. **Une ligne `$J=… A…` compte** (corrigé après relecture). Le champ accessoires `A:` des rapports n'est pas concerné : L0 ne lit que le texte des programmes.

### Page

| Fichier | Changement |
|---|---|
| `touch/check-screen.js` | 4 · Contrôle, vue principale : une ligne `#check-rotary` dans la carte « Verdict », visible **sans ouvrir les détails**. Quand le verdict est « tient dans la machine », la phrase de la barre du bas devient l'avertissement (ton ambre) au lieu de « Tout est prêt ». Le mot du rail, les lignes X Y Z et le bouton de départ ne changent pas. Dépassement ou course non vérifiée : la barre garde sa cause, la ligne s'ajoute. |
| `touch/job-controls.js` | Confirmation de départ : une ligne `#job-start-rotary` sous « Tient dans la machine. » ou « Course non vérifiée. ». |
| `touch/i18n-messages-machine.js`, `touch/i18n-messages-refus.js` | Les deux codes, FR / EN / ES, et deux familles de phrases courtes. |
| `touch/files-touch.css` | Une règle : `.check-rotary` en ambre. |

Phrases montrées à l'opérateur :

| | FR | EN | ES |
|---|---|---|---|
| Contrôle, départ | Ce programme fait tourner l'axe A : CNC Touch ne le contrôle pas encore. | This program turns axis A: CNC Touch does not check it yet. | Este programa hace girar el eje A: CNC Touch aún no lo controla. |
| Reprise à une ligne | Ce programme fait tourner l'axe A : reprenez-le depuis le début. | This program turns axis A: restart it from the beginning. | Este programa hace girar el eje A: empiécelo desde el principio. |

La phrase longue du serveur (lettres, première ligne, « Seuls X, Y et Z sont vérifiés ») est dans « Détails du contrôle ».

## Preuve que rien ne change pour un fichier sans A, B, C

1. **Clé absente.** `rotary` et l'entrée `info` n'existent que si le fichier a un tel mot : l'analyse et le contrôle d'un fichier X Y Z sont les mêmes objets qu'avant.
2. **Avant / après sur le corpus.** `__tests__/support/axis-a-l0-baseline.json` : une empreinte par fichier de `gcode-corpus` (28 programmes, plus 5 programmes ajoutés après relecture), calculée **sur le code d'avant L0** (commit `e574a298`, modifications mises de côté le temps du calcul). L'empreinte couvre l'analyse complète, le contrôle sur trois machines et, pour chaque ligne, le programme de reprise ou son refus. Le test recalcule ces empreintes sur le code actuel : identiques.
3. **Suites existantes** : aucune attente retouchée. Un seul test ajouté dans un fichier existant (`job-service.test.js`).

## Tests

| Suite | Résultat |
|---|---|
| `npx jest src/server/services/touch src/server/services/cncengine src/server/api grbl-simulator --coverage=false` | 66 suites, 1974 tests, tous passent après les corrections (dont 48 de `axis-a-l0.test.js` et 4 ajoutés à `job-service.test.js`). |
| `node examples/cncjs-touch/verify-project.cjs` | 235 / 235 (dont `test-axis-a-l0.cjs`, ajouté à sa liste). |
| ESLint sur les fichiers `src/server` touchés | Aucune erreur. |
| `node examples/cncjs-touch/browser-run.cjs --strict --only e2e,v2` | Voir « Harnais de navigateur » ci-dessous. |

Ce que `axis-a-l0.test.js` prouve, par les vraies fonctions :

- `G0 X500 A90` : toujours `outside`, mêmes `blocking`, mêmes axes, même `overridable` que `G0 X500`, avec `$20=0` et `$20=1`, plus l'avertissement ;
- X Y Z + A dans la course : verdict X Y Z inchangé, avertissement, première ligne et compte justes ;
- verdict « non vérifié » : mêmes raisons avec ou sans A ;
- A seul, B, C, A puis B, minuscules sans espace, `A 9 0`, `G93`, `G10 … A0` : signalés ;
- huit cas qui ne doivent pas l'être (commentaires, message, `G4 P`, `$`, arcs…) : rien ;
- reprise refusée quand le mot est avant, sur, ou après la ligne, pour A, B, C ; pas de refus pour un commentaire ; le refus « ligne invalide » garde sa priorité ;
- les deux textes français du serveur sont ceux du catalogue de la page ;
- chaque programme du corpus, avec un mot A ajouté, garde son contrôle X Y Z sur trois machines.

`job-service.test.js` (service entier) : aperçu de reprise et chargement à une ligne refusés tous deux, rien envoyé au contrôleur ; chargement simple du même fichier : avertissement présent, verdict et axes égaux à ceux du fichier sans A.

`test-axis-a-l0.cjs` (page, FR / EN / ES) : la phrase est lisible dans la carte « Verdict » et dans la barre, détails fermés ; elle reste à côté d'un dépassement et d'une course non vérifiée ; le bouton de départ est actif ou rayé exactement comme sans A ; la confirmation de départ la redit et reste confirmable ; rien n'apparaît pour un fichier sans A, B, C.

## Harnais de navigateur

`node examples/cncjs-touch/browser-run.cjs --strict --only e2e,v2` (Chrome sans fenêtre, sur le PC) : le harnais sort en échec avec **16 défauts, tous déjà listés** dans `../plaque/HARNAIS-CONNU.md`, mot pour mot (bandeau v2 non montré au repos, commandes du Suivi déplacées, `zero-more-open`, recouvrements de « Préparer » en simulation). **Aucun défaut nouveau.** Les cinq autres lignes de la liste connue (bibliothèque, écrans, coupures de mots en v1) relèvent d'étapes non lancées ici. Ce harnais ne charge pas de programme avec A : il prouve que les écrans existants n'ont pas bougé, pas que l'avertissement est bien placé à l'écran réel (cela, c'est `test-axis-a-l0.cjs` pour le contenu, et la tablette pour le rendu).

## Écarts avec la conception

1. **Nom du code.** `ETOUCH_ROTARY_UNCHECKED` au lieu de `ETOUCH_CHECK_ROTARY` : `program-check.test.js:584-589` fige la liste et le nombre (33) des codes `ETOUCH_CHECK_*` ; garder l'ancien nom aurait obligé à retoucher cette attente.
2. **Paramètres.** `{ axis, line, count }` (et `{ axis, line }` pour la reprise), `axis` valant « A » ou « A, B » : c'est le nom que le présentateur de refus de la page sait déjà remplir.
3. **Place de la détection.** Avant le tri des lignes « lues autrement par la carte », et sur la ligne sans espaces : `G0 A 9 0` est signalé (la carte lit A90). La conception disait « après `words(code)` », ce qui l'aurait manqué.
4. **Phrases.** Plus courtes que celles de la conception, et par les familles de refus existantes (règle de 90 caractères, pas de terme technique, test `test-refus-table.cjs`).
5. **Barre du bas.** L'avertissement n'y remplace « Tout est prêt » que si rien d'autre n'est à dire ; sinon il est dans la carte « Verdict », juste au-dessus.

## Après les relectures du code

Avis d'Astra n° 3 (`AXE-A-AVIS-ASTRA-3.md`, « à revoir ») et relecture du code (« à corriger »). Chaque correction a un test qui échouait sur le code d'avant et passe maintenant. **Aucun calcul X Y Z n'a changé** : les 28 empreintes du corpus sont identiques.

| Point | Défaut | Correction | Test |
|---|---|---|---|
| 1, bloquant | `$J=G90 A90 F100` dans un programme : ni avertissement, ni refus de reprise (toute ligne `$` était exclue). Un de mes tests imposait ce faux négatif. | `rotaryLetters` retire les espaces, lit le corps d'une ligne `$J=`, ignore les autres commandes `$`. `resume.js` l'utilise sans changement. | `axis-a-l0.test.js` : `$J=` en G90, en G91, en minuscules avec espaces ; reprise refusée avant, sur, après la ligne. `job-service.test.js` : aperçu **et** chargement refusés, rien envoyé au contrôleur. Attente fausse corrigée. |
| 2 | `G0 X[1+1] A90`, `G0 A90 F[100]`, `G0 A[1+2]`, `G0 A#1` : « non vérifié » sans avertissement rotatif. | La détection est faite avant le classement « ligne opaque ». Le contenu de `[…]` et de `#<…>` est retiré sans être évalué ; une lettre A, B, C suivie de `[` ou `#` compte. Classement, raisons et verdict de ces lignes : inchangés (testé). | Sept cas ajoutés ; `G0 X[a1 + 2] Y#<b2>` et `%B2 = [posa + 1]` ne sont pas signalés. |
| 3 | `%A1=5` dans un fichier sans mot d'axe : reprise refusée avec la phrase de l'axe rotatif, fausse. | Une ligne commençant par `%` ne compte jamais. | Même issue qu'avec `%X1=5` ; et l'empreinte du programme `extra-percent.nc`. |
| 4 | `ui-2027.css:475` rendait la phrase grise dans la confirmation de départ. | Règle plus précise `.ks-ui .job-dialog-card p.check-rotary`. | `test-axis-a-l0.cjs` : la règle existe, suit la règle générale, porte l'ambre. C'est un contrôle du texte de la feuille de style, pas une mesure de couleur dans un navigateur. |

**Empreintes élargies.** Cinq programmes sans mot rotatif ont été ajoutés à la référence, leurs empreintes calculées sur le code du commit `e574a298` : directives et affectations `%`, expressions, `$J=` sur X Y Z, commandes de la carte (`$H`, `$X`, `$103=`), `/` en tête de ligne. Le défaut n° 3 faisait échouer l'une d'elles avant correction.

**Portée de cette preuve.** Les empreintes couvrent ce que rendent l'analyse, le contrôle (trois machines) et la reprise (chaque ligne : programme reconstruit, ou code et paramètres du refus) pour ces 33 programmes. Elles ne prouvent ni les décisions du service (départ, tickets), ni le rendu de la page. Les gardes de départ n'ont pas été touchées et ne lisent pas les données nouvelles.

**Installation.** La version de cache de la page (`v2v`) n'a pas été changée par ce lot : après installation, le kiosque doit être rechargé de force (ou redémarré), sinon il garde l'ancienne page. C'est écrit en tête du protocole.

**Laissé tel quel, noté seulement.**

- Plusieurs lettres : la phrase dit « l'axe A, B ».
- Les lignes après `M2` / `M30` sont comptées (prudence voulue : un sous-programme peut s'y trouver).
- Le rendu réel (débordement, couleur) n'est vérifié par aucun navigateur pour ces deux lignes : à voir sur la tablette, sans départ.

Suites après corrections : Jest 66 suites, 1974 tests ; `verify-project.cjs` 235 / 235 ; ESLint sans erreur. Le harnais de navigateur n'a pas été relancé après ces corrections (une règle CSS et le détecteur du serveur).

## Après le quatrième avis

Avis d'Astra n° 4 (`AXE-A-AVIS-ASTRA-4.md`) : tout accepté sauf deux restes du détecteur sur les lignes à expression. Classement, verdicts, X Y Z et les 33 empreintes : inchangés.

| Point | Défaut | Correction |
|---|---|---|
| 1 | `A-[1+2]`, `A+[1+2]` (et B, C, minuscules, espaces, `A-#1`) non signalés, alors que CNCjs envoie `A-3`. | Signe facultatif, chiffres ou point facultatifs, entre la lettre et l'expression ou la variable (`A-[…]`, `A.[n]`, `A1[n]`). |
| 2 | `G0 X[1+[2]+a1]` signalait A : le masquage s'arrêtait au premier `]`. | Crochets masqués par profondeur. Si les crochets ne s'apparient pas, rien n'est masqué : les lettres sont signalées. |
| 3 | Pas de preuve générale. | **Test de concordance** avec le vrai traducteur du contrôleur (`src/server/lib/translate-expression.js`, appelé par `GrblController.js`) : `axis-a-l0-expressions.test.js`. |

**Le test de concordance.** Environ 1 350 lignes à expression (six lettres, sept formes de signe et d'espace, dix expressions, en `G0`, en `G1` avec d'autres expressions, en `$J=` ; mots littéraux à côté d'une expression ; chiffres ou point avant le crochet ; lettres A, B, C seulement dans les expressions ; variables, crochets imbriqués ou cassés, noms inconnus). Chaque ligne est traduite par le vrai traducteur, puis lue comme la carte la lit. Règle : **dès que la ligne envoyée contient un vrai mot A, B ou C, le détecteur signale cette lettre. Aucun faux négatif : la liste des manqués est vide.** Avant la correction, plus de 750 lignes de cette table étaient manquées.

**Faux positifs restants. Ceux du corpus du test sont tous sur des lignes que la carte refuse en entier (aucun mouvement) ; hors corpus il en existe d'autres (cinquième avis).**

- *Famille non décidable sans évaluer* : un signe devant une expression dont la valeur est négative (`A-[v]` avec v = −2, envoyé `A--2`). Le détecteur n'évalue rien : **il signale, par prudence.**
- Neuf lignes listées une à une dans le test, avec leur raison : lettre devant une variable `#` que CNCjs ne traduit pas, devant une expression sans valeur, ou à côté de crochets qui ne s'apparient pas.

**Limite déclarée.** Le test suppose qu'une expression donne un nombre. Une variable CNCjs qui contiendrait du texte (par exemple « A90 ») et serait posée seule sur une ligne produirait un mot A que le détecteur ne peut pas voir sans évaluer. La ligne reste classée « expression, contenu non prévisible » (course non vérifiée), comme avant L0.

**Après le cinquième avis (« à réaliser »).** Deux précisions, sans changement de code. (1) Faux positif hors corpus : avec `a1=7`, `G0 X['['.length + a1]` est envoyé `G0 X8` mais le détecteur annonce A, parce qu'un crochet dans une chaîne littérale fait paraître les crochets déséquilibrés ; sens prudent, accepté. (2) La limite ci-dessus est plus large que les variables contenant du texte : toute chaîne littérale ou tout traitement de commentaire avant traduction peut tromper le détecteur ; `G0 X['('.length] A90` est envoyé `G0 X1 A90` sans signalement de A, avant comme après L0. La reprise de ces lignes reste refusée. La concordance n'est prouvée que sur le corpus du test.

Suites : Jest 67 suites, 1990 tests ; `verify-project.cjs` 235 / 235 ; ESLint sans erreur.

## Non fait, non vérifié

- **Aucun essai sur la tablette** (Chromium du kiosque, lisibilité réelle, place dans la carte à 1366 × 911) : protocole « L0 axe A » de `../refonte/PROTOCOLE-ESSAI.md`, sans mouvement, sans lancer le programme.
- **2 · Fichier** (avant chargement) ne montre pas l'avertissement : il paraît à 4 · Contrôle, une fois le fichier chargé, et à la confirmation de départ. À décider si on le veut plus tôt.
- **5 · Usinage** ne le redit pas pendant le travail.
- L'ancienne interface (page v1 « Éco » de la RT laser) n’a pas été regardée à part.
- L0 ne dit rien de la carte : aucune lecture, aucun réglage. L1 à L4 restent à faire (conception § 2 et § 3).
