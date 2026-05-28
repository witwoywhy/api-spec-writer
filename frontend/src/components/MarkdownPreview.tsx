import { useEffect, useId, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

let mermaidInitialized = false;

const MARKDOWN_REMARK_PLUGINS = [remarkGfm];
const MARKDOWN_COMPONENTS: Components = {
  code({ className, children }) {
    const code = String(children).replace(/\n$/, "");
    if (className === "language-mermaid") return <MermaidDiagram chart={code} />;
    return <code className={className}>{children}</code>;
  },
  pre({ children }) {
    return <pre>{children}</pre>;
  },
  table({ children }) {
    return <div className="markdown-table-wrap"><table>{children}</table></div>;
  },
};

export function MarkdownPreview({ markdown }: { markdown: string }) {
  if (!markdown.trim()) return <div className="markdown-preview empty-preview">Select a service to preview the spec.</div>;
  return (
    <div className="markdown-preview">
      <MarkdownBody markdown={markdown} />
    </div>
  );
}

export function HtmlPreview({ markdown }: { markdown: string }) {
  if (!markdown.trim()) return <div className="html-preview empty-preview">Select a service to preview the spec.</div>;
  return (
    <article className="html-preview">
      <MarkdownBody markdown={markdown} />
    </article>
  );
}

function MarkdownBody({ markdown }: { markdown: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={MARKDOWN_REMARK_PLUGINS}
      components={MARKDOWN_COMPONENTS}
    >
      {markdown}
    </ReactMarkdown>
  );
}

function MermaidDiagram({ chart }: { chart: string }) {
  const reactId = useId();
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const diagramId = `mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
    import("mermaid")
      .then(({ default: mermaid }) => {
        if (!mermaidInitialized) {
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            theme: "default",
          });
          mermaidInitialized = true;
        }
        return mermaid.render(diagramId, chart);
      })
      .then(({ svg }) => {
        if (!active) return;
        setSvg(svg);
        setError("");
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setSvg("");
        setError(reason instanceof Error ? reason.message : "Unable to render Mermaid diagram.");
      });
    return () => {
      active = false;
    };
  }, [chart, reactId]);

  if (error) {
    return (
      <pre className="mermaid-error">
        <code>{chart}</code>
      </pre>
    );
  }
  if (!svg) return <div className="mermaid-loading">Rendering diagram...</div>;
  return <div className="mermaid-diagram" dangerouslySetInnerHTML={{ __html: svg }} />;
}
