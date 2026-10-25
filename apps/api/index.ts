import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { users } from "../../packages/db/schema";
import {
  hashPin,
  verifyPin,
  digest,
  distance,
  activeCompany,
  canReset,
  canRebind,
  addSubscriptionMonths,
} from "../../packages/domain/security";
import type { Bindings, Env, Session, Member, Company } from "./types";
import { deliver } from "./push";
const app = new Hono<Bindings>();
const id = () => crypto.randomUUID();
function fail(
  status: 400 | 401 | 403 | 404 | 409 | 423 | 429,
  message: string,
): never {
  throw new HTTPException(status, { message });
}
const phone = z.string().regex(/^\+[1-9]\d{7,14}$/),
  pin = z.string().min(8).max(128),
  name = z.string().trim().min(2).max(100),
  uuid = z.string().uuid(),
  device = z.string().min(20).max(200);
const stmt = (env: Env, sql: string, ...args: any[]) =>
  env.DB.prepare(sql).bind(...args);
const audit = (
  env: Env,
  s: Session,
  cid: string,
  action: string,
  target: string,
  reason: string,
  after: unknown = null,
  before: unknown = null,
) =>
  stmt(
    env,
    "INSERT INTO audit_logs(id,company_id,actor,role,action,target,reason,after,before,created_at) VALUES(?,?,?,COALESCE((SELECT role FROM memberships WHERE company_id=? AND user_id=? AND status='active'),?),?,?,?,?,?,?)",
    id(),
    cid,
    s.userId,
    cid,
    s.userId,
    s.mode === "owner" ? "owner" : "member",
    action,
    target,
    reason,
    JSON.stringify(after),
    JSON.stringify(before),
    Date.now(),
  );
