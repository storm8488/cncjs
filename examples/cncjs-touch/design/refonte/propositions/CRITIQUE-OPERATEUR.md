## 1. Verdict en cinq lignes

**Non : la spec ne peut pas être réalisée telle quelle sans arbitrages de sûreté et corrections de parcours.**  
Le pire défaut est D2 : une preuve absente est considérée acquise, et le bouton nécessaire pour refaire cette preuve manque.  
Le deuxième est l’annonce possible « La broche est arrêtée » alors que son arrêt est refusé et qu’elle tourne encore.  
Le troisième est la suppression de confirmations matérielles sur la seule reconnaissance de `localhost`, qui ne prouve ni table dégagée ni sonde en place.  
Les 65 commandes sont répertoriées, mais plusieurs gardes, conséquences et transitions restent contradictoires ou insuffisamment spécifiées.

Les références « §… ; l.… » désignent [SPEC-REFONTE.md](/C:/Users/damou/Documents/claude/cncjs/examples/cncjs-touch/design/refonte/SPEC-REFONTE.md). Les corrections concrètes sont regroupées et numérotées dans la **Liste classée**, à laquelle renvoient les tableaux.

Lecture intégrale, dans l’ordre demandé, des cinq documents principaux ; comparaison structurée des 65 entrées du JSON. Le plan de corrections désormais disponible a également été recoupé. Aucun fichier créé, modifié ou supprimé.

## 2. Parcours P1 à P10

### Convention du rejeu

Les dessins ne permettent pas de terminer tous les parcours. Je distingue donc :

- **Rejeu incomplet** : un bouton, une transition ou l’état suivant n’est pas dessiné.
- **Compte conditionnel `*`** : compte obtenu en complétant les variantes manquantes avec le gabarit de confirmation **dessiné**, qui comporte une case. Ce n’est pas un parcours visuellement démontré.
- Chiffres saisis, déplacements par les flèches et manipulations physiques comptés à part, comme dans ERGONOMIE.

Les écarts d’une case ne prouvent pas une erreur arithmétique du §7 : ils montrent que ses comptes utilisent l’allègement du §6.3, **absent des fils de fer**. Je ne l’utilise pas pour compléter artificiellement le rejeu.

| Parcours | Touchers actuels | Annoncés par la spec, kiosque / ailleurs | Ce que je compte sur les dessins | Verdict |
|---|---:|---:|---|---|
| P1 Mise en route | 6 ; 10 après redémarrage CNCjs | 4 ; 6 sans K4 / 5 | Initial incomplet ; **5*** avec la case dessinée | Premier état et arrivée « Prête » manquants. B5, B14, B24 |
| P2 Fichier | 3 ; 4 avec verdict | 3 / 3 | **2, puis aucune action de chargement dessinée** ; 3* si ajoutée | Le fil montre uniquement un fichier déjà chargé. B5 |
| P3 Premier bloc XYZ | 35 + détour ≥3 ; 9 saisies | 13 / 14 ; 4 saisies | **Incomplet ; 14*** au minimum avec le gabarit, hors détour de diagnostic | Entrée de l’assistant et test du contact non rejouables. B7 |
| P4 Bloc suivant | 6 ; 5 si XYZ retenu, hors positionnement | 3 / 4 | **4*** si XYZ retenu ; **5*** sinon | Plafond non garanti dans toutes les variantes. B6 |
| P5 Plaque Z | 3 depuis Suivi ; 4 ailleurs | 3 / 4 ; 2/3 en pause outil | **4*** depuis un autre écran avec la case | Dépassement explicitement admis hors reconnaissance locale. B6 |
| P6 Zéros manuels | 4 axe ; 3 XYZ ; origine machine impossible | 3 / 3 / 4 | **3 / 3 / 4*** ; dialogues et volet uniquement décrits | Comptes plausibles, chaîne visuelle incomplète. B5, B20 |
| P7 Départ, pause, reprise, arrêt, correction | 9 | 7 / 9 | Variante nominale incomplète ; **9*** avec les deux cases | La correction placée après l’arrêt est inexécutable. B5 |
| P8 Après alarme | 12 | 8 / 10 | **5 jusqu’après la prise d’origine, puis rupture** ; 10* si complété | Reprise affichée comme une ligne, sans bouton dans le dessin. B2, B5 |
| P9 Prise de main | 3 | 2 / 2 | **2** | Compte tenu ; conséquence mécanique cachée. B17 |
| P10 Diagnostic sonde | 3, puis impasse | 2 + 0 à 3 / idem | **2 pour entrer ; fin non démontrée par un fil** | Le tableau du diagnostic prend la mauvaise branche pour T9. B11 |

### P1 — Mise en route

**Suite visible :** carte « Ouvrir /dev/ttyUSB0 ? » → **Ouvrir** → dessin Machine en incident → **Prise d’origine machine…** → case → **Lancer la prise d’origine**.

Cela fait **quatre touchers après l’apparition de la question d’ouverture**. Le premier **Connecter la CNC** n’est pas dans le fil de fer de l’état initial ; en le rétablissant, on obtient cinq avec la case. L’état final « Prête » et son bouton suivant ne sont pas dessinés.

Le détour après redémarrage CNCjs est contradictoire : relecture prévue en alarme, mais activation limitée au repos dans le moteur de séance.  
**Références : §4.1, l.283–345 ; §5.2, l.603–611 ; §6.4, l.885. Corrections : B5, B14, B24.**

### P2 — Choisir et charger

1. Rail **Fichier** → liste.
2. Ligne du programme → aperçu, emprise et profondeur.

