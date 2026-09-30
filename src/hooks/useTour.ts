import { useCallback, useEffect, useState } from "react";
import { markTourSeen, shouldShowTour } from "../services/storage";

export interface TourStep {
  target: string | null;
  title: string;
  text: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    target: null,
    title: "Bienvenue — visite express",
    text: "3 mini-fenêtres pour prendre en main : modèles, liaison, exports. Clique Suivant, ou Passer pour explorer seul.",
  },
  {
    target: ".panel.left",
    title: "01 · Tes modèles importés",
    text: "Colle chaque schema (Prisma, Drizzle, SQL) dans son modèle. Plie/déplie au clic sur le bandeau, + Modèle pour en ajouter autant que tu veux, puis ＋ Ajouter pour l'envoyer sur la grille.",
  },
  {
    target: "#tour-link-btn",
    title: "02 · Relie sur la grille",
    text: "Clique ce bouton ⇄ Relier, puis l'entité source et l'entité cible directement sur le canvas. Champs suggérés, cardinalités MCD 1,N — 1,1 posées près de chaque entité.",
  },
  {
    target: "#tour-export",
    title: "03 · Exporte tout",
    text: "Onglets SQL / Prisma / Drizzle / JSON sur tout le canvas, plus SVG et PNG. La barre du bas suit ta sélection, ton zoom et tes actions. Bon MCD !",
  },
];

/** Visite guidée : affichée uniquement au tout premier lancement. */
export function useTour() {
  const [tour, setTour] = useState<{ active: boolean; step: number }>(() => ({
    active: shouldShowTour(),
    step: 0,
  }));
  const [tourPos, setTourPos] = useState<{ top: number; left: number } | null>(null);

  const closeTour = useCallback(() => {
    markTourSeen();
    setTour({ active: false, step: 0 });
  }, []);
  const openTour = useCallback(() => setTour({ active: true, step: 0 }), []);
  const stepTour = useCallback(
    (step: number) => setTour((t) => ({ ...t, step })),
    []
  );

  // Surligne la cible de l'étape et place la carte à côté.
  useEffect(() => {
    if (!tour.active) return;
    const step = TOUR_STEPS[tour.step];
    const place = () => {
      document.querySelectorAll(".tour-glow").forEach((e) => e.classList.remove("tour-glow"));
      if (!step.target) { setTourPos(null); return; }
      const el = document.querySelector(step.target) as HTMLElement | null;
      if (!el || !el.offsetParent) { setTourPos(null); return; }
      el.classList.add("tour-glow");
      const r = el.getBoundingClientRect();
      const W = 300, H = 230, GAP = 12, vw = window.innerWidth, vh = window.innerHeight;
      const fits = (top: number, left: number) =>
        top >= 8 && left >= 8 && top + H <= vh - 8 && left + W <= vw - 8;
      const overlaps = (top: number, left: number) =>
        left < r.right + 4 && left + W > r.left - 4 && top < r.bottom + 4 && top + H > r.top - 4;
      const midTop = Math.min(Math.max(8, r.top), Math.max(8, vh - H - 8));
      const stayX = Math.min(Math.max(8, r.left), Math.max(8, vw - W - 8));
      const candidates = [
        { top: midTop, left: r.right + GAP },   // à droite de la cible
        { top: midTop, left: r.left - W - GAP }, // à gauche
        { top: r.bottom + GAP, left: stayX },    // dessous
        { top: r.top - H - GAP, left: stayX },   // dessus
      ];
      const pick =
        candidates.find((c) => fits(c.top, c.left) && !overlaps(c.top, c.left)) ??
        candidates.find((c) => !overlaps(c.top, c.left)) ??
        { top: Math.max(8, (vh - H) / 2), left: Math.max(8, (vw - W) / 2) };
      setTourPos(pick);
    };
    place();
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("resize", place);
      document.querySelectorAll(".tour-glow").forEach((e) => e.classList.remove("tour-glow"));
    };
  }, [tour]);

  return { tour, tourPos, openTour, closeTour, stepTour };
}
