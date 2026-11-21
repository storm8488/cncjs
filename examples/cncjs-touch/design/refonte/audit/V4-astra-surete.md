# V4 — Second avis d'Astra sur la sûreté (phase 2)

Source : `codex exec -s read-only`, modèle gpt-6-astra, raisonnement « ultra », sur `feat/refonte-ui` HEAD `20aeac36`. Astra a rendu son avis sans ouvrir les rapports V1, V2 et V3, et sans rien modifier ni exécuter. La section « Vérification des citations » à la fin a été ajoutée par l'agent V4, qui n'a pas jugé le fond. Les chemins sont relatifs à la racine du dépôt.

---

# Rapport d'Astra (texte intégral)

## 1. Synthèse

- **Les défauts les plus graves tiennent** : départ hors course, départ sans référence machine fiable, palpage à la plaque insuffisamment surveillé et arrêts concurrents mal coordonnés.
- Aucun des 21 constats n’est entièrement réfuté ; plusieurs scénarios et gravités doivent toutefois être corrigés.
- **`$#` ne prouve pas le décalage exécuté après `$H`** : les tests ne démontrent pas les déplacements physiques catastrophiques annoncés.
- L’absence de marge d’un `$J` ne prouve ni `ALARM:2` ni redémarrage ; les blocages de relecture et d’affichage possèdent des sorties.
- D2 doit distinguer **référence machine**, **décalage mémorisé** et **décalage actif prouvé**.
- Dangers supplémentaires établis : arrêt HTTP de plaque parfois sans arrêt matériel, départ après perte d’autorisation, reprise héritant G93 et erreurs supplémentaires du contrôle de programme.
- Base examinée : `feat/refonte-ui`, HEAD `20aeac367db96b9c5af20a2ae7747e4d7c19a9ab`. Aucun fichier écrit, aucun test exécuté, aucun fichier V1/V2/V3 ouvert.

## 2. Tableau des verdicts

Les preuves sont des chemins d’exécution relus, pas des résultats d’essais physiques.

