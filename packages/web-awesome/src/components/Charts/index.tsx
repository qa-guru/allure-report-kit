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
 *
 * Everything that is not JSX glue lives in `@qa-guru/allure-report-kit/allure`,
 * shared with the Dashboard fork.
 */
import { themeStore } from "@allurereport/web-commons";
import { Grid, GridItem, Loadable, PageLoader, ThemeProvider } from "@allurereport/web-components";
import type { ResolvedTile } from "@qa-guru/allure-report-kit";
import type { AllureChartData } from "@qa-guru/allure-report-kit/allure";
import {
  canKitRender,
  getKitRuntime,
  isKitOwned,
  observeCell,
  pairTiles,
  readManifest,
  resolveTileModel,
  tilesForList,
  toChartModel,
  toPanelModel,
  withReportLayout,
} from "@qa-guru/allure-report-kit/allure";
import { computed } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";

import { chartsStore, fetchChartsData } from "@/stores/chart";
import { currentEnvironment } from "@/stores/env";
import { useI18n } from "@/stores/locale";

import { getChartWidgetByType } from "./stockWidgets";
import * as styles from "./styles.scss";

const currentTheme = computed(() => themeStore.value.current);

const KitTile = ({ tile, chartData }: { tile: ResolvedTile; chartData?: AllureChartData }) => {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const kit = getKitRuntime();
    const container = host.current;
    if (!kit || !container) {
      return undefined;
    }
    container.replaceChildren();
    let cancelled = false;
    let mounted: HTMLElement | undefined;

    // Async because a panel may keep its data in a widget instead of the
    // manifest; the layout is measured off the real grid cell, which only exists
    // once the effect runs.
    const draw = async () => {
      const model = await resolveTileModel(tile, chartData);
      if (cancelled || !model) {
        return;
      }
      const { elements } = await kit.mountTile({
        tile: withReportLayout(tile, container),
        model,
        title: model.title,
        container,
        // Redraws reuse the markup, or the cell would collect a tile per resize.
        ...(mounted ? { element: mounted } : {}),
      });
      mounted = elements.root;
    };

    void draw();
    // The first measurement lands before the grid settles, and the cell keeps
    // moving afterwards — sidebar, breakpoint, window.
    const stopObserving = observeCell(container, () => {
      void draw();
    });

    return () => {
      cancelled = true;
      stopObserving();
    };
  }, [tile, chartData]);

  return <div ref={host} className={`ark-report-tile ${styles["overview-grid-item"]}`} />;
};

export const Charts = () => {
  const { t } = useI18n("charts");
  const { t: empty } = useI18n("empty");
  const manifest = readManifest();

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

          const charts = pairTiles(Object.entries(currentChartsData), tilesForList(manifest, "charts")).map(
            ({ chartId, chartData, tile }) => {
              if (isKitOwned(tile)) {
                const model = tile.panel ? toPanelModel(tile.panel) : toChartModel(chartData as any);
                // A backend that cannot draw this kind leaves the tile to Allure.
                if (canKitRender(tile, model)) {
                  return <KitTile key={chartId} tile={tile} chartData={chartData as any} />;
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
