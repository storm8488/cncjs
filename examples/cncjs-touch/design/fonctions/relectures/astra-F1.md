Relecture en lecture seule de `feat/F1`, diff `db584555..f009b7ef`, confronté au prompt, à la conception demandée, à `FIRMWARE.md` et à `SURETE.md`. **Quatre dangers sont confirmés.** Aucun fichier modifié, aucun accès à la machine.

**D1 — danger : un déplacement manuel peut descendre Z pendant le cadrage.**

Références : [motion.js:429](C:/Users/damou/Documents/claude/cncjs-wt/F1/src/server/services/touch/motion.js:429), [job-service.js:2317](C:/Users/damou/Documents/claude/cncjs-wt/F1/src/server/services/touch/job-service.js:2317), [real-motion.js:124](C:/Users/damou/Documents/claude/cncjs-wt/F1/examples/cncjs-touch/touch/real-motion.js:124).

`atRest()` vérifie le déplacement en attente, mais **pas l’existence de `s.frame`**. Après l’acquittement et deux rapports `Idle`, avant le prochain passage du superviseur, un jog du même appareil est accepté. Il remplace `s.pending` sans terminer le cadrage. L’interface peut également réactiver les flèches dans cette fenêtre.

Reproduction en mémoire avec le vrai module, départ à Z machine −5 :

```text
M5
$J=G91 G21 Z-1 F300
$J=G90 G21 X10 Y10 F600
```

Le cadrage poursuit donc son trajet à Z−6. Cela contredit l’exclusion des déplacements pendant toute la séquence, exigée par la conception §10.1, test 26.

**Correction :** réserver explicitement la machine tant que `s.frame` existe : refuser pas, déplacement continu, zéros et second cadrage. Empêcher une autre opération de remplacer son attente de réponse. Répercuter cette exclusion sur les flèches.

**D2 — danger : lorsqu’aucune montée n’est prévue, la hauteur sûre n’est plus vérifiée avant le premier X/Y.**

Références : [job-service.js:2057](C:/Users/damou/Documents/claude/cncjs-wt/F1/src/server/services/touch/job-service.js:2057), [motion.js:985](C:/Users/damou/Documents/claude/cncjs-wt/F1/src/server/services/touch/motion.js:985), [motion.js:1118](C:/Users/damou/Documents/claude/cncjs-wt/F1/src/server/services/touch/motion.js:1118).

Le plan donne à `M5` une position attendue nulle : `expect[0]=null`. Sans ligne de montée, le serveur mémorise ensuite le Z courant comme `zFloor`, sans le comparer à la hauteur sûre.

Reproduction : plan préparé à Z0 ; pendant l’attente de `M5`, la position devient Z−60 ; acquittement puis deux rapports `Idle` frais. **Le premier X/Y part avec `zFloor=-60`.** Ce changement peut venir de D1 ou d’un client direct de la carte, cas envisagé par la conception.

**Correction :** vérifier la position conservée après `M5`, puis imposer la hauteur sûre avant tout X/Y, même lorsque la montée a été omise. Une position inattendue doit arrêter la séquence, sans devenir sa nouvelle référence.

**D3 — danger : après une rotation du flux, une arrivée ancienne autorise une nouvelle ligne malgré un état changé.**

Références : [motion.js:968](C:/Users/damou/Documents/claude/cncjs-wt/F1/src/server/services/touch/motion.js:968), [motion.js:1078](C:/Users/damou/Documents/claude/cncjs-wt/F1/src/server/services/touch/motion.js:1078), [motion.js:1112](C:/Users/damou/Documents/claude/cncjs-wt/F1/src/server/services/touch/motion.js:1112).

Une arrivée validée pendant l’absence du flux laisse `verified=index`. Au retour du flux, le code saute alors `settle()`, le contrôle `Idle` et la comparaison de position. La surveillance générale accepte `Jog`.