| Identifiant | Verdict | Gravité retenue | Preuve et conclusion |
|---|---|---|---|
| A1-1 | **tient** | sécurité machine | `src/server/services/touch/job-service.js:1728-1736`, `:1823-1830` : ticket puis départ malgré `outside` ; les limites Grbl ne préviennent pas l’interruption et la perte de référence constatées. |
| A1-2 | **tient avec réserve** | sécurité machine | `src/server/services/touch/program-check.js:503-525` : aucun recoupement du repère actif ; les « faux » verdicts physiques supposent toutefois un décalage exécuté encore inconnu. |
| A1-3 | **tient avec réserve** | sécurité machine | `src/server/services/touch/program-check.js:569-572`, `src/server/services/touch/job-service.js:1364-1373` : convention apprise ignorée ; c’est une lacune de couverture de D1, pas une fausse validation puisque le verdict reste `unknown`. |
| A1-4 | **tient** | sécurité machine | `src/server/services/touch/job-service.js:386-400`, `:759-797`, `:814-815` : le redémarrage invalide `homed`, mais seul le retour de pause est bloqué ; un nouveau chargement/départ reste possible. |
| A1-5 | **tient avec réserve** | sécurité machine | `src/server/services/touch/program-check.js:585`, `src/server/services/touch/motion.js:445-447` : bornes nominales acceptées ; ni l’origine exacte du refus terrain ni une marge universelle de 0,5 mm ne sont démontrées. |
| A1-6 | **tient** | sécurité machine | `src/server/services/touch/plate-probe.js:58-124`, `:237`, `:271-279`, `src/server/services/touch/job-service.js:2118-2121` : pas de contrôle de course, surveillance incomplète et libération possible sans arrêt. |
| A1-7 | **tient avec réserve** | sécurité machine | `src/server/services/touch/block-probe.js:913-925`, `:778-785`, `:868` : `$#` contradictoire accepté ; la cible physique annoncée dépend du décalage réellement exécuté. |
| A1-8 | **tient avec réserve** | à corriger | `src/server/services/touch/job-service.js:1671-1675` : `$I` non relu automatiquement, relecture interdite en Alarm ; mais `src/server/controllers/Grbl/GrblController.js:1013-1017` lit déjà `$$` automatiquement et une récupération existe. |
| A1-10 | **tient** | bloquant | `src/server/api/api.touch.js:147-155`, `src/server/services/touch/backlight.js:112-117` : une session distante peut effectivement provoquer l’écriture de zéro. |
| A2-1 | **tient** | sécurité machine | `examples/cncjs-touch/touch/job-controls.js:282-292`, `:584-589` : la case suffit à confirmer sans garde sur le verdict de course. |
| A2-2 | **tient avec réserve** | sécurité machine | `src/server/services/touch/program-check.js:519-525`, `:569-572` : deux défauts réels, mais les tests supposent abusivement que `$#` représente immédiatement le décalage exécuté. |
| A2-7 | **tient avec réserve** | à corriger | `examples/cncjs-touch/touch/commissioning.js:473-476`, `:503-504` : Relire est grisé en Alarm, mais le parcours `$X → Relire → $H` existe ; mauvaise récupération, pas impasse absolue. |
| A2-10 | **tient avec réserve** | à corriger | `examples/cncjs-touch/touch/job-dashboard.js:315`, `examples/cncjs-touch/touch/job-controls.js:356-366` : raison absente de Suivi, mais disponible dans Fichiers ; Arrêter reste accessible. |
| A3-1 | **tient avec réserve** | sécurité machine | `examples/cncjs-touch/touch/backlight.js:107-114`, `examples/cncjs-touch/touch/screen-saver.js:66-76` : extinction distante et touchers aveugles possibles ; la veille est néanmoins empêchée lorsque cette page connaît un travail actif (`:97-113`). |
| A3-2 | **tient** | bloquant | `src/server/services/touch/backlight.js:69-74`, `:123-127`, `:152-159` : redémarrer panneau éteint peut rendre `wake()` inopérant sans préférence sauvegardée. |
| A3-5 | **tient avec réserve** | sécurité machine | `src/server/services/cncengine/CNCEngine.js:317-345`, `src/server/services/touch/job-service.js:637-638` : fermeture hors politique de pilotage puis perte du canal d’arrêt prouvées ; comportement exact de la carte après fermeture non mesuré. |
| A4-1 | **tient avec réserve** | sécurité machine | `src/server/services/touch/block-probe.js:778-785`, `:913-925` : même défaut qu’A1-7, avec la même réserve physique. |
| A4-2 | **tient** | sécurité machine | `src/server/services/touch/control.js:209-210`, `:239-244`, `src/server/services/touch/block-probe.js:631-650` : un client tiers peut écrire après libération du bail, avant l’arrêt du bloc. |
| A4-3 | **tient** | sécurité machine | `src/server/services/touch/index.js:125-133`, `src/server/controllers/Grbl/GrblController.js:1424-1445`, `src/server/services/touch/block-probe.js:706-739` : l’arrêt Socket.IO peut laisser le séquenceur poursuivre pendant un intervalle Idle. |
| A4-4 | **tient avec réserve** | sécurité machine | `src/server/services/touch/halt.js:63-98`, `src/server/services/touch/block-probe.js:999-1019` : ancien arrêt survivant au redémarrage ; scénario atteignable par script, mais exigeant d’éviter le passage du timer sur Alarm. |
| A4-5 | **tient avec réserve** | à corriger | `src/server/services/touch/motion.js:436-464` : pas accepté jusqu’à la borne nominale ; une alarme destructrice sous `$J` n’est pas prouvée. |

**Limites des tests de preuve :**

- `src/server/services/touch/__tests__/bughunt-A1-4.test.js:145-153` simule une panne **après chargement, avant départ**. Il ne reproduit pas directement l’interruption d’un programme déjà démarré, qui impose ensuite arrêt/rechargement.
- `src/server/services/touch/__tests__/bughunt-A2-3.test.js:22-42` attend des verdicts fondés directement sur `$#`. L’attendu sûr de D2 serait d’abord **incohérence/refus**, jusqu’à preuve.
- Les tests de marge prouvent une divergence avec la politique souhaitée, pas la frontière physique du firmware.
- Les faux contrôleurs enregistrant `gcode:start` prouvent l’émission autorisée, jamais la trajectoire ni une collision.

