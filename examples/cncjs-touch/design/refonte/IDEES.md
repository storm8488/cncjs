# Fonctions proposées et non réalisées

État FINAL du 16 novembre 2026, sur `feat/refonte-ui`, base de revue `e5d43389`. Ce registre reprend `SPEC-REFONTE.md` § 13.1, `PLAN-CORRECTIONS.md` § 7 et `VEILLE.md` § 3. Il n'autorise aucune réalisation ni modification des gardes. Les références aux autres logiciels sont celles de la veille locale, sans nouvelle vérification externe.

## Décisions de fonctions à prendre

| Id | Proposition | Origine | État et décision nécessaire |
|---|---|---|---|
| I-01 | Grouper les scripts de la page en un paquet | Spec 13.1.1, C8 | Non réalisé. Adapter l'installation et prouver les langues et Chromium 106 avant de changer le chargement dont dépendent Pause et Arrêter. |
| I-02 | Alléger les paquets constants du flux | Spec 13.1.1, C10, plan 7 | Non réalisé. Évolution du protocole serveur/page ; mesurer taille et fréquence, garder les états et refus complets. |
| I-04 | Afficher une pastille de course sur chaque ligne de fichier sans la sélectionner | Spec 13.1.3 | Non réalisé. Aujourd'hui le contrôle porte sur le fichier touché ; décider du coût des lectures, de leur identité et de leur invalidation au changement de zéro. |
| I-06 | Mémoriser au serveur que le zéro appartient à cette pièce | Spec 13.1.5 | Non réalisé. Définir l'identité de pièce, sa durée et les événements qui la périment. Après redémarrage, « Ancien zéro » reste une information prudente. |
| I-07 | Réinitialiser la carte depuis la tablette | Spec 13.1.6, plan 7 | Non réalisé. Le reset peut perdre la référence et n'est pas un arrêt physique ; concevoir permissions, confirmation et remise en route. |
| I-09 | Surveiller le test de broche de mise en service | Spec 13.1.6, C-69 | Non réalisé. Définir arrêt sur perte de flux/pilote, délai maximal et observation réelle de l'arrêt. Le test actuel n'acquiert pas ces garanties par la refonte. |
| I-10 | Donner un code stable à chaque phrase du serveur | Spec 13.1.7, TEXTES 4.3 | Partiel : les refus codés ont leur phrase et remède. Les anciens messages sans code utilisent encore une reconnaissance de préfixe ; compléter le protocole et ses tests avant de retirer ce repli. |
| I-11 | Remonter à une hauteur de sécurité à la pause | Spec 13.1.8, veille hors liste | **Écrit, pas installé : la relecture de sûreté n'a pas donné son accord (branche `feat/F2`).** Une pause n'ajoute aujourd'hui aucun mouvement de dégagement. Définir le repère, la garde de course, les obstacles et la reprise. |
| I-12 | Exporter un journal dédié des points palpés, notamment sur clé USB | Spec 13.1.8, veille hors liste | Non réalisé comme fonction dédiée. L6 affiche déjà les contacts/origines/valeurs numériques du **bloc** reçus dans l'historique ; la plaque ne fournit pas le même relevé. Ne pas annoncer que toute trace est absente, ni inventer des contacts de plaque. |
| I-13 | Choisir à neuf points l'origine du fichier | Spec 13.1.8, veille 6 | Non réalisé. Les dessins actuels montrent les données reçues ; ils ne changent pas l'origine du programme. Définir les transformations et leur preuve. |
| I-16 | Lancer un mouvement en deux touchers sur le kiosque, sans la case | Spec 13.1.11, veille 12 | **Non réalisé : retire un garde.** La case, le nonce, l'expiration et l'armement restent. Une décision explicite de l'opérateur et une conception de sûreté sont nécessaires. D3/local ne prouve pas la présence d'une personne. |
| I-17 | Retenir le dernier cycle de bloc Z/X/Y entre séances | Spec 13.1.12, veille 4 | Non réalisé. L'arrivée sur Zéro pièce revient à XYZ ; les dimensions et profils mesurés restent mémorisés. Ne jamais proposer une cote physique supposée. |
| I-18 | Envoyer directement le côté et la distance du dépassement d'un palpage | Spec 13.1.13 | Non réalisé côté serveur. La page les déduit des bornes reçues. Définir des paramètres codés sans déplacer le calcul d'autorisation hors du serveur. |
| I-19 | Nommer les fins de course touchées et ouvrir une fenêtre d'alarme automatique | Veille 8, partie non reprise | Le panneau de remise en route existe ; aucune fenêtre nouvelle ni identification certaine des six contacts n'est ajoutée. Vérifier les données du firmware, éviter de masquer Pause/Arrêter. |
| I-20 | Faire reprendre la machine axe par axe après incident | Veille 9, partie non reprise | Le volet de reprise et son préambule existent. Une validation distincte par axe modifierait les commandes : pas réalisée. |
| I-21 | Choisir les points de palpage au doigt sur une caméra | Veille hors liste, DATRON non vérifié | Non réalisé, sans cas de terrain justifiant le matériel, la calibration ou les commandes associées. |
| I-22 | Charger moins de catalogues en français | Spec 12, C9 | Optimisation retirée de L6 : les variantes navigateur EN/ES n'ont pas pu être validées. Conserver le chargement complet jusqu'à cette preuve. |
| I-23 | Reprendre après une coupure de courant de la machine (tablette restée sur batterie) | Opérateur, 2026-11-17 | Non réalisé, mis de côté à sa demande. Le zéro pièce survit dans la carte ; la position machine est perdue (prise d'origine à refaire, précision des capteurs) ; la carte ne rapporte pas la ligne usinée, seulement les lignes envoyées (environ 15 mouvements d'avance). À concevoir : reconnaître la coupure (redémarrage de la carte en plein usinage), choisir une ligne de reprise sûre quelques lignes avant, enregistrer l'avancement sur disque si la tablette s'éteint aussi, guider vers « Reprendre à une ligne ». Limites à dire : marque possible à la reprise, fraise peut-être cassée, essai réel fraise en l'air d'abord. À faire après F2 (mêmes parties du code). |
| I-24 | « Z de référence » après un changement de fraise | Opérateur, 2026-11-17 | Non réalisé. Mémoriser la hauteur d'un point fixe (martyr, cale) avec la première fraise, puis la restituer d'un toucher après chaque changement de fraise ; ou « poser Z à une valeur ». Utile quand le dessus de la pièce est déjà usiné et que la plaque ne tient plus à plat. En attendant : Z0 de Vectric sur la table (martyr). |
| I-25 | Palper dans le trou de la plaque XYZ Bulkman3D (TP-XYZ) et profil prêt à l'emploi | Opérateur, 2026-11-21 | **Conçu, mis de côté à sa demande** jusqu'à la mesure de la plaque (épaisseur du dessus, position du trou). Conception : `../plaque/P1-CONCEPTION.md` (branche `feat/P1`), pas encore relue par Astra. |
| I-26 | Changement de fraise guidé (pause `M6` et entre deux fichiers) | Opérateur, 2026-11-21 | **Conçu, mis de côté** avec I-25 (repose sur le palpage Z à la plaque). Conception : `../plaque/P3-CONCEPTION.md` (branche `feat/P3`), pas encore relue. |
| I-27 | Remise en route complète après un Arrêter : retour au-dessus du zéro pièce, zéro gardé prouvé par comparaison, garde de départ | Opérateur, 2026-11-21 | **Refusé trois fois par la relecture de sûreté, mis de côté.** Conception v3 : `../plaque/P4-CONCEPTION.md` ; le coût opérateur (zéro XYZ à refaire après chaque reconnexion) n'était pas acceptable. Une version allégée sans mouvement est livrée (`../plaque/P4-ALLEGE.md`). |
| I-28 | Position de changement de fraise : Z monte seul, puis X, puis Y vers une position machine enregistrée | Opérateur, 2026-11-26 | **Conçu, non codé.** Conception révision 3 : `../plaque/N4-CONCEPTION.md`. Deux contre-avis de sûreté « à revoir » (`../plaque/N4-AVIS-ASTRA-1.md`, `-2.md`) : mis de côté. Le second demande d'abord de corriger I-29. |
| I-29 | Rapports d'état sans position ou sans vitesse de broche : une ancienne valeur est gardée comme actuelle (cadrage à vide, pas) | Relecture de sûreté, 2026-11-26 | **Constat, non corrigé.** `../plaque/CONSTAT-RAPPORTS-SANS-POSITION.md` : prouvé dans le code par reproduction, rien ne montre que la carte LUNYEE le déclenche. Le second contre-avis juge le risque sous-estimé et recommande de corriger ces gardes avant de réutiliser « Cadrer à vide » sur une pièce bridée. Correction à faire dans un lot à part. |
| I-A | Axe rotatif A (4e axe, mandrin K12-100, réduction 6:1) | Opérateur, 27 novembre 2026 ; `../axe-a/AXE-A-CONCEPTION.md` | **L0 réalisé** (branche `feat/axe-A`, `../axe-a/L0-RAPPORT.md`) : un programme avec des mots A, B ou C est signalé à l'écran Contrôle et à la confirmation de départ, et n'est pas repris à une ligne ; rien d'autre ne change. L1 (voir A) attend la lecture de la carte ; L2 à L4 (zéro, déplacement, programmes en indexage) attendent les essais T0 à T11. Décisions à prendre : questions Q1 à Q5 de la conception. |

