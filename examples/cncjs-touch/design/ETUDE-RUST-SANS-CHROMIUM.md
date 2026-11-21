# Étude : passer CNCjs Touch en Rust pour se passer de Chromium ? (2026-11-10)

Méthode : mesure sur la Surface Pro, inventaire du code, recherche sur l'état des outils, puis analyse indépendante d'Astra ultra (lecture seule, sans voir mes conclusions). Les deux analyses arrivent à la même conclusion. Rien n'a été modifié ni envoyé à une machine.

## Verdict

**Non à une réécriture complète en Rust, pour l'instant.** Le coût est de 40 à 70 semaines-personne (9 à 16 mois à plein temps), et aucun problème observé n'est causé par Chromium. Les gains seraient faibles sur la Surface Pro et seulement possibles sur la RT.

À la place :
- **Surface Pro (CNC)** : garder Chromium (option A).
- **Surface RT (laser)** : essayer WPE WebKit / Cog, un moteur web embarqué plus léger qui garde le même code (option B), deux ou trois jours d'essai, avec des seuils de décision chiffrés. À faire quand on reprendra la RT.
- **Écran de secours natif minimal** (option D2) : seulement si on a un besoin concret d'une interface qui survive à un plantage du navigateur.

## Ce qui a été mesuré

| | Surface Pro 3 (CNC) | Surface RT (laser) |
|---|---|---|
| Matériel | i5-4300U, 3,8 Go, Debian 13 | Tegra 3 ARMv7, 2 Go, Raspbian |
| Navigateur | Chromium 156, WebGL, v2 Performance | Chromium 106 en `--disable-gpu` (pas de pilote 3D pour le Tegra 3), v1 Éco |
| Mémoire Chromium (2026-11-10) | ≈ 490 Mo réels (PSS), 10 processus, soit 13 % de la RAM | non mesurée ce jour (RT laissée de côté) |
| CPU au repos | ≈ 0 % | historique : 64 à 71 % pendant un suivi rejoué (TESTING.md:152) |
| Stabilité | 53 h sans redémarrage, aucun plantage ni OOM au journal | aucun plantage de Chromium connu |
| Fluidité (PROFILES.md:61) | 59,9 images/s en rotation jusqu'à 160 000 lignes ; Fichiers/Suivi en 76 à 131 ms | layouts jusqu'à 200 à 260 ms sur les écrans denses (TESTING.md:570) |

Les bugs corrigés ces dernières semaines étaient de mise en page, de textes et de logique d'état. Aucun ne venait de Chromium. Une interface native aurait les mêmes classes de bugs à refaire et à retester.

## Ce qu'une réécriture Rust devrait refaire

- **84 fichiers JS (≈ 18 800 lignes), 17 CSS, 2 pages** : 7 écrans principaux et 9 sous-écrans (touch-shell.js:16), verrou, veille, clavier numérique, i18n FR/EN/ES.
- **La logique d'état la plus délicate** : génération du contrôleur, pilote, réponses dans le désordre, commandes sans réponse certaine, confirmations expirées, rapports périmés, Pause/Arrêter gardés pendant une perte du suivi (job-controls.js:54, :64 ; performance-v2-contract.js:5). Rust aide à structurer ces règles, il ne les écrit pas.
- **Le rendu des parcours** : un petit moteur WebGL de lignes (preview-gl.js ; pas de Three.js), des vues fixes en Canvas 2D, une vue laser logicielle 960 × 540 (laser-view.js), 5 Web Workers. Slint fournit des widgets, pas ce moteur.
- **Les tests** : 176 scripts (≈ 18 700 lignes) valident le code JS, pas un client Rust. Le harnais strict (2 700 lignes) vérifie les rectangles réellement rendus : cibles de 64/48/96 px, texte ≥ 16 px, rognage, contraste. Il faudrait le réinventer. C'est justement lui qui a trouvé la plupart des défauts récents.
- **Le déploiement** : aujourd'hui, une copie de fichiers et un rechargement. Demain, une compilation pour x86_64 et ARMv7, des binaires versionnés et leurs dépendances.

Ce qui resterait : le serveur Node et ses gardes de sécurité (≈ 8 100 lignes, 931 tests), le protocole HTTP/NDJSON, les catalogues de traduction comme données.

### Estimation (hypothèses d'Astra, cohérentes avec mon inventaire)

| Lot | Semaines-personne |
|---|---:|
| Fondation Slint, Linux, construction sur deux architectures | 3–5 |
| HTTP/NDJSON, authentification, état, tickets, reconnexion | 4–6 |
| Écrans (fichiers, préparation, palpage, réglages, journal, simulation) | 8–13 |
| Rendu des parcours, gestes, inspection, suivi | 7–12 |
| Traductions et messages serveur | 1–2 |
| Tests client et nouveau harnais graphique | 5–8 |
| Qualification tactile, veille, endurance sur les tablettes | 3–5 |
| **Total avec aléas** | **40–70** |

