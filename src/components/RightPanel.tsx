import type { DBField, DBModel, DBTable } from "../types";
import { MCD_CARDS, mcdCards } from "../types";
import { RelationForm, type RelFormState } from "./RelationForm";

// Liste complète des types de champs (Postgres-first) : on choisit, on n'écrit plus.
const FIELD_TYPE_GROUPS: { label: string; types: string[] }[] = [
  { label: "Identifiants auto", types: ["SERIAL", "BIGSERIAL", "SMALLSERIAL"] },
  { label: "Entiers", types: ["SMALLINT", "INTEGER", "BIGINT"] },
  {
    label: "Nombres",
    types: ["DECIMAL", "NUMERIC", "REAL", "FLOAT", "DOUBLE PRECISION", "MONEY"],
  },
  {
    label: "Texte",
    types: ["CHAR(1)", "VARCHAR(50)", "VARCHAR(100)", "VARCHAR(255)", "TEXT", "CITEXT"],
  },
  { label: "Booléen", types: ["BOOLEAN"] },
  {
    label: "Dates & heures",
    types: ["DATE", "TIME", "TIMESTAMP", "TIMESTAMPTZ", "INTERVAL"],
  },
  { label: "UUID", types: ["UUID"] },
  { label: "Réseau", types: ["INET", "CIDR", "MACADDR"] },
  { label: "JSON", types: ["JSON", "JSONB"] },
  { label: "Binaire", types: ["BYTEA"] },
];
const ALL_FIELD_TYPES = new Set(FIELD_TYPE_GROUPS.flatMap((g) => g.types));

interface RightPanelProps {
  model: DBModel;
  selected: DBTable | null;
  relForm: RelFormState;
  onRelForm: (f: RelFormState) => void;
  onRenameTable: (id: string, name: string) => void;
  onAddTable: () => void;
  onAddField: (tableId: string) => void;
  onDuplicateTable: (id: string) => void;
  onDeleteTable: (id: string) => void;
  onUpdateField: (tableId: string, fieldId: string, patch: Partial<DBField>) => void;
  onDeleteField: (tableId: string, fieldId: string) => void;
  onAddRelation: () => void;
  onDeleteRelation: (id: string) => void;
  onUpdateCards: (id: string, side: "a" | "b", value: string) => void;
  onSuggestFrom: (src: string, dst: string) => string;
  onSuggestTo: (dst: string) => string;
  onHide: () => void;
  onDeselect: () => void;
}

