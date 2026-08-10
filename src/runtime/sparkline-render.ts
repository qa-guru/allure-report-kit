/**
 * DS sparkline primitive in TypeScript — kept in sync with
 * design-system/js/sparkline.js (vendored CSS via sync:ds).
 */
import type { KitTestsTableHistoryPoint } from "../types.js";

export interface SparklineTheme {
  accent: string;
  pass: string;
  fail: string;
  broken: string;
  skip: string;
}

const DEFAULT_EMPTY_LABEL = {
  en: "No history",
  ru: "Нет истории",
} as const;

export function resolveSparklineEmptyLabel(lang: "ru" | "en" = "ru"): string {
  return DEFAULT_EMPTY_LABEL[lang] ?? DEFAULT_EMPTY_LABEL.en;
}

export function statusSparkColor(status: string | undefined, theme: SparklineTheme): string {
  const normalized = (status || "unknown").toLowerCase();
  if (normalized === "passed") return theme.pass;
  if (normalized === "failed") return theme.fail;
  if (normalized === "broken") return theme.broken;
  return theme.skip;
}

/**
 * Trend-line stroke by row status — passed keeps accent (info blue);
 * failed / broken / skipped use status-family colors (palette + collage parity).
 */
export function trendSparkColor(status: string | undefined, theme: SparklineTheme): string {
  const normalized = (status || "unknown").toLowerCase();
  if (normalized === "failed") return theme.fail;
  if (normalized === "broken") return theme.broken;
  if (normalized === "skipped" || normalized === "unknown") return theme.skip;
  return theme.accent;
}

export function sparklineThemeFromSite(siteTheme: "light" | "dark"): SparklineTheme {
  const isDark = siteTheme === "dark";
  return {
    accent: isDark ? "#38bdf8" : "#20aee3",
    pass: isDark ? "#4ade80" : "#16a34a",
    fail: isDark ? "#f87171" : "#dc2626",
    broken: isDark ? "#fbbf24" : "#d97706",
    skip: isDark ? "#94a3b8" : "#64748b",
  };
}

export function readSparklineTheme(
  cssVar: (name: string, fallback?: string) => string,
  isDark: boolean,
): SparklineTheme {
  const site = isDark ? "dark" : "light";
  const fromSite = sparklineThemeFromSite(site);
  return {
    accent: cssVar("--sparkline-accent", cssVar("--color-info", fromSite.accent)),
    pass: cssVar("--color-success", fromSite.pass),
    fail: cssVar("--color-danger", fromSite.fail),
    broken: cssVar("--color-warning", fromSite.broken),
    skip: cssVar("--color-text-muted", fromSite.skip),
  };
}

export interface BuildSparklineOptions {
  emptyLabel?: string;
  lang?: "ru" | "en";
  width?: number;
  height?: number;
  /** Overrides theme.accent — builder palette uses status-family strokes. */
  stroke?: string;
}

export function buildSparkline(
  history: KitTestsTableHistoryPoint[] | undefined,
  theme: SparklineTheme,
  options: BuildSparklineOptions = {},
): Element {
  const lang = options.lang ?? "ru";
  const emptyLabel = options.emptyLabel ?? resolveSparklineEmptyLabel(lang);
  const points = (history ?? []).filter((point) => typeof point.durationSec === "number");

  if (points.length < 2) {
    const empty = document.createElement("span");
    empty.className = "sparkline sparkline--empty";
    empty.textContent = emptyLabel;
    return empty;
  }

  const values = points.map((point) => point.durationSec as number);
  const width = options.width ?? 88;
  const height = options.height ?? 28;
  const pad = 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const coords = values.map((value, index) => {
    const x = pad + (index / (values.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (value - min) / range) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const polyline = coords.join(" ");
  const area = `${pad},${height - pad} ${polyline} ${width - pad},${height - pad}`;
  const label = values.map((value, index) => `R${index + 1}: ${value.toFixed(2)}s`).join(" · ");
  const stroke = options.stroke ?? theme.accent;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "sparkline sparkline--duration");
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", label);

  const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
  title.textContent = label;
  svg.append(title);

  const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  polygon.setAttribute("class", "sparkline__area");
  polygon.setAttribute("points", area);
  polygon.setAttribute("fill", stroke);
  polygon.setAttribute("fill-opacity", "0.14");

  const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  line.setAttribute("class", "sparkline__line");
  line.setAttribute("points", polyline);
  line.setAttribute("fill", "none");
  line.setAttribute("stroke", stroke);
  line.setAttribute("stroke-width", "1.5");
  line.setAttribute("stroke-linecap", "round");
  line.setAttribute("stroke-linejoin", "round");

  svg.append(polygon, line);
  return svg;
}
