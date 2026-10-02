import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { DBModel, DBRelation, DBTable, ImportSlot } from "./types";
import { uid } from "./types";
import { parseAuto } from "./parsers";
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

// Liste complète des types de champs (Postgres-first) : on choisit, on n'écrit plus.
const FIELD_TYPE_GROUPS: { label: string; types: string[] }[] = [
  { label: "Identifiants auto", types: ["SERIAL", "BIGSERIAL", "SMALLSERIAL"] },
  { label: "Entiers", types: ["SMALLINT", "INTEGER", "BIGINT"] },
  {
    label: "Nombres",
    types: ["DECIMAL", "NUMERIC", "REAL", "FLOAT", "DOUBLE PRECISION", "MONEY"],
  },
  {
    label: "Texte",
    types: ["CHAR(1)", "VARCHAR(50)", "VARCHAR(100)", "VARCHAR(255)", "TEXT", "CITEXT"],
  },
  { label: "Booléen", types: ["BOOLEAN"] },
  {
    label: "Dates & heures",
    types: ["DATE", "TIME", "TIMESTAMP", "TIMESTAMPTZ", "INTERVAL"],
  },
  { label: "UUID", types: ["UUID"] },
  { label: "Réseau", types: ["INET", "CIDR", "MACADDR"] },
  { label: "JSON", types: ["JSON", "JSONB"] },
  { label: "Binaire", types: ["BYTEA"] },
];
const ALL_FIELD_TYPES = new Set(FIELD_TYPE_GROUPS.flatMap((g) => g.types));

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
function initialModelForSlots(slots: ImportSlot[]): DBModel {
  try {
    const raw = localStorage.getItem(STORE_KEY) ?? localStorage.getItem("mcd-studio-v1");
    if (raw) {
      const parsed = JSON.parse(raw) as DBModel;
      if (parsed.tables?.length) {
        // Migration : les anciens modèles sauvegardés peuvent contenir des lots, ignorés.
        const clean: DBModel & { lots?: unknown } = { ...parsed };
        delete clean.lots;
        // Migration : les tables du modèle par défaut (pré-suivi par slot) n'ont
        // pas de slotId, donc Masquer / compteur / suppression les ignoraient.
        // On rattache les tables orphelines au slot dont le source les contient.
        const attached = new Set(
          clean.tables.map((t) => t.slotId).filter((x): x is string => !!x)
        );
        if (clean.tables.some((t) => !t.slotId)) {
          for (const s of slots) {
            if (attached.has(s.id) || !s.source.trim()) continue;
            let names: Set<string>;
            try {
              names = new Set(parseAuto(s.source).model.tables.map((t) => t.name));
            } catch { continue; }
            if (!clean.tables.some((t) => !t.slotId && names.has(t.name))) continue;
            clean.tables = clean.tables.map((t) =>
              !t.slotId && names.has(t.name) ? { ...t, slotId: s.id } : t
            );
          }
        }
        return clean;
      }
    }
  } catch { /* ignore */ }
  const m = parseAuto(EXAMPLE_SQL).model;
  // Premier lancement : les tables d'exemple appartiennent au « Modèle 1 »,
  // sinon Masquer / compteur / ✕ ne les voient jamais.
  const firstId = slots[0]?.id;
  if (firstId) m.tables = m.tables.map((t) => ({ ...t, slotId: firstId }));
  return m;
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
// Snapshot d'historique : le workspace COMPLET (grille + panneau), pour que
// Ctrl+Z après suppression d'un modèle restaure ses tables ET son slot.
interface WorkspaceSnap { model: DBModel; slots: ImportSlot[] }
const SLOTS_KEY = "mcd-studio-slots-v1";
// Cache module : les deux `useState` init (slots PUIS modèle) doivent voir la
// MÊME instance — sinon le slot « Modèle 1 » et les tables d'exemple auraient
// des ids différents et la suppression/masquage raterait sa cible.
let slotsInitCache: ImportSlot[] | null = null;
function loadSlots(): ImportSlot[] {
  if (slotsInitCache) return slotsInitCache;
  try {
    const raw = localStorage.getItem(SLOTS_KEY);
    if (raw) {
      const arr = JSON.parse(raw) as ImportSlot[];
      if (Array.isArray(arr) && arr.length) {
        slotsInitCache = arr;
        return arr;
      }
    }
  } catch { /* ignore */ }
  slotsInitCache = [{ id: uid("slot"), name: "Modèle 1", source: EXAMPLE_SQL, collapsed: false, msg: "" }];
  return slotsInitCache;
}

export default function App() {
  // Modèles importés : autant que tu veux, chacun pliable/dépliable,
  // chacun avec son propre texte + message. Persistés en local.
  // Déclarés AVANT le modèle : les tables d'exemple sont rattachées au slot 1
  // (on réutilise la même instance de slots, sinon les ids divergeraient).
  const [slots, setSlots] = useState<ImportSlot[]>(() => loadSlots());
  const [model, setModel] = useState<DBModel>(() => initialModelForSlots(loadSlots()));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showLeft, setShowLeft] = useState(true);
  const [showRight, setShowRight] = useState(true);
  const [parseMsg, setParseMsg] = useState("");
  const [cam, setCam] = useState({ x: 20, y: 20, z: 1 });
  const [focusMode, setFocusMode] = useState(false);
  const [exportView, setExportView] = useState<null | "sql" | "prisma" | "drizzle" | "json">(null);
  const [showGallery, setShowGallery] = useState(false);
  const [savedAt, setSavedAt] = useState("");
  const [query, setQuery] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const textFileRef = useRef<HTMLInputElement>(null);
  // Repeinture live des liens pendant un drag : accès direct au nœud monde.
  const worldRef = useRef<HTMLDivElement | null>(null);

  // ---------- history (undo / redo) ----------
  // Snapshots du workspace complet (grille + panneau). Tout est calculé AVANT
  // les setState (pas d'effet dans les updaters — cf. StrictMode).
  const [hist, setHist] = useState<WorkspaceSnap[]>([]);
  const [future, setFuture] = useState<WorkspaceSnap[]>([]);
  const apply = useCallback((next: DBModel | ((m: DBModel) => DBModel)) => {
    const n = typeof next === "function" ? (next as (m: DBModel) => DBModel)(model) : next;
    const snap: WorkspaceSnap = { model, slots };
    setHist((h) => [...h.slice(-49), snap]);
    setModel(n);
    setFuture([]);
  }, [model, slots]);
  const undo = useCallback(() => {
    if (!hist.length) return;
    const prev = hist[hist.length - 1];
    setFuture((f) => [{ model, slots }, ...f].slice(0, 50));
    setHist(hist.slice(0, -1));
    setModel(prev.model);
    setSlots(prev.slots);
  }, [hist, model, slots]);
  const redo = useCallback(() => {
    if (!future.length) return;
    const [next, ...rest] = future;
    setHist((h) => [...h.slice(-49), { model, slots }]);
    setFuture(rest);
    setModel(next.model);
    setSlots(next.slots);
  }, [future, model, slots]);

  const selected = useMemo(
    () => model.tables.find((t) => t.id === selectedId) ?? null,
    [model, selectedId]
  );
  const byName = useMemo(() => new Map(model.tables.map((t) => [t.name, t])), [model]);
  // Visibilité par modèle : voir `domain/model.ts` (sélecteurs purs).
  const hiddenSlotIds = useMemo(() => hiddenSlotIdsOf(slots), [slots]);
  const visibleTables = useMemo(
    () => visibleTablesOf(model, hiddenSlotIds),
    [model, hiddenSlotIds]
  );
  const visibleRelations = useMemo(
    () => visibleRelationsOf(model, visibleTables),
    [model, visibleTables]
  );
  const slotTableCount = useMemo(() => slotTableCounts(model), [model]);

  const openExport = useCallback((view: "sql" | "prisma" | "drizzle" | "json") => {
    setExportView(view);
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      const saved = saveModel(model);
      if (saved) setSavedAt(saved);
    }, 400);
    return () => clearTimeout(id);
  }, [model]);

  // Persistance des slots d'import (textes + plié/déplié)
  useEffect(() => {
    saveSlots(slots);
  }, [slots]);

  // Visite guidée (état + positionnement + persistance "vue").
  const { tour, tourPos, openTour, closeTour, stepTour } = useTour();

  const updateSlot = useCallback((id: string, patch: Partial<ImportSlot>) => {
    setSlots((ss) => ss.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, [setSlots]);
  // Ajout structurel (avec pas d'historique) : un Ctrl+Z retire le slot créé.
  const addSlot = useCallback((name?: string, source?: string) => {
    const id = uid("slot");
    const n = slots.length + 1;
    const slot: ImportSlot = {
      id, name: name?.trim() || `Modèle ${n}`, source: source ?? "", collapsed: false, msg: "",
    };
    applyWorkspace((w) => ({ ...w, slots: [...w.slots.map((s) => ({ ...s, collapsed: true })), slot] }));
    return id;
  }, [applyWorkspace, slots.length]);
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
  // ✕ d'un slot : supprime le modèle du panneau ET ses tables de la grille
  // (avec leurs liens). Annulable via Ctrl+Z. Les tables créées à la main
  // (sans slotId) ne sont jamais touchées — sauf rattrapage legacy ci-dessous.
  const deleteSlot = useCallback((id: string) => {
    // Cas nominal : tables taguées avec ce slotId.
    const tagged = model.tables.filter((t) => t.slotId === id);
    let doomedNames = new Set(tagged.map((t) => t.name));
    let killUntagged: Set<string> | null = null;
    if (!tagged.length) {
      // Rattrapage legacy : modèle par défaut importé avant le suivi par slot
      // (tables sans slotId). On ne supprime que les tables dont le nom figure
      // dans le source du slot — jamais les créations manuelles.
      const slot = slots.find((s) => s.id === id);
      if (slot?.source.trim()) {
        try {
          const names = new Set(parseAuto(slot.source).model.tables.map((t) => t.name));
          const orphans = model.tables.filter((t) => !t.slotId && names.has(t.name));
          if (orphans.length) {
            killUntagged = names;
            doomedNames = new Set(orphans.map((t) => t.name));
          }
        } catch { /* source illisible : on retire juste le panneau */ }
      }
    }
    setSlots((ss) => ss.filter((s) => s.id !== id));
    if (doomedNames.size) {
      const names = doomedNames;
      const untagged = killUntagged;
      apply((m) => ({
        tables: m.tables.filter(
          (t) => !(t.slotId === id || (untagged && !t.slotId && untagged.has(t.name)))
        ),
        relations: m.relations.filter(
          (r) => !names.has(r.fromTable) && !names.has(r.toTable)
        ),
      }));
      setSelectedId(null);
      setParseMsg("Modèle supprimé de la grille (Ctrl+Z pour annuler).");
    } else if (model.tables.length) {
      // Sécurité : on ne supprime jamais à l'aveugle. Si aucune table n'est
      // rattachée au slot (source modifiée sans ré-ajout, état legacy…),
      // on le dit explicitement, avec les noms, au lieu de laisser croire
      // que la grille a été nettoyée.
      const orphans = model.tables.filter((t) => !t.slotId).map((t) => t.name);
      const detail = orphans.length
        ? ` Tables sans modèle sur la grille : ${orphans.slice(0, 8).join(", ")}${orphans.length > 8 ? "…" : ""}.`
        : " Toutes les tables de la grille appartiennent à d'autres modèles.";
      setParseMsg(`Panneau retiré, grille inchangée : aucune table rattachée à ce modèle.${detail}`);
    }
  }, [apply, model, slots]);

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
      else if (e.key.toLowerCase() === "f") camera.fitView();
      else if (e.key.toLowerCase() === "m") setFocusMode((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo, redo, model, exportView, showGallery]);

  // ---------- validation ----------
  const issues = useMemo(() => validateModel(model), [model]);

  // ---------- camera ----------
  const camera = useCamera(visibleTables.length ? visibleTables : model.tables);
  // Le drag repeint aussi les liens en direct : on branche les deux refs monde.
  const attachWorldNode = (el: HTMLDivElement | null) => {
    camera.attachWorld(el);
    worldRef.current = el;
  };
  // Cadrage + sélection (double-clic carte, résultats de recherche).
  const centerOn = (t: DBTable) => {
    camera.centerOn(t);
    setSelectedId(t.id);
  };

  const q = query.trim().toLowerCase();
  const matchTable = useCallback((t: DBTable) => {
    if (!q) return true;
    return t.name.toLowerCase().includes(q) || t.fields.some((f) => f.name.toLowerCase().includes(q) || f.type.toLowerCase().includes(q));
  }, [q]);

  // ---------- import ----------
  // Ajout générique : parse un schema et l'ajoute à droite du canvas.
  // Chaque table importée est taguée avec le slot d'origine (visibilité par modèle).
  // Retourne les ids des tables ajoutées.
  const mergeParsed = useCallback((parsed: DBModel, slotId?: string): string[] => {
    const { model: merged, ids } = mergeModel(model, parsed, slotId);
    apply(merged);
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
    camera.fitViewSoon();
  }, [mergeParsed, updateSlot, camera]);

  // ---------- tables ----------
  const addTable = useCallback(() => {
    const t = createTable(model.tables);
    apply((m) => insertTable(m, t));
    setSelectedId(t.id);
  }, [model, apply]);

  const duplicateTable = useCallback((id: string) => {
    const copy = duplicateTableOf(model.tables, id);
    if (!copy) return;
    apply((m) => insertTable(m, copy));
  }, [apply, model]);

  const deleteTable = useCallback((id: string) => {
    apply((m) => removeTable(m, id));
    setSelectedId(null);
  }, [apply]);

  const renameTable = useCallback((id: string, name: string) => {
    const clean = name.trim();
    if (!clean) {
      setParseMsg("Nom de table vide : renommage ignoré.");
      return;
    }
    const clash = model.tables.some((t) => t.id !== id && t.name === clean);
    if (clash) {
      setParseMsg(`Nom déjà pris : « ${clean} » existe déjà. Les noms de tables doivent être uniques (sinon les liens se trompent de table).`);
      return;
    }
    apply((m) => renameTableIn(m, id, clean));
  }, [apply, model]);

  const moveTable = useCallback((id: string, x: number, y: number) => {
    setModel((m) => moveTableIn(m, id, x, y));
  }, [setModel]);

  // Drag & pan : pendant le geste on écrit le transform DIRECTEMENT dans le DOM
  // (zéro re-render React) puis on committe UNE fois au relâcher.
  // C'est ce qui rend le déplacement instantané même avec beaucoup de tables.

  // ---------- fields ----------
  const updateField = useCallback((tableId: string, fieldId: string, patch: Partial<DBTable["fields"][number]>) => {
    apply((m) => updateFieldIn(m, tableId, fieldId, patch));
  }, [apply]);

  const addField = useCallback((tableId: string) => {
    apply((m) => addFieldTo(m, tableId));
  }, [apply]);

  const deleteField = useCallback((tableId: string, fieldId: string) => {
    apply((m) => deleteFieldFrom(m, tableId, fieldId));
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
  const suggestFromField = useCallback(
    (srcName: string, dstName: string): string => suggestFromFieldOf(model.tables, srcName, dstName),
    [model]
  );
  const suggestToField = useCallback(
    (dstName: string): string => suggestToFieldOf(model.tables, dstName),
    [model]
  );

  const addRelation = useCallback(() => {
    const { fromTable, fromField, toTable, toField, cardA, cardB } = relForm;
    if (!fromTable || !fromField || !toTable || !toField) return;
    if (isDuplicateRelation(model.relations, fromTable, fromField, toTable, toField)) {
      setParseMsg(`Lien déjà existant : ${fromTable}.${fromField} → ${toTable}.${toField}.`);
      return;
    }
    const rel: DBRelation = {
      id: uid("rel"), fromTable, fromField, toTable, toField, fromCard: cardA, toCard: cardB,
    };
    apply((m) => addRelationTo(m, rel));
    setRelForm((f) => ({ ...f, fromField: "", toField: "" }));
  }, [relForm, apply, model]);

  const deleteRelation = useCallback((id: string) => {
    apply((m) => removeRelation(m, id));
  }, [apply]);

  const updateCards = useCallback((id: string, side: "a" | "b", value: string) => {
    apply((m) => updateRelationCards(m, id, side, value));
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
    const dup = isDuplicateRelation(
      model.relations, rel.fromTable, rel.fromField, rel.toTable, rel.toField
    );
    if (dup) {
      setParseMsg(`Lien déjà existant : ${rel.fromTable}.${rel.fromField} → ${rel.toTable}.${rel.toField}. Choisis d'autres champs ou modifie-le dans Édition.`);
      setLinkFromId(null);
      return;
    }
    apply((m) => addRelationTo(m, rel));
    setParseMsg(`Lié : ${src.name}.${fromField} (1,N) — ${t.name}.${toField} (1,1). Modifie les cardinalités dans Édition.`);
    setSelectedId(src.id);
    setLinkFromId(null); // le mode reste actif pour enchaîner
  }, [linkFromId, model, apply, suggestFromField, suggestToField]);

  // ---------- galerie : un modèle choisi S'AJOUTE aux autres (jamais de remplacement) ----------
  // Il rejoint le canvas (à droite) + un slot du panneau gauche, en UN seul
  // pas d'historique (un Ctrl+Z retire les tables ET le slot ensemble).
  const loadStarter = useCallback((pack: StarterPack) => {
    const parsed = parseAuto(pack.sql).model;
    const name = `${pack.numero} · ${pack.titre}`;
    const slotId = uid("slot");
    const slot: ImportSlot = {
      id: slotId, name, source: pack.sql, collapsed: true,
      msg: `Ajouté : ${parsed.tables.length} table(s) sur le canvas.`,
    };
    const { model: merged, ids } = mergeModel(model, parsed, slotId);
    applyWorkspace({
      model: merged,
      slots: [...slots.map((s) => ({ ...s, collapsed: true })), slot],
    });
    setSelectedId(ids[0] ?? null);
    setParseMsg(`« ${name} » ajouté aux modèles présents.`);
    setShowGallery(false);
    camera.fitViewSoon();
  }, [applyWorkspace, model, slots, camera]);

  // ---------- layout / camera ----------
  const autoLayout = useCallback(() => {
    apply((m) => autoLayoutModel(m));
    camera.resetCam();
  }, [apply, camera]);

  // ---------- drag & pan (direct-DOM pendant le geste, commit au relâcher) ----------
  const onCardMouseDown = (e: React.MouseEvent, t: DBTable) => {
    if ((e.target as HTMLElement).closest("button,input,select")) return;
    if (linkMode) return; // en mode liaison : pas de déplacement, que des clics
    e.stopPropagation();
    setSelectedId(t.id);
    const cardEl = e.currentTarget as HTMLElement;
    const z = camera.cam.z;
    const sx0 = e.clientX, sy0 = e.clientY;
    let tx = 0, ty = 0, moved = false;
    const snapshot: WorkspaceSnap = { model, slots }; // état avant déplacement, pour un seul pas d'historique
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
      commitWorkspace(snapshot);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // Pan du fond : voir `hooks/useCamera.ts` (direct-DOM puis commit).

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

  const exportSVGString = useCallback(
    () => buildExportSVG(visibleTables, visibleRelations),
    [visibleTables, visibleRelations]
  );

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
        // Déduplique les noms (l'import JSON brut est le dernier trou possible) :
        // on garde le nom sur la DERNIÈRE occurrence (= résolution actuelle des
        // liens) et on renomme les précédentes, sans toucher aux relations.
        const seen = new Set<string>();
        let fixed = 0;
        const tables = data.tables.map((t) => ({ ...t }));
        for (let i = tables.length - 1; i >= 0; i--) {
          const t = tables[i];
          if (seen.has(t.name)) {
            let k = 2;
            while (seen.has(`${t.name}_${k}`)) k++;
            t.name = `${t.name}_${k}`;
            seen.add(t.name);
            fixed++;
          } else seen.add(t.name);
        }
        apply({ tables, relations: data.relations ?? [] });
        setSelectedId(tables[0]?.id ?? null);
        setParseMsg(fixed ? `JSON chargé : ${fixed} doublon(s) renommé(s).` : "JSON chargé.");
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

  const totalFields = model.tables.reduce((a, t) => a + t.fields.length, 0);

  return (
    <div className={`app ${focusMode ? "focus" : ""}`}>
      {!focusMode && (
        <CommandBar
          tables={model.tables.length}
          relations={model.relations.length}
          fields={totalFields}
          issues={issues}
          query={query}
          onQuery={setQuery}
          onExport={openExport}
          onUndo={undo}
          onRedo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
          onGallery={() => setShowGallery(true)}
          showLeft={showLeft}
          onToggleLeft={() => setShowLeft(!showLeft)}
          showRight={showRight}
          onToggleRight={() => setShowRight(!showRight)}
          onFocus={() => setFocusMode(true)}
          savedAt={savedAt}
        />
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
                      onClick={(e) => {
                        e.stopPropagation();
                        const n = slotTableCount.get(slot.id) ?? 0;
                        if (!slot.hidden && n === 0) {
                          // Aucune table rattachée (import antérieur au suivi par modèle)
                          // : le dire clairement au lieu de ne rien faire en silence.
                          updateSlot(slot.id, {
                            hidden: true,
                            msg: "Aucune table rattachée à ce modèle sur le canvas. Ré-ajoute-le via ＋ Ajouter pour pouvoir le masquer.",
                          });
                        } else {
                          updateSlot(slot.id, { hidden: !slot.hidden });
                        }
                      }}
                      title={slot.hidden ? "Afficher ce modèle sur le canvas" : "Masquer ce modèle du canvas"}
                    >
                      {slot.hidden ? "Voir" : "Masquer"}
                    </button>
                    <button className="icon-btn danger" onClick={(e) => { e.stopPropagation(); deleteSlot(slot.id); }} title="Supprimer ce modèle du panneau et de la grille">✕</button>
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
        <input
          type="file" accept=".sql,.prisma,.ts,.txt" hidden ref={textFileRef}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f && fileTarget.current) loadTextIntoSlot(f, fileTarget.current);
            e.target.value = "";
          }}
        />
        <input
          type="file" accept=".json" hidden ref={fileRef}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) loadJSONFile(f);
            e.target.value = "";
          }}
        />

        <CanvasView
          model={model}
          visibleTables={visibleTables}
          visibleRelations={visibleRelations}
          selectedId={selectedId}
          cam={camera.cam}
          focusMode={focusMode}
          linkMode={linkMode}
          linkFromId={linkFromId}
          linkHoverId={linkHoverId}
          query={query}
          hasQuery={!!q}
          onWrapNode={camera.attachWrap}
          onWorldNode={attachWorldNode}
          onCanvasNode={camera.attachCanvas}
          matchTable={matchTable}
          onZoomCentered={camera.zoomCentered}
          onResetCam={camera.resetCam}
          onFitView={camera.fitView}
          onToggleLinkMode={() => { setLinkMode((v) => !v); setLinkFromId(null); }}
          onQuitLinkMode={() => { setLinkMode(false); setLinkFromId(null); }}
          onToggleFocus={() => setFocusMode((v) => !v)}
          onAutoLayout={autoLayout}
          onNewDiagram={newDiagram}
          onGallery={() => setShowGallery(true)}
          onExportSQL={() => openExport("sql")}
          onShowPanels={() => { setFocusMode(false); setShowLeft(true); setShowRight(true); }}
          onCanvasMouseDown={camera.onCanvasMouseDown}
          onCanvasClick={() => { if (linkMode) setLinkFromId(null); else setSelectedId(null); }}
          onCardMouseDown={onCardMouseDown}
          onCardClick={(t) => { if (linkMode) handleLinkClick(t); else setSelectedId(t.id); }}
          onCardDoubleClick={(t) => { if (!linkMode) centerOn(t); }}
          onHoverEnter={(id) => { if (linkMode) setLinkHoverId(id); }}
          onHoverLeave={(id) => { if (linkMode) setLinkHoverId((h) => (h === id ? null : h)); }}
          onCenterOn={centerOn}
          onClearQuery={() => setQuery("")}
          onAddTable={addTable}
        />

        {showRight && !focusMode && (
          <RightPanel
            model={model}
            selected={selected}
            relForm={relForm}
            onRelForm={setRelForm}
            onRenameTable={renameTable}
            onAddTable={addTable}
            onAddField={addField}
            onDuplicateTable={duplicateTable}
            onDeleteTable={deleteTable}
            onUpdateField={updateField}
            onDeleteField={deleteField}
            onAddRelation={addRelation}
            onDeleteRelation={deleteRelation}
            onUpdateCards={updateCards}
            onSuggestFrom={suggestFromField}
            onSuggestTo={suggestToField}
            onHide={() => setShowRight(false)}
            onDeselect={() => setSelectedId(null)}
          />
        )}

        {!showLeft && !focusMode && (
          <button className="edge-tab left" onClick={() => setShowLeft(true)} title="Import ( [ )">⟩</button>
        )}
        {!showRight && !focusMode && (
          <button className="edge-tab right" onClick={() => setShowRight(true)} title="Édition ( ] )">⟨</button>
        )}
      </div>

      {!focusMode && (
        <StatusBar
          msg={parseMsg}
          selectedName={selected?.name ?? null}
          selectedFields={selected?.fields.length ?? 0}
          zoomPct={Math.round(camera.cam.z * 100)}
          savedAt={savedAt}
        />
      )}

      {tour.active && (
        <TourOverlay
          step={tour.step}
          pos={tourPos}
          onStep={stepTour}
          onClose={closeTour}
        />
      )}

      {exportView && (
        <ExportModal
          view={exportView}
          text={exportText}
          fileName={exportFileName}
          visibleTables={visibleTables.length}
          visibleRelations={visibleRelations.length}
          totalTables={model.tables.length}
          onView={setExportView}
          onClose={() => setExportView(null)}
          onDownload={() => download(exportFileName, exportText)}
          onExportPNG={exportPNG}
          onExportSVG={() => download(exportFileName.replace(/\.[^.]+$/, "") + ".svg", exportSVGString(), "image/svg+xml")}
        />
      )}

      {showGallery && (
        <GalleryModal
          customName={customName}
          customSource={customSource}
          onCustomName={setCustomName}
          onCustomSource={setCustomSource}
          onAddCustom={addCustomSlot}
          onLoadStarter={loadStarter}
          onClose={() => setShowGallery(false)}
        />
      )}
    </div>
  );
}
