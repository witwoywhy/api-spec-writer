import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Braces, Columns2, Download, Edit3, FilePlus2, FolderPlus, PanelLeftClose, PanelRightClose, Trash2, Upload } from "lucide-react";
import { localStorageProjectStore, registerProjectFileHandle, type ProjectFileHandle } from "./adaptors/projectStore";
import { ErrorCodesPage, EventCodesPage } from "./components/CodePages";
import { HtmlPreview, MarkdownPreview } from "./components/MarkdownPreview";
import { OpenApiPreview } from "./components/OpenApiPreview";
import { type Page, ProjectTree } from "./components/ProjectTree";
import { ServiceEditor } from "./components/ServiceEditor";
import type { ErrorCode, EventCode, Project, Service, ServiceSpec, StoreDocument } from "./domain";
import { buildAppPath, parseAppRoute } from "./lib/appRouter";
import { serviceGoStruct } from "./lib/goStructPreview";
import { uid } from "./lib/id";
import { serviceOpenApi } from "./lib/openApiSpec";
import { createDefaultErrorCodes, createDefaultSpec } from "./lib/serviceDefaults";
import { serviceMarkdown } from "./lib/serviceMarkdown";
import "./styles.css";

type MarkdownMode = "markdown" | "html" | "openapi" | "gostruct";
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
const initialRoute = parseAppRoute(window.location.pathname);
const initialViewMode = parseViewMode(new URLSearchParams(window.location.search));
const initialMarkdownMode = parseMarkdownMode(new URLSearchParams(window.location.search), localStorage.getItem(PREVIEW_TYPE_STORAGE_KEY));

