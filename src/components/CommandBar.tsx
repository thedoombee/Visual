import type { ModelIssue } from "../domain/model";

interface CommandBarProps {
  tables: number;
  relations: number;
  fields: number;
  issues: ModelIssue[];
  query: string;
  onQuery: (q: string) => void;
  /** Ouvre le menu d'export unique (choix du format dans le modal). */
  onExport: () => void;
  /** Ouvre le partage du canvas (lien figé). */
  onShare: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onGallery: () => void;
  showLeft: boolean;
  onToggleLeft: () => void;
  showRight: boolean;
  onToggleRight: () => void;
  onFocus: () => void;
  savedAt: string;
}

export function CommandBar(p: CommandBarProps) {
  return (
    <nav className="cmdbar">
      <div className="cmd-brand" title="MCD Studio — Prisma · Drizzle · SQL → diagramme">
        MCD<span className="red">+</span>STUDIO
      </div>
      <div
        className="cmd-stats"
        title={p.issues.length ? p.issues.slice(0, 5).map((i) => `• ${i.text}`).join("\n") : "Aucun problème détecté"}
      >
        <span><b>{p.tables}</b> TABLES</span>
        <span><b className="red">{p.relations}</b> LIENS</span>
        <span><b>{p.fields}</b> CHAMPS</span>
        {p.issues.length
          ? <span className="cmd-diag err">! {p.issues.length}</span>
          : <span className="cmd-diag ok">✓</span>}
      </div>
      <input
        className="cmd-search" placeholder="Rechercher table / champ…"
        value={p.query} onChange={(e) => p.onQuery(e.target.value)}
      />
      <div className="cmd-group" id="tour-export" title="Exporter : choisis le format dans le menu">
        <button className="btn small primary" onClick={p.onExport}>⤓ Exporter</button>
        <button className="btn small" onClick={p.onShare} title="Créer un lien figé du canvas visible (partage lecture seule)">🔗 Partager</button>
      </div>
      <div className="cmd-group">
        <button className="btn small" onClick={p.onUndo} disabled={!p.canUndo} title="Annuler (Ctrl+Z)">↩</button>
        <button className="btn small" onClick={p.onRedo} disabled={!p.canRedo} title="Rétablir (Ctrl+Y)">↪</button>
      </div>
      <button className="btn small primary" onClick={p.onGallery} title="Modèles de base + modèle perso">+ Modèles</button>
      <div className="cmd-group">
        <button className={p.showLeft ? "btn small active" : "btn small"} onClick={p.onToggleLeft} title="Panneau des modèles ( [ )">
          {p.showLeft ? "⟨ Modèles" : "Modèles ⟩"}
        </button>
        <button className={p.showRight ? "btn small active" : "btn small"} onClick={p.onToggleRight} title="Panneau d'édition ( ] )">
          {p.showRight ? "Édition ⟩" : "⟨ Édition"}
        </button>
        <button className="btn small" onClick={p.onFocus} title="Plein écran canvas (M)">⤢</button>
      </div>
      {p.savedAt && <span className="cmd-saved">✓ {p.savedAt}</span>}
    </nav>
  );
}
