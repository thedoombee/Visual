import { listExporters } from "../domain/exporters";
import type { ImportSlot, Instance } from "../types";

export type ExportScope =
  | { kind: "canvas" }
  | { kind: "instance"; instanceId: string }
  | { kind: "slot"; slotId: string };

interface ExportModalProps {
  formatId: string;
  onFormat: (id: string) => void;
  scope: ExportScope;
  onScope: (s: ExportScope) => void;
  instances: Instance[];
  slots: ImportSlot[];
  /** Aperçu du contenu (fichier unique, ou 1er fichier du ZIP). */
  previewText: string;
  previewFileName: string;
  /** Nb de fichiers que contiendra le ZIP (0 = pas de ZIP pour ce choix). */
  zipFiles: number;
  scopeLabel: string;
  onClose: () => void;
  onCopy: () => void;
  onDownload: () => void;
  onDownloadZip: () => void;
  onExportPNG: () => void;
  onExportSVG: () => void;
}

export function ExportModal(p: ExportModalProps) {
  const exporters = listExporters();
  return (
    <div className="modal-bg" onClick={p.onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><strong>EXPORT <span>UNIQUE</span></strong>
          <button className="icon-btn" onClick={p.onClose}>✕ FERMER</button>
        </div>
        <div className="exp-chooser">
          <div className="exp-block">
            <span className="lbl">1 · Périmètre</span>
            <div className="row">
              <button
                className={`exp-tab ${p.scope.kind === "canvas" ? "active" : ""}`}
                onClick={() => p.onScope({ kind: "canvas" })}
              >
                Canvas visible
              </button>
              <select
                value={p.scope.kind === "instance" ? p.scope.instanceId : ""}
                onChange={(e) => (e.target.value ? p.onScope({ kind: "instance", instanceId: e.target.value }) : p.onScope({ kind: "canvas" }))}
                title="Exporter une instance (ZIP : un fichier par modèle)"
              >
                <option value="">Instance…</option>
                {p.instances.map((i) => (
                  <option key={i.id} value={i.id}>⧉ {i.name}</option>
                ))}
              </select>
              <select
                value={p.scope.kind === "slot" ? p.scope.slotId : ""}
                onChange={(e) => (e.target.value ? p.onScope({ kind: "slot", slotId: e.target.value }) : p.onScope({ kind: "canvas" }))}
                title="Exporter un seul modèle"
              >
                <option value="">Modèle…</option>
                {p.slots.map((s) => (
                  <option key={s.id} value={s.id}>▤ {s.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="exp-block">
            <span className="lbl">2 · Format</span>
            <div className="row">
              {exporters.map((e) => (
                <button
                  key={e.id}
                  className={`exp-tab ${p.formatId === e.id ? "active" : ""}`}
                  onClick={() => p.onFormat(e.id)}
                  title={e.label}
                >
                  {e.id.toUpperCase()}
                </button>
              ))}
              <button className="exp-tab" onClick={p.onExportPNG} title="Image PNG haute lisibilité du périmètre">PNG</button>
            </div>
          </div>
        </div>
        <div className="exp-scopebar">
          <span className="exp-scope">{p.scopeLabel}</span>
          {p.zipFiles > 1 && <span className="badge sql">ZIP · {p.zipFiles} fichiers</span>}
        </div>
        <pre>{p.previewText || "— Rien à exporter pour ce périmètre —"}</pre>
        <div className="barcode" />
        <div className="row">
          <button className="btn" onClick={p.onCopy}>Copier</button>
          {p.zipFiles > 1 ? (
            <button className="btn primary" onClick={p.onDownloadZip}>
              ⤓ instance-{p.formatId}.zip ({p.zipFiles} modèles)
            </button>
          ) : (
            <button className="btn primary" onClick={p.onDownload}>⤓ {p.previewFileName}</button>
          )}
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={p.onExportPNG}>⤓ PNG</button>
          <button className="btn" onClick={p.onExportSVG}>SVG</button>
        </div>
      </div>
    </div>
  );
}
