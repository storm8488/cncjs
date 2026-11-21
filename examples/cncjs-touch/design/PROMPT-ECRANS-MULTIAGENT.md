# Audit et amélioration des écrans de CNCjs Touch (hors Réglages), en multi-agent

Tu es l'orchestrateur. Tu appliques à chaque écran la méthode qui a réussi sur Réglages (commit 6dffd4c3) : inventaire, chasse aux bugs d'affichage, propositions concurrentes, choix par un critique indépendant, maquettes, implémentation par petits lots, contre-revue, vérification réelle. Tu écris en français. Tu restes dans le dépôt `C:\Users\damou\Documents\claude\cncjs`, sur une nouvelle branche `feat/ecrans-ergonomie` créée depuis `feat/reglages-ergonomie`.

## Priorités, dans l'ordre

1. **Sécurité machine.** Aucune modification du chemin des commandes envoyées au contrôleur : jog, origine, palpage, démarrage, pause, reprise, arrêt, overrides, alarmes. Un changement d'ergonomie qui déplace ou recolore un bouton de mouvement est permis. Un changement de ce que le bouton envoie, de ses gardes (pilote, travail en cours, alarme, confirmation) ou de son état actif/désactivé est interdit sans accord écrit de l'utilisateur.
2. **Aucune régression v1 Éco.** La Surface RT (laser, 1366×768, Raspbian, Chromium 106 sans WebGL, profil Éco) doit fonctionner à l'identique ou mieux.
3. **Bugs d'affichage réels** : chevauchement, texte coupé ou tronqué, débordement, mot cassé, cible tactile < 48 px, texte < 16 px, contraste faible (thème clair surtout), élément caché derrière un bandeau collant, saut de mise en page, scintillement.
4. **Ergonomie** : moins de taps pour les tâches fréquentes, hiérarchie visible, l'action principale évidente, les actions dangereuses séparées.
5. **Optimisation** : coût de rendu (rafraîchissements inutiles, reflow, timers ou poll actifs sur un écran caché), surtout en v1 Éco.

## Écrans couverts (un lot d'audit par écran)

