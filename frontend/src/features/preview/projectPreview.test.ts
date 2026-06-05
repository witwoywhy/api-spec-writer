import { describe, expect, it } from "vitest";
import type { Project, ServiceSpec } from "../../domain";
import { projectOpenApi } from "./projectPreview";

function spec(name: string, url: string): ServiceSpec {
  return {
    name,
    type: "http",
    method: "POST",
    url,
    authentication: "",
    description: "",
    requestExample: "",
    requestExamples: [],
    requestFields: [],
    sequence: "",
    errors: [],
    responseExample: "",
    responseExamples: [],
    responseFields: [],
    mappingSections: [],
  };
}

describe("project OpenAPI preview", () => {
  it("exports all HTTP services and uniquifies duplicate paths", () => {
    const project: Project = {
      id: "p1",
      name: "Project",
      event_code: [],
      error_code: [],
      db_schema: [],
      service_folders: [],
      createdAt: "1",
      updatedAt: "1",
      services: [
        { id: "s1", name: "Create Transaction", updatedAt: "1", spec: spec("Create Transaction", "/v1/transactions") },
        { id: "s2", name: "Retry Transaction", updatedAt: "1", spec: spec("Retry Transaction", "/v1/transactions") },
      ],
    };

    const document = projectOpenApi(project);

    expect(Object.keys(document.paths)).toEqual(["/v1/transactions", "/v1/transactions/_retry-transaction"]);
  });
});
