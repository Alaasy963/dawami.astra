import { workdayTime, type ClosedSession } from "./work-time";
import { workDateSchema } from "./work-plan";
import type { shiftWindow } from "./shift-window";
import type { z } from "zod";
import { breakPolicySchema } from "./work-time";

type Window = ReturnType<typeof shiftWindow>;
export type AttendanceSession = {
  id: string;
  inAt: number;
  outAt: number | null;
  status: "accepted" | "pending" | "review" | "rejected";
};
type Day = { window: Window; breakPolicy: z.input<typeof breakPolicySchema> };
/** Conservative association for fixed schedules. Caller must supply ALL windows
 * spanning the queried sessions, including the previous/next logical day.
 * Early portions and multi-shift sessions remain explicit review items;
 * this function never guesses a work date or cuts an overnight session at midnight.
 */
export function groupWorkdaySessions(
  sessions: AttendanceSession[],
  days: Day[],
) {
  const seenDates = new Set<string>();
  for (const day of days) {
    workDateSchema.parse(day.window.workDate);
    breakPolicySchema.parse(day.breakPolicy);
    if (seenDates.has(day.window.workDate))
      throw new Error("Duplicate logical day");
    seenDates.add(day.window.workDate);
  }
  const grouped = new Map<string, ClosedSession[]>();
  const ids = new Map<string, string[]>();
  const review: Array<{
    id: string;
    reason: string;
    earlyMs?: number;
    workDate?: string;
  }> = [];
  const open: string[] = [],
    excluded: string[] = [];
  const seenIds = new Set<string>();
  for (const session of sessions) {
    if (seenIds.has(session.id))
      throw new Error("Duplicate attendance session");
    seenIds.add(session.id);
    if (session.status !== "accepted") {
      excluded.push(session.id);
      continue;
    }
    if (
      !Number.isSafeInteger(session.inAt) ||
      session.inAt < 0 ||
      (session.outAt !== null &&
        (!Number.isSafeInteger(session.outAt) || session.outAt < session.inAt))
    ) {
      review.push({ id: session.id, reason: "invalid_time" });
      continue;
    }
    if (session.outAt === null) {
      open.push(session.id);
      continue;
    }
    const windows = days
      .map((d) => d.window)
      .filter((w) => w.status === "resolved");
    let matches = windows.filter(
      (w) => session.inAt >= w.startAt && session.inAt < w.endAt,
    );
    if (!matches.length)
      matches = windows.filter(
        (w) => session.inAt < w.startAt && session.outAt! > w.startAt,
      );
    if (matches.length !== 1) {
      review.push({
        id: session.id,
        reason: matches.length ? "overlapping_shifts" : "no_unique_shift",
      });
      continue;
    }
    const match = matches[0];
    // A session extending into another scheduled shift cannot be silently assigned.
    if (
      windows.some(
        (w) =>
          w.workDate !== match.workDate &&
          session.inAt < w.endAt &&
          session.outAt! > w.startAt,
      )
    ) {
      review.push({ id: session.id, reason: "multiple_shifts" });
      continue;
    }
    // A nearby unresolved wall time means the supplied schedule is not safe to total.
    if (
      days.some(
        (d) =>
          d.window.status !== "resolved" &&
          (d.window.workDate === match.workDate ||
            d.window.workDate === match.endDate),
      )
    ) {
      review.push({ id: session.id, reason: "unresolved_shift" });
      continue;
    }
    const date = match.workDate;
    const countedStart = Math.max(session.inAt, match.startAt);
    if (countedStart > session.inAt)
      review.push({
        id: session.id,
        reason: "early_arrival",
        earlyMs: countedStart - session.inAt,
        workDate: date,
      });
    grouped.set(date, [
      ...(grouped.get(date) ?? []),
      { inAt: countedStart, outAt: session.outAt },
    ]);
    ids.set(date, [...(ids.get(date) ?? []), session.id]);
  }
  const totals = days.map((day) => ({
    workDate: day.window.workDate,
    sessionIds: ids.get(day.window.workDate) ?? [],
    ...workdayTime(grouped.get(day.window.workDate) ?? [], day.breakPolicy),
  }));
  const complete =
    review.length === 0 &&
    open.length === 0 &&
    days.every((d) => d.window.status === "resolved") &&
    sessions.every((s) => s.status !== "pending" && s.status !== "review");
  return { days: totals, review, open, excluded, complete };
}
