#!/usr/bin/env node
/**
 * Build a real Allure 3 report with the kit plugin.
 *
 * Runs the generator three times over a shifting fixture so history exists and
 * the duration trend has more than one point — the tile is meaningless with a
 * single run.
 *
 * Usage: node run.mjs [runs]
 */
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { makeFixture } from "./make-fixture.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const RUNS = Number(process.argv[2] ?? 3);

rmSync(join(ROOT, "allure-report"), { recursive: true, force: true });
rmSync(join(ROOT, "history.jsonl"), { force: true });

for (let run = 0; run < RUNS; run += 1) {
  await makeFixture({ run, seed: run + 1 });

  const result = spawnSync(
    join(ROOT, "node_modules/.bin/allure"),
    ["generate", "allure-results", "--config", "allurerc.mjs", "--output", "allure-report"],
    { cwd: ROOT, encoding: "utf8" },
  );

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (output) {
    console.log(output);
  }
  if (result.status !== 0) {
    console.error(`allure generate failed on run ${run} (exit ${result.status})`);
    process.exit(1);
  }
  // Allure swallows plugin failures and still exits 0 — catch them explicitly.
  if (/plugin \w+ error|Cannot resolve plugin/.test(output)) {
    console.error(`plugin failed on run ${run} — see output above`);
    process.exit(1);
  }
}

console.log(`report: ${join(ROOT, "allure-report/awesome/index.html")}`);
