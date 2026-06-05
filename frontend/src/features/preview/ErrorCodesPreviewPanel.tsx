import type { RefObject } from "react";
import { HtmlPreview, MarkdownPreview } from "../../components/MarkdownPreview";
import type { MarkdownMode } from "../../app/viewMode";
import { PreviewPanelTitle } from "./PreviewPanelTitle";

export function ErrorCodesPreviewPanel({
  mode,
  markdown,
  htmlExportRef,
  copied,
  onModeChange,
  onCopy,
  onExport,
}: {
  mode: MarkdownMode;
  markdown: string;
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
        ]}
        onModeChange={onModeChange}
        onCopy={onCopy}
        onExport={onExport}
      />
      {mode === "html" ? (
        <div ref={htmlExportRef} className="preview-export-frame">
          <HtmlPreview markdown={markdown} />
        </div>
      ) : (
        <MarkdownPreview markdown={markdown} />
      )}
    </>
  );
}
