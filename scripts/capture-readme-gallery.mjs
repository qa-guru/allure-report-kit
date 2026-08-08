/**
 * Capture README gallery screenshots from live stands.
 *
 *   ark-report :3024 — stock + kit widgets from e2e dashboard
 *   design-system-preview :3000 — QG failed/passed + info popovers
 *
 * Usage:
 *   node scripts/capture-readme-gallery.mjs stock   # after e2e report with stock pyramid/durations
 *   node scripts/capture-readme-gallery.mjs kit     # after normal e2e report (default kit renderers)
 *   node scripts/capture-readme-gallery.mjs qg      # DS + report hover (no report regen needed)
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const mode = process.argv[2] ?? "all";
const ROOT = join(import.meta.dirname, "..");
const OUT = join(ROOT, "docs/readme");
const REPORT = process.env.ARK_REPORT_URL ?? "http://localhost:3024/dashboard/";
const DS = process.env.DS_PREVIEW_URL ?? "http://localhost:3000/components.html#section-quality-gate";

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});

/** @param {import('playwright').Page} p */
async function setLight(p) {
  await p.evaluate(() => {
    document.documentElement.dataset.theme = "light";
    document.documentElement.classList.add("theme-light");
    document.documentElement.classList.remove("theme-dark");
  });
  await p.waitForTimeout(400);
}

/**
 * @param {import('playwright').Page} p
 * @param {string} file
 * @param {string} titleSubstring
 * @param {{ kit?: boolean | null }} opts
 */
async function shotReportWidget(p, file, titleSubstring, opts = {}) {
  const { kit = null } = opts;
  const handle = await p.evaluateHandle(
    ({ titleSubstring, kit }) => {
      for (const node of document.querySelectorAll(".widget-tile, .styles_widget__JLpmE")) {
        const isKit = node.classList.contains("widget-tile");
        if (kit === true && !isKit) continue;
        if (kit === false && isKit) continue;
        const t =
          node.querySelector(".widget-tile__title, .headings-head-s, .quality-gate__bar-title")
            ?.textContent?.trim() ?? "";
        if (t.includes(titleSubstring)) return node;
      }
      return null;
    },
    { titleSubstring, kit },
  );
  const el = handle.asElement();
  if (!el) throw new Error(`widget not found: ${titleSubstring} (kit=${kit})`);
  await el.scrollIntoViewIfNeeded();
  await p.waitForTimeout(600);
  await el.screenshot({ path: join(OUT, file), type: "png" });
  const box = await el.boundingBox();
  console.log("report", file, titleSubstring, box);
}

/** @param {import('playwright').Page} p */
async function shotQgFromReport(p, file, testId) {
  const el = p.locator(`[data-testid="${testId}"]`).first();
  await el.waitFor({ state: "visible" });
  const tile = el.locator("xpath=ancestor::*[contains(@class,'widget-tile')][1]");
  await tile.scrollIntoViewIfNeeded();
  await p.waitForTimeout(400);
  await tile.screenshot({ path: join(OUT, file), type: "png" });
  console.log("report-qg", file);
}

if (mode === "stock" || mode === "all") {
  await page.goto(REPORT, { waitUntil: "networkidle" });
  await setLight(page);
  for (const [file, title] of [
    ["stock-current-status.png", "Текущий статус"],
    ["stock-duration-dynamics.png", "Динамика длительности"],
    ["stock-testing-pyramid.png", "Пирамида тестирования"],
    ["stock-durations-layer.png", "Длительности по layer"],
    ["stock-status-dynamics.png", "Динамика статусов"],
    ["stock-severity.png", "Результаты по severity"],
  ]) {
    await shotReportWidget(page, file, title, { kit: false });
  }
}

if (mode === "kit" || mode === "all") {
  await page.goto(REPORT, { waitUntil: "networkidle" });
  await setLight(page);
  for (const [file, title] of [
    ["kit-testing-pyramid.png", "Пирамида тестирования"],
    ["kit-durations-layer.png", "Длительности по layer"],
    ["kit-current-status-services.png", "Текущий статус по сервисам"],
    ["kit-gauge.png", "Прошло тестов"],
    ["kit-layers-table.png", "Тесты по слоям"],
    ["kit-pass-rate-trend.png", "Pass rate по прогонам"],
  ]) {
    await shotReportWidget(page, file, title, { kit: true });
  }
}

