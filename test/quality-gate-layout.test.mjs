/**
 * Quality-gate layout IR — snapshot tests from T1 fixtures.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { declareSuite } from "./test-meta.mjs";

declareSuite({
  feature: "quality-gate-layout",
  story: "KitQualityGateData → layout IR",
  layer: "unit",
  severity: "normal",
});

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_DIR = join(ROOT, "fixtures/quality-gate");
const SNAP_DIR = join(ROOT, "test/snapshots/quality-gate-layout");

const FIXTURE_IDS = ["aqg-passed", "aqg-failed", "sqg-passed", "sqg-failed", "sqg-long"];

function loadFixture(id) {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, `${id}.json`), "utf8"));
}

function loadSnapshot(id) {
  return JSON.parse(readFileSync(join(SNAP_DIR, `${id}.json`), "utf8"));
}

test("buildQualityGateLayout matches snapshot for each T1 fixture", async () => {
  const { parseKitQualityGateData } = await import("../dist/quality-gate/parse.js");
  const { buildQualityGateLayout } = await import("../dist/quality-gate/layout/index.js");

  for (const id of FIXTURE_IDS) {
    const layout = buildQualityGateLayout(parseKitQualityGateData(loadFixture(id)));
    assert.deepEqual(layout, loadSnapshot(id), id);
  }
});

test("parseKitQualityGateData → buildQualityGateLayout public API on main entry", async () => {
  const { parseKitQualityGateData, buildQualityGateLayout } = await import("../dist/index.js");

  const layout = buildQualityGateLayout(parseKitQualityGateData(loadFixture("aqg-passed")));
  assert.equal(layout.hidden, false);
  assert.equal(layout.passed, true);
  assert.equal(layout.body.mode, "passed");
  assert.equal(layout.bar.title, "Allure Quality Gate");
});

test("empty rules → hidden layout", async () => {
  const { buildQualityGateLayout } = await import("../dist/quality-gate/layout/index.js");

  const layout = buildQualityGateLayout({
    passed: true,
    rules: [],
  });
  assert.equal(layout.hidden, true);
  assert.equal(layout.bar.info.enabled, false);
});

test("failed body lists only failing rules with formulas", async () => {
  const { parseKitQualityGateData } = await import("../dist/quality-gate/parse.js");
  const { buildQualityGateLayout } = await import("../dist/quality-gate/layout/index.js");

  const sqgFailed = buildQualityGateLayout(parseKitQualityGateData(loadFixture("sqg-failed")));
  assert.equal(sqgFailed.body.mode, "failed");
  assert.equal(sqgFailed.body.rows.length, 1);
  assert.equal(sqgFailed.body.rows[0].id, "coverage");
  assert.equal(sqgFailed.body.rows[0].formula, "FAIL: 62.4 < 80");

  const sqgLong = buildQualityGateLayout(parseKitQualityGateData(loadFixture("sqg-long")));
  assert.equal(sqgLong.body.rows.length, 5);
  assert.ok(sqgLong.body.rows.every((row) => row.formula?.startsWith("FAIL:")));
});

test("layout metrics and tokens match DS canon exports", async () => {
  const { QUALITY_GATE_LAYOUT_METRICS, QUALITY_GATE_LAYOUT_TOKENS } = await import(
    "../dist/quality-gate/layout/index.js"
  );

  assert.equal(QUALITY_GATE_LAYOUT_METRICS.barHeight, 28);
  assert.equal(QUALITY_GATE_LAYOUT_METRICS.barInset, 9);
  assert.equal(QUALITY_GATE_LAYOUT_TOKENS.success, "--color-success");
  assert.equal(QUALITY_GATE_LAYOUT_TOKENS.barBackground.with, "transparent");
});
