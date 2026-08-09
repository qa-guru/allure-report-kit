/**
 * Shared quality-gate data contract helpers.
 *
 * Payload shape is {@link KitQualityGateData} — the same JSON the plugin writes
 * to `widgets/kit-panels/<id>.json` and the DOM renderer consumes via
 * `renderQualityGateHost` / `toPanelModel`. Sonar projectStatus maps in via
 * {@link sonarProjectStatusToQualityGateOptions} (runtime); fixtures already
 * store that mapped shape so collage/HTML paths need no transform special-case.
 */
import type { KitQualityGateData, KitQualityGateRule } from "../types.js";

export const QUALITY_GATE_FIXTURE_IDS = [
  "aqg-passed",
  "aqg-failed",
  "sqg-passed",
  "sqg-failed",
  "sqg-long",
] as const;

export type QualityGateFixtureId = (typeof QUALITY_GATE_FIXTURE_IDS)[number];

const RULE_COMPARATORS = new Set(["LT", "GT", "EQ", "NE", "LTE", "GTE"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isKitQualityGateRule(value: unknown): value is KitQualityGateRule {
  if (!isPlainObject(value)) {
    return false;
  }
  if (typeof value.id !== "string" || value.id.length === 0) {
    return false;
  }
  if (typeof value.message !== "string") {
    return false;
  }
  if (typeof value.passed !== "boolean") {
    return false;
  }
  if (value.comparator !== undefined && !RULE_COMPARATORS.has(String(value.comparator))) {
    return false;
  }
  return true;
}

/** Type guard for the shared QG JSON contract. */
export function isKitQualityGateData(value: unknown): value is KitQualityGateData {
  if (!isPlainObject(value)) {
    return false;
  }
  if (typeof value.passed !== "boolean") {
    return false;
  }
  if (!Array.isArray(value.rules) || value.rules.length === 0) {
    return false;
  }
  if (!value.rules.every(isKitQualityGateRule)) {
    return false;
  }
  if (value.kind !== undefined && value.kind !== "allure" && value.kind !== "sonar") {
    return false;
  }
  if (value.lang !== undefined && value.lang !== "ru" && value.lang !== "en") {
    return false;
  }
  return true;
}

/**
 * Parse unknown JSON into {@link KitQualityGateData}.
 *
 * No field remapping — input must already be the kit widget payload shape
 * (AQG from evaluateQualityGate / SQG from sonarProjectStatusToQualityGateOptions).
 */
export function parseKitQualityGateData(value: unknown): KitQualityGateData {
  if (!isKitQualityGateData(value)) {
    throw new TypeError(
      "allure-report-kit: value is not KitQualityGateData (need passed:boolean + non-empty rules[])",
    );
  }
  return value;
}
