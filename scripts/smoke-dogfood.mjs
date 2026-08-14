#!/usr/bin/env node
/**
 * Headless smoke of the dogfood stand.
 *
 * Fails on any console error or page error, and asserts the vertical slice is
 * actually on screen: manifest tile order, one renderer per tile, indicator dots
 * derived from the drawn series, DS header mounted.
 *
 * Usage: node scripts/smoke-dogfood.mjs [url]
 */
import { chromium } from "playwright";

const URL_UNDER_TEST = process.argv[2] ?? "http://localhost:3021/dogfood/";

const EXPECTED_TILES = [
  { type: "custom", renderer: "dom", renderedBy: "dom" },
  { type: "custom", renderer: "dom", renderedBy: "dom" },
  { type: "currentStatus", renderer: "stock", renderedBy: "stock-placeholder" },
  { type: "durationDynamics", renderer: "stock", renderedBy: "stock-placeholder" },
  { type: "testingPyramid", renderer: "svg", renderedBy: "svg" },
  { type: "durations", renderer: "highcharts", renderedBy: "highcharts" },
  { type: "custom", renderer: "highcharts", renderedBy: "highcharts" },
  { type: "stabilityDistribution", renderer: "stock", renderedBy: "stock-placeholder" },
  { type: "custom", renderer: "svg", renderedBy: "svg" },
  { type: "custom", renderer: "dom", renderedBy: "dom" },
  { type: "custom", renderer: "dom", renderedBy: "dom" },
  { type: "custom", renderer: "amcharts", renderedBy: "amcharts-stub" },
  { type: "currentStatus", renderer: "stock", renderedBy: "stock-placeholder" },
];

const PANEL_INDEX = 6;
const STABILITY_INDEX = 7;
const GAUGE_INDEX = 8;
const TABLE_INDEX = 9;
const TESTS_TABLE_INDEX = 10;
const STOCK_INDEX = 12;

const failures = [];