function App() {
  const [store, setStore] = useState<StoreDocument>({ schemaVersion: 1, projects: [] });
  const [selectedProjectId, setSelectedProjectId] = useState(initialRoute.projectId);
  const [selectedServiceId, setSelectedServiceId] = useState(initialRoute.serviceId);
  const [page, setPage] = useState<Page>(initialRoute.page);
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const [markdownMode, setMarkdownMode] = useState<MarkdownMode>(initialMarkdownMode);
  const [editorWidth, setEditorWidth] = useState(58);
  const [saveError, setSaveError] = useState("");
  const [openProjects, setOpenProjects] = useState<Set<string>>(() => new Set());
  const [openServices, setOpenServices] = useState<Set<string>>(() => new Set());
  const serviceLayoutRef = useRef<HTMLDivElement>(null);
  const htmlExportRef = useRef<HTMLDivElement>(null);
  const latestStoreRef = useRef(store);
  const projectSaveTimersRef = useRef<Map<string, number>>(new Map());
  const pendingProjectSnapshotsRef = useRef<Map<string, Project>>(new Map());
  const projectSaveChainsRef = useRef<Map<string, Promise<void>>>(new Map());
  const selectedProject = store.projects.find((project) => project.id === selectedProjectId) ?? store.projects[0];
  const selectedService = selectedProject?.services.find((service) => service.id === selectedServiceId) ?? selectedProject?.services[0];
  const shouldRenderServicePreview = page === "services" && viewMode !== "edit" && Boolean(selectedService);
  const shouldBuildMarkdown = shouldRenderServicePreview && (markdownMode === "markdown" || markdownMode === "html");
  const markdown = useMemo(
    () => shouldBuildMarkdown && selectedService ? serviceMarkdown(selectedService.spec, selectedProject?.error_code ?? []) : "",
    [selectedProject?.error_code, selectedService, shouldBuildMarkdown],
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
    setOpenProjects((current) => mergeOpenIds(current, snapshot.projects.map((project) => project.id)));
    setOpenServices((current) => mergeOpenIds(current, snapshot.projects.map((project) => project.id)));
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
    });
    const search = page === "services" && selectedService ? serviceSearchParams(viewMode) : "";
    const url = `${path}${search}`;
    if (url !== `${window.location.pathname}${window.location.search}`) window.history.pushState(null, "", url);
  }, [page, selectedProject?.id, selectedService, selectedService?.id, viewMode]);

  const toggleProject = (projectId: string) => {
    setOpenProjects((current) => toggleSetValue(current, projectId));
  };

  const toggleServices = (projectId: string) => {
    setOpenServices((current) => toggleSetValue(current, projectId));
  };

  const createProject = async () => {
    if (!await flushPendingProjectSaves()) return;
    const name = window.prompt("Project name");
    if (!name?.trim()) return;
    const timestamp = now();
    const service: Service = { id: uid(), name: "Create Transaction", spec: createDefaultSpec(), updatedAt: timestamp };
    const project: Project = {
      id: uid(),
      name: name.trim(),
      event_code: [],
      error_code: createDefaultErrorCodes(),
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

  const createService = async (projectId = selectedProject?.id) => {
    if (!projectId) return;
    const name = window.prompt("Service name");
    if (!name?.trim()) return;
    if (!await flushPendingProjectSave(projectId)) return;
    const timestamp = now();
    const service: Service = { id: uid(), name: name.trim(), spec: createDefaultSpec(name.trim()), updatedAt: timestamp };
    await localStorageProjectStore.createService(projectId, service);
    await refreshStore();
    setSelectedServiceId(service.id);
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
          page={page}
          openProjects={openProjects}
          openServices={openServices}
          onToggleProject={toggleProject}
          onToggleServices={toggleServices}
          onSelectProject={(project) => {
            setSelectedProjectId(project.id);
            setSelectedServiceId(project.services[0]?.id ?? "");
            setPage("services");
          }}
          onSelectEventCodes={(project) => {
            setSelectedProjectId(project.id);
            setPage("eventCodes");
          }}
          onSelectErrorCodes={(project) => {
            setSelectedProjectId(project.id);
            setPage("errorCodes");
          }}
          onSelectServices={(project) => {
            setSelectedProjectId(project.id);
            setSelectedServiceId(project.services[0]?.id ?? "");
            setPage("services");
          }}
          onRenameProject={renameProject}
          onArchiveProject={archiveProject}
          onCreateService={(project) => {
            setSelectedProjectId(project.id);
            setPage("services");
            createService(project.id);
          }}
          onSelectService={(project, service) => {
            setSelectedProjectId(project.id);
            setSelectedServiceId(service.id);
            setPage("services");
          }}
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

      <main className="workspace">
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
                <p className="eyebrow">{workspacePathLabel(page, selectedProject, selectedService)}</p>
                {page === "services" && selectedService && viewMode !== "preview" ? (
                  <div className="workspace-actions">
                    <button type="button" onClick={renameService}>
                      <Edit3 size={13} /> Edit
                    </button>
                    <button className="danger-button" type="button" onClick={archiveService}>
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>
                ) : null}
              </div>
              {page === "services" ? (
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
                        <select className="preview-select" value={markdownMode} onChange={(event) => setMarkdownMode(event.target.value as MarkdownMode)} aria-label="Preview type">
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
                      <div ref={htmlExportRef}>
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
    return draft.project;
  } catch {
    return null;
  }
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

function workspacePathLabel(page: Page, project: Project, service: Service | undefined) {
  if (page === "eventCodes") return `PROJECTS / ${project.name} / EVENT`;
  if (page === "errorCodes") return `PROJECTS / ${project.name} / ERROR`;
  if (service) return `PROJECTS / ${project.name} / SERVICE / ${service.name}`;
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
  if (value === "html" || value === "openapi" || value === "gostruct") return value;
  return "markdown";
}

function GoStructPreview({ content }: { content: string }) {
  if (!content.trim()) return <div className="markdown-preview empty-preview">Request and response BODY fields are required for Go struct preview.</div>;
  return (
    <div className="markdown-preview">
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
  return project;
}

function cloneImportedProject(project: Project): Project {
  validateProject(project);
  const timestamp = now();
  const errorCodeIds = new Map<string, string>();
  const errorCodeIdsByCode = new Map<string, string>();
  const errorCode = project.error_code.map((error) => {
    const id = uid();
    errorCodeIds.set(error.id, id);
    errorCodeIdsByCode.set(error.code, id);
    return { ...error, id };
  });

  return {
    id: uid(),
    name: project.name,
    event_code: project.event_code.map((eventCode) => ({ ...eventCode, id: uid() })),
    error_code: errorCode,
    services: project.services.map((service) => ({
      ...service,
      id: uid(),
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
