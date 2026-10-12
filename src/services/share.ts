import type { DBModel, ImportSlot, Instance } from "../types";

// ---------- Partage par lien snapshot (sans backend) ----------
// Le lien contient TOUT le snapshot (modèle + slots + instances) encodé dans
// le hash URL : l'ami ouvre le lien et voit exactement la version figée.
// Tes modifs ultérieures ne changent rien au lien déjà envoyé ; pour publier
// une v2 tu génères un nouveau lien (ou tu écrases l'ancien en le régénérant).
// Lecture seule : le destinataire peut modifier SA copie locale et exporter,
// mais ton original reste intact (tout est local, rien n'est poussé).

export type ShareKind = "canvas" | "slot" | "instance";

export interface ShareSnapshot {
  v: 1;
  kind: ShareKind;
  /** Nom du projet / modèle partagé (titre de la bannière). */
  name: string;
  /** porteur du slot (modèle) le cas échéant. */
  slotId?: string;
  instanceId?: string;
  model: DBModel;
  slots: ImportSlot[];
  instances: Instance[];
  createdAt: string;
}

function b64urlEncode(text: string): string {
  const b64 = btoa(unescape(encodeURIComponent(text)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(b64url: string): string {
  let b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  return decodeURIComponent(escape(atob(b64)));
}

export function encodeShare(snap: ShareSnapshot): string {
  return b64urlEncode(JSON.stringify(snap));
}

export function decodeShare(payload: string): ShareSnapshot | null {
  try {
    const obj = JSON.parse(b64urlDecode(payload)) as ShareSnapshot;
    if (obj.v !== 1 || !obj.model || !Array.isArray(obj.model.tables)) return null;
    if (!Array.isArray(obj.slots)) obj.slots = [];
    if (!Array.isArray(obj.instances)) obj.instances = [];
    return obj;
  } catch {
    return null;
  }
}

/** Construit l'URL de partage (hash `#partage=...`). */
export function buildShareUrl(snap: ShareSnapshot): string {
  const base = `${location.origin}${location.pathname}`;
  return `${base}#partage=${encodeShare(snap)}`;
}

/** Lit le hash courant et retourne le snapshot s'il est valide, sinon null. */
export function parseShareFromHash(): ShareSnapshot | null {
  const m = location.hash.match(/#partage=([A-Za-z0-9\-_]+)/);
  if (!m) return null;
  return decodeShare(m[1]);
}

export function shareLabel(kind: ShareKind): string {
  if (kind === "slot") return "modèle";
  if (kind === "instance") return "instance";
  return "canvas";
}
