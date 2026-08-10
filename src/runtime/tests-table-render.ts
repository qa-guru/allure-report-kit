/**
 * DS tests-table panel — columns name | status | trend | stability.
 * Trend uses sparkline primitive; stability uses dots + flaky badge.
 *
 * Visible row count follows collage parity: slice to host height (no scroll
 * viewport). ResizeObserver on the tile body recalculates maxRows on resize.
 */
import type { KitTestsTableData, KitTestsTableHistoryPoint, KitTestsTableRow } from "../types.js";
import { buildSparkline, readSparklineTheme, type SparklineTheme } from "./sparkline-render.js";
import { buildStabilityCell } from "./stability-cell-render.js";

const DEFAULT_COLUMNS = {
  ru: ["Тест", "Статус", "Тренд", "Стабильность"],
  en: ["Test", "Status", "Trend", "Stability"],
} as const;

const DEFAULT_EMPTY_ROWS = {
  ru: "Нет тестов в прогоне.",
  en: "No tests in this run.",
} as const;

/** Builder palette thumb — fixed row count, no height slice. */
export const PALETTE_MICRO_ROWS = 5;

const PALETTE_SHORT_NAMES = ["login", "reject", "checkout", "api", "legacy"] as const;

type CssVarReader = (name: string, fallback?: string) => string;

const COLUMN_CLASSES = [
  "tests-table-panel__name",
  "tests-table-panel__status",
  "tests-table-panel__trend",
  "tests-table-panel__stability",
] as const;

/** Collage `testsTable.ts` header row height — keep in sync with CSS thead tr height. */
export const TESTS_TABLE_HEADER_H = 28;

/** Collage `testsTable.ts` data row height — keep in sync with CSS tbody tr height. */
export const TESTS_TABLE_ROW_H = 32;

/** Collage parity: `max(1, floor((height - headerH) / rowH))`. */
export interface TestsTableMetrics {
  headerH: number;
  rowH: number;
}

/** Row/header metrics from footprint tier on the host or ancestor tile. */
export function resolveTestsTableMetrics(host: HTMLElement): TestsTableMetrics {
  if (host.closest(".widget-tile--tier-micro, .tests-table-host--tier-micro")) {
    return { headerH: 0, rowH: 7 };
  }
  if (host.closest(".widget-tile--tier-compact, .tests-table-host--tier-compact")) {
    return { headerH: 18, rowH: 20 };
  }
  return { headerH: TESTS_TABLE_HEADER_H, rowH: TESTS_TABLE_ROW_H };
}

export function testsTableMaxRows(hostHeight: number, metrics?: TestsTableMetrics): number {
  const { headerH, rowH } = metrics ?? {
    headerH: TESTS_TABLE_HEADER_H,
    rowH: TESTS_TABLE_ROW_H,
  };
  if (hostHeight < 1) {
    return 1;
  }
  return Math.max(1, Math.floor((hostHeight - headerH) / rowH));
}

const teardownByHost = new WeakMap<HTMLElement, () => void>();

export function disconnectTestsTableHost(host: HTMLElement): void {
  teardownByHost.get(host)?.();
  teardownByHost.delete(host);
}

function statusLabel(status: string, lang: "ru" | "en"): string {
  const normalized = (status || "unknown").toLowerCase();
  const labels: Record<"ru" | "en", Record<string, string>> = {
    ru: {
      passed: "ПРОЙДЕН",
      failed: "УПАЛ",
      broken: "СЛОМАН",
      skipped: "ПРОПУЩЕН",
      unknown: "НЕИЗВЕСТЕН",
    },
    en: {
      passed: "PASSED",
      failed: "FAILED",
      broken: "BROKEN",
      skipped: "SKIPPED",
      unknown: "UNKNOWN",
    },
  };
  const table = labels[lang];
  return table[normalized] ?? "UNKNOWN";
}

