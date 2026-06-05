import { Clipboard, Download } from "lucide-react";
import type { MarkdownMode } from "../../app/viewMode";

export function PreviewPanelTitle({
  mode,
  options,
  copied,
  onModeChange,
  onCopy,
  onExport,
}: {
  mode: MarkdownMode;
  options: Array<[MarkdownMode, string]>;
  copied: boolean;
  onModeChange: (mode: MarkdownMode) => void;
  onCopy: () => void;
  onExport: () => void;
}) {
  return (
    <div className="panel-title">
      <div className="preview-title">
        <h3>Preview</h3>
        <select className="preview-select" value={mode} onChange={(event) => onModeChange(event.target.value as MarkdownMode)} aria-label="Preview type">
          {options.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select>
      </div>
      <div className="preview-actions">
        <button type="button" onClick={onCopy}><Clipboard size={16} /> {copied ? "Copied" : "Copy"}</button>
        <button type="button" onClick={onExport}><Download size={16} /> Export</button>
      </div>
    </div>
  );
}
