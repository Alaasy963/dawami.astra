import { test, vi, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { app } from "../apps/api/index";
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
  const env: any = {
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
    ).toBe(0);
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
  } finally {
    vi.unstubAllGlobals();
    sqlite.close();
  }
}, 60000);
