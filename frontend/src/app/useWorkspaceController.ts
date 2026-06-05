import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { localStorageProjectStore, registerProjectFileHandle } from "../adaptors/projectStore";
import type { Page } from "../components/ProjectTree";
import type { DbTable, ErrorCode, EventCode, Project, Service, ServiceFolder, ServiceSpec, StoreDocument } from "../domain";
import { copyTextToClipboard, downloadFile, safeFileName } from "../features/preview/exportActions";
import { dbSchemaMarkdown, dbSchemaSqlPreview } from "../features/preview/dbSchemaPreview";
import { buildHtmlDocument, markdownToHtml } from "../features/preview/markdownHtml";
import { errorCodesPreviewMarkdownForProject, projectOpenApi, projectSpecMarkdown } from "../features/preview/projectPreview";
import { buildAppPath, parseAppRoute } from "../lib/appRouter";
import { serviceGoStruct } from "../lib/goStructPreview";
import { uid } from "../lib/id";
import { serviceOpenApi } from "../lib/openApiSpec";
import { createDefaultErrorCodes, createDefaultSpec } from "../lib/serviceDefaults";
import { serviceMarkdown } from "../lib/serviceMarkdown";
import { saveProjectFile, selectProjectFile } from "./projectFiles";
import { mergeProjectDrafts, removeProjectDraft, writeProjectDraft } from "./projectDrafts";
import {
  GENERAL_SERVICE_FOLDER_ID,
  mergeOpenIds,
  moveById,
  moveServiceInStore,
  removeServiceFolderInStore,
  replaceDbSchemaInStore,
  replaceErrorCodesInStore,
  replaceEventCodesInStore,
  replaceServiceFoldersInStore,
  serviceFolderForService,
  serviceFolderKey,
  serviceFolderKeys,
  updateServiceSpecInStore,
  validateProject,
} from "./projectMutations";
import { type MarkdownMode, type ViewMode, parseMarkdownMode, parseViewMode, servicePreviewMode as normalizeServicePreviewMode, serviceSearchParams } from "./viewMode";

const now = () => new Date().toISOString();
const PREVIEW_TYPE_STORAGE_KEY = "api-spec-writer-platform:preview-type";
const initialRoute = parseAppRoute(window.location.pathname);
const initialViewMode = parseViewMode(new URLSearchParams(window.location.search));
const initialMarkdownMode = parseMarkdownMode(new URLSearchParams(window.location.search), localStorage.getItem(PREVIEW_TYPE_STORAGE_KEY));

