/**
 * `withKit` — the single config-time entry point.
 *
 * Takes an Allure 3 config extended with `renderer` / `theme` / `softFork`,
 * returns a plain Allure config where every kit tile carries a resolved
 * renderer, and every touched plugin gets an `options.kit` manifest that the
 * kit web layer reads at report runtime.
 *
 * Nothing here imports a chart library or touches the DOM.
 */
import { DEFAULT_RENDERER, normalizeRenderer } from "./renderers.js";
import { isLockedQuad } from "./presets.js";
import { mergeTheme, qaGuru } from "./theme.js";
import type {
  DotsSpec,
  KitConfig,
  KitCustomPanel,
  KitDiagnostic,
  KitPluginConfig,
  KitRuntimeManifest,
  KitThemeConfig,
  KitTile,
  RendererSpec,
  ResolvedTile,
  TileListKey,
} from "./types.js";

/** Soft-fork replacements for the upstream UI plugins. */
export const SOFT_FORK_IMPORTS: Record<string, string> = {
  awesome: "@qa-guru/allure-report-kit-awesome",
  dashboard: "@qa-guru/allure-report-kit-dashboard",
};

const TILE_LIST_KEYS = ["charts", "layout"] as const;

const KNOWN_RENDERERS = new Set([
  "stock",
  "nivo",
  "highcharts",
  "amcharts",
  "svg",
  "dom",
]);

/**
 * Stable key a chart tile gets in `widgets/charts.json`.
 *
 * Upstream keys the widget by `randomUUID()`, regenerated for every environment
 * section, which leaves the browser nothing to match on. The plugin re-keys the
 * widget to these ids; the index is the tile's position inside the list the
 * plugin consumes (`charts` for Awesome, `layout` for Dashboard), which is the
 * order upstream iterates.
 */
export function chartIdFor(listKey: string, index: number): string {
  return `ark-${listKey}-${index}`;
}

export interface WithKitResult {
  diagnostics: KitDiagnostic[];
}

function isCustomPanel(tile: KitTile): tile is KitCustomPanel {
  return tile.type === "custom";
}

function defaultDots(tile: KitTile): DotsSpec {
  if (tile.dots !== undefined) {
    return tile.dots;
  }
  return "fromSeries";
}

function tileKey(tile: KitTile, index: number, listKey: string): string {
  const id = isCustomPanel(tile) ? tile.id : tile.type;
  return `${listKey}:${index}:${id}`;
}

function resolveTiles(
  tiles: KitTile[],
  listKey: TileListKey,
  where: string,
  pageRenderer: RendererSpec,
  diagnostics: KitDiagnostic[],
): ResolvedTile[] {
  return tiles.map((tile, index) => {
    const renderer = normalizeRenderer(tile.renderer, pageRenderer);
    if (!KNOWN_RENDERERS.has(renderer.id)) {
      diagnostics.push({
        level: "info",
        code: "renderer-unknown",
        message: `${where}[${index}]: renderer "${renderer.id}" is not built in — the registry must be extended at runtime, otherwise the tile falls back to stock.`,
      });
    }
    const resolved: ResolvedTile = {
      key: tileKey(tile, index, where),
      list: listKey,
      type: tile.type,
      renderer,
      dots: defaultDots(tile),
    };
    if (tile.layout !== undefined) {
      resolved.layout = tile.layout;
    }
    if (tile.tier !== undefined) {
      resolved.tier = tile.tier;
    }
    if (isCustomPanel(tile)) {
      resolved.panel = tile;
    } else {
      resolved.chartId = chartIdFor(listKey, index);
    }
    return resolved;
  });
}

function checkLockedQuad(tiles: KitTile[], where: string, diagnostics: KitDiagnostic[]): void {
  if (tiles.length === 0) {
    return;
  }
  if (!isLockedQuad(tiles)) {
    diagnostics.push({
      level: "warn",
      code: "locked-quad",
      message: `${where}: indices 0–3 do not match the locked 2×2 of ADR 006 (currentStatus | durationDynamics / testingPyramid | durations groupBy:layer). Run validate-allurerc.mjs.`,
    });
  }
}

function checkPanelsNeedFork(
  tiles: KitTile[],
  where: string,
  softFork: boolean,
  diagnostics: KitDiagnostic[],
): void {
  if (softFork) {
    return;
  }
  const panels = tiles.filter(isCustomPanel);
  if (panels.length > 0) {
    diagnostics.push({
      level: "warn",
      code: "panels-need-soft-fork",
      message: `${where}: ${panels.length} custom panel(s) require the kit plugin. Stock Allure 3 skips unknown chart types, so they will not render. Set softFork: true or declare plugins.*.import yourself.`,
    });
  }
}

/**
 * `panels.fromRun` and `panels.fromHistory` need the plugin: their data is
 * computed against the store at generation time, and an upstream plugin knows
 * nothing about it.
 */
