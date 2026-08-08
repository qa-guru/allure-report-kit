/**
 * Realtime lifecycle — `start` → `update` without `done`.
 *
 * `allure watch` never calls `done` until SIGINT, so kit readiness must happen on
 * the first `update`. These tests mock upstream and reportFiles rather than
 * generating a full report.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { declareSuite } from "./test-meta.mjs";

declareSuite({
  feature: "plugin-core",
  story: "Realtime update lifecycle",
  layer: "unit",
  severity: "blocker",
});

process.env.ALLURE_REPORT_KIT_SILENT = "1";

const { createKitPlugin } = await import("../packages/plugin-core/src/index.js");
const { charts, panels, presets, withKit } = await import("../dist/index.js");

const resolveFrom = createRequire(
  join(dirname(fileURLToPath(import.meta.url)), "../packages/plugin-awesome/src/index.js"),
);

const RUN = [
  { status: "passed", duration: 1000, labels: [{ name: "layer", value: "unit" }] },
  { status: "passed", duration: 2000, labels: [{ name: "layer", value: "unit" }] },
  { status: "failed", duration: 3000, labels: [{ name: "layer", value: "e2e" }] },
  { status: "broken", duration: 4000, labels: [{ name: "layer", value: "api" }] },
];

const store = {
  allTestResults: async () => RUN,
  allHistoryDataPoints: async () => [],
};

function manifestFromConfig(config) {
  return config.plugins.awesome.options;
}

function createMockUpstream() {
  return class MockUpstream {
    start = async () => {};

    update = async (context) => {
      await context.reportFiles.addFile(
        "index.html",
        Buffer.from("<!doctype html><html><head></head><body></body></html>", "utf8"),
      );
      await context.reportFiles.addFile(
        "widgets/charts.json",
        Buffer.from(
          JSON.stringify({
            general: {
              "2af2dfef-871d-44f1-8966-470cf8f48e62": { type: "currentStatus" },
              "e5f086d0-e248-4f4a-b9a4-54fc772fc2f1": { type: "durationDynamics" },
              "a1b2c3d4-e5f6-7890-abcd-ef1234567890": { type: "testingPyramid" },
              "b2c3d4e5-f6a7-8901-bcde-f23456789012": { type: "durations" },
            },
          }),
          "utf8",
        ),
      );
    };

    done = async () => {};
  };
}

function createHarness(options) {
  const files = new Map();

  const context = {
    reportFiles: {
      addFile: async (path, data) => {
        files.set(path, Buffer.isBuffer(data) ? data : Buffer.from(data));
        return path;
      },
    },
  };

  const KitPlugin = createKitPlugin({
    id: "awesome",
    UpstreamPlugin: createMockUpstream(),
    forkPackage: "@qa-guru/allure-report-kit-web-awesome",
    upstreamPackage: "@allurereport/web-awesome",
    tilesKey: "charts",
    resolveFrom,
  });

  const plugin = new KitPlugin(options);
  return { plugin, context, files };
}

test("update without done injects the kit bundle and re-keys charts", async () => {
  const config = withKit({
    name: "T",
    softFork: true,
    plugins: {
      awesome: {
        options: {
          charts: [
            ...presets.lockedQuad(),
            panels.fromRun({
              id: "passRate",
              title: "Прошло тестов",
              groupBy: "status",
              metric: "count",
              kind: "gauge",
            }),
          ],
        },
      },
    },
  });

  const options = manifestFromConfig(config);
  const { plugin, context, files } = createHarness(options);

  await plugin.start(context, store, true);
  await plugin.update(context, store);

  const forkMain = JSON.parse(
    await readFile(
      join(dirname(fileURLToPath(import.meta.url)), "../packages/web-awesome/dist/multi/manifest.json"),
      "utf8",
    ),
  )["main.js"];

  const html = files.get("index.html")?.toString("utf8") ?? "";
  assert.match(html, /window\.allureReportKit\s*=/);
  assert.match(html, new RegExp(`src="${forkMain}"`));

  const chartsJson = JSON.parse(files.get("widgets/charts.json")?.toString("utf8") ?? "{}");
  assert.ok(chartsJson.general["ark-charts-0"]);
  assert.equal(chartsJson.general["ark-charts-0"].type, "currentStatus");
  assert.ok(chartsJson.general["ark-charts-1"]);
  assert.equal(chartsJson.general["ark-charts-1"].type, "durationDynamics");
  assert.ok(!chartsJson.general["2af2dfef-871d-44f1-8966-470cf8f48e62"]);

  const panelPath = "widgets/kit-panels/passRate.json";
  assert.ok(files.has(panelPath), `expected ${panelPath} from fromRun`);
  const panel = JSON.parse(files.get(panelPath).toString("utf8"));
  assert.ok(Array.isArray(panel.series));
  assert.equal(panel.total, RUN.length);
});

test("update writes fork assets once across repeated updates", async () => {
  const config = withKit({
    name: "T",
    softFork: true,
    plugins: {
      awesome: {
        options: {
          charts: [charts.currentStatus()],
        },
      },
    },
  });

  const { plugin, context, files } = createHarness(manifestFromConfig(config));

  await plugin.start(context, store, true);
  await plugin.update(context, store);
  const afterFirst = [...files.keys()].filter((path) => path.endsWith(".js") || path.endsWith(".css"));

  await plugin.update(context, store);
  const afterSecond = [...files.keys()].filter((path) => path.endsWith(".js") || path.endsWith(".css"));

  assert.deepEqual(afterSecond.sort(), afterFirst.sort());
  assert.ok(afterFirst.some((path) => path.endsWith(".js") && path.includes("app-")));
});

test("singleFile with realtime falls back to stock html", async () => {
  const config = withKit({
    name: "T",
    softFork: true,
    plugins: {
      awesome: {
        options: {
          singleFile: true,
          charts: [charts.currentStatus()],
        },
      },
    },
  });

  const { plugin, context, files } = createHarness(manifestFromConfig(config));

  await plugin.start(context, store, true);
  await plugin.update(context, store);

  const html = files.get("index.html")?.toString("utf8") ?? "";
  assert.doesNotMatch(html, /window\.allureReportKit\s*=/);
});
