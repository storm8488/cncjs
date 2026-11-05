# Lot V — Vue 3D en direct (chantier « Performance UI », phase 2)

Tu es un agent de réalisation. Tu n'as pas lu la conversation qui a produit ce brief : tout ce qu'il te faut est ici et dans les fichiers cités. Dépôt `C:\Users\damou\Documents\claude\cncjs`, dossier `examples/cncjs-touch`. Travaille dans ton propre worktree, branche `perf-ui/V` créée depuis `feat/touch-profiles` ; commite seulement tes fichiers ; ne pousse pas, ne fusionne pas. Aucune commande à une machine, aucun ssh, aucun déploiement : tu ne touches ni à la Surface ni à la RT.

**À lire d'abord, dans cet ordre** : `PERFORMANCE-UI-BRIEF.md` (règles non négociables § 3, il prime), `PERFORMANCE-UI-SPEC.md` (§ 0-4, 8, 9, 10, 11, 12 ; les réponses de l'utilisateur aux questions sont reportées dans le brief), `PROFILES-CONTRACT.md`, puis `touch/preview-gl.js`, `touch/preview-3d.js`, `touch/tool-position.js`, `touch/toolpath-3d.js`, `touch/preview-inspect.js`, `test-preview-gl.cjs`. Maquette : `design/performance-suivi.html`.

## Mission

Objectifs 1 et 4 du brief : dans Suivi, la vue 3D inline reste pendant le travail et la pause, avec segments acquittés / restants, passe en cours, repère d'outil interpolé entre deux rapports sans jamais dépasser le dernier segment acquitté, données périmées, « Suivre l’outil » (spec § 3) ; rendu GPU quand la porte est ouverte : 60 images/s en geste, DPR ≤ 2, anticrénelage, épaisseurs, géométrie complète sous plafond, fondu de profondeur (§ 4) ; la porte GPU elle-même (§ 2.1) ; l'API d'incrustation que le lot O utilise (§ 8.2-8.3). Rendu logiciel (RT) et Éco : comportement actuel à l'identique.

## Fichiers possédés (table du brief § 5, rien d'autre)

`touch/preview-gl.js`, `touch/preview-3d.*`, `touch/preview-advanced.css`, `touch/toolpath-3d.js`, `touch/tool-position.js`, `touch/job-follow.js`, `touch/preview-inspect.js`, `touch/i18n-messages-viz.js`, `test-preview-gl.cjs`, `test-preview-3d*.cjs`, `test-job-follow.cjs`, nouveaux `measure-*.cjs`.

## API à livrer (contrat, spec § 8)

- `window.cncGpu` (`state()`, `ready()`), événement `cnc-gpu-change`, classes `perf-gpu` et `perf-gpu-lost`, probe `CNCPreviewGL.probeGpu()` déclenchée par `preview-3d.js` en Performance seulement, dans un `requestIdleCallback`.
- `CNCPreviewGL.open(meta, options)` : options `live`, `overlays`, `pathStyle`, `fit` ; poignée `setOverlays`, `follow`, `state()` étendu, `stats()` ; `CNCPreviewGL.checkOverlays(list)` pur. Formes, repères (travail / machine par `o = mpos − wpos`), couleurs nommées, épaisseurs, limites et refus : exactement le § 8.3, y compris le tableau des cas de référence.
- `window.CNCToolPosition` (`acknowledged`, `trailCount`, `project`) exposé dans la page.
- Textes du § 3.6 en français, lignes EN/ES dans `i18n-messages-viz.js`. Le libellé « Point rose » suit la réponse à Q1.

## Ordre de livraison

1. **Premier commit (avant tout rendu)** : surface de l'API : `cncGpu` complet ; `checkOverlays` et `setOverlays` (validation et état, sans dessin) ; options acceptées par `open` ; `CNCToolPosition` ; `test-preview-3d-overlays.cjs` avec les cas de référence, identiques au stub de la spec. Écris dans ton rapport intermédiaire le hash de ce commit : O et D s'alignent dessus.
2. Porte GPU et rendu GPU (§ 4), avec `test-preview-gl.cjs` étendu et `test-preview-3d-gpu.cjs`.
3. Vue en direct dans Suivi (§ 3), avec `test-preview-3d-live.cjs`.
4. Géométrie complète dans le worker de `preview-inspect.js` (§ 3.8), sous le plafond et les règles de Q7.
5. `measure-preview-gl-live.cjs` (PC, détection de régressions seulement).

## Tests à écrire (noms imposés, spec § 11)

`test-preview-gl.cjs` (étendu), `test-preview-3d-gpu.cjs`, `test-preview-3d-live.cjs`, `test-preview-3d-overlays.cjs`, `test-job-follow.cjs` seulement si `job-follow.js` change, `measure-preview-gl-live.cjs`. Hors ligne, sans npm nouveau, sur le modèle des stubs WebGL de `test-preview-gl.cjs`. À garder verts sans les modifier : `test-tablet-profile.cjs`, `test-tool-position.cjs`, `test-preview-3d.cjs`, `test-viz-i18n.cjs`, `test-i18n.cjs`, `test-strip-guard.cjs`, toute la suite `node verify-project.cjs`.

## Interdit

- Toucher un fichier hors de ta liste (en particulier `index.html`, `simulation.html`, `tablet-profile.js`, `job-dashboard.js`, `responsive.css`, `perf-harness.js`, `motion-estimate.js` que tu lis seulement) : un besoin s'écrit dans le rapport.
- `real-motion.js`, `dry-motion.js`, `coordinate-plan.js`, `screen-lock.js`, `src/server/services/touch/motion.js`, `control.js`, `job-service.js`, et tout ce qui envoie quelque chose au contrôleur.
- Dessiner, lire la mise en page ou chercher l'accroche dans un gestionnaire de `cnc-job-status` ; extrapoler le repère ; mettre des images en file.
- Charger `preview-gl.js` ou ouvrir un contexte en Éco ; mettre un module avancé en `<script>` ; ajouter un crochet de forçage du GPU (paramètre d'URL, clé de stockage).
- Annoncer un chiffre de performance mesuré sur PC comme un gain.

## Rapport (français, court, brief § 7)

Ce qui est fait et prouvé (commande et extrait de sortie : `node verify-project.cjs`, tes tests), ce qui est fait mais non mesuré sur la tablette, ce qui n'est pas fait et pourquoi, les besoins dans les fichiers d'un autre lot (intégrateur : `?v=` de `preview-3d.js`, `tool-position.js`, `preview-advanced.css`, `ADVANCED_VERSION`, enregistrement des tests), les hash des commits (dont celui de l'étape 1), les tests ajoutés avec leur nom, les chiffres avec leur provenance (PC, fenêtre, DPR, renderer).
