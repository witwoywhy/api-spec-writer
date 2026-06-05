import type { DbTable, Project, Service, ServiceFolder } from "../domain";
import type { Page } from "./ProjectTree";

export function WorkspacePath({
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
