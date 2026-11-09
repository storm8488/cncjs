# Protocole d'essai sur la CNC — tablette Surface Pro en Performance v2

Version du protocole : 2026-11-09, relue par un second agent (Astra) et corrigée. Écrite pour la branche `feat/ecrans-ergonomie` : la Surface Pro tourne encore `91372563` (cache `v2n`) ; les libellés cités sont ceux du code local `99773663` (cache `v2o`). Si la tablette n'a pas été redéployée, deux textes diffèrent sans changer le geste : le bouton de Préparer v2 s'appelle « Vérifier un déplacement… » au lieu de « Vérifier un déplacement sans bouger… », et la ligne « $X et $H indisponibles : … » de Machine n'a pas la fin « Touchez Arrêter, puis $X. ».

Ce document est fait pour être lu devant la machine. Chaque étape dit : **ce qu'on fait**, **ce qu'on doit voir à l'écran**, **ce qui fait arrêter l'essai**. Rien n'est à deviner : si un écran ne montre pas ce qui est écrit ici, on s'arrête et on note.

## 0. Cadre

| | |
| --- | --- |
| Machine attendue | LUNYEE 4040 Nova, Grbl_ESP32 1.3a, 400 × 400 × 130 mm (HANDOFF.md) — **à confirmer à la réception** : noter le firmware réel tel que la tablette l'affiche (« Carte : … » dans l'assistant). |
| Poste | Surface Pro 3 en kiosque, CNCjs sur la tablette elle-même (PM2 `cncjs-v2`, port 8000), page `/touch/`, échelle 1,58 → fenêtre 1366 × 911. Profil **Performance** déjà enregistré dans le navigateur du kiosque. |
| Second poste | Un PC (ou portable) sur le même réseau avec la page **CNCjs classique** : `http://192.168.1.29:8000/`. C'est lui qui ouvre le port série, lit la console (`$$`, `$G`, `$#`, `$I`) et, vendredi, fait les déplacements manuels (jog) et pose l'origine. |
| Ce que ce protocole couvre | Première connexion, assistant « Mise en service », déclaration du type CNC, ouverture de la v2, origine depuis le PC, zéro Z à la plaque (facultatif), un programme d'essai en l'air à rapides 25 %, Pause / Reprendre / Arrêter, alarme volontaire sans mouvement, retour en v1 Éco. |
| Ce qu'il ne couvre pas | **Le déplacement réel depuis la tablette** : `touch.motion.enabled` reste **absent** de `.cncrc` vendredi (le protocole supervisé de HANDOFF.md, étape 10, avec son étape 0, vient après). Les flèches de Préparer restent « VÉRIFICATION SEULE » et ne déplacent rien. Pas de laser, pas de RT, pas de coupe dans la matière, pas de reprise à une ligne exécutée. |
| Durée visée | 2 h à 3 h, sans se presser. |

**Deux personnes** : l'une à la tablette (« l'opérateur »), l'autre **la main sur l'arrêt d'urgence** pendant tout ce qui fait bouger un axe ou tourner la broche (« le surveillant »). Le surveillant ne regarde pas l'écran : il regarde la machine.

### Règle d'arrêt générale (vaut pour toutes les étapes)

Appuyer sur l'arrêt d'urgence, puis arrêter l'essai et noter l'heure et l'écran affiché, si :

- un axe part dans le mauvais sens, ne s'arrête pas où il devrait, ou bouge alors que l'écran dit qu'aucun mouvement n'est envoyé ;
- la broche démarre sans qu'on l'ait demandé, ou ne s'arrête pas sur « Arrêter la broche (M5) » ;
- **Pause** ou **Arrêter** du bandeau n'agit pas dans la seconde : les axes n'ont pas **commencé à ralentir** dans la seconde qui suit l'appui. Critère opérateur unique pour Pause et Arrêter : réaction (début de décélération) en ≤ 1 s, immobilisation visible en ≤ 2 s. Les « 5 s » citées plus loin sont une échéance interne du serveur avant la réinitialisation de la carte, **jamais** une durée pendant laquelle on laisse les axes continuer ;
- le bandeau passe sur « Rapport ancien » ou « État perdu » pendant un mouvement : toucher **Arrêter** aussitôt ; si l'immobilisation n'est pas vérifiable immédiatement à l'œil, arrêt d'urgence. Seule exception : pendant `$H` (étape 8) la carte n'envoie pas de rapport, l'âge qui monte est attendu ; c'est alors le surveillant qui juge le mouvement ;
- la position affichée ne correspond manifestement pas à la machine (ex. Z travail 0 alors que l'outil est à 30 mm) ;
- une alarme s'affiche sans que l'écran Machine l'explique.

Après un arrêt d'urgence : ne rien relancer depuis la tablette avant d'avoir compris. Remettre la carte au repos ($X puis $H) seulement une fois la cause trouvée.

## 1. Avant de brancher (la veille ou le matin, sans la CNC)

Cocher dans la grille (annexe A, lignes A).

1. **Surface** allumée, kiosque ouvert sur le Menu, bandeau « Hors ligne », cellule Pilote « — », mention « MACHINE RÉELLE » à droite. Pas de « Chargement incomplet ».
2. **Réglages › Système › Tablette** : la ligne « Interface … installée le … » montre la version attendue (commit `91372563`). Si « Version de l'interface inconnue (déploiement manuel) » : noter, ce n'est pas bloquant.
3. **Réglages › Machine et performances** : « Performances de cette tablette » sur **Performance** (bouton enfoncé) ; « Type de machine » affiche « Machine : — » tant que rien n'est connecté ; « Mise en service de la machine » dit « Aucune machine connectée. ». L'entrée « Interface Performance v2 » n'apparaît pas encore (normal : pas de machine CNC déclarée).
4. **Réglages › Machine et performances › Diagnostic de cette tablette** : lancer, lire « GPU » (doit être matériel, pas « (rendu logiciel) »), toucher « Exporter le diagnostic ». Capture **C0**.
5. **PC** : ouvrir `http://192.168.1.29:8000/`, se connecter, vérifier que la page Workspace s'affiche et que le widget Connexion liste les ports (vide pour l'instant).
6. **`.cncrc`** (depuis le PC en SSH, lecture seule) : pas de clé `touch.motion.enabled`. Pas de `touch.machines` (ou alors noter son contenu). Ne rien modifier.
7. **Matériel prêt** : câble USB, arrêt d'urgence testé à vide (le bouton s'enfonce et se relâche), **aucune fraise dans la broche** (pince vide ou retirée, écrou serré ou retiré), table vide, brides retirées, zone dégagée d'un mètre autour, variateur sous tension mais broche à l'arrêt, plaque de palpage et sa pince à portée si l'étape 17 est prévue, lunettes.
8. Noter le **type d'arrêt d'urgence** de la machine : coupe-t-il l'alimentation des moteurs seulement, ou réinitialise-t-il la carte ? Coupe-t-il aussi le **variateur / la broche** ? (Important pour l'étape 5 : son action réelle sur les axes **et** sur la broche y est démontrée avant tout mouvement.)
9. Un téléphone pour les photos d'écran (le kiosque n'a pas d'outil de capture).

## 2. Mise sous tension et connexion (PC)

