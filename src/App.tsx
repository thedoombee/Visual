import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DBModel, DBRelation, DBTable } from "./types";
import { uid } from "./types";
import { detectKind, parseAuto, type SchemaKind } from "./parsers";
import { toDrizzle, toPrisma, toSQL } from "./generators";
import { EXAMPLE_DRIZZLE, EXAMPLE_PRISMA, EXAMPLE_SQL } from "./examples";

const CARD_W = 252;
const HEADER_H = 40;
const ROW_H = 30;
const STORE_KEY = "mcd-studio-v1";

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
  const leftToRight = x2 >= x1;
  const c1x = x1 + (leftToRight ? dx : -dx);
  const c2x = x2 + (leftToRight ? -dx : dx);
  return `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`;
}

function initialModel(): DBModel {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DBModel;
      if (parsed.tables?.length) return parsed;
    }
  } catch { /* ignore */ }
  return parseAuto(EXAMPLE_SQL).model;
}

export default function App() {
  const [model, setModel] = useState<DBModel>(initialModel);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showLeft, setShowLeft] = useState(true);
  const [showRight, setShowRight] = useState(true);
  const [source, setSource] = useState(EXAMPLE_SQL);
  const [kind, setKind] = useState<SchemaKind>(() => detectKind(EXAMPLE_SQL));
  const [parseMsg, setParseMsg] = useState("");
  const [cam, setCam] = useState({ x: 20, y: 20, z: 1 });
  const [exportView, setExportView] = useState<null | "sql" | "prisma" | "drizzle" | "json">(null);
  const [savedAt, setSavedAt] = useState<string>("");
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<null | { tableId: string; dx: number; dy: number }>(null);
  const panRef = useRef<null | { sx: number; sy: number; cx: number; cy: number }>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => model.tables.find((t) => t.id === selectedId) ?? null,
    [model, selectedId]
  );
  const byName = useMemo(() => new Map(model.tables.map((t) => [t.name, t])), [model]);

  // autosave
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(model));
        setSavedAt(new Date().toLocaleTimeString());
      } catch { /* ignore */ }
    }, 400);
    return () => clearTimeout(id);
  }, [model]);

  useEffect(() => setKind(detectKind(source)), [source]);

  // Raccourcis clavier : [ = panneau import, ] = panneau édition
  // (ignorés quand on tape dans un champ / textarea / select)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.key === "[") setShowLeft((v) => !v);
      else if (e.key === "]") setShowRight((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---------- import ----------
  const doImport = useCallback(() => {
    const { model: m, kind: k } = parseAuto(source);
    if (!m.tables.length) {
      setParseMsg("Aucune table détectée. Vérifie ton schema (CREATE TABLE / model / pgTable).");
      return;
    }
    setModel(m);
    setSelectedId(m.tables[0]?.id ?? null);
    setParseMsg(`${m.tables.length} table(s) • ${m.relations.length} relation(s) importée(s) [${k}].`);
  }, [source]);

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
    setModel((m) => ({ ...m, tables: [...m.tables, t] }));
    setSelectedId(t.id);
  }, [model.tables.length]);

  const duplicateTable = useCallback((id: string) => {
    setModel((m) => {
      const t = m.tables.find((x) => x.id === id);
      if (!t) return m;
      const copy: DBTable = {
        ...t,
        id: uid("t"),
        name: t.name + "_copie",
        x: t.x + 40,
        y: t.y + 40,
        fields: t.fields.map((f) => ({ ...f, id: uid("f") })),
      };
      return { ...m, tables: [...m.tables, copy] };
    });
  }, []);

  const deleteTable = useCallback((id: string) => {
    setModel((m) => {
      const t = m.tables.find((x) => x.id === id);
      if (!t) return m;
      return {
        tables: m.tables.filter((x) => x.id !== id),
        relations: m.relations.filter((r) => r.fromTable !== t.name && r.toTable !== t.name),
      };
    });
    setSelectedId(null);
  }, []);

  const renameTable = useCallback((id: string, name: string) => {
    setModel((m) => {
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
  }, []);

  const moveTable = useCallback((id: string, x: number, y: number) => {
    setModel((m) => ({
      ...m,
      tables: m.tables.map((t) => (t.id === id ? { ...t, x: Math.round(x), y: Math.round(y) } : t)),
    }));
  }, []);

  // ---------- fields ----------
  const updateField = useCallback((tableId: string, fieldId: string, patch: Partial<DBTable["fields"][number]>) => {
    setModel((m) => ({
      ...m,
      tables: m.tables.map((t) =>
        t.id === tableId
          ? { ...t, fields: t.fields.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)) }
          : t
      ),
    }));
  }, []);

  const addField = useCallback((tableId: string) => {
    setModel((m) => ({
      ...m,
      tables: m.tables.map((t) =>
        t.id === tableId
          ? {
              ...t,
              fields: [
                ...t.fields,
                { id: uid("f"), name: `champ_${t.fields.length + 1}`, type: "TEXT", nullable: true },
              ],
            }
          : t
      ),
    }));
  }, []);

  const deleteField = useCallback((tableId: string, fieldId: string) => {
    setModel((m) => {
      const t = m.tables.find((x) => x.id === tableId);
      const f = t?.fields.find((x) => x.id === fieldId);
      return {
        tables: m.tables.map((x) =>
          x.id === tableId ? { ...x, fields: x.fields.filter((y) => y.id !== fieldId) } : x
        ),
        relations: f
          ? m.relations.filter(
              (r) => !(r.fromTable === t!.name && r.fromField === f.name) && !(r.toTable === t!.name && r.toField === f.name)
            )
          : m.relations,
      };
    });
  }, []);

  // ---------- relations ----------
  const [relForm, setRelForm] = useState({ from: "", to: "" });
  const addRelation = useCallback(() => {
    const [fromTable, fromField] = relForm.from.split("::");
    const [toTable, toField] = relForm.to.split("::");
    if (!fromTable || !fromField || !toTable || !toField) return;
    const rel: DBRelation = {
      id: uid("rel"),
      fromTable, fromField, toTable, toField,
      cardinality: "N:1",
    };
    setModel((m) => ({
      tables: m.tables.map((t) =>
        t.name === fromTable
          ? { ...t, fields: t.fields.map((f) => (f.name === fromField ? { ...f, fk: true } : f)) }
          : t
      ),
      relations: [...m.relations, rel],
    }));
    setRelForm({ from: "", to: "" });
  }, [relForm]);

  const deleteRelation = useCallback((id: string) => {
    setModel((m) => ({ ...m, relations: m.relations.filter((r) => r.id !== id) }));
  }, []);

  // ---------- drag & pan ----------
  const onCardMouseDown = (e: React.MouseEvent, t: DBTable) => {
    if ((e.target as HTMLElement).closest("button,input,select")) return;
    e.stopPropagation();
    setSelectedId(t.id);
    const rect = canvasRef.current?.getBoundingClientRect();
    dragRef.current = {
      tableId: t.id,
      dx: (e.clientX - (rect?.left ?? 0)) / cam.z - t.x,
      dy: (e.clientY - (rect?.top ?? 0)) / cam.z - t.y,
    };
    const move = (ev: MouseEvent) => {
      const r = canvasRef.current?.getBoundingClientRect();
      if (!dragRef.current || !r) return;
      moveTable(
        dragRef.current.tableId,
        (ev.clientX - r.left) / cam.z - dragRef.current.dx,
        (ev.clientY - r.top) / cam.z - dragRef.current.dy
      );
    };
    const up = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const onCanvasMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".table-card")) return;
    panRef.current = { sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y };
    const move = (ev: MouseEvent) => {
      if (!panRef.current) return;
      setCam((c) => ({
        ...c,
        x: panRef.current!.cx + (ev.clientX - panRef.current!.sx),
        y: panRef.current!.cy + (ev.clientY - panRef.current!.sy),
      }));
    };
    const up = () => {
      panRef.current = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) {
      // molette simple = pan vertical, ctrl+molette = zoom
      return;
    }
    e.preventDefault();
    setCam((c) => ({ ...c, z: Math.min(1.8, Math.max(0.4, c.z - e.deltaY * 0.0015)) }));
  };

  const zoom = (d: number) =>
    setCam((c) => ({ ...c, z: Math.min(1.8, Math.max(0.4, +(c.z + d).toFixed(2))) }));
  const resetCam = () => setCam({ x: 20, y: 20, z: 1 });

  // ---------- exports ----------
  const exportText = useMemo(() => {
    if (exportView === "sql") return toSQL(model);
    if (exportView === "prisma") return toPrisma(model);
    if (exportView === "drizzle") return toDrizzle(model);
    if (exportView === "json") return JSON.stringify(model, null, 2);
    return "";
  }, [exportView, model]);

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
    let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${maxX}" height="${maxY}" font-family="Inter,system-ui,sans-serif">`;
    s += `<rect width="100%" height="100%" fill="#f8fafc"/>`;
    for (const r of model.relations) {
      const a = byName.get(r.fromTable);
      const b = byName.get(r.toTable);
      if (!a || !b) continue;
      const x1 = a.x + CARD_W, y1 = fieldY(a, r.fromField);
      const x2 = b.x, y2 = fieldY(b, r.toField);
      s += `<path d="${edgePath(x1, y1, x2, y2)}" fill="none" stroke="#6366f1" stroke-width="2"/>`;
      s += `<circle cx="${x1}" cy="${y1}" r="4" fill="#6366f1"/><circle cx="${x2}" cy="${y2}" r="4" fill="#10b981"/>`;
    }
    for (const t of model.tables) {
      const h = cardH(t);
      s += `<g><rect x="${t.x}" y="${t.y}" width="${CARD_W}" height="${h}" rx="12" fill="white" stroke="#e2e8f0"/>`;
      s += `<rect x="${t.x}" y="${t.y}" width="${CARD_W}" height="${HEADER_H}" rx="12" fill="#111827"/>`;
      s += `<rect x="${t.x}" y="${t.y + HEADER_H - 12}" width="${CARD_W}" height="12" fill="#111827"/>`;
      s += `<text x="${t.x + 14}" y="${t.y + 25}" fill="white" font-size="13" font-weight="700">${esc(t.name)}</text>`;
      t.fields.forEach((f, i) => {
        const y = t.y + HEADER_H + i * ROW_H;
        s += `<text x="${t.x + 14}" y="${y + 20}" font-size="12" fill="#0f172a">${esc(f.name)}${f.pk ? " 🔑" : ""}${f.fk ? " 🔗" : ""}</text>`;
        s += `<text x="${t.x + CARD_W - 14}" y="${y + 20}" font-size="10" fill="#64748b" text-anchor="end">${esc(f.type)}</text>`;
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
      ctx.fillStyle = "#f8fafc";
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
    setModel({ tables: [], relations: [] });
    setSelectedId(null);
    setSource("");
  };

  const loadJSONFile = (f: File) => {
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const data = JSON.parse(String(rd.result)) as DBModel;
        if (!data.tables) throw new Error("bad");
        setModel(data);
        setSelectedId(data.tables[0]?.id ?? null);
      } catch {
        alert("Fichier JSON invalide.");
      }
    };
    rd.readAsText(f);
  };

  const kindBadge: Record<string, string> = {
    prisma: "Prisma", drizzle: "Drizzle", sql: "SQL", unknown: "Auto",
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">◧</span>
          <div>
            <strong>MCD Studio</strong>
            <small>Prisma • Drizzle • SQL → diagramme</small>
          </div>
        </div>
        <div className="stats">
          <span className="pill">{model.tables.length} tables</span>
          <span className="pill">{model.relations.length} relations</span>
          <span className="pill ghost">{model.tables.reduce((a, t) => a + t.fields.length, 0)} champs</span>
          {savedAt && <span className="saved">✓ sauvegardé {savedAt}</span>}
        </div>
        <div className="actions">
          <button className={showLeft ? "btn active" : "btn"} onClick={() => setShowLeft(!showLeft)} title="Afficher / masquer le panneau d'import [">⟨ Import</button>
          <button className={showRight ? "btn active" : "btn"} onClick={() => setShowRight(!showRight)} title="Afficher / masquer le panneau d'édition []">Édition ⟩</button>
          <button className="btn" onClick={addTable}>＋ Table</button>
          <button className="btn" onClick={() => setExportView("sql")}>SQL</button>
          <button className="btn" onClick={() => setExportView("prisma")}>Prisma</button>
          <button className="btn" onClick={() => setExportView("drizzle")}>Drizzle</button>
          <button className="btn" onClick={() => { download("mcd.svg", exportSVGString(), "image/svg+xml"); }}>SVG</button>
          <button className="btn primary" onClick={exportPNG}>⤓ PNG</button>
          <button className="btn" onClick={() => setExportView("json")}>JSON</button>
          <button className="btn danger-ghost" onClick={newDiagram}>⌫</button>
        </div>
      </header>

      <div className="layout">
        {showLeft && (
          <aside className="panel left">
            <div className="panel-title">
              <span>1 · Coller ton schema</span>
              <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span className={`badge ${kind}`}>{kindBadge[kind] ?? kind}</span>
                <button className="icon-btn" onClick={() => setShowLeft(false)} title="Masquer le panneau ( [ )">⟨</button>
              </span>
            </div>
            <textarea
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="Colle ici ton schema.prisma, ton drizzle schema.ts ou ton CREATE TABLE…"
              spellCheck={false}
            />
            <div className="row">
              <button className="btn primary full" onClick={doImport}>✨ Générer le MCD</button>
            </div>
            {parseMsg && <p className="msg">{parseMsg}</p>}
            <div className="examples">
              <span>Exemples :</span>
              <button onClick={() => setSource(EXAMPLE_PRISMA)}>Prisma</button>
              <button onClick={() => setSource(EXAMPLE_DRIZZLE)}>Drizzle</button>
              <button onClick={() => setSource(EXAMPLE_SQL)}>SQL</button>
            </div>
            <div className="help">
              <p><b>Astuces</b></p>
              <ul>
                <li>Glisse les tables à la souris, molette + Ctrl pour zoomer.</li>
                <li>Clique une table pour l'éditer à droite.</li>
                <li>Les <code>xxx_id</code> + <code>REFERENCES</code> créent les liens auto.</li>
                <li>Tout est sauvegardé en local automatiquement.</li>
              </ul>
              <button className="btn small" onClick={() => fileRef.current?.click()}>Importer JSON…</button>
              <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) loadJSONFile(f);
              }} />
            </div>
          </aside>
        )}

        <main className="canvas-wrap">
          <div className="toolbar">
            <button className="btn small" onClick={() => zoom(-0.1)}>−</button>
            <span>{Math.round(cam.z * 100)}%</span>
            <button className="btn small" onClick={() => zoom(0.1)}>＋</button>
            <button className="btn small" onClick={resetCam}>Recentrer</button>
            <button
              className={showLeft ? "btn small active" : "btn small"}
              onClick={() => setShowLeft(!showLeft)}
              title="Panneau d'import ( [ )"
            >
              {showLeft ? "⟨ Import" : "Import ⟩"}
            </button>
            <button
              className={showRight ? "btn small active" : "btn small"}
              onClick={() => setShowRight(!showRight)}
              title="Panneau d'édition ( ] )"
            >
              {showRight ? "Édition ⟩" : "⟨ Édition"}
            </button>
          </div>
          <div
            ref={canvasRef}
            className="canvas"
            onMouseDown={onCanvasMouseDown}
            onWheel={onWheel}
            onClick={() => setSelectedId(null)}
          >
            <div
              className="world"
              style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})` }}
            >
              <svg className="edges" style={{ overflow: "visible" }}>
                {model.relations.map((r) => {
                  const a = byName.get(r.fromTable);
                  const b = byName.get(r.toTable);
                  if (!a || !b) return null;
                  const x1 = a.x + CARD_W, y1 = fieldY(a, r.fromField);
                  const x2 = b.x, y2 = fieldY(b, r.toField);
                  return (
                    <g key={r.id} className="edge" onClick={(e) => e.stopPropagation()}>
                      <path d={edgePath(x1, y1, x2, y2)} className="edge-line" />
                      <circle cx={x1} cy={y1} r={4} className="dot from" />
                      <circle cx={x2} cy={y2} r={4} className="dot to" />
                      <text
                        x={(x1 + x2) / 2}
                        y={(y1 + y2) / 2 - 6}
                        className="edge-label"
                      >
                        {r.cardinality ?? "N:1"}
                      </text>
                    </g>
                  );
                })}
              </svg>

              {model.tables.length === 0 && (
                <div className="empty">
                  <h2>Canvas vide</h2>
                  <p>Colle un schema à gauche puis clique « Générer le MCD », ou crée une table.</p>
                  <button className="btn primary" onClick={addTable}>＋ Créer une table</button>
                </div>
              )}

              {model.tables.map((t) => (
                <div
                  key={t.id}
                  className={`table-card ${selectedId === t.id ? "selected" : ""}`}
                  style={{ left: t.x, top: t.y, width: CARD_W }}
                  onMouseDown={(e) => onCardMouseDown(e, t)}
                  onClick={(e) => { e.stopPropagation(); setSelectedId(t.id); }}
                >
                  <div className="card-head">
                    <span className="card-title">{t.name}</span>
                    <span className="card-count">{t.fields.length}</span>
                  </div>
                  <div className="card-body">
                    {t.fields.map((f) => (
                      <div key={f.id} className="frow">
                        <span className="fname" title={f.name}>
                          {f.pk ? "🔑 " : ""}{f.fk ? "🔗 " : ""}{f.name}
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
              ))}
            </div>
          </div>
        </main>

        {showRight && (
        <aside className="panel right">
          {!selected ? (
            <>
              <div className="panel-title">
                <span>2 · Édition</span>
                <button className="icon-btn" onClick={() => setShowRight(false)} title="Masquer le panneau ( ] )">⟩</button>
              </div>
              <p className="muted">Clique sur une table du canvas pour la modifier ici.</p>
              <button className="btn full" onClick={addTable}>＋ Ajouter une table</button>
              <h4>Relations ({model.relations.length})</h4>
              <div className="rellist">
                {model.relations.map((r) => (
                  <div key={r.id} className="rel">
                    <span>{r.fromTable}.{r.fromField} → {r.toTable}.{r.toField}</span>
                    <button className="icon-btn" onClick={() => deleteRelation(r.id)}>✕</button>
                  </div>
                ))}
                {model.relations.length === 0 && <p className="muted">Aucune relation.</p>}
              </div>
              <h4>Créer une relation</h4>
              <RelationForm model={model} form={relForm} setForm={setRelForm} onAdd={addRelation} />
            </>
          ) : (
            <>
              <div className="panel-title">
                <span>✎ {selected.name}</span>
                <span style={{ display: "flex", gap: 4 }}>
                  <button className="icon-btn" onClick={() => setSelectedId(null)} title="Désélectionner">✕</button>
                  <button className="icon-btn" onClick={() => setShowRight(false)} title="Masquer le panneau ( ] )">⟩</button>
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
                    <input
                      className="fname-in"
                      value={f.name}
                      onChange={(e) => updateField(selected.id, f.id, { name: e.target.value })}
                    />
                    <input
                      className="ftype-in"
                      value={f.type}
                      list="types"
                      onChange={(e) => updateField(selected.id, f.id, { type: e.target.value.toUpperCase() })}
                    />
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
              <datalist id="types">
                {TYPE_SUGGESTIONS.map((t) => <option key={t} value={t} />)}
              </datalist>
              <h4>Relations de cette table</h4>
              <div className="rellist">
                {model.relations
                  .filter((r) => r.fromTable === selected.name || r.toTable === selected.name)
                  .map((r) => (
                    <div key={r.id} className="rel">
                      <span>{r.fromTable}.{r.fromField} → {r.toTable}.{r.toField}</span>
                      <button className="icon-btn" onClick={() => deleteRelation(r.id)}>✕</button>
                    </div>
                  ))}
              </div>
              <h4>Nouvelle relation</h4>
              <RelationForm model={model} form={relForm} setForm={setRelForm} onAdd={addRelation} preset={selected.name} />
            </>
          )}
        </aside>
        )}

        {/* Onglets flottants pour rouvrir les panneaux masqués */}
        {!showLeft && (
          <button className="edge-tab left" onClick={() => setShowLeft(true)} title="Afficher le panneau d'import ( [ )">
            ⟩
          </button>
        )}
        {!showRight && (
          <button className="edge-tab right" onClick={() => setShowRight(true)} title="Afficher le panneau d'édition ( ] )">
            ⟨
          </button>
        )}
      </div>

      {exportView && (
        <div className="modal-bg" onClick={() => setExportView(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <strong>Export {exportView.toUpperCase()}</strong>
              <button className="icon-btn" onClick={() => setExportView(null)}>✕</button>
            </div>
            <pre>{exportText}</pre>
            <div className="row">
              <button className="btn" onClick={() => navigator.clipboard.writeText(exportText)}>⧉ Copier</button>
              <button className="btn primary" onClick={() => download(`mcd.${exportView === "json" ? "json" : exportView === "drizzle" ? "ts" : exportView === "prisma" ? "prisma" : "sql"}`, exportText)}>
                ⤓ Télécharger
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RelationForm({
  model, form, setForm, onAdd,
}: {
  model: DBModel;
  form: { from: string; to: string };
  setForm: (f: { from: string; to: string }) => void;
  onAdd: () => void;
  preset?: string;
}) {
  const opts = model.tables.flatMap((t) =>
    t.fields.map((f) => ({ value: `${t.name}::${f.name}`, label: `${t.name}.${f.name}` }))
  );
  return (
    <div className="relform">
      <label className="lbl">De (FK)</label>
      <select value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })}>
        <option value="">— choisir —</option>
        {opts.map((o) => (
          <option key={"f" + o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <label className="lbl">Vers (PK)</label>
      <select value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })}>
        <option value="">— choisir —</option>
        {opts.map((o) => <option key={"t" + o.value} value={o.value}>{o.label}</option>)}
      </select>
      <button className="btn primary full" onClick={onAdd}>Lier N:1</button>
    </div>
  );
}
