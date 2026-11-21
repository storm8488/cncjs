# Interface Performance v2 — guide de l’opérateur

Ce guide s’adresse à la personne qui conduit la CNC depuis la tablette Surface Pro 3 (écran 1366 × 911 à l’échelle 1,58). Il explique comment activer et désactiver la v2, comment lire chaque écran et ce que la v2 ne fait pas.

La v2 change la **présentation**. Elle ne change pas les commandes :

- Pause et Arrêter restent dans le bandeau du haut, à la même place.
- Démarrer et Reprendre gardent leur confirmation.
- Les zéros gardent la leur.
- Aucun geste sur un dessin ne déplace la machine.
- Arrêter est un arrêt logiciel. Il ne remplace pas l’arrêt d’urgence matériel.

## 1. Activer ou désactiver la v2

### Conditions

La v2 ne s’ouvre que si quatre conditions sont réunies :

1. le profil **Performance** est choisi (Réglages › Affichage) ;
2. la machine est déclarée **CNC** (le laser garde sa vue 2D) ;
3. le **GPU matériel** est reconnu par le test existant (pas de rendu logiciel) ;
4. la fenêtre est **large** : au moins 1300 × 880 px CSS, en paysage (le poste large).

Si une condition manque, la ligne de rendu dans Réglages en donne la raison et la page conserve le rendu v1. C’est le cas sur la Surface RT, en Éco, sur une tablette plus petite et en rendu logiciel.

### Activer

1. Machine au repos, sans travail en cours.
2. **Réglages › Interface Performance v2 · Cette tablette** : touchez le bouton. Il passe à « Activée ».
3. Le message « Changement préparé pour la prochaine session au repos » s’affiche, dans Réglages et dans le bandeau. **La page ne se recharge pas** et rien ne bouge.
4. La v2 s’ouvre à la **prochaine ouverture de l’interface**, machine au repos avec un rapport récent. Rechargez donc l’interface vous-même au repos, ou attendez le prochain démarrage du kiosque.

Si l’interface voit un travail avant son premier repos, la v2 ne s’ouvre pas pendant cette session. Un état inconnu, une alarme ou une prise d’origine attendent le premier repos confirmé par un rapport récent ; la v2 peut alors s’ouvrir si toutes ses conditions sont réunies.

Le choix est mémorisé dans ce navigateur seulement (clé `cncjs-touch-performance-ui-v2`). Si le navigateur refuse de l’enregistrer, Réglages affiche « Changement non enregistré : stockage du navigateur indisponible. ».

### Désactiver

- **Réglages › Interface Performance v2** : touchez le bouton, il passe à « Désactivée ». Les calculs et la scène v2 s’arrêtent tout de suite. **La disposition reste celle de la v2 jusqu’à la fin de la session**, pour que rien ne bouge sous le doigt. Le rendu v1 revient à la prochaine ouverture au repos.
- **Choisir Éco** arrête aussi tout de suite les ressources de la v2. Pendant un travail, la grille reste figée ; elle revient à le rendu v1 dès que la machine est de nouveau au repos.
- **Perte du GPU** (contexte graphique perdu) : la vue 3D est remplacée par une vue fixe dans le même cadre. Les commandes ne bougent pas.

### Réglages de rendu (session v2 seulement)

Dans Réglages, sous « Rendu 3D de cette session » :

- **Qualité complète** : rendu normal.
- **Rendu allégé** : moins de détails, même cadre.
- **Arrêter le rendu 3D** : vue fixe, même cadre.

Ces choix n’agissent que sur l’affichage. **Diagnostic du rendu** affiche, à la demande, GPU matériel, résolution, DPR et qualité effective. **Mesurer 60 images** ne fonctionne qu’au repos, avec un état récent. C’est une mesure isolée, pas une garantie.

## 2. Suivre la séance

Les rendus Éco et Performance suivent le même rail : **Machine → Fichier → Zéro pièce → Contrôle → Usinage**, puis **Plus**. Sur le laser, Usinage s’appelle Gravure. Les commandes gardent la même place quand le rendu change.

### Machine

Connectez la CNC et prenez la main. La page indique les réglages à relire, la prise d’origine à faire et la vérification du zéro pièce. Un refus présente son bouton remède sur place. Après un incident, suivez les lignes dans l’ordre ; déverrouiller ne rend pas sa position à une machine qui l’a perdue.

La mise en service s’ouvre seulement si vous la demandez, depuis cette étape, Plus ou Réglages. Ses confirmations restent obligatoires. La fin ou l’abandon de l’assistant revient à Machine.

### Fichier

Choisissez un fichier pour voir son aperçu, son emprise, sa profondeur et le contrôle de course du serveur avec le zéro actuel. Charger ne démarre aucun mouvement et laisse cet écran ouvert. Une autre sélection ne remplace pas le fichier chargé. Un contrôle indisponible propose Réessayer.