if (mode === "qg" || mode === "all") {
  await page.goto(DS, { waitUntil: "networkidle" });
  await setLight(page);
  await page.waitForSelector('[data-testid="quality-gate-demo-failed"] .quality-gate');

  await page.evaluate(() => {
    const wrap = (sel) => {
      const host = document.querySelector(sel);
      const qg = host?.querySelector(".quality-gate");
      if (!qg || host.querySelector(".widget-tile")) return;
      const tile = document.createElement("figure");
      tile.className =
        "widget-tile widget-tile--quality-gate widget-tile--layout-5x2 widget-tile--tier-hero";
      const body = document.createElement("div");
      body.className = "widget-tile__body";
      tile.appendChild(body);
      host.appendChild(tile);
      body.appendChild(qg);
    };
    for (const id of [
      "quality-gate-demo-failed",
      "sonar-quality-gate-demo-failed",
      "quality-gate-demo-passed",
      "sonar-quality-gate-demo-passed",
    ]) {
      wrap(`[data-testid="${id}"]`);
    }
  });

  /** @param {string} file @param {string} testid */
  async function shotDemoTile(file, testid) {
    const el = page.locator(`[data-testid="${testid}"] .widget-tile`).first();
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await el.screenshot({ path: join(OUT, file), type: "png" });
    console.log("ds", file);
  }

  await shotDemoTile("kit-qg-allure-failed.png", "quality-gate-demo-failed");
  await shotDemoTile("kit-qg-sonar-failed.png", "sonar-quality-gate-demo-failed");
  await shotDemoTile("kit-qg-allure-passed.png", "quality-gate-demo-passed");
  await shotDemoTile("kit-qg-sonar-passed.png", "sonar-quality-gate-demo-passed");

  /** @param {string} file @param {string} testid */
  async function shotDemoInfo(file, testid) {
    await page.mouse.click(5, 5);
    await page.waitForTimeout(100);
    const root = page.locator(`[data-testid="${testid}"]`);
    await root.scrollIntoViewIfNeeded();
    await root.locator(".qg-info__trigger").click();
    await page.waitForTimeout(350);
    const tile = root.locator(".widget-tile");
    const pop = root.locator(".qg-info--open .qg-info__popover");
    const tileBox = await tile.boundingBox();
    const popBox = await pop.boundingBox();
    if (!tileBox || !popBox) throw new Error(`no popover for ${testid}`);
    const x = Math.min(tileBox.x, popBox.x) - 8;
    const y = Math.min(tileBox.y, popBox.y) - 8;
    const right = Math.max(tileBox.x + tileBox.width, popBox.x + popBox.width) + 8;
    const bottom = Math.max(tileBox.y + tileBox.height, popBox.y + popBox.height) + 8;
    await page.screenshot({
      path: join(OUT, file),
      clip: {
        x: Math.max(0, x),
        y: Math.max(0, y),
        width: Math.min(1440, right - Math.max(0, x)),
        height: Math.min(2000, bottom - Math.max(0, y)),
      },
      type: "png",
    });
    console.log("ds-info", file);
  }

  await shotDemoInfo("kit-qg-allure-passed-info.png", "quality-gate-demo-passed");
  await shotDemoInfo("kit-qg-allure-failed-info.png", "quality-gate-demo-failed");
  await shotDemoInfo("kit-qg-sonar-passed-info.png", "sonar-quality-gate-demo-passed");
  await shotDemoInfo("kit-qg-sonar-failed-info.png", "sonar-quality-gate-demo-failed");

  const popOnly = page.locator('[data-testid="quality-gate-demo-failed"] .qg-info--open .qg-info__popover');
  await popOnly.waitFor({ state: "visible" });
  const popBox = await popOnly.boundingBox();
  if (popBox) {
    await page.screenshot({
      path: join(OUT, "kit-qg-allure-failed-links.png"),
      clip: {
        x: Math.max(0, popBox.x - 4),
        y: Math.max(0, popBox.y - 4),
        width: popBox.width + 8,
        height: Math.min(900, popBox.height + 8),
      },
      type: "png",
    });
  }

  await page.goto(REPORT, { waitUntil: "networkidle" });
  await setLight(page);
  await shotQgFromReport(page, "kit-qg-allure-passed-report.png", "quality-gate");
  await shotQgFromReport(page, "kit-qg-sonar-passed-report.png", "sonar-quality-gate");

  const allureQg = page.locator('[data-testid="quality-gate"]').first();
  await allureQg.scrollIntoViewIfNeeded();
  await allureQg.locator(".qg-info__trigger").hover();
  await page.waitForTimeout(400);
  const hoverBox = await page.evaluate(() => {
    const tile = document.querySelector('[data-testid="quality-gate"]')?.closest(".widget-tile");
    const pop = document.querySelector(".qg-info--open .qg-info__popover");
    const boxes = [tile, pop].filter(Boolean).map((n) => n.getBoundingClientRect());
    const x = Math.min(...boxes.map((b) => b.x));
    const y = Math.min(...boxes.map((b) => b.y));
    const right = Math.max(...boxes.map((b) => b.right));
    const bottom = Math.max(...boxes.map((b) => b.bottom));
    return { x, y, width: right - x, height: bottom - y };
  });
  await page.screenshot({
    path: join(OUT, "kit-qg-info-hover.png"),
    clip: {
      x: Math.max(0, hoverBox.x - 8),
      y: Math.max(0, hoverBox.y - 8),
      width: Math.min(1440, hoverBox.width + 16),
      height: Math.min(1200, hoverBox.height + 16),
    },
    type: "png",
  });
  const livePop = await page.locator(".qg-info--open .qg-info__popover").boundingBox();
  if (livePop) {
    await page.screenshot({
      path: join(OUT, "kit-qg-info-links.png"),
      clip: {
        x: Math.max(0, livePop.x - 4),
        y: Math.max(0, livePop.y - 4),
        width: livePop.width + 8,
        height: Math.min(900, livePop.height + 8),
      },
      type: "png",
    });
  }
}

await browser.close();
console.log("done →", OUT);
