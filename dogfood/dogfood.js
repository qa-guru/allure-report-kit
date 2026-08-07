/**
 * Dogfood — the whole v0.1 loop in one page.
 *
 *   withKit(config)  →  plugins.awesome.options.kit manifest  →  KitRuntime
 *
 * Same manifest the soft-fork web layer will consume, so what renders here is
 * what the report renders.
 */
import * as echarts from "echarts";
import Highcharts from "highcharts";

import { charts, panels, presets, renderers, theme, withKit } from "../dist/index.js";
import { createKitRuntime, mountReportHeader } from "../dist/runtime/index.js";
import {
  currentStatusModel,
  durationDynamicsModel,
  durationsModel,
  servicesStatusModel,
  testingPyramidModel,
} from "./data.js";

const config = withKit({
  name: "allure-report-kit dogfood",
  historyPath: "./history.jsonl",
  softFork: true,
  renderer: renderers.echarts(),
  theme: theme.qaGuru({
    header: theme.header({
      productName: "Reference App",
      brandHref: "https://qa.guru/",
      nav: [
        { href: "#", label: "Отчёт", active: true },
        { href: "#dogfood-panels", label: "Панели" },
        { href: "https://allurereport.org/docs/visual-analytics/", label: "Allure 3" },
      ],
    }),
  }),
  plugins: {
    awesome: {
      options: {
        charts: [
          // locked 2×2 — ADR 006, mixed renderers on purpose
          ...presets.lockedQuad({ renderers: { durations: "highcharts" } }),
          // custom panel + bar indicators from the series actually drawn
          panels.custom({
            id: "servicesCurrentStatus",
            title: "Текущий статус по сервисам",
            renderer: "highcharts",
            dots: "fromSeries",
          }),
          // same panel on the amCharts adapter — spike, falls back to a stub
          panels.custom({
            id: "servicesAmcharts",
            title: "Те же сервисы — amCharts",
            renderer: "amcharts",
            dots: "fromSeries",
            layout: "2x1",
          }),
          // stock passthrough: inside the fork Allure draws this tile itself
          charts.currentStatus({
            title: "Текущий статус — stock",
            renderer: "stock",
            dots: false,
            layout: "2x1",
          }),
        ],
      },
    },
  },
});

const manifest = config.plugins.awesome.options.kit;
const declaredCharts = config.plugins.awesome.options.charts;

const MODELS = [
  currentStatusModel,
  durationDynamicsModel,
  testingPyramidModel,
  durationsModel,
  servicesStatusModel,
  servicesStatusModel,
  currentStatusModel,
];

const runtime = createKitRuntime({
  theme: manifest.theme,
  libs: { echarts, highcharts: Highcharts },
  allowDynamicImport: false,
});

function legendRow(tile, result) {
  const row = document.createElement("li");
  row.className = "ark-legend__row";

  const name = document.createElement("span");
  name.className = "ark-legend__name";
  name.textContent = tile.panel ? `${tile.type}:${tile.panel.id}` : tile.type;

  const badge = document.createElement("span");
  badge.className = "ark-legend__badge";
  badge.dataset.renderer = result.renderedBy;
  badge.textContent = result.renderedBy;

  row.append(name, badge);

  if (result.note) {
    const note = document.createElement("span");
    note.className = "ark-legend__note";
    note.textContent = result.note;
    row.append(note);
  }
  return row;
}

async function main() {
  runtime.injectTheme();

  const grid = document.getElementById("dogfood-grid");
  const legend = document.getElementById("dogfood-legend");

  for (const [index, tile] of manifest.tiles.entries()) {
    const model = MODELS[index] ?? MODELS[0];
    const title = declaredCharts[index]?.title ?? tile.type;
    const mounted = await runtime.mountTile({ tile, model, title, container: grid });
    legend.append(legendRow(tile, mounted.result));
  }

  await mountReportHeader({
    ...manifest.theme.header,
    contentRoot: document.getElementById("dogfood-report"),
  });

  // The DS header toggle flips the theme — canvas backends need a redraw.
  runtime.observeTheme();
}

main().catch((error) => {
  const banner = document.getElementById("dogfood-error");
  banner.hidden = false;
  banner.textContent = String(error?.stack ?? error);
});
