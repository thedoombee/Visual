import type { DBModel, DBRelation, DBTable } from "./types";
import { uid } from "./types";
import { guessFkTarget, withInferredCards } from "./domain/model";

export type SchemaKind = "prisma" | "drizzle" | "sql" | "unknown";

export function detectKind(input: string): SchemaKind {
  const t = input.trim();
  if (!t) return "unknown";
  if (/^\s*model\s+\w+\s*\{/m.test(t) || /datasource\s+db|generator\s+client/.test(t))
    return "prisma";
  if (/pgTable|mysqlTable|sqliteTable|drizzle-orm/.test(t)) return "drizzle";
  if (/CREATE\s+TABLE/i.test(t)) return "sql";
  return "unknown";
}

function layout(tables: Omit<DBTable, "x" | "y">[]): DBTable[] {
  const cols = Math.max(1, Math.ceil(Math.sqrt(tables.length)));
  return tables.map((t, i) => ({
    ...t,
    x: 60 + (i % cols) * 320,
    y: 60 + Math.floor(i / cols) * 340,
  }));
}

// ---------------- PRISMA ----------------
export function parsePrisma(input: string): DBModel {
  const modelRe = /model\s+(\w+)\s*\{([\s\S]*?)\}/g;
  const models: { name: string; body: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = modelRe.exec(input))) models.push({ name: m[1], body: m[2] });

  const modelNames = new Set(models.map((x) => x.name));
  const tables: Omit<DBTable, "x" | "y">[] = [];
  const relations: DBRelation[] = [];

  for (const mod of models) {
    const tableName = extractMap(mod.body) ?? toSnake(mod.name);
    const fields: DBTable["fields"] = [];
    const lines = mod.body.split("\n");
    for (let raw of lines) {
      raw = raw.trim();
      if (!raw || raw.startsWith("//") || raw.startsWith("@@")) continue;
      // name type attrs
      const parts = raw.split(/\s+/);
      if (parts.length < 2) continue;
      const [fname, ftypeRaw, ...restArr] = parts;
      const rest = restArr.join(" ");
      if (fname.startsWith("@")) continue;
      let ftype = ftypeRaw;
      let nullable = false;
      let isArray = false;
      if (ftype.endsWith("?")) {
        nullable = true;
        ftype = ftype.slice(0, -1);
      }
      if (ftype.endsWith("[]")) {
        isArray = true;
        ftype = ftype.slice(0, -2);
      }
      // relation scalar fields have the @relation attr; object-relation fields reference another model
      const isObjectRelation = modelNames.has(ftype);
      if (isObjectRelation && !rest.includes("@relation")) {
        // côté objet seul (ex: posts Post[]) -> on crée la relation inverse si possible mais on ne crée pas de colonne
        // Si c'est un tableau, c'est le côté "1" -> on cherchera la FK de l'autre côté
        if (isArray) {
          // relation implicite : on la déduira plus tard via le champ scalaire opposé
          continue;
        }
        continue;
      }
      if (isObjectRelation && rest.includes("@relation")) {
        // champ objet avec @relation explicite côté FK, ex: author User @relation(fields:[authorId], references:[id])
        const relMatch = rest.match(
          /fields\s*:\s*\[([^\]]+)\]\s*,\s*references\s*:\s*\[([^\]]+)\]/
        );
        if (relMatch) {
          const fromFields = relMatch[1].split(",").map((s) => s.trim());
          const toFields = relMatch[2].split(",").map((s) => s.trim());
          fromFields.forEach((ff, idx) => {
            relations.push({
              id: uid("rel"),
              fromTable: tableName,
              fromField: toSnake(ff),
              toTable: toSnake(ftype),
              toField: toSnake(toFields[idx] ?? toFields[0]),
              fromCard: "1,N", toCard: "1,1",
            });
          });
        }
        continue;
      }
      const mapMatch = rest.match(/@map\(["']([^"']+)["']\)/);
      const colName = mapMatch ? mapMatch[1] : toSnake(fname);
      fields.push({
        id: uid("f"),
        name: colName,
        type: mapPrismaType(ftype),
        pk: /@id\b/.test(rest),
        unique: /@unique\b/.test(rest),
        nullable: nullable || /@default\(.*null|@default\(dbgenerated/i.test(rest) ? true : nullable,
        fk: /@relation|fields\s*:/.test(rest) ? false : false, // fk marqué après via relations
      });
      // @relation inline sur champ scalaire rare, on ignore
    }
    tables.push({ id: uid("t"), name: tableName, fields });
  }

  // marquer les FK à partir des relations
  const byName = new Map(tables.map((t) => [t.name, t]));
  for (const r of relations) {
    const t = byName.get(r.fromTable);
    const f = t?.fields.find((x) => x.name === r.fromField);
    if (f) f.fk = true;
  }
  // Déduire relations implicites : champ nommé xxxId + modèle Xxx existe
  for (const t of tables) {
    for (const f of t.fields) {
      if (f.fk) continue;
      const cand = guessFkTarget(f.name, [...modelNames].map(toSnake));
      if (cand && cand !== t.name) {
        const target = byName.get(cand);
        const toField = target?.fields.find((x) => x.pk)?.name ?? "id";
        relations.push({
          id: uid("rel"),
          fromTable: t.name,
          fromField: f.name,
          toTable: cand,
          toField,
          fromCard: "1,N", toCard: "1,1",
        });
        f.fk = true;
      }
    }
  }

  return { tables: layout(tables), relations: withInferredCards(tables, relations) };
}

