import { expect, it } from "vitest";
import {
  workPlanSchema,
  workDateSchema,
  companyDate,
} from "../packages/domain/work-plan";
it("validates the seven-day fixed schedule and applies explicit policy defaults", () => {
  const parsed = workPlanSchema.parse({
    schedule: { mode: "fixed", days: Array(7).fill(null) },
    breakPolicy: {},
  });
  expect(parsed.cutoff).toBe("04:00");
  expect(parsed.breakPolicy.deductionMinutes).toBe(0);
  expect(() =>
    workPlanSchema.parse({
      schedule: { mode: "fixed", days: [] },
      breakPolicy: {},
    }),
  ).toThrow();
});
it("rejects duplicate weekdays and impossible daily targets", () => {
  for (const schedule of [
    { mode: "target", period: "daily", minutes: 1441, days: [0] },
    { mode: "target", period: "weekly", minutes: 2400, days: [0, 0] },
  ])
    expect(() => workPlanSchema.parse({ schedule, breakPolicy: {} })).toThrow();
});
it("validates real dates including leap years", () => {
  expect(workDateSchema.parse("2028-02-29")).toBe("2028-02-29");
  expect(() => workDateSchema.parse("2026-02-29")).toThrow();
});
it("uses the company calendar date instead of the server date", () => {
  expect(companyDate("Asia/Damascus", new Date("2026-10-29T22:30:00Z"))).toBe(
    "2026-10-30",
  );
  expect(
    companyDate("America/New_York", new Date("2026-10-29T01:30:00Z")),
  ).toBe("2026-10-28");
});
