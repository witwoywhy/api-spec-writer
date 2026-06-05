import { Braces, Download, FolderPlus, Upload } from "lucide-react";
import { ProjectTree } from "../components/ProjectTree";
import type { WorkspaceController } from "./useWorkspaceController";

export function AppSidebar({ controller }: { controller: WorkspaceController }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <Braces size={24} />
        <div>
          <h1>API Spec Writer</h1>
          <p>Local project tree for service specs.</p>
        </div>
      </div>

      <button className="primary wide" type="button" onClick={controller.createProject}>
        <FolderPlus size={16} /> New Project
      </button>

      <ProjectTree
        projects={controller.store.projects}
        selectedProjectId={controller.selectedProject?.id ?? ""}
        selectedServiceId={controller.selectedService?.id ?? ""}
        selectedDbTableId={controller.selectedDbTable?.id ?? ""}
        page={controller.page}
        openProjects={controller.openProjects}
        openServices={controller.openServices}
        openServiceFolders={controller.openServiceFolders}
        openDbSchemas={controller.openDbSchemas}
        onToggleProject={controller.toggleProject}
        onToggleServices={controller.toggleServices}
        onToggleServiceFolder={controller.toggleServiceFolder}
        onToggleDbSchema={controller.toggleDbSchema}
        onSelectProject={controller.selectProject}
        onSelectEventCodes={controller.selectEventCodes}
        onSelectErrorCodes={controller.selectErrorCodes}
        onSelectDbSchema={controller.selectDbSchema}
        onCreateDbTable={controller.createDbTableFromTree}
        onCreateServiceFolder={controller.createServiceFolderFromTree}
        onSelectServices={controller.selectServices}
        onRenameProject={controller.renameProject}
        onArchiveProject={controller.archiveProject}
        onArchiveServiceFolder={controller.archiveServiceFolder}
        onCreateService={(project, folderId) => {
          void controller.createServiceFromTree(project, folderId);
        }}
        onSelectService={controller.selectService}
        onSelectDbTable={controller.selectDbTable}
        onMoveProject={(sourceProjectId, targetProjectId) => {
          void controller.moveProject(sourceProjectId, targetProjectId);
        }}
        onMoveDbTable={controller.moveDbTable}
        onMoveServiceFolder={controller.moveServiceFolder}
        onMoveService={controller.moveService}
        showProjectActions={controller.viewMode !== "preview"}
      />
      <div className="sidebar-actions">
        <button className="wide" type="button" onClick={controller.exportProjectPreview} disabled={!controller.selectedProject}>
          <Download size={16} /> Export Preview
        </button>
        <button className="wide" type="button" onClick={() => void controller.importProject()}>
          <Upload size={16} /> Import Project
        </button>
      </div>
    </aside>
  );
}