Reproduction : arrivée validée à X10/Y10/Z0 pendant la rotation ; nouveau rapport à X12/Y12/Z−50, état `Jog` ; réouverture avant trois secondes. **Le segment `$J=G90 G21 X30 Y30 F600` est envoyé.**

**Correction :** immédiatement avant chaque nouvel envoi, revérifier `Idle`, la position attendue et la hauteur Z. Une validation antérieure à une attente ne doit pas rester une autorisation d’envoyer. C’est explicitement exigé par la conception §5.2 : conditions vraies « à cet instant ».

**D4 — danger : certaines annulations venant de CNCjs n’arrêtent pas la séquence.**

Références : [index.js:122](C:/Users/damou/Documents/claude/cncjs-wt/F1/src/server/services/touch/index.js:122), [control.js:43](C:/Users/damou/Documents/claude/cncjs-wt/F1/src/server/services/touch/control.js:43), [motion.js:1124](C:/Users/damou/Documents/claude/cncjs-wt/F1/src/server/services/touch/motion.js:1124).

`jogCancel` et l’octet `0x85` sont autorisés comme commandes sûres, mais ne déclenchent pas `service.socketStop()`. Reçus pendant `M5` ou lorsqu’un segment a déjà atteint sa cible, ils laissent le cadrage actif : **la ligne suivante repart malgré l’annulation**.

Le routage réel a été exécuté en mémoire : `jogCancel`, `0x85` et `?0x85` passent sans arrêter la séquence ; les témoins `feedhold` et `!` l’arrêtent.

**Correction :** reconnaître ces annulations dans `socketStopping()` et terminer synchroniquement le cadrage avant leur transmission. Tester par la véritable façade `refuseSocket()`, pas seulement par un appel direct à `socketStop()`.

**C1 — à corriger : des octets d’annulation peuvent encore partir après une bannière.**

Références : [motion.js:1005](C:/Users/damou/Documents/claude/cncjs-wt/F1/src/server/services/touch/motion.js:1005), [motion.js:1432](C:/Users/damou/Documents/claude/cncjs-wt/F1/src/server/services/touch/motion.js:1432), [motion.js:608](C:/Users/damou/Documents/claude/cncjs-wt/F1/src/server/services/touch/motion.js:608).

Après une bannière, avant le prochain contrôle périodique, une libération de la main ou une fermeture du flux peut appeler `cancel()` sans comparer `startups`. Reproduction : `M5`, bannière, supervision ou fermeture du flux → **`jogCancel` supplémentaire**. La répétition d’une annulation ne contrôle pas non plus la session de carte.

Cela contredit « aucun octet après la bannière », affirmé dans la conception et `SURETE.md`. L’octet démontré annule ; il ne déclenche pas lui-même un mouvement.

**Correction :** neutraliser la séquence et ses rappels dès la bannière, et contrôler la session avant toute écriture d’annulation. Conserver le résultat `ETOUCH_FRAME_RESTART`.

**C2 — à corriger : la surveillance de broche abandonne le contrôle de secours par `$G`.**

Références : [job-service.js:1965](C:/Users/damou/Documents/claude/cncjs-wt/F1/src/server/services/touch/job-service.js:1965), [motion.js:966](C:/Users/damou/Documents/claude/cncjs-wt/F1/src/server/services/touch/motion.js:966).

Le départ accepte l’absence de vitesse rapportée si un `$G` récent indique la broche arrêtée. Pendant le cadrage, seul `status.spindle > 0` est surveillé. Un nouveau `$G` indiquant `M3`, sans changement de repère, est ignoré : reproduction en mémoire, le X/Y suivant part.

**Correction :** réutiliser pendant toute la séquence le garde complet du départ, avec contrôle de fraîcheur lorsque la vitesse manque. Tester `M3`, `M4` et `$G` périmé. Ce cas concerne le fonctionnement sans `FS`, explicitement accepté par le code ; il n’est pas attendu sur le profil LUNYEE documenté.

