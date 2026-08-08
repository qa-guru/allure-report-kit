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

const { pairTiles, tilesForList, readManifest, isKitOwned, withReportLayout, resolveTileModel, canKitRender, REPORT_TILE_LAYOUT } =
  await import("../dist/allure/report.js");
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

test("keys the plugin never got to rewrite fall back to the walk", () => {
  // `singleFile: true`: upstream keeps its data in memory, so the plugin never
  // sees `charts.json` and the uuids survive. Every tile has an id here — they
  // just match nothing, which is the case a plain lookup would silently lose.
  const tiles = tilesOf(awesome(presets.lockedQuad()));

  const paired = pairTiles(
    [
      ["7f1c-uuid", { type: "currentStatus" }],
      ["9b2d-uuid", { type: "durationDynamics" }],
    ],
    tiles,
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

test("readManifest is absent outside a report window", () => {
  assert.equal(readManifest(), undefined);
});

test("isKitOwned leaves stock and nivo to Allure", () => {
  const [kitTile] = tilesOf(awesome([charts.currentStatus({ renderer: "highcharts" })]));
  const stock = { ...kitTile, renderer: { id: "stock" } };
  const nivo = { ...kitTile, renderer: { id: "nivo" } };

  assert.equal(isKitOwned(undefined), false);
  assert.equal(isKitOwned(stock), false);
  assert.equal(isKitOwned(nivo), false);
  assert.equal(isKitOwned(kitTile), true);
});

test("withReportLayout fills the wide default and keeps an explicit layout", () => {
  const [tile] = tilesOf(awesome([charts.currentStatus()]));
  const filled = withReportLayout(tile);
  assert.equal(filled.layout, REPORT_TILE_LAYOUT);
  assert.equal(filled.tier, undefined);

  const explicit = withReportLayout({ ...tile, layout: "1x1", tier: "micro" });
  assert.equal(explicit.layout, "1x1");
  assert.equal(explicit.tier, "micro");
});

test("resolveTileModel loads a panel or maps chart data", async () => {
  const tiles = tilesOf(
    awesome([
      charts.currentStatus(),
      panels.custom({
        id: "services",
        kind: "bar",
        data: { series: [{ id: "a", label: "a", value: 2 }] },
      }),
    ]),
  );
  const chartTile = tiles.find((tile) => tile.type === "currentStatus");
  const panelTile = tiles.find((tile) => tile.panel);

  assert.equal(await resolveTileModel(chartTile, undefined), undefined);
  const mapped = await resolveTileModel(chartTile, {
    type: "currentStatus",
    data: { passed: 2, failed: 1, broken: 0, skipped: 0, unknown: 0, total: 3 },
  });
  assert.equal(mapped?.kind, "pie");
  assert.equal(mapped?.total, 3);

  const panelModel = await resolveTileModel(panelTile, { type: "currentStatus" });
  assert.equal(panelModel?.kind, "bar");
  assert.equal(panelModel?.series[0].value, 2);
});

test("canKitRender refuses a missing model when no runtime is mounted", () => {
  const [tile] = tilesOf(awesome([charts.currentStatus({ renderer: "highcharts" })]));
  assert.equal(canKitRender(tile, undefined), false);
});

test("pairTiles without tiles keeps every chart entry for Allure", () => {
  const paired = pairTiles(
    [
      ["a", { type: "currentStatus" }],
      ["b", { type: "durations" }],
    ],
    undefined,
  );
  assert.deepEqual(
    paired.map((entry) => entry.chartId),
    ["a", "b"],
  );
});

test("positional walk keeps panels and leftover entries", () => {
  const legacy = tilesOf(
    awesome([charts.currentStatus(), panels.custom({ id: "services" }), charts.durations()]),
  ).map(({ chartId, ...tile }) => tile);

  const paired = pairTiles(
    [
      ["uuid-a", { type: "currentStatus" }],
      ["uuid-b", { type: "durations" }],
      ["uuid-c", { type: "statusDynamics" }],
    ],
    legacy,
  );

  assert.deepEqual(
    paired.map((entry) => [
      entry.chartId,
      entry.tile?.panel?.id ?? entry.tile?.type,
    ]),
    [
      ["uuid-a", "currentStatus"],
      ["kit-panel-services", "services"],
      ["uuid-b", "durations"],
      ["uuid-c", undefined],
    ],
  );
});
