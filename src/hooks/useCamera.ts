import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import type { DBTable } from "../types";
import { CARD_W, cardH } from "../domain/geometry";

export interface Camera {
  x: number;
  y: number;
  z: number;
}

const HOME: Camera = { x: 20, y: 20, z: 1 };

/**
 * Caméra du canvas : pan (glisser, direct-DOM puis commit), zoom molette
 * (natif non-passif, ancré au curseur), zoom centré, cadrage et recentrage.
 * Possède ses refs DOM (jamais exposées en props) + callbacks d'attache.
 * `tables` = tables à cadrer (visibles, sinon toutes).
 */
export function useCamera(tables: DBTable[]) {
  const [cam, setCam] = useState<Camera>(HOME);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const worldRef = useRef<HTMLDivElement | null>(null);
  const attachWrap = useCallback((el: HTMLDivElement | null) => {
    wrapRef.current = el;
  }, []);
  const attachCanvas = useCallback((el: HTMLDivElement | null) => {
    canvasRef.current = el;
  }, []);
  const attachWorld = useCallback((el: HTMLDivElement | null) => {
    worldRef.current = el;
  }, []);
  // Molette : on accumule les deltas et on zoome 1 fois / frame.
  const wheelRaf = useRef(0);
  const wheelAcc = useRef<{ d: number; mx: number; my: number; sens: number } | null>(null);

  // Molette = zoom libre vers le curseur (natif non-passif pour preventDefault).
  // Ancré au wrapper (jamais recréé) : survit à tout re-render du canvas.
  // Glisser sur le fond = déplacer. Le zoom boutons/slider est centré écran.
  useEffect(() => {
    const wrap = wrapRef.current;
    const el = canvasRef.current;
    if (!wrap || !el) return;
    const handler = (e: WheelEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest("input,select,textarea,button")) return; // slider, boutons : on laisse faire
      if (!t || (t !== el && !el.contains(t))) return; // seulement sur la grille
      e.preventDefault();
      e.stopPropagation();
      const rect = el.getBoundingClientRect();
      const acc = wheelAcc.current;
      wheelAcc.current = {
        d: (acc?.d ?? 0) + e.deltaY,
        mx: e.clientX - rect.left,
        my: e.clientY - rect.top,
        sens: e.ctrlKey || e.metaKey ? 0.01 : 0.0018, // pinch trackpad = plus doux
      };
      if (wheelRaf.current) return;
      wheelRaf.current = requestAnimationFrame(() => {
        wheelRaf.current = 0;
        const w = wheelAcc.current;
        wheelAcc.current = null;
        if (!w) return;
        setCam((c) => {
          const factor = Math.exp(-w.d * w.sens);
          const z = Math.min(2.5, Math.max(0.2, +(c.z * factor).toFixed(3)));
          if (z === c.z) return c;
          const wx = (w.mx - c.x) / c.z;
          const wy = (w.my - c.y) / c.z;
          return { x: w.mx - wx * z, y: w.my - wy * z, z };
        });
      });
    };
    wrap.addEventListener("wheel", handler, { passive: false });
    return () => wrap.removeEventListener("wheel", handler);
  }, []);

  // Zoom centré sur le milieu de l'écran (boutons / slider)
  const zoomCentered = (nextZ: number) => {
    const el = wrapRef.current;
    const W = el?.clientWidth || 800;
    const H = el?.clientHeight || 600;
    setCam((c) => {
      const z = Math.min(2.5, Math.max(0.2, +nextZ.toFixed(2)));
      const wx = (W / 2 - c.x) / c.z;
      const wy = (H / 2 - c.y) / c.z;
      return { x: W / 2 - wx * z, y: H / 2 - wy * z, z };
    });
  };
  const resetCam = () => setCam(HOME);

  const fitView = () => {
    if (!tables.length) {
      setCam(HOME);
      return;
    }
    const el = wrapRef.current;
    const W = el?.clientWidth || 1000;
    const H = el?.clientHeight || 700;
    const minX = Math.min(...tables.map((t) => t.x));
    const minY = Math.min(...tables.map((t) => t.y));
    const maxX = Math.max(...tables.map((t) => t.x + CARD_W));
    const maxY = Math.max(...tables.map((t) => t.y + cardH(t)));
    const z = Math.min(2.5, Math.max(0.2, Math.min((W - 80) / Math.max(1, maxX - minX), (H - 80) / Math.max(1, maxY - minY))));
    setCam({ x: 40 - minX * z, y: 40 - minY * z, z: +z.toFixed(2) });
  };
  const fitViewSoon = () => setTimeout(() => fitView(), 60);

  const centerOn = (t: DBTable) => {
    const el = wrapRef.current;
    const W = el?.clientWidth || 1000;
    const H = el?.clientHeight || 700;
    setCam((c) => ({ ...c, x: W / 2 - (t.x + CARD_W / 2) * c.z, y: H / 2 - (t.y + 60) * c.z }));
  };

  // Pan du fond : direct-DOM pendant le geste, single commit au relâcher.
  const onCanvasMouseDown = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest(".table-card")) return;
    const world = worldRef.current;
    if (!world) return;
    const sx = e.clientX, sy = e.clientY, cx = cam.x, cy = cam.y, z = cam.z;
    let alive = true;
    let lx = cx, ly = cy;
    const move = (ev: globalThis.MouseEvent) => {
      if (!alive) return;
      lx = cx + (ev.clientX - sx);
      ly = cy + (ev.clientY - sy);
      // Déplacement pur compositeur : aucun re-render, aucun repaint du fond.
      world.style.transform = `translate(${lx}px, ${ly}px) scale(${z})`;
    };
    const up = () => {
      alive = false;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setCam({ x: lx, y: ly, z }); // UN seul render : tout se recale (cartes, liens)
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  return {
    cam,
    attachWrap,
    attachCanvas,
    attachWorld,
    zoomCentered,
    resetCam,
    fitView,
    fitViewSoon,
    centerOn,
    onCanvasMouseDown,
  };
}
