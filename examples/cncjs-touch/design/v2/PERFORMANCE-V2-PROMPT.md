# Prompt multi-agents : Performance v2 (les 10 évolutions + la nouvelle UI)

Orchestration par Claude (intégrateur). Moteurs : **Codex** (`gpt-6-astra`, raisonnement **ultra**, `codex exec -s workspace-write` dans un worktree git dédié) pour les tâches lourdes ; **Opus 5.5 en effort moyen** (sous-agents dans un worktree isolé) pour les tâches moyennes. Rien n'est poussé, rien n'est déployé sur la Surface sans validation de l'intégrateur, aucune commande machine.

## 0. Base commune donnée à chaque agent

Dépôt `C:\Users\damou\Documents\claude\cncjs`, base `feat/touch-profiles` au commit de lancement (≥ `0c05099b`). Chaque agent travaille dans son worktree, sur la branche `v2/<lot>`, commite ses seuls fichiers, ne pousse pas, ne fusionne pas.

À lire d'abord, dans cet ordre :
1. `examples/cncjs-touch/design/v2/REFLEXION.md` : le diagnostic, les 10 propositions, la v2 écran par écran, les lots et les contrats. **C'est la spécification.**
2. Les maquettes `design/v2/performance-v2.html` et `performance-v2-preparer.html`, avec leurs captures : la référence visuelle.
3. `PERFORMANCE-UI-SPEC.md` (§ 13, décisions de l'utilisateur), `PROFILES.md`, `README.md`, `TESTING.md`, `BUGHUNT-MAP.md`, `bughunt/FINDINGS.md` : les défauts déjà corrigés, à ne pas réintroduire.

### Règles non négociables, rappelées à chaque agent

- **Sécurité.**
  - Rien n'envoie au contrôleur hors des chemins existants : tickets de confirmation, pilote F5, gardes du serveur.
  - Pause et Arrêter restent dans le bandeau, toujours joignables et jamais déplacés.
  - Aucun geste graphique ne commande la machine.
  - Aucun rendu dans un gestionnaire d'état : uniquement dans `requestAnimationFrame`.
  - Aucune lecture du programme pendant un travail.
  - Aucune extrapolation : un rapport est périmé après 2,5 s ; « acquitté » ne veut pas dire « usiné ».
  - Toute estimation est étiquetée comme telle.
- **Portes.** La v2 ne s'active que si quatre conditions sont réunies :
  - une préférence explicite (clé `cncjs-touch-performance-ui-v2`) ;
  - le profil Performance ;
  - un GPU matériel ;
  - le poste large.

  Le changement ne s'applique qu'à la prochaine session au repos. La RT, l'Éco, le laser et le rendu logiciel restent **identiques** : aucun module v2 n'y est demandé.
- **Fichiers interdits** (hors chantier) : `job-controls.js`, `real-motion.js`, `dry-motion.js`, `coordinate-plan.js`, `job-stream.js`, `strip-guard.js`, `app.js` et tout `src/server/**`. Un défaut trouvé dans ces fichiers est signalé dans le rapport, pas corrigé.
- **Code.**
  - JavaScript vanilla en IIFE, qui parse en ES2017 (Chromium 106).
  - Pas de dépendance npm, pas de three.js.
  - Interface en français, avec les lignes EN/ES dans le catalogue du lot.
  - Fins de ligne LF.
  - Cibles de 64 et 48 px, texte d'au moins 16 px.
- **Tests.**
  - Écrire d'abord un test qui échoue pour chaque comportement, puis le faire passer.
  - Avant chaque commit et à la fin :
    - `node examples/cncjs-touch/verify-project.cjs` doit être vert ;
    - `npx jest src/server/services/touch src/server/api` doit être vert, en lisant la ligne **Test Suites** et pas seulement Tests.
  - Le harnais `browser-run.cjs --strict` (Edge `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`) n'est lancé que par L7 et par l'intégrateur. Les autres lots ne le lancent pas, pour éviter les instances concurrentes.
- **Propriété.** Chaque lot ne modifie que ses fichiers. Un besoin ailleurs se signale dans le rapport.
- **Rapport final** (en français, court) :
  - commits ;
  - ce qui est prouvé, avec commande et extrait ;
  - ce qui reste à mesurer sur la tablette ;
  - besoins dans les fichiers des autres lots ;
  - tests ajoutés.

## 1. Phases et lots

| Phase | Lot | Moteur | Mission | Fichiers possédés |
|---|---|---|---|---|
| **A** (seul) | **L0 — contrats, porte, bootstrap** | Codex ultra | Figer les contrats du § 7 de REFLEXION : identité, temps, état observé, géométrie, présentation, cycle de vie, commandes. Écrire `touch/performance-v2-contract.js` avec des stubs pour tous les autres lots. Mettre en place la porte v2 et l'activation différée. Les lots reçoivent les classes de `body` `perf-v2`, l'événement `cnc-v2-change` et les points de montage. | `touch/tablet-profile.js`, `touch/touch-shell.js`, `touch/status-strip.js`, `touch/index.html`, `touch/simulation.html`, `touch/i18n.js`, nouveau `touch/i18n-messages-v2.js`, nouveau `touch/performance-v2-contract.js`, tests de porte |
| **B** (parallèle) | **L1 — moteur 3D et inspection** (propositions 3 et 10) | Codex ultra | Loupe et inspection au doigt ou au stylet, sans quitter la vue en direct. Index de proximité construit au repos, recherches bornées. Qualité de rendu pilotée par un budget, et option « rendu allégé ». Repli dans le même rectangle. | `touch/preview-gl.js`, `touch/preview-3d.js`, `touch/tool-position.js`, `touch/preview-advanced.css`, nouveau `touch/performance-inspect.js`, leurs tests |
| **B** | **L2 — géométrie, séquences, origine** (propositions 4, 5 et 6) | Codex ultra | Séquences « maintenant / ensuite », préparées au repos, avec leur provenance. Comparaison entre l'origine actuelle et l'hypothèse XY, et marges de course. Brut, brides et cotes, avec leur source. | `touch/preview-inspect.js`, `touch/motion-estimate.js`, `touch/origin-preview.js`, `touch/travel-check.js`, nouveau `touch/performance-sequences.js`, leurs tests |
| **B** | **L3 — observations et contexte temporel** (propositions 1, 8 et 9, partie modèle) | Codex ultra | Modèle de l'état de confiance (frais, périmé, estimé, acquitté, inconnu). Tampon de la courbe borné, avec marqueurs et trous de données. Contexte du journal. | nouveaux `touch/performance-observation.js`, `touch/performance-journal-context.js`, leurs tests |
| **C** (parallèle) | **L4 — Suivi et grille v2** (propositions 1, 2 et 8, présentation) | Opus moyen | Grande scène et colonne de surveillance comme dans la maquette. Courbe visible à 1366 × 911. Bande de confiance, frise « maintenant / ensuite ». Les identifiants et les relais existants sont conservés. | `touch/job-dashboard.js`, `touch/responsive.css`, `touch/ui-2027.css`, nouveau `touch/performance-v2.css`, `test-dashboard.cjs`, `test-job-display.cjs`, `test-responsive-wide.cjs` |
| **C** | **L5 — Fichiers et Préparer** (propositions 5, 6 et 7, présentation) | Opus moyen | Fichiers : sélection et programme chargé distingués. Préparer : comparaison d'origine comme dans la maquette, jog dans un panneau, au moins 24 px entre la caméra et le jog. | `touch/job-preparation.js`, `touch/origin-preview.css`, `touch/shared-library.js`, `touch/shared-library.css`, `touch/files-touch.css`, `touch/projects.js`, leurs tests |
| **C** | **L6 — Machine, Journal, Réglages** (propositions 9 et 10, présentation) | Opus moyen | Journal contextualisé, ouvert depuis la courbe. Réglages : préférence v2, rendu allégé, diagnostic à la demande. Machine : explication des alarmes. | `touch/machine-limits.js`, `touch/session-journal.js`, `touch/real-history.js`, `touch/display-settings.js`, `touch/settings-list.css`, `touch/tablet-diagnostic.js`, leurs tests |
| **D** | **L7 — validation indépendante** | Opus moyen | Harnais strict avec les fenêtres v2. Matrice de sécurité (travail, pause, alarme, flux perdu, GPU perdu, verrou, fiche ouverte). Non-régression RT et Éco. Script de mesure pour la tablette. Documentation d'usage. Ne corrige pas : rapporte au lot propriétaire. | `browser-run.cjs`, `browser-strip.cjs`, `layout-exceptions.json`, `verify-project.cjs`, nouveaux `test-performance-v2-safety.cjs`, `measure-performance-v2.cjs`, `design/v2/PERFORMANCE-V2-VALIDATION.md`, `design/v2/PERFORMANCE-V2-USAGE.md` |
| **E** | **Intégration et relecture** | Claude + Codex ultra (lecture seule) | Fusion des branches et des suffixes de cache, suite complète, harnais. Relecture adversariale par Codex, puis corrections par le lot propriétaire, tant que la relecture trouve un défaut prouvé. Publication sous `/touch-next/` sur la Surface, puis mesures sur la tablette. | — |

**Ordre :** A → B (L1, L2 et L3 ensemble) → C (L4, L5 et L6 ensemble) → D → E. Pendant B, les lots C peuvent préparer leurs structures sur les stubs de L0, mais ils ne sont lancés qu'à la fin de B, pour intégrer les modèles réels.

## 2. Prompt type d'un lot

> Tu réalises le **lot <Lx> — <titre>** de la Performance v2 de CNCjs Touch. Ton worktree est prêt : `git switch -c v2/<lx> <commit de base>` (s'il est sur un autre commit, remets-le d'abord). Lis la section 0 de `examples/cncjs-touch/design/v2/PERFORMANCE-V2-PROMPT.md` et respecte-la à la lettre, puis `design/v2/REFLEXION.md` (propositions <n°>, écrans <…>, § 7 contrats) et les maquettes v2. Pour les phases B et C : le contrat de L0 est dans `touch/performance-v2-contract.js` (branche `v2/l0`, fusionnée dans ta base) ; aligne-toi dessus, n'en change pas la forme (écris un besoin de changement dans ton rapport). Ta mission : <mission du tableau>. Tes fichiers, et seulement eux : <liste>. Pour chaque comportement : test rouge, correction, test vert. Commit sur `v2/<lx>` (message en anglais, terminé par la ligne de co-auteur demandée par l'intégrateur). Rapport final selon la section 0.

## 3. Garde-fous de l'intégrateur

- **Bases des lots :**
  - avant la phase B, L0 est fusionné et devient la base de L1, L2 et L3 ;
  - avant la phase C, les lots B sont fusionnés et deviennent la base de L4, L5 et L6.
- **Après chaque phase :** suite hors ligne, Jest (ligne Test Suites incluse), harnais strict, et arrêt des processus Edge restés ouverts.
- **Relecture Codex :** au moins une relecture adversariale complète avant toute publication. Pas de déploiement sur `/touch/` tant qu'un défaut de sécurité reproduit reste ouvert.
- **Publication :** sous `/touch-next/` seulement. Le kiosque ne passe à la v2 qu'après les mesures sur la tablette et l'accord de l'utilisateur.
- **Rien ne change sur la RT.**
