/**
 * DS `quality-gate` primitive in TypeScript — kept in sync with
 * design-system/js/quality-gate.js (vendored CSS via sync:ds).
 */
import type { KitQualityGateData, QualityGateLabel } from "../types.js";

const DEFAULT_LABELS = {
  passed: { en: "Quality gate passed", ru: "Quality gate пройден" },
  failed: { en: "Quality gate failed", ru: "Quality gate не пройден" },
} as const;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

export function renderQualityGateHost(host: HTMLElement, data: KitQualityGateData): boolean {
  const rules = data.rules ?? [];
  if (!rules.length) {
    host.replaceChildren();
    host.hidden = true;
    const tile = host.closest<HTMLElement>(".widget-tile");
    if (tile) {
      tile.hidden = true;
    }
    return false;
  }

  const passed = Boolean(data.passed);
  const lang = data.lang ?? "ru";
  const title =
    resolveLabel(data.labels?.[passed ? "passed" : "failed"], passed ? "passed" : "failed", lang);

  host.hidden = false;
  const tile = host.closest<HTMLElement>(".widget-tile");
  if (tile) {
    tile.hidden = false;
  }

  const root = document.createElement("div");
  root.className = `quality-gate quality-gate--${passed ? "passed" : "failed"}`;
  root.setAttribute("role", "status");
  root.dataset.testid = "quality-gate";
  root.setAttribute("aria-label", title);

  const titleEl = document.createElement("p");
  titleEl.className = "quality-gate__title";
  titleEl.textContent = title;
  root.append(titleEl);

  if (!passed) {
    const failedRules = rules.filter((rule) => !rule.passed);
    if (failedRules.length) {
      const list = document.createElement("ul");
      list.className = "quality-gate__rules";
      for (const rule of failedRules) {
        const item = document.createElement("li");
        item.className = "quality-gate__rule";
        item.innerHTML = `<span class="quality-gate__message">${escapeHtml(rule.message)}</span><span class="quality-gate__rule-id">${escapeHtml(rule.id)}</span>`;
        list.append(item);
      }
      root.append(list);
    }
  }

  host.replaceChildren(root);
  return true;
}
