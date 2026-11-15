# CONSTATS — liste consolidée des défauts du chantier A (phase 2, 2026-11-15)

Auteur : agent « plan des corrections ». Base : `feat/refonte-ui`, HEAD `20aeac36`. Sources : audits `audit/A1…A4`, contre-vérifications `audit/V1…V4` (les quatre sont présentes), `FIRMWARE.md`, `TEXTES.md`, `ERGONOMIE.md`, `audit/MESURES.md`, `audit/COMMANDES-MACHINE.md`. Le détail de chaque correction est dans `PLAN-CORRECTIONS.md`.

Abréviations des chemins de preuve : `S/` = `src/server/services/touch/__tests__/`, `P/` = `examples/cncjs-touch/`. « chemin » = preuve par lecture d'un chemin d'exécution, sans test.

Gravité : celle retenue après contre-vérification. Quand V1 (Opus) et V4 (Astra) divergent, les deux sont notées ; le plan range alors le constat avec les corrections de sûreté.

Suite : « serveur Sx » et « page Px » renvoient aux lots de `PLAN-CORRECTIONS.md` ; « refonte » = critère d'acceptation pour `SPEC-REFONTE.md` (le lot L de la refonte convertit alors le test de preuve) ; « essai » = `PROTOCOLE-ESSAI.md` ; « laissé » = non corrigé, avec la raison.

## 1. Défauts confirmés

