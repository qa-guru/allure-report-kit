/**
 * Watch smoke config — Awesome only, no history append.
 *
 * `allure watch` clears output on start and calls `update` on every result change;
 * history append would fight the fixture and is not what this smoke proves.
 */
import { panels, presets, renderers, theme, withKit } from "@qa-guru/allure-report-kit";

import { OVERVIEW_PRESET } from "../presets/overview-preset.mjs";

const leadTiles = presets.fromOverview({ preset: OVERVIEW_PRESET });

export default withKit({
  name: "allure-report-kit watch smoke",
  output: "./allure-report-watch",
  softFork: true,

  renderer: renderers.stock(),

  theme: theme.qaGuru({
    header: theme.header({
      productName: "Multistack",
      brandHref: "https://qa.guru/",
    }),
  }),

  plugins: {
    awesome: {
      options: {
        reportName: "allure-report-kit watch smoke",
        reportLanguage: "ru",
        charts: [
          ...leadTiles,

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
