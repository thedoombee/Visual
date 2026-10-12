import { useState } from "react";
import type { ShareKind } from "../services/share";
import type { PublishResult } from "../services/publish";

interface ShareModalProps {
  kind: ShareKind;
  targetName: string;
  /** URL locale figée (après clic "Créer le lien"). Ne sort pas de ta machine. */
  url: string;
  onCreate: () => void;
  /** Publie le schéma en image sur un hébergeur public → URL mondiale. */
  onPublishWorldwide: () => Promise<PublishResult>;
  onClose: () => void;
}

export function ShareModal(p: ShareModalProps) {
  const [copied, setCopied] = useState(false);
  const [pubBusy, setPubBusy] = useState(false);
  const [pub, setPub] = useState<PublishResult | null>(null);
  const [pubError, setPubError] = useState("");
  const [pubCopied, setPubCopied] = useState(false);

  const publish = async () => {
    setPubBusy(true);
    setPubError("");
    setPub(null);
    try {
      setPub(await p.onPublishWorldwide());
    } catch (e) {
      setPubError(e instanceof Error ? e.message : String(e));
    } finally {
      setPubBusy(false);
    }
  };

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
                Ce lien contient TOUT le schéma mais reste sur l'adresse de l'app :
                sur ton PC c'est du <code>localhost</code>, donc il ne s'ouvre que chez toi.
                Pour un lien mondial, publie ci-dessous — ou héberge l'app (Vercel /
                Netlify, gratuit) et ce même lien marchera partout, en interactif.
              </p>
            </>
          )}

          <div className="publish-box">
            <span className="lbl">🌍 Lien public mondial (ouvre-toi partout, sans ton PC)</span>
            <p className="muted">
              Publie le schéma en image sur un hébergeur public gratuit, sans compte.
              N'importe qui dans le monde verra ton MCD. Ton original reste inchangé.
            </p>
            {!pub ? (
              <button className="btn primary full" onClick={publish} disabled={pubBusy}>
                {pubBusy ? "Publication en cours… (envoi de l'image)" : "🌍 Publier « " + p.targetName + " » en ligne"}
              </button>
            ) : (
              <>
                <div className="row">
                  <input value={pub.url} readOnly onFocus={(e) => e.target.select()} title="Lien public mondial" />
                </div>
                <div className="row">
                  <button
                    className="btn primary"
                    onClick={() => {
                      void navigator.clipboard.writeText(pub.url);
                      setPubCopied(true);
                      setTimeout(() => setPubCopied(false), 1800);
                    }}
                  >
                    {pubCopied ? "✓ Copié !" : "Copier le lien mondial"}
                  </button>
                  <a className="btn" href={pub.url} target="_blank" rel="noreferrer">Ouvrir ↗</a>
                </div>
                <p className="muted">Hébergé chez {pub.host} · {pub.retention}. Pour un nouveau lien frais, re-publie.</p>
              </>
            )}
            {pubError && <p className="msg warn">{pubError}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