## 3. Doublons

| Groupe | Même défaut ou distinction |
|---|---|
| A1-1 / A2-1 | Même règle de départ absente, exposée serveur puis page. Le correctif serveur est indispensable ; le dialogue doit suivre. |
| A1-2 / A2-2 / A1-7 / A4-1 | Même absence de preuve du décalage actif ; **A1-7 et A4-1 sont des doublons exacts**. Le bloc nécessite aussi une vérification locale avant ses mouvements. |
| A1-3 / partie d’A2-2 | Même convention de courses ignorée. **Distinct du WCO** : D2 seul ne résout pas les axes inconnus. |
| A1-5 / A4-5 | A4-5 est la partie « pas réels » d’A1-5. Conséquences différentes entre programme ordinaire et jog. |
| A1-8 / A2-7 | Même difficulté de relecture, complétée par un défaut de guidage dans la page. |
| A1-10 / partie d’A3-1 | Même autorisation distante d’extinction. L’absence de réveil local et de protection des touchers est un autre défaut. |
| A3-2 | Distinct : perte de l’état d’extinction au redémarrage, même sans client distant. |

**À garder séparés :** A1-4 concerne la référence machine ; A1-6 concerne la course et la surveillance de la plaque ; A4-2 l’exclusivité ; A4-3 la propagation de l’arrêt ; A4-4 la durée de vie des tâches différées. Un correctif commun d’orchestration peut les aider, mais aucun ne découle automatiquement de D2.

## 4. D1, D2, D3 : risques et conception la plus sûre

### D1 — Refuser le dépassement prouvé

La proposition A1/A2 est correcte dans son principe. **Un simple champ `override:true` ajouté à la confirmation serait insuffisant.**

Ordre recommandé :

1. Vérifier session carte, disponibilité, autorité du client et validité des preuves de référence/décalage.
2. Analyser le programme exactement chargé, **préambule de reprise compris**, avec les réglages actuels.
3. Refuser tout axe dont le dépassement est prouvé, même si un autre reste inconnu.
4. Refaire ces vérifications après toute attente asynchrone, immédiatement avant l’émission.

La dérogation doit avoir une confirmation distincte, liée à l’empreinte du fichier, aux dépassements présentés, à la session carte et aux décalages/réglages. Tout changement invalide cette confirmation. Journaliser avant le départ dérogatoire : opérateur, client, motif, fichier, bornes, cibles, preuves utilisées ; distinguer demande et départ effectivement envoyé.

**La dérogation D1 ne doit pas lever D2 ni remplacer une référence machine perdue.** `unknown` reste un avertissement conformément à la décision. Une marge provisoire doit être présentée comme une précaution, pas comme une frontière firmware démontrée.

Essais : changement de repère, G92/TLO, réglages, fichier, pilote ou connexion entre confirmation et départ ; dépassement Z avec X/Y inconnus ; préambule hors course ; dérogation périmée. Les essais de frontière physique viennent après caractérisation du décalage, sans considérer `$27` comme une marge universelle.

### D2 — Prouver le décalage sans fabriquer une fausse sécurité

**Trois états indépendants :** référence machine fiable, valeurs mémorisées, transformation active prouvée. Recharger correctement G54 après une remise à zéro arbitraire de MPos peut précisément rendre A1-4 dangereux.

La transaction sûre serait :

1. **Réserver le contrôleur contre toutes les entrées dangereuses**, y compris interface classique et scripts. Exiger Idle récent, files vides et broche arrêtée ; garder les arrêts accessibles.
2. Lire `$G`, `$#` et les unités des rapports dans cette transaction, avec réponses complètes et acquittements attribués.
3. Comparer des valeurs homogènes :  
   **WCO = repère actif + G92 + TLO sur Z.**  
   Comparer seulement G54 à WCO provoquerait des faux refus. Conserver les restrictions G92/TLO propres au bloc.
4. En cas d’écart, préférer un **changement de repère puis retour au repère initial**, sans mots d’axe, une ligne acquittée à la fois.
5. Exiger ensuite un rapport contenant **réellement un nouveau `WCO:`**, postérieur au rechargement, puis confirmer le repère et l’état modal.

