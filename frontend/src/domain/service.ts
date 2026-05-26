import type { ErrorCode } from "./code";
import type { FieldRow } from "./field";
import type { MappingSection } from "./mapping";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type ServiceType = "http" | "publisher" | "subscriber" | "scheduler";

export type ServiceSpec = {
  name: string;
  type: ServiceType;
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

export type Service = {
  id: string;
  name: string;
  spec: ServiceSpec;
  updatedAt: string;
};
