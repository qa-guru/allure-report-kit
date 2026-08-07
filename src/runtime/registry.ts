/**
 * Renderer registry — the seam that replaces the upstream
 * `getChartWidgetByType` switch in web-awesome.
 *
 * Contract:
 *   one tile = one renderer;
 *   a page may mix renderers freely;
 *   a renderer that cannot draw a model never throws — the registry falls back
 *   to `stock` and records why.
 */
import type { ChartModel, ChartRenderer, RenderContext, RenderResult } from "./model.js";

export type LibResolver = (name: string) => Promise<unknown | undefined>;

export interface RegistryOptions {
  renderers?: ChartRenderer[];
  fallbackId?: string;
  resolveLib?: LibResolver;
}

export interface LibResolverOptions {
  /**
   * Fall back to `import("<bare specifier>")` when the library was neither
   * injected nor found on `globalThis`. Turn it off in shells without an
   * import map — a rejected dynamic import is caught, but skipping it keeps
   * the console clean.
   */
  allowDynamicImport?: boolean;
  /** Override the bare specifier used per library name. */
  specifiers?: Record<string, string>;
}

/**
 * Resolve an optional chart library: injected instance → global → bare import.
 * The bare specifier is what an import map in the report shell hooks into.
 */
export function createLibResolver(
  preloaded: Record<string, unknown> = {},
  options: LibResolverOptions = {},
): LibResolver {
  const globals: Record<string, string> = {
    echarts: "echarts",
    highcharts: "Highcharts",
    amcharts: "am5",
  };
  const specifiers: Record<string, string> = {
    echarts: "echarts",
    highcharts: "highcharts",
    amcharts: "@amcharts/amcharts5",
    "amcharts/percent": "@amcharts/amcharts5/percent",
    ...options.specifiers,
  };
  const allowDynamicImport = options.allowDynamicImport !== false;
  const cache = new Map<string, unknown | undefined>();

  return async (name) => {
    if (cache.has(name)) {
      return cache.get(name);
    }
    let resolved: unknown | undefined = preloaded[name];

    if (!resolved) {
      const globalName = globals[name];
      const scope = globalThis as Record<string, unknown>;
      if (globalName && scope[globalName]) {
        resolved = scope[globalName];
      }
    }

    if (!resolved && allowDynamicImport) {
      const specifier = specifiers[name] ?? name;
      try {
        const module = (await import(/* @vite-ignore */ specifier)) as Record<string, unknown>;
        resolved = (module.default as unknown) ?? module;
      } catch {
        resolved = undefined;
      }
    }

    cache.set(name, resolved);
    return resolved;
  };
}

export class RendererRegistry {
  readonly resolveLib: LibResolver;

  private readonly renderers = new Map<string, ChartRenderer>();

  private readonly fallbackId: string;

  constructor(options: RegistryOptions = {}) {
    this.fallbackId = options.fallbackId ?? "stock";
    this.resolveLib = options.resolveLib ?? createLibResolver();
    for (const renderer of options.renderers ?? []) {
      this.register(renderer);
    }
  }

  register(renderer: ChartRenderer): this {
    this.renderers.set(renderer.id, renderer);
    return this;
  }

  has(id: string): boolean {
    return this.renderers.has(id);
  }

  get(id: string): ChartRenderer | undefined {
    return this.renderers.get(id) ?? this.renderers.get(aliasOf(id) ?? "");
  }

  ids(): string[] {
    return [...this.renderers.keys()];
  }

  /** Pick the renderer that will actually draw the model. */
  resolve(id: string, model: ChartModel): { renderer: ChartRenderer; note?: string } | undefined {
    const requested = this.get(id);
    if (requested?.supports(model)) {
      return { renderer: requested };
    }
    const fallback = this.get(this.fallbackId);
    if (!fallback) {
      return undefined;
    }
    const reason = requested
      ? `renderer "${id}" does not support ${model.kind}`
      : `renderer "${id}" is not registered`;
    return { renderer: fallback, note: reason };
  }

  async render(id: string, context: RenderContext): Promise<RenderResult> {
    const picked = this.resolve(id, context.model);
    if (!picked) {
      return { families: [], renderedBy: "none", note: `no renderer for "${id}"` };
    }
    const result = await picked.renderer.render(context);
    return picked.note ? { ...result, note: picked.note } : result;
  }
}

function aliasOf(id: string): string | undefined {
  return id === "nivo" ? "stock" : undefined;
}
