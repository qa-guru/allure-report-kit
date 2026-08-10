/**
 * Info popover payload + file-source resolution for quality-gate chrome.
 */
import type { KitQualityGateConfig, KitQualityGateData } from "../types.js";
import type { QgInfoFileSource } from "../runtime/qg-info.js";

export interface QualityGateInfoPayloadInput {
  passed?: boolean;
  rules?: KitQualityGateData["rules"];
  config?: KitQualityGateConfig;
  infoPayload?: Record<string, unknown>;
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

export function buildQualityGateInfoPayload(options: QualityGateInfoPayloadInput): Record<string, unknown> {
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

export function buildQualityGateInfoPayloadFromData(data: KitQualityGateData): Record<string, unknown> {
  if (data.infoPayload) {
    return data.infoPayload;
  }
  return buildQualityGateInfoPayload({
    passed: data.passed,
    rules: data.rules,
    config: data.config,
  });
}
