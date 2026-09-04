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

const {
  charts,
  panels,
  presets,
  renderers,
  theme,
  withKit,
  matchesOverview,
  matchesLeadLayout,
  leadOffset,
  themeToCss,
  DEFAULT_OVERVIEW_PRESET,
} = await import("../dist/index.js");
const { resolveDots } = await import("../dist/runtime/indicators.js");
const { familyForColor, orderFamilies } = await import("../dist/runtime/palette.js");

function awesomeManifest(config) {
  return config.plugins.awesome.options.kit;
}

test("fromOverviewCharts matches overview chart quad only", () => {
  const tiles = presets.fromOverviewCharts();

  assert.deepEqual(
    tiles.map((tile) => tile.type),
    ["currentStatus", "durationDynamics", "testingPyramid", "durations"],
  );
  assert.equal(tiles[3].groupBy, "layer");
  assert.deepEqual(tiles[2].layers, [
    "unit",
    "component",
    "integration",
    "api",
    "ui",
    "e2e",
    "manual",
  ]);
  assert.ok(!tiles[2].layers.includes("visual"));
  assert.ok(matchesOverview(tiles));
  assert.equal(matchesOverview([]), false);
  const swapped = presets.fromOverviewCharts();
  swapped[0] = { ...swapped[0], type: "durations" };
  assert.equal(matchesOverview(swapped), false);
  const regrouped = presets.fromOverviewCharts();
  regrouped[3] = { ...regrouped[3], groupBy: "status" };
  assert.equal(matchesOverview(regrouped), false);
  assert.throws(
    () =>
      presets.fromOverviewCharts({
        preset: { ...DEFAULT_OVERVIEW_PRESET, tiles: [{ chart: "notAChart" }] },
      }),
    /Unknown overview chart/,
  );
});

test("fromLead and fromOverview default include quality gates before charts", () => {
  const lead = presets.fromLead();
  assert.deepEqual(
    lead.map((tile) => (tile.type === "custom" ? tile.id : tile.type)),
    [
      "allureQualityGate",
      "sonarQualityGate",
      "currentStatus",
      "durationDynamics",
      "testingPyramid",
      "durations",
    ],
  );
  assert.ok(matchesLeadLayout(lead));
  assert.ok(matchesLeadLayout(presets.fromOverview()));
  assert.ok(!matchesLeadLayout(presets.fromOverviewCharts()));
  assert.ok(!matchesLeadLayout(presets.fromOverview({ includeQualityGates: false })));
});

test("withKit resolves the page default renderer per tile", () => {
  const config = withKit({
    name: "T",
    renderer: renderers.stock(),
    softFork: true,
    plugins: {
      awesome: {
        options: {
          charts: [
            ...presets.fromOverview({ renderers: { durations: "highcharts" } }),
          ],
        },
      },
    },
  });

  assert.deepEqual(
    awesomeManifest(config).tiles.map((tile) => tile.renderer.id),
    ["dom", "dom", "stock", "stock", "svg", "highcharts"],
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
            ...presets.fromOverview(),
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
    plugins: { awesome: { options: { charts: presets.fromOverview() } } },
  });
  assert.equal(withRewrite.plugins.awesome.import, "@qa-guru/allure-report-kit-awesome");

  const withExplicit = withKit({
    name: "T",
    softFork: true,
    plugins: {
      awesome: { import: "./my-plugin.js", options: { charts: presets.fromOverview() } },
    },
  });
  assert.equal(withExplicit.plugins.awesome.import, "./my-plugin.js");
});

test("ethalon-like title and pyramid overrides do not false-warn overview-preset", () => {
  const layers = ["unit", "e2e"];
  const config = withKit({
    name: "T",
    softFork: true,
    plugins: {
      awesome: {
        options: {
          charts: presets.fromLead({
            preset: {
              ...DEFAULT_OVERVIEW_PRESET,
              titles: {
                currentStatus: "Текущий статус по сервисам",
                durationDynamics: "Динамика длительности",
                testingPyramid: "Пирамида тестирования",
                durations: "Длительности по layer",
              },
              pyramidLayers: layers,
            },
            layers,
          }),
        },
      },
    },
  });

  const codes = awesomeManifest(config).diagnostics.map((d) => d.code);
  assert.ok(!codes.includes("overview-preset"));
});

