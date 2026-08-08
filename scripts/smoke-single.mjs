#!/usr/bin/env node
/**
 * Headless smoke of a `singleFile: true` report.
 *
 * Opened over `file://` on purpose: that is the mode's whole point, and it is
 * also the strictest check available — anything the document still expects to
 * fetch simply is not there.
 *
 * Usage: node scripts/smoke-single.mjs [path/to/index.html]
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium } from "playwright";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = resolve(ROOT, process.argv[2] ?? "e2e/allure-report-single/index.html");

const failures = [];
const check = (condition, message) => {
  if (!condition) {
    failures.push(message);
  }
};

const UPSTREAM_NOISE = [/favicon\.ico/, /A negative value is not valid/];

const ALLOWED_REQUESTS = [/^file:/, /^data:/, /^blob:/, /googletagmanager\.com/];

const browser = await chromium.launch({ headless: true, channel: "chromium" });
const page = await browser.newPage({ viewport: { width: 1400, height: 1400 } });

const consoleErrors = [];
const missing = [];
const external = [];

page.on("console", (message) => {
  if (message.type() !== "error") {
    return;
  }
  const where = message.location()?.url ?? "";
  if (UPSTREAM_NOISE.some((noise) => noise.test(where) || noise.test(message.text()))) {
    return;
  }
  consoleErrors.push(`${message.text()} (${where})`);
});
page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error}`));
page.on("requestfailed", (request) => missing.push(request.url()));
page.on("request", (request) => {
  if (!ALLOWED_REQUESTS.some((allowed) => allowed.test(request.url()))) {
    external.push(request.url());
  }
});

await page.goto(pathToFileURL(FILE).href, { waitUntil: "networkidle" });
await page.waitForSelector("#app-header .header", { timeout: 15_000 });

const header = await page.evaluate(() => ({
  brand: Boolean(document.querySelector('#app-header [data-testid="header-brand"]')),
  product: document
    .querySelector('[data-testid="ark-header-product"]')
    ?.textContent?.trim(),
  toggle: Boolean(document.querySelector('[data-testid="header-theme-toggle"]')),
}));
check(header.brand, "header: DS brand missing — the inlined module did not mount");
check(header.product === "Reference App", `header: product name "${header.product}"`);

await page.getByText("Отчет", { exact: true }).first().click();
await page.getByText("Графики", { exact: true }).first().click();
await page.waitForSelector(".widget-tile[data-ark-rendered-by]");
await page.waitForFunction(
  () => document.querySelectorAll(".widget-tile[data-ark-rendered-by]").length >= 3,
  undefined,
  { timeout: 15_000 },
);

const tiles = await page.evaluate(() =>
  [...document.querySelectorAll(".widget-tile[data-ark-rendered-by]")].map((node) => ({
    title: node.querySelector(".widget-tile__title")?.textContent?.trim(),
    renderedBy: node.dataset.arkRenderedBy,
    body: node.querySelector(".widget-tile__body")?.childElementCount ?? 0,
  })),
);

const expected = [
  { title: "Пирамида тестирования", renderer: "svg" },
  { title: "Длительности по layer", renderer: "highcharts" },
  { title: "Прошло тестов", renderer: "svg" },
];

expected.forEach((want, index) => {
  const tile = tiles[index];
  if (!tile) {
    failures.push(`tile ${index} (${want.title}): missing`);
    return;
  }
  check(tile.title === want.title, `tile ${index}: title "${tile.title}"`);
  check(
    tile.renderedBy === want.renderer,
    `tile ${index} (${want.title}): rendered by ${tile.renderedBy}, expected ${want.renderer}`,
  );
  check(tile.body > 0, `tile ${index} (${want.title}): empty body`);
});

check(
  await page.evaluate(() => Boolean(window.Highcharts)),
  "chart backend: Highcharts is not on window — the data: script did not run",
);
check(
  await page.evaluate(() => !("echarts" in window)),
  "chart backend: echarts must not be inlined after v0.2",
);

const gauge = await page.evaluate(() => {
  const tile = [...document.querySelectorAll(".widget-tile")].find(
    (node) => node.querySelector(".widget-tile__title")?.textContent?.trim() === "Прошло тестов",
  );
  return [...(tile?.querySelectorAll("svg text") ?? [])].map((node) => node.textContent.trim());
});
check(JSON.stringify(gauge) === JSON.stringify(["30", "из 34"]), `gauge copy: ${JSON.stringify(gauge)}`);

const html = readFileSync(FILE, "utf8");
check(!/echarts/i.test(html), "single file: echarts must not be inlined");

check(missing.length === 0, `missing assets:\n  ${missing.join("\n  ")}`);
check(external.length === 0, `external requests:\n  ${external.join("\n  ")}`);
check(consoleErrors.length === 0, `console errors:\n  ${consoleErrors.join("\n  ")}`);

await browser.close();

if (failures.length > 0) {
  console.error(`smoke-single: FAIL (${failures.length})`);
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log(`smoke-single: OK — ${tiles.length} kit tiles, Highcharts inlined, no echarts`);
