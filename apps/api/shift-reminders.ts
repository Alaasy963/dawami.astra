import type { Env } from "./types";
import { companyDate, workPlanSchema } from "../../packages/domain/work-plan";
import { dateOffset, shiftWindow } from "../../packages/domain/shift-window";
/** Bounded scan for the free plan; cursor rotates across open sessions. */
export async function queueShiftReminders(env: Env, now = Date.now()) {
  const key = "cron:shift-reminder-cursor";
  const cursor = await env.SESSIONS.get<{ last: string }>(key, "json");
  const rows = (
    await env.DB.prepare(
      "SELECT a.id,a.company_id,a.membership_id,a.in_at,c.timezone FROM attendance_logs a JOIN companies c ON c.id=a.company_id JOIN memberships m ON m.id=a.membership_id AND m.company_id=a.company_id WHERE a.out_at IS NULL AND a.id>? AND c.status IN ('active','trial') AND c.ends_at>? AND m.status='active' ORDER BY a.id LIMIT 5",
    )
      .bind(cursor?.last ?? "", now)
      .all<any>()
  ).results;
  for (const row of rows) {
    const local = companyDate(row.timezone, new Date(row.in_at));
    const candidates = [];
    for (const date of [dateOffset(local, -1), local]) {
      const record = await env.DB.prepare(
        "SELECT plan,timezone FROM work_plan_versions WHERE company_id=? AND membership_id=? AND effective_from<=? ORDER BY effective_from DESC,version DESC LIMIT 1",
      )
        .bind(row.company_id, row.membership_id, date)
        .first<any>();
      if (!record) continue;
      const plan = workPlanSchema.parse(JSON.parse(record.plan));
      if (plan.schedule.mode !== "fixed") continue;
      const weekday = (new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7,
        shift = plan.schedule.days[weekday];
      if (!shift) continue;
      const window = shiftWindow(date, shift, record.timezone);
      if (
        window.status === "resolved" &&
        row.in_at < window.endAt &&
        (row.in_at >= window.startAt || date === local)
      )
        candidates.push(window);
    }
    // Prefer the shift containing the check-in, otherwise the same-day upcoming shift.
    const containing = candidates.filter((w) => row.in_at >= w.startAt);
    const window =
      containing.length === 1
        ? containing[0]
        : candidates.length === 1
          ? candidates[0]
          : null;
    if (!window || window.endAt > now) continue;
    const notificationId = "shift-end:" + row.id;
    const title = "انتهى شفتك",
      body = "لسّا عندك جلسة حضور مفتوحة. تذكّر تسجيل الخروج.",
      url = "/?view=attendance";
    await env.DB.batch([
      env.DB.prepare(
        "INSERT OR IGNORE INTO notifications(id,company_id,recipient,title,body,url,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM attendance_logs WHERE id=? AND company_id=? AND out_at IS NULL)",
      ).bind(
        notificationId,
        row.company_id,
        row.membership_id,
        title,
        body,
        url,
        now,
        row.id,
        row.company_id,
      ),
      env.DB.prepare(
        "INSERT OR IGNORE INTO notification_outbox(id,company_id,recipient,payload,attempts,next_at,status) SELECT ?,?,?,?,0,?,'pending' WHERE EXISTS(SELECT 1 FROM notifications WHERE id=? AND company_id=?)",
      ).bind(
        notificationId,
        row.company_id,
        row.membership_id,
        JSON.stringify({ title, body, url }),
        now,
        notificationId,
        row.company_id,
      ),
    ]);
  }
  await env.SESSIONS.put(
    key,
    JSON.stringify({ last: rows.length ? rows[rows.length - 1].id : "" }),
    { expirationTtl: 86400 },
  );
}
