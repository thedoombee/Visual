import type { DBModel, ImportSlot, Instance } from "../types";
import { isEdgeStyle, type EdgeStyle } from "../domain/edges";
import { MAX_ZOOM, MIN_ZOOM } from "../domain/geometry";
import { DEFAULT_IMAGE_THEME_ID, isImageThemeId } from "../domain/exportTheme";

export const STORE_KEY = "mcd-studio-v2";
export const LEGACY_STORE_KEY = "mcd-studio-v1";
export const SLOTS_KEY = "mcd-studio-slots-v1";
export const INSTANCES_KEY = "mcd-studio-instances-v1";
export const TOUR_KEY = "mcd-studio-tour-v1";
// Vue exacte du canvas (pan + zoom) : la disposition à l'écran survit au refresh.
export const CAMERA_KEY = "mcd-studio-camera-v1";
// Préférences d'affichage (extensions : nouvelles clés, aucun impact existant).
export const EDGE_STYLE_KEY = "mcd-studio-edge-style-v1";
export const IMAGE_THEME_KEY = "mcd-studio-image-theme-v1";

// Slot stable historique du modèle de base (conservé pour compatibilité :
// les sauvegardes existantes peuvent encore taguer des tables avec cet id).
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
  // Premier lancement : canvas vide, aucun modèle imposé. L'utilisateur
  // démarre via la galerie (+ Modèles), le panneau gauche (+ Modèle) ou
  // une table vide — l'état vide du canvas le guide.
  return { tables: [], relations: [] };
}

export function loadSlots(): ImportSlot[] {
  try {
    const raw = localStorage.getItem(SLOTS_KEY);
    if (raw == null) throw new Error("empty");
    const arr = JSON.parse(raw) as ImportSlot[];
    // Un tableau vide sauvegardé = l'utilisateur a tout retiré : on le respecte.
    if (Array.isArray(arr)) return arr;
  } catch { /* ignore */ }
  // Premier lancement : aucun modèle imposé (le canvas démarre vide).
  return [];
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

export function loadInstances(): Instance[] {
  try {
    const raw = localStorage.getItem(INSTANCES_KEY);
    if (raw == null) return [];
    const arr = JSON.parse(raw) as Instance[];
    if (Array.isArray(arr)) return arr.filter((i) => i && typeof i.id === "string");
  } catch { /* ignore */ }
  return [];
}

export function saveInstances(instances: Instance[]): void {
  try {
    localStorage.setItem(INSTANCES_KEY, JSON.stringify(instances));
  } catch { /* ignore */ }
}

/** Style de trait préféré (canvas + exports) : persiste, défaut "courbe". */
export function loadEdgeStyle(): EdgeStyle {
  try {
    const raw = localStorage.getItem(EDGE_STYLE_KEY);
    if (isEdgeStyle(raw)) return raw;
  } catch { /* ignore */ }
  return "courbe";
}

export function saveEdgeStyle(style: EdgeStyle): void {
  try {
    localStorage.setItem(EDGE_STYLE_KEY, style);
  } catch { /* ignore */ }
}

/** Thème d'image PNG/SVG : persiste, défaut "doux". */
export function loadImageTheme(): string {
  try {
    const raw = localStorage.getItem(IMAGE_THEME_KEY);
    if (isImageThemeId(raw)) return raw;
  } catch { /* ignore */ }
  return DEFAULT_IMAGE_THEME_ID;
}

export function saveImageTheme(id: string): void {
  try {
    localStorage.setItem(IMAGE_THEME_KEY, id);
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

export interface PersistedCamera {
  x: number;
  y: number;
  z: number;
}

/** Vue du canvas restaurée au chargement : valeurs validées + bornées. */
export function loadCamera(): PersistedCamera | null {
  try {
    const raw = localStorage.getItem(CAMERA_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Partial<PersistedCamera>;
    if (![c.x, c.y, c.z].every((v) => typeof v === "number" && Number.isFinite(v))) return null;
    const clampPan = (v: number) => Math.min(100000, Math.max(-100000, Math.round(v)));
    return {
      x: clampPan(c.x as number),
      y: clampPan(c.y as number),
      z: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, c.z as number)),
    };
  } catch { /* ignore */ }
  return null;
}

export function saveCamera(c: { x: number; y: number; z: number }): void {
  try {
    localStorage.setItem(
      CAMERA_KEY,
      JSON.stringify({ x: Math.round(c.x), y: Math.round(c.y), z: +c.z.toFixed(3) })
    );
  } catch { /* ignore */ }
}
