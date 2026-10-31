import { expect, it } from "vitest";
import { wallTime, shiftWindow } from "../packages/domain/shift-window";
const night = { name: "Night", start: "20:00", end: "04:00" };
it.each([
  ["2026-03-28", 420],
  ["2026-10-24", 540],
  ["2026-10-28", 480],
])("resolves a Berlin overnight shift on %s", (date, minutes) => {
  const result = shiftWindow(String(date), night, "Europe/Berlin");
  expect(result).toMatchObject({
    status: "resolved",
    workDate: date,
    elapsedMinutes: minutes,
    wallMinutes: 480,
  });
});
it("keeps a midnight-start shift on its planned date", () => {
  expect(
    shiftWindow(
      "2026-10-29",
      { name: "Early", start: "00:00", end: "08:00" },
      "Europe/Berlin",
    ),
  ).toMatchObject({
    workDate: "2026-10-29",
    endDate: "2026-10-29",
    elapsedMinutes: 480,
  });
});
it("reports nonexistent spring time instead of shifting it silently", () => {
  expect(wallTime("2026-03-29", "02:30", "Europe/Berlin")).toEqual({
    status: "missing",
    candidates: [],
  });
});
it("reports both autumn occurrences without choosing one", () => {
  const result = wallTime("2026-10-25", "02:30", "Europe/Berlin");
  expect(result.status).toBe("ambiguous");
  expect(result.candidates[1] - result.candidates[0]).toBe(3_600_000);
  expect(
    shiftWindow(
      "2026-10-25",
      { name: "Ambiguous", start: "02:30", end: "08:00" },
      "Europe/Berlin",
    ).status,
  ).toBe("needs_review");
});
it("supports fractional timezone offsets", () => {
  expect(wallTime("2026-10-29", "08:00", "Asia/Kathmandu").candidates).toEqual([
    Date.parse("2026-10-29T02:15:00Z"),
  ]);
});
it("handles end date in the next year", () => {
  expect(shiftWindow("2026-12-31", night, "Asia/Damascus")).toMatchObject({
    endDate: "2027-01-01",
    elapsedMinutes: 480,
  });
});
it("rejects invalid zones, dates, and clock times", () => {
  expect(() => wallTime("2026-02-30", "08:00", "Europe/Berlin")).toThrow();
  expect(() => wallTime("2026-10-29", "24:00", "Europe/Berlin")).toThrow();
  expect(() => wallTime("2026-10-29", "08:00", "Unknown/Zone")).toThrow();
});