function buildRow(
  row: KitTestsTableRow,
  lang: "ru" | "en",
  theme: SparklineTheme,
): HTMLTableRowElement {
  const status = (row.status || "unknown").toLowerCase();
  const tr = document.createElement("tr");
  tr.dataset.testid = "tests-table-row";
  if (row.id) {
    tr.dataset.rowKey = row.id;
  }

  const nameCell = document.createElement("td");
  nameCell.className = "tests-table-panel__name";
  const displayName = row.name || row.fullName || "—";
  nameCell.textContent = displayName;
  if (row.fullName && row.fullName !== displayName) {
    nameCell.title = row.fullName;
  }

  const statusCell = document.createElement("td");
  statusCell.className = "tests-table-panel__status";
  const badge = document.createElement("span");
  badge.className = `badge badge--status-${status}`;
  badge.textContent = statusLabel(status, lang);
  statusCell.append(badge);

  const trendCell = document.createElement("td");
  trendCell.className = "tests-table-panel__trend";
  trendCell.append(buildSparkline(row.history, theme, { lang }));

  const stabilityCell = document.createElement("td");
  stabilityCell.className = "tests-table-panel__stability";
  stabilityCell.append(buildStabilityCell(row.flakyFlips, row.history, theme, { lang }));

  tr.append(nameCell, statusCell, trendCell, stabilityCell);
  return tr;
}

function isPaletteHost(host: HTMLElement): boolean {
  return Boolean(host.closest(".widget-tile--tier-micro, .tests-table-panel--palette"));
}

function paletteShortName(row: KitTestsTableRow, index: number): string {
  const preset = PALETTE_SHORT_NAMES[index];
  if (preset) {
    return preset;
  }
  const raw = row.name || row.id || "—";
  return raw.length > 10 ? raw.slice(0, 8) : raw;
}

function statusIndicatorTone(status: string): string {
  const normalized = (status || "unknown").toLowerCase();
  if (normalized === "passed") return "passed";
  if (normalized === "failed") return "failed";
  if (normalized === "broken") return "broken";
  return "skipped";
}

function paletteSparklineHistory(
  history: KitTestsTableHistoryPoint[] | undefined,
): KitTestsTableHistoryPoint[] {
  const points = (history ?? []).filter((point) => typeof point.durationSec === "number");
  if (points.length >= 2) {
    return points;
  }
  if (points.length === 1) {
    const single = points[0]!;
    return [single, { ...single }];
  }
  return [
    { status: "passed", durationSec: 1 },
    { status: "passed", durationSec: 1.1 },
  ];
}

function paletteTrendStroke(
  index: number,
  cssVar: CssVarReader,
  theme: SparklineTheme,
): string {
  switch (index) {
    case 1:
      return cssVar("--color-danger", theme.fail);
    case 2:
      return cssVar("--color-warning", theme.broken);
    case 4:
      return cssVar("--color-text-muted", theme.skip);
    default:
      return cssVar("--sparkline-accent", cssVar("--color-info", theme.accent));
  }
}

function buildPaletteRow(
  row: KitTestsTableRow,
  index: number,
  theme: SparklineTheme,
  lang: "ru" | "en",
  cssVar: CssVarReader,
): HTMLTableRowElement {
  const status = (row.status || "unknown").toLowerCase();
  const tr = document.createElement("tr");
  tr.dataset.testid = "tests-table-row";

  const nameCell = document.createElement("td");
  nameCell.className = "tests-table-panel__name";
  nameCell.textContent = paletteShortName(row, index);

  const statusCell = document.createElement("td");
  statusCell.className = "tests-table-panel__status";
  const dot = document.createElement("span");
  dot.className = `indicator indicator--${statusIndicatorTone(status)} indicator--solid`;
  dot.setAttribute("aria-hidden", "true");
  statusCell.append(dot);

  const trendCell = document.createElement("td");
  trendCell.className = "tests-table-panel__trend";
  trendCell.append(
    buildSparkline(paletteSparklineHistory(row.history), theme, {
      lang,
      width: 40,
      height: 12,
      stroke: paletteTrendStroke(index, cssVar, theme),
    }),
  );

  const stabilityCell = document.createElement("td");
  stabilityCell.className = "tests-table-panel__stability";
  stabilityCell.append(
    buildStabilityCell(row.flakyFlips, row.history, theme, { lang, limit: 4, hideFlaky: true }),
  );

  tr.append(nameCell, statusCell, trendCell, stabilityCell);
  return tr;
}

