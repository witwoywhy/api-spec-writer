import type { RefObject } from "react";
import { CodePreview } from "../../components/CodePreview";
import { HtmlPreview, MarkdownPreview } from "../../components/MarkdownPreview";
import type { MarkdownMode } from "../../app/viewMode";
import { PreviewPanelTitle } from "./PreviewPanelTitle";

export function DbSchemaPreviewPanel({
  mode,
  markdown,
  sql,
  htmlExportRef,
  copied,
  onModeChange,
  onCopy,
  onExport,
}: {
  mode: MarkdownMode;
  markdown: string;
  sql: string;
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
        mode={mode}
        options={[
          ["markdown", "Markdown"],
          ["html", "HTML"],
          ["sql", "SQL"],
        ]}
        onModeChange={onModeChange}
        onCopy={onCopy}
        onExport={onExport}
      />
      {mode === "sql" ? (
        <CodePreview content={sql} emptyText="Create DB schema tables to preview SQL." />
      ) : mode === "html" ? (
        <div ref={htmlExportRef} className="preview-export-frame">
          <HtmlPreview markdown={markdown} />
        </div>
      ) : (
        <MarkdownPreview markdown={markdown} />
      )}
    </>
  );
}
