import { describe, expect, it } from "vitest";

import { formatValue, linePath, nearestIndex, niceTicks, shortDate, valueRange } from "@/lib/chart";

describe("chart geometry", () => {
  it("niceTicks covers the range with round steps", () => {
    expect(niceTicks(143.2, 239.9)).toEqual([125, 150, 175, 200, 225, 250]);
    expect(niceTicks(-12, 31)).toEqual([-20, 0, 20, 40]);
  });

  it("niceTicks pads a flat range", () => {
    const ticks = niceTicks(100, 100);
    expect(ticks[0]).toBeLessThan(100);
    expect(ticks[ticks.length - 1]).toBeGreaterThan(100);
  });

  it("valueRange skips nulls across series", () => {
    expect(
      valueRange([
        { name: "a", values: [null, 3, 1], role: "primary" },
        { name: "b", values: [7, null], role: "overlay" },
      ]),
    ).toEqual([1, 7]);
  });

  it("linePath breaks the line at nulls", () => {
    expect(linePath([null, 1, 2, null, 4], (i) => i, (v) => v)).toBe("M1.0,1.0L2.0,2.0M4.0,4.0");
  });

  it("nearestIndex clamps to the data", () => {
    expect(nearestIndex(-50, 0, 100, 11)).toBe(0);
    expect(nearestIndex(52, 0, 100, 11)).toBe(5);
    expect(nearestIndex(500, 0, 100, 11)).toBe(10);
  });

  it("formats values and dates", () => {
    expect(formatValue(12.345, "percent")).toBe("+12.3%");
    expect(formatValue(1234.5, "currency")).toBe("1,234.50");
    expect(shortDate("2026-11-19")).toBe("Nov 19");
  });
});
