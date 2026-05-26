import type { StoreDocument } from "../domain/types";

const STORAGE_KEY = "api-spec-writer-platform:v1";

export type ProjectStoreAdaptor = {
  load(): StoreDocument;
  save(store: StoreDocument): void;
};

export const emptyStore: StoreDocument = {
  schemaVersion: 1,
  projects: [],
};

export const localStorageProjectStore: ProjectStoreAdaptor = {
  load() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore;
    try {
      const parsed = JSON.parse(raw) as StoreDocument;
      return {
        schemaVersion: 1,
        projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      };
    } catch {
      return emptyStore;
    }
  },

  save(store) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  },
};
