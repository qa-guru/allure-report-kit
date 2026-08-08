#!/usr/bin/env node
/**
 * Sanity-check what `npm pack` would ship.
 *
 * Runs before a tag release — build + test happen in CI first; this is the last
 * gate that the tarball matches `files` and carries no fork/e2e baggage.
 *
 * Usage: node scripts/npm-pack-check.mjs
 */
import { spawnSync } from "node:child_process";
import { readFileSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

if (pkg.publishConfig?.access !== "public") {
  console.error("npm-pack-check: publishConfig.access must be public");
  process.exit(1);
}

const pack = spawnSync("npm", ["pack", "--json", "--silent"], {
  cwd: ROOT,
  encoding: "utf8",
});
if (pack.status !== 0) {
  console.error(pack.stderr || pack.stdout);
  process.exit(pack.status ?? 1);
}

/** @type {Array<{ name: string, filename: string }>} */
const meta = JSON.parse(pack.stdout.trim());
const filename = meta[0]?.filename;
if (!filename) {
  console.error("npm-pack-check: npm pack returned no filename");
  process.exit(1);
}

const list = spawnSync("tar", ["-tzf", filename], { cwd: ROOT, encoding: "utf8" });
if (list.status !== 0) {
  console.error(list.stderr);
  unlinkSync(join(ROOT, filename));
  process.exit(list.status ?? 1);
}

const entries = list.stdout
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((line) => line.replace(/^package\//, ""));

unlinkSync(join(ROOT, filename));

const required = [
  "dist/index.js",
  "dist/index.d.ts",
  "dist/runtime/index.js",
  "dist/runtime/index.d.ts",
  "dist/theme/header.bundle.js",
  "dist/theme/header.inline.css",
  "src/theme/kit.css",
  "README.md",
  "LICENSE",
  "package.json",
];

const forbiddenPrefixes = [
  "test/",
  "e2e/",
  "dogfood/",
  "packages/",
  "allure-results/",
  "allure-report/",
  "scripts/",
  ".github/",
];

const failures = [];

for (const path of required) {
  if (!entries.includes(path)) {
    failures.push(`missing required file: ${path}`);
  }
}

for (const path of entries) {
  for (const prefix of forbiddenPrefixes) {
    if (path.startsWith(prefix)) {
      failures.push(`forbidden path in tarball: ${path}`);
    }
  }
}

if (failures.length > 0) {
  console.error(`npm-pack-check: FAIL (${failures.length})`);
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log(`npm-pack-check: OK — ${entries.length} files, access=${pkg.publishConfig.access}`);
