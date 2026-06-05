export function GoStructPreview({ content }: { content: string }) {
  return <CodePreview content={content} emptyText="Request and response BODY fields are required for Go struct preview." />;
}

export function CodePreview({ content, emptyText }: { content: string; emptyText: string }) {
  if (!content.trim()) return <div className="markdown-preview empty-preview">{emptyText}</div>;
  return (
    <div className="markdown-preview code-preview">
      <pre><code>{content}</code></pre>
    </div>
  );
}
