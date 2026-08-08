#!/usr/bin/env node
/**
 * Coverage gate (hard lines/statements on src/ config + allure layers):
 * Unit only — c8 on test/*.test.mjs via node --test.
 * Browser runtime (src/runtime/**) and soft-fork packages/** — outside % floor (e2e smoke).
 * Writes scratch Allure dir so coverage run does not pollute primary allure-results/.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { REPO_ROOT } from "./allure-env.mjs";

const scratch = path.join(REPO_ROOT, ".coverage-allure-tmp");
fs.mkdirSync(scratch, { recursive: true });

const configPath = path.join(REPO_ROOT, "c8.config.json");

const result = spawnSync(
  "npx",
  [
    "c8",
    "--config",
    configPath,
    process.execPath,
    "--test",
    "test/*.test.mjs",
  ],
  {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      ALLURE_RESULTS_DIR: scratch,
    },
    stdio: "inherit",
    shell: true,
  },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
