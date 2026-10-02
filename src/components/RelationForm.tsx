import { useEffect } from "react";
import type { DBModel } from "../types";
import { MCD_CARDS } from "../types";

export interface RelFormState {
  fromTable: string;
  fromField: string;
  toTable: string;
  toField: string;
  cardA: string;
  cardB: string;
}

interface RelationFormProps {
  model: DBModel;
  form: RelFormState;
  setForm: (f: RelFormState) => void;
  onAdd: () => void;
  preset?: string;
  suggestFrom: (src: string, dst: string) => string;
  suggestTo: (dst: string) => string;
}

export function RelationForm({ model, form, setForm, onAdd, preset, suggestFrom, suggestTo }: RelationFormProps) {
  useEffect(() => {
    if (preset && !form.fromTable) {
      setForm({ ...form, fromTable: preset, fromField: suggestFrom(preset, form.toTable) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);
  const srcFields = model.tables.find((t) => t.name === form.fromTable)?.fields ?? [];
  const dstFields = model.tables.find((t) => t.name === form.toTable)?.fields ?? [];
  const pickSrcTable = (name: string) => setForm({
    ...form, fromTable: name,
    fromField: name ? suggestFrom(name, form.toTable) : "",
  });
  const pickDstTable = (name: string) => setForm({
    ...form, toTable: name,
    toField: name ? suggestTo(name) : "",
    // Re-suggère le champ source qui vise cette entité (xxx_id)
    fromField: form.fromTable ? suggestFrom(form.fromTable, name) : form.fromField,
  });
  return (
    <div className="relform">
      <label className="lbl">Entité source (porteuse du lien)</label>
      <select value={form.fromTable} onChange={(e) => pickSrcTable(e.target.value)}>
        <option value="">— choisir une entité —</option>
        {model.tables.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
      </select>
      <label className="lbl">Champ source</label>
      <select value={form.fromField} onChange={(e) => setForm({ ...form, fromField: e.target.value })}>
        <option value="">— choisir —</option>
        {srcFields.map((f) => <option key={f.id} value={f.name}>{f.name} · {f.type}</option>)}
      </select>
      <label className="lbl">Entité cible</label>
      <select value={form.toTable} onChange={(e) => pickDstTable(e.target.value)}>
        <option value="">— choisir une entité —</option>
        {model.tables.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
      </select>
      <label className="lbl">Champ cible</label>
      <select value={form.toField} onChange={(e) => setForm({ ...form, toField: e.target.value })}>
        <option value="">— choisir —</option>
        {dstFields.map((f) => <option key={f.id} value={f.name}>{f.name} · {f.type}</option>)}
      </select>
      <div className="rel-cards-edit">
        <div>
          <label className="lbl">Côté {form.fromTable || "A"}</label>
          <select value={form.cardA} onChange={(e) => setForm({ ...form, cardA: e.target.value })}>
            {MCD_CARDS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <span className="plus">+</span>
        <div>
          <label className="lbl">Côté {form.toTable || "B"}</label>
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