export function useWorkspaceController() {
  const [store, setStore] = useState<StoreDocument>({ schemaVersion: 1, projects: [] });
  const [selectedProjectId, setSelectedProjectId] = useState(initialRoute.projectId);
  const [selectedServiceId, setSelectedServiceId] = useState(initialRoute.serviceId);
  const [selectedDbTableId, setSelectedDbTableId] = useState(initialRoute.dbTableId);
  const [page, setPage] = useState<Page>(initialRoute.page);
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const [markdownMode, setMarkdownMode] = useState<MarkdownMode>(initialMarkdownMode);
  const [editorWidth, setEditorWidth] = useState(58);
  const [saveError, setSaveError] = useState("");
  const [copiedPreview, setCopiedPreview] = useState("");
  const [openProjects, setOpenProjects] = useState<Set<string>>(() => new Set());
  const [openServices, setOpenServices] = useState<Set<string>>(() => new Set());
  const [openServiceFolders, setOpenServiceFolders] = useState<Set<string>>(() => new Set());
  const [openDbSchemas, setOpenDbSchemas] = useState<Set<string>>(() => new Set());
  const htmlExportRef = useRef<HTMLDivElement>(null);
  const copiedPreviewTimerRef = useRef<number | null>(null);
  const latestStoreRef = useRef(store);
  const projectSaveTimersRef = useRef<Map<string, number>>(new Map());
  const pendingProjectSnapshotsRef = useRef<Map<string, Project>>(new Map());
  const projectSaveChainsRef = useRef<Map<string, Promise<void>>>(new Map());

  const selectedProject = store.projects.find((project) => project.id === selectedProjectId) ?? store.projects[0];
  const selectedService = selectedProject?.services.find((service) => service.id === selectedServiceId) ?? selectedProject?.services[0];
  const selectedServiceFolder = selectedProject && selectedService ? serviceFolderForService(selectedProject, selectedService) : undefined;
  const selectedDbTable = selectedProject?.db_schema.find((table) => table.id === selectedDbTableId) ?? selectedProject?.db_schema[0];
  const shouldRenderServicePreview = page === "services" && viewMode !== "edit" && Boolean(selectedService);
  const shouldRenderDbSchemaPreview = page === "dbSchema" && viewMode !== "edit";
  const shouldRenderErrorCodesPreview = page === "errorCodes" && viewMode !== "edit";
  const isFullPreview = (page === "services" || page === "dbSchema" || page === "errorCodes") && viewMode === "preview";
  const servicePreviewMode = normalizeServicePreviewMode(markdownMode);
  const shouldBuildMarkdown = shouldRenderServicePreview && (servicePreviewMode === "markdown" || servicePreviewMode === "html");
  const markdown = useMemo(
    () => shouldBuildMarkdown && selectedService ? serviceMarkdown(selectedService.spec, selectedProject?.error_code ?? []) : "",
    [selectedProject?.error_code, selectedService, shouldBuildMarkdown],
  );
  const dbSchemaPreviewMarkdown = useMemo(
    () => shouldRenderDbSchemaPreview && selectedProject ? dbSchemaMarkdown(selectedProject) : "",
    [selectedProject, shouldRenderDbSchemaPreview],
  );
  const dbSchemaPreviewMode: MarkdownMode = markdownMode === "html" || markdownMode === "sql" ? markdownMode : "markdown";
  const errorCodesPreviewMarkdown = useMemo(
    () => shouldRenderErrorCodesPreview && selectedProject ? errorCodesPreviewMarkdownForProject(selectedProject) : "",
    [selectedProject, shouldRenderErrorCodesPreview],
  );
  const errorCodesPreviewMode: MarkdownMode = markdownMode === "html" ? "html" : "markdown";
  const dbSchemaSql = useMemo(
    () => shouldRenderDbSchemaPreview && selectedProject ? dbSchemaSqlPreview(selectedProject.db_schema) : "",
    [selectedProject, shouldRenderDbSchemaPreview],
  );
  const openApiDocument = useMemo(
    () => shouldRenderServicePreview && servicePreviewMode === "openapi" && selectedService ? serviceOpenApi(selectedService.spec, selectedProject?.error_code ?? []) : null,
    [servicePreviewMode, selectedProject?.error_code, selectedService, shouldRenderServicePreview],
  );
  const openApiJson = useMemo(
    () => openApiDocument ? JSON.stringify(openApiDocument, null, 2) : "",
    [openApiDocument],
  );
  const goStruct = useMemo(
    () => shouldRenderServicePreview && servicePreviewMode === "gostruct" && selectedService ? serviceGoStruct(selectedService.spec) : "",
    [servicePreviewMode, selectedService, shouldRenderServicePreview],
  );

  const clearProjectSaveTimer = useCallback((projectId: string) => {
    const timer = projectSaveTimersRef.current.get(projectId);
    if (!timer) return;
    window.clearTimeout(timer);
    projectSaveTimersRef.current.delete(projectId);
  }, []);

  const persistProjectSnapshot = useCallback(async (project: Project) => {
    const previousSave = projectSaveChainsRef.current.get(project.id) ?? Promise.resolve();
    const nextSave = previousSave.catch(() => undefined).then(async () => {
      await localStorageProjectStore.saveProject(project);
      const pending = pendingProjectSnapshotsRef.current.get(project.id);
      if (!pending || pending.updatedAt === project.updatedAt) {
        pendingProjectSnapshotsRef.current.delete(project.id);
        removeProjectDraft(project.id);
      }
    });
    projectSaveChainsRef.current.set(project.id, nextSave);
    try {
      await nextSave;
      setSaveError("");
    } catch (reason) {
      console.error("Unable to save project changes", reason);
      setSaveError("Changes are not saved. Check project file permission.");
      throw reason;
    } finally {
      if (projectSaveChainsRef.current.get(project.id) === nextSave) projectSaveChainsRef.current.delete(project.id);
    }
  }, []);

  const persistProjectNow = useCallback(async (projectId: string) => {
    clearProjectSaveTimer(projectId);
    const project = pendingProjectSnapshotsRef.current.get(projectId) ?? latestStoreRef.current.projects.find((item) => item.id === projectId);
    if (!project) return;
    await persistProjectSnapshot(project);
  }, [clearProjectSaveTimer, persistProjectSnapshot]);

  const flushPendingProjectSave = useCallback(async (projectId: string) => {
    if (!projectSaveTimersRef.current.has(projectId) && !pendingProjectSnapshotsRef.current.has(projectId)) return true;
    try {
      await persistProjectNow(projectId);
      return true;
    } catch {
      return false;
    }
  }, [persistProjectNow]);

  const flushPendingProjectSaves = useCallback(async () => {
    const projectIds = new Set([
      ...projectSaveTimersRef.current.keys(),
      ...pendingProjectSnapshotsRef.current.keys(),
    ]);
    if (projectIds.size === 0) return true;
    const results = await Promise.all(Array.from(projectIds, (projectId) => flushPendingProjectSave(projectId)));
    return results.every(Boolean);
  }, [flushPendingProjectSave]);

  const scheduleProjectSave = useCallback((projectId: string) => {
    clearProjectSaveTimer(projectId);
    const timer = window.setTimeout(() => {
      projectSaveTimersRef.current.delete(projectId);
      void persistProjectNow(projectId);
    }, 600);
    projectSaveTimersRef.current.set(projectId, timer);
  }, [clearProjectSaveTimer, persistProjectNow]);

  const applyProjectChange = useCallback((projectId: string, updater: (current: StoreDocument) => StoreDocument) => {
    const next = updater(latestStoreRef.current);
    latestStoreRef.current = next;
    setStore(next);
    const project = next.projects.find((item) => item.id === projectId);
    if (!project) return;
    pendingProjectSnapshotsRef.current.set(projectId, project);
    writeProjectDraft(project);
    scheduleProjectSave(projectId);
  }, [scheduleProjectSave]);

  const refreshStore = useCallback(async () => {
    const snapshot = mergeProjectDrafts(await localStorageProjectStore.getSnapshot());
    latestStoreRef.current = snapshot;
    setStore(snapshot);
    setSelectedProjectId((current) => {
      if (snapshot.projects.some((project) => project.id === current)) return current;
      return snapshot.projects[0]?.id ?? "";
    });
    setSelectedServiceId((current) => {
      if (snapshot.projects.some((project) => project.services.some((service) => service.id === current))) return current;
      const routeProject = snapshot.projects.find((project) => project.id === initialRoute.projectId);
      if (routeProject?.services.some((service) => service.id === initialRoute.serviceId)) return initialRoute.serviceId;
      return "";
    });
    setSelectedDbTableId((current) => {
      if (snapshot.projects.some((project) => project.db_schema.some((table) => table.id === current))) return current;
      const routeProject = snapshot.projects.find((project) => project.id === initialRoute.projectId);
      if (routeProject?.db_schema.some((table) => table.id === initialRoute.dbTableId)) return initialRoute.dbTableId;
      return "";
    });
    setOpenProjects((current) => mergeOpenIds(current, snapshot.projects.map((project) => project.id)));
    setOpenServices((current) => mergeOpenIds(current, snapshot.projects.map((project) => project.id)));
    setOpenServiceFolders((current) => mergeOpenIds(current, snapshot.projects.flatMap((project) => serviceFolderKeys(project))));
    setOpenDbSchemas((current) => mergeOpenIds(current, snapshot.projects.map((project) => project.id)));
  }, []);

  useEffect(() => {
    void refreshStore();
  }, [refreshStore]);

  useEffect(() => {
    return () => {
      for (const timer of projectSaveTimersRef.current.values()) window.clearTimeout(timer);
      projectSaveTimersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const hasPendingSaves = () => projectSaveTimersRef.current.size > 0 || pendingProjectSnapshotsRef.current.size > 0;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasPendingSaves()) return;
      event.preventDefault();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") void flushPendingProjectSaves();
    };
    const onWindowBlur = () => {
      void flushPendingProjectSaves();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("blur", onWindowBlur);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("blur", onWindowBlur);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [flushPendingProjectSaves]);

  useEffect(() => {
    localStorage.setItem(PREVIEW_TYPE_STORAGE_KEY, markdownMode);
  }, [markdownMode]);

  useEffect(() => {
    return () => {
      if (copiedPreviewTimerRef.current) window.clearTimeout(copiedPreviewTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const onPopState = () => {
      const route = parseAppRoute(window.location.pathname);
      setSelectedProjectId(route.projectId);
      setSelectedServiceId(route.serviceId);
      setSelectedDbTableId(route.dbTableId);
      setPage(route.page);
      const searchParams = new URLSearchParams(window.location.search);
      setViewMode(parseViewMode(searchParams));
      setMarkdownMode(parseMarkdownMode(searchParams, localStorage.getItem(PREVIEW_TYPE_STORAGE_KEY)));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const path = buildAppPath({
      page,
      projectId: selectedProject?.id ?? "",
      serviceId: page === "services" ? (selectedService?.id ?? "") : "",
      dbTableId: page === "dbSchema" ? (selectedDbTable?.id ?? "") : "",
    });
    const search = (page === "services" && selectedService) || page === "dbSchema" || page === "errorCodes" ? serviceSearchParams(viewMode) : "";
    const url = `${path}${search}`;
    if (url !== `${window.location.pathname}${window.location.search}`) window.history.pushState(null, "", url);
  }, [page, selectedDbTable?.id, selectedProject?.id, selectedService, selectedService?.id, viewMode]);

  const toggleProject = (projectId: string) => {
    setOpenProjects((current) => toggleSetValue(current, projectId));
  };

  const toggleServices = (projectId: string) => {
    setOpenServices((current) => toggleSetValue(current, projectId));
  };

  const toggleServiceFolder = (folderKey: string) => {
    setOpenServiceFolders((current) => toggleSetValue(current, folderKey));
  };

  const toggleDbSchema = (projectId: string) => {
    setOpenDbSchemas((current) => toggleSetValue(current, projectId));
  };

  const selectProject = (project: Project) => {
    setSelectedProjectId(project.id);
    setSelectedServiceId(project.services[0]?.id ?? "");
    setSelectedDbTableId("");
    setPage("services");
  };

  const selectEventCodes = (project: Project) => {
    setSelectedProjectId(project.id);
    setSelectedDbTableId("");
    setPage("eventCodes");
  };

  const selectErrorCodes = (project: Project) => {
    setSelectedProjectId(project.id);
    setSelectedDbTableId("");
    setPage("errorCodes");
  };

  const selectDbSchema = (project: Project) => {
    setSelectedProjectId(project.id);
    setSelectedDbTableId(project.db_schema[0]?.id ?? "");
    setPage("dbSchema");
  };

  const selectServices = (project: Project) => {
    setSelectedProjectId(project.id);
    setSelectedServiceId(project.services[0]?.id ?? "");
    setSelectedDbTableId("");
    setPage("services");
  };

  const selectService = (project: Project, service: Service) => {
    setSelectedProjectId(project.id);
    setSelectedServiceId(service.id);
    setSelectedDbTableId("");
    setPage("services");
  };

  const selectDbTable = (project: Project, table: DbTable) => {
    setSelectedProjectId(project.id);
    setSelectedDbTableId(table.id);
    setPage("dbSchema");
  };

  const createProject = async () => {
    if (!await flushPendingProjectSaves()) return;
    const name = window.prompt("Project name");
    if (!name?.trim()) return;
    const timestamp = now();
    const serviceFolder: ServiceFolder = { id: uid(), name: "General", createdAt: timestamp, updatedAt: timestamp };
    const service: Service = { id: uid(), folderId: serviceFolder.id, name: "Create Transaction", spec: createDefaultSpec(), updatedAt: timestamp };
    const project: Project = {
      id: uid(),
      name: name.trim(),
      event_code: [],
      error_code: createDefaultErrorCodes(),
      db_schema: [],
      service_folders: [serviceFolder],
      services: [service],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const fileName = await saveProjectFile(project);
    if (!fileName) return;
    await localStorageProjectStore.createProject(project, fileName);
    await refreshStore();
    setSelectedProjectId(project.id);
    setSelectedServiceId(service.id);
    setOpenServiceFolders((current) => new Set(current).add(serviceFolderKey(project.id, serviceFolder.id)));
    setSelectedDbTableId("");
  };

  const addEventCode = async () => {
    if (!selectedProject) return;
    if (!await flushPendingProjectSave(selectedProject.id)) return;
    await localStorageProjectStore.createEventCode(selectedProject.id, { id: uid(), code: "", name: "", description: "" });
    await refreshStore();
  };

  const addErrorCode = async (domain = "general") => {
    if (!selectedProject) return;
    if (!await flushPendingProjectSave(selectedProject.id)) return;
    await localStorageProjectStore.createErrorCode(selectedProject.id, { id: uid(), domain, status: "", code: "", description: "", message_th: "", description_th: "", message_en: "", description_en: "" });
    await refreshStore();
  };

  const addErrorDomain = async () => {
    const domain = window.prompt("Domain name");
    if (!domain?.trim()) return;
    await addErrorCode(domain.trim());
  };

  const createService = async (projectId = selectedProject?.id, folderId?: string | null) => {
    if (!projectId) return;
    const name = window.prompt("Service name");
    if (!name?.trim()) return;
    if (!await flushPendingProjectSave(projectId)) return;
    const timestamp = now();
    const project = latestStoreRef.current.projects.find((item) => item.id === projectId);
    const targetFolderId = folderId === null ? undefined : (folderId ?? project?.service_folders[0]?.id);
    const service: Service = { id: uid(), folderId: targetFolderId, name: name.trim(), spec: createDefaultSpec(name.trim()), updatedAt: timestamp };
    await localStorageProjectStore.createService(projectId, service);
    await refreshStore();
    if (targetFolderId) setOpenServiceFolders((current) => new Set(current).add(serviceFolderKey(projectId, targetFolderId)));
    setSelectedServiceId(service.id);
  };

  const createServiceFromTree = async (project: Project, folderId?: string | null) => {
    setSelectedProjectId(project.id);
    setPage("services");
    await createService(project.id, folderId);
  };

  const createServiceFolder = (projectId = selectedProject?.id) => {
    if (!projectId) return;
    const name = window.prompt("Folder name");
    if (!name?.trim()) return;
    const timestamp = now();
    const folder: ServiceFolder = { id: uid(), name: name.trim(), createdAt: timestamp, updatedAt: timestamp };
    setOpenServices((current) => new Set(current).add(projectId));
    setOpenServiceFolders((current) => new Set(current).add(serviceFolderKey(projectId, folder.id)));
    setSelectedProjectId(projectId);
    setSelectedServiceId("");
    setSelectedDbTableId("");
    setPage("services");
    applyProjectChange(projectId, (current) => replaceServiceFoldersInStore(current, projectId, [
      ...((current.projects.find((project) => project.id === projectId)?.service_folders) ?? []),
      folder,
    ]));
  };

  const createServiceFolderFromTree = (project: Project) => {
    createServiceFolder(project.id);
  };

  const archiveServiceFolder = (project: Project, folder: ServiceFolder) => {
    const serviceCount = project.services.filter((service) => service.folderId === folder.id).length;
    const confirmed = window.confirm(`Delete folder "${folder.name}"? ${serviceCount} service${serviceCount === 1 ? "" : "s"} will move to General.`);
    if (!confirmed) return;
    setOpenServiceFolders((current) => {
      const next = new Set(current);
      next.delete(serviceFolderKey(project.id, folder.id));
      if (serviceCount > 0) next.add(serviceFolderKey(project.id, GENERAL_SERVICE_FOLDER_ID));
      return next;
    });
    applyProjectChange(project.id, (current) => removeServiceFolderInStore(current, project.id, folder.id));
  };

  const moveProject = async (sourceProjectId: string, targetProjectId: string) => {
    if (sourceProjectId === targetProjectId) return;
    if (!await flushPendingProjectSaves()) return;
    const projects = moveById(latestStoreRef.current.projects, sourceProjectId, targetProjectId);
    const nextStore = { ...latestStoreRef.current, projects };
    latestStoreRef.current = nextStore;
    setStore(nextStore);
    await localStorageProjectStore.reorderProjects(projects.map((project) => project.id));
  };

  const moveDbTable = (project: Project, sourceTableId: string, targetTableId: string) => {
    if (sourceTableId === targetTableId) return;
    applyProjectChange(project.id, (current) => replaceDbSchemaInStore(current, project.id, moveById(project.db_schema, sourceTableId, targetTableId)));
  };

  const moveServiceFolder = (project: Project, sourceFolderId: string, targetFolderId: string) => {
    if (sourceFolderId === targetFolderId) return;
    applyProjectChange(project.id, (current) => replaceServiceFoldersInStore(current, project.id, moveById(project.service_folders, sourceFolderId, targetFolderId)));
  };

  const moveService = (project: Project, sourceFolderId: string, targetFolderId: string, sourceServiceId: string, targetServiceId?: string) => {
    if (sourceServiceId === targetServiceId) return;
    applyProjectChange(project.id, (current) => moveServiceInStore(current, project.id, sourceFolderId, targetFolderId, sourceServiceId, targetServiceId));
  };

  const createDbTable = (projectId = selectedProject?.id) => {
    if (!projectId) return;
    const name = window.prompt("Table name");
    if (!name?.trim()) return;
    const table: DbTable = { id: uid(), name: name.trim(), columns: [], indexes: [] };
    setOpenDbSchemas((current) => new Set(current).add(projectId));
    setSelectedProjectId(projectId);
    setSelectedDbTableId(table.id);
    setPage("dbSchema");
    applyProjectChange(projectId, (current) => replaceDbSchemaInStore(current, projectId, [
      ...((current.projects.find((project) => project.id === projectId)?.db_schema) ?? []),
      table,
    ]));
  };

  const createDbTableFromTree = (project: Project) => {
    createDbTable(project.id);
  };

  const renameProject = async (project: Project) => {
    const name = window.prompt("Project name", project.name);
    if (!name?.trim()) return;
    if (!await flushPendingProjectSave(project.id)) return;
    await localStorageProjectStore.renameProject(project.id, name.trim());
    await refreshStore();
  };

  const archiveProject = async (project: Project) => {
    const confirmed = window.confirm(`Delete project "${project.name}"? It will be archived in local storage.`);
    if (!confirmed) return;
    if (!await flushPendingProjectSave(project.id)) return;
    await localStorageProjectStore.archiveProject(project.id);
    const snapshot = await localStorageProjectStore.getSnapshot();
    const nextProject = snapshot.projects[0];
    setStore(snapshot);
    setSelectedProjectId(nextProject?.id ?? "");
    setSelectedServiceId(nextProject?.services[0]?.id ?? "");
    setSelectedDbTableId(nextProject?.db_schema[0]?.id ?? "");
    setPage("services");
  };

  const renameService = async () => {
    if (!selectedProject || !selectedService) return;
    const name = window.prompt("Service name", selectedService.name);
    if (!name?.trim()) return;
    if (!await flushPendingProjectSave(selectedProject.id)) return;
    await localStorageProjectStore.renameService(selectedProject.id, selectedService.id, name.trim());
    await refreshStore();
  };

  const renameSelectedServiceFolder = () => {
    if (!selectedProject || !selectedServiceFolder || !selectedServiceFolder.id) return;
    const name = window.prompt("Folder name", selectedServiceFolder.name);
    if (!name?.trim()) return;
    const timestamp = now();
    applyProjectChange(selectedProject.id, (current) => replaceServiceFoldersInStore(current, selectedProject.id, selectedProject.service_folders.map((folder) => (
      folder.id === selectedServiceFolder.id ? { ...folder, name: name.trim(), updatedAt: timestamp } : folder
    ))));
  };

  const archiveService = async () => {
    if (!selectedProject || !selectedService) return;
    const confirmed = window.confirm(`Delete service "${selectedService.name}"? It will be archived in local storage.`);
    if (!confirmed) return;
    if (!await flushPendingProjectSave(selectedProject.id)) return;
    await localStorageProjectStore.archiveService(selectedProject.id, selectedService.id);
    const snapshot = await localStorageProjectStore.getSnapshot();
    const refreshedProject = snapshot.projects.find((project) => project.id === selectedProject.id) ?? snapshot.projects[0];
    setStore(snapshot);
    setSelectedProjectId(refreshedProject?.id ?? "");
    setSelectedServiceId(refreshedProject?.services[0]?.id ?? "");
    setSelectedDbTableId(refreshedProject?.db_schema[0]?.id ?? "");
    setPage("services");
  };

  const updateServiceSpec = (updater: (spec: ServiceSpec) => ServiceSpec) => {
    if (!selectedProject || !selectedService) return;
    const projectId = selectedProject.id;
    const serviceId = selectedService.id;
    applyProjectChange(projectId, (current) => updateServiceSpecInStore(current, projectId, serviceId, updater));
  };

  const updateEventCodes = (eventCodes: EventCode[]) => {
    if (!selectedProject) return;
    applyProjectChange(selectedProject.id, (current) => replaceEventCodesInStore(current, selectedProject.id, eventCodes));
  };

  const updateErrorCodes = (errorCodes: ErrorCode[]) => {
    if (!selectedProject) return;
    applyProjectChange(selectedProject.id, (current) => replaceErrorCodesInStore(current, selectedProject.id, errorCodes));
  };

  const updateDbSchema = (dbSchema: DbTable[]) => {
    if (!selectedProject) return;
    applyProjectChange(selectedProject.id, (current) => replaceDbSchemaInStore(current, selectedProject.id, dbSchema));
  };

  const exportBaseName = safeFileName(selectedService?.spec.name || selectedService?.name || "api-spec");
  const exportMarkdown = () => {
    if (!markdown.trim()) return;
    downloadFile(`${exportBaseName}.md`, markdown, "text/markdown;charset=utf-8");
  };
  const exportHtml = () => {
    if (!markdown.trim()) return;
    const html = htmlExportRef.current?.innerHTML ?? markdownToHtml(markdown);
    downloadFile(`${exportBaseName}.html`, buildHtmlDocument(selectedService?.spec.name ?? "API Spec", html), "text/html;charset=utf-8");
  };
  const servicePreviewRawContent = () => {
    if (servicePreviewMode === "openapi") return openApiJson;
    if (servicePreviewMode === "gostruct") return goStruct;
    if (servicePreviewMode === "html") {
      if (!markdown.trim()) return "";
      const html = htmlExportRef.current?.innerHTML ?? markdownToHtml(markdown);
      return buildHtmlDocument(selectedService?.spec.name ?? "API Spec", html);
    }
    return markdown;
  };
  const dbSchemaPreviewRawContent = () => {
    if (!selectedProject) return "";
    if (dbSchemaPreviewMode === "sql") return dbSchemaSql;
    if (dbSchemaPreviewMode === "html") {
      if (!dbSchemaPreviewMarkdown.trim()) return "";
      const html = htmlExportRef.current?.innerHTML ?? markdownToHtml(dbSchemaPreviewMarkdown);
      return buildHtmlDocument(`${selectedProject.name} DB Schema`, html);
    }
    return dbSchemaPreviewMarkdown;
  };
  const errorCodesPreviewRawContent = () => {
    if (!selectedProject) return "";
    if (errorCodesPreviewMode === "html") {
      if (!errorCodesPreviewMarkdown.trim()) return "";
      const html = htmlExportRef.current?.innerHTML ?? markdownToHtml(errorCodesPreviewMarkdown);
      return buildHtmlDocument(`${selectedProject.name} Error Codes`, html);
    }
    return errorCodesPreviewMarkdown;
  };
  const showCopiedPreview = (target: string) => {
    setCopiedPreview(target);
    if (copiedPreviewTimerRef.current) window.clearTimeout(copiedPreviewTimerRef.current);
    copiedPreviewTimerRef.current = window.setTimeout(() => setCopiedPreview(""), 1400);
  };
  const copyPreviewRaw = async (target: string, content: string) => {
    if (!content.trim()) return;
    try {
      await copyTextToClipboard(content);
      showCopiedPreview(target);
    } catch (reason) {
      console.error("Unable to copy preview", reason);
      window.alert("Unable to copy preview.");
    }
  };
  const copyServicePreviewRaw = () => copyPreviewRaw("service", servicePreviewRawContent());
  const copyDbSchemaPreviewRaw = () => copyPreviewRaw("dbSchema", dbSchemaPreviewRawContent());
  const copyErrorCodesPreviewRaw = () => copyPreviewRaw("errorCodes", errorCodesPreviewRawContent());

  const exportSelectedPreview = () => {
    if (servicePreviewMode === "openapi") {
      if (!openApiJson.trim()) return;
      downloadFile(`${exportBaseName}.openapi.json`, openApiJson, "application/json;charset=utf-8");
      return;
    }
    if (servicePreviewMode === "gostruct") {
      if (!goStruct.trim()) return;
      downloadFile(`${exportBaseName}.go`, goStruct, "text/plain;charset=utf-8");
      return;
    }
    if (servicePreviewMode === "html") {
      exportHtml();
      return;
    }
    exportMarkdown();
  };
  const exportDbSchemaPreview = () => {
    if (!selectedProject) return;
    const dbSchemaBaseName = `${safeFileName(selectedProject.name)}-db-schema`;
    if (dbSchemaPreviewMode === "sql") {
      if (!dbSchemaSql.trim()) return;
      downloadFile(`${dbSchemaBaseName}.sql`, dbSchemaSql, "text/plain;charset=utf-8");
      return;
    }
    if (!dbSchemaPreviewMarkdown.trim()) return;
    if (dbSchemaPreviewMode === "html") {
      const html = htmlExportRef.current?.innerHTML ?? markdownToHtml(dbSchemaPreviewMarkdown);
      downloadFile(`${dbSchemaBaseName}.html`, buildHtmlDocument(`${selectedProject.name} DB Schema`, html), "text/html;charset=utf-8");
      return;
    }
    downloadFile(`${dbSchemaBaseName}.md`, dbSchemaPreviewMarkdown, "text/markdown;charset=utf-8");
  };
  const exportErrorCodesPreview = () => {
    if (!selectedProject || !errorCodesPreviewMarkdown.trim()) return;
    const errorCodesBaseName = `${safeFileName(selectedProject.name)}-error-codes`;
    if (errorCodesPreviewMode === "html") {
      const html = htmlExportRef.current?.innerHTML ?? markdownToHtml(errorCodesPreviewMarkdown);
      downloadFile(`${errorCodesBaseName}.html`, buildHtmlDocument(`${selectedProject.name} Error Codes`, html), "text/html;charset=utf-8");
      return;
    }
    downloadFile(`${errorCodesBaseName}.md`, errorCodesPreviewMarkdown, "text/markdown;charset=utf-8");
  };
  const exportProjectPreview = () => {
    if (!selectedProject) return;
    const projectBaseName = safeFileName(selectedProject.name);
    if (markdownMode === "openapi") {
      downloadFile(`${projectBaseName}.openapi.json`, JSON.stringify(projectOpenApi(selectedProject), null, 2), "application/json;charset=utf-8");
      return;
    }
    if (markdownMode === "gostruct") {
      const content = selectedProject.services
        .map((service) => `// ${service.spec.name || service.name}\n${serviceGoStruct(service.spec)}`)
        .filter((section) => section.trim())
        .join("\n\n");
      if (!content.trim()) return;
      downloadFile(`${projectBaseName}.go`, content, "text/plain;charset=utf-8");
      return;
    }
    if (markdownMode === "sql") {
      const content = dbSchemaSqlPreview(selectedProject.db_schema);
      if (!content.trim()) return;
      downloadFile(`${projectBaseName}.sql`, content, "text/plain;charset=utf-8");
      return;
    }

    const projectMarkdown = projectSpecMarkdown(selectedProject);
    if (markdownMode === "html") {
      downloadFile(`${projectBaseName}.html`, buildHtmlDocument(selectedProject.name, markdownToHtml(projectMarkdown)), "text/html;charset=utf-8");
      return;
    }

    downloadFile(`${projectBaseName}.md`, projectMarkdown, "text/markdown;charset=utf-8");
  };
  const importProject = async () => {
    if (!await flushPendingProjectSaves()) return;
    try {
      const projectFile = await selectProjectFile();
      if (!projectFile) return;
      const project = validateProject(JSON.parse(await projectFile.file.text()) as Project);
      removeProjectDraft(project.id);
      await registerProjectFileHandle(project.id, projectFile.handle);
      await localStorageProjectStore.createProject(project, projectFile.handle.name ?? projectFile.file.name);
      await refreshStore();
      setSelectedProjectId(project.id);
      setSelectedServiceId(project.services[0]?.id ?? "");
      setSelectedDbTableId(project.db_schema[0]?.id ?? "");
      setPage("services");
    } catch {
      window.alert("Project JSON is invalid.");
    }
  };

  return {
    store,
    selectedProject,
    selectedService,
    selectedServiceFolder,
    selectedDbTable,
    page,
    viewMode,
    markdownMode,
    editorWidth,
    saveError,
    copiedPreview,
    openProjects,
    openServices,
    openServiceFolders,
    openDbSchemas,
    isFullPreview,
    servicePreviewMode,
    markdown,
    dbSchemaPreviewMarkdown,
    dbSchemaPreviewMode,
    errorCodesPreviewMarkdown,
    errorCodesPreviewMode,
    dbSchemaSql,
    openApiDocument,
    goStruct,
    htmlExportRef,
    setViewMode,
    setMarkdownMode,
    setEditorWidth,
    toggleProject,
    toggleServices,
    toggleServiceFolder,
    toggleDbSchema,
    selectProject,
    selectEventCodes,
    selectErrorCodes,
    selectDbSchema,
    selectServices,
    selectService,
    selectDbTable,
    createProject,
    addEventCode,
    addErrorCode,
    addErrorDomain,
    createService,
    createServiceFromTree,
    createServiceFolderFromTree,
    archiveServiceFolder,
    moveProject,
    moveDbTable,
    moveServiceFolder,
    moveService,
    createDbTableFromTree,
    renameProject,
    archiveProject,
    renameService,
    renameSelectedServiceFolder,
    archiveService,
    updateServiceSpec,
    updateEventCodes,
    updateErrorCodes,
    updateDbSchema,
    copyServicePreviewRaw,
    copyDbSchemaPreviewRaw,
    copyErrorCodesPreviewRaw,
    exportSelectedPreview,
    exportDbSchemaPreview,
    exportErrorCodesPreview,
    exportProjectPreview,
    importProject,
  };
}

export type WorkspaceController = ReturnType<typeof useWorkspaceController>;

function toggleSetValue(current: Set<string>, value: string) {
  const next = new Set(current);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}
