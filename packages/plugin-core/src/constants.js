import { readFile } from "node:fs/promises";

/** UMD builds exposing a global — no chart library is bundled into the kit. */
export const CHART_LIBS = {
  highcharts: { specifier: "highcharts/highcharts.js", global: "Highcharts" },
};

export const scriptTag = (src) => `<script src="${src}"></script>`;
export const styleTag = (href) => `<link rel="stylesheet" href="${href}" />`;

/**
 * Inline forms of the same two tags.
 *
 * Scripts go in as `data:` URLs rather than as element text: this is upstream's
 * own single-file recipe, and it keeps a bundle full of `</script>` in string
 * literals from ending the tag early.
 */
export const dataUrl = (buffer) => `data:text/javascript;base64,${buffer.toString("base64")}`;
export const inlineScriptTag = (buffer) => scriptTag(dataUrl(buffer));
export const inlineStyleTag = (css) => `<style>${css}</style>`;

/** Upstream's own inlined bundle, dropped in favour of the fork's. */
export const INLINE_SCRIPT_PATTERN =
  /\s*<script[^>]*src="data:text\/javascript;base64,[^"]*"[^>]*><\/script>/g;

/** Widget that upstream keys by `randomUUID()` and the kit re-keys. */
export const CHARTS_WIDGET = "widgets/charts.json";

/** Where `panels.fromRun` data lands, relative to the report root. */
export const PANEL_WIDGET_DIR = "widgets/kit-panels";

export async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