Le dessin porte déjà **Chargé**, « Choisi = chargé » et **Suite : Zéro pièce**. Il ne montre pas **Charger ce fichier**. L’opérateur ne dispose donc pas, sur ce dessin, du troisième toucher annoncé.

Autre impasse : « Contrôle indisponible pour l’instant » n’a aucun bouton pour réessayer ou comprendre ce qui manque.  
**Référence : §4.2, l.358–390. Corrections : B5, B15.**

### P3 — Premier palpage XYZ

Le chemin visuellement naturel est :

1. **Zéro pièce** → carte Sonde.
2. **Ma sonde…** → choix du coin.
3. **Avant gauche** → mesures.
4. à 11. Quatre champs, ouverture puis validation ; quatre saisies.
12. **Enregistrer et palper**, tel que dessiné.
13. Case du gabarit.
14. Bouton de lancement du palpage.

Trois ruptures :

- Le §7 utilise **Palper au bloc XYZ…** pour ouvrir l’assistant ; rien dans le dessin n’annonce ce changement de fonction.
- Depuis **Ma sonde…**, le texte du §5.5 impose en réalité **Enregistrer**, alors que le dessin montre **Enregistrer et palper**.
- Le test contact/libération est annoncé sur la carte située derrière l’assistant. Le §7 suppose qu’on le voit pendant les saisies, alors que les surcouches le masquent.

Les nombres 5,0 / 9,9 / 9,9 / 6 affichés dans les champs peuvent également être pris pour des valeurs proposées, contrairement à l’interdiction écrite juste après.  
**Références : §4.3, l.402–435 ; §5.5, l.668–685 ; §7, l.1002. Correction : B7.**

### P4 — Palpage suivant

**Zéro pièce** → **Palper au bloc XYZ…** → case → **Lancer le palpage** : **quatre touchers** avec le gabarit dessiné.

Si le dernier choix était X, Y ou Z, il faut auparavant toucher **XYZ** : **cinq**. Le §7 suppose XYZ retenu, alors que la règle mémorise **le dernier choix**, pas toujours XYZ.

En local avec suppression de la case, ces variantes deviennent trois et quatre. Le plafond dépend donc d’un allègement de garde et d’une reconnaissance du kiosque non vérifiée.  
**Références : §4.3, l.430–433 ; §6.3, l.825–832 ; §7, l.1006–1007. Corrections : B4, B6.**

### P5 — Plaque Z entre deux programmes

**Zéro pièce** → **Zéro Z à la plaque…** → case → **Lancer le zéro Z** : **quatre touchers** depuis Usinage.

La spec reconnaît elle-même cette régression lorsque la tablette n’est pas reconnue locale : quatre contre trois aujourd’hui. Le raccourci pendant une pause de changement d’outil n’est pas dessiné sur Usinage ; son état pendant le palpage n’est pas défini.

**Références : §4.3, l.409 ; §4.5, l.539 ; §5.7 ; §7, l.976, 983, 1009–1011. Corrections : B6, B16.**

### P6 — Zéros manuels

- Axe ici : **Zéro pièce** → déplacements physiques → **Zéro X** → confirmation : **3***.
- XYZ ici : **Zéro pièce** → **Zéro XYZ ici** → confirmation : **3***.
- Axe à l’origine machine : **Zéro pièce** → **Autres zéros…** → **X à l’origine machine** → confirmation : **4***.

Ces comptes correspondent aux gabarits écrits. Le défaut opérateur est le dernier bouton **Poser le zéro X**, identique pour deux conséquences différentes.

**Références : §4.3 ; §5.4, l.658–662 ; §5.8. Corrections : B5, B20.**

### P7 — Contrôle et départ

Le seul dessin de Contrôle montre un dépassement : **Démarrer** rayé, **Refaire le zéro Z** et **Choisir un autre fichier**. Le refus est visible ; la variante « tient », puis les dialogues de départ/reprise et l’écran de pause ne sont pas dessinés.

Séquence conditionnelle avec le gabarit : **Démarrer** → case → **Lancer** → **Pause** → **Reprendre** → case → **Reprendre l’usinage** → correction → **Arrêter** : **9***.

Le §7 met la correction **après Arrêter**, alors que §4.5 désactive les corrections hors usinage. ERGONOMIE présente déjà cette mauvaise chronologie : il faut corriger les deux scénarios de mesure, pas compter un toucher sans effet.

**Références : §4.4, l.464–499 ; §4.5, l.550 ; §7, l.1018. Correction : B5.**

### P8 — Après ALARM:2

**Arrêter** → rail **Machine** → **Prise d’origine machine…** → case → **Lancer la prise d’origine** : **cinq touchers**.

Ensuite, le fil présente « Reprendre l’usinage à la ligne 1 219 » comme une ligne de liste, sans bouton. Le remplacement de l’action principale n’est visible que dans les explications.

En complétant : **Reprendre à la ligne…** → **Charger la reprise** → **Démarrer** → case → **Lancer** : total **10***. Si la preuve du zéro échoue, le remède prévu ne relance pas la bonne opération.

**Références : §4.1, l.290–295 ; §5.12 ; §6.9 ; §7, l.1020–1027. Corrections : B2, B5, B22.**

### P9 — Prendre la main

**La main : PC atelier** → **Je suis devant la machine** : **deux touchers**.

Le compte est tenu. Le deuxième bouton ne dit toutefois ni « Prendre la main », ni qu’il peut arrêter le déplacement ou le palpage de l’autre client.

**Références : §5.3, l.638–648 ; §6.3, l.816. Correction : B17.**

### P10 — Sonde défaillante

**Zéro pièce** → **Tester** : **deux touchers pour entrer**. Aucun fil ne montre les états successifs ; ils sont définis par le tableau du §5.6.

