import { describe, expect, it } from "vitest";
import { buildAppPath, parseAppRoute } from "./appRouter";

describe("app router", () => {
  it("round trips service routes", () => {
    const route = { page: "services" as const, projectId: "p1", serviceId: "s1", dbTableId: "" };
    expect(parseAppRoute(buildAppPath(route))).toEqual(route);
  });

  it("round trips DB schema table routes", () => {
    const route = { page: "dbSchema" as const, projectId: "p1", serviceId: "", dbTableId: "table-1" };
    expect(parseAppRoute(buildAppPath(route))).toEqual(route);
  });
});
