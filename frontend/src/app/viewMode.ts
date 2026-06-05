export type MarkdownMode = "markdown" | "html" | "openapi" | "gostruct" | "sql";
export type ViewMode = "split" | "edit" | "preview";

export function parseViewMode(searchParams: URLSearchParams): ViewMode {
  const value = searchParams.get("view-mode");
  if (value === "edit" || value === "preview") return value;
  if (searchParams.get("preview") === "true") return "preview";
  return "split";
}

export function parseMarkdownMode(searchParams: URLSearchParams, storedValue: string | null): MarkdownMode {
  const value = searchParams.get("preview-type") ?? storedValue;
  if (value === "html" || value === "openapi" || value === "gostruct" || value === "sql") return value;
  return "markdown";
}

export function servicePreviewMode(markdownMode: MarkdownMode) {
  return markdownMode === "sql" ? "markdown" : markdownMode;
}

export function serviceSearchParams(viewMode: ViewMode) {
  const searchParams = new URLSearchParams();
  if (viewMode !== "split") searchParams.set("view-mode", viewMode);
  const value = searchParams.toString();
  return value ? `?${value}` : "";
}

export function serviceLayoutClass(viewMode: ViewMode) {
  if (viewMode === "edit") return "service-editor-layout edit-only";
  if (viewMode === "preview") return "service-editor-layout preview-only";
  return "service-editor-layout";
}
