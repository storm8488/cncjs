# Proposition (c) — Le minimum pour réorganiser CNCjs Touch

Document de conception — 15 novembre 2026 — branche `feat/refonte-ui`.
Périmètre : organisation de la page existante ; corrections de sûreté confiées au chantier A.
Les comptes « après » sont des comptes de conception, pas des résultats mesurés dans le navigateur.

## 1. Le principe en cinq lignes

1. Garder le bandeau, le rail, les cartes, les commandes et les écrans qui rendent déjà service.
2. Mettre Machine avant Fichiers, puis Préparer et Suivi, dans le rail comme dans le Menu.
3. Réunir déplacements, zéros et palpages dans Préparer, en déplaçant les composants existants.
4. Montrer chaque blocage à côté de l’action, avec sa cause et un accès direct au remède disponible.
5. Conserver les confirmations et reconnaître les objectifs que cette réorganisation ne peut pas atteindre.

### Arborescence retenue

```text
TOUJOURS VISIBLES : état + fraîcheur + machine/fichier + main + Pause + Arrêter
RAIL FIXE : Menu | Machine | Fichiers | Préparer | Suivi | Journal | Réglages
Menu
+-- Six tuiles dans le même ordre que le rail ; reprise du dernier écran
Machine
+-- Connexion et choix de machine ; prise d'origine ; déverrouillage ; relecture
+-- Course machine                         [ancien écran Limites]
+-- Mise en service                        [assistant existant, neuf étapes]
+-- Détails de la machine                  [volet existant]
Fichiers
+-- Sélection, aperçu, profondeur, contrôle et chargement
+-- Détails du fichier / Ajouter un fichier / Contrôle avant usinage [volets]
+-- Fiche projet / Aperçu agrandi / Vue 3D agrandie                  [dialogues]
Préparer
+-- Déplacements et zéros à gauche ; bloc et plaque à droite
+-- Profils de sonde / Tester la sonde / Résultats / Sauvegarde des profils
+-- Comprendre le zéro pièce / Vitesse de déplacement / Macros       [volets]
Suivi
+-- Usinage, corrections, reprise à une ligne ; raccourci plaque conservé
+-- Détail du temps                                                [volet]
Journal
+-- Événements ; Exporter le journal                                [volet]
Réglages
+-- Affichage / Machine et performances / Système                   [onglets]
+-- Guide d'utilisation                                            [écran]
TRANSVERSAL : confirmation machine / zéro pièce / main / pavés / veille / verrou
```

Les sept destinations du rail restent présentes ; aucune navigation par étapes ne les remplace.
« Retour » quitte le rail et prend une place fixe dans le titre des sous-écrans.
Sonde est regroupée dans Préparer ; ses quatre sous-écrans utiles restent accessibles.
L’écran inaccessible de préparation du palpage ne devient pas une nouvelle destination.
Le raccourci plaque de Suivi est une exception assumée à « une fonction, un seul endroit ».
Il évite une régression du parcours fréquent entre ébauche et finition.

## 2. Fils de fer, dimensions et états

### Cadre commun

Le bandeau reste haut de 72 px ; le rail reste large de 88 px.
Les marges de 16 px conservent la zone utile : **1246 × 791 px en v2**, **1246 × 648 px en v1**.
Dans les dessins, `H` vaut 791 ou 648 ; les dimensions inscrites priment sur la largeur des caractères.
Les rectangles représentent les composants existants déplacés, sans réduction globale de leur taille.
Notation : `[P]` action principale haute de 64 px ; `[S]` secondaire de 48 px ; `[J]` flèche de 96 × 96 px.
Les actions machine importantes gardent 64 px même lorsqu’elles sont visuellement secondaires.
Écart entre cibles : 12 px minimum ; texte utile : 16 px minimum, avec variante agrandie conservée.
Une seule action reçoit l’accent principal ; les arrêts restent distingués et immédiatement accessibles.

```text
+------------------------------- 1366 x 72 --------------------------------+
| État / information | Vitesse | Broche | Machine / fichier | Main          |
|                   |         |        |                  | Pause | Arrêter |
+--------+----------------------------------------------------------------+
| Rail   | Zone utile : 1246 x H                                           |
| 88 px  | Titre et, sur les sous-écrans, [Retour S]                        |
|        | Cause du blocage + [remède S] ; aucune disparition de commande   |
|        | Contenu ; [Détails S] pour les informations techniques          |
+--------+----------------------------------------------------------------+
```

Le cadenas conserve sa cible de 48 px ; l’horloge reste secondaire.
L’identité courte de la machine accompagne le fichier ; elle ne disparaît plus pendant l’usinage.
Les sept cibles du rail font au moins 76 px de haut, séparées de 12 px.
Pause et Arrêter gardent des positions fixes ; leurs gardes et leur disponibilité réelle restent inchangées.
Les dialogues n’interceptent jamais leurs touchers ; une navigation ferme la confirmation en cours.

### États communs à tous les écrans

| État observé | Affichage persistant | Action proposée |
|---|---|---|
| Serveur injoignable | « Hors ligne. Vérifiez la connexion. » | « Voir la connexion » ouvre Machine. |
| État perdu pendant une activité | « État perdu. L’arrêt n’est pas confirmé. » | Arrêter reste tenté vers la dernière machine occupée connue. |
| Port fermé | « Machine non connectée. » | « Connecter la CNC ». |
| Alarme au repos | « Alarme N — {cause courte}. » | Prise d’origine machine ou Déverrouiller selon le refus réel. |
| Origine machine absente | « Faites la prise d’origine machine. » | « Prise d’origine machine… » ouvre sa confirmation. |
| Machine prête à déplacer | « Origine machine prise. » | Commandes autorisées par le serveur. |
| Usinage | « Usinage en cours. » | Pause ; Arrêter ; corrections autorisées. |
| Pause | « Axes arrêtés. La broche tourne encore. » si constaté | Reprendre… ; Arrêter la broche ; Arrêter. |
| Main détenue ailleurs | « {appareil} a la main. » | « Prendre la main ». |
| Refus d’une action | Cause conservée près du bouton, avec pictogramme | Remède explicite ; aucune nouvelle tentative automatique. |
| Information ancienne | « Position non actualisée. Attendez la connexion. » | « Voir la connexion » ; aucun mouvement proposé comme remède. |

Une commande indisponible reste visible, rayée, avec sa raison lisible sans toucher.
Une attente normale n’est pas une alarme ; son message ne devient pas rouge.
Les refus ne disparaissent qu’après réévaluation de leur cause, sans conserver un refus devenu périmé.

### Menu — 1246 × H

```text
+--------------------------- Menu ----------------------------------------+
| [Reprendre le dernier écran S]       État machine, sans commande cachée  |
+------------------ 407 ------------------+--- 407 ---+------ 408 ----------+
| [Machine] état et connexion             | [Fichiers]| [Préparer]          |
+----------------------------------------+-----------+---------------------+
| [Suivi] fichier et avancement           | [Journal] | [Réglages]          |
+----------------------------------------+-----------+---------------------+
```

Deux rangées de tuiles occupent la hauteur restante ; aucune tuile verte ne promet un départ possible.
La connexion quitte le Menu : la tuile Machine dit « À connecter » et conduit au bon écran.

### Machine — 1246 × H

```text
+-------------------------- Machine --------------------------------------+
| Cause / information à jour                             [Détails S]       |
+-------------------- 617 -------------------+------------- 617 -----------+
| Connexion : machine et port sélectionnés   | Origine machine : prise / ? |
| [Connecter la CNC P] ou [Ouvrir P]          | [Prise d'origine machine P] |
| [Choisir la machine S] [Annuler S]         | [Déverrouiller... 64]       |
| [Relire les réglages S]                    | Zéro pièce : valeurs relues |
+-------------------------------------------+-----------------------------+
| [Course machine S] [Mise en service S] [Fichiers S] [Journal S]           |
+-------------------------------------------------------------------------+
```

Une seule des actions de connexion ou de remise en état reçoit l’accent principal.
Après incident, la carte droite énumère les conditions restantes, sans créer un assistant de séance.
Le choix du contrôleur existant quitte les détails de l’aperçu pour cette carte de connexion.
La prise d’origine autorisée directement en alarme n’est pas précédée d’un déverrouillage inutile.

### Fichiers — 1246 × H

