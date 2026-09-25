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
}

export interface DBRelation {
  id: string;
  fromTable: string; // table name
  fromField: string;
  toTable: string;
  toField: string;
  cardinality?: string; // e.g. "1:N", "1:1", "N:N"
}

export interface DBModel {
  tables: DBTable[];
  relations: DBRelation[];
}

export const uid = (p = "id") =>
  `${p}_${Math.random().toString(36).slice(2, 8)}`;
