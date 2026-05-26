import type { ErrorCode, EventCode, Project, Service, ServiceSpec, StoreDocument } from "../domain";

const DOCUMENT_STORAGE_KEY = "api-spec-writer-platform:v1";
const TABLE_STORAGE_KEY = "api-spec-writer-platform:tables:v1";

export type ProjectStoreAdaptor = {
  getSnapshot(): Promise<StoreDocument>;
  createProject(project: Project): Promise<Project>;
  createEventCode(projectId: string, eventCode: EventCode): Promise<EventCode>;
  replaceEventCodes(projectId: string, eventCodes: EventCode[]): Promise<EventCode[]>;
  createErrorCode(projectId: string, errorCode: ErrorCode): Promise<ErrorCode>;
  replaceErrorCodes(projectId: string, errorCodes: ErrorCode[]): Promise<ErrorCode[]>;
  createService(projectId: string, service: Service): Promise<Service>;
  updateServiceSpec(projectId: string, serviceId: string, spec: ServiceSpec): Promise<Service>;
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
  async getSnapshot() {
    return readStoreSnapshot();
  },

  async createProject(project) {
    const tableDocument = readPersistedTableDocument();
    tableDocument.tables.projects.push({
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    });
    tableDocument.tables.event_codes.push(...project.event_code.map((eventCode) => ({ ...eventCode, projectId: project.id })));
    tableDocument.tables.error_codes.push(...project.error_code.map((errorCode) => ({ ...errorCode, projectId: project.id })));
    tableDocument.tables.services.push(...project.services.map((service) => ({ ...service, projectId: project.id })));
    writeTableDocument(tableDocument);
    return project;
  },

  async createEventCode(projectId, eventCode) {
    const tableDocument = readPersistedTableDocument();
    tableDocument.tables.event_codes.push({ ...eventCode, projectId });
    touchProject(tableDocument, projectId);
    writeTableDocument(tableDocument);
    return eventCode;
  },

  async replaceEventCodes(projectId, eventCodes) {
    const tableDocument = readPersistedTableDocument();
    tableDocument.tables.event_codes = [
      ...tableDocument.tables.event_codes.filter((eventCode) => eventCode.projectId !== projectId),
      ...eventCodes.map((eventCode) => ({ ...eventCode, projectId })),
    ];
    touchProject(tableDocument, projectId);
    writeTableDocument(tableDocument);
    return eventCodes;
  },

  async createErrorCode(projectId, errorCode) {
    const tableDocument = readPersistedTableDocument();
    tableDocument.tables.error_codes.push({ ...errorCode, projectId });
    touchProject(tableDocument, projectId);
    writeTableDocument(tableDocument);
    return errorCode;
  },

  async replaceErrorCodes(projectId, errorCodes) {
    const tableDocument = readPersistedTableDocument();
    tableDocument.tables.error_codes = [
      ...tableDocument.tables.error_codes.filter((errorCode) => errorCode.projectId !== projectId),
      ...errorCodes.map((errorCode) => ({ ...errorCode, projectId })),
    ];
    touchProject(tableDocument, projectId);
    writeTableDocument(tableDocument);
    return errorCodes;
  },

  async createService(projectId, service) {
    const tableDocument = readPersistedTableDocument();
    tableDocument.tables.services.push({ ...service, projectId });
    touchProject(tableDocument, projectId);
    writeTableDocument(tableDocument);
    return service;
  },

  async updateServiceSpec(projectId, serviceId, spec) {
    const tableDocument = readPersistedTableDocument();
    const service = tableDocument.tables.services.find((item) => item.projectId === projectId && item.id === serviceId);
    if (!service) throw new Error("Service not found");
    service.name = spec.name || service.name;
    service.spec = spec;
    service.updatedAt = nowIso();
    touchProject(tableDocument, projectId);
    writeTableDocument(tableDocument);
    const { projectId: _projectId, ...domainService } = service;
    return domainService;
  },
};

function readStoreSnapshot() {
  const tableDocument = readTableDocument();
  if (tableDocument) return tableDocumentToStore(tableDocument);

  const legacyDocument = readLegacyDocument();
  if (!legacyDocument) return emptyStore;
  const migratedTableDocument = storeToTableDocument(legacyDocument);
  writeTableDocument(migratedTableDocument);
  return legacyDocument;
}

function readPersistedTableDocument() {
    const tableDocument = readTableDocument();
    if (tableDocument) return tableDocument;

    const legacyDocument = readLegacyDocument();
    if (!legacyDocument) return emptyTableDocument;
    const migratedTableDocument = storeToTableDocument(legacyDocument);
    writeTableDocument(migratedTableDocument);
    return migratedTableDocument;
}

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

function touchProject(tableDocument: ProjectTableDocument, projectId: string) {
  const project = tableDocument.tables.projects.find((item) => item.id === projectId);
  if (project) project.updatedAt = nowIso();
}

function nowIso() {
  return new Date().toISOString();
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
