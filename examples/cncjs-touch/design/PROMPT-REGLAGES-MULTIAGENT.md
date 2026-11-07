# Mission : réorganiser les Réglages de CNCjs Touch avec une équipe multi-agent

Tu es l’**orchestrateur Claude Code**. Analyse, conçois, implémente puis valide localement une réorganisation ergonomique de **Réglages**, dans `C:\Users\damou\Documents\claude\cncjs`, fork `storm8488/cncjs`, branche `v2/integration`. Livre un résultat fonctionnel et vérifié, pas seulement des recommandations.

## Priorités et périmètre

1. Préserver la sécurité, toutes les fonctions et la compatibilité **v1 Éco sur Surface RT**.
2. Faciliter les tâches fréquentes, rendre les réglages compréhensibles et distinguer leur portée.
3. Faire des changements chirurgicaux, limités à Réglages et à ses tests.

**Matériel et usage :**

- Surface Pro 3 : CNC, Debian 13, Chromium, fenêtre **1366×911 CSS**, Performance v2, GPU matériel.
- Surface RT : laser, Raspbian, **1366×768 CSS**, rendu logiciel, **v1 Éco uniquement** ; elle doit continuer à fonctionner.
- Kiosques tactiles sans clavier ni souris, doigts sales ou gants, lecture à environ 60 cm.
- FR/EN/ES ; toutes les nouvelles chaînes visibles passent par i18n, avec lignes dans `i18n-messages*.js`.
- Chromium 106 : **JavaScript ES2017 maximum**, scripts classiques sans modules ni TypeScript ; CSS sans dépendance, sans `:has()`, imbrication, `dvh` ou `color-mix()`.

**Interdictions sans accord explicite de l’utilisateur :** push, merge, déploiement, modification des tablettes — particulièrement la RT —, SSH, commande vers une CNC/laser ou un hôte réel. Aucun accès réseau externe pour ce chantier ; seul le **loopback du harnais local et ses réponses simulées** est permis. Aucun véritable scan/changement Wi-Fi, `apt`, redémarrage ou arrêt. Utiliser les dépendances installées, sans téléchargement implicite.

## Lecture préalable obligatoire

Depuis `examples/cncjs-touch/`, lire :

- `touch/index.html`, tous les modules de l’inventaire ci-dessous et les insertions trouvées par recherche de `screen-settings`, `ks-system`, `data-settings-tab`, `cnc-settings-tab`.
- `touch/settings-list.css`, `touch/touch-shell.css`, `touch/design-tokens.css`, `touch/responsive.css`, `touch/performance-v2.css`.
- `TESTING.md`, `PROFILES.md`, `PROFILES-CONTRACT.md`, `PERFORMANCE-UI-SPEC.md`.
- **Aussi `touch/performance-v2-contract.js` et `touch/tablet-profile.js`** : ils précisent le contrat v2 effectif.
- `verify-project.cjs`, `browser-run.cjs`, `layout-exceptions.json`.
- `test-wifi-settings.cjs`, `test-system-updates.cjs`, `test-v2-settings.cjs`, `test-display-settings.cjs`, `test-settings-identity.cjs`, `test-i18n.cjs`, puis les tests des composants touchés.
- À la racine : `CLAUDE.md`.

Les instructions React/Stylus du projet principal ne justifient pas de convertir Touch : conserver ses scripts et CSS existants.

## État actuel : inventaire de départ à vérifier et compléter

L’inventaire décrit **l’arbre de travail actuel**, qui contient déjà des modifications. Ne pas revenir à `HEAD` : les nouveaux fichiers `system-updates.js`, `test-system-updates.cjs` et le service serveur associé sont notamment non suivis. Commencer par `git status --short` et les diffs ; préserver les modifications existantes, sans reset, clean, stash ou changement de branche.

Notation : **commun** = v1/v2, CNC/laser, Éco/Performance, sauf capacité matérielle indiquée ; **local** = ce navigateur ; **hôte** = ordinateur exécutant CNCjs, qui peut être différent de la tablette.

