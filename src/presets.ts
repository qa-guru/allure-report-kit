/**
 * Presets — ready tile groups from declarative preset configs.
 *
 * SSOT for the overview quad: `presets/overview-preset.mjs` (importable as
 * `@qa-guru/allure-report-kit/presets/overview-preset`). Ethalon re-exports it
 * from `allure/overview-preset.mjs` with profile titles/layers overrides only.
 *
 * Lead section (indices 0–5): quality gates from `preset.qualityGates`, then
 * the overview chart quad. Use `fromLead` / `fromOverview` (default); use
 * `fromOverviewCharts` when you need charts only.
 */
import * as charts from "./charts.js";
import * as panels from "./panels.js";
import { OVERVIEW_PRESET } from "../presets/overview-preset.mjs";
import type {
  DotsSpec,
  KitChartTile,
  KitCustomPanel,
  KitPanelData,
  KitPanelSource,
  KitTile,
  QualityGateLabels,
  RendererRef,
  TileLayout,
  TileTier,
} from "./types.js";

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
  layout?: TileLayout;
}

export interface OverviewPreset {
  id: string;
  qualityGates?: readonly OverviewQualityGateSpec[];
  tiles: OverviewTileSpec[];
  renderers?: Partial<Record<OverviewChart, RendererRef>>;
  titles?: Partial<Record<OverviewChart, string>>;
  pyramidLayers?: readonly string[];
}

/** Built-in overview preset — re-export of `presets/overview-preset.mjs`. */
export const DEFAULT_OVERVIEW_PRESET = OVERVIEW_PRESET as OverviewPreset;

/** Canon layer order, bottom to top — from the overview preset SSOT. */
export const PYRAMID_LAYERS: readonly string[] = DEFAULT_OVERVIEW_PRESET.pyramidLayers ?? [];

export interface FromOverviewOptions {
  preset?: OverviewPreset;
  layers?: string[];
  limit?: number;
  titles?: Partial<Record<OverviewChart, string>>;
  renderers?: Partial<Record<OverviewChart, RendererRef>>;
  filter?: (testResult: unknown) => boolean;
  /**
   * When true (default), emit quality-gate panels before the overview charts.
   * Set false for charts-only via `fromOverviewCharts`.
   */
  includeQualityGates?: boolean;
}

/** Per-gate overrides when building the lead section (e.g. Sonar `data` from CI). */
export interface QualityGatePanelOverrides {
  title?: string;
  layout?: TileLayout;
  labels?: QualityGateLabels;
  lang?: "ru" | "en";
  data?: KitPanelData;
  dataUrl?: string;
  source?: KitPanelSource;
  dots?: DotsSpec;
  renderer?: RendererRef;
  tier?: TileTier;
}

export interface FromLeadOptions extends FromOverviewOptions {
  gatePanels?: Partial<Record<string, QualityGatePanelOverrides>>;
}

const DEFAULT_TITLES: Record<OverviewChart, string> = {
  currentStatus: DEFAULT_OVERVIEW_PRESET.titles?.currentStatus ?? "Текущий статус",
  durationDynamics: DEFAULT_OVERVIEW_PRESET.titles?.durationDynamics ?? "Динамика длительности",
  testingPyramid: DEFAULT_OVERVIEW_PRESET.titles?.testingPyramid ?? "Пирамида тестирования",
  durations: DEFAULT_OVERVIEW_PRESET.titles?.durations ?? "Длительности по layer",
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

const DEFAULT_GATE_TITLES: Record<string, string> = {
  allureQualityGate: "Allure Quality Gate",
  sonarQualityGate: "Sonar Quality Gate",
};

function buildQualityGateTile(
  spec: OverviewQualityGateSpec,
  overrides: QualityGatePanelOverrides = {},
): KitCustomPanel {
  const layout = overrides.layout ?? spec.layout;
  const title = overrides.title ?? DEFAULT_GATE_TITLES[spec.id];

  if (spec.id === "allureQualityGate") {
    return panels.qualityGate({
      id: spec.id,
      ...(title === undefined ? {} : { title }),
      ...(layout === undefined ? {} : { layout }),
      ...(overrides.labels === undefined ? {} : { labels: overrides.labels }),
      ...(overrides.lang === undefined ? {} : { lang: overrides.lang }),
      ...(overrides.dots === undefined ? {} : { dots: overrides.dots }),
      ...(overrides.renderer === undefined ? {} : { renderer: overrides.renderer }),
      ...(overrides.tier === undefined ? {} : { tier: overrides.tier }),
    });
  }

  return panels.custom({
    id: spec.id,
    kind: "qualityGate",
    dots: overrides.dots ?? false,
    ...(title === undefined ? {} : { title }),
    ...(layout === undefined ? {} : { layout }),
    ...(overrides.data === undefined ? {} : { data: overrides.data }),
    ...(overrides.dataUrl === undefined ? {} : { dataUrl: overrides.dataUrl }),
    ...(overrides.source === undefined ? {} : { source: overrides.source }),
    ...(overrides.renderer === undefined ? {} : { renderer: overrides.renderer }),
    ...(overrides.tier === undefined ? {} : { tier: overrides.tier }),
  });
}

/** Build overview chart tiles only — no quality-gate panels. */
export function fromOverviewCharts(options: FromOverviewOptions = {}): KitChartTile[] {
  const preset = options.preset ?? DEFAULT_OVERVIEW_PRESET;
  const layers = options.layers ?? [...(preset.pyramidLayers ?? PYRAMID_LAYERS)];
  const limit = options.limit ?? 20;
  const titles = { ...preset.titles, ...options.titles };
  const renderers = { ...preset.renderers, ...options.renderers };

  return preset.tiles.map((spec) =>
    buildTile(spec, { layers, limit, titles, renderers, filter: options.filter }),
  );
}

/**
 * Lead section: quality gates from the preset, then overview charts.
 * Sonar data is not embedded — pass `gatePanels.sonarQualityGate.data` when needed.
 */
export function fromLead(options: FromLeadOptions = {}): KitTile[] {
  const preset = options.preset ?? DEFAULT_OVERVIEW_PRESET;
  const gates = preset.qualityGates ?? [];
  const gateTiles = gates.map((spec) =>
    buildQualityGateTile(spec, options.gatePanels?.[spec.id]),
  );

  return [...gateTiles, ...fromOverviewCharts(options)];
}

/**
 * Lead section by default (`includeQualityGates: true`); charts-only when false.
 * Prefer `fromLead` / `fromOverviewCharts` when the intent must be explicit.
 */
export function fromOverview(options: FromOverviewOptions = {}): KitTile[] {
  const { includeQualityGates = true, ...rest } = options;
  if (includeQualityGates) {
    return fromLead(rest);
  }
  return fromOverviewCharts(rest);
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

/** Shorthand for the built-in lead preset (quality gates + overview charts). */
export const overview = fromLead;
