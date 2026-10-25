import { describe, it, expect } from "vitest";
import {
  distance,
  addSubscriptionMonths,
  canReset,
  canRebind,
  activeCompany,
  hashPin,
  verifyPin,
} from "../packages/domain/security";
describe("tenant security policies", () => {
  it("restricts reset hierarchy", () => {
    expect(canReset("manager", "gm")).toBe(false);
    expect(canReset("am", "manager")).toBe(false);
    expect(canReset("gm", "am")).toBe(true);
    expect(canReset("owner", "gm")).toBe(true);
    expect(canReset("worker", "worker")).toBe(false);
  });
  it("requires owner for GM device rebinding", () => {
    expect(canRebind("gm", "gm")).toBe(false);
    expect(canRebind("owner", "gm")).toBe(true);
  });
  it("locks at expiry even before cron executes", () => {
    expect(activeCompany({ status: "trial", ends_at: 1000 }, 1000)).toBe(false);
    expect(activeCompany({ status: "suspended", ends_at: 9999 }, 1000)).toBe(
      false,
    );
  });
  it("computes server geofence distances", () => {
    expect(distance(33.5, 36.2, 33.5, 36.2)).toBe(0);
    expect(distance(0, 0, 0, 1)).toBeGreaterThan(111000);
    expect(distance(0, 0, 0, 1)).toBeLessThan(112000);
  });
  it("salts scrypt hashes and rejects wrong PIN", async () => {
    const a = await hashPin("test-secret-123"),
      b = await hashPin("test-secret-123");
    expect(a).not.toBe(b);
    expect(await verifyPin("test-secret-123", a)).toBe(true);
    expect(await verifyPin("wrong", a)).toBe(false);
  });
});

it("clamps subscription renewal at month and leap-year boundaries", () => {
  expect(
    new Date(
      addSubscriptionMonths(Date.parse("2026-01-31T12:30:00Z"), 1),
    ).toISOString(),
  ).toBe("2026-02-28T12:30:00.000Z");
  expect(
    new Date(
      addSubscriptionMonths(Date.parse("2024-02-29T12:30:00Z"), 12),
    ).toISOString(),
  ).toBe("2025-02-28T12:30:00.000Z");
});
