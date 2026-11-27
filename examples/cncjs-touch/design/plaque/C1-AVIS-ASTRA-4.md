# C1 — contre-avis de sûreté n° 4 (Astra, lecture seule, 2026-11-26)

**La révision 4 lève le dernier danger de conception du troisième avis. Aucun nouveau blocage avant réalisation identifié.** Relecture de `feat/C1`, commit `d6851c6e`, sans modification ni contact machine.

1. **danger — Second repère parasite : corrigé dans la conception.**  
   [C1-CONCEPTION.md:33](C1-CONCEPTION.md:33) ; `GrblLineParserResultStatus.js:28` ; `GrblRunner.js:79`.

   Le rejeu du vrai Runner confirme que `MPos:1,2,-20|junk:WPos:1,2,-40` produit effectivement les deux positions incohérentes ; le cas symétrique aussi. La révision 4 ferme cette ouverture : elle refuse plusieurs occurrences de `MPos:`/`WPos:` et calcule elle-même le second repère depuis les données brutes validées. La concordance trompeuse du seul repère principal ne suffit plus. **Conserver ces deux règles.**

2. **à corriger avant le code — Aucun point supplémentaire.**  
   [C1-CONCEPTION.md:372](C1-CONCEPTION.md:372).

   La réponse satisfait la correction demandée. Les points déjà acceptés au troisième avis restent acceptés ; les contrôles suivants concernent leur réalisation.

3. **à vérifier au code — Le WCO retenu doit réellement rester strict.**  
   `C1-CONCEPTION.md:33`, `:50`, `:240` ; `job-service.js:400`, `:409` ; `work-offset.js:349`.

   Appliquer « entier et unique, comme la position » jusque dans le cache utilisé pour dériver l’autre repère. Aucun remplacement par `payload.wco`, le `r.wco` historique ou l’état fusionné. Tester notamment `WCO:0,0,20|junk:WCO:0,0,0` : le vrai parseur retient le dernier zéro. Vérifier aussi la remise à zéro à la bannière, le WCO valide reçu antérieurement et l’absence totale de WCO : **second repère inconnu, jamais décalage zéro supposé**. Conserver les invalidations D2 existantes. Cela applique le contrat écrit, sans demander une refonte de D2.

4. **à vérifier au code — Deux précisions pour les mutations.**  
   [C1-CONCEPTION.md:267](C1-CONCEPTION.md:267), lignes 268–271 ; `work-offset.js:353`.

   **M30/T8w est discriminante** : sans la provenance, la dérivation saine autorise `G38.2 Z-30` ; le code sain doit refuser. En revanche, **M29 est désormais masquée** par cette provenance : `junk:MPos:` provoque déjà le refus. La classer redondante ou fournir un autre cas discriminant.

   Pour **M31**, vérifier que la variante WCO parasite distingue effectivement la valeur dérivée ou la cible, plutôt qu’un refus préalable de D2. Retirer simultanément deux protections constitue un essai combiné, pas une mutation isolée. La redondance reconnue reste acceptable.

5. **à vérifier au code — Conserver les exigences déjà acceptées.**  
   [C1-CONCEPTION.md:277](C1-CONCEPTION.md:277), lignes 279–287.

   Contrôler les preuves après chaque attente, les positions machine **et travail**, les vrais acquittements, les réservations et l’annulation sans écriture tardive. Vérifier l’arrêt matériel demandé pendant la plaque, y compris entre deux lignes et après annulation ; aucun `0x85` pendant G38, aucun délai modal pendant sa descente. Pause/Arrêter doivent rester accessibles **depuis le kiosque**. Ces exigences ne redeviennent pas des objections à la conception.

6. **à vérifier au code — Conversion des tests acceptable sous le contrôle prévu.**  
   [C1-CONCEPTION.md:278](C1-CONCEPTION.md:278).

   Les « dix-sept fichiers » ne constituent pas un périmètre établi. Maintenir le commit séparé, le passage sur l’ancien code, la comparaison des octets et chronologies, les omissions brutes et la justification de chaque changement d’entrée ou d’assertion. Aucun ajout silencieux de FS, M5, second Idle ou temps supplémentaire.

7. **remarque — Portée et délais correctement bornés.**  
   `C1-CONCEPTION.md:13`, `:63`, `:72`, `:290`, `:308`.

   La fermeture des contre-séquences position/broche reste acquise **dans le périmètre gardé**, avec les exceptions déjà acceptées. Les délais sont des seuils logiciels, le surcoût reste à mesurer. Après réalisation et relecture du code, l’essai encadré fraise en l’air demeure l’étape appropriée.

VERDICT : à réaliser
