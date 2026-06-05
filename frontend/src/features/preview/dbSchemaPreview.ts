import type { DbTable, Project } from "../../domain";
import { escapePipe } from "./markdownHtml";

const SQL_INDENT = "    ";

export function dbSchemaMarkdown(project: Project) {
  if (project.db_schema.length === 0) return "## DB Schema\n\nNo DB schema tables.";
  return [
    "## DB Schema",
    ...project.db_schema.map((table) => {
      const parts = [
        `\n### ${escapePipe(table.name || "Untitled Table")}`,
      ];
      if (table.columns.length === 0) {
        parts.push("No columns.");
      } else {
        parts.push(
          "| Field | Type | Nullable | Constraint | Description |",
          "|-------|------|----------|------------|-------------|",
          ...table.columns.map((column) => [
            escapePipe(column.field),
            escapePipe(column.type),
            escapePipe(column.nullable),
            escapePipe(column.constraint === "NONE" ? "" : column.constraint),
            escapePipe(column.description),
          ].join(" | ")).map((cells) => `| ${cells} |`),
        );
      }
      if ((table.indexes ?? []).length > 0) {
        parts.push(
          "\n#### Indexes",
          "| Name | Columns | Type | Unique |",
          "|------|---------|------|--------|",
          ...(table.indexes ?? []).map((index) => [
            escapePipe(index.name),
            escapePipe(index.columnIds.map((columnId) => table.columns.find((column) => column.id === columnId)?.field ?? "").filter(Boolean).join(", ")),
            escapePipe(index.type),
            escapePipe(index.unique),
          ].join(" | ")).map((cells) => `| ${cells} |`),
        );
      }
      return parts.join("\n");
    }),
  ].join("\n");
}

export function dbSchemaSqlPreview(tables: DbTable[]) {
  return dbSchemaSqlPreviewByTable(tables).map((section) => section.content).join("\n\n");
}

export function dbSchemaSqlPreviewByTable(tables: DbTable[]) {
  if (tables.length === 0) return [];
  return tables.map((table) => {
    const tableName = quoteSqlIdentifier(table.name || "untitled_table");
    const statements: string[] = [];
    if (table.columns.length === 0) {
      statements.push(`CREATE TABLE ${tableName} (\n);\n`);
      return { tableId: table.id, tableName: table.name || "Untitled Table", content: statements.join("\n\n") };
    }

    const columnDefinitions = dbColumnSqlRows(table.columns);
    statements.push(`CREATE TABLE ${tableName} (\n${columnDefinitions.join(",\n")}\n);`);

    for (const column of table.columns) {
      if (column.constraint === "INDEX" && column.field.trim()) {
        statements.push(`CREATE INDEX ${quoteSqlIdentifier(`idx_${table.name || "untitled_table"}_${column.field}`)} ON ${tableName} USING btree (${quoteSqlIdentifier(column.field)});`);
      }
      if (column.constraint === "FOREIGN KEY" && column.field.trim()) {
        statements.push(`-- TODO: Add foreign key for ${tableName}.${quoteSqlIdentifier(column.field)} REFERENCES table(column).`);
      }
      if (column.constraint === "CHECK" && column.field.trim()) {
        statements.push(`-- TODO: Add CHECK constraint for ${tableName}.${quoteSqlIdentifier(column.field)}.`);
      }
      if (column.constraint === "DEFAULT" && column.field.trim()) {
        statements.push(`-- TODO: Add DEFAULT value for ${tableName}.${quoteSqlIdentifier(column.field)}.`);
      }
      if (column.description.trim() && column.field.trim()) {
        statements.push(`COMMENT ON COLUMN ${tableName}.${quoteSqlIdentifier(column.field)} IS ${sqlString(column.description)};`);
      }
    }

    for (const index of table.indexes ?? []) {
      const indexSql = createIndexSql(table, tableName, index);
      if (indexSql) statements.push(indexSql);
    }
    return { tableId: table.id, tableName: table.name || "Untitled Table", content: statements.join("\n\n") };
  });
}

export function dbSchemaGoStructPreview(tables: DbTable[]) {
  const sections = dbSchemaGoStructPreviewByTable(tables);
  const needsTime = sections.some((section) => section.needsTime);
  const content = sections.map((section) => section.content).filter(Boolean).join("\n\n");
  if (!content) return "";
  return needsTime ? `import "time"\n\n${content}` : content;
}

