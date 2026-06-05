import type { DbTable, ErrorCode, EventCode, Project, Service, ServiceFolder, ServiceSpec, StoreDocument } from "../domain";
import { uid } from "../lib/id";

export const GENERAL_SERVICE_FOLDER_ID = "__general_services__";

const now = () => new Date().toISOString();

export function mergeOpenIds(current: Set<string>, ids: string[]) {
  const next = new Set(current);
  for (const id of ids) next.add(id);
  return next;
}

export function serviceFolderForService(project: Project, service: Service): ServiceFolder | undefined {
  if (!service.folderId) return { id: "", name: "General", createdAt: "", updatedAt: "" };
  return project.service_folders.find((folder) => folder.id === service.folderId);
}

export function serviceFolderKeys(project: Project) {
  const keys = project.service_folders.map((folder) => serviceFolderKey(project.id, folder.id));
  if (project.services.some((service) => !service.folderId)) keys.push(serviceFolderKey(project.id, GENERAL_SERVICE_FOLDER_ID));
  return keys;
}

export function serviceFolderKey(projectId: string, folderId: string) {
  return `${projectId}:${folderId}`;
}

export function updateServiceSpecInStore(
  store: StoreDocument,
  projectId: string,
  serviceId: string,
  updater: (spec: ServiceSpec) => ServiceSpec,
): StoreDocument {
  const timestamp = now();
  return {
    ...store,
    projects: store.projects.map((project) => {
      if (project.id !== projectId) return project;
      return {
        ...project,
        updatedAt: timestamp,
        services: project.services.map((service) => {
          if (service.id !== serviceId) return service;
          const spec = updater(service.spec);
          return {
            ...service,
            name: spec.name || service.name,
            spec,
            updatedAt: timestamp,
          };
        }),
      };
    }),
  };
}

export function replaceEventCodesInStore(store: StoreDocument, projectId: string, eventCodes: EventCode[]): StoreDocument {
  const timestamp = now();
  return {
    ...store,
    projects: store.projects.map((project) => (
      project.id === projectId ? { ...project, event_code: eventCodes, updatedAt: timestamp } : project
    )),
  };
}

export function replaceErrorCodesInStore(store: StoreDocument, projectId: string, errorCodes: ErrorCode[]): StoreDocument {
  const timestamp = now();
  return {
    ...store,
    projects: store.projects.map((project) => (
      project.id === projectId ? { ...project, error_code: errorCodes, updatedAt: timestamp } : project
    )),
  };
}

export function replaceDbSchemaInStore(store: StoreDocument, projectId: string, dbSchema: DbTable[]): StoreDocument {
  const timestamp = now();
  return {
    ...store,
    projects: store.projects.map((project) => (
      project.id === projectId ? { ...project, db_schema: dbSchema, updatedAt: timestamp } : project
    )),
  };
}

export function replaceServiceFoldersInStore(store: StoreDocument, projectId: string, serviceFolders: ServiceFolder[]): StoreDocument {
  const timestamp = now();
  return {
    ...store,
    projects: store.projects.map((project) => (
      project.id === projectId ? { ...project, service_folders: serviceFolders, updatedAt: timestamp } : project
    )),
  };
}

export function removeServiceFolderInStore(store: StoreDocument, projectId: string, folderId: string): StoreDocument {
  const timestamp = now();
  return {
    ...store,
    projects: store.projects.map((project) => {
      if (project.id !== projectId) return project;
      return {
        ...project,
        service_folders: project.service_folders.filter((folder) => folder.id !== folderId),
        services: project.services.map((service) => (
          service.folderId === folderId ? { ...service, folderId: undefined, updatedAt: timestamp } : service
        )),
        updatedAt: timestamp,
      };
    }),
  };
}

export function moveServiceInStore(store: StoreDocument, projectId: string, sourceFolderId: string, targetFolderId: string, sourceServiceId: string, targetServiceId?: string): StoreDocument {
  const timestamp = now();
  return {
    ...store,
    projects: store.projects.map((project) => {
      if (project.id !== projectId) return project;
      const sourceService = project.services.find((service) => service.id === sourceServiceId && serviceFolderId(service) === sourceFolderId);
      if (!sourceService) return project;

      const targetFolderValue = targetFolderId === GENERAL_SERVICE_FOLDER_ID ? undefined : targetFolderId;
      const movedService: Service = { ...sourceService, folderId: targetFolderValue, updatedAt: timestamp };
      const remainingServices = project.services.filter((service) => service.id !== sourceServiceId);
      const targetServiceIndex = targetServiceId ? remainingServices.findIndex((service) => service.id === targetServiceId && serviceFolderId(service) === targetFolderId) : -1;
      let lastTargetFolderServiceIndex = -1;
      remainingServices.forEach((service, index) => {
        if (serviceFolderId(service) === targetFolderId) lastTargetFolderServiceIndex = index;
      });
      const insertIndex = targetServiceIndex >= 0 ? targetServiceIndex : lastTargetFolderServiceIndex + 1 || remainingServices.length;
      const services = [...remainingServices];
      services.splice(insertIndex, 0, movedService);

      return {
        ...project,
        services,
        updatedAt: timestamp,
      };
    }),
  };
}

