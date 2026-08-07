/* FORK DELTA vs @allurereport/web-awesome.
 *
 * Upstream renders every tile through a 13-case `switch` over ChartType
 * (`getChartWidgetByType`). That function is untouched — it moved to
 * `stockWidgets.tsx` and is now the `stock` renderer path.
 *
 * Here it is wrapped by the kit registry: the manifest written by `withKit`
 * says which renderer each tile wants, so a page can mix ECharts, Highcharts,
 * amCharts and the SVG canon, and kit-owned panels (which Allure skips as
 * unknown chart types) get a place in the grid.
 */
import { themeStore } from "@allurereport/web-commons";
import { Grid, GridItem, Loadable, PageLoader, ThemeProvider } from "@allurereport/web-components";
import type { KitRuntimeManifest, ResolvedTile } from "@qa-guru/allure-report-kit";
import { createKitRuntime, type KitRuntime } from "@qa-guru/allure-report-kit/runtime";
import { computed } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";

import { chartsStore, fetchChartsData } from "@/stores/chart";
import { currentEnvironment } from "@/stores/env";
import { useI18n } from "@/stores/locale";

import { toChartModel, toPanelModel } from "./kitModel";
import { getChartWidgetByType } from "./stockWidgets";
import * as styles from "./styles.scss";

import "@qa-guru/allure-report-kit/theme.css";

const currentTheme = computed(() => themeStore.value.current);

declare const window: Window & {
  allureReportKit?: KitRuntimeManifest;
  echarts?: unknown;
  Highcharts?: unknown;
  am5?: unknown;
};

const manifest = typeof window === "undefined" ? undefined : window.allureReportKit;

let runtime: KitRuntime | undefined;

function getRuntime(): KitRuntime | undefined {
  if (!manifest) {
    return undefined;
  }
  if (!runtime) {
    runtime = createKitRuntime({
      theme: manifest.theme,
      // Backends are injected by the plugin as globals — nothing is bundled
      // here, so no proprietary chart code ships inside the kit.
      libs: {
        ...(window.echarts ? { echarts: window.echarts } : {}),
        ...(window.Highcharts ? { highcharts: window.Highcharts } : {}),
        ...(window.am5 ? { amcharts: window.am5 } : {}),
      },
      allowDynamicImport: false,
    });
    runtime.injectTheme();
    runtime.observeTheme();
  }
  return runtime;
}

/**
 * Report cells are wide, so a tile without an explicit layout gets 3×2 rather
 * than the standalone 1×1 default — a hard square would be as tall as half the
 * viewport on a desktop grid.
 */
const REPORT_TILE_LAYOUT = "3x2";

const KitTile = ({ tile, model }: { tile: ResolvedTile; model: ReturnType<typeof toChartModel> }) => {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const kit = getRuntime();
    if (!kit || !host.current || !model) {
      return;
    }
    host.current.replaceChildren();
    void kit.mountTile({
      tile: { ...tile, layout: tile.layout ?? REPORT_TILE_LAYOUT },
      model,
      title: model.title,
      container: host.current,
    });
  }, [tile, model]);

  return <div ref={host} className={`ark-report-tile ${styles["overview-grid-item"]}`} />;
};

/**
 * Pair manifest tiles with generated chart data.
 *
 * `charts.json` keeps config order but drops what Allure could not generate —
 * custom panels above all, since their type is unknown upstream. So the walk is
 * positional with a type check: a panel consumes no chart entry, and a mismatch
 * falls back to stock rather than drawing the wrong data.
 */
function pairTiles(chartEntries: [string, any][], tiles: ResolvedTile[] | undefined) {
  if (!tiles?.length) {
    return chartEntries.map(([chartId, chartData]) => ({ chartId, chartData, tile: undefined }));
  }

  const paired: { chartId: string; chartData?: any; tile?: ResolvedTile }[] = [];
  let cursor = 0;

  for (const tile of tiles) {
    if (tile.panel) {
      paired.push({ chartId: `kit-panel-${tile.panel.id}`, tile });
      continue;
    }
    const entry = chartEntries[cursor];
    if (!entry) {
      continue;
    }
    cursor += 1;
    const [chartId, chartData] = entry;
    paired.push({ chartId, chartData, tile: chartData?.type === tile.type ? tile : undefined });
  }

  for (; cursor < chartEntries.length; cursor += 1) {
    const [chartId, chartData] = chartEntries[cursor] as [string, any];
    paired.push({ chartId, chartData, tile: undefined });
  }

  return paired;
}

export const Charts = () => {
  const { t } = useI18n("charts");
  const { t: empty } = useI18n("empty");

  useEffect(() => {
    fetchChartsData();
  }, []);

  return (
    <ThemeProvider theme={currentTheme.value}>
      <Loadable
        source={chartsStore}
        renderLoader={() => <PageLoader />}
        renderData={(data) => {
          const currentChartsData = currentEnvironment.value ? data.byEnv[currentEnvironment.value] : data.general;

          if (!currentChartsData) {
            return null;
          }

          const charts = pairTiles(Object.entries(currentChartsData), manifest?.tiles).map(
            ({ chartId, chartData, tile }) => {
              const kitOwned = tile && tile.renderer.id !== "stock" && tile.renderer.id !== "nivo";

              if (kitOwned) {
                const model = tile.panel ? toPanelModel(tile.panel) : toChartModel(chartData);
                if (model) {
                  return <KitTile key={chartId} tile={tile} model={model} />;
                }
              }

              if (!chartData) {
                return null;
              }

              return (
                <GridItem key={chartId} className={styles["overview-grid-item"]}>
                  {getChartWidgetByType(chartData, { t, empty })}
                </GridItem>
              );
            },
          );

          return (
            <div className={styles.overview}>
              <Grid kind="swap" className={styles["overview-grid"]}>
                {charts}
              </Grid>
            </div>
          );
        }}
      />
    </ThemeProvider>
  );
};
