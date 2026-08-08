/**
 * Parity of the kit models against the data Allure generated.
 *
 * The fixture is a real `widgets/charts.json` captured from `e2e/` — one entry
 * per upstream chart type, verbatim. Refreshing it is a step of the upstream sync
 * checklist in `soft-fork/README.md`.
 *
 * Two things are checked, and neither is "looks like nivo":
 *
 *   numbers — a model must carry the values upstream computed. The kit redraws
 *             the same run, so any total that drifts is a modelling bug (that is
 *             how the halved `currentStatus` percentage was found);
 *   palette — every colour a model names must be an `--ark-*` token, since the
 *             locked canon is the kit's and a backend default would break the
 *             mix-on-one-page promise.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const CHARTS = JSON.parse(
  readFileSync(new URL("./fixtures/allure-charts.json", import.meta.url), "utf8"),
);

const { toChartModel } = await import("../dist/allure/model.js");

const TYPES = [
  "currentStatus",
  "statusDynamics",
  "statusTransitions",
  "stabilityDistribution",
  "testBaseGrowthDynamics",
  "statusAgePyramid",
  "durations",
  "durationDynamics",
  "testResultSeverities",
  "testingPyramid",
  "coverageDiff",
  "successRateDistribution",
  "problemsDistribution",
];

const model = (type) => {
  const built = toChartModel(CHARTS[type]);
  assert.ok(built, `${type}: no model — the tile would silently fall back to stock`);
  return built;
};

const sumPoints = (series) =>
  series.reduce(
    (total, one) => total + (one.points ?? []).reduce((inner, point) => inner + point.y, 0),
    0,
  );

test("every upstream chart type has a model", () => {
  assert.deepEqual(Object.keys(CHARTS).sort(), [...TYPES].sort());
  for (const type of TYPES) {
    assert.ok(toChartModel(CHARTS[type]), `${type} is not modelled`);
  }
});

test("colours are kit tokens, never a backend default", () => {
  for (const type of TYPES) {
    for (const series of model(type).series) {
      if (series.color !== undefined) {
        assert.match(series.color, /^var\(--ark-[\w-]+\)$/, `${type}/${series.id}: ${series.color}`);
      }
      for (const point of series.points ?? []) {
        if (point.color !== undefined) {
          assert.match(point.color, /^var\(--ark-[\w-]+\)$/, `${type}/${series.id}: ${point.color}`);
        }
      }
    }
  }
});

test("currentStatus keeps the statistic total, not the sum of its fields", () => {
  const built = model("currentStatus");
  const source = CHARTS.currentStatus.data;

  assert.equal(built.total, source.total);
  assert.equal(
    built.series.reduce((sum, series) => sum + series.value, 0),
    source.total,
  );
  assert.equal(built.percentage, (source.passed / source.total) * 100);
});

test("testingPyramid keeps every tier and its count", () => {
  const built = model("testingPyramid");
  const source = CHARTS.testingPyramid.data;

  assert.deepEqual(
    built.series.map((series) => [series.id, series.value]),
    source.map((tier) => [tier.layer, tier.testCount]),
  );
});

test("durations keeps the histogram bucket totals", () => {
  const built = model("durations");
  const source = CHARTS.durations.data;
  const seriesIds = Object.keys(CHARTS.durations.keys ?? {});

  assert.equal(built.categories.length, source.length);
  assert.equal(
    sumPoints(built.series),
    source.reduce(
      (total, bucket) => total + seriesIds.reduce((inner, id) => inner + (bucket[id] ?? 0), 0),
      0,
    ),
  );
});

test("stabilityDistribution is one series with per-point colours", () => {
  const built = model("stabilityDistribution");
  const source = CHARTS.stabilityDistribution.data;
  const threshold = CHARTS.stabilityDistribution.threshold;

  // One bar per group: the two-series split left a gap in the axis for every
  // group belonging to the other half.
  assert.equal(built.series.length, 1);
  assert.deepEqual(
    built.series[0].points.map((point) => point.y),
    source.map((group) => group.stabilityRate),
  );

  for (const [index, point] of built.series[0].points.entries()) {
    const stable = source[index].stabilityRate >= threshold;
    assert.equal(point.family, stable ? "green" : "red");
  }
});

test("testBaseGrowthDynamics keeps the per-status breakdown", () => {
  const built = model("testBaseGrowthDynamics");
  const source = CHARTS.testBaseGrowthDynamics.data;
  const statuses = CHARTS.testBaseGrowthDynamics.statuses ?? [
    "passed",
    "failed",
    "broken",
    "skipped",
    "unknown",
  ];

  const nonEmpty = [];
  for (const prefix of ["new", "removed"]) {
    for (const status of statuses) {
      if (source.some((run) => (run[`${prefix}:${status}`] ?? 0) > 0)) {
        nonEmpty.push(`${prefix}:${status}`);
      }
    }
  }

  // Aggregating into added/removed used to drop the status of the change.
  assert.deepEqual(
    built.series.map((series) => series.id).sort(),
    nonEmpty.sort(),
  );

  for (const series of built.series) {
    const sign = series.id.startsWith("removed:") ? -1 : 1;
    assert.deepEqual(
      series.points.map((point) => point.y),
      source.map((run) => sign * (run[series.id] ?? 0)),
    );
  }
});

test("run-history charts label the axis by run, not by uuid", () => {
  for (const type of ["durationDynamics", "statusDynamics", "statusTransitions"]) {
    const built = model(type);
    assert.equal(built.categories.at(-1), "current", `${type}: last run is not "current"`);
    for (const category of built.categories) {
      assert.doesNotMatch(category, /^[0-9a-f]{8}-/, `${type}: uuid leaked into the axis`);
    }
  }
});

test("treemap and heatmap keep their own shape", () => {
  for (const type of ["coverageDiff", "successRateDistribution"]) {
    const built = model(type);
    assert.equal(built.kind, "treemap");
    assert.equal(built.series.length, 0);
    assert.ok(built.tree, `${type}: tree missing`);
  }

  const heatmap = model("problemsDistribution");
  assert.equal(heatmap.kind, "heatmap");
  assert.equal(
    heatmap.series.length,
    CHARTS.problemsDistribution.data.length,
    "problemsDistribution: rows lost",
  );
  for (const series of heatmap.series) {
    assert.equal(series.points.length, heatmap.categories.length, "heatmap row is ragged");
  }
});
