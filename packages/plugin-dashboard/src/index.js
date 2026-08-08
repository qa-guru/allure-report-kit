/**
 * @qa-guru/allure-report-kit-dashboard — Dashboard plugin with the kit bundle.
 *
 * Same recipe as the Awesome plugin: delegate everything to
 * `@allurereport/plugin-dashboard` and swap only the web bundle it loads.
 */
import { createRequire } from "node:module";

import DashboardPlugin from "@allurereport/plugin-dashboard";
import { createKitPlugin } from "@qa-guru/allure-report-kit-plugin-core";

export default createKitPlugin({
  id: "dashboard",
  UpstreamPlugin: DashboardPlugin,
  forkPackage: "@qa-guru/allure-report-kit-web-dashboard",
  upstreamPackage: "@allurereport/web-dashboard",
  resolveFrom: createRequire(import.meta.url),
});
