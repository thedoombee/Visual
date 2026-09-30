interface StatusBarProps {
  msg: string;
  selectedName: string | null;
  selectedFields: number;
  zoomPct: number;
  savedAt: string;
}

export function StatusBar(p: StatusBarProps) {
  return (
    <div className="statusbar">
      <span className="status-msg">{p.msg || "Prêt — ajoute un modèle, relie ses entités, exporte."}</span>
      <span style={{ flex: 1 }} />
      {p.selectedName && <span className="status-sel">▸ {p.selectedName} · {p.selectedFields} champs</span>}
      <span>⤢ {p.zoomPct}%</span>
      {p.savedAt && <span>✓ {p.savedAt}</span>}
    </div>
  );
}
