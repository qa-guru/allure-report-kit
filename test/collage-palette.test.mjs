import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { declareSuite } from "./test-meta.mjs";

declareSuite({
  feature: "collage",
  story: "Collage palette and testing-pyramid geometry",
  layer: "unit",
  severity: "normal",
});

const {
  CORNER_RATIO,
  LAYER_ORDER,
  PYRAMID_COLORS_DARK,
  PYRAMID_COLORS_LIGHT,
  STATUS_COLORS,
  STATUS_MAPPING,
  TIER_GAP_RATIO,
  colorForLayer,
  isKnownLayer,
  tierCornerRadius,
  tierGapPx,
} = await import("../dist/collage.js");

const __dirname = dirname(fileURLToPath(import.meta.url));

function findSsotPath() {
  let dir = __dirname;
  for (let i = 0; i < 12; i++) {
    const candidate = join(
      dir,
      "stacks/java-spring/tests/allure/pyramid-layers.json",
    );
    if (existsSync(candidate)) {
      return candidate;
    }
    dir = join(dir, "..");
  }
  return null;
}

function loadSsot() {
  const path = findSsotPath();
  if (!path) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

test("testing-pyramid geometry locks CORNER_RATIO / TIER_GAP_RATIO", () => {
  assert.equal(CORNER_RATIO, 0.18);
  assert.equal(TIER_GAP_RATIO, 0.11);
});

test("tierGapPx / tierCornerRadius mirror Java clamps", () => {
  assert.equal(tierGapPx(100), 11);
  assert.equal(tierGapPx(1), 2);
  assert.equal(tierCornerRadius(200, 100), 18);
  assert.equal(tierCornerRadius(20, 100), 10);
});

test("collage palette matches stacks/java-spring/tests/allure/pyramid-layers.json", (t) => {
  const ssot = loadSsot();
  if (!ssot) {
    t.skip("SSOT only in zero-design-system checkout (standalone CI skips)");
    return;
  }

  assert.deepEqual([...LAYER_ORDER], ssot.order);
  assert.deepEqual({ ...STATUS_COLORS }, ssot.status);
  assert.deepEqual({ ...STATUS_MAPPING }, ssot.statusMapping);

  for (const [layer, themed] of Object.entries(ssot.layers)) {
    assert.equal(
      PYRAMID_COLORS_LIGHT[layer],
      themed.light,
      `light ${layer}`,
    );
    assert.equal(
      PYRAMID_COLORS_DARK[layer],
      themed.dark,
      `dark ${layer}`,
    );
  }
});

test("unit equals collage passed #94ca66 in both themes", () => {
  assert.equal(STATUS_COLORS.passed, "#94ca66");
  assert.equal(PYRAMID_COLORS_LIGHT.unit, STATUS_COLORS.passed);
  assert.equal(PYRAMID_COLORS_DARK.unit, STATUS_COLORS.passed);
  assert.equal(colorForLayer("unit", "light"), "#94ca66");
  assert.equal(colorForLayer("unit", "dark"), "#94ca66");
});

test("isKnownLayer covers ORDER only", () => {
  assert.equal(isKnownLayer("unit"), true);
  assert.equal(isKnownLayer("OTHER"), false);
  assert.equal(isKnownLayer("other"), false);
});

test("colorForLayer returns null for unknown keys", () => {
  assert.equal(colorForLayer("not-a-layer"), null);
  assert.equal(colorForLayer("  "), null);
});
