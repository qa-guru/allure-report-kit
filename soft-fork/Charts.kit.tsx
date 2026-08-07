/* eslint-disable */
/**
 * Spike — the forked `web-awesome/src/components/Charts/index.tsx`.
 *
 * Upstream dispatches `ChartType` to a widget with a 13-case switch. Here the
 * switch survives only as the `stock` path: everything else goes through the
 * kit registry, so a tile can pick its backend and a kit panel can exist at all.
 *
 * Not compiled by the package build (tsconfig excludes `soft-fork/`) — it lives
 * here as the reference diff against upstream until the forked packages are
 * published.
 */
import { ChartType } from "@allurereport/charts-api";
import type { UIChartData } from "@allurereport/web-commons";
import { Grid, GridItem, Loadable, PageLoader } from "@allurereport/web-components";
import { useEffect, useRef } from "preact/hooks";

import { createKitRuntime, type KitRuntime } from "@qa-guru/allure-report-kit/runtime";
import type { KitRuntimeManifest, ResolvedTile } from "@qa-guru/allure-report-kit";

// Upstream modules, unchanged.
import { chartsStore, fetchChartsData } from "@/stores/chart";
import { useI18n } from "@/stores/locale";

// Upstream `getChartWidgetByType`, moved out verbatim. It is the `stock` path.
import { getChartWidgetByType } from "./stockWidgets";

/** `plugins.awesome.options.kit`, written by `withKit` and inlined by the plugin. */
declare const window: Window & { allureReportOptions?: { kit?: KitRuntimeManifest } };

/**
 * Allure chart data → kit chart model.
 *
 * One function per data shape instead of one per (chart type × backend) pair:
 * that is what keeps adding a backend cheap.
 */
function toChartModel(chartData: UIChartData) {
  switch (chartData.type) {
    case ChartType.CurrentStatus:
      return {
        kind: "pie" as const,
        type: chartData.type,
        total: Object.values(chartData.data).reduce((sum: number, n: any) => sum + n, 0),
        series: Object.entries(chartData.data).map(([status, count]) => ({
          id: status,
          label: status,
          value: count as number,
          color: `var(--ark-status-${status})`,
        })),
      };

    case ChartType.TestingPyramid:
      return {
        kind: "pyramid" as const,
        type: chartData.type,
        series: chartData.data.map((layer: any) => ({
          id: layer.layer,
          label: layer.layer,
          value: layer.testCount,
          color: `var(--ark-layer-${layer.layer})`,
        })),
      };

    // …one branch per data shape; anything unmapped stays on `stock`.
    default:
      return undefined;
  }
}

function KitTile({
  runtime,
  tile,
  chartData,
}: {
  runtime: KitRuntime;
  tile: ResolvedTile;
  chartData: UIChartData;
}) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const model = tile.panel ? panelModel(tile) : toChartModel(chartData);
    if (!host.current || !model) {
      return;
    }
    void runtime.mountTile({ tile, model, element: host.current });
  }, [runtime, tile, chartData]);

  return <div ref={host} class="widget-tile" />;
}

/** Custom panels carry their own data — inline or fetched by the plugin. */
function panelModel(tile: ResolvedTile) {
  const panel = tile.panel!;
  return {
    kind: panel.kind ?? "donut",
    type: "custom" as const,
    title: panel.title,
    total: panel.data?.total,
    unit: panel.data?.unit,
    series: panel.data?.series ?? [],
  };
}

export default function Charts() {
  const { t } = useI18n("charts");
  const manifest = window.allureReportOptions?.kit;

  const runtime = useRef<KitRuntime>();
  if (manifest && !runtime.current) {
    runtime.current = createKitRuntime({ theme: manifest.theme });
    runtime.current.injectTheme();
    runtime.current.observeTheme();
  }

  useEffect(() => {
    fetchChartsData();
  }, []);

  return (
    <Loadable
      source={chartsStore}
      renderLoader={() => <PageLoader />}
      renderData={(charts) => (
        <Grid>
          {Object.entries(charts).map(([chartId, chartData], index) => {
            const tile = manifest?.tiles[index];
            const useKit = tile && tile.renderer.id !== "stock" && runtime.current;

            return (
              <GridItem key={chartId}>
                {useKit ? (
                  <KitTile runtime={runtime.current!} tile={tile} chartData={chartData} />
                ) : (
                  getChartWidgetByType(chartData, { t })
                )}
              </GridItem>
            );
          })}
        </Grid>
      )}
    />
  );
}
