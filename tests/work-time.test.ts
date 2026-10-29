import { describe, expect, it } from "vitest";
import {
  shiftSpan,
  workdayTime,
  compareTarget,
} from "../packages/domain/work-time";
const m = 60_000;
const session = (start: number, end: number) => ({
  inAt: start * m,
  outAt: end * m,
});
describe("phase 2 shift templates", () => {
  it.each([
    ["08:00", "16:00", 0, 480],
    ["20:00", "04:00", 1, 480],
    ["00:00", "08:00", 0, 480],
    ["16:00", "00:00", 1, 480],
    ["10:30", "15:00", 0, 270],
  ])("preserves %s–%s logical start date", (start, end, offset, duration) => {
    expect(shiftSpan({ name: "Shift", start, end })).toMatchObject({
      endDayOffset: offset,
      scheduledMinutes: duration,
    });
  });
  it.each([
    ["24:00", "08:00"],
    ["8:00", "16:00"],
    ["08:60", "16:00"],
    ["08:00", "08:00"],
  ])("rejects ambiguous/invalid times %s–%s", (start, end) => {
    expect(() => shiftSpan({ name: "Shift", start, end })).toThrow();
  });
});
describe("approved break policy", () => {
  it("defaults to no deduction until configured", () => {
    expect(workdayTime([session(0, 480)])).toEqual({
      grossMs: 480 * m,
      breakMs: 0,
      netMs: 480 * m,
    });
  });
  it("does not deduct at exactly six hours", () => {
    expect(
      workdayTime([session(0, 360)], { deductionMinutes: 30 }).breakMs,
    ).toBe(0);
  });
  it("deducts once across split sessions after the strict threshold", () => {
    expect(
      workdayTime([session(0, 240), session(300, 540)], {
        deductionMinutes: 30,
      }),
    ).toEqual({ grossMs: 480 * m, breakMs: 30 * m, netMs: 450 * m });
  });
  it("does not credit overlaps twice, regardless of order", () => {
    expect(
      workdayTime([session(120, 300), session(0, 180), session(20, 50)])
        .grossMs,
    ).toBe(300 * m);
  });
  it("preserves timestamp duration through a timezone offset transition", () => {
    expect(
      workdayTime([
        {
          inAt: Date.parse("2026-10-25T01:00:00+02:00"),
          outAt: Date.parse("2026-10-25T04:00:00+01:00"),
        },
      ]).grossMs,
    ).toBe(240 * m);
  });
  it("never produces negative time after break deduction", () => {
    expect(
      workdayTime([session(0, 10)], {
        thresholdMinutes: 0,
        deductionMinutes: 30,
      }).netMs,
    ).toBe(0);
  });
  it("handles no sessions", () => expect(workdayTime([]).netMs).toBe(0));
  it("rejects reversed or open sessions", () => {
    expect(() => workdayTime([session(20, 10)])).toThrow();
    expect(() => workdayTime([{ inAt: 0, outAt: null } as any])).toThrow();
  });
});
describe("target comparison", () => {
  it("uses net time after the break", () => {
    const day = workdayTime([session(0, 510)], { deductionMinutes: 30 });
    expect(
      compareTarget([day.netMs], { mode: "daily", minutes: 480 }).overtimeMs,
    ).toBe(0);
  });
  it("balances a weekly target without summing daily excesses", () => {
    expect(
      compareTarget([600 * m, 360 * m], { mode: "weekly", minutes: 960 }),
    ).toMatchObject({ missingMs: 0, overtimeMs: 0 });
  });
  it("reports excess and shortage independently", () => {
    expect(
      compareTarget([500 * m], { mode: "daily", minutes: 480 }).overtimeMs,
    ).toBe(20 * m);
    expect(
      compareTarget([450 * m], { mode: "daily", minutes: 480 }).missingMs,
    ).toBe(30 * m);
  });
  it("rejects accidental multi-day daily calculation", () => {
    expect(() =>
      compareTarget([480 * m, 480 * m], { mode: "daily", minutes: 480 }),
    ).toThrow();
  });
});
