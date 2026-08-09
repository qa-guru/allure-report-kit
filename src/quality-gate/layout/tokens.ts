/**
 * Semantic colour tokens for quality-gate layout IR.
 *
 * Values mirror kit `theme/kit.css` chrome defaults and DS `quality-gate.css`
 * color-mix recipes — painters resolve CSS vars or mix literals.
 */
import type { QualityGateLayoutTokens } from "./types.js";

export const QUALITY_GATE_LAYOUT_TOKENS: QualityGateLayoutTokens = {
  surface: "--color-surface",
  surfaceSoft: "--color-surface-soft",
  text: "--color-text",
  textMuted: "--color-text-muted",
  border: "--color-border",
  success: "--color-success",
  danger: "--color-danger",
  indicator: {
    passed: "--color-status-passed-chart",
    failed: "--color-danger",
  },
  rootBorder: {
    passed: {
      kind: "color-mix",
      base: "--color-success",
      percent: 40,
      with: "--color-border",
    },
    failed: {
      kind: "color-mix",
      base: "--color-danger",
      percent: 40,
      with: "--color-border",
    },
  },
  barBackground: {
    kind: "color-mix",
    base: "--color-text",
    percent: 3,
    with: "transparent",
  },
  barBorderBottom: {
    passed: {
      kind: "color-mix",
      base: "--color-success",
      percent: 25,
      with: "--color-border",
    },
    failed: {
      kind: "color-mix",
      base: "--color-danger",
      percent: 25,
      with: "--color-border",
    },
  },
  verdictOk: "--color-success",
  ruleId: {
    color: {
      passed: "--color-success",
      failed: "--color-danger",
    },
    background: {
      passed: {
        kind: "color-mix",
        base: "--color-success",
        percent: 12,
        with: "--color-surface-soft",
      },
      failed: {
        kind: "color-mix",
        base: "--color-danger",
        percent: 12,
        with: "--color-surface-soft",
      },
    },
  },
  ruleMessage: "--color-text",
  ruleFormula: "--color-danger",
};
