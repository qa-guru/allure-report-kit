/**
 * Minimal kit config — Awesome + Dashboard.
 *
 * Shows the whole v0.1 surface: locked 2×2 from ADR 006, a renderer mix on one
 * page, a custom panel with `fromSeries` indicators, and the DS report header.
 *
 * Exported as a plain object, the runnable format ADR 006 fixes. `defineConfig`
 * from the `allure` package is optional sugar:
 *
 *   import { defineConfig } from "allure";
 *   export default defineConfig(withKit({ … }));
 *
 * Validate against the monorepo ethalon invariant:
 *   node generators/ethalon/tests-java/scripts/validate-allurerc.mjs \
 *     projects/allure-report-kit-home/allure-report-kit/examples/minimal/allurerc.mjs
 */
import { charts, panels, presets, renderers, theme, withKit } from "@qa-guru/allure-report-kit";

/**
 * Locked 2×2, indices 0–3 — order is the invariant, renderers are not:
 *   [0] currentStatus   echarts
 *   [1] durationDynamics echarts
 *   [2] testingPyramid   svg (kit canon)
 *   [3] durations/layer  highcharts (showcase)
 */
const lockedQuad = presets.lockedQuad({
  renderers: { durations: "highcharts" },
});

export default withKit({
  name: "Reference App Tests",
  output: "./allure-report",
  historyPath: "./history.jsonl",
  appendHistory: true,
  historyLimit: 20,

  // Page default for every kit-owned tile without its own `renderer`.
  renderer: renderers.echarts(),

  theme: theme.qaGuru({
    header: theme.header({
      productName: "Reference App",
      brandHref: "https://qa.guru/",
    }),
  }),

  // Custom panels need the kit plugins; withKit rewrites `plugins.*.import`.
  softFork: true,

  qualityGate: {
    rules: [{ maxFailures: 5, fastFail: true }],
  },

  plugins: {
    awesome: {
      options: {
        reportName: "Reference App",
        reportLanguage: "ru",
        charts: [
          ...lockedQuad,

          // Kit panel: nine services, seven healthy. Dots resolve to the two
          // families really on the donut — orange + green. Data comes from a
          // widget you write yourself.
          panels.custom({
            id: "servicesCurrentStatus",
            title: "Текущий статус по сервисам",
            renderer: "highcharts",
            dots: "fromSeries",
            dataUrl: "widgets/services-status.json",
          }),

          // Panel data computed from the run by the plugin, no config data at all.
          panels.fromRun({
            id: "passRate",
            title: "Прошло тестов",
            groupBy: "status",
            kind: "gauge",
          }),

          // Stock tiles stay stock — Allure renders them with nivo.
          charts.testResultSeverities({ renderer: "stock" }),
          charts.statusDynamics({ limit: 20, renderer: "echarts" }),
        ],
      },
    },

    dashboard: {
      options: {
        reportName: "Reference App — Dashboard",
        reportLanguage: "ru",
        layout: [
          ...lockedQuad,
          panels.fromRun({
            id: "layersTable",
            title: "Тесты по слоям",
            groupBy: "layer",
            kind: "table",
            columns: ["Слой", "Тестов"],
            limit: 5,
          }),
          charts.successRateDistribution({ renderer: "stock" }),
        ],
      },
    },
  },
});
