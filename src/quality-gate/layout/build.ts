/**
 * KitQualityGateData → layout IR (bar + body + rule rows).
 */
import type {
  KitQualityGateData,
  KitQualityGateRule,
  QualityGateLabel,
  QualityGateLabels,
} from "../../types.js";
import {
  formatQualityGateRuleFormula,
  resolveQualityGateRuleExpected,
} from "../../runtime/quality-gate-render.js";
import { QUALITY_GATE_LAYOUT_METRICS } from "./metrics.js";
import { QUALITY_GATE_LAYOUT_TOKENS } from "./tokens.js";
import type {
  BuildQualityGateLayoutOptions,
  QualityGateLayout,
  QualityGateLayoutBody,
  QualityGateLayoutRuleRow,
} from "./types.js";

const DEFAULT_LABELS = {
  passed: { en: "Quality gate passed", ru: "Quality gate пройден" },
  failed: { en: "Quality gate failed", ru: "Quality gate не пройден" },
} as const;

const DEFAULT_BAR_TITLE = "Quality gate";

function resolveLabel(
  entry: QualityGateLabel | undefined,
  key: "passed" | "failed",
  lang: "ru" | "en",
): string {
  if (!entry) {
    return DEFAULT_LABELS[key][lang] ?? DEFAULT_LABELS[key].en;
  }
  if (typeof entry === "string") {
    return entry;
  }
  return entry[lang] ?? entry.en ?? entry.ru ?? DEFAULT_LABELS[key].en;
}

function resolveAriaLabel(data: KitQualityGateData, lang: "ru" | "en", passed: boolean): string {
  const labels = data.labels;
  return passed
    ? resolveLabel(labels?.passed, "passed", lang)
    : resolveLabel(labels?.failed, "failed", lang);
}

function buildRuleRow(rule: KitQualityGateRule): QualityGateLayoutRuleRow {
  const row: QualityGateLayoutRuleRow = {
    id: rule.id,
    message: rule.message,
  };
  const expected = resolveQualityGateRuleExpected(rule);
  if (!rule.passed && expected !== undefined && rule.actual !== undefined) {
    const formula = formatQualityGateRuleFormula(rule);
    if (formula) {
      row.formula = formula;
    }
  }
  return row;
}

function buildBody(data: KitQualityGateData, passed: boolean, lang: "ru" | "en"): QualityGateLayoutBody {
  if (passed) {
    return {
      mode: "passed",
      verdict: lang === "en" ? "Passed" : "Пройден",
    };
  }

  const rows = data.rules.filter((rule) => !rule.passed).map(buildRuleRow);
  return { mode: "failed", rows };
}

/**
 * Build a quality-gate layout scene from shared contract data.
 *
 * Empty `rules` → `hidden: true` (same policy as `renderQualityGateHost`).
 */
export function buildQualityGateLayout(
  data: KitQualityGateData,
  options: BuildQualityGateLayoutOptions = {},
): QualityGateLayout {
  const rules = data.rules ?? [];
  const metrics = options.metrics ?? QUALITY_GATE_LAYOUT_METRICS;
  const tokens = options.tokens ?? QUALITY_GATE_LAYOUT_TOKENS;
  const lang = data.lang ?? "ru";
  const kind = data.kind ?? "allure";
  const passed = Boolean(data.passed);
  const testId = data.testId ?? (kind === "sonar" ? "sonar-quality-gate" : "quality-gate");
  const barTitle = data.barTitle ?? data.title ?? DEFAULT_BAR_TITLE;

  if (!rules.length) {
    return {
      version: 1,
      hidden: true,
      passed,
      kind,
      testId,
      ariaLabel: resolveAriaLabel(data, lang, passed),
      metrics,
      tokens,
      bar: {
        title: barTitle,
        indicatorStatus: passed ? "passed" : "failed",
        info: { enabled: false },
      },
      body: { mode: "passed", verdict: "" },
    };
  }

  return {
    version: 1,
    hidden: false,
    passed,
    kind,
    testId,
    ariaLabel: resolveAriaLabel(data, lang, passed),
    metrics,
    tokens,
    bar: {
      title: barTitle,
      indicatorStatus: passed ? "passed" : "failed",
      info: { enabled: Boolean(data.config ?? data.infoPayload) },
    },
    body: buildBody(data, passed, lang),
  };
}
