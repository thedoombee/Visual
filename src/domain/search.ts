import type { DBModel, DBTable, ImportSlot, Instance } from "../types";
import { tablesOfSlot } from "./instances";

// ---------- recherche globale (tables + modèles) ----------
// Module pur : l'App branche les résultats sur le canvas, les composants ne
// font qu'afficher. Une requête matche les tables/champs/types, ET les noms de
// modèles importés / d'instances pour retrouver un modèle entier.

export interface ModelSearchHit {
  slot: ImportSlot;
  instance: Instance | undefined;
  tables: DBTable[];
  visible: boolean;
}

export function normalizeQuery(query: string): string {
  return query.trim().toLocaleLowerCase("fr");
}

export function textMatches(text: string | undefined, query: string): boolean {
  if (!query) return true;
  return (text ?? "").toLocaleLowerCase("fr").includes(query);
}

/** Table : nom, champ ou type (le comportement historique de la barre). */
export function tableMatchesQuery(table: DBTable, query: string): boolean {
  if (!query) return true;
  return (
    textMatches(table.name, query) ||
    table.fields.some((f) => textMatches(f.name, query) || textMatches(f.type, query))
  );
}

/** Le nom du modèle ou de son instance suffit à considérer la table trouvée. */
export function tableMatchesQueryInScope(
  table: DBTable,
  query: string,
  slotById: Map<string, ImportSlot>,
  instanceById: Map<string, Instance>
): boolean {
  if (tableMatchesQuery(table, query)) return true;
  const slot = table.slotId ? slotById.get(table.slotId) : undefined;
  if (!slot) return false;
  if (textMatches(slot.name, query)) return true;
  const instance = slot.instanceId ? instanceById.get(slot.instanceId) : undefined;
  return textMatches(instance?.name, query);
}

/** Modèles dont le nom (ou celui du projet parent) correspond à la requête. */
export function searchModels(
  model: DBModel,
  slots: ImportSlot[],
  instances: Instance[],
  query: string
): ModelSearchHit[] {
  const q = normalizeQuery(query);
  if (!q) return [];
  const instanceById = new Map(instances.map((i) => [i.id, i]));
  return slots
    .map((slot) => {
      const instance = slot.instanceId ? instanceById.get(slot.instanceId) : undefined;
      const hit = textMatches(slot.name, q) || textMatches(instance?.name, q);
      if (!hit) return null;
      return {
        slot,
        instance,
        tables: tablesOfSlot(model, slot.id),
        visible: !slot.hidden && !instance?.hidden,
      };
    })
    .filter((hit): hit is ModelSearchHit => !!hit)
    .sort((a, b) => {
      if (a.visible !== b.visible) return a.visible ? -1 : 1;
      if (!!a.instance !== !!b.instance) return a.instance ? 1 : -1;
      return (a.instance?.name ?? a.slot.name).localeCompare(
        b.instance?.name ?? b.slot.name,
        "fr"
      );
    });
}
