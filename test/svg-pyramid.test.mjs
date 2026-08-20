/**
 * Testing pyramid SVG: band width follows test count, not stack index.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { Window } from "happy-dom";

import { declareSuite } from "./test-meta.mjs";

declareSuite({
  feature: "models",
  story: "Testing pyramid width follows test count",
  layer: "unit",
  severity: "normal",
});

const { pyramidValueFraction, svgRenderer } = await import("../dist/runtime/index.js");

/** Counts from autotests-ai-multistack-app CI #248 — ice-cream cone, not Cohn. */
const CI_248 = [
  { id: "unit", label: "unit", value: 61 },
  { id: "component", label: "component", value: 78 },
  { id: "integration", label: "integration", value: 3 },
  { id: "api", label: "api", value: 46 },
  { id: "e2e", label: "e2e", value: 50 },
];

test("pyramidValueFraction scales to the peak count", () => {
  const peak = 78;

  assert.equal(pyramidValueFraction(78, peak), 1);
  assert.equal(pyramidValueFraction(0, peak), 0);
  assert.equal(pyramidValueFraction(undefined, peak), 0);
  assert.equal(pyramidValueFraction(12, 0), 0);
  assert.ok(pyramidValueFraction(50, peak) > pyramidValueFraction(46, peak));
  assert.ok(pyramidValueFraction(3, peak) < pyramidValueFraction(46, peak));
  assert.ok(pyramidValueFraction(61, peak) < pyramidValueFraction(78, peak));
  assert.ok(pyramidValueFraction(61, peak) > pyramidValueFraction(50, peak));
  assert.equal(pyramidValueFraction(3, peak), 3 / 78);
});

test("svg pyramid rects are proportional to counts, not layer index", async () => {
  const window = new Window();
  const globals = globalThis;
  const previous = {
    window: globals.window,
    document: globals.document,
    HTMLElement: globals.HTMLElement,
    Node: globals.Node,
  };

  globals.window = window;
  globals.document = window.document;
  globals.HTMLElement = window.HTMLElement;
  globals.Node = window.Node;

  try {
    const host = window.document.createElement("div");
    window.document.body.append(host);

    await svgRenderer.render({
      host,
      model: {
        kind: "pyramid",
        type: "testingPyramid",
        title: "Testing pyramid",
        series: CI_248,
      },
      tile: {
        key: "testingPyramid",
        list: "charts",
        type: "testingPyramid",
        renderer: { id: "svg" },
        dots: "fromSeries",
        layout: "1x1",
        tier: "regular",
      },
      theme: {},
      options: {},
      resolveLib: async () => undefined,
      cssVar: (_name, fallback = "") => fallback,
      isDark: () => false,
    });

    const rects = [...host.querySelectorAll("rect")];
    assert.equal(rects.length, CI_248.length);

    const widths = rects.map((rect) => Number(rect.getAttribute("width")));
    // Painted top → bottom after reverse(): e2e, api, integration, component, unit
    const [e2e, api, integration, component, unit] = widths;

    assert.ok(component > unit, "component (78) wider than unit (61)");
    assert.ok(unit > e2e, "unit (61) wider than e2e (50)");
    assert.ok(e2e > api, "e2e (50) wider than api (46)");
    assert.ok(api > integration, "api (46) wider than integration (3)");
    const funnel = 240 - 10 * 2;
    assert.equal(component.toFixed(1), funnel.toFixed(1));
    assert.equal(integration.toFixed(1), (funnel * (3 / 78)).toFixed(1));
  } finally {
    globals.window = previous.window;
    globals.document = previous.document;
    globals.HTMLElement = previous.HTMLElement;
    globals.Node = previous.Node;
    window.close();
  }
});
