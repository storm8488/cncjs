# Touch interface — browser harness report

**Measured on a development PC with a recent headless Chrome/156.0.8078.74 (win32 10.0.26300, Node v26.13.0), not on the Surface RT (Chromium 106, Tegra 3, --disable-gpu).** Pixel sizes are comparable; timings and memory are not.

- Date: 2026-11-03T16:08:38.439Z  
- Commit: b4e26f4c  
- Pages: http://127.0.0.1:44042/index.html and http://127.0.0.1:44042/simulation.html  
- Goals (design tokens, not WCAG): primary 64 px, secondary 48 px, jog cross 96 px, gaps 12 px, text ≥ 16 px.
- Harness steps failed: 2
  - layout text: 1920x1080 · Réglages · Au repos uniquement. Mesure l’écran et deux tracés courts, s — 13 px, goal 16
  - layout text: 960x1440 portrait · Réglages · Au repos uniquement. Mesure l’écran et deux tracés courts, s — 13 px, goal 16

## Tap targets — 1366x768 (`1366x768/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Menu | 1 | 16 | 0 | 0 / 0 | 16–16–18 | 0 | 0 | 0 | no |
| Suivi | 1 | 25 | 0 | 0 / 0 | 16–18–24 | 0 | 0 | 0 | no |
| Fichiers | 1 | 34 | 0 | 0 / 0 | 16–16–24 | 9 | 0 | 0 | no |
| Préparer | 1 | 28 | 0 | 0 / 0 | 16–18–28 | 3 | 0 | 0 | no |
| Machine | 1 | 18 | 0 | 0 / 0 | 16–17–20 | 0 | 0 | 0 | no |
| Journal | 1 | 19 | 0 | 0 / 0 | 16–18–18 | 6 | 0 | 0 | no |
| Réglages | 1 | 19 | 0 | 0 / 0 | 16–18–21 | 4 | 0 | 0 | no |

Gaps under 12 px (touching segmented buttons included):

| Screen | Label | Gap px | Neighbour |
| --- | --- | ---: | --- |
| Fichiers | 2D | 0 | Iso |
| Fichiers | Iso | 0 | 2D |
| Fichiers | Face | 0 | Iso |
| Fichiers | Côté | 0 | Face |
| Fichiers | Dessus | 0 | Côté |
| Fichiers | Exporter l’aperçu | 8 | Importer un aperçu… |
| Fichiers | Importer un aperçu… | 8 | Exporter l’aperçu |
| Fichiers | ☆ Favori | 8 | Ouvrir la fiche |
| Fichiers | Ouvrir la fiche | 8 | ☆ Favori |
| Préparer | 0.1 | 3 | 1 |
| Préparer | 1 | 3 | 0.1 |
| Préparer | 10 | 3 | 1 |
| Journal | Tout | 0 | Erreurs |
| Journal | Erreurs | 0 | Tout |
| Journal | Travaux | 0 | Erreurs |
| Journal | Alarmes | 0 | Travaux |
| Journal | Cette session | 0 | Serveur |
| Journal | Serveur | 0 | Cette session |
| Réglages | Affichage | 10 | Système |
| Réglages | Système | 10 | Affichage |
| Réglages | Ouvrir le SuiviActivé | 6 | Verrouiller l’écranDésactivé |
| Réglages | Verrouiller l’écranDésactivé | 6 | Ouvrir le SuiviActivé |

## Tap targets — 1366x768 texte agrandi (`1366x768-large/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Menu | 1 | 17 | 0 | 0 / 0 | 16–16–18 | 0 | 0 | 0 | no |
| Suivi | 1 | 32 | 0 | 0 / 0 | 16–18–27 | 5 | 0 | 0 | no |
| Fichiers | 1 | 34 | 0 | 0 / 0 | 16–18–27 | 9 | 0 | 0 | no |
| Préparer | 1 | 28 | 0 | 0 / 0 | 16–20–31 | 3 | 0 | 0 | no |
| Machine | 1 | 18 | 0 | 0 / 0 | 16–17–22 | 0 | 0 | 0 | no |
| Journal | 1 | 19 | 0 | 0 / 0 | 16–18–20 | 6 | 0 | 0 | no |
| Réglages | 1 | 19 | 0 | 0 / 0 | 16–18–21 | 4 | 0 | 0 | no |

Gaps under 12 px (touching segmented buttons included):

| Screen | Label | Gap px | Neighbour |
| --- | --- | ---: | --- |
| Suivi | 2D | 0 | Iso |
| Suivi | Iso | 0 | 2D |
| Suivi | Face | 0 | Iso |
| Suivi | Côté | 0 | Face |
| Suivi | Dessus | 0 | Côté |
| Fichiers | 2D | 0 | Iso |
| Fichiers | Iso | 0 | 2D |
| Fichiers | Face | 0 | Iso |
| Fichiers | Côté | 0 | Face |
| Fichiers | Dessus | 0 | Côté |
| Fichiers | Exporter l’aperçu | 8 | Importer un aperçu… |
| Fichiers | Importer un aperçu… | 8 | Exporter l’aperçu |
| Fichiers | ☆ Favori | 8 | Ouvrir la fiche |
| Fichiers | Ouvrir la fiche | 8 | ☆ Favori |
| Préparer | 0.1 | 3 | 1 |
| Préparer | 1 | 3 | 0.1 |
| Préparer | 10 | 3 | 1 |
| Journal | Tout | 0 | Erreurs |
| Journal | Erreurs | 0 | Tout |
| Journal | Travaux | 0 | Erreurs |
| Journal | Alarmes | 0 | Travaux |
| Journal | Cette session | 0 | Serveur |
| Journal | Serveur | 0 | Cette session |
| Réglages | Affichage | 10 | Système |
| Réglages | Système | 10 | Affichage |
| Réglages | Ouvrir le SuiviActivé | 6 | Verrouiller l’écranDésactivé |
| Réglages | Verrouiller l’écranDésactivé | 6 | Ouvrir le SuiviActivé |

## Tap targets — 1024x600 (`1024x600/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Menu | 1 | 17 | 0 | 0 / 0 | 16–16–18 | 0 | 0 | 0 | no |
| Suivi | 1 | 25 | 0 | 0 / 0 | 16–18–24 | 13 | 0 | 0 | no |
| Fichiers | 1 | 28 | 0 | 0 / 0 | 16–16–24 | 11 | 0 | 0 | no |
| Préparer | 1 | 28 | 0 | 0 / 0 | 16–18–28 | 8 | 0 | 0 | no |
| Machine | 1 | 18 | 0 | 0 / 0 | 16–16–18 | 0 | 0 | 0 | no |
| Journal | 1 | 19 | 0 | 0 / 0 | 16–18–18 | 6 | 0 | 0 | no |
| Réglages | 1 | 17 | 0 | 0 / 0 | 16–16–21 | 4 | 1 | 0 | no |

Gaps under 12 px (touching segmented buttons included):

| Screen | Label | Gap px | Neighbour |
| --- | --- | ---: | --- |
| Suivi | −10 % | 8 | 100 % |
| Suivi | 100 % | 8 | −10 % |
| Suivi | +10 % | 8 | 100 % |
| Suivi | −1 % | 3.5 | +1 % |
| Suivi | +1 % | 3.5 | −1 % |
| Suivi | −10 % | 8 | 100 % |
| Suivi | 100 % | 8 | −10 % |
| Suivi | +10 % | 8 | 100 % |
| Suivi | −1 % | 3.5 | +1 % |
| Suivi | +1 % | 3.5 | −1 % |
| Suivi | 25 % | 8 | 50 % |
| Suivi | 50 % | 8 | 25 % |
| Suivi | 100 % | 8 | 50 % |
| Fichiers | ↻ Actualiser | 8 | Nom, matière, outil, notes… |
| Fichiers | Nom, matière, outil, notes… | 8 | ↻ Actualiser |
| Fichiers | ★ Favoris seulement | 8 | ＋ Ajouter un fichier |
| Fichiers | ＋ Ajouter un fichier | 8 | ★ Favoris seulement |
| Fichiers | Exporter l’aperçu | 8 | Importer un aperçu… |
| Fichiers | Importer un aperçu… | 8 | Exporter l’aperçu |
| Fichiers | ☆ Favori | 8 | Dimensions XY |
| Fichiers | Ouvrir la fiche | 8 | Détails de l’aperçu |
| Fichiers | Dimensions XY | 8 | ☆ Favori |
| Fichiers | Détails de l’aperçu | 8 | ☆ Favori |
| Fichiers | Ouvrir le suivi → | 8 | Ouvrir la fiche |
| Préparer | Zéro X | 1 | Zéro Y |
| Préparer | Zéro Y | 1 | Zéro X |
| Préparer | Zéro Z | 1 | Zéro Y |
| Préparer | 0.1 | 3 | 1 |
| Préparer | 1 | 3 | 0.1 |
| Préparer | 10 | 3 | 1 |
| Préparer | Zéro XYZ | 10.6 | 0.1 |
| Préparer | Vitesse du test… | 10.6 | 0.1 |
| Journal | Tout | 0 | Erreurs |
| Journal | Erreurs | 0 | Tout |
| Journal | Travaux | 0 | Erreurs |
| Journal | Alarmes | 0 | Travaux |
| Journal | Cette session | 0 | Serveur |
| Journal | Serveur | 0 | Cette session |
| Réglages | Affichage | 10 | Système |
| Réglages | Système | 10 | Affichage |
| Réglages | Ouvrir le SuiviActivé | 6 | Verrouiller l’écranDésactivé |
| Réglages | Verrouiller l’écranDésactivé | 6 | Ouvrir le SuiviActivé |

Targets whose centre is covered by another element:

| Screen | Label | Element hit at centre |
| --- | --- | --- |
| Réglages | Verrouiller l’écranDésactivé | nothing |

## Tap targets — 1024x600 texte agrandi (`1024x600-large/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Menu | 1 | 17 | 0 | 0 / 0 | 16–16–18 | 0 | 0 | 0 | no |
| Suivi | 1 | 32 | 0 | 0 / 0 | 16–18–27 | 19 | 0 | 1 | no |
| Fichiers | 1 | 28 | 0 | 0 / 0 | 16–18–27 | 11 | 0 | 0 | no |
| Préparer | 1 | 28 | 0 | 0 / 0 | 16–20–31 | 6 | 0 | 0 | no |
| Machine | 1 | 18 | 0 | 0 / 0 | 16–17–20 | 0 | 0 | 0 | no |
| Journal | 1 | 19 | 0 | 0 / 0 | 16–18–20 | 6 | 0 | 0 | no |
| Réglages | 1 | 17 | 0 | 0 / 0 | 16–16–21 | 4 | 1 | 0 | no |

Gaps under 12 px (touching segmented buttons included):

| Screen | Label | Gap px | Neighbour |
| --- | --- | ---: | --- |
| Suivi | Agrandir le tracé | 0 | Dessus |
| Suivi | 2D | 0 | Iso |
| Suivi | Iso | 0 | 2D |
| Suivi | Face | 0 | Iso |
| Suivi | Côté | 0 | Face |
| Suivi | Dessus | 0 | Agrandir le tracé |
| Suivi | −10 % | 8 | 100 % |
| Suivi | 100 % | 8 | −10 % |
| Suivi | +10 % | 8 | 100 % |
| Suivi | −1 % | 3.5 | +1 % |
| Suivi | +1 % | 3.5 | −1 % |
| Suivi | −10 % | 8 | 100 % |
| Suivi | 100 % | 8 | −10 % |
| Suivi | +10 % | 8 | 100 % |
| Suivi | −1 % | 3.5 | +1 % |
| Suivi | +1 % | 3.5 | −1 % |
| Suivi | 25 % | 8 | 50 % |
| Suivi | 50 % | 8 | 25 % |
| Suivi | 100 % | 8 | 50 % |
| Fichiers | ↻ Actualiser | 8 | Nom, matière, outil, notes… |
| Fichiers | Nom, matière, outil, notes… | 8 | ↻ Actualiser |
| Fichiers | ★ Favoris seulement | 8 | ＋ Ajouter un fichier |
| Fichiers | ＋ Ajouter un fichier | 8 | ★ Favoris seulement |
| Fichiers | Exporter l’aperçu | 8 | Importer un aperçu… |
| Fichiers | Importer un aperçu… | 8 | Exporter l’aperçu |
| Fichiers | ☆ Favori | 8 | Dimensions XY |
| Fichiers | Ouvrir la fiche | 8 | Détails de l’aperçu |
| Fichiers | Dimensions XY | 8 | ☆ Favori |
| Fichiers | Détails de l’aperçu | 8 | ☆ Favori |
| Fichiers | Ouvrir le suivi → | 8 | Ouvrir la fiche |
| Préparer | Zéro X | 1 | Zéro Y |
| Préparer | Zéro Y | 1 | Zéro X |
| Préparer | Zéro Z | 1 | Zéro Y |
| Préparer | 0.1 | 3 | 1 |
| Préparer | 1 | 3 | 0.1 |
| Préparer | 10 | 3 | 1 |
| Journal | Tout | 0 | Erreurs |
| Journal | Erreurs | 0 | Tout |
| Journal | Travaux | 0 | Erreurs |
| Journal | Alarmes | 0 | Travaux |
| Journal | Cette session | 0 | Serveur |
| Journal | Serveur | 0 | Cette session |
| Réglages | Affichage | 10 | Système |
| Réglages | Système | 10 | Affichage |
| Réglages | Ouvrir le SuiviActivé | 6 | Verrouiller l’écranDésactivé |
| Réglages | Verrouiller l’écranDésactivé | 6 | Ouvrir le SuiviActivé |

Targets whose centre is covered by another element:

| Screen | Label | Element hit at centre |
| --- | --- | --- |
| Réglages | Verrouiller l’écranDésactivé | nothing |

Text wider than its box (scrollWidth > clientWidth, overflow not visible):

| Screen | Text | Widths | text-overflow |
| --- | --- | --- | --- |
| Suivi | Selon les mouvements (sans accélérations) : ≈ 4 min | 459 > 355 | ellipsis |

## Tap targets — 1366x768 zoom 200 % (683x384 @2) (`1366x768-zoom200/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Menu | 1 | 14 | 0 | 0 / 0 | 16–16–28 | 7 | 2 | 0 | no |
| Suivi | 1 | 10 | 0 | 0 / 0 | 16–16–24 | 7 | 0 | 0 | no |
| Fichiers | 1 | 15 | 0 | 0 / 0 | 16–16–20 | 7 | 0 | 0 | no |
| Préparer | 1 | 13 | 0 | 0 / 0 | 16–16–18 | 7 | 0 | 0 | no |
| Machine | 1 | 16 | 0 | 0 / 0 | 16–16–18 | 7 | 3 | 0 | no |
| Journal | 1 | 16 | 0 | 0 / 0 | 16–17–18 | 13 | 0 | 0 | no |
| Réglages | 1 | 13 | 0 | 0 / 0 | 16–16–21 | 7 | 0 | 0 | no |

Gaps under 12 px (touching segmented buttons included):

| Screen | Label | Gap px | Neighbour |
| --- | --- | ---: | --- |
| Menu | Menu | 4 | Préparer |
| Menu | Préparer | 4 | Menu |
| Menu | Fichiers | 4 | Préparer |
| Menu | Suivi | 4 | Fichiers |
| Menu | Machine | 4 | Suivi |
| Menu | Journal | 4 | Machine |
| Menu | Réglages | 4 | Journal |
| Suivi | Menu | 4 | Préparer |
| Suivi | Préparer | 4 | Menu |
| Suivi | Fichiers | 4 | Préparer |
| Suivi | Suivi | 4 | Fichiers |
| Suivi | Machine | 4 | Suivi |
| Suivi | Journal | 4 | Machine |
| Suivi | Réglages | 4 | Journal |
| Fichiers | Menu | 4 | Préparer |
| Fichiers | Préparer | 4 | Menu |
| Fichiers | Fichiers | 4 | Préparer |
| Fichiers | Suivi | 4 | Fichiers |
| Fichiers | Machine | 4 | Suivi |
| Fichiers | Journal | 4 | Machine |
| Fichiers | Réglages | 4 | Journal |
| Préparer | Menu | 4 | Préparer |
| Préparer | Préparer | 4 | Menu |
| Préparer | Fichiers | 4 | Préparer |
| Préparer | Suivi | 4 | Fichiers |
| Préparer | Machine | 4 | Suivi |
| Préparer | Journal | 4 | Machine |
| Préparer | Réglages | 4 | Journal |
| Machine | Menu | 4 | Préparer |
| Machine | Préparer | 4 | Menu |
| Machine | Fichiers | 4 | Préparer |
| Machine | Suivi | 4 | Fichiers |
| Machine | Machine | 4 | Suivi |
| Machine | Journal | 4 | Machine |
| Machine | Réglages | 4 | Journal |
| Journal | Tout | 0 | Erreurs |
| Journal | Erreurs | 0 | Tout |
| Journal | Travaux | 0 | Erreurs |
| Journal | Alarmes | 0 | Travaux |
| Journal | Cette session | 0 | Serveur |
| Journal | Serveur | 0 | Cette session |
| Journal | Menu | 4 | Préparer |
| Journal | Préparer | 4 | Menu |
| Journal | Fichiers | 4 | Préparer |
| Journal | Suivi | 4 | Fichiers |
| Journal | Machine | 4 | Suivi |
| Journal | Journal | 4 | Machine |
| Journal | Réglages | 4 | Journal |
| Réglages | Menu | 4 | Préparer |
| Réglages | Préparer | 4 | Menu |
| Réglages | Fichiers | 4 | Préparer |
| Réglages | Suivi | 4 | Fichiers |
| Réglages | Machine | 4 | Suivi |
| Réglages | Journal | 4 | Machine |
| Réglages | Réglages | 4 | Journal |

Targets whose centre is covered by another element:

| Screen | Label | Element hit at centre |
| --- | --- | --- |
| Menu | PréparerDéplacer · Origine · PalpageBloqué : alarme | nothing |
| Menu | MachineÉtat et limitesAlarme | nothing |
| Machine | Ouvrir le suivi → | nothing |
| Machine | Réglages d’affichage → | nothing |
| Machine | Limites de la machine → | nothing |

## Tap targets — 1366x768 default font 200 % (Page.setFontSizes 32) (`1366x768-font200/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Menu | 1 | 17 | 0 | 0 / 0 | 16–16–18 | 0 | 0 | 0 | no |
| Suivi | 1 | 14 | 0 | 0 / 0 | 16–16–24 | 0 | 0 | 0 | no |
| Fichiers | 1 | 34 | 0 | 0 / 0 | 16–16–24 | 9 | 0 | 0 | no |
| Préparer | 1 | 28 | 0 | 0 / 0 | 16–18–28 | 3 | 0 | 0 | no |
| Machine | 1 | 18 | 0 | 0 / 0 | 16–17–20 | 0 | 0 | 0 | no |
| Journal | 1 | 19 | 0 | 0 / 0 | 16–18–18 | 6 | 0 | 0 | no |
| Réglages | 1 | 19 | 0 | 0 / 0 | 16–18–21 | 4 | 0 | 0 | no |

Gaps under 12 px (touching segmented buttons included):

| Screen | Label | Gap px | Neighbour |
| --- | --- | ---: | --- |
| Fichiers | 2D | 0 | Iso |
| Fichiers | Iso | 0 | 2D |
| Fichiers | Face | 0 | Iso |
| Fichiers | Côté | 0 | Face |
| Fichiers | Dessus | 0 | Côté |
| Fichiers | Exporter l’aperçu | 8 | Importer un aperçu… |
| Fichiers | Importer un aperçu… | 8 | Exporter l’aperçu |
| Fichiers | ☆ Favori | 8 | Ouvrir la fiche |
| Fichiers | Ouvrir la fiche | 8 | ☆ Favori |
| Préparer | 0.1 | 3 | 1 |
| Préparer | 1 | 3 | 0.1 |
| Préparer | 10 | 3 | 1 |
| Journal | Tout | 0 | Erreurs |
| Journal | Erreurs | 0 | Tout |
| Journal | Travaux | 0 | Erreurs |
| Journal | Alarmes | 0 | Travaux |
| Journal | Cette session | 0 | Serveur |
| Journal | Serveur | 0 | Cette session |
| Réglages | Affichage | 10 | Système |
| Réglages | Système | 10 | Affichage |
| Réglages | Ouvrir le SuiviActivé | 6 | Verrouiller l’écranDésactivé |
| Réglages | Verrouiller l’écranDésactivé | 6 | Ouvrir le SuiviActivé |

## Tap targets — 1440x960 (`responsive-1440x960/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Menu | 1 | 17 | 0 | 0 / 0 | 16–16–18 | 0 | 0 | 0 | no |
| Suivi | 1 | 14 | 0 | 0 / 0 | 16–16–24 | 0 | 0 | 0 | no |
| Fichiers | 1 | 34 | 0 | 0 / 0 | 16–16–24 | 9 | 0 | 0 | no |
| Préparer | 1 | 28 | 0 | 0 / 0 | 16–18–28 | 3 | 0 | 0 | no |
| Machine | 1 | 18 | 0 | 0 / 0 | 16–17–20 | 0 | 0 | 0 | no |
| Journal | 1 | 19 | 0 | 0 / 0 | 16–18–18 | 6 | 0 | 0 | no |
| Réglages | 1 | 21 | 0 | 0 / 0 | 16–18–21 | 4 | 0 | 0 | no |

Gaps under 12 px (touching segmented buttons included):

| Screen | Label | Gap px | Neighbour |
| --- | --- | ---: | --- |
| Fichiers | 2D | 0 | Iso |
| Fichiers | Iso | 0 | 2D |
| Fichiers | Face | 0 | Iso |
| Fichiers | Côté | 0 | Face |
| Fichiers | Dessus | 0 | Côté |
| Fichiers | Exporter l’aperçu | 8 | Importer un aperçu… |
| Fichiers | Importer un aperçu… | 8 | Exporter l’aperçu |
| Fichiers | ☆ Favori | 8 | Ouvrir la fiche |
| Fichiers | Ouvrir la fiche | 8 | ☆ Favori |
| Préparer | 0.1 | 3 | 1 |
| Préparer | 1 | 3 | 0.1 |
| Préparer | 10 | 3 | 1 |
| Journal | Tout | 0 | Erreurs |
| Journal | Erreurs | 0 | Tout |
| Journal | Travaux | 0 | Erreurs |
| Journal | Alarmes | 0 | Travaux |
| Journal | Cette session | 0 | Serveur |
| Journal | Serveur | 0 | Cette session |
| Réglages | Affichage | 10 | Système |
| Réglages | Système | 10 | Affichage |
| Réglages | Ouvrir le SuiviActivé | 6 | Verrouiller l’écranDésactivé |
| Réglages | Verrouiller l’écranDésactivé | 6 | Ouvrir le SuiviActivé |

## Tap targets — 1080x720 (`responsive-1080x720/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Menu | 1 | 17 | 0 | 0 / 0 | 16–16–18 | 0 | 0 | 0 | no |
| Suivi | 1 | 14 | 0 | 0 / 0 | 16–16–24 | 0 | 0 | 0 | no |
| Fichiers | 1 | 28 | 0 | 0 / 0 | 16–16–24 | 11 | 0 | 0 | no |
| Préparer | 1 | 28 | 0 | 0 / 0 | 16–18–28 | 8 | 0 | 0 | no |
| Machine | 1 | 18 | 0 | 0 / 0 | 16–16–18 | 0 | 0 | 0 | no |
| Journal | 1 | 19 | 0 | 0 / 0 | 16–18–18 | 6 | 0 | 0 | no |
| Réglages | 1 | 19 | 0 | 0 / 0 | 16–18–21 | 4 | 2 | 0 | no |

Gaps under 12 px (touching segmented buttons included):

| Screen | Label | Gap px | Neighbour |
| --- | --- | ---: | --- |
| Fichiers | ↻ Actualiser | 8 | Nom, matière, outil, notes… |
| Fichiers | Nom, matière, outil, notes… | 8 | ↻ Actualiser |
| Fichiers | ★ Favoris seulement | 8 | ＋ Ajouter un fichier |
| Fichiers | ＋ Ajouter un fichier | 8 | ★ Favoris seulement |
| Fichiers | Exporter l’aperçu | 8 | Importer un aperçu… |
| Fichiers | Importer un aperçu… | 8 | Exporter l’aperçu |
| Fichiers | ☆ Favori | 8 | Dimensions XY |
| Fichiers | Ouvrir la fiche | 8 | Détails de l’aperçu |
| Fichiers | Dimensions XY | 8 | ☆ Favori |
| Fichiers | Détails de l’aperçu | 8 | ☆ Favori |
| Fichiers | Ouvrir le suivi → | 8 | Ouvrir la fiche |
| Préparer | Zéro X | 1 | Zéro Y |
| Préparer | Zéro Y | 1 | Zéro X |
| Préparer | Zéro Z | 1 | Zéro Y |
| Préparer | 0.1 | 3 | 1 |
| Préparer | 1 | 3 | 0.1 |
| Préparer | 10 | 3 | 1 |
| Préparer | Zéro XYZ | 10.6 | 0.1 |
| Préparer | Vitesse du test… | 10.6 | 0.1 |
| Journal | Tout | 0 | Erreurs |
| Journal | Erreurs | 0 | Tout |
| Journal | Travaux | 0 | Erreurs |
| Journal | Alarmes | 0 | Travaux |
| Journal | Cette session | 0 | Serveur |
| Journal | Serveur | 0 | Cette session |
| Réglages | Affichage | 10 | Système |
| Réglages | Système | 10 | Affichage |
| Réglages | Ouvrir le SuiviActivé | 6 | Verrouiller l’écranDésactivé |
| Réglages | Verrouiller l’écranDésactivé | 6 | Ouvrir le SuiviActivé |

Targets whose centre is covered by another element:

| Screen | Label | Element hit at centre |
| --- | --- | --- |
| Réglages | CNC | nothing |
| Réglages | Laser | nothing |

## Tap targets — 1280x800 (`responsive-1280x800/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Menu | 1 | 17 | 0 | 0 / 0 | 16–16–18 | 0 | 0 | 0 | no |
| Suivi | 1 | 25 | 0 | 0 / 0 | 16–18–24 | 0 | 0 | 0 | no |
| Fichiers | 1 | 34 | 0 | 0 / 0 | 16–16–24 | 9 | 0 | 0 | no |
| Préparer | 1 | 28 | 0 | 0 / 0 | 16–18–28 | 3 | 0 | 0 | no |
| Machine | 1 | 18 | 0 | 0 / 0 | 16–17–20 | 0 | 0 | 0 | no |
| Journal | 1 | 19 | 0 | 0 / 0 | 16–18–18 | 6 | 0 | 0 | no |
| Réglages | 1 | 19 | 0 | 0 / 0 | 16–18–21 | 4 | 0 | 0 | no |

Gaps under 12 px (touching segmented buttons included):

| Screen | Label | Gap px | Neighbour |
| --- | --- | ---: | --- |
| Fichiers | 2D | 0 | Iso |
| Fichiers | Iso | 0 | 2D |
| Fichiers | Face | 0 | Iso |
| Fichiers | Côté | 0 | Face |
| Fichiers | Dessus | 0 | Côté |
| Fichiers | Exporter l’aperçu | 8 | Importer un aperçu… |
| Fichiers | Importer un aperçu… | 8 | Exporter l’aperçu |
| Fichiers | ☆ Favori | 8 | Ouvrir la fiche |
| Fichiers | Ouvrir la fiche | 8 | ☆ Favori |
| Préparer | 0.1 | 3 | 1 |
| Préparer | 1 | 3 | 0.1 |
| Préparer | 10 | 3 | 1 |
| Journal | Tout | 0 | Erreurs |
| Journal | Erreurs | 0 | Tout |
| Journal | Travaux | 0 | Erreurs |
| Journal | Alarmes | 0 | Travaux |
| Journal | Cette session | 0 | Serveur |
| Journal | Serveur | 0 | Cette session |
| Réglages | Affichage | 10 | Système |
| Réglages | Système | 10 | Affichage |
| Réglages | Ouvrir le SuiviActivé | 6 | Verrouiller l’écranDésactivé |
| Réglages | Verrouiller l’écranDésactivé | 6 | Ouvrir le SuiviActivé |

## Tap targets — 1920x1080 (`responsive-1920x1080/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Menu | 1 | 17 | 0 | 0 / 0 | 16–16–18 | 0 | 0 | 0 | no |
| Suivi | 1 | 25 | 0 | 0 / 0 | 16–18–24 | 0 | 0 | 0 | no |
| Fichiers | 1 | 34 | 0 | 0 / 0 | 16–16–24 | 9 | 0 | 0 | no |
| Préparer | 1 | 28 | 0 | 0 / 0 | 16–18–28 | 3 | 0 | 0 | no |
| Machine | 1 | 18 | 0 | 0 / 0 | 16–17–20 | 0 | 0 | 0 | no |
| Journal | 1 | 19 | 0 | 0 / 0 | 16–18–18 | 6 | 0 | 0 | no |
| Réglages | 1 | 22 | 0 | 0 / 1 | 16–18–21 | 4 | 0 | 0 | no |

Visible text under 16 px (rendered size, screen scale applied):

| Screen | Text | Font px |
| --- | --- | ---: |
| Réglages | Au repos uniquement. Mesure l’écran et deux tracés courts, s | 13 |

Gaps under 12 px (touching segmented buttons included):

| Screen | Label | Gap px | Neighbour |
| --- | --- | ---: | --- |
| Fichiers | 2D | 0 | Iso |
| Fichiers | Iso | 0 | 2D |
| Fichiers | Face | 0 | Iso |
| Fichiers | Côté | 0 | Face |
| Fichiers | Dessus | 0 | Côté |
| Fichiers | Exporter l’aperçu | 8 | Importer un aperçu… |
| Fichiers | Importer un aperçu… | 8 | Exporter l’aperçu |
| Fichiers | ☆ Favori | 8 | Ouvrir la fiche |
| Fichiers | Ouvrir la fiche | 8 | ☆ Favori |
| Préparer | 0.1 | 3 | 1 |
| Préparer | 1 | 3 | 0.1 |
| Préparer | 10 | 3 | 1 |
| Journal | Tout | 0 | Erreurs |
| Journal | Erreurs | 0 | Tout |
| Journal | Travaux | 0 | Erreurs |
| Journal | Alarmes | 0 | Travaux |
| Journal | Cette session | 0 | Serveur |
| Journal | Serveur | 0 | Cette session |
| Réglages | Affichage | 10 | Système |
| Réglages | Système | 10 | Affichage |
| Réglages | Ouvrir le SuiviActivé | 6 | Verrouiller l’écranDésactivé |
| Réglages | Verrouiller l’écranDésactivé | 6 | Ouvrir le SuiviActivé |

## Tap targets — 720x1080 portrait (`responsive-720x1080-portrait/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Menu | 1 | 16 | 0 | 0 / 0 | 16–16–18 | 7 | 0 | 0 | no |
| Suivi | 1 | 16 | 0 | 0 / 0 | 16–16–24 | 12 | 5 | 0 | no |
| Fichiers | 1 | 17 | 0 | 0 / 0 | 16–16–20 | 13 | 0 | 0 | no |
| Préparer | 1 | 27 | 0 | 0 / 0 | 16–18–28 | 16 | 0 | 0 | no |
| Machine | 1 | 17 | 0 | 0 / 0 | 16–16–18 | 7 | 0 | 0 | no |
| Journal | 1 | 18 | 0 | 0 / 0 | 16–18–18 | 13 | 0 | 0 | no |
| Réglages | 1 | 18 | 0 | 0 / 0 | 16–18–21 | 13 | 2 | 0 | no |

Gaps under 12 px (touching segmented buttons included):

| Screen | Label | Gap px | Neighbour |
| --- | --- | ---: | --- |
| Menu | Menu | 4 | Préparer |
| Menu | Préparer | 4 | Menu |
| Menu | Fichiers | 4 | Préparer |
| Menu | Suivi | 4 | Fichiers |
| Menu | Machine | 4 | Suivi |
| Menu | Journal | 4 | Machine |
| Menu | Réglages | 4 | Journal |
| Suivi | −10 % | 0 | Préparer |
| Suivi | 100 % | 0 | Fichiers |
| Suivi | +10 % | 0 | Suivi |
| Suivi | −1 % | 0 | Machine |
| Suivi | +1 % | 0 | Journal |
| Suivi | Menu | 4 | Préparer |
| Suivi | Préparer | 0 | −10 % |
| Suivi | Fichiers | 0 | −10 % |
| Suivi | Suivi | 0 | 100 % |
| Suivi | Machine | 0 | +10 % |
| Suivi | Journal | 0 | −1 % |
| Suivi | Réglages | 0 | +1 % |
| Fichiers | ↻ Actualiser | 8 | Nom, matière, outil, notes… |
| Fichiers | Nom, matière, outil, notes… | 8 | ↻ Actualiser |
| Fichiers | ★ Favoris seulement | 8 | ＋ Ajouter un fichier |
| Fichiers | Parcours_de_test_3.gcode233 Ko · 14/10/2026 10:00:00 | 10 | Suivant → |
| Fichiers | Suivant → | 10 | Parcours_de_test_3.gcode233 Ko · 14/10/2026 10:00:00 |
| Fichiers | ＋ Ajouter un fichier | 8 | ★ Favoris seulement |
| Fichiers | Menu | 4 | Préparer |
| Fichiers | Préparer | 4 | Menu |
| Fichiers | Fichiers | 4 | Préparer |
| Fichiers | Suivi | 4 | Fichiers |
| Fichiers | Machine | 4 | Suivi |
| Fichiers | Journal | 4 | Machine |
| Fichiers | Réglages | 4 | Journal |
| Préparer | Zéro X | 1 | Zéro Y |
| Préparer | Zéro Y | 1 | Zéro X |
| Préparer | Zéro Z | 1 | Zéro Y |
| Préparer | 0.1 | 3 | 1 |
| Préparer | 1 | 3 | 0.1 |
| Préparer | 10 | 3 | 1 |
| Préparer | Zéro XYZ | 10.6 | 0.1 |
| Préparer | Vitesse du test… | 10.6 | 1 |
| Préparer | Y− | 0 | Fichiers |
| Préparer | Menu | 4 | Préparer |
| Préparer | Préparer | 4 | Menu |
| Préparer | Fichiers | 0 | Y− |
| Préparer | Suivi | 0 | Y− |
| Préparer | Machine | 4 | Suivi |
| Préparer | Journal | 4 | Machine |
| Préparer | Réglages | 4 | Journal |
| Machine | Menu | 4 | Préparer |
| Machine | Préparer | 4 | Menu |
| Machine | Fichiers | 4 | Préparer |
| Machine | Suivi | 4 | Fichiers |
| Machine | Machine | 4 | Suivi |
| Machine | Journal | 4 | Machine |
| Machine | Réglages | 4 | Journal |
| Journal | Tout | 0 | Erreurs |
| Journal | Erreurs | 0 | Tout |
| Journal | Travaux | 0 | Erreurs |
| Journal | Alarmes | 0 | Travaux |
| Journal | Cette session | 0 | Serveur |
| Journal | Serveur | 0 | Cette session |
| Journal | Menu | 4 | Préparer |
| Journal | Préparer | 4 | Menu |
| Journal | Fichiers | 4 | Préparer |
| Journal | Suivi | 4 | Fichiers |
| Journal | Machine | 4 | Suivi |
| Journal | Journal | 4 | Machine |
| Journal | Réglages | 4 | Journal |
| Réglages | Affichage | 10 | Système |
| Réglages | Système | 10 | Affichage |
| Réglages | Ouvrir le SuiviActivé | 6 | Verrouiller l’écranDésactivé |
| Réglages | Verrouiller l’écranDésactivé | 6 | Ouvrir le SuiviActivé |
| Réglages | CNC | 0 | Menu |
| Réglages | Laser | 0 | Fichiers |
| Réglages | Menu | 0 | CNC |
| Réglages | Préparer | 0 | CNC |
| Réglages | Fichiers | 0 | Laser |
| Réglages | Suivi | 0 | Laser |
| Réglages | Machine | 4 | Suivi |
| Réglages | Journal | 4 | Machine |
| Réglages | Réglages | 4 | Journal |