## Réalisé la nuit du 26 novembre 2026 (branche `feat/nuit-2026-11-26`, non installée)

Choisies par l'opérateur parmi huit idées issues d'une recherche documentaire. Aucune n'est essayée sur la machine ; chacune a son essai dans `PROTOCOLE-ESSAI.md`.

- Analyse du fichier (lot N1) : profondeur comparée à l'épaisseur du brut saisie, fraises nommées par le fichier, temps de montée de la broche avant la première descente. Avertissements d'affichage, qui ne bloquent pas le départ. Rapport : `../plaque/N1-RAPPORT.md`.
- Notification (lot N3) : grand bandeau et son à la fin, à une pause et à une alarme ; volume et essai du son dans Réglages → Affichage. Rapport : `../plaque/N3-RAPPORT.md`.
- Sauvegarde des réglages de la carte (lot N8) : fichiers datés sur le serveur, comparaison avec la carte, export ; aucune restauration, aucune commande nouvelle. Rapport : `../plaque/N8-RAPPORT.md`.

Non retenues cette nuit par l'opérateur : surfaçage intégré, compteurs d'heures de broche et d'usure des fraises.

## Réalisé le 21 novembre 2026 (branche `feat/plaque-xyz`, non installée)

- Durée des gros fichiers (P5) : le modèle de durée couvre les programmes de plusieurs centaines de milliers de lignes, mémoire bornée ; la barre « en lignes » reste le dernier recours. Rapport : `../plaque/P5-RAPPORT.md`.
- Position perdue (P4 allégé) : après un redémarrage ou une alarme, une seule cause claire avec la prise d'origine ; les refus « non référencée » et le jog `error:15` y renvoient ; le zéro pièce n'est plus dit « vérifié » sans comparaison. Aucun mouvement ajouté.