```text
+-------------------------- Fichiers -------------------------------------+
| [Recherche S] [Favoris S]                           [Ajouter un fichier S]|
+----------- 420 ----------------+------------------ 814 ------------------+
| Fichiers : lignes de 92 px     | Sélection : nom ; chargé : nom          |
| 4 lignes en v1 ; 5 en v2       | Largeur / longueur / sous zéro pièce    |
| [fichier sélectionné]         | Aperçu et emprise ; coupe verticale     |
| [autre fichier]               | Verdict + cause + [remède S]            |
| [Précédent S] [Suivant S]      | [Détails S] [Contrôle avant usinage S]   |
|                               | [Charger et ouvrir le Suivi P]          |
+-------------------------------+-----------------------------------------+
```

Le titre et la recherche partagent 48 px ; la liste conserve sa capacité actuelle.
Le contrôle occupe la carte de détail : il ne retire pas une ligne à la bibliothèque.
L’action serveur de contrôle déjà disponible porte sur la sélection, avant son chargement.
« Sous zéro pièce : 20,76 mm » ne devient pas « épaisseur usinable » sans connaissance du montage.
Le dessin distingue l’emprise du fichier, la course connue et la partie non vérifiable.
Un contrôle ancien ou portant sur un autre fichier est remplacé par « Contrôle à refaire ».

### Préparer — 1246 × H

```text
+-------------------------- Préparer -------------------------------------+
| [Profils de sonde S] [Tester la sonde S] [Résultats S] [Aide S]           |
| Cause + remède : bande de 64 px, présente aussi lorsque tout est prêt    |
+------------------ 626 --------------------+------------- 608 -----------+
| Position pièce X / Y / Z                  | [Z bloc] [X] [Y] [XYZ]       |
| [Zéro X S] [Zéro Y S] [Zéro Z S]          | Profil / diamètre / zéro     |
| [0,1] [1] [10] [25] [50] [100] [Continu]  | Dessin du bloc et du départ  |
|          [Y+ J]             [Z+ J]       | Coin extérieur ; trou exclu  |
| [X- J]   pas choisi [X+ J]                | Contact vu puis libéré       |
|          [Y- J]             [Z- J]       | [Palper XYZ... P]             |
| [Vitesse S] [Zéro XYZ S] [Macros S]       | Épaisseur / recherche plaque |
| [Zéro à l'origine machine... 64]         | [Palper Z à la plaque... 64] |
+------------------------------------------+------------------------------+
```

À 648 px : titre 48, écart 12, état 64, écart 12, puis 512 px disponibles.
À gauche : positions et zéros 96, pas 48, croix 312, avec deux écarts de 12 : 480 px.
La croix avec Z occupe 432 px de large ; les outils secondaires utilisent les 182 px adjacents.
À droite : cycles 64, champs 48, dessin 148, contact 48, lancement 64, plaque 64, cinq écarts de 12 : 496 px.
La dernière rangée plaque réunit ses deux champs et son bouton ; aucun onglet supplémentaire n’est nécessaire.
En v2, les 143 px supplémentaires agrandissent le dessin ; ils ne réintroduisent pas une vue cachant les flèches.
Le bloc conserve sa dernière opération ; aucun choix de plaque ne remplace silencieusement ce choix.
En laser, les éléments CNC non applicables sont remplacés par « Palpage réservé à une CNC ».

### Suivi — 1246 × H

```text
+---------------------------- Suivi --------------------------------------+
| Fichier chargé ; identité ; état                         [Détails S]    |
+-------------------- 730 -------------------+------------- 504 -----------+
| Aperçu ; vues existantes ; [Agrandir S]    | Pourcentage ; temps ; position|
|                                           | Cause / avertissement        |
|                                           | [Démarrer... P] ou            |
|                                           | [Reprendre... P]              |
| Vitesse : [-10] [-1] [100 %] [+1] [+10]    | [Palper Z à la plaque... 64] |
| Broche :  [-10] [-1] [100 %] [+1] [+10]    | [Reprendre à une ligne S]    |
| Rapides : [25 %] [50 %] [100 %]           | [Arrêter la broche 64]       |
|                                           | [Arrêter 64] séparé          |
+-------------------------------------------+------------------------------+
```

Les trois rangées de corrections sont directes dans les deux rendus.
Le raccourci plaque affiche l’épaisseur et la recherche reprises ; « Régler la plaque » mène à Préparer.
Il utilise le même gestionnaire et les mêmes valeurs que Préparer, sans identifiant dupliqué ni clic sur un bouton caché.
La reprise s’ouvre dans sa carte existante : fichier arrêté, ligne, Vérifier, Charger la reprise.
Le panneau de reprise remplace temporairement le contenu secondaire ; il ne masque jamais l’arrêt.
Le verdict de course précède Démarrer ; les détails techniques quittent la petite fenêtre défilante.
En laser, Cadrer… garde sa place et son fonctionnement ; la plaque ne le remplace pas.

### Journal et Réglages

```text
JOURNAL — 1246 x H
+-------------------------------------------------------------------------+
| Journal                 Source : session / serveur        [Exporter S]  |
| [Filtres S] ; événements horodatés ; cause et résultat séparés           |
| Liste défilante ; [Précédent S] [Suivant S] selon la source               |
+-------------------------------------------------------------------------+
RÉGLAGES — 1246 x H
+-------------------------------------------------------------------------+
| [Affichage S] [Machine et performances S] [Système S]                     |
| Cartes existantes : mêmes champs, mêmes commandes, mêmes confirmations  |
| Défilement existant ; raisons visibles ; [Guide d'utilisation S]         |
+-------------------------------------------------------------------------+
```

Le Journal conserve ses sources et filtres ; v2 enrichit les détails sans changer la destination.
Réglages reçoit seulement les textes cohérents, les écarts tactiles et les corrections déjà décidées.

### Sous-écrans conservés

Ces huit surfaces utilisent le même cadre : titre avec Retour, corps disponible, action finale fixe.

```text
COURSE MACHINE — 1246 x H
+-------------------------------------------------------------------------+
| [Retour S] Course machine ; X / Y / Z ; origine connue ou non             |
| Schéma statique ; valeurs lues ; données absentes nommées ; [Détails S]  |
+-------------------------------------------------------------------------+
MISE EN SERVICE — 1246 x H
+-------------------------------------------------------------------------+
| [Retour S] Mise en service ; étape n / 9 ; étapes existantes              |
| Consigne et dessin ; observations ; cases et commandes conservées        |
| [Précédent S] [Passer l'assistant S]                  [Continuer P]      |
+-------------------------------------------------------------------------+
GUIDE D'UTILISATION — 1246 x H
+-------------------------------------------------------------------------+
| [Retour S] Guide d'utilisation ; sommaire existant                        |
| Explication courte + dessin ; navigation vers les fonctions existantes  |
+-------------------------------------------------------------------------+
PROFILS DE SONDE — 1246 x H
+-------------------------------------------------------------------------+
| [Retour S] [Profil S] [Nouveau S] [Dupliquer S] [Sauvegarde S]             |
| [1 Dimensions S] [2 Coin et sens S] [3 Recherche S]                      |
| Dessin 500 px | champs >=48 px ; manques signalés sur chaque onglet       |
| [Supprimer S] [Restaurer S] [Retour au palpage S]       [Enregistrer P]  |
+-------------------------------------------------------------------------+
TESTER LA SONDE — 1246 x H
+-------------------------------------------------------------------------+
| [Retour S] Tester la sonde ; signal : libre / contact / inconnu           |
| Dessin 500 px | consigne ; contact vu ; contact libéré                    |
| [Contact permanent S] [Aucun contact S] [Retour au palpage P]             |
+-------------------------------------------------------------------------+
RÉSULTATS DU PALPAGE — 1246 x H
+-------------------------------------------------------------------------+
| [Retour S] Résultats ; réussi / arrêté / zéro pièce incertain             |
| Axes mesurés ; zéro écrit et relu, ou absence de preuve ; [Détails S]     |
| [Retour au palpage P]                                                   |
+-------------------------------------------------------------------------+
SAUVEGARDE DES PROFILS — 1246 x H
+-------------------------------------------------------------------------+
| [Retour S] Sauvegarde des profils ; profils réels                         |
| [Exporter S] [Choisir un fichier S] ; validation de l'import existante    |
| [Importer P] ; erreur près du fichier ; [Retour au palpage S]             |
+-------------------------------------------------------------------------+
ANCIEN ÉCRAN SONDE — regroupé dans Préparer, sans seconde surface
+-------------------------------------------------------------------------+
| Ses cycles, paramètres, diagnostic et résultats restent accessibles.    |
+-------------------------------------------------------------------------+
```