Targets whose centre is covered by another element:

| Screen | Label | Element hit at centre |
| --- | --- | --- |
| Suivi | −10 % | Préparer |
| Suivi | 100 % | RetourMenuPréparerFichiersSuiviMachineJournalRéglages |
| Suivi | +10 % | Machine |
| Suivi | −1 % | Journal |
| Suivi | +1 % | Réglages |
| Réglages | CNC | Préparer |
| Réglages | Laser | Fichiers |

## Tap targets — 960x1440 portrait (`responsive-960x1440-portrait/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Menu | 1 | 16 | 0 | 0 / 0 | 16–16–18 | 7 | 0 | 0 | no |
| Suivi | 1 | 24 | 0 | 0 / 0 | 16–18–24 | 20 | 0 | 0 | no |
| Fichiers | 1 | 26 | 0 | 0 / 0 | 16–16–20 | 21 | 6 | 0 | no |
| Préparer | 1 | 27 | 0 | 0 / 0 | 16–18–28 | 15 | 0 | 0 | no |
| Machine | 1 | 17 | 0 | 0 / 0 | 16–16–18 | 7 | 0 | 0 | no |
| Journal | 1 | 18 | 0 | 0 / 0 | 16–18–18 | 13 | 0 | 0 | no |
| Réglages | 1 | 23 | 0 | 0 / 1 | 16–18–21 | 13 | 2 | 0 | no |

Visible text under 16 px (rendered size, screen scale applied):

| Screen | Text | Font px |
| --- | --- | ---: |
| Réglages | Au repos uniquement. Mesure l’écran et deux tracés courts, s | 13 |

Gaps under 12 px (touching segmented buttons included):

| Screen | Label | Gap px | Neighbour |
| --- | --- | ---: | --- |
| Menu | Menu | 4 | Préparer |
| Menu | Préparer | 4 | Menu |
| Menu | Fichiers | 4 | Préparer |
| Menu | Suivi | 4 | Fichiers |
| Menu | Machine | 4 | Suivi |
| Menu | Journal | 4 | Machine |
| Menu | Réglages | 4 | Journal |
| Suivi | −10 % | 8 | 100 % |
| Suivi | 100 % | 8 | −10 % |
| Suivi | +10 % | 8 | 100 % |
| Suivi | −1 % | 8 | +1 % |
| Suivi | +1 % | 8 | −1 % |
| Suivi | −10 % | 8 | 100 % |
| Suivi | 100 % | 8 | −10 % |
| Suivi | +10 % | 8 | 100 % |
| Suivi | −1 % | 8 | +1 % |
| Suivi | +1 % | 8 | −1 % |
| Suivi | 25 % | 8 | 50 % |
| Suivi | 50 % | 8 | 25 % |
| Suivi | 100 % | 8 | 50 % |
| Suivi | Menu | 4 | Préparer |
| Suivi | Préparer | 4 | Menu |
| Suivi | Fichiers | 4 | Préparer |
| Suivi | Suivi | 4 | Fichiers |
| Suivi | Machine | 4 | Suivi |
| Suivi | Journal | 4 | Machine |
| Suivi | Réglages | 4 | Journal |
| Fichiers | ↻ Actualiser | 8 | Nom, matière, outil, notes… |
| Fichiers | Nom, matière, outil, notes… | 8 | ↻ Actualiser |
| Fichiers | ★ Favoris seulement | 8 | ＋ Ajouter un fichier |
| Fichiers | Parcours_de_test_3.gcode233 Ko · 14/10/2026 10:00:00 | 10 | Suivant → |
| Fichiers | Suivant → | 10 | Parcours_de_test_3.gcode233 Ko · 14/10/2026 10:00:00 |
| Fichiers | ＋ Ajouter un fichier | 8 | ★ Favoris seulement |
| Fichiers | Exporter l’aperçu | 8 | Importer un aperçu… |
| Fichiers | Importer un aperçu… | 8 | Exporter l’aperçu |
| Fichiers | ☆ Favori | 0 | Journal |
| Fichiers | Ouvrir la fiche | 0 | Journal |
| Fichiers | Préparer le travail… | 0 | Menu |
| Fichiers | Dimensions XY | 0 | Préparer |
| Fichiers | Détails de l’aperçu | 0 | Suivi |
| Fichiers | Ouvrir le suivi → | 0 | Journal |
| Fichiers | Menu | 0 | Préparer le travail… |
| Fichiers | Préparer | 0 | Préparer le travail… |
| Fichiers | Fichiers | 0 | Dimensions XY |
| Fichiers | Suivi | 0 | Dimensions XY |
| Fichiers | Machine | 0 | Détails de l’aperçu |
| Fichiers | Journal | 0 | ☆ Favori |
| Fichiers | Réglages | 0 | Ouvrir la fiche |
| Préparer | Zéro X | 1 | Zéro Y |
| Préparer | Zéro Y | 1 | Zéro X |
| Préparer | Zéro Z | 1 | Zéro Y |
| Préparer | 0.1 | 3 | 1 |
| Préparer | 1 | 3 | 0.1 |
| Préparer | 10 | 3 | 1 |
| Préparer | Zéro XYZ | 10.6 | 0.1 |
| Préparer | Vitesse du test… | 10.6 | 1 |
| Préparer | Menu | 4 | Préparer |
| Préparer | Préparer | 4 | Menu |
| Préparer | Fichiers | 4 | Préparer |
| Préparer | Suivi | 4 | Fichiers |
| Préparer | Machine | 4 | Suivi |
| Préparer | Journal | 4 | Machine |
| Préparer | Réglages | 4 | Journal |
| Machine | Menu | 4 | Préparer |
| Machine | Préparer | 4 | Menu |
| Machine | Fichiers | 4 | Préparer |
| Machine | Suivi | 4 | Fichiers |
| Machine | Machine | 4 | Suivi |
| Machine | Journal | 4 | Machine |
| Machine | Réglages | 4 | Journal |
| Journal | Tout | 0 | Erreurs |
| Journal | Erreurs | 0 | Tout |
| Journal | Travaux | 0 | Erreurs |
| Journal | Alarmes | 0 | Travaux |
| Journal | Cette session | 0 | Serveur |
| Journal | Serveur | 0 | Cette session |
| Journal | Menu | 4 | Préparer |
| Journal | Préparer | 4 | Menu |
| Journal | Fichiers | 4 | Préparer |
| Journal | Suivi | 4 | Fichiers |
| Journal | Machine | 4 | Suivi |
| Journal | Journal | 4 | Machine |
| Journal | Réglages | 4 | Journal |
| Réglages | Affichage | 10 | Système |
| Réglages | Système | 10 | Affichage |
| Réglages | Ouvrir le SuiviActivé | 6 | Verrouiller l’écranDésactivé |
| Réglages | Verrouiller l’écranDésactivé | 6 | Ouvrir le SuiviActivé |
| Réglages | AaStandard | 0 | Machine |
| Réglages | AaAgrandi | 0 | Journal |
| Réglages | Menu | 4 | Préparer |
| Réglages | Préparer | 4 | Menu |
| Réglages | Fichiers | 4 | Préparer |
| Réglages | Suivi | 4 | Fichiers |
| Réglages | Machine | 0 | AaStandard |
| Réglages | Journal | 0 | AaStandard |
| Réglages | Réglages | 0 | AaAgrandi |

Targets whose centre is covered by another element:

| Screen | Label | Element hit at centre |
| --- | --- | --- |
| Fichiers | ☆ Favori | RetourMenuPréparerFichiersSuiviMachineJournalRéglages |
| Fichiers | Ouvrir la fiche | RetourMenuPréparerFichiersSuiviMachineJournalRéglages |
| Fichiers | Préparer le travail… | Menu |
| Fichiers | Dimensions XY | Fichiers |
| Fichiers | Détails de l’aperçu | Machine |
| Fichiers | Ouvrir le suivi → | Journal |
| Réglages | AaStandard | Machine |
| Réglages | AaAgrandi | Réglages |

## Tap targets — 1180x820 (`responsive-1180x820/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Menu | 1 | 17 | 0 | 0 / 0 | 16–16–18 | 0 | 0 | 0 | no |
| Suivi | 1 | 25 | 0 | 0 / 0 | 16–18–24 | 0 | 0 | 0 | no |
| Fichiers | 1 | 34 | 0 | 0 / 0 | 16–16–24 | 9 | 0 | 0 | no |
| Préparer | 1 | 28 | 0 | 0 / 0 | 16–18–28 | 3 | 0 | 0 | no |
| Machine | 1 | 18 | 0 | 0 / 0 | 16–17–20 | 0 | 0 | 0 | no |
| Journal | 1 | 19 | 0 | 0 / 0 | 16–18–18 | 6 | 0 | 0 | no |
| Réglages | 1 | 19 | 0 | 0 / 0 | 16–18–21 | 4 | 0 | 0 | no |

Gaps under 12 px (touching segmented buttons included):

| Screen | Label | Gap px | Neighbour |
| --- | --- | ---: | --- |
| Fichiers | 2D | 0 | Iso |
| Fichiers | Iso | 0 | 2D |
| Fichiers | Face | 0 | Iso |
| Fichiers | Côté | 0 | Face |
| Fichiers | Dessus | 0 | Côté |
| Fichiers | Exporter l’aperçu | 8 | Importer un aperçu… |
| Fichiers | Importer un aperçu… | 8 | Exporter l’aperçu |
| Fichiers | ☆ Favori | 8 | Ouvrir la fiche |
| Fichiers | Ouvrir la fiche | 8 | ☆ Favori |
| Préparer | 0.1 | 3 | 1 |
| Préparer | 1 | 3 | 0.1 |
| Préparer | 10 | 3 | 1 |
| Journal | Tout | 0 | Erreurs |
| Journal | Erreurs | 0 | Tout |
| Journal | Travaux | 0 | Erreurs |
| Journal | Alarmes | 0 | Travaux |
| Journal | Cette session | 0 | Serveur |
| Journal | Serveur | 0 | Cette session |
| Réglages | Affichage | 10 | Système |
| Réglages | Système | 10 | Affichage |
| Réglages | Ouvrir le SuiviActivé | 6 | Verrouiller l’écranDésactivé |
| Réglages | Verrouiller l’écranDésactivé | 6 | Ouvrir le SuiviActivé |

## Tap targets — 1600x900 (`responsive-1600x900/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Menu | 1 | 17 | 0 | 0 / 0 | 16–16–18 | 0 | 0 | 0 | no |
| Suivi | 1 | 25 | 0 | 0 / 0 | 16–18–24 | 0 | 0 | 0 | no |
| Fichiers | 1 | 34 | 0 | 0 / 0 | 16–16–24 | 9 | 0 | 0 | no |
| Préparer | 1 | 28 | 0 | 0 / 0 | 16–18–28 | 3 | 0 | 0 | no |
| Machine | 1 | 18 | 0 | 0 / 0 | 16–17–20 | 0 | 0 | 0 | no |
| Journal | 1 | 19 | 0 | 0 / 0 | 16–18–18 | 6 | 0 | 0 | no |
| Réglages | 1 | 21 | 0 | 0 / 0 | 16–18–21 | 4 | 0 | 0 | no |

Gaps under 12 px (touching segmented buttons included):

| Screen | Label | Gap px | Neighbour |
| --- | --- | ---: | --- |
| Fichiers | 2D | 0 | Iso |
| Fichiers | Iso | 0 | 2D |
| Fichiers | Face | 0 | Iso |
| Fichiers | Côté | 0 | Face |
| Fichiers | Dessus | 0 | Côté |
| Fichiers | Exporter l’aperçu | 8 | Importer un aperçu… |
| Fichiers | Importer un aperçu… | 8 | Exporter l’aperçu |
| Fichiers | ☆ Favori | 8 | Ouvrir la fiche |
| Fichiers | Ouvrir la fiche | 8 | ☆ Favori |
| Préparer | 0.1 | 3 | 1 |
| Préparer | 1 | 3 | 0.1 |
| Préparer | 10 | 3 | 1 |
| Journal | Tout | 0 | Erreurs |
| Journal | Erreurs | 0 | Tout |
| Journal | Travaux | 0 | Erreurs |
| Journal | Alarmes | 0 | Travaux |
| Journal | Cette session | 0 | Serveur |
| Journal | Serveur | 0 | Cette session |
| Réglages | Affichage | 10 | Système |
| Réglages | Système | 10 | Affichage |
| Réglages | Ouvrir le SuiviActivé | 6 | Verrouiller l’écranDésactivé |
| Réglages | Verrouiller l’écranDésactivé | 6 | Ouvrir le SuiviActivé |

## Tap targets — 800x1280 portrait (`responsive-800x1280-portrait/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Menu | 1 | 16 | 0 | 0 / 0 | 16–16–18 | 7 | 0 | 0 | no |
| Suivi | 1 | 13 | 0 | 0 / 0 | 16–16–24 | 7 | 0 | 0 | no |
| Fichiers | 1 | 22 | 0 | 0 / 0 | 16–16–20 | 17 | 4 | 0 | no |
| Préparer | 1 | 27 | 0 | 0 / 0 | 16–18–28 | 15 | 0 | 0 | no |
| Machine | 1 | 17 | 0 | 0 / 0 | 16–16–18 | 7 | 0 | 0 | no |
| Journal | 1 | 18 | 0 | 0 / 0 | 16–18–18 | 13 | 0 | 0 | no |
| Réglages | 1 | 20 | 0 | 0 / 0 | 16–18–21 | 13 | 2 | 0 | no |

Gaps under 12 px (touching segmented buttons included):

| Screen | Label | Gap px | Neighbour |
| --- | --- | ---: | --- |
| Menu | Menu | 4 | Préparer |
| Menu | Préparer | 4 | Menu |
| Menu | Fichiers | 4 | Préparer |
| Menu | Suivi | 4 | Fichiers |
| Menu | Machine | 4 | Suivi |
| Menu | Journal | 4 | Machine |
| Menu | Réglages | 4 | Journal |
| Suivi | Menu | 4 | Préparer |
| Suivi | Préparer | 4 | Menu |
| Suivi | Fichiers | 4 | Préparer |
| Suivi | Suivi | 4 | Fichiers |
| Suivi | Machine | 4 | Suivi |
| Suivi | Journal | 4 | Machine |
| Suivi | Réglages | 4 | Journal |
| Fichiers | ↻ Actualiser | 8 | Nom, matière, outil, notes… |
| Fichiers | Nom, matière, outil, notes… | 8 | ↻ Actualiser |
| Fichiers | ★ Favoris seulement | 8 | ＋ Ajouter un fichier |
| Fichiers | Parcours_de_test_3.gcode233 Ko · 14/10/2026 10:00:00 | 10 | Suivant → |
| Fichiers | Suivant → | 10 | Parcours_de_test_3.gcode233 Ko · 14/10/2026 10:00:00 |
| Fichiers | ＋ Ajouter un fichier | 8 | ★ Favoris seulement |
| Fichiers | Exporter l’aperçu | 0 | Menu |
| Fichiers | Importer un aperçu… | 0 | Préparer |
| Fichiers | ☆ Favori | 0 | Machine |
| Fichiers | Ouvrir la fiche | 0 | Journal |
| Fichiers | Menu | 0 | Exporter l’aperçu |
| Fichiers | Préparer | 0 | Exporter l’aperçu |
| Fichiers | Fichiers | 0 | Importer un aperçu… |
| Fichiers | Suivi | 0 | Importer un aperçu… |
| Fichiers | Machine | 0 | ☆ Favori |
| Fichiers | Journal | 0 | ☆ Favori |
| Fichiers | Réglages | 0 | Ouvrir la fiche |
| Préparer | Zéro X | 1 | Zéro Y |
| Préparer | Zéro Y | 1 | Zéro X |
| Préparer | Zéro Z | 1 | Zéro Y |
| Préparer | 0.1 | 3 | 1 |
| Préparer | 1 | 3 | 0.1 |
| Préparer | 10 | 3 | 1 |
| Préparer | Zéro XYZ | 10.6 | 0.1 |
| Préparer | Vitesse du test… | 10.6 | 1 |
| Préparer | Menu | 4 | Préparer |
| Préparer | Préparer | 4 | Menu |
| Préparer | Fichiers | 4 | Préparer |
| Préparer | Suivi | 4 | Fichiers |
| Préparer | Machine | 4 | Suivi |
| Préparer | Journal | 4 | Machine |
| Préparer | Réglages | 4 | Journal |
| Machine | Menu | 4 | Préparer |
| Machine | Préparer | 4 | Menu |
| Machine | Fichiers | 4 | Préparer |
| Machine | Suivi | 4 | Fichiers |
| Machine | Machine | 4 | Suivi |
| Machine | Journal | 4 | Machine |
| Machine | Réglages | 4 | Journal |
| Journal | Tout | 0 | Erreurs |
| Journal | Erreurs | 0 | Tout |
| Journal | Travaux | 0 | Erreurs |
| Journal | Alarmes | 0 | Travaux |
| Journal | Cette session | 0 | Serveur |
| Journal | Serveur | 0 | Cette session |
| Journal | Menu | 4 | Préparer |
| Journal | Préparer | 4 | Menu |
| Journal | Fichiers | 4 | Préparer |
| Journal | Suivi | 4 | Fichiers |
| Journal | Machine | 4 | Suivi |
| Journal | Journal | 4 | Machine |
| Journal | Réglages | 4 | Journal |
| Réglages | Affichage | 10 | Système |
| Réglages | Système | 10 | Affichage |
| Réglages | Ouvrir le SuiviActivé | 6 | Verrouiller l’écranDésactivé |
| Réglages | Verrouiller l’écranDésactivé | 6 | Ouvrir le SuiviActivé |
| Réglages | Éco | 0 | Menu |
| Réglages | Performance | 0 | Préparer |
| Réglages | Menu | 0 | Éco |
| Réglages | Préparer | 0 | Éco |
| Réglages | Fichiers | 0 | Performance |
| Réglages | Suivi | 0 | Performance |
| Réglages | Machine | 4 | Suivi |
| Réglages | Journal | 4 | Machine |
| Réglages | Réglages | 4 | Journal |

