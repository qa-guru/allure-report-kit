/**
 * DS stability-cell primitive in TypeScript — kept in sync with
 * design-system/js/stability-cell.js (vendored CSS via sync:ds).
 */
import type { KitTestsTableHistoryPoint } from "../types.js";
import { statusSparkColor, type SparklineTheme } from "./sparkline-render.js";

const DEFAULT_FLIPS_LABEL = {
  en: "Flaky flips",
  ru: "Флипы flaky",
} as const;

const STATUS_LABELS = {
  en: {
    passed: "PASSED",
    failed: "FAILED",
    broken: "BROKEN",
    skipped: "SKIPPED",
    unknown: "UNKNOWN",
  },
  ru: {
    passed: "ПРОЙДЕН",
    failed: "УПАЛ",
    broken: "СЛОМАН",
    skipped: "ПРОПУЩЕН",
    unknown: "НЕИЗВЕСТЕН",
  },
} as const;

export function stabilityStatusLabel(status: string, lang: "ru" | "en" = "ru"): string {
  const normalized = (status || "unknown").toLowerCase();
  const table = STATUS_LABELS[lang] ?? STATUS_LABELS.en;
  return table[normalized as keyof typeof table] ?? table.unknown;
}

export interface BuildStabilityCellOptions {
  lang?: "ru" | "en";
  flipsLabel?: string;
  limit?: number;
  /** Palette thumb — dots only, no flaky badge. */
  hideFlaky?: boolean;
}

export function buildStabilityCell(
  flakyFlips: number | undefined,
  history: KitTestsTableHistoryPoint[] | undefined,
  theme: SparklineTheme,
  options: BuildStabilityCellOptions = {},
): HTMLElement {
  const lang = options.lang ?? "ru";
  const flipsLabel = options.flipsLabel ?? DEFAULT_FLIPS_LABEL[lang] ?? DEFAULT_FLIPS_LABEL.en;
  const limit = options.limit ?? 10;
  const runs = (history ?? []).slice(-limit);
  const flips = flakyFlips ?? 0;

  const root = document.createElement("div");
  root.className = "stability-cell";

  if (flips > 0 && !options.hideFlaky) {
    const badge = document.createElement("span");
    badge.className = "badge badge--flaky";
    badge.title = `${flipsLabel}: ${flips}`;
    badge.textContent = String(flips);
    root.append(badge);
  }

  const dotsWrap = document.createElement("span");
  dotsWrap.className = "stability-dots";
  dotsWrap.setAttribute("aria-hidden", "true");

  if (runs.length) {
    for (const point of runs) {
      const status = (point.status || "unknown").toLowerCase();
      const dot = document.createElement("span");
      dot.className = `stability-dot stability-dot--${status}`;
      dot.style.background = statusSparkColor(point.status, theme);
      dot.title = stabilityStatusLabel(status, lang);
      dotsWrap.append(dot);
    }
  } else {
    dotsWrap.textContent = "—";
  }

  root.append(dotsWrap);
  return root;
}
