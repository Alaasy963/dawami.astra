import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  saveOfflineProfile,
  readOfflineProfile,
  clearOfflineProfile,
} from "../apps/web/offline-profile";
const profile = {
  member: { id: "member", company_id: "company" },
  deviceBound: true,
  expires: 2000,
  name: "Test",
  csrf: "secret",
  memberships: [{ id: "other" }],
};
const storage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => data.set(k, v),
    removeItem: (k: string) => data.delete(k),
  };
};
beforeEach(() => {
  vi.stubGlobal("localStorage", storage());
  vi.stubGlobal("sessionStorage", storage());
});
afterEach(() => vi.unstubAllGlobals());
it("restores a bound unexpired profile after the tab session is lost without CSRF or other memberships", () => {
  saveOfflineProfile(profile, "device");
  vi.stubGlobal("sessionStorage", storage());
  const restored = readOfflineProfile("device", 1000);
  expect(restored.member.id).toBe("member");
  expect(restored.csrf).toBeUndefined();
  expect(restored.memberships).toEqual([]);
  expect(localStorage.getItem("dawami-offline-profile")).not.toContain(
    "secret",
  );
});
it.each([
  { expires: 500 },
  { owner: true },
  { mustChange: true },
  { locked: true },
  { deviceBound: false },
])("rejects ineligible offline profile %j", (changes) => {
  saveOfflineProfile({ ...profile, ...changes }, "device");
  expect(readOfflineProfile("device", 1000)).toBeNull();
});
it("rejects a changed device and clears a signed-out profile", () => {
  saveOfflineProfile(profile, "old");
  expect(readOfflineProfile("new", 1000)).toBeNull();
  saveOfflineProfile(profile, "device");
  clearOfflineProfile();
  expect(readOfflineProfile("device", 1000)).toBeNull();
});
