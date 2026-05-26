import type { Page } from "../components/ProjectTree";

export type AppRoute = {
  page: Page;
  projectId: string;
  serviceId: string;
};

export function parseAppRoute(pathname: string): AppRoute {
  const parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] !== "projects") return { page: "services", projectId: "", serviceId: "" };

  const projectId = parts[1] ?? "";
  if (parts[2] === "event-code") return { page: "eventCodes", projectId, serviceId: "" };
  if (parts[2] === "error-code") return { page: "errorCodes", projectId, serviceId: "" };
  if (parts[2] === "services") return { page: "services", projectId, serviceId: parts[3] ?? "" };
  return { page: "services", projectId, serviceId: "" };
}

export function buildAppPath(route: AppRoute) {
  if (!route.projectId) return "/";
  const project = encodeURIComponent(route.projectId);
  if (route.page === "eventCodes") return `/projects/${project}/event-code`;
  if (route.page === "errorCodes") return `/projects/${project}/error-code`;
  if (route.serviceId) return `/projects/${project}/services/${encodeURIComponent(route.serviceId)}`;
  return `/projects/${project}`;
}