async function loadMember(env: Env, s: Session) {
  return stmt(
    env,
    "SELECT id,company_id,user_id,role,branch_id,department_id,status,device_hash,must_change,version FROM memberships WHERE id=? AND company_id=? AND user_id=? AND status=?",
    s.membershipId ?? "",
    s.companyId ?? "",
    s.userId,
    "active",
  ).first<Member>();
}
async function issue(c: any, s: Session) {
  const sid = id();
  await c.env.SESSIONS.put(sid, JSON.stringify(s), {
    expirationTtl: Math.max(60, Math.ceil((s.expires - Date.now()) / 1000)),
  });
  setCookie(c, "dawami_session", sid, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: Math.ceil((s.expires - Date.now()) / 1000),
  });
  return sid;
}
async function allowedTarget(c: any, targetId: string) {
  const actor = c.get("member") as Member;
  const target = await stmt(
    c.env,
    "SELECT * FROM memberships WHERE id=? AND company_id=?",
    targetId,
    actor.company_id,
  ).first<Member>();
  if (!target) fail(404, "العامل غير موجود");
  if (actor.role === "worker" && target.id !== actor.id) fail(403, "غير مسموح");
  if (actor.role === "manager" && target.id !== actor.id) {
    const scope = await stmt(
      c.env,
      "SELECT id FROM manager_scopes WHERE company_id=? AND membership_id=? AND (branch_id=? OR department_id=?)",
      actor.company_id,
      actor.id,
      target.branch_id,
      target.department_id,
    ).first();
    if (!scope) fail(403, "العامل خارج نطاقك");
  }
  return target;
}
function roles(c: any, ...allowed: string[]) {
  if (!allowed.includes(c.get("member").role))
    fail(403, "ما عندك صلاحية لهالعملية");
}
app.onError((e, c) => {
  if (e instanceof HTTPException) return c.json({ error: e.message }, e.status);
  if (e instanceof z.ZodError)
    return c.json(
      {
        error: "راجع الحقول المطلوبة",
        issues: e.issues.map((x) => ({ path: x.path, message: x.message })),
      },
      400,
    );
  if (
    /push_identity_conflict|rebind_already_decided|attendance_already_closed|attendance_overlap|memberships.company_id, memberships.device_hash/.test(
      e.message,
    )
  )
    return c.json(
      { error: "تعارض مع عملية أو جهاز موجود. حدّث الصفحة وراجع الطلب." },
      409,
    );
  console.error("request_failed", e.message);
  return c.json({ error: "ما اكتملت العملية. جرّب مرة تانية." }, 500);
});
app.use("/api/*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    if (c.req.header("Origin") !== new URL(c.req.url).origin)
      fail(403, "مصدر الطلب غير مسموح");
    if (Number(c.req.header("Content-Length") ?? 0) > 1000000)
      fail(400, "الطلب كبير");
  }
  await next();
});
app.get("/api/health", (c) => c.json({ ok: true, phase: 1 }));
app.get("/api/public/config", async (c) => {
  const settings = await stmt(
    c.env,
    "SELECT trial_days FROM platform_settings WHERE id=1",
  ).first<{ trial_days: number }>();
  return c.json({
    trialDays: settings?.trial_days ?? 14,
    vapidPublicKey: c.env.VAPID_PUBLIC_KEY ?? "",
  });
});
app.post("/api/auth/signup", async (c) => {
  const b = z
    .object({
      company: name,
      name,
      phone,
      pin,
      device,
      currency: z.string().regex(/^[A-Z]{3}$/),
    })
    .parse(await c.req.json());
  if (!Intl.supportedValuesOf("currency").includes(b.currency))
    fail(400, "العملة غير مدعومة");
  if (
    !(await c.env.AUTH_LIMIT.limit({ key: "signup:" + digest(b.phone) }))
      .success
  )
    fail(429, "محاولات كثيرة");
  const db = drizzle(c.env.DB);
  if (
    (
      await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.phone, b.phone))
    ).length
  )
    fail(409, "استخدم تسجيل الدخول لهويتك الموجودة");
  const settings = await stmt(
    c.env,
    "SELECT trial_days FROM platform_settings WHERE id=1",
  ).first<{ trial_days: number }>();
  const uid = id(),
    cid = id(),
    mid = id(),
    now = Date.now(),
    hash = await hashPin(b.pin),
    ends = now + (settings?.trial_days ?? 14) * 86400000;
  await c.env.DB.batch([
    stmt(
      c.env,
      "INSERT INTO users(id,phone,name,password_hash) VALUES(?,?,?,?)",
      uid,
      b.phone,
      b.name,
      hash,
    ),
    stmt(
      c.env,
      "INSERT INTO companies(id,name,currency,status,ends_at,created_at) VALUES(?,?,?,?,?,?)",
      cid,
      b.company,
      b.currency,
      "trial",
      ends,
      now,
    ),
    stmt(
      c.env,
      "INSERT INTO memberships(id,company_id,user_id,role,device_hash) VALUES(?,?,?,?,?)",
      mid,
      cid,
      uid,
      "gm",
      digest(b.device),
    ),
    stmt(
      c.env,
      "INSERT INTO subscriptions(id,company_id,kind,starts_at,ends_at,actor) VALUES(?,?,?,?,?,?)",
      id(),
      cid,
      "trial",
      now,
      ends,
      uid,
    ),
  ]);
  await issue(c, {
    userId: uid,
    companyId: cid,
    membershipId: mid,
    mode: "global",
    version: 1,
    expires: now + 7 * 86400000,
    csrf: id(),
    device: digest(b.device),
  });
  return c.json({ ok: true }, 201);
});
app.post("/api/auth/login", async (c) => {
  const b = z
    .object({
      phone,
      pin: z.string().min(1).max(128),
      device,
      companyId: uuid.optional(),
    })
    .parse(await c.req.json());
  if (
    !(await c.env.AUTH_LIMIT.limit({ key: "login:" + digest(b.phone) })).success
  )
    fail(429, "محاولات كثيرة. جرّب بعد دقيقة");
  if (
    !b.companyId &&
    c.env.OWNER_PHONE === b.phone &&
    c.env.OWNER_HASH &&
    (await verifyPin(b.pin, c.env.OWNER_HASH))
  ) {
    await issue(c, {
      userId: "platform-owner",
      mode: "owner",
      version: 1,
      expires: Date.now() + 86400000,
      csrf: id(),
      device: digest(b.device),
    });
    return c.json({ ok: true });
  }
  const user = await stmt(
    c.env,
    "SELECT * FROM users WHERE phone=?",
    b.phone,
  ).first<any>();
  if (!user) fail(401, "بيانات الدخول غير صحيحة");
  let member: Member | null = null,
    mode: Session["mode"] = "global",
    version = user.version;
  if (b.companyId) {
    member = await stmt(
      c.env,
      "SELECT * FROM memberships WHERE user_id=? AND company_id=? AND status='active'",
      user.id,
      b.companyId,
    ).first<Member>();
    const local = await stmt(
      c.env,
      "SELECT local_hash FROM memberships WHERE user_id=? AND company_id=?",
      user.id,
      b.companyId,
    ).first<any>();
    if (
      !member ||
      !local?.local_hash ||
      !(await verifyPin(b.pin, local.local_hash))
    )
      fail(401, "بيانات الدخول غير صحيحة");
    mode = "local";
    version = member.version;
  } else if (!(await verifyPin(b.pin, user.password_hash)))
    fail(401, "بيانات الدخول غير صحيحة");
  const memberships = (
    await stmt(
      c.env,
      "SELECT id FROM memberships WHERE user_id=? AND status='active'",
      user.id,
    ).all<any>()
  ).results;
  if (!member && memberships.length === 1)
    member = await stmt(
      c.env,
      "SELECT * FROM memberships WHERE id=?",
      memberships[0].id,
    ).first<Member>();
  const sessionPolicy = member
    ? await stmt(
        c.env,
        "SELECT session_days FROM companies WHERE id=?",
        member.company_id,
      ).first<{ session_days: number }>()
    : null;
  await issue(c, {
    userId: user.id,
    mode,
    version,
    expires: Date.now() + (sessionPolicy?.session_days ?? 7) * 86400000,
    csrf: id(),
    device: digest(b.device),
    ...(member
      ? { membershipId: member.id, companyId: member.company_id }
      : {}),
  });
  return c.json({ ok: true });
});
app.use("/api/*", async (c, next) => {
  const sid = getCookie(c, "dawami_session");
  if (!sid) fail(401, "سجّل دخول أولاً");
  const s = await c.env.SESSIONS.get<Session>(sid, "json");
  if (!s || s.expires < Date.now()) fail(401, "انتهت الجلسة");
  if (s.mode !== "owner") {
    const row =
      s.mode === "local"
        ? await stmt(
            c.env,
            "SELECT version FROM memberships WHERE id=? AND company_id=? AND user_id=?",
            s.membershipId,
            s.companyId,
            s.userId,
          ).first<any>()
        : await stmt(
            c.env,
            "SELECT version FROM users WHERE id=?",
            s.userId,
          ).first<any>();
    if (!row || row.version !== s.version) fail(401, "سجّل دخول من جديد");
  }
  c.set("session", s);
  c.set("sid", sid);
  if (
    !["GET", "HEAD"].includes(c.req.method) &&
    c.req.header("X-CSRF-Token") !== s.csrf
  )
    fail(403, "حدّث الصفحة وحاول من جديد");
  await next();
});
app.get("/api/auth/me", async (c) => {
  const s = c.get("session");
  if (s.mode === "owner")
    return c.json({ owner: true, csrf: s.csrf, name: "مالك دوامي" });
  const user = await stmt(
    c.env,
    "SELECT name,must_change FROM users WHERE id=?",
    s.userId,
  ).first<any>();
  const member = s.companyId ? await loadMember(c.env, s) : null,
    company = s.companyId
      ? await stmt(
          c.env,
          "SELECT * FROM companies WHERE id=?",
          s.companyId,
        ).first<Company>()
      : null;
  // Renew only on authenticated session refresh, and at most once per half-window.
  if (
    member &&
    company &&
    activeCompany(company) &&
    !(s.mode === "local" ? member.must_change : user?.must_change)
  ) {
    const duration = company.session_days * 86400000;
    if (s.expires - Date.now() < duration / 2) {
      s.expires = Date.now() + duration;
      await c.env.SESSIONS.put(c.get("sid"), JSON.stringify(s), {
        expirationTtl: company.session_days * 86400,
      });
      setCookie(c, "dawami_session", c.get("sid"), {
        httpOnly: true,
        secure: new URL(c.req.url).protocol === "https:",
        sameSite: "Lax",
        path: "/",
        maxAge: company.session_days * 86400,
      });
    }
  }
  const memberships =
    s.mode === "global"
      ? (
          await stmt(
            c.env,
            "SELECT m.id,m.company_id,m.status,c.name FROM memberships m JOIN companies c ON c.id=m.company_id WHERE m.user_id=?",
            s.userId,
          ).all()
        ).results
      : [];
  return c.json({
    owner: false,
    expires: s.expires,
    name: user?.name,
    csrf: s.csrf,
    member: member
      ? {
          id: member.id,
          company_id: member.company_id,
          role: member.role,
          branch_id: member.branch_id,
          department_id: member.department_id,
          status: member.status,
        }
      : null,
    company,
    memberships,
    mode: s.mode,
    mustChange: !!(s.mode === "local"
      ? member?.must_change
      : user?.must_change),
    locked: company ? !activeCompany(company) : false,
    deviceBound: member?.device_hash === s.device,
  });
});
app.post("/api/auth/logout", async (c) => {
  await c.env.SESSIONS.delete(c.get("sid"));
  deleteCookie(c, "dawami_session", { path: "/" });
  return c.json({ ok: true });
});
app.post("/api/auth/select", async (c) => {
  const s = c.get("session");
  const identity = await stmt(
    c.env,
    "SELECT must_change FROM users WHERE id=?",
    s.userId,
  ).first<{ must_change: number }>();
  if (identity?.must_change) fail(403, "غيّر PIN المؤقت أولاً");
  if (s.mode !== "global") fail(403, "الدخول المؤقت خاص بشركتك");
  const { membershipId } = z
    .object({ membershipId: uuid })
    .parse(await c.req.json());
  const m = await stmt(
    c.env,
    "SELECT * FROM memberships WHERE id=? AND user_id=? AND status='active'",
    membershipId,
    s.userId,
  ).first<Member>();
  if (!m) fail(403, "العضوية غير متاحة");
  const co = await stmt(
    c.env,
    "SELECT session_days FROM companies WHERE id=?",
    m.company_id,
  ).first<any>();
  await c.env.SESSIONS.delete(c.get("sid"));
  await issue(c, {
    ...s,
    membershipId: m.id,
    companyId: m.company_id,
    expires: Math.min(s.expires, Date.now() + co.session_days * 86400000),
    csrf: id(),
  });
  return c.json({ ok: true });
});
app.post("/api/auth/accept-invitation", async (c) => {
  const s = c.get("session");
  const identity = await stmt(
    c.env,
    "SELECT must_change FROM users WHERE id=?",
    s.userId,
  ).first<{ must_change: number }>();
  if (identity?.must_change) fail(403, "غيّر PIN المؤقت أولاً");
  if (s.mode !== "global") fail(403, "سجّل بالهوية العامة");
  const { membershipId } = z
    .object({ membershipId: uuid })
    .parse(await c.req.json());
  const m = await stmt(
    c.env,
    "SELECT * FROM memberships WHERE id=? AND user_id=? AND status='invited'",
    membershipId,
    s.userId,
  ).first<Member>();
  if (!m) fail(404, "الدعوة غير موجودة");
  await c.env.DB.batch([
    stmt(
      c.env,
      "UPDATE memberships SET status='active',device_hash=? WHERE id=? AND user_id=? AND status='invited'",
      s.device,
      m.id,
      s.userId,
    ),
    audit(
      c.env,
      s,
      m.company_id,
      "invitation.accept",
      m.id,
      "Accepted by identity owner",
    ),
  ]);
  return c.json({ ok: true });
});
app.post("/api/auth/pin", async (c) => {
  const s = c.get("session");
  if (s.mode === "owner") fail(403, "اعتماد المالك يُدار عبر الأسرار");
  const b = z
    .object({ currentPin: z.string().max(128), newPin: pin })
    .parse(await c.req.json());
  const u = await stmt(
    c.env,
    s.mode === "local"
      ? "SELECT local_hash AS hash FROM memberships WHERE id=? AND company_id=?"
      : "SELECT password_hash AS hash FROM users WHERE id=?",
    ...(s.mode === "local" ? [s.membershipId, s.companyId] : [s.userId]),
  ).first<any>();
  if (!u || !(await verifyPin(b.currentPin, u.hash)))
    fail(401, "الرمز الحالي غير صحيح");
  const hash = await hashPin(b.newPin);
  const queries = [
    s.mode === "local"
      ? stmt(
          c.env,
          "UPDATE memberships SET local_hash=?,must_change=0,version=version+1 WHERE id=? AND company_id=?",
          hash,
          s.membershipId,
          s.companyId,
        )
      : stmt(
          c.env,
          "UPDATE users SET password_hash=?,must_change=0,version=version+1 WHERE id=?",
          hash,
          s.userId,
        ),
  ];
  if (s.companyId)
    queries.push(
      audit(
        c.env,
        s,
        s.companyId,
        "pin.change",
        s.membershipId!,
        "User changed PIN",
      ),
    );
  await c.env.DB.batch(queries);
  await c.env.SESSIONS.delete(c.get("sid"));
  await issue(c, { ...s, version: s.version + 1, csrf: id() });
  return c.json({ ok: true });
});
app.use("/api/owner/*", async (c, next) => {
  if (c.get("session").mode !== "owner") fail(403, "خاص بمالك المنصة");
  await next();
});
app.get("/api/owner/companies", async (c) =>
  c.json({
    items: (
      await stmt(
        c.env,
        "SELECT c.*,(SELECT COUNT(*) FROM memberships m WHERE m.company_id=c.id) AS workers FROM companies c ORDER BY created_at DESC",
      ).all()
    ).results,
    settings: await stmt(
      c.env,
      "SELECT * FROM platform_settings WHERE id=1",
    ).first(),
  }),
);
app.put("/api/owner/settings", async (c) => {
  const b = z
    .object({
      trialDays: z.number().int().min(1).max(365),
      monthly: z.number().int().min(0),
      yearly: z.number().int().min(0),
    })
    .parse(await c.req.json());
  await stmt(
    c.env,
    "INSERT INTO platform_settings(id,trial_days,monthly,yearly) VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET trial_days=excluded.trial_days,monthly=excluded.monthly,yearly=excluded.yearly",
    b.trialDays,
    b.monthly,
    b.yearly,
  ).run();
  return c.json({ ok: true });
});
app.post("/api/owner/companies/:id/subscription", async (c) => {
  const cid = uuid.parse(c.req.param("id")),
    b = z
      .object({
        action: z.enum(["month", "year", "trial", "suspend"]),
        reason: z.string().min(3).max(500),
      })
      .parse(await c.req.json());
  const co = await stmt(
    c.env,
    "SELECT * FROM companies WHERE id=?",
    cid,
  ).first<Company>();
  if (!co) fail(404, "الشركة غير موجودة");
  const settings = await stmt(
    c.env,
    "SELECT trial_days FROM platform_settings WHERE id=1",
  ).first<any>();
  const base = new Date(
    Math.max(Date.now(), b.action === "trial" ? 0 : co.ends_at),
  );
  if (b.action === "month")
    base.setTime(addSubscriptionMonths(base.getTime(), 1));
  if (b.action === "year")
    base.setTime(addSubscriptionMonths(base.getTime(), 12));
  if (b.action === "trial")
    base.setTime(Date.now() + (settings?.trial_days ?? 14) * 86400000);
  const status =
      b.action === "suspend"
        ? "suspended"
        : b.action === "trial"
          ? "trial"
          : "active",
    end = b.action === "suspend" ? co.ends_at : base.getTime();
  await c.env.DB.batch([
    stmt(
      c.env,
      "UPDATE companies SET status=?,ends_at=? WHERE id=?",
      status,
      end,
      cid,
    ),
    stmt(
      c.env,
      "INSERT INTO subscriptions(id,company_id,kind,starts_at,ends_at,actor) VALUES(?,?,?,?,?,?)",
      id(),
      cid,
      b.action,
      Date.now(),
      end,
      "platform-owner",
    ),
    audit(
      c.env,
      c.get("session"),
      cid,
      "subscription." + b.action,
      cid,
      b.reason,
      { status, end },
      co,
    ),
  ]);
  return c.json({ ok: true });
});
app.get("/api/owner/companies/:id/managers", async (c) =>
  c.json({
    items: (
      await stmt(
        c.env,
        "SELECT m.id,u.name,u.phone FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.company_id=? AND m.role='gm'",
        uuid.parse(c.req.param("id")),
      ).all()
    ).results,
  }),
);
app.post("/api/owner/companies/:id/reset-gm", async (c) => {
  const cid = uuid.parse(c.req.param("id")),
    b = z
      .object({ membershipId: uuid, pin, reason: z.string().min(5).max(500) })
      .parse(await c.req.json());
  const m = await stmt(
    c.env,
    "SELECT * FROM memberships WHERE id=? AND company_id=? AND role='gm'",
    b.membershipId,
    cid,
  ).first<Member>();
  if (!m) fail(404, "المدير غير موجود");
  await c.env.DB.batch([
    stmt(
      c.env,
      "UPDATE memberships SET local_hash=?,must_change=1,version=version+1 WHERE id=? AND company_id=?",
      await hashPin(b.pin),
      m.id,
      cid,
    ),
    audit(c.env, c.get("session"), cid, "pin.reset", m.id, b.reason),
  ]);
  return c.json({ ok: true });
});
app.post("/api/owner/recover-identity", async (c) => {
  const b = z
    .object({ phone, pin, reason: z.string().min(10).max(500) })
    .parse(await c.req.json());
  const u = await stmt(
    c.env,
    "SELECT id FROM users WHERE phone=?",
    b.phone,
  ).first<any>();
  if (!u) fail(404, "الحساب غير موجود");
  const members = await stmt(
    c.env,
    "SELECT company_id,id FROM memberships WHERE user_id=?",
    u.id,
  ).all<any>();
  await c.env.DB.batch([
    stmt(
      c.env,
      "UPDATE users SET password_hash=?,must_change=1,version=version+1 WHERE id=?",
      await hashPin(b.pin),
      u.id,
    ),
    ...members.results.map((m) =>
      audit(
        c.env,
        c.get("session"),
        m.company_id,
        "identity.recover",
        m.id,
        b.reason,
      ),
    ),
  ]);
  return c.json({ ok: true });
});
app.get("/api/owner/rebinds", async (c) =>
  c.json({
    items: (
      await stmt(
        c.env,
        "SELECT r.*,u.name,c.name AS company FROM device_rebind_requests r JOIN memberships m ON m.id=r.membership_id AND m.company_id=r.company_id JOIN users u ON u.id=m.user_id JOIN companies c ON c.id=r.company_id WHERE m.role='gm' AND r.status='pending'",
      ).all()
    ).results,
  }),
);
app.post("/api/owner/rebinds/:id/approve", async (c) => {
  const rid = uuid.parse(c.req.param("id")),
    r = await stmt(
      c.env,
      "SELECT r.* FROM device_rebind_requests r JOIN memberships m ON m.id=r.membership_id AND m.company_id=r.company_id WHERE r.id=? AND r.status='pending' AND m.role='gm'",
      rid,
    ).first<any>();
  if (!r) fail(404, "الطلب غير موجود");
  await c.env.DB.batch([
    stmt(
      c.env,
      "UPDATE memberships SET device_hash=? WHERE id=? AND company_id=?",
      r.device_hash,
      r.membership_id,
      r.company_id,
    ),
    stmt(
      c.env,
      "UPDATE device_rebind_requests SET status='approved' WHERE id=?",
      rid,
    ),
    audit(
      c.env,
      c.get("session"),
      r.company_id,
      "device.rebind",
      r.membership_id,
      "Owner approved device request",
    ),
  ]);
  return c.json({ ok: true });
});
app.use("/api/*", async (c, next) => {
  const s = c.get("session");
  if (s.mode === "owner") fail(403, "اختر مسار المالك");
  if (!s.membershipId || !s.companyId) fail(403, "اختر الشركة");
  const m = await loadMember(c.env, s);
  if (!m) fail(403, "العضوية غير متاحة");
  const co = await stmt(
    c.env,
    "SELECT * FROM companies WHERE id=?",
    s.companyId,
  ).first<Company>();
  if (!co) fail(404, "الشركة غير موجودة");
  c.set("member", m);
  c.set("company", co);
  const u = await stmt(
    c.env,
    "SELECT must_change FROM users WHERE id=?",
    s.userId,
  ).first<any>();
  if (s.mode === "local" ? m.must_change : u.must_change)
    fail(403, "غيّر PIN المؤقت أولاً");
  if (!activeCompany(co) && c.req.path !== "/api/attendance/sync")
    fail(423, "انتهى الاشتراك أو توقفت الشركة. تواصل مع مالك دوامي للتجديد");
  await next();
});
app.get("/api/company", (c) => c.json(c.get("company")));

