/**
 * Rule row helpers shared by layout IR (T2) and DOM/canvas painters (T3/T4).
 */
import type { KitQualityGateRule } from "../types.js";

export function resolveQualityGateRuleExpected(rule: KitQualityGateRule): number | string | undefined {
  if (rule.expected !== undefined && rule.expected !== null) {
    return rule.expected;
  }
  if (rule.threshold !== undefined && rule.threshold !== null) {
    return rule.threshold;
  }
  return undefined;
}

export function formatQualityGateRuleFormula(rule: KitQualityGateRule): string {
  const { id, actual, comparator } = rule;
  const expected = resolveQualityGateRuleExpected(rule);
  if (actual === undefined || expected === undefined) {
    return "";
  }

  if (comparator) {
    const op =
      comparator === "LT"
        ? "<"
        : comparator === "LTE"
          ? "≤"
          : comparator === "GT"
            ? ">"
            : comparator === "GTE"
              ? "≥"
              : comparator === "EQ"
                ? "="
                : "≠";
    return `FAIL: ${actual} ${op} ${expected}`;
  }

  switch (id) {
    case "maxFailures":
      return `FAIL: ${actual} > ${expected}`;
    case "minTestsCount":
      return `FAIL: ${actual} < ${expected}`;
    case "successRate":
      return `FAIL: ${actual}% < ${expected}%`;
    case "maxDuration":
      return `FAIL: ${actual}s > ${expected}s`;
    default:
      return `FAIL: ${actual} vs ${expected}`;
  }
}
