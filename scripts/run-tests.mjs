#!/usr/bin/env node
/**
 * Unit test entry: ALLURE_RESULTS_DIR at repo root, allure-node-test, merge + gate.
 */
import { spawnSync } from "node:child_process";
import { ensureAllureResultsDir } from "./allure-env.mjs";

const { ALLURE_RESULTS_DIR } = ensureAllureResultsDir({ clean: true });

const result = spawnSync(
  "node",
  ["scripts/node-test-allure.mjs", "test/*.test.mjs"],
  {
    cwd: process.cwd(),
    env: { ...process.env, ALLURE_RESULTS_DIR },
    stdio: "inherit",
    shell: true,
  },
);

if (result.error) throw result.error;

const merge = spawnSync(
  "node",
  ["scripts/merge-allure-suite-meta.mjs", ALLURE_RESULTS_DIR],
  { cwd: process.cwd(), stdio: "inherit" },
);
if (merge.error) throw merge.error;
if ((merge.status ?? 1) !== 0) process.exit(merge.status ?? 1);

const gate = spawnSync(
  "node",
  ["scripts/check-allure-labels.mjs", ALLURE_RESULTS_DIR],
  { cwd: process.cwd(), stdio: "inherit" },
);
if (gate.error) throw gate.error;
if ((gate.status ?? 1) !== 0) process.exit(gate.status ?? 1);

console.log(`allure-results → ${ALLURE_RESULTS_DIR}`);
process.exit(result.status ?? 1);
