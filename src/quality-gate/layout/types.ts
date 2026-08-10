/**
 * Quality-gate layout IR — semantic scene for DOM (T3) and canvas (T4) painters.
 *
 * Built from {@link KitQualityGateData} only; no DOM/canvas dependencies.
 */
import type { KitQualityGateData } from "../../types.js";

/** CSS custom-property reference, e.g. `--color-success`. */
export type QualityGateTokenRef = `--${string}`;

/** color-mix(in srgb, var(base) pct%, var(with)) — mirrors DS quality-gate.css. */
export interface QualityGateColorMix {
  kind: "color-mix";
  base: QualityGateTokenRef;
  percent: number;
  with: QualityGateTokenRef | "transparent";
}

export type QualityGatePaintColor = QualityGateTokenRef | QualityGateColorMix;

/** Spacing / sizing canon from design-system `quality-gate.css` (hybrid tile). */
export interface QualityGateLayoutMetrics {
  barHeight: number;
  indicatorSize: number;
  barInset: number;
  barGap: number;
  barTitleSizeRem: number;
  bodyFontSizeRem: number;
  bodyPaddingPassed: number;
  bodyMinHeightPassedRem: number;
  verdictFontSizeRem: number;
  ruleGridIdMaxRem: number;
  ruleIdMinWidthRem: number;
  ruleIdFontSizeEm: number;
  ruleIdPaddingY: number;
  ruleIdPaddingX: number;
  ruleDetailPaddingY: number;
  ruleDetailPaddingX: number;
  formulaMarginTop: number;
  borderRadiusMd: number;
}

export interface QualityGateLayoutTokens {
  surface: QualityGateTokenRef;
  surfaceSoft: QualityGateTokenRef;
  text: QualityGateTokenRef;
  textMuted: QualityGateTokenRef;
  border: QualityGateTokenRef;
  success: QualityGateTokenRef;
  danger: QualityGateTokenRef;
  indicator: { passed: QualityGateTokenRef; failed: QualityGateTokenRef };
  rootBorder: { passed: QualityGatePaintColor; failed: QualityGatePaintColor };
  barBackground: QualityGateColorMix;
  barBorderBottom: { passed: QualityGatePaintColor; failed: QualityGatePaintColor };
  verdictOk: QualityGateTokenRef;
  ruleId: {
    color: { passed: QualityGateTokenRef; failed: QualityGateTokenRef };
    background: { passed: QualityGatePaintColor; failed: QualityGatePaintColor };
  };
  ruleMessage: QualityGateTokenRef;
  ruleFormula: QualityGateTokenRef;
}

/** Serialized file-source links for the info popover (T3 DOM / T4 canvas). */
export interface QualityGateLayoutInfoFileSource {
  configFile?: string;
  rulesFile?: string;
  knownIssuesFile?: string;
  profile?: string;
  projectKey?: string;
  hrefBase?: string;
  profileHref?: string;
  projectHref?: string;
}

export interface QualityGateLayoutInfoPopover {
  enabled: boolean;
  payload?: Record<string, unknown>;
  fileSource?: QualityGateLayoutInfoFileSource;
}

export interface QualityGateLayoutBar {
  title: string;
  indicatorStatus: "passed" | "failed";
  info: QualityGateLayoutInfoPopover;
}

export interface QualityGateLayoutRuleRow {
  id: string;
  message: string;
  formula?: string;
}

export interface QualityGateLayoutPassedBody {
  mode: "passed";
  verdict: string;
}

export interface QualityGateLayoutFailedBody {
  mode: "failed";
  rows: QualityGateLayoutRuleRow[];
}

export type QualityGateLayoutBody = QualityGateLayoutPassedBody | QualityGateLayoutFailedBody;

export interface QualityGateLayout {
  version: 1;
  hidden: boolean;
  passed: boolean;
  kind: "allure" | "sonar";
  testId: string;
  ariaLabel: string;
  metrics: QualityGateLayoutMetrics;
  tokens: QualityGateLayoutTokens;
  bar: QualityGateLayoutBar;
  body: QualityGateLayoutBody;
}

export interface BuildQualityGateLayoutOptions {
  /** Override layout metrics (tests); defaults to DS canon. */
  metrics?: QualityGateLayoutMetrics;
  /** Override token refs (tests); defaults to kit / DS canon. */
  tokens?: QualityGateLayoutTokens;
}

export type QualityGateLayoutInput = KitQualityGateData;
