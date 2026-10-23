import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { DBModel, DBRelation, DBTable, ImportSlot, Instance } from "./types";
import { uid } from "./types";
import { parseAuto } from "./parsers";
import { type StarterPack } from "./templates";
import { CARD_W, fieldY } from "./domain/geometry";
import { edgePathFor, type EdgeStyle } from "./domain/edges";
import { getImageTheme } from "./domain/exportTheme";
import {
  addFieldTo,
  addRelationTo,
  createTable,
  deleteFieldFrom,
  duplicateTable as duplicateTableOf,
  inferCardsForTable,
  insertTable,
  isDuplicateRelation,
  mergeModel,
  moveTableIn,
  moveTablesBy,
  removeRelation,
  reconcileSlotTableNames,
  removeSlotTables,
  removeTable,
  renameTableIn,
  slotTableCounts,
  suggestFromField as suggestFromFieldOf,
  suggestToField as suggestToFieldOf,
  syncSlotTables,
  tagUntaggedTables,
  updateFieldIn,
  updateRelationCards,
  validateModel,
  visibleRelationsOf,
  visibleTablesOf,
} from "./domain/model";
import {
  assignSlotToInstance,
  createInstance,
  crossInstanceRelations,
  detachInstanceSlots,
  effectiveHiddenSlotIds,
  instanceOfSlot,
  renameInstance,
  slotsOfInstance,
  subModelForInstance,
  subModelForSlot,
  tablesCanCommunicate,
  toggleInstanceCollapsed,
  toggleInstanceHidden,
} from "./domain/instances";
import { layoutInstanceOnly, smartLayoutModel } from "./domain/layout";
import {
  instanceIdOfTable,
  namesCanShareAcrossInstances,
  qualifyModelForExport,
  tableScopeLabel,
} from "./domain/naming";
import { normalizeRelationIds, relationEnds } from "./domain/relations";
import {
  normalizeQuery,
  searchModels,
  tableMatchesQueryInScope,
} from "./domain/search";
import { getExporter, safeFileName } from "./domain/exporters";
import { downloadBlob, makeZipBlob } from "./domain/zip";
import {
  buildShareUrl,
  parseShareFromHash,
  type ShareKind,
  type ShareSnapshot,
} from "./services/share";
import {
  initialModel,
  INSTANCES_KEY,
  loadCamera,
  loadEdgeStyle,
  loadImageTheme,
  loadInstances,
  loadSlots,
  saveCamera,
  saveEdgeStyle,
  saveImageTheme,
  saveInstances,
  saveModel,
  saveSlots,
  SLOTS_KEY,
  STORE_KEY,
} from "./services/storage";
import { useHistory } from "./hooks/useHistory";
import { useCamera } from "./hooks/useCamera";
import { useTour } from "./hooks/useTour";
import { CommandBar } from "./components/CommandBar";
import { StatusBar } from "./components/StatusBar";
import { TourOverlay } from "./components/TourOverlay";
import { ExportModal, type ExportScope } from "./components/ExportModal";
import { ShareModal } from "./components/ShareModal";
import { GalleryModal } from "./components/GalleryModal";
import { LeftPanel } from "./components/LeftPanel";
import { RightPanel } from "./components/RightPanel";
import { CanvasView } from "./components/CanvasView";
import type { RelFormState } from "./components/RelationForm";
import { exportSVGString as buildExportSVG } from "./domain/exportSvg";

// Workspace = tout ce que le Ctrl+Z doit restaurer d'un coup : le canvas
// (model), les modèles du panneau gauche (slots) ET les instances (projets).
interface Workspace {
  model: DBModel;
  slots: ImportSlot[];
  instances: Instance[];
}