Le code distingue déjà le passage d’un champ WCO explicite : `src/server/services/touch/job-service.js:298-301`. Un statut récent auquel CNCjs rattache un ancien WCO ne constitue donc pas une preuve.

**Pièges à éviter :**

- Avec `$10=1`, plusieurs rapports sans WCO sont normaux. Attente bornée compatible avec sa cadence ; pas de refus au premier champ absent ni de recharge infinie.
- La transaction doit reconnaître ses propres changements de repère, sinon elle invalide elle-même sa preuve en boucle.
- Une interruption entre G55 et G54 laisse un état intermédiaire réel. Ne rien autoriser sur l’hypothèse que le retour a réussi.
- Un changement de repère seul doit préserver distance, avance, broche, plan et unités. Vérifier le `$G` final ; **ne pas restaurer aveuglément un ancien M3**.
- `G10 L2` et `G10 L20` n’ont pas le même sens. Ils dépendent des unités et, pour L20, de la position et des décalages ; ils peuvent réécrire l’origine persistante. Éviter leur utilisation automatique comme simple « recharge ».
- Ne pas effacer silencieusement G92 ou une compensation d’outil. Grbl utilise notamment G43.1 ; une variante G43 non reconnue doit rester non prouvée.
- La tolérance doit tenir compte des arrondis des rapports et des sommes de décalages.
- Une preuve initiale ne couvre pas automatiquement un **G49 ultérieur dans le programme** : voir danger N4.
- Après redémarrage CNCjs, référence inconnue ne signifie pas nécessairement référence physiquement perdue ; elle ne peut cependant être certifiée par `$X` ou par trois zéros pièce.

**Sortie d’impasse :** conserver lecture, diagnostic, arrêt et référencement disponibles ; afficher la valeur attendue, la valeur reçue et leur ancienneté ; proposer une nouvelle vérification bornée. Une panne persistante reste un refus motivé, sans supprimer les gardes. Aucun homing automatique répétitif.

**Essai décisif sur la vraie carte :** comparer séparément décalages mémorisé, rapporté et exécuté après `$H`, puis après basculement et G10. Choisir une position et une petite commande lente dont **les deux trajectoires possibles** restent dégagées. Ne pas reprendre un exemple numérique du protocole sans vérifier ces deux hypothèses.

Compléter par G55 initialement actif, G92/TLO non nuls, G20/G21, G90/G91, G93/G94, plans, reset à chaque étape, rapports retardés, client concurrent et redémarrage CNCjs. Les sources amont ne peuvent départager seules les anomalies du binaire fabricant.

### D3 — Réveil local fiable

Les correctifs proposés doivent être resserrés :

- **Boucle locale réelle**, pas `req.ip`, influençable par les en-têtes de proxy. L’exception A3 `remoteAddress === localAddress` sur une adresse LAN ne respecte pas D3 tel qu’écrit.
- Un proxy local peut masquer un client distant. Réserver cette capacité à une entrée locale maîtrisée ; l’absence d’en-têtes de proxy n’est pas une preuve suffisante.
- Identifier une session kiosque : deux onglets locaux ne doivent pas éteindre contradictoirement le même panneau.
- Aucune transition automatique de veille distante, réveil compris, ne doit commander le rétroéclairage.
- Rendre `wake()` idempotent, y compris après redémarrage panneau à zéro sans préférence. Vérifier le niveau relu, pas seulement HTTP 200.
- Au chargement/reconnexion, protéger les commandes jusqu’au réveil confirmé. Consommer tout le geste de réveil, relâchement et clic synthétique compris ; les 450 ms actuelles ne prouvent pas le succès réseau.
- Ordonner les requêtes pour qu’un ancien `dim` retardé ne suive pas un réveil ; prévoir la récupération après disparition de la page propriétaire.
- Le réveil ne dépend jamais du bail machine.

Essais sur le kiosque : PC distant, deux onglets locaux, IPv4/IPv6/proxy, redémarrage panneau noir, écriture sysfs refusée, réseau interrompu, réponses inversées, premier toucher sur une flèche et sur Confirmer.

