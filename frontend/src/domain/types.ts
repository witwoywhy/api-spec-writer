export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type RequireFlag = "YES" | "NO";
export type RequestLocation = "HEADER" | "PATH PARAM" | "QUERY PARAM" | "BODY";
export type ResponseLocation = "HEADER" | "BODY";

export type FieldRow = {
  id: string;
  location: RequestLocation | ResponseLocation;
  field: string;
  type: string;
  require: RequireFlag;
  description: string;
};

export type ErrorCode = {
  id: string;
  status: string;
  code: string;
  message: string;
  description: string;
};

export type EventCode = {
  id: string;
  code: string;
  name: string;
  description: string;
};

export type MappingRow = {
  id: string;
  target: string;
  from: string;
  description: string;
};

export type MappingSection = {
  id: string;
  name: string;
  rows: MappingRow[];
};

export type ServiceSpec = {
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

export type Service = {
  id: string;
  name: string;
  spec: ServiceSpec;
  updatedAt: string;
};

export type Project = {
  id: string;
  name: string;
  event_code: EventCode[];
  error_code: ErrorCode[];
  services: Service[];
  createdAt: string;
  updatedAt: string;
};

export type StoreDocument = {
  schemaVersion: 1;
  projects: Project[];
};
