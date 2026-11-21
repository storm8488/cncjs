# Fonctions réunies pour l'essai sur la CNC : rapport de la réunion (17 novembre 2026)

Branche locale `feat/fonctions-5`, arbre `cncjs-wt/R5`. Rien n'est poussé, rien n'est installé ; aucun accès à la tablette, à la RT ni à la CNC. Consigne générale : `../PROMPT-FONCTIONS-6.md`.

**En une phrase : cinq fonctions sont réunies (rendre la main, reconnexion automatique, rechargement automatique, petits écrans, cadrage à vide sur la CNC) ; « Pause et dégager » (F2) est laissé dehors, faute d'accord de la relecture de sûreté.**

## 1. Ce qui est réuni

La branche part de `263748ef` : la refonte installée, plus F4, F5, F10 et F16, déjà réunis et verts (228 contrôles, 1 561 tests). Cette réunion y ajoute :

| Commit | Contenu |
|---|---|
| `b7471fb7` | Fusion `--no-ff` de `feat/F1` à `9eb25a5c` : le cadrage à vide et ses trois tours de corrections de sûreté (`504f9c3c` à `9eb25a5c`), validé par la quatrième relecture d'Astra : « installable pour un essai encadré » (`relectures/astra4-F1.md`). |
| `e7014407` | Interactions entre lots : correction F1 × F4 (un seul arrêt), tests F1 × F4, F1 × F10, F5 × F10, et l'étape `small` du harnais avec le bouton de F4. |
| `24f68a4e` | La remarque « à corriger » de la quatrième relecture : la case E6 × « Arrêter la broche » de la table d'états du cadrage ; un test LUNYEE de F1 qui dépendait de la charge du PC (§ 3). |
| (commit de documents, le dernier) | Ce dossier, `refonte/IDEES.md`, les entrées F4 de `refonte/SURETE.md` et `refonte/PROTOCOLE-ESSAI.md`. |

Fins de ligne : toutes les commandes git qui écrivent l'arbre ont été lancées avec `-c core.autocrlf=false -c core.eol=lf`.

### Conflits de la fusion, les deux comportements gardés

| Fichier | Résolution |
|---|---|
| `verify-project.cjs` (liste des tests) | Union : `auto-connect`, `auto-reload`, `auto-reload-recovery`, `small-screens` (F5, F10, F16), puis `cnc-frame` (F1). |
| `touch/index.js` (exports) | Les deux : `refuseAutoConnect` (F5) et `refuseUpload` (F1). |
| `job-service.js`, `control` release / takeover | D'abord la surveillance du cadrage CNC (F1, son propre code `ETOUCH_FRAME_CONTROL`), puis l'arrêt du déplacement de l'appareil qui rend la main (F4). |
| `SURETE.md`, `PROTOCOLE-ESSAI.md` | Sections mises bout à bout : F5, F10, puis F1 (§ 8 du protocole). |

Les autres fichiers communs (`job-controls.js`, `motion.js`, catalogues i18n, `api.gcode.js`, `test-real-motion.cjs`, `job-service.test.js`) se sont fusionnés sans conflit et ont été relus à travers les suites.

### Conflit de sens trouvé à la fusion (F1 × F4, après une bannière)

Deux tests de F1 sont devenus rouges une fois F4 présent :

