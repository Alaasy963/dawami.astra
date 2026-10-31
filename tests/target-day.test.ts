import { expect, it } from "vitest";
import {
  targetDayBounds,
  targetDayTotal,
  latenessMs,
} from "../packages/domain/target-day";
import { workPlanSchema } from "../packages/domain/work-plan";
it("uses cutoff-to-cutoff bounds with DST elapsed time", () => {
  const b = targetDayBounds("2026-10-24", "Europe/Berlin", "04:00")!;
  expect(b.endAt - b.startAt).toBe(25 * 3600000);
});
it("does not allocate daily overtime to a weekly target", () => {
  const plan = workPlanSchema.parse({
    schedule: {
      mode: "target",
      period: "weekly",
      minutes: 2400,
      days: [0, 1, 2, 3, 4],
    },
    breakPolicy: { deductionMinutes: 30 },
  });
  const total = targetDayTotal("2026-10-26", plan, [
    { inAt: 0, outAt: 600 * 60000 },
  ]);
  expect(total.netMs).toBe(570 * 60000);
  expect(total.overtimeMs).toBeNull();
});
it("subtracts grace from reported lateness", () => {
  expect(latenessMs(15 * 60000, 0)).toBe(5 * 60000);
  expect(latenessMs(10 * 60000, 0)).toBe(0);
  expect(latenessMs(null, 0)).toBe(0);
});
