# Défauts retenus de la chasse du 2026-11-06 (base cecb3bc7)

Chaque défaut a un identifiant de chasseur (A sécurité commandes, B session/réseau, C écrans, D régressions — rapport complet de Codex dans `report-D-codex.md`, E serveur). « Preuve » = test qui échoue aujourd'hui (commités dans cecb3bc7, non enregistrés) ou chemin à reproduire d'abord par un test.

## Équipe F1 — serveur (`src/server/services/touch/**`, `src/server/api/**`)

| Id | Gravité | Défaut | Preuve / chemin | Correction attendue |
|---|---|---|---|---|
| D-1 / E-1 | sécurité machine | `program-check.js:564` suppose [0, $13x] pour un axe dont le bit `$23` est posé : faux « dans la course » (machine en X positif) et faux « hors course » (Grbl standard, [−$13x, 0]) ; le cadrage laser (`job-service.js:1265-1268`) s'appuie sur ce verdict | `__tests__/bughunt-e-1.test.js` ; chemin D-1 dans `report-D-codex.md` | Axe X/Y à bit `$23` posé : non vérifié (`unknown`, code `ETOUCH_CHECK_HOMING_DIRECTION`, texte aligné sur `touch/travel-check.js`), le cadrage refusé avec cette raison ; mettre à jour `program-check.test.js` (l. 163, 268) qui fige l'ancien comportement ; catalogue `touch-codes-catalog.js` + ligne i18n (fichier de messages machine) |
| A-1 | sécurité machine | Arrêter puis porte ouverte pendant l'attente du Hold : `halt.js` `wait()` sort sur `Door` sans `reset`, les blocs restent dans Grbl | `__tests__/bughunt-a-1.test.js` | `Door:0`/`Door:1` (arrêtée) → `reset` comme Hold:0 ; `Door:2/3` → continuer d'attendre (limite 5 s comprise) ; ne sortir sans reset que sur `Alarm` |
| A-2 | à corriger | `reserveSystemCommand` accepte une commande hôte sensible broche en marche | `__tests__/bughunt-a-2.test.js` | refuser si la broche tourne (`spindleOn`), même garde pour `wifiAction` |
| E-3 | à corriger | Reprise : `resume.js:276-287` préfixe `G0`/`G1` devant G28/G30/G92/G10/G43.1/G38.x → error:24/21 après le préambule | `__tests__/bughunt-e-3.test.js` | refuser la reprise sur une telle ligne (`ETOUCH_RESUME_FIRST_LINE`, raison claire) |
| B-1 | à corriger | Rotation du flux toutes les 60 s → « absent/restored » dans l'historique durable (120/h) | `__tests__/bughunt-b-1.test.js` | ne pas émettre/enregistrer absent/restored quand le même acteur se rattache dans la grâce |
| E-4 | mineur | Travail démarré depuis le PC : « start » sans fin dans l'historique | `__tests__/bughunt-e-4.test.js` | poser `r.job.started` dans `r.run` en gardant la décision documentée sur la reprise (TESTING.md l. 247) |
| E-5 | mineur | Ticket posé après fermeture du flux qui l'a demandé | `__tests__/bughunt-e-5.test.js` | refuser si le transport n'existe plus |

## Équipe F2 — page : session, réseau, commandes (`touch/app.js`, `job-stream.js`, `job-controls.js`, `wifi-settings.js`, `tablet-actions.js`, `real-history.js`, `job-dashboard.js` partie relais Pause seulement)