En appliquant ensuite ce tableau au cas réel : retirer la pince libère le contact, même si la broche est responsable. L’écran conclut « C’était la pince » et demande de la remettre ; le défaut revient, sans atteindre le test de la broche.

**Références : §4.3, l.402 ; §5.6, l.697–700. Corrections : B11, B12.**

## 3. États de la machine

« Couvert » signifie **défini dans la conception**, pas testé en fonctionnement.

| État | Couvert ou non ; affichage et actions | Où dans la spec | Ce qui manque |
|---|---|---|---|
| CNC non connectée | Carte de connexion sur ① ; bandeau Non connectée ; Connecter/Ouvrir ; commandes machine rayées | §4.1, l.304, 315–327, 340 | L’algorithme global peut rayer **Connecter**, son propre remède. B24 |
| Serveur hors ligne | ① Hors ligne ; données atténuées ; Recharger la page ; arrêt conservé si activité perdue | §4.1, l.339 ; §6.4, l.860–861 | Distinguer clairement perte du serveur et port fermé ; ne pas présenter le rechargement comme un arrêt machine. B15 |
| Rapport périmé | Bandeau Information ancienne ; commandes rayées ; « Attendez » | §6.4, l.864 ; §9.2 n°6 | Aucune sortie lorsque l’attente dure indéfiniment. B15 |
| Alarme, dont ALARM:2 puis redémarrage | ⑤ Arrêter l’usinage, puis ① Perdu/Gardé et prise d’origine | §4.1 ; §4.5, l.541–543 ; §6.9 | Raccord aux champs `lastAlarm` et `referenceLost` du plan ; conservation après rechargement. B3, A6 |
| Prise d’origine en cours | ① Prise d’origine ; action rayée ; Arrêter dans le bandeau | §4.1, l.345 ; §6.4, l.870 | Règle précise, mais pas de dessin dédié. À inclure dans B5 |
| Machine non référencée | ① Origine à prendre ; prise d’origine proposée ; grands pas/continu refusés sur ③ | §4.1, l.344 ; §4.3, l.454 | Intégrer les nouveaux refus du chantier A et préserver les arrêts pendant tous les blocages. B3, B24 |
| Décalage non prouvé — D2 | ① Vérification ; ③ À vérifier ; départ rayé sur ④ | §0.2 K3 ; §4.1, l.309 ; §4.4, l.493 | Absent considéré prouvé ; mauvais remède ; aucune action propre à la ligne de vérification. B1, B2 |
| Travail en cours | Fil complet de ⑤ ; Pause, Arrêter, corrections ; bandeau accessible | §4.5, l.511–550 | Exceptions d’arrêt à écrire dans les règles globales de désactivation. B24 |
| Pause | Distinction pause opérateur/programme ; Reprendre ; arrêt broche ; plaque selon cas | §4.5, l.538–540 | Arrêt broche promis dans une pause où le serveur le refuse ; faux message d’arrêt possible. B13 |
| Palpage en cours | Bloc : progression sur ③, Arrêter le palpage, autres mouvements rayés | §4.3, l.437–438 | Plaque lancée depuis ⑤, arrêt demandé, échec et perte de référence non déroulés ; « Pause » peut être un arrêt définitif. B16 |
| Autre client pilote | Bandeau nommé ; commandes rayées ; Prendre la main ; dialogue | §2.2 ; §5.3 ; §6.4, l.863 | Conséquence d’interruption cachée ; remède potentiellement rayé par l’algorithme. B17, B24 |
| CNCjs redémarré | ① Réglages à lire, puis origine à reprendre | §0.2 K4 ; §4.1, l.341 | Relire encore limité au repos ; preuve du décalage inconnue mal traitée. B1, B14 |
| Programme chargé hors course | ② avertissement ; ④ dessins, départ rayé, remèdes ; dérogation dans Détails | §4.2 ; §4.4 ; §5.11 | Remèdes faux pour G53 et dangereux s’ils invitent à falsifier Z0 ; bornes utilisables à raccorder. B3, B18 |
| Contact permanent | Voyant permanent ; Pourquoi ? ; diagnostic A | §5.6 ; §6.5 | Mauvaise branche pour T9 ; aucune condition de sécurité avant manipulation. B11, B12 |
| Arrêt en usinage, MPos 0, référence perdue | ⑤ Remise en route → ① prise d’origine → preuve du zéro → reprise | §4.5, l.543 ; §6.9 | Échec D2 sans remède correct ; variantes de reprise insuffisamment dessinées. B2, B5, B22 |

## 4. Journal de terrain

Les verdicts portent sur les mécanismes **prévus**. « Empêchée » ne signifie pas qu’un test a été exécuté.

