/**
 * How the web layer decides which tile owns which chart data.
 *
 * Worth testing without a browser: getting this wrong draws a real chart from
 * the wrong numbers, which no smoke assertion about tile counts would catch.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { declareSuite } from "./test-meta.mjs";

declareSuite({
  feature: "report-matching",
  story: "Tile pairing",
  layer: "unit",
  severity: "normal",
});

process.env.ALLURE_REPORT_KIT_SILENT = "1";

const { pairTiles, tilesForList } = await import("../dist/allure/report.js");
const { withKit, charts, panels, presets } = await import("../dist/index.js");

const tilesOf = (config, plugin = "awesome") => config.plugins[plugin].options.kit.tiles;

const awesome = (charts_) =>
  withKit({ name: "T", softFork: true, plugins: { awesome: { options: { charts: charts_ } } } });

test("keyed pairing survives a chart the report did not generate", () => {
  const tiles = tilesOf(
    awesome([charts.currentStatus(), charts.durationDynamics(), charts.testingPyramid()]),
  );

  // The middle tile produced nothing — a filter left it empty. Positionally the
  // pyramid would have been handed the duration data.
  const paired = pairTiles(
    [
      ["ark-charts-0", { type: "currentStatus" }],
      ["ark-charts-2", { type: "testingPyramid" }],
    ],
    tiles,
  );

  assert.deepEqual(
    paired.map((entry) => [entry.chartId, entry.tile?.type, entry.chartData?.type]),
    [
      ["ark-charts-0", "currentStatus", "currentStatus"],
      ["ark-charts-2", "testingPyramid", "testingPyramid"],
    ],
  );
});

test("keyed pairing is independent of the order the widget lists", () => {
  const tiles = tilesOf(awesome([charts.currentStatus(), charts.durationDynamics()]));

  const paired = pairTiles(
    [
      ["ark-charts-1", { type: "durationDynamics" }],
      ["ark-charts-0", { type: "currentStatus" }],
    ],
    tiles,
  );

  assert.deepEqual(
    paired.map((entry) => entry.tile.type),
    ["currentStatus", "durationDynamics"],
  );
});

test("a panel consumes no chart entry", () => {
  const tiles = tilesOf(
    awesome([charts.currentStatus(), panels.custom({ id: "services" }), charts.durations()]),
  );

  const paired = pairTiles(
    [
      ["ark-charts-0", { type: "currentStatus" }],
      ["ark-charts-2", { type: "durations" }],
    ],
    tiles,
  );

  assert.deepEqual(
    paired.map((entry) => entry.chartId),
    ["ark-charts-0", "kit-panel-services", "ark-charts-2"],
  );
});

test("an entry no tile claims is left to Allure", () => {
  const tiles = tilesOf(awesome([charts.currentStatus()]));

  const paired = pairTiles(
    [
      ["ark-charts-0", { type: "currentStatus" }],
      ["uuid-from-elsewhere", { type: "durations" }],
    ],
    tiles,
  );

  assert.equal(paired.at(-1).chartId, "uuid-from-elsewhere");
  assert.equal(paired.at(-1).tile, undefined);
});

test("without stable ids the positional walk still runs", () => {
  // A report generated before the re-keying, or by a plugin that is not the kit's.
  const legacy = tilesOf(awesome(presets.lockedQuad())).map(({ chartId, ...tile }) => tile);

  const paired = pairTiles(
    [
      ["uuid-a", { type: "currentStatus" }],
      ["uuid-b", { type: "durationDynamics" }],
    ],
    legacy,
  );

  assert.deepEqual(
    paired.map((entry) => entry.tile?.type),
    ["currentStatus", "durationDynamics"],
  );
});

test("each plugin only sees the list it renders", () => {
  const config = withKit({
    name: "T",
    softFork: true,
    plugins: {
      awesome: { options: { charts: [charts.currentStatus()] } },
      dashboard: { options: { layout: [charts.durations({ groupBy: "layer" })] } },
    },
  });

  const manifest = config.plugins.dashboard.options.kit;
  assert.deepEqual(
    tilesForList(manifest, "layout").map((tile) => tile.type),
    ["durations"],
  );
  assert.equal(tilesForList(manifest, "charts"), undefined);
});
