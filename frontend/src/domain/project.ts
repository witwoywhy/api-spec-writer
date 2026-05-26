import type { ErrorCode, EventCode } from "./code";
import type { Service } from "./service";

export type Project = {
  id: string;
  name: string;
  event_code: EventCode[];
  error_code: ErrorCode[];
  services: Service[];
  createdAt: string;
  updatedAt: string;
};
