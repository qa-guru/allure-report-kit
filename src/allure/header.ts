/**
 * `theme.header` for a forked Allure web bundle.
 *
 * Mounted once for the whole app, not per section: this is report chrome,
 * unlike the tile bar, which is card chrome. Shared by every fork.
 *
 * The design-system module is loaded from the tree the plugin copies into the
 * report, so its own `new URL("../templates/header.html", import.meta.url)`
 * resolves. Bundling it would break that lookup.
 */
import { mountReportHeader } from "../runtime/header.js";
import { readManifest } from "./report.js";

const HEADER_MODULE = "kit/theme/vendor/design-system/js/header.js";

let mounted = false;

export function mountKitHeader(): void {
  const manifest = readManifest();
  const header = manifest?.theme?.header;

  if (mounted || !header?.enabled || header.source === "none") {
    return;
  }
  mounted = true;

  // In a single-file report there is no tree to load from: the plugin puts the
  // bundled module and its markup in the manifest instead.
  const inline = manifest?.inline;

  void mountReportHeader({
    ...header,
    moduleUrl: inline?.headerModule ?? new URL(HEADER_MODULE, document.baseURI).href,
    ...(inline?.headerTemplate ? { templateHtml: inline.headerTemplate } : {}),
    contentRoot: document.getElementById("app") ?? document.body,
  });
}
