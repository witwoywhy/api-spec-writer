import type { ErrorCode, EventCode, Project, Service, ServiceSpec, ServiceType, StoreDocument } from "../domain";

const DOCUMENT_STORAGE_KEY = "api-spec-writer-platform:v1";
const TABLE_STORAGE_KEY = "api-spec-writer-platform:tables:v1";
const PROJECT_LIST_STORAGE_KEY = "api-spec-writer-platform:projects:v2";
const PROJECT_DETAIL_STORAGE_PREFIX = "api-spec-writer-platform:project:v2:";
const PROJECT_FILE_DB_NAME = "api-spec-writer-platform-files";
const PROJECT_FILE_STORE_NAME = "project-file-handles";
const ARCHIVE_STORAGE_KEY = "api-spec-writer-platform:project-archive:v1";
const SERVICE_ARCHIVE_STORAGE_KEY = "api-spec-writer-platform:service-archive:v1";

export type ProjectStoreAdaptor = {
  getSnapshot(): Promise<StoreDocument>;
  createProject(project: Project, fileName?: string): Promise<Project>;
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
  fileName?: string;
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

export type ProjectFileHandle = {
  name?: string;
  queryPermission?: (options?: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (options?: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
  getFile: () => Promise<File>;
  createWritable: () => Promise<{
    write: (content: string) => Promise<void>;
    close: () => Promise<void>;
  }>;
};

type ProjectHandleRow = {
  projectId: string;
  handle: ProjectFileHandle;
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

  async createProject(project, fileName) {
    const index = readPersistedProjectIndex();
    index.projects.push({
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      fileName,
    });
    writeProjectIndex(index);
    await writeProjectFile(project);
    return project;
  },

  async renameProject(projectId, name) {
    const index = readPersistedProjectIndex();
    const projectRow = index.projects.find((item) => item.id === projectId);
    const project = await readProject(projectId);
    if (!projectRow || !project) throw new Error("Project not found");
    const updatedAt = nowIso();
    projectRow.name = name;
    projectRow.updatedAt = updatedAt;
    project.name = name;
    project.updatedAt = updatedAt;
    writeProjectIndex(index);
    await writeProjectFile(project);
    return project;
  },

  async archiveProject(projectId) {
    const index = readPersistedProjectIndex();
    const project = await readProject(projectId);
    if (!project) throw new Error("Project not found");
    appendArchivedProject(project);
    index.projects = index.projects.filter((item) => item.id !== projectId);
    writeProjectIndex(index);
    localStorage.removeItem(projectDetailKey(projectId));
    await deleteProjectFileHandle(projectId);
  },

  async createEventCode(projectId, eventCode) {
    const project = await requireProject(projectId);
    project.event_code.push(eventCode);
    await writeTouchedProject(project);
    return eventCode;
  },

  async replaceEventCodes(projectId, eventCodes) {
    const project = await requireProject(projectId);
    project.event_code = eventCodes;
    await writeTouchedProject(project);
    return eventCodes;
  },

  async createErrorCode(projectId, errorCode) {
    const project = await requireProject(projectId);
    project.error_code.push(errorCode);
    await writeTouchedProject(project);
    return errorCode;
  },

  async replaceErrorCodes(projectId, errorCodes) {
    const project = await requireProject(projectId);
    project.error_code = errorCodes;
    await writeTouchedProject(project);
    return errorCodes;
  },

  async createService(projectId, service) {
    const project = await requireProject(projectId);
    project.services.push(service);
    await writeTouchedProject(project);
    return service;
  },

  async renameService(projectId, serviceId, name) {
    const project = await requireProject(projectId);
    const service = project.services.find((item) => item.id === serviceId);
    if (!service) throw new Error("Service not found");
    service.name = name;
    service.spec = { ...service.spec, name };
    service.updatedAt = nowIso();
    await writeTouchedProject(project);
    return service;
  },

  async archiveService(projectId, serviceId) {
    const project = await requireProject(projectId);
    const service = project.services.find((item) => item.id === serviceId);
    if (!service) throw new Error("Service not found");
    appendArchivedService({ ...service, projectId });
    project.services = project.services.filter((item) => item.id !== serviceId);
    await writeTouchedProject(project);
  },

  async updateServiceSpec(projectId, serviceId, spec) {
    const project = await requireProject(projectId);
    const service = project.services.find((item) => item.id === serviceId);
    if (!service) throw new Error("Service not found");
    service.name = spec.name || service.name;
    service.spec = spec;
    service.updatedAt = nowIso();
    await writeTouchedProject(project);
    return service;
  },
};

async function readStoreSnapshot() {
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

  return {
    schemaVersion: 2,
    projects: [],
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

async function readProject(projectId: string) {
  const handle = await getProjectFileHandle(projectId);
  if (handle) {
    try {
      const permitted = await ensureProjectFilePermission(handle, "readwrite");
      if (!permitted) throw new Error("Project file permission denied");
      return normalizeProject(JSON.parse(await (await handle.getFile()).text()) as Project);
    } catch (reason) {
      console.warn("Unable to read project file", reason);
      throw reason;
    }
  }

  const raw = localStorage.getItem(projectDetailKey(projectId));
  if (!raw) return null;
  try {
    return detailDocumentToProject(JSON.parse(raw) as ProjectDetailDocument);
  } catch {
    return null;
  }
}

async function requireProject(projectId: string) {
  const project = await readProject(projectId);
  if (!project) throw new Error("Project not found");
  return project;
}

function writeProjectDetail(projectDetail: ProjectDetailDocument) {
  localStorage.setItem(projectDetailKey(projectDetail.project_id), JSON.stringify(projectDetail));
}

async function writeProjectFile(project: Project) {
  const handle = await getProjectFileHandle(project.id);
  if (!handle) throw new Error("Project file not found");
  const permitted = await ensureProjectFilePermission(handle, "readwrite");
  if (!permitted) throw new Error("Project file permission denied");
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(project, null, 2));
  await writable.close();
  localStorage.removeItem(projectDetailKey(project.id));
}

async function writeTouchedProject(project: Project) {
  const updatedAt = nowIso();
  project.updatedAt = updatedAt;
  const index = readPersistedProjectIndex();
  const projectRow = index.projects.find((item) => item.id === project.id);
  if (projectRow) {
    projectRow.name = project.name;
    projectRow.updatedAt = updatedAt;
    writeProjectIndex(index);
  }
  await writeProjectFile(project);
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
  return normalizeProject({
    id: projectDetail.project_id,
    name: projectDetail.project_name,
    createdAt: projectDetail.createdAt,
    updatedAt: projectDetail.updatedAt,
    event_code: Array.isArray(projectDetail.event_code) ? projectDetail.event_code : [],
    error_code: Array.isArray(projectDetail.error_code) ? projectDetail.error_code.map(normalizeErrorCode) : [],
    services: Array.isArray(projectDetail.services) ? projectDetail.services.map(normalizeService) : [],
  });
}

function normalizeProject(project: Project): Project {
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    event_code: Array.isArray(project.event_code) ? project.event_code : [],
    error_code: Array.isArray(project.error_code) ? project.error_code.map(normalizeErrorCode) : [],
    services: Array.isArray(project.services) ? project.services.map(normalizeService) : [],
  };
}

async function projectIndexToStore(projectIndex: ProjectListDocument): Promise<StoreDocument> {
  const projects: Project[] = [];
  for (const project of projectIndex.projects) {
    let detail: Project | null = null;
    try {
      detail = await readProject(project.id);
    } catch {
      detail = null;
    }
    projects.push(detail ?? {
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      event_code: [],
      error_code: [],
      services: [],
    });
  }
  return {
    schemaVersion: 1,
    projects,
  };
}

async function ensureProjectFilePermission(handle: ProjectFileHandle, mode: "read" | "readwrite") {
  if (!handle.queryPermission || !handle.requestPermission) return true;
  const current = await handle.queryPermission({ mode });
  if (current === "granted") return true;
  return await handle.requestPermission({ mode }) === "granted";
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

export async function registerProjectFileHandle(projectId: string, handle: ProjectFileHandle) {
  const database = await openProjectFileDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(PROJECT_FILE_STORE_NAME, "readwrite");
    transaction.objectStore(PROJECT_FILE_STORE_NAME).put({ projectId, handle } satisfies ProjectHandleRow);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function getProjectFileHandle(projectId: string) {
  const database = await openProjectFileDatabase();
  return new Promise<ProjectFileHandle | null>((resolve, reject) => {
    const transaction = database.transaction(PROJECT_FILE_STORE_NAME, "readonly");
    const request = transaction.objectStore(PROJECT_FILE_STORE_NAME).get(projectId);
    request.onsuccess = () => resolve((request.result as ProjectHandleRow | undefined)?.handle ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function deleteProjectFileHandle(projectId: string) {
  const database = await openProjectFileDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(PROJECT_FILE_STORE_NAME, "readwrite");
    transaction.objectStore(PROJECT_FILE_STORE_NAME).delete(projectId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function openProjectFileDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(PROJECT_FILE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PROJECT_FILE_STORE_NAME)) {
        database.createObjectStore(PROJECT_FILE_STORE_NAME, { keyPath: "projectId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
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
