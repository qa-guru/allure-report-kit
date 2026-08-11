#!/usr/bin/env node
/**
 * One-command bootstrap for a fresh clone.
 *
 * The workspaces are linked with `file:` rather than an npm workspace root,
 * because each forked bundle needs its own (large, upstream) dependency tree.
 * That means install order matters and is easy to get wrong by hand: the kit
 * must be built before anything resolves its `dist`, and the forks must be
 * installed before the plugins can find their bundles.
 *
 * Usage: npm run setup
 */
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function runNode(label, script) {
  process.stdout.write(`setup: ${label}\n`);
  const result = spawnSync("node", [script], { cwd: ROOT, stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`setup: FAILED at ${label}`);
    process.exit(result.status ?? 1);
  }
}

runNode("check-kit-pin", "scripts/check-kit-pin.mjs");

/** Install order is a dependency order, not an alphabet. */
const STEPS = [
  { label: "kit", dir: ".", install: true, build: true },
  { label: "plugin-core", dir: "packages/plugin-core", install: true },
  { label: "web-awesome", dir: "packages/web-awesome", install: true, build: true },
  { label: "web-dashboard", dir: "packages/web-dashboard", install: true, build: true },
  { label: "plugin-awesome", dir: "packages/plugin-awesome", install: true },
  { label: "plugin-dashboard", dir: "packages/plugin-dashboard", install: true },
  { label: "e2e", dir: "e2e", install: true },
];

function run(label, args, cwd) {
  process.stdout.write(`setup: ${label} — npm ${args.join(" ")}\n`);
  const result = spawnSync("npm", args, { cwd, stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`setup: FAILED at ${label} (npm ${args.join(" ")})`);
    process.exit(result.status ?? 1);
  }
}

for (const step of STEPS) {
  const cwd = join(ROOT, step.dir);
  if (step.install) {
    run(step.label, ["install", "--silent"], cwd);
  }
  if (step.build) {
    run(step.label, ["run", "build", "--silent"], cwd);
  }
}

console.log(`
setup: OK

  npm run verify         unit tests + dogfood smoke
  npm run report         generate the real Allure reports (e2e/allure-report)
  npm run smoke:report   check both generated reports

Stands (from the monorepo root):
  python scripts/stands/ensure.py ark-dogfood   # :3021
  python scripts/stands/ensure.py ark-report    # :3024
`);