Targets whose centre is covered by another element:

| Screen | Label | Element hit at centre |
| --- | --- | --- |
| Fichiers | Exporter l’aperçu | Menu |
| Fichiers | Importer un aperçu… | #[object SVGAnimatedString] |
| Fichiers | ☆ Favori | nothing |
| Fichiers | Ouvrir la fiche | nothing |
| Réglages | Éco | nothing |
| Réglages | Performance | nothing |

## Tap targets — 600x960 portrait (`responsive-600x960-portrait/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Menu | 1 | 16 | 0 | 0 / 0 | 16–16–18 | 7 | 0 | 0 | no |
| Suivi | 1 | 11 | 0 | 0 / 0 | 16–16–24 | 7 | 0 | 0 | no |
| Fichiers | 1 | 17 | 0 | 0 / 0 | 16–16–20 | 13 | 0 | 0 | no |
| Préparer | 1 | 26 | 0 | 0 / 0 | 16–18–28 | 19 | 3 | 0 | no |
| Machine | 1 | 17 | 0 | 0 / 0 | 16–16–18 | 7 | 0 | 0 | no |
| Journal | 1 | 18 | 0 | 0 / 0 | 16–18–18 | 13 | 0 | 0 | no |
| Réglages | 1 | 16 | 0 | 0 / 0 | 16–17–21 | 11 | 1 | 0 | no |

Gaps under 12 px (touching segmented buttons included):

| Screen | Label | Gap px | Neighbour |
| --- | --- | ---: | --- |
| Menu | Menu | 4 | Préparer |
| Menu | Préparer | 4 | Menu |
| Menu | Fichiers | 4 | Préparer |
| Menu | Suivi | 4 | Fichiers |
| Menu | Machine | 4 | Suivi |
| Menu | Journal | 4 | Machine |
| Menu | Réglages | 4 | Journal |
| Suivi | Menu | 4 | Préparer |
| Suivi | Préparer | 4 | Menu |
| Suivi | Fichiers | 4 | Préparer |
| Suivi | Suivi | 4 | Fichiers |
| Suivi | Machine | 4 | Suivi |
| Suivi | Journal | 4 | Machine |
| Suivi | Réglages | 4 | Journal |
| Fichiers | ↻ Actualiser | 8 | Nom, matière, outil, notes… |
| Fichiers | Nom, matière, outil, notes… | 8 | ↻ Actualiser |
| Fichiers | ★ Favoris seulement | 8 | ＋ Ajouter un fichier |
| Fichiers | Parcours_de_test_3.gcode233 Ko · 14/10/2026 10:00:00 | 10 | Suivant → |
| Fichiers | Suivant → | 10 | Parcours_de_test_3.gcode233 Ko · 14/10/2026 10:00:00 |
| Fichiers | ＋ Ajouter un fichier | 8 | ★ Favoris seulement |
| Fichiers | Menu | 4 | Préparer |
| Fichiers | Préparer | 4 | Menu |
| Fichiers | Fichiers | 4 | Préparer |
| Fichiers | Suivi | 4 | Fichiers |
| Fichiers | Machine | 4 | Suivi |
| Fichiers | Journal | 4 | Machine |
| Fichiers | Réglages | 4 | Journal |
| Préparer | Zéro X | 1 | Zéro Y |
| Préparer | Zéro Y | 1 | Zéro X |
| Préparer | Zéro Z | 1 | Zéro Y |
| Préparer | 0.1 | 3 | 1 |
| Préparer | 1 | 3 | 0.1 |
| Préparer | 10 | 3 | 1 |
| Préparer | Zéro XYZ | 10.6 | 0.1 |
| Préparer | Vitesse du test… | 10.6 | 0.1 |
| Préparer | X− | 0 | Menu |
| Préparer | X+ | 0 | Suivi |
| Préparer | Z+ | 0 | Machine |
| Préparer | Z− | 0 | Machine |
| Préparer | Menu | 0 | X− |
| Préparer | Préparer | 0 | X− |
| Préparer | Fichiers | 0 | X− |
| Préparer | Suivi | 0 | X+ |
| Préparer | Machine | 0 | X+ |
| Préparer | Journal | 0 | Z+ |
| Préparer | Réglages | 3.9 | Z+ |
| Machine | Menu | 4 | Préparer |
| Machine | Préparer | 4 | Menu |
| Machine | Fichiers | 4 | Préparer |
| Machine | Suivi | 4 | Fichiers |
| Machine | Machine | 4 | Suivi |
| Machine | Journal | 4 | Machine |
| Machine | Réglages | 4 | Journal |
| Journal | Tout | 0 | Erreurs |
| Journal | Erreurs | 0 | Tout |
| Journal | Travaux | 0 | Erreurs |
| Journal | Alarmes | 0 | Travaux |
| Journal | Cette session | 0 | Serveur |
| Journal | Serveur | 0 | Cette session |
| Journal | Menu | 4 | Préparer |
| Journal | Préparer | 4 | Menu |
| Journal | Fichiers | 4 | Préparer |
| Journal | Suivi | 4 | Fichiers |
| Journal | Machine | 4 | Suivi |
| Journal | Journal | 4 | Machine |
| Journal | Réglages | 4 | Journal |
| Réglages | Affichage | 10 | Système |
| Réglages | Système | 10 | Affichage |
| Réglages | Ouvrir le SuiviActivé | 6 | Verrouiller l’écranDésactivé |
| Réglages | Verrouiller l’écranDésactivé | 0 | Menu |
| Réglages | Menu | 0 | Verrouiller l’écranDésactivé |
| Réglages | Préparer | 0 | Verrouiller l’écranDésactivé |
| Réglages | Fichiers | 0 | Verrouiller l’écranDésactivé |
| Réglages | Suivi | 0 | Verrouiller l’écranDésactivé |
| Réglages | Machine | 0 | Verrouiller l’écranDésactivé |
| Réglages | Journal | 0 | Verrouiller l’écranDésactivé |
| Réglages | Réglages | 0 | Verrouiller l’écranDésactivé |

Targets whose centre is covered by another element:

| Screen | Label | Element hit at centre |
| --- | --- | --- |
| Préparer | X− | Préparer |
| Préparer | X+ | RetourMenuPréparerFichiersSuiviMachineJournalRéglages |
| Préparer | Z− | nothing |
| Réglages | Verrouiller l’écranDésactivé | Suivi |

## Tap targets — 1280x800 texte agrandi (`responsive-1280x800-texte-agrandi/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Menu | 1 | 17 | 0 | 0 / 0 | 16–16–18 | 0 | 0 | 0 | no |
| Suivi | 1 | 25 | 0 | 0 / 0 | 16–20–27 | 0 | 0 | 0 | no |
| Fichiers | 1 | 34 | 0 | 0 / 0 | 16–18–27 | 9 | 0 | 0 | no |
| Préparer | 1 | 28 | 0 | 0 / 0 | 16–20–31 | 3 | 0 | 0 | no |
| Machine | 1 | 18 | 0 | 0 / 0 | 16–17–22 | 0 | 0 | 0 | no |
| Journal | 1 | 19 | 0 | 0 / 0 | 16–18–20 | 6 | 0 | 0 | no |
| Réglages | 1 | 19 | 0 | 0 / 0 | 16–18–21 | 4 | 0 | 0 | no |

Gaps under 12 px (touching segmented buttons included):

| Screen | Label | Gap px | Neighbour |
| --- | --- | ---: | --- |
| Fichiers | 2D | 0 | Iso |
| Fichiers | Iso | 0 | 2D |
| Fichiers | Face | 0 | Iso |
| Fichiers | Côté | 0 | Face |
| Fichiers | Dessus | 0 | Côté |
| Fichiers | Exporter l’aperçu | 8 | Importer un aperçu… |
| Fichiers | Importer un aperçu… | 8 | Exporter l’aperçu |
| Fichiers | ☆ Favori | 8 | Ouvrir la fiche |
| Fichiers | Ouvrir la fiche | 8 | ☆ Favori |
| Préparer | 0.1 | 3 | 1 |
| Préparer | 1 | 3 | 0.1 |
| Préparer | 10 | 3 | 1 |
| Journal | Tout | 0 | Erreurs |
| Journal | Erreurs | 0 | Tout |
| Journal | Travaux | 0 | Erreurs |
| Journal | Alarmes | 0 | Travaux |
| Journal | Cette session | 0 | Serveur |
| Journal | Serveur | 0 | Cette session |
| Réglages | Affichage | 10 | Système |
| Réglages | Système | 10 | Affichage |
| Réglages | Ouvrir le SuiviActivé | 6 | Verrouiller l’écranDésactivé |
| Réglages | Verrouiller l’écranDésactivé | 6 | Ouvrir le SuiviActivé |

## Tap targets — 720x1080 portrait texte agrandi (`responsive-720x1080-portrait-texte-agrandi/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Menu | 1 | 16 | 0 | 0 / 0 | 16–17–18 | 7 | 0 | 0 | no |
| Suivi | 1 | 13 | 0 | 0 / 0 | 16–16–27 | 7 | 0 | 0 | no |
| Fichiers | 1 | 17 | 0 | 0 / 0 | 16–18–22 | 13 | 0 | 0 | no |
| Préparer | 1 | 27 | 0 | 0 / 0 | 16–20–31 | 15 | 1 | 0 | no |
| Machine | 1 | 17 | 0 | 0 / 0 | 16–18–20 | 7 | 0 | 0 | no |
| Journal | 1 | 18 | 0 | 0 / 0 | 16–19–20 | 13 | 0 | 0 | no |
| Réglages | 1 | 18 | 0 | 0 / 0 | 16–18–21 | 13 | 2 | 0 | no |

Gaps under 12 px (touching segmented buttons included):

| Screen | Label | Gap px | Neighbour |
| --- | --- | ---: | --- |
| Menu | Menu | 4 | Préparer |
| Menu | Préparer | 4 | Menu |
| Menu | Fichiers | 4 | Préparer |
| Menu | Suivi | 4 | Fichiers |
| Menu | Machine | 4 | Suivi |
| Menu | Journal | 4 | Machine |
| Menu | Réglages | 4 | Journal |
| Suivi | Menu | 4 | Préparer |
| Suivi | Préparer | 4 | Menu |
| Suivi | Fichiers | 4 | Préparer |
| Suivi | Suivi | 4 | Fichiers |
| Suivi | Machine | 4 | Suivi |
| Suivi | Journal | 4 | Machine |
| Suivi | Réglages | 4 | Journal |
| Fichiers | ↻ Actualiser | 8 | Nom, matière, outil, notes… |
| Fichiers | Nom, matière, outil, notes… | 8 | ↻ Actualiser |
| Fichiers | ★ Favoris seulement | 8 | ＋ Ajouter un fichier |
| Fichiers | Parcours_de_test_3.gcode233 Ko · 14/10/2026 10:00:00 | 10 | Suivant → |
| Fichiers | Suivant → | 10 | Parcours_de_test_3.gcode233 Ko · 14/10/2026 10:00:00 |
| Fichiers | ＋ Ajouter un fichier | 8 | ★ Favoris seulement |
| Fichiers | Menu | 4 | Préparer |
| Fichiers | Préparer | 4 | Menu |
| Fichiers | Fichiers | 4 | Préparer |
| Fichiers | Suivi | 4 | Fichiers |
| Fichiers | Machine | 4 | Suivi |
| Fichiers | Journal | 4 | Machine |
| Fichiers | Réglages | 4 | Journal |
| Préparer | Zéro X | 1 | Zéro Y |
| Préparer | Zéro Y | 1 | Zéro X |
| Préparer | Zéro Z | 1 | Zéro Y |
| Préparer | 0.1 | 3 | 1 |
| Préparer | 1 | 3 | 0.1 |
| Préparer | 10 | 3 | 1 |
| Préparer | Y− | 0 | Fichiers |
| Préparer | Z− | 0 | Machine |
| Préparer | Menu | 4 | Préparer |
| Préparer | Préparer | 4 | Menu |
| Préparer | Fichiers | 0 | Y− |
| Préparer | Suivi | 0 | Y− |
| Préparer | Machine | 0 | Z− |
| Préparer | Journal | 0 | Z− |
| Préparer | Réglages | 4 | Journal |
| Machine | Menu | 4 | Préparer |
| Machine | Préparer | 4 | Menu |
| Machine | Fichiers | 4 | Préparer |
| Machine | Suivi | 4 | Fichiers |
| Machine | Machine | 4 | Suivi |
| Machine | Journal | 4 | Machine |
| Machine | Réglages | 4 | Journal |
| Journal | Tout | 0 | Erreurs |
| Journal | Erreurs | 0 | Tout |
| Journal | Travaux | 0 | Erreurs |
| Journal | Alarmes | 0 | Travaux |
| Journal | Cette session | 0 | Serveur |
| Journal | Serveur | 0 | Cette session |
| Journal | Menu | 4 | Préparer |
| Journal | Préparer | 4 | Menu |
| Journal | Fichiers | 4 | Préparer |
| Journal | Suivi | 4 | Fichiers |
| Journal | Machine | 4 | Suivi |
| Journal | Journal | 4 | Machine |
| Journal | Réglages | 4 | Journal |
| Réglages | Affichage | 10 | Système |
| Réglages | Système | 10 | Affichage |
| Réglages | Ouvrir le SuiviActivé | 6 | Verrouiller l’écranDésactivé |
| Réglages | Verrouiller l’écranDésactivé | 6 | Ouvrir le SuiviActivé |
| Réglages | CNC | 0 | Menu |
| Réglages | Laser | 0 | Fichiers |
| Réglages | Menu | 0 | CNC |
| Réglages | Préparer | 0 | CNC |
| Réglages | Fichiers | 0 | Laser |
| Réglages | Suivi | 0 | Laser |
| Réglages | Machine | 4 | Suivi |
| Réglages | Journal | 4 | Machine |
| Réglages | Réglages | 4 | Journal |

Targets whose centre is covered by another element:

| Screen | Label | Element hit at centre |
| --- | --- | --- |
| Préparer | Y− | Fichiers |
| Réglages | CNC | Préparer |
| Réglages | Laser | Fichiers |

## Tap targets — 1366x768 zoom 150 % (911x512 @1.5) (`responsive-1366x768-zoom-150-911x512-1-5/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Menu | 1 | 16 | 0 | 0 / 0 | 16–16–28 | 7 | 0 | 0 | no |
| Suivi | 1 | 11 | 0 | 0 / 0 | 16–16–24 | 7 | 0 | 0 | no |
| Fichiers | 1 | 19 | 0 | 0 / 0 | 16–16–20 | 7 | 0 | 0 | no |
| Préparer | 1 | 20 | 0 | 0 / 0 | 16–18–20 | 13 | 0 | 0 | no |
| Machine | 1 | 17 | 0 | 0 / 0 | 16–16–18 | 7 | 0 | 0 | no |
| Journal | 1 | 18 | 0 | 0 / 0 | 16–18–18 | 13 | 0 | 0 | no |
| Réglages | 1 | 15 | 0 | 0 / 0 | 16–16–21 | 7 | 1 | 0 | no |

Gaps under 12 px (touching segmented buttons included):

| Screen | Label | Gap px | Neighbour |
| --- | --- | ---: | --- |
| Menu | Menu | 4 | Préparer |
| Menu | Préparer | 4 | Menu |
| Menu | Fichiers | 4 | Préparer |
| Menu | Suivi | 4 | Fichiers |
| Menu | Machine | 4 | Suivi |
| Menu | Journal | 4 | Machine |
| Menu | Réglages | 4 | Journal |
| Suivi | Menu | 4 | Préparer |
| Suivi | Préparer | 4 | Menu |
| Suivi | Fichiers | 4 | Préparer |
| Suivi | Suivi | 4 | Fichiers |
| Suivi | Machine | 4 | Suivi |
| Suivi | Journal | 4 | Machine |
| Suivi | Réglages | 4 | Journal |
| Fichiers | Menu | 4 | Préparer |
| Fichiers | Préparer | 4 | Menu |
| Fichiers | Fichiers | 4 | Préparer |
| Fichiers | Suivi | 4 | Fichiers |
| Fichiers | Machine | 4 | Suivi |
| Fichiers | Journal | 4 | Machine |
| Fichiers | Réglages | 4 | Journal |
| Préparer | Zéro X | 1 | Zéro Y |
| Préparer | Zéro Y | 1 | Zéro X |
| Préparer | Zéro Z | 1 | Zéro Y |
| Préparer | 0.1 | 3 | 1 |
| Préparer | 1 | 3 | 0.1 |
| Préparer | 10 | 3 | 1 |
| Préparer | Menu | 4 | Préparer |
| Préparer | Préparer | 4 | Menu |
| Préparer | Fichiers | 4 | Préparer |
| Préparer | Suivi | 4 | Fichiers |
| Préparer | Machine | 4 | Suivi |
| Préparer | Journal | 4 | Machine |
| Préparer | Réglages | 4 | Journal |
| Machine | Menu | 4 | Préparer |
| Machine | Préparer | 4 | Menu |
| Machine | Fichiers | 4 | Préparer |
| Machine | Suivi | 4 | Fichiers |
| Machine | Machine | 4 | Suivi |
| Machine | Journal | 4 | Machine |
| Machine | Réglages | 4 | Journal |
| Journal | Tout | 0 | Erreurs |
| Journal | Erreurs | 0 | Tout |
| Journal | Travaux | 0 | Erreurs |
| Journal | Alarmes | 0 | Travaux |
| Journal | Cette session | 0 | Serveur |
| Journal | Serveur | 0 | Cette session |
| Journal | Menu | 4 | Préparer |
| Journal | Préparer | 4 | Menu |
| Journal | Fichiers | 4 | Préparer |
| Journal | Suivi | 4 | Fichiers |
| Journal | Machine | 4 | Suivi |
| Journal | Journal | 4 | Machine |
| Journal | Réglages | 4 | Journal |
| Réglages | Menu | 4 | Préparer |
| Réglages | Préparer | 4 | Menu |
| Réglages | Fichiers | 4 | Préparer |
| Réglages | Suivi | 4 | Fichiers |
| Réglages | Machine | 4 | Suivi |
| Réglages | Journal | 4 | Machine |
| Réglages | Réglages | 4 | Journal |

