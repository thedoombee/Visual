import type { DBTable } from "../types";

// Dimensions des cartes entités sur le canvas.
export const CARD_W = 236;
export const HEADER_H = 36;
export const ROW_H = 27;

export function cardH(t: DBTable) {
  return HEADER_H + t.fields.length * ROW_H + 8;
}

export function fieldY(t: DBTable, fieldName: string) {
  const idx = t.fields.findIndex((f) => f.name === fieldName);
  return t.y + HEADER_H + (idx < 0 ? 0 : idx * ROW_H + ROW_H / 2);
}

export function edgePath(x1: number, y1: number, x2: number, y2: number) {
  const dx = Math.max(40, Math.abs(x2 - x1) / 2);
  const ltr = x2 >= x1;
  const c1x = x1 + (ltr ? dx : -dx);
  const c2x = x2 + (ltr ? -dx : dx);
  return `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`;
}
