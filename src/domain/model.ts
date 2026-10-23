import type { DBField, DBModel, DBRelation, DBTable, ImportSlot } from "../types";
import { uid } from "../types";
import { CARD_W, cardH } from "./geometry";
import {
  freeScopedTableName,
  instanceIdOfTable,
  freeTableNameInSlot,
  namesCanShareAcrossInstances,
} from "./naming";
import {
  normalizeRelationIds,
  relationEnds,
  relationKey,
  relationTouchesTable,
  resolveTable,
} from "./relations";

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
    relations: model.relations.filter((r) => !relationTouchesTable(r, t)),
  };
}

export function renameTableIn(model: DBModel, id: string, clean: string): DBModel {
  const old = model.tables.find((t) => t.id === id);
  if (!old) return model;
  const touches = (tableId: string | undefined, name: string) =>
    tableId ? tableId === id : name === old.name;
  return {
    tables: model.tables.map((t) => (t.id === id ? { ...t, name: clean } : t)),
    relations: model.relations.map((r) => ({
      ...r,
      fromTable: touches(r.fromTableId, r.fromTable) ? clean : r.fromTable,
      toTable: touches(r.toTableId, r.toTable) ? clean : r.toTable,
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

/** Déplace un groupe de tables d'un delta (drag de cadre) : pur, testable. */
export function moveTablesBy(model: DBModel, ids: readonly string[], dx: number, dy: number): DBModel {
  if (!ids.length || (dx === 0 && dy === 0)) return model;
  const wanted = new Set(ids);
  return {
    ...model,
    tables: model.tables.map((t) =>
      wanted.has(t.id) ? { ...t, x: Math.round(t.x + dx), y: Math.round(t.y + dy) } : t
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
  const goneIds = new Set(gone.map((t) => t.id));
  return {
    tables: model.tables.filter((t) => t.slotId !== slotId),
    relations: model.relations.filter((r) => {
      const fromGone = r.fromTableId ? goneIds.has(r.fromTableId) : gone.some((t) => t.name === r.fromTable);
      const toGone = r.toTableId ? goneIds.has(r.toTableId) : gone.some((t) => t.name === r.toTable);
      return !fromGone && !toGone;
    }),
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
  const onTable = (r: DBRelation, side: "from" | "to") => {
    const id = side === "from" ? r.fromTableId : r.toTableId;
    const name = side === "from" ? r.fromTable : r.toTable;
    return id ? id === tableId : name === t?.name;
  };
  return {
    tables: model.tables.map((x) =>
      x.id === tableId ? { ...x, fields: x.fields.filter((y) => y.id !== fieldId) } : x
    ),
    relations: f
      ? model.relations.filter(
          (r) =>
            !(onTable(r, "from") && r.fromField === f.name) &&
            !(onTable(r, "to") && r.toField === f.name)
        )
      : model.relations,
  };
}

// ---------- relations ----------

/** Champ suggéré côté source : xxx_id qui vise la cible, sinon 1er non-PK, sinon 1er. */
export function suggestFromField(src: DBTable | undefined, dst: DBTable | undefined): string {
  if (!src || !src.fields.length || !dst) return "";
  const target = dst.name.toLowerCase();
  const sing = (s: string) => (s.endsWith("s") ? s.slice(0, -1) : s);
  const hit =
    src.fields.find((f) => {
      const low = f.name.toLowerCase();
      return (
        low === `${target}_id` ||
        low === `${target}id` ||
        low === `${sing(target)}_id` ||
        low === `${sing(target)}id`
      );
    }) ??
    src.fields.find((f) => !f.pk) ??
    src.fields[0];
  return hit.name;
}

/** Champ suggéré côté cible : la PK, sinon le 1er champ. */
export function suggestToField(dst: DBTable | undefined): string {
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

/** Cartes inférées par identité : sûres quand deux instances ont des homonymes. */
export function inferCardsForTable(
  table: Pick<DBTable, "fields"> | undefined,
  fromField: string
): McdCards {
  return inferMcdCards(table?.fields.find((f) => f.name === fromField));
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
 * `allow` (optionnel) filtre les paires : sert à interdire les liens entre
 * instances différentes sans modifier la détection (Open/Closed).
 */
export function detectCrossRelations(
  incomingTables: DBTable[],
  baseTables: DBTable[],
  existingRelations: DBRelation[],
  allow?: (src: DBTable, target: DBTable) => boolean
): DBRelation[] {
  const allTables = [...baseTables, ...incomingTables];
  const allNames = allTables.map((t) => t.name);
  const seen = new Set(existingRelations.map(relationKey));
  const out: DBRelation[] = [];
  const scan = (sources: DBTable[], validTargets: DBTable[]) => {
    const targetNames = new Set(validTargets.map((t) => t.name));
    for (const src of sources) {
      for (const f of src.fields) {
        const cand = guessFkTarget(f.name, allNames);
        if (!cand || cand === src.name || !targetNames.has(cand)) continue;
        // Homonymes possibles entre instances : on choisit la cible autorisée
        // (même instance / hors instance), jamais celle d'un autre projet.
        const target = validTargets.find(
          (t) => t.name === cand && t.id !== src.id && (!allow || allow(src, t))
        );
        if (!target) continue;
        const toField = target.fields.find((x) => x.pk)?.name ?? target.fields[0]?.name;
        if (!toField) continue;
        const rel: DBRelation = {
          id: uid("rel"),
          fromTable: src.name,
          fromTableId: src.id,
          fromField: f.name,
          toTable: target.name,
          toTableId: target.id,
          toField,
          fromCard: inferMcdCards(f).fromCard,
          toCard: inferMcdCards(f).toCard,
        };
        const key = relationKey(rel);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(rel);
      }
    }
  };
  scan(incomingTables, baseTables);
  scan(baseTables, incomingTables);
  return out;
}

export function isDuplicateRelation(
  relations: DBRelation[],
  fromTable: string,
  fromField: string,
  toTable: string,
  toField: string,
  fromTableId?: string,
  toTableId?: string
): boolean {
  return relations.some((r) => {
    const sameFrom = fromTableId && r.fromTableId
      ? r.fromTableId === fromTableId
      : r.fromTable === fromTable;
    const sameTo = toTableId && r.toTableId
      ? r.toTableId === toTableId
      : r.toTable === toTable;
    return sameFrom && sameTo && r.fromField === fromField && r.toField === toField;
  });
}

/** Ajoute le lien (IDs d'extrémités remplis) et marque le champ source FK. */
export function addRelationTo(model: DBModel, rel: DBRelation): DBModel {
  const src = resolveTable(model, rel.fromTable, rel.fromTableId);
  const dst = resolveTable(model, rel.toTable, rel.toTableId);
  const linked: DBRelation = {
    ...rel,
    fromTable: src?.name ?? rel.fromTable,
    toTable: dst?.name ?? rel.toTable,
    fromTableId: src?.id ?? rel.fromTableId,
    toTableId: dst?.id ?? rel.toTableId,
  };
  return {
    ...model,
    tables: model.tables.map((t) =>
      (linked.fromTableId ? t.id === linked.fromTableId : t.name === linked.fromTable)
        ? {
            ...t,
            fields: t.fields.map((f) =>
              f.name === linked.fromField ? { ...f, fk: true } : f
            ),
          }
        : t
    ),
    relations: [...model.relations, linked],
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
export function mergeModel(
  base: DBModel,
  parsed: DBModel,
  slotId?: string,
  allowCrossLink?: (src: DBTable, target: DBTable) => boolean,
  slots: ImportSlot[] = []
): MergeResult {
  const rename = new Map<string, string>();
  const taken = [...base.tables];
  const incomingTables: DBTable[] = [];
  for (const pt of parsed.tables) {
    const finalName = freeTableNameInSlot(taken, slots, slotId, pt.name);
    const t: DBTable = {
      ...pt,
      id: uid("t"),
      name: finalName,
      slotId,
      fields: pt.fields.map((f) => ({ ...f, id: uid("f") })),
    };
    rename.set(pt.name, finalName);
    incomingTables.push(t);
    taken.push(t);
  }
  const incomingByName = new Map(incomingTables.map((t) => [t.name, t]));
  const incomingRelations: DBRelation[] = parsed.relations.map((r) => {
    const fromName = rename.get(r.fromTable) ?? r.fromTable;
    const toName = rename.get(r.toTable) ?? r.toTable;
    const from = incomingByName.get(fromName);
    const to = incomingByName.get(toName);
    return {
      ...r,
      id: uid("rel"),
      fromTable: fromName,
      fromTableId: from?.id,
      toTable: toName,
      toTableId: to?.id,
    };
  });
  const maxX = base.tables.length ? Math.max(...base.tables.map((t) => t.x + CARD_W)) : 0;
  const dx = Math.max(0, maxX + 120 - 60);
  for (const t of incomingTables) t.x += dx;
  // FK croisées : xxx_id du nouveau modèle → anciennes tables et inversement.
  const cross = detectCrossRelations(
    incomingTables,
    base.tables,
    [...base.relations, ...incomingRelations],
    allowCrossLink
  );
  // Marque les champs sources comme FK (copies, sans muter `base`).
  const baseCopy: DBTable[] = base.tables.map((t) => ({
    ...t,
    fields: t.fields.map((f) => ({ ...f })),
  }));
  const allTables = [...baseCopy, ...incomingTables];
  const byId = new Map(allTables.map((t) => [t.id, t]));
  for (const r of cross) {
    const src = r.fromTableId ? byId.get(r.fromTableId) : allTables.find((t) => t.name === r.fromTable);
    const f = src?.fields.find((x) => x.name === r.fromField);
    if (f) f.fk = true;
  }
  return {
    model: normalizeRelationIds({
      tables: allTables,
      relations: [...base.relations, ...incomingRelations, ...cross],
    }),
    ids: incomingTables.map((t) => t.id),
    autoLinked: cross.length,
  };
}

/**
 * Positionne les tables fraîchement ajoutées par une sync JUSTE À CÔTÉ des
 * tables existantes du modèle (même zone sur la grille), empilées à droite
 * sans chevauchement. Les positions existantes ne sont jamais touchées : une
 * sync ne doit pas étendre le modèle sur tout le canvas.
 */
function placeFreshTables(existing: DBTable[], fresh: DBTable[]): DBTable[] {
  if (!fresh.length) return fresh;
  const anchorX = existing.length
    ? Math.max(...existing.map((t) => t.x + CARD_W)) + 80
    : 60;
  const anchorY = existing.length ? Math.min(...existing.map((t) => t.y)) : 60;
  // Bloc quasi carré : colonne de `rows` cartes, puis colonne suivante.
  const rows = Math.max(1, Math.ceil(Math.sqrt(fresh.length)));
  const colY: number[] = [];
  const out: DBTable[] = [];
  fresh.forEach((t, i) => {
    const col = Math.floor(i / rows);
    const y = colY[col] ?? anchorY;
    out.push({ ...t, x: anchorX + col * (CARD_W + 60), y });
    colY[col] = y + cardH(t) + 40;
  });
  return out;
}

/**
 * Sync stricte d'un slot déjà sur la grille (bouton « Modifier ») :
 * - table du source toujours là → champs fusionnés par nom (ids + x,y conservés) ;
 * - table nouvelle → posée à côté des tables du modèle (sa zone ne s'étend
 *   pas sur tout le canvas) ; table disparue → retirée + liens purgés ;
 * - liens hors slot intacts ; liens internes remplacés par le source (cartes
 *   manuelles conservées quand le lien existe encore) ; FK croisées re-détectées
 *   (sauf entre instances différentes, voir `allowCrossLink`).
 */
export function syncSlotTables(
  base: DBModel,
  parsed: DBModel,
  slotId: string,
  allowCrossLink?: (src: DBTable, target: DBTable) => boolean,
  slots: ImportSlot[] = []
): SyncResult {
  base = normalizeRelationIds(base);
  const existing = base.tables.filter((t) => t.slotId === slotId);
  const others = base.tables.filter((t) => t.slotId !== slotId);
  const existingByName = new Map(existing.map((t) => [t.name, t]));
  const parsedByName = new Map<string, (typeof parsed.tables)[number]>();
  for (const t of parsed.tables) if (!parsedByName.has(t.name)) parsedByName.set(t.name, t);

  const nextSlotTables: DBTable[] = [];
  const fresh: DBTable[] = [];
  const ids: string[] = [];
  const parsedToSlot = new Map<string, DBTable>();
  const parsedFkById = new Map<string, Map<string, boolean>>();
  const namePool = [...others];
  let updated = 0;
  for (const pt of parsedByName.values()) {
    const ex = existingByName.get(pt.name);
    if (ex) {
      const exByName = new Map(ex.fields.map((f) => [f.name, f]));
      const fields: DBTable["fields"] = pt.fields.map((pf) => {
        const ef = exByName.get(pf.name);
        if (ef) return { ...ef, type: pf.type, pk: pf.pk, unique: pf.unique, nullable: pf.nullable, fk: pf.fk || ef.fk };
        return { ...pf, id: uid("f") };
      });
      const nt: DBTable = { ...ex, fields, slotId };
      nextSlotTables.push(nt);
      namePool.push(nt);
      parsedToSlot.set(pt.name, nt);
      parsedFkById.set(nt.id, new Map(pt.fields.map((f) => [f.name, !!f.fk])));
      ids.push(ex.id);
      updated++;
    } else {
      const nt: DBTable = {
        ...pt,
        id: uid("t"),
        name: freeTableNameInSlot(namePool, slots, slotId, pt.name),
        slotId,
        fields: pt.fields.map((f) => ({ ...f, id: uid("f") })),
      };
      fresh.push(nt);
      namePool.push(nt);
      parsedToSlot.set(pt.name, nt);
      parsedFkById.set(nt.id, new Map(pt.fields.map((f) => [f.name, !!f.fk])));
      ids.push(nt.id);
    }
  }
  const placedFresh = placeFreshTables(existing, fresh);
  nextSlotTables.push(...placedFresh);
  const added = placedFresh.length;
  const removed = existing.filter((t) => !parsedByName.has(t.name)).length;

  // --- relations ---
  const oldSlotIds = new Set(existing.map((t) => t.id));
  const newSlotIds = new Set(nextSlotTables.map((t) => t.id));
  const resultTables = [...others, ...nextSlotTables];
  const byId = new Map(resultTables.map((t) => [t.id, t]));
  const endpointOf = (r: DBRelation, side: "from" | "to"): DBTable | undefined => {
    const id = side === "from" ? r.fromTableId : r.toTableId;
    const name = side === "from" ? r.fromTable : r.toTable;
    if (id && byId.has(id)) return byId.get(id);
    return resultTables.find((t) => t.name === name);
  };
  const endpointOK = (r: DBRelation) => {
    const from = endpointOf(r, "from");
    const to = endpointOf(r, "to");
    return !!from && !!to &&
      from.fields.some((f) => f.name === r.fromField) &&
      to.fields.some((f) => f.name === r.toField);
  };
  const parsedRelations: DBRelation[] = [];
  for (const pr of parsed.relations) {
    const from = parsedToSlot.get(pr.fromTable);
    const to = parsedToSlot.get(pr.toTable);
    if (!from || !to) continue;
    parsedRelations.push({
      ...pr,
      id: uid("rel"),
      fromTable: from.name,
      fromTableId: from.id,
      toTable: to.name,
      toTableId: to.id,
    });
  }
  const parsedKeys = new Set(parsedRelations.map(relationKey));
  const touchesOldSlot = (r: DBRelation) => {
    const from = endpointOf(r, "from");
    const to = endpointOf(r, "to");
    return (from && oldSlotIds.has(from.id)) || (to && oldSlotIds.has(to.id));
  };
  const internalToSlot = (r: DBRelation) => {
    const from = endpointOf(r, "from");
    const to = endpointOf(r, "to");
    return !!from && !!to && newSlotIds.has(from.id) && newSlotIds.has(to.id);
  };
  const kept: DBRelation[] = [];
  for (const r of base.relations) {
    if (!endpointOK(r)) continue;
    if (!touchesOldSlot(r)) {
      kept.push(r);
      continue;
    }
    // Interne au slot : on ne garde que ce que le source contient encore
    // (le manuel cross-slot vers l'extérieur est conservé s'il reste valide).
    if (internalToSlot(r) && !parsedKeys.has(relationKey(r))) continue;
    kept.push(r);
  }
  const keptKeys = new Set(kept.map(relationKey));
  const addedParsed: DBRelation[] = [];
  for (const pr of parsedRelations) {
    const key = relationKey(pr);
    if (keptKeys.has(key) || !endpointOK(pr)) continue;
    addedParsed.push(pr);
    keptKeys.add(key);
  }
  const cross = detectCrossRelations(nextSlotTables, others, [...kept, ...addedParsed], allowCrossLink);
  const relations = [...kept, ...addedParsed, ...cross];

  // --- cohérence FK : source d'un lien → fk, sinon drapeau du source ---
  const sources = new Set(
    relations.map((r) => `${r.fromTableId ?? r.fromTable}.${r.fromField}`)
  );
  const tables = resultTables.map((t) => {
    if (t.slotId !== slotId) {
      return {
        ...t,
        fields: t.fields.map((f) => (sources.has(`${t.id}.${f.name}`) ? { ...f, fk: true } : f)),
      };
    }
    const pfk = parsedFkById.get(t.id);
    return {
      ...t,
      fields: t.fields.map((f) => ({
        ...f,
        fk: sources.has(`${t.id}.${f.name}`) ? true : (pfk?.get(f.name) ?? f.fk),
      })),
    };
  });

  return {
    model: normalizeRelationIds({ tables, relations }),
    ids,
    stats: {
      added,
      updated,
      removed,
      autoLinked: cross.length + addedParsed.filter((r) => !internalToSlot(r)).length,
    },
  };
}

/**
 * Après un rangement de slot dans une instance, les homonymes qui peuvent
 * désormais communiquer (même instance, ou table hors instance) doivent
 * redevenir uniques. Les homonymes d'une AUTRE instance restent intacts :
 * aucun suffixe artificiel entre projets étanches.
 */
export function reconcileSlotTableNames(
  model: DBModel,
  slots: ImportSlot[],
  slotId: string
): { model: DBModel; renamed: number } {
  const mine = model.tables.filter((t) => t.slotId === slotId);
  if (!mine.length) return { model, renamed: 0 };
  const instanceId = instanceIdOfTable(slots, mine[0]);
  const canShare = (t: DBTable) =>
    namesCanShareAcrossInstances(instanceId, instanceIdOfTable(slots, t));
  const taken: DBTable[] = model.tables.filter((t) => t.slotId !== slotId);
  const rename = new Map<string, string>();
  for (const t of mine) {
    const name = freeScopedTableName(taken, t.name, canShare);
    if (name !== t.name) rename.set(t.id, name);
    taken.push({ ...t, name });
  }
  if (!rename.size) return { model, renamed: 0 };
  return {
    model: {
      tables: model.tables.map((t) =>
        rename.has(t.id) ? { ...t, name: rename.get(t.id)! } : t
      ),
      relations: model.relations.map((r) => ({
        ...r,
        fromTable: r.fromTableId && rename.has(r.fromTableId)
          ? rename.get(r.fromTableId)!
          : r.fromTable,
        toTable: r.toTableId && rename.has(r.toTableId)
          ? rename.get(r.toTableId)!
          : r.toTable,
      })),
    },
    renamed: rename.size,
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

/** Liens visibles : extrémités résolues par ID (noms homonymes possibles). */
export function visibleRelationsOf(model: DBModel, visibleTables: DBTable[]): DBRelation[] {
  const visibleIds = new Set(visibleTables.map((t) => t.id));
  return model.relations.filter((r) => {
    const { from, to } = relationEnds(model, r);
    return !!from && !!to && visibleIds.has(from.id) && visibleIds.has(to.id);
  });
}

/** Compteur de tables par slot (badge du panneau gauche). */
export function slotTableCounts(model: DBModel): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of model.tables) if (t.slotId) m.set(t.slotId, (m.get(t.slotId) ?? 0) + 1);
  return m;
}

// ---------- validation ----------

export interface ValidateOptions {
  /** Deux tables homonymes de deux instances étanches sont légitimes. */
  allowDuplicateNames?: (a: DBTable, b: DBTable) => boolean;
}

export function validateModel(model: DBModel, opts?: ValidateOptions): ModelIssue[] {
  const out: ModelIssue[] = [];
  const groups = new Map<string, DBTable[]>();
  for (const t of model.tables) {
    const list = groups.get(t.name);
    if (list) list.push(t);
    else groups.set(t.name, [t]);
  }
  for (const [name, group] of groups) {
    if (group.length < 2) continue;
    let conflict = false;
    for (let i = 0; i < group.length && !conflict; i++) {
      for (let j = i + 1; j < group.length && !conflict; j++) {
        if (!opts?.allowDuplicateNames?.(group[i], group[j])) conflict = true;
      }
    }
    if (conflict)
      out.push({
        level: "err",
        text: `Nom en double : « ${name} » — renomme une des deux tables (les liens s'y perdent).`,
      });
  }
  for (const t of model.tables) {
    if (!t.fields.some((f) => f.pk)) out.push({ level: "warn", text: `${t.name} : sans PRIMARY KEY` });
    const linked = model.relations.some((r) => relationTouchesTable(r, t));
    if (!linked && model.tables.length > 1)
      out.push({ level: "warn", text: `${t.name} : table isolée (aucun lien)` });
  }
  for (const r of model.relations) {
    const { from, to } = relationEnds(model, r);
    if (!from || !to) {
      out.push({
        level: "err",
        text: `Lien orphelin : ${r.fromTable}.${r.fromField} → ${r.toTable}.${r.toField}`,
      });
      continue;
    }
    if (!from.fields.some((f) => f.name === r.fromField))
      out.push({ level: "err", text: `${r.fromTable}.${r.fromField} n'existe plus` });
    if (!to.fields.some((f) => f.name === r.toField))
      out.push({ level: "err", text: `${r.toTable}.${r.toField} n'existe plus` });
  }
  return out;
}
