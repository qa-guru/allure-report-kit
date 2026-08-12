/**
 * Shared machinery for the kit's Allure 3 plugins.
 *
 * Awesome and Dashboard differ only in which upstream plugin they delegate to
 * and which forked bundle they load. Everything else — swapping the bundle,
 * injecting the manifest, shipping chart backends and the header — is the same,
 * so it lives here and each plugin package is a few lines of wiring.
 *
 * The swap happens through a `reportFiles` proxy rather than by rewriting files
 * on disk afterwards: the plugin sees each file upstream is about to write, so
 * upstream bundle assets are dropped and `index.html` is retagged in flight.
 */
export { createKitPlugin } from "./create-kit-plugin.js";
export { kitDisabledReason } from "./kit-disabled.js";
export { rekeyChartSection } from "./rekey-charts.js";
export {
  evaluateQualityGate,
  RETRY_METRICS,
  seriesFromHistory,
  seriesFromRun,
} from "./panels.js";
