import { describe, expect, it } from "vitest";
import { escapePipe, markdownToHtml } from "./markdownHtml";

describe("markdown html helpers", () => {
  it("escapes pipe characters in table cells", () => {
    expect(escapePipe("a|b\nc")).toBe("a\\|b c");
  });

  it("renders simple markdown table to HTML", () => {
    const html = markdownToHtml("| A | B |\n|---|---|\n| `x` | y |");
    expect(html).toContain("<table>");
    expect(html).toContain("<code>x</code>");
  });
});
