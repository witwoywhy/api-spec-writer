import { ChevronDown, ChevronRight, Code2, Edit3, Folder, FolderOpen, Plus, Trash2 } from "lucide-react";
import type { Project, Service } from "../domain";

export type Page = "services" | "eventCodes" | "errorCodes";

export function ProjectTree({
  projects,
  selectedProjectId,
  selectedServiceId,
  page,
  openProjects,
  openServices,
  onToggleProject,
  onToggleServices,
  onSelectProject,
  onSelectEventCodes,
  onSelectErrorCodes,
  onSelectServices,
  onRenameProject,
  onArchiveProject,
  onCreateService,
  onSelectService,
}: {
  projects: Project[];
  selectedProjectId: string;
  selectedServiceId: string;
  page: Page;
  openProjects: Set<string>;
  openServices: Set<string>;
  onToggleProject: (projectId: string) => void;
  onToggleServices: (projectId: string) => void;
  onSelectProject: (project: Project) => void;
  onSelectEventCodes: (project: Project) => void;
  onSelectErrorCodes: (project: Project) => void;
  onSelectServices: (project: Project) => void;
  onRenameProject: (project: Project) => void;
  onArchiveProject: (project: Project) => void;
  onCreateService: (project: Project) => void;
  onSelectService: (project: Project, service: Service) => void;
}) {
  return (
    <section className="nav-section">
      <h2>Projects</h2>
      <div className="dir-tree">
        {projects.map((project) => {
          const selected = project.id === selectedProjectId;
          const projectOpen = openProjects.has(project.id);
          const servicesOpen = openServices.has(project.id);
          return (
            <div className="tree-project" key={project.id}>
              <button
                className={selected && page === "services" && !selectedServiceId ? "tree-row project-row active" : "tree-row project-row"}
                type="button"
                onClick={() => {
                  onToggleProject(project.id);
                  onSelectProject(project);
                }}
              >
                {projectOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                {projectOpen ? <FolderOpen size={15} /> : <Folder size={15} />}
                <span>{project.name}</span>
                <span
                  className="tree-action"
                  role="button"
                  tabIndex={0}
                  title="Edit project name"
                  aria-label="Edit project name"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRenameProject(project);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    event.stopPropagation();
                    onRenameProject(project);
                  }}
                >
                  <Edit3 size={13} />
                </span>
                <span
                  className="tree-action danger"
                  role="button"
                  tabIndex={0}
                  title="Delete project"
                  aria-label="Delete project"
                  onClick={(event) => {
                    event.stopPropagation();
                    onArchiveProject(project);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    event.stopPropagation();
                    onArchiveProject(project);
                  }}
                >
                  <Trash2 size={13} />
                </span>
              </button>
              {projectOpen && (
                <div className="tree-children">
                  <button className={selected && page === "eventCodes" ? "tree-row leaf-row active" : "tree-row leaf-row"} type="button" onClick={() => onSelectEventCodes(project)}>
                    <Code2 size={14} />
                    <span>EVENT</span>
                    <small>{project.event_code.length}</small>
                  </button>
                  <button className={selected && page === "errorCodes" ? "tree-row leaf-row active" : "tree-row leaf-row"} type="button" onClick={() => onSelectErrorCodes(project)}>
                    <Code2 size={14} />
                    <span>ERROR</span>
                    <small>{project.error_code.length}</small>
                  </button>
                  <button
                    className={selected && page === "services" && !selectedServiceId ? "tree-row branch-row active" : "tree-row branch-row"}
                    type="button"
                    onClick={() => {
                      onToggleServices(project.id);
                      onSelectServices(project);
                    }}
                  >
                    {servicesOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    {servicesOpen ? <FolderOpen size={15} /> : <Folder size={15} />}
                    <span>SERVICE</span>
                    <small>{project.services.length}</small>
                    <span
                      className="tree-add"
                      role="button"
                      tabIndex={0}
                      title="Create service"
                      aria-label="Create service"
                      onClick={(event) => {
                        event.stopPropagation();
                        onCreateService(project);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        event.stopPropagation();
                        onCreateService(project);
                      }}
                    >
                      <Plus size={13} />
                    </span>
                  </button>
                  {servicesOpen && (
                    <div className="tree-children nested">
                      {project.services.map((service) => (
                        <button className={selected && page === "services" && service.id === selectedServiceId ? "tree-row leaf-row active" : "tree-row leaf-row"} type="button" key={service.id} onClick={() => onSelectService(project, service)}>
                          <Code2 size={14} />
                          <span>{service.name}</span>
                        </button>
                      ))}
                      {project.services.length === 0 && <p className="empty tree-empty">No services yet.</p>}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {projects.length === 0 && <p className="empty">Create a project to start.</p>}
      </div>
    </section>
  );
}
