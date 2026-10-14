import { useState } from "react";
import type { ImportSlot, Instance } from "../types";
import type { ModelIssue } from "../domain/model";
import { detectKind } from "../parsers";
import { EXAMPLE_DRIZZLE, EXAMPLE_PRISMA, EXAMPLE_SQL } from "../examples";
import { describeSlotVisibility, slotsOfInstance, tablesOfInstance, unassignedSlots } from "../domain/instances";
import type { DBModel } from "../types";

const kindBadge: Record<string, string> = { prisma: "Prisma", drizzle: "Drizzle", sql: "SQL", unknown: "Auto" };

interface LeftPanelProps {
  slots: ImportSlot[];
  instances: Instance[];
  model: DBModel;
  slotTableCount: Map<string, number>;
  issues: ModelIssue[];
  parseMsg: string;
  onUpdateSlot: (id: string, patch: Partial<ImportSlot>) => void;
  onAddSlot: () => void;
  onDeleteSlot: (id: string) => void;
  onMergeSlot: (slot: ImportSlot) => void;
  onAddInstance: () => void;
  onRenameInstance: (id: string, name: string) => void;
  onToggleInstanceHidden: (id: string) => void;
  onToggleInstanceCollapsed: (id: string) => void;
  onDeleteInstance: (id: string) => void;
  onAssignSlot: (slotId: string, instanceId?: string) => void;
  onSmartLayout: () => void;
  onShowAll: () => void;
  onLayoutInstance: (id: string) => void;
  onIsolateInstance: (id: string) => void;
  onExportInstance: (id: string) => void;
  onShareSlot: (id: string) => void;
  onShareInstance: (id: string) => void;
  onHide: () => void;
  onGallery: () => void;
  onTour: () => void;
  onPickTextFile: (slotId: string) => void;
  onPickJsonFile: () => void;
}

