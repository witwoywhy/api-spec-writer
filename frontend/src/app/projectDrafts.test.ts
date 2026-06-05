import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, StoreDocument } from "../domain";
import { mergeProjectDrafts, removeProjectDraft, writeProjectDraft } from "./projectDrafts";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

const project = (id: string, name: string): Project => ({
  id,
  name,
  event_code: [],
  error_code: [],
  db_schema: [],
  service_folders: [],
  services: [],
  createdAt: "1",
  updatedAt: "1",
});

describe("project drafts", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", new MemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("merges a saved project draft over the persisted store project", () => {
    const persisted: StoreDocument = { schemaVersion: 1, projects: [project("p1", "Saved")] };
    writeProjectDraft(project("p1", "Draft"));

    expect(mergeProjectDrafts(persisted).projects[0].name).toBe("Draft");
  });

  it("keeps persisted project when its draft is removed", () => {
    const persisted: StoreDocument = { schemaVersion: 1, projects: [project("p1", "Saved")] };
    writeProjectDraft(project("p1", "Draft"));
    removeProjectDraft("p1");

    expect(mergeProjectDrafts(persisted).projects[0].name).toBe("Saved");
  });

  it("normalizes legacy drafts that are missing optional table arrays", () => {
    const persisted: StoreDocument = { schemaVersion: 1, projects: [project("p1", "Saved")] };
    const draft = project("p1", "Draft") as Partial<Project>;
    delete draft.db_schema;
    delete draft.service_folders;
    localStorage.setItem("api-spec-writer-platform:project-draft:v1:p1", JSON.stringify({
      schemaVersion: 1,
      savedAt: "1",
      project: draft,
    }));

    const [merged] = mergeProjectDrafts(persisted).projects;

    expect(merged.name).toBe("Draft");
    expect(merged.db_schema).toEqual([]);
    expect(merged.service_folders).toEqual([]);
  });
});
