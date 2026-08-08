#!/usr/bin/env node
/**
 * Headless smoke of `allure watch` with the kit plugin.
 *
 * Spawns watch on the e2e fixture, checks the live report over HTTP, appends a
 * few results, verifies counts move, then SIGINT. Timeout 120s.
 *
 * Usage: node scripts/smoke-watch.mjs
 */
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

import { makeFixture } from "../e2e/make-fixture.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const E2E = join(ROOT, "e2e");
const PORT = Number(process.env.ARK_WATCH_PORT ?? 4025);
const TIMEOUT_MS = 120_000;
const BASE = `http://127.0.0.1:${PORT}`;

const UPSTREAM_NOISE = [/favicon\.ico/, /A negative value is not valid/];

const failures = [];
const check = (condition, message) => {
  if (!condition) {
    failures.push(message);
  }
};

function spawnWatch() {
  const bin = join(E2E, "node_modules/.bin/allure");
  return spawn(
    bin,
    ["watch", "allure-results", "--config", "allurerc.watch.mjs", "--port", String(PORT)],
    { cwd: E2E, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, FORCE_COLOR: "0" } },
  );
}

async function waitForHttp(path, deadline) {
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(2000) });
      if (response.ok) {
        return;
      }
    } catch {
      /* watch still starting */
    }
    await sleep(500);
  }
  throw new Error(`watch smoke: ${path} did not return 2xx within timeout`);
}

async function gaugeReading(page) {
  return page.evaluate(() => {
    const tile = [...document.querySelectorAll(".widget-tile")].find(
      (node) => node.querySelector(".widget-tile__title")?.textContent?.trim() === "Прошло тестов",
    );
    return tile?.querySelector("svg text")?.textContent?.trim() ?? "";
  });
}

async function openCharts(page) {
  await page.goto(`${BASE}/awesome/`, { waitUntil: "networkidle" });
  await page.waitForSelector("#app-header .header", { timeout: 15_000 });
  await page.getByText("Отчет", { exact: true }).first().click();
  await page.getByText("Графики", { exact: true }).first().click();
  await page.waitForSelector(".widget-tile[data-ark-rendered-by]", { timeout: 15_000 });
}

const deadline = Date.now() + TIMEOUT_MS;

await makeFixture({ run: 0, seed: 1 });

const watch = spawnWatch();
let watchLog = "";

watch.stdout?.on("data", (chunk) => {
  watchLog += chunk.toString();
});
watch.stderr?.on("data", (chunk) => {
  watchLog += chunk.toString();
});

try {
  await waitForHttp("/awesome/index.html", deadline);

  const browser = await chromium.launch({ headless: true, channel: "chromium" });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const consoleErrors = [];

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

  await openCharts(page);

  const snapshot = await page.evaluate(() => ({
    manifest: Boolean(window.allureReportKit),
    kitTiles: document.querySelectorAll(".widget-tile[data-ark-rendered-by]").length,
    stockOnly: [...document.querySelectorAll(".widget-tile[data-ark-rendered-by]")].every(
      (node) => node.dataset.arkRenderedBy !== "stock",
    ),
  }));

  check(snapshot.manifest, "watch: window.allureReportKit is missing");
  check(snapshot.kitTiles >= 1, `watch: expected kit tiles, got ${snapshot.kitTiles}`);
  check(snapshot.stockOnly, "watch: every kit tile is still stock");

  const before = await gaugeReading(page);
  check(before !== "", `watch: gauge reading empty before append (got "${before}")`);

  const extra = [
    {
      uuid: "watch-extra-pass-1",
      historyId: "watch-extra-pass-1",
      name: "watch extra pass 1",
      status: "passed",
      stage: "finished",
      start: Date.now(),
      stop: Date.now() + 100,
      labels: [{ name: "layer", value: "unit" }],
    },
    {
      uuid: "watch-extra-pass-2",
      historyId: "watch-extra-pass-2",
      name: "watch extra pass 2",
      status: "passed",
      stage: "finished",
      start: Date.now(),
      stop: Date.now() + 100,
      labels: [{ name: "layer", value: "unit" }],
    },
    {
      uuid: "watch-extra-fail-1",
      historyId: "watch-extra-fail-1",
      name: "watch extra fail 1",
      status: "failed",
      stage: "finished",
      start: Date.now(),
      stop: Date.now() + 100,
      labels: [{ name: "layer", value: "e2e" }],
      statusDetails: { message: "injected for watch smoke" },
    },
  ];

  for (const result of extra) {
    await writeFile(
      join(E2E, "allure-results", `${result.uuid}-result.json`),
      `${JSON.stringify(result, null, 2)}\n`,
      "utf8",
    );
  }

  await sleep(2500);

  const pollUntil = Date.now() + 45_000;
  let after = before;
  while (Date.now() < pollUntil) {
    await openCharts(page);
    after = await gaugeReading(page);
    if (after !== "" && after !== before) {
      break;
    }
    await sleep(1500);
  }

  check(after !== before, `watch: gauge stayed at "${before}" after appending results`);
  check(consoleErrors.length === 0, `watch console errors:\n  ${consoleErrors.join("\n  ")}`);

  await browser.close();
} finally {
  watch.kill("SIGINT");

  const exit = await Promise.race([
    new Promise((done) => watch.once("exit", (code) => done(code ?? 1))),
    sleep(15_000).then(() => {
      watch.kill("SIGKILL");
      return 1;
    }),
  ]);

  check(exit === 0, `watch: expected exit 0 on SIGINT, got ${exit}`);
}

if (failures.length > 0) {
  console.error(`smoke-watch: FAIL (${failures.length})`);
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  if (watchLog.trim()) {
    console.error("--- watch log ---\n" + watchLog.trim());
  }
  process.exit(1);
}

console.log("smoke-watch: OK — kit active under allure watch, counts moved on append");