export function moveById<T extends { id: string }>(items: T[], sourceId: string, targetId: string): T[] {
  const sourceIndex = items.findIndex((item) => item.id === sourceId);
  const targetIndex = items.findIndex((item) => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return items;
  const nextItems = [...items];
  const [sourceItem] = nextItems.splice(sourceIndex, 1);
  nextItems.splice(targetIndex, 0, sourceItem);
  return nextItems;
}

export function serviceFolderId(service: Service) {
  return service.folderId ?? GENERAL_SERVICE_FOLDER_ID;
}

export function validateProject(project: Project): Project {
  if (!project?.name || !Array.isArray(project.services) || !Array.isArray(project.event_code) || !Array.isArray(project.error_code)) {
    throw new Error("Invalid project");
  }
  return {
    ...project,
    db_schema: Array.isArray(project.db_schema) ? project.db_schema : [],
    service_folders: Array.isArray(project.service_folders) ? project.service_folders : [],
  };
}

export function cloneImportedProject(project: Project): Project {
  const validatedProject = validateProject(project);
  const timestamp = now();
  const errorCodeIds = new Map<string, string>();
  const errorCodeIdsByCode = new Map<string, string>();
  const serviceFolderIds = new Map<string, string>();
  const errorCode = validatedProject.error_code.map((error) => {
    const id = uid();
    errorCodeIds.set(error.id, id);
    errorCodeIdsByCode.set(error.code, id);
    return { ...error, id };
  });
  const serviceFolders = validatedProject.service_folders.map((folder) => {
    const id = uid();
    serviceFolderIds.set(folder.id, id);
    return { ...folder, id, createdAt: timestamp, updatedAt: timestamp };
  });

  return {
    id: uid(),
    name: validatedProject.name,
    event_code: validatedProject.event_code.map((eventCode) => ({ ...eventCode, id: uid() })),
    error_code: errorCode,
    service_folders: serviceFolders,
    db_schema: validatedProject.db_schema.map((table) => ({
      ...table,
      id: uid(),
      columns: table.columns.map((column) => ({ ...column, id: uid() })),
    })),
    services: validatedProject.services.map((service) => ({
      ...service,
      id: uid(),
      folderId: service.folderId ? serviceFolderIds.get(service.folderId) : undefined,
      updatedAt: timestamp,
      spec: {
        ...service.spec,
        requestExamples: requestExamplesForImport(service.spec).map((example) => ({ ...example, id: uid() })),
        responseExamples: responseExamplesForImport(service.spec).map((example) => ({ ...example, id: uid() })),
        requestFields: service.spec.requestFields.map((row) => ({ ...row, id: uid() })),
        responseFields: service.spec.responseFields.map((row) => ({ ...row, id: uid() })),
        errors: service.spec.errors.map((error) => ({
          ...error,
          id: uid(),
          errorCodeId: error.errorCodeId ? errorCodeIds.get(error.errorCodeId) : errorCodeIdsByCode.get(error.code),
        })),
        mappingSections: service.spec.mappingSections.map((section) => ({
          ...section,
          id: uid(),
          rows: section.rows.map((row) => ({ ...row, id: uid() })),
        })),
      },
    })),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function requestExamplesForImport(spec: ServiceSpec) {
  if (Array.isArray(spec.requestExamples) && spec.requestExamples.length > 0) return spec.requestExamples;
  return spec.requestExample?.trim() ? [{ id: "legacy-request-example", name: "Default", value: spec.requestExample }] : [];
}

function responseExamplesForImport(spec: ServiceSpec) {
  if (Array.isArray(spec.responseExamples) && spec.responseExamples.length > 0) return spec.responseExamples;
  return spec.responseExample?.trim() ? [{ id: "legacy-response-example", name: "Success", status: "200", value: spec.responseExample }] : [];
}
