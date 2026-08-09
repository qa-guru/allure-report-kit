/**
 * Numeric layout canon from design-system `quality-gate.css` (hybrid tile variant).
 *
 * SSOT for spacing is the vendored CSS; these literals are the resolved px/rem
 * values painters use when CSS variables are unavailable (canvas).
 */
import type { QualityGateLayoutMetrics } from "./types.js";

/** Matches `.quality-gate:has(.quality-gate__bar)` custom properties and rules. */
export const QUALITY_GATE_LAYOUT_METRICS: QualityGateLayoutMetrics = {
  barHeight: 28,
  indicatorSize: 10,
  barInset: 9,
  barGap: 6,
  barTitleSizeRem: 0.75,
  bodyFontSizeRem: 0.875,
  bodyPaddingPassed: 12,
  bodyMinHeightPassedRem: 4.5,
  verdictFontSizeRem: 1,
  ruleGridIdMaxRem: 19.5,
  ruleIdMinWidthRem: 6.5,
  ruleIdFontSizeEm: 0.8,
  ruleIdPaddingY: 8,
  ruleIdPaddingX: 12,
  ruleDetailPaddingY: 8,
  ruleDetailPaddingX: 12,
  formulaMarginTop: 4,
  borderRadiusMd: 12,
};