`index.html` contient seulement une section `#screen-settings` vide. Les modules construisent l’écran. `system-monitor.js` crée les onglets **Affichage / Système**, initialise `data-settings-tab="display"` et émet `cnc-settings-tab`. L’introduction, le guide et la langue restent visibles dans les deux onglets.

| Emplacement actuel | Bloc/réglages et fichier sous `touch/` | Portée, disponibilité et restrictions actuelles |
|---|---|---|
| Introduction commune | « Votre écran », résolution CSS — `display-settings.js` | Commun ; information locale. |
| Introduction commune | « Guide d’utilisation » — `interface-guide.js` | Commun ; ouvre Utilisation, Modes et fonctions, Surface et veille, En cas de blocage ; raccourcis et retour aux Réglages. Aucune commande. |
| Introduction + confirmation en fin d’écran | Langue FR/EN/ES — `language-settings.js` | Local ; sélection puis « Appliquer et recharger ». Application refusée pendant activité/retour au repos incertain, dialogue ouvert ou page non visible. Préserver les erreurs de stockage et l’avertissement sur les données non conservées. |
| Affichage, première carte après les onglets | Mise en service — `commissioning.js` | Hors simulation, CNC/laser, tous profils. Statut par port, lancer/reprendre/relancer l’assistant. Préparation, sauvegarde `$$`, arrêt d’urgence, fins de course, sonde, homing, broche, fichier d’essai, bilan. Laser : lunettes/capot/air/focus et carré 40 mm laser éteint, sans M3/M4 ni Z. L’ouverture exige un port ; les actions existantes gardent leurs autorisations et confirmations propres. |
| Affichage, après mise en service | « Pendant un travail » — `job-follow.js` | Commun/local : « Ouvrir le Suivi » et « Verrouiller l’écran ». Préférences modifiables pendant un travail, sans commande. Classe `.ks-job-follow-card`, **pas d’id `ks-job-follow-card`**. |
| Affichage | Type CNC/Laser — `display-settings.js`, `tablet-profile.js` | **Serveur**, partagé entre appareils ; via `cncJobControls.setMachineKind`. Machine connectée, appareil pilote et `machineProfile.canChange` requis ; conserver refus et incohérences affichées. |
| Affichage, après le type | Axe Z du laser — `laser-z.js` | Laser seulement ; préférence locale Affiché/Masqué, sans commande ni verrou travail. En CNC, Z reste visible. |
| Affichage | Performances de cette tablette — `display-settings.js`, `tablet-profile.js` | Commun/local : Éco/Performance, changement immédiat sans reload ni requête/commande. Défaut Éco en cas de valeur absente ou invalide. |
| Dans la carte Performance | Diagnostic de cette tablette + export JSON — `tablet-diagnostic.js` | Commun/local : fenêtre, viewport, DPR, profil, capacités Worker/OffscreenCanvas/WebGL, renderer et mesures de tracé 2D/WebGL. Refuse workflow non-idle et Run/Hold/Jog/Home/Door ; ne pas lui attribuer le contrôle complet `safeIdle` de v2. En v2, réutilise le verdict GPU sans second contexte. |
| Affichage, après Performance | Interface Performance v2 — `display-settings.js` | `#ks-v2-card` seulement si éligible ou layout v2 conservé : Performance + CNC confirmé + GPU matériel + poste large admissible. Préférence différée à la prochaine ouverture au repos, sans reload automatique ni commande. |
| Affichage | Taille du texte — `display-settings.js` | Commun/local : Standard/Agrandi ; pas de refus travail. |
| Affichage | Thème — `display-settings.js` | Commun/local : Sombre/Clair ; pas de refus travail. |
| Affichage | Suivi du travail réel — `display-settings.js` | Commun/local : afficher/masquer les coordonnées machine, toujours disponibles dans Déplacer/Origine ; pas de refus travail. |
| Affichage | Horloge — `display-settings.js` | Commun/local : heure dans l’en-tête affichée/masquée ; pas de refus travail. |
| Affichage | Plein écran — `display-settings.js` | Commun ; geste explicite, disponibilité du navigateur expliquée ; pas de refus travail. |
| Affichage | Veille — `display-settings.js`, `screen-saver.js` | Local : Jamais/1/2/5/10/30 min et Tester. Écran noir logiciel, premier toucher absorbé. Sommeil/test refusés pendant travail, pause, mouvement, homing, palpage, broche active, dialogue ou retour au repos non confirmé avec rapport frais du même contrôleur/génération. |
| Affichage, avant le pied de page | Luminosité — `backlight.js` | **Hôte**, selon matériel/droits : curseur 5–100 %, pas de 5 %, boutons ±10 %. Pendant veille : écran éteint/minimum/inchangé. Pas de verrou travail propre ; veille déjà protégée. |
| Affichage, pied de page | Rétablir l’affichage — `display-settings.js` | Local : texte standard, coordonnées et horloge visibles, veille 5 min, thème sombre. Ne réinitialise pas type machine, performances ou langue ; conserve le traitement explicite des préférences corrompues. |
| Mount Réglages v2 | Rendu 3D de cette session — `display-settings.js`, `touch-shell.js` | `#perf-v2-settings` / `#ks-v2-quality`, v2 seulement : qualité complète/allégée/arrêt du rendu, sans effet machine. Diagnostic ponctuel GPU/résolutions/DPR/qualité ; « Mesurer 60 images » uniquement avec `safeIdle`. Contrôles inertes après fermeture du contrat. |
| Système, en-tête | Ordinateur du serveur CNCjs — `system-monitor.js` | Hôte : identité/plateforme/architecture, session et état périmé. Lecture seule, autorisée pendant travail. |
| Système, grille | Processeur — `system-monitor.js` | Hôte : charge globale, modèle, barres par cœur ; lecture seule. |
| Système, grille | Température — `system-monitor.js` | Hôte : sonde principale, autres sondes, état thermique ; lecture seule. |
| Système, grille | Mémoire — `system-monitor.js` | Hôte : utilisé/total/disponible et barre ; lecture seule. |
| Système, grille | Charge moyenne — `system-monitor.js` | Hôte : 1/5/15 min et référence au nombre de cœurs ; lecture seule. |
| Système, grille | Alimentation — `system-monitor.js` | Hôte : secteur/batterie, capacité et charge/décharge ; lecture seule. |
| Système, grille | Historique 10 min — `system-monitor.js` | Hôte : courbes CPU/température, min/max et période ; lecture seule. |
| Système, grille | Réseau — `system-monitor.js` | Hôte : Wi-Fi, signal, SSID/débit, interfaces/IP ; **information distincte de la configuration Wi-Fi**. |
| Système, grille | Serveur CNCjs — `system-monitor.js` | Hôte : mémoire du processus, durées de fonctionnement CNCjs/système ; lecture seule. |
| Système, après la grille | Tablette/version/commandes — `tablet-actions.js` | Version/branche/date via `VERSION.json`, vérification de version de l’interface. **Liste dynamique des commandes CNCjs configurées**, pas une liste fixe : éventuellement redémarrage, extinction ou MAJ interface. Second appui sous 8 s, contrôle de repos et refus serveur conservés. |
| Système, après Tablette | Wi-Fi — `wifi-settings.js` | Hôte : réseau courant, recherche, connexion enregistrée/ouverte/protégée, réseau masqué, oubli d’un réseau enregistré non utilisé. Clavier tactile AZERTY, Maj/chiffres/symboles/espace/effacement, visibilité du secret, annulation. Secret vidé après envoi. Refus pendant travail/pause ; serveur protège aussi mouvement/homing/palpage/chargement/autre pilote. |
| Système, après Wi-Fi | Mises à jour du système — `system-updates.js` | Hôte : rechercher, nombre/sécurité/date, jusqu’à 12 noms de paquets, installer après second appui sous 8 s, progression/échec/fin et redémarrage requis. Distinct des MAJ interface ; sans changement de version Debian. Refus pendant activité ; machine bloquée durant installation. |

