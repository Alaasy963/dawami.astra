import { shiftSpan, type shiftSchema } from "./work-time";
import { workDateSchema } from "./work-plan";
import type { z } from "zod";

export function dateOffset(date: string, days: number) {
  workDateSchema.parse(date);
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
/** Resolve wall-clock timestamps without silently choosing a DST occurrence. */
export function wallTime(date: string, time: string, timezone: string) {
  workDateSchema.parse(date);
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw new Error("Invalid clock time");
  const nominal = Date.parse(`${date}T${time}:00Z`);
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const localStamp = (timestamp: number) => {
    const parts = formatter.formatToParts(timestamp);
    const get = (type: string) => parts.find((p) => p.type === type)!.value;
    return Date.parse(
      `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}Z`,
    );
  };
  const offsets = new Set<number>();
  // Both sides of modern timezone transitions, including half-hour and date-line changes.
  for (let hours = -48; hours <= 48; hours += 6) {
    const sample = nominal + hours * 3_600_000;
    offsets.add(localStamp(sample) - sample);
  }
  const candidates = [...offsets]
    .map((offset) => nominal - offset)
    .filter((timestamp) => localStamp(timestamp) === nominal)
    .sort((a, b) => a - b);
  return {
    status:
      candidates.length === 0
        ? ("missing" as const)
        : candidates.length > 1
          ? ("ambiguous" as const)
          : ("resolved" as const),
    candidates,
  };
}
export function shiftWindow(
  date: string,
  shift: z.input<typeof shiftSchema>,
  timezone: string,
) {
  const span = shiftSpan(shift);
  const endDate = dateOffset(date, span.endDayOffset);
  const start = wallTime(date, span.start, timezone),
    end = wallTime(endDate, span.end, timezone);
  if (start.status !== "resolved" || end.status !== "resolved")
    return {
      status: "needs_review" as const,
      workDate: date,
      endDate,
      start,
      end,
    };
  const startAt = start.candidates[0],
    endAt = end.candidates[0];
  if (endAt <= startAt)
    return {
      status: "needs_review" as const,
      workDate: date,
      endDate,
      start,
      end,
    };
  return {
    status: "resolved" as const,
    workDate: date,
    endDate,
    startAt,
    endAt,
    elapsedMinutes: (endAt - startAt) / 60_000,
    wallMinutes: span.scheduledMinutes,
  };
}
