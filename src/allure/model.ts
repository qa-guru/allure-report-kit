/**
 * Allure chart data → kit chart models.
 *
 * Shared by every fork (Awesome, Dashboard, …) so the mapping exists once. One
 * branch per data shape, not per (chart type × backend) pair — that is what
 * keeps adding a renderer cheap.
 *
 * The input is typed structurally instead of importing
 * `@allurereport/web-commons`: the kit reads four fields and should not gain a
 * dependency on the report's internals for that.
 */
import type { KitCustomPanel, StatusFamily } from "../types.js";
import type { ChartModel } from "../runtime/model.js";

export interface AllureChartData {
  type: string;
  title?: string;
  data?: unknown;
  keys?: Record<string, string>;
  [field: string]: unknown;
}

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

const STATUS_ORDER = ["passed", "failed", "broken", "skipped", "unknown"] as const;

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

/** Execution ids are uuids — useless as axis ticks. Number them instead. */
function runLabel(id: string, index: number, total: number): string {
  return id === "current" || index === total - 1 ? "current" : `#${index + 1}`;
}

function formatBucket(from: number, to: number): string {
  const seconds = (ms: number) => (ms >= 1000 ? `${Math.round(ms / 1000)}s` : `${ms}ms`);
  return `${seconds(from)}–${seconds(to)}`;
}

export function toChartModel(chartData: AllureChartData): ChartModel | undefined {
  switch (chartData.type) {
    case "currentStatus": {
      const data = chartData.data as Record<string, number>;
      // `Statistic` carries its own `total` alongside the statuses — summing
      // every value would double-count it and halve the percentage.
      const total =
        data.total ?? STATUS_ORDER.reduce((sum, status) => sum + (data[status] ?? 0), 0);
      const metric = (chartData.metric as string) ?? "passed";

      return {
        kind: "pie",
        type: "currentStatus",
        title: chartData.title,
        total,
        percentage: total > 0 ? ((data[metric] ?? 0) / total) * 100 : 0,
        series: statusSeries(data),
      };
    }

    case "testingPyramid": {
      const tiers = chartData.data as { layer: string; testCount: number }[];
      return {
        kind: "pyramid",
        type: "testingPyramid",
        title: chartData.title,
        series: tiers.map((tier) => ({
          id: tier.layer,
          label: tier.layer,
          value: tier.testCount,
          color: layerColor(tier.layer),
          family: LAYER_FAMILIES[tier.layer] ?? "gray",
        })),
      };
    }

    case "durations": {
      const buckets = chartData.data as Record<string, number>[];
      const keys = chartData.keys ?? {};
      const categories = buckets.map((bucket) =>
        formatBucket(bucket.from as number, bucket.to as number),
      );
      const seriesIds = Object.keys(keys);

      return {
        kind: "bar",
        type: "durations",
        title: chartData.title,
        categories,
        series: (seriesIds.length ? seriesIds : ["all"]).map((id) => {
          const label = keys[id] ?? id;
          return {
            id,
            label,
            color: layerColor(label),
            family: LAYER_FAMILIES[label] ?? "blue",
            points: buckets.map((bucket, index) => ({
              x: categories[index] as string,
              y: bucket[id] ?? 0,
            })),
          };
        }),
      };
    }

    case "durationDynamics": {
      const runs = chartData.data as { id: string; duration: number }[];
      const categories = runs.map((run, index) => runLabel(run.id, index, runs.length));

      return {
        kind: "line",
        type: "durationDynamics",
        title: chartData.title,
        categories,
        series: [
          {
            id: "duration",
            label: "duration",
            color: "var(--ark-layer-manual)",
            family: "blue",
            points: runs.map((run, index) => ({
              x: categories[index] as string,
              y: Math.round(run.duration / 1000),
            })),
          },
        ],
      };
    }

    case "statusDynamics": {
      const runs = chartData.data as { id: string; statistic: Record<string, number> }[];
      const categories = runs.map((run, index) => runLabel(run.id, index, runs.length));

      return {
        kind: "bar",
        type: "statusDynamics",
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
  const kind = panel.kind === "donut" ? "pie" : (panel.kind ?? "pie");
  return {
    kind: kind as ChartModel["kind"],
    type: "custom",
    title: panel.title,
    total: panel.data?.total,
    unit: panel.data?.unit,
    series: panel.data?.series ?? [],
  };
}
