/**
 * e2e config — the kit inside a real Allure 3 report.
 *
 * Same surface as examples/minimal, with `softFork: true` actually pointing at
 * the built plugin, and panel data inline so the report needs no extra fetch.
 */
import { charts, panels, presets, renderers, theme, withKit } from "@qa-guru/allure-report-kit";

const lockedQuad = presets.lockedQuad({
  renderers: { durations: "highcharts" },
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
          }),

          charts.statusDynamics({ title: "Динамика статусов", limit: 20, renderer: "echarts" }),
          charts.testResultSeverities({ title: "Результаты по severity", renderer: "stock" }),
        ],
      },
    },
  },
});
