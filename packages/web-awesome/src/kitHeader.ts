/* FORK ADDITION — `theme.header`: the design-system header above the report.
 *
 * Mounted once for the whole app, not per section: it is report chrome, unlike
 * the tile bar, which is card chrome.
 *
 * The DS module is loaded from the tree the plugin copies into the report, so
 * its own `new URL("../templates/header.html", import.meta.url)` resolves.
 * Bundling it would break that lookup.
 */
import type { KitRuntimeManifest } from "@qa-guru/allure-report-kit";
import { mountReportHeader } from "@qa-guru/allure-report-kit/runtime";

declare const window: Window & { allureReportKit?: KitRuntimeManifest };

let mounted = false;

export function mountKitHeader(): void {
  const header = window.allureReportKit?.theme?.header;

  if (mounted || !header?.enabled || header.source === "none") {
    return;
  }
  mounted = true;

  void mountReportHeader({
    ...header,
    moduleUrl: new URL("kit/theme/vendor/design-system/js/header.js", document.baseURI).href,
    contentRoot: document.getElementById("app") ?? document.body,
  });
}