| Id | Défaut | Sources | Gravité | Verdict | Preuve | Tn | Suite | Commit |
|---|---|---|---|---|---|---|---|---|
| C-01 | Un programme dont le dépassement de course est prouvé part quand même ; côté page, Confirmer s'active sur la seule case cochée | A1-1 = A2-1 | sécurité machine | confirmé (V1, V2, V4) | `S/bughunt-A1-1.test.js`, `P/test-bughunt-A2-1.cjs` | T2, T15 | serveur S3 (D1) ; page P1 ; bouton de dérogation : refonte L5 | |
| C-02 | Le décalage de travail rapporté (`WCO`) n'est jamais recoupé avec `$#` : le contrôle, le départ, la plaque et le cadrage s'appuient sur un décalage non prouvé | A1-2 = A2-2 (partie décalage) | sécurité machine | confirmé avec réserve : la nature du danger dépend de l'essai E-B | `S/bughunt-A1-2.test.js`, `S/bughunt-A2-3.test.js` | T3, T2 | serveur S2 (D2) ; essai | |
| C-03 | Palpage au bloc : `$#` est lu mais le repère actif n'est pas recoupé ; les `G38.3` partent en coordonnées de travail non prouvées | A1-7 = A4-1 | sécurité machine | confirmé avec réserve (E-B) | `S/bughunt-A1-7.test.js` | T3, T8 | serveur S2 (D2) | |
| C-04 | X et Y (bit `$23` posé) ne sont jamais vérifiés, même quand la prise d'origine a appris la convention : aucun dépassement X ou Y ne peut être prouvé | A1-3 = A2-2 (partie `$23`) | sécurité machine | confirmé avec réserve : `unknown` reste juste quand la convention n'est pas apprise | `S/bughunt-A1-3.test.js` | T3, T2 | serveur S3 | |
| C-05 | Après un redémarrage de la carte (MPos 0 sur place, référence perdue), Déverrouiller suffit pour démarrer ou reprendre à une ligne avec un G54 devenu faux | A1-4 | sécurité machine | confirmé ; le refus est une décision nouvelle, prise dans le plan (§ 1.5) | `S/bughunt-A1-4.test.js` | T2 | serveur S3 | |
| C-06 | Aucune marge avant la limite logicielle : le contrôle des programmes tolère +0,001 mm vers l'extérieur, un pas peut viser la borne exacte | A1-5 = A4-5 = FW-R2 | sécurité machine (programme) ; à corriger (pas) | confirmé avec réserve : marge du seul côté opposé à la prise d'origine, valeur provisoire (E-A) | `S/bughunt-A1-5.test.js` | T2 | serveur S3 ; essai | |
| C-07 | Zéro Z à la plaque : la cible du `G38.2` n'est comparée à aucune course (plaque mince : cible sous −130, `ALARM:2`, redémarrage) | A1-6 (course) | sécurité machine | confirmé (réaliste sur ce montage) | `S/bughunt-A1-6.test.js` (cas 1) | — | serveur S4 | |
| C-08 | Arrêter juste après le départ du zéro Z à la plaque : aucun feed hold, la descente continue, le verrou est rendu | V1-2 = V4-N1 | sécurité machine | nouveau, confirmé par test | `S/bughunt-V1-2.test.js` | — | serveur S4 | |
| C-09 | Un arrêt venu de Socket.IO (`gcode:stop`, `stop`, `feeder:stop`, `feedhold`) entre deux lignes d'un palpage ne touche pas la séquence : la ligne suivante part (bloc et plaque) | A4-3 | sécurité machine | confirmé ; prouvé par test pour la plaque, par lecture pour le bloc | `S/bughunt-V1-3.test.js` | reste ouvert § 3 | serveur S4 | |
| C-10 | Toute page (ici le Chrome du PC) éteint l'écran du kiosque ; le kiosque éveillé ne le rallume pas et ses touchers à l'aveugle atteignent les commandes | A3-1 = A1-10 | sécurité machine (A3, V3) ; bloquant (A1, V1) | confirmé | `S/bughunt-A1-10.test.js`, `S/bughunt-A3-1.test.js`, `P/test-bughunt-A3-1.cjs` (scénario 1) | T1 | serveur S5 (D3) ; page P2 | |
| C-11 | « Laser Off » du PC (`lasertest:off`, libre pour tous) écrit `M5S0` au milieu d'un programme CNC lancé par la tablette | V3-5 | sécurité machine | nouveau, confirmé par test | `S/bughunt-V3-5.test.js` | — | serveur S5 | |
| C-12 | Libérer le pilotage pendant un palpage ouvre le port à Socket.IO jusqu'au superviseur suivant (100 ms) | A4-2 | à corriger (V1) ; sécurité machine (V4) | confirmé avec réserve (fenêtre étroite) | chemin | — | serveur S4 | |
| C-13 | Un départ confirmé survit à la perte du flux ou du pilotage pendant la relecture du fichier ; un Arrêter dans cette fenêtre répond « Aucun travail à arrêter » | V4-N2 | à corriger (V1) ; sécurité machine (V4) | confirmé par lecture | chemin | — | serveur S4 | |
| C-14 | Après un redémarrage de CNCjs, personne ne relit la version Grbl ; la relecture est refusée en alarme et la page la grise en dur | A1-8 = A2-7 | bloquant | confirmé avec réserve (une sortie cachée existe) | `S/bughunt-A1-8.test.js`, `P/test-bughunt-A2-6.cjs` | T10 | serveur S5 (D4) ; page P1 ; la chaîne guidée : refonte L2 | |
| C-15 | Après un redémarrage de CNCjs pendant la veille, ni le rechargement ni un toucher ne rallument l'écran | A3-2 | bloquant | confirmé avec réserve (se répare à la veille suivante) | `S/bughunt-A3-1.test.js` (cas 2), `P/test-bughunt-A3-1.cjs` (scénario 2) | T1, T14 | serveur S5 (D3) | |
| C-16 | Pause dont la reprise est refusée : Suivi dit seulement « Travail en pause. », la raison du serveur n'est visible nulle part | A2-10 | bloquant | confirmé (Edge sans tête, rendu v1) | `P/test-bughunt-A2-10.cjs` | P8 | page P3 | |
| C-17 | Zéro Z à la plaque non surveillé : perte du flux, prise de pilotage, rapports périmés et délai dépassé n'arrêtent rien | A1-6 (surveillance) | à corriger | confirmé (descente bornée à la recherche) | `S/bughunt-A1-6.test.js` (cas 2 et 3) | — | serveur S4 | |
| C-18 | Un zéro (plaque ou « zéro ici ») posé sur une machine non référencée est accepté, puis faux après la prise d'origine, sans rien qui le dise | V1-1 | à corriger | nouveau, confirmé par test | `S/bughunt-V1-1.test.js` | P8 | serveur S3 | |
| C-19 | Un pas peut partir pendant une prise d'origine annoncée, avant le premier rapport `Home` | A4 (soupçon), tranché par V1 | à corriger | confirmé par lecture | chemin (`job-service.js:1117-1120`, `motion.js:362-393`) | — | serveur S4 | |
| C-20 | Le PC peut fermer le port série que la tablette pilote, même pendant un travail | A3-5 | à corriger (V3) ; sécurité machine (A3, V4) | confirmé avec réserve (clic délibéré ; la tablette rouvre le port) | `S/bughunt-A3-2.test.js` (cas `close`) | — | serveur S5 | |
| C-21 | `sleep` (`$SLP`) est libre pour tous malgré le bail | A3-6 | à corriger | confirmé avec réserve | `S/bughunt-A3-2.test.js`, `S/bughunt-V3-5.test.js` (cas 3) | — | serveur S5 | |
| C-22 | Enveloppe du palpage XYZ symétrique, plus large que le trajet : refus à tort près des bords (les chiffres de T7) | A1-11 | à corriger | confirmé | `S/bughunt-A1-11.test.js` | T7, T8 | serveur S6 | |
| C-23 | Le code de l'alarme est effacé par la bannière qui la suit ; hors travail, rien n'est journalisé | A1-12 | à corriger | confirmé | chemin | T2, P8 | serveur S6 | |
| C-24 | Un pas refusé par Grbl (`error:15`) après un HTTP accepté reste « envoyé à la machine » | A4-7 | à corriger | confirmé par lecture | chemin | — | serveur S6 ; page P3 | |
| C-25 | Les simulateurs et le faux Grbl de Jest ne modélisent aucune anomalie de la carte | A4-13 = SIM (A1, A5, V1) | à corriger | confirmé | chemin | T2, T3 | serveur S1 | |
| C-26 | Le test S38 ne distingue pas un rapport de deux après l'`ok` | A4-12 | à corriger | confirmé par mutant | mutant `+1` (V1) | reste ouvert § 3 | serveur S4 | |
| C-27 | Sonde : refus écrit au-dessus d'un « Palper… » resté actif ; un deuxième toucher laisse l'écran identique | A2-3 | à corriger | confirmé avec réserve | `P/test-bughunt-A2-4.cjs` (a) | T6, T7 | refonte (L1, L3) | |
| C-28 | « Diagnostic de l'entrée » ne montre ni les étapes ni l'état du test du contact, et ne suggère jamais la broche à la masse | A2-4 | à corriger | confirmé | `P/test-bughunt-A2-4.cjs` (b) | T6, T9 | serveur S5 (champs D4) ; refonte L3 | |
| C-29 | La carte « Zéro Z avec une plaque » et « Reprendre à une ligne » disparaissent de Suivi sans raison affichée | A2-5 = RQ-7 | à corriger | confirmé | `P/test-bughunt-A2-2.cjs` | T11 | refonte (L3, P8) | |
| C-30 | Pilotage : boutons actifs sur l'appareil qui ne pilote pas, refus renvoyé au bandeau, refus resté affiché après la libération | A2-6 | à corriger | confirmé avec réserve | `P/test-bughunt-A2-5.cjs` (a, b, c) | T12 | (c) page P3 ; (a, b) refonte (L1, L2) | |
| C-31 | Refus de préparation muets : assistant de mise en service, bandeau, macros, « Opération en cours… » | A2-8 | à corriger | confirmé | `P/test-bughunt-A2-8.cjs` | T6, T12 | assistant et `prepare()` : page P3 ; bandeau, macros : refonte L1 | |
| C-32 | « Reprendre à une ligne » vise la sélection de la bibliothèque, pas le programme arrêté ; le plan ne nomme pas le fichier | A2-9 | à corriger | confirmé avec réserve | `P/test-bughunt-A2-9.cjs` | P8 | page P3 | |
| C-33 | Le premier Ctrl+Maj+R sur un kiosque en veille est annulé par l'écran de veille | A3-3 | à corriger | confirmé avec réserve (cause de T14 non prouvée) | `P/test-bughunt-A3-1.cjs` (scénario 3) | T14 | page P2 | |
| C-34 | Suivi affiche 100 % pendant Run dès que toutes les lignes sont acquittées | A4-8 | à corriger | confirmé par test | `P/test-bughunt-V2-1.cjs` (a) | suite de T15 | page P3 | |
| C-35 | Une alarme, une prise d'origine ou un déverrouillage vus avant le premier repos laissent la v1 jusqu'au rechargement | ERG-8 | à corriger | confirmé (V3) | `P/test-bughunt-V3-1.cjs` | — | page P2 | |
| C-36 | Une prise d'origine partielle vue de l'extérieur marque tous les axes référencés | A1-9 | mineur | confirmé, sans effet sur la LUNYEE (`$HX` y fait trois axes) | chemin | T3 | laissé : aucun effet sur la machine visée | |
| C-37 | Programme CNC : S au-dessus de `$30` jamais signalé ; correction de broche sans effet | A1-13 | mineur | confirmé | chemin | — | serveur S6 (information) | |
| C-38 | « Arrêt broche (M5) envoyé » alors que la ligne est jetée en alarme | A1-14 | mineur | confirmé | chemin | — | serveur S6 | |
| C-39 | L'arrêt différé de `halt.js` n'est pas lié au démarrage de la carte : un reset tardif après une bannière | A4-4 | mineur (V1) ; sécurité machine (V4) | confirmé avec réserve (entrelacement en 50 ms) | chemin | — | serveur S4 | |
| C-40 | Refus du palpage au bloc restés en français en EN / ES (« Palpage refusé : … », « inconnue », « choisissez inconnu ») | A2-11 = A4-11 | mineur | confirmé | `P/test-bughunt-A2-7.cjs` | T6, T7 | serveur S6 (+ catalogue) ; conversion du test : page P1 | |
| C-41 | En EN / ES, l'erreur HTTP d'un palpage échoué perd « origine inchangée / refaire la prise d'origine » | A4-6 | mineur | confirmé avec réserve (Sonde le redit au premier instantané) | chemin | — | serveur S6 ; page P3 | |
| C-42 | `screen-probe-preparation` construit et chargé sur la page réelle, inaccessible | A2-12 | mineur | confirmé | chemin | — | refonte L3 | |
| C-43 | Le refus de Sonde reste affiché après un déplacement qui en a changé la cause | A2-13 | mineur | confirmé avec réserve | chemin | T6, T7 | refonte L1 | |
| C-44 | Le pavé numérique ne peut pas vider un champ facultatif | A2-14 | mineur | confirmé | chemin | T5 | page P3 | |
| C-45 | « Macros… » grisé sans raison visible | A2-15 | mineur | confirmé | chemin | — | page P3 | |
| C-46 | Rapides grisés sans raison ; la raison de l'arrêt broche n'est pas publiée par le serveur | A2-16 | mineur | confirmé avec réserve | chemin | — | serveur S6 (publier `spindleStopReason`) ; affichage : refonte | |
| C-47 | Deux gabarits de codes que le serveur n'émet jamais | A2-17 | mineur | confirmé | chemin | — | page P1 | |
| C-48 | Dans le dialogue Pilote, la cause d'un refus de prise de main est remplacée par « touchez Pilote… » | A2-18 | mineur | confirmé avec réserve (inatteignable depuis la page) | chemin | T12 | page P3 | |
| C-49 | L'onglet Système annonce la version installée, pas celle qui tourne | A3-4 | mineur | confirmé | chemin | T14 | page P2 | |
| C-50 | Le mot de passe Wi-Fi passe dans les arguments de `nmcli` | A3-7 | mineur | confirmé avec réserve | chemin | — | laissé (§ 7 du plan) | |
| C-51 | Rien du kiosque de la Surface n'est dans le dépôt (URL, `.xinitrc`, déploiement) | A3-8 | mineur | confirmé | chemin | T1, T14 | laissé pour ce lot ; l'URL est contrôlée par l'essai | |
| C-52 | Le temps d'une exécution est réutilisé par la suivante quand le PC relance le même programme | A4-9 | mineur | confirmé avec réserve | `P/test-bughunt-V2-1.cjs` (b) | — | page P3 | |
| C-53 | La barre de progression emploie l'estimation d'une autre version du même fichier | A4-10 | mineur | confirmé par test | `P/test-bughunt-V2-1.cjs` (c) | — | page P3 | |
| C-54 | Le test S27 annonce plus de refus qu'il n'en appelle | A4-14 | mineur | confirmé | chemin | — | serveur S4 | |
| C-55 | `G38.2` reste le mode modal après un zéro Z à la plaque échoué | A1 soupçon 4, tranché par V1 | mineur | chemin réel, effet faible | chemin | — | serveur S4 | |
| C-56 | Arrêter répond « Aucun travail à arrêter » sur un rapport périmé qui dit Idle | A1 soupçon 6, tranché par V1 | mineur | chemin réel | chemin | — | laissé (§ 7 du plan) | |
| C-57 | Le contrôle des courses ne lit pas `Z-1 40` comme Grbl (qui ôte les espaces) | V4-N3 | mineur (V1) ; sécurité machine (V4) | confirmé par lecture ; entrée irréaliste pour Vectric | chemin | — | serveur S3 | |
| C-58 | `G49` dans un programme n'est pas traité comme un changement de décalage quand un TLO est hérité | V4-N4 | mineur | confirmé par lecture | chemin | — | serveur S3 | |
| C-59 | Une reprise à une ligne hérite du mode d'avance de la carte (`G93`) | V4-N5 | mineur (V1 : décision documentée) ; sécurité machine (V4) | confirmé par lecture | chemin | — | serveur S4 | |
| C-60 | Les commandes Socket.IO ignorent une réservation de maintenance (Wi-Fi, mises à jour) | V4-N6 | mineur | confirmé par lecture | chemin | — | serveur S4 | |
| C-61 | Une ligne `$x=val` dans un fichier traverse le contrôle sans raison | V4-N7 | mineur | confirmé par lecture ; entrée irréaliste | chemin | — | serveur S3 | |
| C-62 | `0x9E` (bascule de la broche pendant une retenue) est libre pour tous | V4-N8 | mineur | confirmé par lecture | chemin | — | serveur S5 | |
| C-63 | Un refus du serveur renvoie à « l'étape 0 de HANDOFF.md » | TXT-HANDOFF | mineur | confirmé avec réserve (le remède de TEXTES est faux) | chemin | — | serveur S6 (+ catalogue) | |
| C-64 | Les textes de `startup.js` et de `#cnc-boot` ne sont qu'en français | TXT-STARTUP | mineur | confirmé | chemin | — | page P2 | |
| C-65 | Commentaire d'en-tête de `motion.js` périmé (pas jusqu'à 100 mm) | RQ-6 | mineur | confirmé | chemin | — | serveur S6 | |
| C-66 | « ↻ Actualiser » créé puis caché sur la page réelle | RQ-8 | mineur | confirmé | chemin | — | refonte | |
| C-67 | L'assistant de mise en service s'ouvre seul sur tout navigateur neuf | A2-S4 | mineur | confirmé par lecture | chemin | — | refonte L2 | |
| C-68 | `PERFORMANCE-V2-USAGE.md` l. 33 contredit le code sur l'état inconnu à l'ouverture | V3-3 | mineur | confirmé | `P/test-bughunt-V3-1.cjs` (témoin) | — | document, par l'orchestrateur, avec C-35 | |
| C-69 | Le test broche de la mise en service n'a aucune surveillance (flux perdu : la broche tourne) | A1 soupçon 10, tranché par V1 | mineur | chemin réel | chemin | — | idée → `IDEES.md` | |
| C-70 | Le `clientId` du pilote est publié et peut être rejoué par une autre page de la même session | A1 soupçon 11 | mineur | par conception (le bail protège des maladresses) | chemin | — | laissé | |

