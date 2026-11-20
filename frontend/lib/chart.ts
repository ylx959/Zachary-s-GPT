/**
 * Chart specs sent by backend tools (backend/app/tools/finance.py) as SSE
 * `{ chart }` events and stored with assistant messages, plus the pure
 * geometry the chart component draws with.
 */

export type ChartSeries = {
  name: string;
  /** One value per entry in `dates`; null where the series has no value yet (e.g. SMA warm-up). */
  values: (number | null)[];
  role: "primary" | "overlay";
};

export type ChartStat = { label: string; value: string; tone: "up" | "down" | null };

export type ChartSpec = {
  /** "price": one ticker with moving averages + volume. "compare": several tickers rebased to 0%. */
  type: "price" | "compare";
  title: string;
  subtitle: string;
  unit: "currency" | "percent";
  dates: string[];
  series: ChartSeries[];
  volume: number[] | null;
  stats: ChartStat[];
  source: string;
  highlight?: string;
};

/** Round, evenly spaced axis ticks covering [min, max] (about `count` of them). */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) {
    const pad = Math.abs(min) * 0.05 || 1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? 10 * magnitude;
  const ticks: number[] = [];
  for (let t = Math.floor(min / step) * step; t <= max + step * 1e-9; t += step) {
    ticks.push(Number(t.toFixed(10)));
  }
  if (ticks[ticks.length - 1] < max) ticks.push(Number((ticks[ticks.length - 1] + step).toFixed(10)));
  return ticks;
}

/** Min and max over every non-null value of the given series. */
export function valueRange(series: ChartSeries[]): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const s of series) {
    for (const v of s.values) {
      if (v === null) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  return [min, max];
}

/** SVG path through the points; null values break the line instead of drawing to zero. */
export function linePath(values: (number | null)[], x: (i: number) => number, y: (v: number) => number): string {
  let path = "";
  let pen = false;
  values.forEach((v, i) => {
    if (v === null) {
      pen = false;
      return;
    }
    path += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    pen = true;
  });
  return path;
}

/** Index of the data point nearest to a horizontal position. */
export function nearestIndex(px: number, left: number, width: number, count: number): number {
  if (count <= 1) return 0;
  const i = Math.round(((px - left) / width) * (count - 1));
  return Math.min(count - 1, Math.max(0, i));
}

export function formatValue(value: number, unit: ChartSpec["unit"]): string {
  if (unit === "percent") return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatVolume(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(0)}K`;
  return String(value);
}

/** "2026-11-19" -> "Nov 19" (UTC, so the label never shifts a day). */
export function shortDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
