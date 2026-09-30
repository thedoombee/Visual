import type { ImportSlot } from "../types";
import type { ModelIssue } from "../domain/model";
import { detectKind } from "../parsers";
import { EXAMPLE_DRIZZLE, EXAMPLE_PRISMA, EXAMPLE_SQL } from "../examples";

const kindBadge: Record<string, string> = { prisma: "Prisma", drizzle: "Drizzle", sql: "SQL", unknown: "Auto" };

interface LeftPanelProps {
  slots: ImportSlot[];
  slotTableCount: Map<string, number>;
  issues: ModelIssue[];
  parseMsg: string;
  onUpdateSlot: (id: string, patch: Partial<ImportSlot>) => void;
  onAddSlot: () => void;
  onDeleteSlot: (id: string) => void;
  onMergeSlot: (slot: ImportSlot) => void;
  onHide: () => void;
  onGallery: () => void;
  onTour: () => void;
  onPickTextFile: (slotId: string) => void;
  onPickJsonFile: () => void;
}

export function LeftPanel(p: LeftPanelProps) {
  return (
    <aside className="panel left">
      <div className="panel-title"><span><span className="num">01 /</span> Modèles importés ({p.slots.length})</span>
        <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button className="btn small primary" onClick={() => p.onAddSlot()} title="Ajouter un autre modèle">+ Modèle</button>
          <button className="icon-btn" onClick={p.onHide}>⟨</button>
        </span>
      </div>
      {p.slots.length === 0 && (
        <>
          <p className="muted">Aucun modèle. Ajoute ton premier schema pour commencer.</p>
          <button className="btn primary full" onClick={() => p.onAddSlot()}>+ Ajouter un modèle</button>
        </>
      )}
      {p.slots.map((slot, i) => {
        const kind = detectKind(slot.source);
        return (
          <div key={slot.id} className={`slot ${slot.collapsed ? "folded" : ""} ${slot.hidden ? "masked" : ""}`}>
            <div className="slot-head" onClick={() => p.onUpdateSlot(slot.id, { collapsed: !slot.collapsed })} title="Plier / déplier">
              <span className="slot-fold">{slot.collapsed ? "▸" : "▾"}</span>
              <input
                className="slot-name" value={slot.name}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => p.onUpdateSlot(slot.id, { name: e.target.value })}
              />
              {(p.slotTableCount.get(slot.id) ?? 0) > 0 && (
                <span className="slot-count" title="Tables de ce modèle sur le canvas">{p.slotTableCount.get(slot.id)}</span>
              )}
              <span className={`badge ${kind}`}>{kindBadge[kind] ?? kind}</span>
              <button
                className="icon-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  const n = p.slotTableCount.get(slot.id) ?? 0;
                  if (!slot.hidden && n === 0) {
                    // Aucune table rattachée (import antérieur au suivi par modèle)
                    // : le dire clairement au lieu de ne rien faire en silence.
                    p.onUpdateSlot(slot.id, {
                      hidden: true,
                      msg: "Aucune table rattachée à ce modèle sur le canvas. Ré-ajoute-le via ＋ Ajouter pour pouvoir le masquer.",
                    });
                  } else {
                    p.onUpdateSlot(slot.id, { hidden: !slot.hidden });
                  }
                }}
                title={slot.hidden ? "Afficher ce modèle sur le canvas" : "Masquer ce modèle du canvas"}
              >
                {slot.hidden ? "Voir" : "Masquer"}
              </button>
              <button className="icon-btn danger" onClick={(e) => { e.stopPropagation(); p.onDeleteSlot(slot.id); }} title="Retirer ce modèle du panneau">✕</button>
            </div>
            {!slot.collapsed && (
              <>
                <textarea
                  value={slot.source}
                  onChange={(e) => p.onUpdateSlot(slot.id, { source: e.target.value, msg: "" })}
                  placeholder="Colle ici ton schema.prisma, ton drizzle schema.ts ou ton CREATE TABLE…"
                  spellCheck={false}
                />
                <div className="row">
                  <button className="btn small primary full" onClick={() => p.onMergeSlot(slot)} title="Garde les modèles déjà sur la grille et ajoute celui-ci à la suite">
                    ＋ Ajouter {i === 0 ? "" : `#${i + 1}`} ↗
                  </button>
                </div>
                {slot.msg && <p className="msg">{slot.msg}</p>}
                <div className="examples">
                  <span>ex :</span>
                  <button onClick={() => p.onUpdateSlot(slot.id, { source: EXAMPLE_PRISMA, msg: "" })}>Prisma</button>
                  <button onClick={() => p.onUpdateSlot(slot.id, { source: EXAMPLE_DRIZZLE, msg: "" })}>Drizzle</button>
                  <button onClick={() => p.onUpdateSlot(slot.id, { source: EXAMPLE_SQL, msg: "" })}>SQL</button>
                  <button onClick={() => p.onPickTextFile(slot.id)}>Fichier…</button>
                </div>
              </>
            )}
          </div>
        );
      })}
      {p.parseMsg && <p className="msg">{p.parseMsg}</p>}

      <h4>Modèles de base — 0X /</h4>
      <div className="row">
        <button className="btn small primary full" onClick={p.onGallery}>+ Voir les 6 modèles ↗</button>
      </div>

      <h4>Diagnostic +</h4>
      <div className="issues">
        {p.issues.length === 0 && <div className="issue ok">✓ Aucun problème : PK ok, liens résolus.</div>}
        {p.issues.slice(0, 8).map((it, i) => (
          <div key={i} className={`issue ${it.level === "err" ? "err" : ""}`}>
            <span className="tag">{it.level === "err" ? "ERR" : "WARN"}</span>{it.text}
          </div>
        ))}
        {p.issues.length > 8 && <p className="muted">+ {p.issues.length - 8} autre(s)…</p>}
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
        <button className="btn small" onClick={p.onPickJsonFile}>Importer JSON…</button>
        <button className="btn small" onClick={p.onTour} title="Revoir la visite guidée">? Visite</button>
      </div>
    </aside>
  );
}
