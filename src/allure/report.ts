/**
 * Glue shared by every fork of an Allure web bundle.
 *
 * The Awesome and Dashboard seams differ only in which store they read and
 * which styles they use; everything below — reading the manifest, owning the
 * runtime singleton, pairing tiles with generated data — is identical, so it
 * lives here instead of being copied into each fork.
 */
import { createKitRuntime, type KitRuntime } from "../runtime/index.js";
import type { ChartModel } from "../runtime/model.js";
import type {
  KitRuntimeManifest,
  ResolvedTile,
  TileLayout,
  TileListKey,
  TileTier,
} from "../types.js";
import { loadPanelModel, toChartModel, type AllureChartData } from "./model.js";

interface KitWindow {
  allureReportKit?: KitRuntimeManifest;
  echarts?: unknown;
  Highcharts?: unknown;
  am5?: unknown;
}

/**
 * Report cells are wide, so a tile without an explicit layout gets 3×2 rather
 * than the standalone 1×1 default — a hard square would be as tall as half the
 * viewport on a desktop grid.
 */
export const REPORT_TILE_LAYOUT = "3x2";

export function readManifest(): KitRuntimeManifest | undefined {
  return typeof window === "undefined" ? undefined : (window as unknown as KitWindow).allureReportKit;
}

/**
 * Tiles a given plugin owns.
 *
 * Awesome renders `options.charts`, Dashboard renders `options.layout`, and the
 * manifest carries whatever the config declared. Without the filter a config that
 * set both for one plugin would draw every tile twice.
 */
export function tilesForList(
  manifest: KitRuntimeManifest | undefined,
  list: TileListKey,
): ResolvedTile[] | undefined {
  const tiles = manifest?.tiles?.filter((tile) => tile.list === list);
  return tiles?.length ? tiles : undefined;
}

/**
 * The model a tile will actually be drawn from.
 *
 * Async because a panel may keep its data in a widget rather than in the
 * manifest — see `loadPanelModel`.
 */
export async function resolveTileModel(
  tile: ResolvedTile,
  chartData: AllureChartData | undefined,
): Promise<ChartModel | undefined> {
  if (tile.panel) {
    return loadPanelModel(tile.panel);
  }
  return chartData ? toChartModel(chartData) : undefined;
}

let runtime: KitRuntime | undefined;

/**
 * Runtime singleton for the report.
 *
 * Backends are read off `window`: the plugin injects only the ones the config
 * uses, so nothing proprietary is bundled and a missing library degrades to the
 * stock widget instead of failing.
 */
export function getKitRuntime(): KitRuntime | undefined {
  const manifest = readManifest();
  if (!manifest) {
    return undefined;
  }
  if (!runtime) {
    const scope = window as unknown as KitWindow;
    runtime = createKitRuntime({
      theme: manifest.theme,
      libs: {
        ...(scope.echarts ? { echarts: scope.echarts } : {}),
        ...(scope.Highcharts ? { highcharts: scope.Highcharts } : {}),
        ...(scope.am5 ? { amcharts: scope.am5 } : {}),
      },
      allowDynamicImport: false,
    });
    runtime.injectTheme();
    runtime.observeTheme();
  }
  return runtime;
}

/** A tile the kit draws itself, as opposed to leaving it to Allure. */
export function isKitOwned(tile: ResolvedTile | undefined): tile is ResolvedTile {
  return Boolean(tile) && tile!.renderer.id !== "stock" && tile!.renderer.id !== "nivo";
}

/**
 * Can the requested backend actually draw this model?
 *
 * Asked before taking the tile over, not after. Inside a report the registry's
 * fallback is a placeholder — the real stock widget is a Preact component the
 * runtime cannot reach — so an unsupported pair (say a treemap on Highcharts)
 * has to stay on Allure's own branch instead of being claimed and dropped.
 */
export function canKitRender(tile: ResolvedTile, model: ChartModel | undefined): boolean {
  if (!model) {
    return false;
  }
  const renderer = getKitRuntime()?.registry.get(tile.renderer.id);
  return Boolean(renderer?.supports(model));
}

/** Tier thresholds by cell width, in px. Below `micro` labels stop fitting. */
const TIERS: [number, TileTier][] = [
  [560, "hero"],
  [320, "regular"],
  [200, "compact"],
];

