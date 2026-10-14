import { edgePath } from "./geometry";

// ---------- Tracé des liens (SRP : ce module est le seul à savoir dessiner) ----------
// Principe Ouvert/Fermé : `edgePath` (courbes historiques) n'est PAS modifié.
// On ajoute des variantes + un répartiteur `edgePathFor`. Le canvas, le drag
// live et l'export SVG passent par le répartiteur sans toucher à l'existant.

export type EdgeStyle = "courbe" | "droite" | "angle";

export const EDGE_STYLES: readonly { id: EdgeStyle; label: string; hint: string }[] = [
  { id: "courbe", label: "Courbes", hint: "Bézier doux (rendu historique)" },
  { id: "droite", label: "Droites", hint: "Segment direct d'un champ à l'autre" },
  { id: "angle", label: "Angles", hint: "Orthogonal façon schéma (horizontal → vertical → horizontal)" },
];

export function isEdgeStyle(v: unknown): v is EdgeStyle {
  return v === "courbe" || v === "droite" || v === "angle";
}

/** Répartiteur : un seul point d'entrée pour tout nouveau style futur. */
export function edgePathFor(
  style: EdgeStyle | undefined,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): string {
  switch (style) {
    case "droite":
      return `M ${x1} ${y1} L ${x2} ${y2}`;
    case "angle": {
      // Orthogonal : on sort à l'horizontale des deux cartes, jonction au milieu.
      // Marche dans les deux sens (cible à gauche ou à droite), sans boucle.
      const mx = Math.round(((x1 + x2) / 2) * 10) / 10;
      if (mx === x1 || mx === x2) return `M ${x1} ${y1} L ${x2} ${y2}`;
      return `M ${x1} ${y1} L ${mx} ${y1} L ${mx} ${y2} L ${x2} ${y2}`;
    }
    case "courbe":
    default:
      return edgePath(x1, y1, x2, y2);
  }
}
