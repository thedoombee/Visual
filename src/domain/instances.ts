import type { DBModel, DBRelation, DBTable, ImportSlot, Instance } from "../types";
import { uid } from "../types";

// ---------- pur, React-free, testable ----------
// Les instances regroupent des slots (modèles). Tout passe par ces fonctions
// pour que `App.tsx` reste de la simple orchestration (principe Open/Closed :
// on étend ici sans toucher au reste).

export const INSTANCE_COLORS = [
  "#FF2B1D",
  "#111111",
  "#0E7C4B",
  "#1D4ED8",
  "#9333EA",
  "#B45309",
  "#0E7490",
  "#BE123C",
] as const;

export function createInstance(names: string[], colorSeed = 0): Instance {
  const n = names.length + 1;
  return {
    id: uid("inst"),
    name: `Projet ${n}`,
    collapsed: false,
    color: INSTANCE_COLORS[colorSeed % INSTANCE_COLORS.length],
  };
}

// Nom stocké tel que tapé (comme les modèles) : un nom vide reste autorisé,
// sinon impossible d'effacer la dernière lettre avant de retaper le nouveau nom.
export function renameInstance(instances: Instance[], id: string, name: string): Instance[] {
  return instances.map((i) => (i.id === id ? { ...i, name: name.slice(0, 40) } : i));
}

export function toggleInstanceHidden(instances: Instance[], id: string): Instance[] {
  return instances.map((i) => (i.id === id ? { ...i, hidden: !i.hidden } : i));
}

export function toggleInstanceCollapsed(instances: Instance[], id: string): Instance[] {
  return instances.map((i) => (i.id === id ? { ...i, collapsed: !i.collapsed } : i));
}

export function assignSlotToInstance(slots: ImportSlot[], slotId: string, instanceId?: string): ImportSlot[] {
  return slots.map((s) => (s.id === slotId ? { ...s, instanceId } : s));
}