La préparation fictive inaccessible reste hors de la page réelle ; aucun fil de fer actif ne lui est attribué.
L’assistant de mise en service conserve ses neuf étapes, ses cases et son arrêt automatique de broche.
Le diagnostic observe le signal réel ; aucun bouton « C’est bon » ne fabrique une réussite.

### Volets conservés et regroupés

Tous les volets occupent au plus 900 × 580 px sous le bandeau ; Fermer mesure 48 px.
Le corps peut défiler ; le titre, la fermeture et l’action finale restent fixes.

```text
DÉTAILS DU FICHIER
+-- [Fermer S] -- identité, version, aperçu, dimensions et profondeur ------+
| [Régénérer l'aperçu S] ; import/export existants ; aucun choix de machine |
+-------------------------------------------------------------------------+
AJOUTER UN FICHIER
+-- [Fermer S] -- [Choisir un fichier S] -- état de l'envoi -----------------+
| Cause éventuelle ; [Ajouter le fichier P]                               |
+-------------------------------------------------------------------------+
CONTRÔLE AVANT USINAGE
+-- [Fermer S] -- fichier, outil/matière, zéro pièce, contrôle --------------+
| Deux cases existantes ; verdict ; [Charger la sélection P]              |
+-------------------------------------------------------------------------+
COMPRENDRE LE ZÉRO PIÈCE
+-- [Fermer S] -- dessin machine / pièce / fraise --------------------------+
| Une phrase par notion ; [Retour au palpage S] ; détails techniques       |
+-------------------------------------------------------------------------+
VITESSE DE DÉPLACEMENT
+-- [Fermer S] -- vitesse choisie ; choix existants >=48 px -----------------+
| Valeur et unité ; motif d'indisponibilité ; aucune commande ajoutée      |
+-------------------------------------------------------------------------+
MACROS
+-- [Fermer S] -- noms des macros existantes, cibles >=64 px ----------------+
| [Nom de la macro 64] ouvre la confirmation ; sinon « Aucune macro ».     |
+-------------------------------------------------------------------------+
DÉTAILS DE LA MACHINE
+-- [Fermer S] -- état, version, valeurs lues, origine, capacités -----------+
| Informations techniques ; [Relire les réglages S] si garde satisfaite   |
+-------------------------------------------------------------------------+
EXPORTER LE JOURNAL
+-- [Fermer S] -- formats et périmètres existants --------------------------+
| [Exporter le texte S] [Exporter les données S]                          |
+-------------------------------------------------------------------------+
DÉTAIL DU TEMPS
+-- [Fermer S] -- écoulé, estimé, limites de l'estimation -------------------+
| Informations disponibles dans ce rendu ; aucune valeur inventée         |
+-------------------------------------------------------------------------+
```

Dimensions XY rejoint Détails du fichier ; le volet Broche et rapides disparaît au profit des rangées directes.
Ces regroupements retirent deux contenants, sans retirer leurs informations ni leurs commandes.

### Dialogues et surcouches

```text
CONFIRMATION MACHINE — 760 x 560 maximum
+-- Action ; machine ; fichier ou cycle ; personne ayant la main ----------+
| Effet et mouvement ; verdict ; cause lisible ; [Détails S]               |
| [ ] Confirmation de présence et de sécurité existante, cible >=48 px    |
| Temps restant : 15 s              [Annuler S] [Confirmer P]             |
+-------------------------------------------------------------------------+
ZÉRO PIÈCE — 760 x 420 maximum
+-- Axe ; position actuelle ; valeur obtenue ; aucun axe ne bouge ---------+
| Variante D4 : [X S] [Y S] [Z S] ; zéro à l'origine machine               |
| [Annuler S]                                  [Confirmer le zéro P]      |
+-------------------------------------------------------------------------+
MAIN — 760 x 440 maximum
+-- « {appareil} a la main. » ---------------------------------------------+
| [Opérateur devant la machine S] [Autre motif existant S] [Motif S]       |
| [Fermer S]                                      [Prendre la main P]     |
+-------------------------------------------------------------------------+
PAVÉ NUMÉRIQUE — 520 x 560 maximum
+-- Champ ; unité ; bornes ; valeur précédente ; nouvelle valeur ----------+
| Touches >=48 px ; signe et décimales selon le champ ; [Effacer S]        |
| [Annuler S]                                            [Valider P]      |
+-------------------------------------------------------------------------+
CLAVIER TEXTE — 1120 x 560 maximum
+-- Champ et texte ; disposition du clavier existante ---------------------+
| Touches >=48 px ; [Annuler S]                           [Valider P]      |
+-------------------------------------------------------------------------+
FICHE PROJET — 1000 x 580 maximum
+-- [Fermer S] -- champs et fichiers associés existants --------------------+
| Corps défilant ; [Enregistrer P] ; refus près du champ                   |
+-------------------------------------------------------------------------+
APERÇU AGRANDI — 1246 x H
+-- [Fermer S] -- image ; vues fixes existantes ; [Arrêter 64] --------------+
| Surface de lecture ; aucune autorisation de mouvement déduite du dessin |
+-------------------------------------------------------------------------+
VUE 3D AGRANDIE — 1246 x H, Performance seulement
+-- [Fermer S] -- commandes de vue existantes ; [Arrêter 64] ----------------+
| Rendu 3D ; mêmes fonctions machine ; indisponibilité expliquée en Éco    |
+-------------------------------------------------------------------------+
VEILLE — écran entier
+-- Écran en veille ; premier toucher : réveil seulement ------------------+
| Aucun toucher de réveil transmis à une commande située derrière         |
+-------------------------------------------------------------------------+
VERROUILLAGE — écran entier, bandeau protégé conservé
+-- Écran verrouillé ; deux touchers sur le cadenas pour déverrouiller -----+
| Pause et Arrêter restent accessibles selon leurs gardes                 |
+-------------------------------------------------------------------------+
```

Les confirmations locales de suppression, langue, abandon d’assistant et commandes hôte restent en place.
En cas de dépassement D1, Confirmer ordinaire ne permet pas le départ.
« Dérogation… » ouvre une intention distincte, suivie de la case et de Confirmer ; le serveur la journalise.
Un changement de position, fichier, flux ou opération invalide le ticket selon les gardes existantes.

## 3. Les dix parcours, toucher par toucher

### Convention et comparaison

Un toucher désigne une cible de la page ; les chiffres saisis sont comptés séparément.
Ouvrir un champ puis Valider coûte deux touchers ; ouvrir une liste puis choisir coûte deux touchers.
Les déplacements dépendent de la distance : leurs appuis et les gestes physiques sont explicitement séparés.
Un écran désigne une destination ; les dialogues et pavés sont indiqués à part.

| Parcours | Actuel, selon ERGONOMIE | Proposition | Saisies avant → après | Écrans avant → après |
|---|---:|---:|---:|---|
| P1 | 6 ; 10 après redémarrage CNCjs | 6 ; jusqu’à 7 avec relecture | 0 → 0 | 2 → 2 ; confirmation |
| P2 | 3 ; 4 pour chercher le verdict | 3, verdict visible | 0 → 0 | 2 → 2 |
| P3 | 35 + détour de 3 | 24 sans détour, sous condition D4 | 9 → 4 | 3 → 2 ; quatre pavés, confirmation |
| P4 | 6 ; 5 si XYZ conservé | 4 si XYZ conservé ; 5 sinon | 0 → 0 | 2 → 1 ; confirmation |
| P5 | 3 sur Suivi ; 4 ailleurs | 3 sur Suivi ou Préparer ; 4 ailleurs | 0 → 0 | 1 → 1 ; confirmation |
| P6 | 4 en v2 ; 3 en v1 | 3 pour un zéro ici | 0 → 0 | 1 → 1 ; confirmation |
| P7 | 9 | 9 | 0 → 0 | 1 → 1 ; deux confirmations |
| P8 | 12, sans refaire le zéro pièce | 12 dans les mêmes conditions | 0 → 0 | 2 → 2 ; deux confirmations |
| P9 | 3 | 3 : cible de 2 non atteinte | 0 → 0 | dialogue uniquement |
| P10 | 3 pour atteindre une impasse | 2 pour accéder ; 4 pour une branche simple et retour | 0 → 0 | 3 → 2 |

### P1 — Mise en route

