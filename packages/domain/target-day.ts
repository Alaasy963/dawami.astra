import { dateOffset, wallTime } from "./shift-window";
import { workdayTime, type ClosedSession } from "./work-time";
import { workPlanSchema } from "./work-plan";
import type { z } from "zod";
export function targetDayBounds(
  date: string,
  timezone: string,
  cutoff: string,
) {
  const start = wallTime(date, cutoff, timezone),
    end = wallTime(dateOffset(date, 1), cutoff, timezone);
  if (start.status !== "resolved" || end.status !== "resolved") return null;
  return { startAt: start.candidates[0], endAt: end.candidates[0] };
}
export function targetDayTotal(
  date: string,
  plan: z.infer<typeof workPlanSchema>,
  sessions: ClosedSession[],
) {
  if (plan.schedule.mode !== "target")
    throw new Error("Not an hours-target plan");
  const total = workdayTime(sessions, plan.breakPolicy);
  const weekday = (new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7;
  const requiredMs =
    plan.schedule.period === "daily"
      ? plan.schedule.days.includes(weekday)
        ? plan.schedule.minutes * 60000
        : 0
      : null;
  return {
    ...total,
    requiredMs,
    missingMs:
      requiredMs === null ? null : Math.max(0, requiredMs - total.netMs),
    overtimeMs:
      requiredMs === null ? null : Math.max(0, total.netMs - requiredMs),
  };
}
export function latenessMs(
  firstIn: number | null,
  start: number,
  graceMinutes = 10,
) {
  if (firstIn === null) return 0;
  return Math.max(0, firstIn - start - graceMinutes * 60000);
}