| T | Verdict | Paragraphe et lots | Ce qui manque ou condition de validité |
|---|---|---|---|
| T1 Écran noir | **Empêchée pour les causes documentées**, si D3 est livré | §0.2, l.41–43 ; §4.7 ; §8 ; serveur S5 et page P2 du plan | Le mécanisme est l’autorisation serveur et le réveil local, pas seulement le réglage grisé. Rendre ces dépendances obligatoires. B3 |
| T2 Départ hors course | **Atténuée** dans le contrat actuel | §4.2 ; §4.4 ; §6.3 ; L4 ; S2/S3 | D1 existe, mais la preuve du décalage et les bornes utilisables sont mal raccordées. B1, B3 |
| T3 Zéro incohérent après prise d’origine | **Atténuée** | §0.2 K3/K8 ; §4.1 ; §6.9 ; L2 | Champ absent assimilé à une preuve ; échec sans bonne commande de relance. B1, B2 |
| T4 XYZ introuvable | **Empêchée** | §4.3, l.408–409 ; L3b | Les deux boutons sont dessinés côte à côte ; conserver ce placement dans les variantes de refus. |
| T5 Profil incompréhensible | **Empêchée pour l’impasse de saisie** | §5.5 ; L3b, l.1381 | Assistant et mesures définis ; les champs préremplis du dessin et les défauts contradictoires restent à corriger. B7, B21 |
| T6 Grisé puis clic sans effet | **Atténuée** | §4.3 ; §6.1 ; L1/L3b | Un refus du ticket peut survenir avec `canBlockProbe:true` ; le mécanisme décrit ne couvre pas ce cas. B8 |
| T7 Refus de course incompris | **Atténuée** | §9.2 n°21 ; §6.6 ; L3b ; S6 | Le dessin du bloc ne montre pas le bord machine dépassé ; aucun côté ni déplacement chiffré. B9 |
| T8 Fraise qui redescend sur le bloc | **Atténuée** | §6.6 ; §8 ; L3b | Le dessin conseille un placement mais ne le constate pas. Le scénario « trop loin des bords » n’est pas un critère explicite de recette. B10 |
| T9 Contact permanent | **Atténuée**, avec diagnostic erroné | §5.6, l.697–700 ; L3b | Le cas exact de mise à la masse par la broche quitte prématurément la branche. B11 |
| T10 Relire introuvable après redémarrage | **Atténuée** | §4.1 ; §6.4, l.885 ; L2 ; S5 | Le bouton est visible, mais son activation réintroduit le refus en alarme. B14 |
| T11 Plaque disparue | **Empêchée pour la disparition** | §4.3, l.434, 456 ; §6.8 ; L3b | Conservation explicitement testée ; les bons remèdes restent dépendants de B2/B8. |
| T12 Qui pilote et pourquoi refusé | **Empêchée pour l’identification et l’accès** | §2.2 ; §5.3 ; §6.4 ; L1/L2 | L’effet d’une prise de main sur une activité doit encore être annoncé. B17 |
| T13 Zéro à l’origine machine absent | **Atténuée** | §0.2 K5 ; §5.8 ; L3a | K5 absent fait disparaître la fonction ; paramètre différent du plan actuel. B3 |
| T14 Ancienne version après installation | **Atténuée** | §8, l.1054 ; L1, l.1326 ; plan P2 | CONSTATS réfute la causalité des suffixes `?v=`. Le test du cache unique ne prouve pas le chargement de la nouvelle version. B25 |
| T15 Profondeur impossible découverte trop tard | **Atténuée** | §4.2 ; §6.7 ; L4 | Contrat des bornes à corriger ; Z0 assimilé au dessus de pièce ; contrôle indisponible sans remède. B3, B15, B19 |

**Dépendances serveur :** le plan contient bien des lots pour D1, D2, les arrêts, la plaque et les données du diagnostic. Je ne les déclare donc pas « sans lot ». En revanche, l’intégration de **`verifyOffset`**, explicitement confiée à la refonte par le plan, n’a **aucun lot dans la spec**. Les replis K3/K5 permettent également de terminer une interface sans remplir D2/D4.

## 5. Commandes machine

### Couverture

**65 identifiants sur 65 sont présents au §10.4**, après développement des plages.

Il n’y a pas de bouton actuel autonome de reset, de sélection directe G54/G55, d’effacement de décalage ou de déconnexion à déclarer disparu : ces actions ne faisaient pas partie des accès de la page inventoriée. Les resets indirects d’arrêt existent toujours ; G10 reste porté par les zéros et palpages.

### Écarts par commande

| Commandes | Écart | Référence spec | Correction classée |
|---|---|---|---|
| EX-01 ; OR-01/02/03/04/05 ; PA-01/03 ; EX-02/04 ; DE-08 | Suppression locale de la case, qui porte aussi des vérifications matérielles. OR-03/05 restent pourtant marqués « inchangé » | §5.2 ; §6.3 ; §10.4, l.1241 | B4 |
| OR-05 | L’inventaire possède en plus une case « main sur l’arrêt » dans la mise en service ; sa conservation doit être explicite | §4.7 ; §10.4 | B4 |
| PI-02 | Choisir un motif prend immédiatement la main et peut arrêter jog/cadrage/palpage ; présenté comme sans effet machine | §5.3 ; §6.3, l.816 | B17 |
| EX-06 | Arrêt broche proposé en pause opérateur malgré le garde existant ; repli pouvant affirmer à tort que la broche est arrêtée | §0.2 K10 ; §4.5 | B13 |
| OR-06/07/08 | Relire soumis au repos au lieu de `canReadSettings`, qui inclut l’alarme | §6.4, l.885 | B14 |
| DE-04 | La cible maintenue doit recevoir son relâchement même après perte du flux ou du pilotage ; exception absente des règles générales | §4.3, l.454 ; §6.4 ; §6.8 | B24 |
| EX-03 pendant PA-03 | « Pause » arrête définitivement le palpage avec reset ; aucun libellé spécifique n’annonce cet effet | §2.2 ; §4.3 ; §6.3 | B16 |
| PA-01/04/06 | États de plaque, arrêt, bilan et perte de référence insuffisamment distingués | §4.3 ; §4.5 ; §5.7 | B16 |
| PA-03/05 | Retrait de sonde à 2 mm dans la spec contre 1 mm dans D4 du plan : paramètre réel divergent | §5.5, l.683 ; §13.2, l.1496 | B21 |
| RL-02/03 | Vérification automatisée sans règle explicite contre une réponse ancienne ni activation liée au dernier plan correspondant | §5.12 ; L5, l.1415 | B22 |
| FI-02 | « Recharger le fichier » ne précise pas chargé, arrêté ou sélectionné | §4.4, l.497 ; §10.4, l.1259 | B23 |
| Nouvelle commande D2 | `verifyOffset` manque aux actions, écrans et lots, contrairement au plan | §6.1 ; §9.2 n°12 ; §11 | B2 |
| Toutes | Test de migration limité au sélecteur et à la requête ; gardes négatifs non couverts | §10.4, l.1229 ; L1, l.1335 | B26 |