## 5. Dangers manqués

### Prouvés dans le code

**N1 — Arrêter HTTP peut laisser poursuivre la plaque. — Sécurité machine**

Première `G38.2` envoyée, dernier rapport encore Idle, sender vide et broche arrêtée : `src/server/lib/Feeder.js:107-115` remet déjà `pending=false`. L’arrêt de plaque appelle alors un `haltPlan()` vide : `src/server/services/touch/job-service.js:1908-1916` → `src/server/services/touch/halt.js:33-58`.

**Sortie fausse :** « Palpage interrompu », verrou ensuite libéré, mais aucun hold/reset envoyé. La descente déjà transmise peut continuer. Le bloc possède précisément le garde manquant : `src/server/services/touch/block-probe.js:575-577`.

**Correction :** suivre la ligne en vol, arrêter dès qu’un mouvement reste possible et conserver la réservation jusqu’à immobilisation prouvée. Distinct d’A4-3 : l’ordre HTTP atteint ici correctement le cycle.

**N2 — Un départ peut survivre à la perte du flux ou du pilotage. — Sécurité machine**

`src/server/services/touch/job-service.js:1802-1807` consomme le ticket, puis `:1823-1830` attend la vérification du fichier. Au retour, seul `readyFor()` est rappelé : ni bail ni transport ne sont revérifiés. La lecture comporte de véritables attentes : `src/server/services/monitor/index.js:289-301`.

**Scénario :** confirmation reçue → lecture disque → fermeture du flux ou transfert de pilotage → départ de l’ancien appel. Effacer `r.ticket` ne suffit plus : il est déjà consommé.

**Correction :** réservation révocable, contrôle du pilote, du flux, de l’expiration et de la session juste avant émission ; Arrêter doit aussi annuler un départ en préparation.

**N3 — Le contrôle de course ne lit pas les nombres comme Grbl. — Sécurité machine**

