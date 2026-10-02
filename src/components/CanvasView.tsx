import { useMemo } from "react";
import type { MouseEvent } from "react";
import type { DBModel, DBTable } from "../types";
import { mcdCards } from "../types";
import { CARD_W, edgePath, fieldY } from "../domain/geometry";
import type { Camera } from "../hooks/useCamera";

interface CanvasViewProps {
  model: DBModel;
  visibleTables: DBTable[];
  visibleRelations: DBModel["relations"];
  selectedId: string | null;
  cam: Camera;
  focusMode: boolean;
  linkMode: boolean;
  linkFromId: string | null;
  linkHoverId: string | null;
  query: string;
  hasQuery: boolean;
  onWrapNode: (el: HTMLDivElement | null) => void;
  onWorldNode: (el: HTMLDivElement | null) => void;
  onCanvasNode: (el: HTMLDivElement | null) => void;
  matchTable: (t: DBTable) => boolean;
  onZoomCentered: (z: number) => void;
  onResetCam: () => void;
  onFitView: () => void;
  onToggleLinkMode: () => void;
  onQuitLinkMode: () => void;
  onToggleFocus: () => void;
  onAutoLayout: () => void;
  onNewDiagram: () => void;
  onGallery: () => void;
  onExportSQL: () => void;
  onShowPanels: () => void;
  onCanvasMouseDown: (e: MouseEvent) => void;
  onCanvasClick: () => void;
  onCardMouseDown: (e: MouseEvent, t: DBTable) => void;
  onCardClick: (t: DBTable) => void;
  onCardDoubleClick: (t: DBTable) => void;
  onHoverEnter: (id: string) => void;
  onHoverLeave: (id: string) => void;
  onCenterOn: (t: DBTable) => void;
  onClearQuery: () => void;
  onAddTable: () => void;
}

