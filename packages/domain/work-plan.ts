import { z } from "zod";
import { shiftSchema, breakPolicySchema } from "./work-time";
export const workDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(s + "T00:00:00Z");
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
  });
// Weekday indexes are ISO: Monday first. null means no scheduled shift.
export const workPlanSchema = z
  .object({
    schedule: z.discriminatedUnion("mode", [
      z
        .object({
          mode: z.literal("fixed"),
          days: z.array(shiftSchema.nullable()).length(7),
        })
        .strict(),
      z
        .object({
          mode: z.literal("target"),
          period: z.enum(["daily", "weekly"]),
          minutes: z.number().int().positive().max(10080),
          days: z
            .array(z.number().int().min(0).max(6))
            .min(1)
            .max(7)
            .refine((d) => new Set(d).size === d.length),
        })
        .strict()
        .refine((s) => s.period !== "daily" || s.minutes <= 1440),
    ]),
    breakPolicy: breakPolicySchema,
    reminderGraceMinutes: z.number().int().min(0).max(120).default(5),
    graceMinutes: z.number().int().min(0).max(240).default(10),
    cutoff: z
      .string()
      .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
      .default("04:00"),
  })
  .strict();
export { companyDate } from "./company-date";
