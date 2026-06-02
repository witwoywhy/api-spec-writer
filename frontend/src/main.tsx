import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Braces, Columns2, Download, FilePlus2, FolderPlus, PanelLeftClose, PanelRightClose, Trash2, Upload } from "lucide-react";
import { localStorageProjectStore, registerProjectFileHandle, type ProjectFileHandle } from "./adaptors/projectStore";
import { ErrorCodesPage, EventCodesPage } from "./components/CodePages";
import { DbSchemaPage } from "./components/DbSchemaPage";
import { HtmlPreview, MarkdownPreview } from "./components/MarkdownPreview";
import { OpenApiPreview } from "./components/OpenApiPreview";
import { type Page, ProjectTree } from "./components/ProjectTree";
import { ServiceEditor } from "./components/ServiceEditor";
import type { DbTable, ErrorCode, EventCode, Project, Service, ServiceFolder, ServiceSpec, StoreDocument } from "./domain";
import { buildAppPath, parseAppRoute } from "./lib/appRouter";
import { serviceGoStruct } from "./lib/goStructPreview";
import { uid } from "./lib/id";
import { serviceOpenApi } from "./lib/openApiSpec";
import { createDefaultErrorCodes, createDefaultSpec } from "./lib/serviceDefaults";
import { serviceMarkdown } from "./lib/serviceMarkdown";
import "./styles.css";

type MarkdownMode = "markdown" | "html" | "openapi" | "gostruct" | "sql";
type ViewMode = "split" | "edit" | "preview";
type ProjectFilePicker = {
  showOpenFilePicker?: (options?: {
    multiple?: boolean;
    types?: Array<{
      description: string;
      accept: Record<string, string[]>;
    }>;
  }) => Promise<ProjectFileHandle[]>;
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: Array<{
      description: string;
      accept: Record<string, string[]>;
    }>;
  }) => Promise<ProjectFileHandle>;
};

const now = () => new Date().toISOString();
const PREVIEW_TYPE_STORAGE_KEY = "api-spec-writer-platform:preview-type";
const PROJECT_DRAFT_STORAGE_PREFIX = "api-spec-writer-platform:project-draft:v1:";
const GENERAL_SERVICE_FOLDER_ID = "__general_services__";
const initialRoute = parseAppRoute(window.location.pathname);
const initialViewMode = parseViewMode(new URLSearchParams(window.location.search));
const initialMarkdownMode = parseMarkdownMode(new URLSearchParams(window.location.search), localStorage.getItem(PREVIEW_TYPE_STORAGE_KEY));