**Ordre actuel Affichage :** introduction → onglets → mise en service → pendant un travail → type machine → Z laser si applicable → Performance avec diagnostic → entrée/mount v2 selon bootstrap → texte → thème → coordonnées → horloge → plein écran → veille → luminosité → rétablissement/confirmation langue.

**Ordre interne Système :** en-tête/statut → grille des huit blocs listés → Tablette → Wi-Fi → Mises à jour → note finale.

**Dépendances à ne pas transformer en faux réglages :**

- `screen-lock.js` crée le cadenas et le verrouillage du bandeau, **aucune carte Réglages**. Pause/Arrêter restent accessibles ; déverrouillage par deux appuis.
- `machine-limits.js` crée un lien depuis **Machine** vers `#screen-limits`, et une présentation Machine v2 : paramètres/limites en lecture seule. Ce n’est pas un bloc Réglages existant à déplacer.
- `tablet-profile.js` fournit les API et les portes ; il ne construit pas de carte.
- Les mesures système pollent toutes les 2 s seulement sur Système visible, page visible et écran éveillé, avec abort/backoff. Les mises à jour pollent toutes les 3 s uniquement si tâche en cours et rubrique visible.
- Le support des mises à jour dépend actuellement de **Linux + `/usr/bin/apt-get`**, sans gate RT/v1/v2/Éco ni contrôle de distribution. Ne pas prétendre que la RT est automatiquement exclue.
- Les styles Réglages v2 sont notamment dans le bloc L6 de **`settings-list.css`**, même si `performance-v2.css` porte le nom de la v2.

