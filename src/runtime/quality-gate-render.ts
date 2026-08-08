/**
 * DS `quality-gate` primitive in TypeScript — kept in sync with
 * design-system/js/quality-gate.js (vendored CSS via sync:ds).
 *
 * Popover UX (links, JSON highlight, deviation literals) lives in qg-info.ts —
 * both Allure and Sonar paths call createQgInfo() from here.
 */
import type {
  KitQualityGateConfig,
  KitQualityGateData,
  KitQualityGateRule,
  QualityGateLabel,
  QualityGateLabels,
} from "../types.js";
import { createQgInfo, type QgInfoFileSource } from "./qg-info.js";

const DEFAULT_LABELS = {
  passed: { en: "Quality gate passed", ru: "Quality gate пройден" },
  failed: { en: "Quality gate failed", ru: "Quality gate не пройден" },
} as const;

const DEFAULT_BAR_TITLE = "Quality gate";

export interface QualityGateRenderOptions {
  passed?: boolean;
  title?: string;
  barTitle?: string;
  kind?: "allure" | "sonar";
  testId?: string;
  rules?: KitQualityGateRule[];
  config?: KitQualityGateConfig;
  infoPayload?: Record<string, unknown>;
  labels?: QualityGateLabels;
  lang?: "ru" | "en";
}

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

export function resolveQualityGateFileSource(config?: KitQualityGateConfig): QgInfoFileSource | undefined {
  if (!config) {
    return undefined;
  }

  const fileSource = config.source ?? {};
  const resolved: QgInfoFileSource = {};

  if (fileSource.configFile) {
    resolved.configFile = fileSource.configFile;
  }
  if (fileSource.rulesFile) {
    resolved.rulesFile = fileSource.rulesFile;
  }
  const knownIssuesFile = fileSource.knownIssuesFile ?? config.knownIssuesPath;
  if (knownIssuesFile) {
    resolved.knownIssuesFile = knownIssuesFile;
  }
  const profile = fileSource.profile ?? config.profile;
  if (profile) {
    resolved.profile = profile;
  }
  const projectKey = fileSource.projectKey ?? config.projectKey;
  if (projectKey) {
    resolved.projectKey = projectKey;
  }
  if (fileSource.hrefBase) {
    resolved.hrefBase = fileSource.hrefBase;
  }
  if (fileSource.profileHref) {
    resolved.profileHref = fileSource.profileHref;
  }
  if (fileSource.projectHref) {
    resolved.projectHref = fileSource.projectHref;
  }

  return Object.keys(resolved).length ? resolved : undefined;
}

export function buildQualityGateInfoPayload(options: QualityGateRenderOptions): Record<string, unknown> {
  const config = options.config ?? { rules: [] };

  return {
    qualityGate: {
      rules: config.rules ?? [],
    },
    result: {
      passed: Boolean(options.passed),
      rules: options.rules ?? [],
    },
  };
}

export function renderQualityGate(
  host: HTMLElement,
  options: QualityGateRenderOptions = {},
): { hidden: boolean; passed?: boolean } {
  const rules = options.rules ?? [];
  if (!rules.length) {
    host.replaceChildren();
    host.hidden = true;
    return { hidden: true };
  }

  const passed = Boolean(options.passed);
  const lang = options.lang ?? "ru";
  const kind = options.kind ?? "allure";
  const barTitle = options.barTitle ?? options.title ?? DEFAULT_BAR_TITLE;
  const passedLabel = resolveLabel(options.labels?.passed, "passed", lang);
  const testId = options.testId ?? (kind === "sonar" ? "sonar-quality-gate" : "quality-gate");

  host.hidden = false;

  const root = document.createElement("div");
  root.className = `quality-gate quality-gate--${kind} quality-gate--${passed ? "passed" : "failed"}`;
  root.setAttribute("role", "status");
  root.dataset.testid = testId;
  root.setAttribute(
    "aria-label",
    passed ? passedLabel : resolveLabel(options.labels?.failed, "failed", lang),
  );

  const bar = document.createElement("div");
  bar.className = "quality-gate__bar";

  const barStart = document.createElement("div");
  barStart.className = "quality-gate__bar-start";

  const indicator = document.createElement("span");
  indicator.className = `indicator indicator--${passed ? "passed" : "failed"} indicator--solid`;
  indicator.setAttribute("aria-hidden", "true");

  const barTitleEl = document.createElement("span");
  barTitleEl.className = "quality-gate__bar-title";
  barTitleEl.textContent = barTitle;

  barStart.append(indicator, barTitleEl);
  const infoPayload =
    options.infoPayload ?? buildQualityGateInfoPayload({ ...options, rules, passed });
  bar.append(barStart, createQgInfo(infoPayload, resolveQualityGateFileSource(options.config)));

  const body = document.createElement("div");
  body.className = "quality-gate__body";

  if (passed) {
    const verdict = document.createElement("p");
    verdict.className = "quality-gate__verdict quality-gate__verdict--ok";
    verdict.textContent = passedLabel;
    body.append(verdict);
  } else {
    const failedRules = rules.filter((rule) => !rule.passed);
    if (failedRules.length) {
      const list = document.createElement("ul");
      list.className = "quality-gate__rules";
      for (const rule of failedRules) {
        const item = document.createElement("li");
        item.className = "quality-gate__rule";

        const idCell = document.createElement("div");
        idCell.className = "quality-gate__rule-id";
        idCell.textContent = rule.id;

        const detail = document.createElement("div");
        detail.className = "quality-gate__rule-detail";

        const message = document.createElement("p");
        message.className = "quality-gate__message";
        message.textContent = rule.message;

        detail.append(message);
        const formula = formatQualityGateRuleFormula(rule);
        if (formula) {
          const formulaEl = document.createElement("p");
          formulaEl.className = "quality-gate__formula";
          formulaEl.textContent = formula;
          detail.append(formulaEl);
        }

        item.append(idCell, detail);
        list.append(item);
      }
      body.append(list);
    }
  }

  root.append(bar, body);
  host.replaceChildren(root);
  return { hidden: false, passed };
}

export function renderQualityGateHost(host: HTMLElement, data: KitQualityGateData): boolean {
  const tile = host.closest<HTMLElement>(".widget-tile");
  const rules = data.rules ?? [];
  if (!rules.length) {
    host.replaceChildren();
    host.hidden = true;
    if (tile) {
      tile.hidden = true;
    }
    return false;
  }

  if (tile) {
    tile.hidden = false;
  }

  const result = renderQualityGate(host, {
    passed: data.passed,
    rules: data.rules,
    kind: data.kind,
    testId: data.testId,
    barTitle: data.barTitle ?? data.title,
    config: data.config,
    infoPayload: data.infoPayload,
    labels: data.labels,
    lang: data.lang,
  });
  return !result.hidden;
}
