import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative, sep } from "node:path";

import { requiredLibs } from "./chart-libs.js";
import {
  CHARTS_WIDGET,
  dataUrl,
  INLINE_SCRIPT_PATTERN,
  inlineScriptTag,
  inlineStyleTag,
  PANEL_WIDGET_DIR,
  readJson,
  scriptTag,
  styleTag,
} from "./constants.js";
import { kitDisabledReason } from "./kit-disabled.js";
import { evaluateQualityGate, RETRY_METRICS, seriesFromHistory, seriesFromRun } from "./panels.js";
import { rekeyChartSection } from "./rekey-charts.js";

const require = createRequire(import.meta.url);

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

    /** Fork bundle and header CSS were copied into the report output. */
    #assetsWritten = false;

    /** Set on the first `update` — `allure generate` never calls it. */
    #watchMode = false;

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
      const needsRetries = panels.some(
        (tile) =>
          tile.panel.source.from === "run" && RETRY_METRICS.has(tile.panel.source.metric),
      );
      const withRetries = needsRetries ? await store.allTestResults({ includeRetries: true }) : [];
      const history = panels.some((tile) => tile.panel.source.from === "history")
        ? await store.allHistoryDataPoints()
        : [];

      const gateConfig = {
        rules: this.#manifest?.qualityGate?.rules ?? [],
        knownIssuesPath: this.#manifest?.qualityGate?.knownIssuesPath,
      };

      return panels.map((tile) => {
        const panel = tile.panel;
        const source = panel.source;

        if (source.from === "qualityGate") {
          const verdict = evaluateQualityGate(testResults, gateConfig);
          const data = {
            kind: "allure",
            testId: "quality-gate",
            passed: verdict.passed,
            rules: verdict.rules,
            ...(panel.title ? { title: panel.title, barTitle: panel.title } : {}),
            config: {
              rules: gateConfig.rules ?? [],
              ...(gateConfig.knownIssuesPath
                ? { knownIssuesPath: gateConfig.knownIssuesPath }
                : {}),
              ...(this.#manifest?.qualityGate?.source
                ? { source: this.#manifest.qualityGate.source }
                : {}),
            },
            ...(panel.labels ? { labels: panel.labels } : {}),
            ...(panel.lang ? { lang: panel.lang } : {}),
            ...(this.options.reportLanguage ? { lang: panel.lang ?? this.options.reportLanguage } : {}),
          };
          panel.dataUrl = `${PANEL_WIDGET_DIR}/${panel.id}.json`;
          return { path: panel.dataUrl, data, tile };
        }

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

    /** Why the kit stands down for this lifecycle, or `undefined` when it is on. */
    #kitOffReason() {
      const disabled = kitDisabledReason(this.#manifest, this.options);
      if (disabled) {
        return disabled;
      }
      if (this.#singleFile && this.#watchMode) {
        return "singleFile with allure watch is unsupported";
      }
      return undefined;
    }

    #kitActive() {
      return this.#kitOffReason() === undefined;
    }

    /** Raw context while the kit is off, proxied while it is on. */
    #contextFor(context) {
      return this.#kitActive() ? this.#wrapContext(context) : context;
    }

    /**
     * Fork manifest, chart backends, upstream asset drop-list — once per report.
     *
     * In `allure watch` this must run on the first `update`, not only in `done`:
     * without `#forkManifest` the HTML guard stays false and the report is stock.
     */
    async #ensureKitReady() {
      if (this.#forkManifest) {
        return;
      }

      this.#forkManifest = await readJson(join(this.#forkDistDir(), "manifest.json"));

      const { resolved, missing } = requiredLibs(this.#tiles(), resolveFrom);
      this.#libs = resolved;
      for (const item of missing) {
        log("warn", `renderer backend unavailable: ${item}`);
      }

      // Upstream writes no separate assets in single-file mode, so there is no
      // manifest of them to drop — the inlined tag is matched by shape instead.
      this.#upstreamAssets = this.#singleFile
        ? new Set()
        : new Set(
            Object.values(
              await readJson(resolveFrom.resolve(`${upstreamPackage}/dist/multi/manifest.json`)),
            ),
          );
    }

    async #writePanelWidgets(context, panelWidgets) {
      for (const widget of panelWidgets) {
        await context.reportFiles.addFile(
          widget.path,
          Buffer.from(JSON.stringify(widget.data), "utf8"),
        );
      }
    }

    /**
     * Kit assets and run-panel widgets after upstream wrote the report shell.
     *
     * Assets are written once (`#assetsWritten`); panel data is refreshed every
     * `update` because the store keeps changing under `allure watch`.
     */
    async #shipKitOutputs(context, panelWidgets) {
      if (this.#singleFile) {
        return;
      }
      if (!this.#assetsWritten) {
        await this.#writeKitAssets(context);
        this.#assetsWritten = true;
      }
      await this.#writePanelWidgets(context, panelWidgets);
    }

    start = async (context, store, realtimeSubscriber) =>
      this.#upstream.start?.(this.#contextFor(context), store, realtimeSubscriber);

    update = async (context, store) => {
      this.#watchMode = true;
      if (this.#singleFile) {
        log("warn", "singleFile with allure watch is unsupported — fallback to stock Allure");
      }
      if (!this.#kitActive()) {
        return this.#upstream.update?.(context, store);
      }

      await this.#ensureKitReady();
      await this.#upstream.update?.(this.#wrapContext(context), store);

      const panelWidgets = await this.#resolveRunPanels(store);
      await this.#shipKitOutputs(context, panelWidgets);
    };

    info = async (context, store) => this.#upstream.info?.(this.#contextFor(context), store);

    done = async (context, store) => {
      const off = this.#kitOffReason();
      if (off) {
        log("warn", `fallback to stock Allure: ${off}`);
        return this.#upstream.done(context, store);
      }

      await this.#ensureKitReady();

      const { resolved } = requiredLibs(this.#tiles(), resolveFrom);
      const panelWidgets = await this.#resolveRunPanels(store);

      if (this.#singleFile) {
        // Everything has to be in hand before upstream renders `index.html`:
        // that is the only file it will write.
        await this.#loadInlineAssets(panelWidgets);
      }

      await this.#upstream.done(this.#wrapContext(context), store);
      await this.#shipKitOutputs(context, panelWidgets);

      log(
        "info",
        `kit bundle active${this.#singleFile ? " (single file)" : ""} — ${this.#tiles().length} tiles${
          panelWidgets.length > 0 ? ` (${panelWidgets.length} from the run)` : ""
        }, backends: ${resolved.map((lib) => lib.id).join(", ") || "none"}`,
      );
    };
  };
}