## Critères d’acceptation mesurables

- Depuis Réglages ouvert, **≤2 taps pour modifier thème, taille du texte ou luminosité ±** ; **≤2 taps pour atteindre** langue, Wi-Fi, veille ou diagnostic. Compter séparément saisie, choix natif et confirmation ; mesurer les parcours avant/après, sans cacher un long défilement dans le décompte.
- Regrouper par intention : **Écran/Affichage, Réseau, Machine, Tablette & système, Mises à jour, Diagnostic, Langue/Aide**. Ces regroupements peuvent partager une rubrique ; ne pas imposer sept onglets.
- Titres, état courant, portée « Cette tablette »/« Serveur CNCjs » et raison d’indisponibilité immédiatement compréhensibles.
- Aucun défilement horizontal, texte superposé, libellé hors bouton ou mot coupé. Défilement vertical explicite et contrôlé ; aucune réduction par `transform: scale()`.
- Cibles secondaires **≥48 px**, principales **≥64 px**, texte utile et commandes **≥16 px CSS rendus**, espacements conformes aux tokens, objectif 12 px. Respecter aussi le reste du harnais, dont les jogs à 96 px hors Réglages.
- Actions dangereuses séparées des préférences courantes, avec confirmation explicite, annulable et lisible ; préserver les confirmations et contrôles existants.
- FR et ES vérifiés visuellement aux deux tailles, texte standard et agrandi ; EN vérifié fonctionnellement. Thèmes clair et sombre lisibles, focus visible, noms accessibles et états ARIA corrects.
- Zéro fonction perdue, préférence effacée ou effet contrôleur ajouté ; zéro violation stricte introduite. `layout-exceptions.json` est actuellement vide : ne pas le remplir pour faire passer la refonte.

## Équipe, phases et points de contrôle

L’orchestrateur tient les contrats et la liste des propriétaires de fichiers. Maximum **trois sous-agents actifs simultanément** ; jamais deux rédacteurs sur le même fichier. Les contrôles sont internes à l’équipe : avancer sans demander une approbation à chaque phase.

| Agent nommé | Entrées et responsabilité | Sortie attendue |
|---|---|---|
| **Inventaire & parcours** | Code réel, inventaire ci-dessus, usages opérateur/réglage initial | Inventaire corrigé avec ancres/gates/verrous ; tâches fréquentes/rares et mesures des parcours actuels. |
| **Architecture & maquettes** | Inventaire validé, critères et contraintes matérielles | 2 ou 3 architectures argumentées, puis maquettes rendues de la solution retenue. |
| **Critique & validation** | Alternatives, contrats, baseline et changements intégrés | Choix motivé indépendant, revue adversariale, résultats et preuves. Ne rédige pas le code de production. |
| **Structure & styles** | Architecture choisie et contrat de montage | Petits lots de structure/navigation/CSS, limités à Réglages, avec captures. |
| **Composants & traductions** | Contrat de montage et fichiers attribués | Adaptations ciblées des insertions, états et i18n ; conservation des fonctions et API. |

