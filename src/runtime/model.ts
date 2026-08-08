/**
 * Backend-agnostic chart models.
 *
 * A renderer never sees Allure data structures or another backend's option
 * object — only this model. That is what makes "one page, many libraries"
 * possible without per-pair adapters.
 */
import type { KitThemeConfig, ResolvedTile, StatusFamily, TileType } from "../types.js";

export type ChartModelKind =
  | "pie"
  | "bar"
  | "line"
  | "pyramid"
  | "treemap"
  | "heatmap"
  | "gauge"
  | "table";

/**
 * Hierarchy for treemap charts. `colorValue` is a 0..1 quality score — the
 * renderer turns it into a colour so the ramp follows the theme.
 */
export interface ChartTreeNode {
  id: string;
  value?: number;
  colorValue?: number;
  children?: ChartTreeNode[];
}

export interface ChartPoint {
  x: string | number;
  y: number;
  /**
   * Colour of this point alone.
   *
   * Needed whenever the meaning lives in the value rather than in the series —
   * `stabilityDistribution` colours each group by its own threshold, and one
   * series with coloured points reads better than two half-empty ones.
   */
  color?: string;
  family?: StatusFamily;
}

export interface ChartSeries {
  id: string;
  label?: string;
  /** Scalar value — pie slices, single bars. */
  value?: number;
  /** Status family for the tile bar indicators; wins over `color`. */
  family?: StatusFamily;
  /** CSS colour or a `var(--token)` reference. */
  color?: string;
  /** Series points — line charts, grouped bars. */
  points?: ChartPoint[];
}

export interface ChartModel {
  kind: ChartModelKind;
  /** Allure chart type, or `custom` for a kit panel. */
  type: TileType;
  title?: string;
  series: ChartSeries[];
  /** X categories for bar charts. */
  categories?: string[];
  /** Denominator of the donut centre caption; upper bound of a gauge. */
  total?: number;
  unit?: string;
  /** Column headers of a `table` model. */
  columns?: string[];
  /** Percentage shown in the middle of a donut; computed when omitted. */
  percentage?: number;
  /** Hierarchy for `treemap`; `series` stays empty for that kind. */
  tree?: ChartTreeNode;
  /** Formats a cell/leaf value for tooltips and labels. */
  formatValue?: (value: number) => string;
  meta?: Record<string, unknown>;
}

export interface RenderResult {
  /**
   * Status families actually drawn — the source of `dots: "fromSeries"`.
   *
   * "Actually" is literal: renderers derive this through `familiesOf`, which
   * drops a family whose colour never made it onto the canvas.
   */
  families: StatusFamily[];
  /** Renderer that produced the tile; differs from the request on fallback. */
  renderedBy: string;
  note?: string;
}

export interface RenderContext {
  host: HTMLElement;
  model: ChartModel;
  tile: ResolvedTile;
  theme: KitThemeConfig;
  options: Record<string, unknown>;
  /** Lazily resolve an optional chart library; `undefined` when absent. */
  resolveLib: (name: string) => Promise<unknown | undefined>;
  /** Read a CSS custom property off the tile, resolving `var(--x)` chains. */
  cssVar: (name: string, fallback?: string) => string;
  isDark: () => boolean;
}

export interface ChartRenderer {
  id: string;
  supports: (model: ChartModel) => boolean;
  render: (context: RenderContext) => Promise<RenderResult>;
  destroy?: (host: HTMLElement) => void;
}
