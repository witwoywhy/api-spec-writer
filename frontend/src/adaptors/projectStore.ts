import type { ErrorCode, EventCode, Project, Service, StoreDocument } from "../domain";

const DOCUMENT_STORAGE_KEY = "api-spec-writer-platform:v1";
const TABLE_STORAGE_KEY = "api-spec-writer-platform:tables:v1";

export type ProjectStoreAdaptor = {
  load(): StoreDocument;
  save(store: StoreDocument): void;
};

export const emptyStore: StoreDocument = {
  schemaVersion: 1,
  projects: [],
};

type ProjectRow = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

type EventCodeRow = EventCode & {
  projectId: string;
};

type ErrorCodeRow = ErrorCode & {
  projectId: string;
};

type ServiceRow = Service & {
  projectId: string;
};

type ProjectTableDocument = {
  schemaVersion: 1;
  tables: {
    projects: ProjectRow[];
    event_codes: EventCodeRow[];
    error_codes: ErrorCodeRow[];
    services: ServiceRow[];
  };
};

const emptyTableDocument: ProjectTableDocument = {
  schemaVersion: 1,
  tables: {
    projects: [],
    event_codes: [],
    error_codes: [],
    services: [],
  },
};

export const localStorageProjectStore: ProjectStoreAdaptor = {
  load() {
    const tableDocument = readTableDocument();
    if (tableDocument) return tableDocumentToStore(tableDocument);

    const legacyDocument = readLegacyDocument();
    if (!legacyDocument) return emptyStore;
    const migratedTableDocument = storeToTableDocument(legacyDocument);
    writeTableDocument(migratedTableDocument);
    return legacyDocument;
  },

  save(store) {
    writeTableDocument(storeToTableDocument(store));
  },
};

function readTableDocument() {
  const raw = localStorage.getItem(TABLE_STORAGE_KEY);
  if (!raw) return null;
  try {
    return normalizeTableDocument(JSON.parse(raw) as ProjectTableDocument);
  } catch {
    return null;
  }
}

function writeTableDocument(tableDocument: ProjectTableDocument) {
  localStorage.setItem(TABLE_STORAGE_KEY, JSON.stringify(tableDocument));
}

function readLegacyDocument() {
  const raw = localStorage.getItem(DOCUMENT_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoreDocument;
    return {
      schemaVersion: 1,
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
    } satisfies StoreDocument;
  } catch {
    return null;
  }
}

function normalizeTableDocument(tableDocument: ProjectTableDocument): ProjectTableDocument {
  return {
    schemaVersion: 1,
    tables: {
      projects: Array.isArray(tableDocument.tables?.projects) ? tableDocument.tables.projects : [],
      event_codes: Array.isArray(tableDocument.tables?.event_codes) ? tableDocument.tables.event_codes : [],
      error_codes: Array.isArray(tableDocument.tables?.error_codes) ? tableDocument.tables.error_codes : [],
      services: Array.isArray(tableDocument.tables?.services) ? tableDocument.tables.services : [],
    },
  };
}

function storeToTableDocument(store: StoreDocument): ProjectTableDocument {
  return {
    schemaVersion: 1,
    tables: {
      projects: store.projects.map((project) => ({
        id: project.id,
        name: project.name,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      })),
      event_codes: store.projects.flatMap((project) =>
        project.event_code.map((eventCode) => ({
          ...eventCode,
          projectId: project.id,
        })),
      ),
      error_codes: store.projects.flatMap((project) =>
        project.error_code.map((errorCode) => ({
          ...errorCode,
          projectId: project.id,
        })),
      ),
      services: store.projects.flatMap((project) =>
        project.services.map((service) => ({
          ...service,
          projectId: project.id,
        })),
      ),
    },
  };
}

function tableDocumentToStore(tableDocument: ProjectTableDocument): StoreDocument {
  return {
    schemaVersion: 1,
    projects: tableDocument.tables.projects.map((project) => tableRowsToProject(project, tableDocument)),
  };
}

function tableRowsToProject(project: ProjectRow, tableDocument: ProjectTableDocument): Project {
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    event_code: tableDocument.tables.event_codes
      .filter((eventCode) => eventCode.projectId === project.id)
      .map(({ projectId: _projectId, ...eventCode }) => eventCode),
    error_code: tableDocument.tables.error_codes
      .filter((errorCode) => errorCode.projectId === project.id)
      .map(({ projectId: _projectId, ...errorCode }) => errorCode),
    services: tableDocument.tables.services
      .filter((service) => service.projectId === project.id)
      .map(({ projectId: _projectId, ...service }) => service),
  };
}
