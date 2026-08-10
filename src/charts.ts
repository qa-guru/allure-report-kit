/**
 * Chart builders — thin, typed wrappers over the upstream `ChartOptions`
 * of `@allurereport/charts-api`, plus the kit fields (`renderer`, `dots`,
 * `layout`, `tier`).
 *
 * Everything here stays a plain object: the result is valid for stock Allure 3
 * and for `validate-allurerc.mjs` (which reads `type`, `groupBy`, `layers`).
 */
import type { DotsSpec, KitChartTile, RendererRef, TileLayout, TileTier } from "./types.js";

interface CommonOptions {
  title?: string;
  renderer?: RendererRef;
  dots?: DotsSpec;
  layout?: TileLayout;
  tier?: TileTier;
  /** Per-widget test filter — same contract as upstream. */
  filter?: (testResult: unknown) => boolean;
}

type TestStatus = "passed" | "failed" | "broken" | "skipped" | "unknown";
type SeverityLevel = "blocker" | "critical" | "normal" | "minor" | "trivial";

function tile(type: KitChartTile["type"], options: Record<string, unknown>): KitChartTile {
  const result: Record<string, unknown> = { type };
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result as KitChartTile;
}

export interface CurrentStatusOptions extends CommonOptions {
  statuses?: TestStatus[];
  metric?: TestStatus;
}

/** Donut of the latest run (`currentStatus`). */
export function currentStatus(options: CurrentStatusOptions = {}): KitChartTile {
  return tile("currentStatus", { ...options });
}

export interface DurationDynamicsOptions extends CommonOptions {
  limit?: number;
}

/** Wall-clock vs sequential duration across runs (`durationDynamics`). */
export function durationDynamics(options: DurationDynamicsOptions = {}): KitChartTile {
  return tile("durationDynamics", { ...options });
}

export interface TestingPyramidOptions extends CommonOptions {
  /** Bottom to top. Canon has no `visual` layer — see ADR 006. */
  layers?: string[];
}

/** Testing pyramid. Default renderer is the SVG canon. */
export function testingPyramid(options: TestingPyramidOptions = {}): KitChartTile {
  return tile("testingPyramid", { renderer: "svg", ...options });
}

export interface DurationsOptions extends CommonOptions {
  groupBy?: "layer" | "none";
}

/** Duration histogram; overview preset uses `groupBy: "layer"`. */
export function durations(options: DurationsOptions = {}): KitChartTile {
  return tile("durations", { ...options });
}

export interface StatusDynamicsOptions extends CommonOptions {
  limit?: number;
  statuses?: TestStatus[];
}

export function statusDynamics(options: StatusDynamicsOptions = {}): KitChartTile {
  return tile("statusDynamics", { ...options });
}

export interface StatusTransitionsOptions extends CommonOptions {
  limit?: number;
}

export function statusTransitions(options: StatusTransitionsOptions = {}): KitChartTile {
  return tile("statusTransitions", { ...options });
}

export interface StabilityDistributionOptions extends CommonOptions {
  limit?: number;
  threshold?: number;
  stabilizationPeriod?: number;
  skipStatuses?: TestStatus[];
  groupBy?:
    | "feature"
    | "epic"
    | "story"
    | "suite"
    | "severity"
    | "owner"
    | `label-name:${string}`;
  groupValues?: string[];
}

export function stabilityDistribution(options: StabilityDistributionOptions = {}): KitChartTile {
  return tile("stabilityDistribution", { ...options });
}

export interface TestBaseGrowthDynamicsOptions extends CommonOptions {
  limit?: number;
  statuses?: TestStatus[];
}

export function testBaseGrowthDynamics(options: TestBaseGrowthDynamicsOptions = {}): KitChartTile {
  return tile("testBaseGrowthDynamics", { ...options });
}

export interface StatusAgePyramidOptions extends CommonOptions {
  limit?: number;
}

export function statusAgePyramid(options: StatusAgePyramidOptions = {}): KitChartTile {
  return tile("statusAgePyramid", { ...options });
}

export interface TestResultSeveritiesOptions extends CommonOptions {
  levels?: SeverityLevel[];
  statuses?: TestStatus[];
  includeUnset?: boolean;
}

export function testResultSeverities(options: TestResultSeveritiesOptions = {}): KitChartTile {
  return tile("testResultSeverities", { ...options });
}

export function coverageDiff(options: CommonOptions = {}): KitChartTile {
  return tile("coverageDiff", { ...options });
}

export function successRateDistribution(options: CommonOptions = {}): KitChartTile {
  return tile("successRateDistribution", { ...options });
}

export interface ProblemsDistributionOptions extends CommonOptions {
  by?: "environment";
}

export function problemsDistribution(options: ProblemsDistributionOptions = {}): KitChartTile {
  return tile("problemsDistribution", { by: "environment", ...options });
}