### Fusions et suppressions déclarées

- **OR-01 + OR-02** : deux accès à `$X` fusionnés dans Machine.
- **OR-06 + OR-07** : relecture réunie dans Machine et ses remèdes.
- **ZE-03 → ZE-02** : relais du zéro XYZ fusionné.
- **DE-07** : accès v2 à la vitesse remplacé par l’accès commun.
- **PI-02** : choix du motif et envoi fusionnés en un geste.
- **CX-06** : code déjà inaccessible supprimé.
- **ZE-05 et PA-02** : accès de navigation supprimés.
- **FI-03** : accès au chargement supprimé avec son volet ; la fonction subsiste par FI-01.

Le retrait du choix de repère de **PA-03** est explicitement annoncé (§4.3, l.439 ; §10.4, l.1280). L’ancien garde exigeait déjà le repère actif : je n’en déduis pas une commande auparavant autorisée devenue impossible.

### Accès plus longs ou seulement conservés par déclaration

- `$X` depuis un autre écran : passage par Machine ajouté ; **quatre touchers hors kiosque contre trois depuis l’ancien bandeau**.
- Macros depuis Zéro pièce : passage par Plus ajouté.
- Commandes de Réglages : passage par Plus ajouté.
- **RM-01 à RM-05 et SY-01 à SY-06**, notamment broche de test, laser, rétroéclairage et commandes système : place nominale conservée par §4.7, mais aucun fil détaillé ne montre leurs gardes et confirmations.

Ces coûts et cette couverture par héritage doivent être inscrits dans la migration ; leur fréquence ne permet pas, à elle seule, de conclure à une régression d’un parcours fréquent. **A5.**

## 6. Contradictions, libellés, textes, confirmations

### Contradictions supplémentaires

| Références | Contradiction | Correction |
|---|---|---|
| §2.5, l.218 / §6.4, l.891 | L’ouverture consulte `.next`, mais la sortie du module définit `suite` | Un seul nom et un test par état d’arrivée. B5 |
| §4.3, l.412, 441 / §6.4, l.887 | La barre de ③ porte **Suite : Contrôle**, mais la table du moteur y définit **Palper au bloc** comme action | Séparer l’action de carte et celle de barre. B5 |
| §4.3, l.438 / L3b, l.1379 | `#probe-result` désigne le bilan, puis est annoncé supprimé | Nouvel identifiant distinct pour le bilan. A4 |
| §6.3, l.823 / §4.4, l.496 | La justification affirme que départ/reprise ne s’ouvrent que sur « tient », alors qu’un départ non vérifié reste permis | Écrire les variantes et leur priorité par rapport à D2. B1, B4 |
| §4.1, l.329 / §6.9, l.949–955 | Redémarrage inclus dans l’encart, mais omis de la définition d’incident ; détection limitée à la vie de la page | Utiliser les faits persistants du serveur. A6 |
| §4.3, l.415 / L5, l.1419 | Dessin agrandi au-dessus des boutons en v2, mais centres des commandes exigés identiques | Coter les deux rendus dans une même fenêtre. A3 |
| JURY §6.2 n°5 / mission §5.3 | Le jury accepte P5 à quatre touchers malgré le plafond de trois | Corriger l’accès, pas le plafond. B6 |

### Libellés

**A1 — §4.3, §4.5, §9.3.**

- **Zéro Z**, **Palper au bloc Z** et **Zéro Z à la plaque** sont trois gestes différents. Écrire **Zéro Z ici** sur le zéro manuel.
- **Vitesse** et **Rapides** sont deux rangées de pourcentages sans conséquence explicite. Préférer **Vitesse d’usinage** et **Déplacements rapides**.
- **Ma sonde…** ne dit pas qu’on y règle des mesures : **Mesures du bloc…**.
- **Réglages sûrs** affirme davantage que des valeurs initiales dans les bornes du serveur : **Vitesses initiales**.
- **Prêt** sur Usinage, y compris avec une broche tournant sans travail, peut être compris comme prêt à démarrer : **À contrôler** ou **Aucun usinage en cours**.
- `/dev/ttyUSB0` reste dans la question de connexion malgré la règle des détails techniques : nommer la machine, conserver le port dans Détails.

### Longueur des textes

Comptage : mots séparés par espaces, ponctuation isolée exclue ; apostrophes et traits d’union restent dans le mot. Les paramètres sont remplacés ici par 10 mm, 28 mm et un axe.

