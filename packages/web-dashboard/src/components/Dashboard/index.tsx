/* FORK DELTA vs @allurereport/web-dashboard.
 *
 * Same seam as the Awesome fork: upstream's 13-case `switch` over ChartType
 * (`getChartWidgetByType`) moved to `stockWidgets.tsx` untouched and became the
 * `stock` renderer path, and the kit registry wraps it.
 *
 * Everything that is not JSX glue lives in `@qa-guru/allure-report-kit/allure`,
 * shared with the Awesome fork.
 */
import { themeStore } from "@allurereport/web-commons";
import { Grid, GridItem, Loadable, PageLoader, ThemeProvider } from "@allurereport/web-components";
import type { ResolvedTile } from "@qa-guru/allure-report-kit";
import type { AllureChartData } from "@qa-guru/allure-report-kit/allure";
import {
  canKitRender,
  getKitRuntime,
  isKitOwned,
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

import { dashboardStore, fetchDashboardData } from "@/stores/dashboard";
import { currentEnvironment, fetchEnvironments } from "@/stores/env";
import { useI18n } from "@/stores/locale";

import { getChartWidgetByType } from "./stockWidgets";
import * as styles from "./styles.scss";

import "@qa-guru/allure-report-kit/theme.css";

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

    // Async because a panel may keep its data in a widget instead of the
    // manifest; the layout is measured off the real grid cell, which only exists
    // once the effect runs.
    void (async () => {
      const model = await resolveTileModel(tile, chartData);
      if (cancelled || !model) {
        return;
      }
      await kit.mountTile({
        tile: withReportLayout(tile, container),
        model,
        title: model.title,
        container,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [tile, chartData]);

  return <div ref={host} className={`ark-report-tile ${styles["overview-grid-item"]}`} />;
};

export const Dashboard = () => {
  const { t } = useI18n("charts");
  const { t: empty } = useI18n("empty");
  const manifest = readManifest();

  useEffect(() => {
    fetchDashboardData();
    fetchEnvironments();
  }, []);

  return (
    <ThemeProvider theme={currentTheme.value}>
      <Loadable
        source={dashboardStore}
        renderLoader={() => <PageLoader />}
        renderData={(data) => {
          const currentChartsData = currentEnvironment.value ? data.byEnv[currentEnvironment.value] : data.general;

          if (!currentChartsData) {
            return null;
          }

          const charts = pairTiles(Object.entries(currentChartsData), tilesForList(manifest, "layout")).map(
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
