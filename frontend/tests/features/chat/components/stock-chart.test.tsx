import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StockChart } from "@/features/chat/components/stock-chart";
import type { ChartSpec } from "@/lib/chart";

const spec: ChartSpec = {
  type: "price",
  title: "NVDA",
  subtitle: "Daily close · 2026-11-17 – 2026-11-19",
  unit: "currency",
  dates: ["2026-11-17", "2026-11-18", "2026-11-19"],
  series: [
    { name: "Close", values: [150, 151, 145.98], role: "primary" },
    { name: "SMA 20", values: [null, null, 185.73], role: "overlay" },
  ],
  volume: [1_000_000, 2_000_000, 3_000_000],
  stats: [{ label: "1 day", value: "-3.3%", tone: "down" }],
  source: "Alpha Vantage",
};

describe("StockChart", () => {
  it("describes the chart and shows its stats", () => {
    render(<StockChart spec={spec} />);

    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("NVDA");
    expect(screen.getByText("-3.3%").className).toContain("text-down");
    expect(screen.getAllByText("Nov 19").length).toBeGreaterThan(0);
  });

  it("moves the readout with the arrow keys", () => {
    render(<StockChart spec={spec} />);
    const chart = screen.getByRole("img");

    fireEvent.keyDown(chart, { key: "ArrowLeft" });

    // The header readout now shows the previous day's close.
    expect(screen.getByText("151.00")).toBeTruthy();
  });
});