| Texte ou emplacement | Mots | Caractères | Problème |
|---|---:|---:|---|
| §9.2 n°18 : « La sonde touche déjà… cherchez pourquoi » | 17 | 98 | Dépasse les 90 caractères annoncés |
| §9.2 n°19 : aucun contact sur 10 mm, puis deux consignes | 19 | 91 | Dépassement et accumulation d’actions |
| §9.2 n°20 : mauvais placement, coin, distance, deux bords, trou | 24 | 119 | Trop dense pour la carte Sonde |
| §9.2 n°21 : dépassement du palpage et éloignement du bord | 16 | 82 | Ne tient pas sur une ligne de la carte de 362 px |
| §5.6 A2 : diagnostic pince et remise en place | 17 | 95 | Plusieurs étapes dans le même message |
| §5.6 A3 : diagnostic broche, garder débranchée, rebrancher | 17 | 114 | Trois phrases malgré « une consigne à la fois » |
| §5.6 B2 : vérifier le fil puis toucher le bloc | 18 | 92 | Deux manipulations dans une consigne |
| §6.6 XYZ : coin, deux bords, trou | 14 | 80 | Plusieurs lignes nécessaires sous le petit dessin |
| §6.6 X/Y : face, hauteur, distance | 15 | 65 | Plusieurs lignes nécessaires |
| §6.6 : « Le dessin montre où placer la fraise. Il ne voit pas le bloc. » | 13 | 61 | Annoncé sur une ligne sous 362 px : budget non crédible |
| §3.1 : état Éco après ouverture pendant usinage | 17 | 103 | Annoncé « sur une seule ligne » |
| §5.12 : trajet de reprise avec remontée à 5 mm | 14 | 81 | Le référentiel des 5 mm n’est pas nommé |

**Correction A2 :** une cause courte, puis une seule consigne ; cotes sur le dessin et étapes successives dans le diagnostic. Par exemple :

- **« La sonde touche déjà. Écartez le bloc. »** — bouton **Diagnostiquer**.
- **« Aucun contact après 10 mm en Z. »** — bouton **Tester la sonde**.
- **« Fraise hors de la zone de départ. »** — dessin coté et **Voir le placement**.

Les étiquettes **Déverrouiller sans prise d’origine** — 4 mots, 34 caractères — et **Démarrer malgré le dépassement** — 4 mots, 30 caractères — exigent une largeur adaptée, mais leur longueur ne justifie pas de retirer leur conséquence.

Sans rendu, je ne prétends pas établir les retours à la ligne exacts de tous les textes. Les dépassements de 90 caractères sont certains ; les largeurs physiques restent à mesurer.

### Place disponible

**A3 — §2.4, §4.3, §4.5, §14.**

- La colonne Sonde fait bien **520 px** selon la somme écrite. Son addition n’est pas fautive.
- La barre de refus réserve 620 px à la cause, 120 à Détails et 320 à l’action : il reste **186 px avant les écarts** pour les remèdes. Le cas avec **deux remèdes** n’est pas résolu par un dessin coté.
- La colonne gauche d’Usinage utilise exactement 520 px, puis ajoute une phrase **sous Arrêter** sans réserver sa hauteur.
- Le déverrouillage est coté à 48 px, alors que §2.6 impose 64 px aux commandes machine secondaires.

Il faut réallouer l’espace et réduire les aperçus si nécessaire, sans réduire les cibles, cacher les remèdes ou retirer les messages de sûreté.

### Confirmations

Les quatre gestes de dérogation D1 sont définis : Détails → dérogation → case → bouton nommé. Je ne constate pas de contournement supplémentaire dans cette séquence. En revanche, « impossible par réflexe » (§6.3, l.814) reste une affirmation non démontrée.

Les risques documentaires précis sont :

- retrait d’attestations matérielles assimilées à de la présence : **B4** ;
- deux zéros différents confirmés par le même libellé : **B20** ;
- prise de main immédiate derrière un bouton qui ressemble à un simple motif : **B17** ;
- reprise accompagnée d’un trajet fixe et de refus trop génériques : **B22**.

### Compatibilité v1 Éco

Aucune exigence trouvée imposant `:has()`, `color-mix`, `dvh`, un framework ou WebGL en Éco. Les SVG communs et les requêtes communes non périodiques `check`/`resumePlan` ne sont pas, par nature, des fonctions v2 interdites.

Cela ne valide pas Chromium 106 : le rendu, les cibles, les surcouches et les requêtes réellement émises n’ont pas été exécutés. Les problèmes documentaires retenus sont ceux d’**A3**, pas une incompatibilité CSS inventée.

## 7. Liste classée

### Bloquants

- **B1 — §0.2 K3, l.26 ; §9.2 n°13, l.1089.** Une preuve absente devient vraie, et certains défauts de repère sont classés en avertissement confirmable. **Correction :** seul `workOffset.state === 'proven'` vaut preuve ; absent, inconnu ou échoué bloque les opérations dépendantes de D2, avant toute dérogation ou avertissement de course.

- **B2 — §4.1, l.309 ; §4.4, l.493 ; §6.1, l.786 ; §9.2 n°12.** « Relire les réglages » ne remplace pas `verifyOffset`, imposé à la refonte par PLAN-CORRECTIONS, l.427 et 529 ; refaire un palpage ne résout pas davantage un état qui interdit le palpage. **Correction :** ajouter **Vérifier le zéro enregistré**, lié à `verifyOffset`/`canVerify`, aux écrans, remèdes et lots L2–L4.

- **B3 — §0.2 K1–K11 ; §10.4, l.1284 ; §11.** Les contrats provisoires ne correspondent plus au plan disponible : `workOffset`, `override:'travel'`, `at:'machine'`, `axes.usable`, `lastAlarm`, `canReadSettings`. **Correction :** remplacer la table K par ces contrats, affecter leur intégration et leurs tests aux lots, et interdire de clôturer D2/D4 avec une preuve présumée ou une fonction supprimée.

- **B4 — §5.2, l.618–626 ; §6.3, l.811–834.** `localhost` ne prouve ni présence physique, ni table dégagée, ni plaque/pince en place ; les 600 ms ne remplacent pas ces vérifications. **Correction :** conserver les confirmations matérielles et la case particulière de mise en service ; obtenir les plafonds par les accès directs, tout changement de garde restant une décision prouvée du chantier A.

