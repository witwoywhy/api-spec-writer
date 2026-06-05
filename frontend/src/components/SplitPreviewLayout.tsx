import { type CSSProperties, type Dispatch, type ReactNode, type SetStateAction, useRef } from "react";
import { type ViewMode, serviceLayoutClass } from "../app/viewMode";

export function SplitPreviewLayout({
  viewMode,
  editorWidth,
  onEditorWidthChange,
  editor,
  preview,
}: {
  viewMode: ViewMode;
  editorWidth: number;
  onEditorWidthChange: Dispatch<SetStateAction<number>>;
  editor: ReactNode;
  preview: ReactNode;
}) {
  const layoutRef = useRef<HTMLDivElement>(null);
  const splitLayoutStyle = viewMode === "split" ? ({ "--editor-width": `${editorWidth}%` } as CSSProperties) : undefined;

  const resizeSplitPanels = (clientX: number) => {
    const rect = layoutRef.current?.getBoundingClientRect();
    if (!rect) return;
    const nextWidth = ((clientX - rect.left) / rect.width) * 100;
    onEditorWidthChange(Math.min(72, Math.max(32, nextWidth)));
  };

  return (
    <div ref={layoutRef} className={serviceLayoutClass(viewMode)} style={splitLayoutStyle}>
      {viewMode !== "preview" && <section className="panel editor-panel">{editor}</section>}
      {viewMode === "split" ? (
        <div
          className="split-divider"
          role="separator"
          aria-label="Resize editor and preview"
          aria-orientation="vertical"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") onEditorWidthChange((current) => Math.max(32, current - 4));
            if (event.key === "ArrowRight") onEditorWidthChange((current) => Math.min(72, current + 4));
          }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            resizeSplitPanels(event.clientX);
          }}
          onPointerMove={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
            resizeSplitPanels(event.clientX);
          }}
        />
      ) : null}
      {viewMode !== "edit" && <section className="panel preview-panel">{preview}</section>}
    </div>
  );
}