1. Depuis Menu, toucher Machine.
2. Toucher Connecter la CNC ; le port connu est proposé.
3. Toucher Ouvrir ; attendre l’état de la machine.
4. Toucher Prise d’origine machine…
5. Cocher la confirmation existante.
6. Toucher Confirmer ; attendre la fin et la vérification D2.
La machine affiche « Origine machine prise » ; Fichiers est directement accessible.
Port ambigu : choisir le port ajoute un toucher ; port déjà ouvert : choisir la machine existante, sans le rouvrir.
Version ou réglages absents : « Les réglages ne sont pas lus. » + Relire les réglages ; jusqu’à un toucher supplémentaire après A1-8.
Serveur absent, autre main ou flux ancien : appliquer R1 ou R4 et les remèdes communs ci-dessous.

### P2 — Choisir et charger un fichier

1. Toucher Fichiers.
2. Toucher la ligne du fichier ; lire emprise, profondeur et verdict sur la même carte.
3. Toucher Charger et ouvrir le Suivi.
Le contrôle utilise l’action serveur existante ; sélectionner ne charge ni ne démarre la machine.
Dépassement : afficher R9 ; le chargement peut rester permis, le départ obéit à D1.
Origine inconnue : « Course non vérifiée : faites la prise d’origine machine. » + Prise d’origine machine…
Fichier illisible ou aperçu différent : « Ce fichier ne peut pas être contrôlé : {raison}. » + Détails, puis Choisir un autre fichier.
Un verdict inconnu reste un avertissement ; la page ne le transforme pas en refus universel.

### P3 — Premier palpage XYZ au bloc

1. Toucher Préparer ; 2. XYZ ; 3. Profils de sonde.
4–5. Ouvrir Épaisseur du bloc, saisir la mesure, toucher Valider.
6–7. Ouvrir Écart face X, saisir la mesure signée illustrée, toucher Valider.
8–9. Faire de même pour Écart face Y.
10. Toucher Coin et sens.
11–12. Ouvrir puis choisir le coin ; 13–14. choisir le sens X ; 15–16. choisir le sens Y.
17. Toucher Recherche ; vérifier les cinq valeurs proposées.
18. Toucher Enregistrer ; 19. Retour au palpage.
20–21. Ouvrir Diamètre de la fraise, saisir sa valeur, toucher Valider.
Positionner avec les flèches présentes ; toucher physiquement le bloc avec la fraise puis libérer le contact.
22. Toucher Palper XYZ… ; 23. cocher ; 24. Confirmer.
Les trois onglets deviennent l’assistant D4 : dessin, champs manquants et retour possible, sans nouveau parcours permanent.
Valeurs proposées à examiner dans A/D4 : approche 100, seconde touche 25 mm/min ; recherche 10, retrait 2, dégagement 5 mm.
Ces valeurs respectent les bornes statiques lues ; elles ne prouvent ni la géométrie ni la sécurité du montage.
Sans validation de ces cinq propositions, compter **34 touchers et 9 saisies**, sans détour de positionnement.
Profil, contact, course, main et décalage refusés : R4 à R8 et R10 ; aucun nouvel essai ne part automatiquement.

### P4 — Palpage suivant au bloc

1. Depuis n’importe quel écran, toucher Préparer.
2. Toucher Palper XYZ… ; 3. cocher ; 4. Confirmer.
Conditions du compte : profil complet, diamètre connu, XYZ mémorisé et fraise déjà placée.
Si X, Y ou Z était choisi, toucher XYZ ajoute un toucher.
Si le test de contact a expiré ou si le dernier cycle a échoué, refaire le geste physique exigé.
Le dessin de départ reste visible pendant le positionnement ; aucun aller-retour vers Sonde.
Contact non validé : R5 + Tester la sonde ; contact permanent : R6 ; dépassement : R8.
La cible de quatre est atteinte sur le cas répété, pas sur un changement d’opération.

### P5 — Zéro Z à la plaque

1. Dans Suivi ou Préparer, toucher Palper Z à la plaque…
2. Cocher la confirmation ; 3. toucher Confirmer.
Depuis un autre écran, toucher Préparer ajoute un toucher, comme l’accès actuel à Suivi.
La plaque reste visible lorsque le serveur la refuse ; son motif remplace le texte d’aide.
Première épaisseur depuis Préparer : deux touchers et une saisie supplémentaires.
Première configuration depuis Suivi : Régler la plaque, champ, Valider, puis lancement en trois gestes : **6**, contre 5 auparavant.
Cette augmentation concerne la configuration rare ; le changement d’outil fréquent reste à trois touchers.
Pause incompatible : « Le zéro Z est impossible pendant cette pause. Arrêtez l’usinage. » + Arrêter ; aucun garde n’est contourné.

### P6 — Déplacement et zéros manuels

1. Toucher Préparer ; déplacer la fraise avec les flèches, sans ouverture intermédiaire.
2. Toucher Zéro X ; 3. toucher Confirmer le zéro.
Pour XYZ, la même séquence coûte trois touchers depuis un autre écran.
Pour le zéro d’axe à l’origine machine : Préparer, Zéro à l’origine machine…, X, Confirmer le zéro : **4 touchers**, aucun mouvement.
Faire successivement un zéro ici puis un zéro à l’origine machine coûte six touchers, hors déplacements.
La seconde action est la fonction D4 ; elle n’est pas assimilée à une prise d’origine.
Pas refusé : « Ce pas dépasse la course en {axe}. Réduisez le pas ou changez de sens. » + Choisir le pas.
Position inconnue : R3 ; broche active : « Arrêtez la broche avant ce déplacement. » + Arrêter la broche.

### P7 — Contrôle, départ et conduite

1. Toucher Démarrer… ; 2. cocher ; 3. Confirmer.
4. Toucher une correction de vitesse pendant l’usinage.
5. Toucher Pause ; attendre l’arrêt des axes.
6. Toucher Reprendre… ; 7. cocher ; 8. Confirmer.
9. Toucher Arrêter.
Les neuf touchers sont conservés ; broche et rapides passent de trois à un toucher en v2, restent à un en v1.
Dépassement connu : R9 est affiché avant l’étape 1 ; le départ ordinaire est refusé par D1.
La dérogation ajoute un geste explicite, conserve la confirmation et laisse une trace ; elle n’est jamais présélectionnée.
Reprise interdite : « Cette pause ne permet pas de reprendre : {raison}. » + Arrêter, puis remise en état P8.

### P8 — Après une alarme ou un arrêt

1. Toucher Arrêter pour clore l’activité encore ouverte.
2. Toucher Machine ; 3. Prise d’origine machine… ; 4. cocher ; 5. Confirmer.
Attendre D2 ; lire « Valeurs du zéro pièce relues » et « Vérifiez que la pièce et la fraise n’ont pas bougé ».
6. Toucher Suivi ; 7. Reprendre à une ligne.
8. Toucher Vérifier ; 9. Charger la reprise.
10. Toucher Démarrer… ; 11. cocher ; 12. Confirmer.
Le fichier et sa version sont affichés dès l’ouverture de la reprise ; A2-9 doit empêcher la reprise d’une autre sélection.
Si un déverrouillage séparé est réellement nécessaire, ajouter ses trois gestes ; ne pas l’imposer systématiquement.
Si le zéro physique est douteux, refaire P4 ou P5 avant la reprise ; ces gestes s’ajoutent au nominal.
Ligne inconnue : ouvrir le champ, saisir, Valider ajoute deux touchers et une saisie.
Ligne refusée : « La reprise à la ligne {N} est impossible : {raison courte}. Choisissez une autre ligne. » + Choisir la ligne.
Aucune ligne acceptable : « Cette reprise n’est pas possible. Préparez un départ au début. » + Fichiers ; aucun départ automatique.

### P9 — Savoir qui a la main

1. Toucher le bouton Main du bandeau.
2. Choisir le motif existant « Opérateur devant la machine », uniquement si cela décrit la situation.
3. Toucher Prendre la main.
Le titulaire est visible avant et pendant la demande ; le résultat remplace le refus devenu ancien.
Main libre : la première action autorisée conserve l’attribution automatique actuelle.
Motif absent : « Indiquez pourquoi vous prenez la main. » + Choisir un motif.
État perdu : « La prise de main n’est pas confirmée. Vérifiez la connexion. » + Voir la connexion.
**La cible de deux touchers échoue** : le minimum conserve le choix explicite du motif et la confirmation de prise de main.

### P10 — Sonde au comportement inattendu

