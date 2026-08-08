/**
 * Custom panels — kit-owned widget types placed in `charts` / `layout`
 * next to the stock tiles.
 *
 * Stock Allure 3 skips unknown `type` (`generateChartData` ends with
 * `default: break`), so a config with panels stays loadable without the
 * soft-fork — the panel simply does not render, and `withKit` says so.
 */
import type {
  DotsSpec,
  HistoryMetric,
  KitCustomPanel,
  KitPanelData,
  KitPanelSource,
  KitSeries,
  PanelGroupBy,
  PanelKind,
  PanelMetric,
  QualityGateLabels,
  RendererRef,
  TileLayout,
  TileTier,
} from "./types.js";

export interface CustomPanelOptions {
  id: string;
  title?: string;
  kind?: PanelKind;
  renderer?: RendererRef;
  /** Default `fromSeries`: only the families really present in the chart. */
  dots?: DotsSpec;
  data?: KitPanelData;
  dataUrl?: string;
  source?: KitPanelSource;
  layout?: TileLayout;
  tier?: TileTier;
}

/**
 * Kinds only the kit canon can draw, and the renderer that draws them.
 *
 * Without this a `table` would inherit the page default and be dropped — no
 * chart backend draws rows. An explicit `renderer` in the config still wins.
 */
const CANON_RENDERER: Partial<Record<PanelKind, RendererRef>> = {
  pyramid: "svg",
  gauge: "svg",
  table: "dom",
  qualityGate: "dom",
  testsTable: "dom",
};

export function custom(options: CustomPanelOptions): KitCustomPanel {
  const { id, kind = "donut", dots = "fromSeries", ...rest } = options;
  const panel: Record<string, unknown> = { type: "custom", id, kind, dots };
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined) {
      panel[key] = value;
    }
  }
  panel.renderer = rest.renderer ?? CANON_RENDERER[kind];
  if (panel.renderer === undefined) {
    delete panel.renderer;
  }
  return panel as KitCustomPanel;
}

/** Donut with a `<value> / из <total>` centre caption. */
export function donut(
  options: Omit<CustomPanelOptions, "kind"> & { total?: number; unit?: string },
): KitCustomPanel {
  const { total, unit, data, ...rest } = options;
  const merged = withCaption(data, total, unit);
  return custom({ ...rest, kind: "donut", ...(merged ? { data: merged } : {}) });
}

export function bar(options: Omit<CustomPanelOptions, "kind">): KitCustomPanel {
  return custom({ ...options, kind: "bar" });
}

export function line(options: Omit<CustomPanelOptions, "kind">): KitCustomPanel {
  return custom({ ...options, kind: "line" });
}

export function pyramid(options: Omit<CustomPanelOptions, "kind">): KitCustomPanel {
  return custom({ ...options, kind: "pyramid" });
}

/** Arc with a reading in the middle — `series[0].value` out of `total`. */
export function gauge(
  options: Omit<CustomPanelOptions, "kind"> & { total?: number; unit?: string },
): KitCustomPanel {
  const { total, unit, data, ...rest } = options;
  const merged = withCaption(data, total, unit);
  return custom({ ...rest, kind: "gauge", ...(merged ? { data: merged } : {}) });
}

/** Rows with an indicator per row — no chart library draws a table. */
export function table(
  options: Omit<CustomPanelOptions, "kind"> & { columns?: string[] },
): KitCustomPanel {
  const { columns, data, ...rest } = options;
  const merged = columns ? { series: [], ...data, columns } : data;
  return custom({ ...rest, kind: "table", ...(merged ? { data: merged } : {}) });
}

export interface QualityGatePanelOptions
  extends Omit<CustomPanelOptions, "data" | "dataUrl" | "source" | "kind"> {
  labels?: QualityGateLabels;
  lang?: "ru" | "en";
}

/**
 * Quality gate verdict panel — DS `quality-gate` primitive inside a widget tile.
 *
 * Data is computed from the run and `qualityGate.rules` in the config, not
 * scraped from the Allure DOM.
 */
export function qualityGate(options: QualityGatePanelOptions): KitCustomPanel {
  const { labels, lang, dots = false, ...rest } = options;
  return custom({
    ...rest,
    kind: "qualityGate",
    dots,
    ...(labels || lang ? { labels, lang } : {}),
    source: { from: "qualityGate" },
  });
}

