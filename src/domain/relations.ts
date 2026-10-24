import type { DBModel, DBRelation, DBTable } from "../types";

// ---------- identité des liens ----------
// Les noms de tables peuvent se répéter entre instances (projets étanches).
// L'identité d'un lien passe donc d'abord par les IDs, le nom restant le
// libellé lisible / la compatibilité des sauvegardes existantes.
// Module pur, sans React : source unique de vérité pour résoudre une extrémité.

export function tableById(model: DBModel, id?: string): DBTable | undefined {
  if (!id) return undefined;
  return model.tables.find((t) => t.id === id);
}

/** Tables portant un nom donné (0, 1 ou plusieurs si plusieurs instances). */
export function tablesByName(model: DBModel, name: string): DBTable[] {
  return model.tables.filter((t) => t.name === name);
}

/** Résout une extrémité : ID prioritaire, nom en secours (sauvegardes v1). */
export function resolveTable(
  model: DBModel,
  name: string,
  id?: string
): DBTable | undefined {
  const byId = tableById(model, id);
  if (byId) return byId;
  return tablesByName(model, name)[0];
}

export interface RelationEnds {
  from?: DBTable;
  to?: DBTable;
}

export function relationEnds(model: DBModel, r: DBRelation): RelationEnds {
  return {
    from: resolveTable(model, r.fromTable, r.fromTableId),
    to: resolveTable(model, r.toTable, r.toTableId),
  };
}

/** Vrai si le lien part de ou arrive à cette table (par ID, sinon nom). */
export function relationTouchesTable(r: DBRelation, table: Pick<DBTable, "id" | "name">): boolean {
  return (
    (r.fromTableId ? r.fromTableId === table.id : r.fromTable === table.name) ||
    (r.toTableId ? r.toTableId === table.id : r.toTable === table.name)
  );
}

/** Clé de déduplication : IDs quand ils existent, sinon noms (legacy). */
export function relationKey(r: DBRelation): string {
  return [
    r.fromTableId ?? r.fromTable,
    r.fromField,
    "->",
    r.toTableId ?? r.toTable,
    r.toField,
  ].join(".");
}

/**
 * Remplit les IDs manquants des extrémités et resynchronise les noms avec les
 * tables résolues. Idempotent : appelé au chargement des sauvegardes, des
 * snapshots partagés et des imports JSON. Une sauvegarde ancienne n'a que des
 * noms uniques : la résolution est sans ambiguïté.
 */
export function normalizeRelationIds(model: DBModel): DBModel {
  if (!model.relations.length) return model;
  const byId = new Map(model.tables.map((t) => [t.id, t]));
  const byName = new Map<string, DBTable[]>();
  for (const t of model.tables) {
    const list = byName.get(t.name);
    if (list) list.push(t);
    else byName.set(t.name, [t]);
  }
  const nameOf = (name: string, id?: string): DBTable | undefined => {
    if (id && byId.has(id)) return byId.get(id);
    const candidates = byName.get(name);
    return candidates?.length === 1 ? candidates[0] : candidates?.[0];
  };
  let changed = false;
  const relations = model.relations.map((r) => {
    const from = nameOf(r.fromTable, r.fromTableId);
    const to = nameOf(r.toTable, r.toTableId);
    const fromTableId = from?.id ?? r.fromTableId;
    const toTableId = to?.id ?? r.toTableId;
    const fromTable = from?.name ?? r.fromTable;
    const toTable = to?.name ?? r.toTable;
    if (
      fromTableId === r.fromTableId &&
      toTableId === r.toTableId &&
      fromTable === r.fromTable &&
      toTable === r.toTable
    ) {
      return r;
    }
    changed = true;
    return { ...r, fromTableId, toTableId, fromTable, toTable };
  });
  return changed ? { ...model, relations } : model;
}
