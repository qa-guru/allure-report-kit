import assert from "node:assert/strict";
import { test } from "node:test";

import { declareSuite } from "./test-meta.mjs";

declareSuite({
  feature: "config",
  story: "Kit config API",
  layer: "unit",
  severity: "normal",
});

process.env.ALLURE_REPORT_KIT_SILENT = "1";

const { charts, panels, presets, renderers, theme, withKit, isLockedQuad, themeToCss } =
  await import("../dist/index.js");
const { resolveDots } = await import("../dist/runtime/indicators.js");
const { familyForColor, orderFamilies } = await import("../dist/runtime/palette.js");

function awesomeManifest(config) {
  return config.plugins.awesome.options.kit;
}

test("lockedQuad reproduces the ADR 006 order", () => {
  const quad = presets.lockedQuad();

  assert.deepEqual(
    quad.map((tile) => tile.type),
    ["currentStatus", "durationDynamics", "testingPyramid", "durations"],
  );
  assert.equal(quad[3].groupBy, "layer");
  assert.deepEqual(quad[2].layers, [
    "unit",
    "component",
    "integration",
    "api",
    "e2e",
    "manual",
  ]);
  assert.ok(!quad[2].layers.includes("visual"));
  assert.ok(isLockedQuad(quad));
});

test("withKit resolves the page default renderer per tile", () => {
  const config = withKit({
    name: "T",
    renderer: renderers.echarts(),
    plugins: {
      awesome: {
        options: { charts: presets.lockedQuad({ renderers: { durations: "highcharts" } }) },
      },
    },
  });

  assert.deepEqual(
    awesomeManifest(config).tiles.map((tile) => tile.renderer.id),
    ["echarts", "echarts", "svg", "highcharts"],
  );
});

test("a tile renderer override wins over the page default", () => {
  const config = withKit({
    name: "T",
    renderer: renderers.highcharts(),
    plugins: {
      awesome: {
        options: { charts: [charts.currentStatus({ renderer: "amcharts" })] },
      },
    },
  });

  assert.equal(awesomeManifest(config).tiles[0].renderer.id, "amcharts");
});

test("custom panels without the soft-fork raise a warning", () => {
  const config = withKit({
    name: "T",
    plugins: {
      awesome: {
        options: {
          charts: [
            ...presets.lockedQuad(),
            panels.custom({ id: "services", title: "Сервисы", renderer: "highcharts" }),
          ],
        },
      },
    },
  });

  const codes = awesomeManifest(config).diagnostics.map((d) => d.code);
  assert.ok(codes.includes("panels-need-soft-fork"));
  assert.equal(config.plugins.awesome.import, undefined);
});

test("softFork rewrites the plugin import but keeps an explicit one", () => {
  const withRewrite = withKit({
    name: "T",
    softFork: true,
    plugins: { awesome: { options: { charts: presets.lockedQuad() } } },
  });
  assert.equal(withRewrite.plugins.awesome.import, "@qa-guru/allure-report-kit-awesome");

  const withExplicit = withKit({
    name: "T",
    softFork: true,
    plugins: {
      awesome: { import: "./my-plugin.js", options: { charts: presets.lockedQuad() } },
    },
  });
  assert.equal(withExplicit.plugins.awesome.import, "./my-plugin.js");
});

test("breaking the locked quad is reported", () => {
  const config = withKit({
    name: "T",
    plugins: {
      awesome: {
        options: { charts: [charts.durationDynamics(), charts.currentStatus()] },
      },
    },
  });

  assert.ok(awesomeManifest(config).diagnostics.some((d) => d.code === "locked-quad"));
});

test("dots default to fromSeries and can be switched off", () => {
  const config = withKit({
    name: "T",
    plugins: {
      awesome: {
        options: {
          charts: [
            charts.currentStatus(),
            charts.durations({ groupBy: "layer", dots: false }),
            charts.testingPyramid({ dots: ["red", "green"] }),
          ],
        },
      },
    },
  });

  assert.deepEqual(
    awesomeManifest(config).tiles.map((tile) => tile.dots),
    ["fromSeries", false, ["red", "green"]],
  );
});

test("resolveDots keeps the canonical family order and honours false", () => {
  assert.deepEqual(resolveDots("fromSeries", ["green", "red", "orange"]), [
    "red",
    "orange",
    "green",
  ]);
  assert.deepEqual(resolveDots(["blue", "red"], ["green"]), ["red", "blue"]);
  assert.deepEqual(resolveDots(false, ["red", "green"]), []);
  assert.deepEqual(resolveDots("fromSeries", []), []);
});

test("colours map to the nearest status family", () => {
  assert.equal(familyForColor("#49cb68"), "green");
  assert.equal(familyForColor("#fd5a3e"), "red");
  assert.equal(familyForColor("#ff8200"), "orange");
  assert.equal(familyForColor("rgb(180, 111, 216)"), "purple");
  assert.equal(familyForColor("not-a-colour"), undefined);
  assert.deepEqual(orderFamilies(["blue", "red", "red"]), ["red", "blue"]);
});

test("theme serialises tokens per colour scheme", () => {
  const css = themeToCss(theme.qaGuru());

  assert.match(css, /--ark-status-failed: #fd5a3e;/);
  // Bare attribute selector — Allure may carry `data-theme` off the root.
  assert.match(css, /\[data-theme="dark"\] \{[\s\S]*--ark-layer-e2e: #ff574f;/);
  assert.doesNotMatch(css, /html\[data-theme/);
  assert.match(css, /--indicator-mix: 100%;/);
});

test("the theme owns the chart palette, not the host chrome", () => {
  const css = themeToCss(theme.qaGuru());

  // Surfaces and text come from the report via kit.css fallbacks; a theme that
  // emitted them would repaint Allure's own light/dark.
  for (const token of ["--ark-surface", "--ark-text", "--ark-border"]) {
    assert.doesNotMatch(css, new RegExp(`${token}\\s*:`));
  }
  assert.match(css, /--ark-band-ink:/);
});

test("theme.header is the DS primitive and stays under theme", () => {
  const configured = theme.qaGuru({ header: theme.header({ productName: "Reference App" }) });

  assert.equal(configured.header.enabled, true);
  assert.equal(configured.header.source, "design-system");
  assert.equal(configured.header.productName, "Reference App");
  assert.equal(configured.chrome, undefined);
});