1. Toucher Préparer ; 2. Tester la sonde.
3. Toucher Contact permanent ou Aucun contact.
La branche affiche une consigne à la fois et l’état réellement reçu.
Contact permanent : « Arrêtez la broche. Écartez le bloc. Vérifiez la pince et le câble. »
Si le contact demeure : « Broche arrêtée, débranchez son alimentation selon le montage prévu, puis refaites le test. »
Aucun contact : « Vérifiez la pince et le câble. Touchez la fraise avec le bloc, puis écartez-le. »
Le contact puis sa libération doivent être observés ; les gestes matériels ne sont pas comptés comme touchers.
4. Toucher Retour au palpage après réussite ; le lancement conserve les trois gestes de P4.
Signal absent ou panne persistante : « Le test ne répond pas. Vérifiez le branchement de la sonde. » + Détails.
L’accès est amélioré ; une panne matérielle reste une limite que la page ne peut lever seule.

### Refus transversaux aux dix parcours

| Famille | Phrase affichée | Bouton et portée réelle |
|---|---|---|
| Ticket expiré ou contexte changé | « La confirmation n’est plus valable. Confirmez à nouveau. » | Refaire la confirmation ; nouveau ticket, case décochée. |
| Action déjà en cours | « {action} est en cours. Attendez sa fin. » | Voir le Suivi ; Arrêter reste disponible si autorisé. |
| Type machine incohérent | « Le type de machine ne correspond pas aux réglages lus. » | Type de machine ouvre le réglage existant. |
| Fichier absent ou différent | « Sélectionnez le fichier de cet usinage. » | Fichiers ; aucune substitution silencieuse. |
| Correction temporaire incompatible | « Un réglage temporaire empêche cette action. Faites-le vérifier. » | Détails ; intervention externe explicitement nécessaire. |
| Refus non reconnu | « Action refusée. Consultez le détail avant de recommencer. » | Détails puis Journal ; aucun bouton faussement réparateur. |

## 4. Le journal T1 à T15 et les problèmes de l’existant

### Réponse au journal de terrain

| Ligne | Ce que le chantier A doit résoudre | Ce que l’organisation apporte |
|---|---|---|
| T1 | D3, A3-1/2 : veille locale, réveil fiable, toucher non transmis derrière. | Même bandeau après réveil ; aucune promesse de correction par le rangement. |
| T2 | D1, A1-1/3/5 : dépassement prouvé, axes et marges. | Cause chiffrée dans Fichiers et Suivi avant confirmation. |
| T3 | D2, A1-2/4/7 : cohérence du décalage et perte de référence. | Origine machine et valeurs du zéro pièce distinguées ; état incertain visible. |
| T4 | Aucun correctif serveur ne réunit les commandes. | Bloc et plaque visibles ensemble dans Préparer. |
| T5 | D4 : assistant et propositions compatibles avec les gardes. | Trois onglets expliqués par des dessins ; mesures physiques conservées. |
| T6 | A2-3/4/8/13 : retour de refus, test réel, motif périmé. | Raison près du lancement ; Tester la sonde accessible sur place. |
| T7 | A1-11 : enveloppe de palpage éventuellement trop large. | Dessin, axe concerné et bouton de positionnement ; origine machine non accusée à tort. |
| T8 | Gardes du séquenceur et contrôle de départ conservés. | Coin extérieur, distance admissible et trou interdit dessinés. |
| T9 | D4 : diagnostic guidé fondé sur le signal réel. | Branche contact permanent avec pince, câble et broche arrêtée. |
| T10 | A1-8/A2-7 : relecture possible et version relue. | Relire les réglages reste visible dans Machine. |
| T11 | A2-5 : ne plus retirer la plaque lorsque son action est refusée. | Carte ou raccourci maintenu, avec motif et remède. |
| T12 | A2-6/18 : refus cohérent et actualisé. | Bouton Main identifiable ; titulaire visible ; accès direct au dialogue. |
| T13 | D4 : nouvelle opération sans mouvement, preuve et gardes dans A. | Commande distincte des zéros ici et de la prise d’origine. |
| T14 | A3-3 : premier rechargement avalé par la veille ; A3-4 : version annoncée. | Version lisible dans Réglages ; aucune attribution abusive aux suffixes seuls. |
| T15 | Contrôle serveur exploité tôt, avec D1 au départ. | Profondeur sous zéro pièce et dépassement lisibles dès la sélection contrôlable. |

Les corrections A sont des dépendances : cette proposition ne les déclare ni réalisées ni validées.
Les défauts de sûreté A4-1 à A4-5 restent prioritaires sur tout déplacement de composant.

### Les douze problèmes numérotés d’ERGONOMIE

| N° | Traitement dans le minimum | Limite restante |
|---|---|---|
| 1 | Contrôle anticipé, phrase courte, D1. | Un contrôle incomplet reste incomplet. |
| 2 | Liste de remise en état dans Machine, reprise identifiable dans Suivi. | Deux écrans restent nécessaires. |
| 3 | Fusion Sonde–Préparer ; flèches directes ; D4. | Raccourci plaque maintenu dans Suivi. |
| 4 | Assistant dans les trois onglets et cinq propositions. | Quatre mesures/saisies physiques subsistent. |
| 5 | Motif persistant et remède près de l’action. | Certains remèdes exigent une intervention extérieure. |
| 6 | Commandes visibles avec raison. | Les fonctions incompatibles laser sont explicitement remplacées par une indication. |
| 7 | Même ordre rail/Menu ; liens vers la suite utile. | Le Menu reste l’arrivée ; aucun déroulement automatique de séance. |
| 8 | Même organisation ; activation v2 différée sans verrou définitif. | Le chargement riche attend toujours un repos sûr. |
| 9 | Glossaire unique ; technique dans Détails. | Les diagnostics techniques restent nécessaires. |
| 10 | Test guidé et branches de panne D4. | Aucun diagnostic ne prouve un câblage débranché physiquement. |
| 11 | Trois gestes conservés pour les commandes concernées. | Problème laissé : fatigue de confirmation ; P9 échoue aussi. |
| 12 | Plaque compacte dans Suivi, corrections directes, espaces rétablis. | Préparer devient plus dense ; rendu agrandi à éprouver. |

Le rapport possède douze problèmes numérotés, et non quinze.
Pour couvrir aussi la demande des « quinze problèmes et impasses », les quinze masquages de son § 1.6 sont traités séparément.

| Élément masqué ou inactif | Sort retenu |
|---|---|
| Plaque | Visible avec refus ; suppression de son masquage conditionnel en CNC. |
| Reprise à une ligne | Visible ; fichier attendu et motif d’indisponibilité indiqués. |
| Relire les réglages | Visible dans Machine ; refus exact affiché. |
| Connexion | Carte permanente dans Machine. |
| Actions du bandeau | Pause et Arrêter fixes ; autres commandes expliquées dans Machine/Suivi. |
| Démarrer/Pause en alarme | Action visible mais indisponible ; cause et remise en état proches. |
| Charger sans sélection | Visible avec « Choisissez un fichier ». |
| Corrections sans capacité | Rangées conservées avec motif. |
| Broche/rapides en volet v2 | Rangées directes, comme en v1. |
| État des déplacements | Toujours visible dans Préparer. |
| Zéro XYZ et Vitesse hors déplacement | Placés à côté de la croix. |
| Identité machine du bandeau | Conservée dans la zone machine/fichier. |
| Préparation du palpage inaccessible | Construction retirée de la page réelle ; aucune fonction réactivée. |
| Résultats sans palpage | Écran accessible avec « Aucun palpage enregistré ». |
| Macros sans macro | Accès avec « Aucune macro disponible » ; aucune commande fictive. |

## 5. Le vocabulaire et les dix refus fréquents

### Mots et libellés retenus

| Notion | Libellé affiché |
|---|---|
| Navigation principale | Menu ; Machine ; Fichiers ; Préparer ; Suivi ; Journal ; Réglages |
| Navigation secondaire | Retour ; Détails ; Fermer ; Guide d’utilisation |
| Connexion | Connecter la CNC ; Ouvrir ; Choisir la machine |
| Référence physique | Prise d’origine machine… ; Origine machine prise ; Origine machine à reprendre |
| Remise en état | Déverrouiller… ; Relire les réglages |
| Origine de la pièce | Zéro pièce ; Position pièce ; Position machine |
| Zéros manuels | Zéro X ; Zéro Y ; Zéro Z ; Zéro XYZ ; Zéro à l’origine machine… |
| Palpages | Palper Z au bloc… ; Palper X… ; Palper Y… ; Palper XYZ… ; Palper Z à la plaque… |
| Préparation de sonde | Profils de sonde ; Dimensions ; Coin et sens ; Recherche ; Tester la sonde |
| Fichier | Sélection ; Fichier chargé ; Sous zéro pièce ; Contrôle non vérifié |
| Exécution | Démarrer… ; Pause ; Reprendre… ; Arrêter |
| Reprise partielle | Reprendre à une ligne ; Vérifier ; Charger la reprise |
| Broche et déplacements | Broche ; Vitesse ; Rapides ; Arrêter la broche |
| Pilotage | Main ; Main libre ; Vous avez la main ; {appareil} a la main ; Prendre la main |
| États | Hors ligne ; Non connectée ; Au repos ; En déplacement ; Palpage ; Usinage ; Pause ; Alarme |
| Qualité de l’information | Information à jour ; Information ancienne ; État perdu |
| Fin d’action | Terminé ; Arrêté ; Refusé ; Résultat incertain |
| Confirmation | Confirmer ; Annuler ; Confirmer le zéro |
| Saisie et stockage | Valider pour un champ ; Enregistrer pour un profil ou une fiche |

