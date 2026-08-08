#!/usr/bin/env node
/**
 * Vendor the design-system primitives the kit renders with.
 *
 * The design-system in the zero-design-system monorepo stays the SSOT: this
 * script copies a pinned subset instead of hand-porting it, so widget-tile
 * geometry, indicator palette and the report header never drift.
 *
 * Usage:
 *   npm run sync:ds
 *   ZDS_DESIGN_SYSTEM=/path/to/design-system npm run sync:ds
 *   npm run sync:ds -- --check      # fail when the copy is stale
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR_ROOT = join(PACKAGE_ROOT, "src/theme/vendor/design-system");

const DEFAULT_SOURCES = [
  process.env.ZDS_DESIGN_SYSTEM,
  resolve(PACKAGE_ROOT, "../../design-system-home/design-system"),
  resolve(PACKAGE_ROOT, "../../../projects/design-system-home/design-system"),
].filter(Boolean);

/** Kept in the DS layout: header.js resolves `../templates/header.html`. */
const FILES = [
  "css/tokens.css",
  "css/widget-tile.css",
  "css/indicator.css",
  "css/header.css",
  "css/plaque-divider.css",
  "css/link.css",
  "css/icon-btn.css",
  "css/icon.css",
  "css/input.css",
  "css/lang-toggle.css",
  "js/header.js",
  "js/theme-icons.js",
  "js/dom-utils.js",
  "js/header-metrics-wrap.js",
  "templates/header.html",
];

const BANNER = "/* vendored from zero-design-system/projects/design-system-home/design-system — do not edit, run `npm run sync:ds` */\n";

/**
 * Transforms applied while vendoring.
 *
 * `indicator.css` pulls `tokens.css`, which also styles `body` and hardcodes a
 * dark-first palette. Inside an Allure report that repaints the host chrome and
 * fights the report's own theme, so the import is dropped here and the handful
 * of variables the primitive needs is supplied by `kit.css` — mapped onto the
 * report's tokens where they exist. Standalone pages load `theme/standalone.css`,
 * which brings `tokens.css` back.
 */
const dropTokensImport = (content) =>
  content.replace(
    /@import url\("tokens\.css"\);\n/,
    "/* sync-ds: tokens.css import dropped — see kit.css (host owns the chrome) */\n",
  );

const TRANSFORMS = {
  "css/indicator.css": dropTokensImport,
  "css/plaque-divider.css": dropTokensImport,
};

function block(content, selector) {
  const pattern = new RegExp(`^${selector}\\s*\\{\\n([\\s\\S]*?)\\n\\}`, "m");
  return pattern.exec(content)?.[1];
}

/**
 * Derive a header-scoped copy of `tokens.css`.
 *
 * The report header is the one place that legitimately needs the full
 * design-system palette, but `tokens.css` declares it on `:root` and also
 * restyles `body`. Loaded as is inside a report it repaints the host and
 * overrides the kit's chrome layer. Custom properties inherit, so moving the
 * declarations onto `#app-header` gives the header everything and the rest of
 * the report nothing.
 *
 * Derived rather than hand-copied: the values stay owned by the design-system.
 */
function scopeTokensToHeader(content) {
  const root = block(content, ":root");
  const light = block(content, "html\\.theme-light");

  if (!root || !light) {
    throw new Error("sync-ds: tokens.css layout changed — cannot derive the header scope");
  }

  return [
    "/* sync-ds: derived from tokens.css — declarations moved onto #app-header",
    " * so the report header gets the DS palette without repainting the host. */",
    "",
    `#app-header {\n${root}\n}`,
    "",
    `html.theme-light #app-header {\n${light}\n}`,
    "",
  ].join("\n");
}

/** Vendored files the kit derives instead of copying: target ← [source, transform]. */
const DERIVED = {
  "css/tokens.header.css": ["css/tokens.css", scopeTokensToHeader],
};

function findSource() {
  for (const candidate of DEFAULT_SOURCES) {
    if (candidate && existsSync(join(candidate, "css/widget-tile.css"))) {
      return candidate;
    }
  }
  return undefined;
}

function withBanner(file, content) {
  const transformed = TRANSFORMS[file]?.(content) ?? content;
  return file.endsWith(".css") || file.endsWith(".js") ? BANNER + transformed : transformed;
}

function main() {
  const check = process.argv.includes("--check");
  const source = findSource();

  if (!source) {
    const message = `sync-ds: design-system not found. Tried:\n  ${DEFAULT_SOURCES.join("\n  ")}`;
    if (check) {
      console.error(message);
      process.exit(1);
    }
    console.warn(`${message}\nsync-ds: skipped — vendored copy left untouched.`);
    return;
  }

  const stale = [];
  let written = 0;

  const emit = (file, next) => {
    const to = join(VENDOR_ROOT, file);
    const current = existsSync(to) ? readFileSync(to, "utf8") : undefined;
    if (current === next) {
      return;
    }
    if (check) {
      stale.push(file);
      return;
    }
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(to, next, "utf8");
    written += 1;
  };

  for (const file of FILES) {
    const from = join(source, file);
    if (!existsSync(from)) {
      console.warn(`sync-ds: missing in source, skipped — ${file}`);
      continue;
    }
    emit(file, withBanner(file, readFileSync(from, "utf8")));
  }

  for (const [target, [sourceFile, transform]] of Object.entries(DERIVED)) {
    const from = join(source, sourceFile);
    if (!existsSync(from)) {
      console.warn(`sync-ds: missing in source, skipped — ${target} (from ${sourceFile})`);
      continue;
    }
    emit(target, BANNER + transform(readFileSync(from, "utf8")));
  }

  if (check) {
    if (stale.length > 0) {
      console.error(`sync-ds: stale vendored files (${stale.length}):\n  ${stale.join("\n  ")}`);
      process.exit(1);
    }
    console.log(`sync-ds: OK — vendored copy matches ${source}`);
    return;
  }

  console.log(`sync-ds: ${written} file(s) updated from ${source}`);
}

main();
