/**
 * Structural baseline for the dogfood compare grid.
 *
 * The fixture is a snapshot of mark counts, indicator families and gauge copy —
 * not pixels. Refresh with `npm run baseline -- --update` after an intentional
 * renderer change.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { COMPARE_KEYS, diffBaseline } from "../scripts/baseline.mjs";
import { declareSuite } from "./test-meta.mjs";

declareSuite({
  feature: "dogfood",
  story: "Compare grid baseline",
  layer: "unit",
  severity: "normal",
});

const FIXTURE = JSON.parse(
  readFileSync(new URL("./fixtures/dogfood-baseline.json", import.meta.url), "utf8"),
);

test("fixture covers every compare pair", () => {
  assert.deepEqual(Object.keys(FIXTURE).sort(), [...COMPARE_KEYS].sort());
});

test("compare backends report the renderer that actually drew", () => {
  for (const key of COMPARE_KEYS) {
    const tile = FIXTURE[key];
    assert.ok(tile.renderedBy, `${key}: renderedBy missing`);
    assert.notEqual(tile.renderedBy, "none", `${key}: renderer failed to mount`);
    assert.ok(tile.bodyChildren > 0, `${key}: empty body`);
  }
});

test("pie backends keep four status families and the centre copy", () => {
  for (const key of ["pie:echarts", "pie:highcharts"]) {
    const tile = FIXTURE[key];
    assert.equal(tile.markCount, FIXTURE["pie:echarts"].markCount, `${key}: slice count drift`);
    assert.deepEqual(tile.dots, ["red", "yellow", "gray", "green"], `${key}: families`);
    assert.deepEqual(tile.texts, ["88.24%", "из 34"], `${key}: centre copy`);
  }
});

test("bar backends paint the non-zero histogram", () => {
  for (const key of ["bar:echarts", "bar:highcharts"]) {
    const tile = FIXTURE[key];
    assert.ok(tile.markCount >= FIXTURE["bar:echarts"].markCount, `${key}: bar marks`);
    assert.deepEqual(tile.dots, ["red", "orange", "yellow", "purple", "green", "blue"], `${key}: families`);
  }
});

test("gauge backends keep the reading and two arcs", () => {
  assert.equal(FIXTURE["gauge:svg"].svgPaths, 2);
  assert.ok(FIXTURE["gauge:svg"].texts.includes("30"));
  assert.ok(FIXTURE["gauge:echarts"].markCount >= 1);
  assert.ok(FIXTURE["gauge:echarts"].texts.some((text) => text.includes("30")));
});

test("fixture matches itself — diff helper is wired", () => {
  assert.deepEqual(diffBaseline(FIXTURE, FIXTURE), []);
});
