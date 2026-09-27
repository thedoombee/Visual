import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DBModel, DBRelation, DBTable } from "./types";
import { MCD_CARDS, mcdCards, uid } from "./types";
import { detectKind, parseAuto } from "./parsers";
import { toDrizzle, toPrisma, toSQL } from "./generators";
import { EXAMPLE_DRIZZLE, EXAMPLE_PRISMA, EXAMPLE_SQL } from "./examples";
import { STARTERS, type StarterPack } from "./templates";

const CARD_W = 236;
const HEADER_H = 36;
const ROW_H = 27;
const STORE_KEY = "mcd-studio-v2";
const TOUR_KEY = "mcd-studio-tour-v1";

interface TourStep { target: string | null; title: string; text: string; }
const TOUR_STEPS: TourStep[] = [
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

const TYPE_SUGGESTIONS = [
  "SERIAL", "INTEGER", "BIGINT", "VARCHAR(255)", "VARCHAR(100)", "TEXT",
  "BOOLEAN", "TIMESTAMP", "DATE", "UUID", "JSON", "JSONB", "FLOAT", "DECIMAL",
];

function cardH(t: DBTable) {
  return HEADER_H + t.fields.length * ROW_H + 8;
}
function fieldY(t: DBTable, fieldName: string) {
  const idx = t.fields.findIndex((f) => f.name === fieldName);
  return t.y + HEADER_H + (idx < 0 ? 0 : idx * ROW_H + ROW_H / 2);
}
function edgePath(x1: number, y1: number, x2: number, y2: number) {
  const dx = Math.max(40, Math.abs(x2 - x1) / 2);
  const ltr = x2 >= x1;
  const c1x = x1 + (ltr ? dx : -dx);
  const c2x = x2 + (ltr ? -dx : dx);
  return `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`;
}
function initialModel(): DBModel {
  try {
    const raw = localStorage.getItem(STORE_KEY) ?? localStorage.getItem("mcd-studio-v1");
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
  return parseAuto(EXAMPLE_SQL).model;
}

// Un slot = un modèle importé dans le panneau gauche.
// Chacun garde son texte, se plie/déplie, et peut être ajouté au canvas.
export interface ImportSlot {
  id: string;
  name: string;
  source: string;
  collapsed: boolean;
  msg: string;
  hidden?: boolean; // modèle masqué sur le canvas
}
const SLOTS_KEY = "mcd-studio-slots-v1";
function loadSlots(): ImportSlot[] {
  try {
    const raw = localStorage.getItem(SLOTS_KEY);
    if (raw) {
      const arr = JSON.parse(raw) as ImportSlot[];
      if (Array.isArray(arr) && arr.length) return arr;
    }
  } catch { /* ignore */ }
  return [{ id: uid("slot"), name: "Modèle 1", source: EXAMPLE_SQL, collapsed: false, msg: "" }];
}

export default function App() {
  const [model, setModel] = useState<DBModel>(initialModel);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showLeft, setShowLeft] = useState(true);
  const [showRight, setShowRight] = useState(true);
  const [parseMsg, setParseMsg] = useState("");
  // Modèles importés : autant que tu veux, chacun pliable/dépliable,
  // chacun avec son propre texte + message. Persistés en local.
  const [slots, setSlots] = useState<ImportSlot[]>(() => loadSlots());
  const [cam, setCam] = useState({ x: 20, y: 20, z: 1 });
  const [focusMode, setFocusMode] = useState(false);
  const [exportView, setExportView] = useState<null | "sql" | "prisma" | "drizzle" | "json">(null);
  const [showGallery, setShowGallery] = useState(false);
  const [savedAt, setSavedAt] = useState("");
  const [query, setQuery] = useState("");
  // Visite guidée : affichée uniquement au tout premier lancement
  // (aucune donnée MCD dans le localStorage et visite jamais vue).
  const [tour, setTour] = useState<{ active: boolean; step: number }>(() => {
    try {
      if (localStorage.getItem(TOUR_KEY)) return { active: false, step: 0 };
      const hasData =
        localStorage.getItem(STORE_KEY) ||
        localStorage.getItem("mcd-studio-v1") ||
        localStorage.getItem(SLOTS_KEY);
      return { active: !hasData, step: 0 };
    } catch {
      return { active: false, step: 0 };
    }
  });
  const [tourPos, setTourPos] = useState<{ top: number; left: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  // Molette : on accumule les deltas et on zoome 1 fois / frame.
  const wheelRaf = useRef(0);
  const wheelAcc = useRef<{ d: number; mx: number; my: number; sens: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textFileRef = useRef<HTMLInputElement>(null);

  // ---------- history (undo / redo) ----------
  const [hist, setHist] = useState<DBModel[]>([]);
  const [future, setFuture] = useState<DBModel[]>([]);
  const apply = useCallback((next: DBModel | ((m: DBModel) => DBModel)) => {
    setModel((prev) => {
      const n = typeof next === "function" ? (next as (m: DBModel) => DBModel)(prev) : next;
      setHist((h) => [...h.slice(-49), prev]);
      return n;
    });
    setFuture([]);
  }, []);
  const undo = useCallback(() => {
    setHist((h) => {
      if (!h.length) return h;
      const prev = h[h.length - 1];
      setModel((cur) => {
        setFuture((f) => [cur, ...f].slice(0, 50));
        return prev;
      });
      return h.slice(0, -1);
    });
  }, []);
  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f;
      const [next, ...rest] = f;
      setModel((cur) => {
        setHist((h) => [...h.slice(-49), cur]);
        return next;
      });
      return rest;
    });
  }, []);

  const selected = useMemo(
    () => model.tables.find((t) => t.id === selectedId) ?? null,
    [model, selectedId]
  );
  const byName = useMemo(() => new Map(model.tables.map((t) => [t.name, t])), [model]);
  // Visibilité par modèle : un slot masqué cache ses tables (et leurs liens).
  // Les tables sans slotId (créées à la main, anciens modèles) restent visibles.
  const hiddenSlotIds = useMemo(
    () => new Set(slots.filter((s) => s.hidden).map((s) => s.id)),
    [slots]
  );
  const visibleTables = useMemo(
    () => model.tables.filter((t) => !t.slotId || !hiddenSlotIds.has(t.slotId)),
    [model, hiddenSlotIds]
  );
  const visibleNames = useMemo(() => new Set(visibleTables.map((t) => t.name)), [visibleTables]);
  const visibleRelations = useMemo(
    () => model.relations.filter((r) => visibleNames.has(r.fromTable) && visibleNames.has(r.toTable)),
    [model, visibleNames]
  );
  const slotTableCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of model.tables) if (t.slotId) m.set(t.slotId, (m.get(t.slotId) ?? 0) + 1);
    return m;
  }, [model]);

  const openExport = useCallback((view: "sql" | "prisma" | "drizzle" | "json") => {
    setExportView(view);
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(model));
        setSavedAt(new Date().toLocaleTimeString());
      } catch { /* ignore */ }
    }, 400);
    return () => clearTimeout(id);
  }, [model]);

  // Persistance des slots d'import (textes + plié/déplié)
  useEffect(() => {
    try {
      localStorage.setItem(SLOTS_KEY, JSON.stringify(slots));
    } catch { /* ignore */ }
  }, [slots]);

  // Visite guidée : surligne la cible de l'étape et place la carte à côté.
  const closeTour = useCallback(() => {
    try {
      localStorage.setItem(TOUR_KEY, "done");
    } catch { /* ignore */ }
    setTour({ active: false, step: 0 });
  }, []);
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

  const updateSlot = useCallback((id: string, patch: Partial<ImportSlot>) => {
    setSlots((ss) => ss.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);
  const addSlot = useCallback((name?: string, source?: string) => {
    const id = uid("slot");
    const n = slots.length + 1;
    setSlots((ss) => [...ss.map((s) => ({ ...s, collapsed: true })), {
      id, name: name?.trim() || `Modèle ${n}`, source: source ?? "", collapsed: false, msg: "",
    }]);
    return id;
  }, [slots.length]);
  // Formulaire "modèle perso" de la galerie : crée un vrai slot du panneau gauche.
  const [customName, setCustomName] = useState("");
  const [customSource, setCustomSource] = useState("");
  const addCustomSlot = useCallback(() => {
    if (!customSource.trim()) return;
    addSlot(customName || undefined, customSource);
    setCustomName("");
    setCustomSource("");
    setShowGallery(false);
    setShowLeft(true);
    setParseMsg("Modèle perso ajouté au panneau gauche : plie/déplie, puis ＋ Ajouter.");
  }, [customName, customSource, addSlot]);
  const deleteSlot = useCallback((id: string) => {
    setSlots((ss) => ss.filter((s) => s.id !== id));
    // Les tables du modèle redeviennent "sans modèle" : toujours visibles.
    if (model.tables.some((t) => t.slotId === id)) {
      apply((m) => ({
        ...m,
        tables: m.tables.map((t) => (t.slotId === id ? { ...t, slotId: undefined } : t)),
      }));
    }
  }, [apply, model]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault(); undo(); return;
      }
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") ||
          ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "z")) {
        e.preventDefault(); redo(); return;
      }
      if (e.key === "Escape") {
        if (exportView) { setExportView(null); return; }
        if (showGallery) { setShowGallery(false); return; }
        if (typing) return;
        if (linkModeRef.current) { setLinkMode(false); setLinkFromId(null); }
        else setFocusMode(false);
        return;
      }
      if (typing) return;
      if (exportView || showGallery) return; // modale ouverte : que Echap / undo / redo
      if (e.key === "[") setShowLeft((v) => !v);
      else if (e.key === "]") setShowRight((v) => !v);
      else if (e.key.toLowerCase() === "f") fitView();
      else if (e.key.toLowerCase() === "m") setFocusMode((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo, redo, model, exportView, showGallery]);

  // ---------- validation ----------
  const issues = useMemo(() => {
    const out: { level: "err" | "warn"; text: string }[] = [];
    const names = new Set(model.tables.map((t) => t.name));
    for (const t of model.tables) {
      if (!t.fields.some((f) => f.pk)) out.push({ level: "warn", text: `${t.name} : sans PRIMARY KEY` });
      const linked = model.relations.some((r) => r.fromTable === t.name || r.toTable === t.name);
      if (!linked && model.tables.length > 1) out.push({ level: "warn", text: `${t.name} : table isolée (aucun lien)` });
    }
    for (const r of model.relations) {
      if (!names.has(r.fromTable) || !names.has(r.toTable))
        out.push({ level: "err", text: `Lien orphelin : ${r.fromTable}.${r.fromField} → ${r.toTable}.${r.toField}` });
      else {
        const a = byName.get(r.fromTable);
        const b = byName.get(r.toTable);
        if (a && !a.fields.some((f) => f.name === r.fromField))
          out.push({ level: "err", text: `${r.fromTable}.${r.fromField} n'existe plus` });
        if (b && !b.fields.some((f) => f.name === r.toField))
          out.push({ level: "err", text: `${r.toTable}.${r.toField} n'existe plus` });
      }
    }
    return out;
  }, [model, byName]);

  const q = query.trim().toLowerCase();
  const matchTable = useCallback((t: DBTable) => {
    if (!q) return true;
    return t.name.toLowerCase().includes(q) || t.fields.some((f) => f.name.toLowerCase().includes(q) || f.type.toLowerCase().includes(q));
  }, [q]);

  // ---------- import ----------
  // Ajout générique : parse un SQL et l'ajoute à droite du canvas.
  // Chaque table importée est taguée avec le slot d'origine (visibilité par modèle).
  // Retourne les ids des tables ajoutées.
  const mergeParsed = useCallback((parsed: DBModel, slotId?: string): string[] => {
    const existing = new Set(model.tables.map((t) => t.name));
    const rename = new Map<string, string>();
    const incoming: DBModel = {
      tables: parsed.tables.map((t) => ({
        ...t, id: uid("t"), slotId,
        fields: t.fields.map((f) => ({ ...f, id: uid("f") })),
      })),
      relations: parsed.relations.map((r) => ({ ...r, id: uid("rel") })),
    };
    for (const t of incoming.tables) {
      if (existing.has(t.name)) {
        let k = 2;
        while (existing.has(`${t.name}_${k}`)) k++;
        rename.set(t.name, `${t.name}_${k}`);
        t.name = `${t.name}_${k}`;
      }
      existing.add(t.name);
    }
    for (const r of incoming.relations) {
      if (rename.has(r.fromTable)) r.fromTable = rename.get(r.fromTable)!;
      if (rename.has(r.toTable)) r.toTable = rename.get(r.toTable)!;
    }
    const maxX = model.tables.length ? Math.max(...model.tables.map((t) => t.x + CARD_W)) : 0;
    const dx = Math.max(0, maxX + 120 - 60);
    for (const t of incoming.tables) t.x += dx;
    const ids = incoming.tables.map((t) => t.id);
    apply({
      ...model,
      tables: [...model.tables, ...incoming.tables],
      relations: [...model.relations, ...incoming.relations],
    });
    return ids;
  }, [apply, model]);

  // Ajoute CE modèle au canvas sans effacer ceux déjà présents.
  const mergeImportSlot = useCallback((slot: ImportSlot) => {
    const { model: m, kind: k } = parseAuto(slot.source);
    if (!m.tables.length) {
      updateSlot(slot.id, { msg: "Aucune table détectée. Vérifie ton schema (CREATE TABLE / model / pgTable)." });
      return;
    }
    const ids = mergeParsed(m, slot.id);
    setSelectedId(ids[0] ?? null);
    updateSlot(slot.id, { msg: `+ ${m.tables.length} table(s) ajoutée(s) [${k}].` });
    setParseMsg(`« ${slot.name} » ajouté : relie ses entités à la main avec leurs cardinalités MCD.`);
    fitViewSoon();
  }, [mergeParsed, updateSlot]);

  // ---------- tables ----------
  const addTable = useCallback(() => {
    const n = model.tables.length + 1;
    const t: DBTable = {
      id: uid("t"),
      name: `nouvelle_table_${n}`,
      x: 80 + (n * 90) % 600,
      y: 80 + (n * 70) % 500,
      fields: [{ id: uid("f"), name: "id", type: "SERIAL", pk: true, nullable: false }],
    };
    apply((m) => ({ ...m, tables: [...m.tables, t] }));
    setSelectedId(t.id);
  }, [model.tables.length, apply]);

  const duplicateTable = useCallback((id: string) => {
    apply((m) => {
      const t = m.tables.find((x) => x.id === id);
      if (!t) return m;
      const copy: DBTable = {
        ...t, id: uid("t"), name: t.name + "_copie", x: t.x + 40, y: t.y + 40,
        fields: t.fields.map((f) => ({ ...f, id: uid("f") })),
      };
      return { ...m, tables: [...m.tables, copy] };
    });
  }, [apply]);

  const deleteTable = useCallback((id: string) => {
    apply((m) => {
      const t = m.tables.find((x) => x.id === id);
      if (!t) return m;
      return {
        tables: m.tables.filter((x) => x.id !== id),
        relations: m.relations.filter((r) => r.fromTable !== t.name && r.toTable !== t.name),
      };
    });
    setSelectedId(null);
  }, [apply]);

  const renameTable = useCallback((id: string, name: string) => {
    apply((m) => {
      const old = m.tables.find((t) => t.id === id);
      if (!old) return m;
      return {
        tables: m.tables.map((t) => (t.id === id ? { ...t, name } : t)),
        relations: m.relations.map((r) => ({
          ...r,
          fromTable: r.fromTable === old.name ? name : r.fromTable,
          toTable: r.toTable === old.name ? name : r.toTable,
        })),
      };
    });
  }, [apply]);

  const moveTable = useCallback((id: string, x: number, y: number) => {
    setModel((m) => ({
      ...m,
      tables: m.tables.map((t) => (t.id === id ? { ...t, x: Math.round(x), y: Math.round(y) } : t)),
    }));
  }, []);

  // Drag & pan : pendant le geste on écrit le transform DIRECTEMENT dans le DOM
  // (zéro re-render React) puis on committe UNE fois au relâcher.
  // C'est ce qui rend le déplacement instantané même avec beaucoup de tables.

  // ---------- fields ----------
  const updateField = useCallback((tableId: string, fieldId: string, patch: Partial<DBTable["fields"][number]>) => {
    apply((m) => ({
      ...m,
      tables: m.tables.map((t) =>
        t.id === tableId ? { ...t, fields: t.fields.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)) } : t
      ),
    }));
  }, [apply]);

  const addField = useCallback((tableId: string) => {
    apply((m) => ({
      ...m,
      tables: m.tables.map((t) =>
        t.id === tableId
          ? { ...t, fields: [...t.fields, { id: uid("f"), name: `champ_${t.fields.length + 1}`, type: "TEXT", nullable: true }] }
          : t
      ),
    }));
  }, [apply]);

  const deleteField = useCallback((tableId: string, fieldId: string) => {
    apply((m) => {
      const t = m.tables.find((x) => x.id === tableId);
      const f = t?.fields.find((x) => x.id === fieldId);
      return {
        tables: m.tables.map((x) => (x.id === tableId ? { ...x, fields: x.fields.filter((y) => y.id !== fieldId) } : x)),
        relations: f
          ? m.relations.filter((r) => !(r.fromTable === t!.name && r.fromField === f.name) && !(r.toTable === t!.name && r.toField === f.name))
          : m.relations,
      };
    });
  }, [apply]);

  // ---------- relations (entité → entité, cardinalités MCD des 2 côtés) ----------
  const [relForm, setRelForm] = useState({ fromTable: "", fromField: "", toTable: "", toField: "", cardA: "1,N", cardB: "1,1" });
  // Mode liaison sur le canvas : clic sur l'entité source puis sur l'entité cible.
  const [linkMode, setLinkMode] = useState(false);
  const [linkFromId, setLinkFromId] = useState<string | null>(null);
  const [linkHoverId, setLinkHoverId] = useState<string | null>(null);
  const linkModeRef = useRef(false);
  linkModeRef.current = linkMode;
  // Champ suggéré côté source : xxx_id qui vise la cible, sinon 1er champ non-PK, sinon 1er champ.
  const suggestFromField = useCallback((srcName: string, dstName: string): string => {
    const src = model.tables.find((t) => t.name === srcName);
    if (!src || !src.fields.length) return "";
    const dst = dstName.toLowerCase();
    const sing = (s: string) => (s.endsWith("s") ? s.slice(0, -1) : s);
    const hit = src.fields.find((f) => {
      const low = f.name.toLowerCase();
      return low === `${dst}_id` || low === `${dst}id` || low === `${sing(dst)}_id` || low === `${sing(dst)}id`;
    }) ?? src.fields.find((f) => !f.pk) ?? src.fields[0];
    return hit.name;
  }, [model]);
  const suggestToField = useCallback((dstName: string): string => {
    const dst = model.tables.find((t) => t.name === dstName);
    if (!dst || !dst.fields.length) return "";
    return (dst.fields.find((f) => f.pk) ?? dst.fields[0]).name;
  }, [model]);

  const addRelation = useCallback(() => {
    const { fromTable, fromField, toTable, toField, cardA, cardB } = relForm;
    if (!fromTable || !fromField || !toTable || !toField) return;
    const dup = model.relations.some(
      (r) => r.fromTable === fromTable && r.fromField === fromField && r.toTable === toTable && r.toField === toField
    );
    if (dup) {
      setParseMsg(`Lien déjà existant : ${fromTable}.${fromField} → ${toTable}.${toField}.`);
      return;
    }
    const rel: DBRelation = {
      id: uid("rel"), fromTable, fromField, toTable, toField, fromCard: cardA, toCard: cardB,
    };
    apply((m) => ({
      ...m,
      tables: m.tables.map((t) =>
        t.name === fromTable ? { ...t, fields: t.fields.map((f) => (f.name === fromField ? { ...f, fk: true } : f)) } : t
      ),
      relations: [...m.relations, rel],
    }));
    setRelForm((f) => ({ ...f, fromField: "", toField: "" }));
  }, [relForm, apply, model]);

  const deleteRelation = useCallback((id: string) => {
    apply((m) => ({ ...m, relations: m.relations.filter((r) => r.id !== id) }));
  }, [apply]);

  const updateCards = useCallback((id: string, side: "a" | "b", value: string) => {
    apply((m) => ({
      ...m,
      relations: m.relations.map((r) =>
        r.id === id ? { ...r, ...(side === "a" ? { fromCard: value } : { toCard: value }) } : r
      ),
    }));
  }, [apply]);

  // Clic-clic sur le canvas en mode liaison : source puis cible.
  // Champs suggérés (xxx_id → PK), cardinalités MCD par défaut 1,N — 1,1.
  const handleLinkClick = useCallback((t: DBTable) => {
    if (!linkFromId) {
      setLinkFromId(t.id);
      return;
    }
    if (linkFromId === t.id) {
      setLinkFromId(null); // re-clic = annule le départ
      return;
    }
    const src = model.tables.find((x) => x.id === linkFromId);
    if (!src) { setLinkFromId(t.id); return; }
    const fromField = suggestFromField(src.name, t.name);
    const toField = suggestToField(t.name);
    if (!fromField || !toField) {
      setParseMsg("Liaison impossible : champ source ou cible introuvable.");
      setLinkFromId(null);
      return;
    }
    const rel: DBRelation = {
      id: uid("rel"),
      fromTable: src.name, fromField, toTable: t.name, toField,
      fromCard: "1,N", toCard: "1,1",
    };
    const dup = model.relations.some(
      (r) => r.fromTable === rel.fromTable && r.fromField === rel.fromField && r.toTable === rel.toTable && r.toField === rel.toField
    );
    if (dup) {
      setParseMsg(`Lien déjà existant : ${rel.fromTable}.${rel.fromField} → ${rel.toTable}.${rel.toField}. Choisis d'autres champs ou modifie-le dans Édition.`);
      setLinkFromId(null);
      return;
    }
    apply((m) => ({
      ...m,
      tables: m.tables.map((x) =>
        x.name === src.name ? { ...x, fields: x.fields.map((f) => (f.name === fromField ? { ...f, fk: true } : f)) } : x
      ),
      relations: [...m.relations, rel],
    }));
    setParseMsg(`Lié : ${src.name}.${fromField} (1,N) — ${t.name}.${toField} (1,1). Modifie les cardinalités dans Édition.`);
    setSelectedId(src.id);
    setLinkFromId(null); // le mode reste actif pour enchaîner
  }, [linkFromId, model, apply, suggestFromField, suggestToField]);

  // ---------- galerie : un modèle choisi S'AJOUTE aux autres (jamais de remplacement) ----------
  // Il rejoint le canvas (à droite) + un slot du panneau gauche.
  const loadStarter = useCallback((pack: StarterPack) => {
    const parsed = parseAuto(pack.sql).model;
    const name = `${pack.numero} · ${pack.titre}`;
    const slotId = addSlot(name, pack.sql);
    const ids = mergeParsed(parsed, slotId);
    updateSlot(slotId, { msg: `Ajouté : ${parsed.tables.length} table(s) sur le canvas.` });
    setSelectedId(ids[0] ?? null);
    setParseMsg(`« ${name} » ajouté aux modèles présents.`);
    setShowGallery(false);
    fitViewSoon();
  }, [mergeParsed, addSlot, updateSlot]);

  // ---------- layout / camera ----------
  const autoLayout = useCallback(() => {
    apply((m) => {
      const cols = Math.max(1, Math.ceil(Math.sqrt(m.tables.length)));
      return {
        ...m,
        tables: m.tables.map((t, i) => ({
          ...t,
          x: 60 + (i % cols) * (CARD_W + 90),
          y: 60 + Math.floor(i / cols) * 300,
        })),
      };
    });
    setCam({ x: 20, y: 20, z: 1 });
  }, [apply]);

  const fitView = useCallback(() => {
    const tables = visibleTables.length ? visibleTables : model.tables;
    if (!tables.length) { setCam({ x: 20, y: 20, z: 1 }); return; }
    const el = wrapRef.current;
    const W = el?.clientWidth || 1000;
    const H = el?.clientHeight || 700;
    const minX = Math.min(...tables.map((t) => t.x));
    const minY = Math.min(...tables.map((t) => t.y));
    const maxX = Math.max(...tables.map((t) => t.x + CARD_W));
    const maxY = Math.max(...tables.map((t) => t.y + cardH(t)));
    const z = Math.min(2.5, Math.max(0.2, Math.min((W - 80) / Math.max(1, maxX - minX), (H - 80) / Math.max(1, maxY - minY))));
    setCam({ x: 40 - minX * z, y: 40 - minY * z, z: +z.toFixed(2) });
  }, [model, visibleTables]);
  const fitViewSoon = () => setTimeout(() => fitView(), 60);

  const centerOn = useCallback((t: DBTable) => {
    const el = wrapRef.current;
    const W = el?.clientWidth || 1000;
    const H = el?.clientHeight || 700;
    setCam((c) => ({ ...c, x: W / 2 - (t.x + CARD_W / 2) * c.z, y: H / 2 - (t.y + 60) * c.z }));
    setSelectedId(t.id);
  }, []);

  // ---------- drag & pan (direct-DOM pendant le geste, commit au relâcher) ----------
  const onCardMouseDown = (e: React.MouseEvent, t: DBTable) => {
    if ((e.target as HTMLElement).closest("button,input,select")) return;
    if (linkMode) return; // en mode liaison : pas de déplacement, que des clics
    e.stopPropagation();
    setSelectedId(t.id);
    const cardEl = e.currentTarget as HTMLElement;
    const z = cam.z;
    const sx0 = e.clientX, sy0 = e.clientY;
    let tx = 0, ty = 0, moved = false;
    const snapshot = model; // état avant déplacement, pour un seul pas d'historique
    // Liens touchés par cette table : on garde les nœuds SVG + coords de base
    // pour redessiner courbes, pastilles et cardinalités EN DIRECT (zéro render).
    interface LiveEdge {
      path: SVGPathElement | null;
      fromDot: SVGCircleElement | null; fromLabel: SVGTextElement | null;
      toDot: SVGCircleElement | null; toLabel: SVGTextElement | null;
      x1: number; y1: number; x2: number; y2: number;
      moveFrom: boolean; moveTo: boolean;
    }
    const liveEdges: LiveEdge[] = [];
    if (worldRef.current) {
      for (const r of model.relations) {
        const moveFrom = r.fromTable === t.name;
        const moveTo = r.toTable === t.name;
        if (!moveFrom && !moveTo) continue;
        const a = byName.get(r.fromTable);
        const b = byName.get(r.toTable);
        if (!a || !b) continue;
        const g = worldRef.current.querySelector(`g.edge[data-rel="${r.id}"]`);
        if (!g) continue;
        const texts = g.querySelectorAll("text");
        liveEdges.push({
          path: g.querySelector("path.edge-line"),
          fromDot: g.querySelector("circle.dot.from"),
          fromLabel: (texts[0] as SVGTextElement | undefined) ?? null,
          toDot: g.querySelector("circle.dot.to"),
          toLabel: (texts[1] as SVGTextElement | undefined) ?? null,
          x1: a.x + CARD_W, y1: fieldY(a, r.fromField),
          x2: b.x, y2: fieldY(b, r.toField),
          moveFrom, moveTo,
        });
      }
    }
    const paintEdges = () => {
      for (const le of liveEdges) {
        const nx1 = le.moveFrom ? le.x1 + tx : le.x1;
        const ny1 = le.moveFrom ? le.y1 + ty : le.y1;
        const nx2 = le.moveTo ? le.x2 + tx : le.x2;
        const ny2 = le.moveTo ? le.y2 + ty : le.y2;
        le.path?.setAttribute("d", edgePath(nx1, ny1, nx2, ny2));
        if (le.moveFrom) {
          le.fromDot?.setAttribute("cx", String(nx1));
          le.fromDot?.setAttribute("cy", String(ny1));
          le.fromLabel?.setAttribute("x", String(nx1 + 9));
          le.fromLabel?.setAttribute("y", String(ny1 - 8));
        }
        if (le.moveTo) {
          le.toDot?.setAttribute("cx", String(nx2));
          le.toDot?.setAttribute("cy", String(ny2));
          le.toLabel?.setAttribute("x", String(nx2 - 9));
          le.toLabel?.setAttribute("y", String(ny2 - 8));
        }
      }
    };
    const move = (ev: MouseEvent) => {
      tx = (ev.clientX - sx0) / z;
      ty = (ev.clientY - sy0) / z;
      if (Math.abs(ev.clientX - sx0) + Math.abs(ev.clientY - sy0) > 3) moved = true;
      // La carte + ses liens suivent le curseur sans aucun re-render.
      cardEl.style.transform = `translate(${tx}px, ${ty}px)`;
      paintEdges();
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      cardEl.style.transform = "";
      if (!moved) return;
      moveTable(t.id, Math.round(t.x + tx), Math.round(t.y + ty));
      setHist((h) => [...h.slice(-49), snapshot]);
      setFuture([]);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const onCanvasMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".table-card")) return;
    const world = worldRef.current;
    if (!world) return;
    const sx = e.clientX, sy = e.clientY, cx = cam.x, cy = cam.y, z = cam.z;
    let alive = true;
    let lx = cx, ly = cy;
    const move = (ev: MouseEvent) => {
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
  const resetCam = () => setCam({ x: 20, y: 20, z: 1 });

  // ---------- exports ----------
  // SQL / Prisma / Drizzle / SVG / PNG = tables visibles uniquement.
  // JSON = sauvegarde complète (modèles masqués inclus).
  const exportVisible = useMemo(() => ({
    tables: visibleTables,
    relations: visibleRelations,
  }), [visibleTables, visibleRelations]);
  const exportText = useMemo(() => {
    if (exportView === "sql") return toSQL(exportVisible);
    if (exportView === "prisma") return toPrisma(exportVisible);
    if (exportView === "drizzle") return toDrizzle(exportVisible);
    if (exportView === "json") return JSON.stringify(model, null, 2);
    return "";
  }, [exportView, model, exportVisible]);
  const exportFileName = useMemo(() => {
    if (exportView === "json") return "mcd.json";
    if (exportView === "drizzle") return "schema.ts";
    if (exportView === "prisma") return "schema.prisma";
    return "mcd.sql";
  }, [exportView]);

  const download = (filename: string, content: string, mime = "text/plain") => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type: mime }));
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const exportSVGString = useCallback(() => {
    const pad = 60;
    const tables = visibleTables;
    const maxX = (tables.length ? Math.max(...tables.map((t) => t.x + CARD_W), 800) : 800) + pad;
    const maxY = (tables.length ? Math.max(...tables.map((t) => t.y + cardH(t)), 600) : 600) + pad;
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${maxX}" height="${maxY}" font-family="Space Mono,monospace">`;
    s += `<rect width="100%" height="100%" fill="#E9E7E1"/>`;
    const vByName = new Map(tables.map((t) => [t.name, t]));
    for (const r of visibleRelations) {
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
  }, [visibleTables, visibleRelations]);

  const exportPNG = useCallback(() => {
    const svg = exportSVGString();
    const img = new Image();
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width || 1600;
      canvas.height = img.height || 1000;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#E9E7E1";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => {
        if (!b) return;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(b);
        a.download = exportFileName.replace(/\.[^.]+$/, "") + ".png";
        a.click();
      }, "image/png");
    };
    img.src = url;
  }, [exportSVGString, exportFileName]);

  const newDiagram = () => {
    if (!confirm("Tout effacer et repartir de zéro ?")) return;
    apply({ tables: [], relations: [] });
    setSelectedId(null);
  };

  const loadJSONFile = (f: File) => {
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const data = JSON.parse(String(rd.result)) as DBModel;
        if (!data.tables) throw new Error("bad");
        apply({ tables: data.tables, relations: data.relations ?? [] });
        setSelectedId(data.tables[0]?.id ?? null);
      } catch { alert("Fichier JSON invalide."); }
    };
    rd.readAsText(f);
  };
  const fileTarget = useRef<string | null>(null);
  const loadTextIntoSlot = (f: File, slotId: string) => {
    const rd = new FileReader();
    rd.onload = () => {
      const text = String(rd.result ?? "");
      updateSlot(slotId, {
        source: text,
        collapsed: false,
        name: f.name.replace(/\.(sql|prisma|ts|txt)$/i, "").replace(/[_-]+/g, " ").slice(0, 28) || "Modèle importé",
      });
    };
    rd.readAsText(f);
  };

  const kindBadge: Record<string, string> = { prisma: "Prisma", drizzle: "Drizzle", sql: "SQL", unknown: "Auto" };
  const totalFields = model.tables.reduce((a, t) => a + t.fields.length, 0);

  return (
    <div className={`app ${focusMode ? "focus" : ""}`}>
      {!focusMode && (
      <nav className="cmdbar">
        <div className="cmd-brand" title="MCD Studio — Prisma · Drizzle · SQL → diagramme">
          MCD<span className="red">+</span>STUDIO
        </div>
        <div
          className="cmd-stats"
          title={issues.length ? issues.slice(0, 5).map((i) => `• ${i.text}`).join("\n") : "Aucun problème détecté"}
        >
          <span><b>{model.tables.length}</b> TABLES</span>
          <span><b className="red">{model.relations.length}</b> LIENS</span>
          <span><b>{totalFields}</b> CHAMPS</span>
          {issues.length
            ? <span className="cmd-diag err">! {issues.length}</span>
            : <span className="cmd-diag ok">✓</span>}
        </div>
        <input
          className="cmd-search" placeholder="Rechercher table / champ…"
          value={query} onChange={(e) => setQuery(e.target.value)}
        />
        <div className="cmd-group" id="tour-export" title="Exporter le canvas">
          <button className="exp-btn" onClick={() => openExport("sql")}>SQL</button>
          <button className="exp-btn" onClick={() => openExport("prisma")}>PRISMA</button>
          <button className="exp-btn" onClick={() => openExport("drizzle")}>DRIZZLE</button>
          <button className="exp-btn" onClick={() => openExport("json")}>JSON</button>
        </div>
        <div className="cmd-group">
          <button className="btn small" onClick={undo} disabled={!hist.length} title="Annuler (Ctrl+Z)">↩</button>
          <button className="btn small" onClick={redo} disabled={!future.length} title="Rétablir (Ctrl+Y)">↪</button>
        </div>
        <button className="btn small primary" onClick={() => setShowGallery(true)} title="Modèles de base + modèle perso">+ Modèles</button>
        <div className="cmd-group">
          <button className={showLeft ? "btn small active" : "btn small"} onClick={() => setShowLeft(!showLeft)} title="Panneau des modèles ( [ )">
            {showLeft ? "⟨ Modèles" : "Modèles ⟩"}
          </button>
          <button className={showRight ? "btn small active" : "btn small"} onClick={() => setShowRight(!showRight)} title="Panneau d'édition ( ] )">
            {showRight ? "Édition ⟩" : "⟨ Édition"}
          </button>
          <button className="btn small" onClick={() => setFocusMode(true)} title="Plein écran canvas (M)">⤢</button>
        </div>
        {savedAt && <span className="cmd-saved">✓ {savedAt}</span>}
      </nav>
      )}

      <div className="layout">
        {showLeft && !focusMode && (
          <aside className="panel left">
            <div className="panel-title"><span><span className="num">01 /</span> Modèles importés ({slots.length})</span>
              <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button className="btn small primary" onClick={() => addSlot()} title="Ajouter un autre modèle">+ Modèle</button>
                <button className="icon-btn" onClick={() => setShowLeft(false)}>⟨</button>
              </span>
            </div>
            {slots.length === 0 && (
              <>
                <p className="muted">Aucun modèle. Ajoute ton premier schema pour commencer.</p>
                <button className="btn primary full" onClick={() => addSlot()}>+ Ajouter un modèle</button>
              </>
            )}
            {slots.map((slot, i) => {
              const kind = detectKind(slot.source);
              return (
                <div key={slot.id} className={`slot ${slot.collapsed ? "folded" : ""} ${slot.hidden ? "masked" : ""}`}>
                  <div className="slot-head" onClick={() => updateSlot(slot.id, { collapsed: !slot.collapsed })} title="Plier / déplier">
                    <span className="slot-fold">{slot.collapsed ? "▸" : "▾"}</span>
                    <input
                      className="slot-name" value={slot.name}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => updateSlot(slot.id, { name: e.target.value })}
                    />
                    {(slotTableCount.get(slot.id) ?? 0) > 0 && (
                      <span className="slot-count" title="Tables de ce modèle sur le canvas">{slotTableCount.get(slot.id)}</span>
                    )}
                    <span className={`badge ${kind}`}>{kindBadge[kind] ?? kind}</span>
                    <button
                      className="icon-btn"
                      onClick={(e) => { e.stopPropagation(); updateSlot(slot.id, { hidden: !slot.hidden }); }}
                      title={slot.hidden ? "Afficher ce modèle sur le canvas" : "Masquer ce modèle du canvas"}
                    >
                      {slot.hidden ? "Voir" : "Masquer"}
                    </button>
                    <button className="icon-btn danger" onClick={(e) => { e.stopPropagation(); deleteSlot(slot.id); }} title="Retirer ce modèle du panneau">✕</button>
                  </div>
                  {!slot.collapsed && (
                    <>
                      <textarea
                        value={slot.source}
                        onChange={(e) => updateSlot(slot.id, { source: e.target.value, msg: "" })}
                        placeholder="Colle ici ton schema.prisma, ton drizzle schema.ts ou ton CREATE TABLE…"
                        spellCheck={false}
                      />
                      <div className="row">
                        <button className="btn small primary full" onClick={() => mergeImportSlot(slot)} title="Garde les modèles déjà sur la grille et ajoute celui-ci à la suite">
                          ＋ Ajouter {i === 0 ? "" : `#${i + 1}`} ↗
                        </button>
                      </div>
                      {slot.msg && <p className="msg">{slot.msg}</p>}
                      <div className="examples">
                        <span>ex :</span>
                        <button onClick={() => updateSlot(slot.id, { source: EXAMPLE_PRISMA, msg: "" })}>Prisma</button>
                        <button onClick={() => updateSlot(slot.id, { source: EXAMPLE_DRIZZLE, msg: "" })}>Drizzle</button>
                        <button onClick={() => updateSlot(slot.id, { source: EXAMPLE_SQL, msg: "" })}>SQL</button>
                        <button onClick={() => { fileTarget.current = slot.id; textFileRef.current?.click(); }}>Fichier…</button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
            <input ref={textFileRef} type="file" accept=".sql,.prisma,.ts,.txt" hidden onChange={(e) => {
              const f = e.target.files?.[0];
              if (f && fileTarget.current) loadTextIntoSlot(f, fileTarget.current);
              e.target.value = "";
            }} />
            {parseMsg && <p className="msg">{parseMsg}</p>}

            <h4>Modèles de base — 0X /</h4>
            <div className="row">
              <button className="btn small primary full" onClick={() => setShowGallery(true)}>+ Voir les 6 modèles ↗</button>
            </div>

            <h4>Diagnostic +</h4>
            <div className="issues">
              {issues.length === 0 && <div className="issue ok">✓ Aucun problème : PK ok, liens résolus.</div>}
              {issues.slice(0, 8).map((it, i) => (
                <div key={i} className={`issue ${it.level === "err" ? "err" : ""}`}>
                  <span className="tag">{it.level === "err" ? "ERR" : "WARN"}</span>{it.text}
                </div>
              ))}
              {issues.length > 8 && <p className="muted">+ {issues.length - 8} autre(s)…</p>}
            </div>

            <div className="help">
              <p><b>Astuces —</b></p>
              <ul>
                <li>Glisse les tables, <code>molette</code> = zoom vers le curseur, <code>F</code> = cadrer, <code>M</code> = plein écran, <code>Esc</code> = fermer.</li>
                <li><code>Ctrl+Z</code> / <code>Ctrl+Y</code> = annuler / rétablir.</li>
                <li><code>⇄ Relier</code> : clique 2 entités sur le canvas pour les lier.</li>
                <li>Les <code>xxx_id</code> + <code>REFERENCES</code> créent les liens auto.</li>
                <li>Sauvegarde locale automatique.</li>
              </ul>
              <button className="btn small" onClick={() => fileRef.current?.click()}>Importer JSON…</button>
              <button className="btn small" onClick={() => setTour({ active: true, step: 0 })} title="Revoir la visite guidée">? Visite</button>
              <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => {
                const f = e.target.files?.[0]; if (f) loadJSONFile(f); e.target.value = "";
              }} />
            </div>
          </aside>
        )}

        <main className="canvas-wrap" ref={wrapRef}>
          <div className="toolbar">
            <button className="btn small" onClick={() => zoomCentered(cam.z - 0.1)}>−</button>
            <input
              className="zoom-slider" type="range" min={20} max={250} step={5}
              value={Math.round(cam.z * 100)}
              onChange={(e) => zoomCentered(Number(e.target.value) / 100)}
              title="Molette = zoom libre vers le curseur"
            />
            <button className="zoom-pct" onClick={() => zoomCentered(1)} title="Revenir à 100%">
              {Math.round(cam.z * 100)}%
            </button>
            <button className="btn small" onClick={() => zoomCentered(cam.z + 0.1)}>＋</button>
            <span className="zoom-hint" title="Molette = zoom vers le curseur, glisser = déplacer">molette = zoom</span>
            <button className="btn small" onClick={resetCam}>Recentrer</button>
            <button className="btn small" onClick={fitView} title="Touche F">Cadrer [F]</button>
            <button
              id="tour-link-btn"
              className={linkMode ? "btn small primary" : "btn small"}
              onClick={() => { setLinkMode((v) => !v); setLinkFromId(null); }}
              title="Relier 2 entités en cliquant : source puis cible (Echap pour quitter)"
            >
              {linkMode ? "⇄ Liaison… ✓" : "⇄ Relier"}
            </button>
            <button className="btn small primary" onClick={() => setFocusMode((v) => !v)} title="Agrandir / réduire la zone de travail (M)">
              {focusMode ? "⇲ Réduire [M]" : "⤢ Agrandir [M]"}
            </button>
            {!focusMode && (
              <>
                <button className="btn small" onClick={autoLayout}>▦ Auto-layout</button>
                <button className="btn small danger" onClick={newDiagram} title="Tout effacer">⌫</button>
              </>
            )}
            {focusMode && (
              <>
                <span className="sep" />
                <button className="btn small" onClick={() => setShowGallery(true)}>+ Modèles</button>
                <button className="btn small" onClick={() => openExport("sql")}>Exporter ↗</button>
                <button className="btn small" onClick={() => { setFocusMode(false); setShowLeft(true); setShowRight(true); }}>⟨ Panneaux [Esc]</button>
              </>
            )}
          </div>
          {linkMode && (
            <div className="toolbar link-banner">
              <span>
                {(() => {
                  const src = model.tables.find((t) => t.id === linkFromId);
                  return src
                    ? <>Source : <b>{src.name}</b> → clique maintenant l'entité <b>cible</b> (re-clic = annuler)</>
                    : <>Clique l'entité <b>source</b> puis l'entité <b>cible</b> — champs et cardinalités 1,N / 1,1 auto</>;
                })()}
              </span>
              <span style={{ flex: 1 }} />
              <button className="btn small danger" onClick={() => { setLinkMode(false); setLinkFromId(null); }}>Quitter [Esc]</button>
            </div>
          )}
          <div ref={canvasRef} className={`canvas ${linkMode ? "linking" : ""}`} onMouseDown={onCanvasMouseDown} onClick={() => { if (linkMode) setLinkFromId(null); else setSelectedId(null); }}>
            <div className="canvas-bgword">SCHEMA<span>+</span></div>
            <div ref={worldRef} className="world" style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})` }}>
              <svg className="edges" style={{ overflow: "visible" }}>
                {model.relations.map((r) => {
                  const a = byName.get(r.fromTable);
                  const b = byName.get(r.toTable);
                  if (!a || !b) return null;
                  const x1 = a.x + CARD_W, y1 = fieldY(a, r.fromField);
                  const x2 = b.x, y2 = fieldY(b, r.toField);
                  const { a: cardA, b: cardB } = mcdCards(r);
                  return (
                    <g key={r.id} data-rel={r.id} className="edge" onClick={(e) => e.stopPropagation()}>
                      <path d={edgePath(x1, y1, x2, y2)} className="edge-line" />
                      <circle cx={x1} cy={y1} r={4} className="dot from" />
                      <circle cx={x2} cy={y2} r={4} className="dot to" />
                      <text x={x1 + 9} y={y1 - 8} className="edge-label" textAnchor="start">
                        {cardA}
                      </text>
                      <text x={x2 - 9} y={y2 - 8} className="edge-label" textAnchor="end">
                        {cardB}
                      </text>
                    </g>
                  );
                })}
              </svg>

              {model.tables.length === 0 && (
                <div className="empty">
                  <h2>Canvas <span>vide+</span></h2>
                  <p>Colle un schema puis <em>« Générer le MCD »</em>, ou démarre d'un modèle de base tout relié.</p>
                  <div className="row">
                    <button className="btn primary" onClick={() => setShowGallery(true)}>+ Choisir un modèle</button>
                    <button className="btn" onClick={addTable}>＋ Table vide</button>
                  </div>
                </div>
              )}

              {visibleTables.map((t) => {
                const dim = !!q && !matchTable(t);
                const hit = !!q && matchTable(t);
                return (
                  <div key={t.id}
                    className={`table-card ${selectedId === t.id ? "selected" : ""} ${dim ? "dim" : ""} ${hit && q ? "hit" : ""} ${linkMode ? "linkable" : ""} ${linkFromId === t.id ? "link-from" : ""} ${linkMode && linkHoverId === t.id && linkFromId !== t.id ? "link-hover" : ""}`}
                    style={{ left: t.x, top: t.y, width: CARD_W }}
                    onMouseDown={(e) => onCardMouseDown(e, t)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (linkMode) handleLinkClick(t);
                      else setSelectedId(t.id);
                    }}
                    onDoubleClick={() => { if (!linkMode) centerOn(t); }}
                    onMouseEnter={() => { if (linkMode) setLinkHoverId(t.id); }}
                    onMouseLeave={() => { if (linkMode) setLinkHoverId((h) => (h === t.id ? null : h)); }}
                  >
                    <div className="card-head">
                      <span className="card-title">{t.name}</span>
                      <span className="card-count">{t.fields.length}</span>
                    </div>
                    <div className="card-body">
                      {t.fields.map((f) => (
                        <div key={f.id} className="frow">
                          <span className="fname" title={`${f.name} : ${f.type}`}>
                            {f.pk ? <span className="pk-dot">● </span> : ""}{f.fk ? "→ " : ""}{f.name}
                          </span>
                          <span className="ftype">{f.type}</span>
                          <span className="flags">
                            {f.pk && <i className="flag pk">PK</i>}
                            {f.fk && <i className="flag fk">FK</i>}
                            {f.unique && <i className="flag uq">UQ</i>}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {q && (
            <div className="toolbar" style={{ borderTop: "1px solid var(--line)", borderBottom: "none" }}>
              <span>{visibleTables.filter(matchTable).length} résultat(s) visible(s) pour « {query} » — double-clic pour centrer.</span>
              <span style={{ flex: 1 }} />
              {visibleTables.filter(matchTable).slice(0, 6).map((t) => (
                <button key={t.id} className="btn small" onClick={() => centerOn(t)}>{t.name}</button>
              ))}
              <button className="btn small danger" onClick={() => setQuery("")}>✕</button>
            </div>
          )}
        </main>

        {showRight && !focusMode && (
          <aside className="panel right">
            {!selected ? (
              <>
                <div className="panel-title"><span><span className="num">02 /</span> Édition</span>
                  <button className="icon-btn" onClick={() => setShowRight(false)}>⟩</button>
                </div>
                <p className="muted">Clique sur une table du canvas pour la modifier ici.</p>
                <button className="btn full" onClick={addTable}>＋ Ajouter une table</button>
                <h4>Relations ({model.relations.length})</h4>
                <div className="rellist">
                {visibleRelations.map((r) => {
                    const { a, b } = mcdCards(r);
                    return (
                      <div key={r.id} className="rel mcd">
                        <span className="rel-link">{r.fromTable}.{r.fromField} <b>→</b> {r.toTable}.{r.toField}</span>
                        <span className="rel-cards">
                          <select value={a} onChange={(e) => updateCards(r.id, "a", e.target.value)} title={`Cardinalité côté ${r.fromTable}`}>
                            {MCD_CARDS.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <i>—</i>
                          <select value={b} onChange={(e) => updateCards(r.id, "b", e.target.value)} title={`Cardinalité côté ${r.toTable}`}>
                            {MCD_CARDS.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </span>
                        <button className="icon-btn" onClick={() => deleteRelation(r.id)}>✕</button>
                      </div>
                    );
                  })}
                  {model.relations.length === 0 && <p className="muted">Aucune relation. Crée-en une ci-dessous.</p>}
                </div>
                <h4>Relier 2 entités +</h4>
                <RelationForm
                  model={model} form={relForm} setForm={setRelForm} onAdd={addRelation}
                  suggestFrom={suggestFromField} suggestTo={suggestToField}
                />
              </>
            ) : (
              <>
                <div className="panel-title"><span>» {selected.name}</span>
                  <span style={{ display: "flex", gap: 4 }}>
                    <button className="icon-btn" onClick={() => setSelectedId(null)}>✕</button>
                    <button className="icon-btn" onClick={() => setShowRight(false)}>⟩</button>
                  </span>
                </div>
                <label className="lbl">Nom de la table</label>
                <input value={selected.name} onChange={(e) => renameTable(selected.id, e.target.value)} />
                <div className="row">
                  <button className="btn small" onClick={() => addField(selected.id)}>＋ Champ</button>
                  <button className="btn small" onClick={() => duplicateTable(selected.id)}>Dupliquer</button>
                  <button className="btn small danger" onClick={() => deleteTable(selected.id)}>Supprimer</button>
                </div>
                <h4>Champs</h4>
                <div className="fields">
                  {selected.fields.map((f) => (
                    <div key={f.id} className="field-edit">
                      <input className="fname-in" value={f.name} onChange={(e) => updateField(selected.id, f.id, { name: e.target.value })} />
                      <input className="ftype-in" value={f.type} list="types" onChange={(e) => updateField(selected.id, f.id, { type: e.target.value.toUpperCase() })} />
                      <div className="checks">
                        <label><input type="checkbox" checked={!!f.pk} onChange={(e) => updateField(selected.id, f.id, { pk: e.target.checked, nullable: e.target.checked ? false : f.nullable })} /> PK</label>
                        <label><input type="checkbox" checked={!!f.fk} onChange={(e) => updateField(selected.id, f.id, { fk: e.target.checked })} /> FK</label>
                        <label><input type="checkbox" checked={!!f.unique} onChange={(e) => updateField(selected.id, f.id, { unique: e.target.checked })} /> UQ</label>
                        <label><input type="checkbox" checked={f.nullable !== false} onChange={(e) => updateField(selected.id, f.id, { nullable: e.target.checked })} /> NULL</label>
                      </div>
                      <button className="icon-btn danger" onClick={() => deleteField(selected.id, f.id)}>✕</button>
                    </div>
                  ))}
                </div>
                <datalist id="types">{TYPE_SUGGESTIONS.map((t) => <option key={t} value={t} />)}</datalist>
                <h4>Relations de cette table</h4>
                <div className="rellist">
                  {model.relations.filter((r) => r.fromTable === selected.name || r.toTable === selected.name).map((r) => {
                    const { a, b } = mcdCards(r);
                    return (
                      <div key={r.id} className="rel mcd">
                        <span className="rel-link">{r.fromTable}.{r.fromField} <b>→</b> {r.toTable}.{r.toField}</span>
                        <span className="rel-cards">
                          <select value={a} onChange={(e) => updateCards(r.id, "a", e.target.value)} title={`Cardinalité côté ${r.fromTable}`}>
                            {MCD_CARDS.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <i>—</i>
                          <select value={b} onChange={(e) => updateCards(r.id, "b", e.target.value)} title={`Cardinalité côté ${r.toTable}`}>
                            {MCD_CARDS.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </span>
                        <button className="icon-btn" onClick={() => deleteRelation(r.id)}>✕</button>
                      </div>
                    );
                  })}
                </div>
                <h4>Relier à une autre entité +</h4>
                <RelationForm
                  model={model} form={relForm} setForm={setRelForm} onAdd={addRelation}
                  preset={selected.name} suggestFrom={suggestFromField} suggestTo={suggestToField}
                />
              </>
            )}
          </aside>
        )}

        {!showLeft && !focusMode && (
          <button className="edge-tab left" onClick={() => setShowLeft(true)} title="Import ( [ )">⟩</button>
        )}
        {!showRight && !focusMode && (
          <button className="edge-tab right" onClick={() => setShowRight(true)} title="Édition ( ] )">⟨</button>
        )}
      </div>

      {!focusMode && (
      <div className="statusbar">
        <span className="status-msg">{parseMsg || "Prêt — ajoute un modèle, relie ses entités, exporte."}</span>
        <span style={{ flex: 1 }} />
        {selected && <span className="status-sel">▸ {selected.name} · {selected.fields.length} champs</span>}
        <span>⤢ {Math.round(cam.z * 100)}%</span>
        {savedAt && <span>✓ {savedAt}</span>}
      </div>
      )}

      {tour.active && (
        <>
          <div className="tour-bg" />
          <div
            className={`tour-card ${tourPos ? "" : "center"}`}
            style={tourPos ? { top: tourPos.top, left: tourPos.left } : undefined}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="tour-head">
              <span className="tour-step">{tour.step + 1} / {TOUR_STEPS.length}</span>
              <button className="icon-btn" onClick={closeTour} title="Fermer la visite">✕</button>
            </div>
            <h3>{TOUR_STEPS[tour.step].title}</h3>
            <p>{TOUR_STEPS[tour.step].text}</p>
            <div className="row">
              {tour.step > 0 && (
                <button className="btn small" onClick={() => setTour((t) => ({ ...t, step: t.step - 1 }))}>← Retour</button>
              )}
              <span style={{ flex: 1 }} />
              <button className="btn small" onClick={closeTour}>Passer</button>
              {tour.step < TOUR_STEPS.length - 1 ? (
                <button className="btn small primary" onClick={() => setTour((t) => ({ ...t, step: t.step + 1 }))}>Suivant →</button>
              ) : (
                <button className="btn small primary" onClick={closeTour}>C'est parti ↗</button>
              )}
            </div>
          </div>
        </>
      )}

      {exportView && (
        <div className="modal-bg" onClick={() => setExportView(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><strong>EXPORT <span>CANVAS</span></strong>
              <button className="icon-btn" onClick={() => setExportView(null)}>✕ FERMER</button>
            </div>
            <div className="exp-tabs">
              {(["sql", "prisma", "drizzle", "json"] as const).map((v) => (
                <button key={v} className={`exp-tab ${exportView === v ? "active" : ""}`} onClick={() => setExportView(v)}>
                  {v === "drizzle" ? "Drizzle (.ts)" : v === "prisma" ? "Prisma (.prisma)" : v === "json" ? "JSON" : "SQL"}
                </button>
              ))}
              <span className="exp-scope">
                {exportView === "json"
                  ? <>sauvegarde complète · {model.tables.length} tables (modèles masqués inclus)</>
                  : <>{visibleTables.length} table(s) visible(s) · {visibleRelations.length} lien(s) — masque un modèle pour l'exclure</>}
              </span>
            </div>
            <pre>{exportText}</pre>
            <div className="barcode" />
            <div className="row">
              <button className="btn" onClick={() => navigator.clipboard.writeText(exportText)}>Copier</button>
              <button className="btn primary" onClick={() => download(exportFileName, exportText)}>⤓ {exportFileName}</button>
              <span style={{ flex: 1 }} />
              <button className="btn" onClick={exportPNG}>⤓ PNG</button>
              <button className="btn" onClick={() => download(exportFileName.replace(/\.[^.]+$/, "") + ".svg", exportSVGString(), "image/svg+xml")}>SVG</button>
            </div>
          </div>
        </div>
      )}

      {showGallery && (
        <div className="modal-bg" onClick={() => setShowGallery(false)}>
          <div className="modal wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <strong>MODÈLES <span>DE BASE+</span></strong>
              <span className="muted">01—06 · AJOUTER = canvas + panneau gauche · relie à la main ensuite</span>
              <button className="icon-btn" onClick={() => setShowGallery(false)}>✕ FERMER</button>
            </div>
            <div className="lots-grid">
              <div className="lot-card custom">
                <div className="lot-top"><b>+ / PERSO</b><span>{detectKind(customSource) === "unknown" ? "COLLE TON SCHEMA" : detectKind(customSource).toUpperCase() + " DÉTECTÉ"}</span></div>
                <h3>Modèle perso</h3>
                <div className="tagline">+ ton schema → panneau gauche</div>
                <input
                  className="custom-name" placeholder="Nom du modèle… (ex : boutique)"
                  value={customName} onChange={(e) => setCustomName(e.target.value)}
                />
                <textarea
                  className="custom-src" placeholder="Colle ici ton CREATE TABLE / model / pgTable…"
                  value={customSource} onChange={(e) => setCustomSource(e.target.value)} spellCheck={false}
                />
                <p className="desc">Il apparaîtra dans le panneau gauche comme les autres : pliable, ajoutable, exportable.</p>
                <div className="lot-actions">
                  <button className="go" disabled={!customSource.trim()} onClick={addCustomSlot}>+ Ajouter au panneau ↗</button>
                </div>
              </div>
              {STARTERS.map((pack) => {
                const parsed = parseAuto(pack.sql).model;
                return (
                  <div key={pack.id} className="lot-card">
                    <div className="lot-top"><b>{pack.numero} / 06</b><span>{parsed.tables.length} TABLES · {parsed.relations.length} LIENS</span></div>
                    <h3>{pack.titre}</h3>
                    <div className="tagline">+ {pack.tagline}</div>
                    <p className="desc">{pack.description}</p>
                    <div className="tables">{parsed.tables.map((t) => t.name).join(" · ")}</div>
                    <div className="lot-actions">
                      <button className="go" onClick={() => loadStarter(pack)}>+ Ajouter ↗</button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="barcode" />
            <div className="row">
              <span className="muted">Après l'ajout : sélectionne 2 entités sur le canvas et définis leurs cardinalités MCD.</span>
              <span style={{ flex: 1 }} />
              <button className="btn primary" onClick={() => setShowGallery(false)}>Retour au canvas ↗</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type RelFormState = { fromTable: string; fromField: string; toTable: string; toField: string; cardA: string; cardB: string };

function RelationForm({ model, form, setForm, onAdd, preset, suggestFrom, suggestTo }: {
  model: DBModel;
  form: RelFormState;
  setForm: (f: RelFormState) => void;
  onAdd: () => void;
  preset?: string;
  suggestFrom: (src: string, dst: string) => string;
  suggestTo: (dst: string) => string;
}) {
  useEffect(() => {
    if (preset && !form.fromTable) {
      setForm({ ...form, fromTable: preset, fromField: suggestFrom(preset, form.toTable) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);
  const srcFields = model.tables.find((t) => t.name === form.fromTable)?.fields ?? [];
  const dstFields = model.tables.find((t) => t.name === form.toTable)?.fields ?? [];
  const pickSrcTable = (name: string) => setForm({
    ...form, fromTable: name,
    fromField: name ? suggestFrom(name, form.toTable) : "",
  });
  const pickDstTable = (name: string) => setForm({
    ...form, toTable: name,
    toField: name ? suggestTo(name) : "",
    // Re-suggère le champ source qui vise cette entité (xxx_id)
    fromField: form.fromTable ? suggestFrom(form.fromTable, name) : form.fromField,
  });
  return (
    <div className="relform">
      <label className="lbl">Entité source (porteuse du lien)</label>
      <select value={form.fromTable} onChange={(e) => pickSrcTable(e.target.value)}>
        <option value="">— choisir une entité —</option>
        {model.tables.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
      </select>
      <label className="lbl">Champ source</label>
      <select value={form.fromField} onChange={(e) => setForm({ ...form, fromField: e.target.value })}>
        <option value="">— choisir —</option>
        {srcFields.map((f) => <option key={f.id} value={f.name}>{f.name} · {f.type}</option>)}
      </select>
      <label className="lbl">Entité cible</label>
      <select value={form.toTable} onChange={(e) => pickDstTable(e.target.value)}>
        <option value="">— choisir une entité —</option>
        {model.tables.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
      </select>
      <label className="lbl">Champ cible</label>
      <select value={form.toField} onChange={(e) => setForm({ ...form, toField: e.target.value })}>
        <option value="">— choisir —</option>
        {dstFields.map((f) => <option key={f.id} value={f.name}>{f.name} · {f.type}</option>)}
      </select>
      <div className="rel-cards-edit">
        <div>
          <label className="lbl">Côté {form.fromTable || "A"}</label>
          <select value={form.cardA} onChange={(e) => setForm({ ...form, cardA: e.target.value })}>
            {MCD_CARDS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <span className="plus">+</span>
        <div>
          <label className="lbl">Côté {form.toTable || "B"}</label>
          <select value={form.cardB} onChange={(e) => setForm({ ...form, cardB: e.target.value })}>
            {MCD_CARDS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <button className="btn primary full" onClick={onAdd}>
        Lier ({form.cardA} — {form.cardB}) ↗
      </button>
    </div>
  );
}
