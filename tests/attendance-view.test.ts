import { expect, it } from "vitest";
import { attendanceView, elapsedTime } from "../apps/web/attendance-view";
import type { Operation } from "../apps/web/lib";
const op = (
  action: "in" | "out",
  deviceTime: number,
  state: Operation["state"] = "pending",
) => ({ action, deviceTime, state }) as Operation;
it("starts and restores an offline timer and stops on queued exit", () => {
  expect(attendanceView(undefined, [op("in", 1000)])).toEqual({
    in_at: 1000,
    provisional: true,
  });
  expect(
    attendanceView(undefined, [op("out", 5000), op("in", 1000)]),
  ).toBeNull();
});
it("uses server time after sync and does not reopen past rejected or approved events", () => {
  expect(
    attendanceView([{ in_at: 1200 }], [op("in", 1000, "accepted")]),
  ).toEqual({ in_at: 1200, provisional: false });
  expect(
    attendanceView(
      [{ in_at: 1000, out_at: 5000 }],
      [op("in", 1000, "accepted")],
    ),
  ).toBeNull();
  expect(attendanceView([], [op("in", 6000, "error")])).toBeNull();
});
it("overlays pending exit and later reentry on the last server snapshot", () => {
  expect(
    attendanceView([{ in_at: 1000 }], [op("out", 2000), op("in", 3000)]),
  ).toEqual({ in_at: 3000, provisional: true });
});
it("formats long shifts without wrapping at midnight or producing negative time", () => {
  expect(elapsedTime(0, 90061000)).toBe("25:01:01");
  expect(elapsedTime(1000, 0)).toBe("00:00:00");
});