function SlotCard(p: LeftPanelProps & { slot: ImportSlot; index: number }) {
  const { slot } = p;
  const kind = detectKind(slot.source);
  // Reflet du masquage d'instance : le flag propre n'est jamais écrasé, on
  // affiche l'état EFFECTIF (badge "via ⧉ projet") pour ne pas embrouiller.
  const vis = describeSlotVisibility(slot, p.instances);
  const eyeLabel = vis.ownHidden ? "Afficher ce modèle sur le canvas" : "Masquer ce modèle du canvas";
  return (
    <div className={`slot ${slot.collapsed ? "folded" : ""} ${vis.effectiveHidden ? "masked" : ""} ${vis.viaInstanceName ? "via-instance" : ""}`}>
      <div className="slot-head" onClick={() => p.onUpdateSlot(slot.id, { collapsed: !slot.collapsed })} title="Plier / déplier">
        <span className="slot-fold">{slot.collapsed ? "▸" : "▾"}</span>
        <input
          className="slot-name" value={slot.name}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => p.onUpdateSlot(slot.id, { name: e.target.value })}
        />
        {(p.slotTableCount.get(slot.id) ?? 0) > 0 && (
          <span className="slot-count" title="Tables de ce modèle sur le canvas">{p.slotTableCount.get(slot.id)}</span>
        )}
        <span className={`badge ${kind}`}>{kindBadge[kind] ?? kind}</span>
        {vis.viaInstanceName && (
          <span className="via-badge" title={`Masqué parce que l'instance « ${vis.viaInstanceName} » est masquée. Ton réglage perso est conservé : ré-affiche l'instance pour revoir ce modèle.`}>
            via ⧉ {vis.viaInstanceName}
          </span>
        )}
        <button
          className="icon-btn"
          onClick={(e) => {
            e.stopPropagation();
            const n = p.slotTableCount.get(slot.id) ?? 0;
            if (!slot.hidden && n === 0) {
              p.onUpdateSlot(slot.id, {
                hidden: true,
                msg: "Aucune table rattachée à ce modèle sur le canvas. Ré-ajoute-le via ＋ Ajouter pour pouvoir le masquer.",
              });
            } else if (vis.viaInstanceName && slot.hidden) {
              // Le modèle est déjà marqué "masqué" côté perso : inutile d'insister,
              // c'est l'instance qui le cache. On l'explique au lieu de surprendre.
              p.onUpdateSlot(slot.id, {
                msg: `Toujours masqué : l'instance « ${vis.viaInstanceName} » est masquée. Ré-affiche-la (« Voir » sur le projet) pour revoir ce modèle.`,
              });
            } else if (vis.viaInstanceName && !slot.hidden) {
              p.onUpdateSlot(slot.id, {
                hidden: true,
                msg: `« ${slot.name} » restera caché tant que l'instance « ${vis.viaInstanceName} » est masquée — et le restera même après son retour, jusqu'à ce que tu cliques « Voir ».`,
              });
            } else {
              p.onUpdateSlot(slot.id, { hidden: !slot.hidden });
            }
          }}
          title={vis.viaInstanceName ? `${eyeLabel} (reste caché tant que « ${vis.viaInstanceName} » est masquée)` : eyeLabel}
        >
          {vis.ownHidden ? "Voir" : "Masquer"}
        </button>
        <button className="icon-btn danger" onClick={(e) => { e.stopPropagation(); p.onDeleteSlot(slot.id); }} title="Retirer ce modèle du panneau">✕</button>
      </div>
      {!slot.collapsed && (
        <>
          <div className="row slot-assign">
            <select
              value={slot.instanceId ?? ""}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => p.onAssignSlot(slot.id, e.target.value || undefined)}
              title="Ranger ce modèle dans une instance (projet)"
            >
              <option value="">Sans instance…</option>
              {p.instances.map((i) => (
                <option key={i.id} value={i.id}>⧉ {i.name}</option>
              ))}
            </select>
            <button className="btn small" onClick={(e) => { e.stopPropagation(); p.onShareSlot(slot.id); }} title="Créer un lien figé de ce modèle">🔗</button>
          </div>
          <textarea
            value={slot.source}
            onChange={(e) => p.onUpdateSlot(slot.id, { source: e.target.value, msg: "" })}
            placeholder="Colle ici ton schema.prisma, ton drizzle schema.ts ou ton CREATE TABLE…"
            spellCheck={false}
          />
          <div className="row">
            {(() => {
              const n = p.slotTableCount.get(slot.id) ?? 0;
              return n > 0 ? (
                <button className="btn small primary full" onClick={() => p.onMergeSlot(slot)} title="Re-synchronise ce modèle sur le canvas : champs fusionnés, tables ajoutées/retirées, FK auto">
                  ⟳ Modifier #{p.index + 1} ↗
                </button>
              ) : (
                <button className="btn small primary full" onClick={() => p.onMergeSlot(slot)} title="Garde les modèles déjà sur la grille et ajoute celui-ci à la suite">
                  ＋ Ajouter #{p.index + 1} ↗
                </button>
              );
            })()}
          </div>
          {slot.msg && <p className="msg">{slot.msg}</p>}
          <div className="examples">
            <span>ex :</span>
            <button onClick={() => p.onUpdateSlot(slot.id, { source: EXAMPLE_PRISMA, msg: "" })}>Prisma</button>
            <button onClick={() => p.onUpdateSlot(slot.id, { source: EXAMPLE_DRIZZLE, msg: "" })}>Drizzle</button>
            <button onClick={() => p.onUpdateSlot(slot.id, { source: EXAMPLE_SQL, msg: "" })}>SQL</button>
            <button onClick={() => p.onPickTextFile(slot.id)}>Fichier…</button>
          </div>
        </>
      )}
    </div>
  );
}

/** Bloc instance (section 01) : quand l'instance est masquée, ses modèles se
 * replient en UNE ligne dropdown avec compteur — ça allège la vue. */