1. **Établir la référence.** L’orchestrateur relève branche, état Git et modifications préexistantes. Inventaire & parcours vérifie chaque insertion ; Critique & validation exécute les contrôles de référence avec fixtures uniquement.  
   **Contrôle :** inventaire complet, anomalies initiales identifiées, responsabilités de fichiers fixées.

2. **Comparer l’architecture.** Architecture & maquettes propose 2–3 solutions réellement différentes : par exemple deux onglets mieux structurés, rubriques avec sections repliables, ou liste maître-détail. Comparer taps, défilement, orientation, densité, ES, coût RT et séparation des risques. Critique & validation choisit avec justification et objections.  
   **Contrôle :** architecture retenue et contrat explicite d’ancres, visibilité, navigation et polling.

3. **Rendre les maquettes avant l’implémentation.** Produire HTML statique ou captures du harnais pour **1366×768 v1 Éco laser** et **1366×911 v2 CNC**, chacun en **FR et ES**. Montrer les rubriques, les contenus longs, le clavier Wi-Fi et les confirmations, pas seulement le premier écran. Simuler les capacités ; aucun crochet de production pour forcer v2.  
   **Contrôle :** inspection réelle des images par le critique ; corriger les problèmes de lisibilité avant de coder.

4. **Implémenter par petits lots.** Structure & styles possède la structure et les CSS attribués ; Composants & traductions possède les modules/i18n attribués. L’orchestrateur intègre séquentiellement les fichiers partagés, l’ordre des scripts et le cache. Tester chaque lot avec les tests concernés.  
   **Contrôle :** chaque bloc apparaît une seule fois, ses événements restent uniques et ses fonctions restent accessibles.

5. **Contre-revue et correction.** Le critique recherche activement les régressions v1 Éco/RT, sécurité, contrôleurs multiples, identité client, i18n, tactile, accessibilité, polling caché et lifecycle v2. Corriger puis rejouer les vérifications affectées et la suite finale.  
   **Contrôle :** preuves examinées, aucun échec masqué, aucune validation matérielle revendiquée.

## Contrats et règles anti-dérive

- Ne créer aucun réglage nouveau, ne supprimer aucune fonction, ne refondre aucun module hors Réglages.
- Conserver les identifiants, classes structurantes, API et événements utilisés ailleurs : notamment `#screen-settings`, `#ks-system`, `data-settings-tab`, `cnc-settings-tab`, `window.cncWifiSettings`, `window.cncSystemUpdates`, `cncSystemMonitor`, `cncProfile`, `cncV2` et les autres API des modules déplacés.
- Une migration d’ancre est possible seulement avec tous ses consommateurs et tests adaptés ; aucune assertion supprimée pour masquer une régression.
- Attention : le CSS actuel masque en Système tous les enfants directs sauf introduction/onglets/`#ks-system`. Les modules Wi-Fi, commandes et mises à jour dépendent aussi de la valeur `system` pour leurs lectures. Adapter ensemble visibilité et activité.
- `test-v2-settings.cjs` impose l’entrée v2 immédiatement après Performance ; le mount s’ancre aussi dans cette zone. Préserver ce contrat ou documenter/tester sa migration complète, y compris les insertions différées.
- Préserver le défaut et la préférence différée v2, `safeIdle`, `holdLayout`, les disposals et l’absence de chargements/timers/RAF **v2** sur RT/Éco/laser/rendu logiciel. Ne pas dupliquer l’horloge de fraîcheur de `cncV2.reportAge()`.
- Les règles CSS propres à v2 restent sous `body.perf-v2` ou `body:not(.perf-v2)`. Ne pas casser l’isolation L6 attendue par les tests.
- Conserver la persistance, la détection des conflits entre onglets, les erreurs de stockage et les portées local/serveur.
- Certains textes v2 sont actuellement traduits dans des dictionnaires embarqués. Toute migration vers les catalogues conserve leur disponibilité **avant** le chargement v2 ; le catalogue v2 différé est du JSON, jamais un script/eval.
- Pendant travail/pause/mouvement/palpage/homing, les actions système restent refusées. Conserver aussi les protections existantes sur chargement, broche active, état périmé, autre pilote et opération système concurrente. Un simple bouton désactivé ne remplace jamais le contrôle serveur.
- Réglages n’ajoute aucune commande contrôleur. Les seules actions machine déjà présentes dans la mise en service conservent leurs gardes ; tous leurs essais sont simulés.
- Préserver Bearer/API prefix et `clientId`/`clientLabel` des requêtes système. Aucun secret Wi-Fi stocké ou journalisé.
- Ne pas modifier le protocole serveur sauf nécessité démontrée, avec justification et tests ciblés ; un reclassement visuel ne constitue pas cette nécessité.