function fillTableBody(
  tbody: HTMLTableSectionElement,
  rows: KitTestsTableRow[],
  lang: "ru" | "en",
  theme: SparklineTheme,
  palette: boolean,
  cssVar: CssVarReader,
): void {
  if (palette) {
    tbody.replaceChildren(
      ...rows.map((row, index) => buildPaletteRow(row, index, theme, lang, cssVar)),
    );
    return;
  }
  tbody.replaceChildren(...rows.map((row) => buildRow(row, lang, theme)));
}

function buildTableShell(columns: string[], palette: boolean): HTMLTableElement {
  const table = document.createElement("table");
  table.className = "tests-table-panel__table";
  table.dataset.testid = "tests-table-panel";

  const colgroup = document.createElement("colgroup");
  const paletteColWidths = ["34%", "10%", "34%", "22%"] as const;
  for (const [index, className] of COLUMN_CLASSES.entries()) {
    const col = document.createElement("col");
    col.className = className;
    if (palette) {
      col.style.width = paletteColWidths[index] ?? "";
    }
    colgroup.append(col);
  }
  table.append(colgroup);

  if (!palette) {
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    for (const [index, column] of columns.entries()) {
      const th = document.createElement("th");
      th.className = COLUMN_CLASSES[index] ?? "";
      th.textContent = column;
      headRow.append(th);
    }
    head.append(headRow);
    table.append(head);
  }

  const body = document.createElement("tbody");
  table.append(body);

  return table;
}

export interface RenderTestsTableOptions {
  cssVar: (name: string, fallback?: string) => string;
  isDark: () => boolean;
}

export function renderTestsTableHost(
  host: HTMLElement,
  data: KitTestsTableData,
  options: RenderTestsTableOptions,
): void {
  disconnectTestsTableHost(host);

  const lang = data.lang ?? "ru";
  const columns = data.columns ?? [...DEFAULT_COLUMNS[lang]];
  const rows = data.rows ?? [];
  const theme = readSparklineTheme(options.cssVar, options.isDark());

  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "tests-table-panel__empty";
    empty.textContent = data.emptyRowsLabel?.[lang] ?? DEFAULT_EMPTY_ROWS[lang];
    host.replaceChildren(empty);
    return;
  }

  const palette = isPaletteHost(host);

  const scroll = document.createElement("div");
  scroll.className = palette ? "tests-table-panel tests-table-panel--palette" : "tests-table-panel";

  const table = buildTableShell(columns, palette);
  const tbody = table.querySelector("tbody");
  if (!tbody) {
    throw new Error("renderTestsTableHost: table body missing");
  }

  const syncRows = (): void => {
    const metrics = resolveTestsTableMetrics(host);
    const maxRows = palette
      ? Math.min(PALETTE_MICRO_ROWS, rows.length)
      : testsTableMaxRows(host.clientHeight || host.getBoundingClientRect().height, metrics);
    tbody.dataset.maxRows = String(maxRows);
    fillTableBody(tbody, rows.slice(0, maxRows), lang, theme, palette, options.cssVar);
  };

  scroll.append(table);
  host.replaceChildren(scroll);
  syncRows();

  let frame = 0;
  let observer: ResizeObserver | undefined;
  if (typeof ResizeObserver !== "undefined") {
    observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(syncRows);
    });
    observer.observe(host);
  }

  teardownByHost.set(host, () => {
    cancelAnimationFrame(frame);
    observer?.disconnect();
  });
}