| Écran | id | Fichiers de départ (à compléter par l'inventaire) |
|---|---|---|
| Menu | overlay du menu, `touch-shell.js` | touch-shell.js, touch-shell.css, ui-2027.css |
| Préparer (Déplacer · Origine · Palpage) | `screen-jog` | real-motion.js, dry-motion.js, job-preparation.js, probe.css, origin-preview.css, operator-tools.css |
| Fichiers | `screen-files` | shared-library.js, projects.js, job-controls.js, library-preview*.js, files-touch.css, shared-library.css |
| Suivi | `screen-home` | job-follow.js, job-dashboard.js, tool-position.js, preview-*.js, preview-*.css |
| Machine (état, limites) | `screen-machine` | machine-limits.js, connection-status.js, job-simulation.js |
| Journal | `screen-history` | real-history.js, simulation-history.js |
| Transverses | bandeau d'état, barre latérale, verrou, veille, guide, page `simulation.html` | touch-shell.*, screen-lock.js, screen-saver.js, interface-guide.js, responsive.css, viewport-fit.css |

Réglages est exclu : il vient d'être fait. Ne le retouche que si un correctif transverse l'exige.

## Cibles et variantes à couvrir

- **v1 Éco 1366×768** (RT) et **v2 Performance 1366×911** (Surface Pro, `body.perf-v2`).
- **Thèmes** sombre et clair ; **texte** standard et agrandi.
- **Langues** FR et ES (l'espagnol est la plus longue) ; EN contrôlé par test.
- **Machines** CNC et Laser.
- **États machine** : hors ligne, repos, travail en cours, pause, alarme, homing, palpage, pilote pris par un autre appareil, données périmées. Chaque état visible doit avoir au moins une capture. Leçon de Réglages : une ligne laissée vide par la fixture n'est jamais mesurée ; ajoute les états manquants à la fixture du harnais (`preview-server.cjs`, `browser-run.cjs`).

## Lecture préalable

- `CLAUDE.md`, `examples/cncjs-touch/TESTING.md`, `PROFILES.md`, `PERFORMANCE-UI-SPEC.md` (contrat v2), `layout-exceptions.json`.
- `design/PROMPT-REGLAGES-MULTIAGENT.md` et le diff `git show 6dffd4c3 --stat` : modèle de méthode et de livrables.
- Les règles du harnais strict dans `browser-run.cjs`.
- `verify-project.cjs` : chaque test doit finir par une ligne `PASS`.
- `test-v2-settings.cjs` : toute règle CSS placée après le marqueur `/* Performance v2 (L6)` doit être limitée à `body.perf-v2` ou à `body:not(.perf-v2)`.

## Contraintes techniques

- Chromium 106 : ES2017 au plus, pas de modules, pas de TypeScript, CSS sans dépendance.
- Toute chaîne visible passe par i18n, avec une ligne FR/EN/ES dans `i18n-messages*.js`.
- Garde les identifiants et API publics utilisés par les tests et les autres modules (`window.cnc*`, ids, `data-*`). Si tu dois les changer, migre les tests dans le même lot.
- Changements chirurgicaux : pas de refonte de module, pas de nouveau framework, pas de nouvel écran ni de nouvelle fonction.
- Cache : passe le suffixe courant `v2l` au suivant (`v2m`) dans `touch/` et `*.cjs`, `ADVANCED_VERSION` de `tablet-profile.js` compris. Change aussi le `?v=` de tout fichier modifié qui ne porte pas ce suffixe.

## Équipe, modèles et phases

Le modèle de chaque rôle est choisi pour sa force. Un seul agent écrit dans le dépôt à la fois. Les agents de lecture peuvent tourner en parallèle.

| Phase | Rôle | Modèle | Pourquoi |
|---|---|---|---|
| 0 | Inventaire + baseline (harnais strict complet, captures de tous les états) | **Opus 5.5** | lecture large du code, exécution d'outils, fiable |
| 1 | Auditeur d'écran, un par écran (7), lecture seule : bugs d'affichage (captures + JSON du harnais), ergonomie, coût de rendu | **Opus 5.5** | multimodal, précis sur le code, parallélisable |
| 1b | Second regard indépendant sur les captures et le CSS de chaque écran | **Astra ultra** (`codex exec -s read-only -c model_reasoning_effort='"ultra"'`) | raisonnement profond sur le rendu, angle différent, pas de biais commun avec Opus |
| 2 | Proposition d'architecture par écran : 2 variantes (minimale / ambitieuse) | **Opus 5.5** | conception bornée par le code existant |
| 2b | Critique et choix par écran, fusion des constats 1 et 1b, verdict « corriger / améliorer / laisser » | **Fable 5.1** | meilleur jugement, indépendant des auteurs |
| 3 | Maquettes HTML statiques des écrans retenus (FR/ES, 768 et 911) | **Opus 5.5** | rendu et capture dans le harnais |
| 4 | Implémentation, un lot par écran, en série | **Opus 5.5** | écriture de code et tests, sous contrat |
| 5 | Contre-revue par lot : régressions, sécurité machine, RT v1 | **Fable 5.1** | chasse aux défauts subtils |
| 5b | Contre-revue lisibilité, i18n, harnais | **Astra ultra** (lecture seule) | second angle indépendant |
| 6 | Corrections + harnais strict complet final | **Opus 5.5** | exécution |

### Points de contrôle

- **Après la phase 2b**, l'orchestrateur s'arrête. Il remet à l'utilisateur, par écran : les bugs confirmés, les améliorations retenues, ce qui est laissé et pourquoi, et les maquettes. Il n'implémente qu'après son accord. L'utilisateur peut écarter un écran.
- **Préparer et Suivi** sont sensibles, car leurs boutons commandent la machine. Pour ces écrans, la critique 2b liste chaque bouton touché et prouve que sa commande, ses gardes et son état ne changent pas.
- **Fin de chaque lot** : `verify-project` doit être vert avant le lot suivant.

## Format des constats (phases 1, 1b, 5, 5b)

Chaque constat est un JSON : `{écran, fichier, ligne, variante (ex. v1-768-es-clair-laser-pause), gravité (bloquant|important|mineur), catégorie (affichage|ergonomie|perf|i18n|sécurité), preuve (capture + mesure ou extrait de code), correction proposée}`.

Un constat sans preuve est rejeté. Les doublons sont fusionnés. Un constat réfuté par la critique est noté comme tel, pas supprimé en silence.

## Critères d'acceptation

- Harnais strict : 0 violation, 0 nouvelle exception dans `layout-exceptions.json`, toutes les étapes passées, sur toutes les variantes ci-dessus.
- Aucune cible tactile < 48 px, aucun texte < 16 px, aucun défilement horizontal, aucun mot cassé, à 768 comme à 911, en texte agrandi et en ES.
- Contraste ≥ 4,5:1 pour le texte et ≥ 3:1 pour les contours de contrôles, dans les deux thèmes.
- Aucun poll, timer ni animation actif sur un écran caché. Le prouver par test pour chaque module touché.
- Tâches fréquentes, pas de tap en plus. Mesurer avant et après :
  - Fichiers → charger → Suivi ;
  - Préparer → origine XY ;
  - Suivi → pause/reprise ;
  - Journal → filtrer.
- Tests existants : aucune assertion retirée. Chaque bug corrigé reçoit un test qui le reproduit.

## Vérifications exactes

Depuis la racine du dépôt :

```
node examples/cncjs-touch/verify-project.cjs                 → « N/N contrôles réussis. Aucun essai matériel. »
npx jest src/server/services/touch                            → toutes les suites passent
node examples/cncjs-touch/browser-run.cjs --strict --browser "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --out <scratchpad>\run-ecrans-<lot>
                                                              → « 0 violation(s), 0 excepted » et « every step passed » (~25 min, en arrière-plan)
```

Après le harnais, aucun processus msedge contenant `cnc-browser-run` ne doit rester ouvert.

## Interdit sans accord explicite de l'utilisateur

- Commit sur une autre branche, push, merge, déploiement sur la Surface Pro ou la RT.
- Toute commande vers une machine, une tablette ou le réseau. Seul le serveur local du harnais, en loopback, est permis.
- Toute modification de la RT, du serveur (`src/server`), ou du protocole Socket.IO ou REST.
- `git reset`, `stash`, `checkout` des fichiers d'autrui ; contourner les hooks git.
- Toucher `COMPTE-RENDU-*.md` ou `design/reglages/`.

## Compte rendu final (en français)

1. **Par écran** : bugs trouvés et corrigés, avec une capture avant/après dans les mêmes conditions ; améliorations d'ergonomie ; taps avant/après.
2. **Ce qui a été laissé**, et pourquoi.
3. **Tests** : résultats exacts de `verify-project`, Jest et du harnais (chemins des rapports).
4. **Sécurité** : liste des boutons machine touchés, avec la preuve que leur comportement est inchangé.
5. **Non vérifié** : vraie machine, vraie RT, vraie Surface.
6. **Commits** proposés sur `feat/ecrans-ergonomie`, pas encore poussés.
