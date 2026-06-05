import { Columns2, PanelLeftClose, PanelRightClose, Trash2 } from "lucide-react";
import { WorkspacePath } from "../components/WorkspacePath";
import type { WorkspaceController } from "./useWorkspaceController";

export function WorkspaceHeader({ controller }: { controller: WorkspaceController }) {
  if (!controller.selectedProject) return null;

  return (
    <header className="workspace-header">
      <div className="workspace-path">
        <WorkspacePath
          dbTable={controller.selectedDbTable}
          page={controller.page}
          project={controller.selectedProject}
          service={controller.selectedService}
          serviceFolder={controller.selectedServiceFolder}
          onRenameService={controller.renameService}
          onRenameServiceFolder={controller.renameSelectedServiceFolder}
        />
        {controller.page === "services" && controller.selectedService && controller.viewMode !== "preview" ? (
          <div className="workspace-actions">
            <button className="danger-button" type="button" title="Delete service" aria-label="Delete service" onClick={controller.archiveService}>
              <Trash2 size={13} />
            </button>
          </div>
        ) : null}
      </div>
      {controller.page === "services" || controller.page === "dbSchema" || controller.page === "errorCodes" ? (
        <div className="view-mode-control" aria-label="View mode">
          <button className={controller.viewMode === "split" ? "active" : ""} type="button" title="Editor and preview" aria-label="Editor and preview" onClick={() => controller.setViewMode("split")}>
            <Columns2 size={15} />
          </button>
          <button className={controller.viewMode === "edit" ? "active" : ""} type="button" title="Editor only" aria-label="Editor only" onClick={() => controller.setViewMode("edit")}>
            <PanelRightClose size={15} />
          </button>
          <button className={controller.viewMode === "preview" ? "active" : ""} type="button" title="Preview only" aria-label="Preview only" onClick={() => controller.setViewMode("preview")}>
            <PanelLeftClose size={15} />
          </button>
        </div>
      ) : null}
    </header>
  );
}
