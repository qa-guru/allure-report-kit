/**
 * Overview preset — SSOT for the first-screen chart quad.
 *
 * Consumers (ethalon `allure/overview-preset.mjs`, dogfood, e2e) import this
 * file or re-export with profile titles. Validate against `OVERVIEW_PRESET`
 * instead of hardcoding tile types in scripts.
 */
export const OVERVIEW_PRESET = {
  id: "overview",
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
    "e2e",
    "manual",
  ],
};
