import webpush from "web-push";
import type { Env } from "./types";
export async function deliver(env: Env) {
  if (!env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY || !env.VAPID_SUBJECT)
    return;
  const jobs = await env.DB.prepare(
    "SELECT * FROM notification_outbox WHERE status='pending' AND next_at<=? ORDER BY next_at LIMIT 5",
  )
    .bind(Date.now())
    .all<any>();
  for (const job of jobs.results) {
    const subs = await env.DB.prepare(
      "SELECT * FROM push_subscriptions WHERE company_id=? AND membership_id=? LIMIT 5",
    )
      .bind(job.company_id, job.recipient)
      .all<any>();
    let failed = false;
    for (const sub of subs.results) {
      try {
        const detail = webpush.generateRequestDetails(
          JSON.parse(sub.subscription),
          job.payload,
          {
            vapidDetails: {
              subject: env.VAPID_SUBJECT,
              publicKey: env.VAPID_PUBLIC_KEY,
              privateKey: env.VAPID_PRIVATE_KEY,
            },
            TTL: 3600,
          },
        );
        const response = await fetch(detail.endpoint, {
          method: "POST",
          headers: detail.headers,
          body: detail.body as unknown as BodyInit,
        });
        if ([404, 410].includes(response.status))
          await env.DB.prepare(
            "DELETE FROM push_subscriptions WHERE id=? AND company_id=?",
          )
            .bind(sub.id, job.company_id)
            .run();
        else if (!response.ok) failed = true;
      } catch {
        failed = true;
      }
    }
    await env.DB.prepare(
      "UPDATE notification_outbox SET status=?,attempts=attempts+1,next_at=? WHERE id=? AND company_id=?",
    )
      .bind(
        failed ? "pending" : "sent",
        Date.now() + Math.min(3600000, 60000 * 2 ** job.attempts),
        job.id,
        job.company_id,
      )
      .run();
  }
}
