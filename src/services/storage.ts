import type { DBModel, ImportSlot } from "../types";
import { parseAuto } from "../parsers";
import { EXAMPLE_SQL } from "../examples";

export const STORE_KEY = "mcd-studio-v2";
export const LEGACY_STORE_KEY = "mcd-studio-v1";
export const SLOTS_KEY = "mcd-studio-slots-v1";
export const TOUR_KEY = "mcd-studio-tour-v1";

// Slot stable du modèle de base : le même id sert au slot ET au tag des tables.
// (Avant, `loadSlots()` générait un id aléatoire à chaque chargement, jamais
// égal au `slotId` des tables → Masquer/Voir et la suppression ne touchaient
// jamais le modèle de base.)
export const DEFAULT_SLOT_ID = "slot-modele-1";

export function initialModel(): DBModel {
  try {
    const raw = localStorage.getItem(STORE_KEY) ?? localStorage.getItem(LEGACY_STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DBModel;
      if (parsed.tables?.length) {
        // Migration : les anciens modèles sauvegardés peuvent contenir des lots, ignorés.
        const clean: DBModel & { lots?: unknown } = { ...parsed };
        delete clean.lots;
        return clean;
      }
    }
  } catch { /* ignore */ }
  // Premier lancement : les tables du modèle de base appartiennent au slot
  // par défaut, sinon Masquer/Voir ne peut jamais les cacher.
  const base = parseAuto(EXAMPLE_SQL).model;
  return {
    tables: base.tables.map((t) => ({ ...t, slotId: DEFAULT_SLOT_ID })),
    relations: base.relations,
  };
}

export function loadSlots(): ImportSlot[] {
  try {
    const raw = localStorage.getItem(SLOTS_KEY);
    if (raw == null) throw new Error("empty");
    const arr = JSON.parse(raw) as ImportSlot[];
    // Un tableau vide sauvegardé = l'utilisateur a tout retiré : on le respecte.
    if (Array.isArray(arr)) return arr;
  } catch { /* ignore */ }
  return [{ id: DEFAULT_SLOT_ID, name: "Modèle 1", source: EXAMPLE_SQL, collapsed: false, msg: "" }];
}

export function saveModel(model: DBModel): string {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(model));
    return new Date().toLocaleTimeString();
  } catch { /* ignore */ }
  return "";
}

export function saveSlots(slots: ImportSlot[]): void {
  try {
    localStorage.setItem(SLOTS_KEY, JSON.stringify(slots));
  } catch { /* ignore */ }
}

/** Vrai s'il n'existe aucune donnée MCD et que la visite n'a jamais été vue. */
export function shouldShowTour(): boolean {
  try {
    if (localStorage.getItem(TOUR_KEY)) return false;
    const hasData =
      localStorage.getItem(STORE_KEY) ||
      localStorage.getItem(LEGACY_STORE_KEY) ||
      localStorage.getItem(SLOTS_KEY);
    return !hasData;
  } catch {
    return false;
  }
}

export function markTourSeen(): void {
  try {
    localStorage.setItem(TOUR_KEY, "done");
  } catch { /* ignore */ }
}