Targets whose centre is covered by another element:

| Screen | Label | Element hit at centre |
| --- | --- | --- |
| Réglages | Ouvrir le SuiviActivé | nothing |

## Tap targets — 1366x768 zoom 200 % (683x384 @2) (`responsive-1366x768-zoom-200-683x384-2/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Menu | 1 | 14 | 0 | 0 / 0 | 16–16–28 | 7 | 2 | 0 | no |
| Suivi | 1 | 10 | 0 | 0 / 0 | 16–16–24 | 7 | 0 | 0 | no |
| Fichiers | 1 | 15 | 0 | 0 / 0 | 16–16–20 | 7 | 0 | 0 | no |
| Préparer | 1 | 13 | 0 | 0 / 0 | 16–16–18 | 7 | 0 | 0 | no |
| Machine | 1 | 16 | 0 | 0 / 0 | 16–16–18 | 7 | 3 | 0 | no |
| Journal | 1 | 16 | 0 | 0 / 0 | 16–17–18 | 13 | 0 | 0 | no |
| Réglages | 1 | 13 | 0 | 0 / 0 | 16–16–21 | 7 | 0 | 0 | no |

Gaps under 12 px (touching segmented buttons included):

| Screen | Label | Gap px | Neighbour |
| --- | --- | ---: | --- |
| Menu | Menu | 4 | Préparer |
| Menu | Préparer | 4 | Menu |
| Menu | Fichiers | 4 | Préparer |
| Menu | Suivi | 4 | Fichiers |
| Menu | Machine | 4 | Suivi |
| Menu | Journal | 4 | Machine |
| Menu | Réglages | 4 | Journal |
| Suivi | Menu | 4 | Préparer |
| Suivi | Préparer | 4 | Menu |
| Suivi | Fichiers | 4 | Préparer |
| Suivi | Suivi | 4 | Fichiers |
| Suivi | Machine | 4 | Suivi |
| Suivi | Journal | 4 | Machine |
| Suivi | Réglages | 4 | Journal |
| Fichiers | Menu | 4 | Préparer |
| Fichiers | Préparer | 4 | Menu |
| Fichiers | Fichiers | 4 | Préparer |
| Fichiers | Suivi | 4 | Fichiers |
| Fichiers | Machine | 4 | Suivi |
| Fichiers | Journal | 4 | Machine |
| Fichiers | Réglages | 4 | Journal |
| Préparer | Menu | 4 | Préparer |
| Préparer | Préparer | 4 | Menu |
| Préparer | Fichiers | 4 | Préparer |
| Préparer | Suivi | 4 | Fichiers |
| Préparer | Machine | 4 | Suivi |
| Préparer | Journal | 4 | Machine |
| Préparer | Réglages | 4 | Journal |
| Machine | Menu | 4 | Préparer |
| Machine | Préparer | 4 | Menu |
| Machine | Fichiers | 4 | Préparer |
| Machine | Suivi | 4 | Fichiers |
| Machine | Machine | 4 | Suivi |
| Machine | Journal | 4 | Machine |
| Machine | Réglages | 4 | Journal |
| Journal | Tout | 0 | Erreurs |
| Journal | Erreurs | 0 | Tout |
| Journal | Travaux | 0 | Erreurs |
| Journal | Alarmes | 0 | Travaux |
| Journal | Cette session | 0 | Serveur |
| Journal | Serveur | 0 | Cette session |
| Journal | Menu | 4 | Préparer |
| Journal | Préparer | 4 | Menu |
| Journal | Fichiers | 4 | Préparer |
| Journal | Suivi | 4 | Fichiers |
| Journal | Machine | 4 | Suivi |
| Journal | Journal | 4 | Machine |
| Journal | Réglages | 4 | Journal |
| Réglages | Menu | 4 | Préparer |
| Réglages | Préparer | 4 | Menu |
| Réglages | Fichiers | 4 | Préparer |
| Réglages | Suivi | 4 | Fichiers |
| Réglages | Machine | 4 | Suivi |
| Réglages | Journal | 4 | Machine |
| Réglages | Réglages | 4 | Journal |

Targets whose centre is covered by another element:

| Screen | Label | Element hit at centre |
| --- | --- | --- |
| Menu | PréparerDéplacer · Origine · PalpageBloqué : alarme | nothing |
| Menu | MachineÉtat et limitesAlarme | nothing |
| Machine | Ouvrir le suivi → | nothing |
| Machine | Réglages d’affichage → | nothing |
| Machine | Limites de la machine → | nothing |

## Tap targets — 1080x1920 portrait zoom 200 % (540x960 @2) (`responsive-1080x1920-portrait-zoom-200-540x960-2/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Menu | 1 | 16 | 0 | 0 / 0 | 16–16–18 | 7 | 0 | 0 | no |
| Suivi | 1 | 11 | 0 | 0 / 0 | 16–16–24 | 7 | 0 | 0 | no |
| Fichiers | 1 | 17 | 0 | 0 / 0 | 16–16–20 | 7 | 0 | 0 | no |
| Préparer | 1 | 22 | 0 | 0 / 0 | 16–18–28 | 14 | 1 | 0 | no |
| Machine | 1 | 17 | 0 | 0 / 0 | 16–16–18 | 7 | 0 | 0 | no |
| Journal | 1 | 18 | 0 | 0 / 0 | 16–18–18 | 13 | 0 | 0 | no |
| Réglages | 1 | 16 | 0 | 0 / 0 | 16–17–21 | 8 | 1 | 0 | no |

Gaps under 12 px (touching segmented buttons included):

| Screen | Label | Gap px | Neighbour |
| --- | --- | ---: | --- |
| Menu | Menu | 4 | Préparer |
| Menu | Préparer | 4 | Menu |
| Menu | Fichiers | 4 | Préparer |
| Menu | Suivi | 4 | Fichiers |
| Menu | Machine | 4 | Suivi |
| Menu | Journal | 4 | Machine |
| Menu | Réglages | 4 | Journal |
| Suivi | Menu | 4 | Préparer |
| Suivi | Préparer | 4 | Menu |
| Suivi | Fichiers | 4 | Préparer |
| Suivi | Suivi | 4 | Fichiers |
| Suivi | Machine | 4 | Suivi |
| Suivi | Journal | 4 | Machine |
| Suivi | Réglages | 4 | Journal |
| Fichiers | Menu | 4 | Préparer |
| Fichiers | Préparer | 4 | Menu |
| Fichiers | Fichiers | 4 | Préparer |
| Fichiers | Suivi | 4 | Fichiers |
| Fichiers | Machine | 4 | Suivi |
| Fichiers | Journal | 4 | Machine |
| Fichiers | Réglages | 4 | Journal |
| Préparer | Zéro X | 1 | Zéro Y |
| Préparer | Zéro Y | 1 | Zéro X |
| Préparer | Zéro Z | 1 | Zéro Y |
| Préparer | 0.1 | 3 | 1 |
| Préparer | 1 | 3 | 0.1 |
| Préparer | 10 | 3 | 1 |
| Préparer | Y+ | 0 | Fichiers |
| Préparer | Menu | 4 | Préparer |
| Préparer | Préparer | 3.9 | Y+ |
| Préparer | Fichiers | 0 | Y+ |
| Préparer | Suivi | 0 | Y+ |
| Préparer | Machine | 4 | Suivi |
| Préparer | Journal | 4 | Machine |
| Préparer | Réglages | 4 | Journal |
| Machine | Menu | 4 | Préparer |
| Machine | Préparer | 4 | Menu |
| Machine | Fichiers | 4 | Préparer |
| Machine | Suivi | 4 | Fichiers |
| Machine | Machine | 4 | Suivi |
| Machine | Journal | 4 | Machine |
| Machine | Réglages | 4 | Journal |
| Journal | Tout | 0 | Erreurs |
| Journal | Erreurs | 0 | Tout |
| Journal | Travaux | 0 | Erreurs |
| Journal | Alarmes | 0 | Travaux |
| Journal | Cette session | 0 | Serveur |
| Journal | Serveur | 0 | Cette session |
| Journal | Menu | 4 | Préparer |
| Journal | Préparer | 4 | Menu |
| Journal | Fichiers | 4 | Préparer |
| Journal | Suivi | 4 | Fichiers |
| Journal | Machine | 4 | Suivi |
| Journal | Journal | 4 | Machine |
| Journal | Réglages | 4 | Journal |
| Réglages | Verrouiller l’écranDésactivé | 0 | Menu |
| Réglages | Menu | 0 | Verrouiller l’écranDésactivé |
| Réglages | Préparer | 0 | Verrouiller l’écranDésactivé |
| Réglages | Fichiers | 0 | Verrouiller l’écranDésactivé |
| Réglages | Suivi | 0 | Verrouiller l’écranDésactivé |
| Réglages | Machine | 0 | Verrouiller l’écranDésactivé |
| Réglages | Journal | 0 | Verrouiller l’écranDésactivé |
| Réglages | Réglages | 0 | Verrouiller l’écranDésactivé |

Targets whose centre is covered by another element:

| Screen | Label | Element hit at centre |
| --- | --- | --- |
| Préparer | Y+ | RetourMenuPréparerFichiersSuiviMachineJournalRéglages |
| Réglages | Verrouiller l’écranDésactivé | Suivi |

## Tap targets — 1366x768 clavier virtuel (1366x448) (`responsive-1366x768-clavier-virtuel-1366x448/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Menu | 1 | 17 | 0 | 0 / 0 | 16–16–28 | 7 | 3 | 0 | no |
| Suivi | 1 | 21 | 0 | 0 / 0 | 16–18–18 | 17 | 0 | 0 | no |
| Fichiers | 1 | 18 | 0 | 0 / 0 | 16–16–20 | 11 | 1 | 0 | no |
| Préparer | 1 | 28 | 0 | 0 / 0 | 16–18–28 | 15 | 2 | 0 | no |
| Machine | 1 | 18 | 0 | 0 / 0 | 16–16–18 | 7 | 0 | 0 | no |
| Journal | 1 | 19 | 0 | 0 / 0 | 16–18–18 | 13 | 0 | 0 | no |
| Réglages | 1 | 16 | 0 | 0 / 0 | 16–16–21 | 9 | 0 | 0 | no |

Gaps under 12 px (touching segmented buttons included):

| Screen | Label | Gap px | Neighbour |
| --- | --- | ---: | --- |
| Menu | Menu | 4 | Préparer |
| Menu | Préparer | 4 | Menu |
| Menu | Fichiers | 4 | Préparer |
| Menu | Suivi | 4 | Fichiers |
| Menu | Machine | 4 | Suivi |
| Menu | Journal | 4 | Machine |
| Menu | Réglages | 4 | Journal |
| Suivi | −10 % | 8 | 100 % |
| Suivi | 100 % | 8 | −10 % |
| Suivi | +10 % | 8 | 100 % |
| Suivi | −1 % | 8 | +1 % |
| Suivi | +1 % | 8 | −1 % |
| Suivi | −10 % | 8 | 100 % |
| Suivi | 100 % | 8 | −10 % |
| Suivi | +10 % | 8 | 100 % |
| Suivi | −1 % | 8 | +1 % |
| Suivi | +1 % | 8 | −1 % |
| Suivi | Menu | 4 | Préparer |
| Suivi | Préparer | 4 | Menu |
| Suivi | Fichiers | 4 | Préparer |
| Suivi | Suivi | 4 | Fichiers |
| Suivi | Machine | 4 | Suivi |
| Suivi | Journal | 4 | Machine |
| Suivi | Réglages | 4 | Journal |
| Fichiers | ↻ Actualiser | 8 | Nom, matière, outil, notes… |
| Fichiers | Nom, matière, outil, notes… | 8 | ↻ Actualiser |
| Fichiers | ★ Favoris seulement | 8 | ＋ Ajouter un fichier |
| Fichiers | ＋ Ajouter un fichier | 8 | ★ Favoris seulement |
| Fichiers | Menu | 4 | Préparer |
| Fichiers | Préparer | 4 | Menu |
| Fichiers | Fichiers | 4 | Préparer |
| Fichiers | Suivi | 4 | Fichiers |
| Fichiers | Machine | 4 | Suivi |
| Fichiers | Journal | 4 | Machine |
| Fichiers | Réglages | 4 | Journal |
| Préparer | Zéro X | 1 | Zéro Y |
| Préparer | Zéro Y | 1 | Zéro X |
| Préparer | Zéro Z | 1 | Zéro Y |
| Préparer | 0.1 | 3 | 1 |
| Préparer | 1 | 3 | 0.1 |
| Préparer | 10 | 3 | 1 |
| Préparer | Zéro XYZ | 10.6 | 0.1 |
| Préparer | Vitesse du test… | 10.6 | 1 |
| Préparer | Menu | 4 | Préparer |
| Préparer | Préparer | 4 | Menu |
| Préparer | Fichiers | 4 | Préparer |
| Préparer | Suivi | 4 | Fichiers |
| Préparer | Machine | 4 | Suivi |
| Préparer | Journal | 4 | Machine |
| Préparer | Réglages | 4 | Journal |
| Machine | Menu | 4 | Préparer |
| Machine | Préparer | 4 | Menu |
| Machine | Fichiers | 4 | Préparer |
| Machine | Suivi | 4 | Fichiers |
| Machine | Machine | 4 | Suivi |
| Machine | Journal | 4 | Machine |
| Machine | Réglages | 4 | Journal |
| Journal | Tout | 0 | Erreurs |
| Journal | Erreurs | 0 | Tout |
| Journal | Travaux | 0 | Erreurs |
| Journal | Alarmes | 0 | Travaux |
| Journal | Cette session | 0 | Serveur |
| Journal | Serveur | 0 | Cette session |
| Journal | Menu | 4 | Préparer |
| Journal | Préparer | 4 | Menu |
| Journal | Fichiers | 4 | Préparer |
| Journal | Suivi | 4 | Fichiers |
| Journal | Machine | 4 | Suivi |
| Journal | Journal | 4 | Machine |
| Journal | Réglages | 4 | Journal |
| Réglages | Affichage | 10 | Système |
| Réglages | Système | 10 | Affichage |
| Réglages | Menu | 4 | Préparer |
| Réglages | Préparer | 4 | Menu |
| Réglages | Fichiers | 4 | Préparer |
| Réglages | Suivi | 4 | Fichiers |
| Réglages | Machine | 4 | Suivi |
| Réglages | Journal | 4 | Machine |
| Réglages | Réglages | 4 | Journal |

Targets whose centre is covered by another element:

| Screen | Label | Element hit at centre |
| --- | --- | --- |
| Menu | MachineÉtat et limitesAlarme | nothing |
| Menu | JournalÉvénements et exportsChronologie et export | nothing |
| Menu | RéglagesAffichage · veille · systèmeAffichage · veille · sys | nothing |
| Fichiers | Parcours_de_test_3.gcode233 Ko · 14/10/2026 10:00:00 | nothing |
| Préparer | Coordonnées · préparer sans mouvement | nothing |
| Préparer | Y− | nothing |

## Tap targets — 720x1080 portrait clavier virtuel (720x700) (`responsive-720x1080-portrait-clavier-virtuel-720x700/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Menu | 1 | 16 | 0 | 0 / 0 | 16–16–28 | 9 | 2 | 0 | no |
| Suivi | 1 | 11 | 0 | 0 / 0 | 16–16–24 | 7 | 0 | 0 | no |
| Fichiers | 1 | 17 | 0 | 0 / 0 | 16–16–20 | 13 | 0 | 0 | no |
| Préparer | 1 | 21 | 0 | 0 / 0 | 16–18–20 | 16 | 1 | 0 | no |
| Machine | 1 | 17 | 0 | 0 / 0 | 16–16–18 | 7 | 0 | 0 | no |
| Journal | 1 | 18 | 0 | 0 / 0 | 16–18–18 | 13 | 0 | 0 | no |
| Réglages | 1 | 14 | 0 | 0 / 0 | 16–16–21 | 9 | 0 | 0 | no |

Gaps under 12 px (touching segmented buttons included):

