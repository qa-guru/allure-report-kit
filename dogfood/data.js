/**
 * Dogfood data — one run of a reference suite, shaped as kit chart models.
 *
 * Numbers mirror the design-system widget-tile mocks (34 tests, 6 pyramid
 * layers) so the page can be compared side by side with the dashboard canon.
 */
import testsTableFixture from "../test/fixtures/tests-table-panel.json" with { type: "json" };

/** Allure quality gate — dogfood sample (failed). */
export const allureQualityGateModel = {
  kind: "qualityGate",
  type: "custom",
  series: [],
  qualityGate: {
    passed: false,
    rules: [
      {
        id: "maxFailures",
        message: "The number of failed tests 3 exceeds the allowed threshold value 0",
        passed: false,
        actual: 3,
        expected: 0,
      },
    ],
    barTitle: "Allure Quality Gate",
    lang: "ru",
    labels: {
      passed: { ru: "Allure Quality Gate пройден", en: "Allure Quality Gate passed" },
      failed: { ru: "Allure Quality Gate не пройден", en: "Allure Quality Gate failed" },
    },
    config: {
      rules: [{ maxFailures: 0 }],
      source: {
        configFile: "allurerc.mjs",
        rulesFile: "allure/quality-gate.mjs",
        hrefBase: "https://github.com/qa-guru/zero-design-system/blob/master/stacks/java-spring/tests/",
      },
    },
  },
};

/** Sonar quality gate — dogfood sample (passed). */
export const sonarQualityGateModel = {
  kind: "qualityGate",
  type: "custom",
  series: [],
  qualityGate: {
    passed: true,
    kind: "sonar",
    testId: "sonar-quality-gate",
    rules: [
      {
        id: "coverage",
        message: "Coverage on Overall Code is 100, required ≥ 80",
        passed: true,
        actual: 100,
        expected: 80,
        comparator: "LT",
      },
    ],
    barTitle: "Sonar Quality Gate",
    lang: "ru",
    labels: {
      passed: { ru: "Sonar Quality Gate пройден", en: "Sonar Quality Gate passed" },
      failed: { ru: "Sonar Quality Gate не пройден", en: "Sonar Quality Gate failed" },
    },
    config: {
      profile: "qa-guru-canon",
      projectKey: "reference-app-backend",
      conditions: [
        {
          metric: "coverage",
          op: "LT",
          error: 80,
          label: "Coverage on Overall Code ≥ 80%",
        },
      ],
      source: {
        configFile: "docs/sonar/quality-gate-profile.json",
        profile: "qa-guru-canon",
        projectKey: "reference-app-backend",
        hrefBase: "https://github.com/qa-guru/zero-design-system/blob/master/",
        profileHref: "https://sonar.qa.guru/profiles/show?name=qa-guru-canon",
        projectHref: "https://sonar.qa.guru/dashboard?id=reference-app-backend",
      },
    },
  },
};

const STATUS = {
  passed: { color: "var(--ark-status-passed)", family: "green" },
  failed: { color: "var(--ark-status-failed)", family: "red" },
  broken: { color: "var(--ark-status-broken)", family: "yellow" },
  skipped: { color: "var(--ark-status-skipped)", family: "gray" },
};

const LAYERS = [
  { id: "unit", label: "unit", value: 12, family: "green" },
  { id: "component", label: "component", value: 8, family: "orange" },
  { id: "integration", label: "integration", value: 5, family: "purple" },
  { id: "api", label: "api", value: 4, family: "yellow" },
  { id: "e2e", label: "e2e", value: 3, family: "red" },
  { id: "manual", label: "manual", value: 2, family: "blue" },
];

export const currentStatusModel = {
  kind: "pie",
  type: "currentStatus",
  total: 34,
  percentage: 88.24,
  series: [
    { id: "passed", label: "passed", value: 30, ...STATUS.passed },
    { id: "failed", label: "failed", value: 2, ...STATUS.failed },
    { id: "broken", label: "broken", value: 1, ...STATUS.broken },
    { id: "skipped", label: "skipped", value: 1, ...STATUS.skipped },
  ],
};

