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

/** Supprime les tables d'un slot + les liens qui les touchent (suppression modèle). */
export function removeSlotTables(model: DBModel, slotId: string): DBModel {
  const gone = model.tables.filter((t) => t.slotId === slotId);
  if (!gone.length) return model;
  const goneNames = new Set(gone.map((t) => t.name));
  return {
    tables: model.tables.filter((t) => t.slotId !== slotId),
    relations: model.relations.filter(
      (r) => !goneNames.has(r.fromTable) && !goneNames.has(r.toTable)
    ),
  };
}

/**
 * Migration des stockages cassés (tables du modèle de base sans `slotId`) :
 * rattache les tables orphelines au slot donné. Les tables déjà taguées
 * et les tables manuelles post-migration ne sont pas concernées quand
 * l'appelant ne l'applique qu'aux modèles 100 % orphelins.
 */
export function tagUntaggedTables(model: DBModel, slotId: string): DBModel {
  if (!model.tables.some((t) => !t.slotId)) return model;
  return {
    ...model,
    tables: model.tables.map((t) => (t.slotId ? t : { ...t, slotId })),
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

// ---------- cardinalités MCD intelligentes (Merise) ----------

export interface McdCards {
  fromCard: string;
  toCard: string;
}

/**
 * Règle Merise côté porteur (celui qui porte la FK) :
 * - min = 0 si le champ est NULLABLE, sinon 1 ;
 * - max = 1 si le champ est UNIQUE (ou PK = 1-1), sinon N.
 * Côté cible (référencé par sa PK) : toujours 1,1.
 * Ne casse rien : les cartes posées à la main restent prioritaires.
 */
export function inferMcdCards(
  srcField?: Pick<DBField, "nullable" | "unique" | "pk">
): McdCards {
  if (srcField?.pk) return { fromCard: "1,1", toCard: "1,1" };
  const min = srcField?.nullable !== false ? "0" : "1";
  const max = srcField?.unique ? "1" : "N";
  return { fromCard: `${min},${max}`, toCard: "1,1" };
}

/** Cartes inférées pour un couple source→cible connu (formulaire, clic-clic). */
export function inferCardsFor(
  tables: DBTable[],
  fromTable: string,
  fromField: string
): McdCards {
  const t = tables.find((x) => x.name === fromTable);
  const f = t?.fields.find((x) => x.name === fromField);
  return inferMcdCards(f);
}

/** Réapplique les cartes inférées sur des liens existants (parsers). */
export function withInferredCards(
  tables: Array<Pick<DBTable, "name" | "fields">>,
  relations: DBRelation[]
): DBRelation[] {
  return relations.map((r) => {
    const t = tables.find((x) => x.name === r.fromTable);
    const f = t?.fields.find((x) => x.name === r.fromField);
    const { fromCard, toCard } = inferMcdCards(f);
    return { ...r, fromCard, toCard };
  });
}

/**
 * Devine la table cible d'un champ FK (`xxx_id`, `xxxId`, singulier/pluriel).
 * Partagé entre parsers et détection inter-modèles. Retourne le nom tel quel.
 */
export function guessFkTarget(fieldName: string, tableNames: string[]): string | null {
  const n = fieldName.toLowerCase();
  const lower = new Map(tableNames.map((t) => [t.toLowerCase(), t]));
  for (const t of tableNames) {
    const tl = t.toLowerCase();
    const sing = tl.endsWith("s") ? tl.slice(0, -1) : tl;
    if (
      n === `${tl}_id` ||
      n === `${tl}id` ||
      n === `${sing}_id` ||
      n === `${sing}id`
    )
      return t;
    void lower;
  }
  if (n === "author_id" && lower.has("users")) return lower.get("users")!;
  if (n === "author_id" && lower.has("user")) return lower.get("user")!;
  // Heuristique : xxx_id -> xxx ou xxx + s
  if (n.endsWith("_id")) {
    const base = n.slice(0, -3);
    if (lower.has(base)) return lower.get(base)!;
    if (lower.has(base + "s")) return lower.get(base + "s")!;
  }
  return null;
}

/**
 * Détecte les FK implicites CROISÉES entre tables entrantes et tables déjà
 * présentes (liaison seulement : le champ FK doit exister, on ne crée rien).
 * Couvre les 2 sens : entrant→existant et existant→entrant.
 */
export function detectCrossRelations(
  incomingTables: DBTable[],
  baseTables: DBTable[],
  existingRelations: DBRelation[]
): DBRelation[] {
  const incomingNames = new Set(incomingTables.map((t) => t.name));
  const baseNames = new Set(baseTables.map((t) => t.name));
  const allNames = [...baseTables.map((t) => t.name), ...incomingTables.map((t) => t.name)];
  const byName = new Map(
    [...baseTables, ...incomingTables].map((t) => [t.name, t])
  );
  const seen = new Set(
    existingRelations.map((r) => `${r.fromTable}.${r.fromField}→${r.toTable}.${r.toField}`)
  );
  const out: DBRelation[] = [];
  const scan = (sources: DBTable[], validTargets: Set<string>) => {
    for (const src of sources) {
      for (const f of src.fields) {
        const cand = guessFkTarget(f.name, allNames);
        if (!cand || cand === src.name || !validTargets.has(cand)) continue;
        const target = byName.get(cand);
        if (!target) continue;
        const toField = target.fields.find((x) => x.pk)?.name ?? target.fields[0]?.name;
        if (!toField) continue;
        const key = `${src.name}.${f.name}→${cand}.${toField}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const { fromCard, toCard } = inferMcdCards(f);
        out.push({
          id: uid("rel"),
          fromTable: src.name,
          fromField: f.name,
          toTable: cand,
          toField,
          fromCard,
          toCard,
        });
      }
    }
  };
  scan(incomingTables, baseNames);
  scan(baseTables, incomingNames);
  return out;
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
  /** Liens FK auto-détectés vers / depuis les tables déjà présentes. */
  autoLinked: number;
}

export interface SyncStats {
  added: number;
  updated: number;
  removed: number;
  autoLinked: number;
}

export interface SyncResult {
  model: DBModel;
  ids: string[];
  stats: SyncStats;
}

/**
 * Fusionne un modèle parsé dans le canvas : nouvelles ids, slot d'origine,
 * renommage anti-doublons (+ propagation aux liens), décalage à droite,
 * + détection des FK croisées vers les tables déjà présentes (cartes Merise
 * inférées depuis nullable/unique, sans toucher aux liens existants).
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
  // FK croisées : xxx_id du nouveau modèle → anciennes tables et inversement.
  const cross = detectCrossRelations(incoming.tables, base.tables, [
    ...base.relations,
    ...incoming.relations,
  ]);
  // Marque les champs sources comme FK (copies, sans muter `base`).
  const baseCopy: DBTable[] = base.tables.map((t) => ({
    ...t,
    fields: t.fields.map((f) => ({ ...f })),
  }));
  const allTables = [...baseCopy, ...incoming.tables];
  const byName = new Map(allTables.map((t) => [t.name, t]));
  for (const r of cross) {
    const src = byName.get(r.fromTable);
    const f = src?.fields.find((x) => x.name === r.fromField);
    if (f) f.fk = true;
  }
  return {
    model: {
      tables: allTables,
      relations: [...base.relations, ...incoming.relations, ...cross],
    },
    ids: incoming.tables.map((t) => t.id),
    autoLinked: cross.length,
  };
}

/**
 * Sync stricte d'un slot déjà sur la grille (bouton « Modifier ») :
 * - table du source toujours là → champs fusionnés par nom (ids + x,y conservés) ;
 * - table nouvelle → ajoutée à droite ; table disparue → retirée + liens purgés ;
 * - liens hors slot intacts ; liens internes remplacés par le source (cartes
 *   manuelles conservées quand le lien existe encore) ; FK croisées re-détectées.
 */
export function syncSlotTables(base: DBModel, parsed: DBModel, slotId: string): SyncResult {
  const existing = base.tables.filter((t) => t.slotId === slotId);
  const others = base.tables.filter((t) => t.slotId !== slotId);
  const existingByName = new Map(existing.map((t) => [t.name, t]));
  const parsedByName = new Map<string, (typeof parsed.tables)[number]>();
  for (const t of parsed.tables) if (!parsedByName.has(t.name)) parsedByName.set(t.name, t);

  const maxX = base.tables.length ? Math.max(...base.tables.map((t) => t.x + CARD_W)) : 0;
  const dx = Math.max(0, maxX + 120 - 60);
  const nextSlotTables: DBTable[] = [];
  const ids: string[] = [];
  let added = 0;
  let updated = 0;
  for (const pt of parsedByName.values()) {
    const ex = existingByName.get(pt.name);
    if (ex) {
      const exByName = new Map(ex.fields.map((f) => [f.name, f]));
      const parsedFk = new Map(pt.fields.map((f) => [f.name, !!f.fk]));
      const fields: DBTable["fields"] = pt.fields.map((pf) => {
        const ef = exByName.get(pf.name);
        if (ef) return { ...ef, type: pf.type, pk: pf.pk, unique: pf.unique, nullable: pf.nullable, fk: pf.fk || ef.fk };
        return { ...pf, id: uid("f") };
      });
      nextSlotTables.push({ ...ex, fields, slotId });
      ids.push(ex.id);
      updated++;
      void parsedFk;
    } else {
      const nt: DBTable = {
        ...pt,
        id: uid("t"),
        slotId,
        x: pt.x + dx,
        fields: pt.fields.map((f) => ({ ...f, id: uid("f") })),
      };
      nextSlotTables.push(nt);
      ids.push(nt.id);
      added++;
    }
  }
  const removed = existing.filter((t) => !parsedByName.has(t.name)).length;

  // --- relations ---
  const oldSlotNames = new Set(existing.map((t) => t.name));
  const newSlotNames = new Set(nextSlotTables.map((t) => t.name));
  const resultTables = [...others, ...nextSlotTables];
  const fieldsOf = new Map(resultTables.map((t) => [t.name, new Set(t.fields.map((f) => f.name))]));
  const endpointOK = (r: Pick<DBRelation, "fromTable" | "fromField" | "toTable" | "toField">) =>
    fieldsOf.has(r.fromTable) &&
    fieldsOf.has(r.toTable) &&
    fieldsOf.get(r.fromTable)!.has(r.fromField) &&
    fieldsOf.get(r.toTable)!.has(r.toField);
  const parsedKeys = new Set(
    parsed.relations.map((r) => `${r.fromTable}.${r.fromField}→${r.toTable}.${r.toField}`)
  );
  const kept: DBRelation[] = [];
  for (const r of base.relations) {
    const touchesSlot = oldSlotNames.has(r.fromTable) || oldSlotNames.has(r.toTable);
    if (!touchesSlot) {
      if (endpointOK(r)) kept.push(r);
      continue;
    }
    if (!endpointOK(r)) continue;
    const internal = newSlotNames.has(r.fromTable) && newSlotNames.has(r.toTable);
    // Interne au slot : on ne garde que ce que le source contient encore
    // (le manuel cross-slot vers l'extérieur est conservé s'il reste valide).
    if (internal && !parsedKeys.has(`${r.fromTable}.${r.fromField}→${r.toTable}.${r.toField}`)) continue;
    kept.push(r);
  }
  const keptKeys = new Set(kept.map((r) => `${r.fromTable}.${r.fromField}→${r.toTable}.${r.toField}`));
  const addedParsed: DBRelation[] = [];
  for (const pr of parsed.relations) {
    const key = `${pr.fromTable}.${pr.fromField}→${pr.toTable}.${pr.toField}`;
    if (keptKeys.has(key) || !endpointOK(pr)) continue;
    // Cartes déjà inférées par les parsers ; régénère l'id.
    addedParsed.push({ ...pr, id: uid("rel") });
    keptKeys.add(key);
  }
  const cross = detectCrossRelations(nextSlotTables, others, [...kept, ...addedParsed]);
  const relations = [...kept, ...addedParsed, ...cross];

  // --- cohérence FK : source d'un lien → fk, sinon drapeau du source ---
  const parsedFkByTable = new Map(
    [...parsedByName.values()].map((t) => [t.name, new Map(t.fields.map((f) => [f.name, !!f.fk]))])
  );
  const sources = new Set(relations.map((r) => `${r.fromTable}.${r.fromField}`));
  const tables = resultTables.map((t) => {
    if (t.slotId !== slotId) {
      return {
        ...t,
        fields: t.fields.map((f) => (sources.has(`${t.name}.${f.name}`) ? { ...f, fk: true } : f)),
      };
    }
    const pfk = parsedFkByTable.get(t.name);
    return {
      ...t,
      fields: t.fields.map((f) => ({
        ...f,
        fk: sources.has(`${t.name}.${f.name}`) ? true : (pfk?.get(f.name) ?? f.fk),
      })),
    };
  });

  return {
    model: { tables, relations },
    ids,
    stats: { added, updated, removed, autoLinked: cross.length + addedParsed.filter((r) => !newSlotNames.has(r.toTable) || !newSlotNames.has(r.fromTable)).length },
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
