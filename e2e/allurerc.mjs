/**
 * e2e config — the kit inside a real Allure 3 report.
 *
 * After the locked 2×2: Allure QG + Sonar QG lead the custom panels, then the
 * rest of the kit surface (fromRun / fromHistory / stock mix).
 */
import { charts, panels, presets, renderers, theme, withKit } from "@qa-guru/allure-report-kit";
import { sonarProjectStatusToQualityGateOptions } from "@qa-guru/allure-report-kit/runtime";

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

const allureQualityGatePanel = () =>
  panels.qualityGate({
    id: "allureQualityGate",
    title: "Allure Quality Gate",
    labels: {
      passed: { ru: "Allure Quality Gate пройден", en: "Allure Quality Gate passed" },
      failed: { ru: "Allure Quality Gate не пройден", en: "Allure Quality Gate failed" },
    },
  });

/** Sonar QG — fixture shaped like the DS components demo (passed). */
const sonarQualityGatePanel = () => {
  const data = sonarProjectStatusToQualityGateOptions(
    {
      status: "OK",
      project_key: "reference-app-backend",
      analysis_id: "AXdemoPassedAnalysis",
      dashboard_url: "https://sonar.qa.guru/dashboard?id=reference-app-backend",
      conditions: [
        {
          status: "OK",
          metricKey: "coverage",
          comparator: "LT",
          errorThreshold: 80,
          actualValue: 100,
        },
        {
          status: "OK",
          metricKey: "bugs",
          comparator: "GT",
          errorThreshold: 0,
          actualValue: 0,
        },
      ],
    },
    {
      lang: "ru",
      profile: "qa-guru-canon",
      profileConditions: [
        { metric: "coverage", op: "LT", error: 80, label: "Coverage on Overall Code ≥ 80%" },
        { metric: "bugs", op: "GT", error: 0, label: "Bugs on Overall Code = 0" },
      ],
      source: {
        configFile: "docs/sonar/quality-gate-profile.json",
        profile: "qa-guru-canon",
        projectKey: "reference-app-backend",
        hrefBase: "https://github.com/qa-guru/zero-design-system/blob/master/",
      },
    },
  );

  return panels.custom({
    id: "sonarQualityGate",
    title: "Sonar Quality Gate",
    kind: "qualityGate",
    dots: false,
    // KitQualityGateData — rules path, not series.
    data,
  });
};

const leadQualityGates = () => [allureQualityGatePanel(), sonarQualityGatePanel()];

export default withKit({
  name: "allure-report-kit e2e",
  output: "./allure-report",
  historyPath: "./history.jsonl",
  appendHistory: true,
  historyLimit: 20,

  renderer: renderers.stock(),
  softFork: true,

  theme: theme.qaGuru({
    header: theme.header({
      productName: "Reference App",
      brandHref: "https://qa.guru/",
    }),
  }),

  qualityGate: {
    rules: [{ maxFailures: 10 }],
    source: {
      configFile: "allurerc.mjs",
      rulesFile: "allure/quality-gate.mjs",
      hrefBase: "https://github.com/qa-guru/zero-design-system/blob/master/stacks/java-spring/tests/",
    },
  },

  plugins: {
    awesome: {
      options: {
        reportName: "allure-report-kit e2e",
        reportLanguage: "ru",
        charts: [
          ...lockedQuad,
          ...leadQualityGates(),

          servicesPanel(),

          // Data computed from the run by the plugin, fetched as a widget.
          panels.fromRun({
            id: "passRate",
            title: "Прошло тестов",
            groupBy: "status",
            metric: "count",
            kind: "gauge",
          }),

          charts.statusDynamics({ title: "Динамика статусов", limit: 20 }),
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
          ...leadQualityGates(),

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
            renderer: "highcharts",
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
