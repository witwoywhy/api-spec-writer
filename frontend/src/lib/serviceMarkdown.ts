import type { ErrorCode, FieldRow, RequestLocation, ResponseLocation, ServiceSpec } from "../domain";

const REQUEST_LOCATIONS: RequestLocation[] = ["BODY", "HEADER", "PATH PARAM", "QUERY PARAM", "FORM-DATA", "X-WWW-FORM-URLENCODED"];
const RESPONSE_LOCATIONS: ResponseLocation[] = ["HEADER", "BODY"];

function escapePipe(value: unknown) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", "<br>");
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

export function serviceMarkdown(spec: ServiceSpec, projectErrorCodes: ErrorCode[] = []) {
  const serviceType = spec.type ?? "http";
  const requestParts = ["## Request"];
  for (const location of REQUEST_LOCATIONS) {
    const rows = spec.requestFields.filter((row) => row.location === location);
    if (rows.length > 0) requestParts.push(`\n### ${location}\n\n${fieldTable(rows)}`);
  }
  for (const example of requestExamples(spec)) {
    const requestBlock = example.value.trim().startsWith("{") || example.value.trim().startsWith("[") ? "json" : "text";
    requestParts.push(`\n### Example: ${escapePipe(example.name || "Default")}\n\n\`\`\`${requestBlock}\n${example.value.trim()}\n\`\`\``);
  }

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
  if (spec.responseFields.some((row) => row.location === "BODY")) {
    for (const example of responseExamples(spec)) {
      const responseBlock = example.value.trim().startsWith("{") || example.value.trim().startsWith("[") ? "json" : "text";
      responseParts.push(`\n### Example: ${escapePipe(example.status ?? "200")} ${escapePipe(example.name || "Success")}\n\n\`\`\`${responseBlock}\n${example.value.trim()}\n\`\`\``);
    }
  }

  const errorRows = spec.errors.length
    ? spec.errors.map((row) => {
        const error = resolveServiceError(row, projectErrorCodes);
        return `| ${escapePipe(error.status)} | ${code(escapePipe(error.code))} | ${escapePipe(error.message_en || error.message_th)} | ${escapePipe(error.description_en || error.description_th)} |`;
      }).join("\n")
    : "|  |  |  |  |";

  const mapping = spec.mappingSections.filter((section) => section.rows.length > 0);
  const mappingParts = mapping.length
    ? [
        "## Field to Field Mapping",
        ...mapping.map((section) => {
          const rows = section.rows.map((row) => `| ${code(escapePipe(row.target))} | ${code(escapePipe(row.from))} | ${escapePipe(row.description)} |`).join("\n");
          return `\n### ${escapePipe(section.name || "Mapping")}\n\n| Target | From | Description |\n|--------|------|-------------|\n${rows}`;
        }),
      ].join("\n")
    : "## Field to Field Mapping\n\n_None._";
  const headerRows = [
    `| Name | ${escapePipe(spec.name || "[SERVICE OR USE CASE NAME]")} |`,
    `| Type | ${escapePipe(serviceType)} |`,
    ...(serviceType === "http"
      ? [
          `| Method | ${spec.method || "[HTTP METHOD]"} |`,
          `| URL | ${code(escapePipe(spec.url || "[PATH]"))} |`,
        ]
      : []),
    `| Authentication | ${escapePipe(spec.authentication || "[AUTH REQUIREMENT]")} |`,
    `| Description | ${escapePipe(spec.description || "[WHAT THIS API DOES AND WHY]")} |`,
  ].join("\n");

  return `# ${spec.name || "[SERVICE OR USE CASE NAME]"}

## Header

| Field | Value |
|-------|-------|
${headerRows}

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

function resolveServiceError(row: ErrorCode, projectErrorCodes: ErrorCode[]) {
  return projectErrorCodes.find((errorCode) => errorCode.id === row.errorCodeId)
    ?? projectErrorCodes.find((errorCode) => errorCode.code === row.code)
    ?? row;
}

function requestExamples(spec: ServiceSpec) {
  const examples = (spec.requestExamples ?? []).filter((example) => example.value.trim());
  if (examples.length > 0) return examples.slice().reverse();
  return spec.requestExample.trim() ? [{ id: "legacy-request-example", name: "Default", value: spec.requestExample }] : [];
}

function responseExamples(spec: ServiceSpec) {
  const examples = (spec.responseExamples ?? []).filter((example) => example.value.trim());
  if (examples.length > 0) return examples.slice().reverse();
  return spec.responseExample.trim() ? [{ id: "legacy-response-example", name: "Success", status: "200", value: spec.responseExample }] : [];
}