1. **« C1. after a banner… », cas `release`.** F1 garantit qu'après une bannière de la carte (carte redémarrée) le cadrage, terminé, n'écrit plus rien à la carte, pas même un `0x85` (relecture C1). Or l'arrêt ajouté par F4 à la libération voyait encore le rapport `Jog` d'avant la bannière et écrivait un `0x85`. **Correction :** la libération n'écrit rien quand il ne reste que les lignes de ce cadrage terminé (`motion.bannerLeftover`). Un pas ou un continu manuel, eux, restent arrêtés par la libération comme F4 le veut.
2. **`manual-jog-banner.test.js`** (96 scénarios de jogs manuels enregistrés sur `db584555`). Six cas changent : ceux où la tablette rend la main. C'est le comportement voulu par F4 : l'annulation part à la libération (motif `released`) au lieu de 300 ms plus tard (perte du maintien) ou jamais (un pas après une bannière, `Jog` rapporté huit secondes, n'était jamais annulé à la base). Les six résultats sont enregistrés à part (`WITH_F4_RELEASE`), les 90 autres restent ceux de `db584555`. **Preuve :** en neutralisant la seule ligne d'arrêt de la libération, le fichier redonne la table de `db584555` pour les 96 cas.

## 2. Interactions entre lots (reprises de la première réunion, `feat/fonctions-6`)

La première réunion des six lots (`7ba548ce..6dca5ea7`, sur les versions de F1 et F2 d'avant relecture) avait trouvé une interaction et écrit des tests. Reportés ici, vérifiés sur le F1 corrigé, **sans rien de F2** :

| Interaction | Ce qui est fait | Preuve |
|---|---|---|
| F1 × F4, un seul arrêt | Rendre la main pendant un cadrage écrivait **deux** `0x85` : la surveillance F1 arrête le cadrage, puis l'arrêt F4 de la libération voyait encore la ligne en attente. Le code de F1 a changé depuis, le défaut existait toujours (test rouge : deux annulations). `motion.supervise` rend `true` quand il vient d'arrêter le cadrage, et la libération ne relance pas d'arrêt. Le cadrage laser, que `supervise` ne traite pas, reste arrêté par la libération. | `cnc-frame.test.js`, « CNC framing with the other lots of the merge » (deux cas F4, rouges avant, verts après) ; nouvelle colonne « main rendue (F4) » de la table d'états : sept états du cadrage, une réponse chacun (départ en attente : refusé ; en cours : `ETOUCH_FRAME_CONTROL` ; annulation en cours : `0x85` seuls ; terminé par une bannière : rien). |
| F1 × F10 | De la confirmation au retour, à chaque ligne (carte `Idle` et travail au repos entre deux lignes), la règle de la page F10 voit la machine occupée ; une fois le cadrage fini, elle voit le repos. La règle est lue dans `tablet-actions.js` (`support/auto-reload-rest.js`), pas recopiée. | `cnc-frame.test.js`, même bloc. |
| F5 × F10 | Une installation trouvée pendant la reconnexion automatique : aucun bandeau ni rechargement pendant l'ouverture du port, l'attente du premier rapport et l'alarme de la carte redémarrée ; un seul rechargement une fois au repos ; une seule ouverture. La page rechargée ne rouvre rien. | `examples/cncjs-touch/test-f5-f10.cjs` (dans `verify-project`), vrais `connect-cnc.js` et `tablet-actions.js`. |
| F16 × F1, F4 | Sur téléphone (412 × 915, 360 × 800) et écran 1024 × 600, variantes CNC : un usinage en cours, la page tenant la main ; l'écran Usinage et le dialogue « La main » (« Rendre la main » rayé, sa phrase, « Voir l'usinage ») passent les mêmes mesures strictes que les autres écrans. Le bouton de F1 (« Cadrer à vide… ») est sur Contrôle, mesuré dans chaque état de chaque variante. | Étape `small` du harnais (`browser-small.cjs`, crochet `fx.extra` de `browser-run.cjs`). |

Non repris, car propres à F2 : les tests F2 × F4 et F2 × F10, les états « Pause et dégager… » et « fraise dégagée » de l'étape `small`.

## 3. La remarque de la quatrième relecture (case E6 × « Arrêter la broche »)

La table d'états du cadrage annonçait, pour « terminé par une bannière » × « Arrêter la broche », une annulation (`cancel only`) qui n'existe pas : seul `M5` est écrit, aucun `0x85`, et le test acceptait une liste vide ou un refus. **Correction (table et preuve, pas de code) :** la case dit maintenant « M5 seul » et le test exige `M5` et rien d'autre, sans refus. Les cases d'un arrêt demandé par une personne exigent en plus l'absence de refus et au moins un `0x85`. Ce comportement de « Arrêter la broche » est celui de `db584555`. Dix cases sont ainsi resserrées (E6 : Arrêter, Pause, relâchement et la case broche ; annulation en cours : Arrêter, Pause, relâchement, arrêt et annulation de jog du PC) ; toutes passent.

Dans le même commit, un test de F1 sur le simulateur (`cnc-frame-lunyee.test.js`, L7/L10) est rendu indépendant de la charge : il demandait le cadrage dès le retour au repos après le redémarrage de la carte, alors que la lecture D2 de la nouvelle session pouvait encore tourner ; le serveur refusait alors, à juste titre, par « vérification de l'origine en cours » au lieu de « prise d'origine à refaire ». Vu trois fois pendant cette réunion (deux passages de la suite complète, un passage du fichier seul, sur une douzaine), le code de la réunion ne passant pas par là (il ne touche que la libération de la main). Le test attend maintenant la fin de cette lecture ; le code n'est pas touché.

## 4. Ce qui est laissé, et pourquoi

- **F2 « Pause et dégager » (I-11) : pas réuni.** La quatrième relecture d'Astra (`relectures/astra4-F2.md`) refuse l'installation : deux dangers restent (un nouveau jog autorisé pendant l'arrêt F2 ; une plongée autorisée malgré un sens de broche contraire rapporté). Le code reste sur `feat/F2`. Ses documents sont dans ce dossier, marqués « Non installé ». La Pause ordinaire n'a pas changé.
- **I-23** (reprise après coupure de courant) : mis de côté par l'opérateur, reste au registre.
- Décisions ouvertes des lots, inchangées : F1 D-1 (surveillance renforcée du laser en partie seulement) et `$20=1` exigé (la carte était à `$20=0` le 16 novembre : le cadrage sera refusé tant qu'il n'est pas remis) ; F4 : une macro ou une prise d'origine en cours n'empêche pas de rendre la main ; F16 : le paysage d'un téléphone n'est pas une cible.
- F5 × F10, constat sans correction (première réunion) : si l'ouverture automatique ne répond pas dans les 10 s de F5, la page abandonne et F10 peut recharger alors que le serveur ouvre peut-être encore le port ; la page rechargée fait sa propre et unique tentative, que le serveur refuse. Pas de double ouverture.
- Le bandeau F10 (en bas) recouvre pendant 10 s le fil d'étapes que F16 met en bas sur téléphone ; Pause et Arrêter, en haut, restent libres. Non mesuré par le harnais.
- Remarque de la quatrième relecture sur F1, non « à corriger » : la table des jogs manuels compare, pour les `0x85`, premier instant, nombre et dernier instant, pas chaque octet. C'est maintenant dit dans `SURETE.md` (section F4 et réunion).

## 5. Résultats

Après chaque commit de code, les trois vérifications ont été relancées (le commit de documents ne touche que `design/`) :

| Après | `verify-project.cjs` | Jest (`touch`, `cncengine`, `api`, `grbl-simulator`) | Harnais `--strict --only responsive,strip,e2e,small` (Edge 157 sans tête) |
|---|---|---|---|
| `263748ef` (départ) | 228/228 | 53 suites, 1 561 tests | — |
| `b7471fb7` (fusion F1) | 229/229 | 57 suites, 1 751 tests | vert, 0 violation stricte |
| `e7014407` (interactions) | 230/230 | 57 suites, 1 761 tests (L7/L10 rouge deux fois sur quatre passages, voir § 3) | vert, 0 violation stricte ; étape `small` : 7 variantes CNC × « usinage, main tenue » mesurées |
| `24f68a4e` (table E6) | 230/230 | 57 suites, 1 761 tests, deux passages verts | vert, 0 violation stricte |

ESLint propre sur `src/server/services/touch`, `src/server/api`, `src/server/services/cncengine`, `src/server/lib` et sur les fichiers de harnais et de test touchés. Fins de ligne LF dans l'index (`git ls-files --eol`).

## 6. Ce qui n'est pas vérifié

- **Rien sur la machine ni sur les tablettes.** Toutes les preuves sont logicielles : faux contrôleur, vrai contrôleur CNCjs sur une ligne série simulée, simulateur LUNYEE, Edge sans tête. Ni le Chromium du kiosque, ni la RT (Chromium 106), ni un vrai téléphone, ni un écran 1024 × 600 réel.
- Le freinage réel de la carte, `$J=G90` en coordonnées pièce et l'effet de `0x85` sur la LUNYEE (relecture F1, R1 ouvert) : seul l'essai du § 8 du protocole le dira.
- Étapes du harnais lancées : `responsive`, `strip`, `e2e`, `small`. Pas lancées : `settings`, `screens`, `v2`, `sim`, `startup`, `rail`, `parcours`, `measure` (consigne). La carte « Reconnexion automatique » de Réglages et le bandeau F10 ne sont donc mesurés par aucun navigateur.
- La revue globale de la branche réunie (Astra, Fable) n'est pas faite ; seuls les lots l'ont été, chacun dans son arbre.
- Les phrases anglaises et espagnoles n'ont pas été relues par un locuteur.

## 7. Pour l'opérateur : comment essayer chaque nouveauté

Règle commune : rien n'est installé tant que vous ne l'avez pas décidé. Ensuite, une fonction à la fois, **fraise en l'air, broche débranchée**, main sur l'arrêt d'urgence, et notez ce que vous voyez. Le pas à pas est dans `refonte/PROTOCOLE-ESSAI.md`.

**Cadrer à vide (F1) — à faire en premier, table vide.** Relisez d'abord `$20` dans les réglages de la carte : s'il vaut 0, le bouton reste rayé (« Les limites de course de la machine sont coupées »), c'est voulu ; remettez `$20=1` avant. Table vide, pince **sans fraise**, prise d'origine faite, zéro pièce posé, Z descendu vers −60. Sur 4 · Contrôle, « Cadrer à vide… » : lisez le dialogue (dimensions, durée), cochez, lancez. Z doit monter **seul** jusqu'en haut (Z machine −5), puis X/Y font le tour du rectangle du programme, puis reviennent au-dessus du départ ; **Z ne redescend jamais**. Touchez Arrêter au milieu d'un côté : arrêt en quelques millimètres, pas d'alarme, rien ne repart. Refaites avec Pause : pareil, le cadrage ne reprend pas. Seulement après plusieurs tours réussis à vide : planche bridée, fraise montée, broche toujours débranchée, et regardez si le tour passe loin des brides.

**Rendre la main (F4).** Machine au repos, la tablette a la main : touchez « La main : ici », puis « Rendre la main ». Le bandeau dit « La main : libre » ; le PC ou le téléphone prend la main sans donner de motif. Pendant un usinage lancé en l'air : le bouton est rayé, il dit pourquoi, « Voir l'usinage » ramène à l'écran 5. Lancez un long pas lent en X et rendez la main pendant qu'il roule : le chariot s'arrête net et ne repart pas. Pendant un cadrage à vide : rendre la main l'arrête, la fraise reste en haut.

**Reconnexion automatique (F5).** Connectez une fois la CNC à la main. Fermez le port au repos, puis rouvrez la page du kiosque : la carte se reconnecte seule, une fois (elle redémarre : prise d'origine à refaire, comme d'habitude). Débranchez le câble USB et rechargez : un seul essai, puis le bouton « Connecter la CNC » ; rien ne réessaie tout seul. Dans Réglages → Machine et performances, « Reconnexion automatique » sur Désactivé : au chargement suivant, plus rien ne se connecte seul.

**Rechargement automatique (F10).** Installez une nouvelle version sans toucher la tablette, machine au repos : en moins d'une minute, un bandeau « Nouvelle version : rechargement dans 10 s » apparaît, puis la page se recharge seule. Refaites en touchant « Plus tard » : rien pendant dix minutes. Installez pendant un usinage en l'air, une pause ou un cadrage : aucun bandeau tant que ça bouge ou que c'est en pause.

**Petits écrans (F16).** Ouvrez la page sur un téléphone tenu debout pendant un usinage en l'air : l'état, Pause et Arrêter sont en haut sans faire défiler, le fil des étapes est en bas. Touchez Pause du doigt : la machine s'arrête ; Arrêter aussi. Sur les deux tablettes, rien ne doit avoir changé.

**Pause et dégager (F2) : pas dans cette version.** Le bouton « Pause et dégager… » n'apparaît pas ; la Pause est celle que vous connaissez.