/**
 * Layout and tier taken from the grid cell instead of the config.
 *
 * The report decides how wide a tile is — the number of columns, the breakpoint,
 * the sidebar — so a hand-written `3x2` is a guess that only holds on one
 * screen. `layout` feeds the aspect ratio of the tile body and the SVG viewBox,
 * so getting it from the real cell is what keeps the pyramid from stretching.
 *
 * Returns `undefined` while the cell has no size yet: on first paint the host is
 * still collapsed, and deriving a layout from zero would bake in a wrong box.
 */
export function cellGeometry(host: HTMLElement): { layout: TileLayout; tier: TileTier } | undefined {
  const { width } = host.getBoundingClientRect();
  if (width < 1) {
    return undefined;
  }
  const rows = 2;
  // Columns are quantised: a continuous ratio would emit a new layout class on
  // every resize and never hit the CSS the design-system ships.
  const cols = Math.min(6, Math.max(1, Math.round((width / 240) * rows)));
  const tier = TIERS.find(([min]) => width >= min)?.[1] ?? "micro";
  return { layout: `${cols}x${rows}`, tier };
}

/**
 * Fill in what the config left open, preferring the measured cell.
 *
 * An explicit `layout` / `tier` in the config still wins — the author asked for
 * it — and without a measurement the wide default stands.
 */
export function withReportLayout(tile: ResolvedTile, host?: HTMLElement): ResolvedTile {
  const measured = host ? cellGeometry(host) : undefined;
  return {
    ...tile,
    layout: tile.layout ?? measured?.layout ?? REPORT_TILE_LAYOUT,
    ...(tile.tier ?? measured?.tier ? { tier: tile.tier ?? measured?.tier } : {}),
  };
}

export interface PairedTile<T> {
  chartId: string;
  chartData?: T;
  tile?: ResolvedTile;
}

/**
 * Pair manifest tiles with generated chart data.
 *
 * Allure keys `charts.json` by a random uuid regenerated per environment
 * section, so the kit plugin re-keys the widget to the stable `chartId` it put on
 * every tile. With that the pairing is a lookup, and a tile the report filtered
 * out or an entry the kit does not own can no longer shift the rest.
 *
 * The positional walk stays as the fallback for a report generated before the
 * re-keying, or by a plugin that is not the kit's.
 */
export function pairTiles<T extends { type?: string }>(
  chartEntries: [string, T][],
  tiles: ResolvedTile[] | undefined,
): PairedTile<T>[] {
  if (!tiles?.length) {
    return chartEntries.map(([chartId, chartData]) => ({ chartId, chartData }));
  }

  const keyed = tiles.some((tile) => tile.chartId !== undefined);
  return keyed ? pairByChartId(chartEntries, tiles) : pairPositionally(chartEntries, tiles);
}

function pairByChartId<T extends { type?: string }>(
  chartEntries: [string, T][],
  tiles: ResolvedTile[],
): PairedTile<T>[] {
  const available = new Map(chartEntries);
  const paired: PairedTile<T>[] = [];

  for (const tile of tiles) {
    if (tile.panel) {
      paired.push({ chartId: `kit-panel-${tile.panel.id}`, tile });
      continue;
    }
    const chartId = tile.chartId;
    const chartData = chartId === undefined ? undefined : available.get(chartId);
    if (chartId === undefined || chartData === undefined) {
      continue; // Allure generated nothing for this tile.
    }
    available.delete(chartId);
    paired.push({ chartId, chartData, tile });
  }

  // Entries no tile claimed — a chart added outside the kit config. Left to Allure.
  for (const [chartId, chartData] of chartEntries) {
    if (available.has(chartId)) {
      paired.push({ chartId, chartData });
    }
  }

  return paired;
}

function pairPositionally<T extends { type?: string }>(
  chartEntries: [string, T][],
  tiles: ResolvedTile[],
): PairedTile<T>[] {
  const paired: PairedTile<T>[] = [];
  let cursor = 0;

  for (const tile of tiles) {
    if (tile.panel) {
      paired.push({ chartId: `kit-panel-${tile.panel.id}`, tile });
      continue;
    }
    const entry = chartEntries[cursor];
    if (!entry) {
      continue;
    }
    cursor += 1;
    const [chartId, chartData] = entry;
    paired.push({ chartId, chartData, tile: chartData?.type === tile.type ? tile : undefined });
  }

  for (; cursor < chartEntries.length; cursor += 1) {
    const [chartId, chartData] = chartEntries[cursor] as [string, T];
    paired.push({ chartId, chartData });
  }

  return paired;
}