« Prête » seul est évité : « Origine machine prise » ne signifie pas « fichier contrôlé ».
« Reçu par la machine » ne devient jamais « usiné » ; la fin physique relève de l’état observé.
« Zéro pièce 1 » peut désigner le repère choisi ; son identifiant technique reste disponible dans Détails.
Les propositions de TEXTES sont relues : « mode laser actif » ne signifie pas « laser allumé ».
Toutes les chaînes, paramètres et raisons passent par les catalogues FR/EN/ES.

### Dix refus prioritaires

| Réf. | Phrase d’atelier | Bouton remède |
|---|---|---|
| R1 | « La machine n’est pas connectée. Connectez-la. » | Connecter la CNC |
| R2 | « Alarme {N} : {cause}. Remettez la machine en état. » | Voir la machine |
| R3 | « L’origine machine n’est pas connue. Faites sa prise d’origine. » | Prise d’origine machine… |
| R4 | « {appareil} a la main. Prenez-la pour continuer. » | Prendre la main |
| R5 | « Testez le contact : touchez la fraise avec le bloc, puis écartez-le. » | Tester la sonde |
| R6 | « La sonde indique déjà un contact. Vérifiez la pince, le câble et la broche. » | Contact permanent |
| R7 | « Renseignez « {champ} » dans le profil de sonde. » | Ouvrir le profil |
| R8 | « Le palpage dépasserait la course en {axe} de {distance} mm. Replacez la fraise. » | Voir le dessin de départ |
| R9 | « Le fichier descend {distance} mm trop bas. Relevez la pièce et refaites son zéro. » | Régler le zéro pièce |
| R10 | « Le zéro pièce relu est incohérent. Attendez sa vérification. » | Voir la machine |

R8 ne chiffre un dépassement que si les données serveur le permettent ; sinon il nomme l’axe et la cause disponible.
R9 concerne un trajet lié au zéro pièce ; pour un trajet en position machine, afficher « Corrigez le fichier » avec Fichiers.
Relever la pièce impose un montage adapté et un nouveau zéro ; le bouton ne déplace rien.
R10 n’offre pas de « forçage » : D2 doit être prouvée avant départ, palpage ou reprise.
Les autres codes utilisent les familles de refus de la partie 3 ; les détails conservent le code et ses valeurs.

## 6. Destination des 65 commandes et confirmations

### Table de conservation

Les identifiants sont ceux de `audit/commandes-machine.json`.
Ses 65 entrées comprennent aussi les automatismes, relais et navigations ; elles ne représentent pas 65 boutons distincts.
« Fusion » signifie conservation de l’action et de ses gardes derrière un point d’entrée commun.

| ID | Place actuelle → nouvelle place |
|---|---|
| CX-01 | Connecter, Menu → Machine, carte Connexion. |
| CX-02 | Choix du port/Annuler, Menu → même carte Machine. |
| CX-03 | Ouvrir, Menu → confirmation de connexion dans Machine. |
| CX-04 | Flux de suivi automatique → inchangé, transversal. |
| CX-05 | Lecture de secours automatique → inchangée, transversale. |
| CX-06 | Actualiser, ancien bandeau inaccessible → code dormant retiré de la page réelle. |
| PI-01 | Pilote, bandeau → Main, même bandeau. |
| PI-02 | Prendre le pilotage, dialogue → Prendre la main, même dialogue. |
| PI-03 | Attribution automatique à la première action → inchangée. |
| OR-01 | Déverrouiller, bandeau → raccourci conservé selon état, même confirmation. |
| OR-02 | Déverrouiller, Machine → même écran, libellé sans code technique. |
| OR-03 | Déverrouiller, mise en service → mêmes étapes et gardes. |
| OR-04 | Prise d’origine, Machine → même écran, action clairement nommée. |
| OR-05 | Prise d’origine, mise en service → même étape, cases conservées. |
| OR-06 | Relire, Machine → même écran, toujours visible. |
| OR-07 | Relire, Préparer → remède contextuel réutilisant l’action commune. |
| OR-08 | Relire, mise en service → même étape, même action. |
| DE-01 | Flèches par pas, Préparer → même écran, directement visibles. |
| DE-02 | Flèches maintenues, Préparer → même croix, mode Continu conservé. |
| DE-03 | Maintien automatique du déplacement → inchangé pendant l’appui. |
| DE-04 | Arrêt au relâchement/annulation du pointeur → inchangé. |
| DE-05 | Arrêts automatiques de la page → inchangés à chaque événement protégé. |
| DE-06 | Chiens de garde serveur → inchangés par B ; corrections éventuelles dans A. |
| DE-07 | Pas et vitesse, Préparer/volet → pas directs et même volet Vitesse. |
| DE-08 | Cadrage laser, Suivi → même place et même confirmation. |
| ZE-01 | Zéro X/Y/Z, Préparer → mêmes commandes près des positions. |
| ZE-02 | Zéro XYZ, Préparer → même commande près de la croix ; XY en laser selon profil. |
| ZE-03 | Relais Zéro XYZ v2 → fusion avec ZE-02. |
| ZE-04 | Confirmer/Annuler le zéro → même dialogue, libellés harmonisés. |
| ZE-05 | Poser XY/Déplacer/Revenir, Préparer v2 → navigation retirée, flèches déjà visibles. |
| PA-01 | Plaque, Suivi → réglages dans Préparer ; lancement conservé aussi dans Suivi. |
| PA-02 | Sonde vers plaque dans Suivi → navigation supprimée, plaque voisine dans Préparer. |
| PA-03 | Bloc Z/X/Y/XYZ, Sonde → Préparer, carte Palpage. |
| PA-04 | Arrêter le palpage, Sonde → Préparer pendant le cycle ; arrêt commun conservé. |
| PA-05 | Profils/diagnostic/transfert, Sonde → accès depuis Préparer et sous-écrans conservés. |
| PA-06 | Arrêt automatique du palpage bloc → inchangé par B ; correctifs A prioritaires. |
| FI-01 | Charger, Fichiers → même écran, même chargement. |
| FI-02 | Charger/Recharger, Suivi → raccourci conservé, sans relais DOM caché. |
| FI-03 | Charger, préparation guidée → même action dans Contrôle avant usinage. |
| FI-04 | Contrôleur, détails de l’aperçu → Choisir la machine dans Machine. |
| FI-05 | Bibliothèque/aperçu/projet/fichier d’essai → fonctions conservées dans leurs contenants actuels. |
| EX-01 | Case/Confirmer/Annuler → dialogue commun conservé. |
| EX-02 | Démarrer, Suivi → même place, appel commun sans bouton caché intermédiaire. |
| EX-03 | Pause, bandeau/Suivi → mêmes accès ; aucun dialogue ajouté. |
| EX-04 | Reprendre, bandeau/Suivi → mêmes accès et confirmation. |
| EX-05 | Arrêter, bandeau/Suivi/aperçu → mêmes accès immédiats. |
| EX-06 | Arrêter la broche, Suivi → même action visible avec sa raison d’indisponibilité. |
| EX-07 | Macros, Préparer → même volet, mêmes macros et confirmation. |
| CO-01 | Correction de vitesse, Suivi → même rangée directe. |
| CO-02 | Broche, Suivi v1/volet v2 → rangée directe commune. |
| CO-03 | Rapides, Suivi v1/volet v2 → rangée directe commune. |
| RL-01 | Ouvrir reprise, Suivi → même écran, accès toujours identifiable. |
| RL-02 | Vérifier reprise, Suivi → même carte, fichier et ligne explicités. |
| RL-03 | Charger reprise, Suivi → même action, distincte du départ. |
| RM-01 | Type CNC/Laser, Réglages → même place et mêmes gardes. |
| RM-02 | Test broche, mise en service → même étape, cases et confirmation conservées. |
| RM-03 | Arrêter broche, mise en service → même accès immédiat. |
| RM-04 | Arrêt broche en quittant l’assistant → automatisme conservé. |
| RM-05 | Télécharger les réglages, mise en service → même étape. |
| SY-01 | Luminosité, Réglages/Affichage → même place ; restrictions A distinctes. |
| SY-02 | Veille/réveil automatiques → mêmes fonctions, corrigées selon D3. |
| SY-03 | Wi-Fi, Réglages/Système → même place et mêmes gardes. |
| SY-04 | Mises à jour, Réglages/Système → même place, confirmation conservée. |
| SY-05 | Commandes hôte, Réglages/Système → mêmes commandes configurées et confirmation. |
| SY-06 | Verrouillage, bandeau → même cadenas ; deux touchers pour déverrouiller. |

