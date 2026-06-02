import type { ErrorCode, EventCode } from "./code";
import type { DbTable } from "./dbSchema";
import type { Service } from "./service";

export type Project = {
  id: string;
  name: string;
  event_code: EventCode[];
  error_code: ErrorCode[];
  db_schema: DbTable[];
  services: Service[];
  createdAt: string;
  updatedAt: string;
};
