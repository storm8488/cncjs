# Spécification : interface du mode Performance (Surface Pro 3)

Phase 1 du chantier « Performance UI » (architecte), 2026-11-05, base `feat/touch-profiles` à `59129a0c`. Ce document précise [PERFORMANCE-UI-BRIEF.md](PERFORMANCE-UI-BRIEF.md), qui prime en cas de conflit, et s'ajoute à [PROFILES-CONTRACT.md](PROFILES-CONTRACT.md) et [PROFILES.md](PROFILES.md) sans rien redéfinir de ce qu'ils fixent. Il ne modifie aucun fichier de `touch/`.

Il fixe, pour les lots V (vue 3D en direct), D (poste large) et O (origine visuelle) : le comportement écran par écran, les textes, ce qui n'est jamais fait, les mesures attendues sur la tablette et leur méthode, et le contrat d'API entre les lots (§ 8). Les choix que le brief laisse ouverts sont posés en questions au § 12, chacune avec une recommandation et sa raison. Les lots ne commencent qu'après le point de contrôle de la phase 1 : l'intégrateur reporte les réponses de l'utilisateur dans le brief ; une question restée sans réponse à ce moment est écrite dans le brief avec la recommandation retenue, jamais appliquée en silence.

Maquettes : [design/performance-suivi.html](design/performance-suivi.html), [design/performance-fichiers.html](design/performance-fichiers.html), [design/performance-preparer.html](design/performance-preparer.html) (autonomes, à ouvrir sous `/touch-next/design/` sur la Surface). Briefs des lots : [design/lot-V.md](design/lot-V.md), [design/lot-D.md](design/lot-D.md), [design/lot-O.md](design/lot-O.md).

Convention d'écriture : les textes d'interface sont cités entre « » tels qu'ils doivent apparaître en français, avec l'apostrophe typographique ’ des catalogues existants ; chaque texte nouveau a ses lignes EN/ES dans le fichier de messages du lot (§ 9).

## 0. Chiffres admis

Les seuls chiffres de performance de ce chantier sont ceux de l'étape 0 inscrits au § 6 du brief :

| | Surface Pro 3 (CNC) | Surface RT (laser) |
| --- | --- | --- |
| Fenêtre du kiosque | 1366 × 911 px CSS, DPR 1,58 (relevé fait à 960 × 553, DPR 1, second Chromium) | 1366 × 768, DPR 1 |
| WebGL | matériel (`software: false`), WebGL2, `ANGLE (Intel, Mesa Intel(R) HD Graphics 4400 (HSW GT2), OpenGL 4.6)`, anticrénelage accordé, `ALIASED_LINE_WIDTH_RANGE` 1 à 7,4 px, textures jusqu'à 16 384 | aucun (`--disable-gpu`) |
| 20 000 segments | Canvas 2D 77,5 ms ; WebGL 116 ms au premier dessin (compilation et envoi compris ; régime établi à mesurer par V) | — |
| Repères connus | mémoire JS de la page au repos 5 Mo | environ 28 images/s pendant un geste, 50 à 70 ms pour un parcours complet de 15 000 segments au repos (Canvas 2D, Performance) |

Les objectifs « 60 images/s pendant un geste » et « DPR jusqu'à 2 » sont des cibles du brief, pas des résultats. Aucun autre chiffre de durée, de cadence ou de charge n'apparaît dans ce document. Les tailles physiques du § 5.1 sont un calcul géométrique à partir des 216 ppp (8,5 px/mm) du brief, pas une mesure. Les limites d'API du § 8.3 (nombre d'incrustations, segments) et le plafond de géométrie complète (Q7) sont des budgets de conception, à confirmer par mesure sur la tablette.

## 1. Vocabulaire

- **Suivi** = `#screen-home`, **Fichiers** = `#screen-files`, **Préparer** = `#screen-jog` (libellé du rail « Préparer »). Le rail garde ses sept entrées dans cet ordre : Menu, Préparer, Fichiers, Suivi, Machine, Journal, Réglages.
- **Ligne acquittée** `A` : nombre de lignes du programme (numérotation de l'émetteur CNCjs : lignes non vides, celle de `path3d.lines` et de `motion-estimate.js`) que Grbl a acceptées dans son tampon. Calculée par une seule fonction, `CNCToolPosition.acknowledged(machine, totalLines)` (§ 8.4), celle qui dessine déjà le tracé orange : `received / total × totalLines`, la reprise à une ligne comptée comme aujourd'hui, `totalLines` à la fin d'un programme terminé. « Acquittée » ne veut jamais dire « usinée » : Grbl accepte des lignes avant de les exécuter.
- **Segment** `i` (1 ≤ i < n) : du point `i − 1` au point `i` du parcours ; sa ligne est `lines[i]`, celle qui atteint le point `i`. Un segment est **acquitté** si `lines[i] ≤ A`. **Dernier segment acquitté** `L` = le plus grand `i` tel que `lines[i] ≤ A` (0 si aucun).
- **Passe** : suite maximale de segments de travail (non rapides) consécutifs, bornée par des rapides `G0` ou les extrémités. **Passe en cours** : la passe qui contient le segment où le repère d'outil est accroché (§ 3.3) ; aucune quand le repère n'est pas accroché ou qu'il est sur un rapide.
- **Repère de travail** : celui du programme et de `path3d` (`wcs: 'G54'`, mm). **Repère machine** : celui de `mpos`. **Décalage** `o = mpos − wpos` (par axe, mm), lu dans le même rapport frais. Conversion : `travail = machine − o`, `machine = travail + o`.
- **Rapport frais** : `machine.fresh === true` et reçu il y a au plus 2 500 ms (la règle de `tool-position.js` et du README, « ≤ 2,5 s »), inchangée.
- **Porte GPU** : profil `performance` **et** probe WebGL matériel réussie (§ 2.1). **Poste large** : porte GPU **et** fenêtre ≥ 1300 × 880 px CSS en paysage (§ 2.2).

## 2. Portes d'activation et états

### 2.1 Porte « GPU matériel » (propriétaire : V)

- **Lecture.** Une probe dans `preview-gl.js` (module avancé) : un canvas hors document de 1 × 1, `getContext('webgl', { failIfMajorPerformanceCaveat: true, antialias: true })`, puis le renderer non masqué (`WEBGL_debug_renderer_info`), testé avec l'expression déjà utilisée par `tablet-diagnostic.js` et `perf-harness.js` : `/swiftshader|llvmpipe|softpipe|software|basic render/i`. Matériel = contexte obtenu **et** renderer non logiciel. La probe lit aussi `ALIASED_LINE_WIDTH_RANGE`, `MAX_TEXTURE_SIZE`, l'anticrénelage accordé (`getContextAttributes().antialias`) et la présence de WebGL2 (un second canvas, sans le garder), puis libère le contexte (`WEBGL_lose_context`). Les vues ouvertes ensuite exposent `software: false` (WebGL) ou `true` (Canvas 2D) dans `handle.state()`, comme le brief le nomme.
- **Déclenchement.** `preview-3d.js` (chargé en `<script>` dans les deux profils) : en profil `performance` seulement, au chargement de la page puis à chaque passage en `performance`, appelle `cncProfile.loadAdvanced(['preview-gl.js'])` puis `CNCPreviewGL.probeGpu()`, dans un `requestIdleCallback` (délai maximal 3 s, comme les vues fixes), jamais dans un gestionnaire de `cnc-job-status`. En Éco : aucun chargement, aucun contexte, aucune requête ; `cncGpu.state()` répond `{ checked: true, hardware: false, reason: 'eco' }`.
- **Exposition.** `window.cncGpu` (§ 8.1), l'événement `cnc-gpu-change` sur `window`, et la classe `perf-gpu` sur `body` (présente si et seulement si profil `performance` et probe matérielle). Le résultat est gardé pour la vie de la page : repasser en Éco retire la classe sans oublier le résultat ; revenir en Performance la remet sans nouvelle probe.
- **Perte de contexte.** Une vue qui perd son contexte se ferme comme aujourd'hui (vues fixes, message). En plus : `cncGpu.state().lost = true`, classe `perf-gpu-lost` sur `body`, événement `cnc-gpu-change`. Tant que `lost` est vrai, aucune vue n'ouvre de rendu WebGL en direct : Suivi, Fichiers et Préparer reviennent au comportement actuel dans leur cadre. **La mise en page ne change pas** (la classe `perf-gpu` reste) : une perte de contexte pendant un usinage ne déplace ni Pause, ni Arrêter, ni les corrections (Q4). `lost` ne revient à faux qu'au rechargement de la page.

### 2.2 Poste large (propriétaire : D)

- Classe `perf-wide` sur `body`, posée par `touch-shell.js` : `perf-performance` **et** `perf-gpu` **et** `innerWidth ≥ 1300` **et** `innerHeight ≥ 880` **et** paysage. Recalculée au `resize`, à `cnc-profile-change` et à `cnc-gpu-change` ; événement `cnc-layout-change` (`detail: { wide }`) à chaque changement ; `window.cncLayout.wide()` (§ 8.9). Les feuilles de D n'utilisent que `body.perf-wide` (jamais une requête média répétant la règle).
- La Surface RT (1366 × 768, pas de GPU) n'atteint jamais `perf-wide`. La variante existante « ≥ 1500 × 860 » de `responsive.css` reste telle quelle pour les autres cas.
- Le clavier virtuel de la page (pavé numérique, clavier Wi-Fi) ne réduit pas `innerHeight` : il ne fait pas basculer la mise en page.

### 2.3 Matrice des profils

| | Éco (toutes tablettes) | Performance, rendu logiciel (RT) | Performance, GPU, fenêtre < 1300 × 880 | Performance, GPU, poste large |
| --- | --- | --- | --- | --- |
| Chargé | rien de nouveau | `preview-gl.js` comme aujourd'hui (Q3 : chargé au démarrage pour la probe) | `preview-gl.js`, `preview-inspect.js` en worker à la demande | idem + `origin-preview.js` en entrant dans Préparer |
| Suivi au repos | vues fixes | vue 3D libre inline (Canvas 2D) | vue 3D inline, rendu GPU (§ 4) | idem, zone « Vue » de trois zones (§ 5.2) |
| Suivi en travail / pause | vue fixe + tracé de progression | **idem aujourd'hui** : vue fixe + tracé | vue 3D en direct (§ 3) | idem, trois zones, instruments (§ 6) |
| Fichiers | vues fixes | vue 3D inline (Canvas 2D) | vue 3D inline GPU | liste + grand aperçu 3D (§ 5.3) |
| Préparer | inchangé | inchangé | inchangé (Q6) | jog + vue 3D d'origine (§ 7) |
| Mise en page | actuelle | actuelle | actuelle | `perf-wide` |

« Inchangé » et « aujourd'hui » veulent dire : même DOM, mêmes textes, mêmes requêtes, mêmes timers (hors l'exception de Q3, soumise à l'utilisateur).

### 2.4 États de la machine

| État | Vue 3D Suivi (V) | Instruments (D) | Origine visuelle (O) |
| --- | --- | --- | --- |
| Repos, rien de chargé | parcours de la sélection si présente, pas de progression, repère si rapport frais | « Temps restant : chargez un fichier » (existant) | « Aucun programme chargé : rien à placer. » |
| Repos, programme chargé | parcours, pas de couleur « acquittée », repère | estimation totale (existant) | affichage complet (§ 7) |
| Travail (`workflow: 'running'`) | progression, passe en cours, repère interpolé, « Suivre l'outil » | temps restant corrigé, avance réelle, corrections, ligne acquittée, courbe (Q10) | suspendu : « Travail en cours : aperçu d'origine suspendu. » |
| Pause (`paused`) | progression figée à la dernière valeur, repère immobile (aucune interpolation entre deux positions égales) | « En pause — … » (existant), alerte broche (existante) | suspendu, même texte avec « en pause » |
| Alarme | repère en style « non garanti » (§ 3.4), progression figée | inchangé | suspendu : « Alarme : position machine non garantie, aperçu d'origine suspendu. » |
| État indisponible (pas de rapport frais) | repère « périmé » (§ 3.4), progression figée, « Suivre l'outil » s'arrête | « Temps restant : état indisponible » (existant) | contour figé grisé, « État machine indisponible : aperçu figé. » |
| Type de machine inconnu (`machine-unknown`) | comportement CNC (règle existante) | idem CNC | idem CNC |
| Machine laser (`machine-laser`) | vue laser 2D actuelle, pas de vue 3D en direct (Q8) | instruments avec « Consigne S » | non chargé (Q8) |
| Rendu logiciel (RT) | comportement actuel à l'identique | comportement actuel | non chargé |
| Profil Éco | comportement actuel, rien de nouveau chargé ni demandé | comportement actuel | non chargé |
| Page de simulation | vue en direct avec les libellés « fictifs » existants (« Tracé orange : avancement fictif. ») | idem simulation actuelle | non chargé (Q9) |

**Fichiers**, dans tous ces états : la vue 3D de la sélection ne dépend pas de l'état de la machine (ni progression, ni repère d'outil, ni lecture du programme pendant un travail, Q7) ; rendu GPU sous la porte, comportement actuel sinon ; pendant un travail, une pause ou une alarme, Pause et Arrêter sont dans le bandeau d'état, jamais dans l'écran ; « Charger et ouvrir le Suivi » garde ses gardes actuelles (`canLoad`). En Éco et en rendu logiciel : inchangé.