export function dbSchemaGoStructPreviewByTable(tables: DbTable[]) {
  return tables.map((table) => {
    const fields = table.columns
      .filter((column) => column.field.trim())
      .map((column) => {
        const goType = dbColumnGoType(column.type);
        const nullableType = column.nullable === "YES" && !goType.startsWith("[]") ? `*${goType}` : goType;
        return {
          fieldName: goFieldName(column.field),
          type: nullableType,
          tag: `\`gorm:"column:${column.field}"\``,
          needsTime: goType === "time.Time",
        };
      });
    if (fields.length === 0) {
      return { tableId: table.id, tableName: table.name || "Untitled Table", content: "", needsTime: false };
    }
    return {
      tableId: table.id,
      tableName: table.name || "Untitled Table",
      content: [
        `type ${goFieldName(table.name || "UntitledTable")} struct {`,
        ...goStructFieldLines(fields),
        "}",
      ].join("\n"),
      needsTime: fields.some((field) => field.needsTime),
    };
  });
}

function createIndexSql(table: DbTable, tableName: string, index: Pick<DbTable["indexes"][number], "name" | "columnIds" | "type" | "unique">) {
  const columns = index.columnIds
    .map((columnId) => table.columns.find((item) => item.id === columnId))
    .filter((column) => column?.field.trim());
  if (columns.length === 0) return "";
  const indexName = index.name || `idx_${table.name || "untitled_table"}_${columns.map((column) => column?.field).join("_")}`;
  const columnSql = columns.map((column) => quoteSqlIdentifier(column?.field ?? "")).join(", ");
  return `CREATE ${index.unique === "YES" ? "UNIQUE " : ""}INDEX ${quoteSqlIdentifier(indexName)} ON ${tableName} USING ${index.type.toLowerCase()} (${columnSql});`;
}

function dbColumnSqlRows(columns: DbTable["columns"]) {
  const names = columns.map((column) => quoteSqlIdentifier(column.field || "unnamed_column"));
  const types = columns.map((column) => column.type.trim() || "TEXT");
  const nameWidth = Math.max(...names.map((name) => name.length));
  const typeWidth = Math.max(...types.map((type) => type.length));
  return columns.map((column, index) => `${SQL_INDENT}${dbColumnSql(column, names[index], types[index], nameWidth, typeWidth)}`);
}

function dbColumnSql(column: DbTable["columns"][number], name: string, type: string, nameWidth: number, typeWidth: number) {
  const constraints: string[] = [];
  if (column.nullable === "NO" && column.constraint !== "PRIMARY KEY") constraints.push("NOT NULL");
  if (column.constraint === "PRIMARY KEY" || column.constraint === "UNIQUE") constraints.push(column.constraint);
  const parts = [name.padEnd(nameWidth), constraints.length > 0 ? type.padEnd(typeWidth) : type];
  parts.push(...constraints);
  return parts.join(" ");
}

function goStructFieldLines(fields: Array<{ fieldName: string; type: string; tag: string }>) {
  const fieldWidth = Math.max(...fields.map((field) => field.fieldName.length));
  const typeWidth = Math.max(...fields.map((field) => field.type.length));
  return fields.map((field) => `${SQL_INDENT}${field.fieldName.padEnd(fieldWidth)} ${field.type.padEnd(typeWidth)} ${field.tag}`);
}

function quoteSqlIdentifier(value: string) {
  return `"${value.trim().replaceAll("\"", "\"\"") || "unnamed"}"`;
}

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function dbColumnGoType(type: string) {
  const normalized = type.toUpperCase().trim();
  if (normalized.includes("[]") || normalized.endsWith(" ARRAY")) return "[]string";
  if (normalized.includes("BIGINT") || normalized.includes("BIGSERIAL")) return "int64";
  if (normalized.includes("SMALLINT")) return "int16";
  if (normalized.includes("INT") || normalized.includes("SERIAL")) return "int";
  if (normalized.includes("NUMERIC") || normalized.includes("DECIMAL") || normalized.includes("DOUBLE") || normalized.includes("REAL") || normalized.includes("MONEY")) return "float64";
  if (normalized.includes("BOOL")) return "bool";
  if (normalized.includes("JSON")) return "map[string]any";
  if (normalized.includes("TIMESTAMP") || normalized === "DATE" || normalized.startsWith("TIME")) return "time.Time";
  if (normalized.includes("BYTEA")) return "[]byte";
  return "string";
}

function goFieldName(value: string) {
  const words = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
  const name = words.map((word) => {
    if (word.toLowerCase() === "id") return "ID";
    return `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`;
  }).join("");
  return /^[0-9]/.test(name) ? `Field${name}` : name || "Field";
}