**C3 — à corriger : l’upload classique peut remplacer le fichier pendant le cadrage.**

Références : [api.gcode.js:33](C:/Users/damou/Documents/claude/cncjs-wt/F1/src/server/api/api.gcode.js:33), [job-service.js:584](C:/Users/damou/Documents/claude/cncjs-wt/F1/src/server/services/touch/job-service.js:584), [motion.js:934](C:/Users/damou/Documents/claude/cncjs-wt/F1/src/server/services/touch/motion.js:934).

`POST /api/gcode` charge directement le sender sans consulter la réservation Touch. L’événement efface `r.job`, mais le cadrage ne surveille pas cette identité et poursuit l’ancien rectangle. Le workflow étant déjà `idle`, son `stop()` ne produit pas d’événement d’arrêt.

**Correction :** refuser cet upload pendant la réservation et terminer le cadrage si son fichier est néanmoins remplacé. Aucun dépassement de course n’est démontré par ce seul chemin, mais l’exclusion du chargement promise par la conception est contournée.

**C4 — à corriger : plusieurs tests ne prouvent pas la propriété annoncée.**

| Référence | Lacune vérifiée | Correction |
|---|---|---|
| [cnc-frame.test.js:814](C:/Users/damou/Documents/claude/cncjs-wt/F1/src/server/services/touch/__tests__/cnc-frame.test.js:814) | Le test 26 vérifie les exclusions avec une ligne encore en attente. Il masque D1. | Tester après `ok` + deux rapports, avant le prochain passage du superviseur, et pendant une rotation. |
| [cnc-frame-lunyee.test.js:155](C:/Users/damou/Documents/claude/cncjs-wt/F1/src/server/services/touch/__tests__/cnc-frame-lunyee.test.js:155) | L2 saute l’assertion de refus si D2 est devenu prouvé. Une préparation acceptée peut donc faire passer le test. | Maintenir D2 en vérification et exiger sans condition `ETOUCH_OFFSET_CHECKING`. |
| [cnc-frame-lunyee.test.js:236](C:/Users/damou/Documents/claude/cncjs-wt/F1/src/server/services/touch/__tests__/cnc-frame-lunyee.test.js:236) | L7 annule par `socketStop()` avant le reset. Il ne teste pas le redémarrage spontané d’un cadrage actif et n’exige aucun code d’alarme précis. | Injecter le reset directement pendant `Jog`, puis vérifier alarme, bannière et absence d’écritures ultérieures. |
| [cnc-frame-lunyee.test.js:183](C:/Users/damou/Documents/claude/cncjs-wt/F1/src/server/services/touch/__tests__/cnc-frame-lunyee.test.js:183) | Les limites Y395,5 et X0 sont seulement préparées ; seul X407,5 est effectivement parcouru. | Exécuter les autres cas requis ou réduire les affirmations de preuve dans `SURETE.md`. |

**R1 — remarque : la validation physique reste ouverte.**

[SURETE.md:223](C:/Users/damou/Documents/claude/cncjs-wt/F1/examples/cncjs-touch/design/refonte/SURETE.md:223) reconnaît l’absence de mesure de freinage et de relevé matériel pour `$J=G90` et `0x85`. Une perte du serveur peut laisser finir le segment en cours. **Suite proposée :** conserver ces limites explicites et conduire le protocole matériel prévu après correction et nouvelle relecture.

Le test `node examples/cncjs-touch/test-cnc-frame.cjs` passe. Les reproductions ciblées utilisent les modules réels en mémoire ; elles ne constituent pas des essais physiques. Les suites complètes Jest, `verify-project` et le harnais navigateur n’ont pas été exécutés. L’arbre Git est resté propre.

**Verdict : à ne pas installer en l’état.** Les dangers D1 à D4 doivent être corrigés et couverts par des tests reproduisant leurs fenêtres exactes. Les corrections C1 à C4 doivent également être intégrées avant une nouvelle décision d’installation.