function extractMap(body: string): string | null {
  const m = body.match(/@@map\(["']([^"']+)["']\)/);
  return m ? m[1] : null;
}

function toSnake(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase();
}

function mapPrismaType(t: string): string {
  const m: Record<string, string> = {
    String: "VARCHAR(255)",
    Boolean: "BOOLEAN",
    Int: "INTEGER",
    BigInt: "BIGINT",
    Float: "FLOAT",
    Decimal: "DECIMAL",
    DateTime: "TIMESTAMP",
    Json: "JSON",
    Bytes: "BYTEA",
  };
  return m[t] ?? t.toUpperCase();
}

// ---------------- DRIZZLE ----------------
export function parseDrizzle(input: string): DBModel {
  // 1) trouver toutes les tables : const users = pgTable("users", {
  const defRe =
    /const\s+(\w+)\s*=\s*(pgTable|mysqlTable|sqliteTable)\s*\(\s*["'`]([^"'`]+)["'`]\s*,/g;
  const defs: { varName: string; sqlName: string; index: number }[] = [];
  let d: RegExpExecArray | null;
  while ((d = defRe.exec(input)))
    defs.push({ varName: d[1], sqlName: d[3], index: d.index });
  const varToSql = new Map(defs.map((x) => [x.varName, x.sqlName]));

  const tables: Omit<DBTable, "x" | "y">[] = [];
  const relations: DBRelation[] = [];

  for (let i = 0; i < defs.length; i++) {
    const def = defs[i];
    const start = input.indexOf("{", def.index);
    const block = extractBrace(input, start);
    if (!block) continue;
    const fields: DBTable["fields"] = [];
    const colLines = splitTopLevel(block, ",");
    for (const rawCol of colLines) {
      const col = rawCol.trim();
      if (!col) continue;
      const cm = col.match(/^(\w+)\s*:\s*([\s\S]+)$/);
      if (!cm) continue;
      const [, varCol, expr] = cm;
      // nom sql = premier arg string de la fonction, sinon varCol
      const nameArg = expr.match(/\(\s*["'`]([^"'`]+)["'`]/);
      const colName = nameArg ? nameArg[1] : toSnake(varCol);
      const typeFn = expr.match(/^(\w+)\s*\(/)?.[1] ?? "text";
      const pk = /\.primaryKey\(\)/.test(expr);
      const unique = /\.unique\(\)/.test(expr);
      const notNull = /\.notNull\(\)/.test(expr);
      const ref = expr.match(
        /\.references\(\s*\(\)\s*=>\s*(\w+)\.(\w+)/
      );
      fields.push({
        id: uid("f"),
        name: colName,
        type: mapDrizzleType(typeFn, expr),
        pk,
        unique,
        nullable: pk ? false : !notNull,
        fk: !!ref,
      });
      if (ref) {
        const [, refVar, refColVar] = ref;
        const toTable = varToSql.get(refVar) ?? toSnake(refVar);
        relations.push({
          id: uid("rel"),
          fromTable: def.sqlName,
          fromField: colName,
          toTable,
          toField: toSnake(refColVar),
          fromCard: "1,N", toCard: "1,1",
        });
      }
    }
    tables.push({ id: uid("t"), name: def.sqlName, fields });
  }

  return { tables: layout(tables), relations: withInferredCards(tables, relations) };
}

function mapDrizzleType(fn: string, expr: string): string {
  const low = fn.toLowerCase();
  const len = expr.match(/\(\s*["'`][^"'`]+["'`]\s*,\s*\{[^}]*length\s*:\s*(\d+)/);
  const len2 = expr.match(/varchar\s*\(\s*["'`][^"'`]+["'`]\s*,\s*(\d+)/i);
  if (low.includes("varchar")) {
    const n = expr.match(/,\s*(\d+)\s*\)/)?.[1] ?? len?.[1] ?? len2?.[1] ?? "255";
    return `VARCHAR(${n})`;
  }
  const m: Record<string, string> = {
    serial: "SERIAL",
    bigserial: "BIGSERIAL",
    integer: "INTEGER",
    int: "INTEGER",
    bigint: "BIGINT",
    text: "TEXT",
    boolean: "BOOLEAN",
    timestamp: "TIMESTAMP",
    date: "DATE",
    uuid: "UUID",
    json: "JSON",
    jsonb: "JSONB",
    real: "REAL",
    doubleprecision: "DOUBLE PRECISION",
    numeric: "NUMERIC",
    decimal: "DECIMAL",
  };
  for (const k of Object.keys(m)) if (low.includes(k)) return m[k];
  return fn.toUpperCase();
}

function extractBrace(src: string, openIdx: number): string | null {
  if (openIdx < 0 || src[openIdx] !== "{") return null;
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === "{") depth++;
    if (src[i] === "}") depth--;
    if (depth === 0) return src.slice(openIdx + 1, i);
  }
  return null;
}

// ---------------- SQL ----------------
export function parseSQL(input: string): DBModel {
  const tables: Omit<DBTable, "x" | "y">[] = [];
  const relations: DBRelation[] = [];
  const statements = input.split(/;\s*\n?/);
  for (const st of statements) {
    const cm = st.match(
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"'\[]?(\w+)[`"'\]]?\s*\(([\s\S]+)\)\s*$/i
    );
    if (!cm) continue;
    const [, tname, body] = cm;
    const parts = splitTopLevel(body, ",");
    const fields: DBTable["fields"] = [];
    const pkComposite: string[] = [];
    for (const raw of parts) {
      const p = raw.trim();
      if (!p) continue;
      // FOREIGN KEY
      let fm = p.match(
        /FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s*[`"'[]?(\w+)[`"'\\\]]?\s*\(([^)]+)\)/i
      );
      if (fm) {
        const fromCols = fm[1].split(",").map((s) => cleanId(s));
        const toTable = fm[2];
        const toCols = fm[3].split(",").map((s) => cleanId(s));
        fromCols.forEach((fc, idx) => {
          relations.push({
            id: uid("rel"),
            fromTable: tname,
            fromField: fc,
            toTable,
            toField: toCols[idx] ?? toCols[0],
            fromCard: "1,N", toCard: "1,1",
          });
          const f = fields.find((x) => x.name === fc);
          if (f) f.fk = true;
        });
        continue;
      }
      // CONSTRAINT ... FOREIGN KEY
      fm = p.match(
        /FOREIGN\s+KEY.*REFERENCES\s*[`"'[]?(\w+)[`"'\\\]]?\s*\(([^)]+)\)/i
      );
      if (/CONSTRAINT/i.test(p) && fm) {
        const fkCols = p.match(/\(([^)]+)\)/)?.[1].split(",").map(cleanId) ?? [];
        fkCols.forEach((fc, idx) => {
          relations.push({
            id: uid("rel"),
            fromTable: tname,
            fromField: fc,
            toTable: fm![1],
            toField: fm![2].split(",").map(cleanId)[idx] ?? "id",
            fromCard: "1,N", toCard: "1,1",
          });
        });
        continue;
      }
      if (/^\s*PRIMARY\s+KEY/i.test(p)) {
        const cols = p.match(/\(([^)]+)\)/)?.[1].split(",").map(cleanId) ?? [];
        pkComposite.push(...cols);
        continue;
      }
      if (/^\s*(UNIQUE|KEY|INDEX|CONSTRAINT|CHECK)/i.test(p)) continue;
      // colonne
      const colm = p.match(/^[`"'[]?(\w+)[`"'\]]?\s+([A-Za-z]+(?:\s*\([^)]+\))?)([\s\S]*)$/);
      if (!colm) continue;
      const [, cname, ctype, rest] = colm;
      const isPk = /PRIMARY\s+KEY/i.test(rest);
      const isUnique = /UNIQUE/i.test(rest);
      const notNull = /NOT\s+NULL/i.test(rest) || isPk;
      const refInline = rest.match(
        /REFERENCES\s*[`"'[]?(\w+)[`"'\\\]]?\s*\(([^)]+)\)/i
      );
      fields.push({
        id: uid("f"),
        name: cleanId(cname),
        type: ctype.toUpperCase(),
        pk: isPk,
        unique: isUnique,
        nullable: !notNull,
        fk: !!refInline,
      });
      if (refInline) {
        relations.push({
          id: uid("rel"),
          fromTable: tname,
          fromField: cleanId(cname),
          toTable: refInline[1],
          toField: cleanId(refInline[2].split(",")[0]),
          fromCard: "1,N", toCard: "1,1",
        });
      }
    }
    // appliquer PK composites
    for (const c of pkComposite) {
      const f = fields.find((x) => x.name.toLowerCase() === c.toLowerCase());
      if (f) {
        f.pk = true;
        f.nullable = false;
      }
    }
    tables.push({ id: uid("t"), name: tname, fields });
  }
  // Les cartes dépendent de nullable/unique (+ PK composites ci-dessus) :
  // on les (ré)infère en passe finale plutôt qu'en dur à chaque push.
  const inferred = withInferredCards(tables, relations);
  return { tables: layout(tables), relations: inferred };
}

function cleanId(s: string): string {
  return s.trim().replace(/^[`"'[]+|[`"'\\\]]+$/g, "");
}

export function splitTopLevel(s: string, sep: "," | string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  const ch = sep;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "(" || c === "{" || c === "[") depth++;
    if (c === ")" || c === "}" || c === "]") depth--;
    if (c === ch && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

export function parseAuto(input: string): { model: DBModel; kind: SchemaKind } {
  const kind = detectKind(input);
  if (kind === "prisma") return { model: parsePrisma(input), kind };
  if (kind === "drizzle") return { model: parseDrizzle(input), kind };
  if (kind === "sql") return { model: parseSQL(input), kind };
  // tentative : essayer les 3, garder celui qui produit le plus de tables
  const cands = [parsePrisma(input), parseDrizzle(input), parseSQL(input)];
  const kinds: SchemaKind[] = ["prisma", "drizzle", "sql"];
  let best = 0;
  cands.forEach((c, i) => {
    if (c.tables.length > cands[best].tables.length) best = i;
  });
  if (cands[best].tables.length === 0) return { model: { tables: [], relations: [] }, kind: "unknown" };
  return { model: cands[best], kind: kinds[best] };
}