app.get("/api/company/logo", async (c) => {
  const key = c.get("company").logo_key;
  if (!key) fail(404, "ما في شعار للشركة");
  const object = await c.env.STORAGE.get(key);
  if (!object) fail(404, "الشعار غير موجود");
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType || "image/png",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
app.put("/api/company/logo", async (c) => {
  roles(c, "gm", "am");
  const reader = c.req.raw.body?.getReader();
  if (!reader) fail(400, "اختر صورة للشعار");
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > 256 * 1024) {
      await reader.cancel();
      fail(400, "الشعار أكبر من 256 كيلوبايت");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const png =
    bytes.length >= 24 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
  const jpeg =
    bytes.length >= 4 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255;
  if (!png && !jpeg) fail(400, "الشعار لازم يكون صورة PNG أو JPEG");
  const company = c.get("company"),
    key = company.id + "/logos/" + id();
  await c.env.STORAGE.put(key, bytes, {
    httpMetadata: { contentType: png ? "image/png" : "image/jpeg" },
  });
  try {
    await c.env.DB.batch([
      stmt(
        c.env,
        "UPDATE companies SET logo_key=? WHERE id=?",
        key,
        company.id,
      ),
      audit(
        c.env,
        c.get("session"),
        company.id,
        "company.logo",
        company.id,
        "Company logo updated",
        { key },
        { key: company.logo_key },
      ),
    ]);
  } catch (e) {
    await c.env.STORAGE.delete(key);
    throw e;
  }
  // Keep older logo objects for now: concurrent uploads must never delete another request's result.
  return c.json({ ok: true });
});
app.put("/api/company", async (c) => {
  roles(c, "gm", "am");
  const b = z
    .object({
      name,
      currency: z.string().length(3),
      timezone: z.string().max(80),
      sessionDays: z.number().int().min(1).max(30),
      gpsAccuracy: z.number().min(10).max(500),
    })
    .parse(await c.req.json());
  if (!Intl.supportedValuesOf("currency").includes(b.currency))
    fail(400, "العملة غير مدعومة");
  try {
    new Intl.DateTimeFormat("en", { timeZone: b.timezone });
  } catch {
    fail(400, "المنطقة الزمنية غير صحيحة");
  }
  await c.env.DB.batch([
    stmt(
      c.env,
      "UPDATE companies SET name=?,currency=?,timezone=?,session_days=?,gps_accuracy=? WHERE id=?",
      b.name,
      b.currency,
      b.timezone,
      b.sessionDays,
      b.gpsAccuracy,
      c.get("company").id,
    ),
    audit(
      c.env,
      c.get("session"),
      c.get("company").id,
      "company.update",
      c.get("company").id,
      "Company settings updated",
      b,
      c.get("company"),
    ),
  ]);
  return c.json({ ok: true });
});
app.get("/api/branches", async (c) =>
  c.json({
    items: (
      await stmt(
        c.env,
        "SELECT * FROM branches WHERE company_id=? ORDER BY name",
        c.get("company").id,
      ).all()
    ).results,
  }),
);
const branchSchema = z.object({
  name,
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radius: z.number().min(10).max(10000),
});
app.post("/api/branches", async (c) => {
  roles(c, "gm", "am");
  const b = branchSchema.parse(await c.req.json()),
    bid = id(),
    cid = c.get("company").id;
  await c.env.DB.batch([
    stmt(
      c.env,
      "INSERT INTO branches(id,company_id,name,lat,lng,radius) VALUES(?,?,?,?,?,?)",
      bid,
      cid,
      b.name,
      b.lat,
      b.lng,
      b.radius,
    ),
    audit(
      c.env,
      c.get("session"),
      cid,
      "branch.create",
      bid,
      "Branch created",
      b,
    ),
  ]);
  return c.json({ id: bid }, 201);
});
app.put("/api/branches/:id", async (c) => {
  roles(c, "gm", "am");
  const b = branchSchema
      .extend({ reason: z.string().min(3) })
      .parse(await c.req.json()),
    bid = uuid.parse(c.req.param("id")),
    cid = c.get("company").id;
  const old = await stmt(
    c.env,
    "SELECT * FROM branches WHERE company_id=? AND id=?",
    cid,
    bid,
  ).first();
  if (!old) fail(404, "الفرع غير موجود");
  await c.env.DB.batch([
    stmt(
      c.env,
      "UPDATE branches SET name=?,lat=?,lng=?,radius=? WHERE id=? AND company_id=?",
      b.name,
      b.lat,
      b.lng,
      b.radius,
      bid,
      cid,
    ),
    audit(c.env, c.get("session"), cid, "branch.update", bid, b.reason, b, old),
  ]);
  return c.json({ ok: true });
});
app.get("/api/departments", async (c) =>
  c.json({
    items: (
      await stmt(
        c.env,
        "SELECT * FROM departments WHERE company_id=? ORDER BY name",
        c.get("company").id,
      ).all()
    ).results,
  }),
);
app.post("/api/departments", async (c) => {
  roles(c, "gm", "am");
  const b = z.object({ name }).parse(await c.req.json()),
    did = id(),
    cid = c.get("company").id;
  await c.env.DB.batch([
    stmt(
      c.env,
      "INSERT INTO departments(id,company_id,name) VALUES(?,?,?)",
      did,
      cid,
      b.name,
    ),
    audit(
      c.env,
      c.get("session"),
      cid,
      "department.create",
      did,
      "Department created",
      b,
    ),
  ]);
  return c.json({ id: did }, 201);
});
function memberScope(m: Member) {
  if (m.role === "worker") return { sql: " AND m.id=?", args: [m.id] };
  if (m.role === "manager")
    return {
      sql: " AND (m.id=? OR EXISTS(SELECT 1 FROM manager_scopes s WHERE s.company_id=m.company_id AND s.membership_id=? AND (s.branch_id=m.branch_id OR s.department_id=m.department_id)))",
      args: [m.id, m.id],
    };
  return { sql: "", args: [] };
}
app.get("/api/members", async (c) => {
  const m = c.get("member"),
    scope = memberScope(m);
  return c.json({
    items: (
      await stmt(
        c.env,
        "SELECT m.id,m.role,m.branch_id,m.department_id,m.status,m.device_hash IS NOT NULL AS bound,u.name,u.phone,b.name AS branch,d.name AS department FROM memberships m JOIN users u ON u.id=m.user_id LEFT JOIN branches b ON b.id=m.branch_id AND b.company_id=m.company_id LEFT JOIN departments d ON d.id=m.department_id AND d.company_id=m.company_id WHERE m.company_id=?" +
          scope.sql +
          " ORDER BY u.name",
        m.company_id,
        ...scope.args,
      ).all()
    ).results,
  });
});
const memberInput = z.object({
  name,
  phone,
  pin,
  role: z.enum(["worker", "manager", "am", "gm"]).default("worker"),
  branchId: uuid,
  departmentId: uuid.nullable().optional(),
});
app.post("/api/members", async (c) => {
  roles(c, "gm", "manager");
  const b = memberInput.parse(await c.req.json()),
    actor = c.get("member"),
    cid = actor.company_id;
  if (actor.role !== "gm" && b.role !== "worker")
    fail(403, "إنشاء عامل فقط ضمن نطاقك");
  if (
    !(await stmt(
      c.env,
      "SELECT id FROM branches WHERE id=? AND company_id=?",
      b.branchId,
      cid,
    ).first())
  )
    fail(400, "الفرع غير صحيح");
  if (
    b.departmentId &&
    !(await stmt(
      c.env,
      "SELECT id FROM departments WHERE id=? AND company_id=?",
      b.departmentId,
      cid,
    ).first())
  )
    fail(400, "القسم غير صحيح");
  if (
    actor.role === "manager" &&
    !(await stmt(
      c.env,
      "SELECT id FROM manager_scopes WHERE company_id=? AND membership_id=? AND (branch_id=? OR department_id=?)",
      cid,
      actor.id,
      b.branchId,
      b.departmentId ?? null,
    ).first())
  )
    fail(403, "خارج نطاقك");
  const user = await stmt(
    c.env,
    "SELECT id FROM users WHERE phone=?",
    b.phone,
  ).first<any>();
  if (
    user &&
    (await stmt(
      c.env,
      "SELECT id FROM memberships WHERE company_id=? AND user_id=?",
      cid,
      user.id,
    ).first())
  )
    fail(409, "الرقم موجود بهالشركة");
  const mid = id(),
    uid = user?.id ?? id(),
    status = user ? "invited" : "active",
    queries: D1PreparedStatement[] = [];
  if (!user)
    queries.push(
      stmt(
        c.env,
        "INSERT INTO users(id,phone,name,password_hash,must_change) VALUES(?,?,?,?,1)",
        uid,
        b.phone,
        b.name,
        await hashPin(b.pin),
      ),
    );
  queries.push(
    stmt(
      c.env,
      "INSERT INTO memberships(id,company_id,user_id,role,branch_id,department_id,status) VALUES(?,?,?,?,?,?,?)",
      mid,
      cid,
      uid,
      b.role,
      b.branchId,
      b.departmentId ?? null,
      status,
    ),
  );
  if (b.role === "manager")
    queries.push(
      stmt(
        c.env,
        "INSERT INTO manager_scopes(id,company_id,membership_id,branch_id,department_id) VALUES(?,?,?,?,?)",
        id(),
        cid,
        mid,
        b.branchId,
        b.departmentId ?? null,
      ),
    );
  queries.push(
    audit(
      c.env,
      c.get("session"),
      cid,
      "member.create",
      mid,
      "Created company membership",
      { role: b.role, status, branchId: b.branchId },
    ),
  );
  await c.env.DB.batch(queries);
  return c.json(
    {
      id: mid,
      status,
      message:
        status === "invited"
          ? "دعوة بانتظار قبول صاحب الهوية"
          : "تم إنشاء العامل. لازم يغيّر PIN عند أول دخول",
    },
    201,
  );
});
app.post("/api/members/:id/reset", async (c) => {
  const target = await allowedTarget(c, uuid.parse(c.req.param("id")));
  if (!canReset(c.get("member").role, target.role))
    fail(403, "غير مسموح إعادة تعيين هالحساب");
  const b = z
    .object({ pin, reason: z.string().min(3).max(500) })
    .parse(await c.req.json());
  await c.env.DB.batch([
    stmt(
      c.env,
      "UPDATE memberships SET local_hash=?,must_change=1,version=version+1 WHERE id=? AND company_id=?",
      await hashPin(b.pin),
      target.id,
      target.company_id,
    ),
    audit(
      c.env,
      c.get("session"),
      target.company_id,
      "pin.reset",
      target.id,
      b.reason,
    ),
  ]);
  return c.json({ ok: true, companyId: target.company_id });
});
app.post("/api/device/bind", async (c) => {
  const m = c.get("member"),
    s = c.get("session");
  if (m.device_hash && m.device_hash !== s.device)
    fail(409, "الجهاز مربوط. ابعت طلب إعادة ربط");
  if (!m.device_hash)
    await c.env.DB.batch([
      stmt(
        c.env,
        "UPDATE memberships SET device_hash=? WHERE id=? AND company_id=? AND device_hash IS NULL",
        s.device,
        m.id,
        m.company_id,
      ),
      audit(
        c.env,
        s,
        m.company_id,
        "device.bind",
        m.id,
        "First device binding",
      ),
    ]);
  return c.json({ ok: true });
});
app.post("/api/device/rebind", async (c) => {
  const b = z
      .object({ reason: z.string().min(3).max(500) })
      .parse(await c.req.json()),
    m = c.get("member");
  await stmt(
    c.env,
    "INSERT INTO device_rebind_requests(id,company_id,membership_id,device_hash,reason,created_at) VALUES(?,?,?,?,?,?)",
    id(),
    m.company_id,
    m.id,
    c.get("session").device,
    b.reason,
    Date.now(),
  ).run();
  return c.json({ ok: true }, 201);
});
app.get("/api/device/requests", async (c) => {
  roles(c, "gm", "am", "manager");
  const m = c.get("member"),
    rows = (
      await stmt(
        c.env,
        "SELECT r.*,u.name,m.role FROM device_rebind_requests r JOIN memberships m ON m.id=r.membership_id AND m.company_id=r.company_id JOIN users u ON u.id=m.user_id WHERE r.company_id=? AND r.status='pending'",
        m.company_id,
      ).all<any>()
    ).results,
    allowed = [];
  for (const row of rows) {
    if (!canRebind(m.role, row.role)) continue;
    try {
      await allowedTarget(c, row.membership_id);
      allowed.push(row);
    } catch {}
  }
  return c.json({ items: allowed });
});
app.post("/api/device/requests/:id/approve", async (c) => {
  roles(c, "gm", "am", "manager");
  const r = await stmt(
    c.env,
    "SELECT * FROM device_rebind_requests WHERE id=? AND company_id=? AND status='pending'",
    uuid.parse(c.req.param("id")),
    c.get("member").company_id,
  ).first<any>();
  if (!r) fail(404, "الطلب غير موجود");
  const target = await allowedTarget(c, r.membership_id);
  if (!canRebind(c.get("member").role, target.role)) fail(403, "غير مسموح");
  await c.env.DB.batch([
    stmt(
      c.env,
      "UPDATE memberships SET device_hash=? WHERE id=? AND company_id=?",
      r.device_hash,
      target.id,
      target.company_id,
    ),
    stmt(
      c.env,
      "UPDATE device_rebind_requests SET status='approved' WHERE id=? AND company_id=?",
      r.id,
      target.company_id,
    ),
    audit(
      c.env,
      c.get("session"),
      target.company_id,
      "device.rebind",
      target.id,
      r.reason,
    ),
  ]);
  return c.json({ ok: true });
});
app.get("/api/attendance/mine", async (c) => {
  const m = c.get("member");
  return c.json({
    items: (
      await stmt(
        c.env,
        "SELECT a.*,b.name AS branch FROM attendance_logs a JOIN branches b ON b.id=a.branch_id AND b.company_id=a.company_id WHERE a.company_id=? AND a.membership_id=? ORDER BY in_at DESC LIMIT 60",
        m.company_id,
        m.id,
      ).all()
    ).results,
  });
});
const punchInput = z.object({
  id: uuid,
  action: z.enum(["in", "out"]),
  deviceTime: z.number().int().positive(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().min(0),
  offline: z.boolean(),
});
async function punch(c: any, b: z.infer<typeof punchInput>) {
  const m = c.get("member") as Member,
    co = c.get("company") as Company,
    s = c.get("session") as Session,
    env = c.env as Env,
    now = Date.now(),
    hash = digest(JSON.stringify(b));
  const previous = await stmt(
    env,
    "SELECT * FROM sync_operations WHERE id=? AND company_id=? AND membership_id=?",
    b.id,
    m.company_id,
    m.id,
  ).first<any>();
  if (previous) {
    if (previous.payload_hash !== hash)
      fail(409, "رقم العملية مستخدم ببيانات مختلفة");
    return JSON.parse(previous.result);
  }
  if (!m.device_hash || m.device_hash !== s.device)
    fail(403, "اربط هالجهاز أو اطلب موافقة إعادة الربط");
  if (
    !(await env.PUNCH_LIMIT.limit({ key: m.company_id + ":" + m.id })).success
  )
    fail(429, "محاولات كثيرة");
  const branch = await stmt(
    env,
    "SELECT * FROM branches WHERE company_id=? AND id=?",
    m.company_id,
    m.branch_id ?? "",
  ).first<any>();
  if (!branch) fail(400, "اطلب من المدير تعيين فرعك");
  const queued = c.req.path === "/api/attendance/sync";
  let review = "";
  if (!activeCompany(co)) {
    if (!b.offline && !queued) fail(423, "الشركة مقفلة");
    review = "وصل بعد قفل الشركة";
  }
  if (b.accuracy > co.gps_accuracy)
    fail(400, "دقة الموقع ضعيفة. فعّل الموقع وجرّب بمكان مفتوح");
  const meters = distance(b.lat, b.lng, branch.lat, branch.lng);
  if (meters > branch.radius)
    fail(400, `أنت برّا نطاق الفرع (${Math.round(meters)} م)`);
  if (b.deviceTime > now + 60000) review = "وقت الجهاز بالمستقبل";
  if (b.offline || queued) review = review || "حضور أوفلاين يحتاج مراجعة الوقت";
  const result = { status: review ? "review" : "accepted", reason: review },
    ops: D1PreparedStatement[] = [
      stmt(
        env,
        "INSERT INTO sync_operations(id,company_id,membership_id,payload_hash,payload,status,result,received_at,branch_id,device_hash) VALUES(?,?,?,?,?,?,?,?,?,?)",
        b.id,
        m.company_id,
        m.id,
        hash,
        JSON.stringify(b),
        result.status,
        JSON.stringify(result),
        now,
        branch.id,
        s.device,
      ),
    ];
  if (!review) {
    const open = await stmt(
      env,
      "SELECT id FROM attendance_logs WHERE company_id=? AND membership_id=? AND out_at IS NULL",
      m.company_id,
      m.id,
    ).first<any>();
    if (b.action === "in" && open) fail(409, "أنت مسجل دخول بالفعل");
    if (b.action === "out" && !open) fail(409, "ما عندك جلسة مفتوحة");
    if (b.action === "in") {
      const date = new Intl.DateTimeFormat("en-CA", {
        timeZone: co.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(now);
      ops.push(
        stmt(
          env,
          "INSERT INTO attendance_logs(id,company_id,membership_id,branch_id,in_at,in_lat,in_lng,device_hash,work_date) VALUES(?,?,?,?,?,?,?,?,?)",
          b.id,
          m.company_id,
          m.id,
          branch.id,
          now,
          b.lat,
          b.lng,
          s.device,
          date,
        ),
      );
    } else
      ops.push(
        stmt(
          env,
          "UPDATE attendance_logs SET out_at=?,out_lat=?,out_lng=? WHERE id=? AND company_id=?",
          now,
          b.lat,
          b.lng,
          open.id,
          m.company_id,
        ),
      );
    const managers = await stmt(
      env,
      "SELECT m.id FROM memberships m WHERE m.company_id=? AND m.status='active' AND (m.role IN ('gm','am') OR (m.role='manager' AND EXISTS(SELECT 1 FROM manager_scopes s WHERE s.company_id=m.company_id AND s.membership_id=m.id AND (s.branch_id=? OR s.department_id=?))))",
      m.company_id,
      m.branch_id,
      m.department_id,
    ).all<any>();
    const user = await stmt(
        env,
        "SELECT name FROM users WHERE id=?",
        m.user_id,
      ).first<any>(),
      title = `${user.name} ${b.action === "in" ? "وصل" : "انصرف"}`,
      url = `/?view=location&lat=${b.lat}&lng=${b.lng}`;
    for (const recipient of managers.results) {
      ops.push(
        stmt(
          env,
          "INSERT INTO notifications(id,company_id,recipient,title,body,url,created_at) VALUES(?,?,?,?,?,?,?)",
          id(),
          m.company_id,
          recipient.id,
          title,
          branch.name,
          url,
          now,
        ),
      );
      ops.push(
        stmt(
          env,
          "INSERT INTO notification_outbox(id,company_id,recipient,payload,next_at) VALUES(?,?,?,?,?)",
          id(),
          m.company_id,
          recipient.id,
          JSON.stringify({ title, body: branch.name, url }),
          now,
        ),
      );
    }
  }
  await env.DB.batch(ops);
  c.executionCtx.waitUntil(deliver(env));
  return result;
}
app.post("/api/attendance/punch", async (c) =>
  c.json(await punch(c, punchInput.parse(await c.req.json()))),
);
app.post("/api/attendance/sync", async (c) =>
  c.json(await punch(c, punchInput.parse(await c.req.json()))),
);

app.get("/api/attendance/reviews", async (c) => {
  roles(c, "gm", "am", "manager");
  const m = c.get("member"),
    scope = memberScope(m);
  const rows = (
    await stmt(
      c.env,
      `SELECT o.id,o.membership_id,o.payload,o.result,o.received_at,u.name,b.name AS branch FROM sync_operations o JOIN memberships m ON m.id=o.membership_id AND m.company_id=o.company_id JOIN users u ON u.id=m.user_id LEFT JOIN branches b ON b.id=o.branch_id AND b.company_id=o.company_id WHERE o.company_id=? AND o.status='review' AND m.id<>?` +
        scope.sql +
        " ORDER BY o.received_at LIMIT 100",
      m.company_id,
      m.id,
      ...scope.args,
    ).all<any>()
  ).results;
  return c.json({
    items: rows.map((row) => ({
      ...row,
      payload: JSON.parse(row.payload),
      result: JSON.parse(row.result),
    })),
  });
});
app.post("/api/attendance/reviews/:id", async (c) => {
  roles(c, "gm", "am", "manager");
  const actor = c.get("member"),
    operationId = uuid.parse(c.req.param("id"));
  const b = z
    .object({
      decision: z.enum(["approve", "reject"]),
      reason: z.string().trim().min(5).max(500),
    })
    .parse(await c.req.json());
  const op = await stmt(
    c.env,
    "SELECT * FROM sync_operations WHERE id=? AND company_id=?",
    operationId,
    actor.company_id,
  ).first<any>();
  if (!op) fail(404, "الحدث غير موجود");
  const target = await allowedTarget(c, op.membership_id);
  if (target.id === actor.id) fail(403, "ما فيك تعتمد حضورك الشخصي");
  if (!canReset(actor.role, target.role))
    fail(403, "هالحساب يحتاج مدير أعلى للمراجعة");
  if (op.status !== "review") fail(409, "تم حسم هالحدث سابقاً");
  const event = punchInput.parse(JSON.parse(op.payload)),
    now = Date.now();
  const result = {
    status: b.decision === "approve" ? "accepted" : "error",
    reason: b.reason,
  };
  const operations: D1PreparedStatement[] = [
    stmt(
      c.env,
      "INSERT INTO attendance_reviews(operation_id,company_id,actor,decision,reason,decided_at) VALUES(?,?,?,?,?,?)",
      op.id,
      actor.company_id,
      actor.id,
      b.decision,
      b.reason,
      now,
    ),
  ];
  if (b.decision === "approve") {
    if (!op.branch_id || !op.device_hash)
      fail(409, "حدث قديم دون سياق كافٍ. ارفضه مع السبب");
    if (event.deviceTime > now || event.deviceTime > op.received_at)
      fail(409, "وقت الحدث بعد استلامه. ارفضه وراجع وقت الجهاز");
    if (target.status !== "active") fail(409, "العضوية غير فعالة");
    const open = await stmt(
      c.env,
      "SELECT id,in_at FROM attendance_logs WHERE company_id=? AND membership_id=? AND out_at IS NULL",
      actor.company_id,
      target.id,
    ).first<any>();
    if (event.action === "in") {
      if (open) fail(409, "في جلسة مفتوحة. راجع الخروج أولاً");
      const date = new Intl.DateTimeFormat("en-CA", {
        timeZone: c.get("company").timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(event.deviceTime);
      operations.push(
        stmt(
          c.env,
          "INSERT INTO attendance_logs(id,company_id,membership_id,branch_id,in_at,in_lat,in_lng,device_hash,work_date) VALUES(?,?,?,?,?,?,?,?,?)",
          op.id,
          actor.company_id,
          target.id,
          op.branch_id,
          event.deviceTime,
          event.lat,
          event.lng,
          op.device_hash,
          date,
        ),
      );
    } else {
      if (!open || event.deviceTime < open.in_at)
        fail(409, "ما في دخول سابق مناسب. راجع الأحداث بالترتيب");
      operations.push(
        stmt(
          c.env,
          "UPDATE attendance_logs SET out_at=?,out_lat=?,out_lng=? WHERE id=? AND company_id=?",
          event.deviceTime,
          event.lat,
          event.lng,
          open.id,
          actor.company_id,
        ),
      );
    }
  }
  operations.push(
    stmt(
      c.env,
      "UPDATE sync_operations SET status=?,result=? WHERE id=? AND company_id=?",
      result.status,
      JSON.stringify(result),
      op.id,
      actor.company_id,
    ),
  );
  operations.push(
    audit(
      c.env,
      c.get("session"),
      actor.company_id,
      "attendance." + b.decision,
      op.id,
      b.reason,
      { status: result.status },
      { status: op.status },
    ),
  );
  operations.push(
    stmt(
      c.env,
      "INSERT INTO notifications(id,company_id,recipient,title,body,url,created_at) VALUES(?,?,?,?,?,?,?)",
      id(),
      actor.company_id,
      target.id,
      b.decision === "approve" ? "تم اعتماد حدث الحضور" : "تم رفض حدث الحضور",
      b.reason,
      "/?view=attendance",
      now,
    ),
  );
  try {
    await c.env.DB.batch(operations);
  } catch (e) {
    if (
      /constraint|review_conflict|attendance_overlap|attendance_already_closed/i.test(
        String(e),
      )
    )
      fail(409, "تعارض مع حدث آخر. حدّث القائمة وراجع التوقيت");
    throw e;
  }
  return c.json(result);
});

app.get("/api/dashboard", async (c) => {
  const m = c.get("member"),
    scope = memberScope(m),
    items = (
      await stmt(
        c.env,
        `SELECT m.id,m.role,u.name,b.name AS branch,a.in_at,a.out_at,a.in_lat,a.in_lng FROM memberships m JOIN users u ON u.id=m.user_id LEFT JOIN branches b ON b.id=m.branch_id AND b.company_id=m.company_id LEFT JOIN attendance_logs a ON a.id=(SELECT a2.id FROM attendance_logs a2 WHERE a2.company_id=m.company_id AND a2.membership_id=m.id ORDER BY a2.in_at DESC LIMIT 1) WHERE m.company_id=? AND m.status='active'` +
          scope.sql,
        m.company_id,
        ...scope.args,
      ).all<any>()
    ).results;
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: c.get("company").timezone,
  }).format(Date.now());
  for (const item of items) {
    item.present = !!item.in_at && !item.out_at;
    item.today =
      !!item.in_at &&
      new Intl.DateTimeFormat("en-CA", {
        timeZone: c.get("company").timezone,
      }).format(item.in_at) === today;
  }
  return c.json({
    items,
    total: items.length,
    present: items.filter((x) => x.present).length,
    left: items.filter((x) => x.today && x.out_at).length,
  });
});
app.get("/api/notifications", async (c) => {
  const m = c.get("member");
  return c.json({
    items: (
      await stmt(
        c.env,
        "SELECT * FROM notifications WHERE company_id=? AND recipient=? ORDER BY created_at DESC LIMIT 100",
        m.company_id,
        m.id,
      ).all()
    ).results,
  });
});
app.post("/api/notifications/:id/read", async (c) => {
  const m = c.get("member");
  await stmt(
    c.env,
    "UPDATE notifications SET read_at=? WHERE id=? AND company_id=? AND recipient=?",
    Date.now(),
    uuid.parse(c.req.param("id")),
    m.company_id,
    m.id,
  ).run();
  return c.json({ ok: true });
});
app.post("/api/push/subscribe", async (c) => {
  const b = z
      .object({
        endpoint: z.string().url().max(2000),
        keys: z.object({
          p256dh: z.string().min(20).max(200),
          auth: z.string().min(10).max(100),
        }),
      })
      .parse(await c.req.json()),
    url = new URL(b.endpoint);
  if (
    url.protocol !== "https:" ||
    (!["fcm.googleapis.com", "updates.push.services.mozilla.com"].includes(
      url.hostname,
    ) &&
      !url.hostname.endsWith(".push.apple.com"))
  )
    fail(400, "خدمة الإشعار غير مدعومة");
  const m = c.get("member"),
    old = await stmt(
      c.env,
      "SELECT m.user_id FROM push_subscriptions p JOIN memberships m ON m.id=p.membership_id AND m.company_id=p.company_id WHERE p.endpoint=?",
      b.endpoint,
    ).first<any>();
  if (old && old.user_id !== m.user_id)
    fail(409, "الإشعارات مربوطة بعضوية ثانية على هالمتصفح");
  await stmt(
    c.env,
    "INSERT INTO push_subscriptions(id,company_id,membership_id,endpoint,subscription) VALUES(?,?,?,?,?) ON CONFLICT(company_id,membership_id,endpoint) DO UPDATE SET subscription=excluded.subscription",
    id(),
    m.company_id,
    m.id,
    b.endpoint,
    JSON.stringify(b),
  ).run();
  return c.json({ ok: true });
});
app.get("/api/audit", async (c) => {
  roles(c, "gm");
  return c.json({
    items: (
      await stmt(
        c.env,
        "SELECT * FROM audit_logs WHERE company_id=? ORDER BY created_at DESC LIMIT 100",
        c.get("member").company_id,
      ).all()
    ).results,
  });
});
app.post("/api/members/:id/assignment", async (c) => {
  roles(c, "gm");
  const target = await allowedTarget(c, uuid.parse(c.req.param("id"))),
    b = z
      .object({
        branchId: uuid,
        departmentId: uuid.nullable(),
        reason: z.string().min(3),
      })
      .parse(await c.req.json());
  if (
    !(await stmt(
      c.env,
      "SELECT id FROM branches WHERE company_id=? AND id=?",
      target.company_id,
      b.branchId,
    ).first())
  )
    fail(400, "الفرع غير صحيح");
  if (
    b.departmentId &&
    !(await stmt(
      c.env,
      "SELECT id FROM departments WHERE company_id=? AND id=?",
      target.company_id,
      b.departmentId,
    ).first())
  )
    fail(400, "القسم غير صحيح");
  const changes = [
    stmt(
      c.env,
      "UPDATE memberships SET branch_id=?,department_id=? WHERE id=? AND company_id=?",
      b.branchId,
      b.departmentId,
      target.id,
      target.company_id,
    ),
    audit(
      c.env,
      c.get("session"),
      target.company_id,
      "member.assignment",
      target.id,
      b.reason,
      b,
      { branchId: target.branch_id, departmentId: target.department_id },
    ),
  ];
  if (target.role === "manager") {
    changes.push(
      stmt(
        c.env,
        "DELETE FROM manager_scopes WHERE membership_id=? AND company_id=?",
        target.id,
        target.company_id,
      ),
    );
    changes.push(
      stmt(
        c.env,
        "INSERT INTO manager_scopes(id,company_id,membership_id,branch_id,department_id) VALUES(?,?,?,?,?)",
        id(),
        target.company_id,
        target.id,
        b.branchId,
        b.departmentId,
      ),
    );
  }
  await c.env.DB.batch(changes);
  return c.json({ ok: true });
});
app.notFound((c) => c.json({ error: "المسار غير موجود" }, 404));
export { app };
export default {
  fetch: app.fetch,
  async scheduled(
    _event: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(
      (async () => {
        await stmt(
          env,
          "UPDATE companies SET status='expired' WHERE status IN ('trial','active') AND ends_at<=?",
          Date.now(),
        ).run();
        await deliver(env);
      })(),
    );
  },
};
