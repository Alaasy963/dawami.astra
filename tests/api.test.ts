import { test, vi, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { app } from "../apps/api/index";
import webpush from "web-push";
import { deliver } from "../apps/api/push";
import { hashPin } from "../packages/domain/security";

test("real API workflow across isolated tenants and scoped recovery", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  for (const file of readdirSync("packages/db/migrations")
    .filter((x) => x.endsWith(".sql"))
    .sort())
    sqlite.exec(readFileSync("packages/db/migrations/" + file, "utf8"));
  class Statement {
    args: any[] = [];
    constructor(public sql: string) {}
    bind(...args: any[]) {
      const next = new Statement(this.sql);
      next.args = args;
      return next;
    }
    async first(column?: string) {
      const row = sqlite.prepare(this.sql).get(...this.args);
      return row ? (column ? row[column] : row) : null;
    }
    async all(options?: any) {
      const prepared = sqlite.prepare(this.sql);
      if (options?.columnNames) prepared.setReturnArrays(true);
      const results = prepared.all(...this.args);
      return { results, success: true, meta: {} };
    }
    async raw() {
      const prepared = sqlite.prepare(this.sql);
      prepared.setReturnArrays(true);
      return prepared.all(...this.args);
    }
    async run() {
      const result = sqlite.prepare(this.sql).run(...this.args);
      return {
        success: true,
        meta: {
          changes: Number(result.changes),
          last_row_id: Number(result.lastInsertRowid),
        },
        results: [],
      };
    }
  }
  const kv = new Map<string, string>();
  const objects = new Map<string, any>();
  const env: any = {
    STORAGE: {
      put: async (key: string, body: any, options: any) =>
        objects.set(key, { body, httpMetadata: options.httpMetadata }),
      get: async (key: string) => objects.get(key) || null,
      delete: async (key: string) => objects.delete(key),
    },
    DB: {
      prepare: (sql: string) => new Statement(sql),
      batch: async (statements: Statement[]) => {
        sqlite.exec("BEGIN");
        try {
          const results = [];
          for (const s of statements) results.push(await s.run());
          sqlite.exec("COMMIT");
          return results;
        } catch (e) {
          sqlite.exec("ROLLBACK");
          throw e;
        }
      },
    },
    SESSIONS: {
      put: async (k: string, v: string) => kv.set(k, v),
      get: async (k: string) => (kv.has(k) ? JSON.parse(kv.get(k)!) : null),
      delete: async (k: string) => kv.delete(k),
    },
    AUTH_LIMIT: { limit: async () => ({ success: true }) },
    PUNCH_LIMIT: { limit: async () => ({ success: true }) },
  };
  vi.stubGlobal("fetch", async (input: any, init: any) =>
    app.fetch(new Request(input, init), env, {
      waitUntil: () => {},
      passThroughOnException: () => {},
    } as any),
  );
  try {
    await import("./integration.mjs");
    const session = JSON.parse(
      readFileSync(".wrangler/test-session.json", "utf8"),
    );
    const origin = "http://127.0.0.1:8787";
    const me = await (
      await fetch(origin + "/api/auth/me", {
        headers: { Cookie: session.cookie },
      })
    ).json();
    const headers = {
      Origin: origin,
      Cookie: session.cookie,
      "X-CSRF-Token": me.csrf,
      "Content-Type": "application/json",
    };
    const originalFetch = globalThis.fetch;
    const placesFetch = vi.fn(
      async (_input: any, _options?: any) =>
        new Response(
          JSON.stringify({
            features: [
              {
                geometry: { coordinates: [36.3, 33.5] },
                properties: { name: "Test street", city: "Test city" },
              },
              {
                geometry: { coordinates: [999, 999] },
                properties: { name: "Invalid" },
              },
            ],
          }),
        ),
    );
    vi.stubGlobal("fetch", placesFetch);
    const placesResponse = await app.request(
      origin + "/api/places/search?q=Test%20city",
      { headers },
      env,
    );
    expect(placesResponse.status).toBe(200);
    expect(await placesResponse.json()).toEqual({
      items: [{ lat: 33.5, lng: 36.3, label: "Test street، Test city" }],
    });
    expect(String(placesFetch.mock.calls[0]?.[0])).toContain("q=Test+city");
    placesFetch.mockImplementation(
      async () => new Response(null, { status: 503 }),
    );
    const unavailablePlaces = await app.request(
      origin + "/api/places/search?q=Test%20city",
      { headers },
      env,
    );
    expect(unavailablePlaces.status).toBe(503);
    vi.stubGlobal("fetch", originalFetch);
    const badOrigin = await fetch(origin + "/api/device/bind", {
      method: "POST",
      headers: { ...headers, Origin: "https://evil.example" },
      body: "{}",
    });
    expect(badOrigin.status).toBe(403);
    const noCsrf = await fetch(origin + "/api/device/bind", {
      method: "POST",
      headers: { ...headers, "X-CSRF-Token": "" },
      body: "{}",
    });
    expect(noCsrf.status).toBe(403);

    const sid = session.cookie.split("=")[1],
      sessionRecord = JSON.parse(kv.get(sid)!);
    sessionRecord.expires = Date.now() + 300000;
    kv.set(sid, JSON.stringify(sessionRecord));
    const renewed = await (
      await fetch(origin + "/api/auth/me", { headers })
    ).json();
    expect(renewed.expires).toBeGreaterThan(Date.now() + 6 * 86400000);
    const unchanged = await (
      await fetch(origin + "/api/auth/me", { headers })
    ).json();
    expect(unchanged.expires).toBe(renewed.expires);
    const invalidLogo = await fetch(origin + "/api/company/logo", {
      method: "PUT",
      headers,
      body: "<svg>not allowed</svg>",
    });
    expect(invalidLogo.status).toBe(400);
    const png = new Uint8Array(24);
    png.set([137, 80, 78, 71, 13, 10, 26, 10]);
    const logo = await fetch(origin + "/api/company/logo", {
      method: "PUT",
      headers,
      body: png,
    });
    expect(logo.status).toBe(200);
    const ownLogo = await fetch(origin + "/api/company/logo", { headers });
    expect(ownLogo.status).toBe(200);
    expect(ownLogo.headers.get("Content-Type")).toBe("image/png");
    const unauthorizedLogo = await fetch(origin + "/api/company/logo");
    expect(unauthorizedLogo.status).toBe(401);
    const oversize = await fetch(origin + "/api/company/logo", {
      method: "PUT",
      headers,
      body: new Uint8Array(256 * 1024 + 1),
    });
    expect(oversize.status).toBe(400);

    const gmIn = {
      id: crypto.randomUUID(),
      action: "in",
      deviceTime: Date.now() - 3600000,
      lat: 33.5138,
      lng: 36.2765,
      accuracy: 8,
      offline: true,
    };
    const gmSend = async (event: any) =>
      await fetch(origin + "/api/attendance/sync", {
        method: "POST",
        headers,
        body: JSON.stringify(event),
      });
    let gmResponse = await gmSend({
      ...gmIn,
      id: crypto.randomUUID(),
      lat: 34,
    });
    expect(gmResponse.status).toBe(400);
    gmResponse = await gmSend({
      ...gmIn,
      id: crypto.randomUUID(),
      deviceTime: Date.now() + 600000,
    });
    expect(gmResponse.status).toBe(400);
    gmResponse = await gmSend(gmIn);
    expect(gmResponse.status).toBe(200);
    expect((await gmResponse.json()).status).toBe("accepted");
    expect(
      sqlite
        .prepare("SELECT in_at FROM attendance_logs WHERE id=?")
        .get(gmIn.id)?.in_at,
    ).toBe(gmIn.deviceTime);
    gmResponse = await gmSend(gmIn);
    expect(gmResponse.status).toBe(200);
    gmResponse = await gmSend({
      ...gmIn,
      id: crypto.randomUUID(),
      action: "out",
      deviceTime: gmIn.deviceTime - 1000,
    });
    expect(gmResponse.status).toBe(409);
    const gmOut = {
      ...gmIn,
      id: crypto.randomUUID(),
      action: "out",
      deviceTime: gmIn.deviceTime + 600000,
    };
    gmResponse = await gmSend(gmOut);
    expect(gmResponse.status).toBe(200);
    expect((await gmResponse.json()).status).toBe("accepted");
    expect(
      sqlite
        .prepare("SELECT out_at FROM attendance_logs WHERE id=?")
        .get(gmIn.id)?.out_at,
    ).toBe(gmOut.deviceTime);
    expect(
      sqlite
        .prepare(
          "SELECT count(*) AS n FROM attendance_reviews WHERE operation_id IN (?,?)",
        )
        .get(gmIn.id, gmOut.id)?.n,
    ).toBe(0);
    sqlite
      .prepare("UPDATE companies SET status='suspended' WHERE id=?")
      .run(session.company);
    const payload = {
      id: crypto.randomUUID(),
      action: "in",
      deviceTime: Date.now(),
      lat: 33.5138,
      lng: 36.2765,
      accuracy: 8,
      offline: true,
    };
    const queued = await fetch(origin + "/api/attendance/sync", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    expect(queued.status).toBe(200);
    expect((await queued.json()).status).toBe("review");
    expect(
      sqlite
        .prepare(
          "SELECT count(*) AS n FROM attendance_logs WHERE membership_id=?",
        )
        .get(session.member)?.n,
    ).toBe(1);
    const blocked = await fetch(origin + "/api/attendance/punch", {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...payload,
        id: crypto.randomUUID(),
        offline: false,
      }),
    });
    expect(blocked.status).toBe(423);
    expect(() =>
      sqlite.exec("UPDATE audit_logs SET reason='tampered'"),
    ).toThrow();
    expect(() => sqlite.exec("DELETE FROM audit_logs")).toThrow();
    env.OWNER_PHONE = "+19999999999";
    env.OWNER_HASH = await hashPin("owner-testing-secret");
    const owner = await fetch(origin + "/api/auth/login", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: env.OWNER_PHONE,
        pin: "owner-testing-secret",
        device: "owner-test-device-1234567890",
      }),
    });
    expect(owner.status).toBe(200);
    const ownerCookie = owner.headers.get("set-cookie")!.split(";")[0];
    const ownerMe = await (
      await fetch(origin + "/api/auth/me", { headers: { Cookie: ownerCookie } })
    ).json();
    const reset = await fetch(
      origin + "/api/owner/companies/" + session.company + "/reset-gm",
      {
        method: "POST",
        headers: {
          Origin: origin,
          Cookie: ownerCookie,
          "X-CSRF-Token": ownerMe.csrf,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          membershipId: session.member,
          pin: "temporary-manager-pin",
          reason: "Verified by platform owner in test",
        }),
      },
    );
    expect(reset.status).toBe(200);
    const audit = sqlite
      .prepare(
        "SELECT * FROM audit_logs WHERE actor='platform-owner' AND action='pin.reset'",
      )
      .all();
    expect(audit).toHaveLength(1);
    expect(audit[0].role).toBe("owner");
    expect(JSON.stringify(audit)).not.toContain("temporary-manager-pin");

    const r1 = crypto.randomUUID(),
      r2 = crypto.randomUUID();
    for (const rid of [r1, r2])
      sqlite
        .prepare(
          "INSERT INTO device_rebind_requests(id,company_id,membership_id,device_hash,reason,created_at) VALUES(?,?,?,?,?,?)",
        )
        .run(
          rid,
          session.company,
          session.member,
          rid,
          "Test rebind race",
          Date.now(),
        );
    sqlite
      .prepare("UPDATE device_rebind_requests SET status='approved' WHERE id=?")
      .run(r1);
    expect(
      sqlite
        .prepare("SELECT status FROM device_rebind_requests WHERE id=?")
        .get(r2)?.status,
    ).toBe("superseded");
    await expect(
      env.DB.batch([
        env.DB.prepare("UPDATE memberships SET device_hash=? WHERE id=?").bind(
          "stale-device",
          session.member,
        ),
        env.DB.prepare(
          "UPDATE device_rebind_requests SET status='approved' WHERE id=?",
        ).bind(r2),
      ]),
    ).rejects.toThrow("rebind_already_decided");
    expect(
      sqlite
        .prepare("SELECT device_hash FROM memberships WHERE id=?")
        .get(session.member)?.device_hash,
    ).not.toBe("stale-device");
    const other = sqlite
      .prepare(
        "SELECT id FROM memberships WHERE company_id=? AND id<>? LIMIT 1",
      )
      .get(session.company, session.member)!;
    const deviceHash = sqlite
      .prepare("SELECT device_hash FROM memberships WHERE id=?")
      .get(session.member)!.device_hash;
    expect(() =>
      sqlite
        .prepare("UPDATE memberships SET device_hash=? WHERE id=?")
        .run(deviceHash, other.id),
    ).toThrow();
    const closed = sqlite
      .prepare(
        "SELECT id,out_at FROM attendance_logs WHERE out_at IS NOT NULL LIMIT 1",
      )
      .get()!;
    expect(() =>
      sqlite
        .prepare("UPDATE attendance_logs SET out_at=? WHERE id=?")
        .run(closed.out_at, closed.id),
    ).toThrow("attendance_already_closed");
    sqlite.exec("DELETE FROM notification_outbox");
    const jobId = crypto.randomUUID();
    sqlite
      .prepare(
        "INSERT INTO notification_outbox(id,company_id,recipient,payload,next_at) VALUES(?,?,?,?,?)",
      )
      .run(jobId, session.company, session.member, "{}", 0);
    sqlite
      .prepare(
        "INSERT INTO push_subscriptions(id,company_id,membership_id,endpoint,subscription) VALUES(?,?,?,?,?)",
      )
      .run(
        crypto.randomUUID(),
        session.company,
        session.member,
        "https://fcm.googleapis.com/test",
        "{}",
      );
    env.VAPID_PRIVATE_KEY = "test";
    env.VAPID_PUBLIC_KEY = "test";
    env.VAPID_SUBJECT = "mailto:test@example.com";
    vi.spyOn(webpush, "generateRequestDetails").mockReturnValue({
      endpoint: "https://fcm.googleapis.com/test",
      headers: {},
      body: Buffer.from("test"),
    } as any);
    const delivery = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return new Response(null, { status: 201 });
    });
    vi.stubGlobal("fetch", delivery);
    await Promise.all([deliver(env), deliver(env)]);
    expect(delivery).toHaveBeenCalledTimes(1);
    expect(
      sqlite
        .prepare(
          "SELECT status,lease_token FROM notification_outbox WHERE id=?",
        )
        .get(jobId),
    ).toMatchObject({ status: "sent", lease_token: null });
  } finally {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    sqlite.close();
  }
}, 60000);
