import type { ExportView } from "./CommandBar";

interface ExportModalProps {
  view: ExportView;
  text: string;
  fileName: string;
  visibleTables: number;
  visibleRelations: number;
  totalTables: number;
  onView: (v: ExportView) => void;
  onClose: () => void;
  onDownload: () => void;
  onExportPNG: () => void;
  onExportSVG: () => void;
}

export function ExportModal(p: ExportModalProps) {
  return (
    <div className="modal-bg" onClick={p.onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><strong>EXPORT <span>CANVAS</span></strong>
          <button className="icon-btn" onClick={p.onClose}>✕ FERMER</button>
        </div>
        <div className="exp-tabs">
          {(["sql", "prisma", "drizzle", "json"] as const).map((v) => (
            <button key={v} className={`exp-tab ${p.view === v ? "active" : ""}`} onClick={() => p.onView(v)}>
              {v === "drizzle" ? "Drizzle (.ts)" : v === "prisma" ? "Prisma (.prisma)" : v === "json" ? "JSON" : "SQL"}
            </button>
          ))}
          <span className="exp-scope">
            {p.view === "json"
              ? <>sauvegarde complète · {p.totalTables} tables (modèles masqués inclus)</>
              : <>{p.visibleTables} table(s) visible(s) · {p.visibleRelations} lien(s) — masque un modèle pour l'exclure</>}
          </span>
        </div>
        <pre>{p.text}</pre>
        <div className="barcode" />
        <div className="row">
          <button className="btn" onClick={() => navigator.clipboard.writeText(p.text)}>Copier</button>
          <button className="btn primary" onClick={p.onDownload}>⤓ {p.fileName}</button>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={p.onExportPNG}>⤓ PNG</button>
          <button className="btn" onClick={p.onExportSVG}>SVG</button>
        </div>
      </div>
    </div>
  );
}