function App() {
  const [store, setStore] = useState<StoreDocument>({ schemaVersion: 1, projects: [] });
  const [selectedProjectId, setSelectedProjectId] = useState(initialRoute.projectId);
  const [selectedServiceId, setSelectedServiceId] = useState(initialRoute.serviceId);
  const [selectedDbTableId, setSelectedDbTableId] = useState(initialRoute.dbTableId);
  const [page, setPage] = useState<Page>(initialRoute.page);
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const [markdownMode, setMarkdownMode] = useState<MarkdownMode>(initialMarkdownMode);
  const [editorWidth, setEditorWidth] = useState(58);
  const [saveError, setSaveError] = useState("");
  const [openProjects, setOpenProjects] = useState<Set<string>>(() => new Set());
  const [openServices, setOpenServices] = useState<Set<string>>(() => new Set());
  const [openServiceFolders, setOpenServiceFolders] = useState<Set<string>>(() => new Set());
  const [openDbSchemas, setOpenDbSchemas] = useState<Set<string>>(() => new Set());
  const serviceLayoutRef = useRef<HTMLDivElement>(null);
  const htmlExportRef = useRef<HTMLDivElement>(null);
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
  const isFullPreview = (page === "services" || page === "dbSchema") && viewMode === "preview";
  const shouldBuildMarkdown = shouldRenderServicePreview && (markdownMode === "markdown" || markdownMode === "html");
  const markdown = useMemo(
    () => shouldBuildMarkdown && selectedService ? serviceMarkdown(selectedService.spec, selectedProject?.error_code ?? []) : "",
    [selectedProject?.error_code, selectedService, shouldBuildMarkdown],
  );
  const dbSchemaPreviewMarkdown = useMemo(
    () => shouldRenderDbSchemaPreview && selectedProject ? dbSchemaMarkdown(selectedProject) : "",
    [selectedProject, shouldRenderDbSchemaPreview],
  );
  const dbSchemaPreviewMode = markdownMode === "html" || markdownMode === "sql" ? markdownMode : "markdown";
  const dbSchemaSql = useMemo(
    () => shouldRenderDbSchemaPreview && selectedProject ? dbSchemaSqlPreview(selectedProject.db_schema) : "",
    [selectedProject, shouldRenderDbSchemaPreview],
  );
  const openApiDocument = useMemo(
    () => shouldRenderServicePreview && markdownMode === "openapi" && selectedService ? serviceOpenApi(selectedService.spec, selectedProject?.error_code ?? []) : null,
    [markdownMode, selectedProject?.error_code, selectedService, shouldRenderServicePreview],
  );
  const openApiJson = useMemo(
    () => openApiDocument ? JSON.stringify(openApiDocument, null, 2) : "",
    [openApiDocument],
  );
  const goStruct = useMemo(
    () => shouldRenderServicePreview && markdownMode === "gostruct" && selectedService ? serviceGoStruct(selectedService.spec) : "",
    [markdownMode, selectedService, shouldRenderServicePreview],
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
    const search = (page === "services" && selectedService) || page === "dbSchema" ? serviceSearchParams(viewMode) : "";
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
    await localStorageProjectStore.createErrorCode(selectedProject.id, { id: uid(), domain, status: "", code: "", message_th: "", description_th: "", message_en: "", description_en: "" });
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
  const resizeSplitPanels = (clientX: number) => {
    const rect = serviceLayoutRef.current?.getBoundingClientRect();
    if (!rect) return;
    const nextWidth = ((clientX - rect.left) / rect.width) * 100;
    setEditorWidth(Math.min(72, Math.max(32, nextWidth)));
  };
  const splitLayoutStyle = viewMode === "split" ? ({ "--editor-width": `${editorWidth}%` } as CSSProperties) : undefined;

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
  const exportSelectedPreview = () => {
    if (markdownMode === "openapi") {
      if (!openApiJson.trim()) return;
      downloadFile(`${exportBaseName}.openapi.json`, openApiJson, "application/json;charset=utf-8");
      return;
    }
    if (markdownMode === "gostruct") {
      if (!goStruct.trim()) return;
      downloadFile(`${exportBaseName}.go`, goStruct, "text/plain;charset=utf-8");
      return;
    }
    if (markdownMode === "html") {
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
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Braces size={24} />
          <div>
            <h1>API Spec Writer</h1>
            <p>Local project tree for service specs.</p>
          </div>
        </div>

        <button className="primary wide" type="button" onClick={createProject}>
          <FolderPlus size={16} /> New Project
        </button>

        <ProjectTree
          projects={store.projects}
          selectedProjectId={selectedProject?.id ?? ""}
          selectedServiceId={selectedService?.id ?? ""}
          selectedDbTableId={selectedDbTable?.id ?? ""}
          page={page}
          openProjects={openProjects}
          openServices={openServices}
          openServiceFolders={openServiceFolders}
          openDbSchemas={openDbSchemas}
          onToggleProject={toggleProject}
          onToggleServices={toggleServices}
          onToggleServiceFolder={toggleServiceFolder}
          onToggleDbSchema={toggleDbSchema}
          onSelectProject={(project) => {
            setSelectedProjectId(project.id);
            setSelectedServiceId(project.services[0]?.id ?? "");
            setSelectedDbTableId("");
            setPage("services");
          }}
          onSelectEventCodes={(project) => {
            setSelectedProjectId(project.id);
            setSelectedDbTableId("");
            setPage("eventCodes");
          }}
          onSelectErrorCodes={(project) => {
            setSelectedProjectId(project.id);
            setSelectedDbTableId("");
            setPage("errorCodes");
          }}
          onSelectDbSchema={(project) => {
            setSelectedProjectId(project.id);
            setSelectedDbTableId(project.db_schema[0]?.id ?? "");
            setPage("dbSchema");
          }}
          onCreateDbTable={(project) => createDbTable(project.id)}
          onCreateServiceFolder={(project) => createServiceFolder(project.id)}
          onSelectServices={(project) => {
            setSelectedProjectId(project.id);
            setSelectedServiceId(project.services[0]?.id ?? "");
            setSelectedDbTableId("");
            setPage("services");
          }}
          onRenameProject={renameProject}
          onArchiveProject={archiveProject}
          onArchiveServiceFolder={archiveServiceFolder}
          onCreateService={(project, folderId) => {
            setSelectedProjectId(project.id);
            setPage("services");
            createService(project.id, folderId);
          }}
          onSelectService={(project, service) => {
            setSelectedProjectId(project.id);
            setSelectedServiceId(service.id);
            setSelectedDbTableId("");
            setPage("services");
          }}
          onSelectDbTable={(project, table) => {
            setSelectedProjectId(project.id);
            setSelectedDbTableId(table.id);
            setPage("dbSchema");
          }}
          onMoveProject={(sourceProjectId, targetProjectId) => {
            void moveProject(sourceProjectId, targetProjectId);
          }}
          onMoveDbTable={moveDbTable}
          onMoveServiceFolder={moveServiceFolder}
          onMoveService={moveService}
          showProjectActions={viewMode !== "preview"}
        />
        <div className="sidebar-actions">
          <button className="wide" type="button" onClick={exportProjectPreview} disabled={!selectedProject}>
            <Download size={16} /> Export Preview
          </button>
          <button className="wide" type="button" onClick={() => void importProject()}>
            <Upload size={16} /> Import Project
          </button>
        </div>
      </aside>

      <main className={isFullPreview ? "workspace workspace-preview" : "workspace"}>
        {!selectedProject ? (
          <div className="empty-state">
            <FolderPlus size={40} />
            <h2>No project yet</h2>
            <button className="primary" type="button" onClick={createProject}>Create Project</button>
          </div>
        ) : (
          <>
            <header className="workspace-header">
              <div className="workspace-path">
                <WorkspacePath
                  dbTable={selectedDbTable}
                  page={page}
                  project={selectedProject}
                  service={selectedService}
                  serviceFolder={selectedServiceFolder}
                  onRenameService={renameService}
                  onRenameServiceFolder={renameSelectedServiceFolder}
                />
                {page === "services" && selectedService && viewMode !== "preview" ? (
                  <div className="workspace-actions">
                    <button className="danger-button" type="button" title="Delete service" aria-label="Delete service" onClick={archiveService}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                ) : null}
              </div>
              {page === "services" || page === "dbSchema" ? (
                <div className="view-mode-control" aria-label="View mode">
                  <button className={viewMode === "split" ? "active" : ""} type="button" title="Editor and preview" aria-label="Editor and preview" onClick={() => setViewMode("split")}>
                    <Columns2 size={15} />
                  </button>
                  <button className={viewMode === "edit" ? "active" : ""} type="button" title="Editor only" aria-label="Editor only" onClick={() => setViewMode("edit")}>
                    <PanelRightClose size={15} />
                  </button>
                  <button className={viewMode === "preview" ? "active" : ""} type="button" title="Preview only" aria-label="Preview only" onClick={() => setViewMode("preview")}>
                    <PanelLeftClose size={15} />
                  </button>
                </div>
              ) : null}
            </header>

            {saveError ? <p className="save-error" role="status">{saveError}</p> : null}

            {page === "services" && (
              <div ref={serviceLayoutRef} className={serviceLayoutClass(viewMode)} style={splitLayoutStyle}>
                {viewMode !== "preview" && (
                  <section className="panel editor-panel">
                    {selectedService ? (
                      <ServiceEditor
                        spec={selectedService.spec}
                        projectErrorCodes={selectedProject.error_code}
                        onChange={updateServiceSpec}
                      />
                    ) : (
                      <div className="empty-state compact">
                        <FilePlus2 size={32} />
                        <h2>No service yet</h2>
                        <button className="primary" type="button" onClick={() => createService()}>Create Service</button>
                      </div>
                    )}
                  </section>
                )}

                {viewMode === "split" ? (
                  <div
                    className="split-divider"
                    role="separator"
                    aria-label="Resize editor and preview"
                    aria-orientation="vertical"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowLeft") setEditorWidth((current) => Math.max(32, current - 4));
                      if (event.key === "ArrowRight") setEditorWidth((current) => Math.min(72, current + 4));
                    }}
                    onPointerDown={(event) => {
                      event.currentTarget.setPointerCapture(event.pointerId);
                      resizeSplitPanels(event.clientX);
                    }}
                    onPointerMove={(event) => {
                      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                      resizeSplitPanels(event.clientX);
                    }}
                  />
                ) : null}

                {viewMode !== "edit" && (
                  <section className="panel preview-panel">
                    <div className="panel-title">
                      <div className="preview-title">
                        <h3>Preview</h3>
                        <select className="preview-select" value={markdownMode === "sql" ? "markdown" : markdownMode} onChange={(event) => setMarkdownMode(event.target.value as MarkdownMode)} aria-label="Preview type">
                          <option value="markdown">Markdown</option>
                          <option value="html">HTML</option>
                          <option value="openapi">OpenAPI</option>
                          <option value="gostruct">Go Struct</option>
                        </select>
                      </div>
                      <div className="preview-actions">
                        <button type="button" onClick={exportSelectedPreview}><Download size={16} /> Export</button>
                      </div>
                    </div>
                    {markdownMode === "markdown" ? (
                      <MarkdownPreview markdown={markdown} />
                    ) : markdownMode === "html" ? (
                      <div ref={htmlExportRef} className="preview-export-frame">
                        <HtmlPreview markdown={markdown} />
                      </div>
                    ) : markdownMode === "openapi" ? (
                      <OpenApiPreview document={openApiDocument} />
                    ) : markdownMode === "gostruct" ? (
                      <GoStructPreview content={goStruct} />
                    ) : (
                      <MarkdownPreview markdown={markdown} />
                    )}
                  </section>
                )}
              </div>
            )}

            {page === "dbSchema" && (
              <div ref={serviceLayoutRef} className={serviceLayoutClass(viewMode)} style={splitLayoutStyle}>
                {viewMode !== "preview" && (
                  <section className="panel editor-panel">
                    <DbSchemaPage
                      tables={selectedProject.db_schema}
                      selectedTableId={selectedDbTable?.id ?? ""}
                      onChange={(dbSchema) => {
                        applyProjectChange(selectedProject.id, (current) => replaceDbSchemaInStore(current, selectedProject.id, dbSchema));
                      }}
                    />
                  </section>
                )}

                {viewMode === "split" ? (
                  <div
                    className="split-divider"
                    role="separator"
                    aria-label="Resize editor and preview"
                    aria-orientation="vertical"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowLeft") setEditorWidth((current) => Math.max(32, current - 4));
                      if (event.key === "ArrowRight") setEditorWidth((current) => Math.min(72, current + 4));
                    }}
                    onPointerDown={(event) => {
                      event.currentTarget.setPointerCapture(event.pointerId);
                      resizeSplitPanels(event.clientX);
                    }}
                    onPointerMove={(event) => {
                      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                      resizeSplitPanels(event.clientX);
                    }}
                  />
                ) : null}

                {viewMode !== "edit" && (
                  <section className="panel preview-panel">
                    <div className="panel-title">
                      <div className="preview-title">
                        <h3>Preview</h3>
                        <select className="preview-select" value={dbSchemaPreviewMode} onChange={(event) => setMarkdownMode(event.target.value as MarkdownMode)} aria-label="Preview type">
                          <option value="markdown">Markdown</option>
                          <option value="html">HTML</option>
                          <option value="sql">SQL</option>
                        </select>
                      </div>
                      <div className="preview-actions">
                        <button type="button" onClick={exportDbSchemaPreview}><Download size={16} /> Export</button>
                      </div>
                    </div>
                    {dbSchemaPreviewMode === "sql" ? (
                      <CodePreview content={dbSchemaSql} emptyText="Create DB schema tables to preview SQL." />
                    ) : dbSchemaPreviewMode === "html" ? (
                      <div ref={htmlExportRef} className="preview-export-frame">
                        <HtmlPreview markdown={dbSchemaPreviewMarkdown} />
                      </div>
                    ) : (
                      <MarkdownPreview markdown={dbSchemaPreviewMarkdown} />
                    )}
                  </section>
                )}
              </div>
            )}

            {page === "eventCodes" && (
              <EventCodesPage
                rows={selectedProject.event_code}
                onAdd={addEventCode}
                onChange={(eventCodes) => {
                  applyProjectChange(selectedProject.id, (current) => replaceEventCodesInStore(current, selectedProject.id, eventCodes));
                }}
              />
            )}

            {page === "errorCodes" && (
              <ErrorCodesPage
                rows={selectedProject.error_code}
                onAddDomain={addErrorDomain}
                onAddErrorCode={addErrorCode}
                onChange={(errorCodes) => {
                  applyProjectChange(selectedProject.id, (current) => replaceErrorCodesInStore(current, selectedProject.id, errorCodes));
                }}
              />
            )}

          </>
        )}
      </main>
    </div>
  );
}

