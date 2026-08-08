#!/usr/bin/env node
/**
 * Headless smoke of a real Allure 3 report built with the kit plugin.
 *
 * Unlike smoke-dogfood.mjs this one proves the soft-fork itself: the tiles
 * under test are rendered by the forked web bundle inside Allure's own shell,
 * next to an untouched stock widget.
 *
 * Usage: node scripts/smoke-report.mjs [url]
 */
import { chromium } from "playwright";

const URL_UNDER_TEST = process.argv[2] ?? "http://localhost:3024/awesome/";

const EXPECTED = [
  { title: "Текущий статус", renderer: "echarts", dots: ["red", "yellow", "gray", "green"] },
  { title: "Динамика длительности", renderer: "echarts", dots: ["blue"] },
  { title: "Пирамида тестирования", renderer: "svg" },
  { title: "Длительности по layer", renderer: "highcharts" },
  { title: "Текущий статус по сервисам", renderer: "highcharts", dots: ["orange", "green"] },
  { title: "Динамика статусов", renderer: "echarts" },
];

const failures = [];
const check = (condition, message) => {
  if (!condition) {
    failures.push(message);
  }
};

const browser = await chromium.launch({ headless: true, channel: "chromium" });
const page = await browser.newPage({ viewport: { width: 1400, height: 1400 } });

const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") {
    consoleErrors.push(message.text());
  }
});
page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error}`));

await page.goto(URL_UNDER_TEST, { waitUntil: "networkidle" });
await page.waitForSelector("#app-header .header", { timeout: 10_000 });

// theme.header — the DS primitive, above the report, without covering its nav.
const header = await page.evaluate(() => {
  const mount = document.getElementById("app-header");
  const app = document.getElementById("app");
  const switcher = [...document.querySelectorAll("button, div")].find(
    (node) => /Отчет|Графики/.test(node.textContent ?? "") && node.getBoundingClientRect().height < 40,
  );
  return {
    brand: Boolean(mount?.querySelector('[data-testid="header-brand"]')),
    product: mount?.querySelector('[data-testid="ark-header-product"]')?.textContent?.trim(),
    bandHeight: Math.round(mount?.querySelector(".header")?.getBoundingClientRect().height ?? 0),
    appPadTop: Number.parseInt(getComputedStyle(app).paddingTop, 10),
    switcherTop: switcher ? Math.round(switcher.getBoundingClientRect().top) : -1,
  };
});

check(header.brand, "theme.header: DS brand missing — this is not the shared primitive");
check(header.product === "Reference App", `theme.header: product name "${header.product}"`);
check(
  header.appPadTop >= header.bandHeight,
  `theme.header: report padded ${header.appPadTop}px under a ${header.bandHeight}px band`,
);
check(
  header.switcherTop >= header.bandHeight,
  `theme.header: Allure section switcher at ${header.switcherTop}px is under the header band`,
);

// Charts live in their own section of the Awesome report.
await page.getByText("Отчет", { exact: true }).first().click();
await page.getByText("Графики", { exact: true }).first().click();
await page.waitForSelector(".widget-tile[data-ark-rendered-by]");
await page.waitForFunction(
  (count) => document.querySelectorAll(".widget-tile[data-ark-rendered-by]").length >= count,
  EXPECTED.length,
  { timeout: 15_000 },
);

const page_ = await page.evaluate(() => ({
  manifest: Boolean(window.allureReportKit),
  tiles: [...document.querySelectorAll(".widget-tile")].map((node) => ({
    renderer: node.dataset.arkRenderer,
    renderedBy: node.dataset.arkRenderedBy,
    title: node.querySelector(".widget-tile__title")?.textContent?.trim(),
    dots: [...node.querySelectorAll(".widget-tile__bar .indicator-row .indicator")].map((dot) =>
      [...dot.classList]
        .find((name) => name.startsWith("indicator--status-"))
        ?.replace("indicator--status-", ""),
    ),
    bodyChildren: node.querySelector(".widget-tile__body")?.childElementCount ?? 0,
    height: Math.round(node.getBoundingClientRect().height),
  })),
  stockWidgets: document.querySelectorAll('[class*="styles_widget"]').length,
  percentage: document
    .querySelector('.widget-tile[data-ark-renderer="echarts"] text')
    ?.textContent?.trim(),
}));

check(page_.manifest, "window.allureReportKit is missing — the plugin did not inject the manifest");
check(
  page_.tiles.length === EXPECTED.length,
  `kit tiles: expected ${EXPECTED.length}, got ${page_.tiles.length}`,
);

EXPECTED.forEach((expected, index) => {
  const tile = page_.tiles[index];
  if (!tile) {
    failures.push(`tile ${index} (${expected.title}): missing`);
    return;
  }
  check(tile.title === expected.title, `tile ${index}: title "${tile.title}"`);
  check(
    tile.renderedBy === expected.renderer,
    `tile ${index} (${expected.title}): rendered by ${tile.renderedBy}, expected ${expected.renderer}`,
  );
  check(tile.bodyChildren > 0, `tile ${index} (${expected.title}): empty body`);
  check(
    tile.height > 0 && tile.height <= 500,
    `tile ${index} (${expected.title}): height ${tile.height}px is out of the report grid range`,
  );
  if (expected.dots) {
    check(
      JSON.stringify(tile.dots) === JSON.stringify(expected.dots),
      `tile ${index} (${expected.title}): dots ${JSON.stringify(tile.dots)}, expected ${JSON.stringify(expected.dots)}`,
    );
  }
});

// A tile declared `renderer: "stock"` must stay on Allure's own widget.
check(page_.stockWidgets >= 1, "no stock widget left — the fork should not take over every tile");

// Statistic carries `total` next to the statuses; a wrong sum halves this.
check(
  page_.percentage === "88.24%",
  `current status percentage: got "${page_.percentage}", expected "88.24%"`,
);

// The DS header toggle drives the whole report; canvas tiles must redraw.
await page.click('[data-testid="header-theme-toggle"]');
await page.waitForTimeout(1500);

const afterToggle = await page.evaluate(() => ({
  theme: document.documentElement.dataset.theme,
  layerE2e: getComputedStyle(document.querySelector(".widget-tile__body"))
    .getPropertyValue("--ark-layer-e2e")
    .trim(),
}));

check(afterToggle.theme === "dark", `theme toggle: data-theme is "${afterToggle.theme}"`);
check(
  afterToggle.layerE2e === "#ff574f",
  `theme toggle: layer palette did not switch to dark (--ark-layer-e2e = ${afterToggle.layerE2e})`,
);

check(consoleErrors.length === 0, `console errors:\n  ${consoleErrors.join("\n  ")}`);

await browser.close();

if (failures.length > 0) {
  console.error(`smoke-report: FAIL (${failures.length})`);
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log(
  `smoke-report: OK — ${page_.tiles.length} kit tiles (${[...new Set(page_.tiles.map((t) => t.renderedBy))].join(", ")}) + ${page_.stockWidgets} stock widget(s)`,
);
