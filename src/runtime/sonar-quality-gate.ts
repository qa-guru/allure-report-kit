/**
 * Sonar QG — kept in sync with design-system/js/sonar-quality-gate.js.
 * Popover features flow through renderQualityGate → createQgInfo (qg-info.ts).
 */
import type { KitQualityGateRule, QualityGateLabels } from "../types.js";
import { renderQualityGate } from "./quality-gate-render.js";

const DEFAULT_BAR_TITLE = "Sonar Quality Gate";
const DEFAULT_SONAR_HOST = "https://sonar.qa.guru";
const DEFAULT_SONAR_HREF_BASE = "https://github.com/qa-guru/zero-design-system/blob/master/";

const DEFAULT_LABELS: QualityGateLabels = {
  passed: { en: "Sonar Quality Gate passed", ru: "Sonar Quality Gate пройден" },
  failed: { en: "Sonar Quality Gate failed", ru: "Sonar Quality Gate не пройден" },
};

const RATING_LETTERS: Record<number, string> = { 1: "A", 2: "B", 3: "C", 4: "D", 5: "E" };

export interface SonarCondition {
  status?: string;
  metricKey?: string;
  comparator?: string;
  errorThreshold?: string | number;
  warningThreshold?: string | number;
  actualValue?: string | number;
}

export interface SonarQgInfoSource {
  configFile?: string;
  profile?: string;
  projectKey?: string;
  hrefBase?: string;
  profileHref?: string;
  projectHref?: string;
  sonarHost?: string;
}

export interface SonarProjectStatus {
  status?: string;
  ok?: boolean;
  passed?: boolean;
  project_key?: string;
  projectKey?: string;
  analysis_id?: string;
  conditions?: SonarCondition[];
  dashboard_url?: string;
}

export function coerceSonarNumber(value: string | number | undefined | null): string | number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const trimmed = String(value).trim();
  if (!trimmed || !/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return value;
  }
  const num = Number(trimmed);
  if (!Number.isFinite(num)) {
    return value;
  }
  return Number.isInteger(num) ? num : Math.round(num * 10) / 10;
}

export function normalizeSonarCondition(condition: SonarCondition): SonarCondition {
  const next = { ...condition };
  if (condition.errorThreshold !== undefined) {
    const coerced = coerceSonarNumber(condition.errorThreshold);
    if (coerced !== undefined) {
      next.errorThreshold = coerced;
    }
  }
  if (condition.warningThreshold !== undefined) {
    const coerced = coerceSonarNumber(condition.warningThreshold);
    if (coerced !== undefined) {
      next.warningThreshold = coerced;
    }
  }
  if (condition.actualValue !== undefined) {
    const coerced = coerceSonarNumber(condition.actualValue);
    if (coerced !== undefined) {
      next.actualValue = coerced;
    }
  }
  return next;
}

export function formatSonarMetricValue(
  value: string | number | undefined,
  metricKey: string,
): string | number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (/rating/i.test(metricKey)) {
    const num = Number(value);
    if (Number.isFinite(num) && RATING_LETTERS[num]) {
      return RATING_LETTERS[num];
    }
  }
  return coerceSonarNumber(value);
}

export function mapSonarConditionToRule(condition: SonarCondition): KitQualityGateRule {
  const id = condition.metricKey ?? "condition";
  const comparator = (condition.comparator ?? "GT") as KitQualityGateRule["comparator"];
  const thresholdRaw = condition.errorThreshold ?? condition.warningThreshold;
  const actual = formatSonarMetricValue(condition.actualValue, id);
  const threshold = formatSonarMetricValue(thresholdRaw, id);
  const status = (condition.status ?? "").toUpperCase();
  const passed = status === "OK" || status === "PASSED";

  let message: string;
  if (passed) {
    message = `${id} ${actual ?? "—"} within threshold ${threshold ?? "—"}`;
  } else if (comparator === "LT" || comparator === "LTE") {
    message = `${id} ${actual ?? "—"} is below the required ${threshold ?? "—"}`;
  } else if (comparator === "GT" || comparator === "GTE") {
    message = `${id} ${actual ?? "—"} exceeds the allowed ${threshold ?? "—"}`;
  } else {
    message = `${id} ${actual ?? "—"} vs ${threshold ?? "—"}`;
  }

  return {
    id,
    message,
    passed,
    actual,
    threshold,
    comparator,
  };
}

export function buildSonarProfileHref(profile?: string, sonarHost = DEFAULT_SONAR_HOST): string | undefined {
  if (!profile) {
    return undefined;
  }
  return `${sonarHost.replace(/\/$/, "")}/profiles/show?name=${encodeURIComponent(profile)}`;
}

export function buildSonarProjectHref(
  projectKey?: string,
  dashboardUrl?: string,
  sonarHost = DEFAULT_SONAR_HOST,
): string | undefined {
  if (dashboardUrl) {
    return dashboardUrl;
  }
  if (!projectKey) {
    return undefined;
  }
  return `${sonarHost.replace(/\/$/, "")}/dashboard?id=${encodeURIComponent(projectKey)}`;
}

