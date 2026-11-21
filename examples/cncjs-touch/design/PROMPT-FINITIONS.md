# Finitions de l'interface réelle (multi-agent, 2026-11-14)

Tu écris en français. Dépôt `C:\Users\damou\Documents\claude\cncjs`, branche `feat/ecrans-ergonomie`, HEAD `71499952`, pas encore déployé. Ce commit ajoute le pavé numérique aux mesures de la sonde et les pas 25/50/100 mm. `86154aad` est déployé sur la Surface Pro CNC, en cache `v2s`.

La vraie CNC est branchée et en service :
- matériel : LUNYEE 4040, Grbl 1.1f sur ESP32, `/dev/ttyUSB0` ;
- réglages : `$10=1`, `$13=0`, `$20=1`, `$21=1`, `$22=1`, `$23=3`, `$130-132=408/396/130` ;
- origine forcée à 0 après `$H` (MPos 0,0,0) ; X et Y vont de 0 vers +, Z va de −130 à 0 ;
- 6 fins de course, prouvés ;
- après une alarme de fin de course, la carte ESP32 redémarre seule.

## Chantiers, à mener en parallèle

### 1. Serveur : prise d'origine faite hors de la tablette
- **Constat.** La convention « 0 → +course » n'est apprise (`homeMpos`, job-service.js) qu'après un `$H` lancé par la tablette. Une origine faite depuis l'interface CNCjs du PC laisse X/Y refusés : « Course X ambiguë ».
- **Demande.** Apprendre aussi d'un cycle complet vu chez un autre client, sans affaiblir la sûreté :
  - cycle complet vu : état Home, puis Idle ;
  - position machine fiable ;
  - même `$23`.
- **Points à décider (Astra).**
  - Le risque d'un `$HX`/`$HZ` partiel.
  - Le risque d'une carte redémarrée à MPos 0 sans origine.
  - Comment distinguer ces deux cas d'un cycle complet : tous les axes du masque `$23` trouvés à 0 ? un cycle vu depuis un état non référencé ? une durée minimale ?
- Avec les 6 fins de course et `$20=1`, le pire cas reste une alarme de fin de course, pas une collision. Le dire et le tester.

### 2. Serveur et page : version Grbl inconnue après un redémarrage de CNCjs
- **Constat.** Après `pm2 restart` puis réouverture du port, le service ignore la version Grbl : la bannière est passée avant lui. Pas et origine sont alors refusés (« Version Grbl inconnue… lisez les réglages ($I) ») jusqu'à l'action `readSettings`.
- **Demande, au choix (justifier le choix) :**
  - que le service apprenne la version sans action de l'opérateur, au repos et sans risque : réponse `$I` déjà vue, `[VER:` dans le flux ;
  - ou que Préparer et Machine proposent « Relire les réglages » en un bouton, là où le refus s'affiche.
- Vérifier ce qui existe déjà : la dernière revue a ajouté des phrases actionnables. Ne rien dupliquer.

### 3. Page : clavier texte pour « Nom du profil » de la sonde
- Le kiosque n'a pas de clavier système. Il existe un clavier AZERTY à l'écran dans `wifi-settings.js`.
- Le rendre réutilisable (module partagé, ou extraction minimale) pour `#probe-profile-name`, sans régression du Wi-Fi.
- Faire de même pour tout autre champ texte de la page réelle sans clavier : chercher les `<input>` texte de `index.html` et des scripts qu'il charge.

### 4. Page : ligne des pas à 7 boutons
La ligne contient 0,1 / 1 / 10 / 25 / 50 / 100 / Continu. Vérifier le rendu dans le harnais aux formats de la tablette :
- v2 911 ;
- v1 Éco 768 ;
- compact.

Aucun texte coupé, cibles ≥ 44 px. Ajuster le CSS au minimum. Chromium 106 : pas de `:has()`, `color-mix` ni `dvh`. Ne jamais renommer les classes `v2m-`/`v2n-` ni la regex `V2_NODE`.

### 5. Cache
Passer le cache de `v2s` à `v2t` : seulement les `?v=`, `ADVANCED_VERSION` et leurs tests.

## Garde-fous
- Aucun agent ne touche la Surface ni la CNC : pas de SSH, pas de déploiement, pas de push.
- Propriété des fichiers en phase Code :
  - le chantier serveur n'écrit que dans `src/server/**` ;
  - le chantier page n'écrit que dans `examples/cncjs-touch/**`, sauf `design/ops`.
  - Les messages serveur affichés par la page passent par les tables i18n de la page.
- Ne pas affaiblir la sûreté du serveur : bornes de course, pas maximal non référencé, refus broche en marche, pilotage, annulation à la perte du réseau, limite de 60 s.
- Chaque changement de comportement a un test qui échoue sans lui.
- Interdits :
  - `git reset/stash/checkout` de fichiers d'autrui ;
  - contournement des hooks ;
  - `COMPTE-RENDU-*.md` et PNG commités ;
  - fichiers de `tablet-exclude.txt` réintroduits.
- Vérifications :
  - `node examples/cncjs-touch/verify-project.cjs` ;
  - `npx jest src/server/services/touch grbl-simulator` ;
  - harnais strict complet `node examples/cncjs-touch/browser-run.cjs --strict --out <dossier>` : 0 violation, 0 excepted, every step passed, aucun msedge `cnc-browser-run` restant.