function mergeOpenIds(current: Set<string>, ids: string[]) {
  const next = new Set(current);
  for (const id of ids) next.add(id);
  return next;
}

function serviceFolderForService(project: Project, service: Service): ServiceFolder | undefined {
  if (!service.folderId) return { id: "", name: "General", createdAt: "", updatedAt: "" };
  return project.service_folders.find((folder) => folder.id === service.folderId);
}

function serviceFolderKeys(project: Project) {
  const keys = project.service_folders.map((folder) => serviceFolderKey(project.id, folder.id));
  if (project.services.some((service) => !service.folderId)) keys.push(serviceFolderKey(project.id, GENERAL_SERVICE_FOLDER_ID));
  return keys;
}

function serviceFolderKey(projectId: string, folderId: string) {
  return `${projectId}:${folderId}`;
}

type ProjectDraft = {
  schemaVersion: 1;
  savedAt: string;
  project: Project;
};

function projectDraftKey(projectId: string) {
  return `${PROJECT_DRAFT_STORAGE_PREFIX}${projectId}`;
}

function writeProjectDraft(project: Project) {
  const draft: ProjectDraft = {
    schemaVersion: 1,
    savedAt: now(),
    project,
  };
  localStorage.setItem(projectDraftKey(project.id), JSON.stringify(draft));
}

