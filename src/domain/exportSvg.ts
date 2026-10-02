import type { DBRelation, DBTable } from "../types";
import { mcdCards } from "../types";
import { CARD_W, HEADER_H, ROW_H, cardH, edgePath, fieldY } from "./geometry";

/** Rendu SVG statique du canvas (bouton SVG / base du PNG). Pur et testable. */
export function exportSVGString(tables: DBTable[], relations: DBRelation[]): string {
  const pad = 60;
  const maxX = (tables.length ? Math.max(...tables.map((t) => t.x + CARD_W), 800) : 800) + pad;
  const maxY = (tables.length ? Math.max(...tables.map((t) => t.y + cardH(t)), 600) : 600) + pad;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${maxX}" height="${maxY}" font-family="Space Mono,monospace">`;
  s += `<rect width="100%" height="100%" fill="#E9E7E1"/>`;
  const vByName = new Map(tables.map((t) => [t.name, t]));
  for (const r of relations) {
    const a = vByName.get(r.fromTable);
    const b = vByName.get(r.toTable);
    if (!a || !b) continue;
    const x1 = a.x + CARD_W, y1 = fieldY(a, r.fromField);
    const x2 = b.x, y2 = fieldY(b, r.toField);
    const { a: cA, b: cB } = mcdCards(r);
    s += `<path d="${edgePath(x1, y1, x2, y2)}" fill="none" stroke="#111111" stroke-width="2"/>`;
    s += `<circle cx="${x1}" cy="${y1}" r="4" fill="#111111"/><circle cx="${x2}" cy="${y2}" r="4" fill="#FF2B1D"/>`;
    s += `<text x="${x1 + 9}" y="${y1 - 8}" font-size="10" font-weight="700" fill="#111111">${cA}</text>`;
    s += `<text x="${x2 - 9}" y="${y2 - 8}" font-size="10" font-weight="700" fill="#111111" text-anchor="end">${cB}</text>`;
  }
  for (const t of tables) {
    const h = cardH(t);
    s += `<g><rect x="${t.x}" y="${t.y}" width="${CARD_W}" height="${h}" fill="#FBFAF7" stroke="#111111" stroke-width="1.5"/>`;
    s += `<rect x="${t.x}" y="${t.y}" width="${CARD_W}" height="${HEADER_H}" fill="#111111"/>`;
    s += `<text x="${t.x + 12}" y="${t.y + 24}" fill="white" font-size="12" font-weight="700">${esc(t.name.toUpperCase())}</text>`;
    t.fields.forEach((f, i) => {
      const y = t.y + HEADER_H + i * ROW_H;
      s += `<text x="${t.x + 12}" y="${y + 19}" font-size="11" fill="#111111">${esc(f.name)}${f.pk ? " *" : ""}${f.fk ? " >" : ""}</text>`;
      s += `<text x="${t.x + CARD_W - 10}" y="${y + 19}" font-size="9" fill="#8A8781" text-anchor="end">${esc(f.type)}</text>`;
    });
    s += `</g>`;
  }
  return s + `</svg>`;
}
