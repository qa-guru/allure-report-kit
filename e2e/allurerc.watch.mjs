/**
 * Watch smoke config — Awesome only, no history append.
 *
 * `allure watch` clears output on start and calls `update` on every result change;
 * history append would fight the fixture and is not what this smoke proves.
 */
import { panels, presets, renderers, theme, withKit } from "@qa-guru/allure-report-kit";

export default withKit({
  name: "allure-report-kit watch smoke",
  output: "./allure-report-watch",
  softFork: true,

  renderer: renderers.echarts(),

  theme: theme.qaGuru({
    header: theme.header({
      productName: "Reference App",
      brandHref: "https://qa.guru/",
    }),
  }),

  plugins: {
    awesome: {
      options: {
        reportName: "allure-report-kit watch smoke",
        reportLanguage: "ru",
        charts: [
          ...presets.lockedQuad(),

          panels.fromRun({
            id: "passRate",
            title: "Прошло тестов",
            groupBy: "status",
            metric: "count",
            kind: "gauge",
          }),
        ],
      },
    },
  },
});
