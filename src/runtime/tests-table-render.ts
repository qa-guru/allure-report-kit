/**
 * DS tests-table panel — columns name | status | trend | stability.
 * Trend uses sparkline primitive; stability uses dots + flaky badge.
 *
 * Visible row count follows collage parity: slice to host height (no scroll
 * viewport). ResizeObserver on the tile body recalculates maxRows on resize.
 */
import type { KitTestsTableData, KitTestsTableRow } from "../types.js";
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

function fillTableBody(
  tbody: HTMLTableSectionElement,
  rows: KitTestsTableRow[],
  lang: "ru" | "en",
  theme: SparklineTheme,
): void {
  tbody.replaceChildren(...rows.map((row) => buildRow(row, lang, theme)));
}

function buildTableShell(columns: string[]): HTMLTableElement {
  const table = document.createElement("table");
  table.className = "tests-table-panel__table";
  table.dataset.testid = "tests-table-panel";

  const colgroup = document.createElement("colgroup");
  for (const className of COLUMN_CLASSES) {
    const col = document.createElement("col");
    col.className = className;
    colgroup.append(col);
  }
  table.append(colgroup);

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

  const scroll = document.createElement("div");
  scroll.className = "tests-table-panel";

  const table = buildTableShell(columns);
  const tbody = table.querySelector("tbody");
  if (!tbody) {
    throw new Error("renderTestsTableHost: table body missing");
  }

  const syncRows = (): void => {
    const hostHeight = host.clientHeight || host.getBoundingClientRect().height;
    const metrics = resolveTestsTableMetrics(host);
    const maxRows = testsTableMaxRows(hostHeight, metrics);
    tbody.dataset.maxRows = String(maxRows);
    fillTableBody(tbody, rows.slice(0, maxRows), lang, theme);
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
