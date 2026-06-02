import { ChevronDown, ChevronRight, Code2, Edit3, Folder, FolderOpen, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { DbTable, Project, Service, ServiceFolder } from "../domain";

export type Page = "services" | "eventCodes" | "errorCodes" | "dbSchema";
const GENERAL_SERVICE_FOLDER_ID = "__general_services__";
type TreeDragItem =
  | { type: "project"; id: string }
  | { type: "dbTable"; projectId: string; id: string }
  | { type: "serviceFolder"; projectId: string; id: string }
  | { type: "service"; projectId: string; folderId: string; id: string };
type TreeDropTarget = TreeDragItem;

export function ProjectTree({
  projects,
  selectedProjectId,
  selectedServiceId,
  selectedDbTableId,
  page,
  openProjects,
  openServices,
  openServiceFolders,
  openDbSchemas,
  onToggleProject,
  onToggleServices,
  onToggleServiceFolder,
  onToggleDbSchema,
  onSelectProject,
  onSelectEventCodes,
  onSelectErrorCodes,
  onSelectDbSchema,
  onCreateDbTable,
  onCreateServiceFolder,
  onSelectServices,
  onRenameProject,
  onArchiveProject,
  onArchiveServiceFolder,
  onCreateService,
  onSelectService,
  onSelectDbTable,
  onMoveProject,
  onMoveDbTable,
  onMoveServiceFolder,
  onMoveService,
  showProjectActions,
}: {
  projects: Project[];
  selectedProjectId: string;
  selectedServiceId: string;
  selectedDbTableId: string;
  page: Page;
  openProjects: Set<string>;
  openServices: Set<string>;
  openServiceFolders: Set<string>;
  openDbSchemas: Set<string>;
  onToggleProject: (projectId: string) => void;
  onToggleServices: (projectId: string) => void;
  onToggleServiceFolder: (folderKey: string) => void;
  onToggleDbSchema: (projectId: string) => void;
  onSelectProject: (project: Project) => void;
  onSelectEventCodes: (project: Project) => void;
  onSelectErrorCodes: (project: Project) => void;
  onSelectDbSchema: (project: Project) => void;
  onCreateDbTable: (project: Project) => void;
  onCreateServiceFolder: (project: Project) => void;
  onSelectServices: (project: Project) => void;
  onRenameProject: (project: Project) => void;
  onArchiveProject: (project: Project) => void;
  onArchiveServiceFolder: (project: Project, folder: ServiceFolder) => void;
  onCreateService: (project: Project, folderId?: string | null) => void;
  onSelectService: (project: Project, service: Service) => void;
  onSelectDbTable: (project: Project, table: DbTable) => void;
  onMoveProject: (sourceProjectId: string, targetProjectId: string) => void;
  onMoveDbTable: (project: Project, sourceTableId: string, targetTableId: string) => void;
  onMoveServiceFolder: (project: Project, sourceFolderId: string, targetFolderId: string) => void;
  onMoveService: (project: Project, folderId: string, sourceServiceId: string, targetServiceId: string) => void;
  showProjectActions: boolean;
}) {
  const [dragItem, setDragItem] = useState<TreeDragItem | null>(null);
  const [dropTarget, setDropTarget] = useState<TreeDropTarget | null>(null);
  const treeRowClass = (baseClass: string, item: TreeDragItem) => {
    const classes = [baseClass];
    if (isSameTreeItem(dragItem, item)) classes.push("dragging");
    if (isSameTreeItem(dropTarget, item)) classes.push("drop-target");
    return classes.join(" ");
  };
  const clearDragState = () => {
    setDragItem(null);
    setDropTarget(null);
  };

  return (
    <section className="nav-section">
      <h2>Projects</h2>
      <div className="dir-tree">
        {projects.map((project) => {
          const selected = project.id === selectedProjectId;
          const projectOpen = openProjects.has(project.id);
          const servicesOpen = openServices.has(project.id);
          const dbSchemaOpen = openDbSchemas.has(project.id);
          const serviceFolders = serviceFoldersForTree(project);
          return (
            <div className="tree-project" key={project.id}>
              <button
                className={treeRowClass(selected && page === "services" && !selectedServiceId ? "tree-row project-row active" : "tree-row project-row", { type: "project", id: project.id })}
                draggable
                type="button"
                onDragStart={(event) => {
                  setDragItem({ type: "project", id: project.id });
                  event.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={clearDragState}
                onDragOver={(event) => {
                  if (dragItem?.type === "project" && dragItem.id !== project.id) {
                    event.preventDefault();
                    setDropTarget({ type: "project", id: project.id });
                  }
                }}
                onDragLeave={() => {
                  if (isSameTreeItem(dropTarget, { type: "project", id: project.id })) setDropTarget(null);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragItem?.type === "project" && dragItem.id !== project.id) onMoveProject(dragItem.id, project.id);
                  clearDragState();
                }}
                onClick={() => {
                  onToggleProject(project.id);
                  onSelectProject(project);
                }}
              >
                {projectOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                {projectOpen ? <FolderOpen size={15} /> : <Folder size={15} />}
                <span>{project.name}</span>
                {showProjectActions ? (
                  <>
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
                  </>
                ) : null}
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
                    className={selected && page === "dbSchema" && !selectedDbTableId ? "tree-row branch-row active" : "tree-row branch-row"}
                    type="button"
                    onClick={() => {
                      onToggleDbSchema(project.id);
                      onSelectDbSchema(project);
                    }}
                  >
                    {dbSchemaOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    {dbSchemaOpen ? <FolderOpen size={15} /> : <Folder size={15} />}
                    <span>DB SCHEMA</span>
                    <small>{project.db_schema.length}</small>
                    {showProjectActions ? (
                      <span
                        className="tree-add"
                        role="button"
                        tabIndex={0}
                        title="Create table"
                        aria-label="Create table"
                        onClick={(event) => {
                          event.stopPropagation();
                          onCreateDbTable(project);
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" && event.key !== " ") return;
                          event.preventDefault();
                          event.stopPropagation();
                          onCreateDbTable(project);
                        }}
                      >
                        <Plus size={13} />
                      </span>
                    ) : null}
                  </button>
                  {dbSchemaOpen && (
                    <div className="tree-children nested">
                      {project.db_schema.map((table) => (
                        <button
                          className={treeRowClass(selected && page === "dbSchema" && table.id === selectedDbTableId ? "tree-row leaf-row active" : "tree-row leaf-row", { type: "dbTable", projectId: project.id, id: table.id })}
                          draggable
                          type="button"
                          key={table.id}
                          onDragStart={(event) => {
                            setDragItem({ type: "dbTable", projectId: project.id, id: table.id });
                            event.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={clearDragState}
                          onDragOver={(event) => {
                            if (dragItem?.type === "dbTable" && dragItem.projectId === project.id && dragItem.id !== table.id) {
                              event.preventDefault();
                              setDropTarget({ type: "dbTable", projectId: project.id, id: table.id });
                            }
                          }}
                          onDragLeave={() => {
                            if (isSameTreeItem(dropTarget, { type: "dbTable", projectId: project.id, id: table.id })) setDropTarget(null);
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            if (dragItem?.type === "dbTable" && dragItem.projectId === project.id && dragItem.id !== table.id) onMoveDbTable(project, dragItem.id, table.id);
                            clearDragState();
                          }}
                          onClick={() => onSelectDbTable(project, table)}
                        >
                          <Code2 size={14} />
                          <span>{table.name || "Untitled Table"}</span>
                        </button>
                      ))}
                      {project.db_schema.length === 0 && <p className="empty tree-empty">No tables yet.</p>}
                    </div>
                  )}
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
                    {showProjectActions ? (
                      <span
                        className="tree-add"
                        role="button"
                        tabIndex={0}
                        title="Create folder"
                        aria-label="Create folder"
                        onClick={(event) => {
                          event.stopPropagation();
                          onCreateServiceFolder(project);
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" && event.key !== " ") return;
                          event.preventDefault();
                          event.stopPropagation();
                          onCreateServiceFolder(project);
                        }}
                      >
                        <Plus size={13} />
                      </span>
                    ) : null}
                  </button>
                  {servicesOpen && (
                    <div className="tree-children nested">
                      {serviceFolders.map((folder) => {
                        const folderKey = serviceFolderKey(project.id, folder.id);
                        const folderOpen = openServiceFolders.has(folderKey);
                        const folderServices = servicesForFolder(project, folder.id);
                        return (
                          <div className="tree-project" key={folder.id}>
                            <button
                              className={treeRowClass(selected && page === "services" && folderServices.some((service) => service.id === selectedServiceId) ? "tree-row branch-row active" : "tree-row branch-row", { type: "serviceFolder", projectId: project.id, id: folder.id })}
                              draggable={!folder.virtual}
                              type="button"
                              onDragStart={(event) => {
                                if (folder.virtual) return;
                                setDragItem({ type: "serviceFolder", projectId: project.id, id: folder.id });
                                event.dataTransfer.effectAllowed = "move";
                              }}
                              onDragEnd={clearDragState}
                              onDragOver={(event) => {
                                if (!folder.virtual && dragItem?.type === "serviceFolder" && dragItem.projectId === project.id && dragItem.id !== folder.id) {
                                  event.preventDefault();
                                  setDropTarget({ type: "serviceFolder", projectId: project.id, id: folder.id });
                                }
                              }}
                              onDragLeave={() => {
                                if (isSameTreeItem(dropTarget, { type: "serviceFolder", projectId: project.id, id: folder.id })) setDropTarget(null);
                              }}
                              onDrop={(event) => {
                                event.preventDefault();
                                if (!folder.virtual && dragItem?.type === "serviceFolder" && dragItem.projectId === project.id && dragItem.id !== folder.id) onMoveServiceFolder(project, dragItem.id, folder.id);
                                clearDragState();
                              }}
                              onClick={() => onToggleServiceFolder(folderKey)}
                            >
                              {folderOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              {folderOpen ? <FolderOpen size={15} /> : <Folder size={15} />}
                              <span>{folder.name}</span>
                              <small>{folderServices.length}</small>
                              {showProjectActions ? (
                                <>
                                  <span
                                    className="tree-add"
                                    role="button"
                                    tabIndex={0}
                                    title="Create service"
                                    aria-label="Create service"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      onCreateService(project, folder.virtual ? null : folder.id);
                                    }}
                                    onKeyDown={(event) => {
                                      if (event.key !== "Enter" && event.key !== " ") return;
                                      event.preventDefault();
                                      event.stopPropagation();
                                      onCreateService(project, folder.virtual ? null : folder.id);
                                    }}
                                  >
                                    <Plus size={13} />
                                  </span>
                                  {!folder.virtual ? (
                                    <span
                                      className="tree-action danger"
                                      role="button"
                                      tabIndex={0}
                                      title="Delete folder"
                                      aria-label="Delete folder"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        onArchiveServiceFolder(project, folder);
                                      }}
                                      onKeyDown={(event) => {
                                        if (event.key !== "Enter" && event.key !== " ") return;
                                        event.preventDefault();
                                        event.stopPropagation();
                                        onArchiveServiceFolder(project, folder);
                                      }}
                                    >
                                      <Trash2 size={13} />
                                    </span>
                                  ) : null}
                                </>
                              ) : null}
                            </button>
                            {folderOpen && (
                              <div className="tree-children nested">
                                {folderServices.map((service) => (
                                  <button
                                    className={treeRowClass(selected && page === "services" && service.id === selectedServiceId ? "tree-row leaf-row active" : "tree-row leaf-row", { type: "service", projectId: project.id, folderId: folder.id, id: service.id })}
                                    draggable
                                    type="button"
                                    key={service.id}
                                    onDragStart={(event) => {
                                      setDragItem({ type: "service", projectId: project.id, folderId: folder.id, id: service.id });
                                      event.dataTransfer.effectAllowed = "move";
                                    }}
                                    onDragEnd={clearDragState}
                                    onDragOver={(event) => {
                                      if (dragItem?.type === "service" && dragItem.projectId === project.id && dragItem.folderId === folder.id && dragItem.id !== service.id) {
                                        event.preventDefault();
                                        setDropTarget({ type: "service", projectId: project.id, folderId: folder.id, id: service.id });
                                      }
                                    }}
                                    onDragLeave={() => {
                                      if (isSameTreeItem(dropTarget, { type: "service", projectId: project.id, folderId: folder.id, id: service.id })) setDropTarget(null);
                                    }}
                                    onDrop={(event) => {
                                      event.preventDefault();
                                      if (dragItem?.type === "service" && dragItem.projectId === project.id && dragItem.folderId === folder.id && dragItem.id !== service.id) onMoveService(project, folder.id, dragItem.id, service.id);
                                      clearDragState();
                                    }}
                                    onClick={() => onSelectService(project, service)}
                                  >
                                    <Code2 size={14} />
                                    <span>{service.name}</span>
                                  </button>
                                ))}
                                {folderServices.length === 0 && <p className="empty tree-empty">No services yet.</p>}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {serviceFolders.length === 0 && <p className="empty tree-empty">No folders yet.</p>}
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

type TreeServiceFolder = ServiceFolder & {
  virtual?: boolean;
};

function serviceFoldersForTree(project: Project): TreeServiceFolder[] {
  const folders = project.service_folders;
  const hasRootServices = project.services.some((service) => !service.folderId);
  if (!hasRootServices) return folders;
  return [
    ...folders,
    {
      id: GENERAL_SERVICE_FOLDER_ID,
      name: "General",
      createdAt: "",
      updatedAt: "",
      virtual: true,
    },
  ];
}

function servicesForFolder(project: Project, folderId: string) {
  if (folderId === GENERAL_SERVICE_FOLDER_ID) return project.services.filter((service) => !service.folderId);
  return project.services.filter((service) => service.folderId === folderId);
}

function serviceFolderKey(projectId: string, folderId: string) {
  return `${projectId}:${folderId}`;
}

function isSameTreeItem(left: TreeDragItem | null, right: TreeDragItem) {
  if (!left || left.type !== right.type || left.id !== right.id) return false;
  if (left.type === "project") return true;
  if (right.type === "project") return true;
  if (left.projectId !== right.projectId) return false;
  if (left.type !== "service" || right.type !== "service") return true;
  return left.folderId === right.folderId;
}
