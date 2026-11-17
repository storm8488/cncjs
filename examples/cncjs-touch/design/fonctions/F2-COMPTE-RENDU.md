# F2 — Remonter la fraise à la pause : compte rendu de réalisation (phase B)

> **Non installé.** Ce lot n'est pas dans la branche `feat/fonctions-5` qui part sur la tablette : la quatrième relecture de sûreté (`relectures/astra4-F2.md`) n'a pas donné son accord (deux dangers restants). Le code reste sur la branche `feat/F2`. Ce document décrit une fonction qui n'est pas installée.

Rédigé le 17 novembre 2026. Arbre `C:\Users\damou\Documents\claude\cncjs-wt\F2`, branche `feat/F2`, partie de `feat/refonte-ui` à `db584555`. Conception suivie : `design/fonctions/F2-CONCEPTION.md` (voie (a) « pause propre », puis `$J=` relatifs en Z). Aucun accès à la tablette, à la RT ni à la CNC ; rien n'est poussé ni fusionné.

**Verdict : livré.** La fonction est réalisée de bout en bout (serveur, page, sûreté, protocole d'essai), tous les écarts à la conception vont dans le sens qui refuse ou qui arrête. Elle n'a jamais tourné sur la vraie carte : les preuves sont celles d'un vrai contrôleur CNCjs (vrais `Sender`, `Workflow`, traitement des `ok`) et du simulateur LUNYEE. Elles montrent les octets et les décisions, pas l'effet physique.

## 1. Commits (branche `feat/F2`)

| Commit | Contenu |
|---|---|
| `1832047e` touch: F2 pause and retract (server) | `pause-retract.js` (séquence, surveillance, codes), branchement dans `job-service.js`, codes et familles de refus FR/EN/ES, simulateur LUNYEE (`$J=` hors repos → `error:8`, `$J=` insensible à la correction d'avance), support `sim-controller.js` (vrai `GrblController` sur le simulateur), tests `pause-retract.test.js` (cas 1 à 24) et `pause-retract-lunyee.test.js` (25-26, 29-32), test du simulateur (33). Écrit par une première séance de ce lot ; **relu et revérifié** dans cette séance (code lu en entier, suites relancées). |
| `5414f726` touch: F2 pause and retract (page, safety notes, trial protocol) | Page : bouton « Pause et dégager… », dialogue, états de l'écran 5 · Usinage, textes FR/EN/ES, titre du Journal, `test-pause-retract.cjs` inscrit dans `verify-project.cjs`. Tests LUNYEE 27 et 28 ajoutés. `SURETE.md` et `PROTOCOLE-ESSAI.md` complétés. |

Fins de ligne : les 17 fichiers touchés sont en LF dans l'index et dans l'arbre (`git ls-files --eol`). Aucune conversion activée.

## 2. Tests, relancés dans l'arbre après le dernier commit

| Suite | Résultat | Base `db584555` |
|---|---|---|
| `node examples/cncjs-touch/verify-project.cjs` | **225/225** | 224/224 (+ `test-pause-retract.cjs`) |
| `npx jest src/server/services/touch src/server/services/cncengine src/server/api grbl-simulator --coverage=false` | **54 suites, 1596 tests, tous verts** | 1545 tests (+ 51) |
| ESLint sur tous les fichiers touchés | propre | — (`grbl-simulator.js` garde 3 erreurs et 1 avertissement **déjà présents à la base**, lignes 987, 990, 1208, hors des deux lignes F2) |
| `browser-run.cjs --strict --only sim` | 2 violations | **les 2 mêmes à la base** (mot coupé « Reprendre » / « Reanudar » dans l'encart en alarme, page de simulation 1366 × 768) |
| `browser-run.cjs --strict --only responsive` | 2 violations | **les 2 mêmes à la base** (écran Contrôle, 1180 × 820 et 1280 × 800 agrandi, texte de 2,9 et 1,2 px hors de son contrôle) |
| `browser-run.cjs --strict --only screens` | interrompu | **interrompu de même à la base** : `library 1920-1080-v2-fr-standard` (« comparison squeezed into a side column », puis « timeout: library not followed ») avant toute variante d'écran |

Comparaison à la base : la base a été extraite (`git archive db584555`) dans `examples/cncjs-touch/output/F2-base/` (dossier ignoré de l'arbre F2) et son harnais lancé sur les mêmes étapes, sur ce PC. Le harnais strict n'est donc **pas vert** sur ce PC, ni avec F2 ni sans : F2 n'ajoute aucune violation. Les échecs de la base sont à traiter hors de F2 (lot LIB pour la bibliothèque, Contrôle pour le débordement, encart en alarme pour le mot coupé).

Chaque test ajouté échoue sans le code : vérifié pour la page en remettant `job-resume.js` puis `job-controls.js` de `HEAD~` (échec), en retirant la garde d'alarme et de `canRetract` (échec), et en retirant le placement du bouton (échec). Les tests serveur exigent `pause-retract.js` et ses branchements.

### Mesure ponctuelle de l'encart (non versionnée)

L'étape `screens` ne mesurant rien sur ce PC, et sa maquette ne publiant pas `canRetract`, j'ai mesuré l'écran 5 · Usinage pendant un usinage avec la maquette du harnais (`startV2Fixture`) et un script à part (`examples/cncjs-touch/output/F2/measure-retract.cjs`, dossier ignoré, captures `f2-home-*.png`) : 1366 × 768 (Éco) et 1366 × 911, FR/EN/ES, trois cas (sans `canRetract` = comme avant F2 ; bouton actif ; bouton rayé avec la raison la plus longue).
- Le bouton tient sur une ligne, 48 px de haut, sans débordement, de y = 584 à 632 : **visible sans défiler** aux deux fenêtres.
- Pause, Arrêter, l'action principale, le rail et le bord haut/gauche/largeur de l'encart **ne bougent pas d'un pixel**. L'encart grandit de 100 à 124 px vers le bas (deuxième rangée de boutons), au bas de sa colonne qui défile déjà.
- Avec la raison du refus affichée en FR, le libellé rayé « Reprendre à une ligne… » passe sur deux lignes (mot entier, pas de mot coupé) ; en ES il le fait déjà sans F2.
- Non vérifié : qu'à 1366 × 911 la page était bien en Performance v2 (la mesure ne contrôle pas la classe `perf-v2`).

## 3. Fichiers partagés touchés, et où

| Fichier | Où |
|---|---|
| `src/server/services/touch/job-service.js` | import de `pause-retract.js` ; `retract: null` dans le record ; `'retract'` dans `GUARDED_ACTIONS` ; rapport d'état (`retract.report`), alarme, bannière, `$G` ; oubli à l'arrêt du travail, au chargement, au nouveau départ ; `remove` (`retract.forget`) ; branche F2 de `readyFor(…'resume')` ; opération `retract` de `prepare` ; instantané (`canRetract`, `retractReason`, `refusals.retract`, `pauseRetract`, `canPause` étendu) ; pas synchrone de `control` ; `jog-stop`, `spindleStop`, `resume`, `pause`, `stop` ; `fingerprint` ; `ticketPending`/`holds` ; `closeTransport` ; `socketRefusal` ; `socketStop`. **Conflits attendus avec F1** (mêmes points : `socketStop`, `socketRefusal`, `ticketPending`, `closeTransport`, `snapshot`, `fingerprint`, `stop`). |
| `src/server/services/touch/__tests__/job-service.test.js` | une ligne `retract` dans l'attendu des refus codés (vers la ligne 5030). |
| `examples/cncjs-touch/touch/i18n-messages-refus.js` | trois ajouts en fin de table : familles `degagement-*`, codes `ETOUCH_RETRACT_*`, phrases EN/ES. |
| `examples/cncjs-touch/touch/i18n-messages-machine.js` | lignes ajoutées en fin de table (phrases du serveur, puis textes de la page). |
| `examples/cncjs-touch/touch/job-controls.js` | `DIALOG_TEXT.retract` et `retractResume` ; `ticketAllowed` ; liste des actions exigeant le flux ; textes du dialogue (titre, bouton d'effet, reprise depuis `parked`) ; `retract()` ; export `cncJobControls.retract`. |
| `examples/cncjs-touch/touch/job-resume.js` | table `RETRACT_PHASES` et branche de `screenState` ; bouton `#home-retract` et `#home-retract-reason` dans l'encart ; lignes de « Détails ». **Conflit probable avec F16** (même écran). |
| `examples/cncjs-touch/touch/real-history.js` | `EVENTS.retract` (titre du Journal). |
| `examples/cncjs-touch/verify-project.cjs` | `'pause-retract'` en fin de liste. |
| `grbl-simulator/grbl-simulator.js` | `processJogCommand` : deux lignes, profil LUNYEE seulement. |
| `grbl-simulator/__tests__/lunyee-profile.test.js` | bloc F2 en fin de fichier. |
| `examples/cncjs-touch/design/refonte/SURETE.md`, `PROTOCOLE-ESSAI.md` | sections F2 en fin de fichier. |

Fichiers nouveaux : `src/server/services/touch/pause-retract.js`, `__tests__/pause-retract.test.js`, `__tests__/pause-retract-lunyee.test.js`, `__tests__/support/sim-controller.js`, `examples/cncjs-touch/test-pause-retract.cjs`. Aucun fichier CSS, `index.html` ni `browser-run.cjs` touché.

## 4. Écarts à la conception (tous dans le sens qui refuse ou qui arrête)

1. Code ajouté `ETOUCH_RETRACT_UNEXPECTED` (« état {state} inattendu ») : un `Hold`/`Door` ou un envoi qui change pendant une montée ou une descente n'avait pas de code juste.
2. Une machine dont le type n'est pas **déclaré** CNC est refusée (`ETOUCH_RETRACT_LASER`), pas seulement le laser.
3. Une course Z ambiguë (deux conventions possibles) est refusée comme inconnue.
4. Aucune ligne de F2 ne part tant que le flux de l'appareil est absent, même pendant sa grâce de 3 s.
5. `pauseRetract.line` devient, au repos, la ligne où la machine s'est réellement arrêtée ; la ligne au toucher reste au Journal (`requested`).
6. Pendant la vérification d'une reprise depuis `held`, toute perte (flux, main, rapports) mène à `failed`, sans `M5` (la fraise est dans la pièce, rien de F2 n'a bougé).
7. Page : le bouton n'apparaît ni en alarme (Arrêter seul), ni sur la page de simulation, ni quand le serveur ne publie pas `canRetract` (serveur plus ancien), ni sur un profil laser ; il est **le premier de sa rangée** (sinon il tombait sous le pli à 1366 × 768, derrière « Reprendre à une ligne… », refusé pendant un usinage).
8. Lieu, sans effet sur le comportement : l'en-tête et l'action principale selon la phase sont dans `job-resume.js` (`screenState`, qui alimente déjà le fil et l'action principale par `api.project`), pas dans `job-dashboard.js`.
9. Test 34, « rayé sans flux » : sans flux, la page n'appelle ni `prepare` ni `retract` (garde FIGE, vérifiée par le test) ; le bouton lui-même n'est pas rayé pour cette seule raison, c'est le bandeau FIGE qui le dit.

Points du § 16 laissés à l'opérateur : défauts de la conception gardés (trois touchers avec la case ; 5 mm sous le haut de course ; broche arrêtée en haut ; arrêt de la montée si le suivi est perdu).

## 5. Ce qui reste

- **L'essai réel** (`PROTOCOLE-ESSAI.md`, section « F2 — Pause et dégager »), d'abord fraise en l'air, broche débranchée.
- Relecture de phase C (Astra ultra puis Fable), puis réunion : conflits attendus avec F1 dans `job-service.js` et avec F16 dans `job-resume.js` (encart de l'écran 5).
- Hors F2, à la charge des lots concernés : les quatre échecs du harnais strict présents à la base sur ce PC (§ 2).
- La maquette du harnais (`startV2Fixture`) ne publie pas `canRetract` : l'étape `screens` ne montrera le bouton qu'une fois cette ligne ajoutée à la maquette (je ne l'ai pas fait : fichier partagé, et l'étape ne va pas jusqu'aux écrans sur ce PC).

## 6. Ce qui n'est pas vérifié

- **Rien sur la machine.** Que `$J=` soit refusé hors repos (`error:8`), refusé hors course sans alarme (`error:15`), sans effet sur l'état de la machine (`$G`) et insensible à la correction d'avance vient du code amont R13 et de l'usage des flèches, pas d'un relevé série sur ce binaire. La fonction échoue sans mouvement dangereux si l'un de ces points est faux (comparaisons, cibles dans la course, délai avec facteur 10), mais elle ne marcherait pas.
- Le comportement de la carte quand l'envoi s'arrête en plein usinage sans `!` (chemin M0/M6 de CNCjs) n'a pas de relevé de terrain sur cette machine.
- Le délai d'arrivée d'un `[GC:…]` après le repos (attente de 3 s), le temps de mise en vitesse de la broche (3 s), le maintien de Z moteurs relâchés (`$1`), la durée réelle avant l'arrêt selon le fichier.
- `$20` (limites logicielles) : non exigé par F2 ; à relire sur la carte avant l'essai.
- Le harnais strict n'est vert sur ce PC ni à la base ni avec F2 (§ 2) ; l'étape `screens` n'a mesuré aucun écran ; la mesure de l'encart est un script ponctuel, pas une étape du harnais, et ne prouve pas le mode Performance v2 à 1366 × 911.
- Les traductions EN et ES sont celles de la conception, non relues par un locuteur.
- Les deux tablettes réelles (Surface Pro 3, Surface RT) : rien n'y a été installé ni affiché.

## 7. Ce que l'essai réel devra prouver (protocole, section F2)

1. Hors usinage, le bouton n'apparaît pas ; depuis un appareil sans la main, il est rayé avec la phrase de la main.
2. Fraise en l'air : après le toucher, la machine finit quelques lignes **sans `!`**, s'arrête, monte seule jusqu'à Z machine −5,000, X et Y inchangés au millième ; dans la série, un seul `$J=G91 G21 Z… F600` puis `M5`, `[GC:…]` identique avant et après le `$J=` (hormis M5). Relever le temps entre le toucher et l'arrêt.
3. Cinq minutes en haut : Z ne glisse pas.
4. Reprise : `M3 S…`, 3 s, descente rapide, 5 derniers millimètres lents ; MPos avant `~` égal au millième à celui de l'arrêt ; le fichier finit à la même position qu'une exécution sans pause.
5. Arrêter fraise en haut : **aucun `0x18` ni `!`**, référence gardée, « Reprendre à la ligne N… » avec la bonne ligne.
6. Pause pendant l'attente : retenue ordinaire, pas de montée. Pause pendant la montée : `0x85`, broche commandée à l'arrêt, reprise sur place refusée. Arrêter pendant la montée : considérer la référence perdue.
7. Depuis le PC, fraise en haut : Reprendre refusé (« Fraise dégagée par la tablette… »), rien ne bouge ; prise de la main avec motif : reprise sur place annulée sur la tablette.
8. Page fermée pendant l'attente : pas de montée, « La fraise est restée dans la pièce… », reprise simple (`~` seul).
9. Fichier à longues lignes : le pire temps avant l'arrêt.
10. Broche branchée sans fraise : arrêt en haut, pleine vitesse avant la descente (sinon relever `RETRACT_SPINUP_S`).
11. Seulement ensuite, dans une chute à 1 mm : marque au point d'arrêt ≤ 0,05 mm, puis dans un arc, puis à la profondeur habituelle.
