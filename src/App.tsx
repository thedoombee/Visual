import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DBLot, DBModel, DBRelation, DBTable } from "./types";
import { LOT_COLORS, MCD_CARDS, mcdCards, uid } from "./types";
import { detectKind, parseAuto } from "./parsers";
import { toDrizzle, toPrisma, toSQL } from "./generators";
import { EXAMPLE_DRIZZLE, EXAMPLE_PRISMA, EXAMPLE_SQL } from "./examples";
import { LOTS, type LotTemplate } from "./templates";

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
    text: "4 mini-fenêtres pour prendre en main : modèles, liaison, lots, exports. Clique Suivant, ou Passer pour explorer seul.",
  },
  {
    target: ".panel.left",
    title: "01 · Tes modèles importés",
    text: "Colle chaque schema (Prisma, Drizzle, SQL) dans son modèle. Plie/déplie au clic sur le bandeau, + Modèle pour en ajouter autant que tu veux, puis ＋ Ajouter pour l'envoyer sur la grille.",
  },
  {
    target: "#tour-link-btn",
    title: "02 · Relie sur la grille",
    text: "Clique ce bouton 🔗 Relier, puis l'entité source et l'entité cible directement sur le canvas. Champs suggérés, cardinalités MCD 1,N — 1,1 posées près de chaque entité.",
  },
  {
    target: "#tour-lots",
    title: "03 · Regroupe en lots",
    text: "Chaque ajout crée son lot coloré : œil pour masquer/afficher, chips pour centrer les tables, export SQL / Prisma / Drizzle du lot seul.",
  },
  {
    target: "#tour-export",
    title: "04 · Exporte tout",
    text: "Onglets SQL / Prisma / Drizzle / JSON sur tout le canvas ou un lot seul, plus SVG et PNG. Bon MCD !",
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
      if (parsed.tables?.length) return { ...parsed, lots: parsed.lots ?? [] };
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
  const [showLots, setShowLots] = useState(false);
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
  const panRef = useRef<null | { sx: number; sy: number; cx: number; cy: number }>(null);
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
  const [exportLotId, setExportLotId] = useState<string | null>(null);
  const [newLotName, setNewLotName] = useState("");

  // ---------- lots utilisateur (plusieurs modèles sur la même grille) ----------
  const lots = useMemo(() => model.lots ?? [], [model]);
  const lotOfTable = useMemo(() => {
    const m = new Map<string, DBLot>();
    for (const lot of lots) for (const id of lot.tableIds) if (!m.has(id)) m.set(id, lot);
    return m;
  }, [lots]);
  const hiddenTableIds = useMemo(() => {
    const s = new Set<string>();
    for (const lot of lots) if (lot.hidden) for (const id of lot.tableIds) s.add(id);
    return s;
  }, [lots]);
  const visibleTables = useMemo(() => model.tables.filter((t) => !hiddenTableIds.has(t.id)), [model, hiddenTableIds]);
  const visibleNames = useMemo(() => new Set(visibleTables.map((t) => t.name)), [visibleTables]);
  const visibleRelations = useMemo(
    () => model.relations.filter((r) => visibleNames.has(r.fromTable) && visibleNames.has(r.toTable)),
    [model, visibleNames]
  );

  const createLot = useCallback((name: string, tableIds: string[] = []) => {
    const clean = name.trim() || `Lot ${lots.length + 1}`;
    const lot: DBLot = {
      id: uid("lot"),
      name: clean,
      color: LOT_COLORS[lots.length % LOT_COLORS.length],
      tableIds: [...new Set(tableIds)],
    };
    apply((m) => {
      const prevLots = m.lots ?? [];
      // 1 table = 1 lot max : on retire les tables des autres lots
      const others = prevLots.map((l) => ({ ...l, tableIds: l.tableIds.filter((id) => !lot.tableIds.includes(id)) }));
      return { ...m, lots: [...others, lot] };
    });
    setNewLotName("");
    return lot.id;
  }, [apply, lots.length]);

  const renameLot = useCallback((id: string, name: string) => {
    apply((m) => ({ ...m, lots: (m.lots ?? []).map((l) => (l.id === id ? { ...l, name } : l)) }));
  }, [apply]);

  const deleteLot = useCallback((id: string, deleteTables: boolean) => {
    apply((m) => {
      const lot = (m.lots ?? []).find((l) => l.id === id);
      if (!lot) return m;
      if (!deleteTables) return { ...m, lots: (m.lots ?? []).filter((l) => l.id !== id) };
      const gone = new Set(lot.tableIds);
      const goneNames = new Set(m.tables.filter((t) => gone.has(t.id)).map((t) => t.name));
      if (selectedId && gone.has(selectedId)) setSelectedId(null);
      return {
        tables: m.tables.filter((t) => !gone.has(t.id)),
        relations: m.relations.filter((r) => !goneNames.has(r.fromTable) && !goneNames.has(r.toTable)),
        lots: (m.lots ?? []).filter((l) => l.id !== id).map((l) => ({ ...l, tableIds: l.tableIds.filter((x) => !gone.has(x)) })),
      };
    });
  }, [apply, selectedId]);

  const toggleLotHidden = useCallback((id: string) => {
    apply((m) => ({ ...m, lots: (m.lots ?? []).map((l) => (l.id === id ? { ...l, hidden: !l.hidden } : l)) }));
  }, [apply]);

  const setTableLot = useCallback((tableId: string, lotId: string | null) => {
    apply((m) => ({
      ...m,
      lots: (m.lots ?? []).map((l) => ({
        ...l,
        tableIds: lotId === l.id
          ? (l.tableIds.includes(tableId) ? l.tableIds : [...l.tableIds, tableId])
          : l.tableIds.filter((x) => x !== tableId),
      })),
    }));
  }, [apply]);

  const openExport = useCallback((view: "sql" | "prisma" | "drizzle" | "json", lotId: string | null = null) => {
    setExportLotId(lotId);
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
    const n = slots.length + 1;
    setSlots((ss) => [...ss.map((s) => ({ ...s, collapsed: true })), {
      id: uid("slot"), name: name?.trim() || `Modèle ${n}`, source: source ?? "", collapsed: false, msg: "",
    }]);
  }, [slots.length]);
  // Formulaire "modèle perso" de la galerie : crée un vrai slot du panneau gauche.
  const [customName, setCustomName] = useState("");
  const [customSource, setCustomSource] = useState("");
  const addCustomSlot = useCallback(() => {
    if (!customSource.trim()) return;
    addSlot(customName || undefined, customSource);
    setCustomName("");
    setCustomSource("");
    setShowLots(false);
    setShowLeft(true);
    setParseMsg("Modèle perso ajouté au panneau gauche : plie/déplie, puis ＋ Ajouter.");
  }, [customName, customSource, addSlot]);
  const deleteSlot = useCallback((id: string) => {
    setSlots((ss) => ss.filter((s) => s.id !== id));
  }, []);

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
      if (typing) return;
      if (e.key === "[") setShowLeft((v) => !v);
      else if (e.key === "]") setShowRight((v) => !v);
      else if (e.key.toLowerCase() === "f") fitView();
      else if (e.key.toLowerCase() === "m") setFocusMode((v) => !v);
      else if (e.key === "Escape") {
        if (linkModeRef.current) { setLinkMode(false); setLinkFromId(null); }
        else setFocusMode(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo, redo, model]);

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
  // Sert autant pour "ajouter un import" que pour charger un lot de base.
  // Retourne les ids des tables ajoutées (pour créer un lot utilisateur).
  const mergeParsed = useCallback((parsed: DBModel): string[] => {
    const existing = new Set(model.tables.map((t) => t.name));
    const rename = new Map<string, string>();
    const incoming: DBModel = {
      tables: parsed.tables.map((t) => ({ ...t, id: uid("t"), fields: t.fields.map((f) => ({ ...f, id: uid("f") })) })),
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

  // Remplace tout le canvas par CE modèle.
  const doImportSlot = useCallback((slot: ImportSlot) => {
    const { model: m, kind: k } = parseAuto(slot.source);
    if (!m.tables.length) {
      updateSlot(slot.id, { msg: "Aucune table détectée. Vérifie ton schema (CREATE TABLE / model / pgTable)." });
      return;
    }
    apply({ ...m, lots: [] });
    setSelectedId(m.tables[0]?.id ?? null);
    updateSlot(slot.id, { msg: `${m.tables.length} table(s) • ${m.relations.length} relation(s) [${k}].` });
    setParseMsg(`« ${slot.name} » chargé sur le canvas.`);
    fitViewSoon();
  }, [apply, updateSlot]);

  // Ajoute CE modèle au canvas sans effacer ceux déjà présents,
  // puis regroupe ses tables dans un lot au nom du modèle.
  const mergeImportSlot = useCallback((slot: ImportSlot) => {
    const { model: m, kind: k } = parseAuto(slot.source);
    if (!m.tables.length) {
      updateSlot(slot.id, { msg: "Aucune table détectée. Vérifie ton schema (CREATE TABLE / model / pgTable)." });
      return;
    }
    const ids = mergeParsed(m);
    createLot(`${slot.name} · ${m.tables.length} tables`, ids);
    setSelectedId(ids[0] ?? null);
    updateSlot(slot.id, { msg: `+ ${m.tables.length} table(s) ajoutée(s) [${k}] → lot « ${slot.name} ».` });
    setParseMsg(`« ${slot.name} » ajouté : relie ses entités à la main avec leurs cardinalités MCD.`);
    fitViewSoon();
  }, [mergeParsed, createLot, updateSlot]);

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
        lots: (m.lots ?? []).map((l) => ({ ...l, tableIds: l.tableIds.filter((x) => x !== id) })),
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
  }, [relForm, apply]);

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

  // ---------- lots de modèles (base) + lots utilisateur ----------
  const loadLot = useCallback((lot: LotTemplate, mode: "add" | "replace") => {
    const parsed = parseAuto(lot.sql).model;
    const reid = (ms: DBModel): DBModel => ({
      tables: ms.tables.map((t) => ({ ...t, id: uid("t"), fields: t.fields.map((f) => ({ ...f, id: uid("f") })) })),
      relations: ms.relations.map((r) => ({ ...r, id: uid("rel") })),
    });
    if (mode === "replace") {
      if (!confirm(`Remplacer le canvas par le lot « ${lot.titre} » ?`)) return;
      const m = reid(parsed);
      const lotId = uid("lot");
      apply({
        ...m,
        lots: [{
          id: lotId, name: `${lot.numero} · ${lot.titre}`, color: LOT_COLORS[0],
          tableIds: m.tables.map((t) => t.id),
        }],
      });
      setSelectedId(m.tables[0]?.id ?? null);
      setParseMsg(`Lot ${lot.numero} · ${lot.titre} chargé : ${m.tables.length} tables, ${m.relations.length} liens.`);
    } else {
      const ids = mergeParsed(parsed);
      createLot(`${lot.numero} · ${lot.titre}`, ids);
      setSelectedId(ids[0] ?? null);
      setParseMsg(`Lot ${lot.numero} · ${lot.titre} ajouté au canvas : relie ses entités à la main.`);
    }
    setShowLots(false);
    fitViewSoon();
  }, [apply, mergeParsed, createLot]);

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
    if (!model.tables.length) { setCam({ x: 20, y: 20, z: 1 }); return; }
    const el = wrapRef.current;
    const W = el?.clientWidth || 1000;
    const H = el?.clientHeight || 700;
    const minX = Math.min(...model.tables.map((t) => t.x));
    const minY = Math.min(...model.tables.map((t) => t.y));
    const maxX = Math.max(...model.tables.map((t) => t.x + CARD_W));
    const maxY = Math.max(...model.tables.map((t) => t.y + cardH(t)));
    const z = Math.min(2.5, Math.max(0.2, Math.min((W - 80) / Math.max(1, maxX - minX), (H - 80) / Math.max(1, maxY - minY))));
    setCam({ x: 40 - minX * z, y: 40 - minY * z, z: +z.toFixed(2) });
  }, [model]);
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
      for (const r of visibleRelations) {
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
    panRef.current = { sx, sy, cx, cy };
    let lx = cx, ly = cy;
    const move = (ev: MouseEvent) => {
      if (!panRef.current) return;
      lx = cx + (ev.clientX - sx);
      ly = cy + (ev.clientY - sy);
      // Déplacement pur compositeur : aucun re-render, aucun repaint du fond.
      world.style.transform = `translate(${lx}px, ${ly}px) scale(${z})`;
    };
    const up = () => {
      panRef.current = null;
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

  // ---------- exports (tout le canvas OU un seul lot) ----------
  const exportLot = useMemo(
    () => (exportLotId ? lots.find((l) => l.id === exportLotId) ?? null : null),
    [exportLotId, lots]
  );
  const exportModel = useMemo(() => {
    if (!exportLot) return model;
    const ids = new Set(exportLot.tableIds);
    const tables = model.tables.filter((t) => ids.has(t.id));
    const names = new Set(tables.map((t) => t.name));
    return {
      ...model,
      tables,
      relations: model.relations.filter((r) => names.has(r.fromTable) && names.has(r.toTable)),
    };
  }, [exportLot, model]);
  const exportText = useMemo(() => {
    if (exportView === "sql") return toSQL(exportModel);
    if (exportView === "prisma") return toPrisma(exportModel);
    if (exportView === "drizzle") return toDrizzle(exportModel);
    if (exportView === "json") return JSON.stringify(exportModel, null, 2);
    return "";
  }, [exportView, exportModel]);
  const exportFileName = useMemo(() => {
    const base = exportLot ? exportLot.name.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "lot" : "mcd";
    if (exportView === "json") return `${base}.json`;
    if (exportView === "drizzle") return `${base}.ts`;
    if (exportView === "prisma") return `${base}.prisma`;
    return `${base}.sql`;
  }, [exportLot, exportView]);

  const download = (filename: string, content: string, mime = "text/plain") => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type: mime }));
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const exportSVGString = useCallback(() => {
    const pad = 60;
    const maxX = Math.max(...model.tables.map((t) => t.x + CARD_W), 800) + pad;
    const maxY = Math.max(...model.tables.map((t) => t.y + cardH(t)), 600) + pad;
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${maxX}" height="${maxY}" font-family="Space Mono,monospace">`;
    s += `<rect width="100%" height="100%" fill="#E9E7E1"/>`;
    for (const r of model.relations) {
      const a = byName.get(r.fromTable);
      const b = byName.get(r.toTable);
      if (!a || !b) continue;
      const x1 = a.x + CARD_W, y1 = fieldY(a, r.fromField);
      const x2 = b.x, y2 = fieldY(b, r.toField);
      const { a: cA, b: cB } = mcdCards(r);
      s += `<path d="${edgePath(x1, y1, x2, y2)}" fill="none" stroke="#111111" stroke-width="2"/>`;
      s += `<circle cx="${x1}" cy="${y1}" r="4" fill="#111111"/><circle cx="${x2}" cy="${y2}" r="4" fill="#FF2B1D"/>`;
      s += `<text x="${x1 + 9}" y="${y1 - 8}" font-size="10" font-weight="700" fill="#111111">${cA}</text>`;
      s += `<text x="${x2 - 9}" y="${y2 - 8}" font-size="10" font-weight="700" fill="#111111" text-anchor="end">${cB}</text>`;
    }
    for (const t of model.tables) {
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
  }, [model, byName]);

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
        a.download = "mcd.png";
        a.click();
      }, "image/png");
    };
    img.src = url;
  }, [exportSVGString]);

  const newDiagram = () => {
    if (!confirm("Tout effacer et repartir de zéro ?")) return;
    apply({ tables: [], relations: [], lots: [] });
    setSelectedId(null);
  };

  const loadJSONFile = (f: File) => {
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const data = JSON.parse(String(rd.result)) as DBModel;
        if (!data.tables) throw new Error("bad");
        apply({ ...data, lots: data.lots ?? [] });
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
      <nav className="micronav">
        <div className="mn-group">
          <button onClick={() => { setShowLeft(true); setShowRight(true); }}>Tables</button>
          <button onClick={() => setShowLots(true)}>Modèles <span className="plus">+</span></button>
          <button onClick={() => setShowLeft(!showLeft)}>Import [</button>
          <button onClick={() => openExport("sql")}>Export</button>
        </div>
        <div className="live"><i />MCD°STUDIO — PAPER / INK / RED <span className="plus">+</span> TICKET Nº001</div>
        <div className="mn-group">
          <button onClick={undo} disabled={!hist.length} title="Ctrl+Z">Undo</button>
          <button onClick={redo} disabled={!future.length} title="Ctrl+Y">Redo</button>
          <button onClick={() => setFocusMode(true)} title="Plein écran canvas (M)">⛶ Agrandir</button>
          <button onClick={() => setShowRight(!showRight)}>Édition ]</button>
        </div>
      </nav>
      )}

      {!focusMode && (
      <header className="hero">
        <div className="hero-row">
          <h1>MCD<span className="red">+</span>STUDIO</h1>
          <div className="hero-cta">
            <button className="btn primary" onClick={() => setShowLots(true)}>+ Modèles (6)</button>
            <button className="btn" onClick={() => openExport("sql")}>Exporter ↗</button>
            <button className="btn" onClick={() => setFocusMode(true)} title="Agrandir la zone de travail (M)">⛶ Plein écran</button>
          </div>
        </div>
        <div className="hero-sub">
          <p>Colle ton <b>Prisma · Drizzle · SQL</b>, génère le diagramme. <em>Dessiné comme une affiche.</em></p>
          <span className="rule" />
          <span className="plus">+</span>
          <p style={{ maxWidth: 300 }}>Charge un modèle de base, ajoute-en un second, puis <b>relie les entités</b> avec leurs <b>cardinalités MCD</b>.</p>
        </div>
      </header>
      )}

      {!focusMode && (
      <div className="statbar">
        <div className="cell"><b>{model.tables.length}</b> TABLES</div>
        <div className="cell"><b className="red">{model.relations.length}</b> LIENS</div>
        <div className="cell"><b>{totalFields}</b> CHAMPS</div>
        <div className="cell"><b className={lots.length ? "red" : ""}>{lots.length}</b> LOTS</div>
        <div className="cell">{issues.length ? <><b className="red">⚠ {issues.length}</b> DIAG</> : <>✓ DIAG OK</>}</div>
        <div className="cell exp-cell" id="tour-export">
          <button className="exp-btn" onClick={() => openExport("sql")} title="Exporter tout en SQL">SQL</button>
          <button className="exp-btn" onClick={() => openExport("prisma")} title="Exporter tout en Prisma">PRISMA</button>
          <button className="exp-btn" onClick={() => openExport("drizzle")} title="Exporter tout en Drizzle">DRIZZLE</button>
        </div>
        <div className="cell spacer" />
        <input className="search" placeholder="Rechercher table / champ…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {savedAt && <div className="cell">✓ {savedAt}</div>}
      </div>
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
                <div key={slot.id} className={`slot ${slot.collapsed ? "folded" : ""}`}>
                  <div className="slot-head" onClick={() => updateSlot(slot.id, { collapsed: !slot.collapsed })} title="Plier / déplier">
                    <span className="slot-fold">{slot.collapsed ? "▸" : "▾"}</span>
                    <input
                      className="slot-name" value={slot.name}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => updateSlot(slot.id, { name: e.target.value })}
                    />
                    <span className={`badge ${kind}`}>{kindBadge[kind] ?? kind}</span>
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
                        <button className="btn small primary" style={{ flex: 1 }} onClick={() => mergeImportSlot(slot)} title="Garde les modèles déjà sur la grille et ajoute celui-ci dans un lot à son nom">
                          ＋ Ajouter {i === 0 ? "" : `#${i + 1}`} ↗
                        </button>
                        <button className="btn small" onClick={() => doImportSlot(slot)} title="Remplace tout le canvas par ce modèle">
                          Remplacer
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
              <button className="btn small primary" onClick={() => setShowLots(true)}>+ Voir les 6 modèles ↗</button>
            </div>

            <h4>Mes lots ({lots.length}) +</h4>
            <p className="muted" style={{ margin: 0 }}>Chaque import ajouté crée son lot. Plusieurs modèles cohabitent sur la même grille.</p>
            <div className="row">
              <input
                placeholder="Nom du lot… (ex : boutique, blog)"
                value={newLotName}
                onChange={(e) => setNewLotName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") createLot(newLotName); }}
                style={{ flex: 1, minWidth: 0 }}
              />
              <button className="btn small primary" onClick={() => createLot(newLotName)}>+ Créer</button>
            </div>
            <div className="mylots" id="tour-lots">
              {lots.length === 0 && <p className="muted">Aucun lot. Ajoute un import ou crée un lot puis assigne-lui des tables.</p>}
              {lots.map((lot) => (
                <div key={lot.id} className={`mylot ${lot.hidden ? "hidden" : ""}`}>
                  <div className="mylot-head">
                    <span className="lot-dot" style={{ background: lot.color }} />
                    <input className="mylot-name" value={lot.name} onChange={(e) => renameLot(lot.id, e.target.value)} />
                    <span className="mylot-count">{lot.tableIds.length}</span>
                    <button className="icon-btn" onClick={() => toggleLotHidden(lot.id)} title={lot.hidden ? "Afficher le lot" : "Masquer le lot"}>
                      {lot.hidden ? "◌" : "◉"}
                    </button>
                  </div>
                  <div className="mylot-tables">
                    {lot.tableIds.length === 0 && <span className="muted">— vide —</span>}
                    {lot.tableIds.map((id) => {
                      const t = model.tables.find((x) => x.id === id);
                      if (!t) return null;
                      return (
                        <span key={id} className="mylot-chip" onClick={() => centerOn(t)} title="Centrer">
                          {t.name}
                          <button className="icon-btn" onClick={(e) => { e.stopPropagation(); setTableLot(id, null); }} title="Retirer du lot">✕</button>
                        </span>
                      );
                    })}
                  </div>
                  <div className="mylot-actions">
                    <button className="btn small" disabled={!selected} onClick={() => selected && setTableLot(selected.id, lot.id)} title="Ajouter la table sélectionnée à ce lot">
                      + table sélect.
                    </button>
                    <span className="exp-group" title="Exporter ce lot seul">
                      <button className="btn small" onClick={() => openExport("sql", lot.id)}>SQL</button>
                      <button className="btn small" onClick={() => openExport("prisma", lot.id)}>Prisma</button>
                      <button className="btn small" onClick={() => openExport("drizzle", lot.id)}>Drizzle</button>
                    </span>
                    <button className="icon-btn danger" onClick={() => { if (confirm(`Supprimer le lot « ${lot.name} » et SES ${lot.tableIds.length} TABLES ?`)) deleteLot(lot.id, true); }} title="Supprimer le lot ET ses tables">⌫</button>
                    <button className="icon-btn" onClick={() => deleteLot(lot.id, false)} title="Dissoudre le lot (garde les tables)">✕ lot</button>
                  </div>
                </div>
              ))}
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
                <li>Glisse les tables, <code>molette</code> = zoom vers le curseur, <code>F</code> = cadrer, <code>M</code> = plein écran.</li>
                <li><code>Ctrl+Z</code> / <code>Ctrl+Y</code> = annuler / rétablir.</li>
                <li><code>🔗 Relier</code> : clique 2 entités sur le canvas pour les lier.</li>
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
              {linkMode ? "🔗 Liaison… ✓" : "🔗 Relier"}
            </button>
            <button className="btn small primary" onClick={() => setFocusMode((v) => !v)} title="Agrandir / réduire la zone de travail (M)">
              {focusMode ? "⇲ Réduire [M]" : "⛶ Agrandir [M]"}
            </button>
            {!focusMode && (
              <>
                <button className="btn small" onClick={autoLayout}>▦ Auto-layout</button>
                <span className="sep" />
                <button className="btn small" onClick={undo} disabled={!hist.length}>↩ Undo</button>
                <button className="btn small" onClick={redo} disabled={!future.length}>↪ Redo</button>
                <button className="btn small danger" onClick={newDiagram} title="Tout effacer">⌫</button>
                <span className="sep" />
                <button className={showLeft ? "btn small active" : "btn small"} onClick={() => setShowLeft(!showLeft)}>
                  {showLeft ? "⟨ Import" : "Import ⟩"}
                </button>
                <button className={showRight ? "btn small active" : "btn small"} onClick={() => setShowRight(!showRight)}>
                  {showRight ? "Édition ⟩" : "⟨ Édition"}
                </button>
              </>
            )}
            {focusMode && (
              <>
                <span className="sep" />
                <button className="btn small" onClick={() => setShowLots(true)}>+ Modèles</button>
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
                {visibleRelations.map((r) => {
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
                    <button className="btn primary" onClick={() => setShowLots(true)}>+ Choisir un modèle</button>
                    <button className="btn" onClick={addTable}>＋ Table vide</button>
                  </div>
                </div>
              )}

              {visibleTables.map((t) => {
                const dim = !!q && !matchTable(t);
                const hit = !!q && matchTable(t);
                const lot = lotOfTable.get(t.id);
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
                      {lot && <span className="lot-dot" style={{ background: lot.color }} title={`Lot : ${lot.name}`} />}
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
              <span>{model.tables.filter(matchTable).length} résultat(s) pour « {query} » — double-clic pour centrer.</span>
              <span style={{ flex: 1 }} />
              {model.tables.filter(matchTable).slice(0, 6).map((t) => (
                <button key={t.id} className="btn small" onClick={() => centerOn(t)}>{t.name}</button>
              ))}
              <button className="btn small primary" onClick={() => {
                const ids = model.tables.filter(matchTable).map((t) => t.id);
                createLot(query.trim(), ids);
              }}>＋ Lot depuis recherche</button>
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
                  {model.relations.map((r) => {
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
                <div className="panel-title"><span>✎ {selected.name}</span>
                  <span style={{ display: "flex", gap: 4 }}>
                    <button className="icon-btn" onClick={() => setSelectedId(null)}>✕</button>
                    <button className="icon-btn" onClick={() => setShowRight(false)}>⟩</button>
                  </span>
                </div>
                <label className="lbl">Nom de la table</label>
                <input value={selected.name} onChange={(e) => renameTable(selected.id, e.target.value)} />
                <label className="lbl">Lot</label>
                <select
                  value={lotOfTable.get(selected.id)?.id ?? ""}
                  onChange={(e) => setTableLot(selected.id, e.target.value || null)}
                >
                  <option value="">— aucun lot —</option>
                  {lots.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.tableIds.length})</option>)}
                </select>
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
      <div className="footer-note">
        <span>O tur по Японии — non : MCD°STUDIO — About / Lots / Import / Export</span>
        <span>+ Relie les entités à la main : cardinalités 0,1 / 1,1 / 0,N / 1,N +</span>
        <span>TG : @mcd_studio — Ticket 001/006</span>
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
        <div className="modal-bg" onClick={() => { setExportView(null); setExportLotId(null); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><strong>EXPORT <span>{exportLot ? exportLot.name.toUpperCase().slice(0, 18) : "CANVAS"}</span></strong>
              <button className="icon-btn" onClick={() => { setExportView(null); setExportLotId(null); }}>✕ FERMER</button>
            </div>
            <div className="exp-tabs">
              {(["sql", "prisma", "drizzle", "json"] as const).map((v) => (
                <button key={v} className={`exp-tab ${exportView === v ? "active" : ""}`} onClick={() => setExportView(v)}>
                  {v === "drizzle" ? "Drizzle (.ts)" : v === "prisma" ? "Prisma (.prisma)" : v === "json" ? "JSON" : "SQL"}
                </button>
              ))}
              <span className="exp-scope">
                {exportLot
                  ? <>lot « {exportLot.name} » · {exportModel.tables.length} tables <button className="icon-btn" onClick={() => setExportLotId(null)} title="Exporter tout le canvas">tout ✕</button></>
                  : <>tout le canvas · {exportModel.tables.length} tables{ lots.length > 0 && <> · <span className="muted">ou exporte un lot depuis « Mes lots »</span></>}</>}
              </span>
            </div>
            <pre>{exportText}</pre>
            <div className="barcode" />
            <div className="row">
              <button className="btn" onClick={() => navigator.clipboard.writeText(exportText)}>⧉ Copier</button>
              <button className="btn primary" onClick={() => download(exportFileName, exportText)}>⤓ {exportFileName}</button>
              <span style={{ flex: 1 }} />
              <button className="btn" onClick={exportPNG}>⤓ PNG</button>
              <button className="btn" onClick={() => download("mcd.svg", exportSVGString(), "image/svg+xml")}>SVG</button>
            </div>
          </div>
        </div>
      )}

      {showLots && (
        <div className="modal-bg" onClick={() => setShowLots(false)}>
          <div className="modal wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <strong>MODÈLES <span>DE BASE+</span></strong>
              <span className="muted">01—06 · ADD = ajoute · REPLACE = remplace · relie à la main ensuite</span>
              <button className="icon-btn" onClick={() => setShowLots(false)}>✕ FERMER</button>
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
              {LOTS.map((lot) => {
                const parsed = parseAuto(lot.sql).model;
                return (
                  <div key={lot.id} className="lot-card">
                    <div className="lot-top"><b>{lot.numero} / 06</b><span>{parsed.tables.length} TABLES · {parsed.relations.length} LIENS</span></div>
                    <h3>{lot.titre}</h3>
                    <div className="tagline">+ {lot.tagline}</div>
                    <p className="desc">{lot.description}</p>
                    <div className="tables">{parsed.tables.map((t) => t.name).join(" · ")}</div>
                    <div className="lot-actions">
                      <button onClick={() => loadLot(lot, "add")}>+ Ajouter</button>
                      <button className="go" onClick={() => loadLot(lot, "replace")}>Remplacer ↗</button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="barcode" />
            <div className="row">
              <span className="muted">Après l'ajout : sélectionne 2 entités sur le canvas et définis leurs cardinalités MCD.</span>
              <span style={{ flex: 1 }} />
              <button className="btn primary" onClick={() => setShowLots(false)}>Retour au canvas ↗</button>
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
