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
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative, sep } from "node:path";
import { cwd } from "node:process";

const require = createRequire(import.meta.url);

/** UMD builds exposing a global — no chart library is bundled into the kit. */
const CHART_LIBS = {
  echarts: { specifier: "echarts/dist/echarts.min.js", global: "echarts" },
  highcharts: { specifier: "highcharts/highcharts.js", global: "Highcharts" },
};

const scriptTag = (src) => `<script src="${src}"></script>`;
const styleTag = (href) => `<link rel="stylesheet" href="${href}" />`;

/**
 * Inline forms of the same two tags.
 *
 * Scripts go in as `data:` URLs rather than as element text: this is upstream's
 * own single-file recipe, and it keeps a bundle full of `</script>` in string
 * literals from ending the tag early.
 */
const dataUrl = (buffer) => `data:text/javascript;base64,${buffer.toString("base64")}`;
const inlineScriptTag = (buffer) => scriptTag(dataUrl(buffer));
const inlineStyleTag = (css) => `<style>${css}</style>`;

/** Upstream's own inlined bundle, dropped in favour of the fork's. */
const INLINE_SCRIPT_PATTERN = /\s*<script[^>]*src="data:text\/javascript;base64,[^"]*"[^>]*><\/script>/g;

/** Widget that upstream keys by `randomUUID()` and the kit re-keys. */
const CHARTS_WIDGET = "widgets/charts.json";

/** Where `panels.fromRun` data lands, relative to the report root. */
const PANEL_WIDGET_DIR = "widgets/kit-panels";

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

/**
 * Why the kit is off for this report, or `undefined` when it is on.
 *
 * Split out and exported so the fallback is testable without generating a
 * report: silently rendering stock Allure is the worst failure mode this plugin
 * has, and it should stay hard to reach by accident.
 */
export function kitDisabledReason(manifest, options = {}) {
  if (!manifest) {
    return "no kit manifest in plugin options — did you wrap the config with withKit()?";
  }
  return undefined;
}

/**
 * Re-key one section of `charts.json` onto the manifest's stable chart ids.
 *
 * Upstream walks the tile list in order and calls `generateUuid()` for each
 * entry, dropping the ones whose type it does not know (custom panels). So the
 * n-th generated entry belongs to the n-th chart tile, and doing that walk here —
 * with both the config and the result in hand — is what lets the browser stop
 * guessing. A type mismatch means the assumption broke: the entry keeps its
 * original key and stays with Allure rather than being handed the wrong tile.
 */
export function rekeyChartSection(section, tiles) {
  const chartTiles = tiles.filter((tile) => !tile.panel && tile.chartId);
  if (chartTiles.length === 0) {
    return { section, mismatched: [] };
  }
  const entries = Object.entries(section);
  const result = {};
  const mismatched = [];

  entries.forEach(([originalId, chartData], index) => {
    const tile = chartTiles[index];
    if (tile && chartData?.type === tile.type) {
      result[tile.chartId] = chartData;
      return;
    }
    if (tile) {
      mismatched.push(`${tile.chartId} expected ${tile.type}, widget has ${chartData?.type}`);
    }
    result[originalId] = chartData;
  });

  return { section: result, mismatched };
}

const STATUS_ORDER = ["passed", "failed", "broken", "skipped", "unknown"];

const STATUS_FAMILY = {
  passed: "green",
  failed: "red",
  broken: "yellow",
  skipped: "gray",
  unknown: "purple",
};

const LAYER_FAMILY = {
  unit: "green",
  component: "orange",
  integration: "purple",
  api: "yellow",
  e2e: "red",
  manual: "blue",
  other: "gray",
};

function labelOf(testResult, name) {
  return testResult.labels?.find((label) => label.name === name)?.value;
}

function groupKey(testResult, groupBy) {
  if (groupBy === "status") {
    return testResult.status ?? "unknown";
  }
  if (groupBy.startsWith("label:")) {
    return labelOf(testResult, groupBy.slice("label:".length)) ?? "other";
  }
  return labelOf(testResult, groupBy) ?? "other";
}

