import React, { useCallback, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Braces,
  ChevronDown,
  ChevronRight,
  Clipboard,
  Code2,
  FilePlus2,
  Folder,
  FolderPlus,
  FolderOpen,
  Plus,
  Trash2,
} from "lucide-react";
import "./styles.css";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type RequireFlag = "YES" | "NO";
type RequestLocation = "HEADER" | "PATH PARAM" | "QUERY PARAM" | "BODY";
type ResponseLocation = "HEADER" | "BODY";

type FieldRow = {
  id: string;
  location: RequestLocation | ResponseLocation;
  field: string;
  type: string;
  require: RequireFlag;
  description: string;
};

type ErrorCode = {
  id: string;
  status: string;
  code: string;
  message: string;
  description: string;
};

type EventCode = {
  id: string;
  code: string;
  name: string;
  description: string;
};

type MappingRow = {
  id: string;
  target: string;
  from: string;
  description: string;
};

type MappingSection = {
  id: string;
  name: string;
  rows: MappingRow[];
};

type ServiceSpec = {
  name: string;
  method: HttpMethod;
  url: string;
  authentication: string;
  description: string;
  requestExample: string;
  requestFields: FieldRow[];
  sequence: string;
  errors: ErrorCode[];
  responseExample: string;
  responseFields: FieldRow[];
  mappingSections: MappingSection[];
};

type Service = {
  id: string;
  name: string;
  spec: ServiceSpec;
  updatedAt: string;
};

type Project = {
  id: string;
  name: string;
  event_code: EventCode[];
  error_code: ErrorCode[];
  services: Service[];
  createdAt: string;
  updatedAt: string;
};

type StoreDocument = {
  schemaVersion: 1;
  projects: Project[];
};

type Page = "services" | "eventCodes" | "errorCodes";
type MarkdownMode = "preview" | "raw";

const STORAGE_KEY = "api-spec-writer-platform:v1";
const REQUEST_LOCATIONS: RequestLocation[] = ["HEADER", "PATH PARAM", "QUERY PARAM", "BODY"];
const RESPONSE_LOCATIONS: ResponseLocation[] = ["HEADER", "BODY"];
const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const REQUIRED: RequireFlag[] = ["YES", "NO"];

const now = () => new Date().toISOString();
const uid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

function createDefaultSpec(name = "Create Transaction"): ServiceSpec {
  return {
    name,
    method: "POST",
    url: "/v1/transactions",
    authentication: "Bearer access token",
    description: "Create a transaction verification request and return the generated transaction ID.",
    requestExample: '{\n  "type": "INTERBANK",\n  "from_account": "1234567890",\n  "to_account": "0987654321",\n  "amount": 500.00\n}',
    requestFields: [
      { id: uid(), location: "BODY", field: "type", type: "string", require: "YES", description: "Enum: INTERBANK, INTRABANK" },
      { id: uid(), location: "BODY", field: "from_account", type: "string", require: "YES", description: "Source account number" },
      { id: uid(), location: "BODY", field: "to_account", type: "string", require: "YES", description: "Destination account number" },
      { id: uid(), location: "BODY", field: "amount", type: "number", require: "YES", description: "Must be greater than 0" },
    ],
    sequence: "sequenceDiagram\n    participant request\n    participant service\n    participant db.transaction\n\n    request ->> service: POST /v1/transactions\n    service ->> db.transaction: insert transaction\n    db.transaction -->> service: response\n    service -->> request: response",
    errors: [
      { id: uid(), status: "400", code: "040001", message: "invalid request", description: "Request validation fails" },
      { id: uid(), status: "401", code: "040002", message: "unauthorized", description: "Token is missing or invalid" },
    ],
    responseExample: '{\n  "transaction_id": "a7d5e8ac-3d7c-4a9e-95c1-9129998a7c10"\n}',
    responseFields: [
      { id: uid(), location: "BODY", field: "transaction_id", type: "string", require: "YES", description: "Generated transaction UUID" },
    ],
    mappingSections: [
      {
        id: uid(),
        name: "Insert Transaction",
        rows: [
          { id: uid(), target: "id", from: "", description: "Generate new UUID" },
          { id: uid(), target: "type", from: "request.type", description: "" },
          { id: uid(), target: "from_account", from: "request.from_account", description: "" },
          { id: uid(), target: "to_account", from: "request.to_account", description: "" },
          { id: uid(), target: "amount", from: "request.amount", description: "" },
        ],
      },
    ],
  };
}

