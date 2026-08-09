# Quality-gate data contract fixtures

Shared JSON payload for AQG / SQG panels. Shape = `KitQualityGateData`
(`src/types.ts`). Kit HTML and future Telegram collage both consume this — no
parallel type, no render-time transform special-case.

Package path: `@qa-guru/allure-report-kit/fixtures/quality-gate/<id>.json`

| Id | Kind | Verdict |
|----|------|---------|
| `aqg-passed` | allure | passed |
| `aqg-failed` | allure | failed |
| `sqg-passed` | sonar | passed |
| `sqg-failed` | sonar | failed |
| `sqg-long` | sonar | failed (10 rules) |

## Fields

### `KitQualityGateData` (payload root)

| Field | Required | Source |
|-------|----------|--------|
| `passed` | yes | AQG `evaluateQualityGate` · SQG `sonarProjectStatusToQualityGateOptions` |
| `rules` | yes (≥1) | same |
| `kind` | optional | `"allure"` \| `"sonar"` |
| `testId` | optional | `"quality-gate"` / `"sonar-quality-gate"` |
| `title` / `barTitle` | optional | panel title / bar label |
| `config` | optional | rules file / Sonar profile + `source` hrefs |
| `infoPayload` | optional | popover JSON (wins over default builder) |
| `labels` | optional | passed/failed strings or `{ru,en}` |
| `lang` | optional | `"ru"` \| `"en"` |

### `KitQualityGateRule`

| Field | Required | Notes |
|-------|----------|--------|
| `id` | yes | AQG: `maxFailures` / … · SQG: Sonar `metricKey` |
| `message` | yes | human text |
| `passed` | yes | per-rule verdict |
| `actual` | optional | measured value |
| `expected` | optional | Allure canon limit |
| `threshold` | optional | legacy / Sonar mapper alias of expected |
| `comparator` | optional | `LT` \| `GT` \| `EQ` \| `NE` \| `LTE` \| `GTE` |
| `knownExcluded` | optional | AQG known-issues count |

Helpers: `parseKitQualityGateData` / `isKitQualityGateData` from
`@qa-guru/allure-report-kit` (also re-exported on `/runtime`).
SQG raw `projectStatus` → payload: `sonarProjectStatusToQualityGateOptions`
(`@qa-guru/allure-report-kit/runtime`).