## Réalisé le 17 novembre 2026

Réunies dans la branche `feat/fonctions-5` (rapport : `../fonctions/RAPPORT.md`). Aucune n'est encore essayée sur la machine : chacune a son essai dans `PROTOCOLE-ESSAI.md`, fraise en l'air d'abord.

- I-03 — Cadrer à vide une pièce sur la CNC : lot F1, « Cadrer à vide… » sur 4 · Contrôle (Z monte seul en haut, tour du rectangle broche arrêtée, retour au départ, Z ne redescend pas). Quatre relectures de sûreté ; la dernière : « installable pour un essai encadré ».
- I-05 — Reconnecter automatiquement le dernier port : lot F5, une tentative au chargement du kiosque local, vers le dernier port ouvert avec succès ; réglage pour l'éteindre.
- I-08 — Recharger la page automatiquement après installation : lot F10, bandeau de 10 s avec « Plus tard », seulement quand tout est au repos.
- I-14 — Format propre à 1024 × 600 et au portrait : lot F16, même page, Pause et Arrêter toujours visibles, les deux tablettes inchangées.
- I-15 — Rendre volontairement la main : lot F4, « Rendre la main » dans le dialogue « La main », refusé pendant un usinage.

## Éléments écartés du plan, sans nouvelle fonction livrée

