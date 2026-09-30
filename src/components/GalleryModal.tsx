import { detectKind, parseAuto } from "../parsers";
import { STARTERS, type StarterPack } from "../templates";

interface GalleryModalProps {
  customName: string;
  customSource: string;
  onCustomName: (v: string) => void;
  onCustomSource: (v: string) => void;
  onAddCustom: () => void;
  onLoadStarter: (pack: StarterPack) => void;
  onClose: () => void;
}

export function GalleryModal(p: GalleryModalProps) {
  return (
    <div className="modal-bg" onClick={p.onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <strong>MODÈLES <span>DE BASE+</span></strong>
          <span className="muted">01—06 · AJOUTER = canvas + panneau gauche · relie à la main ensuite</span>
          <button className="icon-btn" onClick={p.onClose}>✕ FERMER</button>
        </div>
        <div className="lots-grid">
          <div className="lot-card custom">
            <div className="lot-top"><b>+ / PERSO</b><span>{detectKind(p.customSource) === "unknown" ? "COLLE TON SCHEMA" : detectKind(p.customSource).toUpperCase() + " DÉTECTÉ"}</span></div>
            <h3>Modèle perso</h3>
            <div className="tagline">+ ton schema → panneau gauche</div>
            <input
              className="custom-name" placeholder="Nom du modèle… (ex : boutique)"
              value={p.customName} onChange={(e) => p.onCustomName(e.target.value)}
            />
            <textarea
              className="custom-src" placeholder="Colle ici ton CREATE TABLE / model / pgTable…"
              value={p.customSource} onChange={(e) => p.onCustomSource(e.target.value)} spellCheck={false}
            />
            <p className="desc">Il apparaîtra dans le panneau gauche comme les autres : pliable, ajoutable, exportable.</p>
            <div className="lot-actions">
              <button className="go" disabled={!p.customSource.trim()} onClick={p.onAddCustom}>+ Ajouter au panneau ↗</button>
            </div>
          </div>
          {STARTERS.map((pack) => {
            const parsed = parseAuto(pack.sql).model;
            return (
              <div key={pack.id} className="lot-card">
                <div className="lot-top"><b>{pack.numero} / 06</b><span>{parsed.tables.length} TABLES · {parsed.relations.length} LIENS</span></div>
                <h3>{pack.titre}</h3>
                <div className="tagline">+ {pack.tagline}</div>
                <p className="desc">{pack.description}</p>
                <div className="tables">{parsed.tables.map((t) => t.name).join(" · ")}</div>
                <div className="lot-actions">
                  <button className="go" onClick={() => p.onLoadStarter(pack)}>+ Ajouter ↗</button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="barcode" />
        <div className="row">
          <span className="muted">Après l'ajout : sélectionne 2 entités sur le canvas et définis leurs cardinalités MCD.</span>
          <span style={{ flex: 1 }} />
          <button className="btn primary" onClick={p.onClose}>Retour au canvas ↗</button>
        </div>
      </div>
    </div>
  );
}
