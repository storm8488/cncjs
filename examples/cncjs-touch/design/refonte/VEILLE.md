# Veille des logiciels comparables (phase 1, 2026-11-15)

Rôle : nourrir les propositions d'organisation du § 5 de `PROMPT-REFONTE-UI.md`. Rapport de lecture, aucun code touché.

## 0. Méthode et limites

- Sources publiques seulement (documentation, dépôts, notes de version, forums des éditeurs), lues le 15 novembre 2026. Les recherches web étaient génériques : aucune donnée du projet ni de l'opérateur n'y figure.
- Chaque affirmation vient d'une page ouverte et lue (« lu »). Quand seule une phrase de résultat de recherche l'appuie, ou quand la page n'a pas pu être ouverte, c'est écrit « non vérifié ».
- Pages qui ont refusé l'accès (403) ou n'ont pas répondu, donc non lues : `resources.sienci.com` (documentation gSender), `datron.com`, `support.snapmaker.com`, `wiki.fluidnc.com`, `iso.org`, `automation.com` (article ISA sur l'IHM à haute performance), `userfocus.co.uk`. Ce qui en est dit plus bas vient d'extraits de recherche et est marqué.
- Aucun logiciel n'a été lancé : cette veille décrit la documentation, pas le comportement réel. Les captures officielles n'ont pas été examinées une à une (le texte seul a été lu).
- Pas de copie de textes : résumés courts et liens. Les « T » renvoient au journal de terrain du 14 novembre, les « P » aux parcours P1 à P10 du prompt.
- Calculs de taille : 1 px ≈ 0,19 mm (donnée du prompt). 48 px ≈ 9,1 mm ; 64 px ≈ 12,2 mm ; 96 px ≈ 18,2 mm ; 12 px d'écart ≈ 2,3 mm ; 20 mm ≈ 105 px.

---

## 1. Fiches par logiciel

### 1.1 gSender 1.5 et suivants (Sienci Labs)

Liens : [fil de la refonte « New UI »](https://forum.sienci.com/t/gsender-edge-1-5-0-all-new-u/14247) · [retours Edge 8](https://forum.sienci.com/t/gsender-edge-1-5-0-edge-8-all-new-ui/14248) · [notes 1.5.x](https://forum.sienci.com/t/gsender-1-5-7-release-thread/17729) · [notes 1.4.x](https://forum.sienci.com/t/gsender-1-4-12-rotary-grblhal-jobs-stats-and-more/10990) · [notes 1.6 / 1.7 (GitHub)](https://github.com/Sienci-Labs/gsender/releases) · [dépôt](https://github.com/Sienci-Labs/gsender) · [liste d'alarmes](https://sienci.zendesk.com/hc/en-us/articles/33321741516436-Alarms-List) · [sonde sans continuité](https://sienci.zendesk.com/hc/en-us/articles/42765281278996-No-Touch-Probe-Continuity) · [plaque qui se plante dans l'outil](https://sienci.zendesk.com/hc/en-us/articles/44474215486740-Bit-crashes-into-touch-probe) · [reprise à une ligne (forum)](https://forum.sienci.com/t/start-from-line/12299)

1. Organisation (lu) : la version 1.5 déplace la navigation dans une barre latérale gauche ; grande zone de visualisation ; DRO avec « Aller à » et « Zéro » séparés ; correcteurs de broche et d'avance rapprochés des commandes de lancement ; outils (surfaçage, équerrage, réglage des mouvements) réunis sous « Outils » ; réglages et EEPROM fusionnés dans « Configuration ». Un indicateur d'état très grand a été jugé peu utile par des testeurs.
2. Mise en route (lu) : bouton Déverrouiller toujours affiché sur grblHAL depuis 1.4.2 ; en 1.5.7 il fait lui-même reset puis déverrouillage pour les alarmes 10 et 17 ; en 1.6.0 les fonctions qui exigent la prise d'origine restent désactivées tant que la machine ne l'a pas faite.
3. Origine de la pièce (lu) : sonde XYZ, Z seul (X et Y seuls : non vérifié, témoignage de forum). Diamètres d'outil de sonde ajoutés en 1.5.0 ; coin mémorisé en 1.5.3 ; coin masqué pour une sonde Z seule en 1.5.7 ; en 1.6.4 le choix du coin disparaît (bas gauche imposé) ; en 1.6.0-Edge-4 le coin se change dans la boîte « Run Probe » avec un avertissement si ce n'est pas le coin par défaut. Une fiche de l'éditeur donne deux causes de plantage de l'outil sur la plaque : type de plaque mal choisi dans Configuration > Sonde, ou coin de la plaque qui ne correspond pas à celui indiqué à l'écran. Test de continuité avant palpage : l'éditeur le recommande pour la plaque AutoZero (non vérifié : page de documentation non ouverte, extrait de recherche) ; la fiche « sonde sans continuité » décrit un essai au cavalier qui donne un feu vert.
4. Fichier et contrôles (lu) : « Outline » trace l'emprise approximative avant la coupe (dépôt) ; en 1.5.3 retour de la détection de mauvais fichier ou mauvaise ligne, résultats dans l'assistant « Helper » ; en 1.5.4 contrôles de limite logicielle sur les mouvements Z du palpage, du cadrage et du changement d'outil ; en 1.5.7 option « vérifier le fichier au chargement » et contrôle de profondeur dans l'outil de surfaçage seulement. Aucune source lue ne dit qu'un départ est refusé sur dépassement prouvé du programme : non vérifié.
5. Suivi (lu) : en 1.6.4 le bouton Pause est désactivé s'il est déjà en pause ; invite optionnelle à la fermeture d'un programme en cours (1.6.0-Edge-3).
6. Reprise et alarmes (lu) : « Start from line » monte à la hauteur de sécurité avant X et Y puis lance la broche (1.4.11) ; le dialogue est corrigé selon le fichier en 1.5.4. Le forum rapporte des départs au milieu d'une ligne, un Z inattendu et une alarme 2 avec fins de course actives, et une réponse de l'éditeur dit que les repères de travail n'étaient pas respectés avant 1.5.4. Le « Helper » (1.5.0) donne des infos sur erreurs et alarmes ; la liste d'alarmes a quatre colonnes (code, message, description, solution) ; le centre de notifications remonte alarmes et erreurs (1.6.4).
7. Messages (lu) : même liste ; les alarmes de sonde (4, 5) renvoient à « circuit de sonde fermé en permanence » ou « contact inattendu ».
8. Tactile (lu) : gestes tactiles dont le pincement (1.5.0) ; mode portrait ; en Edge 8 des testeurs trouvent les boutons de déplacement et de position trop petits et demandent plus d'espace (une cible de 44 px ou plus est proposée dans un commentaire) ; mise à l'échelle de l'application et boutons plus grands en portrait (1.6.x).
- À retenir : le plus proche de notre cas (sonde guidée, contrôles à la volée, aide sur les alarmes). Ses failles sont aussi instructives : reprise à une ligne fragile, boutons grisés.
- Non vérifié : la documentation officielle (403), la présence d'un test de continuité dans le tiroir de sonde actuel, les captures.

### 1.2 Carbide Motion (Carbide 3D)

Liens : [page du logiciel](https://carbide3d.com/carbidemotion/) · [parcours « Hello World »](https://community.carbide3d.com/t/hello-world-in-carbide-motion-536-and-later/31539) · [parcours BitZero + BitSetter (forum)](https://community.carbide3d.com/t/cutting-parts-using-cm548-a-bitzero-bitsetter-and-bitrunner/42580)

1. Organisation (lu) : menu en haut avec « Jog » et « Run » (« Settings » aussi, extrait de recherche : non vérifié). Parcours : Connecter, Initialiser la machine (prise d'origine), Jog + Set Zero, Run > Load New File, Start Job.
2. Mise en route (lu) : « Connect to Cutter » puis « Initialize Machine » (état « Busy » pendant la prise d'origine, puis invite à mettre un outil).
3. Origine (lu) : voir 1.4 (BitZero). Jog > Set Zero > Zero All pour l'origine à la main ; plusieurs incréments de déplacement (rapide, 1 mm, 0,25 mm) choisis par bouton.
4. Fichier (lu) : aperçu 3D à l'ouverture ; dans les versions récentes une fenêtre d'aperçu demande de vérifier que l'origine du fichier correspond au zéro posé (récit du forum). Déplacement rapide vers un coin ou le centre en un geste.
5. Suivi (lu) : Start Job, Start, puis invites de changement d'outil ; le message demande de vérifier aspiration, alimentation, broche, serrage, protections avant « Resume ».
6. Reprise et alarmes : non documenté dans les pages lues.
8. Tactile : logiciel pour Mac et Windows, pas de version tablette (lu).
- À retenir : étapes courtes avec bouton unique, aperçu qui impose de confirmer l'origine, invites qui listent quoi vérifier avant « Resume ».

### 1.3 BitZero V2 et BitSetter (assistants de palpage Carbide 3D)

Liens : [guide BitZero V2](https://guides.carbide3d.com/files/pdf/BitZero_V2_Shapeoko.pdf) · [guide BitSetter](https://my.carbide3d.com/pdf/bitsetter-v2.pdf)

1. Organisation (lu) : un bouton Probe ouvre « Probe Workpiece » : choisir le type de sonde, puis le cycle (Corner, Z, X, Y), puis « Begin Probe ».
2. Origine (lu) : le guide dit de poser la sonde sur le coin, d'amener la goupille dans l'alésage du bloc, de fixer la pince de masse, puis de tester la sonde (taper le corps contre la goupille : le voyant devient rouge). Il insiste : l'installation doit correspondre au dessin affiché pour le cycle choisi, sinon le zéro calculé est faux. La goupille de sonde est préférable à une fraise, dont les arêtes ne touchent pas toujours au rayon réel.
3. BitSetter (lu) : mesure la longueur de l'outil à chaque changement et recale le zéro Z ; l'invite d'insertion d'outil équivaut à « prise d'origine de l'outil » ; le programme doit porter des numéros d'outil distincts ; il faut recalibrer si on déplace le BitSetter.
4. Problèmes connus (non vérifié, extraits de forum) : zéro Z décalé de 2,5 mm en palpage Z seul ; la pince du BitZero peut mettre l'ensemble à la masse et bloquer le BitSetter.
- À retenir : cycle choisi avec son dessin, essai de la sonde avant « Begin Probe », mise en garde explicite sur la correspondance dessin / montage.

### 1.4 OpenBuilds CONTROL

Liens : [documentation (copie GitHub)](https://github.com/OpenBuilds/docs-migrated/wiki/docs_software_openbuilds-control) · [dépôt](https://github.com/OpenBuilds/OpenBuilds-CONTROL)

1. Organisation (lu) : port série, Connecter, ouvrir un G-code, vue 3D, Run Job ; déplacement par boutons ou clavier.
3. Origine (lu) : aller à l'origine, mettre les affichages à zéro ; un « assistant de palpage » trouve l'origine avec la sonde XYZ Probe Plus de l'éditeur.
4. Contrôles (lu) : aperçu 3D ; la page conseille un dernier contrôle mental avant Run Job (origine, outil, broche et aspiration, serrage).
6. Alarmes : non documenté sur la page lue.
- Non vérifié : des témoignages de forum (extraits de recherche) disent que l'assistant de sonde Z récent ne gère que la sonde de l'éditeur, alors que d'anciens fils parlent d'un assistant de plaque Z plus ouvert.
- À retenir : liste de contrôle avant Run Job.

### 1.5 UGS (Universal G-Code Sender)

Liens : [accueil du wiki](https://github.com/winder/Universal-G-Code-Sender/wiki) · [Features](https://github.com/winder/Universal-G-Code-Sender/wiki/Features) · [Usage](https://github.com/winder/Universal-G-Code-Sender/wiki/Usage) · [comparaison](https://github.com/winder/Universal-G-Code-Sender/wiki/Software-comparison)

1. Organisation (lu) : choix du micrologiciel puis du port ; visualisation temps réel ; clic droit pour se déplacer ou fixer l'origine de travail ; éditeur de G-code.
3. Origine (lu) : « Reset zero » met X0 Y0 Z0 ; « Return to zero » monte d'abord en Z si on est sous la hauteur de sécurité ; zéro par axe dans l'affichage des positions. Module de palpage : non vérifié (une fiche Sienci le situe dans Window > Plugin > Probe Module, extrait de recherche).
4. Contrôles (lu) : « Outline » trace le contour du travail à la hauteur Z courante pour contrôler le positionnement.
5. Suivi (lu) : correcteurs d'avance, de broche et de rapides en temps réel.
6. Reprise (lu) : clic droit sur une ligne de l'éditeur : « Run From... ». Alarmes (lu) : Unlock, Soft Reset ; l'affichage indique quels contacts de fin de course ont été touchés.
- À retenir : l'affichage nomme les fins de course déclenchées ; le retour au zéro monte d'abord en Z.
- Non vérifié : tout ce qui touche au palpage et aux limites logicielles dans UGS.

### 1.6 bCNC

Liens : [dépôt](https://github.com/vlachoudis/bCNC) · [Jogging](https://github.com/vlachoudis/bCNC/wiki/Jogging) · [WorkSpaces](https://github.com/vlachoudis/bCNC/wiki/WorkSpaces)

1. Organisation (lu) : interface pensée pour petits écrans, modes 3 et 6 axes ; palpage simple, centrage par anneau, nivellement, mesure automatique de longueur d'outil ; pendule web pour téléphone.
3. Origine (lu) : on choisit un repère, on se place, on saisit les valeurs voulues ; seuls les champs décimaux saisis sont appliqués. Le wiki exige Grbl connecté et déverrouillé, fins de course configurées, prise d'origine faite avant de définir un repère.
5. Déplacements (lu) : le wiki avertit que le déplacement par commandes ne gère pas l'annulation temps réel de Grbl 1.1 : plusieurs commandes en file ne peuvent plus être arrêtées.
- À retenir : conditions préalables écrites noir sur blanc ; piège du déplacement en file.
- Non vérifié : les onglets de l'interface (non décrits par les pages lues).

### 1.7 Candle

Lien : [dépôt](https://github.com/Denvi/Candle)

- Lu : commande de machines Grbl par boutons, pavé numérique et console ; visualisation ; chargement, édition et envoi de G-code. La page ne décrit ni cartographie de hauteur, ni palpage, ni alarmes. Tout le reste : non vérifié.

### 1.8 FluidNC WebUI, ESP3D-WebUI et un pupitre tactile FluidTouch

Liens : [ESP3D-WebUI](https://github.com/luc-github/ESP3D-WEBUI) · [fil de sortie WebUI 3 (forum V1E)](https://forum.v1e.com/t/webui-3-release-3-0-0-4b1-fluidnc/47841) · [FluidTouch, mode d'emploi](https://raw.githubusercontent.com/jeyeager65/FluidTouch/main/docs/usage.md)

- ESP3D-WebUI (lu) : interface réécrite en Preact avec spectre.css, pour Grbl et grblHAL. Détails de mise en page : non documentés sur la page. FluidNC WebUI v3 (lu, forum) : tableau de bord à panneaux, extensions dans des iframes, boutons d'enregistrement fixés en bas des réglages ; panneau de sonde activable dans les préférences et onglet Probe ajouté « pour être complet » (extraits de recherche, non vérifié). Le wiki officiel n'a pas répondu.
- FluidTouch (lu), pupitre tactile pour FluidNC : barre d'état toujours visible (état à gauche, positions au centre, machine et connexion à droite) ; onglets Actions, Jog, Joystick, Probe ; fenêtre d'ALARME automatique avec « Clear Alarm » ; sonde Z avec avance, distance maximale, retrait et épaisseur, résultat SUCCESS ou FAILED, épaisseur prise en compte automatiquement.
- À retenir : barre d'état permanente, fenêtre d'alarme qui propose directement la remise en route, résultat de palpage en un mot.

### 1.9 CNCjs d'origine

Liens : [dépôt](https://github.com/cncjs/cncjs) · [guide](https://github.com/cncjs/cncjs/wiki/User-Guide) · [pupitres](https://github.com/cncjs/cncjs/wiki/Using-Pendants)

- Lu : espace de travail à widgets personnalisables ; widget Axes (position, déplacements, prise d'origine, zéro par axe) ; widget Probe (zéro Z à la plaque) ; widget Visualizer (trajet) ; affichage adapté aux écrans de moins de 720 px ; commandes MDI personnalisables. Détails du widget Probe, états du flux : non documentés dans le guide lu.
- À retenir : c'est notre point de départ ; le constat de l'opérateur (« mal organisé ») est celui d'un tableau de widgets sans ordre de séance.

### 1.10 cncjs-shopfloor-tablet

Lien : [dépôt](https://github.com/cncjs/cncjs-shopfloor-tablet)

- Lu : conçu pour opérateurs d'atelier ; mise en page tactile prévisible ; sans 3D, pour tablettes bon marché ; mouvements risqués retirés (pas de diagonales). Disposition : état et messages en haut à gauche, boutons Go et Stop avec compteur de ligne et chronomètre, menu pour les fonctions rares, repère courant, DRO par axe avec Set / Zero / Goto, pas de déplacement, deux lignes MDI, fichier, trajet 2D. Reconnexion automatique au dernier port ; boutons de programme mis en valeur selon l'état de la machine ; boutons importants espacés contre les touchers accidentels. Dimensions des cibles : non précisées. Palpage : non mentionné.
- À retenir : suppression assumée des gestes risqués, reconnexion automatique, boutons surlignés selon l'état.

### 1.11 cncjs-pendant-tinyweb

Lien : [dépôt](https://github.com/cncjs/cncjs-pendant-tinyweb)

- Lu : petit pupitre web pour écran LCD 320 × 240, déplacement seulement ; mise en page et boutons non décrits. Rien à en tirer pour un 12 pouces, sauf la discipline d'un écran minimal.

### 1.12 Onefinity et Buildbotics

Liens : [manuel Elite (version écran MASSO, rév. 02.12.24)](https://www.onefinitycnc.com/_files/ugd/1cee9f_11486493866543b388bd72ccac5c5b95.pdf) · [présentation de la sonde 3 axes](https://forum.onefinitycnc.com/t/introducing-the-onefinity-3-axis-touch-probe/530) · [firmware Buildbotics](https://github.com/buildbotics/bbctrl-firmware)

- Lu (manuel Elite, donc écran MASSO et non Buildbotics) : écrans F1 à F6 (F2 exécution, F3 déplacement et palpage, F4 outils et repères, F6 fichiers) ; prise d'origine par double appui sur HOME, alarme d'arrêt d'urgence à lever d'abord ; avant de lancer : machine référencée, pièce serrée, outil monté, zéros posés, bouton « Rewind » obligatoire ; « Jump to Line », « Go To Work Origin » ; en palpage, une boîte de dialogue dessine le bloc jaune, un point rouge où placer l'outil, le trajet en pointillés et, aux coins, la course que la machine va parcourir ; décalages X, Y, Z du bloc préréglés en usine pour le coin haut-droit, à modifier pour un autre coin et à enregistrer dans l'un des six repères ; un cycle de palpage s'arrête en rappuyant sur un bouton de palpage.
- Lu (forum éditeur) : sonde sur le coin haut-droit de la pièce, chaque axe palpé deux fois, avance lente conseillée, causes d'échec : résidu non conducteur, peinture sur l'écrou de pince, câblage, aimant de masse oublié.
- Lu (dépôt Buildbotics) : interface Vue.js ; ses écrans ne sont pas décrits. Autres pages du contrôleur Buildbotics : non vérifié. Un témoignage de forum parle d'un coin « câblé » (extrait de recherche) : non vérifié, et il diffère de la page de l'éditeur.
- À retenir : le dessin de la zone de départ avec distances chiffrées, le double appui pour un geste qui déplace la machine.

### 1.13 MASSO (G3 et G3 Touch)

Liens : [index de la documentation](https://docs.masso.com.au/) · [palpage](https://docs.masso.com.au/getting-started-guides/machining-with-masso/probing) · [reprise et saut à une ligne](https://docs.masso.com.au/getting-started-guides/machining-with-masso/resuming-program-or-jump-to-line) · [alarmes](https://docs.masso.com.au/getting-started-guides/machining-with-masso/graphical-interface/controller-alarms) · [écran tactile (matériel)](https://docs.masso.com.au/getting-started-guides/machining-with-masso/touch-screen-interface)

1. Organisation (lu) : séquence documentée prise d'origine, déplacements et repères de travail, chargement et exécution, bloc à bloc, reprise.
3. Origine (lu) : palpage ouvert depuis l'écran F3 (Jog) ; cycles : dessus, côté, coin, centre ; six boutons de repère G54 à G59 choisis avant le cycle, résultat écrit dans le repère affiché en haut ; dernier repère mémorisé ; chaque page de cycle liste ses réglages ; mise en garde : tester la sonde avant chaque cycle (voyant gris puis vert) ; arrêt du cycle en rappuyant, Feed Hold ou Échap.
4. Suivi : bouton « Go To Work Origin » et « Jump to Line » (manuel Onefinity Elite) ; mode bloc à bloc (index).
6. Reprise (lu) : « Jump to Line » propose la dernière ligne usinée, enregistrée en mémoire rapide (survit à une coupure), place la machine avant la ligne choisie, demande de vérifier les paramètres calculés, puis un appui Cycle Start par axe, Z en dernier. Pas de départ au milieu d'une compensation d'outil. Après arrêt d'urgence ou perte de position : prise d'origine d'abord.
7. Alarmes (lu) : tableau nom, cause, comment lever ; la plupart se lèvent par une nouvelle prise d'origine ; l'alarme de palpage dit « pas de signal dans la course, ou sonde déjà active : vérifier qu'elle est inactive, relancer avec une distance valable ».
8. Tactile (lu) : écran résistif 4 fils seulement, 1024 × 768 (page matériel).
- À retenir : meilleure référence lue pour la reprise et pour « l'ordre de remise en route ».

### 1.14 Mach4 (et assistant MachMotion)

Liens : [page Mach4](https://www.machsupport.com/software/mach4/) · [assistant de palpage MachMotion](https://support.machmotion.com/books/software/page/machmotion-probing-wizard/revisions/2766)

- Lu (Mach4) : onglets pour changer d'écran, écrans modifiables par l'éditeur d'écrans ; assistants, palpage et tactile non décrits sur la page.
- Lu (MachMotion, intégrateur, pas l'éditeur) : assistant accessible depuis tout écran ; chercheurs d'arête, de coin, de centre de trou, zéro Z, mesure d'angle ; deux touches avec avance plus lente à la seconde ; une erreur arrête l'opération si la pièce n'est pas atteinte ; le code de sonde doit correspondre avant tout mouvement ; en mode manuel les deux points doivent être du même type ; annuler efface les points.
- À retenir : arrêt sur « pièce non atteinte », vérifications avant mouvement.

### 1.15 UCCNC

Lien : [page éditeur](https://cncdrive.com/UCCNC.html)

- Lu : jeux d'écrans fournis pour fraiseuse et plasma, éditeur visuel permettant de refaire l'écran ; repères G54 à G59, vue 3D temps réel ; la page ne parle ni de tactile ni de palpage. Un module tiers de palpage existe (extrait de recherche, non vérifié) ; des témoignages disent que les écrans de palpage anciens ne passent pas aux nouveaux jeux d'écrans.
- À retenir : un écran modifiable à volonté crée la dérive que la refonte veut éviter ; garder une organisation unique.

### 1.16 DATRON next

Liens (pages non ouvertes, 403 ; extraits de recherche seulement, donc non vérifié) : [interface](https://www.datron.com/resources/blog/datron-next-user-interface-intuitive-visual-and-easy/) · [palpage intégré](https://www.datron.com/resources/blog/datron-cnc-integrated-probe-simplifies-workpiece-setup/)

- D'après les extraits : préparation du travail en 4 étapes à l'écran tactile ; on dessine du doigt le contour de la pièce vue par la caméra, la commande place les points de palpage, que l'on peut déplacer ; un bouton lance le cycle ; une pièce posée de travers fait tourner le programme ; simulation 3D après palpage ; points indésirables désélectionnables sur l'écran.
- À retenir : (non vérifié) le dessin comme moyen de saisir et de contrôler.

### 1.17 Snapmaker (pupitre tactile et Luban)

Liens (extraits de recherche ; les pages n'ont pas pu être lues, donc non vérifié) : [origine de travail](https://wiki.snapmaker.com/en/snapmaker_artisan/manual/set_work_origin) · [assistant d'origine](https://support.snapmaker.com/hc/en-us/articles/4417334712599)

- D'après les extraits : origine posée soit dans Luban, soit sur l'écran tactile ; « Origin Assistant » dans la boîte à outils de l'écran, avec mode automatique pédagogique et mode manuel pour initiés ; lunettes de protection demandées avant de poser l'origine ; des utilisateurs signalent que le lancement d'un travail peut remettre l'origine au centre du plateau à une hauteur par défaut, avec risque de plongée (non vérifié : micrologiciel ancien ?).
- À retenir : un assistant d'origine avec mode expert ; piège de l'origine silencieusement remplacée au départ.

### 1.18 LightBurn (cadrage laser)

Liens : [cadrage](https://docs.lightburnsoftware.com/2.2/GetStarted/FramingBeginner/) · [coordonnées et origine](https://docs.lightburnsoftware.com/2.2/Reference/CoordinatesOrigin/)

- Lu : « Frame » parcourt le contour du travail sans tirer ; deux formes : rectangle englobant ou contour serré (« rubber band ») ; trois modes de départ : coordonnées absolues, position courante, origine utilisateur ; sélecteur de 9 points pour dire quel point du travail se pose sur l'origine ; avance du cadrage réglée à part ; bouton « Fire » réservé aux lasers diode, très faible puissance, jamais sur un laser CO2.
- À retenir : cadrer avant de tirer est un geste de l'atelier laser (utile pour la RT) ; le sélecteur de 9 points est un dessin plutôt qu'un chiffre.

### 1.19 Mainsail

Liens : [documentation](https://docs.mainsail.xyz/) · [invites de macros](https://docs.mainsail.xyz/features/macro-prompts/) · [réglages de l'interface](https://docs.mainsail.xyz/settings/ui-settings/) · [organisation du tableau de bord](https://docs.mainsail.xyz/features/dashboard-organisation/)

- Lu : tableau de bord où l'on réordonne, masque et replie des panneaux, avec disposition mémorisée et mises en page séparées bureau et mobile ; invites de macros : fenêtres à boutons nommés et colorés (primary, warning, error...) pour confirmer ou guider ; réglages de confirmation facultatifs (arrêt d'urgence, annulation, alimentation) ; « verrouiller les curseurs sur écran tactile » (déverrouiller avant usage, reverrouillage automatique après un délai).
- Non vérifié : présence et position permanente du bouton d'arrêt d'urgence (non décrites sur les pages lues).
- À retenir : confirmations réglables, curseurs verrouillés au tactile, boutons d'invite nommés par leur effet.

### 1.20 Fluidd

Liens : [documentation](https://docs.fluidd.xyz/) · [notifications](https://docs.fluidd.xyz/features/system-and-notifications)

- Lu : mise en page personnalisable, interface réactive bureau, tablette, mobile ; panneau de notifications qui signale avertissements de composants : mise à jour disponible, limitation de la machine hôte (tension insuffisante), composant qui n'a pas pu se charger, en le nommant et en donnant le détail de l'erreur. Boutons d'action sur ces alertes : non décrits. Arrêt d'urgence : non mentionné sur les pages lues.
- À retenir : une panne de fonction est annoncée en nommant la fonction.

### 1.21 KlipperScreen

Liens : [dépôt](https://github.com/KlipperScreen/KlipperScreen) · [documentation](https://klipperscreen.readthedocs.io/en/latest/) · [liste des panneaux](https://klipperscreen.readthedocs.io/en/latest/Panels/) · [panneau d'état de l'impression](https://klipperscreen.readthedocs.io/en/latest/Panels/Job_status/)

- Lu : interface tactile native pour Klipper via Moonraker ; plusieurs imprimantes depuis un même écran ; menu principal d'où partent des panneaux (état du travail, déplacement, console, réglage fin, limites, étalonnage Z, etc.) ; l'état d'impression montre durée et températures, détails au toucher. Pause, annulation, arrêt d'urgence, confirmations : non décrits sur les pages lues.
- À retenir : un menu principal court qui mène à des panneaux d'une seule tâche. Détails de l'étalonnage Z guidé : non vérifié (page introuvable).

---

## 2. Repères généraux

Chaque ligne dit ce qui a été lu et ce qui ne l'a pas été.

- **ISA-101** (lu : [page du comité](https://www.isa.org/standards-and-publications/isa-standards/isa-standards-committees/isa101), [article Control Global](https://www.controlglobal.com/articles/2017/give-the-operators-what-they-need)). La norme couvre hiérarchie de menus, conventions graphiques et de couleur, alarmes, fenêtres surgissantes. Elle ne fixe pas de couleurs précises (selon l'article). Hiérarchie à 4 niveaux, de la vue d'ensemble au détail d'un équipement, réductible. Mauvaise pratique citée : employer les couleurs d'alarme pour des états normaux. Le fond gris et la « couleur réservée à l'anormal » sont l'usage courant mais ne sont pas exigés par la norme : non vérifié dans le texte de la norme (payant).
- **Nielsen Norman Group** (lu) : [messages d'erreur](https://www.nngroup.com/articles/error-message-guidelines/) (près de la source, langage courant, dire quoi faire, proposer un remède en un geste, ne pas se fier à la couleur seule, conserver la saisie) ; [divulgation progressive](https://www.nngroup.com/articles/progressive-disclosure/) (deux niveaux, le fréquent d'abord, accès au secondaire bien étiqueté) ; [assistants](https://www.nngroup.com/articles/wizards/) (pour tâches rares, étapes listées, valeurs par défaut, retour possible, ne pas imposer aux tâches fréquentes, offrir une voie rapide) ; [confirmations](https://www.nngroup.com/articles/confirmation-dialog/) (réserver aux conséquences graves, nommer l'objet et l'effet, boutons nommés par leur effet, pas de « Êtes-vous sûr ? », pas de réponse présélectionnée, préférer l'annulation quand elle est possible).
- **ISO 9241-110** (lu via [ux-toolkit](https://ux-toolkit.netlify.app/en/foundations/iso-9241-110-dialog-principles), un site secondaire ; la page ISO n'a pas répondu) : adaptation à la tâche, auto-description, contrôlabilité, conformité aux attentes, tolérance aux erreurs, personnalisation, apprentissage. L'édition 2020 s'intitule « principes d'interaction » (extrait de recherche). Les intitulés exacts varient selon les sources : à contrôler sur la norme.
- **Tailles de cibles tactiles** : NNG ([lu](https://www.nngroup.com/articles/touch-target-size/)) donne 1 cm minimum, cite environ 2 cm pour les boutons principaux d'une application grand public, conseille plus grand quand on bouge, et environ 2 mm d'écart. Une synthèse du W3C ([lue](https://www.w3.org/WAI/GL/mobile-a11y-tf/wiki/Summary_of_Research_on_Touch/Pointer_Target_Size)) cite 20 mm comme taille à partir de laquelle la précision plafonne (Chen et al. 2013, via la synthèse) et jusqu'à 30 mm pour des utilisateurs à motricité réduite. Pour les gants : 20 mm de côté et 3 mm d'écart (MIL-STD-1472, via un résumé d'étude trouvé par recherche, non vérifié sur la norme) ; la norme militaire donne 15 mm sans gants. Pas de source industrielle récente lue.
  - Application chiffrée à notre harnais (calcul, pas une source) : la cible secondaire de 48 px mesure environ 9 mm, soit moins que le minimum d'un centimètre de NNG ; l'action principale de 64 px mesure environ 12 mm ; la flèche de déplacement de 96 px, environ 18 mm ; l'écart de 12 px, environ 2,3 mm. Pour des doigts poussiéreux, la veille ne trouve aucune source qui valide 48 px comme taille d'usage. À soumettre à l'agent « ergonomie ».
- **Règles des pupitres de machine** : l'arrêt d'urgence doit être rouge, sur fond jaune quand il y a un fond, et ce couple rouge et jaune est réservé à l'arrêt d'urgence ; il doit être bien visible et rapidement accessible (ISO 13850 et CEI 60204-1, via des extraits de recherche d'articles de constructeurs : non vérifié sur les normes, qui sont payantes). Un arrêt d'urgence logiciel d'une tablette ne remplace pas l'arrêt physique ; aucune source lue ne traite du cas d'un arrêt logiciel sur écran tactile, hors la possibilité de confirmation réglable de Mainsail.

---

## 3. Les 15 idées les plus utiles pour CNCjs Touch

Chaque idée dit : le parcours visé, la ligne du journal qu'elle traite, le logiciel qui la met en œuvre, le lien. « (D) » marque une idée qui rejoint une décision du prompt (D1 à D4).

| # | Idée | Parcours | Journal | Mis en œuvre par | Lien |
|---|---|---|---|---|---|
| 1 | **Dessin de la zone de départ du palpage**, avec point de départ, trajet et distances chiffrées aux bords. Le dessin change avec le cycle choisi. | P3, P4 | T8 | Onefinity Elite (écran MASSO) : bloc, point rouge, trajet, distances. Carbide Motion : « l'installation doit correspondre au dessin ». | [manuel Onefinity](https://www.onefinitycnc.com/_files/ugd/1cee9f_11486493866543b388bd72ccac5c5b95.pdf) · [BitZero V2](https://guides.carbide3d.com/files/pdf/BitZero_V2_Shapeoko.pdf) |
| 2 | **Essai de la sonde avant chaque cycle, avec témoin visible** (gris puis vert), et un assistant si le témoin reste en contact permanent ou ne réagit jamais : pince, broche à débrancher, câble. (D4) | P10, P3 | T6, T9 | MASSO : essai avant chaque cycle, voyant. Carbide Motion : toucher la sonde avec l'outil, elle doit passer au rouge. Sienci : essai au cavalier, alarmes 4 et 5 décrites. Aucune source lue ne traite d'une broche qui met l'outil à la masse. | [MASSO](https://docs.masso.com.au/getting-started-guides/machining-with-masso/probing) · [forum Carbide](https://community.carbide3d.com/t/cutting-parts-using-cm548-a-bitzero-bitsetter-and-bitrunner/42580) · [Sienci](https://sienci.zendesk.com/hc/en-us/articles/42765281278996-No-Touch-Probe-Continuity) · [alarmes](https://sienci.zendesk.com/hc/en-us/articles/33321741516436-Alarms-List) |
| 3 | **Un seul point d'entrée « Sonde »** : type de sonde, puis cycle (coin XYZ, Z seul, X, Y), dessin correspondant, lancer. Le Z à la plaque est un cycle comme les autres. | P3, P4, P5 | T4 | Carbide Motion : « Probe Workpiece », type puis cycle puis « Begin Probe ». MASSO : cycles dessus, côté, coin, centre depuis l'écran de déplacement. | [BitZero V2](https://guides.carbide3d.com/files/pdf/BitZero_V2_Shapeoko.pdf) · [MASSO](https://docs.masso.com.au/getting-started-guides/machining-with-masso/probing) |
| 4 | **Valeurs par défaut sûres et derniers choix repris** : profil de sonde prérempli aux cotes nominales, coin non demandé pour un Z seul, repère mémorisé. (D4) | P3 | T5 | Onefinity Elite : décalages du bloc préréglés en usine. gSender : coin masqué pour Z seul (1.5.7), mémorisé (1.5.3), puis retiré (1.6.4). MASSO : dernier repère mémorisé. NNG : valeurs par défaut et choix précédents. | [manuel Onefinity](https://www.onefinitycnc.com/_files/ugd/1cee9f_11486493866543b388bd72ccac5c5b95.pdf) · [notes 1.5.x](https://forum.sienci.com/t/gsender-1-5-7-release-thread/17729) · [NNG assistants](https://www.nngroup.com/articles/wizards/) |
| 5 | **Contrôler la course et la profondeur dès que le fichier et l'origine sont connus**, pas au départ. Dire de combien et de quel côté. (D1) | P2, P7 | T15, T2 | gSender : contrôles de limites sur palpage, cadrage et changement d'outil (1.5.4), vérification du fichier au chargement en option (1.5.7). Carbide Motion : aperçu qui demande de confirmer l'origine. Aucune source lue ne refuse un départ sur dépassement prouvé : à notre connaissance, c'est une avance (non vérifié). | [notes 1.5.x](https://forum.sienci.com/t/gsender-1-5-7-release-thread/17729) · [forum Carbide](https://community.carbide3d.com/t/hello-world-in-carbide-motion-536-and-later/31539) |
| 6 | **Dessiner l'emprise du programme dans la machine** et permettre un cadrage à vide (contour sans couper). Un sélecteur à 9 points dit quel point du travail est posé sur l'origine. | P2, P7 | T7 | LightBurn : cadrage rectangle ou contour serré, sélecteur de 9 points. gSender et UGS : « Outline ». | [LightBurn cadrage](https://docs.lightburnsoftware.com/2.2/GetStarted/FramingBeginner/) · [LightBurn origine](https://docs.lightburnsoftware.com/2.2/Reference/CoordinatesOrigin/) · [gSender](https://github.com/Sienci-Labs/gsender) · [UGS](https://github.com/winder/Universal-G-Code-Sender/wiki/Usage) |
| 7 | **Un refus porte sa cause, une phrase, et son bouton remède au même endroit**, en langage d'atelier ; le code technique va dans « Détails ». | P7, P9 | T6, T12 | NNG : près de la source, quoi faire, remède en un geste. gSender : « Helper » et colonne « solution » des alarmes. Mainsail : invites à boutons nommés par leur effet. | [NNG erreurs](https://www.nngroup.com/articles/error-message-guidelines/) · [notes 1.5.x](https://forum.sienci.com/t/gsender-1-5-7-release-thread/17729) · [Mainsail](https://docs.mainsail.xyz/features/macro-prompts/) |
| 8 | **Fenêtre d'alarme automatique** : ce qui s'est passé, ce qui est perdu, bouton Déverrouiller, puis la suite. Les fins de course touchées sont nommées. | P8 | T10 | FluidTouch : fenêtre d'ALARME avec « Clear Alarm ». UGS : l'affichage indique les fins de course déclenchées. gSender : bouton Déverrouiller toujours présent, alarmes avec description et solution. | [FluidTouch](https://raw.githubusercontent.com/jeyeager65/FluidTouch/main/docs/usage.md) · [UGS](https://github.com/winder/Universal-G-Code-Sender/wiki/Usage) · [alarmes gSender](https://sienci.zendesk.com/hc/en-us/articles/33321741516436-Alarms-List) |
| 9 | **Remise en route guidée dans l'ordre** après arrêt ou alarme : prise d'origine, origine de la pièce encore valable ou non, reprise à la ligne proposée (la dernière usinée), vérification, puis un axe à la fois, Z en dernier. (D2) | P8 | T2, T3 | MASSO « Jump to Line » : dernière ligne mémorisée, paramètres à vérifier, Cycle Start par axe. gSender : hauteur de sécurité avant X et Y, puis broche. | [MASSO](https://docs.masso.com.au/getting-started-guides/machining-with-masso/resuming-program-or-jump-to-line) · [notes 1.4.x](https://forum.sienci.com/t/gsender-1-4-12-rotary-grblhal-jobs-stats-and-more/10990) |
| 10 | **Boutons liés à l'état réellement rapporté** (référencé, déverrouillé, repos), avec le motif écrit et le bouton qui lève l'obstacle. | P1, P7 | T3 | gSender : fonctions qui exigent la prise d'origine désactivées jusqu'à la référence (1.6.0) ; bCNC : conditions préalables écrites (déverrouillé, référencé). Le motif affiché par gSender n'a pas été vérifié. | [notes 1.6](https://github.com/Sienci-Labs/gsender/releases) · [bCNC](https://github.com/vlachoudis/bCNC/wiki/WorkSpaces) |
| 11 | **Barre d'état permanente** : état de la machine, position, connexion, et qui pilote ; un toucher sur la zone ouvre le changement. | P9, P1 | T12 | FluidTouch : état à gauche, position au centre, machine et connexion à droite, toucher pour changer. Aucune source lue ne montre un « qui pilote » : propre à CNCjs (non trouvé ailleurs). | [FluidTouch](https://raw.githubusercontent.com/jeyeager65/FluidTouch/main/docs/usage.md) · [shopfloor-tablet](https://github.com/cncjs/cncjs-shopfloor-tablet) |
| 12 | **Confirmations proportionnées** : nommer l'effet sur le bouton (« Lancer malgré le dépassement »), pas de case seule, pas de « Êtes-vous sûr ? », double geste pour ce qui déplace la machine ; curseurs d'avance verrouillés au tactile. (D1) | P7, P8 | T2 | NNG : confirmations. Onefinity Elite : double appui sur HOME. Mainsail : confirmation réglable, curseurs verrouillés au tactile. | [NNG](https://www.nngroup.com/articles/confirmation-dialog/) · [manuel Onefinity](https://www.onefinitycnc.com/_files/ugd/1cee9f_11486493866543b388bd72ccac5c5b95.pdf) · [Mainsail](https://docs.mainsail.xyz/settings/ui-settings/) |
| 13 | **Étapes visibles dans l'ordre du travail**, une voie rapide pour les habitués (palpage en 4 touchers) et un menu court de panneaux d'une seule tâche. | P1, P4 | T4 | Carbide Motion : Jog puis Run. Onefinity Elite et MASSO : écrans F1 à F6 par fonction. NNG assistants : étapes listées, voie rapide pour les tâches fréquentes. DATRON : 4 étapes (non vérifié). KlipperScreen : menu principal vers panneaux. | [BitZero V2](https://guides.carbide3d.com/files/pdf/BitZero_V2_Shapeoko.pdf) · [manuel Onefinity](https://www.onefinitycnc.com/_files/ugd/1cee9f_11486493866543b388bd72ccac5c5b95.pdf) · [NNG assistants](https://www.nngroup.com/articles/wizards/) · [KlipperScreen](https://klipperscreen.readthedocs.io/en/latest/Panels/) |
| 14 | **Annoncer une fonction indisponible en la nommant**, avec la raison et le geste qui la rétablit, au lieu de la faire disparaître. | P7 | T11 | Fluidd : notification qui nomme le composant défaillant et donne le détail. NNG : le chemin vers le secondaire reste visible. | [Fluidd](https://docs.fluidd.xyz/features/system-and-notifications) · [NNG](https://www.nngroup.com/articles/progressive-disclosure/) |
| 15 | **Reconnexion automatique au dernier port et relecture de la version au repos**, avec l'état de la machine sur les boutons. (D4) | P1 | T10 | cncjs-shopfloor-tablet : reconnexion automatique, boutons surlignés selon l'état. gSender : type de contrôleur noté dans le rapport d'erreurs (1.4.2). La relecture de la version Grbl proprement dite n'a été trouvée nulle part : non vérifié. | [shopfloor-tablet](https://github.com/cncjs/cncjs-shopfloor-tablet) · [notes 1.4.x](https://forum.sienci.com/t/gsender-1-4-12-rotary-grblhal-jobs-stats-and-more/10990) |

Idées lues mais sans ligne T qui les justifie, donc non retenues dans les 15 : hauteur de sécurité à la pause (demandée par des testeurs de gSender, [fil Edge 8](https://forum.sienci.com/t/gsender-edge-1-5-0-edge-8-all-new-ui/14248)) ; journal des points palpés sur clé USB (MASSO) ; sélection des points à palper au doigt sur une image de caméra (DATRON, non vérifié).

Trous constatés (aucun logiciel lu ne le fait ou ne le documente) : un zéro d'axe posé à l'origine machine (T13) ; l'explication d'un contact permanent dû à la broche (T9) ; la mention « qui pilote » (T12) ; le refus de départ sur dépassement prouvé (T2) ; l'écran noir d'une tablette en kiosque (T1) et le cache de la page (T14), qui relèvent de l'hôte et pas de l'interface.

---

## 4. Les 5 pièges à éviter

1. **Le bouton grisé sans explication.** gSender désactive les fonctions qui exigent la prise d'origine tant que la machine n'est pas référencée (1.6.0). Sans motif affiché à côté, c'est exactement le « toujours grisé » de T6. Règle : un bouton désactivé dit pourquoi et porte le bouton qui lève l'obstacle (principe 3 du prompt, [NNG](https://www.nngroup.com/articles/error-message-guidelines/)). Non vérifié : ce que gSender affiche sur le bouton grisé.
2. **L'assistant partout, même pour le geste de tous les jours.** NNG réserve les assistants aux tâches rares et demande une voie rapide pour les tâches fréquentes ([source](https://www.nngroup.com/articles/wizards/)). Pour P4 (4 touchers au plus) l'assistant du profil de sonde ne sert qu'à la première fois (P3) ; ensuite, le lancement direct avec les derniers choix.
3. **La reprise à une ligne qui part mal.** Les fils de gSender listent des départs au milieu d'une ligne, un Z inattendu, une alarme 2 avec fins de course actives, un décompte de lignes qui ignore les lignes vides, une hauteur de sécurité demandée en millimètres alors qu'on travaille en pouces, des repères de travail non respectés avant 1.5.4 ([fil](https://forum.sienci.com/t/start-from-line/12299) et [notes](https://forum.sienci.com/t/gsender-1-5-7-release-thread/17729) lus ; les autres points viennent d'extraits de recherche, non vérifiés). MASSO évite le piège en proposant la dernière ligne usinée mémorisée et en vérifiant chaque axe. Pour CNCjs Touch : mêmes garde-fous de course et de décalage pour la reprise que pour le départ (piste 7 du § 4.2).
4. **Un dessin ou une valeur par défaut qui ne correspond pas au montage.** Carbide dit que, si le montage diffère du dessin, le zéro calculé est faux ; les décalages d'usine du bloc Onefinity sont valables pour un coin seulement ; Sienci attribue les plantages à un type de plaque ou à un coin mal réglés. Règle : l'écran ne propose que ce qu'il dessine, et le dessin montre ce que la machine fera (sources : [BitZero V2](https://guides.carbide3d.com/files/pdf/BitZero_V2_Shapeoko.pdf), [manuel Onefinity](https://www.onefinitycnc.com/_files/ugd/1cee9f_11486493866543b388bd72ccac5c5b95.pdf), [fiche Sienci](https://sienci.zendesk.com/hc/en-us/articles/44474215486740-Bit-crashes-into-touch-probe)).
5. **Trop de confirmations, trop de couleur d'alarme.** Les « Êtes-vous sûr ? » à chaque geste apprennent à cliquer sans lire ([NNG](https://www.nngroup.com/articles/confirmation-dialog/)) ; employer les couleurs d'alarme pour des états normaux est une mauvaise pratique citée à propos d'ISA-101 ([Control Global](https://www.controlglobal.com/articles/2017/give-the-operators-what-they-need)). Règle : la couleur vive reste pour l'anormal, la confirmation pour le grave. Et ne jamais ralentir l'arrêt : Mainsail rend la confirmation de l'arrêt d'urgence optionnelle, signe que la question est discutée ([réglages](https://docs.mainsail.xyz/settings/ui-settings/)) ; aucune source lue ne tranche pour une tablette de CNC.

---

## 5. Ce qui n'a pas été vérifié

- La documentation officielle de gSender (403) : toutes les affirmations sur gSender viennent des notes de version, du dépôt, des fiches de support et des fils de forum lus, pas du manuel.
- Le comportement réel de tout logiciel : rien n'a été installé ni lancé.
- DATRON next et Snapmaker : extraits de recherche seulement.
- Les normes payantes (ISA-101, ISO 9241-110, ISO 13850, CEI 60204-1, MIL-STD-1472) : citées par des sources secondaires.
- Mainsail et Fluidd : emplacement et comportement de l'arrêt d'urgence.
- UGS : module de palpage. Candle, OpenBuilds : fonctions au-delà de ce que disent leurs pages de présentation.
- FluidNC WebUI : wiki officiel injoignable ; mise en page de la v3 mal documentée.
- Les chiffres de tailles de cibles en millimètres : ceux du prompt (1 px ≈ 0,19 mm) n'ont pas été remesurés sur la tablette.
