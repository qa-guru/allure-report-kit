/**
 * Dogfood data — one run of a reference suite, shaped as kit chart models.
 *
 * Numbers mirror the design-system widget-tile mocks (34 tests, 6 pyramid
 * layers) so the page can be compared side by side with the dashboard canon.
 */

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
