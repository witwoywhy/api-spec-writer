import { describe, expect, it } from "vitest";
import type { DbTable } from "../../domain";
import { dbSchemaGoStructPreview, dbSchemaSqlPreview, dbSchemaSqlPreviewByTable } from "./dbSchemaPreview";

describe("db schema SQL preview", () => {
  it("uses four-space indentation and trims nullable type padding", () => {
    const tables: DbTable[] = [{
      id: "t1",
      name: "tbl_user",
      indexes: [],
      columns: [
        { id: "c1", field: "user_id", type: "VARCHAR(36)", nullable: "NO", constraint: "PRIMARY KEY", description: "" },
        { id: "c2", field: "last_login", type: "TIMESTAMP", nullable: "YES", constraint: "NONE", description: "" },
        { id: "c3", field: "status", type: "VARCHAR(20)", nullable: "NO", constraint: "NONE", description: "" },
      ],
    }];

    const sql = dbSchemaSqlPreview(tables);

    expect(sql).toContain("    \"user_id\"    VARCHAR(36) PRIMARY KEY");
    expect(sql).toContain("    \"last_login\" TIMESTAMP,");
    expect(sql).not.toContain("TIMESTAMP   ,");
  });

  it("returns separated SQL preview sections by table", () => {
    const tables: DbTable[] = [
      { id: "t1", name: "tbl_user", indexes: [], columns: [{ id: "c1", field: "user_id", type: "VARCHAR(36)", nullable: "NO", constraint: "PRIMARY KEY", description: "" }] },
      { id: "t2", name: "tbl_audit", indexes: [], columns: [{ id: "c2", field: "created_at", type: "TIMESTAMP", nullable: "NO", constraint: "NONE", description: "" }] },
    ];

    const sections = dbSchemaSqlPreviewByTable(tables);

    expect(sections).toHaveLength(2);
    expect(sections[0]).toMatchObject({ tableId: "t1", tableName: "tbl_user" });
    expect(sections[0].content).toContain("CREATE TABLE \"tbl_user\"");
    expect(sections[1].content).toContain("CREATE TABLE \"tbl_audit\"");
  });

  it("generates Go structs from DB tables", () => {
    const tables: DbTable[] = [{
      id: "t1",
      name: "tbl_user",
      indexes: [],
      columns: [
        { id: "c1", field: "user_id", type: "VARCHAR(36)", nullable: "NO", constraint: "PRIMARY KEY", description: "" },
        { id: "c2", field: "last_login", type: "TIMESTAMP", nullable: "YES", constraint: "NONE", description: "" },
        { id: "c3", field: "active", type: "BOOLEAN", nullable: "NO", constraint: "NONE", description: "" },
      ],
    }];

    const go = dbSchemaGoStructPreview(tables);

    expect(go).toContain("import \"time\"");
    expect(go).toContain("type TblUser struct");
    expect(go).toContain("    UserID    string     `gorm:\"column:user_id\"`");
    expect(go).toContain("    LastLogin *time.Time `gorm:\"column:last_login\"`");
    expect(go).toContain("    Active    bool       `gorm:\"column:active\"`");
  });
});