- **B5 — §§4–6 ; §7 ; §2.5, l.218 ; §6.4, l.887–891.** Les variantes nécessaires à P1/P2/P3/P6/P7/P8 ne sont pas toutes dessinées ; les contrats `.next`/`suite` et action de carte/barre divergent. **Correction :** ajouter les vues manquantes avec boutons et transitions, unifier `suite`, distinguer action Sonde et Suite, puis recompter ; déplacer la correction de P7 avant l’arrêt.

- **B6 — §4.3, l.430 ; §6.3, l.832 ; §7, l.975–983.** P4 suppose XYZ retenu et P5 dépasse son plafond dès que la case reste ; le jury accepte une exception que la mission n’autorise pas. **Correction :** garantir un accès direct au palpage XYZ et au dialogue de plaque, avec les gardes conservés, puis tester les plafonds depuis chaque écran et après un autre choix de palpage.

- **B7 — §4.3, l.435–436 ; §5.5, l.668–685.** Le premier palpage repose sur une entrée d’assistant implicite, un test du contact masqué et des champs dessinés comme déjà renseignés. **Correction :** dessiner l’état vide, nommer **Configurer le bloc et préparer le palpage**, afficher les étapes contact/libération dans l’assistant et définir sa sortie sans geste caché.

- **B8 — §6.1, l.784–785 ; §6.4, l.887 ; L3b, l.1381.** Un refus calculé pour le ticket peut laisser le garde général `canBlockProbe` vrai ; le bouton reste alors actif malgré la promesse inverse. **Correction :** conserver le refus lié au profil, à l’opération et à la position jusqu’à un changement pertinent ; tester un refus de course avec `canBlockProbe:true`.

- **B9 — §9.2 n°21 ; §6.6, l.919.** Le remède à une limite machine montre seulement le bloc et ne donne ni côté ni distance. **Correction :** afficher le dépassement chiffré et orienté, un dessin incluant la course, puis **Replacer le bloc et la fraise** vers ③.

- **B10 — §6.6, l.912–921 ; §8 T8 ; L3b.** Le dessin seul n’empêche pas un départ trop loin du bord, alors que T8 est présenté comme traité. **Correction :** conserver la vérification explicite du placement, ajouter le scénario fautif à la recette et indiquer que le risque physique reste atténué tant que l’essai réel n’a pas confirmé le comportement.

- **B11 — §5.6, l.697–700 ; L3b, l.1381.** Retirer la pince libère aussi le contact causé par la broche ; A2 attribue donc à tort la panne à la pince et évite A3. **Correction :** faire remettre la pince sur la fraise, bloc écarté, puis comparer le signal avec la broche débranchée avant d’attribuer la cause ; tester exactement T9.

- **B12 — §4.3, l.429, 454–456 ; §5.6.** Le diagnostic peut demander de toucher la fraise ou débrancher le moteur sans condition explicite d’immobilité et d’arrêt de broche. **Correction :** suspendre toute consigne physique tant que l’état récent ne confirme pas absence de mouvement et broche arrêtée ; afficher les actions d’arrêt adaptées.

- **B13 — §0.2 K10, l.33 ; §4.5, l.538, 548.** Un arrêt de broche refusé peut être traduit par « La broche est arrêtée », notamment en pause opérateur. **Correction :** distinguer les types de pause ; sans preuve d’arrêt, afficher **Arrêt de broche indisponible dans cette pause**, avec **Arrêter l’usinage** selon les gardes existants.

- **B14 — §6.4, l.885, contre §4.1, l.341.** La relecture exige encore le repos alors que le chantier A l’autorise en alarme. **Correction :** tous les accès suivent `canReadSettings` et `readSettingsReason` ; tester CNCjs redémarré, carte en alarme, version inconnue.

- **B15 — §4.2, l.385 ; §6.4, l.860–864 ; §9.2 n°6.** Une absence durable de rapport ou de contrôle conduit à attendre sans sortie. **Correction :** distinguer attente courte et panne persistante, conserver les arrêts et proposer **Vérifier la connexion** ou **Réessayer le contrôle**, sans permettre de mouvement sur un état inconnu.

- **B16 — §4.3, l.437–438 ; §4.5, l.539 ; §9.2 n°23.** La plaque sur ⑤ n’a pas de cycle d’affichage complet ; « Pause » peut arrêter définitivement un palpage et provoquer un reset. **Correction :** définir séparément bloc/plaque, arrêt demandé, succès, échec, écriture incertaine et référence perdue ; nommer l’arrêt définitif et choisir la suite à partir de `written`/`needsHoming`.

- **B17 — §5.3, l.642–648 ; §6.3, l.816.** Prendre la main peut interrompre jog, cadrage ou palpage, contrairement à « Ne commande rien à la machine ». **Correction :** bouton **Prendre la main ici**, ou **Arrêter le palpage et prendre la main** selon l’état, en conservant deux touchers, motif et journalisation.

- **B18 — §9.2 n°11, l.1087.** Refaire le zéro ne corrige pas une cible G53 ; « refaire Z plus bas » peut déplacer arbitrairement toutes les profondeurs d’une pièce immobile. **Correction :** distinguer dépassement machine et dépassement lié au placement ; proposer correction du fichier ou déplacement physique du montage suivi d’un zéro mesuré.

- **B19 — §6.7, l.928.** Le dessin nomme « dessus de la pièce » un plan qui est seulement Z0 ; la spec n’établit pas la convention Vectric utilisée. **Correction :** écrire **Plan Z0 du fichier** ; ne représenter le dessus réel qu’avec une information explicitement connue.

