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
  KitCustomPanel,
  KitPanelData,
  KitSeries,
  PanelKind,
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
  layout?: TileLayout;
  tier?: TileTier;
}

export function custom(options: CustomPanelOptions): KitCustomPanel {
  const { id, kind = "donut", dots = "fromSeries", ...rest } = options;
  const panel: Record<string, unknown> = { type: "custom", id, kind, dots };
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined) {
      panel[key] = value;
    }
  }
  return panel as KitCustomPanel;
}

/** Donut with a `<value> / из <total>` centre caption. */
export function donut(
  options: Omit<CustomPanelOptions, "kind"> & { total?: number; unit?: string },
): KitCustomPanel {
  const { total, unit, data, ...rest } = options;
  const merged: KitPanelData | undefined =
    data ?? (total === undefined ? undefined : { series: [], total });
  if (merged && total !== undefined) {
    merged.total = total;
  }
  if (merged && unit !== undefined) {
    merged.unit = unit;
  }
  return custom({ ...rest, kind: "donut", ...(merged ? { data: merged } : {}) });
}

export function bar(options: Omit<CustomPanelOptions, "kind">): KitCustomPanel {
  return custom({ ...options, kind: "bar" });
}

export function line(options: Omit<CustomPanelOptions, "kind">): KitCustomPanel {
  return custom({ ...options, kind: "line" });
}

export function pyramid(options: Omit<CustomPanelOptions, "kind">): KitCustomPanel {
  return custom({ renderer: "svg", ...options, kind: "pyramid" });
}

/** Series helper — keeps `family` explicit so `dots: "fromSeries"` is exact. */
export function series(items: KitSeries[]): KitPanelData {
  return { series: items };
}
