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
import type { KitRuntimeManifest, ResolvedTile } from "../types.js";

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

export function withReportLayout(tile: ResolvedTile): ResolvedTile {
  return tile.layout ? tile : { ...tile, layout: REPORT_TILE_LAYOUT };
}

export interface PairedTile<T> {
  chartId: string;
  chartData?: T;
  tile?: ResolvedTile;
}

/**
 * Pair manifest tiles with generated chart data.
 *
 * `charts.json` keeps config order but drops what Allure could not generate —
 * custom panels above all, since their type is unknown upstream. So the walk is
 * positional with a type check: a panel consumes no chart entry, and a mismatch
 * falls back to stock rather than drawing the wrong data.
 */
export function pairTiles<T extends { type?: string }>(
  chartEntries: [string, T][],
  tiles: ResolvedTile[] | undefined,
): PairedTile<T>[] {
  if (!tiles?.length) {
    return chartEntries.map(([chartId, chartData]) => ({ chartId, chartData }));
  }

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
