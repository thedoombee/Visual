import type { DBModel } from "../types";
import { toDrizzle, toPrisma, toSQL } from "../generators";
import { exportSVGString } from "./exportSvg";

// ---------- Registre d'exporteurs (principe Ouvert/Fermé) ----------
// Ajouter un format = appeler `registerExporter(...)` depuis son module,
// SANS modifier `ExportModal` ni `App` : ils itèrent sur `listExporters()`.

export interface Exporter {
  /** id stable : "sql" | "prisma" | "drizzle" | "json" | "svg" | ... */
  id: string;
  /** Libellé FR affiché dans le menu d'export. */
  label: string;
  /** Extension du fichier téléchargé (sans point). */
  extension: string;
  /** MIME du Blob de téléchargement. */
  mime: string;
  /** Génère le contenu textuel pour un sous-modèle. Fonction pure. */
  generate: (model: DBModel) => string;
  /** Catégorie : "code" (textuel, zipable par modèle) ou "image". */
  kind: "code" | "image" | "data";
}

const registry = new Map<string, Exporter>();

export function registerExporter(e: Exporter): void {
  registry.set(e.id, e);
}

export function listExporters(): Exporter[] {
  return [...registry.values()];
}

export function getExporter(id: string): Exporter | undefined {
  return registry.get(id);
}

// Formats intégrés : enregistrés ici, le reste de l'app ne les connaît que
// par le registre (ajouter un format ne touche à aucun composant).
registerExporter({
  id: "sql",
  label: "SQL (Postgres)",
  extension: "sql",
  mime: "text/sql",
  generate: toSQL,
  kind: "code",
});
registerExporter({
  id: "prisma",
  label: "Prisma (.prisma)",
  extension: "prisma",
  mime: "text/plain",
  generate: toPrisma,
  kind: "code",
});
registerExporter({
  id: "drizzle",
  label: "Drizzle (.ts)",
  extension: "ts",
  mime: "text/plain",
  generate: toDrizzle,
  kind: "code",
});
registerExporter({
  id: "json",
  label: "JSON (sauvegarde)",
  extension: "json",
  mime: "application/json",
  generate: (m) => JSON.stringify(m, null, 2),
  kind: "data",
});
registerExporter({
  id: "svg",
  label: "Image SVG (MCD)",
  extension: "svg",
  mime: "image/svg+xml",
  generate: (m) => exportSVGString(m.tables, m.relations),
  kind: "image",
});

/** Nom de fichier sûr : minuscules, sans accents ni caractères spéciaux. */
export function safeFileName(name: string, extension: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "modele";
  return `${base}.${extension}`;
}
