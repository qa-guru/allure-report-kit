#!/usr/bin/env node
/**
 * Publish soft-fork packages to npm.
 *
 * Repo keeps `file:` deps for local `npm run setup`. This script rewrites them
 * to registry versions for the publish, then restores package.json.
 *
 * Order: plugin-core → web-* → plugins (dependency order).
 *
 * Usage:
 *   node scripts/publish-forks.mjs           # real publish
 *   node scripts/publish-forks.mjs --dry-run
 *   node scripts/publish-forks.mjs --otp=123456
 */
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dryRun = process.argv.includes("--dry-run");
const otpArg = process.argv.find((arg) => arg.startsWith("--otp="));
const otp = process.env.NPM_OTP ?? (otpArg ? otpArg.slice("--otp=".length) : undefined);

const kit = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const KIT_VERSION = kit.version;

function readPkg(rel) {
  return JSON.parse(readFileSync(join(ROOT, rel, "package.json"), "utf8"));
}

const pluginCoreVersion = readPkg("packages/plugin-core").version;
const webAwesomeVersion = readPkg("packages/web-awesome").version;
const webDashboardVersion = readPkg("packages/web-dashboard").version;

/** @type {Array<{ dir: string, publishDeps?: Record<string, string>, files?: string[] }>} */
const PACKAGES = [
  {
    dir: "packages/plugin-core",
    publishDeps: { "@qa-guru/allure-report-kit": KIT_VERSION },
  },
  {
    dir: "packages/web-awesome",
    publishDeps: { "@qa-guru/allure-report-kit": KIT_VERSION },
    files: ["dist", "types.d.ts"],
  },
  {
    dir: "packages/web-dashboard",
    publishDeps: { "@qa-guru/allure-report-kit": KIT_VERSION },
    files: ["dist", "types.d.ts"],
  },
  {
    dir: "packages/plugin-awesome",
    publishDeps: {
      "@qa-guru/allure-report-kit-plugin-core": pluginCoreVersion,
      "@qa-guru/allure-report-kit-web-awesome": webAwesomeVersion,
    },
  },
  {
    dir: "packages/plugin-dashboard",
    publishDeps: {
      "@qa-guru/allure-report-kit-plugin-core": pluginCoreVersion,
      "@qa-guru/allure-report-kit-web-dashboard": webDashboardVersion,
    },
  },
];

function run(cwd, args) {
  const result = spawnSync("npm", args, { cwd, encoding: "utf8" });
  if (result.stdout?.trim()) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr?.trim()) {
    process.stderr.write(result.stderr);
  }
  if (result.status !== 0) {
    throw new Error(`npm ${args.join(" ")} failed in ${cwd} (exit ${result.status})`);
  }
}

/** True when this exact version is already on the registry. */
function alreadyPublished(name, version) {
  const result = spawnSync("npm", ["view", `${name}@${version}`, "version"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return result.status === 0 && result.stdout?.trim() === version;
}

function prepare(pkgPath, { publishDeps, files }) {
  const path = join(pkgPath, "package.json");
  const original = readFileSync(path, "utf8");
  const pkg = JSON.parse(original);

  if (publishDeps) {
    pkg.dependencies = { ...pkg.dependencies, ...publishDeps };
  }
  pkg.publishConfig = { ...pkg.publishConfig, access: "public" };
  if (files) {
    pkg.files = files;
  }

  writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
  return { path, original, name: pkg.name, version: pkg.version };
}

function restore(path, original) {
  writeFileSync(path, original);
}

async function main() {
  console.log(`publish-forks: kit@${KIT_VERSION}${dryRun ? " (dry-run)" : ""}`);

  // Web bundles must exist on disk before pack.
  run(ROOT, ["run", "build:fork"]);

  for (const spec of PACKAGES) {
    const pkgPath = join(ROOT, spec.dir);
    const prepared = prepare(pkgPath, spec);
    try {
      console.log(`\npublish-forks: ${prepared.name}@${prepared.version}`);
      if (alreadyPublished(prepared.name, prepared.version)) {
        console.log(
          `publish-forks: skip ${prepared.name}@${prepared.version} (already on npm)`,
        );
        continue;
      }
      const args = ["publish", "--access", "public", "--tag", "latest"];
      if (dryRun) {
        args.push("--dry-run");
      }
      if (otp) {
        args.push("--otp", otp);
      }
      run(pkgPath, args);
      console.log(`publish-forks: OK ${prepared.name}@${prepared.version}`);
    } finally {
      restore(prepared.path, prepared.original);
    }
  }

  console.log(`\npublish-forks: done (${PACKAGES.length} packages)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