## Les options comparées

| Option | Coût | Risque machine | Risque de régression | Gain défendable |
|---|---:|---|---|---|
| **A. Garder Chromium, corriger le code** | 1–3 s-p par lot | faible | faible (harnais actuel) | déjà prouvé sur la RT : −10 % CPU, −20 % layout par corrections applicatives (TESTING.md:152-169) |
| **B. WPE/Cog, même interface** | essai 2–5 jours ; 2–5 s-p si compatible | faible à modéré (tactile à requalifier) | modéré (le harnais pilote Chromium par CDP, pas WPE) | moteur plus léger (binaire ≈ 75 Mo contre 272 Mo) ; mémoire réelle à mesurer |
| **C. Rust/Slint complet** | 40–70 s-p | élevé pendant la transition | élevé, sur tout le produit | mémoire plausible en baisse ; stabilité supérieure non démontrée ; pas de GPU en plus sur la RT |
| **D1. Rust pour la seule RT** | 18–30 s-p | modéré à élevé | élevé, deux interfaces à maintenir | optimisation propre à la RT |
| **D2. Écran de secours natif minimal** | prototype 1–2 s-p ; qualifié 3–6 s-p | faible en consultation | limité | indépendant d'un plantage de Chromium. Ce n'est pas un arrêt d'urgence : il partage CNCjs et la liaison. |

Si un jour on fait du natif, **Slint** est le meilleur candidat : backend LinuxKMS sans X ni Wayland, rendu logiciel (adapté au Tegra 3 sans GPU), tactile par libinput, licence GPLv3 ou royalty-free. Mais la construction ARMv7 et le tactile de la RT restent à prouver.

Dans toutes les options, les gardes de sécurité restent au serveur (job-service.js:515, :1455, :1613). Une interface native reste un client de ces API. Les gardes ne protègent pourtant pas d'une interface qui afficherait le mauvais fichier ou viserait le mauvais contrôleur : c'est le risque principal d'une réécriture.

## L'essai à faire avant toute décision (RT, quand on la reprendra)

- **Quoi** : Chromium 106 contre WPE/Cog, même page v1 Éco laser, états rejoués localement, sans contrôleur. Passages alternés A/B/A/B après échauffement.
- **Mesures** : mémoire réelle (PSS) de tous les processus ; CPU au repos et pendant un suivi à cadence identique ; latence p95 du toucher à l'affichage ; ouverture des écrans ; rognage, cibles, langues, texte agrandi ; perte et reprise du flux ; puis 24 h d'endurance si c'est concluant. Mesurer le CPU sans `?perf=1`, qui le fausse (TESTING.md:152).
- **On retient WPE si** : au moins 30 % de mémoire en moins et 100 Mo libérés, ou 25 % de CPU en moins ; latence p95 dégradée de 10 % au plus ; aucune régression sur les commandes, les états périmés et les confirmations ; aucun plantage en 24 h.
- **On arrête si** : l'affichage logiciel ou le tactile ne marche pas vite sur la RT. Cet échec ne rendrait pas pour autant une réécriture rentable.
- Bonus : la RT tourne sur un Chromium 106 qui ne reçoit plus de correctifs ; un WPE récent réglerait aussi ce point.

## Ce qui ferait changer la recommandation

- Des plantages ou blocages **attribués au moteur et reproduits** sur une tablette.
- Une pression mémoire qui gêne réellement (aujourd'hui : 13 % de la RAM sur la Pro).
- Un prototype natif **représentatif** (pas un écran vide) qui montre un gain important sur la tablette cible.

## Sources

- Mesures Surface Pro : `ps`, `/proc/*/smaps_rollup`, `journalctl`, 2026-11-10 ; historiques : `PROFILES.md`, `TESTING.md`.
- Analyse indépendante : Astra ultra (Codex, lecture seule), brief et réponse dans le dossier de travail de la session.
- [Slint, backend LinuxKMS](https://docs.slint.dev/latest/docs/slint/guide/backends-and-renderers/backend_linuxkms/) · [Slint, plateformes embarquées](https://docs.slint.dev/latest/docs/slint/guide/platforms/embedded/) · [Comparaison egui / iced / Slint (2026)](https://www.pistack.xyz/posts/2026-08-25-rust-gui-frameworks-egui-iced-slint-comparison/) · [Comparaison de navigateurs embarqués (Avnet)](https://embedded.avnet.com/simple/latest/sources/simplecore-distro/docs/simplecore-distro/appnotes/browser-comparison.html) · [WPE WebKit](https://wpewebkit.org/about/what-is-embedded.html) · [Cog sur Raspberry Pi 4](https://lists.webkit.org/pipermail/webkit-wpe/2024-February/000638.html)
