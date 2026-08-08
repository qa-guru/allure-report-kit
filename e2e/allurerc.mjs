/**
 * e2e config — the kit inside a real Allure 3 report.
 *
 * Same surface as examples/minimal, with `softFork: true` actually pointing at
 * the built plugin. Panels cover both data paths: inline data in the manifest,
 * and `fromRun`, which the plugin computes against the store and ships as a
 * widget.
 */
import { charts, panels, presets, renderers, theme, withKit } from "@qa-guru/allure-report-kit";

const lockedQuad = presets.lockedQuad({
  renderers: { durations: "highcharts" },
});

/** Panel with no test data behind it — nine services, seven healthy. */
const servicesPanel = () =>
  panels.custom({
    id: "servicesCurrentStatus",
    title: "Текущий статус по сервисам",
    renderer: "highcharts",
    dots: "fromSeries",
    data: {
      total: 9,
      unit: "из",
      series: [
        { id: "healthy", label: "healthy", value: 7, color: "var(--ark-status-passed)", family: "green" },
        { id: "degraded", label: "degraded", value: 2, color: "var(--ark-status-orange)", family: "orange" },
      ],
    },
  });

export default withKit({
  name: "allure-report-kit e2e",
  output: "./allure-report",
  historyPath: "./history.jsonl",
  appendHistory: true,
  historyLimit: 20,

  renderer: renderers.echarts(),
  softFork: true,

  theme: theme.qaGuru({
    header: theme.header({
      productName: "Reference App",
      brandHref: "https://qa.guru/",
    }),
  }),

  qualityGate: {
    rules: [{ maxFailures: 10 }],
  },

  plugins: {
    awesome: {
      options: {
        reportName: "allure-report-kit e2e",
        reportLanguage: "ru",
        charts: [
          ...lockedQuad,

          servicesPanel(),

          // Data computed from the run by the plugin, fetched as a widget.
          panels.fromRun({
            id: "passRate",
            title: "Прошло тестов",
            groupBy: "status",
            metric: "count",
            kind: "gauge",
          }),

          charts.statusDynamics({ title: "Динамика статусов", limit: 20, renderer: "echarts" }),
          charts.testResultSeverities({ title: "Результаты по severity", renderer: "stock" }),
        ],
      },
    },

    dashboard: {
      options: {
        reportName: "allure-report-kit e2e — Dashboard",
        reportLanguage: "ru",
        layout: [
          ...lockedQuad,

          servicesPanel(),

          // Both run-derived panel kinds: a gauge on the SVG canon and a table on
          // the DOM one, neither of which any chart backend draws.
          panels.fromRun({
            id: "passRate",
            title: "Прошло тестов",
            groupBy: "status",
            metric: "count",
            kind: "gauge",
          }),
          panels.fromRun({
            id: "layersTable",
            title: "Тесты по слоям",
            groupBy: "layer",
            metric: "count",
            kind: "table",
            columns: ["Слой", "Тестов"],
            limit: 5,
          }),

          // A rate, not a count: folding the tail into `other` has to re-measure
          // the groups rather than add their percentages up.
          panels.fromRun({
            id: "flakyByLayer",
            title: "Flaky по слоям",
            groupBy: "layer",
            metric: "flakyRate",
            kind: "bar",
            limit: 4,
            unit: "%",
          }),

          // Trend rather than snapshot: the data is the history Allure appends
          // to historyPath, which no chart in the config can reach.
          panels.fromHistory({
            id: "passRateTrend",
            title: "Pass rate по прогонам",
            metric: "passRate",
            limit: 10,
            renderer: "highcharts",
          }),

          // Coverage surface: every remaining upstream chart type, kit-rendered.
          charts.statusDynamics({ title: "Динамика статусов", limit: 20 }),
          charts.statusTransitions({ title: "Переходы статусов", limit: 20 }),
          charts.testBaseGrowthDynamics({ title: "Рост тестовой базы", limit: 20 }),
          charts.statusAgePyramid({ title: "Возраст статусов", limit: 20 }),
          charts.testResultSeverities({ title: "Результаты по severity" }),
          charts.stabilityDistribution({
            title: "Стабильность по компонентам",
            groupBy: "label-name:component",
            threshold: 90,
            stabilizationPeriod: 2,
            skipStatuses: ["skipped", "unknown"],
          }),
          charts.durations({ title: "Длительности", groupBy: "none" }),
          // Highcharts cannot draw a treemap without extra modules, so this
          // tile must land back on Allure's own widget instead of a placeholder.
          charts.coverageDiff({ title: "Coverage diff — highcharts declines", renderer: "highcharts" }),
          charts.successRateDistribution({ title: "Success rate" }),
          charts.problemsDistribution({ title: "Проблемы по окружениям" }),

          // One tile stays on Allure's own widget on purpose.
          charts.currentStatus({ title: "Текущий статус — stock", renderer: "stock" }),
        ],
      },
    },
  },
});
