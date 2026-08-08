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
import type { KitCustomPanel, KitPanelData, KitQualityGateData, StatusFamily } from "../types.js";
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

      // One series per status × direction, added upwards and removed downwards,
      // so the stack keeps the status breakdown upstream computed. Empty
      // combinations are dropped rather than stacked as zeroes.
      const direction = (prefix: "new" | "removed", sign: 1 | -1): ChartSeries[] =>
        statuses
          .filter((status) => runs.some((run) => (run[`${prefix}:${status}`] ?? 0) > 0))
          .map((status) => ({
            id: `${prefix}:${status}`,
            label: `${sign > 0 ? "+" : "−"}${status}`,
            color: `var(--ark-status-${status})`,
            family: STATUS_FAMILIES[status],
            points: runs.map((run, index) => ({
              x: categories[index] as string,
              y: sign * (run[`${prefix}:${status}`] ?? 0),
            })),
          }));

      return {
        kind: "bar",
        type: "testBaseGrowthDynamics",
        title: chartData.title,
        categories,
        series: [...direction("new", 1), ...direction("removed", -1)],
      };
    }

    case "stabilityDistribution": {
      const groups = chartData.data as { id: string; stabilityRate: number }[];
      const keys = chartData.keys ?? {};
      const threshold = (chartData.threshold as number) ?? 100;
      const categories = groups.map((group) => keys[group.id] ?? group.id);

      // The threshold is a property of the group, not of a series: one bar per
      // group, coloured per point. Splitting it in two series used to leave a
      // gap in the axis for every group that belonged to the other half.
      return {
        kind: "bar",
        type: "stabilityDistribution",
        title: chartData.title,
        categories,
        series: [
          {
            id: "stabilityRate",
            label: `stability, threshold ${threshold}%`,
            points: groups.map((group, index) => {
              const stable = group.stabilityRate >= threshold;
              return {
                x: categories[index] as string,
                y: group.stabilityRate,
                color: stable ? "var(--ark-status-passed)" : "var(--ark-status-failed)",
                family: stable ? ("green" as const) : ("red" as const),
              };
            }),
          },
        ],
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

/** Panel kind → model kind. Only `donut` is renamed; the rest map through. */
function panelModelKind(panel: KitCustomPanel): ChartModel["kind"] {
  if (panel.kind === "qualityGate") {
    return "qualityGate";
  }
  return panel.kind === "donut" || panel.kind === undefined
    ? "pie"
    : (panel.kind as ChartModel["kind"]);
}

function asQualityGateData(
  panel: KitCustomPanel,
  payload: KitPanelData | KitQualityGateData | undefined,
): KitQualityGateData | undefined {
  if (!payload || !("rules" in payload)) {
    return undefined;
  }
  const qg = payload as KitQualityGateData;
  const labels = (panel.labels as KitQualityGateData["labels"]) ?? qg.labels;
  const lang = (panel.lang as KitQualityGateData["lang"]) ?? qg.lang;
  const title = panel.title ?? qg.title;
  const barTitle = qg.barTitle ?? title;
  return {
    passed: Boolean(qg.passed),
    rules: qg.rules ?? [],
    ...(qg.kind ? { kind: qg.kind } : {}),
    ...(qg.testId ? { testId: qg.testId } : {}),
    ...(title ? { title } : {}),
    ...(barTitle ? { barTitle } : {}),
    ...(qg.config ? { config: qg.config } : {}),
    ...(qg.infoPayload ? { infoPayload: qg.infoPayload } : {}),
    ...(labels ? { labels } : {}),
    ...(lang ? { lang } : {}),
  };
}

function panelModel(panel: KitCustomPanel, data: KitPanelData | KitQualityGateData | undefined): ChartModel {
  if (panel.kind === "qualityGate") {
    return {
      kind: "qualityGate",
      type: "custom",
      title: panel.title,
      series: [],
      qualityGate: asQualityGateData(panel, data),
    };
  }
  const panelData = data as KitPanelData | undefined;
  return {
    kind: panelModelKind(panel),
    type: "custom",
    title: panel.title,
    total: panelData?.total,
    unit: panelData?.unit,
    columns: panelData?.columns,
    // Panels over runs carry points instead of a scalar, and a bar or line
    // without categories has no axis to hang them on.
    categories: panelData?.categories,
    series: panelData?.series ?? [],
  };
}

/**
 * Custom panels are absent from charts.json — Allure skips their type — so their
 * data comes from the manifest.
 */
export function toPanelModel(panel: KitCustomPanel): ChartModel {
  return panelModel(panel, panel.data);
}

/**
 * Panel model including data the report fetches at runtime.
 *
 * `dataUrl` is how a panel avoids inlining its data into `index.html`: panels
 * derived from the run are computed by the plugin and written as a widget, and
 * the url is relative to the report root, like every other widget. A failed
 * fetch falls back to the inline data rather than blanking the tile.
 */
export async function loadPanelModel(panel: KitCustomPanel): Promise<ChartModel> {
  if (!panel.dataUrl) {
    return toPanelModel(panel);
  }
  try {
    const response = await fetch(panel.dataUrl);
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    const payload = (await response.json()) as KitPanelData | KitQualityGateData;
    return panelModel(panel, payload);
  } catch (error) {
    console.warn(
      `allure-report-kit: panel "${panel.id}" could not load ${panel.dataUrl} (${error}) — using inline data`,
    );
    return toPanelModel(panel);
  }
}
