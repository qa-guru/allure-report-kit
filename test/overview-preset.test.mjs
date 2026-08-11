import assert from "node:assert/strict";
import { test } from "node:test";

import { declareSuite } from "./test-meta.mjs";

declareSuite({
  feature: "presets",
  story: "overview preset SSOT",
  layer: "unit",
  severity: "normal",
});

const { OVERVIEW_PRESET } = await import("../presets/overview-preset.mjs");
const { DEFAULT_OVERVIEW_PRESET } = await import("../dist/index.js");

test("DEFAULT_OVERVIEW_PRESET equals presets/overview-preset.mjs", () => {
  assert.deepEqual(DEFAULT_OVERVIEW_PRESET, OVERVIEW_PRESET);
});

test("overview preset SSOT lead contract (gates + quad)", () => {
  assert.deepEqual(
    OVERVIEW_PRESET.qualityGates?.map((gate) => gate.id),
    ["allureQualityGate", "sonarQualityGate"],
  );
  assert.deepEqual(OVERVIEW_PRESET.tiles.map((tile) => tile.chart), [
    "currentStatus",
    "durationDynamics",
    "testingPyramid",
    "durations",
  ]);
  assert.equal(OVERVIEW_PRESET.tiles[1]?.limit, 20);
  assert.equal(OVERVIEW_PRESET.tiles[3]?.groupBy, "layer");
  assert.deepEqual(OVERVIEW_PRESET.renderers, {
    currentStatus: "stock",
    durationDynamics: "stock",
    testingPyramid: "svg",
    durations: "stock",
  });
  assert.deepEqual(OVERVIEW_PRESET.pyramidLayers, [
    "unit",
    "component",
    "integration",
    "api",
    "e2e",
    "manual",
  ]);
});
