# MCD Studio

> Collez un schema **Prisma**, **Drizzle** ou **SQL**, obtenez un beau diagramme
> de base de données (type MCD), modifiez-le à la souris, puis exportez-le
> en **SQL**, **Prisma**, **Drizzle**, **SVG**, **PNG** ou **JSON**.

Application 100 % locale (aucun serveur, aucune donnée envoyée sur le réseau) —
votre diagramme est sauvegardé automatiquement dans le navigateur.

---

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Démarrage rapide](#démarrage-rapide)
- [Utilisation](#utilisation)
  - [Importer un schema](#importer-un-schema)
  - [Modifier le diagramme](#modifier-le-diagramme)
  - [Exporter](#exporter)
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
| **Import multi-formats** | Détection automatique : `schema.prisma` (blocs `model`), Drizzle (`pgTable` / `mysqlTable` / `sqliteTable`), SQL (`CREATE TABLE`). Boutons d'exemples intégrés. |
| **Diagramme interactif** | Cartes déplaçables à la souris, relations en courbes de Bézier avec cardinalité (`N:1`), pan par glisser du fond, zoom (Ctrl + molette ou boutons). |
| **Édition complète** | Renommer tables et champs, changer les types, basculer PK / FK / UQ / NULL, ajouter / dupliquer / supprimer tables et champs, créer / supprimer des relations. |
| **Panneaux escamotables** | Chaque panneau latéral peut être masqué via la barre du haut, la barre d'outils du canvas, sa propre croix, l'onglet flottant sur le bord du canvas ou le clavier. |
| **Exports** | SQL, Prisma, Drizzle (`pgTable`), JSON (sauvegarde / restauration), SVG vectoriel et PNG (rendu via canvas). Copie presse-papiers + téléchargement. |
| **Sauvegarde auto** | Chaque modification est persistée dans `localStorage` (avec indicateur « ✓ sauvegardé »). Import / export JSON pour partager ou versionner. |

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

---

## Utilisation

### Importer un schema

1. Collez votre schema dans le panneau de gauche (**1 · Coller ton schema**).
   Le badge détecte automatiquement le format : `PRISMA`, `DRIZZLE`, `SQL` ou `AUTO`.
2. Cliquez sur **✨ Générer le MCD**.
3. Un message confirme le résultat, ex. : `4 table(s) • 5 relation(s) importée(s) [sql]`.

> Si « Aucune table détectée » s'affiche, vérifiez que le texte contient
> bien des blocs `model { … }`, des appels `pgTable("…", { … })` ou des
> instructions `CREATE TABLE … ( … );`.

### Modifier le diagramme

- **Déplacer** : glissez une carte par son en-tête ; glissez le fond pour
  déplacer la vue (*pan*).
- **Zoomer** : `Ctrl` + molette, ou boutons `−` / `＋` (de 40 % à 180 %),
  `Recentrer` pour revenir à la vue d'origine.
- **Sélectionner** : cliquez une table pour l'éditer dans le panneau de droite.
- **Table** : renommer (les relations suivent automatiquement), dupliquer,
  supprimer.
- **Champs** : nom, type (liste de suggestions : `SERIAL`, `VARCHAR(255)`,
  `TEXT`, `UUID`, …), cases `PK` / `FK` / `UQ` / `NULL`, suppression.
  Cocher `PK` rend le champ non-nul automatiquement.
- **Relations** : formulaire « Créer une relation » (champ source `N` →
  champ cible `1`), suppression depuis la liste ou depuis la fiche table.

### Exporter

Barre du haut ou modales d'export :

| Bouton | Résultat |
|---|---|
| `SQL` | `CREATE TABLE` avec `PRIMARY KEY`, `NOT NULL`, `UNIQUE` et `FOREIGN KEY`. |
| `Prisma` | Blocs `model` avec `@id`, `@unique`, `@default`, `@map` / `@@map` et `@relation`. |
| `Drizzle` | `pgTable("…", { … })` avec `.primaryKey()`, `.notNull()`, `.unique()`, `.references(…)`. |
| `SVG` | Fichier vectoriel du diagramme (téléchargement direct). |
| `⤓ PNG` | Image PNG du diagramme (rendu via `<canvas>`, téléchargement direct). |
| `JSON` | Modèle interne complet — à réimporter via **Importer JSON…** pour restaurer. |

Chaque modale propose **⧉ Copier** (presse-papiers) et **⤓ Télécharger**.

---

## Formats supportés

**Prisma** — modèles, `@id`, `@unique`, `@map` / `@@map`, `@relation(fields, references)`.
Les noms sont convertis en `snake_case` pour l'affichage SQL. Les champs
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
| `[` | Afficher / masquer le panneau d'import (gauche) |
| `]` | Afficher / masquer le panneau d'édition (droite) |

> Les raccourcis sont ignorés pendant la saisie dans un champ, un menu
> déroulant ou la zone de collage.

Autres façons de basculer les panneaux : boutons `⟨ Import` / `Édition ⟩`
dans la barre du haut, boutons dans la barre d'outils du canvas, croix `⟨`
/ `⟩` dans l'en-tête de chaque panneau, et onglets flottants `⟩` / `⟨`
sur les bords du canvas quand un panneau est masqué.

---

## Structure du projet

```
.
├── index.html            # Titre + point d'entrée (lang="fr")
├── package.json          # Dépendances (react, react-dom) + scripts Vite
├── vite.config.ts        # Config Vite + plugin React
└── src/
    ├── main.tsx          # Bootstrap React
    ├── App.tsx           # UI : topbar, import, canvas drag & drop, inspecteur, exports
    ├── types.ts          # DBTable, DBField, DBRelation, DBModel + uid()
    ├── parsers.ts        # Détection + parseurs Prisma / Drizzle / SQL (+ auto-layout)
    ├── generators.ts     # Générateurs SQL / Prisma / Drizzle
    ├── examples.ts       # Exemples prêts à coller (Prisma, Drizzle, SQL)
    └── index.css         # Thème clair minimaliste + cartes + onglets latéraux
```

**Choix techniques :** React 19 + TypeScript + Vite, zéro dépendance
appliquée au runtime en dehors de React (pas de librairie de diagrammes —
canvas SVG maison), parsing par expressions régulières sans backend.

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

- Sauvegarde automatique (debounce ~400 ms) du modèle dans `localStorage`
  sous la clé **`mcd-studio-v1`**, avec heure de dernière sauvegarde affichée.
- Au chargement, le dernier diagramme est restauré ; sinon un exemple SQL
  est affiché.
- Le bouton `⌫` réinitialise le canvas (avec confirmation).
- Pour versionner ou transférer un diagramme, utilisez l'export / import **JSON**.

---

## Limites connues & idées d'amélioration

- Les relations complexes (`@@id`, `@@unique` composites Prisma, tables de
  jointure `N:N` implicites) sont représentées de façon simplifiée.
- Les enums Prisma et les contraintes `CHECK` SQL ne sont pas encore importés.
- Pas de disposition automatique anti-chevauchement (« auto-layout ») après
  édition — les cartes se placent en grille à l'import uniquement.
- Pistes : annuler / rétablir, cardinalités `1:1` / `N:N` éditables,
  mini-carte de navigation, export Mermaid / DBML, mode sombre.

---

## Licence

Projet personnel — libre d'utilisation et de modification. Amusez-vous bien ! 🎉
