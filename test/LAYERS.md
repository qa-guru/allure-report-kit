# Test layers (allure-report-kit)

Two-layer pyramid for **lib/cli** variant — not the full reference-app stack (`api` · `integration` · `manual` are **N/A**).

Meta-канон: [`docs/testing/SERVICE-QUALITY-CONTOUR.md`](../../../docs/testing/SERVICE-QUALITY-CONTOUR.md) · instance [`docs/allure-report-kit/QUALITY-CONTOUR.md`](../../../docs/allure-report-kit/QUALITY-CONTOUR.md).

## Slices

| Layer | Path / runner | Merge policy |
|-------|---------------|--------------|
| **unit** | `test/*.test.mjs` → `node --test` via `allure-node-test/reporter` | **blocker** |
| **e2e** | `scripts/smoke-*.mjs` (Playwright headless) wrapped by `scripts/run-smoke-allure.mjs` | **blocker** |

## Labels (SSOT)

Suite metadata — `test/test-meta.mjs` · `declareSuite()` once per unit file; e2e labels in `scripts/run-smoke-allure.mjs`.

| Label | Values / rule |
|-------|----------------|
| **epic** | `allure-report-kit` (default) |
| **feature** | `config` · `models` · `plugin-core` · `report-matching` · `smoke` |
| **story** | Scenario name (file-level describe intent) |
| **layer** | `unit` — `test/*.test.mjs` · `e2e` — Playwright smoke |
| **component** | **required** for `layer=e2e` → `allure-report-kit` |
| **severity** | `normal` (unit) · `blocker` (e2e smoke) |

## Runner

Unit (Node 26, reporter-only — no `allure-node-test/setup` preload):

```bash
ALLURE_RESULTS_DIR=$PWD/allure-results npm test
# ≡ node scripts/run-tests.mjs → node-test-allure → merge → check-allure-labels
```

E2e smoke (after `npm run report`):

```bash
ALLURE_RESULTS_DIR=$PWD/allure-results-e2e npm run smoke:allure
```

Generate HTML:

```bash
npx allure generate ./allure-results -o allure-report
```

## Gate

After each run, `scripts/check-allure-labels.mjs` requires `epic`, `feature`, `story`, `layer`, `severity` on every `*-result.json`; `component` when `layer=e2e`.

## Don't

- Post-hoc layer inference — labels only via `declareSuite` / smoke harness
- `@allure.label.*` in test title strings
- reference-app pyramid slices (`api`, `integration`, `manual`, `component` tier) in this repo