D4 ajoute séparément le zéro d’axe à l’origine machine ; il ne remplace aucune des 65 entrées.
Le contrôle anticipé exploite une action serveur déjà existante, recensée parmi les commandes sans bouton actuel.
Aucun cadrage CNC, changement automatique de repère ou nouveau cycle de palpage n’est ajouté.

### Ce qui disparaît

- L’écran Sonde comme détour obligatoire : ses composants sont déplacés dans Préparer.
- La construction de Préparation du palpage inaccessible sur la page réelle.
- La vue de comparaison v2 qui cache les flèches ; son information utile rejoint Fichiers.
- Les navigations « Déplacer la machine », « Revenir à la comparaison » et « Zéro Z → Suivi ».
- Le volet Dimensions XY, absorbé dans Détails du fichier.
- Le volet Broche et rapides, remplacé par les rangées directes.
- La seconde présentation des limites dans Machine ; Course machine devient la référence détaillée.
- Les paragraphes techniques sur le chemin fréquent ; leurs données utiles restent dans Détails.
- Les relais de clic vers des commandes cachées, remplacés par l’appel au même gestionnaire.
- Aucun historique, aperçu, macro, profil, import/export ou arrêt automatique n’est supprimé.

### Sort des confirmations, classe par classe

| Classe | Geste retenu | Justification de sûreté |
|---|---|---|
| Prise d’origine et déverrouillage | Bouton, case, Confirmer sous 15 s. | Mouvement ou changement d’état autorisant ensuite des mouvements. |
| Démarrer et reprendre | Même séquence à trois gestes. | Énergie et déplacement engagés ; revalidation serveur conservée. |
| Bloc et plaque | Même séquence à trois gestes. | Contact, trajectoire, profil et origine doivent correspondre au ticket. |
| Macro, broche d’essai, cadrage laser | Même confirmation ; cases d’assistant conservées. | Effets propres à chaque commande inchangés. |
| Zéro manuel | Bouton puis confirmation existante. | Aucun mouvement immédiat, mais modification du prochain trajet. |
| Zéro D4 à l’origine machine | Choix explicite de l’axe puis confirmation définie dans A. | Aucun zéro silencieux ni assimilation au référencement. |
| Pause, Arrêter, arrêt broche | Un toucher, sans délai ajouté. | Ne jamais retarder une action d’arrêt. |
| Déplacement par pas ou maintien | Gestes actuels et tous les arrêts automatiques. | Aucun armement supplémentaire, aucune garde retirée. |
| Corrections, chargement, lecture | Gestes actuels. | Déplacer les composants ne change pas leurs autorisations. |
| Connexion | Connecter puis Ouvrir ; choix de port si nécessaire. | Le redémarrage possible de la carte reste annoncé. |
| Prise de main | Ouvrir, choisir le motif, prendre. | Motif explicite conservé ; aucune présence présumée. |
| Installation et commandes hôte | Deux touchers sous 8 s, comme actuellement. | Réservation serveur et vérification d’inactivité conservées. |
| Dérogation D1 | Intention supplémentaire explicite, ticket et confirmation. | Exception journalisée ; aucun allègement de D2 ni des autres gardes. |

**Aucune confirmation machine n’est allégée dans le chantier B.**
Les cases ne sont ni précochées, ni mémorisées, ni réutilisées pour une autre commande.
Les modifications de gardes ou d’envois décidées dans A doivent avoir leur preuve et leur revue de sûreté distinctes.

## 7. Effet sur v1 Éco et règle unique du rendu v2

L’organisation, les destinations et les commandes sont identiques en v1 et v2.
Éco conserve les aperçus fixes et le laser 2D ; les dessins d’aide sont statiques et communs.
Aucune requête, minuterie, image ou ressource exclusivement v2 n’est introduite dans Éco.
Les dessins utilisent les données déjà disponibles ; ils ne lancent pas de simulation de collision.
Les corrections broche/rapides restent directes, pour ne pas augmenter les touchers sur la RT.
Le laser conserve cadrage, reprise adaptée, consigne S et masquage de Z selon son profil.
Les écarts CNC/laser sont expliqués par le type de machine, jamais par le choix du rendu.

**Règle unique : une session éligible demande v2, attend un repos sûr pour l’initialiser, puis le conserve pendant le travail.**
L’éligibilité reste : préférence v2 active, profil Performance, CNC, GPU matériel et fenêtre d’au moins 1300 × 880.
Une alarme, une prise d’origine ou un usinage avant ce repos laisse la demande en attente ; aucun verrou définitif n’est posé.
Le repos sûr conserve les conditions existantes : état récent, aucune activité ni commande système, broche arrêtée.
Une initialisation interrompue doit pouvoir attendre un nouveau repos sûr sans commencer à déplacer les composants en activité.
En cas de perte durable d’éligibilité, le repli existant est effectué au moment sûr ; Éco reste fonctionnel.
Réglages explique « Performance en attente du repos » ou la cause d’inéligibilité.
JavaScript reste sans framework, limité à ES2017 ; CSS reste compatible Chromium 106.
Les classes `v2m-`, `v2n-`, la regex `V2_NODE` et les exclusions de `tablet-exclude.txt` sont conservées.

## 8. Lots réalisables en série

### Conditions de livraison

Un seul agent écrit à la fois ; chaque lot part du précédent validé.
Le chantier A précède les changements qui dépendent de D1, D2, D3 ou D4.
Les chemins ci-dessous sont relatifs à `examples/cncjs-touch/` ; les fichiers cités existent dans le dépôt.
Les catalogues sont modifiés dans le même lot que leurs nouveaux textes, avec FR/EN/ES.
Chaque lot laisse la page utilisable et les commandes non concernées accessibles.

### Lot 1 — Cadre, vocabulaire commun et refus

Fichiers : `touch/touch-shell.js`, `touch/touch-shell.css`, `touch/status-strip.js`, `touch/job-controls.js`, `touch/ui-2027.css`.
Catalogues : `touch/i18n-messages.js`, `touch/i18n-messages-machine.js`.
Travail : ordre rail/Menu, Retour fixe, Main, refus persistants, Pause/Arrêter protégés.
Tests : `test-menu-screen.cjs`, `test-status-strip.cjs`, `test-strip-guard.cjs`, `test-server-messages.cjs`.
État livré : organisation actuelle encore exploitable, sans commande déplacée dans un conteneur inaccessible.
Taille estimée : moyenne, deux à trois jours de réalisation et vérification.

### Lot 2 — Machine et remise en état

Fichiers : `touch/connect-cnc.js`, `touch/commissioning.js`, `touch/grbl-help.js`, `touch/machine-limits.js`, `touch/touch-shell.js`.
Travail : connexion et choix machine réunis, relecture visible, états d’origine explicites, suppression du doublon de course.
Tests : `test-connect-cnc.cjs`, `test-machine-screen.cjs`, `test-commissioning.cjs`, `test-machine-limits.cjs`.
Dépendance : contrats A1-8, D2 et état après incident disponibles ; aucune correction serveur cachée dans ce lot.
État livré : P1 réalisable ; l’assistant existant et ses commandes fonctionnent encore.
Taille estimée : moyenne, deux jours.

### Lot 3 — Préparer, bloc, plaque et zéros

