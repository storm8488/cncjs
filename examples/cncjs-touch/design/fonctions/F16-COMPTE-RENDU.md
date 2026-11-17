# F16 — Petits écrans et portrait : compte rendu (Opus 5.5, 2026-11-17)

Arbre `C:\Users\damou\Documents\claude\cncjs-wt\F16`, branche `feat/F16` (partie de `feat/refonte-ui` à `db584555`). Rien n'est poussé ni fusionné. Aucun accès à la tablette, à la RT ni à la CNC.

## Ce qui est fait

Même page `touch/index.html`, pas de seconde interface : tout passe par des requêtes média ajoutées **en fin de `touch/responsive.css`**, dans une section « F16 ». Aucune ne s'applique aux deux tablettes (voir « Preuve »).

**Téléphone tenu en hauteur (≤ 599 px de large : 412 × 915, 360 × 800).**
- Bandeau sur trois rangées (176 px) : l'état à côté de **Pause** (ou Reprendre… / Remise en route) et **Arrêter**, 64 px de haut, toujours visibles en haut de l'écran, sur tous les écrans et dans tous les états ; puis « La main » et le verrou ; puis l'âge du rapport sous les messages. L'horloge et « Quitter » cèdent leur place.
- Le fil passe **en bas**, sur une rangée : les numéros d'étape et leurs marques (✓, ○, !), « Plus » garde son mot ; l'en-tête de l'écran nomme l'étape. Les noms restent dans la page (masqués visuellement).
- Une carte sur la largeur, le contenu défile entre le bandeau et le fil, pas de défilement horizontal.
- 5 · Usinage : avancement en tête, coordonnées de travail sur une ligne, chaque correction (vitesse, broche, rapides) sous son nom ; le message et ses boutons l'un sous l'autre.
- 1 · Machine : un bouton passe sous sa ligne au lieu de l'écraser.
- 2 · Fichier : **liste corrigée** (les rangées de la grille ne comptaient pas la ligne d'état : « Page 1 / 3 » et « Suivant » passaient sur la liste) ; l'état de chaque fichier sous son nom.
- 3 · Zéro pièce : la croix 96 px, Z+ / Z− dessous, les pas au-dessus des vitesses.
- 4 · Contrôle : verdict puis les deux dessins, chacun à sa hauteur.
- Plus : une tuile par ligne. Journal : la page d'événements à sa hauteur, boutons de page dans la largeur.
- Dialogues (« La main », confirmations) : les boutons l'un sous l'autre, sur toute la largeur (« Fermer » était coupé en « Ferm-er » en texte agrandi ; `#job-confirm` avait un minimum de 300 px).
- En-tête d'étape : l'état entier (il passait en « Mecanizado en cu… »). Barre d'étape : sa phrase sur trois lignes au plus, sans ascenseur pour un pixel de glyphe.

**1024 × 600 (et fenêtres de 760 à 1099 px de large).** L'état du bandeau reste entier (deux lignes au besoin), Pause et Arrêter gardent 64 px, « La main » et les commandes se resserrent, l'horloge cède sa place ; la barre d'étape sur une rangée (≥ 900 px) ; l'état de l'en-tête d'étape passe à la ligne au lieu d'être coupé (« La machine ne répond plus depuis 9 s… ») ; la phrase de la barre sans ascenseur d'un pixel.

**Hors cible, au passage.** Contrôle : « 100 % » des rapides sortait de son bouton à 1180 × 820 et 1280 × 800 texte agrandi (violation stricte déjà présente à la base, étape `responsive`) ; corrigé sous 1300 px de large (`@media (max-width:1299px)`, ne touche pas les tablettes).

## Commit

- `ddf1ae1d` — `touch: F16 small screens and portrait`.

## Fichiers partagés touchés, et où

| Fichier | Où | Quoi |
|---|---|---|
| `examples/cncjs-touch/touch/responsive.css` | **fin du fichier**, section « === F16 » (124 lignes ajoutées, rien de modifié au-dessus) | toutes les règles du lot |
| `examples/cncjs-touch/browser-run.cjs` | en-tête (`--only` : `small`), la valeur par défaut de `ONLY`, une ligne dans `main()` après `rail`, une ligne d'export en fin de fichier | étape `small` |
| `examples/cncjs-touch/verify-project.cjs` | fin de la liste `tests` : `'small-screens'` | test statique |
| `examples/cncjs-touch/browser-small.cjs` | nouveau | l'étape `small` |
| `examples/cncjs-touch/test-small-screens.cjs` | nouveau | la moitié statique de la preuve |

Aucune table i18n, aucun `index.html`, aucun script de la page, aucun fichier serveur : le lot n'ajoute aucune chaîne visible.

## Tests

**`test-small-screens.cjs`** (dans `verify-project`) : chaque règle F16 est dans une requête média ; aucune requête ne correspond à 1366 × 911, 1366 × 768 (ni aux arrondis 1367, 912), **ni avec un clavier à l'écran** (1366 × 591, 1366 × 448) ; chaque requête correspond à une fenêtre visée ; pas de `:has()`, `color-mix()`, `dvh` ; l'étape `small` couvre 412 × 915, 360 × 800 et 1024 × 600 en FR/EN/ES, texte standard et agrandi, repos/travail/pause/alarme, et `browser-run.cjs` la lance par défaut ; ses contrôles (`stripChecks`) refusent un bandeau sans Pause ou sans Arrêter, une commande sous 64 px, couverte ou hors fenêtre, un défilement horizontal, un fil qui n'est pas une rangée en bas, une entrée du fil sous 48 px, un état coupé dans l'en-tête, une phrase de barre qui défile avec de la place.

**Étape `small` de `browser-run.cjs`** (`browser-small.cjs`, stricte) : la vraie page sur le banc v2 de `browser-run` (repos, travail, pause, alarme, rapport périmé, flux perdu ; aucune requête autre que GET ne part). 10 variantes : 412 × 915 (FR sombre CNC, EN clair CNC, ES sombre CNC agrandi, FR clair laser agrandi), 360 × 800 (ES clair CNC, FR sombre CNC agrandi, EN sombre laser agrandi), 1024 × 600 (FR sombre CNC, ES clair CNC agrandi, EN sombre laser agrandi). Chaque écran (Usinage et Machine d'abord, puis Fichier, Zéro pièce, Contrôle, Plus, Journal) dans chaque état, plus le dialogue « La main » : toutes les mesures de l'étape `screens` (taille des cibles, texte ≥ 16 px, mot coupé, texte hors de son bouton, texte sur texte, débordement, écran qui ne défile pas, Journal), plus les contrôles ci-dessus. Puis, aux deux fenêtres des tablettes et avec un clavier de 320 px, aucune règle F16 ne s'applique (`matchMedia` dans le navigateur). Dernier passage : **276 captures, 0 violation, 4/4 fenêtres de tablette sans règle F16**.

**Les contrôles échouent sans le code** : avant les corrections, l'étape `small` relevait la liste de Fichier recouverte (« texte sur texte »), la phrase de barre qui défilait d'un pixel (1024 × 600, texte agrandi), l'état coupé de l'en-tête (1024 × 600, rapport périmé) ; règle du dialogue retirée à la main, elle relève « word cut across lines: Fermer ».

**Résultats sur le commit** (Edge 157, ce PC) :
- `node examples/cncjs-touch/verify-project.cjs` : **225/225** (224 à la base + `test-small-screens.cjs`).
- `npx jest src/server/services/touch src/server/services/cncengine src/server/api grbl-simulator --coverage=false` : **52 suites, 1 545 tests** verts (inchangé : le lot ne touche pas le serveur).
- ESLint propre sur `browser-small.cjs`, `test-small-screens.cjs`, `browser-run.cjs`, `verify-project.cjs`.
- `browser-run.cjs --strict --only small` : tous verts, 0 violation.
- `browser-run.cjs --strict --only responsive` : tous verts, 0 violation (la base en avait 2 : « 100 % » de Contrôle à 1180 × 820 et 1280 × 800 agrandi). Cette étape mesure aussi 540 × 960 (zoom 200 % d'un écran portrait), qui reçoit la mise en page téléphone : Pause / Arrêter / Reprendre / Démarrer touchés sur chaque écran, sous un volet et un pavé, en alarme.

## Preuve : les deux tablettes ne changent pas

1. **Par construction** : toutes les règles du lot sont dans des requêtes `max-width` ≤ 1299 px ; aucune ne correspond à 1366 px de large (test statique, et `matchMedia` dans le navigateur aux fenêtres 1366 × 911, 1366 × 768, 1366 × 591, 1366 × 448). Une règle dont la requête ne correspond pas ne peut rien changer.
2. **Dans la page, à l'instant même** (script ponctuel, hors dépôt) : aux fenêtres des tablettes, pour chaque écran (les sept et Réglages) et chaque état, le style calculé et la boîte de **chaque élément** (et de ses `::before` / `::after`) avec les règles F16, puis sans elles (retirées du CSSOM dans la même évaluation synchrone, aucun script de la page ne tourne entre les deux), puis remises. Fait pour v2 911 FR sombre CNC et v2 911 ES clair CNC agrandi (repos, travail, pause, alarme, périmé, flux perdu) et v1 768 ES clair laser agrandi (repos, travail, pause, alarme) : **128 contrôles, 0 élément différent** (≈ 1 400 à 1 600 éléments par écran). Exclus : 1 à 3 écrans garés (cachés) dont la hauteur de défilement ne se calcule qu'à la première lecture (ils changent entre deux relevés identiques, sans rien retirer). Contre-épreuve à 412 × 915 : ≈ 1 350 éléments différents par écran, la mesure voit donc bien les règles quand elles s'appliquent. Le passage s'est arrêté (délai) avant la fin de la variante v1 768 ; v1 911 et v1 768 FR n'ont pas été faites ainsi.
3. **Étapes `screens` et `v2` du harnais, avant et après** : deux copies jetables identiques (fins de ligne LF) qui ne diffèrent **que par `touch/responsive.css`** (celle de `db584555` contre celle du lot), lancées en même temps (`--strict --only screens,v2`), passe « library » sautée dans les deux (elle échoue d'abord sur ce PC, déjà à la base).
   - **Mêmes échecs des deux côtés, à l'identique** : 16 constats déjà présents à la base, tous dans l'étape `v2` (« presenter band not shown at rest », « Suivi commands moved… », « zero-more-open not available… », 2 chevauchements et 4 cibles couvertes de Préparer à 1366 × 911 et 1728 × 1152 en simulation). Aucun constat ajouté par le lot.
   - **Géométrie de chaque cible** (position, taille, police, état) : identique dans **870 des 909 captures aux fenêtres des tablettes** (1366 × 768 : 432/442 ; 1366 × 911 : 438/467). Les 39 autres sont Contrôle et Plus, qui basculent entre deux mises en page (ascenseur de la page présent ou non sur Contrôle, tuiles de Plus étirées ou non) **dans les deux sens** : tantôt la base a l'une et F16 l'autre, tantôt l'inverse, selon l'état. C'est le moment de la mesure, pas la feuille de style (le point 2 le confirme : aucune différence à l'instant même). Hors tablettes : 7/7 captures du guide à 1024 × 600 changent, c'est voulu (bandeau F16) ; 2 Journaux à 1728 × 1152 diffèrent par l'heure des événements.
   - **Pixels** : 392 images sur 1 005 identiques au bit près ; les autres diffèrent par des valeurs vivantes (horloge, coordonnées, avancement, heure du Journal, dessins de Contrôle injectés pendant un rendu). Le pixel brut ne peut donc pas servir seul de preuve entre deux passages ; c'est pourquoi le point 2 compare dans la même page au même instant.
   - Un premier essai contre une copie de la base faite avec des fins de ligne CRLF (harnais et `index.html`) donnait d'autres écarts dans Plus ; refait avec la seule feuille de style comme différence, ils ont la même nature (bascule dans les deux sens).

## Ce qui reste

- Le titre « Fichiers sur le serveur » de 2 · Fichier passe sur trois lignes à 412 px (rien n'est coupé, c'est de la place perdue).
- Sur téléphone en texte agrandi, la zone de contenu d'Usinage est courte (≈ 360 px à 360 × 800) : l'avancement et les coordonnées sont visibles, les corrections demandent de faire défiler.
- Le paysage d'un téléphone (915 × 412, 800 × 360) n'est pas une cible du lot : il prend les règles existantes « fenêtre basse » ; non mesuré par l'étape `small`.
- **Réunion avec F4** : F4 ajoute « Rendre la main » (550 × 64 sur la tablette) au dialogue « La main ». Sur téléphone, les boutons du dialogue sont l'un sous l'autre (règle F16) ; si F4 pose une largeur minimale de 550 px, elle débordera à 412 px : relancer `--only small` après la réunion (l'étape ouvre ce dialogue sur chaque variante).
- Réunion : toute section ajoutée **après** la section F16 de `responsive.css` est comptée par `test-small-screens.cjs` comme une règle F16 (il lit jusqu'à la fin du fichier) ; ce sera signalé par le test si elle peut toucher une tablette.

## Ce qui n'est pas vérifié

- Aucun vrai téléphone, aucun écran 1024 × 600 réel : seulement Edge 157 sans tête sur ce PC, fenêtres émulées par CDP à l'échelle 1. Ni Chromium 106 (la RT), ni Safari / Chrome Android, ni la barre d'adresse mobile qui change la hauteur, ni le zoom du texte du système.
- Le toucher réel (doigt) sur un téléphone : les tailles sont mesurées, pas éprouvées.
- Les volets (`ks-sheet`) et les confirmations de mouvement sur téléphone ne sont mesurés que par l'étape `responsive` à 540 × 960 (banc simulation), pas par l'étape `small` (le banc v2 refuse les `POST` qui les ouvrent).
- L'étape `screens` complète n'a pas pu tourner telle quelle ici, ni à la base : sa passe « library » échoue d'abord sur ce PC (« timeout: library not followed », déjà à `db584555`) ; la comparaison avant/après l'a sautée dans des copies jetables (voir « Preuve »).
- Le harnais complet n'a pas été lancé (consigne : `--only` seulement). Étapes lancées sur l'état final : `small` et `responsive` (stricts, verts) ; `screens` et `v2` seulement dans les copies jetables de la preuve (mêmes 16 échecs qu'à la base).
- Le contrôle à l'instant même (preuve, point 2) n'a pas couvert v1 768 FR ni la v1 à 911, ni les états périmé / flux perdu de la v1 768 (délai dépassé) ; ces fenêtres sont couvertes par le point 1 et par la comparaison du harnais.
- L'arbre contenait déjà, au départ de cette session, une version non commitée du lot (CSS, `browser-small.cjs`, `test-small-screens.cjs`) laissée par un passage précédent interrompu : elle a été relue, corrigée (liste de Fichier, dialogue, en-tête, barre d'étape, requêtes resserrées sous 1100 px, contrôle des tablettes remplacé : l'ancien comparait deux captures prises à des instants différents et échouait sur l'horloge et l'avancement) puis commitée.
- Un Edge sans tête `cnc-browser-run` du 2026-11-16 (pid 32288, fenêtre 1366 × 768) tourne encore sur ce PC ; il n'est pas de ce lot, je n'y ai pas touché. Ceux de ce lot sont fermés.

## Ce que l'essai réel devra prouver

1. Sur la Surface (1366 × 911) et la RT (1366 × 768) : rien n'a bougé (la page est la même au pixel près hors F16 ; un coup d'œil sur les cinq étapes suffit).
2. Sur un téléphone en hauteur, page ouverte à distance pendant un usinage : l'état, **Pause** et **Arrêter** visibles sans faire défiler, sur 5 · Usinage et 1 · Machine ; Pause touchée du doigt met bien en pause, Arrêter arrête (machine réelle d'abord fraise en l'air, comme au protocole) ; le fil en bas mène aux six écrans ; pas de défilement de côté.
3. En texte agrandi et en espagnol sur le téléphone : aucun mot coupé, les boutons du dialogue « La main » entiers.
4. Sur un écran 1024 × 600 : mêmes contrôles, la barre d'étape sur une rangée.