function checkRunPanelsNeedFork(
  tiles: KitTile[],
  where: string,
  softFork: boolean,
  diagnostics: KitDiagnostic[],
): void {
  if (softFork) {
    return;
  }
  const derived = tiles.filter((tile) => isCustomPanel(tile) && tile.source);
  if (derived.length > 0) {
    diagnostics.push({
      level: "warn",
      code: "run-panels-need-soft-fork",
      message: `${where}: ${derived.length} panel(s) derive their data from the run or its history, which only the kit plugin computes. Set softFork: true, or give the panel inline data / a dataUrl.`,
    });
  }
}

/**
 * Wrap an Allure 3 config with the kit.
 *
 * @example
 * export default defineConfig(withKit({
 *   renderer: renderers.stock(),
 *   theme: theme.qaGuru(),
 *   plugins: { awesome: { options: { charts: presets.lockedQuad() } } },
 * }));
 */
export function withKit<T extends KitConfig>(config: T): Record<string, unknown> {
  const diagnostics: KitDiagnostic[] = [];
  const { renderer, theme: themeInput, softFork = false, plugins, ...rest } = config;

  const pageRenderer = normalizeRenderer(renderer, DEFAULT_RENDERER);
  const theme: KitThemeConfig = themeInput ? mergeTheme(qaGuru(), themeInput) : qaGuru();

  // The header is mounted by the forked bundle, so without the fork the option
  // is silently inert — worth saying, unlike the fact that it is enabled.
  if (theme.header?.enabled && theme.header.source === "design-system" && !softFork) {
    diagnostics.push({
      level: "warn",
      code: "header-needs-soft-fork",
      message:
        "theme.header is on but softFork is not: the design-system header is mounted by the kit web bundle, so the report will keep Allure's own top bar. Set softFork: true or declare plugins.*.import yourself.",
    });
  }

  const outputPlugins: Record<string, KitPluginConfig> = {};

  for (const [name, pluginConfig] of Object.entries(plugins ?? {})) {
    const nextPlugin: KitPluginConfig = { ...pluginConfig };
    const options = { ...(pluginConfig.options ?? {}) };
    const resolvedTiles: ResolvedTile[] = [];

    for (const listKey of TILE_LIST_KEYS) {
      const tiles = options[listKey] as KitTile[] | undefined;
      if (!Array.isArray(tiles)) {
        continue;
      }
      const where = `plugins.${name}.options.${listKey}`;
      checkLockedQuad(tiles, where, diagnostics);
      checkPanelsNeedFork(tiles, where, softFork, diagnostics);
      checkRunPanelsNeedFork(tiles, where, softFork, diagnostics);
      resolvedTiles.push(...resolveTiles(tiles, listKey, where, pageRenderer, diagnostics));
    }

    if (options.singleFile) {
      diagnostics.push({
        level: "info",
        code: "single-file",
        message: `plugins.${name}.options.singleFile is on — the kit inlines its assets (fork bundle, chart backends, design-system header) into the document, and panel data travels in the manifest instead of a widget. Expect a large HTML file.`,
      });
    }

    if (resolvedTiles.length > 0) {
      const manifest: KitRuntimeManifest = {
        version: 1,
        renderer: pageRenderer,
        theme,
        tiles: resolvedTiles,
        diagnostics: [],
        ...(config.qualityGate || (config as Record<string, unknown>).knownIssuesPath
          ? {
              qualityGate: {
                rules:
                  ((config.qualityGate as { rules?: Array<Record<string, unknown>> } | undefined)
                    ?.rules ?? []) as Array<Record<string, unknown>>,
                knownIssuesPath: (config as Record<string, unknown>).knownIssuesPath as
                  | string
                  | undefined,
              },
            }
          : {}),
      };
      options.kit = manifest;
    }

    if (Object.keys(options).length > 0) {
      nextPlugin.options = options;
    }

    if (softFork && SOFT_FORK_IMPORTS[name]) {
      if (pluginConfig.import && pluginConfig.import !== SOFT_FORK_IMPORTS[name]) {
        diagnostics.push({
          level: "info",
          code: "import-kept",
          message: `plugins.${name}.import is set explicitly ("${pluginConfig.import}") — withKit leaves it as is.`,
        });
      } else {
        nextPlugin.import = SOFT_FORK_IMPORTS[name];
      }
    }

    outputPlugins[name] = nextPlugin;
  }

  const output: Record<string, unknown> = { ...rest };
  if (Object.keys(outputPlugins).length > 0) {
    output.plugins = outputPlugins;
  }

  for (const plugin of Object.values(outputPlugins)) {
    const manifest = plugin.options?.kit as KitRuntimeManifest | undefined;
    if (manifest) {
      manifest.diagnostics = diagnostics;
    }
  }

  reportDiagnostics(diagnostics);
  return output;
}

function reportDiagnostics(diagnostics: KitDiagnostic[]): void {
  // withKit also runs in the browser (dogfood, fork dev shell) — no `process`.
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  if (env?.env?.ALLURE_REPORT_KIT_SILENT === "1") {
    return;
  }
  for (const diagnostic of diagnostics) {
    const line = `allure-report-kit [${diagnostic.code}] ${diagnostic.message}`;
    if (diagnostic.level === "warn") {
      console.warn(line);
    } else {
      console.info(line);
    }
  }
}
