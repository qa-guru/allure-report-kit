/**
 * Explicit Allure suite labels for allure-report-kit tests (declareSuite SSOT).
 * Model mirrors @allure-notifications/test-meta — one declareSuite() per node:test file.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const DEFAULT_EPIC = "allure-report-kit";

const REGISTRY_DIRNAME = ".suite-meta-registry.d";

function registryDir() {
  const dir = process.env.ALLURE_RESULTS_DIR;
  if (!dir) {
    throw new Error("declareSuite: ALLURE_RESULTS_DIR is not set");
  }
  return path.join(dir, REGISTRY_DIRNAME);
}

/** @param {string} sourceFile */
export function normalizeTestFileKeys(sourceFile) {
  const abs = path.resolve(sourceFile);
  const keys = new Set([abs, abs.replace(/\\/g, "/")]);
  const posix = abs.replace(/\\/g, "/");
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..").replace(/\\/g, "/");
  if (posix.startsWith(`${root}/`)) {
    keys.add(posix.slice(root.length + 1));
  }
  return [...keys];
}

/** @param {string | undefined} stack */
export function resolveDeclareSuiteCaller(stack) {
  const skipPatterns = ["test-meta", "declareSuite", "resolveDeclareSuiteCaller"];
  for (const line of (stack ?? "").split("\n")) {
    if (skipPatterns.some((part) => line.includes(part))) continue;
    const match =
      line.match(/\(([^)]+:\d+:\d+)\)/) ??
      line.match(/at (file:\/\/[^\s]+)/) ??
      line.match(/at ([^\s()]+:\d+:\d+)/);
    if (!match?.[1]) continue;
    const filePart = match[1].replace(/^file:\/\//, "").replace(/:\d+:\d+$/, "");
    if (filePart.includes(".test.") || filePart.includes(".spec.")) {
      return filePart;
    }
  }
  throw new Error("declareSuite: unable to resolve caller test file from stack");
}

/**
 * @param {string} sourceFile
 * @param {{
 *   epic?: string;
 *   feature: string;
 *   story: string;
 *   layer: "unit" | "e2e";
 *   component?: string;
 *   severity: "blocker" | "critical" | "normal" | "minor" | "trivial";
 * }} meta
 */
export function registerSuiteMeta(sourceFile, meta) {
  /** @type {Record<string, string>} */
  const entry = {
    epic: meta.epic ?? DEFAULT_EPIC,
    feature: meta.feature,
    story: meta.story,
    layer: meta.layer,
    severity: meta.severity,
  };
  if (meta.component) {
    entry.component = meta.component;
  }

  const dir = registryDir();
  fs.mkdirSync(dir, { recursive: true });
  const keys = normalizeTestFileKeys(sourceFile);
  const shardId = crypto.createHash("sha1").update(sourceFile).digest("hex");
  fs.writeFileSync(
    path.join(dir, `${shardId}.json`),
    `${JSON.stringify({ keys, entry }, null, 2)}\n`,
    "utf8",
  );
}

/** Declare suite-level Allure labels once per test file. */
export function declareSuite(meta) {
  registerSuiteMeta(resolveDeclareSuiteCaller(new Error().stack), meta);
}

/** Build label rows for ReporterRuntime smoke cases. */
export function suiteLabels(meta) {
  /** @type {{ name: string; value: string }[]} */
  const rows = [
    { name: "epic", value: meta.epic ?? DEFAULT_EPIC },
    { name: "feature", value: meta.feature },
    { name: "story", value: meta.story },
    { name: "layer", value: meta.layer },
    { name: "severity", value: meta.severity },
  ];
  if (meta.component) {
    rows.push({ name: "component", value: meta.component });
  }
  return rows;
}
