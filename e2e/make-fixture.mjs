#!/usr/bin/env node
/**
 * Deterministic allure-results fixture.
 *
 * The e2e must not depend on somebody's build output, so it generates its own
 * run: 18 tests spread over the six canon layers with a realistic status mix,
 * enough to populate the locked 2×2 (donut, pyramid, durations by layer) and,
 * after a few runs, the duration trend.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(ROOT, "allure-results");

/** layer → [total, failed, broken, skipped]; the rest pass. */
const LAYERS = {
  unit: [12, 0, 0, 0],
  component: [8, 1, 0, 0],
  integration: [5, 0, 1, 0],
  api: [4, 0, 0, 1],
  e2e: [3, 1, 0, 0],
  manual: [2, 0, 0, 0],
};

const BASE_DURATION = { unit: 300, component: 1200, integration: 3500, api: 1800, e2e: 12000, manual: 25000 };

function statusFor(index, [, failed, broken, skipped]) {
  if (index < failed) {
    return "failed";
  }
  if (index < failed + broken) {
    return "broken";
  }
  if (index < failed + broken + skipped) {
    return "skipped";
  }
  return "passed";
}

/**
 * Churn between runs.
 *
 * Without it every run is identical and the history-driven charts (status
 * transitions, test base growth) are all zeroes — they render an empty grid and
 * prove nothing. One flipping test and one appearing test are enough.
 */
function churn(layer, index, run) {
  if (layer === "component" && index === 1) {
    return { status: run % 2 === 0 ? "passed" : "failed" };
  }
  if (layer === "api" && index === 3) {
    return { skip: run === 0 };
  }
  return {};
}

/** `run` shifts durations so a repeated generate produces a visible trend. */
export async function makeFixture({ run = 0, seed = 1 } = {}) {
  await rm(RESULTS_DIR, { recursive: true, force: true });
  await mkdir(RESULTS_DIR, { recursive: true });

  const now = Date.now();
  let offset = 0;

  for (const [layer, counts] of Object.entries(LAYERS)) {
    const [total] = counts;

    for (let index = 0; index < total; index += 1) {
      const drift = churn(layer, index, run);
      if (drift.skip) {
        continue;
      }
      const status = drift.status ?? statusFor(index, counts);
      const name = `${layer} case ${index + 1}`;
      const jitter = ((index * 37 + seed * 13) % 11) / 10;
      const duration = Math.round(BASE_DURATION[layer] * (1 + jitter * 0.4) * (1 - run * 0.06));
      const start = now + offset;
      offset += duration + 25;

      const result = {
        uuid: `${layer}-${index}-${run}`,
        historyId: `${layer}-${index}`,
        name,
        fullName: `tests.${layer}.Case${index + 1}#run`,
        status,
        stage: "finished",
        start,
        stop: start + duration,
        labels: [
          { name: "layer", value: layer },
          { name: "suite", value: `${layer} suite` },
          { name: "feature", value: layer === "e2e" ? "checkout" : "core" },
          { name: "epic", value: "reference" },
          { name: "story", value: `${layer} story` },
          { name: "component", value: layer === "manual" ? "docs" : "app" },
          { name: "severity", value: status === "failed" ? "critical" : "normal" },
        ],
        ...(status === "failed" || status === "broken"
          ? { statusDetails: { message: `${name} did not pass`, trace: "at tests.Runner" } }
          : {}),
      };

      await writeFile(
        join(RESULTS_DIR, `${result.uuid}-result.json`),
        JSON.stringify(result, null, 2),
        "utf8",
      );
    }
  }

  return RESULTS_DIR;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const run = Number(process.argv[2] ?? 0);
  const dir = await makeFixture({ run, seed: run + 1 });
  console.log(`fixture: run ${run} → ${dir}`);
}