- **B20 — §5.4, l.658–662.** Deux conséquences différentes se confirment avec **Poser le zéro X**, au même emplacement. **Correction :** **Zéro X ici** et **Zéro X = origine machine**, avec valeurs avant/après ; même distinction pour Y et Z.

- **B21 — §5.5, l.683 ; §13.2, l.1496.** Le retrait de 2 mm contredit le défaut de 1 mm du plan D4 et change un paramètre envoyé à la machine. **Correction :** fixer une valeur unique dans le contrat D4, synchroniser assistant et tests, et préserver les profils existants.

- **B22 — §5.12, l.746–754 ; §9.2 n°24 ; L5.** La reprise automatisée ne contractualise pas le rejet des réponses anciennes ; « choisir une ligne plus loin » ne répare pas nécessairement un refus. **Correction :** charger seulement le dernier plan réussi correspondant au fichier/version/ligne affichés ; montrer son trajet réel, sa hauteur référencée, la cause précise et **Choisir une autre ligne** ou **Reprendre au début**.

- **B23 — §4.4, l.497 ; §10.4, l.1259.** La cible de **Recharger le fichier** est ambiguë lorsque A est chargé et B sélectionné. **Correction :** recharger explicitement le fichier nommé sur Contrôle, afficher son nom et tester A chargé/B sélectionné ; documenter le changement de cible.

- **B24 — §6.4, l.856–881 ; §4.3, l.454 ; §6.8.** « Les six premières causes bloquent tout » peut désactiver Connecter/Prendre la main et ne réserve pas le relâchement d’une flèche tenue. **Correction :** définir les exceptions avant le blocage : remèdes autorisés, arrêts et relâchement restent accessibles ; tester perte de flux et prise de main pendant un appui.

- **B25 — §8 T14, l.1054 ; L1, l.1326.** L’unification des suffixes est présentée comme réponse à T14 alors que CONSTATS, l.137, réfute cette causalité. **Correction :** afficher version chargée/installée et Recharger au repos ; exiger installation puis un seul rechargement réussi, kiosque éveillé et en veille, avant de classer T14 empêchée.

- **B26 — §10.4, l.1229 ; L1, l.1335.** Vérifier un sélecteur et une requête ne prouve pas les gardes ; exiger 65 sélecteurs est incompatible avec les entrées supprimées ou automatiques. **Correction :** associer chaque entrée à son remplacement ou déclencheur, ses paramètres, confirmations, refus d’état et exceptions d’arrêt ; tester les cas interdits autant que les envois autorisés.

### Améliorations

- **A1 — §4.3 ; §4.5 ; §9.3.** Plusieurs libellés ne distinguent pas le geste ou surestiment l’état de préparation. **Correction :** appliquer les formulations proposées au §6 du rapport : **Zéro Z ici**, **Mesures du bloc**, **Vitesse d’usinage**, **Déplacements rapides**, **À contrôler**.

- **A2 — §3.1 ; §5.6 ; §6.6 ; §9.1–9.4.** Plusieurs messages dépassent les 90 caractères et la promesse d’une seule consigne. **Correction :** cause courte, dessin coté, étapes successives ; vérifier les lignes réelles en 16 et 18 px, FR/EN/ES.

- **A3 — §2.4 ; §4.3, l.415 ; §4.5, l.526–529 ; L5.** Les budgets de barre, de texte sous Arrêter et de positions entre rendus ne sont pas résolus. **Correction :** fournir les variantes cotées à 1366×768 et 1366×911, en conservant toutes les cibles et tous les remèdes.

- **A4 — §4.3, l.438 ; L3b, l.1379.** `#probe-result` est à la fois le futur bilan et un identifiant supprimé. **Correction :** distinguer l’ancien accès aux résultats du nouvel hôte de bilan et migrer leurs tests.

- **A5 — §4.6–4.7 ; §10.4.** Les accès rares deviennent plus longs et leurs sous-commandes sont seulement déclarées conservées. **Correction :** inscrire les touchers supplémentaires et ajouter une fiche des confirmations de Réglages, Mise en service et Macros.

- **A6 — §4.1, l.329 ; §6.9, l.949–957.** La définition d’incident et sa conservation après rechargement divergent. **Correction :** une définition fondée sur `lastAlarm`/`referenceLost`, avec cause affichée tant que la remise en état n’est pas terminée.

- **A7 — §4.3, l.443–449 ; §6.4, l.848.** Une trace récente de zéro sur un seul axe peut donner l’impression que tout le zéro pièce vient d’être posé. **Correction :** afficher les axes concernés — par exemple **Z vérifié ; X/Y conservés** — sans transformer cette indication en nouvelle autorisation de départ.

## 8. Non vérifié

- Audit documentaire uniquement : **aucun test, harnais, navigateur, capture ou commande machine exécuté**.
- Aucun comportement réel de la LUNYEE, de la Surface Pro ou de la RT validé.
- Aucun code source d’implémentation relu pour confirmer que les contrats des documents correspondent déjà au code.
- Les cinq documents principaux ont été lus intégralement dans la revue croisée ; le JSON a été comparé sur ses 65 entrées. PLAN-CORRECTIONS a été recoupé ; CONSTATS consulté sur les points concernés.
- FIRMWARE, TEXTES et l’inventaire complet des chaînes n’ont pas été relus intégralement pour ce rapport.
- Les retours à la ligne et dimensions finales restent à mesurer. Les comptes conditionnels ne sont pas présentés comme des parcours exécutés.
- Branche vérifiée : `feat/refonte-ui`, HEAD `521dc9d4`. Les références de lignes concernent les documents lus, pas une validation de leur réalisation.

