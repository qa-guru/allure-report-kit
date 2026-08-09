/**
 * Shared KitQualityGateData contract + published fixtures.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { declareSuite } from "./test-meta.mjs";

declareSuite({
  feature: "quality-gate-contract",
  story: "shared KitQualityGateData fixtures",
  layer: "unit",
  severity: "normal",
});

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_DIR = join(ROOT, "fixtures/quality-gate");

const FIXTURE_IDS = ["aqg-passed", "aqg-failed", "sqg-passed", "sqg-failed", "sqg-long"];

function loadFixture(id) {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, `${id}.json`), "utf8"));
}

test("QUALITY_GATE_FIXTURE_IDS matches published JSON files", async () => {
  const { QUALITY_GATE_FIXTURE_IDS } = await import("../dist/quality-gate/parse.js");
  assert.deepEqual([...QUALITY_GATE_FIXTURE_IDS], FIXTURE_IDS);
});

test("each fixture parses as KitQualityGateData", async () => {
  const { parseKitQualityGateData, isKitQualityGateData } = await import("../dist/quality-gate/parse.js");

  for (const id of FIXTURE_IDS) {
    const raw = loadFixture(id);
    assert.equal(isKitQualityGateData(raw), true, id);
    const data = parseKitQualityGateData(raw);
    assert.equal(data.passed, raw.passed, id);
    assert.ok(data.rules.length >= 1, id);
    assert.equal(data.rules.every((rule) => typeof rule.id === "string"), true, id);
  }
});

test("fixture kind / verdict matrix", async () => {
  const { parseKitQualityGateData } = await import("../dist/quality-gate/parse.js");

  const cases = [
    ["aqg-passed", "allure", true],
    ["aqg-failed", "allure", false],
    ["sqg-passed", "sonar", true],
    ["sqg-failed", "sonar", false],
    ["sqg-long", "sonar", false],
  ];

  for (const [id, kind, passed] of cases) {
    const data = parseKitQualityGateData(loadFixture(id));
    assert.equal(data.kind, kind, id);
    assert.equal(data.passed, passed, id);
  }

  assert.equal(parseKitQualityGateData(loadFixture("sqg-long")).rules.length, 10);
});

test("fixtures feed toPanelModel / renderQualityGateHost without remapping", async () => {
  const { parseKitQualityGateData } = await import("../dist/quality-gate/parse.js");
  const { toPanelModel } = await import("../dist/allure/model.js");
  const { formatQualityGateRuleFormula, resolveQualityGateRuleExpected } = await import(
    "../dist/runtime/quality-gate-render.js"
  );
  const { panels } = await import("../dist/index.js");

  for (const id of FIXTURE_IDS) {
    const data = parseKitQualityGateData(loadFixture(id));
    const panel = panels.custom({
      id,
      kind: "qualityGate",
      title: data.barTitle ?? data.title ?? id,
      data,
    });
    const model = toPanelModel(panel);
    assert.equal(model.kind, "qualityGate", id);
    assert.ok(model.qualityGate, id);
    assert.equal(model.qualityGate.passed, data.passed, id);
    assert.equal(model.qualityGate.rules.length, data.rules.length, id);
    // Same object fields the DOM path reads — no Sonar/AQG remapping layer.
    assert.equal(model.qualityGate.kind, data.kind, id);
    assert.deepEqual(model.qualityGate.rules, data.rules, id);

    for (const rule of data.rules) {
      if (!rule.passed) {
        const expected = resolveQualityGateRuleExpected(rule);
        if (expected !== undefined && rule.actual !== undefined) {
          assert.equal(typeof formatQualityGateRuleFormula(rule), "string", `${id}:${rule.id}`);
        }
      }
    }
  }
});

test("parseKitQualityGateData rejects empty / invalid payloads", async () => {
  const { parseKitQualityGateData, isKitQualityGateData } = await import("../dist/quality-gate/parse.js");

  assert.equal(isKitQualityGateData(null), false);
  assert.equal(isKitQualityGateData({ passed: true, rules: [] }), false);
  assert.equal(
    isKitQualityGateData({
      passed: true,
      rules: [{ id: "x", message: "m" }],
    }),
    false,
  );
  assert.throws(() => parseKitQualityGateData({ passed: true, rules: [] }), /KitQualityGateData/);
});

test("sonarProjectStatusToQualityGateOptions output matches contract", async () => {
  const { parseKitQualityGateData } = await import("../dist/quality-gate/parse.js");
  const { sonarProjectStatusToQualityGateOptions } = await import("../dist/runtime/sonar-quality-gate.js");

  const mapped = sonarProjectStatusToQualityGateOptions({
    status: "OK",
    project_key: "demo",
    conditions: [
      {
        status: "OK",
        metricKey: "coverage",
        comparator: "LT",
        errorThreshold: 80,
        actualValue: 90,
      },
    ],
  });
  const data = parseKitQualityGateData(mapped);
  assert.equal(data.kind, "sonar");
  assert.equal(data.passed, true);
  assert.equal(data.rules[0].id, "coverage");
});