## Vérifications exactes et preuves

Exécuter avant les changements puis après intégration ; utiliser les installations locales. Ne pas reprendre comme résultats les anciens décomptes de `TESTING.md`.

Depuis la racine :

```powershell
npx jest src/server/services/touch
```

Si l’API Touch est concernée, ajouter depuis la racine :

```powershell
npx jest src/server/api/__tests__/api.touch.test.js
```

Depuis `examples/cncjs-touch` :

```powershell
node verify-project.cjs
node test-display-settings.cjs
node test-settings-identity.cjs
node test-wifi-settings.cjs
node test-system-updates.cjs
node test-v2-settings.cjs
node test-i18n.cjs
```

Capturer la référence avant modification :

```powershell
node browser-run.cjs --strict --browser "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --out output/settings-before --baseline
```

Puis valider le résultat intégré :

```powershell
node browser-run.cjs --strict --browser "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --out output/settings-after
```

**Attendus :** sortie 0, chaque script dédié termine par PASS, toutes les vérifications du runner réussissent, Jest se termine naturellement sans `forceExit`, harnais strict sans violation. Documenter séparément tout échec déjà présent à la référence ; ne pas réparer des sujets étrangers pour élargir le chantier.

Le harnais utilise sa fixture locale par défaut : **aucun `--url` vers une tablette ou un serveur réel**. Conserver ses étapes complètes, notamment v2, responsive, simulations et vérification de Pause/Arrêter.

**Angle mort à corriger :** actuellement le harnais ouvre Réglages sans parcourir explicitement Système. Étendre ses scénarios de façon ciblée pour visiter toutes les nouvelles rubriques et sections ouvertes, le clavier Wi-Fi, les mises à jour, les confirmations et les refus pendant activité, en FR/ES et aux deux tailles cibles. Mocker toutes les API et requêtes externes. Un strict vert sans ces parcours ne suffit pas.

Examiner les PNG et rapports produits : taille réelle des contrôles, texte, recouvrements, défilement, état sélectionné, focus et accès aux actions. Les simulations de GPU ne prouvent ni les performances réelles de la Pro 3 ni le comportement matériel de la RT.

## Cache et clôture

Après stabilisation, relever à nouveau le suffixe courant. **L’état inventorié utilise `v2k` : le suivant est `v2l`.** Remplacer littéralement les références à ce suffixe dans `touch/` et les `*.cjs` de l’exemple, y compris `ADVANCED_VERSION` dans `tablet-profile.js`, les pages et les assertions. Vérifier l’absence de l’ancien suffixe. Pour chaque ressource modifiée qui utilise un autre suffixe historique, actualiser aussi son `?v=` ; ne pas renuméroter arbitrairement toutes les autres ressources. Rejouer les contrôles concernés après ce changement.

Le compte rendu final de l’équipe sera **en français**, avec :

- changements et fichiers concernés, architecture choisie et justification concise ;
- tableau avant/après des parcours avec taps et défilement ;
- captures comparables FR/ES, v1 Éco et v2, avec chemins consultables ;
- commandes exécutées, résultats exacts, éventuels échecs initiaux et résultats de la contre-revue ;
- fonctions, gardes et compatibilités préservées ;
- ce qui reste non vérifié, notamment matériel réel, GPU réel, Wi-Fi/apt/redémarrage/extinction et tablettes.

Arrêter le chantier après validation locale et remise des preuves. Aucun push, merge ou déploiement automatique.