const rate = (part, whole) => (whole === 0 ? 0 : Math.round((part / whole) * 100));

const countWhere = (results, predicate) => results.filter(predicate).length;

/**
 * One group → one number.
 *
 * `retries` counts attempts, not tests, so it only ever sees anything when the
 * caller asked the store for retries as well — see `RETRY_METRICS`.
 */
function measure(metric, results) {
  switch (metric) {
    case "passRate":
      return rate(countWhere(results, (result) => result.status === "passed"), results.length);
    case "duration":
      return Math.round(results.reduce((total, result) => total + (result.duration ?? 0), 0) / 1000);
    case "flakyRate":
      return rate(countWhere(results, (result) => result.flaky), results.length);
    case "retries":
      return countWhere(results, (result) => result.isRetry);
    // Allure's own transition vocabulary: `new` has no history, `regressed` used
    // to pass. Inventing kit names for these would only make them harder to
    // match against the report's own filters.
    case "new":
      return countWhere(results, (result) => result.transition === "new");
    case "regressed":
      return countWhere(results, (result) => result.transition === "regressed");
    default:
      return results.length;
  }
}

/** Metrics that need the retry attempts, which the store hides by default. */
export const RETRY_METRICS = new Set(["retries"]);

/**
 * Group the run into panel series.
 *
 * Colours come from the canon tokens when the grouping is one the palette knows
 * (`status`, `layer`); otherwise from the theme's series ramp, which the runtime
 * resolves and maps back to a family — so `dots: "fromSeries"` keeps working for
 * a grouping the kit has never seen.
 */
export function seriesFromRun(testResults, source) {
  const { groupBy, metric = "count", limit } = source;
  const groups = new Map();

  for (const testResult of testResults) {
    const key = groupKey(testResult, groupBy);
    const bucket = groups.get(key) ?? [];
    bucket.push(testResult);
    groups.set(key, bucket);
  }

  let entries = [...groups.entries()].map(([id, results]) => ({
    id,
    value: measure(metric, results),
  }));

  entries =
    groupBy === "status"
      ? STATUS_ORDER.filter((status) => groups.has(status)).map((status) => ({
          id: status,
          value: measure(metric, groups.get(status)),
        }))
      : entries.sort((left, right) => right.value - left.value);

  if (limit !== undefined && entries.length > limit) {
    const tail = entries.slice(limit);
    entries = entries.slice(0, limit);
    // Measured over the folded groups, not summed from their values: adding up
    // percentages would give `other` a pass rate of 180%.
    entries.push({
      id: "other",
      value: measure(
        metric,
        tail.flatMap((entry) => groups.get(entry.id) ?? []),
      ),
    });
  }

  return entries.map((entry, index) => {
    const family = groupBy === "status" ? STATUS_FAMILY[entry.id] : LAYER_FAMILY[entry.id];
    const color =
      groupBy === "status"
        ? `var(--ark-status-${entry.id})`
        : LAYER_FAMILY[entry.id]
          ? `var(--ark-layer-${entry.id})`
          : `var(--ark-series-${index % 6})`;
    return {
      id: entry.id,
      label: entry.id,
      value: entry.value,
      color,
      ...(family ? { family } : {}),
    };
  });
}

const HISTORY_LIMIT = 10;

/** One history point → one number, mirroring `measure` over a run. */
function measureRun(metric, results) {
  if (metric === "failed") {
    return countWhere(results, (result) => result.status === "failed");
  }
  if (metric === "passRate") {
    return rate(countWhere(results, (result) => result.status === "passed"), results.length);
  }
  if (metric === "duration") {
    return Math.round(results.reduce((total, result) => total + (result.duration ?? 0), 0) / 1000);
  }
  return results.length;
}

/**
 * Series over the runs Allure keeps in `historyPath`.
 *
 * Points are labelled `#1..#N` inside the window rather than by timestamp: runs
 * of one suite land seconds apart in CI, so a time axis collapses into a
 * single tick, and the question a trend answers is "which run", not "when".
 *
 * The window is the newest `limit` points, ordered oldest first — history is
 * appended, but nothing promises the file arrives sorted.
 */
