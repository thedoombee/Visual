import type { DBModel } from "./types";

export function toSQL(model: DBModel): string {
  const lines: string[] = [];
  for (const t of model.tables) {
    lines.push(`CREATE TABLE "${t.name}" (`);
    const defs: string[] = [];
    for (const f of t.fields) {
      let d = `  "${f.name}" ${f.type || "TEXT"}`;
      if (f.pk) d += " PRIMARY KEY";
      else {
        if (!f.nullable) d += " NOT NULL";
        if (f.unique) d += " UNIQUE";
      }
      defs.push(d);
    }
    for (const r of model.relations.filter((x) => x.fromTable === t.name)) {
      defs.push(
        `  FOREIGN KEY ("${r.fromField}") REFERENCES "${r.toTable}"("${r.toField}")`
      );
    }
    lines.push(defs.join(",\n"));
    lines.push(");\n");
  }
  return lines.join("\n");
}

export function toPrisma(model: DBModel): string {
  const out: string[] = [];
  const pascal = (s: string) =>
    s
      .split(/[_\-\s]+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join("");
  const camel = (s: string) => {
    const p = pascal(s);
    return p.charAt(0).toLowerCase() + p.slice(1);
  };
  for (const t of model.tables) {
    out.push(`model ${pascal(t.name)} {`);
    for (const f of t.fields) {
      const prismaType = fromSqlType(f.type);
      const opt = f.nullable && !f.pk ? "?" : "";
      let attrs = "";
      if (f.pk) attrs += " @id";
      if (f.unique && !f.pk) attrs += " @unique";
      if (f.pk && /int/i.test(f.type)) attrs += " @default(autoincrement())";
      if (f.pk && /uuid/i.test(f.type)) attrs += ' @default(uuid()) @db.Uuid';
      out.push(`  ${camel(f.name)} ${prismaType}${opt}${attrs} @map("${f.name}")`);
    }
    // relations objet simplifiées
    const rels = model.relations.filter((r) => r.fromTable === t.name);
    const done = new Set<string>();
    for (const r of rels) {
      const key = r.toTable;
      if (done.has(key)) continue;
      done.add(key);
      out.push(
        `  ${camel(key)} ${pascal(r.toTable)} @relation(fields: [${camel(r.fromField)}], references: [${camel(r.toField)}])`
      );
    }
    out.push(`  @@map("${t.name}")`);
    out.push(`}\n`);
  }
  return out.join("\n");
}

function fromSqlType(t: string): string {
  const u = (t || "").toUpperCase();
  if (u.includes("SERIAL") || u === "INTEGER" || u.includes("INT")) return "Int";
  if (u.includes("BIGINT")) return "BigInt";
  if (u.includes("BOOL")) return "Boolean";
  if (u.includes("TIMESTAMP") || u.includes("DATE")) return "DateTime";
  if (u.includes("JSON")) return "Json";
  if (u.includes("UUID")) return "String";
  if (u.includes("DECIMAL") || u.includes("NUMERIC") || u.includes("FLOAT") || u.includes("DOUBLE") || u.includes("REAL")) return "Float";
  return "String";
}

export function toDrizzle(model: DBModel): string {
  const out = [`import { pgTable, serial, text, varchar, integer, boolean, timestamp, uuid } from "drizzle-orm/pg-core";`, ``];
  for (const t of model.tables) {
    const varName = t.name.replace(/[^a-zA-Z0-9_]/g, "_");
    out.push(`export const ${varName} = pgTable("${t.name}", {`);
    for (const f of t.fields) {
      const u = f.type.toUpperCase();
      let expr = `text("${f.name}")`;
      if (u.includes("SERIAL")) expr = `serial("${f.name}")`;
      else if (u.includes("VARCHAR")) {
        const n = u.match(/\((\d+)\)/)?.[1] ?? "255";
        expr = `varchar("${f.name}", { length: ${n} })`;
      } else if (u.includes("INT")) expr = `integer("${f.name}")`;
      else if (u.includes("BOOL")) expr = `boolean("${f.name}")`;
      else if (u.includes("TIMESTAMP") || u.includes("DATE")) expr = `timestamp("${f.name}")`;
      else if (u.includes("UUID")) expr = `uuid("${f.name}")`;
      const rel = model.relations.find((r) => r.fromTable === t.name && r.fromField === f.name);
      if (rel) expr += `.references(() => ${rel.toTable}.${rel.toField})`;
      if (f.pk) expr += `.primaryKey()`;
      else if (!f.nullable) expr += `.notNull()`;
      if (f.unique) expr += `.unique()`;
      out.push(`  ${f.name}: ${expr},`);
    }
    out.push(`});\n`);
  }
  return out.join("\n");
}
