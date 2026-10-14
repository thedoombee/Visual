// ---------- Thèmes d'image PNG/SVG (SRP : seule la palette vit ici) ----------
// Principe Ouvert/Fermé : `exportSvg.ts` garde sa signature et sa structure,
// il pioche juste ses couleurs ici via `getImageTheme(id)`.
// - "doux" (défaut) : même identité papier/encre/rouge, mais halo affiné,
//   pastilles réduites, grille discrète → moins "flashi", imprimable.
// - "contraste" : l'ancien rendu fort, pour celles et ceux qui l'aimaient.

export interface ExportImageTheme {
  id: string;
  label: string;
  paper: string;
  dots: string;
  dotsOpacity: number;
  titleBg: string;
  ink: string;
  softInk: string;
  accent: string;
  halo: string;
  haloWidth: number;
  haloOpacity: number;
  linkWidth: number;
  dotR: number;
}

const DOUX: ExportImageTheme = {
  id: "doux",
  label: "Doux (recommandé)",
  paper: "#EFECE4",
  dots: "#CFC9BB",
  dotsOpacity: 0.32,
  titleBg: "#1E1C1A",
  ink: "#23211E",
  softInk: "#5A574F",
  accent: "#D63A2A",
  halo: "#FBFAF6",
  haloWidth: 4.5,
  haloOpacity: 0.75,
  linkWidth: 2.2,
  dotR: 5.5,
};

const CONTRASTE: ExportImageTheme = {
  id: "contraste",
  label: "Contrasté (ancien)",
  paper: "#E9E7E1",
  dots: "#C9C5BB",
  dotsOpacity: 0.55,
  titleBg: "#111111",
  ink: "#111111",
  softInk: "#4A4A45",
  accent: "#FF2B1D",
  halo: "#FFFFFF",
  haloWidth: 7,
  haloOpacity: 0.9,
  linkWidth: 3,
  dotR: 7,
};

export const IMAGE_THEMES: readonly ExportImageTheme[] = [DOUX, CONTRASTE];

export const DEFAULT_IMAGE_THEME_ID = DOUX.id;

export function getImageTheme(id?: string): ExportImageTheme {
  return IMAGE_THEMES.find((t) => t.id === id) ?? DOUX;
}

export function isImageThemeId(v: unknown): v is string {
  return typeof v === "string" && IMAGE_THEMES.some((t) => t.id === v);
}
