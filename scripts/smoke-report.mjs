#!/usr/bin/env node
/**
 * Headless smoke of real Allure 3 reports built with the kit plugins.
 *
 * Unlike smoke-dogfood.mjs this one proves the soft-fork itself: the tiles under
 * test are rendered by the forked web bundles inside Allure's own shell, next to
 * untouched stock widgets. Both Awesome and Dashboard are checked.
 *
 * Usage: node scripts/smoke-report.mjs [baseUrl]
 */
import { chromium } from "playwright";

const BASE_URL = (process.argv[2] ?? "http://localhost:3024").replace(/\/$/, "");

/**
 * Console noise produced by Allure itself, not by the kit.
 *
 * - the dashboard template links `favicon.ico` and never writes it;
 * - upstream's nivo widgets emit negative SVG dimensions on this grid. Measured
 *   on the same page: all-kit renders 0 errors, all-stock renders 8, so the
 *   source is upstream. Kit regressions of this shape would hide behind the
 *   filter — re-run that comparison if it ever matters.
 */
const UPSTREAM_NOISE = [/favicon\.ico/, /A negative value is not valid/];

const failures = [];
const check = (condition, message) => {
  if (!condition) {
    failures.push(message);
  }
};

const browser = await chromium.launch({ headless: true, channel: "chromium" });

