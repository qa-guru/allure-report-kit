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

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
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

function requiredLibs(manifest, resolveFrom) {
  const ids = new Set((manifest?.tiles ?? []).map((tile) => tile.renderer?.id).filter(Boolean));
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
 * @param {NodeRequire} spec.resolveFrom   `createRequire(import.meta.url)` of the caller
 */
export function createKitPlugin({ id, UpstreamPlugin, forkPackage, upstreamPackage, resolveFrom }) {
  const log = (level, message) => console[level](`allure-report-kit [${id}] ${message}`);

  return class KitPlugin {
    #upstream;

    #manifest;

    #libs = [];

    #forkManifest;

    constructor(options = {}) {
      this.options = options;
      this.#manifest = options.kit;
      this.#upstream = new UpstreamPlugin(options);
    }

    #forkDistDir() {
      return join(dirname(resolveFrom.resolve(`${forkPackage}/package.json`)), "dist/multi");
    }

    #headerEnabled() {
      const header = this.#manifest?.theme?.header;
      return Boolean(header?.enabled) && header.source !== "none";
    }

    #transformHtml(html, upstreamAssets) {
      // Drop the tags upstream just emitted for its own bundle.
      let output = html;
      for (const asset of upstreamAssets) {
        output = output
          .replace(new RegExp(`\\s*<script[^>]*src="[^"]*${asset}"[^>]*></script>`, "g"), "")
          .replace(new RegExp(`\\s*<link[^>]*href="[^"]*${asset}"[^>]*/?>`, "g"), "");
      }

      const head = [
        styleTag(this.#forkManifest["main.css"]),
        ...(this.#headerEnabled() ? [styleTag("kit/theme/header.css")] : []),
      ].join("\n    ");

      const body = [
        ...this.#libs.map((lib) => scriptTag(`kit/${lib.id}.js`)),
        `<script>window.allureReportKit = ${JSON.stringify(this.#manifest)}</script>`,
        scriptTag(this.#forkManifest["main.js"]),
      ].join("\n    ");

      return output
        .replace("</head>", `    ${head}\n</head>`)
        .replace("</body>", `    ${body}\n</body>`);
    }

    #wrapContext(context, upstreamAssets) {
      const addFile = context.reportFiles.addFile.bind(context.reportFiles);

      return {
        ...context,
        reportFiles: {
          addFile: async (path, data) => {
            if (upstreamAssets.has(path)) {
              return path; // upstream bundle asset — the fork replaces it
            }
            if (path === "index.html") {
              const html = this.#transformHtml(data.toString("utf8"), upstreamAssets);
              return addFile(path, Buffer.from(html, "utf8"));
            }
            return addFile(path, data);
          },
        },
      };
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

    /** Kit off: no manifest, or a mode the fork does not support yet. */
    #disabledReason() {
      if (!this.#manifest) {
        return "no kit manifest in plugin options — did you wrap the config with withKit()?";
      }
      if (this.options.singleFile) {
        return "singleFile mode is not supported yet — see PLAN-0.1";
      }
      return undefined;
    }

    start = async (context, store, realtime) => this.#upstream.start?.(context, store, realtime);

    update = async (context, store) => this.#upstream.update?.(context, store);

    info = async (context, store) => this.#upstream.info?.(context, store);

    done = async (context, store) => {
      const disabled = this.#disabledReason();
      if (disabled) {
        log("warn", `fallback to stock Allure: ${disabled}`);
        return this.#upstream.done(context, store);
      }

      this.#forkManifest = await readJson(join(this.#forkDistDir(), "manifest.json"));

      const { resolved, missing } = requiredLibs(this.#manifest, resolveFrom);
      this.#libs = resolved;
      for (const item of missing) {
        log("warn", `renderer backend unavailable: ${item}`);
      }

      const upstreamAssets = new Set(
        Object.values(await readJson(resolveFrom.resolve(`${upstreamPackage}/dist/multi/manifest.json`))),
      );

      await this.#upstream.done(this.#wrapContext(context, upstreamAssets), store);
      await this.#writeKitAssets(context);

      log(
        "info",
        `kit bundle active — ${this.#manifest.tiles.length} tiles, backends: ${
          resolved.map((lib) => lib.id).join(", ") || "none"
        }`,
      );
    };
  };
}
