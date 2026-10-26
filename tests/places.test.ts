import { afterEach, expect, it, vi } from "vitest";
import { searchPlaces } from "../apps/web/places";
afterEach(() => vi.unstubAllGlobals());
it("uses browser Photon fallback when the Worker cannot reach the provider", async () => {
  const mock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "unavailable" }), { status: 503 }),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          features: [
            {
              geometry: { coordinates: [13.4, 52.5] },
              properties: { name: "Unter den Linden", city: "Berlin" },
            },
          ],
        }),
      ),
    );
  vi.stubGlobal("fetch", mock);
  expect(await searchPlaces("Unter den Linden Berlin")).toEqual({
    items: [{ lng: 13.4, lat: 52.5, label: "Unter den Linden، Berlin" }],
  });
  expect(mock.mock.calls[1][0].hostname).toBe("photon.komoot.io");
  expect(mock.mock.calls[1][1]).toMatchObject({
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
});
it.each([401, 403, 429])("does not bypass HTTP %s", async (status) => {
  const mock = vi.fn(
    async () => new Response(JSON.stringify({ error: "blocked" }), { status }),
  );
  vi.stubGlobal("fetch", mock);
  await expect(searchPlaces("Berlin")).rejects.toMatchObject({ status });
  expect(mock).toHaveBeenCalledTimes(1);
});
