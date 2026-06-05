import type { ErrorCode, Project } from "../../domain";
import { serviceOpenApi } from "../../lib/openApiSpec";
import { serviceMarkdown } from "../../lib/serviceMarkdown";
import { dbSchemaMarkdown } from "./dbSchemaPreview";
import { escapeMarkdownHeading, escapePipe } from "./markdownHtml";
import { safeFileName } from "./exportActions";

export function projectSpecMarkdown(project: Project) {
  return [
    `# ${project.name}`,
    eventCodesMarkdown(project),
    errorCodesMarkdown(project),
    dbSchemaMarkdown(project),
    "## Services",
    ...project.services.map((service) => serviceMarkdown(service.spec, project.error_code)),
  ].filter((section) => section.trim()).join("\n\n");
}

export function eventCodesMarkdown(project: Project) {
  if (project.event_code.length === 0) return "## Event Codes\n\nNo event codes.";
  return [
    "## Event Codes",
    "| Code | Name | Description |",
    "|------|------|-------------|",
    ...project.event_code.map((row) => `| ${escapePipe(row.code)} | ${escapePipe(row.name)} | ${escapePipe(row.description)} |`),
  ].join("\n");
}

export function errorCodesMarkdown(project: Project) {
  if (project.error_code.length === 0) return "## Error Codes\n\nNo error codes.";
  return [
    "## Error Codes",
    "| Domain | HTTP | Code | Description | Message EN | Description EN | Message TH | Description TH |",
    "|--------|------|------|-------------|------------|----------------|------------|----------------|",
    ...project.error_code.map((row) => [
      escapePipe(row.domain),
      escapePipe(row.status),
      escapePipe(row.code),
      escapePipe(row.description),
      escapePipe(row.message_en),
      escapePipe(row.description_en),
      escapePipe(row.message_th),
      escapePipe(row.description_th),
    ].join(" | ")).map((cells) => `| ${cells} |`),
  ].join("\n");
}

export function errorCodesPreviewMarkdownForProject(project: Project) {
  if (project.error_code.length === 0) return "## Error Codes\n\nNo error codes.";
  const groupsByDomain = new Map<string, ErrorCode[]>();
  for (const row of project.error_code) {
    const domain = row.domain || "general";
    const groupRows = groupsByDomain.get(domain);
    if (groupRows) groupRows.push(row);
    else groupsByDomain.set(domain, [row]);
  }
  return [
    "## Error Codes",
    ...Array.from(groupsByDomain, ([domain, rows]) => [
      `### ${escapeMarkdownHeading(domain)}`,
      "| HTTP | Code | Message EN | Description EN | Message TH | Description TH |",
      "|------|------|------------|----------------|------------|----------------|",
      ...rows.map((row) => [
        escapePipe(row.status),
        escapePipe(row.code),
        escapePipe(row.message_en),
        escapePipe(row.description_en),
        escapePipe(row.message_th),
        escapePipe(row.description_th),
      ].join(" | ")).map((cells) => `| ${cells} |`),
    ].join("\n")),
  ].join("\n\n");
}

export function projectOpenApi(project: Project) {
  return {
    openapi: "3.0.3",
    info: {
      title: project.name,
      version: "1.0.0",
    },
    paths: mergeProjectOpenApiPaths(project),
    "x-event-codes": project.event_code,
    "x-error-codes": project.error_code,
    "x-db-schema": project.db_schema,
    "x-services": project.services.map((service) => ({
      id: service.id,
      name: service.name,
      type: service.spec.type,
      updatedAt: service.updatedAt,
    })),
  };
}

function mergeProjectOpenApiPaths(project: Project) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const service of project.services) {
    const document = serviceOpenApi(service.spec, project.error_code);
    for (const [path, methods] of Object.entries(document.paths ?? {})) {
      for (const [method, operation] of Object.entries(methods as Record<string, unknown>)) {
        const targetPath = paths[path]?.[method] ? uniqueOpenApiPath(paths, path, service.name) : path;
        paths[targetPath] ??= {};
        paths[targetPath][method] = {
          ...(operation as Record<string, unknown>),
          "x-service-id": service.id,
          "x-service-name": service.name,
          ...(targetPath === path ? {} : { "x-original-path": path }),
        };
      }
    }
  }
  return paths;
}

function uniqueOpenApiPath(paths: Record<string, unknown>, path: string, serviceName: string) {
  const base = `${path.replace(/\/$/, "")}/_${safeFileName(serviceName)}`;
  let candidate = base;
  let index = 2;
  while (paths[candidate]) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  return candidate;
}
