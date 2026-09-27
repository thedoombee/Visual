# MCD Studio

> Collez vos schemas **Prisma**, **Drizzle** ou **SQL**, combinez **autant de
> modèles que vous voulez sur la même grille**, reliez les entités à la main
> avec de vraies **cardinalités MCD** (`0,1 / 1,1 / 0,N / 1,N` des deux côtés),
> puis exportez en **SQL**, **Prisma**, **Drizzle**, **SVG**, **PNG** ou **JSON**.

Application 100 % locale (aucun serveur, aucune donnée envoyée sur le réseau) —
diagramme et modèles importés sauvegardés automatiquement dans le navigateur.

Style : brutalisme éditorial papier/encre/rouge (titre géant, tickets perforés,
mono condensé).

---

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Démarrage rapide](#démarrage-rapide)
- [Utilisation](#utilisation)
  - [Modèles importés (panneau gauche)](#modèles-importés-panneau-gauche)
  - [Relier les entités (formulaire + canvas)](#relier-les-entités-formulaire--canvas)
  - [Cardinalités MCD](#cardinalités-mcd)
  - [Naviguer sur la grille](#naviguer-sur-la-grille)
  - [Recherche](#recherche)
  - [Diagnostic](#diagnostic)
  - [Exporter](#exporter)
  - [Modèles de base + modèle perso](#modèles-de-base--modèle-perso)
- [Formats supportés](#formats-supportés)
- [Raccourcis clavier](#raccourcis-clavier)
- [Structure du projet](#structure-du-projet)
- [Scripts disponibles](#scripts-disponibles)
- [Persistance des données](#persistance-des-données)
- [Limites connues & idées d'amélioration](#limites-connues--idées-damélioration)
- [Licence](#licence)

---

## Fonctionnalités

| Catégorie | Détails |
|---|---|
| **Modèles importés (illimités)** | Panneau gauche = liste de modèles. Chacun a son nom, son texte, son badge auto (`PRISMA` / `DRIZZLE` / `SQL`), son compteur de tables, se **plie / déplie** au clic, se **masque / affiche** sur le canvas via le bouton `Masquer / Voir`, accepte les exemples et les fichiers (`.sql`, `.prisma`, `.ts`, `.txt` — le nom du fichier renomme le modèle). Liste persistée en local. |
| **Ajout multi-modèles** | Chaque modèle propose **＋ Ajouter** (ajoute ses tables à droite du canvas sans jamais rien effacer, renommage auto `users → users_2`). |
| **Liaisons entité → entité** | Deux façons : formulaire **« Relier 2 entités »** (entité source → entité cible, champs pré-remplis : le `xxx_id` qui vise la cible + la PK en face) ou **mode ⇄ Relier sur le canvas** (clic source → clic cible, enchaînable, `Echap` pour quitter). Le champ source devient `FK` automatiquement. |
| **Cardinalités MCD bilatérales** | Chaque lien porte **deux cardinalités** (`0,1 / 1,1 / 0,N / 1,N`), une collée à chaque entité sur le canvas (point noir = source, point rouge = cible), modifiables séparément dans les listes de relations. Anciens liens `N:1` migrés auto (`1,N — 1,1`). Reprises à l'export SVG/PNG. |
| **Canvas infini** | Cartes déplaçables, pan par glisser du fond, **zoom molette libre (20 %–250 %) centré sur le curseur** (pinch trackpad adouci), slider + boutons `−` / `＋`, pastille `%` (clic = 100 %), `Cadrer [F]`, `Recentrer`. **⤢ Plein écran [M]** : masque tout (barre de commande, panneaux) pour travailler sur toute la fenêtre. |
| **Barre de commande** | Une seule barre fine en haut : marque, compteurs (tables · liens · champs · diagnostic avec détail au survol), recherche globale, exports SQL / PRISMA / DRIZZLE / JSON, annuler / rétablir, galerie de modèles, panneaux, plein écran, heure de sauvegarde. |
| **Barre de statut** | En bas : dernier message d’action, table sélectionnée, niveau de zoom, heure de sauvegarde. Rien de décoratif, que du contexte utile. |
| **Édition complète** | Renommer tables (relations suivies) et champs, types via liste déroulante complète groupée (entiers, texte, dates, UUID, JSON…), cases `PK / FK / UQ / NULL`, ajouter / dupliquer / supprimer tables et champs, **annuler / rétablir** (`Ctrl+Z / Ctrl+Y`, historique 50 pas). |
| **Recherche** | Champ dans la barre de commande : les tables non concordantes se grisent, pastilles de résultats (clic = centrer, double-clic sur carte aussi). |
| **Diagnostic** | Alertes `ERR / WARN` : table sans `PRIMARY KEY`, table isolée, lien orphelin, champ manquant. Compteur dans la barre de stats. |
| **Exports** | Modale à **onglets SQL / Prisma (.prisma) / Drizzle (.ts) / JSON**, portée **canvas entier**, nom de fichier adapté, **Copier** + **⤓ Télécharger**, plus **SVG** vectoriel et **PNG** aux couleurs du thème. Boutons rapides SQL / PRISMA / DRIZZLE dans la barre de stats. |
| **Modèles de base** | Galerie de 6 modèles prêts (`BLOG / E-COMMERCE / SAAS-AUTH / SOCIAL / ÉCOLE / IMMO`) : **+ Ajouter ↗** (canvas + panneau gauche, jamais de remplacement). Carte noire **Modèle perso** : collez votre schema dans la galerie, il atterrit comme vrai modèle dans le panneau gauche. |
| **Sauvegarde auto** | Modèle + modèles importés persistés (`localStorage`), heure affichée (`✓ 12:03:11`). Import / export JSON pour partager ou versionner. |
| **Visite guidée** | Au tout premier lancement (aucune donnée en `localStorage`), 4 mini-fenêtres présentent : modèles, liaison ⇄, exports. Rejouable via **? Visite** dans l'aide du panneau gauche. |

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

### Modèles importés (panneau gauche)

En-tête **01 / Modèles importés (N)** + bouton **+ Modèle** (les modèles
ouverts se plient automatiquement quand vous en ajoutez un).

Chaque modèle = un bandeau (clic = **plier / déplier**), nom éditable, badge
de format détecté, compteur de tables sur le canvas, bouton **Masquer / Voir**
pour afficher ou cacher tout le modèle sur la grille (recherche, cadrage et
exports suivent — sauf le JSON, sauvegarde complète), croix pour le retirer du
panneau (ses tables restent, visibles). Déplié : textarea +
**＋ Ajouter ↗** + message de résultat + exemples
(`Prisma / Drizzle / SQL / Fichier…`).

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
permettent de les changer séparément. Les imports produisent `1,N — 1,1` par
défaut (côté FK / côté PK).

### Naviguer sur la grille

- **Zoom** : molette n'importe où sur la grille (20 %–250 %, centré curseur),
  slider, `−` / `＋`, pastille `%` (= retour 100 %).
- **Déplacer** : glisser le fond (*pan*), glisser une carte par son en-tête.
- **Cadrer [F]** : ajuste le zoom pour voir toutes les tables.
- **⤢ Plein écran [M]** : canvas seul sur tout l'écran (barre d'outils réduite
  conservée : zoom, cadrer, modèles, export, retour panneaux).

### Recherche

Champ dans la barre de stats : filtre sur noms de tables, champs et types.
Cartes non concordantes grisées, pastilles de résultats cliquables,
résultats en un clic.

### Diagnostic

Section **Diagnostic** (panneau gauche) + compteur : tables sans PK, tables
isolées, liens/champs orphelins.

### Exporter

Modale d'export : onglets **SQL / Prisma / Drizzle / JSON**, portée **canvas
Modale d'export : onglets **SQL / Prisma / Drizzle / JSON** sur tout le canvas,
nom de fichier adapté (`mcd.sql`, `schema.prisma`…), **Copier**, **⤓ Télécharger**, **PNG**, **SVG**.
**Copier**, **⤓ Télécharger**, **PNG**, **SVG**.

| Format | Contenu |
|---|---|
| `SQL` | `CREATE TABLE` avec `PRIMARY KEY`, `NOT NULL`, `UNIQUE`, `FOREIGN KEY`. |
| `Prisma` | Blocs `model` avec `@id`, `@unique`, `@default`, `@map` / `@@map`, `@relation`. |
| `Drizzle` | `pgTable("…", { … })` avec `.primaryKey()`, `.notNull()`, `.unique()`, `.references(…)`. |
| `JSON` | Modèle interne complet (tables + relations) — à réimporter via **Importer JSON…**. |
| `SVG` / `PNG` | Image du diagramme (relations + cardinalités MCD incluses). |

### Modèles de base + modèle perso

Bouton **+ Modèles** (barre de commande) / **+ Voir les 6
modèles** (panneau) : `BLOG / CMS`, `E-COMMERCE`, `SAAS / AUTH`, `RÉSEAU
SOCIAL`, `ÉCOLE`, `IMMO / RENDEZ-VOUS`. Chacun : **+ Ajouter ↗** — il
rejoint le canvas (à droite, sans rien effacer) **et** un
modèle du panneau gauche. La carte noire **Modèle perso** envoie votre propre schema
dans le panneau gauche comme un vrai modèle importé.

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

---

## Raccourcis clavier

| Touche | Action |
|---|---|
| `[` | Afficher / masquer le panneau des modèles (gauche) |
| `]` | Afficher / masquer le panneau d'édition (droite) |
| `F` | Cadrer toutes les tables |
| `M` | Plein écran canvas (activer / quitter) |
| `Echap` | Fermer la modale ouverte, sinon quitter le mode ⇄ liaison, sinon quitter le plein écran |
| `Ctrl+Z` / `Ctrl+Y` (ou `Ctrl+Maj+Z`) | Annuler / rétablir |

> Ignorés pendant la saisie dans un champ, un menu déroulant ou un textarea.
> Panneaux aussi basculables via micro-nav, toolbar, croix et onglets flottants.

---

## Structure du projet

```
.
├── index.html            # Titre + fonts (Anton, Archivo, Space Mono, Instrument Serif)
├── package.json          # react, react-dom + scripts Vite
├── vite.config.ts        # Config Vite + plugin React
└── src/
    ├── main.tsx          # Bootstrap React
    ├── App.tsx           # Toute l'UI : slots, canvas, liaisons, exports
    ├── types.ts          # DBTable, DBField, DBRelation (+fromCard/toCard, mcdCards), DBModel
    ├── parsers.ts        # Détection + parseurs Prisma / Drizzle / SQL
    ├── generators.ts     # Générateurs SQL / Prisma / Drizzle
    ├── examples.ts       # Exemples prêts à coller (Prisma, Drizzle, SQL)
    ├── templates.ts      # 6 modèles de base (packs SQL prêts à ajouter)
    └── index.css         # Thème brutaliste papier/encre/rouge (tickets, barre de commande, dot-grid)
```

**Choix techniques :** React 19 + TypeScript + Vite, zéro dépendance runtime hors
React (canvas SVG maison, parsing par regex, pas de backend).

---

## Scripts disponibles

| Commande | Effet |
|---|---|
| `npm run dev` | Serveur de développement avec HMR |
| `npm run build` | Vérification TypeScript (`tsc -b`) + build de production (`dist/`) |
| `npm run preview` | Prévisualisation locale du build |
| `npm run lint` | Analyse statique (`oxlint`) |

---

## Persistance des données

- Modèle (tables + relations) : `localStorage`, clé **`mcd-studio-v2`**
  (reprend `mcd-studio-v1` si présente), debounce ~400 ms, heure affichée.
- Modèles importés du panneau gauche (textes + plié/déplié) : clé
  **`mcd-studio-slots-v1`**.
- Le bouton `⌫` réinitialise le canvas (avec confirmation). Historique
  annuler / rétablir : 50 pas (réinitialisé au rechargement).
- Export / import **JSON** pour versionner ou transférer un diagramme complet.

---

## Limites connues & idées d'amélioration

- Les relations complexes (`@@id` / `@@unique` composites Prisma, `N:N`
  implicites) sont représentées de façon simplifiée.
- Enums Prisma et contraintes `CHECK` SQL non importés.
- Pas de mini-carte de navigation ; pas de liaison par glisser-déposer (clic-clic uniquement).
- Pistes : liaisons `N:N` avec table de jointure auto, export Mermaid / DBML,
  mode présentation, collaboration temps réel.

---

## Licence

Projet personnel — libre d'utilisation et de modification. Amusez-vous bien !
