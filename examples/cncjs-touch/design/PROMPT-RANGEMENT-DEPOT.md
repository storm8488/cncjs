# Rangement du dépôt GitHub storm8488/cncjs (multi-agent, 2026-11-21)

Tu écris en français ; code, commentaires et messages de commit en anglais ; la documentation de mainteneur reste dans sa langue actuelle (anglais pour `examples/cncjs-touch/*.md`, français pour `design/`). Dépôt `C:\Users\damou\Documents\claude\cncjs`, branche de travail `chore/rangement-depot`, partie de `feat/fonctions-5` (= version installée sur la tablette, `caf09b31`). Ce document s'impose à tous les agents.

## 1. Pourquoi

L'opérateur veut « un dépôt propre ». Aujourd'hui : `master` n'a rien de CNCjs Touch depuis début novembre (243 commits de retard sur la version installée) ; six branches de travail traînent sur GitHub, toutes contenues dans `feat/fonctions-5` ; la PR n° 6 est ouverte alors que son contenu est dépassé ; le README de `examples/cncjs-touch` date d'avant la machine réelle (« je n'ai pas de CNC opérationnelle ») ; `design/` mélange documents en vigueur, prompts passés et captures ; 318 captures PNG non suivies traînent dans `design/ecrans/files/`.

But : qu'un visiteur du dépôt (ou l'opérateur dans six mois) comprenne en deux minutes ce qu'est ce fork, où est l'interface tactile, comment l'installer, quels documents sont en vigueur et lesquels sont de l'historique.

## 2. Ce qui sera fait (l'orchestrateur fait les opérations git, pas les agents)

1. Sur `chore/rangement-depot` : documentation d'entrée et rangement (§ 3), commits par l'orchestrateur après relecture et suites vertes.
2. PR `chore/rangement-depot` → `master` sur `storm8488/cncjs`, fusion par commit de fusion (historique gardé, pas de squash).
3. Étiquette `tablette-2026-11-21` sur `caf09b31` (version installée).
4. Fermeture de la PR n° 6 avec un commentaire : contenu repris dans `master`.
5. Suppression sur GitHub des branches contenues dans `master` : `feat/fonctions-5`, `feat/refonte-ui`, `feat/ecrans-ergonomie`, `feat/reglages-ergonomie`, `v2/integration`, `feat/touch-profiles`, `chore/rangement-depot`. Vérification `git merge-base --is-ancestor` avant chaque suppression.
6. Publication de la fonction mise de côté : `feat/F2` poussée sous `idees/F2-pause-degager` (non fusionnée, non installée).
7. Local : suppression des branches périmées (feat/F1, F4, F5, F10, F16, fonctions-4, fonctions-6, sauvegarde-avant-codex, ci/macos-x64-dmg) après vérification qu'elles sont contenues dans `master` ou dans une branche publiée.

## 3. Travail des agents sur la branche

| Phase | Qui | Quoi |
|---|---|---|
| A. Audit (lecture seule, en parallèle) | **Sonnet 5.5** × 3 | A1 : carte de `examples/cncjs-touch/` et `design/` (en vigueur / historique / doublon), avec toutes les références croisées (scripts `.cjs`, tests, liens Markdown) ; A2 : README racine et README de `examples/cncjs-touch` (ce qui est faux ou périmé, faits à jour tirés de `design/refonte/RAPPORT.md`, `design/fonctions/RAPPORT.md`, `INSTALL.md`, `PROTOCOLE-ESSAI.md`, IDEES.md) ; A3 : CI (`.github/workflows`) et fichiers non suivis : ce que la fusion dans `master` déclenchera, ce qui risque d'échouer, règles `.gitignore` à ajouter. |
| B. Rédaction | **Opus 5.5** | Applique le rangement d'après les trois audits. |
| C. Relecture (en parallèle) | **Astra ultra** (Codex, lecture seule) et **Sonnet 5.5** | Liens morts, fait inexact, fichier déplacé encore référencé, PNG ajouté, suites. |
| D. Correction et vérification | Opus 5.5 puis l'orchestrateur | Constats corrigés ; l'orchestrateur relance les suites, commite, fait le § 2. |