| | |
| --- | --- |
| **Faire** | Brancher l'USB, allumer la CNC (arrêt d'urgence relâché). Sur le PC, widget Connexion : contrôleur **Grbl**, port de la carte, 115200 bauds, **Open**. Dans la console classique, taper `$$`, `$I`, `$G`, `$#`, `$N` et copier le tout dans un fichier texte (capture **C1**). |
| **Voir (PC)** | La bannière Grbl_ESP32 (`Grbl 1.3a …`). L'état : souvent **Alarm** à la mise sous tension quand `$22=1` (« '$H'\|'$X' to unlock »). Dans une alarme ordinaire, `$$` se lit quand même depuis la console (Grbl ne refuse `$$` qu'en mouvement ou en pause, `error:8`) ; c'est la tablette qui grise son bouton « Relire les réglages ($$) » en alarme (étape 4). Une alarme **critique** (fin de course matérielle, « Reset to continue ») ne répond à rien avant une réinitialisation : voir l'étape 6. **Ne pas** taper `$X` au PC : la tablette le fera à l'étape 5, c'est justement ce qu'on teste. `$N` affiche les blocs de démarrage `$N0=` et `$N1=` : Grbl les exécute après chaque `$H` réussi (et à la réinitialisation). |
| **Voir (tablette)** | Bandeau : le mot d'état passe de « Hors ligne » à « Alarme » (ou « Repos » si la carte démarre au repos), l'âge du rapport « < 1 s », cellule « Machine » = « non indiqué » puis « sans nom · non confirmé », Pilote « Libre ». Tuile Machine du Menu : « Alarme » ou « Mise en service à faire ». |
| **Noter** | Les valeurs de `$10` (doit être 1 ou 3), `$13` (doit être 0), `$20`, `$21`, `$22`, `$23`, `$30`, `$31`, `$32` (doit être 0), `$110–$112`, `$120–$122`, `$130–$132`. Comparer à l'estimation de TESTING.md (« Spindle run on the simulator ») : ce sont les vraies valeurs qui comptent. |
| **Arrêter si** | Rien ne s'affiche après 30 s (vérifier le câble, le port) ; la tablette reste « Hors ligne » alors que le PC voit la carte (noter : défaut de flux, pas de machine). `$32=1` (mode laser) : s'arrêter, la machine est déclarée CNC et le serveur bloquera broche et plaque ; corriger `$32` au PC seulement sur décision du propriétaire. `$N0` ou `$N1` non vide avec un contenu inconnu, ou qui contient un mouvement (`G0`, `G1`, `G28`, `G30`…) ou une mise en route (`M3`, `M4`, `M7`, `M8`) : **arrêt avant tout `$H`**, noter le contenu ; le vider au PC seulement sur décision du propriétaire. Des blocs vides ou purement modaux connus (`G21`, `G90`, `G54`…) sont compatibles avec l'essai. |

## 3. Première vue sur la tablette et ouverture de l'assistant

| | |
| --- | --- |
| **Faire** | Rester sur le Menu (ou Suivi). Ne rien toucher. |
| **Voir** | La première fois qu'un vrai contrôleur est vu sur ce port, l'écran **Mise en service** s'ouvre de lui-même : titre « Avant de commencer », ligne « Mise en service · étape 1 / 9 · <port> », neuf points numérotés en haut, boutons « ← Précédent », « Passer cette étape », « Suivant → », et « Passer l'assistant… » en haut à droite. Si l'assistant ne s'ouvre pas (port déjà vu un jour), l'ouvrir : Menu › Machine › « Mise en service… », ou Réglages › Machine et performances › « Lancer l'assistant ». |
| **Capture** | **C2** : l'assistant à l'étape 1 avec le bandeau. |
| **Arrêter si** | L'écran est « Chargement incomplet » ou vide ; le bandeau n'a pas de Pilote ni de mot d'état. |

Les étapes 4 à 9 suivent l'assistant, une page par étape. À chaque page, « Suivant → » ne s'active que lorsque l'étape est validée ; « Passer cette étape » reste possible et sera noté « passé » au bilan.

## 4. Assistant — « Avant de commencer » et « Sauvegarde des réglages »

