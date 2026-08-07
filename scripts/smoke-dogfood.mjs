#!/usr/bin/env node
/**
 * Headless smoke of the dogfood stand.
 *
 * Fails on any console error or page error, and asserts the vertical slice is
 * actually on screen: locked 2×2 order, one renderer per tile, indicator dots
 * derived from the drawn series, DS header mounted.
 *
 * Usage: node scripts/smoke-dogfood.mjs [url]
 */
import { chromium } from "playwright";

const URL_UNDER_TEST = process.argv[2] ?? "http://localhost:3021/dogfood/";

const EXPECTED_TILES = [
  { type: "currentStatus", renderer: "echarts", renderedBy: "echarts" },
  { type: "durationDynamics", renderer: "echarts", renderedBy: "echarts" },
  { type: "testingPyramid", renderer: "svg", renderedBy: "svg" },
  { type: "durations", renderer: "highcharts", renderedBy: "highcharts" },
  { type: "custom", renderer: "highcharts", renderedBy: "highcharts" },
  { type: "custom", renderer: "amcharts", renderedBy: "amcharts-stub" },
  { type: "currentStatus", renderer: "stock", renderedBy: "stock-placeholder" },
];

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
await page.waitForSelector(".widget-tile[data-ark-rendered-by]");
await page.waitForFunction(
  (expected) => document.querySelectorAll(".widget-tile[data-ark-rendered-by]").length >= expected,
  EXPECTED_TILES.length,
  { timeout: 10_000 },
);

const tiles = await page.$$eval(".widget-tile", (nodes) =>
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
    `tile ${index}: key "${tile.key}" does not carry index ${index} (locked order)`,
  );
  check(
    tile.renderer === expected.renderer,
    `tile ${index}: requested renderer ${tile.renderer}, expected ${expected.renderer}`,
  );
  check(
    tile.renderedBy === expected.renderedBy,
    `tile ${index}: rendered by ${tile.renderedBy}, expected ${expected.renderedBy}`,
  );
  check(tile.hasBar, `tile ${index}: no widget-tile__bar`);
  check(tile.bodyChildren > 0, `tile ${index}: empty body`);
});

// Locked 2×2 keys carry the Allure chart type — ADR 006 order must hold.
["currentStatus", "durationDynamics", "testingPyramid", "durations"].forEach((type, index) => {
  check(
    tiles[index]?.key?.endsWith(type),
    `locked quad [${index}]: expected ${type}, key is "${tiles[index]?.key}"`,
  );
});

// Custom panel: dots come from the two families really on the donut.
const panel = tiles[4];
check(
  JSON.stringify(panel?.dots) === JSON.stringify(["orange", "green"]),
  `custom panel dots: expected ["orange","green"], got ${JSON.stringify(panel?.dots)}`,
);
check(
  panel?.title === "Текущий статус по сервисам",
  `custom panel title: got "${panel?.title}"`,
);

// dots: false → no indicator row at all (never three traffic-lights).
check(tiles[6]?.dots.length === 0, `stock tile: expected no dots, got ${JSON.stringify(tiles[6]?.dots)}`);

// Pyramid keeps the six canon tiers as rounded rects.
const pyramidTiers = await page.$$eval(
  '.widget-tile[data-ark-renderer="svg"] .widget-tile__body svg rect',
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
