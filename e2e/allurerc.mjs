/**
 * e2e config — the kit inside a real Allure 3 report.
 *
 * After the overview preset: Allure QG + Sonar QG lead the custom panels, then the
 * rest of the kit surface (fromRun / fromHistory / stock mix).
 */
import { charts, panels, presets, renderers, theme, withKit } from "@qa-guru/allure-report-kit";
import { sonarProjectStatusToQualityGateOptions } from "@qa-guru/allure-report-kit/runtime";

import { OVERVIEW_PRESET } from "../presets/overview-preset.mjs";
import testsTableFixture from "../test/fixtures/tests-table-panel.json" with { type: "json" };

const sonarQualityGateData = () =>
  sonarProjectStatusToQualityGateOptions(
    {
      status: "OK",
      project_key: "autotests-ai-multistack-app-backend-java-spring",
      analysis_id: "AXdemoPassedAnalysis",
      dashboard_url: "https://sonar.qa.guru/dashboard?id=autotests-ai-multistack-app-backend-java-spring",
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
        projectKey: "autotests-ai-multistack-app-backend-java-spring",
        hrefBase: "https://github.com/qa-guru/zero-design-system/blob/master/",
      },
    },
  );

const leadTiles = presets.fromLead({
  preset: OVERVIEW_PRESET,
  renderers: { durations: "highcharts" },
  gatePanels: {
    allureQualityGate: {
      title: "Allure Quality Gate",
      labels: {
        passed: { ru: "Allure Quality Gate пройден", en: "Allure Quality Gate passed" },
        failed: { ru: "Allure Quality Gate не пройден", en: "Allure Quality Gate failed" },
      },
    },
    sonarQualityGate: {
      title: "Sonar Quality Gate",
      data: sonarQualityGateData(),
    },
  },
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

const testsTablePanel = () =>
  panels.testsTable({
    id: "testsTable",
    title: "Таблица тестов",
    layout: "2x2",
    dots: false,
    data: testsTableFixture,
  });

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
      productName: "Multistack",
      brandHref: "https://qa.guru/",
    }),
  }),

  qualityGate: {
    rules: [{ maxFailures: 10 }],
    source: {
      configFile: "allurerc.mjs",
      rulesFile: "allure/quality-gate.mjs",
      hrefBase: "https://github.com/autotests-ai/autotests-ai-multistack-app/blob/master/tests/java/tests-java-gradle-junit5-allure3-selenide/",
    },
  },

  plugins: {
    awesome: {
      options: {
        reportName: "allure-report-kit e2e",
        reportLanguage: "ru",
        charts: [
          ...leadTiles,
          testsTablePanel(),

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
          ...leadTiles,
          testsTablePanel(),

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
