#!/usr/bin/env node
/**
 * Playwright smoke tests → Allure results (ReporterRuntime wrapper).
 * Does not rewrite smoke assertions — runs existing smoke-ci.mjs subprocesses.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Status } from "allure-js-commons";
import { ReporterRuntime, FileSystemWriter } from "allure-js-commons/sdk/reporter";

import { ensureAllureResultsDir } from "./allure-env.mjs";
import { suiteLabels } from "../test/test-meta.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** @param {string} command @param {string[]} args */
function run(command, args) {
  return new Promise((done) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: "inherit" });
    child.on("close", (code) => done(code ?? 1));
  });
}

/**
 * @param {import("allure-js-commons/sdk/reporter").ReporterRuntime} runtime
 * @param {{ name: string; meta: Parameters<typeof suiteLabels>[0]; fn: () => Promise<number> }} spec
 */
async function recordSmoke(runtime, spec) {
  const labels = suiteLabels(spec.meta);
  const scope = runtime.startScope();
  runtime.updateScope(scope, (s) => {
    s.labels = labels;
  });

  const testUuid = runtime.startTest({ name: spec.name, labels }, [scope]);
  const code = await spec.fn();
  const status = code === 0 ? Status.PASSED : Status.FAILED;

  runtime.updateTest(testUuid, (t) => {
    t.status = status;
    if (status === Status.FAILED) {
      t.statusDetails = { message: `${spec.name} exited with code ${code}` };
    }
  });
  runtime.stopTest(testUuid);
  runtime.writeTest(testUuid);
  runtime.writeScope(scope);

  return code;
}

const { ALLURE_RESULTS_DIR } = ensureAllureResultsDir({
  clean: process.env.ALLURE_RESULTS_CLEAN !== "0",
});

const writer = new FileSystemWriter({ resultsDir: ALLURE_RESULTS_DIR });
const runtime = new ReporterRuntime({
  writer,
  globalLabels: [
    { name: "framework", value: "playwright-smoke" },
    { name: "language", value: "javascript" },
  ],
});

const E2E_META = {
  feature: "smoke",
  story: "Headless browser smoke",
  layer: "e2e",
  component: "allure-report-kit",
  severity: "blocker",
};

let failed = false;

const dogfoodCode = await recordSmoke(runtime, {
  name: "smoke dogfood stand",
  meta: { ...E2E_META, story: "Dogfood stand smoke" },
  fn: () => run("node", ["scripts/smoke-ci.mjs", "dogfood"]),
});
if (dogfoodCode !== 0) failed = true;

const reportRequires = join(ROOT, "e2e/allure-report/awesome/index.html");
if (!existsSync(reportRequires)) {
  console.error("run-smoke-allure: e2e report missing — run `npm run report` first");
  failed = true;
} else {
  const reportCode = await recordSmoke(runtime, {
    name: "smoke generated reports",
    meta: { ...E2E_META, story: "Soft-fork report smoke" },
    fn: () => run("node", ["scripts/smoke-ci.mjs", "report"]),
  });
  if (reportCode !== 0) failed = true;
}

const labelGate = spawnSync("node", ["scripts/check-allure-labels.mjs", ALLURE_RESULTS_DIR], {
  cwd: ROOT,
  stdio: "inherit",
});
if ((labelGate.status ?? 1) !== 0) process.exit(labelGate.status ?? 1);

console.log(`allure-results (e2e) → ${ALLURE_RESULTS_DIR}`);
process.exit(failed ? 1 : 0);
