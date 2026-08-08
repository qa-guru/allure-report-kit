#!/usr/bin/env node
/**
 * Keep the soft-fork packages and the Allure 3 they fork on one version.
 *
 * Versioning (hard rule):
 *   - `allureUpstream` = exact upstream Allure release the fork is built from
 *     (e.g. 3.14.3).
 *   - `version` = that same number, or a fork revision under it:
 *       3.14.3        — first publish for this upstream pin
 *       3.14.3-1      — our 1st revision while upstream stays 3.14.3
 *       3.14.3-2      — our 2nd revision, …
 *     (npm rejects four-segment `3.14.3.1`; use `3.14.3-N` instead.)
 *   - NEVER invent 3.14.4 / 3.14.5 while upstream is still 3.14.3.
 *     Those numbers belong to Allure. When upstream ships 3.14.4, we move
 *     `allureUpstream` (and `version`) to 3.14.4, then 3.14.4-1 for our
 *     revisions of that pin.
 *
 * What drifts in practice is not the number in `version` but one forgotten
 * `@allurereport/*` range in one package, so every declared range is checked
 * against the same pin rather than against its neighbour.
 *
 * Usage: node scripts/check-upstream.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Packages that mirror upstream, plus the ones that only depend on it. */
const FORK_PACKAGES = [
  "packages/web-awesome",
  "packages/web-dashboard",
  "packages/plugin-awesome",
  "packages/plugin-dashboard",
];

const failures = [];
const check = (condition, message) => {
  if (!condition) {
    failures.push(message);
  }
};

const readPackage = (dir) => JSON.parse(readFileSync(join(ROOT, dir, "package.json"), "utf8"));

const minorOf = (version) => version.split(".").slice(0, 2).join(".");

/** Upstream pin, or upstream + `-N` fork revision (N ≥ 1). */
const isForkVersionOf = (version, upstream) => {
  if (version === upstream) {
    return true;
  }
  const escaped = upstream.replaceAll(".", String.raw`\.`);
  return new RegExp(`^${escaped}-([1-9]\\d*)$`).test(version);
};

const manifests = FORK_PACKAGES.map((dir) => ({ dir, json: readPackage(dir) }));

const pins = new Set(manifests.map(({ json }) => json.allureUpstream));
check(
  pins.size === 1 && !pins.has(undefined),
  `fork packages disagree on allureUpstream: ${[...pins].join(", ")}`,
);

const upstream = manifests[0].json.allureUpstream;
const expectedRange = `~${minorOf(upstream)}.0`;

for (const { dir, json } of manifests) {
  check(
    isForkVersionOf(json.version, upstream),
    `${dir}: version ${json.version} is not ${upstream} or ${upstream}-N — ` +
      `do not invent patches ahead of upstream (that number belongs to Allure)`,
  );

  // An exact pin is right for what the fork compiles against, a `~range` for
  // what the consumer installs beside it; both have to name the same minor.
  for (const field of ["dependencies", "devDependencies"]) {
    for (const [name, range] of Object.entries(json[field] ?? {})) {
      if (name.startsWith("@allurereport/")) {
        check(
          range === upstream,
          `${dir}: ${field}.${name} is "${range}", expected the exact pin "${upstream}"`,
        );
      }
    }
  }
  for (const [name, range] of Object.entries(json.peerDependencies ?? {})) {
    if (name.startsWith("@allurereport/")) {
      check(
        range === expectedRange,
        `${dir}: peerDependencies.${name} is "${range}", expected "${expectedRange}"`,
      );
    }
  }
}

// The kit itself is versioned as a product, but it reads upstream chart data.
const kit = readPackage(".");
for (const [name, range] of Object.entries(kit.peerDependencies ?? {})) {
  if (name.startsWith("@allurereport/")) {
    check(
      range === expectedRange,
      `package.json: peerDependencies.${name} is "${range}", expected "${expectedRange}"`,
    );
  }
}

/**
 * The generator the e2e actually runs.
 *
 * A fork built against one release and exercised against another is the failure
 * this whole gate exists for, and it is invisible in the manifests alone.
 */
let installed;
try {
  installed = JSON.parse(
    readFileSync(join(ROOT, "e2e/node_modules/@allurereport/plugin-awesome/package.json"), "utf8"),
  ).version;
  check(
    installed === upstream,
    `e2e runs @allurereport/plugin-awesome ${installed} while the fork tracks ${upstream}`,
  );
} catch {
  installed = "not installed";
}

if (failures.length > 0) {
  console.error(`check-upstream: FAIL (${failures.length})`);
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log(
  `check-upstream: OK — fork tracks Allure ${upstream}, peers ${expectedRange}, e2e runs ${installed}`,
);