/** Tests table — name | status | trend (sparkline) | stability (dots + flaky). */
export function testsTable(
  options: Omit<CustomPanelOptions, "kind" | "data"> & {
    columns?: string[];
    data?: import("./types.js").KitTestsTableData;
  },
): KitCustomPanel {
  const { columns, data, dots = false, ...rest } = options;
  const merged: import("./types.js").KitTestsTableData | undefined =
    columns || data
      ? {
          rows: [],
          ...data,
          ...(columns ? { columns } : {}),
        }
      : data;
  return custom({
    ...rest,
    kind: "testsTable",
    dots,
    ...(merged ? { data: merged as unknown as KitPanelData } : {}),
  });
}

export interface FromRunOptions extends Omit<CustomPanelOptions, "data" | "dataUrl" | "source"> {
  groupBy: PanelGroupBy;
  metric?: PanelMetric;
  /** Keep only the N largest groups; the rest folds into `other`. */
  limit?: number;
  /** Table headers; the rows themselves come from the run. */
  columns?: string[];
  /** Caption denominator; defaults to the number of tests in the run. */
  total?: number;
  unit?: string;
}

export interface FromHistoryOptions
  extends Omit<CustomPanelOptions, "data" | "dataUrl" | "source"> {
  metric?: HistoryMetric;
  /** Keep the N most recent runs; defaults to 10. */
  limit?: number;
  /** One series per status instead of a single line of the metric. */
  splitBy?: "status";
  columns?: string[];
  unit?: string;
}

/**
 * Panel computed from the test results of the run.
 *
 * No data in the config: the kit plugin resolves the grouping against the store
 * at generation time and writes the result as a report widget, so the panel
 * follows the run the same way a stock chart does.
 *
 * Requires the soft-fork — an upstream plugin has no idea what to compute.
 */
export function fromRun(options: FromRunOptions): KitCustomPanel {
  const { groupBy, metric = "count", limit, columns, total, unit, ...rest } = options;
  // Only the presentation travels in `data`; the series are the plugin's job.
  const data: KitPanelData | undefined =
    columns || total !== undefined || unit !== undefined
      ? {
          series: [],
          ...(columns ? { columns } : {}),
          ...(total === undefined ? {} : { total }),
          ...(unit === undefined ? {} : { unit }),
        }
      : undefined;

  return custom({
    ...rest,
    ...(data ? { data } : {}),
    source: { from: "run", groupBy, metric, ...(limit === undefined ? {} : { limit }) },
  });
}

/**
 * Panel over the history of previous runs.
 *
 * Where `fromRun` slices the current run, this reads the points Allure already
 * appends to `historyPath`, so the panel shows a trend rather than a snapshot.
 * Same delivery: the plugin resolves it and ships a widget.
 *
 * Defaults to `line`, because the x axis is runs and a bar chart of ten runs
 * reads as ten categories rather than as a direction.
 */
export function fromHistory(options: FromHistoryOptions): KitCustomPanel {
  const { metric = "passRate", limit, splitBy, columns, unit, kind = "line", ...rest } = options;
  const data: KitPanelData | undefined =
    columns || unit !== undefined
      ? { series: [], ...(columns ? { columns } : {}), ...(unit === undefined ? {} : { unit }) }
      : undefined;

  return custom({
    ...rest,
    kind,
    ...(data ? { data } : {}),
    source: {
      from: "history",
      metric,
      ...(limit === undefined ? {} : { limit }),
      ...(splitBy === undefined ? {} : { splitBy }),
    },
  });
}

/** Series helper — keeps `family` explicit so `dots: "fromSeries"` is exact. */
export function series(items: KitSeries[]): KitPanelData {
  return { series: items };
}

function withCaption(
  data: KitPanelData | undefined,
  total: number | undefined,
  unit: string | undefined,
): KitPanelData | undefined {
  const merged: KitPanelData | undefined =
    data ?? (total === undefined ? undefined : { series: [], total });
  if (!merged) {
    return undefined;
  }
  if (total !== undefined) {
    merged.total = total;
  }
  if (unit !== undefined) {
    merged.unit = unit;
  }
  return merged;
}
