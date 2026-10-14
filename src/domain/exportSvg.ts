import type { DBRelation, DBTable } from "../types";
import { mcdCards } from "../types";
import { CARD_W, HEADER_H, ROW_H, cardH, fieldY } from "./geometry";
import { edgePathFor, type EdgeStyle } from "./edges";
import { getImageTheme } from "./exportTheme";

/**
 * Rendu SVG statique haute lisibilité (bouton SVG / base du PNG).
 * - Lignes de séparation entre chaque champ + zébrage léger.
 * - Pastilles PK (noir) / FK (rouge) + type mono bien contrasté.
 * - Liens épais avec halo blanc, pastilles larges, cardinalités sur fond.
 * - Titre + date + légende intégrés (présentable tel quel).
 * Pur et testable.
 *
 * Extensions (rétro-compatibles, tout est optionnel) :
 * - `theme` : "doux" (défaut adouci) ou "contraste" (ancien rendu fort).
 * - `edgeStyle` : "courbe" (défaut historique) | "droite" | "angle".
 */
export function exportSVGString(
  tables: DBTable[],
  relations: DBRelation[],
  opts?: { title?: string; theme?: string; edgeStyle?: EdgeStyle }
): string {
  const th = getImageTheme(opts?.theme);
  const style: EdgeStyle = opts?.edgeStyle ?? "courbe";
  const pad = 80;
  const titleH = 84;
  const legendH = 44;
  const maxX = (tables.length ? Math.max(...tables.map((t) => t.x + CARD_W), 900) : 900) + pad;
  const maxY =
    (tables.length ? Math.max(...tables.map((t) => t.y + cardH(t)), 600) : 600) + pad + titleH + legendH;
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const title = opts?.title ?? "MCD — Schéma de base de données";
  const date = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });

  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${maxX}" height="${maxY}" font-family="'Space Mono',ui-monospace,monospace">`;
  s += `<rect width="100%" height="100%" fill="${th.paper}"/>`;
  // Grille de fond discrète.
  s += `<defs><pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="1.2" fill="${th.dots}"/></pattern></defs>`;
  s += `<rect width="100%" height="100%" fill="url(#dots)" opacity="${th.dotsOpacity}"/>`;
  // Bandeau titre.
  s += `<g><rect x="0" y="0" width="${maxX}" height="${titleH}" fill="${th.titleBg}"/>`;
  s += `<text x="40" y="38" fill="#FFFFFF" font-size="22" font-weight="700" letter-spacing="1">${esc(title.toUpperCase())}</text>`;
  s += `<text x="40" y="62" fill="#CFcabD" font-size="12">${tables.length} table(s) · ${relations.length} lien(s) · ${esc(date)} · MCD+STUDIO</text>`;
  s += `<rect x="${maxX - 120}" y="22" width="80" height="40" fill="${th.accent}"/><text x="${maxX - 80}" y="48" fill="#fff" font-size="20" font-weight="700" text-anchor="middle">+</text></g>`;

  const oy = titleH;
  const vByName = new Map(tables.map((t) => [t.name, t]));
  // Liens : halo + trait + pastilles (dimensions selon le thème).
  for (const r of relations) {
    const a = vByName.get(r.fromTable);
    const b = vByName.get(r.toTable);
    if (!a || !b) continue;
    const x1 = a.x + CARD_W;
    const y1 = oy + fieldY(a, r.fromField);
    const y2 = oy + fieldY(b, r.toField);
    const x2 = b.x;
    const d = edgePathFor(style, x1, y1, x2, y2);
    const { a: cA, b: cB } = mcdCards(r);
    const dot = th.dotR;
    const inner = Math.max(2, Math.round(dot * 0.35 * 10) / 10);
    s += `<path d="${d}" fill="none" stroke="${th.halo}" stroke-width="${th.haloWidth}" stroke-linecap="round" opacity="${th.haloOpacity}"/>`;
    s += `<path d="${d}" fill="none" stroke="${th.ink}" stroke-width="${th.linkWidth}"/>`;
    s += `<circle cx="${x1}" cy="${y1}" r="${dot}" fill="${th.ink}" stroke="${th.halo}" stroke-width="2"/><circle cx="${x1}" cy="${y1}" r="${inner}" fill="${th.halo}"/>`;
    s += `<circle cx="${x2}" cy="${y2}" r="${dot}" fill="${th.accent}" stroke="${th.halo}" stroke-width="2"/><circle cx="${x2}" cy="${y2}" r="${inner}" fill="${th.halo}"/>`;
    // Cardinalités sur pastille fond encre pour rester lisibles.
    const wA = 8 + cA.length * 7;
    const wB = 8 + cB.length * 7;
    s += `<rect x="${x1 + 12}" y="${y1 - 26}" width="${wA}" height="18" fill="${th.ink}"/><text x="${x1 + 12 + wA / 2}" y="${y1 - 12.5}" font-size="11" font-weight="700" fill="#FFFFFF" text-anchor="middle">${esc(cA)}</text>`;
    s += `<rect x="${x2 - 12 - wB}" y="${y2 - 26}" width="${wB}" height="18" fill="${th.ink}"/><text x="${x2 - 12 - wB / 2}" y="${y2 - 12.5}" font-size="11" font-weight="700" fill="#FFFFFF" text-anchor="middle">${esc(cB)}</text>`;
  }
  // Tables : en-tête + lignes séparées + zébrage + badges PK/FK.
  for (const t of tables) {
    const h = cardH(t);
    const ty = oy + t.y;
    s += `<g>`;
    s += `<rect x="${t.x + 4}" y="${ty + 5}" width="${CARD_W}" height="${h}" fill="${th.ink}" opacity="0.10"/>`;
    s += `<rect x="${t.x}" y="${ty}" width="${CARD_W}" height="${h}" fill="#FBFAF7" stroke="${th.ink}" stroke-width="2"/>`;
    s += `<rect x="${t.x}" y="${ty}" width="${CARD_W}" height="${HEADER_H}" fill="${th.ink}"/>`;
    s += `<text x="${t.x + 12}" y="${ty + 23}" fill="#FFFFFF" font-size="12.5" font-weight="700">${esc(t.name.toUpperCase())}</text>`;
    s += `<rect x="${t.x + CARD_W - 34}" y="${ty + 9}" width="24" height="18" fill="none" stroke="#FFFFFF" stroke-width="1.2"/><text x="${t.x + CARD_W - 22}" y="${ty + 22.5}" fill="#FFFFFF" font-size="10" font-weight="700" text-anchor="middle">${t.fields.length}</text>`;
    t.fields.forEach((f, i) => {
      const y = ty + HEADER_H + i * ROW_H;
      if (i % 2 === 1) s += `<rect x="${t.x + 1.5}" y="${y}" width="${CARD_W - 3}" height="${ROW_H}" fill="${th.ink}" opacity="0.045"/>`;
      // Ligne de séparation bien visible entre les champs.
      s += `<line x1="${t.x}" y1="${y + ROW_H}" x2="${t.x + CARD_W}" y2="${y + ROW_H}" stroke="${th.ink}" stroke-width="${i === t.fields.length - 1 ? 0 : 0.8}" opacity="0.30"/>`;
      const marker = f.pk ? "● " : f.fk ? "→ " : "";
      const color = f.pk ? th.accent : th.ink;
      s += `<text x="${t.x + 12}" y="${y + 18}" font-size="11.5" font-weight="${f.pk || f.fk ? 700 : 400}" fill="${color}">${esc(marker)}${esc(f.name)}</text>`;
      s += `<text x="${t.x + CARD_W - 44}" y="${y + 18}" font-size="9" fill="${th.softInk}" text-anchor="end">${esc(f.type)}</text>`;
      if (f.pk) s += `<rect x="${t.x + CARD_W - 38}" y="${y + 5}" width="28" height="16" fill="${th.ink}"/><text x="${t.x + CARD_W - 24}" y="${y + 17}" font-size="8.5" font-weight="700" fill="#fff" text-anchor="middle">PK</text>`;
      else if (f.fk) s += `<rect x="${t.x + CARD_W - 38}" y="${y + 5}" width="28" height="16" fill="${th.accent}"/><text x="${t.x + CARD_W - 24}" y="${y + 17}" font-size="8.5" font-weight="700" fill="#fff" text-anchor="middle">FK</text>`;
      else if (f.unique) s += `<rect x="${t.x + CARD_W - 38}" y="${y + 5}" width="28" height="16" fill="none" stroke="${th.ink}" stroke-width="1" stroke-dasharray="2 2"/><text x="${t.x + CARD_W - 24}" y="${y + 17}" font-size="8.5" font-weight="700" fill="${th.ink}" text-anchor="middle">UQ</text>`;
    });
    s += `</g>`;
  }
  // Légende bas de page.
  const ly = maxY - legendH + 14;
  s += `<g font-size="11" fill="${th.ink}"><circle cx="40" cy="${ly}" r="5" fill="${th.ink}" stroke="${th.halo}" stroke-width="2"/><text x="54" y="${ly + 4}">source (FK)</text><circle cx="190" cy="${ly}" r="5" fill="${th.accent}" stroke="${th.halo}" stroke-width="2"/><text x="204" y="${ly + 4}">cible (PK)</text><text x="330" y="${ly + 4}" font-weight="700">● PK</text><text x="390" y="${ly + 4}" font-weight="700" fill="${th.accent}">→ FK</text><text x="${maxX - 40}" y="${ly + 4}" text-anchor="end" fill="${th.softInk}">MCD+STUDIO · lisible, imprimable</text></g>`;
  return s + `</svg>`;
}
