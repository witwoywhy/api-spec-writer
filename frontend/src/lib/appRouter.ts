import type { Page } from "../components/ProjectTree";

export type AppRoute = {
  page: Page;
  projectId: string;
  serviceId: string;
  dbTableId: string;
};

export function parseAppRoute(pathname: string): AppRoute {
  const parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] !== "projects") return { page: "services", projectId: "", serviceId: "", dbTableId: "" };

  const projectId = parts[1] ?? "";
  if (parts[2] === "event-code") return { page: "eventCodes", projectId, serviceId: "", dbTableId: "" };
  if (parts[2] === "error-code") return { page: "errorCodes", projectId, serviceId: "", dbTableId: "" };
  if (parts[2] === "db-schema") return { page: "dbSchema", projectId, serviceId: "", dbTableId: parts[3] ?? "" };
  if (parts[2] === "services") return { page: "services", projectId, serviceId: parts[3] ?? "", dbTableId: "" };
  return { page: "services", projectId, serviceId: "", dbTableId: "" };
}

export function buildAppPath(route: AppRoute) {
  if (!route.projectId) return "/";
  const project = encodeURIComponent(route.projectId);
  if (route.page === "eventCodes") return `/projects/${project}/event-code`;
  if (route.page === "errorCodes") return `/projects/${project}/error-code`;
  if (route.page === "dbSchema") {
    if (route.dbTableId) return `/projects/${project}/db-schema/${encodeURIComponent(route.dbTableId)}`;
    return `/projects/${project}/db-schema`;
  }
  if (route.serviceId) return `/projects/${project}/services/${encodeURIComponent(route.serviceId)}`;
  return `/projects/${project}`;
}
