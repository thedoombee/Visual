import { useCallback, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

const MAX_STEPS = 50;

export interface History<T> {
  present: T;
  /** Remplacement direct, SANS pas d'historique (ex: drag, suivi d'un `commit`). */
  setPresent: Dispatch<SetStateAction<T>>;
  /** Applique un nouvel état + 1 pas d'historique, vide le futur. */
  apply: (next: T | ((prev: T) => T)) => void;
  /** Pousse un état antérieur capturé ailleurs (ex: début de drag) + vide le futur. */
  commit: (snapshot: T) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * Historique undo/redo générique (50 pas). Tout est calculé AVANT les
 * setState : aucun effet de bord dans les updaters (StrictMode double-invoke).
 */
export function useHistory<T>(initial: T | (() => T)): History<T> {
  const [present, setPresent] = useState(initial);
  const [past, setPast] = useState<T[]>([]);
  const [future, setFuture] = useState<T[]>([]);

  const apply = useCallback(
    (next: T | ((prev: T) => T)) => {
      const n = typeof next === "function" ? (next as (p: T) => T)(present) : next;
      setPast((h) => [...h.slice(-(MAX_STEPS - 1)), present]);
      setPresent(n);
      setFuture([]);
    },
    [present]
  );

  const commit = useCallback((snapshot: T) => {
    setPast((h) => [...h.slice(-(MAX_STEPS - 1)), snapshot]);
    setFuture([]);
  }, []);

  const undo = useCallback(() => {
    if (!past.length) return;
    const prev = past[past.length - 1];
    setFuture((f) => [present, ...f].slice(0, MAX_STEPS));
    setPast(past.slice(0, -1));
    setPresent(prev);
  }, [past, present]);

  const redo = useCallback(() => {
    if (!future.length) return;
    const [next, ...rest] = future;
    setPast((h) => [...h.slice(-(MAX_STEPS - 1)), present]);
    setFuture(rest);
    setPresent(next);
  }, [future, present]);

  return {
    present,
    setPresent,
    apply,
    commit,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
  };
}
