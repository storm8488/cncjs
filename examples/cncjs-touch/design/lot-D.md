# Lot D — Poste large et instruments (chantier « Performance UI », phase 2)

Tu es un agent de réalisation. Tu n'as pas lu la conversation qui a produit ce brief : tout ce qu'il te faut est ici et dans les fichiers cités. Dépôt `C:\Users\damou\Documents\claude\cncjs`, dossier `examples/cncjs-touch`. Travaille dans ton propre worktree, branche `perf-ui/D` créée depuis `feat/touch-profiles` ; commite seulement tes fichiers ; ne pousse pas, ne fusionne pas. Aucune commande à une machine, aucun ssh, aucun déploiement.

**À lire d'abord, dans cet ordre** : `PERFORMANCE-UI-BRIEF.md` (règles § 3, il prime), `PERFORMANCE-UI-SPEC.md` (§ 0-2, 5, 6, 8.5-8.10, 9-12 ; réponses de l'utilisateur reportées dans le brief), `PROFILES-CONTRACT.md`, `README.md` (« UI 2027 », « Layout »), puis `touch/responsive.css`, `touch/ui-2027.css`, `touch/design-tokens.css`, `touch/touch-shell.js`, `touch/job-dashboard.js`, `touch/job-controls.js`, `touch/motion-estimate.js`, `touch/viewport-fit.js`, `browser-run.cjs`, `test-dashboard.cjs`. Maquettes : `design/performance-suivi.html`, `performance-fichiers.html`, `performance-preparer.html` (sélecteur 1366 × 911 / 1728 × 1152, « Annoter les cibles »).

## Mission

Objectifs 2 et 5 du brief : la classe `perf-wide` (porte GPU **et** fenêtre ≥ 1300 × 880 en paysage, § 2.2) et `window.cncLayout` ; Suivi sur trois zones Vue | Instruments | Commandes, ou la variante retenue par l'utilisateur (Q3b) ; Fichiers liste + grand aperçu ; Préparer large avec la place de la carte d'O (`#op-card`, classe `perf-origin`) ; instruments (temps restant corrigé avec sa source, ligne acquittée, avance réelle, corrections lisibles, courbe selon Q10) ; harnais à 1366 × 911 et 1728 × 1152. Cibles 64 px primaires, 48 px secondaires, texte utile ≥ 16 px. Hors `perf-wide` : rien ne change, la RT (1366 × 768) en premier.

## Fichiers possédés (table du brief § 5, rien d'autre)

`touch/responsive.css`, `touch/ui-2027.css`, `touch/app.css`, `touch/touch-shell.*`, `touch/job-dashboard.js`, `touch/job-controls.js` (affichage seulement : aucune logique de commande), `touch/status-strip.js`, `touch/motion-estimate.js`, `touch/i18n-messages-profiles.js`, `browser-run.cjs`, `layout-exceptions.json`, `test-responsive*.cjs`, `test-dashboard.cjs`, `test-job-display.cjs`.

## API à respecter et à livrer (spec § 8)

- Livrer : `perf-wide`, `cnc-layout-change`, `cncLayout.wide()` dans `touch-shell.js` ; `cncDashboardView.loadedPreview()` dans `job-dashboard.js` (§ 8.6 : une lecture en vol, même vérification que Suivi, `null` sans programme ou aperçu valide).
- Respecter : `#home-job-image` reste enfant de `.job-art`, qui garde `position: relative` et une hauteur de grille (V y monte sa vue) ; tous les IDs existants de `job-dashboard.js` gardent leur type ; enveloppes nouvelles permises `#home-zone-view`, `#home-zone-gauges`, `#home-zone-controls`.
- Lire, sans les posséder : `cncGpu`, `perf-gpu` (V) ; `CNCToolPosition.acknowledged` (V, avec repli sur la formule actuelle de `job-dashboard.js` tant qu'il est absent) ; `#op-card` et `perf-origin` (O). Avant la livraison de V, utilise les stubs du § 8.10 **dans tes tests seulement**.
- `motion-estimate.js` est aussi lu par V (worker de géométrie) : n'en change pas la signature de `createInterpreter`.
- Textes : § 6 en français, lignes EN/ES dans `i18n-messages-profiles.js`.

## Ordre de livraison

1. **Premier commit** : `perf-wide` + `cncLayout` + `loadedPreview()` + `test-responsive-wide.cjs` ; hash dans ton rapport intermédiaire (O s'aligne dessus).
2. Grilles des trois écrans sous `body.perf-wide`, harnais (fenêtres ajoutées, `perf-gpu` posé par CDP, Q12), 0 violation.
3. Instruments (§ 6), `test-dashboard.cjs` et `test-job-display.cjs` étendus.

## Tests à écrire (noms imposés, spec § 11)

`test-responsive-wide.cjs`, `test-dashboard.cjs` et `test-job-display.cjs` (étendus), `browser-run.cjs` + `layout-exceptions.json` (exceptions vides si possible). Commande du harnais : `node browser-run.cjs --strict --browser "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --out <dossier propre>`. À garder verts sans les modifier : `test-status-strip.cjs`, `test-strip-guard.cjs`, `test-compact-layout.cjs`, `test-viewport-*.cjs`, `test-home-actions.cjs`, `test-tablet-profile.cjs`, `test-i18n.cjs`, toute la suite `node verify-project.cjs`.

## Interdit

- Toucher un fichier hors de ta liste (`index.html`, `tablet-profile.js`, `preview-*.js`, `tool-position.js`, `job-preparation.js`, `travel-check.js`…) : un besoin s'écrit dans le rapport.
- Changer une garde, une confirmation, un envoi ou un état de bouton de commande dans `job-controls.js` ou `job-dashboard.js` (affichage seulement) ; `real-motion.js`, `dry-motion.js`, `coordinate-plan.js`, `screen-lock.js`, `src/server/services/touch/motion.js`, `control.js`, `job-service.js`.
- Une requête média qui répète la règle de `perf-wide` ; une mise en page qui change à la perte de contexte (Q4) ; un crochet de forçage du GPU dans le code livré.
- Écrire dans le DOM à chaque rapport ce qui ne change pas ; dessiner la courbe dans le gestionnaire de `cnc-job-status` ; écrire quoi que ce soit quand Suivi est caché.
- Mettre Pause ou Arrêter sous quoi que ce soit, ou Arrêter à côté de Pause.

## Rapport (français, court, brief § 7)

Fait et prouvé (commandes et extraits : `node verify-project.cjs`, harnais Edge avec le nombre de violations), fait mais non vu sur la Surface, pas fait et pourquoi, besoins dans les fichiers d'un autre lot (intégrateur : `?v=` des feuilles et scripts modifiés, enregistrement des tests), hash des commits (dont l'étape 1), tests ajoutés, chiffres avec leur provenance.
