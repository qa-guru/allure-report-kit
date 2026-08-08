#!/usr/bin/env node
/**
 * Type-check the soft-fork delta.
 *
 * The two forks are asymmetric, and pretending otherwise is how a broken delta
 * ships green:
 *
 *   web-dashboard — upstream's own source type-checks, so the whole project is
 *                   checked and any error fails;
 *   web-awesome   — upstream's `tsconfig.json` references `tsconfig.node.json`,
 *                   which makes it a solution config: `tsc -p .` checks nothing
 *                   and fork-ts-checker stays inert. `tsconfig.delta.json` is the
 *                   checkable variant, and it surfaces errors that were already
 *                   there — that source never type-checked outside the allure3
 *                   monorepo.
 *
 * So for Awesome the gate is: every error must live outside the delta, and the
 * number of upstream errors must not grow. A budget rather than a clean bill,
 * but a real one — a type error introduced in the seam fails the run.
 *
 * Usage: node scripts/typecheck-fork.mjs
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Files that differ from upstream. Keep in step with soft-fork/README.md. */
const AWESOME_DELTA = [
  "src/components/Charts/index.tsx",
  "src/components/Charts/stockWidgets.tsx",
  "src/index.tsx",
];

const DASHBOARD_DELTA = [
  "src/components/Dashboard/index.tsx",
  "src/components/Dashboard/stockWidgets.tsx",
  "src/index.tsx",
];

/**
 * Errors upstream's own `web-awesome` source produces under a config that
 * actually checks it. Measured, not guessed — see the header. Lower it when
 * upstream fixes something; a rise means the fork introduced it.
 */
const UPSTREAM_AWESOME_BUDGET = 19;

const ERROR_LINE = /^(\S+?)\((\d+),(\d+)\): error (TS\d+): (.+)$/;

function typecheck(pkg, config) {
  const result = spawnSync("npx", ["tsc", "-p", config, "--noEmit"], {
    cwd: resolve(ROOT, "packages", pkg),
    encoding: "utf8",
  });

  const errors = [];
  for (const line of (result.stdout ?? "").split("\n")) {
    const match = ERROR_LINE.exec(line.trim());
    if (match) {
      errors.push({ file: match[1], code: match[4], message: match[5] });
    }
  }
  return { errors, stderr: result.stderr ?? "" };
}

const failures = [];

// ---- Dashboard: upstream is clean, so everything must be ----------------------

const dashboard = typecheck("web-dashboard", "tsconfig.json");
for (const error of dashboard.errors) {
  failures.push(`web-dashboard ${error.file}: ${error.code} ${error.message}`);
}
if (dashboard.stderr.trim()) {
  failures.push(`web-dashboard: tsc failed to run — ${dashboard.stderr.trim()}`);
}

// ---- Awesome: the delta must be clean, upstream must not get worse -----------

const awesome = typecheck("web-awesome", "tsconfig.delta.json");
if (awesome.stderr.trim()) {
  failures.push(`web-awesome: tsc failed to run — ${awesome.stderr.trim()}`);
}

const inDelta = awesome.errors.filter((error) =>
  AWESOME_DELTA.some((file) => error.file === file || error.file.endsWith(`/${file}`)),
);
for (const error of inDelta) {
  failures.push(`web-awesome ${error.file}: ${error.code} ${error.message}`);
}

const upstreamCount = awesome.errors.length - inDelta.length;
if (upstreamCount > UPSTREAM_AWESOME_BUDGET) {
  failures.push(
    `web-awesome: ${upstreamCount} upstream errors, budget is ${UPSTREAM_AWESOME_BUDGET}. ` +
      "If they are genuinely upstream's, raise the budget in this script and say why.",
  );
}

// A shrinking count is good news, but a stale budget hides a regression later.
if (upstreamCount < UPSTREAM_AWESOME_BUDGET) {
  console.log(
    `typecheck-fork: upstream web-awesome errors down to ${upstreamCount} ` +
      `(budget ${UPSTREAM_AWESOME_BUDGET}) — lower the budget.`,
  );
}

if (failures.length > 0) {
  console.error(`typecheck-fork: FAIL (${failures.length})`);
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log(
  `typecheck-fork: OK — dashboard clean, awesome delta clean ` +
    `(${AWESOME_DELTA.length + DASHBOARD_DELTA.length} files, ${upstreamCount} upstream errors ignored)`,
);
