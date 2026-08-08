#!/usr/bin/env node
/**
 * Keep the soft-fork packages and the Allure 3 they fork on one version.
 *
 * The forked bundles are upstream source with a four-file delta, so their
 * version mirrors the upstream release they track: `3.14.x`, where the patch is
 * the fork revision. `allureUpstream` records the exact upstream version, which
 * the version alone stops telling once the fork ships a revision of its own.
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
    minorOf(json.version) === minorOf(upstream),
    `${dir}: version ${json.version} does not mirror upstream ${upstream} — the fork tracks a release, not a product of its own`,
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
    minorOf(installed) === minorOf(upstream),
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
