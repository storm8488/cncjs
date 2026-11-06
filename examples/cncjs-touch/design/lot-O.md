# Lot O — Origine visuelle dans Préparer (chantier « Performance UI », phase 2)

Tu es un agent de réalisation. Tu n'as pas lu la conversation qui a produit ce brief : tout ce qu'il te faut est ici et dans les fichiers cités. Dépôt `C:\Users\damou\Documents\claude\cncjs`, dossier `examples/cncjs-touch`. Travaille dans ton propre worktree, branche `perf-ui/O` créée depuis `feat/touch-profiles` ; commite seulement tes fichiers ; ne pousse pas, ne fusionne pas. Aucune commande à une machine, aucun ssh, aucun déploiement.

**À lire d'abord, dans cet ordre** : `PERFORMANCE-UI-BRIEF.md` (règles § 3, il prime), `PERFORMANCE-UI-SPEC.md` (§ 0-2, 7, 8, 9, 11, 12 ; réponses de l'utilisateur reportées dans le brief), `PROFILES-CONTRACT.md`, puis `touch/travel-check.js`, `touch/job-preparation.js`, `touch/tablet-profile.js` (`loadAdvanced`), `touch/preview-gl.js` (API actuelle de `open`), `touch/preview-inspect.js` (`overlayBoxes`), `touch/projects.js` (`CNCProjects.stock`), `test-travel-check.cjs`, `test-job-preparation.cjs`. Maquette : `design/performance-preparer.html`.

## Mission

Objectif 3 du brief : dans Préparer, en poste large, montrer en 3D où le programme chargé se placera si l'origine X Y est posée à la position courante (programme et brut translatés, contour coloré selon le verdict, course `$130–$132`, origine proposée, repère d'outil), et s'il reste dans la course selon `travel-check.js`. **Affichage seulement** : rien n'est envoyé, aucune origine n'est posée, la coche « Origine de travail réglée » reste à l'opérateur. Hors des conditions du § 7.1 (poste large, CNC, page réelle, Préparer visible), rien n'est chargé et Préparer est inchangé.

## Fichiers possédés (table du brief § 5, rien d'autre)

nouveau `touch/origin-preview.js` (module avancé), nouveau `touch/origin-preview.css`, `touch/job-preparation.js` (branchement seulement), `touch/travel-check.js` (exposition de données, pas de changement de règle), nouveau `touch/i18n-messages-origin.js`, `test-origin-preview.cjs`.

## API à respecter et à livrer (spec § 7-8)

- Livrer : `window.CNCOriginPreview = { mount(screen), unmount(), hint(machine, preview) }` ; la carte `<section id="op-card" class="card op-card">` dernier enfant de `#screen-jog` ; la classe `perf-origin` sur `body` tant qu'elle est montée ; `CNCTravelCheck.travelBox(machine)` et `CNCTravelCheck.place(preview, machine, { axes: 'xy' })` (§ 8.8 : `place` appelle `check()` sur une copie de l'état où `wpos.x = wpos.y = 0`, aucune règle nouvelle).
- Chargement (§ 8.7) : `job-preparation.js` appelle `cncProfile.loadAdvanced(['preview-gl.js', 'origin-preview.js'])` puis `mount()` quand Préparer est visible, `cncLayout.wide()` vrai et la machine pas laser ; `unmount()` quand ces conditions cessent ; ligne `p.ks-prep-origin-hint` sous l'étape « Origine de travail ». `origin-preview.css` est injectée par `origin-preview.js` avec le suffixe `?v=` de son propre script ; toutes ses règles sous `body.perf-origin`.
- Utiliser (lot V) : `CNCPreviewGL.open(meta, { container, live: { tool: true }, pathStyle: 'ghost', fit: 'all', overlays })`, `handle.setOverlays()`, les incrustations `program`, `box`, `marker` du § 8.3 (couleurs nommées seulement) ; `cncGpu`. Utiliser (lot D) : `cncLayout.wide()`, `cnc-layout-change`, `cncDashboardView.loadedPreview()`. **Avant leur livraison**, colle les stubs du § 8.10 dans `test-origin-preview.cjs` seulement ; dans le code livré, une API absente donne le texte « Vue 3D indisponible : … » et rien d'autre.
- Textes : § 7.4 et § 2.4, en français, lignes EN/ES dans `i18n-messages-origin.js` (en `<script>` posé par l'intégrateur, selon Q13).

## Ordre de livraison

1. `travel-check.js` (`travelBox`, `place`) et `test-origin-preview.cjs` pour cette partie (aucune dépendance).
2. `origin-preview.js` contre les stubs de V et D ; quand V et D ont publié leur premier commit (hash dans leur rapport intermédiaire, transmis par l'intégrateur), vérifie ton code contre leur API réelle par `git show <hash>:<fichier>` sans modifier leurs fichiers.
3. Branchement dans `job-preparation.js`.

## Tests à écrire (nom imposé, spec § 11)

`test-origin-preview.cjs` : conditions de chargement et de démontage ; incrustations produites pour un état donné (translation par `wpos`, boîte de course depuis `$130–$132` et `$23`, couleurs ok / danger / neutral) ; textes ; égalité `place()` = `check()` sur l'état décalé ; libération ; et la preuve qu'aucun envoi n'a lieu (aucun `fetch`/`XMLHttpRequest` vers `api/touch-job`, aucun clic programmé sur un bouton de `#screen-jog`). À garder verts sans les modifier : `test-travel-check.cjs`, `test-job-preparation.cjs`, `test-preparation-keys.cjs`, `test-tablet-profile.cjs`, `test-i18n.cjs`, toute la suite `node verify-project.cjs`.

## Interdit

- Toucher un fichier hors de ta liste (`index.html`, `responsive.css` — c'est D qui place `#op-card` —, `preview-gl.js`, `tablet-profile.js`…) : un besoin s'écrit dans le rapport.
- Tout envoi au contrôleur ; tout appel à `real-motion.js`, `dry-motion.js`, `coordinate-plan.js`, aux boutons « Zéro … », `screen-lock.js`, `src/server/services/touch/motion.js`, `control.js`, `job-service.js` ; cocher une étape de la préparation guidée.
- Changer une règle de `travel-check.js` ou de `job-preparation.js` (`assess()` inchangé) ; conclure « dans la course » quand `travel-check.js` dit « non vérifiable » ; vérifier Z.
- Lire le programme (`watch/file`) pendant un travail ; dessiner dans un gestionnaire de `cnc-job-status` ; une cible de la carte à moins de 24 px d'une flèche de jog.
- Charger quoi que ce soit en Éco, en rendu logiciel, hors poste large, en laser ou sur la page de simulation (Q8, Q9).

## Rapport (français, court, brief § 7)

Fait et prouvé (commandes et extraits : `node verify-project.cjs`, `node test-origin-preview.cjs`), fait mais non vu sur la Surface, pas fait et pourquoi, besoins dans les fichiers d'un autre lot (intégrateur : `<script>` de `i18n-messages-origin.js` avant `i18n.js`, `?v=` de `job-preparation.js` et `travel-check.js`, `ADVANCED_VERSION`, enregistrement du test ; D : placement de `#op-card`), écarts constatés entre les stubs et les API réelles de V et D, hash des commits, tests ajoutés.