test("breaking the lead layout is reported", () => {
  const config = withKit({
    name: "T",
    plugins: {
      awesome: {
        options: { charts: [charts.durationDynamics(), charts.currentStatus()] },
      },
    },
  });

  assert.ok(awesomeManifest(config).diagnostics.some((d) => d.code === "overview-preset"));
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
  assert.match(css, /\[data-theme="dark"\] \{[\s\S]*--ark-layer-ui: #f472b6;/);
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

test("the host report's own chart swatches follow the canon", () => {
  const css = themeToCss(theme.qaGuru());

  // Upstream hands nivo the string `var(--color-status-<s>-chart[-fill])`, so
  // redefining the property is what puts a stock tile and a kit tile on one
  // green. Both halves of the pair, or the mixed page still shows two.
  assert.match(css, /--color-status-passed-chart: var\(--ark-status-passed\);/);
  assert.match(css, /--color-status-passed-chart-fill: var\(--ark-status-passed\);/);
  assert.match(css, /--color-status-unknown-chart: var\(--ark-status-unknown\);/);

  const off = themeToCss(theme.qaGuru({ hostPalette: false }));
  assert.doesNotMatch(off, /--color-status-/);
  // The kit's own palette is untouched by the opt-out.
  assert.match(off, /--ark-status-failed: #fd5a3e;/);
});

test("theme.header is the DS primitive and stays under theme", () => {
  const configured = theme.qaGuru({ header: theme.header({ productName: "Multistack" }) });

  assert.equal(configured.header.enabled, true);
  assert.equal(configured.header.source, "design-system");
  assert.equal(configured.header.productName, "Multistack");
  assert.equal(configured.chrome, undefined);
});

test("panel factories set kind, canon renderer and caption fields", () => {
  const data = panels.series([{ id: "passed", label: "passed", value: 3, family: "green" }]);

  assert.equal(panels.donut({ id: "d", data, total: 10, unit: "из" }).kind, "donut");
  assert.equal(panels.donut({ id: "d", data, total: 10 }).data.total, 10);
  assert.equal(panels.bar({ id: "b", data }).kind, "bar");
  assert.equal(panels.line({ id: "l", data }).kind, "line");
  assert.equal(panels.pyramid({ id: "p" }).renderer, "svg");
  assert.equal(panels.gauge({ id: "g", total: 100, unit: "%" }).renderer, "svg");
  assert.equal(panels.gauge({ id: "g", total: 100 }).data.total, 100);
  assert.equal(panels.table({ id: "t", columns: ["name", "count"] }).renderer, "dom");
  assert.deepEqual(panels.table({ id: "t", columns: ["name"] }).data.columns, ["name"]);
  const gate = panels.qualityGate({ id: "qualityGate", title: "Quality gate" });
  assert.equal(gate.kind, "qualityGate");
  assert.equal(gate.renderer, "dom");
  assert.equal(gate.dots, false);
  assert.deepEqual(gate.source, { from: "qualityGate" });
  const testsTable = panels.testsTable({ id: "testsTable", title: "Tests", columns: ["name", "status"] });
  assert.equal(testsTable.kind, "testsTable");
  assert.equal(testsTable.renderer, "dom");
  assert.equal(testsTable.dots, false);
  assert.deepEqual(testsTable.data.columns, ["name", "status"]);
  // Donut/bar/line use the Highcharts canon — stock Allure skips custom panels.
  assert.equal(panels.donut({ id: "d" }).renderer, "highcharts");
  assert.equal(panels.bar({ id: "b" }).renderer, "highcharts");
  assert.equal(panels.line({ id: "l" }).renderer, "highcharts");
});

test("custom panels on a stock page stay kit-owned with a non-stock renderer", () => {
  const config = withKit({
    name: "T",
    renderer: renderers.stock(),
    softFork: true,
    plugins: {
      awesome: {
        options: {
          charts: [
            panels.donut({ id: "d", data: panels.series([{ id: "a", label: "a", value: 1 }]) }),
            panels.bar({ id: "b", data: panels.series([{ id: "a", label: "a", value: 1 }]) }),
            panels.fromRun({ id: "run-bar", groupBy: "status", kind: "bar" }),
            panels.fromHistory({ id: "hist-line", metric: "passRate" }),
          ],
        },
      },
    },
  });

  const tiles = awesomeManifest(config).tiles;
  assert.equal(tiles.length, 4);
  for (const tile of tiles) {
    assert.ok(tile.panel, "expected a custom panel tile");
    assert.notEqual(tile.renderer.id, "stock");
    assert.notEqual(tile.renderer.id, "nivo");
  }
});
test("fromRun and fromHistory carry source folds without inlining series", () => {
  const run = panels.fromRun({
    id: "by-owner",
    groupBy: "owner",
    metric: "passRate",
    limit: 5,
    columns: ["owner", "rate"],
    total: 40,
    unit: "%",
  });
  assert.deepEqual(run.source, { from: "run", groupBy: "owner", metric: "passRate", limit: 5 });
  assert.equal(run.data.total, 40);
  assert.deepEqual(run.data.series, []);

  const bare = panels.fromRun({ id: "by-status", groupBy: "status" });
  assert.deepEqual(bare.source, { from: "run", groupBy: "status", metric: "count" });
  assert.equal(bare.data, undefined);

  const history = panels.fromHistory({
    id: "trend",
    metric: "flakyRate",
    limit: 8,
    splitBy: "status",
    unit: "%",
    columns: ["run", "rate"],
  });
  assert.equal(history.kind, "line");
  assert.deepEqual(history.source, {
    from: "history",
    metric: "flakyRate",
    limit: 8,
    splitBy: "status",
  });
  assert.equal(history.data.unit, "%");

  const defaults = panels.fromHistory({ id: "pass", kind: "bar" });
  assert.equal(defaults.kind, "bar");
  assert.deepEqual(defaults.source, { from: "history", metric: "passRate" });
});

test("each chart factory names its upstream type and keeps options", () => {
  assert.equal(charts.statusDynamics({ limit: 4 }).type, "statusDynamics");
  assert.equal(charts.statusTransitions({ limit: 3 }).limit, 3);
  assert.equal(charts.stabilityDistribution({ threshold: 80 }).threshold, 80);
  assert.equal(charts.testBaseGrowthDynamics({ statuses: ["passed"] }).type, "testBaseGrowthDynamics");
  assert.equal(charts.statusAgePyramid({ limit: 6 }).type, "statusAgePyramid");
  assert.deepEqual(charts.testResultSeverities({ levels: ["blocker"] }).levels, ["blocker"]);
  assert.equal(charts.coverageDiff({ title: "Δ" }).title, "Δ");
  assert.equal(charts.successRateDistribution().type, "successRateDistribution");
  assert.equal(charts.problemsDistribution().by, "environment");
  // Pyramid still defaults to the SVG canon even when options are set.
  assert.equal(charts.testingPyramid({ layers: ["unit", "e2e"] }).renderer, "svg");
});

test("renderer factories stay inert specs; options travel through", () => {
  assert.deepEqual(renderers.stock({ animate: false }), { id: "stock", options: { animate: false } });
  assert.equal(renderers.nivo().id, "nivo");
  assert.equal(renderers.amcharts().id, "amcharts");
  assert.equal(renderers.svg().id, "svg");
  assert.equal(renderers.dom().id, "dom");
  assert.deepEqual(renderers.normalizeRenderer("highcharts", renderers.stock()), { id: "highcharts" });
  assert.deepEqual(renderers.normalizeRenderer(undefined, renderers.stock()), { id: "stock" });
});

test("tokensOnly drops tile chrome and header; empty token blocks stay silent", () => {
  const tokens = theme.tokensOnly();
  assert.equal(tokens.id, "tokens-only");
  assert.equal(tokens.tile.bar, false);
  assert.equal(tokens.header.enabled, false);

  const css = themeToCss(tokens);
  assert.doesNotMatch(css, /--indicator-mix/);
  // Empty override maps must not invent a selector with an empty body.
  const bare = themeToCss({
    id: "bare",
    mode: "auto",
    tokens: {},
    tokensLight: {},
    tokensDark: {},
    hostPalette: false,
  });
  assert.equal(bare, "");
});

test("withKit records unknown renderers, layout and tier on the tile", () => {
  const config = withKit({
    name: "T",
    plugins: {
      awesome: {
        options: {
          charts: [
            charts.currentStatus({
              renderer: "chart.js",
              layout: "2x1",
              tier: "compact",
            }),
          ],
        },
      },
    },
  });
  const tile = awesomeManifest(config).tiles[0];
  assert.equal(tile.renderer.id, "chart.js");
  assert.equal(tile.layout, "2x1");
  assert.equal(tile.tier, "compact");
  assert.ok(awesomeManifest(config).diagnostics.some((d) => d.code === "renderer-unknown"));
});

test("an empty charts list skips the overview-preset check", () => {
  const config = withKit({
    name: "T",
    plugins: { awesome: { options: { charts: [] } } },
  });
  // No tiles → no kit manifest attachment; the overview-preset warn must stay quiet.
  assert.equal(config.plugins.awesome.options.kit, undefined);
});

test("diagnostics print when silence is off", () => {
  const previous = process.env.ALLURE_REPORT_KIT_SILENT;
  delete process.env.ALLURE_REPORT_KIT_SILENT;
  const warnings = [];
  const infos = [];
  const warn = console.warn;
  const info = console.info;
  console.warn = (line) => warnings.push(line);
  console.info = (line) => infos.push(line);
  try {
    withKit({
      name: "T",
      plugins: {
        awesome: {
          options: {
            singleFile: true,
            charts: [charts.durationDynamics()],
          },
        },
      },
    });
  } finally {
    console.warn = warn;
    console.info = info;
    if (previous === undefined) {
      delete process.env.ALLURE_REPORT_KIT_SILENT;
    } else {
      process.env.ALLURE_REPORT_KIT_SILENT = previous;
    }
  }
  assert.ok(warnings.some((line) => String(line).includes("[overview-preset]")));
  assert.ok(infos.some((line) => String(line).includes("[single-file]")));
});

test("formatQualityGateRuleFormula accepts legacy threshold field", async () => {
  const { formatQualityGateRuleFormula } = await import("../dist/runtime/quality-gate-render.js");
  assert.equal(
    formatQualityGateRuleFormula({
      id: "maxFailures",
      passed: false,
      message: "",
      actual: 3,
      threshold: 0,
    }),
    "FAIL: 3 > 0",
  );
});

test("collectQgInfoDeviationLiterals marks Allure and Sonar failed actuals", async () => {
  const { collectQgInfoDeviationLiterals } = await import("../dist/runtime/qg-info.js");
  const { buildSonarQualityGateInfoPayload } = await import("../dist/runtime/sonar-quality-gate.js");

  const allure = collectQgInfoDeviationLiterals({
    qualityGate: { rules: [{ maxFailures: 0 }] },
    result: {
      passed: false,
      rules: [{ id: "maxFailures", passed: false, actual: 3, expected: 0 }],
    },
  });
  assert.deepEqual([...allure], ["3"]);

  const sonar = collectQgInfoDeviationLiterals(
    buildSonarQualityGateInfoPayload({
      status: "ERROR",
      conditions: [
        { status: "ERROR", metricKey: "coverage", actualValue: 72.4 },
        { status: "OK", metricKey: "bugs", actualValue: 0 },
      ],
    }),
  );
  assert.deepEqual([...sonar], ["72.4"]);
});

test("an unknown panel kind does not invent a renderer", () => {
  const panel = panels.custom({ id: "mystery", kind: "not-a-kind" });
  assert.equal(panel.kind, "not-a-kind");
  assert.equal(panel.renderer, undefined);
});

test("matchesOverview rejects a pyramid that still lists visual", () => {
  const layers = [...DEFAULT_OVERVIEW_PRESET.pyramidLayers, "visual"];
  const preset = { ...DEFAULT_OVERVIEW_PRESET, pyramidLayers: layers };
  const tiles = presets.fromOverviewCharts({ layers, preset });
  assert.equal(matchesOverview(tiles, preset), false);
});

test("leadOffset follows qualityGates length", () => {
  assert.equal(leadOffset(), 2);
  assert.equal(leadOffset({ ...DEFAULT_OVERVIEW_PRESET, qualityGates: undefined }), 0);
});

test("matchesLeadLayout rejects a lead that swapped the gate id", () => {
  const lead = presets.fromLead();
  lead[0] = { type: "custom", id: "not-allure-quality-gate" };
  assert.equal(matchesLeadLayout(lead), false);
});

test("withKit copies qualityGate rules and knownIssuesPath onto the manifest", () => {
  const config = withKit({
    name: "T",
    qualityGate: {
      rules: [{ maxFailures: 0 }],
      source: { configFile: "quality-gate.json" },
    },
    knownIssuesPath: "known-issues.json",
    plugins: {
      awesome: {
        options: { charts: [charts.currentStatus()] },
      },
    },
  });
  const kit = awesomeManifest(config);
  assert.deepEqual(kit.qualityGate.rules, [{ maxFailures: 0 }]);
  assert.equal(kit.qualityGate.knownIssuesPath, "known-issues.json");
  assert.equal(kit.qualityGate.source.configFile, "quality-gate.json");
});

test("themeToCss skips empty token blocks", () => {
  assert.equal(
    themeToCss({ id: "empty", tokens: {}, tokensLight: {}, tokensDark: {}, hostPalette: false }),
    "",
  );
});
