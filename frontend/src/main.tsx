import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Braces, Clipboard, Download, FilePlus2, FolderPlus, Upload } from "lucide-react";
import { localStorageProjectStore } from "./adaptors/projectStore";
import { ErrorCodesPage, EventCodesPage } from "./components/CodePages";
import { HtmlPreview, MarkdownPreview } from "./components/MarkdownPreview";
import { type Page, ProjectTree } from "./components/ProjectTree";
import { ServiceEditor } from "./components/ServiceEditor";
import type { Project, Service, ServiceSpec, StoreDocument } from "./domain";
import { buildAppPath, parseAppRoute } from "./lib/appRouter";
import { uid } from "./lib/id";
import { createDefaultErrorCodes, createDefaultSpec } from "./lib/serviceDefaults";
import { serviceMarkdown } from "./lib/serviceMarkdown";
import "./styles.css";

type MarkdownMode = "markdown" | "raw" | "html" | "openapi";

const now = () => new Date().toISOString();
const initialRoute = parseAppRoute(window.location.pathname);
const initialFullPreview = new URLSearchParams(window.location.search).get("preview") === "true";

function App() {
  const [store, setStore] = useState<StoreDocument>({ schemaVersion: 1, projects: [] });
  const [selectedProjectId, setSelectedProjectId] = useState(initialRoute.projectId);
  const [selectedServiceId, setSelectedServiceId] = useState(initialRoute.serviceId);
  const [page, setPage] = useState<Page>(initialRoute.page);
  const [showDisplay, setShowDisplay] = useState(true);
  const [fullPreview, setFullPreview] = useState(initialFullPreview);
  const [markdownMode, setMarkdownMode] = useState<MarkdownMode>("markdown");
  const [openProjects, setOpenProjects] = useState<Set<string>>(() => new Set());
  const [openServices, setOpenServices] = useState<Set<string>>(() => new Set());
  const htmlExportRef = useRef<HTMLDivElement>(null);
  const importProjectInputRef = useRef<HTMLInputElement>(null);
  const selectedProject = store.projects.find((project) => project.id === selectedProjectId) ?? store.projects[0];
  const selectedService = selectedProject?.services.find((service) => service.id === selectedServiceId) ?? selectedProject?.services[0];
  const markdown = useMemo(
    () => selectedService ? serviceMarkdown(selectedService.spec, selectedProject?.error_code ?? []) : "",
    [selectedProject?.error_code, selectedService],
  );

  const refreshStore = useCallback(async () => {
    const snapshot = await localStorageProjectStore.getSnapshot();
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
    const onPopState = () => {
      const route = parseAppRoute(window.location.pathname);
      setSelectedProjectId(route.projectId);
      setSelectedServiceId(route.serviceId);
      setPage(route.page);
      setFullPreview(new URLSearchParams(window.location.search).get("preview") === "true");
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
    const search = fullPreview && page === "services" && selectedService ? "?preview=true" : "";
    const url = `${path}${search}`;
    if (url !== `${window.location.pathname}${window.location.search}`) window.history.pushState(null, "", url);
  }, [fullPreview, page, selectedProject?.id, selectedService, selectedService?.id]);

  const toggleProject = (projectId: string) => {
    setOpenProjects((current) => toggleSetValue(current, projectId));
  };

  const toggleServices = (projectId: string) => {
    setOpenServices((current) => toggleSetValue(current, projectId));
  };

  const createProject = async () => {
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
    await localStorageProjectStore.createProject(project);
    await refreshStore();
    setSelectedProjectId(project.id);
    setSelectedServiceId(service.id);
  };

  const addEventCode = async () => {
    if (!selectedProject) return;
    await localStorageProjectStore.createEventCode(selectedProject.id, { id: uid(), code: "", name: "", description: "" });
    await refreshStore();
  };

  const addErrorCode = async (domain = "general") => {
    if (!selectedProject) return;
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
    const timestamp = now();
    const service: Service = { id: uid(), name: name.trim(), spec: createDefaultSpec(name.trim()), updatedAt: timestamp };
    await localStorageProjectStore.createService(projectId, service);
    await refreshStore();
    setSelectedServiceId(service.id);
  };

  const renameProject = async (project: Project) => {
    const name = window.prompt("Project name", project.name);
    if (!name?.trim()) return;
    await localStorageProjectStore.renameProject(project.id, name.trim());
    await refreshStore();
  };

  const archiveProject = async (project: Project) => {
    const confirmed = window.confirm(`Delete project "${project.name}"? It will be archived in local storage.`);
    if (!confirmed) return;
    await localStorageProjectStore.archiveProject(project.id);
    const snapshot = await localStorageProjectStore.getSnapshot();
    const nextProject = snapshot.projects[0];
    setStore(snapshot);
    setSelectedProjectId(nextProject?.id ?? "");
    setSelectedServiceId(nextProject?.services[0]?.id ?? "");
    setPage("services");
  };

  const updateServiceSpec = async (updater: (spec: ServiceSpec) => ServiceSpec) => {
    if (!selectedProject || !selectedService) return;
    const spec = updater(selectedService.spec);
    await localStorageProjectStore.updateServiceSpec(selectedProject.id, selectedService.id, spec);
    await refreshStore();
  };

  const exportBaseName = safeFileName(selectedService?.spec.name || selectedService?.name || "api-spec");
  const exportMarkdown = () => {
    if (!markdown.trim()) return;
    downloadFile(`${exportBaseName}.md`, markdown, "text/markdown;charset=utf-8");
  };
  const exportHtml = () => {
    if (!markdown.trim()) return;
    const html = htmlExportRef.current?.innerHTML ?? "";
    downloadFile(`${exportBaseName}.html`, buildHtmlDocument(selectedService?.spec.name ?? "API Spec", html), "text/html;charset=utf-8");
  };
  const exportSelectedPreview = () => {
    if (markdownMode === "html") {
      exportHtml();
      return;
    }
    exportMarkdown();
  };
  const exportProject = () => {
    if (!selectedProject) return;
    downloadFile(`${safeFileName(selectedProject.name)}.json`, JSON.stringify(selectedProject, null, 2), "application/json;charset=utf-8");
  };
  const importProject = async (file: File | undefined) => {
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text()) as Project;
      const project = cloneImportedProject(imported);
      await localStorageProjectStore.createProject(project);
      await refreshStore();
      setSelectedProjectId(project.id);
      setSelectedServiceId(project.services[0]?.id ?? "");
      setPage("services");
    } catch {
      window.alert("Project JSON is invalid.");
    } finally {
      if (importProjectInputRef.current) importProjectInputRef.current.value = "";
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
        />
        <div className="sidebar-actions">
          <button className="wide" type="button" onClick={exportProject} disabled={!selectedProject}>
            <Download size={16} /> Export Project
          </button>
          <button className="wide" type="button" onClick={() => importProjectInputRef.current?.click()}>
            <Upload size={16} /> Import Project
          </button>
          <input
            ref={importProjectInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => void importProject(event.target.files?.[0])}
          />
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
              <div>
                <p className="eyebrow">projects / {selectedProject.name}</p>
                <h2>{selectedProject.name}</h2>
              </div>
            </header>

            {page === "services" && (
              <div className={fullPreview ? "service-editor-layout preview-only" : showDisplay ? "service-editor-layout" : "service-editor-layout display-off"}>
                {!fullPreview && (
                  <section className="panel editor-panel">
                    {selectedService ? (
                      <ServiceEditor
                        spec={selectedService.spec}
                        projectErrorCodes={selectedProject.error_code}
                        showPreview={showDisplay}
                        onTogglePreview={() => setShowDisplay((current) => !current)}
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

                {(showDisplay || fullPreview) && (
                  <section className="panel preview-panel">
                    <div className="panel-title">
                      <div className="preview-title">
                        <h3>Preview</h3>
                        <select className="preview-select" value={markdownMode} onChange={(event) => setMarkdownMode(event.target.value as MarkdownMode)} aria-label="Preview type">
                          <option value="markdown">Markdown</option>
                          <option value="raw">Raw Markdown</option>
                          <option value="html">HTML</option>
                          <option value="openapi" disabled>OpenAPI (wait implement)</option>
                        </select>
                      </div>
                      <div className="preview-actions">
                        <button type="button" onClick={() => navigator.clipboard.writeText(markdown)}><Clipboard size={16} /> Copy</button>
                        <button type="button" onClick={exportSelectedPreview}><Download size={16} /> Export</button>
                      </div>
                    </div>
                    {markdownMode === "markdown" ? (
                      <MarkdownPreview markdown={markdown} />
                    ) : markdownMode === "html" ? (
                      <HtmlPreview markdown={markdown} />
                    ) : (
                      <pre>{markdown || "Select a service to preview the spec."}</pre>
                    )}
                    <div className="export-render" aria-hidden="true" ref={htmlExportRef}>
                      <HtmlPreview markdown={markdown} />
                    </div>
                  </section>
                )}
              </div>
            )}

            {page === "eventCodes" && (
              <EventCodesPage
                rows={selectedProject.event_code}
                onAdd={addEventCode}
                onChange={async (eventCodes) => {
                  await localStorageProjectStore.replaceEventCodes(selectedProject.id, eventCodes);
                  await refreshStore();
                }}
              />
            )}

            {page === "errorCodes" && (
              <ErrorCodesPage
                rows={selectedProject.error_code}
                onAddDomain={addErrorDomain}
                onAddErrorCode={addErrorCode}
                onChange={async (errorCodes) => {
                  await localStorageProjectStore.replaceErrorCodes(selectedProject.id, errorCodes);
                  await refreshStore();
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

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function cloneImportedProject(project: Project): Project {
  if (!project?.name || !Array.isArray(project.services) || !Array.isArray(project.event_code) || !Array.isArray(project.error_code)) {
    throw new Error("Invalid project");
  }

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

createRoot(document.getElementById("root")!).render(<App />);
