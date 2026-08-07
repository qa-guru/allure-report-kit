/* FORK ADDITION — Allure chart data → kit chart model.
 *
 * One branch per data shape, not per (chart type × backend) pair: that is what
 * keeps adding a renderer cheap. Anything without a branch returns undefined
 * and the tile stays on the upstream widget.
 */
import { ChartType } from "@allurereport/charts-api";
import type { UIChartData } from "@allurereport/web-commons";
import type { ChartModel } from "@qa-guru/allure-report-kit/runtime";
import type { KitCustomPanel, StatusFamily } from "@qa-guru/allure-report-kit";

const STATUS_FAMILIES: Record<string, StatusFamily> = {
  passed: "green",
  failed: "red",
  broken: "yellow",
  skipped: "gray",
  unknown: "purple",
};

const LAYER_FAMILIES: Record<string, StatusFamily> = {
  unit: "green",
  component: "orange",
  integration: "purple",
  api: "yellow",
  e2e: "red",
  manual: "blue",
  other: "gray",
};

const STATUS_ORDER = ["passed", "failed", "broken", "skipped", "unknown"];

function statusSeries(data: Record<string, number>) {
  return STATUS_ORDER.filter((status) => (data[status] ?? 0) > 0).map((status) => ({
    id: status,
    label: status,
    value: data[status] ?? 0,
    color: `var(--ark-status-${status})`,
    family: STATUS_FAMILIES[status],
  }));
}

function layerColor(layer: string): string {
  return LAYER_FAMILIES[layer] ? `var(--ark-layer-${layer})` : "var(--ark-layer-other)";
}

export function toChartModel(chartData: UIChartData): ChartModel | undefined {
  switch (chartData.type) {
    case ChartType.CurrentStatus: {
      const data = chartData.data as Record<string, number>;
      // `Statistic` carries its own `total` alongside the statuses — summing
      // every value would double-count it and halve the percentage.
      const total = data.total ?? STATUS_ORDER.reduce((sum, status) => sum + (data[status] ?? 0), 0);
      const metric = (chartData as any).metric ?? "passed";
      return {
        kind: "pie",
        type: chartData.type,
        title: chartData.title,
        total,
        percentage: total > 0 ? ((data[metric] ?? 0) / total) * 100 : 0,
        series: statusSeries(data),
      };
    }

    case ChartType.TestingPyramid: {
      return {
        kind: "pyramid",
        type: chartData.type,
        title: chartData.title,
        series: (chartData.data as any[]).map((tier) => ({
          id: tier.layer,
          label: tier.layer,
          value: tier.testCount,
          color: layerColor(tier.layer),
          family: LAYER_FAMILIES[tier.layer] ?? "gray",
        })),
      };
    }

    case ChartType.Durations: {
      const buckets = chartData.data as Record<string, number>[];
      const keys = (chartData as any).keys as Record<string, string>;
      const categories = buckets.map((bucket) => formatBucket(bucket.from, bucket.to));
      const seriesIds = Object.keys(keys ?? {});

      return {
        kind: "bar",
        type: chartData.type,
        title: chartData.title,
        categories,
        series: (seriesIds.length ? seriesIds : ["all"]).map((id) => ({
          id,
          label: keys?.[id] ?? id,
          color: layerColor(keys?.[id] ?? id),
          family: LAYER_FAMILIES[keys?.[id] ?? ""] ?? "blue",
          points: buckets.map((bucket, index) => ({
            x: categories[index] as string,
            y: (bucket[id] as number) ?? 0,
          })),
        })),
      };
    }

    case ChartType.DurationDynamics: {
      const points = chartData.data as { id: string; duration: number }[];
      const categories = points.map((point, index) => runLabel(point.id, index, points.length));
      return {
        kind: "line",
        type: chartData.type,
        title: chartData.title,
        categories,
        series: [
          {
            id: "duration",
            label: "duration",
            color: "var(--ark-layer-manual)",
            family: "blue",
            points: points.map((point, index) => ({
              x: categories[index] as string,
              y: Math.round(point.duration / 1000),
            })),
          },
        ],
      };
    }

    case ChartType.StatusDynamics: {
      const runs = chartData.data as { id: string; statistic: Record<string, number> }[];
      const categories = runs.map((run, index) => runLabel(run.id, index, runs.length));
      return {
        kind: "bar",
        type: chartData.type,
        title: chartData.title,
        categories,
        series: STATUS_ORDER.filter((status) =>
          runs.some((run) => (run.statistic?.[status] ?? 0) > 0),
        ).map((status) => ({
          id: status,
          label: status,
          color: `var(--ark-status-${status})`,
          family: STATUS_FAMILIES[status],
          points: runs.map((run, index) => ({
            x: categories[index] as string,
            y: run.statistic?.[status] ?? 0,
          })),
        })),
      };
    }

    default:
      return undefined;
  }
}

/** Custom panels are not in charts.json — their data rides in the manifest. */
export function toPanelModel(panel: KitCustomPanel): ChartModel {
  const kind = panel.kind === "pyramid" ? "pyramid" : panel.kind === "donut" ? "pie" : panel.kind;
  return {
    kind: (kind ?? "pie") as ChartModel["kind"],
    type: "custom",
    title: panel.title,
    total: panel.data?.total,
    unit: panel.data?.unit,
    series: panel.data?.series ?? [],
  };
}

/** Execution ids are uuids — useless as axis ticks. Number them instead. */
function runLabel(id: string, index: number, total: number): string {
  if (id === "current" || index === total - 1) {
    return "current";
  }
  return `#${index + 1}`;
}

function formatBucket(from: number, to: number): string {
  const seconds = (ms: number) => (ms >= 1000 ? `${Math.round(ms / 1000)}s` : `${ms}ms`);
  return `${seconds(from)}–${seconds(to)}`;
}
