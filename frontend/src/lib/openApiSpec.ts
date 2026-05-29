import type { ErrorCode, ExampleCase, FieldRow, ServiceSpec } from "../domain";
import { parseJsonFields } from "./jsonFieldParser";

type OpenApiSchema = {
  type?: string;
  description?: string;
  nullable?: boolean;
  items?: OpenApiSchema;
  properties?: Record<string, OpenApiSchema>;
  required?: string[];
};

type OpenApiParameter = {
  name: string;
  in: "header" | "path" | "query";
  required: boolean;
  description?: string;
  schema: OpenApiSchema;
};

const HTTP_STATUS_TEXT: Record<string, string> = {
  "200": "OK",
  "201": "Created",
  "202": "Accepted",
  "204": "No Content",
  "400": "Bad Request",
  "401": "Unauthorized",
  "403": "Forbidden",
  "404": "Not Found",
  "409": "Conflict",
  "422": "Unprocessable Content",
  "429": "Too Many Requests",
  "500": "Internal Server Error",
  "502": "Bad Gateway",
  "503": "Service Unavailable",
};

export function serviceOpenApi(spec: ServiceSpec, projectErrorCodes: ErrorCode[] = []) {
  const method = (spec.method || "GET").toLowerCase();
  const path = spec.url || "/";
  const requestExamples = exampleCases(spec.requestExamples, spec.requestExample);
  const responseExamples = exampleCases(spec.responseExamples, spec.responseExample, "Success");
  const requestBodyFields = bodyFieldsOrExample(spec.requestFields, requestExamples);
  const responseBodyFields = bodyFieldsOrExample(spec.responseFields, responseExamples);
  const operation: Record<string, unknown> = {
    summary: spec.name,
    description: spec.description,
    parameters: parameters(spec.requestFields),
    responses: responses(spec, responseBodyFields),
  };

  if (requestBodyFields.length > 0 || requestExamples.length > 0) {
    const contentType = requestContentType(spec.requestFields);
    operation.requestBody = {
      required: requestBodyFields.some((row) => row.require === "YES"),
      content: {
        [contentType]: {
          schema: schemaFromFields(requestBodyFields),
          "x-fields": requestBodyFields,
          examples: examplesObject(requestExamples),
        },
      },
    };
  }

  return {
    openapi: "3.0.3",
    info: {
      title: spec.name || "API Spec",
      version: "1.0.0",
      description: spec.description,
    },
    paths: spec.type === "http"
      ? {
          [path]: {
            [method]: operation,
          },
        }
      : {},
    "x-service-type": spec.type,
  };
}

function requestContentType(fields: FieldRow[]) {
  if (fields.some((row) => row.location === "FORM-DATA")) return "multipart/form-data";
  if (fields.some((row) => row.location === "X-WWW-FORM-URLENCODED")) return "application/x-www-form-urlencoded";
  return "application/json";
}

function parameters(fields: FieldRow[]): OpenApiParameter[] {
  return fields.flatMap((row) => {
    const location = parameterLocation(row.location);
    if (!location) return [];
    return [{
      name: row.field,
      in: location,
      required: location === "path" ? true : row.require === "YES",
      description: row.description,
      schema: primitiveSchema(row.type),
    }];
  });
}

function bodyFieldsOrExample(fields: FieldRow[], examples: ExampleCase[]) {
  const bodyFields = fields.filter((row) => row.location === "BODY" || row.location === "FORM-DATA" || row.location === "X-WWW-FORM-URLENCODED");
  if (bodyFields.length > 0) return bodyFields;

  for (const example of examples) {
    try {
      const parsedFields = parseJsonFields(example.value, "BODY");
      if (parsedFields.length > 0) return parsedFields;
    } catch {
      // Invalid examples are still rendered as examples; they just cannot infer schema.
    }
  }

  return [];
}

function parameterLocation(location: FieldRow["location"]) {
  if (location === "HEADER") return "header";
  if (location === "PATH PARAM") return "path";
  if (location === "QUERY PARAM") return "query";
  return null;
}

function responses(spec: ServiceSpec, responseBodyFields: FieldRow[]) {
  const entries: Record<string, unknown> = {};
  for (const example of exampleCases(spec.responseExamples, spec.responseExample, "Success")) {
    const status = example.status || "200";
    entries[status] = {
      description: example.name || HTTP_STATUS_TEXT[status] || "Response",
      content: {
        "application/json": {
          schema: schemaFromFields(responseBodyFields),
          "x-fields": responseBodyFields,
          examples: examplesObject([example]),
        },
      },
    };
  }

  if (Object.keys(entries).length === 0) {
    entries["200"] = { description: HTTP_STATUS_TEXT["200"] };
  }

  return entries;
}

function schemaFromFields(fields: FieldRow[]): OpenApiSchema {
  const root: OpenApiSchema = { type: "object", properties: {}, required: [] };
  for (const field of fields) {
    addFieldSchema(root, field.field, field);
  }
  if (root.required?.length === 0) delete root.required;
  return root;
}

function addFieldSchema(root: OpenApiSchema, path: string, field: FieldRow) {
  const parts = path.split(".").filter(Boolean);
  let current = root;
  for (const [index, rawPart] of parts.entries()) {
    const isArray = rawPart.endsWith("[]");
    const name = rawPart.replace(/\[\]$/, "");
    const isLeaf = index === parts.length - 1;
    current.properties ??= {};

    if (isLeaf) {
      current.properties[name] = isArray ? { type: "array", items: primitiveSchema(field.type.replace(/^array of /i, "")), description: field.description } : { ...primitiveSchema(field.type), description: field.description };
      if (field.require === "YES") {
        current.required ??= [];
        if (!current.required.includes(name)) current.required.push(name);
      }
      continue;
    }

    current.properties[name] ??= isArray ? { type: "array", items: { type: "object", properties: {}, required: [] } } : { type: "object", properties: {}, required: [] };
    current = isArray ? (current.properties[name].items ??= { type: "object", properties: {}, required: [] }) : current.properties[name];
  }
}

function primitiveSchema(type: string): OpenApiSchema {
  const value = type.toLowerCase().trim();
  if (value.includes("bool")) return { type: "boolean" };
  if (value.includes("number") || value.includes("float") || value.includes("decimal")) return { type: "number" };
  if (value.includes("int")) return { type: "integer" };
  if (value.includes("array")) return { type: "array", items: { type: "string" } };
  if (value.includes("object")) return { type: "object" };
  return { type: "string" };
}

function examplesObject(examples: ExampleCase[]) {
  return Object.fromEntries(examples.filter((example) => example.value.trim()).map((example, index) => [
    safeKey(example.name || `case_${index + 1}`),
    {
      summary: example.status ? `${example.status} ${example.name}` : example.name,
      value: parseExampleValue(example.value),
    },
  ]));
}

function exampleCases(examples: ExampleCase[] | undefined, legacyValue: string, fallbackName = "Default") {
  const rows = (examples ?? []).filter((example) => example.value.trim());
  if (rows.length > 0) return rows.slice().reverse();
  return legacyValue.trim() ? [{ id: "legacy-example", name: fallbackName, value: legacyValue }] : [];
}

function parseExampleValue(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function safeKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "example";
}
