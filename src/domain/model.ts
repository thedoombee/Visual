import type { DBField, DBModel, DBRelation, DBTable, ImportSlot } from "../types";
import { uid } from "../types";
import { CARD_W } from "./geometry";

export interface ModelIssue {
  level: "err" | "warn";
  text: string;
}

// ---------- tables ----------

export function freeTableName(tables: DBTable[], base: string): string {
  const taken = new Set(tables.map((t) => t.name));
  if (!taken.has(base)) return base;
  let k = 2;
  while (taken.has(`${base}_${k}`)) k++;
  return `${base}_${k}`;
}

export function createTable(tables: DBTable[]): DBTable {
  return {
    id: uid("t"),
    name: freeTableName(tables, `nouvelle_table_${tables.length + 1}`),
    x: 80 + (tables.length * 90) % 600,
    y: 80 + (tables.length * 70) % 500,
    fields: [{ id: uid("f"), name: "id", type: "SERIAL", pk: true, nullable: false }],
  };
}

export function duplicateTable(tables: DBTable[], id: string): DBTable | null {
  const t = tables.find((x) => x.id === id);
  if (!t) return null;
  return {
    ...t,
    id: uid("t"),
    name: freeTableName(tables, `${t.name}_copie`),
    x: t.x + 40,
    y: t.y + 40,
    fields: t.fields.map((f) => ({ ...f, id: uid("f") })),
  };
}

export function insertTable(model: DBModel, t: DBTable): DBModel {
  return { ...model, tables: [...model.tables, t] };
}

export function removeTable(model: DBModel, id: string): DBModel {
  const t = model.tables.find((x) => x.id === id);
  if (!t) return model;
  return {
    tables: model.tables.filter((x) => x.id !== id),
    relations: model.relations.filter((r) => r.fromTable !== t.name && r.toTable !== t.name),
  };
}

export function renameTableIn(model: DBModel, id: string, clean: string): DBModel {
  const old = model.tables.find((t) => t.id === id);
  if (!old) return model;
  return {
    tables: model.tables.map((t) => (t.id === id ? { ...t, name: clean } : t)),
    relations: model.relations.map((r) => ({
      ...r,
      fromTable: r.fromTable === old.name ? clean : r.fromTable,
      toTable: r.toTable === old.name ? clean : r.toTable,
    })),
  };
}

export function moveTableIn(model: DBModel, id: string, x: number, y: number): DBModel {
  return {
    ...model,
    tables: model.tables.map((t) =>
      t.id === id ? { ...t, x: Math.round(x), y: Math.round(y) } : t
    ),
  };
}

/** Les tables du slot redeviennent "sans modèle" : toujours visibles. */
export function untagSlotTables(model: DBModel, slotId: string): DBModel {
  if (!model.tables.some((t) => t.slotId === slotId)) return model;
  return {
    ...model,
    tables: model.tables.map((t) =>
      t.slotId === slotId ? { ...t, slotId: undefined } : t
    ),
  };
}

// ---------- fields ----------

export function updateFieldIn(
  model: DBModel,
  tableId: string,
  fieldId: string,
  patch: Partial<DBField>
): DBModel {
  return {
    ...model,
    tables: model.tables.map((t) =>
      t.id === tableId
        ? { ...t, fields: t.fields.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)) }
        : t
    ),
  };
}

export function addFieldTo(model: DBModel, tableId: string): DBModel {
  return {
    ...model,
    tables: model.tables.map((t) =>
      t.id === tableId
        ? {
            ...t,
            fields: [
              ...t.fields,
              { id: uid("f"), name: `champ_${t.fields.length + 1}`, type: "TEXT", nullable: true },
            ],
          }
        : t
    ),
  };
}