| Élément | Décision conservée et suite |
|---|---|
| C-36, homing partiel externe ; Q-06 | Pas de durcissement supplémentaire sans connaissance des rapports Home. `$HX` fait les trois axes sur la LUNYEE observée ; ce fait ne généralise pas aux autres cartes. Essais E-C/E-D. |
| C-50, mot de passe Wi-Fi dans les arguments | Non corrigé dans ce lot ; `nmcli passwd-file` non essayé. Une évolution demande un test local du gestionnaire réseau, sans publier les secrets. |
| C-51, URL et fichiers du kiosque hors dépôt | Hors périmètre logiciel. Relever l'installation réelle avant D3, voir le protocole. |
| C-56, feed hold préventif sur un vieux rapport Idle | Non ajouté : un hold au repos peut imposer une reprise/reset et perdre la référence. L'arrêt physique reste le recours si le mouvement réel contredit l'écran. |
| C-70, identité de pilote rejouable | Bail conservé pour éviter les commandes concurrentes accidentelles. Une authentification d'appareil est un autre chantier. |
| Fermer tout port pendant un travail, même pour son pilote | Refus universel non ajouté ; la politique de bail existante reste. |
| Voile jusqu'au réveil confirmé et reconnaissance par adresse locale réseau | Non ajoutés. D3 utilise la boucle locale ; une seconde page locale peut encore éteindre l'écran. Le premier toucher sur un panneau ainsi noir reste une limite. |
| G94 obligatoire pour tous les départs | Non ajouté ; la garde concerne la reprise dont le préambule ne fixe pas G94 (C-59). |
| Marge de 0,5 mm aussi au côté homing | Non ajoutée : elle interdirait la position obtenue après `$H`, notamment Z0. La borne opposée seule porte la marge provisoire. |
| C-66, bouton Actualiser encore construit | Nettoyage non livré : `shared-library.js` crée encore `library-refresh`. La colonne commit de CONSTATS ne le présente pas comme corrigé. |

## Ce que la veille a déjà inspiré

Les idées 1, 2, 3, 5, 7, 10, 11, 13 et 14 se retrouvent dans les dessins de palpage, le test de contact, la carte commune, le contrôle avant départ, les remèdes locaux, les permissions serveur, le bandeau et les cinq étapes. L'idée 4 fournit les vitesses de départ et le coin facultatif pour Z, **sans cotes physiques inventées**. L'idée 6 est partielle (dessins et cadrage laser, pas cadrage CNC ni neuf points). L'idée 8 est partielle (remise en route, pas nouvelle fenêtre automatique). L'idée 9 est partielle (reprise vérifiée, pas boutons par axe). L'idée 12 fournit les libellés d'effet et la confirmation conservée, sans suppression de case. L'idée 15 fournit la relecture automatique, pas la reconnexion au port.

Les comptes de touchers et le rendu sur les vraies tablettes restent à valider ; ils ne deviennent pas des mesures par leur présence dans la spec ou ce registre.
