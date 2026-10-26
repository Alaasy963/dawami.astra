import { afterEach, expect, it, vi } from "vitest";
import { app } from "../apps/api/index";
import { api } from "../apps/web/lib";
afterEach(() => vi.unstubAllGlobals());
it("rejects invalid signup fields with actionable messages before touching storage", async () => {
  const response = await app.request(
    "https://example.test/api/auth/signup",
    {
      method: "POST",
      headers: {
        Origin: "https://example.test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        company: " ",
        name: "a",
        phone: "0912345678",
        pin: "short",
        currency: "SYP",
        device: "a".repeat(40),
      }),
    },
    {} as any,
  );
  expect(response.status).toBe(400);
  const data = (await response.json()) as any;
  expect(data.issues.map((issue: any) => issue.path[0]).sort()).toEqual([
    "company",
    "name",
    "phone",
    "pin",
  ]);
  expect(
    data.issues.find((issue: any) => issue.path[0] === "phone").message,
  ).toContain("رمز البلد");
  expect(JSON.stringify(data)).not.toContain("0912345678");
  expect(JSON.stringify(data)).not.toContain("short");
});
it("preserves per-field validation messages for the form", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: "راجع الحقول المطلوبة",
            issues: [{ path: ["phone"], message: "رقم غير صالح" }],
          }),
          { status: 400 },
        ),
    ),
  );
  await expect(api("/auth/signup", {})).rejects.toMatchObject({
    status: 400,
    fieldErrors: { phone: "رقم غير صالح" },
  });
});