Fichiers : `touch/index.html`, `touch/probe-ui.js`, `touch/probe-model.js`, `touch/probe-real.js`, `touch/probe-diagram.js`, `touch/probe.css`.
Compléments : `touch/real-motion.js`, `touch/job-resume.js`, `touch/job-preparation.js`, `touch/origin-preview.js`, `touch/origin-preview.css`.
Catalogues concernés : `touch/i18n-messages-profiles.js`, `touch/i18n-messages-origin.js`, avec les catalogues communs.
Travail : regroupement des composants, assistant D4, diagnostic, dernier cycle repris, zéro D4 et propriétaire unique de la plaque.
Tests : `test-real-motion.cjs`, `test-probe-real-ui.cjs`, `test-probe-model.cjs`, `test-probe-diagram.cjs`, `test-block-probe-dialog.cjs`.
État livré : P3 à P6 et P10 utilisables ; raccourci plaque de Suivi conservé ; arrêts automatiques éprouvés.
Taille estimée : grande, quatre à six jours ; principal risque de la proposition.

### Lot 4 — Fichiers et contrôle anticipé

Fichiers : `touch/shared-library.js`, `touch/program-check-view.js`, `touch/job-preparation.js`, `touch/files-touch.css`.
Travail : contrôle de la sélection, profondeur nommée, dessin commun, identité du verdict et regroupement des détails.
Tests : `test-files-screen.cjs`, `test-library-identity.cjs`, `test-program-check-view.cjs`, `test-travel-check.cjs`.
Les changements de fichier, de zéro ou de contexte invalident le contrôle affiché ; le départ reste contrôlé par le serveur.
État livré : P2 à trois touchers, D1 visible avant le dialogue de départ.
Taille estimée : moyenne à grande, trois jours.

### Lot 5 — Suivi et reprise

Fichiers : `touch/job-dashboard.js`, `touch/job-resume.js`, `touch/job-controls.js`, `touch/performance-v2.css`.
Travail : corrections directes, messages courts, reprise visible, identité du fichier arrêté, suppression des relais cachés.
Tests : `test-home-actions.cjs`, `test-job-resume.cjs`, `test-dashboard-pause-guard.cjs`, `test-job-dialog-strip.cjs`.
Dépendance : A2-9/10 et corrections A4 de progression, identité et arrêt traitées séparément.
État livré : P7 et P8 réalisables dans les conditions annoncées ; P5 reste à trois touchers.
Taille estimée : moyenne à grande, trois jours.

### Lot 6 — Rendu, cohérence finale et preuves

Fichiers : `touch/tablet-profile.js`, `touch/interface-guide.js`, `touch/i18n-messages-v2.js`, `touch/i18n-messages-viz.js`, `touch/index.html`.
Vérification : `browser-run.cjs`, `verify-project.cjs`, `test-v2-gate.cjs`, `test-v2-mounts.cjs`, `test-i18n.cjs`, `test-v2-i18n.cjs`, `test-home-actions.cjs`.
Documentation existante : `PERFORMANCE-UI-SPEC.md`, `TESTING.md`, `BUGHUNT-MAP.md`.
Travail : règle v2, textes restants, cohérence Réglages, contrôle des 65 entrées et étape de harnais « parcours ».
État livré : P1, P3, P7 et P8 rejoués avec comptage ; chaque refus relié à son texte et à une destination réelle.
Taille estimée : grande, trois à cinq jours ; traduction et variantes comprises.

### Passage obligé entre lots

`verify-project.cjs` doit être vert ; les tests serveur pertinents incluent les nouvelles preuves du chantier A.
Le harnais strict doit terminer avec « 0 violation(s), 0 excepted » et « every step passed ».
Aucune nouvelle exception de disposition n’est ajoutée dans `layout-exceptions.json`.
La table des 65 entrées est vérifiée par action, paramètres, garde, confirmation et effet automatique, pas seulement par présence du bouton.
Les variantes couvrent v1/v2, CNC/laser, clair/sombre, standard/agrandi, FR/ES et EN par tests.
Les contrôles complets sont exécutés en série par leur propriétaire ; ils ne sont pas lancés pendant cette étude.
L’estimation globale est de dix-sept à vingt-quatre jours-agent, hors correctifs serveur et essais matériels.
Le coût n’est donc pas celui d’un simple renommage : les économies viennent surtout des composants et contrats conservés.

## 9. Risques et points faibles

### Limites assumées

- P9 manque sa cible de deux touchers ; la proposition conserve trois gestes.
- P4 atteint quatre seulement pour une opération mémorisée et une préparation matérielle déjà correcte.
- La plaque reste accessible à deux endroits : exception de localisation nécessaire pour préserver P5.
- Les chargements, arrêts et commandes de mise en service conservent aussi certains accès multiples justifiés.
- Le principe d’un seul endroit est donc appliqué aux réglages et à leur propriétaire, pas intégralement à tous les raccourcis.
- Le rail suit mieux le travail, mais l’écran ne conduit pas automatiquement toute la séance.
- P8 reste réparti entre Machine et Suivi ; il améliore l’explication davantage que le nombre de gestes.
- Certaines incompatibilités de fichier, corrections temporaires ou pannes restent des impasses matérielles ou techniques.
- Aucun bouton d’annulation de correction, aucune console et aucun nouveau mouvement ne sont ajoutés pour les masquer.
- Les confirmations répétées restent fatigantes ; leur coût est conservé pour ne retirer aucun garde-fou.
- Préparer devient dense : réunir une croix de 96 px et le palpage est le point le plus fragile à 648 px.
- Les cotes proposées démontrent un budget de place, pas l’absence de débordement avec toutes les traductions.
- Les listes natives de Chromium gardent une taille d’option non maîtrisée ; ce minimum ne les remplace pas toutes.
- Les valeurs proposées du profil ne constituent pas des valeurs certifiées pour le bloc réel.
- D2 prouve la cohérence des données, jamais la conservation physique du bridage, de la pièce ou de la fraise.

### Dépendances de sûreté et mesure

Les audits classent A1-1 à A1-7 et A4-1 à A4-5 en sécurité machine ; leur résolution conditionne la livraison.
A3 ajoute notamment le toucher aveugle sous écran noir et la fermeture du port par un autre client.
Changer les libellés ne protège pas contre ces chemins serveur.
La fiche firmware distingue le code amont et le binaire fabricant ; les sept écarts observés interdisent une confiance automatique dans l’amont.
Aucune marge de course nouvelle n’est choisie par cette proposition.
Le contrôle graphique reste un contrôle de course, pas une simulation des brides, du bloc ou des collisions.
La consigne de broche n’est pas présentée comme une vitesse mesurée ; l’écrêtage décrit dans FIRMWARE reste pertinent.
Les fonctions enrichies v2 conservées doivent rester inactives lorsqu’elles sont cachées.
MESURES donne 91 requêtes à froid en v1 et 99 en v2, avec les scripts du banc : ce sont des références, pas un gain promis.
Les minuteries de surveillance globale ne sont pas supprimées au prétexte qu’un écran est caché.
Le travail inutile documenté, notamment les mutations de Réglages caché, relève du chantier C après mesure.
Aucune refonte de protocole, aucun paquet groupé ni chargement différé général des traductions n’est ajouté au minimum.

### Vérifications effectuées et absentes

Le prompt, ERGONOMIE, la synthèse VEILLE, le glossaire et les refus de TEXTES ont été lus.
FIRMWARE, les titres et gravités A1–A4, les inventaires Markdown/JSON, MESURES et BASE ont été consultés.
La branche `feat/refonte-ui` et l’existence des fichiers cités dans les lots ont été vérifiées.
Les captures de Préparer v2 sombre, Suivi en usinage, bloc prêt, Préparer v1 clair et Menu laser sombre ont été ouvertes.
Une capture Suivi v2 clair en espagnol et en pause a également été examinée.
L’identité conservée repose sur leurs cartes, séparateurs, icônes, rail et typographie ; les couleurs normales trop vives sont atténuées.
Aucun fichier n’a été créé, modifié ou supprimé ; aucun serveur, navigateur de test ou harnais n’a été lancé.
BASE rapporte 181 contrôles et 1 170 tests sur le périmètre élargi ; ces résultats n’ont pas été reproduits ici.
Les touchers actuels viennent d’ERGONOMIE, dont l’auteur précise qu’ils sont déduits du code ; les nouveaux restent théoriques.
Aucun essai n’a été effectué sur la CNC, la Surface Pro ou Chromium 106 sur la RT.
Le rendu agrandi, toutes les traductions, les nouveaux montages DOM et les dimensions finales restent à vérifier.
Le verdict du minimum est donc partiel : il réduit fortement les détours, mais ne satisfait pas intégralement tous les principes ni P9.