export default function App() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showLeft, setShowLeft] = useState(true);
  const [showRight, setShowRight] = useState(true);
  const [parseMsg, setParseMsg] = useState("");
  const [focusMode, setFocusMode] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState("sql");
  const [exportScope, setExportScope] = useState<ExportScope>({ kind: "canvas" });
  // Préférences d'affichage : style des liens (canvas + exports) et rendu
  // des images. Persistées en local, hors historique (comme le zoom).
  const [edgeStyle, setEdgeStyle] = useState<EdgeStyle>(() => loadEdgeStyle());
  const [imageTheme, setImageTheme] = useState<string>(() => loadImageTheme());
  const edgeStyleRef = useRef<EdgeStyle>(edgeStyle);
  edgeStyleRef.current = edgeStyle;
  const [showGallery, setShowGallery] = useState(false);
  const [shareTarget, setShareTarget] = useState<null | { kind: ShareKind; id?: string; name: string }>(null);
  const [shareUrl, setShareUrl] = useState("");
  // Aperçu partagé (lien #partage=…) : snapshot figé, lecture seule d'origine,
  // modifiable/exportable en copie locale, persistance désactivée.
  const [sharedSnap] = useState<ShareSnapshot | null>(() => {
    try {
      return parseShareFromHash();
    } catch {
      return null;
    }
  });
  const isSharedView = !!sharedSnap;
  const [savedAt, setSavedAt] = useState("");
  const [query, setQuery] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const textFileRef = useRef<HTMLInputElement>(null);
  // Repeinture live des liens pendant un drag : accès direct au nœud monde.
  const worldRef = useRef<HTMLDivElement | null>(null);

  // Modèles importés : autant que tu veux, chacun pliable/dépliable,
  // chacun avec son propre texte + message. Persistés en local.
  // Un seul historique pour tout le workspace : un Ctrl+Z après une
  // suppression fait revenir les tables sur la grille ET l'entrée du panneau.
  // Les retouches du panneau (texte, nom, plié, masqué) passent par `setSlots`
  // (sans pas d'historique) ; les changements structurels (ajout,
  // suppression) passent par `applyWorkspace` (avec historique).
  const {
    present: workspace,
    setPresent: setWorkspace,
    apply: applyWorkspace,
    commit: commitWorkspace,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useHistory<Workspace>(() => {
    if (sharedSnap) {
      return {
        model: normalizeRelationIds(sharedSnap.model),
        slots: sharedSnap.slots,
        instances: sharedSnap.instances,
      };
    }
    const ss = loadSlots();
    const ii = loadInstances();
    let m = initialModel();
    // Migration des stockages enregistrés quand le modèle de base n'était
    // pas tagué : aucune table rattachée mais des tables orphelines sur le
    // canvas → elles appartiennent au premier modèle du panneau gauche.
    // (StrictMode-clean : calcul pur dans l'initialiseur, aucun effet ici.)
    if (m.tables.length && m.tables.every((t) => !t.slotId) && ss.length) {
      m = tagUntaggedTables(m, ss[0].id);
    }
    return { model: m, slots: ss, instances: ii };
  });
  const model = workspace.model;
  const slots = workspace.slots;
  const instances = workspace.instances;

  /** Pousse modèle + slots d'un coup (un seul pas d'historique). */
  const apply = useCallback((next: DBModel | ((prev: DBModel) => DBModel)) => {
    applyWorkspace((w) => ({
      ...w,
      model: typeof next === "function" ? (next as (p: DBModel) => DBModel)(w.model) : next,
    }));
  }, [applyWorkspace]);

  /** Remplacement direct du modèle, SANS pas d'historique (drag). */
  const setModel: Dispatch<SetStateAction<DBModel>> = useCallback((action: SetStateAction<DBModel>) => {
    setWorkspace((w) => ({
      ...w,
      model: typeof action === "function" ? (action as (p: DBModel) => DBModel)(w.model) : action,
    }));
  }, [setWorkspace]);

  /** Retouches du panneau (texte, nom, plié, masqué), SANS pas d'historique. */
  const setSlots: Dispatch<SetStateAction<ImportSlot[]>> = useCallback((action: SetStateAction<ImportSlot[]>) => {
    setWorkspace((w) => ({
      ...w,
      slots: typeof action === "function" ? (action as (p: ImportSlot[]) => ImportSlot[])(w.slots) : action,
    }));
  }, [setWorkspace]);

  /** Retouches instances (nom, plié, masqué, assignation), SANS pas d'historique. */
  const setInstances: Dispatch<SetStateAction<Instance[]>> = useCallback((action: SetStateAction<Instance[]>) => {
    setWorkspace((w) => ({
      ...w,
      instances: typeof action === "function" ? (action as (p: Instance[]) => Instance[])(w.instances) : action,
    }));
  }, [setWorkspace]);

  const selected = useMemo(
    () => model.tables.find((t) => t.id === selectedId) ?? null,
    [model, selectedId]
  );
  const byId = useMemo(() => new Map(model.tables.map((t) => [t.id, t])), [model]);
  const slotById = useMemo(() => new Map(slots.map((s) => [s.id, s])), [slots]);
  const instanceById = useMemo(() => new Map(instances.map((i) => [i.id, i])), [instances]);
  // Visibilité par modèle ET par instance : voir `domain/instances.ts`.
  // Masquer une instance masque tous ses modèles ; "Isoler" = une seule visible.
  const hiddenSlotIds = useMemo(() => effectiveHiddenSlotIds(slots, instances), [slots, instances]);
  const visibleTables = useMemo(
    () => visibleTablesOf(model, hiddenSlotIds),
    [model, hiddenSlotIds]
  );
  const visibleRelations = useMemo(
    () => visibleRelationsOf(model, visibleTables),
    [model, visibleTables]
  );
  const slotTableCount = useMemo(() => slotTableCounts(model), [model]);

  // Étanchéité entre instances : deux projets ne communiquent pas. Ce prédicat
  // est branché sur la détection FK auto (merge + sync) ; il ne bloque jamais
  // les tables hors instance (manuelles, « Sans instance »). Règle pure :
  // voir `tablesCanCommunicate` dans `domain/instances.ts`.
  const allowCrossLink = useCallback(
    (src: DBTable, target: DBTable) => tablesCanCommunicate(slots, src, target),
    [slots]
  );
  /** Message clair quand on tente de lier deux tables de projets distincts. */
  const communicationError = useCallback((a: DBTable, b: DBTable): string | null => {
    if (tablesCanCommunicate(slots, a, b)) return null;
    const nameOf = (iid?: string) => instances.find((i) => i.id === iid)?.name || "sans nom";
    return `« ${nameOf(instanceOfSlot(slots, a.slotId))} » et « ${nameOf(instanceOfSlot(slots, b.slotId))} » sont deux projets distincts : les instances ne communiquent pas. Relie des tables d'un même projet (ou hors instance).`;
  }, [slots, instances]);

  const openExport = useCallback(() => {
    setExportScope({ kind: "canvas" });
    setExportOpen(true);
  }, []);

  useEffect(() => {
    if (isSharedView) return; // aperçu partagé : on ne touche PAS au stockage local
    const id = setTimeout(() => {
      const saved = saveModel(model);
      if (saved) setSavedAt(saved);
    }, 400);
    return () => clearTimeout(id);
  }, [model, isSharedView]);

  // Persistance des slots d'import (textes + plié/déplié)
  useEffect(() => {
    if (isSharedView) return;
    saveSlots(slots);
  }, [slots, isSharedView]);

  // Persistance des instances (projets)
  useEffect(() => {
    if (isSharedView) return;
    saveInstances(instances);
  }, [instances, isSharedView]);

  // Persistance des préférences d'affichage (locales, jamais partagées).
  useEffect(() => {
    saveEdgeStyle(edgeStyle);
  }, [edgeStyle]);
  useEffect(() => {
    saveImageTheme(imageTheme);
  }, [imageTheme]);

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
  const deleteSlot = useCallback((id: string) => {
    const doomed = model.tables.filter((t) => t.slotId === id);
    // Atomique : UN seul pas d'historique retire le slot ET ses tables —
    // un Ctrl+Z fait donc revenir les deux ensemble.
    applyWorkspace((w) => ({
      slots: w.slots.filter((s) => s.id !== id),
      model: removeSlotTables(w.model, id),
      instances: w.instances,
    }));
    // La suppression d'un modèle retire ses tables + leurs liens du canvas.
    if (doomed.length) {
      if (selectedId && doomed.some((t) => t.id === selectedId)) setSelectedId(null);
      setParseMsg(`Modèle supprimé : ${doomed.length} table(s) retirée(s) du canvas. (Ctrl+Z pour annuler)`);
    }
  }, [applyWorkspace, model, selectedId]);

  // ---------- instances (projets) ----------
  const addInstance = useCallback(() => {
    const inst = createInstance(instances.map((i) => i.name), instances.length);
    applyWorkspace((w) => ({
      ...w,
      instances: [...w.instances.map((i) => ({ ...i, collapsed: true })), { ...inst, collapsed: false }],
    }));
    setParseMsg(`Instance « ${inst.name} » créée : assigne-lui des modèles via « Sans instance… ».`);
  }, [applyWorkspace, instances]);
  const renameInstanceCb = useCallback((id: string, name: string) => {
    setInstances((ii) => renameInstance(ii, id, name));
  }, [setInstances]);
  const toggleInstanceHiddenCb = useCallback((id: string) => {
    setInstances((ii) => toggleInstanceHidden(ii, id));
  }, [setInstances]);
  const toggleInstanceCollapsedCb = useCallback((id: string) => {
    setInstances((ii) => toggleInstanceCollapsed(ii, id));
  }, [setInstances]);
  const deleteInstance = useCallback((id: string) => {
    const name = instances.find((i) => i.id === id)?.name ?? "Instance";
    applyWorkspace((w) => ({
      ...w,
      instances: w.instances.filter((i) => i.id !== id),
      slots: detachInstanceSlots(w.slots, id),
    }));
    setParseMsg(`Instance « ${name} » supprimée : ses modèles sont conservés dans « Sans instance ». (Ctrl+Z pour annuler)`);
  }, [applyWorkspace, instances]);
  const assignSlot = useCallback((slotId: string, instanceId?: string) => {
    const nextSlots = assignSlotToInstance(slots, slotId, instanceId);
    const { model: nextModel, renamed } = reconcileSlotTableNames(model, nextSlots, slotId);
    applyWorkspace({ ...workspace, slots: nextSlots, model: nextModel });
    if (renamed) {
      const target = instanceId ? instances.find((i) => i.id === instanceId)?.name ?? "l'instance" : "Sans instance";
      setParseMsg(`Rangement dans « ${target} » : ${renamed} homonyme(s) renommé(s) pour rester unique dans le même périmètre. Les homonymes des autres instances restent intacts.`);
    }
  }, [slots, model, workspace, applyWorkspace, instances]);
  /** Tout ré-afficher : instances + modèles (sortie du mode "un projet à la fois"). */
  const showAll = useCallback(() => {
    setInstances((ii) => ii.map((i) => ({ ...i, hidden: false })));
    setSlots((ss) => ss.map((s) => ({ ...s, hidden: false })));
    setParseMsg("Tout est visible : instances + modèles ré-affichés.");
  }, [setInstances, setSlots]);
  /** Isoler = ne garder qu'une instance visible. Re-clic = tout ré-afficher. */
  const isolateInstance = useCallback((id: string) => {
    const othersHidden = instances.filter((i) => i.id !== id).every((i) => i.hidden);
    const unaffHidden = slots.filter((s) => !s.instanceId).every((s) => s.hidden);
    if (othersHidden && unaffHidden && !instances.find((i) => i.id === id)?.hidden) {
      showAll();
      return;
    }
    setInstances((ii) => ii.map((i) => ({ ...i, hidden: i.id === id ? false : true })));
    setSlots((ss) => ss.map((s) => (!s.instanceId ? { ...s, hidden: true } : s.hidden && s.instanceId === id ? { ...s, hidden: false } : s)));
    const name = instances.find((i) => i.id === id)?.name ?? "";
    setParseMsg(`Instance « ${name} » isolée : les autres projets sont masqués. Re-clique « Isoler » pour tout revoir.`);
  }, [instances, slots, setInstances, setSlots, showAll]);

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
        if (exportOpen) { setExportOpen(false); return; }
        if (shareTarget) { setShareTarget(null); return; }
        if (showGallery) { setShowGallery(false); return; }
        if (typing) return;
        if (linkModeRef.current) { setLinkMode(false); setLinkFromId(null); }
        else setFocusMode(false);
        return;
      }
      if (typing) return;
      if (exportOpen || shareTarget || showGallery) return; // modale ouverte : que Echap / undo / redo
      if (e.key === "[") setShowLeft((v) => !v);
      else if (e.key === "]") setShowRight((v) => !v);
      else if (e.key.toLowerCase() === "f") camera.fitView();
      else if (e.key.toLowerCase() === "m") setFocusMode((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo, redo, model, exportOpen, shareTarget, showGallery]);

  // ---------- validation ----------
  // Règles internes au modèle + règle de projet : un lien qui traverse deux
  // instances (héritage d'un rangement a posteriori) est signalé, jamais créé.
  const issues = useMemo(() => {
    const base = validateModel(model, {
      allowDuplicateNames: (a, b) =>
        namesCanShareAcrossInstances(
          instanceIdOfTable(slots, a),
          instanceIdOfTable(slots, b)
        ),
    });
    return [
      ...base,
      ...crossInstanceRelations(model, slots, instances).map(({ relation, fromInstance, toInstance }) => ({
        level: "warn" as const,
        text: `Lien inter-projets : ${relation.fromTable} — ${relation.toTable} traverse « ${fromInstance.name || "sans nom"} » et « ${toInstance.name || "sans nom"} » — les instances ne communiquent pas (supprime le lien ou range les modèles ensemble).`,
      })),
    ];
  }, [model, slots, instances]);

  // ---------- camera ----------
  // La vue exacte (pan + zoom) est restaurée au chargement : la disposition
  // à l'écran ne bouge plus au refresh. Lecture unique (StrictMode-clean).
  const [initialCam] = useState(() => loadCamera() ?? undefined);
  const camera = useCamera(visibleTables.length ? visibleTables : model.tables, initialCam);
  // Sauvegarde différée de la vue (même rythme que le modèle).
  useEffect(() => {
    if (isSharedView) return;
    const id = setTimeout(() => saveCamera(camera.cam), 400);
    return () => clearTimeout(id);
  }, [camera.cam, isSharedView]);
  // Flush synchrone à la fermeture : un refresh dans les 400 ms du debounce
  // ne perd plus ni le dernier déplacement ni la dernière vue.
  const modelRef = useRef(model);
  modelRef.current = model;
  const camRef = useRef(camera.cam);
  camRef.current = camera.cam;
  useEffect(() => {
    if (isSharedView) return;
    const flush = () => {
      saveModel(modelRef.current);
      saveCamera(camRef.current);
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [isSharedView]);
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
  // Résultat « modèle » : ré-affiche le modèle (et son instance si besoin) puis
  // cadre ses tables. Aucun changement structurel : uniquement de la visibilité.
  const focusModel = useCallback((slotId: string) => {
    const slot = slots.find((s) => s.id === slotId);
    if (!slot) return;
    const instance = slot.instanceId ? instances.find((i) => i.id === slot.instanceId) : undefined;
    if (instance?.hidden) {
      setInstances((ii) => ii.map((i) => (i.id === instance.id ? { ...i, hidden: false } : i)));
    }
    if (slot.hidden) {
      setSlots((ss) => ss.map((s) => (s.id === slotId ? { ...s, hidden: false } : s)));
    }
    const tables = model.tables.filter((t) => t.slotId === slotId);
    if (!tables.length) {
      setShowLeft(true);
      setParseMsg(`Modèle « ${slot.name} » : aucune table sur le canvas. Ajoute-le depuis le panneau gauche.`);
      return;
    }
    camera.focusOn(tables);
    setSelectedId(null);
    setParseMsg(`Modèle « ${slot.name} » cadré${instance ? ` (instance « ${instance.name} »)` : ""}.`);
  }, [slots, instances, model, setInstances, setSlots, camera]);

  const q = normalizeQuery(query);
  // Une table est « trouvée » par son nom/champ/type, mais aussi quand le nom
  // de son modèle ou de son instance correspond : chercher un modèle éclaire
  // toutes ses tables sans changer le filtre historique.
  const matchTable = useCallback((t: DBTable) => {
    if (!q) return true;
    return tableMatchesQueryInScope(t, q, slotById, instanceById);
  }, [q, slotById, instanceById]);
  const modelHits = useMemo(
    () => searchModels(model, slots, instances, q),
    [model, slots, instances, q]
  );

  // ---------- import ----------
  // Ajout générique : parse un schema et l'ajoute à droite du canvas.
  // Chaque table importée est taguée avec le slot d'origine (visibilité par modèle).

  // Ajoute CE modèle au canvas sans effacer ceux déjà présents.
  // Si le slot a déjà des tables sur la grille → sync stricte (Modifier) :
  // champs fusionnés par nom (positions conservées), tables ajoutées/retirées,
  // liens internes remplacés, FK croisées re-détectées. Sinon ajout classique.
  const mergeImportSlot = useCallback((slot: ImportSlot) => {
    const { model: m, kind: k } = parseAuto(slot.source);
    if (!m.tables.length) {
      updateSlot(slot.id, { msg: "Aucune table détectée. Vérifie ton schema (CREATE TABLE / model / pgTable)." });
      return;
    }
    const alreadyOnCanvas = model.tables.filter((t) => t.slotId === slot.id).length;
    if (alreadyOnCanvas > 0) {
      const { model: synced, ids, stats } = syncSlotTables(model, m, slot.id, allowCrossLink, slots);
      applyWorkspace((w) => ({ ...w, model: synced }));
      setSelectedId(ids[0] ?? null);
      const bits: string[] = [];
      if (stats.updated) bits.push(`~ ${stats.updated} maj`);
      if (stats.added) bits.push(`+ ${stats.added} table(s)`);
      if (stats.removed) bits.push(`- ${stats.removed} retirée(s)`);
      if (stats.autoLinked) bits.push(`⇄ ${stats.autoLinked} lien(s) auto`);
      updateSlot(slot.id, { msg: `Modifié : ${bits.join(" · ") || "rien à changer"} [${k}].` });
      setParseMsg(`« ${slot.name} » mis à jour (${bits.join(", ") || "à jour"}). Positions et liens manuels conservés.`);
      camera.fitViewSoon();
      return;
    }
    const { model: merged, ids, autoLinked } = mergeModel(model, m, slot.id, allowCrossLink, slots);
    applyWorkspace((w) => ({ ...w, model: merged }));
    setSelectedId(ids[0] ?? null);
    updateSlot(slot.id, { msg: `+ ${m.tables.length} table(s) ajoutée(s) [${k}]${autoLinked ? ` · ⇄ ${autoLinked} lien(s) auto.` : "."}` });
    setParseMsg(`« ${slot.name} » ajouté${autoLinked ? ` : ${autoLinked} lien(s) FK détecté(s) vers les tables présentes` : " : relie ses entités à la main avec leurs cardinalités MCD"}.`);
    camera.fitViewSoon();
  }, [applyWorkspace, model, updateSlot, camera, allowCrossLink, slots]);

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
    const current = model.tables.find((t) => t.id === id);
    const instanceId = current ? instanceIdOfTable(slots, current) : undefined;
    const clash = model.tables.find(
      (t) =>
        t.id !== id &&
        t.name === clean &&
        !namesCanShareAcrossInstances(instanceId, instanceIdOfTable(slots, t))
    );
    if (clash) {
      setParseMsg(`Nom déjà pris dans le même périmètre : « ${clean} » existe déjà. Deux instances distinctes peuvent partager un nom ; deux tables qui peuvent se relier, non.`);
      return;
    }
    apply((m) => renameTableIn(m, id, clean));
  }, [apply, model, slots]);

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
  // Le formulaire manipule des IDs : deux instances peuvent avoir « users ».
  const [relForm, setRelForm] = useState<RelFormState>({ fromTableId: "", fromField: "", toTableId: "", toField: "", cardA: "1,N", cardB: "1,1" });
  // Mode liaison sur le canvas : clic sur l'entité source puis sur l'entité cible.
  const [linkMode, setLinkMode] = useState(false);
  const [linkFromId, setLinkFromId] = useState<string | null>(null);
  const [linkHoverId, setLinkHoverId] = useState<string | null>(null);
  const linkModeRef = useRef(false);
  linkModeRef.current = linkMode;
  // Champ suggéré côté source : xxx_id qui vise la cible, sinon 1er champ non-PK, sinon 1er champ.
  const suggestFromField = useCallback(
    (srcId: string, dstId: string): string =>
      suggestFromFieldOf(byId.get(srcId), byId.get(dstId)),
    [byId]
  );
  const suggestToField = useCallback(
    (dstId: string): string => suggestToFieldOf(byId.get(dstId)),
    [byId]
  );

  const addRelation = useCallback(() => {
    const { fromTableId, fromField, toTableId, toField, cardA, cardB } = relForm;
    const src = byId.get(fromTableId);
    const dst = byId.get(toTableId);
    if (!src || !dst || !fromField || !toField) return;
    const blocked = communicationError(src, dst);
    if (blocked) {
      setParseMsg(blocked);
      return;
    }
    if (isDuplicateRelation(model.relations, src.name, fromField, dst.name, toField, src.id, dst.id)) {
      setParseMsg(`Lien déjà existant : ${src.name}.${fromField} → ${dst.name}.${toField}.`);
      return;
    }
    const rel: DBRelation = {
      id: uid("rel"),
      fromTable: src.name, fromTableId: src.id, fromField,
      toTable: dst.name, toTableId: dst.id, toField,
      fromCard: cardA, toCard: cardB,
    };
    apply((m) => addRelationTo(m, rel));
    setRelForm((f) => ({ ...f, fromField: "", toField: "" }));
  }, [relForm, apply, model, byId, communicationError]);

  const deleteRelation = useCallback((id: string) => {
    apply((m) => removeRelation(m, id));
  }, [apply]);

  const updateCards = useCallback((id: string, side: "a" | "b", value: string) => {
    apply((m) => updateRelationCards(m, id, side, value));
  }, [apply]);

  // Clic-clic sur le canvas en mode liaison : source puis cible.
  // Champs suggérés (xxx_id → PK), cardinalités MCD inférées (nullable/unique).
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
    const blocked = communicationError(src, t);
    if (blocked) {
      setParseMsg(blocked);
      setLinkFromId(null);
      return;
    }
    const fromField = suggestFromFieldOf(src, t);
    const toField = suggestToFieldOf(t);
    if (!fromField || !toField) {
      setParseMsg("Liaison impossible : champ source ou cible introuvable.");
      setLinkFromId(null);
      return;
    }
    const { fromCard, toCard } = inferCardsForTable(src, fromField);
    const rel: DBRelation = {
      id: uid("rel"),
      fromTable: src.name, fromTableId: src.id, fromField,
      toTable: t.name, toTableId: t.id, toField,
      fromCard, toCard,
    };
    const dup = isDuplicateRelation(
      model.relations, rel.fromTable, rel.fromField, rel.toTable, rel.toField,
      rel.fromTableId, rel.toTableId
    );
    if (dup) {
      setParseMsg(`Lien déjà existant : ${rel.fromTable}.${rel.fromField} → ${rel.toTable}.${rel.toField}. Choisis d'autres champs ou modifie-le dans Édition.`);
      setLinkFromId(null);
      return;
    }
    apply((m) => addRelationTo(m, rel));
    setParseMsg(`Lié : ${src.name}.${fromField} (${rel.fromCard}) — ${t.name}.${toField} (${rel.toCard}). Modifie les cardinalités dans Édition.`);
    setSelectedId(src.id);
    setLinkFromId(null); // le mode reste actif pour enchaîner
  }, [linkFromId, model, apply, communicationError]);

  // ---------- galerie : un modèle choisi S'AJOUTE aux autres (jamais de remplacement) ----------
  // Il rejoint le canvas (à droite) + un slot du panneau gauche, en UN seul
  // pas d'historique (un Ctrl+Z retire les tables ET le slot ensemble).
  const loadStarter = useCallback((pack: StarterPack) => {
    const parsed = parseAuto(pack.sql).model;
    const name = `${pack.numero} · ${pack.titre}`;
    const slotId = uid("slot");
    const { model: merged, ids, autoLinked } = mergeModel(model, parsed, slotId, undefined, slots);
    const slot: ImportSlot = {
      id: slotId, name, source: pack.sql, collapsed: true,
      msg: `Ajouté : ${parsed.tables.length} table(s) sur le canvas${autoLinked ? ` · ⇄ ${autoLinked} lien(s) auto` : ""}.`,
    };
    applyWorkspace({
      model: merged,
      slots: [...slots.map((s) => ({ ...s, collapsed: true })), slot],
      instances,
    });
    setSelectedId(ids[0] ?? null);
    setParseMsg(`« ${name} » ajouté aux modèles présents${autoLinked ? ` (${autoLinked} lien(s) FK auto)` : ""}.`);
    setShowGallery(false);
    camera.fitViewSoon();
  }, [applyWorkspace, model, slots, instances, camera]);

  // ---------- layout / camera ----------
  /** Layout intelligent : regroupe par instance / modèle, hubs en premier. */
  const smartLayout = useCallback(() => {
    applyWorkspace((w) => ({
      ...w,
      model: smartLayoutModel(w.model, { slots: w.slots, instances: w.instances }),
    }));
    camera.resetCam();
    setParseMsg("Canvas rangé par instance : chaque projet est regroupé, tables liées proches.");
  }, [applyWorkspace, camera]);
  const layoutInstance = useCallback((id: string) => {
    applyWorkspace((w) => ({
      ...w,
      model: layoutInstanceOnly(w.model, w.slots, id).model,
    }));
    camera.fitViewSoon();
  }, [applyWorkspace, camera]);

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
    const snapshot = workspace; // état avant déplacement, pour un seul pas d'historique
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
        const { from: a, to: b } = relationEnds(model, r);
        const moveFrom = r.fromTableId ? r.fromTableId === t.id : r.fromTable === t.name;
        const moveTo = r.toTableId ? r.toTableId === t.id : r.toTable === t.name;
        if (!moveFrom && !moveTo) continue;
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
      const style = edgeStyleRef.current;
      for (const le of liveEdges) {
        const nx1 = le.moveFrom ? le.x1 + tx : le.x1;
        const ny1 = le.moveFrom ? le.y1 + ty : le.y1;
        const nx2 = le.moveTo ? le.x2 + tx : le.x2;
        const ny2 = le.moveTo ? le.y2 + ty : le.y2;
        le.path?.setAttribute("d", edgePathFor(style, nx1, ny1, nx2, ny2));
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

  // Drag d'un cadre (étiquette ⤢) : déplace toutes ses tables d'un coup.
  // Même contrat que le drag de carte : direct-DOM pendant le geste (zéro
  // re-render, liens repeints en live), UN seul commit au relâcher.
  const onClusterMouseDown = (e: React.MouseEvent, tableIds: string[]) => {
    if ((e.target as HTMLElement).closest("button,input,select")) return;
    if (linkMode) return;
    if (!tableIds.length || !worldRef.current) return;
    e.stopPropagation();
    const z = camera.cam.z;
    const sx0 = e.clientX, sy0 = e.clientY;
    let tx = 0, ty = 0, moved = false;
    const snapshot = workspace; // état avant déplacement, pour un seul pas d'historique
    const movingIds = new Set(tableIds);
    const movingNames = new Set(
      model.tables.filter((t) => movingIds.has(t.id)).map((t) => t.name)
    );
    interface LiveEdge {
      path: SVGPathElement | null;
      fromDot: SVGCircleElement | null; fromLabel: SVGTextElement | null;
      toDot: SVGCircleElement | null; toLabel: SVGTextElement | null;
      x1: number; y1: number; x2: number; y2: number;
      moveFrom: boolean; moveTo: boolean;
    }
    const liveEdges: LiveEdge[] = [];
    const cardEls: HTMLElement[] = [];
    const world = worldRef.current;
    for (const id of movingIds) {
      const el = world.querySelector(`[data-table="${id}"]`) as HTMLElement | null;
      if (el) cardEls.push(el);
    }
    const clusterEl = (e.target as HTMLElement).closest("[data-cluster]") as HTMLElement | null;
    // Cadres liés : quand on déplace un PROJET, ses cadres modèles suivent en
    // direct. Quand on déplace un MODÈLE seul, le cadre projet parent ne suit
    // PAS (il se recalcule au relâcher) — sinon c'est lui qu'on croit déplacer.
    const extraEls: HTMLElement[] = [];
    if (clusterEl) {
      const key = clusterEl.dataset.cluster ?? "";
      if (key.startsWith("inst:")) {
        world.querySelectorAll(`[data-parent="${key}"]`).forEach((el) => {
          if (el !== clusterEl) extraEls.push(el as HTMLElement);
        });
      }
    }
    for (const r of model.relations) {
      const { from: a, to: b } = relationEnds(model, r);
      if (!a || !b) continue;
      const moveFrom = r.fromTableId
        ? movingIds.has(r.fromTableId)
        : movingNames.has(r.fromTable);
      const moveTo = r.toTableId
        ? movingIds.has(r.toTableId)
        : movingNames.has(r.toTable);
      if (!moveFrom && !moveTo) continue;
      const g = world.querySelector(`g.edge[data-rel="${r.id}"]`);
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
    const paintEdges = () => {
      const style = edgeStyleRef.current;
      for (const le of liveEdges) {
        const nx1 = le.moveFrom ? le.x1 + tx : le.x1;
        const ny1 = le.moveFrom ? le.y1 + ty : le.y1;
        const nx2 = le.moveTo ? le.x2 + tx : le.x2;
        const ny2 = le.moveTo ? le.y2 + ty : le.y2;
        le.path?.setAttribute("d", edgePathFor(style, nx1, ny1, nx2, ny2));
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
      // Les cartes du cadre + le cadre lui-même (+ parent/enfants) suivent, sans re-render.
      for (const el of cardEls) el.style.transform = `translate(${tx}px, ${ty}px)`;
      if (clusterEl) clusterEl.style.transform = `translate(${tx}px, ${ty}px)`;
      for (const el of extraEls) el.style.transform = `translate(${tx}px, ${ty}px)`;
      paintEdges();
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      for (const el of cardEls) el.style.transform = "";
      if (clusterEl) clusterEl.style.transform = "";
      for (const el of extraEls) el.style.transform = "";
      if (!moved) return;
      const dx = Math.round(tx), dy = Math.round(ty);
      setModel((m) => moveTablesBy(m, tableIds, dx, dy));
      commitWorkspace(snapshot);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // Pan du fond : voir `hooks/useCamera.ts` (direct-DOM puis commit).

  // ---------- exports : UN seul bouton, choix du format dans le modal ----------
  // Périmètre = canvas visible | instance | modèle. Le ZIP d'instance contient
  // un fichier par modèle dans le format choisi (via le registre d'exporteurs).
  const scopeModel: DBModel = useMemo(() => {
    if (exportScope.kind === "slot") return subModelForSlot(model, exportScope.slotId);
    if (exportScope.kind === "instance") return subModelForInstance(model, slots, exportScope.instanceId);
    return { tables: visibleTables, relations: visibleRelations };
  }, [exportScope, model, slots, visibleTables, visibleRelations]);

  const exporter = getExporter(exportFormat) ?? getExporter("sql")!;
  // Les homonymes de deux instances visibles sont qualifiés par les initiales
  // du projet UNIQUEMENT pour l'export (SQL/Prisma/Drizzle/SVG). Le JSON reste
  // une sauvegarde fidèle, sans renommage.
  const exportModel = useMemo(
    () =>
      exportFormat === "json"
        ? scopeModel
        : qualifyModelForExport(scopeModel, slots, instances),
    [exportFormat, scopeModel, slots, instances]
  );
  const exportText = useMemo(() => {
    try {
      return exporter.generate(exportModel);
    } catch {
      return "";
    }
  }, [exporter, exportModel]);

  const scopeName = useMemo(() => {
    if (exportScope.kind === "slot") return slots.find((s) => s.id === exportScope.slotId)?.name ?? "modèle";
    if (exportScope.kind === "instance") return instances.find((i) => i.id === exportScope.instanceId)?.name ?? "instance";
    return "canvas";
  }, [exportScope, slots, instances]);

  const exportFileName = useMemo(
    () => safeFileName(scopeName, exporter.extension),
    [scopeName, exporter]
  );

  /** Fichiers du ZIP d'instance : un fichier par modèle, même format. */
  const instanceZipEntries = useMemo(() => {
    if (exportScope.kind !== "instance") return [];
    if (exporter.kind !== "code" && exporter.kind !== "data") return [];
    const members = slotsOfInstance(slots, exportScope.instanceId);
    return members
      .map((s) => {
        const sub = subModelForSlot(model, s.id);
        if (!sub.tables.length) return null;
        return { name: safeFileName(s.name, exporter.extension), content: exporter.generate(sub) };
      })
      .filter((e): e is { name: string; content: string } => !!e);
  }, [exportScope, exporter, slots, model]);

  const scopeLabel = useMemo(() => {
    if (exportScope.kind === "slot") {
      const sub = scopeModel;
      return `Modèle « ${scopeName} » · ${sub.tables.length} table(s) · format ${exporter.label}`;
    }
    if (exportScope.kind === "instance") {
      const members = slotsOfInstance(slots, exportScope.instanceId).length;
      return `Instance « ${scopeName} » · ${members} modèle(s) · ${scopeModel.tables.length} table(s) · ${exporter.label}${instanceZipEntries.length > 1 ? " · ZIP (1 fichier par modèle)" : ""}`;
    }
    if (exportFormat === "json") return `Canvas · sauvegarde complète · ${model.tables.length} tables (masqués inclus)`;
    return `Canvas · ${visibleTables.length} table(s) visible(s) · ${visibleRelations.length} lien(s) — masque une instance pour l'exclure`;
  }, [exportScope, scopeModel, scopeName, exporter, slots, instanceZipEntries, exportFormat, model, visibleTables, visibleRelations]);

  const download = (filename: string, content: string, mime = "text/plain") => {
    downloadBlob(new Blob([content], { type: mime }), filename);
  };

  const exportSVGString = useCallback(
    () => buildExportSVG(exportModel.tables, exportModel.relations, { title: `MCD — ${scopeName}`, theme: imageTheme, edgeStyle }),
    [exportModel, scopeName, imageTheme, edgeStyle]
  );

  const exportPNG = useCallback(() => {
    const svg = exportSVGString();
    const paper = getImageTheme(imageTheme).paper;
    const img = new Image();
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      // Rendu net 2x : dimensions doublées, fond papier du thème.
      const w = (img.width || 1600) * 2;
      const h = (img.height || 1000) * 2;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = paper;
      ctx.fillRect(0, 0, w, h);
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => {
        if (!b) return;
        downloadBlob(b, safeFileName(scopeName, "png"));
      }, "image/png");
    };
    img.src = url;
  }, [exportSVGString, scopeName, imageTheme]);

  const downloadZip = useCallback(() => {
    if (!instanceZipEntries.length) return;
    const blob = makeZipBlob(instanceZipEntries);
    downloadBlob(blob, safeFileName(`${scopeName}-${exportFormat}`, "zip"));
    setParseMsg(`Instance « ${scopeName} » exportée en ZIP : ${instanceZipEntries.length} fichier(s) ${exporter.label}.`);
  }, [instanceZipEntries, scopeName, exportFormat, exporter]);

  // ---------- partage par lien (snapshot figé) ----------
  const openShare = useCallback((kind: ShareKind, id?: string) => {
    const name =
      kind === "slot"
        ? (slots.find((s) => s.id === id)?.name ?? "modèle")
        : kind === "instance"
          ? (instances.find((i) => i.id === id)?.name ?? "instance")
          : "canvas";
    setShareUrl("");
    setShareTarget({ kind, id, name });
  }, [slots, instances]);

  const createShare = useCallback(() => {
    if (!shareTarget) return;
    let snapModel: DBModel = { tables: visibleTables, relations: visibleRelations };
    if (shareTarget.kind === "slot" && shareTarget.id) snapModel = subModelForSlot(model, shareTarget.id);
    else if (shareTarget.kind === "instance" && shareTarget.id) snapModel = subModelForInstance(model, slots, shareTarget.id);
    else if (shareTarget.kind === "canvas" && exportFormat === "json") snapModel = model;
    const snap: ShareSnapshot = {
      v: 1,
      kind: shareTarget.kind,
      name: shareTarget.name,
      slotId: shareTarget.kind === "slot" ? shareTarget.id : undefined,
      instanceId: shareTarget.kind === "instance" ? shareTarget.id : undefined,
      model: snapModel,
      slots,
      instances,
      createdAt: new Date().toISOString(),
    };
    setShareUrl(buildShareUrl(snap));
  }, [shareTarget, model, slots, instances, visibleTables, visibleRelations, exportFormat]);

  const quitSharedView = useCallback(() => {
    location.hash = "";
    location.reload();
  }, []);

  const adoptSharedView = useCallback(() => {
    // La copie partagée devient MON studio : on la persiste puis on recharge
    // sans hash (sauvegarde auto réactivée). L'original de l'expéditeur n'est
    // jamais touché : tout est local à ce navigateur.
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(model));
      localStorage.setItem(SLOTS_KEY, JSON.stringify(slots));
      localStorage.setItem(INSTANCES_KEY, JSON.stringify(instances));
    } catch { /* ignore */ }
    location.hash = "";
    location.reload();
  }, [model, slots, instances]);

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
        // Le JSON est une sauvegarde fidèle : on conserve les homonymes
        // inter-instances. Les relations sont résolues par IDs (les sauvegardes
        // anciennes, sans IDs, retombent sur les noms, qui étaient uniques).
        const tables = data.tables.map((t) => ({ ...t }));
        apply(normalizeRelationIds({ tables, relations: data.relations ?? [] }));
        setSelectedId(tables[0]?.id ?? null);
        setParseMsg("JSON chargé.");
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

  /** Métadonnées d'affichage par modèle : instance parente (couleur) + nom du
   * modèle. Sert aux pastilles ET aux zones de regroupement du canvas. */
  const slotMeta = useMemo(() => {
    const m = new Map<string, { instId?: string; name: string; color?: string; slotName: string }>();
    const instById = new Map(instances.map((i) => [i.id, i]));
    for (const s of slots) {
      const inst = s.instanceId ? instById.get(s.instanceId) : undefined;
      m.set(s.id, {
        instId: inst?.id,
        name: inst ? inst.name : s.name,
        color: inst?.color,
        slotName: s.name,
      });
    }
    return m;
  }, [slots, instances]);

  const duplicateNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of model.tables) counts.set(t.name, (counts.get(t.name) ?? 0) + 1);
    return new Set([...counts].filter(([, n]) => n > 1).map(([name]) => name));
  }, [model]);
  // Dans les formulaires, un homonyme est qualifié par son instance/modèle.
  const tableLabel = useCallback(
    (t: DBTable) =>
      duplicateNames.has(t.name)
        ? `${t.name} · ${tableScopeLabel(t, slots, instances)}`
        : t.name,
    [duplicateNames, slots, instances]
  );

  return (
    <div className={`app ${focusMode ? "focus" : ""}`}>
      {isSharedView && sharedSnap && (
        <div className="share-banner">
          <span>🔗 Aperçu partagé — <b>{sharedSnap.name}</b> ({sharedSnap.model.tables.length} tables, figé le {sharedSnap.createdAt.slice(0, 10)}) · l'original est intouchable</span>
          <span style={{ flex: 1 }} />
          <button className="btn small" onClick={adoptSharedView} title="Adopter cette copie et travailler dessus">Adopter ma copie</button>
          <button className="btn small" onClick={() => download("partage.json", JSON.stringify(sharedSnap.model, null, 2), "application/json")} title="Exporter le snapshot">⤓ JSON</button>
          <button className="btn small danger" onClick={quitSharedView}>Quitter ✕</button>
        </div>
      )}
      {!focusMode && (
        <CommandBar
          tables={model.tables.length}
          relations={model.relations.length}
          fields={totalFields}
          issues={issues}
          query={query}
          onQuery={setQuery}
          onExport={openExport}
          onShare={() => openShare("canvas")}
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
          <LeftPanel
            slots={slots}
            instances={instances}
            model={model}
            slotTableCount={slotTableCount}
            issues={issues}
            parseMsg={parseMsg}
            onUpdateSlot={updateSlot}
            onAddSlot={() => addSlot()}
            onDeleteSlot={deleteSlot}
            onMergeSlot={mergeImportSlot}
            onAddInstance={addInstance}
            onRenameInstance={renameInstanceCb}
            onToggleInstanceHidden={toggleInstanceHiddenCb}
            onToggleInstanceCollapsed={toggleInstanceCollapsedCb}
            onDeleteInstance={deleteInstance}
            onAssignSlot={assignSlot}
            onSmartLayout={smartLayout}
            onShowAll={showAll}
            onLayoutInstance={layoutInstance}
            onIsolateInstance={isolateInstance}
            onExportInstance={(id) => { setExportScope({ kind: "instance", instanceId: id }); setExportOpen(true); }}
            onShareSlot={(id) => openShare("slot", id)}
            onShareInstance={(id) => openShare("instance", id)}
            onHide={() => setShowLeft(false)}
            onGallery={() => setShowGallery(true)}
            onTour={openTour}
            onPickTextFile={(slotId) => {
              fileTarget.current = slotId;
              textFileRef.current?.click();
            }}
            onPickJsonFile={() => fileRef.current?.click()}
          />
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
          modelHits={modelHits}
          onFocusModel={focusModel}
          tableLabel={tableLabel}
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
          onAutoLayout={smartLayout}
          onNewDiagram={newDiagram}
          onGallery={() => setShowGallery(true)}
          onExportSQL={() => openExport()}
          onShowPanels={() => { setFocusMode(false); setShowLeft(true); setShowRight(true); }}
          onCanvasMouseDown={camera.onCanvasMouseDown}
          onCanvasClick={() => { if (linkMode) setLinkFromId(null); else setSelectedId(null); }}
          onCardMouseDown={onCardMouseDown}
          onClusterMouseDown={onClusterMouseDown}
          onCardClick={(t) => { if (linkMode) handleLinkClick(t); else setSelectedId(t.id); }}
          onCardDoubleClick={(t) => { if (!linkMode) centerOn(t); }}
          onHoverEnter={(id) => { if (linkMode) setLinkHoverId(id); }}
          onHoverLeave={(id) => { if (linkMode) setLinkHoverId((h) => (h === id ? null : h)); }}
          onCenterOn={centerOn}
          onClearQuery={() => setQuery("")}
          onAddTable={addTable}
          slotMeta={slotMeta}
          edgeStyle={edgeStyle}
          onEdgeStyle={setEdgeStyle}
        />

        {showRight && !focusMode && (
          <RightPanel
            model={model}
            selected={selected}
            relForm={relForm}
            onRelForm={setRelForm}
            tableLabel={tableLabel}
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
          selectedName={selected ? tableLabel(selected) : null}
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

      {exportOpen && (
        <ExportModal
          formatId={exportFormat}
          onFormat={setExportFormat}
          scope={exportScope}
          onScope={setExportScope}
          instances={instances}
          slots={slots}
          previewText={exportText}
          previewFileName={exportFileName}
          zipFiles={instanceZipEntries.length}
          scopeLabel={scopeLabel}
          onClose={() => setExportOpen(false)}
          onCopy={() => { void navigator.clipboard.writeText(exportText); }}
          onDownload={() => download(exportFileName, exportText, exporter.mime)}
          onDownloadZip={downloadZip}
          onExportPNG={exportPNG}
          onExportSVG={() => download(safeFileName(scopeName, "svg"), exportSVGString(), "image/svg+xml")}
          imageTheme={imageTheme}
          onImageTheme={setImageTheme}
        />
      )}

      {shareTarget && (
        <ShareModal
          kind={shareTarget.kind}
          targetName={shareTarget.name}
          url={shareUrl}
          onCreate={createShare}
          onClose={() => { setShareTarget(null); setShareUrl(""); }}
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
