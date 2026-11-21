F5 est réalisé sur `feat/F5`, sans commit. [Compte rendu détaillé](C:/Users/damou/Documents/claude/cncjs-wt/F5/examples/cncjs-touch/design/fonctions/F5-RAPPORT.md).

- Une tentative au chargement, uniquement depuis le kiosque local, vers le dernier port ouvert avec succès.
- Gardes serveur contre un port déjà ouvert, une ouverture concurrente ou une main attribuée.
- Désactivation dans **Réglages → Machine et performances**, avec traductions FR/EN/ES. Aucun rejeu après échec.

**Vérifications :** tests écrits avant le code ; **225/225 contrôles**, **52 suites / 1 553 tests Jest**, ESLint et contrôle LF verts.

**Fichiers partagés touchés :** catalogue i18n en fin de fichier, sélecteurs des onglets dans `touch-shell.css`, liste de `verify-project.cjs`, extraction de `localRequest` dans `api.touch.js`, hook dans `touch/index.js`, garde de l’événement `open` dans `CNCEngine.js`. Compléments ajoutés en fin de `SURETE.md` et `PROTOCOLE-ESSAI.md`. L’inventaire complet figure dans le rapport.

**Non vérifié :** le harnais strict échoue avant les scénarios (`Page.enable` / WebSocket). Aucun rendu navigateur ni matériel validé ; revue croisée restante.

**L’essai réel devra prouver** l’ouverture unique du bon port, l’absence de redémarrage lorsqu’elle est interdite, la persistance du réglage, l’absence de mouvement et le maintien des exigences de prise d’origine/D2. Le protocole est ajouté.