function InstanceBlock({ inst, ...rest }: LeftPanelProps & { inst: Instance }) {
  const [showMasked, setShowMasked] = useState(false);
  const members = slotsOfInstance(rest.slots, inst.id);
  const tables = tablesOfInstance(rest.model, rest.slots, inst.id);
  return (
    <div key={inst.id} className={`instance ${inst.hidden ? "masked" : ""}`}>
      <div className="instance-head" onClick={() => rest.onToggleInstanceCollapsed(inst.id)} title="Plier / déplier l'instance">
        <span className="slot-fold">{inst.collapsed ? "▸" : "▾"}</span>
        <span className="instance-dot" style={{ background: inst.color ?? "#FF2B1D" }} />
        <input
          className="slot-name" value={inst.name}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => rest.onRenameInstance(inst.id, e.target.value)}
          title="Nom de l'instance (projet)"
        />
        <span className="slot-count" title={`${tables.length} table(s) · ${members.length} modèle(s)`}>
          {tables.length}T · {members.length}M
        </span>
      </div>
      {!inst.collapsed && (
        <div className="instance-body">
          <div className="row">
            <button className="btn small" onClick={() => rest.onToggleInstanceHidden(inst.id)} title="Masquer / afficher toute l'instance sur le canvas">
              {inst.hidden ? "Voir" : "Masquer"}
            </button>
            <button className="btn small" onClick={() => rest.onIsolateInstance(inst.id)} title="Ne garder que cette instance visible (un projet à la fois)">Isoler</button>
            <button className="btn small" onClick={() => rest.onLayoutInstance(inst.id)} title="Ranger les tables de cette instance">▦</button>
            <button className="btn small" onClick={() => rest.onExportInstance(inst.id)} title="Exporter l'instance (ZIP : un fichier par modèle)">⤓ ZIP</button>
            <button className="btn small" onClick={() => rest.onShareInstance(inst.id)} title="Créer un lien figé de cette instance">🔗</button>
            <button className="icon-btn danger" onClick={() => rest.onDeleteInstance(inst.id)} title="Supprimer l'instance (les modèles sont conservés, détachés)">✕</button>
          </div>
          {members.length === 0 && <p className="muted">Vide — assigne des modèles via « Sans instance… ».</p>}
          {members.length > 0 && inst.hidden && !showMasked && (
            <button
              className="masked-drop-head"
              onClick={() => setShowMasked(true)}
              title="Déplier la liste des modèles masqués"
            >
              ▸ {members.length} modèle(s) masqué(s) — déplier
            </button>
          )}
          {(!inst.hidden || showMasked) && members.map((s) => {
            const mv = describeSlotVisibility(s, rest.instances);
            return (
              <div key={s.id} className={`instance-member ${mv.effectiveHidden ? "is-hidden" : ""}`}>
                <span className="member-name" title={`${rest.slotTableCount.get(s.id) ?? 0} table(s) sur le canvas${mv.viaInstanceName ? ` · masqué via l'instance « ${mv.viaInstanceName} »` : mv.ownHidden ? " · masqué (réglage du modèle)" : ""}`}>▤ {s.name}</span>
                <span className="member-state" title={mv.viaInstanceName ? `Caché parce que « ${mv.viaInstanceName} » est masquée` : mv.ownHidden ? "Caché (réglage du modèle)" : "Visible"}>
                  {mv.viaInstanceName ? "via ⧉" : mv.ownHidden ? "caché" : "visible"}
                </span>
                <button className="icon-btn" onClick={() => rest.onAssignSlot(s.id, undefined)} title="Retirer de l'instance">⇤</button>
              </div>
            );
          })}
          {inst.hidden && showMasked && (
            <button className="masked-drop-head" onClick={() => setShowMasked(false)} title="Replier">
              ▾ replier
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Groupe de modèles (section 02) : instance masquée = UNE ligne dropdown avec
 * compteurs (modèles + tables), dépliable au besoin. */
function InstanceModelsGroup({ inst, ...rest }: LeftPanelProps & { inst: Instance }) {
  const [open, setOpen] = useState(false);
  const members = slotsOfInstance(rest.slots, inst.id);
  if (!members.length) return null;
  if (!inst.hidden) {
    return (
      <div>
        <p className="lbl">⧉ {inst.name} ({members.length})</p>
        {members.map((slot) => (
          <SlotCard key={slot.id} {...rest} slot={slot} index={rest.slots.indexOf(slot)} />
        ))}
      </div>
    );
  }
  const totalT = members.reduce((a, s) => a + (rest.slotTableCount.get(s.id) ?? 0), 0);
  return (
    <div className="instance-models masked-drop">
      <div className="masked-drop-head" onClick={() => setOpen((o) => !o)} title="Déplier les modèles de cette instance masquée">
        <span className="slot-fold">{open ? "▾" : "▸"}</span>
        <span className="instance-dot" style={{ background: inst.color ?? "#FF2B1D" }} />
        <span className="masked-drop-title">⧉ {inst.name} · {members.length} modèle(s){totalT > 0 ? ` · ${totalT}T` : ""} · masquée</span>
        <button
          className="icon-btn"
          onClick={(e) => { e.stopPropagation(); rest.onToggleInstanceHidden(inst.id); }}
          title="Ré-afficher toute l'instance sur le canvas"
        >
          Voir
        </button>
      </div>
      {open && members.map((slot) => (
        <SlotCard key={slot.id} {...rest} slot={slot} index={rest.slots.indexOf(slot)} />
      ))}
    </div>
  );
}

export function LeftPanel(p: LeftPanelProps) {
  const unaff = unassignedSlots(p.slots);
  return (
    <aside className="panel left">
      <div className="panel-title"><span><span className="num">01 /</span> Instances · projets ({p.instances.length})</span>
        <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button className="btn small primary" onClick={p.onAddInstance} title="Créer une instance pour regrouper des modèles">+ Instance</button>
          <button className="icon-btn" onClick={p.onHide}>⟨</button>
        </span>
      </div>
      <div className="row">
        <button className="btn small full" onClick={p.onSmartLayout} title="Range tout le canvas : groupé par instance, hubs en premier">▦ Ranger par instance</button>
        <button className="btn small full" onClick={p.onShowAll} title="Ré-afficher toutes les instances et tous les modèles">◉ Tout voir</button>
      </div>
      {p.instances.length === 0 && (
        <p className="muted">Aucune instance : crée un projet (ex. « Boutique », « Blog »), puis range tes modèles dedans via leur menu « Sans instance… ».</p>
      )}
      {p.instances.map((inst) => (
        <InstanceBlock key={inst.id} {...p} inst={inst} />
      ))}

      <div className="panel-title"><span><span className="num">02 /</span> Modèles ({p.slots.length})</span>
        <button className="btn small primary" onClick={() => p.onAddSlot()} title="Ajouter un autre modèle">+ Modèle</button>
      </div>
      {p.slots.length === 0 && (
        <>
          <p className="muted">Aucun modèle. Ajoute ton premier schema pour commencer.</p>
          <button className="btn primary full" onClick={() => p.onAddSlot()}>+ Ajouter un modèle</button>
        </>
      )}
      {unaff.length > 0 && (
        <>
          <p className="lbl">Sans instance ({unaff.length})</p>
          {unaff.map((slot) => (
            <SlotCard key={slot.id} {...p} slot={slot} index={p.slots.indexOf(slot)} />
          ))}
        </>
      )}
      {p.instances.map((inst) => (
        <InstanceModelsGroup key={`cards-${inst.id}`} {...p} inst={inst} />
      ))}
      {p.parseMsg && <p className="msg">{p.parseMsg}</p>}

      <h4>Modèles de base — 0X /</h4>
      <div className="row">
        <button className="btn small primary full" onClick={p.onGallery}>+ Voir les 6 modèles ↗</button>
      </div>

      <h4>Diagnostic +</h4>
      <div className="issues">
        {p.issues.length === 0 && <div className="issue ok">✓ Aucun problème : PK ok, liens résolus.</div>}
        {p.issues.slice(0, 8).map((it, i) => (
          <div key={i} className={`issue ${it.level === "err" ? "err" : ""}`}>
            <span className="tag">{it.level === "err" ? "ERR" : "WARN"}</span>{it.text}
          </div>
        ))}
        {p.issues.length > 8 && <p className="muted">+ {p.issues.length - 8} autre(s)…</p>}
      </div>

      <div className="help">
        <p><b>Astuces —</b></p>
        <ul>
          <li>Glisse les tables, <code>molette</code> = zoom vers le curseur, <code>F</code> = cadrer, <code>M</code> = plein écran, <code>Esc</code> = fermer.</li>
          <li><code>Ctrl+Z</code> / <code>Ctrl+Y</code> = annuler / rétablir.</li>
          <li><code>⇄ Relier</code> : clique 2 entités sur le canvas pour les lier.</li>
          <li>Les <code>xxx_id</code> + <code>REFERENCES</code> créent les liens auto.</li>
          <li><code>Isoler</code> une instance = travailler sur un projet sans voir les autres.</li>
          <li>Sauvegarde locale automatique.</li>
        </ul>
        <button className="btn small" onClick={p.onPickJsonFile}>Importer JSON…</button>
        <button className="btn small" onClick={p.onTour} title="Revoir la visite guidée">? Visite</button>
      </div>
    </aside>
  );
}
