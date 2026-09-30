import { TOUR_STEPS } from "../hooks/useTour";

interface TourOverlayProps {
  step: number;
  pos: { top: number; left: number } | null;
  onStep: (s: number) => void;
  onClose: () => void;
}

export function TourOverlay({ step, pos, onStep, onClose }: TourOverlayProps) {
  return (
    <>
      <div className="tour-bg" />
      <div
        className={`tour-card ${pos ? "" : "center"}`}
        style={pos ? { top: pos.top, left: pos.left } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tour-head">
          <span className="tour-step">{step + 1} / {TOUR_STEPS.length}</span>
          <button className="icon-btn" onClick={onClose} title="Fermer la visite">✕</button>
        </div>
        <h3>{TOUR_STEPS[step].title}</h3>
        <p>{TOUR_STEPS[step].text}</p>
        <div className="row">
          {step > 0 && (
            <button className="btn small" onClick={() => onStep(step - 1)}>← Retour</button>
          )}
          <span style={{ flex: 1 }} />
          <button className="btn small" onClick={onClose}>Passer</button>
          {step < TOUR_STEPS.length - 1 ? (
            <button className="btn small primary" onClick={() => onStep(step + 1)}>Suivant →</button>
          ) : (
            <button className="btn small primary" onClick={onClose}>C'est parti ↗</button>
          )}
        </div>
      </div>
    </>
  );
}
