import type { DBModel, DBRelation, DBTable, ImportSlot, Instance } from "../types";

// ---------- noms de tables à portée d'instance ----------
// Les projets sont étanches : deux tables homonymes peuvent vivre dans deux
// instances différentes sans suffixe artificiel (_2, _3…). La contrainte de
// nom unique ne s'applique qu'aux tables qui peuvent communiquer (même
// instance, ou table hors instance qui reste libre de tout lien).

export function instanceIdOfTable(slots: ImportSlot[], table: Pick<DBTable, "slotId">): string | undefined {
  if (!table.slotId) return undefined;
  return slots.find((s) => s.id === table.slotId)?.instanceId;
}

export function namesCanShareAcrossInstances(
  instanceA: string | undefined,
  instanceB: string | undefined
): boolean {
  return !!instanceA && !!instanceB && instanceA !== instanceB;
}

/** Nom libre vis-à-vis des seules tables qui ne peuvent PAS partager le nom. */
export function freeScopedTableName(
  tables: DBTable[],
  base: string,
  canShare: (t: DBTable) => boolean
): string {
  const taken = new Set(tables.filter((t) => !canShare(t)).map((t) => t.name));
  if (!taken.has(base)) return base;
  let k = 2;
  while (taken.has(`${base}_${k}`)) k++;
  return `${base}_${k}`;
}

/** Nom libre pour une table qui rejoint un slot (donc une instance éventuelle). */
export function freeTableNameInSlot(
  tables: DBTable[],
  slots: ImportSlot[],
  slotId: string | undefined,
  base: string
): string {
  const instanceId = slotId
    ? slots.find((s) => s.id === slotId)?.instanceId
    : undefined;
  return freeScopedTableName(tables, base, (t) =>
    namesCanShareAcrossInstances(instanceId, instanceIdOfTable(slots, t))
  );
}

/** Initiales lisibles d'une instance pour qualifier un export ambigu. */
export function scopeInitials(name: string): string {
  const clean = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s-]/g, " ")
    .trim();
  if (!clean) return "X";
  const words = clean.split(/[\s-]+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .slice(0, 4)
    .map((w) => w.charAt(0))
    .join("")
    .toUpperCase();
}

/** Libellé du propriétaire d'une table : instance, sinon modèle, sinon manuel. */
export function tableScopeLabel(
  table: Pick<DBTable, "slotId">,
  slots: ImportSlot[],
  instances: Instance[]
): string {
  const slot = table.slotId ? slots.find((s) => s.id === table.slotId) : undefined;
  const instance = slot?.instanceId
    ? instances.find((i) => i.id === slot.instanceId)
    : undefined;
  return instance?.name || slot?.name || "Manuel";
}

/**
 * Qualifie les homonymes au moment d'un export multi-instances (canvas).
 * Les noms internes ne changent jamais ; cette copie sert uniquement à
 * produire un SQL/Prisma/SVG non ambigu, avec les initiales du projet.
 * Aucun homonyme = modèle renvoyé tel quel.
 */
export function qualifyModelForExport(
  model: DBModel,
  slots: ImportSlot[],
  instances: Instance[]
): DBModel {
  const counts = new Map<string, number>();
  for (const t of model.tables) counts.set(t.name, (counts.get(t.name) ?? 0) + 1);
  if (![...counts.values()].some((n) => n > 1)) return model;

  const oldById = new Map(model.tables.map((t) => [t.id, t]));
  const used = new Set(model.tables.map((t) => t.name));
  const rename = new Map<string, string>();
  for (const t of model.tables) {
    if ((counts.get(t.name) ?? 0) < 2) continue;
    const prefix = scopeInitials(tableScopeLabel(t, slots, instances));
    let candidate = `${prefix}_${t.name}`;
    let k = 2;
    while (used.has(candidate)) {
      candidate = `${prefix}_${t.name}_${k}`;
      k++;
    }
    used.add(candidate);
    rename.set(t.id, candidate);
  }

  const tables = model.tables.map((t) =>
    rename.has(t.id) ? { ...t, name: rename.get(t.id)! } : t
  );
  const relationName = (id: string | undefined, fallback: string): string => {
    if (id) {
      const next = rename.get(id);
      if (next) return next;
      return oldById.get(id)?.name ?? fallback;
    }
    const matches = model.tables.filter((t) => t.name === fallback);
    return matches.length === 1 ? rename.get(matches[0].id) ?? fallback : fallback;
  };
  const relations: DBRelation[] = model.relations.map((r) => ({
    ...r,
    fromTable: relationName(r.fromTableId, r.fromTable),
    toTable: relationName(r.toTableId, r.toTable),
  }));
  return { tables, relations };
}