async function openReport(path) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1400 } });
  const consoleErrors = [];

  page.on("console", (message) => {
    if (message.type() !== "error") {
      return;
    }
    // A failed request logs a generic text — the url only lives in `location`.
    const where = message.location()?.url ?? "";
    if (UPSTREAM_NOISE.some((noise) => noise.test(where) || noise.test(message.text()))) {
      return;
    }
    consoleErrors.push(`${message.text()} (${where})`);
  });
  page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error}`));

  await page.goto(`${BASE_URL}${path}`, { waitUntil: "networkidle" });
  await page.waitForSelector("#app-header .header", { timeout: 10_000 });

  return { page, consoleErrors };
}

/** theme.header — the DS primitive, above the report, without covering its nav. */
async function checkHeader(page, label, { expectSwitcher }) {
  const header = await page.evaluate((withSwitcher) => {
    const mount = document.getElementById("app-header");
    const app = document.getElementById("app");
    const switcher = withSwitcher
      ? [...document.querySelectorAll("button, div")].find(
          (node) =>
            /Отчет|Графики/.test(node.textContent ?? "") && node.getBoundingClientRect().height < 40,
        )
      : undefined;
    return {
      brand: Boolean(mount?.querySelector('[data-testid="header-brand"]')),
      product: mount?.querySelector('[data-testid="ark-header-product"]')?.textContent?.trim(),
      bandHeight: Math.round(mount?.querySelector(".header")?.getBoundingClientRect().height ?? 0),
      appPadTop: Number.parseInt(getComputedStyle(app).paddingTop, 10),
      switcherTop: switcher ? Math.round(switcher.getBoundingClientRect().top) : undefined,
    };
  }, expectSwitcher);

  check(header.brand, `${label} header: DS brand missing — this is not the shared primitive`);
  check(header.product === "Reference App", `${label} header: product name "${header.product}"`);
  check(
    header.appPadTop >= header.bandHeight,
    `${label} header: report padded ${header.appPadTop}px under a ${header.bandHeight}px band`,
  );
  if (expectSwitcher) {
    check(
      (header.switcherTop ?? -1) >= header.bandHeight,
      `${label} header: Allure section switcher at ${header.switcherTop}px is under the band`,
    );
  }
  return header;
}

async function readTiles(page) {
  return page.evaluate(() => ({
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
  }));
}

function checkTiles(label, actual, expected) {
  check(actual.manifest, `${label}: window.allureReportKit is missing`);
  check(
    actual.tiles.length === expected.length,
    `${label}: expected ${expected.length} kit tiles, got ${actual.tiles.length}`,
  );

  expected.forEach((want, index) => {
    const tile = actual.tiles[index];
    if (!tile) {
      failures.push(`${label} tile ${index} (${want.title}): missing`);
      return;
    }
    check(tile.title === want.title, `${label} tile ${index}: title "${tile.title}"`);
    check(
      tile.renderedBy === want.renderer,
      `${label} tile ${index} (${want.title}): rendered by ${tile.renderedBy}, expected ${want.renderer}`,
    );
    check(tile.bodyChildren > 0, `${label} tile ${index} (${want.title}): empty body`);
    check(
      tile.height > 0 && tile.height <= 500,
      `${label} tile ${index} (${want.title}): height ${tile.height}px out of the grid range`,
    );
    if (want.dots) {
      check(
        JSON.stringify(tile.dots) === JSON.stringify(want.dots),
        `${label} tile ${index} (${want.title}): dots ${JSON.stringify(tile.dots)}, expected ${JSON.stringify(want.dots)}`,
      );
    }
  });

  // A tile declared `renderer: "stock"` must stay on Allure's own widget.
  check(actual.stockWidgets >= 1, `${label}: no stock widget left — the fork took over every tile`);
}

/**
 * One palette on a mixed page.
 *
 * `theme.hostPalette` redefines Allure's own `--color-status-*-chart` pair, and
 * the stock widgets pick that up because upstream hands nivo the `var()` string
 * rather than a resolved colour. Checked on the paint, not on the declaration:
 * the point is that the tile Allure draws and the tile the kit draws end up the
 * same green.
 */
async function checkPalette(page, label) {
  const palette = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const read = (name) => root.getPropertyValue(name).trim();
    const stockFills = [
      ...document.querySelectorAll('[class*="styles_widget"] svg [fill^="var(--color-status"]'),
    ].map((node) => node.getAttribute("fill"));
    return {
      canon: read("--ark-status-passed"),
      chart: read("--color-status-passed-chart"),
      fill: read("--color-status-passed-chart-fill"),
      failed: read("--color-status-failed-chart"),
      canonFailed: read("--ark-status-failed"),
      stockFills: [...new Set(stockFills)],
    };
  });

  check(
    palette.chart === palette.canon && palette.fill === palette.canon,
    `${label} palette: passed is ${palette.chart} / ${palette.fill} while the canon is ${palette.canon}`,
  );
  check(
    palette.failed === palette.canonFailed,
    `${label} palette: failed is ${palette.failed} while the canon is ${palette.canonFailed}`,
  );
  // The whole mechanism rests on upstream keeping the colour unresolved in the
  // markup; a stock tile that paints a literal would silently stop following.
  check(
    palette.stockFills.length > 0,
    `${label} palette: no stock mark paints through a status token — upstream may have stopped emitting var()`,
  );
  return palette;
}

/**
 * The tile follows its grid cell, not the config.
 *
 * `layout` drives the body aspect ratio and the SVG viewBox, and it is measured
 * off the real cell — which keeps moving after the first paint. Narrowing the
 * window has to re-bucket it, and the old modifier has to go with it, or the
 * element would carry two layouts and the stylesheet would pick.
 */
async function checkResize(page, label) {
  const layoutOf = () =>
    page.evaluate(() => {
      const tile = document.querySelector(".widget-tile");
      return [...tile.classList].filter((name) => name.startsWith("widget-tile--layout-"));
    });

  const wide = await layoutOf();
  await page.setViewportSize({ width: 620, height: 1400 });
  await page.waitForTimeout(1200);
  const narrow = await layoutOf();
  await page.setViewportSize({ width: 1400, height: 1400 });
  await page.waitForTimeout(1200);
  const back = await layoutOf();

  check(
    wide.length === 1 && narrow.length === 1 && back.length === 1,
    `${label} resize: tile carries ${JSON.stringify([wide, narrow, back])} — one layout modifier at a time`,
  );
  check(
    narrow[0] !== wide[0],
    `${label} resize: layout stayed ${wide[0]} after the cell narrowed`,
  );
  check(
    back[0] === wide[0],
    `${label} resize: layout came back as ${back[0]}, not ${wide[0]}`,
  );
}

/** The DS header toggle drives the whole report; canvas tiles must redraw. */
async function checkThemeToggle(page, label) {
  await page.click('[data-testid="header-theme-toggle"]');
  await page.waitForTimeout(1500);

  const after = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    layerE2e: getComputedStyle(document.querySelector(".widget-tile__body"))
      .getPropertyValue("--ark-layer-e2e")
      .trim(),
  }));

  check(after.theme === "dark", `${label} theme toggle: data-theme is "${after.theme}"`);
  check(
    after.layerE2e === "#ff574f",
    `${label} theme toggle: palette did not switch to dark (--ark-layer-e2e = ${after.layerE2e})`,
  );

  // The other direction: Allure's own control writes `data-theme`, and the DS
  // header has to follow instead of keeping a stale palette and icon.
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
  });
  await page.waitForTimeout(800);

  const mirrored = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    dsLight: document.documentElement.classList.contains("theme-light"),
  }));

  check(
    mirrored.theme === "light" && mirrored.dsLight,
    `${label} theme mirror: report says "${mirrored.theme}" while the DS header light class is ${mirrored.dsLight}`,
  );
}

// ---- Awesome ----------------------------------------------------------------

const awesome = await openReport("/awesome/");
await checkHeader(awesome.page, "awesome", { expectSwitcher: true });

// Charts live in their own section of the Awesome report.
await awesome.page.getByText("Отчет", { exact: true }).first().click();
await awesome.page.getByText("Графики", { exact: true }).first().click();
await awesome.page.waitForSelector(".widget-tile[data-ark-rendered-by]");
await awesome.page.waitForFunction(
  (count) => document.querySelectorAll(".widget-tile[data-ark-rendered-by]").length >= count,
  7,
  { timeout: 15_000 },
);

const awesomeTiles = await readTiles(awesome.page);
checkTiles("awesome", awesomeTiles, [
  { title: "Текущий статус", renderer: "echarts", dots: ["red", "yellow", "gray", "green"] },
  { title: "Динамика длительности", renderer: "echarts", dots: ["blue"] },
  { title: "Пирамида тестирования", renderer: "svg" },
  { title: "Длительности по layer", renderer: "highcharts" },
  { title: "Текущий статус по сервисам", renderer: "highcharts", dots: ["orange", "green"] },
  // Data computed from the run and fetched as a widget — only the passed arc is
  // drawn, so only green earns a dot.
  { title: "Прошло тестов", renderer: "svg", dots: ["green"] },
  { title: "Динамика статусов", renderer: "echarts" },
]);

// The gauge proves the widget round-trip: nothing about it is in the manifest.
const gauge = await awesome.page.evaluate(() => {
  const tile = [...document.querySelectorAll(".widget-tile")].find(
    (node) => node.querySelector(".widget-tile__title")?.textContent?.trim() === "Прошло тестов",
  );
  const texts = [...(tile?.querySelectorAll("svg text") ?? [])].map((node) => node.textContent.trim());
  return { reading: texts[0], caption: texts[1] };
});
check(gauge.reading === "30", `awesome gauge: reading "${gauge.reading}", expected 30 passed`);
check(gauge.caption === "из 34", `awesome gauge: caption "${gauge.caption}", expected "из 34"`);

// Statistic carries `total` next to the statuses; a wrong sum halves this.
const percentage = await awesome.page.evaluate(
  () => document.querySelector('.widget-tile[data-ark-renderer="echarts"] text')?.textContent?.trim(),
);
check(percentage === "88.24%", `awesome: current status percentage "${percentage}"`);

await checkPalette(awesome.page, "awesome");
await checkThemeToggle(awesome.page, "awesome");

// ---- Dashboard --------------------------------------------------------------

const dashboard = await openReport("/dashboard/");
await checkHeader(dashboard.page, "dashboard", { expectSwitcher: false });
await dashboard.page.waitForSelector(".widget-tile[data-ark-rendered-by]");

// The dashboard layout is the coverage surface: every upstream chart type the
// kit can model, plus a custom panel and one deliberate stock passthrough.
const dashboardTiles = await readTiles(dashboard.page);
checkTiles("dashboard", dashboardTiles, [
  { title: "Текущий статус", renderer: "echarts", dots: ["red", "yellow", "gray", "green"] },
  { title: "Динамика длительности", renderer: "echarts", dots: ["blue"] },
  { title: "Пирамида тестирования", renderer: "svg" },
  { title: "Длительности по layer", renderer: "highcharts" },
  { title: "Текущий статус по сервисам", renderer: "highcharts", dots: ["orange", "green"] },
  { title: "Прошло тестов", renderer: "svg", dots: ["green"] },
  // Table rows come from the run, one indicator per layer.
  {
    title: "Тесты по слоям",
    renderer: "dom",
    dots: ["red", "orange", "yellow", "purple", "gray", "green"],
  },
  // A rate per layer: only the two layers with flaky tests are painted, so the
  // zero-valued groups earn no dot — including the folded `other`.
  { title: "Flaky по слоям", renderer: "echarts", dots: ["red", "orange"] },
  // Trend over the runs in history, which no chart in the config can reach.
  { title: "Pass rate по прогонам", renderer: "highcharts", dots: ["blue"] },
  { title: "Динамика статусов", renderer: "echarts" },
  { title: "Переходы статусов", renderer: "echarts" },
  { title: "Рост тестовой базы", renderer: "echarts" },
  { title: "Возраст статусов", renderer: "echarts" },
  { title: "Результаты по severity", renderer: "echarts" },
  { title: "Стабильность по компонентам", renderer: "echarts" },
  { title: "Длительности", renderer: "echarts" },
  // "Coverage diff — highcharts declines" is deliberately absent: Highcharts
  // cannot draw a treemap, so that tile stays on Allure's own widget.
  { title: "Success rate", renderer: "echarts" },
  { title: "Проблемы по окружениям", renderer: "echarts" },
]);

// The declining tile must reach the real widget, never the kit's placeholder.
const placeholders = await dashboard.page.$$eval(
  '.ark-stub[data-renderer="stock"]',
  (nodes) => nodes.length,
);
check(placeholders === 0, `dashboard: ${placeholders} tile(s) fell back to the stock placeholder`);
check(
  dashboardTiles.stockWidgets === 2,
  `dashboard: expected 2 stock widgets (declared + declined treemap), got ${dashboardTiles.stockWidgets}`,
);

// Every upstream chart type must have a model; a gap silently falls back.
const MODELLED_TYPES = 13;
const covered = await dashboard.page.evaluate(
  () =>
    new Set(
      (window.allureReportKit?.tiles ?? []).filter((tile) => !tile.panel).map((tile) => tile.type),
    ).size,
);
check(
  covered === MODELLED_TYPES,
  `dashboard: layout covers ${covered} chart types, expected all ${MODELLED_TYPES}`,
);

// The trend has a point per run in history, so it only exists because the
// generator ran more than once — a single-run report would draw a flat line.
const trend = await dashboard.page.evaluate(() => {
  const tile = [...document.querySelectorAll(".widget-tile")].find(
    (node) =>
      node.querySelector(".widget-tile__title")?.textContent?.trim() === "Pass rate по прогонам",
  );
  return [...(tile?.querySelectorAll(".highcharts-xaxis-labels text") ?? [])].map((node) =>
    node.textContent.trim(),
  );
});
check(
  trend.length >= 2 && trend[0] === "#1",
  `dashboard trend: run axis is ${JSON.stringify(trend)}, expected at least two runs starting at #1`,
);

await checkPalette(dashboard.page, "dashboard");
await checkResize(dashboard.page, "dashboard");
await checkThemeToggle(dashboard.page, "dashboard");

const consoleErrors = [...awesome.consoleErrors, ...dashboard.consoleErrors];
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
  `smoke-report: OK — awesome ${awesomeTiles.tiles.length} kit + ${awesomeTiles.stockWidgets} stock, ` +
    `dashboard ${dashboardTiles.tiles.length} kit + ${dashboardTiles.stockWidgets} stock`,
);