## 3. Objectif 1 — Suivi en 3D pendant l'usinage (lot V)

### 3.1 Ce qui est dessiné

Porte GPU ouverte, profil CNC, Suivi visible, aperçu du programme chargé (`img.cncPreview.file === machine.name`, empreintes égales quand les deux sont connues, `.job-art` sans `data-identity="other"`) : la vue 3D inline de Suivi **reste ouverte pendant le travail et la pause** (aujourd'hui elle se ferme dès que `workflow !== 'idle'`). Le cadre est celui de l'aperçu (`.job-art`), la caméra se manipule au doigt dans le canvas comme aujourd'hui.

| Élément | Couleur (fond de canvas sombre `#101820` dans les deux thèmes, comme aujourd'hui) | Épaisseur (px CSS, × DPR à l'écran) |
| --- | --- | --- |
| Coupe restante | palette de profondeur existante (`toolpath-3d.js` : cyan `#55d6ed` à Z ≥ 0, violet → rouge en descendant), avec fondu de profondeur (§ 4) | 2 |
| Rapide restant | `#657c8f` × 0,8 (existant) | 1 |
| Coupe acquittée | orange `#ffc857` (la couleur du tracé de progression actuel, `--warn-text`) | 2 |
| Rapide acquitté | orange `#ffc857` à 50 % vers le fond | 1 |
| Passe en cours | blanc `#eef3f6` | 3 |
| Repère d'outil | disque `--accent` `#8ecbff`, anneau blanc, liseré noir (le style du point actuel), taille fixe à l'écran (16 px CSS), dessiné au-dessus du parcours (sans test de profondeur) | — |
| Repère périmé ou non garanti | anneau gris `#87969f`, centre vide | — |
| Trièdre, brut, brides | existants | 1 |

Ordre de dessin : rapides, coupes restantes, coupes acquittées, passe en cours, incrustations, repère. La couleur « acquittée » se décide dans le shader par la ligne du sommet comparée à un uniforme `A` : une nouvelle valeur de `A` ne renvoie aucun tampon (V choisit l'encodage, § 4).

Légende sous le cadre, dans la note existante `#tool-position-note` (16 px), une seule phrase par état (§ 3.6).

### 3.2 Progression et passe en cours

- `A` est recalculée à chaque rapport (dans le gestionnaire, calcul seulement) ; le dessin suit au prochain `requestAnimationFrame`.
- Pas de rapport frais : `A` reste à sa dernière valeur (figée), la légende le dit (§ 3.6).
- Programme terminé : `A = totalLines` (règle existante) ; tout est orange, pas de passe en cours, repère au dernier point rapporté.
- Passe en cours : calculée à partir de l'index d'accroche du repère (§ 3.3), en parcourant les segments voisins jusqu'aux rapides. Bornée à `L` : la partie de la passe au-delà du dernier segment acquitté reste dessinée en coupe restante, jamais en blanc.

### 3.3 Repère d'outil interpolé, jamais au-delà du dernier segment acquitté

Conditions d'affichage (celles de `tool-position.js`, inchangées) : rapport frais, page réelle avec `operator.reportUnits === 'mm'` et `operator.wcs === 'G54'` (repère de `path3d`), `wpos` numérique en X, Y, Z ; page de simulation : `workPosition` fictive en G54. Sinon pas de repère et la raison existante (« Position outil : repère G54 et rapports en mm requis. », « Position outil inconnue. »).

Mémoire : les deux derniers rapports utilisables `R₋ = (t₋, p₋)` et `R = (t, p)`, `t` = heure d'arrivée sur la page (`performance.now()`), `p = wpos`. Le gestionnaire de `cnc-job-status` ne fait que ranger le rapport, recalculer `A` et `L`, et demander une image (`invalidate()` → au plus un `requestAnimationFrame` en attente). Aucun dessin, aucune lecture de mise en page, aucune recherche dans le parcours dans le gestionnaire.

À chaque image (`paint(now)`) :

1. **Accroche** de `p` sur le parcours : recherche du point le plus proche parmi les segments `j ≤ L` seulement, en partant de l'index d'accroche précédent (fenêtre glissante vers l'avant, petite fenêtre vers l'arrière pour les allers-retours), tolérance `max(2 × path3d.tolerance, 0,1 mm)` pour le parcours simplifié et `0,1 mm` pour la géométrie complète (paramètres de conception). Résultat : `s` = abscisse curviligne cumulée, ou « non accroché ». Même opération pour `p₋` (gardée en cache d'un rapport à l'autre).
2. **Interpolation** si les deux sont accrochés, `s₋ ≤ s`, et `0 < t − t₋ ≤ 1 000 ms` : `α = clamp((now − t) / (t − t₋), 0, 1)`, position affichée = point du parcours à l'abscisse `s₋ + α (s − s₋)`. Le repère avance donc du rapport précédent au dernier, avec un retard d'au plus un intervalle entre rapports, et s'arrête **exactement** sur la dernière position rapportée quand `α = 1`. Il n'y a pas d'extrapolation : aucune abscisse au-delà de `s`, et `s` est elle-même sur un segment `≤ L`.
3. **Sinon** (non accroché, retour en arrière, rapports trop espacés, premier rapport, pause) : le repère est dessiné à la position rapportée `p` telle quelle, sans interpolation.
4. Les images ne sont demandées que tant que `α < 1` et que Suivi est visible ; une fois `α = 1`, plus aucune image jusqu'au prochain rapport ou geste. Une image en retard n'est jamais rattrapée : la suivante calcule `α` pour son propre `now`.

Ce qui est garanti et testé (§ 11) : la position affichée appartient toujours au segment de `p₋`, au segment de `p`, ou aux segments compris entre eux, tous d'indice `≤ L` ; ou bien elle vaut `p`. Elle n'est jamais un point d'un segment `> L`.

### 3.4 Données périmées et alarme

- **Périmé** : plus de rapport frais depuis 2 500 ms (même seuil que l'existant), `fresh === false`, ou flux perdu. Le repère reste à la dernière position **rapportée** (`p`, jamais une position interpolée), en anneau gris ; l'interpolation et « Suivre l'outil » s'arrêtent à l'instant où la règle devient vraie ; `A` est figée. Une image est dessinée au passage à l'état périmé (vérifié par un délai existant de 2 600 ms dans `tool-position.js`, réutilisé), puis plus aucune.
- **Retour d'un rapport frais** : reprise sans interpolation depuis l'ancienne position (le premier rapport frais sert de nouveau départ `R₋`).
- **Alarme** (`activeState` commençant par `Alarm`) : le repère passe en anneau gris même si le rapport est frais, avec la phrase « Alarme : position non garantie. » ; pas d'interpolation.

### 3.5 « Suivre l'outil »

- Un bouton bascule de 48 px « Suivre l'outil » (`aria-pressed`) dans la barre d'outils inline de la vue, visible sans déplier « Vues » pendant un travail ou une pause, replié dans « Vues » au repos. Désactivé avec sa raison (« Position outil inconnue. ») quand le repère n'est pas affiché.
- Actif : à chaque image, la translation de la caméra place le repère au centre du cadre ; orientation et zoom restent ceux de l'opérateur. Rotation à un doigt et pincement gardent le suivi (le pincement zoome autour du repère). Un déplacement à deux doigts, « Recentrer » ou un préréglage de vue le désactivent (le bouton repasse à `aria-pressed="false"`).
- État périmé ou alarme : la caméra s'arrête là où elle est ; le bouton reste pressé et reprend quand le repère redevient frais.
- Par défaut : inactif (Q5). Non mémorisé (aucune clé `localStorage` nouvelle).

### 3.6 Textes (Suivi, vue en direct)

Les libellés existants restent vrais ; la note sous le cadre devient, selon l'état (une phrase, réécrite seulement quand elle change, les secondes en entier comme aujourd'hui) :

| État | Note `#tool-position-note` |
| --- | --- |
| Travail, repère frais | « Parcours prévu · orange : lignes acquittées par Grbl (acceptées, pas forcément usinées) · blanc : passe en cours · repère : position de travail rapportée par Grbl il y a ‹N s | moins d’une seconde›, G54, interpolée entre deux rapports. » |
| Repère non accroché | même phrase avec « … rapportée par Grbl il y a N s, G54 (hors du parcours dessiné : non interpolée). » |
| Périmé | « Position périmée : dernier rapport il y a N s. Repère et avancement figés. » |
| Alarme | « Alarme : position non garantie. Repère et avancement figés. » |
| Géométrie simplifiée | suffixe « Géométrie simplifiée (‹n› points). » quand la vue dessine `path3d` et non la géométrie complète |
| Simulation | « Tracé orange : avancement fictif. Point : position fictive G54. Le travail simulé ne déplace pas ce point. » (textes existants, couleur corrigée selon Q1) |

Au repos, la note existante est conservée. Le libellé « Point rose » de `tool-position.js` est faux aujourd'hui (le point est en `--accent`, bleu clair) : voir Q1.

### 3.7 Ce qui n'est jamais fait

- Rien n'est envoyé au contrôleur ; aucun appel à `cncJobControls`, à `job-stream.js` en écriture, ni à une route `api/touch-job`.
- Aucun dessin, aucune lecture de `getBoundingClientRect`, aucune recherche d'accroche dans un gestionnaire de `cnc-job-status`.
- Pas d'extrapolation du repère, pas de position « prévue » au-delà de la dernière rapportée, pas de couleur « usinée ».
- Pas de lecture du programme (`watch/file`) pendant un travail si la géométrie complète n'est pas déjà en mémoire (Q7).
- Pas de geste de caméra hors du canvas (pointer capture, `preventDefault`, `stopPropagation`, comme aujourd'hui).

### 3.8 Géométrie

- **Simplifiée** : `path3d` du sidecar (≤ 30 000 points, décimée), toujours disponible, comme aujourd'hui.
- **Complète** (porte GPU seulement) : le programme lu par `CNCPreviewInspect.fetchProgram(file)`, empreinte vérifiée contre `meta.fingerprint` (`sameFingerprint`), interprété dans le worker existant de `preview-inspect.js` (nouveau message `geometry`, interpréteur `CNCMotionEstimate.createInterpreter` en lecture seule, arcs découpés à 0,01 mm de flèche au plus) ; résultat transféré (tampons `Transferable`) : positions, lignes, drapeau rapide. Utilisée seulement si elle tient sous le plafond (Q7) ; sinon la vue garde `path3d` et le dit (« Géométrie simplifiée : programme trop long pour la géométrie complète (‹n› segments). »).
- Lecture : au repos à l'ouverture de la vue, jamais pendant un travail (Q7). Le résultat est gardé pour le programme chargé (une entrée, par empreinte) d'un écran à l'autre ; libéré au passage en Éco, à la perte de contexte, à `pagehide`, au chargement d'un autre programme (Q7, exception au « libéré au changement d'écran » du brief, soumise à l'utilisateur). Les tampons GL, eux, sont libérés au changement d'écran comme le brief l'exige.

## 4. Objectif 4 — Rendu à la hauteur du GPU (lot V)

Quand la porte GPU est ouverte et que la vue a obtenu un contexte WebGL ; sinon exactement le comportement actuel (Canvas 2D, 30 images/s en geste, DPR ≤ 1,5, 1 500 segments en geste).

| Réglage | Rendu logiciel (actuel, inchangé) | Porte GPU ouverte |
| --- | --- | --- |
| Cadence pendant un geste | 30 images/s au plus (`GESTURE_FRAME_MS = 33`) | une image par `requestAnimationFrame`, cible 60 images/s (brief) |
| Résolution du canvas | DPR ≤ 1,5 | DPR ≤ 2 (`min(2, devicePixelRatio)` : 1,58 au kiosque actuel, 1,25 à l'échelle 1,25) |
| Anticrénelage | non | `antialias: true` à la création du contexte ; si refusé, la vue le dit dans `state()` et continue |
| Épaisseurs | 1 px | § 3.1 ; `gl.lineWidth` borné à `ALIASED_LINE_WIDTH_RANGE` ; si la plage maximale est 1, toutes les lignes à 1 px et `state().lineWidth` le dit (Q11) |
| Géométrie | `path3d` décimée | complète quand elle tient (§ 3.8) |
| Relief | couleur par profondeur | couleur par profondeur + fondu de profondeur : chaque fragment est rapproché du fond selon sa distance à la caméra (jusqu'à 45 % au plus loin, paramètre), test de profondeur actif (`depth: true`) pour le parcours |
| Rendu au repos | sur changement seulement | sur changement seulement ; pendant un travail, les images de l'interpolation (§ 3.3) |
| Contexte | WebGL1, `powerPreference: 'low-power'`, `failIfMajorPerformanceCaveat: true` | inchangé (WebGL1 suffit pour des lignes ; WebGL2 n'est pas requis, Q11) |

Le passage d'un rendu à l'autre se décide à l'ouverture de la vue, d'après `cncGpu.state()` : jamais en cours de vie d'une vue. `handle.state()` expose `software`, `gpu`, `dpr`, `antialias`, `lineWidth`, `geometry: 'full' | 'simplified'`, `segments` ; `handle.stats()` (§ 8.2) donne les compteurs pour la mesure sur la tablette.

Jamais : de rendu continu sans raison (pas de boucle `requestAnimationFrame` au repos), de file d'images en retard, de contexte WebGL gardé ouvert sur un écran caché, de second contexte pour la même vue.

## 5. Objectif 2 — Poste large (lot D)

### 5.1 Échelle du kiosque

Deux réglages possibles du kiosque (Q2) ; les maquettes montrent les deux :

| | 1366 × 911 (échelle 1,58) | 1728 × 1152 (échelle 1,25) |
| --- | --- | --- |
| 16 px CSS (texte utile minimal) | 25 px physiques ≈ 3,0 mm | 20 px ≈ 2,4 mm |
| 48 px CSS (cible secondaire) | 76 px ≈ 8,9 mm | 60 px ≈ 7,1 mm |
| 64 px CSS (cible primaire) | 101 px ≈ 11,9 mm | 80 px ≈ 9,4 mm |
| Zone utile (sous le bandeau 72 px, à droite du rail 88 px, marges 16 px) | ≈ 1246 × 791 px CSS | ≈ 1608 × 1032 px CSS |

(Calcul : px CSS × échelle ÷ 8,5 px/mm. Sur la RT, 1366 × 768 à environ 5,8 px/mm, 16 px font ≈ 2,8 mm et 64 px ≈ 11 mm.)

### 5.2 Suivi

Trois zones (brief), grille `body.perf-wide .job-dashboard` :

| Zone | Contenu (IDs existants conservés) | 1366 × 911 | 1728 × 1152 |
| --- | --- | --- | --- |
| **Vue** | `.job-art` (contient `#home-job-image` et la vue 3D inline de V), barre de vue (« Vues », « Suivre l’outil », « Agrandir »), `#tool-position-note` dessous | `minmax(0,1fr)` ≈ 554 px | ≈ 836 px |
| **Instruments** | `#home-job-percent` (64 px) et `#home-job-progress`, temps restant (§ 6, 28 px), ligne acquittée, coordonnées travail (48 px) et machine (24 px), avance réelle et broche réelle, corrections en lecture, courbe (Q10) | 300 px | 340 px |
| **Commandes** | `#home-job-ready`, `#home-job-load`, rangée Démarrer / Pause (`#home-job-primary-row`) ou Reprendre, `#home-job-feedback`, corrections (`#home-overrides`, boutons ±10 % / 100 % à 64 px, ±1 % à 48 px, rapides 25/50/100 % à 48 px), `.home-stop` (« Arrêter le travail », 64 px, rouge, seul en bas) | 360 px | 400 px |

Variante soumise à l'utilisateur (Q3b) : à 1366 × 911, deux colonnes (Vue ≈ 710 px | colonne de 520 px divisée en Instruments puis Commandes) plutôt que trois, parce que trois colonnes donnent à la vue 3D moins de largeur qu'aujourd'hui (≈ 554 contre ≈ 710 px). La maquette de Suivi a un sélecteur pour comparer.

Règles : Démarrer ou Reprendre reste la seule action primaire ; Arrêter reste seul en bas de la zone Commandes, jamais à côté de Pause ; Pause et Arrêter restent aussi dans le bandeau d'état ; rien ne recouvre le bandeau. En inspection (`t-inspect`), la Vue prend la largeur des Vue + Instruments, les Commandes restent.

### 5.3 Fichiers

Grille `body.perf-wide #screen-files` : liste `clamp(440px, 34vw, 560px)` | détail `minmax(0,1fr)` (≈ 464 | 766 px à 1366 ; 560 | 1032 px à 1728). Le détail : nom (24 px), métadonnées (16 px), aperçu 3D inline grand (`.library-image-wrap`, flexible, au moins 420 px de haut), dimensions X / Y / Z en trois tuiles, estimation par les mouvements (16 px), outils (« Préparer le travail… », « Détails de l’aperçu », 48 px), « Charger et ouvrir le Suivi » (64 px, vert, seule action primaire). Lignes de liste 92 px inchangées (environ six visibles à 911 px). Pas de Démarrer, Pause, Reprendre ni Arrêter dans l'écran (règle UI 2027) : ils restent dans le bandeau d'état pendant un travail.

### 5.4 Préparer

Grille `body.perf-wide.perf-origin #screen-jog` (la classe `perf-origin` est posée par O quand sa carte est montée, § 8.7) : bandeau d'intro sur toute la largeur | colonne gauche `clamp(440px, 34vw, 520px)` : tableau des coordonnées (Travail 36 px, Machine 20 px, « Zéro X / Y / Z » 48 px), pas de déplacement (58 px), « Zéro XYZ » et « Vitesse du test… » (48 px), croix de jog 96 px et Z+ / Z− 96 px | colonne droite `minmax(0,1fr)` : carte `#op-card` d'O (vue 3D d'origine, légende, état de la course). Entre le bord du canvas et le bouton de jog le plus proche : au moins 24 px (deux gouttières et le bord de carte), pour qu'un doigt qui glisse d'un geste de caméra n'atteigne jamais une flèche, et inversement. Sans `perf-origin` (O pas chargé, échec, travail en cours), la grille actuelle de Préparer s'applique.

### 5.5 Cibles, texte, harnais

- Cibles : 64 px primaires (Démarrer / Reprendre, Pause, Arrêter, « Charger et ouvrir le Suivi », croix de jog 96 px), 48 px secondaires (tout le reste, y compris les boutons de vue de la 3D). Texte utile ≥ 16 px. Écart entre cibles 12 px (`--tap-gap`).
- `browser-run.cjs` (D) ajoute 1366 × 911 et 1728 × 1152 à sa liste, garde 1366 × 768 ; pour ces deux fenêtres, il pose `perf-performance` par le stockage et `perf-gpu` par CDP (`document.body.classList.add('perf-gpu')` puis `cnc-gpu-change`), parce que l'Edge sans écran du PC n'a pas de GPU matériel (SwiftShader) ; aucun crochet de forçage n'est ajouté au code livré (Q12).

## 6. Objectif 5 — Instruments pendant le travail (lot D)

Zone Instruments de Suivi en poste large ; hors poste large, l'affichage actuel ne change pas.

| Instrument | Source | Texte (exemples de forme) | Règles |
| --- | --- | --- | --- |
| Temps restant (titre, 28 px) | `CNCMotionEstimate.remaining` (corrigé par les lignes acquittées) si l'estimation existe et que les rapides sont connus ; sinon l'estimation au rythme existante | « Reste 18 min (mouvements, corrigé ×1,1) » ; « Reste 19 min (rythme observé) » | la source est toujours écrite ; minute au-delà de 2 min (règle existante) ; « En pause — estimation suspendue » (existant) |
| Seconde estimation (16 px) | l'autre méthode | « Selon le rythme observé : 19 min » | masquée si indisponible |
| Durées inconnues à venir (16 px) | `remaining().unknownsAhead` | « Durées inconnues à venir : changement d’outil M6 (l. 812) » | texte existant |
| Ligne acquittée (20 px) | `CNCToolPosition.acknowledged` | « Ligne acquittée 8 412 / 20 030 » | jamais « en cours d’usinage » ; le texte G-code de la ligne : Q10b |
| Avance réelle (28 px) | `machine.feedrate` (champ `FS:` de Grbl) | « 1 800 mm/min » sous « Avance réelle » | « — » si pas de rapport frais |
| Broche réelle / consigne S | `machine.spindleSpeed` | « 12 000 tr/min » / « Consigne S rapportée » (laser) | libellés existants |
| Corrections (lecture) | `machine.overrides.feed/spindle/rapid` | « Avance 110 % · Broche 100 % · Rapides 100 % » | une valeur ≠ 100 % est écrite en ambre avec son signe ; les boutons restent dans la zone Commandes |
| Courbe de la dernière minute (Q10) | `feedrate` de chaque rapport, 60 s glissantes | titre « Avance réelle, dernière minute » ; axe en mm/min | dessinée au plus une fois par seconde, Suivi visible seulement, SVG `polyline` réécrite (pas de canvas supplémentaire) ; échantillons rangés dans le gestionnaire (une affectation), dessin dans `requestAnimationFrame` |

Rien de ce qui est affiché n'est une mesure de la pièce : « acquittée », « rapportée », « estimée », « corrigé » sont toujours écrits. `job-controls.js` n'est touché que pour l'affichage (libellés, classes), jamais sa logique de commande ni ses gardes.

## 7. Objectif 3 — Origine visuelle dans Préparer (lot O)

### 7.1 Quand

Poste large (`perf-wide`), machine CNC (Q8), page réelle (Q9), Préparer visible : `job-preparation.js` charge `cncProfile.loadAdvanced(['preview-gl.js', 'origin-preview.js'])` à la première entrée dans Préparer, puis `CNCOriginPreview.mount()`. Hors de ces conditions, rien n'est chargé et Préparer est inchangé.

### 7.2 Ce qui est montré

Dans la carte `#op-card` (colonne droite), une vue 3D (V, `CNCPreviewGL.open(meta, { container, live: { tool: true }, pathStyle: 'ghost', fit: 'all', overlays })`) du **programme chargé** (`machine.name`, aperçu obtenu par `cncDashboardView.loadedPreview()`, § 8.6) :

| Incrustation (§ 8.3) | Repère | Couleur | Signification |
| --- | --- | --- | --- |
| parcours à l'origine actuelle (`pathStyle: 'ghost'`) | travail | gris `#87969f`, 1 px | où le programme s'exécuterait avec l'origine actuelle |
| `program` translaté de `(wx, wy, 0)` | travail | `info` `#7cbcff`, 2 px | où il se placerait si l'origine X Y était posée à la position courante (Q6 pour Z) |
| `box` du contour XY du programme placé (étendue X Y, de Z min à Z max du programme) | travail | `ok` si dans la course, `danger` si hors course, `neutral` si non vérifiable | lecture rapide du verdict |
| `box` du brut de la fiche projet, translaté comme le programme | travail | `stock` (existant) | position supposée du brut avec la nouvelle origine |
| `box` de la course machine `$130–$132` | machine | `neutral`, 1 px | volume atteignable après prise d'origine |
| `marker` de l'origine proposée | travail, à `(wx, wy, 0)` (Z de l'origine actuelle, Q6) | `info` | là où le zéro X Y serait posé |
| repère d'outil | (vue en direct de V, sans progression) | existant | position rapportée |

`wx, wy, wz` = position de travail du dernier rapport frais. Les translations sont mises à jour à chaque rapport (dans l'image suivante, par V : un uniforme, aucun renvoi de tampon pour `program`).

### 7.3 Course et verdict

- Données : `CNCTravelCheck.travelBox(machine)` et `CNCTravelCheck.place(preview, machine, { axes: 'xy' })` (§ 8.8), exposées par O dans `travel-check.js` sans changer la règle : `place` appelle `check()` sur une copie de l'état où `wpos.x = wpos.y = 0` (ce que serait le rapport juste après « Zéro X » et « Zéro Y » à cet endroit), donc les mêmes refus (`$22`, G91, repère, pouces, `$130/$131` inconnus).
- Le contrôle de course du serveur (`programCheck`) reste celui qui compte pour l'origine actuelle ; l'affichage d'O est une estimation de la tablette et le dit.
- Z n'est jamais vérifié (règle existante) ; la boîte de course dessine Z si `$132` est connu, avec « Z non vérifié ».

### 7.4 Textes (carte `#op-card`)

| Élément | Texte |
| --- | --- |
| Titre | « Où le programme se placera » |
| Bandeau permanent | « Affichage seulement : rien n’est envoyé, aucune origine n’est posée. » |
| Légende | « Gris : origine actuelle (G54) · Bleu : si l’origine X Y est posée ici · Cadre : course machine ($130–$132) » |
| Verdict ok | « Si l’origine X Y est posée ici : dans la course machine en X et Y (estimation de la tablette ; Z non vérifié). » |
| Verdict hors course | « Si l’origine X Y est posée ici : hors course en ‹X 12,0 → 132,0 mm (course −400,0 → 0,0)›. » (format de `travel-check.js`) |
| Verdict inconnu | « Course non vérifiable : ‹raison de travel-check.js›. » |
| Origine actuelle | « Origine actuelle : ‹verdict de programCheck ou de check()› » |
| Pas de programme | « Aucun programme chargé : rien à placer. » |
| Aperçu sans parcours 3D | « Aperçu sans parcours 3D : régénérez-le dans Fichiers. » |
| Travail / pause / alarme / état indisponible | § 2.4 |
| Vue indisponible (perte de contexte, module absent) | « Vue 3D indisponible : ‹raison›. Le contrôle de course reste au chargement et au démarrage. » |

### 7.5 Ce qui n'est jamais fait

- Aucun envoi, aucun appel aux boutons « Zéro … » ni à `real-motion.js`, `coordinate-plan.js`, `dry-motion.js`, aucune écriture de coche dans la préparation guidée (« Origine de travail réglée » reste une coche de l'opérateur).
- Aucune règle de course nouvelle ou modifiée ; aucune conclusion verte quand `travel-check.js` dit « non vérifiable ».
- Aucun geste de caméra hors du canvas ; aucune cible de la carte à moins de 24 px d'une flèche de jog.

## 8. Contrat d'API entre les lots

Toutes les API sont en JavaScript ES2017 en script (IIFE), sans dépendance. Une API absente (module pas encore livré, échec de chargement) est détectée par l'appelant, qui affiche sa raison et garde le comportement actuel : aucun lot ne suppose qu'un autre est présent.

### 8.1 `window.cncGpu` (V, `preview-3d.js` + `preview-gl.js`)

```js
cncGpu.state() -> {
  checked: boolean,        // probe done (always true in eco)
  hardware: boolean,       // performance profile AND hardware WebGL; false in eco
  lost: boolean,           // a view lost its WebGL context since the page loaded
  renderer: string,        // unmasked renderer string, '' when unknown
  webgl2: boolean, antialias: boolean,
  lineWidth: [number, number],   // ALIASED_LINE_WIDTH_RANGE, [1, 1] when unknown
  maxTextureSize: number,
  reason: '' | 'eco' | 'pending' | 'no-webgl' | 'software' | 'probe-failed' | 'context-lost'
}
cncGpu.ready() -> Promise<state>   // settles after the probe; resolves at once in eco
// window event 'cnc-gpu-change', detail = state(); body classes 'perf-gpu', 'perf-gpu-lost'
```

`CNCPreviewGL.probeGpu()` (dans le module avancé) fait la probe ; seul `preview-3d.js` l'appelle. D et O ne lisent que `cncGpu` et les classes.

### 8.2 `CNCPreviewGL.open(meta, options)` et la poignée (V)

Options existantes inchangées (`container`, `document`, `window`, `onClose`, `onFallback`, `source`, `storage`, `stock`). Options nouvelles, toutes facultatives et ignorées sans porte GPU (comportement actuel) :

| Option | Valeurs | Effet |
| --- | --- | --- |
| `live` | `{ progress: boolean, tool: boolean }` | la vue lit elle-même `cnc-job-status` : `progress` = couleurs acquittées et passe en cours (§ 3.1-3.2), `tool` = repère interpolé (§ 3.3-3.4) et « Suivre l’outil » ; fournit aussi le décalage `o` aux incrustations en repère machine |
| `overlays` | tableau (§ 8.3) | incrustations initiales, comme `setOverlays` |
| `pathStyle` | `'normal'` (défaut) / `'ghost'` / `'hidden'` | parcours en couleurs, en gris 1 px, ou non dessiné (les incrustations `program` restent possibles) |
| `fit` | `'path'` (défaut) / `'all'` | cadrage initial et « Recentrer » sur le parcours, ou sur parcours ∪ incrustations dessinées ∪ repère |

Poignée retournée (en plus de `close`, `state`, `paint`, `applyFilters`, `inspect`, `dialog`, `canvas`) :

```js
handle.setOverlays(list) -> { ok: boolean, accepted: string[], refused: [{ id, code, message }] }
handle.follow(on?: boolean) -> boolean          // current follow state; no-op without live.tool
handle.state() -> { ...existing, gpu, software, dpr, antialias, lineWidth, geometry: 'full'|'simplified', segments,
                    live: { ackLine, lastAckSegment, pass: [from, to] | null,
                            marker: { shown, stale, alarm, snapped, interpolating, ageMs, at: [x, y, z] | null },
                            follow },
                    overlays: [{ id, drawn, reason }] }
handle.stats() -> { frames, gestureFrames, lastPaintMs, maxPaintMs, uploads, uploadBytes, dpr, canvas: { width, height } }
CNCPreviewGL.checkOverlays(list) -> { accepted: object[], refused: [{ id, code, message }] }   // pure, for tests
```

Cycle de vie : la vue se ferme (et libère tampons, programme, contexte, écouteurs, worker) à `close()`, au changement d'écran, au passage en Éco, au verrouillage d'écran, à `pagehide`, à la perte de contexte (règles existantes). Les incrustations appartiennent à la poignée et disparaissent avec elle ; l'appelant rouvre une vue au retour sur son écran.

### 8.3 Incrustations

Forme exacte (un objet par incrustation, aucun champ en plus) :

```js
{ id: 'travel', kind: 'box', frame: 'machine', min: [-400, -300, -80], max: [0, 0, 0], colour: 'neutral', width: 'thin' }
{ id: 'placed', kind: 'program', translate: [-312.4, -250, 0], colour: 'info', width: 'thick' }      // frame is always 'work'
{ id: 'outline', kind: 'segments', frame: 'work', points: [x0, y0, z0, x1, y1, z1, ...], colour: 'ok', width: 'thick' }
{ id: 'origin', kind: 'marker', frame: 'work', at: [-312.4, -250, 12], colour: 'info' }
```

| Champ | Règle | Refus (`code`) |
| --- | --- | --- |
| `id` | chaîne `/^[a-z0-9-]{1,32}$/`, unique dans la liste | `id` |
| `kind` | `'segments'`, `'box'`, `'program'`, `'marker'` | `kind` |
| `frame` | `'work'` (défaut) ou `'machine'` ; absent pour `program` | `frame` |
| `points` | tableau ou `Float32Array`, longueur multiple de 6 (paires de points), ≤ 300 000 nombres au total pour toutes les incrustations `segments` | `points`, `limit` |
| `min`, `max`, `at`, `translate` | trois nombres finis, `min ≤ max` par axe | `number` |
| coordonnées | finies, valeur absolue ≤ 100 000 mm | `number` |
| `colour` | `'info'` `#7cbcff`, `'ok'` `#5fe39a`, `'warn'` `#ffc857`, `'danger'` `#ff8a80`, `'neutral'` `#aab8c1`, `'stock'` `#dbc796`, `'clamp'` `#ff784f` (valeurs des jetons sombres ; aucune couleur CSS libre) | `colour` |
| `width` | `'thin'` (1 px CSS) ou `'thick'` (2 px CSS), × DPR, borné par `lineWidth` | `width` |
| nombre | au plus 16 incrustations | `limit` |
| autre champ, fonction, objet inattendu | refusé | `field` |

- Repère : `work` = repère de travail du parcours (G54, mm), dessiné tel quel. `machine` = converti par `travail = machine − o` à chaque image, `o` venant du dernier rapport frais de la vue en direct (`live.tool` requis). Sans `o` connu (pas de `live.tool`, rapport périmé, unités en pouces, repère ≠ G54) : l'incrustation est **acceptée mais pas dessinée** (`state().overlays[i] = { drawn: false, reason: 'no-offset' | 'stale' | 'units' | 'wcs' }`), et redessinée dès que `o` redevient connu.
- `program` réutilise le tampon du parcours avec une translation (un uniforme) et une couleur unie ; il suit `pathStyle` pour rien.
- `marker` : trièdre de taille fixe à l'écran (24 px CSS), sans texte (les textes sont dans le DOM de l'appelant).
- `setOverlays` remplace l'ensemble (déclaratif) ; une incrustation dont l'objet est inchangé (même `id`, mêmes valeurs) n'est pas renvoyée au GPU. Appel autorisé dans un gestionnaire d'événement : il range et demande une image, il ne dessine pas.
- Aucune sémantique de commande : la vue ne connaît ni « zéro », ni « course », ni « hors limites » ; elle dessine des lignes colorées. Elle n'émet aucun événement vers l'application.

### 8.4 `window.CNCToolPosition` (V, `tool-position.js`)

`{ acknowledged(machine, totalLines) -> number, trailCount(samples, acknowledged) -> number, project(meta, point) }` : les fonctions déjà exportées pour Node, exposées aussi dans la page. D les utilise pour la ligne acquittée, V pour `A`.

### 8.5 Classes de `body` et événements nouveaux

| Nom | Propriétaire | Sens |
| --- | --- | --- |
| `perf-gpu` | V | profil Performance et probe WebGL matérielle |
| `perf-gpu-lost` | V | une vue a perdu son contexte depuis le chargement |
| `perf-wide` | D | poste large (§ 2.2) |
| `perf-origin` | O | la carte `#op-card` est montée dans Préparer |
| `cnc-gpu-change` (window) | V | `detail = cncGpu.state()` |
| `cnc-layout-change` (window) | D | `detail = { wide: boolean }` |

Existants, inchangés : `perf-eco`/`perf-performance`, `machine-*`, `t-compact`, `t-inspect`, `cnc-profile-change`, `cnc-screen-change`, `cnc-job-status`, `cnc-screen-lock`, `cnc-library-select`, `cnc-library-preview-updated`.

### 8.6 Points d'extension de `job-dashboard.js` (D)

- **Hôte de la vue.** `#home-job-image` reste l'enfant de `.job-art` ; `.job-art` reste `position: relative` avec une hauteur définie par la grille (jamais `auto` dans `perf-wide`). V monte sa vue dans `img.parentNode` et ne touche pas à la grille ; D ne touche pas au contenu de `.pgl-inline`.
- **IDs.** Tous les IDs créés aujourd'hui par `job-dashboard.js` sont conservés avec le même type d'élément (les tests et `job-controls.js`, `status-strip.js`, `strip-guard.js`, `browser-run.cjs` les lisent). Des enveloppes nouvelles sont permises : `#home-zone-view`, `#home-zone-gauges`, `#home-zone-controls`.
- **Aperçu du programme chargé.** `window.cncDashboardView.loadedPreview() -> Promise<meta | null>` : l'aperçu (`img.cncPreview`, même forme) du programme chargé (`machine.name`), lu même si Suivi n'est pas visible, avec la même vérification (verdict serveur, empreinte) que l'affichage de Suivi ; `null` sans programme chargé ou sans aperçu valide. Une seule lecture en vol ; le résultat est celui de `#home-job-image` quand Suivi l'a déjà lu. O s'en sert ; la préparation guidée peut s'en servir.
- **Instruments.** `window.cncDashboardView.gauges()` est réservé (non requis) ; aucun autre lot n'écrit dans la zone Instruments.

### 8.7 Points d'extension de `job-preparation.js` (O)

- **Chargement.** `job-preparation.js` (script, page réelle) écoute `cnc-screen-change`, `cnc-layout-change` et `cnc-profile-change` ; quand Préparer est visible et que `cncLayout.wide()` est vrai et que la machine n'est pas laser, il appelle `cncProfile.loadAdvanced(['preview-gl.js', 'origin-preview.js'])` puis `CNCOriginPreview.mount(document.getElementById('screen-jog'))`. Il appelle `CNCOriginPreview.unmount()` quand ces conditions cessent.
- **Carte.** `origin-preview.js` crée `<section id="op-card" class="card op-card">` comme dernier enfant de `#screen-jog`, pose `perf-origin` sur `body`, et les retire à `unmount()`. D place `#op-card` dans sa grille (`responsive.css`) ; O ne règle que l'intérieur de la carte (`origin-preview.css`, injectée par `origin-preview.js`).
- **Étape « Origine de travail ».** `job-preparation.js` ajoute sous le détail de l'étape `origin`, si `window.CNCOriginPreview` est présent, une ligne `p.ks-prep-origin-hint` remplie par `CNCOriginPreview.hint(machine, preview)` (texte du verdict § 7.4, ou `''`). La coche reste manuelle et rien n'est envoyé.

### 8.8 Exposition de `travel-check.js` (O)

```js
CNCTravelCheck.travelBox(machine) -> { known: boolean, min: [x, y, z], max: [x, y, z], zKnown: boolean, reason: '' }  // machine frame, from $130-$132 and $23
CNCTravelCheck.place(preview, machine, { axes: 'xy' }) -> same object as check(): { state: 'ok'|'outside'|'unknown', axes?, message }
```

`check()` et `show()` ne changent pas ; `test-travel-check.cjs` passe sans modification.

### 8.9 `window.cncLayout` (D, `touch-shell.js`)

`{ wide() -> boolean }` ; événement `cnc-layout-change`.

### 8.10 Stubs à coller avant la livraison de V (et de D pour O)

Les stubs se collent **dans un test** (`test-*.cjs`, contexte `vm`) ou dans une page de développement, jamais dans un fichier livré de `touch/`. Le code livré de D et O détecte l'absence de l'API et garde le comportement actuel.

```js
/* Stub of the GPU gate (lot V, spec 8.1). Test use only: never ship it.
 * _set() is a test helper and is not part of the real API. */
(function (root) {
  'use strict';
  if (root.cncGpu) return;
  var probe = { checked: true, hardware: true, lost: false, renderer: 'stub', webgl2: true, antialias: true,
    lineWidth: [1, 7.4], maxTextureSize: 16384, reason: '' };
  function performance() { try { return !!root.cncProfile && root.cncProfile.performance() === 'performance'; } catch (_) { return false; } }
  function state() {
    var s = {}; Object.keys(probe).forEach(function (k) { s[k] = Array.isArray(probe[k]) ? probe[k].slice() : probe[k]; });
    if (!performance()) { s.hardware = false; s.reason = 'eco'; } else if (s.lost) s.reason = 'context-lost';
    return s;
  }
  function apply() {
    var s = state(), list = root.document && root.document.body && root.document.body.classList;
    if (list) { list.toggle('perf-gpu', s.hardware); list.toggle('perf-gpu-lost', s.hardware && s.lost); }
    try { root.dispatchEvent(new root.CustomEvent('cnc-gpu-change', { detail: s })); } catch (_) {}
  }
  root.cncGpu = {
    state: state,
    ready: function () { return Promise.resolve(state()); },
    _set: function (patch) { Object.keys(patch).forEach(function (k) { probe[k] = patch[k]; }); apply(); }
  };
  root.addEventListener('cnc-profile-change', apply);
  apply();
})(typeof window !== 'undefined' ? window : globalThis);
```

```js
/* Stub of the overlay API of CNCPreviewGL (lot V, spec 8.2-8.3). Test use only.
 * checkOverlays() applies the spec's rules; V's real implementation must give the same
 * accepted/refused result for the same input. open() draws nothing: it records the overlays. */
(function (root) {
  'use strict';
  var COLOURS = ['info', 'ok', 'warn', 'danger', 'neutral', 'stock', 'clamp'];
  var FIELDS = { segments: ['id', 'kind', 'frame', 'points', 'colour', 'width'], box: ['id', 'kind', 'frame', 'min', 'max', 'colour', 'width'],
    program: ['id', 'kind', 'translate', 'colour', 'width'], marker: ['id', 'kind', 'frame', 'at', 'colour'] };
  var MAX_OVERLAYS = 16, MAX_POINT_NUMBERS = 300000, MAX_ABS = 100000;
  function triple(v) { return (Array.isArray(v) || ArrayBuffer.isView(v)) && v.length === 3 && Array.prototype.every.call(v, function (n) { return typeof n === 'number' && isFinite(n) && Math.abs(n) <= MAX_ABS; }); }
  function checkOne(o, ids, budget) {
    if (!o || typeof o !== 'object') return 'field';
    if (typeof o.id !== 'string' || !/^[a-z0-9-]{1,32}$/.test(o.id) || ids[o.id]) return 'id';
    var allowed = FIELDS[o.kind]; if (!allowed) return 'kind';
    var extra = Object.keys(o).filter(function (k) { return allowed.indexOf(k) < 0 || typeof o[k] === 'function'; });
    if (extra.length) return 'field';
    if (o.kind !== 'program' && o.frame !== undefined && o.frame !== 'work' && o.frame !== 'machine') return 'frame';
    if (COLOURS.indexOf(o.colour) < 0) return 'colour';
    if (o.kind !== 'marker' && o.width !== undefined && o.width !== 'thin' && o.width !== 'thick') return 'width';
    if (o.kind === 'segments') {
      var p = o.points;
      if (!(Array.isArray(p) || p instanceof Float32Array) || !p.length || p.length % 6) return 'points';
      for (var i = 0; i < p.length; i++) if (typeof p[i] !== 'number' || !isFinite(p[i]) || Math.abs(p[i]) > MAX_ABS) return 'number';
      if (budget.points + p.length > MAX_POINT_NUMBERS) return 'limit';
      budget.points += p.length;
    }
    if (o.kind === 'box') { if (!triple(o.min) || !triple(o.max)) return 'number'; for (var a = 0; a < 3; a++) if (o.min[a] > o.max[a]) return 'number'; }
    if (o.kind === 'program' && !triple(o.translate)) return 'number';
    if (o.kind === 'marker' && !triple(o.at)) return 'number';
    return '';
  }
  function checkOverlays(list) {
    var accepted = [], refused = [], ids = {}, budget = { points: 0 };
    (Array.isArray(list) ? list : []).forEach(function (o) {
      var code = accepted.length >= MAX_OVERLAYS ? 'limit' : checkOne(o, ids, budget);
      if (code) refused.push({ id: o && typeof o.id === 'string' ? o.id : '', code: code, message: 'overlay refused: ' + code });
      else { ids[o.id] = true; accepted.push(o); }
    });
    return { accepted: accepted, refused: refused };
  }
  function open(meta, options) {
    options = options || {};
    var overlays = [], closed = false, follow = false;
    var handle = {
      setOverlays: function (list) { var r = checkOverlays(list); overlays = r.accepted; return { ok: !r.refused.length, accepted: r.accepted.map(function (o) { return o.id; }), refused: r.refused }; },
      follow: function (on) { if (typeof on === 'boolean' && options.live && options.live.tool) follow = on; return follow; },
      state: function () { return { closed: closed, gpu: true, software: false, geometry: 'simplified', live: { ackLine: 0, lastAckSegment: 0, pass: null, marker: { shown: false, stale: false, alarm: false, snapped: false, interpolating: false, ageMs: null, at: null }, follow: follow },
        overlays: overlays.map(function (o) { return { id: o.id, drawn: o.frame !== 'machine', reason: o.frame === 'machine' ? 'no-offset' : '' }; }) }; },
      stats: function () { return { frames: 0, gestureFrames: 0, lastPaintMs: 0, maxPaintMs: 0, uploads: 0, uploadBytes: 0, dpr: 1, canvas: { width: 0, height: 0 } }; },
      close: function (reason) { if (closed) return; closed = true; overlays = []; if (options.onClose) options.onClose(reason || 'user'); },
      dialog: null, canvas: null
    };
    if (options.overlays) handle.setOverlays(options.overlays);
    return handle;
  }
  var stub = { open: open, checkOverlays: checkOverlays, close: function () {}, active: function () { return false; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = stub; else if (!root.CNCPreviewGL) root.CNCPreviewGL = stub;
})(typeof window !== 'undefined' ? window : globalThis);
```

```js
/* Stubs of D's layout gate and loaded-preview accessor, and of V's CNCToolPosition (spec 8.4, 8.6, 8.9).
 * Test use only. acknowledged() is a copy of tool-position.js's rule. */
(function (root) {
  'use strict';
  var wide = true;
  root.cncLayout = root.cncLayout || { wide: function () { return wide; },
    _set: function (on) { wide = !!on; root.document.body.classList.toggle('perf-wide', wide); root.dispatchEvent(new root.CustomEvent('cnc-layout-change', { detail: { wide: wide } })); } };
  var preview = null;
  root.cncDashboardView = root.cncDashboardView || {};
  if (!root.cncDashboardView.loadedPreview) {
    root.cncDashboardView.loadedPreview = function () { return Promise.resolve(preview); };
    root.cncDashboardView._setPreview = function (meta) { preview = meta || null; };
  }
  root.CNCToolPosition = root.CNCToolPosition || {
    acknowledged: function (s, totalLines) {
      if ((s.finished === true || s.finishedWithErrors === true) && s.workflow === 'idle') return totalLines;
      var r = s.resume;
      if (r && typeof r.from === 'number' && typeof r.preambleLength === 'number') return Math.min(totalLines, Math.max(0, r.from - 1 + Math.max(0, s.received - r.preambleLength)));
      return Math.min(totalLines, Math.max(0, s.received / s.total * totalLines));
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
```

Cas de référence que `CNCPreviewGL.checkOverlays` doit donner à l'identique dans le stub et dans le module réel (V les met dans `test-preview-3d-overlays.cjs`, O peut les copier) :

| Entrée | Résultat |
| --- | --- |
| `box` machine `min [-400,-300,-80]`, `max [0,0,0]`, `neutral`, `thin` | acceptée ; non dessinée tant que `o` est inconnu (`no-offset`) |
| `colour: '#ff0000'` | refusée, `colour` |
| `points` de longueur 9 | refusée, `points` |
| un `NaN` dans `at` | refusée, `number` |
| champ `gcode: 'G0 X0'` | refusée, `field` |
| deux fois `id: 'a'` | la seconde refusée, `id` |
| 17 incrustations valides | la 17ᵉ refusée, `limit` |
| `kind: 'program'` avec `frame: 'machine'` | refusée, `field` |

## 9. Chargement, cache, ressources, messages

- **Modules avancés** (jamais en `<script>` dans `index.html`, chargés par `cncProfile.loadAdvanced`) : `preview-gl.js` (V, existant, alourdi), `origin-preview.js` (O, nouveau). `preview-inspect.js` sert aussi de worker de géométrie (V). Tout module avancé modifié change `ADVANCED_VERSION` dans `tablet-profile.js` (intégrateur).
- **Scripts de page modifiés** (`?v=` changé par l'intégrateur dans `index.html` et `simulation.html`) : `preview-3d.js`, `tool-position.js` (V) ; `job-dashboard.js`, `job-controls.js`, `status-strip.js`, `touch-shell.js`, `motion-estimate.js` si modifié (D) ; `job-preparation.js`, `travel-check.js` (O).
- **Feuilles** : `preview-advanced.css` (V, déjà liée), `responsive.css`, `ui-2027.css`, `app.css`, `touch-shell.css` (D, déjà liées) : `?v=` changé par l'intégrateur. `origin-preview.css` (O, nouvelle) n'est **pas** liée dans `index.html` : `origin-preview.js` l'injecte une fois (`<link>` avec le même suffixe `?v=` que son propre script, lu sur `document.currentScript.src`), toutes ses règles sous `body.perf-origin`.
- **Messages** : V → `i18n-messages-viz.js`, D → `i18n-messages-profiles.js`, O → `i18n-messages-origin.js` (nouveau). `i18n.js` lit les catalogues une fois au chargement : le catalogue d'O doit être en `<script>` avant `i18n.js` dans `index.html` (intégrateur), donc demandé aussi en Éco ; voir Q13. `test-i18n.cjs` découvre seul les fichiers `i18n-messages-*.js`.
- **Ressources libérées** : à la fermeture d'une vue, au changement d'écran, au passage en Éco, au verrouillage, à `pagehide`, à la perte de contexte : tampons et programme GL, contexte, écouteurs, worker d'inspection et de géométrie, incrustations, images demandées. Exception soumise à l'utilisateur : la géométrie complète du programme chargé (Q7).

## 10. Mesures attendues sur la tablette et méthode

Aucune mesure n'est faite par l'architecte ni par un lot sur PC pour annoncer un gain. Les mesures se font sur la Surface Pro 3, sur un candidat publié par l'intégrateur sous `/touch-next/`, avec un second Chromium (brief § 6 : `DISPLAY=:0`, `--window-size=960,640 --window-position=0,0`, profil GPU, pas de `--headless`, port de débogage ≥ 9230, `--user-data-dir=/tmp/perf-<lot>` supprimé à la fin, l'utilisateur prévenu). Chaque relevé note : révision, Chromium et version, fenêtre CSS et DPR (diagnostic exporté), profil, renderer (`cncGpu.state().renderer`), géométrie (`full` / `simplified`, segments), simulateur ou machine.

Outils :

- `?perf=1` (`perf-harness.js`, inchangé) : écarts entre images (médiane, p95, p99, max, nombre > 50 ms), longues tâches, mémoire JS, badge `GPU`/`CPU`, export JSON. Rappel de TESTING.md : la boucle du badge gonfle elle-même le CPU ; le CPU se mesure sans `?perf=1`.
- Diagnostic de cette tablette (Réglages → Performances) : fenêtre, DPR, renderer, temps de 20 000 segments, export JSON.
- DevTools du second Chromium (`Runtime.evaluate`) : `cncGpu.state()`, `CNCPreviewGL.active()`, la poignée ouverte (`state()`, `stats()`), `performance.memory`.
- CPU : `/proc/<pid>/stat` de tous les processus du second Chromium et de `cncjs-v2` (méthode de TESTING.md « Fluidity »), sans `?perf=1`.
- Travail : simulateur Grbl par CNCjs, et pour comparer des versions, **rejeu de la même minute enregistrée** d'événements d'état (méthode de TESTING.md), passes alternées.

| # | Ce qui est mesuré | Méthode | Comparé à | Critère |
| --- | --- | --- | --- | --- |
| M1 | images/s pendant un geste de rotation de 10 s, Suivi au repos, Fichiers, Préparer | `?perf=1` (médiane et p95 des écarts) + `stats().gestureFrames` | même parcours, porte GPU forcée fermée (profil Performance sur la même tablette, `perf-gpu` retiré par DevTools avant l'ouverture) | cible du brief : 60 images/s ; le relevé dit l'écart, sans arrondi favorable |
| M2 | temps de dessin établi de 20 000 segments et du plus gros programme de test | `stats().lastPaintMs` sur 100 images après la première | 116 ms au premier dessin (étape 0), Canvas 2D 77,5 ms | publié tel quel |
| M3 | Suivi pendant un travail : CPU Chromium, `cncjs-v2`, thread principal, écarts p95, longues tâches | rejeu de la même minute, Suivi visible, 4 fenêtres de 60 s par version | `feat/touch-profiles` à `59129a0c` (vue fixe + tracé) sur la même tablette | aucune hausse des longues tâches ; hausse CPU publiée et expliquée |
| M4 | fraîcheur pendant M3 : âge des rapports (`t-fresh`), délai du gestionnaire de `cnc-job-status` | Performance timeline (`Event: cnc-job-status`) | même version de référence | pas de hausse (règle du brief) |
| M5 | mémoire : JS et GPU (si lisible), au repos, vue ouverte, géométrie complète chargée, après 5 cycles ouverture/fermeture, après passage en Éco | `performance.memory` après GC forcé (DevTools) | 5 Mo au repos (étape 0) | retour près du niveau initial après Éco |
| M6 | géométrie complète : temps de lecture + interprétation, segments, mémoire | horodatage dans `state()` | `path3d` du même programme | sert à fixer le plafond (Q7) |
| M7 | interpolation : régularité du repère pendant un travail | `stats().frames` par seconde de travail, enregistrement d'écran par l'utilisateur | — | aucune image demandée quand `α = 1` (vérifiable : `frames` n'augmente pas entre deux rapports au-delà de l'intervalle) |
| M8 | RT, Performance et Éco : non-régression | procédure PROFILES.md « Validation », étapes 4 et 5 ; panneau réseau | relevés PROFILES.md (≈ 28 images/s en geste, 50–70 ms au repos) | identique ; en Éco aucune requête nouvelle (sauf réponse à Q13) |
| M9 | mise en page | harnais Edge sur PC (§ 5.5) + l'utilisateur regarde les écrans réels sur la Surface | maquettes | 0 violation ; validation par l'utilisateur |

## 11. Tests hors ligne par lot

| Lot | Tests (noms imposés) | Ce qu'ils prouvent |
| --- | --- | --- |
| V | `test-preview-gl.cjs` (étendu) | rendu GPU choisi selon `cncGpu` ; DPR ≤ 2 et cadence de geste par `requestAnimationFrame` sous la porte, DPR ≤ 1,5 et 33 ms sans elle ; anticrénelage demandé ; épaisseurs bornées par `lineWidth` ; libération complète (tampons, programme, contexte, worker, écouteurs, incrustations) aux six causes de fermeture ; geste jamais propagé |
| V | `test-preview-3d-gpu.cjs` | probe : matériel, logiciel (chaîne SwiftShader / llvmpipe), pas de WebGL, échec ; Éco : aucun `loadAdvanced`, aucun contexte, `reason: 'eco'` ; classes `perf-gpu` / `perf-gpu-lost` et `cnc-gpu-change` ; aucun appel dans un gestionnaire de `cnc-job-status` |
| V | `test-preview-3d-live.cjs` | `A`, `L`, passe en cours ; interpolation : position toujours sur des segments ≤ `L` ou égale au dernier rapport, sur un millier de suites de rapports générées (aléatoires mais à graine fixe), y compris retours en arrière, rapports espacés, positions hors parcours ; arrêt des images à `α = 1` ; périmé à 2 500 ms ; alarme ; suivi de caméra arrêté par un déplacement à deux doigts ; rien de dessiné dans le gestionnaire |
| V | `test-preview-3d-overlays.cjs` | les cas de référence du § 8.10, identiques au stub ; repère machine converti par `o` ; `no-offset` / `stale` / `units` / `wcs` ; `program` sans renvoi de tampon ; libération |
| V | `test-job-follow.cjs` (si `job-follow.js` change) | inchangé sinon |
| V | `measure-preview-gl-live.cjs` (PC, régressions seulement) | temps JS par image et par rapport pendant un rejeu simulé |
| D | `test-responsive-wide.cjs` | `perf-wide` posé/retiré selon profil, GPU, taille, orientation ; jamais à 1366 × 768 ; `cnc-layout-change` ; aucune classe sans `perf-gpu` |
| D | `test-dashboard.cjs`, `test-job-display.cjs` (étendus) | IDs conservés ; temps restant titre/second selon la source ; ligne acquittée par `CNCToolPosition.acknowledged` ; corrections en lecture ; courbe : échantillons rangés dans le gestionnaire, dessin au plus une fois par seconde, rien quand Suivi est caché ; `loadedPreview()` (une seule lecture en vol, `null` sans programme, verdict périmé refusé) |
| D | `browser-run.cjs` + `layout-exceptions.json` | fenêtres 1366 × 911 et 1728 × 1152 ajoutées (1366 × 768 gardée) ; 0 violation ; Pause/Arrêter atteignables en travail, pause, alarme, sous les feuilles |
| O | `test-origin-preview.cjs` | conditions de chargement (porte GPU, `perf-wide`, CNC, page réelle, Préparer visible) et de démontage ; incrustations produites pour un état donné (translation par `wpos`, boîte de course depuis `$130–$132` et `$23`, couleurs ok/danger/neutral) ; textes du § 7.4 ; aucun envoi (aucun `fetch`/`XMLHttpRequest` vers `api/touch-job`, aucun clic sur un bouton de `#screen-jog`) ; `place()` égale à `check()` sur l'état décalé ; libération à `unmount()` ; marche avec les stubs du § 8.10 |

Tests existants à garder verts sans les modifier (non possédés) : `test-tablet-profile.cjs` (Éco ne demande jamais `preview-gl.js`), `test-tool-position.cjs`, `test-travel-check.cjs`, `test-job-preparation.cjs`, `test-viz-i18n.cjs`, `test-i18n.cjs`, `test-preview-3d.cjs`, `test-status-strip.cjs`, `test-strip-guard.cjs`. Un lot qui ne peut pas les garder verts sans les modifier s'arrête et l'écrit dans son rapport.

## 12. Questions à l'utilisateur

Par ordre d'importance. Chacune : la question, la recommandation, la raison.

**Q1. Libellé du repère d'outil.** Le texte actuel dit « Point rose » mais le point est dessiné en `--accent` (bleu clair en thème sombre, bleu foncé en thème clair) : le libellé est faux aujourd'hui. Corriger le texte ou la couleur ?
Recommandation : corriger le texte (« Point bleu » ou « Repère »), garder la couleur. Raison : le rose est déjà dans la palette de profondeur (`#ff63b8`) ; un repère rose se confondrait avec les coupes profondes.

**Q2. Échelle du kiosque : 1,58 (1366 × 911) ou 1,25 (1728 × 1152) ?**
Recommandation : 1,58. Raison : à 1,25, le texte de 16 px fait environ 2,4 mm et une cible secondaire environ 7,1 mm, plus petits que sur la RT (environ 2,8 mm et 8,3 mm) pour un opérateur à un mètre et ganté ; à 1,58 ils font environ 3,0 mm et 8,9 mm. Le prix : une vue 3D plus étroite en Suivi (Q3b).

**Q3. Probe GPU au démarrage, y compris sur la RT en Performance ?** Pour que la mise en page large soit décidée avant que l'opérateur voie Suivi, `preview-3d.js` charge `preview-gl.js` et fait la probe peu après le chargement, en Performance. Sur la RT en Performance, `preview-gl.js` est alors demandé plus tôt qu'aujourd'hui (aujourd'hui : à la première vue 3D) et un `getContext('webgl')` échoue aussitôt (Chromium `--disable-gpu`). Rien d'autre ne change. Acceptez-vous cet écart à « comportement actuel, à l'identique » ?
Recommandation : oui. Raison : l'écran affiché est identique ; sans probe au démarrage, la mise en page large basculerait sous les yeux de l'opérateur à la première vue 3D.

**Q3b. Suivi à 1366 × 911 : trois colonnes (brief) ou Vue + colonne double ?**
Recommandation : trois colonnes si l'échelle 1,25 est retenue ; Vue + colonne double (Instruments au-dessus des Commandes) à 1,58. Raison : à 1366 px, trois colonnes laissent environ 554 px à la vue 3D, moins que la vue actuelle (environ 710 px) ; la variante garde la vue au moins aussi large qu'aujourd'hui. Les deux sont dans la maquette de Suivi.

**Q4. Perte du GPU pendant un usinage : la mise en page reste-t-elle large ?**
Recommandation : oui, elle ne change qu'au rechargement ; seule la zone Vue revient aux vues fixes. Raison : un changement de grille pendant le travail déplacerait les corrections et Démarrer / Reprendre sous le doigt de l'opérateur.

**Q5. « Suivre l’outil » actif par défaut au démarrage d'un travail ?**
Recommandation : non, vue d'ensemble par défaut, non mémorisé. Raison : la vue d'ensemble montre ce qui reste à faire ; un suivi par défaut cache le reste de la pièce, et mémoriser ajouterait une clé `localStorage`.

**Q6. Origine visuelle : X Y seulement, ou X Y Z ?** Le zéro Z se fait souvent à la plaque après le zéro X Y.
Recommandation : X Y à la position courante, Z laissé à l'origine actuelle, et le texte le dit (« si l’origine X Y est posée ici »). Raison : poser Z à la hauteur courante de l'outil (souvent en l'air pendant le jog) donnerait un placement faux en Z et une impression de sécurité. Et hors poste large (GPU, fenêtre plus petite) : pas d'origine visuelle (Préparer n'a pas la place) — d'accord ?

**Q7. Géométrie complète : plafond, cache et lecture pendant un travail.** (a) Plafond proposé : 500 000 segments (environ 20 Mo de sommets à 40 octets par segment ; budget de conception, à confirmer par M5/M6). (b) Garder la géométrie du programme chargé d'un écran à l'autre (exception à « caches libérés au changement d'écran ») ? (c) Lire le programme pendant un travail si elle n'est pas en mémoire ?
Recommandation : (a) 500 000, révisé après M6 ; (b) oui, une seule entrée, libérée en Éco, à la perte de contexte, au changement de programme et à `pagehide` ; (c) non, `path3d` simplifié avec la mention. Raison : (b) sans cache, revenir sur Suivi pendant un travail relirait tout le fichier sur le serveur qui pilote la machine ; (c) même raison, et le serveur CNCjs tourne sur la tablette.

**Q8. Laser : vue 3D en direct et origine visuelle ?** Aujourd'hui le profil laser n'a que la vue laser 2D (choix des lots précédents).
Recommandation : CNC seulement dans ce chantier ; le laser garde sa vue et reçoit la mise en page large et les instruments. Raison : la règle existante masque la 3D en laser ; l'étendre demande sa propre décision (vue de dessus, sans Z).

**Q9. Page de simulation : origine visuelle ?**
Recommandation : non (la préparation guidée n'y est pas non plus). Raison : pas de `$130–$132` ni de position machine réelle en simulation.

**Q10. Instruments : (a) courbe de la dernière minute, (b) texte G-code de la ligne acquittée ?**
Recommandation : (a) oui, derrière `perf-wide`, retirée si M3 montre un coût ; (b) non. Raison : (a) le brief la demande « si elle ne coûte rien » : seule la mesure sur la tablette le dira ; (b) il faudrait lire le programme dans la page (Q7c) et la ligne acquittée n'est pas celle qui s'usine, un texte G-code laisserait croire l'inverse.

**Q11. Rendu GPU (choix techniques, appliqués sauf objection).** Épaisseurs par `gl.lineWidth` (la Surface annonce 1 à 7,4 px) plutôt que des quadrilatères ; WebGL1 conservé (WebGL2 non requis) ; mise en cache du parcours dans une texture quand la caméra est immobile, décidée par V selon M2/M7.
Recommandation : oui. Raison : le moins de code nouveau ; la plage annoncée couvre 3 px × DPR 2 ; si un autre pilote annonce 1 px, les traits restent lisibles à 1 px et `state()` le dit.

**Q12. Harnais : forcer `perf-gpu` par CDP dans `browser-run.cjs` plutôt que par un paramètre d'URL ?**
Recommandation : par CDP. Raison : un paramètre d'URL serait un moyen d'activer le rendu GPU sur une tablette qui n'en a pas ; le code livré ne doit avoir aucun crochet de forçage.

**Q13. Catalogue de messages d'O demandé en Éco ?** `i18n.js` ne lit les catalogues qu'au chargement : `i18n-messages-origin.js` doit être en `<script>` dans `index.html`, donc demandé aussi en Éco (un fichier de données, aucune exécution au-delà d'un `push`), comme `i18n-messages-viz.js` l'est déjà pour `preview-gl.js`.
Recommandation : l'accepter, et que l'intégrateur écrive dans le test réseau d'Éco la liste exacte des fichiers attendus. Raison : précédent existant ; l'alternative (copier les lignes dans `i18n-messages.js`) mélange les lots et casse la vérification « aucune clé deux fois » si le fichier existe aussi.

## 13. Points que l'architecte n'a pas pu décider

- Le coût réel du rendu en direct sur la HD 4400 (seul le premier dessin de 20 000 segments est connu) : le plafond de géométrie, la cadence de l'interpolation et la mise en cache dépendent de M2, M3, M6.
- La cadence réelle des rapports d'état sur la Surface pendant un travail (elle dépend de CNCjs et du simulateur) : l'interpolation est écrite pour n'importe quel intervalle ≤ 1 000 ms et se désactive au-delà.
- `perf-harness.js` n'appartient à aucun lot : les mesures propres à la vue passent par `handle.stats()` et DevTools ; ajouter ces compteurs au rapport `?perf=1` demanderait d'attribuer ce fichier (intégrateur).
- La lisibilité réelle des maquettes à 1,58 et 1,25 : c'est l'objet du point de contrôle.

## 13. Décisions de l'utilisateur (2026-11-05)

Toutes les recommandations de l'architecte sont retenues ; elles priment sur les formulations « question » ci-dessus.

- **Q1** : corriger le texte (le repère d'outil garde sa couleur `--accent`).
- **Q2** : échelle du kiosque **1,58** (1366 × 911 px CSS). 1728 × 1152 reste une taille testée par le harnais.
- **Q3** : probe GPU au démarrage en Performance, y compris sur la RT : accepté.
- **Q3b** : Suivi à 1366 × 911 en **vue + colonne double** ; trois colonnes seulement là où la largeur le permet, selon la spécification.
- **Q4** : perte du GPU pendant un usinage : la mise en page ne change pas.
- **Q5** : « Suivre l'outil » inactif par défaut, non mémorisé.
- **Q6** : origine visuelle en X et Y seulement, en poste large seulement.
- **Q7** : plafond de conception 500 000 segments (à confirmer par mesure), géométrie du programme chargé gardée d'un écran à l'autre, aucune lecture du programme pendant un travail.
- **Q8** : CNC seulement ; le profil laser garde sa vue laser 2D.
- **Q9** : pas d'origine visuelle sur la page de simulation.
- **Q10** : courbe de la dernière minute oui ; texte G-code de la ligne non.
- **Q11** : traits par `gl.lineWidth`, WebGL1 conservé, cache en texture décidé par V selon les mesures.
- **Q12** : le harnais force `perf-gpu` par CDP, sans crochet dans le code livré.
- **Q13** : `i18n-messages-origin.js` en `<script>`, demandé aussi en Éco (fichier de données).
