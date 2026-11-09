# Tout ce qui peut se faire avant l'essai sur la vraie CNC (vendredi 2026-11-13)

Tu es l'orchestrateur. Branche `feat/ecrans-ergonomie` (dépôt `C:\Users\damou\Documents\claude\cncjs`), déjà poussée et déployée sur la Surface Pro (commit `91372563`, cache `v2n`). Tu écris en français. La CNC n'est pas branchée avant vendredi : tout se vérifie par tests, par le harnais et par le Grbl simulé.

## Objectif
Fermer tout ce qui ne demande ni la vraie machine, ni la RT, ni une décision de fusion de l'utilisateur, et préparer l'essai de vendredi pour qu'il soit court, sûr et concluant.

## Lots

| # | Lot | Rôle | Modèle | Pourquoi ce modèle |
|---|---|---|---|---|
| D | Décisions d'interface sur 3 points ouverts (ci-dessous), avec preuve dans le code | juge | **Fable 5.1** | meilleur jugement, indépendant des auteurs |
| C | Code : harnais + simulateur + textes décidés en D, tests, commit local | écrivain unique | **Opus 5.5** | code et outils fiables |
| R1 | Contre-revue sécurité / régression / RT v1 de C | relecteur | **Fable 5.1** | défauts subtils |
| R2 | Contre-revue lisibilité / i18n / harnais de C, captures jointes | relecteur | **Astra ultra** (`codex exec -s read-only`) | angle indépendant, rendu |
| X | Corrections de R1/R2, harnais strict complet, commit | écrivain | **Opus 5.5** | exécution |
| P | Protocole d'essai de vendredi (document) | rédacteur | **Fable 5.1** | sécurité machine, ordre des étapes |
| P2 | Relecture du protocole | relecteur | **Astra ultra** | second regard sécurité |
| F | Commit du protocole, des maquettes HTML/MD/JSON et des prompts ; état de fusion vers master (sans fusionner) | écrivain | **Opus 5.5** | git, prudence |

Un seul agent écrit dans le dépôt à la fois. P peut tourner pendant C (il n'écrit qu'un fichier neuf, sans commit).

## Points ouverts à trancher en D
1. **Courbe d'avance de Suivi v2** placée sous les corrections (`performance-v2.css`, `order:1`) pour que les boutons ne bougent pas entre repos et travail. Garder ou non ?
2. **« Vérifier un déplacement… »** (Préparer v2, `job-preparation.js`) : juste en « Vérification seule », trompeur si « Déplacement réel » est activé. Libellé dynamique selon le mode ? Lequel ?
3. **« $X et $H indisponibles : Travail en cours »** affiché pendant une alarme survenue en plein travail (écran Machine, `machine-limits.js` / ligne raison $X/$H). Formulation plus claire, sans changer la garde ?

## Lot C, contenu
- **Harnais** (`browser-run.cjs`, étape `screens`) : capturer « alarme après arrêt avec bilan affiché » (transition fixture travail → `idle` + `Alarm` + `jobStopped:true`, attendre le bilan visible), en v2 FR sombre et ES clair agrandi, et un fichier **avec aperçu** pour prouver le bilan « 6 / 7 » (lignes du fichier, comme la jauge). Le contrôle de rognage doit couvrir les descendants de `#home-v2-info` (fondu toléré, ligne coupée nette refusée). Aucune exception nouvelle.
- **Simulateur** (`grbl-simulator/grbl-simulator.js`) : un feed hold `!` doit rester en Hold (mouvement figé, lignes suivantes non exécutées, pas de retour en Run) jusqu'à `~`, comme Grbl 1.1 ; `~` reprend le mouvement là où il était. Test dans `grbl-simulator/__tests__`. Le simulateur n'est jamais branché à une machine.
- **Textes** décidés en D (i18n FR/EN/ES, test pour chacun).
- Cache : `v2n` → `v2o` pour les seuls `?v=`, `ADVANCED_VERSION` et tests (**attention** : ne jamais toucher les classes CSS `v2m-*`, `v2n-*` ni la regex `V2_NODE`).

## Lot P, contenu : `examples/cncjs-touch/design/PROTOCOLE-ESSAI-CNC-V2.md`
Protocole pas à pas pour l'opérateur, devant la machine, sur la Surface Pro en v2 : préparation (arrêt d'urgence à portée, broche, outil, matière, zone dégagée), connexion, vérifications à vide (sans outil ni broche d'abord), déclaration du type CNC, prise d'origine, origine XY/Z, palpage (si utilisé), un petit fichier connu à rapides 25 %, Pause / Reprendre / Arrêter, alarme volontaire (fin de course) si sûre, retour en v1 Éco possible. Pour chaque étape : ce qu'on fait, ce qu'on doit voir à l'écran, ce qui fait arrêter l'essai. Une grille à cocher et la liste des captures à prendre. Rien que l'opérateur n'ait à deviner.

## Règles
- Sécurité machine d'abord : aucun changement de ce qu'un bouton envoie, de ses gardes, de son état actif/désactivé/masqué. Changements de texte et d'apparence seulement, sauf le simulateur (outil de test).
- Aucune régression v1 Éco (RT, Chromium 106) : pas de `:has()`, `color-mix`, `dvh`.
- Chaque correctif a un test qui échoue sans lui ; aucune assertion retirée.
- Interdit : push, merge, déploiement, toute commande vers une machine, la RT ou le réseau (sauf loopback du harnais), `git reset/stash/checkout` de fichiers d'autrui, `src/server`, `COMPTE-RENDU-*.md`, `design/reglages/`, contourner les hooks. Les PNG des maquettes ne sont jamais commités.
- Vérifications : `node examples/cncjs-touch/verify-project.cjs` (N/N), `npx jest src/server/services/touch`, `node grbl-simulator/__tests__/*.test.js` si présents, harnais strict complet (0 violation, 0 excepted, every step passed, aucun msedge `cnc-browser-run` restant).

## Compte rendu final (en français)
Par lot : fait, preuve (commande + résultat exact), captures ; décisions de D avec leur raison ; ce qui reste pour vendredi ; état de fusion (conflits éventuels avec master, rien fusionné) ; commits locaux non poussés.
