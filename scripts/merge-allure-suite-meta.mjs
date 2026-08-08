#!/usr/bin/env node
/**
 * Merge declareSuite registry labels into Allure *-result.json.
 * Simplified for allure-report-kit: test/*.test.mjs at repo root.
 */
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { REPO_ROOT } from "./allure-env.mjs";

const RESULT_SUFFIX = "-result.json";
const REGISTRY_DIRNAME = ".suite-meta-registry.d";
const SUITE_LABELS = ["epic", "feature", "story", "layer", "severity", "component"];

const PACKAGE_SCOPE_DIRS = {
  "@qa-guru/allure-report-kit": ".",
  "allure-report-kit": ".",
};

/** @param {string} dotted */
function dottedPathToRelPath(dotted) {
  const parts = dotted.split(".");
  const suffixes = ["test.mjs", "test.js", "test.ts", "spec.js", "spec.ts"];
  for (const suffix of suffixes) {
    const suffixParts = suffix.split(".");
    if (parts.length < suffixParts.length + 1) continue;
    const tail = parts.slice(-suffixParts.length).join(".");
    if (tail !== suffix) continue;
    const base = parts[parts.length - suffixParts.length - 1];
    const dirParts = parts.slice(0, -suffixParts.length - 1);
    const filename = `${base}.${suffix}`;
    return dirParts.length ? `${dirParts.join("/")}/${filename}` : filename;
  }
  return dotted.replace(/\./g, "/");
}

/** @param {string} scope @param {string} dotted */
function scopeAndDottedToKeys(scope, dotted) {
  const dir = PACKAGE_SCOPE_DIRS[scope];
  if (!dir) return [];
  return [`${dir}/${dottedPathToRelPath(dotted)}`.replace(/^\.\//, "")];
}

/** @param {string} label */
function packageLabelToKeys(label) {
  if (!label) return [];
  if (label.startsWith("@")) {
    const dot = label.indexOf(".", label.indexOf("/"));
    if (dot < 0) return [];
    return scopeAndDottedToKeys(label.slice(0, dot), label.slice(dot + 1));
  }
  const dot = label.indexOf(".");
  if (dot < 0) return [];
  return scopeAndDottedToKeys(label.slice(0, dot), label.slice(dot + 1));
}

/** @param {string} fullName */
function fullNameToKeys(fullName) {
  if (typeof fullName !== "string") return [];
  const head = fullName.split("#")[0] ?? fullName;
  const colon = head.indexOf(":");
  if (colon < 0) return [];
  const scope = head.slice(0, colon);
  const rel = head.slice(colon + 1).replace(/^\//, "");
  if (!rel) return [];
  const dir = PACKAGE_SCOPE_DIRS[scope];
  if (!dir) return [];
  return [`${dir}/${rel}`.replace(/^\.\//, "")];
}

/** @param {unknown} raw */
function labelValue(raw, name) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.labels)) return "";
  for (const row of raw.labels) {
    if (row?.name === name && row.value) return String(row.value);
  }
  return "";
}

/** @param {string} resultsDir */
async function loadRegistry(resultsDir) {
  /** @type {Record<string, object>} */
  const registry = {};
  const shardDir = join(resultsDir, REGISTRY_DIRNAME);
  let shards = [];
  try {
    shards = await readdir(shardDir);
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code !== "ENOENT") throw err;
  }
  for (const name of shards) {
    if (!name.endsWith(".json")) continue;
    const raw = JSON.parse(await readFile(join(shardDir, name), "utf8"));
    const entry = raw?.entry;
    const keys = Array.isArray(raw?.keys) ? raw.keys : [];
    if (!entry || typeof entry !== "object") continue;
    for (const key of keys) {
      if (typeof key === "string") registry[key] = entry;
    }
  }
  return registry;
}

/** @param {Record<string, object>} registry @param {string[]} candidates */
function lookupRegistry(registry, candidates) {
  for (const key of candidates) {
    const hit = registry[key];
    if (hit) return hit;
  }
  return undefined;
}

/** @param {unknown} raw @param {Record<string, object>} registry */
function resolveRegistryEntry(raw, registry) {
  const pkg = labelValue(raw, "package");
  /** @type {string[]} */
  const candidates = [
    ...packageLabelToKeys(pkg),
    ...fullNameToKeys(typeof raw.fullName === "string" ? raw.fullName : ""),
  ];
  return lookupRegistry(registry, candidates);
}

/** @param {string} dir */
async function walkResults(dir) {
  /** @type {string[]} */
  const out = [];
  async function walk(current, depth) {
    if (depth > 8) return;
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = join(current, ent.name);
      if (ent.isDirectory()) {
        await walk(full, depth + 1);
      } else if (ent.isFile() && ent.name.endsWith(RESULT_SUFFIX)) {
        out.push(full);
      }
    }
  }
  await walk(dir, 0);
  return out;
}

/** @param {unknown[]} labels @param {Record<string, string>} meta */
function mergeLabels(labels, meta) {
  const existing = new Set(
    labels
      .filter((row) => row && typeof row === "object" && row.name)
      .map((row) => /** @type {{ name: string }} */ (row).name),
  );
  const merged = [...labels];
  for (const key of SUITE_LABELS) {
    const value = meta[key];
    if (!value?.trim() || existing.has(key)) continue;
    merged.push({ name: key, value: value.trim() });
    existing.add(key);
  }
  return merged;
}

/**
 * @param {string} resultsDir
 * @param {{ keepRegistry?: boolean }} [opts]
 */
export async function mergeAllureSuiteMeta(resultsDir, opts = {}) {
  const registry = await loadRegistry(resultsDir);
  if (Object.keys(registry).length === 0) {
    return { total: 0, merged: 0, missingRegistry: true };
  }

  const files = await walkResults(resultsDir);
  let merged = 0;

  for (const file of files) {
    const raw = JSON.parse(await readFile(file, "utf8"));
    const entry = resolveRegistryEntry(raw, registry);
    if (!entry) continue;

    const labels = Array.isArray(raw.labels) ? raw.labels : [];
    const next = mergeLabels(labels, entry);
    if (next.length === labels.length) continue;

    raw.labels = next;
    await writeFile(file, `${JSON.stringify(raw)}\n`, "utf8");
    merged += 1;
  }

  if (!opts.keepRegistry) {
    await rm(join(resultsDir, REGISTRY_DIRNAME), { recursive: true, force: true });
  }

  return { total: files.length, merged, missingRegistry: false };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir =
    process.argv[2] ||
    process.env.ALLURE_RESULTS_DIR ||
    join(REPO_ROOT, "allure-results");
  const { total, merged, missingRegistry } = await mergeAllureSuiteMeta(dir);

  if (missingRegistry) {
    console.warn(`merge-allure-suite-meta: no registry shards in ${dir} (skip merge)`);
    process.exit(0);
  }

  console.log(`merge-allure-suite-meta: ${merged}/${total} results updated (${dir})`);
}
