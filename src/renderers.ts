/**
 * Renderer specs used at config time.
 *
 * A spec is inert data — picking `highcharts()` here does not import Highcharts.
 * The browser registry (runtime/registry.ts) resolves the backend lazily and
 * falls back to `stock` when the library is absent.
 *
 * One tile = one renderer. A page may mix them freely.
 */
import type { RendererId, RendererRef, RendererSpec } from "./types.js";

function spec(id: RendererId, options?: Record<string, unknown>): RendererSpec {
  return options ? { id, options } : { id };
}

/** Upstream Allure 3 widget as is — nivo under the hood. */
export function stock(options?: Record<string, unknown>): RendererSpec {
  return spec("stock", options);
}

/** Alias of `stock()`, named after the library upstream actually uses. */
export function nivo(options?: Record<string, unknown>): RendererSpec {
  return spec("nivo", options);
}

/** Highcharts — showcase backend. Licence is the user's responsibility. */
export function highcharts(options?: Record<string, unknown>): RendererSpec {
  return spec("highcharts", options);
}

/** amCharts 5 — adapter interface + spike; falls back until the lib is present. */
export function amcharts(options?: Record<string, unknown>): RendererSpec {
  return spec("amcharts", options);
}

/** Kit-owned SVG canon — no chart library (testing pyramid, gauge). */
export function svg(options?: Record<string, unknown>): RendererSpec {
  return spec("svg", options);
}

/** Kit-owned HTML canon — no chart library (table panels). */
export function dom(options?: Record<string, unknown>): RendererSpec {
  return spec("dom", options);
}

export function normalizeRenderer(ref: RendererRef | undefined, fallback: RendererSpec): RendererSpec {
  if (!ref) {
    return fallback;
  }
  return typeof ref === "string" ? { id: ref } : ref;
}

export const DEFAULT_RENDERER: RendererSpec = { id: "stock" };
