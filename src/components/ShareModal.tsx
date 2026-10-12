import { useState } from "react";
import type { ShareKind } from "../services/share";

interface ShareModalProps {
  kind: ShareKind;
  targetName: string;
  /** URL figée (après clic "Créer le lien"). Mondiale une fois l'app hébergée. */
  url: string;
  onCreate: () => void;
  onClose: () => void;
}

export function ShareModal(p: ShareModalProps) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="modal-bg" onClick={p.onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <strong>PARTAGER <span>{p.kind === "instance" ? "L'INSTANCE" : p.kind === "slot" ? "LE MODÈLE" : "LE CANVAS"}</span></strong>
          <button className="icon-btn" onClick={p.onClose}>✕ FERMER</button>
        </div>
        <div className="share-body">
          <p>
            <b>« {p.targetName} »</b> — le lien fige la version <b>exacte</b> d'aujourd'hui :
            ce que tu feras après ne changera rien pour ton ami, sauf si tu génères
            un nouveau lien (mise à jour). Ton original reste intouchable : il peut
            voir, modifier <b>sa copie</b> et exporter, sans jamais toucher au tien.
          </p>
          {!p.url ? (
            <button className="btn primary full" onClick={p.onCreate}>🔗 Créer le lien de partage</button>
          ) : (
            <>
              <div className="row">
                <input value={p.url} readOnly onFocus={(e) => e.target.select()} title="Lien de partage (snapshot figé)" />
              </div>
              <div className="row">
                <button
                  className="btn primary"
                  onClick={() => {
                    void navigator.clipboard.writeText(p.url);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1800);
                  }}
                >
                  {copied ? "✓ Copié !" : "Copier le lien"}
                </button>
                <a className="btn" href={p.url} target="_blank" rel="noreferrer">Ouvrir ↗</a>
              </div>
              <p className="muted">
                Ce lien contient TOUT le schéma et s'ouvre sur l'adresse de l'app :
                hébergée, il marche partout dans le monde en interactif ; en
                <code>localhost</code>, il ne s'ouvre que sur ton PC.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