function removeProjectDraft(projectId: string) {
  localStorage.removeItem(projectDraftKey(projectId));
}

function readProjectDraft(projectId: string) {
  const raw = localStorage.getItem(projectDraftKey(projectId));
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw) as ProjectDraft;
    if (draft.schemaVersion !== 1 || draft.project?.id !== projectId) return null;
    return normalizeProjectDraft(draft.project);
  } catch {
    return null;
  }
}

function normalizeProjectDraft(project: Project): Project {
  return {
    ...project,
    db_schema: Array.isArray(project.db_schema) ? project.db_schema : [],
    service_folders: Array.isArray(project.service_folders) ? project.service_folders : [],
  };
}

function mergeProjectDrafts(store: StoreDocument): StoreDocument {
  return {
    ...store,
    projects: store.projects.map((project) => readProjectDraft(project.id) ?? project),
  };
}

function updateServiceSpecInStore(
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

function replaceEventCodesInStore(store: StoreDocument, projectId: string, eventCodes: EventCode[]): StoreDocument {
  const timestamp = now();
  return {
    ...store,
    projects: store.projects.map((project) => (
      project.id === projectId ? { ...project, event_code: eventCodes, updatedAt: timestamp } : project
    )),
  };
}

function replaceErrorCodesInStore(store: StoreDocument, projectId: string, errorCodes: ErrorCode[]): StoreDocument {
  const timestamp = now();
  return {
    ...store,
    projects: store.projects.map((project) => (
      project.id === projectId ? { ...project, error_code: errorCodes, updatedAt: timestamp } : project
    )),
  };
}

function replaceDbSchemaInStore(store: StoreDocument, projectId: string, dbSchema: DbTable[]): StoreDocument {
  const timestamp = now();
  return {
    ...store,
    projects: store.projects.map((project) => (
      project.id === projectId ? { ...project, db_schema: dbSchema, updatedAt: timestamp } : project
    )),
  };
}

function replaceServiceFoldersInStore(store: StoreDocument, projectId: string, serviceFolders: ServiceFolder[]): StoreDocument {
  const timestamp = now();
  return {
    ...store,
    projects: store.projects.map((project) => (
      project.id === projectId ? { ...project, service_folders: serviceFolders, updatedAt: timestamp } : project
    )),
  };
}

function removeServiceFolderInStore(store: StoreDocument, projectId: string, folderId: string): StoreDocument {
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

function moveServiceInStore(store: StoreDocument, projectId: string, sourceFolderId: string, targetFolderId: string, sourceServiceId: string, targetServiceId?: string): StoreDocument {
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

function moveById<T extends { id: string }>(items: T[], sourceId: string, targetId: string): T[] {
  const sourceIndex = items.findIndex((item) => item.id === sourceId);
  const targetIndex = items.findIndex((item) => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return items;
  const nextItems = [...items];
  const [sourceItem] = nextItems.splice(sourceIndex, 1);
  nextItems.splice(targetIndex, 0, sourceItem);
  return nextItems;
}

function serviceFolderId(service: Service) {
  return service.folderId ?? GENERAL_SERVICE_FOLDER_ID;
}

function WorkspacePath({
  page,
  project,
  service,
  serviceFolder,
  dbTable,
  onRenameService,
  onRenameServiceFolder,
}: {
  page: Page;
  project: Project;
  service: Service | undefined;
  serviceFolder: ServiceFolder | undefined;
  dbTable: DbTable | undefined;
  onRenameService: () => void;
  onRenameServiceFolder: () => void;
}) {
  if (page !== "services" || !service) {
    return <p className="eyebrow">{workspacePathLabel(page, project, service, serviceFolder, dbTable)}</p>;
  }
  const folderName = serviceFolder?.name ?? "General";
  return (
    <div className="workspace-breadcrumb eyebrow" aria-label="Workspace path">
      <span>PROJECTS</span>
      <span>/</span>
      <span>{project.name}</span>
      <span>/</span>
      <span>SERVICE</span>
      <span>/</span>
      <button type="button" onClick={onRenameServiceFolder} disabled={!serviceFolder?.id}>{folderName}</button>
      <span>/</span>
      <button type="button" onClick={onRenameService}>{service.name}</button>
    </div>
  );
}

function workspacePathLabel(page: Page, project: Project, service: Service | undefined, serviceFolder: ServiceFolder | undefined, dbTable: DbTable | undefined) {
  if (page === "eventCodes") return `PROJECTS / ${project.name} / EVENT`;
  if (page === "errorCodes") return `PROJECTS / ${project.name} / ERROR`;
  if (page === "dbSchema") return dbTable ? `PROJECTS / ${project.name} / DB SCHEMA / ${dbTable.name || "Untitled Table"}` : `PROJECTS / ${project.name} / DB SCHEMA`;
  if (service && serviceFolder) return `PROJECTS / ${project.name} / SERVICE / ${serviceFolder.name} / ${service.name}`;
  if (service) return `PROJECTS / ${project.name} / SERVICE / General / ${service.name}`;
  return `PROJECTS / ${project.name} / SERVICE`;
}

function parseViewMode(searchParams: URLSearchParams): ViewMode {
  const value = searchParams.get("view-mode");
  if (value === "edit" || value === "preview") return value;
  if (searchParams.get("preview") === "true") return "preview";
  return "split";
}

function parseMarkdownMode(searchParams: URLSearchParams, storedValue: string | null): MarkdownMode {
  const value = searchParams.get("preview-type") ?? storedValue;
  if (value === "html" || value === "openapi" || value === "gostruct" || value === "sql") return value;
  return "markdown";
}

function GoStructPreview({ content }: { content: string }) {
  return <CodePreview content={content} emptyText="Request and response BODY fields are required for Go struct preview." />;
}

function CodePreview({ content, emptyText }: { content: string; emptyText: string }) {
  if (!content.trim()) return <div className="markdown-preview empty-preview">{emptyText}</div>;
  return (
    <div className="markdown-preview code-preview">
      <pre><code>{content}</code></pre>
    </div>
  );
}

function serviceSearchParams(viewMode: ViewMode) {
  const searchParams = new URLSearchParams();
  if (viewMode !== "split") searchParams.set("view-mode", viewMode);
  const value = searchParams.toString();
  return value ? `?${value}` : "";
}

function serviceLayoutClass(viewMode: ViewMode) {
  if (viewMode === "edit") return "service-editor-layout edit-only";
  if (viewMode === "preview") return "service-editor-layout preview-only";
  return "service-editor-layout";
}

function toggleSetValue(current: Set<string>, value: string) {
  const next = new Set(current);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function safeFileName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "api-spec";
}

function downloadFile(fileName: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function saveProjectFile(project: Project) {
  const picker = window as Window & ProjectFilePicker;
  if (!picker.showSaveFilePicker) {
    window.alert("Your browser does not support choosing a project file location.");
    return "";
  }

  try {
    const fileHandle = await picker.showSaveFilePicker({
      suggestedName: `${safeFileName(project.name)}.json`,
      types: [
        {
          description: "API Spec Writer project",
          accept: { "application/json": [".json"] },
        },
      ],
    });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(project, null, 2));
    await writable.close();
    await registerProjectFileHandle(project.id, fileHandle);
    return fileHandle.name ?? `${safeFileName(project.name)}.json`;
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === "AbortError") return "";
    window.alert("Cannot save project file. The project was not created.");
    return "";
  }
}

async function selectProjectFile() {
  const picker = window as Window & ProjectFilePicker;
  if (!picker.showOpenFilePicker) {
    window.alert("Your browser does not support opening a project file.");
    return null;
  }

  const [handle] = await picker.showOpenFilePicker({
    multiple: false,
    types: [
      {
        description: "API Spec Writer project",
        accept: { "application/json": [".json"] },
      },
    ],
  });
  if (!handle) return null;
  return {
    handle,
    file: await handle.getFile(),
  };
}

function buildHtmlDocument(title: string, body: string) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin: 0; background: #f6f8fb; color: #17212b; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.55; }
    main { max-width: 980px; margin: 32px auto; background: #fff; border: 1px solid #dbe3ea; border-radius: 8px; padding: 28px; }
    h1 { font-size: 28px; margin: 0 0 18px; }
    h2 { border-bottom: 1px solid #dbe3ea; font-size: 21px; margin: 28px 0 12px; padding-bottom: 8px; }
    h3 { font-size: 16px; margin: 20px 0 10px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 10px 0 16px; }
    th, td { border: 1px solid #dbe3ea; padding: 7px 8px; text-align: left; vertical-align: top; }
    th { background: #f3f6f9; }
    code { background: #eef2f4; border-radius: 4px; padding: 1px 4px; }
    pre { background: #f8fafc; border: 1px solid #dbe3ea; border-radius: 6px; color: #17212b; overflow: auto; padding: 12px; }
    pre code { background: transparent; padding: 0; color: inherit; }
    .mermaid-diagram { background: #fff; border: 1px solid #dbe3ea; border-radius: 8px; margin: 12px 0; overflow-x: auto; padding: 12px; }
    .mermaid-error { background: #fff7f7; border-color: #f3c4c0; color: #17212b; }
    svg { max-width: 100%; }
  </style>
</head>
<body>
  <main>${body}</main>
</body>
</html>`;
}

function projectSpecMarkdown(project: Project) {
  return [
    `# ${project.name}`,
    eventCodesMarkdown(project),
    errorCodesMarkdown(project),
    dbSchemaMarkdown(project),
    "## Services",
    ...project.services.map((service) => serviceMarkdown(service.spec, project.error_code)),
  ].filter((section) => section.trim()).join("\n\n");
}

function eventCodesMarkdown(project: Project) {
  if (project.event_code.length === 0) return "## Event Codes\n\nNo event codes.";
  return [
    "## Event Codes",
    "| Code | Name | Description |",
    "|------|------|-------------|",
    ...project.event_code.map((row) => `| ${escapePipe(row.code)} | ${escapePipe(row.name)} | ${escapePipe(row.description)} |`),
  ].join("\n");
}

function errorCodesMarkdown(project: Project) {
  if (project.error_code.length === 0) return "## Error Codes\n\nNo error codes.";
  return [
    "## Error Codes",
    "| Domain | HTTP | Code | Message EN | Description EN | Message TH | Description TH |",
    "|--------|------|------|------------|----------------|------------|----------------|",
    ...project.error_code.map((row) => [
      escapePipe(row.domain),
      escapePipe(row.status),
      escapePipe(row.code),
      escapePipe(row.message_en),
      escapePipe(row.description_en),
      escapePipe(row.message_th),
      escapePipe(row.description_th),
    ].join(" | ")).map((cells) => `| ${cells} |`),
  ].join("\n");
}

function dbSchemaMarkdown(project: Project) {
  if (project.db_schema.length === 0) return "## DB Schema\n\nNo DB schema tables.";
  return [
    "## DB Schema",
    ...project.db_schema.map((table) => {
      const parts = [
        `\n### ${escapePipe(table.name || "Untitled Table")}`,
      ];
      if (table.columns.length === 0) {
        parts.push("No columns.");
      } else {
        parts.push(
          "| Field | Type | Nullable | Constraint | Description |",
          "|-------|------|----------|------------|-------------|",
          ...table.columns.map((column) => [
            escapePipe(column.field),
            escapePipe(column.type),
            escapePipe(column.nullable),
            escapePipe(column.constraint === "NONE" ? "" : column.constraint),
            escapePipe(column.description),
          ].join(" | ")).map((cells) => `| ${cells} |`),
        );
      }
      if ((table.indexes ?? []).length > 0) {
        parts.push(
          "\n#### Indexes",
          "| Name | Columns | Type | Unique |",
          "|------|---------|------|--------|",
          ...(table.indexes ?? []).map((index) => [
            escapePipe(index.name),
            escapePipe(index.columnIds.map((columnId) => table.columns.find((column) => column.id === columnId)?.field ?? "").filter(Boolean).join(", ")),
            escapePipe(index.type),
            escapePipe(index.unique),
          ].join(" | ")).map((cells) => `| ${cells} |`),
        );
      }
      return parts.join("\n");
    }),
  ].join("\n");
}

function dbSchemaSqlPreview(tables: DbTable[]) {
  if (tables.length === 0) return "";
  const statements: string[] = [];
  for (const table of tables) {
    const tableName = quoteSqlIdentifier(table.name || "untitled_table");
    if (table.columns.length === 0) {
      statements.push(`CREATE TABLE ${tableName} (\n);\n`);
      continue;
    }

    const columnDefinitions = dbColumnSqlRows(table.columns);
    statements.push(`CREATE TABLE ${tableName} (\n${columnDefinitions.join(",\n")}\n);`);

    for (const column of table.columns) {
      if (column.constraint === "INDEX" && column.field.trim()) {
        statements.push(`CREATE INDEX ${quoteSqlIdentifier(`idx_${table.name || "untitled_table"}_${column.field}`)} ON ${tableName} USING btree (${quoteSqlIdentifier(column.field)});`);
      }
      if (column.constraint === "FOREIGN KEY" && column.field.trim()) {
        statements.push(`-- TODO: Add foreign key for ${tableName}.${quoteSqlIdentifier(column.field)} REFERENCES table(column).`);
      }
      if (column.constraint === "CHECK" && column.field.trim()) {
        statements.push(`-- TODO: Add CHECK constraint for ${tableName}.${quoteSqlIdentifier(column.field)}.`);
      }
      if (column.constraint === "DEFAULT" && column.field.trim()) {
        statements.push(`-- TODO: Add DEFAULT value for ${tableName}.${quoteSqlIdentifier(column.field)}.`);
      }
      if (column.description.trim() && column.field.trim()) {
        statements.push(`COMMENT ON COLUMN ${tableName}.${quoteSqlIdentifier(column.field)} IS ${sqlString(column.description)};`);
      }
    }

    for (const index of table.indexes ?? []) {
      const indexSql = createIndexSql(table, tableName, index);
      if (indexSql) statements.push(indexSql);
    }
  }
  return statements.join("\n\n");
}

function createIndexSql(table: DbTable, tableName: string, index: Pick<DbTable["indexes"][number], "name" | "columnIds" | "type" | "unique">) {
  const columns = index.columnIds
    .map((columnId) => table.columns.find((item) => item.id === columnId))
    .filter((column) => column?.field.trim());
  if (columns.length === 0) return "";
  const indexName = index.name || `idx_${table.name || "untitled_table"}_${columns.map((column) => column?.field).join("_")}`;
  const columnSql = columns.map((column) => quoteSqlIdentifier(column?.field ?? "")).join(", ");
  return `CREATE ${index.unique === "YES" ? "UNIQUE " : ""}INDEX ${quoteSqlIdentifier(indexName)} ON ${tableName} USING ${index.type.toLowerCase()} (${columnSql});`;
}

function dbColumnSqlRows(columns: DbTable["columns"]) {
  const names = columns.map((column) => quoteSqlIdentifier(column.field || "unnamed_column"));
  const types = columns.map((column) => column.type.trim() || "TEXT");
  const nameWidth = Math.max(...names.map((name) => name.length));
  const typeWidth = Math.max(...types.map((type) => type.length));
  return columns.map((column, index) => `  ${dbColumnSql(column, names[index], types[index], nameWidth, typeWidth)}`);
}

function dbColumnSql(column: DbTable["columns"][number], name: string, type: string, nameWidth: number, typeWidth: number) {
  const parts = [
    name.padEnd(nameWidth),
    type.padEnd(typeWidth),
  ];
  if (column.nullable === "NO" && column.constraint !== "PRIMARY KEY") parts.push("NOT NULL");
  if (column.constraint === "PRIMARY KEY" || column.constraint === "UNIQUE") parts.push(column.constraint);
  return parts.join(" ");
}

function quoteSqlIdentifier(value: string) {
  return `"${value.trim().replaceAll("\"", "\"\"") || "unnamed"}"`;
}

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function projectOpenApi(project: Project) {
  return {
    openapi: "3.0.3",
    info: {
      title: project.name,
      version: "1.0.0",
    },
    paths: mergeProjectOpenApiPaths(project),
    "x-event-codes": project.event_code,
    "x-error-codes": project.error_code,
    "x-db-schema": project.db_schema,
    "x-services": project.services.map((service) => ({
      id: service.id,
      name: service.name,
      type: service.spec.type,
      updatedAt: service.updatedAt,
    })),
  };
}

function mergeProjectOpenApiPaths(project: Project) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const service of project.services) {
    const document = serviceOpenApi(service.spec, project.error_code);
    for (const [path, methods] of Object.entries(document.paths ?? {})) {
      for (const [method, operation] of Object.entries(methods as Record<string, unknown>)) {
        const targetPath = paths[path]?.[method] ? uniqueOpenApiPath(paths, path, service.name) : path;
        paths[targetPath] ??= {};
        paths[targetPath][method] = {
          ...(operation as Record<string, unknown>),
          "x-service-id": service.id,
          "x-service-name": service.name,
          ...(targetPath === path ? {} : { "x-original-path": path }),
        };
      }
    }
  }
  return paths;
}

function uniqueOpenApiPath(paths: Record<string, unknown>, path: string, serviceName: string) {
  const base = `${path.replace(/\/$/, "")}/_${safeFileName(serviceName)}`;
  let candidate = base;
  let index = 2;
  while (paths[candidate]) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  return candidate;
}

function markdownToHtml(markdown: string) {
  const lines = markdown.split("\n");
  const html: string[] = [];
  let paragraph: string[] = [];
  let table: string[] = [];
  let codeFence = "";
  let codeLines: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    html.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const flushTable = () => {
    if (table.length === 0) return;
    const [head, separator, ...body] = table;
    if (!separator?.includes("---")) {
      html.push(...table.map((line) => `<p>${inlineMarkdown(line)}</p>`));
      table = [];
      return;
    }
    html.push("<table><thead><tr>");
    for (const cell of markdownTableCells(head)) html.push(`<th>${inlineMarkdown(cell)}</th>`);
    html.push("</tr></thead><tbody>");
    for (const row of body) {
      html.push("<tr>");
      for (const cell of markdownTableCells(row)) html.push(`<td>${inlineMarkdown(cell)}</td>`);
      html.push("</tr>");
    }
    html.push("</tbody></table>");
    table = [];
  };
  const flushCode = () => {
    if (!codeFence) return;
    const code = escapeHtml(codeLines.join("\n"));
    html.push(`<pre${codeFence === "mermaid" ? " class=\"mermaid-diagram\"" : ""}><code>${code}</code></pre>`);
    codeFence = "";
    codeLines = [];
  };

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (codeFence) {
        flushCode();
      } else {
        flushParagraph();
        flushTable();
        codeFence = line.replace(/^```/, "").trim() || "text";
        codeLines = [];
      }
      continue;
    }
    if (codeFence) {
      codeLines.push(line);
      continue;
    }
    if (line.startsWith("|")) {
      flushParagraph();
      table.push(line);
      continue;
    }
    flushTable();
    if (!line.trim()) {
      flushParagraph();
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      const level = heading[1].length;
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }
    paragraph.push(line);
  }

  flushParagraph();
  flushTable();
  flushCode();
  return html.join("\n");
}

function markdownTableCells(row: string) {
  return row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function inlineMarkdown(value: string) {
  return escapeHtml(value).replace(/`([^`]+)`/g, "<code>$1</code>");
}

function escapePipe(value: string | number | undefined) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function validateProject(project: Project): Project {
  if (!project?.name || !Array.isArray(project.services) || !Array.isArray(project.event_code) || !Array.isArray(project.error_code)) {
    throw new Error("Invalid project");
  }
  return {
    ...project,
    db_schema: Array.isArray(project.db_schema) ? project.db_schema : [],
    service_folders: Array.isArray(project.service_folders) ? project.service_folders : [],
  };
}

function cloneImportedProject(project: Project): Project {
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

createRoot(document.getElementById("root")!).render(<App />);
