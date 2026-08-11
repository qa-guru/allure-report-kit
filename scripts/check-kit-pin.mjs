#!/usr/bin/env node
/**
 * In-repo fork packages must link the kit via `file:../..`, never registry semver.
 * publish-forks.mjs rewrites to KIT_VERSION only during publish, then restores.
 *
 * Usage: node scripts/check-kit-pin.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const KIT_DEP = "@qa-guru/allure-report-kit";
const CANON_PIN = "file:../..";

/** Packages that declare a direct kit dependency in git. */
const FORK_PACKAGES = [
  "packages/plugin-core",
  "packages/web-awesome",
  "packages/web-dashboard",
];

/** Normalize `file:` pins; trailing slash on `../..` is accepted. */
function normalizeKitPin(value) {
  if (typeof value !== "string" || !value.startsWith("file:")) {
    return value;
  }
  return value.replace(/\/+$/, "");
}

const failures = [];

for (const dir of FORK_PACKAGES) {
  const path = join(ROOT, dir, "package.json");
  const pkg = JSON.parse(readFileSync(path, "utf8"));
  const pin = pkg.dependencies?.[KIT_DEP];
  if (pin === undefined) {
    continue;
  }
  if (normalizeKitPin(pin) !== CANON_PIN) {
    failures.push(`FORBIDDEN: registry/semver kit pin in ${dir}/package.json: ${pin}`);
  }
}

if (failures.length > 0) {
  console.error(`check-kit-pin: FAIL (${failures.length})`);
  for (const failure of failures) {
    console.error(`  ${failure}`);
  }
  process.exit(1);
}

console.log(`check-kit-pin: OK — ${FORK_PACKAGES.length} packages pin ${KIT_DEP} as ${CANON_PIN}`);