export function deleteFieldFrom(model: DBModel, tableId: string, fieldId: string): DBModel {
  const t = model.tables.find((x) => x.id === tableId);
  const f = t?.fields.find((x) => x.id === fieldId);
  return {
    tables: model.tables.map((x) =>
      x.id === tableId ? { ...x, fields: x.fields.filter((y) => y.id !== fieldId) } : x
    ),
    relations: f
      ? model.relations.filter(
          (r) =>
            !(r.fromTable === t!.name && r.fromField === f.name) &&
            !(r.toTable === t!.name && r.toField === f.name)
        )
      : model.relations,
  };
}

// ---------- relations ----------

/** Champ suggéré côté source : xxx_id qui vise la cible, sinon 1er non-PK, sinon 1er. */
export function suggestFromField(tables: DBTable[], srcName: string, dstName: string): string {
  const src = tables.find((t) => t.name === srcName);
  if (!src || !src.fields.length) return "";
  const dst = dstName.toLowerCase();
  const sing = (s: string) => (s.endsWith("s") ? s.slice(0, -1) : s);
  const hit =
    src.fields.find((f) => {
      const low = f.name.toLowerCase();
      return (
        low === `${dst}_id` ||
        low === `${dst}id` ||
        low === `${sing(dst)}_id` ||
        low === `${sing(dst)}id`
      );
    }) ??
    src.fields.find((f) => !f.pk) ??
    src.fields[0];
  return hit.name;
}

/** Champ suggéré côté cible : la PK, sinon le 1er champ. */
export function suggestToField(tables: DBTable[], dstName: string): string {
  const dst = tables.find((t) => t.name === dstName);
  if (!dst || !dst.fields.length) return "";
  return (dst.fields.find((f) => f.pk) ?? dst.fields[0]).name;
}

export function isDuplicateRelation(
  relations: DBRelation[],
  fromTable: string,
  fromField: string,
  toTable: string,
  toField: string
): boolean {
  return relations.some(
    (r) =>
      r.fromTable === fromTable &&
      r.fromField === fromField &&
      r.toTable === toTable &&
      r.toField === toField
  );
}

/** Ajoute le lien et marque le champ source comme FK. */
export function addRelationTo(model: DBModel, rel: DBRelation): DBModel {
  return {
    ...model,
    tables: model.tables.map((t) =>
      t.name === rel.fromTable
        ? {
            ...t,
            fields: t.fields.map((f) =>
              f.name === rel.fromField ? { ...f, fk: true } : f
            ),
          }
        : t
    ),
    relations: [...model.relations, rel],
  };
}

export function removeRelation(model: DBModel, id: string): DBModel {
  return { ...model, relations: model.relations.filter((r) => r.id !== id) };
}

export function updateRelationCards(
  model: DBModel,
  id: string,
  side: "a" | "b",
  value: string
): DBModel {
  return {
    ...model,
    relations: model.relations.map((r) =>
      r.id === id ? { ...r, ...(side === "a" ? { fromCard: value } : { toCard: value }) } : r
    ),
  };
}

// ---------- import / merge ----------

export interface MergeResult {
  model: DBModel;
  ids: string[];
}

/**
 * Fusionne un modèle parsé dans le canvas : nouvelles ids, slot d'origine,
 * renommage anti-doublons (+ propagation aux liens), décalage à droite.
 */
export function mergeModel(base: DBModel, parsed: DBModel, slotId?: string): MergeResult {
  const existing = new Set(base.tables.map((t) => t.name));
  const rename = new Map<string, string>();
  const incoming: DBModel = {
    tables: parsed.tables.map((t) => ({
      ...t,
      id: uid("t"),
      slotId,
      fields: t.fields.map((f) => ({ ...f, id: uid("f") })),
    })),
    relations: parsed.relations.map((r) => ({ ...r, id: uid("rel") })),
  };
  for (const t of incoming.tables) {
    if (existing.has(t.name)) {
      let k = 2;
      while (existing.has(`${t.name}_${k}`)) k++;
      rename.set(t.name, `${t.name}_${k}`);
      t.name = `${t.name}_${k}`;
    }
    existing.add(t.name);
  }
  for (const r of incoming.relations) {
    if (rename.has(r.fromTable)) r.fromTable = rename.get(r.fromTable)!;
    if (rename.has(r.toTable)) r.toTable = rename.get(r.toTable)!;
  }
  const maxX = base.tables.length ? Math.max(...base.tables.map((t) => t.x + CARD_W)) : 0;
  const dx = Math.max(0, maxX + 120 - 60);
  for (const t of incoming.tables) t.x += dx;
  return {
    model: {
      tables: [...base.tables, ...incoming.tables],
      relations: [...base.relations, ...incoming.relations],
    },
    ids: incoming.tables.map((t) => t.id),
  };
}

