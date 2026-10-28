import { describe, expect, it } from "vitest";
import { viewContext } from "../apps/web/view-context";
const member = { id: "member-a", company_id: "company-a", role: "gm" };
describe("navigation across authentication contexts", () => {
  it("replaces a manager-only page when entering as a worker", () => {
    expect(
      viewContext("members", ["dashboard", "attendance", "notifications"], {
        member: { ...member, role: "worker" },
      }).view,
    ).toBe("dashboard");
  });
  it("opens the owner landing page for an attendance deep link", () => {
    expect(
      viewContext("attendance", ["owner", "ownerSettings", "ownerRecovery"], {
        owner: true,
      }).view,
    ).toBe("owner");
  });
  it("keeps a permitted page and its scope stable during refresh", () => {
    const context = viewContext("attendance", ["dashboard", "attendance"], {
      member,
    });
    expect(context.view).toBe("attendance");
    expect(
      viewContext("dashboard", ["dashboard", "attendance"], { member }).scope,
    ).toBe(context.scope);
  });
  it("remounts cached page state for a different company, member, or role", () => {
    const scope = viewContext("dashboard", ["dashboard"], { member }).scope;
    for (const change of [
      { company_id: "company-b" },
      { id: "member-b" },
      { role: "worker" },
    ]) {
      expect(
        viewContext("dashboard", ["dashboard"], {
          member: { ...member, ...change },
        }).scope,
      ).not.toBe(scope);
    }
    expect(viewContext("owner", ["owner"], { owner: true }).scope).not.toBe(
      scope,
    );
  });
});
