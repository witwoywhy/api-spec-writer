import type { ErrorCode, EventCode, Project, Service, ServiceSpec, ServiceType, StoreDocument } from "../domain";

const DOCUMENT_STORAGE_KEY = "api-spec-writer-platform:v1";
const TABLE_STORAGE_KEY = "api-spec-writer-platform:tables:v1";
const PROJECT_LIST_STORAGE_KEY = "api-spec-writer-platform:projects:v2";
const PROJECT_DETAIL_STORAGE_PREFIX = "api-spec-writer-platform:project:v2:";
const ARCHIVE_STORAGE_KEY = "api-spec-writer-platform:project-archive:v1";
const SERVICE_ARCHIVE_STORAGE_KEY = "api-spec-writer-platform:service-archive:v1";

export type ProjectStoreAdaptor = {
  getSnapshot(): Promise<StoreDocument>;
  createProject(project: Project): Promise<Project>;
  renameProject(projectId: string, name: string): Promise<Project>;
  archiveProject(projectId: string): Promise<void>;
  createEventCode(projectId: string, eventCode: EventCode): Promise<EventCode>;
  replaceEventCodes(projectId: string, eventCodes: EventCode[]): Promise<EventCode[]>;
  createErrorCode(projectId: string, errorCode: ErrorCode): Promise<ErrorCode>;
  replaceErrorCodes(projectId: string, errorCodes: ErrorCode[]): Promise<ErrorCode[]>;
  createService(projectId: string, service: Service): Promise<Service>;
  renameService(projectId: string, serviceId: string, name: string): Promise<Service>;
  archiveService(projectId: string, serviceId: string): Promise<void>;
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

type LegacyErrorCode = Partial<ErrorCode> & {
  id: string;
  domain?: string;
  status: string;
  code: string;
  message?: string;
  description?: string;
};

type ServiceRow = Service & {
  projectId: string;
};

type LegacyServiceSpec = Omit<Partial<ServiceSpec>, "errors" | "type"> & {
  name: string;
  errors?: LegacyErrorCode[];
  type?: ServiceType;
};

type LegacyService = Omit<Partial<Service>, "spec"> & {
  id: string;
  name: string;
  spec: LegacyServiceSpec;
  updatedAt: string;
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

type ProjectListDocument = {
  schemaVersion: 2;
  projects: ProjectRow[];
};

type ProjectDetailDocument = {
  schemaVersion: 2;
  project_id: string;
  project_name: string;
  createdAt: string;
  updatedAt: string;
  event_code: EventCode[];
  error_code: ErrorCode[];
  services: Service[];
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
    const index = readPersistedProjectIndex();
    index.projects.push({
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    });
    writeProjectIndex(index);
    writeProjectDetail(projectToDetailDocument(project));
    return project;
  },

  async renameProject(projectId, name) {
    const index = readPersistedProjectIndex();
    const projectRow = index.projects.find((item) => item.id === projectId);
    const project = readProject(projectId);
    if (!projectRow || !project) throw new Error("Project not found");
    const updatedAt = nowIso();
    projectRow.name = name;
    projectRow.updatedAt = updatedAt;
    project.name = name;
    project.updatedAt = updatedAt;
    writeProjectIndex(index);
    writeProjectDetail(projectToDetailDocument(project));
    return project;
  },

  async archiveProject(projectId) {
    const index = readPersistedProjectIndex();
    const project = readProject(projectId);
    if (!project) throw new Error("Project not found");
    appendArchivedProject(project);
    index.projects = index.projects.filter((item) => item.id !== projectId);
    writeProjectIndex(index);
    localStorage.removeItem(projectDetailKey(projectId));
  },

  async createEventCode(projectId, eventCode) {
    const project = requireProject(projectId);
    project.event_code.push(eventCode);
    writeTouchedProject(project);
    return eventCode;
  },

  async replaceEventCodes(projectId, eventCodes) {
    const project = requireProject(projectId);
    project.event_code = eventCodes;
    writeTouchedProject(project);
    return eventCodes;
  },

  async createErrorCode(projectId, errorCode) {
    const project = requireProject(projectId);
    project.error_code.push(errorCode);
    writeTouchedProject(project);
    return errorCode;
  },

  async replaceErrorCodes(projectId, errorCodes) {
    const project = requireProject(projectId);
    project.error_code = errorCodes;
    writeTouchedProject(project);
    return errorCodes;
  },

  async createService(projectId, service) {
    const project = requireProject(projectId);
    project.services.push(service);
    writeTouchedProject(project);
    return service;
  },

  async renameService(projectId, serviceId, name) {
    const project = requireProject(projectId);
    const service = project.services.find((item) => item.id === serviceId);
    if (!service) throw new Error("Service not found");
    service.name = name;
    service.spec = { ...service.spec, name };
    service.updatedAt = nowIso();
    writeTouchedProject(project);
    return service;
  },

  async archiveService(projectId, serviceId) {
    const project = requireProject(projectId);
    const service = project.services.find((item) => item.id === serviceId);
    if (!service) throw new Error("Service not found");
    appendArchivedService({ ...service, projectId });
    project.services = project.services.filter((item) => item.id !== serviceId);
    writeTouchedProject(project);
  },

  async updateServiceSpec(projectId, serviceId, spec) {
    const project = requireProject(projectId);
    const service = project.services.find((item) => item.id === serviceId);
    if (!service) throw new Error("Service not found");
    service.name = spec.name || service.name;
    service.spec = spec;
    service.updatedAt = nowIso();
    writeTouchedProject(project);
    return service;
  },
};

function readStoreSnapshot() {
  const projectIndex = readProjectIndex();
  if (projectIndex) return projectIndexToStore(projectIndex);

  const tableDocument = readTableDocument();
  if (tableDocument) {
    const store = tableDocumentToStore(tableDocument);
    writeStoreAsProjectDocuments(store);
    return store;
  }

  const legacyDocument = readLegacyDocument();
  if (!legacyDocument) return emptyStore;
  writeStoreAsProjectDocuments(legacyDocument);
  return legacyDocument;
}

function readPersistedProjectIndex(): ProjectListDocument {
  const projectIndex = readProjectIndex();
  if (projectIndex) return projectIndex;

  const snapshot = readStoreSnapshot();
  return {
    schemaVersion: 2,
    projects: snapshot.projects.map((project) => ({
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    })),
  };
}

function readProjectIndex(): ProjectListDocument | null {
  const raw = localStorage.getItem(PROJECT_LIST_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ProjectListDocument;
    return {
      schemaVersion: 2,
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
    } satisfies ProjectListDocument;
  } catch {
    return null;
  }
}

function writeProjectIndex(projectIndex: ProjectListDocument) {
  localStorage.setItem(PROJECT_LIST_STORAGE_KEY, JSON.stringify(projectIndex));
}

function projectDetailKey(projectId: string) {
  return `${PROJECT_DETAIL_STORAGE_PREFIX}${projectId}`;
}

function readProject(projectId: string) {
  const raw = localStorage.getItem(projectDetailKey(projectId));
  if (!raw) return null;
  try {
    return detailDocumentToProject(JSON.parse(raw) as ProjectDetailDocument);
  } catch {
    return null;
  }
}

function requireProject(projectId: string) {
  const project = readProject(projectId);
  if (!project) throw new Error("Project not found");
  return project;
}

function writeProjectDetail(projectDetail: ProjectDetailDocument) {
  localStorage.setItem(projectDetailKey(projectDetail.project_id), JSON.stringify(projectDetail));
}

function writeTouchedProject(project: Project) {
  const updatedAt = nowIso();
  project.updatedAt = updatedAt;
  const index = readPersistedProjectIndex();
  const projectRow = index.projects.find((item) => item.id === project.id);
  if (projectRow) {
    projectRow.name = project.name;
    projectRow.updatedAt = updatedAt;
    writeProjectIndex(index);
  }
  writeProjectDetail(projectToDetailDocument(project));
}

function projectToDetailDocument(project: Project): ProjectDetailDocument {
  return {
    schemaVersion: 2,
    project_id: project.id,
    project_name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    event_code: project.event_code,
    error_code: project.error_code,
    services: project.services,
  };
}

function detailDocumentToProject(projectDetail: ProjectDetailDocument): Project {
  return {
    id: projectDetail.project_id,
    name: projectDetail.project_name,
    createdAt: projectDetail.createdAt,
    updatedAt: projectDetail.updatedAt,
    event_code: Array.isArray(projectDetail.event_code) ? projectDetail.event_code : [],
    error_code: Array.isArray(projectDetail.error_code) ? projectDetail.error_code.map(normalizeErrorCode) : [],
    services: Array.isArray(projectDetail.services) ? projectDetail.services.map(normalizeService) : [],
  };
}

function projectIndexToStore(projectIndex: ProjectListDocument): StoreDocument {
  return {
    schemaVersion: 1,
    projects: projectIndex.projects.flatMap((project) => {
      const detail = readProject(project.id);
      if (detail) return [detail];
      return [{
        id: project.id,
        name: project.name,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        event_code: [],
        error_code: [],
        services: [],
      }];
    }),
  };
}

function writeStoreAsProjectDocuments(store: StoreDocument) {
  writeProjectIndex({
    schemaVersion: 2,
    projects: store.projects.map((project) => ({
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    })),
  });
  for (const project of store.projects) writeProjectDetail(projectToDetailDocument(project));
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

function appendArchivedProject(project: Project) {
  const archived = readArchivedProjects();
  archived.push({ ...project, archivedAt: nowIso() });
  localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(archived));
}

function appendArchivedService(service: ServiceRow) {
  const archived = readArchivedServices();
  archived.push({ ...service, archivedAt: nowIso() });
  localStorage.setItem(SERVICE_ARCHIVE_STORAGE_KEY, JSON.stringify(archived));
}

function readArchivedProjects() {
  const raw = localStorage.getItem(ARCHIVE_STORAGE_KEY);
  if (!raw) return [] as Array<Project & { archivedAt: string }>;
  try {
    const parsed = JSON.parse(raw) as Array<Project & { archivedAt: string }>;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readArchivedServices() {
  const raw = localStorage.getItem(SERVICE_ARCHIVE_STORAGE_KEY);
  if (!raw) return [] as Array<ServiceRow & { archivedAt: string }>;
  try {
    const parsed = JSON.parse(raw) as Array<ServiceRow & { archivedAt: string }>;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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
      error_codes: Array.isArray(tableDocument.tables?.error_codes) ? tableDocument.tables.error_codes.map(normalizeErrorCodeRow) : [],
      services: Array.isArray(tableDocument.tables?.services) ? tableDocument.tables.services.map(normalizeServiceRow) : [],
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
          ...normalizeErrorCode(errorCode),
          projectId: project.id,
        })),
      ),
      services: store.projects.flatMap((project) =>
        project.services.map((service) => ({
          ...normalizeService(service),
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
      .map(({ projectId: _projectId, ...errorCode }) => normalizeErrorCode(errorCode)),
    services: tableDocument.tables.services
      .filter((service) => service.projectId === project.id)
      .map(({ projectId: _projectId, ...service }) => normalizeService(service)),
  };
}

function normalizeServiceRow(service: LegacyService & { projectId: string }): ServiceRow {
  return {
    ...normalizeService(service),
    projectId: service.projectId,
  };
}

function normalizeService(service: LegacyService): Service {
  return {
    id: service.id,
    name: service.name,
    updatedAt: service.updatedAt,
    spec: {
      ...service.spec,
      type: service.spec.type ?? "http",
      method: service.spec.method ?? "GET",
      url: service.spec.url ?? "",
      authentication: service.spec.authentication ?? "",
      description: service.spec.description ?? "",
      requestExample: service.spec.requestExample ?? "",
      requestExamples: normalizeRequestExamples(service.spec),
      requestFields: service.spec.requestFields ?? [],
      sequence: service.spec.sequence ?? "",
      errors: (service.spec.errors ?? []).map(normalizeErrorCode),
      responseExample: service.spec.responseExample ?? "",
      responseExamples: normalizeResponseExamples(service.spec),
      responseFields: service.spec.responseFields ?? [],
      mappingSections: service.spec.mappingSections ?? [],
    },
  };
}

function normalizeRequestExamples(spec: LegacyServiceSpec) {
  if (Array.isArray(spec.requestExamples) && spec.requestExamples.length > 0) {
    return spec.requestExamples.map((example) => ({
      id: example.id,
      name: example.name ?? "",
      value: example.value ?? "",
    }));
  }
  return spec.requestExample?.trim()
    ? [{ id: "legacy-request-example", name: "Default", value: spec.requestExample }]
    : [];
}

function normalizeResponseExamples(spec: LegacyServiceSpec) {
  if (Array.isArray(spec.responseExamples) && spec.responseExamples.length > 0) {
    return spec.responseExamples.map((example) => ({
      id: example.id,
      name: example.name ?? "",
      status: example.status ?? "200",
      value: example.value ?? "",
    }));
  }
  return spec.responseExample?.trim()
    ? [{ id: "legacy-response-example", name: "Success", status: "200", value: spec.responseExample }]
    : [];
}

function normalizeErrorCodeRow(errorCode: LegacyErrorCode & { projectId: string }): ErrorCodeRow {
  return {
    ...normalizeErrorCode(errorCode),
    projectId: errorCode.projectId,
  };
}

function normalizeErrorCode(errorCode: LegacyErrorCode): ErrorCode {
  return {
    id: errorCode.id,
    errorCodeId: errorCode.errorCodeId,
    domain: errorCode.domain ?? "general",
    status: errorCode.status,
    code: errorCode.code,
    message_th: errorCode.message_th ?? "",
    description_th: errorCode.description_th ?? "",
    message_en: errorCode.message_en ?? errorCode.message ?? "",
    description_en: errorCode.description_en ?? errorCode.description ?? "",
  };
}
