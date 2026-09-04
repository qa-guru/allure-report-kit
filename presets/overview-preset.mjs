/**
 * Overview preset — SSOT for the report lead section.
 *
 * Order: Allure + Sonar quality gates, then the overview chart quad.
 * Consumers (ethalon `allure/overview-preset.mjs`, dogfood, e2e) import this
 * file or re-export with profile titles. Validate against `OVERVIEW_PRESET`.
 */
export const OVERVIEW_PRESET = {
  id: "overview",
  qualityGates: [
    { id: "allureQualityGate", layout: "2x1" },
    { id: "sonarQualityGate", layout: "2x1" },
  ],
  tiles: [
    { chart: "currentStatus" },
    { chart: "durationDynamics", limit: 20 },
    { chart: "testingPyramid", layersKey: "pyramidLayers" },
    { chart: "durations", groupBy: "layer" },
  ],
  renderers: {
    currentStatus: "stock",
    durationDynamics: "stock",
    testingPyramid: "svg",
    durations: "stock",
  },
  titles: {
    currentStatus: "Текущий статус",
    durationDynamics: "Динамика длительности",
    testingPyramid: "Пирамида тестирования",
    durations: "Длительности по layer",
  },
  pyramidLayers: [
    "unit",
    "component",
    "integration",
    "api",
    "ui",
    "e2e",
    "manual",
  ],
};
