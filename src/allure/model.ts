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
import type { ChartModel, ChartSeries, ChartTreeNode } from "../runtime/model.js";

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

/** Stacked bar over run history: one series per status, one point per run. */
function statusBarsOverRuns(
  chartData: AllureChartData,
  type: ChartModel["type"],
  runs: ({ id: string } & Record<string, unknown>)[],
  statuses: readonly string[],
): ChartModel {
  const categories = runs.map((run, index) => runLabel(run.id, index, runs.length));

  return {
    kind: "bar",
    type,
    title: chartData.title,
    categories,
    series: statuses
      .filter((status) => runs.some((run) => ((run[status] as number) ?? 0) > 0))
      .map((status) => ({
        id: status,
        label: status,
        color: `var(--ark-status-${status})`,
        family: STATUS_FAMILIES[status],
        points: runs.map((run, index) => ({
          x: categories[index] as string,
          y: (run[status] as number) ?? 0,
        })),
      })),
  };
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
          // `groupBy: "none"` still ships one key, labelled literally "none".
          const raw = keys[id] ?? id;
          const label = raw === "none" ? "tests" : raw;
          return {
            id,
            label,
            color: LAYER_FAMILIES[raw] ? layerColor(raw) : "var(--ark-layer-manual)",
            family: LAYER_FAMILIES[raw] ?? "blue",
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

    case "statusTransitions": {
      const runs = chartData.data as { id: string }[];
      const categories = runs.map((run, index) => runLabel(run.id, index, runs.length));
      const kinds: { key: string; family: StatusFamily; color: string }[] = [
        { key: "fixed", family: "green", color: "var(--ark-status-passed)" },
        { key: "regressed", family: "red", color: "var(--ark-status-failed)" },
        { key: "malfunctioned", family: "orange", color: "var(--ark-status-orange)" },
      ];

      return {
        kind: "bar",
        type: "statusTransitions",
        title: chartData.title,
        categories,
        series: kinds.map(({ key, family, color }) => ({
          id: key,
          label: key,
          color,
          family,
          points: runs.map((run, index) => ({
            x: categories[index] as string,
            y: (run as unknown as Record<string, number>)[key] ?? 0,
          })),
        })),
      };
    }

    case "statusAgePyramid": {
      const runs = chartData.data as ({ id: string } & Record<string, number>)[];
      const statuses = (chartData.statuses as string[]) ?? ["failed", "broken", "skipped", "unknown"];
      return statusBarsOverRuns(chartData, "statusAgePyramid", runs, statuses);
    }

    case "testResultSeverities": {
      const levels = chartData.data as ({ id: string } & Record<string, number>)[];
      const statuses = (chartData.statuses as string[]) ?? STATUS_ORDER;
      const categories = levels.map((level) => level.id);

      return {
        kind: "bar",
        type: "testResultSeverities",
        title: chartData.title,
        categories,
        series: statuses
          .filter((status) => levels.some((level) => (level[status] ?? 0) > 0))
          .map((status) => ({
            id: status,
            label: status,
            color: `var(--ark-status-${status})`,
            family: STATUS_FAMILIES[status],
            points: levels.map((level, index) => ({
              x: categories[index] as string,
              y: level[status] ?? 0,
            })),
          })),
      };
    }

    case "testBaseGrowthDynamics": {
      const runs = chartData.data as ({ id: string } & Record<string, number>)[];
      const statuses = (chartData.statuses as string[]) ?? STATUS_ORDER;
      const categories = runs.map((run, index) => runLabel(run.id, index, runs.length));
      const sum = (run: Record<string, number>, prefix: string) =>
        statuses.reduce((total, status) => total + (run[`${prefix}:${status}`] ?? 0), 0);

      // Aggregated rather than one series per status × direction: ten series of
      // mostly zeroes say less about growth than added vs removed.
      return {
        kind: "bar",
        type: "testBaseGrowthDynamics",
        title: chartData.title,
        categories,
        series: [
          {
            id: "new",
            label: "new",
            color: "var(--ark-status-passed)",
            family: "green",
            points: runs.map((run, index) => ({
              x: categories[index] as string,
              y: sum(run, "new"),
            })),
          },
          {
            id: "removed",
            label: "removed",
            color: "var(--ark-status-failed)",
            family: "red",
            points: runs.map((run, index) => ({
              x: categories[index] as string,
              y: -sum(run, "removed"),
            })),
          },
        ],
      };
    }

    case "stabilityDistribution": {
      const groups = chartData.data as { id: string; stabilityRate: number }[];
      const keys = chartData.keys ?? {};
      const threshold = (chartData.threshold as number) ?? 100;
      const categories = groups.map((group) => keys[group.id] ?? group.id);

      // Two series instead of per-point colours: the model keeps colour at the
      // series level, and "below threshold" is the only distinction that matters.
      const split = (wantStable: boolean): ChartSeries => ({
        id: wantStable ? "stable" : "unstable",
        label: wantStable ? `≥ ${threshold}%` : `< ${threshold}%`,
        color: wantStable ? "var(--ark-status-passed)" : "var(--ark-status-failed)",
        family: wantStable ? "green" : "red",
        points: groups.map((group, index) => ({
          x: categories[index] as string,
          y: group.stabilityRate >= threshold === wantStable ? group.stabilityRate : 0,
        })),
      });

      return {
        kind: "bar",
        type: "stabilityDistribution",
        title: chartData.title,
        categories,
        series: [split(true), split(false)].filter((series) =>
          series.points?.some((point) => point.y > 0),
        ),
        formatValue: (value) => `${Math.round(value)}%`,
      };
    }

    case "coverageDiff":
    case "successRateDistribution": {
      const tree = chartData.treeMap as ChartTreeNode | undefined;
      if (!tree) {
        return undefined;
      }
      return {
        kind: "treemap",
        type: chartData.type as ChartModel["type"],
        title: chartData.title,
        series: [],
        tree,
      };
    }

    case "problemsDistribution": {
      const rows = chartData.data as { id: string; data: { x: string; y?: number }[] }[];
      const categories = [...new Set(rows.flatMap((row) => row.data.map((cell) => cell.x)))];

      return {
        kind: "heatmap",
        type: "problemsDistribution",
        title: chartData.title,
        categories,
        series: rows.map((row) => ({
          id: row.id,
          label: row.id,
          points: categories.map((column) => ({
            x: column,
            y: row.data.find((cell) => cell.x === column)?.y ?? 0,
          })),
        })),
        formatValue: (value) => `${Math.round(value * 100)}%`,
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