// ---------- layout ----------

export function autoLayoutModel(model: DBModel): DBModel {
  const cols = Math.max(1, Math.ceil(Math.sqrt(model.tables.length)));
  return {
    ...model,
    tables: model.tables.map((t, i) => ({
      ...t,
      x: 60 + (i % cols) * (CARD_W + 90),
      y: 60 + Math.floor(i / cols) * 300,
    })),
  };
}

// ---------- visibilité par modèle ----------

export function hiddenSlotIdsOf(slots: ImportSlot[]): Set<string> {
  return new Set(slots.filter((s) => s.hidden).map((s) => s.id));
}

/** Tables visibles : un slot masqué cache ses tables ; sans slotId = toujours visible. */
export function visibleTablesOf(model: DBModel, hiddenSlotIds: Set<string>): DBTable[] {
  return model.tables.filter((t) => !t.slotId || !hiddenSlotIds.has(t.slotId));
}

/** Liens visibles : résolus par ID pour survivre aux doublons de noms hérités. */
export function visibleRelationsOf(model: DBModel, visibleTables: DBTable[]): DBRelation[] {
  const byName = new Map(model.tables.map((t) => [t.name, t]));
  const visibleIds = new Set(visibleTables.map((t) => t.id));
  return model.relations.filter((r) => {
    const a = byName.get(r.fromTable);
    const b = byName.get(r.toTable);
    return !!a && !!b && visibleIds.has(a.id) && visibleIds.has(b.id);
  });
}

/** Compteur de tables par slot (badge du panneau gauche). */
export function slotTableCounts(model: DBModel): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of model.tables) if (t.slotId) m.set(t.slotId, (m.get(t.slotId) ?? 0) + 1);
  return m;
}

// ---------- validation ----------

export function validateModel(model: DBModel): ModelIssue[] {
  const out: ModelIssue[] = [];
  const names = new Set(model.tables.map((t) => t.name));
  const seen = new Set<string>();
  const byName = new Map(model.tables.map((t) => [t.name, t]));
  for (const t of model.tables) {
    if (seen.has(t.name))
      out.push({
        level: "err",
        text: `Nom en double : « ${t.name} » — renomme une des deux tables (les liens s'y perdent).`,
      });
    else seen.add(t.name);
    if (!t.fields.some((f) => f.pk)) out.push({ level: "warn", text: `${t.name} : sans PRIMARY KEY` });
    const linked = model.relations.some((r) => r.fromTable === t.name || r.toTable === t.name);
    if (!linked && model.tables.length > 1)
      out.push({ level: "warn", text: `${t.name} : table isolée (aucun lien)` });
  }
  for (const r of model.relations) {
    if (!names.has(r.fromTable) || !names.has(r.toTable))
      out.push({
        level: "err",
        text: `Lien orphelin : ${r.fromTable}.${r.fromField} → ${r.toTable}.${r.toField}`,
      });
    else {
      const a = byName.get(r.fromTable);
      const b = byName.get(r.toTable);
      if (a && !a.fields.some((f) => f.name === r.fromField))
        out.push({ level: "err", text: `${r.fromTable}.${r.fromField} n'existe plus` });
      if (b && !b.fields.some((f) => f.name === r.toField))
        out.push({ level: "err", text: `${r.toTable}.${r.toField} n'existe plus` });
    }
  }
  return out;
}
