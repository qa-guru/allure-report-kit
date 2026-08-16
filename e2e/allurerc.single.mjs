/**
 * e2e config for `singleFile: true`.
 *
 * The same kit surface as `allurerc.mjs`, in the mode where nothing can be
 * fetched: one HTML document holds the fork bundle, both chart backends, the
 * design-system header and every panel's data.
 *
 * Awesome only — the mode is a property of the plugin, and proving it once with
 * a header, a mixed set of backends and a run-derived panel covers it.
 */
import { charts, panels, presets, renderers, theme, withKit } from "@qa-guru/allure-report-kit";

import { OVERVIEW_PRESET } from "../presets/overview-preset.mjs";

const leadTiles = presets.fromOverview({
  preset: OVERVIEW_PRESET,
  renderers: { durations: "highcharts" },
});

export default withKit({
  name: "allure-report-kit e2e — single file",
  output: "./allure-report-single",
  historyPath: "./history.jsonl",
  appendHistory: false,

  renderer: renderers.stock(),
  softFork: true,

  theme: theme.qaGuru({
    header: theme.header({
      productName: "Multistack",
      brandHref: "https://qa.guru/",
    }),
  }),

  plugins: {
    awesome: {
      options: {
        singleFile: true,
        reportName: "allure-report-kit e2e — single file",
        reportLanguage: "ru",
        charts: [
          ...leadTiles,

          // No widget to fetch: the data has to reach the tile through the
          // manifest instead.
          panels.fromRun({
            id: "passRate",
            title: "Прошло тестов",
            groupBy: "status",
            metric: "count",
            kind: "gauge",
          }),

          charts.testResultSeverities({ title: "Результаты по severity", renderer: "stock" }),
        ],
      },
    },
  },
});
