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

function findSource() {
  for (const candidate of DEFAULT_SOURCES) {
    if (candidate && existsSync(join(candidate, "css/widget-tile.css"))) {
      return candidate;
    }
  }
  return undefined;
}

function withBanner(file, content) {
  return file.endsWith(".css") || file.endsWith(".js") ? BANNER + content : content;
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

  for (const file of FILES) {
    const from = join(source, file);
    const to = join(VENDOR_ROOT, file);
    if (!existsSync(from)) {
      console.warn(`sync-ds: missing in source, skipped — ${file}`);
      continue;
    }
    const next = withBanner(file, readFileSync(from, "utf8"));
    const current = existsSync(to) ? readFileSync(to, "utf8") : undefined;
    if (current === next) {
      continue;
    }
    if (check) {
      stale.push(file);
      continue;
    }
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(to, next, "utf8");
    written += 1;
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
