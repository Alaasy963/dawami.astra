import { afterEach, expect, it, vi } from "vitest";
import { signOut, setCsrf } from "../apps/web/lib";
afterEach(() => vi.unstubAllGlobals());
it("signs out with POST and the current CSRF token even without a body", async () => {
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  setCsrf("test-csrf");
  await expect(signOut()).resolves.toEqual({ ok: true });
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/auth/logout",
    expect.objectContaining({
      method: "POST",
      credentials: "same-origin",
      headers: expect.objectContaining({ "X-CSRF-Token": "test-csrf" }),
    }),
  );
});
it("does not report success when the server rejects sign-out", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "CSRF rejected" }), {
          status: 403,
        }),
    ),
  );
  await expect(signOut()).rejects.toMatchObject({ status: 403 });
});
