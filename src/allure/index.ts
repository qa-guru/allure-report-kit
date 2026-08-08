/**
 * `@qa-guru/allure-report-kit/allure` — the pieces a forked Allure web bundle
 * needs. Kept out of the config entry point: this is browser code that assumes
 * an Allure report around it.
 */
export { toChartModel, toPanelModel } from "./model.js";
export type { AllureChartData } from "./model.js";

export {
  REPORT_TILE_LAYOUT,
  canKitRender,
  getKitRuntime,
  isKitOwned,
  pairTiles,
  readManifest,
  withReportLayout,
} from "./report.js";
export type { PairedTile } from "./report.js";

export { mountKitHeader } from "./header.js";
