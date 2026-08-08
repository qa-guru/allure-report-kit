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
  const highcharts = FIXTURE["pie:highcharts"];
  assert.equal(highcharts.markCount, 5, "pie:highcharts: slice count");
  assert.deepEqual(highcharts.dots, ["red", "yellow", "gray", "green"], "pie:highcharts: families");
  assert.deepEqual(highcharts.texts, ["88.24%", "из 34"], "pie:highcharts: centre copy");

  const amcharts = FIXTURE["pie:amcharts"];
  assert.equal(amcharts.renderedBy, "amcharts-stub", "pie:amcharts: stub until the lib is wired");
  assert.ok(amcharts.bodyChildren > 0, "pie:amcharts: stub host mounted");
});

test("bar backend paints the non-zero histogram", () => {
  const tile = FIXTURE["bar:highcharts"];
  assert.ok(tile.markCount >= 1, "bar:highcharts: bar marks");
  assert.deepEqual(tile.dots, ["red", "orange", "yellow", "purple", "green", "blue"], "bar:highcharts: families");
});

test("gauge svg keeps the reading and two arcs", () => {
  assert.equal(FIXTURE["gauge:svg"].svgPaths, 2);
  assert.ok(FIXTURE["gauge:svg"].texts.includes("30"));
});

test("fixture matches itself — diff helper is wired", () => {
  assert.deepEqual(diffBaseline(FIXTURE, FIXTURE), []);
});