function check(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

// `channel: "chromium"` keeps new-headless Chromium instead of the separate
// headless-shell download, which is not always present in this workspace.
const browser = await chromium.launch({ headless: true, channel: "chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } });

const consoleErrors = [];
const pageErrors = [];

page.on("console", (message) => {
  if (message.type() === "error") {
    consoleErrors.push(message.text());
  }
});
page.on("pageerror", (error) => pageErrors.push(String(error)));
page.on("requestfailed", (request) =>
  consoleErrors.push(`request failed: ${request.url()} — ${request.failure()?.errorText}`),
);

await page.goto(URL_UNDER_TEST, { waitUntil: "networkidle" });
await page.waitForSelector("#dogfood-grid .widget-tile[data-ark-rendered-by]");
await page.waitForFunction(
  (expected) =>
    document.querySelectorAll("#dogfood-grid .widget-tile[data-ark-rendered-by]").length >= expected,
  EXPECTED_TILES.length,
  { timeout: 10_000 },
);

const tiles = await page.$$eval("#dogfood-grid .widget-tile", (nodes) =>
  nodes.map((node) => ({
    key: node.dataset.arkTile,
    renderer: node.dataset.arkRenderer,
    renderedBy: node.dataset.arkRenderedBy,
    title: node.querySelector(".widget-tile__title")?.textContent?.trim(),
    dots: [...node.querySelectorAll(".widget-tile__bar .indicator-row .indicator")].map((dot) =>
      [...dot.classList].find((name) => name.startsWith("indicator--status-"))?.replace("indicator--status-", ""),
    ),
    hasBar: Boolean(node.querySelector(".widget-tile__bar")),
    bodyChildren: node.querySelector(".widget-tile__body")?.childElementCount ?? 0,
  })),
);

check(tiles.length === EXPECTED_TILES.length, `tiles: expected ${EXPECTED_TILES.length}, got ${tiles.length}`);

EXPECTED_TILES.forEach((expected, index) => {
  const tile = tiles[index];
  if (!tile) {
    failures.push(`tile ${index}: missing`);
    return;
  }
  check(
    tile.key?.includes(`:${index}:`),
    `tile ${index}: key "${tile.key}" does not carry index ${index} (manifest order)`,
  );
  check(
    tile.renderer === expected.renderer,
    `tile ${index}: requested renderer ${tile.renderer}, expected ${expected.renderer}`,
  );
  check(
    tile.renderedBy === expected.renderedBy,
    `tile ${index}: rendered by ${tile.renderedBy}, expected ${expected.renderedBy}`,
  );
  if (index < 2) {
    check(!tile.hasBar, `tile ${index}: quality gate tile should not duplicate widget-tile__bar`);
  } else {
    check(tile.hasBar, `tile ${index}: no widget-tile__bar`);
  }
  check(tile.bodyChildren > 0, `tile ${index}: empty body`);
});

// Overview preset chart keys — ADR 006 order after the QG lead.
["currentStatus", "durationDynamics", "testingPyramid", "durations"].forEach((type, index) => {
  const tileIndex = index + 2;
  check(
    tiles[tileIndex]?.key?.endsWith(type),
    `overview preset [${tileIndex}]: expected ${type}, key is "${tiles[tileIndex]?.key}"`,
  );
});

// Custom panel: dots come from the two families really on the donut.
const panel = tiles[PANEL_INDEX];
check(
  JSON.stringify(panel?.dots) === JSON.stringify(["orange", "green"]),
  `custom panel dots: expected ["orange","green"], got ${JSON.stringify(panel?.dots)}`,
);
check(
  panel?.title === "Текущий статус по сервисам",
  `custom panel title: got "${panel?.title}"`,
);

// Per-point colours on a kit-rendered bar; stock placeholder has no drawn series.
check(
  JSON.stringify(tiles[STABILITY_INDEX]?.dots) === JSON.stringify([]),
  `stability dots: stock placeholder has no series dots, got ${JSON.stringify(tiles[STABILITY_INDEX]?.dots)}`,
);

// dots: false → no indicator row at all (never three traffic-lights).
check(
  tiles[STOCK_INDEX]?.dots.length === 0,
  `stock tile: expected no dots, got ${JSON.stringify(tiles[STOCK_INDEX]?.dots)}`,
);

// Gauge — SVG canon: a track arc, a progress arc, and the reading.
const gauge = await page.$eval(
  `.widget-tile[data-ark-tile$=":${GAUGE_INDEX}:passRate"] .widget-tile__body svg`,
  (svg) => ({
    arcs: svg.querySelectorAll("path").length,
    reading: svg.querySelector("text")?.textContent?.trim(),
  }),
).catch(() => ({ arcs: 0, reading: undefined }));
check(gauge.arcs === 2, `gauge: expected 2 arcs, got ${gauge.arcs}`);
check(gauge.reading === "30", `gauge: reading is "${gauge.reading}"`);

// Table — one row per layer, each with its own indicator.
const table = await page.$eval(
  `.widget-tile[data-ark-tile$=":${TABLE_INDEX}:layersTable"] .widget-tile__body`,
  (body) => ({
    rows: body.querySelectorAll("tbody tr").length,
    dots: body.querySelectorAll("tbody .indicator").length,
    header: [...body.querySelectorAll("thead th")].map((cell) => cell.textContent.trim()),
  }),
).catch(() => ({ rows: 0, dots: 0, header: [] }));
check(table.rows === 6, `table: expected 6 rows, got ${table.rows}`);
check(table.dots === 6, `table: expected an indicator per row, got ${table.dots}`);
check(
  JSON.stringify(table.header) === JSON.stringify(["Слой", "Тестов"]),
  `table header: got ${JSON.stringify(table.header)}`,
);

const testsTablePanel = await page.$eval(
  `.widget-tile[data-ark-tile$=":${TESTS_TABLE_INDEX}:testsTable"] .widget-tile__body`,
  (body) => ({
    rows: body.querySelectorAll("tbody tr").length,
    maxRows: Number(body.querySelector("tbody")?.dataset.maxRows ?? 0),
    sparklines: body.querySelectorAll(".sparkline--duration").length,
    flakyBadges: body.querySelectorAll(".badge--flaky").length,
    header: [...body.querySelectorAll("thead th")].map((cell) => cell.textContent.trim()),
    columnShift: [...body.querySelectorAll("thead th")].map((th, index) => {
      const td = body.querySelector(`tbody tr:first-child td:nth-child(${index + 1})`);
      if (!td) {
        return 999;
      }
      return Math.abs(th.getBoundingClientRect().left - td.getBoundingClientRect().left);
    }),
    firstName: body.querySelector("tbody tr:first-child td.tests-table-panel__name")?.textContent?.trim() ?? "",
    nameCellWidth:
      body.querySelector("tbody tr:first-child td.tests-table-panel__name")?.clientWidth ?? 0,
    firstStatusOverflow: (() => {
      const badge = body.querySelector(
        "tbody tr:first-child td.tests-table-panel__status .badge",
      );
      if (!badge) {
        return true;
      }
      return badge.scrollWidth > badge.clientWidth + 1;
    })(),
    hostHeight: body.clientHeight,
  }),
).catch(() => ({
  rows: 0,
  maxRows: 0,
  sparklines: 0,
  flakyBadges: 0,
  header: [],
  columnShift: [999],
  firstName: "",
  nameCellWidth: 0,
  firstStatusOverflow: true,
  hostHeight: 0,
}));
check(testsTablePanel.rows >= 4, `tests table: expected height-sliced rows, got ${testsTablePanel.rows}`);
check(
  testsTablePanel.rows === Math.min(24, testsTablePanel.maxRows),
  `tests table: expected ${Math.min(24, testsTablePanel.maxRows)} rows, got ${testsTablePanel.rows}`,
);
check(testsTablePanel.sparklines >= 2, `tests table: expected sparklines, got ${testsTablePanel.sparklines}`);
check(testsTablePanel.flakyBadges >= 1, `tests table: expected flaky badge, got ${testsTablePanel.flakyBadges}`);
check(
  JSON.stringify(testsTablePanel.header) ===
    JSON.stringify(["Тест", "Статус", "Тренд", "Стабильность"]),
  `tests table header: got ${JSON.stringify(testsTablePanel.header)}`,
);
check(
  testsTablePanel.columnShift.every((shift) => shift <= 2),
  `tests table column alignment: shifts ${testsTablePanel.columnShift.join(", ")}`,
);
check(
  testsTablePanel.firstName === "shouldLoginWithValidCredentials",
  `tests table name: got "${testsTablePanel.firstName}"`,
);
check(
  testsTablePanel.nameCellWidth >= 80,
  `tests table name: column collapsed to ${testsTablePanel.nameCellWidth}px`,
);
check(
  !testsTablePanel.firstStatusOverflow,
  "tests table status: badge ellipsis (STATUS must fit RU/EN labels)",
);

const testsTableRowsBeforeResize = testsTablePanel.rows;
await page.$eval(
  `.widget-tile[data-ark-tile$=":${TESTS_TABLE_INDEX}:testsTable"]`,
  (tile) => {
    const body = tile.querySelector(".widget-tile__body");
    const base = body?.clientHeight || 200;
    const next = base * 2 + 48;
    tile.style.height = `${next + 40}px`;
    if (body) {
      body.style.height = `${next}px`;
      body.style.flex = "1 1 auto";
    }
  },
);
await page.waitForTimeout(50);
const testsTableRowsAfterResize = await page.$eval(
  `.widget-tile[data-ark-tile$=":${TESTS_TABLE_INDEX}:testsTable"] .widget-tile__body`,
  (body) => body.querySelectorAll("tbody tr").length,
).catch(() => 0);
check(
  testsTableRowsAfterResize > testsTableRowsBeforeResize,
  `tests table resize: expected more rows after height bump (${testsTableRowsBeforeResize} → ${testsTableRowsAfterResize})`,
);

// Pyramid keeps the six canon tiers as rounded rects.
const pyramidTiers = await page.$$eval(
  '.widget-tile[data-ark-tile$=":4:testingPyramid"] .widget-tile__body svg rect',
  (nodes) => nodes.length,
);
check(pyramidTiers === 6, `pyramid: expected 6 tiers, got ${pyramidTiers}`);

// theme.header — DS primitive, not a hand-rolled bar.
const header = await page.$eval("#app-header", (node) => ({
  hasHeader: Boolean(node.querySelector(".header")),
  product: node.querySelector('[data-testid="ark-header-product"]')?.textContent?.trim(),
})).catch(() => ({ hasHeader: false, product: undefined }));

check(header.hasHeader, "theme.header: DS .header did not mount into #app-header");
check(header.product === "Reference App", `theme.header: product name is "${header.product}"`);

// Compare grid — same models, different backends (structural baseline source).
const COMPARE_KEYS = [
  "pie:highcharts",
  "pie:amcharts",
  "bar:highcharts",
  "gauge:svg",
];

await page.waitForSelector("[data-ark-compare][data-ark-rendered-by]", { timeout: 10_000 });

const compareTiles = await page.$$eval("[data-ark-compare]", (nodes) =>
  nodes.map((node) => ({
    key: node.dataset.arkCompare,
    renderedBy: node.dataset.arkRenderedBy,
    bodyChildren: node.querySelector(".widget-tile__body")?.childElementCount ?? 0,
  })),
);

check(
  compareTiles.length === COMPARE_KEYS.length,
  `compare: expected ${COMPARE_KEYS.length} tiles, got ${compareTiles.length}`,
);

for (const key of COMPARE_KEYS) {
  const tile = compareTiles.find((entry) => entry.key === key);
  check(Boolean(tile), `compare: missing ${key}`);
  check(tile?.bodyChildren > 0, `compare ${key}: empty body`);
  check(tile?.renderedBy !== "none", `compare ${key}: renderer did not mount`);
}

check(
  compareTiles.find((entry) => entry.key === "gauge:svg")?.renderedBy === "svg",
  "compare gauge:svg: expected svg renderer",
);

check(consoleErrors.length === 0, `console errors:\n  ${consoleErrors.join("\n  ")}`);
check(pageErrors.length === 0, `page errors:\n  ${pageErrors.join("\n  ")}`);

await browser.close();

if (failures.length > 0) {
  console.error(`smoke-dogfood: FAIL (${failures.length})`);
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log(`smoke-dogfood: OK — ${tiles.length} tiles, renderers: ${[...new Set(tiles.map((t) => t.renderedBy))].join(", ")}`);
