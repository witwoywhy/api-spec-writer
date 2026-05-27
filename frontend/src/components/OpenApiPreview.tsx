export function OpenApiPreview({ document }: { document: Record<string, any> | null }) {
  if (!document) return <div className="openapi-preview empty-preview">Select a service to preview the OpenAPI spec.</div>;
  const paths = document.paths ?? {};
  const pathEntries = Object.entries(paths);

  return (
    <article className="openapi-preview">
      <header className="openapi-head">
        <span>OpenAPI {document.openapi}</span>
        <h1>{document.info?.title ?? "API Spec"}</h1>
        {document.info?.description ? <p>{document.info.description}</p> : null}
      </header>

      {pathEntries.length === 0 ? (
        <p className="empty-preview">OpenAPI paths are available for HTTP services.</p>
      ) : (
        pathEntries.map(([path, methods]) => (
          <section className="openapi-path" key={path}>
            {Object.entries(methods as Record<string, any>).map(([method, operation]) => (
              <div key={method}>
                <div className="openapi-route">
                  <span>{method.toUpperCase()}</span>
                  <code>{path}</code>
                </div>
                <h2>{operation.summary}</h2>
                {operation.description ? <p>{operation.description}</p> : null}

                <OpenApiParameters parameters={operation.parameters ?? []} />
                <OpenApiBody title="Request Body" body={operation.requestBody} />
                <OpenApiResponses responses={operation.responses ?? {}} />
              </div>
            ))}
          </section>
        ))
      )}
    </article>
  );
}

function OpenApiParameters({ parameters }: { parameters: any[] }) {
  if (parameters.length === 0) return null;
  return (
    <section className="openapi-section">
      <h3>Parameters</h3>
      <div className="markdown-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>In</th>
              <th>Required</th>
              <th>Type</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {parameters.map((parameter) => (
              <tr key={`${parameter.in}-${parameter.name}`}>
                <td><code>{parameter.name}</code></td>
                <td>{parameter.in}</td>
                <td>{parameter.required ? "YES" : "NO"}</td>
                <td>{schemaLabel(parameter.schema)}</td>
                <td>{parameter.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function OpenApiBody({ title, body }: { title: string; body: any }) {
  if (!body) return null;
  const content = body.content?.["application/json"];
  if (!content) return null;
  return (
    <section className="openapi-section">
      <h3>{title}</h3>
      <SchemaTree schema={content.schema} />
      <OpenApiExamples examples={content.examples} />
    </section>
  );
}

function OpenApiResponses({ responses }: { responses: Record<string, any> }) {
  return (
    <section className="openapi-section">
      <h3>Responses</h3>
      {Object.entries(responses).map(([status, response]) => {
        const content = response.content?.["application/json"];
        return (
          <div className="openapi-response" key={status}>
            <div className="openapi-response-head">
              <span>{status}</span>
              <p>{response.description}</p>
            </div>
            {content?.schema ? <SchemaTree schema={content.schema} /> : null}
            {content?.examples ? <OpenApiExamples examples={content.examples} /> : null}
            {content?.example ? <pre>{JSON.stringify(content.example, null, 2)}</pre> : null}
          </div>
        );
      })}
    </section>
  );
}

function SchemaTree({ schema }: { schema: any }) {
  if (!schema) return null;
  const rows = schemaRows(schema);
  if (rows.length === 0) return null;

  return (
    <div className="openapi-schema">
      <h4>Schema</h4>
      <div className="markdown-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Field</th>
              <th>Type</th>
              <th>Required</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.field}>
                <td><code>{row.field}</code></td>
                <td>{row.type}</td>
                <td>{row.required ? "YES" : "NO"}</td>
                <td>{row.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function schemaRows(schema: any, prefix = ""): Array<{ field: string; type: string; required: boolean; description: string }> {
  const properties = schema?.properties ?? {};
  const required = new Set(schema?.required ?? []);
  return Object.entries(properties).flatMap(([name, child]) => {
    const childSchema = child as any;
    const field = prefix ? `${prefix}.${name}` : name;
    const label = childSchema.type === "array" ? `${field}[]` : field;
    const nested = childSchema.type === "array" ? childSchema.items : childSchema;
    return [
      {
        field: label,
        type: schemaLabel(childSchema),
        required: required.has(name),
        description: childSchema.description ?? "",
      },
      ...(nested?.properties ? schemaRows(nested, childSchema.type === "array" ? `${field}[]` : field) : []),
    ];
  });
}

function OpenApiExamples({ examples }: { examples: Record<string, any> | undefined }) {
  if (!examples || Object.keys(examples).length === 0) return null;
  return (
    <div className="openapi-examples">
      <h4>Examples</h4>
      {Object.entries(examples).map(([key, example]) => (
        <details key={key} open>
          <summary>{example.summary || key}</summary>
          <pre>{JSON.stringify(example.value, null, 2)}</pre>
        </details>
      ))}
    </div>
  );
}

function schemaLabel(schema: any): string {
  if (!schema) return "";
  if (schema.type === "array") return `array of ${schemaLabel(schema.items) || "unknown"}`;
  return schema.type ?? "object";
}
