import type { RefObject } from "react";
import { GoStructPreview } from "../../components/CodePreview";
import { HtmlPreview, MarkdownPreview } from "../../components/MarkdownPreview";
import { OpenApiPreview } from "../../components/OpenApiPreview";
import type { MarkdownMode } from "../../app/viewMode";
import { PreviewPanelTitle } from "./PreviewPanelTitle";

export function ServicePreviewPanel({
  mode,
  markdown,
  openApiDocument,
  goStruct,
  htmlExportRef,
  copied,
  onModeChange,
  onCopy,
  onExport,
}: {
  mode: MarkdownMode;
  markdown: string;
  openApiDocument: Record<string, any> | null;
  goStruct: string;
  htmlExportRef: RefObject<HTMLDivElement | null>;
  copied: boolean;
  onModeChange: (mode: MarkdownMode) => void;
  onCopy: () => void;
  onExport: () => void;
}) {
  return (
    <>
      <PreviewPanelTitle
        copied={copied}
        options={[
          ["markdown", "Markdown"],
          ["html", "HTML"],
          ["openapi", "OpenAPI"],
          ["gostruct", "Go Struct"],
        ]}
        mode={mode}
        onModeChange={onModeChange}
        onCopy={onCopy}
        onExport={onExport}
      />
      {mode === "markdown" ? (
        <MarkdownPreview markdown={markdown} />
      ) : mode === "html" ? (
        <div ref={htmlExportRef} className="preview-export-frame">
          <HtmlPreview markdown={markdown} />
        </div>
      ) : mode === "openapi" ? (
        <OpenApiPreview document={openApiDocument} />
      ) : mode === "gostruct" ? (
        <GoStructPreview content={goStruct} />
      ) : (
        <MarkdownPreview markdown={markdown} />
      )}
    </>
  );
}
