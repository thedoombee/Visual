export interface DBField {
  id: string;
  name: string;
  type: string;
  pk?: boolean;
  fk?: boolean;
  unique?: boolean;
  nullable?: boolean;
}

export interface DBTable {
  id: string;
  name: string;
  x: number;
  y: number;
  fields: DBField[];
  // Modèle d'origine (slot du panneau gauche) : sert à masquer/afficher
  // un modèle entier. Absent = table manuelle, toujours visible.
  slotId?: string;
}

export interface DBRelation {
  id: string;
  fromTable: string; // table name
  fromField: string;
  toTable: string;
  toField: string;
  // Cardinalités MCD (Merise) : une de chaque côté du lien.
  // Ex : Commande(1,N) — (0,1)Client. Ancien champ `cardinality` migré auto.
  fromCard?: string;
  toCard?: string;
  cardinality?: string; // legacy ("N:1"…), converti à la volée
}

// Cardinalités MCD standard : min,max de chaque côté.
export const MCD_CARDS = ["0,1", "1,1", "0,N", "1,N"] as const;

// Convertit une vieille cardinalité unique en couple MCD (côté from, côté to).
export function mcdCards(r: Pick<DBRelation, "fromCard" | "toCard" | "cardinality">): { a: string; b: string } {
  if (r.fromCard || r.toCard) return { a: r.fromCard ?? "1,N", b: r.toCard ?? "1,1" };
  switch (r.cardinality) {
    case "1:N": return { a: "1,1", b: "1,N" };
    case "1:1": return { a: "1,1", b: "1,1" };
    case "N:N": return { a: "1,N", b: "1,N" };
    default: return { a: "1,N", b: "1,1" }; // "N:1" : N côté FK, 1 côté PK
  }
}

export interface DBModel {
  tables: DBTable[];
  relations: DBRelation[];
}

// Un slot = un modèle importé dans le panneau gauche.
// Chacun garde son texte, se plie/déplie, et peut être ajouté au canvas.
export interface ImportSlot {
  id: string;
  name: string;
  source: string;
  collapsed: boolean;
  msg: string;
  hidden?: boolean; // modèle masqué sur le canvas
  // Instance parente (projet). Absent = modèle hors instance, toujours groupé
  // dans "Sans instance" mais visible selon son propre `hidden`.
  instanceId?: string;
}

// Une instance = un projet qui regroupe plusieurs modèles (slots).
// Masquer une instance masque tous ses modèles d'un coup, sans toucher aux
// autres projets. Extension ouverte : on ajoute des champs sans casser les
// sauvegardes existantes (tout est optionnel sauf id/name).
export interface Instance {
  id: string;
  name: string;
  collapsed: boolean;
  hidden?: boolean;
  color?: string;
}

export const uid = (p = "id") =>
  `${p}_${Math.random().toString(36).slice(2, 8)}`;
