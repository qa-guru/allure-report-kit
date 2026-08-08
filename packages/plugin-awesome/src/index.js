/**
 * @qa-guru/allure-report-kit-awesome — Awesome plugin with the kit web bundle.
 *
 * Delegates every bit of report generation to `@allurereport/plugin-awesome`
 * and changes exactly one thing: which web bundle the report loads. The kit
 * fork of `web-awesome` replaces the chart dispatch with the renderer registry;
 * the rest of the report is upstream code.
 */
import { createRequire } from "node:module";

import AwesomePlugin from "@allurereport/plugin-awesome";
import { createKitPlugin } from "@qa-guru/allure-report-kit-plugin-core";

export default createKitPlugin({
  id: "awesome",
  UpstreamPlugin: AwesomePlugin,
  forkPackage: "@qa-guru/allure-report-kit-web-awesome",
  upstreamPackage: "@allurereport/web-awesome",
  tilesKey: "charts",
  resolveFrom: createRequire(import.meta.url),
});
