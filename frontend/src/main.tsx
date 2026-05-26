import { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Braces, Clipboard, FilePlus2, FolderPlus } from "lucide-react";
import { localStorageProjectStore } from "./adaptors/projectStore";
import { ErrorCodesPage, EventCodesPage } from "./components/CodePages";
import { MarkdownPreview } from "./components/MarkdownPreview";
import { type Page, ProjectTree } from "./components/ProjectTree";
import { ServiceEditor } from "./components/ServiceEditor";
import type { Project, Service, ServiceSpec, StoreDocument } from "./domain";
import { buildAppPath, parseAppRoute } from "./lib/appRouter";
import { uid } from "./lib/id";
import { createDefaultErrorCodes, createDefaultSpec } from "./lib/serviceDefaults";
import { serviceMarkdown } from "./lib/serviceMarkdown";
import "./styles.css";

type MarkdownMode = "preview" | "raw";

const now = () => new Date().toISOString();
const initialRoute = parseAppRoute(window.location.pathname);

function App() {
  const [store, setStore] = useState<StoreDocument>({ schemaVersion: 1, projects: [] });
  const [selectedProjectId, setSelectedProjectId] = useState(initialRoute.projectId);
  const [selectedServiceId, setSelectedServiceId] = useState(initialRoute.serviceId);
  const [page, setPage] = useState<Page>(initialRoute.page);
  const [showDisplay, setShowDisplay] = useState(true);
  const [markdownMode, setMarkdownMode] = useState<MarkdownMode>("raw");
  const [openProjects, setOpenProjects] = useState<Set<string>>(() => new Set());
  const [openServices, setOpenServices] = useState<Set<string>>(() => new Set());
  const selectedProject = store.projects.find((project) => project.id === selectedProjectId) ?? store.projects[0];
  const selectedService = selectedProject?.services.find((service) => service.id === selectedServiceId) ?? selectedProject?.services[0];
  const markdown = useMemo(() => selectedService ? serviceMarkdown(selectedService.spec) : "", [selectedService]);

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
    if (path !== window.location.pathname) window.history.pushState(null, "", path);
  }, [page, selectedProject?.id, selectedService?.id]);

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

  const updateServiceSpec = async (updater: (spec: ServiceSpec) => ServiceSpec) => {
    if (!selectedProject || !selectedService) return;
    const spec = updater(selectedService.spec);
    await localStorageProjectStore.updateServiceSpec(selectedProject.id, selectedService.id, spec);
    await refreshStore();
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
              <div className={showDisplay ? "service-editor-layout" : "service-editor-layout display-off"}>
                <section className="panel editor-panel">
                  {selectedService ? (
                    <ServiceEditor
                      spec={selectedService.spec}
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

                {showDisplay && (
                  <section className="panel preview-panel">
                    <div className="panel-title">
                      <h3>Generated Markdown</h3>
                      <div className="preview-actions">
                        <div className="segmented-control" aria-label="Markdown display mode">
                          <button className={markdownMode === "preview" ? "active" : ""} type="button" onClick={() => setMarkdownMode("preview")}>Preview</button>
                          <button className={markdownMode === "raw" ? "active" : ""} type="button" onClick={() => setMarkdownMode("raw")}>Raw</button>
                        </div>
                        <button type="button" onClick={() => navigator.clipboard.writeText(markdown)}><Clipboard size={16} /> Copy</button>
                      </div>
                    </div>
                    {markdownMode === "preview" ? (
                      <MarkdownPreview markdown={markdown} />
                    ) : (
                      <pre>{markdown || "Select a service to preview the spec."}</pre>
                    )}
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

createRoot(document.getElementById("root")!).render(<App />);