| Screen | Label | Gap px | Neighbour |
| --- | --- | ---: | --- |
| Menu | JournalÉvénements et exportsChronologie et export | 0 | Menu |
| Menu | RéglagesAffichage · veille · systèmeAffichage · veille · sys | 0 | Suivi |
| Menu | Menu | 0 | JournalÉvénements et exportsChronologie et export |
| Menu | Préparer | 0 | JournalÉvénements et exportsChronologie et export |
| Menu | Fichiers | 0 | JournalÉvénements et exportsChronologie et export |
| Menu | Suivi | 0 | JournalÉvénements et exportsChronologie et export |
| Menu | Machine | 0 | RéglagesAffichage · veille · systèmeAffichage · veille · sys |
| Menu | Journal | 0 | RéglagesAffichage · veille · systèmeAffichage · veille · sys |
| Menu | Réglages | 0 | RéglagesAffichage · veille · systèmeAffichage · veille · sys |
| Suivi | Menu | 4 | Préparer |
| Suivi | Préparer | 4 | Menu |
| Suivi | Fichiers | 4 | Préparer |
| Suivi | Suivi | 4 | Fichiers |
| Suivi | Machine | 4 | Suivi |
| Suivi | Journal | 4 | Machine |
| Suivi | Réglages | 4 | Journal |
| Fichiers | ↻ Actualiser | 8 | Nom, matière, outil, notes… |
| Fichiers | Nom, matière, outil, notes… | 8 | ↻ Actualiser |
| Fichiers | ★ Favoris seulement | 8 | ＋ Ajouter un fichier |
| Fichiers | Parcours_de_test_3.gcode233 Ko · 14/10/2026 10:00:00 | 10 | Suivant → |
| Fichiers | Suivant → | 10 | Parcours_de_test_3.gcode233 Ko · 14/10/2026 10:00:00 |
| Fichiers | ＋ Ajouter un fichier | 8 | ★ Favoris seulement |
| Fichiers | Menu | 4 | Préparer |
| Fichiers | Préparer | 4 | Menu |
| Fichiers | Fichiers | 4 | Préparer |
| Fichiers | Suivi | 4 | Fichiers |
| Fichiers | Machine | 4 | Suivi |
| Fichiers | Journal | 4 | Machine |
| Fichiers | Réglages | 4 | Journal |
| Préparer | Zéro X | 1 | Zéro Y |
| Préparer | Zéro Y | 1 | Zéro X |
| Préparer | Zéro Z | 1 | Zéro Y |
| Préparer | 0.1 | 3 | 1 |
| Préparer | 1 | 3 | 0.1 |
| Préparer | 10 | 3 | 1 |
| Préparer | Zéro XYZ | 6.1 | Menu |
| Préparer | Vitesse du test… | 6.1 | Suivi |
| Préparer | Coordonnées · préparer sans mouvement | 0 | Menu |
| Préparer | Menu | 0 | Coordonnées · préparer sans mouvement |
| Préparer | Préparer | 0 | Coordonnées · préparer sans mouvement |
| Préparer | Fichiers | 0 | Coordonnées · préparer sans mouvement |
| Préparer | Suivi | 0 | Coordonnées · préparer sans mouvement |
| Préparer | Machine | 0 | Coordonnées · préparer sans mouvement |
| Préparer | Journal | 0 | Coordonnées · préparer sans mouvement |
| Préparer | Réglages | 0 | Coordonnées · préparer sans mouvement |
| Machine | Menu | 4 | Préparer |
| Machine | Préparer | 4 | Menu |
| Machine | Fichiers | 4 | Préparer |
| Machine | Suivi | 4 | Fichiers |
| Machine | Machine | 4 | Suivi |
| Machine | Journal | 4 | Machine |
| Machine | Réglages | 4 | Journal |
| Journal | Tout | 0 | Erreurs |
| Journal | Erreurs | 0 | Tout |
| Journal | Travaux | 0 | Erreurs |
| Journal | Alarmes | 0 | Travaux |
| Journal | Cette session | 0 | Serveur |
| Journal | Serveur | 0 | Cette session |
| Journal | Menu | 4 | Préparer |
| Journal | Préparer | 4 | Menu |
| Journal | Fichiers | 4 | Préparer |
| Journal | Suivi | 4 | Fichiers |
| Journal | Machine | 4 | Suivi |
| Journal | Journal | 4 | Machine |
| Journal | Réglages | 4 | Journal |
| Réglages | Affichage | 10 | Système |
| Réglages | Système | 10 | Affichage |
| Réglages | Menu | 4 | Préparer |
| Réglages | Préparer | 4 | Menu |
| Réglages | Fichiers | 4 | Préparer |
| Réglages | Suivi | 4 | Fichiers |
| Réglages | Machine | 4 | Suivi |
| Réglages | Journal | 4 | Machine |
| Réglages | Réglages | 4 | Journal |

Targets whose centre is covered by another element:

| Screen | Label | Element hit at centre |
| --- | --- | --- |
| Menu | JournalÉvénements et exportsChronologie et export | nothing |
| Menu | RéglagesAffichage · veille · systèmeAffichage · veille · sys | nothing |
| Préparer | Coordonnées · préparer sans mouvement | Suivi |

## Tap targets — sim 1366x768 fr (job running, paused, alarm, alarm at rest) (`sim-1366x768-fr/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Suivi · loaded | 1 | 18 | 0 | 0 / 0 | 16–16–24 | 5 | 0 | 0 | no |
| Confirmation · dialog | 1 | 3 | 0 | 0 / 0 | null–null–null | 3 | 0 | 0 | no |
| Suivi · running | 1 | 33 | 0 | 0 / 0 | 16–18–24 | 5 | 0 | 0 | no |
| Préparer · running | 1 | 28 | 0 | 0 / 0 | 16–18–28 | 6 | 0 | 0 | no |
| Suivi · paused | 1 | 32 | 0 | 0 / 0 | 16–18–24 | 5 | 0 | 0 | no |
| Machine · alarm | 1 | 15 | 0 | 0 / 0 | 16–18–20 | 0 | 0 | 0 | no |
| Suivi · alarm | 1 | 31 | 0 | 0 / 0 | 16–18–24 | 5 | 0 | 0 | no |
| Suivi · alarm-idle | 1 | 31 | 0 | 0 / 0 | 16–18–24 | 5 | 0 | 0 | no |

Gaps under 12 px (touching segmented buttons included):

| Screen | Label | Gap px | Neighbour |
| --- | --- | ---: | --- |
| Suivi · loaded | 2D | 0 | Iso |
| Suivi · loaded | Iso | 0 | 2D |
| Suivi · loaded | Face | 0 | Iso |
| Suivi · loaded | Côté | 0 | Face |
| Suivi · loaded | Dessus | 0 | Côté |
| Confirmation · dialog | Je souhaite lancer cette simulation. | 0 | 100 % |
| Confirmation · dialog | Annuler | 0 | 100 % |
| Confirmation · dialog | Confirmer | 0 | −1 % |
| Suivi · running | 2D | 0 | Iso |
| Suivi · running | Iso | 0 | 2D |
| Suivi · running | Face | 0 | Iso |
| Suivi · running | Côté | 0 | Face |
| Suivi · running | Dessus | 0 | Côté |
| Préparer · running | 0.1 | 3 | 1 |
| Préparer · running | 1 | 3 | 0.1 |
| Préparer · running | 10 | 3 | 1 |
| Préparer · running | Zéro XYZ | 8 | Coordonnées · Aller à / Définir |
| Préparer · running | Réinitialiser… | 8 | Coordonnées · Aller à / Définir |
| Préparer · running | Coordonnées · Aller à / Définir | 8 | Zéro XYZ |
| Suivi · paused | 2D | 0 | Iso |
| Suivi · paused | Iso | 0 | 2D |
| Suivi · paused | Face | 0 | Iso |
| Suivi · paused | Côté | 0 | Face |
| Suivi · paused | Dessus | 0 | Côté |
| Suivi · alarm | 2D | 0 | Iso |
| Suivi · alarm | Iso | 0 | 2D |
| Suivi · alarm | Face | 0 | Iso |
| Suivi · alarm | Côté | 0 | Face |
| Suivi · alarm | Dessus | 0 | Côté |
| Suivi · alarm-idle | 2D | 0 | Iso |
| Suivi · alarm-idle | Iso | 0 | 2D |
| Suivi · alarm-idle | Face | 0 | Iso |
| Suivi · alarm-idle | Côté | 0 | Face |
| Suivi · alarm-idle | Dessus | 0 | Côté |

## Tap targets — sim 1366x768 fr (alarm at rest, end summary not acknowledged) (`sim-1366x768-fr/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Suivi · alarm-idle-summary | 1 | 17 | 0 | 0 / 0 | 16–16–18 | 5 | 0 | 0 | no |

Gaps under 12 px (touching segmented buttons included):

| Screen | Label | Gap px | Neighbour |
| --- | --- | ---: | --- |
| Suivi · alarm-idle-summary | 2D | 0 | Iso |
| Suivi · alarm-idle-summary | Iso | 0 | 2D |
| Suivi · alarm-idle-summary | Face | 0 | Iso |
| Suivi · alarm-idle-summary | Côté | 0 | Face |
| Suivi · alarm-idle-summary | Dessus | 0 | Côté |

## Tap targets — sim 1366x768 es (job running, paused, alarm, alarm at rest) (`sim-1366x768-es/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Suivi · loaded | 1 | 18 | 0 | 0 / 0 | 16–16–24 | 5 | 0 | 0 | no |
| Confirmation · dialog | 1 | 3 | 0 | 0 / 0 | null–null–null | 3 | 0 | 0 | no |
| Suivi · running | 1 | 33 | 0 | 0 / 0 | 16–18–24 | 5 | 0 | 0 | no |
| Préparer · running | 1 | 28 | 0 | 0 / 0 | 16–18–28 | 6 | 0 | 0 | no |
| Suivi · paused | 1 | 32 | 0 | 0 / 0 | 16–18–24 | 5 | 0 | 0 | no |
| Machine · alarm | 1 | 15 | 0 | 0 / 0 | 16–18–20 | 0 | 0 | 0 | no |
| Suivi · alarm | 1 | 31 | 0 | 0 / 0 | 16–18–24 | 5 | 0 | 0 | no |
| Suivi · alarm-idle | 1 | 31 | 0 | 0 / 0 | 16–18–24 | 5 | 0 | 0 | no |

Gaps under 12 px (touching segmented buttons included):

| Screen | Label | Gap px | Neighbour |
| --- | --- | ---: | --- |
| Suivi · loaded | 2D | 0 | Iso |
| Suivi · loaded | Iso | 0 | 2D |
| Suivi · loaded | Frente | 0 | Iso |
| Suivi · loaded | Lado | 0 | Frente |
| Suivi · loaded | Superior | 0 | Lado |
| Confirmation · dialog | Deseo iniciar esta simulación. | 0 | 100 % |
| Confirmation · dialog | Cancelar | 0 | 100 % |
| Confirmation · dialog | Confirmar | 0 | −1 % |
| Suivi · running | 2D | 0 | Iso |
| Suivi · running | Iso | 0 | 2D |
| Suivi · running | Frente | 0 | Iso |
| Suivi · running | Lado | 0 | Frente |
| Suivi · running | Superior | 0 | Lado |
| Préparer · running | 0.1 | 3 | 1 |
| Préparer · running | 1 | 3 | 0.1 |
| Préparer · running | 10 | 3 | 1 |
| Préparer · running | Cero XYZ | 8 | Coordenadas · Ir a / Definir |
| Préparer · running | Restablecer… | 8 | Coordenadas · Ir a / Definir |
| Préparer · running | Coordenadas · Ir a / Definir | 8 | Cero XYZ |
| Suivi · paused | 2D | 0 | Iso |
| Suivi · paused | Iso | 0 | 2D |
| Suivi · paused | Frente | 0 | Iso |
| Suivi · paused | Lado | 0 | Frente |
| Suivi · paused | Superior | 0 | Lado |
| Suivi · alarm | 2D | 0 | Iso |
| Suivi · alarm | Iso | 0 | 2D |
| Suivi · alarm | Frente | 0 | Iso |
| Suivi · alarm | Lado | 0 | Frente |
| Suivi · alarm | Superior | 0 | Lado |
| Suivi · alarm-idle | 2D | 0 | Iso |
| Suivi · alarm-idle | Iso | 0 | 2D |
| Suivi · alarm-idle | Frente | 0 | Iso |
| Suivi · alarm-idle | Lado | 0 | Frente |
| Suivi · alarm-idle | Superior | 0 | Lado |

## Tap targets — sim 1366x768 es (alarm at rest, end summary not acknowledged) (`sim-1366x768-es/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Suivi · alarm-idle-summary | 1 | 17 | 0 | 0 / 0 | 16–16–18 | 5 | 0 | 0 | no |

Gaps under 12 px (touching segmented buttons included):

| Screen | Label | Gap px | Neighbour |
| --- | --- | ---: | --- |
| Suivi · alarm-idle-summary | 2D | 0 | Iso |
| Suivi · alarm-idle-summary | Iso | 0 | 2D |
| Suivi · alarm-idle-summary | Frente | 0 | Iso |
| Suivi · alarm-idle-summary | Lado | 0 | Frente |
| Suivi · alarm-idle-summary | Superior | 0 | Lado |

## Tap targets — sim 1024x600 fr (job running, paused, alarm, alarm at rest) (`sim-1024x600-fr/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Suivi · loaded | 1 | 33 | 0 | 0 / 0 | 16–18–24 | 18 | 0 | 2 | no |
| Confirmation · dialog | 1 | 3 | 0 | 0 / 0 | null–null–null | 3 | 0 | 2 | no |
| Suivi · running | 1 | 33 | 0 | 0 / 0 | 16–18–24 | 18 | 0 | 2 | no |
| Préparer · running | 1 | 28 | 0 | 0 / 0 | 16–18–28 | 9 | 0 | 1 | no |
| Suivi · paused | 1 | 32 | 0 | 0 / 0 | 16–18–24 | 18 | 0 | 1 | no |
| Machine · alarm | 1 | 15 | 0 | 0 / 0 | 16–16–20 | 0 | 0 | 1 | no |
| Suivi · alarm | 1 | 31 | 0 | 0 / 0 | 16–18–24 | 18 | 0 | 2 | no |
| Suivi · alarm-idle | 1 | 31 | 0 | 0 / 0 | 16–18–24 | 18 | 0 | 2 | no |

Gaps under 12 px (touching segmented buttons included):

| Screen | Label | Gap px | Neighbour |
| --- | --- | ---: | --- |
| Suivi · loaded | 2D | 0 | Iso |
| Suivi · loaded | Iso | 0 | 2D |
| Suivi · loaded | Face | 0 | Iso |
| Suivi · loaded | Côté | 0 | Face |
| Suivi · loaded | Dessus | 0 | Côté |
| Suivi · loaded | −10 % | 8 | 100 % |
| Suivi · loaded | 100 % | 8 | −10 % |
| Suivi · loaded | +10 % | 8 | 100 % |
| Suivi · loaded | −1 % | 3.5 | +1 % |
| Suivi · loaded | +1 % | 3.5 | −1 % |
| Suivi · loaded | −10 % | 8 | 100 % |
| Suivi · loaded | 100 % | 8 | −10 % |
| Suivi · loaded | +10 % | 8 | 100 % |
| Suivi · loaded | −1 % | 3.5 | +1 % |
| Suivi · loaded | +1 % | 3.5 | −1 % |
| Suivi · loaded | 25 % | 8 | 50 % |
| Suivi · loaded | 50 % | 8 | 25 % |
| Suivi · loaded | 100 % | 8 | 50 % |
| Confirmation · dialog | Je souhaite lancer cette simulation. | 0 | −10 % |
| Confirmation · dialog | Annuler | 0 | −10 % |
| Confirmation · dialog | Confirmer | 0 | +10 % |
| Suivi · running | 2D | 0 | Iso |
| Suivi · running | Iso | 0 | 2D |
| Suivi · running | Face | 0 | Iso |
| Suivi · running | Côté | 0 | Face |
| Suivi · running | Dessus | 0 | Côté |
| Suivi · running | −10 % | 8 | 100 % |
| Suivi · running | 100 % | 8 | −10 % |
| Suivi · running | +10 % | 8 | 100 % |
| Suivi · running | −1 % | 3.5 | +1 % |
| Suivi · running | +1 % | 3.5 | −1 % |
| Suivi · running | −10 % | 8 | 100 % |
| Suivi · running | 100 % | 8 | −10 % |
| Suivi · running | +10 % | 8 | 100 % |
| Suivi · running | −1 % | 3.5 | +1 % |
| Suivi · running | +1 % | 3.5 | −1 % |
| Suivi · running | 25 % | 8 | 50 % |
| Suivi · running | 50 % | 8 | 25 % |
| Suivi · running | 100 % | 8 | 50 % |
| Préparer · running | Zéro X | 1 | Zéro Y |
| Préparer · running | Zéro Y | 1 | Zéro X |
| Préparer · running | Zéro Z | 1 | Zéro Y |
| Préparer · running | 0.1 | 3 | 1 |
| Préparer · running | 1 | 3 | 0.1 |
| Préparer · running | 10 | 3 | 1 |
| Préparer · running | Zéro XYZ | 4 | Coordonnées · Aller à / Définir |
| Préparer · running | Réinitialiser… | 4 | Coordonnées · Aller à / Définir |
| Préparer · running | Coordonnées · Aller à / Définir | 4 | Zéro XYZ |
| Suivi · paused | 2D | 0 | Iso |
| Suivi · paused | Iso | 0 | 2D |
| Suivi · paused | Face | 0 | Iso |
| Suivi · paused | Côté | 0 | Face |
| Suivi · paused | Dessus | 0 | Côté |
| Suivi · paused | −10 % | 8 | 100 % |
| Suivi · paused | 100 % | 8 | −10 % |
| Suivi · paused | +10 % | 8 | 100 % |
| Suivi · paused | −1 % | 3.5 | +1 % |
| Suivi · paused | +1 % | 3.5 | −1 % |
| Suivi · paused | −10 % | 8 | 100 % |
| Suivi · paused | 100 % | 8 | −10 % |
| Suivi · paused | +10 % | 8 | 100 % |
| Suivi · paused | −1 % | 3.5 | +1 % |
| Suivi · paused | +1 % | 3.5 | −1 % |
| Suivi · paused | 25 % | 8 | 50 % |
| Suivi · paused | 50 % | 8 | 25 % |
| Suivi · paused | 100 % | 8 | 50 % |
| Suivi · alarm | 2D | 0 | Iso |
| Suivi · alarm | Iso | 0 | 2D |
| Suivi · alarm | Face | 0 | Iso |
| Suivi · alarm | Côté | 0 | Face |
| Suivi · alarm | Dessus | 0 | Côté |
| Suivi · alarm | −10 % | 8 | 100 % |
| Suivi · alarm | 100 % | 8 | −10 % |
| Suivi · alarm | +10 % | 8 | 100 % |
| Suivi · alarm | −1 % | 3.5 | +1 % |
| Suivi · alarm | +1 % | 3.5 | −1 % |
| Suivi · alarm | −10 % | 8 | 100 % |
| Suivi · alarm | 100 % | 8 | −10 % |
| Suivi · alarm | +10 % | 8 | 100 % |
| Suivi · alarm | −1 % | 3.5 | +1 % |
| Suivi · alarm | +1 % | 3.5 | −1 % |
| Suivi · alarm | 25 % | 8 | 50 % |
| Suivi · alarm | 50 % | 8 | 25 % |
| Suivi · alarm | 100 % | 8 | 50 % |
| Suivi · alarm-idle | 2D | 0 | Iso |
| Suivi · alarm-idle | Iso | 0 | 2D |
| Suivi · alarm-idle | Face | 0 | Iso |
| Suivi · alarm-idle | Côté | 0 | Face |
| Suivi · alarm-idle | Dessus | 0 | Côté |
| Suivi · alarm-idle | −10 % | 8 | 100 % |
| Suivi · alarm-idle | 100 % | 8 | −10 % |
| Suivi · alarm-idle | +10 % | 8 | 100 % |
| Suivi · alarm-idle | −1 % | 3.5 | +1 % |
| Suivi · alarm-idle | +1 % | 3.5 | −1 % |
| Suivi · alarm-idle | −10 % | 8 | 100 % |
| Suivi · alarm-idle | 100 % | 8 | −10 % |
| Suivi · alarm-idle | +10 % | 8 | 100 % |
| Suivi · alarm-idle | −1 % | 3.5 | +1 % |
| Suivi · alarm-idle | +1 % | 3.5 | −1 % |
| Suivi · alarm-idle | 25 % | 8 | 50 % |
| Suivi · alarm-idle | 50 % | 8 | 25 % |
| Suivi · alarm-idle | 100 % | 8 | 50 % |

