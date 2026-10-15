# MCD Studio

> Collez vos schemas **Prisma**, **Drizzle** ou **SQL**, combinez **autant de
> modèles que vous voulez sur la même grille**, organisez-les en
> **instances · projets**, reliez les entités à la main avec de vraies
> **cardinalités MCD** (`0,1 / 1,1 / 0,N / 1,N` des deux côtés), puis exportez en
> **SQL**, **Prisma**, **Drizzle**, **JSON**, **SVG** ou **PNG** — ou partagez
> via un **lien figé** (`#partage=`).

Application 100 % locale (aucun serveur, aucune donnée envoyée sur le réseau) —
diagramme, modèles importés et instances sauvegardés automatiquement dans le
navigateur.

Style : brutalisme éditorial papier/encre/rouge (titre géant, tickets perforés,
mono condensé).

---

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Démarrage rapide](#démarrage-rapide)
- [Utilisation](#utilisation)
  - [Instances · projets (panneau gauche, 01)](#instances--projets-panneau-gauche-01)
  - [Modèles importés (panneau gauche, 02)](#modèles-importés-panneau-gauche-02)
  - [Relier les entités (formulaire + canvas)](#relier-les-entités-formulaire--canvas)
  - [Cardinalités MCD](#cardinalités-mcd)
  - [Naviguer sur la grille](#naviguer-sur-la-grille)
  - [Recherche](#recherche)
  - [Diagnostic](#diagnostic)
  - [Exporter](#exporter)
  - [Partager par lien](#partager-par-lien)
  - [Modèles de base + modèle perso](#modèles-de-base--modèle-perso)
- [Formats supportés](#formats-supportés)
- [Raccourcis clavier](#raccourcis-clavier)
- [Architecture du projet](#architecture-du-projet)
- [Scripts disponibles](#scripts-disponibles)
- [Persistance des données](#persistance-des-données)
- [Limites connues](#limites-connues)
- [Licence](#licence)

---

## Fonctionnalités

| Catégorie | Détails |
|---|---|
| **Instances · projets** | Section `01 /` du panneau gauche. `+ Instance` crée un projet (nom éditable) pour regrouper des modèles via leur menu `Sans instance…`. Chaque instance propose `Masquer / Voir` (masquage effectif des modèles, badge `via ⧉`), `Isoler` (ne garder que ce projet visible, re-clic = tout revoir), `▦` (ranger ses tables), `⤓ ZIP` (export), `🔗` (lien figé), `✕` (supprime l'instance, modèles conservés et détachés). Boutons globaux `▦ Ranger par instance` (layout groupé, hubs les plus liés d'abord) et `◉ Tout voir`. |
| **Modèles importés (illimités)** | Section `02 /` du panneau gauche. Chaque modèle a son nom éditable, son badge auto (`Prisma` / `Drizzle` / `SQL` / `Auto`), son compteur de tables sur le canvas, se **plie / déplie** au clic, se **masque / affiche** via `Masquer / Voir`, accepte les exemples (`Prisma / Drizzle / SQL / Fichier…` — `.sql`, `.prisma`, `.ts`, `.txt`, le nom du fichier renomme le modèle). `＋ Ajouter` pose le modèle à droite du canvas sans rien effacer (renommage auto `users → users_2`) ; si le modèle est déjà sur le canvas, le bouton devient `⟳ Modifier` (re-synchronisation stricte : champs fusionnés par nom, tables ajoutées / retirées, liens internes remplacés, FK inter-modèles re-détectées). La croix `✕` retire le modèle **et** supprime ses tables et liens du canvas (en un seul pas d'annulation). |
| **Liaisons entité → entité** | Deux façons : formulaire **« Relier 2 entités »** (ou **« Relier à une autre entité »** quand une table est sélectionnée, avec champs suggérés : le `xxx_id` qui vise la cible + la PK en face) ou **mode ⇄ Relier sur le canvas** (clic source → clic cible, enchaînable, re-clic / clic dans le vide = annuler le départ, `Echap` / **Quitter** = sortir). Le champ source devient `FK` automatiquement, les doublons sont refusés. |
| **Cardinalités MCD bilatérales** | Chaque lien porte **deux cardinalités** (`0,1 / 1,1 / 0,N / 1,N`), une collée à chaque entité sur le canvas (point noir = source, point rouge = cible), modifiables séparément dans les listes de relations. Les liaisons créées à la main partent de `1,N — 1,1` ; les imports **infèrent** les cardinalités (`NULL` → `0`, `UNIQUE` → `1`, sinon `N`). Les anciens liens (`N:1`, `1:N`, …) sont migrés automatiquement. Reprises dans les exports SVG / PNG. Style de trait réglable : `courbe` (défaut) / `droite` / `angle`, appliqué au canvas et aux exports, préférence persistée. |
| **Canvas** | Cartes déplaçables par leur en-tête (y compris les cadres d'instance / modèle `⧉` / `▤`), pan par glisser du fond, **zoom molette libre (10 %–250 %) centré sur le curseur** (pinch trackpad adouci), slider + boutons `−` / `＋`, pastille `%` (clic = 100 %), `Cadrer [F]` (ajuste le zoom à toutes les tables visibles), `Recentrer` (retour caméra d'accueil), grille pointillée verrouillée sur le monde (suit le pan et le zoom), `⤢ Plein écran [M]` (canvas seul, barre d'outils réduite). Gestes en direct-DOM pendant le déplacement, un seul pas d'historique à la fin. |
| **Barre de commande** | Une seule barre fine en haut : marque, compteurs (`TABLES · LIENS · CHAMPS`, diagnostic avec détail au survol), recherche globale, boutons `⤓ Exporter` + `🔗 Partager` (choix du périmètre et du format dans les modales), annuler / rétablir, galerie `+ Modèles`, bascules de panneaux, plein écran, heure de sauvegarde. |
| **Barre de statut** | En bas : dernier message d'action, table sélectionnée, niveau de zoom, heure de sauvegarde. |
| **Édition complète** | Créer / dupliquer (`_copie`) / supprimer / renommer les tables (garde anti-doublon, relations suivies) ; renommer les champs, types via liste déroulante groupée (identifiants, entiers, texte, dates, UUID, JSON… — type inconnu conservé comme `importé`), cases `PK / FK / UQ / NULL`, ajouter / supprimer les champs (les liens orphelins sont purgés) ; **annuler / rétablir** (`Ctrl+Z / Ctrl+Y` ou `Ctrl+Maj+Z`, historique 50 pas). |
| **Recherche** | Champ dans la barre de commande : filtre sur noms de tables, champs et types. Les cartes non concordantes se grisent, pastilles de résultats cliquables (clic = centrer), double-clic sur une carte = centrer aussi. |
| **Diagnostic** | Alertes `ERR` (nom de table en double, lien orphelin, champ manquant) et `WARN` (table sans `PRIMARY KEY`, table isolée). Compteur dans la barre de commande (détail au survol) + liste dans le panneau gauche (8 premières, puis `+N autres`). |
| **Exports** | Modale **EXPORT UNIQUE** : `1 · Périmètre` (canvas visible / instance / modèle), `2 · Format` (`SQL` / `PRISMA` / `DRIZZLE` / `JSON` / `SVG`, plus bouton `PNG`), `3 · Rendu image` (`Doux` par défaut / `Contrasté`). Aperçu, **Copier**, **⤓ Télécharger** (nom de fichier assaini), **⤓ ZIP** quand une instance contient plusieurs modèles (un fichier par modèle), **⤓ PNG** (rendu 2x sur fond papier) et **SVG** (titre, date, légende, cardinalités). |
| **Partage par lien** | Bouton `🔗 Partager` (canvas) ou `🔗` par modèle / instance. Le snapshot complet est encodé dans le hash (`#partage=…`, base64url) : le destinataire voit la version **figée en lecture seule** (bannière `Aperçu partagé figé`, persistance locale désactivée), avec `Adopter ma copie` (enregistrer localement), `⤓ JSON` et `Quitter`. Les modifications ultérieures ne changent pas les liens déjà envoyés : régénérez un lien pour publier une v2. |
| **Modèles de base** | Galerie `+ Modèles` : 6 packs prêts (`BLOG / CMS`, `E-COMMERCE`, `SAAS / AUTH`, `RÉSEAU SOCIAL`, `ÉCOLE`, `IMMO / RENDEZ-VOUS`). Chacun : **+ Ajouter ↗** (canvas + panneau gauche, jamais de remplacement). Carte **+ / PERSO** : collez votre schema, il rejoint le panneau gauche comme un vrai modèle importé. |
| **Sauvegarde auto** | Modèle + modèles importés + instances persistés (`localStorage`), heure affichée (`✓ 12:03:11`). Bouton `⌫` de réinitialisation du canvas (avec confirmation). Import / export **JSON** (fichier `.json`, doublons renommés `nom_2`) pour partager ou versionner. |
| **Visite guidée** | Au tout premier lancement uniquement (aucune donnée stockée), 6 étapes : bienvenue, `01+02` instances + modèles, `02` liaison ⇄, `03` édition + diagnostic, `04` navigation + recherche, `05` exports + partage. Rejouable via **? Visite** dans l'aide du panneau gauche. |

---

## Démarrage rapide

**Prérequis :** Node.js ≥ 18 et npm.

```bash
# 1. Installer les dépendances
npm install

# 2. Lancer en développement (http://localhost:5173)
npm run dev

# 3. Construire pour la production
npm run build

# 4. Prévisualiser le build
npm run preview
```

> Si le serveur dev affiche une vieille erreur après une mise à jour des
> sources (cas connu avec le watcher sur certains dossiers synchronisés) :
> `Ctrl+C` puis `npm run dev`.

---

## Utilisation

### Instances · projets (panneau gauche, 01)

En-tête **01 / Instances · projets (N)** + bouton **+ Instance**. Créez un
projet (ex. `Boutique`, `Blog`), puis rangez vos modèles dedans via le menu
`Sans instance…` de chaque carte modèle.

Chaque instance affiche `NT · NM` (tables · modèles), se plie / déplie au clic
et propose : **Masquer / Voir** (tout le projet disparaît du canvas, badge
`via ⧉` sur ses modèles), **Isoler** (un seul projet visible, re-clic pour tout
revoir), **▦** (ranger ses tables), **⤓ ZIP**, **🔗** (lien figé),
**✕** (supprime l'instance, modèles conservés et détachés).

`▦ Ranger par instance` range tout le canvas (groupé par instance, entités les
plus liées d'abord) ; `◉ Tout voir` ré-affiche instances et modèles masqués.

### Modèles importés (panneau gauche, 02)

En-tête **02 / Modèles (N)** + bouton **+ Modèle**.

Chaque modèle = un bandeau (clic = **plier / déplier**), nom éditable, badge de
format détecté, compteur de tables sur le canvas, bouton **Masquer / Voir** (la
recherche, le cadrage et les exports suivent), sélecteur d'instance, bouton
**🔗** (lien figé du modèle), croix `✕` (retire le modèle **et** supprime ses
tables et liens du canvas). Déplié : textarea + **＋ Ajouter ↗** (ou
**⟳ Modifier ↗** si déjà sur le canvas) + message de résultat + exemples
(`Prisma / Drizzle / SQL / Fichier…`).

Le masquage est cumulatif : un modèle reste caché tant que son instance est
masquée, même avec son propre réglage sur `Voir` (le panneau l'explique au lieu
de surprendre).

### Relier les entités (formulaire + canvas)

**Formulaire** (panneau Édition, `]` pour l'afficher) : sections **« Relier 2
entités »** (sans sélection) ou **« Relier à une autre entité »** (table
présélectionnée en source). Choisissez les deux entités : les champs sont
suggérés (`xxx_id` → PK), ajustez si besoin, réglez les deux cardinalités,
**Lier (1,N — 1,1) ↗**.

**Canvas** : bouton **⇄ Relier** dans la barre d'outils → clic sur l'entité
source (bordure rouge) → clic sur l'entité cible → lien créé aussitôt
(`1,N — 1,1`, champ source marqué `FK`). Le mode reste actif pour enchaîner ;
re-clic / clic dans le vide = annuler le départ ; `Echap` / **Quitter** = sortir.
En mode liaison les tables ne se déplacent pas et la cible survolée se surligne.

### Cardinalités MCD

Règle Merise : une cardinalité **de chaque côté** du lien (`0,1`, `1,1`,
`0,N`, `1,N`). Exemple : `orders (1,N) — (1,1) customers` = « une commande
concerne 1 client et 1 seul ; un client passe 1 à N commandes ».

Sur le canvas chaque valeur est collée à son entité ; dans les listes de
relations (panneau Édition, vue globale ou par table) deux mini-selects
permettent de les changer séparément. Les liaisons manuelles partent de
`1,N — 1,1` ; les imports infèrent (`NULL` → `0`, `UNIQUE` → `1`, PK visée →
`1,1`).

### Naviguer sur la grille

- **Zoom** : molette n'importe où sur la grille (10 %–250 %, centré curseur),
  slider, `−` / `＋`, pastille `%` (= retour 100 %).
- **Déplacer** : glisser le fond (*pan*), glisser une carte par son en-tête
  (ou un cadre d'instance / modèle par sa poignée).
- **Cadrer [F]** : ajuste le zoom pour voir toutes les tables visibles.
- **Recentrer** : retour à la caméra d'accueil.
- **⤢ Plein écran [M]** : canvas seul sur tout l'écran (barre de commande,
  panneaux et barre de statut masqués, barre d'outils réduite conservée).

### Recherche

Champ dans la barre de commande : filtre sur noms de tables, champs et types.
Cartes non concordantes grisées, pastilles de résultats (`N résultat(s)`,
clic = centrer), double-clic sur une carte = centrer aussi.

### Diagnostic

Section **Diagnostic** (panneau gauche) + compteur dans la barre de commande
(détail au survol) : `ERR` (doublon de nom, lien/champ orphelin), `WARN` (table
sans PK, table isolée).

### Exporter

Modale **EXPORT UNIQUE** : `1 · Périmètre` (**Canvas visible** / **Instance** /
**Modèle**), `2 · Format`, `3 · Rendu image` (`Doux (recommandé)` /
`Contrasté (ancien)` — s'applique à PNG/SVG, le style des liens suit le réglage
du canvas).

| Format | Contenu |
|---|---|
| `SQL` | `CREATE TABLE` avec `PRIMARY KEY`, `NOT NULL`, `UNIQUE`, `FOREIGN KEY`. |
| `Prisma` | Blocs `model` avec `@id`, `@unique`, `@default`, `@map` / `@@map`, `@relation`. |
| `Drizzle` | `pgTable("…", { … })` avec `.primaryKey()`, `.notNull()`, `.unique()`, `.references(…)`. |
| `JSON` | Sauvegarde du périmètre (tables + relations) — à réimporter via **Importer JSON…**. |
| `SVG` | Image vectorielle du périmètre (relations + cardinalités MCD, titre, date, légende). |
| `PNG` | Image haute lisibilité du périmètre (rendu 2x sur fond papier). |
| `ZIP` | Quand une instance contient plusieurs modèles : un fichier par modèle (`⤓ instance-<format>.zip`). |

**Copier** (presse-papiers), **⤓ Télécharger** (nom assaini : minuscules, sans
accents, ex. `mcd.sql`, `schema.prisma`), **⤓ PNG**, **SVG**.

### Partager par lien

`🔗 Partager` (canvas) ou `🔗` sur un modèle / une instance : génère une URL
`#partage=…` contenant le snapshot (modèle + slots + instances, base64url).
Le destinataire ouvre une **vue figée en lecture seule** (bannière
`Aperçu partagé figé`, persistance désactivée) : il peut explorer, exporter et
cliquer **Adopter ma copie** (copie locale + rechargement sans hash),
**⤓ JSON** ou **Quitter**. Vos modifications ultérieures ne changent pas le lien
déjà envoyé.

### Modèles de base + modèle perso

Bouton **+ Modèles** (barre de commande) / **+ Voir les 6 modèles** (panneau) :
`BLOG / CMS`, `E-COMMERCE`, `SAAS / AUTH`, `RÉSEAU SOCIAL`, `ÉCOLE`,
`IMMO / RENDEZ-VOUS`. Chacun : **+ Ajouter ↗** — il rejoint le canvas (à droite,
sans rien effacer) **et** un modèle du panneau gauche. La carte **+ / PERSO**
(nom + source) envoie votre propre schema dans le panneau gauche comme un vrai
modèle importé.

---

## Formats supportés

**Prisma** — modèles, `@id`, `@unique`, `@map` / `@@map`,
`@relation(fields, references)`. Noms convertis en `snake_case`. Les champs
`xxxId` dont le type correspond à un modèle existant génèrent une relation
implicite même sans `@relation` explicite :

```prisma
model Post {
  id       Int  @id @default(autoincrement())
  authorId Int  @map("author_id")
  author   User @relation(fields: [authorId], references: [id])
  @@map("posts")
}
```

**Drizzle** — `pgTable` / `mysqlTable` / `sqliteTable`, modifieurs chaînés
`.primaryKey()`, `.notNull()`, `.unique()` et `.references(() => table.colonne)` :

```ts
export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  authorId: integer("author_id").notNull().references(() => users.id),
});
```

**SQL** — `CREATE TABLE` avec colonnes typées, `PRIMARY KEY` (simple ou
composite), `FOREIGN KEY … REFERENCES` (déclaration séparée, `CONSTRAINT` ou
`REFERENCES` en ligne), `NOT NULL` et `UNIQUE` :

```sql
CREATE TABLE "posts" (
  "id" SERIAL PRIMARY KEY,
  "author_id" INTEGER NOT NULL,
  FOREIGN KEY ("author_id") REFERENCES "users"("id")
);
```

Détection automatique par modèle (`Prisma / Drizzle / SQL / Auto`), texte
inconnu analysé au mieux (le parse qui trouve le plus de tables gagne). Les
`xxx_id` / `REFERENCES` créent les liens automatiquement, y compris entre
modèles (`author_id → users`, singulier / pluriel gérés).

---

## Raccourcis clavier

| Touche | Action |
|---|---|
| `[` | Afficher / masquer le panneau des modèles (gauche) |
| `]` | Afficher / masquer le panneau d'édition (droite) |
| `F` | Cadrer toutes les tables visibles |
| `M` | Plein écran canvas (activer / quitter) |
| `Echap` | Fermer la modale ouverte (export, partage, galerie), sinon quitter le mode ⇄ liaison, sinon quitter le plein écran |
| `Ctrl+Z` / `Ctrl+Y` (ou `Ctrl+Maj+Z`) | Annuler / rétablir (fonctionne même pendant la saisie) |

> `[`, `]`, `F`, `M` sont ignorés pendant la saisie et quand une modale est
> ouverte. Panneaux aussi basculables via leurs boutons, la toolbar, la croix et
> les onglets flottants.

---

## Architecture du projet

```
.
├── index.html            # Titre + fonts (Anton, Archivo, Space Mono, Instrument Serif)
├── package.json          # react, react-dom + scripts Vite
├── vite.config.ts        # Config Vite + plugin React
└── src/
    ├── main.tsx          # Bootstrap React (StrictMode)
    ├── App.tsx           # Composition : workspace, orchestration, raccourcis, fichiers
    ├── types.ts          # DBTable, DBField, DBRelation (fromCard/toCard, mcdCards), DBModel, ImportSlot, Instance, uid()
    ├── parsers.ts        # Détection + parseurs Prisma / Drizzle / SQL (parseAuto, detectKind)
    ├── generators.ts     # Générateurs SQL / Prisma / Drizzle (toSQL, toPrisma, toDrizzle)
    ├── examples.ts       # Exemples prêts à coller (Prisma, Drizzle, SQL)
    ├── templates.ts      # 6 modèles de base (packs SQL prêts à ajouter)
    ├── domain/           # Pur, sans React : model, instances, layout, geometry, edges,
    │                     # exporters, exportSvg, exportTheme, zip
    ├── services/         # storage (localStorage), share (liens #partage=)
    ├── hooks/            # useHistory (undo/redo 50 pas), useCamera, useTour
    ├── components/       # CommandBar, StatusBar, LeftPanel, RightPanel, CanvasView,
    │                     # RelationForm, GalleryModal, ExportModal, ShareModal, TourOverlay
    └── index.css         # Thème brutaliste papier/encre/rouge (tickets, barre de commande, dot-grid)
```

**Choix techniques :** React 19 + TypeScript + Vite, zéro dépendance runtime hors
React (canvas SVG maison, parsing par regex, ZIP `STORE` maison sans
compression, pas de backend). Les nouvelles règles métier vont dans
`domain/` (fonctions pures), `App.tsx` ne fait qu'orchestrer via `apply()`
(1 pas d'historique) ; le drag reste en direct-DOM avec un seul `commit()` au
relâcher.

---

## Scripts disponibles

| Commande | Effet |
|---|---|
| `npm run dev` | Serveur de développement avec HMR |
| `npm run build` | Vérification TypeScript (`tsc -b`) + build de production (`dist/`) |
| `npm run preview` | Prévisualisation locale du build |
| `npm run lint` | Analyse statique (`oxlint`) |

Référence : `npm run build` fait foi (les erreurs `tsc` font échouer le build,
même si le serveur dev semble content).

---

## Persistance des données

| Clé `localStorage` | Contenu |
|---|---|
| `mcd-studio-v2` (+ `mcd-studio-v1` en repli) | Modèle (tables + relations), sauvegarde ~400 ms après modification, heure affichée |
| `mcd-studio-slots-v1` | Modèles importés du panneau gauche (textes + plié/déplié + masquage + rattachement) |
| `mcd-studio-instances-v1` | Instances · projets |
| `mcd-studio-tour-v1` | Visite guidée déjà vue |
| `mcd-studio-camera-v1` | Vue exacte du canvas (pan + zoom), restaurée au chargement |
| `mcd-studio-edge-style-v1` | Style de liens (`courbe` / `droite` / `angle`, défaut `courbe`) |
| `mcd-studio-image-theme-v1` | Rendu image (`doux` / `contraste`, défaut `doux`) |

- Premier lancement : canvas vide, aucun modèle imposé (démarre via la galerie `+ Modèles`, `+ Modèle` ou `＋ Table vide`). L'id historique `slot-modele-1` reste reconnu pour les sauvegardes existantes.
- Les anciens modèles sauvegardés peuvent contenir un champ `lots` : il est
  ignoré au chargement, jamais réécrit.
- Le bouton `⌫` réinitialise le canvas (avec confirmation). L'historique
  annuler / rétablir (50 pas) est réinitialisé au rechargement.
- En vue partagée (`#partage=`), la persistance est désactivée : rien n'écrase
  vos données tant que vous n'avez pas cliqué **Adopter ma copie**.
- Export / import **JSON** pour versionner ou transférer un diagramme complet.

---

## Limites connues

- Les relations complexes (`@@id` / `@@unique` composites Prisma, `N:N`
  implicites) sont représentées de façon simplifiée.
- Enums Prisma et contraintes `CHECK` SQL non importés.
- Pas de mini-carte de navigation ; liaison par clic-clic uniquement (pas de
  glisser-déposer).
- Le lien de partage embarque tout le snapshot dans l'URL : les très gros
  diagrammes peuvent dépasser les limites de longueur d'URL du navigateur.

---

## Licence

Projet personnel — libre d'utilisation et de modification. Amusez-vous bien !
