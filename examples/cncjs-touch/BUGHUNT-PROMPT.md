# Chasse aux bugs de toute l'interface CNCjs Touch (2026-11-06)

Prompt commun aux chasseurs. Chaque chasseur reçoit ce texte plus la section de son angle.

## Contexte

Dépôt `C:\Users\damou\Documents\claude\cncjs`, branche `feat/touch-profiles` à `cbde7cee` (ne change pas de branche, ne commite pas). Interface : `examples/cncjs-touch/touch/` (vanilla JS en IIFE, ES2017 pour Chromium 106). Serveur : `src/server/services/touch/`, `src/server/api/api.touch.js`, `src/server/api/api.commands.js`. Deux tablettes : Surface RT (laser, 1366 × 768, Chromium 106, sans GPU) et Surface Pro 3 (CNC, 1366 × 911 CSS à DPR 1,58, Chromium 156, GPU), chacune avec son serveur CNCjs local. La nuit précédente, une nouvelle interface Performance (lots V, D, O) et plusieurs corrections ont été intégrées : le but premier est de vérifier qu'**elles n'ont rien cassé**, puis de trouver tout autre défaut.

Lis d'abord `examples/cncjs-touch/BUGHUNT-MAP.md` (la carte : écrans, modules, chemins de commande, états, changements récents, trous de couverture, 20 zones à risque), puis les documents qu'elle cite pour ton angle.

## Règles

- **Aucune commande à une machine**, aucun accès aux tablettes (pas de ssh), aucun push. Tu lis le code et tu lances les tests sur ce PC.
- Tu ne modifies **aucun fichier existant**. Pour prouver un défaut, tu peux créer un test qui échoue, nommé `examples/cncjs-touch/test-bughunt-<angle>-<n>.cjs` (ou un test Jest `src/server/services/touch/__tests__/bughunt-<angle>-<n>.test.js`), non commité.
- Un défaut n'est rapporté que s'il a une **preuve** : un test qui échoue, ou un chemin d'exécution précis (fichier:ligne → fichier:ligne) avec l'entrée qui le déclenche et la sortie fausse. « Ça pourrait » sans chemin n'est pas un défaut : mets-le en « soupçon ».
- Ne rapporte pas une décision documentée comme un défaut (spécification § 13, PROFILES.md, README) ; tu peux la contester à part.
- Commandes utiles : `node examples/cncjs-touch/verify-project.cjs` (121/121 attendu), `npx jest src/server/services/touch src/server/api/__tests__/api.touch.test.js`, harnais `node examples/cncjs-touch/browser-run.cjs --strict --browser "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --out <dossier hors dépôt>` (un seul à la fois : préviens dans ton rapport si tu l'as lancé ; à la fin, arrête les `msedge.exe` dont la ligne de commande contient `cnc-browser-run`).

## Format du rapport

Pour chaque défaut : identifiant `<angle>-<n>`, gravité (**sécurité machine** / **bloquant** / **à corriger** / **mineur**), une phrase, scénario concret (entrée → sortie fausse), preuve (test ou chemin fichier:ligne), correction proposée (sans l'appliquer), et si c'est une régression de la nuit (commit) ou un défaut ancien. Puis les soupçons non prouvés, puis ce que tu as vérifié sans défaut. En français, factuel, sans remplissage.

## Angles

### A. Sécurité des commandes, Pause et Arrêter (Fable, effort élevé)
Tous les chemins de la section 2 de la carte. Pause/Arrêter toujours joignables et efficaces dans chaque état (dégradé, alarme, session expirée, flux interrompu, poste large, carte d'origine montée, vue 3D ouverte, clavier virtuel ouvert) ; aucune commande envoyée deux fois, rejouée après reconnexion ou envoyée par un module d'affichage ; gestes de caméra et jog ; tickets de confirmation ; garde du pilote F5 ; commandes .cncrc pendant un travail.

### B. Session, réseau, flux et reprise (Opus)
Renouvellement de session (`app.js`, `job-stream.js`) dans les deux modes (avec et sans socket, avec et sans utilisateurs CNCjs), 401/403 sur chaque API, flux `touch-events` (rotation, coupure, reprise), page restée ouverte des jours, Wi-Fi de la tablette pilote (`clientId`), changement de réseau, serveur redémarré pendant que la page est ouverte, deux tablettes en même temps.

### C. Écrans, mise en page et poste large dans un vrai navigateur (Opus)
Lancer le harnais et des scénarios CDP à 1366 × 768 (RT), 1366 × 911 et 1728 × 1152 (poste large, GPU forcé par CDP comme le fait le harnais) : chaque écran dans chaque état, bascule `perf-wide` (rotation, redimensionnement, probe GPU tardive), « une seule vue 3D à la fois », carte d'origine, bandeau Pause/Arrêter au-dessus de tout, textes tronqués ou cachés, i18n EN/ES, mode texte large, clavier virtuel.

### D. Régressions des changements de la nuit (Codex, raisonnement ultra)
`git diff 59129a0c..cbde7cee` et `git diff e59d11f9..59129a0c` : pour chaque fonction modifiée, chaque appelant et chaque hypothèse cassée (la carte, section 4). En particulier : `travel-check.js` et `program-check.js` côté serveur pour `$23` (verdicts contradictoires), géométrie complète libérée trop tôt, `tablet-profile.js` et les suffixes de cache, `job-stream.js` sans jeton, `arrange()` du poste large, RT en Performance (rendu logiciel) inchangée.

### E. Serveur touch (Fable, effort élevé)
`src/server/services/touch/**` et les API : `program-check.js` (course, `$23`, unités, repères), `job-service.js` (confirmations, reprise, cadrage laser, F5), `wifi.js` et `wifiAction`, `system-command`, `machine-profile.js`, `resume.js`, sidecars d'aperçu, historique. Cherche les cas limites, les états concurrents (deux clients, rapport tardif, redémarrage), les entrées non validées.
