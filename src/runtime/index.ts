/**
 * Browser runtime — `@qa-guru/allure-report-kit/runtime`.
 *
 * Mounts a kit tile: design-system shell, one renderer, bar indicators derived
 * from what was actually drawn. Used both by the soft-fork web layer and by the
 * standalone dogfood page.
 */
import { themeToCss } from "../theme.js";
import type { KitThemeConfig, ResolvedTile, StatusFamily } from "../types.js";
import { resolveDots, syncIndicatorRow } from "./indicators.js";
import type { ChartModel, ChartRenderer, RenderContext, RenderResult } from "./model.js";
import { RendererRegistry, createLibResolver } from "./registry.js";
import { amchartsRenderer } from "./renderers/amcharts.js";
import { domRenderer } from "./renderers/dom.js";
import { highchartsRenderer } from "./renderers/highcharts.js";
import { stockRenderer } from "./renderers/stock.js";
import { svgRenderer } from "./renderers/svg.js";
import { adoptTile, applyTileGeometry, createTile, type TileElements } from "./tile.js";

export interface KitRuntimeOptions {
  theme?: KitThemeConfig;
  /** Extra or replacement renderers, merged after the built-ins. */
  renderers?: ChartRenderer[];
  /** Pre-imported chart libraries, keyed as `highcharts` / `amcharts`. */
  libs?: Record<string, unknown>;
  /** Let the resolver `import()` a missing library by bare specifier. */
  allowDynamicImport?: boolean;
  fallbackId?: string;
}

export interface MountTileOptions {
  tile: ResolvedTile;
  model: ChartModel;
  title?: string;
  /** Parent for a freshly created tile. Ignored when `element` is given. */
  container?: HTMLElement;
  /** Existing `.widget-tile` markup to reuse. */
  element?: HTMLElement;
  rendererOptions?: Record<string, unknown>;
}

export interface MountedTile {
  elements: TileElements;
  result: RenderResult;
  families: StatusFamily[];
}

interface MountRecord {
  options: MountTileOptions;
  elements: TileElements;
}

const VAR_PATTERN = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/;

function builtinRenderers(): ChartRenderer[] {
  return [
    stockRenderer,
    svgRenderer,
    domRenderer,
    highchartsRenderer,
    amchartsRenderer,
  ];
}

export class KitRuntime {
  readonly registry: RendererRegistry;

  readonly theme: KitThemeConfig;

  private readonly mounts: MountRecord[] = [];

  private themeObserver?: MutationObserver;

  constructor(options: KitRuntimeOptions = {}) {
    this.theme = options.theme ?? {};
    this.registry = new RendererRegistry({
      renderers: [...builtinRenderers(), ...(options.renderers ?? [])],
      fallbackId: options.fallbackId ?? "stock",
      resolveLib: createLibResolver(options.libs ?? {}, {
        allowDynamicImport: options.allowDynamicImport,
      }),
    });
  }

  /** Append the theme tokens as a `<style>` element; returns it for cleanup. */
  injectTheme(target: ParentNode = document.head): HTMLStyleElement {
    const style = document.createElement("style");
    style.dataset.arkTheme = this.theme.id ?? "kit";
    style.textContent = themeToCss(this.theme);
    target.append(style);
    return style;
  }

  private cssVarReader(host: HTMLElement): (name: string, fallback?: string) => string {
    return (name, fallback = "") => {
      const value = getComputedStyle(host).getPropertyValue(name).trim();
      return value || fallback;
    };
  }

  /** Turn `var(--token, fallback)` into a literal colour canvas backends accept. */
  private resolveColors(model: ChartModel, host: HTMLElement): ChartModel {
    const read = this.cssVarReader(host);
    const resolve = (color: string | undefined): string | undefined => {
      if (!color) {
        return undefined;
      }
      const match = VAR_PATTERN.exec(color.trim());
      if (!match?.[1]) {
        return color;
      }
      return read(match[1], match[2]?.trim() ?? "");
    };
    return {
      ...model,
      series: model.series.map((series) => {
        const color = resolve(series.color);
        // Points carry colours too whenever the meaning is per value rather than
        // per series, and a canvas backend needs the literal just the same.
        const points = series.points?.map((point) => {
          const pointColor = resolve(point.color);
          return pointColor === undefined ? point : { ...point, color: pointColor };
        });
        return {
          ...series,
          ...(color === undefined ? {} : { color }),
          ...(points === undefined ? {} : { points }),
        };
      }),
    };
  }