const runs = ["#31", "#32", "#33", "#34", "#35", "#36", "#37", "#38", "#39", "#40"];

export const durationDynamicsModel = {
  kind: "line",
  type: "durationDynamics",
  categories: runs,
  series: [
    {
      id: "duration",
      label: "Длительность прогона, с",
      color: "var(--ark-layer-manual)",
      family: "blue",
      points: [92, 88, 95, 84, 90, 79, 83, 76, 81, 74].map((y, index) => ({
        x: runs[index],
        y,
      })),
    },
  ],
};

export const testingPyramidModel = {
  kind: "pyramid",
  type: "testingPyramid",
  series: LAYERS.map((layer) => ({
    ...layer,
    color: `var(--ark-layer-${layer.id})`,
  })),
};

const durationBuckets = ["<1s", "1–2s", "2–5s", "5–10s", "10–30s", ">30s"];

const durationsByLayer = {
  unit: [9, 3, 0, 0, 0, 0],
  component: [2, 4, 2, 0, 0, 0],
  integration: [0, 1, 3, 1, 0, 0],
  api: [0, 2, 1, 1, 0, 0],
  e2e: [0, 0, 0, 1, 2, 0],
  manual: [0, 0, 0, 0, 1, 1],
};

export const durationsModel = {
  kind: "bar",
  type: "durations",
  categories: durationBuckets,
  series: LAYERS.map((layer) => ({
    id: layer.id,
    label: layer.label,
    family: layer.family,
    color: `var(--ark-layer-${layer.id})`,
    points: durationsByLayer[layer.id].map((y, index) => ({
      x: durationBuckets[index],
      y,
    })),
  })),
};

/**
 * Stability per component, one bar per group coloured by its own threshold.
 *
 * The interesting case for the bar dots: both families live on points, not on
 * series, and a group at exactly the threshold counts as stable.
 */
const components = ["auth", "billing", "search", "cart", "profile"];

export const stabilityModel = {
  kind: "bar",
  type: "stabilityDistribution",
  categories: components,
  formatValue: (value) => `${Math.round(value)}%`,
  series: [
    {
      id: "stabilityRate",
      label: "stability, threshold 90%",
      points: [100, 96, 72, 90, 55].map((y, index) => ({
        x: components[index],
        y,
        color: y >= 90 ? "var(--ark-status-passed)" : "var(--ark-status-failed)",
        family: y >= 90 ? "green" : "red",
      })),
    },
  ],
};

/** Gauge panel — the SVG canon, no chart library involved. */
export const passRateModel = {
  kind: "gauge",
  type: "custom",
  total: 34,
  unit: "из",
  formatValue: (value) => String(value),
  series: [
    { id: "passed", label: "passed", value: 30, ...STATUS.passed },
  ],
};

/** Table panel — rows with an indicator each, drawn by the `dom` renderer. */
export const layersTableModel = {
  kind: "table",
  type: "custom",
  columns: ["Слой", "Тестов"],
  series: LAYERS.map((layer) => ({
    ...layer,
    color: `var(--ark-layer-${layer.id})`,
  })),
};

/**
 * Custom panel — not derived from test results at all: nine deployed services,
 * seven healthy. Dots resolve to orange + green, the two families on the chart.
 */
export const servicesStatusModel = {
  kind: "pie",
  type: "custom",
  total: 9,
  percentage: 77.78,
  unit: "из",
  series: [
    {
      id: "healthy",
      label: "healthy",
      value: 7,
      color: "var(--ark-status-passed)",
      family: "green",
    },
    {
      id: "degraded",
      label: "degraded",
      value: 2,
      color: "var(--ark-status-orange)",
      family: "orange",
    },
  ],
};

/** Tests table panel — sparkline trend + stability dots (dom renderer). */
export const testsTableModel = {
  kind: "testsTable",
  type: "custom",
  series: [],
  columns: ["Тест", "Статус", "Тренд", "Стабильность"],
  testsTable: testsTableFixture,
};
