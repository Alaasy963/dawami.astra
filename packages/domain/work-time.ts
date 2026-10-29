import { z } from "zod";

const minute = 60_000;
const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const shiftSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    start: clock,
    end: clock,
  })
  .strict()
  .refine((shift) => shift.start !== shift.end, {
    message:
      "Shift start and end must differ; a 24-hour shift requires an explicit policy",
    path: ["end"],
  });

/** Wall-clock template only: not elapsed time across daylight-saving changes. */
export function shiftSpan(value: z.input<typeof shiftSchema>) {
  const shift = shiftSchema.parse(value);
  const minutes = (time: string) =>
    Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const startMinute = minutes(shift.start);
  const endMinute = minutes(shift.end);
  const endDayOffset = endMinute < startMinute ? 1 : 0;
  return {
    ...shift,
    startMinute,
    endMinute,
    endDayOffset,
    scheduledMinutes: endMinute + endDayOffset * 1440 - startMinute,
  };
}

export const breakPolicySchema = z
  .object({
    thresholdMinutes: z.number().int().min(0).max(1440).default(360),
    deductionMinutes: z.number().int().min(0).max(1440).default(0),
  })
  .strict();
const sessionSchema = z
  .object({
    inAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    outAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .strict()
  .refine((s) => s.outAt >= s.inAt, { message: "Checkout precedes check-in" });
export type ClosedSession = z.infer<typeof sessionSchema>;

/** Caller supplies accepted, closed sessions for ONE logical workday.
 * Open/pending sessions must never be silently included in approved totals.
 * Merge overlaps defensively so a millisecond is never credited twice.
 */
export function workdayTime(
  sessions: ClosedSession[],
  policy: z.input<typeof breakPolicySchema> = {},
) {
  const settings = breakPolicySchema.parse(policy);
  const sorted = z
    .array(sessionSchema)
    .parse(sessions)
    .sort((a, b) => a.inAt - b.inAt);
  let grossMs = 0,
    start = 0,
    end = 0;
  for (const session of sorted) {
    if (session.inAt > end) {
      grossMs += end - start;
      start = session.inAt;
      end = session.outAt;
    } else {
      end = Math.max(end, session.outAt);
    }
  }
  grossMs += end - start;
  const breakMs =
    grossMs > settings.thresholdMinutes * minute
      ? Math.min(grossMs, settings.deductionMinutes * minute)
      : 0;
  return { grossMs, breakMs, netMs: grossMs - breakMs };
}

const targetSchema = z
  .object({
    mode: z.enum(["daily", "weekly"]),
    minutes: z
      .number()
      .int()
      .positive()
      .max(7 * 1440),
  })
  .strict();
/** Pass each day's target separately in daily mode, or one week's net totals
 * in weekly mode. Never add daily overtime to weekly overtime.
 */
export function compareTarget(
  netDurationsMs: number[],
  target: z.infer<typeof targetSchema>,
) {
  const plan = targetSchema.parse(target);
  const durations = z
    .array(z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER))
    .parse(netDurationsMs);
  if (plan.mode === "daily" && durations.length !== 1)
    throw new Error("Daily comparison requires exactly one logical workday");
  const actualMs = durations.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(actualMs))
    throw new Error("Duration exceeds safe integer range");
  const requiredMs = plan.minutes * minute;
  return {
    actualMs,
    requiredMs,
    missingMs: Math.max(0, requiredMs - actualMs),
    overtimeMs: Math.max(0, actualMs - requiredMs),
  };
}
