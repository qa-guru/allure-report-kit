/**
 * Plugin-side machinery, without generating a report.
 *
 * These three are the pieces whose failure mode is silent — a stock report that
 * looks fine, a tile drawn from someone else's data, a panel with no data — so
 * they are pure functions on purpose and tested directly.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { declareSuite } from "./test-meta.mjs";

declareSuite({
  feature: "plugin-core",
  story: "Plugin machinery",
  layer: "unit",
  severity: "normal",
});

process.env.ALLURE_REPORT_KIT_SILENT = "1";

const { kitDisabledReason, rekeyChartSection, seriesFromHistory, seriesFromRun, evaluateQualityGate } = await import(
  "../packages/plugin-core/src/index.js"
);
const { withKit, charts, panels, presets, theme } = await import("../dist/index.js");

const manifestOf = (config, plugin = "awesome") => config.plugins[plugin].options.kit;

test("the kit says why it fell back to stock Allure", () => {
  assert.match(kitDisabledReason(undefined, {}), /withKit\(\)/);
  // singleFile is a supported mode, not a reason to stand down.
  assert.equal(kitDisabledReason({ tiles: [] }, { singleFile: true }), undefined);
  assert.equal(kitDisabledReason({ tiles: [] }, {}), undefined);
});

test("singleFile is reported at config time, before anything is generated", () => {
  const config = withKit({
    name: "T",
    softFork: true,
    plugins: {
      awesome: { options: { singleFile: true, charts: presets.lockedQuad() } },
    },
  });

  const single = manifestOf(config).diagnostics.find((entry) => entry.code === "single-file");
  assert.equal(single?.level, "info");
  assert.match(single.message, /inlines its assets/);
});

test("chart tiles get a stable chartId, panels do not", () => {
  const config = withKit({
    name: "T",
    softFork: true,
    plugins: {
      awesome: {
        options: {
          charts: [...presets.lockedQuad(), panels.custom({ id: "services" })],
        },
      },
    },
  });

  assert.deepEqual(
    manifestOf(config).tiles.map((tile) => tile.chartId),
    ["ark-charts-0", "ark-charts-1", "ark-charts-2", "ark-charts-3", undefined],
  );
  assert.deepEqual(
    [...new Set(manifestOf(config).tiles.map((tile) => tile.list))],
    ["charts"],
  );
});

test("re-keying maps the widget onto the config, skipping panels", () => {
  const tiles = manifestOf(
    withKit({
      name: "T",
      softFork: true,
      plugins: {
        awesome: {
          options: {
            charts: [
              charts.currentStatus(),
              panels.custom({ id: "services" }),
              charts.durationDynamics(),
            ],
          },
        },
      },
    }),
  ).tiles;

  // Upstream drops the panel — it does not know the type — so the two entries it
  // did generate belong to the first and third tiles.
  const { section, mismatched } = rekeyChartSection(
    {
      "2af2dfef-871d-44f1-8966-470cf8f48e62": { type: "currentStatus" },
      "e5f086d0-e248-4f4a-b9a4-54fc772fc2f1": { type: "durationDynamics" },
    },
    tiles,
  );

  assert.deepEqual(Object.keys(section), ["ark-charts-0", "ark-charts-2"]);
  assert.deepEqual(mismatched, []);
});

test("a widget that does not line up keeps its own key and stays with Allure", () => {
  const tiles = manifestOf(
    withKit({
      name: "T",
      softFork: true,
      plugins: { awesome: { options: { charts: [charts.currentStatus()] } } },
    }),
  ).tiles;

  const { section, mismatched } = rekeyChartSection({ "uuid-1": { type: "durations" } }, tiles);

  assert.deepEqual(Object.keys(section), ["uuid-1"]);
  assert.equal(mismatched.length, 1);
  assert.match(mismatched[0], /expected currentStatus, widget has durations/);
});

const RUN = [
  { status: "passed", duration: 1000, labels: [{ name: "layer", value: "unit" }] },
  { status: "passed", duration: 3000, flaky: true, labels: [{ name: "layer", value: "unit" }] },
  {
    status: "failed",
    duration: 2000,
    transition: "regressed",
    labels: [{ name: "layer", value: "e2e" }],
  },
  {
    status: "broken",
    duration: 4000,
    transition: "new",
    labels: [{ name: "layer", value: "api" }],
  },
  { status: "passed", duration: 1000, labels: [] },
];

/**
 * The same run as the store hands it over with `includeRetries`.
 *
 * A separate list on purpose: every other metric is measured without retries,
 * and folding the attempt into `RUN` would quietly change what "one failed e2e
 * test" means for all of them.
 */
const RUN_WITH_RETRIES = [
  ...RUN,
  { status: "failed", duration: 900, isRetry: true, labels: [{ name: "layer", value: "e2e" }] },
];

test("a run panel groups by status in the canonical order", () => {
  const series = seriesFromRun(RUN, { groupBy: "status", metric: "count" });

  assert.deepEqual(
    series.map((one) => [one.id, one.value, one.family]),
    [
      ["passed", 3, "green"],
      ["failed", 1, "red"],
      ["broken", 1, "yellow"],
    ],
  );
  assert.equal(series[0].color, "var(--ark-status-passed)");
});

