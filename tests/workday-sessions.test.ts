import { expect, it } from "vitest";
import { shiftWindow } from "../packages/domain/shift-window";
import {
  groupWorkdaySessions,
  type AttendanceSession,
} from "../packages/domain/workday-sessions";
const ms = (s: string) => Date.parse(s + "Z");
const session = (
  id: string,
  start: string,
  end: string | null,
  status: AttendanceSession["status"] = "accepted",
): AttendanceSession => ({
  id,
  inAt: ms(start),
  outAt: end ? ms(end) : null,
  status,
});
const day = (date: string, start = "20:00", end = "04:00") => ({
  window: shiftWindow(date, { name: "Shift", start, end }, "UTC"),
  breakPolicy: { thresholdMinutes: 360, deductionMinutes: 30 },
});
it("keeps an overnight session and post-midnight return on the start date", () => {
  const result = groupWorkdaySessions(
    [
      session("a", "2026-10-31T20:00", "2026-10-31T23:00"),
      session("b", "2026-11-01T00:00", "2026-11-01T04:00"),
    ],
    [day("2026-10-31")],
  );
  expect(result.days[0]).toMatchObject({
    workDate: "2026-10-31",
    sessionIds: ["a", "b"],
    grossMs: 420 * 60000,
    breakMs: 30 * 60000,
    netMs: 390 * 60000,
  });
  expect(result.review).toEqual([]);
  expect(result.complete).toBe(true);
});
it("uses real elapsed time across DST rather than wall-clock duration", () => {
  const result = groupWorkdaySessions(
    [session("a", "2026-10-24T18:00", "2026-10-25T03:00")],
    [
      {
        window: shiftWindow(
          "2026-10-24",
          { name: "Night", start: "20:00", end: "04:00" },
          "Europe/Berlin",
        ),
        breakPolicy: { deductionMinutes: 30 },
      },
    ],
  );
  expect(result.days[0].netMs).toBe(510 * 60000);
});
it("keeps an explicit midnight-start shift on its own date", () => {
  expect(
    groupWorkdaySessions(
      [session("a", "2026-11-01T00:00", "2026-11-01T08:00")],
      [day("2026-11-01", "00:00", "08:00")],
    ).days[0].sessionIds,
  ).toEqual(["a"]);
});
it("separates open and unapproved sessions from closed totals", () => {
  const result = groupWorkdaySessions(
    [
      session("open", "2026-10-31T20:00", null),
      session("pending", "2026-10-31T20:00", "2026-10-31T22:00", "pending"),
      session("review", "2026-10-31T20:00", "2026-10-31T22:00", "review"),
      session("rejected", "2026-10-31T20:00", "2026-10-31T22:00", "rejected"),
    ],
    [day("2026-10-31")],
  );
  expect(result.complete).toBe(false);
  expect(result.open).toEqual(["open"]);
  expect(result.excluded).toEqual(["pending", "review", "rejected"]);
  expect(result.days[0].netMs).toBe(0);
});
it("keeps early minutes for manager review and totals only the scheduled portion", () => {
  const input = session("a", "2026-10-31T19:45", "2026-10-31T22:00");
  const result = groupWorkdaySessions([input], [day("2026-10-31")]);
  expect(result.review).toEqual([
    {
      id: "a",
      reason: "early_arrival",
      earlyMs: 15 * 60000,
      workDate: "2026-10-31",
    },
  ]);
  expect(result.days[0].grossMs).toBe(120 * 60000);
  expect(result.complete).toBe(false);
  expect(input.inAt).toBe(ms("2026-10-31T19:45"));
});
it("flags sessions spanning two shifts instead of crediting the wrong day", () => {
  expect(
    groupWorkdaySessions(
      [session("a", "2026-10-31T20:00", "2026-11-01T22:00")],
      [day("2026-10-31"), day("2026-11-01")],
    ).review[0].reason,
  ).toBe("multiple_shifts");
});
it("merges overlapping accepted sessions so time is not counted twice", () => {
  const result = groupWorkdaySessions(
    [
      session("a", "2026-10-31T20:00", "2026-10-31T23:00"),
      session("b", "2026-10-31T22:00", "2026-11-01T00:00"),
    ],
    [day("2026-10-31")],
  );
  expect(result.days[0].grossMs).toBe(240 * 60000);
});
it("rejects duplicate identity records instead of quietly overwriting", () => {
  const a = session("a", "2026-10-31T20:00", "2026-10-31T23:00");
  expect(() => groupWorkdaySessions([a, a], [day("2026-10-31")])).toThrow();
  expect(() =>
    groupWorkdaySessions([], [day("2026-10-31"), day("2026-10-31")]),
  ).toThrow();
});
it("keeps invalid time records out of totals", () => {
  expect(
    groupWorkdaySessions(
      [session("a", "2026-10-31T23:00", "2026-10-31T20:00")],
      [day("2026-10-31")],
    ).review[0].reason,
  ).toBe("invalid_time");
});

it("counts approved early time but excludes rejected early time", () => {
  const a = session("a", "2026-10-31T19:45", "2026-10-31T22:00");
  expect(
    groupWorkdaySessions([a], [day("2026-10-31")], { a: "approve" }).days[0]
      .netMs,
  ).toBe(135 * 60000);
  const rejected = groupWorkdaySessions([a], [day("2026-10-31")], {
    a: "reject",
  });
  expect(rejected.days[0].netMs).toBe(120 * 60000);
  expect(rejected.review).toEqual([]);
});
