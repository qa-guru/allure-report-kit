import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cwd } from "node:process";

const STATUS_ORDER = ["passed", "failed", "broken", "skipped", "unknown"];

const STATUS_FAMILY = {
  passed: "green",
  failed: "red",
  broken: "yellow",
  skipped: "gray",
  unknown: "purple",
};

const LAYER_FAMILY = {
  unit: "green",
  component: "orange",
  integration: "purple",
  api: "yellow",
  e2e: "red",
  manual: "blue",
  other: "gray",
};

function labelOf(testResult, name) {
  return testResult.labels?.find((label) => label.name === name)?.value;
}

function groupKey(testResult, groupBy) {
  if (groupBy === "status") {
    return testResult.status ?? "unknown";
  }
  if (groupBy.startsWith("label:")) {
    return labelOf(testResult, groupBy.slice("label:".length)) ?? "other";
  }
  return labelOf(testResult, groupBy) ?? "other";
}

const rate = (part, whole) => (whole === 0 ? 0 : Math.round((part / whole) * 100));

const countWhere = (results, predicate) => results.filter(predicate).length;

/**
 * One group → one number.
 *
 * `retries` counts attempts, not tests, so it only ever sees anything when the
 * caller asked the store for retries as well — see `RETRY_METRICS`.
 */
function measure(metric, results) {
  switch (metric) {
    case "passRate":
      return rate(countWhere(results, (result) => result.status === "passed"), results.length);
    case "duration":
      return Math.round(results.reduce((total, result) => total + (result.duration ?? 0), 0) / 1000);
    case "flakyRate":
      return rate(countWhere(results, (result) => result.flaky), results.length);
    case "retries":
      return countWhere(results, (result) => result.isRetry);
    // Allure's own transition vocabulary: `new` has no history, `regressed` used
    // to pass. Inventing kit names for these would only make them harder to
    // match against the report's own filters.
    case "new":
      return countWhere(results, (result) => result.transition === "new");
    case "regressed":
      return countWhere(results, (result) => result.transition === "regressed");
    default:
      return results.length;
  }
}

/** Metrics that need the retry attempts, which the store hides by default. */
export const RETRY_METRICS = new Set(["retries"]);

/**
 * Group the run into panel series.
 *
 * Colours come from the canon tokens when the grouping is one the palette knows
 * (`status`, `layer`); otherwise from the theme's series ramp, which the runtime
 * resolves and maps back to a family — so `dots: "fromSeries"` keeps working for
 * a grouping the kit has never seen.
 */
export function seriesFromRun(testResults, source) {
  const { groupBy, metric = "count", limit } = source;
  const groups = new Map();

  for (const testResult of testResults) {
    const key = groupKey(testResult, groupBy);
    const bucket = groups.get(key) ?? [];
    bucket.push(testResult);
    groups.set(key, bucket);
  }

  let entries = [...groups.entries()].map(([id, results]) => ({
    id,
    value: measure(metric, results),
  }));

  entries =
    groupBy === "status"
      ? STATUS_ORDER.filter((status) => groups.has(status)).map((status) => ({
          id: status,
          value: measure(metric, groups.get(status)),
        }))
      : entries.sort((left, right) => right.value - left.value);

  if (limit !== undefined && entries.length > limit) {
    const tail = entries.slice(limit);
    entries = entries.slice(0, limit);
    // Measured over the folded groups, not summed from their values: adding up
    // percentages would give `other` a pass rate of 180%.
    entries.push({
      id: "other",
      value: measure(
        metric,
        tail.flatMap((entry) => groups.get(entry.id) ?? []),
      ),
    });
  }

  return entries.map((entry, index) => {
    const family = groupBy === "status" ? STATUS_FAMILY[entry.id] : LAYER_FAMILY[entry.id];
    const color =
      groupBy === "status"
        ? `var(--ark-status-${entry.id})`
        : LAYER_FAMILY[entry.id]
          ? `var(--ark-layer-${entry.id})`
          : `var(--ark-series-${index % 6})`;
    return {
      id: entry.id,
      label: entry.id,
      value: entry.value,
      color,
      ...(family ? { family } : {}),
    };
  });
}

const HISTORY_LIMIT = 10;

/** One history point → one number, mirroring `measure` over a run. */
function measureRun(metric, results) {
  if (metric === "failed") {
    return countWhere(results, (result) => result.status === "failed");
  }
  if (metric === "passRate") {
    return rate(countWhere(results, (result) => result.status === "passed"), results.length);
  }
  if (metric === "duration") {
    return Math.round(results.reduce((total, result) => total + (result.duration ?? 0), 0) / 1000);
  }
  return results.length;
}

/**
 * Series over the runs Allure keeps in `historyPath`.
 *
 * Points are labelled `#1..#N` inside the window rather than by timestamp: runs
 * of one suite land seconds apart in CI, so a time axis collapses into a
 * single tick, and the question a trend answers is "which run", not "when".
 *
 * The window is the newest `limit` points, ordered oldest first — history is
 * appended, but nothing promises the file arrives sorted.
 */
