import { describe, expect, it } from "vitest";
import type { DbTable } from "../../domain";
import { dbSchemaSqlPreview } from "./dbSchemaPreview";

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
});
