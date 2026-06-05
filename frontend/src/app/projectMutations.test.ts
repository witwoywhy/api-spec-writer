import { describe, expect, it } from "vitest";
import type { StoreDocument } from "../domain";
import { moveById, replaceDbSchemaInStore } from "./projectMutations";

describe("project mutations", () => {
  it("moves an item before the target id", () => {
    expect(moveById([{ id: "a" }, { id: "b" }, { id: "c" }], "c", "a").map((item) => item.id)).toEqual(["c", "a", "b"]);
  });

  it("replaces only the selected project DB schema", () => {
    const store: StoreDocument = {
      schemaVersion: 1,
      projects: [
        { id: "p1", name: "One", event_code: [], error_code: [], db_schema: [], service_folders: [], services: [], createdAt: "1", updatedAt: "1" },
        { id: "p2", name: "Two", event_code: [], error_code: [], db_schema: [], service_folders: [], services: [], createdAt: "1", updatedAt: "1" },
      ],
    };

    const next = replaceDbSchemaInStore(store, "p1", [{ id: "t1", name: "tbl", columns: [], indexes: [] }]);

    expect(next.projects[0].db_schema).toHaveLength(1);
    expect(next.projects[1].db_schema).toHaveLength(0);
  });
});