### Tests de preuve et leur devenir

| Test de preuve | Constats | Devenir |
|---|---|---|
| `S/bughunt-A1-2`, `S/bughunt-A2-3`, `S/bughunt-A1-7` | C-02, C-03 | S2 : convertis dans `work-offset.test.js` et `block-probe.test.js`. Les attendus de `bughunt-A2-3` sont réécrits (d'abord « non prouvé », puis prouvé), comme le demande V4. |
| `S/bughunt-A1-1`, `-A1-3`, `-A1-4`, `-A1-5`, `-V1-1` | C-01, C-04, C-05, C-06, C-18 | S3 : `start-travel.test.js`, `program-check.test.js`, `reference-guard.test.js`, `motion.test.js`. |
| `S/bughunt-A1-6`, `-V1-2`, `-V1-3` | C-07, C-08, C-09, C-17 | S4 : `plate-probe.test.js` (nouveau) et `index.test.js`. |
| `S/bughunt-A1-8`, `-A1-10`, `-A3-1`, `-A3-2`, `-V3-5` | C-14, C-10, C-15, C-20, C-21, C-11 | S5 : `settings-read.test.js`, `api/__tests__/api.touch.test.js`, `backlight.test.js`, `control.test.js`, `cncengine/__tests__/control-hook.test.js`. |
| `S/bughunt-A1-11` | C-22 | S6 : `block-probe.test.js`. |
| `P/test-bughunt-A2-1`, `-A2-6`, `-A2-7` | C-01, C-14, C-40 | P1. |
| `P/test-bughunt-A3-1`, `-V3-1` | C-10, C-15, C-33, C-35 | P2. |
| `P/test-bughunt-A2-8`, `-A2-9`, `-A2-10`, `-V2-1`, `-A2-5` (partie c) | C-31, C-32, C-16, C-34, C-52, C-53, C-30 (c) | P3. |
| `P/test-bughunt-A2-2`, `-A2-4`, `-A2-5` (parties a et b) | C-29, C-27, C-28, C-30 | Transmis à la refonte : ils restent non commités et rouges jusqu'au lot L qui traite leur écran, qui les convertit. |
| `P/test-bughunt-V3-2` | piste C3 de `MESURES.md` | Transmis au chantier C (optimisation) avec C1. |

Les fichiers `bughunt-a-*`, `-b-*`, `-e-*` (Jest) et `test-bughunt-c-*`, `-f3` (page) sont des tests commités d'un lot antérieur : ils ne sont pas concernés.

## 2. Soupçons non tranchés

| Id | Soupçon | Source | Ce qui le trancherait | Suite |
|---|---|---|---|---|
| Q-01 | Quand la carte rapporte `WCO:0,0,0` après `$H`, le décalage exécuté est-il nul lui aussi ? | A1 soupçon 1, FIRMWARE § 3.b | essai E-B | essai. D2 est conçu pour être sûr dans les deux hypothèses. |
| Q-02 | `$27=2` : l'interrupteur opposé est-il à course − 2 mm ? Le déplacement continu s'arrête à course − 1 mm | A1 soupçon 2 | essai E-A | essai |
| Q-03 | Un `$J=` hors limite donne-t-il `error:15` ou `ALARM:2` sur cette carte ? | A1 soupçon 3 | essai E-A | essai |
| Q-04 | Un reset au repos redémarre-t-il la carte (référence perdue à chaque arrêt d'un palpage) ? | A1 soupçon 8 | essai E-1 | essai |
| Q-05 | La carte envoie-t-elle des rapports `Home` pendant le cycle ? (`homeMpos` en dépend, donc C-04) | A1 soupçon 9 | essai E-D | essai. Sans rapport `Home`, X et Y restent `unknown` : comportement sûr. |
| Q-06 | `homed` vrai sans cycle (un `$H` perdu sur la ligne, puis un Idle une seconde après) | A1 soupçon 5 | essai E-D | laissé : entrée improbable, et le durcissement dépend de Q-05 |
| Q-07 | `G38.3` sans contact : `[PRB:…:0]` sans alarme sur cette carte ? Les cinq trajets de liaison du XYZ en dépendent | reste ouvert § 3, A4 | essai E-F | essai |
| Q-08 | Le `G0` de nettoyage après un palpage au bloc arrêté part sans attendre son `ok` | A4 soupçon | un cas où ce `G0` est refusé | laissé |
| Q-09 | Relais par `click()` vers des boutons cachés et `inert` : Chromium 106 (RT) le déclenche-t-il ? Enjeu : Pause et Arrêter du bandeau sous un dialogue | A2-S1 | ouvrir `refonte/A2/inert.html` dans un Chromium 106 | essai. La correction sûre (appels directs) est faite de toute façon : page P3. |
| Q-10 | Bascule v1 → v2 en pleine saisie | A2-S2 | étape du harnais | refonte (une seule organisation) |
| Q-11 | Cause réelle de T14 : touche annulée par la veille (C-33) ou touche jamais reçue par Chromium (`xdotool --window`) | A3-S2, V3 | essai sur la Surface, kiosque éveillé puis en veille | essai |
| Q-12 | Rechargement envoyé avant que Node écoute, après `pm2 restart` | A3-S1 | horodater le démarrage | essai |
| Q-13 | Plafond de 8 flux : des onglets du PC privent le kiosque de flux | A3-S3 | test Jest à 8 flux | laissé (non observé) |
| Q-14 | Mise à jour de `chromium` pendant que le kiosque tourne | A3-S4 | journal apt de la Surface | laissé (hors dépôt) |
| Q-15 | Kiosque ouvert sur l'adresse Wi-Fi plutôt qu'en boucle locale | A3-S5 | lire `~/.xinitrc` | essai (condition de D3) |
| Q-16 | Paquet du flux plus gros que le tampon d'écriture | A1 soupçon 7 | mesure | laissé : 8,8 ko mesurés au plus ; à remesurer après les champs ajoutés (§ 4 du plan) |

## 3. Réfutés ou sans objet

| Élément | Source | Verdict |
|---|---|---|
| Piste 11 (a) : Démarrer / Pause / Arrêter de Suivi relaient vers des boutons cachés | § 4.2, A2, A4 | Réfuté comme défaut dans Edge 157 ; reste Q-09. |
| Aide d'alarme « Reset dans CNCjs au PC » | A2-S3 | Réfuté : l'aide est exacte. Un bouton de reset serait une fonction nouvelle : `IDEES.md`. |
| Deux refroidissements de 600 ms | A2-S5 | Réfuté : la reprise passe par un dialogue à case. |
| Ticket `set-origin` et rotation du flux | A2-S6 | Réfuté : le ticket est compté par `ticketPending`. |
| Contrat « deux rapports Idle » de `quiet()` | A4 soupçon | Réfuté : seul le commentaire est imprécis. |
| Pause pendant un palpage au bloc = arrêt définitif | RQ-1 | Décision documentée ; le libellé est du ressort de la refonte. |
| `zeroZ` absent de la liste des actions liées au flux côté page ; `load` sans flux ; `open` sans garde ; gestes incohérents | RQ-2, RQ-3, RQ-4, RQ-5 | Réfutés (sans effet) ou ergonomie (refonte). |
| `reset` libre pour tous pendant un travail de la tablette | A3-S8 | Décision F5 ; contestation seulement notée. |
| Les corrections proposées pour D3 se contredisent (réveil distant refusé ou exigé) | V3-4 | Tranché par la conception de D3 : le serveur accepte tout réveil, la page distante n'en envoie pas. |
| Les suffixes `?v=` causent T14 | T14, MESURES | Réfuté : `max-age=0` et ETag font revalider chaque fichier. La valeur de cache unique reste un gain d'entretien (lot L1 de la refonte). |
| Mise en veille X ou DPMS comme cause de T1 | A3-S7 | Peu probable (lecture `brightness = 0`), non tranché, hors dépôt. |

## 4. Hors chantier A

| Élément | Source | Suite |
|---|---|---|
| C1 : `wifi-settings.js` réécrit `disabled` sur tous ses boutons à chaque paquet | MESURES, V3 | chantier C |
| C3 : une image demandée à chaque paquet en v2 | MESURES, V3 | chantier C (preuve : `P/test-bughunt-V3-2.cjs`) |
| C10 : blocs constants renvoyés à chaque paquet du flux | MESURES | écarté pour ce lot (§ 7 du plan) |
| Rechargement automatique de la page au changement de `VERSION.json` | A3 § 2.2, V3 | idée → `IDEES.md` |

## 5. Ce qui n'a pas été vérifié pour établir cette liste

- Aucun test de preuve n'a été relancé par l'auteur de ce document : les résultats sont ceux des contre-vérifications V1, V2 et V3, qui les ont relancés un par un.
- Les constats « chemin » n'ont pas de test : A4-2, A4-4, A4-6, A4-7, A1-9, A1-12, A1-13, A1-14, N2 à N8, et la partie « bloc » de A4-3.
- Rien sur la vraie carte, la Surface ni la RT.
