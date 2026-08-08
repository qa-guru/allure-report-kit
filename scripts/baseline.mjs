#!/usr/bin/env node
/**
 * Structural baseline for the dogfood compare grid.
 *
 * One model drawn by more than one backend — pie/bar/gauge ×
 * pie/bar/gauge × highcharts/amcharts/svg. We capture counts and families, not pixels: a backend
 * that drops a slice or stops painting from the canon fails here rather than
 * waiting to be noticed on the stand.
 *
 * Usage:
 *   node scripts/baseline.mjs [url] [--update]
 *
 * Without a URL the script serves dogfood on :4021 itself (CI has no stands).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium } from "playwright";

import { startStatic } from "./static-server.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = join(ROOT, "test/fixtures/dogfood-baseline.json");

/** Same grid as dogfood/dogfood.js — keep in sync. */
export const COMPARE_KEYS = [
  "pie:highcharts",
  "pie:amcharts",
  "bar:highcharts",
  "gauge:svg",
];

const MARK_SELECTOR =
  'path[fill]:not([fill="none"]):not([fill="transparent"]), rect[fill]:not([fill="none"])';

/**
 * @param {import("playwright").Page} page
 * @returns {Promise<Record<string, import("./baseline.mjs").CompareSnapshot>>}
 */
export async function captureCompareBaseline(page) {
  await page.waitForSelector("[data-ark-compare][data-ark-rendered-by]", { timeout: 15_000 });
  await page.waitForFunction(
    (expected) => document.querySelectorAll("[data-ark-compare][data-ark-rendered-by]").length >= expected,
    COMPARE_KEYS.length,
    { timeout: 15_000 },
  );

  const tiles = await page.$$eval("[data-ark-compare]", (nodes, selector) => {
    return nodes.map((root) => {
      const body = root.querySelector(".widget-tile__body");
      const marks = body ? [...body.querySelectorAll(selector)] : [];
      const dots = [...root.querySelectorAll(".widget-tile__bar .indicator-row .indicator")].map((dot) =>
        [...dot.classList]
          .find((name) => name.startsWith("indicator--status-"))
          ?.replace("indicator--status-", ""),
      );

      const texts = body
        ? [...body.querySelectorAll("text")]
            .map((node) => node.textContent?.trim())
            .filter(Boolean)
        : [];

      const svgPaths = body ? body.querySelectorAll("svg path").length : 0;

      return {
        key: root.dataset.arkCompare,
        renderedBy: root.dataset.arkRenderedBy,
        dots,
        markCount: marks.length,
        svgPaths,
        texts: [...new Set(texts)].sort(),
        bodyChildren: body?.childElementCount ?? 0,
      };
    });
  }, MARK_SELECTOR);

  /** @type {Record<string, CompareSnapshot>} */
  const baseline = {};
  for (const tile of tiles) {
    if (tile.key) {
      baseline[tile.key] = tile;
    }
  }
  return baseline;
}

/**
 * @typedef {Object} CompareSnapshot
 * @property {string} key
 * @property {string} renderedBy
 * @property {string[]} dots
 * @property {number} markCount
 * @property {number} svgPaths
 * @property {string[]} texts
 * @property {number} bodyChildren
 */

/**
 * @param {Record<string, CompareSnapshot>} actual
 * @param {Record<string, CompareSnapshot>} expected
 */
export function diffBaseline(actual, expected) {
  const failures = [];

  for (const key of COMPARE_KEYS) {
    const got = actual[key];
    const want = expected[key];
    if (!want) {
      failures.push(`${key}: missing from fixture`);
      continue;
    }
    if (!got) {
      failures.push(`${key}: tile not rendered`);
      continue;
    }

    if (got.renderedBy !== want.renderedBy) {
      failures.push(`${key}: renderedBy ${got.renderedBy}, expected ${want.renderedBy}`);
    }
    if (JSON.stringify(got.dots) !== JSON.stringify(want.dots)) {
      failures.push(`${key}: dots ${JSON.stringify(got.dots)}, expected ${JSON.stringify(want.dots)}`);
    }
    if (got.markCount !== want.markCount) {
      failures.push(`${key}: markCount ${got.markCount}, expected ${want.markCount}`);
    }
    if (got.svgPaths !== want.svgPaths) {
      failures.push(`${key}: svgPaths ${got.svgPaths}, expected ${want.svgPaths}`);
    }
    if (JSON.stringify(got.texts) !== JSON.stringify(want.texts)) {
      failures.push(`${key}: texts ${JSON.stringify(got.texts)}, expected ${JSON.stringify(want.texts)}`);
    }
    if (got.bodyChildren !== want.bodyChildren) {
      failures.push(`${key}: bodyChildren ${got.bodyChildren}, expected ${want.bodyChildren}`);
    }
  }

  return failures;
}

async function main() {
  const update = process.argv.includes("--update");
  const urlArg = process.argv.find((arg) => arg.startsWith("http"));
  const urlPath = "/dogfood/";

  let url = urlArg;
  let server;

  if (!url) {
    server = await startStatic({ root: ROOT, port: 4021 });
    url = `${server.url}${urlPath}`;
  }

  const browser = await chromium.launch({ headless: true, channel: "chromium" });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1600 } });

  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error)));

  await page.goto(url, { waitUntil: "networkidle" });
  const baseline = await captureCompareBaseline(page);
  await browser.close();
  if (server) {
    await server.close();
  }

  if (update) {
    writeFileSync(FIXTURE, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
    console.log(`baseline: updated ${FIXTURE} (${COMPARE_KEYS.length} tiles)`);
    process.exit(0);
  }

  const expected = JSON.parse(readFileSync(FIXTURE, "utf8"));
  const failures = diffBaseline(baseline, expected);

  if (consoleErrors.length > 0) {
    failures.push(`console errors:\n  ${consoleErrors.join("\n  ")}`);
  }

  if (failures.length > 0) {
    console.error(`baseline: FAIL (${failures.length})`);
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    process.exit(1);
  }

  console.log(`baseline: OK — ${COMPARE_KEYS.length} compare tiles`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