export function RightPanel(p: RightPanelProps) {
  const { selected } = p;
  return (
    <aside className="panel right">
      {!selected ? (
        <>
          <div className="panel-title"><span><span className="num">02 /</span> Édition</span>
            <button className="icon-btn" onClick={p.onHide}>⟩</button>
          </div>
          <p className="muted">Clique sur une table du canvas pour la modifier ici.</p>
          <button className="btn full" onClick={p.onAddTable}>＋ Ajouter une table</button>
          <h4>Relations ({p.model.relations.length})</h4>
          <div className="rellist">
          {p.model.relations.map((r) => {
              const { a, b } = mcdCards(r);
              return (
                <div key={r.id} className="rel mcd">
                  <span className="rel-link">{r.fromTable}.{r.fromField} <b>→</b> {r.toTable}.{r.toField}</span>
                  <span className="rel-cards">
                    <select value={a} onChange={(e) => p.onUpdateCards(r.id, "a", e.target.value)} title={`Cardinalité côté ${r.fromTable}`}>
                      {MCD_CARDS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <i>—</i>
                    <select value={b} onChange={(e) => p.onUpdateCards(r.id, "b", e.target.value)} title={`Cardinalité côté ${r.toTable}`}>
                      {MCD_CARDS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </span>
                  <button className="icon-btn" onClick={() => p.onDeleteRelation(r.id)}>✕</button>
                </div>
              );
            })}
            {p.model.relations.length === 0 && <p className="muted">Aucune relation. Crée-en une ci-dessous.</p>}
          </div>
          <h4>Relier 2 entités +</h4>
          <RelationForm
            model={p.model} form={p.relForm} setForm={p.onRelForm} onAdd={p.onAddRelation}
            suggestFrom={p.onSuggestFrom} suggestTo={p.onSuggestTo}
          />
        </>
      ) : (
        <>
          <div className="panel-title"><span>» {selected.name}</span>
            <span style={{ display: "flex", gap: 4 }}>
              <button className="icon-btn" onClick={p.onDeselect}>✕</button>
              <button className="icon-btn" onClick={p.onHide}>⟩</button>
            </span>
          </div>
          <label className="lbl">Nom de la table</label>
          <input value={selected.name} onChange={(e) => p.onRenameTable(selected.id, e.target.value)} />
          <div className="row">
            <button className="btn small" onClick={() => p.onAddField(selected.id)}>＋ Champ</button>
            <button className="btn small" onClick={() => p.onDuplicateTable(selected.id)}>Dupliquer</button>
            <button className="btn small danger" onClick={() => p.onDeleteTable(selected.id)}>Supprimer</button>
          </div>
          <h4>Champs</h4>
          <div className="fields">
            {selected.fields.map((f) => (
              <div key={f.id} className="field-edit">
                <input className="fname-in" value={f.name} onChange={(e) => p.onUpdateField(selected.id, f.id, { name: e.target.value })} />
                <select
                  className="ftype-in" value={f.type}
                  onChange={(e) => p.onUpdateField(selected.id, f.id, { type: e.target.value })}
                  title="Type du champ — choisir dans la liste"
                >
                  {!ALL_FIELD_TYPES.has(f.type) && <option value={f.type}>{f.type} (importé)</option>}
                  {FIELD_TYPE_GROUPS.map((g) => (
                    <optgroup key={g.label} label={g.label}>
                      {g.types.map((t) => <option key={t} value={t}>{t}</option>)}
                    </optgroup>
                  ))}
                </select>
                <div className="checks">
                  <label><input type="checkbox" checked={!!f.pk} onChange={(e) => p.onUpdateField(selected.id, f.id, { pk: e.target.checked, nullable: e.target.checked ? false : f.nullable })} /> PK</label>
                  <label><input type="checkbox" checked={!!f.fk} onChange={(e) => p.onUpdateField(selected.id, f.id, { fk: e.target.checked })} /> FK</label>
                  <label><input type="checkbox" checked={!!f.unique} onChange={(e) => p.onUpdateField(selected.id, f.id, { unique: e.target.checked })} /> UQ</label>
                  <label><input type="checkbox" checked={f.nullable !== false} onChange={(e) => p.onUpdateField(selected.id, f.id, { nullable: e.target.checked })} /> NULL</label>
                </div>
                <button className="icon-btn danger" onClick={() => p.onDeleteField(selected.id, f.id)}>✕</button>
              </div>
            ))}
          </div>
          <h4>Relations de cette table</h4>
          <div className="rellist">
            {p.model.relations.filter((r) => r.fromTable === selected.name || r.toTable === selected.name).map((r) => {
              const { a, b } = mcdCards(r);
              return (
                <div key={r.id} className="rel mcd">
                  <span className="rel-link">{r.fromTable}.{r.fromField} <b>→</b> {r.toTable}.{r.toField}</span>
                  <span className="rel-cards">
                    <select value={a} onChange={(e) => p.onUpdateCards(r.id, "a", e.target.value)} title={`Cardinalité côté ${r.fromTable}`}>
                      {MCD_CARDS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <i>—</i>
                    <select value={b} onChange={(e) => p.onUpdateCards(r.id, "b", e.target.value)} title={`Cardinalité côté ${r.toTable}`}>
                      {MCD_CARDS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </span>
                  <button className="icon-btn" onClick={() => p.onDeleteRelation(r.id)}>✕</button>
                </div>
              );
            })}
          </div>
          <h4>Relier à une autre entité +</h4>
          <RelationForm
            model={p.model} form={p.relForm} setForm={p.onRelForm} onAdd={p.onAddRelation}
            preset={selected.name} suggestFrom={p.onSuggestFrom} suggestTo={p.onSuggestTo}
          />
        </>
      )}
    </aside>
  );
}