| Id | Gravité | Défaut | Preuve / chemin | Correction attendue |
|---|---|---|---|---|
| B-4 | bloquant (sécurité) | Page servie par `localhost` : `navigator.onLine=false` (Wi-Fi coupé) arrête flux, état et commandes ; rechargée hors ligne pendant un travail, Pause/Arrêter désactivés | `test-bughunt-b-4.cjs` ; vérification sur la Surface en cours | ignorer `navigator.onLine` quand l'API est en boucle locale ; ailleurs, simple indice |
| B-3 | à corriger | 401/403 du flux ou de `touch-job` : aucun renouvellement de session sur `index.html` (pas de socket), santé jamais refaite | `test-bughunt-b-3.cjs` | sur 401/403 : `available=false`, prévenir `app.js` qui renouvelle (`renewSession(reloadOnce)`) ; message « reconnectez-vous » si CNCjs a des utilisateurs |
| B-2 / E-2 | à corriger | Wi-Fi refusé à la tablette qui pilote : `wifi-settings.js` n'envoie pas `clientId` | `__tests__/bughunt-b-2.test.js` | envoyer `clientId`/`clientLabel` comme `job-controls.js:159-160` (et `tablet-actions.js`) |
| D-7 | à corriger | Réponse de renouvellement retardée qui réinstalle une ancienne session | chemin D-7 dans `report-D-codex.md` : écrire le test d'abord | ignorer la réponse si la session a changé entre l'envoi et la réponse |
| D-8 | à corriger | Garde de rechargement < 60 s : jeton obtenu mais page jamais initialisée | chemin D-8 : test d'abord | terminer l'initialisation sans recharger, ou recharger après la garde |
| B-5 | mineur | 403 texte brut en production traité comme « commande désactivée » / « HTTP 403 » | chemin B-5 | 401/403 sans corps JSON = session refusée dans ces modules |
| B-6 | mineur | Délais de reprise sur l'horloge murale | `test-bughunt-b-6.cjs` | `performance.now()` pour les délais |
| A-3 | mineur | Double appui sur Pause de Suivi atteint « Reprendre… » | chemin A-3 (`job-dashboard.js:27-31`, `:231`) | même gel 600 ms que `status-strip.js:107-114` |

## Équipe F3 — page : interface Performance et écrans (`touch/origin-preview.*`, `preview-gl.js`, `preview-3d.js`, `preview-inspect.js`, `job-dashboard.js` sauf le relais Pause, `status-strip.js`, `ui-2027.css`, `responsive.css`, `travel-check.js`, catalogues i18n)

| Id | Gravité | Défaut | Preuve / chemin | Correction attendue |
|---|---|---|---|---|
| C-3 | à corriger (régression lot O) | Carte d'origine : canvas 1 × 1 px (vue ouverte dans un cadre caché) | `test-bughunt-c-3.cjs` (Edge) | découvrir le cadre avant `open`, et/ou `ResizeObserver` sur la scène |
| D-5 | à corriger (régression) | Appui sur la vue 3D pendant un travail : lecture complète du programme pour une inspection masquée | chemin D-5 : test d'abord | pas d'inspection inline, aucune lecture de source pendant un travail, lecture annulable |
| D-4 | à corriger (régression cbde7cee) | Consulter un autre fichier dans Fichiers efface la géométrie complète du programme chargé | chemin D-4 : test d'abord | n'invalider qu'au changement du **programme chargé** (Q7b), pas du fichier consulté |
| D-2 | à corriger (régression lot D/O) | Origine visuelle : aperçu réutilisé sur le seul nom (ancienne révision) | chemin D-2 : test d'abord | comparer empreinte et identité |
| D-3 | à corriger | Promesse d'aperçu résolue à `null` gardée en cache | chemin D-3 : test d'abord | ne pas garder un résultat nul |
| D-6 | à corriger | Instruments : ligne acquittée fausse en reprise sans aperçu (206/206 au lieu de 801/1000) | chemin D-6 : test d'abord | utiliser `resume.total` |
| C-2 | à corriger | Bandeau : la colonne « Fichier » tombe à 0–56 px pendant un travail | `test-bughunt-c-2.cjs` (Edge) | largeur minimale avec points de suspension, ou « Machine » masqué en travail/pause ; ajouter ce cas au harnais |
| C-1 / D-9 | mineur | « course $130 inconnue. » non traduit en EN/ES | `test-bughunt-c-1.cjs` | littéraux au catalogue |

## Non retenus (soupçons, décisions documentées)

M5 envoyée en quittant l'assistant de mise en service sans démarrage (sens sûr, fixture artificielle) ; Arrêter en `Door:2/3` → reset immédiat (décision défendable) ; décimales à virgule en anglais (convention) ; `tablet-profile.js?v=prof14` (atténué par `maxAge:0`, mais à aligner par l'intégrateur) ; clientId présenté par un autre client (modèle de confiance documenté).
