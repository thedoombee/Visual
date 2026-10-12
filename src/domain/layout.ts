import type { DBModel, ImportSlot, Instance } from "../types";
import { uid } from "../types";
import { CARD_W } from "./geometry";

// ---------- Stratégies de layout (principe Ouvert/Fermé) ----------
// `autoLayoutModel` reste disponible ; les nouvelles stratégies s'enregistrent
// via `registerLayout` sans modifier l'appelant (barre canvas / panneau).

export interface LayoutStrategy {
  id: string;
  label: string;
  arrange: (model: DBModel, ctx: LayoutCtx) => DBModel;
}

export interface LayoutCtx {
  slots: ImportSlot[];
  instances: Instance[];
}

const strategies = new Map<string, LayoutStrategy>();

export function registerLayout(s: LayoutStrategy): void {
  strategies.set(s.id, s);
}

export function listLayouts(): LayoutStrategy[] {
  return [...strategies.values()];
}

export function getLayout(id: string): LayoutStrategy | undefined {
  return strategies.get(id);
}

const GAP_X = CARD_W + 90;
const GAP_Y = 300;
const CLUSTER_GAP_Y = 220;

/** Degré d'une table (nb de liens) : les hubs d'abord, plus lisible. */
function degreeOf(model: DBModel, name: string): number {
  let d = 0;
  for (const r of model.relations) {
    if (r.fromTable === name || r.toTable === name) d++;
  }
  return d;
}

function gridArrange(tables: { id: string }[], cols: number, ox: number, oy: number): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>();
  tables.forEach((t, i) => {
    pos.set(t.id, { x: ox + (i % cols) * GAP_X, y: oy + Math.floor(i / cols) * GAP_Y });
  });
  return pos;
}

/**
 * Layout intelligent : regroupe par instance (puis par modèle), empile les
 * clusters verticalement avec un bandeau de séparation, trie par degré
 * décroissant dans chaque groupe. Les tables manuelles vont en premier.
 */
export function smartLayoutModel(model: DBModel, ctx: LayoutCtx): DBModel {
  if (!model.tables.length) return model;
  const slotOf = new Map(ctx.slots.map((s) => [s.id, s]));
  const instOrder = new Map(ctx.instances.map((ins, i) => [ins.id, i]));

  type Group = { key: string; tables: typeof model.tables };
  const groups = new Map<string, Group>();
  const order: string[] = [];
  const groupKeyOf = (slotId?: string): string => {
    const s = slotId ? slotOf.get(slotId) : undefined;
    if (!s?.instanceId) return slotId ? `slot:${slotId}` : "manuelles";
    return `inst:${s.instanceId}`;
  };
  // Tri global : instance (ordre panneau) > slot (nom) > degré décroissant.
  const sorted = model.tables.slice().sort((a, b) => {
    const sa = a.slotId ? slotOf.get(a.slotId) : undefined;
    const sb = b.slotId ? slotOf.get(b.slotId) : undefined;
    const ia = sa?.instanceId ? (instOrder.get(sa.instanceId) ?? 999) : 9999;
    const ib = sb?.instanceId ? (instOrder.get(sb.instanceId) ?? 999) : 9999;
    if (ia !== ib) return ia - ib;
    const na = sa?.name ?? "";
    const nb = sb?.name ?? "";
    if (na !== nb) return na.localeCompare(nb, "fr");
    return degreeOf(model, b.name) - degreeOf(model, a.name);
  });
  for (const t of sorted) {
    const k = groupKeyOf(t.slotId);
    let g = groups.get(k);
    if (!g) {
      g = { key: k, tables: [] };
      groups.set(k, g);
      order.push(k);
    }
    g.tables.push(t);
  }

  const pos = new Map<string, { x: number; y: number }>();
  let oy = 60;
  for (const k of order) {
    const g = groups.get(k)!;
    const cols = Math.max(1, Math.ceil(Math.sqrt(g.tables.length)));
    // Tables triées par degré pour mettre les hubs en haut à gauche.
    g.tables.sort((a, b) => degreeOf(model, b.name) - degreeOf(model, a.name));
    const sub = gridArrange(g.tables, cols, 60, oy);
    for (const [id, p] of sub) pos.set(id, p);
    const rows = Math.ceil(g.tables.length / cols);
    oy += rows * GAP_Y + CLUSTER_GAP_Y;
  }
  return {
    ...model,
    tables: model.tables.map((t) => {
      const p = pos.get(t.id);
      return p ? { ...t, x: p.x, y: p.y } : t;
    }),
  };
}

/** Isole une instance : la remet en grille compacte en haut à gauche. */
export function layoutInstanceOnly(
  model: DBModel,
  slots: ImportSlot[],
  instanceId: string
): { model: DBModel; ids: string[] } {
  const slotIds = new Set(slots.filter((s) => s.instanceId === instanceId).map((s) => s.id));
  const mine = model.tables.filter((t) => t.slotId && slotIds.has(t.slotId));
  if (!mine.length) return { model, ids: [] };
  mine.sort((a, b) => degreeOf(model, b.name) - degreeOf(model, a.name));
  const cols = Math.max(1, Math.ceil(Math.sqrt(mine.length)));
  const pos = gridArrange(mine, cols, 60, 60);
  void uid;
  return {
    model: {
      ...model,
      tables: model.tables.map((t) => {
        const p = pos.get(t.id);
        return p ? { ...t, x: p.x, y: p.y } : t;
      }),
    },
    ids: mine.map((t) => t.id),
  };
}

registerLayout({ id: "smart", label: "Intelligent (par instance)", arrange: (m, ctx) => smartLayoutModel(m, ctx) });