| | |
| --- | --- |
| **Faire** | Page 1 : cocher les trois cases (« Aucune fraise dans la broche… », « Zone de travail dégagée… », « Arrêt d'urgence à portée de main… ») seulement si c'est vrai. « Suivant → ». Page 2 « Sauvegarde des réglages » : si la carte est en alarme, « Relire les réglages ($$) » est grisé : passer d'abord par l'étape 5 ($X), revenir avec « ← Précédent ». Au repos : toucher « Relire les réglages ($$) », attendre, puis « Télécharger les réglages ($$) ». |
| **Voir** | « Carte : <firmware> » (noter le texte exact) ; « N réglages lus par CNCjs. » (34 sur le simulateur ; sur Grbl_ESP32 le nombre peut être plus grand) ; après téléchargement, « Réglages téléchargés. » et « Suivant → » actif. Le fichier `reglages-grbl-<port>-<date>.txt` est dans les téléchargements du navigateur du kiosque (à récupérer en SSH après l'essai). |
| **Capture** | **C3** : page Sauvegarde avec « N réglages lus ». |
| **Arrêter si** | « Aucun réglage lu » persiste au repos après deux « Relire » : la lecture `$$` ne fonctionne pas avec cette carte, et sans réglages ni `$H`, ni le type de machine, ni le contrôle de course ne seront possibles. Noter et s'arrêter là pour la tablette (le PC peut continuer ses relevés). |

## 5. Assistant — « Arrêt d'urgence » (et premier $X)

| | |
| --- | --- |
| **Faire** | Trois lampes : « 1. Appuyez sur l'arrêt d'urgence », « 2. Relâchez-le, puis déverrouillez », « 3. Machine revenue au repos ». Si la carte est **déjà en alarme** à l'arrivée sur la page, la lampe 1 dit « Déjà en alarme : déverrouillez d'abord ($X) » : toucher « Déverrouiller ($X)… », confirmer (voir ci-dessous), attendre « Repos ». Puis appuyer sur l'arrêt d'urgence, le relâcher, déverrouiller à nouveau. |
| **Confirmation $X** | Fenêtre « Déverrouiller la machine » : nom du port, « Machine : sans nom (type non confirmé) », « Pilote : … », texte « Le déverrouillage ($X) lève l'alarme sans aucun mouvement. La position peut être fausse : refaites la prise d'origine avant de travailler. », case « Je suis devant la machine et la cause de l'alarme est réglée. », compte à rebours « Confirmation valable N s. » (15 s), boutons « Annuler » / « Confirmer ». Cocher, confirmer avant la fin du compte. |
| **Voir** | Lampe 1 « Alarme détectée ✓ » (ou, si l'arrêt d'urgence réinitialise la carte, la même lampe passe par la détection du redémarrage), lampe 2 « Fait ✓ », lampe 3 « Idle ✓ ». Bandeau : « Alarme » → « Repos », cellule Pilote **« Cet appareil »** dès le premier $X accepté (la tablette prend le pilotage ; c'est attendu). Ligne de retour sous les commandes : « Demande envoyée… » puis le message du serveur. |
| **Si la carte ne voit pas l'arrêt d'urgence** | (il coupe seulement les moteurs) : toucher « La carte ne voit pas mon arrêt d'urgence », puis faire la preuve ci-dessous avant de cocher « Arrêt d'urgence enfoncé, les moteurs ne tiennent plus (vérifié à la main). ». L'étape est alors « vérifié à la main ». |
| **Preuve sur les axes (obligatoire)** | « Les moteurs ne tiennent plus » ne prouve rien seul : avec `$1` différent de 255, Grbl relâche déjà les moteurs au repos. Preuve acceptée, au choix : **a)** la carte voit l'arrêt d'urgence (lampe 1 « Alarme détectée ✓ » ou redémarrage détecté) ; **b)** `$1=255` : axe tenu (on sent le couple en poussant doucement le portique ou en tournant l'accouplement) bouton relâché, puis libre bouton enfoncé ; **c)** le voyant d'alimentation des drivers ou de la carte s'éteint bouton enfoncé. Noter laquelle (A8). **Aucune des trois** : l'action de l'arrêt d'urgence sur les axes n'est pas démontrée → **fin de l'essai** avant tout mouvement. La preuve sur la broche se fait à l'étape 9. |
| **Capture** | **C4** : les trois lampes vertes ; **C4b** : la fenêtre « Déverrouiller la machine ». |
| **Arrêter si** | $X ne ramène pas « Repos » (la cause de l'alarme n'est pas levée : lire l'encadré d'explication d'alarme de l'écran Machine ; la session est encore en v1 ici, le bloc « Condition actuelle » n'existe qu'après l'ouverture de la v2 à l'étape 11) ; un axe bouge au relâchement de l'arrêt d'urgence ; preuve sur les axes impossible (ci-dessus). |

## 6. Assistant — « Fins de course » (= l'alarme volontaire, sans mouvement)

C'est ici que l'on provoque une alarme **sans faire bouger la machine** : on appuie à la main sur chaque capteur. Aucun déplacement vers une butée dans ce protocole.

| | |
| --- | --- |
| **Faire** | Page « Fins de course » : appuyer à la main sur le capteur X, le relâcher ; puis Y ; puis Z (les deux d'un même axe s'il y en a deux). Si `$21=0`, l'appui est seulement lu (pas d'alarme) : les trois lampes passent à « vu ✓ » sur la page, noter qu'il n'y a pas eu d'alarme volontaire. Si `$21=1` (limites matérielles), **le premier appui met la carte en alarme critique** (Alarme 1) : voir la récupération ci-dessous. |
| **Récupération après une fin de course ($21=1)** | Grbl 1.1 bloque tout après une limite matérielle (« Reset to continue ») : `$X` seul est refusé ou ignoré, et la carte cesse d'envoyer ses rapports (les contacts ne sont plus suivis). **Ce n'est pas une panne.** Dans l'ordre : **1)** capteur relâché ; **2)** prendre la capture **C5** (bandeau « Alarme 1 », puis rail **Machine**) ; **3)** au PC, bouton **Reset** du widget Grbl (réinitialisation logicielle, aucun mouvement ; les commandes en attente sont abandonnées) ; **4)** attendre sur le bandeau un rapport frais (« < 1 s ») et l'état « Alarme » ordinaire ; **5)** sur la tablette, Machine › **« Mise en service… »** (le rail Machine n'a pas de « Retour » ; rouvrir l'assistant remet à zéro l'observation de la page Fins de course), puis « Déverrouiller ($X)… » sur la page ; **6)** une fois « Repos », refaire les **trois** contacts X, Y, Z **sans quitter la page** et valider. Chaque nouvel appui relance l'alarme critique : si c'est le cas, valider la page avec « Passer cette étape » et noter « fins de course vues une à une, alarme critique à chaque appui » (6a ✗ expliqué, pas un arrêt). Après ce Reset, la position est perdue : l'étape 8 (`$H`) la rétablit. |
| **Voir** | Lampes « Axe X / Y / Z » : « au repos » → « · CONTACT » pendant l'appui → « vu ✓ ». Bandeau pendant l'alarme : **« Alarme 1 »**. Écran Machine (v1 à ce stade) : mot « Alarme 1 », encadré « Alarme 1 : Fin de course touchée » avec « La position machine est perdue. Dégagez l'axe de la butée… déverrouillez ($X) puis refaites la prise d'origine ($H). ». Le bloc « Condition actuelle » n'existe qu'en v2, après l'étape 11. Après Reset puis $X : « Repos ». |
| **Capture** | **C5** : bandeau « Alarme 1 » + écran Machine ; **C5b** : les trois axes « vu ✓ ». |
| **Arrêter si** | « Contact actif sans appui : X » (câblage ou `$5` inversé) ; « Contacts non lus » qui persiste au repos avec rapports frais (la carte n'envoie pas `Pn:`) ; une alarme qui ne se lève ni avec Reset puis $X, ni avec Reset puis $H. |

## 7. Assistant — « Sonde »

| | |
| --- | --- |
| **Faire** | Brancher la sonde si elle existe. Toucher la plaque avec la pince de sonde tenue à la main (hors de la broche), relâcher. Sans sonde : « Passer cette étape ». **Puis** : plaque et pince de sonde retirées de la broche, câbles rangés hors des courses de X, Y et Z. On ne les rebranche qu'à l'étape 17. |
| **Voir** | Lampe « Sonde (P) » : « libre » → « CONTACT » → « vu puis relâché ✓ ». |
| **Arrêter si** | « Contact actif sans appui » (`$6` inversé) : la plaque de l'étape 17 ne doit alors **pas** être utilisée. |

## 8. Assistant — « Prise d'origine » ($H, premier mouvement)

Le surveillant a la main sur l'arrêt d'urgence. La machine va se déplacer seule.

| | |
| --- | --- |
| **Avant** | Vérifier : blocs `$N0` / `$N1` relevés à l'étape 2 vides ou connus et compatibles (sinon pas de `$H`) ; plaque et pince de sonde retirées, câbles hors des courses. |
| **Faire** | Cocher « Main sur l'arrêt d'urgence, zone dégagée. ». Toucher « Lancer la prise d'origine ($H)… ». Fenêtre « Lancer la prise d'origine » : « La prise d'origine ($H) déplace chaque axe jusqu'à ses capteurs. Dégagez la zone de travail. », case « Je suis devant la machine et la zone est dégagée. ». Confirmer. |
| **Voir** | Bandeau : « Prise d'origine » (la carte n'envoie pas de rapport pendant le cycle, l'âge peut monter : normal). Page : « Prise d'origine en cours… » puis « Prise d'origine terminée ✓ », bandeau « Repos ». Z part en premier, puis X et Y, chaque axe touche son capteur, recule, retouche lentement. |
| **Si grisé** | Le bouton est grisé avec une raison sous lui : « Réglage $22 inconnu : relisez les réglages de la carte. » (refaire l'étape 4) ; « Prise d'origine désactivée sur la carte ($22=0). » (pas de $H sur cette machine : « Passer cette étape », et le contrôle de course restera « non vérifié ») ; « La broche tourne encore… ». |
| **Échec** | « Échec : alarme pendant la prise d'origine (contact non trouvé ?). Déverrouillez, vérifiez la fin de course puis relancez. » avec bandeau « Alarme 8 » ou « Alarme 9 » : déverrouiller, chercher la cause (sens `$23`, course `$130–$132`), relancer une fois ; au second échec, arrêter. |
| **Capture** | **C6** : « Prise d'origine terminée ✓ » ; **C6b** : fenêtre de confirmation $H. |
| **Arrêter si** | Un axe part à l'opposé de son capteur ou n'arrête pas au contact : **arrêt d'urgence**. Le mouvement continue après « Arrêter » du bandeau (qui, pendant un $H, envoie une réinitialisation : attendu « Prise d'origine interrompue (réinitialisation). La carte demandera $H ou $X. »). |

Noter sur le PC, après le cycle, `?` → MPos de chaque axe (c'est le relevé que demande HANDOFF.md étape 10.0 pour plus tard).

## 9. Assistant — « Broche et variateur » (sans fraise)

| | |
| --- | --- |
| **Faire** | Plaque et pince de sonde retirées de la broche, câbles hors des courses. Cocher « Aucune fraise dans la pince… » et « Variateur sous tension, câbles et mains loin de la broche. ». Toucher « Démarrer à N tr/min… » (N = `$31`, ou `$30`/4 si `$31` vaut 0). Fenêtre « Démarrer la broche » : « Le test fait tourner la broche. Tenez mains et objets à distance de l'outil. », case « Je suis devant la machine et l'outil peut tourner. ». Confirmer. Observer 10 s. Toucher « Arrêter la broche (M5) ». |
| **Preuve arrêt d'urgence sur la broche (obligatoire)** | Relancer la broche de la même façon, puis le surveillant **appuie sur l'arrêt d'urgence** : la broche doit ralentir et s'arrêter (roue libre du variateur tolérée, quelques secondes). Relâcher ; la carte peut être en alarme ou réinitialisée : **Déverrouiller…** (et, si la position a été perdue, refaire l'étape 8 `$H`). Noter le résultat (A8). Broche qui continue à tourner sous arrêt d'urgence : **fin de l'essai** pour tout ce qui fait tourner la broche (étapes 15 et 16 non faites). |
| **Voir** | « Broche : N tr/min demandés », bandeau cellule « Broche » = N tr/min. Après M5 : « Broche arrêtée ✓ », trois cases apparaissent : sens horaire vu du dessus, pas de bruit anormal, « Le variateur affiche environ N/60 Hz. ». Cocher ce qui est vrai. |
| **Si grisé** | Raison sous le bouton : « Vitesse maximale de broche ($30) inconnue… » (étape 4), ou un refus `$32` (« Mode laser actif sur la carte ($32=1)… ») : s'arrêter pour la broche, noter. |
| **Capture** | **C7** : « Broche : N tr/min demandés » avec le bandeau. |
| **Arrêter si** | La broche tourne dans le mauvais sens (noter, M5, ne pas relancer : le câblage du variateur est à corriger) ; ne s'arrête pas sur M5 (**arrêt d'urgence**) ; l'écran ne voit pas la vitesse (« Broche à l'arrêt » alors qu'elle tourne : le rapport `FS:` manque, noter). |

Quitter la page de la broche arrête toujours la broche (M5 renvoyé) : c'est prévu.

## 10. Déclaration du type de machine : CNC

| | |
| --- | --- |
| **Faire** | Réglages › Machine et performances › « Type de machine · Serveur CNCjs ». La ligne doit dire « Machine : type non choisi · <port> » (et non « réglages $$ pas encore lus »). Machine au repos, broche arrêtée. Toucher **CNC**. |
| **Voir** | « Demande envoyée… » puis **« Type enregistré : CNC. »** ; le bouton CNC reste enfoncé ; l'avertissement « Type de machine non confirmé : l'interface CNC est utilisée… » disparaît. Bandeau, cellule Machine : « CNC · CNC ». Juste en dessous, la carte « **Interface Performance v2** · Cette tablette » apparaît avec « Activée » (c'est la valeur par défaut) ; si l'écran est encore en v1, elle peut afficher « Changement préparé pour la prochaine session au repos ». Journal › Serveur : une entrée pour le changement de type. |
| **Capture** | **C8** : la carte Type de machine après « Type enregistré : CNC. » et la carte v2 dessous. |
| **Arrêter si** | Refus « ETOUCH… » affiché en clair : « Version ou réglages de la carte ($$) non lus… » (étape 4), « La machine doit être au repos… », « Pilotage attribué à … ». Un refus sans texte. |

## 11. Ouverture de la v2 (rechargement de la page au repos)

La v2 ne s'ouvre qu'à une ouverture de page avec un **premier rapport au repos** (Idle, broche à 0, sans travail). Comme la carte était en alarme à la mise sous tension, la session en cours est restée en v1 : il faut recharger la page, machine au repos. Le kiosque n'a pas de bouton « recharger » ; on passe par la langue.

| | |
| --- | --- |
| **Faire** | Réglages, en-tête « Votre écran » (visible sur les trois onglets) : sélecteur « Langue de l'interface » → **English** → « Appliquer et recharger » (avertissement : le journal de cette page est effacé ; l'exporter d'abord si l'on y tient, comme au § 19). La page revient en anglais. Refaire : Settings, en-tête « Your display » › « Interface language » → **Français** → « Apply and reload ». |
| **Voir** | Après le second rechargement, au repos : Menu, puis **Suivi** : grande scène à gauche, bande de confiance sous la scène (repère « G54 · mm », fraîcheur « Rapport frais · < 1 s », « Géométrie inconnue » tant qu'aucun programme n'est chargé), colonne de surveillance à droite (ligne acquittée, temps restant, coordonnées, avance et S rapportés, courbe, corrections d'avance, « Broche / rapides… », « Détail du temps »), commandes « Démarrer… », « Pause », « Arrêter le travail » en bas. Réglages › Machine et performances : « Interface v2 active pour cette session. » et une carte « Rendu 3D de cette session » (Qualité complète / Rendu allégé / Arrêter le rendu 3D, « Diagnostic du rendu », « Mesurer 60 images »). **Machine** : blocs « Condition actuelle » (« État : Repos », « Aucune alarme rapportée. », « Rapport frais · âge 0,x s », « Appareil pilote : … ») et « Paramètres de course » (« 13/13 paramètres connus » attendu). |
| **Si la v2 ne s'ouvre pas** | Réglages › Machine et performances : vérifier Performance enfoncé, « Interface Performance v2 » Activée, Type « CNC » ; bandeau « Repos », Broche « 0 tr/min ». Recharger une fois de plus. Si toujours v1 : **continuer en v1**, le reste du protocole vaut aussi en v1 (les écrans v1 sont décrits entre parenthèses) ; noter « v2 non ouverte » avec la raison affichée dans « Diagnostic du rendu » s'il existe. |
| **Capture** | **C9** : Suivi v2 au repos, sans programme ; **C9b** : Machine v2 « Paramètres de course » ; **C9c** : « Diagnostic du rendu » (GPU matériel : Oui, résolution, DPR). |
| **Arrêter si** | Rien : cette étape n'envoie rien à la machine. Un rechargement qui tombe sur « Chargement incomplet » se note et se recommence une fois. |

## 12. Vérification à blanc des flèches de Préparer (aucun mouvement)

| | |
| --- | --- |
| **Faire** | Rail « Préparer ». En v2 : scène « Placement · dessus XY · affichage seul », colonne « 1 · Programme chargé » (« Aucun programme chargé ») et « 2 · Origine X Y » ; « Poser X Y ici… » grisé avec « Indisponible : aucun programme chargé. » (ou « … « Déplacement réel » non activé sur ce poste. ») — c'est attendu. Toucher « **Vérifier un déplacement sans bouger…** » (« Vérifier un déplacement… » si la tablette est encore en `91372563` ; en v1 : les flèches sont directement sur l'écran, étiquette « VÉRIFICATION SEULE »). Toucher une fois **X+**, prendre la capture **C10**, puis toucher une fois **Z−**. |
| **Voir** | Ligne d'état : « Vérifier le déplacement · aucun mouvement envoyé · pas 1 mm · 800 mm/min. » puis, après X+, « Vérification par le serveur… » et **« Vérifié par le serveur : X+ · 1 mm · 800 mm/min. Aucun mouvement envoyé. »** (capture C10) ; après Z−, la même ligne avec **Z−** (le dernier retour remplace le précédent). En v1, les boutons « Zéro X / Y / Z » et « Zéro XYZ » de la carte des coordonnées sont grisés (« Origines non activées ») ; en v2 cette carte n'est pas montrée à côté de la comparaison, c'est normal. Le surveillant confirme : **rien n'a bougé**. « Revenir à la comparaison ». |
| **Si refusé** | « Vérification refusée par le serveur. … Aucun mouvement envoyé. » avec une raison (`$13`, état, pilote) : noter le texte exact ; ce n'est pas bloquant pour la suite. |
| **Capture** | **C10** : la ligne « Vérifié par le serveur : … ». |
| **Arrêter si** | **Un axe bouge** sur une flèche de vérification : arrêt d'urgence, fin de l'essai, c'est un défaut grave à remonter tel quel. |

## 13. Pilotage : libérer le port pour le PC, puis poser l'origine depuis le PC

Depuis le premier $X, la tablette **pilote** le port (bandeau : Pilote « Cet appareil »). Tant qu'elle pilote, le PC se voit refuser tout ce qui déplace la machine (une ligne « Pilotage de <port> attribué à tablette … » dans sa console). Le serveur libère le pilotage après **5 minutes sans action de la tablette, machine au repos**. Il n'y a pas de bouton pour le rendre plus tôt.

| | |
| --- | --- |
| **Faire** | Ne plus toucher aucune commande sur la tablette pendant 5 min (regarder les écrans est permis : Journal, Machine, Réglages). Quand le bandeau affiche Pilote **« Libre »** (et la ligne de retour du Suivi « Pilotage de cet appareil libéré après 5 min d'inactivité. »), passer au PC : jog lent (200 mm/min) pour amener la broche **au-dessus du centre de la table, à 30 mm au moins au-dessus de tout**, **et à 10 mm au moins sous la butée haute de Z** (le fichier commence par `G0 Z5` : il faut plus de 5 mm de réserve vers le haut, avec marge ; contrôler au PC que MPos Z à cet endroit est au moins 10 mm plus bas que MPos Z juste après `$H`, ou que la course restante vers le haut le permet). À cet endroit, monter Z de 5 mm en jog lent puis redescendre de 5 mm, pour voir le trajet Z0–Z5 complet, puis mettre **X, Y et Z à zéro** à cet endroit (G54). Dans la console : `$#` et `?`, copier (capture **C11**). |
| **Voir (tablette)** | Suivi : carte « Travail · G54 » X 0,000 Y 0,000 Z 0,000, carte « Machine » avec les MPos ; pendant le jog, bandeau « Déplacement » puis « Repos ». Préparer v2 : scène avec l'origine actuelle ; v1 : table « Coordonnées du contrôleur · mm ». Rien à toucher. |
| **Arrêter si** | Le PC est refusé alors que le bandeau dit « Libre » (noter le message exact) ; les coordonnées de la tablette ne suivent pas le jog (bandeau « Rapport ancien »). |

Astuce de rythme : les 5 minutes peuvent servir à la pause-café ou à relire les notes. Ne pas les « gagner » en relançant CNCjs : le bail suivrait de toute façon la tablette.

## 14. Fichier d'essai : ajouter, charger, régler les rapides à 25 %

Le fichier d'essai est celui de l'assistant (`essai-en-l-air.nc`) : carré de 40 mm à Z0 autour de l'origine, `G0 Z5` avant et après, `M3 S<N> · G4 P3`, avance 1000 mm/min, `M5`, `M2`. Il ne descend jamais sous Z0 : avec Z0 posé 30 mm au-dessus de tout, il reste en l'air.

| | |
| --- | --- |
| **Faire** | Reprendre l'assistant (Réglages › Machine et performances › « Reprendre l'assistant » ; il revient sur l'étape où il était ; aller à « Fichier « en l'air » » avec « Suivant → » / « Passer cette étape » si besoin). Toucher « Ajouter le fichier d'essai » → « Fichier d'essai ajouté à la bibliothèque. » Toucher « Ouvrir Fichiers → ». Dans **Fichiers**, sélectionner `essai-en-l-air.nc` (la liste peut mettre quelques secondes : « Actualiser » si besoin). Vérifier l'aperçu (carré) et, en v2, les deux colonnes « Sélection » / « Chargé dans la machine ». Toucher **« Charger et ouvrir le Suivi »**. |
| **Voir** | Le Suivi s'ouvre de lui-même. Nom du fichier dans le titre et dans la cellule « Fichier » du bandeau. Ligne de préparation **« Fichier chargé, prêt à démarrer. »** (ton vert). En v2 : bande « Programme chargé : essai-en-l-air.nc », « Géométrie complète » ou « simplifiée » après quelques secondes, frise « Séquence prévue · estimée ». Préparer v2 montre maintenant le carré placé contre la course avec « Dans la course machine en X et Y » (ou « △ Course machine non vérifiée » si `$23` inverse X ou Y : acceptable, noter). La tablette reprend le pilotage (« Cet appareil ») : attendu. |
| **Rapides** | Dans le Suivi, bloc « Corrections » (v2 : bouton « Broche / rapides… » ouvre la fiche) : ligne « Rapides », toucher **25 %**. Attendu : « Correction rapide : 25 %. » dans la ligne de retour, le bouton 25 % enfoncé, note « Rapides ralentis : Grbl revient à 100 % à la fin du programme (M2/M30) ou après un arrêt. ». Si grisé : « La vitesse des rapides se règle machine au repos (Idle) ou pendant un travail. » → attendre « Repos ». |
| **Capture** | **C12** : Suivi avec « Fichier chargé, prêt à démarrer. » et Rapides 25 % ; **C12b** : Préparer v2 avec le verdict de course. |
| **Arrêter si** | « Charger et ouvrir le Suivi » refusé avec une raison inattendue ; l'aperçu ne correspond pas à un carré ; le verdict dit « Hors course machine » (l'origine est mal placée : refaire l'étape 13). |

## 15. Premier passage complet (en l'air, broche à vitesse mini, rapides 25 %)

Surveillant : main sur l'arrêt d'urgence du début à la fin. Opérateur : un doigt prêt sur **Arrêter** (carré rouge) dans le bandeau.

| | |
| --- | --- |
| **Avant** | Plaque et pince de sonde retirées de la broche, câbles hors des courses. |
| **Faire** | Suivi › **« Démarrer… »**. Fenêtre « Confirmer le démarrage » : nom du fichier, port, « Machine : « CNC » (CNC) · Pilote : Cet appareil », bloc « Contrôle des courses (pas une simulation de collisions) » avec un verdict **« dans la course »** (ou « non vérifié » ; **« HORS COURSE »** = ne pas démarrer), texte « Cette action met la machine en mouvement et peut activer l'outil. Vérifiez la machine, l'origine et la zone de travail. », case « Je suis devant la machine et prêt à lancer ce fichier. », compte à rebours 15 s. **Pour chaque axe « non vérifié »** : Annuler, et vérifier à la main avant de revenir (sans mouvement : la tablette pilote de nouveau le port) — X et Y : au mètre, la broche est à plus de 25 mm de chaque bout de course dans les deux sens (comparer les MPos de l'origine, notées à l'étape 13, à celles après `$H` de l'étape 8 et aux courses `$130`/`$131`), et rien ne dépasse dans un carré de 50 mm autour de la broche ; Z : réserve vers le haut et trajet Z0–Z5 déjà vus à l'étape 13 (sinon ne pas démarrer). Noter « vérifié à la main : X / Y / Z », puis rouvrir « Démarrer… ». Tout axe « dans la course » ou vérifié à la main : cocher, **Confirmer**. |
| **Voir, dans l'ordre** | Ligne de retour « Demande envoyée… » puis **« Démarrage demandé. »** ; bandeau **« En cours »**, Avance et Broche vivantes ; la machine monte à Z5 (25 % de la vitesse rapide), va au coin, la broche démarre (3 s d'attente), descend à Z0 à 300 mm/min, fait le carré à 1000 mm/min, remonte, M5, revient au centre. Suivi v2 : repère d'outil qui avance sur le carré, lignes acquittées en orange, bande « Rapport frais · < 1 s », « Ligne acquittée n / N », « Reste … » avec sa source, courbe de la dernière minute (v1 : image fixe + tracé orange, « Avance réelle 1000 mm/min · Broche N tr/min », pourcentage). À la fin : **« Terminé — programme exécuté jusqu'au bout »**, 100 %, bandeau **« Repos »**, Broche 0, bandeau de bilan « Travail terminé · essai-en-l-air.nc · durée … · N lignes » avec son bouton « OK », note « Rapides » revenue à « Rapides à 25 % conseillés pour le premier essai d'un programme. » (Grbl a remis 100 %). |
| **Mesurer** | Le surveillant note : la broche a-t-elle démarré avant la descente ? la descente s'est-elle arrêtée à Z0 (30 mm au-dessus de la table) ? le carré fait-il bien ~40 mm ? les rapides étaient-ils visiblement lents ? |
| **Capture** | **C13** : Suivi **pendant** le carré (repère sur le tracé, bandeau « En cours ») ; **C13b** : Suivi à « Terminé » avec le bilan. |
| **Arrêter si** | Descente qui continue sous Z0 → **Arrêter** puis arrêt d'urgence ; broche qui ne démarre pas alors que l'écran affiche N tr/min (noter, laisser finir en l'air, ce n'est pas dangereux) ; « Rapport ancien » ou « État perdu » pendant le mouvement → **Arrêter** aussitôt, arrêt d'urgence si l'immobilisation n'est pas immédiatement vérifiable (règle générale) ; un « Travail bloqué ? Grbl est au repos depuis N s… » (noter, « Arrêter »). |

Pour clore l'assistant : Réglages › Machine et performances › « Reprendre l'assistant », page « Fichier « en l'air » ». L'assistant ne voit le run que s'il était affiché pendant celui-ci ; et comme il a été quitté entre-temps, la case « Le programme s'est déroulé normalement jusqu'au bout. » peut ne pas apparaître. Dans ce cas, toucher « Passer cette étape » : le bilan dira « passé », ce qui est honnête (le résultat réel est dans le Journal et dans les captures C13). Puis « Bilan » → « Terminer ✓ ». Réglages affiche alors « Faite le <date> · <port> ».

## 16. Second passage : Pause, correction d'avance, Reprendre, Arrêter

| | |
| --- | --- |
| **Faire** | Suivi › « Recharger le fichier » (le serveur demande un rechargement avant tout nouveau départ : « Rechargez le fichier pour un nouveau départ. »). Rapides 25 % à nouveau. « Démarrer… », confirmer comme à l'étape 15. Le carré dure environ 9,6 s à 1000 mm/min (8,7 s à 110 %) : le minutage compte. **1)** Bandeau **Pause** **dès que l'outil commence le premier côté du carré** (juste après la descente à Z0). **2)** Pendant la pause (environ 5 s) : bloc Corrections, ligne « Avance », **+10 %**. **3)** Bandeau **Reprendre…**, confirmer. **4)** **Environ 2 s** après la reprise, axes encore en mouvement sur le carré : bandeau **Arrêter**. Si le programme est déjà fini (ou remonté, M5) au moment d'Arrêter : noter « test Arrêter non réalisé » (16d —) et le refaire une fois après « Recharger le fichier », en touchant Arrêter 2 s après le début du carré, sans pause. |
| **Voir 1) Pause** | Ligne de retour « Pause demandée. Attendre l'état Hold. » puis **« Pause confirmée : la machine est en Hold. »** ; bandeau **« Pause »** (icône deux barres), **« Reprendre… »** prend la place de Pause, « Arrêter » reste ; les axes s'arrêtent (décélération) ; **la broche continue de tourner** et l'écran l'annonce : « Pause : les axes sont arrêtés mais la broche tourne toujours (Grbl ne l'arrête pas en pause). Ne mettez pas les mains près de l'outil. ». Suivi : « En pause — … » ; v2 : repère immobile, « Comparaison suspendue : travail en pause. » dans Préparer. |
| **Voir 2) +10 %** | « Correction avance : +10 %. », cellule « Avance » du bloc = « 110 % ». (Sur la ligne Broche, ne rien toucher.) |
| **Voir 3) Reprendre** | Fenêtre « Confirmer la reprise », case « Je suis devant la machine et prêt à reprendre ce fichier. » ; puis « Reprise demandée. », bandeau « En cours », la machine repart **exactement** là où elle s'était arrêtée, à 110 % de l'avance (1100 mm/min dans le bandeau). |
| **Voir 4) Arrêter** | « Arrêt demandé. Vérifiez l'immobilisation ; ce bouton ne remplace pas l'arrêt physique. » ; les axes commencent à ralentir dans la seconde et sont immobiles en 2 s au plus (feed hold, critère de la règle générale) ; puis la carte est réinitialisée (le serveur attend l'immobilisation, avec une échéance interne de 5 s qui n'est pas une tolérance pour l'opérateur) : broche coupée, bandeau **« Repos »** — ou **« Alarme 3 » avec « déduite » dessous** si la réinitialisation a rattrapé la décélération (Grbl : « Réinitialisation pendant un mouvement »). Les deux sont acceptables ; en cas d'Alarme 3 : **Déverrouiller…** depuis le bandeau, puis **refaire $H** (Machine › « Prise d'origine ($H)… ») avant toute autre chose, et refaire l'origine au PC (étape 13) si l'on veut relancer. Suivi : bilan « Travail arrêté avant la fin · essai-en-l-air.nc · durée … · n / N lignes », « Travail arrêté — temps restant indisponible », « Rechargez le fichier pour un nouveau départ. », bouton « Reprendre à une ligne… » visible. Note Rapides revenue (100 %). |
| **Capture** | **C14** : bandeau « Pause » + avertissement broche ; **C14b** : ligne « Correction avance : +10 %. » ; **C14c** : état après Arrêter (bilan, bandeau « Repos » ou « Alarme 3 déduite »). |
| **Arrêter si** | Pause n'arrête pas les axes dans la seconde → **Arrêter**, puis arrêt d'urgence ; Reprendre repart d'un autre point ou à une autre vitesse que prévu ; après Arrêter, les axes n'ont pas commencé à ralentir dans la seconde ou bougent encore après 2 s → arrêt d'urgence ; la broche tourne encore 5 s après « Repos ». |

Facultatif, sans risque (lecture seule) : toucher « Reprendre à une ligne… », lire « Dernier arrêt après la ligne N (acquittée). Grbl exécute jusqu'à 15 mouvements plus tard : ligne proposée M. », toucher « Vérifier », lire le plan (« Ligne M / N : … Départ : Z 5, puis X … Y …, plongée à Z … Broche M3 S… relancée 3 s avant la plongée. »), puis **« Annuler »**. Ne pas charger la reprise vendredi. Capture **C15**.

## 17. Zéro Z avec la plaque, en l'air (facultatif — seulement si la sonde a été vue à l'étape 7)

Protocole de HANDOFF.md étape 9.2, machine au repos, outil **sans fraise** (la pince touche la plaque). La plaque n'est **jamais tenue à la main** : le serveur commande réellement deux descentes et des remontées.

| | |
| --- | --- |
| **Installer** | Rebrancher la sonde (pince sur la broche, câble guidé hors des courses). Plaque **immobilisée sur un support stable** (cale ou bloc posé sur la table, plaque scotchée ou bridée), sous la pince ; **mains hors de la trajectoire** pendant tout le palpage. Mesurer au réglet l'écart pince–dessus de plaque : il doit être **nettement inférieur** à la descente maximale (viser 8 à 12 mm pour une descente maximale de 20 mm). Vérifier le trajet complet sans contact : 20 mm sous la pince, rien d'autre que la plaque (ni bride, ni câble). Si ces conditions ne peuvent pas être réunies : **passer l'étape 17** (17a/17b —). |
| **Faire** | Suivi, bloc « Zéro Z avec une plaque » : « Épaisseur de la plaque (mm) » = l'épaisseur mesurée au pied à coulisse, « Descente maximale (mm) » = 20. Toucher « Palper le zéro Z… ». Fenêtre « Régler le zéro Z avec la plaque » : « Le palpage descend Z jusqu'au contact avec la plaque. Vérifiez la plaque et la pince. », note « Plaque de E mm posée sous l'outil et sonde branchée ? Descente de 20 mm au plus ; le dessus de la plaque deviendra Z = épaisseur, puis l'outil remontera 5 mm au-dessus. », case « Je suis devant la machine, la plaque et la pince sont en place. ». Confirmer. |
| **Voir** | Bandeau **« Palpage »** ; descente à 100 mm/min, recul 1 mm, seconde touche à 25 mm/min, remontée de 5 mm ; puis « Dernier zéro Z : plaque E mm, repère G54, contact à Z machine … ». Suivi, carte Travail : **Z = E + 5** (le dessus de la plaque vaut Z = E, l'outil remonte 5 mm au-dessus ; exemple : E = 10 mm → Z = +15,000), avec un dégagement physique de 5 mm entre la pince et la plaque. Au PC : `$G` doit toujours montrer `G90` et `G21`. |
| **Deux échecs à provoquer (facultatif)** | a) **sonde déjà en contact** : tant que la sonde est en contact, le bloc « Zéro Z avec une plaque » est **masqué** (attendu : le palpage n'est pas permis). Pour tester la garde finale du serveur : sonde libre, toucher « Palper le zéro Z… » pour ouvrir la confirmation, **puis** établir le contact sans rien mettre sous la broche (pince retirée de la broche et pincée sur la plaque posée à l'écart, mains hors de la trajectoire de Z), puis cocher et Confirmer : refus « La sonde est déjà en contact : dégagez-la avant de palper. », rien ne bouge. b) plaque **hors de portée** (support retiré, rien sur 20 mm sous la pince) : descente de 20 mm puis **« Alarme 5 »** « Palpage sans contact », bandeau « Alarme 5 » ; pendant l'alarme le bloc plaque est masqué (attendu) : **Déverrouiller…**, puis $H si la carte le demande, et c'est **au retour au repos** que le Suivi montre « Dernier palpage échoué : … ». |
| **Capture** | **C16** : « Dernier zéro Z : … » ; **C16b** : « Alarme 5 » si provoquée. |
| **Arrêter si** | La descente ne s'arrête pas au contact (plaque touchée, Z continue) → **Arrêter** (« Palpage interrompu. Vérifiez l'immobilisation ; le zéro Z n'est pas réglé. ») puis arrêt d'urgence. Un palpage qui part alors que « Palper le zéro Z… » était grisé. |

Après cette étape, l'origine Z n'est plus celle du PC : ne pas relancer le fichier d'essai sans refaire Z0 à 30 mm au-dessus de tout.

## 18. Retour en v1 Éco, puis retour en Performance

| | |
| --- | --- |
| **Faire** | Machine au repos. Réglages › Machine et performances › « Performances de cette tablette » → **Éco**. |
| **Voir** | « Enregistré dans ce navigateur uniquement. » ; au repos, la disposition revient aussitôt à la v1 (Suivi : image fixe, cartes v1) ; carte « Interface Performance v2 » : masquée ou « Changement préparé pour la prochaine session au repos » ; bandeau inchangé (Pause / Arrêter à la même place). Aucune commande n'est envoyée (bandeau toujours « Repos », rien ne bouge). Ouvrir Suivi, Fichiers, Préparer, Machine en v1 : tout lisible ; « Démarrer… » **grisé** avec la demande de rechargement (« Rechargez le fichier pour un nouveau départ. ») puisque le travail précédent a commencé — le passage en Éco ne recharge rien. Ne pas recharger ni démarrer. |
| **Puis** | Réglages → **Performance** : « Enregistré dans ce navigateur uniquement. » ; la v2 revient à la prochaine ouverture au repos (recharger comme à l'étape 11 si l'on veut le vérifier tout de suite). |
| **Capture** | **C17** : Suivi en v1 Éco avec le programme chargé. |
| **Arrêter si** | Le passage en Éco envoie une commande (bandeau qui change d'état, Journal › Serveur avec une commande) : noter, c'est un défaut. |

## 19. Fin d'essai

1. Broche arrêtée, machine au repos, « Repos » au bandeau.
2. **Journal** : « Exporter le journal » → « Rapport texte » puis « Fichier JSON » (les fichiers vont dans les téléchargements du kiosque). Filtrer « Alarmes » et « Travaux » et photographier (**C18**).
3. Journal (v2) › « Serveur » : vérifier que les travaux, le type de machine et les alarmes y sont.
4. Réglages › Machine et performances › « Mise en service de la machine » : « Faite le … » (ou « Passée le … » / « En cours : étape … »). Photo **C19**.
5. PC : fermer le port (Close) ; vérifier sur la tablette : bandeau « Hors ligne », Pilote « — ».
6. Récupérer en SSH : `~/Downloads` du kiosque (réglages `$$`, journal, diagnostic) — hors protocole, après coup.
7. Éteindre la CNC, débrancher.

## Annexe A. Grille à cocher

Cocher ✓ (vu comme écrit), ✗ (différent : noter), — (passé). Une case ✗ n'arrête pas forcément l'essai : la règle d'arrêt est dans chaque étape.

| # | Étape | ✓ / ✗ / — | Note (texte exact à l'écran si ✗) |
| --- | --- | --- | --- |
| A1 | Kiosque sur le Menu, « Hors ligne », « MACHINE RÉELLE » | | |
| A2 | Version installée notée (`91372563`, ou `99773663` si redéployée) (Réglages › Système › Tablette) | | |
| A3 | Performance enfoncé ; Type « Machine : — » | | |
| A4 | Diagnostic de cette tablette : GPU matériel, export fait | | |
| A5 | PC : CNCjs classique ouvert, connecté | | |
| A6 | `.cncrc` sans `touch.motion.enabled` | | |
| A7 | Machine : pas de fraise, table vide, arrêt d'urgence testé | | |
| A8 | Type d'arrêt d'urgence noté (moteurs / carte / variateur) ; preuve axes (a, b ou c, étape 5) ; preuve broche (étape 9) | | |
| 2a | Port ouvert au PC, bannière Grbl notée | | |
| 2b | `$$`, `$I`, `$G`, `$#`, `$N` copiés ; `$10`, `$13=0`, `$32=0` vérifiés ; `$N0`/`$N1` vides ou connus et compatibles | | |
| 2c | Tablette : mot d'état suit (« Alarme » ou « Repos »), âge « < 1 s » | | |
| 3 | Assistant ouvert de lui-même (ou ouvert à la main) | | |
| 4a | 3 cases « Avant de commencer » | | |
| 4b | « N réglages lus », « Réglages téléchargés. » | | |
| 5a | $X via la fenêtre « Déverrouiller la machine » → « Repos » | | |
| 5b | Pilote « Cet appareil » après le premier $X | | |
| 5c | Arrêt d'urgence : 3 lampes ✓ (ou « vérifié à la main » avec preuve a, b ou c) | | |
| 6a | Fins de course X, Y, Z « vu ✓ » (si `$21=1` : Reset au PC puis $X, contacts refaits sans quitter la page) | | |
| 6b | Alarme 1 vue au bandeau et expliquée sur Machine (si `$21=1`) | | |
| 7 | Sonde « vu puis relâché ✓ » (ou passée) | | |
| 8a | $H via « Lancer la prise d'origine » → « Prise d'origine terminée ✓ » | | |
| 8b | Sens de chaque axe correct, arrêt au capteur | | |
| 8c | MPos après $H notées (PC) | | |
| 9a | Broche : « N tr/min demandés », bandeau Broche = N | | |
| 9b | M5 → « Broche arrêtée ✓ », sens horaire, Hz du variateur | | |
| 9c | Arrêt d'urgence enfoncé, broche en marche → la broche s'arrête | | |
| 10 | « Type enregistré : CNC. », bandeau « CNC · CNC » | | |
| 11a | Rechargement par la langue (EN puis FR) | | |
| 11b | v2 ouverte : Suivi scène + colonne, Machine « 13/13 paramètres connus » | | |
| 11c | « Diagnostic du rendu » : GPU matériel Oui | | |
| 12 | « Vérifié par le serveur : X+ · 1 mm · 800 mm/min. Aucun mouvement envoyé. » (capturé avant Z−), puis Z−, et **rien n'a bougé** | | |
| 13a | Pilote « Libre » après 5 min | | |
| 13b | Origine XYZ posée au PC, réserve Z vers le haut ≥ 10 mm, trajet Z0–Z5 vu ; tablette Travail 0/0/0 | | |
| 14a | « Fichier d'essai ajouté à la bibliothèque. » | | |
| 14b | « Charger et ouvrir le Suivi » → « Fichier chargé, prêt à démarrer. » | | |
| 14c | Verdict de course (Préparer v2 / fenêtre de démarrage) | | |
| 14d | Rapides 25 % : « Correction rapide : 25 %. » | | |
| 15a | Fenêtre « Confirmer le démarrage » : verdict « dans la course », ou « non vérifié » avec vérification à la main de chaque axe concerné | | |
| 15b | « Démarrage demandé. », « En cours », broche puis descente à Z0 (en l'air) | | |
| 15c | Repère / tracé suivent la machine ; « Rapport frais » | | |
| 15d | « Terminé — programme exécuté jusqu'au bout », bilan, Rapides revenus à 100 % | | |
| 16a | Pause : « Pause confirmée : la machine est en Hold. », axes arrêtés, broche tourne + avertissement | | |
| 16b | « Correction avance : +10 %. » | | |
| 16c | Reprendre : repart au même point, 110 % | | |
| 16d | Arrêter déclenché axes en mouvement : ralentit en ≤ 1 s, immobile en ≤ 2 s, « Repos » ou « Alarme 3 déduite », bilan « Travail arrêté avant la fin · … n / N lignes » | | |
| 16e | (facultatif) « Reprendre à une ligne… » lu puis Annulé | | |
| 17a | (facultatif) Plaque sur support, mains hors trajectoire ; « Dernier zéro Z : … », Z travail = E + 5, `$G` = G90 G21 | | |
| 17b | (facultatif) bloc plaque masqué en contact ; refus « déjà en contact » à la confirmation ; Alarme 5, « Dernier palpage échoué » au retour au repos | | |
| 18a | Éco : « Enregistré dans ce navigateur uniquement. », v1 revenue, rien envoyé, « Démarrer… » grisé (rechargement demandé) | | |
| 18b | Performance remis | | |
| 19 | Journal exporté, assistant « Faite le … », port fermé, « Hors ligne » | | |

## Annexe B. Captures à prendre (photos d'écran au téléphone, sauf mention)

| Code | Quoi | Étape |
| --- | --- | --- |
| C0 | Export JSON du « Diagnostic de cette tablette » (fichier) | 1 |
| C1 | Console PC : `$$`, `$I`, `$G`, `$#`, `$N` (fichier texte) | 2 |
| C2 | Assistant étape 1 avec le bandeau (« Alarme » ou « Repos », Pilote) | 3 |
| C3 | « N réglages lus par CNCjs. » + fichier `reglages-grbl-…txt` | 4 |
| C4 / C4b | Trois lampes ✓ ; fenêtre « Déverrouiller la machine » | 5 |
| C5 / C5b | Bandeau « Alarme 1 » + écran Machine (encadré d'alarme v1), prise avant le Reset ; axes « vu ✓ » | 6 |
| C6 / C6b | « Prise d'origine terminée ✓ » ; fenêtre « Lancer la prise d'origine » | 8 |
| C7 | « Broche : N tr/min demandés » + bandeau | 9 |
| C8 | « Type enregistré : CNC. » + carte v2 | 10 |
| C9 / C9b / C9c | Suivi v2 au repos ; Machine v2 « Paramètres de course » ; « Diagnostic du rendu » | 11 |
| C10 | « Vérifié par le serveur : X+ … Aucun mouvement envoyé. » (avant Z−) | 12 |
| C11 | Console PC après l'origine : `$#`, `?` (fichier) | 13 |
| C12 / C12b | Suivi « prêt à démarrer » + Rapides 25 % ; Préparer v2 avec verdict | 14 |
| C13 / C13b | Suivi pendant le carré ; Suivi « Terminé » + bilan | 15 |
| C14 / C14b / C14c | Pause + avertissement broche ; « Correction avance : +10 %. » ; après Arrêter | 16 |
| C15 | Plan de « Reprendre à une ligne… » (facultatif) | 16 |
| C16 / C16b | « Dernier zéro Z : … » ; « Alarme 5 » (facultatif) | 17 |
| C17 | Suivi v1 Éco | 18 |
| C18 / C19 | Journal filtré Alarmes / Travaux (+ exports) ; carte « Mise en service » « Faite le … » | 19 |

Photographier **le bandeau entier** sur chaque capture : le mot d'état, l'âge du rapport, Broche, Avance, Machine, Fichier, Pilote et les boutons disent plus que l'écran seul.

## Annexe C. Compte rendu à écrire le soir même

Dans un fichier à part (pas dans ce document), en reprenant le format de HANDOFF.md « Reporting results » :

- machine : modèle, firmware (texte « Carte : … »), `$$` joint, type d'arrêt d'urgence ;
- poste : commit, v2 ouverte ou non (et pourquoi), résolution et DPR du diagnostic ;
- la grille de l'annexe A remplie, les captures de l'annexe B nommées ;
- pour chaque ✗ : l'étape, le texte exact affiché, ce que faisait la machine, ce qu'on attendait ;
- les mesures du surveillant (sens des axes, hauteur de Z0, taille du carré, délai d'arrêt sur Pause et sur Arrêter, Alarme 3 ou non) ;
- ce qui n'a pas été fait (facultatifs passés, étapes arrêtées) ;
- ce qu'il reste : HANDOFF.md étape 10.0 (relevés avec `touch.motion.enabled` toujours absent), puis l'étape 10 sur banc, avant d'activer le déplacement réel ; la reprise à une ligne exécutée (étape 9.3) ; la RT.

## Annexe D. Vocabulaire des écrans (pour ne pas chercher)

**Rail de gauche**, de haut en bas : Menu · Préparer · Fichiers · Suivi · Machine · Journal · Réglages ; « Retour » n'apparaît que sur un sous-écran (Palpage, Limites, Mise en service, Guide).

**Bandeau du haut** (identique sur tous les écrans) : mot d'état — « Hors ligne », « Repos », « En cours », « Pause », « Porte ouverte », « Prise d'origine », « Palpage », « Déplacement », « Vérification », « Veille », « Alarme N » (avec « déduite » dessous quand le code vient de l'état précédent), « Rapport ancien », « État perdu » — puis l'âge du dernier rapport, Broche, Avance, Machine, Fichier, **Pilote** (« — », « Libre », « Cet appareil », ou le nom de l'autre appareil), puis selon l'état : **Déverrouiller…**, **Reprendre…**, **Pause**, **Arrêter** (carré rouge), le cadenas « Verrouiller », « MACHINE RÉELLE », « Simulation ↗ ». Les messages (« Demande envoyée… », les refus) s'affichent dans une cellule du bandeau ; un appui dessus déroule le texte entier.

**Menu** : tuiles Suivi (« Avancement et commandes »), Fichiers (« Choisir et charger un parcours »), Préparer (« Déplacer · Origine · Palpage »), Machine (« État et limites »), Journal, Réglages ; chaque tuile porte un mot d'état (« Prêt à démarrer », « Chargé : … », « Déplacements à blanc », « Mise en service à faire », « Alarme »…).

**Suivi** : titre « Suivi du travail », ligne de préparation colorée (« Fichier chargé, prêt à démarrer. », « Travail en cours. », « Travail en pause. », l'aide d'alarme), boutons « Charger la sélection » / « Recharger le fichier », « Démarrer… », « Pause », « Reprendre… », « Arrêter le travail », bloc « Corrections » (Avance ±1/±10 %, 100 % ; Broche ; Rapides 25/50/100 %), « Zéro Z avec une plaque », « Reprendre à une ligne… », « Agrandir le tracé ». En v2 : scène 3D, bande de confiance, frise, colonne « Instruments » (temps restant et sa source, « Détail du temps », coordonnées, courbe « Avance réelle, dernière minute »), « Broche / rapides… ».

**Machine** : mot d'état en grand, encadré d'alarme expliqué, « Déverrouiller ($X)… », « Prise d'origine ($H)… », « Mise en service… », ligne de raison sous les commandes (« $X et $H indisponibles : … », « Le déverrouillage ($X) ne sert qu'en alarme. »), « Ouvrir le suivi → », « Limites de la machine → », « Journal des événements → », « Réglages d'affichage → », « Fonctions disponibles », carte « Fraîcheur des données ». En v2 : « Condition actuelle » et « Paramètres de course ».

**Réglages** : trois onglets — **Affichage** (Langue de l'interface, Thème, Taille du texte, Veille, Pendant un travail…), **Machine et performances** (Performances de cette tablette, Interface Performance v2, Type de machine, Mise en service de la machine, Diagnostic de cette tablette), **Système** (ordinateur du serveur, Wi-Fi, Tablette : commandes et version, Mises à jour).

**Refus fréquents et leur sens** (texte du serveur, affiché en clair) : « État machine trop ancien : attendre un rapport récent. » (pas de rapport depuis 2,5 s) · « La machine doit être au repos (Idle), sans commande en attente. » · « Rechargez le fichier avant un nouveau démarrage. » · « La broche tourne encore (N tr/min) : arrêtez-la d'abord (M5). » · « Confirmation expirée ou déjà utilisée. » (les 15 s sont passées : recommencer) · « Suivi continu interrompu. Nouvelle confirmation requise. » (le flux s'est renouvelé pendant la fenêtre : recommencer) · « Pilotage de <port> attribué à … » (un autre appareil pilote : attendre « Libre » ou prendre le pilotage avec un motif via la cellule Pilote) · « Réglage $22 inconnu : relisez les réglages de la carte. » · « Prise d'origine désactivée sur la carte ($22=0). » · « Le déverrouillage ($X) ne sert qu'en alarme. ».
