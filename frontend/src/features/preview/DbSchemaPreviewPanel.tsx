import type { RefObject } from "react";
import { CodePreview } from "../../components/CodePreview";
import { HtmlPreview, MarkdownPreview } from "../../components/MarkdownPreview";
import type { MarkdownMode } from "../../app/viewMode";
import { PreviewPanelTitle } from "./PreviewPanelTitle";

export function DbSchemaPreviewPanel({
  mode,
  markdown,
  sql,
  sqlByTable,
  goStruct,
  goStructByTable,
  htmlExportRef,
  copied,
  onModeChange,
  onCopy,
  onExport,
}: {
  mode: MarkdownMode;
  markdown: string;
  sql: string;
  sqlByTable: Array<{ tableId: string; tableName: string; content: string }>;
  goStruct: string;
  goStructByTable: Array<{ tableId: string; tableName: string; content: string }>;
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
          ["gostruct", "Go Struct"],
        ]}
        onModeChange={onModeChange}
        onCopy={onCopy}
        onExport={onExport}
      />
      {mode === "sql" ? (
        <TableCodePreview sections={sqlByTable} emptyText="Create DB schema tables to preview SQL." fallbackContent={sql} />
      ) : mode === "gostruct" ? (
        <TableCodePreview sections={goStructByTable} emptyText="Create DB schema columns to preview Go structs." fallbackContent={goStruct} />
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

function TableCodePreview({
  sections,
  fallbackContent,
  emptyText,
}: {
  sections: Array<{ tableId: string; tableName: string; content: string }>;
  fallbackContent: string;
  emptyText: string;
}) {
  const visibleSections = sections.filter((section) => section.content.trim());
  if (visibleSections.length === 0) return <CodePreview content={fallbackContent} emptyText={emptyText} />;
  return (
    <div className="table-code-preview">
      {visibleSections.map((section) => (
        <section className="table-code-section" key={section.tableId}>
          <CodePreview content={section.content} emptyText={emptyText} />
        </section>
      ))}
    </div>
  );
}
