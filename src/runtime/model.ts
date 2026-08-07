/**
 * Backend-agnostic chart models.
 *
 * A renderer never sees Allure data structures or another backend's option
 * object — only this model. That is what makes "one page, many libraries"
 * possible without per-pair adapters.
 */
import type { KitThemeConfig, ResolvedTile, StatusFamily, TileType } from "../types.js";

export type ChartModelKind = "pie" | "bar" | "line" | "pyramid";

export interface ChartPoint {
  x: string | number;
  y: number;
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
  /** Denominator of the donut centre caption. */
  total?: number;
  unit?: string;
  /** Percentage shown in the middle of a donut; computed when omitted. */
  percentage?: number;
  meta?: Record<string, unknown>;
}

export interface RenderResult {
  /** Status families actually drawn — the source of `dots: "fromSeries"`. */
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
