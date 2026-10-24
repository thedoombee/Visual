import { useEffect } from "react";
import type { DBModel, DBTable } from "../types";
import { MCD_CARDS } from "../types";
import { inferCardsForTable } from "../domain/model";

export interface RelFormState {
  fromTableId: string;
  fromField: string;
  toTableId: string;
  toField: string;
  cardA: string;
  cardB: string;
}

interface RelationFormProps {
  model: DBModel;
  form: RelFormState;
  setForm: (f: RelFormState) => void;
  onAdd: () => void;
  /** Table source pré-sélectionnée (édition d'une table). */
  presetId?: string;
  suggestFrom: (srcId: string, dstId: string) => string;
  suggestTo: (dstId: string) => string;
  /** Libellé qualifié quand deux instances partagent le même nom de table. */
  tableLabel: (t: DBTable) => string;
}

export function RelationForm({
  model,
  form,
  setForm,
  onAdd,
  presetId,
  suggestFrom,
  suggestTo,
  tableLabel,
}: RelationFormProps) {
  useEffect(() => {
    if (presetId && !form.fromTableId) {
      setForm({ ...form, fromTableId: presetId, fromField: suggestFrom(presetId, form.toTableId) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetId]);
  const src = model.tables.find((t) => t.id === form.fromTableId);
  const dst = model.tables.find((t) => t.id === form.toTableId);
  const srcFields = src?.fields ?? [];
  const dstFields = dst?.fields ?? [];
  const pickSrcTable = (id: string) => {
    const fromField = id ? suggestFrom(id, form.toTableId) : "";
    const cards = fromField ? inferCardsForTable(model.tables.find((t) => t.id === id), fromField) : null;
    setForm({
      ...form, fromTableId: id, fromField,
      ...(cards ? { cardA: cards.fromCard, cardB: cards.toCard } : null),
    });
  };
  const pickSrcField = (name: string) => {
    const cards = name ? inferCardsForTable(src, name) : null;
    setForm({
      ...form, fromField: name,
      ...(cards ? { cardA: cards.fromCard, cardB: cards.toCard } : null),
    });
  };
  const pickDstTable = (id: string) => {
    const toField = id ? suggestTo(id) : "";
    const fromField = form.fromTableId ? suggestFrom(form.fromTableId, id) : form.fromField;
    // Re-suggère le champ source qui vise cette entité (xxx_id) + ses cartes Merise.
    const cards = fromField ? inferCardsForTable(src, fromField) : null;
    setForm({
      ...form, toTableId: id, toField, fromField,
      ...(cards ? { cardA: cards.fromCard, cardB: cards.toCard } : null),
    });
  };
  return (
    <div className="relform">
      <label className="lbl">Entité source (porteuse du lien)</label>
      <select value={form.fromTableId} onChange={(e) => pickSrcTable(e.target.value)}>
        <option value="">— choisir une entité —</option>
        {model.tables.map((t) => <option key={t.id} value={t.id}>{tableLabel(t)}</option>)}
      </select>
      <label className="lbl">Champ source</label>
      <select value={form.fromField} onChange={(e) => pickSrcField(e.target.value)}>
        <option value="">— choisir —</option>
        {srcFields.map((f) => <option key={f.id} value={f.name}>{f.name} · {f.type}</option>)}
      </select>
      <label className="lbl">Entité cible</label>
      <select value={form.toTableId} onChange={(e) => pickDstTable(e.target.value)}>
        <option value="">— choisir une entité —</option>
        {model.tables.map((t) => <option key={t.id} value={t.id}>{tableLabel(t)}</option>)}
      </select>
      <label className="lbl">Champ cible</label>
      <select value={form.toField} onChange={(e) => setForm({ ...form, toField: e.target.value })}>
        <option value="">— choisir —</option>
        {dstFields.map((f) => <option key={f.id} value={f.name}>{f.name} · {f.type}</option>)}
      </select>
      <div className="rel-cards-edit">
        <div>
          <label className="lbl">Côté {src?.name || "A"}</label>
          <select value={form.cardA} onChange={(e) => setForm({ ...form, cardA: e.target.value })}>
            {MCD_CARDS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <span className="plus">+</span>
        <div>
          <label className="lbl">Côté {dst?.name || "B"}</label>
          <select value={form.cardB} onChange={(e) => setForm({ ...form, cardB: e.target.value })}>
            {MCD_CARDS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <button className="btn primary full" onClick={onAdd}>
        Lier ({form.cardA} — {form.cardB}) ↗
      </button>
    </div>
  );
}
