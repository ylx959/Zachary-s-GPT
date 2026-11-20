"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import {
  formatValue,
  formatVolume,
  linePath,
  nearestIndex,
  niceTicks,
  shortDate,
  valueRange,
  type ChartSpec,
} from "@/lib/chart";

const PRICE_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"];
const COMPARE_COLORS = ["var(--chart-1)", "var(--chart-4)", "var(--chart-2)", "var(--chart-3)"];

const PAD = { top: 10, right: 56, bottom: 24, left: 4 };
const PLOT_HEIGHT = 200;
const VOLUME_HEIGHT = 44;
const VOLUME_GAP = 10;
const X_LABELS = 4;

function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}

function toneClass(tone: "up" | "down" | null) {
  return tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-ink";
}

export function StockChart({ spec }: { spec: ChartSpec }) {
  const [wrapRef, width] = useWidth<HTMLDivElement>(600);
  const [hover, setHover] = useState<number | null>(null);
  const gradientId = useId();

  const count = spec.dates.length;
  const colors = spec.type === "compare" ? COMPARE_COLORS : PRICE_COLORS;
  const hasVolume = spec.type === "price" && !!spec.volume?.length;
  const height = PAD.top + PLOT_HEIGHT + (hasVolume ? VOLUME_GAP + VOLUME_HEIGHT : 0) + PAD.bottom;
  const plotWidth = width - PAD.left - PAD.right;

  const [rawMin, rawMax] = valueRange(spec.series);
  const ticks = niceTicks(spec.unit === "percent" ? Math.min(rawMin, 0) : rawMin, spec.unit === "percent" ? Math.max(rawMax, 0) : rawMax);
  const yMin = ticks[0] ?? rawMin;
  const yMax = ticks[ticks.length - 1] ?? rawMax;

  const x = (i: number) => PAD.left + (count <= 1 ? plotWidth / 2 : (i / (count - 1)) * plotWidth);
  const y = (v: number) => PAD.top + PLOT_HEIGHT - ((v - yMin) / (yMax - yMin || 1)) * PLOT_HEIGHT;

  const volumeTop = PAD.top + PLOT_HEIGHT + VOLUME_GAP;
  const maxVolume = hasVolume ? Math.max(...spec.volume!) : 0;
  const barWidth = Math.max(1, (plotWidth / Math.max(count, 1)) * 0.65);

  const xLabelIndexes = count <= 1 ? [0] : Array.from({ length: X_LABELS }, (_, k) => Math.round((k / (X_LABELS - 1)) * (count - 1)));

  const primary = spec.series.find((s) => s.role === "primary") ?? spec.series[0];
  const areaPath =
    spec.type === "price" && primary
      ? `${linePath(primary.values, x, y)}L${x(count - 1).toFixed(1)},${(PAD.top + PLOT_HEIGHT).toFixed(1)}L${x(0).toFixed(1)},${(PAD.top + PLOT_HEIGHT).toFixed(1)}Z`
      : null;

  const active = hover ?? count - 1;

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * width;
    setHover(nearestIndex(px, PAD.left, plotWidth, count));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const step = event.key === "ArrowLeft" ? -1 : 1;
    setHover((current) => Math.min(count - 1, Math.max(0, (current ?? count - 1) + step)));
  }

  const summary = `${spec.title}. ${spec.subtitle}. ${spec.stats.map((s) => `${s.label} ${s.value}`).join(", ")}.`;

  return (
    <figure className="w-full max-w-[640px] rounded-[18px] border border-line bg-surface px-4 pt-3.5 pb-3">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-ink">{spec.title}</p>
          <p className="text-[12px] text-muted">{spec.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[12px] tabular-nums" aria-live="polite">
          <span className="text-muted">{shortDate(spec.dates[active] ?? "")}</span>
          {spec.series.map((s, i) => {
            const v = s.values[active];
            return v === null || v === undefined ? null : (
              <span key={s.name} className="flex items-center gap-1">
                <span className="inline-block size-2 rounded-full" style={{ background: colors[i % colors.length] }} />
                <span className="text-muted">{s.name}</span>
                <span className="font-medium text-ink">{formatValue(v, spec.unit)}</span>
              </span>
            );
          })}
        </div>
      </figcaption>

      <dl className="mt-2.5 grid grid-cols-3 gap-x-3 gap-y-1.5 sm:grid-cols-6">
        {spec.stats.map((stat) => (
          <div key={stat.label} className="min-w-0">
            <dt className="truncate text-[11px] text-muted">{stat.label}</dt>
            <dd className={`text-[13px] font-medium tabular-nums ${toneClass(stat.tone)}`}>{stat.value}</dd>
          </div>
        ))}
      </dl>

      <div
        ref={wrapRef}
        className="relative mt-2 rounded-lg"
        role="img"
        aria-label={summary}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onBlur={() => setHover(null)}
      >
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="block max-w-full touch-none select-none"
          onPointerMove={onPointerMove}
          onPointerDown={onPointerMove}
          onPointerLeave={() => setHover(null)}
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={PAD.left + plotWidth} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray={t === 0 && spec.unit === "percent" ? undefined : "2 3"} />
              <text x={PAD.left + plotWidth + 8} y={y(t)} dy="0.32em" fontSize="11" fill="var(--muted)" className="tabular-nums">
                {formatValue(t, spec.unit).replace(/\.00$/, "")}
              </text>
            </g>
          ))}

          {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} />}

          {spec.series.map((s, i) => (
            <path
              key={s.name}
              d={linePath(s.values, x, y)}
              fill="none"
              stroke={colors[i % colors.length]}
              strokeWidth={s.role === "primary" ? (spec.highlight === s.name ? 2.4 : 1.8) : 1.3}
              strokeDasharray={s.role === "overlay" ? "4 3" : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {hasVolume &&
            spec.volume!.map((v, i) => {
              const h = maxVolume ? (v / maxVolume) * VOLUME_HEIGHT : 0;
              return (
                <rect
                  key={i}
                  x={x(i) - barWidth / 2}
                  y={volumeTop + VOLUME_HEIGHT - h}
                  width={barWidth}
                  height={h}
                  fill={i === active ? "var(--chart-1)" : "var(--line-strong)"}
                />
              );
            })}
          {hasVolume && (
            <text x={PAD.left + plotWidth + 8} y={volumeTop + 8} fontSize="10" fill="var(--muted)">
              Vol {formatVolume(spec.volume![active] ?? 0)}
            </text>
          )}

          {xLabelIndexes.map((i, k) => (
            <text
              key={i}
              x={x(i)}
              y={height - 6}
              fontSize="11"
              fill="var(--muted)"
              textAnchor={k === 0 ? "start" : k === xLabelIndexes.length - 1 ? "end" : "middle"}
            >
              {shortDate(spec.dates[i])}
            </text>
          ))}

          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={height - PAD.bottom} stroke="var(--muted)" strokeWidth="1" strokeDasharray="3 3" />
              {spec.series.map((s, i) => {
                const v = s.values[hover];
                return v === null || v === undefined ? null : (
                  <circle key={s.name} cx={x(hover)} cy={y(v)} r="3.5" fill="var(--surface)" stroke={colors[i % colors.length]} strokeWidth="2" />
                );
              })}
            </g>
          )}
        </svg>
      </div>

      <p className="mt-1 text-[11px] text-muted">
        Source: {spec.source} · Data analysis, not financial advice
      </p>
    </figure>
  );
}