Contenu attendu de la phase B :
- **README racine** : un court bandeau en tête (avant le texte d'origine de CNCjs, qui reste intact) : ce fork = CNCjs + CNCjs Touch pour la CNC LUNYEE 4040 (Grbl 1.1f sur ESP32) et la Surface Pro, lien vers `examples/cncjs-touch/README.md`, état (installé et utilisé en usinage réel depuis novembre 2026), branches publiées et étiquette.
- **`examples/cncjs-touch/README.md`** réécrit en point d'entrée à jour : ce que fait l'interface (le fil de la séance : 1 Machine, 2 Fichier, 3 Zéro pièce, 4 Contrôle, 5 Usinage, Plus ; fonctions livrées), état réel (machine réelle, ce qui est prouvé et ce qui ne l'est pas), installation (renvoi à INSTALL.md), essais (renvoi à TESTING.md, `verify-project.cjs`, harnais), sûreté (SURETE.md), table « où trouver quoi ». Les sections historiques utiles (audit 2026-10, profils) deviennent des liens courts, pas des pavés.
- **`examples/cncjs-touch/design/README.md`** (nouveau) : index de `design/` : documents en vigueur d'abord (SPEC-REFONTE, SURETE, FIRMWARE, PROTOCOLE-ESSAI, IDEES, RAPPORT des fonctions), puis prompts et lots passés comme historique daté.
- **`.gitignore`** : captures de travail non suivies (`examples/cncjs-touch/design/*/files/*.png` ou plus précis) ; `/COMPTE-RENDU-*.md` à la racine.
- Les deux documents non suivis `design/ETUDE-RUST-SANS-CHROMIUM.md` et `design/PROMPT-REPETITION-PANNES.md` sont ajoutés (indexés comme études / prompts).

## 4. Règles

1. **Aucun déplacement ni renommage** d'un fichier référencé par un script, un test, la page, `tablet-exclude.txt`, la CI ou le déploiement. Un document non référencé ne se déplace que si tous les liens Markdown vers lui sont mis à jour dans le même lot ; dans le doute, on indexe au lieu de déplacer.
2. Aucun changement de code de la page ni du serveur (le rangement ne touche que la documentation, `.gitignore` et l'index). Si un audit trouve un défaut de code, il le signale sans le corriger.
3. Ne jamais ajouter de PNG ; ne jamais toucher `COMPTE-RENDU-*.md` (ni contenu, ni suivi) ; aucune donnée personnelle (adresse e-mail, IP du réseau local, jeton, secret) dans un document publié : vérifier par recherche avant de rendre la main.
4. Les agents ne font ni `git add`, ni `git commit`, ni `push`, ni opération GitHub : l'orchestrateur s'en charge.
5. Faits seulement : tout ce qui est affirmé dans un README se retrouve dans un document ou un commit du dépôt. Ce qui n'est pas prouvé sur la machine est dit comme tel.
6. Vérifications avant de rendre la main (phase B et D) : `node examples/cncjs-touch/verify-project.cjs` ; `npx jest src/server/services/touch src/server/services/cncengine src/server/api grbl-simulator --coverage=false` ; tous les liens Markdown relatifs des fichiers touchés résolus.
7. Dis ce que tu n'as pas vérifié.

## 5. Livrables

- `master` = version installée + rangement, CI lancée.
- Étiquette `tablette-2026-11-21`, PR n° 6 fermée, branches de travail supprimées sur GitHub, `idees/F2-pause-degager` publiée.
- Compte rendu court à l'opérateur : ce qui a été rangé, où est quoi, ce qui reste (essais réels, F2, fichiers non suivis laissés).