`src/server/services/touch/program-check.js:56-65` conserve les espaces internes. Avec un décalage nul, `G21 G90` puis `G0 Z-1 40` est analysé comme Z−1, alors que Grbl supprime les espaces et lit Z−140. CNCjs transmet la ligne sans corriger cette divergence : `src/server/controllers/Grbl/GrblController.js:410-414`, `:494`. La suppression des espaces est explicite dans le [protocole Grbl amont](https://github.com/gnea/grbl/blob/master/grbl/protocol.c).

**Correction :** même normalisation et mêmes restrictions numériques pour analyse, reprise et émission ; aucun verdict positif sur une syntaxe interprétée différemment. Le comportement du binaire fabricant n’a pas été rejoué.

**N4 — G49 peut invalider silencieusement le calcul de course. — Sécurité machine**

`src/server/services/touch/program-check.js:21-22` reconnaît G49, mais `:188-250` ne modélise pas son effet sur un TLO hérité.

**Scénario :** G54 Z−100, TLO +20, donc WCO−80 ; fichier `G21 G90 G54 G49`, puis `G0 Z-40`. Le contrôle emploie −80 et calcule −120 ; après annulation du TLO, la cible devient −140 selon la sémantique Grbl. D2 peut être parfaitement satisfait **avant** G49 sans résoudre ce défaut. La transformation avec TLO est visible dans l’[interpréteur Grbl amont](https://github.com/gnea/grbl/blob/master/grbl/gcode.c).

**Correction :** modéliser les changements de compensation avec un état initial prouvé, ou déclarer la transformation non vérifiable.

**N5 — La reprise peut hériter G93 et changer fortement l’avance de plongée. — Sécurité machine**

`src/server/services/touch/resume.js:389` laisse `checkFeedMode()` vide ; `:375` omet G94 lorsque le fichier ne le fixe pas ; `:644` émet néanmoins une plongée avec F. Les gardes de départ ne vérifient alors que les unités et distances : `src/server/services/touch/job-service.js:784-797`.

**Scénario :** programme habituellement exécuté en G94, sans G94 explicite ; carte laissée en G93 avant reprise. Une plongée de 6 mm avec F100 signifie alors une durée de 0,01 minute, soit une consigne équivalente à 600 mm/min, au lieu de 100. Grbl accepte les blocs avec F en [mode inverse du temps](https://github.com/gnea/grbl/blob/master/grbl/gcode.c).

**Correction :** exiger G94 frais pour cette reprise ou établir explicitement un préambule G94 selon un contrat documenté. Le défaut analogue de la plaque était déjà mentionné dans A4.

**N6 — Les commandes Socket.IO ignorent une réservation de maintenance. — Sécurité machine**

`src/server/services/touch/index.js:203`, `:234` réserve le serveur pour Wi-Fi/mises à jour. Mais `:121-133` ne consulte que le bail ; `src/server/services/touch/control.js:239-244` autorise un port libre.

**Scénario :** maintenance engagée au repos → interface classique envoie M3 ou un mouvement → ligne transmise pendant l’opération qui peut retirer la connexion ou le serveur.

**Correction :** faire consulter la réservation d’opération par toutes les entrées dangereuses, gestion du port comprise ; conserver les arrêts.

**N7 — Des écritures de réglages peuvent traverser le contrôle comme si elles ne changeaient rien. — Sécurité machine**

Une ligne `$20=0` ne produit aucun mot G/M/axe pour `src/server/services/touch/program-check.js:159-165`, puis est ignorée à `:290-291`. Le programme est chargé sans filtre correspondant : `src/server/services/touch/job-load.js:208-232`, puis transmis par le sender.

**Sortie fausse :** un contrôle fondé sur les réglages initiaux accompagne un programme qui peut désactiver une protection ou modifier un étalonnage. L’émission est établie ; l’acceptation précise de chaque réglage dépend de l’état et du firmware. Les écritures `$x=val` sont des [commandes de configuration Grbl](https://github.com/gnea/grbl/wiki/Grbl-v1.1-Commands).

**Correction :** détecter les commandes système dans les fichiers et leur appliquer une politique explicite ; ne pas conserver une preuve de course fondée sur une configuration qu’elles changent.

### Admission prouvée, effet physique restant à confirmer

**N8 — `0x9E` autorisé à tous peut réactiver la broche. — Sécurité machine**

`src/server/services/touch/control.js:49`, `:252-253` classe cet octet parmi les commandes libres. Or il s’agit d’une **bascule** arrêt/restauration pendant Hold, pas d’un arrêt idempotent, selon la [documentation officielle Grbl](https://github.com/gnea/grbl/wiki/Grbl-v1.1-Commands#extended-ascii-realtime-command-descriptions).

Un second client peut donc demander la restauration d’une broche arrêtée par override. Le passage de l’octet est prouvé ; sa réalisation sur cette LUNYEE reste à essayer. **Correction :** retirer cette bascule des commandes universellement autorisées, tout en conservant une véritable action d’arrêt accessible.

## 6. Ce que je n’ai pas pu vérifier

- Aucun test, simulateur, navigateur, port série, Surface ou CNC exécuté. Les tests de preuve ont été lus, leurs résultats annoncés n’ont pas été reproduits.
- Décalage réellement exécuté après homing ; frontière des six courses ; réponse LUNYEE aux jogs hors course ; effets exacts des resets, fermetures série, G93, TLO et `0x9E`.
- Cadence réelle et chronologie des rapports perdus/retardés, exclusivité vis-à-vis du Wi-Fi direct de la carte.
- Configuration effective du kiosque, URL locale, proxy et comportement tactile.
- Les sources fabricant restent inconnues. Les sources Grbl consultées étayent une sémantique amont, pas l’identité du binaire installé.
- Les notes historiques ont seulement orienté la relecture ; les verdicts reposent sur le code courant.


---

# Vérification des citations (agent V4)

Méthode : chaque `fichier:ligne` du rapport a été rouvert (HEAD `20aeac36`) et comparé à ce qu'Astra en dit. Le fond n'est pas jugé.

## Citations confirmées (la ligne existe et dit ce qui est affirmé)

A1-1 (`job-service.js:1728-1736`, `:1823-1830`), A1-2 (`program-check.js:503-525`), A1-3 (`program-check.js:569-572`, `job-service.js:1364-1373`), A1-4 (`job-service.js:386-400`, `:759-797`, `:814-815`), A1-5 (`program-check.js:585`, `motion.js:445-447`), A1-6 (`plate-probe.js:58-62`, `:237`, `:271-273`, `job-service.js:2118-2121`), A1-7 et A4-1 (`block-probe.js:778-780`, `:868`, `:913-916`), A1-8 (`job-service.js:1671-1675`, `GrblController.js:1013-1017`), A1-10 (`api.touch.js:147-155`, `backlight.js:112-117`), A2-1 (`job-controls.js:282-292`, `:584-589`), A2-7 (`commissioning.js:473-476`, `:503-504`), A3-1 (`backlight.js:107-114` côté page, `screen-saver.js:66-76`), A3-2 (`backlight.js:69-74`, `:123-127`, `:152-159`), A4-2 (`control.js:209-210`, `:239-244`, `block-probe.js:631-634`), A4-3 (`index.js:121-133`, `GrblController.js:1424-1427`, `block-probe.js:706`), A4-4 (`halt.js:63-66`, `block-probe.js:999-1003`), A4-5 (`motion.js:436-464`).
Dangers : N1 (`Feeder.js:107-115`, `job-service.js:1908-1916`, `halt.js:33`, `block-probe.js:575-577`), N2 (`job-service.js:1802-1807`, `:1823-1830`, `monitor/index.js:289-292`), N3 (`program-check.js:56-65` : la regex de `words()` accepte des espaces entre la lettre et le nombre, pas à l'intérieur du nombre, ce qui est cohérent avec le scénario `Z-1 40` ; `GrblController.js:410-414`, `:494`), N4 (`program-check.js:21-22`, `:188-190`), N5 (`resume.js:375`, `:389`, `:644`, `job-service.js:784-797`), N6 (`index.js:203`, `:234`, `:121-133`, `control.js:239-244`), N7 (`program-check.js:159-161`, `:290-291`, `job-load.js:208-210`), N8 (`control.js:49` avec `\x9e` dans `SAFE_WRITES`, `:252-253`).

## Citations imprécises ou à nuancer

- **A2-10** : `examples/cncjs-touch/touch/job-dashboard.js:315` ne porte pas sur la pause ; la ligne affiche « Dernière erreur : … ». La raison « Travail en pause… » est bien à `job-controls.js:356` (et la phrase vue par Suivi vient de `job-controls.js` via `job-reason`). Citation à moitié fausse : numéro de ligne de `job-dashboard.js` à corriger ou à retirer.
- **A3-5** : `job-service.js:637-638` est la garde « Contrôleur Grbl non connecté », pas la perte du canal d'arrêt. `job-service.js:2118-2121` (transportClosed) correspond mieux à ce qu'Astra décrit. Citation à déplacer.
- **A3-1** : Astra cite en plus `backlight.js:97-113` (page) pour dire que la veille est empêchée quand un travail est actif ; la ligne 110 (`mode==='keep'||(state&&!usable())`) est cohérente, mais le test « travail actif » exact n'a pas été retrouvé dans la plage : à revoir.
- **N3, N4, N5, N8** : les références aux sources amont de Grbl (liens GitHub `gnea/grbl`) n'ont pas été ouvertes (pas d'accès réseau demandé) : non vérifiées.
- **N3** : `GrblController.js:410-414` appelle `parseLine` avec `lineMode: 'stripped'`. Je n'ai pas vérifié si ce mode supprime les espaces internes avant l'écriture à `:494` (Astra affirme que non). Si oui, le danger N3 ne porte pas sur la ligne transmise, mais seulement sur l'analyse du contrôle. À vérifier avant de retenir N3.

## Citations fausses

Aucune citation dont le fichier ou la ligne n'existe pas. Les trois points ci-dessus sont des numéros ou des attributions décalés.

## Test de preuve : numéros cités

`__tests__/bughunt-A1-4.test.js:145-153` et `bughunt-A2-3.test.js:22-42` : rouverts : les lignes existent et décrivent bien ce qu'Astra en dit (A1-4 : redémarrage simulé après chargement, avant départ ; A2-3 : attendus fondés directement sur `$#`).