### Zéro pièce

Les déplacements, les zéros ici ou à l’origine machine, la plaque et le bloc sont réunis. Les flèches et les pas restent visibles. Ma sonde contient vos mesures et la sauvegarde des profils ; Tester ouvre le diagnostic commun, également utilisé par la mise en service.

Avant de palper, touchez le bloc avec la fraise puis écartez-le. Si le contact reste permanent, le diagnostic guide la vérification de la pince et de la broche débranchée. Ne remettez la broche sous tension qu’après avoir terminé les manipulations.

### Contrôle

Vérifiez l’emprise et la profondeur, puis démarrez depuis cette étape. Le dessin utilise le verdict du serveur. Un dépassement prouvé bloque le départ ; un résultat non vérifiable reste annoncé. Les remèdes permettent de refaire le zéro ou de choisir un autre fichier.

Détails du contrôle donne les valeurs techniques et, seulement quand le serveur l’autorise, la dérogation explicite à un dépassement. Elle ne contourne jamais une origine machine perdue ni un zéro pièce non confirmé. La vue 3D de placement s’ouvre à votre demande, au repos ; aucun toucher sur le dessin ne déplace la machine.

### Usinage ou Gravure

L’aperçu et Arrêter l’usinage sont à gauche ; l’avancement, les positions pièce et les trois rangées Vitesse, Broche, Rapides sont à droite. La barre d’étape donne Pause ou Reprendre selon l’état. Une pause ne garantit pas l’arrêt de la broche. L’encart dit ce qui manque et propose les actions autorisées par la machine.

La courbe et la séquence de la v2 restent des informations. Touchez un événement de la courbe pour ouvrir le Journal dans son contexte ; le retour retrouve la vue. Détails du temps donne les données techniques. Le point bleu ne dépasse jamais le dernier rapport reçu ; une information ancienne le fige.

En changement d’outil ou après la fin, Zéro Z à la plaque reste accessible quand la machine le permet. Reprendre à une ligne utilise le fichier arrêté, même si un autre aperçu est choisi. Son volet vérifie automatiquement la ligne affichée ; une ancienne réponse ne peut pas autoriser une autre ligne. Détails garde le trajet, le préambule et les notes complets. Charger la reprise mène au Contrôle avant le départ confirmé.

### Plus

Cinq tuiles donnent Journal, Réglages, Mise en service, Guide et Macros. Sans macro, la tuile reste rayée avec sa raison. La mise en service affiche son état ou la date du bilan enregistré. La ligne de version donne la page chargée et sa valeur de cache.

Chaque sous-écran garde le rail sur Plus et propose **← Plus** dans son en-tête.

- **Journal** : Cette session garde au plus 100 événements de cette page et les retours de commandes, en Éco comme en Performance. Exportez avant de recharger. Serveur lit l’historique durable de tous les appareils, 500 entrées au plus, par pages. Les contacts et valeurs du palpage au bloc sont consultables ; aucun événement ne peut être rejoué. Un zéro peut être resté inchangé, avoir été écrit ou avoir peut-être changé : le journal conserve cette distinction.
- **Réglages** : Affichage, Machine et performances, Système gardent leur organisation et la portée de chaque réglage. Sur une page distante, la luminosité Pendant la veille est rayée avec « Réglable seulement sur la tablette de la machine. ». Le curseur explicite conserve les permissions données par le serveur.
- **Guide** : une page par étape, puis Après un incident et La sonde.

Système distingue la version chargée de la version installée. Recharger demande un repos sûr, vérifié aussi auprès du serveur ; il n’est jamais automatique. Quitter l’écran des mises à jour annule le second toucher d’installation et le suivi périodique de son affichage, sans interrompre une tâche déjà acceptée par le serveur.

## 3. Limites à connaître

- Le parcours vient du fichier. La page ne mesure ni la pièce, ni les brides, ni le diamètre réel de la fraise ; elle ne détecte pas les collisions.
- Une ligne reçue par la machine n’est pas forcément déjà usinée. Le temps restant est une estimation.
- Le verdict de course vient du serveur ; le dessin et le placement 3D ne le remplacent pas. Un résultat inconnu ne prouve pas que le fichier tient.
- Rotation, zoom, loupe et toucher de la courbe servent à l’affichage. Les mouvements gardent leurs commandes et confirmations.
- La page de simulation est un banc distinct. Aucun de ses fichiers exclus n’est réintroduit dans la page de la tablette.
- La validation logicielle sur PC ne vaut pas essai matériel. Les contrôles de disposition, du tactile, de Chromium 106, de la Surface et de la CNC restent à effectuer selon le protocole de la refonte. Le harnais ciblé L6 n’a pas atteint ses scénarios dans le bac à sable : connexion Edge refusée avant le rendu.
