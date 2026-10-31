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
    // Phase two: exercise real routes, persisted versions, scope, and atomic audit.
    const scheduleRequest = (
      path: string,
      body?: unknown,
      method = body ? "POST" : "GET",
    ) =>
      app.request(
        origin + "/api" + path,
        { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) },
        env,
      );
    const shiftBody = {
      shift: { name: "Night", start: "20:00", end: "04:00" },
      reason: "Test schedule",
    };
    const createdShift = await scheduleRequest("/shifts", shiftBody);
    expect(createdShift.status).toBe(201);
    const template = (await createdShift.json()) as any;
    expect(
      (
        await scheduleRequest(
          `/shifts/${template.id}`,
          { ...shiftBody, expectedVersion: 1, archived: false },
          "PUT",
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await scheduleRequest(
          `/shifts/${template.id}`,
          { ...shiftBody, expectedVersion: 1, archived: false },
          "PUT",
        )
      ).status,
    ).toBe(409);
    const planBody = {
      effectiveFrom: "2099-01-01",
      expectedVersion: 0,
      reason: "Future plan",
      plan: {
        schedule: {
          mode: "fixed",
          days: [shiftBody.shift, null, null, null, null, null, null],
        },
        breakPolicy: { thresholdMinutes: 360, deductionMinutes: 30 },
      },
    };
    const planPath = `/members/${me.member.id}/work-plan`;
    expect(
      (
        await scheduleRequest(planPath, {
          ...planBody,
          effectiveFrom: "2000-01-01",
        })
      ).status,
    ).toBe(400);
    expect((await scheduleRequest(planPath, planBody)).status).toBe(201);
    expect((await scheduleRequest(planPath, planBody)).status).toBe(409);
    const assigned = (await (
      await scheduleRequest(planPath + "?date=2099-01-01")
    ).json()) as any;
    expect(assigned.plan.plan.schedule.days[0].start).toBe("20:00");
    const monday = new Date("2099-01-01T12:00:00Z");
    while (monday.getUTCDay() !== 1) monday.setUTCDate(monday.getUTCDate() + 1);
    const plannedDay = (await (
      await scheduleRequest(
        planPath + "?date=" + monday.toISOString().slice(0, 10),
      )
    ).json()) as any;
    expect(plannedDay.shiftWindow).toMatchObject({
      status: "resolved",
      elapsedMinutes: 480,
      workDate: monday.toISOString().slice(0, 10),
    });

    expect(
      (
        (await (
          await scheduleRequest(planPath + "?date=2098-12-31")
        ).json()) as any
      ).plan,
    ).toBeNull();
    expect(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS n FROM audit_logs WHERE action='work_plan.assign' AND target=?",
        )
        .get(me.member.id)?.n,
    ).toBe(1);
    expect(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS n FROM notifications WHERE recipient=? AND title='تغيّر جدول دوامك'",
        )
        .get(me.member.id)?.n,
    ).toBe(1);

    const summaryPath = `/members/${me.member.id}/workday-summary?date=${monday.toISOString().slice(0, 10)}`;
    const noPlanSummary = (await (
      await scheduleRequest(
        `/members/${me.member.id}/workday-summary?date=2098-01-01`,
      )
    ).json()) as any;
    expect(noPlanSummary.status).toBe("no_plan");
    const fixtureBranch = sqlite
      .prepare("SELECT id FROM branches WHERE company_id=? LIMIT 1")
      .get(me.member.company_id)!;
    const summarySession = crypto.randomUUID();
    sqlite
      .prepare(
        "INSERT INTO attendance_logs(id,company_id,membership_id,branch_id,in_at,out_at,in_lat,in_lng,device_hash,work_date) VALUES(?,?,?,?,?,?,0,0,'summary-fixture',?)",
      )
      .run(
        summarySession,
        me.member.company_id,
        me.member.id,
        fixtureBranch.id,
        plannedDay.shiftWindow.startAt - 15 * 60000,
        plannedDay.shiftWindow.endAt,
        monday.toISOString().slice(0, 10),
      );
    const summary = (await (await scheduleRequest(summaryPath)).json()) as any;
    expect(summary).toMatchObject({
      status: "ok",
      provisional: true,
      complete: false,
    });
    expect(summary.total).toMatchObject({
      grossMs: 480 * 60000,
      breakMs: 30 * 60000,
      netMs: 450 * 60000,
    });
    expect(summary.review).toContainEqual({
      id: summarySession,
      reason: "early_arrival",
      earlyMs: 15 * 60000,
      workDate: monday.toISOString().slice(0, 10),
    });
    sqlite
      .prepare("DELETE FROM attendance_logs WHERE id=?")
      .run(summarySession);
    const foreign = sqlite
      .prepare("SELECT id FROM memberships WHERE company_id<>? LIMIT 1")
      .get(me.member.company_id)!;
    expect(
      (await scheduleRequest(`/members/${foreign.id}/work-plan`)).status,
    ).toBe(404);
    expect(
      (await scheduleRequest(`/members/${foreign.id}/work-plan`, planBody))
        .status,
    ).toBe(404);
    // A failed audit must roll back the plan and notification as a unit.
    sqlite.exec(
      "CREATE TRIGGER test_schedule_audit_failure BEFORE INSERT ON audit_logs WHEN NEW.action='work_plan.assign' BEGIN SELECT RAISE(ABORT,'simulated audit failure'); END;",
    );
    expect(
      (
        await scheduleRequest(planPath, {
          ...planBody,
          expectedVersion: 1,
          effectiveFrom: "2099-02-01",
        })
      ).status,
    ).toBe(500);
    sqlite.exec("DROP TRIGGER test_schedule_audit_failure");
    expect(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS n FROM work_plan_versions WHERE membership_id=?",
        )
        .get(me.member.id)?.n,
    ).toBe(1);
    sqlite
      .prepare("UPDATE memberships SET role='worker' WHERE id=?")
      .run(me.member.id);
    expect((await scheduleRequest(planPath + "?date=2099-01-01")).status).toBe(
      200,
    );
    expect((await scheduleRequest(planPath, planBody)).status).toBe(403);
    expect((await scheduleRequest("/shifts", shiftBody)).status).toBe(403);
    const otherLocal = sqlite
      .prepare(
        "SELECT id FROM memberships WHERE company_id=? AND id<>? LIMIT 1",
      )
      .get(me.member.company_id, me.member.id)!;
    expect(otherLocal).toBeTruthy();
    expect(
      (
        await scheduleRequest(
          `/members/${otherLocal.id}/workday-summary?date=2099-01-01`,
        )
      ).status,
    ).toBe(403);
    expect((await scheduleRequest(summaryPath)).status).toBe(200);
    expect(
      (
        await scheduleRequest(
          `/members/${foreign.id}/workday-summary?date=2099-01-01`,
        )
      ).status,
    ).toBe(404);

    expect(
      (await scheduleRequest(`/members/${otherLocal.id}/work-plan`)).status,
    ).toBe(403);
    sqlite
      .prepare("UPDATE memberships SET role='manager' WHERE id=?")
      .run(me.member.id);
    expect(
      (await scheduleRequest(`/members/${otherLocal.id}/work-plan`, planBody))
        .status,
    ).toBe(403);
    const scopedUser = crypto.randomUUID(),
      scopedMember = crypto.randomUUID(),
      scopedDepartment = crypto.randomUUID();
    sqlite
      .prepare("INSERT INTO users(id,phone,name,password_hash) VALUES(?,?,?,?)")
      .run(scopedUser, "+999" + Date.now(), "Schedule worker", "unused");
    sqlite
      .prepare("INSERT INTO departments(id,company_id,name) VALUES(?,?,?)")
      .run(scopedDepartment, me.member.company_id, "Schedule scope");
    sqlite
      .prepare(
        "INSERT INTO memberships(id,company_id,user_id,role,department_id) VALUES(?,?,?,'worker',?)",
      )
      .run(scopedMember, me.member.company_id, scopedUser, scopedDepartment);
    sqlite
      .prepare(
        "INSERT INTO manager_scopes(id,company_id,membership_id,department_id) VALUES(?,?,?,?)",
      )
      .run(
        crypto.randomUUID(),
        me.member.company_id,
        me.member.id,
        scopedDepartment,
      );
    expect(
      (await scheduleRequest(`/members/${scopedMember}/work-plan`, planBody))
        .status,
    ).toBe(201);
    expect(
      (
        await scheduleRequest(
          `/members/${scopedMember}/work-plan?date=2099-01-01`,
        )
      ).status,
    ).toBe(200);
    sqlite
      .prepare("UPDATE memberships SET role='gm' WHERE id=?")
      .run(me.member.id);
    const missingPush = await app.request(
      origin + "/api/push/test",
      { method: "POST", headers, body: "{}" },
      env,
    );
    expect(missingPush.status).toBe(503);
    env.VAPID_PRIVATE_KEY = "test-private";
    env.VAPID_PUBLIC_KEY = "test-public";
    env.VAPID_SUBJECT = "https://example.test";
    const noPushSubscription = await app.request(
      origin + "/api/push/test",
      { method: "POST", headers, body: "{}" },
      env,
    );
    expect(noPushSubscription.status).toBe(400);
    sqlite
      .prepare(
        "INSERT INTO push_subscriptions(id,company_id,membership_id,endpoint,subscription) VALUES(?,?,?,?,?)",
      )
      .run(
        "test-own-push",
        me.member.company_id,
        me.member.id,
        "https://fcm.googleapis.com/test-own-push",
        "{}",
      );
    const testPush = await app.request(
      origin + "/api/push/test",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          recipient: "another-member",
          companyId: "another-company",
        }),
      },
      env,
    );
    expect(testPush.status).toBe(200);
    const ownJob = sqlite
      .prepare(
        "SELECT company_id,recipient FROM notification_outbox WHERE payload LIKE '%إشعار تجريبي%'",
      )
      .get();
    expect(ownJob).toMatchObject({
      company_id: me.member.company_id,
      recipient: me.member.id,
    });
    sqlite
      .prepare(
        "DELETE FROM notification_outbox WHERE payload LIKE '%إشعار تجريبي%'",
      )
      .run();
    sqlite
      .prepare("DELETE FROM push_subscriptions WHERE id='test-own-push'")
      .run();
    delete env.VAPID_PRIVATE_KEY;
    delete env.VAPID_PUBLIC_KEY;
    delete env.VAPID_SUBJECT;
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
    const otherManager = sqlite
      .prepare(
        "SELECT id,company_id,local_hash,version FROM memberships WHERE company_id<>? AND role='gm' LIMIT 1",
      )
      .get(session.company)!;
    expect(otherManager).toBeTruthy();
    const ownerHeaders = {
      Origin: origin,
      Cookie: ownerCookie,
      "X-CSRF-Token": ownerMe.csrf,
      "Content-Type": "application/json",
    };
    const managersResponse = await fetch(
      origin + "/api/owner/companies/" + session.company + "/managers",
      { headers: ownerHeaders },
    );
    expect(managersResponse.status).toBe(200);
    const managerList = await managersResponse.json();
    expect(managerList.items.map((m: any) => m.id)).toContain(session.member);
    expect(managerList.items.map((m: any) => m.id)).not.toContain(
      otherManager.id,
    );
    const wrongCompanyReset = await fetch(
      origin + "/api/owner/companies/" + session.company + "/reset-gm",
      {
        method: "POST",
        headers: ownerHeaders,
        body: JSON.stringify({
          membershipId: otherManager.id,
          pin: "wrong-company-temporary-pin",
          reason: "Test stale selection from another company",
        }),
      },
    );
    expect(wrongCompanyReset.status).toBe(404);
    expect(
      sqlite
        .prepare("SELECT local_hash,version FROM memberships WHERE id=?")
        .get(otherManager.id),
    ).toEqual({
      local_hash: otherManager.local_hash,
      version: otherManager.version,
    });
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