export function seriesFromHistory(historyPoints, source) {
  const { metric = "passRate", limit = HISTORY_LIMIT, splitBy } = source;

  const runs = [...historyPoints]
    .sort((left, right) => (left.timestamp ?? 0) - (right.timestamp ?? 0))
    .slice(-limit)
    .map((point, index) => ({
      label: `#${index + 1}`,
      results: Object.values(point.testResults ?? {}),
    }));

  const categories = runs.map((run) => run.label);

  if (splitBy === "status") {
    const series = STATUS_ORDER.filter((status) =>
      runs.some((run) => run.results.some((result) => result.status === status)),
    ).map((status) => ({
      id: status,
      label: status,
      color: `var(--ark-status-${status})`,
      family: STATUS_FAMILY[status],
      points: runs.map((run) => ({
        x: run.label,
        y: countWhere(run.results, (result) => result.status === status),
      })),
    }));
    return { categories, series };
  }

  return {
    categories,
    series: [
      {
        id: metric,
        label: metric,
        color: "var(--ark-layer-manual)",
        family: "blue",
        points: runs.map((run) => ({ x: run.label, y: measureRun(metric, run.results) })),
      },
    ],
  };
}

/**
 * Resolve a chart library from the *consumer's* install, never from the kit.
 * Highcharts and amCharts are proprietary: the report may embed them because
 * the user holds the licence, the kit must not redistribute them.
 */
function resolveChartLib(name, resolveFrom) {
  const lib = CHART_LIBS[name];
  if (!lib) {
    return undefined;
  }
  const consumerRequire = createRequire(join(cwd(), "index.js"));
  for (const resolver of [consumerRequire, resolveFrom, require]) {
    try {
      return { ...lib, path: resolver.resolve(lib.specifier) };
    } catch {
      /* try the next resolution root */
    }
  }
  return undefined;
}

function requiredLibs(tiles, resolveFrom) {
  const ids = new Set(tiles.map((tile) => tile.renderer?.id).filter(Boolean));
  const resolved = [];
  const missing = [];

  for (const id of ids) {
    if (!CHART_LIBS[id]) {
      if (id === "amcharts") {
        missing.push("amcharts (needs a prebuilt bundle — see PLAN-0.1)");
      }
      continue;
    }
    const lib = resolveChartLib(id, resolveFrom);
    if (lib) {
      resolved.push({ id, ...lib });
    } else {
      missing.push(`${id} (npm i -D ${id})`);
    }
  }
  return { resolved, missing };
}

/**
 * Build a kit plugin class.
 *
 * @param {object} spec
 * @param {string} spec.id                 label used in log lines (`awesome`, `dashboard`)
 * @param {Function} spec.UpstreamPlugin   the plugin the kit delegates to
 * @param {string} spec.forkPackage        package name of the forked web bundle
 * @param {string} spec.upstreamPackage    package name of the upstream web bundle
 * @param {"charts"|"layout"} spec.tilesKey option key upstream reads its tiles from
 * @param {NodeRequire} spec.resolveFrom   `createRequire(import.meta.url)` of the caller
 */
