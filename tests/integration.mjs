import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
const base = process.env.TEST_URL || "http://127.0.0.1:8787";
const stamp = String(Date.now()).slice(-9);
const secret = "Test-" + randomUUID();
let passed = 0;
const check = (condition, label) => {
  assert.ok(condition, label);
  passed++;
  console.log("PASS " + label);
};
function client() {
  let cookie = "",
    csrf = "";
  return {
    async request(path, body, method = body ? "POST" : "GET") {
      const response = await fetch(base + "/api" + path, {
        method,
        headers: {
          Origin: base,
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
          Cookie: cookie,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const set = response.headers.get("set-cookie");
      if (set) cookie = set.split(";")[0];
      const data = await response.json();
      if (data.csrf) csrf = data.csrf;
      return { status: response.status, data };
    },
    get cookie() {
      return cookie;
    },
  };
}
const a = client(),
  b = client(),
  worker = client(),
  scoped = client();
const device = "device-" + randomUUID();
const workerDevice = "worker-device-" + randomUUID();
let r = await a.request("/auth/signup", {
  company: "شركة الاختبار ألف",
  name: "مدير ألف",
  phone: "+963" + stamp + "1",
  pin: secret,
  device,
  currency: "SYP",
});
check(r.status === 201, "company A self-signup");
r = await b.request("/auth/signup", {
  company: "شركة الاختبار باء",
  name: "مدير باء",
  phone: "+963" + stamp + "2",
  pin: secret,
  device,
  currency: "USD",
});
check(r.status === 201, "company B self-signup");
const am = (await a.request("/auth/me")).data,
  bm = (await b.request("/auth/me")).data;
check(am.company.id !== bm.company.id, "distinct tenant sessions");
check(
  !("local_hash" in am.member) && !("device_hash" in am.member),
  "session response omits internal credentials",
);
check(am.company.ends_at > Date.now() + 13 * 86400000, "14 day trial");
const ba = await a.request("/branches", {
    name: "فرع دمشق",
    lat: 33.5138,
    lng: 36.2765,
    radius: 150,
  }),
  bb = await b.request("/branches", {
    name: "فرع شركة باء",
    lat: 33.5138,
    lng: 36.2765,
    radius: 150,
  });
check(ba.status === 201 && bb.status === 201, "branch creation");
r = await a.request("/members/" + am.member.id + "/assignment", {
  branchId: ba.data.id,
  departmentId: null,
  reason: "Set demo branch",
});
check(r.status === 200, "GM can be assigned attendance branch");
r = await a.request(
  "/branches/" + bb.data.id,
  { name: "هجوم", lat: 0, lng: 0, radius: 100, reason: "cross tenant" },
  "PUT",
);
check(r.status === 404, "reject other tenant branch update");
r = await a.request("/members", {
  name: "عامل متداخل",
  phone: "+963" + stamp + "3",
  pin: secret,
  role: "worker",
  branchId: bb.data.id,
});
check(r.status === 400, "reject cross-tenant member branch");
r = await a.request("/members", {
  name: "عامل تجريبي",
  phone: "+963" + stamp + "3",
  pin: secret,
  role: "worker",
  branchId: ba.data.id,
});
check(r.status === 201, "create worker with temporary PIN");
const member = r.data.id;
r = await worker.request("/auth/login", {
  phone: "+963" + stamp + "3",
  pin: secret,
  device: workerDevice,
});
check(r.status === 200, "worker login");
let wm = (await worker.request("/auth/me")).data;
check(wm.mustChange, "temporary PIN forces change");
r = await worker.request("/branches");
check(r.status === 403, "temporary session cannot use company API");
r = await worker.request("/auth/pin", {
  currentPin: secret,
  newPin: secret + "new",
});
check(r.status === 200, "PIN rotation");
await worker.request("/auth/me");
r = await worker.request("/device/bind", {});
check(r.status === 200, "first member device bind");
r = await worker.request("/audit");
check(r.status === 403, "worker cannot read audit");
r = await worker.request("/owner/companies");
check(r.status === 403, "tenant cannot read owner panel");
const operation = {
  id: randomUUID(),
  action: "in",
  deviceTime: Date.now(),
  lat: 33.5138,
  lng: 36.2765,
  accuracy: 8,
  offline: false,
};
r = await worker.request("/attendance/punch", operation);
check(
  r.status === 200 && r.data.status === "accepted",
  "server validated clock-in",
);
r = await worker.request("/attendance/punch", operation);
check(r.status === 200, "idempotent replay");
r = await worker.request("/attendance/punch", { ...operation, lat: 34 });
check(r.status === 409, "reject altered replay");
r = await worker.request("/attendance/punch", {
  ...operation,
  id: randomUUID(),
  lat: 34,
});
check(r.status === 400, "reject outside geofence");
r = await worker.request("/attendance/punch", {
  ...operation,
  id: randomUUID(),
  accuracy: 101,
});
check(r.status === 400, "reject poor GPS accuracy");
r = await worker.request("/attendance/punch", {
  ...operation,
  id: randomUUID(),
  action: "out",
});
check(r.status === 200, "clock-out");
r = await a.request("/notifications");
check(r.data.items.length >= 2, "manager notification inbox populated");
r = await b.request("/notifications");
check(r.data.items.length === 0, "other company receives no notification");

const interrupted = {
  ...operation,
  id: randomUUID(),
  deviceTime: Date.now(),
  offline: false,
};
r = await worker.request("/attendance/sync", interrupted);
check(
  r.status === 200 && r.data.status === "review",
  "unconfirmed online payload is held for review on retry without mutation",
);
r = await a.request("/attendance/reviews/" + interrupted.id, {
  decision: "reject",
  reason: "Synthetic interruption case",
});
check(r.status === 200, "interrupted request can be resolved");
const offlineIn = {
  ...operation,
  id: randomUUID(),
  deviceTime: Date.now(),
  offline: true,
};
r = await worker.request("/attendance/sync", offlineIn);
check(r.data.status === "review", "offline event is held for review");
r = await worker.request("/attendance/reviews");
check(r.status === 403, "worker cannot review attendance");
r = await b.request("/attendance/reviews/" + offlineIn.id, {
  decision: "approve",
  reason: "Other company attempt",
});
check(r.status === 404, "cross tenant review rejected");
r = await a.request("/attendance/reviews");
check(
  r.status === 200 && r.data.items.some((x) => x.id === offlineIn.id),
  "manager sees scoped pending review",
);
r = await a.request("/attendance/reviews/" + offlineIn.id, {
  decision: "approve",
  reason: "Verified the arrival with branch manager",
});
check(
  r.status === 200 && r.data.status === "accepted",
  "manager approves offline arrival",
);
r = await a.request("/attendance/reviews/" + offlineIn.id, {
  decision: "reject",
  reason: "Duplicate decision attempt",
});
check(r.status === 409, "review cannot be decided twice");
r = await worker.request("/attendance/sync", offlineIn);
check(
  r.data.status === "accepted",
  "worker replay receives final review decision",
);
const offlineOut = {
  ...offlineIn,
  id: randomUUID(),
  action: "out",
  deviceTime: Date.now(),
};
await worker.request("/attendance/sync", offlineOut);
r = await a.request("/attendance/reviews/" + offlineOut.id, {
  decision: "approve",
  reason: "Verified departure with the branch",
});
check(r.status === 200, "offline departure closes approved arrival");
const overlap = {
  ...offlineIn,
  id: randomUUID(),
  deviceTime: operation.deviceTime,
};
await worker.request("/attendance/sync", overlap);
r = await a.request("/attendance/reviews/" + overlap.id, {
  decision: "approve",
  reason: "Attempt to overlap prior attendance",
});
check(r.status === 409, "overlapping review rolls back");
r = await a.request("/attendance/reviews/" + overlap.id, {
  decision: "reject",
  reason: "Duplicate of existing attendance",
});
check(
  r.status === 200 && r.data.status === "error",
  "failed approval leaves review available for rejection",
);
r = await a.request("/audit");
check(
  r.data.items.filter(
    (x) => x.target === offlineIn.id && x.action === "attendance.approve",
  ).length === 1,
  "one audit for review decision",
);
r = await b.request("/members", {
  name: "عامل تجريبي",
  phone: "+963" + stamp + "3",
  pin: "Unused-123456",
  role: "worker",
  branchId: bb.data.id,
});
check(
  r.status === 201 && r.data.status === "invited",
  "existing identity receives invitation",
);
const invited = r.data.id;
const subscription = {
  endpoint: "https://fcm.googleapis.com/test-" + randomUUID(),
  keys: { p256dh: "a".repeat(80), auth: "b".repeat(24) },
};
r = await worker.request("/push/subscribe", subscription);
check(r.status === 200, "push registration in first membership");

r = await worker.request("/auth/accept-invitation", { membershipId: invited });
check(r.status === 200, "identity owner accepts invitation");
await worker.request("/auth/select", { membershipId: invited });
await worker.request("/auth/me");
r = await worker.request("/push/subscribe", subscription);
check(
  r.status === 200,
  "same identity subscribes across companies on one endpoint",
);
r = await b.request("/push/subscribe", subscription);
check(r.status === 409, "another identity cannot claim the push endpoint");

const outsideBranch = await a.request("/branches", {
  name: "Other branch",
  lat: 34,
  lng: 36,
  radius: 150,
});
const outsideWorker = await a.request("/members", {
  name: "Outside worker",
  phone: "+963" + stamp + "5",
  pin: secret,
  role: "worker",
  branchId: outsideBranch.data.id,
});
const scopedManager = await a.request("/members", {
  name: "Branch manager",
  phone: "+963" + stamp + "4",
  pin: secret,
  role: "manager",
  branchId: ba.data.id,
});
check(scopedManager.status === 201, "create branch manager");
const manager = client();
await manager.request("/auth/login", {
  phone: "+963" + stamp + "4",
  pin: secret,
  device: "manager-device-" + randomUUID(),
});
await manager.request("/auth/me");
await manager.request("/auth/pin", {
  currentPin: secret,
  newPin: secret + "manager",
});
await manager.request("/auth/me");
r = await manager.request("/members");
check(
  r.status === 200 &&
    !r.data.items.some((x) => x.id === outsideWorker.data.id) &&
    r.data.items.some((x) => x.id === member),
  "manager listing respects branch scope",
);
r = await manager.request("/members/" + outsideWorker.data.id + "/reset", {
  pin: secret + "denied",
  reason: "Outside scope attempt",
});
check(r.status === 403, "manager cannot reset outside scope");
r = await manager.request("/members/" + am.member.id + "/reset", {
  pin: secret + "denied",
  reason: "Escalation attempt",
});
check(r.status === 403, "manager cannot reset general manager");
r = await manager.request("/members/" + member + "/reset", {
  pin: secret + "managed",
  reason: "Authorized scoped recovery",
});
check(r.status === 200, "manager can reset own worker");
await manager.request("/device/bind", {});
const managerEvent = {
  id: randomUUID(),
  action: "in",
  deviceTime: Date.now() - 60000,
  lat: 33.5138,
  lng: 36.2765,
  accuracy: 8,
  offline: true,
};
r = await manager.request("/attendance/sync", managerEvent);
check(
  r.status === 200 && r.data.status === "review",
  "branch manager still requires offline review",
);
r = await manager.request("/attendance/reviews/" + managerEvent.id, {
  decision: "approve",
  reason: "Attempt self approval",
});
check(r.status === 403, "branch manager cannot self-approve");
r = await a.request("/attendance/reviews/" + managerEvent.id, {
  decision: "approve",
  reason: "General manager verified attendance",
});
check(r.status === 200, "GM reviews branch manager offline attendance");

r = await a.request("/members/" + member + "/reset", {
  pin: secret + "local",
  reason: "Manual manager recovery",
});
check(r.status === 200, "manager scoped reset");
r = await scoped.request("/auth/login", {
  phone: "+963" + stamp + "3",
  pin: secret + "local",
  companyId: am.company.id,
  device: workerDevice,
});
check(r.status === 200, "scoped recovery login");
await scoped.request("/auth/me");
r = await scoped.request("/auth/pin", {
  currentPin: secret + "local",
  newPin: secret + "local-new",
});
check(r.status === 200, "scoped PIN change");
await scoped.request("/auth/me");
r = await scoped.request("/auth/select", { membershipId: invited });
check(r.status === 403, "scoped session cannot switch company");
r = await scoped.request("/auth/accept-invitation", { membershipId: invited });
check(r.status === 403, "scoped session cannot accept global invitations");
check(
  (await a.request("/audit")).data.items.some((x) => x.action === "pin.reset"),
  "reset audit recorded",
);

const revokedCookie = scoped.cookie;
r = await scoped.request("/auth/logout", undefined, "POST");
check(r.status === 200, "logout accepts bodyless POST");
const revoked = await fetch(base + "/api/auth/me", {
  headers: { Cookie: revokedCookie },
});
check(revoked.status === 401, "logged-out session cannot be reused");
mkdirSync(".wrangler", { recursive: true });
writeFileSync(
  ".wrangler/test-session.json",
  JSON.stringify({
    cookie: a.cookie,
    company: am.company.id,
    member: am.member.id,
    phone: "+963" + stamp + "1",
    pin: secret,
    device,
  }),
);
console.log(`Integration assertions passed: ${passed}`);
