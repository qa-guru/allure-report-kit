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
} from "./types.js";

/** Soft-fork replacements for the upstream UI plugins. */
export const SOFT_FORK_IMPORTS: Record<string, string> = {
  awesome: "@qa-guru/allure-report-kit-awesome",
  dashboard: "@qa-guru/allure-report-kit-dashboard",
};

const TILE_LIST_KEYS = ["charts", "layout"] as const;

const KNOWN_RENDERERS = new Set(["stock", "nivo", "echarts", "highcharts", "amcharts", "svg"]);

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
  return isCustomPanel(tile) ? "fromSeries" : "fromSeries";
}

function tileKey(tile: KitTile, index: number, listKey: string): string {
  const id = isCustomPanel(tile) ? tile.id : tile.type;
  return `${listKey}:${index}:${id}`;
}

function resolveTiles(
  tiles: KitTile[],
  listKey: string,
  pageRenderer: RendererSpec,
  diagnostics: KitDiagnostic[],
): ResolvedTile[] {
  return tiles.map((tile, index) => {
    const renderer = normalizeRenderer(tile.renderer, pageRenderer);
    if (!KNOWN_RENDERERS.has(renderer.id)) {
      diagnostics.push({
        level: "info",
        code: "renderer-unknown",
        message: `${listKey}[${index}]: renderer "${renderer.id}" is not built in — the registry must be extended at runtime, otherwise the tile falls back to stock.`,
      });
    }
    const resolved: ResolvedTile = {
      key: tileKey(tile, index, listKey),
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
 * Wrap an Allure 3 config with the kit.
 *
 * @example
 * export default defineConfig(withKit({
 *   renderer: renderers.echarts(),
 *   theme: theme.qaGuru(),
 *   plugins: { awesome: { options: { charts: presets.lockedQuad() } } },
 * }));
 */
export function withKit<T extends KitConfig>(config: T): Record<string, unknown> {
  const diagnostics: KitDiagnostic[] = [];
  const { renderer, theme: themeInput, softFork = false, plugins, ...rest } = config;

  const pageRenderer = normalizeRenderer(renderer, DEFAULT_RENDERER);
  const theme: KitThemeConfig = themeInput ? mergeTheme(qaGuru(), themeInput) : qaGuru();

  if (theme.header?.enabled && theme.header.source === "design-system") {
    diagnostics.push({
      level: "info",
      code: "theme-header",
      message:
        "theme.header uses the design-system primitive; with singleFile: true every header asset must be inlined (data URI).",
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
      resolvedTiles.push(...resolveTiles(tiles, where, pageRenderer, diagnostics));
    }

    if (resolvedTiles.length > 0) {
      const manifest: KitRuntimeManifest = {
        version: 1,
        renderer: pageRenderer,
        theme,
        tiles: resolvedTiles,
        diagnostics: [],
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
