import { afterEach, expect, it, vi } from "vitest";
import { getCurrentLocation } from "../apps/web/geolocation";
afterEach(() => vi.unstubAllGlobals());
it.each([
  [1, "إذن الموقع محظور"],
  [2, "إشارة الموقع غير متاحة"],
  [3, "انتهت مهلة"],
])("explains location failure %s accurately", async (code, message) => {
  vi.stubGlobal("navigator", {
    geolocation: {
      getCurrentPosition: (_ok: unknown, fail: (e: any) => void) =>
        fail({ code }),
    },
  });
  await expect(getCurrentLocation()).rejects.toThrow(String(message));
});
it("handles unsupported geolocation", async () => {
  vi.stubGlobal("navigator", {});
  await expect(getCurrentLocation()).rejects.toThrow("متصفح يدعم");
});
it("requests fresh accurate GPS and preserves the result", async () => {
  const result = { coords: { latitude: 52.5, longitude: 13.4, accuracy: 8 } };
  const request = vi.fn((ok: (p: any) => void) => ok(result));
  vi.stubGlobal("navigator", { geolocation: { getCurrentPosition: request } });
  await expect(getCurrentLocation()).resolves.toBe(result);
  expect(request.mock.calls[0]).toHaveLength(3);
  expect((request.mock.calls[0] as any)[2]).toEqual({
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 0,
  });
});