export function seriesFromHistory(historyPoints, source) {
  const { metric = "passRate", limit = HISTORY_LIMIT, splitBy } = source;

  const runs = [...historyPoints]
    .sort((left, right) => (left.timestamp ?? 0) - (right.timestamp ?? 0))
    .slice(-limit)
    .map((point, index) => ({
      label: `#${index + 1}`,
      results: Object.values(point.testResults ?? {}),
    }));

  const categories = runs.map((run) => run.label);

  if (splitBy === "status") {
    const series = STATUS_ORDER.filter((status) =>
      runs.some((run) => run.results.some((result) => result.status === status)),
    ).map((status) => ({
      id: status,
      label: status,
      color: `var(--ark-status-${status})`,
      family: STATUS_FAMILY[status],
      points: runs.map((run) => ({
        x: run.label,
        y: countWhere(run.results, (result) => result.status === status),
      })),
    }));
    return { categories, series };
  }

  return {
    categories,
    series: [
      {
        id: metric,
        label: metric,
        color: "var(--ark-layer-manual)",
        family: "blue",
        points: runs.map((run) => ({ x: run.label, y: measureRun(metric, run.results) })),
      },
    ],
  };
}

function readKnownHistoryIds(knownFile) {
  if (!knownFile || !existsSync(knownFile)) {
    return new Set();
  }
  try {
    const entries = JSON.parse(readFileSync(knownFile, "utf8"));
    if (!Array.isArray(entries)) {
      return new Set();
    }
    return new Set(
      entries
        .map((entry) => entry?.historyId)
        .filter((historyId) => typeof historyId === "string" && historyId.length > 0),
    );
  } catch {
    return new Set();
  }
}

function isKnownFailure(result, knownIds) {
  const historyId = result.historyId;
  if (!historyId || knownIds.size === 0) {
    return false;
  }
  if (knownIds.has(historyId)) {
    return true;
  }
  for (const knownId of knownIds) {
    if (historyId.startsWith(`${knownId}.`) || knownId.startsWith(`${historyId}.`)) {
      return true;
    }
  }
  return false;
}

function countActionableFailures(testResults, knownIds) {
  const seen = new Set();
  let excluded = 0;
  let actionable = 0;

  for (const result of testResults) {
    const status = (result.status ?? "").toLowerCase();
    if (status !== "failed" && status !== "broken") {
      continue;
    }
    const dedupeKey = result.historyId ?? result.uuid ?? result.name ?? "unknown";
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    if (isKnownFailure(result, knownIds)) {
      excluded += 1;
      continue;
    }
    actionable += 1;
  }

  return { actionable, excluded };
}

function summarizeRun(testResults) {
  const summary = {
    total: testResults.length,
    passed: 0,
    failed: 0,
    broken: 0,
    skipped: 0,
    unknown: 0,
    durationMs: 0,
  };

  for (const result of testResults) {
    const status = (result.status ?? "unknown").toLowerCase();
    if (status in summary && status !== "total" && status !== "durationMs") {
      summary[status] += 1;
    } else if (status === "unknown") {
      summary.unknown += 1;
    }
    summary.durationMs += result.duration ?? 0;
  }

  return summary;
}

/**
 * Evaluate `qualityGate.rules` against the current run.
 *
 * Mirrors `build-analytics-index.mjs` so the kit panel and analytics-index
 * stay aligned without DOM scraping.
 */
export function evaluateQualityGate(testResults, config = {}, options = {}) {
  const ruleDefs = config.rules ?? [];
  if (!ruleDefs.length) {
    return { passed: true, rules: [] };
  }

  const knownFile = config.knownIssuesPath
    ? resolve(options.configDir ?? cwd(), config.knownIssuesPath)
    : null;
  const knownIds = readKnownHistoryIds(knownFile);
  const summary = summarizeRun(testResults);
  const { actionable: failedCount, excluded: knownExcluded } = countActionableFailures(
    testResults,
    knownIds,
  );
  const finished = summary.passed + summary.failed + summary.broken;
  const successRatePct = finished > 0 ? (summary.passed / finished) * 100 : 0;
  const durationSec = Math.round(summary.durationMs / 1000);
  const rules = [];

  for (const rule of ruleDefs) {
    if (rule.maxFailures !== undefined) {
      const expected = rule.maxFailures;
      const passed = failedCount <= expected;
      rules.push({
        id: "maxFailures",
        passed,
        message: passed
          ? `Failed tests ${failedCount} within threshold ${expected}`
          : `The number of failed tests ${failedCount} exceeds the allowed threshold value ${expected}`,
        actual: failedCount,
        expected,
        knownExcluded,
      });
    }
    if (rule.minTestsCount !== undefined) {
      const expected = rule.minTestsCount;
      const passed = summary.total >= expected;
      rules.push({
        id: "minTestsCount",
        passed,
        message: passed
          ? `Test count ${summary.total} meets minimum ${expected}`
          : `The number of tests ${summary.total} is below the minimum required ${expected}`,
        actual: summary.total,
        expected,
      });
    }
    if (rule.successRate !== undefined) {
      const expected = rule.successRate;
      const actual = Math.round(successRatePct * 10) / 10;
      const passed = actual >= expected;
      rules.push({
        id: "successRate",
        passed,
        message: passed
          ? `Success rate ${actual}% meets minimum ${expected}%`
          : `Success rate ${actual}% is below the minimum required ${expected}%`,
        actual,
        expected,
      });
    }
    if (rule.maxDuration !== undefined) {
      const expected = rule.maxDuration;
      const passed = durationSec <= expected;
      rules.push({
        id: "maxDuration",
        passed,
        message: passed
          ? `Run duration ${durationSec}s within limit ${expected}s`
          : `Run duration ${durationSec}s exceeds the maximum allowed ${expected}s`,
        actual: durationSec,
        expected,
      });
    }
  }

  return {
    passed: rules.every((entry) => entry.passed),
    rules,
  };
}