Text wider than its box (scrollWidth > clientWidth, overflow not visible):

| Screen | Text | Widths | text-overflow |
| --- | --- | --- | --- |
| Suivi · loaded | Parcours_de_test_1.gcode | 231 > 165 | ellipsis |
| Suivi · loaded | Selon les mouvements (sans accélérations) : au moins 4 min · | 740 > 322 | ellipsis |
| Confirmation · dialog | Parcours_de_test_1.gcode | 231 > 165 | ellipsis |
| Confirmation · dialog | Selon les mouvements (sans accélérations) : au moins 4 min · | 740 > 322 | ellipsis |
| Suivi · running | Parcours_de_test_1.gcode | 231 > 16 | ellipsis |
| Suivi · running | Selon les mouvements : 4 min restantes · rapides non comptés | 599 > 322 | ellipsis |
| Préparer · running | Parcours_de_test_1.gcode | 231 > 16 | ellipsis |
| Suivi · paused | Selon les mouvements : 4 min restantes · rapides non comptés | 599 > 322 | ellipsis |
| Machine · alarm | Parcours_de_test_1.gcode | 231 > 108 | ellipsis |
| Suivi · alarm | Parcours_de_test_1.gcode | 231 > 108 | ellipsis |
| Suivi · alarm | Selon les mouvements : 4 min restantes · rapides non comptés | 599 > 322 | ellipsis |
| Suivi · alarm-idle | Parcours_de_test_1.gcode | 231 > 165 | ellipsis |
| Suivi · alarm-idle | Selon les mouvements (sans accélérations) : au moins 4 min · | 740 > 322 | ellipsis |

## Tap targets — sim 1024x600 fr (alarm at rest, end summary not acknowledged) (`sim-1024x600-fr/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Suivi · alarm-idle-summary | 1 | 32 | 0 | 0 / 0 | 16–18–24 | 19 | 0 | 2 | no |

Gaps under 12 px (touching segmented buttons included):

| Screen | Label | Gap px | Neighbour |
| --- | --- | ---: | --- |
| Suivi · alarm-idle-summary | Agrandir le tracé | 2 | Dessus |
| Suivi · alarm-idle-summary | 2D | 0 | Iso |
| Suivi · alarm-idle-summary | Iso | 0 | 2D |
| Suivi · alarm-idle-summary | Face | 0 | Iso |
| Suivi · alarm-idle-summary | Côté | 0 | Face |
| Suivi · alarm-idle-summary | Dessus | 0 | Côté |
| Suivi · alarm-idle-summary | −10 % | 8 | 100 % |
| Suivi · alarm-idle-summary | 100 % | 8 | −10 % |
| Suivi · alarm-idle-summary | +10 % | 8 | 100 % |
| Suivi · alarm-idle-summary | −1 % | 1.7 | +1 % |
| Suivi · alarm-idle-summary | +1 % | 1.7 | −1 % |
| Suivi · alarm-idle-summary | −10 % | 8 | 100 % |
| Suivi · alarm-idle-summary | 100 % | 8 | −10 % |
| Suivi · alarm-idle-summary | +10 % | 8 | 100 % |
| Suivi · alarm-idle-summary | −1 % | 1.7 | +1 % |
| Suivi · alarm-idle-summary | +1 % | 1.7 | −1 % |
| Suivi · alarm-idle-summary | 25 % | 8 | 50 % |
| Suivi · alarm-idle-summary | 50 % | 8 | 25 % |
| Suivi · alarm-idle-summary | 100 % | 8 | 50 % |

Text wider than its box (scrollWidth > clientWidth, overflow not visible):

| Screen | Text | Widths | text-overflow |
| --- | --- | --- | --- |
| Suivi · alarm-idle-summary | Parcours_de_test_1.gcode | 231 > 165 | ellipsis |
| Suivi · alarm-idle-summary | Selon les mouvements (sans accélérations) : au moins 4 min · | 740 > 322 | ellipsis |

## Tap targets — sim 1024x600 es (job running, paused, alarm, alarm at rest) (`sim-1024x600-es/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Suivi · loaded | 1 | 33 | 0 | 0 / 0 | 16–18–24 | 19 | 0 | 2 | no |
| Confirmation · dialog | 1 | 3 | 0 | 0 / 0 | null–null–null | 3 | 0 | 2 | no |
| Suivi · running | 1 | 33 | 0 | 0 / 0 | 16–18–24 | 19 | 0 | 1 | no |
| Préparer · running | 1 | 28 | 0 | 0 / 0 | 16–18–28 | 9 | 0 | 0 | no |
| Suivi · paused | 1 | 32 | 0 | 0 / 0 | 16–18–24 | 19 | 0 | 1 | no |
| Machine · alarm | 1 | 15 | 0 | 0 / 0 | 16–16–20 | 0 | 0 | 1 | no |
| Suivi · alarm | 1 | 31 | 0 | 0 / 0 | 16–18–24 | 19 | 0 | 2 | no |
| Suivi · alarm-idle | 1 | 31 | 0 | 0 / 0 | 16–18–24 | 19 | 0 | 2 | no |

Gaps under 12 px (touching segmented buttons included):

| Screen | Label | Gap px | Neighbour |
| --- | --- | ---: | --- |
| Suivi · loaded | Ampliar la trayectoria | 0 | Superior |
| Suivi · loaded | 2D | 0 | Iso |
| Suivi · loaded | Iso | 0 | 2D |
| Suivi · loaded | Frente | 0 | Iso |
| Suivi · loaded | Lado | 0 | Frente |
| Suivi · loaded | Superior | 0 | Ampliar la trayectoria |
| Suivi · loaded | −10 % | 8 | 100 % |
| Suivi · loaded | 100 % | 8 | −10 % |
| Suivi · loaded | +10 % | 8 | 100 % |
| Suivi · loaded | −1 % | 3.5 | +1 % |
| Suivi · loaded | +1 % | 3.5 | −1 % |
| Suivi · loaded | −10 % | 8 | 100 % |
| Suivi · loaded | 100 % | 8 | −10 % |
| Suivi · loaded | +10 % | 8 | 100 % |
| Suivi · loaded | −1 % | 3.5 | +1 % |
| Suivi · loaded | +1 % | 3.5 | −1 % |
| Suivi · loaded | 25 % | 8 | 50 % |
| Suivi · loaded | 50 % | 8 | 25 % |
| Suivi · loaded | 100 % | 8 | 50 % |
| Confirmation · dialog | Deseo iniciar esta simulación. | 0 | −10 % |
| Confirmation · dialog | Cancelar | 0 | −10 % |
| Confirmation · dialog | Confirmar | 0 | +10 % |
| Suivi · running | Ampliar la trayectoria | 0 | Superior |
| Suivi · running | 2D | 0 | Iso |
| Suivi · running | Iso | 0 | 2D |
| Suivi · running | Frente | 0 | Iso |
| Suivi · running | Lado | 0 | Frente |
| Suivi · running | Superior | 0 | Ampliar la trayectoria |
| Suivi · running | −10 % | 8 | 100 % |
| Suivi · running | 100 % | 8 | −10 % |
| Suivi · running | +10 % | 8 | 100 % |
| Suivi · running | −1 % | 3.5 | +1 % |
| Suivi · running | +1 % | 3.5 | −1 % |
| Suivi · running | −10 % | 8 | 100 % |
| Suivi · running | 100 % | 8 | −10 % |
| Suivi · running | +10 % | 8 | 100 % |
| Suivi · running | −1 % | 3.5 | +1 % |
| Suivi · running | +1 % | 3.5 | −1 % |
| Suivi · running | 25 % | 8 | 50 % |
| Suivi · running | 50 % | 8 | 25 % |
| Suivi · running | 100 % | 8 | 50 % |
| Préparer · running | Cero X | 1 | Cero Y |
| Préparer · running | Cero Y | 1 | Cero X |
| Préparer · running | Cero Z | 1 | Cero Y |
| Préparer · running | 0.1 | 3 | 1 |
| Préparer · running | 1 | 3 | 0.1 |
| Préparer · running | 10 | 3 | 1 |
| Préparer · running | Cero XYZ | 4 | Coordenadas · Ir a / Definir |
| Préparer · running | Restablecer… | 4 | Coordenadas · Ir a / Definir |
| Préparer · running | Coordenadas · Ir a / Definir | 4 | Cero XYZ |
| Suivi · paused | Ampliar la trayectoria | 0 | Superior |
| Suivi · paused | 2D | 0 | Iso |
| Suivi · paused | Iso | 0 | 2D |
| Suivi · paused | Frente | 0 | Iso |
| Suivi · paused | Lado | 0 | Frente |
| Suivi · paused | Superior | 0 | Ampliar la trayectoria |
| Suivi · paused | −10 % | 8 | 100 % |
| Suivi · paused | 100 % | 8 | −10 % |
| Suivi · paused | +10 % | 8 | 100 % |
| Suivi · paused | −1 % | 3.5 | +1 % |
| Suivi · paused | +1 % | 3.5 | −1 % |
| Suivi · paused | −10 % | 8 | 100 % |
| Suivi · paused | 100 % | 8 | −10 % |
| Suivi · paused | +10 % | 8 | 100 % |
| Suivi · paused | −1 % | 3.5 | +1 % |
| Suivi · paused | +1 % | 3.5 | −1 % |
| Suivi · paused | 25 % | 8 | 50 % |
| Suivi · paused | 50 % | 8 | 25 % |
| Suivi · paused | 100 % | 8 | 50 % |
| Suivi · alarm | Ampliar la trayectoria | 0 | Superior |
| Suivi · alarm | 2D | 0 | Iso |
| Suivi · alarm | Iso | 0 | 2D |
| Suivi · alarm | Frente | 0 | Iso |
| Suivi · alarm | Lado | 0 | Frente |
| Suivi · alarm | Superior | 0 | Ampliar la trayectoria |
| Suivi · alarm | −10 % | 8 | 100 % |
| Suivi · alarm | 100 % | 8 | −10 % |
| Suivi · alarm | +10 % | 8 | 100 % |
| Suivi · alarm | −1 % | 3.5 | +1 % |
| Suivi · alarm | +1 % | 3.5 | −1 % |
| Suivi · alarm | −10 % | 8 | 100 % |
| Suivi · alarm | 100 % | 8 | −10 % |
| Suivi · alarm | +10 % | 8 | 100 % |
| Suivi · alarm | −1 % | 3.5 | +1 % |
| Suivi · alarm | +1 % | 3.5 | −1 % |
| Suivi · alarm | 25 % | 8 | 50 % |
| Suivi · alarm | 50 % | 8 | 25 % |
| Suivi · alarm | 100 % | 8 | 50 % |
| Suivi · alarm-idle | Ampliar la trayectoria | 0 | Superior |
| Suivi · alarm-idle | 2D | 0 | Iso |
| Suivi · alarm-idle | Iso | 0 | 2D |
| Suivi · alarm-idle | Frente | 0 | Iso |
| Suivi · alarm-idle | Lado | 0 | Frente |
| Suivi · alarm-idle | Superior | 0 | Ampliar la trayectoria |
| Suivi · alarm-idle | −10 % | 8 | 100 % |
| Suivi · alarm-idle | 100 % | 8 | −10 % |
| Suivi · alarm-idle | +10 % | 8 | 100 % |
| Suivi · alarm-idle | −1 % | 3.5 | +1 % |
| Suivi · alarm-idle | +1 % | 3.5 | −1 % |
| Suivi · alarm-idle | −10 % | 8 | 100 % |
| Suivi · alarm-idle | 100 % | 8 | −10 % |
| Suivi · alarm-idle | +10 % | 8 | 100 % |
| Suivi · alarm-idle | −1 % | 3.5 | +1 % |
| Suivi · alarm-idle | +1 % | 3.5 | −1 % |
| Suivi · alarm-idle | 25 % | 8 | 50 % |
| Suivi · alarm-idle | 50 % | 8 | 25 % |
| Suivi · alarm-idle | 100 % | 8 | 50 % |

Text wider than its box (scrollWidth > clientWidth, overflow not visible):

| Screen | Text | Widths | text-overflow |
| --- | --- | --- | --- |
| Suivi · loaded | Parcours_de_test_1.gcode | 231 > 142 | ellipsis |
| Suivi · loaded | Según los movimientos (sin aceleraciones): al menos 4 min ·  | 762 > 322 | ellipsis |
| Confirmation · dialog | Parcours_de_test_1.gcode | 231 > 142 | ellipsis |
| Confirmation · dialog | Según los movimientos (sin aceleraciones): al menos 4 min ·  | 762 > 322 | ellipsis |
| Suivi · running | Según los movimientos: 4 min restantes · rápidos no contados | 629 > 322 | ellipsis |
| Suivi · paused | Según los movimientos: 4 min restantes · rápidos no contados | 629 > 322 | ellipsis |
| Machine · alarm | Parcours_de_test_1.gcode | 231 > 80 | ellipsis |
| Suivi · alarm | Parcours_de_test_1.gcode | 231 > 80 | ellipsis |
| Suivi · alarm | Según los movimientos: 4 min restantes · rápidos no contados | 629 > 322 | ellipsis |
| Suivi · alarm-idle | Parcours_de_test_1.gcode | 231 > 142 | ellipsis |
| Suivi · alarm-idle | Según los movimientos (sin aceleraciones): al menos 4 min ·  | 762 > 322 | ellipsis |

## Tap targets — sim 1024x600 es (alarm at rest, end summary not acknowledged) (`sim-1024x600-es/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Suivi · alarm-idle-summary | 1 | 32 | 0 | 0 / 0 | 16–18–24 | 19 | 0 | 2 | no |

Gaps under 12 px (touching segmented buttons included):

| Screen | Label | Gap px | Neighbour |
| --- | --- | ---: | --- |
| Suivi · alarm-idle-summary | Ampliar la trayectoria | 0 | Superior |
| Suivi · alarm-idle-summary | 2D | 0 | Iso |
| Suivi · alarm-idle-summary | Iso | 0 | 2D |
| Suivi · alarm-idle-summary | Frente | 0 | Iso |
| Suivi · alarm-idle-summary | Lado | 0 | Frente |
| Suivi · alarm-idle-summary | Superior | 0 | Ampliar la trayectoria |
| Suivi · alarm-idle-summary | −10 % | 8 | 100 % |
| Suivi · alarm-idle-summary | 100 % | 8 | −10 % |
| Suivi · alarm-idle-summary | +10 % | 8 | 100 % |
| Suivi · alarm-idle-summary | −1 % | 1.7 | +1 % |
| Suivi · alarm-idle-summary | +1 % | 1.7 | −1 % |
| Suivi · alarm-idle-summary | −10 % | 8 | 100 % |
| Suivi · alarm-idle-summary | 100 % | 8 | −10 % |
| Suivi · alarm-idle-summary | +10 % | 8 | 100 % |
| Suivi · alarm-idle-summary | −1 % | 1.7 | +1 % |
| Suivi · alarm-idle-summary | +1 % | 1.7 | −1 % |
| Suivi · alarm-idle-summary | 25 % | 8 | 50 % |
| Suivi · alarm-idle-summary | 50 % | 8 | 25 % |
| Suivi · alarm-idle-summary | 100 % | 8 | 50 % |

Text wider than its box (scrollWidth > clientWidth, overflow not visible):

| Screen | Text | Widths | text-overflow |
| --- | --- | --- | --- |
| Suivi · alarm-idle-summary | Parcours_de_test_1.gcode | 231 > 142 | ellipsis |
| Suivi · alarm-idle-summary | Según los movimientos (sin aceleraciones): al menos 4 min ·  | 762 > 322 | ellipsis |

