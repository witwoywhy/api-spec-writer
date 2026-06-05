import { describe, expect, it } from "vitest";
import { parseMarkdownMode, parseViewMode, serviceLayoutClass, servicePreviewMode } from "./viewMode";

describe("view mode helpers", () => {
  it("parses legacy preview query as preview mode", () => {
    expect(parseViewMode(new URLSearchParams("preview=true"))).toBe("preview");
  });

  it("normalizes SQL to markdown for service preview only", () => {
    expect(servicePreviewMode("sql")).toBe("markdown");
    expect(servicePreviewMode("openapi")).toBe("openapi");
  });

  it("parses stored preview type and falls back to markdown", () => {
    expect(parseMarkdownMode(new URLSearchParams(), "gostruct")).toBe("gostruct");
    expect(parseMarkdownMode(new URLSearchParams(), "unknown")).toBe("markdown");
  });

  it("maps view mode to layout class", () => {
    expect(serviceLayoutClass("edit")).toBe("service-editor-layout edit-only");
    expect(serviceLayoutClass("preview")).toBe("service-editor-layout preview-only");
    expect(serviceLayoutClass("split")).toBe("service-editor-layout");
  });
});