export function createKitPlugin({
  id,
  UpstreamPlugin,
  forkPackage,
  upstreamPackage,
  tilesKey,
  resolveFrom,
}) {
  const log = (level, message) => console[level](`allure-report-kit [${id}] ${message}`);

  return class KitPlugin {
    #upstream;

    #manifest;

    #libs = [];

    #forkManifest;

    #upstreamAssets = new Set();

    /** Single-file only: the fork bundle and the stylesheets to inline. */
    #forkBundle;

    #inlineCss = [];

    constructor(options = {}) {
      this.options = options;
      this.#manifest = options.kit;
      this.#upstream = new UpstreamPlugin(options);
    }

    /** One HTML document, nothing on disk beside it. */
    get #singleFile() {
      return Boolean(this.options.singleFile);
    }

    #forkDistDir() {
      return join(
        dirname(resolveFrom.resolve(`${forkPackage}/package.json`)),
        this.#singleFile ? "dist/single" : "dist/multi",
      );
    }

    #kitDir() {
      return dirname(require.resolve("@qa-guru/allure-report-kit/package.json"));
    }

    #headerEnabled() {
      const header = this.#manifest?.theme?.header;
      return Boolean(header?.enabled) && header.source !== "none";
    }

    #transformHtml(html) {
      // Drop the tags upstream just emitted for its own bundle. In single-file
      // mode there is no file name to match on — upstream inlines the bundle as
      // a data URL — so the tag shape is what identifies it.
      let output = this.#singleFile ? html.replace(INLINE_SCRIPT_PATTERN, "") : html;
      for (const asset of this.#upstreamAssets) {
        output = output
          .replace(new RegExp(`\\s*<script[^>]*src="[^"]*${asset}"[^>]*></script>`, "g"), "")
          .replace(new RegExp(`\\s*<link[^>]*href="[^"]*${asset}"[^>]*/?>`, "g"), "");
      }

      // The single-file fork bundle carries its own CSS (style-loader), so only
      // the header stylesheet is left to place.
      const head = this.#singleFile
        ? this.#inlineCss.map(inlineStyleTag)
        : [
            styleTag(this.#forkManifest["main.css"]),
            ...(this.#headerEnabled() ? [styleTag("kit/theme/header.css")] : []),
          ];

      const body = [
        ...this.#libs.map((lib) =>
          this.#singleFile ? inlineScriptTag(lib.content) : scriptTag(`kit/${lib.id}.js`),
        ),
        `<script>window.allureReportKit = ${JSON.stringify(this.#manifest)}</script>`,
        this.#singleFile
          ? inlineScriptTag(this.#forkBundle)
          : scriptTag(this.#forkManifest["main.js"]),
      ];

      return output
        .replace("</head>", `    ${head.join("\n    ")}\n</head>`)
        .replace("</body>", `    ${body.join("\n    ")}\n</body>`);
    }

    /**
     * Read everything the document has to carry instead of fetching.
     *
     * Panel data moves into the manifest here too. Widgets exist so run-derived
     * series stay out of every page of the report — with one page that were the
     * only page, and there is nowhere to fetch from anyway.
     */
    async #loadInlineAssets(panelWidgets) {
      this.#forkBundle = await readFile(join(this.#forkDistDir(), this.#forkManifest["main.js"]));

      for (const lib of this.#libs) {
        lib.content = await readFile(lib.path);
      }

      for (const widget of panelWidgets) {
        widget.tile.panel.data = widget.data;
        delete widget.tile.panel.dataUrl;
      }

      if (!this.#headerEnabled()) {
        return;
      }

      // Built by `scripts/build-inline.mjs`: the DS header tree as one module,
      // its stylesheet with the `@import`s flattened.
      const kitDir = this.#kitDir();
      this.#inlineCss.push(await readFile(join(kitDir, "dist/theme/header.inline.css"), "utf8"));
      this.#manifest.inline = {
        headerModule: dataUrl(await readFile(join(kitDir, "dist/theme/header.bundle.js"))),
        headerTemplate: await readFile(
          join(kitDir, "src/theme/vendor/design-system/templates/header.html"),
          "utf8",
        ),
      };
    }

    /**
     * Give every chart tile a stable key in `widgets/charts.json`.
     *
     * Done in flight rather than by rewriting the file afterwards, for the same
     * reason `index.html` is: the plugin never reads the report back from disk.
     */
    /** Tiles of the list this plugin renders — never both. */
    #tiles() {
      return (this.#manifest?.tiles ?? []).filter((tile) => tile.list === tilesKey);
    }

    #transformCharts(json) {
      const tiles = this.#tiles();
      const mismatched = [];

      const sections = { ...json };
      for (const [name, section] of Object.entries(json)) {
        if (name === "byEnv") {
          sections.byEnv = {};
          for (const [envId, envSection] of Object.entries(section ?? {})) {
            const rekeyed = rekeyChartSection(envSection, tiles);
            sections.byEnv[envId] = rekeyed.section;
            mismatched.push(...rekeyed.mismatched);
          }
          continue;
        }
        const rekeyed = rekeyChartSection(section, tiles);
        sections[name] = rekeyed.section;
        mismatched.push(...rekeyed.mismatched);
      }

      if (mismatched.length > 0) {
        log(
          "warn",
          `chart widget does not line up with the config, those tiles stay with Allure: ${[
            ...new Set(mismatched),
          ].join("; ")}`,
        );
      }

      return sections;
    }

    /**
     * Proxy `reportFiles` so the plugin sees every file upstream writes.
     *
     * Applied from `start` on, not just in `done`: the upstream plugin builds its
     * data writer out of the context it gets in `start` and keeps it, so a proxy
     * installed later would never see `widgets/*`. `#upstreamAssets` is still
     * empty at that point, which is correct — the bundle is written in `done`.
     */
    #wrapContext(context) {
      const addFile = context.reportFiles.addFile.bind(context.reportFiles);

      return {
        ...context,
        reportFiles: {
          addFile: async (path, data) => {
            if (this.#upstreamAssets.has(path)) {
              return path; // upstream bundle asset — the fork replaces it
            }
            if (path === "index.html" && this.#forkManifest) {
              const html = this.#transformHtml(data.toString("utf8"));
              return addFile(path, Buffer.from(html, "utf8"));
            }
            if (path === CHARTS_WIDGET) {
              const charts = this.#transformCharts(JSON.parse(data.toString("utf8")));
              return addFile(path, Buffer.from(JSON.stringify(charts), "utf8"));
            }
            return addFile(path, data);
          },
        },
      };
    }

    /**
     * Resolve `panels.fromRun` against the store and ship each result as a widget.
     *
     * Panel data does not belong in `index.html`: run-derived series grow with the
     * suite, and the manifest is inlined into every page of the report. Writing
     * them as widgets puts them on the same footing as Allure's own chart data —
     * fetched once, cacheable, absent from the HTML.
     *
     * Runs before the upstream `done`, so the `dataUrl` it sets is already in the
     * manifest by the time the HTML is written. `singleFile` undoes that and puts
     * the data back on the tile — see `#loadInlineAssets`.
     */
    async #resolveRunPanels(store) {
      const panels = this.#tiles().filter((tile) => tile.panel?.source);
      if (panels.length === 0) {
        return [];
      }

      const testResults = await store.allTestResults();
      // Retry attempts are a separate read: counting them needs the results the
      // store hides by default, and including them everywhere would inflate
      // every other metric.
      const needsRetries = panels.some((tile) => RETRY_METRICS.has(tile.panel.source.metric));
      const withRetries = needsRetries ? await store.allTestResults({ includeRetries: true }) : [];
      const history = panels.some((tile) => tile.panel.source.from === "history")
        ? await store.allHistoryDataPoints()
        : [];

      return panels.map((tile) => {
        const panel = tile.panel;
        const source = panel.source;

        const computed =
          source.from === "history"
            ? seriesFromHistory(history, source)
            : {
                series: seriesFromRun(
                  RETRY_METRICS.has(source.metric) ? withRetries : testResults,
                  source,
                ),
              };

        const data = {
          series: computed.series,
          ...(computed.categories === undefined ? {} : { categories: computed.categories }),
          ...(panel.data?.total === undefined ? {} : { total: panel.data.total }),
          ...(panel.data?.unit === undefined ? {} : { unit: panel.data.unit }),
          ...(panel.data?.columns === undefined ? {} : { columns: panel.data.columns }),
        };
        if (
          data.total === undefined &&
          source.from !== "history" &&
          (panel.kind === "gauge" || panel.kind === "donut")
        ) {
          // A caption needs a denominator, and the run is the only honest one.
          data.total = testResults.length;
        }
        panel.dataUrl = `${PANEL_WIDGET_DIR}/${panel.id}.json`;
        return { path: panel.dataUrl, data, tile };
      });
    }

    async #copyTree(context, from, prefix) {
      for (const entry of await readdir(from, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile()) {
          continue;
        }
        const absolute = join(entry.parentPath ?? entry.path, entry.name);
        const target = `${prefix}/${relative(from, absolute).split(sep).join("/")}`;
        await context.reportFiles.addFile(target, await readFile(absolute));
      }
    }

    /**
     * The DS header is copied as a tree rather than bundled: its module resolves
     * `../templates/header.html` against its own URL, which only works if the
     * `js/` + `templates/` layout survives into the report.
     */
    async #writeHeaderAssets(context) {
      const themeDir = join(
        dirname(require.resolve("@qa-guru/allure-report-kit/package.json")),
        "src/theme",
      );
      await context.reportFiles.addFile(
        "kit/theme/header.css",
        await readFile(join(themeDir, "header.css")),
      );
      // One copy serves both consumers: the stylesheet's relative `@import`s and
      // the header module's own template lookup.
      await this.#copyTree(
        context,
        join(themeDir, "vendor/design-system"),
        "kit/theme/vendor/design-system",
      );
    }

    async #writeKitAssets(context) {
      const distDir = this.#forkDistDir();
      for (const fileName of await readdir(distDir)) {
        if (fileName === "manifest.json") {
          continue;
        }
        await context.reportFiles.addFile(fileName, await readFile(join(distDir, fileName)));
      }
      for (const lib of this.#libs) {
        await context.reportFiles.addFile(`kit/${lib.id}.js`, await readFile(lib.path));
      }
      if (this.#headerEnabled()) {
        await this.#writeHeaderAssets(context);
      }
    }

    /** Raw context while the kit is off, proxied while it is on. */
    #contextFor(context) {
      return kitDisabledReason(this.#manifest, this.options) ? context : this.#wrapContext(context);
    }

    start = async (context, store, realtime) =>
      this.#upstream.start?.(this.#contextFor(context), store, realtime);

    update = async (context, store) => this.#upstream.update?.(this.#contextFor(context), store);

    info = async (context, store) => this.#upstream.info?.(this.#contextFor(context), store);

    done = async (context, store) => {
      const disabled = kitDisabledReason(this.#manifest, this.options);
      if (disabled) {
        log("warn", `fallback to stock Allure: ${disabled}`);
        return this.#upstream.done(context, store);
      }

      this.#forkManifest = await readJson(join(this.#forkDistDir(), "manifest.json"));

      const { resolved, missing } = requiredLibs(this.#tiles(), resolveFrom);
      this.#libs = resolved;
      for (const item of missing) {
        log("warn", `renderer backend unavailable: ${item}`);
      }

      const panelWidgets = await this.#resolveRunPanels(store);

      // Upstream writes no separate assets in single-file mode, so there is no
      // manifest of them to drop — the inlined tag is matched by shape instead.
      this.#upstreamAssets = this.#singleFile
        ? new Set()
        : new Set(
            Object.values(
              await readJson(resolveFrom.resolve(`${upstreamPackage}/dist/multi/manifest.json`)),
            ),
          );

      if (this.#singleFile) {
        // Everything has to be in hand before upstream renders `index.html`:
        // that is the only file it will write.
        await this.#loadInlineAssets(panelWidgets);
      }

      await this.#upstream.done(this.#wrapContext(context), store);

      if (!this.#singleFile) {
        await this.#writeKitAssets(context);

        for (const widget of panelWidgets) {
          await context.reportFiles.addFile(
            widget.path,
            Buffer.from(JSON.stringify(widget.data), "utf8"),
          );
        }
      }

      log(
        "info",
        `kit bundle active${this.#singleFile ? " (single file)" : ""} — ${this.#tiles().length} tiles${
          panelWidgets.length > 0 ? ` (${panelWidgets.length} from the run)` : ""
        }, backends: ${resolved.map((lib) => lib.id).join(", ") || "none"}`,
      );
    };
  };
}