## Tap targets — alarm at rest (ALARM:1) 1366x768 fr (`alarm-1-1366x768-fr-standard/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Suivi · alarm at rest | 1 | 32 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 0 | 0 | no |
| Menu · alarm at rest | 1 | 18 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 0 | 0 | no |

## Tap targets — alarm at rest (ALARM:1) 1366x768 fr (report only) (`alarm-1-1366x768-fr-standard/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Machine · alarm at rest | 1 | 19 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 0 | 0 | no |

## Tap targets — alarm at rest (ALARM:1) 1366x768 fr texte agrandi (`alarm-1-1366x768-fr-large/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Suivi · alarm at rest | 1 | 32 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 0 | 0 | no |
| Menu · alarm at rest | 1 | 18 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 0 | 0 | no |

## Tap targets — alarm at rest (ALARM:1) 1366x768 fr texte agrandi (report only) (`alarm-1-1366x768-fr-large/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Machine · alarm at rest | 1 | 19 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 0 | 0 | no |

## Tap targets — alarm at rest (ALARM:1) 1366x768 es (`alarm-1-1366x768-es-standard/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Suivi · alarm at rest | 1 | 32 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 0 | 0 | no |
| Menu · alarm at rest | 1 | 18 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 0 | 0 | no |

## Tap targets — alarm at rest (ALARM:1) 1366x768 es (report only) (`alarm-1-1366x768-es-standard/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Machine · alarm at rest | 1 | 19 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 0 | 0 | no |

## Tap targets — alarm at rest (ALARM:1) 1366x768 es texte agrandi (`alarm-1-1366x768-es-large/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Suivi · alarm at rest | 1 | 32 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 0 | 0 | no |
| Menu · alarm at rest | 1 | 18 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 0 | 0 | no |

## Tap targets — alarm at rest (ALARM:1) 1366x768 es texte agrandi (report only) (`alarm-1-1366x768-es-large/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Machine · alarm at rest | 1 | 19 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 0 | 0 | no |

## Tap targets — alarm at rest (ALARM:1) 1024x600 fr (`alarm-1-1024x600-fr-standard/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Suivi · alarm at rest | 1 | 31 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 0 | 1 | no |
| Menu · alarm at rest | 1 | 17 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 0 | 0 | no |

Text wider than its box (scrollWidth > clientWidth, overflow not visible):

| Screen | Text | Widths | text-overflow |
| --- | --- | --- | --- |
| Suivi · alarm at rest | Selon les mouvements (sans accélérations) : ≈ 4 min | 367 > 322 | ellipsis |

## Tap targets — alarm at rest (ALARM:1) 1024x600 fr (report only) (`alarm-1-1024x600-fr-standard/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Machine · alarm at rest | 1 | 18 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 0 | 0 | no |

## Tap targets — alarm at rest (ALARM:1) 1024x600 fr texte agrandi (`alarm-1-1024x600-fr-large/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Suivi · alarm at rest | 1 | 31 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 0 | 1 | no |
| Menu · alarm at rest | 1 | 17 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 0 | 0 | no |

Text wider than its box (scrollWidth > clientWidth, overflow not visible):

| Screen | Text | Widths | text-overflow |
| --- | --- | --- | --- |
| Suivi · alarm at rest | Selon les mouvements (sans accélérations) : ≈ 4 min | 459 > 322 | ellipsis |

## Tap targets — alarm at rest (ALARM:1) 1024x600 fr texte agrandi (report only) (`alarm-1-1024x600-fr-large/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Machine · alarm at rest | 1 | 18 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 0 | 0 | no |

## Tap targets — alarm at rest (ALARM:1) 1024x600 es (`alarm-1-1024x600-es-standard/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Suivi · alarm at rest | 1 | 31 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 0 | 2 | no |
| Menu · alarm at rest | 1 | 17 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 0 | 1 | no |

Text wider than its box (scrollWidth > clientWidth, overflow not visible):

| Screen | Text | Widths | text-overflow |
| --- | --- | --- | --- |
| Suivi · alarm at rest | Este dispositivo | 126 > 119 | ellipsis |
| Suivi · alarm at rest | Según los movimientos (sin aceleraciones): ≈ 4 min | 360 > 322 | ellipsis |
| Menu · alarm at rest | Este dispositivo | 126 > 119 | ellipsis |

## Tap targets — alarm at rest (ALARM:1) 1024x600 es (report only) (`alarm-1-1024x600-es-standard/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Machine · alarm at rest | 1 | 18 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 0 | 1 | no |

Text wider than its box (scrollWidth > clientWidth, overflow not visible):

| Screen | Text | Widths | text-overflow |
| --- | --- | --- | --- |
| Machine · alarm at rest | Este dispositivo | 126 > 119 | ellipsis |

## Tap targets — alarm at rest (ALARM:1) 1024x600 es texte agrandi (`alarm-1-1024x600-es-large/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Suivi · alarm at rest | 1 | 31 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 0 | 2 | no |
| Menu · alarm at rest | 1 | 17 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 0 | 1 | no |

Text wider than its box (scrollWidth > clientWidth, overflow not visible):

| Screen | Text | Widths | text-overflow |
| --- | --- | --- | --- |
| Suivi · alarm at rest | Este dispositivo | 126 > 119 | ellipsis |
| Suivi · alarm at rest | Según los movimientos (sin aceleraciones): ≈ 4 min | 450 > 322 | ellipsis |
| Menu · alarm at rest | Este dispositivo | 126 > 119 | ellipsis |

## Tap targets — alarm at rest (ALARM:1) 1024x600 es texte agrandi (report only) (`alarm-1-1024x600-es-large/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Machine · alarm at rest | 1 | 18 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 0 | 1 | no |

Text wider than its box (scrollWidth > clientWidth, overflow not visible):

| Screen | Text | Widths | text-overflow |
| --- | --- | --- | --- |
| Machine · alarm at rest | Este dispositivo | 126 > 119 | ellipsis |

## Tap targets — alarm at rest (ALARM:3 deduced) 1366x768 fr (`alarm-3-1366x768-fr-standard/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Suivi · alarm at rest | 1 | 33 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 0 | 0 | no |
| Menu · alarm at rest | 1 | 18 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 0 | 0 | no |

## Tap targets — alarm at rest (ALARM:3 deduced) 1366x768 fr (report only) (`alarm-3-1366x768-fr-standard/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Machine · alarm at rest | 1 | 19 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 0 | 0 | no |

## Tap targets — alarm at rest (ALARM:3 deduced) 1366x768 fr texte agrandi (`alarm-3-1366x768-fr-large/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Suivi · alarm at rest | 1 | 33 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 0 | 0 | no |
| Menu · alarm at rest | 1 | 18 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 0 | 0 | no |

## Tap targets — alarm at rest (ALARM:3 deduced) 1366x768 fr texte agrandi (report only) (`alarm-3-1366x768-fr-large/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Machine · alarm at rest | 1 | 19 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 2 | 0 | no |

Targets whose centre is covered by another element:

| Screen | Label | Element hit at centre |
| --- | --- | --- |
| Machine · alarm at rest | Limites de la machine → | nothing |
| Machine · alarm at rest | Journal des événements → | nothing |

## Tap targets — alarm at rest (ALARM:3 deduced) 1366x768 es (`alarm-3-1366x768-es-standard/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Suivi · alarm at rest | 1 | 33 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 0 | 0 | no |
| Menu · alarm at rest | 1 | 18 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 0 | 0 | no |

## Tap targets — alarm at rest (ALARM:3 deduced) 1366x768 es (report only) (`alarm-3-1366x768-es-standard/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Machine · alarm at rest | 1 | 19 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 0 | 0 | no |

## Tap targets — alarm at rest (ALARM:3 deduced) 1366x768 es texte agrandi (`alarm-3-1366x768-es-large/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Suivi · alarm at rest | 1 | 33 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 0 | 0 | no |
| Menu · alarm at rest | 1 | 18 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 0 | 0 | no |

## Tap targets — alarm at rest (ALARM:3 deduced) 1366x768 es texte agrandi (report only) (`alarm-3-1366x768-es-large/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Machine · alarm at rest | 1 | 19 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 2 | 0 | no |

Targets whose centre is covered by another element:

| Screen | Label | Element hit at centre |
| --- | --- | --- |
| Machine · alarm at rest | Límites de la máquina → | nothing |
| Machine · alarm at rest | Registro de eventos → | nothing |

## Tap targets — alarm at rest (ALARM:3 deduced) 1024x600 fr (`alarm-3-1024x600-fr-standard/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Suivi · alarm at rest | 1 | 32 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 0 | 1 | no |
| Menu · alarm at rest | 1 | 17 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 0 | 0 | no |

Text wider than its box (scrollWidth > clientWidth, overflow not visible):

| Screen | Text | Widths | text-overflow |
| --- | --- | --- | --- |
| Suivi · alarm at rest | Selon les mouvements (sans accélérations) : ≈ 4 min | 367 > 296 | ellipsis |

## Tap targets — alarm at rest (ALARM:3 deduced) 1024x600 fr (report only) (`alarm-3-1024x600-fr-standard/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Machine · alarm at rest | 1 | 18 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 0 | 0 | no |

## Tap targets — alarm at rest (ALARM:3 deduced) 1024x600 fr texte agrandi (`alarm-3-1024x600-fr-large/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Suivi · alarm at rest | 1 | 32 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 0 | 1 | no |
| Menu · alarm at rest | 1 | 17 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 0 | 0 | no |

Text wider than its box (scrollWidth > clientWidth, overflow not visible):

| Screen | Text | Widths | text-overflow |
| --- | --- | --- | --- |
| Suivi · alarm at rest | Selon les mouvements (sans accélérations) : ≈ 4 min | 459 > 296 | ellipsis |

## Tap targets — alarm at rest (ALARM:3 deduced) 1024x600 fr texte agrandi (report only) (`alarm-3-1024x600-fr-large/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Machine · alarm at rest | 1 | 18 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 0 | 0 | no |

## Tap targets — alarm at rest (ALARM:3 deduced) 1024x600 es (`alarm-3-1024x600-es-standard/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Suivi · alarm at rest | 1 | 32 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 0 | 2 | no |
| Menu · alarm at rest | 1 | 17 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 0 | 1 | no |

Text wider than its box (scrollWidth > clientWidth, overflow not visible):

| Screen | Text | Widths | text-overflow |
| --- | --- | --- | --- |
| Suivi · alarm at rest | Este dispositivo | 126 > 119 | ellipsis |
| Suivi · alarm at rest | Según los movimientos (sin aceleraciones): ≈ 4 min | 360 > 296 | ellipsis |
| Menu · alarm at rest | Este dispositivo | 126 > 119 | ellipsis |

## Tap targets — alarm at rest (ALARM:3 deduced) 1024x600 es (report only) (`alarm-3-1024x600-es-standard/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Machine · alarm at rest | 1 | 18 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 0 | 1 | no |

Text wider than its box (scrollWidth > clientWidth, overflow not visible):

| Screen | Text | Widths | text-overflow |
| --- | --- | --- | --- |
| Machine · alarm at rest | Este dispositivo | 126 > 119 | ellipsis |

## Tap targets — alarm at rest (ALARM:3 deduced) 1024x600 es texte agrandi (`alarm-3-1024x600-es-large/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Suivi · alarm at rest | 1 | 32 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 0 | 2 | no |
| Menu · alarm at rest | 1 | 17 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 0 | 1 | no |

Text wider than its box (scrollWidth > clientWidth, overflow not visible):

| Screen | Text | Widths | text-overflow |
| --- | --- | --- | --- |
| Suivi · alarm at rest | Este dispositivo | 126 > 119 | ellipsis |
| Suivi · alarm at rest | Según los movimientos (sin aceleraciones): ≈ 4 min | 450 > 296 | ellipsis |
| Menu · alarm at rest | Este dispositivo | 126 > 119 | ellipsis |

## Tap targets — alarm at rest (ALARM:3 deduced) 1024x600 es texte agrandi (report only) (`alarm-3-1024x600-es-large/`)

| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Machine · alarm at rest | 1 | 18 | 0 | 0 / 0 | undefined–undefined–undefined | 0 | 0 | 1 | no |

Text wider than its box (scrollWidth > clientWidth, overflow not visible):

| Screen | Text | Widths | text-overflow |
| --- | --- | --- | --- |
| Machine · alarm at rest | Este dispositivo | 126 > 119 | ellipsis |

## Start-up of the real page (5 repetitions, medians)

| | Cold (cache cleared) | Warm (second load) |
| --- | ---: | ---: |
| Shell ready (`cnc-loading` removed), ms | 82.9 | 80.3 |
| DOMContentLoaded, ms | 57 | 60.5 |
| load event, ms | 58.8 | 61.9 |
| Resources (scripts / styles / xhr) | 84 (68 / 15 / 1) | 84 (68 / 15 / 1) |
| Transferred / decoded | 1.27 MB / 1.25 MB | 34 kB / 17 kB |
| Served from cache | 0 | 0 |
| JS heap after GC | 2.75 MB | 3.64 MB |
| DOM nodes / listeners | 5873 / 890 | 8811 / 1335 |
| Script / style / layout / task time, ms | 18.6 / 9.9 / 5 / 74.2 | 14.5 / 7.8 / 4.7 / 83.5 |
| Page exceptions | 5 | 5 |

Note: the local fixture server sends no caching headers, so the warm run may re-download everything; against a real CNCjs server the static files carry ETag/Last-Modified. Details per run in `startup.json`.

## Simulation run (load → start → pause → resume → stop)

### fr — OK (12139 ms, `e2e-fr/`)

| Step | Result | State word | Details |
| --- | --- | --- | --- |
| open simulation page (fr) | ok |  |  |
| select and load a file | ok | Repos | file Parcours_de_test_1.gcode |
| start with confirmation | ok | En cours | progress 1 %; dialog "Confirmer le démarrage", box 48×52 px, countdown "Confirmation valable 15 s." → "Confirmation valable 13 s."; feedback "SIMULATION — Démarrage fictif." |
| pause | ok | Pause | progress 2 %; feedback "SIMULATION — Pause fictive." |
| resume with confirmation | ok | En cours | progress 3 % |
| stop | ok | Repos | progress 4 %; feedback "SIMULATION — Travail fictif arrêté."; Démarrer disabled after stop: true |

### en — OK (13080 ms, `e2e-en/`)

| Step | Result | State word | Details |
| --- | --- | --- | --- |
| open simulation page (en) | ok |  |  |
| select and load a file | ok | Idle | file Parcours_de_test_1.gcode |
| start with confirmation | ok | Running | progress 2 %; dialog "Confirm start", box 48×52 px, countdown "Confirmation valid for 15 s." → "Confirmation valid for 13 s."; feedback "SIMULATION — Simulated start." |
| pause | ok | Pause | progress 3 %; feedback "SIMULATION — Simulated pause." |
| resume with confirmation | ok | Running | progress 4 % |
| stop | ok | Idle | progress 5 %; feedback "SIMULATION — Simulated job stopped."; Démarrer disabled after stop: true |

### es — OK (13050 ms, `e2e-es/`)

| Step | Result | State word | Details |
| --- | --- | --- | --- |
| open simulation page (es) | ok |  |  |
| select and load a file | ok | Reposo | file Parcours_de_test_1.gcode |
| start with confirmation | ok | En curso | progress 2 %; dialog "Confirmar inicio", box 48×52 px, countdown "Confirmación válida durante 15 s." → "Confirmación válida durante 13 s."; feedback "SIMULACIÓN — Inicio simulado." |
| pause | ok | Pausa | progress 3 %; feedback "SIMULACIÓN — Pausa simulada." |
| resume with confirmation | ok | En curso | progress 4 % |
| stop | ok | Reposo | progress 5 %; feedback "SIMULACIÓN — Trabajo simulado detenido."; Démarrer disabled after stop: true |

## Strict layout check

Variants: 1366x768 and 1024x600, standard and large text, simulation FR/ES, responsive: 1440x960, 1080x720, 1280x800, 1920x1080, 720x1080 portrait, 960x1440 portrait, 1180x820, 1600x900, 800x1280 portrait, 600x960 portrait, 1280x800 texte agrandi, 720x1080 portrait texte agrandi, 1366x768 zoom 150 % (911x512 @1.5), 1366x768 zoom 200 % (683x384 @2), 1080x1920 portrait zoom 200 % (540x960 @2), 1366x768 clavier virtuel (1366x448), 720x1080 portrait clavier virtuel (720x700) (480 hit tests, `responsive-hits.json`). Exceptions: `layout-exceptions.json`. Violations: 2, excepted: 0.

| Check | Variant | Screen | Target | Detail |
| --- | --- | --- | --- | --- |
| text | 1920x1080 | Réglages | Au repos uniquement. Mesure l’écran et deux tracés courts, s | 13 px, goal 16 |
| text | 960x1440 portrait | Réglages | Au repos uniquement. Mesure l’écran et deux tracés courts, s | 13 px, goal 16 |

## Limits

- Headless Chrome on a PC: no touch digitiser, no Tegra 3 timings, GPU disabled like the kiosk but a different compositor; the Surface RT resolves the font stack to Bitstream Vera Sans, wider than Segoe UI.
- "Zoom 200 %" is emulated as a 683 × 384 CSS viewport at device scale factor 2 (what Ctrl + does at 1366 × 768); "font 200 %" uses `Page.setFontSizes` (default font size 32 px), which only moves text sized relative to the default.
- Responsive: browser zoom is emulated by CSS viewport and device scale factor (no real Ctrl +); a virtual keyboard by a shorter window (layout viewport). A keyboard that only shrinks `visualViewport` is followed by viewport-fit.js but not emulated here.
- The simulation page has no Réglages screen, so the language is set through its storage key (`cncjs-touch-language-v1`) and a reload, which is what the Réglages control does on the real page.