/** Slots d'une instance (triés par nom pour un affichage stable). */
export function slotsOfInstance(slots: ImportSlot[], instanceId: string): ImportSlot[] {
  return slots
    .filter((s) => s.instanceId === instanceId)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export function unassignedSlots(slots: ImportSlot[]): ImportSlot[] {
  return slots.filter((s) => !s.instanceId);
}

/** Tables rattachées à une instance (via leurs slots). */
export function tablesOfInstance(model: DBModel, slots: ImportSlot[], instanceId: string): DBTable[] {
  const slotIds = new Set(slots.filter((s) => s.instanceId === instanceId).map((s) => s.id));
  return model.tables.filter((t) => t.slotId && slotIds.has(t.slotId));
}

/** Tables rattachées à un slot (= un modèle). */
export function tablesOfSlot(model: DBModel, slotId: string): DBTable[] {
  return model.tables.filter((t) => t.slotId === slotId);
}

// ---------- étanchéité entre instances ----------
// Deux projets ne communiquent JAMAIS : aucun lien (manuel ou auto) entre une
// table de l'instance A et une table de l'instance B. Une table hors instance
// (manuelle ou « Sans instance ») reste libre de tout lien. Règles pures,
// posées ici une fois pour toutes (Open/Closed : les appelants s'y conforment).

/** Instance d'un slot. `undefined` = modèle hors instance (ou slot inconnu). */
export function instanceOfSlot(slots: ImportSlot[], slotId?: string): string | undefined {
  if (!slotId) return undefined;
  return slots.find((s) => s.id === slotId)?.instanceId;
}

/** Communication autorisée entre deux tables : refusée seulement quand chacune
 *  appartient à une instance DIFFÉRENTE. */
export function tablesCanCommunicate(
  slots: ImportSlot[],
  a: Pick<DBTable, "slotId">,
  b: Pick<DBTable, "slotId">
): boolean {
  const ia = instanceOfSlot(slots, a.slotId);
  const ib = instanceOfSlot(slots, b.slotId);
  return !ia || !ib || ia === ib;
}

/** Liens existants qui traversent deux instances différentes (état hérité d'un
 *  rangement a posteriori) : jamais créés par l'app, signalés au diagnostic. */
export function crossInstanceRelations(
  model: DBModel,
  slots: ImportSlot[],
  instances: Instance[]
): Array<{ relation: DBRelation; fromInstance: Instance; toInstance: Instance }> {
  const instOfTable = (name: string): Instance | undefined => {
    const t = model.tables.find((x) => x.name === name);
    const iid = instanceOfSlot(slots, t?.slotId);
    return iid ? instances.find((i) => i.id === iid) : undefined;
  };
  const out: Array<{ relation: DBRelation; fromInstance: Instance; toInstance: Instance }> = [];
  for (const r of model.relations) {
    const a = instOfTable(r.fromTable);
    const b = instOfTable(r.toTable);
    if (a && b && a.id !== b.id) out.push({ relation: r, fromInstance: a, toInstance: b });
  }
  return out;
}

/** Sous-modèle d'un slot : ses tables + les liens internes au slot. */
export function subModelForSlot(model: DBModel, slotId: string): DBModel {
  const tables = tablesOfSlot(model, slotId);
  const names = new Set(tables.map((t) => t.name));
  const relations = model.relations.filter((r) => names.has(r.fromTable) && names.has(r.toTable));
  return { tables, relations };
}

/** Sous-modèle d'une instance : ses tables + liens internes à l'instance. */
export function subModelForInstance(model: DBModel, slots: ImportSlot[], instanceId: string): DBModel {
  const tables = tablesOfInstance(model, slots, instanceId);
  const names = new Set(tables.map((t) => t.name));
  const relations = model.relations.filter((r) => names.has(r.fromTable) && names.has(r.toTable));
  return { tables, relations };
}

/**
 * Visibilité effective : une table est cachée si son slot est masqué OU si
 * son instance parente est masquée. Les tables manuelles (sans slotId)
 * restent toujours visibles.
 */
export function effectiveHiddenSlotIds(
  slots: ImportSlot[],
  instances: Instance[]
): Set<string> {
  const hiddenInstances = new Set(instances.filter((i) => i.hidden).map((i) => i.id));
  const out = new Set<string>();
  for (const s of slots) {
    if (s.hidden || (s.instanceId && hiddenInstances.has(s.instanceId))) out.add(s.id);
  }
  return out;
}

/**
 * État d'affichage d'UN modèle pour le panneau gauche (SRP : la règle vit ici,
 * le composant ne fait que l'afficher). Le flag propre `hidden` n'est JAMAIS
 * écrasé par l'instance : masquer un projet cache ses modèles tout en gardant
 * leur état individuel (comme des calques groupés). Le ré-affichage du projet
 * restaure donc exactement l'état d'avant.
 */
export function describeSlotVisibility(
  slot: ImportSlot,
  instances: Instance[]
): { ownHidden: boolean; effectiveHidden: boolean; viaInstanceName?: string } {
  const ownHidden = !!slot.hidden;
  if (!slot.instanceId) return { ownHidden, effectiveHidden: ownHidden };
  const inst = instances.find((i) => i.id === slot.instanceId);
  if (inst?.hidden) {
    return { ownHidden, effectiveHidden: true, viaInstanceName: inst.name };
  }
  return { ownHidden, effectiveHidden: ownHidden };
}

/** Supprimer une instance : les slots sont conservés mais détachés ("Sans instance"). */
export function detachInstanceSlots(slots: ImportSlot[], instanceId: string): ImportSlot[] {
  return slots.map((s) => (s.instanceId === instanceId ? { ...s, instanceId: undefined } : s));
}

/** Liens qui touchent une instance (au moins un bout dedans) — pour le compteur. */
export function relationsTouchingInstance(
  model: DBModel,
  slots: ImportSlot[],
  instanceId: string
): DBRelation[] {
  const names = new Set(tablesOfInstance(model, slots, instanceId).map((t) => t.name));
  return model.relations.filter((r) => names.has(r.fromTable) || names.has(r.toTable));
}
