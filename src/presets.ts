/**
 * Presets — ready tile groups from declarative preset configs.
 *
 * SSOT for the overview quad: `presets/overview-preset.mjs` (importable as
 * `@qa-guru/allure-report-kit/presets/overview-preset`). Ethalon copies or
 * re-exports it from `allure/overview-preset.mjs` next to awesome-charts.mjs.
 */
import * as charts from "./charts.js";
import type { KitChartTile, RendererRef } from "./types.js";

/** Canon layer order, bottom to top. */
export const PYRAMID_LAYERS = [
  "unit",
  "component",
  "integration",
  "api",
  "e2e",
  "manual",
] as const;

export type OverviewChart =
  | "currentStatus"
  | "durationDynamics"
  | "testingPyramid"
  | "durations";

export interface OverviewTileSpec {
  chart: OverviewChart;
  limit?: number;
  groupBy?: string;
  layersKey?: string;
}

export interface OverviewQualityGateSpec {
  id: string;
  layout?: string;
}

export interface OverviewPreset {
  id: string;
  qualityGates?: readonly OverviewQualityGateSpec[];
  tiles: OverviewTileSpec[];
  renderers?: Partial<Record<OverviewChart, RendererRef>>;
  titles?: Partial<Record<OverviewChart, string>>;
  pyramidLayers?: readonly string[];
}

export interface FromOverviewOptions {
  preset?: OverviewPreset;
  layers?: string[];
  limit?: number;
  titles?: Partial<Record<OverviewChart, string>>;
  renderers?: Partial<Record<OverviewChart, RendererRef>>;
  filter?: (testResult: unknown) => boolean;
}

const DEFAULT_TITLES: Record<OverviewChart, string> = {
  currentStatus: "Текущий статус",
  durationDynamics: "Динамика длительности",
  testingPyramid: "Пирамида тестирования",
  durations: "Длительности по layer",
};

/** Built-in overview preset — same content as `presets/overview-preset.mjs`. */
export const DEFAULT_OVERVIEW_PRESET: OverviewPreset = {
  id: "overview",
  qualityGates: [
    { id: "allureQualityGate", layout: "2x1" },
    { id: "sonarQualityGate", layout: "2x1" },
  ],
  tiles: [
    { chart: "currentStatus" },
    { chart: "durationDynamics", limit: 20 },
    { chart: "testingPyramid", layersKey: "pyramidLayers" },
    { chart: "durations", groupBy: "layer" },
  ],
  renderers: {
    currentStatus: "stock",
    durationDynamics: "stock",
    testingPyramid: "svg",
    durations: "stock",
  },
  titles: { ...DEFAULT_TITLES },
  pyramidLayers: [...PYRAMID_LAYERS],
};

function buildTile(
  spec: OverviewTileSpec,
  ctx: {
    layers: string[];
    limit: number;
    titles: Partial<Record<OverviewChart, string>>;
    renderers: Partial<Record<OverviewChart, RendererRef>>;
    filter?: (testResult: unknown) => boolean;
  },
): KitChartTile {
  const title = (chart: OverviewChart): string => ctx.titles[chart] ?? DEFAULT_TITLES[chart];
  const renderer = ctx.renderers[spec.chart];

  switch (spec.chart) {
    case "currentStatus":
      return charts.currentStatus({
        title: title("currentStatus"),
        renderer,
        filter: ctx.filter,
      });
    case "durationDynamics":
      return charts.durationDynamics({
        title: title("durationDynamics"),
        limit: spec.limit ?? ctx.limit,
        renderer,
        filter: ctx.filter,
      });
    case "testingPyramid":
      return charts.testingPyramid({
        title: title("testingPyramid"),
        layers: ctx.layers,
        renderer: renderer ?? "svg",
        filter: ctx.filter,
      });
    case "durations":
      return charts.durations({
        title: title("durations"),
        groupBy: (spec.groupBy ?? "layer") as "layer",
        renderer,
        filter: ctx.filter,
      });
    default:
      throw new Error(`Unknown overview chart: ${(spec as OverviewTileSpec).chart}`);
  }
}

/** Build chart tiles from a declarative overview preset. */
export function fromOverview(options: FromOverviewOptions = {}): KitChartTile[] {
  const preset = options.preset ?? DEFAULT_OVERVIEW_PRESET;
  const layers = options.layers ?? [...(preset.pyramidLayers ?? PYRAMID_LAYERS)];
  const limit = options.limit ?? 20;
  const titles = { ...preset.titles, ...options.titles };
  const renderers = { ...preset.renderers, ...options.renderers };

  return preset.tiles.map((spec) =>
    buildTile(spec, { layers, limit, titles, renderers, filter: options.filter }),
  );
}

/** True when the leading tiles match the overview preset spec (charts only). */
export function matchesOverview(
  tiles: readonly unknown[],
  preset: OverviewPreset = DEFAULT_OVERVIEW_PRESET,
): boolean {
  if (tiles.length < preset.tiles.length) {
    return false;
  }

  const type = (index: number): string | undefined =>
    (tiles[index] as { type?: string } | undefined)?.type;
  const groupBy = (index: number): string | undefined =>
    (tiles[index] as { groupBy?: string } | undefined)?.groupBy;
  const layers = (index: number): string[] | undefined =>
    (tiles[index] as { layers?: string[] } | undefined)?.layers;

  for (let i = 0; i < preset.tiles.length; i++) {
    const spec = preset.tiles[i]!;
    if (type(i) !== spec.chart) {
      return false;
    }
    if (spec.groupBy && groupBy(i) !== spec.groupBy) {
      return false;
    }
    if (spec.chart === "testingPyramid") {
      const expected = [...(preset.pyramidLayers ?? PYRAMID_LAYERS)];
      const actual = layers(i) ?? [];
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        return false;
      }
      if (actual.includes("visual")) {
        return false;
      }
    }
  }

  return true;
}

/** Index where overview chart tiles start (after optional quality-gate panels). */
export function leadOffset(preset: OverviewPreset = DEFAULT_OVERVIEW_PRESET): number {
  return preset.qualityGates?.length ?? 0;
}

/** True when quality gates (if any) + overview charts match the preset lead section. */
export function matchesLeadLayout(
  tiles: readonly unknown[],
  preset: OverviewPreset = DEFAULT_OVERVIEW_PRESET,
): boolean {
  const gates = preset.qualityGates ?? [];
  const minLen = gates.length + preset.tiles.length;
  if (tiles.length < minLen) {
    return false;
  }

  for (let i = 0; i < gates.length; i++) {
    const spec = gates[i]!;
    const tile = tiles[i] as { type?: string; id?: string } | undefined;
    if (tile?.type !== "custom" || tile.id !== spec.id) {
      return false;
    }
  }

  return matchesOverview(tiles.slice(gates.length), preset);
}

/** Shorthand for the built-in overview preset. */
export const overview = fromOverview;