function loadStore(): StoreDocument {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { schemaVersion: 1, projects: [] };
  try {
    const parsed = JSON.parse(raw) as StoreDocument;
    return { schemaVersion: 1, projects: Array.isArray(parsed.projects) ? parsed.projects : [] };
  } catch {
    return { schemaVersion: 1, projects: [] };
  }
}

function saveStore(store: StoreDocument) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function escapePipe(value: string) {
  return value.replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

function code(value: string) {
  return value ? `\`${value}\`` : "";
}

function fieldTable(rows: FieldRow[]) {
  if (rows.length === 0) return "_None._";
  return [
    "| Field | Type | Require | Description |",
    "|-------|------|---------|-------------|",
    ...rows.map((row) => `| ${code(escapePipe(row.field))} | ${escapePipe(row.type)} | ${row.require} | ${escapePipe(row.description)} |`),
  ].join("\n");
}

function serviceMarkdown(spec: ServiceSpec) {
  const requestParts = ["## Request"];
  for (const location of REQUEST_LOCATIONS) {
    const rows = spec.requestFields.filter((row) => row.location === location);
    if (rows.length > 0) requestParts.push(`\n### ${location}\n\n${fieldTable(rows)}`);
  }
  const requestBlock = spec.requestExample.trim().startsWith("{") || spec.requestExample.trim().startsWith("[") ? "json" : "text";
  if (spec.requestExample.trim()) requestParts.push(`\nExample:\n\n\`\`\`${requestBlock}\n${spec.requestExample.trim()}\n\`\`\``);

  const responseParts = ["## Response"];
  let hasResponseRows = false;
  for (const location of RESPONSE_LOCATIONS) {
    const rows = spec.responseFields.filter((row) => row.location === location);
    if (rows.length > 0) {
      hasResponseRows = true;
      responseParts.push(`\n### ${location}\n\n${fieldTable(rows)}`);
    }
  }
  if (!hasResponseRows) responseParts.push("\n_Response is empty._");
  if (spec.responseExample.trim() && spec.responseFields.some((row) => row.location === "BODY")) {
    responseParts.push(`\nExample:\n\n\`\`\`json\n${spec.responseExample.trim()}\n\`\`\``);
  }

  const errorRows = spec.errors.length
    ? spec.errors.map((row) => `| ${escapePipe(row.status)} | ${code(escapePipe(row.code))} | ${escapePipe(row.message)} | ${escapePipe(row.description)} |`).join("\n")
    : "|  |  |  |  |";

  const mapping = spec.mappingSections.filter((section) => section.rows.length > 0);
  const mappingParts = mapping.length
    ? [
        "## Mapping",
        ...mapping.map((section) => {
          const rows = section.rows.map((row) => `| ${code(escapePipe(row.target))} | ${code(escapePipe(row.from))} | ${escapePipe(row.description)} |`).join("\n");
          return `\n### ${escapePipe(section.name || "Mapping")}\n\n| Target | From | Description |\n|--------|------|-------------|\n${rows}`;
        }),
      ].join("\n")
    : "## Mapping\n\n_None._";

  return `# ${spec.name || "[SERVICE OR USE CASE NAME]"}

## Spec Header

| Field | Value |
|-------|-------|
| Name | ${escapePipe(spec.name || "[SERVICE OR USE CASE NAME]")} |
| Method | ${spec.method || "[HTTP METHOD]"} |
| URL | ${code(escapePipe(spec.url || "[PATH]"))} |
| Authentication | ${escapePipe(spec.authentication || "[AUTH REQUIREMENT]")} |
| Description | ${escapePipe(spec.description || "[WHAT THIS API DOES AND WHY]")} |

${requestParts.join("\n")}

## Sequence Diagram

\`\`\`mermaid
${spec.sequence.trim() || "sequenceDiagram\n    participant request\n    participant service\n\n    request ->> service: [METHOD] [URL]\n    service -->> request: response"}
\`\`\`

## Errors

| Http Status | Error Code | Message | Description |
|-------------|------------|---------|-------------|
${errorRows}

${responseParts.join("\n")}

${mappingParts}

## Completion Checklist

- Header has name, method, URL, auth, and description.
- Every request location is documented.
- Every request field has type, required flag, and validation detail.
- Sequence diagram has \`request\`, \`service\`, and every external integration.
- Every business branch in the diagram has a matching error or response behavior.
- Error table includes HTTP status, error code, message, and trigger.
- Response table documents every returned field and source.
- Mapping tables explain all integration, database, and response field transformations.
- Nested fields use dot notation and arrays use \`[]\`.
`;
}

function App() {
  const [initialStore] = useState(() => loadStore());
  const [store, setStore] = useState<StoreDocument>(initialStore);
  const [selectedProjectId, setSelectedProjectId] = useState(initialStore.projects[0]?.id ?? "");
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [page, setPage] = useState<Page>("services");
  const [showDisplay, setShowDisplay] = useState(true);
  const [markdownMode, setMarkdownMode] = useState<MarkdownMode>("raw");
  const selectedProject = store.projects.find((project) => project.id === selectedProjectId) ?? store.projects[0];
  const selectedService = selectedProject?.services.find((service) => service.id === selectedServiceId) ?? selectedProject?.services[0];
  const markdown = useMemo(() => selectedService ? serviceMarkdown(selectedService.spec) : "", [selectedService]);

  const commit = useCallback((updater: (current: StoreDocument) => StoreDocument) => {
    setStore((current) => {
      const next = updater(current);
      saveStore(next);
      return next;
    });
  }, []);

  const createProject = () => {
    const name = window.prompt("Project name");
    if (!name?.trim()) return;
    const timestamp = now();
    const service: Service = { id: uid(), name: "Create Transaction", spec: createDefaultSpec(), updatedAt: timestamp };
    const project: Project = {
      id: uid(),
      name: name.trim(),
      event_code: [],
      error_code: [],
      services: [service],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    commit((current) => ({ ...current, projects: [...current.projects, project] }));
    setSelectedProjectId(project.id);
    setSelectedServiceId(service.id);
  };

  const updateProject = (projectId: string, updater: (project: Project) => Project) => {
    commit((current) => ({
      ...current,
      projects: current.projects.map((project) => project.id === projectId ? { ...updater(project), updatedAt: now() } : project),
    }));
  };

  const addEventCode = () => {
    if (!selectedProject) return;
    updateProject(selectedProject.id, (project) => ({
      ...project,
      event_code: [...project.event_code, { id: uid(), code: "", name: "", description: "" }],
    }));
  };

  const addErrorCode = () => {
    if (!selectedProject) return;
    updateProject(selectedProject.id, (project) => ({
      ...project,
      error_code: [...project.error_code, { id: uid(), status: "", code: "", message: "", description: "" }],
    }));
  };

  const createService = (projectId = selectedProject?.id) => {
    if (!projectId) return;
    const name = window.prompt("Service name");
    if (!name?.trim()) return;
    const timestamp = now();
    const service: Service = { id: uid(), name: name.trim(), spec: createDefaultSpec(name.trim()), updatedAt: timestamp };
    updateProject(projectId, (project) => ({ ...project, services: [...project.services, service] }));
    setSelectedServiceId(service.id);
  };

  const updateServiceSpec = (updater: (spec: ServiceSpec) => ServiceSpec) => {
    if (!selectedProject || !selectedService) return;
    updateProject(selectedProject.id, (project) => ({
      ...project,
      services: project.services.map((service) => {
        if (service.id !== selectedService.id) return service;
        const spec = updater(service.spec);
        return { ...service, name: spec.name || service.name, spec, updatedAt: now() };
      }),
    }));
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Braces size={24} />
          <div>
            <h1>API Spec Writer Platform</h1>
            <p>Local project tree for service specs.</p>
          </div>
        </div>

        <button className="primary wide" type="button" onClick={createProject}>
          <FolderPlus size={16} /> New Project
        </button>

        <ProjectTree
          projects={store.projects}
          selectedProjectId={selectedProject?.id ?? ""}
          selectedServiceId={selectedService?.id ?? ""}
          page={page}
          onSelectProject={(project) => {
            setSelectedProjectId(project.id);
            setSelectedServiceId(project.services[0]?.id ?? "");
            setPage("services");
          }}
          onSelectEventCodes={(project) => {
            setSelectedProjectId(project.id);
            setPage("eventCodes");
          }}
          onSelectErrorCodes={(project) => {
            setSelectedProjectId(project.id);
            setPage("errorCodes");
          }}
          onSelectServices={(project) => {
            setSelectedProjectId(project.id);
            setSelectedServiceId(project.services[0]?.id ?? "");
            setPage("services");
          }}
          onCreateService={(project) => {
            setSelectedProjectId(project.id);
            setPage("services");
            createService(project.id);
          }}
          onSelectService={(project, service) => {
            setSelectedProjectId(project.id);
            setSelectedServiceId(service.id);
            setPage("services");
          }}
        />
      </aside>

      <main className="workspace">
        {!selectedProject ? (
          <div className="empty-state">
            <FolderPlus size={40} />
            <h2>No project yet</h2>
            <button className="primary" type="button" onClick={createProject}>Create Project</button>
          </div>
        ) : (
          <>
            <header className="workspace-header">
              <div>
                <p className="eyebrow">projects / {selectedProject.name}</p>
                <h2>{selectedProject.name}</h2>
              </div>
            </header>

            {page === "services" && (
              <div className={showDisplay ? "service-editor-layout" : "service-editor-layout display-off"}>
                <section className="panel editor-panel">
                  {selectedService ? (
                    <ServiceEditor
                      spec={selectedService.spec}
                      showPreview={showDisplay}
                      onTogglePreview={() => setShowDisplay((current) => !current)}
                      onChange={updateServiceSpec}
                    />
                  ) : (
                    <div className="empty-state compact">
                      <FilePlus2 size={32} />
                      <h2>No service yet</h2>
                      <button className="primary" type="button" onClick={() => createService()}>Create Service</button>
                    </div>
                  )}
                </section>

                {showDisplay && (
                  <section className="panel preview-panel">
                    <div className="panel-title">
                      <h3>Generated Markdown</h3>
                      <div className="preview-actions">
                        <div className="segmented-control" aria-label="Markdown display mode">
                          <button className={markdownMode === "preview" ? "active" : ""} type="button" onClick={() => setMarkdownMode("preview")}>Preview</button>
                          <button className={markdownMode === "raw" ? "active" : ""} type="button" onClick={() => setMarkdownMode("raw")}>Raw</button>
                        </div>
                        <button type="button" onClick={() => navigator.clipboard.writeText(markdown)}><Clipboard size={16} /> Copy</button>
                      </div>
                    </div>
                    {markdownMode === "preview" ? (
                      <MarkdownPreview markdown={markdown} />
                    ) : (
                      <pre>{markdown || "Select a service to preview the spec."}</pre>
                    )}
                  </section>
                )}
              </div>
            )}

            {page === "eventCodes" && (
              <EventCodesPage
                rows={selectedProject.event_code}
                onAdd={addEventCode}
                onChange={(event_code) => updateProject(selectedProject.id, (project) => ({ ...project, event_code }))}
              />
            )}

            {page === "errorCodes" && (
              <ErrorCodesPage
                rows={selectedProject.error_code}
                onAdd={addErrorCode}
                onChange={(error_code) => updateProject(selectedProject.id, (project) => ({ ...project, error_code }))}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function ProjectTree({
  projects,
  selectedProjectId,
  selectedServiceId,
  page,
  onSelectProject,
  onSelectEventCodes,
  onSelectErrorCodes,
  onSelectServices,
  onCreateService,
  onSelectService,
}: {
  projects: Project[];
  selectedProjectId: string;
  selectedServiceId: string;
  page: Page;
  onSelectProject: (project: Project) => void;
  onSelectEventCodes: (project: Project) => void;
  onSelectErrorCodes: (project: Project) => void;
  onSelectServices: (project: Project) => void;
  onCreateService: (project: Project) => void;
  onSelectService: (project: Project, service: Service) => void;
}) {
  const [openProjects, setOpenProjects] = useState<Set<string>>(() => new Set(projects.map((project) => project.id)));
  const [openServices, setOpenServices] = useState<Set<string>>(() => new Set(projects.map((project) => project.id)));
  const toggleProject = (projectId: string) => {
    setOpenProjects((current) => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };
  const toggleServices = (projectId: string) => {
    setOpenServices((current) => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  return (
    <section className="nav-section">
      <h2>Projects</h2>
      <div className="dir-tree">
        {projects.map((project) => {
          const selected = project.id === selectedProjectId;
          const projectOpen = openProjects.has(project.id);
          const servicesOpen = openServices.has(project.id);
          return (
            <div className="tree-project" key={project.id}>
              <button
                className={selected && page === "services" && !selectedServiceId ? "tree-row project-row active" : "tree-row project-row"}
                type="button"
                onClick={() => {
                  toggleProject(project.id);
                  onSelectProject(project);
                }}
              >
                {projectOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                {projectOpen ? <FolderOpen size={15} /> : <Folder size={15} />}
                <span>{project.name}</span>
              </button>
              {projectOpen && (
                <div className="tree-children">
                  <button className={selected && page === "eventCodes" ? "tree-row leaf-row active" : "tree-row leaf-row"} type="button" onClick={() => onSelectEventCodes(project)}>
                    <Code2 size={14} />
                    <span>event_code</span>
                    <small>{project.event_code.length}</small>
                  </button>
                  <button className={selected && page === "errorCodes" ? "tree-row leaf-row active" : "tree-row leaf-row"} type="button" onClick={() => onSelectErrorCodes(project)}>
                    <Code2 size={14} />
                    <span>error_code</span>
                    <small>{project.error_code.length}</small>
                  </button>
                  <button
                    className={selected && page === "services" && !selectedServiceId ? "tree-row branch-row active" : "tree-row branch-row"}
                    type="button"
                    onClick={() => {
                      toggleServices(project.id);
                      onSelectServices(project);
                    }}
                  >
                    {servicesOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    {servicesOpen ? <FolderOpen size={15} /> : <Folder size={15} />}
                    <span>services</span>
                    <small>{project.services.length}</small>
                    <span
                      className="tree-add"
                      role="button"
                      tabIndex={0}
                      title="Create service"
                      aria-label="Create service"
                      onClick={(event) => {
                        event.stopPropagation();
                        onCreateService(project);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        event.stopPropagation();
                        onCreateService(project);
                      }}
                    >
                      <Plus size={13} />
                    </span>
                  </button>
                  {servicesOpen && (
                    <div className="tree-children nested">
                      {project.services.map((service) => (
                        <button className={selected && page === "services" && service.id === selectedServiceId ? "tree-row leaf-row active" : "tree-row leaf-row"} type="button" key={service.id} onClick={() => onSelectService(project, service)}>
                          <Code2 size={14} />
                          <span>{service.name}</span>
                        </button>
                      ))}
                      {project.services.length === 0 && <p className="empty tree-empty">No services yet.</p>}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {projects.length === 0 && <p className="empty">Create a project to start.</p>}
      </div>
    </section>
  );
}

function MarkdownPreview({ markdown }: { markdown: string }) {
  if (!markdown.trim()) return <div className="markdown-preview empty-preview">Select a service to preview the spec.</div>;
  const blocks = parseMarkdownBlocks(markdown);
  return (
    <div className="markdown-preview">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const Heading = `h${Math.min(block.level, 4)}` as "h1" | "h2" | "h3" | "h4";
          return <Heading key={index}>{block.text}</Heading>;
        }
        if (block.type === "code") return <pre key={index}><code>{block.text}</code></pre>;
        if (block.type === "list") return <ul key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInlineMarkdown(item)}</li>)}</ul>;
        if (block.type === "table") {
          return (
            <div className="markdown-table-wrap" key={index}>
              <table>
                <thead>
                  <tr>{block.headers.map((cell, cellIndex) => <th key={cellIndex}>{renderInlineMarkdown(cell)}</th>)}</tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{renderInlineMarkdown(cell)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return <p key={index}>{renderInlineMarkdown(block.text)}</p>;
      })}
    </div>
  );
}

type MarkdownBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "code"; text: string }
  | { type: "list"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] };

function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      blocks.push({ type: "code", text: codeLines.join("\n") });
      index += 1;
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] });
      index += 1;
      continue;
    }

    if (line.startsWith("|") && lines[index + 1]?.startsWith("|")) {
      const tableLines: string[] = [];
      while (index < lines.length && lines[index].startsWith("|")) {
        tableLines.push(lines[index]);
        index += 1;
      }
      const [headerLine, , ...rowLines] = tableLines;
      blocks.push({
        type: "table",
        headers: splitTableRow(headerLine),
        rows: rowLines.map(splitTableRow),
      });
      continue;
    }

    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (index < lines.length && lines[index].startsWith("- ")) {
        items.push(lines[index].slice(2));
        index += 1;
      }
      blocks.push({ type: "list", items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length && lines[index].trim() && !lines[index].startsWith("#") && !lines[index].startsWith("|") && !lines[index].startsWith("- ") && !lines[index].startsWith("```")) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    blocks.push({ type: "paragraph", text: paragraphLines.join(" ") });
  }

  return blocks;
}

function splitTableRow(line: string) {
  return line.split("|").slice(1, -1).map((cell) => cell.trim());
}

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

function EventCodesPage({ rows, onAdd, onChange }: { rows: EventCode[]; onAdd: () => void; onChange: (rows: EventCode[]) => void }) {
  const update = (id: string, patch: Partial<EventCode>) => onChange(rows.map((row) => row.id === id ? { ...row, ...patch } : row));

  return (
    <section className="panel code-page">
      <div className="panel-title page-title">
        <div>
          <h3>Event Codes</h3>
          <span>Stored at project.event_code</span>
        </div>
        <button className="primary" type="button" onClick={onAdd}><Plus size={16} /> Add Event Code</button>
      </div>
      <div className="table-header event-row">
        <span>Code</span>
        <span>Name</span>
        <span>Description</span>
        <span />
      </div>
      <div className="code-list">
        {rows.map((row) => (
          <div className="row event-row" key={row.id}>
            <input value={row.code} placeholder="USER_CREATED" onChange={(event) => update(row.id, { code: event.target.value })} />
            <input value={row.name} placeholder="User Created" onChange={(event) => update(row.id, { name: event.target.value })} />
            <input value={row.description} placeholder="When this event is emitted" onChange={(event) => update(row.id, { description: event.target.value })} />
            <IconButton label="Remove event code" onClick={() => onChange(rows.filter((item) => item.id !== row.id))} />
          </div>
        ))}
        {rows.length === 0 && <p className="empty code-empty">No event codes yet.</p>}
      </div>
    </section>
  );
}

function ErrorCodesPage({ rows, onAdd, onChange }: { rows: ErrorCode[]; onAdd: () => void; onChange: (rows: ErrorCode[]) => void }) {
  const update = (id: string, patch: Partial<ErrorCode>) => onChange(rows.map((row) => row.id === id ? { ...row, ...patch } : row));

  return (
    <section className="panel code-page">
      <div className="panel-title page-title">
        <div>
          <h3>Error Codes</h3>
          <span>Stored at project.error_code</span>
        </div>
        <button className="primary" type="button" onClick={onAdd}><Plus size={16} /> Add Error Code</button>
      </div>
      <div className="table-header error-row">
        <span>HTTP</span>
        <span>Code</span>
        <span>Message</span>
        <span>Description</span>
        <span />
      </div>
      <div className="code-list">
        {rows.map((row) => (
          <div className="row error-row" key={row.id}>
            <input value={row.status} placeholder="400" onChange={(event) => update(row.id, { status: event.target.value })} />
            <input value={row.code} placeholder="040001" onChange={(event) => update(row.id, { code: event.target.value })} />
            <input value={row.message} placeholder="invalid request" onChange={(event) => update(row.id, { message: event.target.value })} />
            <input value={row.description} placeholder="When this error is returned" onChange={(event) => update(row.id, { description: event.target.value })} />
            <IconButton label="Remove error code" onClick={() => onChange(rows.filter((item) => item.id !== row.id))} />
          </div>
        ))}
        {rows.length === 0 && <p className="empty code-empty">No error codes yet.</p>}
      </div>
    </section>
  );
}

function ServiceEditor({
  spec,
  showPreview,
  onTogglePreview,
  onChange,
}: {
  spec: ServiceSpec;
  showPreview: boolean;
  onTogglePreview: () => void;
  onChange: (updater: (spec: ServiceSpec) => ServiceSpec) => void;
}) {
  const patch = (partial: Partial<ServiceSpec>) => onChange((current) => ({ ...current, ...partial }));
  const addField = (key: "requestFields" | "responseFields", location: RequestLocation | ResponseLocation) => {
    onChange((current) => ({
      ...current,
      [key]: [...current[key], { id: uid(), location, field: "", type: "", require: "YES", description: "" }],
    }));
  };
  const updateField = (key: "requestFields" | "responseFields", id: string, patchRow: Partial<FieldRow>) => {
    onChange((current) => ({ ...current, [key]: current[key].map((row) => row.id === id ? { ...row, ...patchRow } : row) }));
  };
  const removeField = (key: "requestFields" | "responseFields", id: string) => {
    onChange((current) => ({ ...current, [key]: current[key].filter((row) => row.id !== id) }));
  };

  return (
    <>
      <div className="panel-title">
        <h3>Service Spec</h3>
        <button
          className={showPreview ? "switch-button on" : "switch-button"}
          type="button"
          aria-pressed={showPreview}
          onClick={onTogglePreview}
        >
          <span className="switch-track"><span className="switch-thumb" /></span>
          Preview
        </button>
      </div>
      <Fieldset title="Spec Header">
        <div className="grid two">
          <Label text="Name"><input value={spec.name} onChange={(event) => patch({ name: event.target.value })} /></Label>
          <Label text="Method">
            <select value={spec.method} onChange={(event) => patch({ method: event.target.value as HttpMethod })}>
              {METHODS.map((method) => <option key={method}>{method}</option>)}
            </select>
          </Label>
          <Label text="URL"><input value={spec.url} onChange={(event) => patch({ url: event.target.value })} /></Label>
          <Label text="Authentication"><input value={spec.authentication} onChange={(event) => patch({ authentication: event.target.value })} /></Label>
          <Label text="Description" wide><textarea value={spec.description} onChange={(event) => patch({ description: event.target.value })} /></Label>
        </div>
      </Fieldset>

      <Fieldset title="Request">
        <Label text="Example JSON or path/query"><textarea value={spec.requestExample} onChange={(event) => patch({ requestExample: event.target.value })} /></Label>
        <FieldRows rows={spec.requestFields} locations={REQUEST_LOCATIONS} addLabel="Add Request Field" onAdd={(location) => addField("requestFields", location)} onUpdate={(id, row) => updateField("requestFields", id, row)} onRemove={(id) => removeField("requestFields", id)} />
      </Fieldset>

      <Fieldset title="Sequence Diagram">
        <Label text="Mermaid"><textarea className="tall" value={spec.sequence} onChange={(event) => patch({ sequence: event.target.value })} /></Label>
      </Fieldset>

      <Fieldset title="Errors">
        {spec.errors.map((row) => (
          <div className="row error-row" key={row.id}>
            <input value={row.status} placeholder="HTTP" onChange={(event) => onChange((current) => ({ ...current, errors: current.errors.map((item) => item.id === row.id ? { ...item, status: event.target.value } : item) }))} />
            <input value={row.code} placeholder="040001" onChange={(event) => onChange((current) => ({ ...current, errors: current.errors.map((item) => item.id === row.id ? { ...item, code: event.target.value } : item) }))} />
            <input value={row.message} placeholder="message" onChange={(event) => onChange((current) => ({ ...current, errors: current.errors.map((item) => item.id === row.id ? { ...item, message: event.target.value } : item) }))} />
            <input value={row.description} placeholder="when this happens" onChange={(event) => onChange((current) => ({ ...current, errors: current.errors.map((item) => item.id === row.id ? { ...item, description: event.target.value } : item) }))} />
            <IconButton label="Remove error" onClick={() => onChange((current) => ({ ...current, errors: current.errors.filter((item) => item.id !== row.id) }))} />
          </div>
        ))}
        <button type="button" onClick={() => onChange((current) => ({ ...current, errors: [...current.errors, { id: uid(), status: "", code: "", message: "", description: "" }] }))}><Plus size={16} /> Add Error</button>
      </Fieldset>

      <Fieldset title="Response">
        <Label text="Example JSON"><textarea value={spec.responseExample} onChange={(event) => patch({ responseExample: event.target.value })} /></Label>
        <FieldRows rows={spec.responseFields} locations={RESPONSE_LOCATIONS} addLabel="Add Response Field" onAdd={(location) => addField("responseFields", location)} onUpdate={(id, row) => updateField("responseFields", id, row)} onRemove={(id) => removeField("responseFields", id)} />
      </Fieldset>

      <MappingEditor sections={spec.mappingSections} onChange={(mappingSections) => patch({ mappingSections })} />
    </>
  );
}

function FieldRows({
  rows,
  locations,
  addLabel,
  onAdd,
  onUpdate,
  onRemove,
}: {
  rows: FieldRow[];
  locations: (RequestLocation | ResponseLocation)[];
  addLabel: string;
  onAdd: (location: RequestLocation | ResponseLocation) => void;
  onUpdate: (id: string, row: Partial<FieldRow>) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="field-groups">
      {locations.map((location) => (
        <div className="subgroup" key={location}>
          <div className="subgroup-title">
            <h4>{location}</h4>
            <button type="button" onClick={() => onAdd(location)}><Plus size={16} /> {addLabel}</button>
          </div>
          {rows.filter((row) => row.location === location).map((row) => (
            <div className="row field-row" key={row.id}>
              <input value={row.field} placeholder="field_name" onChange={(event) => onUpdate(row.id, { field: event.target.value })} />
              <input value={row.type} placeholder="type" onChange={(event) => onUpdate(row.id, { type: event.target.value })} />
              <select value={row.require} onChange={(event) => onUpdate(row.id, { require: event.target.value as RequireFlag })}>
                {REQUIRED.map((option) => <option key={option}>{option}</option>)}
              </select>
              <input value={row.description} placeholder="validation, enum values, meaning" onChange={(event) => onUpdate(row.id, { description: event.target.value })} />
              <IconButton label="Remove field" onClick={() => onRemove(row.id)} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function MappingEditor({ sections, onChange }: { sections: MappingSection[]; onChange: (sections: MappingSection[]) => void }) {
  return (
    <Fieldset title="Mapping">
      <button type="button" onClick={() => onChange([...sections, { id: uid(), name: "", rows: [] }])}><Plus size={16} /> Add Mapping Section</button>
      {sections.map((section) => (
        <div className="subgroup" key={section.id}>
          <div className="subgroup-title">
            <input value={section.name} placeholder="Mapping section name" onChange={(event) => onChange(sections.map((item) => item.id === section.id ? { ...item, name: event.target.value } : item))} />
            <IconButton label="Remove mapping section" onClick={() => onChange(sections.filter((item) => item.id !== section.id))} />
          </div>
          {section.rows.map((row) => (
            <div className="row mapping-row" key={row.id}>
              <input value={row.target} placeholder="target_field" onChange={(event) => onChange(sections.map((item) => item.id === section.id ? { ...item, rows: item.rows.map((entry) => entry.id === row.id ? { ...entry, target: event.target.value } : entry) } : item))} />
              <input value={row.from} placeholder="source_field" onChange={(event) => onChange(sections.map((item) => item.id === section.id ? { ...item, rows: item.rows.map((entry) => entry.id === row.id ? { ...entry, from: event.target.value } : entry) } : item))} />
              <input value={row.description} placeholder="transform, default, enum, generated value" onChange={(event) => onChange(sections.map((item) => item.id === section.id ? { ...item, rows: item.rows.map((entry) => entry.id === row.id ? { ...entry, description: event.target.value } : entry) } : item))} />
              <IconButton label="Remove mapping row" onClick={() => onChange(sections.map((item) => item.id === section.id ? { ...item, rows: item.rows.filter((entry) => entry.id !== row.id) } : item))} />
            </div>
          ))}
          <button type="button" onClick={() => onChange(sections.map((item) => item.id === section.id ? { ...item, rows: [...item.rows, { id: uid(), target: "", from: "", description: "" }] } : item))}><Plus size={16} /> Add Mapping Row</button>
        </div>
      ))}
    </Fieldset>
  );
}

function Fieldset({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="fieldset"><h3>{title}</h3>{children}</section>;
}

function Label({ text, wide, children }: { text: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={wide ? "wide-label" : ""}><span>{text}</span>{children}</label>;
}

function IconButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button className="icon-button" type="button" aria-label={label} title={label} onClick={onClick}><Trash2 size={16} /></button>;
}

createRoot(document.getElementById("root")!).render(<App />);
