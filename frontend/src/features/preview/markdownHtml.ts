export function buildHtmlDocument(title: string, body: string) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin: 0; background: #f6f8fb; color: #17212b; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.55; }
    main { max-width: 980px; margin: 32px auto; background: #fff; border: 1px solid #dbe3ea; border-radius: 8px; padding: 28px; }
    h1 { font-size: 28px; margin: 0 0 18px; }
    h2 { border-bottom: 1px solid #dbe3ea; font-size: 21px; margin: 28px 0 12px; padding-bottom: 8px; }
    h3 { font-size: 16px; margin: 20px 0 10px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 10px 0 16px; }
    th, td { border: 1px solid #dbe3ea; padding: 7px 8px; text-align: left; vertical-align: top; }
    th { background: #f3f6f9; }
    code { background: #eef2f4; border-radius: 4px; padding: 1px 4px; }
    pre { background: #f8fafc; border: 1px solid #dbe3ea; border-radius: 6px; color: #17212b; overflow: auto; padding: 12px; }
    pre code { background: transparent; padding: 0; color: inherit; }
    .mermaid-diagram { background: #fff; border: 1px solid #dbe3ea; border-radius: 8px; margin: 12px 0; overflow-x: auto; padding: 12px; }
    .mermaid-error { background: #fff7f7; border-color: #f3c4c0; color: #17212b; }
    svg { max-width: 100%; }
  </style>
</head>
<body>
  <main>${body}</main>
</body>
</html>`;
}

export function markdownToHtml(markdown: string) {
  const lines = markdown.split("\n");
  const html: string[] = [];
  let paragraph: string[] = [];
  let table: string[] = [];
  let codeFence = "";
  let codeLines: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    html.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const flushTable = () => {
    if (table.length === 0) return;
    const [head, separator, ...body] = table;
    if (!separator?.includes("---")) {
      html.push(...table.map((line) => `<p>${inlineMarkdown(line)}</p>`));
      table = [];
      return;
    }
    html.push("<table><thead><tr>");
    for (const cell of markdownTableCells(head)) html.push(`<th>${inlineMarkdown(cell)}</th>`);
    html.push("</tr></thead><tbody>");
    for (const row of body) {
      html.push("<tr>");
      for (const cell of markdownTableCells(row)) html.push(`<td>${inlineMarkdown(cell)}</td>`);
      html.push("</tr>");
    }
    html.push("</tbody></table>");
    table = [];
  };
  const flushCode = () => {
    if (!codeFence) return;
    const code = escapeHtml(codeLines.join("\n"));
    html.push(`<pre${codeFence === "mermaid" ? " class=\"mermaid-diagram\"" : ""}><code>${code}</code></pre>`);
    codeFence = "";
    codeLines = [];
  };

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (codeFence) {
        flushCode();
      } else {
        flushParagraph();
        flushTable();
        codeFence = line.replace(/^```/, "").trim() || "text";
        codeLines = [];
      }
      continue;
    }
    if (codeFence) {
      codeLines.push(line);
      continue;
    }
    if (line.startsWith("|")) {
      flushParagraph();
      table.push(line);
      continue;
    }
    flushTable();
    if (!line.trim()) {
      flushParagraph();
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      const level = heading[1].length;
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }
    paragraph.push(line);
  }

  flushParagraph();
  flushTable();
  flushCode();
  return html.join("\n");
}

function markdownTableCells(row: string) {
  return row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function inlineMarkdown(value: string) {
  return escapeHtml(value).replace(/`([^`]+)`/g, "<code>$1</code>");
}

export function escapePipe(value: string | number | undefined) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function escapeMarkdownHeading(value: string) {
  return value.replaceAll("\n", " ").replace(/^#+\s*/, "").trim() || "Untitled";
}

export function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
