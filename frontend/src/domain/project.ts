import type { ErrorCode, EventCode } from "./code";
import type { DbTable } from "./dbSchema";
import type { Service, ServiceFolder } from "./service";

export type Project = {
  id: string;
  name: string;
  event_code: EventCode[];
  error_code: ErrorCode[];
  db_schema: DbTable[];
  service_folders: ServiceFolder[];
  services: Service[];
  createdAt: string;
  updatedAt: string;
};
