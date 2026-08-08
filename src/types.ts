/**
 * Public types of @qa-guru/allure-report-kit.
 *
 * Split in two worlds:
 *   config-time — plain data written into allurerc.mjs (no DOM, no chart libs);
 *   runtime     — browser models consumed by renderers (see runtime/model.ts).
 */

/** Allure 3 status families used for tile bar indicators. Fixed priority order. */
export const STATUS_FAMILIES = [
  "red",
  "orange",
  "yellow",
  "purple",
  "gray",
  "green",
  "blue",
] as const;

export type StatusFamily = (typeof STATUS_FAMILIES)[number];

/**
 * `fromSeries` — families actually present in the rendered chart.
 * Explicit list — fixed families.
 * `false` — no `.indicator-row` at all (never three macOS traffic-lights).
 */
export type DotsSpec = "fromSeries" | StatusFamily[] | false;

/** Built-in renderer ids; string stays open for third-party backends. */
export type BuiltinRendererId =
  | "stock"
  | "nivo"
  | "echarts"
  | "highcharts"
  | "amcharts"
  | "svg"
  | "dom";
export type RendererId = BuiltinRendererId | (string & {});

export interface RendererSpec {
  id: RendererId;
  /** Backend-specific options forwarded to the renderer verbatim. */
  options?: Record<string, unknown>;
}

export type RendererRef = RendererId | RendererSpec;

/** Chart types Allure 3 knows (`@allurereport/charts-api` ChartType). */
export type AllureChartType =
  | "currentStatus"
  | "statusDynamics"
  | "statusTransitions"
  | "stabilityDistribution"
  | "testBaseGrowthDynamics"
  | "statusAgePyramid"
  | "durations"
  | "durationDynamics"
  | "testResultSeverities"
  | "testingPyramid"
  | "coverageDiff"
  | "successRateDistribution"
  | "problemsDistribution";

export type TileType = AllureChartType | "custom";

export type TileLayout = `${number}x${number}`;
export type TileTier = "hero" | "regular" | "compact" | "micro";

/** Fields the kit adds on top of an upstream chart option object. */
export interface KitTileExtras {
  renderer?: RendererRef;
  dots?: DotsSpec;
  layout?: TileLayout;
  tier?: TileTier;
}

export interface KitChartTile extends KitTileExtras {
  type: AllureChartType;
  title?: string;
  [option: string]: unknown;
}

export interface KitSeriesPoint {
  x: string | number;
  y: number;
  /** Per-point colour; overrides the series colour for this point only. */
  color?: string;
  family?: StatusFamily;
}

/** One series of a custom panel. `family` wins over `color` for dots. */
export interface KitSeries {
  id: string;
  label?: string;
  value?: number;
  family?: StatusFamily;
  color?: string;
  points?: KitSeriesPoint[];
}

export type PanelKind = "donut" | "bar" | "line" | "pyramid" | "gauge" | "table";

export interface KitPanelData {
  series: KitSeries[];
  /** Denominator for the "из N" caption of donut and gauge panels. */
  total?: number;
  unit?: string;
  /** Column headers of a `table` panel; defaults to label + value. */
  columns?: string[];
}

/** What a panel is grouped by when its data comes from the run itself. */
export type PanelGroupBy = "status" | "layer" | "severity" | `label:${string}`;

/** Metric computed per group by `panels.fromRun`. */
export type PanelMetric = "count" | "passRate" | "duration";

/**
 * Derive panel data from the test results of the run.
 *
 * Resolved by the kit plugin at generation time — it has the store — and shipped
 * as a report widget, so nothing about it reaches the browser as inline config.
 */
export interface KitPanelSource {
  groupBy: PanelGroupBy;
  metric?: PanelMetric;
  /** Keep only the N largest groups; the rest is folded into `other`. */
  limit?: number;
}

export interface KitCustomPanel extends KitTileExtras {
  type: "custom";
  id: string;
  title?: string;
  kind?: PanelKind;
  /** Inline data — for panels not derived from test results. */
  data?: KitPanelData;
  /** Widget JSON fetched by the report at runtime; wins over `data`. */
  dataUrl?: string;
  /** Computed from the run by the plugin, which then sets `dataUrl`. */
  source?: KitPanelSource;
  [option: string]: unknown;
}

export type KitTile = KitChartTile | KitCustomPanel;

export interface KitThemeHeaderConfig {
  enabled?: boolean;
  /** `design-system` — DS header primitive; `none` — stock Allure top bar. */
  source?: "design-system" | "none";
  productName?: string;
  brandHref?: string;
  nav?: Array<{ href: string; label: string; active?: boolean }>;
  /** Keep DS `html.theme-light` and Allure `html[data-theme]` in sync. */
  syncReportTheme?: boolean;
  lang?: "ru" | "en";
}

export type KitTokens = Record<string, string>;

export interface KitThemeConfig {
  id?: string;
  mode?: "light" | "dark" | "auto";
  /** CSS custom properties injected into `:root` — theme independent. */
  tokens?: KitTokens;
  /** Overrides applied under `html[data-theme="light"]`. */
  tokensLight?: KitTokens;
  /** Overrides applied under `html[data-theme="dark"]`. */
  tokensDark?: KitTokens;
  /** Extra stylesheet urls appended after the kit theme. */
  css?: string[];
  tile?: {
    bar?: boolean;
    indicators?: boolean;
    /** `--indicator-mix` in percent; tile canon is 100. */
    indicatorMix?: number;
  };
  header?: KitThemeHeaderConfig;
}

export interface KitPluginOptions {
  charts?: KitTile[];
  layout?: KitTile[];
  [option: string]: unknown;
}

export interface KitPluginConfig {
  import?: string;
  enabled?: boolean;
  options?: KitPluginOptions;
  [key: string]: unknown;
}

export interface KitConfig {
  /** Page default renderer for kit-owned tiles. */
  renderer?: RendererRef;
  theme?: KitThemeConfig;
  /**
   * Rewrite `plugins.*.import` to the kit soft-fork packages.
   * `false` (default) keeps upstream plugins and reports a diagnostic
   * for tiles that need the fork.
   */
  softFork?: boolean;
  plugins?: Record<string, KitPluginConfig>;
  [option: string]: unknown;
}

export type DiagnosticLevel = "info" | "warn";

export interface KitDiagnostic {
  level: DiagnosticLevel;
  code: string;
  message: string;
}

/** Option key a tile was declared under; Awesome reads one, Dashboard the other. */
export type TileListKey = "charts" | "layout";

/** Per-tile resolution result read by the kit web layer. */
export interface ResolvedTile {
  key: string;
  /**
   * Which option list this tile came from.
   *
   * A plugin renders exactly one of them, so both the plugin and the web layer
   * filter on it — otherwise a config that declares `charts` and `layout` for the
   * same plugin would draw every tile twice.
   */
  list: TileListKey;
  type: TileType;
  renderer: RendererSpec;
  dots: DotsSpec;
  layout?: TileLayout;
  tier?: TileTier;
  panel?: KitCustomPanel;
  /**
   * Key this tile has in `widgets/charts.json`.
   *
   * Allure keys chart data by a random uuid, so the kit plugin re-keys the
   * widget to these stable ids. That turns the runtime pairing into a lookup
   * instead of a positional walk. Absent for panels and when the plugin could
   * not align the widget with the config.
   */
  chartId?: string;
}

export interface KitRuntimeManifest {
  version: 1;
  renderer: RendererSpec;
  theme: KitThemeConfig;
  tiles: ResolvedTile[];
  diagnostics: KitDiagnostic[];
}
