/**
 * DS `quality-gate` primitive in TypeScript — kept in sync with
 * design-system/js/quality-gate.js (vendored CSS via sync:ds).
 *
 * Data → layout IR → DOM paint. Popover UX lives in qg-info.ts.
 */
import { buildQualityGateLayout } from "../quality-gate/layout/build.js";
import type { QualityGateLayout } from "../quality-gate/layout/types.js";
import {
  buildQualityGateInfoPayload,
  resolveQualityGateFileSource,
} from "../quality-gate/info-payload.js";
import {
  formatQualityGateRuleFormula,
  resolveQualityGateRuleExpected,
} from "../quality-gate/rule-format.js";
import type {
  KitQualityGateData,
  KitQualityGateRule,
  QualityGateLabels,
} from "../types.js";
import { createQgInfo, type QgInfoFileSource } from "./qg-info.js";

export {
  buildQualityGateInfoPayload,
  resolveQualityGateFileSource,
} from "../quality-gate/info-payload.js";
export {
  formatQualityGateRuleFormula,
  resolveQualityGateRuleExpected,
} from "../quality-gate/rule-format.js";

export interface QualityGateRenderOptions {
  passed?: boolean;
  title?: string;
  barTitle?: string;
  kind?: "allure" | "sonar";
  testId?: string;
  rules?: KitQualityGateRule[];
  config?: KitQualityGateData["config"];
  infoPayload?: Record<string, unknown>;
  labels?: QualityGateLabels;
  lang?: "ru" | "en";
}

function optionsToQualityGateData(options: QualityGateRenderOptions): KitQualityGateData {
  return {
    passed: Boolean(options.passed),
    rules: options.rules ?? [],
    kind: options.kind,
    testId: options.testId,
    title: options.title,
    barTitle: options.barTitle ?? options.title,
    config: options.config,
    infoPayload: options.infoPayload,
    labels: options.labels,
    lang: options.lang,
  };
}

function paintQualityGateBody(body: QualityGateLayout["body"]): HTMLElement {
  const node = document.createElement("div");
  node.className = "quality-gate__body";

  if (body.mode === "passed") {
    const verdict = document.createElement("p");
    verdict.className = "quality-gate__verdict quality-gate__verdict--ok";
    verdict.textContent = body.verdict;
    node.append(verdict);
    return node;
  }

  if (!body.rows.length) {
    return node;
  }

  const list = document.createElement("ul");
  list.className = "quality-gate__rules";
  for (const row of body.rows) {
    const item = document.createElement("li");
    item.className = "quality-gate__rule";

    const idCell = document.createElement("div");
    idCell.className = "quality-gate__rule-id";
    idCell.textContent = row.id;

    const detail = document.createElement("div");
    detail.className = "quality-gate__rule-detail";

    const message = document.createElement("p");
    message.className = "quality-gate__message";
    message.textContent = row.message;
    detail.append(message);

    if (row.formula) {
      const formulaEl = document.createElement("p");
      formulaEl.className = "quality-gate__formula";
      formulaEl.textContent = row.formula;
      detail.append(formulaEl);
    }

    item.append(idCell, detail);
    list.append(item);
  }
  node.append(list);
  return node;
}

/**
 * Paint a quality-gate scene into a host element (T3 DOM adapter).
 */
export function paintQualityGateLayout(
  host: HTMLElement,
  layout: QualityGateLayout,
): { hidden: boolean; passed?: boolean } {
  if (layout.hidden) {
    host.replaceChildren();
    host.hidden = true;
    return { hidden: true };
  }

  host.hidden = false;

  const root = document.createElement("div");
  root.className = `quality-gate quality-gate--${layout.kind} quality-gate--${layout.passed ? "passed" : "failed"}`;
  root.setAttribute("role", "status");
  root.dataset.testid = layout.testId;
  root.setAttribute("aria-label", layout.ariaLabel);

  const bar = document.createElement("div");
  bar.className = "quality-gate__bar";

  const indicator = document.createElement("span");
  indicator.className = `indicator indicator--${layout.bar.indicatorStatus} indicator--solid`;
  indicator.setAttribute("aria-hidden", "true");

  const barTitleEl = document.createElement("span");
  barTitleEl.className = "quality-gate__bar-title";
  barTitleEl.textContent = layout.bar.title;

  // Same chrome order as widget-tile: status left, title flexes right, trailing action.
  bar.append(indicator, barTitleEl);

  if (layout.bar.info.enabled && layout.bar.info.payload) {
    const fileSource = layout.bar.info.fileSource as QgInfoFileSource | undefined;
    bar.append(createQgInfo(layout.bar.info.payload, fileSource));
  }

  root.append(bar, paintQualityGateBody(layout.body));
  host.replaceChildren(root);
  return { hidden: false, passed: layout.passed };
}

export function renderQualityGate(
  host: HTMLElement,
  options: QualityGateRenderOptions = {},
): { hidden: boolean; passed?: boolean } {
  const layout = buildQualityGateLayout(optionsToQualityGateData(options));
  return paintQualityGateLayout(host, layout);
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

  const layout = buildQualityGateLayout(data);
  const result = paintQualityGateLayout(host, layout);
  return !result.hidden;
}
