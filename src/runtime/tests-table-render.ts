/**
 * DS tests-table panel — columns name | status | trend | stability.
 * Trend uses sparkline primitive; stability uses dots + flaky badge.
 */
import type { KitTestsTableData } from "../types.js";
import { buildSparkline, readSparklineTheme } from "./sparkline-render.js";
import { buildStabilityCell } from "./stability-cell-render.js";

const DEFAULT_COLUMNS = {
  ru: ["Тест", "Статус", "Тренд", "Стабильность"],
  en: ["Test", "Status", "Trend", "Stability"],
} as const;

const DEFAULT_EMPTY_ROWS = {
  ru: "Нет тестов в прогоне.",
  en: "No tests in this run.",
} as const;

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

export interface RenderTestsTableOptions {
  cssVar: (name: string, fallback?: string) => string;
  isDark: () => boolean;
}

export function renderTestsTableHost(
  host: HTMLElement,
  data: KitTestsTableData,
  options: RenderTestsTableOptions,
): void {
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

  const table = document.createElement("table");
  table.className = "tests-table-panel__table";
  table.dataset.testid = "tests-table-panel";

  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const column of columns) {
    const th = document.createElement("th");
    th.textContent = column;
    headRow.append(th);
  }
  head.append(headRow);
  table.append(head);

  const body = document.createElement("tbody");

  for (const row of rows) {
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
    body.append(tr);
  }

  table.append(body);
  scroll.append(table);
  host.replaceChildren(scroll);
}