  async mountTile(options: MountTileOptions): Promise<MountedTile> {
    const { tile, model } = options;

    const elements = options.element
      ? (adoptTile(options.element) ??
        createTile({
          title: options.title ?? model.title,
          layout: tile.layout,
          tier: tile.tier,
          bar: model.kind === "qualityGate" ? false : this.theme.tile?.bar !== false,
        }))
      : createTile({
          title: options.title ?? model.title,
          layout: tile.layout,
          tier: tile.tier,
          bar:
            model.kind === "qualityGate"
              ? false
              : this.theme.tile?.bar !== false,
        });

    if (!options.element && options.container) {
      options.container.append(elements.root);
    } else if (options.element && elements.root !== options.element) {
      // Adoption failed and a fresh tile was built — replace, never nest.
      options.element.replaceWith(elements.root);
    } else if (options.element && !elements.root.isConnected && options.container) {
      options.container.replaceChildren(elements.root);
    }

    // Re-applied rather than set at creation: an adopted tile is being redrawn
    // because its cell changed size, and the geometry is the reason.
    applyTileGeometry(elements.root, { layout: tile.layout, tier: tile.tier });

    if (model.kind === "qualityGate") {
      elements.root.classList.add("widget-tile--quality-gate");
      if (elements.bar.isConnected) {
        elements.bar.remove();
      }
    } else {
      elements.root.classList.remove("widget-tile--quality-gate");
    }

    elements.root.dataset.arkTile = tile.key;
    elements.root.dataset.arkRenderer = tile.renderer.id;

    const resolvedModel = this.resolveColors(model, elements.body);
    const context: RenderContext = {
      host: elements.body,
      model: resolvedModel,
      tile,
      theme: this.theme,
      options: { ...tile.renderer.options, ...options.rendererOptions },
      resolveLib: this.registry.resolveLib,
      cssVar: this.cssVarReader(elements.body),
      isDark: () => document.documentElement.dataset.theme === "dark",
    };

    const result = await this.registry.render(tile.renderer.id, context);
    elements.root.dataset.arkRenderedBy = result.renderedBy;

    const families =
      this.theme.tile?.indicators === false ? [] : resolveDots(tile.dots, result.families);
    syncIndicatorRow(elements.bar, families);

    if (!this.mounts.some((record) => record.elements.root === elements.root)) {
      this.mounts.push({ options, elements });
    }

    return { elements, result, families };
  }

  /**
   * Re-render every mounted tile.
   *
   * Canvas and SVG backends read CSS custom properties once, at draw time, so a
   * theme switch has to redraw them — unlike the stock nivo widgets, which are
   * re-rendered by Allure's own theme store.
   */
  async refresh(): Promise<void> {
    const records = [...this.mounts];
    await Promise.all(
      records.map((record) => this.mountTile({ ...record.options, element: record.elements.root })),
    );
  }

  /** Redraw tiles when the report or the DS header flips the theme. */
  observeTheme(): () => void {
    if (typeof MutationObserver === "undefined") {
      return () => {};
    }
    this.themeObserver?.disconnect();

    const html = document.documentElement;
    let last = `${html.dataset.theme ?? ""}|${html.className}`;
    let pending = false;

    this.themeObserver = new MutationObserver(() => {
      const next = `${html.dataset.theme ?? ""}|${html.className}`;
      if (next === last || pending) {
        return;
      }
      last = next;
      pending = true;
      // Let the browser recompute custom properties before reading them back.
      requestAnimationFrame(() => {
        pending = false;
        void this.refresh();
      });
    });
    this.themeObserver.observe(html, { attributes: true, attributeFilter: ["class", "data-theme"] });

    return () => this.themeObserver?.disconnect();
  }
}

export function createKitRuntime(options: KitRuntimeOptions = {}): KitRuntime {
  return new KitRuntime(options);
}

export { RendererRegistry, createLibResolver } from "./registry.js";
export { resolveDots, syncIndicatorRow } from "./indicators.js";
export { createTile, adoptTile, applyTileGeometry } from "./tile.js";
export { mountReportHeader } from "./header.js";
export {
  buildQualityGateInfoPayload,
  formatQualityGateRuleFormula,
  resolveQualityGateRuleExpected,
  renderQualityGate,
  renderQualityGateHost,
  resolveQualityGateFileSource,
} from "./quality-gate-render.js";
export {
  buildSonarQualityGateInfoPayload,
  renderSonarQualityGate,
  sonarProjectStatusToQualityGateOptions,
} from "./sonar-quality-gate.js";
export {
  QUALITY_GATE_FIXTURE_IDS,
  isKitQualityGateData,
  parseKitQualityGateData,
} from "../quality-gate/parse.js";
export type { QualityGateFixtureId } from "../quality-gate/parse.js";
export {
  buildQualityGateLayout,
  QUALITY_GATE_LAYOUT_METRICS,
  QUALITY_GATE_LAYOUT_TOKENS,
} from "../quality-gate/layout/index.js";
export type {
  BuildQualityGateLayoutOptions,
  QualityGateColorMix,
  QualityGateLayout,
  QualityGateLayoutBar,
  QualityGateLayoutBody,
  QualityGateLayoutFailedBody,
  QualityGateLayoutInput,
  QualityGateLayoutMetrics,
  QualityGateLayoutPassedBody,
  QualityGateLayoutRuleRow,
  QualityGateLayoutTokens,
  QualityGatePaintColor,
  QualityGateTokenRef,
} from "../quality-gate/layout/index.js";
export { createQgInfo, collectQgInfoDeviationLiterals } from "./qg-info.js";
export { stockRenderer, createStockRenderer } from "./renderers/stock.js";
export { svgRenderer } from "./renderers/svg.js";
export { domRenderer } from "./renderers/dom.js";
export { highchartsRenderer } from "./renderers/highcharts.js";
export { amchartsRenderer } from "./renderers/amcharts.js";
export { familiesOf } from "./families.js";
export {
  FAMILY_ANCHORS,
  LAYER_FAMILIES,
  LAYER_TOKENS,
  STATUS_FAMILY,
  STATUS_TOKENS,
  familyForColor,
  orderFamilies,
  paintedColors,
  sameColor,
} from "./palette.js";

export type {
  ChartModel,
  ChartModelKind,
  ChartPoint,
  ChartRenderer,
  ChartSeries,
  RenderContext,
  RenderResult,
} from "./model.js";
export type { TileElements } from "./tile.js";
export type { HeaderHandle, MountHeaderOptions } from "./header.js";
