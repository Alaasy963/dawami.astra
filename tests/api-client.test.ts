import { afterEach, expect, it, vi } from "vitest";
import { api, ApiError } from "../apps/web/lib";
afterEach(() => vi.unstubAllGlobals());
it.each([401, 403, 502])(
  "preserves HTTP %s when the response is an HTML error page",
  async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response("<html>Upstream error</html>", { status }),
      ),
    );
    await expect(api("/auth/me")).rejects.toMatchObject({ status });
    await expect(api("/auth/me")).rejects.toBeInstanceOf(ApiError);
  },
);
it.each(["null", "[]", "not-json"])(
  "rejects invalid successful API payload %s without exposing a parser error",
  async (body) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(body)),
    );
    await expect(api("/auth/me")).rejects.toThrow(
      "وصل رد غير صالح من الخادم. جرّب مجدداً.",
    );
  },
);
it("preserves validation details and ignores non-string error bodies", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: { internal: "hidden" },
            issues: [{ path: ["phone"], message: "رقم غير صالح" }],
          }),
          { status: 400 },
        ),
    ),
  );
  await expect(api("/members")).rejects.toMatchObject({
    status: 400,
    message: "تعذّر الاتصال",
    fieldErrors: { phone: "رقم غير صالح" },
  });
});