export function CanvasView(p: CanvasViewProps) {
  const { onWrapNode, onCanvasNode, onWorldNode } = p;
  const byName = useMemo(() => new Map(p.model.tables.map((t) => [t.name, t])), [p.model]);
  const linkFrom = p.linkFromId ? (p.model.tables.find((t) => t.id === p.linkFromId) ?? null) : null;
  const searchHits = p.hasQuery ? p.visibleTables.filter(p.matchTable) : [];

  return (
    <main className="canvas-wrap" ref={onWrapNode}>
      <div className="toolbar">
        <button className="btn small" onClick={() => p.onZoomCentered(p.cam.z - 0.1)}>−</button>
        <input
          className="zoom-slider" type="range" min={20} max={250} step={5}
          value={Math.round(p.cam.z * 100)}
          onChange={(e) => p.onZoomCentered(Number(e.target.value) / 100)}
          title="Molette = zoom libre vers le curseur"
        />
        <button className="zoom-pct" onClick={() => p.onZoomCentered(1)} title="Revenir à 100%">
          {Math.round(p.cam.z * 100)}%
        </button>
        <button className="btn small" onClick={() => p.onZoomCentered(p.cam.z + 0.1)}>＋</button>
        <span className="zoom-hint" title="Molette = zoom vers le curseur, glisser = déplacer">molette = zoom</span>
        <button className="btn small" onClick={p.onResetCam}>Recentrer</button>
        <button className="btn small" onClick={p.onFitView} title="Touche F">Cadrer [F]</button>
        <button
          id="tour-link-btn"
          className={p.linkMode ? "btn small primary" : "btn small"}
          onClick={p.onToggleLinkMode}
          title="Relier 2 entités en cliquant : source puis cible (Echap pour quitter)"
        >
          {p.linkMode ? "⇄ Liaison… ✓" : "⇄ Relier"}
        </button>
        <button className="btn small primary" onClick={p.onToggleFocus} title="Agrandir / réduire la zone de travail (M)">
          {p.focusMode ? "⇲ Réduire [M]" : "⤢ Agrandir [M]"}
        </button>
        {!p.focusMode && (
          <>
            <button className="btn small" onClick={p.onAutoLayout}>▦ Auto-layout</button>
            <button className="btn small danger" onClick={p.onNewDiagram} title="Tout effacer">⌫</button>
          </>
        )}
        {p.focusMode && (
          <>
            <span className="sep" />
            <button className="btn small" onClick={p.onGallery}>+ Modèles</button>
            <button className="btn small" onClick={p.onExportSQL}>Exporter ↗</button>
            <button className="btn small" onClick={p.onShowPanels}>⟨ Panneaux [Esc]</button>
          </>
        )}
      </div>
      {p.linkMode && (
        <div className="toolbar link-banner">
          <span>
            {linkFrom
              ? <>Source : <b>{linkFrom.name}</b> → clique maintenant l'entité <b>cible</b> (re-clic = annuler)</>
              : <>Clique l'entité <b>source</b> puis l'entité <b>cible</b> — champs et cardinalités 1,N / 1,1 auto</>}
          </span>
          <span style={{ flex: 1 }} />
          <button className="btn small danger" onClick={p.onQuitLinkMode}>Quitter [Esc]</button>
        </div>
      )}
      <div ref={onCanvasNode} className={`canvas ${p.linkMode ? "linking" : ""}`} onMouseDown={p.onCanvasMouseDown} onClick={p.onCanvasClick}>
        <div className="canvas-bgword">SCHEMA<span>+</span></div>
        <div ref={onWorldNode} className="world" style={{ transform: `translate(${p.cam.x}px, ${p.cam.y}px) scale(${p.cam.z})` }}>
          <svg className="edges" style={{ overflow: "visible" }}>
            {p.visibleRelations.map((r) => {
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

          {p.model.tables.length === 0 && (
            <div className="empty">
              <h2>Canvas <span>vide+</span></h2>
              <p>Colle un schema puis <em>« Générer le MCD »</em>, ou démarre d'un modèle de base tout relié.</p>
              <div className="row">
                <button className="btn primary" onClick={p.onGallery}>+ Choisir un modèle</button>
                <button className="btn" onClick={p.onAddTable}>＋ Table vide</button>
              </div>
            </div>
          )}

          {p.visibleTables.map((t) => {
            const dim = p.hasQuery && !p.matchTable(t);
            const hit = p.hasQuery && p.matchTable(t);
            return (
              <div key={t.id}
                className={`table-card ${p.selectedId === t.id ? "selected" : ""} ${dim ? "dim" : ""} ${hit && p.hasQuery ? "hit" : ""} ${p.linkMode ? "linkable" : ""} ${p.linkFromId === t.id ? "link-from" : ""} ${p.linkMode && p.linkHoverId === t.id && p.linkFromId !== t.id ? "link-hover" : ""}`}
                style={{ left: t.x, top: t.y, width: CARD_W }}
                onMouseDown={(e) => p.onCardMouseDown(e, t)}
                onClick={(e) => {
                  e.stopPropagation();
                  p.onCardClick(t);
                }}
                onDoubleClick={() => p.onCardDoubleClick(t)}
                onMouseEnter={() => p.onHoverEnter(t.id)}
                onMouseLeave={() => p.onHoverLeave(t.id)}
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
      {p.hasQuery && (
        <div className="toolbar" style={{ borderTop: "1px solid var(--line)", borderBottom: "none" }}>
          <span>{searchHits.length} résultat(s) visible(s) pour « {p.query} » — double-clic pour centrer.</span>
          <span style={{ flex: 1 }} />
          {searchHits.slice(0, 6).map((t) => (
            <button key={t.id} className="btn small" onClick={() => p.onCenterOn(t)}>{t.name}</button>
          ))}
          <button className="btn small danger" onClick={p.onClearQuery}>✕</button>
        </div>
      )}
    </main>
  );
}