function resolveSonarQgInfoSource(
  source: SonarQgInfoSource = {},
  projectStatus: SonarProjectStatus = {},
  profile?: string,
  projectKey?: string,
): SonarQgInfoSource {
  const sonarHost = source.sonarHost ?? DEFAULT_SONAR_HOST;
  const key = projectKey ?? projectStatus.project_key ?? projectStatus.projectKey ?? source.projectKey;
  const profileName = profile ?? source.profile;

  return {
    configFile: source.configFile ?? "docs/sonar/quality-gate-profile.json",
    profile: profileName,
    projectKey: key,
    hrefBase: source.hrefBase ?? DEFAULT_SONAR_HREF_BASE,
    profileHref: source.profileHref ?? buildSonarProfileHref(profileName, sonarHost),
    projectHref: source.projectHref ?? buildSonarProjectHref(key, projectStatus.dashboard_url, sonarHost),
  };
}

export function buildSonarQualityGateInfoPayload(
  projectStatus: SonarProjectStatus,
  meta: {
    profile?: string;
    profileConditions?: Array<Record<string, unknown>>;
    source?: SonarQgInfoSource;
  } = {},
): Record<string, unknown> {
  const conditions = (projectStatus.conditions ?? []).map(normalizeSonarCondition);
  const projectKey = projectStatus.project_key ?? projectStatus.projectKey ?? meta.source?.projectKey;
  const status = projectStatus.status ?? (projectStatus.ok || projectStatus.passed ? "OK" : "ERROR");
  const passed =
    projectStatus.passed ??
    projectStatus.ok ??
    ["OK", "PASSED"].includes(String(status).toUpperCase());

  const profileConditions = (meta.profileConditions ?? []).map((condition) => {
    if (!condition || typeof condition !== "object") {
      return condition;
    }
    const next = { ...condition };
    if ("error" in next) {
      const coerced = coerceSonarNumber(next.error as string | number | undefined);
      if (coerced !== undefined) {
        next.error = coerced;
      }
    }
    return next;
  });

  return {
    qualityGate: {
      profile: meta.profile ?? meta.source?.profile,
      projectKey,
      conditions: profileConditions,
    },
    result: {
      status,
      passed: Boolean(passed),
      analysisId: projectStatus.analysis_id,
      dashboardUrl: projectStatus.dashboard_url,
      conditions,
    },
  };
}

export function sonarProjectStatusToQualityGateOptions(
  projectStatus: SonarProjectStatus,
  options: {
    profile?: string;
    profileConditions?: Array<Record<string, unknown>>;
    source?: SonarQgInfoSource;
    lang?: "ru" | "en";
    barTitle?: string;
    passed?: boolean;
    labels?: QualityGateLabels;
  } = {},
) {
  const conditions = projectStatus.conditions ?? [];
  const rules = conditions.map(mapSonarConditionToRule);
  const status = projectStatus.status ?? (projectStatus.ok || projectStatus.passed ? "OK" : "ERROR");
  const passed =
    options.passed ??
    projectStatus.passed ??
    projectStatus.ok ??
    ["OK", "PASSED"].includes(String(status).toUpperCase());
  const projectKey = projectStatus.project_key ?? projectStatus.projectKey ?? options.source?.projectKey;
  const profile = options.profile ?? options.source?.profile;

  const displayRules =
    rules.length > 0
      ? rules
      : [
          {
            id: "status",
            message: passed ? "Quality gate OK" : `Quality gate ${status}`,
            passed: Boolean(passed),
            actual: status,
            threshold: "OK",
            comparator: "EQ" as const,
          },
        ];

  return {
    kind: "sonar" as const,
    testId: "sonar-quality-gate",
    passed: Boolean(passed),
    barTitle: options.barTitle ?? DEFAULT_BAR_TITLE,
    lang: options.lang ?? "ru",
    labels: options.labels ?? DEFAULT_LABELS,
    rules: displayRules,
    config: {
      profile,
      projectKey,
      conditions: options.profileConditions ?? [],
      source: resolveSonarQgInfoSource(options.source, projectStatus, profile, projectKey),
    },
    infoPayload: buildSonarQualityGateInfoPayload(projectStatus, options),
  };
}

export function renderSonarQualityGate(
  host: HTMLElement,
  options: {
    projectStatus?: SonarProjectStatus;
    profile?: string;
    profileConditions?: Array<Record<string, unknown>>;
    source?: SonarQgInfoSource;
    lang?: "ru" | "en";
    barTitle?: string;
    passed?: boolean;
    rules?: KitQualityGateRule[];
    labels?: QualityGateLabels;
  } = {},
) {
  if (options.projectStatus) {
    return renderQualityGate(host, sonarProjectStatusToQualityGateOptions(options.projectStatus, options));
  }

  return renderQualityGate(host, {
    kind: "sonar",
    testId: "sonar-quality-gate",
    barTitle: options.barTitle ?? DEFAULT_BAR_TITLE,
    lang: options.lang ?? "ru",
    labels: options.labels ?? DEFAULT_LABELS,
    passed: options.passed,
    rules: options.rules ?? [],
    config: {
      profile: options.profile ?? options.source?.profile,
      projectKey: options.source?.projectKey,
      conditions: options.profileConditions ?? [],
      source: resolveSonarQgInfoSource(
        options.source,
        { project_key: options.source?.projectKey },
        options.profile ?? options.source?.profile,
        options.source?.projectKey,
      ),
    },
    infoPayload: buildSonarQualityGateInfoPayload(
      {
        status: options.passed ? "OK" : "ERROR",
        passed: options.passed,
        project_key: options.source?.projectKey,
        conditions: [],
      },
      options,
    ),
  });
}
