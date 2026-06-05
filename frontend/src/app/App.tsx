import { FilePlus2, FolderPlus } from "lucide-react";
import { ErrorCodesPage, EventCodesPage } from "../components/CodePages";
import { DbSchemaPage } from "../components/DbSchemaPage";
import { ServiceEditor } from "../components/ServiceEditor";
import { SplitPreviewLayout } from "../components/SplitPreviewLayout";
import { DbSchemaPreviewPanel } from "../features/preview/DbSchemaPreviewPanel";
import { ErrorCodesPreviewPanel } from "../features/preview/ErrorCodesPreviewPanel";
import { ServicePreviewPanel } from "../features/preview/ServicePreviewPanel";
import { AppSidebar } from "./AppSidebar";
import { useWorkspaceController } from "./useWorkspaceController";
import { WorkspaceHeader } from "./WorkspaceHeader";
import "../styles.css";

export function App() {
  const controller = useWorkspaceController();
  const { selectedProject, selectedService, selectedDbTable } = controller;

  return (
    <div className="app-shell">
      <AppSidebar controller={controller} />

      <main className={controller.isFullPreview ? "workspace workspace-preview" : "workspace"}>
        {!selectedProject ? (
          <div className="empty-state">
            <FolderPlus size={40} />
            <h2>No project yet</h2>
            <button className="primary" type="button" onClick={controller.createProject}>Create Project</button>
          </div>
        ) : (
          <>
            <WorkspaceHeader controller={controller} />
            {controller.saveError ? <p className="save-error" role="status">{controller.saveError}</p> : null}

            {controller.page === "services" && (
              <SplitPreviewLayout
                viewMode={controller.viewMode}
                editorWidth={controller.editorWidth}
                onEditorWidthChange={controller.setEditorWidth}
                editor={selectedService ? (
                  <ServiceEditor
                    spec={selectedService.spec}
                    projectErrorCodes={selectedProject.error_code}
                    projectDbSchema={selectedProject.db_schema}
                    onChange={controller.updateServiceSpec}
                  />
                ) : (
                  <div className="empty-state compact">
                    <FilePlus2 size={32} />
                    <h2>No service yet</h2>
                    <button className="primary" type="button" onClick={() => void controller.createService()}>Create Service</button>
                  </div>
                )}
                preview={(
                  <ServicePreviewPanel
                    copied={controller.copiedPreview === "service"}
                    goStruct={controller.goStruct}
                    htmlExportRef={controller.htmlExportRef}
                    markdown={controller.markdown}
                    mode={controller.servicePreviewMode}
                    openApiDocument={controller.openApiDocument}
                    onModeChange={controller.setMarkdownMode}
                    onCopy={() => void controller.copyServicePreviewRaw()}
                    onExport={controller.exportSelectedPreview}
                  />
                )}
              />
            )}

            {controller.page === "dbSchema" && (
              <SplitPreviewLayout
                viewMode={controller.viewMode}
                editorWidth={controller.editorWidth}
                onEditorWidthChange={controller.setEditorWidth}
                editor={(
                  <DbSchemaPage
                    tables={selectedProject.db_schema}
                    selectedTableId={selectedDbTable?.id ?? ""}
                    onChange={controller.updateDbSchema}
                  />
                )}
                preview={(
                  <DbSchemaPreviewPanel
                    copied={controller.copiedPreview === "dbSchema"}
                    htmlExportRef={controller.htmlExportRef}
                    goStruct={controller.dbSchemaGoStruct}
                    goStructByTable={controller.dbSchemaGoStructByTable}
                    markdown={controller.dbSchemaPreviewMarkdown}
                    mode={controller.dbSchemaPreviewMode}
                    sql={controller.dbSchemaSql}
                    sqlByTable={controller.dbSchemaSqlByTable}
                    onModeChange={controller.setMarkdownMode}
                    onCopy={() => void controller.copyDbSchemaPreviewRaw()}
                    onExport={controller.exportDbSchemaPreview}
                  />
                )}
              />
            )}

            {controller.page === "eventCodes" && (
              <EventCodesPage
                rows={selectedProject.event_code}
                onAdd={controller.addEventCode}
                onChange={controller.updateEventCodes}
              />
            )}

            {controller.page === "errorCodes" && (
              <SplitPreviewLayout
                viewMode={controller.viewMode}
                editorWidth={controller.editorWidth}
                onEditorWidthChange={controller.setEditorWidth}
                editor={(
                  <ErrorCodesPage
                    rows={selectedProject.error_code}
                    onAddDomain={controller.addErrorDomain}
                    onAddErrorCode={controller.addErrorCode}
                    onChange={controller.updateErrorCodes}
                  />
                )}
                preview={(
                  <ErrorCodesPreviewPanel
                    copied={controller.copiedPreview === "errorCodes"}
                    htmlExportRef={controller.htmlExportRef}
                    markdown={controller.errorCodesPreviewMarkdown}
                    mode={controller.errorCodesPreviewMode}
                    onModeChange={controller.setMarkdownMode}
                    onCopy={() => void controller.copyErrorCodesPreviewRaw()}
                    onExport={controller.exportErrorCodesPreview}
                  />
                )}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