test("a run panel groups by label, largest first, and folds the tail", () => {
  const series = seriesFromRun(RUN, { groupBy: "layer", metric: "count", limit: 2 });

  assert.deepEqual(
    series.map((one) => [one.id, one.value]),
    [
      ["unit", 2],
      ["e2e", 1],
      ["other", 2],
    ],
  );
  // Layer colours are canon too, so the dots keep working for this grouping.
  assert.equal(series[0].color, "var(--ark-layer-unit)");
});

test("pass rate and duration are measured, not counted", () => {
  const rate = seriesFromRun(RUN, { groupBy: "layer", metric: "passRate" });
  assert.equal(rate.find((one) => one.id === "unit").value, 100);
  assert.equal(rate.find((one) => one.id === "e2e").value, 0);

  const duration = seriesFromRun(RUN, { groupBy: "layer", metric: "duration" });
  assert.equal(duration.find((one) => one.id === "unit").value, 4);
});

test("flakiness, retries and transitions read the fields Allure already sets", () => {
  const flaky = seriesFromRun(RUN, { groupBy: "layer", metric: "flakyRate" });
  assert.equal(flaky.find((one) => one.id === "unit").value, 50);
  assert.equal(flaky.find((one) => one.id === "api").value, 0);

  // Attempts, not tests — the caller has to ask the store for retries as well.
  const retries = seriesFromRun(RUN_WITH_RETRIES, { groupBy: "layer", metric: "retries" });
  assert.equal(retries.find((one) => one.id === "e2e").value, 1);
  assert.equal(retries.find((one) => one.id === "unit").value, 0);

  const regressed = seriesFromRun(RUN, { groupBy: "layer", metric: "regressed" });
  assert.equal(regressed.find((one) => one.id === "e2e").value, 1);
  assert.equal(seriesFromRun(RUN, { groupBy: "layer", metric: "new" })
    .find((one) => one.id === "api").value, 1);
});

test("a folded tail is re-measured, not summed", () => {
  // Adding percentages would make `other` 100 + 0 = 100; measuring the two
  // folded groups together gives the one passing test out of three.
  const folded = seriesFromRun(RUN, { groupBy: "layer", metric: "passRate", limit: 1 }).find(
    (one) => one.id === "other",
  );

  assert.equal(folded.value, 33);
});

test("a history panel walks the runs oldest first, inside the window", () => {
  const points = [
    { timestamp: 30, testResults: { a: { status: "passed" }, b: { status: "failed" } } },
    { timestamp: 10, testResults: { a: { status: "passed" }, b: { status: "passed" } } },
    { timestamp: 20, testResults: { a: { status: "failed" }, b: { status: "failed" } } },
  ];

  const single = seriesFromHistory(points, { from: "history", metric: "passRate" });
  assert.deepEqual(single.categories, ["#1", "#2", "#3"]);
  assert.deepEqual(
    single.series[0].points.map((point) => point.y),
    [100, 0, 50],
  );

  // The window keeps the newest runs, and the labels renumber inside it.
  const windowed = seriesFromHistory(points, { from: "history", metric: "count", limit: 2 });
  assert.deepEqual(windowed.categories, ["#1", "#2"]);

  const split = seriesFromHistory(points, { from: "history", splitBy: "status" });
  assert.deepEqual(
    split.series.map((one) => [one.id, one.points.map((point) => point.y)]),
    [
      ["passed", [2, 0, 1]],
      ["failed", [0, 2, 1]],
    ],
  );
});

test("quality gate evaluation mirrors analytics-index rules", () => {
  const run = [
    { status: "passed" },
    { status: "failed", historyId: "a" },
    { status: "failed", historyId: "b" },
    { status: "broken", historyId: "c" },
  ];

  const verdict = evaluateQualityGate(run, { rules: [{ maxFailures: 0 }] });
  assert.equal(verdict.passed, false);
  assert.equal(verdict.rules[0].id, "maxFailures");
  assert.equal(verdict.rules[0].actual, 3);
});

test("theme.header without the soft-fork is reported", () => {
  const config = withKit({
    name: "T",
    theme: theme.qaGuru({ header: theme.header({ productName: "Reference App" }) }),
    plugins: { awesome: { options: { charts: presets.lockedQuad() } } },
  });

  assert.ok(
    manifestOf(config).diagnostics.some((entry) => entry.code === "header-needs-soft-fork"),
  );
});

test("a run panel without the soft-fork is reported", () => {
  const config = withKit({
    name: "T",
    plugins: {
      awesome: {
        options: {
          charts: [
            ...presets.lockedQuad(),
            panels.fromRun({ id: "byLayer", groupBy: "layer", kind: "bar" }),
          ],
        },
      },
    },
  });

  assert.ok(
    manifestOf(config).diagnostics.some((entry) => entry.code === "run-panels-need-soft-fork"),
  );
});
